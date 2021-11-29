"use strict";

/*
 * MikoPBX - free phone system for small business
 * Copyright (C) 2017-2021 Alexey Portnov and Nikolay Beketov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

/* global globalTranslate, Form, Config, PbxApi */

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
    moduleCTIClientConnectionCheckWorker.errorCounts = 0;
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
          window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeoutHandle);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJpbml0aWFsaXplIiwicmVzdGFydFdvcmtlciIsImNoYW5nZVN0YXR1cyIsIndpbmRvdyIsImNsZWFyVGltZW91dCIsInRpbWVvdXRIYW5kbGUiLCJ3b3JrZXIiLCJjaGVja2JveCIsImFwaSIsInVybCIsIkNvbmZpZyIsInBieFVybCIsIm9uIiwic3VjY2Vzc1Rlc3QiLCJQYnhBcGkiLCJvbkNvbXBsZXRlIiwic2V0VGltZW91dCIsIm9uUmVzcG9uc2UiLCJyZXNwb25zZSIsInJlbW92ZSIsImRhdGEiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJjb3VudEhlYWx0aHkiLCJzdGF0dXMxQyIsImVhY2giLCJrZXkiLCJ2YWx1ZSIsIm5hbWUiLCJzdGF0ZSIsInN0YXR1cyIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJodG1sIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV9Db25uZWN0ZWQiLCJtb2RfY3RpX0Rpc2Nvbm5lY3RlZCIsIm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzIiwibW9kX2N0aV9Db25uZWN0aW9uV2FpdCIsIm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvciIsIm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yIiwibW9kX2N0aV9VcGRhdGVTdGF0dXMiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFNQSxvQ0FBb0MsR0FBRztBQUM1Q0MsRUFBQUEsUUFBUSxFQUFFQyxDQUFDLENBQUMseUJBQUQsQ0FEaUM7QUFFNUNDLEVBQUFBLGFBQWEsRUFBRUQsQ0FBQyxDQUFDLHVCQUFELENBRjRCO0FBRzVDRSxFQUFBQSxpQkFBaUIsRUFBRUYsQ0FBQyxDQUFDLDBCQUFELENBSHdCO0FBSTVDRyxFQUFBQSxZQUFZLEVBQUVILENBQUMsQ0FBQyxvQkFBRCxDQUo2QjtBQUs1Q0ksRUFBQUEsYUFBYSxFQUFFSixDQUFDLENBQUMsU0FBRCxDQUw0QjtBQU01Q0ssRUFBQUEsYUFBYSxFQUFFTCxDQUFDLENBQUMsZUFBRCxDQU40QjtBQU81Q00sRUFBQUEsVUFBVSxFQUFFTixDQUFDLENBQUMseUNBQUQsQ0FQK0I7QUFRNUNPLEVBQUFBLE9BQU8sRUFBRSxJQVJtQztBQVM1Q0MsRUFBQUEsYUFBYSxFQUFFLEVBVDZCO0FBVTVDQyxFQUFBQSxXQUFXLEVBQUUsQ0FWK0I7QUFXNUNDLEVBQUFBLFVBWDRDLHdCQVcvQjtBQUNaWixJQUFBQSxvQ0FBb0MsQ0FBQ2EsYUFBckM7QUFDQSxHQWIyQztBQWM1Q0EsRUFBQUEsYUFkNEMsMkJBYzVCO0FBQ2ZiLElBQUFBLG9DQUFvQyxDQUFDVyxXQUFyQyxHQUFtRCxDQUFuRDtBQUNBWCxJQUFBQSxvQ0FBb0MsQ0FBQ2MsWUFBckMsQ0FBa0QsVUFBbEQ7QUFDQUMsSUFBQUEsTUFBTSxDQUFDQyxZQUFQLENBQW9CaEIsb0NBQW9DLENBQUNpQixhQUF6RDtBQUNBakIsSUFBQUEsb0NBQW9DLENBQUNrQixNQUFyQztBQUNBLEdBbkIyQztBQW9CNUNBLEVBQUFBLE1BcEI0QyxvQkFvQm5DO0FBQ1IsUUFBSWxCLG9DQUFvQyxDQUFDRyxhQUFyQyxDQUFtRGdCLFFBQW5ELENBQTRELFlBQTVELENBQUosRUFBK0U7QUFDOUVqQixNQUFBQSxDQUFDLENBQUNrQixHQUFGLENBQU07QUFDTEMsUUFBQUEsR0FBRyxZQUFLQyxNQUFNLENBQUNDLE1BQVosK0NBREU7QUFFTEMsUUFBQUEsRUFBRSxFQUFFLEtBRkM7QUFHTEMsUUFBQUEsV0FBVyxFQUFFQyxNQUFNLENBQUNELFdBSGY7QUFJTEUsUUFBQUEsVUFKSyx3QkFJUTtBQUNaM0IsVUFBQUEsb0NBQW9DLENBQUNpQixhQUFyQyxHQUFxREYsTUFBTSxDQUFDYSxVQUFQLENBQ3BENUIsb0NBQW9DLENBQUNrQixNQURlLEVBRXBEbEIsb0NBQW9DLENBQUNTLE9BRmUsQ0FBckQ7QUFJQSxTQVRJO0FBVUxvQixRQUFBQSxVQVZLLHNCQVVNQyxRQVZOLEVBVWdCO0FBQ3BCNUIsVUFBQUEsQ0FBQyxDQUFDLGVBQUQsQ0FBRCxDQUFtQjZCLE1BQW5CLEdBRG9CLENBRXBCOztBQUNBLGNBQUksT0FBUUQsUUFBUSxDQUFDRSxJQUFqQixLQUEyQixXQUEvQixFQUE0QztBQUMzQyxnQkFBSUMsaUJBQWlCLEdBQUdDLElBQUksQ0FBQ0MsU0FBTCxDQUFlTCxRQUFRLENBQUNFLElBQXhCLEVBQThCLElBQTlCLEVBQW9DLENBQXBDLENBQXhCOztBQUVBLGdCQUFJLE9BQU9DLGlCQUFQLEtBQTZCLFFBQWpDLEVBQTJDO0FBQzFDQSxjQUFBQSxpQkFBaUIsR0FBR0EsaUJBQWlCLENBQUNHLE9BQWxCLENBQTBCLEtBQTFCLEVBQWlDLE9BQWpDLENBQXBCOztBQUVBLGtCQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWVIsUUFBWixFQUFzQlMsTUFBdEIsR0FBK0IsQ0FBL0IsSUFBb0NULFFBQVEsQ0FBQ1UsTUFBVCxLQUFvQixJQUE1RCxFQUFrRTtBQUNqRXhDLGdCQUFBQSxvQ0FBb0MsQ0FBQ1EsVUFBckMsQ0FDRWlDLEtBREYsc0dBRXVDUixpQkFGdkM7QUFJQSxlQUxELE1BS087QUFDTmpDLGdCQUFBQSxvQ0FBb0MsQ0FBQ1EsVUFBckMsQ0FDRWlDLEtBREYsd0tBR3NDUixpQkFIdEM7QUFLQTtBQUNEO0FBQ0Q7QUFDRCxTQWpDSTtBQWtDTFMsUUFBQUEsU0FsQ0ssdUJBa0NPO0FBQ1gxQyxVQUFBQSxvQ0FBb0MsQ0FBQ2MsWUFBckMsQ0FBa0QsV0FBbEQ7QUFDQWQsVUFBQUEsb0NBQW9DLENBQUNXLFdBQXJDLEdBQW1ELENBQW5EO0FBQ0FJLFVBQUFBLE1BQU0sQ0FBQ0MsWUFBUCxDQUFvQmhCLG9DQUFvQyxDQUFDaUIsYUFBekQ7QUFDQSxTQXRDSTtBQXVDTDBCLFFBQUFBLFNBdkNLLHFCQXVDS2IsUUF2Q0wsRUF1Q2U7QUFDbkIsY0FBSU8sTUFBTSxDQUFDQyxJQUFQLENBQVlSLFFBQVosRUFBc0JTLE1BQXRCLEdBQStCLENBQS9CLElBQ0FULFFBQVEsQ0FBQ1UsTUFBVCxLQUFvQixLQURwQixJQUVBLE9BQVFWLFFBQVEsQ0FBQ0UsSUFBakIsS0FBMkIsV0FGL0IsRUFHRTtBQUNEaEMsWUFBQUEsb0NBQW9DLENBQUNXLFdBQXJDLElBQW9ELENBQXBEOztBQUNBLGdCQUFJLE9BQVFtQixRQUFRLENBQUNFLElBQWpCLEtBQTJCLFdBQTNCLElBQ0EsT0FBUUYsUUFBUSxDQUFDRSxJQUFULENBQWNZLFFBQXRCLEtBQW9DLFdBRHhDLEVBRUU7QUFDRCxrQkFBSUMsWUFBWSxHQUFHLENBQW5CO0FBQ0Esa0JBQUlDLFFBQVEsR0FBRyxXQUFmO0FBRUE1QyxjQUFBQSxDQUFDLENBQUM2QyxJQUFGLENBQU9qQixRQUFRLENBQUNFLElBQVQsQ0FBY1ksUUFBckIsRUFBK0IsVUFBQ0ksR0FBRCxFQUFNQyxLQUFOLEVBQWdCO0FBQzlDLG9CQUFJLE9BQVFBLEtBQUssQ0FBQ0MsSUFBZCxLQUF3QixXQUF4QixJQUNBRCxLQUFLLENBQUNFLEtBQU4sS0FBZ0IsSUFEcEIsRUFDeUI7QUFDeEJOLGtCQUFBQSxZQUFZO0FBQ1o7O0FBQ0Qsb0JBQUksT0FBUUksS0FBSyxDQUFDQyxJQUFkLEtBQXdCLFdBQXhCLElBQ0FELEtBQUssQ0FBQ0MsSUFBTixLQUFlLFFBRG5CLEVBQzZCO0FBQzVCSixrQkFBQUEsUUFBUSxHQUFHRyxLQUFLLENBQUNFLEtBQWpCO0FBQ0E7QUFDRCxlQVREOztBQVVBLGtCQUFJTCxRQUFRLEtBQUssSUFBYixJQUFxQkQsWUFBWSxLQUFLLENBQTFDLEVBQThDO0FBQzdDLG9CQUFJN0Msb0NBQW9DLENBQUNJLGlCQUFyQyxDQUF1RGUsUUFBdkQsQ0FBZ0UsWUFBaEUsQ0FBSixFQUFtRjtBQUNsRm5CLGtCQUFBQSxvQ0FBb0MsQ0FBQ2MsWUFBckMsQ0FBa0QscUJBQWxEO0FBQ0EsaUJBRkQsTUFFTztBQUNOZCxrQkFBQUEsb0NBQW9DLENBQUNjLFlBQXJDLENBQWtELG9CQUFsRDtBQUNBO0FBQ0QsZUFORCxNQU1PLElBQUkrQixZQUFZLEdBQUcsQ0FBbkIsRUFBc0I7QUFDNUIsb0JBQUk3QyxvQ0FBb0MsQ0FBQ1csV0FBckMsR0FBbUQsRUFBdkQsRUFBMkQ7QUFDMURYLGtCQUFBQSxvQ0FBb0MsQ0FBQ2MsWUFBckMsQ0FBa0Qsb0JBQWxEO0FBQ0EsaUJBRkQsTUFFTztBQUNOZCxrQkFBQUEsb0NBQW9DLENBQUNjLFlBQXJDLENBQWtELGlCQUFsRDtBQUNBO0FBQ0Q7QUFFRCxhQTlCRCxNQThCTztBQUFFO0FBQ1JkLGNBQUFBLG9DQUFvQyxDQUFDYyxZQUFyQyxDQUFrRCxpQkFBbEQ7QUFDQTtBQUNELFdBdENELE1Bc0NPO0FBQ05kLFlBQUFBLG9DQUFvQyxDQUFDYyxZQUFyQyxDQUFrRCxpQkFBbEQ7QUFDQTtBQUNEO0FBakZJLE9BQU47QUFtRkEsS0FwRkQsTUFvRk87QUFDTmQsTUFBQUEsb0NBQW9DLENBQUNXLFdBQXJDLEdBQW1ELENBQW5EO0FBQ0E7QUFDRCxHQTVHMkM7O0FBNkc1QztBQUNEO0FBQ0E7QUFDQTtBQUNDRyxFQUFBQSxZQWpINEMsd0JBaUgvQnNDLE1BakgrQixFQWlIdkI7QUFDcEJwRCxJQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStDLFdBREYsQ0FDYyxNQURkLEVBRUVBLFdBRkYsQ0FFYyxRQUZkLEVBR0VBLFdBSEYsQ0FHYyxPQUhkLEVBSUVBLFdBSkYsQ0FJYyxLQUpkOztBQU1BLFlBQVFELE1BQVI7QUFDQyxXQUFLLFdBQUw7QUFDQ3BELFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLE9BRFgsRUFFRUMsSUFGRixDQUVPQyxlQUFlLENBQUNDLGlCQUZ2QjtBQUdBOztBQUNELFdBQUssY0FBTDtBQUNDekQsUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0VnRCxRQURGLENBQ1csTUFEWCxFQUVFQyxJQUZGLENBRU9DLGVBQWUsQ0FBQ0Usb0JBRnZCO0FBR0E7O0FBQ0QsV0FBSyxvQkFBTDtBQUNDMUQsUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0VnRCxRQURGLENBQ1csUUFEWCxFQUVFQyxJQUZGLGlEQUU4Q0MsZUFBZSxDQUFDRywwQkFGOUQ7QUFHQTs7QUFDRCxXQUFLLG9CQUFMO0FBQ0MzRCxRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRWdELFFBREYsQ0FDVyxRQURYLEVBRUVDLElBRkYsaURBRThDQyxlQUFlLENBQUNJLHNCQUY5RDtBQUdBOztBQUNELFdBQUsscUJBQUw7QUFDQzVELFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLFFBRFgsRUFFRUMsSUFGRixpREFFOENDLGVBQWUsQ0FBQ0ssMkJBRjlEO0FBR0E7O0FBQ0QsV0FBSyxpQkFBTDtBQUNDN0QsUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0VnRCxRQURGLENBQ1csS0FEWCxFQUVFQyxJQUZGLGlEQUU4Q0MsZUFBZSxDQUFDTSx1QkFGOUQ7QUFHQTs7QUFDRCxXQUFLLFVBQUw7QUFDQzlELFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLE1BRFgsRUFFRUMsSUFGRixpREFFOENDLGVBQWUsQ0FBQ08sb0JBRjlEO0FBR0E7O0FBQ0Q7QUFDQy9ELFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFZ0QsUUFERixDQUNXLEtBRFgsRUFFRUMsSUFGRixDQUVPQyxlQUFlLENBQUNNLHVCQUZ2QjtBQUdBO0FBeENGO0FBMENBO0FBbEsyQyxDQUE3QyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaWtvUEJYIC0gZnJlZSBwaG9uZSBzeXN0ZW0gZm9yIHNtYWxsIGJ1c2luZXNzXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTctMjAyMSBBbGV4ZXkgUG9ydG5vdiBhbmQgTmlrb2xheSBCZWtldG92XG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAqIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gKiB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uOyBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICogKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAqIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gKiBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFsb25nIHdpdGggdGhpcyBwcm9ncmFtLlxuICogSWYgbm90LCBzZWUgPGh0dHBzOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiAqL1xuXG4vKiBnbG9iYWwgZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNzdGF0dXMnKSxcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxuXHQkZGVidWdJbmZvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSBzcGFuI2RlYnVnLWluZm8nKSxcblx0dGltZU91dDogMzAwMCxcblx0dGltZU91dEhhbmRsZTogJycsXG5cdGVycm9yQ291bnRzOiAwLFxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdVcGRhdGluZycpO1xuXHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVvdXRIYW5kbGUpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIoKTtcblx0fSxcblx0d29ya2VyKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkLmFwaSh7XG5cdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvY2hlY2tgLFxuXHRcdFx0XHRvbjogJ25vdycsXG5cdFx0XHRcdHN1Y2Nlc3NUZXN0OiBQYnhBcGkuc3VjY2Vzc1Rlc3QsXG5cdFx0XHRcdG9uQ29tcGxldGUoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVvdXRIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dChcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIsXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblJlc3BvbnNlKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0JCgnLm1lc3NhZ2UuYWpheCcpLnJlbW92ZSgpO1xuXHRcdFx0XHRcdC8vIERlYnVnIG1vZGVcblx0XHRcdFx0XHRpZiAodHlwZW9mIChyZXNwb25zZS5kYXRhKSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdGxldCB2aXN1YWxFcnJvclN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLmRhdGEsIG51bGwsIDIpO1xuXG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIHZpc3VhbEVycm9yU3RyaW5nID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHR2aXN1YWxFcnJvclN0cmluZyA9IHZpc3VhbEVycm9yU3RyaW5nLnJlcGxhY2UoL1xcbi9nLCAnPGJyLz4nKTtcblxuXHRcdFx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UucmVzdWx0ID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRkZWJ1Z0luZm9cblx0XHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlx0XHRcblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+ICR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XHRcdFx0XHRcdFx0XHRcdFx0XHQgIFxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cblx0XHRcdFx0XHRcdFx0XHRcdDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+IFx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlx0XHRcdFx0XHRcdFx0XHRcdFx0ICBcblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZW91dEhhbmRsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdGlmIChPYmplY3Qua2V5cyhyZXNwb25zZSkubGVuZ3RoID4gMFxuXHRcdFx0XHRcdFx0JiYgcmVzcG9uc2UucmVzdWx0ID09PSBmYWxzZVxuXHRcdFx0XHRcdFx0JiYgdHlwZW9mIChyZXNwb25zZS5kYXRhKSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHRcdCYmIHR5cGVvZiAocmVzcG9uc2UuZGF0YS5zdGF0dXNlcykgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0bGV0IGNvdW50SGVhbHRoeSA9IDA7XG5cdFx0XHRcdFx0XHRcdGxldCBzdGF0dXMxQyA9ICd1bmRlZmluZWQnO1xuXG5cdFx0XHRcdFx0XHRcdCQuZWFjaChyZXNwb25zZS5kYXRhLnN0YXR1c2VzLCAoa2V5LCB2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHZhbHVlLm5hbWUpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0XHRcdFx0JiYgdmFsdWUuc3RhdGUgPT09ICdvaycpe1xuXHRcdFx0XHRcdFx0XHRcdFx0Y291bnRIZWFsdGh5Kys7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHZhbHVlLm5hbWUpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0XHRcdFx0JiYgdmFsdWUubmFtZSA9PT0gJ2NybS0xYycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXR1czFDID0gdmFsdWUuc3RhdGU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0aWYgKHN0YXR1czFDICE9PSAnb2snICYmIGNvdW50SGVhbHRoeSA9PT0gNSApIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiR3ZWJTZXJ2aWNlVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDRXJyb3InKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNXYWl0Jyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGNvdW50SGVhbHRoeSA8IDUpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzIDwgMTApIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25Qcm9ncmVzcycpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0fSBlbHNlIHsgLy8gVW5rbm93blxuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0fVxuXHR9LFxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0YHRgtCw0YLRg9GB0LAg0LzQvtC00YPQu9GPXG5cdCAqIEBwYXJhbSBzdGF0dXNcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0LnJlbW92ZUNsYXNzKCdncmV5Jylcblx0XHRcdC5yZW1vdmVDbGFzcygneWVsbG93Jylcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JlZW4nKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCdyZWQnKTtcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JlZW4nKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3RlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnRGlzY29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Rpc2Nvbm5lY3RlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uUHJvZ3Jlc3N9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNXYWl0Jzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uV2FpdH1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ0Vycm9yJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uVG8xQ0Vycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25FcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ1VwZGF0aW5nJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVXBkYXRlU3RhdHVzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fSxcbn07Il19