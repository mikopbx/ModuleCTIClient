<?php
namespace Modules\ModuleCTIClient\Lib;

/**
 * Expected "CTI certificate not ready" state: no usable pair and no valid address, or the PBX source / protected path
 * could not be used. Nothing was started or changed; the settings panel shows the next step. Every other code
 * (binary capability, process or file faults) stays a plain RuntimeException.
 */
final class CtiTlsSetupPending extends \RuntimeException
{
    const CODES = array('invalid_hostname', 'tls_prepare_failed', 'unsafe_state', 'source_unreadable',
        'source_selection_unknown', 'source_mismatch', 'unsupported_core', 'openssl_unavailable',
        'chain_verification_unavailable', 'installed_pair_unusable');

    const OUTCOME_FILE = 'tls-outcome';

    /**
     * The real outcome of the last apply as ONE fixed code (never a message, path, PEM or trace): the whole file is the
     * code and a newline, written by atomic temp+rename. null (success) or an unknown value removes it. Best effort.
     */
    public static function record($confDir, $code)
    {
        $path = $confDir . '/' . self::OUTCOME_FILE;
        if (!is_string($code) || !in_array($code, self::CODES, true)) { @unlink($path); return; }
        if (self::recorded($confDir) === $code) { return; }
        $temp = @tempnam($confDir, '.tls-outcome-');
        if ($temp === false) { return; }
        if (@chmod($temp, 0644) && @file_put_contents($temp, $code . "
") === strlen($code) + 1 && @rename($temp, $path)) { return; }
        @unlink($temp);
    }

    /** @return string|null The recorded code only if it is one of the known fixed codes. */
    public static function recorded($confDir)
    {
        $path = $confDir . '/' . self::OUTCOME_FILE;
        if (is_link($path) || !is_file($path) || filesize($path) > 64) { return null; }
        $value = @file_get_contents($path, false, null, 0, 65);
        $value = is_string($value) ? rtrim($value, "
") : '';
        return in_array($value, self::CODES, true) ? $value : null;
    }

    /** @return \RuntimeException Typed result only for an expected setup code. */
    public static function exception($code)
    {
        return in_array($code, self::CODES, true) ? new self($code) : new \RuntimeException($code);
    }
}
