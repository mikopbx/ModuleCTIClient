<?php
/** Секреты CTI API доступны только проверенному владельцу, не integration-v2 без личности. */
namespace Modules\ModuleCTIClient\Lib;

final class UserListFilter
{
    /**
     * @param array $rows     результат getExtensionsAction (список ассоциативных массивов)
     * @param string $ctiUser добавочный из X-CTI-User; '' — все приватные поля скрыты
     * @return array
     */
    public static function apply(array $rows, string $ctiUser): array
    {
        $result = [];
        foreach ($rows as $row) {
            if ($ctiUser === '' || (string)($row['number'] ?? '') !== $ctiUser) {
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
        return in_array($remoteAddr, ['127.0.0.1', '::1'], true);
    }
}
