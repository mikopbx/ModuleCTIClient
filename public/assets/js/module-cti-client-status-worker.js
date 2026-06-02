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
          } else if (hasStarting && moduleCTIClientConnectionCheckWorker.errorCounts < 10) {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJzdGF0ZUxlZENsYXNzIiwib2siLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJjcm0xYyIsImhhc0Vycm9yIiwiaGFzU3RhcnRpbmciLCJmb3JFYWNoIiwicyIsIm5hbWUiLCJzdGF0ZSIsInJlbmRlckRpc2FibGVkUGFuZWwiLCIkcGFuZWwiLCJsYWJlbCIsImdsb2JhbFRyYW5zbGF0ZSIsIm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQiLCJodG1sIiwiZXNjYXBlSHRtbCIsIiRyb3dzIiwiJHBsYWNlaG9sZGVyIiwic2hvd1BsYWNlaG9sZGVyIiwidGV4dCIsImVtcHR5Iiwic2hvdyIsIm1vZF9jdGlfU3RhdHVzVW5hdmFpbGFibGUiLCJncm91cHMiLCJvcmRlciIsInN2YyIsInB1c2giLCJwYXJ0cyIsInJvd3MiLCJpc011bHRpIiwic2VydmljZUxhYmVsIiwicmVuZGVyU2VydmljZVJvdyIsIm1vZF9jdGlfU3RhdHVzRW1wdHkiLCJqb2luIiwiaGlkZSIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImxlZENsYXNzIiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwidXB0aW1lIiwidmVyc2lvbiIsImxhc3RFcnJvciIsImxhc3RfZXJyb3IiLCJ1cHRpbWVMYWJlbCIsIm1vZF9jdGlfVXB0aW1lIiwidmVyc2lvbkxhYmVsIiwibW9kX2N0aV9WZXJzaW9uIiwiZXNjIiwibWV0YVBhcnRzIiwiZXh0cmEiLCJlcnJCbG9jayIsInRydW5jYXRlIiwibWFwIiwibW9uaXRvcmQiLCJuYXRzIiwicHJveHkiLCJrZXkiLCJzdGF0ZVRleHQiLCJzdWJzdHJpbmciLCJzdHIiLCJ2YWx1ZSIsIlN0cmluZyIsInN0YXR1cyIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiLCJtb2RfY3RpX0Nvbm5lY3RlZCIsIm1vZF9jdGlfRGlzY29ubmVjdGVkIiwibW9kX2N0aV9Db25uZWN0aW9uUHJvZ3Jlc3MiLCJtb2RfY3RpX0Nvbm5lY3Rpb25XYWl0IiwibW9kX2N0aV9Db25uZWN0aW9uVG8xQ0Vycm9yIiwibW9kX2N0aV9Db25uZWN0aW9uRXJyb3IiLCJtb2RfY3RpX1VwZGF0ZVN0YXR1cyJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QURYLEVBRUVwRCxJQUZGLGlEQUU4Q0YsZUFBZSxDQUFDMEQsc0JBRjlEO0FBR0E7O0FBQ0QsV0FBSyxxQkFBTDtBQUNDdkksUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0U2SCxRQURGLENBQ1csUUFEWCxFQUVFcEQsSUFGRixpREFFOENGLGVBQWUsQ0FBQzJELDJCQUY5RDtBQUdBOztBQUNELFdBQUssaUJBQUw7QUFDQ3hJLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFNkgsUUFERixDQUNXLEtBRFgsRUFFRXBELElBRkYsaURBRThDRixlQUFlLENBQUM0RCx1QkFGOUQ7QUFHQTs7QUFDRCxXQUFLLFVBQUw7QUFDQ3pJLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFNkgsUUFERixDQUNXLE1BRFgsRUFFRXBELElBRkYsaURBRThDRixlQUFlLENBQUM2RCxvQkFGOUQ7QUFHQTs7QUFDRDtBQUNDMUksUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0U2SCxRQURGLENBQ1csS0FEWCxFQUVFcEQsSUFGRixDQUVPRixlQUFlLENBQUM0RCx1QkFGdkI7QUFHQTtBQXhDRjtBQTBDQTtBQXBiMkMsQ0FBN0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWlrb1BCWCAtIGZyZWUgcGhvbmUgc3lzdGVtIGZvciBzbWFsbCBidXNpbmVzc1xuICogQ29weXJpZ2h0IChDKSAyMDE3LTIwMjEgQWxleGV5IFBvcnRub3YgYW5kIE5pa29sYXkgQmVrZXRvdlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gKiBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICogdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbjsgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAqIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gKiBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICogTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cbiAqXG4gKiBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS5cbiAqIElmIG5vdCwgc2VlIDxodHRwczovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4gKi9cblxuLyogZ2xvYmFsIGdsb2JhbFRyYW5zbGF0ZSwgRm9ybSwgQ29uZmlnLCBQYnhBcGkgKi9cblxuLyoqXG4gKiDQotC10YHRgtC40YDQvtCy0LDQvdC40LUg0YHQvtC10LTQuNC90LXQvdC40Y8g0LzQvtC00YPQu9GPINGBIDHQoSArINGA0LXQvdC00LXRgCDQv9Cw0L3QtdC70Lgg0YHRgtCw0YLRg9GB0L7QsiDRgdC10YDQstC40YHQvtCyLlxuICovXG5jb25zdCBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIgPSB7XG5cdCRmb3JtT2JqOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybScpLFxuXHQkc3RhdHVzVG9nZ2xlOiAkKCcjbW9kdWxlLXN0YXR1cy10b2dnbGUnKSxcblx0JHdlYlNlcnZpY2VUb2dnbGU6ICQoJyN3ZWItc2VydmljZS1tb2RlLXRvZ2dsZScpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjc3RhdHVzJyksXG5cdCRzdWJtaXRCdXR0b246ICQoJyNzdWJtaXRidXR0b24nKSxcblx0JGRlYnVnSW5mbzogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gc3BhbiNkZWJ1Zy1pbmZvJyksXG5cdCRzZXJ2aWNlc1N0YXR1czogJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMnKSxcblx0dGltZU91dDogMzAwMCxcblx0dGltZU91dEhhbmRsZTogJycsXG5cdGVycm9yQ291bnRzOiAwLFxuXG5cdC8qKlxuXHQgKiDQnNCw0L/Qv9C40L3QsyBzdGF0ZSAtPiBDU1Mt0LrQu9Cw0YHRgSDQu9Cw0LzQv9C+0YfQutC4LlxuXHQgKiDQm9GO0LHQvtC1INC90LXQuNC30LLQtdGB0YLQvdC+0LUg0YHQvtGB0YLQvtGP0L3QuNC1IC0+INC20ZHQu9GC0L7QtSAod2FybikuXG5cdCAqL1xuXHRzdGF0ZUxlZENsYXNzOiB7XG5cdFx0b2s6ICdvaycsXG5cdFx0ZXJyb3I6ICdlcnJvcicsXG5cdFx0ZmFpbDogJ2Vycm9yJyxcblx0XHRmYWlsZWQ6ICdlcnJvcicsXG5cdFx0ZG93bjogJ2Vycm9yJyxcblx0XHRzdG9wcGVkOiAnZXJyb3InLFxuXHRcdHVua25vd246ICd1bmtub3duJyxcblx0XHRwZW5kaW5nOiAnd2FybicsXG5cdFx0c3RhcnRpbmc6ICd3YXJuJyxcblx0XHRxcmNvZGU6ICd3YXJuJyxcblx0XHRhdXRoOiAnd2FybicsXG5cdFx0YXV0aF9yZXF1aXJlZDogJ3dhcm4nLFxuXHRcdHdhcm46ICd3YXJuJyxcblx0XHR3YXJuaW5nOiAnd2FybicsXG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0LXRgNCy0LjRgdGLLCDQutC+0YLQvtGA0YvQtSDQvNC+0LPRg9GCINC40LTRgtC4INCyINC90LXRgdC60L7Qu9GM0LrQuNGFINC40L3RgdGC0LDQvdGB0LDRhSDRgSDRgNCw0LfQvdGL0LwgYXJlYS5cblx0ICovXG5cdG11bHRpSW5zdGFuY2VTZXJ2aWNlczoge1xuXHRcdGNoYXRzOiB0cnVlLFxuXHRcdHRnOiB0cnVlLFxuXHRcdG1heDogdHJ1ZSxcblx0fSxcblxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cblx0cmVzdGFydFdvcmtlcigpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ1VwZGF0aW5nJyk7XG5cdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcigpO1xuXHR9LFxuXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIChyZXNwb25zZS5kYXRhKSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZW5kZXIgc2VydmljZXMgc3RhdHVzIHBhbmVsIGZvciBib3RoIHN1Y2Nlc3MgYW5kIHBhcnRpYWwgcmVzcG9uc2VzLlxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlc1N0YXR1cyhyZXNwb25zZS5kYXRhKTtcblxuXHRcdFx0XHRcdC8vIERlYnVnIEpTT04gcGFuZSAobGVnYWN5IGRlYnVnIHRhYikuXG5cdFx0XHRcdFx0bGV0IHZpc3VhbEVycm9yU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuZGF0YSwgbnVsbCwgMik7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHZpc3VhbEVycm9yU3RyaW5nID0gdmlzdWFsRXJyb3JTdHJpbmcucmVwbGFjZSgvXFxuL2csICc8YnIvPicpO1xuXHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4gJHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXR1c2VzID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEgJiYgQXJyYXkuaXNBcnJheShyZXNwb25zZS5kYXRhLnN0YXR1c2VzKSlcblx0XHRcdFx0XHRcdD8gcmVzcG9uc2UuZGF0YS5zdGF0dXNlcyA6IG51bGw7XG5cdFx0XHRcdFx0aWYgKCFzdGF0dXNlcykge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENsYXNzaWZ5IHRoZSByZXNwb25zZSBieSB0aGUgd29yc3Qgbm9uLXN5c3RlbSBzdGF0ZS5cblx0XHRcdFx0XHQvLyBjcm0tMWMgaXMgc3BlY2lhbDogaXQncyB0aGUgMUMgYnJpZGdlIOKAlCBpdHMgb3duIGVycm9yIGxhYmVsLlxuXHRcdFx0XHRcdGxldCBjcm0xYyA9IG51bGw7XG5cdFx0XHRcdFx0bGV0IGhhc0Vycm9yID0gZmFsc2U7XG5cdFx0XHRcdFx0bGV0IGhhc1N0YXJ0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RhdHVzZXMuZm9yRWFjaCgocykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzIHx8IHR5cGVvZiBzLm5hbWUgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAocy5uYW1lID09PSAnY3JtLTFjJykgY3JtMWMgPSBzLnN0YXRlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdlcnJvcicgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWwnIHx8IHMuc3RhdGUgPT09ICdmYWlsZWQnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICdkb3duJyB8fCBzLnN0YXRlID09PSAnc3RvcHBlZCcpIGhhc0Vycm9yID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGlmIChzLnN0YXRlID09PSAnc3RhcnRpbmcnIHx8IHMuc3RhdGUgPT09ICdwZW5kaW5nJ1xuXHRcdFx0XHRcdFx0XHR8fCBzLnN0YXRlID09PSAndW5rbm93bicpIGhhc1N0YXJ0aW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoY3JtMWMgJiYgY3JtMWMgIT09ICdvaycpIHtcblx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHdlYlNlcnZpY2VUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ0Vycm9yJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXQnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1N0YXJ0aW5nICYmIG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA8IDEwKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc0Vycm9yKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGVkJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyRGlzYWJsZWRQYW5lbCgpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCAkcGFuZWwgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKGxhYmVsKX08L2Rpdj5gKTtcblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINC/0LDQvdC10LvQuCDCq9C70LDQvNC/0L7Rh9C60LAgKyDRgdC10YDQstC40YEgKyBhcmVhICsgdXB0aW1lICsg0LLQtdGA0YHQuNGPwrsuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhINCe0YLQstC10YIgQVBJIChyZXNwb25zZS5kYXRhKS5cblx0ICovXG5cdHJlbmRlclNlcnZpY2VzU3RhdHVzKGRhdGEpIHtcblx0XHRjb25zdCAkcGFuZWwgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCAkcm93cyA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXJvd3MnKTtcblx0XHRjb25zdCAkcGxhY2Vob2xkZXIgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1wbGFjZWhvbGRlcicpO1xuXHRcdGNvbnN0IHNob3dQbGFjZWhvbGRlciA9ICh0ZXh0KSA9PiB7XG5cdFx0XHQkcm93cy5lbXB0eSgpO1xuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdCRwbGFjZWhvbGRlci5odG1sKGA8c3Bhbj4mbmJzcDske21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKHRleHQpfTwvZGl2PmApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IChkYXRhICYmIGRhdGEuc3RhdHVzZXMpID8gZGF0YS5zdGF0dXNlcyA6IG51bGw7XG5cblx0XHQvLyDQkdGN0Log0LzQvtC20LXRgiDQstC10YDQvdGD0YLRjCDRgdGC0YDQvtC60YMgJ01vZHVsZSBkaXNhYmxlZCcg0LLQvNC10YHRgtC+INC80LDRgdGB0LjQstCwLlxuXHRcdGlmICghQXJyYXkuaXNBcnJheShzdGF0dXNlcykpIHtcblx0XHRcdGNvbnN0IHRleHQgPSAodHlwZW9mIHN0YXR1c2VzID09PSAnc3RyaW5nJylcblx0XHRcdFx0PyBzdGF0dXNlc1xuXHRcdFx0XHQ6ICgodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzVW5hdmFpbGFibGUpXG5cdFx0XHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZVxuXHRcdFx0XHRcdDogJ1N0YXR1cyB1bmF2YWlsYWJsZScpO1xuXHRcdFx0c2hvd1BsYWNlaG9sZGVyKHRleHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCh0LPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhLlxuXHRcdGNvbnN0IGdyb3VwcyA9IHt9O1xuXHRcdGNvbnN0IG9yZGVyID0gW107XG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRpZiAoIXN2YyB8fCB0eXBlb2Ygc3ZjICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuYW1lID0gKHR5cGVvZiBzdmMubmFtZSA9PT0gJ3N0cmluZycgJiYgc3ZjLm5hbWUubGVuZ3RoID4gMCkgPyBzdmMubmFtZSA6ICd1bmtub3duJztcblx0XHRcdGlmICghZ3JvdXBzW25hbWVdKSB7XG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xuXHRcdFx0XHRvcmRlci5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcnRzID0gW107XG5cdFx0b3JkZXIuZm9yRWFjaCgobmFtZSkgPT4ge1xuXHRcdFx0Y29uc3Qgcm93cyA9IGdyb3Vwc1tuYW1lXTtcblx0XHRcdGNvbnN0IGlzTXVsdGkgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubXVsdGlJbnN0YW5jZVNlcnZpY2VzW25hbWVdID09PSB0cnVlXG5cdFx0XHRcdHx8IHJvd3MubGVuZ3RoID4gMTtcblx0XHRcdGlmIChpc011bHRpKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2goYDxkaXYgY2xhc3M9XCJjdGktc3ZjLWdyb3VwLWhlYWRlclwiPiR7bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVzY2FwZUh0bWwoXG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnNlcnZpY2VMYWJlbChuYW1lKSxcblx0XHRcdFx0KX08L2Rpdj5gKTtcblx0XHRcdFx0cm93cy5mb3JFYWNoKChzdmMpID0+IHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlUm93KHN2YywgdHJ1ZSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlclNlcnZpY2VSb3cocm93c1swXSwgZmFsc2UpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChwYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IGVtcHR5ID0gKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c0VtcHR5KVxuXHRcdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c0VtcHR5XG5cdFx0XHRcdDogJ05vIHNlcnZpY2VzIHJlcG9ydGVkJztcblx0XHRcdHNob3dQbGFjZWhvbGRlcihlbXB0eSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0JHJvd3MuaHRtbChwYXJ0cy5qb2luKCcnKSk7XG5cdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcGxhY2Vob2xkZXIuaGlkZSgpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0LXRgNCy0LjRgdCwLlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gc3ZjINC30LDQv9C40YHRjCDQuNC3IHN0YXR1c2VzW11cblx0ICogQHBhcmFtIHtib29sZWFufSBncm91cGVkIHRydWUg0LXRgdC70Lgg0YHRgtGA0L7QutCwINC40LTRkdGCINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKG11bHRpLWluc3RhbmNlKVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfSBIVE1MXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlUm93KHN2YywgZ3JvdXBlZCkge1xuXHRcdGNvbnN0IHN0YXRlUmF3ID0gKHR5cGVvZiBzdmMuc3RhdGUgPT09ICdzdHJpbmcnICYmIHN2Yy5zdGF0ZS5sZW5ndGggPiAwKSA/IHN2Yy5zdGF0ZSA6ICd1bmtub3duJztcblx0XHRjb25zdCBsZWRDbGFzcyA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zdGF0ZUxlZENsYXNzW3N0YXRlUmF3XSB8fCAnd2Fybic7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zaG9ydEFyZWEoc3ZjLmFyZWEpXG5cdFx0XHQ6IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zZXJ2aWNlTGFiZWwoc3ZjLm5hbWUpO1xuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZUxhYmVsID0gKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwdGltZSlcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVXB0aW1lXG5cdFx0XHQ6ICdVcHRpbWUnO1xuXHRcdGNvbnN0IHZlcnNpb25MYWJlbCA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WZXJzaW9uKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WZXJzaW9uXG5cdFx0XHQ6ICdWZXJzaW9uJztcblxuXHRcdGNvbnN0IGVzYyA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sO1xuXG5cdFx0Y29uc3QgbWV0YVBhcnRzID0gW107XG5cdFx0aWYgKHVwdGltZSAhPT0gJycpIHtcblx0XHRcdG1ldGFQYXJ0cy5wdXNoKGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbWV0YVwiPiR7ZXNjKHVwdGltZUxhYmVsKX06ICR7ZXNjKHVwdGltZSl9PC9zcGFuPmApO1xuXHRcdH1cblx0XHRpZiAodmVyc2lvbiAhPT0gJycpIHtcblx0XHRcdG1ldGFQYXJ0cy5wdXNoKGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbWV0YVwiPiR7ZXNjKHZlcnNpb25MYWJlbCl9OiAke2VzYyh2ZXJzaW9uKX08L3NwYW4+YCk7XG5cdFx0fVxuXG5cdFx0bGV0IGV4dHJhID0gJyc7XG5cdFx0aWYgKGdyb3VwZWQgJiYgc3ZjLmFyZWEpIHtcblx0XHRcdC8vIGFyZWEg0YPQttC1INCyIGRpc3BsYXlOYW1lOyDQvdC40YfQtdCz0L4g0LTQvtC/0L7Qu9C90LjRgtC10LvRjNC90L4g0L3QtSDQv9C10YfQsNGC0LDQtdC8LlxuXHRcdH0gZWxzZSBpZiAoIWdyb3VwZWQgJiYgdHlwZW9mIHN2Yy5hcmVhID09PSAnc3RyaW5nJyAmJiBzdmMuYXJlYS5sZW5ndGggPiAwKSB7XG5cdFx0XHRleHRyYSA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtYXJlYVwiPiR7ZXNjKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zaG9ydEFyZWEoc3ZjLmFyZWEpKX08L3NwYW4+YDtcblx0XHR9XG5cblx0XHRjb25zdCBlcnJCbG9jayA9IGxhc3RFcnJvciAhPT0gJydcblx0XHRcdD8gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1lcnJvclwiIHRpdGxlPVwiJHtlc2MobGFzdEVycm9yKX1cIj4ke2VzYyhtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudHJ1bmNhdGUobGFzdEVycm9yLCAxMjApKX08L3NwYW4+YFxuXHRcdFx0OiAnJztcblxuXHRcdHJldHVybiBgPGRpdiBjbGFzcz1cImN0aS1zdmMtcm93XCIgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPmBcblx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1sZWQgJHtlc2MobGVkQ2xhc3MpfVwiIHRpdGxlPVwiJHtlc2Moc3RhdGVSYXcpfVwiPjwvc3Bhbj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbmFtZVwiPiR7ZXNjKGRpc3BsYXlOYW1lKX08L3NwYW4+YFxuXHRcdFx0KyBleHRyYVxuXHRcdFx0KyBtZXRhUGFydHMuam9pbignICZtaWRkb3Q7ICcpXG5cdFx0XHQrIGVyckJsb2NrXG5cdFx0XHQrICc8L2Rpdj4nO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGVUZXh0KHN0YXRlKSB7XG5cdFx0Y29uc3Qga2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtzdGF0ZX1gO1xuXHRcdGlmICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCa0L7RgNC+0YLQutC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgYXJlYS1HVUlEIOKAlCDQv9C10YDQstGL0LUgOCDRgdC40LzQstC+0LvQvtCyLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gYXJlYVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c2hvcnRBcmVhKGFyZWEpIHtcblx0XHRpZiAodHlwZW9mIGFyZWEgIT09ICdzdHJpbmcnIHx8IGFyZWEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChhcmVhLmxlbmd0aCA8PSAxMikge1xuXHRcdFx0cmV0dXJuIGFyZWE7XG5cdFx0fVxuXHRcdHJldHVybiBgJHthcmVhLnN1YnN0cmluZygwLCA4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQo9GB0LXRh9C10L3QuNC1INGB0YLRgNC+0LrQuC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0clxuXHQgKiBAcGFyYW0ge251bWJlcn0gbWF4XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHR0cnVuY2F0ZShzdHIsIG1heCkge1xuXHRcdGlmICh0eXBlb2Ygc3RyICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAoc3RyLmxlbmd0aCA8PSBtYXgpIHtcblx0XHRcdHJldHVybiBzdHI7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtzdHIuc3Vic3RyaW5nKDAsIG1heCl94oCmYDtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC30L7Qv9Cw0YHQvdGL0Lkg0Y3QutGA0LDQvdC10YAgSFRNTC5cblx0ICpcblx0ICogQHBhcmFtIHsqfSB2YWx1ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0ZXNjYXBlSHRtbCh2YWx1ZSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBTdHJpbmcodmFsdWUpXG5cdFx0XHQucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuXHRcdFx0LnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuXHRcdFx0LnJlcGxhY2UoLz4vZywgJyZndDsnKVxuXHRcdFx0LnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuXHRcdFx0LnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQu9C10L3QuNC1INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyAo0LHQtdC50LTQtiDQsiDQv9GA0LDQstC+0Lwg0LLQtdGA0YXQvdC10Lwg0YPQs9C70YMpLlxuXHQgKlxuXHQgKiBAcGFyYW0gc3RhdHVzXG5cdCAqL1xuXHRjaGFuZ2VTdGF0dXMoc3RhdHVzKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JleScpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZWVuJylcblx0XHRcdC5yZW1vdmVDbGFzcygncmVkJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZWVuJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9EaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25Qcm9ncmVzcyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbldhaXR9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNFcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwZGF0ZVN0YXR1c31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0sXG59O1xuIl19