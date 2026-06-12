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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnQiLCIkd3NUb2dnbGUiLCIkIiwiJHdzVG9nZ2xlUmFkaW8iLCIkc3RhdHVzVG9nZ2xlIiwiJGNhbGxlcklkU2V0dXBUb2dnbGUiLCIkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jayIsIiRmb3JtT2JqIiwiJG1vZHVsZVN0YXR1cyIsIiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRhdXRvU2V0dGluZ3NUb2dnbGUiLCIkb25seUF1dG9TZXR0aW5nc1Zpc2libGUiLCIkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZSIsIiR3c09ubHlGaWVsZHMiLCIkZGlycnR5RmllbGQiLCIkc3NsTW9kZVNlbGVjdCIsIiRkZWJ1Z1RhYiIsInJlbW90ZU1pZ3JhdGlvbkxvY2tlZCIsInJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyIsInJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kIiwicmVtb3RlUHJvdGVjdGVkRmllbGRJZHMiLCJyZW1vdGVUb2dnbGVGaWVsZElkcyIsInJlbW90ZVNlcnZpY2VMYWJlbEtleXMiLCJjaGF0cyIsInRnIiwibWF4IiwidmFsaWRhdGVSdWxlcyIsInNlcnZlcjFjaG9zdCIsImlkZW50aWZpZXIiLCJydWxlcyIsInR5cGUiLCJwcm9tcHQiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHkiLCJzZXJ2ZXIxY3BvcnQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UiLCJkYXRhYmFzZSIsIm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lIiwiaW5pdGlhbGl6ZSIsInRhYiIsImNoZWNrYm94IiwiaGlkZSIsIm9uQ2hlY2tlZCIsInNob3ciLCJvblVuY2hlY2tlZCIsIm9uQ2hhbmdlIiwic2V0Q2FsbGVySWRUb2dnbGUiLCJ2YWwiLCJNYXRoIiwicmFuZG9tIiwidHJpZ2dlciIsIkZvcm0iLCJlbmFibGVXc0ZpZWxkcyIsImRpc2FibGVXc0ZpZWxkcyIsImRyb3Bkb3duIiwiY2JTc2xNb2RlT25DaGFuZ2UiLCJpbml0aWFsaXplRm9ybSIsImNoZWNrU3RhdHVzVG9nZ2xlIiwiaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QiLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwic2V0UmVtb3RlTWlncmF0aW9uTG9jayIsImFwcGx5UmVtb3RlTWlncmF0aW9uTG9jayIsImV2ZW50IiwiZGV0YWlsIiwiYWN0aXZlIiwiQXJyYXkiLCJpc0FycmF5Iiwic2VydmljZXMiLCJsb2NrZWQiLCIkcmVtb3RlSW5wdXRzIiwiZ2V0UmVtb3RlUHJvdGVjdGVkSW5wdXRzIiwiJHJlbW90ZVRvZ2dsZXMiLCJnZXRSZW1vdGVUb2dnbGVJbnB1dHMiLCIkcmVtb3RlVGVzdEJ1dHRvbiIsInByb3AiLCJhdHRyIiwiY2xvc2VzdCIsInRvZ2dsZUNsYXNzIiwicmVtb3ZlQXR0ciIsImxlbmd0aCIsInNlcnZpY2VUZXh0IiwiZm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMiLCJiYXNlVGV4dCIsIm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkIiwidGV4dCIsImZpbmQiLCJ0b2dnbGUiLCJtYXAiLCJpZCIsImpvaW4iLCJzZXJ2aWNlIiwia2V5Iiwic3luY1JlbW90ZUZpZWxkc0JlZm9yZVN1Ym1pdCIsImZvcm1EYXRhIiwiZm9yRWFjaCIsImlzIiwiJGJ0biIsIiRyZXN1bHQiLCJyZW5kZXJSZXN1bHQiLCJwcm9iZSIsImZhbGxiYWNrRXJyIiwicmVtb3ZlQ2xhc3MiLCJvayIsIm9rTGFiZWwiLCJtb2RfY3RpX1JlbW90ZVRlc3RPayIsImFyY2giLCJyd0xhYmVsIiwibW9kX2N0aV9SZW1vdGVUZXN0UndPayIsImNzcyIsImZhaWxMYWJlbCIsIm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwiLCJlcnIiLCJlcnJvciIsIm9mZiIsIm9uIiwiZSIsInByZXZlbnREZWZhdWx0IiwiYWRkQ2xhc3MiLCJtb2RfY3RpX1JlbW90ZVRlc3RSdW5uaW5nIiwicmF3S2V5Iiwia2V5Rm9yUG9zdCIsImluZGV4T2YiLCJhamF4IiwidXJsIiwiQ29uZmlnIiwicGJ4VXJsIiwibWV0aG9kIiwiY29udGVudFR5cGUiLCJkYXRhVHlwZSIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiaG9zdCIsInBvcnQiLCJsb2dpbiIsImJhc2UiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJtc2ciLCJtZXNzYWdlcyIsInhociIsInN0YXR1cyIsIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsInJlbW92ZSIsInZhbHVlIiwiJGNob2ljZSIsImZvcm0iLCJjYkJlZm9yZVNlbmRGb3JtIiwic2V0dGluZ3MiLCJyZXN1bHQiLCJjYkFmdGVyU2VuZEZvcm0iLCJnbG9iYWxSb290VXJsIiwiZm4iLCJlbXB0eUN1c3RvbVJ1bGUiLCJ3cm9uZ1BvcnRDdXN0b21SdWxlIiwiaW50ZWdlciIsImRvY3VtZW50IiwicmVhZHkiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQSxJQUFNQSxlQUFlLEdBQUc7QUFDdkJDLEVBQUFBLFNBQVMsRUFBRUMsQ0FBQyxDQUFDLDBCQUFELENBRFc7QUFFdkJDLEVBQUFBLGNBQWMsRUFBRUQsQ0FBQyxDQUFDLDRDQUFELENBRk07QUFHdkJFLEVBQUFBLGFBQWEsRUFBRUYsQ0FBQyxDQUFDLHVCQUFELENBSE87QUFJdkJHLEVBQUFBLG9CQUFvQixFQUFFSCxDQUFDLENBQUMseUJBQUQsQ0FKQTtBQUt2QkksRUFBQUEsbUNBQW1DLEVBQUVKLENBQUMsQ0FBQyx1Q0FBRCxDQUxmO0FBTXZCSyxFQUFBQSxRQUFRLEVBQUVMLENBQUMsQ0FBQyx5QkFBRCxDQU5ZO0FBT3ZCTSxFQUFBQSxhQUFhLEVBQUVOLENBQUMsQ0FBQyxxQkFB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LEVBRmQsRUFFa0I7QUFDakIsV0FBTyxLQUFQO0FBQ0E7O0FBQ0QsU0FBTyxJQUFQO0FBQ0EsQ0FQRDs7QUFTQWpKLENBQUMsQ0FBQ3lKLEVBQUYsQ0FBS04sSUFBTCxDQUFVRSxRQUFWLENBQW1CekgsS0FBbkIsQ0FBeUIrSCxtQkFBekIsR0FBK0MsVUFBVVYsS0FBVixFQUFpQjtBQUMvRCxNQUFJbkosZUFBZSxDQUFDVyxtQkFBaEIsQ0FBb0M4QixRQUFwQyxDQUE2QyxjQUE3QyxLQUNBekMsZUFBZSxDQUFDQyxTQUFoQixDQUEwQndDLFFBQTFCLENBQW1DLFlBQW5DLENBREosRUFFRTtBQUNELFdBQU92QyxDQUFDLENBQUN5SixFQUFGLENBQUtOLElBQUwsQ0FBVUUsUUFBVixDQUFtQnpILEtBQW5CLENBQXlCZ0ksT0FBekIsQ0FBaUNYLEtBQWpDLEVBQXdDLFVBQXhDLENBQVA7QUFDQTs7QUFDRCxTQUFPLElBQVA7QUFDQSxDQVBEOztBQVNBakosQ0FBQyxDQUFDNkosUUFBRCxDQUFELENBQVlDLEtBQVosQ0FBa0IsWUFBTTtBQUN2QmhLLEVBQUFBLGVBQWUsQ0FBQ3VDLFVBQWhCO0FBQ0EsQ0FGRCIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIE1JS08gTExDIC0gQWxsIFJpZ2h0cyBSZXNlcnZlZFxuICogVW5hdXRob3JpemVkIGNvcHlpbmcgb2YgdGhpcyBmaWxlLCB2aWEgYW55IG1lZGl1bSBpcyBzdHJpY3RseSBwcm9oaWJpdGVkXG4gKiBQcm9wcmlldGFyeSBhbmQgY29uZmlkZW50aWFsXG4gKiBXcml0dGVuIGJ5IE5pa29sYXkgQmVrZXRvdiwgMTEgMjAxOFxuICpcbiAqL1xuXG5jb25zdCBtb2R1bGVDVElDbGllbnQgPSB7XG5cdCR3c1RvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCR3c1RvZ2dsZVJhZGlvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAud2ViLXNlcnZpY2UtcmFkaW8nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCRjYWxsZXJJZFNldHVwVG9nZ2xlOiAkKCcjc2V0dXAtY2FsbGVyLWlkLXRvZ2dsZScpLFxuXHQkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jazogJCgnI3RyYW5zbGl0ZXJhdGUtY2FsbGVyLWlkLXRvZ2dsZS1ibG9jaycpLFxuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI2N0aS1zdGF0dXMtc3VtbWFyeScpLFxuXHQkcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2U6ICQoJyNjdGktcmVtb3RlLW1pZ3JhdGlvbi1sb2NrLW1lc3NhZ2UnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JGF1dG9TZXR0aW5nc1RvZ2dsZTogJCgnI2F1dG8tc2V0dGluZ3MtbW9kZS10b2dnbGUnKSxcblx0JG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAub25seS1hdXRvLXNldHRpbmdzJyksXG5cdCRvbmx5TWFudWFsU2V0dGluZ3NWaXNpYmxlOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAub25seS1tYW51YWwtc2V0dGluZ3MnKSxcblx0JHdzT25seUZpZWxkczogJCgnLndzLW9ubHknKSxcblx0JGRpcnJ0eUZpZWxkOiAkKCcjZGlycnR5JyksXG5cdCRzc2xNb2RlU2VsZWN0OiAkKCcuc2VydmVyMWNfc2NoZW1lIHNlbGVjdCcpLFxuXHQkZGVidWdUYWI6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC10YWJzIC5pdGVtW2RhdGEtdGFiPVwiZGVidWdcIl0nKSxcblx0cmVtb3RlTWlncmF0aW9uTG9ja2VkOiBmYWxzZSxcblx0cmVtb3RlTWlncmF0aW9uTG9ja1NlcnZpY2VzOiBbXSxcblx0cmVtb3RlTWlncmF0aW9uTG9ja0xpc3RlbmVyQm91bmQ6IGZhbHNlLFxuXHRyZW1vdGVQcm90ZWN0ZWRGaWVsZElkczogW1xuXHRcdCdyZW1vdGVfaG9zdCcsXG5cdFx0J3JlbW90ZV9zc2hfcG9ydCcsXG5cdFx0J3JlbW90ZV9zc2hfbG9naW4nLFxuXHRcdCdyZW1vdGVfc3NoX2tleScsXG5cdFx0J3JlbW90ZV9iaW5fZGlyJyxcblx0XSxcblx0cmVtb3RlVG9nZ2xlRmllbGRJZHM6IFsncmVtb3RlX3doYXRzYXBwJywgJ3JlbW90ZV90ZWxlZ3JhbScsICdyZW1vdGVfbWF4J10sXG5cdHJlbW90ZVNlcnZpY2VMYWJlbEtleXM6IHtcblx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHR0ZzogJ21vZF9jdGlfc3ZjX3RnJyxcblx0XHRtYXg6ICdtb2RfY3RpX3N2Y19tYXgnLFxuXHR9LFxuXHR2YWxpZGF0ZVJ1bGVzOiB7XG5cdFx0c2VydmVyMWNob3N0OiB7XG5cdFx0XHRpZGVudGlmaWVyOiAnc2VydmVyMWNob3N0Jyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnZW1wdHlDdXN0b21SdWxlJyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHksXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0c2VydmVyMWNwb3J0OiB7XG5cdFx0XHRpZGVudGlmaWVyOiAnc2VydmVyMWNwb3J0Jyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnd3JvbmdQb3J0Q3VzdG9tUnVsZScsXG5cdFx0XHRcdFx0cHJvbXB0OiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDUG9ydFJhbmdlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdGRhdGFiYXNlOiB7XG5cdFx0XHRpZGVudGlmaWVyOiAnZGF0YWJhc2UnLFxuXHRcdFx0cnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdlbXB0eUN1c3RvbVJ1bGUnLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHR9LFxuXHRpbml0aWFsaXplKCkge1xuXHRcdCQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5pdGVtJykudGFiKCk7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUYWIuaGlkZSgpXG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLnNob3coKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblVuY2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLmhpZGUoKVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdG1vZHVsZUNUSUNsaWVudC4kY2FsbGVySWRTZXR1cFRvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGFuZ2U6IG1vZHVsZUNUSUNsaWVudC5zZXRDYWxsZXJJZFRvZ2dsZVxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuc2hvdygpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSB7fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25VbmNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLmhpZGUoKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuc2hvdygpO1xuXHRcdFx0XHRcdEZvcm0udmFsaWRhdGVSdWxlcyA9IG1vZHVsZUNUSUNsaWVudC52YWxpZGF0ZVJ1bGVzO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlUmFkaW9cblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRpcnJ0eUZpZWxkLnZhbChNYXRoLnJhbmRvbSgpKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRpcnJ0eUZpZWxkLnRyaWdnZXIoJ2NoYW5nZScpO1xuXHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZGlzYWJsZVdzRmllbGRzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRzc2xNb2RlU2VsZWN0LmRyb3Bkb3duKHtcblx0XHRcdG9uQ2hhbmdlOiBtb2R1bGVDVElDbGllbnQuY2JTc2xNb2RlT25DaGFuZ2Vcblx0XHR9KTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZUZvcm0oKTtcblx0XHRtb2R1bGVDVElDbGllbnQuY2hlY2tTdGF0dXNUb2dnbGUoKTtcblx0XHRtb2R1bGVDVElDbGllbnQuc2V0Q2FsbGVySWRUb2dnbGUoKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZVJlbW90ZUNvbm5lY3Rpb25UZXN0KCk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ01vZHVsZVN0YXR1c0NoYW5nZWQnLCBtb2R1bGVDVElDbGllbnQuY2hlY2tTdGF0dXNUb2dnbGUpO1xuXHR9LFxuXHQvKipcblx0ICog0J/QvtC00L/QuNGB0LrQsCDQvdCwINGB0YLQsNGC0YPRgSDQsNC60YLQuNCy0L3QvtC5INC80LjQs9GA0LDRhtC40Lgg0LzQtdGB0YHQtdC90LTQttC10YDQvtCyLlxuXHQgKi9cblx0aW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2soKSB7XG5cdFx0aWYgKCFtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja0xpc3RlbmVyQm91bmQpIHtcblx0XHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFxuXHRcdFx0XHQnUmVtb3RlTWlncmF0aW9uTG9ja0NoYW5nZWQnLFxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnQuc2V0UmVtb3RlTWlncmF0aW9uTG9jayxcblx0XHRcdCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja0xpc3RlbmVyQm91bmQgPSB0cnVlO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuYXBwbHlSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQntCx0L3QvtCy0LjRgtGMINGB0L7RgdGC0L7Rj9C90LjQtSDQsdC70L7QutC40YDQvtCy0LrQuCByZW1vdGUvVlBTINC/0L7Qu9C10LkuXG5cdCAqIEBwYXJhbSB7Q3VzdG9tRXZlbnR9IGV2ZW50XG5cdCAqL1xuXHRzZXRSZW1vdGVNaWdyYXRpb25Mb2NrKGV2ZW50KSB7XG5cdFx0Y29uc3QgZGV0YWlsID0gKGV2ZW50ICYmIGV2ZW50LmRldGFpbCkgPyBldmVudC5kZXRhaWwgOiB7fTtcblx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja2VkID0gZGV0YWlsLmFjdGl2ZSA9PT0gdHJ1ZTtcblx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja1NlcnZpY2VzID0gQXJyYXkuaXNBcnJheShkZXRhaWwuc2VydmljZXMpXG5cdFx0XHQ/IGRldGFpbC5zZXJ2aWNlcyA6IFtdO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5hcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0fSxcblx0LyoqXG5cdCAqINCf0YDQuNC80LXQvdC40YLRjCDRgtC10LrRg9GJ0YPRjiDQsdC70L7QutC40YDQvtCy0LrRgyDQuiDQv9C+0LvRj9C8INGE0L7RgNC80Ysg0LHQtdC3IGRpc2FibGVkLdCw0YLRgNC40LHRg9GC0L7Qsjpcblx0ICogdmFsdWVzINC00L7Qu9C20L3RiyDQv9GA0L7QtNC+0LvQttCw0YLRjCDQvtGC0L/RgNCw0LLQu9GP0YLRjNGB0Y8g0L/RgNC4INGB0L7RhdGA0LDQvdC10L3QuNC4INC00YDRg9Cz0LjRhSDQvdCw0YHRgtGA0L7QtdC6LlxuXHQgKi9cblx0YXBwbHlSZW1vdGVNaWdyYXRpb25Mb2NrKCkge1xuXHRcdGNvbnN0IGxvY2tlZCA9IG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgPT09IHRydWU7XG5cdFx0Y29uc3QgJHJlbW90ZUlucHV0cyA9IG1vZHVsZUNUSUNsaWVudC5nZXRSZW1vdGVQcm90ZWN0ZWRJbnB1dHMoKTtcblx0XHRjb25zdCAkcmVtb3RlVG9nZ2xlcyA9IG1vZHVsZUNUSUNsaWVudC5nZXRSZW1vdGVUb2dnbGVJbnB1dHMoKTtcblx0XHRjb25zdCAkcmVtb3RlVGVzdEJ1dHRvbiA9ICQoJyNjdGktdGVzdC1yZW1vdGUtY29ubicpO1xuXG5cdFx0JHJlbW90ZUlucHV0c1xuXHRcdFx0LnByb3AoJ3JlYWRvbmx5JywgbG9ja2VkKVxuXHRcdFx0LmF0dHIoJ2FyaWEtZGlzYWJsZWQnLCBsb2NrZWQgPyAndHJ1ZScgOiAnZmFsc2UnKVxuXHRcdFx0LmNsb3Nlc3QoJy5maWVsZCcpXG5cdFx0XHQudG9nZ2xlQ2xhc3MoJ2N0aS1yZW1vdGUtZmllbGQtbG9ja2VkJywgbG9ja2VkKTtcblx0XHRpZiAobG9ja2VkKSB7XG5cdFx0XHQkcmVtb3RlSW5wdXRzLmF0dHIoJ3RhYmluZGV4JywgJy0xJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdCRyZW1vdGVJbnB1dHMucmVtb3ZlQXR0cigndGFiaW5kZXgnKTtcblx0XHR9XG5cblx0XHQkcmVtb3RlVG9nZ2xlc1xuXHRcdFx0LmF0dHIoJ2FyaWEtZGlzYWJsZWQnLCBsb2NrZWQgPyAndHJ1ZScgOiAnZmFsc2UnKVxuXHRcdFx0LmNsb3Nlc3QoJy51aS5zZWdtZW50Jylcblx0XHRcdC50b2dnbGVDbGFzcygnY3RpLXJlbW90ZS1maWVsZC1sb2NrZWQnLCBsb2NrZWQpO1xuXHRcdGlmIChsb2NrZWQpIHtcblx0XHRcdCRyZW1vdGVUb2dnbGVzLmF0dHIoJ3RhYmluZGV4JywgJy0xJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdCRyZW1vdGVUb2dnbGVzLnJlbW92ZUF0dHIoJ3RhYmluZGV4Jyk7XG5cdFx0fVxuXG5cdFx0JHJlbW90ZVRlc3RCdXR0b25cblx0XHRcdC50b2dnbGVDbGFzcygnZGlzYWJsZWQnLCBsb2NrZWQpXG5cdFx0XHQuYXR0cignYXJpYS1kaXNhYmxlZCcsIGxvY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2UubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2VydmljZVRleHQgPSBtb2R1bGVDVElDbGllbnQuZm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMoXG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrU2VydmljZXMsXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgYmFzZVRleHQgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVNaWdyYXRpb25Mb2NrZWRcblx0XHRcdFx0fHwgJ01lc3NlbmdlciBtaWdyYXRpb24gaXMgaW4gcHJvZ3Jlc3MuIFJlbW90ZSBzZXR0aW5ncyBhcmUgbG9ja2VkIHVudGlsIGl0IGZpbmlzaGVzLic7XG5cdFx0XHRjb25zdCB0ZXh0ID0gc2VydmljZVRleHQgPT09ICcnID8gYmFzZVRleHQgOiBgJHtiYXNlVGV4dH0gKCR7c2VydmljZVRleHR9KWA7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJHJlbW90ZU1pZ3JhdGlvbkxvY2tNZXNzYWdlLmZpbmQoJ3AnKS50ZXh0KHRleHQpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZS50b2dnbGUobG9ja2VkKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiBAcmV0dXJucyB7alF1ZXJ5fVxuXHQgKi9cblx0Z2V0UmVtb3RlUHJvdGVjdGVkSW5wdXRzKCkge1xuXHRcdHJldHVybiAkKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVQcm90ZWN0ZWRGaWVsZElkcy5tYXAoKGlkKSA9PiBgIyR7aWR9YCkuam9pbignLCcpKTtcblx0fSxcblx0LyoqXG5cdCAqIEByZXR1cm5zIHtqUXVlcnl9XG5cdCAqL1xuXHRnZXRSZW1vdGVUb2dnbGVJbnB1dHMoKSB7XG5cdFx0cmV0dXJuICQobW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVRvZ2dsZUZpZWxkSWRzLm1hcCgoaWQpID0+IGAjJHtpZH1gKS5qb2luKCcsJykpO1xuXHR9LFxuXHQvKipcblx0ICogQHBhcmFtIHtzdHJpbmdbXX0gc2VydmljZXNcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGZvcm1hdFJlbW90ZU1pZ3JhdGlvblNlcnZpY2VzKHNlcnZpY2VzKSB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHNlcnZpY2VzKSB8fCBzZXJ2aWNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHNlcnZpY2VzLm1hcCgoc2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gbW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVNlcnZpY2VMYWJlbEtleXNbc2VydmljZV07XG5cdFx0XHRpZiAoa2V5ICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzZXJ2aWNlO1xuXHRcdH0pLmpvaW4oJywgJyk7XG5cdH0sXG5cdC8qKlxuXHQgKiBQcmVzZXJ2ZSBsb2NrZWQgcmVtb3RlIHZhbHVlcyBpbiBQT1NUIGRhdGEgd2hlbiBzYXZpbmcgdW5yZWxhdGVkIHNldHRpbmdzLlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZm9ybURhdGFcblx0ICogQHJldHVybnMge09iamVjdH1cblx0ICovXG5cdHN5bmNSZW1vdGVGaWVsZHNCZWZvcmVTdWJtaXQoZm9ybURhdGEpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIGZvcm1EYXRhO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQucmVtb3RlUHJvdGVjdGVkRmllbGRJZHMuZm9yRWFjaCgoaWQpID0+IHtcblx0XHRcdGZvcm1EYXRhW2lkXSA9ICQoYCMke2lkfWApLnZhbCgpIHx8ICcnO1xuXHRcdH0pO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVUb2dnbGVGaWVsZElkcy5mb3JFYWNoKChpZCkgPT4ge1xuXHRcdFx0Zm9ybURhdGFbaWRdID0gJChgIyR7aWR9YCkuaXMoJzpjaGVja2VkJykgPyAnb24nIDogJyc7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGZvcm1EYXRhO1xuXHR9LFxuXHQvKipcblx0ICog0JrQvdC+0L/QutCwIMKr0J/RgNC+0LLQtdGA0LjRgtGMINC/0L7QtNC60LvRjtGH0LXQvdC40LXCuyDQvdCwINCy0LrQu9Cw0LTQutC1INCj0LTQsNC70ZHQvdC90YvQtSDQvNC10YHRgdC10L3QtNC20LXRgNGLIOKAlFxuXHQgKiDQsdC10YDRkdGCINC30L3QsNGH0LXQvdC40Y8g0YTQvtGA0LzRiyAoaG9zdC9wb3J0L2xvZ2luL2tleSksIFBPU1TQuNGCINC90LAg0LHQtdC60LXQvdC0LFxuXHQgKiDQv9C+0LrQsNC30YvQstCw0LXRgiDRgNC10LfRg9C70YzRgtCw0YIgaW5saW5lLiDQodC+0YXRgNCw0L3QtdC90LjQtSDQvdC1INC00LXQu9Cw0LXRgi5cblx0ICovXG5cdGluaXRpYWxpemVSZW1vdGVDb25uZWN0aW9uVGVzdCgpIHtcblx0XHRjb25zdCAkYnRuID0gJCgnI2N0aS10ZXN0LXJlbW90ZS1jb25uJyk7XG5cdFx0Y29uc3QgJHJlc3VsdCA9ICQoJyNjdGktdGVzdC1yZW1vdGUtY29ubi1yZXN1bHQnKTtcblx0XHRpZiAoJGJ0bi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyUmVzdWx0ID0gKHByb2JlLCBmYWxsYmFja0VycikgPT4ge1xuXHRcdFx0JGJ0bi5yZW1vdmVDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LmFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpO1xuXHRcdFx0aWYgKHByb2JlICYmIHByb2JlLm9rID09PSB0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IG9rTGFiZWwgPSBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVUZXN0T2sgfHwgJ0Nvbm5lY3Rpb24gT0snO1xuXHRcdFx0XHRjb25zdCBhcmNoID0gcHJvYmUuYXJjaCA/IGAgJHtwcm9iZS5hcmNofWAgOiAnJztcblx0XHRcdFx0Y29uc3QgcndMYWJlbCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZVRlc3RSd09rIHx8ICdydyBPSyc7XG5cdFx0XHRcdCRyZXN1bHQuY3NzKCdjb2xvcicsICcjMjFiYTQ1JykudGV4dChgJHtva0xhYmVsfSDigJQke2FyY2h9LCAke3J3TGFiZWx9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZhaWxMYWJlbCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZVRlc3RGYWlsIHx8ICdDb25uZWN0aW9uIGZhaWxlZCc7XG5cdFx0XHRjb25zdCBlcnIgPSAocHJvYmUgJiYgcHJvYmUuZXJyb3IpID8gcHJvYmUuZXJyb3IgOiAoZmFsbGJhY2tFcnIgfHwgJycpO1xuXHRcdFx0JHJlc3VsdC5jc3MoJ2NvbG9yJywgJyNkYjI4MjgnKS50ZXh0KGVyciA/IGAke2ZhaWxMYWJlbH06ICR7ZXJyfWAgOiBmYWlsTGFiZWwpO1xuXHRcdH07XG5cblx0XHQkYnRuLm9mZignY2xpY2suY3RpUmVtb3RlVGVzdCcpLm9uKCdjbGljay5jdGlSZW1vdGVUZXN0JywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGlmIChtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja2VkID09PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdCRidG4uYWRkQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdCRyZXN1bHQucmVtb3ZlQ2xhc3MoJ2dyZWVuIHJlZCcpXG5cdFx0XHRcdC5jc3MoJ2NvbG9yJywgJyM2NjYnKVxuXHRcdFx0XHQudGV4dChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9SZW1vdGVUZXN0UnVubmluZyB8fCAnUHJvYmluZ+KApicpO1xuXHRcdFx0Ly8gRG9uJ3Qgc2VuZCB0aGUgbWFza2VkIHNhdmVkIGtleSBiYWNrIHRvIHRoZSBzZXJ2ZXIg4oCUIGVtcHR5IGtleVxuXHRcdFx0Ly8gdGVsbHMgdGhlIGJhY2tlbmQgdG8gZmFsbCBiYWNrIHRvIHRoZSBEQiB2YWx1ZSB0cmFuc3BhcmVudGx5LlxuXHRcdFx0Y29uc3QgcmF3S2V5ID0gJCgnI3JlbW90ZV9zc2hfa2V5JykudmFsKCkgfHwgJyc7XG5cdFx0XHRjb25zdCBrZXlGb3JQb3N0ID0gcmF3S2V5LmluZGV4T2YoJyoqKioqKicpICE9PSAtMSA/ICcnIDogcmF3S2V5O1xuXHRcdFx0JC5hamF4KHtcblx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC90ZXN0UmVtb3RlQ29ubmVjdGlvbmAsXG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRkYXRhVHlwZTogJ2pzb24nLFxuXHRcdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0aG9zdDogJCgnI3JlbW90ZV9ob3N0JykudmFsKCkgfHwgJycsXG5cdFx0XHRcdFx0cG9ydDogJCgnI3JlbW90ZV9zc2hfcG9ydCcpLnZhbCgpIHx8ICcnLFxuXHRcdFx0XHRcdGxvZ2luOiAkKCcjcmVtb3RlX3NzaF9sb2dpbicpLnZhbCgpIHx8ICcnLFxuXHRcdFx0XHRcdGtleToga2V5Rm9yUG9zdCxcblx0XHRcdFx0XHRiYXNlOiAkKCcjcmVtb3RlX2Jpbl9kaXInKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN1Y2Nlc3MocmVzcG9uc2UpIHtcblx0XHRcdFx0XHQvLyBQQlhBcGlSZXN1bHQ6IHsgcmVzdWx0LCBkYXRhOiB7b2ssIGFyY2gsIGVycm9yfSwgbWVzc2FnZXMsIC4uLiB9XG5cdFx0XHRcdFx0Y29uc3QgcHJvYmUgPSAocmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSkgPyByZXNwb25zZS5kYXRhIDogbnVsbDtcblx0XHRcdFx0XHRjb25zdCBtc2cgPSAocmVzcG9uc2UgJiYgQXJyYXkuaXNBcnJheShyZXNwb25zZS5tZXNzYWdlcykgJiYgcmVzcG9uc2UubWVzc2FnZXMubGVuZ3RoID4gMClcblx0XHRcdFx0XHRcdD8gcmVzcG9uc2UubWVzc2FnZXMuam9pbignOyAnKSA6ICcnO1xuXHRcdFx0XHRcdHJlbmRlclJlc3VsdChwcm9iZSwgbXNnKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXJyb3IoeGhyKSB7XG5cdFx0XHRcdFx0cmVuZGVyUmVzdWx0KG51bGwsIGBIVFRQICR7eGhyLnN0YXR1cyB8fCAnZXJyb3InfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9GA0L7QstC10YDQutCwINGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LTRg9C70Y9cblx0ICovXG5cdGNoZWNrU3RhdHVzVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkKCcuZGlzYWJpbGl0eScpLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuc2hvdygpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmluaXRpYWxpemUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuaGlkZSgpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuaGlkZSgpO1xuXHRcdFx0JCgnLmRpc2FiaWxpdHknKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcblx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9C10YDQtdC60LvRjtGH0LDRgtC10LvRjCDRg9GB0YLQsNC90L7QstC60LggQ2FsbGVySUQg0LjQtyAx0KFcblx0ICog0J/RgNGP0YfQtdGCINC40LvQuCDQv9C+0LrQsNC30YvQstCw0LXRgiDRgdGC0LDRgtGD0YEg0YLRgNCw0L3RgdC70LjRgtC10YDQsNGG0LjQuFxuXHQgKi9cblx0c2V0Q2FsbGVySWRUb2dnbGUoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kY2FsbGVySWRTZXR1cFRvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkVHJhbnNsaXRlcmF0aW9uVG9nZ2xlQmxvY2suc2hvdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkVHJhbnNsaXRlcmF0aW9uVG9nZ2xlQmxvY2suaGlkZSgpO1xuXHRcdH1cblx0fSxcblx0LyoqXG5cdCAqINCS0LrQu9GO0YfQtdC90LjQtSDRgNC10LbQuNC80LAg0YDQsNCx0L7RgtGLINGH0LXRgNC10LcgV1Ncblx0ICovXG5cdGVuYWJsZVdzRmllbGRzKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kd3NPbmx5RmllbGRzLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuXHR9LFxuXHQvKipcblx0ICog0JLRi9C60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINGA0LDQsdC+0YLRiyDRh9C10YDQtdC3IFdTXG5cdCAqL1xuXHRkaXNhYmxlV3NGaWVsZHMoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiR3c09ubHlGaWVsZHMuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9GA0Lgg0LjQt9C80LXQvdC10L3QuNC4IFNTTCDRgNC10LbQuNC80LBcblx0ICogQHBhcmFtIHZhbHVlXG5cdCAqIEBwYXJhbSB0ZXh0XG5cdCAqIEBwYXJhbSAkY2hvaWNlXG5cdCAqL1xuXHRjYlNzbE1vZGVPbkNoYW5nZSh2YWx1ZSwgdGV4dCwgJGNob2ljZSl7XG5cdFx0Y29uc3QgcG9ydCA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdnZXQgdmFsdWUnLCdzZXJ2ZXIxY3BvcnQnKTtcblx0XHRpZiAodmFsdWU9PT0naHR0cCcgJiYgcG9ydD09PSc0NDMnKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdzZXQgdmFsdWUnLCdzZXJ2ZXIxY3BvcnQnLCA4MCk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZT09PSdodHRwcycgJiYgcG9ydD09PSc4MCcpe1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqLmZvcm0oJ3NldCB2YWx1ZScsJ3NlcnZlcjFjcG9ydCcsIDQ0Myk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9LFxuXHRjYkJlZm9yZVNlbmRGb3JtKHNldHRpbmdzKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2V0dGluZ3M7XG5cdFx0cmVzdWx0LmRhdGEgPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnZ2V0IHZhbHVlcycpO1xuXHRcdHJlc3VsdC5kYXRhID0gbW9kdWxlQ1RJQ2xpZW50LnN5bmNSZW1vdGVGaWVsZHNCZWZvcmVTdWJtaXQocmVzdWx0LmRhdGEpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0sXG5cdGNiQWZ0ZXJTZW5kRm9ybSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZSgpO1xuXHR9LFxuXHRpbml0aWFsaXplRm9ybSgpIHtcblx0XHRGb3JtLiRmb3JtT2JqID0gbW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqO1xuXHRcdEZvcm0udXJsID0gYCR7Z2xvYmFsUm9vdFVybH1tb2R1bGUtYy10LWktY2xpZW50L3NhdmVgO1xuXHRcdEZvcm0udmFsaWRhdGVSdWxlcyA9IG1vZHVsZUNUSUNsaWVudC52YWxpZGF0ZVJ1bGVzO1xuXHRcdEZvcm0uY2JCZWZvcmVTZW5kRm9ybSA9IG1vZHVsZUNUSUNsaWVudC5jYkJlZm9yZVNlbmRGb3JtO1xuXHRcdEZvcm0uY2JBZnRlclNlbmRGb3JtID0gbW9kdWxlQ1RJQ2xpZW50LmNiQWZ0ZXJTZW5kRm9ybTtcblx0XHRGb3JtLmluaXRpYWxpemUoKTtcblx0fSxcbn07XG5cblxuJC5mbi5mb3JtLnNldHRpbmdzLnJ1bGVzLmVtcHR5Q3VzdG9tUnVsZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpXG5cdFx0JiYgbW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpXG5cdFx0JiYgdmFsdWUgPT09ICcnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufTtcblxuJC5mbi5mb3JtLnNldHRpbmdzLnJ1bGVzLndyb25nUG9ydEN1c3RvbVJ1bGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcblx0aWYgKG1vZHVsZUNUSUNsaWVudC4kYXV0b1NldHRpbmdzVG9nZ2xlLmNoZWNrYm94KCdpcyB1bmNoZWNrZWQnKVxuXHRcdCYmIG1vZHVsZUNUSUNsaWVudC4kd3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKVxuXHQpIHtcblx0XHRyZXR1cm4gJC5mbi5mb3JtLnNldHRpbmdzLnJ1bGVzLmludGVnZXIodmFsdWUsICcxLi42NTUzNScpO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufTtcblxuJChkb2N1bWVudCkucmVhZHkoKCkgPT4ge1xuXHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZSgpO1xufSk7XG4iXX0=