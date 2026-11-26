<?php
namespace Modules\ModuleCTIClient\Lib {
    // Барьер после проверки путей: без блокировки оба процесса начинают генерацию.
    function openssl_pkey_new($options) {
        $dir = $GLOBALS['tlsConcurrencyDir'];
        $id = $GLOBALS['tlsConcurrencyId'];
        file_put_contents($dir . '/entered-' . $id, '1');
        $until = microtime(true) + 12;
        while (!is_file($dir . '/release')) {
            if (microtime(true) > $until) { throw new \RuntimeException('Generation barrier timed out'); }
            usleep(10000); clearstatcache();
        }
        return \openssl_pkey_new($options);
    }
}
namespace {
require dirname(__DIR__) . '/Lib/TlsCertificate.php';
use Modules\ModuleCTIClient\Lib\TlsCertificate;
if (!extension_loaded('openssl')) { echo "SKIP TLS concurrency requires OpenSSL\n"; exit(0); }
if (isset($argv[1]) && $argv[1] === 'worker') {
    $dir = $argv[2]; $id = $argv[3];
    $GLOBALS['tlsConcurrencyDir'] = $dir; $GLOBALS['tlsConcurrencyId'] = $id;
    file_put_contents($dir . '/started-' . $id, '1');
    $ok = TlsCertificate::ensure($dir . '/server.crt', $dir . '/server.key', 'pbx.test');
    $cert = is_file($dir . '/server.crt') ? file_get_contents($dir . '/server.crt') : '';
    $key = is_file($dir . '/server.key') ? file_get_contents($dir . '/server.key') : '';
    file_put_contents($dir . '/result-' . $id . '.tmp', json_encode(array(
        'ok' => $ok, 'cert' => hash('sha256', $cert), 'key' => hash('sha256', $key),
        'matches' => $cert !== '' && $key !== '' && @openssl_x509_check_private_key($cert, $key)
    )));
    rename($dir . '/result-' . $id . '.tmp', $dir . '/result-' . $id);
    exit($ok ? 0 : 2);
}
function awaitTlsFile($path, $seconds) {
    $until = microtime(true) + $seconds;
    do {
        clearstatcache();
        if (is_file($path)) { return true; }
        usleep(10000);
    } while (microtime(true) < $until);
    return false;
}
function startTlsCreator($dir, $id) {
    $command = escapeshellarg(PHP_BINARY);
    // В установленном Windows CLI OpenSSL включён только параметрами текущего процесса.
    if (DIRECTORY_SEPARATOR === '\\' && is_file(ini_get('extension_dir') . '/php_openssl.dll')) {
        $command .= ' -d ' . escapeshellarg('extension_dir=' . ini_get('extension_dir')) . ' -d extension=openssl';
    }
    $command .= ' ' . escapeshellarg(__FILE__) . ' worker ' . escapeshellarg($dir) . ' ' . escapeshellarg($id);
    $process = proc_open($command, array(
        0 => array('pipe', 'r'),
        1 => array('file', $dir . '/stdout-' . $id, 'a'),
        2 => array('file', $dir . '/stderr-' . $id, 'a')
    ), $pipes);
    if (!is_resource($process)) { throw new RuntimeException('Cannot start competing creator'); }
    fclose($pipes[0]);
    return $process;
}
$dir = sys_get_temp_dir() . '/cti-tls-concurrent-' . uniqid(); mkdir($dir, 0700);
$processes = array();
try {
    $processes[] = startTlsCreator($dir, 'a');
    if (!awaitTlsFile($dir . '/entered-a', 5)) { throw new RuntimeException('First creator did not reach generation'); }
    $processes[] = startTlsCreator($dir, 'b');
    if (!awaitTlsFile($dir . '/started-b', 5)) { throw new RuntimeException('Second creator did not start'); }
    $secondGenerated = awaitTlsFile($dir . '/entered-b', 1);
    file_put_contents($dir . '/release', '1');
    if (!awaitTlsFile($dir . '/result-a', 12) || !awaitTlsFile($dir . '/result-b', 12)) {
        throw new RuntimeException('Competing creators did not finish');
    }
    $a = json_decode(file_get_contents($dir . '/result-a'), true);
    $b = json_decode(file_get_contents($dir . '/result-b'), true);
    $cert = file_get_contents($dir . '/server.crt'); $key = file_get_contents($dir . '/server.key');
    $failures = array();
    if ($secondGenerated) { $failures[] = 'Both creators entered generation before first publication'; }
    if (!$a['ok'] || !$b['ok'] || !$a['matches'] || !$b['matches']) { $failures[] = 'A successful creator was invalidated or final pair mismatched'; }
    if ($a['cert'] !== $b['cert'] || $a['key'] !== $b['key']
        || $a['cert'] !== hash('sha256', $cert) || $a['key'] !== hash('sha256', $key)) {
        $failures[] = 'Published certificate/key identity changed after success';
    }
    if (!openssl_x509_check_private_key($cert, $key)) { $failures[] = 'Final certificate/key pair does not match'; }
    if ($failures) { throw new RuntimeException(implode('; ', $failures)); }
    echo "PASS TlsCertificateConcurrency: competing processes reuse one stable matching publication\n";
} finally {
    // Не удаляем стабильный lock до завершения обоих процессов.
    if (!is_file($dir . '/release')) { file_put_contents($dir . '/release', '1'); }
    foreach ($processes as $process) {
        $until = microtime(true) + 3;
        do { $status = proc_get_status($process); if (!$status['running']) { break; } usleep(10000); } while (microtime(true) < $until);
        if ($status['running']) { proc_terminate($process); }
        proc_close($process);
    }
    foreach (glob($dir . '/*') as $file) { unlink($file); }
    rmdir($dir);
}
}
