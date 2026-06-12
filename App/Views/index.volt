<form class="ui large grey segment form disability" id="module-cti-client-form">
    <input type="hidden" name="dirrty" id="dirrty"/>
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
        <div class="ui warning icon message" id="cti-remote-migration-lock-message" style="display:none;">
            <i class="lock icon"></i>
            <div class="content">
                <div class="header">{{ t._('mod_cti_RemoteMigrationLockedHeader') }}</div>
                <p>{{ t._('mod_cti_RemoteMigrationLocked') }}</p>
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
        {# Overall module status — single calm summary line; replaces the old
           top-right corner badge that rolled everything into one misleading dot.
           Driven by changeStatus() in module-cti-client-status-worker.js. #}
        <div id="cti-status-summary" class="cti-status-summary cti-summary-grey">
            <span class="cti-summary-led unknown"></span>
            <span class="cti-summary-text"><i class="spinner loading icon"></i>{{ t._("mod_cti_UpdateStatus") }}</span>
        </div>
        <div id="cti-services-status" class="cti-services-status">
            <div id="cti-services-status-rows"></div>
            <div class="ui basic segment" id="cti-services-status-placeholder">
                <div class="ui active inline loader"></div>
                <span>&nbsp;{{ t._('mod_cti_StatusLoading') }}</span>
            </div>
        </div>
        <style>
            /* overall module status summary line */
            .cti-status-summary {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
                padding: 10px 14px;
                border-radius: 6px;
                font-weight: 600;
                border: 1px solid transparent;
            }
            .cti-status-summary .cti-summary-led {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                flex: 0 0 auto;
                background-color: #aaaaaa;
            }
            .cti-status-summary .cti-summary-text .icon { margin-right: 4px; }
            .cti-summary-grey   { background: #f3f4f5; color: #767676; border-color: #e0e1e2; }
            .cti-summary-grey   .cti-summary-led { background: #aaaaaa; }
            .cti-summary-green  { background: #e6f7ec; color: #1a7e3a; border-color: #b7e1c3; }
            .cti-summary-green  .cti-summary-led { background: #21ba45; box-shadow: 0 0 6px rgba(33,186,69,.55); }
            .cti-summary-yellow { background: #fff8e1; color: #8d6f12; border-color: #f3e2b3; }
            .cti-summary-yellow .cti-summary-led { background: #fbbd08; box-shadow: 0 0 6px rgba(251,189,8,.55); }
            .cti-summary-red    { background: #fdeaea; color: #c0392b; border-color: #f0c0bd; }
            .cti-summary-red    .cti-summary-led { background: #db2828; box-shadow: 0 0 6px rgba(219,40,40,.55); }
            .cti-remote-field-locked {
                opacity: .65;
            }
            .cti-remote-field-locked input,
            .cti-remote-field-locked textarea,
            .cti-remote-field-locked .ui.checkbox {
                pointer-events: none;
            }
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
            /* status table */
            .cti-status-table { margin-top: 0 !important; }
            .cti-status-table thead th {
                background: #f9fafb;
                font-size: 0.85em;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: #767676;
                white-space: nowrap;
            }
            .cti-status-table td { vertical-align: middle; }
            .cti-status-table .cti-col-status   { width: 1%; white-space: nowrap; }
            .cti-status-table .cti-col-loc      { width: 1%; white-space: nowrap; text-align: center; }
            .cti-status-table .cti-col-uptime,
            .cti-status-table .cti-col-version  { width: 1%; white-space: nowrap; color: #555; }
            /* LED indicator + state text */
            .cti-status-table .cti-svc-led {
                display: inline-block;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                margin-right: 8px;
                background-color: #767676;
                box-shadow: 0 0 0 2px rgba(0,0,0,.06) inset;
                vertical-align: middle;
            }
            .cti-status-table .cti-svc-led.ok      { background-color: #21ba45; box-shadow: 0 0 6px rgba(33,186,69,.55); }
            .cti-status-table .cti-svc-led.warn    { background-color: #fbbd08; box-shadow: 0 0 6px rgba(251,189,8,.55); }
            .cti-status-table .cti-svc-led.error   { background-color: #db2828; box-shadow: 0 0 6px rgba(219,40,40,.55); }
            .cti-status-table .cti-svc-led.unknown { background-color: #aaaaaa; }
            .cti-status-table .cti-svc-state { vertical-align: middle; }
            .cti-status-table .cti-svc-name  { font-weight: 600; }
            .cti-status-table .cti-svc-name .icon { color: #aaa; margin-right: 4px; }
            /* channel (area) sub-rows under a messenger group */
            .cti-status-table .cti-svc-channel {
                font-weight: 500;
                font-family: monospace;
                color: #555;
            }
            .cti-status-table .cti-svc-subrow td.cti-col-name { padding-left: 2.2em; }
            /* group header row for multi-instance messenger services */
            .cti-status-table tr.cti-svc-group td {
                background: #f3f4f5;
                font-weight: 700;
                color: #333;
            }
            .cti-status-table tr.cti-svc-group .icon { color: #2185d0; margin-right: 6px; }
            .cti-status-table tr.cti-svc-group .cti-svc-count {
                display: inline-block;
                margin-left: 8px;
                padding: 0 7px;
                border-radius: 9px;
                background: #d4d8db;
                color: #444;
                font-size: 0.8em;
                font-weight: 700;
            }
            /* location badges */
            .cti-status-table .cti-loc-badge { font-size: 0.78em !important; }
            .cti-status-table .cti-loc-local { color: #999; font-size: 0.85em; white-space: nowrap; }
            .cti-status-table .cti-loc-local .icon { margin-right: 2px; }
            .cti-status-table .cti-dim { color: #ccc; }
            /* inline error sub-row */
            .cti-status-table tr.cti-svc-error-row td {
                padding-top: 2px;
                border-top: none !important;
                color: #db2828;
                font-size: 0.85em;
            }
            .cti-status-table tr.cti-svc-error-row .icon { color: #db2828; }
        </style>
    </div>

    {# debug tab #}
    <div class="ui bottom attached tab segment" data-tab="debug">
        <span id="debug-info"></span>
    </div>

    {# submit button #}
    {{ partial("partials/submitbutton",['indexurl':'pbx-extension-modules/index/']) }}
</form>
