<?php
namespace Modules\ModuleCTIClient\Lib {
    // Только тестовый шов: не меняет публичный DTO и не запускает fake PID в ОС.
    function function_exists($name) {
        $fake = !empty($GLOBALS['inspectorLifecycle']);
        $value = $fake && strpos($name, 'pcntl_') === 0 ? true
            : ($fake && strpos($name, 'posix_') === 0 ? true : \function_exists($name));
        if ($fake && $name === 'openssl_x509_verify') { $value = false; }
        if (isset($GLOBALS['inspectorTrace'])) { $GLOBALS['inspectorTrace'][] = array('capability', $name, $value); }
        return $value;
    }
    function microtime($float = false) {
        if (!empty($GLOBALS['inspectorLifecycle'])) {
            $GLOBALS['inspectorClock'] += 0.1; return $GLOBALS['inspectorClock'];
        }
        return \microtime($float);
    }
    function usleep($microseconds) { if (empty($GLOBALS['inspectorLifecycle'])) { \usleep($microseconds); } }
    function is_file($path) {
        if (!empty($GLOBALS['inspectorLifecycle'])
            && in_array($path, array('/usr/bin/openssl', '/usr/local/bin/openssl'), true)) {
            $GLOBALS['inspectorTrace'][] = array('fake_binary', 'is_file', $path);
            return true;
        }
        return \is_file($path);
    }
    function is_executable($path) {
        if (!empty($GLOBALS['inspectorLifecycle'])
            && in_array($path, array('/usr/bin/openssl', '/usr/local/bin/openssl'), true)) {
            $GLOBALS['inspectorTrace'][] = array('fake_binary', 'is_executable', $path);
            return true;
        }
        return \is_executable($path);
    }
    function mkdir($path, $mode = 0777, $recursive = false) {
        if (strpos(basename($path), 'cti-verify-') === 0) { $GLOBALS['inspectorVerifyDir'] = $path; }
        return \mkdir($path, $mode, $recursive);
    }
    function proc_open($command, $descriptors, &$pipes, $cwd = null, $env = null, $options = array()) {
        if (empty($GLOBALS['inspectorLifecycle'])) { return \proc_open($command, $descriptors, $pipes, $cwd, $env, $options); }
        $GLOBALS['inspectorTrace'][] = array('unsafe_proc_open');
        $pipes = array(fopen('php://temp', 'w+')); return fopen('php://temp', 'w+');
    }
    function proc_get_status($process) {
        return empty($GLOBALS['inspectorLifecycle']) ? \proc_get_status($process)
            : array('running' => true, 'exitcode' => -1);
    }
    function proc_terminate($process, $signal = 15) {
        if (empty($GLOBALS['inspectorLifecycle'])) { return \proc_terminate($process, $signal); }
        $GLOBALS['inspectorTrace'][] = array('unsafe_terminate', false); return false;
    }
    function proc_close($process) {
        if (empty($GLOBALS['inspectorLifecycle'])) { return \proc_close($process); }
        throw new \RuntimeException('blocking proc_close on live child after failed termination');
    }
    function pcntl_fork() {
        if (empty($GLOBALS['inspectorLifecycle'])) { return \pcntl_fork(); }
        $GLOBALS['inspectorForks']++;
        $GLOBALS['inspectorTrace'][] = array('fork', $GLOBALS['inspectorLifecycle']);
        file_put_contents($GLOBALS['inspectorVerifyDir'] . '/stderr', 'certificate signature failure');
        return $GLOBALS['inspectorLifecycle'] === 'forkFailure' ? -1 : 12345;
    }
    function pcntl_waitpid($pid, &$status, $flags = 0) {
        if (empty($GLOBALS['inspectorLifecycle'])) {
            $result = \pcntl_waitpid($pid, $status, $flags);
            if (isset($GLOBALS['inspectorTrace'])) { $GLOBALS['inspectorTrace'][] = array('wait', $pid, $result, 'status' => $status,
                'exit' => $result === $pid && \pcntl_wifexited($status) ? \pcntl_wexitstatus($status) : null,
                'phase' => $result === $pid ? 'reaped' : 'poll', 'at' => \microtime(true)); }
            return $result;
        }
        if ($flags !== 1) { throw new \RuntimeException('blocking wait is forbidden'); }
        $mode = $GLOBALS['inspectorLifecycle'];
        $done = $mode === 'completedInvalid' || !empty($GLOBALS['inspectorKilled']);
        $GLOBALS['inspectorTrace'][] = array('wait', $pid, $done ? $pid : 0);
        $status = $mode === 'completedInvalid' ? 512 : 15;
        return $done ? $pid : 0;
    }
    function openssl_x509_verify($cert, $key) {
        // Synthetic seam: a verification that cannot be decided (-1), for chosen certificate/issuer-key pairs only.
        if (!empty($GLOBALS['inspectorVerifyHook'])) {
            $forced = call_user_func($GLOBALS['inspectorVerifyHook'], $cert, \openssl_pkey_get_details($key)['key']);
            if ($forced !== null) { return $forced; }
        }
        $started = \microtime(true); $result = \openssl_x509_verify($cert, $key);
        if (isset($GLOBALS['inspectorTrace'])) {
            $GLOBALS['inspectorTrace'][] = array('native_verify', 'result' => $result,
                'seconds' => \microtime(true) - $started);
        }
        return $result;
    }
    function pcntl_wifexited($status) {
        return empty($GLOBALS['inspectorLifecycle']) ? \pcntl_wifexited($status) : $status === 512;
    }
    function pcntl_wexitstatus($status) {
        return empty($GLOBALS['inspectorLifecycle']) ? \pcntl_wexitstatus($status) : 2;
    }
    function posix_kill($pid, $signal) {
        if (empty($GLOBALS['inspectorLifecycle'])) {
            $ok = \posix_kill($pid, $signal);
            if (isset($GLOBALS['inspectorTrace'])) { $GLOBALS['inspectorTrace'][] = array('signal', $pid, $signal, $ok); }
            return $ok;
        }
        if ($pid !== 12345) { throw new \RuntimeException('signal to unowned or invalid PID'); }
        $mode = $GLOBALS['inspectorLifecycle'];
        $ok = $mode !== 'unreaped' && !($mode === 'termFailure' && $signal === 15);
        if ($ok && ($signal === 9 || ($signal === 15 && $mode === 'timeout'))) { $GLOBALS['inspectorKilled'] = true; }
        $GLOBALS['inspectorTrace'][] = array('signal', $pid, $signal, $ok);
        return $ok;
    }
}
namespace {
require_once dirname(__DIR__) . '/Lib/TlsCertificateInspector.php';
require_once dirname(__DIR__) . '/Lib/TlsCertificate.php';
use Modules\ModuleCTIClient\Lib\TlsCertificateInspector as Inspector;
use Modules\ModuleCTIClient\Lib\TlsCertificate;

function expectInspector($condition, $message) {
    if (!$condition) { throw new RuntimeException($message); }
}
function fixtureCertificate(
    $dir, $san, $eku = 'serverAuth', $issuer = null, $ca = false, $usage = null,
    $commonName = 'same DN', $pathlen = null, $identifiers = false, $sanConfig = null
) {
    $started = microtime(true);
    $config = $dir . '/fixture.cnf';
    file_put_contents($config, "[req]\ndistinguished_name=dn\n[dn]\n[ext]\nbasicConstraints=critical,CA:"
        . ($ca ? 'TRUE' : 'FALSE') . ($pathlen === null ? '' : ',pathlen:' . (int) $pathlen)
        . ($sanConfig === null ? "\nsubjectAltName=DNS:" . $san . "\n" : $sanConfig)
        . 'extendedKeyUsage=' . $eku
        . "\nkeyUsage=" . ($usage === null ? ($ca ? 'keyCertSign,cRLSign' : 'digitalSignature,keyEncipherment') : $usage)
        . "\nsubjectKeyIdentifier=hash\n"
        . ($identifiers || $pathlen !== null ? "authorityKeyIdentifier=keyid:always\n" : '')
        . ($sanConfig === null ? '' : "\n[san]\n" . $san));
    $options = array('config' => $config, 'digest_alg' => 'sha256', 'x509_extensions' => 'ext');
    $key = openssl_pkey_new(array('config' => $config, 'private_key_bits' => 2048,
        'private_key_type' => OPENSSL_KEYTYPE_RSA));
    expectInspector($key !== false, 'fixture key');
    $csr = openssl_csr_new(array('commonName' => $commonName), $key, $options);
    expectInspector($csr !== false, 'fixture CSR');
    $cert = openssl_csr_sign($csr, $issuer === null ? null : $issuer['cert'],
        $issuer === null ? $key : $issuer['key'], 30, $options, mt_rand(1, 100000000));
    expectInspector($cert !== false && openssl_x509_export($cert, $pem), 'fixture certificate');
    expectInspector(openssl_pkey_export($key, $keyPem, null, $options), 'fixture key export');
    echo 'DIAG fixture san=' . $san . ' subject=' . $commonName . ' seconds=' . (microtime(true) - $started) . "\n";
    return array('cert' => $pem, 'key' => $keyPem);
}
// Меняем только сроки в DER и заново подписываем реальным fixture-ключом.
function fixtureDerPart($der, &$offset) {
    $start = $offset++; $length = ord($der[$offset++]);
    if ($length & 128) {
        $bytes = $length & 127; $length = 0;
        while ($bytes-- > 0) { $length = ($length << 8) | ord($der[$offset++]); }
    }
    $offset += $length;
    return substr($der, $start, $offset - $start);
}
function fixtureDerWrap($tag, $value) {
    $length = strlen($value);
    if ($length < 128) { return chr($tag) . chr($length) . $value; }
    $bytes = '';
    while ($length > 0) { $bytes = chr($length & 255) . $bytes; $length >>= 8; }
    return chr($tag) . chr(128 | strlen($bytes)) . $bytes . $value;
}
function fixtureDates($fixture, $from, $to) {
    $der = base64_decode(preg_replace('/-----[^-]+-----|\s/', '', $fixture['cert']));
    $offset = 1; $length = ord($der[$offset++]);
    if ($length & 128) { $offset += $length & 127; }
    $tbs = fixtureDerPart($der, $offset); $algorithm = fixtureDerPart($der, $offset);
    $parsed = openssl_x509_parse($fixture['cert']);
    $tbs = str_replace(array(gmdate('ymdHis\Z', $parsed['validFrom_time_t']),
        gmdate('ymdHis\Z', $parsed['validTo_time_t'])), array(gmdate('ymdHis\Z', $from), gmdate('ymdHis\Z', $to)), $tbs);
    expectInspector(openssl_sign($tbs, $signature, $fixture['key'], OPENSSL_ALGO_SHA256), 'fixture resign');
    $der = fixtureDerWrap(48, $tbs . $algorithm . fixtureDerWrap(3, "\0" . $signature));
    return "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END CERTIFICATE-----\n";
}
function inspectFixture($fixture, $hostname = 'pbx.test', $chain = '') {
    return Inspector::inspect($fixture['cert'], $fixture['key'], $hostname, $chain);
}
function fixtureWithNames($dir, $names, $subject = 'pbx.test') {
    return fixtureCertificate($dir, $names, 'serverAuth', null, false, null, $subject, null, false,
        $names === '' ? "\n" : "\nsubjectAltName=@san\n");
}
function expectInspectorError($result, $code) {
    expectInspector($result['ok'] === false && $result['errorCode'] === $code, 'expected ' . $code . ': ' . json_encode($result));
}
function inspectorFixture($name, $dir) {
    static $fixtures = array();
    if (!isset($fixtures[$name])) { $fixtures[$name] = fixtureCertificate($dir, 'pbx.test'); }
    return $fixtures[$name];
}
if (!extension_loaded('openssl')) { throw new RuntimeException('OpenSSL is required; not a PASS'); }
$dir = sys_get_temp_dir() . '/cti-inspector-' . bin2hex(openssl_random_pseudo_bytes(12));
$mask = umask(0077); try { expectInspector(mkdir($dir, 0700), 'private fixture directory'); } finally { umask($mask); }
$failed = 0;
try {
    if (DIRECTORY_SEPARATOR === '/') {
        expectInspector((fileperms($dir) & 0777) === 0700, 'private POSIX fixture directory');
    }
    $cases = array(
        'selfSignedSan' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            $r = inspectFixture($good); expectInspector($r['ok'], json_encode($r));
            $c = $r['certificate'];
            expectInspector($c['selfSigned'] === true && $c['san'] === array('DNS:pbx.test'), 'self signature/SAN');
            expectInspector(preg_match('/^[a-f0-9]{64}$/D', $c['sha256']) === 1, 'SHA256');
            expectInspector(is_string($c['subject']) && is_string($c['issuer']) && is_int($c['notBefore'])
                && is_int($c['notAfter']) && count($c) === 7, 'public DTO fields');
            expectInspector(strpos(json_encode($r), 'PRIVATE KEY') === false, 'private DTO leak');
        },
        'typedSubjectAltNames' => function () use ($dir) {
            $fixture = fixtureWithNames($dir, "DNS.1=PBX.Test\nURI.1=https://example.test/a,b\n"
                . "email.1=ops@example.test\nIP.1=192.0.2.1\nIP.2=2001:db8::1\n"
                . "RID.1=1.2.3.4\notherName.1=1.2.3.4;UTF8:fixture name\ndirName.1=alt_dn\n[alt_dn]\nCN=fixture name\n");
            $r = inspectFixture($fixture, 'pbx.test');
            $d = Inspector::describe($fixture['cert']);
            $expected = array('DNS:PBX.Test', 'URI:https://example.test/a,b', 'email:ops@example.test',
                'IP Address:192.0.2.1', 'IP Address:2001:db8::1', 'Registered ID (DER):2a0304', 'otherName', 'DirName');
            expectInspector($r['ok'] && $d['ok'] && $r['certificate']['san'] === $expected
                && $d['certificate']['san'] === $expected, 'case and one metadata string per typed name');
            expectInspectorError(inspectFixture($fixture, 'example.test'), 'hostname_mismatch');
        },
        'singleLabelDnsCompanion' => function () use ($dir) {
            $fixture = fixtureWithNames($dir, "DNS.1=INTRANET\nDNS.2=PBX.Test\n");
            $r = inspectFixture($fixture);
            expectInspector($r['ok'] && $r['certificate']['san'] === array('DNS:INTRANET', 'DNS:PBX.Test'),
                'single-label SAN is descriptive, not a reason to reject a matching FQDN');
            expectInspectorError(inspectFixture($fixture, 'intranet'), 'invalid_hostname');
            expectInspectorError(inspectFixture($fixture, 'intranet.test'), 'hostname_mismatch');
            expectInspector(!Inspector::matchesDnsNames(array('*.test'), 'pbx.test'), 'no wildcard on a single-label suffix');
        },
        'quotedMailboxCompanion' => function () use ($dir) {
            $fixture = fixtureWithNames($dir, "email.1='\"ops desk\"@example.test'\nDNS.1=pbx.test\n");
            $r = inspectFixture($fixture);
            $d = Inspector::describe($fixture['cert']);
            $expected = array('email:"ops desk"@example.test', 'DNS:pbx.test');
            expectInspector($r['ok'] && $d['ok'] && $r['certificate']['san'] === $expected
                && $d['certificate']['san'] === $expected, 'printable quoted mailbox is a descriptive companion');
            expectInspectorError(inspectFixture($fixture, 'example.test'), 'hostname_mismatch');
        },
        'mailboxAndUriByteBounds' => function () {
            $decode = new ReflectionMethod(Inspector::class, 'decodeGeneralNames'); $decode->setAccessible(true);
            $mail = '"ops \" desk"@example.test';
            $names = $decode->invoke(null, fixtureDerWrap(0x30, fixtureDerWrap(0x81, $mail)));
            expectInspector($names === array('dns' => array(), 'ip' => array(), 'san' => array('email:' . $mail)),
                'escaped printable quoted local part is descriptive only');
            foreach (array(0x81 => array('ops desk@example.test', '"ops desk@example.test', '"ops desk" @example.test',
                '"ops desk"@example. test', "\"ops\t desk\"@example.test", "ops\0@example.test", "\x80@example.test"),
                0x86 => array('https://pbx.test/a b', "https://pbx.test/\nb", "https://pbx.test/\x80")) as $tag => $bad) {
                foreach ($bad as $value) {
                    expectInspector($decode->invoke(null, fixtureDerWrap(0x30, fixtureDerWrap($tag, $value))) === null,
                        'reject unsafe or misplaced bytes without using non-DNS values for proof');
                }
            }
        },
        'nonDnsAndMissingSanNeverMatch' => function () use ($dir) {
            foreach (array("URI.1=https://pbx.test/\nemail.1=ops@pbx.test\n", '') as $names) {
                $fixture = fixtureWithNames($dir, $names);
                expectInspectorError(inspectFixture($fixture), 'hostname_mismatch');
                $d = Inspector::describe($fixture['cert']);
                expectInspector($d['ok'] && $d['certificate']['san'] === ($names === '' ? array()
                    : array('URI:https://pbx.test/', 'email:ops@pbx.test')), 'descriptive SAN without DNS');
            }
        },
        'generalNamesRejectMalformedDer' => function () {
            expectInspector(method_exists(Inspector::class, 'decodeGeneralNames'), 'bounded GeneralNames decoder required');
            $decode = new ReflectionMethod(Inspector::class, 'decodeGeneralNames'); $decode->setAccessible(true);
            $name = fixtureDerWrap(0x82, 'pbx.test');
            // Анонимные ASN.1 фрагменты: без сертификатов и подписей.
            foreach (array('', "\x30\x00", "\x30\x80\0\0", "\x30\x81\x00", "\x30\x82\0\x80",
                "\x30\x84\x7f\xff\xff\xff", "\x30\x01", fixtureDerWrap(0x30, $name) . "\0",
                fixtureDerWrap(0x30, "\x86\x03a"), fixtureDerWrap(0x30, "\x87\x03abc"),
                fixtureDerWrap(0x30, fixtureDerWrap(0xa2, $name)), fixtureDerWrap(0x30, "\x88\x01\x80"),
                fixtureDerWrap(0x30, "\x89\x00"), fixtureDerWrap(0x30, str_repeat($name, 257)),
                fixtureDerWrap(0x30, fixtureDerWrap(0x86, str_repeat('a', 16384))),
                fixtureDerWrap(0x30, fixtureDerWrap(0xa0, "\x06\x01\x2a\xa0\x03\x30\x02\0"))) as $bytes) {
                expectInspector($decode->invoke(null, $bytes) === null, 'invalid GeneralNames bounds or tag');
            }
            $nested = "\x02\x01\x01";
            for ($i = 0; $i < 20; ++$i) { $nested = fixtureDerWrap(0x30, $nested); }
            $other = fixtureDerWrap(0xa0, "\x06\x01\x2a" . fixtureDerWrap(0xa0, $nested));
            expectInspector($decode->invoke(null, fixtureDerWrap(0x30, $other)) === null, 'nesting budget');
            $long = fixtureDerWrap(0x86, 'https://example.test/' . str_repeat('a', 140));
            expectInspector($decode->invoke(null, fixtureDerWrap(0x30, $long)) !== null, 'canonical long length');
        },
        'extensionsRejectDuplicateOrMalformedSan' => function () {
            expectInspector(method_exists(Inspector::class, 'decodeExtensions'), 'bounded extension decoding required');
            $decode = new ReflectionMethod(Inspector::class, 'decodeExtensions'); $decode->setAccessible(true);
            // Только синтетические TLV Extensions, не сертификаты.
            $oid = fixtureDerWrap(0x06, "\x55\x1d\x11");
            $value = fixtureDerWrap(0x04, fixtureDerWrap(0x30, fixtureDerWrap(0x82, 'pbx.test')));
            $san = fixtureDerWrap(0x30, $oid . $value);
            $critical = fixtureDerWrap(0x30, $oid . "\x01\x01\xff" . $value);
            expectInspector($decode->invoke(null, fixtureDerWrap(0x30, $critical))['dns'] === array('pbx.test'),
                'canonical critical SAN');
            $other = fixtureDerWrap(0x30, fixtureDerWrap(0x06, "\x2a\x03") . $value);
            expectInspector($decode->invoke(null, fixtureDerWrap(0x30, $other))['dns'] === array(), 'only SAN OID');
            foreach (array($san . $critical, fixtureDerWrap(0x30, $oid . $value . "\0"),
                fixtureDerWrap(0x30, $oid . "\x01\x01\x01" . $value),
                fixtureDerWrap(0x30, "\x06\x04\x80\x55\x1d\x11" . $value),
                fixtureDerWrap(0x30, $oid . "\x04\x01\x30")) as $bad) {
                expectInspector($decode->invoke(null, fixtureDerWrap(0x30, $bad)) === null,
                    'duplicate SAN or malformed extension');
            }
        },
        'generalNamesRejectInvalidDnsBytes' => function () {
            expectInspector(method_exists(Inspector::class, 'decodeGeneralNames'), 'typed DNS byte validation required');
            $decode = new ReflectionMethod(Inspector::class, 'decodeGeneralNames'); $decode->setAccessible(true);
            foreach (array('', ' pbx.test', 'pbx.test ', "pbx\0.test", "pbx.test\n", "t\xc3\xa9st.test",
                'pbx.test,other.test', 'a..test', 'pbx.test.', 'ab*.test', '*.*.test', str_repeat('a', 64) . '.test') as $bad) {
                $names = fixtureDerWrap(0x82, 'valid.test') . fixtureDerWrap(0x82, $bad);
                expectInspector($decode->invoke(null, fixtureDerWrap(0x30, $names)) === null,
                    'invalid DNS invalidates the entire name list without normalization');
            }
        },
        'wrongHostname' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            expectInspectorError(inspectFixture($good, 'other.test'), 'hostname_mismatch');
        },
        'wildcardOneLabelOnly' => function () use ($dir) {
            $wild = fixtureCertificate($dir, '*.pbx.test');
            expectInspector(inspectFixture($wild, 'one.pbx.test')['ok'], 'one-label wildcard');
            expectInspectorError(inspectFixture($wild, 'two.one.pbx.test'), 'hostname_mismatch');
            expectInspectorError(inspectFixture($wild, 'pbx.test'), 'hostname_mismatch');
        },
        'expired' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            $f = $good; $f['cert'] = fixtureDates($good, time() - 7200, time() - 3600);
            expectInspectorError(inspectFixture($f), 'expired');
        },
        'futureNotBefore' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            $f = $good; $f['cert'] = fixtureDates($good, time() + 3600, time() + 7200);
            expectInspectorError(inspectFixture($f), 'not_yet_valid');
        },
        'mismatchedKey' => function () use ($dir) {
            $other = inspectorFixture('other', $dir);
            $good = inspectorFixture('good', $dir);
            $f = $good; $f['key'] = $other['key']; expectInspectorError(inspectFixture($f), 'key_mismatch');
        },
        'clientAuthOnly' => function () use ($dir) {
            expectInspectorError(inspectFixture(fixtureCertificate($dir, 'pbx.test', 'clientAuth')), 'invalid_eku');
        },
        'sameDnWrongSignature' => function () use ($dir) {
            $other = inspectorFixture('other', $dir);
            $f = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $other);
            $GLOBALS['inspectorTrace'] = array(); $started = microtime(true);
            $r = inspectFixture($f); expectInspector($r['ok'], json_encode($r));
            expectInspector($r['certificate']['subject'] === $r['certificate']['issuer'], 'same DN fixture');
            echo 'DIAG sameDnWrongSignature selfSigned=' . json_encode($r['certificate']['selfSigned'])
                . ' inspectSeconds=' . (microtime(true) - $started)
                . ' trace=' . json_encode($GLOBALS['inspectorTrace']) . "\n";
            expectInspector($r['certificate']['selfSigned'] === false,
                'DN equality is not a signature: ' . json_encode($r));
        },
        'combinedPemDropsKey' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            $public = Inspector::exportPublic($good['key'] . $good['cert'] . $good['cert']);
            expectInspector($public === $good['cert'], 'normalize, deduplicate and drop private key');
            expectInspector(Inspector::exportPublic('garbage') === '', 'invalid PEM export');
            $f = $good; $f['cert'] .= $good['key'];
            expectInspector(inspectFixture($f)['ok'], 'combined input');
        },
        'stableFallback' => function () use ($dir) {
            $cert = $dir . '/server.crt'; $key = $dir . '/server.key';
            expectInspector(TlsCertificate::ensure($cert, $key, 'PBX.TEST'), 'fallback ensure');
            $pem = file_get_contents($cert); $secret = file_get_contents($key);
            $r = Inspector::inspect($pem, $secret, 'pbx.test'); expectInspector($r['ok'], json_encode($r));
            $parsed = openssl_x509_parse($pem);
            expectInspector($parsed['extensions']['subjectAltName'] === 'DNS:pbx.test', 'fallback SAN');
            expectInspector($parsed['extensions']['basicConstraints'] === 'CA:FALSE', 'not a CA');
            expectInspector(strpos($parsed['extensions']['extendedKeyUsage'], 'TLS Web Server Authentication') !== false, 'serverAuth');
            expectInspector($parsed['validTo_time_t'] - $parsed['validFrom_time_t'] === 3650 * 86400, '3650 days');
            expectInspector(openssl_pkey_get_details(openssl_pkey_get_private($secret))['bits'] === 2048, 'RSA2048');
            expectInspector($parsed['signatureTypeSN'] === 'RSA-SHA256', 'SHA256 signature');
            expectInspector(TlsCertificate::ensure($cert, $key, 'pbx.test'), 'stable ensure');
            $second = Inspector::inspect(file_get_contents($cert), file_get_contents($key), 'pbx.test');
            expectInspector($second['certificate']['sha256'] === $r['certificate']['sha256'], 'stable SHA');
            expectInspector(!TlsCertificate::ensure($cert, $key, 'other.test'), 'different hostname fails');
            expectInspector(file_get_contents($cert) === $pem && file_get_contents($key) === $secret, 'no silent reissue');
            if (DIRECTORY_SEPARATOR === '/') {
                expectInspector((fileperms($key) & 0777) === 0600 && (fileperms($cert) & 0777) === 0640, 'POSIX modes');
            } else { echo "UNAVAILABLE POSIX chmod semantics on Windows\n"; }
        },
        'invalidDomainCannotInjectOpenSslConfig' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            // Bare IP literals are CTI endpoints now (CtiIpEndpointTest) but never DNS names.
            foreach (array('127.0.0.1', '::1') as $ip) {
                expectInspector(Inspector::normalizeHostname($ip) === null && Inspector::normalizeEndpoint($ip) === $ip, 'IP is endpoint, not DNS');
            }
            foreach (array('127.0.0.1.', '127.1', '0x7f.0.0.1', '[::1]', '::1%lo') as $alias) {
                expectInspector(Inspector::normalizeEndpoint($alias) === null
                    && !TlsCertificate::ensure($dir . '/inject.crt', $dir . '/inject.key', $alias), 'IP-like alias: ' . $alias);
                expectInspectorError(inspectFixture($good, $alias), 'invalid_hostname');
            }
            foreach (array("pbx.test\n[evil]", 'pbx', '*.pbx.test', 'pbx.test.',
                'https://pbx.test', 'pbx.test:443', 'pbx.test/x', '-bad.test', 'a..test', "pbx\0.test",
                'tést.test', str_repeat('a', 64) . '.test', str_repeat('label.', 50) . 'test') as $bad) {
                expectInspector(Inspector::normalizeHostname($bad) === null, 'bad domain: ' . $bad);
                expectInspector(!TlsCertificate::ensure($dir . '/inject.crt', $dir . '/inject.key', $bad), 'unsafe generation');
                expectInspectorError(inspectFixture($good, $bad), 'invalid_hostname');
            }
            expectInspector(!file_exists($dir . '/inject.crt') && !file_exists($dir . '/inject.key.lock'), 'no unsafe side effects');
            expectInspector(Inspector::normalizeHostname('PBX.XN--P1AI') === 'pbx.xn--p1ai', 'ASCII lowercase/punycode');
        },
        'pathlenRollover' => function () use ($dir) {
            $root = fixtureCertificate($dir, 'root.test', 'serverAuth', null, true, null, 'root');
            $ca = fixtureCertificate($dir, 'ca.test', 'serverAuth', $root, true, null, 'rollover CA', 0);
            $rollover = fixtureCertificate($dir, 'ca.test', 'serverAuth', $ca, true, null, 'rollover CA', null, true);
            $leaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $rollover, false, null, 'leaf', null, true);
            $parsed = openssl_x509_parse($rollover['cert']);
            expectInspector($parsed['subject'] === $parsed['issuer'], 'self-issued fixture');
            if (function_exists('openssl_x509_verify')) {
                expectInspector(openssl_x509_verify($rollover['cert'], openssl_pkey_get_public($ca['cert'])) === 1,
                    'rollover signature by preceding CA');
                expectInspector(openssl_x509_verify($rollover['cert'], openssl_pkey_get_public($rollover['cert'])) === 0,
                    'self-issued is not self-signed');
            } else {
                echo "SKIP optional native fixture sanity: openssl_x509_verify unavailable; inspector chain still required\n";
            }
            $r = inspectFixture($leaf, 'pbx.test', $root['cert'] . $ca['cert'] . $rollover['cert']);
            expectInspector($r['ok'] && $r['publicChain'] === array($rollover['cert'], $ca['cert'], $root['cert']),
                'pathlen0 permits self-issued rollover: ' . json_encode($r));
        },
        'pathlenNonSelfIssued' => function () use ($dir) {
            $ca = fixtureCertificate($dir, 'ca.test', 'serverAuth', null, true, null, 'ca', 0);
            $sub = fixtureCertificate($dir, 'sub.test', 'serverAuth', $ca, true, null, 'sub');
            $leaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $sub, false, null, 'leaf');
            expectInspectorError(inspectFixture($leaf, 'pbx.test', $sub['cert'] . $ca['cert']), 'invalid_chain');
        },
        'indeterminateVerificationIsNotInvalidChain' => function () use ($dir) {
            $root = fixtureCertificate($dir, 'root.test', 'serverAuth', null, true, null, 'root');
            $mid = fixtureCertificate($dir, 'ca.test', 'serverAuth', $root, true, null, 'intermediate');
            $leaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $mid, false, null, 'leaf');
            $wrong = fixtureCertificate($dir, 'wrong.test', 'serverAuth', null, true, null, 'intermediate');
            $other = fixtureCertificate($dir, 'other.test', 'serverAuth', null, true, null, 'other');
            $fp = function ($pem) { return openssl_x509_fingerprint($pem, 'sha256'); };
            $key = function ($fixture) { return openssl_pkey_get_details(openssl_pkey_get_public($fixture['cert']))['key']; };
            $undecided = function ($child, $issuer) use ($fp, $key) {
                return function ($cert, $publicKey) use ($child, $issuer, $fp, $key) {
                    return $fp($cert) === $fp($child['cert']) && $publicKey === $key($issuer) ? -1 : null;
                };
            };
            $run = function ($hook, $chain) use ($leaf) {
                $GLOBALS['inspectorVerifyHook'] = $hook;
                try { return inspectFixture($leaf, 'pbx.test', $chain); } finally { unset($GLOBALS['inspectorVerifyHook']); }
            };
            // Controls: determinate outcomes are unchanged.
            expectInspector($run(null, $mid['cert'])['ok'], 'proved link');
            expectInspectorError($run(null, $wrong['cert']), 'invalid_chain');
            expectInspectorError($run(null, $mid['cert'] . $wrong['cert']), 'invalid_chain');
            expectInspectorError($run(null, $mid['cert'] . $root['cert'] . $other['cert']), 'invalid_chain');
            // The only DN-matching candidate cannot be checked.
            expectInspectorError($run($undecided($leaf, $mid), $mid['cert']), 'chain_verification_unavailable');
            expectInspectorError($run($undecided($leaf, $wrong), $wrong['cert']), 'chain_verification_unavailable');
            // One candidate is proved, an equally named one cannot be checked: uniqueness is unproven, not disproved.
            expectInspectorError($run($undecided($leaf, $wrong), $mid['cert'] . $wrong['cert']), 'chain_verification_unavailable');
            // Self-issued link whose root-ness cannot be checked: with leftovers the answer would differ.
            expectInspectorError($run($undecided($root, $root), $mid['cert'] . $root['cert'] . $other['cert']), 'chain_verification_unavailable');
            $accepted = $run($undecided($root, $root), $mid['cert'] . $root['cert']);
            expectInspector($accepted['ok'] && $accepted['publicChain'] === array($mid['cert'], $root['cert']),
                'an unprovable root changes nothing when no certificate is left over: ' . json_encode($accepted));
        },
        'lifecycleControl' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            $flag = new ReflectionProperty(Inspector::class, 'cliUnavailable'); $flag->setAccessible(true);
            $before = $flag->getValue();
            try {
                foreach (array('completedInvalid', 'timeout', 'termFailure', 'ignoreTerm', 'forkFailure', 'unreaped') as $mode) {
                    $GLOBALS['inspectorLifecycle'] = $mode; $GLOBALS['inspectorClock'] = 0;
                    $GLOBALS['inspectorKilled'] = false; $GLOBALS['inspectorForks'] = 0;
                    $GLOBALS['inspectorTrace'] = array();
                    $r = inspectFixture($good);
                    $actual = $r['certificate']['selfSigned'];
                    echo 'DIAG lifecycle=' . $mode . ' selfSigned=' . json_encode($actual)
                        . ' virtualSeconds=' . $GLOBALS['inspectorClock']
                        . ' trace=' . json_encode($GLOBALS['inspectorTrace']) . "\n";
                    expectInspector($r['ok'] && $actual === ($mode === 'completedInvalid' ? false : null),
                        'lifecycle classification: ' . json_encode($r));
                    $signals = array();
                    foreach ($GLOBALS['inspectorTrace'] as $event) {
                        if ($event[0] === 'signal') { $signals[] = $event[2]; }
                    }
                    if ($mode === 'termFailure' || $mode === 'ignoreTerm' || $mode === 'unreaped') {
                        expectInspector($signals === array(15, 9), 'TERM then KILL required');
                    }
                    if ($mode === 'timeout') { expectInspector($signals === array(15), 'TERM exit confirmed'); }
                    if ($mode === 'forkFailure') { expectInspector(!$signals, 'never signal failed fork'); }
                    expectInspector($GLOBALS['inspectorClock'] < 5, 'bounded virtual process lifecycle');
                    if ($mode === 'unreaped') {
                        $retained = $GLOBALS['inspectorVerifyDir'];
                        expectInspector(is_dir($retained), 'do not delete files used by unreaped child');
                        inspectFixture($good);
                        expectInspector($GLOBALS['inspectorForks'] === 1, 'disable further spawns after unreaped child');
                        // Здесь PID только fake: реального процесса и занятых файлов нет.
                        foreach (glob($retained . '/*') as $p) { is_dir($p) ? rmdir($p) : unlink($p); }
                        rmdir($retained);
                    } else {
                        expectInspector(!is_dir($GLOBALS['inspectorVerifyDir']), 'reaped/no-child cleanup');
                    }
                }
            } finally {
                $flag->setValue(null, $before);
                unset($GLOBALS['inspectorLifecycle']);
            }
        },
        'lifecyclePosix' => function () use ($dir) {
            expectInspector(PHP_SAPI === 'cli' && function_exists('pcntl_fork') && function_exists('posix_kill'),
                'actual POSIX runtime required, not a Windows PASS');
            $method = new ReflectionMethod(Inspector::class, 'runVerifier'); $method->setAccessible(true);
            foreach (array(false, true) as $ignoreTerm) {
                $work = $dir . '/child-' . ($ignoreTerm ? 'ignore' : 'term'); mkdir($work, 0700);
                $code = 'file_put_contents($argv[1], (string)getmypid());'
                    . ($ignoreTerm ? 'pcntl_signal(SIGTERM, SIG_IGN);' : '') . 'while(true){usleep(10000);}';
                $GLOBALS['inspectorTrace'] = array(); $started = microtime(true);
                $r = $method->invoke(null, PHP_BINARY, array('-r', $code, $work . '/pid'), $work);
                $elapsed = microtime(true) - $started;
                echo 'DIAG actualPosix ignoreTerm=' . json_encode($ignoreTerm) . ' result=' . json_encode($r)
                    . ' seconds=' . $elapsed . ' trace=' . json_encode($GLOBALS['inspectorTrace']) . "\n";
                expectInspector($r['reason'] === 'timeout' && $r['reaped'] && $elapsed < 5, 'bounded actual reap');
                $pid = (int) file_get_contents($work . '/pid');
                expectInspector($pid === $r['pid'] && $pid > 0 && !posix_kill($pid, 0), 'owned child terminated/reaped');
                foreach (glob($work . '/*') as $file) { unlink($file); } rmdir($work);
            }
        },
        'linkedChainOnly' => function () use ($dir) {
            $root = fixtureCertificate($dir, 'root.test', 'serverAuth', null, true, null, 'root');
            $intermediate = fixtureCertificate($dir, 'ca.test', 'serverAuth', $root, true, null, 'intermediate');
            $leaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $intermediate, false, null, 'leaf');
            // Порядок входа не важен; одноимённый чужой issuer ниже не должен пройти по DN.
            $r = inspectFixture($leaf, 'pbx.test', $root['cert'] . $intermediate['cert'] . $root['cert']);
            expectInspector($r['ok'] && $r['publicChain'] === array($intermediate['cert'], $root['cert']), 'linked ordered chain: ' . json_encode($r));
            $partial = inspectFixture($leaf, 'pbx.test', $intermediate['cert']);
            expectInspector($partial['ok'] && count($partial['publicChain']) === 1, 'partial chain accepted');
            expectInspector(inspectFixture($leaf)['ok'], 'missing root is not invalid');
            $alternate = fixtureDates($intermediate, time() - 60, time() + 86400);
            expectInspectorError(inspectFixture($leaf, 'pbx.test', $intermediate['cert'] . $alternate), 'invalid_chain');
            $wrong = fixtureCertificate($dir, 'wrong.test', 'serverAuth', null, true, null, 'intermediate');
            expectInspectorError(inspectFixture($leaf, 'pbx.test', $wrong['cert']), 'invalid_chain');
            expectInspectorError(inspectFixture($leaf, 'pbx.test', $intermediate['cert'] . $wrong['cert']), 'invalid_chain');
            expectInspectorError(inspectFixture($leaf, 'pbx.test', 'garbage'), 'invalid_chain');
            $notCa = fixtureCertificate($dir, 'notca.test');
            $badLeaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $notCa);
            expectInspectorError(inspectFixture($badLeaf, 'pbx.test', $notCa['cert']), 'invalid_chain');
            $noSign = fixtureCertificate($dir, 'ca.test', 'serverAuth', null, true, 'digitalSignature');
            $badLeaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $noSign);
            expectInspectorError(inspectFixture($badLeaf, 'pbx.test', $noSign['cert']), 'invalid_chain');
        }
    );
    // Реальный OS process probe требует явного selector, даже при доступном POSIX runtime.
    if (!isset($argv[1]) || $argv[1] === '--list-cases') {
        unset($cases['lifecyclePosix']);
        echo "SKIP lifecyclePosix: explicit selector required\n";
    }
    if (isset($argv[1]) && $argv[1] === 'unavailable-verifier') {
        $cases = array('unavailableVerifierIsUnknown' => function () use ($dir) {
            $good = inspectorFixture('good', $dir);
            $GLOBALS['inspectorTrace'] = array(); $started = microtime(true);
            $r = inspectFixture($good);
            echo 'DIAG unavailable selfSigned=' . json_encode($r['certificate']['selfSigned'])
                . ' seconds=' . (microtime(true) - $started) . ' trace=' . json_encode($GLOBALS['inspectorTrace']) . "\n";
            expectInspector(!function_exists('openssl_x509_verify') && !function_exists('pcntl_fork'),
                'unavailable test requires explicitly unavailable verifier capabilities');
            expectInspector($r['ok'] && $r['certificate']['selfSigned'] === null, 'unknown is not self-signed: ' . json_encode($r));
            $ca = fixtureCertificate($dir, 'ca.test', 'serverAuth', null, true, null, 'ca');
            $leaf = fixtureCertificate($dir, 'pbx.test', 'serverAuth', $ca);
            // A verifier that cannot run proves nothing about the chain: operational, not a defect of the certificate.
            expectInspectorError(inspectFixture($leaf, 'pbx.test', $ca['cert']), 'chain_verification_unavailable');
            expectInspectorError(inspectFixture($leaf, 'pbx.test', 'garbage'), 'invalid_chain');
        });
    }
    if (isset($argv[1]) && $argv[1] !== 'unavailable-verifier' && $argv[1] !== '--list-cases') {
        expectInspector(isset($cases[$argv[1]]), 'unknown case selector');
        $cases = array($argv[1] => $cases[$argv[1]]);
    }
    if (isset($argv[1]) && $argv[1] === '--list-cases') {
        echo 'DEFAULT_SELECTION ' . json_encode(array_keys($cases)) . "\n";
        $cases = array();
    }
    foreach ($cases as $name => $test) {
        if ($name === 'legacyCachedSanNeedsCertificateProof' && DIRECTORY_SEPARATOR !== '\\') {
            echo "SKIP $name: Windows modeled ownership required\n";
            continue;
        }
        echo 'CASE ' . $name . " start\n";
        try { $test(); echo "PASS $name\n"; }
        catch (Exception $e) { ++$failed; fwrite(STDERR, "FAIL $name: " . $e->getMessage() . "\n"); }
    }
} finally {
    foreach (glob($dir . '/*') as $file) { unlink($file); }
    rmdir($dir);
}
if ($failed) { exit(1); }
if (isset($argv[1]) && $argv[1] === '--list-cases') {
    echo "LIST ONLY: no cases executed\n";
} else {
    echo "PASS TlsCertificateInspector\n";
}
}
