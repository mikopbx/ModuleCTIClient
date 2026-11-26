<?php
namespace Modules\ModuleCTIClient\Lib {
    // Только тестовая недоступность verifier; никаких подмен private методов.
    function function_exists($name) {
        if (!empty($GLOBALS['metadataVerifierUnavailable'])
            && in_array($name, array('openssl_x509_verify', 'pcntl_fork'), true)) { return false; }
        return \function_exists($name);
    }
}
namespace {
require_once dirname(__DIR__) . '/Lib/TlsCertificateInspector.php';
use Modules\ModuleCTIClient\Lib\TlsCertificateInspector as Inspector;

function expectMetadata($condition, $message) {
    if (!$condition) { throw new RuntimeException($message); }
}
function metadataFixture($dir, $ca, $issuer = null, $usage = null) {
    $config = $dir . '/fixture.cnf';
    file_put_contents($config, "[req]\ndistinguished_name=dn\n[dn]\n[ext]\nbasicConstraints=critical,CA:"
        . ($ca ? 'TRUE' : 'FALSE') . "\nkeyUsage="
        . ($usage === null ? ($ca ? 'keyCertSign,cRLSign' : 'digitalSignature') : $usage)
        . "\nsubjectAltName=DNS:pbx.test\n");
    $options = array('config' => $config, 'digest_alg' => 'sha256', 'x509_extensions' => 'ext');
    $key = openssl_pkey_new(array('config' => $config, 'private_key_bits' => 2048,
        'private_key_type' => OPENSSL_KEYTYPE_RSA));
    expectMetadata($key !== false, 'fixture key generation');
    $csr = openssl_csr_new(array('commonName' => 'same subject'), $key, $options);
    expectMetadata($csr !== false, 'fixture CSR');
    $cert = openssl_csr_sign($csr, $issuer === null ? null : $issuer['cert'],
        $issuer === null ? $key : $issuer['key'], 30, $options, mt_rand(1, 100000000));
    expectMetadata($cert !== false && openssl_x509_export($cert, $pem), 'fixture certificate');
    expectMetadata(openssl_pkey_export($key, $keyPem, null, $options), 'fixture key export');
    return array('cert' => $pem, 'key' => $keyPem);
}
// Меняем сроки только собственного fixture и подписываем его собственным ключом.
function metadataDerPart($der, &$offset) {
    $start = $offset++; $length = ord($der[$offset++]);
    if ($length & 128) {
        $bytes = $length & 127; $length = 0;
        while ($bytes-- > 0) { $length = ($length << 8) | ord($der[$offset++]); }
    }
    $offset += $length;
    return substr($der, $start, $offset - $start);
}
function metadataDerWrap($tag, $value) {
    $length = strlen($value);
    if ($length < 128) { return chr($tag) . chr($length) . $value; }
    $bytes = '';
    while ($length > 0) { $bytes = chr($length & 255) . $bytes; $length >>= 8; }
    return chr($tag) . chr(128 | strlen($bytes)) . $bytes . $value;
}
function metadataExpiredFixture($fixture) {
    $der = base64_decode(preg_replace('/-----[^-]+-----|\s/', '', $fixture['cert']));
    $offset = 1; $length = ord($der[$offset++]);
    if ($length & 128) { $offset += $length & 127; }
    $tbs = metadataDerPart($der, $offset); $algorithm = metadataDerPart($der, $offset);
    $parsed = openssl_x509_parse($fixture['cert']);
    $tbs = str_replace(array(gmdate('ymdHis\Z', $parsed['validFrom_time_t']),
        gmdate('ymdHis\Z', $parsed['validTo_time_t'])),
        array(gmdate('ymdHis\Z', time() - 7200), gmdate('ymdHis\Z', time() - 3600)), $tbs);
    expectMetadata(openssl_sign($tbs, $signature, $fixture['key'], OPENSSL_ALGO_SHA256), 'fixture resign');
    $der = metadataDerWrap(48, $tbs . $algorithm . metadataDerWrap(3, "\0" . $signature));
    $fixture['cert'] = "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($der), 64, "\n")
        . "-----END CERTIFICATE-----\n";
    return $fixture;
}
function expectMetadataError($input, $code) {
    $r = Inspector::describe($input);
    expectMetadata($r === array('ok' => false, 'errorCode' => $code, 'certificate' => null,
        'isCa' => false, 'verifiedRoot' => null, 'publicPem' => ''), 'controlled metadata error: ' . json_encode($r));
}
if (!extension_loaded('openssl')) { throw new RuntimeException('OpenSSL required; not a PASS'); }
$dir = sys_get_temp_dir() . '/cti-metadata-' . bin2hex(openssl_random_pseudo_bytes(12));
$mask = umask(0077);
try { expectMetadata(mkdir($dir, 0700), 'owned private temporary directory'); } finally { umask($mask); }
$failed = 0;
try {
    $cases = array(
        'publicOnlyDescription' => function () use ($dir) {
            $f = metadataFixture($dir, false);
            $r = Inspector::describe($f['cert'] . $f['key']);
            expectMetadata($r['ok'] && $r['errorCode'] === null && $r['publicPem'] === $f['cert'], 'normalized public cert');
            expectMetadata(array_keys($r['certificate']) === array('sha256', 'subject', 'issuer', 'san',
                'notBefore', 'notAfter', 'selfSigned'), 'unchanged public certificate seven fields');
            expectMetadata($r['certificate']['sha256'] === openssl_x509_fingerprint($f['cert'], 'sha256'), 'public digest');
            expectMetadata($r['certificate']['san'] === array('DNS:pbx.test'), 'SAN metadata');
            expectMetadata(strpos(json_encode($r), 'PRIVATE KEY') === false, 'no secret return');
            expectMetadata(!$r['isCa'] && $r['verifiedRoot'] === false
                && $r['certificate']['selfSigned'] === true, 'self-signed leaf is not a root');
        },
        'verifiedRootRequiresCaAndSigningUsage' => function () use ($dir) {
            $root = metadataFixture($dir, true);
            $r = Inspector::describe($root['cert']);
            expectMetadata($r['ok'] && $r['isCa'] && $r['verifiedRoot'] === true, 'verified CA root');
            $noSign = metadataFixture($dir, true, null, 'digitalSignature');
            $r = Inspector::describe($noSign['cert']);
            expectMetadata($r['ok'] && !$r['isCa'] && $r['verifiedRoot'] === false, 'CA without signing usage is not root');
        },
        'sameDnBadSignatureIsNotRoot' => function () use ($dir) {
            $other = metadataFixture($dir, true);
            $f = metadataFixture($dir, true, $other);
            $r = Inspector::describe($f['cert']);
            expectMetadata($r['ok'] && $r['isCa'] && $r['certificate']['subject'] === $r['certificate']['issuer'], 'same DN fixture');
            expectMetadata($r['certificate']['selfSigned'] === false && $r['verifiedRoot'] === false, 'signature, not DN equality');
        },
        'unknownVerificationIsNotRoot' => function () use ($dir) {
            $root = metadataFixture($dir, true);
            $GLOBALS['metadataVerifierUnavailable'] = true;
            try {
                $r = Inspector::describe($root['cert']);
                expectMetadata($r['ok'] && $r['isCa'] && $r['verifiedRoot'] === null
                    && $r['certificate']['selfSigned'] === null, 'unknown CA signature remains unknown');
                $leaf = metadataFixture($dir, false);
                $r = Inspector::describe($leaf['cert']);
                expectMetadata($r['ok'] && !$r['isCa'] && $r['verifiedRoot'] === false, 'unknown leaf signature is not root');
            } finally { $GLOBALS['metadataVerifierUnavailable'] = false; }
        },
        'invalidAndAmbiguousInput' => function () use ($dir) {
            $a = metadataFixture($dir, false); $b = metadataFixture($dir, true);
            foreach (array(null, '', 'garbage', $a['key'], "-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----") as $input) {
                expectMetadataError($input, 'invalid_certificate');
            }
            expectMetadataError($a['cert'] . $b['cert'], 'ambiguous_certificate');
        },
        'expiredMetadataIsDescriptiveNotSuitability' => function () use ($dir) {
            $expired = metadataExpiredFixture(metadataFixture($dir, false));
            $r = Inspector::describe($expired['cert']);
            expectMetadata($r['ok'] && $r['certificate']['notAfter'] < time(), 'expired public metadata remains available');
            $checked = Inspector::inspect($expired['cert'], $expired['key'], 'pbx.test');
            expectMetadata(!$checked['ok'] && $checked['errorCode'] === 'expired', 'describe is not apply validation');
        },
        'unrelatedCaIsNotLinkedChain' => function () use ($dir) {
            $leaf = metadataFixture($dir, false); $unrelated = metadataFixture($dir, true);
            $r = Inspector::describe($unrelated['cert']);
            expectMetadata($r['ok'] && $r['verifiedRoot'] === true, 'standalone root description does not imply linkage');
            $checked = Inspector::inspect($leaf['cert'], $leaf['key'], 'pbx.test', $unrelated['cert']);
            expectMetadata(!$checked['ok'] && $checked['errorCode'] === 'invalid_chain', 'unrelated CA excluded by ordered chain');
        }
    );
    if (isset($argv[1])) {
        expectMetadata(isset($cases[$argv[1]]), 'unknown case selector');
        $cases = array($argv[1] => $cases[$argv[1]]);
    }
    foreach ($cases as $name => $test) {
        try { $test(); echo "PASS $name\n"; }
        catch (Exception $e) { ++$failed; fwrite(STDERR, "FAIL $name: " . $e->getMessage() . "\n"); }
        catch (Error $e) { ++$failed; fwrite(STDERR, "FAIL $name: " . $e->getMessage() . "\n"); }
    }
} finally {
    foreach (glob($dir . '/*') as $file) { unlink($file); }
    rmdir($dir);
}
exit($failed ? 1 : 0);
}
