<?php
/**
 * Этап R2 (SC-2): фильтрация списка сотрудников по личности пользователя.
 *
 * gnatsd проксирует /pbx/users с заголовком X-CTI-User (добавочный из
 * Bearer-сессии); клиентский заголовок вырезается на прокси, подделка
 * исключена. Модуль отдаёт SIP-секреты/контакты только владельцу номера:
 * чужие строки — только справочник (userid/number/username/avatar/порт).
 *
 * Без X-CTI-User (запросы админ-кабинета, провижининг 1С) фильтр не
 * применяется — поведение прежнее.
 */
namespace Modules\ModuleCTIClient\Lib;

final class UserListFilter
{
    /**
     * @param array $rows     результат getExtensionsAction (список ассоциативных массивов)
     * @param string $ctiUser добавочный из X-CTI-User; '' — фильтр не применяется
     * @return array
     */
    public static function apply(array $rows, string $ctiUser): array
    {
        if ($ctiUser === '') {
            return $rows;
        }
        $result = [];
        foreach ($rows as $row) {
            if ((string)($row['number'] ?? '') !== $ctiUser) {
                $row['secret'] = '';
                $row['email'] = '';
                $row['mobile'] = '';
                $row['tls_login'] = '';
            }
            $result[] = $row;
        }
        return $result;
    }

    /**
     * Доверие заголовку: gnatsd проксирует с loopback этого же хоста.
     * X-CTI-User от внешних адресов игнорируется (подделка через прямой
     * доступ к веб-порту АТС).
     */
    public static function trustedRemote(string $remoteAddr): bool
    {
        $host = (string)$remoteAddr;
        $pos = strrpos($host, ':');
        if ($pos !== false) {
            $host = substr($host, 0, $pos);
        }
        $host = trim($host, '[]');
        return in_array($host, ['127.0.0.1', '::1'], true);
    }
}
