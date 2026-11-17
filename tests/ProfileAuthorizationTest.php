<?php
namespace MikoPBX\AdminCabinet\Controllers { class BaseController { public $view; public $request; public $response; public $di; public $db; } }
namespace Phalcon\Mvc { class View { const LEVEL_NO_RENDER = 0; } }
namespace Modules\ModuleCTIClient\Lib { class MikoPBXVersion { public static $modern = true; static function isPhalcon512Version() { return self::$modern; } } }
namespace MikoPBX\Common\Models {
    class Extensions {
        public static $found = true;
        public $ExternalPhones; public $number;
        static function findFirst($params) {
            if (isset($params['bind']['userid'])) {
                if ($params['bind']['userid'] !== '110') { throw new \Exception('Wrong legacy mobile owner'); }
                $extension = new self(); $extension->ExternalPhones = new ExternalPhones(); return $extension;
            }
            if ($params['bind']['number'] !== '205') { throw new \Exception('Unverified DB identity'); }
            return self::$found ? (object)['userid' => '110'] : false;
        }
        function save() { Users::$mutations++; return true; }
    }
    class ExternalPhones {
        public $extension; public $dialstring;
        function save() { return true; }
    }
    class Users {
        public static $mutations = 0;
        public $avatar; public $email;
        static function findFirstById($id) { return new self(); }
        function save() { self::$mutations++; return true; }
    }
}
namespace {
require dirname(__DIR__) . '/Lib/UserListFilter.php';
require dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php';
class ProfileRequest {
    public $peer = '127.0.0.1'; public $identity = '205'; public $id = '110'; public $raw = 'id=110&img=data&newMobile=123';
    public $contentType = 'application/x-www-form-urlencoded';
    function isPost() { return true; }
    function getServer($key) { return $this->peer; }
    function getHeader($key) { return $key === 'X-CTI-User' ? $this->identity : $this->contentType; }
    function getRawBody() { return $this->raw; }
    function getPost($key) { return $key === 'id' ? $this->id : '123'; }
}
class ProfileResponse {
    public $code = 200; public $body;
    function setStatusCode($code) { $this->code = $code; }
    function setContentType($type, $charset) {}
    function setContent($body) { $this->body = $body; }
}
class ProfileRest {
    public $mutations = 0;
    function get($service, $args) {
        if ($service !== 'restAPIClient' || $args[0] !== '/pbxcore/api/v3/employees/110') { throw new Exception('Wrong user mutation'); }
        $this->mutations++;
        return (object)['success' => true];
    }
}
$failures = [];
foreach ([true, false] as $modern) {
    \Modules\ModuleCTIClient\Lib\MikoPBXVersion::$modern = $modern;
    foreach (['updateUserAvatarAction', 'updateUserMobileAction', 'updateUserEmailAction'] as $action) {
        $cases = [
            ['own', '127.0.0.1', '205', '110', 'id=110', true],
            ['ipv6', '::1', '205', '110', 'id=110', true],
            ['foreign', '127.0.0.1', '205', '111', 'id=111', false],
            ['ext-not-userid', '127.0.0.1', '205', '205', 'id=205', false],
            ['absent', '127.0.0.1', '', '110', 'id=110', false],
            ['spoofed', '192.0.2.1', '205', '110', 'id=110', false],
            ['direct-admin-unproven', '192.0.2.1', '', '110', 'id=110', false],
            ['duplicate', '127.0.0.1', '205', '110', 'id=111&id=110', false],
            ['encoded-duplicate', '127.0.0.1', '205', '110', 'id=111&%69d=110', false],
            ['same-duplicate', '127.0.0.1', '205', '110', 'id=110&id=110', false],
            ['normalized-key', '127.0.0.1', '205', '110', 'id=110&+id=110', false],
            ['nul-key', '127.0.0.1', '205', '110', 'id=110&id%00=110', false],
            ['missing-id', '127.0.0.1', '205', null, 'img=123', false],
            ['malformed-identity', '127.0.0.1', '205x', '110', 'id=110', false],
            ['array', '127.0.0.1', '205', ['110'], 'id[]=110', false],
            ['mixed-array', '127.0.0.1', '205', '110', 'id[]=111&id=110', false],
            ['encoded-array', '127.0.0.1', '205', '110', 'id%5B%5D=111&id=110', false],
            ['wrong-content-type', '127.0.0.1', '205', '110', 'id=110', false],
            ['empty', '127.0.0.1', '205', '', 'id=', false],
            ['path', '127.0.0.1', '205', '../110', 'id=../110', false],
            ['missing-body-id', '127.0.0.1', '205', '110', 'img=123', false],
            ['unknown-owner', '127.0.0.1', '205', '110', 'id=110', false],
        ];
        foreach ($cases as [$name, $peer, $identity, $id, $raw, $allowed]) {
            $c = new \Modules\ModuleCTIClient\App\Controllers\ModuleCTIClientController();
            $c->request = new ProfileRequest();
            $c->request->peer = $peer; $c->request->identity = $identity; $c->request->id = $id;
            $c->request->raw = $raw . '&img=data%3Aimage%2Fpng%3Bbase64%2Cabc&newMobile=123&email=test%40local';
            if ($name === 'wrong-content-type') { $c->request->contentType = 'application/json'; }
            $c->view = new class { function setRenderLevel($level) {} };
            $c->response = new ProfileResponse(); $c->di = new ProfileRest();
            $c->db = new class { function begin() {} function commit() {} function rollback() {} };
            \MikoPBX\Common\Models\Users::$mutations = 0;
            \MikoPBX\Common\Models\Extensions::$found = $name !== 'unknown-owner';
            try {
                $c->$action();
                $mutations = $c->di->mutations + \MikoPBX\Common\Models\Users::$mutations;
                if ($allowed ? ($mutations !== 1 || $c->response->code !== 200) : ($mutations !== 0 || $c->response->code !== 403)) {
                    $failures[] = "$action/$name/modern=$modern: mutations=$mutations HTTP={$c->response->code}";
                }
            } catch (\Throwable $e) { $failures[] = "$action/$name/modern=$modern: " . $e->getMessage(); }
        }
    }
}
if ($failures) { throw new Exception(implode("\n", $failures)); }
echo "PASS ProfileAuthorization owner mapping, ambiguous ids, pre-mutation403 in both branches\n";
}
