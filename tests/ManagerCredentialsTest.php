<?php
// Запускается отдельно от ядра MikoPBX.
require_once dirname(__DIR__) . '/Lib/ManagerCredentials.php';
use Modules\ModuleCTIClient\Lib\ManagerCredentials;
$dir = sys_get_temp_dir() . '/cti-manager-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
try {
    $first = ManagerCredentials::loadOrCreate($dir);
    $nats = ManagerCredentials::loadOrCreate($dir, 'nats-service');
    if ($nats === $first || strlen($nats) !== 64) { throw new RuntimeException('Service purposes share a token'); }
    if (ManagerCredentials::loadOrCreate($dir, 'nats-service') !== $nats) { throw new RuntimeException('NATS token changed'); }
    if (!preg_match('/^[a-f0-9]{64}$/', $first)) { throw new RuntimeException('Invalid token'); }
    if (ManagerCredentials::loadOrCreate($dir) !== $first) { throw new RuntimeException('Token changed'); }
    if (PHP_OS_FAMILY !== 'Windows' && (fileperms($dir . '/manager.token') & 0777) !== 0600) {
        throw new RuntimeException('Token permissions');
    }
    file_put_contents($dir . '/manager.token', 'corrupted');
    $rejected = false;
    try { ManagerCredentials::loadOrCreate($dir); } catch (RuntimeException $e) { $rejected = true; }
    if (!$rejected) { throw new RuntimeException('Corrupt token accepted'); }
    echo "PASS ManagerCredentials\n";
} finally {
    foreach (glob($dir . '/*') as $file) { unlink($file); }
    rmdir($dir);
}
