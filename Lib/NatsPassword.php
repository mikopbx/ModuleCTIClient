<?php

namespace Modules\ModuleCTIClient\Lib;

final class NatsPassword
{
    public static function ensure(string $current, callable $persist): string
    {
        $current = trim($current);
        if ($current !== '') { return $current; }
        $generated = bin2hex(random_bytes(32));
        if ($persist($generated) !== true) {
            throw new \RuntimeException('Cannot persist NATS setup password');
        }
        return $generated;
    }
}
