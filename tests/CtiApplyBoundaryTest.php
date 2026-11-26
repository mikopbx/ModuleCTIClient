<?php
// Focused boundary tests for the four review blockers (synthetic pairs only; no real key, stand or PBX):
//  1. status/download never read the PBX source, settings or a private key path; a mixed cert file never leaks its key block;
//  2. only a readable, definitively unusable selected runtime pair may fall back to a generated leaf;
//  3. the real apply outcome is one fixed, sanitized code that the status shows (no re-reading the source to guess);
//  4. an installed pair is never overwritten; a failed first publication leaves no mixed usable state.
namespace MikoPBX\Common\Models { class PbxSettings { static function getValueByKey($key) { throw new \RuntimeException('status must not read settings'); } } }
namespace Modules\ModuleCTIClient\Lib {
    class PbxCertificateSourceSpy { }
}
namespace {
define('CTI_TLS_TESTING', true);
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});
use Modules\ModuleCTIClient\Lib\CtiTlsPair;
use Modules\ModuleCTIClient\Lib\CtiTlsSetupPending;
use Modules\ModuleCTIClient\Lib\CtiTlsStatus;
use Modules\ModuleCTIClient\Lib\PbxCertificateSource;
use Modules\ModuleCTIClient\Lib\TlsCertificate;

function abExpect($c, $m) { if (!$c) { throw new RuntimeException($m); } }
function abRemove($p) { if (is_link($p) || !is_dir($p)) { @unlink($p); return; } foreach (scandir($p) as $f) { if ($f !== '.' && $f !== '..') { abRemove($p . '/' . $f); } } rmdir($p); }
function abPair($dir, $host) { @mkdir($dir, 0700, true); abExpect(TlsCertificate::ensure($dir . '/x.crt', $dir . '/x.key', $host), 'fixture pair'); return array($dir . '/x.crt', $dir . '/x.key'); }
function abLayout($root, &$n) {
    $b = $root . '/l' . (++$n); mkdir($b . '/conf', 0755, true); mkdir($b . '/module/etc/ssl', 0755, true);
    return array('conf' => $b . '/conf', 'module' => $b . '/module', 'paths' => CtiTlsPair::paths($b . '/module', $b . '/conf'));
}
function abTree($dir) { $o = array(); if (!is_dir($dir)) { return $o; } foreach (scandir($dir) as $f) { if ($f === '.' || $f === '..') { continue; } $p = $dir . '/' . $f; $o[$f] = is_dir($p) ? abTree($p) : hash_file('sha256', $p); } return $o; }
function abNoSource() { throw new RuntimeException('the PBX source must not be read'); }

$root = sys_get_temp_dir() . '/cti-ab-' . getmypid(); abRemove($root); mkdir($root, 0700, true); $n = 0;
$failures = 0;
$cases = array(
    // ---- 4. publication ----
    'failedSecondRenameOnFirstPublicationLeavesNothingUsable' => function () use ($root, &$n) {
        $dir = $root . '/p' . (++$n); mkdir($dir, 0755);
        $src = abPair($root . '/src' . $n, 'pbx.test');
        TlsCertificate::$renameHook = function ($from, $to) use ($dir) { return substr($to, -4) === '.crt' ? false : rename($from, $to); };
        try { $ok = TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', file_get_contents($src[0]), file_get_contents($src[1]), 0644); }
        finally { TlsCertificate::$renameHook = null; }
        abExpect($ok === false, 'a failed publication must signal failure');
        abExpect(!file_exists($dir . '/cti.crt') && !file_exists($dir . '/cti.key'), 'no key-only or cert-only leftovers');
        abExpect(array_filter(scandir($dir), function ($f) { return strpos($f, '.cti-tls-') === 0; }) === array(), 'no temp files');
    },
    'installedPairIsNeverOverwritten' => function () use ($root, &$n) {
        $dir = $root . '/q' . (++$n); mkdir($dir, 0755);
        $a = abPair($root . '/qa' . $n, 'old.test'); $b = abPair($root . '/qb' . $n, 'new.test');
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', file_get_contents($a[0]), file_get_contents($a[1]), 0644), 'first install');
        $before = array(hash_file('sha256', $dir . '/cti.crt'), hash_file('sha256', $dir . '/cti.key'));
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', file_get_contents($b[0]), file_get_contents($b[1]), 0644) === false, 'install over an installed pair must refuse');
        abExpect(!TlsCertificate::ensure($dir . '/cti.crt', $dir . '/cti.key', 'new.test'), 'ensure for another address must not regenerate over it');
        abExpect(array(hash_file('sha256', $dir . '/cti.crt'), hash_file('sha256', $dir . '/cti.key')) === $before, 'existing bytes preserved');
        // a half pair (only the key) is also not overwritten
        unlink($dir . '/cti.crt'); $keyHash = hash_file('sha256', $dir . '/cti.key');
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', file_get_contents($b[0]), file_get_contents($b[1]), 0644) === false && hash_file('sha256', $dir . '/cti.key') === $keyHash, 'a lone key is preserved');
    },
    'unusableOwnPairGetsPreciseManualRemediationAndIsKept' => function () use ($root, &$n) {
        $l = abLayout($root, $n); mkdir($l['conf'] . '/tls', 0755);
        $a = abPair($root . '/ua' . $n, 'old.test'); copy($a[0], $l['paths']['ownCert']); copy($a[1], $l['paths']['ownKey']);
        $before = abTree($l['conf'] . '/tls');
        $r = CtiTlsPair::prepare('new.test', $l['paths'], $l['module'], 'abNoSource');
        abExpect($r['ok'] === false && $r['errorCode'] === 'installed_pair_unusable', json_encode($r));
        abExpect(abTree($l['conf'] . '/tls') === $before, 'the installed pair is untouched');
        abExpect(in_array('installed_pair_unusable', CtiTlsSetupPending::CODES, true), 'a typed pending (not an exception) outcome');
    },
    'firstTimeFallbackStillGeneratesInTheFreshSlot' => function () use ($root, &$n) {
        $l = abLayout($root, $n);
        $r = CtiTlsPair::prepare('172.16.32.70', $l['paths'], $l['module'], function () { return array('state' => 'absent'); });
        abExpect($r['ok'] === true && $r['source'] === 'self_signed' && is_file($l['paths']['ownCert']) && is_file($l['paths']['ownKey']), json_encode($r));
    },
    // ---- 2. fallback authority ----
    'settingsLevelProblemsAreManualGuidanceNotFallback' => function () {
        $readers = function ($cert, $key) { return array(
            'platform' => function () { return array('mode' => 'modern', 'certPath' => '/x/c', 'keyPath' => '/x/k'); },
            'settings' => function ($name) use ($cert, $key) { return $name === 'WEBHTTPSPublicKey' ? $cert : $key; },
            'file' => function () { return array('state' => 'absent'); }); };
        foreach (array('half-configured' => array('-----BEGIN CERTIFICATE-----x-----END CERTIFICATE-----', ''), 'garbage-configured' => array('garbage', 'garbage')) as $name => $s) {
            $r = PbxCertificateSource::read($readers($s[0], $s[1]));
            abExpect($r['state'] === 'error' && $r['errorCode'] === 'source_selection_unknown', $name . ' => ' . json_encode($r));
            $plan = CtiTlsPair::plan($r, 'pbx.test');
            abExpect(is_array($plan) && isset($plan['ok']) && $plan['ok'] === false, $name . ' must not authorise generation');
        }
    },
    'onlyAReadableUnusableRuntimePairMayFallBack' => function () {
        $files = array('/x/c' => array('state' => 'present', 'pem' => 'not a certificate'), '/x/k' => array('state' => 'present', 'pem' => 'not a key'));
        $r = PbxCertificateSource::read(array('platform' => function () { return array('mode' => 'modern', 'certPath' => '/x/c', 'keyPath' => '/x/k'); },
            'settings' => function () { return ''; }, 'file' => function ($p) use ($files) { return $files[$p]; }));
        abExpect($r['state'] === 'error' && $r['errorCode'] === 'source_invalid', json_encode($r));
        abExpect(CtiTlsPair::plan($r, 'pbx.test') === true, 'a definitively unusable runtime pair falls back');
        foreach (array('source_incomplete', 'source_selection_unknown', 'openssl_unavailable', 'chain_verification_unavailable', 'source_unreadable') as $code) {
            $p = CtiTlsPair::plan(array('state' => 'error', 'errorCode' => $code), 'pbx.test');
            abExpect(is_array($p) && $p['ok'] === false, $code . ' must stay manual');
        }
    },
    // ---- 3. sanitized apply outcome ----
    'applyOutcomeIsOneFixedSanitizedCode' => function () use ($root, &$n) {
        $l = abLayout($root, $n);
        abExpect(CtiTlsSetupPending::recorded($l['conf']) === null, 'nothing recorded yet');
        CtiTlsSetupPending::record($l['conf'], 'tls_prepare_failed');
        abExpect(CtiTlsSetupPending::recorded($l['conf']) === 'tls_prepare_failed', 'recorded');
        abExpect(file_get_contents($l['conf'] . '/tls-outcome') === "tls_prepare_failed\n", 'the whole file is the fixed code');
        CtiTlsSetupPending::record($l['conf'], "../../etc/passwd\n-----BEGIN PRIVATE KEY-----");
        abExpect(CtiTlsSetupPending::recorded($l['conf']) === null && !file_exists($l['conf'] . '/tls-outcome'), 'unknown text is never stored and clears the stale code');
        file_put_contents($l['conf'] . '/tls-outcome', "weird\n");
        abExpect(CtiTlsSetupPending::recorded($l['conf']) === null, 'a tampered file reads as nothing');
        CtiTlsSetupPending::record($l['conf'], 'unsafe_state'); CtiTlsSetupPending::record($l['conf'], null);
        abExpect(CtiTlsSetupPending::recorded($l['conf']) === null, 'success clears it');
        abExpect(array_filter(scandir($l['conf']), function ($f) { return strpos($f, 'tls-outcome') === 0; }) === array(), 'no temp leftovers');
    },
    'statusShowsTheRecordedOutcomeWithoutReadingTheSource' => function () use ($root, &$n) {
        $l = abLayout($root, $n);
        $status = new CtiTlsStatus($l['conf'], $l['module'], array('probe' => function () { return null; }));
        $r = $status->read('pbx.test');
        abExpect($r['errorCode'] === 'tls_apply_required' && !isset($r['manualPaths']), 'nothing attempted yet: Save');
        CtiTlsSetupPending::record($l['conf'], 'tls_prepare_failed');
        $r = $status->read('pbx.test');
        abExpect($r['state'] === 'error' && $r['errorCode'] === 'tls_prepare_failed' && $r['manualPaths'] === array('cert' => $l['paths']['ownCert'], 'key' => $l['paths']['ownKey']), json_encode($r));
        $r = $status->read('');
        abExpect($r['errorCode'] === 'invalid_hostname', 'no address: the address step wins');
        $text = file_get_contents(dirname(__DIR__) . '/Lib/CtiTlsStatus.php');
        abExpect(strpos($text, 'PbxCertificateSource') === false && strpos($text, 'PbxSettings') === false, 'status code does not reference the full source reader or settings');
        abExpect(!preg_match('/file_get_contents\([^;]*[kK]ey/', $text), 'status code never opens a key path');
    },
    'selectedPairWithoutItsKeyIsNotSelected' => function () use ($root, &$n) {
        $l = abLayout($root, $n); $a = abPair($root . '/k' . $n, 'pbx.test');
        copy($a[0], $l['paths']['previousCert']);
        $r = (new CtiTlsStatus($l['conf'], $l['module'], array('probe' => function () { return null; })))->read('pbx.test');
        abExpect($r['configured'] === null && $r['state'] === 'error', 'a readable leaf with a missing key must not look usable: ' . json_encode($r));
    },
    // ---- A. old Core leftovers are an unknown selection before any parse ----
    'oldCoreLeftoverRuntimeFilesAreUnknownSelectionBeforeAnyParse' => function () use ($root, &$n) {
        $reader = function ($mode, $files, $settings = '') { return array(
            'platform' => function () use ($mode) { return array('mode' => $mode, 'certPath' => '/x/c', 'keyPath' => '/x/k'); },
            'settings' => function () use ($settings) { return $settings; },
            'file' => function ($p) use ($files) { return $files[$p]; }); };
        $garbage = array('/x/c' => array('state' => 'present', 'pem' => 'not a certificate'), '/x/k' => array('state' => 'present', 'pem' => 'not a key'));
        $absent = array('/x/c' => array('state' => 'absent'), '/x/k' => array('state' => 'absent'));
        foreach (array('both-garbage' => $garbage, 'cert-only' => array('/x/c' => $garbage['/x/c'], '/x/k' => array('state' => 'absent')),
            'key-only' => array('/x/c' => array('state' => 'absent'), '/x/k' => $garbage['/x/k'])) as $name => $files) {
            $r = PbxCertificateSource::read($reader('old', $files));
            abExpect($r['state'] === 'error' && $r['errorCode'] === 'source_selection_unknown', $name . ' => ' . json_encode($r));
            $plan = CtiTlsPair::plan($r, 'pbx.test'); abExpect(is_array($plan) && $plan['ok'] === false, $name . ' must not authorise generation');
        }
        $r = PbxCertificateSource::read($reader('old', $absent)); abExpect($r['state'] === 'absent', 'genuine absence stays eligible: ' . json_encode($r));
        $r = PbxCertificateSource::read($reader('modern', $garbage)); abExpect($r['errorCode'] === 'source_invalid', 'modern explicit runtime pair control: ' . json_encode($r));
        $a = abPair($root . '/oc' . (++$n), 'pbx.test'); $cert = file_get_contents($a[0]); $key = file_get_contents($a[1]);
        $r = PbxCertificateSource::read(array('platform' => function () { return array('mode' => 'old', 'certPath' => '/x/c', 'keyPath' => '/x/k'); },
            'settings' => function ($name) use ($cert, $key) { return $name === 'WEBHTTPSPublicKey' ? $cert : $key; },
            'file' => function ($p) use ($cert, $key) { return array('state' => 'present', 'pem' => $p === '/x/c' ? $cert : $key); }));
        abExpect($r['state'] === 'present', 'old Core with a configured matching pair control: ' . json_encode($r));
    },
    // ---- B. the recorded refusal is always surfaced ----
    'recordedRefusalIsShownEvenWithAnObservablePublicLeaf' => function () use ($root, &$n) {
        $l = abLayout($root, $n); $a = abPair($root . '/rb' . $n, 'pbx.test'); $other = abPair($root . '/rc' . $n, 'pbx.test');
        copy($a[0], $l['paths']['previousCert']); copy($other[1], $l['paths']['previousKey']);
        $sha = strtolower(openssl_x509_fingerprint(file_get_contents($a[0]), 'sha256'));
        $probe = function ($match) use ($sha) { return function () use ($match, $sha) { return $match ? $sha : null; }; };
        $r = (new CtiTlsStatus($l['conf'], $l['module'], array('probe' => $probe(false))))->read('pbx.test');
        abExpect($r['configured'] !== null && $r['applyError'] === null, 'no refusal recorded: none shown ' . json_encode($r));
        CtiTlsSetupPending::record($l['conf'], 'installed_pair_unusable');
        foreach (array(false, true) as $running) {
            $r = (new CtiTlsStatus($l['conf'], $l['module'], array('probe' => $probe($running))))->read('pbx.test');
            abExpect($r['applyError'] === 'installed_pair_unusable' && $r['configured'] !== null, json_encode($r));
            abExpect($running ? $r['state'] === 'running' : $r['state'] !== 'running', 'observed runtime stays accurate: ' . $r['state']);
            abExpect(isset($r['manualPaths']['cert']), 'paths shown with the refusal');
        }
        CtiTlsSetupPending::record($l['conf'], null);
        $r = (new CtiTlsStatus($l['conf'], $l['module'], array('probe' => $probe(true))))->read('pbx.test');
        abExpect($r['applyError'] === null && $r['state'] === 'running', 'success clears it');
    },
    'existingWorkingFilesAreNeverChmodedByEnsure' => function () use ($root, &$n) {
        $dir = $root . '/ch' . (++$n); mkdir($dir, 0755); $a = abPair($root . '/cha' . $n, 'pbx.test');
        copy($a[0], $dir . '/cti.crt'); copy($a[1], $dir . '/cti.key');
        if (DIRECTORY_SEPARATOR === '/') { chmod($dir . '/cti.key', 0640); chmod($dir . '/cti.crt', 0664); }
        $before = array(fileperms($dir . '/cti.key') & 0777, fileperms($dir . '/cti.crt') & 0777);
        abExpect(TlsCertificate::ensure($dir . '/cti.crt', $dir . '/cti.key', 'pbx.test', 0644), 'valid existing pair returned as is');
        abExpect(array(fileperms($dir . '/cti.key') & 0777, fileperms($dir . '/cti.crt') & 0777) === $before, 'modes of working files untouched');
    },
    // ---- C. exact downstream bounds and proof under the publication lock ----
    'oversizedSourceKeyIsNeverPublished' => function () use ($root, &$n) {
        $l = abLayout($root, $n); $a = abPair($root . '/os' . $n, 'pbx.test');
        $key = str_repeat("# padding\n", 7000) . file_get_contents($a[1]);
        abExpect(strlen($key) > 65536, 'fixture exceeds the downstream key limit');
        $source = array('state' => 'present', 'certPem' => file_get_contents($a[0]), 'privateKeyPem' => $key, 'chainPem' => '');
        $r = CtiTlsPair::prepare('pbx.test', $l['paths'], $l['module'], function () use ($source) { return $source; });
        abExpect(!is_file($l['paths']['ownKey']) || filesize($l['paths']['ownKey']) <= 65536, 'no oversize key left behind');
        abExpect($r['ok'] === false || $r['source'] === 'self_signed', 'never imported: ' . json_encode($r));
        abExpect(!is_file($l['paths']['ownKey']) || strpos(file_get_contents($l['paths']['ownKey']), '# padding') === false, 'padding never copied');
    },
    'installProvesTheExactPreparedBundleUnderTheLockAndCleansOnlyItsOwnEntries' => function () use ($root, &$n) {
        $dir = $root . '/ip' . (++$n); mkdir($dir, 0755); $a = abPair($root . '/ipa' . $n, 'pbx.test');
        $cert = file_get_contents($a[0]); $key = file_get_contents($a[1]);
        $none = function () use ($dir) { return array_values(array_filter(scandir($dir), function ($f) { return $f !== '.' && $f !== '..' && $f !== 'cti.key.lock'; })) === array(); };
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', $cert, $key, 0644, 'other.test') === false && $none(), 'wrong hostname: refused, nothing left');
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', $cert . $key, $key, 0644, 'pbx.test') === false && $none(), 'mixed cert file (key block inside): refused, nothing left');
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', $cert, str_repeat('k', 65537), 0644, 'pbx.test') === false && $none(), 'oversize key: refused before publication');
        TlsCertificate::$renameHook = function ($from, $to) { $ok = rename($from, $to); if ($ok && substr($to, -4) === '.crt') { file_put_contents($to, 'tampered'); } return $ok; };
        try { abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', $cert, $key, 0644, 'pbx.test') === false && $none(), 'tampered publication: refused, own entries cleaned'); }
        finally { TlsCertificate::$renameHook = null; }
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', $cert, $key, 0644, 'pbx.test') === true, 'the proven bundle is published');
        $before = array(hash_file('sha256', $dir . '/cti.crt'), hash_file('sha256', $dir . '/cti.key'));
        abExpect(TlsCertificate::install($dir . '/cti.crt', $dir . '/cti.key', $cert, $key, 0644, 'pbx.test') === false
            && array(hash_file('sha256', $dir . '/cti.crt'), hash_file('sha256', $dir . '/cti.key')) === $before, 'an existing pair is never touched by a failed call');
    },
    'mixedLegacyCertFileNeverLeaksItsKeyBlock' => function () use ($root, &$n) {
        $l = abLayout($root, $n); $a = abPair($root . '/m' . $n, 'pbx.test');
        file_put_contents($l['paths']['previousCert'], file_get_contents($a[0]) . "-----BEGIN PRIVATE KEY-----\nTOPSECRET\n-----END PRIVATE KEY-----\n");
        copy($a[1], $l['paths']['previousKey']);
        $status = new CtiTlsStatus($l['conf'], $l['module'], array('probe' => function () { return null; }));
        $r = $status->read('pbx.test');
        abExpect(strpos(json_encode($r), 'TOPSECRET') === false && strpos(json_encode($r), 'PRIVATE') === false, 'status carries no key payload');
        if ($r['configured'] !== null && in_array('server', $r['downloads'], true)) {
            $pem = $status->download('server', $r['configuredGeneration'], 'pbx.test');
            abExpect(strpos($pem, 'PRIVATE') === false && strpos($pem, 'TOPSECRET') === false && strpos($pem, '-----BEGIN CERTIFICATE-----') === 0, 'download is certificate-only: ' . substr($pem, 0, 40));
        }
    },
);
foreach ($cases as $name => $case) {
    try { $case(); echo "PASS $name\n"; } catch (Throwable $e) { $failures++; echo "FAIL $name: " . $e->getMessage() . "\n"; }
}
abRemove($root);
echo $failures ? "FAILED $failures\n" : "PASS CtiApplyBoundary\n";
exit($failures ? 1 : 0);
}
