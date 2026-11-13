<?php
require_once dirname(__DIR__) . '/Lib/SecurityMode.php';
require_once dirname(__DIR__) . '/Lib/SecurityStatus.php';
use Modules\ModuleCTIClient\Lib\SecurityStatus;
foreach ([
 ['strict',null,'unavailable'],
 ['strict',['mode'=>'legacy_compatible','applied'=>true],'pending'],
 ['strict',['mode'=>'strict','applied'=>true],'applied'],
 ['legacy_compatible',['mode'=>'legacy_compatible','applied'=>true],'applied'],
 ['strict',['mode'=>'unknown','applied'=>true],'unavailable'],
] as [$desired,$reported,$want]) {
 if(SecurityStatus::evaluate($desired,$reported)!==$want){throw new RuntimeException('Applied status mismatch');}
}
echo "PASS SecurityStatus\n";
