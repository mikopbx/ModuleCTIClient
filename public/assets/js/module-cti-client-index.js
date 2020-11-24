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
  $debugToggle: $('#debug-mode-toggle'),
  $moduleStatus: $('#status'),
  $submitButton: $('#submitbutton'),
  timeOut: 3000,
  timeOutHandle: '',
  errorCounts: 0,
  initialize: function () {
    function initialize() {
      moduleCTIClientConnectionCheckWorker.restartWorker();
    }

    return initialize;
  }(),
  restartWorker: function () {
    function restartWorker() {
      moduleCTIClientConnectionCheckWorker.changeStatus('Updating');
      window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeoutHandle);
      moduleCTIClientConnectionCheckWorker.worker();
    }

    return restartWorker;
  }(),
  worker: function () {
    function worker() {
      if (moduleCTIClientConnectionCheckWorker.$statusToggle.checkbox('is checked')) {
        $.api({
          url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/check"),
          on: 'now',
          successTest: PbxApi.successTest,
          onComplete: function () {
            function onComplete() {
              moduleCTIClientConnectionCheckWorker.timeoutHandle = window.setTimeout(moduleCTIClientConnectionCheckWorker.worker, moduleCTIClientConnectionCheckWorker.timeOut);
            }

            return onComplete;
          }(),
          onResponse: function () {
            function onResponse(response) {
              $('.message.ajax').remove(); // Debug mode

              if (moduleCTIClientConnectionCheckWorker.$debugToggle.checkbox('is checked') && moduleCTIClientConnectionCheckWorker.$submitButton.hasClass('disabled') && typeof response.data !== 'undefined') {
                var visualErrorString = JSON.stringify(response.data, null, 2);

                if (typeof visualErrorString === 'string') {
                  visualErrorString = visualErrorString.replace(/\n/g, '<br/>');

                  if (Object.keys(response).length > 0 && response.result === true) {
                    moduleCTIClientConnectionCheckWorker.$formObj.after("<div class=\"ui success message ajax\">\t\t\n\t\t\t\t\t\t\t\t\t<pre style='white-space: pre-wrap'>".concat(visualErrorString, "</pre>\t\t\t\t\t\t\t\t\t\t  \n\t\t\t\t\t\t\t\t</div>"));
                  } else {
                    moduleCTIClientConnectionCheckWorker.$formObj.after("<div class=\"ui error message ajax\">\n\t\t\t\t\t\t\t\t\t<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_trying, "\n\t\t\t\t\t\t\t\t\t").concat(moduleCTIClientConnectionCheckWorker.errorCounts, " ...\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t<pre style='white-space: pre-wrap'>").concat(visualErrorString, "</pre>\t\t\t\t\t\t\t\t\t\t  \n\t\t\t\t\t\t\t\t</div>"));
                  }
                }
              }
            }

            return onResponse;
          }(),
          onSuccess: function () {
            function onSuccess() {
              moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
              moduleCTIClientConnectionCheckWorker.errorCounts = 0;
            }

            return onSuccess;
          }(),
          onFailure: function () {
            function onFailure(response) {
              if (Object.keys(response).length > 0 && response.result === false && typeof response.data !== 'undefined') {
                moduleCTIClientConnectionCheckWorker.errorCounts += 1;

                if (typeof response.data !== 'undefined' && typeof response.data.statuses !== 'undefined') {
                  $.each(response.data.statuses, function (key, value) {
                    if (typeof value.name !== 'undefined' && value.name === 'crm-1c' && value.state !== 'ok') {
                      moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CError');
                    } else if (typeof value.state !== 'undefined' && value.state !== 'ok') {
                      if (moduleCTIClientConnectionCheckWorker.errorCounts < 5) {
                        moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
                      } else {
                        moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
                      }
                    }
                  });
                } else {
                  // Unknown
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
                }
              } else {
                moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
              }
            }

            return onFailure;
          }()
        });
      } else {
        moduleCTIClientConnectionCheckWorker.errorCounts = 0;
      }
    }

    return worker;
  }(),

  /**
   * Обновление статуса модуля
   * @param status
   */
  changeStatus: function () {
    function changeStatus(status) {
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

        case 'ConnectionTo1CError':
          moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('yellow').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_trying, " ").concat(moduleCTIClientConnectionCheckWorker.errorCounts, "... ").concat(globalTranslate.mod_cti_ConnectionTo1CError));
          break;

        case 'ConnectionError':
          moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('red').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_trying, " ").concat(moduleCTIClientConnectionCheckWorker.errorCounts, "... ").concat(globalTranslate.mod_cti_ConnectionError));
          break;

        case 'Updating':
          moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('grey').html("<i class=\"spinner loading icon\"></i>".concat(globalTranslate.mod_cti_UpdateStatus));
          break;

        default:
          moduleCTIClientConnectionCheckWorker.$moduleStatus.addClass('red').html(globalTranslate.mod_cti_ConnectionError);
          break;
      }
    }

    return changeStatus;
  }()
};
var moduleCTIClient = {
  $wsToggle: $('#web-service-mode-toggle'),
  $statusToggle: $('#module-status-toggle'),
  $formObj: $('#module-cti-client-form'),
  $moduleStatus: $('#status'),
  $wsOnlyFields: $('.ws-only'),
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
  initialize: function () {
    function initialize() {
      if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
        moduleCTIClient.enableWsFields();
      }

      moduleCTIClient.$wsToggle.checkbox({
        onChecked: function () {
          function onChecked() {
            moduleCTIClient.enableWsFields();
          }

          return onChecked;
        }(),
        onUnchecked: function () {
          function onUnchecked() {
            moduleCTIClient.disableWsFields();
          }

          return onUnchecked;
        }()
      });
      moduleCTIClient.initializeForm();
      moduleCTIClient.checkStatusToggle();
      window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
    }

    return initialize;
  }(),

  /**
   * Проверка состояния модуля
   */
  checkStatusToggle: function () {
    function checkStatusToggle() {
      if (moduleCTIClient.$statusToggle.checkbox('is checked')) {
        $('.disability').removeClass('disabled');
        moduleCTIClient.$moduleStatus.show();
        moduleCTIClientConnectionCheckWorker.errorCounts = 0;
        moduleCTIClientConnectionCheckWorker.initialize();
      } else {
        moduleCTIClient.$moduleStatus.hide();
        $('.disability').addClass('disabled');
      }
    }

    return checkStatusToggle;
  }(),

  /**
   * Включение режима работы через WS
   */
  enableWsFields: function () {
    function enableWsFields() {
      moduleCTIClient.$wsOnlyFields.removeClass('disabled');
    }

    return enableWsFields;
  }(),

  /**
   * Выключение режима работы через WS
   */
  disableWsFields: function () {
    function disableWsFields() {
      moduleCTIClient.$wsOnlyFields.addClass('disabled');
    }

    return disableWsFields;
  }(),

  /**
   * Применение настроек модуля после изменения данных формы
   */
  applyConfigurationChanges: function () {
    function applyConfigurationChanges() {
      $.api({
        url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/reload"),
        on: 'now',
        successTest: function () {
          function successTest(response) {
            // test whether a JSON response is valid
            return Object.keys(response).length > 0 && response.result === true;
          }

          return successTest;
        }(),
        onSuccess: function () {
          function onSuccess() {
            moduleCTIClientConnectionCheckWorker.initialize();
          }

          return onSuccess;
        }()
      });
    }

    return applyConfigurationChanges;
  }(),
  cbBeforeSendForm: function () {
    function cbBeforeSendForm(settings) {
      var result = settings;
      result.data = moduleCTIClient.$formObj.form('get values');
      return result;
    }

    return cbBeforeSendForm;
  }(),
  cbAfterSendForm: function () {
    function cbAfterSendForm() {
      moduleCTIClient.applyConfigurationChanges();
      moduleCTIClientConnectionCheckWorker.errorCounts = 0;
    }

    return cbAfterSendForm;
  }(),
  initializeForm: function () {
    function initializeForm() {
      Form.$formObj = moduleCTIClient.$formObj;
      Form.url = "".concat(globalRootUrl, "module-c-t-i-client/save");
      Form.validateRules = moduleCTIClient.validateRules;
      Form.cbBeforeSendForm = moduleCTIClient.cbBeforeSendForm;
      Form.cbAfterSendForm = moduleCTIClient.cbAfterSendForm;
      Form.initialize();
    }

    return initializeForm;
  }()
};
$(document).ready(function () {
  moduleCTIClient.initialize();
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1pbmRleC5qcyJdLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIiLCIkZm9ybU9iaiIsIiQiLCIkc3RhdHVzVG9nZ2xlIiwiJGRlYnVnVG9nZ2xlIiwiJG1vZHVsZVN0YXR1cyIsIiRzdWJtaXRCdXR0b24iLCJ0aW1lT3V0IiwidGltZU91dEhhbmRsZSIsImVycm9yQ291bnRzIiwiaW5pdGlhbGl6ZSIsInJlc3RhcnRXb3JrZXIiLCJjaGFuZ2VTdGF0dXMiLCJ3aW5kb3ciLCJjbGVhclRpbWVvdXQiLCJ0aW1lb3V0SGFuZGxlIiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJoYXNDbGFzcyIsImRhdGEiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV90cnlpbmciLCJvblN1Y2Nlc3MiLCJvbkZhaWx1cmUiLCJzdGF0dXNlcyIsImVhY2giLCJrZXkiLCJ2YWx1ZSIsIm5hbWUiLCJzdGF0ZSIsInN0YXR1cyIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJodG1sIiwibW9kX2N0aV9Db25uZWN0ZWQiLCJtb2RfY3RpX0Rpc2Nvbm5lY3RlZCIsIm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzIiwibW9kX2N0aV9Db25uZWN0aW9uVG8xQ0Vycm9yIiwibW9kX2N0aV9Db25uZWN0aW9uRXJyb3IiLCJtb2RfY3RpX1VwZGF0ZVN0YXR1cyIsIm1vZHVsZUNUSUNsaWVudCIsIiR3c1RvZ2dsZSIsIiR3c09ubHlGaWVsZHMiLCJ2YWxpZGF0ZVJ1bGVzIiwic2VydmVyMWNob3N0IiwiZGVwZW5kcyIsImlkZW50aWZpZXIiLCJydWxlcyIsInR5cGUiLCJwcm9tcHQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNIb3N0RW1wdHkiLCJzZXJ2ZXIxY3BvcnQiLCJtb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UiLCJkYXRhYmFzZSIsIm1vZF9jdGlfVmFsaWRhdGVQdWJOYW1lIiwiZW5hYmxlV3NGaWVsZHMiLCJvbkNoZWNrZWQiLCJvblVuY2hlY2tlZCIsImRpc2FibGVXc0ZpZWxkcyIsImluaXRpYWxpemVGb3JtIiwiY2hlY2tTdGF0dXNUb2dnbGUiLCJhZGRFdmVudExpc3RlbmVyIiwic2hvdyIsImhpZGUiLCJhcHBseUNvbmZpZ3VyYXRpb25DaGFuZ2VzIiwiY2JCZWZvcmVTZW5kRm9ybSIsInNldHRpbmdzIiwiZm9ybSIsImNiQWZ0ZXJTZW5kRm9ybSIsIkZvcm0iLCJnbG9iYWxSb290VXJsIiwiZG9jdW1lbnQiLCJyZWFkeSJdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7Ozs7QUFRQTs7QUFFQTs7O0FBR0EsSUFBTUEsb0NBQW9DLEdBQUc7QUFDNUNDLEVBQUFBLFFBQVEsRUFBRUMsQ0FBQyxDQUFDLHlCQUFELENBRGlDO0FBRTVDQyxFQUFBQSxhQUFhLEVBQUVELENBQUMsQ0FBQyx1QkFBRCxDQUY0QjtBQUc1Q0UsRUFBQUEsWUFBWSxFQUFFRixDQUFDLENBQUMsb0JBQUQsQ0FINkI7QUFJNUNHLEVBQUFBLGFBQWEsRUFBRUgsQ0FBQyxDQUFDLFNBQUQsQ0FKNEI7QUFLNUNJLEVBQUFBLGFBQWEsRUFBRUosQ0FBQyxDQUFDLGVBQUQsQ0FMNEI7QUFNNUNLLEVBQUFBLE9BQU8sRUFBRSxJQU5tQztBQU81Q0MsRUFBQUEsYUFBYSxFQUFFLEVBUDZCO0FBUTVDQyxFQUFBQSxXQUFXLEVBQUUsQ0FSK0I7QUFTNUNDLEVBQUFBLFVBVDRDO0FBQUEsMEJBUy9CO0FBQ1pWLE1BQUFBLG9DQUFvQyxDQUFDVyxhQUFyQztBQUNBOztBQVgyQztBQUFBO0FBWTVDQSxFQUFBQSxhQVo0QztBQUFBLDZCQVk1QjtBQUNmWCxNQUFBQSxvQ0FBb0MsQ0FBQ1ksWUFBckMsQ0FBa0QsVUFBbEQ7QUFDQUMsTUFBQUEsTUFBTSxDQUFDQyxZQUFQLENBQW9CZCxvQ0FBb0MsQ0FBQ2UsYUFBekQ7QUFDQWYsTUFBQUEsb0NBQW9DLENBQUNnQixNQUFyQztBQUNBOztBQWhCMkM7QUFBQTtBQWlCNUNBLEVBQUFBLE1BakI0QztBQUFBLHNCQWlCbkM7QUFDUixVQUFJaEIsb0NBQW9DLENBQUNHLGFBQXJDLENBQW1EYyxRQUFuRCxDQUE0RCxZQUE1RCxDQUFKLEVBQStFO0FBQzlFZixRQUFBQSxDQUFDLENBQUNnQixHQUFGLENBQU07QUFDTEMsVUFBQUEsR0FBRyxZQUFLQyxNQUFNLENBQUNDLE1BQVosK0NBREU7QUFFTEMsVUFBQUEsRUFBRSxFQUFFLEtBRkM7QUFHTEMsVUFBQUEsV0FBVyxFQUFFQyxNQUFNLENBQUNELFdBSGY7QUFJTEUsVUFBQUEsVUFKSztBQUFBLGtDQUlRO0FBQ1p6QixjQUFBQSxvQ0FBb0MsQ0FBQ2UsYUFBckMsR0FBcURGLE1BQU0sQ0FBQ2EsVUFBUCxDQUNwRDFCLG9DQUFvQyxDQUFDZ0IsTUFEZSxFQUVwRGhCLG9DQUFvQyxDQUFDTyxPQUZlLENBQXJEO0FBSUE7O0FBVEk7QUFBQTtBQVVMb0IsVUFBQUEsVUFWSztBQUFBLGdDQVVNQyxRQVZOLEVBVWdCO0FBQ3BCMUIsY0FBQUEsQ0FBQyxDQUFDLGVBQUQsQ0FBRCxDQUFtQjJCLE1BQW5CLEdBRG9CLENBRXBCOztBQUNBLGtCQUFJN0Isb0NBQW9DLENBQUNJLFlBQXJDLENBQWtEYSxRQUFsRCxDQUEyRCxZQUEzRCxLQUNBakIsb0NBQW9DLENBQUNNLGFBQXJDLENBQW1Ed0IsUUFBbkQsQ0FBNEQsVUFBNUQsQ0FEQSxJQUVBLE9BQVFGLFFBQVEsQ0FBQ0csSUFBakIsS0FBMkIsV0FGL0IsRUFHRTtBQUNELG9CQUFJQyxpQkFBaUIsR0FBR0MsSUFBSSxDQUFDQyxTQUFMLENBQWVOLFFBQVEsQ0FBQ0csSUFBeEIsRUFBOEIsSUFBOUIsRUFBb0MsQ0FBcEMsQ0FBeEI7O0FBRUEsb0JBQUksT0FBT0MsaUJBQVAsS0FBNkIsUUFBakMsRUFBMkM7QUFDMUNBLGtCQUFBQSxpQkFBaUIsR0FBR0EsaUJBQWlCLENBQUNHLE9BQWxCLENBQTBCLEtBQTFCLEVBQWlDLE9BQWpDLENBQXBCOztBQUVBLHNCQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWVQsUUFBWixFQUFzQlUsTUFBdEIsR0FBK0IsQ0FBL0IsSUFBb0NWLFFBQVEsQ0FBQ1csTUFBVCxLQUFvQixJQUE1RCxFQUFrRTtBQUNqRXZDLG9CQUFBQSxvQ0FBb0MsQ0FBQ0MsUUFBckMsQ0FDRXVDLEtBREYsNkdBRXNDUixpQkFGdEM7QUFJQSxtQkFMRCxNQUtPO0FBQ05oQyxvQkFBQUEsb0NBQW9DLENBQUNDLFFBQXJDLENBQ0V1QyxLQURGLDBHQUV1Q0MsZUFBZSxDQUFDQyxjQUZ2RCxpQ0FHRzFDLG9DQUFvQyxDQUFDUyxXQUh4QyxvRkFJc0N1QixpQkFKdEM7QUFNQTtBQUNEO0FBQ0Q7QUFDRDs7QUFyQ0k7QUFBQTtBQXNDTFcsVUFBQUEsU0F0Q0s7QUFBQSxpQ0FzQ087QUFDWDNDLGNBQUFBLG9DQUFvQyxDQUFDWSxZQUFyQyxDQUFrRCxXQUFsRDtBQUNBWixjQUFBQSxvQ0FBb0MsQ0FBQ1MsV0FBckMsR0FBbUQsQ0FBbkQ7QUFDQTs7QUF6Q0k7QUFBQTtBQTBDTG1DLFVBQUFBLFNBMUNLO0FBQUEsK0JBMENLaEIsUUExQ0wsRUEwQ2U7QUFDbkIsa0JBQUlRLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZVCxRQUFaLEVBQXNCVSxNQUF0QixHQUErQixDQUEvQixJQUNBVixRQUFRLENBQUNXLE1BQVQsS0FBb0IsS0FEcEIsSUFFQSxPQUFRWCxRQUFRLENBQUNHLElBQWpCLEtBQTJCLFdBRi9CLEVBR0U7QUFDRC9CLGdCQUFBQSxvQ0FBb0MsQ0FBQ1MsV0FBckMsSUFBb0QsQ0FBcEQ7O0FBQ0Esb0JBQUksT0FBUW1CLFFBQVEsQ0FBQ0csSUFBakIsS0FBMkIsV0FBM0IsSUFDQSxPQUFRSCxRQUFRLENBQUNHLElBQVQsQ0FBY2MsUUFBdEIsS0FBb0MsV0FEeEMsRUFFRTtBQUNEM0Msa0JBQUFBLENBQUMsQ0FBQzRDLElBQUYsQ0FBT2xCLFFBQVEsQ0FBQ0csSUFBVCxDQUFjYyxRQUFyQixFQUErQixVQUFDRSxHQUFELEVBQU1DLEtBQU4sRUFBZ0I7QUFDOUMsd0JBQUksT0FBUUEsS0FBSyxDQUFDQyxJQUFkLEtBQXdCLFdBQXhCLElBQ0FELEtBQUssQ0FBQ0MsSUFBTixLQUFlLFFBRGYsSUFFQUQsS0FBSyxDQUFDRSxLQUFOLEtBQWdCLElBRnBCLEVBRTBCO0FBQ3pCbEQsc0JBQUFBLG9DQUFvQyxDQUFDWSxZQUFyQyxDQUFrRCxxQkFBbEQ7QUFDQSxxQkFKRCxNQUlPLElBQUksT0FBT29DLEtBQUssQ0FBQ0UsS0FBYixLQUF1QixXQUF2QixJQUFzQ0YsS0FBSyxDQUFDRSxLQUFOLEtBQWdCLElBQTFELEVBQWdFO0FBQ3RFLDBCQUFJbEQsb0NBQW9DLENBQUNTLFdBQXJDLEdBQW1ELENBQXZELEVBQTBEO0FBQ3pEVCx3QkFBQUEsb0NBQW9DLENBQUNZLFlBQXJDLENBQWtELG9CQUFsRDtBQUNBLHVCQUZELE1BRU87QUFDTlosd0JBQUFBLG9DQUFvQyxDQUFDWSxZQUFyQyxDQUFrRCxpQkFBbEQ7QUFDQTtBQUNEO0FBQ0QsbUJBWkQ7QUFhQSxpQkFoQkQsTUFnQk87QUFBRTtBQUNSWixrQkFBQUEsb0NBQW9DLENBQUNZLFlBQXJDLENBQWtELGlCQUFsRDtBQUNBO0FBQ0QsZUF4QkQsTUF3Qk87QUFDTlosZ0JBQUFBLG9DQUFvQyxDQUFDWSxZQUFyQyxDQUFrRCxpQkFBbEQ7QUFDQTtBQUNEOztBQXRFSTtBQUFBO0FBQUEsU0FBTjtBQXdFQSxPQXpFRCxNQXlFTztBQUNOWixRQUFBQSxvQ0FBb0MsQ0FBQ1MsV0FBckMsR0FBbUQsQ0FBbkQ7QUFDQTtBQUNEOztBQTlGMkM7QUFBQTs7QUErRjVDOzs7O0FBSUFHLEVBQUFBLFlBbkc0QztBQUFBLDBCQW1HL0J1QyxNQW5HK0IsRUFtR3ZCO0FBQ3BCbkQsTUFBQUEsb0NBQW9DLENBQUNLLGFBQXJDLENBQ0UrQyxXQURGLENBQ2MsTUFEZCxFQUVFQSxXQUZGLENBRWMsUUFGZCxFQUdFQSxXQUhGLENBR2MsT0FIZCxFQUlFQSxXQUpGLENBSWMsS0FKZDs7QUFNQSxjQUFRRCxNQUFSO0FBQ0MsYUFBSyxXQUFMO0FBQ0NuRCxVQUFBQSxvQ0FBb0MsQ0FBQ0ssYUFBckMsQ0FDRWdELFFBREYsQ0FDVyxPQURYLEVBRUVDLElBRkYsQ0FFT2IsZUFBZSxDQUFDYyxpQkFGdkI7QUFHQTs7QUFDRCxhQUFLLGNBQUw7QUFDQ3ZELFVBQUFBLG9DQUFvQyxDQUFDSyxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLE1BRFgsRUFFRUMsSUFGRixDQUVPYixlQUFlLENBQUNlLG9CQUZ2QjtBQUdBOztBQUNELGFBQUssb0JBQUw7QUFDQ3hELFVBQUFBLG9DQUFvQyxDQUFDSyxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLFFBRFgsRUFFRUMsSUFGRixpREFFOENiLGVBQWUsQ0FBQ2dCLDBCQUY5RDtBQUdBOztBQUNELGFBQUsscUJBQUw7QUFDQ3pELFVBQUFBLG9DQUFvQyxDQUFDSyxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLFFBRFgsRUFFRUMsSUFGRixpREFFOENiLGVBQWUsQ0FBQ0MsY0FGOUQsY0FFZ0YxQyxvQ0FBb0MsQ0FBQ1MsV0FGckgsaUJBRXVJZ0MsZUFBZSxDQUFDaUIsMkJBRnZKO0FBR0E7O0FBQ0QsYUFBSyxpQkFBTDtBQUNDMUQsVUFBQUEsb0NBQW9DLENBQUNLLGFBQXJDLENBQ0VnRCxRQURGLENBQ1csS0FEWCxFQUVFQyxJQUZGLGlEQUU4Q2IsZUFBZSxDQUFDQyxjQUY5RCxjQUVnRjFDLG9DQUFvQyxDQUFDUyxXQUZySCxpQkFFdUlnQyxlQUFlLENBQUNrQix1QkFGdko7QUFHQTs7QUFDRCxhQUFLLFVBQUw7QUFDQzNELFVBQUFBLG9DQUFvQyxDQUFDSyxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLE1BRFgsRUFFRUMsSUFGRixpREFFOENiLGVBQWUsQ0FBQ21CLG9CQUY5RDtBQUdBOztBQUNEO0FBQ0M1RCxVQUFBQSxvQ0FBb0MsQ0FBQ0ssYUFBckMsQ0FDRWdELFFBREYsQ0FDVyxLQURYLEVBRUVDLElBRkYsQ0FFT2IsZUFBZSxDQUFDa0IsdUJBRnZCO0FBR0E7QUFuQ0Y7QUFxQ0E7O0FBL0kyQztBQUFBO0FBQUEsQ0FBN0M7QUFrSkEsSUFBTUUsZUFBZSxHQUFHO0FBQ3ZCQyxFQUFBQSxTQUFTLEVBQUU1RCxDQUFDLENBQUMsMEJBQUQsQ0FEVztBQUV2QkMsRUFBQUEsYUFBYSxFQUFFRCxDQUFDLENBQUMsdUJBQUQsQ0FGTztBQUd2QkQsRUFBQUEsUUFBUSxFQUFFQyxDQUFDLENBQUMseUJBQUQsQ0FIWTtBQUl2QkcsRUFBQUEsYUFBYSxFQUFFSCxDQUFDLENBQUMsU0FBRCxDQUpPO0FBS3ZCNkQsRUFBQUEsYUFBYSxFQUFFN0QsQ0FBQyxDQUFDLFVBQUQsQ0FMTztBQU12QjhELEVBQUFBLGFBQWEsRUFBRTtBQUNkQyxJQUFBQSxZQUFZLEVBQUU7QUFDYkMsTUFBQUEsT0FBTyxFQUFFLGtCQURJO0FBRWJDLE1BQUFBLFVBQVUsRUFBRSxjQUZDO0FBR2JDLE1BQUFBLEtBQUssRUFBRSxDQUNOO0FBQ0NDLFFBQUFBLElBQUksRUFBRSxPQURQO0FBRUNDLFFBQUFBLE1BQU0sRUFBRTdCLGVBQWUsQ0FBQzhCO0FBRnpCLE9BRE07QUFITSxLQURBO0FBV2RDLElBQUFBLFlBQVksRUFBRTtBQUNiTixNQUFBQSxPQUFPLEVBQUUsa0JBREk7QUFFYkMsTUFBQUEsVUFBVSxFQUFFLGNBRkM7QUFHYkMsTUFBQUEsS0FBSyxFQUFFLENBQ047QUFDQ0MsUUFBQUEsSUFBSSxFQUFFLG1CQURQO0FBRUNDLFFBQUFBLE1BQU0sRUFBRTdCLGVBQWUsQ0FBQ2dDO0FBRnpCLE9BRE07QUFITSxLQVhBO0FBcUJkQyxJQUFBQSxRQUFRLEVBQUU7QUFDVFIsTUFBQUEsT0FBTyxFQUFFLGtCQURBO0FBRVRDLE1BQUFBLFVBQVUsRUFBRSxVQUZIO0FBR1RDLE1BQUFBLEtBQUssRUFBRSxDQUNOO0FBQ0NDLFFBQUFBLElBQUksRUFBRSxPQURQO0FBRUNDLFFBQUFBLE1BQU0sRUFBRTdCLGVBQWUsQ0FBQ2tDO0FBRnpCLE9BRE07QUFIRTtBQXJCSSxHQU5RO0FBc0N2QmpFLEVBQUFBLFVBdEN1QjtBQUFBLDBCQXNDVjtBQUNaLFVBQUltRCxlQUFlLENBQUNDLFNBQWhCLENBQTBCN0MsUUFBMUIsQ0FBbUMsWUFBbkMsQ0FBSixFQUFzRDtBQUNyRDRDLFFBQUFBLGVBQWUsQ0FBQ2UsY0FBaEI7QUFDQTs7QUFDRGYsTUFBQUEsZUFBZSxDQUFDQyxTQUFoQixDQUNFN0MsUUFERixDQUNXO0FBQ1Q0RCxRQUFBQSxTQURTO0FBQUEsK0JBQ0c7QUFDWGhCLFlBQUFBLGVBQWUsQ0FBQ2UsY0FBaEI7QUFDQTs7QUFIUTtBQUFBO0FBSVRFLFFBQUFBLFdBSlM7QUFBQSxpQ0FJSztBQUNiakIsWUFBQUEsZUFBZSxDQUFDa0IsZUFBaEI7QUFDQTs7QUFOUTtBQUFBO0FBQUEsT0FEWDtBQVNBbEIsTUFBQUEsZUFBZSxDQUFDbUIsY0FBaEI7QUFDQW5CLE1BQUFBLGVBQWUsQ0FBQ29CLGlCQUFoQjtBQUNBcEUsTUFBQUEsTUFBTSxDQUFDcUUsZ0JBQVAsQ0FBd0IscUJBQXhCLEVBQStDckIsZUFBZSxDQUFDb0IsaUJBQS9EO0FBQ0E7O0FBdERzQjtBQUFBOztBQXVEdkI7OztBQUdBQSxFQUFBQSxpQkExRHVCO0FBQUEsaUNBMERIO0FBQ25CLFVBQUlwQixlQUFlLENBQUMxRCxhQUFoQixDQUE4QmMsUUFBOUIsQ0FBdUMsWUFBdkMsQ0FBSixFQUEwRDtBQUN6RGYsUUFBQUEsQ0FBQyxDQUFDLGFBQUQsQ0FBRCxDQUFpQmtELFdBQWpCLENBQTZCLFVBQTdCO0FBQ0FTLFFBQUFBLGVBQWUsQ0FBQ3hELGFBQWhCLENBQThCOEUsSUFBOUI7QUFDQW5GLFFBQUFBLG9DQUFvQyxDQUFDUyxXQUFyQyxHQUFtRCxDQUFuRDtBQUNBVCxRQUFBQSxvQ0FBb0MsQ0FBQ1UsVUFBckM7QUFDQSxPQUxELE1BS087QUFDTm1ELFFBQUFBLGVBQWUsQ0FBQ3hELGFBQWhCLENBQThCK0UsSUFBOUI7QUFDQWxGLFFBQUFBLENBQUMsQ0FBQyxhQUFELENBQUQsQ0FBaUJtRCxRQUFqQixDQUEwQixVQUExQjtBQUNBO0FBQ0Q7O0FBcEVzQjtBQUFBOztBQXFFdkI7OztBQUdBdUIsRUFBQUEsY0F4RXVCO0FBQUEsOEJBd0VOO0FBQ2hCZixNQUFBQSxlQUFlLENBQUNFLGFBQWhCLENBQThCWCxXQUE5QixDQUEwQyxVQUExQztBQUNBOztBQTFFc0I7QUFBQTs7QUEyRXZCOzs7QUFHQTJCLEVBQUFBLGVBOUV1QjtBQUFBLCtCQThFTDtBQUNqQmxCLE1BQUFBLGVBQWUsQ0FBQ0UsYUFBaEIsQ0FBOEJWLFFBQTlCLENBQXVDLFVBQXZDO0FBQ0E7O0FBaEZzQjtBQUFBOztBQWlGdkI7OztBQUdBZ0MsRUFBQUEseUJBcEZ1QjtBQUFBLHlDQW9GSztBQUMzQm5GLE1BQUFBLENBQUMsQ0FBQ2dCLEdBQUYsQ0FBTTtBQUNMQyxRQUFBQSxHQUFHLFlBQUtDLE1BQU0sQ0FBQ0MsTUFBWixnREFERTtBQUVMQyxRQUFBQSxFQUFFLEVBQUUsS0FGQztBQUdMQyxRQUFBQSxXQUhLO0FBQUEsK0JBR09LLFFBSFAsRUFHaUI7QUFDckI7QUFDQSxtQkFBT1EsTUFBTSxDQUFDQyxJQUFQLENBQVlULFFBQVosRUFBc0JVLE1BQXRCLEdBQStCLENBQS9CLElBQW9DVixRQUFRLENBQUNXLE1BQVQsS0FBb0IsSUFBL0Q7QUFDQTs7QUFOSTtBQUFBO0FBT0xJLFFBQUFBLFNBUEs7QUFBQSwrQkFPTztBQUNYM0MsWUFBQUEsb0NBQW9DLENBQUNVLFVBQXJDO0FBQ0E7O0FBVEk7QUFBQTtBQUFBLE9BQU47QUFXQTs7QUFoR3NCO0FBQUE7QUFpR3ZCNEUsRUFBQUEsZ0JBakd1QjtBQUFBLDhCQWlHTkMsUUFqR00sRUFpR0k7QUFDMUIsVUFBTWhELE1BQU0sR0FBR2dELFFBQWY7QUFDQWhELE1BQUFBLE1BQU0sQ0FBQ1IsSUFBUCxHQUFjOEIsZUFBZSxDQUFDNUQsUUFBaEIsQ0FBeUJ1RixJQUF6QixDQUE4QixZQUE5QixDQUFkO0FBQ0EsYUFBT2pELE1BQVA7QUFDQTs7QUFyR3NCO0FBQUE7QUFzR3ZCa0QsRUFBQUEsZUF0R3VCO0FBQUEsK0JBc0dMO0FBQ2pCNUIsTUFBQUEsZUFBZSxDQUFDd0IseUJBQWhCO0FBQ0FyRixNQUFBQSxvQ0FBb0MsQ0FBQ1MsV0FBckMsR0FBbUQsQ0FBbkQ7QUFDQTs7QUF6R3NCO0FBQUE7QUEwR3ZCdUUsRUFBQUEsY0ExR3VCO0FBQUEsOEJBMEdOO0FBQ2hCVSxNQUFBQSxJQUFJLENBQUN6RixRQUFMLEdBQWdCNEQsZUFBZSxDQUFDNUQsUUFBaEM7QUFDQXlGLE1BQUFBLElBQUksQ0FBQ3ZFLEdBQUwsYUFBY3dFLGFBQWQ7QUFDQUQsTUFBQUEsSUFBSSxDQUFDMUIsYUFBTCxHQUFxQkgsZUFBZSxDQUFDRyxhQUFyQztBQUNBMEIsTUFBQUEsSUFBSSxDQUFDSixnQkFBTCxHQUF3QnpCLGVBQWUsQ0FBQ3lCLGdCQUF4QztBQUNBSSxNQUFBQSxJQUFJLENBQUNELGVBQUwsR0FBdUI1QixlQUFlLENBQUM0QixlQUF2QztBQUNBQyxNQUFBQSxJQUFJLENBQUNoRixVQUFMO0FBQ0E7O0FBakhzQjtBQUFBO0FBQUEsQ0FBeEI7QUFvSEFSLENBQUMsQ0FBQzBGLFFBQUQsQ0FBRCxDQUFZQyxLQUFaLENBQWtCLFlBQU07QUFDdkJoQyxFQUFBQSxlQUFlLENBQUNuRCxVQUFoQjtBQUNBLENBRkQiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSBNSUtPIExMQyAtIEFsbCBSaWdodHMgUmVzZXJ2ZWRcbiAqIFVuYXV0aG9yaXplZCBjb3B5aW5nIG9mIHRoaXMgZmlsZSwgdmlhIGFueSBtZWRpdW0gaXMgc3RyaWN0bHkgcHJvaGliaXRlZFxuICogUHJvcHJpZXRhcnkgYW5kIGNvbmZpZGVudGlhbFxuICogV3JpdHRlbiBieSBOaWtvbGF5IEJla2V0b3YsIDExIDIwMThcbiAqXG4gKi9cblxuLyogZ2xvYmFsIGdsb2JhbFJvb3RVcmwsZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjc3RhdHVzJyksXG5cdCRzdWJtaXRCdXR0b246ICQoJyNzdWJtaXRidXR0b24nKSxcblx0dGltZU91dDogMzAwMCxcblx0dGltZU91dEhhbmRsZTogJycsXG5cdGVycm9yQ291bnRzOiAwLFxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcblx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lb3V0SGFuZGxlKTtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyKCk7XG5cdH0sXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lb3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRcdFx0XHQvLyBEZWJ1ZyBtb2RlXG5cdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKVxuXHRcdFx0XHRcdFx0JiYgbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdWJtaXRCdXR0b24uaGFzQ2xhc3MoJ2Rpc2FibGVkJylcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRsZXQgdmlzdWFsRXJyb3JTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXNwb25zZS5kYXRhLCBudWxsLCAyKTtcblxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0dmlzdWFsRXJyb3JTdHJpbmcgPSB2aXN1YWxFcnJvclN0cmluZy5yZXBsYWNlKC9cXG4vZywgJzxici8+Jyk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZm9ybU9ialxuXHRcdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgc3VjY2VzcyBtZXNzYWdlIGFqYXhcIj5cdFx0XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XHRcdFx0XHRcdFx0XHRcdFx0XHQgIFxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZm9ybU9ialxuXHRcdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgZXJyb3IgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfdHJ5aW5nfVxuXHRcdFx0XHRcdFx0XHRcdFx0JHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHN9IC4uLlx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlx0XHRcdFx0XHRcdFx0XHRcdFx0ICBcblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdGlmIChPYmplY3Qua2V5cyhyZXNwb25zZSkubGVuZ3RoID4gMFxuXHRcdFx0XHRcdFx0JiYgcmVzcG9uc2UucmVzdWx0ID09PSBmYWxzZVxuXHRcdFx0XHRcdFx0JiYgdHlwZW9mIChyZXNwb25zZS5kYXRhKSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHRcdCYmIHR5cGVvZiAocmVzcG9uc2UuZGF0YS5zdGF0dXNlcykgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0JC5lYWNoKHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMsIChrZXksIHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiAodmFsdWUubmFtZSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHRcdFx0XHQmJiB2YWx1ZS5uYW1lID09PSAnY3JtLTFjJ1xuXHRcdFx0XHRcdFx0XHRcdFx0JiYgdmFsdWUuc3RhdGUgIT09ICdvaycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDRXJyb3InKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZS5zdGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdmFsdWUuc3RhdGUgIT09ICdvaycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPCA1KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25Qcm9ncmVzcycpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7IC8vIFVua25vd25cblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdH1cblx0fSxcblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQu9C10L3QuNC1INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRj1xuXHQgKiBAcGFyYW0gc3RhdHVzXG5cdCAqL1xuXHRjaGFuZ2VTdGF0dXMoc3RhdHVzKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JleScpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZWVuJylcblx0XHRcdC5yZW1vdmVDbGFzcygncmVkJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZWVuJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9EaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25Qcm9ncmVzcyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX3RyeWluZ30gJHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHN9Li4uICR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX3RyeWluZ30gJHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHN9Li4uICR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ1VwZGF0aW5nJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVXBkYXRlU3RhdHVzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fSxcbn07XG5cbmNvbnN0IG1vZHVsZUNUSUNsaWVudCA9IHtcblx0JHdzVG9nZ2xlOiAkKCcjd2ViLXNlcnZpY2UtbW9kZS10b2dnbGUnKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCRmb3JtT2JqOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjc3RhdHVzJyksXG5cdCR3c09ubHlGaWVsZHM6ICQoJy53cy1vbmx5JyksXG5cdHZhbGlkYXRlUnVsZXM6IHtcblx0XHRzZXJ2ZXIxY2hvc3Q6IHtcblx0XHRcdGRlcGVuZHM6ICd3ZWJfc2VydmljZV9tb2RlJyxcblx0XHRcdGlkZW50aWZpZXI6ICdzZXJ2ZXIxY2hvc3QnLFxuXHRcdFx0cnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdlbXB0eScsXG5cdFx0XHRcdFx0cHJvbXB0OiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WYWxpZGF0ZVNlcnZlcjFDSG9zdEVtcHR5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdHNlcnZlcjFjcG9ydDoge1xuXHRcdFx0ZGVwZW5kczogJ3dlYl9zZXJ2aWNlX21vZGUnLFxuXHRcdFx0aWRlbnRpZmllcjogJ3NlcnZlcjFjcG9ydCcsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2ludGVnZXJbMC4uNjU1MzVdJyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlU2VydmVyMUNQb3J0UmFuZ2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0ZGF0YWJhc2U6IHtcblx0XHRcdGRlcGVuZHM6ICd3ZWJfc2VydmljZV9tb2RlJyxcblx0XHRcdGlkZW50aWZpZXI6ICdkYXRhYmFzZScsXG5cdFx0XHRydWxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2VtcHR5Jyxcblx0XHRcdFx0XHRwcm9tcHQ6IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1ZhbGlkYXRlUHViTmFtZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0fSxcblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnQuZW5hYmxlV3NGaWVsZHMoKTtcblx0XHR9XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiR3c1RvZ2dsZVxuXHRcdFx0LmNoZWNrYm94KHtcblx0XHRcdFx0b25DaGVja2VkKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudC5lbmFibGVXc0ZpZWxkcygpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblVuY2hlY2tlZCgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnQuZGlzYWJsZVdzRmllbGRzKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZUZvcm0oKTtcblx0XHRtb2R1bGVDVElDbGllbnQuY2hlY2tTdGF0dXNUb2dnbGUoKTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignTW9kdWxlU3RhdHVzQ2hhbmdlZCcsIG1vZHVsZUNUSUNsaWVudC5jaGVja1N0YXR1c1RvZ2dsZSk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQn9GA0L7QstC10YDQutCwINGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LTRg9C70Y9cblx0ICovXG5cdGNoZWNrU3RhdHVzVG9nZ2xlKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnQuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkKCcuZGlzYWJpbGl0eScpLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50LiRtb2R1bGVTdGF0dXMuc2hvdygpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5pbml0aWFsaXplKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudC4kbW9kdWxlU3RhdHVzLmhpZGUoKTtcblx0XHRcdCQoJy5kaXNhYmlsaXR5JykuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICog0JLQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDRgNCw0LHQvtGC0Ysg0YfQtdGA0LXQtyBXU1xuXHQgKi9cblx0ZW5hYmxlV3NGaWVsZHMoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50LiR3c09ubHlGaWVsZHMucmVtb3ZlQ2xhc3MoJ2Rpc2FibGVkJyk7XG5cdH0sXG5cdC8qKlxuXHQgKiDQktGL0LrQu9GO0YfQtdC90LjQtSDRgNC10LbQuNC80LAg0YDQsNCx0L7RgtGLINGH0LXRgNC10LcgV1Ncblx0ICovXG5cdGRpc2FibGVXc0ZpZWxkcygpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuJHdzT25seUZpZWxkcy5hZGRDbGFzcygnZGlzYWJsZWQnKTtcblx0fSxcblx0LyoqXG5cdCAqINCf0YDQuNC80LXQvdC10L3QuNC1INC90LDRgdGC0YDQvtC10Log0LzQvtC00YPQu9GPINC/0L7RgdC70LUg0LjQt9C80LXQvdC10L3QuNGPINC00LDQvdC90YvRhSDRhNC+0YDQvNGLXG5cdCAqL1xuXHRhcHBseUNvbmZpZ3VyYXRpb25DaGFuZ2VzKCkge1xuXHRcdCQuYXBpKHtcblx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvcmVsb2FkYCxcblx0XHRcdG9uOiAnbm93Jyxcblx0XHRcdHN1Y2Nlc3NUZXN0KHJlc3BvbnNlKSB7XG5cdFx0XHRcdC8vIHRlc3Qgd2hldGhlciBhIEpTT04gcmVzcG9uc2UgaXMgdmFsaWRcblx0XHRcdFx0cmV0dXJuIE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRvblN1Y2Nlc3MoKSB7XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5pbml0aWFsaXplKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9LFxuXHRjYkJlZm9yZVNlbmRGb3JtKHNldHRpbmdzKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2V0dGluZ3M7XG5cdFx0cmVzdWx0LmRhdGEgPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmouZm9ybSgnZ2V0IHZhbHVlcycpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0sXG5cdGNiQWZ0ZXJTZW5kRm9ybSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnQuYXBwbHlDb25maWd1cmF0aW9uQ2hhbmdlcygpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdH0sXG5cdGluaXRpYWxpemVGb3JtKCkge1xuXHRcdEZvcm0uJGZvcm1PYmogPSBtb2R1bGVDVElDbGllbnQuJGZvcm1PYmo7XG5cdFx0Rm9ybS51cmwgPSBgJHtnbG9iYWxSb290VXJsfW1vZHVsZS1jLXQtaS1jbGllbnQvc2F2ZWA7XG5cdFx0Rm9ybS52YWxpZGF0ZVJ1bGVzID0gbW9kdWxlQ1RJQ2xpZW50LnZhbGlkYXRlUnVsZXM7XG5cdFx0Rm9ybS5jYkJlZm9yZVNlbmRGb3JtID0gbW9kdWxlQ1RJQ2xpZW50LmNiQmVmb3JlU2VuZEZvcm07XG5cdFx0Rm9ybS5jYkFmdGVyU2VuZEZvcm0gPSBtb2R1bGVDVElDbGllbnQuY2JBZnRlclNlbmRGb3JtO1xuXHRcdEZvcm0uaW5pdGlhbGl6ZSgpO1xuXHR9LFxufTtcblxuJChkb2N1bWVudCkucmVhZHkoKCkgPT4ge1xuXHRtb2R1bGVDVElDbGllbnQuaW5pdGlhbGl6ZSgpO1xufSk7XG5cbiJdfQ==