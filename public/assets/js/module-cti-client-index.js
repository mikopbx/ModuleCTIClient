function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */

var moduleCTIClient = {
  $wsToggle: $('#web-service-mode-toggle'),
  $wsToggleRadio: $('#module-cti-client-form .web-service-radio'),
  $statusToggle: $('#module-status-toggle'),
  $callerIdSetupToggle: $('#setup-caller-id-toggle'),
  $callerIdTransliterationToggleBlock: $('#transliterate-caller-id-toggle-block'),
  $formObj: $('#module-cti-client-form'),
  $moduleStatus: $('#cti-status-summary'),
  $remoteMigrationLockMessage: $('#cti-remote-migration-lock-message'),
  $debugToggle: $('#debug-mode-toggle'),
  $autoSettingsToggle: $('#auto-settings-mode-toggle'),
  $crmTypeRadios: $('#module-cti-client-form .crm-type-radio'),
  $crmSettingsBlock: $('#crm-1c-settings-block'),
  $crmHiddenTabs: $('#module-cti-client-tabs .item[data-tab="messengers"], #module-cti-client-tabs .item[data-tab="remote"]'),
  $onlyAutoSettingsVisible: $('#module-cti-client-form .only-auto-settings'),
  $onlyManualSettingsVisible: $('#module-cti-client-form .only-manual-settings'),
  $wsOnlyFields: $('.ws-only'),
  $dirrtyField: $('#dirrty'),
  $sslModeSelect: $('.server1c_scheme select'),
  $debugTab: $('#module-cti-client-tabs .item[data-tab="debug"]'),
  remoteMigrationLocked: false,
  remoteMigrationLockServices: [],
  remoteMigrationLockListenerBound: false,
  remoteProtectedFieldIds: ['remote_host', 'remote_ssh_port', 'remote_ssh_login', 'remote_ssh_key', 'remote_bin_dir'],
  remoteToggleFieldIds: ['remote_whatsapp', 'remote_telegram', 'remote_max'],
  remoteServiceLabelKeys: {
    chats: 'mod_cti_svc_chats',
    tg: 'mod_cti_svc_tg',
    max: 'mod_cti_svc_max'
  },
  validateRules: {
    server1chost: {
      identifier: 'server1chost',
      rules: [{
        type: 'emptyCustomRule',
        prompt: globalTranslate.mod_cti_ValidateServer1CHostEmpty
      }]
    },
    server1cport: {
      identifier: 'server1cport',
      rules: [{
        type: 'wrongPortCustomRule',
        prompt: globalTranslate.mod_cti_ValidateServer1CPortRange
      }]
    },
    database: {
      identifier: 'database',
      rules: [{
        type: 'emptyCustomRule',
        prompt: globalTranslate.mod_cti_ValidatePubName
      }]
    }
  },
  initialize: function initialize() {
    ctiTlsPanel.initialize();
    $('#allow-legacy-clients-toggle').checkbox({
      beforeChecked: function beforeChecked() {
        return window.confirm(globalTranslate.mod_cti_LegacyClientsWarning);
      }
    });
    moduleCTIClient.initializeDownloadClientDropdown();
    moduleCTIClient.initializeClientScreenshotGallery();
    $('#module-cti-client-form .item').tab();
    if (moduleCTIClient.$debugToggle.checkbox('is unchecked')) {
      moduleCTIClient.$debugTab.hide();
    }
    moduleCTIClient.$debugToggle.checkbox({
      onChecked: function onChecked() {
        moduleCTIClient.$debugTab.show();
      },
      onUnchecked: function onUnchecked() {
        moduleCTIClient.$debugTab.hide();
      }
    });
    moduleCTIClient.crmTypeToggle();
    moduleCTIClient.$crmTypeRadios.checkbox({
      onChecked: function onChecked() {
        moduleCTIClient.$dirrtyField.val(Math.random());
        moduleCTIClient.$dirrtyField.trigger('change');
        moduleCTIClient.crmTypeToggle();
      }
    });
    moduleCTIClient.$callerIdSetupToggle.checkbox({
      onChange: moduleCTIClient.setCallerIdToggle
    });
    if (moduleCTIClient.$autoSettingsToggle.checkbox('is checked')) {
      moduleCTIClient.$onlyManualSettingsVisible.hide();
    } else {
      moduleCTIClient.$onlyAutoSettingsVisible.hide();
    }
    moduleCTIClient.$autoSettingsToggle.checkbox({
      onChecked: function onChecked() {
        moduleCTIClient.$onlyAutoSettingsVisible.show();
        moduleCTIClient.$onlyManualSettingsVisible.hide();
        moduleCTIClient.$dirrtyField.val(Math.random());
        moduleCTIClient.$dirrtyField.trigger('change');
        Form.validateRules = {};
      },
      onUnchecked: function onUnchecked() {
        moduleCTIClient.$dirrtyField.val(Math.random());
        moduleCTIClient.$dirrtyField.trigger('change');
        moduleCTIClient.$onlyAutoSettingsVisible.hide();
        moduleCTIClient.$onlyManualSettingsVisible.show();
        Form.validateRules = moduleCTIClient.validateRules;
      }
    });
    if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
      moduleCTIClient.enableWsFields();
    }
    moduleCTIClient.$wsToggleRadio.checkbox({
      onChecked: function onChecked() {
        moduleCTIClient.$dirrtyField.val(Math.random());
        moduleCTIClient.$dirrtyField.trigger('change');
        if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
          moduleCTIClient.enableWsFields();
        } else {
          moduleCTIClient.disableWsFields();
        }
      }
    });
    moduleCTIClient.$sslModeSelect.dropdown({
      onChange: moduleCTIClient.cbSslModeOnChange
    });
    moduleCTIClient.initializeForm();
    moduleCTIClient.checkStatusToggle();
    moduleCTIClient.setCallerIdToggle();
    moduleCTIClient.initializeRemoteMigrationLock();
    moduleCTIClient.initializeRemoteConnectionTest();
    moduleCTIClient.initializeRemoteFailback();
    window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
  },
  /**
   * Галерея скриншотов клиента: клик по миниатюре подменяет большое превью.
   */
  initializeClientScreenshotGallery: function initializeClientScreenshotGallery() {
    var $thumbs = $('#cti-client-screenshots .cti-screenshot-thumb');
    var $preview = $('#cti-screenshot-preview');
    if ($thumbs.length === 0 || $preview.length === 0) {
      return;
    }
    $thumbs.off('click.ctiGallery').on('click.ctiGallery', function (e) {
      var $thumb = $(e.currentTarget);
      $thumbs.removeClass('active');
      $thumb.addClass('active');
      $preview.attr('src', $thumb.attr('data-full'));
    });
  },
  /**
   * Дропдаун «Скачать» с вечными ссылками на клиент Miko CTI.
   * Слушатель вешается до .tab() — тот тоже вешает click на все .item формы,
   * stopImmediatePropagation не даёт ему перехватить переход по ссылке.
   */
  initializeDownloadClientDropdown: function initializeDownloadClientDropdown() {
    var $dropdown = $('#cti-download-client');
    if ($dropdown.length === 0) {
      return;
    }
    $dropdown.find('.menu a.item').off('click.ctiDownload').on('click.ctiDownload', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var url = $(e.currentTarget).attr('href');
      if (url) {
        window.open(url, '_blank', 'noopener');
      }
      $dropdown.dropdown('hide');
    });
    $dropdown.dropdown({
      action: 'nothing'
    });
  },
  /**
   * Подписка на статус активной миграции мессенджеров.
   */
  initializeRemoteMigrationLock: function initializeRemoteMigrationLock() {
    if (!moduleCTIClient.remoteMigrationLockListenerBound) {
      window.addEventListener('RemoteMigrationLockChanged', moduleCTIClient.setRemoteMigrationLock);
      moduleCTIClient.remoteMigrationLockListenerBound = true;
    }
    moduleCTIClient.applyRemoteMigrationLock();
  },
  /**
   * Обновить состояние блокировки remote/VPS полей.
   * @param {CustomEvent} event
   */
  setRemoteMigrationLock: function setRemoteMigrationLock(event) {
    var detail = event && event.detail ? event.detail : {};
    moduleCTIClient.remoteMigrationLocked = detail.active === true;
    moduleCTIClient.remoteMigrationLockServices = Array.isArray(detail.services) ? detail.services : [];
    moduleCTIClient.applyRemoteMigrationLock();
  },
  /**
   * Применить текущую блокировку к полям формы без disabled-атрибутов:
   * values должны продолжать отправляться при сохранении других настроек.
   */
  applyRemoteMigrationLock: function applyRemoteMigrationLock() {
    var locked = moduleCTIClient.remoteMigrationLocked === true;
    var $remoteInputs = moduleCTIClient.getRemoteProtectedInputs();
    var $remoteToggles = moduleCTIClient.getRemoteToggleInputs();
    var $remoteTestButton = $('#cti-test-remote-conn');
    $remoteInputs.prop('readonly', locked).attr('aria-disabled', locked ? 'true' : 'false').closest('.field').toggleClass('cti-remote-field-locked', locked);
    if (locked) {
      $remoteInputs.attr('tabindex', '-1');
    } else {
      $remoteInputs.removeAttr('tabindex');
    }
    $remoteToggles.attr('aria-disabled', locked ? 'true' : 'false').closest('.ui.segment').toggleClass('cti-remote-field-locked', locked);
    if (locked) {
      $remoteToggles.attr('tabindex', '-1');
    } else {
      $remoteToggles.removeAttr('tabindex');
    }
    $remoteTestButton.toggleClass('disabled', locked).attr('aria-disabled', locked ? 'true' : 'false');
    if (moduleCTIClient.$remoteMigrationLockMessage.length > 0) {
      var serviceText = moduleCTIClient.formatRemoteMigrationServices(moduleCTIClient.remoteMigrationLockServices);
      var baseText = globalTranslate.mod_cti_RemoteMigrationLocked || 'Messenger migration is in progress. Remote settings are locked until it finishes.';
      var text = serviceText === '' ? baseText : "".concat(baseText, " (").concat(serviceText, ")");
      moduleCTIClient.$remoteMigrationLockMessage.find('p').text(text);
      moduleCTIClient.$remoteMigrationLockMessage.toggle(locked);
    }
  },
  /**
   * @returns {jQuery}
   */
  getRemoteProtectedInputs: function getRemoteProtectedInputs() {
    return $(moduleCTIClient.remoteProtectedFieldIds.map(function (id) {
      return "#".concat(id);
    }).join(','));
  },
  /**
   * @returns {jQuery}
   */
  getRemoteToggleInputs: function getRemoteToggleInputs() {
    return $(moduleCTIClient.remoteToggleFieldIds.map(function (id) {
      return "#".concat(id);
    }).join(','));
  },
  /**
   * @param {string[]} services
   * @returns {string}
   */
  formatRemoteMigrationServices: function formatRemoteMigrationServices(services) {
    if (!Array.isArray(services) || services.length === 0) {
      return '';
    }
    return services.map(function (service) {
      var key = moduleCTIClient.remoteServiceLabelKeys[service];
      if (key && globalTranslate[key]) {
        return globalTranslate[key];
      }
      return service;
    }).join(', ');
  },
  /**
   * Preserve locked remote values in POST data when saving unrelated settings.
   * @param {Object} formData
   * @returns {Object}
   */
  syncRemoteFieldsBeforeSubmit: function syncRemoteFieldsBeforeSubmit(formData) {
    if (moduleCTIClient.remoteMigrationLocked !== true) {
      return formData;
    }
    moduleCTIClient.remoteProtectedFieldIds.forEach(function (id) {
      formData[id] = $("#".concat(id)).val() || '';
    });
    moduleCTIClient.remoteToggleFieldIds.forEach(function (id) {
      formData[id] = $("#".concat(id)).is(':checked') ? 'on' : '';
    });
    return formData;
  },
  /**
   * Кнопка «Проверить подключение» на вкладке Удалённые мессенджеры —
   * берёт значения формы (host/port/login/key), POSTит на бекенд,
   * показывает результат inline. Сохранение не делает.
   */
  initializeRemoteConnectionTest: function initializeRemoteConnectionTest() {
    var $btn = $('#cti-test-remote-conn');
    var $result = $('#cti-test-remote-conn-result');
    if ($btn.length === 0) {
      return;
    }
    var renderResult = function renderResult(probe, fallbackErr) {
      $btn.removeClass('loading disabled');
      moduleCTIClient.applyRemoteMigrationLock();
      if (probe && probe.ok === true) {
        var okLabel = globalTranslate.mod_cti_RemoteTestOk || 'Connection OK';
        var arch = probe.arch ? " ".concat(probe.arch) : '';
        var rwLabel = globalTranslate.mod_cti_RemoteTestRwOk || 'rw OK';
        $result.css('color', '#21ba45').text("".concat(okLabel, " \u2014").concat(arch, ", ").concat(rwLabel));
        return;
      }
      var failLabel = globalTranslate.mod_cti_RemoteTestFail || 'Connection failed';
      var err = probe && probe.error ? probe.error : fallbackErr || '';
      $result.css('color', '#db2828').text(err ? "".concat(failLabel, ": ").concat(err) : failLabel);
    };
    $btn.off('click.ctiRemoteTest').on('click.ctiRemoteTest', function (e) {
      e.preventDefault();
      if (moduleCTIClient.remoteMigrationLocked === true) {
        return;
      }
      $btn.addClass('loading disabled');
      $result.removeClass('green red').css('color', '#666').text(globalTranslate.mod_cti_RemoteTestRunning || 'Probing…');
      // Don't send the masked saved key back to the server — empty key
      // tells the backend to fall back to the DB value transparently.
      var rawKey = $('#remote_ssh_key').val() || '';
      var keyForPost = rawKey.indexOf('******') !== -1 ? '' : rawKey;
      $.ajax({
        url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/testRemoteConnection"),
        method: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          host: $('#remote_host').val() || '',
          port: $('#remote_ssh_port').val() || '',
          login: $('#remote_ssh_login').val() || '',
          key: keyForPost,
          base: $('#remote_bin_dir').val() || ''
        }),
        success: function success(response) {
          // PBXApiResult: { result, data: {ok, arch, error}, messages, ... }
          var probe = response && response.data ? response.data : null;
          var msg = response && Array.isArray(response.messages) && response.messages.length > 0 ? response.messages.join('; ') : '';
          renderResult(probe, msg);
        },
        error: function error(xhr) {
          // Core#1166: newer cores send a failed probe as HTTP 4xx with the same JSON body.
          if (xhr.responseJSON && _typeof(xhr.responseJSON) === 'object') {
            this.success(xhr.responseJSON);
            return;
          }
          renderResult(null, "HTTP ".concat(xhr.status || 'error'));
        }
      });
    });
  },
  /**
   * Phase C: операторский failback вынесенного сервиса обратно на локаль.
   * Кнопка живёт в панели статусов, которая перерисовывается на каждом опросе,
   * поэтому слушатель делегированный (на document). Бэкенд снимает тумблер
   * (fence) и поднимает локаль из локальной копии сессии.
   */
  initializeRemoteFailback: function initializeRemoteFailback() {
    $(document).off('click.ctiFailback', '.cti-failback-btn').on('click.ctiFailback', '.cti-failback-btn', function (e) {
      e.preventDefault();
      var $btn = $(e.currentTarget);
      var svc = $btn.attr('data-svc') || '';
      if (svc === '' || $btn.hasClass('disabled')) {
        return;
      }
      var confirmMsg = globalTranslate.mod_cti_FailbackConfirm || 'Bring this service back to local from the last local copy? ' + 'The VPS will be turned off for it.';
      // eslint-disable-next-line no-alert
      if (!window.confirm(confirmMsg)) {
        return;
      }
      $btn.addClass('loading disabled');
      var failLabel = globalTranslate.mod_cti_FailbackFailed || 'Failback failed';
      $.ajax({
        url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/failback"),
        method: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          service: svc
        }),
        success: function success(response) {
          var ok = response && response.data && response.data.ok === true;
          if (ok) {
            // Mirror the fence into the open settings form: the backend
            // already cleared the remote toggle in the DB, but a later
            // settings save would re-post the still-checked box and undo
            // it — so uncheck it here too.
            var fieldMap = {
              chats: 'remote_whatsapp',
              tg: 'remote_telegram',
              max: 'remote_max'
            };
            var field = fieldMap[svc];
            if (field) {
              var $cb = $("#".concat(field));
              $cb.prop('checked', false);
              $cb.closest('.ui.checkbox').checkbox('set unchecked');
            }
            // Leave the button busy; the status worker re-polls within
            // a few seconds, the service flips to local and the row
            // (with its button) disappears on the next render.
            // Safety net: if the re-poll hasn't removed the row within
            // ~15s (backend didn't converge), drop the busy state so the
            // operator can retry instead of a permanently-spinning button.
            // No-op if the row was already removed (button detached).
            setTimeout(function () {
              $btn.removeClass('loading disabled');
            }, 15000);
            return;
          }
          $btn.removeClass('loading disabled');
          var msg = response && Array.isArray(response.messages) && response.messages.length > 0 ? response.messages.join('; ') : '';
          // eslint-disable-next-line no-alert
          window.alert(msg ? "".concat(failLabel, ": ").concat(msg) : failLabel);
        },
        error: function error(xhr) {
          // Core#1166: newer cores send a refused failback as HTTP 4xx with the same JSON body.
          if (xhr.responseJSON && _typeof(xhr.responseJSON) === 'object') {
            this.success(xhr.responseJSON);
            return;
          }
          $btn.removeClass('loading disabled');
          // eslint-disable-next-line no-alert
          window.alert("".concat(failLabel, ": HTTP ").concat(xhr.status || 'error'));
        }
      });
    });
  },
  /**
   * Проверка состояния модуля
   */
  checkStatusToggle: function checkStatusToggle() {
    if (moduleCTIClient.$statusToggle.checkbox('is checked')) {
      $('.disability').removeClass('disabled');
      moduleCTIClient.$moduleStatus.show();
      moduleCTIClientConnectionCheckWorker.initialize();
    } else {
      moduleCTIClient.$moduleStatus.hide();
      moduleCTIClient.$moduleStatus.hide();
      $('.disability').addClass('disabled');
      $('.message.ajax').remove();
    }
  },
  /**
   * Переключатель установки CallerID из 1С
   * Прячет или показывает статус транслитерации
   */
  setCallerIdToggle: function setCallerIdToggle() {
    if (moduleCTIClient.$callerIdSetupToggle.checkbox('is checked')) {
      moduleCTIClient.$callerIdTransliterationToggleBlock.show();
    } else {
      moduleCTIClient.$callerIdTransliterationToggleBlock.hide();
    }
  },
  /**
   * Выбор CRM: скрыть/показать блок настроек 1С
   */
  isCrm1cSelected: function isCrm1cSelected() {
    return $('#crm_type_1c').prop('checked') === true;
  },
  crmTypeToggle: function crmTypeToggle() {
    // Скриншот с чатами показывается только при типе CRM «1С»
    var $chatThumbs = $('#cti-client-screenshots .cti-screenshot-thumb[data-full*="/chat"]');
    if (moduleCTIClient.isCrm1cSelected()) {
      moduleCTIClient.$crmSettingsBlock.show();
      moduleCTIClient.$crmHiddenTabs.show();
      $chatThumbs.show();
    } else {
      moduleCTIClient.$crmSettingsBlock.hide();
      moduleCTIClient.$crmHiddenTabs.hide();
      $chatThumbs.hide();
      // Если превью показывает чаты — переключаем на первый доступный скриншот
      moduleCTIClient.switchChatScreenshotPreviewAway($chatThumbs);
      // Не оставляем активной скрытую вкладку мессенджеров.
      if (moduleCTIClient.$crmHiddenTabs.hasClass('active')) {
        $('#module-cti-client-tabs .item').tab('change tab', 'settings');
      }
    }
  },
  /**
   * Если большое превью показывает скриншот чатов, переключает его
   * на первый скриншот, не связанный с чатами.
   */
  switchChatScreenshotPreviewAway: function switchChatScreenshotPreviewAway($chatThumbs) {
    var $preview = $('#cti-screenshot-preview');
    if ($preview.length === 0) {
      return;
    }
    var previewSrc = $preview.attr('src');
    var chatActive = $chatThumbs.hasClass('active') || $chatThumbs.filter("[data-full=\"".concat(previewSrc, "\"]")).length > 0;
    if (!chatActive) {
      return;
    }
    var $firstOther = $('#cti-client-screenshots .cti-screenshot-thumb').not($chatThumbs).first();
    if ($firstOther.length === 0) {
      return;
    }
    $('#cti-client-screenshots .cti-screenshot-thumb').removeClass('active');
    $firstOther.addClass('active');
    $preview.attr('src', $firstOther.attr('data-full'));
  },
  /**
   * Включение режима работы через WS
   */
  enableWsFields: function enableWsFields() {
    moduleCTIClient.$wsOnlyFields.removeClass('disabled');
  },
  /**
   * Выключение режима работы через WS
   */
  disableWsFields: function disableWsFields() {
    moduleCTIClient.$wsOnlyFields.addClass('disabled');
  },
  /**
   * При изменении SSL режима
   * @param value
   * @param text
   * @param $choice
   */
  cbSslModeOnChange: function cbSslModeOnChange(value, text, $choice) {
    var port = moduleCTIClient.$formObj.form('get value', 'server1cport');
    if (value === 'http' && port === '443') {
      moduleCTIClient.$formObj.form('set value', 'server1cport', 80);
    }
    if (value === 'https' && port === '80') {
      moduleCTIClient.$formObj.form('set value', 'server1cport', 443);
    }
    return true;
  },
  cbBeforeSendForm: function cbBeforeSendForm(settings) {
    var result = settings;
    result.data = moduleCTIClient.$formObj.form('get values');
    result.data = moduleCTIClient.syncRemoteFieldsBeforeSubmit(result.data);
    return result;
  },
  cbAfterSendForm: function cbAfterSendForm() {
    moduleCTIClient.initialize();
    // Применение после «Сохранить» асинхронно: ограниченно перечитываем статус сертификата, пока не «работает».
    ctiTlsPanel.refresh(3);
  },
  initializeForm: function initializeForm() {
    Form.$formObj = moduleCTIClient.$formObj;
    Form.url = "".concat(globalRootUrl, "module-c-t-i-client/save");
    Form.validateRules = moduleCTIClient.validateRules;
    Form.cbBeforeSendForm = moduleCTIClient.cbBeforeSendForm;
    Form.cbAfterSendForm = moduleCTIClient.cbAfterSendForm;
    Form.initialize();
  }
};
$.fn.form.settings.rules.emptyCustomRule = function (value) {
  if (!moduleCTIClient.isCrm1cSelected()) {
    return true;
  }
  if (moduleCTIClient.$autoSettingsToggle.checkbox('is unchecked') && moduleCTIClient.$wsToggle.checkbox('is checked') && value === '') {
    return false;
  }
  return true;
};
$.fn.form.settings.rules.wrongPortCustomRule = function (value) {
  if (!moduleCTIClient.isCrm1cSelected()) {
    return true;
  }
  if (moduleCTIClient.$autoSettingsToggle.checkbox('is unchecked') && moduleCTIClient.$wsToggle.checkbox('is checked')) {
    return $.fn.form.settings.rules.integer(value, '1..65535');
  }
  return true;
};

/**
 * Компактная панель сертификата CTI: поле адреса, одна строка статуса и свёрнутое «Подробнее».
 * Только публичные сведения (никогда не ключ); текст не интерпретируется как HTML. Код записан в ES5-совместимом
 * виде, поэтому собранный файл содержит тот же текст.
 */
var ctiTlsPanel = {
  epoch: 0,
  snapshot: null,
  timer: null,
  node: function (id) { return document.getElementById('cti-tls-' + id); },
  label: function (key) {
    var name = 'mod_cti_Tls' + key;
    var value = globalTranslate[name];
    return typeof value === 'string' && value !== name ? value : '';
  },
  text: function (id, value) { this.node(id).textContent = value === null || value === undefined ? '' : String(value); },
  show: function (id, visible) { this.node(id).style.display = visible ? '' : 'none'; },
  digest: function (value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); },
  url: function (action) { return globalRootUrl + 'module-c-t-i-client/' + action; },
  initialize: function () {
    var self = this;
    if (!this.node('panel')) { return; }
    this.node('refresh').onclick = function () { return self.refresh(); };
    ['server', 'intermediates', 'root'].forEach(function (kind) {
      self.node(kind).onclick = function () { return self.download(kind); };
    });
    this.refresh();
  },
  /** Показываем только применимые скачивания (публичный PEM, привязанный к показанному листу). */
  controls: function (enabled) {
    var self = this;
    var c = this.snapshot && this.snapshot.certificateStatus;
    ['server', 'intermediates', 'root'].forEach(function (kind) {
      self.show(kind, !!(enabled && c && c.configured && self.digest(c.configured.sha256)
        && Array.isArray(c.downloads) && c.downloads.indexOf(kind) !== -1));
    });
  },
  clear: function () {
    var self = this;
    this.snapshot = null;
    this.controls(false);
    ['summary', 'next-step', 'details', 'trust', 'manual'].forEach(function (id) { return self.text(id, ''); });
    this.show('next-step', false);
    this.show('trust', false);
    this.show('more', false);
    this.show('refresh', false);
    this.show('manual-block', false);
    this.node('panel').setAttribute('data-state', 'unknown');
  },
  request: function (action, method, data, done) {
    var xhr = new XMLHttpRequest();
    var url = this.url(action);
    var body = Object.keys(data || {}).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]); }).join('&');
    if (body) { url += (url.indexOf('?') === -1 ? '?' : '&') + body; }
    xhr.open('GET', url, true);
    xhr.timeout = 15000;
    xhr.onload = function () { return done(xhr); };
    xhr.onerror = xhr.ontimeout = function () { return done({status: 0, responseText: ''}); };
    xhr.send(null);
  },
  json: function (xhr) {
    try { return JSON.parse(xhr.responseText); } catch (e) { return null; }
  },
  failure: function () {
    this.clear();
    this.text('summary', this.label('RefreshRequired'));
    var hint = this.label('RefreshHint');
    this.text('next-step', hint);
    this.show('next-step', hint !== '');
    this.show('refresh', true);
    this.show('more', true);
  },
  /**
   * @param {number} [settle] после «Сохранить» запуск идёт асинхронно: ограниченно (не более settle раз) перечитываем
   *   статус, пока он не станет «работает»; при обычной загрузке страницы повторов нет.
   */
  refresh: function (settle) {
    var self = this;
    var ticket = ++this.epoch;
    window.clearTimeout(this.timer);
    if (!settle) {
      this.clear();
      this.text('summary', this.label('Loading'));
    }
    this.request('tlsCertificateInfo', 'GET', {}, function (xhr) {
      if (ticket !== self.epoch) { return; }
      var data = self.json(xhr);
      if (xhr.status !== 200 || !data || data.ok !== true || !data.certificateStatus) {
        self.failure(); return;
      }
      self.snapshot = data;
      self.render(data.certificateStatus);
      self.controls(true);
      if (settle > 0 && self.node('panel').getAttribute('data-state') !== 'running') {
        self.timer = window.setTimeout(function () { return self.refresh(settle - 1); }, 4000);
      }
    });
  },
  certificate: function (c, generation) {
    var unknown = this.label('Unknown');
    if (!c) { return unknown; }
    var date = function (value) {
      var d = typeof value === 'number' ? new Date(value * 1000) : null;
      return d && !isNaN(d.getTime()) ? d.toISOString() : unknown;
    };
    return [this.label('Subject') + ': ' + (c.subject || unknown),
      this.label('Issuer') + ': ' + (c.issuer || unknown),
      'SAN: ' + (Array.isArray(c.san) ? c.san.join(', ') : unknown),
      this.label('From') + ': ' + date(c.notBefore), this.label('Until') + ': ' + date(c.notAfter),
      'SHA256: ' + (c.sha256 || generation || unknown)].join('\n');
  },
  /** Одна короткая правдивая строка: успех только для известного «работает», иначе — что не так и что делать. */
  headline: function (c, state) {
    // A recorded refusal is never hidden: running on the previous certificate and "selection failed" read differently.
    if (c.applyError) { return this.label(state === 'running' ? 'RefusedRunning' : 'Refused'); }
    if (state === 'running') { return this.label('Running'); }
    if (state === 'mixed') { return this.label('Mixed'); }
    if (c.errorCode === 'invalid_hostname') { return this.label('AddressMissing') || 'Connection address not set'; }
    if (c.errorCode === 'tls_apply_required') { return this.label('AwaitingApply') || 'Certificate not applied'; }
    if (c.errorCode) { return this.label('NotReady'); }
    return this.label(state === 'pending' ? 'Pending' : 'StatusUnknown');
  },
  setupHint: function (code) {
    var missing = code === 'invalid_hostname';
    if (!missing && code !== 'tls_apply_required') { return ''; }
    var key = missing ? 'MissingDomain' : 'SaveToApply';
    var instruction = this.node('panel').getAttribute(missing ? 'data-missing-address' : 'data-save-to-apply');
    return this.label(key) || (instruction && instruction !== 'mod_cti_Tls' + key ? instruction
      : (missing ? 'Enter the PBX IP address or domain.' : 'Save the settings to apply the certificate.'));
  },
  render: function (c) {
    var runtime = c.runtime || {};
    var peers = ['api', 'nats', 'proxy'];
    var state = c.state;
    if (c.errorCode) { state = 'error'; }
    else if (c.applyError && state !== 'running' && state !== 'mixed') { state = 'error'; }
    else if (peers.some(function (name) { return runtime[name] && runtime[name].state === 'different'; })) { state = 'mixed'; }
    else if (state === 'running' && (!c.configured || peers.some(function (name) {
      return !runtime[name] || (runtime[name].required !== false && runtime[name].state !== 'match');
    }))) { state = 'unknown'; }
    if (['running', 'pending', 'mixed', 'error', 'unknown'].indexOf(state) === -1) { state = 'unknown'; }
    this.node('panel').setAttribute('data-state', state);
    this.text('summary', this.headline(c, state));
    var hint = this.setupHint(c.errorCode) || (c.manualPaths ? this.label('SetupDetails') : '');
    this.text('next-step', hint);
    this.show('next-step', hint !== '');
    this.show('refresh', false);
    var lines = [];
    if (c.configured) {
      if (c.source === 'previous' || c.source === 'own') {
        lines.push(this.label(c.source === 'previous' ? 'SourcePrevious' : 'SourceOwn'));
      }
      if (typeof c.configured.selfSigned === 'boolean') {
        lines.push(this.label(c.configured.selfSigned ? 'TypeSelfSigned' : 'TypeCaIssued'));
      }
      lines.push(this.certificate(c.configured, c.configuredGeneration));
    }
    lines = lines.filter(Boolean);
    this.text('details', lines.join('\n'));
    this.show('more', lines.length > 0);
    // Подсказка по доверию: самоподписанный лист или ПРОВЕРЕННЫЙ корень CA; для одних промежуточных её нет.
    var offered = Array.isArray(c.downloads) ? c.downloads : [];
    var kind = c.trust && c.trust.kind;
    var advice = offered.indexOf('server') !== -1 && kind === 'self_signed' ? 'TrustServer' : (offered.indexOf('root') !== -1 ? 'TrustRoot' : '');
    this.text('trust', advice ? this.label(advice) : '');
    this.show('trust', advice !== '');
    // Точные пути для ручной подготовки — только когда безопасное чтение/создание обычным пользователем невозможно.
    var manual = c.manualPaths;
    this.show('manual-block', !!manual);
    // Access/copy problems, an unusable installed pair and a fresh destination need different, separate instructions.
    var code = c.errorCode || c.applyError;
    var kind = 'ManualFresh';
    if (code === 'source_unreadable') { kind = 'ManualSource'; }
    else if (code === 'tls_prepare_failed' || code === 'unsafe_state') { kind = 'ManualAccess'; }
    else if (code === 'installed_pair_unusable') { kind = 'ManualReplace'; }
    this.text('manual', manual ? this.label(kind) + '\n' + manual.cert + '\n' + manual.key : '');
    if (manual) { this.show('more', true); }
  },
  download: function (kind) {
    var self = this;
    if (this.node(kind).style.display === 'none' || !this.snapshot) { return; }
    var c = this.snapshot.certificateStatus;
    var ticket = ++this.epoch;
    var leaf = c.configured.sha256;
    this.request('downloadTlsCertificate', 'GET', {kind: kind, leafSHA: leaf}, function (xhr) {
      if (ticket !== self.epoch) { return; }
      var mime = xhr.getResponseHeader ? xhr.getResponseHeader('Content-Type') || '' : '';
      var pem = xhr.responseText || '';
      // Не сохранять JSON/HTML, ключи или неполный PEM даже с ошибочным HTTP 200.
      if (xhr.status !== 200 || mime.split(';')[0].trim().toLowerCase() !== 'application/x-pem-file'
        || !/^(?:\s*-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*)+$/.test(pem)) {
        self.failure(); return;
      }
      var blob = new Blob([pem], {type: 'application/x-pem-file'});
      var filename = 'cti-' + kind + '-' + leaf + (kind === 'intermediates' ? '.pem' : '.cer');
      if (window.navigator.msSaveBlob) { window.navigator.msSaveBlob(blob, filename); return; }
      if (!window.URL || !window.URL.createObjectURL) { self.failure({status: 0}, null); return; }
      var url = window.URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { return window.URL.revokeObjectURL(url); }, 1000);
    });
  }
};

$(document).ready(function () {
  moduleCTIClient.initialize();
});
