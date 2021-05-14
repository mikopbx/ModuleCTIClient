<form class="ui large grey segment form" id="module-cti-client-form">
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
                <div class="ui radio checkbox web-service-radio" id="web-service-mode-toggle">
                    {{ form.render('web_service_mode_on') }}
                    <label>{{ t._('mod_cti_PublicationOverWebServices') }}</label>
                </div>
            </div>
            <div class="field">
                <div class="ui radio checkbox web-service-radio">
                    {{ form.render('web_service_mode_off') }}
                    <label>{{ t._('mod_cti_PublicationOverLongPool') }}</label>
                </div>
            </div>
        </div>


        <div class="eight wide field ws-only disabled only-manual-settings">
            <label>{{ t._('mod_cti_Server1CHostPort') }}</label>
            <div class="inline fields">
                <div class="twelve wide field">
                    {{ form.render('server1chost') }}
                </div>
                <div class="four wide field">
                    {{ form.render('server1cport') }}
                </div>
            </div>
        </div>
        <div class="five wide field ws-only disabled only-manual-settings">
            <label>{{ t._('mod_cti_PublicationName') }}</label>
            {{ form.render('database') }}
        </div>
        <div class="five wide field ws-only disabled only-manual-settings">
            <label>{{ t._('mod_cti_Login') }}</label>
            {{ form.render('login') }}
        </div>
        <div class="five wide field ws-only disabled only-manual-settings">
            <label>{{ t._('mod_cti_Password') }}</label>
            {{ form.render('secret') }}
        </div>

        <div class="field">
            <div class="ui segment">
                <div class="ui toggle checkbox " id="debug-mode-toggle">
                    {{ form.render('debug_mode') }}
                    <label>{{ t._('mod_cti_EnableDebugMode') }}</label>
                </div>
            </div>
        </div>
    </div>
    {# debug tab #}
    <div class="ui bottom attached tab segment" data-tab="debug">
        <span id="debug-info"></span>
    </div>
    {{ partial("partials/submitbutton",['indexurl':'pbx-extension-modules/index/']) }}
</form>