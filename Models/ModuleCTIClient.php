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


/**
 * Class ModuleCTIClient
 *
 * Represents the CTI Client module.
 */
class ModuleCTIClient extends ModulesModelsBase
{

    /**
     * @Primary
     * @Identity
     * @Column(type='integer', nullable=false)
     */
    public $id;

    /**
     * @var string|null The address of the 1C server
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $server1chost = '';

    /**
     * @var string|null The port where the 1C server is published
     *
     * @Column(type='integer', nullable=true, default='80')
     */
    public ?string $server1cport = '80';

    /**
     * @var string|null Use SSL connection to the 1C server
     *
     * @Column(type='string', length=1, nullable=true, default='http')
     */
    public ?string $server1c_scheme = 'http';

    /**
     * @var string|null Login to the web service
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $login = '';

    /**
     * @var string|null Password for the web service
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $secret = '';

    /**
     * @var string|null The name of the publication on the 1C server
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $database = '';

    /**
     * @var string|null The name of the publication on the 1C server with domain authentication enabled
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $publish_name_with_auth = '';

    /**
     * @var string|null Mode requiring publication of the 1C database
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $web_service_mode = '0';

    /**
     * @var string|null Debug mode of the module
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $debug_mode = '0';

    /**
     * @var string|null AMI password for the created manager
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $ami_password = '';

    /**
     * @var string|null GNATS password for auto-configuration
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $nats_password = '';

    /**
     * @var string|null Module configuration mode from the 1C side
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $auto_settings_mode = '1';

    /**
     * @var string|null Whether to set CallerID based on data from 1C
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $setup_caller_id = '1';

    /**
     * @var string|null Whether to transliterate CallerID
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $transliterate_caller_id = '0';

    /**
     * @var string|null Chats proxy address
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $chats_proxy_address = '';

    /**
     * @var string|null MT Proxy address for Telegram client mode
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $mt_proxy_address = '';

    /**
     * @var string|null MT Proxy secret for Telegram client mode
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $mt_proxy_secret = '';

    /**
     * @var string|null Run WhatsApp (chatsd) channels on the remote VPS
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $remote_whatsapp = '0';

    /**
     * @var string|null Run Telegram (tgd) channels on the remote VPS
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $remote_telegram = '0';

    /**
     * @var string|null Run MAX (maxd) channels on the remote VPS
     *
     * @Column(type='string', length=1, nullable=true, default='0')
     */
    public ?string $remote_max = '0';

    /**
     * @var string|null Remote VPS host (IP or FQDN) for messenger offload
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $remote_host = '';

    /**
     * @var string|null Remote VPS SSH port
     *
     * @Column(type='string', nullable=true, default='22')
     */
    public ?string $remote_ssh_port = '22';

    /**
     * @var string|null Remote VPS SSH login
     *
     * @Column(type='string', nullable=true, default='root')
     */
    public ?string $remote_ssh_login = 'root';

    /**
     * @var string|null Remote VPS SSH private key.
     * SECURITY: stored as-is for now; masked in the web UI (see maskSecretFields).
     * TODO (Phase 3): encrypt at rest (credential-manager AES) before this ships to prod.
     *
     * @Column(type='string', nullable=true, default='')
     */
    public ?string $remote_ssh_key = '';

    /**
     * @var string|null Base directory of the module deployment on the remote VPS
     *
     * @Column(type='string', nullable=true, default='/opt/mikopbx-cti')
     */
    public ?string $remote_bin_dir = '/opt/mikopbx-cti';

    /**
     * Initialize model for module
     * @return void
     */
    public function initialize(): void
    {
        $this->setSource('m_ModuleCTIClient');
        parent::initialize();
    }
}