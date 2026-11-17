<?php
namespace Phalcon\Di { class Injectable {} }
namespace MikoPBX\Common\Models {
    class PbxExtensionModules { static function findFirstByUniqid($id) { return false; } }
    class PbxSettings { static function getValueByKey($key) { return $key === 'PBXName' ? 'pbx.test' : '80'; } }
}
namespace MikoPBX\Core\System {
    class Util { static function mwMkdir($dir) { if (!is_dir($dir)) { mkdir($dir, 0700, true); } } }
    class MikoPBXConfig { function getGeneralSettings($key) { return 'synthetic-license'; } }
}
namespace {
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});
$r = new ReflectionClass('Modules\\ModuleCTIClient\\Lib\\AmigoDaemons');
$d = $r->newInstanceWithoutConstructor();
$dir = sys_get_temp_dir() . '/cti-generator-' . uniqid(); mkdir($dir, 0700);
$dirs = array();
foreach (array('spoolDir','logDir','pidDir','confDir','binDir','moduleDir') as $key) { $dirs[$key] = $dir . '/' . $key; mkdir($dirs[$key], 0700); }
$d->dirs = $dirs;
$p = $r->getProperty('mikoPBXConfig'); $p->setAccessible(true); $p->setValue($d, new \MikoPBX\Core\System\MikoPBXConfig());
function invokeGenerator($object, $name) { $m = new ReflectionMethod($object, $name); $m->setAccessible(true); $m->invoke($object); }
function setGeneratorSettings($object, $settings) { $p = new ReflectionProperty($object, 'module_settings'); $p->setAccessible(true); $p->setValue($object, $settings); }
$markers = array(
    'gnatsd-cti' => 'cti-device-v2 /pbx/auth/challenge/confirm allow_legacy_auth legacy_unsigned tls_port https_port security_mode service_users',
    'crmd' => 'security_mode device enrollment required PIN authentication rate limit exceeded unknown security_mode'
);
$failures = array();
try {
    foreach (array('missing-gnats','old-gnats','partial-gnats','old-crm','tls-failure','strict-ok','legacy-ok') as $case) {
        foreach ($markers as $binary => $data) { file_put_contents($dirs['binDir'] . '/' . $binary, $data); }
        if ($case === 'missing-gnats') { unlink($dirs['binDir'] . '/gnatsd-cti'); }
        if ($case === 'old-gnats') { file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'security_mode tls_port service_users'); }
        if ($case === 'partial-gnats') { file_put_contents($dirs['binDir'] . '/gnatsd-cti', str_replace('cti-device-v2', '', $markers['gnatsd-cti'])); }
        if ($case === 'old-crm') { file_put_contents($dirs['binDir'] . '/crmd', 'security_mode'); }
        $settings = array('security_mode' => $case === 'legacy-ok' ? 'legacy_compatible' : 'strict', 'debug_mode' => 0, 'nats_password' => str_repeat('a', 64), 'auto_settings_mode' => 1, 'web_service_mode' => 0, 'saaskey' => 'synthetic');
        setGeneratorSettings($d, $settings);
        $tlsDir = $dirs['moduleDir'] . '/etc/ssl';
        if (!is_dir($tlsDir)) { mkdir($tlsDir, 0700, true); }
        foreach (glob($tlsDir . '/*') as $file) { unlink($file); }
        if ($case === 'tls-failure') { file_put_contents($tlsDir . '/gnatsd.crt', 'invalid'); file_put_contents($tlsDir . '/gnatsd.key', 'invalid'); }
        $nats = $dirs['confDir'] . '/nats.conf'; $crm = $dirs['confDir'] . '/crm.json';
        file_put_contents($nats, 'previous-nats'); file_put_contents($crm, 'previous-crm');
        $denied = !in_array($case, array('strict-ok','legacy-ok'), true) || !extension_loaded('openssl');
        $thrown = false;
        try { invokeGenerator($d, 'generateNatsConf'); } catch (\RuntimeException $e) { $thrown = true; }
        if ($denied) {
            if (!$thrown || file_get_contents($nats) !== 'previous-nats' || file_get_contents($crm) !== 'previous-crm') { $failures[] = "$case: published incompatible config or did not fail"; }
            continue;
        }
        if ($thrown) { $failures[] = "$case: valid config refused"; continue; }
        invokeGenerator($d, 'generateCrmdConf');
        $text = file_get_contents($nats); $json = json_decode(file_get_contents($crm), true);
        if (!isset($json['security_mode']) || $json['security_mode'] !== $settings['security_mode']) { $failures[] = "$case: CRM mode missing/wrong"; }
        if (strpos($text, 'security_mode: "' . $settings['security_mode'] . '"') === false) { $failures[] = "$case: NATS mode wrong"; }
        if ($case === 'strict-ok') {
            foreach (array('allow_legacy_auth: false', 'legacy_unsigned: false', 'https_port: 8298', 'tls_port: 4228') as $required) {
                if (strpos($text, $required) === false) { $failures[] = "$case: missing $required"; }
            }
        }
    }
    // Изолированный генератор CRM также обязан отказать старому бинарнику.
    setGeneratorSettings($d, array('security_mode' => 'strict', 'debug_mode' => 0, 'web_service_mode' => 0));
    file_put_contents($dirs['binDir'] . '/crmd', 'old'); file_put_contents($crm, 'previous-crm');
    $thrown = false;
    try { invokeGenerator($d, 'generateCrmdConf'); } catch (\RuntimeException $e) { $thrown = true; }
    if (!$thrown || file_get_contents($crm) !== 'previous-crm') { $failures[] = 'CRM standalone readiness bypass'; }
    if ($failures) { throw new \Exception(implode("\n", $failures)); }
    if (!extension_loaded('openssl')) { echo "SKIP TLS success/config flags assertions: OpenSSL unavailable; fail-closed cases executed
"; }
    echo "PASS StrictConfig actual NATS/CRM generators, strict/legacy, old binary, TLS failure preservation\n";
} finally {
    $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $file) { $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname()); }
    rmdir($dir);
}
}
