<?php
// Read-only public view of the CTI certificate. Synthetic fixtures only; the web status never opens a private key,
// never writes, and never claims "running" without the three required TLS peers serving the selected leaf.
namespace Modules\ModuleCTIClient\Lib {
    function file_get_contents($path, $useIncludePath = false, $context = null, $offset = 0, $length = null) {
        if (substr($path, -4) === '.key') { throw new \RuntimeException('public status opened a private key'); }
        return $length === null ? \file_get_contents($path, $useIncludePath, $context, $offset)
            : \file_get_contents($path, $useIncludePath, $context, $offset, $length);
    }
}
namespace {
define('CTI_TLS_TESTING', true);
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});
use Modules\ModuleCTIClient\Lib\CtiTlsPair;
use Modules\ModuleCTIClient\Lib\CtiTlsStatus;
function stExpect($v, $m) { if (!$v) { throw new RuntimeException($m); } }
function stRemove($p) {
    if (is_link($p) || !is_dir($p)) { @unlink($p); return; }
    foreach (scandir($p) as $f) { if ($f !== '.' && $f !== '..') { stRemove($p . '/' . $f); } }
    rmdir($p);
}
/** Certificate with typed SAN; $ca signs it (array cert/key) or it is self-signed; $isCa makes a CA certificate. */
function stCert($dir, $name, $san, $days = 30, $ca = null, $isCa = false) {
    $config = $dir . '/f-' . mt_rand() . '.cnf';
    file_put_contents($config, "[req]\ndistinguished_name=dn\n[dn]\n[ext]\nbasicConstraints=critical,CA:" . ($isCa ? 'TRUE' : 'FALSE')
        . "\nkeyUsage=" . ($isCa ? 'keyCertSign,cRLSign' : 'digitalSignature,keyEncipherment') . "\n"
        . ($isCa ? '' : "extendedKeyUsage=serverAuth\nsubjectAltName=" . $san . "\n"));
    $options = array('config' => $config, 'digest_alg' => 'sha256', 'x509_extensions' => 'ext');
    $key = openssl_pkey_new(array('config' => $config, 'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
    $csr = openssl_csr_new(array('commonName' => $name), $key, $options);
    $cert = openssl_csr_sign($csr, $ca ? $ca['cert'] : null, $ca ? $ca['key'] : $key, $days, $options, mt_rand(1, 100000000));
    stExpect($cert !== false && openssl_x509_export($cert, $pem) && openssl_pkey_export($key, $keyPem, null, $options), 'fixture');
    @unlink($config);
    return array('cert' => $pem, 'key' => $keyPem);
}
function stSha($pem) { return strtolower(openssl_x509_fingerprint($pem, 'sha256')); }
/** @return array {conf, module, previous, own} fresh layout; previous/own set by the cases. */
function stLayout($root, &$n) {
    $base = $root . '/l' . $n++; mkdir($base . '/conf/tls', 0755, true); mkdir($base . '/module/etc/ssl', 0755, true);
    return array('conf' => $base . '/conf', 'module' => $base . '/module');
}
function stPutPrevious($l, $f) { file_put_contents($l['module'] . '/etc/ssl/gnatsd.crt', $f['cert']); file_put_contents($l['module'] . '/etc/ssl/gnatsd.key', $f['key']); }
function stPutOwn($l, $certText, $f) { file_put_contents($l['conf'] . '/tls/cti.crt', $certText); file_put_contents($l['conf'] . '/tls/cti.key', $f['key']); }
function stStatus($l, $probe, $source = null, $extra = array()) {
    return new CtiTlsStatus($l['conf'], $l['module'], array_merge(array('probe' => $probe,
        'source' => $source !== null ? $source : function () { throw new RuntimeException('status read the PBX source unexpectedly'); }), $extra));
}
function stAll($sha) { return function () use ($sha) { return $sha; }; }

$root = str_replace('\\', '/', sys_get_temp_dir()) . '/cti-status-' . bin2hex(openssl_random_pseudo_bytes(8)); mkdir($root, 0700);
$n = 0;
$cases = array(
    'noPairAndNoAddressIsTheAddressStepWithoutGuessing' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $r = stStatus($l, function () { return null; })->read('');
        stExpect($r['state'] === 'error' && $r['errorCode'] === 'invalid_hostname' && $r['configured'] === null && $r['downloads'] === array(), json_encode($r));
        stExpect(!isset($r['manualPaths']), 'the address step carries no manual file instruction');
    },
    'previousPairRunsOnlyWhenAllRequiredPeersServeItsLeaf' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $f = stCert($root, 'cti', 'IP:172.16.32.70'); stPutPrevious($l, $f); $sha = stSha($f['cert']);
        $r = stStatus($l, stAll($sha))->read('');
        stExpect($r['state'] === 'running' && $r['source'] === 'previous' && $r['errorCode'] === null && $r['configuredGeneration'] === $sha
            && $r['configured']['sha256'] === $sha && $r['downloads'] === array('server') && $r['trust']['kind'] === 'self_signed', json_encode($r));
        stExpect(strpos(json_encode($r), 'PRIVATE KEY') === false && strpos(json_encode($r), 'BEGIN') === false, 'public facts only, no key or PEM');
        $r = stStatus($l, function () { return null; })->read('');
        stExpect($r['state'] === 'pending' && $r['errorCode'] === null, 'unreachable peers are pending, never running: ' . $r['state']);
        $r = stStatus($l, function ($service) use ($sha) { return $service === 'nats' ? str_repeat('a', 64) : $sha; })->read('');
        stExpect($r['state'] === 'mixed' && $r['runtime']['nats']['state'] === 'different', 'a different peer is mixed');
    },
    'optionalProxyIsRequiredOnlyWhenMonitorRunsIt' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $f = stCert($root, 'cti', 'IP:172.16.32.70'); stPutPrevious($l, $f); $sha = stSha($f['cert']);
        $probe = function ($service) use ($sha) { return $service === 'proxy' ? null : $sha; };
        file_put_contents($l['conf'] . '/monitord.json', json_encode(array('daemons' => array(array('path' => '/bin/amid')))));
        $r = stStatus($l, $probe)->read('');
        stExpect($r['state'] === 'running' && $r['runtime']['proxy']['required'] === false, 'proxy not run: not required');
        file_put_contents($l['conf'] . '/monitord.json', json_encode(array('daemons' => array(array('path' => '/bin/proxyd')))));
        $r = stStatus($l, $probe)->read('');
        stExpect($r['state'] === 'pending' && $r['runtime']['proxy']['required'] === true, 'proxy run: required');
    },
    'addressMustBeCoveredAndExpiredOrForeignPairsAreNotSelected' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $f = stCert($root, 'cti', 'IP:172.16.32.70'); stPutPrevious($l, $f);
        $r = stStatus($l, stAll(stSha($f['cert'])), function () { return array('state' => 'absent'); })->read('pbx.test');
        stExpect($r['configured'] === null && $r['state'] === 'error' && $r['errorCode'] === 'tls_apply_required', 'name mismatch is not configured: ' . json_encode($r));
        $r = stStatus($l, stAll(stSha($f['cert'])))->read('172.16.32.70');
        stExpect($r['state'] === 'running' && $r['source'] === 'previous', 'a covering address keeps the previous pair');
        $l2 = stLayout($root, $n); stPutPrevious($l2, stCert($root, 'old', 'IP:172.16.32.70', 0));
        $r = stStatus($l2, function () { return null; })->read('');
        stExpect($r['configured'] === null && $r['errorCode'] === 'invalid_hostname', 'an expired pair is not selected');
    },
    'ownPairIsPreferredOverThePreviousPair' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $prev = stCert($root, 'p', 'DNS:pbx.test'); $own = stCert($root, 'o', 'DNS:pbx.test'); stPutPrevious($l, $prev); stPutOwn($l, $own['cert'], $own);
        $r = stStatus($l, stAll(stSha($own['cert'])))->read('pbx.test');
        stExpect($r['state'] === 'running' && $r['source'] === 'own' && $r['configuredGeneration'] === stSha($own['cert']), json_encode($r));
    },
    'nothingSelectedWithAnAddressReportsTheRecordedApplyOutcome' => function () use ($root, &$n) {
        // No source re-read: nothing recorded yet is "Save to apply"; otherwise exactly the code the apply path recorded.
        $l = stLayout($root, $n);
        $r = stStatus($l, function () { return null; })->read('pbx.test');
        stExpect($r['state'] === 'error' && $r['errorCode'] === 'tls_apply_required' && $r['configured'] === null && !isset($r['manualPaths']), json_encode($r));
        foreach (array('tls_prepare_failed', 'installed_pair_unusable', 'unsafe_state', 'source_unreadable', 'source_selection_unknown', 'unsupported_core') as $code) {
            \Modules\ModuleCTIClient\Lib\CtiTlsSetupPending::record($l['conf'], $code);
            $r = stStatus($l, function () { return null; })->read('pbx.test');
            stExpect($r['state'] === 'error' && $r['errorCode'] === $code && $r['configured'] === null, $code . ' => ' . json_encode($r));
            stExpect($r['manualPaths'] === array('cert' => $l['conf'] . '/tls/cti.crt', 'key' => $l['conf'] . '/tls/cti.key'), 'exact manual file paths');
            stExpect(strpos(json_encode($r), 'PRIVATE KEY') === false, 'no key material in status');
        }
        $r = stStatus($l, function () { return null; })->read('');
        stExpect($r['errorCode'] === 'invalid_hostname' && !isset($r['manualPaths']), 'no address: the address step wins over a recorded outcome');
    },
    'caIssuedLeafAlwaysOffersPublicLeafPlusAnyAvailableChain' => function () use ($root, &$n) {
        $ca = stCert($root, 'root', '', 30, null, true); $mid = stCert($root, 'mid', '', 30, $ca, true); $leaf = stCert($root, 'leaf', 'DNS:pbx.test', 30, $mid);
        $cases = array('root-in-bundle' => array($leaf['cert'] . $mid['cert'] . $ca['cert'], array('server', 'root'), $ca['cert']),
            'root-omitted' => array($leaf['cert'] . $mid['cert'], array('server', 'intermediates'), $mid['cert']),
            'leaf-only' => array($leaf['cert'], array('server'), null));
        foreach ($cases as $label => $c) {
            $l = stLayout($root, $n); stPutOwn($l, $c[0], $leaf); $sha = stSha($leaf['cert']);
            // The mid/ca chain is verified with the real inspector: a root that is not self-issued/trusted by the bundle is not offered.
            $status = stStatus($l, stAll($sha)); $r = $status->read('pbx.test');
            stExpect($r['downloads'] === $c[1] && $r['trust']['kind'] === 'ca_issued' && $r['publicPath'] === $l['conf'] . '/tls/cti.crt', $label . ' => ' . json_encode($r));
            $server = $status->download('server', $sha, 'pbx.test');
            stExpect(trim($server) === trim($leaf['cert']) && strpos($server, 'PRIVATE') === false, $label . ': only the public leaf is returned');
            if ($c[2] !== null) {
                $pem = $status->download($c[1][1], $sha, 'pbx.test');
                stExpect(trim($pem) === trim($c[2]) && strpos($pem, 'PRIVATE') === false, $label . ': only the public CA PEM is returned');
            }
            foreach (array('server', 'root', 'intermediates') as $kind) {
                if (in_array($kind, $c[1], true)) { continue; }
                try { $status->download($kind, $sha, 'pbx.test'); stExpect(false, $label . ': ' . $kind . ' must not be offered'); }
                catch (RuntimeException $e) { stExpect($e->getMessage() === 'certificate_conflict', 'conflict, got ' . $e->getMessage()); }
            }
        }
    },
    'selfSignedLeafDownloadIsBoundToTheShownLeaf' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $f = stCert($root, 'cti', 'IP:172.16.32.70'); stPutPrevious($l, $f); $sha = stSha($f['cert']);
        $s = stStatus($l, stAll($sha)); $s->read('');
        $pem = $s->download('server', $sha, '');
        stExpect(trim($pem) === trim($f['cert']) && strpos($pem, 'PRIVATE') === false, 'the public leaf only');
        foreach (array(str_repeat('0', 64), 'nothex') as $bad) {
            try { $s->download('server', $bad, ''); stExpect(false, 'a stale leaf digest must conflict'); }
            catch (RuntimeException $e) { stExpect($e->getMessage() === 'certificate_conflict', $e->getMessage()); }
        }
    },
    'statusNeverWritesOrCreatesAnything' => function () use ($root, &$n) {
        $l = stLayout($root, $n); $f = stCert($root, 'cti', 'IP:172.16.32.70'); stPutPrevious($l, $f);
        $snapshot = function ($d) use (&$snapshot) { $o = array(); foreach (scandir($d) as $x) { if ($x === '.' || $x === '..') { continue; }
            $p = $d . '/' . $x; $o[$x] = is_dir($p) ? $snapshot($p) : array(md5_file($p), filemtime($p)); } return $o; };
        $before = array($snapshot($l['conf']), $snapshot($l['module']));
        stStatus($l, stAll(stSha($f['cert'])))->read(''); stStatus($l, function () { return null; }, function () { return array('state' => 'absent'); })->read('pbx.test');
        stExpect($before === array($snapshot($l['conf']), $snapshot($l['module'])), 'GET status is read-only');
    },
    'actualTlsPeersAreProbedWithoutSendingApplicationBytes' => function () use ($root, &$n) {
        if (!function_exists('pcntl_fork')) { echo "UNAVAILABLE real TLS peers (no pcntl)\n"; return; }
        $l = stLayout($root, $n); $f = stCert($root, 'cti', 'DNS:pbx.test'); stPutPrevious($l, $f);
        $bundle = $root . '/peer-' . $n . '.pem'; file_put_contents($bundle, $f['cert'] . $f['key']);
        $targets = array(); $children = array();
        try {
            foreach (array('api', 'nats', 'proxy') as $service) {
                $context = stream_context_create(array('ssl' => array('local_cert' => $bundle)));
                $server = stream_socket_server('tcp://127.0.0.1:0', $errno, $error, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $context);
                stExpect($server !== false, 'fixture socket');
                $targets[$service] = (int) substr(strrchr(stream_socket_get_name($server, false), ':'), 1);
                $pid = pcntl_fork();
                if ($pid === 0) {
                    $client = stream_socket_accept($server, 4); if (!$client) { exit(2); }
                    stream_set_timeout($client, 2);
                    if ($service === 'nats') { fwrite($client, 'INFO {"tls_required":true}' . "\r\n"); }
                    if (stream_socket_enable_crypto($client, true, STREAM_CRYPTO_METHOD_TLS_SERVER) !== true) { exit(3); }
                    $bytes = fread($client, 64); fclose($client); fclose($server);
                    exit($bytes === '' ? 0 : 4); // TLS must come first; status never sends CONNECT/HTTP/auth bytes
                }
                $children[] = $pid; fclose($server);
            }
            $r = (new CtiTlsStatus($l['conf'], $l['module'], array('targets' => $targets)))->read('');
            stExpect($r['state'] === 'running', 'actual TLS peers: ' . json_encode($r));
            foreach ($children as $pid) { pcntl_waitpid($pid, $status); stExpect(pcntl_wifexited($status) && pcntl_wexitstatus($status) === 0, 'no application bytes sent'); }
            $children = array();
        } finally { foreach ($children as $pid) { posix_kill($pid, 15); pcntl_waitpid($pid, $status); } }
    },
);
$fail = 0;
try {
    if (!extension_loaded('openssl')) { throw new RuntimeException('OpenSSL is required; not a PASS'); }
    foreach ($cases as $name => $case) {
        if (isset($argv[1]) && $argv[1] !== $name) { continue; }
        try { $case(); echo 'PASS ' . $name . "\n"; }
        catch (Exception $e) { ++$fail; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
        catch (Error $e) { ++$fail; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
    }
} finally { stRemove($root); }
echo $fail ? "FAILED $fail\n" : "PASS CtiTlsStatus\n";
exit($fail ? 1 : 0);
}
