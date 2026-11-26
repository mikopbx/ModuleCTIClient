<?php
// Real CTIClientConf hooks against a recording AmigoDaemons double: only the expected TLS setup-pending
// result may be absorbed; ordinary dispatch and genuine runtime faults must stay observable.
namespace MikoPBX\Modules\Config { class ConfigClass {} }
namespace MikoPBX\Common\Models { class PbxSettings {} }
namespace Modules\ModuleCTIClient\Models { class ModuleCTIClient {} }
namespace MikoPBX\PBXCoreREST\Lib { class PBXApiResult {} }
namespace MikoPBX\Core\Workers\Cron { class WorkerSafeScriptsCore { const CHECK_BY_PID_NOT_ALERT = 'pid'; } }
namespace MikoPBX\Core\System {
    class PBX { static function dialplanReload() { $GLOBALS['hookEvents'][] = 'dialplan'; } }
    class System { static function invokeActions($actions) { $GLOBALS['hookEvents'][] = 'actions:' . json_encode($actions); } }
    class Util { static function sysLogMsg($ident, $message, $level = 4) { $GLOBALS['hookEvents'][] = 'log'; $GLOBALS['hookLog'][] = $message; } }
}
namespace Modules\ModuleCTIClient\Lib {
    class AmigoDaemons {
        public function startAllServices(bool $restart = false): void {
            $GLOBALS['hookEvents'][] = 'start:' . ($restart ? '1' : '0');
            if (isset($GLOBALS['hookStart'])) { call_user_func($GLOBALS['hookStart']); }
        }
        public function clearParkedForServices(array $svcs): void { $GLOBALS['hookEvents'][] = 'parked:' . implode(',', $svcs); }
        public function applyMonitordConfigAndReconcile(): bool {
            $GLOBALS['hookEvents'][] = 'reconcile';
            if (isset($GLOBALS['hookReconcile'])) { call_user_func($GLOBALS['hookReconcile']); }
            return true;
        }
    }
}
namespace {
spl_autoload_register(function ($name) {
    $prefix = 'Modules\\ModuleCTIClient\\Lib\\';
    if (strpos($name, $prefix) === 0) { require dirname(__DIR__) . '/Lib/' . substr($name, strlen($prefix)) . '.php'; }
});
use Modules\ModuleCTIClient\Lib\CTIClientConf;

function hookExpect($condition, $message) { if (!$condition) { throw new RuntimeException($message); } }
function hookRun($callable, $start = null, $reconcile = null) {
    $GLOBALS['hookEvents'] = array(); $GLOBALS['hookLog'] = array(); $GLOBALS['hookStart'] = $start;
    $GLOBALS['hookReconcile'] = $reconcile;
    try { call_user_func($callable, new CTIClientConf()); return null; } catch (Throwable $e) { return $e; }
}
function hookPending($code) {
    // The real expected-failure factory; a plain RuntimeException is what the old code threw.
    return call_user_func(array('Modules\\ModuleCTIClient\\Lib\\CtiTlsSetupPending', 'exception'), $code);
}
$enable = function ($conf) { $conf->onAfterModuleEnable(); };
$save = function ($conf) {
    $conf->modelsEventChangeData(array('model' => 'Modules\\ModuleCTIClient\\Models\\ModuleCTIClient', 'recordId' => 1,
        'changedFields' => array('cti_tls_hostname')));
};
$boot = function ($conf) { $conf->onAfterPbxStarted(); };
$migration = function ($conf) {
    $conf->modelsEventChangeData(array('model' => 'Modules\\ModuleCTIClient\\Models\\ModuleCTIClient', 'recordId' => 1,
        'changedFields' => array('remote_whatsapp', 'remote_telegram')));
};
$cases = array(
    'normalEnableDispatchesStartOnce' => function () use ($enable) {
        $e = hookRun($enable);
        hookExpect($e === null && $GLOBALS['hookEvents'] === array('actions:{"manager":0}', 'start:0', 'dialplan'), 'enable order ' . json_encode($GLOBALS['hookEvents']) . ($e ? $e->getMessage() : ''));
    },
    'missingOrMismatchedTlsSetupDoesNotAbortEnable' => function () use ($enable) {
        foreach (array('invalid_hostname', 'tls_prepare_failed', 'source_unreadable', 'unsafe_state') as $code) {
            $e = hookRun($enable, function () use ($code) { throw hookPending($code); });
            hookExpect($e === null, $code . ' aborted enable: ' . ($e ? get_class($e) . ' ' . $e->getMessage() : ''));
            hookExpect($GLOBALS['hookEvents'] === array('actions:{"manager":0}', 'start:0', 'log', 'dialplan')
                && strpos($GLOBALS['hookLog'][0], $code) !== false, 'settings remain reachable, pending is logged: ' . json_encode($GLOBALS['hookEvents']));
        }
    },
    'genuineRuntimeFaultsStillAbortEnable' => function () use ($enable) {
        $faults = array(new RuntimeException('tls_binary_unsupported'), new RuntimeException('tls_start_failed'),
            new RuntimeException('invalid_hostname'), new LogicException('unrelated crash'), new Error('fatal'));
        foreach ($faults as $fault) {
            $e = hookRun($enable, function () use ($fault) { throw $fault; });
            hookExpect($e === $fault, 'unexpected fault must propagate unchanged: ' . get_class($fault) . ' ' . $fault->getMessage());
            hookExpect(!in_array('dialplan', $GLOBALS['hookEvents'], true), 'no success-path work after a genuine fault');
        }
    },
    'savePathAndBootFollowTheSameRule' => function () use ($save, $boot) {
        $e = hookRun($save);
        hookExpect($e === null && $GLOBALS['hookEvents'] === array('dialplan', 'start:1'), 'normal save restarts: ' . json_encode($GLOBALS['hookEvents']));
        $e = hookRun($save, function () { throw hookPending('tls_prepare_failed'); });
        hookExpect($e === null && in_array('start:1', $GLOBALS['hookEvents'], true), 'pending TLS does not turn a saved change into a failed request');
        $fault = new RuntimeException('tls_binary_unsupported');
        hookExpect(hookRun($save, function () use ($fault) { throw $fault; }) === $fault, 'save path keeps genuine faults');
        hookExpect(hookRun($boot) === null && $GLOBALS['hookEvents'] === array('start:0'), 'boot dispatch');
        hookExpect(hookRun($boot, function () { throw hookPending('invalid_hostname'); }) === null, 'boot with no address yet');
        hookExpect(hookRun($boot, function () use ($fault) { throw $fault; }) === $fault, 'boot keeps genuine faults');
    },
);
$cases['migrationOnlySaveStaysTheBaselineInPlaceReconcile'] = function () use ($migration) {
    // Migration-only Save never touches TLS selection: baseline in-place reconcile, no restart, faults propagate.
    $e = hookRun($migration);
    hookExpect($e === null && $GLOBALS['hookEvents'] === array('dialplan', 'parked:chats,tg', 'reconcile'), 'in-place reconcile: ' . json_encode($GLOBALS['hookEvents']));
    foreach (array(new RuntimeException('unsafe_state'), new Error('fatal')) as $fault) {
        $e = hookRun($migration, null, function () use ($fault) { throw $fault; });
        hookExpect($e === $fault, 'reconcile fault propagates: ' . get_class($fault));
    }
};
$cases['watchdogWorkerAbsorbsOnlyTheTypedPendingState'] = function () {
    $source = file_get_contents(dirname(__DIR__) . '/Lib/WorkerSafeScript.php');
    hookExpect(preg_match('/try \{\s*\$cti->startAllServices\(\);\s*\} catch \(CtiTlsSetupPending \$pending\) \{/', $source) === 1
        && substr_count($source, 'catch (CtiTlsSetupPending') === 1, 'watchdog start absorbs only the typed pending state');
};
$fail = 0;
foreach ($cases as $name => $case) {
    try { $case(); echo 'PASS ' . $name . "\n"; }
    catch (Throwable $e) { ++$fail; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
}
echo $fail ? "FAILED $fail\n" : "PASS CtiEnableHook\n";
exit($fail ? 1 : 0);
}
