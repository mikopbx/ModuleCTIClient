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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJzdGF0ZUxlZENsYXNzIiwib2siLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJjcm0xYyIsImhhc0Vycm9yIiwiaGFzU3RhcnRpbmciLCJmb3JFYWNoIiwicyIsIm5hbWUiLCJzdGF0ZSIsInJlbmRlckRpc2FibGVkUGFuZWwiLCIkcGFuZWwiLCJsYWJlbCIsImdsb2JhbFRyYW5zbGF0ZSIsIm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQiLCJodG1sIiwiZXNjYXBlSHRtbCIsInRleHQiLCJtb2RfY3RpX1N0YXR1c1VuYXZhaWxhYmxlIiwiZ3JvdXBzIiwib3JkZXIiLCJzdmMiLCJwdXNoIiwicGFydHMiLCJyb3dzIiwiaXNNdWx0aSIsInNlcnZpY2VMYWJlbCIsInJlbmRlclNlcnZpY2VSb3ciLCJlbXB0eSIsIm1vZF9jdGlfU3RhdHVzRW1wdHkiLCJqb2luIiwiZ3JvdXBlZCIsInN0YXRlUmF3IiwibGVkQ2xhc3MiLCJkaXNwbGF5TmFtZSIsInNob3J0QXJlYSIsImFyZWEiLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsInVwdGltZUxhYmVsIiwibW9kX2N0aV9VcHRpbWUiLCJ2ZXJzaW9uTGFiZWwiLCJtb2RfY3RpX1ZlcnNpb24iLCJlc2MiLCJtZXRhUGFydHMiLCJleHRyYSIsImVyckJsb2NrIiwidHJ1bmNhdGUiLCJtYXAiLCJtb25pdG9yZCIsIm5hdHMiLCJwcm94eSIsImtleSIsInN0YXRlVGV4dCIsInN1YnN0cmluZyIsInN0ciIsInZhbHVlIiwiU3RyaW5nIiwic3RhdHVzIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsIm1vZF9jdGlfQ29ubmVjdGVkIiwibW9kX2N0aV9EaXNjb25uZWN0ZWQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzcyIsIm1vZF9jdGlfQ29ubmVjdGlvbldhaXQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3IiLCJtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvciIsIm1vZF9jdGlfVXBkYXRlU3RhdHVzIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFF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eENGO0FBMENBO0FBdGEyQyxDQUE3QyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaWtvUEJYIC0gZnJlZSBwaG9uZSBzeXN0ZW0gZm9yIHNtYWxsIGJ1c2luZXNzXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTctMjAyMSBBbGV4ZXkgUG9ydG5vdiBhbmQgTmlrb2xheSBCZWtldG92XG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAqIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gKiB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uOyBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICogKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAqIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gKiBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFsb25nIHdpdGggdGhpcyBwcm9ncmFtLlxuICogSWYgbm90LCBzZWUgPGh0dHBzOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiAqL1xuXG4vKiBnbG9iYWwgZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChICsg0YDQtdC90LTQtdGAINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyINGB0LXRgNCy0LjRgdC+0LIuXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNzdGF0dXMnKSxcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxuXHQkZGVidWdJbmZvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSBzcGFuI2RlYnVnLWluZm8nKSxcblx0JHNlcnZpY2VzU3RhdHVzOiAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cycpLFxuXHR0aW1lT3V0OiAzMDAwLFxuXHR0aW1lT3V0SGFuZGxlOiAnJyxcblx0ZXJyb3JDb3VudHM6IDAsXG5cblx0LyoqXG5cdCAqINCc0LDQv9C/0LjQvdCzIHN0YXRlIC0+IENTUy3QutC70LDRgdGBINC70LDQvNC/0L7Rh9C60LguXG5cdCAqINCb0Y7QsdC+0LUg0L3QtdC40LfQstC10YHRgtC90L7QtSDRgdC+0YHRgtC+0Y/QvdC40LUgLT4g0LbRkdC70YLQvtC1ICh3YXJuKS5cblx0ICovXG5cdHN0YXRlTGVkQ2xhc3M6IHtcblx0XHRvazogJ29rJyxcblx0XHRlcnJvcjogJ2Vycm9yJyxcblx0XHRmYWlsOiAnZXJyb3InLFxuXHRcdGZhaWxlZDogJ2Vycm9yJyxcblx0XHRkb3duOiAnZXJyb3InLFxuXHRcdHN0b3BwZWQ6ICdlcnJvcicsXG5cdFx0dW5rbm93bjogJ3Vua25vd24nLFxuXHRcdHBlbmRpbmc6ICd3YXJuJyxcblx0XHRzdGFydGluZzogJ3dhcm4nLFxuXHRcdHFyY29kZTogJ3dhcm4nLFxuXHRcdGF1dGg6ICd3YXJuJyxcblx0XHRhdXRoX3JlcXVpcmVkOiAnd2FybicsXG5cdFx0d2FybjogJ3dhcm4nLFxuXHRcdHdhcm5pbmc6ICd3YXJuJyxcblx0fSxcblxuXHQvKipcblx0ICog0KHQtdGA0LLQuNGB0YssINC60L7RgtC+0YDRi9C1INC80L7Qs9GD0YIg0LjQtNGC0Lgg0LIg0L3QtdGB0LrQvtC70YzQutC40YUg0LjQvdGB0YLQsNC90YHQsNGFINGBINGA0LDQt9C90YvQvCBhcmVhLlxuXHQgKi9cblx0bXVsdGlJbnN0YW5jZVNlcnZpY2VzOiB7XG5cdFx0Y2hhdHM6IHRydWUsXG5cdFx0dGc6IHRydWUsXG5cdFx0bWF4OiB0cnVlLFxuXHR9LFxuXG5cdGluaXRpYWxpemUoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlc3RhcnRXb3JrZXIoKTtcblx0fSxcblxuXHRyZXN0YXJ0V29ya2VyKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcblx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlKTtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyKCk7XG5cdH0sXG5cblx0d29ya2VyKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkLmFwaSh7XG5cdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvY2hlY2tgLFxuXHRcdFx0XHRvbjogJ25vdycsXG5cdFx0XHRcdHN1Y2Nlc3NUZXN0OiBQYnhBcGkuc3VjY2Vzc1Rlc3QsXG5cdFx0XHRcdG9uQ29tcGxldGUoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dChcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIsXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblJlc3BvbnNlKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0JCgnLm1lc3NhZ2UuYWpheCcpLnJlbW92ZSgpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJlbmRlciBzZXJ2aWNlcyBzdGF0dXMgcGFuZWwgZm9yIGJvdGggc3VjY2VzcyBhbmQgcGFydGlhbCByZXNwb25zZXMuXG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlclNlcnZpY2VzU3RhdHVzKHJlc3BvbnNlLmRhdGEpO1xuXG5cdFx0XHRcdFx0Ly8gRGVidWcgSlNPTiBwYW5lIChsZWdhY3kgZGVidWcgdGFiKS5cblx0XHRcdFx0XHRsZXQgdmlzdWFsRXJyb3JTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXNwb25zZS5kYXRhLCBudWxsLCAyKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHZpc3VhbEVycm9yU3RyaW5nID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0dmlzdWFsRXJyb3JTdHJpbmcgPSB2aXN1YWxFcnJvclN0cmluZy5yZXBsYWNlKC9cXG4vZywgJzxici8+Jyk7XG5cdFx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UucmVzdWx0ID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiAke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRkZWJ1Z0luZm9cblx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cblx0XHRcdFx0XHRcdFx0XHRcdDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblN1Y2Nlc3MoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGVkJyk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdFx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25GYWlsdXJlKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzICs9IDE7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzZXMgPSAocmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSAmJiBBcnJheS5pc0FycmF5KHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMpKVxuXHRcdFx0XHRcdFx0PyByZXNwb25zZS5kYXRhLnN0YXR1c2VzIDogbnVsbDtcblx0XHRcdFx0XHRpZiAoIXN0YXR1c2VzKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ2xhc3NpZnkgdGhlIHJlc3BvbnNlIGJ5IHRoZSB3b3JzdCBub24tc3lzdGVtIHN0YXRlLlxuXHRcdFx0XHRcdC8vIGNybS0xYyBpcyBzcGVjaWFsOiBpdCdzIHRoZSAxQyBicmlkZ2Ug4oCUIGl0cyBvd24gZXJyb3IgbGFiZWwuXG5cdFx0XHRcdFx0bGV0IGNybTFjID0gbnVsbDtcblx0XHRcdFx0XHRsZXQgaGFzRXJyb3IgPSBmYWxzZTtcblx0XHRcdFx0XHRsZXQgaGFzU3RhcnRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRzdGF0dXNlcy5mb3JFYWNoKChzKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXMgfHwgdHlwZW9mIHMubmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChzLm5hbWUgPT09ICdjcm0tMWMnKSBjcm0xYyA9IHMuc3RhdGU7XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBzLnN0YXRlID09PSAnZmFpbCcgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWxlZCdcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ2Rvd24nIHx8IHMuc3RhdGUgPT09ICdzdG9wcGVkJykgaGFzRXJyb3IgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdzdGFydGluZycgfHwgcy5zdGF0ZSA9PT0gJ3BlbmRpbmcnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICd1bmtub3duJykgaGFzU3RhcnRpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChjcm0xYyAmJiBjcm0xYyAhPT0gJ29rJykge1xuXHRcdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kd2ViU2VydmljZVRvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDRXJyb3InKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDV2FpdCcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFzU3RhcnRpbmcgJiYgbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzIDwgMTApIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25Qcm9ncmVzcycpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFzRXJyb3IpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJEaXNhYmxlZFBhbmVsKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC+0L7QsdGJ0LXQvdC40LUg0LIg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIsINC60L7Qs9C00LAg0LzQvtC00YPQu9GMINCy0YvQutC70Y7Rh9C10L0uXG5cdCAqL1xuXHRyZW5kZXJEaXNhYmxlZFBhbmVsKCkge1xuXHRcdGNvbnN0ICRwYW5lbCA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc2VydmljZXNTdGF0dXM7XG5cdFx0aWYgKCEkcGFuZWwgfHwgJHBhbmVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbCA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0JiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQpXG5cdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkXG5cdFx0XHQ6ICdNb2R1bGUgaXMgZGlzYWJsZWQnO1xuXHRcdCRwYW5lbC5odG1sKGA8ZGl2IGNsYXNzPVwidWkgYmFzaWMgc2VnbWVudFwiPiR7bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVzY2FwZUh0bWwobGFiZWwpfTwvZGl2PmApO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0L/QsNC90LXQu9C4IMKr0LvQsNC80L/QvtGH0LrQsCArINGB0LXRgNCy0LjRgSArIGFyZWEgKyB1cHRpbWUgKyDQstC10YDRgdC40Y/Cuy5cblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R9IGRhdGEg0J7RgtCy0LXRgiBBUEkgKHJlc3BvbnNlLmRhdGEpLlxuXHQgKi9cblx0cmVuZGVyU2VydmljZXNTdGF0dXMoZGF0YSkge1xuXHRcdGNvbnN0ICRwYW5lbCA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc2VydmljZXNTdGF0dXM7XG5cdFx0aWYgKCEkcGFuZWwgfHwgJHBhbmVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXR1c2VzID0gKGRhdGEgJiYgZGF0YS5zdGF0dXNlcykgPyBkYXRhLnN0YXR1c2VzIDogbnVsbDtcblxuXHRcdC8vINCR0Y3QuiDQvNC+0LbQtdGCINCy0LXRgNC90YPRgtGMINGB0YLRgNC+0LrRgyAnTW9kdWxlIGRpc2FibGVkJyDQstC80LXRgdGC0L4g0LzQsNGB0YHQuNCy0LAuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHN0YXR1c2VzKSkge1xuXHRcdFx0Y29uc3QgdGV4dCA9ICh0eXBlb2Ygc3RhdHVzZXMgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQ/IHN0YXR1c2VzXG5cdFx0XHRcdDogKCh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZSlcblx0XHRcdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c1VuYXZhaWxhYmxlXG5cdFx0XHRcdFx0OiAnU3RhdHVzIHVuYXZhaWxhYmxlJyk7XG5cdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKHRleHQpfTwvZGl2PmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCh0LPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhLlxuXHRcdGNvbnN0IGdyb3VwcyA9IHt9O1xuXHRcdGNvbnN0IG9yZGVyID0gW107XG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRpZiAoIXN2YyB8fCB0eXBlb2Ygc3ZjICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuYW1lID0gKHR5cGVvZiBzdmMubmFtZSA9PT0gJ3N0cmluZycgJiYgc3ZjLm5hbWUubGVuZ3RoID4gMCkgPyBzdmMubmFtZSA6ICd1bmtub3duJztcblx0XHRcdGlmICghZ3JvdXBzW25hbWVdKSB7XG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xuXHRcdFx0XHRvcmRlci5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcnRzID0gW107XG5cdFx0b3JkZXIuZm9yRWFjaCgobmFtZSkgPT4ge1xuXHRcdFx0Y29uc3Qgcm93cyA9IGdyb3Vwc1tuYW1lXTtcblx0XHRcdGNvbnN0IGlzTXVsdGkgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubXVsdGlJbnN0YW5jZVNlcnZpY2VzW25hbWVdID09PSB0cnVlXG5cdFx0XHRcdHx8IHJvd3MubGVuZ3RoID4gMTtcblx0XHRcdGlmIChpc011bHRpKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2goYDxkaXYgY2xhc3M9XCJjdGktc3ZjLWdyb3VwLWhlYWRlclwiPiR7bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVzY2FwZUh0bWwoXG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnNlcnZpY2VMYWJlbChuYW1lKSxcblx0XHRcdFx0KX08L2Rpdj5gKTtcblx0XHRcdFx0cm93cy5mb3JFYWNoKChzdmMpID0+IHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlUm93KHN2YywgdHJ1ZSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlclNlcnZpY2VSb3cocm93c1swXSwgZmFsc2UpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChwYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IGVtcHR5ID0gKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c0VtcHR5KVxuXHRcdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c0VtcHR5XG5cdFx0XHRcdDogJ05vIHNlcnZpY2VzIHJlcG9ydGVkJztcblx0XHRcdCRwYW5lbC5odG1sKGA8ZGl2IGNsYXNzPVwidWkgYmFzaWMgc2VnbWVudFwiPiR7bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVzY2FwZUh0bWwoZW1wdHkpfTwvZGl2PmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdCRwYW5lbC5odG1sKHBhcnRzLmpvaW4oJycpKTtcblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0LXRgNCy0LjRgdCwLlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gc3ZjINC30LDQv9C40YHRjCDQuNC3IHN0YXR1c2VzW11cblx0ICogQHBhcmFtIHtib29sZWFufSBncm91cGVkIHRydWUg0LXRgdC70Lgg0YHRgtGA0L7QutCwINC40LTRkdGCINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKG11bHRpLWluc3RhbmNlKVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfSBIVE1MXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlUm93KHN2YywgZ3JvdXBlZCkge1xuXHRcdGNvbnN0IHN0YXRlUmF3ID0gKHR5cGVvZiBzdmMuc3RhdGUgPT09ICdzdHJpbmcnICYmIHN2Yy5zdGF0ZS5sZW5ndGggPiAwKSA/IHN2Yy5zdGF0ZSA6ICd1bmtub3duJztcblx0XHRjb25zdCBsZWRDbGFzcyA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zdGF0ZUxlZENsYXNzW3N0YXRlUmF3XSB8fCAnd2Fybic7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zaG9ydEFyZWEoc3ZjLmFyZWEpXG5cdFx0XHQ6IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zZXJ2aWNlTGFiZWwoc3ZjLm5hbWUpO1xuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZUxhYmVsID0gKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwdGltZSlcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVXB0aW1lXG5cdFx0XHQ6ICdVcHRpbWUnO1xuXHRcdGNvbnN0IHZlcnNpb25MYWJlbCA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WZXJzaW9uKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9WZXJzaW9uXG5cdFx0XHQ6ICdWZXJzaW9uJztcblxuXHRcdGNvbnN0IGVzYyA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sO1xuXG5cdFx0Y29uc3QgbWV0YVBhcnRzID0gW107XG5cdFx0aWYgKHVwdGltZSAhPT0gJycpIHtcblx0XHRcdG1ldGFQYXJ0cy5wdXNoKGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbWV0YVwiPiR7ZXNjKHVwdGltZUxhYmVsKX06ICR7ZXNjKHVwdGltZSl9PC9zcGFuPmApO1xuXHRcdH1cblx0XHRpZiAodmVyc2lvbiAhPT0gJycpIHtcblx0XHRcdG1ldGFQYXJ0cy5wdXNoKGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbWV0YVwiPiR7ZXNjKHZlcnNpb25MYWJlbCl9OiAke2VzYyh2ZXJzaW9uKX08L3NwYW4+YCk7XG5cdFx0fVxuXG5cdFx0bGV0IGV4dHJhID0gJyc7XG5cdFx0aWYgKGdyb3VwZWQgJiYgc3ZjLmFyZWEpIHtcblx0XHRcdC8vIGFyZWEg0YPQttC1INCyIGRpc3BsYXlOYW1lOyDQvdC40YfQtdCz0L4g0LTQvtC/0L7Qu9C90LjRgtC10LvRjNC90L4g0L3QtSDQv9C10YfQsNGC0LDQtdC8LlxuXHRcdH0gZWxzZSBpZiAoIWdyb3VwZWQgJiYgdHlwZW9mIHN2Yy5hcmVhID09PSAnc3RyaW5nJyAmJiBzdmMuYXJlYS5sZW5ndGggPiAwKSB7XG5cdFx0XHRleHRyYSA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtYXJlYVwiPiR7ZXNjKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5zaG9ydEFyZWEoc3ZjLmFyZWEpKX08L3NwYW4+YDtcblx0XHR9XG5cblx0XHRjb25zdCBlcnJCbG9jayA9IGxhc3RFcnJvciAhPT0gJydcblx0XHRcdD8gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1lcnJvclwiIHRpdGxlPVwiJHtlc2MobGFzdEVycm9yKX1cIj4ke2VzYyhtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudHJ1bmNhdGUobGFzdEVycm9yLCAxMjApKX08L3NwYW4+YFxuXHRcdFx0OiAnJztcblxuXHRcdHJldHVybiBgPGRpdiBjbGFzcz1cImN0aS1zdmMtcm93XCIgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPmBcblx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1sZWQgJHtlc2MobGVkQ2xhc3MpfVwiIHRpdGxlPVwiJHtlc2Moc3RhdGVSYXcpfVwiPjwvc3Bhbj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbmFtZVwiPiR7ZXNjKGRpc3BsYXlOYW1lKX08L3NwYW4+YFxuXHRcdFx0KyBleHRyYVxuXHRcdFx0KyBtZXRhUGFydHMuam9pbignICZtaWRkb3Q7ICcpXG5cdFx0XHQrIGVyckJsb2NrXG5cdFx0XHQrICc8L2Rpdj4nO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGVUZXh0KHN0YXRlKSB7XG5cdFx0Y29uc3Qga2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtzdGF0ZX1gO1xuXHRcdGlmICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCa0L7RgNC+0YLQutC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgYXJlYS1HVUlEIOKAlCDQv9C10YDQstGL0LUgOCDRgdC40LzQstC+0LvQvtCyLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gYXJlYVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c2hvcnRBcmVhKGFyZWEpIHtcblx0XHRpZiAodHlwZW9mIGFyZWEgIT09ICdzdHJpbmcnIHx8IGFyZWEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChhcmVhLmxlbmd0aCA8PSAxMikge1xuXHRcdFx0cmV0dXJuIGFyZWE7XG5cdFx0fVxuXHRcdHJldHVybiBgJHthcmVhLnN1YnN0cmluZygwLCA4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQo9GB0LXRh9C10L3QuNC1INGB0YLRgNC+0LrQuC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0clxuXHQgKiBAcGFyYW0ge251bWJlcn0gbWF4XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHR0cnVuY2F0ZShzdHIsIG1heCkge1xuXHRcdGlmICh0eXBlb2Ygc3RyICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAoc3RyLmxlbmd0aCA8PSBtYXgpIHtcblx0XHRcdHJldHVybiBzdHI7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtzdHIuc3Vic3RyaW5nKDAsIG1heCl94oCmYDtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC30L7Qv9Cw0YHQvdGL0Lkg0Y3QutGA0LDQvdC10YAgSFRNTC5cblx0ICpcblx0ICogQHBhcmFtIHsqfSB2YWx1ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0ZXNjYXBlSHRtbCh2YWx1ZSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBTdHJpbmcodmFsdWUpXG5cdFx0XHQucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuXHRcdFx0LnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuXHRcdFx0LnJlcGxhY2UoLz4vZywgJyZndDsnKVxuXHRcdFx0LnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuXHRcdFx0LnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQu9C10L3QuNC1INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyAo0LHQtdC50LTQtiDQsiDQv9GA0LDQstC+0Lwg0LLQtdGA0YXQvdC10Lwg0YPQs9C70YMpLlxuXHQgKlxuXHQgKiBAcGFyYW0gc3RhdHVzXG5cdCAqL1xuXHRjaGFuZ2VTdGF0dXMoc3RhdHVzKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JleScpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZWVuJylcblx0XHRcdC5yZW1vdmVDbGFzcygncmVkJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZWVuJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9EaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25Qcm9ncmVzcyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbldhaXR9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNFcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwZGF0ZVN0YXR1c31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0sXG59O1xuIl19