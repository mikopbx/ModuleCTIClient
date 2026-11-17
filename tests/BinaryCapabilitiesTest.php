<?php
require dirname(__DIR__) . '/Lib/BinaryCapabilities.php';
use Modules\ModuleCTIClient\Lib\BinaryCapabilities;
function requireCapability($ok, $message) { if (!$ok) { throw new RuntimeException($message); } }
$dir = sys_get_temp_dir() . '/cti-capability-' . uniqid(); mkdir($dir, 0700);
$path = $dir . '/binary';
$sets = array(
    'gnatsd-cti' => array('cti-device-v2', '/pbx/auth/challenge/confirm', 'allow_legacy_auth', 'legacy_unsigned', 'tls_port'),
    'crmd' => array('security_mode', 'device enrollment required', 'PIN authentication rate limit exceeded', 'unknown security_mode')
);
try {
    foreach ($sets as $service => $markers) {
        requireCapability(!BinaryCapabilities::supportsStrict($path . '.missing', $service), 'Missing artifact accepted');
        requireCapability(!BinaryCapabilities::supportsStrict($dir, $service), 'Directory accepted');
        file_put_contents($path, 'security_mode tls_port');
        requireCapability(!BinaryCapabilities::supportsStrict($path, $service), 'Historical binary accepted');
        foreach ($markers as $omit => $value) {
            $partial = $markers; unset($partial[$omit]);
            // security_mode уже входит в unknown security_mode; проверяем только независимые пропуски.
            if (strpos(implode('', $partial), $value) !== false) { continue; }
            file_put_contents($path, implode("\0", $partial));
            requireCapability(!BinaryCapabilities::supportsStrict($path, $service), 'Partial marker set accepted: ' . $value);
        }
        // Каждый маркер по очереди пересекает границу блока чтения.
        foreach ($markers as $index => $marker) {
            $others = $markers; unset($others[$index]);
            file_put_contents($path, str_repeat('x', 65532) . $marker . "\0" . implode("\0", $others));
            requireCapability(BinaryCapabilities::supportsStrict($path, $service), 'Complete artifact refused');
            requireCapability(BinaryCapabilities::containsAll($path, array($marker)), 'Boundary marker missed');
        }
        if (DIRECTORY_SEPARATOR === '/') {
            chmod($path, 0000); clearstatcache(true, $path);
            if (!is_readable($path)) { requireCapability(!BinaryCapabilities::supportsStrict($path, $service), 'Unreadable artifact accepted'); }
            else { echo "SKIP unreadable file check under privileged user\n"; }
            chmod($path, 0600);
        } else { echo "SKIP POSIX unreadable file check on Windows\n"; }
    }
    $h = fopen($path, 'wb'); fseek($h, 134217728); fwrite($h, 'x'); fclose($h); clearstatcache(true, $path);
    requireCapability(!BinaryCapabilities::supportsStrict($path, 'gnatsd-cti'), 'Oversized artifact accepted');
    requireCapability(!BinaryCapabilities::supportsStrict($path, 'unknown'), 'Unknown service accepted');
    echo "PASS BinaryCapabilities missing/old/partial/complete/boundary/size checks\n";
} finally { @chmod($path, 0600); @unlink($path); rmdir($dir); }
