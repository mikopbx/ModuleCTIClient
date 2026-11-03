<?php
/**
 * Этап R2 (SC-4): per-install self-signed сертификат для HTTPS/TLS gnatsd.
 * Генерируется модулем при первом конфигурировании; переиспользуется при
 * последующих генерациях конфига (содержимое не перезаписывается).
 * На ядре с SslCertificateService сертификат Asterisk мог бы использоваться,
 * но его пароль неизвестен gnatsd — генерируем свой отдельный.
 */
namespace Modules\ModuleCTIClient\Lib;

final class TlsCertificate
{
    private const CERT_DAYS = 3650;

    /**
     * Гарантирует наличие пары cert/key. Если файлы уже есть — ничего не делает.
     *
     * @param string $certPath   путь к PEM-сертификату
     * @param string $keyPath    путь к PEM-ключу (0600)
     * @param string $commonName CN (имя хоста/IP АТС)
     * @return bool true если файлы готовы; false — openssl недоступен/ошибка записи
     */
    public static function ensure(string $certPath, string $keyPath, string $commonName): bool
    {
        if ($certPath === '' || $keyPath === '') {
            return false;
        }
        if (is_file($certPath) && is_file($keyPath)) {
            return true;
        }
        if (!function_exists('openssl_x509_export') || !function_exists('openssl_pkey_export')) {
            return false;
        }
        $privKey = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        if ($privKey === false) {
            return false;
        }
        $csr = openssl_csr_new(['commonName' => $commonName], $privKey, ['digest_alg' => 'sha256']);
        if ($csr === false) {
            return false;
        }
        $cert = openssl_csr_sign($csr, null, $privKey, self::CERT_DAYS, ['digest_alg' => 'sha256']);
        if ($cert === false) {
            return false;
        }
        if (!openssl_x509_export($cert, $certOut) || !openssl_pkey_export($privKey, $keyOut)) {
            return false;
        }
        if (file_put_contents($certPath, $certOut) === false) {
            return false;
        }
        if (file_put_contents($keyPath, $keyOut) === false) {
            return false;
        }
        @chmod($keyPath, 0600);
        @chmod($certPath, 0640);
        return true;
    }

    /**
     * Поддержка бинарником gnatsd полей tls_port/https_port (probe по строке,
     * как с security_mode во FreePBX-модуле). Старый бинарник новых полей не
     * понимает — конфиг пишется без TLS-блока.
     */
    public static function binarySupportsTls(string $binaryPath): bool
    {
        if ($binaryPath === '' || !is_file($binaryPath)) {
            return false;
        }
        $out = null;
        $rc = 1;
        @exec(
            'grep -c tls_port ' . escapeshellarg($binaryPath) . ' 2>/dev/null',
            $out,
            $rc
        );
        $count = trim(implode('', is_array($out) ? $out : []));
        return $count !== '' && $count !== '0';
    }
}
