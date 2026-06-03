<form class="ui large grey segment form disability" id="module-cti-client-form">
    <input type="hidden" name="dirrty" id="dirrty"/>
    <div class="ui grey top right attached label" id="status"><i
                class="spinner loading icon"></i>{{ t._("mod_cti_UpdateStatus") }}</div>
    {# top menu #}
    <div class="ui top attached tabular menu" id="module-cti-client-tabs">
        <a class="item active" data-tab="status">{{ t._('mod_cti_tab_Status') }}</a>
        <a class="item" data-tab="settings">{{ t._('mod_cti_tab_Settings') }}</a>
        <a class="item" data-tab="messengers">{{ t._('mod_cti_tab_Messengers') }}</a>
        <a class="item" data-tab="remote">{{ t._('mod_cti_tab_Remote') }}</a>
        <a class="item" data-tab="debug">{{ t._('mod_cti_tab_debug') }}</a>
    </div>

    {# general tab #}
    <div class="ui bottom attached tab segment" data-tab="settings">
        <div class="field">
            <div class="ui icon message">
                <i class="wrench icon"></i>
                <div class="content">
                    <div class="header">{{ t._('mod_cti_OdinEsSetupHeaderMessage') }}</div>
                    <ul class="list">
                        <li>{{ t._('mod_cti_OdinEsSetupMessageStep1') }}</li>
                        <li>{{ t._('mod_cti_OdinEsSetupMessageStep2') }}</li>
                        <li>{{ t._('mod_cti_OdinEsSetupMessageStep3') }}</li>
                        <li>{{ t._('mod_cti_OdinEsSetupMessageStep4') }}</li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="ui hidden divider"></div>
        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox" id="auto-settings-mode-toggle">
                    {{ form.render('auto_settings_mode') }}
                    <label for="auto_settings_mode">{{ t._('mod_cti_UseAutoSettings') }}</label>
                </div>
            </div>
        </div>
        <div class="ui hidden divider"></div>

        <div class="field only-auto-settings">
            <label for="auto_settings_value">{{ t._('mod_cti_AutoSettingsData') }}</label>
            <textarea  name="auto_settings_value" readonly style="overflow: hidden; overflow-wrap: break-word; resize: horizontal; height: 134px;" spellcheck="false">{{ autoSettingsValue }}</textarea>
        </div>


        <div class="grouped fields only-manual-settings">
            <label>{{ t._('mod_cti_PublicationOverHeader') }}</label>
            <div class="field">
                <div class="ui radio checkbox web-service-radio">
                    {{ form.render('web_service_mode_off') }}
                    <label for="web_service_mode_off">{{ t._('mod_cti_PublicationOverLongPool') }}</label>
                </div>
            </div>
            <div class="field">
                <div class="ui radio checkbox web-service-radio" id="web-service-mode-toggle">
                    {{ form.render('web_service_mode_on') }}
                    <label for="web_service_mode_on">{{ t._('mod_cti_PublicationOverWebServices') }}</label>
                </div>
            </div>
        </div>

        <div class="field ws-only disabled only-manual-settings">
            <label>{{ t._('mod_cti_Server1CHostPort') }}</label>
            <div class="twelve wide inline fields">
                <div class="twelve wide field">
                    <div class="ui left labeled input">
                        <div class="ui dropdown label server1c_scheme">
                            <div class="text">http://</div>
                            <i class="dropdown icon"></i>
                            {{ form.render('server1c_scheme') }}
                        </div>
                        {{ form.render('server1chost') }}
                    </div>
                </div>
                <div class="four wide field">
                    {{ form.render('server1cport') }}
                </div>
            </div>
        </div>
        <div class="field ws-only disabled only-manual-settings">
            <label for="database">{{ t._('mod_cti_PublicationName') }}</label>
            <div class="five wide field">
                {{ form.render('database') }}
            </div>
        </div>
        <div class="field ws-only disabled only-manual-settings">
            <label for="publish_name_with_auth">{{ t._('mod_cti_PublicationNameForAuth') }}</label>
            <div class="five wide field">
                {{ form.render('publish_name_with_auth') }}
            </div>
        </div>
        <div class="field ws-only disabled only-manual-settings">
            <label for="login">{{ t._('mod_cti_Login') }}</label>
            <div class="five wide field">
                {{ form.render('login') }}
            </div>
        </div>
        <div class="field ws-only disabled only-manual-settings">
            <label for="secret">{{ t._('mod_cti_Password') }}</label>
            <div class="five wide field">
                {{ form.render('secret') }}
            </div>
        </div>

        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox " id="debug-mode-toggle">
                    {{ form.render('debug_mode') }}
                    <label for="debug_mode">{{ t._('mod_cti_EnableDebugMode') }}</label>
                </div>
            </div>
        </div>

        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox " id="setup-caller-id-toggle">
                    {{ form.render('setup_caller_id') }}
                    <label for="setup_caller_id">{{ t._('mod_cti_EnableSetCallerID') }}</label>
                </div>
            </div>
        </div>
        <div class="field" id="transliterate-caller-id-toggle-block">
            <div class="ui segment">
                <div class="ui toggle checkbox " id="transliterate-caller-id-toggle">
                    {{ form.render('transliterate_caller_id') }}
                    <label for="transliterate_caller_id">{{ t._('mod_cti_TransliterateCallerID') }}</label>
                </div>
            </div>
        </div>

    </div>

    {# messengers tab #}
    <div class="ui bottom attached tab segment" data-tab="messengers">
        <p style="color:#666;margin-bottom:1.2em;">{{ t._('mod_cti_ProxyIntro') }}</p>

        <div class="field">
            <label>{{ t._('mod_cti_WhatsappProxyHeader') }}</label>
            {{ form.render('whatsapp_proxy_address') }}
        </div>
        <div class="field">
            <label>{{ t._('mod_cti_TelegramProxyHeader') }}</label>
            {{ form.render('telegram_proxy_address') }}
        </div>
        <div class="field">
            <label>{{ t._('mod_cti_MaxProxyHeader') }}</label>
            {{ form.render('max_proxy_address') }}
        </div>

        <h5 class="ui dividing header" style="margin-top:1.5em;">{{ t._('mod_cti_MtProxyHeader') }}</h5>
        <div class="two fields">
            <div class="field">
                <label>{{ t._('mod_cti_MtProxyAddress') }}</label>
                {{ form.render('mt_proxy_address') }}
            </div>
            <div class="field">
                <label>{{ t._('mod_cti_MtProxySecret') }}</label>
                {{ form.render('mt_proxy_secret') }}
            </div>
        </div>
        <div class="ui small text" style="color:#666;">{{ t._('mod_cti_MtProxyHint') }}</div>

        <div style="display:none;">{{ form.render('chats_proxy_address') }}</div>
    </div>

    {# remote messenger server tab #}
    <div class="ui bottom attached tab segment" data-tab="remote">
        <div class="ui icon message">
            <i class="server icon"></i>
            <div class="content">
                <div class="header">{{ t._('mod_cti_RemoteHeader') }}</div>
                <p>{{ t._('mod_cti_RemoteIntro') }}</p>
            </div>
        </div>

        <h4 class="ui dividing header">{{ t._('mod_cti_RemoteConnectionHeader') }}</h4>
        <div class="two fields">
            <div class="field">
                <label for="remote_host">{{ t._('mod_cti_RemoteHost') }}</label>
                {{ form.render('remote_host') }}
            </div>
            <div class="field">
                <label for="remote_ssh_port">{{ t._('mod_cti_RemoteSshPort') }}</label>
                {{ form.render('remote_ssh_port') }}
            </div>
        </div>
        <div class="two fields">
            <div class="field">
                <label for="remote_ssh_login">{{ t._('mod_cti_RemoteSshLogin') }}</label>
                {{ form.render('remote_ssh_login') }}
            </div>
            <div class="field">
                <label for="remote_bin_dir">{{ t._('mod_cti_RemoteBinDir') }}</label>
                {{ form.render('remote_bin_dir') }}
            </div>
        </div>
        <div class="field">
            <label for="remote_ssh_key">{{ t._('mod_cti_RemoteSshKey') }}</label>
            {{ form.render('remote_ssh_key') }}
            <div class="ui small text" style="color:#666;">{{ t._('mod_cti_RemoteSshKeyHint') }}</div>
        </div>
        <div class="field">
            <button type="button" class="ui basic button" id="cti-test-remote-conn">
                <i class="plug icon"></i>
                <span id="cti-test-remote-conn-label">{{ t._('mod_cti_RemoteTestConnection') }}</span>
            </button>
            <span id="cti-test-remote-conn-result" class="ui small text" style="margin-left:1em;"></span>
        </div>

        <h4 class="ui dividing header">{{ t._('mod_cti_RemoteServicesHeader') }}</h4>
        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox">
                    {{ form.render('remote_whatsapp') }}
                    <label for="remote_whatsapp">{{ t._('mod_cti_RemoteWhatsApp') }}</label>
                </div>
            </div>
        </div>
        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox">
                    {{ form.render('remote_telegram') }}
                    <label for="remote_telegram">{{ t._('mod_cti_RemoteTelegram') }}</label>
                </div>
            </div>
        </div>
        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox">
                    {{ form.render('remote_max') }}
                    <label for="remote_max">{{ t._('mod_cti_RemoteMax') }}</label>
                </div>
            </div>
        </div>
    </div>

    {# services status tab #}
    <div class="ui bottom attached tab segment active" data-tab="status">
        <h4 class="ui dividing header">{{ t._('mod_cti_StatusHeader') }}</h4>
        <div id="cti-services-status" class="cti-services-status">
            <div id="cti-services-status-rows"></div>
            <div class="ui basic segment" id="cti-services-status-placeholder">
                <div class="ui active inline loader"></div>
                <span>&nbsp;{{ t._('mod_cti_StatusLoading') }}</span>
            </div>
        </div>
        <style>
            #cti-services-status {
                position: relative;
                min-height: 280px;
            }
            #cti-services-status-placeholder {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255,255,255,.85);
                z-index: 2;
            }
            .cti-services-status .cti-svc-row {
                display: flex;
                align-items: center;
                padding: 6px 10px;
                border-bottom: 1px solid rgba(34,36,38,.08);
                gap: 10px;
                flex-wrap: wrap;
            }
            .cti-services-status .cti-svc-row:last-child { border-bottom: none; }
            .cti-services-status .cti-svc-led {
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #767676;
                box-shadow: 0 0 0 2px rgba(0,0,0,.06) inset;
                flex-shrink: 0;
            }
            .cti-services-status .cti-svc-led.ok      { background-color: #21ba45; }
            .cti-services-status .cti-svc-led.warn    { background-color: #fbbd08; }
            .cti-services-status .cti-svc-led.error   { background-color: #db2828; }
            .cti-services-status .cti-svc-led.unknown { background-color: #767676; }
            .cti-services-status .cti-svc-name   { font-weight: 600; min-width: 160px; }
            .cti-services-status .cti-svc-area   { font-family: monospace; color: #888; font-size: 0.9em; }
            .cti-services-status .cti-svc-meta   { color: #555; font-size: 0.9em; }
            .cti-services-status .cti-svc-error  { color: #db2828; font-size: 0.9em; }
            .cti-services-status .cti-svc-group-header {
                margin-top: 10px;
                font-weight: 700;
                padding: 4px 0;
                color: #333;
            }
        </style>
    </div>

    {# debug tab #}
    <div class="ui bottom attached tab segment" data-tab="debug">
        <span id="debug-info"></span>
    </div>

    {# submit button #}
    {{ partial("partials/submitbutton",['indexurl':'pbx-extension-modules/index/']) }}
</form>