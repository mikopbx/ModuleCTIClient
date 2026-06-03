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
use MikoPBX\Core\Workers\WorkerBase;
use MikoPBX\Modules\PbxExtensionUtils;
use Throwable;

require_once 'Globals.php';

/**
 * WorkerRemoteTunnel — keeps the messenger-offload VPS stack alive.
 *
 * Since the Go-side refactor, the SSH tunnel itself is owned by the local
 * monitord (an ssh.Client goroutine with reconnect/keepalive, configured via
 * the `ssh_tunnel` block in monitord.json). This worker no longer runs
 * `ssh -N`. Its remaining duties:
 *   1. provisionRemote()      — push binaries + staged configs to the VPS (idempotent).
 *   2. launchRemoteMonitord() — start monitord on the VPS over a one-shot ssh
 *                               exec, but ONLY once the monitord-owned tunnel
 *                               reports connected (chatsd on the VPS FATALs
 *                               without NATS, which only reaches it through the
 *                               reverse forward).
 *   3. keepalive              — re-run launchRemoteMonitord() periodically
 *                               (pgrep-guarded) so a crashed VPS monitord is
 *                               brought back; tear the remote stack down when
 *                               the operator de-toggles offload.
 *
 * The tunnel's own connectivity is reported separately by monitord through
 * /manager.api/tunnel/status (see AmigoDaemons::checkRemoteTunnelStatus), so
 * this worker does not write a status file anymore.
 *
 * Registered under WorkerSafeScriptsCore::CHECK_BY_PID_NOT_ALERT (see
 * CTIClientConf::getModuleWorkers()), so start() blocks for the worker's
 * lifetime — if it returns, the supervisor sees a dead PID and respawns it.
 * On SIGTERM we simply exit: the VPS monitord and the monitord-owned tunnel
 * keep running and are picked up again on the next spawn.
 *
 * TODO: encrypt remote_ssh_key at rest (planned follow-up per
 *       docs/REMOTE_MESSENGERS_VPS.md §16).
 */
class WorkerRemoteTunnel extends WorkerBase
{
    private const MODULE_UNIQUE_ID = 'ModuleCTIClient';
    private const BACKOFF_MIN_SECONDS = 2;
    private const BACKOFF_MAX_SECONDS = 60;
    private const POLL_INTERVAL_SECONDS = 5;

    /**
     * How long to wait for the monitord-owned tunnel to report connected before
     * giving up this iteration and backing off (the Go side dials + retries on
     * its own; we just gate the remote monitord launch on it).
     */
    private const TUNNEL_WAIT_SECONDS = 40;

    /**
     * Hard ceiling on the worker's lifetime. The supervisor (WorkerSafeScripts)
     * respawns workers whose PID file goes away; periodically returning lets it
     * pick up code/config changes that we may have missed via signals.
     */
    private const MAX_LIFETIME_SECONDS = 3600;

    public function start($argv): void
    {
        if (!PbxExtensionUtils::isEnabled(self::MODULE_UNIQUE_ID)) {
            return;
        }

        $deadline = time() + self::MAX_LIFETIME_SECONDS;
        $backoff = self::BACKOFF_MIN_SECONDS;

        while (time() < $deadline && !$this->needRestart) {
            // Re-read settings every iteration so the operator can toggle
            // services and have us pick it up without a full daemon restart.
            $cti = new AmigoDaemons();
            $services = $cti->getRemoteServices();
            $ssh = $cti->getRemoteSshParams();

            if (empty($services) || $ssh === null) {
                // Offload off / not configured. Don't exit (the supervisor would
                // respawn us immediately for nothing) — just idle.
                $this->sleepInterruptible(self::POLL_INTERVAL_SECONDS);
                continue;
            }

            // 1. Provisioning — idempotent. Failure usually means the VPS is
            //    unreachable; back off and retry.
            $prov = $cti->provisionRemote();
            if (!$prov['ok']) {
                CriticalErrorsHandler::handleExceptionWithSyslog(
                    new \RuntimeException('remote provision: ' . $prov['error'])
                );
                $this->sleepInterruptible($backoff);
                $backoff = min($backoff * 2, self::BACKOFF_MAX_SECONDS);
                continue;
            }

            // 2. Wait for the monitord-owned tunnel to come up before launching
            //    the remote monitord (its chatsd needs NATS over the -R forward).
            if (!$this->waitTunnelConnected($cti)) {
                $this->sleepInterruptible($backoff);
                $backoff = min($backoff * 2, self::BACKOFF_MAX_SECONDS);
                continue;
            }

            // 3. Launch monitord on the VPS (pgrep-guarded, so it's a no-op when
            //    already running).
            $cti->launchRemoteMonitord();
            $backoff = self::BACKOFF_MIN_SECONDS;

            // 4. Keepalive: while offload stays enabled and the tunnel stays up,
            //    re-launch the remote monitord periodically (recovers a crash).
            //    On de-toggle, tear the remote stack down and restart the loop.
            while (!$this->needRestart && time() < $deadline) {
                $this->sleepInterruptible(self::POLL_INTERVAL_SECONDS);

                $ctiCheck = new AmigoDaemons();
                if (empty($ctiCheck->getRemoteServices()) || $ctiCheck->getRemoteSshParams() === null) {
                    // Operator disabled offload — stop the remote stack and
                    // fall back to the idle outer loop.
                    $ctiCheck->stopRemoteServices();
                    break;
                }

                if (!$ctiCheck->isRemoteTunnelConnected()) {
                    // Tunnel dropped — stop hammering ssh; the outer loop waits
                    // for it to come back before relaunching.
                    break;
                }

                $ctiCheck->launchRemoteMonitord();
            }
        }
    }

    /**
     * Poll the monitord tunnel status until it reports connected, the worker is
     * asked to restart, or the timeout elapses.
     */
    private function waitTunnelConnected(AmigoDaemons $cti): bool
    {
        $deadline = time() + self::TUNNEL_WAIT_SECONDS;
        while (!$this->needRestart && time() < $deadline) {
            if ($cti->isRemoteTunnelConnected()) {
                return true;
            }
            $this->sleepInterruptible(self::POLL_INTERVAL_SECONDS);
        }
        return false;
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
