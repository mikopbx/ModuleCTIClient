<?php
// Частичный POST /pbx/setup от ключа интеграции 1С (gnatsd ставит
// X-CTI-Setup-Source: integration) пишет только 8 полей мастера автонастройки.
// Запуск: php tests/IntegrationSetupSourceTest.php
namespace MikoPBX\Modules\Models {
    class ModulesModelsBase implements \IteratorAggregate {
        public static $record;
        public static $saved = 0;
        public static function findFirst() { return self::$record; }
        public function getIterator(): \Traversable { return new \ArrayIterator(get_object_vars($this)); }
        public function toArray() { return get_object_vars($this); }
        public function save() { ++self::$saved; self::$record = $this; return true; }
    }
}
namespace MikoPBX\AdminCabinet\Controllers {
    class BaseController { public $request; public $flash; public $view; public $translation; }
}
namespace Modules\ModuleCTIClient\Lib {
    class AmigoDaemons {
        public function getActiveRemoteMigrationServices() { return array(); }
        public function getRemoteServices() { return array(); }
        public function getRoutedRemoteServices() { return array(); }
        public function getRemoteServicesFromSettings($settings) { return array(); }
    }
}
namespace {
    require dirname(__DIR__) . '/Lib/CrmTypes.php';
    require dirname(__DIR__) . '/Lib/SecurityMode.php';
    require dirname(__DIR__) . '/Lib/TlsCertificateInspector.php';
    require dirname(__DIR__) . '/Models/ModuleCTIClient.php';
    require dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php';

    class SetupSourceRequest {
        private $data;
        private $server;
        public function __construct($data, $server) { $this->data = $data; $this->server = $server; }
        public function isPost() { return true; }
        public function getPost() { return $this->data; }
        public function getServer($name) { return isset($this->server[$name]) ? $this->server[$name] : null; }
    }
    class SetupSourceFlash {
        public $errors = array();
        public function error($message) { $this->errors[] = $message; }
        public function success($message) {}
    }
    class SetupSourceTranslation { public function _($key) { return $key; } }
    function setupSourceAssert($condition, $message) { if (!$condition) { throw new \RuntimeException($message); } }

    /** @return array{0: \Modules\ModuleCTIClient\Models\ModuleCTIClient, 1: array, 2: object} */
    function setupSourceSave(array $post, $source) {
        $record = new \Modules\ModuleCTIClient\Models\ModuleCTIClient();
        $record->id = '1';
        $record->crm_type = '1c';
        $record->security_mode = 'strict';
        $record->remote_host = 'stored.example';
        $record->cti_tls_hostname = 'pbx.test';
        $record->database = 'old-db';
        $record->debug_mode = '0';
        $before = $record->toArray();
        \MikoPBX\Modules\Models\ModulesModelsBase::$record = $record;
        \MikoPBX\Modules\Models\ModulesModelsBase::$saved = 0;
        $controller = new \Modules\ModuleCTIClient\App\Controllers\ModuleCTIClientController();
        $server = $source === null ? array() : array('HTTP_X_CTI_SETUP_SOURCE' => $source);
        $controller->request = new SetupSourceRequest($post, $server);
        $controller->flash = new SetupSourceFlash();
        $controller->view = new \stdClass();
        $controller->translation = new SetupSourceTranslation();
        $controller->saveAction();
        return array(\MikoPBX\Modules\Models\ModulesModelsBase::$record, $before, $controller);
    }

    function setupSourceChanged(array $before, $record) {
        $changed = array();
        foreach ($record->toArray() as $key => $value) {
            if (!array_key_exists($key, $before) || $before[$key] !== $value) { $changed[] = $key; }
        }
        sort($changed);
        return $changed;
    }

    $forged = array('remote_host' => 'evil.example', 'security_mode' => 'legacy_compatible',
        'allow_legacy_clients' => 'on', 'crm_type' => 'none', 'cti_full_form' => '1', 'debug_mode' => 'on',
        'remote_whatsapp' => 'on', 'cti_tls_hostname' => 'evil.example', 'nats_password' => 'x');

    $tests = array();
    $tests['integrationSourceWritesOnlyDatabase'] = function () use ($forged) {
        list($record, $before, $controller) = setupSourceSave($forged + array('database' => 'new-db'), 'integration');
        setupSourceAssert($controller->view->success === true && !$controller->flash->errors,
            'forged fields ignored silently');
        $changed = setupSourceChanged($before, $record);
        setupSourceAssert($changed === array('database'), 'only database changed, got: ' . implode(',', $changed));
        setupSourceAssert($record->database === 'new-db', 'database saved');
    };
    $tests['integrationSourceWritesWizardFields'] = function () use ($forged) {
        $wizard = array('auto_settings_mode' => 'on', 'web_service_mode' => 'on', 'server1chost' => 'crm.example',
            'server1cport' => '443', 'server1c_scheme' => 'https', 'database' => 'base', 'login' => 'WebService',
            'secret' => 'wizard-secret');
        list($record, $before, $controller) = setupSourceSave($forged + $wizard, 'integration');
        $changed = setupSourceChanged($before, $record);
        $expected = array('database', 'login', 'secret', 'server1c_scheme', 'server1chost', 'server1cport',
            'web_service_mode');
        setupSourceAssert($changed === $expected, 'wizard fields only, got: ' . implode(',', $changed));
        setupSourceAssert($record->web_service_mode === '1' && $record->auto_settings_mode === '1'
            && $record->server1cport === '443' && $record->secret === 'wizard-secret',
            'wizard values normalized as before');
        setupSourceAssert($record->security_mode === 'strict' && $record->crm_type === '1c'
            && $record->remote_host === 'stored.example' && $record->cti_tls_hostname === 'pbx.test',
            'protected fields kept');
    };
    $tests['fullAdminFormUnchanged'] = function () {
        $post = array('cti_full_form' => '1', 'allow_legacy_clients' => 'on', 'crm_type' => 'none',
            'database' => 'admin-db', 'remote_host' => 'admin.example');
        list($record, $before, $controller) = setupSourceSave($post, null);
        setupSourceAssert($controller->view->success === true, 'admin form saved');
        setupSourceAssert($record->security_mode === 'legacy_compatible' && $record->crm_type === 'none'
            && $record->database === 'admin-db' && $record->remote_host === 'admin.example',
            'full form writes all fields');
    };
    $tests['otherSourceValueKeepsLegacyPartialPost'] = function () {
        list($record, $before, $controller) = setupSourceSave(array('crm_type' => 'none', 'database' => 'x'), 'admin');
        setupSourceAssert($record->crm_type === 'none' && $record->database === 'x',
            'non-integration source is not filtered');
    };

    $failures = 0;
    foreach ($tests as $name => $test) {
        try { $test(); echo 'PASS ' . $name . "\n"; }
        catch (\Throwable $e) { ++$failures; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
    }
    exit($failures ? 1 : 0);
}
