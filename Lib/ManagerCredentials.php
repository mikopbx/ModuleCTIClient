<?php

namespace Modules\ModuleCTIClient\Lib;

/** Отдельный service-секрет; никогда не передаётся пользовательским клиентам. */
final class ManagerCredentials
{
    public static function loadOrCreate(string $directory, string $purpose = 'manager'): string
    {
        if (!in_array($purpose, ['manager', 'nats-service'], true)) {
            throw new \InvalidArgumentException('Invalid service credential purpose');
        }
        $path = rtrim($directory, '/\\') . '/' . $purpose . '.token';
        $mask = umask(0077);
        try {
            $handle = fopen($path, 'c+');
        } finally {
            umask($mask);
        }
        if ($handle === false) {
            throw new \RuntimeException('Cannot open manager credentials');
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new \RuntimeException('Cannot lock manager credentials');
            }
            if (!chmod($path, 0600)) {
                throw new \RuntimeException('Cannot secure manager credentials');
            }
            $token = stream_get_contents($handle);
            if ($token === false) {
                throw new \RuntimeException('Cannot read manager credentials');
            }
            if ($token === '') {
                $token = bin2hex(random_bytes(32));
                if (fwrite($handle, $token) !== strlen($token) || !fflush($handle)) {
                    throw new \RuntimeException('Cannot persist manager credentials');
                }
            }
            if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
                throw new \RuntimeException('Invalid manager credentials');
            }
            return $token;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}
