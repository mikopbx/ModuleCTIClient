<?php
namespace MikoPBX\AdminCabinet\Controllers { class BaseController { public $view; public $request; public $response; public $di; } }
namespace Phalcon\Mvc { class View { const LEVEL_NO_RENDER = 0; } }
namespace MikoPBX\Common\Models {
    class PbxSettings { static function getValueByKey($key) { return ''; } }
}
namespace {
require dirname(__DIR__) . '/Lib/UserListFilter.php';
require dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php';
class PrivacyRequest {
    public $peer; public $identity;
    function getServer($key) { return $this->peer; }
    function getHeader($key) { return $key === 'X-CTI-User' ? $this->identity : ''; }
}
class PrivacyQuery {
    function createBuilder($parameters) { return $this; }
    function getQuery() { return $this; }
    function execute() {
        $rows = [];
        foreach (['205', '206'] as $n) {
            $rows[] = (object)['type' => 'SIP', 'userid' => (string)((int)$n - 95), 'number' => $n,
                'secret' => 'secret-' . $n, 'username' => 'User', 'email' => 'private@test',
                'avatar' => '', 'transport' => 'udp', 'dtmfmode' => 'rfc2833'];
            $rows[] = (object)['type' => 'EXTERNAL', 'userid' => (string)((int)$n - 95), 'number' => 'private-mobile'];
        }
        return $rows;
    }
    function get($name) { return $this; }
}
$c = new \Modules\ModuleCTIClient\App\Controllers\ModuleCTIClientController();
$c->di = new PrivacyQuery();
$c->view = new class { function setRenderLevel($level) {} };
$c->response = new class {
    public $body;
    function setContentType($type, $charset) {}
    function setContent($body) { $this->body = $body; }
};
foreach ([['127.0.0.1','',false], ['::1','205',true], ['127.0.0.1','205',true], ['192.0.2.1','205',false], ['127.0.0.1:80','205',false], ['127.0.0.1','999',false]] as [$peer,$identity,$own]) {
    $c->request = new PrivacyRequest(); $c->request->peer = $peer; $c->request->identity = $identity;
    $c->getExtensionsAction();
    $rows = json_decode($c->response->body, true);
    foreach (['secret','email','mobile'] as $private) {
        if (($rows[0][$private] !== '') !== $own || $rows[1][$private] !== '') { throw new Exception("$peer/$identity leaks $private"); }
    }
    if ($rows[0]['userid'] !== '110' || $rows[1]['number'] !== '206') { throw new Exception('Directory damaged'); }
}
echo "PASS GetExtensionsPrivacy actual controller filters absent/integration, verified own, foreign and spoofed identity\n";
}
