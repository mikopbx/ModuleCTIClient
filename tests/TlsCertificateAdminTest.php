<?php
// Controller boundary of the public certificate panel: live admin GUI session + module ACL first, GET-only public facts and
// public PEM downloads, no regenerate/CSRF/privileged action, saved address read through the ordinary model (no narrow projection).
namespace {
ob_start();
error_reporting(E_ALL & ~E_DEPRECATED);

class AdminFacts {
    public static $reads = 0, $downloads = 0, $status, $pem = null, $constructed = array();
    public static function reset() {
        self::$reads = self::$downloads = 0; self::$pem = null; self::$constructed = array();
        self::$status = array('state' => 'unknown', 'source' => 'previous', 'hostname' => 'pbx.test', 'configured' => array('sha256' => str_repeat('c', 64), 'selfSigned' => true),
            'configuredGeneration' => str_repeat('c', 64), 'runtime' => array(), 'errorCode' => null, 'downloads' => array('server'),
            'trust' => array('kind' => 'self_signed', 'rootAvailable' => false));
    }
}
function expectAdmin($v, $name) { if (!$v) throw new \Exception($name); }
function adminCase($name, $f) { try { $f(); echo "PASS $name\n"; } catch (\Throwable $e) { $GLOBALS['failures']++; echo "FAIL $name: " . $e->getMessage() . "\n"; } }
}
namespace Modules\ModuleCTIClient\Lib {
class CtiTlsStatus {
    public function __construct($confDir, $moduleDir, $options = array()) {
        if ($options) throw new \Exception('request constructor options');
        \AdminFacts::$constructed = array($confDir, $moduleDir);
    }
    public function read($address) { \AdminFacts::$reads++; if ($address !== 'pbx.test') throw new \Exception('untrusted address ' . $address); return \AdminFacts::$status; }
    public function download($kind, $sha, $address) {
        \AdminFacts::$downloads++;
        if ($address !== 'pbx.test' || $sha !== \AdminFacts::$status['configured']['sha256'] || !in_array($kind, \AdminFacts::$status['downloads'], true)) throw new \RuntimeException('certificate_conflict');
        return \AdminFacts::$pem !== null ? \AdminFacts::$pem : "-----BEGIN CERTIFICATE-----\nPUBLIC-" . $kind . "\n-----END CERTIFICATE-----\n";
    }
}
class AmigoDaemons { public function __construct() { throw new \Exception('Amigo construction is forbidden'); } }
class TlsCertificateInspector {
    public static function normalizeEndpoint($s, $root = false) { return $s; }
    public static function exportPublic($s) { if (strpos($s, 'PRIVATE KEY') !== false) throw new \RuntimeException('private-key access'); return $s; }
}
}
namespace Phalcon\Http { interface ResponseInterface {} }
namespace Phalcon\Mvc { class Dispatcher {} }
namespace MikoPBX\AdminCabinet\Controllers { class BaseController {public function afterExecuteRoute(\Phalcon\Mvc\Dispatcher $d): \Phalcon\Http\ResponseInterface {throw new \Exception("parent would append JSON/HTML");}} class SessionController { const SESSION_ID='authAdminCabinet'; const ROLE='role'; } }
namespace MikoPBX\Common\Providers { class AclProvider { const SERVICE_NAME='acl'; const ROLE_GUESTS='guests'; } }
namespace MikoPBX\Modules { class PbxExtensionUtils { public static function getModuleDir($id) { return '/opt/modules/ModuleCTIClient'; } } }
namespace Modules\ModuleCTIClient\Models { class ModuleCTIClient { public static function findFirst($options = null) {
    if ($options !== null) throw new \Exception('narrow projection read');
    return (object)array('cti_tls_hostname' => 'pbx.test'); } } }
namespace {
class SessionStub { public $data=array('authAdminCabinet'=>array('role'=>'admins')); public function get($k) { return isset($this->data[$k])?$this->data[$k]:null; } public function set($k,$v) {$this->data[$k]=$v;} public function has($k) {return isset($this->data[$k]);} }
class AclStub { public $allow=true; public function isAllowed($role,$class,$action) { return $this->allow && $role === 'admins'; } }
class JwtStub {public $role='admins',$user='admin';public function extractRoleFromRefreshToken($t){return $t==='live-token'?$this->role:null;}public function extractUserIdFromRefreshToken($t){return $t==='live-token'?$this->user:null;}}
class CookieStub {public $token=null;public function has($k){return $k==='refreshToken'&&$this->token!==null;}public function get($k){return $this;}public function getValue(){return $this->token;}}
class DiStub { public $acl,$jwt=null; public function __construct() {$this->acl=new AclStub;} public function has($k) {return $k==='acl'||($k==='jwt'&&$this->jwt!==null);} public function get($k) {return $k==='jwt'?$this->jwt:$this->acl;} public function getShared($k) {return $this->get($k);} }
class RequestStub { public $method='GET',$data=array(); public function isGet(){return $this->method==='GET';} public function isPost(){return $this->method==='POST';} public function getQuery($k){return isset($this->data[$k])?$this->data[$k]:null;} public function getPost($k){return $this->getQuery($k);} }
class ResponseStub implements \Phalcon\Http\ResponseInterface { public $code=200,$body='',$headers=array(); public function setStatusCode($c,$reason=null){$this->code=$c;return $this;} public function setHeader($k,$v){$this->headers[$k]=$v;return $this;} public function setContentType($v,$charset=null){return $this->setHeader('Content-Type',$v);} public function setContent($v){$this->body=$v;return $this;} public function setJsonContent($v){$this->body=json_encode($v);return $this;} public function send(){return $this;} }
class ViewStub {public function disable(){} }
require dirname(__DIR__).'/App/Controllers/ModuleCTIClientController.php';
function makeAdmin() { $r=new \ReflectionClass('Modules\\ModuleCTIClient\\App\\Controllers\\ModuleCTIClientController');$c=$r->newInstanceWithoutConstructor();$c->session=new SessionStub;$c->di=new DiStub;$c->request=new RequestStub;$c->response=new ResponseStub;$c->view=new ViewStub;$c->cookies=new CookieStub;$p=$r->getProperty('moduleUniqueID');$p->setAccessible(true);$p->setValue($c,'ModuleCTIClient');return $c; }
function invokeAdmin($c,$cmd,$method='GET',$data=array()) { $c->request->method=$method;$c->request->data=$data;$c->response=new ResponseStub;$fn=array('tlsCertificateInfo'=>'tlsCertificateInfoAction','downloadTlsCertificate'=>'downloadTlsCertificateAction');$c->{$fn[$cmd]}(); return array($c->response->code,json_decode($c->response->body,true),$c->response->body,$c->response->headers); }
function removeAdmin($c){$c->session->data=array();}
function ordinaryAdmin($c){$c->session->data['authAdminCabinet']['role']='guests';}

AdminFacts::reset();$GLOBALS['failures']=0;
foreach (array('tlsCertificateInfo','downloadTlsCertificate') as $cmd) {
 foreach(array('anonymous','ordinary','ctiIntegrationToken','loopbackRelay') as $actor) {
 adminCase($actor.'Denied-'.$cmd,function()use($cmd,$actor){AdminFacts::reset();$c=makeAdmin();if($actor==='ordinary')ordinaryAdmin($c);else removeAdmin($c);$_SERVER['REMOTE_ADDR']='127.0.0.1';$_REQUEST['CTItoken']='scoped-token';$r=invokeAdmin($c,$cmd);expectAdmin($r[0]===403,'HTTP403');expectAdmin(AdminFacts::$reads===0 && AdminFacts::$downloads===0 && AdminFacts::$constructed===array(),'auth FIRST');});
 }
}
adminCase('adminInfoIsReadOnlyPublicFactsOnly',function(){AdminFacts::reset();$r=invokeAdmin(makeAdmin(),'tlsCertificateInfo');expectAdmin($r[0]===200 && $r[1]['ok']===true && $r[1]['certificateStatus']['configuredGeneration']===str_repeat('c',64),'authorized');expectAdmin(AdminFacts::$reads===1,'one read');expectAdmin(!isset($r[1]['csrf']) && !isset($r[1]['manualPreparation']) && !isset($r[1]['trustInstructions']),'no CSRF, privileged-preparation or command material');expectAdmin(strpos($r[2],'PRIVATE KEY')===false,'no key');expectAdmin(AdminFacts::$constructed===array('/etc/custom_modules/ModuleCTIClient','/opt/modules/ModuleCTIClient'),'status reads the protected config dir and the module dir');});
adminCase('savedAddressUsesTheOrdinaryModelRead',function(){AdminFacts::reset();$r=invokeAdmin(makeAdmin(),'tlsCertificateInfo');expectAdmin($r[0]===200,'a narrow columns projection would have thrown in the model stub');});
adminCase('infoPostDenied',function(){AdminFacts::reset();$r=invokeAdmin(makeAdmin(),'tlsCertificateInfo','POST');expectAdmin($r[0]===405&&AdminFacts::$reads===0,'GET only');});
foreach(array('unknown','mixed','error','pending') as $state) adminCase('runtime-'.$state,function()use($state){AdminFacts::reset();AdminFacts::$status['state']=$state;$r=invokeAdmin(makeAdmin(),'tlsCertificateInfo');expectAdmin($r[1]['certificateStatus']['state']===$state,'no false running');});
$download=array('kind'=>'server','leafSHA'=>str_repeat('c',64));
adminCase('serverDownloadIsExactPublicPem',function()use($download){AdminFacts::reset();$c=makeAdmin();$r=invokeAdmin($c,'downloadTlsCertificate','GET',$download);expectAdmin($r[0]===200,'download200');expectAdmin($r[2]==="-----BEGIN CERTIFICATE-----\nPUBLIC-server\n-----END CERTIFICATE-----\n",'exact PEM no JSON/HTML tail');expectAdmin(AdminFacts::$downloads===1,'one bound download');expectAdmin(strpos($r[3]['Content-Disposition'],'.cer"')!==false,'single certificate has a Windows filename');});
$bad=array(array(),array('kind'=>'../../private.key'),array('leafSHA'=>'../private.key'),array('leafSHA'=>'A'.str_repeat('a',63)),array('leafSHA'=>array('a')),array('leafSHA'=>''),array('kind'=>'private-key'));
foreach($bad as $i=>$changes) adminCase('pathOrMalformed-'.$i,function()use($download,$changes,$i){AdminFacts::reset();$c=makeAdmin();$data=$i===0?array():array_merge($download,$changes);$r=invokeAdmin($c,'downloadTlsCertificate','GET',$data);expectAdmin($r[0]===400,'HTTP400');expectAdmin(AdminFacts::$downloads===0 && AdminFacts::$constructed===array(),'validate before any read');});
adminCase('staleLeafOrUnofferedKindIsAConflict',function()use($download){AdminFacts::reset();$stale=$download;$stale['leafSHA']=str_repeat('e',64);$r=invokeAdmin(makeAdmin(),'downloadTlsCertificate','GET',$stale);expectAdmin($r[0]===409&&strpos($r[2],'PUBLIC-')===false,'stale leaf');$root=$download;$root['kind']='root';$r=invokeAdmin(makeAdmin(),'downloadTlsCertificate','GET',$root);expectAdmin($r[0]===409,'root not offered');});
adminCase('privateKeyNeverTransmitted',function()use($download){AdminFacts::reset();AdminFacts::$pem="-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----";$r=invokeAdmin(makeAdmin(),'downloadTlsCertificate','GET',$download);expectAdmin($r[0]===409&&strpos($r[2],'secret')===false,'secret excluded');});
adminCase('rootIsCerAndChainRemainsPem',function()use($download){AdminFacts::reset();AdminFacts::$status['downloads']=array('root','intermediates');foreach(array('root'=>'cer','intermediates'=>'pem') as $kind=>$ext){$request=$download;$request['kind']=$kind;$r=invokeAdmin(makeAdmin(),'downloadTlsCertificate','GET',$request);expectAdmin($r[0]===200&&strpos($r[3]['Content-Disposition'],'.'.$ext.'"')!==false,$kind.' filename');}});
adminCase('downloadPostDenied',function()use($download){AdminFacts::reset();$r=invokeAdmin(makeAdmin(),'downloadTlsCertificate','POST',$download);expectAdmin($r[0]===405&&AdminFacts::$downloads===0,'GET only');});
adminCase('downloadAfterExecuteRouteNoTail',function()use($download){AdminFacts::reset();$c=makeAdmin();$r=invokeAdmin($c,'downloadTlsCertificate','GET',$download);$response=$c->afterExecuteRoute(new \Phalcon\Mvc\Dispatcher);expectAdmin($response->body===$r[2],'no parent JSON/HTML');expectAdmin($response->headers['Content-Type']==='application/x-pem-file'&&$response->headers['Cache-Control']==='private, no-store','private PEM headers');});
foreach(array(null,'stale-token','live-token') as $cookie)adminCase('modernCookie-'.json_encode($cookie),function()use($cookie){AdminFacts::reset();$c=makeAdmin();$c->di->jwt=new JwtStub;$c->cookies->token=$cookie;$r=invokeAdmin($c,'tlsCertificateInfo');expectAdmin($r[0]===($cookie==='live-token'?200:403),'live Redis GUI only');if($cookie!=='live-token')expectAdmin(AdminFacts::$reads===0,'no reads');});
adminCase('modernOrdinaryAndModuleAclDenied',function(){foreach(array('guests','admins')as$role){AdminFacts::reset();$c=makeAdmin();$c->di->jwt=new JwtStub;$c->di->jwt->role=$role;$c->cookies->token='live-token';$c->di->acl->allow=false;$r=invokeAdmin($c,'tlsCertificateInfo');expectAdmin($r[0]===403&&AdminFacts::$reads===0,'actual ACL required');}});
adminCase('noPrivilegedOrRegenerateEntryPointRemains',function(){
 expectAdmin(!method_exists('Modules\\ModuleCTIClient\\App\\Controllers\\ModuleCTIClientController','regenerateTlsCertificateAction'),'regenerate action removed');
 $source=file_get_contents(dirname(__DIR__).'/App/Controllers/ModuleCTIClientController.php');
 foreach(array('posix_geteuid','CtiTlsIdentity','csrf','sudo','exec(','shell_exec') as $gone) expectAdmin(stripos($source,$gone)===false,'controller still references '.$gone);
 $acl=file_get_contents(dirname(__DIR__).'/Lib/ModuleCTIClientACL.php'); expectAdmin(strpos($acl,'regenerateTlsCertificate')===false,'ACL still lists regenerate');});

echo "Failures: ".$GLOBALS["failures"]."\n";exit($GLOBALS["failures"]?1:0);
}
