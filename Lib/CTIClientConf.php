<?php
/**
 * Copyright © MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Alexey Portnov, 1 2020
 */

namespace Modules\ModuleCTIClient\Lib;

use Exception;
use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Core\System\PBX;
use MikoPBX\Core\Workers\Cron\WorkerSafeScriptsCore as WorkerSafeScriptsCore;
use MikoPBX\Modules\Config\ConfigClass;
use MikoPBX\Core\System\System;
use MikoPBX\Core\System\Util;
use MikoPBX\Modules\PbxExtensionUtils;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;


class CTIClientConf extends ConfigClass
{

    public const MODULE_AMI_USER = 'cti_amid_client';

    /**
     * Будет вызван после старта asterisk.
     */
    public function onAfterPbxStarted(): void
    {
        $amigoDaemons = new AmigoDaemons();
        $amigoDaemons->startAllServices();
    }

    /**
     * Обработчик события изменения данных в базе настроек mikopbx.db.
     *
     * @param $data
     */
    public function modelsEventChangeData($data): void
    {
        if ($data['model'] === PbxSettings::class
            && $data['recordId'] === 'PBXLicense') {
            $amigoDaemons = new AmigoDaemons();
            $amigoDaemons->startAllServices(true);
        }
    }

    /**
     * Генератор сеции пиров для manager.conf
     *
     *
     * @return string
     */
    public function generateManagerConf(): string
    {
        $arr_params  = [
            'AgentCalled',
            'AttendedTransfer',
            'BlindTransfer',
            'Bridge',
            'BridgeEnter',
            'BridgeLeave',
            'BridgeMerge',
            'Cdr',
            'ChanSpyStart',
            'ContactStatus',
            'ContactStatusDetail',
            'Dial',
            'DialBegin',
            'DialEnd',
            'ExtensionStatus',
            'Hangup',
            'Hold',
            'Masquerade',
            'MeetmeEnd',
            'MeetmeJoin',
            'MeetmeLeave',
            'MeetmeTalking',
            'MusicOnHold',
            'MusicOnHoldStart',
            'NewCallerid',
            'Newchannel',
            'Newstate',
            'OriginateResponse',
            'ParkedCall',
            'ParkedCallGiveUp',
            'ParkedCallTimeOut',
            'UnParkedCall',
            'Unhold',
            'PeerEntry',
            'Pickup',
            'Rename',
            'UserEvent',
            'DataGetTree',
            'QueueCallerJoin',
            'QueueCallerLeave',
        ];
        $managerUser = self::MODULE_AMI_USER;
        $conf        = "[{$managerUser}]" . PHP_EOL;
        $conf        .= "secret={$managerUser}" . PHP_EOL;
        $conf        .= 'deny=0.0.0.0/0.0.0.0' . PHP_EOL;
        $conf        .= 'permit=127.0.0.1/255.255.255.255' . PHP_EOL;
        $conf        .= 'read=agent,call,cdr,user' . PHP_EOL;
        $conf        .= 'write=system,call,originate,reporting' . PHP_EOL;
        $conf        .= 'eventfilter=!UserEvent: CdrConnector' . PHP_EOL;
        $conf        .= 'eventfilter=Event: (' . implode('|', $arr_params) . ')' . PHP_EOL;
        $conf        .= PHP_EOL;

        return $conf;
    }


    /**
     *  Process CoreAPI requests under root rights
     *
     * @param array $request
     *
     * @return PBXApiResult
     * @throws \Exception
     */
    public function moduleRestAPICallback(array $request): PBXApiResult
    {
        $res = new PBXApiResult();
        $res->processor = __METHOD__;
        $action = strtoupper($request['action']);
        switch ($action){
            case 'CHECK':
                // Проверка работы сервисов, выполняется при обновлении статуса или сохрании настроек
                $amigoDaemons = new AmigoDaemons();
                $res =  $amigoDaemons->checkModuleWorkProperly();
                break;
            default:
                $res->success = false;
                $res->messages[]='API action not found in moduleRestAPICallback ModuleCTIClient';
        }
        return $res;
    }


    /**
     * Returns module workers to start it at WorkerSafeScript
     *
     * @return array
     */
    public function getModuleWorkers(): array
    {
        return [
            [
                'type'   => WorkerSafeScriptsCore::CHECK_BY_PID_NOT_ALERT,
                'worker' => WorkerSafeScript::class,
            ],
            [
                'type'   => WorkerSafeScriptsCore::CHECK_BY_PID_NOT_ALERT,
                'worker' => WorkerLogRotate::class,
            ],
        ];
    }

    /**
     * Returns array of additional firewall rules for module
     *
     * @return array
     */
    public function getDefaultFirewallRules(): array
    {
        return [
            'ModuleCTIClient' => [
                'rules'     => [
                    ['portfrom' => 4222, 'portto' => 4222, 'protocol' => 'tcp', 'name' => 'NatsPort'],
                    ['portfrom' => 8222, 'portto' => 8222, 'protocol' => 'tcp', 'name' => 'NatsWebPort'],
                    ['portfrom' => 8000, 'portto' => 8000, 'protocol' => 'tcp', 'name' => 'CDRCTIPort'],
                ],
                'action'    => 'allow',
                'shortName' => 'CTI client 2.0',
            ],
        ];
    }

    /**
     * Kills all module daemons
     *
     */
    public function onAfterModuleDisable():void
    {
        $amigoDaemons = new AmigoDaemons();
        $amigoDaemons->stopAllServices();
        PBX::dialplanReload();
    }

    /**
     * Process after enable action in web interface
     *
     * @return void
     */
    public function onAfterModuleEnable(): void
    {
        System::invokeActions(['manager' => 0]);
        try {
            $amigoDaemons = new AmigoDaemons();
            $amigoDaemons->startAllServices(true);
        } catch (\Throwable $e) {
            Util::sysLogMsg($this->module_name, $e->getMessage());
        }
        PBX::dialplanReload();
    }

    /**
     * Кастомизация входящего контекста для конкретного маршрута.
     *
     * @param $rout_number
     *
     * @return string
     */
    public function generateIncomingRoutBeforeDial($rout_number): string
    {
        $conf = '';
        // TODO::Можно будет удалить после обновления внешних панелей у пользователей, например после 31.12.2022
        if(!PbxExtensionUtils::isEnabled('ModulePT1CCore')){
            $conf = "\t".'same => n,UserEvent(Interception,CALLERID: ${CALLERID(num)},chan1c: ${CHANNEL},FROM_DID: ${FROM_DID})';
        }
        //

        $conf .= "\t".'same => n,UserEvent(InterceptionCTI2,CALLERID: ${CALLERID(num)},chan1c: ${CHANNEL},FROM_DID: ${FROM_DID})';
        // Перехват на ответственного.
        return $conf;
    }

    /**
     * Генерация дополнительных контекстов.
     *
     * @return string
     */
    public function extensionGenContexts(): string
    {
        $PBXRecordCalls = $this->generalSettings['PBXRecordCalls'];
        $rec_options    = ($PBXRecordCalls === '1') ? 'r' : '';
        $conf = "[miko_cti2]\n";
        $conf .= 'exten => 10000107,1,Answer()' . "\n\t";
        $conf .= 'same => n,Set(CHANNEL(hangup_handler_wipe)=hangup_handler_meetme,s,1)' . "\n\t";
        $conf .= 'same => n,AGI(cdr_connector.php,meetme_dial)' . "\n\t";
        $conf .= 'same => n,Set(CALLERID(num)=Conference_Room)' . "\n\t";
        $conf .= 'same => n,Set(CALLERID(name)=${mikoconfcid})' . "\n\t";
        $conf .= 'same => n,Meetme(${mikoidconf},' . $rec_options . '${mikoparamconf})' . "\n\t";
        $conf .= 'same => n,Hangup()' . "\n\n";

        return $conf;
    }



}