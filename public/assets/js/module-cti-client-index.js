"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

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
      $result.removeClass('green red').css('color', '#666').text(globalTranslate.mod_cti_RemoteTestRunning || 'Probing…'); // Don't send the masked saved key back to the server — empty key
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

      var confirmMsg = globalTranslate.mod_cti_FailbackConfirm || 'Bring this service back to local from the last local copy? ' + 'The VPS will be turned off for it.'; // eslint-disable-next-line no-alert

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
            } // Leave the button busy; the status worker re-polls within
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
          var msg = response && Array.isArray(response.messages) && response.messages.length > 0 ? response.messages.join('; ') : ''; // eslint-disable-next-line no-alert

          window.alert(msg ? "".concat(failLabel, ": ").concat(msg) : failLabel);
        },
        error: function error(xhr) {
          // Core#1166: newer cores send a refused failback as HTTP 4xx with the same JSON body.
          if (xhr.responseJSON && _typeof(xhr.responseJSON) === 'object') {
            this.success(xhr.responseJSON);
            return;
          }

          $btn.removeClass('loading disabled'); // eslint-disable-next-line no-alert

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
      $chatThumbs.hide(); // Если превью показывает чаты — переключаем на первый доступный скриншот

      moduleCTIClient.switchChatScreenshotPreviewAway($chatThumbs); // Не оставляем активной скрытую вкладку мессенджеров.

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

$(document).ready(function () {
  moduleCTIClient.initialize();
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnQiLCIkd3NUb2dnbGUiLCIkIiwiJHdzVG9nZ2xlUmFkaW8iLCIkc3RhdHVzVG9nZ2xlIiwiJGNhbGxlcklkU2V0dXBUb2dnbGUiLCIkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jayIsIiRmb3JtT2JqIiwiJG1vZHVsZVN0YXR1cyIsIiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRhdXRvU2V0dGluZ3NUb2dnbGUiLCIkY3JtVHlwZVJhZGlvcyIsIiRjcm1TZXR0aW5nc0Jsb2NrIiwiJGNybUhpZGRlblRhYnMiLCIkb25seUF1dG9TZXR0aW5nc1Zpc2libGUiLCIkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZSIsIiR3c09ubHlGaWVsZHMiLCIkZGlycnR5RmllbGQiLCIkc3NsTW9kZVNlbGVjdCIsIiRkZWJ1Z1RhYiIsInJlbW90ZU1pZ3JhdGlvbkxvY2tlZCIsInJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyIsInJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kIiwicmVtb3RlUHJvdGVjdGVkRmllbGRJZHMiLCJyZW1vdGVUb2dnbGVGaWVsZElkcyIsInJlbW90ZVNlcnZpY2VMYWJlbEtleXMiLCJjaGF0cyIsInRnIiwibWF4IiwidmFsaWRhdGVSdWxlcyIsInNlcnZlcjFjaG9zdCIsImlkZW50aWZpZXIiLCJydWxlcyIsInR5cGUiLCJwcm9tcHQiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHkiLCJzZXJ2ZXIxY3BvcnQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UiLCJkYXRhYmFzZSIsIm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lIiwiaW5pdGlhbGl6ZSIsImluaXRpYWxpemVEb3dubG9hZENsaWVudERyb3Bkb3duIiwiaW5pdGlhbGl6ZUNsaWVudFNjcmVlbnNob3RHYWxsZXJ5IiwidGFiIiwiY2hlY2tib3giLCJoaWRlIiwib25DaGVja2VkIiwic2hvdyIsIm9uVW5jaGVja2VkIiwiY3JtVHlwZVRvZ2dsZSIsInZhbCIsIk1hdGgiLCJyYW5kb20iLCJ0cmlnZ2VyIiwib25DaGFuZ2UiLCJzZXRDYWxsZXJJZFRvZ2dsZSIsIkZvcm0iLCJlbmFibGVXc0ZpZWxkcyIsImRpc2FibGVXc0ZpZWxkcyIsImRyb3Bkb3duIiwiY2JTc2xNb2RlT25DaGFuZ2UiLCJpbml0aWFsaXplRm9ybSIsImNoZWNrU3RhdHVzVG9nZ2xlIiwiaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QiLCJpbml0aWFsaXplUmVtb3RlRmFpbGJhY2siLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwiJHRodW1icyIsIiRwcmV2aWV3IiwibGVuZ3RoIiwib2ZmIiwib24iLCJlIiwiJHRodW1iIiwiY3VycmVudFRhcmdldCIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJhdHRyIiwiJGRyb3Bkb3duIiwiZmluZCIsInByZXZlbnREZWZhdWx0Iiwic3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uIiwidXJsIiwib3BlbiIsImFjdGlvbiIsInNldFJlbW90ZU1pZ3JhdGlvbkxvY2siLCJhcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJldmVudCIsImRldGFpbCIsImFjdGl2ZSIsIkFycmF5IiwiaXNBcnJheSIsInNlcnZpY2VzIiwibG9ja2VkIiwiJHJlbW90ZUlucHV0cyIsImdldFJlbW90ZVByb3RlY3RlZElucHV0cyIsIiRyZW1vdGVUb2dnbGVzIiwiZ2V0UmVtb3RlVG9nZ2xlSW5wdXRzIiwiJHJlbW90ZVRlc3RCdXR0b24iLCJwcm9wIiwiY2xvc2VzdCIsInRvZ2dsZUNsYXNzIiwicmVtb3ZlQXR0ciIsInNlcnZpY2VUZXh0IiwiZm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMiLCJiYXNlVGV4dCIsIm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkIiwidGV4dCIsInRvZ2dsZSIsIm1hcCIsImlkIiwiam9pbiIsInNlcnZpY2UiLCJrZXkiLCJzeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0IiwiZm9ybURhdGEiLCJmb3JFYWNoIiwiaXMiLCIkYnRuIiwiJHJlc3VsdCIsInJlbmRlclJlc3VsdCIsInByb2JlIiwiZmFsbGJhY2tFcnIiLCJvayIsIm9rTGFiZWwiLCJtb2RfY3RpX1JlbW90ZVRlc3RPayIsImFyY2giLCJyd0xhYmVsIiwibW9kX2N0aV9SZW1vdGVUZXN0UndPayIsImNzcyIsImZhaWxMYWJlbCIsIm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwiLCJlcnIiLCJlcnJvciIsIm1vZF9jdGlfUmVtb3RlVGVzdFJ1bm5pbmciLCJyYXdLZXkiLCJrZXlGb3JQb3N0IiwiaW5kZXhPZiIsImFqYXgiLCJDb25maWciLCJwYnhVcmwiLCJtZXRob2QiLCJjb250ZW50VHlwZSIsImRhdGFUeXBlIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJob3N0IiwicG9ydCIsImxvZ2luIiwiYmFzZSIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm1zZyIsIm1lc3NhZ2VzIiwieGhyIiwicmVzcG9uc2VKU09OIiwic3RhdHVzIiwiZG9jdW1lbnQiLCJzdmMiLCJoYXNDbGFzcyIsImNvbmZpcm1Nc2ciLCJtb2RfY3RpX0ZhaWxiYWNrQ29uZmlybSIsImNvbmZpcm0iLCJtb2RfY3RpX0ZhaWxiYWNrRmFpbGVkIiwiZmllbGRNYXAiLCJmaWVsZCIsIiRjYiIsInNldFRpbWVvdXQiLCJhbGVydCIsIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsInJlbW92ZSIsImlzQ3JtMWNTZWxlY3RlZCIsIiRjaGF0VGh1bWJzIiwic3dpdGNoQ2hhdFNjcmVlbnNob3RQcmV2aWV3QXdheSIsInByZXZpZXdTcmMiLCJjaGF0QWN0aXZlIiwiZmlsdGVyIiwiJGZpcnN0T3RoZXIiLCJub3QiLCJmaXJzdCIsInZhbHVlIiwiJGNob2ljZSIsImZvcm0iLCJjYkJlZm9yZVNlbmRGb3JtIiwic2V0dGluZ3MiLCJyZXN1bHQiLCJjYkFmdGVyU2VuZEZvcm0iLCJnbG9iYWxSb290VXJsIiwiZm4iLCJlbXB0eUN1c3RvbVJ1bGUiLCJ3cm9uZ1BvcnRDdXN0b21SdWxlIiwiaW50ZWdlciIsInJlYWR5Il0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQSxJQUFNQSxlQUFlLEdBQUc7QUFDdkJDLEVBQUFBLFNBQVMsRUFBRUMsQ0FBQyxDQUFDLDBCQUFELENBRFc7QUFFdkJDLEVBQUFBLGNBQWMsRUFBRUQsQ0FBQyxDQUFDLDRDQUFELENBRk07QUFHdkJFLEVBQUFBLGFBQWEsRUFBRUYsQ0FBQyxDQUFDLHVCQUFELENBSE87QUFJdkJHLEVBQUFBLG9CQUFvQixFQUFFSCxDQUFDLENBQUMseUJBQUQsQ0FKQTtBQUt2QkksRUFBQUEsbUNBQW1DLEVBQUVKLENBQUMsQ0FBQyx1Q0FBRCxDQUxmO0FBTXZCSyxFQUFBQSxRQUFRLEVBQUVMLENBQUMsQ0FBQyx5QkFBRCxDQU5ZO0FBT3ZCTSxFQUFBQSxhQUFhLEVBQUVOLENBQUMsQ0FBQyxxQkFBRCxDQVBPO0FBUXZCTyxFQUFBQSwyQkFBMkIsRUFBRVAsQ0FBQyxDQUFDLG9DQUFELENBUlA7QUFTdkJRLEVBQUFBLFlBQVksRUFBRVIsQ0FBQyxDQUFDLG9CQUFELENBVFE7QUFVdkJTLEVBQUFBLG1CQUFtQixFQUFFVCxDQUFDLENBQUMsNEJBQUQsQ0FWQztBQVd2QlUsRUFBQUEsY0FBYyxFQUFFVixDQUFDLENBQUMseUNBQUQsQ0FYTTtBQVl2QlcsRUFBQUEsaUJBQWlCLEVBQUVYLENBQUMsQ0FBQyx3QkFBRCxDQVpHO0FBYXZCWSxFQUFBQSxjQUFjLEVBQUVaLENBQUMsQ0FBQyx3R0FBRCxDQWJNO0FBY3ZCYSxFQUFBQSx3QkFBd0IsRUFBRWIsQ0FBQyxDQUFDLDZDQUFELENBZEo7QUFldkJjLEVBQUFBLDBCQUEw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QUFDQTs7QUFDRCxTQUFPLElBQVA7QUFDQSxDQVZEOztBQVlBdEwsQ0FBQyxDQUFDOEwsRUFBRixDQUFLTixJQUFMLENBQVVFLFFBQVYsQ0FBbUIzSixLQUFuQixDQUF5QmlLLG1CQUF6QixHQUErQyxVQUFVVixLQUFWLEVBQWlCO0FBQy9ELE1BQUksQ0FBQ3hMLGVBQWUsQ0FBQytLLGVBQWhCLEVBQUwsRUFBd0M7QUFDdkMsV0FBTyxJQUFQO0FBQ0E7O0FBQ0QsTUFBSS9LLGVBQWUsQ0FBQ1csbUJBQWhCLENBQW9DbUMsUUFBcEMsQ0FBNkMsY0FBN0MsS0FDQTlDLGVBQWUsQ0FBQ0MsU0FBaEIsQ0FBMEI2QyxRQUExQixDQUFtQyxZQUFuQyxDQURKLEVBRUU7QUFDRCxXQUFPNUMsQ0FBQyxDQUFDOEwsRUFBRixDQUFLTixJQUFMLENBQVVFLFFBQVYsQ0FBbUIzSixLQUFuQixDQUF5QmtLLE9BQXpCLENBQWlDWCxLQUFqQyxFQUF3QyxVQUF4QyxDQUFQO0FBQ0E7O0FBQ0QsU0FBTyxJQUFQO0FBQ0EsQ0FWRDs7QUFZQXRMLENBQUMsQ0FBQytKLFFBQUQsQ0FBRCxDQUFZbUMsS0FBWixDQUFrQixZQUFNO0FBQ3ZCcE0sRUFBQUEsZUFBZSxDQUFDMEMsVUFBaEI7QUFDQSxDQUZEIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgTUlLTyBMTEMgLSBBbGwgUmlnaHRzIFJlc2VydmVkXG4gKiBVbmF1dGhvcml6ZWQgY29weWluZyBvZiB0aGlzIGZpbGUsIHZpYSBhbnkgbWVkaXVtIGlzIHN0cmljdGx5IHByb2hpYml0ZWRcbiAqIFByb3ByaWV0YXJ5IGFuZCBjb25maWRlbnRpYWxcbiAqIFdyaXR0ZW4gYnkgTmlrb2xheSBCZWtldG92LCAxMSAyMDE4XG4gKlxuICovXG5cbmNvbnN0IG1vZHVsZUNUSUNsaWVudCA9IHtcblx0JHdzVG9nZ2xlOiAkKCcjd2ViLXNlcnZpY2UtbW9kZS10b2dnbGUnKSxcblx0JHdzVG9nZ2xlUmFkaW86ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC53ZWItc2VydmljZS1yYWRpbycpLFxuXHQkc3RhdHVzVG9nZ2xlOiAkKCcjbW9kdWxlLXN0YXR1cy10b2dnbGUnKSxcblx0JGNhbGxlcklkU2V0dXBUb2dnbGU6ICQoJyNzZXR1cC1jYWxsZXItaWQtdG9nZ2xlJyksXG5cdCRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrOiAkKCcjdHJhbnNsaXRlcmF0ZS1jYWxsZXItaWQtdG9nZ2xlLWJsb2NrJyksXG5cdCRmb3JtT2JqOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjY3RpLXN0YXR1cy1zdW1tYXJ5JyksXG5cdCRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZTogJCgnI2N0aS1yZW1vdGUtbWlncmF0aW9uLWxvY2stbWVzc2FnZScpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkYXV0b1NldHRpbmdzVG9nZ2xlOiAkKCcjYXV0by1zZXR0aW5ncy1tb2RlLXRvZ2dsZScpLFxuXHQkY3JtVHlwZVJhZGlvczogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLmNybS10eXBlLXJhZGlvJyksXG5cdCRjcm1TZXR0aW5nc0Jsb2NrOiAkKCcjY3JtLTFjLXNldHRpbmdzLWJsb2NrJyksXG5cdCRjcm1IaWRkZW5UYWJzOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtdGFicyAuaXRlbVtkYXRhLXRhYj1cIm1lc3NlbmdlcnNcIl0sICNtb2R1bGUtY3RpLWNsaWVudC10YWJzIC5pdGVtW2RhdGEtdGFiPVwicmVtb3RlXCJdJyksXG5cdCRvbmx5QXV0b1NldHRpbmdzVmlzaWJsZTogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLm9ubHktYXV0by1zZXR0aW5ncycpLFxuXHQkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZTogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLm9ubHktbWFudWFsLXNldHRpbmdzJyksXG5cdCR3c09ubHlGaWVsZHM6ICQoJy53cy1vbmx5JyksXG5cdCRkaXJydHlGaWVsZDogJCgnI2RpcnJ0eScpLFxuXHQkc3NsTW9kZVNlbGVjdDogJCgnLnNlcnZlcjFjX3NjaGVtZSBzZWxlY3QnKSxcblx0JGRlYnVnVGFiOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtdGFicyAuaXRlbVtkYXRhLXRhYj1cImRlYnVnXCJdJyksXG5cdHJlbW90ZU1pZ3JhdGlvbkxvY2tlZDogZmFsc2UsXG5cdHJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlczogW10sXG5cdHJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kOiBmYWxzZSxcblx0cmVtb3RlUHJvdGVjdGVkRmllbGRJZHM6IFtcblx0XHQncmVtb3RlX2hvc3QnLFxuXHRcdCdyZW1vdGVfc3NoX3BvcnQnLFxuXHRcdCdyZW1vdGVfc3NoX2xvZ2luJyxcblx0XHQncmVtb3RlX3NzaF9rZXknLFxuXHRcdCdyZW1vdGVfYmluX2RpcicsXG5cdF0sXG5cdHJlbW90ZVRvZ2dsZUZpZWxkSWRzOiBbJ3JlbW90ZV93aGF0c2FwcCcsICdyZW1vdGVfdGVsZWdyYW0nLCAncmVtb3RlX21heCddLFxuXHRyZW1vdGVTZXJ2aWNlTGFiZWxLZXlzOiB7XG5cdFx0Y2hhdHM6ICdtb2RfY3RpX3N2Y19jaGF0cycsXG5cdFx0dGc6ICdtb2RfY3RpX3N2Y190ZycsXG5cdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0fSxcblx0dmFsaWRhdGVSdWxlczoge1xuXHRcdHNlcnZlcjFjaG9zdDoge1xuXHRcdFx0aWRlbnRpZmllcjogJ3NlcnZlcjFjaG9zdCcsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2VtcHR5Q3VzdG9tUnVsZScsXG5cdFx0XHRcdFx0cHJvbXB0OiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDSG9zdEVtcHR5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdHNlcnZlcjFjcG9ydDoge1xuXHRcdFx0aWRlbnRpZmllcjogJ3NlcnZlcjFjcG9ydCcsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3dyb25nUG9ydEN1c3RvbVJ1bGUnLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVTZXJ2ZXIxQ1BvcnRSYW5nZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRkYXRhYmFzZToge1xuXHRcdFx0aWRlbnRpZmllcjogJ2RhdGFiYXNlJyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnZW1wdHlDdXN0b21SdWxlJyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlUHViTmFtZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0fSxcblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZURvd25sb2FkQ2xpZW50RHJvcGRvd24oKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZUNsaWVudFNjcmVlbnNob3RHYWxsZXJ5KCk7XG5cdFx0JCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLml0ZW0nKS50YWIoKTtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRkZWJ1Z1RvZ2dsZS5jaGVja2JveCgnaXMgdW5jaGVja2VkJykpe1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkZWJ1Z1RhYi5oaWRlKClcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRkZWJ1Z1RvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUYWIuc2hvdygpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uVW5jaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUYWIuaGlkZSgpXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdG1vZHVsZUNUSUNsaWVudC5jcm1UeXBlVG9nZ2xlKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRjcm1UeXBlUmFkaW9zXG5cdFx0XHQuY2hlY2tib3goe1xuXHRcdFx0XHRvbkNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuY3JtVHlwZVRvZ2dsZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdG1vZHVsZUNUSUNsaWVudC4kY2FsbGVySWRTZXR1cFRvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGFuZ2U6IG1vZHVsZUNUSUNsaWVudC5zZXRDYWxsZXJJZFRvZ2dsZVxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuc2hvdygpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSB7fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25VbmNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLmhpZGUoKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuc2hvdygpO1xuXHRcdFx0XHRcdEZvcm0udmFsaWRhdGVSdWxlcyA9IG1vZHVsZUNUSUNsaWVudC52YWxpZGF0ZVJ1bGVzO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlUmFkaW9cblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRpcnJ0eUZpZWxkLnZhbChNYXRoLnJhbmRvbSgpKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRpcnJ0eUZpZWxkLnRyaWdnZXIoJ2NoYW5nZScpO1xuXHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZGlzYWJsZVdzRmllbGRzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRzc2xNb2RlU2VsZWN0LmRyb3Bkb3duKHtcblx0XHRcdG9uQ2hhbmdlOiBtb2R1bGVDVElDbGllbnQuY2JTc2xNb2RlT25DaGFuZ2Vcblx0XHR9KTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZUZvcm0oKTtcblx0XHRtb2R1bGVDVElDbGllbnQuY2hlY2tTdGF0dXNUb2dnbGUoKTtcblx0XHRtb2R1bGVDVElDbGllbnQuc2V0Q2FsbGVySWRUb2dnbGUoKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZVJlbW90ZUNvbm5lY3Rpb25UZXN0KCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVSZW1vdGVGYWlsYmFjaygpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdNb2R1bGVTdGF0dXNDaGFuZ2VkJywgbW9kdWxlQ1RJQ2xpZW50LmNoZWNrU3RhdHVzVG9nZ2xlKTtcblx0fSxcblx0LyoqXG5cdCAqINCT0LDQu9C10YDQtdGPINGB0LrRgNC40L3RiNC+0YLQvtCyINC60LvQuNC10L3RgtCwOiDQutC70LjQuiDQv9C+INC80LjQvdC40LDRgtGO0YDQtSDQv9C+0LTQvNC10L3Rj9C10YIg0LHQvtC70YzRiNC+0LUg0L/RgNC10LLRjNGOLlxuXHQgKi9cblx0aW5pdGlhbGl6ZUNsaWVudFNjcmVlbnNob3RHYWxsZXJ5KCkge1xuXHRcdGNvbnN0ICR0aHVtYnMgPSAkKCcjY3RpLWNsaWVudC1zY3JlZW5zaG90cyAuY3RpLXNjcmVlbnNob3QtdGh1bWInKTtcblx0XHRjb25zdCAkcHJldmlldyA9ICQoJyNjdGktc2NyZWVuc2hvdC1wcmV2aWV3Jyk7XG5cdFx0aWYgKCR0aHVtYnMubGVuZ3RoID09PSAwIHx8ICRwcmV2aWV3Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQkdGh1bWJzLm9mZignY2xpY2suY3RpR2FsbGVyeScpLm9uKCdjbGljay5jdGlHYWxsZXJ5JywgKGUpID0+IHtcblx0XHRcdGNvbnN0ICR0aHVtYiA9ICQoZS5jdXJyZW50VGFyZ2V0KTtcblx0XHRcdCR0aHVtYnMucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuXHRcdFx0JHRodW1iLmFkZENsYXNzKCdhY3RpdmUnKTtcblx0XHRcdCRwcmV2aWV3LmF0dHIoJ3NyYycsICR0aHVtYi5hdHRyKCdkYXRhLWZ1bGwnKSk7XG5cdFx0fSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQlNGA0L7Qv9C00LDRg9C9IMKr0KHQutCw0YfQsNGC0YzCuyDRgSDQstC10YfQvdGL0LzQuCDRgdGB0YvQu9C60LDQvNC4INC90LAg0LrQu9C40LXQvdGCIE1pa28gQ1RJLlxuXHQgKiDQodC70YPRiNCw0YLQtdC70Ywg0LLQtdGI0LDQtdGC0YHRjyDQtNC+IC50YWIoKSDigJQg0YLQvtGCINGC0L7QttC1INCy0LXRiNCw0LXRgiBjbGljayDQvdCwINCy0YHQtSAuaXRlbSDRhNC+0YDQvNGLLFxuXHQgKiBzdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24g0L3QtSDQtNCw0ZHRgiDQtdC80YMg0L/QtdGA0LXRhdCy0LDRgtC40YLRjCDQv9C10YDQtdGF0L7QtCDQv9C+INGB0YHRi9C70LrQtS5cblx0ICovXG5cdGluaXRpYWxpemVEb3dubG9hZENsaWVudERyb3Bkb3duKCkge1xuXHRcdGNvbnN0ICRkcm9wZG93biA9ICQoJyNjdGktZG93bmxvYWQtY2xpZW50Jyk7XG5cdFx0aWYgKCRkcm9wZG93bi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0JGRyb3Bkb3duLmZpbmQoJy5tZW51IGEuaXRlbScpXG5cdFx0XHQub2ZmKCdjbGljay5jdGlEb3dubG9hZCcpXG5cdFx0XHQub24oJ2NsaWNrLmN0aURvd25sb2FkJywgKGUpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjb25zdCB1cmwgPSAkKGUuY3VycmVudFRhcmdldCkuYXR0cignaHJlZicpO1xuXHRcdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdFx0d2luZG93Lm9wZW4odXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0JGRyb3Bkb3duLmRyb3Bkb3duKCdoaWRlJyk7XG5cdFx0XHR9KTtcblx0XHQkZHJvcGRvd24uZHJvcGRvd24oeyBhY3Rpb246ICdub3RoaW5nJyB9KTtcblx0fSxcblx0LyoqXG5cdCAqINCf0L7QtNC/0LjRgdC60LAg0L3QsCDRgdGC0LDRgtGD0YEg0LDQutGC0LjQstC90L7QuSDQvNC40LPRgNCw0YbQuNC4INC80LXRgdGB0LXQvdC00LbQtdGA0L7Qsi5cblx0ICovXG5cdGluaXRpYWxpemVSZW1vdGVNaWdyYXRpb25Mb2NrKCkge1xuXHRcdGlmICghbW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kKSB7XG5cdFx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcblx0XHRcdFx0J1JlbW90ZU1pZ3JhdGlvbkxvY2tDaGFuZ2VkJyxcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LnNldFJlbW90ZU1pZ3JhdGlvbkxvY2ssXG5cdFx0XHQpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kID0gdHJ1ZTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpO1xuXHR9LFxuXHQvKipcblx0ICog0J7QsdC90L7QstC40YLRjCDRgdC+0YHRgtC+0Y/QvdC40LUg0LHQu9C+0LrQuNGA0L7QstC60LggcmVtb3RlL1ZQUyDQv9C+0LvQtdC5LlxuXHQgKiBAcGFyYW0ge0N1c3RvbUV2ZW50fSBldmVudFxuXHQgKi9cblx0c2V0UmVtb3RlTWlncmF0aW9uTG9jayhldmVudCkge1xuXHRcdGNvbnN0IGRldGFpbCA9IChldmVudCAmJiBldmVudC5kZXRhaWwpID8gZXZlbnQuZGV0YWlsIDoge307XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCA9IGRldGFpbC5hY3RpdmUgPT09IHRydWU7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyA9IEFycmF5LmlzQXJyYXkoZGV0YWlsLnNlcnZpY2VzKVxuXHRcdFx0PyBkZXRhaWwuc2VydmljZXMgOiBbXTtcblx0XHRtb2R1bGVDVElDbGllbnQuYXBwbHlSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9GA0LjQvNC10L3QuNGC0Ywg0YLQtdC60YPRidGD0Y4g0LHQu9C+0LrQuNGA0L7QstC60YMg0Log0L/QvtC70Y/QvCDRhNC+0YDQvNGLINCx0LXQtyBkaXNhYmxlZC3QsNGC0YDQuNCx0YPRgtC+0LI6XG5cdCAqIHZhbHVlcyDQtNC+0LvQttC90Ysg0L/RgNC+0LTQvtC70LbQsNGC0Ywg0L7RgtC/0YDQsNCy0LvRj9GC0YzRgdGPINC/0YDQuCDRgdC+0YXRgNCw0L3QtdC90LjQuCDQtNGA0YPQs9C40YUg0L3QsNGB0YLRgNC+0LXQui5cblx0ICovXG5cdGFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpIHtcblx0XHRjb25zdCBsb2NrZWQgPSBtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja2VkID09PSB0cnVlO1xuXHRcdGNvbnN0ICRyZW1vdGVJbnB1dHMgPSBtb2R1bGVDVElDbGllbnQuZ2V0UmVtb3RlUHJvdGVjdGVkSW5wdXRzKCk7XG5cdFx0Y29uc3QgJHJlbW90ZVRvZ2dsZXMgPSBtb2R1bGVDVElDbGllbnQuZ2V0UmVtb3RlVG9nZ2xlSW5wdXRzKCk7XG5cdFx0Y29uc3QgJHJlbW90ZVRlc3RCdXR0b24gPSAkKCcjY3RpLXRlc3QtcmVtb3RlLWNvbm4nKTtcblxuXHRcdCRyZW1vdGVJbnB1dHNcblx0XHRcdC5wcm9wKCdyZWFkb25seScsIGxvY2tlZClcblx0XHRcdC5hdHRyKCdhcmlhLWRpc2FibGVkJywgbG9ja2VkID8gJ3RydWUnIDogJ2ZhbHNlJylcblx0XHRcdC5jbG9zZXN0KCcuZmllbGQnKVxuXHRcdFx0LnRvZ2dsZUNsYXNzKCdjdGktcmVtb3RlLWZpZWxkLWxvY2tlZCcsIGxvY2tlZCk7XG5cdFx0aWYgKGxvY2tlZCkge1xuXHRcdFx0JHJlbW90ZUlucHV0cy5hdHRyKCd0YWJpbmRleCcsICctMScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQkcmVtb3RlSW5wdXRzLnJlbW92ZUF0dHIoJ3RhYmluZGV4Jyk7XG5cdFx0fVxuXG5cdFx0JHJlbW90ZVRvZ2dsZXNcblx0XHRcdC5hdHRyKCdhcmlhLWRpc2FibGVkJywgbG9ja2VkID8gJ3RydWUnIDogJ2ZhbHNlJylcblx0XHRcdC5jbG9zZXN0KCcudWkuc2VnbWVudCcpXG5cdFx0XHQudG9nZ2xlQ2xhc3MoJ2N0aS1yZW1vdGUtZmllbGQtbG9ja2VkJywgbG9ja2VkKTtcblx0XHRpZiAobG9ja2VkKSB7XG5cdFx0XHQkcmVtb3RlVG9nZ2xlcy5hdHRyKCd0YWJpbmRleCcsICctMScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQkcmVtb3RlVG9nZ2xlcy5yZW1vdmVBdHRyKCd0YWJpbmRleCcpO1xuXHRcdH1cblxuXHRcdCRyZW1vdGVUZXN0QnV0dG9uXG5cdFx0XHQudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkJywgbG9ja2VkKVxuXHRcdFx0LmF0dHIoJ2FyaWEtZGlzYWJsZWQnLCBsb2NrZWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHJlbW90ZU1pZ3JhdGlvbkxvY2tNZXNzYWdlLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlcnZpY2VUZXh0ID0gbW9kdWxlQ1RJQ2xpZW50LmZvcm1hdFJlbW90ZU1pZ3JhdGlvblNlcnZpY2VzKFxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja1NlcnZpY2VzLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGJhc2VUZXh0ID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkXG5cdFx0XHRcdHx8ICdNZXNzZW5nZXIgbWlncmF0aW9uIGlzIGluIHByb2dyZXNzLiBSZW1vdGUgc2V0dGluZ3MgYXJlIGxvY2tlZCB1bnRpbCBpdCBmaW5pc2hlcy4nO1xuXHRcdFx0Y29uc3QgdGV4dCA9IHNlcnZpY2VUZXh0ID09PSAnJyA/IGJhc2VUZXh0IDogYCR7YmFzZVRleHR9ICgke3NlcnZpY2VUZXh0fSlgO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZS5maW5kKCdwJykudGV4dCh0ZXh0KTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2UudG9nZ2xlKGxvY2tlZCk7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICogQHJldHVybnMge2pRdWVyeX1cblx0ICovXG5cdGdldFJlbW90ZVByb3RlY3RlZElucHV0cygpIHtcblx0XHRyZXR1cm4gJChtb2R1bGVDVElDbGllbnQucmVtb3RlUHJvdGVjdGVkRmllbGRJZHMubWFwKChpZCkgPT4gYCMke2lkfWApLmpvaW4oJywnKSk7XG5cdH0sXG5cdC8qKlxuXHQgKiBAcmV0dXJucyB7alF1ZXJ5fVxuXHQgKi9cblx0Z2V0UmVtb3RlVG9nZ2xlSW5wdXRzKCkge1xuXHRcdHJldHVybiAkKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVUb2dnbGVGaWVsZElkcy5tYXAoKGlkKSA9PiBgIyR7aWR9YCkuam9pbignLCcpKTtcblx0fSxcblx0LyoqXG5cdCAqIEBwYXJhbSB7c3RyaW5nW119IHNlcnZpY2VzXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRmb3JtYXRSZW1vdGVNaWdyYXRpb25TZXJ2aWNlcyhzZXJ2aWNlcykge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShzZXJ2aWNlcykgfHwgc2VydmljZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBzZXJ2aWNlcy5tYXAoKHNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IG1vZHVsZUNUSUNsaWVudC5yZW1vdGVTZXJ2aWNlTGFiZWxLZXlzW3NlcnZpY2VdO1xuXHRcdFx0aWYgKGtleSAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2VydmljZTtcblx0XHR9KS5qb2luKCcsICcpO1xuXHR9LFxuXHQvKipcblx0ICogUHJlc2VydmUgbG9ja2VkIHJlbW90ZSB2YWx1ZXMgaW4gUE9TVCBkYXRhIHdoZW4gc2F2aW5nIHVucmVsYXRlZCBzZXR0aW5ncy5cblx0ICogQHBhcmFtIHtPYmplY3R9IGZvcm1EYXRhXG5cdCAqIEByZXR1cm5zIHtPYmplY3R9XG5cdCAqL1xuXHRzeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0KGZvcm1EYXRhKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiBmb3JtRGF0YTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVByb3RlY3RlZEZpZWxkSWRzLmZvckVhY2goKGlkKSA9PiB7XG5cdFx0XHRmb3JtRGF0YVtpZF0gPSAkKGAjJHtpZH1gKS52YWwoKSB8fCAnJztcblx0XHR9KTtcblx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlVG9nZ2xlRmllbGRJZHMuZm9yRWFjaCgoaWQpID0+IHtcblx0XHRcdGZvcm1EYXRhW2lkXSA9ICQoYCMke2lkfWApLmlzKCc6Y2hlY2tlZCcpID8gJ29uJyA6ICcnO1xuXHRcdH0pO1xuXHRcdHJldHVybiBmb3JtRGF0YTtcblx0fSxcblx0LyoqXG5cdCAqINCa0L3QvtC/0LrQsCDCq9Cf0YDQvtCy0LXRgNC40YLRjCDQv9C+0LTQutC70Y7Rh9C10L3QuNC1wrsg0L3QsCDQstC60LvQsNC00LrQtSDQo9C00LDQu9GR0L3QvdGL0LUg0LzQtdGB0YHQtdC90LTQttC10YDRiyDigJRcblx0ICog0LHQtdGA0ZHRgiDQt9C90LDRh9C10L3QuNGPINGE0L7RgNC80YsgKGhvc3QvcG9ydC9sb2dpbi9rZXkpLCBQT1NU0LjRgiDQvdCwINCx0LXQutC10L3QtCxcblx0ICog0L/QvtC60LDQt9GL0LLQsNC10YIg0YDQtdC30YPQu9GM0YLQsNGCIGlubGluZS4g0KHQvtGF0YDQsNC90LXQvdC40LUg0L3QtSDQtNC10LvQsNC10YIuXG5cdCAqL1xuXHRpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QoKSB7XG5cdFx0Y29uc3QgJGJ0biA9ICQoJyNjdGktdGVzdC1yZW1vdGUtY29ubicpO1xuXHRcdGNvbnN0ICRyZXN1bHQgPSAkKCcjY3RpLXRlc3QtcmVtb3RlLWNvbm4tcmVzdWx0Jyk7XG5cdFx0aWYgKCRidG4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlclJlc3VsdCA9IChwcm9iZSwgZmFsbGJhY2tFcnIpID0+IHtcblx0XHRcdCRidG4ucmVtb3ZlQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5hcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0XHRcdGlmIChwcm9iZSAmJiBwcm9iZS5vayA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRjb25zdCBva0xhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdE9rIHx8ICdDb25uZWN0aW9uIE9LJztcblx0XHRcdFx0Y29uc3QgYXJjaCA9IHByb2JlLmFyY2ggPyBgICR7cHJvYmUuYXJjaH1gIDogJyc7XG5cdFx0XHRcdGNvbnN0IHJ3TGFiZWwgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVUZXN0UndPayB8fCAncncgT0snO1xuXHRcdFx0XHQkcmVzdWx0LmNzcygnY29sb3InLCAnIzIxYmE0NScpLnRleHQoYCR7b2tMYWJlbH0g4oCUJHthcmNofSwgJHtyd0xhYmVsfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmYWlsTGFiZWwgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVUZXN0RmFpbCB8fCAnQ29ubmVjdGlvbiBmYWlsZWQnO1xuXHRcdFx0Y29uc3QgZXJyID0gKHByb2JlICYmIHByb2JlLmVycm9yKSA/IHByb2JlLmVycm9yIDogKGZhbGxiYWNrRXJyIHx8ICcnKTtcblx0XHRcdCRyZXN1bHQuY3NzKCdjb2xvcicsICcjZGIyODI4JykudGV4dChlcnIgPyBgJHtmYWlsTGFiZWx9OiAke2Vycn1gIDogZmFpbExhYmVsKTtcblx0XHR9O1xuXG5cdFx0JGJ0bi5vZmYoJ2NsaWNrLmN0aVJlbW90ZVRlc3QnKS5vbignY2xpY2suY3RpUmVtb3RlVGVzdCcsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQkYnRuLmFkZENsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHQkcmVzdWx0LnJlbW92ZUNsYXNzKCdncmVlbiByZWQnKVxuXHRcdFx0XHQuY3NzKCdjb2xvcicsICcjNjY2Jylcblx0XHRcdFx0LnRleHQoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdFJ1bm5pbmcgfHwgJ1Byb2JpbmfigKYnKTtcblx0XHRcdC8vIERvbid0IHNlbmQgdGhlIG1hc2tlZCBzYXZlZCBrZXkgYmFjayB0byB0aGUgc2VydmVyIOKAlCBlbXB0eSBrZXlcblx0XHRcdC8vIHRlbGxzIHRoZSBiYWNrZW5kIHRvIGZhbGwgYmFjayB0byB0aGUgREIgdmFsdWUgdHJhbnNwYXJlbnRseS5cblx0XHRcdGNvbnN0IHJhd0tleSA9ICQoJyNyZW1vdGVfc3NoX2tleScpLnZhbCgpIHx8ICcnO1xuXHRcdFx0Y29uc3Qga2V5Rm9yUG9zdCA9IHJhd0tleS5pbmRleE9mKCcqKioqKionKSAhPT0gLTEgPyAnJyA6IHJhd0tleTtcblx0XHRcdCQuYWpheCh7XG5cdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvdGVzdFJlbW90ZUNvbm5lY3Rpb25gLFxuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0ZGF0YVR5cGU6ICdqc29uJyxcblx0XHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGhvc3Q6ICQoJyNyZW1vdGVfaG9zdCcpLnZhbCgpIHx8ICcnLFxuXHRcdFx0XHRcdHBvcnQ6ICQoJyNyZW1vdGVfc3NoX3BvcnQnKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0XHRsb2dpbjogJCgnI3JlbW90ZV9zc2hfbG9naW4nKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0XHRrZXk6IGtleUZvclBvc3QsXG5cdFx0XHRcdFx0YmFzZTogJCgnI3JlbW90ZV9iaW5fZGlyJykudmFsKCkgfHwgJycsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdWNjZXNzKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0Ly8gUEJYQXBpUmVzdWx0OiB7IHJlc3VsdCwgZGF0YToge29rLCBhcmNoLCBlcnJvcn0sIG1lc3NhZ2VzLCAuLi4gfVxuXHRcdFx0XHRcdGNvbnN0IHByb2JlID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEpID8gcmVzcG9uc2UuZGF0YSA6IG51bGw7XG5cdFx0XHRcdFx0Y29uc3QgbXNnID0gKHJlc3BvbnNlICYmIEFycmF5LmlzQXJyYXkocmVzcG9uc2UubWVzc2FnZXMpICYmIHJlc3BvbnNlLm1lc3NhZ2VzLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHQ/IHJlc3BvbnNlLm1lc3NhZ2VzLmpvaW4oJzsgJykgOiAnJztcblx0XHRcdFx0XHRyZW5kZXJSZXN1bHQocHJvYmUsIG1zZyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yKHhocikge1xuXHRcdFx0XHRcdC8vIENvcmUjMTE2NjogbmV3ZXIgY29yZXMgc2VuZCBhIGZhaWxlZCBwcm9iZSBhcyBIVFRQIDR4eCB3aXRoIHRoZSBzYW1lIEpTT04gYm9keS5cblx0XHRcdFx0XHRpZiAoeGhyLnJlc3BvbnNlSlNPTiAmJiB0eXBlb2YgeGhyLnJlc3BvbnNlSlNPTiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRcdHRoaXMuc3VjY2Vzcyh4aHIucmVzcG9uc2VKU09OKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVuZGVyUmVzdWx0KG51bGwsIGBIVFRQICR7eGhyLnN0YXR1cyB8fCAnZXJyb3InfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0sXG5cdC8qKlxuXHQgKiBQaGFzZSBDOiDQvtC/0LXRgNCw0YLQvtGA0YHQutC40LkgZmFpbGJhY2sg0LLRi9C90LXRgdC10L3QvdC+0LPQviDRgdC10YDQstC40YHQsCDQvtCx0YDQsNGC0L3QviDQvdCwINC70L7QutCw0LvRjC5cblx0ICog0JrQvdC+0L/QutCwINC20LjQstGR0YIg0LIg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIsINC60L7RgtC+0YDQsNGPINC/0LXRgNC10YDQuNGB0L7QstGL0LLQsNC10YLRgdGPINC90LAg0LrQsNC20LTQvtC8INC+0L/RgNC+0YHQtSxcblx0ICog0L/QvtGN0YLQvtC80YMg0YHQu9GD0YjQsNGC0LXQu9GMINC00LXQu9C10LPQuNGA0L7QstCw0L3QvdGL0LkgKNC90LAgZG9jdW1lbnQpLiDQkdGN0LrQtdC90LQg0YHQvdC40LzQsNC10YIg0YLRg9C80LHQu9C10YBcblx0ICogKGZlbmNlKSDQuCDQv9C+0LTQvdC40LzQsNC10YIg0LvQvtC60LDQu9GMINC40Lcg0LvQvtC60LDQu9GM0L3QvtC5INC60L7Qv9C40Lgg0YHQtdGB0YHQuNC4LlxuXHQgKi9cblx0aW5pdGlhbGl6ZVJlbW90ZUZhaWxiYWNrKCkge1xuXHRcdCQoZG9jdW1lbnQpLm9mZignY2xpY2suY3RpRmFpbGJhY2snLCAnLmN0aS1mYWlsYmFjay1idG4nKVxuXHRcdFx0Lm9uKCdjbGljay5jdGlGYWlsYmFjaycsICcuY3RpLWZhaWxiYWNrLWJ0bicsIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29uc3QgJGJ0biA9ICQoZS5jdXJyZW50VGFyZ2V0KTtcblx0XHRcdFx0Y29uc3Qgc3ZjID0gJGJ0bi5hdHRyKCdkYXRhLXN2YycpIHx8ICcnO1xuXHRcdFx0XHRpZiAoc3ZjID09PSAnJyB8fCAkYnRuLmhhc0NsYXNzKCdkaXNhYmxlZCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1Nc2cgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9GYWlsYmFja0NvbmZpcm1cblx0XHRcdFx0XHR8fCAnQnJpbmcgdGhpcyBzZXJ2aWNlIGJhY2sgdG8gbG9jYWwgZnJvbSB0aGUgbGFzdCBsb2NhbCBjb3B5PyAnXG5cdFx0XHRcdFx0XHQrICdUaGUgVlBTIHdpbGwgYmUgdHVybmVkIG9mZiBmb3IgaXQuJztcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWFsZXJ0XG5cdFx0XHRcdGlmICghd2luZG93LmNvbmZpcm0oY29uZmlybU1zZykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0JGJ0bi5hZGRDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRjb25zdCBmYWlsTGFiZWwgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9GYWlsYmFja0ZhaWxlZCB8fCAnRmFpbGJhY2sgZmFpbGVkJztcblx0XHRcdFx0JC5hamF4KHtcblx0XHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2ZhaWxiYWNrYCxcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdGRhdGFUeXBlOiAnanNvbicsXG5cdFx0XHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoeyBzZXJ2aWNlOiBzdmMgfSksXG5cdFx0XHRcdFx0c3VjY2VzcyhyZXNwb25zZSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2sgPSByZXNwb25zZSAmJiByZXNwb25zZS5kYXRhICYmIHJlc3BvbnNlLmRhdGEub2sgPT09IHRydWU7XG5cdFx0XHRcdFx0XHRpZiAob2spIHtcblx0XHRcdFx0XHRcdFx0Ly8gTWlycm9yIHRoZSBmZW5jZSBpbnRvIHRoZSBvcGVuIHNldHRpbmdzIGZvcm06IHRoZSBiYWNrZW5kXG5cdFx0XHRcdFx0XHRcdC8vIGFscmVhZHkgY2xlYXJlZCB0aGUgcmVtb3RlIHRvZ2dsZSBpbiB0aGUgREIsIGJ1dCBhIGxhdGVyXG5cdFx0XHRcdFx0XHRcdC8vIHNldHRpbmdzIHNhdmUgd291bGQgcmUtcG9zdCB0aGUgc3RpbGwtY2hlY2tlZCBib3ggYW5kIHVuZG9cblx0XHRcdFx0XHRcdFx0Ly8gaXQg4oCUIHNvIHVuY2hlY2sgaXQgaGVyZSB0b28uXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpZWxkTWFwID0geyBjaGF0czogJ3JlbW90ZV93aGF0c2FwcCcsIHRnOiAncmVtb3RlX3RlbGVncmFtJywgbWF4OiAncmVtb3RlX21heCcgfTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmllbGQgPSBmaWVsZE1hcFtzdmNdO1xuXHRcdFx0XHRcdFx0XHRpZiAoZmllbGQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCAkY2IgPSAkKGAjJHtmaWVsZH1gKTtcblx0XHRcdFx0XHRcdFx0XHQkY2IucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0XHQkY2IuY2xvc2VzdCgnLnVpLmNoZWNrYm94JykuY2hlY2tib3goJ3NldCB1bmNoZWNrZWQnKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvLyBMZWF2ZSB0aGUgYnV0dG9uIGJ1c3k7IHRoZSBzdGF0dXMgd29ya2VyIHJlLXBvbGxzIHdpdGhpblxuXHRcdFx0XHRcdFx0XHQvLyBhIGZldyBzZWNvbmRzLCB0aGUgc2VydmljZSBmbGlwcyB0byBsb2NhbCBhbmQgdGhlIHJvd1xuXHRcdFx0XHRcdFx0XHQvLyAod2l0aCBpdHMgYnV0dG9uKSBkaXNhcHBlYXJzIG9uIHRoZSBuZXh0IHJlbmRlci5cblx0XHRcdFx0XHRcdFx0Ly8gU2FmZXR5IG5ldDogaWYgdGhlIHJlLXBvbGwgaGFzbid0IHJlbW92ZWQgdGhlIHJvdyB3aXRoaW5cblx0XHRcdFx0XHRcdFx0Ly8gfjE1cyAoYmFja2VuZCBkaWRuJ3QgY29udmVyZ2UpLCBkcm9wIHRoZSBidXN5IHN0YXRlIHNvIHRoZVxuXHRcdFx0XHRcdFx0XHQvLyBvcGVyYXRvciBjYW4gcmV0cnkgaW5zdGVhZCBvZiBhIHBlcm1hbmVudGx5LXNwaW5uaW5nIGJ1dHRvbi5cblx0XHRcdFx0XHRcdFx0Ly8gTm8tb3AgaWYgdGhlIHJvdyB3YXMgYWxyZWFkeSByZW1vdmVkIChidXR0b24gZGV0YWNoZWQpLlxuXHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHQkYnRuLnJlbW92ZUNsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRcdFx0XHRcdH0sIDE1MDAwKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0JGJ0bi5yZW1vdmVDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbXNnID0gKHJlc3BvbnNlICYmIEFycmF5LmlzQXJyYXkocmVzcG9uc2UubWVzc2FnZXMpICYmIHJlc3BvbnNlLm1lc3NhZ2VzLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHRcdD8gcmVzcG9uc2UubWVzc2FnZXMuam9pbignOyAnKSA6ICcnO1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWFsZXJ0XG5cdFx0XHRcdFx0XHR3aW5kb3cuYWxlcnQobXNnID8gYCR7ZmFpbExhYmVsfTogJHttc2d9YCA6IGZhaWxMYWJlbCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRlcnJvcih4aHIpIHtcblx0XHRcdFx0XHRcdC8vIENvcmUjMTE2NjogbmV3ZXIgY29yZXMgc2VuZCBhIHJlZnVzZWQgZmFpbGJhY2sgYXMgSFRUUCA0eHggd2l0aCB0aGUgc2FtZSBKU09OIGJvZHkuXG5cdFx0XHRcdFx0XHRpZiAoeGhyLnJlc3BvbnNlSlNPTiAmJiB0eXBlb2YgeGhyLnJlc3BvbnNlSlNPTiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zdWNjZXNzKHhoci5yZXNwb25zZUpTT04pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQkYnRuLnJlbW92ZUNsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYWxlcnRcblx0XHRcdFx0XHRcdHdpbmRvdy5hbGVydChgJHtmYWlsTGFiZWx9OiBIVFRQICR7eGhyLnN0YXR1cyB8fCAnZXJyb3InfWApO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9GA0L7QstC10YDQutCwINGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LTRg9C70Y9cblx0ICovXG5cdGNoZWNrU3RhdHVzVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkKCcuZGlzYWJpbGl0eScpLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuc2hvdygpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmluaXRpYWxpemUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuaGlkZSgpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuaGlkZSgpO1xuXHRcdFx0JCgnLmRpc2FiaWxpdHknKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcblx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9C10YDQtdC60LvRjtGH0LDRgtC10LvRjCDRg9GB0YLQsNC90L7QstC60LggQ2FsbGVySUQg0LjQtyAx0KFcblx0ICog0J/RgNGP0YfQtdGCINC40LvQuCDQv9C+0LrQsNC30YvQstCw0LXRgiDRgdGC0LDRgtGD0YEg0YLRgNCw0L3RgdC70LjRgtC10YDQsNGG0LjQuFxuXHQgKi9cblx0c2V0Q2FsbGVySWRUb2dnbGUoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kY2FsbGVySWRTZXR1cFRvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkVHJhbnNsaXRlcmF0aW9uVG9nZ2xlQmxvY2suc2hvdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkVHJhbnNsaXRlcmF0aW9uVG9nZ2xlQmxvY2suaGlkZSgpO1xuXHRcdH1cblx0fSxcblx0LyoqXG5cdCAqINCS0YvQsdC+0YAgQ1JNOiDRgdC60YDRi9GC0Ywv0L/QvtC60LDQt9Cw0YLRjCDQsdC70L7QuiDQvdCw0YHRgtGA0L7QtdC6IDHQoVxuXHQgKi9cblx0aXNDcm0xY1NlbGVjdGVkKCkge1xuXHRcdHJldHVybiAkKCcjY3JtX3R5cGVfMWMnKS5wcm9wKCdjaGVja2VkJykgPT09IHRydWU7XG5cdH0sXG5cdGNybVR5cGVUb2dnbGUoKSB7XG5cdFx0Ly8g0KHQutGA0LjQvdGI0L7RgiDRgSDRh9Cw0YLQsNC80Lgg0L/QvtC60LDQt9GL0LLQsNC10YLRgdGPINGC0L7Qu9GM0LrQviDQv9GA0Lgg0YLQuNC/0LUgQ1JNIMKrMdChwrtcblx0XHRjb25zdCAkY2hhdFRodW1icyA9ICQoJyNjdGktY2xpZW50LXNjcmVlbnNob3RzIC5jdGktc2NyZWVuc2hvdC10aHVtYltkYXRhLWZ1bGwqPVwiL2NoYXRcIl0nKTtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LmlzQ3JtMWNTZWxlY3RlZCgpKSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNybVNldHRpbmdzQmxvY2suc2hvdygpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjcm1IaWRkZW5UYWJzLnNob3coKTtcblx0XHRcdCRjaGF0VGh1bWJzLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjcm1TZXR0aW5nc0Jsb2NrLmhpZGUoKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kY3JtSGlkZGVuVGFicy5oaWRlKCk7XG5cdFx0XHQkY2hhdFRodW1icy5oaWRlKCk7XG5cdFx0XHQvLyDQldGB0LvQuCDQv9GA0LXQstGM0Y4g0L/QvtC60LDQt9GL0LLQsNC10YIg0YfQsNGC0Ysg4oCUINC/0LXRgNC10LrQu9GO0YfQsNC10Lwg0L3QsCDQv9C10YDQstGL0Lkg0LTQvtGB0YLRg9C/0L3Ri9C5INGB0LrRgNC40L3RiNC+0YJcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5zd2l0Y2hDaGF0U2NyZWVuc2hvdFByZXZpZXdBd2F5KCRjaGF0VGh1bWJzKTtcblx0XHRcdC8vINCd0LUg0L7RgdGC0LDQstC70Y/QtdC8INCw0LrRgtC40LLQvdC+0Lkg0YHQutGA0YvRgtGD0Y4g0LLQutC70LDQtNC60YMg0LzQtdGB0YHQtdC90LTQttC10YDQvtCyLlxuXHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kY3JtSGlkZGVuVGFicy5oYXNDbGFzcygnYWN0aXZlJykpIHtcblx0XHRcdFx0JCgnI21vZHVsZS1jdGktY2xpZW50LXRhYnMgLml0ZW0nKS50YWIoJ2NoYW5nZSB0YWInLCAnc2V0dGluZ3MnKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQldGB0LvQuCDQsdC+0LvRjNGI0L7QtSDQv9GA0LXQstGM0Y4g0L/QvtC60LDQt9GL0LLQsNC10YIg0YHQutGA0LjQvdGI0L7RgiDRh9Cw0YLQvtCyLCDQv9C10YDQtdC60LvRjtGH0LDQtdGCINC10LPQvlxuXHQgKiDQvdCwINC/0LXRgNCy0YvQuSDRgdC60YDQuNC90YjQvtGCLCDQvdC1INGB0LLRj9C30LDQvdC90YvQuSDRgSDRh9Cw0YLQsNC80LguXG5cdCAqL1xuXHRzd2l0Y2hDaGF0U2NyZWVuc2hvdFByZXZpZXdBd2F5KCRjaGF0VGh1bWJzKSB7XG5cdFx0Y29uc3QgJHByZXZpZXcgPSAkKCcjY3RpLXNjcmVlbnNob3QtcHJldmlldycpO1xuXHRcdGlmICgkcHJldmlldy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJldmlld1NyYyA9ICRwcmV2aWV3LmF0dHIoJ3NyYycpO1xuXHRcdGNvbnN0IGNoYXRBY3RpdmUgPSAkY2hhdFRodW1icy5oYXNDbGFzcygnYWN0aXZlJylcblx0XHRcdHx8ICRjaGF0VGh1bWJzLmZpbHRlcihgW2RhdGEtZnVsbD1cIiR7cHJldmlld1NyY31cIl1gKS5sZW5ndGggPiAwO1xuXHRcdGlmICghY2hhdEFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCAkZmlyc3RPdGhlciA9ICQoJyNjdGktY2xpZW50LXNjcmVlbnNob3RzIC5jdGktc2NyZWVuc2hvdC10aHVtYicpLm5vdCgkY2hhdFRodW1icykuZmlyc3QoKTtcblx0XHRpZiAoJGZpcnN0T3RoZXIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdCQoJyNjdGktY2xpZW50LXNjcmVlbnNob3RzIC5jdGktc2NyZWVuc2hvdC10aHVtYicpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcblx0XHQkZmlyc3RPdGhlci5hZGRDbGFzcygnYWN0aXZlJyk7XG5cdFx0JHByZXZpZXcuYXR0cignc3JjJywgJGZpcnN0T3RoZXIuYXR0cignZGF0YS1mdWxsJykpO1xuXHR9LFxuXHQvKipcblx0ICog0JLQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDRgNCw0LHQvtGC0Ysg0YfQtdGA0LXQtyBXU1xuXHQgKi9cblx0ZW5hYmxlV3NGaWVsZHMoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiR3c09ubHlGaWVsZHMucmVtb3ZlQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQktGL0LrQu9GO0YfQtdC90LjQtSDRgNC10LbQuNC80LAg0YDQsNCx0L7RgtGLINGH0LXRgNC10LcgV1Ncblx0ICovXG5cdGRpc2FibGVXc0ZpZWxkcygpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuJHdzT25seUZpZWxkcy5hZGRDbGFzcygnZGlzYWJsZWQnKTtcblx0fSxcblx0LyoqXG5cdCAqINCf0YDQuCDQuNC30LzQtdC90LXQvdC40LggU1NMINGA0LXQttC40LzQsFxuXHQgKiBAcGFyYW0gdmFsdWVcblx0ICogQHBhcmFtIHRleHRcblx0ICogQHBhcmFtICRjaG9pY2Vcblx0ICovXG5cdGNiU3NsTW9kZU9uQ2hhbmdlKHZhbHVlLCB0ZXh0LCAkY2hvaWNlKXtcblx0XHRjb25zdCBwb3J0ID0gbW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqLmZvcm0oJ2dldCB2YWx1ZScsJ3NlcnZlcjFjcG9ydCcpO1xuXHRcdGlmICh2YWx1ZT09PSdodHRwJyAmJiBwb3J0PT09JzQ0Mycpe1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqLmZvcm0oJ3NldCB2YWx1ZScsJ3NlcnZlcjFjcG9ydCcsIDgwKTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlPT09J2h0dHBzJyAmJiBwb3J0PT09JzgwJyl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnc2V0IHZhbHVlJywnc2VydmVyMWNwb3J0JywgNDQzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0sXG5cdGNiQmVmb3JlU2VuZEZvcm0oc2V0dGluZ3MpIHtcblx0XHRjb25zdCByZXN1bHQgPSBzZXR0aW5ncztcblx0XHRyZXN1bHQuZGF0YSA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdnZXQgdmFsdWVzJyk7XG5cdFx0cmVzdWx0LmRhdGEgPSBtb2R1bGVDVElDbGllbnQuc3luY1JlbW90ZUZpZWxkc0JlZm9yZVN1Ym1pdChyZXN1bHQuZGF0YSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSxcblx0Y2JBZnRlclNlbmRGb3JtKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC5pbml0aWFsaXplKCk7XG5cdH0sXG5cdGluaXRpYWxpemVGb3JtKCkge1xuXHRcdEZvcm0uJGZvcm1PYmogPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmo7XG5cdFx0Rm9ybS51cmwgPSBgJHtnbG9iYWxSb290VXJsfW1vZHVsZS1jLXQtaS1jbGllbnQvc2F2ZWA7XG5cdFx0Rm9ybS52YWxpZGF0ZVJ1bGVzID0gbW9kdWxlQ1RJQ2xpZW50LnZhbGlkYXRlUnVsZXM7XG5cdFx0Rm9ybS5jYkJlZm9yZVNlbmRGb3JtID0gbW9kdWxlQ1RJQ2xpZW50LmNiQmVmb3JlU2VuZEZvcm07XG5cdFx0Rm9ybS5jYkFmdGVyU2VuZEZvcm0gPSBtb2R1bGVDVElDbGllbnQuY2JBZnRlclNlbmRGb3JtO1xuXHRcdEZvcm0uaW5pdGlhbGl6ZSgpO1xuXHR9LFxufTtcblxuXG4kLmZuLmZvcm0uc2V0dGluZ3MucnVsZXMuZW1wdHlDdXN0b21SdWxlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmICghbW9kdWxlQ1RJQ2xpZW50LmlzQ3JtMWNTZWxlY3RlZCgpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKG1vZHVsZUNUSUNsaWVudC4kYXV0b1NldHRpbmdzVG9nZ2xlLmNoZWNrYm94KCdpcyB1bmNoZWNrZWQnKVxuXHRcdCYmIG1vZHVsZUNUSUNsaWVudC4kd3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKVxuXHRcdCYmIHZhbHVlID09PSAnJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbiQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy53cm9uZ1BvcnRDdXN0b21SdWxlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmICghbW9kdWxlQ1RJQ2xpZW50LmlzQ3JtMWNTZWxlY3RlZCgpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKG1vZHVsZUNUSUNsaWVudC4kYXV0b1NldHRpbmdzVG9nZ2xlLmNoZWNrYm94KCdpcyB1bmNoZWNrZWQnKVxuXHRcdCYmIG1vZHVsZUNUSUNsaWVudC4kd3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKVxuXHQpIHtcblx0XHRyZXR1cm4gJC5mbi5mb3JtLnNldHRpbmdzLnJ1bGVzLmludGVnZXIodmFsdWUsICcxLi42NTUzNScpO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufTtcblxuJChkb2N1bWVudCkucmVhZHkoKCkgPT4ge1xuXHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZSgpO1xufSk7XG4iXX0=