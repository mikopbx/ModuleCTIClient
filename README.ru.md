[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0) [![GitHub Release](https://img.shields.io/github/v/release/mikopbx/ModuleCTIClient)](https://github.com/mikopbx/ModuleCTIClient/releases) [![PHP 7.4+](https://img.shields.io/badge/PHP-7.4%2B-777BB4.svg)](https://www.php.net/) [![MikoPBX 2023.2+](https://img.shields.io/badge/MikoPBX-2023.2%2B-1DBF73.svg)](https://www.mikopbx.com/) [![GitHub Issues](https://img.shields.io/github/issues/mikopbx/ModuleCTIClient)](https://github.com/mikopbx/ModuleCTIClient/issues)

[English](README.md) | [Русский](README.ru.md)

# ModuleCTIClient

Модуль CTI (Computer Telephony Integration) для MikoPBX. Обеспечивает интеграцию АТС с 1С и мессенджерами (Telegram, чаты) через десктопное клиентское приложение.

**Сайт продукта:** [telefon.miko.ru](https://telefon.miko.ru)

## Возможности

- Интеграция с 1С через веб-сервисы или long polling
- Уведомления о звонках в реальном времени и определение имени звонящего из 1С
- Десктопный CTI-клиент: звонок по клику, перевод звонков, история вызовов
- Интеграция с Telegram и чат-мессенджерами
- Управление аватарами, мобильными номерами и email пользователей через веб-интерфейс
- Транслитерация CallerID (кириллица в латиницу)
- Обмен сообщениями в реальном времени через NATS
- Прокси-сервер для безопасных внешних подключений
- Распознавание речи с поддержкой русской морфологии
- Поддержка архитектур x86_64 и ARM64
- Совместимость с MikoPBX 2023.2+ по 2025.x (PHP 7.4 -- PHP 8.4)

## Установка

1. Откройте веб-интерфейс MikoPBX.
2. Перейдите в **Модули** > **Маркетплейс**.
3. Найдите **ModuleCTIClient** и нажмите **Установить**.
4. После установки включите модуль на странице **Модули** > **Установленные**.

## Настройка

### Подключение к 1С

- **Адрес сервера** -- имя хоста или IP-адрес сервера 1С
- **Порт** -- HTTP-порт (по умолчанию 80)
- **Протокол** -- HTTP или HTTPS
- **Логин / Пароль** -- учётные данные веб-сервиса 1С
- **Имя публикации** -- имя публикации информационной базы 1С

### Режим подключения

- **Режим веб-сервиса** -- использует веб-сервисы 1С для обмена данными
- **Режим long polling** -- модуль выступает сервером, 1С подключается к нему

### Дополнительные настройки

- **Автонастройка** -- генерирует строку конфигурации для быстрой настройки клиента
- **CallerID из 1С** -- определение имени звонящего из CRM при входящих звонках
- **Транслитерация CallerID** -- преобразование кириллицы в латиницу для SIP-устройств
- **Прокси для чатов** -- SOCKS5 или HTTPS прокси для подключений мессенджеров
- **Режим отладки** -- расширенное логирование

## Фоновые сервисы

Модуль управляет следующими демонами:

| Сервис | Описание | Порт |
|---|---|---|
| `gnatsd-cti` | Очередь сообщений NATS | 4222, 8222 |
| `amid` | Слушатель Asterisk Manager Interface | 8000 |
| `crmd` | Интеграция с 1С CRM | -- |
| `authd` | Сервис аутентификации | -- |
| `chatsd` | Обработка чат-сообщений | 8228 |
| `tgd` | Интеграция с Telegram | -- |
| `proxyd` | Прокси-сервер (HTTPS) | 8002 |
| `speechd` | Распознавание и синтез речи | -- |
| `monitord` | Мастер-оркестратор демонов | -- |

## Требования

- MikoPBX 2023.2.206+
- PHP 7.4 -- 8.4
- Лицензионный ключ (product ID: 85)

## Поддержка

- **Сайт**: [telefon.miko.ru](https://telefon.miko.ru)
- **Документация**: [docs.telefon1c.ru](https://docs.telefon1c.ru)
- **Issues**: [GitHub Issues](https://github.com/mikopbx/ModuleCTIClient/issues)
- **Email**: [help@miko.ru](mailto:help@miko.ru)

## Лицензия

GPL-3.0-or-later
