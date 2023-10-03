#!/usr/bin/php
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


use MikoPBX\Core\System\Util;
use MikoPBX\Core\Asterisk\AGI;
use Modules\ModuleCTIClient\Lib\AmigoDaemons;

require_once 'Globals.php';

/**
 * Retrieves the caller ID name from the CRM and sets it as the caller ID name for the call.
 * If no caller ID name is found, logs a message indicating the absence of contact in the CRM.
 */
try {
    $agi    = new AGI();
    $number = $agi->request['agi_callerid'];

    // Retrieve caller ID name from the CRM
    $callerIDName = AmigoDaemons::getCallerId($number);

    if (!empty($callerIDName)){
        // Set the caller ID name for the call
        $agi->set_variable('CALLERID(name)', $callerIDName);
        $agi->noop('Receive a caller name "'.$callerIDName.'" from the CRM');
    } else {
        $agi->noop('No any contact with the number "'.$number.'" on the CRM');
    }
} catch (\Throwable $e) {
    Util::sysLogMsg('ModuleCTIClient', $e->getMessage(), LOG_ERR);
}