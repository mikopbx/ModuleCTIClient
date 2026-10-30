<?php
require_once dirname(__DIR__) . '/Lib/SecretConfigWriter.php';
require_once dirname(__DIR__) . '/Lib/RemoteConfigProvisioning.php';
use Modules\ModuleCTIClient\Lib\SecretConfigWriter;
use Modules\ModuleCTIClient\Lib\RemoteConfigProvisioning;
if (PHP_OS_FAMILY === 'Windows' || !isset($argv[1])) {
    echo "SKIP requires isolated Linux monitord binary argument\n";
    exit(0);
}
$binary = realpath($argv[1]);
if ($binary === false || basename($binary) !== 'ctitestmon') { throw new RuntimeException('Expected isolated ctitestmon binary'); }
$dir = sys_get_temp_dir() . '/cti-manager-life-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
foreach (['work','conf','logs','bin'] as $name) { mkdir($dir . '/' . $name, 0700); }
$path = $dir . '/conf/monitord.json';
$config = ['mq'=>['host'=>'127.0.0.1','port'=>'14222'], 'work_dir'=>$dir.'/work',
    'settings_dir'=>$dir.'/conf', 'binary_dir'=>$dir.'/bin', 'log_path'=>$dir.'/logs',
    'bind_address'=>'127.0.0.1', 'period'=>30, 'daemons'=>[], 'manager_token'=>str_repeat('a',64)];
$process = null;
function launchTestMonitor(string $binary, string $path, string $dir) {
    return proc_open(['sh','-c', escapeshellarg($binary).' -c '.escapeshellarg($path).' & wait'],
        [0=>['file','/dev/null','r'],1=>['file',$dir.'/output.log','a'],2=>['file',$dir.'/output.log','a']], $pipes);
}
function managerStatus(string $token): int {
    $curl = curl_init('http://127.0.0.1:8225/manager.api/tunnel/status');
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>1,
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token], CURLOPT_PROXY=>'']);
    curl_exec($curl);
    $code = (int)curl_getinfo($curl,CURLINFO_HTTP_CODE);
    curl_close($curl);
    return $code;
}
function waitManager(string $token): void {
    for ($i=0;$i<50;$i++) { if (managerStatus($token)===200) { return; } usleep(100000); }
    throw new RuntimeException('Monitor did not become ready');
}
try {
    SecretConfigWriter::write($path,$config);
    $process = launchTestMonitor($binary,$path,$dir);
    waitManager(str_repeat('a',64));
    $config['manager_token']=str_repeat('b',64);
    SecretConfigWriter::write($path.'.new',$config);
    exec(RemoteConfigProvisioning::installCommand($path.'.new',$path),$out,$rc);
    if ($rc!==0) { throw new RuntimeException('Install failed'); }
    // Процесс ещё старый, но pending marker сохранён независимо от вызывающего PHP.
    if (managerStatus(str_repeat('b',64))!==401) { throw new RuntimeException('Config unexpectedly live-reloaded'); }
    exec(RemoteConfigProvisioning::applyRestartCommand($path,'ctitestmon'),$out,$rc);
    if ($rc!==0) { throw new RuntimeException('Apply failed'); }
    proc_close($process);
    $process = null;
    $inner = 'exec ' . escapeshellarg($binary) . ' -c ' . escapeshellarg($path)
        . ' >> ' . escapeshellarg($dir . '/output.log') . ' 2>&1 </dev/null';
    exec(RemoteConfigProvisioning::launchCommand($path, 'ctitestmon', $inner), $out, $rc);
    if ($rc !== 0) { throw new RuntimeException('Production launch command failed'); }
    waitManager(str_repeat('b',64));
    // Detached daemon не должен удерживать lock; повторный launch быстро завершается.
    exec('timeout 3 sh -c ' . escapeshellarg(RemoteConfigProvisioning::launchCommand($path, 'ctitestmon', $inner)), $out, $rc);
    if ($rc !== 0) { throw new RuntimeException('Detached process retained lock'); }
    if (managerStatus(str_repeat('a',64))!==401) { throw new RuntimeException('Old token accepted'); }
    echo "PASS ManagerLifecycle\n";
} finally {
    exec('pkill -x ctitestmon');
    if (is_resource($process)) { proc_close($process); }
    if (is_dir($dir)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $file) { $file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname()); }
        rmdir($dir);
    }
}
