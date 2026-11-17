<?php
namespace Modules\ModuleCTIClient\Lib;

/** Консервативная проверка артефакта, не замена подписи пакета и интеграционных тестов. */
final class BinaryCapabilities
{
    public static function supportsStrict($path, $service)
    {
        $markers = $service === 'gnatsd-cti'
            ? array('cti-device-v2', '/pbx/auth/challenge/confirm', 'allow_legacy_auth', 'legacy_unsigned', 'tls_port')
            : array('security_mode', 'device enrollment required', 'PIN authentication rate limit exceeded', 'unknown security_mode');
        if (!in_array($service, array('gnatsd-cti', 'crmd'), true)) {
            return false;
        }
        return self::containsAll($path, $markers);
    }

    public static function containsAll($path, array $markers)
    {
        if (!is_file($path) || !is_readable($path)) {
            return false;
        }
        $handle = @fopen($path, 'rb');
        if ($handle === false) {
            return false;
        }
        try {
            $stat = fstat($handle);
            // Ограничиваем объём чтения; перекрытие сохраняет маркеры на границе блоков.
            if ($stat === false || $stat['size'] <= 0 || $stat['size'] > 134217728) {
                return false;
            }
            $overlap = 0;
            foreach ($markers as $marker) { $overlap = max($overlap, strlen($marker) - 1); }
            $tail = '';
            $remaining = $stat['size'];
            while ($remaining > 0) {
                $chunk = fread($handle, min(65536, $remaining));
                if ($chunk === false || $chunk === '') {
                    return false;
                }
                $remaining -= strlen($chunk);
                $data = $tail . $chunk;
                foreach ($markers as $key => $marker) {
                    if (strpos($data, $marker) !== false) { unset($markers[$key]); }
                }
                if (!$markers) { return true; }
                $tail = $overlap > 0 ? substr($data, -$overlap) : '';
            }
            return false;
        } finally {
            fclose($handle);
        }
    }

    public static function requireStrict($path, $service)
    {
        if (!self::supportsStrict($path, $service)) {
            throw new \RuntimeException('Strict security requires an updated ' . $service . ' binary');
        }
    }
}
