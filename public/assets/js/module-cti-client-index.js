"use strict";

/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */

/* global globalRootUrl,globalTranslate, Form, Config, PbxApi */

/**
 * Тестирование соединения модуля с 1С
 */
var moduleCTIClientConnectionCheckWorker = {
  $formObj: $('#module-cti-client-form'),
  $statusToggle: $('#module-status-toggle'),
  $webServiceToggle: $('#web-service-mode-toggle'),
  $debugToggle: $('#debug-mode-toggle'),
  $moduleStatus: $('#status'),
  $submitButton: $('#submitbutton'),
  $debugInfo: $('#module-cti-client-form span#debug-info'),
  timeOut: 3000,
  timeOutHandle: '',
  errorCounts: 0,
  initialize: function initialize() {
    moduleCTIClientConnectionCheckWorker.restartWorker();
  },
  restartWorker: function restartWorker() {
    moduleCTIClientConnectionCheckWorker.changeStatus('Updating');
    window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeoutHandle);
    moduleCTIClientConnectionCheckWorker.worker();
  },
  worker: function worker() {
    if (moduleCTIClientConnectionCheckWorker.$statusToggle.checkbox('is checked')) {
      $.api({
        url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/check"),
        on: 'now',
        successTest: PbxApi.successTest,
        onComplete: function onComplete() {
          moduleCTIClientConnectionCheckWorker.timeoutHandle = window.setTimeout(moduleCTIClientConnectionCheckWorker.worker, moduleCTIClientConnectionCheckWorker.timeOut);
        },
        onResponse: function onResponse(response) {
          $('.message.ajax').remove(); // Debug mode

          if (typeof response.data !== 'undefined') {
            var visualErrorString = JSON.stringify(response.data, null, 2);

            if (typeof visualErrorString === 'string') {
              visualErrorString = visualErrorString.replace(/\n/g, '<br/>');

              if (Object.keys(response).length > 0 && response.result === true) {
                moduleCTIClientConnectionCheckWorker.$debugInfo.after("<div class=\"ui message ajax\">\t\t\n\t\t\t\t\t\t\t\t\t<pre style='white-space: pre-wrap'> ".concat(visualErrorString, "</pre>\t\t\t\t\t\t\t\t\t\t  \n\t\t\t\t\t\t\t\t</div>"));
              } else {
                moduleCTIClientConnectionCheckWorker.$debugInfo.after("<div class=\"ui message ajax\">\n\t\t\t\t\t\t\t\t\t<i class=\"spinner loading icon\"></i> \t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t<pre style='white-space: pre-wrap'>".concat(visualErrorString, "</pre>\t\t\t\t\t\t\t\t\t\t  \n\t\t\t\t\t\t\t\t</div>"));
              }
            }
          }
        },
        onSuccess: function onSuccess() {
          moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
          moduleCTIClientConnectionCheckWorker.errorCounts = 0;
        },
        onFailure: function onFailure(response) {
          if (Object.keys(response).length > 0 && response.result === false && typeof response.data !== 'undefined') {
            moduleCTIClientConnectionCheckWorker.errorCounts += 1;

            if (typeof response.data !== 'undefined' && typeof response.data.statuses !== 'undefined') {
              var countHealthy = 0;
              var status1C = 'undefined';
              $.each(response.data.statuses, function (key, value) {
                if (typeof value.name !== 'undefined' && value.state === 'ok') {
                  countHealthy++;
                }

                if (typeof value.name !== 'undefined' && value.name === 'crm-1c') {
                  status1C = value.state;
                }
              });

              if (status1C !== 'ok' && countHealthy === 5) {
                if (moduleCTIClientConnectionCheckWorker.$webServiceToggle.checkbox('is checked')) {
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CError');
                } else {
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CWait');
                }
              } else if (countHealthy < 5) {
                if (moduleCTIClientConnectionCheckWorker.errorCounts < 10) {
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
                } else {
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
                }
              }
            } else {
              // Unknown
              moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
            }
          } else {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
          }
        }
      });
    } else {
      moduleCTIClientConnectionCheckWorker.errorCounts = 0;
    }
  },

  /**
   * Обновление статуса модуля
   * @param status
   */
  changeStatus: function changeStatus(status) {
    moduleCTIClientConnectionCheckWorker.$moduleStatus.removeClass('grey').removeClass('yellow').removeClass('green').removeClass('red');

    switch (status) {
      case 'Connected':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('green').html(globalTranslate.mod_cti_Connected);
        break;

      case 'Disconnected':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('grey').html(globalTranslate.mod_cti_Disconnected);
        break;

      case 'ConnectionProgress':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('yellow').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_ConnectionProgress));
        break;

      case 'ConnectionTo1CWait':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('yellow').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_ConnectionWait));
        break;

      case 'ConnectionTo1CError':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('yellow').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_ConnectionTo1CError));
        break;

      case 'ConnectionError':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('red').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_ConnectionError));
        break;

      case 'Updating':
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('grey').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_UpdateStatus));
        break;

      default:
        moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('red').html(globalTranslate.mod_cti_ConnectionError);
        break;
    }
  }
};
var moduleCTIClient = {
  $wsToggle: $('#web-service-mode-toggle'),
  $wsToggleRadio: $('#module-cti-client-form .web-service-radio'),
  $statusToggle: $('#module-status-toggle'),
  $formObj: $('#module-cti-client-form'),
  $moduleStatus: $('#status'),
  $debugToggle: $('#debug-mode-toggle'),
  $autoSettingsToggle: $('#auto-settings-mode-toggle'),
  $onlyAutoSettingsVisible: $('#module-cti-client-form .only-auto-settings'),
  $onlyManualSettingsVisible: $('#module-cti-client-form .only-manual-settings'),
  $wsOnlyFields: $('.ws-only'),
  $debugTab: $('#module-cti-client-tabs .item[data-tab="debug"]'),
  validateRules: {
    server1chost: {
      depends: 'web_service_mode',
      identifier: 'server1chost',
      rules: [{
        type: 'empty',
        prompt: globalTranslate.mod_cti_ValidateServer1CHostEmpty
      }]
    },
    server1cport: {
      depends: 'web_service_mode',
      identifier: 'server1cport',
      rules: [{
        type: 'integer[0..65535]',
        prompt: globalTranslate.mod_cti_ValidateServer1CPortRange
      }]
    },
    database: {
      depends: 'web_service_mode',
      identifier: 'database',
      rules: [{
        type: 'empty',
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

    if (moduleCTIClient.$autoSettingsToggle.checkbox('is checked')) {
      moduleCTIClient.$onlyManualSettingsVisible.hide();
    } else {
      moduleCTIClient.$onlyAutoSettingsVisible.hide();
    }

    moduleCTIClient.$autoSettingsToggle.checkbox({
      onChecked: function onChecked() {
        moduleCTIClient.$onlyAutoSettingsVisible.show();
        moduleCTIClient.$onlyManualSettingsVisible.hide();
      },
      onUnchecked: function onUnchecked() {
        moduleCTIClient.$onlyAutoSettingsVisible.hide();
        moduleCTIClient.$onlyManualSettingsVisible.show();
      }
    });

    if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
      moduleCTIClient.enableWsFields();
    }

    moduleCTIClient.$wsToggleRadio.checkbox({
      onChecked: function onChecked() {
        if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
          moduleCTIClient.enableWsFields();
        } else {
          moduleCTIClient.disableWsFields();
        }
      }
    });
    moduleCTIClient.initializeForm();
    moduleCTIClient.checkStatusToggle();
    window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
  },

  /**
   * Проверка состояния модуля
   */
  checkStatusToggle: function checkStatusToggle() {
    if (moduleCTIClient.$statusToggle.checkbox('is checked')) {
      $('.disability').removeClass('disabled');
      moduleCTIClient.$moduleStatus.show();
      moduleCTIClientConnectionCheckWorker.errorCounts = 0;
      moduleCTIClientConnectionCheckWorker.initialize();
    } else {
      moduleCTIClient.$moduleStatus.hide();
      moduleCTIClient.$moduleStatus.hide();
      $('.disability').addClass('disabled');
      $('.message.ajax').remove();
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
   * Применение настроек модуля после изменения данных формы
   */
  applyConfigurationChanges: function applyConfigurationChanges() {
    $.api({
      url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/reload"),
      on: 'now',
      successTest: function successTest(response) {
        // test whether a JSON response is valid
        return Object.keys(response).length > 0 && response.result === true;
      },
      onSuccess: function onSuccess() {
        moduleCTIClientConnectionCheckWorker.initialize();
        moduleCTIClient.initialize();
      }
    });
  },
  cbBeforeSendForm: function cbBeforeSendForm(settings) {
    var result = settings;
    result.data = moduleCTIClient.$formObj.form('get values');
    return result;
  },
  cbAfterSendForm: function cbAfterSendForm() {
    moduleCTIClient.applyConfigurationChanges();
    moduleCTIClientConnectionCheckWorker.errorCounts = 0;
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
$(document).ready(function () {
  moduleCTIClient.initialize();
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIiLCIkZm9ybU9iaiIsIiQiLCIkc3RhdHVzVG9nZ2xlIiwiJHdlYlNlcnZpY2VUb2dnbGUiLCIkZGVidWdUb2dnbGUiLCIkbW9kdWxlU3RhdHVzIiwiJHN1Ym1pdEJ1dHRvbiIsIiRkZWJ1Z0luZm8iLCJ0aW1lT3V0IiwidGltZU91dEhhbmRsZSIsImVycm9yQ291bnRzIiwiaW5pdGlhbGl6ZSIsInJlc3RhcnRXb3JrZXIiLCJjaGFuZ2VTdGF0dXMiLCJ3aW5kb3ciLCJjbGVhclRpbWVvdXQiLCJ0aW1lb3V0SGFuZGxlIiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwidmlzdWFsRXJyb3JTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwicmVwbGFjZSIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJyZXN1bHQiLCJhZnRlciIsIm9uU3VjY2VzcyIsIm9uRmFpbHVyZSIsInN0YXR1c2VzIiwiY291bnRIZWFsdGh5Iiwic3RhdHVzMUMiLCJlYWNoIiwia2V5IiwidmFsdWUiLCJuYW1lIiwic3RhdGUiLCJzdGF0dXMiLCJyZW1vdmVDbGFzcyIsImFkZENsYXNzIiwiaHRtbCIsImdsb2JhbFRyYW5zbGF0ZSIsIm1vZF9jdGlfQ29ubmVjdGVkIiwibW9kX2N0aV9EaXNjb25uZWN0ZWQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzcyIsIm1vZF9jdGlfQ29ubmVjdGlvbldhaXQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3IiLCJtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvciIsIm1vZF9jdGlfVXBkYXRlU3RhdHVzIiwibW9kdWxlQ1RJQ2xpZW50IiwiJHdzVG9nZ2xlIiwiJHdzVG9nZ2xlUmFkaW8iLCIkYXV0b1NldHRpbmdzVG9nZ2xlIiwiJG9ubHlBdXRvU2V0dGluZ3NWaXNpYmxlIiwiJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUiLCIkd3NPbmx5RmllbGRzIiwiJGRlYnVnVGFiIiwidmFsaWRhdGVSdWxlcyIsInNlcnZlcjFjaG9zdCIsImRlcGVuZHMiLCJpZGVudGlmaWVyIiwicnVsZXMiLCJ0eXBlIiwicHJvbXB0IiwibW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDSG9zdEVtcHR5Iiwic2VydmVyMWNwb3J0IiwibW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDUG9ydFJhbmdlIiwiZGF0YWJhc2UiLCJtb2RfY3RpX1ZhbGlkYXRlUHViTmFtZSIsInRhYiIsImhpZGUiLCJvbkNoZWNrZWQiLCJzaG93Iiwib25VbmNoZWNrZWQiLCJlbmFibGVXc0ZpZWxkcyIsImRpc2FibGVXc0ZpZWxkcyIsImluaXRpYWxpemVGb3JtIiwiY2hlY2tTdGF0dXNUb2dnbGUiLCJhZGRFdmVudExpc3RlbmVyIiwiYXBwbHlDb25maWd1cmF0aW9uQ2hhbmdlcyIsImNiQmVmb3JlU2VuZEZvcm0iLCJzZXR0aW5ncyIsImZvcm0iLCJjYkFmdGVyU2VuZEZvcm0iLCJGb3JtIiwiZ2xvYmFsUm9vdFVybCIsImRvY3VtZW50IiwicmVhZHkiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsSUFBTUEsb0NBQW9DLEdBQUc7QUFDNUNDLEVBQUFBLFFBQVEsRUFBRUMsQ0FBQyxDQUFDLHlCQUFELENBRGlDO0FBRTVDQyxFQUFBQSxhQUFhLEVBQUVELENBQUMsQ0FBQyx1QkFBRCxDQUY0QjtBQUc1Q0UsRUFBQUEsaUJBQWlCLEVBQUVGLENBQUMsQ0FBQywwQkFBRCxDQUh3QjtBQUk1Q0csRUFBQUEsWUFBWSxFQUFFSCxDQUFDLENBQUMsb0JBQUQs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SnNCO0FBb0p2QmdGLEVBQUFBLGNBcEp1Qiw0QkFvSk47QUFDaEJRLElBQUFBLElBQUksQ0FBQ2xHLFFBQUwsR0FBZ0IrRCxlQUFlLENBQUMvRCxRQUFoQztBQUNBa0csSUFBQUEsSUFBSSxDQUFDOUUsR0FBTCxhQUFjK0UsYUFBZDtBQUNBRCxJQUFBQSxJQUFJLENBQUMzQixhQUFMLEdBQXFCUixlQUFlLENBQUNRLGFBQXJDO0FBQ0EyQixJQUFBQSxJQUFJLENBQUNKLGdCQUFMLEdBQXdCL0IsZUFBZSxDQUFDK0IsZ0JBQXhDO0FBQ0FJLElBQUFBLElBQUksQ0FBQ0QsZUFBTCxHQUF1QmxDLGVBQWUsQ0FBQ2tDLGVBQXZDO0FBQ0FDLElBQUFBLElBQUksQ0FBQ3ZGLFVBQUw7QUFDQTtBQTNKc0IsQ0FBeEI7QUE4SkFWLENBQUMsQ0FBQ21HLFFBQUQsQ0FBRCxDQUFZQyxLQUFaLENBQWtCLFlBQU07QUFDdkJ0QyxFQUFBQSxlQUFlLENBQUNwRCxVQUFoQjtBQUNBLENBRkQiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSBNSUtPIExMQyAtIEFsbCBSaWdodHMgUmVzZXJ2ZWRcbiAqIFVuYXV0aG9yaXplZCBjb3B5aW5nIG9mIHRoaXMgZmlsZSwgdmlhIGFueSBtZWRpdW0gaXMgc3RyaWN0bHkgcHJvaGliaXRlZFxuICogUHJvcHJpZXRhcnkgYW5kIGNvbmZpZGVudGlhbFxuICogV3JpdHRlbiBieSBOaWtvbGF5IEJla2V0b3YsIDExIDIwMThcbiAqXG4gKi9cblxuLyogZ2xvYmFsIGdsb2JhbFJvb3RVcmwsZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNzdGF0dXMnKSxcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxuXHQkZGVidWdJbmZvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSBzcGFuI2RlYnVnLWluZm8nKSxcblx0dGltZU91dDogMzAwMCxcblx0dGltZU91dEhhbmRsZTogJycsXG5cdGVycm9yQ291bnRzOiAwLFxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcblx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lb3V0SGFuZGxlKTtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyKCk7XG5cdH0sXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lb3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRcdFx0XHQvLyBEZWJ1ZyBtb2RlXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRsZXQgdmlzdWFsRXJyb3JTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXNwb25zZS5kYXRhLCBudWxsLCAyKTtcblxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0dmlzdWFsRXJyb3JTdHJpbmcgPSB2aXN1YWxFcnJvclN0cmluZy5yZXBsYWNlKC9cXG4vZywgJzxici8+Jyk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cdFx0XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiAke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlx0XHRcdFx0XHRcdFx0XHRcdFx0ICBcblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiBcdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+JHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cdFx0XHRcdFx0XHRcdFx0XHRcdCAgXG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZhaWx1cmUocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDBcblx0XHRcdFx0XHRcdCYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gZmFsc2Vcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgKz0gMTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0XHQmJiB0eXBlb2YgKHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdGxldCBjb3VudEhlYWx0aHkgPSAwO1xuXHRcdFx0XHRcdFx0XHRsZXQgc3RhdHVzMUMgPSAndW5kZWZpbmVkJztcblxuXHRcdFx0XHRcdFx0XHQkLmVhY2gocmVzcG9uc2UuZGF0YS5zdGF0dXNlcywgKGtleSwgdmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mICh2YWx1ZS5uYW1lKSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0XHRcdFx0XHQmJiB2YWx1ZS5zdGF0ZSA9PT0gJ29rJyl7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb3VudEhlYWx0aHkrKztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiAodmFsdWUubmFtZSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHRcdFx0XHQmJiB2YWx1ZS5uYW1lID09PSAnY3JtLTFjJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RhdHVzMUMgPSB2YWx1ZS5zdGF0ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRpZiAoc3RhdHVzMUMgIT09ICdvaycgJiYgY291bnRIZWFsdGh5ID09PSA1ICkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHdlYlNlcnZpY2VUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNFcnJvcicpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXQnKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoY291bnRIZWFsdGh5IDwgNSkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPCAxMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJyk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR9IGVsc2UgeyAvLyBVbmtub3duXG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQntCx0L3QvtCy0LvQtdC90LjQtSDRgdGC0LDRgtGD0YHQsCDQvNC+0LTRg9C70Y9cblx0ICogQHBhcmFtIHN0YXR1c1xuXHQgKi9cblx0Y2hhbmdlU3RhdHVzKHN0YXR1cykge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZXknKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCdncmVlbicpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3JlZCcpO1xuXG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgJ0Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmVlbicpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JleScpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRGlzY29ubmVjdGVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uUHJvZ3Jlc3MnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzc31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ1dhaXQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25XYWl0fWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3J9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3JlZCcpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3J9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnVXBkYXRpbmcnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JleScpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9VcGRhdGVTdGF0dXN9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3JlZCcpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9LFxufTtcblxuY29uc3QgbW9kdWxlQ1RJQ2xpZW50ID0ge1xuXHQkd3NUb2dnbGU6ICQoJyN3ZWItc2VydmljZS1tb2RlLXRvZ2dsZScpLFxuXHQkd3NUb2dnbGVSYWRpbzogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gLndlYi1zZXJ2aWNlLXJhZGlvJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI3N0YXR1cycpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkYXV0b1NldHRpbmdzVG9nZ2xlOiAkKCcjYXV0by1zZXR0aW5ncy1tb2RlLXRvZ2dsZScpLFxuXHQkb25seUF1dG9TZXR0aW5nc1Zpc2libGU6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5vbmx5LWF1dG8tc2V0dGluZ3MnKSxcblx0JG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGU6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5vbmx5LW1hbnVhbC1zZXR0aW5ncycpLFxuXHQkd3NPbmx5RmllbGRzOiAkKCcud3Mtb25seScpLFxuXHQkZGVidWdUYWI6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC10YWJzIC5pdGVtW2RhdGEtdGFiPVwiZGVidWdcIl0nKSxcblx0dmFsaWRhdGVSdWxlczoge1xuXHRcdHNlcnZlcjFjaG9zdDoge1xuXHRcdFx0ZGVwZW5kczogJ3dlYl9zZXJ2aWNlX21vZGUnLFxuXHRcdFx0aWRlbnRpZmllcjogJ3NlcnZlcjFjaG9zdCcsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2VtcHR5Jyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHksXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0c2VydmVyMWNwb3J0OiB7XG5cdFx0XHRkZXBlbmRzOiAnd2ViX3NlcnZpY2VfbW9kZScsXG5cdFx0XHRpZGVudGlmaWVyOiAnc2VydmVyMWNwb3J0Jyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnaW50ZWdlclswLi42NTUzNV0nLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVTZXJ2ZXIxQ1BvcnRSYW5nZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRkYXRhYmFzZToge1xuXHRcdFx0ZGVwZW5kczogJ3dlYl9zZXJ2aWNlX21vZGUnLFxuXHRcdFx0aWRlbnRpZmllcjogJ2RhdGFiYXNlJyxcblx0XHRcdHJ1bGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnZW1wdHknLFxuXHRcdFx0XHRcdHByb21wdDogZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHR9LFxuXHRpbml0aWFsaXplKCkge1xuXHRcdCQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIC5pdGVtJykudGFiKCk7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGUuY2hlY2tib3goJ2lzIHVuY2hlY2tlZCcpKXtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUYWIuaGlkZSgpXG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC4kZGVidWdUb2dnbGVcblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLnNob3coKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblVuY2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJGRlYnVnVGFiLmhpZGUoKVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiRhdXRvU2V0dGluZ3NUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSl7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuaGlkZSgpXG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuaGlkZSgpXG5cdFx0fVxuXHRcdG1vZHVsZUNUSUNsaWVudC4kYXV0b1NldHRpbmdzVG9nZ2xlXG5cdFx0XHQuY2hlY2tib3goe1xuXHRcdFx0XHRvbkNoZWNrZWQoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRvbmx5QXV0b1NldHRpbmdzVmlzaWJsZS5zaG93KClcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuJG9ubHlNYW51YWxTZXR0aW5nc1Zpc2libGUuaGlkZSgpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uVW5jaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC4kb25seUF1dG9TZXR0aW5nc1Zpc2libGUuaGlkZSgpXG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRvbmx5TWFudWFsU2V0dGluZ3NWaXNpYmxlLnNob3coKVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblxuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdH1cblx0XHRtb2R1bGVDVElDbGllbnQuJHdzVG9nZ2xlUmFkaW9cblx0XHRcdC5jaGVja2JveCh7XG5cdFx0XHRcdG9uQ2hlY2tlZCgpIHtcblx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZW5hYmxlV3NGaWVsZHMoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LmRpc2FibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5pbml0aWFsaXplRm9ybSgpO1xuXHRcdG1vZHVsZUNUSUNsaWVudC5jaGVja1N0YXR1c1RvZ2dsZSgpO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdNb2R1bGVTdGF0dXNDaGFuZ2VkJywgbW9kdWxlQ1RJQ2xpZW50LmNoZWNrU3RhdHVzVG9nZ2xlKTtcblx0fSxcblx0LyoqXG5cdCAqINCf0YDQvtCy0LXRgNC60LAg0YHQvtGB0YLQvtGP0L3QuNGPINC80L7QtNGD0LvRj1xuXHQgKi9cblx0Y2hlY2tTdGF0dXNUb2dnbGUoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudC4kc3RhdHVzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdCQoJy5kaXNhYmlsaXR5JykucmVtb3ZlQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuJG1vZHVsZVN0YXR1cy5zaG93KCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmluaXRpYWxpemUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuaGlkZSgpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuaGlkZSgpO1xuXHRcdFx0JCgnLmRpc2FiaWxpdHknKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcblx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHR9XG5cdH0sXG5cdC8qKlxuXHQgKiDQktC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINGA0LDQsdC+0YLRiyDRh9C10YDQtdC3IFdTXG5cdCAqL1xuXHRlbmFibGVXc0ZpZWxkcygpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuJHdzT25seUZpZWxkcy5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcblx0fSxcblx0LyoqXG5cdCAqINCS0YvQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDRgNCw0LHQvtGC0Ysg0YfQtdGA0LXQtyBXU1xuXHQgKi9cblx0ZGlzYWJsZVdzRmllbGRzKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC4kd3NPbmx5RmllbGRzLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuXHR9LFxuXHQvKipcblx0ICog0J/RgNC40LzQtdC90LXQvdC40LUg0L3QsNGB0YLRgNC+0LXQuiDQvNC+0LTRg9C70Y8g0L/QvtGB0LvQtSDQuNC30LzQtdC90LXQvdC40Y8g0LTQsNC90L3Ri9GFINGE0L7RgNC80Ytcblx0ICovXG5cdGFwcGx5Q29uZmlndXJhdGlvbkNoYW5nZXMoKSB7XG5cdFx0JC5hcGkoe1xuXHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9yZWxvYWRgLFxuXHRcdFx0b246ICdub3cnLFxuXHRcdFx0c3VjY2Vzc1Rlc3QocmVzcG9uc2UpIHtcblx0XHRcdFx0Ly8gdGVzdCB3aGV0aGVyIGEgSlNPTiByZXNwb25zZSBpcyB2YWxpZFxuXHRcdFx0XHRyZXR1cm4gT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UucmVzdWx0ID09PSB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmluaXRpYWxpemUoKTtcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50LmluaXRpYWxpemUoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0sXG5cdGNiQmVmb3JlU2VuZEZvcm0oc2V0dGluZ3MpIHtcblx0XHRjb25zdCByZXN1bHQgPSBzZXR0aW5ncztcblx0XHRyZXN1bHQuZGF0YSA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iai5mb3JtKCdnZXQgdmFsdWVzJyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSxcblx0Y2JBZnRlclNlbmRGb3JtKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudC5hcHBseUNvbmZpZ3VyYXRpb25DaGFuZ2VzKCk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0fSxcblx0aW5pdGlhbGl6ZUZvcm0oKSB7XG5cdFx0Rm9ybS4kZm9ybU9iaiA9IG1vZHVsZUNUSUNsaWVudC4kZm9ybU9iajtcblx0XHRGb3JtLnVybCA9IGAke2dsb2JhbFJvb3RVcmx9bW9kdWxlLWMtdC1pLWNsaWVudC9zYXZlYDtcblx0XHRGb3JtLnZhbGlkYXRlUnVsZXMgPSBtb2R1bGVDVElDbGllbnQudmFsaWRhdGVSdWxlcztcblx0XHRGb3JtLmNiQmVmb3JlU2VuZEZvcm0gPSBtb2R1bGVDVElDbGllbnQuY2JCZWZvcmVTZW5kRm9ybTtcblx0XHRGb3JtLmNiQWZ0ZXJTZW5kRm9ybSA9IG1vZHVsZUNUSUNsaWVudC5jYkFmdGVyU2VuZEZvcm07XG5cdFx0Rm9ybS5pbml0aWFsaXplKCk7XG5cdH0sXG59O1xuXG4kKGRvY3VtZW50KS5yZWFkeSgoKSA9PiB7XG5cdG1vZHVsZUNUSUNsaWVudC5pbml0aWFsaXplKCk7XG59KTtcblxuIl19