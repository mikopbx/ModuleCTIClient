<?php
/**
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 9 2018
 *
 */

namespace Modules\ModuleCTIClient\Models;

use MikoPBX\Modules\Models\ModulesModelsBase;

class ModuleCTIClient extends ModulesModelsBase
{

    /**
     * @Primary
     * @Identity
     * @Column(type='integer', nullable=false)
     */
    public $id;

    /**
     * Адрес сервера 1С
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $server1chost = '';

    /**
     * Порт, где опубликован сервер 1С
     *
     * @Column(type='integer', nullable=true, default='80')
     */
    public ?string $server1cport = '80';

    /**
     * Логин к вебсервису
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $login = '';

    /**
     * Пароль к вебсервису
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $secret = '';

    /**
     * Имя публикации
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $database = '';

    /**
     * Режим требующий публикации базы 1С
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $web_service_mode = '0';

    /**
     * Режим отладки модуля
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $debug_mode = '0';


    public function initialize(): void
    {
        $this->setSource('m_ModuleCTIClient');
        parent::initialize();
    }
}