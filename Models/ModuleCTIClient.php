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
     * Использовать SSL подключение к серверу 1С
     *
     * @Column(type='string', length=1, nullable=true, default='http')
     */
    public ?string $server1c_scheme = 'http';

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

    /**
     * Пароль AMI для создаваемого менеджера
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $ami_password = '';

    /**
     * Пароль GNATS для автонастройки
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $nats_password = '';

    /**
     * Режим настройки модуля со стороны 1С
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $auto_settings_mode = '1';

    /**
     * Устанавливать ли CallerID по данным в 1С
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $setup_caller_id = '1';

    /**
     * Выполнять транслитерацию CallerID
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $transliterate_caller_id = '0';


    public function initialize(): void
    {
        $this->setSource('m_ModuleCTIClient');
        parent::initialize();
    }
}