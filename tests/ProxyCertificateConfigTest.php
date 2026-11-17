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
use Modules\ModuleCTIClient\Lib\TlsCertificate;
function proxyInvoke($daemon, $name) {
    $method = new ReflectionMethod($daemon, $name); $method->setAccessible(true); $method->invoke($daemon);
}
function proxySettings($daemon, $mode) {
    $property = new ReflectionProperty($daemon, 'module_settings'); $property->setAccessible(true);
    $property->setValue($daemon, array('security_mode' => $mode, 'debug_mode' => 0,
        'nats_password' => str_repeat('a', 64), 'auto_settings_mode' => 1, 'saaskey' => 'synthetic'));
}
$root = sys_get_temp_dir() . '/cti-proxy-cert-' . uniqid(); mkdir($root, 0700);
$failures = array();
$cases = array('nats-first', 'proxy-first', 'existing-pin', 'legacy', 'corrupt', 'incomplete', 'lock-failure', 'old-gnats', 'missing-crm');
try {
    foreach ($cases as $case) {
        $dir = $root . '/' . $case; mkdir($dir, 0700);
        $reflection = new ReflectionClass('Modules\\ModuleCTIClient\\Lib\\AmigoDaemons');
        $daemon = $reflection->newInstanceWithoutConstructor(); $dirs = array();
        foreach (array('spoolDir','logDir','pidDir','confDir','binDir','moduleDir') as $name) {
            $dirs[$name] = $dir . '/' . $name; mkdir($dirs[$name], 0700);
        }
        $daemon->dirs = $dirs;
        $property = $reflection->getProperty('mikoPBXConfig'); $property->setAccessible(true);
        $property->setValue($daemon, new \MikoPBX\Core\System\MikoPBXConfig());
        proxySettings($daemon, $case === 'legacy' ? 'legacy_compatible' : 'strict');
        file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'cti-device-v2 /pbx/auth/challenge/confirm allow_legacy_auth legacy_unsigned tls_port https_port security_mode service_users');
        file_put_contents($dirs['binDir'] . '/crmd', 'security_mode device enrollment required PIN authentication rate limit exceeded unknown security_mode');
        if ($case === 'old-gnats') { file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'security_mode tls_port https_port'); }
        if ($case === 'missing-crm') { unlink($dirs['binDir'] . '/crmd'); }
        $tlsDir = $dirs['moduleDir'] . '/etc/ssl'; mkdir($tlsDir, 0700, true);
        $cert = $tlsDir . '/gnatsd.crt'; $key = $tlsDir . '/gnatsd.key';
        // Старую отдельную личность прокси нельзя выбирать или переписывать.
        $oldDir = $dirs['moduleDir'] . '/etc/ssl';
        if (!is_dir($oldDir)) { mkdir($oldDir, 0700, true); }
        file_put_contents($oldDir . '/proxyserver.pem', 'old-proxy-cert');
        file_put_contents($oldDir . '/proxyserver.key', 'old-proxy-key');
        if ($case === 'existing-pin' && extension_loaded('openssl') && !TlsCertificate::ensure($cert, $key, 'existing-pinned-identity')) {
            throw new RuntimeException('Cannot provision existing-pin fixture');
        }
        if ($case === 'corrupt' || $case === 'incomplete') { file_put_contents($cert, 'corrupt-existing-identity'); }
        if ($case === 'corrupt') { file_put_contents($key, 'corrupt-key'); }
        if ($case === 'lock-failure') { mkdir($key . '.lock', 0700); }
        $beforeCert = is_file($cert) ? file_get_contents($cert) : null;
        $beforeKey = is_file($key) ? file_get_contents($key) : null;
        $proxyPath = $dirs['confDir'] . '/proxy.json'; $natsPath = $dirs['confDir'] . '/nats.conf';
        file_put_contents($proxyPath, 'previous-proxy'); file_put_contents($natsPath, 'previous-nats');
        $denied = !in_array($case, array('nats-first','proxy-first','existing-pin','legacy'), true) || !extension_loaded('openssl');
        $thrown = false;
        try {
            if ($case === 'nats-first' && !$denied) { proxyInvoke($daemon, 'generateNatsConf'); }
            proxyInvoke($daemon, 'generateProxyConf');
        } catch (RuntimeException $error) { $thrown = true; }
        if ($denied) {
            if (!$thrown || file_get_contents($proxyPath) !== 'previous-proxy' || file_get_contents($natsPath) !== 'previous-nats') {
                $failures[] = $case . ': standalone proxy published despite invalid TLS/readiness';
            }
        } elseif ($thrown) {
            $failures[] = $case . ': valid proxy configuration refused';
        } else {
            $proxy = json_decode(file_get_contents($proxyPath), true);
            if ($proxy['proto'] !== 'https' || $proxy['port'] !== ':8002' || $proxy['pem'] !== $cert || $proxy['key'] !== $key) {
                $failures[] = $case . ': proxy uses a different certificate/key path';
            }
            if (!is_file($cert) || !is_file($key)) {
                $failures[] = $case . ': standalone proxy did not prepare shared TLS';
            } else {
                $publishedCert = file_get_contents($cert); $publishedKey = file_get_contents($key);
                proxyInvoke($daemon, 'generateNatsConf');
                proxyInvoke($daemon, 'generateProxyConf');
                $nats = file_get_contents($natsPath);
                if (!preg_match('/tls \{ cert_file: "([^"]+)"; key_file: "([^"]+)" \}/', $nats, $paths)
                    || $paths[1] !== $proxy['pem'] || $paths[2] !== $proxy['key']) {
                    $failures[] = $case . ': actual NATS and proxy configs disagree';
                }
                if ($publishedCert !== file_get_contents($cert) || $publishedKey !== file_get_contents($key)
                    || !openssl_x509_check_private_key($publishedCert, $publishedKey)) {
                    $failures[] = $case . ': shared certificate identity changed or pair mismatched';
                }
                if (DIRECTORY_SEPARATOR === '/') {
                    if ((fileperms($key) & 0777) !== 0600 || (fileperms($cert) & 0777) !== 0640
                        || (fileperms($key . '.lock') & 0777) !== 0600) { $failures[] = $case . ': unsafe shared TLS permissions'; }
                }
            }
        }
        if ($beforeCert !== null && file_get_contents($cert) !== $beforeCert) { $failures[] = $case . ': replaced existing certificate/pin'; }
        if ($beforeKey !== null && file_get_contents($key) !== $beforeKey) { $failures[] = $case . ': replaced existing key'; }
        if (file_get_contents($oldDir . '/proxyserver.pem') !== 'old-proxy-cert' || file_get_contents($oldDir . '/proxyserver.key') !== 'old-proxy-key') {
            $failures[] = $case . ': mutated old independent proxy identity';
        }
    }
    if ($failures) { throw new RuntimeException(implode("\n", $failures)); }
    if (!extension_loaded('openssl')) { echo "SKIP shared TLS success cases: OpenSSL unavailable; fail-closed assertions executed\n"; }
    if (DIRECTORY_SEPARATOR === '\\') { echo "SKIP POSIX shared TLS permission assertions on Windows\n"; }
    echo "PASS ProxyCertificateConfig: actual proxy/NATS configs share validated stable identity, standalone/order/failure coverage\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) { $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname()); }
    rmdir($root);
}
}
