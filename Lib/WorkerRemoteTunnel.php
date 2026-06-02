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

use MikoPBX\Common\Handlers\CriticalErrorsHandler;
use MikoPBX\Core\System\Util;
use MikoPBX\Core\Workers\WorkerBase;
use MikoPBX\Modules\PbxExtensionUtils;
use Throwable;

require_once 'Globals.php';

/**
 * WorkerRemoteTunnel — keeps the SSH tunnel to the messenger-offload VPS up.
 *
 * Topology (as initiated by this worker):
 *   ssh -N -i <key> \
 *       -R 127.0.0.1:4222:127.0.0.1:4222   (NATS on VPS → gnatsd on PBX)
 *       -R 127.0.0.1:8222:127.0.0.1:8222   (license on VPS → gnatsd on PBX)
 *       -L 127.0.0.1:8226:127.0.0.1:8225   (PBX:8226 → remote monitord manager.api)
 *
 * Why a worker at all?
 *   The patched local monitord forwards remote-area /chats/* over -L:8226. If the
 *   tunnel goes down, only the offloaded channels stall — the rest of MikoPBX is
 *   untouched. So this worker is allowed to fail soft: a status file under spool/
 *   tells the UI whether the tunnel is up, but the worker NEVER throws to block
 *   the local services.
 *
 * Sequencing (important):
 *   provisionRemote() → start ssh tunnel → wait for tunnel up → launch remote
 *   monitord. chatsd FATALs without NATS on startup, so the reverse forwards
 *   MUST exist before monitord (which will spawn chatsd via manager.api) runs.
 *
 * Registered under WorkerSafeScriptsCore::CHECK_BY_PID_NOT_ALERT (see
 * CTIClientConf::getModuleWorkers()), so start() must block for the lifetime
 * of the tunnel — if it returns, the supervisor will see a dead PID and respawn.
 *
 * TODO: pin host key (TOFU now via accept-new); encrypt remote_ssh_key at rest
 *       (planned as a follow-up phase per docs/REMOTE_MESSENGERS_VPS.md §16).
 */
class WorkerRemoteTunnel extends WorkerBase
{
    private const MODULE_UNIQUE_ID = 'ModuleCTIClient';
    private const BACKOFF_MIN_SECONDS = 2;
    private const BACKOFF_MAX_SECONDS = 60;
    private const POLL_INTERVAL_SECONDS = 5;
    /**
     * Hard ceiling on the worker's lifetime. The supervisor (WorkerSafeScripts)
     * respawns workers whose PID file goes away; periodically returning lets it
     * pick up code/config changes that we may have missed via signals.
     */
    private const MAX_LIFETIME_SECONDS = 3600;

    /**
     * PID of the ssh tunnel child. Tracked at file scope so a SIGTERM-driven
     * shutdown (which goes straight to exit() inside WorkerBase::dispatchSignal
     * and skips our orderly closeTunnelProc()) can still reach the child via a
     * register_shutdown_function. Without this the reverse forwards would stay
     * alive on the VPS until the next process death.
     */
    private int $tunnelPid = 0;

    public function start($argv): void
    {
        if (!PbxExtensionUtils::isEnabled(self::MODULE_UNIQUE_ID)) {
            return;
        }

        // SIGTERM / SIGINT inside WorkerBase ultimately calls exit(0) — that
        // unwinds shutdown functions but NOT our finally/closeTunnelProc paths.
        // Register a best-effort killer so the ssh child dies with us.
        register_shutdown_function(function () {
            if ($this->tunnelPid > 0) {
                @posix_kill($this->tunnelPid, SIGTERM);
            }
        });

        $deadline = time() + self::MAX_LIFETIME_SECONDS;
        $backoff = self::BACKOFF_MIN_SECONDS;

        while (time() < $deadline && !$this->needRestart) {
            // Re-read settings every loop iteration so the operator can toggle
            // services and have us pick it up without a full daemon restart.
            $cti = new AmigoDaemons();
            $services = $cti->getRemoteServices();
            $ssh = $cti->getRemoteSshParams();

            if (empty($services) || $ssh === null) {
                // Offload is off or not yet configured — write a single status
                // file row and sleep. Don't exit (supervisor would respawn us
                // immediately for nothing).
                $this->writeStatus($cti, false, '', 'offload disabled');
                $this->sleepInterruptible(self::POLL_INTERVAL_SECONDS);
                continue;
            }

            // 1. Provisioning — idempotent. Failures here usually mean the VPS
            //    is unreachable; back off and retry.
            $prov = $cti->provisionRemote();
            if (!$prov['ok']) {
                $this->writeStatus($cti, false, '', 'provision: ' . $prov['error']);
                $this->sleepInterruptible($backoff);
                $backoff = min($backoff * 2, self::BACKOFF_MAX_SECONDS);
                continue;
            }

            // 2. Bring the tunnel up. ssh -N runs in the foreground; we proc_open
            //    it and poll proc_get_status() so we can react to detoggle / SIGTERM.
            $tunnelProc = $this->startTunnelProc($ssh);
            if ($tunnelProc === null) {
                $this->writeStatus($cti, false, '', 'ssh tunnel: spawn failed');
                $this->sleepInterruptible($backoff);
                $backoff = min($backoff * 2, self::BACKOFF_MAX_SECONDS);
                continue;
            }

            // 3. Wait a moment for the forwards to settle, then launch monitord
            //    on the VPS. -R takes a heartbeat to negotiate, and chatsd on
            //    the VPS FATALs without NATS — so we don't race monitord with
            //    the tunnel being half-up.
            $this->sleepInterruptible(2);
            if (!$this->isTunnelAlive($tunnelProc)) {
                $this->writeStatus($cti, false, '', 'ssh tunnel: died during handshake');
                $this->closeTunnelProc($tunnelProc);
                $this->sleepInterruptible($backoff);
                $backoff = min($backoff * 2, self::BACKOFF_MAX_SECONDS);
                continue;
            }

            $launch = $cti->launchRemoteMonitord();
            if (!$launch['ok']) {
                // Tunnel is up but we couldn't kick monitord. The next loop
                // iteration will retry — keep the tunnel up while we wait.
                $this->writeStatus($cti, true, (string)time(), 'monitord launch: ' . $launch['error']);
            } else {
                $this->writeStatus($cti, true, (string)time(), '');
                $backoff = self::BACKOFF_MIN_SECONDS;
            }

            // 4. Hold here while the tunnel is alive. On each tick re-check that
            //    offload is still enabled — if the operator detoggled, tear down
            //    cleanly. This is also where SIGTERM is observed: needRestart or
            //    a closed loop exits us.
            while ($this->isTunnelAlive($tunnelProc) && !$this->needRestart && time() < $deadline) {
                $this->sleepInterruptible(self::POLL_INTERVAL_SECONDS);

                $ctiCheck = new AmigoDaemons();
                $servicesCheck = $ctiCheck->getRemoteServices();
                $sshCheck = $ctiCheck->getRemoteSshParams();
                if (empty($servicesCheck) || $sshCheck === null) {
                    // Operator disabled offload — stop the remote stack and exit.
                    $this->writeStatus($ctiCheck, false, (string)time(), 'offload disabled');
                    $this->closeTunnelProc($tunnelProc);
                    $ctiCheck->stopRemoteServices();
                    return;
                }

                // Periodic re-launch in case monitord on the VPS died and the
                // remote ssh shell is still alive (it would only die if the
                // tunnel itself dropped). pgrep guards us against duplicates.
                $relaunch = $ctiCheck->launchRemoteMonitord();
                $err = $relaunch['ok'] ? '' : 'monitord re-launch: ' . $relaunch['error'];
                $this->writeStatus($ctiCheck, true, (string)time(), $err);
            }

            // Tunnel died (or we're exiting). Close the proc, back off, retry.
            $this->closeTunnelProc($tunnelProc);
            if ($this->needRestart || time() >= $deadline) {
                return;
            }
            $this->writeStatus($cti, false, '', 'ssh tunnel: exited');
            $this->sleepInterruptible($backoff);
            $backoff = min($backoff * 2, self::BACKOFF_MAX_SECONDS);
        }
    }

    /**
     * Spawn the persistent ssh -N tunnel. Returns the proc resource or null
     * if proc_open itself failed.
     *
     * @param array{host:string,port:string,login:string,keyFile:string,knownHosts:string,base:string} $ssh
     * @return resource|null
     */
    private function startTunnelProc(array $ssh)
    {
        $remoteMonitorPort = AmigoDaemons::getRemoteMonitorPort();
        $natsPort = AmigoDaemons::getNatsPort();
        $natsHttpPort = AmigoDaemons::getNatsHttpPort();

        $cmd = Util::which('ssh')
            . ' -N'
            . ' -o BatchMode=yes'
            . ' -o StrictHostKeyChecking=accept-new'
            . ' -o UserKnownHostsFile=' . escapeshellarg($ssh['knownHosts'])
            . ' -o ExitOnForwardFailure=yes'
            . ' -o ServerAliveInterval=15'
            . ' -o ServerAliveCountMax=3'
            . ' -o ConnectTimeout=10'
            . ' -i ' . escapeshellarg($ssh['keyFile'])
            . ' -p ' . escapeshellarg($ssh['port'])
            . ' -R 127.0.0.1:' . escapeshellarg($natsPort) . ':127.0.0.1:' . escapeshellarg($natsPort)
            . ' -R 127.0.0.1:' . escapeshellarg($natsHttpPort) . ':127.0.0.1:' . escapeshellarg($natsHttpPort)
            . ' -L 127.0.0.1:' . escapeshellarg($remoteMonitorPort) . ':127.0.0.1:8225'
            . ' ' . escapeshellarg($ssh['login'] . '@' . $ssh['host']);

        // Route stderr into a dedicated log file so a failed handshake is
        // diagnosable live (the worker writes the error code to the status
        // file but the ssh exit reason ends up here). Keep stdout out of
        // the way — ssh -N never writes to it.
        $logDir = sys_get_temp_dir();
        try {
            $cti = new AmigoDaemons();
            $logDir = $cti->dirs['logDir'] ?? $logDir;
        } catch (Throwable $e) {
            // Falling back to tmp is fine; this only affects diagnostics.
        }
        $stderrLog = $logDir . '/ssh_tunnel.log';

        $descriptors = [
            0 => ['file', '/dev/null', 'r'],
            1 => ['file', '/dev/null', 'a'],
            2 => ['file', $stderrLog, 'a'],
        ];
        $proc = @proc_open($cmd, $descriptors, $pipes);
        if (!is_resource($proc)) {
            return null;
        }
        $status = @proc_get_status($proc);
        if (is_array($status) && isset($status['pid'])) {
            $this->tunnelPid = (int)$status['pid'];
        }
        return $proc;
    }

    /**
     * @param resource $proc
     */
    private function isTunnelAlive($proc): bool
    {
        if (!is_resource($proc)) {
            return false;
        }
        $status = @proc_get_status($proc);
        if (!is_array($status)) {
            return false;
        }
        return !empty($status['running']);
    }

    /**
     * @param resource $proc
     */
    private function closeTunnelProc($proc): void
    {
        if (!is_resource($proc)) {
            return;
        }
        $status = @proc_get_status($proc);
        if (is_array($status) && !empty($status['running']) && isset($status['pid'])) {
            @posix_kill((int)$status['pid'], SIGTERM);
            // Give ssh a beat to clean up its forwards, then hard-kill if needed.
            for ($i = 0; $i < 10; $i++) {
                usleep(100000);
                $s = @proc_get_status($proc);
                if (!is_array($s) || empty($s['running'])) {
                    break;
                }
            }
            $s = @proc_get_status($proc);
            if (is_array($s) && !empty($s['running']) && isset($s['pid'])) {
                @posix_kill((int)$s['pid'], SIGKILL);
            }
        }
        @proc_close($proc);
        $this->tunnelPid = 0;
    }

    /**
     * Sleep that wakes up promptly on SIGTERM/SIGINT (pcntl_async_signals is
     * already enabled by WorkerBase, so the signal handler fires inline).
     */
    private function sleepInterruptible(int $seconds): void
    {
        $deadline = microtime(true) + $seconds;
        while (!$this->needRestart && microtime(true) < $deadline) {
            usleep(200000);
        }
    }

    /**
     * Write the JSON status file consumed by the web UI. Connected=true means
     * the ssh tunnel is alive; last_ok_ts is the unix timestamp of the most
     * recent successful state; last_error carries the most recent diagnostic
     * (empty string when healthy).
     */
    private function writeStatus(AmigoDaemons $cti, bool $connected, string $lastOkTs, string $error): void
    {
        $path = $cti->getRemoteTunnelStatusFile();
        $payload = [
            'connected'    => $connected,
            'last_ok_ts'   => $lastOkTs,
            'last_error'   => $error,
            'updated_ts'   => (string)time(),
        ];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $json = '{}';
        }
        // Best-effort atomic write: write to a tmp file, rename into place.
        // chmod 0644 so the web UI (running as www) can read what the worker
        // (typically root) wrote — umask on tmpfs occasionally drops the
        // other-read bit and the controller's getRemoteTunnelStatus would
        // silently fall back to "status file missing".
        $tmp = $path . '.tmp';
        if (@file_put_contents($tmp, $json) !== false) {
            @chmod($tmp, 0644);
            @rename($tmp, $path);
        }
    }
}

// Start worker process
$workerClassname = WorkerRemoteTunnel::class;
if (isset($argv) && count($argv) > 1) {
    cli_set_process_title($workerClassname);
    try {
        $worker = new $workerClassname();
        $worker->start($argv);
    } catch (Throwable $e) {
        CriticalErrorsHandler::handleExceptionWithSyslog($e);
    }
}
