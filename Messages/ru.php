<?php
/*
 * MikoPBX - free phone system for small business
 * Copyright © 2017-2023 Alexey Portnov and Nikolay Beketov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

return [
    'BreadcrumbModuleCTIClient'          => 'Панель телефонии 4.0 для 1С',
    'SubHeaderModuleCTIClient'           => 'Модуль для управления вызовами с компьютера',
    'fw_modulecticlientDescription'      => 'CTI CLIENT - Панель телефонии 4.0 для 1С',
    'mod_cti_ValidateServer1CHostEmpty'  => 'Не заполнен адрес сервера 1С',
    'mod_cti_ValidateServer1CPortRange'  => 'Не правильно указан порт сервера 1С',
    'mod_cti_ValidatePubName'            => 'Не указано имя публикации веб-сервиса 1С',
    'mod_cti_Server1CHostPort'           => 'Адрес и порт сервера 1С',
    'mod_cti_Login'                      => 'Логин для веб-сервиса 1C',
    'mod_cti_Password'                   => 'Пароль для авторизации в 1С',
    'mod_cti_PublicationName'            => 'Имя публикации',
    'mod_cti_PublicationNameForAuth'     => 'Имя публикации с аутентификацией средствами ОС (опционально)',
    'mod_cti_UseAutoSettings'            => 'Автоматическая настройка параметров связи модуля и 1С',
    'mod_cti_PublicationOverHeader'      => 'Режим соединения с 1С',
    'mod_cti_PublicationOverWebServices' => 'через web сервис (MikoPBX подключается к 1С)',
    'mod_cti_PublicationOverLongPool'    => 'через LongPool соединение (1С подключается к MikoPBX)',
    'mod_cti_AuthApp_Name'               => 'Регистрация внешней панели',
    'mod_cti_AuthApp_Description'        => 'Позволяет привязать панель к SIP учетке по цифровому коду',
    'mod_cti_EnableDebugMode'            => 'Включить режим отладки модуля и логирования всех событий',
    'mod_cti_AutoSettingsData'           => 'Данные для автоматической настройки',

    'mod_cti_Connected'           => 'Модуль работает корректно',
    'mod_cti_Disconnected'        => 'Отключен',
    'mod_cti_ConnectionProgress'  => 'Запускаются сервисы модуля',
    'mod_cti_ConnectionError'     => 'Ошибка работы модуля',
    'mod_cti_ConnectionTo1CError' => 'Нет удалось подключиться к вебсервису 1С',
    'mod_cti_UpdateStatus'        => 'Обновляем статус…',
    'mod_cti_ConnectionWait'      => 'Ожидаем подключения к MikoPBX со стороны 1С',

    'mod_cti_tab_Settings'             => 'Настройки',
    'mod_cti_tab_debug'                => 'Отладка сервисов модуля',
    'mod_cti_OdinEsSetupHeaderMessage' => 'Установите подсистему телефонии в 1С:Предприятие 8',
    'mod_cti_OdinEsSetupMessageStep1'  => 'Сделайте резервную копию вашей базы 1С',
    'mod_cti_OdinEsSetupMessageStep3'  => 'Скачайте установщик расширений &nbsp;<a href="https://releases.mikopbx.com/releases/v1/1c/getModuleFile/PT40_Installer/latest" target="_blank">по ссылке <i class="cloud download icon"></i></a>',
    'mod_cti_OdinEsSetupMessageStep2'  => 'Запустите 1С монопольно в режиме предприятия',
    'mod_cti_OdinEsSetupMessageStep4'  => 'Нажмите Ctrl+O (или Файл&#8594;Открыть) и выберите файл "Установщик.epf"',
    'mod_cti_EnableSetCallerID'        => 'Устанавливать CallerID из 1С',
    'mod_cti_TransliterateCallerID'    => 'Выполнять транслитерацию CallerID полученного из 1С',
    'mod_cti_ChatsProxyAddress'        => 'Прокси-сервер для WhatsApp и Telegram (Socks5 или https)',
    'mod_cti_tab_Messengers'           => 'Прокси-серверы мессенджеров',
    'mod_cti_MtProxyAddress'           => 'Адрес',
    'mod_cti_MtProxySecret'            => 'Секрет',
    'mod_cti_ProxyHeader'              => 'Прокси-серверы мессенджеров',
    'mod_cti_ProxyIntro'               => 'Опциональные прокси (HTTP/SOCKS) отдельно для каждого мессенджера. Оставьте пустым для прямого подключения.',
    'mod_cti_WhatsappProxyHeader'      => 'WhatsApp',
    'mod_cti_TelegramProxyHeader'      => 'Telegram',
    'mod_cti_MaxProxyHeader'           => 'MAX',
    'mod_cti_MtProxyHeader'            => 'MT Proxy для Telegram',
    'mod_cti_MtProxyHint'              => 'Если задан, MTProto-прокси используется для Telegram вместо HTTP/SOCKS-прокси выше (они взаимоисключающие). Можно вставить в любое поле полную ссылку tg://proxy или https://t.me/proxy — адрес и секрет извлекутся автоматически; либо указать адрес как host:port, а секрет в формате HEX или base64.',

    'mod_cti_tab_Remote'               => 'Удалённые мессенджеры',
    'mod_cti_RemoteHeader'             => 'Удалённый сервер мессенджеров',
    'mod_cti_RemoteIntro'              => 'Опциональная настройка. Вынос каналов WhatsApp / Telegram / MAX на удалённый x86_64 VPS, доступный по SSH. Каждый включённый сервис работает на VPS и доступен прозрачно через SSH-туннель — 1С продолжает обращаться к MikoPBX как раньше. Если вынос мессенджеров не нужен — вкладку можно не трогать.',
    'mod_cti_RemoteConnectionHeader'   => 'Подключение к удалённому VPS',
    'mod_cti_RemoteServicesHeader'     => 'Сервисы для выноса',
    'mod_cti_RemoteHost'               => 'Адрес VPS (IP или FQDN)',
    'mod_cti_RemoteSshPort'            => 'SSH-порт',
    'mod_cti_RemoteSshLogin'           => 'SSH-логин',
    'mod_cti_RemoteSshKey'             => 'Приватный SSH-ключ (PEM)',
    'mod_cti_RemoteSshKeyHint'         => 'Сейчас хранится как есть (в форме маскируется). Шифрование at-rest запланировано в следующем релизе.',
    'mod_cti_RemoteBinDir'             => 'Базовый каталог на VPS',
    'mod_cti_RemoteWhatsApp'           => 'Запускать каналы WhatsApp на удалённом VPS',
    'mod_cti_RemoteTelegram'           => 'Запускать каналы Telegram на удалённом VPS',
    'mod_cti_RemoteMax'                => 'Запускать каналы MAX на удалённом VPS',
    'mod_cti_RemoteTunnelStatus'       => 'SSH-туннель',
    'mod_cti_RemoteTunnelConnected'    => 'подключён',
    'mod_cti_RemoteTunnelDisconnected' => 'нет соединения',
    'mod_cti_RemoteTunnelDisabled'     => 'выключен',
    'mod_cti_RemoteTunnelUnknown'      => 'неизвестно',
    'mod_cti_RemoteTestConnection'     => 'Проверить SSH-подключение',
    'mod_cti_RemoteTestRunning'        => 'Проверяем…',
    'mod_cti_RemoteTestOk'             => 'Подключение успешно',
    'mod_cti_RemoteTestFail'           => 'Подключение не удалось',
    'mod_cti_RemoteTestRwOk'           => 'запись в каталог разрешена',
    'mod_cti_RemoteMigrationLockedHeader'    => 'Идёт миграция',
    'mod_cti_RemoteMigrationLocked'          => 'Идёт перенос мессенджеров. Удалённые настройки заблокированы до завершения миграции.',
    'mod_cti_RemoteMigrationLockedSaveError' => 'Нельзя менять удалённые настройки мессенджеров, пока идёт миграция. Дождитесь завершения и повторите сохранение.',

    // Панель статуса сервисов
    'mod_cti_tab_Status'               => 'Статус сервисов',
    'mod_cti_StatusHeader'             => 'Состояние сервисов модуля',
    'mod_cti_StatusLoading'            => 'Загружаем статус сервисов…',
    'mod_cti_StatusUnavailable'        => 'Статус сервисов недоступен',
    'mod_cti_StatusModuleDisabled'     => 'Модуль выключен — сервисы не запущены',
    'mod_cti_StatusEmpty'              => 'Сервисы не сообщают о статусе',
    'mod_cti_StatusProblem'            => 'Проблема',
    'mod_cti_Uptime'                   => 'Аптайм',
    'mod_cti_Version'                  => 'Версия',

    // Колонки таблицы статусов
    'mod_cti_colStatus'                => 'Статус',
    'mod_cti_colService'               => 'Сервис',
    'mod_cti_colLocation'              => 'Расположение',
    'mod_cti_colUptime'                => 'Аптайм',
    'mod_cti_colVersion'               => 'Версия',

    // Бейджи расположения сервиса
    'mod_cti_LocationLocal'            => 'Локально',
    'mod_cti_LocationRemote'           => 'VPS',

    // Имена сервисов
    'mod_cti_svc_monitord'             => 'Супервизор сервисов',
    'mod_cti_svc_nats'                 => 'Шина сообщений NATS',
    'mod_cti_svc_crm'                  => 'Служба связи с 1С:Предприятием',
    'mod_cti_svc_auth'                 => 'Сервис авторизации',
    'mod_cti_svc_proxy'                => 'Прокси-сервер для внешней панели телефонии',
    'mod_cti_svc_ami'                  => 'Служба связи с телефонией',
    'mod_cti_svc_chats'                => 'Каналы WhatsApp',
    'mod_cti_svc_tg'                   => 'Каналы Telegram',
    'mod_cti_svc_max'                  => 'Каналы MAX',
    'mod_cti_svc_manager_api'          => 'Manager API',
    'mod_cti_svc_remote_tunnel'        => 'SSH-туннель удалённых мессенджеров',

    // Состояния сервиса
    'mod_cti_state_ok'                 => 'Работает',
    'mod_cti_state_authenticated'      => 'Авторизован',
    'mod_cti_state_connected'          => 'Подключено к 1С',
    'mod_cti_state_waiting_1c'         => 'Ожидаем подключения со стороны 1С',
    'mod_cti_state_connecting_1c'      => 'Подключение к 1С…',
    'mod_cti_state_error'              => 'Ошибка',
    'mod_cti_state_unknown'            => 'Неизвестно',
    'mod_cti_state_pending'            => 'Ожидание',
    'mod_cti_state_starting'           => 'Запускается',
    'mod_cti_state_qrcode'             => 'Ожидает авторизации по QR-коду',
    'mod_cti_state_reauth'             => 'Требуется авторизация',
    'mod_cti_state_suppressed'         => 'Переносится',
];
