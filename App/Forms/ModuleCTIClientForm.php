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

    public function initialize($entity = null, $options = null)
    {
        $this->add(new Text('server1chost'));
        $this->add(new Numeric('server1cport'));

        // Use HTTPS
        $sslModes = [
            'http'     => 'http://',
            'https'    => 'https://',
        ];

        $sslmode = new Select(
            'server1c_scheme', $sslModes, [
                'using'    => [
                    'id',
                    'name',
                ],
                'useEmpty' => false,
                'value'    => $entity->server1c_scheme
            ]
        );
        $this->add($sslmode);


        $this->add(new Text('login'));
        $this->add(new Password('secret'));
        $this->add(new Text('database'));
        $this->add(new Text('publish_name_with_auth'));

        // Web service mode
        if ($entity->web_service_mode==='1') {
            $this->add(new Radio('web_service_mode_on', ['name'=>'web_service_mode', 'checked'=>'checked', 'value'=>'on']));
            $this->add(new Radio('web_service_mode_off', ['name'=>'web_service_mode', 'value'=>'off']));
        } else {
            $this->add(new Radio('web_service_mode_on', ['name'=>'web_service_mode', 'value'=>'on']));
            $this->add(new Radio('web_service_mode_off', ['name'=>'web_service_mode', 'checked'=>'checked', 'value'=>'off']));
        }

        // Debug mode
        $cheskarr = ['value' => null];
        if ($entity->debug_mode==='1') {
            $cheskarr = ['checked' => 'checked', 'value' => null];
        }
        $this->add(new Check('debug_mode', $cheskarr));

        // Auto settings mode
        $cheskarr = ['value' => null];
        if ($entity->auto_settings_mode==='1') {
            $cheskarr = ['checked' => 'checked', 'value' => null];
        }
        $this->add(new Check('auto_settings_mode', $cheskarr));

        // Set CallerID by 1C data
        $cheskarr = ['value' => null];
        if ($entity->setup_caller_id==='1') {
            $cheskarr = ['checked' => 'checked', 'value' => null];
        }
        $this->add(new Check('setup_caller_id', $cheskarr));

        // Set Transliterate caller ID
         $cheskarr = ['value' => null];
        if ($entity->transliterate_caller_id==='1') {
            $cheskarr = ['checked' => 'checked', 'value' => null];
        }
        $this->add(new Check('transliterate_caller_id', $cheskarr));
    }
}