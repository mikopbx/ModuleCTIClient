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

namespace Modules\ModuleCTIClient\Setup;

use MikoPBX\Common\Models\Extensions;
use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Core\System\Processes;
use MikoPBX\Core\System\System;
use MikoPBX\Core\System\Util;
use MikoPBX\Common\Models\DialplanApplications;
use MikoPBX\Modules\Setup\PbxExtensionSetupBase;
use Modules\ModuleCTIClient\Lib\AmigoDaemons;
use Modules\ModuleCTIClient\Models\ModuleCTIClient;

/**
 * @property array $messages
 */
class PbxExtensionSetup extends PbxExtensionSetupBase
{

    private string $number = '000XXXX';

    /**
     * Создает структуру для хранения настроек модуля в своей модели
     * и заполняет настройки по-умолчанию если таблицы не было в системе
     * см (unInstallDB)
     *
     * Регистрирует модуль в PbxExtensionModules
     *
     * @return bool Результат установки
     */
    public function installDB(): bool
    {
        // Создаем базу данных
        $result = $this->createSettingsTableByModelsAnnotations();


        if ($result) {
            $this->db->begin();
            $settings = ModuleCTIClient::findFirst();
            if ($settings === null) {
                $settings                     = new ModuleCTIClient();
                $settings->debug_mode         = '0';
                $settings->web_service_mode   = '0';
                $settings->auto_settings_mode = '1';
                $settings->setup_caller_id    = '1';
                $settings->transliterate_caller_id = '0';
            }

            if (empty($settings->ami_password)) {
                $settings->ami_password = hash('md5', date('Y-m-d H:i:s:u'));
            }

            if (empty($settings->nats_password)) {
                $settings->nats_password = hash('md5', date('Y-m-D H:i:s:u'));
            }

            // Приложение для авторизации внешней панели.
            $record = Extensions::findFirst('number="' . $this->number . '"');
            if ($record === null) {
                $record                    = new Extensions();
                $record->number            = $this->number;
                $record->type              = 'DIALPLAN APPLICATION';
                $record->callerid          = 'Module CTI Client auth app';
                $record->show_in_phonebook = 0;
            }
            $d_app = DialplanApplications::findFirst('extension="' . $this->number . '"');

            if ($d_app === null) {
                $d_app            = new DialplanApplications();
                $d_app->uniqid    = 'DIALPLAN-APPLICATION-' . md5(time());
                $d_app->extension = $this->number;
            }
            $logic = '1,Answer()' . "\n" .
                'n,Playback(beep)' . "\n" .
                'n,Playback(silence/1)' . "\n" .
                'n,Playback(silence/1)' . "\n" .
                'n,Hangup';


            $d_app->name             = $this->translation->_('mod_cti_AuthApp_Name');
            $d_app->description      = $this->translation->_('mod_cti_AuthApp_Description');
            // $d_app->name        = $this->locString('mod_cti_AuthApp_Name');
            // $d_app->description = $this->locString('mod_cti_AuthApp_Description');

            $d_app->applicationlogic = base64_encode($logic);
            $d_app->type             = 'plaintext';

            if ($record->save() && $d_app->save() && $settings->save()) {
                $this->db->commit();
            } else {
                $this->db->rollback();
                Util::sysLogMsg(
                    'update_system_config',
                    'Error: Failed to update table the Extensions and the DialplanApplications tables.'
                );
                $result = false;
            }
        }
        // Регаем модуль в PBX Extensions
        if ($result) {
            $result = $this->registerNewModule();
        }

        if ($result) {
            $this->transferOldSettings();
        }

        if ($result) {
            $result = $this->addToSidebar();
        }

        return $result;
    }

    /**
     *  Transfer settings from db to own module database
     */
    protected function transferOldSettings(): void
    {
        if ( ! $this->db->tableExists('m_ModuleCTIClient')) {
            return;
        }
        $oldSettings = $this->db->fetchOne('Select * from m_ModuleCTIClient', \Phalcon\Db\Enum::FETCH_ASSOC);

        $settings = ModuleCTIClient::findFirst();
        if ( ! $settings) {
            $settings = new ModuleCTIClient();
        }
        foreach ($settings as $key => $value) {
            if (isset($oldSettings[$key])) {
                $settings->$key = $oldSettings[$key];
            }
        }
        if ($settings->save()) {
            $this->db->dropTable('m_ModuleCTIClient');
        } else {
            $this->messges[] = 'Error on transfer old settings for ModuleCTIClient';
        }
    }

    /**
     * Выполняет копирование необходимых файлов, в папки системы
     *
     * @return bool Результат установки
     */
    public function installFiles(): bool
    {
        $this->moveModuleCDRToDBFolder();

        // Create chatdb folder
        $chat_database_path = $this->moduleDir . '/db/chats/';
        Util::mwMkdir($chat_database_path);

        parent::installFiles();

        return true;
    }

    /**
     * Move CDR to DB folder
     */
    protected function moveModuleCDRToDBFolder(): void
    {
        $new_database_path = $this->moduleDir . '/db/cdr/';
        Util::mwMkdir($new_database_path);

        $very_old_path_history = System::getLogDir() . '/history.db';
        if (file_exists($very_old_path_history)) {
            Processes::mwExec("/bin/busybox mv {$very_old_path_history} {$new_database_path}");
        }

        $old_path_history = System::getLogDir() . "/{$this->moduleUniqueID}/history.db";
        if (file_exists($old_path_history)) {
            Processes::mwExec("/bin/busybox mv {$old_path_history} {$new_database_path}");
        }
    }

    /**
     * Удаляет запись о модуле из PbxExtensionModules.
     * Удаляет свою модель
     *
     * @param  $keepSettings string Оставляет таблицу с данными своей модели
     *
     * @return bool Результат очистки
     */
    public function unInstallDB($keepSettings = false): bool
    {
        $result = true;
        // Удалим запись Extension для модуля
        $record = Extensions::findFirst('number="' . $this->number . '"');
        if ($record) {
            $result = $result && $record->delete();
        }
        parent::unInstallDB($keepSettings);

        return $result;
    }

    /**
     * Выполняет удаление своих файлов с остановкой процессов
     * при необходимости
     *
     * @return bool Результат удаления
     */
    public function unInstallFiles($keepSettings = false): bool
    {
        Processes::killbyname(AmigoDaemons::SERVICE_MONITOR);
        Processes::killbyname(AmigoDaemons::SERVICE_AMI);
        Processes::killbyname(AmigoDaemons::SERVICE_CRM);
        Processes::killbyname(AmigoDaemons::SERVICE_AUTH);
        Processes::killbyname(AmigoDaemons::SERVICE_SPEECH);
        Processes::killbyname(AmigoDaemons::SERVICE_GNATS);


        // confDir
        $confDir = '/etc/custom_modules/ModuleCTIClient';
        Processes::mwExec("rm -rf {$confDir}");

        // spoolDir
        $spoolDir = '/var/spool/custom_modules/ModuleCTIClient';
        Processes::mwExec("rm -rf {$spoolDir}");

        // logDir
        $logDir = System::getLogDir();
        $logDir = "{$logDir}/ModuleCTIClient";
        Processes::mwExec("rm -rf {$logDir}");

        // pid
        $pidDir = '/var/run/custom_modules/ModuleCTIClient';
        Processes::mwExec("rm -rf {$pidDir}");


        return parent::unInstallFiles($keepSettings);
    }

    /**
     * Adds the module to the sidebar menu.
     * @see https://docs.mikopbx.com/mikopbx-development/module-developement/module-installer#addtosidebar
     *
     * @return bool The result of the addition process.
     */
    public function addToSidebar(): bool
    {
        $menuSettingsKey           = "AdditionalMenuItem{$this->moduleUniqueID}";
        $menuSettings              = PbxSettings::findFirstByKey($menuSettingsKey);
        if ($menuSettings === null) {
            $menuSettings      = new PbxSettings();
            $menuSettings->key = $menuSettingsKey;
        }
        $value               = [
            'uniqid'        => $this->moduleUniqueID,
            'group'         => 'integrations',
            'iconClass'     => 'puzzle',
            'caption'       => "Breadcrumb{$this->moduleUniqueID}",
            'showAtSidebar' => true,
        ];
        $menuSettings->value = json_encode($value);

        return $menuSettings->save();
    }


}