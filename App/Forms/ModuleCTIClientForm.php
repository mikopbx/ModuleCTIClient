<?php
/**
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 7 2018
 *
 */

namespace Modules\ModuleCTIClient\App\Forms;
use Phalcon\Forms\Element\Check;
use Phalcon\Forms\Element\Numeric;
use Phalcon\Forms\Element\Password;
use Phalcon\Forms\Element\Text;
use Phalcon\Forms\Form;


class ModuleCTIClientForm extends Form
{

    public function initialize($entity = null, $options = null)
    {
        $this->add(new Text('server1chost'));
        $this->add(new Numeric('server1cport'));
        $this->add(new Text('login'));
        $this->add(new Password('secret'));
        $this->add(new Text('database'));

        // Web service mode
        $cheskarr = ['value' => null];
        if ($entity->web_service_mode) {
            $cheskarr = ['checked' => 'checked', 'value' => null];
        }
        $this->add(new Check('web_service_mode', $cheskarr));

        // Debug mode
        $cheskarr = ['value' => null];
        if ($entity->debug_mode) {
            $cheskarr = ['checked' => 'checked', 'value' => null];
        }
        $this->add(new Check('debug_mode', $cheskarr));
    }
}