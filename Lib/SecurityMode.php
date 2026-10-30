<?php

namespace Modules\ModuleCTIClient\Lib;

final class SecurityMode
{
    public const STRICT = 'strict';
    public const LEGACY = 'legacy_compatible';

    public static function normalize(?string $value): string
    {
        return $value === self::LEGACY ? self::LEGACY : self::STRICT;
    }

    public static function fromSubmission(?string $current, array $data, bool $fullForm): string
    {
        if (!$fullForm) { return self::normalize($current); }
        // Semantic UI отправляет unchecked-поле как false/пустую строку, а не всегда опускает его.
        $enabled = in_array($data['allow_legacy_clients'] ?? null,
            [true, 1, '1', 'on', 'true', self::LEGACY], true);
        return $enabled ? self::LEGACY : self::STRICT;
    }

    public static function allowsLegacy(?string $value): bool
    {
        return self::normalize($value) === self::LEGACY;
    }
}
