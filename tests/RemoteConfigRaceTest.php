<?php
require_once dirname(__DIR__) . '/Lib/RemoteConfigProvisioning.php';
use Modules\ModuleCTIClient\Lib\RemoteConfigProvisioning;
if (PHP_OS_FAMILY === 'Windows') { echo "SKIP POSIX race\n"; exit(0); }
$dir = sys_get_temp_dir() . '/cti-race-' . bin2hex(random_bytes(8));
mkdir($dir,0700);
mkdir($dir.'/bin',0700);
$final=$dir.'/monitord.json';
file_put_contents($final,'A');
file_put_contents($final.'.new','B');
// PATH-обёртка останавливает реальную установку после создания marker.
file_put_contents($dir.'/bin/touch', "#!/bin/sh\n/usr/bin/touch \"\$@\"\n/usr/bin/touch ".escapeshellarg($dir.'/ready')."\nwhile ! test -f ".escapeshellarg($dir.'/release')."; do sleep 0.02; done\n");
chmod($dir.'/bin/touch',0700);
$install=null; $apply=null;
function startRaceCommand(string $command,string $dir) {
    return proc_open(['sh','-c',$command], [0=>['file','/dev/null','r'],1=>['file',$dir.'/out','a'],2=>['file',$dir.'/out','a']],$pipes);
}
try {
    $install=startRaceCommand('export PATH='.escapeshellarg($dir.'/bin').':$PATH; '.RemoteConfigProvisioning::installCommand($final.'.new',$final),$dir);
    for($i=0;$i<100 && !file_exists($dir.'/ready');$i++){usleep(20000);clearstatcache();}
    if(!file_exists($dir.'/ready')){throw new RuntimeException('Barrier not reached');}
    $apply=startRaceCommand(RemoteConfigProvisioning::applyRestartCommand($final,'ctiracenone').' && cp '.escapeshellarg($final).' '.escapeshellarg($dir.'/observed'),$dir);
    usleep(200000);
    $early=proc_get_status($apply);
    touch($dir.'/release');
    if(proc_close($install)!==0){throw new RuntimeException('Install failed');} $install=null;
    $applyExit=proc_close($apply); $apply=null;
    if(!$early['running']){throw new RuntimeException('Restart consumed marker before install finished');}
    if($applyExit!==0 || file_get_contents($dir.'/observed')!=='B'){throw new RuntimeException('Recovery did not observe B');}
    echo "PASS RemoteConfigRace\n";
} finally {
    touch($dir.'/release');
    foreach([$install,$apply] as $p){if(is_resource($p)){proc_terminate($p);proc_close($p);}}
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($it as $file){$file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname());} rmdir($dir);
}
