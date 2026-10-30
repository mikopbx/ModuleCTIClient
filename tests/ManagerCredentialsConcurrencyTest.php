<?php
require_once dirname(__DIR__) . '/Lib/ManagerCredentials.php';
use Modules\ModuleCTIClient\Lib\ManagerCredentials;
if (isset($argv[1]) && $argv[1] === '--child') {
    echo ManagerCredentials::loadOrCreate($argv[2]);
    exit(0);
}
$dir = sys_get_temp_dir() . '/cti-token-concurrent-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
$children = [];
try {
    for ($i = 0; $i < 8; $i++) {
        $pipes = [];
        $process = proc_open([PHP_BINARY, __FILE__, '--child', $dir],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) { throw new RuntimeException('Cannot start child'); }
        fclose($pipes[0]);
        $children[] = [$process, $pipes];
    }
    $tokens = [];
    foreach ($children as [$process, $pipes]) {
        $token = stream_get_contents($pipes[1]);
        $error = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        if (proc_close($process) !== 0 || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            throw new RuntimeException('Child failed: ' . $error);
        }
        $tokens[] = $token;
    }
    if (count(array_unique($tokens)) !== 1) { throw new RuntimeException('Different first-load tokens'); }
    if (ManagerCredentials::loadOrCreate($dir) !== $tokens[0]) { throw new RuntimeException('Stored token differs'); }
    echo "PASS ManagerCredentialsConcurrency\n";
} finally {
    foreach (glob($dir . '/*') as $file) { unlink($file); }
    rmdir($dir);
}
