<?php
namespace Modules\ModuleCTIClient\Lib;

use MikoPBX\Common\Models\PbxSettings;

/** Read-only platform-selected HTTPS identity. Results contain secrets: PHP internal use only. */
final class PbxCertificateSource
{
    /**
     * @param array|null $readers Internal test/bridge callbacks only, never request data or paths.
     * @return array SourceResult {state,sourceId,certPem?,privateKeyPem?,chainPem?,errorCode?}
     */
    public static function read($readers = null)
    {
        $sourceId = 'pbx_https';
        try {
            $readers = $readers === null ? array() : $readers;
            $platform = isset($readers['platform']) ? call_user_func($readers['platform']) : self::platform();
            if (!is_array($platform) || !isset($platform['mode'], $platform['certPath'], $platform['keyPath'])
                || !in_array($platform['mode'], array('old', 'modern'), true)) {
                return self::error($sourceId, 'unsupported_core');
            }
            $sourceId = $platform['mode'] === 'modern' ? 'pbx_nginx' : 'pbx_nginx_legacy';
            $settings = $readers['settings'] ?? array(PbxSettings::class, 'getValueByKey');
            $cert = call_user_func($settings, 'WEBHTTPSPublicKey');
            $key = call_user_func($settings, 'WEBHTTPSPrivateKey');
            if (!is_string($cert) || !is_string($key)) {
                return self::error($sourceId, 'source_unreadable');
            }
            $configured = $cert !== '' || $key !== '';
            // Settings that are half-set or unusable do not prove which pair the platform actually serves: manual guidance.
            if ($configured && ($cert === '' || $key === '')) {
                return self::error($sourceId, 'source_selection_unknown');
            }
            // Missing tooling is an operational fault; it must not be reported as a bad certificate/key pair.
            if ($configured && !self::pairToolsAvailable()) { return self::error($sourceId, 'openssl_unavailable'); }
            $configuredPair = $configured ? self::pair($cert, $key) : null;
            if ($configured && $configuredPair === null) {
                return self::error($sourceId, 'source_selection_unknown');
            }

            $fileReader = $readers['file'] ?? array(self::class, 'readFile');
            $runtimeCert = call_user_func($fileReader, $platform['certPath']);
            $runtimeKey = call_user_func($fileReader, $platform['keyPath']);
            foreach (array($runtimeCert, $runtimeKey) as $file) {
                if (!is_array($file) || !isset($file['state'])
                    || !in_array($file['state'], array('absent', 'present'), true)) {
                    return self::error($sourceId, 'source_unreadable');
                }
            }
            if ($runtimeCert['state'] === 'absent' && $runtimeKey['state'] === 'absent') {
                return $configured
                    ? self::present('pbx_https_configured_pending', $configuredPair)
                    : array('state' => 'absent', 'sourceId' => $sourceId);
            }
            // Old Nginx can disable HTTPS while leaving files behind. With no configured pair, ANY runtime file present is an
            // unknown selection: decided before any content is parsed, so a leftover can never be classed as "unusable".
            if (!$configured && $platform['mode'] === 'old') {
                return self::error($sourceId, 'source_selection_unknown');
            }
            if ($runtimeCert['state'] !== 'present' || $runtimeKey['state'] !== 'present') {
                return self::error($sourceId, 'source_incomplete');
            }
            if (!self::pairToolsAvailable()) { return self::error($sourceId, 'openssl_unavailable'); }
            $runtimePair = self::pair($runtimeCert['pem'] ?? null, $runtimeKey['pem'] ?? null);
            if ($runtimePair === null) {
                return self::error($sourceId, 'source_invalid');
            }
            if ($configured && $configuredPair['identity'] !== $runtimePair['identity']) {
                return self::error($sourceId, 'source_mismatch');
            }
            return self::present($sourceId, $runtimePair);
        } catch (\Throwable $e) {
            // Do not leak paths, platform exceptions, PEM or private-key data.
            return self::error($sourceId, 'source_unreadable');
        }
    }

    /** Capability bridge: no mutating core prepare methods and no Phalcon-based SSL guess. */
    private static function platform()
    {
        try {
            if (!is_callable(array(PbxSettings::class, 'getValueByKey'))) { return null; }
            $version = PbxSettings::getValueByKey('PBXVersion');
            if (!is_string($version) || !preg_match('/^\d{4}\.\d+\.\d+(?:[-.][a-zA-Z0-9.-]+)?$/D', $version)
                || version_compare($version, '2023.2.206', '<')) { return null; }
            $service = 'MikoPBX\\Core\\System\\SslCertificateService';
            if (class_exists($service)) {
                // Public since core commit 0873fd56. Earlier private API is unsupported, not absent.
                $certConstant = $service . '::NGINX_CERT_FILE';
                $keyConstant = $service . '::NGINX_KEY_FILE';
                if (!defined($certConstant) || !defined($keyConstant)
                    || !defined(PbxSettings::class . '::WEB_HTTPS_PUBLIC_KEY')
                    || !defined(PbxSettings::class . '::WEB_HTTPS_PRIVATE_KEY')
                    || constant(PbxSettings::class . '::WEB_HTTPS_PUBLIC_KEY') !== 'WEBHTTPSPublicKey'
                    || constant(PbxSettings::class . '::WEB_HTTPS_PRIVATE_KEY') !== 'WEBHTTPSPrivateKey') { return null; }
                $certPath = constant($certConstant);
                $keyPath = constant($keyConstant);
                if (!is_string($certPath) || !is_string($keyPath)
                    || strpos($certPath, '/') !== 0 || strpos($keyPath, '/') !== 0 || $certPath === $keyPath) { return null; }
                return array('mode' => 'modern', 'certPath' => $certPath, 'keyPath' => $keyPath);
            }
            if (!is_callable(array(PbxSettings::class, 'getDefaultArrayValues'))) { return null; }
            // A read-only literal defaults API on min-tag; never serialize these values.
            $defaults = PbxSettings::getDefaultArrayValues();
            if (!is_array($defaults) || !array_key_exists('WEBHTTPSPublicKey', $defaults)
                || !array_key_exists('WEBHTTPSPrivateKey', $defaults)) { return null; }
            // Nginx binding verified at min-tag and parent 4c0dec99 of service introduction.
            return array('mode' => 'old', 'certPath' => '/etc/ssl/certs/nginx.crt',
                'keyPath' => '/etc/ssl/private/nginx.key');
        } catch (\Throwable $e) {
            // Includes incompatible new-core syntax and inaccessible/private constants on old PHP.
            return null;
        }
    }

    /**
     * Definitive absence requires readable ancestors. file_exists(false) alone also means EACCES.
     * @return array {state,pem?}; never writes files or repairs permissions.
     */
    private static function readFile($path)
    {
        $path = str_replace('\\', '/', $path);
        $directory = strpos($path, '/') === 0 ? '/' : substr($path, 0, 3);
        $relative = substr($path, strlen($directory));
        $parts = explode('/', $relative);
        foreach ($parts as $index => $part) {
            if ($part === '' || $part === '.' || $part === '..') { return array('state' => 'error'); }
            if (DIRECTORY_SEPARATOR === '/' && !is_executable($directory)) { return array('state' => 'error'); }
            $entries = @scandir($directory);
            if ($entries === false) { return array('state' => 'error'); }
            if (!in_array($part, $entries, true)) { return array('state' => 'absent'); }
            $directory = rtrim($directory, '/') . '/' . $part;
            if ($index < count($parts) - 1 && !is_dir($directory)) { return array('state' => 'error'); }
        }
        if (!is_file($path)) { return array('state' => 'error'); }
        $pem = @file_get_contents($path);
        return $pem === false ? array('state' => 'error') : array('state' => 'present', 'pem' => $pem);
    }

    private static function pairToolsAvailable()
    {
        foreach (array('openssl_x509_read', 'openssl_x509_export', 'openssl_x509_check_private_key', 'openssl_x509_fingerprint') as $function) {
            if (!function_exists($function)) { return false; }
        }
        return true;
    }

    /** Структура leaf и соответствие ключа; hostname, сроки и цепочку проверяет apply. */
    private static function pair($cert, $key)
    {
        if (!is_string($cert) || !is_string($key) || $cert === '' || $key === '') { return null; }
        $selected = TlsCertificateInspector::exportSelectedPublic($cert);
        if ($selected === null || !@openssl_x509_check_private_key($selected['leafPem'], $key)) { return null; }
        $identity = @openssl_x509_fingerprint($selected['leafPem'], 'sha256');
        if (!is_string($identity) || $identity === '') { return null; }
        // Pair/key matching + equal leaf DER implies equal public-key identity, regardless of PEM encoding.
        return array('certPem' => $selected['certPem'], 'privateKeyPem' => $key, 'identity' => $identity);
    }

    private static function present($sourceId, $pair)
    {
        return array('state' => 'present', 'sourceId' => $sourceId, 'certPem' => $pair['certPem'],
            'privateKeyPem' => $pair['privateKeyPem'], 'chainPem' => '');
    }

    private static function error($sourceId, $code)
    {
        return array('state' => 'error', 'sourceId' => $sourceId, 'errorCode' => $code);
    }
}
