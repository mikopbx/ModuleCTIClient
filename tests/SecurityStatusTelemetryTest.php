<?php
// Тест SecurityStatus::readTelemetry (S-15). Запуск: php tests/SecurityStatusTelemetryTest.php
// Поднимает дочерний PHP-процесс (файл во временном каталоге) с HTTP-эндпоинтом /varz.
declare(strict_types=1);

require_once __DIR__ . '/../Lib/SecurityStatus.php';

use Modules\ModuleCTIClient\Lib\SecurityStatus;

$failures = 0;
function check(string $name, $actual, $expected): void
{
    global $failures;
    if ($actual === $expected) {
        echo "PASS: {$name}\n";
    } else {
        $failures++;
        echo 'FAIL: ' . $name . ' expected=' . var_export($expected, true)
            . ' actual=' . var_export($actual, true) . "\n";
    }
}

$port = 18222;
$body = json_encode([
    'server_id' => 'test',
    'cti' => [
        'mode' => 'legacy_compatible',
        'legacy_connects_total' => 7,
        'service_connects_total' => 5,
        'legacy_connections' => 2,
    ],
]);

// Дочерний скрипт: принимает одно соединение, отдаёт JSON /varz.
$childFile = tempnam(sys_get_temp_dir(), 'cti-tel-child-') . '.php';
file_put_contents($childFile, '<?php
$s = stream_socket_server("tcp://127.0.0.1:' . $port . '", $e, $m) or exit(1);
$c = stream_socket_accept($s, 5);
if ($c !== false) {
    fread($c, 4096);
    $b = ' . var_export($body, true) . ';
    fwrite($c, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " . strlen($b) . "\r\n\r\n" . $b);
    fclose($c);
}
');

$proc = proc_open('php ' . escapeshellarg($childFile), [], $pipes);
if (!is_resource($proc)) {
    echo "SKIP: cannot start child http process\n";
    exit(0);
}
usleep(300000);

$result = SecurityStatus::readTelemetry("http://127.0.0.1:{$port}/varz");
check('valid cti parsed: total', is_array($result) ? ($result['legacy_connects_total'] ?? null) : null, 7);
check('valid cti parsed: mode', is_array($result) ? ($result['mode'] ?? null) : null, 'legacy_compatible');
check('valid cti parsed: current', is_array($result) ? ($result['legacy_connections'] ?? null) : null, 2);

// Недоступный эндпоинт → null
check('unreachable -> null', SecurityStatus::readTelemetry('http://127.0.0.1:1/varz'), null);

proc_terminate($proc);
proc_close($proc);
@unlink($childFile);

if ($failures > 0) {
    echo "\n{$failures} failure(s)\n";
    exit(1);
}
echo "\nAll tests passed\n";
