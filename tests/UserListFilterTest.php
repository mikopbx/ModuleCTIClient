<?php
require_once dirname(__DIR__) . '/Lib/UserListFilter.php';

use Modules\ModuleCTIClient\Lib\UserListFilter;

// Этап R2 (SC-2): фильтрация /pbx/users по личности из X-CTI-User.
// secret/email/mobile/tls_login — только своему номеру; чужие строки
// без секретов. Список контактов (userid/number/username/avatar) — всем.

function row(array $over): array {
    return array_merge([
        'userid' => '1', 'number' => '201', 'secret' => base64_encode('sec201'),
        'username' => 'Ivanov', 'mobile' => '+7900', 'avatar' => 'h1',
        'email' => 'a@b.c', 'port' => '5060', 'transport' => 'udp',
        'dtmfmode' => 'rfc2833', 'tls_login' => '201-TLS',
    ], $over);
}

$fail = function (string $m) { fwrite(STDERR, "FAIL: $m\n"); exit(1); };

// Без личности (админ-сессия/старый клиент) — фильтр не применяется.
$full = UserListFilter::apply([row([]), row(['userid' => '2', 'number' => '202', 'secret' => base64_encode('s2'), 'email' => 'c@d.e'])], '');
if (count($full) !== 2 || $full[0]['secret'] === '' || $full[1]['secret'] === '') { $fail('no-identity must not filter'); }

// Личность 201: своя строка полная, чужая — без секретов.
$out = UserListFilter::apply([row([]), row(['userid' => '2', 'number' => '202', 'secret' => base64_encode('s2'), 'email' => 'c@d.e', 'tls_login' => '202-TLS'])], '201');
if ($out[0]['secret'] !== base64_encode('sec201')) { $fail('own secret must stay'); }
if ($out[0]['email'] !== 'a@b.c' || $out[0]['mobile'] !== '+7900') { $fail('own contact fields must stay'); }
if ($out[1]['secret'] !== '' || $out[1]['email'] !== '' || $out[1]['mobile'] !== '') { $fail('foreign row leaks secrets'); }
if ($out[1]['tls_login'] !== '') { $fail('foreign tls_login leaked'); }
// Контакты остаются.
if ($out[1]['username'] !== 'Ivanov' || $out[1]['number'] !== '202' || $out[1]['avatar'] !== 'h1') { $fail('directory fields stripped'); }
// Ключи структуры сохранены (клиент парсит фиксированные поля).
foreach (['userid','number','secret','username','mobile','avatar','email','port','transport','dtmfmode','tls_login'] as $k) {
    if (!array_key_exists($k, $out[1])) { $fail("key $k missing on filtered row"); }
}

// EXTERNAL-строки (mobile как number, secret пустой).
$ext = UserListFilter::apply([
    row([]),
    ['userid' => '3', 'number' => '+7910', 'secret' => '', 'username' => 'Ext', 'mobile' => '+7910',
     'avatar' => '', 'email' => '', 'port' => '', 'transport' => '', 'dtmfmode' => '', 'tls_login' => ''],
], '201');
if ($ext[1]['mobile'] !== '' ) { $fail('foreign external mobile leaked'); }
if ($ext[1]['username'] !== 'Ext') { $fail('external username stripped'); }

// Несуществующий номер — всё скрыто.
$none = UserListFilter::apply([row([])], '999');
if ($none[0]['secret'] !== '') { $fail('unknown identity leaks'); }

echo "PASS UserListFilter\n";
