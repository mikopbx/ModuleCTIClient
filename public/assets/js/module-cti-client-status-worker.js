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
    var html = "<tr class=\"cti-svc-row".concat(grouped ? ' cti-svc-subrow' : '', "\"") + " data-svc=\"".concat(esc(svc.name || ''), "\" data-area=\"").concat(esc(svc.area || ''), "\">").concat(cells, "</tr>"); // last_error from monitord is sticky ("last error ever seen") and is NOT
    // cleared on recovery — it stays in the API payload on purpose (handy for
    // debugging). But surface it to the operator ONLY while the service is
    // actually unhealthy, so a recovered glitch (state=ok) doesn't keep
    // reading as a current failure on the panel.

    if (lastError !== '' && ledClass !== 'ok') {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJyZWF1dGgiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJjcm0xYyIsImhhc0Vycm9yIiwiaGFzU3RhcnRpbmciLCJmb3JFYWNoIiwicyIsIm5hbWUiLCJzdGF0ZSIsInJlbmRlckRpc2FibGVkUGFuZWwiLCIkcGFuZWwiLCJsYWJlbCIsImdsb2JhbFRyYW5zbGF0ZSIsIm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQiLCJodG1sIiwiZXNjYXBlSHRtbCIsInNlbGYiLCJlc2MiLCIkcm93cyIsIiRwbGFjZWhvbGRlciIsInNob3dQbGFjZWhvbGRlciIsInRleHQiLCJlbXB0eSIsInNob3ciLCJ0ciIsImhhc2giLCJjaGlsZHJlbiIsImhpZGUiLCJncm91cHMiLCJvcmRlciIsInN2YyIsInB1c2giLCJoYXNSZW1vdGUiLCJzb21lIiwibG9jYXRpb24iLCJjb2xDb3VudCIsImhlYWQiLCJib2R5Iiwicm93cyIsImlzTXVsdGkiLCJzZXJ2aWNlTGFiZWwiLCJyZW5kZXJTZXJ2aWNlUm93Iiwiam9pbiIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImNhbm9uIiwiY2Fub25TdGF0ZSIsImxlZENsYXNzIiwic3RhdGVUZXh0IiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwibmFtZUljb24iLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsImRhc2giLCJzdGF0dXNDZWxsIiwibmFtZUNlbGwiLCJsb2NDZWxsIiwibG9jYXRpb25CYWRnZSIsImNlbGxzIiwidHJ1bmNhdGUiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImluZGV4T2YiLCJrZXkiLCJmYWxsYmFjayIsIm1hcCIsIm1vbml0b3JkIiwibmF0cyIsInByb3h5IiwicmF3IiwiZXhhY3RLZXkiLCJjYW5vbktleSIsInN1YnN0cmluZyIsInN0ciIsInZhbHVlIiwic3RhdHVzIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsIm1vZF9jdGlfQ29ubmVjdGVkIiwibW9kX2N0aV9EaXNjb25uZWN0ZWQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzcyIsIm1vZF9jdGlfQ29ubmVjdGlvbldhaXQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3IiLCJtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvciIsIm1vZF9jdGlfVXBkYXRlU3RhdHVzIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFNQSxvQ0FBb0MsR0FBRztBQUM1Q0MsRUFBQUEsUUFBUSxFQUFFQyxDQUFDLENBQUMseUJBQUQsQ0FEaUM7QUFFNUNDLEVBQUFBLGFBQWEsRUFBRUQsQ0FBQyxDQUFDLHVCQUFELENBRjRCO0FBRzVDRSxFQUFBQSxpQkFBaUIsRUFBRUYsQ0FBQyxDQUFDLDBCQUFELENBSHdCO0FBSTVDRyxFQUFBQSxZQUFZLEVBQUVILENBQUMsQ0FBQyxvQkFBRCxDQUo2QjtBQUs1Q0ksRUFBQUEsYUFBYSxFQUFFSixDQUFDLENBQUMsU0FBRCxDQUw0QjtBQU01Q0ssRUFBQUEsYUFBYSxFQUFFTCxDQUFDLENBQUMsZUFBRCxDQU40QjtBQU81Q00sRUFBQUEsVUFBVSxFQUFFTixDQUFDLENBQUMseUNBQUQsQ0FQK0I7QUFRNUNPLEVBQUFBLGVBQWUsRUFBRVAsQ0FBQyxDQUFDLHNCQUFELENBUjBCO0FBUzVDUSxFQUFBQSxPQUFPLEVBQUUsSUFUbUM7QUFVNUNDLEVBQUFBLGFBQWEsRUFBRSxFQVY2QjtBQVc1Q0MsRUFBQUEsV0FBVyxFQUFFLENBWCtCO0FBWTVDQyxFQUFBQSxjQUFjLEVBQUUsRUFaNEI7O0FBYzVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0NDLEVBQUFBLGFBQWEsRUFBRTtBQUNkQyxJQUFBQSxFQUFFLEVBQUUsSUFEVTtBQUVkQyxJQUFBQSxhQUFhLEVBQUUsSUFGRDtBQUdkQyxJQUFBQSxLQUFLLEVBQUUsT0FITztBQUlkQyxJQUFBQSxJQUFJLEVBQUUsT0FKUTtBQUtkQyxJQUFBQSxNQUFNLEVBQUUsT0FMTTtBQU1kQyxJ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QXJDLENBQ0UrSSxRQURGLENBQ1csS0FEWCxFQUVFbkUsSUFGRixDQUVPRixlQUFlLENBQUMyRSx1QkFGdkI7QUFHQTtBQXhDRjtBQTBDQTtBQTNpQjJDLENBQTdDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIE1pa29QQlggLSBmcmVlIHBob25lIHN5c3RlbSBmb3Igc21hbGwgYnVzaW5lc3NcbiAqIENvcHlyaWdodCAoQykgMjAxNy0yMDIxIEFsZXhleSBQb3J0bm92IGFuZCBOaWtvbGF5IEJla2V0b3ZcbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICogaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAqIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb247IGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gKiAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICogYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAqIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYWxvbmcgd2l0aCB0aGlzIHByb2dyYW0uXG4gKiBJZiBub3QsIHNlZSA8aHR0cHM6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuICovXG5cbi8qIGdsb2JhbCBnbG9iYWxUcmFuc2xhdGUsIEZvcm0sIENvbmZpZywgUGJ4QXBpICovXG5cbi8qKlxuICog0KLQtdGB0YLQuNGA0L7QstCw0L3QuNC1INGB0L7QtdC00LjQvdC10L3QuNGPINC80L7QtNGD0LvRjyDRgSAx0KEgKyDRgNC10L3QtNC10YAg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIg0YHQtdGA0LLQuNGB0L7Qsi5cbiAqL1xuY29uc3QgbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyID0ge1xuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCR3ZWJTZXJ2aWNlVG9nZ2xlOiAkKCcjd2ViLXNlcnZpY2UtbW9kZS10b2dnbGUnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI3N0YXR1cycpLFxuXHQkc3VibWl0QnV0dG9uOiAkKCcjc3VibWl0YnV0dG9uJyksXG5cdCRkZWJ1Z0luZm86ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIHNwYW4jZGVidWctaW5mbycpLFxuXHQkc2VydmljZXNTdGF0dXM6ICQoJyNjdGktc2VydmljZXMtc3RhdHVzJyksXG5cdHRpbWVPdXQ6IDMwMDAsXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxuXHRlcnJvckNvdW50czogMCxcblx0bGFzdFJlbmRlckhhc2g6ICcnLFxuXG5cdC8qKlxuXHQgKiDQnNCw0L/Qv9C40L3QsyBzdGF0ZSAtPiBDU1Mt0LrQu9Cw0YHRgSDQu9Cw0LzQv9C+0YfQutC4LlxuXHQgKiDQm9GO0LHQvtC1INC90LXQuNC30LLQtdGB0YLQvdC+0LUg0YHQvtGB0YLQvtGP0L3QuNC1IC0+INC20ZHQu9GC0L7QtSAod2FybikuXG5cdCAqL1xuXHRzdGF0ZUxlZENsYXNzOiB7XG5cdFx0b2s6ICdvaycsXG5cdFx0YXV0aGVudGljYXRlZDogJ29rJyxcblx0XHRlcnJvcjogJ2Vycm9yJyxcblx0XHRmYWlsOiAnZXJyb3InLFxuXHRcdGZhaWxlZDogJ2Vycm9yJyxcblx0XHRkb3duOiAnZXJyb3InLFxuXHRcdHN0b3BwZWQ6ICdlcnJvcicsXG5cdFx0dW5rbm93bjogJ3Vua25vd24nLFxuXHRcdHBlbmRpbmc6ICd3YXJuJyxcblx0XHRzdGFydGluZzogJ3dhcm4nLFxuXHRcdHFyY29kZTogJ3dhcm4nLFxuXHRcdHJlYXV0aDogJ3dhcm4nLFxuXHRcdGF1dGg6ICd3YXJuJyxcblx0XHRhdXRoX3JlcXVpcmVkOiAnd2FybicsXG5cdFx0d2FybjogJ3dhcm4nLFxuXHRcdHdhcm5pbmc6ICd3YXJuJyxcblx0fSxcblxuXHQvKipcblx0ICog0KHQtdGA0LLQuNGB0YssINC60L7RgtC+0YDRi9C1INC80L7Qs9GD0YIg0LjQtNGC0Lgg0LIg0L3QtdGB0LrQvtC70YzQutC40YUg0LjQvdGB0YLQsNC90YHQsNGFINGBINGA0LDQt9C90YvQvCBhcmVhLlxuXHQgKi9cblx0bXVsdGlJbnN0YW5jZVNlcnZpY2VzOiB7XG5cdFx0Y2hhdHM6IHRydWUsXG5cdFx0dGc6IHRydWUsXG5cdFx0bWF4OiB0cnVlLFxuXHR9LFxuXG5cdGluaXRpYWxpemUoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlc3RhcnRXb3JrZXIoKTtcblx0fSxcblxuXHRyZXN0YXJ0V29ya2VyKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcblx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlKTtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyKCk7XG5cdH0sXG5cblx0d29ya2VyKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkLmFwaSh7XG5cdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvY2hlY2tgLFxuXHRcdFx0XHRvbjogJ25vdycsXG5cdFx0XHRcdHN1Y2Nlc3NUZXN0OiBQYnhBcGkuc3VjY2Vzc1Rlc3QsXG5cdFx0XHRcdG9uQ29tcGxldGUoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dChcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIsXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblJlc3BvbnNlKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0JCgnLm1lc3NhZ2UuYWpheCcpLnJlbW92ZSgpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJlbmRlciBzZXJ2aWNlcyBzdGF0dXMgcGFuZWwgZm9yIGJvdGggc3VjY2VzcyBhbmQgcGFydGlhbCByZXNwb25zZXMuXG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlclNlcnZpY2VzU3RhdHVzKHJlc3BvbnNlLmRhdGEpO1xuXG5cdFx0XHRcdFx0Ly8gRGVidWcgSlNPTiBwYW5lIChsZWdhY3kgZGVidWcgdGFiKS5cblx0XHRcdFx0XHRsZXQgdmlzdWFsRXJyb3JTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXNwb25zZS5kYXRhLCBudWxsLCAyKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHZpc3VhbEVycm9yU3RyaW5nID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0dmlzdWFsRXJyb3JTdHJpbmcgPSB2aXN1YWxFcnJvclN0cmluZy5yZXBsYWNlKC9cXG4vZywgJzxici8+Jyk7XG5cdFx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UucmVzdWx0ID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiAke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRkZWJ1Z0luZm9cblx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cblx0XHRcdFx0XHRcdFx0XHRcdDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8cHJlIHN0eWxlPSd3aGl0ZS1zcGFjZTogcHJlLXdyYXAnPiR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblN1Y2Nlc3MoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGVkJyk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdFx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25GYWlsdXJlKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzICs9IDE7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzZXMgPSAocmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSAmJiBBcnJheS5pc0FycmF5KHJlc3BvbnNlLmRhdGEuc3RhdHVzZXMpKVxuXHRcdFx0XHRcdFx0PyByZXNwb25zZS5kYXRhLnN0YXR1c2VzIDogbnVsbDtcblx0XHRcdFx0XHRpZiAoIXN0YXR1c2VzKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ2xhc3NpZnkgdGhlIHJlc3BvbnNlIGJ5IHRoZSB3b3JzdCBub24tc3lzdGVtIHN0YXRlLlxuXHRcdFx0XHRcdC8vIGNybS0xYyBpcyBzcGVjaWFsOiBpdCdzIHRoZSAxQyBicmlkZ2Ug4oCUIGl0cyBvd24gZXJyb3IgbGFiZWwuXG5cdFx0XHRcdFx0bGV0IGNybTFjID0gbnVsbDtcblx0XHRcdFx0XHRsZXQgaGFzRXJyb3IgPSBmYWxzZTtcblx0XHRcdFx0XHRsZXQgaGFzU3RhcnRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRzdGF0dXNlcy5mb3JFYWNoKChzKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXMgfHwgdHlwZW9mIHMubmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChzLm5hbWUgPT09ICdjcm0tMWMnKSBjcm0xYyA9IHMuc3RhdGU7XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBzLnN0YXRlID09PSAnZmFpbCcgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWxlZCdcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ2Rvd24nIHx8IHMuc3RhdGUgPT09ICdzdG9wcGVkJykgaGFzRXJyb3IgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdzdGFydGluZycgfHwgcy5zdGF0ZSA9PT0gJ3BlbmRpbmcnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICd1bmtub3duJykgaGFzU3RhcnRpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChjcm0xYyAmJiBjcm0xYyAhPT0gJ29rJykge1xuXHRcdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kd2ViU2VydmljZVRvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDRXJyb3InKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25UbzFDV2FpdCcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFzU3RhcnRpbmcpIHtcblx0XHRcdFx0XHRcdC8vIFN0aWxsIHN0YXJ0aW5nOiBzaG93IHByb2dyZXNzIHVudGlsIHdlIGdpdmUgdXAgYWZ0ZXIgMTBcblx0XHRcdFx0XHRcdC8vIGZhaWxlZCBwb2xscywgdGhlbiB0cmVhdCB0aGUgc3R1Y2sgZGFlbW9uIGFzIGFuIGVycm9yXG5cdFx0XHRcdFx0XHQvLyBpbnN0ZWFkIG9mIGZhbHNlbHkgcmVwb3J0aW5nIGl0IGFzIENvbm5lY3RlZC5cblx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPCAxMCkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFzRXJyb3IpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJEaXNhYmxlZFBhbmVsKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC+0L7QsdGJ0LXQvdC40LUg0LIg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIsINC60L7Qs9C00LAg0LzQvtC00YPQu9GMINCy0YvQutC70Y7Rh9C10L0uXG5cdCAqL1xuXHRyZW5kZXJEaXNhYmxlZFBhbmVsKCkge1xuXHRcdGNvbnN0ICRwYW5lbCA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc2VydmljZXNTdGF0dXM7XG5cdFx0aWYgKCEkcGFuZWwgfHwgJHBhbmVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbCA9ICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0JiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQpXG5cdFx0XHQ/IGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkXG5cdFx0XHQ6ICdNb2R1bGUgaXMgZGlzYWJsZWQnO1xuXHRcdCRwYW5lbC5odG1sKGA8ZGl2IGNsYXNzPVwidWkgYmFzaWMgc2VnbWVudFwiPiR7bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVzY2FwZUh0bWwobGFiZWwpfTwvZGl2PmApO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0YLQsNCx0LvQuNGG0Ysg0YHRgtCw0YLRg9GB0L7QsjogwqvQuNC90LTQuNC60LDRgtC+0YAgKyDRgdC10YDQstC40YEv0LrQsNC90LDQuyArINGA0LDRgdC/0L7Qu9C+0LbQtdC90LjQtSArXG5cdCAqINCw0L/RgtCw0LnQvCArINCy0LXRgNGB0LjRj8K7LiDQmtC+0LvQvtC90LrQsCDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7INC/0L7Rj9Cy0LvRj9C10YLRgdGPINGC0L7Qu9GM0LrQviDQtdGB0LvQuCDRhdC+0YLRjyDQsdGLXG5cdCAqINC+0LTQuNC9INGB0LXRgNCy0LjRgSDQstGL0L3QtdGB0LXQvSDQvdCwIFZQUyDigJQg0L3QsCDQvtCx0YvRh9C90L7QuSDQu9C+0LrQsNC70YzQvdC+0Lkg0YPRgdGC0LDQvdC+0LLQutC1INGC0LDQsdC70LjRhtCwXG5cdCAqINC+0YHRgtCw0ZHRgtGB0Y8g0LrQvtC80L/QsNC60YLQvdC+0LkuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhINCe0YLQstC10YIgQVBJIChyZXNwb25zZS5kYXRhKS5cblx0ICovXG5cdHJlbmRlclNlcnZpY2VzU3RhdHVzKGRhdGEpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRwYW5lbCA9IHNlbGYuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlc2MgPSBzZWxmLmVzY2FwZUh0bWw7XG5cdFx0Y29uc3QgJHJvd3MgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzJyk7XG5cdFx0Y29uc3QgJHBsYWNlaG9sZGVyID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcGxhY2Vob2xkZXInKTtcblx0XHRjb25zdCBzaG93UGxhY2Vob2xkZXIgPSAodGV4dCkgPT4ge1xuXHRcdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9ICcnO1xuXHRcdFx0JHJvd3MuZW1wdHkoKTtcblx0XHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQkcGxhY2Vob2xkZXIuaHRtbChgPHNwYW4+Jm5ic3A7JHtlc2ModGV4dCl9PC9zcGFuPmApLnNob3coKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdCRwYW5lbC5odG1sKGA8ZGl2IGNsYXNzPVwidWkgYmFzaWMgc2VnbWVudFwiPiR7ZXNjKHRleHQpfTwvZGl2PmApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IChkYXRhICYmIGRhdGEuc3RhdHVzZXMpID8gZGF0YS5zdGF0dXNlcyA6IG51bGw7XG5cblx0XHQvLyDQkdGN0Log0LzQvtC20LXRgiDQstC10YDQvdGD0YLRjCDRgdGC0YDQvtC60YMgJ01vZHVsZSBkaXNhYmxlZCcg0LLQvNC10YHRgtC+INC80LDRgdGB0LjQstCwLlxuXHRcdGlmICghQXJyYXkuaXNBcnJheShzdGF0dXNlcykpIHtcblx0XHRcdGNvbnN0IHRleHQgPSAodHlwZW9mIHN0YXR1c2VzID09PSAnc3RyaW5nJylcblx0XHRcdFx0PyBzdGF0dXNlc1xuXHRcdFx0XHQ6IHNlbGYudHIoJ21vZF9jdGlfU3RhdHVzVW5hdmFpbGFibGUnLCAnU3RhdHVzIHVuYXZhaWxhYmxlJyk7XG5cdFx0XHRzaG93UGxhY2Vob2xkZXIodGV4dCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g0J/RgNC+0L/Rg9GB0LrQsNC10Lwg0L/QtdGA0LXRgNC40YHQvtCy0LrRgyBET00sINC10YHQu9C4INC00LDQvdC90YvQtSDQvdC1INC40LfQvNC10L3QuNC70LjRgdGMIOKAlCDRg9Cx0LjRgNCw0LXRglxuXHRcdC8vINC80LXRgNGG0LDQvdC40LUg0YLQsNCx0LvQuNGG0Ysg0L/RgNC4INC+0L/RgNC+0YHQtSDRgNCw0Lcg0LIgMyDRgdC10LrRg9C90LTRiy5cblx0XHRjb25zdCBoYXNoID0gSlNPTi5zdHJpbmdpZnkoc3RhdHVzZXMpO1xuXHRcdGlmIChoYXNoID09PSBzZWxmLmxhc3RSZW5kZXJIYXNoICYmICRyb3dzLmNoaWxkcmVuKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g0JPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhICjQutCw0L3QsNC70YspLlxuXHRcdGNvbnN0IGdyb3VwcyA9IHt9O1xuXHRcdGNvbnN0IG9yZGVyID0gW107XG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRpZiAoIXN2YyB8fCB0eXBlb2Ygc3ZjICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuYW1lID0gKHR5cGVvZiBzdmMubmFtZSA9PT0gJ3N0cmluZycgJiYgc3ZjLm5hbWUubGVuZ3RoID4gMCkgPyBzdmMubmFtZSA6ICd1bmtub3duJztcblx0XHRcdGlmICghZ3JvdXBzW25hbWVdKSB7XG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xuXHRcdFx0XHRvcmRlci5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcblx0XHR9KTtcblxuXHRcdGlmIChvcmRlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHNob3dQbGFjZWhvbGRlcihzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c0VtcHR5JywgJ05vIHNlcnZpY2VzIHJlcG9ydGVkJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCa0L7Qu9C+0L3QutCwIMKr0KDQsNGB0L/QvtC70L7QttC10L3QuNC1wrsg4oCUINGC0L7Qu9GM0LrQviDQutC+0LPQtNCwINC10YHRgtGMINGF0L7RgtGMINC+0LTQuNC9INGD0LTQsNC70ZHQvdC90YvQuSDRgdC10YDQstC40YEuXG5cdFx0Y29uc3QgaGFzUmVtb3RlID0gc3RhdHVzZXMuc29tZSgocykgPT4gcyAmJiBzLmxvY2F0aW9uID09PSAncmVtb3RlJyk7XG5cdFx0Y29uc3QgY29sQ291bnQgPSBoYXNSZW1vdGUgPyA1IDogNDtcblxuXHRcdGNvbnN0IGhlYWQgPSAnPHRoZWFkPjx0cj4nXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXN0YXR1c1wiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU3RhdHVzJywgJ1N0YXR1cycpKX08L3RoPmBcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtbmFtZVwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU2VydmljZScsICdTZXJ2aWNlJykpfTwvdGg+YFxuXHRcdFx0KyAoaGFzUmVtb3RlID8gYDx0aCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xMb2NhdGlvbicsICdMb2NhdGlvbicpKX08L3RoPmAgOiAnJylcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdXB0aW1lXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xVcHRpbWUnLCAnVXB0aW1lJykpfTwvdGg+YFxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC12ZXJzaW9uXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xWZXJzaW9uJywgJ1ZlcnNpb24nKSl9PC90aD5gXG5cdFx0XHQrICc8L3RyPjwvdGhlYWQ+JztcblxuXHRcdGNvbnN0IGJvZHkgPSBbXTtcblx0XHRvcmRlci5mb3JFYWNoKChuYW1lKSA9PiB7XG5cdFx0XHRjb25zdCByb3dzID0gZ3JvdXBzW25hbWVdO1xuXHRcdFx0Y29uc3QgaXNNdWx0aSA9IHNlbGYubXVsdGlJbnN0YW5jZVNlcnZpY2VzW25hbWVdID09PSB0cnVlIHx8IHJvd3MubGVuZ3RoID4gMTtcblx0XHRcdGlmIChpc011bHRpKSB7XG5cdFx0XHRcdGJvZHkucHVzaChgPHRyIGNsYXNzPVwiY3RpLXN2Yy1ncm91cFwiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHRcdFx0KyBgPGkgY2xhc3M9XCJjb21tZW50cyBpY29uXCI+PC9pPiR7ZXNjKHNlbGYuc2VydmljZUxhYmVsKG5hbWUpKX1gXG5cdFx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWNvdW50XCI+JHtyb3dzLmxlbmd0aH08L3NwYW4+PC90ZD48L3RyPmApO1xuXHRcdFx0XHRyb3dzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0XHRcdGJvZHkucHVzaChzZWxmLnJlbmRlclNlcnZpY2VSb3coc3ZjLCB0cnVlLCBoYXNSZW1vdGUpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHJvd3NbMF0sIGZhbHNlLCBoYXNSZW1vdGUpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdCRyb3dzLmh0bWwoJzx0YWJsZSBjbGFzcz1cInVpIGNlbGxlZCBzdHJpcGVkIGNvbXBhY3QgdW5zdGFja2FibGUgdGFibGUgY3RpLXN0YXR1cy10YWJsZVwiPidcblx0XHRcdCsgaGVhZCArICc8dGJvZHk+JyArIGJvZHkuam9pbignJykgKyAnPC90Ym9keT48L3RhYmxlPicpO1xuXHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSBoYXNoO1xuXHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0JHBsYWNlaG9sZGVyLmhpZGUoKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCg0LXQvdC00LXRgCDQvtC00L3QvtC5INGB0YLRgNC+0LrQuCDRgtCw0LHQu9C40YbRiyAo0YHQtdGA0LLQuNGBINC40LvQuCDQutCw0L3QsNC7KS5cblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R9IHN2YyDQt9Cw0L/QuNGB0Ywg0LjQtyBzdGF0dXNlc1tdXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gZ3JvdXBlZCDRgdGC0YDQvtC60LAg0L/QvtC0INCz0YDRg9C/0L/QvtCy0YvQvCDQt9Cw0LPQvtC70L7QstC60L7QvCAo0LrQsNC90LDQuyDQvNC10YHRgdC10L3QtNC20LXRgNCwKVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGhhc1JlbW90ZSDQv9C+0LrQsNC30YvQstCw0YLRjCDQu9C4INC60L7Qu9C+0L3QutGDIMKr0KDQsNGB0L/QvtC70L7QttC10L3QuNC1wrtcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTCAo0L7QtNC90LAgPHRyPiwg0L/Qu9GO0YEgPHRyPiDRgSDQvtGI0LjQsdC60L7QuSDQv9GA0Lgg0L3QsNC70LjRh9C40LgpXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlUm93KHN2YywgZ3JvdXBlZCwgaGFzUmVtb3RlKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCBlc2MgPSBzZWxmLmVzY2FwZUh0bWw7XG5cdFx0Y29uc3QgY29sQ291bnQgPSBoYXNSZW1vdGUgPyA1IDogNDtcblxuXHRcdGNvbnN0IHN0YXRlUmF3ID0gKHR5cGVvZiBzdmMuc3RhdGUgPT09ICdzdHJpbmcnICYmIHN2Yy5zdGF0ZS5sZW5ndGggPiAwKSA/IHN2Yy5zdGF0ZSA6ICd1bmtub3duJztcblx0XHRjb25zdCBjYW5vbiA9IHNlbGYuY2Fub25TdGF0ZShzdGF0ZVJhdyk7XG5cdFx0Y29uc3QgbGVkQ2xhc3MgPSBzZWxmLnN0YXRlTGVkQ2xhc3NbY2Fub25dIHx8ICd3YXJuJztcblx0XHRjb25zdCBzdGF0ZVRleHQgPSBzZWxmLnN0YXRlVGV4dChzdGF0ZVJhdyk7XG5cblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGdyb3VwZWRcblx0XHRcdD8gc2VsZi5zaG9ydEFyZWEoc3ZjLmFyZWEpXG5cdFx0XHQ6IHNlbGYuc2VydmljZUxhYmVsKHN2Yy5uYW1lKTtcblx0XHRjb25zdCBuYW1lSWNvbiA9IGdyb3VwZWQgPyAnPGkgY2xhc3M9XCJoYXNodGFnIGljb25cIj48L2k+JyA6ICcnO1xuXG5cdFx0Y29uc3QgdXB0aW1lID0gKHR5cGVvZiBzdmMudXB0aW1lID09PSAnc3RyaW5nJyAmJiBzdmMudXB0aW1lLmxlbmd0aCA+IDApID8gc3ZjLnVwdGltZSA6ICcnO1xuXHRcdGNvbnN0IHZlcnNpb24gPSAodHlwZW9mIHN2Yy52ZXJzaW9uID09PSAnc3RyaW5nJyAmJiBzdmMudmVyc2lvbi5sZW5ndGggPiAwKSA/IHN2Yy52ZXJzaW9uIDogJyc7XG5cdFx0Y29uc3QgbGFzdEVycm9yID0gKHR5cGVvZiBzdmMubGFzdF9lcnJvciA9PT0gJ3N0cmluZycgJiYgc3ZjLmxhc3RfZXJyb3IubGVuZ3RoID4gMCkgPyBzdmMubGFzdF9lcnJvciA6ICcnO1xuXHRcdGNvbnN0IGRhc2ggPSAnPHNwYW4gY2xhc3M9XCJjdGktZGltXCI+4oCUPC9zcGFuPic7XG5cblx0XHRjb25zdCBzdGF0dXNDZWxsID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1sZWQgJHtlc2MobGVkQ2xhc3MpfVwiIHRpdGxlPVwiJHtlc2Moc3RhdGVSYXcpfVwiPjwvc3Bhbj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtc3RhdGVcIj4ke2VzYyhzdGF0ZVRleHQpfTwvc3Bhbj5gO1xuXG5cdFx0Y29uc3QgbmFtZUNlbGwgPSBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLW5hbWUke2dyb3VwZWQgPyAnIGN0aS1zdmMtY2hhbm5lbCcgOiAnJ31cIj4ke25hbWVJY29ufSR7ZXNjKGRpc3BsYXlOYW1lKX08L3NwYW4+YDtcblxuXHRcdGNvbnN0IGxvY0NlbGwgPSBoYXNSZW1vdGUgPyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1sb2NcIj4ke3NlbGYubG9jYXRpb25CYWRnZShzdmMubG9jYXRpb24pfTwvdGQ+YCA6ICcnO1xuXG5cdFx0Y29uc3QgY2VsbHMgPSBgPHRkIGNsYXNzPVwiY3RpLWNvbC1zdGF0dXNcIj4ke3N0YXR1c0NlbGx9PC90ZD5gXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLW5hbWVcIj4ke25hbWVDZWxsfTwvdGQ+YFxuXHRcdFx0KyBsb2NDZWxsXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLXVwdGltZVwiPiR7dXB0aW1lICE9PSAnJyA/IGVzYyh1cHRpbWUpIDogZGFzaH08L3RkPmBcblx0XHRcdCsgYDx0ZCBjbGFzcz1cImN0aS1jb2wtdmVyc2lvblwiPiR7dmVyc2lvbiAhPT0gJycgPyBlc2ModmVyc2lvbikgOiBkYXNofTwvdGQ+YDtcblxuXHRcdGxldCBodG1sID0gYDx0ciBjbGFzcz1cImN0aS1zdmMtcm93JHtncm91cGVkID8gJyBjdGktc3ZjLXN1YnJvdycgOiAnJ31cImBcblx0XHRcdCsgYCBkYXRhLXN2Yz1cIiR7ZXNjKHN2Yy5uYW1lIHx8ICcnKX1cIiBkYXRhLWFyZWE9XCIke2VzYyhzdmMuYXJlYSB8fCAnJyl9XCI+JHtjZWxsc308L3RyPmA7XG5cblx0XHQvLyBsYXN0X2Vycm9yIGZyb20gbW9uaXRvcmQgaXMgc3RpY2t5IChcImxhc3QgZXJyb3IgZXZlciBzZWVuXCIpIGFuZCBpcyBOT1Rcblx0XHQvLyBjbGVhcmVkIG9uIHJlY292ZXJ5IOKAlCBpdCBzdGF5cyBpbiB0aGUgQVBJIHBheWxvYWQgb24gcHVycG9zZSAoaGFuZHkgZm9yXG5cdFx0Ly8gZGVidWdnaW5nKS4gQnV0IHN1cmZhY2UgaXQgdG8gdGhlIG9wZXJhdG9yIE9OTFkgd2hpbGUgdGhlIHNlcnZpY2UgaXNcblx0XHQvLyBhY3R1YWxseSB1bmhlYWx0aHksIHNvIGEgcmVjb3ZlcmVkIGdsaXRjaCAoc3RhdGU9b2spIGRvZXNuJ3Qga2VlcFxuXHRcdC8vIHJlYWRpbmcgYXMgYSBjdXJyZW50IGZhaWx1cmUgb24gdGhlIHBhbmVsLlxuXHRcdGlmIChsYXN0RXJyb3IgIT09ICcnICYmIGxlZENsYXNzICE9PSAnb2snKSB7XG5cdFx0XHRodG1sICs9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLWVycm9yLXJvd1wiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHRcdCsgYDxpIGNsYXNzPVwiZXhjbGFtYXRpb24gdHJpYW5nbGUgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYDxzcGFuIHRpdGxlPVwiJHtlc2MobGFzdEVycm9yKX1cIj4ke2VzYyhzZWxmLnRydW5jYXRlKGxhc3RFcnJvciwgMjAwKSl9PC9zcGFuPmBcblx0XHRcdFx0KyAnPC90ZD48L3RyPic7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGh0bWw7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCR0LXQudC00LYg0YDQsNGB0L/QvtC70L7QttC10L3QuNGPINGB0LXRgNCy0LjRgdCwOiDRj9GA0LrQuNC5IMKrVlBTwrsg0LTQu9GPINCy0YvQvdC10YHQtdC90L3Ri9GFINC60LDQvdCw0LvQvtCyINC4XG5cdCAqINC/0YDQuNCz0LvRg9GI0ZHQvdC90YvQuSDCq9Cb0L7QutCw0LvRjNC90L7CuyDQtNC70Y8g0LLRgdC10LPQviDQvtGB0YLQsNC70YzQvdC+0LPQvi5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGxvY2F0aW9uICdyZW1vdGUnIHwgJ2xvY2FsJyB8IHVuZGVmaW5lZFxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfSBIVE1MXG5cdCAqL1xuXHRsb2NhdGlvbkJhZGdlKGxvY2F0aW9uKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCBlc2MgPSBzZWxmLmVzY2FwZUh0bWw7XG5cdFx0aWYgKGxvY2F0aW9uID09PSAncmVtb3RlJykge1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cInVpIHRlYWwgbGFiZWwgY3RpLWxvYy1iYWRnZVwiPjxpIGNsYXNzPVwiY2xvdWQgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYCR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfTG9jYXRpb25SZW1vdGUnLCAnVlBTJykpfTwvc3Bhbj5gO1xuXHRcdH1cblx0XHRpZiAobG9jYXRpb24gPT09ICdsb2NhbCcpIHtcblx0XHRcdHJldHVybiBgPHNwYW4gY2xhc3M9XCJjdGktbG9jLWxvY2FsXCI+PGkgY2xhc3M9XCJob21lIGljb25cIj48L2k+YFxuXHRcdFx0XHQrIGAke2VzYyhzZWxmLnRyKCdtb2RfY3RpX0xvY2F0aW9uTG9jYWwnLCAnTG9jYWwnKSl9PC9zcGFuPmA7XG5cdFx0fVxuXHRcdHJldHVybiAnPHNwYW4gY2xhc3M9XCJjdGktZGltXCI+4oCUPC9zcGFuPic7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCa0LDQvdC+0L3QuNC30LDRhtC40Y8g0YHQstC+0LHQvtC00L3QvtC5INGB0YLRgNC+0LrQuCDRgdC+0YHRgtC+0Y/QvdC40Y8g0LIg0LjQt9Cy0LXRgdGC0L3Ri9C5INC60LvRjtGHINC00LvRjyDQu9Cw0LzQv9C+0YfQutC4INC4XG5cdCAqINC/0LXRgNC10LLQvtC00LAuIG1vbml0b3JkINC80L7QttC10YIg0L/RgNC40YHRi9C70LDRgtGMIMKrYXdhaXRpbmcgYXV0aG9yaXphdGlvbiBjb2Rlwrsg0Lgg0L/RgC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRjYW5vblN0YXRlKHN0YXRlKSB7XG5cdFx0Y29uc3QgcyA9IFN0cmluZyhzdGF0ZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAocyA9PT0gJycpIHtcblx0XHRcdHJldHVybiAndW5rbm93bic7XG5cdFx0fVxuXHRcdGlmIChzLmluZGV4T2YoJ3FyJykgIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gJ3FyY29kZSc7XG5cdFx0fVxuXHRcdGlmIChzLmluZGV4T2YoJ2F3YWl0aW5nJykgIT09IC0xIHx8IHMuaW5kZXhPZigncmVhdXRoJykgIT09IC0xXG5cdFx0XHR8fCBzLmluZGV4T2YoJ2F1dGhfcmVxdWlyZWQnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCcyZmEnKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAncmVhdXRoJztcblx0XHR9XG5cdFx0aWYgKHMgPT09ICdhdXRoZW50aWNhdGVkJykge1xuXHRcdFx0cmV0dXJuICdhdXRoZW50aWNhdGVkJztcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCl0LXQu9C/0LXRgCDQv9C10YDQtdCy0L7QtNCwINGBINGE0L7Qu9Cx0Y3QutC+0LwuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBrZXkg0LrQu9GO0YcgZ2xvYmFsVHJhbnNsYXRlXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBmYWxsYmFjayDQt9C90LDRh9C10L3QuNC1INC/0L4g0YPQvNC+0LvRh9Cw0L3QuNGOXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHR0cihrZXksIGZhbGxiYWNrKSB7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBmYWxsYmFjaztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0LjQvNGPINGB0LXRgNCy0LjRgdCwLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c2VydmljZUxhYmVsKG5hbWUpIHtcblx0XHRjb25zdCBtYXAgPSB7XG5cdFx0XHRtb25pdG9yZDogJ21vZF9jdGlfc3ZjX21vbml0b3JkJyxcblx0XHRcdG5hdHM6ICdtb2RfY3RpX3N2Y19uYXRzJyxcblx0XHRcdCdjcm0tMWMnOiAnbW9kX2N0aV9zdmNfY3JtJyxcblx0XHRcdGF1dGg6ICdtb2RfY3RpX3N2Y19hdXRoJyxcblx0XHRcdHByb3h5OiAnbW9kX2N0aV9zdmNfcHJveHknLFxuXHRcdFx0J2FtaS1saXN0ZW5lcic6ICdtb2RfY3RpX3N2Y19hbWknLFxuXHRcdFx0Y2hhdHM6ICdtb2RfY3RpX3N2Y19jaGF0cycsXG5cdFx0XHR0ZzogJ21vZF9jdGlfc3ZjX3RnJyxcblx0XHRcdG1heDogJ21vZF9jdGlfc3ZjX21heCcsXG5cdFx0XHQnbWFuYWdlci5hcGknOiAnbW9kX2N0aV9zdmNfbWFuYWdlcl9hcGknLFxuXHRcdFx0J3JlbW90ZS10dW5uZWwnOiAnbW9kX2N0aV9zdmNfcmVtb3RlX3R1bm5lbCcsXG5cdFx0fTtcblx0XHRjb25zdCBrZXkgPSBtYXBbbmFtZV07XG5cdFx0aWYgKGtleSAmJiB0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdH1cblx0XHRyZXR1cm4gbmFtZSB8fCAndW5rbm93bic7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCn0LXQu9C+0LLQtdC60L7Rh9C40YLQsNC10LzQvtC1INC/0YDQtdC00YHRgtCw0LLQu9C10L3QuNC1IHN0YXRlINC60LDQvdCw0LvQsC/RgdC10YDQstC40YHQsCAo0L3QsNC/0YDQuNC80LXRgCDCq9Cf0L7QtNC60LvRjtGH0ZHQvcK7LFxuXHQgKiDCq9Ci0YDQtdCx0YPQtdGCINCw0LLRgtC+0YDQuNC30LDRhtC40LjCuykuINCh0L3QsNGH0LDQu9CwINC40YnQtdC8INGC0L7Rh9C90YvQuSDQutC70Y7Rhywg0LfQsNGC0LXQvCDQv9C+INC60LDQvdC+0L3QuNGH0LXRgdC60L7QvNGDXG5cdCAqINGB0L7RgdGC0L7Rj9C90LjRjiwg0LfQsNGC0LXQvCDigJQg0LDQvdCz0LvQuNC50YHQutC40Lkg0YTQvtC70LHRjdC6LCDQuCDQsiDQutGA0LDQudC90LXQvCDRgdC70YPRh9Cw0LUg0LjRgdGF0L7QtNC90YPRjiDRgdGC0YDQvtC60YMuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c3RhdGVUZXh0KHN0YXRlKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCByYXcgPSBTdHJpbmcoc3RhdGUgfHwgJycpO1xuXHRcdC8vINCi0L7Rh9C90YvQuSDQutC70Y7RhyDQv9C+0LQg0LjRgdGF0L7QtNC90L7QtSDRgdC+0YHRgtC+0Y/QvdC40LUgKNC90LAg0YHQu9GD0YfQsNC5INGB0L/QtdGG0LjRhNC40YfQvdGL0YUg0L/QtdGA0LXQstC+0LTQvtCyKS5cblx0XHRjb25zdCBleGFjdEtleSA9IGBtb2RfY3RpX3N0YXRlXyR7cmF3fWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtleGFjdEtleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbZXhhY3RLZXldO1xuXHRcdH1cblx0XHRjb25zdCBjYW5vbiA9IHNlbGYuY2Fub25TdGF0ZShyYXcpO1xuXHRcdGNvbnN0IGNhbm9uS2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtjYW5vbn1gO1xuXHRcdGlmICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVbY2Fub25LZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2Nhbm9uS2V5XTtcblx0XHR9XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSB7XG5cdFx0XHRvazogJ09LJyxcblx0XHRcdGF1dGhlbnRpY2F0ZWQ6ICdBdXRoZW50aWNhdGVkJyxcblx0XHRcdGVycm9yOiAnRXJyb3InLFxuXHRcdFx0dW5rbm93bjogJ1Vua25vd24nLFxuXHRcdFx0cGVuZGluZzogJ1BlbmRpbmcnLFxuXHRcdFx0c3RhcnRpbmc6ICdTdGFydGluZycsXG5cdFx0XHRxcmNvZGU6ICdBd2FpdGluZyBRUi1jb2RlIGF1dGhvcml6YXRpb24nLFxuXHRcdFx0cmVhdXRoOiAnQXV0aG9yaXphdGlvbiByZXF1aXJlZCcsXG5cdFx0fTtcblx0XHRyZXR1cm4gZmFsbGJhY2tbY2Fub25dIHx8IHJhdztcblx0fSxcblxuXHQvKipcblx0ICog0JrQvtGA0L7RgtC60L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBhcmVhLUdVSUQg4oCUINC/0LXRgNCy0YvQtSA4INGB0LjQvNCy0L7Qu9C+0LIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBhcmVhXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzaG9ydEFyZWEoYXJlYSkge1xuXHRcdGlmICh0eXBlb2YgYXJlYSAhPT0gJ3N0cmluZycgfHwgYXJlYS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKGFyZWEubGVuZ3RoIDw9IDEyKSB7XG5cdFx0XHRyZXR1cm4gYXJlYTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FyZWEuc3Vic3RyaW5nKDAsIDgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XG5cdFx0aWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChzdHIubGVuZ3RoIDw9IG1heCkge1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LfQvtC/0LDRgdC90YvQuSDRjdC60YDQsNC90LXRgCBIVE1MLlxuXHQgKlxuXHQgKiBAcGFyYW0geyp9IHZhbHVlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRlc2NhcGVIdG1sKHZhbHVlKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSlcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblx0fSxcblxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0YHRgtCw0YLRg9GB0LAg0LzQvtC00YPQu9GPICjQsdC10LnQtNC2INCyINC/0YDQsNCy0L7QvCDQstC10YDRhdC90LXQvCDRg9Cz0LvRgykuXG5cdCAqXG5cdCAqIEBwYXJhbSBzdGF0dXNcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0LnJlbW92ZUNsYXNzKCdncmV5Jylcblx0XHRcdC5yZW1vdmVDbGFzcygneWVsbG93Jylcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JlZW4nKVxuXHRcdFx0LnJlbW92ZUNsYXNzKCdyZWQnKTtcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygnZ3JlZW4nKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3RlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnRGlzY29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Rpc2Nvbm5lY3RlZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uUHJvZ3Jlc3N9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNXYWl0Jzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uV2FpdH1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ0Vycm9yJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHRcdFx0Lmh0bWwoYDxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JHtnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uVG8xQ0Vycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25FcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbkVycm9yfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ1VwZGF0aW5nJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZXknKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfVXBkYXRlU3RhdHVzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdyZWQnKVxuXHRcdFx0XHRcdC5odG1sKGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fSxcbn07XG4iXX0=