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

namespace Modules\ModuleCTIClient\Lib;

use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Core\System\PBX;
use MikoPBX\Core\System\System;
use MikoPBX\Core\Workers\Cron\WorkerSafeScriptsCore as WorkerSafeScriptsCore;
use MikoPBX\Modules\Config\ConfigClass;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;
use Modules\ModuleCTIClient\Models\ModuleCTIClient;


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
        $needRestartServices = false;
        if ($data['model'] === PbxSettings::class
            && $data['recordId'] === 'PBXLicense') {
            $needRestartServices = true;
        }
        if ($data['model'] === ModuleCTIClient::class) {
            PBX::dialplanReload();

            // §3.7 (R7/F1): don't bounce the whole stack (gnatsd/amid/crmd) on
            // a migration-toggle flip — that defeats the in-place reconcile.
            // changedFields is Phalcon's getUpdatedFields(): a NUMERIC list of
            // field-NAME strings, so the names are the VALUES (array_values,
            // NOT array_keys — F1).
            $changed = array_values((array)($data['changedFields'] ?? []));
            $migrationToggles = ['remote_whatsapp', 'remote_telegram', 'remote_max'];
            $migrationOnly = $changed !== [] && empty(array_diff($changed, $migrationToggles));

            if ($migrationOnly) {
                // A toggle flip is also the operator re-trigger after a
                // FAIL-PARK: clear `parked` for the changed services (mapped to
                // their manager.api names) so the worker resumes the migration.
                $toggleToService = [
                    'remote_whatsapp' => 'chats',
                    'remote_telegram' => 'tg',
                    'remote_max'      => 'max',
                ];
                $svcs = [];
                foreach (array_intersect($changed, $migrationToggles) as $field) {
                    if (isset($toggleToService[$field])) {
                        $svcs[] = $toggleToService[$field];
                    }
                }
                $amigoDaemons = new AmigoDaemons();
                $amigoDaemons->clearParkedForServices($svcs);
                // In-place: regenerate monitord.json + fire /reconcile. The
                // worker (re-reads settings every tick) drives the migration.
                // NO stack bounce.
                $amigoDaemons->applyMonitordConfigAndReconcile();
            } else {
                // Tunnel params (host/port/login/key/bin_dir) and every other
                // module field need a real restart: the Go ssh tunnel is started
                // once in main.Manage() and is NOT re-read by doReconcile.
                // If changedFields is absent/empty, fall back to a restart too
                // (correct but heavier, never wrong).
                $needRestartServices = true;
            }
        }

        if ($needRestartServices) {
            $amigoDaemons = new AmigoDaemons();
            $amigoDaemons->startAllServices(true);
        }
    }

    /**
     * Генератор секции пиров для manager.conf
     *
     *
     * @return string
     */
    public function generateManagerConf(): string
    {
        $module_settings = ModuleCTIClient::findFirst();
        if ($module_settings === null) {
            return '';
        }
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
            'MessageWaiting',
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
            'QueueMember',
            'QueueStatusComplete'
        ];
        $managerUser = self::MODULE_AMI_USER;
        $conf        = "[{$managerUser}]" . PHP_EOL;
        $conf        .= "secret={$module_settings->ami_password}" . PHP_EOL;
        $conf        .= 'deny=0.0.0.0/0.0.0.0' . PHP_EOL;
        $conf        .= 'permit=127.0.0.1/255.255.255.255' . PHP_EOL;
        $conf        .= 'read=agent,call,cdr,user,system' . PHP_EOL;
        $conf        .= 'write=system,call,originate,reporting' . PHP_EOL;
        $conf        .= 'eventfilter=!UserEvent: CdrConnector' . PHP_EOL;
        $conf        .= 'eventfilter=Event: (' . implode('|', $arr_params) . ')' . PHP_EOL;
        $conf        .= PHP_EOL;

        return $conf;
    }


    /**
     * Process CoreAPI requests under root rights
     *
     * @param array $request
     *
     * @return PBXApiResult An object containing the result of the API call.
     * @throws \Exception
     */
    public function moduleRestAPICallback(array $request): PBXApiResult
    {
        $res            = new PBXApiResult();
        $res->processor = __METHOD__;
        $action         = strtoupper($request['action']);
        switch ($action) {
            case 'CHECK':
                // Проверка работы сервисов, выполняется при обновлении статуса или сохрании настроек
                $amigoDaemons = new AmigoDaemons();
                $res          = $amigoDaemons->checkModuleWorkProperly();
                break;
            case 'TESTREMOTECONNECTION':
                // Ad-hoc SSH probe from the "Test connection" button on the
                // Remote messengers tab. Operator-supplied parameters live in
                // $request['data']; we never touch the DB here.
                $amigoDaemons = new AmigoDaemons();
                $data         = is_array($request['data'] ?? null) ? $request['data'] : [];
                // Older PBX cores (<= 2024.x) do NOT parse a JSON request body
                // into $request['data'] — they put $_REQUEST there and park the
                // raw php://input under $request['input']. Since the form POSTs
                // application/json, PHP leaves $_POST/$_REQUEST empty, so the
                // host/login/key never reach us via 'data'. Decode 'input' and
                // merge it over 'data' so the probe works on both old and new
                // cores (on new cores 'input' equals what 'data' already holds).
                $rawInput = (string)($request['input'] ?? '');
                if ($rawInput !== '') {
                    $decodedInput = json_decode($rawInput, true);
                    if (is_array($decodedInput)) {
                        $data = array_merge($data, $decodedInput);
                    }
                }
                // The form masks the saved SSH key as '******' — if the value
                // coming back contains the mask sentinel (or is empty) the
                // operator did not paste a new key, so we fall back to what
                // is already in the DB instead of trying to log in with stars.
                $key = (string)($data['key'] ?? '');
                if ($key === '' || strpos($key, '******') !== false) {
                    $saved = ModuleCTIClient::findFirst();
                    if ($saved !== null) {
                        $data['key'] = (string)($saved->remote_ssh_key ?? '');
                    }
                }
                // Fall back to the saved base dir too when the form doesn't
                // send one, otherwise the rw probe lands in the wrong place.
                if (trim((string)($data['base'] ?? '')) === '') {
                    $saved = $saved ?? ModuleCTIClient::findFirst();
                    if ($saved !== null) {
                        $data['base'] = (string)($saved->remote_bin_dir ?? '');
                    }
                }
                $probe          = $amigoDaemons->testRemoteSshConnection($data);
                $res->success   = (bool)$probe['ok'];
                $res->data      = $probe;
                if (!$probe['ok'] && $probe['error'] !== '') {
                    $res->messages[] = $probe['error'];
                }
                break;
            default:
                $res->success    = false;
                $res->messages[] = 'API action not found in moduleRestAPICallback ModuleCTIClient';
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
            [
                'type'   => WorkerSafeScriptsCore::CHECK_BY_PID_NOT_ALERT,
                'worker' => WorkerRemoteTunnel::class,
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
                    [
                        'portfrom'    => 4222,
                        'portto'      => 4222,
                        'protocol'    => 'tcp',
                        'name'        => 'NatsPort',
                        'portFromKey' => '',
                        'portToKey'   => '',
                    ],
                    [
                        'portfrom'    => 8222,
                        'portto'      => 8222,
                        'protocol'    => 'tcp',
                        'name'        => 'NatsWebPort',
                        'portFromKey' => '',
                        'portToKey'   => '',
                    ],
                    [
                        'portfrom'    => 8000,
                        'portto'      => 8000,
                        'protocol'    => 'tcp',
                        'name'        => 'CDRCTIPort',
                        'portFromKey' => '',
                        'portToKey'   => '',
                    ],
                    [
                        'portfrom'    => 8002,
                        'portto'      => 8002,
                        'protocol'    => 'tcp',
                        'name'        => 'PROXYCTIPort',
                        'portFromKey' => '',
                        'portToKey'   => '',
                    ],
                ],
                'action'    => 'allow',
                'shortName' => 'CTI client 4.0',
            ],
        ];
    }

    /**
     * Kills all module daemons — local first, then the remote VPS stack if
     * offload is configured. Without the remote step monitord + chatsd/tgd/
     * maxd would keep running (and holding messenger sessions) on the VPS
     * after the operator switched the module off here.
     */
    public function onAfterModuleDisable(): void
    {
        $amigoDaemons = new AmigoDaemons();
        $amigoDaemons->stopAllServices();
        // Best-effort — if SSH params aren't filled (offload was never set up)
        // stopRemoteServices() returns immediately, so this is safe to call
        // unconditionally.
        $amigoDaemons->stopRemoteServices();
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
        $amigoDaemons = new AmigoDaemons();
        $amigoDaemons->startAllServices();
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
        $conf .= "\t" . 'same => n,UserEvent(InterceptionCTI2,CALLERID: ${CALLERID(num)},chan1c: ${CHANNEL},FROM_DID: ${FROM_DID})' . "\n\t";

        $module_settings = ModuleCTIClient::findFirst();
        if ($module_settings === null
            || intval($module_settings->setup_caller_id) === 1) {
            if (intval($module_settings->transliterate_caller_id) === 1) {
                $agiFile = "set-caller-id-with-transliteration.php";
            } else {
                $agiFile = "set-caller-id.php";
            }
            $conf .= "\t" . "same => n,AGI({$this->moduleDir}/agi-bin/{$agiFile})" . "\n\t";
        }

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
        $conf           = "[miko_cti2]\n";
        $conf           .= 'exten => 10000107,1,Answer()' . "\n\t";
        $conf           .= 'same => n,Set(CHANNEL(hangup_handler_wipe)=hangup_handler_meetme,s,1)' . "\n\t";
        $conf           .= 'same => n,AGI(cdr_connector.php,meetme_dial)' . "\n\t";
        $conf           .= 'same => n,Set(CALLERID(num)=Conference_Room)' . "\n\t";
        $conf           .= 'same => n,Set(CALLERID(name)=${mikoconfcid})' . "\n\t";
        $conf           .= 'same => n,Meetme(${mikoidconf},' . $rec_options . '${mikoparamconf})' . "\n\t";
        $conf           .= 'same => n,Hangup()' . "\n\n";

        $conf .= '[miko-cti2-originate]' . "\n";
        $conf .= 'exten => _[0-9*#+a-zA-Z]!,1,Set(pt1c_cid=${origCid})' . "\n\t";
        $conf .= 'same => n,Goto(internal-originate,${EXTEN},1)' . "\n\n";

        $conf .= '[miko-cti2-goto]' . "\n";
        $conf .= 'exten => _[0-9*#+a-zA-Z]!,1,Wait(0.2)' . "\n\t";
        $conf .= 'same => n,ExecIf($["${mikoContext}x" = "x"]?Set(mikoContext=all_peers))' . "\n\t";
        $conf .= 'same => n,ExecIf($["${ORIGINATE_SRC_CHANNEL}x" != "x"]?ChannelRedirect(${ORIGINATE_SRC_CHANNEL},${mikoContext},${EXTEN},1))' . "\n\t";
        $conf .= 'same => n,Hangup' . "\n";
        $conf .= 'exten => failed,1,Hangup' . "\n";
        $conf .= 'exten => h,1,Hangup' . "\n\n";

        $conf .= '[miko-cti2-interception-bridge]' . "\n";
        $conf .= 'exten => _[0-9*#+a-zA-Z]!,1,Set(pt1c_cid=${origCid})' . "\n\t";
        $conf .= 'same => n,Goto(interception-bridge,${EXTEN},1)' . "\n";
        $conf .= 'exten => h,1,Hangup' . "\n\n";

        $conf .= '[miko-cti2-spy]' . "\n";
        $conf .= 'exten => _[0-9*#+a-zA-Z]!,1,Answer()' . "\n\t";
        $conf .= 'same => n,ExecIf($["${SPY_ARGS}x" != "x"]?ChanSpy(${DST_CHANNEL},${SPY_ARGS}))' . "\n\t";
        $conf .= 'same => n,Hangup' . "\n\n";
        $conf .= 'exten => h,1,Hangup' . "\n\n";

        $conf .= '[miko-cti2-playback-mp3]' . "\n";
        $conf .= 'exten => _[0-9*#+a-zA-Z]!,1,Answer()' . "\n\t";
        $conf .= 'same => n,ExecIf($["${FILENAME}x" != "x"]?MP3Player(${FILENAME}))' . "\n\t";
        $conf .= 'same => n,Hangup' . "\n";
        $conf .= 'exten => h,1,Hangup' . "\n\n";

        return $conf;
    }


}