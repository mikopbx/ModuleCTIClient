<?php
namespace MikoPBX\AdminCabinet\Controllers { class BaseController { public $view; public $request; public $response; } }
namespace {
require dirname(__DIR__) . '/App/Controllers/ModuleCTIClientController.php';
$c = new \Modules\ModuleCTIClient\App\Controllers\ModuleCTIClientController();
$c->view = new class { function disable() {} };
$c->request = new class {
 function getServer($key) { return '192.0.2.10'; }
 function getPost($key) { throw new \Exception('External request reached credential lookup'); }
};
$c->response = new class {
 public $code = 200;
 function setStatusCode($code) { $this->code = $code; }
};
ob_start();
$c->checkSipAuthAction();
ob_end_clean();
if ($c->response->code !== 403) { throw new \Exception('External access not forbidden'); }
echo "PASS SIP auth rejects external requests before lookup\n";
}
