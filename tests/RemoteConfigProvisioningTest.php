<?php
require_once dirname(__DIR__) . '/Lib/RemoteConfigProvisioning.php';
use Modules\ModuleCTIClient\Lib\RemoteConfigProvisioning;
if (PHP_OS_FAMILY === 'Windows') {
    echo "SKIP POSIX provisioning test\n";
    exit(0);
}
$dir = sys_get_temp_dir() . '/cti-provision-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
$old = umask(0022);
try {
    $one = RemoteConfigProvisioning::temporaryPath($dir . '/monitord.json');
    $two = RemoteConfigProvisioning::temporaryPath($dir . '/monitord.json');
    if ($one === $two || dirname($one) !== $dir || dirname($two) !== $dir) {
        throw new RuntimeException('Upload paths collide or leave config filesystem');
    }
    $conf = $dir . '/conf';
    exec(RemoteConfigProvisioning::secureDirectoryCommand($conf), $out, $rc);
    if ($rc !== 0 || (fileperms($conf) & 0777) !== 0700) { throw new RuntimeException('Directory mode'); }
    $temp = $conf . '/monitord.json.new';
    $final = $conf . '/monitord.json';
    file_put_contents($temp, '{"manager_token":"test"}');
    chmod($temp, 0644);
    exec(RemoteConfigProvisioning::installCommand($temp, $final), $out, $rc);
    if ($rc !== 0 || (fileperms($final) & 0777) !== 0600) { throw new RuntimeException('Config mode'); }
    $marker = $conf . '/.manager-restart-required';
    if (!file_exists($marker)) { throw new RuntimeException('Restart marker missing after install'); }
    // Повторный проход без новой загрузки всё равно обязан видеть pending restart.
    exec(RemoteConfigProvisioning::pendingRestartCommand($final), $pending, $rc);
    if ($rc !== 0) { throw new RuntimeException('Pending restart lost'); }
    // Отдельный короткий процесс: не затрагиваем процессы monitord или рабочий VPS.
    $binary = $dir . '/ctitestmon';
    copy('/bin/sleep', $binary);
    chmod($binary, 0700);
    $process = proc_open(['sh', '-c', escapeshellarg($binary) . ' 60 & wait'], [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes);
    if (!is_resource($process)) { throw new RuntimeException('Cannot launch test process'); }
    foreach ($pipes as $pipe) { fclose($pipe); }
    usleep(100000);
    exec(RemoteConfigProvisioning::applyRestartCommand($final, 'ctitestmon'), $output, $rc);
    clearstatcache(true, $marker);
    $status = proc_get_status($process);
    if ($rc !== 0 || file_exists($marker) || $status['running']) {
        proc_terminate($process);
        throw new RuntimeException('Pending restart not applied');
    }
    proc_close($process);
    unlink($binary);
    echo "PASS RemoteConfigProvisioning\n";
} finally {
    umask($old);
    if (isset($process) && is_resource($process)) { proc_terminate($process); proc_close($process); }
    if (isset($binary) && file_exists($binary)) { unlink($binary); }
    foreach (array_merge(glob($dir . '/conf/*'), glob($dir . '/conf/.manager-*')) as $file) { unlink($file); }
    if (is_dir($dir . '/conf')) { rmdir($dir . '/conf'); }
    rmdir($dir);
}
