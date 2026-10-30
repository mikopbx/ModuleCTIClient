<?php
require_once dirname(__DIR__) . '/Lib/SecurityMode.php';
use Modules\ModuleCTIClient\Lib\SecurityMode;
foreach ([null,'','strict','unknown'] as $value) {
    if (SecurityMode::normalize($value)!=='strict' || SecurityMode::allowsLegacy($value)) { throw new RuntimeException('Strict must be default'); }
}
if (!SecurityMode::allowsLegacy('legacy_compatible')) { throw new RuntimeException('Explicit compatibility rejected'); }
foreach ([
    ['strict',['allow_legacy_clients'=>'on'],true,'legacy_compatible'],
    ['legacy_compatible',[],true,'strict'],
    ['legacy_compatible',['allow_legacy_clients'=>false],true,'strict'],
    ['legacy_compatible',['allow_legacy_clients'=>''],true,'strict'],
    ['legacy_compatible',['allow_legacy_clients'=>'false'],true,'strict'],
    ['legacy_compatible',['allow_legacy_clients'=>'0'],true,'strict'],
    ['strict',['allow_legacy_clients'=>'legacy_compatible'],true,'legacy_compatible'],
    ['strict',['allow_legacy_clients'=>true],true,'legacy_compatible'],
    ['legacy_compatible',[],false,'legacy_compatible'],
] as [$current,$data,$full,$expected]) {
    if (SecurityMode::fromSubmission($current,$data,$full)!==$expected) { throw new RuntimeException('Submission mapping failed'); }
}
echo "PASS SecurityMode\n";
