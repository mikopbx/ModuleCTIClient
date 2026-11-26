<?php
namespace Modules\ModuleCTIClient\Lib;

/**
 * Read-only PUBLIC view of the CTI certificate for the settings panel. It never opens a private key path, never reads the
 * PBX source or settings, never writes and never starts anything. The selected certificate is derived from the same
 * candidates the apply path uses (own pair, then the previous pair) from certificate blocks only (a combined legacy file
 * contributes nothing but its certificates), and "running" needs every required TLS peer to serve exactly that leaf.
 * Why nothing is selected comes from the sanitized outcome code the apply path recorded, never from guessing.
 */
final class CtiTlsStatus
{
    private $confDir;
    private $moduleDir;
    private $test;

    public function __construct($confDir, $moduleDir, $internalTestOptions = array())
    {
        $this->confDir = $confDir;
        $this->moduleDir = $moduleDir;
        $this->test = defined('CTI_TLS_TESTING') && CTI_TLS_TESTING && PHP_SAPI === 'cli' ? $internalTestOptions : array();
    }

    /** Certificate blocks of a regular file; anything else in it (including a private-key block) is dropped unseen. */
    private function readPublic($path)
    {
        clearstatcache(true, $path);
        $s = @lstat($path);
        if (!$s || is_link($path) || ($s['mode'] & 0170000) !== 0100000) { return null; }
        $pem = @file_get_contents($path, false, null, 0, 262145);
        if (!is_string($pem) || strlen($pem) > 262144) { return null; }
        $count = preg_match_all('/-----BEGIN CERTIFICATE-----[A-Za-z0-9+\/=
 ]*?-----END CERTIFICATE-----/', $pem, $m);
        return $count > 0 ? implode("
", $m[0]) . "
" : null;
    }

    /** The key file is only stat'ed (present, regular, not a link), never opened. */
    private function keyPresent($path)
    {
        clearstatcache(true, $path);
        $s = @lstat($path);
        return $s && !is_link($path) && ($s['mode'] & 0170000) === 0100000;
    }

    /** First usable candidate by public facts; null when none. */
    private function selection($hostname)
    {
        $paths = CtiTlsPair::paths($this->moduleDir, $this->confDir);
        foreach (array('own' => array($paths['ownCert'], $paths['ownKey']), 'previous' => array($paths['previousCert'], $paths['previousKey'])) as $source => $pair) {
            $path = $pair[0];
            if (!$this->keyPresent($pair[1])) { continue; }
            $pem = $this->readPublic($path);
            if ($pem === null) { continue; }
            $r = TlsCertificateInspector::inspectPublic($pem, $hostname === '' ? null : $hostname);
            if (!$r['ok']) { continue; }
            $leaf = TlsCertificateInspector::exportPublic($pem);
            if (preg_match('/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----\n/', $leaf, $m) !== 1) { continue; }
            $root = ''; $intermediates = array();
            foreach ($r['publicChain'] as $link) {
                $d = TlsCertificateInspector::describe($link);
                if ($d['ok'] && $d['verifiedRoot'] === true) { $root = $link; } else { $intermediates[] = $link; }
            }
            // Публичный сертификат сервера можно скачать независимо от наличия цепочки доверия.
            $downloads = array('server');
            if ($r['certificate']['selfSigned'] !== true) {
                if ($root !== '') { $downloads[] = 'root'; }
                elseif ($intermediates) { $downloads[] = 'intermediates'; }
            }
            return array('source' => $source, 'path' => $path, 'certificate' => $r['certificate'], 'leaf' => $m[0], 'root' => $root,
                'intermediates' => $intermediates, 'downloads' => $downloads);
        }
        return null;
    }

    /** Which peers must serve the leaf: all three unless the applied monitor config verifiably runs no proxy. */
    private function requiredEndpoints()
    {
        $all = array('api', 'nats', 'proxy');
        $path = $this->confDir . '/monitord.json';
        if (is_link($path) || !is_file($path) || filesize($path) > 262144) { return $all; }
        $config = json_decode((string) @file_get_contents($path, false, null, 0, 262145), true);
        if (!isset($config['daemons']) || !is_array($config['daemons'])) { return $all; }
        foreach ($config['daemons'] as $daemon) {
            if (isset($daemon['path']) && basename($daemon['path']) === 'proxyd') { return $all; }
        }
        return array('api', 'nats');
    }

    /** Why nothing is selected: the address step, else the recorded real apply outcome, else "not applied yet". */
    private function nextStep($hostname)
    {
        if ($hostname === '' || TlsCertificateInspector::normalizeEndpoint($hostname) !== $hostname) { return 'invalid_hostname'; }
        $recorded = CtiTlsSetupPending::recorded($this->confDir);
        return $recorded !== null && $recorded !== 'invalid_hostname' ? $recorded : 'tls_apply_required';
    }

    public function read($hostname)
    {
        $hostname = (string) $hostname;
        $selected = $this->selection($hostname);
        if ($selected === null) {
            $code = $this->nextStep($hostname);
            $status = array('state' => 'error', 'source' => null, 'hostname' => $hostname, 'configured' => null,
                'configuredGeneration' => null, 'runtime' => array(), 'errorCode' => $code, 'applyError' => null, 'downloads' => array(),
                'trust' => array('kind' => 'unknown', 'rootAvailable' => false));
            if ($code !== 'invalid_hostname' && $code !== 'tls_apply_required') {
                $paths = CtiTlsPair::paths($this->moduleDir, $this->confDir);
                $status['manualPaths'] = array('cert' => $paths['ownCert'], 'key' => $paths['ownKey']);
            }
            return $status;
        }
        $sha = $selected['certificate']['sha256'];
        $deadline = microtime(true) + 3;
        $required = $this->requiredEndpoints();
        $runtime = array(); $states = array(); $allMatch = true;
        foreach (array('api' => 8298, 'nats' => 4228, 'proxy' => 8002) as $service => $port) {
            $digest = isset($this->test['probe']) ? call_user_func($this->test['probe'], $service)
                : $this->probe($service, isset($this->test['targets'][$service]) ? $this->test['targets'][$service] : $port, $deadline);
            if (!is_string($digest) || !preg_match('/^[a-f0-9]{64}$/D', $digest)) { $peer = array('state' => 'unavailable'); }
            else { $peer = array('state' => $digest === $sha ? 'match' : 'different', 'sha256' => $digest); }
            $peer['required'] = in_array($service, $required, true);
            if ($peer['required'] && $peer['state'] !== 'match') { $allMatch = false; }
            $runtime[$service] = $peer; $states[] = $peer['state'];
        }
        $state = in_array('different', $states, true) ? 'mixed' : ($allMatch ? 'running' : 'pending');
        // The recorded current apply refusal is never hidden by an observable public leaf or an old running peer: the page
        // can then say "working with the previous certificate, new setup refused" instead of a bare success.
        $refusal = CtiTlsSetupPending::recorded($this->confDir);
        $result = array('state' => $state, 'source' => $selected['source'], 'hostname' => $hostname,
            'configured' => $selected['certificate'], 'configuredGeneration' => $sha, 'runtime' => $runtime, 'errorCode' => null,
            'applyError' => $refusal !== null && $refusal !== 'invalid_hostname' ? $refusal : null,
            'downloads' => $selected['downloads'], 'publicPath' => $selected['path'],
            'trust' => array('kind' => $selected['certificate']['selfSigned'] === true ? 'self_signed' : 'ca_issued',
                'rootAvailable' => $selected['root'] !== ''));
        if ($result['applyError'] !== null) {
            $paths = CtiTlsPair::paths($this->moduleDir, $this->confDir);
            $result['manualPaths'] = array('cert' => $paths['ownCert'], 'key' => $paths['ownKey']);
        }
        return $result;
    }

    /** Public PEM of one downloadable kind of the CURRENT selection, bound to the leaf digest the page showed. */
    public function download($kind, $sha256, $hostname)
    {
        $selected = $this->selection((string) $hostname);
        if ($selected === null || !is_string($sha256) || $sha256 !== $selected['certificate']['sha256']
            || !in_array($kind, $selected['downloads'], true)) { throw new \RuntimeException('certificate_conflict'); }
        if ($kind === 'server') { return $selected['leaf']; }
        return $kind === 'root' ? $selected['root'] : implode('', $selected['intermediates']);
    }

    /** TLS handshake only: the status never sends CONNECT, HTTP or any application bytes after it. */
    private function probe($service, $port, $deadline)
    {
        $deadline = min(microtime(true) + 1, $deadline);
        if (microtime(true) >= $deadline) { return null; }
        $context = stream_context_create(array('ssl' => array('capture_peer_cert' => true,
            'verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true)));
        $socket = @stream_socket_client('tcp://127.0.0.1:' . $port, $errno, $error, $deadline - microtime(true), STREAM_CLIENT_CONNECT, $context);
        if (!$socket) { return null; }
        try {
            stream_set_blocking($socket, false);
            if ($service === 'nats') {
                $info = '';
                while (strpos($info, "\r\n") === false && strlen($info) <= 4096 && microtime(true) < $deadline) {
                    $part = @fread($socket, 4097 - strlen($info));
                    if ($part === false || feof($socket)) { return null; }
                    $info .= $part; if ($part === '') { usleep(1000); }
                }
                if (strlen($info) > 4096 || strpos($info, 'INFO ') !== 0 || strpos($info, "\r\n") === false) { return null; }
                $data = json_decode(substr($info, 5, strpos($info, "\r\n") - 5), true);
                if (!is_array($data) || empty($data['tls_required'])) { return null; }
            }
            do {
                $tls = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                if ($tls === true) {
                    $options = stream_context_get_params($socket);
                    $cert = isset($options['options']['ssl']['peer_certificate']) ? $options['options']['ssl']['peer_certificate'] : null;
                    return $cert ? strtolower(openssl_x509_fingerprint($cert, 'sha256')) : null;
                }
                if ($tls === false) { return null; }
                usleep(1000);
            } while (microtime(true) < $deadline);
            return null;
        } finally { fclose($socket); }
    }
}
