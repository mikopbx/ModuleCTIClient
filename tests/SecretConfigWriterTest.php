<?php
require_once dirname(__DIR__) . '/Lib/SecretConfigWriter.php';
use Modules\ModuleCTIClient\Lib\SecretConfigWriter;
$dir = sys_get_temp_dir() . '/cti-secret-config-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
$mask = umask(0022);
try {
    $path = $dir . '/monitord.json';
    foreach (['first', 'replacement'] as $token) {
        SecretConfigWriter::write($path, ['manager_token' => $token]);
        clearstatcache(true, $path);
        if (json_decode(file_get_contents($path), true) !== ['manager_token' => $token]) {
            throw new RuntimeException('Incomplete config');
        }
        if (PHP_OS_FAMILY !== 'Windows' && (fileperms($path) & 0777) !== 0600) {
            throw new RuntimeException('Unsafe config mode');
        }
        if (count(glob($dir . '/*')) !== 1 || count(glob($dir . '/.cti-secret-*')) !== 0) {
            throw new RuntimeException('Temporary file leaked');
        }
    }
    $failed = false;
    try { SecretConfigWriter::write($path, ['invalid' => fopen(__FILE__, 'r')]); }
    catch (RuntimeException $e) { $failed = true; }
    if (!$failed || json_decode(file_get_contents($path), true) !== ['manager_token' => 'replacement']) {
        throw new RuntimeException('Encoding failure destroyed previous config');
    }
    echo "PASS SecretConfigWriter\n";
} finally {
    umask($mask);
    foreach (array_merge(glob($dir . '/*'), glob($dir . '/.cti-secret-*')) as $file) { unlink($file); }
    rmdir($dir);
}
