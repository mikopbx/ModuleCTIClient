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
    'mod_cti_UpdateStatus'        => 'Обновление статуса',
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


];