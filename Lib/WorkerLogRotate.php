<?php
/**
 * Copyright © MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Alexey Portnov, 2 2020
 */

namespace Modules\ModuleCTIClient\Lib;

use MikoPBX\Common\Providers\ManagedCacheProvider;
use MikoPBX\Core\System\Util;
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
        global $errorLogger;
        $errorLogger->captureException($e);
        Util::sysLogMsg("{$workerClassname}_EXCEPTION", $e->getMessage());
    }
}




