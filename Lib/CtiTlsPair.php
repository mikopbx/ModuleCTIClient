<?php
namespace Modules\ModuleCTIClient\Lib;

/**
 * One checked cert/key pair for API/NATS/proxy, chosen before any config write or stop.
 * Order: the module's own pair under the protected config dir, the previous fixed pair in the module tree (read-only:
 * never chmod/chown/copied), an eligible PBX HTTPS pair copied into the protected dir, a generated typed-SAN leaf.
 * An installed pair is never replaced or overwritten; an unreadable/indeterminate pair or source stops with its own code.
 */
final class CtiTlsPair
{
    /**
     * Determinate "this source cannot be used": the only cases that may fall back to a generated leaf. source_invalid is
     * reserved for a readable runtime pair that was itself proved unusable; settings-level doubts and unreadable or
     * unknown selection are INDETERMINATE and stay manual guidance.
     */
    const INELIGIBLE = array('hostname_mismatch', 'expired', 'not_yet_valid', 'key_mismatch', 'invalid_eku',
        'invalid_key_usage', 'invalid_certificate', 'invalid_chain', 'source_invalid');
    const INDETERMINATE = array('source_unreadable', 'source_selection_unknown', 'source_mismatch', 'unsupported_core',
        'openssl_unavailable', 'chain_verification_unavailable', 'unsafe_state');

    public static function paths($moduleDir, $confDir)
    {
        return array('ownDir' => $confDir . '/tls', 'ownCert' => $confDir . '/tls/cti.crt', 'ownKey' => $confDir . '/tls/cti.key',
            'previousCert' => $moduleDir . '/etc/ssl/gnatsd.crt', 'previousKey' => $moduleDir . '/etc/ssl/gnatsd.key');
    }

    private static function fail($code) { return array('ok' => false, 'errorCode' => $code); }

    private static function found($source, $cert, $key) { return array('ok' => true, 'errorCode' => null, 'source' => $source, 'certPath' => $cert, 'keyPath' => $key); }

    private static function present($path)
    {
        clearstatcache(true, $path);
        return file_exists($path) || is_link($path);
    }

    /** @return array {state: absent|ok|unsuitable|indeterminate, errorCode?} for the module's own pair. */
    private static function inspectOwn($paths, $address)
    {
        $hasCert = self::present($paths['ownCert']); $hasKey = self::present($paths['ownKey']);
        if (!$hasCert && !$hasKey) { return array('state' => 'absent'); }
        if (!$hasCert || !$hasKey) { return array('state' => 'unsuitable'); }
        foreach (array($paths['ownCert'], $paths['ownKey']) as $path) {
            $s = @lstat($path);
            if (!$s || ($s['mode'] & 0170000) !== 0100000 || is_link($path)) { return array('state' => 'indeterminate', 'errorCode' => 'unsafe_state'); }
        }
        $cert = @file_get_contents($paths['ownCert'], false, null, 0, 262145);
        $key = @file_get_contents($paths['ownKey'], false, null, 0, 65537);
        if (!is_string($cert) || !is_string($key) || strlen($cert) > 262144 || strlen($key) > 65536) {
            return array('state' => 'indeterminate', 'errorCode' => 'source_unreadable');
        }
        $r = $address === '' ? TlsCertificateInspector::inspectExisting($cert, $key) : TlsCertificateInspector::inspect($cert, $key, $address);
        if ($r['ok']) { return array('state' => 'ok'); }
        return in_array($r['errorCode'], self::INDETERMINATE, true)
            ? array('state' => 'indeterminate', 'errorCode' => $r['errorCode']) : array('state' => 'unsuitable');
    }

    /**
     * Read-only: the first usable already-present pair. ok=false with errorCode null means none is present/usable
     * (proceed); a code means a pair exists that cannot be judged (stop, never replace).
     */
    public static function existing($address, $paths, $moduleDir)
    {
        $own = self::inspectOwn($paths, $address);
        if ($own['state'] === 'ok') { return self::found('cti', $paths['ownCert'], $paths['ownKey']); }
        if ($own['state'] === 'indeterminate') { return self::fail($own['errorCode']); }
        if (self::present($paths['previousCert']) || self::present($paths['previousKey'])) {
            $r = TlsCertificate::validateExistingPair($paths['previousCert'], $paths['previousKey'], $moduleDir, $address);
            if ($r['ok']) { return self::found('previous', $paths['previousCert'], $paths['previousKey']); }
            if ($r['errorCode'] !== 'unsafe_state' && in_array($r['errorCode'], self::INDETERMINATE, true)) { return self::fail($r['errorCode']); }
        }
        $none = self::fail(null);
        $none['ownInstalled'] = $own['state'] === 'unsuitable';
        return $none;
    }

    /**
     * What the PBX HTTPS source offers for $address: array(bundle, key) to copy, true to generate a leaf, or a stop result
     * (array with 'ok' => false and its own code). Pure: used by apply and, read-only, by the status.
     */
    public static function plan($source, $address)
    {
        if (!is_array($source) || !isset($source['state'])) { return self::fail('source_unreadable'); }
        if ($source['state'] === 'absent') { return true; }
        if ($source['state'] === 'present') {
            $r = TlsCertificateInspector::inspect(isset($source['certPem']) ? $source['certPem'] : '',
                isset($source['privateKeyPem']) ? $source['privateKeyPem'] : '', $address, isset($source['chainPem']) ? $source['chainPem'] : '');
            if ($r['ok']) {
                $leaf = TlsCertificateInspector::exportPublic($source['certPem']);
                if (preg_match('/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----\n/', $leaf, $m) !== 1) { return true; }
                $bundle = $m[0] . implode('', $r['publicChain']);
                // Must fit the exact limits every downstream reader applies; otherwise it cannot be imported (generate instead).
                if (strlen($bundle) > TlsCertificate::MAX_CERT_BYTES || strlen($source['privateKeyPem']) > TlsCertificate::MAX_KEY_BYTES) { return true; }
                return array($bundle, $source['privateKeyPem']);
            }
            $code = $r['errorCode'];
        } else {
            $code = isset($source['errorCode']) ? $source['errorCode'] : 'source_unreadable';
        }
        if (in_array($code, self::INELIGIBLE, true)) { return true; }
        return self::fail(in_array($code, self::INDETERMINATE, true) ? $code : 'source_unreadable');
    }

    /**
     * Existing pair, else (valid address only) the PBX pair or a generated leaf under the protected dir.
     * Nothing is created or replaced unless a complete new pair is ready; no result throws.
     * @param callable|null $readSource test seam; production reads PbxCertificateSource.
     * @return array {ok, errorCode, source?, certPath?, keyPath?}
     */
    public static function prepare($address, $paths, $moduleDir, $readSource = null)
    {
        $e = self::existing($address, $paths, $moduleDir);
        if ($e['ok'] || $e['errorCode'] !== null) { return $e; }
        // An installed but unusable own pair is never overwritten: the administrator replaces or removes it (manual step).
        if (!empty($e['ownInstalled'])) { return self::fail('installed_pair_unusable'); }
        if ($address === '' || TlsCertificateInspector::normalizeEndpoint($address) !== $address) { return self::fail('invalid_hostname'); }
        $plan = self::plan($readSource !== null ? call_user_func($readSource) : PbxCertificateSource::read(), $address);
        if (isset($plan['ok'])) { return $plan; }
        if (!is_dir($paths['ownDir'])) {
            if (!@mkdir($paths['ownDir'], 0755, true) && !is_dir($paths['ownDir'])) { return self::fail('tls_prepare_failed'); }
            @chmod($paths['ownDir'], 0755);
        }
        // Both publishers prove the exact published pair (address included) under their lock and clean only their own entries.
        $ok = is_array($plan) ? TlsCertificate::install($paths['ownCert'], $paths['ownKey'], $plan[0], $plan[1], 0644, $address)
            : TlsCertificate::ensure($paths['ownCert'], $paths['ownKey'], $address, 0644);
        if (!$ok) { return self::fail('tls_prepare_failed'); }
        return self::found(is_array($plan) ? 'pbx' : 'self_signed', $paths['ownCert'], $paths['ownKey']);
    }
}
