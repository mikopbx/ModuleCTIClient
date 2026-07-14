<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/Lib/RemoteTunnelDowntime.php';

use Modules\ModuleCTIClient\Lib\RemoteTunnelDowntime;

function assertSameValue($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, $message . PHP_EOL);
        fwrite(STDERR, 'Expected: ' . var_export($expected, true) . PHP_EOL);
        fwrite(STDERR, 'Actual:   ' . var_export($actual, true) . PHP_EOL);
        exit(1);
    }
}

function writeMarker(string $path, string $value): void
{
    if (file_put_contents($path, $value) === false) {
        throw new RuntimeException('Cannot write test marker: ' . $path);
    }
}

$dir = sys_get_temp_dir() . '/cti-remote-downtime-' . bin2hex(random_bytes(8));
if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
    throw new RuntimeException('Cannot create test directory: ' . $dir);
}
$stamp = $dir . '/remote_tunnel_down_since';

try {
    $unknown = RemoteTunnelDowntime::measure(null, $stamp, 20000);
    assertSameValue(-1, $unknown['seconds'], 'Unknown status must not start failback');
    assertSameValue(false, file_exists($stamp), 'Unknown status must not create marker');

    writeMarker($stamp, '15000');
    $healthy = RemoteTunnelDowntime::measure(
        ['configured' => true, 'connected' => true, 'last_ok_ts' => 1000],
        $stamp,
        20000
    );
    assertSameValue(-1, $healthy['seconds'], 'Connected tunnel must not count downtime');
    assertSameValue(false, file_exists($stamp), 'Reconnect must remove marker');

    $firstDown = RemoteTunnelDowntime::measure(
        ['configured' => true, 'connected' => false, 'last_ok_ts' => 1000],
        $stamp,
        20000
    );
    assertSameValue(0, $firstDown['seconds'], 'Old last_ok_ts must not cause immediate failback');
    assertSameValue(20000, $firstDown['down_since'], 'First down observation must use current time');
    assertSameValue('marker_created', $firstDown['reason'], 'New outage must report marker creation');
    assertSameValue('20000', trim((string) file_get_contents($stamp)), 'Marker must persist current time');
    assertSameValue(true, $firstDown['created'], 'First down observation must request one diagnostic event');
    assertSameValue(false, array_key_exists('private_key', $firstDown), 'Result must not expose private key data');
    assertSameValue(false, array_key_exists('credentials', $firstDown), 'Result must not expose credentials');

    $continued = RemoteTunnelDowntime::measure(
        ['configured' => true, 'connected' => false, 'last_ok_ts' => 1000],
        $stamp,
        27199
    );
    assertSameValue(7199, $continued['seconds'], 'Existing marker must accumulate continuous downtime');
    assertSameValue('marker_existing', $continued['reason'], 'Existing outage must not be re-created');
    assertSameValue(false, $continued['created'], 'Repeated ticks must not request repeated diagnostics');

    $threshold = RemoteTunnelDowntime::measure(
        ['configured' => true, 'connected' => false, 'last_ok_ts' => 1000],
        $stamp,
        27200
    );
    assertSameValue(7200, $threshold['seconds'], 'Downtime must reach threshold from marker time');

    foreach (['', '-10', 'not-a-number', '30000'] as $invalid) {
        writeMarker($stamp, $invalid);
        $repaired = RemoteTunnelDowntime::measure(
            ['configured' => true, 'connected' => false, 'last_ok_ts' => 1000],
            $stamp,
            25000
        );
        assertSameValue(0, $repaired['seconds'], 'Invalid/future marker must restart outage safely');
        assertSameValue(25000, $repaired['down_since'], 'Repaired marker must use current time');
        assertSameValue('marker_repaired', $repaired['reason'], 'Invalid marker must report repair');
    }

    $blockedParent = $dir . '/not-a-directory';
    writeMarker($blockedParent, 'occupied');
    $writeFailed = RemoteTunnelDowntime::measure(
        ['configured' => true, 'connected' => false, 'last_ok_ts' => 1000],
        $blockedParent . '/remote_tunnel_down_since',
        25000
    );
    assertSameValue(-1, $writeFailed['seconds'], 'Failed marker write must disable failback');
    assertSameValue(false, $writeFailed['created'], 'Failed marker write must not report marker creation');
    assertSameValue('marker_write_failed', $writeFailed['reason'], 'Failed marker write must be diagnosable');
    @unlink($blockedParent);

    writeMarker($stamp, '24000');
    if (!chmod($dir, 0500)) {
        throw new RuntimeException('Cannot make test directory read-only: ' . $dir);
    }
    try {
        $removeFailed = RemoteTunnelDowntime::measure(
            ['configured' => true, 'connected' => true, 'last_ok_ts' => 25000],
            $stamp,
            25000
        );
        assertSameValue(-1, $removeFailed['seconds'], 'Failed marker removal must disable failback');
        assertSameValue('marker_remove_failed', $removeFailed['reason'], 'Failed marker removal must be diagnosable');
        assertSameValue(true, file_exists($stamp), 'Failed marker removal must leave the failure observable');
    } finally {
        @chmod($dir, 0700);
    }

    writeMarker($stamp, '24000');
    $unconfigured = RemoteTunnelDowntime::measure(
        ['configured' => false, 'connected' => false, 'last_ok_ts' => 1000],
        $stamp,
        25000
    );
    assertSameValue(-1, $unconfigured['seconds'], 'Unconfigured tunnel must not count downtime');
    assertSameValue(false, file_exists($stamp), 'Unconfigured tunnel must clear stale marker');
} finally {
    @chmod($dir, 0700);
    @unlink($dir . '/not-a-directory');
    @unlink($stamp . '.tmp');
    @unlink($stamp);
    @rmdir($dir);
}

fwrite(STDOUT, "RemoteTunnelDowntimeTest: OK\n");
