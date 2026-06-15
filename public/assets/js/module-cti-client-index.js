"use strict";

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
            // Leave the button busy; the status worker re-polls within
            // a few seconds, the service flips to local and the row
            // (with its button) disappears on the next render.
            return;
          }

          $btn.removeClass('loading disabled');
          var msg = response && Array.isArray(response.messages) && response.messages.length > 0 ? response.messages.join('; ') : ''; // eslint-disable-next-line no-alert

          window.alert(msg ? "".concat(failLabel, ": ").concat(msg) : failLabel);
        },
        error: function error(xhr) {
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
  if (moduleCTIClient.$autoSettingsToggle.checkbox('is unchecked') && moduleCTIClient.$wsToggle.checkbox('is checked') && value === '') {
    return false;
  }

  return true;
};

$.fn.form.settings.rules.wrongPortCustomRule = function (value) {
  if (moduleCTIClient.$autoSettingsToggle.checkbox('is unchecked') && moduleCTIClient.$wsToggle.checkbox('is checked')) {
    return $.fn.form.settings.rules.integer(value, '1..65535');
  }

  return true;
};

$(document).ready(function () {
  moduleCTIClient.initialize();
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnQiLCIkd3NUb2dnbGUiLCIkIiwiJHdzVG9nZ2xlUmFkaW8iLCIkc3RhdHVzVG9nZ2xlIiwiJGNhbGxlcklkU2V0dXBUb2dnbGUiLCIkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jayIsIiRmb3JtT2JqIiwiJG1vZHVsZVN0YXR1cyIsIiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRhdXRvU2V0dGluZ3NUb2dnbGUiLCIkb25seUF1dG9TZXR0aW5nc1Zpc2libGUiLCIkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZSIsIiR3c09ubHlGaWVsZHMiLCIkZGlycnR5RmllbGQiLCIkc3NsTW9kZVNlbGVjdCIsIiRkZWJ1Z1RhYiIsInJlbW90ZU1pZ3JhdGlvbkxvY2tlZCIsInJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyIsInJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kIiwicmVtb3RlUHJvdGVjdGVkRmllbGRJZHMiLCJyZW1vdGVUb2dnbGVGaWVsZElkcyIsInJlbW90ZVNlcnZpY2VMYWJlbEtleXMiLCJjaGF0cyIsInRnIiwibWF4IiwidmFsaWRhdGVSdWxlcyIsInNlcnZlcjFjaG9zdCIsImlkZW50aWZpZXIiLCJydWxlcyIsInR5cGUiLCJwcm9tcHQiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHkiLCJzZXJ2ZXIxY3BvcnQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UiLCJkYXRhYmFzZSIsIm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lIiwiaW5pdGlhbGl6ZSIsInRhYiIsImNoZWNrYm94IiwiaGlkZSIsIm9uQ2hlY2tlZCIsInNob3ciLCJvblVuY2hlY2tlZCIsIm9uQ2hhbmdlIiwic2V0Q2FsbGVySWRUb2dnbGUiLCJ2YWwiLCJNYXRoIiwicmFuZG9tIiwidHJpZ2dlciIsIkZvcm0iLCJlbmFibGVXc0ZpZWxkcyIsImRpc2FibGVXc0ZpZWxkcyIsImRyb3Bkb3duIiwiY2JTc2xNb2RlT25DaGFuZ2UiLCJpbml0aWFsaXplRm9ybSIsImNoZWNrU3RhdHVzVG9nZ2xlIiwiaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QiLCJpbml0aWFsaXplUmVtb3RlRmFpbGJhY2siLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwic2V0UmVtb3RlTWlncmF0aW9uTG9jayIsImFwcGx5UmVtb3RlTWlncmF0aW9uTG9jayIsImV2ZW50IiwiZGV0YWlsIiwiYWN0aXZlIiwiQXJyYXkiLCJpc0FycmF5Iiwic2VydmljZXMiLCJsb2NrZWQiLCIkcmVtb3RlSW5wdXRzIiwiZ2V0UmVtb3RlUHJvdGVjdGVkSW5wdXRzIiwiJHJlbW90ZVRvZ2dsZXMiLCJnZXRSZW1vdGVUb2dnbGVJbnB1dHMiLCIkcmVtb3RlVGVzdEJ1dHRvbiIsInByb3AiLCJhdHRyIiwiY2xvc2VzdCIsInRvZ2dsZUNsYXNzIiwicmVtb3ZlQXR0ciIsImxlbmd0aCIsInNlcnZpY2VUZXh0IiwiZm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMiLCJiYXNlVGV4dCIsIm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkIiwidGV4dCIsImZpbmQiLCJ0b2dnbGUiLCJtYXAiLCJpZCIsImpvaW4iLCJzZXJ2aWNlIiwia2V5Iiwic3luY1JlbW90ZUZpZWxkc0JlZm9yZVN1Ym1pdCIsImZvcm1EYXRhIiwiZm9yRWFjaCIsImlzIiwiJGJ0biIsIiRyZXN1bHQiLCJyZW5kZXJSZXN1bHQiLCJwcm9iZSIsImZhbGxiYWNrRXJyIiwicmVtb3ZlQ2xhc3MiLCJvayIsIm9rTGFiZWwiLCJtb2RfY3RpX1JlbW90ZVRlc3RPayIsImFyY2giLCJyd0xhYmVsIiwibW9kX2N0aV9SZW1vdGVUZXN0UndPayIsImNzcyIsImZhaWxMYWJlbCIsIm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwiLCJlcnIiLCJlcnJvciIsIm9mZiIsIm9uIiwiZSIsInByZXZlbnREZWZhdWx0IiwiYWRkQ2xhc3MiLCJtb2RfY3RpX1JlbW90ZVRlc3RSdW5uaW5nIiwicmF3S2V5Iiwia2V5Rm9yUG9zdCIsImluZGV4T2YiLCJhamF4IiwidXJsIiwiQ29uZmlnIiwicGJ4VXJsIiwibWV0aG9kIiwiY29udGVudFR5cGUiLCJkYXRhVHlwZSIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiaG9zdCIsInBvcnQiLCJsb2dpbiIsImJhc2UiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJtc2ciLCJtZXNzYWdlcyIsInhociIsInN0YXR1cyIsImRvY3VtZW50IiwiY3VycmVudFRhcmdldCIsInN2YyIsImhhc0NsYXNzIiwiY29uZmlybU1zZyIsIm1vZF9jdGlfRmFpbGJhY2tDb25maXJtIiwiY29uZmlybSIsIm1vZF9jdGlfRmFpbGJhY2tGYWlsZWQiLCJhbGVydCIsIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsInJlbW92ZSIsInZhbHVlIiwiJGNob2ljZSIsImZvcm0iLCJjYkJlZm9yZVNlbmRGb3JtIiwic2V0dGluZ3MiLCJyZXN1bHQiLCJjYkFmdGVyU2VuZEZvcm0iLCJnbG9iYWxSb290VXJsIiwiZm4iLCJlbXB0eUN1c3RvbVJ1bGUiLCJ3cm9uZ1BvcnRDdXN0b21SdWxlIiwiaW50ZWdlciIsInJlYWR5Il0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUEsSUFBTUEsZUFBZSxHQUFHO0FBQ3ZCQyxFQUFBQSxTQUFTLEVBQUVDLENBQUMsQ0FBQywwQkFBRCxDQURXO0FBRXZCQyxFQUFBQSxjQUFjLEVBQUVELENBQUMsQ0FBQyw0Q0FBRCxDQUZNO0FBR3ZCRSxFQUFBQSxhQUFhLEVBQUVGLENBQUMsQ0FBQyx1QkFBRCxDQUhPO0FBSXZCRyxFQUFBQSxvQkFBb0IsRUFBRUgsQ0FBQyxDQUFD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QyxDQURBLElBRUFvSCxLQUFLLEtBQUssRUFGZCxFQUVrQjtBQUNqQixXQUFPLEtBQVA7QUFDQTs7QUFDRCxTQUFPLElBQVA7QUFDQSxDQVBEOztBQVNBM0osQ0FBQyxDQUFDbUssRUFBRixDQUFLTixJQUFMLENBQVVFLFFBQVYsQ0FBbUJuSSxLQUFuQixDQUF5QnlJLG1CQUF6QixHQUErQyxVQUFVVixLQUFWLEVBQWlCO0FBQy9ELE1BQUk3SixlQUFlLENBQUNXLG1CQUFoQixDQUFvQzhCLFFBQXBDLENBQTZDLGNBQTdDLEtBQ0F6QyxlQUFlLENBQUNDLFNBQWhCLENBQTBCd0MsUUFBMUIsQ0FBbUMsWUFBbkMsQ0FESixFQUVFO0FBQ0QsV0FBT3ZDLENBQUMsQ0FBQ21LLEVBQUYsQ0FBS04sSUFBTCxDQUFVRSxRQUFWLENBQW1CbkksS0FBbkIsQ0FBeUIwSSxPQUF6QixDQUFpQ1gsS0FBakMsRUFBd0MsVUFBeEMsQ0FBUDtBQUNBOztBQUNELFNBQU8sSUFBUDtBQUNBLENBUEQ7O0FBU0EzSixDQUFDLENBQUNnSixRQUFELENBQUQsQ0FBWXVCLEtBQVosQ0FBa0IsWUFBTTtBQUN2QnpLLEVBQUFBLGVBQWUsQ0FBQ3VDLFVBQWhCO0FBQ0EsQ0FGRCIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIE1JS08gTExDIC0gQWxsIFJpZ2h0cyBSZXNlcnZlZFxuICogVW5hdXRob3JpemVkIGNvcHlpbmcgb2YgdGhpcyBmaWxlLCB2aWEgYW55IG1lZGl1bSBpcyBzdHJpY3RseSBwcm9oaWJpdGVkXG4gKiBQcm9wcmlldGFyeSBhbmQgY29uZmlkZW50aWFsXG4gKiBXcml0dGVuIGJ5IE5pa29sYXkgQmVrZXRvdiwgMTEgMjAxOFxuICpcbiAqL1xuXG5jb25zdCBtb2R1bGVDVElDbGllbnQgPSB7XG5cdCR3c1RvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCR3c1RvZ2dsZVJhZGlvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAud2ViLXNlcnZpY2UtcmFkaW8nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCRjYWxsZXJJZFNldHVwVG9nZ2xlOiAkKCcjc2V0dXAtY2FsbGVyLWlkLXRvZ2dsZScpLFxuXHQkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jazogJCgnI3RyYW5zbGl0ZXJhdGUtY2FsbGVyLWlkLXRvZ2dsZS1ibG9jaycpLFxuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI2N0aS1zdGF0dXMtc3VtbWFyeScpLFxuXHQkcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2U6ICQoJyNjdGktcmVtb3RlLW1pZ3JhdGlvbi1sb2NrLW1lc3NhZ2UnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JGF1dG9TZXR0aW5nc1RvZ2dsZTogJCgnI2F1dG8tc2V0dGluZ3MtbW9kZS10b2dnbGUnKSxcblx0JG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAub25seS1hdXRvLXNldHRpbmdzJyksXG5cdCRvbmx5TWFudWFsU2V0dGluZ3NWaXNpYmxlOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAub25seS1tYW51YWwtc2V0dGluZ3MnKSxcblx0JHdzT25seUZpZWxkczogJCgnLndzLW9ubHknKSxcblx0JGRpcnJ0eUZpZWxkOiAkKCcjZGlycnR5JyksXG5cdCRzc2xNb2RlU2VsZWN0OiAkKCcuc2VydmVyMWNfc2NoZW1lIHNlbGVjdCcpLFxuXHQkZGVidWdUYWI6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC10YWJzIC5pdGVtW2RhdGEtdGFiPVwiZGVidWdcIl0nKSxcblx0cmVtb3RlTWlncmF0aW9uTG9ja2VkOiBmYWxzZSxcblx0cmVtb3RlTWlncmF0aW9uTG9ja1NlcnZpY2VzOiBbXSxcblx0cmVtb3RlTWlncmF0aW9uTG9ja0xpc3RlbmVyQm91bmQ6IGZhbHNlLFxuXHRyZW1vdGVQcm90ZWN0ZWRGaWVsZElkczogW1xuXHRcdCdyZW1vdGVfaG9zdCcsXG5cdFx0J3JlbW90ZV9zc2hfcG9ydCcsXG5cdFx0J3JlbW90ZV9zc2hfbG9naW4nLFxuXHRcdCdyZW1vdGVfc3NoX2tleScsXG5cdFx0J3JlbW90ZV9iaW5fZGlyJyxcblx0XSxcblx0cmVtb3RlVG9nZ2xlRmllbGRJZHM6IFsncmVtb3RlX3doYXRzYXBwJywgJ3JlbW90ZV90ZWxlZ3JhbScsICdyZW1vdGVfbWF4J10sXG5cdHJlbW90ZVNlcnZpY2VMYWJlbEtleXM6IHtcblx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHR0ZzogJ21vZF9jdGlfc3ZjX3RnJyxcblx0XHRtYXg6ICdtb2RfY3RpX3N2Y19tYXgnLFxuXHR9LFxuXHR2YWxpZGF0ZVJ1bGVzOiB7XG5cdFx0c2VydmVyMWNob3N0OiB7XG5cdFx0XHRpZGVudGlmaWVyOiAnc2VydmVyMWNob3N0Jyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnZW1wdHlDdXN0b21SdWxlJyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHksXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0c2VydmVyMWNwb3J0OiB7XG5cdFx0XHRpZGVudGlmaWVyOiAnc2VydmVyMWNwb3J0Jyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnd3JvbmdQb3J0Q3VzdG9tUnVsZScsXG5cdFx0XHRcdFx0cHJvbXB0OiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDUG9ydFJhbmdlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdGRhdGFiYXNlOiB7XG5cdFx0XHRpZGVudGlmaWVyOiAnZGF0YWJhc2UnLFxuXHRcdFx0cnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdlbXB0eUN1c3RvbVJ1bGUnLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHR9LFxuXHRpbml0aWFsaXplKCkge1xuXHRcdCQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5pdGVtJykudGFiKCk7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUYWIuaGlkZSgpXG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLnNob3coKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblVuY2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLmhpZGUoKVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdG1vZHVsZUNUSUNsaWVudC4kY2FsbGVySWRTZXR1cFRvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGFuZ2U6IG1vZHVsZUNUSUNsaWVudC5zZXRDYWxsZXJJZFRvZ2dsZVxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuc2hvdygpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSB7fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25VbmNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLmhpZGUoKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuc2hvdygpO1xuXHRcdFx0XHRcdEZvcm0udmFsaWRhdGVSdWxlcyA9IG1vZHVsZUNUSUNsaWVudC52YWxpZGF0ZVJ1bGVzO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlUmFkaW9cblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRpcnJ0eUZpZWxkLnZhbChNYXRoLnJhbmRvbSgpKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRpcnJ0eUZpZWxkLnRyaWdnZXIoJ2NoYW5nZScpO1xuXHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZGlzYWJsZVdzRmllbGRzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRzc2xNb2RlU2VsZWN0LmRyb3Bkb3duKHtcblx0XHRcdG9uQ2hhbmdlOiBtb2R1bGVDVElDbGllbnQuY2JTc2xNb2RlT25DaGFuZ2Vcblx0XHR9KTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZUZvcm0oKTtcblx0XHRtb2R1bGVDVElDbGllbnQuY2hlY2tTdGF0dXNUb2dnbGUoKTtcblx0XHRtb2R1bGVDVElDbGllbnQuc2V0Q2FsbGVySWRUb2dnbGUoKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZVJlbW90ZUNvbm5lY3Rpb25UZXN0KCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVSZW1vdGVGYWlsYmFjaygpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdNb2R1bGVTdGF0dXNDaGFuZ2VkJywgbW9kdWxlQ1RJQ2xpZW50LmNoZWNrU3RhdHVzVG9nZ2xlKTtcblx0fSxcblx0LyoqXG5cdCAqINCf0L7QtNC/0LjRgdC60LAg0L3QsCDRgdGC0LDRgtGD0YEg0LDQutGC0LjQstC90L7QuSDQvNC40LPRgNCw0YbQuNC4INC80LXRgdGB0LXQvdC00LbQtdGA0L7Qsi5cblx0ICovXG5cdGluaXRpYWxpemVSZW1vdGVNaWdyYXRpb25Mb2NrKCkge1xuXHRcdGlmICghbW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kKSB7XG5cdFx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcblx0XHRcdFx0J1JlbW90ZU1pZ3JhdGlvbkxvY2tDaGFuZ2VkJyxcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LnNldFJlbW90ZU1pZ3JhdGlvbkxvY2ssXG5cdFx0XHQpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kID0gdHJ1ZTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpO1xuXHR9LFxuXHQvKipcblx0ICog0J7QsdC90L7QstC40YLRjCDRgdC+0YHRgtC+0Y/QvdC40LUg0LHQu9C+0LrQuNGA0L7QstC60LggcmVtb3RlL1ZQUyDQv9C+0LvQtdC5LlxuXHQgKiBAcGFyYW0ge0N1c3RvbUV2ZW50fSBldmVudFxuXHQgKi9cblx0c2V0UmVtb3RlTWlncmF0aW9uTG9jayhldmVudCkge1xuXHRcdGNvbnN0IGRldGFpbCA9IChldmVudCAmJiBldmVudC5kZXRhaWwpID8gZXZlbnQuZGV0YWlsIDoge307XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCA9IGRldGFpbC5hY3RpdmUgPT09IHRydWU7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyA9IEFycmF5LmlzQXJyYXkoZGV0YWlsLnNlcnZpY2VzKVxuXHRcdFx0PyBkZXRhaWwuc2VydmljZXMgOiBbXTtcblx0XHRtb2R1bGVDVElDbGllbnQuYXBwbHlSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9GA0LjQvNC10L3QuNGC0Ywg0YLQtdC60YPRidGD0Y4g0LHQu9C+0LrQuNGA0L7QstC60YMg0Log0L/QvtC70Y/QvCDRhNC+0YDQvNGLINCx0LXQtyBkaXNhYmxlZC3QsNGC0YDQuNCx0YPRgtC+0LI6XG5cdCAqIHZhbHVlcyDQtNC+0LvQttC90Ysg0L/RgNC+0LTQvtC70LbQsNGC0Ywg0L7RgtC/0YDQsNCy0LvRj9GC0YzRgdGPINC/0YDQuCDRgdC+0YXRgNCw0L3QtdC90LjQuCDQtNGA0YPQs9C40YUg0L3QsNGB0YLRgNC+0LXQui5cblx0ICovXG5cdGFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpIHtcblx0XHRjb25zdCBsb2NrZWQgPSBtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja2VkID09PSB0cnVlO1xuXHRcdGNvbnN0ICRyZW1vdGVJbnB1dHMgPSBtb2R1bGVDVElDbGllbnQuZ2V0UmVtb3RlUHJvdGVjdGVkSW5wdXRzKCk7XG5cdFx0Y29uc3QgJHJlbW90ZVRvZ2dsZXMgPSBtb2R1bGVDVElDbGllbnQuZ2V0UmVtb3RlVG9nZ2xlSW5wdXRzKCk7XG5cdFx0Y29uc3QgJHJlbW90ZVRlc3RCdXR0b24gPSAkKCcjY3RpLXRlc3QtcmVtb3RlLWNvbm4nKTtcblxuXHRcdCRyZW1vdGVJbnB1dHNcblx0XHRcdC5wcm9wKCdyZWFkb25seScsIGxvY2tlZClcblx0XHRcdC5hdHRyKCdhcmlhLWRpc2FibGVkJywgbG9ja2VkID8gJ3RydWUnIDogJ2ZhbHNlJylcblx0XHRcdC5jbG9zZXN0KCcuZmllbGQnKVxuXHRcdFx0LnRvZ2dsZUNsYXNzKCdjdGktcmVtb3RlLWZpZWxkLWxvY2tlZCcsIGxvY2tlZCk7XG5cdFx0aWYgKGxvY2tlZCkge1xuXHRcdFx0JHJlbW90ZUlucHV0cy5hdHRyKCd0YWJpbmRleCcsICctMScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQkcmVtb3RlSW5wdXRzLnJlbW92ZUF0dHIoJ3RhYmluZGV4Jyk7XG5cdFx0fVxuXG5cdFx0JHJlbW90ZVRvZ2dsZXNcblx0XHRcdC5hdHRyKCdhcmlhLWRpc2FibGVkJywgbG9ja2VkID8gJ3RydWUnIDogJ2ZhbHNlJylcblx0XHRcdC5jbG9zZXN0KCcudWkuc2VnbWVudCcpXG5cdFx0XHQudG9nZ2xlQ2xhc3MoJ2N0aS1yZW1vdGUtZmllbGQtbG9ja2VkJywgbG9ja2VkKTtcblx0XHRpZiAobG9ja2VkKSB7XG5cdFx0XHQkcmVtb3RlVG9nZ2xlcy5hdHRyKCd0YWJpbmRleCcsICctMScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQkcmVtb3RlVG9nZ2xlcy5yZW1vdmVBdHRyKCd0YWJpbmRleCcpO1xuXHRcdH1cblxuXHRcdCRyZW1vdGVUZXN0QnV0dG9uXG5cdFx0XHQudG9nZ2xlQ2xhc3MoJ2Rpc2FibGVkJywgbG9ja2VkKVxuXHRcdFx0LmF0dHIoJ2FyaWEtZGlzYWJsZWQnLCBsb2NrZWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHJlbW90ZU1pZ3JhdGlvbkxvY2tNZXNzYWdlLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlcnZpY2VUZXh0ID0gbW9kdWxlQ1RJQ2xpZW50LmZvcm1hdFJlbW90ZU1pZ3JhdGlvblNlcnZpY2VzKFxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja1NlcnZpY2VzLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGJhc2VUZXh0ID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkXG5cdFx0XHRcdHx8ICdNZXNzZW5nZXIgbWlncmF0aW9uIGlzIGluIHByb2dyZXNzLiBSZW1vdGUgc2V0dGluZ3MgYXJlIGxvY2tlZCB1bnRpbCBpdCBmaW5pc2hlcy4nO1xuXHRcdFx0Y29uc3QgdGV4dCA9IHNlcnZpY2VUZXh0ID09PSAnJyA/IGJhc2VUZXh0IDogYCR7YmFzZVRleHR9ICgke3NlcnZpY2VUZXh0fSlgO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZS5maW5kKCdwJykudGV4dCh0ZXh0KTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2UudG9nZ2xlKGxvY2tlZCk7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICogQHJldHVybnMge2pRdWVyeX1cblx0ICovXG5cdGdldFJlbW90ZVByb3RlY3RlZElucHV0cygpIHtcblx0XHRyZXR1cm4gJChtb2R1bGVDVElDbGllbnQucmVtb3RlUHJvdGVjdGVkRmllbGRJZHMubWFwKChpZCkgPT4gYCMke2lkfWApLmpvaW4oJywnKSk7XG5cdH0sXG5cdC8qKlxuXHQgKiBAcmV0dXJucyB7alF1ZXJ5fVxuXHQgKi9cblx0Z2V0UmVtb3RlVG9nZ2xlSW5wdXRzKCkge1xuXHRcdHJldHVybiAkKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVUb2dnbGVGaWVsZElkcy5tYXAoKGlkKSA9PiBgIyR7aWR9YCkuam9pbignLCcpKTtcblx0fSxcblx0LyoqXG5cdCAqIEBwYXJhbSB7c3RyaW5nW119IHNlcnZpY2VzXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRmb3JtYXRSZW1vdGVNaWdyYXRpb25TZXJ2aWNlcyhzZXJ2aWNlcykge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShzZXJ2aWNlcykgfHwgc2VydmljZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBzZXJ2aWNlcy5tYXAoKHNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IG1vZHVsZUNUSUNsaWVudC5yZW1vdGVTZXJ2aWNlTGFiZWxLZXlzW3NlcnZpY2VdO1xuXHRcdFx0aWYgKGtleSAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2VydmljZTtcblx0XHR9KS5qb2luKCcsICcpO1xuXHR9LFxuXHQvKipcblx0ICogUHJlc2VydmUgbG9ja2VkIHJlbW90ZSB2YWx1ZXMgaW4gUE9TVCBkYXRhIHdoZW4gc2F2aW5nIHVucmVsYXRlZCBzZXR0aW5ncy5cblx0ICogQHBhcmFtIHtPYmplY3R9IGZvcm1EYXRhXG5cdCAqIEByZXR1cm5zIHtPYmplY3R9XG5cdCAqL1xuXHRzeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0KGZvcm1EYXRhKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiBmb3JtRGF0YTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVByb3RlY3RlZEZpZWxkSWRzLmZvckVhY2goKGlkKSA9PiB7XG5cdFx0XHRmb3JtRGF0YVtpZF0gPSAkKGAjJHtpZH1gKS52YWwoKSB8fCAnJztcblx0XHR9KTtcblx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlVG9nZ2xlRmllbGRJZHMuZm9yRWFjaCgoaWQpID0+IHtcblx0XHRcdGZvcm1EYXRhW2lkXSA9ICQoYCMke2lkfWApLmlzKCc6Y2hlY2tlZCcpID8gJ29uJyA6ICcnO1xuXHRcdH0pO1xuXHRcdHJldHVybiBmb3JtRGF0YTtcblx0fSxcblx0LyoqXG5cdCAqINCa0L3QvtC/0LrQsCDCq9Cf0YDQvtCy0LXRgNC40YLRjCDQv9C+0LTQutC70Y7Rh9C10L3QuNC1wrsg0L3QsCDQstC60LvQsNC00LrQtSDQo9C00LDQu9GR0L3QvdGL0LUg0LzQtdGB0YHQtdC90LTQttC10YDRiyDigJRcblx0ICog0LHQtdGA0ZHRgiDQt9C90LDRh9C10L3QuNGPINGE0L7RgNC80YsgKGhvc3QvcG9ydC9sb2dpbi9rZXkpLCBQT1NU0LjRgiDQvdCwINCx0LXQutC10L3QtCxcblx0ICog0L/QvtC60LDQt9GL0LLQsNC10YIg0YDQtdC30YPQu9GM0YLQsNGCIGlubGluZS4g0KHQvtGF0YDQsNC90LXQvdC40LUg0L3QtSDQtNC10LvQsNC10YIuXG5cdCAqL1xuXHRpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QoKSB7XG5cdFx0Y29uc3QgJGJ0biA9ICQoJyNjdGktdGVzdC1yZW1vdGUtY29ubicpO1xuXHRcdGNvbnN0ICRyZXN1bHQgPSAkKCcjY3RpLXRlc3QtcmVtb3RlLWNvbm4tcmVzdWx0Jyk7XG5cdFx0aWYgKCRidG4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlclJlc3VsdCA9IChwcm9iZSwgZmFsbGJhY2tFcnIpID0+IHtcblx0XHRcdCRidG4ucmVtb3ZlQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5hcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0XHRcdGlmIChwcm9iZSAmJiBwcm9iZS5vayA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRjb25zdCBva0xhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdE9rIHx8ICdDb25uZWN0aW9uIE9LJztcblx0XHRcdFx0Y29uc3QgYXJjaCA9IHByb2JlLmFyY2ggPyBgICR7cHJvYmUuYXJjaH1gIDogJyc7XG5cdFx0XHRcdGNvbnN0IHJ3TGFiZWwgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVUZXN0UndPayB8fCAncncgT0snO1xuXHRcdFx0XHQkcmVzdWx0LmNzcygnY29sb3InLCAnIzIxYmE0NScpLnRleHQoYCR7b2tMYWJlbH0g4oCUJHthcmNofSwgJHtyd0xhYmVsfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmYWlsTGFiZWwgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVUZXN0RmFpbCB8fCAnQ29ubmVjdGlvbiBmYWlsZWQnO1xuXHRcdFx0Y29uc3QgZXJyID0gKHByb2JlICYmIHByb2JlLmVycm9yKSA/IHByb2JlLmVycm9yIDogKGZhbGxiYWNrRXJyIHx8ICcnKTtcblx0XHRcdCRyZXN1bHQuY3NzKCdjb2xvcicsICcjZGIyODI4JykudGV4dChlcnIgPyBgJHtmYWlsTGFiZWx9OiAke2Vycn1gIDogZmFpbExhYmVsKTtcblx0XHR9O1xuXG5cdFx0JGJ0bi5vZmYoJ2NsaWNrLmN0aVJlbW90ZVRlc3QnKS5vbignY2xpY2suY3RpUmVtb3RlVGVzdCcsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQkYnRuLmFkZENsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHQkcmVzdWx0LnJlbW92ZUNsYXNzKCdncmVlbiByZWQnKVxuXHRcdFx0XHQuY3NzKCdjb2xvcicsICcjNjY2Jylcblx0XHRcdFx0LnRleHQoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdFJ1bm5pbmcgfHwgJ1Byb2JpbmfigKYnKTtcblx0XHRcdC8vIERvbid0IHNlbmQgdGhlIG1hc2tlZCBzYXZlZCBrZXkgYmFjayB0byB0aGUgc2VydmVyIOKAlCBlbXB0eSBrZXlcblx0XHRcdC8vIHRlbGxzIHRoZSBiYWNrZW5kIHRvIGZhbGwgYmFjayB0byB0aGUgREIgdmFsdWUgdHJhbnNwYXJlbnRseS5cblx0XHRcdGNvbnN0IHJhd0tleSA9ICQoJyNyZW1vdGVfc3NoX2tleScpLnZhbCgpIHx8ICcnO1xuXHRcdFx0Y29uc3Qga2V5Rm9yUG9zdCA9IHJhd0tleS5pbmRleE9mKCcqKioqKionKSAhPT0gLTEgPyAnJyA6IHJhd0tleTtcblx0XHRcdCQuYWpheCh7XG5cdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvdGVzdFJlbW90ZUNvbm5lY3Rpb25gLFxuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0ZGF0YVR5cGU6ICdqc29uJyxcblx0XHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGhvc3Q6ICQoJyNyZW1vdGVfaG9zdCcpLnZhbCgpIHx8ICcnLFxuXHRcdFx0XHRcdHBvcnQ6ICQoJyNyZW1vdGVfc3NoX3BvcnQnKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0XHRsb2dpbjogJCgnI3JlbW90ZV9zc2hfbG9naW4nKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0XHRrZXk6IGtleUZvclBvc3QsXG5cdFx0XHRcdFx0YmFzZTogJCgnI3JlbW90ZV9iaW5fZGlyJykudmFsKCkgfHwgJycsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdWNjZXNzKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0Ly8gUEJYQXBpUmVzdWx0OiB7IHJlc3VsdCwgZGF0YToge29rLCBhcmNoLCBlcnJvcn0sIG1lc3NhZ2VzLCAuLi4gfVxuXHRcdFx0XHRcdGNvbnN0IHByb2JlID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEpID8gcmVzcG9uc2UuZGF0YSA6IG51bGw7XG5cdFx0XHRcdFx0Y29uc3QgbXNnID0gKHJlc3BvbnNlICYmIEFycmF5LmlzQXJyYXkocmVzcG9uc2UubWVzc2FnZXMpICYmIHJlc3BvbnNlLm1lc3NhZ2VzLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHQ/IHJlc3BvbnNlLm1lc3NhZ2VzLmpvaW4oJzsgJykgOiAnJztcblx0XHRcdFx0XHRyZW5kZXJSZXN1bHQocHJvYmUsIG1zZyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yKHhocikge1xuXHRcdFx0XHRcdHJlbmRlclJlc3VsdChudWxsLCBgSFRUUCAke3hoci5zdGF0dXMgfHwgJ2Vycm9yJ31gKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICogUGhhc2UgQzog0L7Qv9C10YDQsNGC0L7RgNGB0LrQuNC5IGZhaWxiYWNrINCy0YvQvdC10YHQtdC90L3QvtCz0L4g0YHQtdGA0LLQuNGB0LAg0L7QsdGA0LDRgtC90L4g0L3QsCDQu9C+0LrQsNC70YwuXG5cdCAqINCa0L3QvtC/0LrQsCDQttC40LLRkdGCINCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0YLQvtGA0LDRjyDQv9C10YDQtdGA0LjRgdC+0LLRi9Cy0LDQtdGC0YHRjyDQvdCwINC60LDQttC00L7QvCDQvtC/0YDQvtGB0LUsXG5cdCAqINC/0L7RjdGC0L7QvNGDINGB0LvRg9GI0LDRgtC10LvRjCDQtNC10LvQtdCz0LjRgNC+0LLQsNC90L3Ri9C5ICjQvdCwIGRvY3VtZW50KS4g0JHRjdC60LXQvdC0INGB0L3QuNC80LDQtdGCINGC0YPQvNCx0LvQtdGAXG5cdCAqIChmZW5jZSkg0Lgg0L/QvtC00L3QuNC80LDQtdGCINC70L7QutCw0LvRjCDQuNC3INC70L7QutCw0LvRjNC90L7QuSDQutC+0L/QuNC4INGB0LXRgdGB0LjQuC5cblx0ICovXG5cdGluaXRpYWxpemVSZW1vdGVGYWlsYmFjaygpIHtcblx0XHQkKGRvY3VtZW50KS5vZmYoJ2NsaWNrLmN0aUZhaWxiYWNrJywgJy5jdGktZmFpbGJhY2stYnRuJylcblx0XHRcdC5vbignY2xpY2suY3RpRmFpbGJhY2snLCAnLmN0aS1mYWlsYmFjay1idG4nLCAoZSkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbnN0ICRidG4gPSAkKGUuY3VycmVudFRhcmdldCk7XG5cdFx0XHRcdGNvbnN0IHN2YyA9ICRidG4uYXR0cignZGF0YS1zdmMnKSB8fCAnJztcblx0XHRcdFx0aWYgKHN2YyA9PT0gJycgfHwgJGJ0bi5oYXNDbGFzcygnZGlzYWJsZWQnKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb25maXJtTXNnID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRmFpbGJhY2tDb25maXJtXG5cdFx0XHRcdFx0fHwgJ0JyaW5nIHRoaXMgc2VydmljZSBiYWNrIHRvIGxvY2FsIGZyb20gdGhlIGxhc3QgbG9jYWwgY29weT8gJ1xuXHRcdFx0XHRcdFx0KyAnVGhlIFZQUyB3aWxsIGJlIHR1cm5lZCBvZmYgZm9yIGl0Lic7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hbGVydFxuXHRcdFx0XHRpZiAoIXdpbmRvdy5jb25maXJtKGNvbmZpcm1Nc2cpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCRidG4uYWRkQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdFx0Y29uc3QgZmFpbExhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRmFpbGJhY2tGYWlsZWQgfHwgJ0ZhaWxiYWNrIGZhaWxlZCc7XG5cdFx0XHRcdCQuYWpheCh7XG5cdFx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9mYWlsYmFja2AsXG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHRkYXRhVHlwZTogJ2pzb24nLFxuXHRcdFx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHsgc2VydmljZTogc3ZjIH0pLFxuXHRcdFx0XHRcdHN1Y2Nlc3MocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9rID0gcmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSAmJiByZXNwb25zZS5kYXRhLm9rID09PSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKG9rKSB7XG5cdFx0XHRcdFx0XHRcdC8vIExlYXZlIHRoZSBidXR0b24gYnVzeTsgdGhlIHN0YXR1cyB3b3JrZXIgcmUtcG9sbHMgd2l0aGluXG5cdFx0XHRcdFx0XHRcdC8vIGEgZmV3IHNlY29uZHMsIHRoZSBzZXJ2aWNlIGZsaXBzIHRvIGxvY2FsIGFuZCB0aGUgcm93XG5cdFx0XHRcdFx0XHRcdC8vICh3aXRoIGl0cyBidXR0b24pIGRpc2FwcGVhcnMgb24gdGhlIG5leHQgcmVuZGVyLlxuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQkYnRuLnJlbW92ZUNsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRcdFx0XHRjb25zdCBtc2cgPSAocmVzcG9uc2UgJiYgQXJyYXkuaXNBcnJheShyZXNwb25zZS5tZXNzYWdlcykgJiYgcmVzcG9uc2UubWVzc2FnZXMubGVuZ3RoID4gMClcblx0XHRcdFx0XHRcdFx0PyByZXNwb25zZS5tZXNzYWdlcy5qb2luKCc7ICcpIDogJyc7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYWxlcnRcblx0XHRcdFx0XHRcdHdpbmRvdy5hbGVydChtc2cgPyBgJHtmYWlsTGFiZWx9OiAke21zZ31gIDogZmFpbExhYmVsKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGVycm9yKHhocikge1xuXHRcdFx0XHRcdFx0JGJ0bi5yZW1vdmVDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWFsZXJ0XG5cdFx0XHRcdFx0XHR3aW5kb3cuYWxlcnQoYCR7ZmFpbExhYmVsfTogSFRUUCAke3hoci5zdGF0dXMgfHwgJ2Vycm9yJ31gKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC+0LLQtdGA0LrQsCDRgdC+0YHRgtC+0Y/QvdC40Y8g0LzQvtC00YPQu9GPXG5cdCAqL1xuXHRjaGVja1N0YXR1c1RvZ2dsZSgpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JCgnLmRpc2FiaWxpdHknKS5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLnNob3coKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5pbml0aWFsaXplKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdCQoJy5kaXNhYmlsaXR5JykuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICog0J/QtdGA0LXQutC70Y7Rh9Cw0YLQtdC70Ywg0YPRgdGC0LDQvdC+0LLQutC4IENhbGxlcklEINC40LcgMdChXG5cdCAqINCf0YDRj9GH0LXRgiDQuNC70Lgg0L/QvtC60LDQt9GL0LLQsNC10YIg0YHRgtCw0YLRg9GBINGC0YDQsNC90YHQu9C40YLQtdGA0LDRhtC40Lhcblx0ICovXG5cdHNldENhbGxlcklkVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkU2V0dXBUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrLmhpZGUoKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQktC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINGA0LDQsdC+0YLRiyDRh9C10YDQtdC3IFdTXG5cdCAqL1xuXHRlbmFibGVXc0ZpZWxkcygpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuJHdzT25seUZpZWxkcy5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0fSxcblx0LyoqXG5cdCAqINCS0YvQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDRgNCw0LHQvtGC0Ysg0YfQtdGA0LXQtyBXU1xuXHQgKi9cblx0ZGlzYWJsZVdzRmllbGRzKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kd3NPbmx5RmllbGRzLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC4INC40LfQvNC10L3QtdC90LjQuCBTU0wg0YDQtdC20LjQvNCwXG5cdCAqIEBwYXJhbSB2YWx1ZVxuXHQgKiBAcGFyYW0gdGV4dFxuXHQgKiBAcGFyYW0gJGNob2ljZVxuXHQgKi9cblx0Y2JTc2xNb2RlT25DaGFuZ2UodmFsdWUsIHRleHQsICRjaG9pY2Upe1xuXHRcdGNvbnN0IHBvcnQgPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnZ2V0IHZhbHVlJywnc2VydmVyMWNwb3J0Jyk7XG5cdFx0aWYgKHZhbHVlPT09J2h0dHAnICYmIHBvcnQ9PT0nNDQzJyl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnc2V0IHZhbHVlJywnc2VydmVyMWNwb3J0JywgODApO1xuXHRcdH1cblx0XHRpZiAodmFsdWU9PT0naHR0cHMnICYmIHBvcnQ9PT0nODAnKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdzZXQgdmFsdWUnLCdzZXJ2ZXIxY3BvcnQnLCA0NDMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSxcblx0Y2JCZWZvcmVTZW5kRm9ybShzZXR0aW5ncykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNldHRpbmdzO1xuXHRcdHJlc3VsdC5kYXRhID0gbW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqLmZvcm0oJ2dldCB2YWx1ZXMnKTtcblx0XHRyZXN1bHQuZGF0YSA9IG1vZHVsZUNUSUNsaWVudC5zeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0KHJlc3VsdC5kYXRhKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9LFxuXHRjYkFmdGVyU2VuZEZvcm0oKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemUoKTtcblx0fSxcblx0aW5pdGlhbGl6ZUZvcm0oKSB7XG5cdFx0Rm9ybS4kZm9ybU9iaiA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iajtcblx0XHRGb3JtLnVybCA9IGAke2dsb2JhbFJvb3RVcmx9bW9kdWxlLWMtdC1pLWNsaWVudC9zYXZlYDtcblx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSBtb2R1bGVDVElDbGllbnQudmFsaWRhdGVSdWxlcztcblx0XHRGb3JtLmNiQmVmb3JlU2VuZEZvcm0gPSBtb2R1bGVDVElDbGllbnQuY2JCZWZvcmVTZW5kRm9ybTtcblx0XHRGb3JtLmNiQWZ0ZXJTZW5kRm9ybSA9IG1vZHVsZUNUSUNsaWVudC5jYkFmdGVyU2VuZEZvcm07XG5cdFx0Rm9ybS5pbml0aWFsaXplKCk7XG5cdH0sXG59O1xuXG5cbiQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy5lbXB0eUN1c3RvbVJ1bGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcblx0aWYgKG1vZHVsZUNUSUNsaWVudC4kYXV0b1NldHRpbmdzVG9nZ2xlLmNoZWNrYm94KCdpcyB1bmNoZWNrZWQnKVxuXHRcdCYmIG1vZHVsZUNUSUNsaWVudC4kd3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKVxuXHRcdCYmIHZhbHVlID09PSAnJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbiQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy53cm9uZ1BvcnRDdXN0b21SdWxlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmIChtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZS5jaGVja2JveCgnaXMgdW5jaGVja2VkJylcblx0XHQmJiBtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJylcblx0KSB7XG5cdFx0cmV0dXJuICQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy5pbnRlZ2VyKHZhbHVlLCAnMS4uNjU1MzUnKTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbiQoZG9jdW1lbnQpLnJlYWR5KCgpID0+IHtcblx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemUoKTtcbn0pO1xuIl19