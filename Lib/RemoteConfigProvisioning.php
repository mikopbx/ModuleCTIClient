<?php

namespace Modules\ModuleCTIClient\Lib;

/** Команды безопасной доставки конфигов; не содержит секретов. */
final class RemoteConfigProvisioning
{
    public static function temporaryPath(string $final): string
    {
        return $final . '.' . bin2hex(random_bytes(16)) . '.new';
    }

    public static function secureDirectoryCommand(string $path): string
    {
        return 'mkdir -p ' . escapeshellarg($path) . ' && chmod 700 ' . escapeshellarg($path);
    }

    private static function markerPath(string $final): string
    {
        return dirname($final) . '/.manager-restart-required';
    }

    public static function pendingRestartCommand(string $final): string
    {
        return 'test -f ' . escapeshellarg(self::markerPath($final));
    }

    private static function locked(string $final, string $command): string
    {
        // --close исключает наследование lock fd detached-процессом; flock ждёт shell.
        return 'umask 077; flock --exclusive --close --wait 15 '
            . escapeshellarg(dirname($final) . '/.manager-apply.lock')
            . ' sh -c ' . escapeshellarg($command);
    }

    public static function applyRestartCommand(string $final, string $processName): string
    {
        return self::locked($final, self::restartBody($final, $processName));
    }

    public static function launchCommand(string $final, string $processName, string $inner): string
    {
        $body = self::restartBody($final, $processName) . ' && { pgrep -x '
            . escapeshellarg($processName) . ' >/dev/null 2>&1 || { setsid sh -c '
            . escapeshellarg($inner) . ' >/dev/null 2>&1 </dev/null & }; }';
        return self::locked($final, $body);
    }

    private static function restartBody(string $final, string $processName): string
    {
        if (!preg_match('/^[a-zA-Z0-9_-]{1,15}$/D', $processName)) {
            throw new \InvalidArgumentException('Invalid process name');
        }
        $marker = escapeshellarg(self::markerPath($final));
        $name = escapeshellarg($processName);
        return 'if test -f ' . $marker . '; then '
            . 'pkill -x ' . $name . '; '
            . 'n=0; while pgrep -x ' . $name . ' >/dev/null; do '
            . 'n=$((n+1)); if test "$n" -ge 50; then exit 1; fi; sleep 0.1; done; '
            . 'rm -f ' . $marker . '; fi';
    }

    public static function installCommand(string $temporary, string $final): string
    {
        $pending = '';
        if (basename($final) === 'monitord.json') {
            // Marker создаётся ДО rename: сбой не может скрыть неприменённое обновление.
            $pending = 'umask 077; touch ' . escapeshellarg(self::markerPath($final)) . ' && ';
        }
        $body = $pending . 'chmod 600 ' . escapeshellarg($temporary) . ' && mv -f '
            . escapeshellarg($temporary) . ' ' . escapeshellarg($final);
        return basename($final) === 'monitord.json' ? self::locked($final, $body) : $body;
    }
}
