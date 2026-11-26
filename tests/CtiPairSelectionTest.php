<?php
// Synthetic fixtures only; no real key, stand or PBX is read. One checked cert/key pair is chosen before any config write
// or stop and reused by NATS/API and the proxy:
//   1. the module's own protected pair (<confDir>/tls/cti.{crt,key}), 2. the previous fixed pair <moduleDir>/etc/ssl/gnatsd.*
//   (read-only, owner-agnostic, never chmod/chown/copied), 3. an eligible PBX HTTPS pair copied into the protected path,
//   4. a generated typed-SAN self-signed leaf. Unreadable/indeterminate/unsupported sources never fall back.
// Windows runs model the actor; the web-owned previous layout is also run as a real nobody actor on POSIX (see the guard).
namespace Phalcon\Di { class Injectable {} }
namespace MikoPBX\Modules { class PbxExtensionUtils { static function isEnabled($id) { return true; } } }
namespace MikoPBX\Common\Models {
    class PbxExtensionModules { static function findFirstByUniqid($id) { return false; } }
    class PbxSettings {
        static function getValueByKey($key) {
            if ($key === 'PBXName') { throw new \RuntimeException('PBXName must never select the CTI address'); }
            return '80';
        }
    }
}
namespace MikoPBX\Core\System {
    class Util { static function mwMkdir($dir, $user = null, $group = null) { if (!is_dir($dir)) { mkdir($dir, 0700, true); } } }
    class MikoPBXConfig { function getGeneralSettings($key) { return 'synthetic-license'; } }
    class Processes {
        static function getPidOfProcess($name) { return ''; }
        static function mwExec($cmd, &$out = null) { throw new \RuntimeException('unexpected process execution'); }
        static function processWorker($path, $args, $service, $action, $log = '', $user = null) {
            $GLOBALS['psProcesses'][] = array($service, $action); return true;
        }
    }
}
namespace Modules\ModuleCTIClient\Lib {
    class PbxCertificateSource { static function read() { ++$GLOBALS['psSourceReads']; return $GLOBALS['psSource']; } }
}
namespace {
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});
use Modules\ModuleCTIClient\Lib\TlsCertificate;

const PS_PENDING = 'Modules\\ModuleCTIClient\\Lib\\CtiTlsSetupPending';
const PS_STAND_IP = '172.16.32.70';
function psExpect($condition, $message) { if (!$condition) { throw new RuntimeException($message); } }
function psRemove($path) {
    if (is_link($path) || !is_dir($path)) { @unlink($path); return; }
    foreach (scandir($path) as $f) { if ($f !== '.' && $f !== '..') { psRemove($path . '/' . $f); } }
    rmdir($path);
}
function psInvoke($object, $name, $args = array()) { $m = new ReflectionMethod($object, $name); $m->setAccessible(true); return $m->invokeArgs($object, $args); }
/** Every file below $dir with content hash, mode and mtime: proves read-only handling. */
function psTree($dir) {
    $out = array();
    if (!is_dir($dir)) { return $out; }
    foreach (scandir($dir) as $f) {
        if ($f === '.' || $f === '..') { continue; }
        $p = $dir . '/' . $f; clearstatcache(true, $p);
        if ($f === 'tls-outcome') { continue; } // the sanitized apply outcome is checked separately, not part of the config/pair bytes
        $out[$f] = is_dir($p) && !is_link($p) ? psTree($p) : array(is_link($p) ? 'link' : hash_file('sha256', $p), fileperms($p) & 0777, filemtime($p));
    }
    return $out;
}
/** Leaf with one typed SAN ('IP:x' or 'DNS:x'): $days=0 is already expired; $eku replaces serverAuth. */
function psFixture($dir, $san = 'IP:' . PS_STAND_IP, $days = 30, $eku = 'serverAuth') {
    $config = $dir . '/fixture-' . mt_rand() . '.cnf';
    file_put_contents($config, "[req]\ndistinguished_name=dn\n[dn]\n[ext]\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=" . $eku
        . "\nkeyUsage=digitalSignature,keyEncipherment\nsubjectAltName=" . $san . "\n");
    $options = array('config' => $config, 'digest_alg' => 'sha256', 'x509_extensions' => 'ext');
    $key = openssl_pkey_new(array('config' => $config, 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
    $csr = openssl_csr_new(array('commonName' => 'cti.test'), $key, $options);
    $cert = openssl_csr_sign($csr, null, $key, $days, $options, mt_rand(1, 100000000));
    psExpect($cert !== false && openssl_x509_export($cert, $pem) && openssl_pkey_export($key, $keyPem, null, $options), 'fixture');
    @unlink($config);
    return array('cert' => $pem, 'key' => $keyPem);
}
function psPresent($fixture) { return array('state' => 'present', 'sourceId' => 'fixture', 'certPem' => $fixture['cert'], 'privateKeyPem' => $fixture['key'], 'chainPem' => ''); }
function psSourceError($code) { return array('state' => 'error', 'sourceId' => 'fixture', 'errorCode' => $code); }
/** The previous module layout: dirs 0755 down from the module root, cert 0640, key 0600, owned by the running actor. */
function psInstallPrevious($moduleDir, $fixture) {
    $dir = $moduleDir . '/etc/ssl'; mkdir($dir, 0755, true); chmod($moduleDir, 0755); chmod($moduleDir . '/etc', 0755); chmod($dir, 0755);
    file_put_contents($dir . '/gnatsd.crt', $fixture['cert']); chmod($dir . '/gnatsd.crt', 0640);
    file_put_contents($dir . '/gnatsd.key', $fixture['key']); chmod($dir . '/gnatsd.key', 0600);
    return array('cert' => $dir . '/gnatsd.crt', 'key' => $dir . '/gnatsd.key', 'dir' => $dir);
}
function psNobodyActor() {
    if (DIRECTORY_SEPARATOR !== '/' || !function_exists('posix_geteuid') || !function_exists('posix_getpwnam')) { return false; }
    $n = posix_getpwnam('nobody');
    return is_array($n) && $n['uid'] > 0 && posix_getuid() === $n['uid'] && posix_geteuid() === $n['uid'];
}
function psDaemon($dir, $address, $withBinaries = true) {
    $r = new ReflectionClass('Modules\\ModuleCTIClient\\Lib\\AmigoDaemons'); $d = $r->newInstanceWithoutConstructor();
    $dirs = array(); mkdir($dir, 0700, true);
    foreach (array('spoolDir', 'logDir', 'pidDir', 'confDir', 'binDir', 'moduleDir') as $name) { $dirs[$name] = $dir . '/' . $name; mkdir($dirs[$name], 0700); }
    $d->dirs = $dirs;
    $p = $r->getProperty('mikoPBXConfig'); $p->setAccessible(true); $p->setValue($d, new \MikoPBX\Core\System\MikoPBXConfig());
    $p = $r->getProperty('module_settings'); $p->setAccessible(true);
    $p->setValue($d, array('cti_tls_hostname' => $address, 'security_mode' => 'strict', 'debug_mode' => 0,
        'nats_password' => str_repeat('a', 64), 'auto_settings_mode' => 1, 'saaskey' => 'synthetic'));
    if ($withBinaries) {
        file_put_contents($dirs['binDir'] . '/gnatsd-cti', 'cti-device-v2 /pbx/auth/challenge/confirm allow_legacy_auth legacy_unsigned tls_port https_port security_mode service_users');
        file_put_contents($dirs['binDir'] . '/crmd', 'security_mode device enrollment required PIN authentication rate limit exceeded unknown security_mode');
    }
    $GLOBALS['psProcesses'] = array(); $GLOBALS['psSourceReads'] = 0; $GLOBALS['psSource'] = array('state' => 'absent', 'sourceId' => 'fixture');
    return $d;
}
function psPending($callback, $code) {
    try { call_user_func($callback); }
    catch (RuntimeException $e) {
        psExpect(get_class($e) === PS_PENDING && $e->getMessage() === $code, 'typed pending ' . $code . ', got ' . get_class($e) . ':' . $e->getMessage());
        return;
    }
    throw new RuntimeException('expected typed pending ' . $code . ', nothing thrown');
}
function psGenerate($d) { psInvoke($d, 'generateNatsConf'); psInvoke($d, 'generateProxyConf'); }
/** cert/key paths written into nats.conf and proxy.json: they must be the same pair. */
function psPaths($d) {
    $nats = file_get_contents($d->dirs['confDir'] . '/nats.conf');
    psExpect(preg_match('/tls \{ cert_file: "([^"]+)"; key_file: "([^"]+)" \}/', $nats, $m) === 1, 'tls block in nats.conf');
    $proxy = json_decode(file_get_contents($d->dirs['confDir'] . '/proxy.json'), true);
    psExpect($proxy['pem'] === $m[1] && $proxy['key'] === $m[2] && $proxy['proto'] === 'https', 'proxy uses the same pair as NATS');
    psExpect(strpos($nats, 'https_port: 8298') !== false && strpos($nats, 'tls_port: 4228') !== false, 'TLS ports kept');
    return array($m[1], $m[2]);
}
function psOwn($d) { return array($d->dirs['confDir'] . '/tls/cti.crt', $d->dirs['confDir'] . '/tls/cti.key'); }
function psSan($pem) { $x = openssl_x509_parse($pem); return $x['extensions']['subjectAltName']; }

$root = str_replace('\\', '/', sys_get_temp_dir()) . '/cti-pair-' . bin2hex(openssl_random_pseudo_bytes(8)); mkdir($root, 0700);
$n = 0;
$cases = array(
    'previousPairIsKeptUnchangedWithoutAddress' => function () use ($root, &$n) {
        $d = psDaemon($root . '/prev-' . $n++, '');
        $fx = psFixture($root); $pair = psInstallPrevious($d->dirs['moduleDir'], $fx); $before = psTree($pair['dir']); $confBefore = psTree($d->dirs['confDir']);
        psGenerate($d);
        list($cert, $key) = psPaths($d);
        psExpect($cert === $pair['cert'] && $key === $pair['key'], 'NATS and proxy use the exact previous paths: ' . $cert);
        psExpect(psTree($pair['dir']) === $before, 'previous pair never rewritten, chmodded, chowned, copied or touched');
        psExpect(!file_exists($d->dirs['confDir'] . '/tls') && !file_exists($d->dirs['confDir'] . '/cti-tls-state.json')
            && !file_exists($d->dirs['moduleDir'] . '/etc/cti-tls'), 'no new directory, marker or lock');
        psExpect($GLOBALS['psSourceReads'] === 0 && $GLOBALS['psProcesses'] === array(), 'no PBX source read (and never PBXName), nothing started');
        psExpect(count(psTree($d->dirs['confDir'])) > count($confBefore), 'baseline config generation still wrote its files');
    },
    'previousPairKeepsServingAnExplicitAddressItCovers' => function () use ($root, &$n) {
        $d = psDaemon($root . '/prevaddr-' . $n++, PS_STAND_IP);
        $pair = psInstallPrevious($d->dirs['moduleDir'], psFixture($root)); $before = psTree($pair['dir']);
        $GLOBALS['psSource'] = psPresent(psFixture($root, 'IP:' . PS_STAND_IP));
        psGenerate($d); list($cert) = psPaths($d);
        psExpect($cert === $pair['cert'] && psTree($pair['dir']) === $before && $GLOBALS['psSourceReads'] === 0, 'a healthy installed pair is not replaced by the PBX pair');
    },
    'noPairOrUnusablePairWithoutAddressIsTheAddressStepBeforeAnyWrite' => function () use ($root, &$n) {
        $good = psFixture($root); $other = psFixture($root);
        $variants = array(
            'absent' => function ($m) { return null; },
            'expired' => function ($m) use ($root) { return psInstallPrevious($m, psFixture($root, 'IP:' . PS_STAND_IP, 0)); },
            'key-mismatch' => function ($m) use ($good, $other) { return psInstallPrevious($m, array('cert' => $good['cert'], 'key' => $other['key'])); },
            'garbage' => function ($m) use ($good) { return psInstallPrevious($m, array('cert' => 'not a certificate', 'key' => $good['key'])); },
            'client-only-usage' => function ($m) use ($root) { return psInstallPrevious($m, psFixture($root, 'IP:' . PS_STAND_IP, 30, 'clientAuth')); },
        );
        if (DIRECTORY_SEPARATOR === '/') {
            $variants['group-writable-key'] = function ($m) use ($good) { $p = psInstallPrevious($m, $good); chmod($p['key'], 0660); return $p; };
            $variants['symlinked-key'] = function ($m) use ($good) { $p = psInstallPrevious($m, $good); rename($p['key'], $p['dir'] . '/real.key'); symlink($p['dir'] . '/real.key', $p['key']); return $p; };
            $variants['writable-directory'] = function ($m) use ($good) { $p = psInstallPrevious($m, $good); chmod($p['dir'], 0777); return $p; };
        }
        foreach ($variants as $label => $install) {
            $d = psDaemon($root . '/bad-' . $n++, '');
            $pair = $install($d->dirs['moduleDir']); $before = $pair ? psTree($pair['dir']) : array();
            file_put_contents($d->dirs['confDir'] . '/nats.conf', 'previous-nats'); $confBefore = psTree($d->dirs['confDir']);
            psPending(function () use ($d) { psInvoke($d, 'generateNatsConf'); }, 'invalid_hostname');
            psPending(function () use ($d) { psInvoke($d, 'generateProxyConf'); }, 'invalid_hostname');
            psPending(function () use ($d) { $d->startAllServices(true); }, 'invalid_hostname');
            psPending(function () use ($d) { $d->startAllServices(false); }, 'invalid_hostname');
            psExpect($pair === null || psTree($pair['dir']) === $before, $label . ': unusable previous pair never repaired');
            psExpect(psTree($d->dirs['confDir']) === $confBefore, $label . ': no config written before selection');
            psExpect($GLOBALS['psProcesses'] === array() && $GLOBALS['psSourceReads'] === 0, $label . ': no stop/start, no PBX source guess');
        }
    },
    'ownProtectedPairIsPreferredAndNeverReplacedWhenHealthy' => function () use ($root, &$n) {
        $d = psDaemon($root . '/own-' . $n++, 'pbx.test');
        $GLOBALS['psSource'] = psSourceError('source_unreadable');
        $own = psFixture($root, 'DNS:pbx.test'); list($oc, $ok) = psOwn($d); mkdir(dirname($oc), 0755);
        file_put_contents($oc, $own['cert']); file_put_contents($ok, $own['key']); chmod($ok, 0600);
        $prev = psInstallPrevious($d->dirs['moduleDir'], psFixture($root, 'DNS:pbx.test')); $before = psTree(dirname($oc)); $prevBefore = psTree($prev['dir']);
        psGenerate($d); list($cert, $key) = psPaths($d);
        psExpect($cert === $oc && $key === $ok && psTree(dirname($oc)) === $before && psTree($prev['dir']) === $prevBefore, 'healthy own pair used untouched');
        psExpect($GLOBALS['psSourceReads'] === 0, 'a healthy pair never consults the PBX source');
    },
    'eligiblePbxPairIsCopiedToTheProtectedPathAndPreviousStaysUntouched' => function () use ($root, &$n) {
        foreach (array('pbx.test' => 'DNS:pbx.test', '172.16.32.71' => 'IP:172.16.32.71') as $address => $san) {
            $d = psDaemon($root . '/pbx-' . $n++, $address);
            $prev = psInstallPrevious($d->dirs['moduleDir'], psFixture($root, 'IP:' . PS_STAND_IP)); $prevBefore = psTree($prev['dir']);
            $fx = psFixture($root, $san); $GLOBALS['psSource'] = psPresent($fx);
            psGenerate($d); list($cert, $key) = psPaths($d); list($oc, $ok) = psOwn($d);
            psExpect($cert === $oc && $key === $ok && is_file($oc) && is_file($ok), 'protected copy is used: ' . $cert);
            psExpect(trim(file_get_contents($oc)) === trim($fx['cert']) && trim(file_get_contents($ok)) === trim($fx['key'])
                && openssl_x509_check_private_key(file_get_contents($oc), file_get_contents($ok)), 'checked pair copied byte-for-byte');
            if (DIRECTORY_SEPARATOR === '/') { psExpect((fileperms($ok) & 0777) === 0600 && (fileperms($oc) & 0777) === 0644, 'key 0600, public cert readable by the web status'); }
            psExpect(psTree($prev['dir']) === $prevBefore, 'previous pair untouched');
            psExpect(!file_exists($d->dirs['moduleDir'] . '/etc/cti-tls'), 'nothing written into the module source tree');
            $before = psTree(dirname($oc));
            $again = psDaemon($root . '/pbx-again-' . $n++, $address); $again->dirs['confDir'] = $d->dirs['confDir'];
            $GLOBALS['psSource'] = psSourceError('source_unreadable');
            psGenerate($again);
            psExpect(psTree(dirname($oc)) === $before && $GLOBALS['psSourceReads'] === 0, 'the applied pair is not replaced when the PBX source later changes or fails');
        }
    },
    'absentOrIneligiblePbxCertificateGeneratesOneStableTypedSanLeaf' => function () use ($root, &$n) {
        $ineligible = array(
            'absent' => array('state' => 'absent', 'sourceId' => 'fixture'),
            'wrong-name' => psPresent(psFixture($root, 'DNS:other.test')),
            'wrong-ip' => psPresent(psFixture($root, 'IP:10.9.9.9')),
            'expired' => psPresent(psFixture($root, 'DNS:pbx.test', 0)),
            'key-mismatch' => psPresent(array('cert' => psFixture($root, 'DNS:pbx.test')['cert'], 'key' => psFixture($root, 'DNS:pbx.test')['key'])),
            'client-only' => psPresent(psFixture($root, 'DNS:pbx.test', 30, 'clientAuth')),
            'source-invalid' => psSourceError('source_invalid'),
        );
        foreach ($ineligible as $label => $source) {
            foreach (array('pbx.test' => 'DNS:pbx.test', PS_STAND_IP => 'IP Address:' . PS_STAND_IP) as $address => $expected) {
                $d = psDaemon($root . '/gen-' . $n++, $address); $GLOBALS['psSource'] = $source;
                psGenerate($d); list($cert, $key) = psPaths($d); list($oc, $ok) = psOwn($d);
                psExpect($cert === $oc && $key === $ok, $label . ': generated pair is used');
                $pem = file_get_contents($oc);
                psExpect(strpos(psSan($pem), $expected) !== false && psSan($pem) === $expected, $label . ': exact typed SAN ' . psSan($pem));
                psExpect(openssl_x509_check_private_key($pem, file_get_contents($ok)) && strpos(file_get_contents($ok), 'PRIVATE KEY') !== false, $label . ': pair matches');
                if (isset($source['privateKeyPem'])) { psExpect(strpos(file_get_contents($ok), trim($source['privateKeyPem'])) === false, $label . ': the PBX key is never copied for the fallback'); }
                $bytes = file_get_contents($oc); $GLOBALS['psSource'] = array('state' => 'absent'); $GLOBALS['psSourceReads'] = 0;
                $second = psDaemon($root . '/gen-again-' . $n++, $address); $second->dirs['confDir'] = $d->dirs['confDir'];
                psGenerate($second);
                psExpect(file_get_contents($oc) === $bytes && $GLOBALS['psSourceReads'] === 0, $label . ': the generated leaf is stable across applies');
            }
        }
    },
    'unreadableIndeterminateOrUnsupportedSourceNeverFallsBack' => function () use ($root, &$n) {
        foreach (array('source_unreadable', 'source_selection_unknown', 'unsupported_core', 'source_mismatch', 'openssl_unavailable', 'chain_verification_unavailable') as $code) {
            $d = psDaemon($root . '/ind-' . $n++, 'pbx.test'); $GLOBALS['psSource'] = psSourceError($code);
            psInstallPrevious($d->dirs['moduleDir'], psFixture($root, 'IP:' . PS_STAND_IP)); $confBefore = psTree($d->dirs['confDir']);
            psPending(function () use ($d) { psInvoke($d, 'generateNatsConf'); }, $code);
            psPending(function () use ($d) { $d->startAllServices(true); }, $code);
            psExpect(!file_exists($d->dirs['confDir'] . '/tls') && psTree($d->dirs['confDir']) === $confBefore && $GLOBALS['psProcesses'] === array(),
                $code . ': no generated pair, no config write, no stop');
        }
        // An own pair that cannot be proven readable/safe is not replaced either.
        $d = psDaemon($root . '/ind-own-' . $n++, 'pbx.test'); list($oc, $ok) = psOwn($d); mkdir($oc, 0755, true); file_put_contents($ok, 'k');
        psPending(function () use ($d) { psInvoke($d, 'generateNatsConf'); }, 'unsafe_state');
        psExpect(is_dir($oc) && file_get_contents($ok) === 'k', 'an unreadable/unsafe own pair is left as found');
    },
    'addressChangeNeverOverwritesAnInstalledPairAndIsAManualStep' => function () use ($root, &$n) {
        $d = psDaemon($root . '/chg-' . $n++, 'a.test'); psGenerate($d); list($oc, $ok) = psOwn($d);
        $a = file_get_contents($oc); $aKey = file_get_contents($ok);
        $confDir = $d->dirs['confDir']; $confBefore = psTree($confDir);
        $GLOBALS['psSourceReads'] = 0; $GLOBALS['psSource'] = array('state' => 'absent');
        $changed = psDaemon($root . '/chg1-' . $n++, 'b.test'); $changed->dirs['confDir'] = $confDir;
        psPending(function () use ($changed) { psInvoke($changed, 'generateNatsConf'); }, 'installed_pair_unusable');
        psExpect(file_get_contents($oc) === $a && file_get_contents($ok) === $aKey && psTree($confDir) === $confBefore, 'the installed pair is kept byte for byte and nothing else is written');
        psExpect($GLOBALS['psSourceReads'] === 0 && $GLOBALS['psProcesses'] === array(), 'no source guess and no stop');
        psExpect(\Modules\ModuleCTIClient\Lib\CtiTlsSetupPending::recorded($confDir) === 'installed_pair_unusable', 'the real outcome is recorded as the fixed code');
        // Manual remediation: the administrator removes the old files; the fresh slot is then generated for the new address.
        unlink($oc); unlink($ok);
        $d2 = psDaemon($root . '/chg2-' . $n++, 'b.test'); $d2->dirs['confDir'] = $confDir;
        psGenerate($d2);
        psExpect(psSan(file_get_contents($oc)) === 'DNS:b.test' && openssl_x509_check_private_key(file_get_contents($oc), file_get_contents($ok)), 'a free slot gets a pair for the new address');
        psExpect(\Modules\ModuleCTIClient\Lib\CtiTlsSetupPending::recorded($confDir) === null, 'success clears the recorded outcome');
    },
    'unwritableProtectedPathIsAManualStepNotASilentFallback' => function () use ($root, &$n) {
        $d = psDaemon($root . '/nowrite-' . $n++, 'pbx.test'); file_put_contents($d->dirs['confDir'] . '/tls', 'a file, not a directory');
        $prev = psInstallPrevious($d->dirs['moduleDir'], psFixture($root, 'IP:' . PS_STAND_IP)); $before = psTree($prev['dir']);
        foreach (array(array('state' => 'absent'), psPresent(psFixture($root, 'DNS:pbx.test'))) as $source) {
            $GLOBALS['psSource'] = $source;
            psPending(function () use ($d) { psInvoke($d, 'generateNatsConf'); }, 'tls_prepare_failed');
        }
        psExpect(!file_exists($d->dirs['confDir'] . '/nats.conf') && psTree($prev['dir']) === $before && $GLOBALS['psProcesses'] === array(), 'nothing started, written or borrowed');
    },
    'onlyExpectedTlsSetupCodesAreTypedPending' => function () {
        foreach (array('invalid_hostname', 'tls_prepare_failed', 'source_unreadable', 'source_selection_unknown', 'unsupported_core', 'source_mismatch', 'openssl_unavailable', 'unsafe_state', 'installed_pair_unusable') as $code) {
            psExpect(call_user_func(array('Modules\\ModuleCTIClient\\Lib\\CtiTlsSetupPending', 'exception'), $code) instanceof \Modules\ModuleCTIClient\Lib\CtiTlsSetupPending, $code);
        }
        foreach (array('tls_binary_unsupported', 'tls_start_failed', 'config_write_failed', 'anything_else') as $code) {
            $e = call_user_func(array('Modules\\ModuleCTIClient\\Lib\\CtiTlsSetupPending', 'exception'), $code);
            psExpect(get_class($e) === 'RuntimeException' && $e->getMessage() === $code, $code . ' stays a genuine error');
        }
    },
    'strictAndTlsCapabilityBaselineIsNotWeakened' => function () use ($root, &$n) {
        $d = psDaemon($root . '/strict-' . $n++, ''); psInstallPrevious($d->dirs['moduleDir'], psFixture($root));
        file_put_contents($d->dirs['binDir'] . '/gnatsd-cti', 'security_mode tls_port https_port');
        file_put_contents($d->dirs['confDir'] . '/nats.conf', 'previous-nats');
        $e = null; try { psInvoke($d, 'generateNatsConf'); } catch (RuntimeException $e) {}
        psExpect($e !== null && strpos($e->getMessage(), 'Strict security requires an updated') === 0 && file_get_contents($d->dirs['confDir'] . '/nats.conf') === 'previous-nats', 'strict capability still required');
        $d = psDaemon($root . '/tlsbin-' . $n++, ''); psInstallPrevious($d->dirs['moduleDir'], psFixture($root));
        $p = new ReflectionProperty($d, 'module_settings'); $p->setAccessible(true); $s = $p->getValue($d); $s['security_mode'] = 'legacy_compatible'; $p->setValue($d, $s);
        file_put_contents($d->dirs['binDir'] . '/gnatsd-cti', 'security_mode');
        $e = null; try { psInvoke($d, 'generateNatsConf'); } catch (RuntimeException $e) {}
        psExpect($e !== null && get_class($e) === 'RuntimeException' && $e->getMessage() === 'tls_binary_unsupported' && !file_exists($d->dirs['confDir'] . '/nats.conf'), 'a binary without TLS never gets plaintext config');
        $d = psDaemon($root . '/crm-' . $n++, ''); psInstallPrevious($d->dirs['moduleDir'], psFixture($root)); unlink($d->dirs['binDir'] . '/crmd');
        $e = null; try { psInvoke($d, 'generateProxyConf'); } catch (RuntimeException $e) {}
        psExpect($e !== null && !file_exists($d->dirs['confDir'] . '/proxy.json'), 'strict CRM readiness still required');
    },
    'ordinaryAmigoDaemonsHasNoPrivilegedTlsLifecycle' => function () {
        $source = file_get_contents(dirname(__DIR__) . '/Lib/AmigoDaemons.php');
        foreach (array('CtiTlsIdentity', 'tlsIdentity', 'withTlsConfigLock', 'cti-tls-state', 'tlsWriteJournal', 'applyCtiConfiguration', 'posix_geteuid', 'apply.lock') as $gone) {
            psExpect(strpos($source, $gone) === false, 'removed root-only lifecycle still referenced: ' . $gone);
        }
        psExpect(!file_exists(dirname(__DIR__) . '/Lib/CtiTlsIdentity.php'), 'root-only identity class removed');
    },
);
$fail = 0;
try {
    if (!extension_loaded('openssl')) { throw new RuntimeException('OpenSSL is required; not a PASS'); }
    foreach ($cases as $name => $case) {
        if (isset($argv[1]) && $argv[1] !== $name) { continue; }
        try { $case(); echo 'PASS ' . $name . (psNobodyActor() ? ' [nobody]' : '') . "\n"; }
        catch (Exception $e) { ++$fail; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
        catch (Error $e) { ++$fail; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
    }
} finally { psRemove($root); }
echo $fail ? "FAILED $fail\n" : "PASS CtiPairSelection\n";
exit($fail ? 1 : 0);
}
