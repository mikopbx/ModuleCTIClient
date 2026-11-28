<?php
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
namespace Phalcon\Forms {
    class Form {
        public $elements = array();
        public function add($element) { $this->elements[$element->name] = $element; }
    }
}
namespace Phalcon\Forms\Element {
    class Text { public $name; public function __construct($name, $attributes = array(), $options = array()) { $this->name = $name; } }
    class Numeric extends Text {} class Password extends Text {} class Radio extends Text {}
    class Select extends Text {} class Check extends Text {} class TextArea extends Text {}
}
namespace {
    require dirname(__DIR__) . '/Lib/CrmTypes.php';
    require dirname(__DIR__) . '/Lib/SecurityMode.php';
    require dirname(__DIR__) . '/Lib/TlsCertificateInspector.php';
    require dirname(__DIR__) . '/Models/ModuleCTIClient.php';
    require dirname(__DIR__) . '/App/Forms/ModuleCTIClientForm.php';
    require dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php';

    class HostnameRequest {
        private $data;
        public $headersRead = 0;
        public function __construct($data) { $this->data = $data; }
        public function isPost() { return true; }
        public function getPost() { return $this->data; }
        public function getHeader($name) { ++$this->headersRead; return 'attacker.example'; }
        public function getHttpHost() { ++$this->headersRead; return 'attacker.example'; }
        // saveAction читает только HTTP_X_CTI_SETUP_SOURCE; здесь заголовка нет.
        public function getServer($name) { return null; }
    }
    class HostnameFlash {
        public $errors = array();
        public function error($message) { $this->errors[] = $message; }
        public function success($message) {}
    }
    class HostnameTranslation { public function _($key) { return $key; } }
    function hostnameAssert($condition, $message) { if (!$condition) { throw new \RuntimeException($message); } }
    function hostnameSave($data, $old = 'old.test') {
        $record = new \Modules\ModuleCTIClient\Models\ModuleCTIClient();
        // Dynamic assignment is only needed for the RED baseline without the new column.
        if (property_exists($record, 'cti_tls_hostname')) { $record->cti_tls_hostname = $old; }
        \MikoPBX\Modules\Models\ModulesModelsBase::$record = $record;
        \MikoPBX\Modules\Models\ModulesModelsBase::$saved = 0;
        $controller = new \Modules\ModuleCTIClient\App\Controllers\ModuleCTIClientController();
        $controller->request = new HostnameRequest($data);
        $controller->flash = new HostnameFlash();
        $controller->view = new \stdClass();
        $controller->translation = new HostnameTranslation();
        $_SERVER['HTTP_HOST'] = 'attacker.example';
        $controller->saveAction();
        hostnameAssert($controller->request->headersRead === 0, 'Host header must not be read');
        return array($record, $controller, \MikoPBX\Modules\Models\ModulesModelsBase::$saved);
    }
    $tests = array();
    $tests['modelSchemaAndForm'] = function () {
        $r = new \ReflectionClass('Modules\\ModuleCTIClient\\Models\\ModuleCTIClient');
        hostnameAssert($r->hasProperty('cti_tls_hostname'), 'hostname model column missing');
        $p = $r->getProperty('cti_tls_hostname');
        hostnameAssert(strpos($p->getDocComment(), '@Column') !== false, 'annotation-driven setup column');
        hostnameAssert($r->getDefaultProperties()['cti_tls_hostname'] === '', 'hostname default must be empty, not PBXName');
        $form = new \Modules\ModuleCTIClient\App\Forms\ModuleCTIClientForm();
        $form->initialize(new \Modules\ModuleCTIClient\Models\ModuleCTIClient());
        hostnameAssert(isset($form->elements['cti_tls_hostname']), 'hostname form element missing');
        $setup = file_get_contents(dirname(__DIR__) . '/Setup/PbxExtensionSetup.php');
        hostnameAssert(strpos($setup, '$this->createSettingsTableByModelsAnnotations()') !== false, 'normal setup schema mechanism');
    };
    $tests['canonicalHostnamePersistence'] = function () {
        list($record, $controller, $saved) = hostnameSave(array('cti_tls_hostname' => 'PBX.TEST.'));
        hostnameAssert(($record->cti_tls_hostname ?? null) === 'pbx.test' && $saved === 1 && $controller->view->success, 'PBX.TEST. -> pbx.test');
    };
    $tests['emptyHostnameDeferredToApply'] = function () {
        list($record, $controller, $saved) = hostnameSave(array('cti_tls_hostname' => ''));
        hostnameAssert(($record->cti_tls_hostname ?? null) === '' && $saved === 1, 'empty save allowed, apply must later report missing_hostname');
        hostnameAssert(\Modules\ModuleCTIClient\Lib\TlsCertificateInspector::normalizeHostname($record->cti_tls_hostname) === null, 'empty cannot become a usable apply hostname');
    };
    $tests['partialPostPreservesHostname'] = function () {
        foreach (array(array('server1chost' => 'crm.test'), array('cti_full_form' => '1', 'server1chost' => 'crm.test')) as $data) {
            list($record, $controller, $saved) = hostnameSave($data);
            hostnameAssert(($record->cti_tls_hostname ?? null) === 'old.test' && $saved === 1, 'omitted hostname preserved even full marker');
            hostnameAssert($record->server1chost === 'crm.test', 'partial wizard fields still saved');
        }
    };
    $tests['hostHeaderIgnoredForNewSettings'] = function () {
        list($record, $controller, $saved) = hostnameSave(array('server1chost' => 'crm.test'), '');
        hostnameAssert(($record->cti_tls_hostname ?? null) === '' && $saved === 1, 'Host header is not a hostname default');
    };
    $tests['invalidHostnameRejectedAtomically'] = function () {
        foreach (array('.', 'pbx.test..', 'https://pbx.test', 'pbx.test:443', 'pbx.test/path', '*.pbx.test',
            "pbx.test\n", ' pbx.test', 'pbx.test ', 'localhost', 'пбх.test', array('pbx.test'), null, 12,
            '127.0.0.1.', '127.1', '0x7f.0.0.1', '010.0.0.1', '1.2.3', '2130706433', '127.0.0.1:8223', 'https://127.0.0.1',
            '[2001:db8::1]', 'fe80::1%eth0', '2001:db8::1.', '[::1]:443', '::g') as $value) {
            list($record, $controller, $saved) = hostnameSave(array('cti_tls_hostname' => $value, 'server1chost' => 'changed.test'));
            hostnameAssert($saved === 0 && $controller->view->success === false, 'invalid input must reject POST');
            hostnameAssert(($record->cti_tls_hostname ?? null) === 'old.test' && $record->server1chost === '', 'invalid POST cannot partially mutate');
            hostnameAssert(in_array('invalid_hostname', $controller->flash->errors, true), 'clear invalid_hostname error');
        }
    };
    $tests['bareCanonicalIpPersistence'] = function () {
        foreach (array('192.0.2.1' => '192.0.2.1', '2001:db8::1' => '2001:db8::1', '2001:DB8:0:0:0:0:0:1' => '2001:db8::1',
            '::1' => '::1') as $input => $expected) {
            list($record, $controller, $saved) = hostnameSave(array('cti_tls_hostname' => $input));
            hostnameAssert(($record->cti_tls_hostname ?? null) === $expected && $saved === 1 && $controller->view->success,
                'IP address saved in binary-canonical form: ' . $input);
        }
    };
    $tests['punycodeAndLengthPolicy'] = function () {
        $max = str_repeat('a', 63) . '.' . str_repeat('b', 63) . '.' . str_repeat('c', 63) . '.' . str_repeat('d', 61);
        foreach (array('XN--E1AFMKFD.TEST.' => 'xn--e1afmkfd.test', $max . '.' => $max) as $input => $expected) {
            list($record, $controller, $saved) = hostnameSave(array('cti_tls_hostname' => $input));
            hostnameAssert(($record->cti_tls_hostname ?? null) === $expected && $saved === 1, 'canonical FQDN length/punycode');
        }
    };
    $failures = 0;
    foreach ($tests as $name => $test) {
        try { $test(); echo 'PASS ' . $name . "\n"; }
        catch (\Throwable $e) { ++$failures; echo 'FAIL ' . $name . ': ' . $e->getMessage() . "\n"; }
    }
    exit($failures ? 1 : 0);
}
