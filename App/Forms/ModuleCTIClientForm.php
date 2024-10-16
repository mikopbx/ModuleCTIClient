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

namespace Modules\ModuleCTIClient\App\Forms;

use Phalcon\Forms\Element\Check;
use Phalcon\Forms\Element\Numeric;
use Phalcon\Forms\Element\Password;
use Phalcon\Forms\Element\Radio;
use Phalcon\Forms\Element\Select;
use Phalcon\Forms\Element\Text;
use Phalcon\Forms\Form;

class ModuleCTIClientForm extends Form
{
    public function initialize($entity = null)
    {
        $this->add(new Text('server1chost'));
        $this->add(new Numeric('server1cport'));

        // Use HTTPS
        $sslModes = [
            'http'     => 'http://',
            'https'    => 'https://',
        ];

        $sslMode = new Select(
            'server1c_scheme',
            $sslModes,
            [
                'using'    => [
                    'id',
                    'name',
                ],
                'useEmpty' => false,
                'value'    => $entity->server1c_scheme
            ]
        );
        $this->add($sslMode);


        $this->add(new Text('login'));
        $this->add(new Password('secret'));
        $this->add(new Text('database'));
        $this->add(new Text('publish_name_with_auth'));

        // Web service mode
        if (intval($entity->web_service_mode) === 1) {
            $this->add(new Radio('web_service_mode_on', ['name' => 'web_service_mode', 'checked' => 'on', 'value' => 'on']));
            $this->add(new Radio('web_service_mode_off', ['name' => 'web_service_mode', 'value' => 'off']));
        } else {
            $this->add(new Radio('web_service_mode_on', ['name' => 'web_service_mode', 'value' => 'on']));
            $this->add(new Radio('web_service_mode_off', ['name' => 'web_service_mode', 'checked' => 'off', 'value' => 'off']));
        }

        $this->addCheckBox('debug_mode', intval($entity->debug_mode) === 1);
        $this->addCheckBox('auto_settings_mode', intval($entity->auto_settings_mode) === 1);

        // Set CallerID by 1C data
        $this->addCheckBox('setup_caller_id', intval($entity->setup_caller_id) === 1);

        // Set Transliterate caller ID
        $this->addCheckBox('transliterate_caller_id', intval($entity->transliterate_caller_id) === 1);
    }

    /**
     * Adds a checkbox to the form field with the given name.
     * Can be deleted if the module depends on MikoPBX later than 2024.3.0
     *
     * @param string $fieldName The name of the form field.
     * @param bool $checked Indicates whether the checkbox is checked by default.
     * @param string $checkedValue The value assigned to the checkbox when it is checked.
     * @return void
     */
    public function addCheckBox(string $fieldName, bool $checked, string $checkedValue = 'on'): void
    {
        $checkAr = ['value' => null];
        if ($checked) {
            $checkAr = ['checked' => $checkedValue,'value' => $checkedValue];
        }
        $this->add(new Check($fieldName, $checkAr));
    }
}
