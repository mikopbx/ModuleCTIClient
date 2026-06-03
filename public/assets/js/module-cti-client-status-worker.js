"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

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
 * Тестирование соединения модуля с 1С + рендер панели статусов сервисов.
 */
var moduleCTIClientConnectionCheckWorker = {
  $formObj: $('#module-cti-client-form'),
  $statusToggle: $('#module-status-toggle'),
  $webServiceToggle: $('#web-service-mode-toggle'),
  $debugToggle: $('#debug-mode-toggle'),
  $moduleStatus: $('#status'),
  $submitButton: $('#submitbutton'),
  $debugInfo: $('#module-cti-client-form span#debug-info'),
  $servicesStatus: $('#cti-services-status'),
  timeOut: 3000,
  timeOutHandle: '',
  errorCounts: 0,

  /**
   * Маппинг state -> CSS-класс лампочки.
   * Любое неизвестное состояние -> жёлтое (warn).
   */
  stateLedClass: {
    ok: 'ok',
    error: 'error',
    fail: 'error',
    failed: 'error',
    down: 'error',
    stopped: 'error',
    unknown: 'unknown',
    pending: 'warn',
    starting: 'warn',
    qrcode: 'warn',
    auth: 'warn',
    auth_required: 'warn',
    warn: 'warn',
    warning: 'warn'
  },

  /**
   * Сервисы, которые могут идти в нескольких инстансах с разным area.
   */
  multiInstanceServices: {
    chats: true,
    tg: true,
    max: true
  },
  initialize: function initialize() {
    moduleCTIClientConnectionCheckWorker.restartWorker();
  },
  restartWorker: function restartWorker() {
    moduleCTIClientConnectionCheckWorker.errorCounts = 0;
    moduleCTIClientConnectionCheckWorker.changeStatus('Updating');
    window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeOutHandle);
    moduleCTIClientConnectionCheckWorker.worker();
  },
  worker: function worker() {
    if (moduleCTIClientConnectionCheckWorker.$statusToggle.checkbox('is checked')) {
      $.api({
        url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/check"),
        on: 'now',
        successTest: PbxApi.successTest,
        onComplete: function onComplete() {
          moduleCTIClientConnectionCheckWorker.timeOutHandle = window.setTimeout(moduleCTIClientConnectionCheckWorker.worker, moduleCTIClientConnectionCheckWorker.timeOut);
        },
        onResponse: function onResponse(response) {
          $('.message.ajax').remove();

          if (typeof response.data === 'undefined') {
            return;
          } // Render services status panel for both success and partial responses.


          moduleCTIClientConnectionCheckWorker.renderServicesStatus(response.data); // Debug JSON pane (legacy debug tab).

          var visualErrorString = JSON.stringify(response.data, null, 2);

          if (typeof visualErrorString === 'string') {
            visualErrorString = visualErrorString.replace(/\n/g, '<br/>');

            if (Object.keys(response).length > 0 && response.result === true) {
              moduleCTIClientConnectionCheckWorker.$debugInfo.after("<div class=\"ui message ajax\">\n\t\t\t\t\t\t\t\t\t<pre style='white-space: pre-wrap'> ".concat(visualErrorString, "</pre>\n\t\t\t\t\t\t\t\t</div>"));
            } else {
              moduleCTIClientConnectionCheckWorker.$debugInfo.after("<div class=\"ui message ajax\">\n\t\t\t\t\t\t\t\t\t<i class=\"spinner loading icon\"></i>\n\t\t\t\t\t\t\t\t\t<pre style='white-space: pre-wrap'>".concat(visualErrorString, "</pre>\n\t\t\t\t\t\t\t\t</div>"));
            }
          }
        },
        onSuccess: function onSuccess() {
          moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
          moduleCTIClientConnectionCheckWorker.errorCounts = 0;
          window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeOutHandle);
        },
        onFailure: function onFailure(response) {
          moduleCTIClientConnectionCheckWorker.errorCounts += 1;
          var statuses = response && response.data && Array.isArray(response.data.statuses) ? response.data.statuses : null;

          if (!statuses) {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
            return;
          } // Classify the response by the worst non-system state.
          // crm-1c is special: it's the 1C bridge — its own error label.


          var crm1c = null;
          var hasError = false;
          var hasStarting = false;
          statuses.forEach(function (s) {
            if (!s || typeof s.name === 'undefined') return;
            if (s.name === 'crm-1c') crm1c = s.state;
            if (s.state === 'error' || s.state === 'fail' || s.state === 'failed' || s.state === 'down' || s.state === 'stopped') hasError = true;
            if (s.state === 'starting' || s.state === 'pending' || s.state === 'unknown') hasStarting = true;
          });

          if (crm1c && crm1c !== 'ok') {
            if (moduleCTIClientConnectionCheckWorker.$webServiceToggle.checkbox('is checked')) {
              moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CError');
            } else {
              moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CWait');
            }
          } else if (hasStarting) {
            // Still starting: show progress until we give up after 10
            // failed polls, then treat the stuck daemon as an error
            // instead of falsely reporting it as Connected.
            if (moduleCTIClientConnectionCheckWorker.errorCounts < 10) {
              moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
            } else {
              moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
            }
          } else if (hasError) {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
          } else {
            moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
          }
        }
      });
    } else {
      moduleCTIClientConnectionCheckWorker.errorCounts = 0;
      moduleCTIClientConnectionCheckWorker.renderDisabledPanel();
    }
  },

  /**
   * Сообщение в панели статусов, когда модуль выключен.
   */
  renderDisabledPanel: function renderDisabledPanel() {
    var $panel = moduleCTIClientConnectionCheckWorker.$servicesStatus;

    if (!$panel || $panel.length === 0) {
      return;
    }

    var label = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusModuleDisabled ? globalTranslate.mod_cti_StatusModuleDisabled : 'Module is disabled';
    $panel.html("<div class=\"ui basic segment\">".concat(moduleCTIClientConnectionCheckWorker.escapeHtml(label), "</div>"));
  },

  /**
   * Рендер панели «лампочка + сервис + area + uptime + версия».
   *
   * @param {Object} data Ответ API (response.data).
   */
  renderServicesStatus: function renderServicesStatus(data) {
    var $panel = moduleCTIClientConnectionCheckWorker.$servicesStatus;

    if (!$panel || $panel.length === 0) {
      return;
    }

    var $rows = $('#cti-services-status-rows');
    var $placeholder = $('#cti-services-status-placeholder');

    var showPlaceholder = function showPlaceholder(text) {
      $rows.empty();

      if ($placeholder.length > 0) {
        $placeholder.html("<span>&nbsp;".concat(moduleCTIClientConnectionCheckWorker.escapeHtml(text), "</span>")).show();
      } else {
        $panel.html("<div class=\"ui basic segment\">".concat(moduleCTIClientConnectionCheckWorker.escapeHtml(text), "</div>"));
      }
    };

    var statuses = data && data.statuses ? data.statuses : null; // Бэк может вернуть строку 'Module disabled' вместо массива.

    if (!Array.isArray(statuses)) {
      var text = typeof statuses === 'string' ? statuses : typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusUnavailable ? globalTranslate.mod_cti_StatusUnavailable : 'Status unavailable';
      showPlaceholder(text);
      return;
    } // Сгруппируем по имени сервиса. Внутри группы — строки по area.


    var groups = {};
    var order = [];
    statuses.forEach(function (svc) {
      if (!svc || _typeof(svc) !== 'object') {
        return;
      }

      var name = typeof svc.name === 'string' && svc.name.length > 0 ? svc.name : 'unknown';

      if (!groups[name]) {
        groups[name] = [];
        order.push(name);
      }

      groups[name].push(svc);
    });
    var parts = [];
    order.forEach(function (name) {
      var rows = groups[name];
      var isMulti = moduleCTIClientConnectionCheckWorker.multiInstanceServices[name] === true || rows.length > 1;

      if (isMulti) {
        parts.push("<div class=\"cti-svc-group-header\">".concat(moduleCTIClientConnectionCheckWorker.escapeHtml(moduleCTIClientConnectionCheckWorker.serviceLabel(name)), "</div>"));
        rows.forEach(function (svc) {
          parts.push(moduleCTIClientConnectionCheckWorker.renderServiceRow(svc, true));
        });
      } else {
        parts.push(moduleCTIClientConnectionCheckWorker.renderServiceRow(rows[0], false));
      }
    });

    if (parts.length === 0) {
      var empty = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusEmpty ? globalTranslate.mod_cti_StatusEmpty : 'No services reported';
      showPlaceholder(empty);
      return;
    }

    $rows.html(parts.join(''));

    if ($placeholder.length > 0) {
      $placeholder.hide();
    }
  },

  /**
   * Рендер одной строки сервиса.
   *
   * @param {Object} svc запись из statuses[]
   * @param {boolean} grouped true если строка идёт под групповым заголовком (multi-instance)
   * @returns {string} HTML
   */
  renderServiceRow: function renderServiceRow(svc, grouped) {
    var stateRaw = typeof svc.state === 'string' && svc.state.length > 0 ? svc.state : 'unknown';
    var ledClass = moduleCTIClientConnectionCheckWorker.stateLedClass[stateRaw] || 'warn';
    var displayName = grouped ? moduleCTIClientConnectionCheckWorker.shortArea(svc.area) : moduleCTIClientConnectionCheckWorker.serviceLabel(svc.name);
    var uptime = typeof svc.uptime === 'string' && svc.uptime.length > 0 ? svc.uptime : '';
    var version = typeof svc.version === 'string' && svc.version.length > 0 ? svc.version : '';
    var lastError = typeof svc.last_error === 'string' && svc.last_error.length > 0 ? svc.last_error : '';
    var uptimeLabel = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_Uptime ? globalTranslate.mod_cti_Uptime : 'Uptime';
    var versionLabel = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_Version ? globalTranslate.mod_cti_Version : 'Version';
    var esc = moduleCTIClientConnectionCheckWorker.escapeHtml;
    var metaParts = [];

    if (uptime !== '') {
      metaParts.push("<span class=\"cti-svc-meta\">".concat(esc(uptimeLabel), ": ").concat(esc(uptime), "</span>"));
    }

    if (version !== '') {
      metaParts.push("<span class=\"cti-svc-meta\">".concat(esc(versionLabel), ": ").concat(esc(version), "</span>"));
    }

    var extra = '';

    if (grouped && svc.area) {// area уже в displayName; ничего дополнительно не печатаем.
    } else if (!grouped && typeof svc.area === 'string' && svc.area.length > 0) {
      extra = "<span class=\"cti-svc-area\">".concat(esc(moduleCTIClientConnectionCheckWorker.shortArea(svc.area)), "</span>");
    }

    var errBlock = lastError !== '' ? "<span class=\"cti-svc-error\" title=\"".concat(esc(lastError), "\">").concat(esc(moduleCTIClientConnectionCheckWorker.truncate(lastError, 120)), "</span>") : '';
    return "<div class=\"cti-svc-row\" data-svc=\"".concat(esc(svc.name || ''), "\" data-area=\"").concat(esc(svc.area || ''), "\">") + "<span class=\"cti-svc-led ".concat(esc(ledClass), "\" title=\"").concat(esc(stateRaw), "\"></span>") + "<span class=\"cti-svc-name\">".concat(esc(displayName), "</span>") + extra + metaParts.join(' &middot; ') + errBlock + '</div>';
  },

  /**
   * Человекочитаемое имя сервиса.
   *
   * @param {string} name
   * @returns {string}
   */
  serviceLabel: function serviceLabel(name) {
    var map = {
      monitord: 'mod_cti_svc_monitord',
      nats: 'mod_cti_svc_nats',
      'crm-1c': 'mod_cti_svc_crm',
      auth: 'mod_cti_svc_auth',
      proxy: 'mod_cti_svc_proxy',
      'ami-listener': 'mod_cti_svc_ami',
      chats: 'mod_cti_svc_chats',
      tg: 'mod_cti_svc_tg',
      max: 'mod_cti_svc_max',
      'manager.api': 'mod_cti_svc_manager_api',
      'remote-tunnel': 'mod_cti_svc_remote_tunnel'
    };
    var key = map[name];

    if (key && typeof globalTranslate !== 'undefined' && globalTranslate[key]) {
      return globalTranslate[key];
    }

    return name || 'unknown';
  },

  /**
   * Человекочитаемое представление state.
   *
   * @param {string} state
   * @returns {string}
   */
  stateText: function stateText(state) {
    var key = "mod_cti_state_".concat(state);

    if (typeof globalTranslate !== 'undefined' && globalTranslate[key]) {
      return globalTranslate[key];
    }

    return state;
  },

  /**
   * Короткое представление area-GUID — первые 8 символов.
   *
   * @param {string} area
   * @returns {string}
   */
  shortArea: function shortArea(area) {
    if (typeof area !== 'string' || area.length === 0) {
      return '';
    }

    if (area.length <= 12) {
      return area;
    }

    return "".concat(area.substring(0, 8), "\u2026");
  },

  /**
   * Усечение строки.
   *
   * @param {string} str
   * @param {number} max
   * @returns {string}
   */
  truncate: function truncate(str, max) {
    if (typeof str !== 'string') {
      return '';
    }

    if (str.length <= max) {
      return str;
    }

    return "".concat(str.substring(0, max), "\u2026");
  },

  /**
   * Безопасный экранер HTML.
   *
   * @param {*} value
   * @returns {string}
   */
  escapeHtml: function escapeHtml(value) {
    if (value === null || typeof value === 'undefined') {
      return '';
    }

    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /**
   * Обновление статуса модуля (бейдж в правом верхнем углу).
   *
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJzdGF0ZUxlZENsYXNzIiwib2siLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJjcm0xYyIsImhhc0Vycm9yIiwiaGFzU3RhcnRpbmciLCJmb3JFYWNoIiwicyIsIm5hbWUiLCJzdGF0ZSIsInJlbmRlckRpc2FibGVkUGFuZWwiLCIkcGFuZWwiLCJsYWJlbCIsImdsb2JhbFRyYW5zbGF0ZSIsIm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQiLCJodG1sIiwiZXNjYXBlSHRtbCIsIiRyb3dzIiwiJHBsYWNlaG9sZGVyIiwic2hvd1BsYWNlaG9sZGVyIiwidGV4dCIsImVtcHR5Iiwic2hvdyIsIm1vZF9jdGlfU3RhdHVzVW5hdmFpbGFibGUiLCJncm91cHMiLCJvcmRlciIsInN2YyIsInB1c2giLCJwYXJ0cyIsInJvd3MiLCJpc011bHRpIiwic2VydmljZUxhYmVsIiwicmVuZGVyU2VydmljZVJvdyIsIm1vZF9jdGlfU3RhdHVzRW1wdHkiLCJqb2luIiwiaGlkZSIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImxlZENsYXNzIiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwidXB0aW1lIiwidmVyc2lvbiIsImxhc3RFcnJvciIsImxhc3RfZXJyb3IiLCJ1cHRpbWVMYWJlbCIsIm1vZF9jdGlfVXB0aW1lIiwidmVyc2lvbkxhYmVsIiwibW9kX2N0aV9WZXJzaW9uIiwiZXNjIiwibWV0YVBhcnRzIiwiZXh0cmEiLCJlcnJCbG9jayIsInRydW5jYXRlIiwibWFwIiwibW9uaXRvcmQiLCJuYXRzIiwicHJveHkiLCJrZXkiLCJzdGF0ZVRleHQiLCJzdWJzdHJpbmciLCJzdHIiLCJ2YWx1ZSIsIlN0cmluZyIsInN0YXR1cyIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJtb2RfY3RpX0Nvbm5lY3RlZCIsIm1vZF9jdGlfRGlzY29ubmVjdGVkIiwibW9kX2N0aV9Db25uZWN0aW9uUHJvZ3Jlc3MiLCJtb2RfY3RpX0Nvbm5lY3Rpb25XYWl0IiwibW9kX2N0aV9Db25uZWN0aW9uVG8xQ0Vycm9yIiwibW9kX2N0aV9Db25uZWN0aW9uRXJyb3IiLCJtb2RfY3RpX1VwZGF0ZVN0YXR1cyJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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Q0YsZUFBZSxDQUFDeUQsMEJBRjlEO0FBR0E7O0FBQ0QsV0FBSyxvQkFBTDtBQUNDdEksUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0U2SCxRQURGLENBQ1csUUFEWCxFQUVFcEQsSUFGRixpREFFOENGLGVBQWUsQ0FBQzBELHNCQUY5RDtBQUdBOztBQUNELFdBQUsscUJBQUw7QUFDQ3ZJLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFNkgsUUFERixDQUNXLFFBRFgsRUFFRXBELElBRkYsaURBRThDRixlQUFlLENBQUMyRCwyQkFGOUQ7QUFHQTs7QUFDRCxXQUFLLGlCQUFMO0FBQ0N4SSxRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRTZILFFBREYsQ0FDVyxLQURYLEVBRUVwRCxJQUZGLGlEQUU4Q0YsZUFBZSxDQUFDNEQsdUJBRjlEO0FBR0E7O0FBQ0QsV0FBSyxVQUFMO0FBQ0N6SSxRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRTZILFFBREYsQ0FDVyxNQURYLEVBRUVwRCxJQUZGLGlEQUU4Q0YsZUFBZSxDQUFDNkQsb0JBRjlEO0FBR0E7O0FBQ0Q7QUFDQzFJLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFNkgsUUFERixDQUNXLEtBRFgsRUFFRXBELElBRkYsQ0FFT0YsZUFBZSxDQUFDNEQsdUJBRnZCO0FBR0E7QUF4Q0Y7QUEwQ0E7QUEzYjJDLENBQTdDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIE1pa29QQlggLSBmcmVlIHBob25lIHN5c3RlbSBmb3Igc21hbGwgYnVzaW5lc3NcbiAqIENvcHlyaWdodCAoQykgMjAxNy0yMDIxIEFsZXhleSBQb3J0bm92IGFuZCBOaWtvbGF5IEJla2V0b3ZcbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICogaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAqIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb247IGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gKiAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICogYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAqIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYWxvbmcgd2l0aCB0aGlzIHByb2dyYW0uXG4gKiBJZiBub3QsIHNlZSA8aHR0cHM6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuICovXG5cbi8qIGdsb2JhbCBnbG9iYWxUcmFuc2xhdGUsIEZvcm0sIENvbmZpZywgUGJ4QXBpICovXG5cbi8qKlxuICog0KLQtdGB0YLQuNGA0L7QstCw0L3QuNC1INGB0L7QtdC00LjQvdC10L3QuNGPINC80L7QtNGD0LvRjyDRgSAx0KEgKyDRgNC10L3QtNC10YAg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIg0YHQtdGA0LLQuNGB0L7Qsi5cbiAqL1xuY29uc3QgbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyID0ge1xuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCR3ZWJTZXJ2aWNlVG9nZ2xlOiAkKCcjd2ViLXNlcnZpY2UtbW9kZS10b2dnbGUnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI3N0YXR1cycpLFxuXHQkc3VibWl0QnV0dG9uOiAkKCcjc3VibWl0YnV0dG9uJyksXG5cdCRkZWJ1Z0luZm86ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIHNwYW4jZGVidWctaW5mbycpLFxuXHQkc2VydmljZXNTdGF0dXM6ICQoJyNjdGktc2VydmljZXMtc3RhdHVzJyksXG5cdHRpbWVPdXQ6IDMwMDAsXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxuXHRlcnJvckNvdW50czogMCxcblxuXHQvKipcblx0ICog0JzQsNC/0L/QuNC90LMgc3RhdGUgLT4gQ1NTLdC60LvQsNGB0YEg0LvQsNC80L/QvtGH0LrQuC5cblx0ICog0JvRjtCx0L7QtSDQvdC10LjQt9Cy0LXRgdGC0L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAtPiDQttGR0LvRgtC+0LUgKHdhcm4pLlxuXHQgKi9cblx0c3RhdGVMZWRDbGFzczoge1xuXHRcdG9rOiAnb2snLFxuXHRcdGVycm9yOiAnZXJyb3InLFxuXHRcdGZhaWw6ICdlcnJvcicsXG5cdFx0ZmFpbGVkOiAnZXJyb3InLFxuXHRcdGRvd246ICdlcnJvcicsXG5cdFx0c3RvcHBlZDogJ2Vycm9yJyxcblx0XHR1bmtub3duOiAndW5rbm93bicsXG5cdFx0cGVuZGluZzogJ3dhcm4nLFxuXHRcdHN0YXJ0aW5nOiAnd2FybicsXG5cdFx0cXJjb2RlOiAnd2FybicsXG5cdFx0YXV0aDogJ3dhcm4nLFxuXHRcdGF1dGhfcmVxdWlyZWQ6ICd3YXJuJyxcblx0XHR3YXJuOiAnd2FybicsXG5cdFx0d2FybmluZzogJ3dhcm4nLFxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC10YDQstC40YHRiywg0LrQvtGC0L7RgNGL0LUg0LzQvtCz0YPRgiDQuNC00YLQuCDQsiDQvdC10YHQutC+0LvRjNC60LjRhSDQuNC90YHRgtCw0L3RgdCw0YUg0YEg0YDQsNC30L3Ri9C8IGFyZWEuXG5cdCAqL1xuXHRtdWx0aUluc3RhbmNlU2VydmljZXM6IHtcblx0XHRjaGF0czogdHJ1ZSxcblx0XHR0ZzogdHJ1ZSxcblx0XHRtYXg6IHRydWUsXG5cdH0sXG5cblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVzdGFydFdvcmtlcigpO1xuXHR9LFxuXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdVcGRhdGluZycpO1xuXHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIoKTtcblx0fSxcblxuXHR3b3JrZXIoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc3RhdHVzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdCQuYXBpKHtcblx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9jaGVja2AsXG5cdFx0XHRcdG9uOiAnbm93Jyxcblx0XHRcdFx0c3VjY2Vzc1Rlc3Q6IFBieEFwaS5zdWNjZXNzVGVzdCxcblx0XHRcdFx0b25Db21wbGV0ZSgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcixcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uUmVzcG9uc2UocmVzcG9uc2UpIHtcblx0XHRcdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUmVuZGVyIHNlcnZpY2VzIHN0YXR1cyBwYW5lbCBmb3IgYm90aCBzdWNjZXNzIGFuZCBwYXJ0aWFsIHJlc3BvbnNlcy5cblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyU2VydmljZXNTdGF0dXMocmVzcG9uc2UuZGF0YSk7XG5cblx0XHRcdFx0XHQvLyBEZWJ1ZyBKU09OIHBhbmUgKGxlZ2FjeSBkZWJ1ZyB0YWIpLlxuXHRcdFx0XHRcdGxldCB2aXN1YWxFcnJvclN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLmRhdGEsIG51bGwsIDIpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgdmlzdWFsRXJyb3JTdHJpbmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHR2aXN1YWxFcnJvclN0cmluZyA9IHZpc3VhbEVycm9yU3RyaW5nLnJlcGxhY2UoL1xcbi9nLCAnPGJyLz4nKTtcblx0XHRcdFx0XHRcdGlmIChPYmplY3Qua2V5cyhyZXNwb25zZSkubGVuZ3RoID4gMCAmJiByZXNwb25zZS5yZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRkZWJ1Z0luZm9cblx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+ICR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT5cblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+JHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0XHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZhaWx1cmUocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgKz0gMTtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNlcyA9IChyZXNwb25zZSAmJiByZXNwb25zZS5kYXRhICYmIEFycmF5LmlzQXJyYXkocmVzcG9uc2UuZGF0YS5zdGF0dXNlcykpXG5cdFx0XHRcdFx0XHQ/IHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXHRcdFx0XHRcdGlmICghc3RhdHVzZXMpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDbGFzc2lmeSB0aGUgcmVzcG9uc2UgYnkgdGhlIHdvcnN0IG5vbi1zeXN0ZW0gc3RhdGUuXG5cdFx0XHRcdFx0Ly8gY3JtLTFjIGlzIHNwZWNpYWw6IGl0J3MgdGhlIDFDIGJyaWRnZSDigJQgaXRzIG93biBlcnJvciBsYWJlbC5cblx0XHRcdFx0XHRsZXQgY3JtMWMgPSBudWxsO1xuXHRcdFx0XHRcdGxldCBoYXNFcnJvciA9IGZhbHNlO1xuXHRcdFx0XHRcdGxldCBoYXNTdGFydGluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdHN0YXR1c2VzLmZvckVhY2goKHMpID0+IHtcblx0XHRcdFx0XHRcdGlmICghcyB8fCB0eXBlb2Ygcy5uYW1lID09PSAndW5kZWZpbmVkJykgcmV0dXJuO1xuXHRcdFx0XHRcdFx0aWYgKHMubmFtZSA9PT0gJ2NybS0xYycpIGNybTFjID0gcy5zdGF0ZTtcblx0XHRcdFx0XHRcdGlmIChzLnN0YXRlID09PSAnZXJyb3InIHx8IHMuc3RhdGUgPT09ICdmYWlsJyB8fCBzLnN0YXRlID09PSAnZmFpbGVkJ1xuXHRcdFx0XHRcdFx0XHR8fCBzLnN0YXRlID09PSAnZG93bicgfHwgcy5zdGF0ZSA9PT0gJ3N0b3BwZWQnKSBoYXNFcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ3N0YXJ0aW5nJyB8fCBzLnN0YXRlID09PSAncGVuZGluZydcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ3Vua25vd24nKSBoYXNTdGFydGluZyA9IHRydWU7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKGNybTFjICYmIGNybTFjICE9PSAnb2snKSB7XG5cdFx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiR3ZWJTZXJ2aWNlVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNFcnJvcicpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNXYWl0Jyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNTdGFydGluZykge1xuXHRcdFx0XHRcdFx0Ly8gU3RpbGwgc3RhcnRpbmc6IHNob3cgcHJvZ3Jlc3MgdW50aWwgd2UgZ2l2ZSB1cCBhZnRlciAxMFxuXHRcdFx0XHRcdFx0Ly8gZmFpbGVkIHBvbGxzLCB0aGVuIHRyZWF0IHRoZSBzdHVjayBkYWVtb24gYXMgYW4gZXJyb3Jcblx0XHRcdFx0XHRcdC8vIGluc3RlYWQgb2YgZmFsc2VseSByZXBvcnRpbmcgaXQgYXMgQ29ubmVjdGVkLlxuXHRcdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA8IDEwKSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25Qcm9ncmVzcycpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNFcnJvcikge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlckRpc2FibGVkUGFuZWwoKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0L7QvtCx0YnQtdC90LjQtSDQsiDQv9Cw0L3QtdC70Lgg0YHRgtCw0YLRg9GB0L7Qsiwg0LrQvtCz0LTQsCDQvNC+0LTRg9C70Ywg0LLRi9C60LvRjtGH0LXQvS5cblx0ICovXG5cdHJlbmRlckRpc2FibGVkUGFuZWwoKSB7XG5cdFx0Y29uc3QgJHBhbmVsID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhYmVsID0gKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnXG5cdFx0XHQmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZClcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWRcblx0XHRcdDogJ01vZHVsZSBpcyBkaXNhYmxlZCc7XG5cdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXNjYXBlSHRtbChsYWJlbCl9PC9kaXY+YCk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCg0LXQvdC00LXRgCDQv9Cw0L3QtdC70LggwqvQu9Cw0LzQv9C+0YfQutCwICsg0YHQtdGA0LLQuNGBICsgYXJlYSArIHVwdGltZSArINCy0LXRgNGB0LjRj8K7LlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZGF0YSDQntGC0LLQtdGCIEFQSSAocmVzcG9uc2UuZGF0YSkuXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlc1N0YXR1cyhkYXRhKSB7XG5cdFx0Y29uc3QgJHBhbmVsID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgJHJvd3MgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzJyk7XG5cdFx0Y29uc3QgJHBsYWNlaG9sZGVyID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcGxhY2Vob2xkZXInKTtcblx0XHRjb25zdCBzaG93UGxhY2Vob2xkZXIgPSAodGV4dCkgPT4ge1xuXHRcdFx0JHJvd3MuZW1wdHkoKTtcblx0XHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQkcGxhY2Vob2xkZXIuaHRtbChgPHNwYW4+Jm5ic3A7JHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXNjYXBlSHRtbCh0ZXh0KX08L3NwYW4+YCkuc2hvdygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXNjYXBlSHRtbCh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXG5cdFx0Ly8g0JHRjdC6INC80L7QttC10YIg0LLQtdGA0L3Rg9GC0Ywg0YHRgtGA0L7QutGDICdNb2R1bGUgZGlzYWJsZWQnINCy0LzQtdGB0YLQviDQvNCw0YHRgdC40LLQsC5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdHVzZXMpKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gKHR5cGVvZiBzdGF0dXNlcyA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdD8gc3RhdHVzZXNcblx0XHRcdFx0OiAoKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c1VuYXZhaWxhYmxlKVxuXHRcdFx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzVW5hdmFpbGFibGVcblx0XHRcdFx0XHQ6ICdTdGF0dXMgdW5hdmFpbGFibGUnKTtcblx0XHRcdHNob3dQbGFjZWhvbGRlcih0ZXh0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQodCz0YDRg9C/0L/QuNGA0YPQtdC8INC/0L4g0LjQvNC10L3QuCDRgdC10YDQstC40YHQsC4g0JLQvdGD0YLRgNC4INCz0YDRg9C/0L/RiyDigJQg0YHRgtGA0L7QutC4INC/0L4gYXJlYS5cblx0XHRjb25zdCBncm91cHMgPSB7fTtcblx0XHRjb25zdCBvcmRlciA9IFtdO1xuXHRcdHN0YXR1c2VzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0aWYgKCFzdmMgfHwgdHlwZW9mIHN2YyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmFtZSA9ICh0eXBlb2Ygc3ZjLm5hbWUgPT09ICdzdHJpbmcnICYmIHN2Yy5uYW1lLmxlbmd0aCA+IDApID8gc3ZjLm5hbWUgOiAndW5rbm93bic7XG5cdFx0XHRpZiAoIWdyb3Vwc1tuYW1lXSkge1xuXHRcdFx0XHRncm91cHNbbmFtZV0gPSBbXTtcblx0XHRcdFx0b3JkZXIucHVzaChuYW1lKTtcblx0XHRcdH1cblx0XHRcdGdyb3Vwc1tuYW1lXS5wdXNoKHN2Yyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJ0cyA9IFtdO1xuXHRcdG9yZGVyLmZvckVhY2goKG5hbWUpID0+IHtcblx0XHRcdGNvbnN0IHJvd3MgPSBncm91cHNbbmFtZV07XG5cdFx0XHRjb25zdCBpc011bHRpID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLm11bHRpSW5zdGFuY2VTZXJ2aWNlc1tuYW1lXSA9PT0gdHJ1ZVxuXHRcdFx0XHR8fCByb3dzLmxlbmd0aCA+IDE7XG5cdFx0XHRpZiAoaXNNdWx0aSkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGA8ZGl2IGNsYXNzPVwiY3RpLXN2Yy1ncm91cC1oZWFkZXJcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKFxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zZXJ2aWNlTGFiZWwobmFtZSksXG5cdFx0XHRcdCl9PC9kaXY+YCk7XG5cdFx0XHRcdHJvd3MuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyU2VydmljZVJvdyhzdmMsIHRydWUpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlUm93KHJvd3NbMF0sIGZhbHNlKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCBlbXB0eSA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNFbXB0eSlcblx0XHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNFbXB0eVxuXHRcdFx0XHQ6ICdObyBzZXJ2aWNlcyByZXBvcnRlZCc7XG5cdFx0XHRzaG93UGxhY2Vob2xkZXIoZW1wdHkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdCRyb3dzLmh0bWwocGFydHMuam9pbignJykpO1xuXHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0JHBsYWNlaG9sZGVyLmhpZGUoKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCg0LXQvdC00LXRgCDQvtC00L3QvtC5INGB0YLRgNC+0LrQuCDRgdC10YDQstC40YHQsC5cblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R9IHN2YyDQt9Cw0L/QuNGB0Ywg0LjQtyBzdGF0dXNlc1tdXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gZ3JvdXBlZCB0cnVlINC10YHQu9C4INGB0YLRgNC+0LrQsCDQuNC00ZHRgiDQv9C+0LQg0LPRgNGD0L/Qv9C+0LLRi9C8INC30LDQs9C+0LvQvtCy0LrQvtC8IChtdWx0aS1pbnN0YW5jZSlcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTFxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQpIHtcblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgbGVkQ2xhc3MgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc3RhdGVMZWRDbGFzc1tzdGF0ZVJhd10gfHwgJ3dhcm4nO1xuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ3JvdXBlZFxuXHRcdFx0PyBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc2VydmljZUxhYmVsKHN2Yy5uYW1lKTtcblx0XHRjb25zdCB1cHRpbWUgPSAodHlwZW9mIHN2Yy51cHRpbWUgPT09ICdzdHJpbmcnICYmIHN2Yy51cHRpbWUubGVuZ3RoID4gMCkgPyBzdmMudXB0aW1lIDogJyc7XG5cdFx0Y29uc3QgdmVyc2lvbiA9ICh0eXBlb2Ygc3ZjLnZlcnNpb24gPT09ICdzdHJpbmcnICYmIHN2Yy52ZXJzaW9uLmxlbmd0aCA+IDApID8gc3ZjLnZlcnNpb24gOiAnJztcblx0XHRjb25zdCBsYXN0RXJyb3IgPSAodHlwZW9mIHN2Yy5sYXN0X2Vycm9yID09PSAnc3RyaW5nJyAmJiBzdmMubGFzdF9lcnJvci5sZW5ndGggPiAwKSA/IHN2Yy5sYXN0X2Vycm9yIDogJyc7XG5cblx0XHRjb25zdCB1cHRpbWVMYWJlbCA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9VcHRpbWUpXG5cdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwdGltZVxuXHRcdFx0OiAnVXB0aW1lJztcblx0XHRjb25zdCB2ZXJzaW9uTGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmVyc2lvbilcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmVyc2lvblxuXHRcdFx0OiAnVmVyc2lvbic7XG5cblx0XHRjb25zdCBlc2MgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXNjYXBlSHRtbDtcblxuXHRcdGNvbnN0IG1ldGFQYXJ0cyA9IFtdO1xuXHRcdGlmICh1cHRpbWUgIT09ICcnKSB7XG5cdFx0XHRtZXRhUGFydHMucHVzaChgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLW1ldGFcIj4ke2VzYyh1cHRpbWVMYWJlbCl9OiAke2VzYyh1cHRpbWUpfTwvc3Bhbj5gKTtcblx0XHR9XG5cdFx0aWYgKHZlcnNpb24gIT09ICcnKSB7XG5cdFx0XHRtZXRhUGFydHMucHVzaChgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLW1ldGFcIj4ke2VzYyh2ZXJzaW9uTGFiZWwpfTogJHtlc2ModmVyc2lvbil9PC9zcGFuPmApO1xuXHRcdH1cblxuXHRcdGxldCBleHRyYSA9ICcnO1xuXHRcdGlmIChncm91cGVkICYmIHN2Yy5hcmVhKSB7XG5cdFx0XHQvLyBhcmVhINGD0LbQtSDQsiBkaXNwbGF5TmFtZTsg0L3QuNGH0LXQs9C+INC00L7Qv9C+0LvQvdC40YLQtdC70YzQvdC+INC90LUg0L/QtdGH0LDRgtCw0LXQvC5cblx0XHR9IGVsc2UgaWYgKCFncm91cGVkICYmIHR5cGVvZiBzdmMuYXJlYSA9PT0gJ3N0cmluZycgJiYgc3ZjLmFyZWEubGVuZ3RoID4gMCkge1xuXHRcdFx0ZXh0cmEgPSBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWFyZWFcIj4ke2VzYyhtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc2hvcnRBcmVhKHN2Yy5hcmVhKSl9PC9zcGFuPmA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXJyQmxvY2sgPSBsYXN0RXJyb3IgIT09ICcnXG5cdFx0XHQ/IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtZXJyb3JcIiB0aXRsZT1cIiR7ZXNjKGxhc3RFcnJvcil9XCI+JHtlc2MobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRydW5jYXRlKGxhc3RFcnJvciwgMTIwKSl9PC9zcGFuPmBcblx0XHRcdDogJyc7XG5cblx0XHRyZXR1cm4gYDxkaXYgY2xhc3M9XCJjdGktc3ZjLXJvd1wiIGRhdGEtc3ZjPVwiJHtlc2Moc3ZjLm5hbWUgfHwgJycpfVwiIGRhdGEtYXJlYT1cIiR7ZXNjKHN2Yy5hcmVhIHx8ICcnKX1cIj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbGVkICR7ZXNjKGxlZENsYXNzKX1cIiB0aXRsZT1cIiR7ZXNjKHN0YXRlUmF3KX1cIj48L3NwYW4+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLW5hbWVcIj4ke2VzYyhkaXNwbGF5TmFtZSl9PC9zcGFuPmBcblx0XHRcdCsgZXh0cmFcblx0XHRcdCsgbWV0YVBhcnRzLmpvaW4oJyAmbWlkZG90OyAnKVxuXHRcdFx0KyBlcnJCbG9ja1xuXHRcdFx0KyAnPC9kaXY+Jztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0LjQvNGPINGB0LXRgNCy0LjRgdCwLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c2VydmljZUxhYmVsKG5hbWUpIHtcblx0XHRjb25zdCBtYXAgPSB7XG5cdFx0XHRtb25pdG9yZDogJ21vZF9jdGlfc3ZjX21vbml0b3JkJyxcblx0XHRcdG5hdHM6ICdtb2RfY3RpX3N2Y19uYXRzJyxcblx0XHRcdCdjcm0tMWMnOiAnbW9kX2N0aV9zdmNfY3JtJyxcblx0XHRcdGF1dGg6ICdtb2RfY3RpX3N2Y19hdXRoJyxcblx0XHRcdHByb3h5OiAnbW9kX2N0aV9zdmNfcHJveHknLFxuXHRcdFx0J2FtaS1saXN0ZW5lcic6ICdtb2RfY3RpX3N2Y19hbWknLFxuXHRcdFx0Y2hhdHM6ICdtb2RfY3RpX3N2Y19jaGF0cycsXG5cdFx0XHR0ZzogJ21vZF9jdGlfc3ZjX3RnJyxcblx0XHRcdG1heDogJ21vZF9jdGlfc3ZjX21heCcsXG5cdFx0XHQnbWFuYWdlci5hcGknOiAnbW9kX2N0aV9zdmNfbWFuYWdlcl9hcGknLFxuXHRcdFx0J3JlbW90ZS10dW5uZWwnOiAnbW9kX2N0aV9zdmNfcmVtb3RlX3R1bm5lbCcsXG5cdFx0fTtcblx0XHRjb25zdCBrZXkgPSBtYXBbbmFtZV07XG5cdFx0aWYgKGtleSAmJiB0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdH1cblx0XHRyZXR1cm4gbmFtZSB8fCAndW5rbm93bic7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCn0LXQu9C+0LLQtdC60L7Rh9C40YLQsNC10LzQvtC1INC/0YDQtdC00YHRgtCw0LLQu9C10L3QuNC1IHN0YXRlLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHN0YXRlVGV4dChzdGF0ZSkge1xuXHRcdGNvbnN0IGtleSA9IGBtb2RfY3RpX3N0YXRlXyR7c3RhdGV9YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQmtC+0YDQvtGC0LrQvtC1INC/0YDQtdC00YHRgtCw0LLQu9C10L3QuNC1IGFyZWEtR1VJRCDigJQg0L/QtdGA0LLRi9C1IDgg0YHQuNC80LLQvtC70L7Qsi5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGFyZWFcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHNob3J0QXJlYShhcmVhKSB7XG5cdFx0aWYgKHR5cGVvZiBhcmVhICE9PSAnc3RyaW5nJyB8fCBhcmVhLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAoYXJlYS5sZW5ndGggPD0gMTIpIHtcblx0XHRcdHJldHVybiBhcmVhO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7YXJlYS5zdWJzdHJpbmcoMCwgOCl94oCmYDtcblx0fSxcblxuXHQvKipcblx0ICog0KPRgdC10YfQtdC90LjQtSDRgdGC0YDQvtC60LguXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdHJcblx0ICogQHBhcmFtIHtudW1iZXJ9IG1heFxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0dHJ1bmNhdGUoc3RyLCBtYXgpIHtcblx0XHRpZiAodHlwZW9mIHN0ciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKHN0ci5sZW5ndGggPD0gbWF4KSB7XG5cdFx0XHRyZXR1cm4gc3RyO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7c3RyLnN1YnN0cmluZygwLCBtYXgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCR0LXQt9C+0L/QsNGB0L3Ri9C5INGN0LrRgNCw0L3QtdGAIEhUTUwuXG5cdCAqXG5cdCAqIEBwYXJhbSB7Kn0gdmFsdWVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGVzY2FwZUh0bWwodmFsdWUpIHtcblx0XHRpZiAodmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gU3RyaW5nKHZhbHVlKVxuXHRcdFx0LnJlcGxhY2UoLyYvZywgJyZhbXA7Jylcblx0XHRcdC5yZXBsYWNlKC88L2csICcmbHQ7Jylcblx0XHRcdC5yZXBsYWNlKC8+L2csICcmZ3Q7Jylcblx0XHRcdC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jylcblx0XHRcdC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQntCx0L3QvtCy0LvQtdC90LjQtSDRgdGC0LDRgtGD0YHQsCDQvNC+0LTRg9C70Y8gKNCx0LXQudC00LYg0LIg0L/RgNCw0LLQvtC8INCy0LXRgNGF0L3QtdC8INGD0LPQu9GDKS5cblx0ICpcblx0ICogQHBhcmFtIHN0YXR1c1xuXHQgKi9cblx0Y2hhbmdlU3RhdHVzKHN0YXR1cykge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZXknKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCdncmVlbicpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3JlZCcpO1xuXG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgJ0Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmVlbicpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JleScpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRGlzY29ubmVjdGVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uUHJvZ3Jlc3MnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzc31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ1dhaXQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25XYWl0fWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3J9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3JlZCcpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3J9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnVXBkYXRpbmcnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JleScpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9VcGRhdGVTdGF0dXN9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3JlZCcpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9LFxufTtcbiJdfQ==