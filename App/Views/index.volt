<form class="ui large grey segment form disability" id="module-cti-client-form">
    <input type="hidden" name="dirrty" id="dirrty"/>
    <div class="ui grey top right attached label" id="status"><i
                class="spinner loading icon"></i>{{ t._("mod_cti_UpdateStatus") }}</div>
    {# top menu #}
    <div class="ui top attached tabular menu" id="module-cti-client-tabs">
        <a class="item active" data-tab="settings">{{ t._('mod_cti_tab_Settings') }}</a>
        <a class="item" data-tab="debug">{{ t._('mod_cti_tab_debug') }}</a>
    </div>

    {# general tab #}
    <div class="ui bottom attached tab segment active" data-tab="settings">
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

    {# debug tab #}
    <div class="ui bottom attached tab segment" data-tab="debug">
        <span id="debug-info"></span>
    </div>

    {# submit button #}
    {{ partial("partials/submitbutton",['indexurl':'pbx-extension-modules/index/']) }}
</form>