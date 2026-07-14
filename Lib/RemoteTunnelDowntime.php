<?php

declare(strict_types=1);

namespace Modules\ModuleCTIClient\Lib;

final class RemoteTunnelDowntime
{
    /**
     * @param array<string,mixed>|null $status
     * @return array{seconds:int,created:bool,down_since:int,reason:string}
     */
    public static function measure(?array $status, string $stampFile, int $now): array
    {
        if ($status === null) {
            return self::result(-1, false, 0, 'status_unknown');
        }

        if (empty($status['configured']) || !empty($status['connected'])) {
            if (file_exists($stampFile)) {
                @unlink($stampFile);
            }
            return self::result(-1, false, 0, 'healthy');
        }

        $exists = is_file($stampFile);
        $downSince = $exists ? intval(trim((string) @file_get_contents($stampFile))) : 0;
        if ($downSince <= 0 || $downSince > $now) {
            $reason = $exists ? 'marker_repaired' : 'marker_created';
            $downSince = $now;
            self::writeAtomic($stampFile, (string) $downSince);
            return self::result(0, true, $downSince, $reason);
        }

        return self::result(max(0, $now - $downSince), false, $downSince, 'marker_existing');
    }

    /**
     * @return array{seconds:int,created:bool,down_since:int,reason:string}
     */
    private static function result(int $seconds, bool $created, int $downSince, string $reason): array
    {
        return [
            'seconds' => $seconds,
            'created' => $created,
            'down_since' => $downSince,
            'reason' => $reason,
        ];
    }

    private static function writeAtomic(string $stampFile, string $value): void
    {
        $tmp = $stampFile . '.tmp';
        if (@file_put_contents($tmp, $value) !== false) {
            @rename($tmp, $stampFile);
        }
    }
}
