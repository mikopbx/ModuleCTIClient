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
use Phalcon\Di\Injectable;
use Throwable;

/**
 * @property \Phalcon\Config\Config $config
 */
class AmigoDaemons extends Injectable
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
    public const SERVICE_MAX = 'maxd';
    public const SERVICE_REMOTE_TUNNEL = 'remote-tunnel';

    /**
     * Grace window for newly-started services: any row reported as ok with an
     * uptime under this many seconds is downgraded to "starting" so the LED
     * stays yellow until monitord has a stable read.
     */
    private const WARMUP_SECONDS = 60;

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
            self::SERVICE_MAX,
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

        if (
            $monitorPID !== ''
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
        $this->generateMaxConf();
        $this->generateProxyConf();
        $this->generateMonitordConf();
        $this->generateRemoteConfFiles();
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

        $moduleVersion = 'unknown';
        $currentModuleInfo = PbxExtensionModules::findFirstByUniqid($this->moduleUniqueID);
        if ($currentModuleInfo) {
            $moduleVersion = $currentModuleInfo->version;
        }

        $settings = [
            'port' => $this->getNatsPort(),
            'http_port' => $this->getNatsHttpPort(),
            'debug' => intval($this->module_settings['debug_mode']) === 1 ? 'true' : 'false',
            'trace' => 'false',
            'logtime' => 'true',
            'pid_file' => $pid_file,
            'max_connections' => '1000',
            'max_payload' => '1000000',
            'max_control_line' => '512',
            'sessions_path' => $sessionsDir,
            'log_file' => "{$logDir}/gnatsd.log",
            'log_size_limit' => 10485760, //10Mb
            'pbx' => "MikoPBX",
            'module_version' => '"' . $moduleVersion . '"',
        ];

        if (intval($this->module_settings['auto_settings_mode']) === 1) {
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
     * Local port that forwards (ssh -L) to the remote monitord's manager.api (8225 on the VPS).
     * The location-aware local monitord reverse-proxies remote areas here.
     *
     * @return string
     */
    public static function getRemoteMonitorPort(): string
    {
        return '8226';
    }

    /**
     * Map of module toggle field => daemon service name used by manager.api (POST /daemons "name").
     *
     * @return array<string,string>
     */
    private function getRemoteServiceMap(): array
    {
        return [
            'remote_whatsapp' => 'chats',
            'remote_telegram' => 'tg',
            'remote_max'      => 'max',
        ];
    }

    /**
     * List of messenger services (manager.api names) that must run on the remote VPS,
     * derived from the per-service toggles. Empty when remote offload is off/unconfigured.
     *
     * @return string[]
     */
    public function getRemoteServices(): array
    {
        // No remote host configured => everything stays local.
        if (empty($this->module_settings['remote_host'])) {
            return [];
        }

        $services = [];
        foreach ($this->getRemoteServiceMap() as $toggle => $service) {
            if (intval($this->module_settings[$toggle] ?? 0) === 1) {
                $services[] = $service;
            }
        }

        return $services;
    }

    /**
     * Base directory of the module deployment on the remote VPS.
     *
     * @return string
     */
    public function getRemoteBaseDir(): string
    {
        $dir = trim($this->module_settings['remote_bin_dir'] ?? '');

        return $dir !== '' ? rtrim($dir, '/') : '/opt/mikopbx-cti';
    }

    /**
     * Map of manager.api service names to binary file names in the local bin/ directory.
     * Used by the remote provisioning step to push the right binaries to the VPS.
     *
     * @return array<string,string>
     */
    private function getServiceBinaryMap(): array
    {
        return [
            'chats' => self::SERVICE_CHATS,
            'tg'    => self::SERVICE_TELEGRAM,
            'max'   => self::SERVICE_MAX,
        ];
    }

    /**
     * Returns the SSH connection parameters for the remote VPS, or null when
     * offload is not fully configured (host or key missing).
     * The private key is written to a chmod-600 file under spool/.
     *
     * @return array{host:string,port:string,login:string,keyFile:string,base:string,knownHosts:string}|null
     */
    public function getRemoteSshParams(): ?array
    {
        $host  = trim($this->module_settings['remote_host'] ?? '');
        $login = trim($this->module_settings['remote_ssh_login'] ?? '');
        $key   = $this->module_settings['remote_ssh_key'] ?? '';
        $port  = trim($this->module_settings['remote_ssh_port'] ?? '');

        if ($host === '' || $login === '' || $key === '') {
            return null;
        }
        if ($port === '') {
            $port = '22';
        }

        $keyFile = $this->dirs['spoolDir'] . '/remote_id';
        // Normalize line endings and ensure trailing newline (OpenSSH requirement).
        $keyContent = str_replace("\r\n", "\n", (string)$key);
        if (substr($keyContent, -1) !== "\n") {
            $keyContent .= "\n";
        }
        if (
            !file_exists($keyFile)
            || (string)@file_get_contents($keyFile) !== $keyContent
        ) {
            file_put_contents($keyFile, $keyContent);
        }
        @chmod($keyFile, 0600);

        $knownHosts = $this->dirs['spoolDir'] . '/remote_known_hosts';
        if (!file_exists($knownHosts)) {
            // TOFU: accept-new on first contact, then strict on subsequent connections.
            touch($knownHosts);
            @chmod($knownHosts, 0600);
        }

        return [
            'host'       => $host,
            'port'       => $port,
            'login'      => $login,
            'keyFile'    => $keyFile,
            'base'       => $this->getRemoteBaseDir(),
            'knownHosts' => $knownHosts,
        ];
    }

    /**
     * Builds the common `ssh` argv prefix that pins identity, known_hosts,
     * timeouts and the destination — used by every helper command that runs
     * over the management channel (provisioning, monitord launch, etc.).
     *
     * Returned as a string of already-escaped tokens, ready to be appended
     * to a shell command (e.g. "{$prefix} 'mkdir -p ...'").
     *
     * @param array{host:string,port:string,login:string,keyFile:string,knownHosts:string} $ssh
     * @return string
     */
    public static function buildSshArgs(array $ssh): string
    {
        // -o BatchMode=yes prevents an interactive prompt from hanging the worker.
        // -o StrictHostKeyChecking=accept-new gives us TOFU: pin on first contact,
        // strict on every subsequent connection. The known_hosts file is per-module
        // (spool/remote_known_hosts) — a wholesale VPS swap requires clearing it.
        return Util::which('ssh')
            . ' -o BatchMode=yes'
            . ' -o StrictHostKeyChecking=accept-new'
            . ' -o UserKnownHostsFile=' . escapeshellarg($ssh['knownHosts'])
            . ' -o ConnectTimeout=10'
            . ' -o ServerAliveInterval=15'
            . ' -o ServerAliveCountMax=3'
            . ' -i ' . escapeshellarg($ssh['keyFile'])
            . ' -p ' . escapeshellarg($ssh['port'])
            . ' ' . escapeshellarg($ssh['login'] . '@' . $ssh['host']);
    }

    /**
     * Provisions the remote VPS so it can run the messenger daemons offloaded
     * from MikoPBX. Idempotent — safe to call on every worker loop iteration.
     *
     * Steps (each one keeps going if the VPS is briefly unreachable; the worker
     * surfaces the partial failure through the status file and retries later):
     *   1. Sanity check architecture (must be x86_64; abort otherwise).
     *   2. Create the directory layout under {base}/{bin,conf,db/...,logs,spool}.
     *   3. Push the binaries needed by the toggled services + monitord (size-based
     *      diff: skip unchanged files). The patched monitord lives in the module's
     *      bin/ on PBX and is pushed as-is.
     *   4. Push the staged conf/ files from {spool}/remote/conf/.
     *   5. Prune stale conf/*.json on the VPS (de-toggled service).
     *
     * @return array{ok:bool,error:string} ok=true means VPS is fully provisioned.
     */
    public function provisionRemote(): array
    {
        $services = $this->getRemoteServices();
        if (empty($services)) {
            return ['ok' => false, 'error' => 'remote offload disabled'];
        }

        $ssh = $this->getRemoteSshParams();
        if ($ssh === null) {
            return ['ok' => false, 'error' => 'remote ssh params not configured'];
        }

        $sshArgs = self::buildSshArgs($ssh);
        $base = $ssh['base'];

        // 1. Architecture check. The current build only ships x86_64 binaries.
        $arch = '';
        $rc = 0;
        $cmd = $sshArgs . ' ' . escapeshellarg('uname -m');
        exec($cmd . ' 2>/dev/null', $out, $rc);
        if ($rc !== 0) {
            return ['ok' => false, 'error' => 'ssh failed (uname): rc=' . $rc];
        }
        $arch = trim(implode('', $out));
        if ($arch !== 'x86_64') {
            return ['ok' => false, 'error' => 'unsupported remote arch: ' . $arch];
        }

        // 2. Directory layout. Per-daemon log subdirectories match the staged
        //    configs' log_path (monitord/chatsd/tgd/maxd) — without them the
        //    daemons FATAL at startup the same way the local generators
        //    work around with Util::mwMkdir before launch.
        $mkdirCmd = 'mkdir -p '
            . escapeshellarg("{$base}/bin") . ' '
            . escapeshellarg("{$base}/conf") . ' '
            . escapeshellarg("{$base}/db/chats") . ' '
            . escapeshellarg("{$base}/db/tg") . ' '
            . escapeshellarg("{$base}/db/max") . ' '
            . escapeshellarg("{$base}/logs") . ' '
            . escapeshellarg("{$base}/logs/" . self::SERVICE_MONITOR) . ' '
            . escapeshellarg("{$base}/logs/" . self::SERVICE_CHATS) . ' '
            . escapeshellarg("{$base}/logs/" . self::SERVICE_TELEGRAM) . ' '
            . escapeshellarg("{$base}/logs/" . self::SERVICE_MAX) . ' '
            . escapeshellarg("{$base}/spool");
        exec($sshArgs . ' ' . escapeshellarg($mkdirCmd) . ' 2>/dev/null', $tmpOut, $rc);
        if ($rc !== 0) {
            return ['ok' => false, 'error' => 'ssh mkdir failed: rc=' . $rc];
        }

        // 3. Binaries — monitord plus the per-service daemons we need on the VPS.
        $binMap = $this->getServiceBinaryMap();
        $binsToPush = [self::SERVICE_MONITOR];
        foreach ($services as $svc) {
            if (isset($binMap[$svc])) {
                $binsToPush[] = $binMap[$svc];
            }
        }

        // Get remote file sizes so we only push what changed. Missing files => size 0.
        $statCmd = '';
        foreach ($binsToPush as $bin) {
            $remotePath = "{$base}/bin/{$bin}";
            $statCmd .= 'stat -c %s ' . escapeshellarg($remotePath) . ' 2>/dev/null || echo 0; ';
        }
        exec($sshArgs . ' ' . escapeshellarg($statCmd) . ' 2>/dev/null', $statOut, $rc);
        $remoteSizes = [];
        foreach ($binsToPush as $i => $bin) {
            $remoteSizes[$bin] = isset($statOut[$i]) ? (int)trim($statOut[$i]) : 0;
        }

        foreach ($binsToPush as $bin) {
            $localPath = $this->dirs['binDir'] . '/' . $bin;
            if (!file_exists($localPath)) {
                return ['ok' => false, 'error' => 'local binary missing: ' . $bin];
            }
            $localSize = (int)filesize($localPath);
            if ($localSize > 0 && $remoteSizes[$bin] === $localSize) {
                continue; // same size — assume unchanged
            }
            if (!$this->scpPush($ssh, $localPath, "{$base}/bin/{$bin}")) {
                return ['ok' => false, 'error' => 'scp push failed: ' . $bin];
            }
        }

        // chmod +x on every binary, idempotent.
        $chmodCmd = 'chmod +x ' . escapeshellarg("{$base}/bin") . '/*';
        exec($sshArgs . ' ' . escapeshellarg($chmodCmd) . ' 2>/dev/null', $tmpOut, $rc);

        // 4. Configs — push the staged remote/conf/ directory.
        $stageDir = $this->dirs['spoolDir'] . '/remote/conf';
        $stagedFiles = [];
        if (is_dir($stageDir)) {
            foreach (glob($stageDir . '/*.json') ?: [] as $stagedPath) {
                $name = basename($stagedPath);
                $stagedFiles[] = $name;
                if (!$this->scpPush($ssh, $stagedPath, "{$base}/conf/{$name}")) {
                    return ['ok' => false, 'error' => 'scp push failed: conf/' . $name];
                }
            }
        }

        // 5. Prune stale conf files on the VPS that are no longer staged
        //    (de-toggling a service must not leave its old config behind).
        $keep = [];
        foreach ($stagedFiles as $name) {
            $keep[] = escapeshellarg($name);
        }
        $keepList = implode(' ', $keep);
        $pruneCmd = 'cd ' . escapeshellarg("{$base}/conf") . ' && '
            . 'for f in *.json; do '
            . '  [ -e "$f" ] || continue; '
            . '  case " ' . ($keepList !== '' ? $keepList . ' ' : '') . '" in '
            . '    *" $f "*) ;; '
            . '    *) rm -f -- "$f" ;; '
            . '  esac; '
            . 'done';
        exec($sshArgs . ' ' . escapeshellarg($pruneCmd) . ' 2>/dev/null', $tmpOut, $rc);

        return ['ok' => true, 'error' => ''];
    }

    /**
     * Push a single local file to the remote VPS via scp. Returns true on success.
     *
     * @param array{host:string,port:string,login:string,keyFile:string,knownHosts:string} $ssh
     * @param string $localPath
     * @param string $remotePath
     * @return bool
     */
    private function scpPush(array $ssh, string $localPath, string $remotePath): bool
    {
        $cmd = Util::which('scp')
            . ' -o BatchMode=yes'
            . ' -o StrictHostKeyChecking=accept-new'
            . ' -o UserKnownHostsFile=' . escapeshellarg($ssh['knownHosts'])
            . ' -o ConnectTimeout=10'
            . ' -i ' . escapeshellarg($ssh['keyFile'])
            . ' -P ' . escapeshellarg($ssh['port'])
            . ' ' . escapeshellarg($localPath)
            . ' ' . escapeshellarg($ssh['login'] . '@' . $ssh['host'] . ':' . $remotePath);
        $rc = 0;
        exec($cmd . ' 2>/dev/null', $tmpOut, $rc);
        return $rc === 0;
    }

    /**
     * Launch the remote monitord (idempotent — pgrep gate so we don't spawn duplicates).
     * monitord on the VPS binds loopback only; it dials NATS + license on
     * 127.0.0.1:4222/8222 which are mapped back to PBX through the ssh -R tunnels.
     * Therefore the ssh tunnel MUST be up before this is called.
     *
     * @return array{ok:bool,error:string}
     */
    public function launchRemoteMonitord(): array
    {
        $ssh = $this->getRemoteSshParams();
        if ($ssh === null) {
            return ['ok' => false, 'error' => 'remote ssh params not configured'];
        }
        $sshArgs = self::buildSshArgs($ssh);
        $base = $ssh['base'];

        // pgrep -x matches comm (binary basename), avoiding the self-match trap
        // that `pgrep -f` falls into when the wrapper command line contains
        // the monitord string.  Absolute path in `-c` is required: a relative
        // path makes monitord fall back to defaults and explode with
        // "fatal Missing work_dir".
        $remoteCmd = 'pgrep -x ' . escapeshellarg(self::SERVICE_MONITOR) . ' >/dev/null 2>&1 || '
            . '(cd ' . escapeshellarg($base) . ' && '
            . 'nohup ' . escapeshellarg("{$base}/bin/" . self::SERVICE_MONITOR)
            . ' -c ' . escapeshellarg("{$base}/conf/monitord.json")
            . ' >> ' . escapeshellarg("{$base}/logs/monitord.out") . ' 2>&1 &)';

        $rc = 0;
        exec($sshArgs . ' ' . escapeshellarg($remoteCmd) . ' 2>/dev/null', $tmpOut, $rc);
        if ($rc !== 0) {
            return ['ok' => false, 'error' => 'ssh monitord launch failed: rc=' . $rc];
        }
        return ['ok' => true, 'error' => ''];
    }

    /**
     * Stop the remote monitord (and its supervised messenger daemons) over ssh.
     * Best-effort — called when offload is being switched off or all services
     * are de-toggled. Always uses `pkill -x <comm>` (matches binary basename
     * only) to dodge the self-match trap of `-f`.
     *
     * @return void
     */
    public function stopRemoteServices(): void
    {
        $ssh = $this->getRemoteSshParams();
        if ($ssh === null) {
            return;
        }
        $sshArgs = self::buildSshArgs($ssh);
        $remoteCmd = 'pkill -x ' . escapeshellarg(self::SERVICE_MONITOR) . '; '
            . 'pkill -x ' . escapeshellarg(self::SERVICE_CHATS) . '; '
            . 'pkill -x ' . escapeshellarg(self::SERVICE_TELEGRAM) . '; '
            . 'pkill -x ' . escapeshellarg(self::SERVICE_MAX) . '; '
            . 'true';
        $rc = 0;
        exec($sshArgs . ' ' . escapeshellarg($remoteCmd) . ' 2>/dev/null', $tmpOut, $rc);
    }

    /**
     * Path to the persistent JSON status file written by WorkerRemoteTunnel.
     * Lives in spool/ so the web UI can read it.
     *
     * @return string
     */
    public function getRemoteTunnelStatusFile(): string
    {
        return $this->dirs['spoolDir'] . '/remote_tunnel.status';
    }


    /**
     * Get the proxy server connection string.
     *
     * @return string
     */
    public function getChatsProxyAddress(): string
    {
        return $this->getMessengerProxyAddress('whatsapp');
    }

    /**
     * Per-messenger HTTP proxy address. Each messenger now has its own field
     * (`whatsapp_proxy_address`, `telegram_proxy_address`, `max_proxy_address`)
     * because the values land in separate daemon configs and may need to
     * differ. Empty per-messenger field falls back to the legacy single
     * `chats_proxy_address` so existing installs keep working unchanged.
     *
     * @param string $messenger One of 'whatsapp', 'telegram', 'max'.
     */
    public function getMessengerProxyAddress(string $messenger): string
    {
        $fieldByMessenger = [
            'whatsapp' => 'whatsapp_proxy_address',
            'telegram' => 'telegram_proxy_address',
            'max'      => 'max_proxy_address',
        ];
        $field = $fieldByMessenger[$messenger] ?? null;
        if ($field !== null) {
            $own = trim((string)($this->module_settings[$field] ?? ''));
            if ($own !== '') {
                return escapeshellcmd($own);
            }
        }
        $legacy = trim((string)($this->module_settings['chats_proxy_address'] ?? ''));
        if ($legacy === '') {
            return '';
        }
        return escapeshellcmd($legacy);
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
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 6 : 2,
            'log_path' => $logDir,
            'cleanup_period' => 10,  // Cache of links cleanup period.
            'long_poll' => [
                'port' => '8224',
                'event_time_to_live' => 10,
            ],
        ];

        if (intval($this->module_settings['web_service_mode']) === 1) {
            $cookiesDir = "{$this->dirs['spoolDir']}/cookies";
            Util::mwMkdir($cookiesDir);

            $settings_crm['wsdl'] = [
                'host' => $this->module_settings['server1chost'],
                'port' => strval($this->module_settings['server1cport']),
                'scheme' => $this->module_settings['server1c_scheme'] ?? 'http',
                'login' => $this->module_settings['login'],
                'password' => $this->module_settings['secret'],
                'url' => "/{$this->module_settings['database']}/ws/miko_crm_api.1cws",
                'auth-url' => '',
                'cookie_path' => $cookiesDir,
                'keep-alive' => 3000,
                'timeout' => 10,
            ];

            if (!empty($this->module_settings['publish_name_with_auth'])) {
                $settings_crm['wsdl']['auth-url'] = "/{$this->module_settings['publish_name_with_auth']}";
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
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 6 : 2,
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
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 5 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'database' => [
                'path' => $chatDataBasesPath,
            ],
            'proxy_address' => $this->getMessengerProxyAddress('whatsapp'),
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

        $settings_tg = [
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? -1 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'database' => [
                'path' => $chatDataBasesPath,
            ],
            'proxy_address' => $this->getMessengerProxyAddress('telegram'),
        ];

        $mtProxyAddress = trim($this->module_settings['mt_proxy_address'] ?? '');
        $mtProxySecret = trim($this->module_settings['mt_proxy_secret'] ?? '');
        if ($mtProxyAddress !== '' && $mtProxySecret !== '') {
            $settings_tg['mt_proxy'] = [
                'address' => $mtProxyAddress,
                'secret' => $mtProxySecret,
            ];
        }

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/tg.json",
            json_encode($settings_tg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Generate the configuration file for maxd.
     */
    private function generateMaxConf(): void
    {
        $logDir = "{$this->dirs['logDir']}/" . self::SERVICE_MAX;
        Util::mwMkdir($logDir);

        $maxDataBasesPath = "{$this->dirs['moduleDir']}/db/max";
        Util::mwMkdir($maxDataBasesPath);

        $settings_max = [
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 5 : 2,
            'log_path' => $logDir,
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'database' => [
                'path' => $maxDataBasesPath,
            ],
            'proxy_address' => $this->getMessengerProxyAddress('max'),
        ];

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/max.json",
            json_encode($settings_max, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
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
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 5 : 2,
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
            'interception_support' => true,
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 6 : 2,
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
                'path' => "/storage/usbdisk1/mikopbx/astspool/monitor/",
                'result' => '',
                'login' => '',
                'password' => '',
            ],
            'long_poll' => [
                'event_time_to_live' => 10,
            ],
            'files' => $this->dirs['filesDir'],
        ];

        if (MikoPBXVersion::isPhalcon512Version()) {
            $settings_amid['records']['request'] = "http://127.0.0.1:$WEBPort/pbxcore/api/v3/cdr:playback?view=%s";
        }

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
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 6 : 2,
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
//                 https://jira.miko.ru/browse/PT-870
//                [
//                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_SPEECH,
//                    'args' => "-c {$this->dirs['confDir']}/speech.json",
//                    'subject' => 'daemon.speech.ping',
//                ],
                [
                    'path' => "{$this->dirs['binDir']}/" . self::SERVICE_PROXY,
                    'args' => "-c {$this->dirs['confDir']}/proxy.json",
                    'subject' => 'daemon.proxy.ping',
                ],
            ],
        ];

        // Remote messenger offload: the location-aware monitord forwards channels of the
        // toggled services to the remote monitord (manager.api) reachable via the ssh -L tunnel.
        $remoteServices = $this->getRemoteServices();
        if (!empty($remoteServices)) {
            $arr_settings['remote_monitor'] = '127.0.0.1:' . self::getRemoteMonitorPort();
            $arr_settings['remote_services'] = $remoteServices;
        }

        Util::fileWriteContent(
            "{$this->dirs['confDir']}/monitord.json",
            json_encode($arr_settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
        file_put_contents("{$this->dirs['spoolDir']}/auth.hash", 'd41d8cd98f00b204e9800998ecf8427e');
    }

    /**
     * Generate configuration files for the remote VPS (monitord + messenger daemons) into a
     * staging directory. They are rsync'd to the VPS during provisioning (WorkerRemoteTunnel).
     *
     * On the VPS: mq.host=127.0.0.1:4222 and the license endpoint 127.0.0.1:8222 both resolve
     * to MikoPBX through the ssh reverse tunnel (-R 4222 / -R 8222). monitord starts with an
     * empty daemons list; channels are added dynamically through manager.api.
     */
    private function generateRemoteConfFiles(): void
    {
        // Stage under conf/ so a straight `rsync remote/conf/ -> {base}/conf/` matches the
        // remote monitord's settings_dir and the `-c {base}/conf/<name>.json` it launches daemons with.
        $stageDir = "{$this->dirs['spoolDir']}/remote/conf";

        // Prune previously staged files first, so a de-toggled service (or fully disabled offload)
        // never leaves a stale config behind for provisioning to push.
        foreach (['monitord', 'chats', 'tg', 'max'] as $name) {
            $stale = "{$stageDir}/{$name}.json";
            if (file_exists($stale)) {
                unlink($stale);
            }
        }

        $remoteServices = $this->getRemoteServices();
        if (empty($remoteServices)) {
            return;
        }

        Util::mwMkdir($stageDir);

        $base = $this->getRemoteBaseDir();
        $debug = intval($this->module_settings['debug_mode'] ?? 0) === 1;
        // Per-messenger proxy: each service uses its own configured proxy
        // (with fallback to the legacy single field). 'chats' on the remote
        // side maps to the whatsapp_proxy_address field.
        $proxyByService = [
            'chats' => $this->getMessengerProxyAddress('whatsapp'),
            'tg'    => $this->getMessengerProxyAddress('telegram'),
            'max'   => $this->getMessengerProxyAddress('max'),
        ];

        // Remote monitord: binds loopback (reachable only through the ssh tunnel) and supervises
        // only the messenger daemons it spawns on the VPS (added dynamically via manager.api).
        $monitord = [
            'mq' => [
                'host' => '127.0.0.1',
                'port' => $this->getNatsPort(),
            ],
            'log_level' => $debug ? 6 : 2,
            'log_path' => "{$base}/logs/monitord",
            'work_dir' => "{$base}/spool",
            'binary_dir' => "{$base}/bin",
            'settings_dir' => "{$base}/conf",
            'bind_address' => '127.0.0.1',
            'period' => 30,
            'daemons' => [],
        ];
        Util::fileWriteContent(
            "{$stageDir}/monitord.json",
            json_encode($monitord, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );

        // Per-service messenger configs with VPS paths. Mirror the local generators
        // (log levels, proxy_address, Telegram mt_proxy) so remote ≠ local connectivity behaviour.
        $dbDirs = [
            'chats' => 'db/chats',
            'tg' => 'db/tg',
            'max' => 'db/max',
        ];
        foreach ($remoteServices as $service) {
            $logLevel = $debug ? 5 : 2;
            if ($service === 'tg') {
                $logLevel = $debug ? -1 : 2;
            }

            $settings = [
                'log_level' => $logLevel,
                'log_path' => "{$base}/logs/{$service}d",
                'mq' => [
                    'host' => '127.0.0.1',
                    'port' => $this->getNatsPort(),
                ],
                'database' => [
                    'path' => "{$base}/{$dbDirs[$service]}",
                ],
                'proxy_address' => $proxyByService[$service] ?? '',
            ];

            if ($service === 'tg') {
                $mtProxyAddress = trim($this->module_settings['mt_proxy_address'] ?? '');
                $mtProxySecret = trim($this->module_settings['mt_proxy_secret'] ?? '');
                if ($mtProxyAddress !== '' && $mtProxySecret !== '') {
                    $settings['mt_proxy'] = [
                        'address' => $mtProxyAddress,
                        'secret' => $mtProxySecret,
                    ];
                }
            }

            Util::fileWriteContent(
                "{$stageDir}/{$service}.json",
                json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            );
        }
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
            'log_level' => intval($this->module_settings['debug_mode']) === 1 ? 6 : 2,
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
        // System-level remote messenger tunnel goes BEFORE messenger channels
        // so it visually sits with the infrastructure rows, not under tg.
        $tunnel = $this->checkRemoteTunnelStatus();
        if ($tunnel !== null) {
            $statuses[] = $tunnel;
        }
        $statuses = array_merge($statuses, $this->checkWorkerStatuses());

        // Warm-up: anything that just started reports state=ok with a sub-60s
        // uptime — surface that as "starting" so the LED stays yellow while
        // monitord hasn't finished its first probe cycle yet.
        foreach ($statuses as $idx => $row) {
            if (!is_array($row)) {
                continue;
            }
            $state = (string)($row['state'] ?? '');
            if ($state !== 'ok' || !isset($row['uptime']) || !is_string($row['uptime'])) {
                continue;
            }
            $sec = $this->parseUptimeSeconds($row['uptime']);
            if ($sec !== null && $sec < self::WARMUP_SECONDS) {
                $statuses[$idx]['state'] = 'starting';
            }
        }

        // Fill in expected-but-missing system services as "starting" so the
        // operator sees a yellow placeholder row instead of nothing while
        // monitord is still bringing them up after enable.
        $present = [];
        foreach ($statuses as $row) {
            if (is_array($row) && isset($row['name'])) {
                $present[(string)$row['name']] = true;
            }
        }
        foreach ($this->getExpectedSystemServices() as $name) {
            if (!isset($present[$name])) {
                $statuses[] = ['name' => $name, 'state' => 'starting'];
            }
        }

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
            if (is_string($response)) {
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
        if (
            $data !== null
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
     * Synthetic status row for the remote messenger SSH tunnel, read from the
     * status file written by WorkerRemoteTunnel.
     *
     * Returns null when remote offload is not configured at all — in that case
     * we don't surface the row to keep the UI clean.
     *
     * @return array{name:string,state:string,uptime?:string,last_error?:string}|null
     */
    private function checkRemoteTunnelStatus(): ?array
    {
        if (empty($this->getRemoteServices())) {
            return null;
        }

        $row = [
            'name'  => self::SERVICE_REMOTE_TUNNEL,
            'state' => 'pending',
        ];

        $path = $this->getRemoteTunnelStatusFile();
        if (!is_file($path)) {
            return $row;
        }

        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            return $row;
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return $row;
        }

        $connected = !empty($data['connected']);
        $lastError = (string)($data['last_error'] ?? '');

        if ($connected) {
            $row['state'] = 'ok';
            $okTs = intval($data['last_ok_ts'] ?? 0);
            if ($okTs > 0) {
                $elapsed = time() - $okTs;
                if ($elapsed >= 0) {
                    $row['uptime'] = $this->formatUptime($elapsed);
                }
            }
        } elseif (strpos($lastError, 'offload disabled') !== false) {
            // Operator-disabled: report as pending so the row does not look red.
            $row['state'] = 'pending';
        } else {
            $row['state'] = 'error';
        }

        if ($lastError !== '') {
            $row['last_error'] = $lastError;
        }

        return $row;
    }

    /**
     * Names (as reported by monitord) of the system-level services that are
     * always expected to be present once the module finishes coming up.
     * Messenger channels (chats/tg/max) are NOT here — those are created
     * dynamically per area by 1C and have no fixed expected count.
     *
     * @return string[]
     */
    private function getExpectedSystemServices(): array
    {
        $expected = [
            self::SERVICE_MONITOR,        // 'monitord'
            'nats',
            'ami-listener',
            'crm-1c',
            'auth',
            'proxy',
        ];
        if (!empty($this->getRemoteServices())) {
            $expected[] = self::SERVICE_REMOTE_TUNNEL;
        }
        return $expected;
    }

    /**
     * Parse compact "1h2m3s" / "12m5s" / "30s" uptime strings (as emitted by
     * monitord and our own formatUptime) into seconds. Returns null if the
     * string does not match.
     */
    private function parseUptimeSeconds(string $uptime): ?int
    {
        if (!preg_match('/^(?:(\d+)h)?(?:(\d+)m)?(\d+)s$/', $uptime, $m)) {
            return null;
        }
        $h = isset($m[1]) && $m[1] !== '' ? (int)$m[1] : 0;
        $mn = isset($m[2]) && $m[2] !== '' ? (int)$m[2] : 0;
        $s = (int)$m[3];
        return $h * 3600 + $mn * 60 + $s;
    }

    /**
     * Test an SSH connection to a remote VPS using ad-hoc parameters
     * (NOT yet saved to the DB). Used by the "Test connection" button on
     * the Remote messengers tab — operator types host/port/login/key/base,
     * this method writes the key to a private temp file with chmod 600 and
     * runs a single ssh shell that reports:
     *   * arch       — `uname -m` so we know the remote target is x86_64
     *   * rwOk       — whether the login can mkdir+touch+rm inside the base
     *                  directory (caught early instead of failing later
     *                  during scpPush)
     * Either failing flags ok=false; the human-readable diagnostic is
     * stuffed into `error`.
     *
     * @param array{host:string,port:string,login:string,key:string,base?:string} $params
     * @return array{ok:bool,arch:string,rwOk:bool,base:string,error:string}
     */
    public function testRemoteSshConnection(array $params): array
    {
        $host = trim($params['host'] ?? '');
        $port = trim($params['port'] ?? '');
        $login = trim($params['login'] ?? '');
        $key = (string)($params['key'] ?? '');
        $base = trim($params['base'] ?? '');

        if ($host === '' || $login === '' || $key === '') {
            return [
                'ok' => false, 'arch' => '', 'rwOk' => false, 'base' => $base,
                'error' => 'host, login and SSH key are required',
            ];
        }
        if ($port === '') {
            $port = '22';
        }
        if ($base === '') {
            $base = '/opt/mikopbx-cti';
        }

        $keyContent = str_replace("\r\n", "\n", $key);
        if (substr($keyContent, -1) !== "\n") {
            $keyContent .= "\n";
        }

        $tmpKey = tempnam(sys_get_temp_dir(), 'cti_sshtest_');
        if ($tmpKey === false) {
            return [
                'ok' => false, 'arch' => '', 'rwOk' => false, 'base' => $base,
                'error' => 'cannot create temp key file',
            ];
        }
        if (@file_put_contents($tmpKey, $keyContent) === false) {
            @unlink($tmpKey);
            return [
                'ok' => false, 'arch' => '', 'rwOk' => false, 'base' => $base,
                'error' => 'cannot write temp key file',
            ];
        }
        @chmod($tmpKey, 0600);

        // Single round-trip: arch on stdout line 1, rw verdict on line 2.
        // Probe-rm is best-effort — base.test file is unique per call.
        $probeFile = '.cti-rw-probe-' . bin2hex(random_bytes(4));
        $remoteShell = 'set -e; '
            . 'arch=$(uname -m); '
            . 'echo "ARCH:$arch"; '
            . 'if mkdir -p ' . escapeshellarg($base) . ' 2>/dev/null '
                . '&& : > ' . escapeshellarg($base . '/' . $probeFile) . ' 2>/dev/null '
                . '&& rm -f ' . escapeshellarg($base . '/' . $probeFile) . ' 2>/dev/null; then '
                . 'echo "RW:OK"; '
            . 'else echo "RW:FAIL"; fi';

        $cmd = '/usr/bin/ssh'
            . ' -i ' . escapeshellarg($tmpKey)
            . ' -p ' . escapeshellarg($port)
            . ' -o BatchMode=yes'
            . ' -o StrictHostKeyChecking=accept-new'
            . ' -o UserKnownHostsFile=/dev/null'
            . ' -o ConnectTimeout=5'
            . ' -o LogLevel=ERROR'
            . ' ' . escapeshellarg($login . '@' . $host)
            . ' ' . escapeshellarg($remoteShell)
            . ' 2>&1';

        $out = [];
        $rc = 0;
        exec($cmd, $out, $rc);
        @unlink($tmpKey);

        $arch = '';
        $rwOk = false;
        $diag = [];
        foreach ($out as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            if (strpos($line, 'ARCH:') === 0) {
                $arch = substr($line, 5);
            } elseif ($line === 'RW:OK') {
                $rwOk = true;
            } elseif ($line === 'RW:FAIL') {
                $rwOk = false;
            } else {
                $diag[] = $line;
            }
        }

        if ($rc === 0 && $arch !== '' && $rwOk) {
            return ['ok' => true, 'arch' => $arch, 'rwOk' => true, 'base' => $base, 'error' => ''];
        }
        $err = $diag !== [] ? implode('; ', $diag) : ('ssh exit ' . $rc);
        if ($arch !== '' && !$rwOk) {
            $err = 'no write access to ' . $base . ($diag !== [] ? ' (' . implode('; ', $diag) . ')' : '');
        }
        return [
            'ok'    => false,
            'arch'  => $arch,
            'rwOk'  => $rwOk,
            'base'  => $base,
            'error' => $err,
        ];
    }

    /**
     * Format seconds as a compact "1h2m3s" / "12m5s" / "30s" string for
     * status rows.
     */
    private function formatUptime(int $seconds): string
    {
        if ($seconds < 1) {
            return '0s';
        }
        $h = intdiv($seconds, 3600);
        $m = intdiv($seconds % 3600, 60);
        $s = $seconds % 60;
        $out = '';
        if ($h > 0) {
            $out .= $h . 'h';
        }
        if ($h > 0 || $m > 0) {
            $out .= $m . 'm';
        }
        return $out . $s . 's';
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
        if (
            $parsedAnswer !== null
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
