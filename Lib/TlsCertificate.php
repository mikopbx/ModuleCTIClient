<?php
namespace Modules\ModuleCTIClient\Lib;

/** Отдельная TLS-пара gnatsd; ошибка никогда не разрешает plaintext в strict. */
final class TlsCertificate
{
    public static function ensure($certPath, $keyPath, $commonName)
    {
        if ($certPath === '' || $keyPath === '' || $certPath === $keyPath || !function_exists('openssl_pkey_new')) {
            return false;
        }
        // Один стабильный inode на пару; удаление lock создало бы независимые блокировки.
        $mask = umask(0077);
        try { $lock = @fopen($keyPath . '.lock', 'c'); } finally { umask($mask); }
        if ($lock === false) { return false; }
        try {
            if (!@chmod($keyPath . '.lock', 0600) || !flock($lock, LOCK_EX)) { return false; }
            try {
                // Конкурирующий создатель мог уже опубликовать пару, пока мы ждали.
                clearstatcache(true, $certPath);
                clearstatcache(true, $keyPath);
                return self::ensureLocked($certPath, $keyPath, $commonName);
            } finally {
                flock($lock, LOCK_UN);
            }
        } finally {
            fclose($lock);
        }
    }

    private static function ensureLocked($certPath, $keyPath, $commonName)
    {
        if (file_exists($certPath) || file_exists($keyPath)) {
            return self::validPair($certPath, $keyPath);
        }
        $key = openssl_pkey_new(array('private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA));
        if ($key === false) { return false; }
        $csr = openssl_csr_new(array('commonName' => $commonName), $key, array('digest_alg' => 'sha256'));
        if ($csr === false) { return false; }
        $cert = openssl_csr_sign($csr, null, $key, 3650, array('digest_alg' => 'sha256'));
        if ($cert === false || !openssl_x509_export($cert, $certOut) || !openssl_pkey_export($key, $keyOut)) {
            return false;
        }
        $keyTemp = self::writeTemporary($keyPath, $keyOut, 0600);
        if ($keyTemp === false) { return false; }
        $certTemp = self::writeTemporary($certPath, $certOut, 0640);
        if ($certTemp === false) { @unlink($keyTemp); return false; }
        try {
            if (!@rename($keyTemp, $keyPath) || !@rename($certTemp, $certPath)) {
                return false;
            }
            return self::validPair($certPath, $keyPath);
        } finally {
            if (is_file($keyTemp)) { @unlink($keyTemp); }
            if (is_file($certTemp)) { @unlink($certTemp); }
        }
    }

    private static function validPair($certPath, $keyPath)
    {
        if (!is_readable($certPath) || !is_readable($keyPath)) { return false; }
        $cert = @file_get_contents($certPath);
        $key = @file_get_contents($keyPath);
        if ($cert === false || $key === false || !@openssl_x509_check_private_key($cert, $key)) { return false; }
        $data = @openssl_x509_parse($cert);
        return is_array($data) && isset($data['validFrom_time_t'], $data['validTo_time_t'])
            && $data['validFrom_time_t'] <= time() && $data['validTo_time_t'] > time()
            && @chmod($keyPath, 0600) && @chmod($certPath, 0640);
    }

    private static function writeTemporary($path, $content, $mode)
    {
        if (!is_dir(dirname($path))) { return false; }
        // Закрываем права до первой записи секретного содержимого.
        $mask = umask(0077);
        try { $temp = @tempnam(dirname($path), '.cti-tls-'); } finally { umask($mask); }
        if ($temp === false) { return false; }
        if (!@chmod($temp, $mode) || @file_put_contents($temp, $content) !== strlen($content)) {
            @unlink($temp);
            return false;
        }
        return $temp;
    }

    public static function binarySupportsTls($binaryPath)
    {
        return BinaryCapabilities::containsAll($binaryPath, array('tls_port', 'https_port'));
    }
}
