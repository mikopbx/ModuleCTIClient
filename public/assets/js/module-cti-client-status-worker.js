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
          if (Object.keys(response).length > 0 && response.result === false && typeof response.data !== 'undefined') {
            moduleCTIClientConnectionCheckWorker.errorCounts += 1;

            if (typeof response.data !== 'undefined' && typeof response.data.statuses !== 'undefined') {
              var countHealthy = 0;
              var status1C = 'undefined';
              $.each(response.data.statuses, function (_key, value) {
                if (typeof value.name !== 'undefined' && value.state === 'ok') {
                  countHealthy += 1;
                }

                if (typeof value.name !== 'undefined' && value.name === 'crm-1c') {
                  status1C = value.state;
                }
              });

              if (status1C !== 'ok' && countHealthy === 6) {
                if (moduleCTIClientConnectionCheckWorker.$webServiceToggle.checkbox('is checked')) {
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CError');
                } else {
                  moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CWait');
                }
              } else if (countHealthy < 6) {
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

    var statuses = data && data.statuses ? data.statuses : null; // Бэк может вернуть строку 'Module disabled' вместо массива.

    if (!Array.isArray(statuses)) {
      var text = typeof statuses === 'string' ? statuses : typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusUnavailable ? globalTranslate.mod_cti_StatusUnavailable : 'Status unavailable';
      $panel.html("<div class=\"ui basic segment\">".concat(moduleCTIClientConnectionCheckWorker.escapeHtml(text), "</div>"));
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
      $panel.html("<div class=\"ui basic segment\">".concat(moduleCTIClientConnectionCheckWorker.escapeHtml(empty), "</div>"));
      return;
    }

    $panel.html(parts.join(''));
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
    var stateText = moduleCTIClientConnectionCheckWorker.stateText(stateRaw);
    var uptime = typeof svc.uptime === 'string' && svc.uptime.length > 0 ? svc.uptime : '';
    var version = typeof svc.version === 'string' && svc.version.length > 0 ? svc.version : '';
    var lastError = typeof svc.last_error === 'string' && svc.last_error.length > 0 ? svc.last_error : '';
    var uptimeLabel = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_Uptime ? globalTranslate.mod_cti_Uptime : 'Uptime';
    var versionLabel = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_Version ? globalTranslate.mod_cti_Version : 'Version';
    var esc = moduleCTIClientConnectionCheckWorker.escapeHtml;
    var metaParts = [];
    metaParts.push("<span class=\"cti-svc-state\">".concat(esc(stateText), "</span>"));

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJzdGF0ZUxlZENsYXNzIiwib2siLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJjb3VudEhlYWx0aHkiLCJzdGF0dXMxQyIsImVhY2giLCJfa2V5IiwidmFsdWUiLCJuYW1lIiwic3RhdGUiLCJyZW5kZXJEaXNhYmxlZFBhbmVsIiwiJHBhbmVsIiwibGFiZWwiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkIiwiaHRtbCIsImVzY2FwZUh0bWwiLCJBcnJheSIsImlzQXJyYXkiLCJ0ZXh0IiwibW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZSIsImdyb3VwcyIsIm9yZGVyIiwiZm9yRWFjaCIsInN2YyIsInB1c2giLCJwYXJ0cyIsInJvd3MiLCJpc011bHRpIiwic2VydmljZUxhYmVsIiwicmVuZGVyU2VydmljZVJvdyIsImVtcHR5IiwibW9kX2N0aV9TdGF0dXNFbXB0eSIsImpvaW4iLCJncm91cGVkIiwic3RhdGVSYXciLCJsZWRDbGFzcyIsImRpc3BsYXlOYW1lIiwic2hvcnRBcmVhIiwiYXJlYSIsInN0YXRlVGV4dCIsInVwdGltZSIsInZlcnNpb24iLCJsYXN0RXJyb3IiLCJsYXN0X2Vycm9yIiwidXB0aW1lTGFiZWwiLCJtb2RfY3RpX1VwdGltZSIsInZlcnNpb25MYWJlbCIsIm1vZF9jdGlfVmVyc2lvbiIsImVzYyIsIm1ldGFQYXJ0cyIsImV4dHJhIiwiZXJyQmxvY2siLCJ0cnVuY2F0ZSIsIm1hcCIsIm1vbml0b3JkIiwibmF0cyIsInByb3h5Iiwia2V5Iiwic3Vic3RyaW5nIiwic3RyIiwiU3RyaW5nIiwic3RhdHVzIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsIm1vZF9jdGlfQ29ubmVjdGVkIiwibW9kX2N0aV9EaXNjb25uZWN0ZWQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzcyIsIm1vZF9jdGlfQ29ubmVjdGlvbldhaXQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3IiLCJtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvciIsIm1vZF9jdGlfVXBkYXRlU3RhdHVzIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7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RWpELElBRkYsQ0FFT0YsZUFBZSxDQUFDeUQsdUJBRnZCO0FBR0E7QUF4Q0Y7QUEwQ0E7QUEvYTJDLENBQTdDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIE1pa29QQlggLSBmcmVlIHBob25lIHN5c3RlbSBmb3Igc21hbGwgYnVzaW5lc3NcbiAqIENvcHlyaWdodCAoQykgMjAxNy0yMDIxIEFsZXhleSBQb3J0bm92IGFuZCBOaWtvbGF5IEJla2V0b3ZcbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICogaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAqIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb247IGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gKiAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICogYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAqIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYWxvbmcgd2l0aCB0aGlzIHByb2dyYW0uXG4gKiBJZiBub3QsIHNlZSA8aHR0cHM6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuICovXG5cbi8qIGdsb2JhbCBnbG9iYWxUcmFuc2xhdGUsIEZvcm0sIENvbmZpZywgUGJ4QXBpICovXG5cbi8qKlxuICog0KLQtdGB0YLQuNGA0L7QstCw0L3QuNC1INGB0L7QtdC00LjQvdC10L3QuNGPINC80L7QtNGD0LvRjyDRgSAx0KEgKyDRgNC10L3QtNC10YAg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIg0YHQtdGA0LLQuNGB0L7Qsi5cbiAqL1xuY29uc3QgbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyID0ge1xuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCR3ZWJTZXJ2aWNlVG9nZ2xlOiAkKCcjd2ViLXNlcnZpY2UtbW9kZS10b2dnbGUnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI3N0YXR1cycpLFxuXHQkc3VibWl0QnV0dG9uOiAkKCcjc3VibWl0YnV0dG9uJyksXG5cdCRkZWJ1Z0luZm86ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIHNwYW4jZGVidWctaW5mbycpLFxuXHQkc2VydmljZXNTdGF0dXM6ICQoJyNjdGktc2VydmljZXMtc3RhdHVzJyksXG5cdHRpbWVPdXQ6IDMwMDAsXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxuXHRlcnJvckNvdW50czogMCxcblxuXHQvKipcblx0ICog0JzQsNC/0L/QuNC90LMgc3RhdGUgLT4gQ1NTLdC60LvQsNGB0YEg0LvQsNC80L/QvtGH0LrQuC5cblx0ICog0JvRjtCx0L7QtSDQvdC10LjQt9Cy0LXRgdGC0L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAtPiDQttGR0LvRgtC+0LUgKHdhcm4pLlxuXHQgKi9cblx0c3RhdGVMZWRDbGFzczoge1xuXHRcdG9rOiAnb2snLFxuXHRcdGVycm9yOiAnZXJyb3InLFxuXHRcdGZhaWw6ICdlcnJvcicsXG5cdFx0ZmFpbGVkOiAnZXJyb3InLFxuXHRcdGRvd246ICdlcnJvcicsXG5cdFx0c3RvcHBlZDogJ2Vycm9yJyxcblx0XHR1bmtub3duOiAndW5rbm93bicsXG5cdFx0cGVuZGluZzogJ3dhcm4nLFxuXHRcdHN0YXJ0aW5nOiAnd2FybicsXG5cdFx0cXJjb2RlOiAnd2FybicsXG5cdFx0YXV0aDogJ3dhcm4nLFxuXHRcdGF1dGhfcmVxdWlyZWQ6ICd3YXJuJyxcblx0XHR3YXJuOiAnd2FybicsXG5cdFx0d2FybmluZzogJ3dhcm4nLFxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC10YDQstC40YHRiywg0LrQvtGC0L7RgNGL0LUg0LzQvtCz0YPRgiDQuNC00YLQuCDQsiDQvdC10YHQutC+0LvRjNC60LjRhSDQuNC90YHRgtCw0L3RgdCw0YUg0YEg0YDQsNC30L3Ri9C8IGFyZWEuXG5cdCAqL1xuXHRtdWx0aUluc3RhbmNlU2VydmljZXM6IHtcblx0XHRjaGF0czogdHJ1ZSxcblx0XHR0ZzogdHJ1ZSxcblx0XHRtYXg6IHRydWUsXG5cdH0sXG5cblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVzdGFydFdvcmtlcigpO1xuXHR9LFxuXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdVcGRhdGluZycpO1xuXHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIoKTtcblx0fSxcblxuXHR3b3JrZXIoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc3RhdHVzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdCQuYXBpKHtcblx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9jaGVja2AsXG5cdFx0XHRcdG9uOiAnbm93Jyxcblx0XHRcdFx0c3VjY2Vzc1Rlc3Q6IFBieEFwaS5zdWNjZXNzVGVzdCxcblx0XHRcdFx0b25Db21wbGV0ZSgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcixcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uUmVzcG9uc2UocmVzcG9uc2UpIHtcblx0XHRcdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUmVuZGVyIHNlcnZpY2VzIHN0YXR1cyBwYW5lbCBmb3IgYm90aCBzdWNjZXNzIGFuZCBwYXJ0aWFsIHJlc3BvbnNlcy5cblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyU2VydmljZXNTdGF0dXMocmVzcG9uc2UuZGF0YSk7XG5cblx0XHRcdFx0XHQvLyBEZWJ1ZyBKU09OIHBhbmUgKGxlZ2FjeSBkZWJ1ZyB0YWIpLlxuXHRcdFx0XHRcdGxldCB2aXN1YWxFcnJvclN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLmRhdGEsIG51bGwsIDIpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgdmlzdWFsRXJyb3JTdHJpbmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHR2aXN1YWxFcnJvclN0cmluZyA9IHZpc3VhbEVycm9yU3RyaW5nLnJlcGxhY2UoL1xcbi9nLCAnPGJyLz4nKTtcblx0XHRcdFx0XHRcdGlmIChPYmplY3Qua2V5cyhyZXNwb25zZSkubGVuZ3RoID4gMCAmJiByZXNwb25zZS5yZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRkZWJ1Z0luZm9cblx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+ICR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT5cblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+JHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0XHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZhaWx1cmUocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDBcblx0XHRcdFx0XHRcdCYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gZmFsc2Vcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgKz0gMTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0XHQmJiB0eXBlb2YgKHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdGxldCBjb3VudEhlYWx0aHkgPSAwO1xuXHRcdFx0XHRcdFx0XHRsZXQgc3RhdHVzMUMgPSAndW5kZWZpbmVkJztcblxuXHRcdFx0XHRcdFx0XHQkLmVhY2gocmVzcG9uc2UuZGF0YS5zdGF0dXNlcywgKF9rZXksIHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiAodmFsdWUubmFtZSkgIT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0XHRcdFx0XHQmJiB2YWx1ZS5zdGF0ZSA9PT0gJ29rJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y291bnRIZWFsdGh5ICs9IDE7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHZhbHVlLm5hbWUpICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0XHRcdFx0JiYgdmFsdWUubmFtZSA9PT0gJ2NybS0xYycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXR1czFDID0gdmFsdWUuc3RhdGU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0aWYgKHN0YXR1czFDICE9PSAnb2snICYmIGNvdW50SGVhbHRoeSA9PT0gNikge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHdlYlNlcnZpY2VUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNFcnJvcicpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXQnKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoY291bnRIZWFsdGh5IDwgNikge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPCAxMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJyk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHsgLy8gVW5rbm93blxuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyRGlzYWJsZWRQYW5lbCgpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCAkcGFuZWwgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKGxhYmVsKX08L2Rpdj5gKTtcblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINC/0LDQvdC10LvQuCDCq9C70LDQvNC/0L7Rh9C60LAgKyDRgdC10YDQstC40YEgKyBhcmVhICsgdXB0aW1lICsg0LLQtdGA0YHQuNGPwrsuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhINCe0YLQstC10YIgQVBJIChyZXNwb25zZS5kYXRhKS5cblx0ICovXG5cdHJlbmRlclNlcnZpY2VzU3RhdHVzKGRhdGEpIHtcblx0XHRjb25zdCAkcGFuZWwgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IChkYXRhICYmIGRhdGEuc3RhdHVzZXMpID8gZGF0YS5zdGF0dXNlcyA6IG51bGw7XG5cblx0XHQvLyDQkdGN0Log0LzQvtC20LXRgiDQstC10YDQvdGD0YLRjCDRgdGC0YDQvtC60YMgJ01vZHVsZSBkaXNhYmxlZCcg0LLQvNC10YHRgtC+INC80LDRgdGB0LjQstCwLlxuXHRcdGlmICghQXJyYXkuaXNBcnJheShzdGF0dXNlcykpIHtcblx0XHRcdGNvbnN0IHRleHQgPSAodHlwZW9mIHN0YXR1c2VzID09PSAnc3RyaW5nJylcblx0XHRcdFx0PyBzdGF0dXNlc1xuXHRcdFx0XHQ6ICgodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzVW5hdmFpbGFibGUpXG5cdFx0XHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZVxuXHRcdFx0XHRcdDogJ1N0YXR1cyB1bmF2YWlsYWJsZScpO1xuXHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHttb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXNjYXBlSHRtbCh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQodCz0YDRg9C/0L/QuNGA0YPQtdC8INC/0L4g0LjQvNC10L3QuCDRgdC10YDQstC40YHQsC4g0JLQvdGD0YLRgNC4INCz0YDRg9C/0L/RiyDigJQg0YHRgtGA0L7QutC4INC/0L4gYXJlYS5cblx0XHRjb25zdCBncm91cHMgPSB7fTtcblx0XHRjb25zdCBvcmRlciA9IFtdO1xuXHRcdHN0YXR1c2VzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0aWYgKCFzdmMgfHwgdHlwZW9mIHN2YyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmFtZSA9ICh0eXBlb2Ygc3ZjLm5hbWUgPT09ICdzdHJpbmcnICYmIHN2Yy5uYW1lLmxlbmd0aCA+IDApID8gc3ZjLm5hbWUgOiAndW5rbm93bic7XG5cdFx0XHRpZiAoIWdyb3Vwc1tuYW1lXSkge1xuXHRcdFx0XHRncm91cHNbbmFtZV0gPSBbXTtcblx0XHRcdFx0b3JkZXIucHVzaChuYW1lKTtcblx0XHRcdH1cblx0XHRcdGdyb3Vwc1tuYW1lXS5wdXNoKHN2Yyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYXJ0cyA9IFtdO1xuXHRcdG9yZGVyLmZvckVhY2goKG5hbWUpID0+IHtcblx0XHRcdGNvbnN0IHJvd3MgPSBncm91cHNbbmFtZV07XG5cdFx0XHRjb25zdCBpc011bHRpID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLm11bHRpSW5zdGFuY2VTZXJ2aWNlc1tuYW1lXSA9PT0gdHJ1ZVxuXHRcdFx0XHR8fCByb3dzLmxlbmd0aCA+IDE7XG5cdFx0XHRpZiAoaXNNdWx0aSkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGA8ZGl2IGNsYXNzPVwiY3RpLXN2Yy1ncm91cC1oZWFkZXJcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKFxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zZXJ2aWNlTGFiZWwobmFtZSksXG5cdFx0XHRcdCl9PC9kaXY+YCk7XG5cdFx0XHRcdHJvd3MuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyU2VydmljZVJvdyhzdmMsIHRydWUpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlUm93KHJvd3NbMF0sIGZhbHNlKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCBlbXB0eSA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNFbXB0eSlcblx0XHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNFbXB0eVxuXHRcdFx0XHQ6ICdObyBzZXJ2aWNlcyByZXBvcnRlZCc7XG5cdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKGVtcHR5KX08L2Rpdj5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQkcGFuZWwuaHRtbChwYXJ0cy5qb2luKCcnKSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCg0LXQvdC00LXRgCDQvtC00L3QvtC5INGB0YLRgNC+0LrQuCDRgdC10YDQstC40YHQsC5cblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R9IHN2YyDQt9Cw0L/QuNGB0Ywg0LjQtyBzdGF0dXNlc1tdXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gZ3JvdXBlZCB0cnVlINC10YHQu9C4INGB0YLRgNC+0LrQsCDQuNC00ZHRgiDQv9C+0LQg0LPRgNGD0L/Qv9C+0LLRi9C8INC30LDQs9C+0LvQvtCy0LrQvtC8IChtdWx0aS1pbnN0YW5jZSlcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTFxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQpIHtcblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgbGVkQ2xhc3MgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc3RhdGVMZWRDbGFzc1tzdGF0ZVJhd10gfHwgJ3dhcm4nO1xuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ3JvdXBlZFxuXHRcdFx0PyBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc2VydmljZUxhYmVsKHN2Yy5uYW1lKTtcblx0XHRjb25zdCBzdGF0ZVRleHQgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuc3RhdGVUZXh0KHN0YXRlUmF3KTtcblx0XHRjb25zdCB1cHRpbWUgPSAodHlwZW9mIHN2Yy51cHRpbWUgPT09ICdzdHJpbmcnICYmIHN2Yy51cHRpbWUubGVuZ3RoID4gMCkgPyBzdmMudXB0aW1lIDogJyc7XG5cdFx0Y29uc3QgdmVyc2lvbiA9ICh0eXBlb2Ygc3ZjLnZlcnNpb24gPT09ICdzdHJpbmcnICYmIHN2Yy52ZXJzaW9uLmxlbmd0aCA+IDApID8gc3ZjLnZlcnNpb24gOiAnJztcblx0XHRjb25zdCBsYXN0RXJyb3IgPSAodHlwZW9mIHN2Yy5sYXN0X2Vycm9yID09PSAnc3RyaW5nJyAmJiBzdmMubGFzdF9lcnJvci5sZW5ndGggPiAwKSA/IHN2Yy5sYXN0X2Vycm9yIDogJyc7XG5cblx0XHRjb25zdCB1cHRpbWVMYWJlbCA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9VcHRpbWUpXG5cdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwdGltZVxuXHRcdFx0OiAnVXB0aW1lJztcblx0XHRjb25zdCB2ZXJzaW9uTGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmVyc2lvbilcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVmVyc2lvblxuXHRcdFx0OiAnVmVyc2lvbic7XG5cblx0XHRjb25zdCBlc2MgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXNjYXBlSHRtbDtcblxuXHRcdGNvbnN0IG1ldGFQYXJ0cyA9IFtdO1xuXHRcdG1ldGFQYXJ0cy5wdXNoKGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtc3RhdGVcIj4ke2VzYyhzdGF0ZVRleHQpfTwvc3Bhbj5gKTtcblx0XHRpZiAodXB0aW1lICE9PSAnJykge1xuXHRcdFx0bWV0YVBhcnRzLnB1c2goYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1tZXRhXCI+JHtlc2ModXB0aW1lTGFiZWwpfTogJHtlc2ModXB0aW1lKX08L3NwYW4+YCk7XG5cdFx0fVxuXHRcdGlmICh2ZXJzaW9uICE9PSAnJykge1xuXHRcdFx0bWV0YVBhcnRzLnB1c2goYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1tZXRhXCI+JHtlc2ModmVyc2lvbkxhYmVsKX06ICR7ZXNjKHZlcnNpb24pfTwvc3Bhbj5gKTtcblx0XHR9XG5cblx0XHRsZXQgZXh0cmEgPSAnJztcblx0XHRpZiAoZ3JvdXBlZCAmJiBzdmMuYXJlYSkge1xuXHRcdFx0Ly8gYXJlYSDRg9C20LUg0LIgZGlzcGxheU5hbWU7INC90LjRh9C10LPQviDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3QviDQvdC1INC/0LXRh9Cw0YLQsNC10LwuXG5cdFx0fSBlbHNlIGlmICghZ3JvdXBlZCAmJiB0eXBlb2Ygc3ZjLmFyZWEgPT09ICdzdHJpbmcnICYmIHN2Yy5hcmVhLmxlbmd0aCA+IDApIHtcblx0XHRcdGV4dHJhID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1hcmVhXCI+JHtlc2MobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnNob3J0QXJlYShzdmMuYXJlYSkpfTwvc3Bhbj5gO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVyckJsb2NrID0gbGFzdEVycm9yICE9PSAnJ1xuXHRcdFx0PyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWVycm9yXCIgdGl0bGU9XCIke2VzYyhsYXN0RXJyb3IpfVwiPiR7ZXNjKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50cnVuY2F0ZShsYXN0RXJyb3IsIDEyMCkpfTwvc3Bhbj5gXG5cdFx0XHQ6ICcnO1xuXG5cdFx0cmV0dXJuIGA8ZGl2IGNsYXNzPVwiY3RpLXN2Yy1yb3dcIiBkYXRhLXN2Yz1cIiR7ZXNjKHN2Yy5uYW1lIHx8ICcnKX1cIiBkYXRhLWFyZWE9XCIke2VzYyhzdmMuYXJlYSB8fCAnJyl9XCI+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWxlZCAke2VzYyhsZWRDbGFzcyl9XCIgdGl0bGU9XCIke2VzYyhzdGF0ZVJhdyl9XCI+PC9zcGFuPmBcblx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1uYW1lXCI+JHtlc2MoZGlzcGxheU5hbWUpfTwvc3Bhbj5gXG5cdFx0XHQrIGV4dHJhXG5cdFx0XHQrIG1ldGFQYXJ0cy5qb2luKCcgJm1pZGRvdDsgJylcblx0XHRcdCsgZXJyQmxvY2tcblx0XHRcdCsgJzwvZGl2Pic7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCn0LXQu9C+0LLQtdC60L7Rh9C40YLQsNC10LzQvtC1INC40LzRjyDRgdC10YDQstC40YHQsC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHNlcnZpY2VMYWJlbChuYW1lKSB7XG5cdFx0Y29uc3QgbWFwID0ge1xuXHRcdFx0bW9uaXRvcmQ6ICdtb2RfY3RpX3N2Y19tb25pdG9yZCcsXG5cdFx0XHRuYXRzOiAnbW9kX2N0aV9zdmNfbmF0cycsXG5cdFx0XHQnY3JtLTFjJzogJ21vZF9jdGlfc3ZjX2NybScsXG5cdFx0XHRhdXRoOiAnbW9kX2N0aV9zdmNfYXV0aCcsXG5cdFx0XHRwcm94eTogJ21vZF9jdGlfc3ZjX3Byb3h5Jyxcblx0XHRcdCdhbWktbGlzdGVuZXInOiAnbW9kX2N0aV9zdmNfYW1pJyxcblx0XHRcdGNoYXRzOiAnbW9kX2N0aV9zdmNfY2hhdHMnLFxuXHRcdFx0dGc6ICdtb2RfY3RpX3N2Y190ZycsXG5cdFx0XHRtYXg6ICdtb2RfY3RpX3N2Y19tYXgnLFxuXHRcdFx0J21hbmFnZXIuYXBpJzogJ21vZF9jdGlfc3ZjX21hbmFnZXJfYXBpJyxcblx0XHRcdCdyZW1vdGUtdHVubmVsJzogJ21vZF9jdGlfc3ZjX3JlbW90ZV90dW5uZWwnLFxuXHRcdH07XG5cdFx0Y29uc3Qga2V5ID0gbWFwW25hbWVdO1xuXHRcdGlmIChrZXkgJiYgdHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIG5hbWUgfHwgJ3Vua25vd24nO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBzdGF0ZS5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0ZVRleHQoc3RhdGUpIHtcblx0XHRjb25zdCBrZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke3N0YXRlfWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZTtcblx0fSxcblxuXHQvKipcblx0ICog0JrQvtGA0L7RgtC60L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBhcmVhLUdVSUQg4oCUINC/0LXRgNCy0YvQtSA4INGB0LjQvNCy0L7Qu9C+0LIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBhcmVhXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzaG9ydEFyZWEoYXJlYSkge1xuXHRcdGlmICh0eXBlb2YgYXJlYSAhPT0gJ3N0cmluZycgfHwgYXJlYS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKGFyZWEubGVuZ3RoIDw9IDEyKSB7XG5cdFx0XHRyZXR1cm4gYXJlYTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FyZWEuc3Vic3RyaW5nKDAsIDgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XG5cdFx0aWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChzdHIubGVuZ3RoIDw9IG1heCkge1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LfQvtC/0LDRgdC90YvQuSDRjdC60YDQsNC90LXRgCBIVE1MLlxuXHQgKlxuXHQgKiBAcGFyYW0geyp9IHZhbHVlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRlc2NhcGVIdG1sKHZhbHVlKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSlcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblx0fSxcblxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0YHRgtCw0YLRg9GB0LAg0LzQvtC00YPQu9GPICjQsdC10LnQtNC2INCyINC/0YDQsNCy0L7QvCDQstC10YDRhdC90LXQvCDRg9Cz0LvRgykuXG5cdCAqXG5cdCAqIEBwYXJhbSBzdGF0dXNcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0LnJlbW92ZUNsYXNzKCdncmV5Jylcblx0XHRcdC5yZW1vdmVDbGFzcygneWVsbG93Jylcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JlZW4nKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCdyZWQnKTtcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JlZW4nKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3RlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnRGlzY29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Rpc2Nvbm5lY3RlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uUHJvZ3Jlc3N9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNXYWl0Jzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uV2FpdH1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ0Vycm9yJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uVG8xQ0Vycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25FcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ1VwZGF0aW5nJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVXBkYXRlU3RhdHVzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fSxcbn07XG4iXX0=