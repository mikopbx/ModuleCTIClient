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

namespace Modules\ModuleCTIClient\App\Controllers;

use MikoPBX\AdminCabinet\Controllers\BaseController;
use MikoPBX\Common\Models\Extensions;
use MikoPBX\Common\Models\ExternalPhones;
use MikoPBX\Common\Models\LanInterfaces;
use MikoPBX\Common\Models\PbxSettings;
use MikoPBX\Common\Models\Providers;
use MikoPBX\Common\Models\Sip;
use MikoPBX\Common\Models\Users;
use MikoPBX\Modules\PbxExtensionUtils;
use Modules\ModuleCTIClient\App\Forms\ModuleCTIClientForm;
use Modules\ModuleCTIClient\Lib\AmigoDaemons;
use Modules\ModuleCTIClient\Lib\MikoPBXVersion;
use Modules\ModuleCTIClient\Models\ModuleCTIClient;
use Phalcon\Mvc\Model\Resultset;
use Phalcon\Mvc\View;

use function MikoPBX\Common\Config\appPath;

class ModuleCTIClientController extends BaseController
{
    private const SECRET_MASK = '******';

    private $moduleUniqueID = 'ModuleCTIClient';
    private $moduleDir;

    /**
     * Initializes the module by setting the module directory, logo image path, and submit mode.
     * It also calls the parent's initialize method.
     */
    public function initialize(): void
    {
        $this->moduleDir = PbxExtensionUtils::getModuleDir($this->moduleUniqueID);

        // Set the logo image path using the module's unique ID
        $this->view->logoImagePath = "{$this->url->get()}assets/img/cache/{$this->moduleUniqueID}/logo.png";

        // Set the submit mode to null
        $this->view->submitMode = null;

        // Call the initialize method of the parent class
        parent::initialize();
    }


    /**
     * The index action of the module.
     * Adds JavaScript files to the footer collection, retrieves module settings,
     * initializes the view variables, and sets the view template.
     */
    public function indexAction(): void
    {
        // Get the footer collection for JavaScript files
        $footerCollection = $this->assets->collection('footerJS');

        // Add necessary JavaScript files to the footer collection
        $footerCollection->addJs('js/pbx/main/form.js', true);
        $footerCollection->addJs("js/cache/{$this->moduleUniqueID}/module-cti-client-status-worker.js", true);
        $footerCollection->addJs("js/cache/{$this->moduleUniqueID}/module-cti-client-index.js", true);

        // Retrieve module settings
        $settings = ModuleCTIClient::findFirst();

        // If no settings found, create a new instance
        if ($settings === null) {
            $settings = new ModuleCTIClient();
        }

        // Mask secrets before passing to form
        $this->maskSecretFields($settings);

        // Initialize view variables
        $this->view->form = new ModuleCTIClientForm($settings);
        $this->view->autoSettingsValue = $this->generateAutoSettingsString($settings);

        // Set the view template
        $this->view->pick("{$this->moduleDir}/App/Views/index");
    }

    /**
     * Masks sensitive data in settings before sending to the browser.
     * Replaces password inside proxy URL and mt_proxy_secret with a mask.
     *
     * @param ModuleCTIClient $settings
     */
    private function maskSecretFields(ModuleCTIClient $settings): void
    {
        // Mask password inside proxy URL: socks5://user:password@host:port -> socks5://user:******@host:port
        // Covers the legacy single field plus the per-messenger proxy fields —
        // each accepts a user:password URL and would otherwise echo the
        // password back to the web form in clear text.
        $proxyFields = [
            'chats_proxy_address',
            'whatsapp_proxy_address',
            'telegram_proxy_address',
            'max_proxy_address',
        ];
        foreach ($proxyFields as $field) {
            if (empty($settings->$field)) {
                continue;
            }
            $parsed = parse_url($settings->$field);
            if (isset($parsed['pass'])) {
                $settings->$field = str_replace(
                    ':' . $parsed['pass'] . '@',
                    ':' . self::SECRET_MASK . '@',
                    $settings->$field
                );
            }
        }

        // Mask MT Proxy secret
        if (!empty($settings->mt_proxy_secret)) {
            $settings->mt_proxy_secret = self::SECRET_MASK;
        }

        // Mask the remote VPS SSH private key — never echo it back to the web UI.
        if (!empty($settings->remote_ssh_key)) {
            $settings->remote_ssh_key = self::SECRET_MASK;
        }
    }

    /**
     * Generates the connections JSON and packs it into BASE64 format.
     *
     * @param ModuleCTIClient $dataSet The ModuleCTIClient data set.
     *
     * @return string The generated BASE64 string.
     */
    private function generateAutoSettingsString(ModuleCTIClient $dataSet): string
    {
        $ipAddresses = [];
        $ipAddresses[] = $this->request->getServerAddress();
        $internetInterfaces = LanInterfaces::find(['hydration' => Resultset::HYDRATE_ARRAYS]);

        $possibleAttributes = [
            'ipaddr',
            'extipaddr',
            'exthostname',
            'hostname',
        ];
        foreach ($internetInterfaces as $interface) {
            foreach ($interface as $key => $value) {
                if (
                    in_array($key, $possibleAttributes)
                    && !empty($value)
                    && !in_array($value, $ipAddresses)
                ) {
                    // Игнорируем порты, если они присутствуют в значении "exthostname"
                    $parsedUrl = parse_url($value);
                    $host = $parsedUrl['host'] ?? $value;
                    $ipAddresses[] = $host;
                }
            }
        }

        $resArray = [
            'nats_password' => $dataSet->nats_password,
            'ipset' => $ipAddresses,
            'pbx' => 'mikopbx',
        ];

        return base64_encode(json_encode($resArray));
    }

    /**
     * Saves the module settings based on the submitted form data.
     * If the request method is not POST, the function returns early.
     * Retrieves the form data, finds or creates a ModuleCTIClient record,
     * and updates the record with the form data. Finally, saves the record
     * and handles success or error messages.
     */
    public function saveAction(): void
    {
        // If the request method is not POST, return early
        if (!$this->request->isPost()) {
            return;
        }
        // Retrieve the form data
        $data = $this->request->getPost();

        // Find or create a ModuleCTIClient record
        $record = ModuleCTIClient::findFirst();
        if (!$record) {
            $record = new ModuleCTIClient();
        }

        // Update the record with the form data
        foreach ($record as $key => $value) {
            switch ($key) {
                case 'id':
                case 'ami_password':
                case 'nats_password':
                    break;
                case 'debug_mode':
                case 'web_service_mode':
                case 'auto_settings_mode':
                case 'setup_caller_id':
                case 'transliterate_caller_id':
                case 'remote_whatsapp':
                case 'remote_telegram':
                case 'remote_max':
                    // Unchecked toggles are absent from POST data; explicitly write '0' so
                    // the operator can switch them OFF (otherwise the default branch never
                    // sees the key and the old value sticks).
                    $record->$key = (isset($data[$key]) && $data[$key] === 'on') ? '1' : '0';
                    break;
                default:
                    if (array_key_exists($key, $data)
                        && strpos($data[$key], self::SECRET_MASK) === false
                    ) {
                        $record->$key = $data[$key];
                    }
            }
        }

        // Save the record
        if ($record->save() === false) {
            // Handle errors if saving fails
            $errors = $record->getMessages();
            $this->flash->error(implode('<br>', $errors));
            $this->view->success = false;

            return;
        }

        // Handle success if saving is successful
        $this->flash->success($this->translation->_('ms_SuccessfulSaved'));
        $this->view->success = true;
    }

    /**
     * Retrieves a list of PBX extensions with numbers and avatars in JSON format.
     *
     * Example:
     * curl "http://127.0.0.1/admin-cabinet/module-c-t-i-client/getExtensions"
     */
    public function getExtensionsAction(): void
    {
        $extensionTable = [];
        $resultTable = [];
        $pjsipPort = PbxSettings::getValueByKey('SIPPort');
        $tlsPort = PbxSettings::getValueByKey('TLS_PORT');
        $parameters = [
            'models' => [
                'Extensions' => Extensions::class,
            ],
            'conditions' => 'Extensions.is_general_user_number = 1',
            'columns' => [
                'userid' => 'Extensions.userid',
                'username' => 'Users.username',
                'secret' => 'Sip.secret',
                'transport' => 'Sip.transport',
                'dtmfmode' => 'Sip.dtmfmode',
                'number' => 'Extensions.number',
                'type' => 'Extensions.type',
                'avatar' => 'Users.avatar',
                'email' => 'Users.email',

            ],
            'order' => 'number',
            'joins' => [
                'Sip' => [
                    0 => Sip::class,
                    1 => 'Sip.extension=Extensions.number',
                    2 => 'Sip',
                    3 => 'LEFT',
                ],
                'Users' => [
                    0 => Users::class,
                    1 => 'Users.id = Extensions.userid',
                    2 => 'Users',
                    3 => 'INNER',
                ],
            ],
        ];
        $query = $this->di->get('modelsManager')->createBuilder($parameters)->getQuery();
        $extensions = $query->execute();
        foreach ($extensions as $extension) {
            switch ($extension->type) {
                case 'SIP':
                    $extensionTable[$extension->userid]['userid'] = $extension->userid;
                    $extensionTable[$extension->userid]['secret'] = $extension->secret;
                    $extensionTable[$extension->userid]['number'] = $extension->number;
                    $extensionTable[$extension->userid]['username'] = $extension->username;
                    $extensionTable[$extension->userid]['email'] = $extension->email;
                    $extensionTable[$extension->userid]['port'] = ($extension->transport === 'tls') ? $tlsPort : $pjsipPort;
                    $extensionTable[$extension->userid]['transport'] = $extension->transport;
                    $extensionTable[$extension->userid]['dtmfmode'] = $extension->dtmfmode;
                    if (!empty($extension->avatar)) {
                        $parsed = $this->parseAvatarData($extension->avatar);
                        $extensionTable[$extension->userid]['avatar'] = $parsed['hash'];
                    } else {
                        $extensionTable[$extension->userid]['avatar'] = '';
                    }
                    if (!key_exists('mobile', $extensionTable[$extension->userid])) {
                        $extensionTable[$extension->userid]['mobile'] = '';
                    }

                    break;
                case 'EXTERNAL':
                    $extensionTable[$extension->userid]['mobile'] = $extension->number;
                    break;
                default:
            }
        }

        // Transform into an array with the same structure
        foreach ($extensionTable as $extension) {
            $resultTable[] = [
                'userid' => $extension['userid'],
                'number' => $extension['number'],
                'secret' => base64_encode($extension['secret']),
                'username' => $extension['username'],
                'mobile' => $extension['mobile'],
                'avatar' => $extension['avatar'],
                'email' => $extension['email'],
                'port' => $extension['port'],
                'transport' => $extension['transport'],
                'dtmfmode' => $extension['dtmfmode'],
            ];
        }


        $this->view->setRenderLevel(View::LEVEL_NO_RENDER);
        $this->response->setContentType('application/json', 'UTF-8');
        $data = json_encode($resultTable);
        $this->response->setContent($data);
    }

    /**
     * Retrieves a list of queues and applications with human-readable names in JSON format.
     *
     * Example:
     * curl "http://127.0.0.1/admin-cabinet/module-c-t-i-client/getIdMatchNamesList"
     */
    public function getIdMatchNamesListAction(): void
    {
        $extensionTable = [];

        $parameters = [
            'conditions' => 'userid IS NULL',
            'order' => 'number',
        ];

        $extensions = Extensions::find($parameters);
        foreach ($extensions as $extension) {
            switch (strtoupper($extension->type)) {
                case Extensions::TYPE_CONFERENCE:
                    $extensionTable[] =
                        [
                            'name' => $extension->ConferenceRooms->name,
                            'number' => $extension->number,
                            'type' => $extension->type,
                            'uniqid' => $extension->ConferenceRooms->uniqid,
                        ];
                    break;
                case Extensions::TYPE_QUEUE:
                    $extensionTable[] =
                        [
                            'name' => $extension->CallQueues->name,
                            'number' => $extension->number,
                            'type' => $extension->type,
                            'uniqid' => $extension->CallQueues->uniqid,
                        ];
                    break;
                case Extensions::TYPE_DIALPLAN_APPLICATION:
                    $extensionTable[] =
                        [
                            'name' => $extension->DialplanApplications->name,
                            'number' => $extension->number,
                            'type' => $extension->type,
                            'uniqid' => $extension->DialplanApplications->uniqid,
                        ];
                    break;
                case Extensions::TYPE_IVR_MENU:
                    $extensionTable[] =
                        [
                            'name' => $extension->IvrMenu->name,
                            'number' => $extension->number,
                            'type' => $extension->type,
                            'uniqid' => $extension->IvrMenu->uniqid,
                        ];
                    break;
                case Extensions::TYPE_MODULES:
                    $extensionTable[] =
                        [
                            'name' => $extension->callerid,
                            'number' => $extension->number,
                            'type' => $extension->type,
                            'uniqid' => '',
                        ];
                    break;
                default:
            }
        }

        // Add the list of providers
        $providers = Providers::find();
        foreach ($providers as $provider) {
            $modelType = ucfirst($provider->type);
            $provByType = $provider->$modelType;
            $extensionTable[] = [
                'uniqid' => $provByType->uniqid,
                'name' => $provByType->description,
                'type' => 'PROVIDER',
                'number' => '',
            ];
        }

        $this->view->setRenderLevel(View::LEVEL_NO_RENDER);
        $this->response->setContentType('application/json', 'UTF-8');
        $data = json_encode($extensionTable);
        $this->response->setContent($data);
    }

    /**
     * Updates the user's avatar image.
     *
     * HTTP POST request with parameters 'id' and 'img' to the address:
     * http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserAvatar
     *
     * - id: The user's identifier.
     * - img: The user's avatar image encoded as base64.
     *
     * Example:
     * curl -X "POST" "http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserAvatar" \
     *  -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' \
     * --data-urlencode "id=110" \
     * --data-urlencode "img=data:image/png;base64,SDFGDSFGSDG"
     */
    public function updateUserAvatarAction()
    {
        $this->view->setRenderLevel(View::LEVEL_NO_RENDER);
        $this->response->setContentType('application/json', 'UTF-8');
        if (!$this->request->isPost()) {
            $data = json_encode(['error' => 'Only post requests accepted']);
            $this->response->setContent($data);

            return;
        }
        $userId = $this->request->getPost('id');

        if (MikoPBXVersion::isPhalcon512Version()) {
            $restAnswer = $this->di->get('restAPIClient', [
                '/pbxcore/api/v3/employees/' . $userId,
                'PATCH',
                ['user_avatar' => $this->request->getPost('img')],
                ['Content-Type' => 'application/json'],
            ]);
            $this->response->setContent(
                json_encode($this->transformRestApiResponse($restAnswer))
            );

            return;
        }

        $user = Users::findFirstById($userId);
        if ($user !== null) {
            $user->avatar = $this->request->getPost('img');
            if ($user->save() === false) {
                $errors = $user->getMessages();
                $data = json_encode(['error' => $errors]);
                $this->response->setContent($data);
            } else {
                $data = json_encode(['result' => 'ok']);
                $this->response->setContent($data);
            }
        } else {
            $data = json_encode(['error' => "Unknown user with id={$userId}"]);
            $this->response->setContent($data);
        }
    }

    /**
     * Updates the user's mobile phone number.
     *
     * HTTP POST request with parameters 'id' and 'newMobile' to the address:
     * http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserMobile
     *
     * - id: The user's identifier.
     * - newMobile: The new mobile phone number for the user.
     *
     * Example:
     * curl -X "POST" "http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserMobile" \
     *  -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' \
     * --data-urlencode "id=110" \
     * --data-urlencode "newMobile=79265244742"
     */
    public function updateUserMobileAction(): void
    {
        $this->view->setRenderLevel(View::LEVEL_NO_RENDER);
        $this->response->setContentType('application/json', 'UTF-8');
        if (!$this->request->isPost()) {
            $data = json_encode(['error' => 'Only post requests accepted']);
            $this->response->setContent($data);

            return;
        }

        $newMobile = preg_replace('/[^0-9]/', '', $this->request->getPost('newMobile'));
        $userId = $this->request->getPost('id');

        if (MikoPBXVersion::isPhalcon512Version()) {
            $restAnswer = $this->di->get('restAPIClient', [
                '/pbxcore/api/v3/employees/' . $userId,
                'PATCH',
                ['mobile_number' => $newMobile, 'mobile_dialstring' => $newMobile],
                ['Content-Type' => 'application/json'],
            ]);
            $this->response->setContent(
                json_encode($this->transformRestApiResponse($restAnswer))
            );

            return;
        }

        $user = Users::findFirstById($userId);
        if ($user === null) {
            $data = json_encode(['error' => "Unknown user with id={$userId}"]);
            $this->response->setContent($data);

            return;
        }
        $parameters = [
            'conditions' => 'type = "EXTERNAL" AND is_general_user_number = 1 AND userid=:userid:',
            'bind' => [
                'userid' => $userId,
            ],
        ];
        $externalExtension = Extensions::findFirst($parameters);
        if (!$externalExtension) {
            $externalExtension = new Extensions();
            $externalExtension->userid = $userId;
            $externalExtension->type = 'EXTERNAL';
            $externalExtension->is_general_user_number = 1;
            $externalExtension->show_in_phonebook = 0;
            $externalExtension->public_access = 0;

            $externalExtension->ExternalPhones = new ExternalPhones();
            $externalExtension->ExternalPhones->uniqid = strtoupper('EXTERNAL-' . md5(time()));
            $externalExtension->ExternalPhones->disabled = 0;

            $parameters = [
                'conditions' => 'type = "SIP" AND is_general_user_number = 1 AND userid=:userid:',
                'bind' => [
                    'userid' => $userId,
                ],
            ];
            $internalExtension = Extensions::findFirst($parameters);
            if ($internalExtension) {
                $externalExtension->callerid = $internalExtension->callerid;
            }
        }
        $externalExtension->ExternalPhones->extension = $newMobile;
        $externalExtension->ExternalPhones->dialstring = $newMobile;
        $externalExtension->number = $newMobile;

        $this->db->begin();
        $errors = false;
        if (!$externalExtension->save()) {
            $errors = $externalExtension->getMessages();
        }

        if (!$errors && $externalExtension && !$externalExtension->ExternalPhones->save()) {
            $errors = $externalExtension->ExternalPhones->getMessages();
        }

        if ($errors) {
            $this->db->rollback();
            $data = json_encode(['error' => $errors]);
            $this->response->setContent($data);
        } else {
            $this->db->commit();
            $data = json_encode(['result' => 'ok']);
            $this->response->setContent($data);
        }
    }

    /**
     * Retrieves the image in Base64 format based on the provided image hash.
     *
     * Example:
     * curl "http://127.0.0.1/admin-cabinet/module-c-t-i-client/getUserAvatar/0e6c772f5c977666aa03207927be1781"
     *
     * @param string $imgHash The image hash.
     */
    public function getUserAvatarAction(string $imgHash)
    {
        $this->view->setRenderLevel(View::LEVEL_NO_RENDER);
        $this->response->setContentType('application/json', 'UTF-8');

        if (MikoPBXVersion::isPhalcon512Version()) {
            // New version: avatar is a file path like /avatars/user_1.jpg
            // md5 of the path string is used as hash identifier
            $users = Users::find();
            foreach ($users as $user) {
                $parsed = $this->parseAvatarData($user->avatar ?? '');
                if (!empty($parsed['hash']) && $parsed['hash'] === $imgHash) {
                    $mediaDir = \MikoPBX\Core\System\Directories::getDir(
                        \MikoPBX\Core\System\Directories::AST_MEDIA_DIR
                    );
                    $filePath = $mediaDir . $parsed['path'];
                    if (file_exists($filePath)) {
                        $base64 = 'data:image/jpeg;base64,' . base64_encode(file_get_contents($filePath));
                        $this->response->setContent(json_encode(['img' => $base64]));

                        return;
                    }
                }
            }
            $this->response->setContent(json_encode(['error' => 'Image not found']));

            return;
        }

        // Legacy: avatar is base64 blob stored directly in database
        $imgCacheDir = appPath('sites/admin-cabinet/assets/img/cache');
        $imgFile = "{$imgCacheDir}/$imgHash.jpg";
        if (!file_exists($imgFile)) {
            $users = Users::find();
            foreach ($users as $user) {
                if (md5($user->avatar) === $imgHash) {
                    $this->base64ToJpeg($user->avatar, $imgFile);
                    break;
                }
            }
        }
        if (file_exists($imgFile)) {
            $base64 = 'data:image/png;base64,' . base64_encode(file_get_contents($imgFile));
            $data = json_encode(['img' => $base64]);
            $this->response->setContent($data);
        } else {
            $data = json_encode(['error' => 'Image not found']);
            $this->response->setContent($data);
        }
    }

    /**
     * Creates a JPEG file from the provided base64 image string.
     *
     * @param string $base64_string The base64 image string.
     * @param string $output_file The output file path.
     *
     * @return string The output file path.
     */
    private function base64ToJpeg($base64_string, $output_file)
    {
        // Open the output file for writing
        $ifp = fopen($output_file, 'wb');

        // Split the string on commas
        // $data[0] == "data:image/png;base64"
        // $data[1] == <actual base64 string>
        $data = explode(',', $base64_string);

        // We could add validation here to ensure count($data) > 1

        // Write the base64-decoded image data to the file
        fwrite($ifp, base64_decode($data[1]));

        // Clean up the file resource
        fclose($ifp);

        return $output_file;
    }

    /**
     * Parses avatar data supporting multiple formats: JSON, path-only, and legacy base64.
     *
     * @param string $avatarData Raw avatar data from the database.
     * @return array{path: string, hash: string}
     */
    private function parseAvatarData(string $avatarData): array
    {
        if (empty($avatarData)) {
            return ['path' => '', 'hash' => ''];
        }

        // New JSON format: {"path": "/avatars/user_1.jpg", "hash": "md5..."}
        if ($avatarData[0] === '{') {
            $decoded = json_decode($avatarData, true);
            if (is_array($decoded) && isset($decoded['path'], $decoded['hash'])) {
                return ['path' => $decoded['path'], 'hash' => $decoded['hash']];
            }
        }

        // Legacy base64 blob
        if (strpos($avatarData, 'data:image') === 0) {
            return ['path' => '', 'hash' => md5($avatarData)];
        }

        // Old path-only format
        return ['path' => $avatarData, 'hash' => md5($avatarData)];
    }

    /**
     * Transforms REST API v3 response to the legacy CTI client format.
     *
     * @param object $restAnswer PBXApiResult from restAPIClient
     * @return array ['result' => 'ok'] on success or ['error' => '...'] on failure
     */
    private function transformRestApiResponse($restAnswer): array
    {
        if ($restAnswer->success) {
            return ['result' => 'ok'];
        }
        $errorMessages = $restAnswer->messages['error'] ?? ['Unknown error'];
        return ['error' => implode('; ', $errorMessages)];
    }

    /**
     * Updates the email of a user.
     *
     * HTTP POST request with parameters 'id' and 'email' to the address:
     * http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserEmail
     *
     * - id: The user's identifier.
     * - email: The new email for the user.
     *
     * Example:
     * curl -X "POST" "http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserEmail" \
     *  -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' \
     * --data-urlencode "id=110" \
     * --data-urlencode "email=nb@mikopbx.com"
     */
    public function updateUserEmailAction()
    {
        $this->view->setRenderLevel(View::LEVEL_NO_RENDER);
        $this->response->setContentType('application/json', 'UTF-8');
        if (!$this->request->isPost()) {
            $data = json_encode(['error' => 'Only post requests accepted']);
            $this->response->setContent($data);

            return;
        }
        $userId = $this->request->getPost('id');

        if (MikoPBXVersion::isPhalcon512Version()) {
            $restAnswer = $this->di->get('restAPIClient', [
                '/pbxcore/api/v3/employees/' . $userId,
                'PATCH',
                ['user_email' => $this->request->getPost('email')],
                ['Content-Type' => 'application/json'],
            ]);
            $this->response->setContent(
                json_encode($this->transformRestApiResponse($restAnswer))
            );

            return;
        }

        $user = Users::findFirstById($userId);
        if ($user !== null) {
            $user->email = $this->request->getPost('email');
            if ($user->save() === false) {
                $errors = $user->getMessages();
                $data = json_encode(['error' => $errors]);
                $this->response->setContent($data);
            } else {
                $data = json_encode(['result' => 'ok']);
                $this->response->setContent($data);
            }
        } else {
            $data = json_encode(['error' => "Unknown user with id={$userId}"]);
            $this->response->setContent($data);
        }
    }

}
