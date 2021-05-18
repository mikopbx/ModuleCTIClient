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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJpbml0aWFsaXplIiwicmVzdGFydFdvcmtlciIsImNoYW5nZVN0YXR1cyIsIndpbmRvdyIsImNsZWFyVGltZW91dCIsInRpbWVvdXRIYW5kbGUiLCJ3b3JrZXIiLCJjaGVja2JveCIsImFwaSIsInVybCIsIkNvbmZpZyIsInBieFVybCIsIm9uIiwic3VjY2Vzc1Rlc3QiLCJQYnhBcGkiLCJvbkNvbXBsZXRlIiwic2V0VGltZW91dCIsIm9uUmVzcG9uc2UiLCJyZXNwb25zZSIsInJlbW92ZSIsImRhdGEiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJjb3VudEhlYWx0aHkiLCJzdGF0dXMxQyIsImVhY2giLCJrZXkiLCJ2YWx1ZSIsIm5hbWUiLCJzdGF0ZSIsInN0YXR1cyIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJodG1sIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV9Db25uZWN0ZWQiLCJtb2RfY3RpX0Rpc2Nvbm5lY3RlZCIsIm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzIiwibW9kX2N0aV9Db25uZWN0aW9uV2FpdCIsIm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvciIsIm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yIiwibW9kX2N0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QXhDRjtBQTBDQTtBQWpLMkMsQ0FBN0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWlrb1BCWCAtIGZyZWUgcGhvbmUgc3lzdGVtIGZvciBzbWFsbCBidXNpbmVzc1xuICogQ29weXJpZ2h0IChDKSAyMDE3LTIwMjEgQWxleGV5IFBvcnRub3YgYW5kIE5pa29sYXkgQmVrZXRvdlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gKiBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICogdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbjsgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAqIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gKiBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICogTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cbiAqXG4gKiBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS5cbiAqIElmIG5vdCwgc2VlIDxodHRwczovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4gKi9cblxuLyogZ2xvYmFsIGdsb2JhbFRyYW5zbGF0ZSwgRm9ybSwgQ29uZmlnLCBQYnhBcGkgKi9cblxuLyoqXG4gKiDQotC10YHRgtC40YDQvtCy0LDQvdC40LUg0YHQvtC10LTQuNC90LXQvdC40Y8g0LzQvtC00YPQu9GPINGBIDHQoVxuICovXG5jb25zdCBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIgPSB7XG5cdCRmb3JtT2JqOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybScpLFxuXHQkc3RhdHVzVG9nZ2xlOiAkKCcjbW9kdWxlLXN0YXR1cy10b2dnbGUnKSxcblx0JHdlYlNlcnZpY2VUb2dnbGU6ICQoJyN3ZWItc2VydmljZS1tb2RlLXRvZ2dsZScpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjc3RhdHVzJyksXG5cdCRzdWJtaXRCdXR0b246ICQoJyNzdWJtaXRidXR0b24nKSxcblx0JGRlYnVnSW5mbzogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gc3BhbiNkZWJ1Zy1pbmZvJyksXG5cdHRpbWVPdXQ6IDMwMDAsXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxuXHRlcnJvckNvdW50czogMCxcblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVzdGFydFdvcmtlcigpO1xuXHR9LFxuXHRyZXN0YXJ0V29ya2VyKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcblx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lb3V0SGFuZGxlKTtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyKCk7XG5cdH0sXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lb3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRcdFx0XHQvLyBEZWJ1ZyBtb2RlXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRsZXQgdmlzdWFsRXJyb3JTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXNwb25zZS5kYXRhLCBudWxsLCAyKTtcblxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0dmlzdWFsRXJyb3JTdHJpbmcgPSB2aXN1YWxFcnJvclN0cmluZy5yZXBsYWNlKC9cXG4vZywgJzxici8+Jyk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cdFx0XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiAke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlx0XHRcdFx0XHRcdFx0XHRcdFx0ICBcblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiBcdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+JHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cdFx0XHRcdFx0XHRcdFx0XHRcdCAgXG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZhaWx1cmUocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDBcblx0XHRcdFx0XHRcdCYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gZmFsc2Vcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgKz0gMTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0XHQmJiB0eXBlb2YgKHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdGxldCBjb3VudEhlYWx0aHkgPSAwO1xuXHRcdFx0XHRcdFx0XHRsZXQgc3RhdHVzMUMgPSAndW5kZWZpbmVkJztcblxuXHRcdFx0XHRcdFx0XHQkLmVhY2gocmVzcG9uc2UuZGF0YS5zdGF0dXNlcywgKGtleSwgdmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mICh2YWx1ZS5uYW1lKSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0XHRcdFx0XHRcdCYmIHZhbHVlLnN0YXRlID09PSAnb2snKXtcblx0XHRcdFx0XHRcdFx0XHRcdGNvdW50SGVhbHRoeSsrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mICh2YWx1ZS5uYW1lKSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0XHRcdFx0XHRcdCYmIHZhbHVlLm5hbWUgPT09ICdjcm0tMWMnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzdGF0dXMxQyA9IHZhbHVlLnN0YXRlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdGlmIChzdGF0dXMxQyAhPT0gJ29rJyAmJiBjb3VudEhlYWx0aHkgPT09IDUgKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kd2ViU2VydmljZVRvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ0Vycm9yJyk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDV2FpdCcpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChjb3VudEhlYWx0aHkgPCA1KSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA8IDEwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdH0gZWxzZSB7IC8vIFVua25vd25cblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdH1cblx0fSxcblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQu9C10L3QuNC1INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRj1xuXHQgKiBAcGFyYW0gc3RhdHVzXG5cdCAqL1xuXHRjaGFuZ2VTdGF0dXMoc3RhdHVzKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JleScpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZWVuJylcblx0XHRcdC5yZW1vdmVDbGFzcygncmVkJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZWVuJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9EaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25Qcm9ncmVzcyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbldhaXR9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNFcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwZGF0ZVN0YXR1c31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0sXG59OyJdfQ==