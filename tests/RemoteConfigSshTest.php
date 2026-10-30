<?php
// Только локальный WSL-стенд: фиксированный loopback SSH, ключ тестового пользователя.
require_once dirname(__DIR__) . '/Lib/RemoteConfigProvisioning.php';
use Modules\ModuleCTIClient\Lib\RemoteConfigProvisioning;
if (PHP_OS_FAMILY === 'Windows' || getenv('CTI_LOCAL_SSH_TEST') !== '1') {
    echo "SKIP isolated SSH opt-in required\n"; exit(0);
}
$home=getenv('HOME');
$ssh='ssh -p 22222 -i '.escapeshellarg($home.'/.ssh/cti-test').' -o BatchMode=yes -o StrictHostKeyChecking=yes 127.0.0.1 ';
$scp='scp -P 22222 -i '.escapeshellarg($home.'/.ssh/cti-test').' -o BatchMode=yes -o StrictHostKeyChecking=yes ';
$dir=sys_get_temp_dir().'/cti-ssh-'.bin2hex(random_bytes(8));
mkdir($dir,0700);
function sshRun(string $prefix,string $command): array {
    exec($prefix.escapeshellarg($command).' 2>&1',$out,$rc);
    if($rc!==0){throw new RuntimeException('SSH command failed: '.implode("\n",$out));} return $out;
}
try {
    $remote=$dir.'/remote/monitord.json';
    sshRun($ssh,'umask 022; '.RemoteConfigProvisioning::secureDirectoryCommand(dirname($remote)));
    foreach(['first','replacement'] as $value){
        file_put_contents($dir.'/source.json',json_encode(['manager_token'=>$value]));
        chmod($dir.'/source.json',0644);
        $temporary=RemoteConfigProvisioning::temporaryPath($remote);
        exec($scp.escapeshellarg($dir.'/source.json').' '.escapeshellarg('127.0.0.1:'.$temporary).' 2>&1',$out,$rc);
        if($rc!==0){throw new RuntimeException('SCP failed');}
        sshRun($ssh,RemoteConfigProvisioning::installCommand($temporary,$remote));
        $mode=sshRun($ssh,'stat -c %a '.escapeshellarg($remote));
        if($mode!==['600']){throw new RuntimeException('Remote mode not 600');}
        if(json_decode(file_get_contents($remote),true)!==['manager_token'=>$value]){throw new RuntimeException('Wrong remote content');}
    }
    echo "PASS RemoteConfigSsh\n";
} finally {
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($it as $file){$file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname());} rmdir($dir);
}
