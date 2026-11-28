<?php
namespace Modules\ModuleCTIClient\Lib;

/**
 * Ролевые креды демонов и модуля в service_users gnatsd.
 *
 * gnatsd не доверяет loopback (ssh -R туннель monitord делает процессы VPS
 * Локальными): служебные HTTP-методы требуют Basic <роль>:<пароль>. Пароль
 * Детерминированно выводится из nats_password (как authd), поэтому переживает
 * Регенерацию конфига без миграции БД. NATS-подключение демонов не меняется
 * (cti-service в userinfo mq.host); mq.user/mq.password — только Basic к HTTP API.
 */
final class ServiceRoleCredentials
{
    public const ROLES = ['crmd', 'amid', 'chats', 'tg', 'max', 'module'];

    public static function password(string $natsPassword, string $role): string
    {
        return hash('sha256', $natsPassword . ':' . $role);
    }

    /** Записи service_users для nats.conf: `, crmd { pass: "..." } , ...`. */
    public static function natsUsersEntries(string $natsPassword): string
    {
        $entries = '';
        foreach (self::ROLES as $role) {
            $entries .= ', ' . $role . ' { pass: "' . self::password($natsPassword, $role) . '" } ';
        }
        return $entries;
    }

    /**
     * Блок mq конфига демона. Без nats_password user/password не пишутся —
     * Демон не шлёт Basic (как со старым конфигом).
     *
     * @param string $host
     * @param string $port
     */
    public static function queue($host, $port, string $natsPassword, string $role): array
    {
        $mq = ['host' => $host, 'port' => $port];
        if ($natsPassword !== '') {
            $mq['user'] = $role;
            $mq['password'] = self::password($natsPassword, $role);
        }
        return $mq;
    }

    /** CURLOPT_USERPWD роли module для чтений /security/status и /varz. */
    public static function moduleUserPwd(string $natsPassword): ?string
    {
        return $natsPassword === '' ? null : 'module:' . self::password($natsPassword, 'module');
    }
}
