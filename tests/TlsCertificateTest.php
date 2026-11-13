<?php
require_once dirname(__DIR__) . '/Lib/TlsCertificate.php';

use Modules\ModuleCTIClient\Lib\TlsCertificate;

// Этап R2 (SC-4): per-install self-signed сертификат для HTTPS/TLS gnatsd.

$fail = function (string $m) { fwrite(STDERR, "FAIL: $m\n"); exit(1); };
if (!extension_loaded('openssl')) { echo "SKIP openssl\n"; exit(0); }

$dir = sys_get_temp_dir() . '/cti-tls-' . bin2hex(random_bytes(4));
mkdir($dir, 0700, true);
$cert = $dir . '/gnatsd.crt';
$key = $dir . '/gnatsd.key';

// Генерация: файлы создаются, ключ 0600.
if (!TlsCertificate::ensure($cert, $key, 'pbx.test.local')) { $fail('ensure() = false'); }
if (!file_exists($cert) || !file_exists($key)) { $fail('files missing'); }
// Права 0600 проверяем только на unix (на Windows chmod не маппится).
if (DIRECTORY_SEPARATOR === '/') {
    $perm = fileperms($key) & 0777;
    if ($perm !== 0600) { $fail("key mode = " . decoct($perm)); }
}

// Сертификат валиден и содержит CN.
$data = openssl_x509_parse(file_get_contents($cert));
if ($data === false) { $fail('cert not parseable'); }
$cn = $data['subject']['CN'] ?? '';
if ($cn !== 'pbx.test.local') { $fail("CN = $cn"); }
if (($data['validTo_time_t'] ?? 0) < time()) { $fail('cert expired'); }

// Ключ соответствует сертификату.
$pubCert = openssl_pkey_get_public(file_get_contents($cert));
$pubKey = openssl_pkey_get_details($pubCert)['key'];
$privDetails = openssl_pkey_get_details(openssl_pkey_get_private(file_get_contents($key)));
if ($pubKey !== $privDetails['key']) { $fail('key/cert mismatch'); }

// Повторный вызов не перезаписывает.
$before = md5_file($cert);
usleep(1100000); // mtime может совпасть — проверяем содержимое
if (!TlsCertificate::ensure($cert, $key, 'other')) { $fail('second ensure() = false'); }
if (md5_file($cert) !== $before) { $fail('existing cert overwritten'); }

// Пустые имена файлов — отказ без падений.
if (TlsCertificate::ensure('', $key, 'x') !== false) { $fail('empty cert path accepted'); }

echo "PASS TlsCertificate\n";
