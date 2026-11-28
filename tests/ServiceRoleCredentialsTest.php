<?php
// Ролевые креды демонов/модуля для HTTP API gnatsd.
// Запуск: php tests/ServiceRoleCredentialsTest.php
namespace Phalcon\Di { class Injectable {} }
namespace MikoPBX\Core\System {
    class Util { static function mwMkdir($dir) { if (!is_dir($dir)) { mkdir($dir, 0700, true); } } }
}
namespace {
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});

use Modules\ModuleCTIClient\Lib\ServiceRoleCredentials;

$failures = array();
$nats = str_repeat('a', 64);

// Роли и пароли: детерминированы от nats_password, как authd.
foreach (array('crmd', 'amid', 'chats', 'tg', 'max', 'module') as $role) {
    if (!in_array($role, ServiceRoleCredentials::ROLES, true)) { $failures[] = "role $role missing"; }
    if (ServiceRoleCredentials::password($nats, $role) !== hash('sha256', $nats . ':' . $role)) { $failures[] = "pass $role"; }
}
$entries = ServiceRoleCredentials::natsUsersEntries($nats);
foreach (ServiceRoleCredentials::ROLES as $role) {
    $needle = ', ' . $role . ' { pass: "' . hash('sha256', $nats . ':' . $role) . '" }';
    if (strpos($entries, $needle) === false) { $failures[] = "nats.conf entry $role"; }
}
$mq = ServiceRoleCredentials::queue('cti-service:t@127.0.0.1', '4222', $nats, 'crmd');
if ($mq !== array('host' => 'cti-service:t@127.0.0.1', 'port' => '4222', 'user' => 'crmd',
        'password' => hash('sha256', $nats . ':crmd'))) { $failures[] = 'queue block'; }
if (isset(ServiceRoleCredentials::queue('h', '4222', '', 'crmd')['user'])) { $failures[] = 'empty nats_password must omit user'; }
if (ServiceRoleCredentials::moduleUserPwd($nats) !== 'module:' . hash('sha256', $nats . ':module')) { $failures[] = 'module userpwd'; }
if (ServiceRoleCredentials::moduleUserPwd('') !== null) { $failures[] = 'module userpwd empty'; }

// Генераторы демонов (без TLS) пишут mq.user/mq.password своей роли.
$r = new ReflectionClass('Modules\\ModuleCTIClient\\Lib\\AmigoDaemons');
$d = $r->newInstanceWithoutConstructor();
$dir = sys_get_temp_dir() . '/cti-roles-' . uniqid(); mkdir($dir, 0700);
$dirs = array();
foreach (array('spoolDir','logDir','pidDir','confDir','binDir','moduleDir') as $key) { $dirs[$key] = $dir . '/' . $key; mkdir($dirs[$key], 0700); }
$d->dirs = $dirs;
$p = new ReflectionProperty($d, 'module_settings'); $p->setAccessible(true);
$p->setValue($d, array('security_mode' => 'legacy_compatible', 'debug_mode' => 0, 'web_service_mode' => 0, 'nats_password' => $nats));
try {
    foreach (array('generateCrmdConf' => array('crm.json', 'crmd'), 'generateChatsConf' => array('chats.json', 'chats'),
                 'generateTelegramConf' => array('tg.json', 'tg'), 'generateMaxConf' => array('max.json', 'max')) as $method => $spec) {
        $m = new ReflectionMethod($d, $method); $m->setAccessible(true); $m->invoke($d);
        $json = json_decode((string)@file_get_contents($dirs['confDir'] . '/' . $spec[0]), true);
        $role = $spec[1];
        if (($json['mq']['user'] ?? null) !== $role || ($json['mq']['password'] ?? null) !== hash('sha256', $nats . ':' . $role)) {
            $failures[] = "$method: mq.user/mq.password роли $role";
        }
        if (strpos((string)($json['mq']['host'] ?? ''), 'cti-service:') !== 0) { $failures[] = "$method: NATS identity changed"; }
    }
} finally {
    $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $file) { $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname()); }
    rmdir($dir);
}

// Источник: nats.conf, amid, VPS-мессенджеры, forward 8222 и чтения статуса используют роли.
$src = file_get_contents(dirname(__DIR__) . '/Lib/AmigoDaemons.php');
foreach (array(
    "ServiceRoleCredentials::natsUsersEntries(\$natsPassword)" => 'nats.conf service_users roles',
    "\$this->getServiceRoleQueue(self::SERVICE_AMI)" => 'amid mq role',
    "\$this->getServiceRoleQueue(\$service)" => 'remote messenger mq role',
    "'http_allow' => ['/license.api/featureavailable', '/license.api/addtrial']" => '8222 http_allow',
    "CURLOPT_USERPWD" => 'varz Basic',
) as $needle => $name) {
    if (strpos($src, $needle) === false) { $failures[] = "source: $name"; }
}
$ctl = file_get_contents(dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php');
if (strpos($ctl, 'SecurityStatus::readLocal($natsPassword)') === false
    || strpos($ctl, 'SecurityStatus::readTelemetry(null, $natsPassword)') === false) {
    $failures[] = 'controller passes nats_password to status reads';
}

if ($failures) { echo 'FAIL: ' . implode("\nFAIL: ", $failures) . "\n"; exit(1); }
echo "PASS ServiceRoleCredentials roles, daemon mq.user/mq.password, http_allow, status Basic\n";
}
