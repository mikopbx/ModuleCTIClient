<?php
require dirname(__DIR__) . '/Lib/TlsCertificate.php';
use Modules\ModuleCTIClient\Lib\TlsCertificate;
function expectCertificateFailure($ok, $message) { if (!$ok) { throw new RuntimeException($message); } }
$dir = sys_get_temp_dir() . '/cti-tls-failure-' . uniqid(); mkdir($dir, 0700);
$cert = $dir . '/server.crt'; $key = $dir . '/server.key';
try {
    file_put_contents($cert, 'corrupt'); file_put_contents($key, 'corrupt');
    expectCertificateFailure(!TlsCertificate::ensure($cert, $key, 'test'), 'Corrupt existing pair accepted');
    expectCertificateFailure(file_get_contents($key) === 'corrupt', 'Invalid existing key silently replaced');
    unlink($cert);
    expectCertificateFailure(!TlsCertificate::ensure($cert, $key, 'test'), 'Incomplete pair accepted');
    unlink($key);
    expectCertificateFailure(!TlsCertificate::ensure($dir . '/absent/a', $dir . '/absent/b', 'test'), 'Unwritable destination accepted');
    @unlink($key . '.lock'); mkdir($key . '.lock', 0700);
    expectCertificateFailure(!TlsCertificate::ensure($cert, $key, 'test'), 'Unavailable lock accepted');
    expectCertificateFailure(!file_exists($cert) && !file_exists($key), 'Lock failure published TLS files');
    rmdir($key . '.lock');
    if (!extension_loaded('openssl')) {
        expectCertificateFailure(!TlsCertificate::ensure($cert, $key, 'test'), 'Missing OpenSSL accepted');
        echo "PASS TlsCertificateFailure fail-closed without OpenSSL; SKIP cryptographic cases\n";
    } else {
        expectCertificateFailure(TlsCertificate::ensure($cert, $key, 'test'), 'Valid generation failed');
        $other = openssl_pkey_new(array('private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
        openssl_pkey_export($other, $otherKey);
        file_put_contents($key, $otherKey);
        expectCertificateFailure(!TlsCertificate::ensure($cert, $key, 'test'), 'Mismatched existing pair accepted');
        $csr = openssl_csr_new(array('commonName' => 'expired'), $other);
        $expired = openssl_csr_sign($csr, null, $other, 0);
        expectCertificateFailure($expired !== false, 'Expiry fixture generation failed');
        openssl_x509_export($expired, $expiredPem); file_put_contents($cert, $expiredPem);
        $parsed = openssl_x509_parse($expiredPem);
        expectCertificateFailure($parsed['validTo_time_t'] <= time(), 'Expiry fixture not expired');
        expectCertificateFailure(!TlsCertificate::ensure($cert, $key, 'test'), 'Expired pair accepted');
        echo "PASS TlsCertificateFailure corruption/incomplete/mismatch/expiry/write-failure\n";
    }
} finally {
    @unlink($cert); @unlink($key); @unlink($key . '.lock'); rmdir($dir);
}
