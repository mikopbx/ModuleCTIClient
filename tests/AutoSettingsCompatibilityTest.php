<?php
namespace MikoPBX\AdminCabinet\Controllers { class BaseController { public $request; } }
namespace Phalcon\Mvc\Model { class Resultset { const HYDRATE_ARRAYS = 1; } }
namespace MikoPBX\Common\Models {
    class LanInterfaces { static function find($options) { return array(array('ipaddr' => '192.0.2.10')); } }
}
namespace Modules\ModuleCTIClient\Models {
    class ModuleCTIClient { public $nats_password; public $security_mode; }
}
namespace {
require dirname(__DIR__) . '/Lib/SecurityMode.php';
require dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php';
class AutoSettingsRequest { function getServerAddress() { return '192.0.2.10'; } }
$r = new \ReflectionClass('Modules\\ModuleCTIClient\\App\\Controllers\\ModuleCTIClientController');
$c = $r->newInstanceWithoutConstructor(); $c->request = new AutoSettingsRequest();
$m = $r->getMethod('generateAutoSettingsString'); $m->setAccessible(true);
$master = 'synthetic-master-not-for-export';
$fixtures = array();
foreach (array('legacy_compatible', 'strict', '', 'unknown', null) as $mode) {
    $data = new \Modules\ModuleCTIClient\Models\ModuleCTIClient();
    $data->nats_password = $master; $data->security_mode = $mode;
    $encoded = $m->invoke($c, $data);
    $json = base64_decode($encoded, true); $code = json_decode($json, true);
    if (!is_array($code) || $code['pbx'] !== 'mikopbx' || !is_array($code['ipset'])) {
        throw new \Exception('Code structure incompatible');
    }
    if (strpos($json, $master) !== false) { throw new \Exception('Master secret exported'); }
    if ($code['nats_login'] !== '1c-integration'
        || $code['nats_pass'] !== hash('sha256', $master . ':1c-integration')
        || $code['http_key'] !== hash('sha256', $master . ':1c-http')) {
        throw new \Exception('Modern credentials changed');
    }
    if ($mode === 'legacy_compatible') {
        // Поля, которые старый BSL-parser читает без проверки существования.
        if (!isset($code['nats_password']) || $code['nats_password'] !== $code['http_key']) {
            throw new \Exception('Legacy required nats_password field missing or not scoped');
        }
        $fixtures['legacy'] = $encoded;
    } elseif (array_key_exists('nats_password', $code)) {
        throw new \Exception('Legacy field present outside explicit legacy');
    } elseif ($mode === 'strict') { $fixtures['strict'] = $encoded; }
}
// Не заданный параметр модели должен остаться strict по умолчанию.
$data = new \Modules\ModuleCTIClient\Models\ModuleCTIClient(); $data->nats_password = $master;
$code = json_decode(base64_decode($m->invoke($c, $data)), true);
if (array_key_exists('nats_password', $code)) { throw new \Exception('Missing mode enabled legacy'); }
if (isset($argv[1])) {
    file_put_contents($argv[1], json_encode($fixtures));
}
echo "PASS Miko actual autoconfig generator: old contract, scoped alias, strict/unknown/missing, no master\n";
}
