<?php
namespace Modules\ModuleCTIClient\Lib;

/** Локальная проверка TLS-личности, без изменения источника или системного доверия. */
final class TlsCertificateInspector
{
    const MAX_PUBLIC_PEM_BYTES = 262144;
    const MAX_SAN_DER_BYTES = 16384;
    const MAX_GENERAL_NAMES = 256;
    const MAX_NAME_DEPTH = 12;

    private static $cliUnavailable = false;
    /** @return string|null Нормализованный ASCII FQDN, не URL/IP/шаблон. */
    public static function normalizeHostname($hostname)
    {
        if (!is_string($hostname) || strlen($hostname) > 253 || strpos($hostname, '.') === false
            || filter_var($hostname, FILTER_VALIDATE_IP) !== false) { return null; }
        // Числовой dotted адрес не становится DNS-именем из-за неканонической записи IP.
        return self::validDnsLabels($hostname) && !preg_match('/^[0-9.]+$/D', $hostname)
            ? self::asciiLower($hostname) : null;
    }

    /**
     * Точные 4/16 байт bare IP (inet_pton): без схемы, порта, zone, скобок, root-dot и неканонических IPv4.
     * @return string|null
     */
    public static function endpointIpBinary($value)
    {
        if (!is_string($value) || strlen($value) > 45 || !preg_match('/^[0-9A-Fa-f:.]+$/D', $value)) { return null; }
        $valid = strpos($value, ':') === false
            ? preg_match('/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/D', $value) === 1
            : filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;
        $binary = $valid ? @inet_pton($value) : false;
        return is_string($binary) && (strlen($binary) === 4 || strlen($binary) === 16) ? $binary : null;
    }

    /**
     * Адрес CTI: ASCII FQDN (как normalizeHostname) либо bare IP в бинарно-каноническом виде (inet_ntop).
     * Единственная root-точка допускается только для DNS и только при административном вводе.
     * @return string|null
     */
    public static function normalizeEndpoint($value, $allowDnsRootDot = false)
    {
        $binary = self::endpointIpBinary($value);
        if ($binary !== null) { return inet_ntop($binary); }
        if ($allowDnsRootDot && is_string($value) && substr($value, -1) === '.') { $value = substr($value, 0, -1); }
        $host = self::normalizeHostname($value);
        // Числовой/hex последний label (127.1, 0x7f.0.0.1) — псевдоним IP, а не DNS-имя.
        return $host !== null && !preg_match('/\.(?:[0-9]+|0x[0-9a-f]*)$/D', $host) ? $host : null;
    }

    /** @return string Только нормализованные публичные PEM CERTIFICATE, без ключей. */
    public static function exportPublic($bundlePem)
    {
        $certs = self::certificates($bundlePem);
        return $certs === null ? '' : implode('', $certs);
    }

    /** @return array|null {certPem,leafPem} Публичные PEM источника после проверки исходного leaf. */
    public static function exportSelectedPublic($bundlePem)
    {
        $certs = self::certificates($bundlePem, $firstBlock, true);
        return $certs ? array('certPem' => implode('', $certs), 'leafPem' => $certs[0]) : null;
    }

    /**
     * Публичное описание, НЕ проверка пригодности к применению или системного доверия.
     * verifiedRoot не доказывает связь с leaf: её проверяет inspect через ordered chain.
     * @return array {ok,errorCode,certificate,isCa,verifiedRoot,publicPem}
     */
    public static function describe($certPem)
    {
        $result = array('ok' => false, 'errorCode' => null, 'certificate' => null,
            'isCa' => false, 'verifiedRoot' => null, 'publicPem' => '');
        if (!function_exists('openssl_x509_parse')) { return self::failure($result, 'openssl_unavailable'); }
        $certs = self::certificates($certPem, $firstBlock);
        if (!$certs) { return self::failure($result, 'invalid_certificate'); }
        if (count($certs) !== 1) { return self::failure($result, 'ambiguous_certificate'); }
        $pem = $certs[0];
        $data = @openssl_x509_parse($pem);
        if (!is_array($data) || !isset($data['validFrom_time_t'], $data['validTo_time_t'])) {
            return self::failure($result, 'invalid_certificate');
        }
        $names = self::subjectAltNames($firstBlock);
        if ($names === null) { return self::failure($result, 'invalid_certificate'); }
        $result['certificate'] = self::publicCertificate($pem, $data, $names['san']);
        $result['isCa'] = (bool) self::isCa($data);
        $result['verifiedRoot'] = $result['isCa'] ? $result['certificate']['selfSigned'] : false;
        $result['publicPem'] = $pem;
        $result['ok'] = true;
        return $result;
    }

    /** @return array {ok,errorCode,certificate,publicChain}; publicChain содержит только публичные PEM. */
    public static function inspect($certPem, $privateKeyPem, $hostname, $chainPem = '')
    {
        $hostname = self::normalizeEndpoint($hostname);
        if ($hostname === null) {
            return self::failure(array('ok' => false, 'errorCode' => null, 'certificate' => null, 'publicChain' => array()), 'invalid_hostname');
        }
        return self::check($certPem, $privateKeyPem, $hostname, $chainPem);
    }

    /**
     * Уже установленная пара без сохранённого адреса: те же проверки пары, срока, EKU/KU и цепочки, но имя НЕ сверяется
     * и не выводится из сертификата. Только для продолжения прежней CTI-пары; выбор адреса и PBX HTTPS идёт через inspect().
     */
    public static function inspectExisting($certPem, $privateKeyPem)
    {
        return self::check($certPem, $privateKeyPem, null, '');
    }

    /**
     * Те же проверки без закрытого ключа (статус веб-процесса): срок, EKU/KU, цепочка и, при заданном адресе, typed SAN.
     * $hostname === null: имя не проверяется. Соответствие ключу не проверяется.
     */
    public static function inspectPublic($certPem, $hostname = null)
    {
        if ($hostname !== null) {
            $hostname = self::normalizeEndpoint($hostname);
            if ($hostname === null) {
                return self::failure(array('ok' => false, 'errorCode' => null, 'certificate' => null, 'publicChain' => array()), 'invalid_hostname');
            }
        }
        return self::check($certPem, false, $hostname, '');
    }

    /** $hostname === null: имя не проверяется (inspectExisting); публичный inspect() всегда передаёт нормализованное имя. */
    private static function check($certPem, $privateKeyPem, $hostname, $chainPem)
    {
        $result = array('ok' => false, 'errorCode' => null, 'certificate' => null, 'publicChain' => array());
        if (!function_exists('openssl_x509_parse')) { return self::failure($result, 'openssl_unavailable'); }
        $certs = self::certificates($certPem, $firstBlock);
        if (!$certs) { return self::failure($result, 'invalid_certificate'); }
        $leaf = array_shift($certs);
        $data = @openssl_x509_parse($leaf);
        if (!is_array($data) || !isset($data['validFrom_time_t'], $data['validTo_time_t'])) {
            return self::failure($result, 'invalid_certificate');
        }
        $names = self::subjectAltNames($firstBlock);
        if ($names === null) { return self::failure($result, 'invalid_certificate'); }
        $result['certificate'] = self::publicCertificate($leaf, $data, $names['san']);
        if ($privateKeyPem !== false && (!is_string($privateKeyPem) || !@openssl_x509_check_private_key($leaf, $privateKeyPem))) {
            return self::failure($result, 'key_mismatch');
        }
        if ($data['validFrom_time_t'] > time()) { return self::failure($result, 'not_yet_valid'); }
        if ($data['validTo_time_t'] <= time()) { return self::failure($result, 'expired'); }
        // CN fallback намеренно отсутствует: DNS-адрес должен быть в dNSName, IP — в типизированном iPAddress.
        if ($hostname !== null && !self::matchesEndpoint($names, $hostname)) { return self::failure($result, 'hostname_mismatch'); }
        $extensions = isset($data['extensions']) ? $data['extensions'] : array();
        if (isset($extensions['extendedKeyUsage'])
            && !self::hasUsage($extensions['extendedKeyUsage'], array('TLS Web Server Authentication', '1.3.6.1.5.5.7.3.1'))) {
            return self::failure($result, 'invalid_eku');
        }
        if (isset($extensions['keyUsage'])
            && !self::hasUsage($extensions['keyUsage'], array('Digital Signature', 'Key Encipherment', 'Key Agreement'))) {
            return self::failure($result, 'invalid_key_usage');
        }
        $chain = self::certificates($chainPem);
        if ($chain === null) { return self::failure($result, 'invalid_chain'); }
        $chain = array_values(array_unique(array_merge($certs, $chain)));
        $chain = array_values(array_diff($chain, array($leaf)));
        $undecided = false;
        $ordered = self::orderChain($leaf, $chain, $undecided);
        // Inability to verify is an operational fault and never evidence that the supplied chain is wrong.
        if ($undecided) { return self::failure($result, 'chain_verification_unavailable'); }
        if ($ordered === null) { return self::failure($result, 'invalid_chain'); }
        $result['publicChain'] = $ordered;
        $result['ok'] = true;
        return $result;
    }

    private static function failure($result, $code)
    {
        $result['errorCode'] = $code;
        return $result;
    }

    /** @return array|null Невалидный certificate-блок или посторонний текст — отказ. */
    private static function certificates($pem, &$firstBlock = null, $validateSelectedLeaf = false)
    {
        if (!is_string($pem) || !function_exists('openssl_x509_read')) { return null; }
        preg_match_all('/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/', $pem, $matches);
        $remaining = preg_replace('/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/', '', $pem);
        // Combined PEM разрешён на входе; секрет никогда не переносится на выход.
        $remaining = preg_replace('/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/', '', $remaining);
        if (trim($remaining) !== '') { return null; }
        $result = array();
        foreach ($matches[0] as $block) {
            $cert = @openssl_x509_read($block);
            if ($cert === false) { return null; }
            $checkLeaf = $validateSelectedLeaf && !$result;
            if ($checkLeaf) {
                $der = self::publicPemDer($block);
                if ($der === null || self::decodeCertificateNames($der) === null) { return null; }
            }
            if (!@openssl_x509_export($cert, $public)) { return null; }
            // Нормализация PEM не должна менять DER leaf, проверяемого далее по ключу и SHA-256.
            if ($checkLeaf && self::publicPemDer($public) !== $der) { return null; }
            if (!$result) { $firstBlock = $block; }
            $result[] = str_replace("\r\n", "\n", $public);
        }
        return array_values(array_unique($result));
    }

    private static function asciiLower($value)
    {
        return strtr($value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
    }

    private static function validDnsLabels($domain)
    {
        foreach (explode('.', $domain) as $label) {
            if (!preg_match('/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/D', $label)) { return false; }
        }
        return true;
    }

    /** @param string[] $dnsNames Проверенные точные байты dNSName, не строки публичных метаданных. */
    public static function matchesDnsNames($dnsNames, $hostname)
    {
        if (!is_string($hostname) || self::normalizeHostname($hostname) !== $hostname) { return false; }
        $suffix = self::normalizeHostname(substr($hostname, strpos($hostname, '.') + 1));
        foreach ($dnsNames as $name) {
            $pattern = self::asciiLower($name);
            if ($pattern === $hostname || ($suffix !== null && $pattern === '*.' . $suffix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param array $names Проверенные {dns,ip}: dns — байты dNSName, ip — точные 4/16 байт iPAddress.
     * IP сравнивается только с iPAddress, DNS только с dNSName; метаданные и CN доказательством не служат.
     */
    public static function matchesEndpoint($names, $endpoint)
    {
        if (!is_array($names) || !is_string($endpoint) || self::normalizeEndpoint($endpoint) !== $endpoint) { return false; }
        $binary = self::endpointIpBinary($endpoint);
        if ($binary !== null) { return isset($names['ip']) && in_array($binary, $names['ip'], true); }
        return isset($names['dns']) && self::matchesDnsNames($names['dns'], $endpoint);
    }

    /** @return array|null {dns,ip,san} из первого публичного PEM, уже принятого OpenSSL; null при ошибке DER. */
    public static function subjectAltNames($pem)
    {
        $der = self::publicPemDer($pem);
        return $der === null ? null : self::decodeCertificateNames($der);
    }

    private static function publicPemDer($pem)
    {
        $begin = '-----BEGIN CERTIFICATE-----';
        // PHP до 8.0 мог перегружать strlen/substr/strpos через mbstring; DER требует байтовых смещений.
        if (((int) ini_get('mbstring.func_overload') & 2) || !is_string($pem)
            || strlen($pem) > self::MAX_PUBLIC_PEM_BYTES || strpos($pem, $begin) !== 0) { return null; }
        $start = strlen($begin);
        $end = strpos($pem, '-----END CERTIFICATE-----', $start);
        if ($end === false) { return null; }
        $encoded = str_replace(array("\r", "\n", ' ', "\t"), '', substr($pem, $start, $end - $start));
        $der = base64_decode($encoded, true);
        return $der === false || base64_encode($der) !== $encoded ? null : $der;
    }

    private static function decodeCertificateNames($der)
    {
        $offset = 0;
        $certificate = self::derValue($der, $offset, 0x30);
        if ($certificate === null || $offset !== strlen($der)) { return null; }
        $offset = 0;
        $tbs = self::derValue($certificate, $offset, 0x30);
        if ($tbs === null || self::derValue($certificate, $offset, 0x30) === null
            || self::derValue($certificate, $offset, 0x03) === null || $offset !== strlen($certificate)) { return null; }

        $offset = 0;
        $version = 0;
        if (isset($tbs[0]) && ord($tbs[0]) === 0xa0) {
            $explicit = self::derValue($tbs, $offset, 0xa0);
            if ($explicit !== "\x02\x01\x01" && $explicit !== "\x02\x01\x02") { return null; }
            $version = ord($explicit[2]);
        }
        // serialNumber, signature, issuer, validity, subject, subjectPublicKeyInfo.
        foreach (array(0x02, 0x30, 0x30, 0x30, 0x30, 0x30) as $tag) {
            if (self::derValue($tbs, $offset, $tag) === null) { return null; }
        }
        foreach (array(0x81, 0x82) as $tag) {
            if (isset($tbs[$offset]) && ord($tbs[$offset]) === $tag
                && ($version < 1 || self::derValue($tbs, $offset, $tag) === null)) { return null; }
        }
        if ($offset === strlen($tbs)) { return array('dns' => array(), 'ip' => array(), 'san' => array()); }
        $extensions = self::derValue($tbs, $offset, 0xa3);
        return $version === 2 && $extensions !== null && $offset === strlen($tbs)
            ? self::decodeExtensions($extensions) : null;
    }

    private static function decodeExtensions($explicit)
    {
        $offset = 0;
        $extensions = self::derValue($explicit, $offset, 0x30);
        if ($extensions === null || $extensions === '' || $offset !== strlen($explicit)) { return null; }
        $offset = 0;
        $names = null;
        while ($offset < strlen($extensions)) {
            $extension = self::derValue($extensions, $offset, 0x30);
            if ($extension === null) { return null; }
            $part = 0;
            $oid = self::derValue($extension, $part, 0x06);
            if (!self::validOid($oid)) { return null; }
            if (isset($extension[$part]) && ord($extension[$part]) === 0x01
                && self::derValue($extension, $part, 0x01) !== "\xff") { return null; }
            $value = self::derValue($extension, $part, 0x04);
            if ($value === null || $part !== strlen($extension)) { return null; }
            if ($oid === "\x55\x1d\x11") { // id-ce-subjectAltName (2.5.29.17)
                if ($names !== null) { return null; }
                $names = self::decodeGeneralNames($value);
                if ($names === null) { return null; }
            }
        }
        return $names === null ? array('dns' => array(), 'ip' => array(), 'san' => array()) : $names;
    }

    private static function decodeGeneralNames($der)
    {
        if (strlen($der) > self::MAX_SAN_DER_BYTES) { return null; }
        $offset = 0;
        $sequence = self::derValue($der, $offset, 0x30);
        if ($sequence === null || $sequence === '' || $offset !== strlen($der)) { return null; }
        $offset = 0;
        $san = array();
        $dns = array();
        $ip = array();
        while ($offset < strlen($sequence)) {
            if (count($san) >= self::MAX_GENERAL_NAMES) { return null; }
            $tag = ord($sequence[$offset]);
            $value = self::derValue($sequence, $offset, $tag);
            if ($value === null || $value === '') { return null; }
            switch ($tag) {
                case 0x82: // dNSName [2] IA5String (primitive, implicit).
                    $domain = strpos($value, '*.') === 0 ? substr($value, 2) : $value;
                    if (strlen($value) > 253 || !self::validDnsLabels($domain)) { return null; }
                    $dns[] = $value;
                    $san[] = 'DNS:' . $value;
                    break;
                case 0x81: // rfc822Name
                    if (!self::safeMailboxBytes($value)) { return null; }
                    $san[] = 'email:' . $value;
                    break;
                case 0x86: // uniformResourceIdentifier
                    if (!preg_match('/^[\x21-\x7e]+$/D', $value)) { return null; }
                    $san[] = 'URI:' . $value;
                    break;
                case 0x87: // iPAddress
                    if (strlen($value) !== 4 && strlen($value) !== 16) { return null; }
                    $text = inet_ntop($value);
                    if ($text === false) { return null; }
                    $san[] = 'IP Address:' . $text;
                    $ip[] = $value;
                    break;
                case 0x88: // registeredID
                    if (!self::validOid($value)) { return null; }
                    $san[] = 'Registered ID (DER):' . bin2hex($value);
                    break;
                case 0xa0: // otherName: OID + [0] EXPLICIT ANY
                    $part = 0;
                    if (!self::validOid(self::derValue($value, $part, 0x06))) { return null; }
                    $any = self::derValue($value, $part, 0xa0);
                    if ($any === null || $part !== strlen($value) || !self::validDerChildren($any, 1, true)) { return null; }
                    $san[] = 'otherName';
                    break;
                case 0xa3: // x400Address: ORAddress
                case 0xa4: // directoryName: EXPLICIT Name
                case 0xa5: // ediPartyName
                    if (!self::validStructuredName($tag, $value)) { return null; }
                    $labels = array(0xa3 => 'X400Name', 0xa4 => 'DirName', 0xa5 => 'EdiPartyName');
                    $san[] = $labels[$tag];
                    break;
                default:
                    return null;
            }
        }
        return array('dns' => $dns, 'ip' => $ip, 'san' => array_values(array_unique($san)));
    }

    /** Ограничение байтов для метаданных: пробел допустим только в quoted local-part. */
    private static function safeMailboxBytes($value)
    {
        if (!preg_match('/^[\x20-\x7e]+$/D', $value)) { return false; }
        if ($value[0] !== '"') { return strpos($value, ' ') === false; }
        for ($i = 1, $length = strlen($value); $i < $length; ++$i) {
            if ($value[$i] === '\\') { ++$i; continue; }
            if ($value[$i] === '"') {
                return $i + 2 < $length && $value[$i + 1] === '@' && strpos($value, ' ', $i + 2) === false;
            }
        }
        return false;
    }

    private static function validStructuredName($tag, $value)
    {
        $offset = 0;
        if ($tag === 0xa5) {
            if (ord($value[0]) === 0xa0) {
                $assigner = self::derValue($value, $offset, 0xa0);
                if (!self::validDirectoryString($assigner)) { return false; }
            }
            return self::validDirectoryString(self::derValue($value, $offset, 0xa1)) && $offset === strlen($value);
        }
        $sequence = self::derValue($value, $offset, 0x30);
        if ($sequence === null) { return false; }
        if ($tag === 0xa4) {
            return $offset === strlen($value) && self::validRelativeNames($sequence);
        }
        // ORAddress: обязательная SEQUENCE и два необязательных поля в фиксированном порядке.
        if (!self::validDerChildren($sequence, 1)) { return false; }
        foreach (array(0x30, 0x31) as $optional) {
            if (isset($value[$offset]) && ord($value[$offset]) === $optional) {
                $child = self::derValue($value, $offset, $optional);
                if ($child === null || $child === '' || !self::validDerChildren($child, 1)) { return false; }
            }
        }
        return $offset === strlen($value);
    }

    private static function validRelativeNames($sequence)
    {
        $rdn = 0;
        while ($rdn < strlen($sequence)) {
            $set = self::derValue($sequence, $rdn, 0x31);
            if ($set === null || $set === '') { return false; }
            $part = 0;
            while ($part < strlen($set)) {
                $attribute = self::derValue($set, $part, 0x30);
                $at = 0;
                if ($attribute === null || !self::validOid(self::derValue($attribute, $at, 0x06))
                    || $at === strlen($attribute) || !self::validDerChildren(substr($attribute, $at), 1, true)) {
                    return false;
                }
            }
        }
        return true;
    }

    private static function validDirectoryString($value)
    {
        if ($value === null || $value === '' || !in_array(ord($value[0]), array(0x0c, 0x13, 0x14, 0x1c, 0x1e), true)) {
            return false;
        }
        $offset = 0;
        $text = self::derValue($value, $offset);
        return $text !== null && $text !== '' && $offset === strlen($value);
    }

    private static function validDerChildren($der, $depth, $single = false)
    {
        if ($depth > self::MAX_NAME_DEPTH) { return false; }
        $offset = 0;
        while ($offset < strlen($der)) {
            $tag = ord($der[$offset]);
            $child = self::derValue($der, $offset);
            if ($child === null || (($tag & 0x20) && !self::validDerChildren($child, $depth + 1))) { return false; }
            if ($single) { return $offset === strlen($der); }
        }
        return !$single;
    }

    private static function validOid($value)
    {
        if ($value === null || $value === '') { return false; }
        $start = true;
        for ($i = 0, $end = strlen($value); $i < $end; ++$i) {
            $byte = ord($value[$i]);
            if ($start && $byte === 0x80) { return false; }
            $start = ($byte & 0x80) === 0;
        }
        return $start;
    }

    /** Один definite-length DER TLV внутри текущего контейнера; null не означает пустое значение. */
    private static function derValue($der, &$offset, $expected = null)
    {
        $end = strlen($der);
        if ($offset >= $end) { return null; }
        $tag = ord($der[$offset++]);
        if (($tag & 0xdf) === 0 || ($expected !== null && $tag !== $expected)) { return null; }
        if (($tag & 0x1f) === 0x1f) {
            if ($expected !== null || $offset >= $end || ord($der[$offset]) < 31 || ord($der[$offset]) === 0x80) { return null; }
            do {
                if ($offset >= $end) { return null; }
                $byte = ord($der[$offset++]);
            } while ($byte & 0x80);
        }
        if ($offset >= $end) { return null; }
        $length = ord($der[$offset++]);
        if ($length & 0x80) {
            $count = $length & 0x7f;
            if ($count === 0 || $count > 3 || $count > $end - $offset || ord($der[$offset]) === 0) { return null; }
            $length = 0;
            while ($count-- > 0) { $length = ($length << 8) | ord($der[$offset++]); }
            if ($length < 128) { return null; }
        }
        if ($length > $end - $offset) { return null; }
        $value = substr($der, $offset, $length);
        $offset += $length;
        // PHP 5.6/7.4 substr() может вернуть false для пустого среза в конце строки.
        return $length === 0 ? '' : $value;
    }

    private static function hasUsage($value, $allowed)
    {
        return count(array_intersect(array_map('trim', explode(',', $value)), $allowed)) > 0;
    }

    private static function publicCertificate($pem, $data, $sans)
    {
        return array(
            'sha256' => strtolower(str_replace(':', '', openssl_x509_fingerprint($pem, 'sha256'))),
            'subject' => self::dn(isset($data['subject']) ? $data['subject'] : array()),
            'issuer' => self::dn(isset($data['issuer']) ? $data['issuer'] : array()),
            'san' => $sans, 'notBefore' => (int) $data['validFrom_time_t'], 'notAfter' => (int) $data['validTo_time_t'],
            'selfSigned' => self::sameDn($data) ? self::verifySignature($pem, $pem, true) : false
        );
    }

    private static function dn($dn)
    {
        $parts = array();
        foreach ($dn as $key => $values) {
            foreach ((array) $values as $value) { $parts[] = $key . '=' . $value; }
        }
        return implode(', ', $parts);
    }

    private static function sameDn($data)
    {
        return isset($data['subject'], $data['issuer']) && $data['subject'] == $data['issuer'];
    }

    /**
     * Проверяем только supplied linkage, это не проверка системного/удалённого доверия.
     * null = доказанный дефект цепочки; $undecided=true = проверка подписи не выполнима и это меняет вывод.
     */
    private static function orderChain($leaf, $remaining, &$undecided = false)
    {
        $undecided = false;
        if (count($remaining) > 32) { return null; }
        $ordered = array(); $child = $leaf; $nonSelfIssued = 0;
        while ($remaining) {
            $childData = @openssl_x509_parse($child); $candidates = array(); $unchecked = false;
            foreach ($remaining as $index => $issuer) {
                $data = @openssl_x509_parse($issuer);
                if (!is_array($data) || !isset($data['subject'], $childData['issuer'])
                    || $data['subject'] != $childData['issuer'] || !self::isCa($data)) { continue; }
                $verified = self::verifySignature($child, $issuer, false);
                if ($verified === true) { $candidates[$index] = $issuer; }
                elseif ($verified === null) { $unchecked = true; }
            }
            // An unchecked candidate may be the missing issuer or a second one: with <=1 proved, nothing is decided.
            if ($unchecked && count($candidates) <= 1) { $undecided = true; return null; }
            if (count($candidates) !== 1) { return null; }
            foreach ($candidates as $index => $issuer) {
                $data = openssl_x509_parse($issuer);
                if ($data['validFrom_time_t'] > time() || $data['validTo_time_t'] <= time()) { return null; }
                if (preg_match('/pathlen:\s*(\d+)/i', $data['extensions']['basicConstraints'], $limit)
                    && $nonSelfIssued > (int) $limit[1]) { return null; }
                $ordered[] = $issuer; unset($remaining[$index]); $child = $issuer;
                // RFC 5280 pathLen: self-issued rollover CA не расходует лимит.
                if (!self::sameDn($data)) { ++$nonSelfIssued; }
                // DN equality недостаточно: одноимённый intermediate может быть подписан другим ключом.
                if (self::sameDn($data)) {
                    $selfSigned = self::verifySignature($issuer, $issuer, true);
                    if ($selfSigned === true) { return $remaining ? null : $ordered; }
                    // Unprovable root-ness only matters when certificates are left over (root => invalid, else continue).
                    if ($selfSigned === null && $remaining) { $undecided = true; return null; }
                }
            }
        }
        return $ordered;
    }

    private static function isCa($data)
    {
        return isset($data['extensions']['basicConstraints'])
            && preg_match('/(?:^|,\s*)CA:TRUE(?:,|$)/', $data['extensions']['basicConstraints'])
            && (!isset($data['extensions']['keyUsage'])
                || self::hasUsage($data['extensions']['keyUsage'], array('Certificate Sign')));
    }

    /** @return bool|null null означает недоступную проверку, а не совпадение DN. */
    private static function verifySignature($child, $issuer, $self)
    {
        if (function_exists('openssl_x509_verify')) {
            $key = @openssl_pkey_get_public($issuer);
            if ($key === false) { return null; }
            $verified = @openssl_x509_verify($child, $key);
            return $verified === 1 ? true : ($verified === 0 ? false : null);
        }
        return self::verifyWithCli($child, $issuer, $self);
    }

    /** PHP 5.6: без proc-resource destructor, только CLI с локальным POSIX runner. */
    private static function verifyWithCli($child, $issuer, $self)
    {
        if (self::$cliUnavailable || !self::supportsForkVerifier()) { return null; }
        $binary = null;
        foreach (array('/usr/bin/openssl', '/usr/local/bin/openssl') as $path) {
            if (is_file($path) && is_executable($path)) { $binary = $path; break; }
        }
        if ($binary === null) { return null; }
        $random = openssl_random_pseudo_bytes(16);
        if ($random === false) { return null; }
        $dir = sys_get_temp_dir() . '/cti-verify-' . bin2hex($random);
        $mask = umask(0077);
        try { $created = @mkdir($dir, 0700); } finally { umask($mask); }
        if (!$created) { return null; }
        $cleanup = true;
        try {
            if (!@chmod($dir, 0700) || !@mkdir($dir . '/empty', 0700)
                || @file_put_contents($dir . '/child.pem', $child) !== strlen($child)
                || @file_put_contents($dir . '/issuer.pem', $issuer) !== strlen($issuer)) { return null; }
            $arguments = array('verify', $self ? '-check_ss_sig' : '-partial_chain',
                '-CAfile', $dir . '/issuer.pem', '-CApath', $dir . '/empty', $dir . '/child.pem');
            $outcome = self::runVerifier($binary, $arguments, $dir);
            $cleanup = $outcome['reaped'];
            if ($outcome['reason'] !== 'completed') { return null; }
            if ($outcome['exit'] === 0) { return true; }
            $error = @file_get_contents($dir . '/stderr');
            return $outcome['exit'] === 2 && strpos((string) $error, 'certificate signature failure') !== false
                ? false : null;
        } finally {
            // Не удаляем файлы, которые ещё может использовать неподтверждённый child.
            if ($cleanup) {
                foreach (glob($dir . '/*') as $file) { if (is_file($file)) { @unlink($file); } }
                @rmdir($dir . '/empty'); @rmdir($dir);
            }
        }
    }

    private static function supportsForkVerifier()
    {
        // Нельзя fork'ать web/FPM worker с унаследованными DB/socket/response ресурсами.
        if (PHP_SAPI !== 'cli') { return false; }
        foreach (array('pcntl_fork', 'pcntl_exec', 'pcntl_waitpid', 'pcntl_wifexited', 'pcntl_wexitstatus',
            'pcntl_get_last_error', 'posix_kill', 'posix_getpid', 'openssl_random_pseudo_bytes') as $function) {
            if (!function_exists($function)) { return false; }
        }
        return true;
    }

    /** Только private вызов с фиксированным OpenSSL; никаких shell/PATH/user command. */
    private static function runVerifier($binary, $arguments, $dir)
    {
        $started = microtime(true);
        $result = array('pid' => null, 'reaped' => true, 'exit' => null,
            'reason' => 'unavailable', 'term' => null, 'kill' => null, 'seconds' => 0);
        if (self::$cliUnavailable || !self::supportsForkVerifier()) { return $result; }
        $pid = @pcntl_fork();
        if ($pid === 0) {
            // Только CLI. Закрытые standard fd переоткрываем перед exec; ключей здесь нет.
            fclose(STDIN); fclose(STDOUT); fclose(STDERR);
            $input = @fopen('/dev/null', 'r');
            $output = @fopen($dir . '/stdout', 'w');
            $error = @fopen($dir . '/stderr', 'w');
            if ($input !== false && $output !== false && $error !== false) { @pcntl_exec($binary, $arguments); }
            // При exec failure не возвращаемся к PHP caller или inherited destructors.
            $ownPid = posix_getpid();
            if (is_int($ownPid) && $ownPid > 0) { @posix_kill($ownPid, 9); }
            while (true) { usleep(100000); }
        }
        if (!is_int($pid) || $pid <= 0) { $result['reason'] = 'fork_failed'; return $result; }
        $result['pid'] = $pid; $status = 0;
        $done = self::pollVerifier($pid, $started + 3, $status);
        $result['reason'] = $done === true ? 'completed' : ($done === null ? 'wait_failed' : 'timeout');
        if ($done === false) {
            $result['term'] = @posix_kill($pid, 15);
            $done = self::pollVerifier($pid, microtime(true) + 0.25, $status);
            if ($done === false) {
                $result['kill'] = @posix_kill($pid, 9);
                $done = self::pollVerifier($pid, microtime(true) + 0.25, $status);
            }
        }
        $result['reaped'] = $done === true;
        if ($done === true && pcntl_wifexited($status)) { $result['exit'] = pcntl_wexitstatus($status); }
        if (!$result['reaped']) {
            // Kernel-uninterruptible child не ждём синхронно; прекращаем новые spawn в этом request.
            self::$cliUnavailable = true;
        }
        $result['seconds'] = microtime(true) - $started;
        return $result;
    }

    /** @return bool|null true=reaped, false=deadline, null=неизвестный wait error. */
    private static function pollVerifier($pid, $deadline, &$status)
    {
        do {
            $waited = @pcntl_waitpid($pid, $status, 1); // WNOHANG, также в PHP 5.6.
            if ($waited === $pid) { return true; }
            if ($waited === -1 && !(defined('PCNTL_EINTR') && pcntl_get_last_error() === constant('PCNTL_EINTR'))) {
                return null;
            }
            if (microtime(true) >= $deadline) { return false; }
            usleep(10000);
        } while (true);
    }
}
