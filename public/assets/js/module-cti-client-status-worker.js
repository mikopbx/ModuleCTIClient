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
    var self = moduleCTIClientConnectionCheckWorker;
    var $panel = self.$servicesStatus;

    if (!$panel || $panel.length === 0) {
      return;
    }

    var label = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusModuleDisabled ? globalTranslate.mod_cti_StatusModuleDisabled : 'Module is disabled'; // Don't replace the panel's innerHTML: that destroys #cti-services-status-rows
    // and #cti-services-status-placeholder, so a later re-enable WITHOUT a page
    // reload would leave renderServicesStatus() writing into an empty selection
    // and the table would never come back. Reuse the placeholder instead,
    // mirroring renderServicesStatus()'s showPlaceholder, so the structure
    // survives. Fall back to replacing the panel only if the skeleton is absent.

    var $rows = $('#cti-services-status-rows');
    var $placeholder = $('#cti-services-status-placeholder');
    self.lastRenderHash = '';

    if ($rows.length > 0) {
      $rows.empty();
    }

    if ($placeholder.length > 0) {
      $placeholder.html("<span>&nbsp;".concat(self.escapeHtml(label), "</span>")).show();
    } else {
      $panel.html("<div class=\"ui basic segment\">".concat(self.escapeHtml(label), "</div>"));
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJyZWF1dGgiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJhcGkiLCJ1cmwiLCJDb25maWciLCJwYnhVcmwiLCJvbiIsInN1Y2Nlc3NUZXN0IiwiUGJ4QXBpIiwib25Db21wbGV0ZSIsInNldFRpbWVvdXQiLCJvblJlc3BvbnNlIiwicmVzcG9uc2UiLCJyZW1vdmUiLCJkYXRhIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJjcm0xYyIsImhhc0Vycm9yIiwiaGFzU3RhcnRpbmciLCJmb3JFYWNoIiwicyIsIm5hbWUiLCJzdGF0ZSIsInJlbmRlckRpc2FibGVkUGFuZWwiLCJzZWxmIiwiJHBhbmVsIiwibGFiZWwiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkIiwiJHJvd3MiLCIkcGxhY2Vob2xkZXIiLCJlbXB0eSIsImh0bWwiLCJlc2NhcGVIdG1sIiwic2hvdyIsImVzYyIsInNob3dQbGFjZWhvbGRlciIsInRleHQiLCJ0ciIsImhhc2giLCJjaGlsZHJlbiIsImhpZGUiLCJncm91cHMiLCJvcmRlciIsInN2YyIsInB1c2giLCJoYXNSZW1vdGUiLCJzb21lIiwibG9jYXRpb24iLCJjb2xDb3VudCIsImhlYWQiLCJib2R5Iiwicm93cyIsImlzTXVsdGkiLCJzZXJ2aWNlTGFiZWwiLCJyZW5kZXJTZXJ2aWNlUm93Iiwiam9pbiIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImNhbm9uIiwiY2Fub25TdGF0ZSIsImxlZENsYXNzIiwic3RhdGVUZXh0IiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwibmFtZUljb24iLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsImRhc2giLCJzdGF0dXNDZWxsIiwibmFtZUNlbGwiLCJsb2NDZWxsIiwibG9jYXRpb25CYWRnZSIsImNlbGxzIiwidHJ1bmNhdGUiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImluZGV4T2YiLCJrZXkiLCJmYWxsYmFjayIsIm1hcCIsIm1vbml0b3JkIiwibmF0cyIsInByb3h5IiwicmF3IiwiZXhhY3RLZXkiLCJjYW5vbktleSIsInN1YnN0cmluZyIsInN0ciIsInZhbHVlIiwic3RhdHVzIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyIsIm1vZF9jdGlfQ29ubmVjdGVkIiwibW9kX2N0aV9EaXNjb25uZWN0ZWQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25Qcm9ncmVzcyIsIm1vZF9jdGlfQ29ubmVjdGlvbldhaXQiLCJtb2RfY3RpX0Nvbm5lY3Rpb25UbzFDRXJyb3IiLCJtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvciIsIm1vZF9jdGlfVXBkYXRlU3RhdHVzIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxJQUFNQSxvQ0FBb0MsR0FBRztBQUM1Q0MsRUFBQUEsUUFBUSxFQUFFQyxDQUFDLENBQUMseUJBQUQsQ0FEaUM7QUFFNUNDLEVBQUFBLGFBQWEsRUFBRUQsQ0FBQyxDQUFDLHVCQUFELENBRjRCO0FBRzVDRSxFQUFBQSxpQkFBaUIsRUFBRUYsQ0FBQyxDQUFDLDBCQUFELENBSHdCO0FBSTVDRyxFQUFBQSxZQUFZLEVBQUVILENBQUMsQ0FBQyxvQkFBRCxDQUo2QjtBQUs1Q0ksRUFBQUEsYUFBYSxFQUFFSixDQUFDLENBQUMsU0FBRCxDQUw0QjtBQU01Q0ssRUFBQUEsYUFBYSxFQUFFTCxDQUFDLENBQUMsZUFBRCxDQU40QjtBQU81Q00sRUFBQUEsVUFBVSxFQUFFTixDQUFDLENBQUMseUNBQUQsQ0FQK0I7QUFRNUNPLEVBQUFBLGVBQWUsRUFBRVAsQ0FBQyxDQUFDLHNCQUFELENBUjBCO0FBUzVDUSxFQUFBQSxPQUFPLEVBQUUsSUFUbUM7QUFVNUNDLEVBQUFBLGFBQWEsRUFBRSxFQVY2QjtBQVc1Q0MsRUFBQUEsV0FBVyxFQUFFLENBWCtCO0FBWTVDQyxFQUFBQSxjQUFjLEVBQUUsRUFaNEI7O0FBYzVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0NDLEVBQUFBLGFBQWEsRUFBRTtBQUNkQyxJQUFBQSxFQUFFLEVBQUUsSUFEVTtBQUVkQyxJQUFBQSxhQUFhLEVBQUUsSUFGRDtBQUdkQyxJQUFBQSxLQUFLLEVBQUUsT0FITztBQUlkQyxJQUFBQSxJQUFJLEVBQUUsT0FKUTtBQUtkQyxJQUFBQSxNQUFNLEVBQUUsT0FMTTtBQU1kQyxJ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Q1csUUFEWCxFQUVFL0QsSUFGRixpREFFOENMLGVBQWUsQ0FBQ3dFLHNCQUY5RDtBQUdBOztBQUNELFdBQUsscUJBQUw7QUFDQ3pKLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFK0ksUUFERixDQUNXLFFBRFgsRUFFRS9ELElBRkYsaURBRThDTCxlQUFlLENBQUN5RSwyQkFGOUQ7QUFHQTs7QUFDRCxXQUFLLGlCQUFMO0FBQ0MxSixRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStJLFFBREYsQ0FDVyxLQURYLEVBRUUvRCxJQUZGLGlEQUU4Q0wsZUFBZSxDQUFDMEUsdUJBRjlEO0FBR0E7O0FBQ0QsV0FBSyxVQUFMO0FBQ0MzSixRQUFBQSxvQ0FBb0MsQ0FBQ00sYUFBckMsQ0FDRStJLFFBREYsQ0FDVyxNQURYLEVBRUUvRCxJQUZGLGlEQUU4Q0wsZUFBZSxDQUFDMkUsb0JBRjlEO0FBR0E7O0FBQ0Q7QUFDQzVKLFFBQUFBLG9DQUFvQyxDQUFDTSxhQUFyQyxDQUNFK0ksUUFERixDQUNXLEtBRFgsRUFFRS9ELElBRkYsQ0FFT0wsZUFBZSxDQUFDMEUsdUJBRnZCO0FBR0E7QUF4Q0Y7QUEwQ0E7QUE1akIyQyxDQUE3QyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaWtvUEJYIC0gZnJlZSBwaG9uZSBzeXN0ZW0gZm9yIHNtYWxsIGJ1c2luZXNzXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTctMjAyMSBBbGV4ZXkgUG9ydG5vdiBhbmQgTmlrb2xheSBCZWtldG92XG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAqIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gKiB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uOyBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICogKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAqIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gKiBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFsb25nIHdpdGggdGhpcyBwcm9ncmFtLlxuICogSWYgbm90LCBzZWUgPGh0dHBzOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiAqL1xuXG4vKiBnbG9iYWwgZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChICsg0YDQtdC90LTQtdGAINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyINGB0LXRgNCy0LjRgdC+0LIuXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNzdGF0dXMnKSxcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxuXHQkZGVidWdJbmZvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSBzcGFuI2RlYnVnLWluZm8nKSxcblx0JHNlcnZpY2VzU3RhdHVzOiAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cycpLFxuXHR0aW1lT3V0OiAzMDAwLFxuXHR0aW1lT3V0SGFuZGxlOiAnJyxcblx0ZXJyb3JDb3VudHM6IDAsXG5cdGxhc3RSZW5kZXJIYXNoOiAnJyxcblxuXHQvKipcblx0ICog0JzQsNC/0L/QuNC90LMgc3RhdGUgLT4gQ1NTLdC60LvQsNGB0YEg0LvQsNC80L/QvtGH0LrQuC5cblx0ICog0JvRjtCx0L7QtSDQvdC10LjQt9Cy0LXRgdGC0L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAtPiDQttGR0LvRgtC+0LUgKHdhcm4pLlxuXHQgKi9cblx0c3RhdGVMZWRDbGFzczoge1xuXHRcdG9rOiAnb2snLFxuXHRcdGF1dGhlbnRpY2F0ZWQ6ICdvaycsXG5cdFx0ZXJyb3I6ICdlcnJvcicsXG5cdFx0ZmFpbDogJ2Vycm9yJyxcblx0XHRmYWlsZWQ6ICdlcnJvcicsXG5cdFx0ZG93bjogJ2Vycm9yJyxcblx0XHRzdG9wcGVkOiAnZXJyb3InLFxuXHRcdHVua25vd246ICd1bmtub3duJyxcblx0XHRwZW5kaW5nOiAnd2FybicsXG5cdFx0c3RhcnRpbmc6ICd3YXJuJyxcblx0XHRxcmNvZGU6ICd3YXJuJyxcblx0XHRyZWF1dGg6ICd3YXJuJyxcblx0XHRhdXRoOiAnd2FybicsXG5cdFx0YXV0aF9yZXF1aXJlZDogJ3dhcm4nLFxuXHRcdHdhcm46ICd3YXJuJyxcblx0XHR3YXJuaW5nOiAnd2FybicsXG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0LXRgNCy0LjRgdGLLCDQutC+0YLQvtGA0YvQtSDQvNC+0LPRg9GCINC40LTRgtC4INCyINC90LXRgdC60L7Qu9GM0LrQuNGFINC40L3RgdGC0LDQvdGB0LDRhSDRgSDRgNCw0LfQvdGL0LwgYXJlYS5cblx0ICovXG5cdG11bHRpSW5zdGFuY2VTZXJ2aWNlczoge1xuXHRcdGNoYXRzOiB0cnVlLFxuXHRcdHRnOiB0cnVlLFxuXHRcdG1heDogdHJ1ZSxcblx0fSxcblxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cblx0cmVzdGFydFdvcmtlcigpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ1VwZGF0aW5nJyk7XG5cdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcigpO1xuXHR9LFxuXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIChyZXNwb25zZS5kYXRhKSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZW5kZXIgc2VydmljZXMgc3RhdHVzIHBhbmVsIGZvciBib3RoIHN1Y2Nlc3MgYW5kIHBhcnRpYWwgcmVzcG9uc2VzLlxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlc1N0YXR1cyhyZXNwb25zZS5kYXRhKTtcblxuXHRcdFx0XHRcdC8vIERlYnVnIEpTT04gcGFuZSAobGVnYWN5IGRlYnVnIHRhYikuXG5cdFx0XHRcdFx0bGV0IHZpc3VhbEVycm9yU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuZGF0YSwgbnVsbCwgMik7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHZpc3VhbEVycm9yU3RyaW5nID0gdmlzdWFsRXJyb3JTdHJpbmcucmVwbGFjZSgvXFxuL2csICc8YnIvPicpO1xuXHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4gJHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXR1c2VzID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEgJiYgQXJyYXkuaXNBcnJheShyZXNwb25zZS5kYXRhLnN0YXR1c2VzKSlcblx0XHRcdFx0XHRcdD8gcmVzcG9uc2UuZGF0YS5zdGF0dXNlcyA6IG51bGw7XG5cdFx0XHRcdFx0aWYgKCFzdGF0dXNlcykge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENsYXNzaWZ5IHRoZSByZXNwb25zZSBieSB0aGUgd29yc3Qgbm9uLXN5c3RlbSBzdGF0ZS5cblx0XHRcdFx0XHQvLyBjcm0tMWMgaXMgc3BlY2lhbDogaXQncyB0aGUgMUMgYnJpZGdlIOKAlCBpdHMgb3duIGVycm9yIGxhYmVsLlxuXHRcdFx0XHRcdGxldCBjcm0xYyA9IG51bGw7XG5cdFx0XHRcdFx0bGV0IGhhc0Vycm9yID0gZmFsc2U7XG5cdFx0XHRcdFx0bGV0IGhhc1N0YXJ0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RhdHVzZXMuZm9yRWFjaCgocykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzIHx8IHR5cGVvZiBzLm5hbWUgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAocy5uYW1lID09PSAnY3JtLTFjJykgY3JtMWMgPSBzLnN0YXRlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdlcnJvcicgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWwnIHx8IHMuc3RhdGUgPT09ICdmYWlsZWQnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICdkb3duJyB8fCBzLnN0YXRlID09PSAnc3RvcHBlZCcpIGhhc0Vycm9yID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGlmIChzLnN0YXRlID09PSAnc3RhcnRpbmcnIHx8IHMuc3RhdGUgPT09ICdwZW5kaW5nJ1xuXHRcdFx0XHRcdFx0XHR8fCBzLnN0YXRlID09PSAndW5rbm93bicpIGhhc1N0YXJ0aW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoY3JtMWMgJiYgY3JtMWMgIT09ICdvaycpIHtcblx0XHRcdFx0XHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHdlYlNlcnZpY2VUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ0Vycm9yJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXQnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1N0YXJ0aW5nKSB7XG5cdFx0XHRcdFx0XHQvLyBTdGlsbCBzdGFydGluZzogc2hvdyBwcm9ncmVzcyB1bnRpbCB3ZSBnaXZlIHVwIGFmdGVyIDEwXG5cdFx0XHRcdFx0XHQvLyBmYWlsZWQgcG9sbHMsIHRoZW4gdHJlYXQgdGhlIHN0dWNrIGRhZW1vbiBhcyBhbiBlcnJvclxuXHRcdFx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBmYWxzZWx5IHJlcG9ydGluZyBpdCBhcyBDb25uZWN0ZWQuXG5cdFx0XHRcdFx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzIDwgMTApIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc0Vycm9yKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGVkJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyRGlzYWJsZWRQYW5lbCgpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRwYW5lbCA9IHNlbGYuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQvLyBEb24ndCByZXBsYWNlIHRoZSBwYW5lbCdzIGlubmVySFRNTDogdGhhdCBkZXN0cm95cyAjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzXG5cdFx0Ly8gYW5kICNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyLCBzbyBhIGxhdGVyIHJlLWVuYWJsZSBXSVRIT1VUIGEgcGFnZVxuXHRcdC8vIHJlbG9hZCB3b3VsZCBsZWF2ZSByZW5kZXJTZXJ2aWNlc1N0YXR1cygpIHdyaXRpbmcgaW50byBhbiBlbXB0eSBzZWxlY3Rpb25cblx0XHQvLyBhbmQgdGhlIHRhYmxlIHdvdWxkIG5ldmVyIGNvbWUgYmFjay4gUmV1c2UgdGhlIHBsYWNlaG9sZGVyIGluc3RlYWQsXG5cdFx0Ly8gbWlycm9yaW5nIHJlbmRlclNlcnZpY2VzU3RhdHVzKCkncyBzaG93UGxhY2Vob2xkZXIsIHNvIHRoZSBzdHJ1Y3R1cmVcblx0XHQvLyBzdXJ2aXZlcy4gRmFsbCBiYWNrIHRvIHJlcGxhY2luZyB0aGUgcGFuZWwgb25seSBpZiB0aGUgc2tlbGV0b24gaXMgYWJzZW50LlxuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9ICcnO1xuXHRcdGlmICgkcm93cy5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcm93cy5lbXB0eSgpO1xuXHRcdH1cblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5odG1sKGA8c3Bhbj4mbmJzcDske3NlbGYuZXNjYXBlSHRtbChsYWJlbCl9PC9zcGFuPmApLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHtzZWxmLmVzY2FwZUh0bWwobGFiZWwpfTwvZGl2PmApO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINGC0LDQsdC70LjRhtGLINGB0YLQsNGC0YPRgdC+0LI6IMKr0LjQvdC00LjQutCw0YLQvtGAICsg0YHQtdGA0LLQuNGBL9C60LDQvdCw0LsgKyDRgNCw0YHQv9C+0LvQvtC20LXQvdC40LUgK1xuXHQgKiDQsNC/0YLQsNC50LwgKyDQstC10YDRgdC40Y/Cuy4g0JrQvtC70L7QvdC60LAgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCuyDQv9C+0Y/QstC70Y/QtdGC0YHRjyDRgtC+0LvRjNC60L4g0LXRgdC70Lgg0YXQvtGC0Y8g0LHRi1xuXHQgKiDQvtC00LjQvSDRgdC10YDQstC40YEg0LLRi9C90LXRgdC10L0g0L3QsCBWUFMg4oCUINC90LAg0L7QsdGL0YfQvdC+0Lkg0LvQvtC60LDQu9GM0L3QvtC5INGD0YHRgtCw0L3QvtCy0LrQtSDRgtCw0LHQu9C40YbQsFxuXHQgKiDQvtGB0YLQsNGR0YLRgdGPINC60L7QvNC/0LDQutGC0L3QvtC5LlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZGF0YSDQntGC0LLQtdGCIEFQSSAocmVzcG9uc2UuZGF0YSkuXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlc1N0YXR1cyhkYXRhKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3Qgc2hvd1BsYWNlaG9sZGVyID0gKHRleHQpID0+IHtcblx0XHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcblx0XHRcdCRyb3dzLmVtcHR5KCk7XG5cdFx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmh0bWwoYDxzcGFuPiZuYnNwOyR7ZXNjKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke2VzYyh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXG5cdFx0Ly8g0JHRjdC6INC80L7QttC10YIg0LLQtdGA0L3Rg9GC0Ywg0YHRgtGA0L7QutGDICdNb2R1bGUgZGlzYWJsZWQnINCy0LzQtdGB0YLQviDQvNCw0YHRgdC40LLQsC5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdHVzZXMpKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gKHR5cGVvZiBzdGF0dXNlcyA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdD8gc3RhdHVzZXNcblx0XHRcdFx0OiBzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c1VuYXZhaWxhYmxlJywgJ1N0YXR1cyB1bmF2YWlsYWJsZScpO1xuXHRcdFx0c2hvd1BsYWNlaG9sZGVyKHRleHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCf0YDQvtC/0YPRgdC60LDQtdC8INC/0LXRgNC10YDQuNGB0L7QstC60YMgRE9NLCDQtdGB0LvQuCDQtNCw0L3QvdGL0LUg0L3QtSDQuNC30LzQtdC90LjQu9C40YHRjCDigJQg0YPQsdC40YDQsNC10YJcblx0XHQvLyDQvNC10YDRhtCw0L3QuNC1INGC0LDQsdC70LjRhtGLINC/0YDQuCDQvtC/0YDQvtGB0LUg0YDQsNC3INCyIDMg0YHQtdC60YPQvdC00YsuXG5cdFx0Y29uc3QgaGFzaCA9IEpTT04uc3RyaW5naWZ5KHN0YXR1c2VzKTtcblx0XHRpZiAoaGFzaCA9PT0gc2VsZi5sYXN0UmVuZGVySGFzaCAmJiAkcm93cy5jaGlsZHJlbigpLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQkcGxhY2Vob2xkZXIuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCT0YDRg9C/0L/QuNGA0YPQtdC8INC/0L4g0LjQvNC10L3QuCDRgdC10YDQstC40YHQsC4g0JLQvdGD0YLRgNC4INCz0YDRg9C/0L/RiyDigJQg0YHRgtGA0L7QutC4INC/0L4gYXJlYSAo0LrQsNC90LDQu9GLKS5cblx0XHRjb25zdCBncm91cHMgPSB7fTtcblx0XHRjb25zdCBvcmRlciA9IFtdO1xuXHRcdHN0YXR1c2VzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0aWYgKCFzdmMgfHwgdHlwZW9mIHN2YyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmFtZSA9ICh0eXBlb2Ygc3ZjLm5hbWUgPT09ICdzdHJpbmcnICYmIHN2Yy5uYW1lLmxlbmd0aCA+IDApID8gc3ZjLm5hbWUgOiAndW5rbm93bic7XG5cdFx0XHRpZiAoIWdyb3Vwc1tuYW1lXSkge1xuXHRcdFx0XHRncm91cHNbbmFtZV0gPSBbXTtcblx0XHRcdFx0b3JkZXIucHVzaChuYW1lKTtcblx0XHRcdH1cblx0XHRcdGdyb3Vwc1tuYW1lXS5wdXNoKHN2Yyk7XG5cdFx0fSk7XG5cblx0XHRpZiAob3JkZXIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRzaG93UGxhY2Vob2xkZXIoc2VsZi50cignbW9kX2N0aV9TdGF0dXNFbXB0eScsICdObyBzZXJ2aWNlcyByZXBvcnRlZCcpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQmtC+0LvQvtC90LrQsCDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7IOKAlCDRgtC+0LvRjNC60L4g0LrQvtCz0LTQsCDQtdGB0YLRjCDRhdC+0YLRjCDQvtC00LjQvSDRg9C00LDQu9GR0L3QvdGL0Lkg0YHQtdGA0LLQuNGBLlxuXHRcdGNvbnN0IGhhc1JlbW90ZSA9IHN0YXR1c2VzLnNvbWUoKHMpID0+IHMgJiYgcy5sb2NhdGlvbiA9PT0gJ3JlbW90ZScpO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBoZWFkID0gJzx0aGVhZD48dHI+J1xuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC1zdGF0dXNcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFN0YXR1cycsICdTdGF0dXMnKSl9PC90aD5gXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLW5hbWVcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFNlcnZpY2UnLCAnU2VydmljZScpKX08L3RoPmBcblx0XHRcdCsgKGhhc1JlbW90ZSA/IGA8dGggY2xhc3M9XCJjdGktY29sLWxvY1wiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sTG9jYXRpb24nLCAnTG9jYXRpb24nKSl9PC90aD5gIDogJycpXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXVwdGltZVwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sVXB0aW1lJywgJ1VwdGltZScpKX08L3RoPmBcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdmVyc2lvblwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sVmVyc2lvbicsICdWZXJzaW9uJykpfTwvdGg+YFxuXHRcdFx0KyAnPC90cj48L3RoZWFkPic7XG5cblx0XHRjb25zdCBib2R5ID0gW107XG5cdFx0b3JkZXIuZm9yRWFjaCgobmFtZSkgPT4ge1xuXHRcdFx0Y29uc3Qgcm93cyA9IGdyb3Vwc1tuYW1lXTtcblx0XHRcdGNvbnN0IGlzTXVsdGkgPSBzZWxmLm11bHRpSW5zdGFuY2VTZXJ2aWNlc1tuYW1lXSA9PT0gdHJ1ZSB8fCByb3dzLmxlbmd0aCA+IDE7XG5cdFx0XHRpZiAoaXNNdWx0aSkge1xuXHRcdFx0XHRib2R5LnB1c2goYDx0ciBjbGFzcz1cImN0aS1zdmMtZ3JvdXBcIj48dGQgY29sc3Bhbj1cIiR7Y29sQ291bnR9XCI+YFxuXHRcdFx0XHRcdCsgYDxpIGNsYXNzPVwiY29tbWVudHMgaWNvblwiPjwvaT4ke2VzYyhzZWxmLnNlcnZpY2VMYWJlbChuYW1lKSl9YFxuXHRcdFx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1jb3VudFwiPiR7cm93cy5sZW5ndGh9PC9zcGFuPjwvdGQ+PC90cj5gKTtcblx0XHRcdFx0cm93cy5mb3JFYWNoKChzdmMpID0+IHtcblx0XHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHN2YywgdHJ1ZSwgaGFzUmVtb3RlKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ym9keS5wdXNoKHNlbGYucmVuZGVyU2VydmljZVJvdyhyb3dzWzBdLCBmYWxzZSwgaGFzUmVtb3RlKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQkcm93cy5odG1sKCc8dGFibGUgY2xhc3M9XCJ1aSBjZWxsZWQgc3RyaXBlZCBjb21wYWN0IHVuc3RhY2thYmxlIHRhYmxlIGN0aS1zdGF0dXMtdGFibGVcIj4nXG5cdFx0XHQrIGhlYWQgKyAnPHRib2R5PicgKyBib2R5LmpvaW4oJycpICsgJzwvdGJvZHk+PC90YWJsZT4nKTtcblx0XHRzZWxmLmxhc3RSZW5kZXJIYXNoID0gaGFzaDtcblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YLQsNCx0LvQuNGG0YsgKNGB0LXRgNCy0LjRgSDQuNC70Lgg0LrQsNC90LDQuykuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBzdmMg0LfQsNC/0LjRgdGMINC40Lcgc3RhdHVzZXNbXVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGdyb3VwZWQg0YHRgtGA0L7QutCwINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKNC60LDQvdCw0Lsg0LzQtdGB0YHQtdC90LTQttC10YDQsClcblx0ICogQHBhcmFtIHtib29sZWFufSBoYXNSZW1vdGUg0L/QvtC60LDQt9GL0LLQsNGC0Ywg0LvQuCDQutC+0LvQvtC90LrRgyDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUwgKNC+0LTQvdCwIDx0cj4sINC/0LvRjtGBIDx0cj4g0YEg0L7RiNC40LHQutC+0Lkg0L/RgNC4INC90LDQu9C40YfQuNC4KVxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQsIGhhc1JlbW90ZSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUoc3RhdGVSYXcpO1xuXHRcdGNvbnN0IGxlZENsYXNzID0gc2VsZi5zdGF0ZUxlZENsYXNzW2Nhbm9uXSB8fCAnd2Fybic7XG5cdFx0Y29uc3Qgc3RhdGVUZXh0ID0gc2VsZi5zdGF0ZVRleHQoc3RhdGVSYXcpO1xuXG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IHNlbGYuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBzZWxmLnNlcnZpY2VMYWJlbChzdmMubmFtZSk7XG5cdFx0Y29uc3QgbmFtZUljb24gPSBncm91cGVkID8gJzxpIGNsYXNzPVwiaGFzaHRhZyBpY29uXCI+PC9pPicgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblx0XHRjb25zdCBkYXNoID0gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xuXG5cdFx0Y29uc3Qgc3RhdHVzQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbGVkICR7ZXNjKGxlZENsYXNzKX1cIiB0aXRsZT1cIiR7ZXNjKHN0YXRlUmF3KX1cIj48L3NwYW4+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLXN0YXRlXCI+JHtlc2Moc3RhdGVUZXh0KX08L3NwYW4+YDtcblxuXHRcdGNvbnN0IG5hbWVDZWxsID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1uYW1lJHtncm91cGVkID8gJyBjdGktc3ZjLWNoYW5uZWwnIDogJyd9XCI+JHtuYW1lSWNvbn0ke2VzYyhkaXNwbGF5TmFtZSl9PC9zcGFuPmA7XG5cblx0XHRjb25zdCBsb2NDZWxsID0gaGFzUmVtb3RlID8gYDx0ZCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtzZWxmLmxvY2F0aW9uQmFkZ2Uoc3ZjLmxvY2F0aW9uKX08L3RkPmAgOiAnJztcblxuXHRcdGNvbnN0IGNlbGxzID0gYDx0ZCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtzdGF0dXNDZWxsfTwvdGQ+YFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1uYW1lXCI+JHtuYW1lQ2VsbH08L3RkPmBcblx0XHRcdCsgbG9jQ2VsbFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke3VwdGltZSAhPT0gJycgPyBlc2ModXB0aW1lKSA6IGRhc2h9PC90ZD5gXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLXZlcnNpb25cIj4ke3ZlcnNpb24gIT09ICcnID8gZXNjKHZlcnNpb24pIDogZGFzaH08L3RkPmA7XG5cblx0XHRsZXQgaHRtbCA9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLXJvdyR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1zdWJyb3cnIDogJyd9XCJgXG5cdFx0XHQrIGAgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPiR7Y2VsbHN9PC90cj5gO1xuXG5cdFx0Ly8gbGFzdF9lcnJvciBmcm9tIG1vbml0b3JkIGlzIHN0aWNreSAoXCJsYXN0IGVycm9yIGV2ZXIgc2VlblwiKSBhbmQgaXMgTk9UXG5cdFx0Ly8gY2xlYXJlZCBvbiByZWNvdmVyeSDigJQgaXQgc3RheXMgaW4gdGhlIEFQSSBwYXlsb2FkIG9uIHB1cnBvc2UgKGhhbmR5IGZvclxuXHRcdC8vIGRlYnVnZ2luZykuIEJ1dCBzdXJmYWNlIGl0IHRvIHRoZSBvcGVyYXRvciBPTkxZIHdoaWxlIHRoZSBzZXJ2aWNlIGlzXG5cdFx0Ly8gYWN0dWFsbHkgdW5oZWFsdGh5LCBzbyBhIHJlY292ZXJlZCBnbGl0Y2ggKHN0YXRlPW9rKSBkb2Vzbid0IGtlZXBcblx0XHQvLyByZWFkaW5nIGFzIGEgY3VycmVudCBmYWlsdXJlIG9uIHRoZSBwYW5lbC5cblx0XHRpZiAobGFzdEVycm9yICE9PSAnJyAmJiBsZWRDbGFzcyAhPT0gJ29rJykge1xuXHRcdFx0aHRtbCArPSBgPHRyIGNsYXNzPVwiY3RpLXN2Yy1lcnJvci1yb3dcIj48dGQgY29sc3Bhbj1cIiR7Y29sQ291bnR9XCI+YFxuXHRcdFx0XHQrIGA8aSBjbGFzcz1cImV4Y2xhbWF0aW9uIHRyaWFuZ2xlIGljb25cIj48L2k+YFxuXHRcdFx0XHQrIGA8c3BhbiB0aXRsZT1cIiR7ZXNjKGxhc3RFcnJvcil9XCI+JHtlc2Moc2VsZi50cnVuY2F0ZShsYXN0RXJyb3IsIDIwMCkpfTwvc3Bhbj5gXG5cdFx0XHRcdCsgJzwvdGQ+PC90cj4nO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LnQtNC2INGA0LDRgdC/0L7Qu9C+0LbQtdC90LjRjyDRgdC10YDQstC40YHQsDog0Y/RgNC60LjQuSDCq1ZQU8K7INC00LvRjyDQstGL0L3QtdGB0LXQvdC90YvRhSDQutCw0L3QsNC70L7QsiDQuFxuXHQgKiDQv9GA0LjQs9C70YPRiNGR0L3QvdGL0LkgwqvQm9C+0LrQsNC70YzQvdC+wrsg0LTQu9GPINCy0YHQtdCz0L4g0L7RgdGC0LDQu9GM0L3QvtCz0L4uXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBsb2NhdGlvbiAncmVtb3RlJyB8ICdsb2NhbCcgfCB1bmRlZmluZWRcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTFxuXHQgKi9cblx0bG9jYXRpb25CYWRnZShsb2NhdGlvbikge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ3JlbW90ZScpIHtcblx0XHRcdHJldHVybiBgPHNwYW4gY2xhc3M9XCJ1aSB0ZWFsIGxhYmVsIGN0aS1sb2MtYmFkZ2VcIj48aSBjbGFzcz1cImNsb3VkIGljb25cIj48L2k+YFxuXHRcdFx0XHQrIGAke2VzYyhzZWxmLnRyKCdtb2RfY3RpX0xvY2F0aW9uUmVtb3RlJywgJ1ZQUycpKX08L3NwYW4+YDtcblx0XHR9XG5cdFx0aWYgKGxvY2F0aW9uID09PSAnbG9jYWwnKSB7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwiY3RpLWxvYy1sb2NhbFwiPjxpIGNsYXNzPVwiaG9tZSBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvbkxvY2FsJywgJ0xvY2FsJykpfTwvc3Bhbj5gO1xuXHRcdH1cblx0XHRyZXR1cm4gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQmtCw0L3QvtC90LjQt9Cw0YbQuNGPINGB0LLQvtCx0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YHQvtGB0YLQvtGP0L3QuNGPINCyINC40LfQstC10YHRgtC90YvQuSDQutC70Y7RhyDQtNC70Y8g0LvQsNC80L/QvtGH0LrQuCDQuFxuXHQgKiDQv9C10YDQtdCy0L7QtNCwLiBtb25pdG9yZCDQvNC+0LbQtdGCINC/0YDQuNGB0YvQu9Cw0YLRjCDCq2F3YWl0aW5nIGF1dGhvcml6YXRpb24gY29kZcK7INC4INC/0YAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0Y2Fub25TdGF0ZShzdGF0ZSkge1xuXHRcdGNvbnN0IHMgPSBTdHJpbmcoc3RhdGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKHMgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gJ3Vua25vd24nO1xuXHRcdH1cblx0XHRpZiAocy5pbmRleE9mKCdxcicpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdxcmNvZGUnO1xuXHRcdH1cblx0XHRpZiAocy5pbmRleE9mKCdhd2FpdGluZycpICE9PSAtMSB8fCBzLmluZGV4T2YoJ3JlYXV0aCcpICE9PSAtMVxuXHRcdFx0fHwgcy5pbmRleE9mKCdhdXRoX3JlcXVpcmVkJykgIT09IC0xIHx8IHMuaW5kZXhPZignMmZhJykgIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gJ3JlYXV0aCc7XG5cdFx0fVxuXHRcdGlmIChzID09PSAnYXV0aGVudGljYXRlZCcpIHtcblx0XHRcdHJldHVybiAnYXV0aGVudGljYXRlZCc7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQpdC10LvQv9C10YAg0L/QtdGA0LXQstC+0LTQsCDRgSDRhNC+0LvQsdGN0LrQvtC8LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30ga2V5INC60LvRjtGHIGdsb2JhbFRyYW5zbGF0ZVxuXHQgKiBAcGFyYW0ge3N0cmluZ30gZmFsbGJhY2sg0LfQvdCw0YfQtdC90LjQtSDQv9C+INGD0LzQvtC70YfQsNC90LjRjlxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0dHIoa2V5LCBmYWxsYmFjaykge1xuXHRcdGlmICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVba2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCn0LXQu9C+0LLQtdC60L7Rh9C40YLQsNC10LzQvtC1INC40LzRjyDRgdC10YDQstC40YHQsC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHNlcnZpY2VMYWJlbChuYW1lKSB7XG5cdFx0Y29uc3QgbWFwID0ge1xuXHRcdFx0bW9uaXRvcmQ6ICdtb2RfY3RpX3N2Y19tb25pdG9yZCcsXG5cdFx0XHRuYXRzOiAnbW9kX2N0aV9zdmNfbmF0cycsXG5cdFx0XHQnY3JtLTFjJzogJ21vZF9jdGlfc3ZjX2NybScsXG5cdFx0XHRhdXRoOiAnbW9kX2N0aV9zdmNfYXV0aCcsXG5cdFx0XHRwcm94eTogJ21vZF9jdGlfc3ZjX3Byb3h5Jyxcblx0XHRcdCdhbWktbGlzdGVuZXInOiAnbW9kX2N0aV9zdmNfYW1pJyxcblx0XHRcdGNoYXRzOiAnbW9kX2N0aV9zdmNfY2hhdHMnLFxuXHRcdFx0dGc6ICdtb2RfY3RpX3N2Y190ZycsXG5cdFx0XHRtYXg6ICdtb2RfY3RpX3N2Y19tYXgnLFxuXHRcdFx0J21hbmFnZXIuYXBpJzogJ21vZF9jdGlfc3ZjX21hbmFnZXJfYXBpJyxcblx0XHRcdCdyZW1vdGUtdHVubmVsJzogJ21vZF9jdGlfc3ZjX3JlbW90ZV90dW5uZWwnLFxuXHRcdH07XG5cdFx0Y29uc3Qga2V5ID0gbWFwW25hbWVdO1xuXHRcdGlmIChrZXkgJiYgdHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIG5hbWUgfHwgJ3Vua25vd24nO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBzdGF0ZSDQutCw0L3QsNC70LAv0YHQtdGA0LLQuNGB0LAgKNC90LDQv9GA0LjQvNC10YAgwqvQn9C+0LTQutC70Y7Rh9GR0L3Cuyxcblx0ICogwqvQotGA0LXQsdGD0LXRgiDQsNCy0YLQvtGA0LjQt9Cw0YbQuNC4wrspLiDQodC90LDRh9Cw0LvQsCDQuNGJ0LXQvCDRgtC+0YfQvdGL0Lkg0LrQu9GO0YcsINC30LDRgtC10Lwg0L/QviDQutCw0L3QvtC90LjRh9C10YHQutC+0LzRg1xuXHQgKiDRgdC+0YHRgtC+0Y/QvdC40Y4sINC30LDRgtC10Lwg4oCUINCw0L3Qs9C70LjQudGB0LrQuNC5INGE0L7Qu9Cx0Y3Quiwg0Lgg0LIg0LrRgNCw0LnQvdC10Lwg0YHQu9GD0YfQsNC1INC40YHRhdC+0LTQvdGD0Y4g0YHRgtGA0L7QutGDLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHN0YXRlVGV4dChzdGF0ZSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgcmF3ID0gU3RyaW5nKHN0YXRlIHx8ICcnKTtcblx0XHQvLyDQotC+0YfQvdGL0Lkg0LrQu9GO0Ycg0L/QvtC0INC40YHRhdC+0LTQvdC+0LUg0YHQvtGB0YLQvtGP0L3QuNC1ICjQvdCwINGB0LvRg9GH0LDQuSDRgdC/0LXRhtC40YTQuNGH0L3Ri9GFINC/0LXRgNC10LLQvtC00L7QsikuXG5cdFx0Y29uc3QgZXhhY3RLZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke3Jhd31gO1xuXHRcdGlmICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVbZXhhY3RLZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2V4YWN0S2V5XTtcblx0XHR9XG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUocmF3KTtcblx0XHRjb25zdCBjYW5vbktleSA9IGBtb2RfY3RpX3N0YXRlXyR7Y2Fub259YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2Nhbm9uS2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV07XG5cdFx0fVxuXHRcdGNvbnN0IGZhbGxiYWNrID0ge1xuXHRcdFx0b2s6ICdPSycsXG5cdFx0XHRhdXRoZW50aWNhdGVkOiAnQXV0aGVudGljYXRlZCcsXG5cdFx0XHRlcnJvcjogJ0Vycm9yJyxcblx0XHRcdHVua25vd246ICdVbmtub3duJyxcblx0XHRcdHBlbmRpbmc6ICdQZW5kaW5nJyxcblx0XHRcdHN0YXJ0aW5nOiAnU3RhcnRpbmcnLFxuXHRcdFx0cXJjb2RlOiAnQXdhaXRpbmcgUVItY29kZSBhdXRob3JpemF0aW9uJyxcblx0XHRcdHJlYXV0aDogJ0F1dGhvcml6YXRpb24gcmVxdWlyZWQnLFxuXHRcdH07XG5cdFx0cmV0dXJuIGZhbGxiYWNrW2Nhbm9uXSB8fCByYXc7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCa0L7RgNC+0YLQutC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgYXJlYS1HVUlEIOKAlCDQv9C10YDQstGL0LUgOCDRgdC40LzQstC+0LvQvtCyLlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gYXJlYVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0c2hvcnRBcmVhKGFyZWEpIHtcblx0XHRpZiAodHlwZW9mIGFyZWEgIT09ICdzdHJpbmcnIHx8IGFyZWEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChhcmVhLmxlbmd0aCA8PSAxMikge1xuXHRcdFx0cmV0dXJuIGFyZWE7XG5cdFx0fVxuXHRcdHJldHVybiBgJHthcmVhLnN1YnN0cmluZygwLCA4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQo9GB0LXRh9C10L3QuNC1INGB0YLRgNC+0LrQuC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0clxuXHQgKiBAcGFyYW0ge251bWJlcn0gbWF4XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHR0cnVuY2F0ZShzdHIsIG1heCkge1xuXHRcdGlmICh0eXBlb2Ygc3RyICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAoc3RyLmxlbmd0aCA8PSBtYXgpIHtcblx0XHRcdHJldHVybiBzdHI7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtzdHIuc3Vic3RyaW5nKDAsIG1heCl94oCmYDtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC30L7Qv9Cw0YHQvdGL0Lkg0Y3QutGA0LDQvdC10YAgSFRNTC5cblx0ICpcblx0ICogQHBhcmFtIHsqfSB2YWx1ZVxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxuXHQgKi9cblx0ZXNjYXBlSHRtbCh2YWx1ZSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBTdHJpbmcodmFsdWUpXG5cdFx0XHQucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuXHRcdFx0LnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuXHRcdFx0LnJlcGxhY2UoLz4vZywgJyZndDsnKVxuXHRcdFx0LnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuXHRcdFx0LnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCe0LHQvdC+0LLQu9C10L3QuNC1INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyAo0LHQtdC50LTQtiDQsiDQv9GA0LDQstC+0Lwg0LLQtdGA0YXQvdC10Lwg0YPQs9C70YMpLlxuXHQgKlxuXHQgKiBAcGFyYW0gc3RhdHVzXG5cdCAqL1xuXHRjaGFuZ2VTdGF0dXMoc3RhdHVzKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdC5yZW1vdmVDbGFzcygnZ3JleScpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ3llbGxvdycpXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2dyZWVuJylcblx0XHRcdC5yZW1vdmVDbGFzcygncmVkJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGVkJzpcblx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRtb2R1bGVTdGF0dXNcblx0XHRcdFx0XHQuYWRkQ2xhc3MoJ2dyZWVuJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9EaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25Qcm9ncmVzcyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzfWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdCc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvbldhaXR9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNFcnJvcic6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd5ZWxsb3cnKVxuXHRcdFx0XHRcdC5odG1sKGA8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPiR7Z2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfQ29ubmVjdGlvblRvMUNFcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdDb25uZWN0aW9uRXJyb3InOlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcn1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kbW9kdWxlU3RhdHVzXG5cdFx0XHRcdFx0LmFkZENsYXNzKCdncmV5Jylcblx0XHRcdFx0XHQuaHRtbChgPGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT4ke2dsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1VwZGF0ZVN0YXR1c31gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJG1vZHVsZVN0YXR1c1xuXHRcdFx0XHRcdC5hZGRDbGFzcygncmVkJylcblx0XHRcdFx0XHQuaHRtbChnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9Db25uZWN0aW9uRXJyb3IpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH0sXG59O1xuIl19