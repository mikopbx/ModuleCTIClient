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


use MikoPBX\Common\Models\PbxExtensionModules;
use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Core\System\MikoPBXConfig;
use MikoPBX\Core\System\Processes;
use MikoPBX\Core\System\System;
use MikoPBX\Core\System\Util;
use MikoPBX\Modules\PbxExtensionUtils;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;
use Modules\ModuleCTIClient\Models\ModuleCTIClient;
use Phalcon\Di;
use Throwable;

/**
 * @property \Phalcon\Config $config
 */
class AmigoDaemons extends Di\Injectable
{
    public const SERVICE_GNATS = 'gnatsd-cti';
    public const SERVICE_CRM = 'crmd';
    public const SERVICE_AUTH = 'authd';
    public const SERVICE_AMI = 'amid';
    public const SERVICE_SPEECH = 'speechd';
    public const SERVICE_MONITOR = 'monitord';
    public const SERVICE_CHATS = 'chatsd';
    public const SERVICE_PROXY = 'proxyd';
    public const SERVICE_TELEGRAM = 'tgd';

    public array $dirs;
    private array $module_settings = [];
    private string $moduleUniqueID = 'ModuleCTIClient';
    private MikoPBXConfig $mikoPBXConfig;

    /**
     * Constructor for the class.
     */
    public function __construct()
    {
        // Check if the module is enabled
        if (PbxExtensionUtils::isEnabled($this->moduleUniqueID)) {

            // Retrieve the module settings from the database
            $module_settings = ModuleCTIClient::findFirst();
            if ($module_settings !== null) {
                $this->module_settings = $module_settings->toArray();
            }
        }

        // Create an instance of MikoPBXConfig
        $this->mikoPBXConfig = new MikoPBXConfig();

        // Get the module directories
        $this->dirs = $this->getModuleDirs();
    }

    /**
     * Prepares directories for storing module configurations and logs.
     *
     * @return array An array containing the directory paths.
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
            'logDir' => $logDir,
            'spoolDir' => $spoolDir,
            'confDir' => $confDir,
            'pidDir' => $pidDir,
            'binDir' => $binDir,
            'filesDir' => $filesDir,
            'moduleDir' => $moduleDir,
            'resourcesDir' => $resourcesDir,
        ];
    }

    /**
     * Deletes logs older than one week.
     */
    public function deleteOldLogs(): void
    {
        $findPath = Util::which('find');
        $rmPath = Util::which('rm');
        $xargsPath = Util::which('xargs');
        Processes::mwExec(
            "{$findPath} '{$this->dirs['logDir']}' -name '*.log.[0-9]' -mtime +7 | {$xargsPath} {$rmPath} > /dev/null 2> /dev/null"
        );
        Processes::mwExec(
            "{$findPath} '{$this->dirs['logDir']}' -name '*.log.[0-9][0-9]' -mtime +7 | {$xargsPath} {$rmPath} > /dev/null 2> /dev/null"
        );
        Processes::mwExec(
            "{$findPath} '{$this->dirs['logDir']}' -name '*.log' -mtime +7 | {$xargsPath} {$rmPath} > /dev/null 2> /dev/null"
        );
    }

    /**
     * Stops all CTI services.
     */
    public function stopAllServices(): void
    {
        $serviceList = [
            self::SERVICE_GNATS,
            self::SERVICE_MONITOR,
            self::SERVICE_AMI,
            self::SERVICE_AUTH,
            self::SERVICE_CRM,
            self::SERVICE_SPEECH,
            self::SERVICE_CHATS,
            self::SERVICE_TELEGRAM,
            self::SERVICE_PROXY
        ];

        foreach ($serviceList as $service) {
            $path = "{$this->dirs['binDir']}/{$service}";
            Processes::processWorker($path, '', $service, 'stop');
        }
    }

    /**
     * Starts or restarts all services.
     *
     * @param bool $restart Whether to restart the services.
     */
    public function startAllServices(bool $restart = false): void
    {
        $moduleEnabled = PbxExtensionUtils::isEnabled($this->moduleUniqueID);

        $monitorPID = Processes::getPidOfProcess(self::SERVICE_MONITOR);

        if ($monitorPID !== ''
            && $restart === false
            && $moduleEnabled === true
        ) {
            return;  // Nothing to do, everything is already running
        }

        // Monitord
        $monitord_process_log = $this->dirs['logDir'] . '/monitord_process.log';
        $monitord = "{$this->dirs['binDir']}/" . self::SERVICE_MONITOR;


        if ($moduleEnabled) {
            $this->generateConfFiles();
            if ($restart) {
                $this->stopAllServices();
            }
            Processes::processWorker(
                $monitord,
                "-c {$this->dirs['confDir']}/monitord.json",
                self::SERVICE_MONITOR,
                'start',
                $monitord_process_log
            );
        } else {
            $this->stopAllServices();
        }
    }

    /**
     * Create configs for all services
     */
    private function generateConfFiles(): void
    {
        $this->generateNatsConf();
        $this->generateHeadersConf();
        $this->generateCrmdConf();
        $this->generateAuthdConf();
        $this->generateAmidConf();
        $this->generateSpeechdConf();
        $this->generateChatsConf();
        $this->generateTelegramConf();
        $this->generateProxyConf();
        $this->generateMonitordConf();
    }

    /**
     * Start the task queue server and makes - nats.conf
     */
    private function generateNatsConf(): void
    {
        $sessionsDir = "{$this->dirs['spoolDir']}/sessions";
        Util::mwMkdir($sessionsDir);

        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_GNATS;
        Util::mwMkdir($logDir);

        $pid_file = "{$this->dirs['pidDir']}/gnatsd-cti.pid";

        $moduleVersion='unknown';
        $currentModuleInfo = PbxExtensionModules::findFirstByUniqid($this->moduleUniqueID);
        if ($currentModuleInfo){
            $moduleVersion = $currentModuleInfo->version;
        }

        $settings = [
            'port' => $this->getNatsPort(),
            'http_port' => $this->getNatsHttpPort(),
            'debug' => $this->module_settings['debug_mode'] ? 'true' : 'false',
            'trace' => 'false',
            'logtime' => 'true',
            'pid_file' => $pid_file,
            'max_connections' => '1000',
            'max_payload' => '1000000',
            'max_control_line' => '512',
            'sessions_path' => $sessionsDir,
            'log_file' => "{$logDir}/gnatsd.log",
            'log_size_limit'=>10485760, //10Mb
            'pbx' => "MikoPBX",
            'module_version' => '"' . $moduleVersion. '"',
        ];

        if ($this->module_settings['auto_settings_mode'] === '1') {
            $settings['nats_password'] = '"' . $this->module_settings['nats_password'] . '"';
        }

        $settings['web_port'] = PbxSettings::getValueByKey('WEBPort');

        $config = '';
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
     * Get the port on which the NATS queue is running.
     *
     * @return string
     */
    public static function getNatsPort(): string
    {
        return '4222';
    }

    /**
     * Get the HTTP port on which the NATS queue is running.
     *
     * @return string
     */
    public static function getNatsHttpPort(): string
    {
        return '8222';
    }


    /**
     * Generate the auto-answer settings file.
     */
    private function generateHeadersConf(): void
    {
        $settings_headers = [
            [
                'header' => [
                    'default' => 'SIPADDHEADER="Call-Info:\\;answer-after=0"',
                    'pbx' => [
                        [
                            'name' => 'FreePBX',
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
                    'pbx' => [
                        [
                            'name' => 'FreePBX',
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
                    'pbx' => [
                        [
                            'name' => 'FreePBX',
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
                    'pbx' => [
                        [
                            'name' => 'FreePBX',
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
                    'pbx' => [
                        [
                            'name' => 'FreePBX',
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
                    'pbx' => [
                        [
                            'name' => 'FreePBX',
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
     * Generate the configuration file for the crmd daemon
     * responsible for interacting with CRM.
     */
    private function generateCrmdConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_CRM;
        Util::mwMkdir($logDir);

        $settings_crm = [
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path' => $logDir,
            'cleanup_period' => 10,  // Cache of links cleanup period.
            'long_poll' => [
                'port' => '8224',
                'event_time_to_live' => 10,
            ],
        ];

        if ($this->module_settings['web_service_mode'] === '1') {
            $cookiesDir = "{$this->dirs['spoolDir']}/cookies";
            Util::mwMkdir($cookiesDir);

            $settings_crm['wsdl'] = [
                'host' => $this->module_settings['server1chost'],
                'port' => $this->module_settings['server1cport'],
                'scheme'=> $this->module_settings['server1c_scheme']??'http',
                'login' => $this->module_settings['login'],
                'password' => $this->module_settings['secret'],
                'url' => "/{$this->module_settings['database']}/ws/miko_crm_api.1cws",
                'auth-url'=> '',
                'cookie_path' => $cookiesDir,
                'keep-alive' => 3000,
                'timeout' => 10,
            ];

            if (!empty($this->module_settings['publish_name_with_auth'])){
                $settings_crm['wsdl']['auth-url']="/{$this->module_settings['publish_name_with_auth']}";
            }
        }


        Util::fileWriteContent(
            "{$this->dirs['confDir']}/crm.json",
            json_encode($settings_crm, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Generate the configuration file for authd.
     */
    private function generateAuthdConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_AUTH;
        $cachePath = "{$this->dirs['moduleDir']}/db/auth";
        Util::mwMkdir($logDir);
        Util::mwMkdir($cachePath);

        $settings_auth = [
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'cache_path' => "{$cachePath}/cache.db",
        ];
        Util::fileWriteContent(
            "{$this->dirs['confDir']}/auth.json",
            json_encode($settings_auth, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }


    /**
     * Generate the configuration file for chatsd.
     */
    private function generateChatsConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_CHATS;
        Util::mwMkdir($logDir);

        $chatDataBasesPath = "{$this->dirs['moduleDir']}/db/chats";
        Util::mwMkdir($chatDataBasesPath);

        $settings_chats = [
            'log_level' => $this->module_settings['debug_mode'] ? 5 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'http' => [
                'port' => '8228',
            ],
            'database' => [
                'path' => $chatDataBasesPath,
            ],
        ];

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/chats.json",
            json_encode($settings_chats, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Generate the configuration file for telegram.
     */
    private function generateTelegramConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_TELEGRAM;
        Util::mwMkdir($logDir);

        $chatDataBasesPath = "{$this->dirs['moduleDir']}/db/tg";
        Util::mwMkdir($chatDataBasesPath);

        $settings_chats = [
            'log_level' => $this->module_settings['debug_mode'] ? -1 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'http' => [
                'port' => '8228',
            ],
            'database' => [
                'path' => $chatDataBasesPath,
            ],
        ];

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/tg.json",
            json_encode($settings_chats, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Generate the configuration file for proxyd.
     */
    private function generateProxyConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_PROXY;
        Util::mwMkdir($logDir);

        $certsPath = "{$this->dirs['moduleDir']}/etc/ssl";

        $settings_proxy = [
            'log_level' => $this->module_settings['debug_mode'] ? 5 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'port' => ':8002',
            'proto' => 'https',
            'pem' => "{$certsPath}/proxyserver.pem",
            'key' => "{$certsPath}/proxyserver.key",
        ];

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/proxy.json",
            json_encode($settings_proxy, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Generates the configuration file for the amid daemon.
     * Subscribes to AMI events, processes them, and sends them to the queue.
     */
    private function generateAmidConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_AMI;
        Util::mwMkdir($logDir);

        $WEBPort = escapeshellcmd($this->mikoPBXConfig->getGeneralSettings('WEBPort'));
        $AMIPort = escapeshellcmd($this->mikoPBXConfig->getGeneralSettings('AMIPort'));

        // Interception support
        $pbxVersion = PbxSettings::getValueByKey('PBXVersion');
        $interceptionSupport = false;
        if (version_compare($pbxVersion, '2021.3.23', '>')) {
            $interceptionSupport = true;
        }

        $settings_amid = [
            'pbx' => 'Askozia',
            'originate' => [
                'default_context' => '',
                'transfer_context' => '',
                'originate_context' => '',
                'multiple_registration_support' => true,
            ],
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'interception_support' => $interceptionSupport,
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path' => $logDir,
            'ami' => [
                'user' => CTIClientConf::MODULE_AMI_USER,
                'password' => $this->module_settings['ami_password'],
                'host' => '127.0.0.1',
                'port' => $AMIPort,
            ],
            'database' => [
                'path' => "{$this->dirs['moduleDir']}/db/cdr/history.db",
            ],
            'http' => [
                'port' => '8000',
                'limit' => 20,
            ],
            'records' => [
                'request' => "http://127.0.0.1:$WEBPort/pbxcore/api/cdr/playback?view=%s",
                'result' => '',
                'login' => '',
                'password' => '',
            ],
            'long_poll' => [
                'event_time_to_live' => 10,
            ],
            'files' => $this->dirs['filesDir'],
        ];

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/ami.json",
            json_encode($settings_amid, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Generate the configuration file for monitord.
     */
    private function generateMonitordConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_MONITOR;
        Util::mwMkdir($logDir);

        $arr_settings = [
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path' => $logDir,
            'work_dir' => $this->dirs['spoolDir'],
            'binary_dir' => $this->dirs['binDir'],
            'settings_dir' => $this->dirs['confDir'],
            'period' => 30,
            'daemons' => [
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_GNATS,
                    'args' => "-c {$this->dirs['confDir']}/nats.conf",
                ],
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_AMI,
                    'args' => "-c {$this->dirs['confDir']}/ami.json",
                    'subject' => 'daemon.asterisk.ping',
                ],
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_CRM,
                    'args' => "-c {$this->dirs['confDir']}/crm.json",
                    'subject' => 'daemon.1c.ping',
                ],
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_AUTH,
                    'args' => "-c {$this->dirs['confDir']}/auth.json",
                    'subject' => 'daemon.auth.ping',
                ],
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_SPEECH,
                    'args' => "-c {$this->dirs['confDir']}/speech.json",
                    'subject' => 'daemon.speech.ping',
                ],
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_PROXY,
                    'args' => "-c {$this->dirs['confDir']}/proxy.json",
                    'subject' => 'daemon.proxy.ping',
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
     * Generate the configuration file for speechd.
     */
    private function generateSpeechdConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_SPEECH;
        Util::mwMkdir($logDir);
        $workDir = "{$this->dirs['spoolDir']}/speech";
        Util::mwMkdir($workDir);
        $settings_auth = [
            'log_level' => $this->module_settings['debug_mode'] ? 6 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'http' => [
                'port' => '8227',
            ],
            'work_dir' => $workDir,
            'sox' => Util::which('sox'),
            'normalizer' => [
                'dictionaries' => "{$this->dirs['resourcesDir']}/pymorphy2_dicts_ru",
            ],
        ];
        Util::fileWriteContent(
            "{$this->dirs['confDir']}/speech.json",
            json_encode($settings_auth, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Check if the module is working properly.
     *
     * @return PBXApiResult An object containing the result of the API call.
     *
     */
    public function checkModuleWorkProperly(): PBXApiResult
    {
        $res = new PBXApiResult();
        $res->processor = __METHOD__;

        $moduleEnabled = PbxExtensionUtils::isEnabled($this->moduleUniqueID);
        if (!$moduleEnabled) {
            $res->data['statuses'] = 'Module disabled';

            return $res;
        }
        $statuses = [];
        $statuses[] = $this->checkMonitorStatus();
        $statuses[] = $this->checkNatsStatus();
        $statuses = array_merge($statuses, $this->checkWorkerStatuses());

        $res->success = true;
        foreach ($statuses as $workerStatus) {
            if (!$res->success) {
                break;
            }
            $res->success = array_key_exists('state', $workerStatus) && $workerStatus['state'] === 'ok';
        }

        $res->data['statuses'] = $statuses;
        return $res;
    }

    /**
     * Check the status of NATS server.
     *
     * @return array
     */
    private function checkNatsStatus(): array
    {
        $statusUrl = 'http://127.0.0.1:' . $this->getNatsHttpPort() . '/varz';
        $curl = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 1);
        curl_setopt($curl, CURLOPT_URL, $statusUrl);

        try {
            $response = curl_exec($curl);
            if (is_string($response)){
                $response = str_replace('\n', '', $response);
                $data = json_decode($response, true);
            } else {
                $data = null;
            }
        } catch (Throwable $e) {
            $data = null;
        }
        curl_close($curl);
        if ($data !== null) {
            $result = [
                'name' => 'nats',
                'state' => 'ok',
                'version' => $data['version'],
                'uptime' => $data['uptime'],
                'start' => $data['start'],
            ];
        } else {
            $result = [
                'name' => 'nats',
                'state' => 'unknown',
                'version' => 'unknown',
            ];
        }

        return $result;
    }

    /**
     * Check the statuses of worker processes started through the Monitor service.
     *
     * @return array
     */
    private function checkWorkerStatuses(): array
    {
        $statusUrl = 'http://127.0.0.1:8225/manager.api/status';
        $curl = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 10);
        curl_setopt($curl, CURLOPT_URL, $statusUrl);

        try {
            $response = curl_exec($curl);
            //$response = str_replace('\n', '', $response);
            $data = json_decode($response, true);
        } catch (Throwable $e) {
            $data = null;
        }
        $result = [];
        curl_close($curl);
        if ($data !== null
            && array_key_exists('result', $data)
            && is_array($data['result'])
        ) {
            $result = $data['result'];
        } else {
            $result[] = [
                'name' => 'manager.api',
                'state' => 'unknown',
            ];
        }
        return $result;
    }

    /**
     * Check the status of the monitor process.
     *
     * @return array
     */
    private function checkMonitorStatus(): array
    {
        $result = [
            'name' => self::SERVICE_MONITOR,
            'state' => 'unknown',
        ];
        $pid = Processes::getPidOfProcess(self::SERVICE_MONITOR);
        if (!empty($pid)) {
            $result['state'] = 'ok';
            $result['pid'] = $pid;
        }

        return $result;
    }

    /**
     * Get the caller ID for a given number from CRM system
     *
     * @param string $number The phone number.
     * @return string The caller ID.
     */
    public static function getCallerId(string $number): string
    {
        $getNumberUrl = 'http://127.0.0.1:8224/getcallerid?number=' . $number;
        $curl = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 5);
        curl_setopt($curl, CURLOPT_URL, $getNumberUrl);

        try {
            $response = curl_exec($curl);
            $response = str_replace('\n', '', $response);
            $parsedAnswer = json_decode($response, true);
        } catch (Throwable $e) {
            $parsedAnswer = null;
        }
        curl_close($curl);
        $result = '';
        if ($parsedAnswer !== null
            && $parsedAnswer['result'] === 'Success'
        ) {
            if (!empty($parsedAnswer['data']['caller_id'])) {
                $result = $parsedAnswer['data']['caller_id'];
            } elseif (!empty($parsedAnswer['data']['client'])) {
                $result = $parsedAnswer['data']['client'];
            }
        }

        return $result;
    }

}