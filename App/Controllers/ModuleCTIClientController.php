<?php
/**
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 9 2018
 *
 */

namespace Modules\ModuleCTIClient\App\Controllers;

use MikoPBX\Common\Models\Extensions;
use MikoPBX\Common\Models\ExternalPhones;
use MikoPBX\Common\Models\LanInterfaces;
use MikoPBX\Common\Models\Providers;
use MikoPBX\Common\Models\Users;
use MikoPBX\Common\Models\Sip;
use MikoPBX\Modules\PbxExtensionUtils;
use Modules\ModuleCTIClient\Models\ModuleCTIClient;
use Phalcon\Mvc\Model\Resultset;
use Phalcon\Mvc\View;
use MikoPBX\AdminCabinet\Controllers\BaseController;
use Modules\ModuleCTIClient\App\Forms\ModuleCTIClientForm;

use function MikoPBX\Common\Config\appPath;

class ModuleCTIClientController extends BaseController
{
    private $moduleUniqueID = 'ModuleCTIClient';
    private $moduleDir;

    /**
     * Basic initial class
     */
    public function initialize(): void
    {
        $this->moduleDir           = PbxExtensionUtils::getModuleDir($this->moduleUniqueID);
        $this->view->logoImagePath = "{$this->url->get()}assets/img/cache/{$this->moduleUniqueID}/logo.png";
        $this->view->submitMode    = null;
        parent::initialize();
    }


    /**
     * Форма настроек модуля
     */
    public function indexAction(): void
    {
        $footerCollection = $this->assets->collection('footerJS');
        $footerCollection->addJs('js/pbx/main/form.js', true);
        $footerCollection->addJs("js/cache/{$this->moduleUniqueID}/module-cti-client-status-worker.js", true);
        $footerCollection->addJs("js/cache/{$this->moduleUniqueID}/module-cti-client-index.js", true);
        $settings = ModuleCTIClient::findFirst();
        if ($settings === null) {
            $settings = new ModuleCTIClient();
        }

        $this->view->form              = new ModuleCTIClientForm($settings);
        $this->view->autoSettingsValue = $this->generateAutoSettingsString($settings);
        $this->view->pick("{$this->moduleDir}/App/Views/index");
    }

    /**
     * Сохранение настроек
     */
    public function saveAction(): void
    {
        if ( ! $this->request->isPost()) {
            return;
        }
        $data   = $this->request->getPost();
        $record = ModuleCTIClient::findFirst();
        if ( ! $record) {
            $record = new ModuleCTIClient();
        }
        foreach ($record as $key => $value) {
            switch ($key) {
                case 'id':
                case 'ami_password':
                case 'nats_password':
                    break;
                case 'debug_mode':
                case 'web_service_mode':
                case 'auto_settings_mode':
                    $record->$key = ($data[$key] === 'on') ? '1' : '0';
                    break;
                default:
                    if (array_key_exists($key, $data)) {
                        $record->$key = $data[$key];
                    } else {
                        $record->$key = '';
                    }
            }
        }

        if ($record->save() === false) {
            $errors = $record->getMessages();
            $this->flash->error(implode('<br>', $errors));
            $this->view->success = false;

            return;
        }

        $this->flash->success($this->translation->_('ms_SuccessfulSaved'));
        $this->view->success = true;
    }

    /**
     * Получить список пользователей АТС с номерами и картинками в JSON
     *
     * Пример:
     * curl "http://127.0.0.1/admin-cabinet/module-c-t-i-client/getExtensions"
     *
     */
    public function getExtensionsAction(): void
    {
        $extensionTable = [];
        $resultTable    = [];

        $parameters = [
            'models'     => [
                'Extensions' => Extensions::class,
            ],
            'conditions' => 'Extensions.is_general_user_number = 1',
            'columns'    => [
                'userid'   => 'Extensions.userid',
                'username' => 'Users.username',
                'secret'   => 'Sip.secret',
                'number'   => 'Extensions.number',
                'type'     => 'Extensions.type',
                'avatar'   => 'Users.avatar',
                'email'    => 'Users.email',

            ],
            'order'      => 'number',
            'joins'      => [
                'Sip'   => [
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
        $query      = $this->di->get('modelsManager')->createBuilder($parameters)->getQuery();
        $extensions = $query->execute();
        foreach ($extensions as $extension) {
            switch ($extension->type) {
                case 'SIP':
                    $extensionTable[$extension->userid]['userid']   = $extension->userid;
                    $extensionTable[$extension->userid]['secret']   = $extension->secret;
                    $extensionTable[$extension->userid]['number']   = $extension->number;
                    $extensionTable[$extension->userid]['username'] = $extension->username;
                    $extensionTable[$extension->userid]['email']    = $extension->email;
                    if ( ! empty($extension->avatar)) {
                        $extensionTable[$extension->userid]['avatar'] = md5($extension->avatar);
                    } else {
                        $extensionTable[$extension->userid]['avatar'] = '';
                    }
                    if ( ! key_exists('mobile', $extensionTable[$extension->userid])) {
                        $extensionTable[$extension->userid]['mobile'] = '';
                    }

                    break;
                case 'EXTERNAL':
                    $extensionTable[$extension->userid]['mobile'] = $extension->number;
                    break;
                default:
            }
        }

        // Преобразуем в массив одинаковой структуры
        foreach ($extensionTable as $extension) {
            $resultTable[] = [
                'userid'   => $extension['userid'],
                'number'   => $extension['number'],
                'secret'   => base64_encode($extension['secret']),
                'username' => $extension['username'],
                'mobile'   => $extension['mobile'],
                'avatar'   => $extension['avatar'],
                'email'    => $extension['email'],
            ];
        }


        $this->view->disableLevel(
            [
                View::LEVEL_ACTION_VIEW     => true,
                View::LEVEL_LAYOUT          => true,
                View::LEVEL_MAIN_LAYOUT     => true,
                View::LEVEL_AFTER_TEMPLATE  => true,
                View::LEVEL_BEFORE_TEMPLATE => true,
            ]
        );
        $this->response->setContentType('application/json', 'UTF-8');
        $data = json_encode($resultTable);
        $this->response->setContent($data);
    }

    /**
     * Получить список очередей и приложений с человекочитаемым названием
     *
     * Пример:
     * curl "http://127.0.0.1/admin-cabinet/module-c-t-i-client/getIdMatchNamesList"
     *
     */
    public function getIdMatchNamesListAction(): void
    {
        $extensionTable = [];

        $parameters = [
            'conditions' => 'userid IS NULL',
            'order'      => 'number',
        ];

        $extensions = Extensions::find($parameters);
        foreach ($extensions as $extension) {
            switch (strtoupper($extension->type)) {
                case Extensions::TYPE_CONFERENCE:
                    $extensionTable[] =
                        [
                            'name'   => $extension->ConferenceRooms->name,
                            'number' => $extension->number,
                            'type'   => $extension->type,
                            'uniqid' => $extension->ConferenceRooms->uniqid,
                        ];
                    break;
                case Extensions::TYPE_QUEUE:
                    $extensionTable[] =
                        [
                            'name'   => $extension->CallQueues->name,
                            'number' => $extension->number,
                            'type'   => $extension->type,
                            'uniqid' => $extension->CallQueues->uniqid,
                        ];
                    break;
                case Extensions::TYPE_DIALPLAN_APPLICATION:
                    $extensionTable[] =
                        [
                            'name'   => $extension->DialplanApplications->name,
                            'number' => $extension->number,
                            'type'   => $extension->type,
                            'uniqid' => $extension->DialplanApplications->uniqid,
                        ];
                    break;
                case Extensions::TYPE_IVR_MENU:
                    $extensionTable[] =
                        [
                            'name'   => $extension->IvrMenu->name,
                            'number' => $extension->number,
                            'type'   => $extension->type,
                            'uniqid' => $extension->IvrMenu->uniqid,
                        ];
                    break;
                case Extensions::TYPE_MODULES:
                    $extensionTable[] =
                        [
                            'name'   => $extension->callerid,
                            'number' => $extension->number,
                            'type'   => $extension->type,
                            'uniqid' => '',
                        ];
                    break;
                default:
            }
        }
        // Добавим список провайдров
        $providers = Providers::find();
        foreach ($providers as $provider) {
            $modelType        = ucfirst($provider->type);
            $provByType       = $provider->$modelType;
            $extensionTable[] = [
                'uniqid' => $provByType->uniqid,
                'name'   => $provByType->description,
                'type'   => 'PROVIDER',
                'number' => '',
            ];
        }

        $this->view->disableLevel(
            [
                View::LEVEL_ACTION_VIEW     => true,
                View::LEVEL_LAYOUT          => true,
                View::LEVEL_MAIN_LAYOUT     => true,
                View::LEVEL_AFTER_TEMPLATE  => true,
                View::LEVEL_BEFORE_TEMPLATE => true,
            ]
        );
        $this->response->setContentType('application/json', 'UTF-8');
        $data = json_encode($extensionTable);
        $this->response->setContent($data);
    }


    /**
     * Обновление картинки пользователя
     *
     * POST запрос с параметрами id и img на адрес
     * http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserAvatar
     *
     * id -  идентификатор пользователя
     * Пример:
     * curl -X "POST" "http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserAvatar" \
     *  -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' \
     * --data-urlencode "id=110" \
     * --data-urlencode "img=data:image/png;base64,SDFGDSFGSDG"
     */
    public function updateUserAvatarAction()
    {
        $this->view->disableLevel(
            [
                View::LEVEL_ACTION_VIEW     => true,
                View::LEVEL_LAYOUT          => true,
                View::LEVEL_MAIN_LAYOUT     => true,
                View::LEVEL_AFTER_TEMPLATE  => true,
                View::LEVEL_BEFORE_TEMPLATE => true,
            ]
        );
        $this->response->setContentType('application/json', 'UTF-8');
        if ( ! $this->request->isPost()) {
            $data = json_encode(['error' => 'Only post requests accepted']);
            $this->response->setContent($data);

            return;
        }
        $userId = $this->request->getPost('id');
        $user   = Users::findFirstById($userId);
        if ($user !== null) {
            $user->avatar = $this->request->getPost('img');
            if ($user->save() === false) {
                $errors = $user->getMessages();
                $data   = json_encode(['error' => $errors]);
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
     * Обновление мобильного телефона пользователя
     *
     * POST запрос с параметрами id и newMobile на адрес
     * http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserMobile
     * id -  идентификатор пользователя
     *
     * Пример:
     * curl -X "POST" "http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserMobile" \
     *  -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' \
     * --data-urlencode "id=110" \
     * --data-urlencode "newMobile=79265244742"
     */
    public function updateUserMobileAction(): void
    {
        $this->view->disableLevel(
            [
                View::LEVEL_ACTION_VIEW     => true,
                View::LEVEL_LAYOUT          => true,
                View::LEVEL_MAIN_LAYOUT     => true,
                View::LEVEL_AFTER_TEMPLATE  => true,
                View::LEVEL_BEFORE_TEMPLATE => true,
            ]
        );
        $this->response->setContentType('application/json', 'UTF-8');
        if ( ! $this->request->isPost()) {
            $data = json_encode(['error' => 'Only post requests accepted']);
            $this->response->setContent($data);

            return;
        }

        $newMobile = preg_replace('/[^0-9]/', '', $this->request->getPost('newMobile'));
        $userId    = $this->request->getPost('id');
        $user      = Users::findFirstById($userId);
        if ($user === null) {
            $data = json_encode(['error' => "Unknown user with id={$userId}"]);
            $this->response->setContent($data);

            return;
        }
        $parameters        = [
            'conditions' => 'type = "EXTERNAL" AND is_general_user_number = 1 AND userid=:userid:',
            'bind'       => [
                'userid' => $userId,
            ],
        ];
        $externalExtension = Extensions::findFirst($parameters);
        if ( ! $externalExtension) {
            $externalExtension                         = new Extensions();
            $externalExtension->userid                 = $userId;
            $externalExtension->type                   = 'EXTERNAL';
            $externalExtension->is_general_user_number = 1;
            $externalExtension->show_in_phonebook      = 0;
            $externalExtension->public_access          = 0;

            $externalExtension->ExternalPhones           = new ExternalPhones();
            $externalExtension->ExternalPhones->uniqid   = strtoupper('EXTERNAL-' . md5(time()));
            $externalExtension->ExternalPhones->disabled = 0;

            $parameters        = [
                'conditions' => 'type = "SIP" AND is_general_user_number = 1 AND userid=:userid:',
                'bind'       => [
                    'userid' => $userId,
                ],
            ];
            $internalExtension = Extensions::findFirst($parameters);
            if ($internalExtension) {
                $externalExtension->callerid = $internalExtension->callerid;
            }
        }
        $externalExtension->ExternalPhones->extension  = $newMobile;
        $externalExtension->ExternalPhones->dialstring = $newMobile;
        $externalExtension->number                     = $newMobile;

        $this->db->begin();
        $errors = false;
        if ( ! $externalExtension->save()) {
            $errors = $externalExtension->getMessages();
        }

        if ( ! $errors && $externalExtension && ! $externalExtension->ExternalPhones->save()) {
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
     * Возвращает картинку в Base64 по переданному хешу картинки
     *
     * Пример:
     * curl "http://127.0.0.1/admin-cabinet/module-c-t-i-client/getUserAvatar/0e6c772f5c977666aa03207927be1781"
     *
     * @param string $imgHash
     */
    public function getUserAvatarAction(string $imgHash)
    {
        $this->view->disableLevel(
            [
                View::LEVEL_ACTION_VIEW     => true,
                View::LEVEL_LAYOUT          => true,
                View::LEVEL_MAIN_LAYOUT     => true,
                View::LEVEL_AFTER_TEMPLATE  => true,
                View::LEVEL_BEFORE_TEMPLATE => true,
            ]
        );
        $this->response->setContentType('application/json', 'UTF-8');
        $imgCacheDir = appPath('sites/admin-cabinet/assets/img/cache');
        $imgFile     = "{$imgCacheDir}/$imgHash.jpg";
        if ( ! file_exists($imgFile)) {
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
            $data   = json_encode(['img' => $base64]);
            $this->response->setContent($data);
        } else {
            $data = json_encode(['error' => 'Image not found']);
            $this->response->setContent($data);
        }
    }

    /**
     * Создает файл jpeg из переданной картинки
     *
     * @param $base64_string
     * @param $output_file
     *
     * @return mixed
     */
    private function base64ToJpeg($base64_string, $output_file)
    {
        // open the output file for writing
        $ifp = fopen($output_file, 'wb');

        // split the string on commas
        // $data[ 0 ] == "data:image/png;base64"
        // $data[ 1 ] == <actual base64 string>
        $data = explode(',', $base64_string);

        // we could add validation here with ensuring count( $data ) > 1
        fwrite($ifp, base64_decode($data[1]));

        // clean up the file resource
        fclose($ifp);

        return $output_file;
    }

    /**
     * Обновление email пользователя
     *
     * POST запрос с параметрами id и email на адрес
     * http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserEmail
     *
     * id -  идентификатор пользователя
     *
     * Пример:
     * curl -X "POST" "http://127.0.0.1/admin-cabinet/module-c-t-i-client/updateUserEmail" \
     *  -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' \
     * --data-urlencode "id=110" \
     * --data-urlencode "email=nb@mikopbx.com"
     *
     */
    public function updateUserEmailAction()
    {
        $this->view->disableLevel(
            [
                View::LEVEL_ACTION_VIEW     => true,
                View::LEVEL_LAYOUT          => true,
                View::LEVEL_MAIN_LAYOUT     => true,
                View::LEVEL_AFTER_TEMPLATE  => true,
                View::LEVEL_BEFORE_TEMPLATE => true,
            ]
        );
        $this->response->setContentType('application/json', 'UTF-8');
        if ( ! $this->request->isPost()) {
            $data = json_encode(['error' => 'Only post requests accepted']);
            $this->response->setContent($data);

            return;
        }
        $userId = $this->request->getPost('id');
        $user   = Users::findFirstById($userId);
        if ($user !== null) {
            $user->email = $this->request->getPost('email');
            if ($user->save() === false) {
                $errors = $user->getMessages();
                $data   = json_encode(['error' => $errors]);
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
     * Generate connections JSON and pack it on BASE64 set
     *
     *
     * @param \Modules\ModuleCTIClient\Models\ModuleCTIClient $dataSet
     *
     * @return string
     */
    private function generateAutoSettingsString(ModuleCTIClient $dataSet): string
    {
        $ipAddresses[]      = $this->request->getServerAddress();
        $internetInterfaces = LanInterfaces::find(['hydration' => Resultset::HYDRATE_ARRAYS]);

        $possibleAttributes = [
            'ipaddr',
            'extipaddr',
            'exthostname',
            'hostname',
        ];
        foreach ($internetInterfaces as $interface) {
            foreach ($interface as $key => $value){
                if (in_array($key, $possibleAttributes)
                    && ! empty($value)
                    && ! in_array($value, $ipAddresses)
                ) {
                    $ipAddresses[] = $value;
                }
            }
        }

        $resArray = [
            'nats_password' => $dataSet->nats_password,
            'ipset'         => $ipAddresses,
            'pbx'           => 'mikopbx',
        ];

        return base64_encode(json_encode($resArray));
    }
}