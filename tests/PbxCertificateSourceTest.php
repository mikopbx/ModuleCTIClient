<?php
namespace Modules\ModuleCTIClient\Lib {
    function openssl_x509_export($cert, &$output) {
        if (isset($GLOBALS['sourceExportSubstitute'])) {
            $output = $GLOBALS['sourceExportSubstitute'];
            unset($GLOBALS['sourceExportSubstitute']);
            return true;
        }
        return \openssl_x509_export($cert, $output);
    }
}
namespace {
    use Modules\ModuleCTIClient\Lib\TlsCertificateInspector as Inspector;
    // Each bridge variant is a separate PHP process: old-core tests never load modern syntax.
    $bridge = isset($argv[1]) && $argv[1] === '--bridge' ? ($argv[2] ?? '') : '';
    if ($bridge !== '') {
        $defaults = $bridge === 'defaults-throws' ? 'throw new \\RuntimeException("defaults unavailable");'
            : ($bridge === 'unknown-defaults' ? 'return array("WebHTTPSPublicKey" => "", "WebHTTPSPrivateKey" => "");'
                : 'return array("WEBHTTPSPublicKey" => "", "WEBHTTPSPrivateKey" => "");');
        $defaultsMethod = $bridge === 'defaults-api-missing' ? '' : 'public static function getDefaultArrayValues() { ' . $defaults . ' }';
        $constants = $bridge === 'old' ? '' : 'const WEB_HTTPS_PUBLIC_KEY = "WEBHTTPSPublicKey"; const WEB_HTTPS_PRIVATE_KEY = "WEBHTTPSPrivateKey";';
        eval('namespace MikoPBX\\Common\\Models; class PbxSettings {
            public static $values = array();
            public static function getValueByKey($key) { return self::$values[$key] ?? ""; }
            ' . $defaultsMethod . $constants . '
        }');
        if ($bridge === 'modern' || $bridge === 'private') {
            $visibility = $bridge === 'private' ? 'private' : 'public';
            eval('namespace MikoPBX\\Core\\System; class SslCertificateService {
                ' . $visibility . ' const NGINX_CERT_FILE = "/etc/ssl/certs/nginx.crt";
                ' . $visibility . ' const NGINX_KEY_FILE = "/etc/ssl/private/nginx.key";
                public static function prepareNginxCertificates() { throw new \\RuntimeException("must not prepare"); }
                public static function prepareAsteriskCertificates() { throw new \\RuntimeException("must not prepare SIP"); }
            }');
        } elseif ($bridge === 'parse-error') {
            spl_autoload_register(function ($class) {
                if ($class === 'MikoPBX\\Core\\System\\SslCertificateService') {
                    throw new \ParseError('incompatible core syntax');
                }
            });
        }
    }
    require dirname(__DIR__) . '/Lib/TlsCertificateInspector.php';
    $sourceFile = dirname(__DIR__) . '/Lib/PbxCertificateSource.php';
    if (is_file($sourceFile)) { require $sourceFile; }

    function sourceAssert($condition, $message) {
        if (!$condition) { throw new \RuntimeException($message); }
    }
    function sourcePair($name, $dir, $withSan = true) {
        $config = $dir . '/openssl.cnf';
        file_put_contents($config, "[req]\ndistinguished_name=dn\n[dn]\n[v3]\nbasicConstraints=CA:FALSE\n"
            . ($withSan ? "subjectAltName=DNS:pbx.test\n" : ''));
        $key = openssl_pkey_new(array('private_key_bits' => 2048, 'config' => $config));
        $csr = openssl_csr_new(array('commonName' => $name), $key, array('config' => $config));
        $cert = openssl_csr_sign($csr, null, $key, 2, array('config' => $config, 'x509_extensions' => 'v3'));
        sourceAssert($cert !== false && openssl_x509_export($cert, $certPem)
            && openssl_pkey_export($key, $keyPem, null, array('config' => $config)), 'fixture generation');
        return array($certPem, $keyPem);
    }
    function sourceDer($tag, $value) {
        $length = strlen($value);
        $encoded = '';
        if ($length >= 128) {
            while ($length > 0) { $encoded = chr($length & 255) . $encoded; $length >>= 8; }
            $encoded = chr(128 + strlen($encoded)) . $encoded;
        } else { $encoded = chr($length); }
        return chr($tag) . $encoded . $value;
    }
    function sourcePkcs1($key) {
        $rsa = openssl_pkey_get_details(openssl_pkey_get_private($key))['rsa'];
        $integers = sourceDer(2, "\x00");
        foreach (array('n', 'e', 'd', 'p', 'q', 'dmp1', 'dmq1', 'iqmp') as $part) {
            $value = $rsa[$part];
            if (ord($value[0]) > 127) { $value = "\x00" . $value; }
            $integers .= sourceDer(2, $value);
        }
        return "-----BEGIN RSA PRIVATE KEY-----\n" . chunk_split(base64_encode(sourceDer(48, $integers)), 64, "\n")
            . "-----END RSA PRIVATE KEY-----\n";
    }
    function sourceRead($settings, $files, $mode = 'modern') {
        return \Modules\ModuleCTIClient\Lib\PbxCertificateSource::read(array(
            'platform' => function () use ($mode) {
                return array('mode' => $mode, 'certPath' => '/nginx/cert', 'keyPath' => '/nginx/key');
            },
            'settings' => function ($key) use ($settings) { return $settings[$key] ?? ''; },
            'file' => function ($path) use ($files) {
                sourceAssert($path === '/nginx/cert' || $path === '/nginx/key', 'must select Nginx, not SIP/first file');
                return $files[$path] ?? array('state' => 'absent');
            },
        ));
    }
    function sourceSettings($pair) {
        return array('WEBHTTPSPublicKey' => $pair[0], 'WEBHTTPSPrivateKey' => $pair[1]);
    }
    function sourceFiles($pair) {
        return array('/nginx/cert' => array('state' => 'present', 'pem' => $pair[0]),
            '/nginx/key' => array('state' => 'present', 'pem' => $pair[1]));
    }

    if ($bridge !== '') {
        try {
            sourceAssert(class_exists('Modules\\ModuleCTIClient\\Lib\\PbxCertificateSource'), 'adapter missing');
            $versions = array('old' => '2023.2.206', 'below-min' => '2023.1.223', 'missing-version' => '', 'bad-version' => 'unknown');
            \MikoPBX\Common\Models\PbxSettings::$values['PBXVersion'] = $versions[$bridge] ?? '2026.8.2';
            // Real platform discovery, injected read-only file bridge (no host /etc access).
            $r = \Modules\ModuleCTIClient\Lib\PbxCertificateSource::read(array('file' => function ($path) {
                sourceAssert(in_array($path, array('/etc/ssl/certs/nginx.crt', '/etc/ssl/private/nginx.key'), true), 'wrong platform-selected path');
                return array('state' => 'absent');
            }));
            $expected = in_array($bridge, array('old', 'modern'), true) ? 'absent' : 'error';
            sourceAssert($r['state'] === $expected, 'bridge state ' . $bridge);
            if ($expected === 'error') {
                sourceAssert($r['errorCode'] === 'unsupported_core', 'bridge controlled error');
                $noArgs = \Modules\ModuleCTIClient\Lib\PbxCertificateSource::read();
                sourceAssert($noArgs['state'] === 'error' && $noArgs['errorCode'] === 'unsupported_core', 'no-arg controlled bridge');
            }
            echo 'PASS bridge ' . $bridge . "\n";
            exit(0);
        } catch (\Throwable $e) { echo 'FAIL bridge ' . $bridge . ': ' . $e->getMessage() . "\n"; exit(1); }
    }

    $dir = sys_get_temp_dir() . '/cti-source-' . bin2hex(random_bytes(6));
    mkdir($dir, 0700);
    $pair = sourcePair('pbx.test', $dir);
    $other = sourcePair('other.test', $dir);
    $tests = array();
    $tests['selectedNginxNotSip'] = function () use ($pair, $other) {
        $files = sourceFiles($pair);
        $files['/sip/cert'] = array('state' => 'present', 'pem' => $other[0]);
        $r = sourceRead(sourceSettings($pair), $files);
        sourceAssert($r['state'] === 'present' && $r['certPem'] === $pair[0], 'selected Nginx pair');
    };
    $tests['configuredPairBeforeRuntime'] = function () use ($pair) {
        $r = sourceRead(sourceSettings($pair), array());
        sourceAssert($r['state'] === 'present' && $r['sourceId'] === 'pbx_https_configured_pending', 'pending settings are not absent');
    };
    $tests['runtimeSelfSignedIsPbxSource'] = function () use ($pair) {
        $r = sourceRead(array(), sourceFiles($pair));
        sourceAssert($r['state'] === 'present' && $r['sourceId'] === 'pbx_nginx', 'self-signed Nginx is PBX source');
    };
    $tests['emptySourceAbsent'] = function () {
        foreach (array('modern', 'old') as $mode) {
            sourceAssert(sourceRead(array(), array(), $mode)['state'] === 'absent', 'empty supported source');
        }
    };
    $tests['oneMissingError'] = function () use ($pair) {
        foreach (array(0, 1) as $missing) {
            $settings = sourceSettings($pair); unset($settings[$missing ? 'WEBHTTPSPrivateKey' : 'WEBHTTPSPublicKey']);
            sourceAssert(sourceRead($settings, array())['state'] === 'error', 'partial settings');
            $files = sourceFiles($pair); unset($files[$missing ? '/nginx/key' : '/nginx/cert']);
            sourceAssert(sourceRead(array(), $files)['state'] === 'error', 'partial runtime');
        }
    };
    $tests['permissionDeniedError'] = function () use ($pair) {
        $files = sourceFiles($pair); $files['/nginx/key'] = array('state' => 'error');
        foreach (array(array(), sourceSettings($pair)) as $settings) {
            $r = sourceRead($settings, $files);
            sourceAssert($r['state'] === 'error' && $r['errorCode'] === 'source_unreadable', 'unreadable never absent/pending');
        }
    };
    $tests['unsupportedCoreError'] = function () {
        $r = sourceRead(array(), array(), 'unsupported');
        sourceAssert($r['state'] === 'error' && $r['errorCode'] === 'unsupported_core', 'unknown adapter never absent');
    };
    $tests['sameIdentityDifferentPem'] = function () use ($pair, $other) {
        $formatted = array(str_replace("\n", "\r\n", $pair[0]) . $other[0], sourcePkcs1($pair[1]));
        sourceAssert(strpos($formatted[1], 'BEGIN RSA PRIVATE KEY') !== false && $formatted[1] !== $pair[1], 'different private-key PEM encoding fixture');
        $r = sourceRead(sourceSettings($formatted), sourceFiles($pair));
        sourceAssert($r['state'] === 'present', 'same leaf/key identity despite whitespace/fullchain layout');
    };
    $tests['mismatchError'] = function () use ($pair, $other) {
        $r = sourceRead(sourceSettings($pair), sourceFiles($other));
        sourceAssert($r['state'] === 'error' && $r['errorCode'] === 'source_mismatch', 'different active identity must fail');
    };
    $tests['corruptPairError'] = function () use ($pair, $other) {
        foreach (array(array('corrupt', $pair[1]), array($pair[0], 'corrupt'), array($pair[0], $other[1])) as $bad) {
            sourceAssert(sourceRead(sourceSettings($bad), array())['state'] === 'error', 'bad configured pair');
            sourceAssert(sourceRead(array(), sourceFiles($bad))['state'] === 'error', 'bad runtime pair');
        }
    };
    $tests['sourceSelectedLeafBeforePublicExport'] = function () use ($pair, $other) {
        $body = preg_replace('/-----[^-]+-----|\s/', '', $pair[0]);
        $rewrapped = "-----BEGIN CERTIFICATE-----\r\n" . chunk_split($body, 48, "\r\n")
            . "-----END CERTIFICATE-----\r\n";
        $bundle = $rewrapped . $other[0] . $pair[1];
        foreach (array(true, false) as $configured) {
            $read = function ($key) use ($bundle, $configured) {
                $input = array($bundle, $key);
                return $configured ? sourceRead(sourceSettings($input), array()) : sourceRead(array(), sourceFiles($input));
            };
            $r = $read($pair[1]);
            sourceAssert($r['state'] === 'present' && $r['certPem'] === $pair[0] . $other[0] && $r['chainPem'] === '',
                'selected first leaf and public companion keep order through rewrapping');
            $r = $read($other[1]);
            sourceAssert($r['state'] === 'error' && $r['errorCode'] === ($configured ? 'source_selection_unknown' : 'source_invalid'), 'key cannot select second cert');
            // Подмена только результата экспорта: оба сертификата обычные, OpenSSL их не изменяет.
            $GLOBALS['sourceExportSubstitute'] = $other[0];
            try {
                $r = $read($other[1]);
                sourceAssert(!isset($GLOBALS['sourceExportSubstitute']), 'normalization seam exercised');
                sourceAssert($r['state'] === 'error' && $r['errorCode'] === ($configured ? 'source_selection_unknown' : 'source_invalid')
                    && !isset($r['privateKeyPem']) && !isset($r['certPem']), 'normalization cannot replace the original leaf');
            } finally { unset($GLOBALS['sourceExportSubstitute']); }
        }
    };
    $tests['sourceNoSanStillPresent'] = function () use ($dir, $pair) {
        $withoutSan = sourcePair('pbx.test', $dir, false);
        $r = sourceRead(array(), sourceFiles(array($withoutSan[0] . $pair[0], $withoutSan[1])));
        sourceAssert($r['state'] === 'present', 'well-formed leaf without SAN is not absent or invalid at source');
        $inspection = Inspector::inspect($r['certPem'], $r['privateKeyPem'], 'pbx.test', $r['chainPem']);
        sourceAssert(!$inspection['ok'] && $inspection['errorCode'] === 'hostname_mismatch',
            'apply cannot borrow SAN from second cert or fall back to CN');
    };
    $tests['oldStaleRuntimeUnknown'] = function () use ($pair) {
        $r = sourceRead(array(), sourceFiles($pair), 'old');
        sourceAssert($r['state'] === 'error' && $r['errorCode'] === 'source_selection_unknown', 'old stale runtime not selected');
        sourceAssert(sourceRead(sourceSettings($pair), sourceFiles($pair), 'old')['state'] === 'present', 'old configured selected pair');
    };
    $tests['readDoesNotPrepareOrChmod'] = function () use ($pair, $dir) {
        $cert = $dir . '/nginx.crt'; $key = $dir . '/nginx.key';
        file_put_contents($cert, $pair[0]); file_put_contents($key, $pair[1]);
        chmod($cert, 0640); chmod($key, 0600);
        $before = array(hash_file('sha256', $cert), hash_file('sha256', $key), fileperms($cert), fileperms($key));
        $r = \Modules\ModuleCTIClient\Lib\PbxCertificateSource::read(array(
            'platform' => function () use ($cert, $key) { return array('mode' => 'modern', 'certPath' => $cert, 'keyPath' => $key); },
            'settings' => function () { return ''; },
        ));
        clearstatcache();
        sourceAssert($r['state'] === 'present', 'real read-only file reader');
        sourceAssert($before === array(hash_file('sha256', $cert), hash_file('sha256', $key), fileperms($cert), fileperms($key)), 'source bytes/modes unchanged');
        $api = new \ReflectionMethod('Modules\\ModuleCTIClient\\Lib\\PbxCertificateSource', 'read');
        sourceAssert($api->getNumberOfRequiredParameters() === 0, 'read() remains no-arg callable');
    };
    $tests['realAbsentAndInvalidPathStates'] = function () use ($dir) {
        foreach (array('missing' => 'absent', 'openssl.cnf/child' => 'error') as $relative => $expected) {
            $path = $dir . '/' . $relative;
            $r = \Modules\ModuleCTIClient\Lib\PbxCertificateSource::read(array(
                'platform' => function () use ($path) { return array('mode' => 'modern', 'certPath' => $path . '/cert', 'keyPath' => $path . '/key'); },
                'settings' => function () { return ''; },
            ));
            sourceAssert($r['state'] === $expected, 'real path state ' . $relative);
        }
    };
    $tests['platformBridges'] = function () {
        foreach (array('old', 'modern', 'private', 'parse-error', 'below-min', 'missing-version', 'bad-version', 'defaults-api-missing', 'unknown-defaults', 'defaults-throws') as $variant) {
            $command = escapeshellarg(PHP_BINARY);
            if (DIRECTORY_SEPARATOR === '\\') {
                $command .= ' -d extension_dir=' . escapeshellarg(ini_get('extension_dir')) . ' -d extension=openssl';
            }
            $command .= ' ' . escapeshellarg(__FILE__) . ' --bridge ' . escapeshellarg($variant);
            passthru($command, $exit);
            sourceAssert($exit === 0, 'bridge ' . $variant . ' failed');
        }
    };
    $failures = 0;
    if (isset($argv[1])) {
        sourceAssert(isset($tests[$argv[1]]), 'unknown case selector');
        $tests = array($argv[1] => $tests[$argv[1]]);
    }
    foreach ($tests as $name => $test) {
        try { $test(); echo 'PASS ' . $name . "\n"; }
        catch (\Throwable $e) { ++$failures; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
    }
    foreach (glob($dir . '/*') as $file) { unlink($file); } rmdir($dir);
    exit($failures ? 1 : 0);
}
