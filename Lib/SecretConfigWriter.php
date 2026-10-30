<?php

namespace Modules\ModuleCTIClient\Lib;

final class SecretConfigWriter
{
    public static function write(string $path, array $config): void
    {
        $json = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('Cannot encode secret config');
        }
        self::writeText($path, $json);
    }

    public static function writeText(string $path, string $json): void
    {
        // Временный inode сразу закрыт от других пользователей, rename — на том же FS.
        $mask = umask(0077);
        try {
            $temporary = tempnam(dirname($path), '.cti-secret-');
        } finally {
            umask($mask);
        }
        if ($temporary === false) {
            throw new \RuntimeException('Cannot create secret config');
        }
        try {
            if (!chmod($temporary, 0600) || file_put_contents($temporary, $json) !== strlen($json)) {
                throw new \RuntimeException('Cannot persist secret config');
            }
            if (!rename($temporary, $path)) {
                throw new \RuntimeException('Cannot replace secret config');
            }
        } finally {
            if (file_exists($temporary)) {
                unlink($temporary);
            }
        }
    }
}
