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

namespace Modules\ModuleCTIClient\Lib;

use Modules\ModuleCTIClient\App\Controllers\ModuleCTIClientController;
use Modules\ModuleUsersUI\Lib\ACL\ACLInterface;
use Modules\ModuleUsersUI\Lib\EndpointConstants as RestEndpoints;

class ModuleCTIClientACL implements ACLInterface
{
    const API_MODULE_CTI_CLIENT = '/pbxcore/api/modules/module-c-t-i-client';

    /**
     * Prepares list of linked controllers to other controllers to hide it from UI
     * and allow or disallow with the main one.
     *
     * @return array[]
     */
    public static function getLinkedControllerActions(): array
    {
        return [
            ModuleCTIClientController::class => [
                RestEndpoints::ACTION_INDEX => [
                    self::API_MODULE_CTI_CLIENT => '*',
                    ModuleCTIClientController::class => [
                        'save',
                    ]
                ],
            ]
        ];
    }

    /**
     * Returns list of controllers that are always allowed
     * @return array
     */
    public static function getAlwaysAllowed(): array
    {
        return [];
    }

    /**
     * The list of controllers that are always disallowed
     * only for superusers
     * @return array
     */
    public static function getAlwaysDenied(): array
    {
        return [
            ModuleCTIClientController::class => [
                'getExtensions',
                'getIdMatchNamesList',
                'updateUserAvatar',
                'updateUserMobile',
                'getUserAvatar',
                'updateUserEmail'
            ]
        ];
    }
}