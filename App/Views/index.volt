<form class="ui large grey segment form" id="module-cti-client-form">
    <div class="ui grey top right attached label" id="status"><i class="spinner loading icon"></i>{{ t._("mod_cti_UpdateStatus") }}</div>
    <div class="field">
        <div class="ui segment">
            <div class="ui toggle checkbox " id="web-service-mode-toggle">
                {{ form.render('web_service_mode') }}
                <label>{{ t._('mod_cti_PublicationOverWebServices') }}</label>
            </div>
        </div>
    </div>

    <div class="eight wide field ws-only disabled">
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
    <div class="five wide field ws-only disabled">
        <label>{{ t._('mod_cti_PublicationName') }}</label>
        {{ form.render('database') }}
    </div>
    <div class="five wide field ws-only disabled">
        <label>{{ t._('mod_cti_Login') }}</label>
        {{ form.render('login') }}
    </div>
    <div class="five wide field ws-only disabled">
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
    {{ partial("partials/submitbutton",['indexurl':'pbx-extension-modules/index/']) }}
</form>