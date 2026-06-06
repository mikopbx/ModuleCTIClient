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
  lastRenderHash: '',

  /**
   * Маппинг state -> CSS-класс лампочки.
   * Любое неизвестное состояние -> жёлтое (warn).
   */
  stateLedClass: {
    ok: 'ok',
    authenticated: 'ok',
    error: 'error',
    fail: 'error',
    failed: 'error',
    down: 'error',
    stopped: 'error',
    unknown: 'unknown',
    pending: 'warn',
    starting: 'warn',
    qrcode: 'warn',
    reauth: 'warn',
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
   * Рендер таблицы статусов: «индикатор + сервис/канал + расположение +
   * аптайм + версия». Колонка «Расположение» появляется только если хотя бы
   * один сервис вынесен на VPS — на обычной локальной установке таблица
   * остаётся компактной.
   *
   * @param {Object} data Ответ API (response.data).
   */
  renderServicesStatus: function renderServicesStatus(data) {
    var self = moduleCTIClientConnectionCheckWorker;
    var $panel = self.$servicesStatus;

    if (!$panel || $panel.length === 0) {
      return;
    }

    var esc = self.escapeHtml;
    var $rows = $('#cti-services-status-rows');
    var $placeholder = $('#cti-services-status-placeholder');

    var showPlaceholder = function showPlaceholder(text) {
      self.lastRenderHash = '';
      $rows.empty();

      if ($placeholder.length > 0) {
        $placeholder.html("<span>&nbsp;".concat(esc(text), "</span>")).show();
      } else {
        $panel.html("<div class=\"ui basic segment\">".concat(esc(text), "</div>"));
      }
    };

    var statuses = data && data.statuses ? data.statuses : null; // Бэк может вернуть строку 'Module disabled' вместо массива.

    if (!Array.isArray(statuses)) {
      var text = typeof statuses === 'string' ? statuses : self.tr('mod_cti_StatusUnavailable', 'Status unavailable');
      showPlaceholder(text);
      return;
    } // Пропускаем перерисовку DOM, если данные не изменились — убирает
    // мерцание таблицы при опросе раз в 3 секунды.


    var hash = JSON.stringify(statuses);

    if (hash === self.lastRenderHash && $rows.children().length > 0) {
      if ($placeholder.length > 0) {
        $placeholder.hide();
      }

      return;
    } // Группируем по имени сервиса. Внутри группы — строки по area (каналы).


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

    if (order.length === 0) {
      showPlaceholder(self.tr('mod_cti_StatusEmpty', 'No services reported'));
      return;
    } // Колонка «Расположение» — только когда есть хоть один удалённый сервис.


    var hasRemote = statuses.some(function (s) {
      return s && s.location === 'remote';
    });
    var colCount = hasRemote ? 5 : 4;
    var head = '<thead><tr>' + "<th class=\"cti-col-status\">".concat(esc(self.tr('mod_cti_colStatus', 'Status')), "</th>") + "<th class=\"cti-col-name\">".concat(esc(self.tr('mod_cti_colService', 'Service')), "</th>") + (hasRemote ? "<th class=\"cti-col-loc\">".concat(esc(self.tr('mod_cti_colLocation', 'Location')), "</th>") : '') + "<th class=\"cti-col-uptime\">".concat(esc(self.tr('mod_cti_colUptime', 'Uptime')), "</th>") + "<th class=\"cti-col-version\">".concat(esc(self.tr('mod_cti_colVersion', 'Version')), "</th>") + '</tr></thead>';
    var body = [];
    order.forEach(function (name) {
      var rows = groups[name];
      var isMulti = self.multiInstanceServices[name] === true || rows.length > 1;

      if (isMulti) {
        body.push("<tr class=\"cti-svc-group\"><td colspan=\"".concat(colCount, "\">") + "<i class=\"comments icon\"></i>".concat(esc(self.serviceLabel(name))) + "<span class=\"cti-svc-count\">".concat(rows.length, "</span></td></tr>"));
        rows.forEach(function (svc) {
          body.push(self.renderServiceRow(svc, true, hasRemote));
        });
      } else {
        body.push(self.renderServiceRow(rows[0], false, hasRemote));
      }
    });
    $rows.html('<table class="ui celled striped compact unstackable table cti-status-table">' + head + '<tbody>' + body.join('') + '</tbody></table>');
    self.lastRenderHash = hash;

    if ($placeholder.length > 0) {
      $placeholder.hide();
    }
  },

  /**
   * Рендер одной строки таблицы (сервис или канал).
   *
   * @param {Object} svc запись из statuses[]
   * @param {boolean} grouped строка под групповым заголовком (канал мессенджера)
   * @param {boolean} hasRemote показывать ли колонку «Расположение»
   * @returns {string} HTML (одна <tr>, плюс <tr> с ошибкой при наличии)
   */
  renderServiceRow: function renderServiceRow(svc, grouped, hasRemote) {
    var self = moduleCTIClientConnectionCheckWorker;
    var esc = self.escapeHtml;
    var colCount = hasRemote ? 5 : 4;
    var stateRaw = typeof svc.state === 'string' && svc.state.length > 0 ? svc.state : 'unknown';
    var canon = self.canonState(stateRaw);
    var ledClass = self.stateLedClass[canon] || 'warn';
    var stateText = self.stateText(stateRaw);
    var displayName = grouped ? self.shortArea(svc.area) : self.serviceLabel(svc.name);
    var nameIcon = grouped ? '<i class="hashtag icon"></i>' : '';
    var uptime = typeof svc.uptime === 'string' && svc.uptime.length > 0 ? svc.uptime : '';
    var version = typeof svc.version === 'string' && svc.version.length > 0 ? svc.version : '';
    var lastError = typeof svc.last_error === 'string' && svc.last_error.length > 0 ? svc.last_error : '';
    var dash = '<span class="cti-dim">—</span>';
    var statusCell = "<span class=\"cti-svc-led ".concat(esc(ledClass), "\" title=\"").concat(esc(stateRaw), "\"></span>") + "<span class=\"cti-svc-state\">".concat(esc(stateText), "</span>");
    var nameCell = "<span class=\"cti-svc-name".concat(grouped ? ' cti-svc-channel' : '', "\">").concat(nameIcon).concat(esc(displayName), "</span>");
    var locCell = hasRemote ? "<td class=\"cti-col-loc\">".concat(self.locationBadge(svc.location), "</td>") : '';
    var cells = "<td class=\"cti-col-status\">".concat(statusCell, "</td>") + "<td class=\"cti-col-name\">".concat(nameCell, "</td>") + locCell + "<td class=\"cti-col-uptime\">".concat(uptime !== '' ? esc(uptime) : dash, "</td>") + "<td class=\"cti-col-version\">".concat(version !== '' ? esc(version) : dash, "</td>");
    var html = "<tr class=\"cti-svc-row".concat(grouped ? ' cti-svc-subrow' : '', "\"") + " data-svc=\"".concat(esc(svc.name || ''), "\" data-area=\"").concat(esc(svc.area || ''), "\">").concat(cells, "</tr>");

    if (lastError !== '') {
      html += "<tr class=\"cti-svc-error-row\"><td colspan=\"".concat(colCount, "\">") + "<i class=\"exclamation triangle icon\"></i>" + "<span title=\"".concat(esc(lastError), "\">").concat(esc(self.truncate(lastError, 200)), "</span>") + '</td></tr>';
    }

    return html;
  },

  /**
   * Бейдж расположения сервиса: яркий «VPS» для вынесенных каналов и
   * приглушённый «Локально» для всего остального.
   *
   * @param {string} location 'remote' | 'local' | undefined
   * @returns {string} HTML
   */
  locationBadge: function locationBadge(location) {
    var self = moduleCTIClientConnectionCheckWorker;
    var esc = self.escapeHtml;

    if (location === 'remote') {
      return "<span class=\"ui teal label cti-loc-badge\"><i class=\"cloud icon\"></i>" + "".concat(esc(self.tr('mod_cti_LocationRemote', 'VPS')), "</span>");
    }

    if (location === 'local') {
      return "<span class=\"cti-loc-local\"><i class=\"home icon\"></i>" + "".concat(esc(self.tr('mod_cti_LocationLocal', 'Local')), "</span>");
    }

    return '<span class="cti-dim">—</span>';
  },

  /**
   * Канонизация свободной строки состояния в известный ключ для лампочки и
   * перевода. monitord может присылать «awaiting authorization code» и пр.
   *
   * @param {string} state
   * @returns {string}
   */
  canonState: function canonState(state) {
    var s = String(state || '').toLowerCase();

    if (s === '') {
      return 'unknown';
    }

    if (s.indexOf('qr') !== -1) {
      return 'qrcode';
    }

    if (s.indexOf('awaiting') !== -1 || s.indexOf('reauth') !== -1 || s.indexOf('auth_required') !== -1 || s.indexOf('2fa') !== -1) {
      return 'reauth';
    }

    if (s === 'authenticated') {
      return 'authenticated';
    }

    return s;
  },

  /**
   * Хелпер перевода с фолбэком.
   *
   * @param {string} key ключ globalTranslate
   * @param {string} fallback значение по умолчанию
   * @returns {string}
   */
  tr: function tr(key, fallback) {
    if (typeof globalTranslate !== 'undefined' && globalTranslate[key]) {
      return globalTranslate[key];
    }

    return fallback;
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
   * Человекочитаемое представление state канала/сервиса (например «Подключён»,
   * «Требует авторизации»). Сначала ищем точный ключ, затем по каноническому
   * состоянию, затем — английский фолбэк, и в крайнем случае исходную строку.
   *
   * @param {string} state
   * @returns {string}
   */
  stateText: function stateText(state) {
    var self = moduleCTIClientConnectionCheckWorker;
    var raw = String(state || ''); // Точный ключ под исходное состояние (на случай специфичных переводов).

    var exactKey = "mod_cti_state_".concat(raw);

    if (typeof globalTranslate !== 'undefined' && globalTranslate[exactKey]) {
      return globalTranslate[exactKey];
    }

    var canon = self.canonState(raw);
    var canonKey = "mod_cti_state_".concat(canon);

    if (typeof globalTranslate !== 'undefined' && globalTranslate[canonKey]) {
      return globalTranslate[canonKey];
    }

    var fallback = {
      ok: 'OK',
      authenticated: 'Authenticated',
      error: 'Error',
      unknown: 'Unknown',
      pending: 'Pending',
      starting: 'Starting',
      qrcode: 'Awaiting QR-code authorization',
      reauth: 'Authorization required'
    };
    return fallback[canon] || raw;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJyZWF1dGgiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJjcm0xYyIsImhhc0Vycm9yIiwiaGFzU3RhcnRpbmciLCJmb3JFYWNoIiwicyIsIm5hbWUiLCJzdGF0ZSIsInJlbmRlckRpc2FibGVkUGFuZWwiLCIkcGFuZWwiLCJsYWJlbCIsImdsb2JhbFRyYW5zbGF0ZSIsIm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQiLCJodG1sIiwiZXNjYXBlSHRtbCIsInNlbGYiLCJlc2MiLCIkcm93cyIsIiRwbGFjZWhvbGRlciIsInNob3dQbGFjZWhvbGRlciIsInRleHQiLCJlbXB0eSIsInNob3ciLCJ0ciIsImhhc2giLCJjaGlsZHJlbiIsImhpZGUiLCJncm91cHMiLCJvcmRlciIsInN2YyIsInB1c2giLCJoYXNSZW1vdGUiLCJzb21lIiwibG9jYXRpb24iLCJjb2xDb3VudCIsImhlYWQiLCJib2R5Iiwicm93cyIsImlzTXVsdGkiLCJzZXJ2aWNlTGFiZWwiLCJyZW5kZXJTZXJ2aWNlUm93Iiwiam9pbiIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImNhbm9uIiwiY2Fub25TdGF0ZSIsImxlZENsYXNzIiwic3RhdGVUZXh0IiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwibmFtZUljb24iLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsImRhc2giLCJzdGF0dXNDZWxsIiwibmFtZUNlbGwiLCJsb2NDZWxsIiwibG9jYXRpb25CYWRnZSIsImNlbGxzIiwidHJ1bmNhdGUiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImluZGV4T2YiLCJrZXkiLCJmYWxsYmFjayIsIm1hcCIsIm1vbml0b3JkIiwibmF0cyIsInByb3h5IiwicmF3IiwiZXhhY3RLZXkiLCJjYW5vbktleSIsInN1YnN0cmluZyIsInN0ciIsInZhbHVlIiwic3RhdHVzIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsIm1vZF9jdGlfQ29ubmVjdGVkIiwibW9kX2N0aV9EaXNjb25uZWN0ZWQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzcyIsIm1vZF9jdGlfQ29ubmVjdGlvbldhaXQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3IiLCJtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvciIsIm1vZF9jdGlfVXBkYXRlU3RhdHVzIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFNQSxvQ0FBb0MsR0FBRztBQUM1Q0MsRUFBQUEsUUFBUSxFQUFFQyxDQUFDLENBQUMseUJBQUQsQ0FEaUM7QUFFNUNDLEVBQUFBLGFBQWEsRUFBRUQsQ0FBQyxDQUFDLHVCQUFELENBRjRCO0FBRzVDRSxFQUFBQSxpQkFBaUIsRUFBRUYsQ0FBQyxDQUFDLDBCQUFELENBSHdCO0FBSTVDRyxFQUFBQSxZQUFZLEVBQUVILENBQUMsQ0FBQyxvQkFBRCxDQUo2QjtBQUs1Q0ksRUFBQUEsYUFBYSxFQUFFSixDQUFDLENBQUMsU0FBRCxDQUw0QjtBQU01Q0ssRUFBQUEsYUFBYSxFQUFFTCxDQUFDLENBQUMsZUFBRCxDQU40QjtBQU81Q00sRUFBQUEsVUFBVSxFQUFFTixDQUFDLENBQUMseUNBQUQsQ0FQK0I7QUFRNUNPLEVBQUFBLGVBQWUsRUFBRVAsQ0FBQyxDQUFDLHNCQUFELENBUjBCO0FBUzVDUSxFQUFBQSxPQUFPLEVBQUUsSUFUbUM7QUFVNUNDLEVBQUFBLGFBQWEsRUFBRSxFQVY2QjtBQVc1Q0MsRUFBQUEsV0FBVyxFQUFFLENBWCtCO0FBWTVDQyxFQUFBQSxjQUFjLEVBQUUsRUFaNEI7O0FBYzVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0NDLEVBQUFBLGFBQWEsRUFBRTtBQUNkQyxJQUFBQSxFQUFFLEVBQUUsSUFEVTtBQUVkQyxJQUFBQSxhQUFhLEVBQUUsSUFGRDtBQUdkQyxJQUFBQSxLQUFLLEVBQUUsT0FITztBQUlkQyxJQUFBQSxJQUFJLEVBQUUsT0FKUTtBQUtkQyxJQUFBQSxNQUFNLEVBQUUsT0FMTTtBQU1kQyxJQUFBQSxJQUFJLEVBQUUsT0FOUTtBQU9kQyxJQUFBQSxPQUFPLEVBQUUsT0FQSztBQVFkQyxJQUFBQSxPQUFPLEVBQUUsU0FSSztBQVNkQyxJQUFBQSxPQUFPLEVBQUUsTUFUSztBQVVkQyxJQUFBQSxRQUFRLEVBQUUsTUFWSTtBQVdkQyxJQUFBQSxNQUFNLEVBQUUsTUFYTTtBQVlkQyxJQUFBQSxNQUFNLEVBQUUsTUFaTTtBQWFkQyxJQUFBQSxJQUFJLEVBQUUsTUFiUTtBQWNkQyxJQUFBQSxhQUFhLEVBQUUsTUFkRDtBQWVkQyxJQUFBQSxJQUFJLEVBQUUsTUFmUTtBQWdCZEMsSUFBQUEsT0FBTyxFQUFFO0FBaEJLLEdBbEI2Qjs7QUFxQzVDO0FBQ0Q7QUFDQTtBQUNDQyxFQUFBQSxxQkFBcUIsRUFBRTtBQUN0QkMsSUFBQUEsS0FBSyxFQUFFLElBRGU7QUFFdEJDLElBQUFBLEVBQUUsRUFBRSxJQUZrQjtBQUd0QkMsSUFBQUEsR0FBRyxFQUFFO0FBSGlCLEdBeENxQjtBQThDNUNDLEVBQUFBLFVBOUM0Qyx3QkE4Qy9CO0FBQ1puQyxJQUFBQSxvQ0FBb0MsQ0FBQ29DLGFBQXJDO0FBQ0EsR0FoRDJDO0FBa0Q1Q0EsRUFBQUEsYUFsRDRDLDJCQWtENUI7QUFDZnBDLElBQUFBLG9DQUFvQyxDQUFDWSxXQUFyQyxHQUFtRCxDQUFuRDtBQUNBWixJQUFBQSxvQ0FBb0MsQ0FBQ3FDLFlBQXJDLENBQWtELFVBQWxEO0FBQ0FDLElBQUFBLE1BQU0sQ0FBQ0MsWUFBUCxDQUFvQnZDLG9DQUFvQyxDQUFDVyxhQUF6RDtBQUNBWCxJQUFBQSxvQ0FBb0MsQ0FBQ3dDLE1BQXJDO0FBQ0EsR0F2RDJDO0FBeUQ1Q0EsRUFBQUEsTUF6RDRDLG9CQXlEbkM7QUFDUixRQUFJeEMsb0NBQW9DLENBQUNHLGFBQXJDLENBQW1Ec0MsUUFBbkQsQ0FBNEQsWUFBNUQsQ0FBSixFQUErRTtBQUM5RXZDLE1BQUFBLENBQUMsQ0FBQ3dDLEdBQUYsQ0FBTTtBQUNMQyxRQUFBQSxHQUFHLFlBQUtDLE1BQU0sQ0FBQ0MsTUFBWiwrQ0FERTtBQUVMQyxRQUFBQSxFQUFFLEVBQUUsS0FGQztBQUdMQyxRQUFBQSxXQUFXLEVBQUVDLE1BQU0sQ0FBQ0QsV0FIZjtBQUlMRSxRQUFBQSxVQUpLLHdCQUlRO0FBQ1pqRCxVQUFBQSxvQ0FBb0MsQ0FBQ1csYUFBckMsR0FBcUQyQixNQUFNLENBQUNZLFVBQVAsQ0FDcERsRCxvQ0FBb0MsQ0FBQ3dDLE1BRGUsRUFFcER4QyxvQ0FBb0MsQ0FBQ1UsT0FGZSxDQUFyRDtBQUlBLFNBVEk7QUFVTHlDLFFBQUFBLFVBVkssc0JBVU1DLFFBVk4sRUFVZ0I7QUFDcEJsRCxVQUFBQSxDQUFDLENBQUMsZUFBRCxDQUFELENBQW1CbUQsTUFBbkI7O0FBQ0EsY0FBSSxPQUFRRCxRQUFRLENBQUNFLElBQWpCLEtBQTJCLFdBQS9CLEVBQTRDO0FBQzNDO0FBQ0EsV0FKbUIsQ0FNcEI7OztBQUNBdEQsVUFBQUEsb0NBQW9DLENBQUN1RCxvQkFBckMsQ0FBMERILFFBQVEsQ0FBQ0UsSUFBbkUsRUFQb0IsQ0FTcEI7O0FBQ0EsY0FBSUUsaUJBQWlCLEdBQUdDLElBQUksQ0FBQ0MsU0FBTCxDQUFlTixRQUFRLENBQUNFLElBQXhCLEVBQThCLElBQTlCLEVBQW9DLENBQXBDLENBQXhCOztBQUNBLGNBQUksT0FBT0UsaUJBQVAsS0FBNkIsUUFBakMsRUFBMkM7QUFDMUNBLFlBQUFBLGlCQUFpQixHQUFHQSxpQkFBaUIsQ0FBQ0csT0FBbEIsQ0FBMEIsS0FBMUIsRUFBaUMsT0FBakMsQ0FBcEI7O0FBQ0EsZ0JBQUlDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZVCxRQUFaLEVBQXNCVSxNQUF0QixHQUErQixDQUEvQixJQUFvQ1YsUUFBUSxDQUFDVyxNQUFULEtBQW9CLElBQTVELEVBQWtFO0FBQ2pFL0QsY0FBQUEsb0NBQW9DLENBQUNRLFVBQXJDLENBQ0V3RCxLQURGLGtHQUV3Q1IsaUJBRnhDO0FBSUEsYUFMRCxNQUtPO0FBQ054RCxjQUFBQSxvQ0FBb0MsQ0FBQ1EsVUFBckMsQ0FDRXdELEtBREYsMkpBR3VDUixpQkFIdkM7QUFLQTtBQUNEO0FBQ0QsU0FwQ0k7QUFxQ0xTLFFBQUFBLFNBckNLLHVCQXFDTztBQUNYakUsVUFBQUEsb0NBQW9DLENBQUNxQyxZQUFyQyxDQUFrRCxXQUFsRDtBQUNBckMsVUFBQUEsb0NBQW9DLENBQUNZLFdBQXJDLEdBQW1ELENBQW5EO0FBQ0EwQixVQUFBQSxNQUFNLENBQUNDLFlBQVAsQ0FBb0J2QyxvQ0FBb0MsQ0FBQ1csYUFBekQ7QUFDQSxTQXpDSTtBQTBDTHVELFFBQUFBLFNBMUNLLHFCQTBDS2QsUUExQ0wsRUEwQ2U7QUFDbkJwRCxVQUFBQSxvQ0FBb0MsQ0FBQ1ksV0FBckMsSUFBb0QsQ0FBcEQ7QUFDQSxjQUFNdUQsUUFBUSxHQUFJZixRQUFRLElBQUlBLFFBQVEsQ0FBQ0UsSUFBckIsSUFBNkJjLEtBQUssQ0FBQ0MsT0FBTixDQUFjakIsUUFBUSxDQUFDRSxJQUFULENBQWNhLFFBQTVCLENBQTlCLEdBQ2RmLFFBQVEsQ0FBQ0UsSUFBVCxDQUFjYSxRQURBLEdBQ1csSUFENUI7O0FBRUEsY0FBSSxDQUFDQSxRQUFMLEVBQWU7QUFDZG5FLFlBQUFBLG9DQUFvQyxDQUFDcUMsWUFBckMsQ0FBa0QsaUJBQWxEO0FBQ0E7QUFDQSxXQVBrQixDQVFuQjtBQUNBOzs7QUFDQSxjQUFJaUMsS0FBSyxHQUFHLElBQVo7QUFDQSxjQUFJQyxRQUFRLEdBQUcsS0FBZjtBQUNBLGNBQUlDLFdBQVcsR0FBRyxLQUFsQjtBQUNBTCxVQUFBQSxRQUFRLENBQUNNLE9BQVQsQ0FBaUIsVUFBQ0MsQ0FBRCxFQUFPO0FBQ3ZCLGdCQUFJLENBQUNBLENBQUQsSUFBTSxPQUFPQSxDQUFDLENBQUNDLElBQVQsS0FBa0IsV0FBNUIsRUFBeUM7QUFDekMsZ0JBQUlELENBQUMsQ0FBQ0MsSUFBRixLQUFXLFFBQWYsRUFBeUJMLEtBQUssR0FBR0ksQ0FBQyxDQUFDRSxLQUFWO0FBQ3pCLGdCQUFJRixDQUFDLENBQUNFLEtBQUYsS0FBWSxPQUFaLElBQXVCRixDQUFDLENBQUNFLEtBQUYsS0FBWSxNQUFuQyxJQUE2Q0YsQ0FBQyxDQUFDRSxLQUFGLEtBQVksUUFBekQsSUFDQUYsQ0FBQyxDQUFDRSxLQUFGLEtBQVksTUFEWixJQUNzQkYsQ0FBQyxDQUFDRSxLQUFGLEtBQVksU0FEdEMsRUFDaURMLFFBQVEsR0FBRyxJQUFYO0FBQ2pELGdCQUFJRyxDQUFDLENBQUNFLEtBQUYsS0FBWSxVQUFaLElBQTBCRixDQUFDLENBQUNFLEtBQUYsS0FBWSxTQUF0QyxJQUNBRixDQUFDLENBQUNFLEtBQUYsS0FBWSxTQURoQixFQUMyQkosV0FBVyxHQUFHLElBQWQ7QUFDM0IsV0FQRDs7QUFRQSxjQUFJRixLQUFLLElBQUlBLEtBQUssS0FBSyxJQUF2QixFQUE2QjtBQUM1QixnQkFBSXRFLG9DQUFvQyxDQUFDSSxpQkFBckMsQ0FBdURxQyxRQUF2RCxDQUFnRSxZQUFoRSxDQUFKLEVBQW1GO0FBQ2xGekMsY0FBQUEsb0NBQW9DLENBQUNxQyxZQUFyQyxDQUFrRCxxQkFBbEQ7QUFDQSxhQUZELE1BRU87QUFDTnJDLGNBQUFBLG9DQUFvQyxDQUFDcUMsWUFBckMsQ0FBa0Qsb0JBQWxEO0FBQ0E7QUFDRCxXQU5ELE1BTU8sSUFBSW1DLFdBQUosRUFBaUI7QUFDdkI7QUFDQTtBQUNBO0FBQ0EsZ0JBQUl4RSxvQ0FBb0MsQ0FBQ1ksV0FBckMsR0FBbUQsRUFBdkQsRUFBMkQ7QUFDMURaLGNBQUFBLG9DQUFvQyxDQUFDcUMsWUFBckMsQ0FBa0Qsb0JBQWxEO0FBQ0EsYUFGRCxNQUVPO0FBQ05yQyxjQUFBQSxvQ0FBb0MsQ0FBQ3FDLFlBQXJDLENBQWtELGlCQUFsRDtBQUNBO0FBQ0QsV0FUTSxNQVNBLElBQUlrQyxRQUFKLEVBQWM7QUFDcEJ2RSxZQUFBQSxvQ0FBb0MsQ0FBQ3FDLFlBQXJDLENBQWtELGlCQUFsRDtBQUNBLFdBRk0sTUFFQTtBQUNOckMsWUFBQUEsb0NBQW9DLENBQUNxQyxZQUFyQyxDQUFrRCxXQUFsRDtBQUNBO0FBQ0Q7QUFuRkksT0FBTjtBQXFGQSxLQXRGRCxNQXNGTztBQUNOckMsTUFBQUEsb0NBQW9DLENBQUNZLFdBQXJDLEdBQW1ELENBQW5EO0FBQ0FaLE1BQUFBLG9DQUFvQyxDQUFDNkUsbUJBQXJDO0FBQ0E7QUFDRCxHQXBKMkM7O0FBc0o1QztBQUNEO0FBQ0E7QUFDQ0EsRUFBQUEsbUJBeko0QyxpQ0F5SnRCO0FBQ3JCLFFBQU1DLE1BQU0sR0FBRzlFLG9DQUFvQyxDQUFDUyxlQUFwRDs7QUFDQSxRQUFJLENBQUNxRSxNQUFELElBQVdBLE1BQU0sQ0FBQ2hCLE1BQVAsS0FBa0IsQ0FBakMsRUFBb0M7QUFDbkM7QUFDQTs7QUFDRCxRQUFNaUIsS0FBSyxHQUFJLE9BQU9DLGVBQVAsS0FBMkIsV0FBM0IsSUFDWEEsZUFBZSxDQUFDQyw0QkFETixHQUVYRCxlQUFlLENBQUNDLDRCQUZMLEdBR1gsb0JBSEg7QUFJQUgsSUFBQUEsTUFBTSxDQUFDSSxJQUFQLDJDQUE2Q2xGLG9DQUFvQyxDQUFDbUYsVUFBckMsQ0FBZ0RKLEtBQWhELENBQTdDO0FBQ0EsR0FuSzJDOztBQXFLNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDeEIsRUFBQUEsb0JBN0s0QyxnQ0E2S3ZCRCxJQTdLdUIsRUE2S2pCO0FBQzFCLFFBQU04QixJQUFJLEdBQUdwRixvQ0FBYjtBQUNBLFFBQU04RSxNQUFNLEdBQUdNLElBQUksQ0FBQzNFLGVBQXBCOztBQUNBLFFBQUksQ0FBQ3FFLE1BQUQsSUFBV0EsTUFBTSxDQUFDaEIsTUFBUCxLQUFrQixDQUFqQyxFQUFvQztBQUNuQztBQUNBOztBQUVELFFBQU11QixHQUFHLEdBQUdELElBQUksQ0FBQ0QsVUFBakI7QUFDQSxRQUFNRyxLQUFLLEdBQUdwRixDQUFDLENBQUMsMkJBQUQsQ0FBZjtBQUNBLFFBQU1xRixZQUFZLEdBQUdyRixDQUFDLENBQUMsa0NBQUQsQ0FBdEI7O0FBQ0EsUUFBTXNGLGVBQWUsR0FBRyxTQUFsQkEsZUFBa0IsQ0FBQ0MsSUFBRCxFQUFVO0FBQ2pDTCxNQUFBQSxJQUFJLENBQUN2RSxjQUFMLEdBQXNCLEVBQXRCO0FBQ0F5RSxNQUFBQSxLQUFLLENBQUNJLEtBQU47O0FBQ0EsVUFBSUgsWUFBWSxDQUFDekIsTUFBYixHQUFzQixDQUExQixFQUE2QjtBQUM1QnlCLFFBQUFBLFlBQVksQ0FBQ0wsSUFBYix1QkFBaUNHLEdBQUcsQ0FBQ0ksSUFBRCxDQUFwQyxjQUFxREUsSUFBckQ7QUFDQSxPQUZELE1BRU87QUFDTmIsUUFBQUEsTUFBTSxDQUFDSSxJQUFQLDJDQUE2Q0csR0FBRyxDQUFDSSxJQUFELENBQWhEO0FBQ0E7QUFDRCxLQVJEOztBQVVBLFFBQU10QixRQUFRLEdBQUliLElBQUksSUFBSUEsSUFBSSxDQUFDYSxRQUFkLEdBQTBCYixJQUFJLENBQUNhLFFBQS9CLEdBQTBDLElBQTNELENBcEIwQixDQXNCMUI7O0FBQ0EsUUFBSSxDQUFDQyxLQUFLLENBQUNDLE9BQU4sQ0FBY0YsUUFBZCxDQUFMLEVBQThCO0FBQzdCLFVBQU1zQixJQUFJLEdBQUksT0FBT3RCLFFBQVAsS0FBb0IsUUFBckIsR0FDVkEsUUFEVSxHQUVWaUIsSUFBSSxDQUFDUSxFQUFMLENBQVEsMkJBQVIsRUFBcUMsb0JBQXJDLENBRkg7QUFHQUosTUFBQUEsZUFBZSxDQUFDQyxJQUFELENBQWY7QUFDQTtBQUNBLEtBN0J5QixDQStCMUI7QUFDQTs7O0FBQ0EsUUFBTUksSUFBSSxHQUFHcEMsSUFBSSxDQUFDQyxTQUFMLENBQWVTLFFBQWYsQ0FBYjs7QUFDQSxRQUFJMEIsSUFBSSxLQUFLVCxJQUFJLENBQUN2RSxjQUFkLElBQWdDeUUsS0FBSyxDQUFDUSxRQUFOLEdBQWlCaEMsTUFBakIsR0FBMEIsQ0FBOUQsRUFBaUU7QUFDaEUsVUFBSXlCLFlBQVksQ0FBQ3pCLE1BQWIsR0FBc0IsQ0FBMUIsRUFBNkI7QUFDNUJ5QixRQUFBQSxZQUFZLENBQUNRLElBQWI7QUFDQTs7QUFDRDtBQUNBLEtBdkN5QixDQXlDMUI7OztBQUNBLFFBQU1DLE1BQU0sR0FBRyxFQUFmO0FBQ0EsUUFBTUMsS0FBSyxHQUFHLEVBQWQ7QUFDQTlCLElBQUFBLFFBQVEsQ0FBQ00sT0FBVCxDQUFpQixVQUFDeUIsR0FBRCxFQUFTO0FBQ3pCLFVBQUksQ0FBQ0EsR0FBRCxJQUFRLFFBQU9BLEdBQVAsTUFBZSxRQUEzQixFQUFxQztBQUNwQztBQUNBOztBQUNELFVBQU12QixJQUFJLEdBQUksT0FBT3VCLEdBQUcsQ0FBQ3ZCLElBQVgsS0FBb0IsUUFBcEIsSUFBZ0N1QixHQUFHLENBQUN2QixJQUFKLENBQVNiLE1BQVQsR0FBa0IsQ0FBbkQsR0FBd0RvQyxHQUFHLENBQUN2QixJQUE1RCxHQUFtRSxTQUFoRjs7QUFDQSxVQUFJLENBQUNxQixNQUFNLENBQUNyQixJQUFELENBQVgsRUFBbUI7QUFDbEJxQixRQUFBQSxNQUFNLENBQUNyQixJQUFELENBQU4sR0FBZSxFQUFmO0FBQ0FzQixRQUFBQSxLQUFLLENBQUNFLElBQU4sQ0FBV3hCLElBQVg7QUFDQTs7QUFDRHFCLE1BQUFBLE1BQU0sQ0FBQ3JCLElBQUQsQ0FBTixDQUFhd0IsSUFBYixDQUFrQkQsR0FBbEI7QUFDQSxLQVZEOztBQVlBLFFBQUlELEtBQUssQ0FBQ25DLE1BQU4sS0FBaUIsQ0FBckIsRUFBd0I7QUFDdkIwQixNQUFBQSxlQUFlLENBQUNKLElBQUksQ0FBQ1EsRUFBTCxDQUFRLHFCQUFSLEVBQStCLHNCQUEvQixDQUFELENBQWY7QUFDQTtBQUNBLEtBM0R5QixDQTZEMUI7OztBQUNBLFFBQU1RLFNBQVMsR0FBR2pDLFFBQVEsQ0FBQ2tDLElBQVQsQ0FBYyxVQUFDM0IsQ0FBRDtBQUFBLGFBQU9BLENBQUMsSUFBSUEsQ0FBQyxDQUFDNEIsUUFBRixLQUFlLFFBQTNCO0FBQUEsS0FBZCxDQUFsQjtBQUNBLFFBQU1DLFFBQVEsR0FBR0gsU0FBUyxHQUFHLENBQUgsR0FBTyxDQUFqQztBQUVBLFFBQU1JLElBQUksR0FBRyx1REFDb0JuQixHQUFHLENBQUNELElBQUksQ0FBQ1EsRUFBTCxDQUFRLG1CQUFSLEVBQTZCLFFBQTdCLENBQUQsQ0FEdkIsa0RBRWtCUCxHQUFHLENBQUNELElBQUksQ0FBQ1EsRUFBTCxDQUFRLG9CQUFSLEVBQThCLFNBQTlCLENBQUQsQ0FGckIsY0FHVFEsU0FBUyx1Q0FBOEJmLEdBQUcsQ0FBQ0QsSUFBSSxDQUFDUSxFQUFMLENBQVEscUJBQVIsRUFBK0IsVUFBL0IsQ0FBRCxDQUFqQyxhQUF1RixFQUh2RiwyQ0FJb0JQLEdBQUcsQ0FBQ0QsSUFBSSxDQUFDUSxFQUFMLENBQVEsbUJBQVIsRUFBNkIsUUFBN0IsQ0FBRCxDQUp2QixxREFLcUJQLEdBQUcsQ0FBQ0QsSUFBSSxDQUFDUSxFQUFMLENBQVEsb0JBQVIsRUFBOEIsU0FBOUIsQ0FBRCxDQUx4QixhQU1WLGVBTkg7QUFRQSxRQUFNYSxJQUFJLEdBQUcsRUFBYjtBQUNBUixJQUFBQSxLQUFLLENBQUN4QixPQUFOLENBQWMsVUFBQ0UsSUFBRCxFQUFVO0FBQ3ZCLFVBQU0rQixJQUFJLEdBQUdWLE1BQU0sQ0FBQ3JCLElBQUQsQ0FBbkI7QUFDQSxVQUFNZ0MsT0FBTyxHQUFHdkIsSUFBSSxDQUFDckQscUJBQUwsQ0FBMkI0QyxJQUEzQixNQUFxQyxJQUFyQyxJQUE2QytCLElBQUksQ0FBQzVDLE1BQUwsR0FBYyxDQUEzRTs7QUFDQSxVQUFJNkMsT0FBSixFQUFhO0FBQ1pGLFFBQUFBLElBQUksQ0FBQ04sSUFBTCxDQUFVLG9EQUEwQ0ksUUFBMUMsb0RBQ3lCbEIsR0FBRyxDQUFDRCxJQUFJLENBQUN3QixZQUFMLENBQWtCakMsSUFBbEIsQ0FBRCxDQUQ1Qiw0Q0FFd0IrQixJQUFJLENBQUM1QyxNQUY3QixzQkFBVjtBQUdBNEMsUUFBQUEsSUFBSSxDQUFDakMsT0FBTCxDQUFhLFVBQUN5QixHQUFELEVBQVM7QUFDckJPLFVBQUFBLElBQUksQ0FBQ04sSUFBTCxDQUFVZixJQUFJLENBQUN5QixnQkFBTCxDQUFzQlgsR0FBdEIsRUFBMkIsSUFBM0IsRUFBaUNFLFNBQWpDLENBQVY7QUFDQSxTQUZEO0FBR0EsT0FQRCxNQU9PO0FBQ05LLFFBQUFBLElBQUksQ0FBQ04sSUFBTCxDQUFVZixJQUFJLENBQUN5QixnQkFBTCxDQUFzQkgsSUFBSSxDQUFDLENBQUQsQ0FBMUIsRUFBK0IsS0FBL0IsRUFBc0NOLFNBQXRDLENBQVY7QUFDQTtBQUNELEtBYkQ7QUFlQWQsSUFBQUEsS0FBSyxDQUFDSixJQUFOLENBQVcsaUZBQ1JzQixJQURRLEdBQ0QsU0FEQyxHQUNXQyxJQUFJLENBQUNLLElBQUwsQ0FBVSxFQUFWLENBRFgsR0FDMkIsa0JBRHRDO0FBRUExQixJQUFBQSxJQUFJLENBQUN2RSxjQUFMLEdBQXNCZ0YsSUFBdEI7O0FBQ0EsUUFBSU4sWUFBWSxDQUFDekIsTUFBYixHQUFzQixDQUExQixFQUE2QjtBQUM1QnlCLE1BQUFBLFlBQVksQ0FBQ1EsSUFBYjtBQUNBO0FBQ0QsR0E1UTJDOztBQThRNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDYyxFQUFBQSxnQkF0UjRDLDRCQXNSM0JYLEdBdFIyQixFQXNSdEJhLE9BdFJzQixFQXNSYlgsU0F0UmEsRUFzUkY7QUFDekMsUUFBTWhCLElBQUksR0FBR3BGLG9DQUFiO0FBQ0EsUUFBTXFGLEdBQUcsR0FBR0QsSUFBSSxDQUFDRCxVQUFqQjtBQUNBLFFBQU1vQixRQUFRLEdBQUdILFNBQVMsR0FBRyxDQUFILEdBQU8sQ0FBakM7QUFFQSxRQUFNWSxRQUFRLEdBQUksT0FBT2QsR0FBRyxDQUFDdEIsS0FBWCxLQUFxQixRQUFyQixJQUFpQ3NCLEdBQUcsQ0FBQ3RCLEtBQUosQ0FBVWQsTUFBVixHQUFtQixDQUFyRCxHQUEwRG9DLEdBQUcsQ0FBQ3RCLEtBQTlELEdBQXNFLFNBQXZGO0FBQ0EsUUFBTXFDLEtBQUssR0FBRzdCLElBQUksQ0FBQzhCLFVBQUwsQ0FBZ0JGLFFBQWhCLENBQWQ7QUFDQSxRQUFNRyxRQUFRLEdBQUcvQixJQUFJLENBQUN0RSxhQUFMLENBQW1CbUcsS0FBbkIsS0FBNkIsTUFBOUM7QUFDQSxRQUFNRyxTQUFTLEdBQUdoQyxJQUFJLENBQUNnQyxTQUFMLENBQWVKLFFBQWYsQ0FBbEI7QUFFQSxRQUFNSyxXQUFXLEdBQUdOLE9BQU8sR0FDeEIzQixJQUFJLENBQUNrQyxTQUFMLENBQWVwQixHQUFHLENBQUNxQixJQUFuQixDQUR3QixHQUV4Qm5DLElBQUksQ0FBQ3dCLFlBQUwsQ0FBa0JWLEdBQUcsQ0FBQ3ZCLElBQXRCLENBRkg7QUFHQSxRQUFNNkMsUUFBUSxHQUFHVCxPQUFPLEdBQUcsOEJBQUgsR0FBb0MsRUFBNUQ7QUFFQSxRQUFNVSxNQUFNLEdBQUksT0FBT3ZCLEdBQUcsQ0FBQ3VCLE1BQVgsS0FBc0IsUUFBdEIsSUFBa0N2QixHQUFHLENBQUN1QixNQUFKLENBQVczRCxNQUFYLEdBQW9CLENBQXZELEdBQTREb0MsR0FBRyxDQUFDdUIsTUFBaEUsR0FBeUUsRUFBeEY7QUFDQSxRQUFNQyxPQUFPLEdBQUksT0FBT3hCLEdBQUcsQ0FBQ3dCLE9BQVgsS0FBdUIsUUFBdkIsSUFBbUN4QixHQUFHLENBQUN3QixPQUFKLENBQVk1RCxNQUFaLEdBQXFCLENBQXpELEdBQThEb0MsR0FBRyxDQUFDd0IsT0FBbEUsR0FBNEUsRUFBNUY7QUFDQSxRQUFNQyxTQUFTLEdBQUksT0FBT3pCLEdBQUcsQ0FBQzBCLFVBQVgsS0FBMEIsUUFBMUIsSUFBc0MxQixHQUFHLENBQUMwQixVQUFKLENBQWU5RCxNQUFmLEdBQXdCLENBQS9ELEdBQW9Fb0MsR0FBRyxDQUFDMEIsVUFBeEUsR0FBcUYsRUFBdkc7QUFDQSxRQUFNQyxJQUFJLEdBQUcsZ0NBQWI7QUFFQSxRQUFNQyxVQUFVLEdBQUcsb0NBQTRCekMsR0FBRyxDQUFDOEIsUUFBRCxDQUEvQix3QkFBcUQ5QixHQUFHLENBQUMyQixRQUFELENBQXhELDBEQUNlM0IsR0FBRyxDQUFDK0IsU0FBRCxDQURsQixZQUFuQjtBQUdBLFFBQU1XLFFBQVEsdUNBQStCaEIsT0FBTyxHQUFHLGtCQUFILEdBQXdCLEVBQTlELGdCQUFxRVMsUUFBckUsU0FBZ0ZuQyxHQUFHLENBQUNnQyxXQUFELENBQW5GLFlBQWQ7QUFFQSxRQUFNVyxPQUFPLEdBQUc1QixTQUFTLHVDQUE4QmhCLElBQUksQ0FBQzZDLGFBQUwsQ0FBbUIvQixHQUFHLENBQUNJLFFBQXZCLENBQTlCLGFBQXdFLEVBQWpHO0FBRUEsUUFBTTRCLEtBQUssR0FBRyx1Q0FBOEJKLFVBQTlCLGtEQUNpQkMsUUFEakIsYUFFWEMsT0FGVywwQ0FHbUJQLE1BQU0sS0FBSyxFQUFYLEdBQWdCcEMsR0FBRyxDQUFDb0MsTUFBRCxDQUFuQixHQUE4QkksSUFIakQscURBSW9CSCxPQUFPLEtBQUssRUFBWixHQUFpQnJDLEdBQUcsQ0FBQ3FDLE9BQUQsQ0FBcEIsR0FBZ0NHLElBSnBELFVBQWQ7QUFNQSxRQUFJM0MsSUFBSSxHQUFHLGlDQUF5QjZCLE9BQU8sR0FBRyxpQkFBSCxHQUF1QixFQUF2RCxnQ0FDTTFCLEdBQUcsQ0FBQ2EsR0FBRyxDQUFDdkIsSUFBSixJQUFZLEVBQWIsQ0FEVCw0QkFDeUNVLEdBQUcsQ0FBQ2EsR0FBRyxDQUFDcUIsSUFBSixJQUFZLEVBQWIsQ0FENUMsZ0JBQ2lFVyxLQURqRSxVQUFYOztBQUdBLFFBQUlQLFNBQVMsS0FBSyxFQUFsQixFQUFzQjtBQUNyQnpDLE1BQUFBLElBQUksSUFBSSx3REFBOENxQixRQUE5QyxtRkFFV2xCLEdBQUcsQ0FBQ3NDLFNBQUQsQ0FGZCxnQkFFOEJ0QyxHQUFHLENBQUNELElBQUksQ0FBQytDLFFBQUwsQ0FBY1IsU0FBZCxFQUF5QixHQUF6QixDQUFELENBRmpDLGVBR0wsWUFISDtBQUlBOztBQUVELFdBQU96QyxJQUFQO0FBQ0EsR0FsVTJDOztBQW9VNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQytDLEVBQUFBLGFBM1U0Qyx5QkEyVTlCM0IsUUEzVThCLEVBMlVwQjtBQUN2QixRQUFNbEIsSUFBSSxHQUFHcEYsb0NBQWI7QUFDQSxRQUFNcUYsR0FBRyxHQUFHRCxJQUFJLENBQUNELFVBQWpCOztBQUNBLFFBQUltQixRQUFRLEtBQUssUUFBakIsRUFBMkI7QUFDMUIsYUFBTyx1RkFDRGpCLEdBQUcsQ0FBQ0QsSUFBSSxDQUFDUSxFQUFMLENBQVEsd0JBQVIsRUFBa0MsS0FBbEMsQ0FBRCxDQURGLFlBQVA7QUFFQTs7QUFDRCxRQUFJVSxRQUFRLEtBQUssT0FBakIsRUFBMEI7QUFDekIsYUFBTyx3RUFDRGpCLEdBQUcsQ0FBQ0QsSUFBSSxDQUFDUSxFQUFMLENBQVEsdUJBQVIsRUFBaUMsT0FBakMsQ0FBRCxDQURGLFlBQVA7QUFFQTs7QUFDRCxXQUFPLGdDQUFQO0FBQ0EsR0F2VjJDOztBQXlWNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3NCLEVBQUFBLFVBaFc0QyxzQkFnV2pDdEMsS0FoV2lDLEVBZ1cxQjtBQUNqQixRQUFNRixDQUFDLEdBQUcwRCxNQUFNLENBQUN4RCxLQUFLLElBQUksRUFBVixDQUFOLENBQW9CeUQsV0FBcEIsRUFBVjs7QUFDQSxRQUFJM0QsQ0FBQyxLQUFLLEVBQVYsRUFBYztBQUNiLGFBQU8sU0FBUDtBQUNBOztBQUNELFFBQUlBLENBQUMsQ0FBQzRELE9BQUYsQ0FBVSxJQUFWLE1BQW9CLENBQUMsQ0FBekIsRUFBNEI7QUFDM0IsYUFBTyxRQUFQO0FBQ0E7O0FBQ0QsUUFBSTVELENBQUMsQ0FBQzRELE9BQUYsQ0FBVSxVQUFWLE1BQTBCLENBQUMsQ0FBM0IsSUFBZ0M1RCxDQUFDLENBQUM0RCxPQUFGLENBQVUsUUFBVixNQUF3QixDQUFDLENBQXpELElBQ0E1RCxDQUFDLENBQUM0RCxPQUFGLENBQVUsZUFBVixNQUErQixDQUFDLENBRGhDLElBQ3FDNUQsQ0FBQyxDQUFDNEQsT0FBRixDQUFVLEtBQVYsTUFBcUIsQ0FBQyxDQUQvRCxFQUNrRTtBQUNqRSxhQUFPLFFBQVA7QUFDQTs7QUFDRCxRQUFJNUQsQ0FBQyxLQUFLLGVBQVYsRUFBMkI7QUFDMUIsYUFBTyxlQUFQO0FBQ0E7O0FBQ0QsV0FBT0EsQ0FBUDtBQUNBLEdBaFgyQzs7QUFrWDVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NrQixFQUFBQSxFQXpYNEMsY0F5WHpDMkMsR0F6WHlDLEVBeVhwQ0MsUUF6WG9DLEVBeVgxQjtBQUNqQixRQUFJLE9BQU94RCxlQUFQLEtBQTJCLFdBQTNCLElBQTBDQSxlQUFlLENBQUN1RCxHQUFELENBQTdELEVBQW9FO0FBQ25FLGFBQU92RCxlQUFlLENBQUN1RCxHQUFELENBQXRCO0FBQ0E7O0FBQ0QsV0FBT0MsUUFBUDtBQUNBLEdBOVgyQzs7QUFnWTVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDNUIsRUFBQUEsWUF0WTRDLHdCQXNZL0JqQyxJQXRZK0IsRUFzWXpCO0FBQ2xCLFFBQU04RCxHQUFHLEdBQUc7QUFDWEMsTUFBQUEsUUFBUSxFQUFFLHNCQURDO0FBRVhDLE1BQUFBLElBQUksRUFBRSxrQkFGSztBQUdYLGdCQUFVLGlCQUhDO0FBSVhoSCxNQUFBQSxJQUFJLEVBQUUsa0JBSks7QUFLWGlILE1BQUFBLEtBQUssRUFBRSxtQkFMSTtBQU1YLHNCQUFnQixpQkFOTDtBQU9YNUcsTUFBQUEsS0FBSyxFQUFFLG1CQVBJO0FBUVhDLE1BQUFBLEVBQUUsRUFBRSxnQkFSTztBQVNYQyxNQUFBQSxHQUFHLEVBQUUsaUJBVE07QUFVWCxxQkFBZSx5QkFWSjtBQVdYLHVCQUFpQjtBQVhOLEtBQVo7QUFhQSxRQUFNcUcsR0FBRyxHQUFHRSxHQUFHLENBQUM5RCxJQUFELENBQWY7O0FBQ0EsUUFBSTRELEdBQUcsSUFBSSxPQUFPdkQsZUFBUCxLQUEyQixXQUFsQyxJQUFpREEsZUFBZSxDQUFDdUQsR0FBRCxDQUFwRSxFQUEyRTtBQUMxRSxhQUFPdkQsZUFBZSxDQUFDdUQsR0FBRCxDQUF0QjtBQUNBOztBQUNELFdBQU81RCxJQUFJLElBQUksU0FBZjtBQUNBLEdBeloyQzs7QUEyWjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3lDLEVBQUFBLFNBbmE0QyxxQkFtYWxDeEMsS0FuYWtDLEVBbWEzQjtBQUNoQixRQUFNUSxJQUFJLEdBQUdwRixvQ0FBYjtBQUNBLFFBQU02SSxHQUFHLEdBQUdULE1BQU0sQ0FBQ3hELEtBQUssSUFBSSxFQUFWLENBQWxCLENBRmdCLENBR2hCOztBQUNBLFFBQU1rRSxRQUFRLDJCQUFvQkQsR0FBcEIsQ0FBZDs7QUFDQSxRQUFJLE9BQU83RCxlQUFQLEtBQTJCLFdBQTNCLElBQTBDQSxlQUFlLENBQUM4RCxRQUFELENBQTdELEVBQXlFO0FBQ3hFLGFBQU85RCxlQUFlLENBQUM4RCxRQUFELENBQXRCO0FBQ0E7O0FBQ0QsUUFBTTdCLEtBQUssR0FBRzdCLElBQUksQ0FBQzhCLFVBQUwsQ0FBZ0IyQixHQUFoQixDQUFkO0FBQ0EsUUFBTUUsUUFBUSwyQkFBb0I5QixLQUFwQixDQUFkOztBQUNBLFFBQUksT0FBT2pDLGVBQVAsS0FBMkIsV0FBM0IsSUFBMENBLGVBQWUsQ0FBQytELFFBQUQsQ0FBN0QsRUFBeUU7QUFDeEUsYUFBTy9ELGVBQWUsQ0FBQytELFFBQUQsQ0FBdEI7QUFDQTs7QUFDRCxRQUFNUCxRQUFRLEdBQUc7QUFDaEJ6SCxNQUFBQSxFQUFFLEVBQUUsSUFEWTtBQUVoQkMsTUFBQUEsYUFBYSxFQUFFLGVBRkM7QUFHaEJDLE1BQUFBLEtBQUssRUFBRSxPQUhTO0FBSWhCSyxNQUFBQSxPQUFPLEVBQUUsU0FKTztBQUtoQkMsTUFBQUEsT0FBTyxFQUFFLFNBTE87QUFNaEJDLE1BQUFBLFFBQVEsRUFBRSxVQU5NO0FBT2hCQyxNQUFBQSxNQUFNLEVBQUUsZ0NBUFE7QUFRaEJDLE1BQUFBLE1BQU0sRUFBRTtBQVJRLEtBQWpCO0FBVUEsV0FBTzhHLFFBQVEsQ0FBQ3ZCLEtBQUQsQ0FBUixJQUFtQjRCLEdBQTFCO0FBQ0EsR0EzYjJDOztBQTZiNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0N2QixFQUFBQSxTQW5jNEMscUJBbWNsQ0MsSUFuY2tDLEVBbWM1QjtBQUNmLFFBQUksT0FBT0EsSUFBUCxLQUFnQixRQUFoQixJQUE0QkEsSUFBSSxDQUFDekQsTUFBTCxLQUFnQixDQUFoRCxFQUFtRDtBQUNsRCxhQUFPLEVBQVA7QUFDQTs7QUFDRCxRQUFJeUQsSUFBSSxDQUFDekQsTUFBTCxJQUFlLEVBQW5CLEVBQXVCO0FBQ3RCLGFBQU95RCxJQUFQO0FBQ0E7O0FBQ0QscUJBQVVBLElBQUksQ0FBQ3lCLFNBQUwsQ0FBZSxDQUFmLEVBQWtCLENBQWxCLENBQVY7QUFDQSxHQTNjMkM7O0FBNmM1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDYixFQUFBQSxRQXBkNEMsb0JBb2RuQ2MsR0FwZG1DLEVBb2Q5Qi9HLEdBcGQ4QixFQW9kekI7QUFDbEIsUUFBSSxPQUFPK0csR0FBUCxLQUFlLFFBQW5CLEVBQTZCO0FBQzVCLGFBQU8sRUFBUDtBQUNBOztBQUNELFFBQUlBLEdBQUcsQ0FBQ25GLE1BQUosSUFBYzVCLEdBQWxCLEVBQXVCO0FBQ3RCLGFBQU8rRyxHQUFQO0FBQ0E7O0FBQ0QscUJBQVVBLEdBQUcsQ0FBQ0QsU0FBSixDQUFjLENBQWQsRUFBaUI5RyxHQUFqQixDQUFWO0FBQ0EsR0E1ZDJDOztBQThkNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NpRCxFQUFBQSxVQXBlNEMsc0JBb2VqQytELEtBcGVpQyxFQW9lMUI7QUFDakIsUUFBSUEsS0FBSyxLQUFLLElBQVYsSUFBa0IsT0FBT0EsS0FBUCxLQUFpQixXQUF2QyxFQUFvRDtBQUNuRCxhQUFPLEVBQVA7QUFDQTs7QUFDRCxXQUFPZCxNQUFNLENBQUNjLEtBQUQsQ0FBTixDQUNMdkYsT0FESyxDQUNHLElBREgsRUFDUyxPQURULEVBRUxBLE9BRkssQ0FFRyxJQUZILEVBRVMsTUFGVCxFQUdMQSxPQUhLLENBR0csSUFISCxFQUdTLE1BSFQsRUFJTEEsT0FKSyxDQUlHLElBSkgsRUFJUyxRQUpULEVBS0xBLE9BTEssQ0FLRyxJQUxILEVBS1MsT0FMVCxDQUFQO0FBTUEsR0E5ZTJDOztBQWdmNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNDdEIsRUFBQUEsWUFyZjRDLHdCQXFmL0I4RyxNQXJmK0IsRUFxZnZCO0FBQ3BCbkosSUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0U4SSxXQURGLENBQ2MsTUFEZCxFQUVFQSxXQUZGLENBRWMsUUFGZCxFQUdFQSxXQUhGLENBR2MsT0FIZCxFQUlFQSxXQUpGLENBSWMsS0FKZDs7QUFNQSxZQUFRRCxNQUFSO0FBQ0MsV0FBSyxXQUFMO0FBQ0NuSixRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStJLFFBREYsQ0FDVyxPQURYLEVBRUVuRSxJQUZGLENBRU9GLGVBQWUsQ0FBQ3NFLGlCQUZ2QjtBQUdBOztBQUNELFdBQUssY0FBTDtBQUNDdEosUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0UrSSxRQURGLENBQ1csTUFEWCxFQUVFbkUsSUFGRixDQUVPRixlQUFlLENBQUN1RSxvQkFGdkI7QUFHQTs7QUFDRCxXQUFLLG9CQUFMO0FBQ0N2SixRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStJLFFBREYsQ0FDVyxRQURYLEVBRUVuRSxJQUZGLGlEQUU4Q0YsZUFBZSxDQUFDd0UsMEJBRjlEO0FBR0E7O0FBQ0QsV0FBSyxvQkFBTDtBQUNDeEosUUFBQUEsb0NBQW9DLENBQUNNLGFBQXJDLENBQ0UrSSxRQURGLENBQ1csUUFEWCxFQUVFbkUsSUFGRixpREFFOENGLGVBQWUsQ0FBQ3lFLHNCQUY5RDtBQUdBOztBQUNELFdBQUsscUJBQUw7QUFDQ3pKLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFK0ksUUFERixDQUNXLFFBRFgsRUFFRW5FLElBRkYsaURBRThDRixlQUFlLENBQUMwRSwyQkFGOUQ7QUFHQTs7QUFDRCxXQUFLLGlCQUFMO0FBQ0MxSixRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStJLFFBREYsQ0FDVyxLQURYLEVBRUVuRSxJQUZGLGlEQUU4Q0YsZUFBZSxDQUFDMkUsdUJBRjlEO0FBR0E7O0FBQ0QsV0FBSyxVQUFMO0FBQ0MzSixRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStJLFFBREYsQ0FDVyxNQURYLEVBRUVuRSxJQUZGLGlEQUU4Q0YsZUFBZSxDQUFDNEUsb0JBRjlEO0FBR0E7O0FBQ0Q7QUFDQzVKLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFK0ksUUFERixDQUNXLEtBRFgsRUFFRW5FLElBRkYsQ0FFT0YsZUFBZSxDQUFDMkUsdUJBRnZCO0FBR0E7QUF4Q0Y7QUEwQ0E7QUF0aUIyQyxDQUE3QyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaWtvUEJYIC0gZnJlZSBwaG9uZSBzeXN0ZW0gZm9yIHNtYWxsIGJ1c2luZXNzXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTctMjAyMSBBbGV4ZXkgUG9ydG5vdiBhbmQgTmlrb2xheSBCZWtldG92XG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAqIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gKiB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uOyBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICogKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAqIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gKiBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFsb25nIHdpdGggdGhpcyBwcm9ncmFtLlxuICogSWYgbm90LCBzZWUgPGh0dHBzOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiAqL1xuXG4vKiBnbG9iYWwgZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChICsg0YDQtdC90LTQtdGAINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyINGB0LXRgNCy0LjRgdC+0LIuXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNzdGF0dXMnKSxcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxuXHQkZGVidWdJbmZvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSBzcGFuI2RlYnVnLWluZm8nKSxcblx0JHNlcnZpY2VzU3RhdHVzOiAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cycpLFxuXHR0aW1lT3V0OiAzMDAwLFxuXHR0aW1lT3V0SGFuZGxlOiAnJyxcblx0ZXJyb3JDb3VudHM6IDAsXG5cdGxhc3RSZW5kZXJIYXNoOiAnJyxcblxuXHQvKipcblx0ICog0JzQsNC/0L/QuNC90LMgc3RhdGUgLT4gQ1NTLdC60LvQsNGB0YEg0LvQsNC80L/QvtGH0LrQuC5cblx0ICog0JvRjtCx0L7QtSDQvdC10LjQt9Cy0LXRgdGC0L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAtPiDQttGR0LvRgtC+0LUgKHdhcm4pLlxuXHQgKi9cblx0c3RhdGVMZWRDbGFzczoge1xuXHRcdG9rOiAnb2snLFxuXHRcdGF1dGhlbnRpY2F0ZWQ6ICdvaycsXG5cdFx0ZXJyb3I6ICdlcnJvcicsXG5cdFx0ZmFpbDogJ2Vycm9yJyxcblx0XHRmYWlsZWQ6ICdlcnJvcicsXG5cdFx0ZG93bjogJ2Vycm9yJyxcblx0XHRzdG9wcGVkOiAnZXJyb3InLFxuXHRcdHVua25vd246ICd1bmtub3duJyxcblx0XHRwZW5kaW5nOiAnd2FybicsXG5cdFx0c3RhcnRpbmc6ICd3YXJuJyxcblx0XHRxcmNvZGU6ICd3YXJuJyxcblx0XHRyZWF1dGg6ICd3YXJuJyxcblx0XHRhdXRoOiAnd2FybicsXG5cdFx0YXV0aF9yZXF1aXJlZDogJ3dhcm4nLFxuXHRcdHdhcm46ICd3YXJuJyxcblx0XHR3YXJuaW5nOiAnd2FybicsXG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0LXRgNCy0LjRgdGLLCDQutC+0YLQvtGA0YvQtSDQvNC+0LPRg9GCINC40LTRgtC4INCyINC90LXRgdC60L7Qu9GM0LrQuNGFINC40L3RgdGC0LDQvdGB0LDRhSDRgSDRgNCw0LfQvdGL0LwgYXJlYS5cblx0ICovXG5cdG11bHRpSW5zdGFuY2VTZXJ2aWNlczoge1xuXHRcdGNoYXRzOiB0cnVlLFxuXHRcdHRnOiB0cnVlLFxuXHRcdG1heDogdHJ1ZSxcblx0fSxcblxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cblx0cmVzdGFydFdvcmtlcigpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ1VwZGF0aW5nJyk7XG5cdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcigpO1xuXHR9LFxuXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIChyZXNwb25zZS5kYXRhKSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZW5kZXIgc2VydmljZXMgc3RhdHVzIHBhbmVsIGZvciBib3RoIHN1Y2Nlc3MgYW5kIHBhcnRpYWwgcmVzcG9uc2VzLlxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlc1N0YXR1cyhyZXNwb25zZS5kYXRhKTtcblxuXHRcdFx0XHRcdC8vIERlYnVnIEpTT04gcGFuZSAobGVnYWN5IGRlYnVnIHRhYikuXG5cdFx0XHRcdFx0bGV0IHZpc3VhbEVycm9yU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuZGF0YSwgbnVsbCwgMik7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHZpc3VhbEVycm9yU3RyaW5nID0gdmlzdWFsRXJyb3JTdHJpbmcucmVwbGFjZSgvXFxuL2csICc8YnIvPicpO1xuXHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4gJHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXR1c2VzID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEgJiYgQXJyYXkuaXNBcnJheShyZXNwb25zZS5kYXRhLnN0YXR1c2VzKSlcblx0XHRcdFx0XHRcdD8gcmVzcG9uc2UuZGF0YS5zdGF0dXNlcyA6IG51bGw7XG5cdFx0XHRcdFx0aWYgKCFzdGF0dXNlcykge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENsYXNzaWZ5IHRoZSByZXNwb25zZSBieSB0aGUgd29yc3Qgbm9uLXN5c3RlbSBzdGF0ZS5cblx0XHRcdFx0XHQvLyBjcm0tMWMgaXMgc3BlY2lhbDogaXQncyB0aGUgMUMgYnJpZGdlIOKAlCBpdHMgb3duIGVycm9yIGxhYmVsLlxuXHRcdFx0XHRcdGxldCBjcm0xYyA9IG51bGw7XG5cdFx0XHRcdFx0bGV0IGhhc0Vycm9yID0gZmFsc2U7XG5cdFx0XHRcdFx0bGV0IGhhc1N0YXJ0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RhdHVzZXMuZm9yRWFjaCgocykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzIHx8IHR5cGVvZiBzLm5hbWUgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAocy5uYW1lID09PSAnY3JtLTFjJykgY3JtMWMgPSBzLnN0YXRlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdlcnJvcicgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWwnIHx8IHMuc3RhdGUgPT09ICdmYWlsZWQnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICdkb3duJyB8fCBzLnN0YXRlID09PSAnc3RvcHBlZCcpIGhhc0Vycm9yID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGlmIChzLnN0YXRlID09PSAnc3RhcnRpbmcnIHx8IHMuc3RhdGUgPT09ICdwZW5kaW5nJ1xuXHRcdFx0XHRcdFx0XHR8fCBzLnN0YXRlID09PSAndW5rbm93bicpIGhhc1N0YXJ0aW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoY3JtMWMgJiYgY3JtMWMgIT09ICdvaycpIHtcblx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHdlYlNlcnZpY2VUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ0Vycm9yJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXQnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1N0YXJ0aW5nKSB7XG5cdFx0XHRcdFx0XHQvLyBTdGlsbCBzdGFydGluZzogc2hvdyBwcm9ncmVzcyB1bnRpbCB3ZSBnaXZlIHVwIGFmdGVyIDEwXG5cdFx0XHRcdFx0XHQvLyBmYWlsZWQgcG9sbHMsIHRoZW4gdHJlYXQgdGhlIHN0dWNrIGRhZW1vbiBhcyBhbiBlcnJvclxuXHRcdFx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBmYWxzZWx5IHJlcG9ydGluZyBpdCBhcyBDb25uZWN0ZWQuXG5cdFx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzIDwgMTApIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc0Vycm9yKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGVkJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyRGlzYWJsZWRQYW5lbCgpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCAkcGFuZWwgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke21vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lc2NhcGVIdG1sKGxhYmVsKX08L2Rpdj5gKTtcblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINGC0LDQsdC70LjRhtGLINGB0YLQsNGC0YPRgdC+0LI6IMKr0LjQvdC00LjQutCw0YLQvtGAICsg0YHQtdGA0LLQuNGBL9C60LDQvdCw0LsgKyDRgNCw0YHQv9C+0LvQvtC20LXQvdC40LUgK1xuXHQgKiDQsNC/0YLQsNC50LwgKyDQstC10YDRgdC40Y/Cuy4g0JrQvtC70L7QvdC60LAgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCuyDQv9C+0Y/QstC70Y/QtdGC0YHRjyDRgtC+0LvRjNC60L4g0LXRgdC70Lgg0YXQvtGC0Y8g0LHRi1xuXHQgKiDQvtC00LjQvSDRgdC10YDQstC40YEg0LLRi9C90LXRgdC10L0g0L3QsCBWUFMg4oCUINC90LAg0L7QsdGL0YfQvdC+0Lkg0LvQvtC60LDQu9GM0L3QvtC5INGD0YHRgtCw0L3QvtCy0LrQtSDRgtCw0LHQu9C40YbQsFxuXHQgKiDQvtGB0YLQsNGR0YLRgdGPINC60L7QvNC/0LDQutGC0L3QvtC5LlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZGF0YSDQntGC0LLQtdGCIEFQSSAocmVzcG9uc2UuZGF0YSkuXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlc1N0YXR1cyhkYXRhKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3Qgc2hvd1BsYWNlaG9sZGVyID0gKHRleHQpID0+IHtcblx0XHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcblx0XHRcdCRyb3dzLmVtcHR5KCk7XG5cdFx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmh0bWwoYDxzcGFuPiZuYnNwOyR7ZXNjKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke2VzYyh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXG5cdFx0Ly8g0JHRjdC6INC80L7QttC10YIg0LLQtdGA0L3Rg9GC0Ywg0YHRgtGA0L7QutGDICdNb2R1bGUgZGlzYWJsZWQnINCy0LzQtdGB0YLQviDQvNCw0YHRgdC40LLQsC5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdHVzZXMpKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gKHR5cGVvZiBzdGF0dXNlcyA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdD8gc3RhdHVzZXNcblx0XHRcdFx0OiBzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c1VuYXZhaWxhYmxlJywgJ1N0YXR1cyB1bmF2YWlsYWJsZScpO1xuXHRcdFx0c2hvd1BsYWNlaG9sZGVyKHRleHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCf0YDQvtC/0YPRgdC60LDQtdC8INC/0LXRgNC10YDQuNGB0L7QstC60YMgRE9NLCDQtdGB0LvQuCDQtNCw0L3QvdGL0LUg0L3QtSDQuNC30LzQtdC90LjQu9C40YHRjCDigJQg0YPQsdC40YDQsNC10YJcblx0XHQvLyDQvNC10YDRhtCw0L3QuNC1INGC0LDQsdC70LjRhtGLINC/0YDQuCDQvtC/0YDQvtGB0LUg0YDQsNC3INCyIDMg0YHQtdC60YPQvdC00YsuXG5cdFx0Y29uc3QgaGFzaCA9IEpTT04uc3RyaW5naWZ5KHN0YXR1c2VzKTtcblx0XHRpZiAoaGFzaCA9PT0gc2VsZi5sYXN0UmVuZGVySGFzaCAmJiAkcm93cy5jaGlsZHJlbigpLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQkcGxhY2Vob2xkZXIuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCT0YDRg9C/0L/QuNGA0YPQtdC8INC/0L4g0LjQvNC10L3QuCDRgdC10YDQstC40YHQsC4g0JLQvdGD0YLRgNC4INCz0YDRg9C/0L/RiyDigJQg0YHRgtGA0L7QutC4INC/0L4gYXJlYSAo0LrQsNC90LDQu9GLKS5cblx0XHRjb25zdCBncm91cHMgPSB7fTtcblx0XHRjb25zdCBvcmRlciA9IFtdO1xuXHRcdHN0YXR1c2VzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0aWYgKCFzdmMgfHwgdHlwZW9mIHN2YyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmFtZSA9ICh0eXBlb2Ygc3ZjLm5hbWUgPT09ICdzdHJpbmcnICYmIHN2Yy5uYW1lLmxlbmd0aCA+IDApID8gc3ZjLm5hbWUgOiAndW5rbm93bic7XG5cdFx0XHRpZiAoIWdyb3Vwc1tuYW1lXSkge1xuXHRcdFx0XHRncm91cHNbbmFtZV0gPSBbXTtcblx0XHRcdFx0b3JkZXIucHVzaChuYW1lKTtcblx0XHRcdH1cblx0XHRcdGdyb3Vwc1tuYW1lXS5wdXNoKHN2Yyk7XG5cdFx0fSk7XG5cblx0XHRpZiAob3JkZXIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRzaG93UGxhY2Vob2xkZXIoc2VsZi50cignbW9kX2N0aV9TdGF0dXNFbXB0eScsICdObyBzZXJ2aWNlcyByZXBvcnRlZCcpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQmtC+0LvQvtC90LrQsCDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7IOKAlCDRgtC+0LvRjNC60L4g0LrQvtCz0LTQsCDQtdGB0YLRjCDRhdC+0YLRjCDQvtC00LjQvSDRg9C00LDQu9GR0L3QvdGL0Lkg0YHQtdGA0LLQuNGBLlxuXHRcdGNvbnN0IGhhc1JlbW90ZSA9IHN0YXR1c2VzLnNvbWUoKHMpID0+IHMgJiYgcy5sb2NhdGlvbiA9PT0gJ3JlbW90ZScpO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBoZWFkID0gJzx0aGVhZD48dHI+J1xuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC1zdGF0dXNcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFN0YXR1cycsICdTdGF0dXMnKSl9PC90aD5gXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLW5hbWVcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFNlcnZpY2UnLCAnU2VydmljZScpKX08L3RoPmBcblx0XHRcdCsgKGhhc1JlbW90ZSA/IGA8dGggY2xhc3M9XCJjdGktY29sLWxvY1wiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sTG9jYXRpb24nLCAnTG9jYXRpb24nKSl9PC90aD5gIDogJycpXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXVwdGltZVwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sVXB0aW1lJywgJ1VwdGltZScpKX08L3RoPmBcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdmVyc2lvblwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sVmVyc2lvbicsICdWZXJzaW9uJykpfTwvdGg+YFxuXHRcdFx0KyAnPC90cj48L3RoZWFkPic7XG5cblx0XHRjb25zdCBib2R5ID0gW107XG5cdFx0b3JkZXIuZm9yRWFjaCgobmFtZSkgPT4ge1xuXHRcdFx0Y29uc3Qgcm93cyA9IGdyb3Vwc1tuYW1lXTtcblx0XHRcdGNvbnN0IGlzTXVsdGkgPSBzZWxmLm11bHRpSW5zdGFuY2VTZXJ2aWNlc1tuYW1lXSA9PT0gdHJ1ZSB8fCByb3dzLmxlbmd0aCA+IDE7XG5cdFx0XHRpZiAoaXNNdWx0aSkge1xuXHRcdFx0XHRib2R5LnB1c2goYDx0ciBjbGFzcz1cImN0aS1zdmMtZ3JvdXBcIj48dGQgY29sc3Bhbj1cIiR7Y29sQ291bnR9XCI+YFxuXHRcdFx0XHRcdCsgYDxpIGNsYXNzPVwiY29tbWVudHMgaWNvblwiPjwvaT4ke2VzYyhzZWxmLnNlcnZpY2VMYWJlbChuYW1lKSl9YFxuXHRcdFx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1jb3VudFwiPiR7cm93cy5sZW5ndGh9PC9zcGFuPjwvdGQ+PC90cj5gKTtcblx0XHRcdFx0cm93cy5mb3JFYWNoKChzdmMpID0+IHtcblx0XHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHN2YywgdHJ1ZSwgaGFzUmVtb3RlKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ym9keS5wdXNoKHNlbGYucmVuZGVyU2VydmljZVJvdyhyb3dzWzBdLCBmYWxzZSwgaGFzUmVtb3RlKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQkcm93cy5odG1sKCc8dGFibGUgY2xhc3M9XCJ1aSBjZWxsZWQgc3RyaXBlZCBjb21wYWN0IHVuc3RhY2thYmxlIHRhYmxlIGN0aS1zdGF0dXMtdGFibGVcIj4nXG5cdFx0XHQrIGhlYWQgKyAnPHRib2R5PicgKyBib2R5LmpvaW4oJycpICsgJzwvdGJvZHk+PC90YWJsZT4nKTtcblx0XHRzZWxmLmxhc3RSZW5kZXJIYXNoID0gaGFzaDtcblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YLQsNCx0LvQuNGG0YsgKNGB0LXRgNCy0LjRgSDQuNC70Lgg0LrQsNC90LDQuykuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBzdmMg0LfQsNC/0LjRgdGMINC40Lcgc3RhdHVzZXNbXVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGdyb3VwZWQg0YHRgtGA0L7QutCwINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKNC60LDQvdCw0Lsg0LzQtdGB0YHQtdC90LTQttC10YDQsClcblx0ICogQHBhcmFtIHtib29sZWFufSBoYXNSZW1vdGUg0L/QvtC60LDQt9GL0LLQsNGC0Ywg0LvQuCDQutC+0LvQvtC90LrRgyDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUwgKNC+0LTQvdCwIDx0cj4sINC/0LvRjtGBIDx0cj4g0YEg0L7RiNC40LHQutC+0Lkg0L/RgNC4INC90LDQu9C40YfQuNC4KVxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQsIGhhc1JlbW90ZSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUoc3RhdGVSYXcpO1xuXHRcdGNvbnN0IGxlZENsYXNzID0gc2VsZi5zdGF0ZUxlZENsYXNzW2Nhbm9uXSB8fCAnd2Fybic7XG5cdFx0Y29uc3Qgc3RhdGVUZXh0ID0gc2VsZi5zdGF0ZVRleHQoc3RhdGVSYXcpO1xuXG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IHNlbGYuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBzZWxmLnNlcnZpY2VMYWJlbChzdmMubmFtZSk7XG5cdFx0Y29uc3QgbmFtZUljb24gPSBncm91cGVkID8gJzxpIGNsYXNzPVwiaGFzaHRhZyBpY29uXCI+PC9pPicgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblx0XHRjb25zdCBkYXNoID0gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xuXG5cdFx0Y29uc3Qgc3RhdHVzQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbGVkICR7ZXNjKGxlZENsYXNzKX1cIiB0aXRsZT1cIiR7ZXNjKHN0YXRlUmF3KX1cIj48L3NwYW4+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLXN0YXRlXCI+JHtlc2Moc3RhdGVUZXh0KX08L3NwYW4+YDtcblxuXHRcdGNvbnN0IG5hbWVDZWxsID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1uYW1lJHtncm91cGVkID8gJyBjdGktc3ZjLWNoYW5uZWwnIDogJyd9XCI+JHtuYW1lSWNvbn0ke2VzYyhkaXNwbGF5TmFtZSl9PC9zcGFuPmA7XG5cblx0XHRjb25zdCBsb2NDZWxsID0gaGFzUmVtb3RlID8gYDx0ZCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtzZWxmLmxvY2F0aW9uQmFkZ2Uoc3ZjLmxvY2F0aW9uKX08L3RkPmAgOiAnJztcblxuXHRcdGNvbnN0IGNlbGxzID0gYDx0ZCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtzdGF0dXNDZWxsfTwvdGQ+YFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1uYW1lXCI+JHtuYW1lQ2VsbH08L3RkPmBcblx0XHRcdCsgbG9jQ2VsbFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke3VwdGltZSAhPT0gJycgPyBlc2ModXB0aW1lKSA6IGRhc2h9PC90ZD5gXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLXZlcnNpb25cIj4ke3ZlcnNpb24gIT09ICcnID8gZXNjKHZlcnNpb24pIDogZGFzaH08L3RkPmA7XG5cblx0XHRsZXQgaHRtbCA9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLXJvdyR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1zdWJyb3cnIDogJyd9XCJgXG5cdFx0XHQrIGAgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPiR7Y2VsbHN9PC90cj5gO1xuXG5cdFx0aWYgKGxhc3RFcnJvciAhPT0gJycpIHtcblx0XHRcdGh0bWwgKz0gYDx0ciBjbGFzcz1cImN0aS1zdmMtZXJyb3Itcm93XCI+PHRkIGNvbHNwYW49XCIke2NvbENvdW50fVwiPmBcblx0XHRcdFx0KyBgPGkgY2xhc3M9XCJleGNsYW1hdGlvbiB0cmlhbmdsZSBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgPHNwYW4gdGl0bGU9XCIke2VzYyhsYXN0RXJyb3IpfVwiPiR7ZXNjKHNlbGYudHJ1bmNhdGUobGFzdEVycm9yLCAyMDApKX08L3NwYW4+YFxuXHRcdFx0XHQrICc8L3RkPjwvdHI+Jztcblx0XHR9XG5cblx0XHRyZXR1cm4gaHRtbDtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC50LTQtiDRgNCw0YHQv9C+0LvQvtC20LXQvdC40Y8g0YHQtdGA0LLQuNGB0LA6INGP0YDQutC40LkgwqtWUFPCuyDQtNC70Y8g0LLRi9C90LXRgdC10L3QvdGL0YUg0LrQsNC90LDQu9C+0LIg0Lhcblx0ICog0L/RgNC40LPQu9GD0YjRkdC90L3Ri9C5IMKr0JvQvtC60LDQu9GM0L3QvsK7INC00LvRjyDQstGB0LXQs9C+INC+0YHRgtCw0LvRjNC90L7Qs9C+LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbG9jYXRpb24gJ3JlbW90ZScgfCAnbG9jYWwnIHwgdW5kZWZpbmVkXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUxcblx0ICovXG5cdGxvY2F0aW9uQmFkZ2UobG9jYXRpb24pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRpZiAobG9jYXRpb24gPT09ICdyZW1vdGUnKSB7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwidWkgdGVhbCBsYWJlbCBjdGktbG9jLWJhZGdlXCI+PGkgY2xhc3M9XCJjbG91ZCBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvblJlbW90ZScsICdWUFMnKSl9PC9zcGFuPmA7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ2xvY2FsJykge1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cImN0aS1sb2MtbG9jYWxcIj48aSBjbGFzcz1cImhvbWUgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYCR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfTG9jYXRpb25Mb2NhbCcsICdMb2NhbCcpKX08L3NwYW4+YDtcblx0XHR9XG5cdFx0cmV0dXJuICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+Jztcblx0fSxcblxuXHQvKipcblx0ICog0JrQsNC90L7QvdC40LfQsNGG0LjRjyDRgdCy0L7QsdC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0L7RgdGC0L7Rj9C90LjRjyDQsiDQuNC30LLQtdGB0YLQvdGL0Lkg0LrQu9GO0Ycg0LTQu9GPINC70LDQvNC/0L7Rh9C60Lgg0Lhcblx0ICog0L/QtdGA0LXQstC+0LTQsC4gbW9uaXRvcmQg0LzQvtC20LXRgiDQv9GA0LjRgdGL0LvQsNGC0Ywgwqthd2FpdGluZyBhdXRob3JpemF0aW9uIGNvZGXCuyDQuCDQv9GALlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGNhbm9uU3RhdGUoc3RhdGUpIHtcblx0XHRjb25zdCBzID0gU3RyaW5nKHN0YXRlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChzID09PSAnJykge1xuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZigncXInKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAncXJjb2RlJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZignYXdhaXRpbmcnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCdyZWF1dGgnKSAhPT0gLTFcblx0XHRcdHx8IHMuaW5kZXhPZignYXV0aF9yZXF1aXJlZCcpICE9PSAtMSB8fCBzLmluZGV4T2YoJzJmYScpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdyZWF1dGgnO1xuXHRcdH1cblx0XHRpZiAocyA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dGhlbnRpY2F0ZWQnO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fSxcblxuXHQvKipcblx0ICog0KXQtdC70L/QtdGAINC/0LXRgNC10LLQvtC00LAg0YEg0YTQvtC70LHRjdC60L7QvC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGtleSDQutC70Y7RhyBnbG9iYWxUcmFuc2xhdGVcblx0ICogQHBhcmFtIHtzdHJpbmd9IGZhbGxiYWNrINC30L3QsNGH0LXQvdC40LUg0L/QviDRg9C80L7Qu9GH0LDQvdC40Y5cblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRyKGtleSwgZmFsbGJhY2spIHtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUg0LrQsNC90LDQu9CwL9GB0LXRgNCy0LjRgdCwICjQvdCw0L/RgNC40LzQtdGAIMKr0J/QvtC00LrQu9GO0YfRkdC9wrssXG5cdCAqIMKr0KLRgNC10LHRg9C10YIg0LDQstGC0L7RgNC40LfQsNGG0LjQuMK7KS4g0KHQvdCw0YfQsNC70LAg0LjRidC10Lwg0YLQvtGH0L3Ri9C5INC60LvRjtGHLCDQt9Cw0YLQtdC8INC/0L4g0LrQsNC90L7QvdC40YfQtdGB0LrQvtC80YNcblx0ICog0YHQvtGB0YLQvtGP0L3QuNGOLCDQt9Cw0YLQtdC8IOKAlCDQsNC90LPQu9C40LnRgdC60LjQuSDRhNC+0LvQsdGN0LosINC4INCyINC60YDQsNC50L3QtdC8INGB0LvRg9GH0LDQtSDQuNGB0YXQvtC00L3Rg9GOINGB0YLRgNC+0LrRgy5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0ZVRleHQoc3RhdGUpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IHJhdyA9IFN0cmluZyhzdGF0ZSB8fCAnJyk7XG5cdFx0Ly8g0KLQvtGH0L3Ri9C5INC60LvRjtGHINC/0L7QtCDQuNGB0YXQvtC00L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAo0L3QsCDRgdC70YPRh9Cw0Lkg0YHQv9C10YbQuNGE0LjRh9C90YvRhSDQv9C10YDQtdCy0L7QtNC+0LIpLlxuXHRcdGNvbnN0IGV4YWN0S2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtyYXd9YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2V4YWN0S2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtleGFjdEtleV07XG5cdFx0fVxuXHRcdGNvbnN0IGNhbm9uID0gc2VsZi5jYW5vblN0YXRlKHJhdyk7XG5cdFx0Y29uc3QgY2Fub25LZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke2Nhbm9ufWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbY2Fub25LZXldO1xuXHRcdH1cblx0XHRjb25zdCBmYWxsYmFjayA9IHtcblx0XHRcdG9rOiAnT0snLFxuXHRcdFx0YXV0aGVudGljYXRlZDogJ0F1dGhlbnRpY2F0ZWQnLFxuXHRcdFx0ZXJyb3I6ICdFcnJvcicsXG5cdFx0XHR1bmtub3duOiAnVW5rbm93bicsXG5cdFx0XHRwZW5kaW5nOiAnUGVuZGluZycsXG5cdFx0XHRzdGFydGluZzogJ1N0YXJ0aW5nJyxcblx0XHRcdHFyY29kZTogJ0F3YWl0aW5nIFFSLWNvZGUgYXV0aG9yaXphdGlvbicsXG5cdFx0XHRyZWF1dGg6ICdBdXRob3JpemF0aW9uIHJlcXVpcmVkJyxcblx0XHR9O1xuXHRcdHJldHVybiBmYWxsYmFja1tjYW5vbl0gfHwgcmF3O1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQmtC+0YDQvtGC0LrQvtC1INC/0YDQtdC00YHRgtCw0LLQu9C10L3QuNC1IGFyZWEtR1VJRCDigJQg0L/QtdGA0LLRi9C1IDgg0YHQuNC80LLQvtC70L7Qsi5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGFyZWFcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHNob3J0QXJlYShhcmVhKSB7XG5cdFx0aWYgKHR5cGVvZiBhcmVhICE9PSAnc3RyaW5nJyB8fCBhcmVhLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAoYXJlYS5sZW5ndGggPD0gMTIpIHtcblx0XHRcdHJldHVybiBhcmVhO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7YXJlYS5zdWJzdHJpbmcoMCwgOCl94oCmYDtcblx0fSxcblxuXHQvKipcblx0ICog0KPRgdC10YfQtdC90LjQtSDRgdGC0YDQvtC60LguXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdHJcblx0ICogQHBhcmFtIHtudW1iZXJ9IG1heFxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0dHJ1bmNhdGUoc3RyLCBtYXgpIHtcblx0XHRpZiAodHlwZW9mIHN0ciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKHN0ci5sZW5ndGggPD0gbWF4KSB7XG5cdFx0XHRyZXR1cm4gc3RyO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7c3RyLnN1YnN0cmluZygwLCBtYXgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCR0LXQt9C+0L/QsNGB0L3Ri9C5INGN0LrRgNCw0L3QtdGAIEhUTUwuXG5cdCAqXG5cdCAqIEBwYXJhbSB7Kn0gdmFsdWVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGVzY2FwZUh0bWwodmFsdWUpIHtcblx0XHRpZiAodmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gU3RyaW5nKHZhbHVlKVxuXHRcdFx0LnJlcGxhY2UoLyYvZywgJyZhbXA7Jylcblx0XHRcdC5yZXBsYWNlKC88L2csICcmbHQ7Jylcblx0XHRcdC5yZXBsYWNlKC8+L2csICcmZ3Q7Jylcblx0XHRcdC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jylcblx0XHRcdC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQntCx0L3QvtCy0LvQtdC90LjQtSDRgdGC0LDRgtGD0YHQsCDQvNC+0LTRg9C70Y8gKNCx0LXQudC00LYg0LIg0L/RgNCw0LLQvtC8INCy0LXRgNGF0L3QtdC8INGD0LPQu9GDKS5cblx0ICpcblx0ICogQHBhcmFtIHN0YXR1c1xuXHQgKi9cblx0Y2hhbmdlU3RhdHVzKHN0YXR1cykge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZXknKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCdncmVlbicpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3JlZCcpO1xuXG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgJ0Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmVlbicpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JleScpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfRGlzY29ubmVjdGVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uUHJvZ3Jlc3MnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzc31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ1dhaXQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25XYWl0fWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygneWVsbG93Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3J9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3JlZCcpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3J9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnVXBkYXRpbmcnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JleScpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9VcGRhdGVTdGF0dXN9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3JlZCcpXG5cdFx0XHRcdFx0Lmh0bWwoZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9LFxufTtcbiJdfQ==