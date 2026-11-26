<?php
namespace Modules\ModuleCTIClient\Lib;

require_once __DIR__ . '/TlsCertificateInspector.php';

/** Отдельная TLS-пара gnatsd; ошибка никогда не разрешает plaintext в strict. */
final class TlsCertificate
{
    const MAX_CERT_BYTES = 262144;
    const MAX_KEY_BYTES = 65536;

    /** @var callable|null Test seam (CLI + CTI_TLS_TESTING only): replaces rename() to inject a publication failure. */
    public static $renameHook = null;

    /**
     * Пара для адреса: существующая валидная возвращается как есть. Установленная пара НИКОГДА не перезаписывается:
     * непригодная остаётся нетронутой (false), её меняет администратор вручную; новая создаётся только в свободный слот.
     */
    public static function ensure($certPath, $keyPath, $hostname, $certMode = 0640)
    {
        $hostname = TlsCertificateInspector::normalizeEndpoint($hostname);
        if ($hostname === null || $certPath === '' || $keyPath === '' || $certPath === $keyPath
            || !function_exists('openssl_pkey_new')) { return false; }
        return self::locked($certPath, $keyPath, function () use ($certPath, $keyPath, $hostname, $certMode) {
            return self::ensureLocked($certPath, $keyPath, $hostname, $certMode);
        });
    }

    /** Записать уже проверенную пару (копия HTTPS-пары АТС) тем же lock и порядком публикации, что и сгенерированную. */
    public static function install($certPath, $keyPath, $certPem, $keyPem, $certMode = 0640, $hostname = null)
    {
        if (!is_string($certPem) || !is_string($keyPem) || $certPem === '' || $keyPem === '' || $certPath === ''
            || $keyPath === '' || $certPath === $keyPath) { return false; }
        if ($hostname !== null) {
            $hostname = TlsCertificateInspector::normalizeEndpoint($hostname);
            if ($hostname === null) { return false; }
        }
        return self::locked($certPath, $keyPath, function () use ($certPath, $keyPath, $certPem, $keyPem, $certMode, $hostname) {
            return self::publish($certPath, $keyPath, $certPem, $keyPem, $certMode, $hostname);
        });
    }

    private static function locked($certPath, $keyPath, $callback)
    {
        // Один стабильный inode на пару; удаление lock создало бы независимые блокировки.
        $mask = umask(0077);
        try { $lock = @fopen($keyPath . '.lock', 'c'); } finally { umask($mask); }
        if ($lock === false) { return false; }
        try {
            if (!@chmod($keyPath . '.lock', 0600) || !flock($lock, LOCK_EX)) { return false; }
            try {
                // Конкурирующий создатель мог уже опубликовать пару, пока мы ждали.
                clearstatcache(true, $certPath);
                clearstatcache(true, $keyPath);
                return call_user_func($callback);
            } finally {
                flock($lock, LOCK_UN);
            }
        } finally {
            fclose($lock);
        }
    }

    private static function ensureLocked($certPath, $keyPath, $hostname, $certMode)
    {
        if (self::occupied($certPath) || self::occupied($keyPath)) {
            return self::validPair($certPath, $keyPath, $hostname);
        }
        // Только проверенный ASCII FQDN или канонический IP попадает в отдельный config, никогда в global openssl.cnf.
        $sanType = TlsCertificateInspector::endpointIpBinary($hostname) === null ? 'DNS:' : 'IP:';
        $random = openssl_random_pseudo_bytes(16);
        if ($random === false) { return false; }
        $configDir = dirname($keyPath) . '/.cti-config-' . bin2hex($random);
        $mask = umask(0077);
        try { $created = @mkdir($configDir, 0700); } finally { umask($mask); }
        if (!$created) { return false; }
        try {
            $config = "[req]\ndistinguished_name=dn\n[dn]\n[cti_server]\n"
                . "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n"
                . "extendedKeyUsage=serverAuth\nsubjectAltName=" . $sanType . $hostname . "\n";
            $configPath = $configDir . '/openssl.cnf';
            if (!@chmod($configDir, 0700) || @file_put_contents($configPath, $config) !== strlen($config)) {
                return false;
            }
            $options = array('config' => $configPath, 'digest_alg' => 'sha256', 'x509_extensions' => 'cti_server');
            $key = openssl_pkey_new(array('config' => $configPath, 'private_key_bits' => 2048,
                'private_key_type' => OPENSSL_KEYTYPE_RSA));
            if ($key === false) { return false; }
            $csr = openssl_csr_new(array('commonName' => $hostname), $key, $options);
            if ($csr === false) { return false; }
            $cert = openssl_csr_sign($csr, null, $key, 3650, $options);
            if ($cert === false || !openssl_x509_export($cert, $certOut)
                || !openssl_pkey_export($key, $keyOut, null, $options)) { return false; }
        } finally {
            @unlink($configDir . '/openssl.cnf'); @rmdir($configDir);
        }
        return self::publish($certPath, $keyPath, $certOut, $keyOut, $certMode, $hostname);
    }

    private static function occupied($path)
    {
        clearstatcache(true, $path);
        return file_exists($path) || is_link($path);
    }

    private static function move($from, $to)
    {
        return self::$renameHook !== null && defined('CTI_TLS_TESTING') && CTI_TLS_TESTING && PHP_SAPI === 'cli'
            ? (bool) call_user_func(self::$renameHook, $from, $to) : @rename($from, $to);
    }

    /**
     * Только в свободный слот (под lock): занятый путь не трогаем. Оба временных файла готовы до первого rename; если
     * второй rename не удался, опубликованный ключ убирается, так что неполная или смешанная пара не остаётся.
     */
    private static function publish($certPath, $keyPath, $certPem, $keyPem, $certMode, $hostname = null)
    {
        if (self::occupied($certPath) || self::occupied($keyPath)) { return false; }
        // Exact downstream limits (the readers cap the certificate at 256 KiB and the key at 64 KiB) and a certificate file
        // made of certificate blocks only: checked before anything is written.
        if (strlen($certPem) > self::MAX_CERT_BYTES || strlen($keyPem) > self::MAX_KEY_BYTES
            || preg_match('/\A(?:-----BEGIN CERTIFICATE-----[A-Za-z0-9+\/=\r\n ]+?-----END CERTIFICATE-----\r?\n?)+\z/', $certPem) !== 1) { return false; }
        if ($hostname !== null && !TlsCertificateInspector::inspect($certPem, $keyPem, $hostname)['ok']) { return false; }
        $keyTemp = self::writeTemporary($keyPath, $keyPem, 0600);
        if ($keyTemp === false) { return false; }
        $certTemp = self::writeTemporary($certPath, $certPem, $certMode);
        if ($certTemp === false) { @unlink($keyTemp); return false; }
        try {
            if (!self::move($keyTemp, $keyPath)) { return false; }
            if (!self::move($certTemp, $certPath)) { @unlink($keyPath); return false; }
            // Proof under the lock that what is now in the slot is exactly the prepared, eligible bundle.
            if ($hostname !== null && !self::validPair($certPath, $keyPath, $hostname, $certPem, $keyPem)) {
                @unlink($certPath); @unlink($keyPath);
                return false;
            }
            return true;
        } finally {
            if (is_file($keyTemp)) { @unlink($keyTemp); }
            if (is_file($certTemp)) { @unlink($certTemp); }
        }
    }

    /** Read-only judgement: never chmods or repairs an existing (possibly working) pair. */
    private static function validPair($certPath, $keyPath, $hostname, $exactCert = null, $exactKey = null)
    {
        if (!is_readable($certPath) || !is_readable($keyPath)) { return false; }
        $cert = @file_get_contents($certPath, false, null, 0, self::MAX_CERT_BYTES + 1);
        $key = @file_get_contents($keyPath, false, null, 0, self::MAX_KEY_BYTES + 1);
        if (!is_string($cert) || !is_string($key) || strlen($cert) > self::MAX_CERT_BYTES || strlen($key) > self::MAX_KEY_BYTES) { return false; }
        if (($exactCert !== null && $cert !== $exactCert) || ($exactKey !== null && $key !== $exactKey)) { return false; }
        return TlsCertificateInspector::inspect($cert, $key, $hostname)['ok'];
    }

    private static function writeTemporary($path, $content, $mode)
    {
        if (!is_dir(dirname($path))) { return false; }
        // Закрываем права до первой записи секретного содержимого.
        $mask = umask(0077);
        try { $temp = @tempnam(dirname($path), '.cti-tls-'); } finally { umask($mask); }
        if ($temp === false) { return false; }
        if (!@chmod($temp, $mode) || @file_put_contents($temp, $content) !== strlen($content)) {
            @unlink($temp);
            return false;
        }
        return $temp;
    }

    /**
     * Unset-address default: read-only check of the fixed pair earlier module versions installed (web-owned layout).
     * Never creates, locks, chmods, chowns, copies or repairs anything. Regular single-link files (cert at most 0640,
     * key at most 0600), real directories not writable by group/other from the module root down to the pair, and a
     * valid unexpired pair that matches its key. The name is checked (typed SAN) only when an address is configured.
     * Failure codes: unsafe_state (layout/mode/link), source_unreadable (cannot be read), otherwise the inspector's code.
     */
    public static function validateExistingPair($certPath, $keyPath, $moduleDir, $hostname = '')
    {
        $fail = function ($code) { return array('ok' => false, 'errorCode' => $code); };
        if (!is_string($certPath) || !is_string($keyPath) || !is_string($moduleDir) || $certPath === $keyPath) { return $fail('unsafe_state'); }
        $posix = DIRECTORY_SEPARATOR === '/';
        if ($posix) {
            $dir = dirname($certPath);
            if (dirname($keyPath) !== $dir || realpath($dir) !== $dir || realpath($moduleDir) !== $moduleDir
                || strpos($dir . '/', rtrim($moduleDir, '/') . '/') !== 0) { return $fail('unsafe_state'); }
            for (;;) {
                clearstatcache(true, $dir); $d = @lstat($dir);
                if (!$d || ($d['mode'] & 0170000) !== 0040000 || is_link($dir) || ($d['mode'] & 0022) !== 0) { return $fail('unsafe_state'); }
                if ($dir === $moduleDir) { break; }
                $dir = dirname($dir);
            }
            foreach (array(array($certPath, 0137), array($keyPath, 0177)) as $file) {
                clearstatcache(true, $file[0]); $s = @lstat($file[0]);
                if (!$s || ($s['mode'] & 0170000) !== 0100000 || $s['nlink'] !== 1 || is_link($file[0])
                    || ($s['mode'] & $file[1]) !== 0) { return $fail('unsafe_state'); }
            }
        } elseif (is_link($certPath) || is_link($keyPath)) { return $fail('unsafe_state'); }
        if (!is_file($certPath) || !is_file($keyPath)) { return $fail('unsafe_state'); }
        $cert = @file_get_contents($certPath, false, null, 0, 262145); $key = @file_get_contents($keyPath, false, null, 0, 65537);
        if (!is_string($cert) || !is_string($key) || strlen($cert) > 262144 || strlen($key) > 65536) { return $fail('source_unreadable'); }
        $inspection = $hostname === '' ? TlsCertificateInspector::inspectExisting($cert, $key)
            : TlsCertificateInspector::inspect($cert, $key, $hostname);
        if (!$inspection['ok']) { return $fail($inspection['errorCode']); }
        return array('ok' => true, 'errorCode' => null, 'certPath' => $certPath, 'keyPath' => $keyPath);
    }

    public static function binarySupportsTls($binaryPath)
    {
        return BinaryCapabilities::containsAll($binaryPath, array('tls_port', 'https_port'));
    }
}
