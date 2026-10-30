<?php
require_once dirname(__DIR__) . '/Lib/NatsPassword.php';
use Modules\ModuleCTIClient\Lib\NatsPassword;
$calls=0;
if(NatsPassword::ensure('existing',function($value)use(&$calls){$calls++;return true;})!=='existing'||$calls!==0){throw new RuntimeException('Existing secret replaced');}
$stored='';
$value=NatsPassword::ensure('',function($value)use(&$stored){$stored=$value;return true;});
if(!preg_match('/^[a-f0-9]{64}$/D',$value)||$stored!==$value){throw new RuntimeException('Secret not persisted');}
$failed=false;
try{NatsPassword::ensure('',function(){return false;});}catch(RuntimeException $e){$failed=true;}
if(!$failed){throw new RuntimeException('Persistence failure ignored');}
echo "PASS NatsPassword\n";
