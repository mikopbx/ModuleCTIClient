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
    if (moduleCTIClient.isCrm1cSelected()) {
      moduleCTIClient.$crmSettingsBlock.show();
      moduleCTIClient.$crmHiddenTabs.show();
    } else {
      moduleCTIClient.$crmSettingsBlock.hide();
      moduleCTIClient.$crmHiddenTabs.hide(); // Не оставляем активной скрытую вкладку мессенджеров.

      if (moduleCTIClient.$crmHiddenTabs.hasClass('active')) {
        $('#module-cti-client-tabs .item').tab('change tab', 'settings');
      }
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnQiLCIkd3NUb2dnbGUiLCIkIiwiJHdzVG9nZ2xlUmFkaW8iLCIkc3RhdHVzVG9nZ2xlIiwiJGNhbGxlcklkU2V0dXBUb2dnbGUiLCIkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jayIsIiRmb3JtT2JqIiwiJG1vZHVsZVN0YXR1cyIsIiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRhdXRvU2V0dGluZ3NUb2dnbGUiLCIkY3JtVHlwZVJhZGlvcyIsIiRjcm1TZXR0aW5nc0Jsb2NrIiwiJGNybUhpZGRlblRhYnMiLCIkb25seUF1dG9TZXR0aW5nc1Zpc2libGUiLCIkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZSIsIiR3c09ubHlGaWVsZHMiLCIkZGlycnR5RmllbGQiLCIkc3NsTW9kZVNlbGVjdCIsIiRkZWJ1Z1RhYiIsInJlbW90ZU1pZ3JhdGlvbkxvY2tlZCIsInJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyIsInJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kIiwicmVtb3RlUHJvdGVjdGVkRmllbGRJZHMiLCJyZW1vdGVUb2dnbGVGaWVsZElkcyIsInJlbW90ZVNlcnZpY2VMYWJlbEtleXMiLCJjaGF0cyIsInRnIiwibWF4IiwidmFsaWRhdGVSdWxlcyIsInNlcnZlcjFjaG9zdCIsImlkZW50aWZpZXIiLCJydWxlcyIsInR5cGUiLCJwcm9tcHQiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHkiLCJzZXJ2ZXIxY3BvcnQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UiLCJkYXRhYmFzZSIsIm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lIiwiaW5pdGlhbGl6ZSIsImluaXRpYWxpemVEb3dubG9hZENsaWVudERyb3Bkb3duIiwiaW5pdGlhbGl6ZUNsaWVudFNjcmVlbnNob3RHYWxsZXJ5IiwidGFiIiwiY2hlY2tib3giLCJoaWRlIiwib25DaGVja2VkIiwic2hvdyIsIm9uVW5jaGVja2VkIiwiY3JtVHlwZVRvZ2dsZSIsInZhbCIsIk1hdGgiLCJyYW5kb20iLCJ0cmlnZ2VyIiwib25DaGFuZ2UiLCJzZXRDYWxsZXJJZFRvZ2dsZSIsIkZvcm0iLCJlbmFibGVXc0ZpZWxkcyIsImRpc2FibGVXc0ZpZWxkcyIsImRyb3Bkb3duIiwiY2JTc2xNb2RlT25DaGFuZ2UiLCJpbml0aWFsaXplRm9ybSIsImNoZWNrU3RhdHVzVG9nZ2xlIiwiaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QiLCJpbml0aWFsaXplUmVtb3RlRmFpbGJhY2siLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwiJHRodW1icyIsIiRwcmV2aWV3IiwibGVuZ3RoIiwib2ZmIiwib24iLCJlIiwiJHRodW1iIiwiY3VycmVudFRhcmdldCIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJhdHRyIiwiJGRyb3Bkb3duIiwiZmluZCIsInByZXZlbnREZWZhdWx0Iiwic3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uIiwidXJsIiwib3BlbiIsImFjdGlvbiIsInNldFJlbW90ZU1pZ3JhdGlvbkxvY2siLCJhcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJldmVudCIsImRldGFpbCIsImFjdGl2ZSIsIkFycmF5IiwiaXNBcnJheSIsInNlcnZpY2VzIiwibG9ja2VkIiwiJHJlbW90ZUlucHV0cyIsImdldFJlbW90ZVByb3RlY3RlZElucHV0cyIsIiRyZW1vdGVUb2dnbGVzIiwiZ2V0UmVtb3RlVG9nZ2xlSW5wdXRzIiwiJHJlbW90ZVRlc3RCdXR0b24iLCJwcm9wIiwiY2xvc2VzdCIsInRvZ2dsZUNsYXNzIiwicmVtb3ZlQXR0ciIsInNlcnZpY2VUZXh0IiwiZm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMiLCJiYXNlVGV4dCIsIm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkIiwidGV4dCIsInRvZ2dsZSIsIm1hcCIsImlkIiwiam9pbiIsInNlcnZpY2UiLCJrZXkiLCJzeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0IiwiZm9ybURhdGEiLCJmb3JFYWNoIiwiaXMiLCIkYnRuIiwiJHJlc3VsdCIsInJlbmRlclJlc3VsdCIsInByb2JlIiwiZmFsbGJhY2tFcnIiLCJvayIsIm9rTGFiZWwiLCJtb2RfY3RpX1JlbW90ZVRlc3RPayIsImFyY2giLCJyd0xhYmVsIiwibW9kX2N0aV9SZW1vdGVUZXN0UndPayIsImNzcyIsImZhaWxMYWJlbCIsIm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwiLCJlcnIiLCJlcnJvciIsIm1vZF9jdGlfUmVtb3RlVGVzdFJ1bm5pbmciLCJyYXdLZXkiLCJrZXlGb3JQb3N0IiwiaW5kZXhPZiIsImFqYXgiLCJDb25maWciLCJwYnhVcmwiLCJtZXRob2QiLCJjb250ZW50VHlwZSIsImRhdGFUeXBlIiwiZGF0YSIsIkpTT04iLCJzdHJpbmdpZnkiLCJob3N0IiwicG9ydCIsImxvZ2luIiwiYmFzZSIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm1zZyIsIm1lc3NhZ2VzIiwieGhyIiwicmVzcG9uc2VKU09OIiwic3RhdHVzIiwiZG9jdW1lbnQiLCJzdmMiLCJoYXNDbGFzcyIsImNvbmZpcm1Nc2ciLCJtb2RfY3RpX0ZhaWxiYWNrQ29uZmlybSIsImNvbmZpcm0iLCJtb2RfY3RpX0ZhaWxiYWNrRmFpbGVkIiwiZmllbGRNYXAiLCJmaWVsZCIsIiRjYiIsInNldFRpbWVvdXQiLCJhbGVydCIsIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsInJlbW92ZSIsImlzQ3JtMWNTZWxlY3RlZCIsInZhbHVlIiwiJGNob2ljZSIsImZvcm0iLCJjYkJlZm9yZVNlbmRGb3JtIiwic2V0dGluZ3MiLCJyZXN1bHQiLCJjYkFmdGVyU2VuZEZvcm0iLCJnbG9iYWxSb290VXJsIiwiZm4iLCJl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VixFQUFpQjtBQUMvRCxNQUFJLENBQUNoTCxlQUFlLENBQUMrSyxlQUFoQixFQUFMLEVBQXdDO0FBQ3ZDLFdBQU8sSUFBUDtBQUNBOztBQUNELE1BQUkvSyxlQUFlLENBQUNXLG1CQUFoQixDQUFvQ21DLFFBQXBDLENBQTZDLGNBQTdDLEtBQ0E5QyxlQUFlLENBQUNDLFNBQWhCLENBQTBCNkMsUUFBMUIsQ0FBbUMsWUFBbkMsQ0FESixFQUVFO0FBQ0QsV0FBTzVDLENBQUMsQ0FBQ3NMLEVBQUYsQ0FBS04sSUFBTCxDQUFVRSxRQUFWLENBQW1CbkosS0FBbkIsQ0FBeUIwSixPQUF6QixDQUFpQ1gsS0FBakMsRUFBd0MsVUFBeEMsQ0FBUDtBQUNBOztBQUNELFNBQU8sSUFBUDtBQUNBLENBVkQ7O0FBWUE5SyxDQUFDLENBQUMrSixRQUFELENBQUQsQ0FBWTJCLEtBQVosQ0FBa0IsWUFBTTtBQUN2QjVMLEVBQUFBLGVBQWUsQ0FBQzBDLFVBQWhCO0FBQ0EsQ0FGRCIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIE1JS08gTExDIC0gQWxsIFJpZ2h0cyBSZXNlcnZlZFxuICogVW5hdXRob3JpemVkIGNvcHlpbmcgb2YgdGhpcyBmaWxlLCB2aWEgYW55IG1lZGl1bSBpcyBzdHJpY3RseSBwcm9oaWJpdGVkXG4gKiBQcm9wcmlldGFyeSBhbmQgY29uZmlkZW50aWFsXG4gKiBXcml0dGVuIGJ5IE5pa29sYXkgQmVrZXRvdiwgMTEgMjAxOFxuICpcbiAqL1xuXG5jb25zdCBtb2R1bGVDVElDbGllbnQgPSB7XG5cdCR3c1RvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCR3c1RvZ2dsZVJhZGlvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAud2ViLXNlcnZpY2UtcmFkaW8nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCRjYWxsZXJJZFNldHVwVG9nZ2xlOiAkKCcjc2V0dXAtY2FsbGVyLWlkLXRvZ2dsZScpLFxuXHQkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jazogJCgnI3RyYW5zbGl0ZXJhdGUtY2FsbGVyLWlkLXRvZ2dsZS1ibG9jaycpLFxuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI2N0aS1zdGF0dXMtc3VtbWFyeScpLFxuXHQkcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2U6ICQoJyNjdGktcmVtb3RlLW1pZ3JhdGlvbi1sb2NrLW1lc3NhZ2UnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JGF1dG9TZXR0aW5nc1RvZ2dsZTogJCgnI2F1dG8tc2V0dGluZ3MtbW9kZS10b2dnbGUnKSxcblx0JGNybVR5cGVSYWRpb3M6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5jcm0tdHlwZS1yYWRpbycpLFxuXHQkY3JtU2V0dGluZ3NCbG9jazogJCgnI2NybS0xYy1zZXR0aW5ncy1ibG9jaycpLFxuXHQkY3JtSGlkZGVuVGFiczogJCgnI21vZHVsZS1jdGktY2xpZW50LXRhYnMgLml0ZW1bZGF0YS10YWI9XCJtZXNzZW5nZXJzXCJdLCAjbW9kdWxlLWN0aS1jbGllbnQtdGFicyAuaXRlbVtkYXRhLXRhYj1cInJlbW90ZVwiXScpLFxuXHQkb25seUF1dG9TZXR0aW5nc1Zpc2libGU6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5vbmx5LWF1dG8tc2V0dGluZ3MnKSxcblx0JG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGU6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5vbmx5LW1hbnVhbC1zZXR0aW5ncycpLFxuXHQkd3NPbmx5RmllbGRzOiAkKCcud3Mtb25seScpLFxuXHQkZGlycnR5RmllbGQ6ICQoJyNkaXJydHknKSxcblx0JHNzbE1vZGVTZWxlY3Q6ICQoJy5zZXJ2ZXIxY19zY2hlbWUgc2VsZWN0JyksXG5cdCRkZWJ1Z1RhYjogJCgnI21vZHVsZS1jdGktY2xpZW50LXRhYnMgLml0ZW1bZGF0YS10YWI9XCJkZWJ1Z1wiXScpLFxuXHRyZW1vdGVNaWdyYXRpb25Mb2NrZWQ6IGZhbHNlLFxuXHRyZW1vdGVNaWdyYXRpb25Mb2NrU2VydmljZXM6IFtdLFxuXHRyZW1vdGVNaWdyYXRpb25Mb2NrTGlzdGVuZXJCb3VuZDogZmFsc2UsXG5cdHJlbW90ZVByb3RlY3RlZEZpZWxkSWRzOiBbXG5cdFx0J3JlbW90ZV9ob3N0Jyxcblx0XHQncmVtb3RlX3NzaF9wb3J0Jyxcblx0XHQncmVtb3RlX3NzaF9sb2dpbicsXG5cdFx0J3JlbW90ZV9zc2hfa2V5Jyxcblx0XHQncmVtb3RlX2Jpbl9kaXInLFxuXHRdLFxuXHRyZW1vdGVUb2dnbGVGaWVsZElkczogWydyZW1vdGVfd2hhdHNhcHAnLCAncmVtb3RlX3RlbGVncmFtJywgJ3JlbW90ZV9tYXgnXSxcblx0cmVtb3RlU2VydmljZUxhYmVsS2V5czoge1xuXHRcdGNoYXRzOiAnbW9kX2N0aV9zdmNfY2hhdHMnLFxuXHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdG1heDogJ21vZF9jdGlfc3ZjX21heCcsXG5cdH0sXG5cdHZhbGlkYXRlUnVsZXM6IHtcblx0XHRzZXJ2ZXIxY2hvc3Q6IHtcblx0XHRcdGlkZW50aWZpZXI6ICdzZXJ2ZXIxY2hvc3QnLFxuXHRcdFx0cnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdlbXB0eUN1c3RvbVJ1bGUnLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVTZXJ2ZXIxQ0hvc3RFbXB0eSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRzZXJ2ZXIxY3BvcnQ6IHtcblx0XHRcdGlkZW50aWZpZXI6ICdzZXJ2ZXIxY3BvcnQnLFxuXHRcdFx0cnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd3cm9uZ1BvcnRDdXN0b21SdWxlJyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0ZGF0YWJhc2U6IHtcblx0XHRcdGlkZW50aWZpZXI6ICdkYXRhYmFzZScsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2VtcHR5Q3VzdG9tUnVsZScsXG5cdFx0XHRcdFx0cHJvbXB0OiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WYWxpZGF0ZVB1Yk5hbWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdH0sXG5cdGluaXRpYWxpemUoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVEb3dubG9hZENsaWVudERyb3Bkb3duKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVDbGllbnRTY3JlZW5zaG90R2FsbGVyeSgpO1xuXHRcdCQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5pdGVtJykudGFiKCk7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUYWIuaGlkZSgpXG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLnNob3coKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblVuY2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLmhpZGUoKVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRtb2R1bGVDVElDbGllbnQuY3JtVHlwZVRvZ2dsZSgpO1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kY3JtVHlwZVJhZGlvc1xuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudmFsKE1hdGgucmFuZG9tKCkpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudHJpZ2dlcignY2hhbmdlJyk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LmNybVR5cGVUb2dnbGUoKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cblx0XHRtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkU2V0dXBUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hhbmdlOiBtb2R1bGVDVElDbGllbnQuc2V0Q2FsbGVySWRUb2dnbGVcblx0XHRcdH0pO1xuXG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLmhpZGUoKTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLnNob3coKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudmFsKE1hdGgucmFuZG9tKCkpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudHJpZ2dlcignY2hhbmdlJyk7XG5cdFx0XHRcdFx0Rm9ybS52YWxpZGF0ZVJ1bGVzID0ge307XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uVW5jaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudmFsKE1hdGgucmFuZG9tKCkpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudHJpZ2dlcignY2hhbmdlJyk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRvbmx5QXV0b1NldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRvbmx5TWFudWFsU2V0dGluZ3NWaXNpYmxlLnNob3coKTtcblx0XHRcdFx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSBtb2R1bGVDVElDbGllbnQudmFsaWRhdGVSdWxlcztcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuZW5hYmxlV3NGaWVsZHMoKTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZVJhZGlvXG5cdFx0XHQuY2hlY2tib3goe1xuXHRcdFx0XHRvbkNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZW5hYmxlV3NGaWVsZHMoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LmRpc2FibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kc3NsTW9kZVNlbGVjdC5kcm9wZG93bih7XG5cdFx0XHRvbkNoYW5nZTogbW9kdWxlQ1RJQ2xpZW50LmNiU3NsTW9kZU9uQ2hhbmdlXG5cdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVGb3JtKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmNoZWNrU3RhdHVzVG9nZ2xlKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnNldENhbGxlcklkVG9nZ2xlKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVSZW1vdGVDb25uZWN0aW9uVGVzdCgpO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5pbml0aWFsaXplUmVtb3RlRmFpbGJhY2soKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignTW9kdWxlU3RhdHVzQ2hhbmdlZCcsIG1vZHVsZUNUSUNsaWVudC5jaGVja1N0YXR1c1RvZ2dsZSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQk9Cw0LvQtdGA0LXRjyDRgdC60YDQuNC90YjQvtGC0L7QsiDQutC70LjQtdC90YLQsDog0LrQu9C40Log0L/QviDQvNC40L3QuNCw0YLRjtGA0LUg0L/QvtC00LzQtdC90Y/QtdGCINCx0L7Qu9GM0YjQvtC1INC/0YDQtdCy0YzRji5cblx0ICovXG5cdGluaXRpYWxpemVDbGllbnRTY3JlZW5zaG90R2FsbGVyeSgpIHtcblx0XHRjb25zdCAkdGh1bWJzID0gJCgnI2N0aS1jbGllbnQtc2NyZWVuc2hvdHMgLmN0aS1zY3JlZW5zaG90LXRodW1iJyk7XG5cdFx0Y29uc3QgJHByZXZpZXcgPSAkKCcjY3RpLXNjcmVlbnNob3QtcHJldmlldycpO1xuXHRcdGlmICgkdGh1bWJzLmxlbmd0aCA9PT0gMCB8fCAkcHJldmlldy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0JHRodW1icy5vZmYoJ2NsaWNrLmN0aUdhbGxlcnknKS5vbignY2xpY2suY3RpR2FsbGVyeScsIChlKSA9PiB7XG5cdFx0XHRjb25zdCAkdGh1bWIgPSAkKGUuY3VycmVudFRhcmdldCk7XG5cdFx0XHQkdGh1bWJzLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcblx0XHRcdCR0aHVtYi5hZGRDbGFzcygnYWN0aXZlJyk7XG5cdFx0XHQkcHJldmlldy5hdHRyKCdzcmMnLCAkdGh1bWIuYXR0cignZGF0YS1mdWxsJykpO1xuXHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICog0JTRgNC+0L/QtNCw0YPQvSDCq9Ch0LrQsNGH0LDRgtGMwrsg0YEg0LLQtdGH0L3Ri9C80Lgg0YHRgdGL0LvQutCw0LzQuCDQvdCwINC60LvQuNC10L3RgiBNaWtvIENUSS5cblx0ICog0KHQu9GD0YjQsNGC0LXQu9GMINCy0LXRiNCw0LXRgtGB0Y8g0LTQviAudGFiKCkg4oCUINGC0L7RgiDRgtC+0LbQtSDQstC10YjQsNC10YIgY2xpY2sg0L3QsCDQstGB0LUgLml0ZW0g0YTQvtGA0LzRiyxcblx0ICogc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uINC90LUg0LTQsNGR0YIg0LXQvNGDINC/0LXRgNC10YXQstCw0YLQuNGC0Ywg0L/QtdGA0LXRhdC+0LQg0L/QviDRgdGB0YvQu9C60LUuXG5cdCAqL1xuXHRpbml0aWFsaXplRG93bmxvYWRDbGllbnREcm9wZG93bigpIHtcblx0XHRjb25zdCAkZHJvcGRvd24gPSAkKCcjY3RpLWRvd25sb2FkLWNsaWVudCcpO1xuXHRcdGlmICgkZHJvcGRvd24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdCRkcm9wZG93bi5maW5kKCcubWVudSBhLml0ZW0nKVxuXHRcdFx0Lm9mZignY2xpY2suY3RpRG93bmxvYWQnKVxuXHRcdFx0Lm9uKCdjbGljay5jdGlEb3dubG9hZCcsIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgdXJsID0gJChlLmN1cnJlbnRUYXJnZXQpLmF0dHIoJ2hyZWYnKTtcblx0XHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHRcdHdpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCRkcm9wZG93bi5kcm9wZG93bignaGlkZScpO1xuXHRcdFx0fSk7XG5cdFx0JGRyb3Bkb3duLmRyb3Bkb3duKHsgYWN0aW9uOiAnbm90aGluZycgfSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9C+0LTQv9C40YHQutCwINC90LAg0YHRgtCw0YLRg9GBINCw0LrRgtC40LLQvdC+0Lkg0LzQuNCz0YDQsNGG0LjQuCDQvNC10YHRgdC10L3QtNC20LXRgNC+0LIuXG5cdCAqL1xuXHRpbml0aWFsaXplUmVtb3RlTWlncmF0aW9uTG9jaygpIHtcblx0XHRpZiAoIW1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrTGlzdGVuZXJCb3VuZCkge1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXG5cdFx0XHRcdCdSZW1vdGVNaWdyYXRpb25Mb2NrQ2hhbmdlZCcsXG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5zZXRSZW1vdGVNaWdyYXRpb25Mb2NrLFxuXHRcdFx0KTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrTGlzdGVuZXJCb3VuZCA9IHRydWU7XG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC5hcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0fSxcblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQuNGC0Ywg0YHQvtGB0YLQvtGP0L3QuNC1INCx0LvQvtC60LjRgNC+0LLQutC4IHJlbW90ZS9WUFMg0L/QvtC70LXQuS5cblx0ICogQHBhcmFtIHtDdXN0b21FdmVudH0gZXZlbnRcblx0ICovXG5cdHNldFJlbW90ZU1pZ3JhdGlvbkxvY2soZXZlbnQpIHtcblx0XHRjb25zdCBkZXRhaWwgPSAoZXZlbnQgJiYgZXZlbnQuZGV0YWlsKSA/IGV2ZW50LmRldGFpbCA6IHt9O1xuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgPSBkZXRhaWwuYWN0aXZlID09PSB0cnVlO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrU2VydmljZXMgPSBBcnJheS5pc0FycmF5KGRldGFpbC5zZXJ2aWNlcylcblx0XHRcdD8gZGV0YWlsLnNlcnZpY2VzIDogW107XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC40LzQtdC90LjRgtGMINGC0LXQutGD0YnRg9GOINCx0LvQvtC60LjRgNC+0LLQutGDINC6INC/0L7Qu9GP0Lwg0YTQvtGA0LzRiyDQsdC10LcgZGlzYWJsZWQt0LDRgtGA0LjQsdGD0YLQvtCyOlxuXHQgKiB2YWx1ZXMg0LTQvtC70LbQvdGLINC/0YDQvtC00L7Qu9C20LDRgtGMINC+0YLQv9GA0LDQstC70Y/RgtGM0YHRjyDQv9GA0Lgg0YHQvtGF0YDQsNC90LXQvdC40Lgg0LTRgNGD0LPQuNGFINC90LDRgdGC0YDQvtC10LouXG5cdCAqL1xuXHRhcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKSB7XG5cdFx0Y29uc3QgbG9ja2VkID0gbW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCA9PT0gdHJ1ZTtcblx0XHRjb25zdCAkcmVtb3RlSW5wdXRzID0gbW9kdWxlQ1RJQ2xpZW50LmdldFJlbW90ZVByb3RlY3RlZElucHV0cygpO1xuXHRcdGNvbnN0ICRyZW1vdGVUb2dnbGVzID0gbW9kdWxlQ1RJQ2xpZW50LmdldFJlbW90ZVRvZ2dsZUlucHV0cygpO1xuXHRcdGNvbnN0ICRyZW1vdGVUZXN0QnV0dG9uID0gJCgnI2N0aS10ZXN0LXJlbW90ZS1jb25uJyk7XG5cblx0XHQkcmVtb3RlSW5wdXRzXG5cdFx0XHQucHJvcCgncmVhZG9ubHknLCBsb2NrZWQpXG5cdFx0XHQuYXR0cignYXJpYS1kaXNhYmxlZCcsIGxvY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpXG5cdFx0XHQuY2xvc2VzdCgnLmZpZWxkJylcblx0XHRcdC50b2dnbGVDbGFzcygnY3RpLXJlbW90ZS1maWVsZC1sb2NrZWQnLCBsb2NrZWQpO1xuXHRcdGlmIChsb2NrZWQpIHtcblx0XHRcdCRyZW1vdGVJbnB1dHMuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHJlbW90ZUlucHV0cy5yZW1vdmVBdHRyKCd0YWJpbmRleCcpO1xuXHRcdH1cblxuXHRcdCRyZW1vdGVUb2dnbGVzXG5cdFx0XHQuYXR0cignYXJpYS1kaXNhYmxlZCcsIGxvY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpXG5cdFx0XHQuY2xvc2VzdCgnLnVpLnNlZ21lbnQnKVxuXHRcdFx0LnRvZ2dsZUNsYXNzKCdjdGktcmVtb3RlLWZpZWxkLWxvY2tlZCcsIGxvY2tlZCk7XG5cdFx0aWYgKGxvY2tlZCkge1xuXHRcdFx0JHJlbW90ZVRvZ2dsZXMuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHJlbW90ZVRvZ2dsZXMucmVtb3ZlQXR0cigndGFiaW5kZXgnKTtcblx0XHR9XG5cblx0XHQkcmVtb3RlVGVzdEJ1dHRvblxuXHRcdFx0LnRvZ2dsZUNsYXNzKCdkaXNhYmxlZCcsIGxvY2tlZClcblx0XHRcdC5hdHRyKCdhcmlhLWRpc2FibGVkJywgbG9ja2VkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlVGV4dCA9IG1vZHVsZUNUSUNsaWVudC5mb3JtYXRSZW1vdGVNaWdyYXRpb25TZXJ2aWNlcyhcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBiYXNlVGV4dCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZU1pZ3JhdGlvbkxvY2tlZFxuXHRcdFx0XHR8fCAnTWVzc2VuZ2VyIG1pZ3JhdGlvbiBpcyBpbiBwcm9ncmVzcy4gUmVtb3RlIHNldHRpbmdzIGFyZSBsb2NrZWQgdW50aWwgaXQgZmluaXNoZXMuJztcblx0XHRcdGNvbnN0IHRleHQgPSBzZXJ2aWNlVGV4dCA9PT0gJycgPyBiYXNlVGV4dCA6IGAke2Jhc2VUZXh0fSAoJHtzZXJ2aWNlVGV4dH0pYDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2UuZmluZCgncCcpLnRleHQodGV4dCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJHJlbW90ZU1pZ3JhdGlvbkxvY2tNZXNzYWdlLnRvZ2dsZShsb2NrZWQpO1xuXHRcdH1cblx0fSxcblx0LyoqXG5cdCAqIEByZXR1cm5zIHtqUXVlcnl9XG5cdCAqL1xuXHRnZXRSZW1vdGVQcm90ZWN0ZWRJbnB1dHMoKSB7XG5cdFx0cmV0dXJuICQobW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVByb3RlY3RlZEZpZWxkSWRzLm1hcCgoaWQpID0+IGAjJHtpZH1gKS5qb2luKCcsJykpO1xuXHR9LFxuXHQvKipcblx0ICogQHJldHVybnMge2pRdWVyeX1cblx0ICovXG5cdGdldFJlbW90ZVRvZ2dsZUlucHV0cygpIHtcblx0XHRyZXR1cm4gJChtb2R1bGVDVElDbGllbnQucmVtb3RlVG9nZ2xlRmllbGRJZHMubWFwKChpZCkgPT4gYCMke2lkfWApLmpvaW4oJywnKSk7XG5cdH0sXG5cdC8qKlxuXHQgKiBAcGFyYW0ge3N0cmluZ1tdfSBzZXJ2aWNlc1xuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0Zm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMoc2VydmljZXMpIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc2VydmljZXMpIHx8IHNlcnZpY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VydmljZXMubWFwKChzZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSBtb2R1bGVDVElDbGllbnQucmVtb3RlU2VydmljZUxhYmVsS2V5c1tzZXJ2aWNlXTtcblx0XHRcdGlmIChrZXkgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlcnZpY2U7XG5cdFx0fSkuam9pbignLCAnKTtcblx0fSxcblx0LyoqXG5cdCAqIFByZXNlcnZlIGxvY2tlZCByZW1vdGUgdmFsdWVzIGluIFBPU1QgZGF0YSB3aGVuIHNhdmluZyB1bnJlbGF0ZWQgc2V0dGluZ3MuXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBmb3JtRGF0YVxuXHQgKiBAcmV0dXJucyB7T2JqZWN0fVxuXHQgKi9cblx0c3luY1JlbW90ZUZpZWxkc0JlZm9yZVN1Ym1pdChmb3JtRGF0YSkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja2VkICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZm9ybURhdGE7XG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVQcm90ZWN0ZWRGaWVsZElkcy5mb3JFYWNoKChpZCkgPT4ge1xuXHRcdFx0Zm9ybURhdGFbaWRdID0gJChgIyR7aWR9YCkudmFsKCkgfHwgJyc7XG5cdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVRvZ2dsZUZpZWxkSWRzLmZvckVhY2goKGlkKSA9PiB7XG5cdFx0XHRmb3JtRGF0YVtpZF0gPSAkKGAjJHtpZH1gKS5pcygnOmNoZWNrZWQnKSA/ICdvbicgOiAnJztcblx0XHR9KTtcblx0XHRyZXR1cm4gZm9ybURhdGE7XG5cdH0sXG5cdC8qKlxuXHQgKiDQmtC90L7Qv9C60LAgwqvQn9GA0L7QstC10YDQuNGC0Ywg0L/QvtC00LrQu9GO0YfQtdC90LjQtcK7INC90LAg0LLQutC70LDQtNC60LUg0KPQtNCw0LvRkdC90L3Ri9C1INC80LXRgdGB0LXQvdC00LbQtdGA0Ysg4oCUXG5cdCAqINCx0LXRgNGR0YIg0LfQvdCw0YfQtdC90LjRjyDRhNC+0YDQvNGLIChob3N0L3BvcnQvbG9naW4va2V5KSwgUE9TVNC40YIg0L3QsCDQsdC10LrQtdC90LQsXG5cdCAqINC/0L7QutCw0LfRi9Cy0LDQtdGCINGA0LXQt9GD0LvRjNGC0LDRgiBpbmxpbmUuINCh0L7RhdGA0LDQvdC10L3QuNC1INC90LUg0LTQtdC70LDQtdGCLlxuXHQgKi9cblx0aW5pdGlhbGl6ZVJlbW90ZUNvbm5lY3Rpb25UZXN0KCkge1xuXHRcdGNvbnN0ICRidG4gPSAkKCcjY3RpLXRlc3QtcmVtb3RlLWNvbm4nKTtcblx0XHRjb25zdCAkcmVzdWx0ID0gJCgnI2N0aS10ZXN0LXJlbW90ZS1jb25uLXJlc3VsdCcpO1xuXHRcdGlmICgkYnRuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJSZXN1bHQgPSAocHJvYmUsIGZhbGxiYWNrRXJyKSA9PiB7XG5cdFx0XHQkYnRuLnJlbW92ZUNsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuYXBwbHlSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdFx0XHRpZiAocHJvYmUgJiYgcHJvYmUub2sgPT09IHRydWUpIHtcblx0XHRcdFx0Y29uc3Qgb2tMYWJlbCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZVRlc3RPayB8fCAnQ29ubmVjdGlvbiBPSyc7XG5cdFx0XHRcdGNvbnN0IGFyY2ggPSBwcm9iZS5hcmNoID8gYCAke3Byb2JlLmFyY2h9YCA6ICcnO1xuXHRcdFx0XHRjb25zdCByd0xhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdFJ3T2sgfHwgJ3J3IE9LJztcblx0XHRcdFx0JHJlc3VsdC5jc3MoJ2NvbG9yJywgJyMyMWJhNDUnKS50ZXh0KGAke29rTGFiZWx9IOKAlCR7YXJjaH0sICR7cndMYWJlbH1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZmFpbExhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwgfHwgJ0Nvbm5lY3Rpb24gZmFpbGVkJztcblx0XHRcdGNvbnN0IGVyciA9IChwcm9iZSAmJiBwcm9iZS5lcnJvcikgPyBwcm9iZS5lcnJvciA6IChmYWxsYmFja0VyciB8fCAnJyk7XG5cdFx0XHQkcmVzdWx0LmNzcygnY29sb3InLCAnI2RiMjgyOCcpLnRleHQoZXJyID8gYCR7ZmFpbExhYmVsfTogJHtlcnJ9YCA6IGZhaWxMYWJlbCk7XG5cdFx0fTtcblxuXHRcdCRidG4ub2ZmKCdjbGljay5jdGlSZW1vdGVUZXN0Jykub24oJ2NsaWNrLmN0aVJlbW90ZVRlc3QnLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0JGJ0bi5hZGRDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0JHJlc3VsdC5yZW1vdmVDbGFzcygnZ3JlZW4gcmVkJylcblx0XHRcdFx0LmNzcygnY29sb3InLCAnIzY2NicpXG5cdFx0XHRcdC50ZXh0KGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZVRlc3RSdW5uaW5nIHx8ICdQcm9iaW5n4oCmJyk7XG5cdFx0XHQvLyBEb24ndCBzZW5kIHRoZSBtYXNrZWQgc2F2ZWQga2V5IGJhY2sgdG8gdGhlIHNlcnZlciDigJQgZW1wdHkga2V5XG5cdFx0XHQvLyB0ZWxscyB0aGUgYmFja2VuZCB0byBmYWxsIGJhY2sgdG8gdGhlIERCIHZhbHVlIHRyYW5zcGFyZW50bHkuXG5cdFx0XHRjb25zdCByYXdLZXkgPSAkKCcjcmVtb3RlX3NzaF9rZXknKS52YWwoKSB8fCAnJztcblx0XHRcdGNvbnN0IGtleUZvclBvc3QgPSByYXdLZXkuaW5kZXhPZignKioqKioqJykgIT09IC0xID8gJycgOiByYXdLZXk7XG5cdFx0XHQkLmFqYXgoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L3Rlc3RSZW1vdGVDb25uZWN0aW9uYCxcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdGRhdGFUeXBlOiAnanNvbicsXG5cdFx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRob3N0OiAkKCcjcmVtb3RlX2hvc3QnKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0XHRwb3J0OiAkKCcjcmVtb3RlX3NzaF9wb3J0JykudmFsKCkgfHwgJycsXG5cdFx0XHRcdFx0bG9naW46ICQoJyNyZW1vdGVfc3NoX2xvZ2luJykudmFsKCkgfHwgJycsXG5cdFx0XHRcdFx0a2V5OiBrZXlGb3JQb3N0LFxuXHRcdFx0XHRcdGJhc2U6ICQoJyNyZW1vdGVfYmluX2RpcicpLnZhbCgpIHx8ICcnLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3VjY2VzcyhyZXNwb25zZSkge1xuXHRcdFx0XHRcdC8vIFBCWEFwaVJlc3VsdDogeyByZXN1bHQsIGRhdGE6IHtvaywgYXJjaCwgZXJyb3J9LCBtZXNzYWdlcywgLi4uIH1cblx0XHRcdFx0XHRjb25zdCBwcm9iZSA9IChyZXNwb25zZSAmJiByZXNwb25zZS5kYXRhKSA/IHJlc3BvbnNlLmRhdGEgOiBudWxsO1xuXHRcdFx0XHRcdGNvbnN0IG1zZyA9IChyZXNwb25zZSAmJiBBcnJheS5pc0FycmF5KHJlc3BvbnNlLm1lc3NhZ2VzKSAmJiByZXNwb25zZS5tZXNzYWdlcy5sZW5ndGggPiAwKVxuXHRcdFx0XHRcdFx0PyByZXNwb25zZS5tZXNzYWdlcy5qb2luKCc7ICcpIDogJyc7XG5cdFx0XHRcdFx0cmVuZGVyUmVzdWx0KHByb2JlLCBtc2cpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcih4aHIpIHtcblx0XHRcdFx0XHQvLyBDb3JlIzExNjY6IG5ld2VyIGNvcmVzIHNlbmQgYSBmYWlsZWQgcHJvYmUgYXMgSFRUUCA0eHggd2l0aCB0aGUgc2FtZSBKU09OIGJvZHkuXG5cdFx0XHRcdFx0aWYgKHhoci5yZXNwb25zZUpTT04gJiYgdHlwZW9mIHhoci5yZXNwb25zZUpTT04gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnN1Y2Nlc3MoeGhyLnJlc3BvbnNlSlNPTik7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlbmRlclJlc3VsdChudWxsLCBgSFRUUCAke3hoci5zdGF0dXMgfHwgJ2Vycm9yJ31gKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICogUGhhc2UgQzog0L7Qv9C10YDQsNGC0L7RgNGB0LrQuNC5IGZhaWxiYWNrINCy0YvQvdC10YHQtdC90L3QvtCz0L4g0YHQtdGA0LLQuNGB0LAg0L7QsdGA0LDRgtC90L4g0L3QsCDQu9C+0LrQsNC70YwuXG5cdCAqINCa0L3QvtC/0LrQsCDQttC40LLRkdGCINCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0YLQvtGA0LDRjyDQv9C10YDQtdGA0LjRgdC+0LLRi9Cy0LDQtdGC0YHRjyDQvdCwINC60LDQttC00L7QvCDQvtC/0YDQvtGB0LUsXG5cdCAqINC/0L7RjdGC0L7QvNGDINGB0LvRg9GI0LDRgtC10LvRjCDQtNC10LvQtdCz0LjRgNC+0LLQsNC90L3Ri9C5ICjQvdCwIGRvY3VtZW50KS4g0JHRjdC60LXQvdC0INGB0L3QuNC80LDQtdGCINGC0YPQvNCx0LvQtdGAXG5cdCAqIChmZW5jZSkg0Lgg0L/QvtC00L3QuNC80LDQtdGCINC70L7QutCw0LvRjCDQuNC3INC70L7QutCw0LvRjNC90L7QuSDQutC+0L/QuNC4INGB0LXRgdGB0LjQuC5cblx0ICovXG5cdGluaXRpYWxpemVSZW1vdGVGYWlsYmFjaygpIHtcblx0XHQkKGRvY3VtZW50KS5vZmYoJ2NsaWNrLmN0aUZhaWxiYWNrJywgJy5jdGktZmFpbGJhY2stYnRuJylcblx0XHRcdC5vbignY2xpY2suY3RpRmFpbGJhY2snLCAnLmN0aS1mYWlsYmFjay1idG4nLCAoZSkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbnN0ICRidG4gPSAkKGUuY3VycmVudFRhcmdldCk7XG5cdFx0XHRcdGNvbnN0IHN2YyA9ICRidG4uYXR0cignZGF0YS1zdmMnKSB8fCAnJztcblx0XHRcdFx0aWYgKHN2YyA9PT0gJycgfHwgJGJ0bi5oYXNDbGFzcygnZGlzYWJsZWQnKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb25maXJtTXNnID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRmFpbGJhY2tDb25maXJtXG5cdFx0XHRcdFx0fHwgJ0JyaW5nIHRoaXMgc2VydmljZSBiYWNrIHRvIGxvY2FsIGZyb20gdGhlIGxhc3QgbG9jYWwgY29weT8gJ1xuXHRcdFx0XHRcdFx0KyAnVGhlIFZQUyB3aWxsIGJlIHR1cm5lZCBvZmYgZm9yIGl0Lic7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hbGVydFxuXHRcdFx0XHRpZiAoIXdpbmRvdy5jb25maXJtKGNvbmZpcm1Nc2cpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCRidG4uYWRkQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdFx0Y29uc3QgZmFpbExhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRmFpbGJhY2tGYWlsZWQgfHwgJ0ZhaWxiYWNrIGZhaWxlZCc7XG5cdFx0XHRcdCQuYWpheCh7XG5cdFx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9mYWlsYmFja2AsXG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHRkYXRhVHlwZTogJ2pzb24nLFxuXHRcdFx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHsgc2VydmljZTogc3ZjIH0pLFxuXHRcdFx0XHRcdHN1Y2Nlc3MocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9rID0gcmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSAmJiByZXNwb25zZS5kYXRhLm9rID09PSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKG9rKSB7XG5cdFx0XHRcdFx0XHRcdC8vIE1pcnJvciB0aGUgZmVuY2UgaW50byB0aGUgb3BlbiBzZXR0aW5ncyBmb3JtOiB0aGUgYmFja2VuZFxuXHRcdFx0XHRcdFx0XHQvLyBhbHJlYWR5IGNsZWFyZWQgdGhlIHJlbW90ZSB0b2dnbGUgaW4gdGhlIERCLCBidXQgYSBsYXRlclxuXHRcdFx0XHRcdFx0XHQvLyBzZXR0aW5ncyBzYXZlIHdvdWxkIHJlLXBvc3QgdGhlIHN0aWxsLWNoZWNrZWQgYm94IGFuZCB1bmRvXG5cdFx0XHRcdFx0XHRcdC8vIGl0IOKAlCBzbyB1bmNoZWNrIGl0IGhlcmUgdG9vLlxuXHRcdFx0XHRcdFx0XHRjb25zdCBmaWVsZE1hcCA9IHsgY2hhdHM6ICdyZW1vdGVfd2hhdHNhcHAnLCB0ZzogJ3JlbW90ZV90ZWxlZ3JhbScsIG1heDogJ3JlbW90ZV9tYXgnIH07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpZWxkID0gZmllbGRNYXBbc3ZjXTtcblx0XHRcdFx0XHRcdFx0aWYgKGZpZWxkKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgJGNiID0gJChgIyR7ZmllbGR9YCk7XG5cdFx0XHRcdFx0XHRcdFx0JGNiLnByb3AoJ2NoZWNrZWQnLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRcdFx0JGNiLmNsb3Nlc3QoJy51aS5jaGVja2JveCcpLmNoZWNrYm94KCdzZXQgdW5jaGVja2VkJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Ly8gTGVhdmUgdGhlIGJ1dHRvbiBidXN5OyB0aGUgc3RhdHVzIHdvcmtlciByZS1wb2xscyB3aXRoaW5cblx0XHRcdFx0XHRcdFx0Ly8gYSBmZXcgc2Vjb25kcywgdGhlIHNlcnZpY2UgZmxpcHMgdG8gbG9jYWwgYW5kIHRoZSByb3dcblx0XHRcdFx0XHRcdFx0Ly8gKHdpdGggaXRzIGJ1dHRvbikgZGlzYXBwZWFycyBvbiB0aGUgbmV4dCByZW5kZXIuXG5cdFx0XHRcdFx0XHRcdC8vIFNhZmV0eSBuZXQ6IGlmIHRoZSByZS1wb2xsIGhhc24ndCByZW1vdmVkIHRoZSByb3cgd2l0aGluXG5cdFx0XHRcdFx0XHRcdC8vIH4xNXMgKGJhY2tlbmQgZGlkbid0IGNvbnZlcmdlKSwgZHJvcCB0aGUgYnVzeSBzdGF0ZSBzbyB0aGVcblx0XHRcdFx0XHRcdFx0Ly8gb3BlcmF0b3IgY2FuIHJldHJ5IGluc3RlYWQgb2YgYSBwZXJtYW5lbnRseS1zcGlubmluZyBidXR0b24uXG5cdFx0XHRcdFx0XHRcdC8vIE5vLW9wIGlmIHRoZSByb3cgd2FzIGFscmVhZHkgcmVtb3ZlZCAoYnV0dG9uIGRldGFjaGVkKS5cblx0XHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0JGJ0bi5yZW1vdmVDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRcdFx0XHR9LCAxNTAwMCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCRidG4ucmVtb3ZlQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1zZyA9IChyZXNwb25zZSAmJiBBcnJheS5pc0FycmF5KHJlc3BvbnNlLm1lc3NhZ2VzKSAmJiByZXNwb25zZS5tZXNzYWdlcy5sZW5ndGggPiAwKVxuXHRcdFx0XHRcdFx0XHQ/IHJlc3BvbnNlLm1lc3NhZ2VzLmpvaW4oJzsgJykgOiAnJztcblx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hbGVydFxuXHRcdFx0XHRcdFx0d2luZG93LmFsZXJ0KG1zZyA/IGAke2ZhaWxMYWJlbH06ICR7bXNnfWAgOiBmYWlsTGFiZWwpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZXJyb3IoeGhyKSB7XG5cdFx0XHRcdFx0XHQvLyBDb3JlIzExNjY6IG5ld2VyIGNvcmVzIHNlbmQgYSByZWZ1c2VkIGZhaWxiYWNrIGFzIEhUVFAgNHh4IHdpdGggdGhlIHNhbWUgSlNPTiBib2R5LlxuXHRcdFx0XHRcdFx0aWYgKHhoci5yZXNwb25zZUpTT04gJiYgdHlwZW9mIHhoci5yZXNwb25zZUpTT04gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc3VjY2Vzcyh4aHIucmVzcG9uc2VKU09OKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0JGJ0bi5yZW1vdmVDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWFsZXJ0XG5cdFx0XHRcdFx0XHR3aW5kb3cuYWxlcnQoYCR7ZmFpbExhYmVsfTogSFRUUCAke3hoci5zdGF0dXMgfHwgJ2Vycm9yJ31gKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC+0LLQtdGA0LrQsCDRgdC+0YHRgtC+0Y/QvdC40Y8g0LzQvtC00YPQu9GPXG5cdCAqL1xuXHRjaGVja1N0YXR1c1RvZ2dsZSgpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JCgnLmRpc2FiaWxpdHknKS5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLnNob3coKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5pbml0aWFsaXplKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdCQoJy5kaXNhYmlsaXR5JykuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICog0J/QtdGA0LXQutC70Y7Rh9Cw0YLQtdC70Ywg0YPRgdGC0LDQvdC+0LLQutC4IENhbGxlcklEINC40LcgMdChXG5cdCAqINCf0YDRj9GH0LXRgiDQuNC70Lgg0L/QvtC60LDQt9GL0LLQsNC10YIg0YHRgtCw0YLRg9GBINGC0YDQsNC90YHQu9C40YLQtdGA0LDRhtC40Lhcblx0ICovXG5cdHNldENhbGxlcklkVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkU2V0dXBUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrLmhpZGUoKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQktGL0LHQvtGAIENSTTog0YHQutGA0YvRgtGML9C/0L7QutCw0LfQsNGC0Ywg0LHQu9C+0Log0L3QsNGB0YLRgNC+0LXQuiAx0KFcblx0ICovXG5cdGlzQ3JtMWNTZWxlY3RlZCgpIHtcblx0XHRyZXR1cm4gJCgnI2NybV90eXBlXzFjJykucHJvcCgnY2hlY2tlZCcpID09PSB0cnVlO1xuXHR9LFxuXHRjcm1UeXBlVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuaXNDcm0xY1NlbGVjdGVkKCkpIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kY3JtU2V0dGluZ3NCbG9jay5zaG93KCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNybUhpZGRlblRhYnMuc2hvdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNybVNldHRpbmdzQmxvY2suaGlkZSgpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjcm1IaWRkZW5UYWJzLmhpZGUoKTtcblx0XHRcdC8vINCd0LUg0L7RgdGC0LDQstC70Y/QtdC8INCw0LrRgtC40LLQvdC+0Lkg0YHQutGA0YvRgtGD0Y4g0LLQutC70LDQtNC60YMg0LzQtdGB0YHQtdC90LTQttC10YDQvtCyLlxuXHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kY3JtSGlkZGVuVGFicy5oYXNDbGFzcygnYWN0aXZlJykpIHtcblx0XHRcdFx0JCgnI21vZHVsZS1jdGktY2xpZW50LXRhYnMgLml0ZW0nKS50YWIoJ2NoYW5nZSB0YWInLCAnc2V0dGluZ3MnKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQktC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINGA0LDQsdC+0YLRiyDRh9C10YDQtdC3IFdTXG5cdCAqL1xuXHRlbmFibGVXc0ZpZWxkcygpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuJHdzT25seUZpZWxkcy5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0fSxcblx0LyoqXG5cdCAqINCS0YvQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDRgNCw0LHQvtGC0Ysg0YfQtdGA0LXQtyBXU1xuXHQgKi9cblx0ZGlzYWJsZVdzRmllbGRzKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kd3NPbmx5RmllbGRzLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC4INC40LfQvNC10L3QtdC90LjQuCBTU0wg0YDQtdC20LjQvNCwXG5cdCAqIEBwYXJhbSB2YWx1ZVxuXHQgKiBAcGFyYW0gdGV4dFxuXHQgKiBAcGFyYW0gJGNob2ljZVxuXHQgKi9cblx0Y2JTc2xNb2RlT25DaGFuZ2UodmFsdWUsIHRleHQsICRjaG9pY2Upe1xuXHRcdGNvbnN0IHBvcnQgPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnZ2V0IHZhbHVlJywnc2VydmVyMWNwb3J0Jyk7XG5cdFx0aWYgKHZhbHVlPT09J2h0dHAnICYmIHBvcnQ9PT0nNDQzJyl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnc2V0IHZhbHVlJywnc2VydmVyMWNwb3J0JywgODApO1xuXHRcdH1cblx0XHRpZiAodmFsdWU9PT0naHR0cHMnICYmIHBvcnQ9PT0nODAnKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdzZXQgdmFsdWUnLCdzZXJ2ZXIxY3BvcnQnLCA0NDMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSxcblx0Y2JCZWZvcmVTZW5kRm9ybShzZXR0aW5ncykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNldHRpbmdzO1xuXHRcdHJlc3VsdC5kYXRhID0gbW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqLmZvcm0oJ2dldCB2YWx1ZXMnKTtcblx0XHRyZXN1bHQuZGF0YSA9IG1vZHVsZUNUSUNsaWVudC5zeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0KHJlc3VsdC5kYXRhKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9LFxuXHRjYkFmdGVyU2VuZEZvcm0oKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemUoKTtcblx0fSxcblx0aW5pdGlhbGl6ZUZvcm0oKSB7XG5cdFx0Rm9ybS4kZm9ybU9iaiA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iajtcblx0XHRGb3JtLnVybCA9IGAke2dsb2JhbFJvb3RVcmx9bW9kdWxlLWMtdC1pLWNsaWVudC9zYXZlYDtcblx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSBtb2R1bGVDVElDbGllbnQudmFsaWRhdGVSdWxlcztcblx0XHRGb3JtLmNiQmVmb3JlU2VuZEZvcm0gPSBtb2R1bGVDVElDbGllbnQuY2JCZWZvcmVTZW5kRm9ybTtcblx0XHRGb3JtLmNiQWZ0ZXJTZW5kRm9ybSA9IG1vZHVsZUNUSUNsaWVudC5jYkFmdGVyU2VuZEZvcm07XG5cdFx0Rm9ybS5pbml0aWFsaXplKCk7XG5cdH0sXG59O1xuXG5cbiQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy5lbXB0eUN1c3RvbVJ1bGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcblx0aWYgKCFtb2R1bGVDVElDbGllbnQuaXNDcm0xY1NlbGVjdGVkKCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpXG5cdFx0JiYgbW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpXG5cdFx0JiYgdmFsdWUgPT09ICcnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufTtcblxuJC5mbi5mb3JtLnNldHRpbmdzLnJ1bGVzLndyb25nUG9ydEN1c3RvbVJ1bGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcblx0aWYgKCFtb2R1bGVDVElDbGllbnQuaXNDcm0xY1NlbGVjdGVkKCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpXG5cdFx0JiYgbW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpXG5cdCkge1xuXHRcdHJldHVybiAkLmZuLmZvcm0uc2V0dGluZ3MucnVsZXMuaW50ZWdlcih2YWx1ZSwgJzEuLjY1NTM1Jyk7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59O1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG5cdG1vZHVsZUNUSUNsaWVudC5pbml0aWFsaXplKCk7XG59KTtcbiJdfQ==