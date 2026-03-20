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
use MikoPBX\Common\Providers\ManagedCacheProvider;
use MikoPBX\Core\Workers\WorkerBase;

require_once 'Globals.php';

class WorkerLogRotate extends WorkerBase
{
    public function start($argv): void
    {
        $cacheKey =  'Workers:WorkerLogRotate:lastCTIWorkerLogRotateProcessing';
        $managedCache = $this->di->get(ManagedCacheProvider::SERVICE_NAME);
        $lastLogRotate = $managedCache->get($cacheKey);
        if ($lastLogRotate===null){
            $cti = new AmigoDaemons();
            $cti->deleteOldLogs();
            $managedCache->set($cacheKey, time(), 3600);
        }
    }
}

// Start worker process
$workerClassname = WorkerLogRotate::class;
if (isset($argv) && count($argv) > 1) {
    cli_set_process_title($workerClassname);
    try {
        $worker = new $workerClassname();
        $worker->start($argv);
    } catch (\Throwable $e) {
        CriticalErrorsHandler::handleExceptionWithSyslog($e);
    }
}




