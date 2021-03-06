<?php
/**
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 5 2020
 *
 */

namespace Modules\ModuleCTIClient\Lib;


use MikoPBX\Core\System\MikoPBXConfig;
use MikoPBX\Core\System\Processes;
use MikoPBX\Core\System\System;
use MikoPBX\Core\System\Util;
use MikoPBX\Modules\PbxExtensionUtils;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;
use Modules\ModuleCTIClient\Models\ModuleCTIClient;
use Phalcon\Di;
use Throwable;

class AmigoDaemons extends Di\Injectable
{
    public const SERVICE_GNATS = 'gnatsd-cti';
    public const SERVICE_CRM = 'crmd';
    public const SERVICE_AUTH = 'authd';
    public const SERVICE_AMI = 'amid';
    public const SERVICE_SPEECH = 'speechd';
    public const SERVICE_MONITOR = 'monitord';

    public array $dirs;
    private array $module_settings = [];
    private string $moduleUniqueID = 'ModuleCTIClient';
    private MikoPBXConfig $mikoPBXConfig;

    public function __construct()
    {
        if (PbxExtensionUtils::isEnabled($this->moduleUniqueID)){
            $module_settings = ModuleCTIClient::findFirst();
            if ($module_settings !== null) {
                $this->module_settings = $module_settings->toArray();
            }
        }
        $this->mikoPBXConfig = new MikoPBXConfig();

        $this->dirs = $this->getModuleDirs();
    }

    /**
     * Подготавливает директории для хранения конфигов и логов модуля
     *
     * @return array
     *
     */
    private function getModuleDirs(): array
    {
        // moduleDir
        $moduleDir = PbxExtensionUtils::getModuleDir($this->moduleUniqueID);

        // binDir
        $binDir = $moduleDir . '/bin';
        Util::mwMkdir($binDir);

        // confDir
        $confDir = "/etc/custom_modules/{$this->moduleUniqueID}";
        Util::mwMkdir($confDir);

        // spoolDir
        $tempDir = $this->config->path('core.tempDir');
        $spoolDir = "{$tempDir}/{$this->moduleUniqueID}";
        Util::mwMkdir($spoolDir);

        // logDir
        $logDir = System::getLogDir();
        $logDir = "{$logDir}/{$this->moduleUniqueID}";
        Util::mwMkdir($logDir);

        // pid
        $pidDir = "/var/run/custom_modules/{$this->moduleUniqueID}";
        Util::mwMkdir($pidDir);

        //filesDir
        $filesDir = "{$spoolDir}/files";
        Util::mwMkdir($filesDir);

        //ResourcesDir
        $resourcesDir = $moduleDir . '/Resources';

        return [
            'logDir'    => $logDir,
            'spoolDir'  => $spoolDir,
            'confDir'   => $confDir,
            'pidDir'    => $pidDir,
            'binDir'    => $binDir,
            'filesDir'  => $filesDir,
            'moduleDir' => $moduleDir,
            'resourcesDir' => $resourcesDir,
        ];
    }

    /**
     * Ротация логов для службы NATS
     */
    public function logRotateGnats(): void
    {
        $moduleEnabled = PbxExtensionUtils::isEnabled($this->moduleUniqueID);
        if ( ! $moduleEnabled) {
            return;
        }
        $log_dir = "{$this->dirs['logDir']}/gnats";

        $pid_file = "{$this->dirs['pidDir']}/gnatsd-cti.pid";
        if (file_exists($pid_file)) {
            $pid = file_get_contents($pid_file);
        } else {
            return;
        }

        $max_size = 1;
        if (empty($pid)) {
            return;
        }
        $text_config = "{$log_dir}/gnatsd.log {
    start 0
    rotate 9
    size {$max_size}M
    maxsize 1M
    missingok
    notifempty
    sharedscripts
    postrotate
        {$this->dirs['binDir']}/gnatsd-cti -sl reopen={$pid} > /dev/null 2> /dev/null
    endscript
}";
        $mb10        = $max_size * 1024 * 1024;

        $options = '';
        if (Util::mFileSize("{$log_dir}/gnatsd.log") > $mb10) {
            $options = '-f';
        }

        $path_conf = "{$this->dirs['confDir']}/gnatsd_cti_logrotate.conf";
        Util::fileWriteContent($path_conf, $text_config);
        if (file_exists("{$log_dir}/gnatsd.log")) {
            $logrotatePath = Util::which('logrotate');
            Processes::mwExecBg("{$logrotatePath} $options '{$path_conf}' > /dev/null 2> /dev/null");
        }

        // Очистка логов AMI.
        $findPath  = Util::which('find');
        $rmPath    = Util::which('rm');
        $xargsPath = Util::which('xargs');
        Processes::mwExec(
            "{$findPath} '{$log_dir}' -name '*.log.[0-9]' -mtime +7 | {$xargsPath} {$rmPath} > /dev/null 2> /dev/null"
        );
        Processes::mwExec(
            "{$findPath} '{$log_dir}' -name '*.log.[0-9][0-9]' -mtime +7 | {$xargsPath} {$rmPath} > /dev/null 2> /dev/null"
        );
        Processes::mwExec(
            "{$findPath} '{$log_dir}' -name '*.log' -mtime +7 | {$xargsPath} {$rmPath} > /dev/null 2> /dev/null"
        );
    }

    /**
     * Остановка сервисов панели
     */
    public function stopAllServices(): void
    {
        $nats                 = "{$this->dirs['binDir']}/".self::SERVICE_GNATS;
        $monitord             = "{$this->dirs['binDir']}/".self::SERVICE_MONITOR;
        $amid                 = "{$this->dirs['binDir']}/".self::SERVICE_AMI;
        $authd                = "{$this->dirs['binDir']}/".self::SERVICE_AUTH;
        $crmd                 = "{$this->dirs['binDir']}/".self::SERVICE_CRM;
        $speechd              = "{$this->dirs['binDir']}/".self::SERVICE_SPEECH;

        Processes::processWorker($nats, '',self::SERVICE_GNATS, 'stop');
        Processes::processWorker($monitord, '', self::SERVICE_MONITOR, 'stop');
        Processes::processWorker($amid, '', self::SERVICE_AMI, 'stop');
        Processes::processWorker($authd, '', self::SERVICE_AUTH, 'stop');
        Processes::processWorker($crmd, '', self::SERVICE_CRM, 'stop');
        Processes::processWorker($speechd, '', self::SERVICE_SPEECH, 'stop');
    }


    /**
     * Запуск или перезапуск всех сервисов
     *
     * @param bool $restart
     */
    public function startAllServices(bool $restart = false): void
    {
        $moduleEnabled = PbxExtensionUtils::isEnabled($this->moduleUniqueID);

        // GNATS
        $nats_process_log = $this->dirs['logDir'] . '/gnats_process.log';
        $nats                 = "{$this->dirs['binDir']}/".self::SERVICE_GNATS;

        // Monitord
        $monitord_process_log = $this->dirs['logDir'] . '/monitord_process.log';
        $monitord             = "{$this->dirs['binDir']}/".self::SERVICE_MONITOR;

        $amid                 = "{$this->dirs['binDir']}/".self::SERVICE_AMI;
        $authd                = "{$this->dirs['binDir']}/".self::SERVICE_AUTH;
        $crmd                 = "{$this->dirs['binDir']}/".self::SERVICE_CRM;
        $speechd              = "{$this->dirs['binDir']}/".self::SERVICE_SPEECH;

        if ($moduleEnabled) {
            $this->generateConfFiles();
            if ($restart) {
                Processes::processWorker($amid, '', self::SERVICE_AMI, 'stop');
                Processes::processWorker($authd, '', self::SERVICE_AUTH, 'stop');
                Processes::processWorker($crmd, '', self::SERVICE_CRM, 'stop');
                Processes::processWorker($speechd, '', self::SERVICE_SPEECH, 'stop');
            }
            Processes::processWorker(
                $nats,
                "--config {$this->dirs['confDir']}/nats.conf",
                self::SERVICE_GNATS,
                $restart?'restart':'start',
                $nats_process_log
            );
            Processes::processWorker(
                $monitord,
                "-c {$this->dirs['confDir']}/monitord.json",
                self::SERVICE_MONITOR,
                $restart ? 'restart' : 'start',
                $monitord_process_log
            );
        } else {
            $this->stopAllServices();
        }
    }

    /**
     * Create configs for all files
     */
    private function generateConfFiles(): void
    {
        $this->generateNatsConf();
        $this->generateHeadersConf();
        $this->generateCrmdConf();
        $this->generateAuthdConf();
        $this->generateAmidConf();
        $this->generateSpeechdConf();
        $this->generateMonitordConf();
    }

    /**
     * Старт сервера обработки очередей задач.
     */
    private function generateNatsConf(): void
    {
        $sessionsDir = "{$this->dirs['spoolDir']}/sessions";
        Util::mwMkdir($sessionsDir);

        $logDir = "{$this->dirs['logDir']}/gnats";
        Util::mwMkdir($logDir);

        $pid_file = "{$this->dirs['pidDir']}/gnatsd-cti.pid";

        $settings = [
            'port'             => $this->getNatsPort(),
            'http_port'        => $this->getNatsHttpPort(),
            'debug'            => 'false',
            'trace'            => 'false',
            'logtime'          => 'true',
            'pid_file'         => $pid_file,
            'max_connections'  => '1000',
            'max_payload'      => '1000000',
            'max_control_line' => '512',
            'sessions_path'    => $sessionsDir,
            'log_file'         => "{$logDir}/gnatsd.log",
        ];

        if ($this->module_settings['auto_settings_mode']==='1'){
            $settings['nats_password']  = '"'.$this->module_settings['nats_password'].'"';
        }

        $config   = '';
        foreach ($settings as $key => $val) {
            $config .= "{$key}: {$val} \n";
        }

        Util::fileWriteContent($this->dirs['confDir'] . '/nats.conf', $config);

        $licKey = $this->mikoPBXConfig->getGeneralSettings('PBXLicense');
        file_put_contents("{$sessionsDir}/license.key", $licKey);

        if (file_exists($pid_file)) {
            $pid = file_get_contents($pid_file);
            Processes::mwExec("{$this->dirs['binDir']}/gnatsd-cti -sl reopen={$pid} > /dev/null 2> /dev/null");
        }
    }

    /**
     * Порт, на котором работает NATS очередь
     *
     * @return string
     */
    public static function getNatsPort(): string
    {
        return '4222';
    }

    /**
     * Web порт, на котором работает NATS очередь
     *
     * @return string
     */
    public static function getNatsHttpPort(): string
    {
        return '8222';
    }

    /**
     * Создает файл настроек автоподъема трубки
     */
    private function generateHeadersConf(): void
    {
        $settings_headers = [
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Call-Info:\\;answer-after=0"',
                    'pbx'     => [
                        [
                            'name'   => 'FreePBX',
                            'driver' => [
                                'PJSIP' => 'PJSIP_HEADER(add,Call-Info)="\\;answer-after=0"',
                            ],
                        ],
                    ],
                ],
                'phones' => [
                    'linksys',
                    'cisco',
                    'miko',
                    'telephone-pt1c',
                    'nightbird',
                    'grandstream',
                    'microsip',
                    'zoiper',
                ],
            ],
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Call-Info:answer-after=0"',
                    'pbx'     => [
                        [
                            'name'   => 'FreePBX',
                            'driver' => [
                                'PJSIP' => 'PJSIP_HEADER(add,Call-Info)="answer-after=0"',
                            ],
                        ],
                    ],
                ],
                'phones' => [
                    'yealink',
                    'vp530p',
                ],
            ],
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Call-Info: sip:127.0.0.1\\;answer-after=0"',
                    'pbx'     => [
                        [
                            'name'   => 'FreePBX',
                            'driver' => [
                                'PJSIP' => 'PJSIP_HEADER(add,Call-Info)="sip:127.0.0.1\\;answer-after=0"',
                            ],
                        ],
                    ],
                ],
                'phones' => [
                    'snom',
                ],
            ],
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Alert-Info: info=alert-autoanswer"',
                    'pbx'     => [
                        [
                            'name'   => 'FreePBX',
                            'driver' => [
                                'PJSIP' => 'PJSIP_HEADER(add,Alert-Info)="info=alert-autoanswer"',
                            ],
                        ],
                    ],
                ],
                'phones' => [
                    'aastra',
                    'fanvil',
                ],
            ],
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Alert-Info: Ring Answer"',
                    'pbx'     => [
                        [
                            'name'   => 'FreePBX',
                            'driver' => [
                                'PJSIP' => 'PJSIP_HEADER(add,Alert-Info)="Ring Answer"',
                            ],
                        ],
                    ],
                ],
                'phones' => [
                    'polycom',
                ],
            ],
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Alert-Info:Auto Answer"',
                    'pbx'     => [
                        [
                            'name'   => 'FreePBX',
                            'driver' => [
                                'PJSIP' => 'PJSIP_HEADER(add,Alert-Info)="Auto Answer"',
                            ],
                        ],
                    ],
                ],
                'phones' => [
                    'jitsi',
                ],
            ],
        ];

        file_put_contents(
            "{$this->dirs['confDir']}/headers.json",
            json_encode($settings_headers, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Создает файл настроек для демона crmd
     * Который отвечает за взаимодействие с CRM
     */
    private function generateCrmdConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/".self::SERVICE_CRM;
        Util::mwMkdir($logDir);

        $settings_crm = [
            'mq'             => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'log_level'      => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path'       => $logDir,
            'cleanup_period' => 10,  // Cache of links cleanup period.
            'long_poll'      => [
                'port'               => '8224',
                'event_time_to_live' => 10,
            ],
        ];

        if ($this->module_settings['web_service_mode'] === '1') {
            $settings_crm['wsdl'] = [
                'host'       => $this->module_settings['server1chost'],
                'port'       => $this->module_settings['server1cport'],
                'login'      => $this->module_settings['login'],
                'password'   => $this->module_settings['secret'],
                'url'        => "/{$this->module_settings['database']}/ws/miko_crm_api.1cws",
                'keep-alive' => 3000,
                'timeout'    => 10,
            ];
        }

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/crm.json",
            json_encode($settings_crm, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Создание файла конфигураци для authd.
     */
    private function generateAuthdConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/".self::SERVICE_AUTH;
        Util::mwMkdir($logDir);

        $settings_auth = [
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path'  => $logDir,
            'mq'        => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'auth'      => [
                'authorization'   => 'os',
                'settings_dir'    => '',
                'settings_source' => 'crm',
                'askozia_support' => true,
            ],
        ];
        Util::fileWriteContent(
            "{$this->dirs['confDir']}/auth.json",
            json_encode($settings_auth, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Создание файла конфигураци для authd.
     */
    private function generateAmidConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/".self::SERVICE_AMI;
        Util::mwMkdir($logDir);

        $WEBPort = escapeshellcmd($this->mikoPBXConfig->getGeneralSettings('WEBPort'));
        $AMIPort = escapeshellcmd($this->mikoPBXConfig->getGeneralSettings('AMIPort'));

        $settings_amid = [
            'pbx'       => 'Askozia',
            'originate' => [
                'default_context'               => '',
                'transfer_context'              => '',
                'multiple_registration_support' => true,
            ],
            'mq'        => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path'  => $logDir,
            'ami'       => [
                'user'     => CTIClientConf::MODULE_AMI_USER,
                'password' => $this->module_settings['ami_password'],
                'host'     => '127.0.0.1',
                'port'     => $AMIPort,
            ],
            'database'  => [
                'path' => "{$this->dirs['moduleDir']}/db/cdr/history.db",
            ],
            'http'      => [
                'port'  => '8000',
                'limit' => 20,
            ],
            'records'   => [
                'request'  => "http://127.0.0.1:$WEBPort/pbxcore/api/cdr/playback?view=%s",
                'result'   => '',
                'login'    => '',
                'password' => '',
            ],
            'long_poll' => [
                'event_time_to_live' => 10,
            ],
            'files'     => $this->dirs['filesDir'],
        ];


        Util::fileWriteContent(
            "{$this->dirs['confDir']}/ami.json",
            json_encode($settings_amid, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Создание файла конфигурации для monitord.
     */
    private function generateMonitordConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/".self::SERVICE_MONITOR;
        Util::mwMkdir($logDir);

        $arr_settings = [
            'mq'        => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path'  => $logDir,
            'work_dir'  => $this->dirs['spoolDir'],
            'period'    => 30,
            'daemons'   => [
                [
                    'path'    => "{$this->dirs['binDir']}/".self::SERVICE_AMI,
                    'args'    => "-c {$this->dirs['confDir']}/ami.json",
                    'subject' => 'daemon.asterisk.ping',
                ],
                [
                    'path'    => "{$this->dirs['binDir']}/".self::SERVICE_CRM,
                    'args'    => "-c {$this->dirs['confDir']}/crm.json",
                    'subject' => 'daemon.1c.ping',
                ],
                [
                    'path'    => "{$this->dirs['binDir']}/".self::SERVICE_AUTH,
                    'args'    => "-c {$this->dirs['confDir']}/auth.json",
                    'subject' => 'daemon.auth.ping',
                ],
                [
                    'path'    => "{$this->dirs['binDir']}/".self::SERVICE_SPEECH,
                    'args'    => "-c {$this->dirs['confDir']}/speech.json",
                    'subject' => 'daemon.speech.ping',
                ],
            ],
        ];
        Util::fileWriteContent(
            "{$this->dirs['confDir']}/monitord.json",
            json_encode($arr_settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
        file_put_contents("{$this->dirs['spoolDir']}/auth.hash", 'd41d8cd98f00b204e9800998ecf8427e');
    }

    /**
     * Создание файла конфигураци для speechd.
     */
    private function generateSpeechdConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/".self::SERVICE_SPEECH;
        Util::mwMkdir($logDir);
        $workDir = "{$this->dirs['spoolDir']}/speech";
        Util::mwMkdir($workDir);
        $settings_auth = [
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path'  => $logDir,
            'mq'        => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'http'        => [
                'port' => '8227',
            ],
            'work_dir'  => $workDir,
            'sox'  => Util::which('sox'),
            'normalizer'        => [
                'dictionaries' => "{$this->dirs['resourcesDir']}/pymorphy2_dicts_ru",
            ],
        ];
        Util::fileWriteContent(
            "{$this->dirs['confDir']}/speech.json",
            json_encode($settings_auth, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }


    /**
     * Тестирование живой ли модуль, доступны ли сервисы
     *
     * @return PBXApiResult
     */
    public function checkModuleWorkProperly(): PBXApiResult
    {
        $res            = new PBXApiResult();
        $res->processor = __METHOD__;

        $moduleEnabled = PbxExtensionUtils::isEnabled($this->moduleUniqueID);
        if (!$moduleEnabled){
            $res->data['statuses'] = 'Module disabled';
            return $res;
        }

        $statusMonitor  = $this->checkMonitorStatus();
        $statusNats     = $this->checkNatsStatus();
        $status1C       = $this->checkWorkerStatus('1c');
        $statusAuth     = $this->checkWorkerStatus('auth');
        $statusAsterisk = $this->checkWorkerStatus('asterisk');
        $statusSpeech   = $this->checkWorkerStatus('speech');

        $res->success = $statusMonitor['state'] === 'ok'
            &&$status1C['state'] === 'ok'
            && $statusAuth['state'] === 'ok'
            && $statusAsterisk['state'] === 'ok'
            && $statusSpeech['state'] === 'ok'
            && $statusNats['state'] === 'ok';

        $res->data['statuses'] = [
            $statusMonitor,
            $statusNats,
            $statusAuth,
            $statusAsterisk,
            $statusSpeech,
            $status1C,
        ];

        return $res;
    }

    /**
     * Проверка, запущена ли служба NATS
     *
     * @return array
     */
    private function checkNatsStatus(): array
    {
        $statusUrl = 'http://127.0.0.1:' . $this->getNatsHttpPort() . '/varz';
        $curl      = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 1);
        curl_setopt($curl, CURLOPT_URL, $statusUrl);

        try {
            $responce = curl_exec($curl);
            $responce = str_replace('\n', '', $responce);
        } catch (Throwable $e) {
            $responce = null;
        }
        $data = json_decode($responce, true);
        curl_close($curl);
        if ($data !== null) {
            $result = [
                'name'    => 'nats',
                'state'   => 'ok',
                'version' => $data['version'],
                'uptime'  => $data['uptime'],
                'start'   => $data['start'],
            ];
        } else {
            $result = [
                'name'    => 'nats',
                'state'   => 'unknown',
                'version' => 'unknown',
            ];
        }

        return $result;
    }

    /**
     * Возвращает статус воркера
     *
     * @param $workerName - название воркера, статус которого получаем
     *
     * @return array
     */
    private function checkWorkerStatus($workerName): array
    {
        $statusUrl = 'http://127.0.0.1:' . $this->getNatsHttpPort() . '/manager.api/status?daemon=' . $workerName;
        $curl      = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 1);
        curl_setopt($curl, CURLOPT_URL, $statusUrl);

        try {
            $responce = curl_exec($curl);
            $responce = str_replace('\n', '', $responce);
        } catch (Throwable $e) {
            $responce = null;
        }
        $data = json_decode($responce, true);
        curl_close($curl);
        if ($data !== null
            && array_key_exists('result', $data)
            && is_array($data['result'])
        ) {
            $result = $data['result'];
            // Move state and name on the first position
            if (key_exists('state', $result)){
                $result = [ 'state' => $result[ 'state' ] ] + $result;
            }
            if (key_exists('name', $result)) {
                $result = ['name' => $result['name']] + $result;
            }
        } else {
            $result = [
                'name'  => $workerName,
                'state' => 'unknown',
            ];
        }

        return $result;
    }

    /**
     * Возвращает статус монитора
     *
     *
     * @return array
     */
    private function checkMonitorStatus(): array
    {
        $result = [
             'name'  => 'monitord',
             'state' => 'unknown',
        ];
        $pid     = Processes::getPidOfProcess(self::SERVICE_MONITOR);
        if (!empty($pid)) {
            $result['state']='ok';
            $result['pid']= $pid;
        }

        return $result;
    }

    /**
     * Ask caller id from CRM system
     * @param string $number
     *
     * @return string
     */
    public static function getCallerId(string $number):string {
        $getNumberUrl = 'http://127.0.0.1:8224/getcallerid?number='.$number;
        $curl      = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        curl_setopt($curl, CURLOPT_URL, $getNumberUrl);

        try {
            $response = curl_exec($curl);
            $response = str_replace('\n', '', $response);
        } catch (Throwable $e) {
            $response = null;
        }
        $parsedAnswer = json_decode($response, true);
        curl_close($curl);
        if ($parsedAnswer !== null
            && $parsedAnswer['result']==='Success') {
            $result = $parsedAnswer['data']['client'];
        } else {
            $result = '';
        }

        return $result;
    }

}