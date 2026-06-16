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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnQiLCIkd3NUb2dnbGUiLCIkIiwiJHdzVG9nZ2xlUmFkaW8iLCIkc3RhdHVzVG9nZ2xlIiwiJGNhbGxlcklkU2V0dXBUb2dnbGUiLCIkY2FsbGVySWRUcmFuc2xpdGVyYXRpb25Ub2dnbGVCbG9jayIsIiRmb3JtT2JqIiwiJG1vZHVsZVN0YXR1cyIsIiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRhdXRvU2V0dGluZ3NUb2dnbGUiLCIkb25seUF1dG9TZXR0aW5nc1Zpc2libGUiLCIkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZSIsIiR3c09ubHlGaWVsZHMiLCIkZGlycnR5RmllbGQiLCIkc3NsTW9kZVNlbGVjdCIsIiRkZWJ1Z1RhYiIsInJlbW90ZU1pZ3JhdGlvbkxvY2tlZCIsInJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyIsInJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kIiwicmVtb3RlUHJvdGVjdGVkRmllbGRJZHMiLCJyZW1vdGVUb2dnbGVGaWVsZElkcyIsInJlbW90ZVNlcnZpY2VMYWJlbEtleXMiLCJjaGF0cyIsInRnIiwibWF4IiwidmFsaWRhdGVSdWxlcyIsInNlcnZlcjFjaG9zdCIsImlkZW50aWZpZXIiLCJydWxlcyIsInR5cGUiLCJwcm9tcHQiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHkiLCJzZXJ2ZXIxY3BvcnQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UiLCJkYXRhYmFzZSIsIm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lIiwiaW5pdGlhbGl6ZSIsInRhYiIsImNoZWNrYm94IiwiaGlkZSIsIm9uQ2hlY2tlZCIsInNob3ciLCJvblVuY2hlY2tlZCIsIm9uQ2hhbmdlIiwic2V0Q2FsbGVySWRUb2dnbGUiLCJ2YWwiLCJNYXRoIiwicmFuZG9tIiwidHJpZ2dlciIsIkZvcm0iLCJlbmFibGVXc0ZpZWxkcyIsImRpc2FibGVXc0ZpZWxkcyIsImRyb3Bkb3duIiwiY2JTc2xNb2RlT25DaGFuZ2UiLCJpbml0aWFsaXplRm9ybSIsImNoZWNrU3RhdHVzVG9nZ2xlIiwiaW5pdGlhbGl6ZVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJpbml0aWFsaXplUmVtb3RlQ29ubmVjdGlvblRlc3QiLCJpbml0aWFsaXplUmVtb3RlRmFpbGJhY2siLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwic2V0UmVtb3RlTWlncmF0aW9uTG9jayIsImFwcGx5UmVtb3RlTWlncmF0aW9uTG9jayIsImV2ZW50IiwiZGV0YWlsIiwiYWN0aXZlIiwiQXJyYXkiLCJpc0FycmF5Iiwic2VydmljZXMiLCJsb2NrZWQiLCIkcmVtb3RlSW5wdXRzIiwiZ2V0UmVtb3RlUHJvdGVjdGVkSW5wdXRzIiwiJHJlbW90ZVRvZ2dsZXMiLCJnZXRSZW1vdGVUb2dnbGVJbnB1dHMiLCIkcmVtb3RlVGVzdEJ1dHRvbiIsInByb3AiLCJhdHRyIiwiY2xvc2VzdCIsInRvZ2dsZUNsYXNzIiwicmVtb3ZlQXR0ciIsImxlbmd0aCIsInNlcnZpY2VUZXh0IiwiZm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMiLCJiYXNlVGV4dCIsIm1vZF9jdGlfUmVtb3RlTWlncmF0aW9uTG9ja2VkIiwidGV4dCIsImZpbmQiLCJ0b2dnbGUiLCJtYXAiLCJpZCIsImpvaW4iLCJzZXJ2aWNlIiwia2V5Iiwic3luY1JlbW90ZUZpZWxkc0JlZm9yZVN1Ym1pdCIsImZvcm1EYXRhIiwiZm9yRWFjaCIsImlzIiwiJGJ0biIsIiRyZXN1bHQiLCJyZW5kZXJSZXN1bHQiLCJwcm9iZSIsImZhbGxiYWNrRXJyIiwicmVtb3ZlQ2xhc3MiLCJvayIsIm9rTGFiZWwiLCJtb2RfY3RpX1JlbW90ZVRlc3RPayIsImFyY2giLCJyd0xhYmVsIiwibW9kX2N0aV9SZW1vdGVUZXN0UndPayIsImNzcyIsImZhaWxMYWJlbCIsIm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwiLCJlcnIiLCJlcnJvciIsIm9mZiIsIm9uIiwiZSIsInByZXZlbnREZWZhdWx0IiwiYWRkQ2xhc3MiLCJtb2RfY3RpX1JlbW90ZVRlc3RSdW5uaW5nIiwicmF3S2V5Iiwia2V5Rm9yUG9zdCIsImluZGV4T2YiLCJhamF4IiwidXJsIiwiQ29uZmlnIiwicGJ4VXJsIiwibWV0aG9kIiwiY29udGVudFR5cGUiLCJkYXRhVHlwZSIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiaG9zdCIsInBvcnQiLCJsb2dpbiIsImJhc2UiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJtc2ciLCJtZXNzYWdlcyIsInhociIsInN0YXR1cyIsImRvY3VtZW50IiwiY3VycmVudFRhcmdldCIsInN2YyIsImhhc0NsYXNzIiwiY29uZmlybU1zZyIsIm1vZF9jdGlfRmFpbGJhY2tDb25maXJtIiwiY29uZmlybSIsIm1vZF9jdGlfRmFpbGJhY2tGYWlsZWQiLCJmaWVsZE1hcCIsImZpZWxkIiwiJGNiIiwic2V0VGltZW91dCIsImFsZXJ0IiwibW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyIiwicmVtb3ZlIiwidmFsdWUiLCIkY2hvaWNlIiwiZm9ybSIsImNiQmVmb3JlU2VuZEZvcm0iLCJzZXR0aW5ncyIsInJlc3VsdCIsImNiQWZ0ZXJTZW5kRm9ybSIsImdsb2JhbFJvb3RVcmwiLCJmbiIsImVtcHR5Q3VzdG9tUnVsZSIsIndyb25nUG9ydEN1c3RvbVJ1bGUiLCJpbnRlZ2VyIiwicmVhZHkiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQSxJQUFNQSxlQUFlLEdBQUc7QUFDdkJDLEVBQUFBLFNBQVMsRUFBRUMsQ0FBQyxDQUFDLDBCQUFELENBRFc7QUFFdkJDLEVBQUFBLGNBQWMsRUFBRUQsQ0FBQyxDQUFDLDRDQUFELENBRk07QUFHdkJFLEVBQUFBLGFBQWEsRUFBRUYsQ0FBQyxDQUFDLHVCQUFELENB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LENBQXlCOEksT0FBekIsQ0FBaUNYLEtBQWpDLEVBQXdDLFVBQXhDLENBQVA7QUFDQTs7QUFDRCxTQUFPLElBQVA7QUFDQSxDQVBEOztBQVNBL0osQ0FBQyxDQUFDZ0osUUFBRCxDQUFELENBQVkyQixLQUFaLENBQWtCLFlBQU07QUFDdkI3SyxFQUFBQSxlQUFlLENBQUN1QyxVQUFoQjtBQUNBLENBRkQiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSBNSUtPIExMQyAtIEFsbCBSaWdodHMgUmVzZXJ2ZWRcbiAqIFVuYXV0aG9yaXplZCBjb3B5aW5nIG9mIHRoaXMgZmlsZSwgdmlhIGFueSBtZWRpdW0gaXMgc3RyaWN0bHkgcHJvaGliaXRlZFxuICogUHJvcHJpZXRhcnkgYW5kIGNvbmZpZGVudGlhbFxuICogV3JpdHRlbiBieSBOaWtvbGF5IEJla2V0b3YsIDExIDIwMThcbiAqXG4gKi9cblxuY29uc3QgbW9kdWxlQ1RJQ2xpZW50ID0ge1xuXHQkd3NUb2dnbGU6ICQoJyN3ZWItc2VydmljZS1tb2RlLXRvZ2dsZScpLFxuXHQkd3NUb2dnbGVSYWRpbzogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLndlYi1zZXJ2aWNlLXJhZGlvJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkY2FsbGVySWRTZXR1cFRvZ2dsZTogJCgnI3NldHVwLWNhbGxlci1pZC10b2dnbGUnKSxcblx0JGNhbGxlcklkVHJhbnNsaXRlcmF0aW9uVG9nZ2xlQmxvY2s6ICQoJyN0cmFuc2xpdGVyYXRlLWNhbGxlci1pZC10b2dnbGUtYmxvY2snKSxcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNjdGktc3RhdHVzLXN1bW1hcnknKSxcblx0JHJlbW90ZU1pZ3JhdGlvbkxvY2tNZXNzYWdlOiAkKCcjY3RpLXJlbW90ZS1taWdyYXRpb24tbG9jay1tZXNzYWdlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRhdXRvU2V0dGluZ3NUb2dnbGU6ICQoJyNhdXRvLXNldHRpbmdzLW1vZGUtdG9nZ2xlJyksXG5cdCRvbmx5QXV0b1NldHRpbmdzVmlzaWJsZTogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLm9ubHktYXV0by1zZXR0aW5ncycpLFxuXHQkb25seU1hbnVhbFNldHRpbmdzVmlzaWJsZTogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLm9ubHktbWFudWFsLXNldHRpbmdzJyksXG5cdCR3c09ubHlGaWVsZHM6ICQoJy53cy1vbmx5JyksXG5cdCRkaXJydHlGaWVsZDogJCgnI2RpcnJ0eScpLFxuXHQkc3NsTW9kZVNlbGVjdDogJCgnLnNlcnZlcjFjX3NjaGVtZSBzZWxlY3QnKSxcblx0JGRlYnVnVGFiOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtdGFicyAuaXRlbVtkYXRhLXRhYj1cImRlYnVnXCJdJyksXG5cdHJlbW90ZU1pZ3JhdGlvbkxvY2tlZDogZmFsc2UsXG5cdHJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlczogW10sXG5cdHJlbW90ZU1pZ3JhdGlvbkxvY2tMaXN0ZW5lckJvdW5kOiBmYWxzZSxcblx0cmVtb3RlUHJvdGVjdGVkRmllbGRJZHM6IFtcblx0XHQncmVtb3RlX2hvc3QnLFxuXHRcdCdyZW1vdGVfc3NoX3BvcnQnLFxuXHRcdCdyZW1vdGVfc3NoX2xvZ2luJyxcblx0XHQncmVtb3RlX3NzaF9rZXknLFxuXHRcdCdyZW1vdGVfYmluX2RpcicsXG5cdF0sXG5cdHJlbW90ZVRvZ2dsZUZpZWxkSWRzOiBbJ3JlbW90ZV93aGF0c2FwcCcsICdyZW1vdGVfdGVsZWdyYW0nLCAncmVtb3RlX21heCddLFxuXHRyZW1vdGVTZXJ2aWNlTGFiZWxLZXlzOiB7XG5cdFx0Y2hhdHM6ICdtb2RfY3RpX3N2Y19jaGF0cycsXG5cdFx0dGc6ICdtb2RfY3RpX3N2Y190ZycsXG5cdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0fSxcblx0dmFsaWRhdGVSdWxlczoge1xuXHRcdHNlcnZlcjFjaG9zdDoge1xuXHRcdFx0aWRlbnRpZmllcjogJ3NlcnZlcjFjaG9zdCcsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2VtcHR5Q3VzdG9tUnVsZScsXG5cdFx0XHRcdFx0cHJvbXB0OiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDSG9zdEVtcHR5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdHNlcnZlcjFjcG9ydDoge1xuXHRcdFx0aWRlbnRpZmllcjogJ3NlcnZlcjFjcG9ydCcsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3dyb25nUG9ydEN1c3RvbVJ1bGUnLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVTZXJ2ZXIxQ1BvcnRSYW5nZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRkYXRhYmFzZToge1xuXHRcdFx0aWRlbnRpZmllcjogJ2RhdGFiYXNlJyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnZW1wdHlDdXN0b21SdWxlJyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlUHViTmFtZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0fSxcblx0aW5pdGlhbGl6ZSgpIHtcblx0XHQkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSAuaXRlbScpLnRhYigpO1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGRlYnVnVG9nZ2xlLmNoZWNrYm94KCdpcyB1bmNoZWNrZWQnKSl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLmhpZGUoKVxuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVG9nZ2xlXG5cdFx0XHQuY2hlY2tib3goe1xuXHRcdFx0XHRvbkNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkZWJ1Z1RhYi5zaG93KClcblx0XHRcdFx0fSxcblx0XHRcdFx0b25VbmNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkZWJ1Z1RhYi5oaWRlKClcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cblx0XHRtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkU2V0dXBUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hhbmdlOiBtb2R1bGVDVElDbGllbnQuc2V0Q2FsbGVySWRUb2dnbGVcblx0XHRcdH0pO1xuXG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLmhpZGUoKTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlLnNob3coKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuaGlkZSgpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudmFsKE1hdGgucmFuZG9tKCkpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudHJpZ2dlcignY2hhbmdlJyk7XG5cdFx0XHRcdFx0Rm9ybS52YWxpZGF0ZVJ1bGVzID0ge307XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uVW5jaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudmFsKE1hdGgucmFuZG9tKCkpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGlycnR5RmllbGQudHJpZ2dlcignY2hhbmdlJyk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRvbmx5QXV0b1NldHRpbmdzVmlzaWJsZS5oaWRlKCk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRvbmx5TWFudWFsU2V0dGluZ3NWaXNpYmxlLnNob3coKTtcblx0XHRcdFx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSBtb2R1bGVDVElDbGllbnQudmFsaWRhdGVSdWxlcztcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuZW5hYmxlV3NGaWVsZHMoKTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZVJhZGlvXG5cdFx0XHQuY2hlY2tib3goe1xuXHRcdFx0XHRvbkNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC52YWwoTWF0aC5yYW5kb20oKSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRkaXJydHlGaWVsZC50cmlnZ2VyKCdjaGFuZ2UnKTtcblx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZW5hYmxlV3NGaWVsZHMoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LmRpc2FibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kc3NsTW9kZVNlbGVjdC5kcm9wZG93bih7XG5cdFx0XHRvbkNoYW5nZTogbW9kdWxlQ1RJQ2xpZW50LmNiU3NsTW9kZU9uQ2hhbmdlXG5cdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVGb3JtKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmNoZWNrU3RhdHVzVG9nZ2xlKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnNldENhbGxlcklkVG9nZ2xlKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemVSZW1vdGVDb25uZWN0aW9uVGVzdCgpO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5pbml0aWFsaXplUmVtb3RlRmFpbGJhY2soKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignTW9kdWxlU3RhdHVzQ2hhbmdlZCcsIG1vZHVsZUNUSUNsaWVudC5jaGVja1N0YXR1c1RvZ2dsZSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9C+0LTQv9C40YHQutCwINC90LAg0YHRgtCw0YLRg9GBINCw0LrRgtC40LLQvdC+0Lkg0LzQuNCz0YDQsNGG0LjQuCDQvNC10YHRgdC10L3QtNC20LXRgNC+0LIuXG5cdCAqL1xuXHRpbml0aWFsaXplUmVtb3RlTWlncmF0aW9uTG9jaygpIHtcblx0XHRpZiAoIW1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrTGlzdGVuZXJCb3VuZCkge1xuXHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXG5cdFx0XHRcdCdSZW1vdGVNaWdyYXRpb25Mb2NrQ2hhbmdlZCcsXG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5zZXRSZW1vdGVNaWdyYXRpb25Mb2NrLFxuXHRcdFx0KTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrTGlzdGVuZXJCb3VuZCA9IHRydWU7XG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC5hcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKTtcblx0fSxcblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQuNGC0Ywg0YHQvtGB0YLQvtGP0L3QuNC1INCx0LvQvtC60LjRgNC+0LLQutC4IHJlbW90ZS9WUFMg0L/QvtC70LXQuS5cblx0ICogQHBhcmFtIHtDdXN0b21FdmVudH0gZXZlbnRcblx0ICovXG5cdHNldFJlbW90ZU1pZ3JhdGlvbkxvY2soZXZlbnQpIHtcblx0XHRjb25zdCBkZXRhaWwgPSAoZXZlbnQgJiYgZXZlbnQuZGV0YWlsKSA/IGV2ZW50LmRldGFpbCA6IHt9O1xuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgPSBkZXRhaWwuYWN0aXZlID09PSB0cnVlO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrU2VydmljZXMgPSBBcnJheS5pc0FycmF5KGRldGFpbC5zZXJ2aWNlcylcblx0XHRcdD8gZGV0YWlsLnNlcnZpY2VzIDogW107XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmFwcGx5UmVtb3RlTWlncmF0aW9uTG9jaygpO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC40LzQtdC90LjRgtGMINGC0LXQutGD0YnRg9GOINCx0LvQvtC60LjRgNC+0LLQutGDINC6INC/0L7Qu9GP0Lwg0YTQvtGA0LzRiyDQsdC10LcgZGlzYWJsZWQt0LDRgtGA0LjQsdGD0YLQvtCyOlxuXHQgKiB2YWx1ZXMg0LTQvtC70LbQvdGLINC/0YDQvtC00L7Qu9C20LDRgtGMINC+0YLQv9GA0LDQstC70Y/RgtGM0YHRjyDQv9GA0Lgg0YHQvtGF0YDQsNC90LXQvdC40Lgg0LTRgNGD0LPQuNGFINC90LDRgdGC0YDQvtC10LouXG5cdCAqL1xuXHRhcHBseVJlbW90ZU1pZ3JhdGlvbkxvY2soKSB7XG5cdFx0Y29uc3QgbG9ja2VkID0gbW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tlZCA9PT0gdHJ1ZTtcblx0XHRjb25zdCAkcmVtb3RlSW5wdXRzID0gbW9kdWxlQ1RJQ2xpZW50LmdldFJlbW90ZVByb3RlY3RlZElucHV0cygpO1xuXHRcdGNvbnN0ICRyZW1vdGVUb2dnbGVzID0gbW9kdWxlQ1RJQ2xpZW50LmdldFJlbW90ZVRvZ2dsZUlucHV0cygpO1xuXHRcdGNvbnN0ICRyZW1vdGVUZXN0QnV0dG9uID0gJCgnI2N0aS10ZXN0LXJlbW90ZS1jb25uJyk7XG5cblx0XHQkcmVtb3RlSW5wdXRzXG5cdFx0XHQucHJvcCgncmVhZG9ubHknLCBsb2NrZWQpXG5cdFx0XHQuYXR0cignYXJpYS1kaXNhYmxlZCcsIGxvY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpXG5cdFx0XHQuY2xvc2VzdCgnLmZpZWxkJylcblx0XHRcdC50b2dnbGVDbGFzcygnY3RpLXJlbW90ZS1maWVsZC1sb2NrZWQnLCBsb2NrZWQpO1xuXHRcdGlmIChsb2NrZWQpIHtcblx0XHRcdCRyZW1vdGVJbnB1dHMuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHJlbW90ZUlucHV0cy5yZW1vdmVBdHRyKCd0YWJpbmRleCcpO1xuXHRcdH1cblxuXHRcdCRyZW1vdGVUb2dnbGVzXG5cdFx0XHQuYXR0cignYXJpYS1kaXNhYmxlZCcsIGxvY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpXG5cdFx0XHQuY2xvc2VzdCgnLnVpLnNlZ21lbnQnKVxuXHRcdFx0LnRvZ2dsZUNsYXNzKCdjdGktcmVtb3RlLWZpZWxkLWxvY2tlZCcsIGxvY2tlZCk7XG5cdFx0aWYgKGxvY2tlZCkge1xuXHRcdFx0JHJlbW90ZVRvZ2dsZXMuYXR0cigndGFiaW5kZXgnLCAnLTEnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHJlbW90ZVRvZ2dsZXMucmVtb3ZlQXR0cigndGFiaW5kZXgnKTtcblx0XHR9XG5cblx0XHQkcmVtb3RlVGVzdEJ1dHRvblxuXHRcdFx0LnRvZ2dsZUNsYXNzKCdkaXNhYmxlZCcsIGxvY2tlZClcblx0XHRcdC5hdHRyKCdhcmlhLWRpc2FibGVkJywgbG9ja2VkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRyZW1vdGVNaWdyYXRpb25Mb2NrTWVzc2FnZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlVGV4dCA9IG1vZHVsZUNUSUNsaWVudC5mb3JtYXRSZW1vdGVNaWdyYXRpb25TZXJ2aWNlcyhcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZU1pZ3JhdGlvbkxvY2tTZXJ2aWNlcyxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBiYXNlVGV4dCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZU1pZ3JhdGlvbkxvY2tlZFxuXHRcdFx0XHR8fCAnTWVzc2VuZ2VyIG1pZ3JhdGlvbiBpcyBpbiBwcm9ncmVzcy4gUmVtb3RlIHNldHRpbmdzIGFyZSBsb2NrZWQgdW50aWwgaXQgZmluaXNoZXMuJztcblx0XHRcdGNvbnN0IHRleHQgPSBzZXJ2aWNlVGV4dCA9PT0gJycgPyBiYXNlVGV4dCA6IGAke2Jhc2VUZXh0fSAoJHtzZXJ2aWNlVGV4dH0pYDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kcmVtb3RlTWlncmF0aW9uTG9ja01lc3NhZ2UuZmluZCgncCcpLnRleHQodGV4dCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJHJlbW90ZU1pZ3JhdGlvbkxvY2tNZXNzYWdlLnRvZ2dsZShsb2NrZWQpO1xuXHRcdH1cblx0fSxcblx0LyoqXG5cdCAqIEByZXR1cm5zIHtqUXVlcnl9XG5cdCAqL1xuXHRnZXRSZW1vdGVQcm90ZWN0ZWRJbnB1dHMoKSB7XG5cdFx0cmV0dXJuICQobW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVByb3RlY3RlZEZpZWxkSWRzLm1hcCgoaWQpID0+IGAjJHtpZH1gKS5qb2luKCcsJykpO1xuXHR9LFxuXHQvKipcblx0ICogQHJldHVybnMge2pRdWVyeX1cblx0ICovXG5cdGdldFJlbW90ZVRvZ2dsZUlucHV0cygpIHtcblx0XHRyZXR1cm4gJChtb2R1bGVDVElDbGllbnQucmVtb3RlVG9nZ2xlRmllbGRJZHMubWFwKChpZCkgPT4gYCMke2lkfWApLmpvaW4oJywnKSk7XG5cdH0sXG5cdC8qKlxuXHQgKiBAcGFyYW0ge3N0cmluZ1tdfSBzZXJ2aWNlc1xuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0Zm9ybWF0UmVtb3RlTWlncmF0aW9uU2VydmljZXMoc2VydmljZXMpIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc2VydmljZXMpIHx8IHNlcnZpY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VydmljZXMubWFwKChzZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSBtb2R1bGVDVElDbGllbnQucmVtb3RlU2VydmljZUxhYmVsS2V5c1tzZXJ2aWNlXTtcblx0XHRcdGlmIChrZXkgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlcnZpY2U7XG5cdFx0fSkuam9pbignLCAnKTtcblx0fSxcblx0LyoqXG5cdCAqIFByZXNlcnZlIGxvY2tlZCByZW1vdGUgdmFsdWVzIGluIFBPU1QgZGF0YSB3aGVuIHNhdmluZyB1bnJlbGF0ZWQgc2V0dGluZ3MuXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBmb3JtRGF0YVxuXHQgKiBAcmV0dXJucyB7T2JqZWN0fVxuXHQgKi9cblx0c3luY1JlbW90ZUZpZWxkc0JlZm9yZVN1Ym1pdChmb3JtRGF0YSkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQucmVtb3RlTWlncmF0aW9uTG9ja2VkICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZm9ybURhdGE7XG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC5yZW1vdGVQcm90ZWN0ZWRGaWVsZElkcy5mb3JFYWNoKChpZCkgPT4ge1xuXHRcdFx0Zm9ybURhdGFbaWRdID0gJChgIyR7aWR9YCkudmFsKCkgfHwgJyc7XG5cdFx0fSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LnJlbW90ZVRvZ2dsZUZpZWxkSWRzLmZvckVhY2goKGlkKSA9PiB7XG5cdFx0XHRmb3JtRGF0YVtpZF0gPSAkKGAjJHtpZH1gKS5pcygnOmNoZWNrZWQnKSA/ICdvbicgOiAnJztcblx0XHR9KTtcblx0XHRyZXR1cm4gZm9ybURhdGE7XG5cdH0sXG5cdC8qKlxuXHQgKiDQmtC90L7Qv9C60LAgwqvQn9GA0L7QstC10YDQuNGC0Ywg0L/QvtC00LrQu9GO0YfQtdC90LjQtcK7INC90LAg0LLQutC70LDQtNC60LUg0KPQtNCw0LvRkdC90L3Ri9C1INC80LXRgdGB0LXQvdC00LbQtdGA0Ysg4oCUXG5cdCAqINCx0LXRgNGR0YIg0LfQvdCw0YfQtdC90LjRjyDRhNC+0YDQvNGLIChob3N0L3BvcnQvbG9naW4va2V5KSwgUE9TVNC40YIg0L3QsCDQsdC10LrQtdC90LQsXG5cdCAqINC/0L7QutCw0LfRi9Cy0LDQtdGCINGA0LXQt9GD0LvRjNGC0LDRgiBpbmxpbmUuINCh0L7RhdGA0LDQvdC10L3QuNC1INC90LUg0LTQtdC70LDQtdGCLlxuXHQgKi9cblx0aW5pdGlhbGl6ZVJlbW90ZUNvbm5lY3Rpb25UZXN0KCkge1xuXHRcdGNvbnN0ICRidG4gPSAkKCcjY3RpLXRlc3QtcmVtb3RlLWNvbm4nKTtcblx0XHRjb25zdCAkcmVzdWx0ID0gJCgnI2N0aS10ZXN0LXJlbW90ZS1jb25uLXJlc3VsdCcpO1xuXHRcdGlmICgkYnRuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJSZXN1bHQgPSAocHJvYmUsIGZhbGxiYWNrRXJyKSA9PiB7XG5cdFx0XHQkYnRuLnJlbW92ZUNsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuYXBwbHlSZW1vdGVNaWdyYXRpb25Mb2NrKCk7XG5cdFx0XHRpZiAocHJvYmUgJiYgcHJvYmUub2sgPT09IHRydWUpIHtcblx0XHRcdFx0Y29uc3Qgb2tMYWJlbCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZVRlc3RPayB8fCAnQ29ubmVjdGlvbiBPSyc7XG5cdFx0XHRcdGNvbnN0IGFyY2ggPSBwcm9iZS5hcmNoID8gYCAke3Byb2JlLmFyY2h9YCA6ICcnO1xuXHRcdFx0XHRjb25zdCByd0xhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdFJ3T2sgfHwgJ3J3IE9LJztcblx0XHRcdFx0JHJlc3VsdC5jc3MoJ2NvbG9yJywgJyMyMWJhNDUnKS50ZXh0KGAke29rTGFiZWx9IOKAlCR7YXJjaH0sICR7cndMYWJlbH1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZmFpbExhYmVsID0gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfUmVtb3RlVGVzdEZhaWwgfHwgJ0Nvbm5lY3Rpb24gZmFpbGVkJztcblx0XHRcdGNvbnN0IGVyciA9IChwcm9iZSAmJiBwcm9iZS5lcnJvcikgPyBwcm9iZS5lcnJvciA6IChmYWxsYmFja0VyciB8fCAnJyk7XG5cdFx0XHQkcmVzdWx0LmNzcygnY29sb3InLCAnI2RiMjgyOCcpLnRleHQoZXJyID8gYCR7ZmFpbExhYmVsfTogJHtlcnJ9YCA6IGZhaWxMYWJlbCk7XG5cdFx0fTtcblxuXHRcdCRidG4ub2ZmKCdjbGljay5jdGlSZW1vdGVUZXN0Jykub24oJ2NsaWNrLmN0aVJlbW90ZVRlc3QnLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudC5yZW1vdGVNaWdyYXRpb25Mb2NrZWQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0JGJ0bi5hZGRDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0JHJlc3VsdC5yZW1vdmVDbGFzcygnZ3JlZW4gcmVkJylcblx0XHRcdFx0LmNzcygnY29sb3InLCAnIzY2NicpXG5cdFx0XHRcdC50ZXh0KGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1JlbW90ZVRlc3RSdW5uaW5nIHx8ICdQcm9iaW5n4oCmJyk7XG5cdFx0XHQvLyBEb24ndCBzZW5kIHRoZSBtYXNrZWQgc2F2ZWQga2V5IGJhY2sgdG8gdGhlIHNlcnZlciDigJQgZW1wdHkga2V5XG5cdFx0XHQvLyB0ZWxscyB0aGUgYmFja2VuZCB0byBmYWxsIGJhY2sgdG8gdGhlIERCIHZhbHVlIHRyYW5zcGFyZW50bHkuXG5cdFx0XHRjb25zdCByYXdLZXkgPSAkKCcjcmVtb3RlX3NzaF9rZXknKS52YWwoKSB8fCAnJztcblx0XHRcdGNvbnN0IGtleUZvclBvc3QgPSByYXdLZXkuaW5kZXhPZignKioqKioqJykgIT09IC0xID8gJycgOiByYXdLZXk7XG5cdFx0XHQkLmFqYXgoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L3Rlc3RSZW1vdGVDb25uZWN0aW9uYCxcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdGRhdGFUeXBlOiAnanNvbicsXG5cdFx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRob3N0OiAkKCcjcmVtb3RlX2hvc3QnKS52YWwoKSB8fCAnJyxcblx0XHRcdFx0XHRwb3J0OiAkKCcjcmVtb3RlX3NzaF9wb3J0JykudmFsKCkgfHwgJycsXG5cdFx0XHRcdFx0bG9naW46ICQoJyNyZW1vdGVfc3NoX2xvZ2luJykudmFsKCkgfHwgJycsXG5cdFx0XHRcdFx0a2V5OiBrZXlGb3JQb3N0LFxuXHRcdFx0XHRcdGJhc2U6ICQoJyNyZW1vdGVfYmluX2RpcicpLnZhbCgpIHx8ICcnLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3VjY2VzcyhyZXNwb25zZSkge1xuXHRcdFx0XHRcdC8vIFBCWEFwaVJlc3VsdDogeyByZXN1bHQsIGRhdGE6IHtvaywgYXJjaCwgZXJyb3J9LCBtZXNzYWdlcywgLi4uIH1cblx0XHRcdFx0XHRjb25zdCBwcm9iZSA9IChyZXNwb25zZSAmJiByZXNwb25zZS5kYXRhKSA/IHJlc3BvbnNlLmRhdGEgOiBudWxsO1xuXHRcdFx0XHRcdGNvbnN0IG1zZyA9IChyZXNwb25zZSAmJiBBcnJheS5pc0FycmF5KHJlc3BvbnNlLm1lc3NhZ2VzKSAmJiByZXNwb25zZS5tZXNzYWdlcy5sZW5ndGggPiAwKVxuXHRcdFx0XHRcdFx0PyByZXNwb25zZS5tZXNzYWdlcy5qb2luKCc7ICcpIDogJyc7XG5cdFx0XHRcdFx0cmVuZGVyUmVzdWx0KHByb2JlLCBtc2cpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcih4aHIpIHtcblx0XHRcdFx0XHRyZW5kZXJSZXN1bHQobnVsbCwgYEhUVFAgJHt4aHIuc3RhdHVzIHx8ICdlcnJvcid9YCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSxcblx0LyoqXG5cdCAqIFBoYXNlIEM6INC+0L/QtdGA0LDRgtC+0YDRgdC60LjQuSBmYWlsYmFjayDQstGL0L3QtdGB0LXQvdC90L7Qs9C+INGB0LXRgNCy0LjRgdCwINC+0LHRgNCw0YLQvdC+INC90LAg0LvQvtC60LDQu9GMLlxuXHQgKiDQmtC90L7Qv9C60LAg0LbQuNCy0ZHRgiDQsiDQv9Cw0L3QtdC70Lgg0YHRgtCw0YLRg9GB0L7Qsiwg0LrQvtGC0L7RgNCw0Y8g0L/QtdGA0LXRgNC40YHQvtCy0YvQstCw0LXRgtGB0Y8g0L3QsCDQutCw0LbQtNC+0Lwg0L7Qv9GA0L7RgdC1LFxuXHQgKiDQv9C+0Y3RgtC+0LzRgyDRgdC70YPRiNCw0YLQtdC70Ywg0LTQtdC70LXQs9C40YDQvtCy0LDQvdC90YvQuSAo0L3QsCBkb2N1bWVudCkuINCR0Y3QutC10L3QtCDRgdC90LjQvNCw0LXRgiDRgtGD0LzQsdC70LXRgFxuXHQgKiAoZmVuY2UpINC4INC/0L7QtNC90LjQvNCw0LXRgiDQu9C+0LrQsNC70Ywg0LjQtyDQu9C+0LrQsNC70YzQvdC+0Lkg0LrQvtC/0LjQuCDRgdC10YHRgdC40LguXG5cdCAqL1xuXHRpbml0aWFsaXplUmVtb3RlRmFpbGJhY2soKSB7XG5cdFx0JChkb2N1bWVudCkub2ZmKCdjbGljay5jdGlGYWlsYmFjaycsICcuY3RpLWZhaWxiYWNrLWJ0bicpXG5cdFx0XHQub24oJ2NsaWNrLmN0aUZhaWxiYWNrJywgJy5jdGktZmFpbGJhY2stYnRuJywgKGUpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRjb25zdCAkYnRuID0gJChlLmN1cnJlbnRUYXJnZXQpO1xuXHRcdFx0XHRjb25zdCBzdmMgPSAkYnRuLmF0dHIoJ2RhdGEtc3ZjJykgfHwgJyc7XG5cdFx0XHRcdGlmIChzdmMgPT09ICcnIHx8ICRidG4uaGFzQ2xhc3MoJ2Rpc2FibGVkJykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29uZmlybU1zZyA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0ZhaWxiYWNrQ29uZmlybVxuXHRcdFx0XHRcdHx8ICdCcmluZyB0aGlzIHNlcnZpY2UgYmFjayB0byBsb2NhbCBmcm9tIHRoZSBsYXN0IGxvY2FsIGNvcHk/ICdcblx0XHRcdFx0XHRcdCsgJ1RoZSBWUFMgd2lsbCBiZSB0dXJuZWQgb2ZmIGZvciBpdC4nO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYWxlcnRcblx0XHRcdFx0aWYgKCF3aW5kb3cuY29uZmlybShjb25maXJtTXNnKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQkYnRuLmFkZENsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRcdGNvbnN0IGZhaWxMYWJlbCA9IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0ZhaWxiYWNrRmFpbGVkIHx8ICdGYWlsYmFjayBmYWlsZWQnO1xuXHRcdFx0XHQkLmFqYXgoe1xuXHRcdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvZmFpbGJhY2tgLFxuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0ZGF0YVR5cGU6ICdqc29uJyxcblx0XHRcdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHNlcnZpY2U6IHN2YyB9KSxcblx0XHRcdFx0XHRzdWNjZXNzKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvayA9IHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEgJiYgcmVzcG9uc2UuZGF0YS5vayA9PT0gdHJ1ZTtcblx0XHRcdFx0XHRcdGlmIChvaykge1xuXHRcdFx0XHRcdFx0XHQvLyBNaXJyb3IgdGhlIGZlbmNlIGludG8gdGhlIG9wZW4gc2V0dGluZ3MgZm9ybTogdGhlIGJhY2tlbmRcblx0XHRcdFx0XHRcdFx0Ly8gYWxyZWFkeSBjbGVhcmVkIHRoZSByZW1vdGUgdG9nZ2xlIGluIHRoZSBEQiwgYnV0IGEgbGF0ZXJcblx0XHRcdFx0XHRcdFx0Ly8gc2V0dGluZ3Mgc2F2ZSB3b3VsZCByZS1wb3N0IHRoZSBzdGlsbC1jaGVja2VkIGJveCBhbmQgdW5kb1xuXHRcdFx0XHRcdFx0XHQvLyBpdCDigJQgc28gdW5jaGVjayBpdCBoZXJlIHRvby5cblx0XHRcdFx0XHRcdFx0Y29uc3QgZmllbGRNYXAgPSB7IGNoYXRzOiAncmVtb3RlX3doYXRzYXBwJywgdGc6ICdyZW1vdGVfdGVsZWdyYW0nLCBtYXg6ICdyZW1vdGVfbWF4JyB9O1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmaWVsZCA9IGZpZWxkTWFwW3N2Y107XG5cdFx0XHRcdFx0XHRcdGlmIChmaWVsZCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0ICRjYiA9ICQoYCMke2ZpZWxkfWApO1xuXHRcdFx0XHRcdFx0XHRcdCRjYi5wcm9wKCdjaGVja2VkJywgZmFsc2UpO1xuXHRcdFx0XHRcdFx0XHRcdCRjYi5jbG9zZXN0KCcudWkuY2hlY2tib3gnKS5jaGVja2JveCgnc2V0IHVuY2hlY2tlZCcpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdC8vIExlYXZlIHRoZSBidXR0b24gYnVzeTsgdGhlIHN0YXR1cyB3b3JrZXIgcmUtcG9sbHMgd2l0aGluXG5cdFx0XHRcdFx0XHRcdC8vIGEgZmV3IHNlY29uZHMsIHRoZSBzZXJ2aWNlIGZsaXBzIHRvIGxvY2FsIGFuZCB0aGUgcm93XG5cdFx0XHRcdFx0XHRcdC8vICh3aXRoIGl0cyBidXR0b24pIGRpc2FwcGVhcnMgb24gdGhlIG5leHQgcmVuZGVyLlxuXHRcdFx0XHRcdFx0XHQvLyBTYWZldHkgbmV0OiBpZiB0aGUgcmUtcG9sbCBoYXNuJ3QgcmVtb3ZlZCB0aGUgcm93IHdpdGhpblxuXHRcdFx0XHRcdFx0XHQvLyB+MTVzIChiYWNrZW5kIGRpZG4ndCBjb252ZXJnZSksIGRyb3AgdGhlIGJ1c3kgc3RhdGUgc28gdGhlXG5cdFx0XHRcdFx0XHRcdC8vIG9wZXJhdG9yIGNhbiByZXRyeSBpbnN0ZWFkIG9mIGEgcGVybWFuZW50bHktc3Bpbm5pbmcgYnV0dG9uLlxuXHRcdFx0XHRcdFx0XHQvLyBOby1vcCBpZiB0aGUgcm93IHdhcyBhbHJlYWR5IHJlbW92ZWQgKGJ1dHRvbiBkZXRhY2hlZCkuXG5cdFx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdCRidG4ucmVtb3ZlQ2xhc3MoJ2xvYWRpbmcgZGlzYWJsZWQnKTtcblx0XHRcdFx0XHRcdFx0fSwgMTUwMDApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQkYnRuLnJlbW92ZUNsYXNzKCdsb2FkaW5nIGRpc2FibGVkJyk7XG5cdFx0XHRcdFx0XHRjb25zdCBtc2cgPSAocmVzcG9uc2UgJiYgQXJyYXkuaXNBcnJheShyZXNwb25zZS5tZXNzYWdlcykgJiYgcmVzcG9uc2UubWVzc2FnZXMubGVuZ3RoID4gMClcblx0XHRcdFx0XHRcdFx0PyByZXNwb25zZS5tZXNzYWdlcy5qb2luKCc7ICcpIDogJyc7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYWxlcnRcblx0XHRcdFx0XHRcdHdpbmRvdy5hbGVydChtc2cgPyBgJHtmYWlsTGFiZWx9OiAke21zZ31gIDogZmFpbExhYmVsKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGVycm9yKHhocikge1xuXHRcdFx0XHRcdFx0JGJ0bi5yZW1vdmVDbGFzcygnbG9hZGluZyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWFsZXJ0XG5cdFx0XHRcdFx0XHR3aW5kb3cuYWxlcnQoYCR7ZmFpbExhYmVsfTogSFRUUCAke3hoci5zdGF0dXMgfHwgJ2Vycm9yJ31gKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC+0LLQtdGA0LrQsCDRgdC+0YHRgtC+0Y/QvdC40Y8g0LzQvtC00YPQu9GPXG5cdCAqL1xuXHRjaGVja1N0YXR1c1RvZ2dsZSgpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JCgnLmRpc2FiaWxpdHknKS5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLnNob3coKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5pbml0aWFsaXplKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdCQoJy5kaXNhYmlsaXR5JykuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICog0J/QtdGA0LXQutC70Y7Rh9Cw0YLQtdC70Ywg0YPRgdGC0LDQvdC+0LLQutC4IENhbGxlcklEINC40LcgMdChXG5cdCAqINCf0YDRj9GH0LXRgiDQuNC70Lgg0L/QvtC60LDQt9GL0LLQsNC10YIg0YHRgtCw0YLRg9GBINGC0YDQsNC90YHQu9C40YLQtdGA0LDRhtC40Lhcblx0ICovXG5cdHNldENhbGxlcklkVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJGNhbGxlcklkU2V0dXBUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRjYWxsZXJJZFRyYW5zbGl0ZXJhdGlvblRvZ2dsZUJsb2NrLmhpZGUoKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQktC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINGA0LDQsdC+0YLRiyDRh9C10YDQtdC3IFdTXG5cdCAqL1xuXHRlbmFibGVXc0ZpZWxkcygpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuJHdzT25seUZpZWxkcy5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0fSxcblx0LyoqXG5cdCAqINCS0YvQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDRgNCw0LHQvtGC0Ysg0YfQtdGA0LXQtyBXU1xuXHQgKi9cblx0ZGlzYWJsZVdzRmllbGRzKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kd3NPbmx5RmllbGRzLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC4INC40LfQvNC10L3QtdC90LjQuCBTU0wg0YDQtdC20LjQvNCwXG5cdCAqIEBwYXJhbSB2YWx1ZVxuXHQgKiBAcGFyYW0gdGV4dFxuXHQgKiBAcGFyYW0gJGNob2ljZVxuXHQgKi9cblx0Y2JTc2xNb2RlT25DaGFuZ2UodmFsdWUsIHRleHQsICRjaG9pY2Upe1xuXHRcdGNvbnN0IHBvcnQgPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnZ2V0IHZhbHVlJywnc2VydmVyMWNwb3J0Jyk7XG5cdFx0aWYgKHZhbHVlPT09J2h0dHAnICYmIHBvcnQ9PT0nNDQzJyl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnc2V0IHZhbHVlJywnc2VydmVyMWNwb3J0JywgODApO1xuXHRcdH1cblx0XHRpZiAodmFsdWU9PT0naHR0cHMnICYmIHBvcnQ9PT0nODAnKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdzZXQgdmFsdWUnLCdzZXJ2ZXIxY3BvcnQnLCA0NDMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSxcblx0Y2JCZWZvcmVTZW5kRm9ybShzZXR0aW5ncykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNldHRpbmdzO1xuXHRcdHJlc3VsdC5kYXRhID0gbW9kdWxlQ1RJQ2xpZW50LiRmb3JtT2JqLmZvcm0oJ2dldCB2YWx1ZXMnKTtcblx0XHRyZXN1bHQuZGF0YSA9IG1vZHVsZUNUSUNsaWVudC5zeW5jUmVtb3RlRmllbGRzQmVmb3JlU3VibWl0KHJlc3VsdC5kYXRhKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9LFxuXHRjYkFmdGVyU2VuZEZvcm0oKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemUoKTtcblx0fSxcblx0aW5pdGlhbGl6ZUZvcm0oKSB7XG5cdFx0Rm9ybS4kZm9ybU9iaiA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iajtcblx0XHRGb3JtLnVybCA9IGAke2dsb2JhbFJvb3RVcmx9bW9kdWxlLWMtdC1pLWNsaWVudC9zYXZlYDtcblx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSBtb2R1bGVDVElDbGllbnQudmFsaWRhdGVSdWxlcztcblx0XHRGb3JtLmNiQmVmb3JlU2VuZEZvcm0gPSBtb2R1bGVDVElDbGllbnQuY2JCZWZvcmVTZW5kRm9ybTtcblx0XHRGb3JtLmNiQWZ0ZXJTZW5kRm9ybSA9IG1vZHVsZUNUSUNsaWVudC5jYkFmdGVyU2VuZEZvcm07XG5cdFx0Rm9ybS5pbml0aWFsaXplKCk7XG5cdH0sXG59O1xuXG5cbiQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy5lbXB0eUN1c3RvbVJ1bGUgPSBmdW5jdGlvbiAodmFsdWUpIHtcblx0aWYgKG1vZHVsZUNUSUNsaWVudC4kYXV0b1NldHRpbmdzVG9nZ2xlLmNoZWNrYm94KCdpcyB1bmNoZWNrZWQnKVxuXHRcdCYmIG1vZHVsZUNUSUNsaWVudC4kd3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKVxuXHRcdCYmIHZhbHVlID09PSAnJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbiQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy53cm9uZ1BvcnRDdXN0b21SdWxlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG5cdGlmIChtb2R1bGVDVElDbGllbnQuJGF1dG9TZXR0aW5nc1RvZ2dsZS5jaGVja2JveCgnaXMgdW5jaGVja2VkJylcblx0XHQmJiBtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJylcblx0KSB7XG5cdFx0cmV0dXJuICQuZm4uZm9ybS5zZXR0aW5ncy5ydWxlcy5pbnRlZ2VyKHZhbHVlLCAnMS4uNjU1MzUnKTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbiQoZG9jdW1lbnQpLnJlYWR5KCgpID0+IHtcblx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemUoKTtcbn0pO1xuIl19