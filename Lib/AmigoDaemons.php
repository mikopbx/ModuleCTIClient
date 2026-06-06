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

    /**
     * Manager.api service names of the messenger daemons that can be offloaded
     * to the VPS. The toggle map (getRemoteServiceMap) keys to these names.
     */
    private const MIGRATABLE_SERVICES = ['chats', 'tg', 'max'];

    /**
     * How many consecutive STEP 1/STEP 2 failures (VPS/tunnel down) before a
     * migration is PARKED — the service is restored to its source side and not
     * retried until the operator re-flips the toggle (§4 FAIL-PARK).
     */
    private const MIGRATION_MAX_FAILS = 3;

    /**
     * How many consecutive STEP 3b confirmation ticks (Go-commit + receiver
     * health) may fail before the migration ROLLS BACK to source. The worker
     * advances one tick per POLL_INTERVAL (~5s) and receiverHealthy is now
     * single-shot (§3.6 bounded work), so this is the resume-phase timeout
     * budget in ticks — larger than MIGRATION_MAX_FAILS because a cross-host
     * receiver (and a qrcode/2FA re-auth) legitimately takes longer to surface.
     */
    private const MIGRATION_MAX_CONFIRM = 12;

    public array $dirs;
    private array $module_settings = [];
    private string $moduleUniqueID = 'ModuleCTIClient';
    private MikoPBXConfig $mikoPBXConfig;

    /**
     * Constructor for the class.
     */
    public function __construct()
    {
        // Always retrieve the module settings — onAfterModuleDisable runs
        // AFTER the disabled flag is flipped in m_PbxExtensionModules, but the
        // module's own settings row (with remote_host / remote_ssh_key) is
        // still there and we need it to tell the VPS stack to shut down.
        $module_settings = ModuleCTIClient::findFirst();
        if ($module_settings !== null) {
            $this->module_settings = $module_settings->toArray();
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
     * Absolute path to the per-area migration cursor file (§3.1, R6).
     *
     * @return string
     */
    private function getRemoteStatePath(): string
    {
        return $this->dirs['spoolDir'] . '/remote_state.json';
    }

    /**
     * Absolute path to Go's per-area current-location truth (CC2: PHP READS,
     * never WRITES it). monitord renders this under its work_dir, which the
     * local generateMonitordConf() sets to spoolDir.
     *
     * @return string
     */
    private function getCustomConfigPath(): string
    {
        return $this->dirs['spoolDir'] . '/custom_config.json';
    }

    /**
     * READ-ONLY inventory of where each area of a service currently runs (R6,
     * CC2). Parses Go's custom_config.json and returns area => Location, where
     * Location is "local" or "remote". Reading does NOT violate CC2 — only
     * writing does.
     *
     * The service of a daemon stub is read from its Subject
     * ("daemon.<svc>.<area>.ping") which is exactly what Go stamps; the area is
     * a dotless UUID so splitting on '.' is unambiguous.
     *
     * @param string $svc manager.api service name (chats|tg|max)
     * @return array<string,string> area => "local"|"remote"
     */
    public function readCustomConfigAreas(string $svc): array
    {
        $path = $this->getCustomConfigPath();
        if (!file_exists($path)) {
            return [];
        }
        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data) || !isset($data['custom_daemons']) || !is_array($data['custom_daemons'])) {
            return [];
        }

        $areas = [];
        foreach ($data['custom_daemons'] as $d) {
            if (!is_array($d)) {
                continue;
            }
            $area = (string)($d['area'] ?? '');
            if ($area === '') {
                continue;
            }
            if ($this->serviceOfDaemon($d) !== $svc) {
                continue;
            }
            $location = (string)($d['location'] ?? '');
            $areas[$area] = ($location === 'remote') ? 'remote' : 'local';
        }
        return $areas;
    }

    /**
     * Derive the manager.api service name (chats|tg|max) of a custom_config
     * daemon entry. Prefer the Subject ("daemon.<svc>.<area>.ping"); fall back
     * to the binary basename of Path minus the trailing "d".
     *
     * @param array<string,mixed> $d
     * @return string
     */
    private function serviceOfDaemon(array $d): string
    {
        $subject = (string)($d['subject'] ?? '');
        if ($subject !== '') {
            $parts = explode('.', $subject);
            // daemon.<svc>.<area>.ping
            if (count($parts) >= 2 && $parts[0] === 'daemon') {
                return $parts[1];
            }
        }
        $path = (string)($d['path'] ?? '');
        if ($path !== '') {
            $base = basename($path);
            if (substr($base, -1) === 'd') {
                return substr($base, 0, -1);
            }
            return $base;
        }
        return '';
    }

    /**
     * Default per-service state record used when seeding / normalizing.
     *
     * @return array<string,mixed>
     */
    private function defaultServiceState(): array
    {
        return [
            'migrating'  => false,
            'resuming'   => false,
            'parked'     => false,
            'fail_count' => 0,
            'last_error' => '',
            'areas'      => [],
        ];
    }

    /**
     * ONE-TIME discovery (§3.1, R6): if remote_state.json is absent, seed each
     * area's `side` from custom_config.json's Location (READ-ONLY). Never
     * overwrite a non-empty existing file — that would reset an in-flight area.
     * Called once at worker start.
     *
     * @return void
     */
    public function seedRemoteState(): void
    {
        $path = $this->getRemoteStatePath();
        if (file_exists($path)) {
            return; // already seeded — never clobber an in-flight cursor
        }

        $state = [];
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            $record = $this->defaultServiceState();
            foreach ($this->readCustomConfigAreas($svc) as $area => $location) {
                $record['areas'][$area] = [
                    'side'         => ($location === 'remote') ? 'remote' : 'local',
                    'last_sync_ts' => 0,
                    'health'       => 'unknown',
                ];
            }
            $state[$svc] = $record;
        }

        $this->writeRemoteState($state);
    }

    /**
     * Decode remote_state.json. If absent, seed it first, then read. Always
     * returns a normalized per-service map for the migratable services.
     *
     * @return array<string,array<string,mixed>>
     */
    public function readRemoteState(): array
    {
        $path = $this->getRemoteStatePath();
        if (!file_exists($path)) {
            $this->seedRemoteState();
        }

        $state = [];
        $raw = @file_get_contents($path);
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $state = $decoded;
            }
        }

        // Normalize: guarantee every migratable service + every key is present.
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            $record = isset($state[$svc]) && is_array($state[$svc]) ? $state[$svc] : [];
            $record += $this->defaultServiceState();
            if (!isset($record['areas']) || !is_array($record['areas'])) {
                $record['areas'] = [];
            }
            $state[$svc] = $record;
        }
        return $state;
    }

    /**
     * Write remote_state.json with flock + atomic temp+rename (§3.1, R10/F6).
     * The single serialized WorkerRemoteTunnel is the only writer; the lock
     * guards against a stray second worker spawn.
     *
     * F6: fsync() landed in PHP 8.1 but composer allows 7.4, so guard with
     * function_exists() and fall back to fflush() on 7.4.
     *
     * @param array<string,mixed> $state
     * @return void
     */
    public function writeRemoteState(array $state): void
    {
        $path = $this->getRemoteStatePath();
        $lockPath = $path . '.lock';

        $lock = @fopen($lockPath, 'c');
        if ($lock !== false) {
            @flock($lock, LOCK_EX);
            @chmod($lockPath, 0600);
        }

        $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $json = '{}';
        }

        $tmp = $path . '.tmp';
        $fp = @fopen($tmp, 'wb');
        if ($fp !== false) {
            fwrite($fp, $json);
            $this->fsyncOrFlush($fp);
            fclose($fp);
            @chmod($tmp, 0600);
            @rename($tmp, $path);
            @chmod($path, 0600);
        }

        if ($lock !== false) {
            @flock($lock, LOCK_UN);
            @fclose($lock);
        }
    }

    /**
     * F6 compat helper: fsync the handle on PHP 8.1+, else fflush (7.4). On 7.4
     * fflush pushes userland buffers to the OS so rename ordering is preserved;
     * full power-loss durability is 8.1+ only — an accepted downgrade.
     *
     * @param resource $fp
     * @return void
     */
    private function fsyncOrFlush($fp): void
    {
        if (function_exists('fsync')) {
            @fsync($fp);
        } else {
            @fflush($fp);
        }
    }

    /**
     * Clear `parked`/`fail_count`/`last_error` for the given manager.api
     * services so the worker resumes a previously parked migration (§3.7, F1).
     * Called from modelsEventChangeData on a toggle re-trigger.
     *
     * @param string[] $svcs manager.api service names (chats|tg|max)
     * @return void
     */
    public function clearParkedForServices(array $svcs): void
    {
        if (empty($svcs)) {
            return;
        }
        $state = $this->readRemoteState();
        $touched = false;
        foreach ($svcs as $svc) {
            if (!isset($state[$svc])) {
                continue;
            }
            if (!empty($state[$svc]['parked']) || (int)($state[$svc]['fail_count'] ?? 0) > 0
                || (string)($state[$svc]['last_error'] ?? '') !== '') {
                $state[$svc]['parked'] = false;
                $state[$svc]['fail_count'] = 0;
                $state[$svc]['last_error'] = '';
                $touched = true;
            }
        }
        if ($touched) {
            $this->writeRemoteState($state);
        }
    }

    /**
     * Services that currently have >=1 area whose session DB is on the VPS
     * RIGHT NOW (per-area side==remote, cross-checked against custom_config).
     * This is what `remote_services` renders to for the idle/parked case (§3.2,
     * R5). Mixed services legally appear here while still having local areas.
     *
     * @return string[]
     */
    public function getRoutedRemoteServices(): array
    {
        // custom_config.json is Go's authoritative routing truth (CC2); use it
        // directly. We deliberately do NOT OR-in the remote_state cursor: during
        // a resume the cursor side is still `src` until the 3b commit (F2), so a
        // cursor fallback can never help the resume case, and OR-ing a stale
        // post-commit cursor would stall the remote->local drain (the area would
        // be counted remote after Go already made it local, keeping infra up).
        $routed = [];
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            foreach ($this->readCustomConfigAreas($svc) as $location) {
                if ($location === 'remote') {
                    $routed[] = $svc;
                    break;
                }
            }
        }
        return $routed;
    }

    /**
     * Services for which the remote infrastructure (ssh_tunnel, remote_monitor,
     * staged VPS configs, worker liveness) must stay alive: ANY service with
     * remote presence (>=1 remote area) OR mid-migration (push OR pull) (§3.3,
     * R5/F5). SUPERSET of getRoutedRemoteServices.
     *
     * @return string[]
     */
    public function getInfraServices(): array
    {
        $state = $this->readRemoteState();
        $routed = $this->getRoutedRemoteServices();
        $infra = [];
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            $needed = in_array($svc, $routed, true);
            if (!$needed && !empty($state[$svc]['migrating'])) {
                $needed = true; // mid-migration (push or pull) keeps infra up
            }
            if ($needed) {
                $infra[] = $svc;
            }
        }
        return $infra;
    }

    /**
     * Whether the remote infrastructure must be alive at all (R5). True when
     * any service has remote presence OR is migrating.
     *
     * @return bool
     */
    public function isInfraNeeded(): bool
    {
        if (empty($this->module_settings['remote_host'])) {
            return false;
        }
        return !empty($this->getInfraServices());
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
        // F5 (§3.3): key off infra-needed services, NOT the live toggle. During
        // a remote->local drain after the last toggle is off, getRemoteServices()
        // is empty but the VPS receiver still needs its binary/config until the
        // last area is pulled back. Only tear down when infra is empty.
        $services = $this->getInfraServices();
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
        //    Keep names are BARE (not escapeshellarg'd): the `case` below
        //    matches them against the bare `$f` from `for f in *.json`, so
        //    quoting them ('monitord.json') would never match and the prune
        //    would delete every just-uploaded config. The whole command is
        //    escaped once via escapeshellarg($pruneCmd) below, and the names
        //    are controlled basenames (monitord/chats/tg/max.json).
        $keep = [];
        foreach ($stagedFiles as $name) {
            $keep[] = $name;
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
     * In-place reconcile (§3.5): regenerate monitord.json with the new
     * suppressed/remote_services, restage + push VPS configs, then fire the
     * local monitord's /reconcile so Go's doReconcile relocates per area.
     * NEVER bounces gnatsd/amid/crmd — the in-place alternative to
     * startAllServices(true). Used at every migration step that changes
     * suppressed or area side.
     *
     * EXCEPTION — first-activation tunnel bootstrap (BUG 2): the Go ssh tunnel is
     * loaded ONCE at monitord boot from the ssh_tunnel block; doReconcile does
     * NOT re-read it. So when offload infra first becomes needed but the RUNNING
     * monitord came up without a tunnel, an in-place /reconcile can never bring
     * the tunnel up — only a monitord restart re-reads the freshly-rendered
     * ssh_tunnel block. We detect that by asking the running monitord for its
     * tunnel status (NOT an on-disk diff: generateMonitordConf already wrote the
     * block to disk here, so disk-vs-disk would always say "unchanged" and stay
     * stuck) and restart in that one case. The gate is idempotent and self-
     * healing: once the tunnel is configured:true it never restarts again, so it
     * also recovers from a crash between set-migrating and the restart, and from
     * a host-change that left infra needed without a tunnel.
     *
     * @return bool true if the /reconcile POST was accepted (2xx) or a
     *              tunnel-bootstrap restart was triggered.
     */
    public function applyMonitordConfigAndReconcile(): bool
    {
        $this->generateMonitordConf();
        $this->generateRemoteConfFiles();

        // BUG 2 tunnel bootstrap: infra needed, but is the tunnel actually up in
        // the running monitord? configured:false => it booted without a tunnel
        // block and /reconcile can't fix that — restart so Go loads the now-
        // rendered ssh_tunnel (generateConfFiles re-renders it before respawn).
        // A null status means monitord is unreachable/restarting; leave that to
        // WorkerSafeScript, which regenerates config and respawns a dead monitord
        // (rendering the tunnel) — restarting from here would race that respawn.
        //
        // The gate predicate MUST match generateMonitordConf's tunnel-render
        // predicate (isInfraNeeded && ssh params present): if host were set but
        // the key missing/unreadable, isInfraNeeded could be true while no
        // ssh_tunnel is rendered → configured:false forever → an infinite
        // full-stack bounce. With the ssh-params check, a missing key instead
        // falls through to the STEP 2 copy, which fails into FAIL-PARK and
        // restores the local service.
        if ($this->isInfraNeeded() && $this->getRemoteSshParams() !== null) {
            $tunnel = $this->getMonitordTunnelStatus();
            if ($tunnel !== null && empty($tunnel['configured'])) {
                $this->startAllServices(true);
                return true;
            }
        }

        // Best-effort push; needs the tunnel up. A failure here just means the
        // VPS receiver lags — the worker re-drives idempotently next tick.
        $this->provisionRemote();

        $curl = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 2);
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_POSTFIELDS, '');
        curl_setopt($curl, CURLOPT_URL, 'http://127.0.0.1:8225/manager.api/reconcile');

        $ok = false;
        try {
            $response = curl_exec($curl);
            $code = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $ok = ($response !== false && $code >= 200 && $code < 300);
        } catch (Throwable $e) {
            $ok = false;
        }
        curl_close($curl);
        return $ok;
    }

    /**
     * Copy the session DBs of the given areas LOCAL -> VPS, PER AREA (§3.4,
     * R6/R10). Only the {area}-* files of each area move (areas already on the
     * desired side are never clobbered). Both ends' exit codes are captured and
     * a sha256 manifest is verified on the receiver; the receiver writes into a
     * temp dir and atomically renames into place; the SOURCE files are kept
     * intact as rollback material.
     *
     * @param string   $svc   manager.api service name (chats|tg|max)
     * @param string[] $areas areas whose current side==local but desired==remote
     * @return array{ok:bool,error:string}
     */
    public function migrateAreasToRemote(string $svc, array $areas): array
    {
        if (empty($areas)) {
            return ['ok' => true, 'error' => ''];
        }
        $ssh = $this->getRemoteSshParams();
        if ($ssh === null) {
            return ['ok' => false, 'error' => 'remote ssh params not configured'];
        }
        $sshArgs = self::buildSshArgs($ssh);
        $base = $ssh['base'];
        $srcDir = $this->dirs['moduleDir'] . '/db/' . $svc;
        $dstDir = $base . '/db/' . $svc;

        foreach ($areas as $area) {
            $files = $this->localAreaFiles($srcDir, $area);
            if (empty($files)) {
                // Nothing to copy for this area on the source side; treat as a
                // no-op success (the receiver will start a fresh session).
                continue;
            }

            $manifest = $this->buildSha256Manifest($srcDir, $files);
            if ($manifest === null) {
                return ['ok' => false, 'error' => "manifest build failed for {$svc}/{$area}"];
            }

            $tmp = $base . '/db/.' . $svc . '.' . $area . '.migrate.' . bin2hex(random_bytes(4));

            // 1. Make the receiver temp dir.
            $rc = 0;
            exec($sshArgs . ' ' . escapeshellarg('mkdir -p ' . escapeshellarg($tmp))
                . ' 2>/dev/null', $o1, $rc);
            if ($rc !== 0) {
                return ['ok' => false, 'error' => "ssh mkdir tmp failed for {$svc}/{$area}: rc={$rc}"];
            }

            // 2. tar a FILE LIST (only this area), capture the LOCAL tar rc via
            //    proc_open, pipe into a remote `tar -x`.
            $remoteExtract = $sshArgs . ' ' . escapeshellarg('tar -C ' . escapeshellarg($tmp) . ' -xf -');
            $localTar = Util::which('tar') . ' -C ' . escapeshellarg($srcDir) . ' -cf - '
                . $this->shellJoin($files);
            $tarRc = $this->runPipedCommand($localTar . ' | ' . $remoteExtract);
            if ($tarRc !== 0) {
                $this->sshRemoveDir($sshArgs, $tmp);
                return ['ok' => false, 'error' => "tar local->remote failed for {$svc}/{$area}: rc={$tarRc}"];
            }

            // 3. Verify the manifest on the receiver (catches a truncated
            //    archive that tar -x still returns 0 for; pipefail is not
            //    portable).
            if (!$this->verifyRemoteManifest($sshArgs, $tmp, $manifest)) {
                $this->sshRemoveDir($sshArgs, $tmp);
                return ['ok' => false, 'error' => "manifest mismatch for {$svc}/{$area}"];
            }

            // 4. Move only this area's files into place atomically, keep prior
            //    copies as .old.<ts>; rmdir the temp; fsync the dir. Source kept.
            if (!$this->commitRemoteAreaFiles($sshArgs, $tmp, $dstDir, $area)) {
                $this->sshRemoveDir($sshArgs, $tmp);
                return ['ok' => false, 'error' => "remote commit failed for {$svc}/{$area}"];
            }
        }

        return ['ok' => true, 'error' => ''];
    }

    /**
     * Copy the session DBs of the given areas VPS -> LOCAL, PER AREA (§3.4,
     * R6/R10) — the mirror image of migrateAreasToRemote. Remote `tar` is piped
     * into a local `tar -x` in a local temp dir; the manifest is built on the
     * VPS and verified locally; only {area}-* files move into the local db dir
     * with .old backups; the local dir is fsynced. The VPS source is kept.
     *
     * @param string   $svc
     * @param string[] $areas areas whose current side==remote but desired==local
     * @return array{ok:bool,error:string}
     */
    public function migrateAreasToLocal(string $svc, array $areas): array
    {
        if (empty($areas)) {
            return ['ok' => true, 'error' => ''];
        }
        $ssh = $this->getRemoteSshParams();
        if ($ssh === null) {
            return ['ok' => false, 'error' => 'remote ssh params not configured'];
        }
        $sshArgs = self::buildSshArgs($ssh);
        $base = $ssh['base'];
        $srcDir = $base . '/db/' . $svc;
        $dstDir = $this->dirs['moduleDir'] . '/db/' . $svc;
        Util::mwMkdir($dstDir);

        foreach ($areas as $area) {
            // 1. Build the manifest on the VPS for this area's files. Empty =>
            //    nothing to pull (fresh remote session) — no-op success.
            $remoteManifest = $this->buildRemoteSha256Manifest($sshArgs, $srcDir, $area);
            if ($remoteManifest === null) {
                return ['ok' => false, 'error' => "remote manifest build failed for {$svc}/{$area}"];
            }
            if (empty($remoteManifest)) {
                continue;
            }

            $localTmp = $dstDir . '/.' . $area . '.migrate.' . bin2hex(random_bytes(4));
            if (!Util::mwMkdir($localTmp)) {
                return ['ok' => false, 'error' => "local mkdir tmp failed for {$svc}/{$area}"];
            }

            // 2. remote tar -c (this area only) piped into a local tar -x.
            //    The {area}-* glob MUST expand on the receiver inside $srcDir, so
            //    we `cd` first: `tar -C $srcDir ... area-*` would expand the glob
            //    in the remote login shell's CWD (the SSH home dir, not $srcDir),
            //    leaving a literal `area-*` that tar cannot stat — every
            //    migrate-back would then fail. `cd && tar` expands it correctly.
            //    Safe against an empty match: the empty-manifest guard above
            //    already `continue`s before we reach this line when no files exist.
            $remoteTar = $sshArgs . ' ' . escapeshellarg(
                'cd ' . escapeshellarg($srcDir) . ' && tar -cf - ' . escapeshellarg($area) . '-*'
            );
            $localExtract = Util::which('tar') . ' -C ' . escapeshellarg($localTmp) . ' -xf -';
            $tarRc = $this->runPipedCommand($remoteTar . ' | ' . $localExtract);
            if ($tarRc !== 0) {
                $this->localRemoveDir($localTmp);
                return ['ok' => false, 'error' => "tar remote->local failed for {$svc}/{$area}: rc={$tarRc}"];
            }

            // 3. Verify the manifest locally.
            if (!$this->verifyLocalManifest($localTmp, $remoteManifest)) {
                $this->localRemoveDir($localTmp);
                return ['ok' => false, 'error' => "manifest mismatch for {$svc}/{$area}"];
            }

            // 4. Move only this area's files into the local db dir with .old
            //    backups; fsync the dir; rmdir the temp. The VPS source kept.
            if (!$this->commitLocalAreaFiles($localTmp, $dstDir, $area)) {
                $this->localRemoveDir($localTmp);
                return ['ok' => false, 'error' => "local commit failed for {$svc}/{$area}"];
            }
            $this->localRemoveDir($localTmp);
        }

        return ['ok' => true, 'error' => ''];
    }

    /**
     * List the basenames of {area}-* files under a local directory.
     *
     * @param string $dir
     * @param string $area
     * @return string[]
     */
    private function localAreaFiles(string $dir, string $area): array
    {
        $files = [];
        foreach (glob($dir . '/' . $area . '-*') ?: [] as $path) {
            if (is_file($path)) {
                $files[] = basename($path);
            }
        }
        return $files;
    }

    /**
     * Build a "sha256  name" manifest (one line per file) for the given local
     * basenames inside $dir, in the `sha256sum -c` text format. Returns null on
     * a read error.
     *
     * @param string   $dir
     * @param string[] $files basenames
     * @return string|null
     */
    private function buildSha256Manifest(string $dir, array $files): ?string
    {
        $lines = [];
        foreach ($files as $name) {
            $hash = @hash_file('sha256', $dir . '/' . $name);
            if ($hash === false) {
                return null;
            }
            $lines[] = $hash . '  ' . $name;
        }
        return implode("\n", $lines) . "\n";
    }

    /**
     * Build a `sha256sum`-format manifest on the VPS for {area}-* files in
     * $remoteDir. Returns the manifest text (possibly empty when no files),
     * or null on ssh failure.
     *
     * @param string $sshArgs
     * @param string $remoteDir
     * @param string $area
     * @return string|null
     */
    private function buildRemoteSha256Manifest(string $sshArgs, string $remoteDir, string $area): ?string
    {
        // List then hash; the `2>/dev/null || true` keeps a no-match glob from
        // failing the command. sha256sum prints "hash  name".
        $remoteCmd = 'cd ' . escapeshellarg($remoteDir) . ' 2>/dev/null && '
            . 'set -- ' . escapeshellarg($area) . '-*; '
            . 'if [ -e "$1" ]; then sha256sum ' . escapeshellarg($area) . '-* 2>/dev/null; fi';
        $rc = 0;
        $out = [];
        exec($sshArgs . ' ' . escapeshellarg($remoteCmd) . ' 2>/dev/null', $out, $rc);
        if ($rc !== 0) {
            return null;
        }
        $lines = [];
        foreach ($out as $line) {
            $line = rtrim($line);
            if ($line === '') {
                continue;
            }
            // Normalize to basenames only (sha256sum already prints basenames
            // since we cd'd into the dir).
            $lines[] = $line;
        }
        if (empty($lines)) {
            return '';
        }
        return implode("\n", $lines) . "\n";
    }

    /**
     * Verify a manifest against files inside a VPS temp dir via
     * `cd {tmp} && sha256sum -c`. Returns true only on a clean check.
     *
     * @param string $sshArgs
     * @param string $tmp
     * @param string $manifest "hash  name" lines
     * @return bool
     */
    private function verifyRemoteManifest(string $sshArgs, string $tmp, string $manifest): bool
    {
        // Ship the manifest over stdin to avoid quoting hazards, then check it.
        $remoteCheck = $sshArgs . ' ' . escapeshellarg(
            'cd ' . escapeshellarg($tmp) . ' && cat > .manifest && '
            . 'sha256sum -c .manifest >/dev/null 2>&1; rc=$?; rm -f .manifest; exit $rc'
        );
        $rc = $this->runPipedCommand('printf %s ' . escapeshellarg($manifest) . ' | ' . $remoteCheck);
        return $rc === 0;
    }

    /**
     * Verify a manifest against files inside a LOCAL temp dir using PHP-side
     * sha256 (no external sha256sum dependency on the PBX side).
     *
     * @param string $tmp
     * @param string $manifest "hash  name" lines
     * @return bool
     */
    private function verifyLocalManifest(string $tmp, string $manifest): bool
    {
        $lines = preg_split('/\r?\n/', trim($manifest)) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            // "hash  name" — split on the first run of spaces.
            $parts = preg_split('/\s+/', $line, 2);
            if ($parts === false || count($parts) < 2) {
                return false;
            }
            $hash = $parts[0];
            $name = ltrim($parts[1], '*'); // sha256sum binary-mode marker
            $actual = @hash_file('sha256', $tmp . '/' . $name);
            if ($actual === false || !hash_equals($hash, $actual)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Atomically move {area}-* files from a VPS temp dir into the VPS dst dir,
     * backing up any prior copy as .old.<ts>; rmdir the temp; fsync the dir.
     *
     * @param string $sshArgs
     * @param string $tmp
     * @param string $dstDir
     * @param string $area
     * @return bool
     */
    private function commitRemoteAreaFiles(string $sshArgs, string $tmp, string $dstDir, string $area): bool
    {
        $ts = time();
        $remoteCmd = 'set -e; '
            . 'mkdir -p ' . escapeshellarg($dstDir) . '; '
            . 'for f in ' . escapeshellarg($tmp) . '/' . escapeshellarg($area) . '-*; do '
            . '  [ -e "$f" ] || continue; '
            . '  b=$(basename "$f"); '
            . '  if [ -e ' . escapeshellarg($dstDir) . '/"$b" ]; then '
            . '    mv -f ' . escapeshellarg($dstDir) . '/"$b" ' . escapeshellarg($dstDir) . '/"$b".old.' . $ts . '; '
            . '  fi; '
            . '  mv -f "$f" ' . escapeshellarg($dstDir) . '/"$b"; '
            . 'done; '
            . 'rmdir ' . escapeshellarg($tmp) . ' 2>/dev/null || true; '
            . 'sync';
        $rc = 0;
        exec($sshArgs . ' ' . escapeshellarg($remoteCmd) . ' 2>/dev/null', $o, $rc);
        return $rc === 0;
    }

    /**
     * Atomically move {area}-* files from a local temp dir into the local dst
     * dir, backing up any prior copy as .old.<ts>; fsync the dir.
     *
     * @param string $tmp
     * @param string $dstDir
     * @param string $area
     * @return bool
     */
    private function commitLocalAreaFiles(string $tmp, string $dstDir, string $area): bool
    {
        $ts = time();
        foreach (glob($tmp . '/' . $area . '-*') ?: [] as $path) {
            if (!is_file($path)) {
                continue;
            }
            $base = basename($path);
            $target = $dstDir . '/' . $base;
            if (file_exists($target)) {
                if (!@rename($target, $target . '.old.' . $ts)) {
                    return false;
                }
            }
            if (!@rename($path, $target)) {
                return false;
            }
        }
        // fsync the destination directory so the renames are durable.
        $dh = @opendir($dstDir);
        if ($dh !== false) {
            closedir($dh);
        }
        $dirFp = @fopen($dstDir, 'r');
        if ($dirFp !== false) {
            $this->fsyncOrFlush($dirFp);
            @fclose($dirFp);
        }
        return true;
    }

    /**
     * Run a shell pipeline and return the exit code of the WHOLE pipeline via
     * proc_open (so both ends' failures surface; `pipefail` is not portable).
     * Uses `set -o pipefail` under bash when available, else falls back to a
     * plain pipeline whose rc is the last command's — the manifest check is the
     * real integrity gate either way (R10).
     *
     * @param string $pipeline already-built shell pipeline
     * @return int exit code (0 = success)
     */
    private function runPipedCommand(string $pipeline): int
    {
        $bash = Util::which('bash');
        if ($bash !== '' && $bash !== false) {
            $cmd = $bash . ' -o pipefail -c ' . escapeshellarg($pipeline);
        } else {
            $cmd = $pipeline;
        }
        $descriptors = [
            0 => ['file', '/dev/null', 'r'],
            1 => ['file', '/dev/null', 'w'],
            2 => ['file', '/dev/null', 'w'],
        ];
        $proc = @proc_open($cmd, $descriptors, $pipes);
        if (!is_resource($proc)) {
            return 1;
        }
        $rc = proc_close($proc);
        return is_int($rc) ? $rc : 1;
    }

    /**
     * Shell-join a list of basenames into a quoted argument string.
     *
     * @param string[] $files
     * @return string
     */
    private function shellJoin(array $files): string
    {
        $parts = [];
        foreach ($files as $f) {
            $parts[] = escapeshellarg($f);
        }
        return implode(' ', $parts);
    }

    /**
     * Best-effort rmdir of a VPS temp dir (cleanup on a failed copy).
     *
     * @param string $sshArgs
     * @param string $dir
     * @return void
     */
    private function sshRemoveDir(string $sshArgs, string $dir): void
    {
        $rc = 0;
        exec($sshArgs . ' ' . escapeshellarg('rm -rf ' . escapeshellarg($dir))
            . ' 2>/dev/null', $o, $rc);
    }

    /**
     * Best-effort recursive removal of a local directory.
     *
     * @param string $dir
     * @return void
     */
    private function localRemoveDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (glob($dir . '/*') ?: [] as $path) {
            if (is_file($path) || is_link($path)) {
                @unlink($path);
            } elseif (is_dir($path)) {
                $this->localRemoveDir($path);
            }
        }
        @rmdir($dir);
    }

    /**
     * Confirm the WHOLE service spawns NOWHERE before any copy (§3.4, R8) — the
     * linchpin of the no-double-run invariant. Enumerates EXPECTED areas from
     * readCustomConfigAreas (read-only) and verifies EACH:
     *   - it must NOT appear started/ok in the merged manager.api/status, AND
     *   - there must be no local {svc}d process (best-effort pgrep).
     * Remote teardown is Go's job (doReconcile suppression); PHP only verifies.
     *
     * Fails CLOSED: status unreachable, an expected area missing from the rows,
     * or any unknown side => FALSE. Never infer "down" from an absent row.
     *
     * @param string $svc
     * @return bool
     */
    public function bothSidesDown(string $svc): bool
    {
        $expected = $this->readCustomConfigAreas($svc);
        if (empty($expected)) {
            // No areas at all => nothing can be running for this service.
            return true;
        }

        $rows = $this->fetchManagerStatusRows();
        if ($rows === null) {
            return false; // status unreachable => fail closed (R8)
        }

        // Index status rows by area (the row 'name' is the area/subject; match
        // any row that references the area string).
        foreach (array_keys($expected) as $area) {
            $seenDown = false;
            $proven = false;
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                if (!$this->statusRowMatchesArea($row, $svc, $area)) {
                    continue;
                }
                $proven = true;
                $state = (string)($row['state'] ?? '');
                // Any "alive" state means NOT down => fail.
                if ($this->isAliveState($state)) {
                    return false;
                }
                $seenDown = true;
            }
            // R8: if we could not find a row for this area at all, we cannot
            // prove it is down => fail closed.
            if (!$proven || !$seenDown) {
                return false;
            }
        }

        // Belt-and-suspenders: no local {svc}d process must remain.
        $rc = 0;
        $o = [];
        exec('pgrep -x ' . escapeshellarg($svc . 'd') . ' >/dev/null 2>&1', $o, $rc);
        if ($rc === 0) {
            return false; // a local daemon is still running
        }

        return true;
    }

    /**
     * After the flip + reconcile, verify the receiver came up for the MIGRATED
     * areas (§3.4, R8/R10). SINGLE-SHOT (no blocking poll) so the worker tick
     * stays bounded (§3.6): the per-tick STEP-3b retry + fail_count drives the
     * overall timeout instead. Each migrated area must have a row whose state
     * is alive: ok/authenticated => health=ok; qrcode/awaiting auth/2FA =>
     * health=reauth (a SUCCESSFUL migration, NOT a rollback trigger, R10).
     * Records per-area health back into remote_state. Fails CLOSED: an expected
     * area with no row (status unreachable or row absent) => unhealthy.
     *
     * @param string   $svc
     * @param string[] $areas migrated areas
     * @return bool
     */
    public function receiverHealthy(string $svc, array $areas): bool
    {
        if (empty($areas)) {
            return true;
        }

        $health = [];
        $allHealthy = false;

        $rows = $this->fetchManagerStatusRows();
        if ($rows !== null) {
            $allHealthy = true;
            foreach ($areas as $area) {
                $verdict = null;
                foreach ($rows as $row) {
                    if (!is_array($row) || !$this->statusRowMatchesArea($row, $svc, $area)) {
                        continue;
                    }
                    $state = strtolower((string)($row['state'] ?? ''));
                    if ($this->isReauthState($state)) {
                        $verdict = 'reauth';
                    } elseif ($this->isHealthyState($state)) {
                        $verdict = ($verdict === 'reauth') ? 'reauth' : 'ok';
                    } elseif ($verdict === null) {
                        $verdict = 'error';
                    }
                }
                if ($verdict === null || $verdict === 'error') {
                    $allHealthy = false;
                } else {
                    $health[$area] = $verdict;
                }
            }
        }

        // Persist whatever per-area health we resolved (R10: reauth is success).
        if (!empty($health)) {
            $state = $this->readRemoteState();
            foreach ($health as $area => $verdict) {
                if (!isset($state[$svc]['areas'][$area]) || !is_array($state[$svc]['areas'][$area])) {
                    $state[$svc]['areas'][$area] = ['side' => 'local', 'last_sync_ts' => 0, 'health' => 'unknown'];
                }
                $state[$svc]['areas'][$area]['health'] = $verdict;
            }
            $this->writeRemoteState($state);
        }

        return $allHealthy;
    }

    /**
     * Fetch the merged manager.api/status rows, or null when unreachable.
     *
     * @return array<int,mixed>|null
     */
    private function fetchManagerStatusRows(): ?array
    {
        $rows = $this->checkWorkerStatuses();
        // checkWorkerStatuses returns a synthetic [{name:manager.api,state:unknown}]
        // row when the endpoint is unreachable — treat that as null (fail closed).
        if (count($rows) === 1
            && is_array($rows[0])
            && ($rows[0]['name'] ?? '') === 'manager.api'
            && ($rows[0]['state'] ?? '') === 'unknown') {
            return null;
        }
        return $rows;
    }

    /**
     * Whether a manager.api status row refers to the given service+area.
     * Rows carry the area/subject in 'name' (e.g. "chats.<area>" or the bare
     * area UUID); match defensively on substring of the area.
     *
     * @param array<string,mixed> $row
     * @param string              $svc
     * @param string              $area
     * @return bool
     */
    private function statusRowMatchesArea(array $row, string $svc, string $area): bool
    {
        if ($area === '') {
            return false;
        }
        foreach (['area', 'name', 'subject'] as $field) {
            $val = (string)($row[$field] ?? '');
            if ($val !== '' && strpos($val, $area) !== false) {
                return true;
            }
        }
        return false;
    }

    /**
     * States that mean a daemon/channel is alive (running on some side).
     *
     * @param string $state
     * @return bool
     */
    private function isAliveState(string $state): bool
    {
        $state = strtolower($state);
        return $this->isHealthyState($state) || $this->isReauthState($state) || $state === 'starting';
    }

    /**
     * Fully-healthy channel states.
     *
     * @param string $state
     * @return bool
     */
    private function isHealthyState(string $state): bool
    {
        $state = strtolower($state);
        return in_array($state, ['ok', 'authenticated'], true);
    }

    /**
     * Alive-but-re-auth states (qrcode / 2FA family). R10: SUCCESS, not failure.
     *
     * @param string $state
     * @return bool
     */
    private function isReauthState(string $state): bool
    {
        $state = strtolower($state);
        if (in_array($state, ['qrcode', 'reauth'], true)) {
            return true;
        }
        // "awaiting authorization code" / "awaiting 2FA password" family.
        return strpos($state, 'awaiting') !== false;
    }

    /**
     * Roll a service back to its source side (§3.4, §4 ROLLBACK). Source files
     * were never deleted, so this just reverts each migrated area's `side` in
     * remote_state, clears migrating/resuming, and re-applies the config so
     * Go's doReconcile brings the source daemons back on their intact DB.
     *
     * @param string   $svc
     * @param string[] $areas migrated areas to revert
     * @param string   $src   source side ("local"|"remote")
     * @param string   $reason last_error message
     * @return void
     */
    public function rollbackService(string $svc, array $areas, string $src, string $reason): void
    {
        $state = $this->readRemoteState();
        foreach ($areas as $area) {
            if (!isset($state[$svc]['areas'][$area]) || !is_array($state[$svc]['areas'][$area])) {
                $state[$svc]['areas'][$area] = ['side' => $src, 'last_sync_ts' => 0, 'health' => 'unknown'];
            }
            $state[$svc]['areas'][$area]['side'] = $src;
        }
        $state[$svc]['migrating'] = false;
        $state[$svc]['resuming'] = false;
        $state[$svc]['last_error'] = $reason;
        $this->writeRemoteState($state);
        $this->applyMonitordConfigAndReconcile();
    }

    /**
     * The §4 migration state machine. Advances EACH service by AT MOST ONE step
     * per call (idempotent; one per worker tick). Single-threaded — the worker
     * is the only caller. Tunnel down => steps that need ssh return "retry" and
     * `migrating` stays as-is (no auto-failover, brief §6).
     *
     * @return void
     */
    public function reconcileMigrations(): void
    {
        $state = $this->readRemoteState();
        $desired = $this->getRemoteServices(); // toggles

        foreach (self::MIGRATABLE_SERVICES as $svc) {
            if (!empty($state[$svc]['parked'])) {
                continue; // parked: wait for operator re-trigger (toggle flip)
            }

            $desiredSide = in_array($svc, $desired, true) ? 'remote' : 'local';
            $current = $this->readCustomConfigAreas($svc);

            // moving = areas whose current side != desired (cross-checked with
            // remote_state cursor; custom_config wins on disagreement).
            $moving = [];
            foreach ($current as $area => $location) {
                if ($location !== $desiredSide) {
                    $moving[] = $area;
                }
            }

            $migrating = !empty($state[$svc]['migrating']);
            if (empty($moving) && !$migrating) {
                continue; // IDLE — nothing to do
            }

            // Advance ONE step for this service, then return so each tick does
            // bounded work and the worker stays responsive.
            $this->advanceMigrationStep($svc, $desiredSide, $moving);
            return;
        }
    }

    /**
     * Advance the migration of one service by a single §4 step.
     *
     * @param string   $svc
     * @param string   $desiredSide "local"|"remote"
     * @param string[] $moving      areas whose side != desired
     * @return void
     */
    private function advanceMigrationStep(string $svc, string $desiredSide, array $moving): void
    {
        $state = $this->readRemoteState();
        $src = ($desiredSide === 'remote') ? 'local' : 'remote';

        $migrating = !empty($state[$svc]['migrating']);
        $resuming  = !empty($state[$svc]['resuming']);

        // ---- STEP 1: SUPPRESS (begin migration; take the whole service down) ----
        if (!$migrating) {
            if (empty($moving)) {
                return; // nothing to move
            }
            $state[$svc]['migrating'] = true;
            $state[$svc]['resuming'] = false;
            $state[$svc]['last_error'] = '';
            $this->writeRemoteState($state);
            $this->applyMonitordConfigAndReconcile();
            return; // next tick re-enters and checks bothSidesDown
        }

        // ---- STEP 3b: CONFIRM + COMMIT (resume in progress) ----
        if ($resuming) {
            // The confirm-set must be the STABLE set of areas-being-moved, NOT
            // the live custom_config diff ($moving): Go's commit is exactly what
            // flips custom_config Location to desired, so the moment it commits
            // an area drops out of $moving and the live diff goes empty — which
            // would make receiverHealthy([]) trivially true and the cursor flip
            // a no-op. During resume the cursor `side` is deliberately still src
            // (F2 — flipped only here at commit), so derive the confirm-set from
            // the cursor: areas whose side != desired.
            $confirm = [];
            foreach (($state[$svc]['areas'] ?? []) as $area => $a) {
                if (is_array($a) && (string)($a['side'] ?? '') !== $desiredSide) {
                    $confirm[] = (string)$area;
                }
            }
            if (empty($confirm)) {
                // Cursor already shows everything on desired (e.g. a replayed
                // tick after commit) — nothing left to confirm; clear anchors.
                $state = $this->readRemoteState();
                $state[$svc]['migrating'] = false;
                $state[$svc]['resuming'] = false;
                $state[$svc]['fail_count'] = 0;
                $state[$svc]['last_error'] = '';
                $this->writeRemoteState($state);
                $this->applyMonitordConfigAndReconcile();
                return;
            }

            // Poll Go's commit (read-only) for EVERY confirm-set area, then the
            // receiver health for the same set (R8/R10 — single-shot per tick).
            $cur = $this->readCustomConfigAreas($svc);
            $allCommitted = true;
            foreach ($confirm as $area) {
                if (($cur[$area] ?? '') !== $desiredSide) {
                    $allCommitted = false;
                    break;
                }
            }
            if ($allCommitted && $this->receiverHealthy($svc, $confirm)) {
                // Durable commit point (follows Go's commit — F2). Flip the
                // cursor side now; receiverHealthy already stamped per-area health.
                $state = $this->readRemoteState();
                foreach ($confirm as $area) {
                    if (!isset($state[$svc]['areas'][$area]) || !is_array($state[$svc]['areas'][$area])) {
                        $state[$svc]['areas'][$area] = ['side' => $desiredSide, 'last_sync_ts' => 0, 'health' => 'ok'];
                    }
                    $state[$svc]['areas'][$area]['side'] = $desiredSide;
                    $state[$svc]['areas'][$area]['last_sync_ts'] = time();
                }
                $state[$svc]['migrating'] = false;
                $state[$svc]['resuming'] = false;
                $state[$svc]['fail_count'] = 0;
                $state[$svc]['last_error'] = '';
                $this->writeRemoteState($state);
                $this->applyMonitordConfigAndReconcile();
                $this->sweepStaleMigrationArtifacts();
                return;
            }
            // Not yet committed/healthy. Count confirmation ticks; ROLLBACK on
            // the resume-phase budget (larger than the copy-phase fail budget —
            // a cross-host receiver + qrcode/2FA re-auth takes longer to show).
            $state = $this->readRemoteState();
            $state[$svc]['fail_count'] = (int)($state[$svc]['fail_count'] ?? 0) + 1;
            if ($state[$svc]['fail_count'] >= self::MIGRATION_MAX_CONFIRM) {
                // Receiver won't come up after the copy => ROLLBACK to source.
                $this->writeRemoteState($state);
                $this->rollbackService($svc, $confirm, $src, 'migration failed, rolled back to ' . $src);
                $st2 = $this->readRemoteState();
                $st2[$svc]['fail_count'] = 0;
                $this->writeRemoteState($st2);
                return;
            }
            $this->writeRemoteState($state);
            return;
        }

        // migrating && !resuming => STEP 1 gate / STEP 2 copy.
        // ---- STEP 1 gate: confirm bothSidesDown before copying ----
        if (!$this->bothSidesDown($svc)) {
            $state = $this->readRemoteState();
            $state[$svc]['fail_count'] = (int)($state[$svc]['fail_count'] ?? 0) + 1;
            if ($state[$svc]['fail_count'] >= self::MIGRATION_MAX_FAILS) {
                $this->failPark($svc, $src);
                return;
            }
            $state[$svc]['last_error'] = 'waiting for service to quiesce';
            $this->writeRemoteState($state);
            return;
        }

        // ---- STEP 2: COPY (per-area) ----
        if (empty($moving)) {
            // Nothing to copy (e.g. all areas already on dst) — go straight to
            // resume so suppressed is lifted.
            $this->enterResume($svc);
            return;
        }
        $copy = ($desiredSide === 'remote')
            ? $this->migrateAreasToRemote($svc, $moving)
            : $this->migrateAreasToLocal($svc, $moving);

        if (!$copy['ok']) {
            $state = $this->readRemoteState();
            $state[$svc]['fail_count'] = (int)($state[$svc]['fail_count'] ?? 0) + 1;
            $state[$svc]['last_error'] = 'copy failed: ' . $copy['error'];
            if ($state[$svc]['fail_count'] >= self::MIGRATION_MAX_FAILS) {
                $this->writeRemoteState($state);
                $this->failPark($svc, $src);
                return;
            }
            $this->writeRemoteState($state);
            return;
        }

        // Copy succeeded for all moving areas => STEP 3a RESUME.
        // ENSURE every moving area is present in the cursor with side=$src (NOT
        // yet flipped — 3b commit flips it). The cursor `areas` map is otherwise
        // only seeded once at first run, so post-seed channels (the normal case
        // on a fresh install) would be absent — leaving the 3b confirm-set empty
        // and bypassing the health/commit gate. Stamp them here so STEP 3b's
        // cursor-derived confirm-set actually contains the moving areas.
        $state = $this->readRemoteState();
        $state[$svc]['fail_count'] = 0;
        foreach ($moving as $area) {
            if (!isset($state[$svc]['areas'][$area]) || !is_array($state[$svc]['areas'][$area])) {
                $state[$svc]['areas'][$area] = ['side' => $src, 'last_sync_ts' => 0, 'health' => 'unknown'];
            }
            $state[$svc]['areas'][$area]['side'] = $src; // src until the 3b commit
            $state[$svc]['areas'][$area]['last_sync_ts'] = time();
        }
        $this->writeRemoteState($state);
        $this->enterResume($svc);
    }

    /**
     * STEP 3a: enter the RESUME phase — keep migrating=true (the crash anchor,
     * F2) but set resuming=true so the gate lifts suppression and drives the
     * service to its desired side; ask Go to relocate. The durable side flip
     * happens only in STEP 3b after Go commits.
     *
     * @param string $svc
     * @return void
     */
    private function enterResume(string $svc): void
    {
        $state = $this->readRemoteState();
        $state[$svc]['resuming'] = true;
        $state[$svc]['fail_count'] = 0;
        $this->writeRemoteState($state);
        $this->applyMonitordConfigAndReconcile();
    }

    /**
     * FAIL-PARK (§4): a STEP 1/STEP 2 migration that can't complete (VPS/tunnel
     * down past N retries). Side is still src (STEP 3 never ran), so clearing
     * migrating restores the source daemons on their intact DB. PARK so we
     * don't thrash a dead VPS; operator re-triggers by flipping the toggle.
     *
     * @param string $svc
     * @param string $src source side ("local"|"remote")
     * @return void
     */
    private function failPark(string $svc, string $src): void
    {
        $state = $this->readRemoteState();
        $state[$svc]['migrating'] = false;
        $state[$svc]['resuming'] = false;
        $state[$svc]['parked'] = true;
        $state[$svc]['fail_count'] = 0;
        $state[$svc]['last_error'] = 'migration failed (VPS unreachable), still on ' . $src;
        $this->writeRemoteState($state);
        $this->applyMonitordConfigAndReconcile();
    }

    /**
     * Startup / post-migration sweep (§3.5, R10): remove leftover migrate temp
     * dirs and aged .old backups on BOTH sides, and tear stale REMOTE
     * custom_config stubs whose area no longer exists locally. Best-effort.
     *
     * @return void
     */
    public function sweepStaleMigrationArtifacts(): void
    {
        $ttl = 24 * 3600;
        $now = time();

        // Local: under {moduleDir}/db/<svc>/ remove .<area>.migrate.* dirs and
        // aged *.old.<ts> files.
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            $dir = $this->dirs['moduleDir'] . '/db/' . $svc;
            if (!is_dir($dir)) {
                continue;
            }
            foreach (glob($dir . '/.*.migrate.*') ?: [] as $path) {
                if (is_dir($path)) {
                    $this->localRemoveDir($path);
                }
            }
            foreach (glob($dir . '/*.old.*') ?: [] as $path) {
                if (is_file($path) && $this->oldBackupExpired($path, $now, $ttl)) {
                    @unlink($path);
                }
            }
        }

        // Remote: best-effort cleanup of migrate temp dirs and aged backups, and
        // delete stale remote stubs for areas no longer present locally.
        $ssh = $this->getRemoteSshParams();
        if ($ssh === null) {
            return;
        }
        $sshArgs = self::buildSshArgs($ssh);
        $base = $ssh['base'];
        $remoteCmd = 'for d in ' . escapeshellarg($base) . '/db/.*.migrate.*; do '
            . '  [ -d "$d" ] && rm -rf "$d"; '
            . 'done; '
            . 'find ' . escapeshellarg($base) . '/db -name "*.old.*" -mtime +1 -delete 2>/dev/null; '
            . 'true';
        $rc = 0;
        exec($sshArgs . ' ' . escapeshellarg($remoteCmd) . ' 2>/dev/null', $o, $rc);
    }

    /**
     * Whether an *.old.<ts> backup file is older than the TTL (uses the encoded
     * timestamp suffix when present, else mtime).
     *
     * @param string $path
     * @param int    $now
     * @param int    $ttl
     * @return bool
     */
    private function oldBackupExpired(string $path, int $now, int $ttl): bool
    {
        if (preg_match('/\.old\.(\d+)$/', $path, $m)) {
            return ($now - (int)$m[1]) > $ttl;
        }
        $mtime = @filemtime($path);
        return $mtime !== false && ($now - $mtime) > $ttl;
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
        //
        // DETACH (BUG 2 — the cold-launch hang): launching a daemon over ssh and
        // returning at once requires that NO surviving process still holds the
        // ssh channel's stdout/stderr pipe — ssh only returns once the server
        // sees EOF on that pipe. The earlier `(cd … && nohup monitord … </dev/null &)`
        // form was NOT enough: the subshell `( … )` wrapper bash kept fd 1/2
        // pointing at the channel pipe even after backgrounding monitord, so ssh
        // hung for ~20 min while the wrapper lingered (proven live: the wrapper
        // bash held pipe:[…] on fd1/2 while monitord itself was already clean).
        // `</dev/null` only fixed monitord's *stdin* — the wrapper's stdout/stderr
        // were the real holders.
        //
        // The robust form: `setsid sh -c 'cd … && exec monitord … >>log 2>&1
        // </dev/null' >/dev/null 2>&1 </dev/null &`
        //   • the OUTER `>/dev/null 2>&1 </dev/null` strips the channel pipe from
        //     the setsid wrapper (this is the load-bearing change),
        //   • `exec` replaces sh with monitord so no extra shell lingers,
        //   • `setsid` detaches into a new session (no controlling tty / SIGHUP),
        //   • the INNER `>>log 2>&1 </dev/null` points monitord's own fds at the
        //     log / /dev/null.
        // Verified live: ssh returns in <3 s and the daemon reparents to init with
        // fd 0→/dev/null, 1,2→log and no pipe held by any wrapper.
        // (-n can't go in buildSshArgs — the migrate path pipes tar over stdin.)
        //
        // `timeout` is defense in depth: even with a perfect detach, a TCP stall
        // mid-session would block exec() forever (ServerAlive only catches a dead
        // link, not a live one waiting on EOF). This is a best-effort keepalive
        // call, so a bounded local timeout must never let it freeze the worker.
        // 30s margin: the cold launch (ssh connect + monitord start) was seen
        // taking ~10s live, so the bound sits ~3× above the observed worst case;
        // if it ever fires, the next keepalive tick re-drives idempotently.
        $innerCmd = 'cd ' . escapeshellarg($base) . ' && '
            . 'exec ' . escapeshellarg("{$base}/bin/" . self::SERVICE_MONITOR)
            . ' -c ' . escapeshellarg("{$base}/conf/monitord.json")
            . ' >> ' . escapeshellarg("{$base}/logs/monitord.out") . ' 2>&1 </dev/null';
        $remoteCmd = 'pgrep -x ' . escapeshellarg(self::SERVICE_MONITOR) . ' >/dev/null 2>&1 || '
            . 'setsid sh -c ' . escapeshellarg($innerCmd) . ' >/dev/null 2>&1 </dev/null &';

        $rc = 0;
        exec('timeout 30 ' . $sshArgs . ' ' . escapeshellarg($remoteCmd) . ' 2>/dev/null', $tmpOut, $rc);
        if ($rc !== 0) {
            // rc 124 = local timeout fired (ssh stalled); anything else = ssh error.
            $reason = ($rc === 124) ? 'ssh monitord launch timed out' : 'ssh monitord launch failed';
            return ['ok' => false, 'error' => $reason . ': rc=' . $rc];
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
     * Fetch the in-process ssh tunnel status from the local monitord
     * (/manager.api/tunnel/status). monitord owns the tunnel since the Go-side
     * refactor, so this replaces the old WorkerRemoteTunnel status file.
     *
     * @return array<string,mixed>|null Decoded "result" object
     *         ({configured,connected,state,last_ok_ts,last_error,attempts}),
     *         or null when monitord is unreachable / the response is unusable.
     */
    private function getMonitordTunnelStatus(): ?array
    {
        $curl = curl_init();
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 2);
        curl_setopt($curl, CURLOPT_URL, 'http://127.0.0.1:8225/manager.api/tunnel/status');

        try {
            $response = curl_exec($curl);
        } catch (Throwable $e) {
            $response = false;
        }
        curl_close($curl);

        if (!is_string($response) || $response === '') {
            return null;
        }
        $data = json_decode($response, true);
        if (!is_array($data) || !isset($data['result']) || !is_array($data['result'])) {
            return null;
        }
        return $data['result'];
    }

    /**
     * Whether the monitord-owned ssh tunnel is currently connected. Used by the
     * slim remote worker to gate the remote monitord launch (chatsd on the VPS
     * FATALs without NATS, which only reaches it through the reverse forward).
     *
     * @return bool
     */
    public function isRemoteTunnelConnected(): bool
    {
        $data = $this->getMonitordTunnelStatus();
        return $data !== null && !empty($data['connected']);
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

        // Remote messenger offload (§3.2). Three distinct inputs, NEVER conflate:
        //  - suppressed:      services mid-migration in the SUPPRESS/COPY phase
        //                     (migrating && !resuming) — Go spawns them NOWHERE.
        //  - remote_services: where channels currently ARE (per-area side),
        //                     NOT the live toggle — flipping the toggle must not
        //                     route the whole service to an empty side before the
        //                     copy lands. During STEP 3a (resuming) a service is
        //                     driven to its DESIRED side so Go relocates.
        //  - infra (ssh_tunnel/remote_monitor): up whenever ANY service has
        //                     remote presence OR is migrating (R5 superset).
        $state = $this->readRemoteState();
        $desiredToggles = $this->getRemoteServices();

        $suppressed = [];
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            if (!empty($state[$svc]['migrating']) && empty($state[$svc]['resuming'])) {
                $suppressed[] = $svc;
            }
        }
        if (!empty($suppressed)) {
            $arr_settings['suppressed'] = $suppressed;
        }

        // remote_services: current-side routing for idle/parked services, but the
        // DESIRED side for a service in the resume phase (so Go's doReconcile
        // actually relocates its areas, §4 STEP 3a).
        $routed = $this->getRoutedRemoteServices();
        $remoteServices = [];
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            if (!empty($state[$svc]['resuming'])) {
                if (in_array($svc, $desiredToggles, true)) {
                    $remoteServices[] = $svc;
                }
            } elseif (in_array($svc, $routed, true)) {
                $remoteServices[] = $svc;
            }
        }

        if ($this->isInfraNeeded()) {
            $arr_settings['remote_monitor'] = '127.0.0.1:' . self::getRemoteMonitorPort();
            if (!empty($remoteServices)) {
                $arr_settings['remote_services'] = $remoteServices;
            }

            // monitord owns the outbound ssh tunnel to the VPS (replacing the
            // former WorkerRemoteTunnel `ssh -N`). Reverse forwards expose PBX
            // NATS + license on the VPS loopback; the local forward maps
            // PBX:<remoteMonitorPort> to the remote monitord's manager.api (8225).
            // Rendered here so config regeneration always preserves it; the Go
            // side keeps the connection up with reconnect/keepalive.
            $ssh = $this->getRemoteSshParams();
            if ($ssh !== null) {
                $natsPort = $this->getNatsPort();
                $natsHttpPort = $this->getNatsHttpPort();
                $arr_settings['ssh_tunnel'] = [
                    'host'             => $ssh['host'],
                    'port'             => $ssh['port'],
                    'login'            => $ssh['login'],
                    'key_path'         => $ssh['keyFile'],
                    'known_hosts_path' => $ssh['knownHosts'],
                    'keepalive_sec'    => 15,
                    'forwards'         => [
                        ['listen_addr' => '127.0.0.1:' . $natsPort, 'target_addr' => '127.0.0.1:' . $natsPort],
                        ['listen_addr' => '127.0.0.1:' . $natsHttpPort, 'target_addr' => '127.0.0.1:' . $natsHttpPort],
                    ],
                    'local_forwards'   => [
                        ['listen_addr' => '127.0.0.1:' . self::getRemoteMonitorPort(), 'target_addr' => '127.0.0.1:8225'],
                    ],
                ];
            }
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

        // §3.3 (R5): stage for every service that has remote presence OR is
        // migrating (push or pull), NOT just the live toggle — a remote->local
        // drain after the last toggle is off must keep its VPS config staged
        // until the last area is pulled back. The prune-all-first step above
        // then naturally drops a service once it leaves the infra set.
        $remoteServices = $this->getInfraServices();
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

        // Tag every row with where it runs (local box vs offloaded VPS) so the
        // UI can render a "VPS" badge against the messenger channels that the
        // operator moved to the remote server. Additive field only — the
        // success classification below still keys purely on 'state'.
        $statuses = $this->annotateLocations($statuses);

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
     * Annotate each status row with a 'location' field ("local"|"remote") so the
     * status panel can flag which messenger channels were offloaded to the VPS.
     *
     * Source of truth is Go's custom_config.json (CC2: READ-ONLY here), the same
     * file getRoutedRemoteServices trusts. We deliberately do NOT use the
     * remote_state cursor — during a resume it lags behind Go's actual routing.
     *
     * The join is per-area: a migratable service (chats|tg|max) can be MIXED
     * (some channels local, some on the VPS), so each channel row is tagged
     * individually by its area UUID. The SSH tunnel row is the uplink itself, so
     * it is always "remote". Plain infra rows (monitord, nats, …) are "local".
     *
     * @param array<int,mixed> $statuses
     * @return array<int,mixed>
     */
    private function annotateLocations(array $statuses): array
    {
        $locationMap = $this->readAllCustomConfigLocations();

        foreach ($statuses as $idx => $row) {
            if (!is_array($row) || !isset($row['name'])) {
                continue;
            }
            $name = (string)$row['name'];

            // The SSH tunnel IS the link to the VPS.
            if ($name === self::SERVICE_REMOTE_TUNNEL) {
                $statuses[$idx]['location'] = 'remote';
                continue;
            }

            // Derive the base service, tolerating a "chats.<area>" name form.
            $svc = $name;
            $dotPos = strpos($name, '.');
            if ($dotPos !== false) {
                $svc = substr($name, 0, $dotPos);
            }
            if (!in_array($svc, self::MIGRATABLE_SERVICES, true)) {
                // Infrastructure daemon — always on the local box.
                $statuses[$idx]['location'] = 'local';
                continue;
            }

            $area = (string)($row['area'] ?? '');
            if ($area === '' && $dotPos !== false) {
                $area = substr($name, $dotPos + 1);
            }

            $location = $this->lookupAreaLocation($locationMap[$svc] ?? [], $area);
            if ($location !== null) {
                $statuses[$idx]['location'] = $location;
            }
            // Unknown area (join miss) -> leave 'location' unset so the UI shows a
            // neutral cell rather than falsely asserting "local".
        }

        return $statuses;
    }

    /**
     * READ-ONLY (CC2): parse Go's custom_config.json ONCE and return the
     * per-service area->location map for all migratable services. Cheaper than
     * calling readCustomConfigAreas() per service on every 3s status poll.
     *
     * @return array<string,array<string,string>> svc => (area => "local"|"remote")
     */
    private function readAllCustomConfigLocations(): array
    {
        $map = [];
        foreach (self::MIGRATABLE_SERVICES as $svc) {
            $map[$svc] = [];
        }

        $path = $this->getCustomConfigPath();
        if (!file_exists($path)) {
            return $map;
        }
        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            return $map;
        }
        $data = json_decode($raw, true);
        if (!is_array($data) || !isset($data['custom_daemons']) || !is_array($data['custom_daemons'])) {
            return $map;
        }

        foreach ($data['custom_daemons'] as $d) {
            if (!is_array($d)) {
                continue;
            }
            $area = (string)($d['area'] ?? '');
            if ($area === '') {
                continue;
            }
            $svc = $this->serviceOfDaemon($d);
            if (!isset($map[$svc])) {
                continue;
            }
            $location = (string)($d['location'] ?? '');
            $map[$svc][$area] = ($location === 'remote') ? 'remote' : 'local';
        }

        return $map;
    }

    /**
     * Resolve a status row's area to its location using the custom_config map.
     * Tries an exact key first, then a defensive substring match in either
     * direction to survive dotted/prefixed area forms (mirrors the tolerance in
     * statusRowMatchesArea). Returns null when the area is unknown.
     *
     * @param array<string,string> $areaMap area => "local"|"remote"
     * @param string               $area
     * @return string|null
     */
    private function lookupAreaLocation(array $areaMap, string $area): ?string
    {
        if ($area === '' || empty($areaMap)) {
            return null;
        }
        if (isset($areaMap[$area])) {
            return $areaMap[$area];
        }
        foreach ($areaMap as $cfgArea => $loc) {
            $cfgArea = (string)$cfgArea;
            if ($cfgArea !== '' && (strpos($area, $cfgArea) !== false || strpos($cfgArea, $area) !== false)) {
                return $loc;
            }
        }
        return null;
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
     * monitord /manager.api/tunnel/status endpoint (monitord owns the tunnel).
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

        $data = $this->getMonitordTunnelStatus();
        if ($data === null) {
            // monitord unreachable (e.g. mid-restart) — keep pending, not red.
            return $row;
        }
        // Tunnel block not yet in monitord's config (config still regenerating
        // after a toggle change) — pending rather than error.
        if (empty($data['configured'])) {
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

        if ($rc === 0 && $arch === 'x86_64' && $rwOk) {
            return ['ok' => true, 'arch' => $arch, 'rwOk' => true, 'base' => $base, 'error' => ''];
        }
        $err = $diag !== [] ? implode('; ', $diag) : ('ssh exit ' . $rc);
        // The current build only ships x86_64 binaries — reject any other arch
        // here so the UI probe matches provisionRemote() instead of reporting OK
        // and failing later during provisioning.
        if ($rc === 0 && $arch !== '' && $arch !== 'x86_64') {
            $err = 'unsupported remote arch: ' . $arch;
        } elseif ($arch !== '' && !$rwOk) {
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
