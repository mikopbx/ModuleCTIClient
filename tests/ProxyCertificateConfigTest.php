<?php
namespace Phalcon\Di { class Injectable {} }
namespace MikoPBX\Common\Models {
    class PbxExtensionModules { static function findFirstByUniqid($id) { return false; } }
    class PbxSettings { static function getValueByKey($key) { if ($key === 'PBXName') { throw new \RuntimeException('F3 old hostname caller'); } return '80'; } }
}
namespace MikoPBX\Core\System {
    class Util { static function mwMkdir($d) { if (!is_dir($d)) { mkdir($d, 0700, true); } } }
    class MikoPBXConfig { function getGeneralSettings($key) { return 'synthetic-license'; } }
    class Processes { static function mwExec($cmd, &$out = null) { throw new \RuntimeException('unexpected installed process'); } }
}
namespace Modules\ModuleCTIClient\Lib {
    function chmod($p, $mode) {
        $GLOBALS['proxyModeCalls'][$p] = $mode;
        if (!empty($GLOBALS['proxyOwnerFail'])) { return false; }
        return \chmod($p, $mode);
    }
    class PbxCertificateSource { static function read() { ++$GLOBALS['proxySourceReads']; return $GLOBALS['proxySource']; } }
}
namespace {
define('CTI_TLS_TESTING', true);
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});
use Modules\ModuleCTIClient\Lib\CtiTlsPair;
function proxyExpect($v, $m) { if (!$v) { throw new RuntimeException($m); } }
function proxyInvoke($d, $name) { $m = new ReflectionMethod($d, $name); $m->setAccessible(true); $m->invoke($d); }
function proxyRemove($p) {
    if (!is_dir($p) || is_link($p)) { unlink($p); return; }
    foreach (scandir($p) as $f) { if ($f !== '.' && $f !== '..') { proxyRemove($p . '/' . $f); } } rmdir($p);
}
$root = str_replace('\\', '/', sys_get_temp_dir()) . '/cti-proxy-' . bin2hex(openssl_random_pseudo_bytes(8)); mkdir($root, 0700);
$failures = array();
$cases = array('nats-first', 'proxy-first', 'existing-pin', 'legacy', 'corrupt', 'incomplete', 'lock-failure', 'old-gnats', 'missing-crm', 'owner-failure', 'source-changes', 'missing-hostname');
if (isset($argv[1])) { proxyExpect(in_array($argv[1], $cases, true), 'case selector'); $cases = array($argv[1]); }
try {
    foreach ($cases as $case) {
        try {
            $GLOBALS['proxyOwnerFail'] = false; $GLOBALS['proxyModeCalls'] = array(); $GLOBALS['proxySourceReads'] = 0;
            $GLOBALS['proxySource'] = array('state' => 'absent', 'sourceId' => 'fixture');
            $dir = $root . '/' . $case; mkdir($dir, 0700);
            $r = new ReflectionClass('Modules\\ModuleCTIClient\\Lib\\AmigoDaemons'); $d = $r->newInstanceWithoutConstructor(); $dirs = array();
            foreach (array('spoolDir','logDir','pidDir','confDir','binDir','moduleDir') as $name) { $dirs[$name] = $dir . '/' . $name; mkdir($dirs[$name], 0700); }
            $d->dirs = $dirs;
            $property = $r->getProperty('mikoPBXConfig'); $property->setAccessible(true); $property->setValue($d, new \MikoPBX\Core\System\MikoPBXConfig());
            $property = $r->getProperty('module_settings'); $property->setAccessible(true);
            $property->setValue($d, array('cti_tls_hostname' => $case === 'missing-hostname' ? '' : 'pbx.test',
                'security_mode' => $case === 'legacy' ? 'legacy_compatible' : 'strict', 'debug_mode' => 0,
                'nats_password' => str_repeat('a', 64), 'auto_settings_mode' => 1, 'saaskey' => 'synthetic'));
            // One checked pair through the real selector: generated into the fresh protected slot (<confDir>/tls/cti.*).
            $paths = CtiTlsPair::paths($dirs['moduleDir'], $dirs['confDir']); $ssl = $dirs['confDir'] . '/tls';
            $absent = function () { return array('state' => 'absent', 'sourceId' => 'fixture'); };
            $oldDir = $dirs['moduleDir'] . '/etc/ssl'; mkdir($oldDir, 0700, true);
            $oldCert = $oldDir . '/proxyserver.pem'; $oldKey = $oldDir . '/proxyserver.key';
            file_put_contents($oldCert, 'old-proxy-cert'); file_put_contents($oldKey, 'old-proxy-key');
            if ($case === 'owner-failure') {
                file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'cti-device-v2 /pbx/auth/challenge/confirm allow_legacy_auth legacy_unsigned tls_port https_port security_mode service_users');
                file_put_contents($dirs['binDir'] . '/crmd', 'security_mode device enrollment required PIN authentication rate limit exceeded unknown security_mode');
                $GLOBALS['proxyOwnerFail'] = true;
                $bad = CtiTlsPair::prepare('pbx.test', $paths, $dirs['moduleDir'], $absent);
                proxyExpect(!$bad['ok'] && !is_file($paths['ownCert']) && !is_file($paths['ownKey']), 'ownership failure cannot publish a pair (no key-only or cert-only leftover)');
                file_put_contents($dirs['confDir'] . '/proxy.json', 'previous-proxy');
                $thrown = false; try { proxyInvoke($d, 'generateProxyConf'); } catch (RuntimeException $e) { $thrown = true; }
                proxyExpect($thrown && file_get_contents($dirs['confDir'] . '/proxy.json') === 'previous-proxy', 'ownership failure preserves config');
                proxyExpect(file_get_contents($oldCert) === 'old-proxy-cert' && file_get_contents($oldKey) === 'old-proxy-key',
                    'ownership failure leaves both real old independent proxy paths untouched');
                echo "PASS owner-failure\n"; continue;
            }
            $cert = $paths['ownCert']; $key = $paths['ownKey'];
            if ($case === 'lock-failure') { mkdir($ssl, 0755, true); mkdir($key . '.lock', 0700); }
            elseif ($case !== 'missing-hostname') {
                $initial = CtiTlsPair::prepare('pbx.test', $paths, $dirs['moduleDir'], $absent); proxyExpect($initial['ok'] && $initial['certPath'] === $cert && $initial['keyPath'] === $key, json_encode($initial));
            }
            file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'cti-device-v2 /pbx/auth/challenge/confirm allow_legacy_auth legacy_unsigned tls_port https_port security_mode service_users');
            file_put_contents($dirs['binDir'] . '/crmd', 'security_mode device enrollment required PIN authentication rate limit exceeded unknown security_mode');
            if ($case === 'old-gnats') { file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'security_mode tls_port https_port'); }
            if ($case === 'missing-crm') { unlink($dirs['binDir'] . '/crmd'); }
            if ($case === 'corrupt') { file_put_contents($cert, 'corrupt-existing-identity'); }
            if ($case === 'incomplete') { unlink($key); }
            if ($case === 'owner-failure') { $GLOBALS['proxyOwnerFail'] = true; }
            $beforeCert = is_file($cert) ? file_get_contents($cert) : null; $beforeKey = is_file($key) ? file_get_contents($key) : null;
            $proxyPath = $dirs['confDir'] . '/proxy.json'; $natsPath = $dirs['confDir'] . '/nats.conf';
            file_put_contents($proxyPath, 'previous-proxy'); file_put_contents($natsPath, 'previous-nats');
            $denied = in_array($case, array('corrupt','incomplete','lock-failure','old-gnats','missing-crm','owner-failure','missing-hostname'), true);
            $thrown = false;
            try {
                if ($case === 'nats-first' || $case === 'source-changes') { proxyInvoke($d, 'generateNatsConf'); }
                if ($case === 'source-changes') { $GLOBALS['proxySource'] = array('state' => 'error', 'errorCode' => 'source_unreadable'); }
                proxyInvoke($d, 'generateProxyConf');
            } catch (RuntimeException $e) { $thrown = true; }
            if ($denied) { proxyExpect($thrown && file_get_contents($proxyPath) === 'previous-proxy'
                && file_get_contents($natsPath) === 'previous-nats', 'unsafe TLS/binary/hostname published config'); }
            else {
                proxyExpect(!$thrown, 'valid proxy refused'); $proxy = json_decode(file_get_contents($proxyPath), true);
                proxyExpect($proxy['proto'] === 'https' && $proxy['port'] === ':8002' && $proxy['pem'] === $cert && $proxy['key'] === $key, 'proxy shared prepared paths');
                proxyInvoke($d, 'generateNatsConf'); proxyInvoke($d, 'generateProxyConf');
                $nats = file_get_contents($natsPath);
                proxyExpect(preg_match('/tls \{ cert_file: "([^"]+)"; key_file: "([^"]+)" \}/', $nats, $tlsPaths)
                    && $tlsPaths[1] === $cert && $tlsPaths[2] === $key && strpos($nats, 'https_port: 8298') !== false
                    && strpos($nats, 'tls_port: 4228') !== false, 'three endpoint same snapshot');
                proxyExpect(openssl_x509_check_private_key(file_get_contents($cert), file_get_contents($key)), 'stable valid pair');
                if (DIRECTORY_SEPARATOR === '/') { proxyExpect((fileperms($key) & 0777) === 0600 && (fileperms($cert) & 0777) === 0644, 'POSIX protected copies (public cert 0644, key 0600)'); }
                proxyExpect($GLOBALS['proxySourceReads'] === 0, 'a healthy installed pair never re-reads the PBX source');
            }
            proxyExpect((is_file($cert) ? file_get_contents($cert) : null) === $beforeCert && (is_file($key) ? file_get_contents($key) : null) === $beforeKey, 'no silent replacement of bad/existing pair, no new leftovers');
            proxyExpect(file_get_contents($oldCert) === 'old-proxy-cert'
                && file_get_contents($oldKey) === 'old-proxy-key', 'both old independent proxy certificate/key paths untouched');
            echo "PASS $case\n";
        } catch (Exception $e) { $failures[] = $case . ': ' . $e->getMessage(); echo "FAIL " . end($failures) . "\n"; }
        finally { $GLOBALS['proxyOwnerFail'] = false; }
    }
} finally { proxyRemove($root); }
if ($failures) { exit(1); }
echo "PASS ProxyCertificateConfig\n";
}
