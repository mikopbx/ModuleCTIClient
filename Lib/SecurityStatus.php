<?php
namespace Modules\ModuleCTIClient\Lib;

final class SecurityStatus
{
    public static function evaluate(?string $desired, ?array $reported): string
    {
        if ($reported === null || !isset($reported['mode']) || ($reported['applied'] ?? false) !== true) {
            return 'unavailable';
        }
        if (!in_array($reported['mode'], [SecurityMode::STRICT, SecurityMode::LEGACY], true)) {
            return 'unavailable';
        }
        return SecurityMode::normalize($desired) === $reported['mode'] ? 'applied' : 'pending';
    }

    public static function readLocal(): ?array
    {
        $curl = curl_init('http://127.0.0.1:8222/security/status');
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 2, CURLOPT_PROXY => '']);
        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        if ($status !== 200 || !is_string($body)) { return null; }
        $data = json_decode($body, true);
        return is_array($data) ? $data : null;
    }

    /**
     * S-15: телеметрия legacy из /varz gnatsd (блок cti). Возвращает null,
     * если gnatsd недоступен или блок отсутствует (старый бинарник).
     */
    public static function readTelemetry(?string $url = null): ?array
    {
        $body = self::httpGet($url ?? 'http://127.0.0.1:8222/varz');
        if ($body === null) { return null; }
        $data = json_decode($body, true);
        if (!is_array($data) || !isset($data['cti']) || !is_array($data['cti'])) { return null; }
        return $data['cti'];
    }

    /** GET с таймаутом 2с; без прокси. null при любой ошибке. */
    private static function httpGet(string $url): ?string
    {
        // curl — основной путь (стендовые PHP); file_get_contents — фолбэк
        // для окружений без curl-расширения (локальные тесты).
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 2, CURLOPT_PROXY => '']);
            $body = curl_exec($curl);
            $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);
            if ($status !== 200 || !is_string($body)) { return null; }
            return $body;
        }
        $context = stream_context_create(['http' => ['timeout' => 2, 'ignore_errors' => true, 'proxy' => '']]);
        $body = @file_get_contents($url, false, $context);
        if ($body === false || !isset($http_response_header) || !preg_match('#HTTP/[^ ]+\s+200#', $http_response_header[0] ?? '')) {
            return null;
        }
        return $body;
    }
}
