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
  $moduleStatus: $('#cti-status-summary'),
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
    connected: 'ok',
    waiting_1c: 'warn',
    connecting_1c: 'warn',
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
            moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(null);
            return;
          } // Render services status panel for both success and partial responses.


          moduleCTIClientConnectionCheckWorker.renderServicesStatus(response.data);
          moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(response.data); // Debug JSON pane (legacy debug tab).

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
          var data = response && response.data ? response.data : null;
          var statuses = data && Array.isArray(data.statuses) ? data.statuses : null;

          if (!statuses) {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
            return;
          } // Module startup grace: the backend has already downgraded any
          // hard error to "starting" while the stack boots, so show one
          // calm progress badge and never escalate to a failure here —
          // this is what keeps the first ~2 minutes free of false reds.


          if (data.startup_grace === true) {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
            return;
          } // Classify the response by the worst non-system state.
          // crm-1c is special: it's the 1C bridge — its own error label.
          // Alongside the booleans, collect deduped human service names
          // (by label) for each bucket so the summary line can NAME the
          // services that are failing or stuck instead of a bare colour.


          var self = moduleCTIClientConnectionCheckWorker;
          var crm1c = null;
          var hasError = false;
          var hasStarting = false;
          var errNames = {};
          var startNames = {};
          statuses.forEach(function (s) {
            if (!s || typeof s.name === 'undefined') return;
            if (s.name === 'crm-1c') crm1c = s.state;

            if (s.state === 'error' || s.state === 'fail' || s.state === 'failed' || s.state === 'down' || s.state === 'stopped') {
              hasError = true;
              errNames[self.serviceLabel(s.name)] = true;
            }

            if (s.state === 'starting' || s.state === 'pending' || s.state === 'unknown') {
              hasStarting = true;
              startNames[self.serviceLabel(s.name)] = true;
            }
          });
          var errorList = Object.keys(errNames);
          var startList = Object.keys(startNames); // Severity order: a genuine red failure (incl. a crm-1c bridge
          // daemon that is actually down — it stays 'error') wins the
          // headline so it is never masked by a calmer message. Then the
          // 1C bridge's mode-aware "no live session yet" states (from
          // refineCrmStatus: connecting_1c / waiting_1c) — always a calm
          // yellow, never red. Then generic startup progress.

          if (hasError) {
            self.changeStatus('ConnectionError', {
              names: errorList
            });
          } else if (crm1c === 'waiting_1c') {
            self.changeStatus('ConnectionTo1CWaiting');
          } else if (crm1c === 'connecting_1c') {
            self.changeStatus('ConnectionTo1CConnecting');
          } else if (hasStarting) {
            // Still starting: show progress until we give up after 10
            // failed polls, then treat the stuck daemon as an error
            // instead of falsely reporting it as Connected.
            if (self.errorCounts < 10) {
              self.changeStatus('ConnectionProgress', {
                count: startList.length
              });
            } else {
              self.changeStatus('ConnectionError', {
                names: startList
              });
            }
          } else {
            self.changeStatus('Connected');
          }
        }
      });
    } else {
      moduleCTIClientConnectionCheckWorker.errorCounts = 0;
      moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(null);
      moduleCTIClientConnectionCheckWorker.changeStatus('Disabled');
      moduleCTIClientConnectionCheckWorker.renderDisabledPanel();
    }
  },

  /**
   * Сообщить форме настроек, что remote/VPS поля нужно заблокировать или разблокировать.
   *
   * @param {Object|null} data Ответ API check.
   */
  notifyRemoteMigrationLock: function notifyRemoteMigrationLock(data) {
    var active = data && data.remote_migration_active === true;
    var services = data && Array.isArray(data.remote_migration_services) ? data.remote_migration_services : [];
    window.dispatchEvent(new CustomEvent('RemoteMigrationLockChanged', {
      detail: {
        active: active,
        services: services
      }
    }));
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
    // debugging). Surface it to the operator ONLY when the service is actually
    // in a red error state. A recovered glitch (state=ok) or a service still
    // starting/warming up (state=starting -> warn LED, incl. the startup grace
    // window) must NOT print stale error text — otherwise we'd be reporting a
    // service failure in the first minute, which is exactly what we suppress.

    if (lastError !== '' && ledClass === 'error') {
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
      connected: 'Connected to 1C',
      waiting_1c: 'Waiting for 1C to connect',
      connecting_1c: 'Connecting to 1C…',
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
   * Обновление общего статуса модуля — строка-сводка вверху вкладки «Статус»
   * (заменила прежний угловой бейдж #status). Рисует цветную лампочку + текст;
   * для красного состояния может НАЗВАТЬ конкретные проблемные сервисы, а для
   * прогресса — показать их количество.
   *
   * @param {string} status ключ состояния
   * @param {{names?: string[], count?: number}} [info] доп. данные для текста
   */
  changeStatus: function changeStatus(status, info) {
    var self = moduleCTIClientConnectionCheckWorker;
    var $s = self.$moduleStatus;

    if (!$s || $s.length === 0) {
      return;
    }

    var data = info || {};
    var esc = self.escapeHtml;
    var spinner = '<i class="spinner loading icon"></i>';

    var tr = function tr(key, fallback) {
      return self.tr(key, fallback);
    };

    var cls = 'cti-summary-grey';
    var led = 'unknown';
    var icon = '';
    var text = '';

    switch (status) {
      case 'Connected':
        cls = 'cti-summary-green';
        led = 'ok';
        text = tr('mod_cti_Connected', 'The module works successfully');
        break;

      case 'ConnectionProgress':
        {
          cls = 'cti-summary-yellow';
          led = 'warn';
          icon = spinner;
          var progress = tr('mod_cti_ConnectionProgress', 'Module services are starting');

          if (data.count && data.count > 0) {
            progress += " (".concat(data.count, ")");
          }

          text = progress;
          break;
        }

      case 'ConnectionTo1CWaiting':
        // longpool: 1C connects to us; we are waiting for it.
        cls = 'cti-summary-yellow';
        led = 'warn';
        icon = spinner;
        text = tr('mod_cti_state_waiting_1c', 'Waiting for 1C to connect');
        break;

      case 'ConnectionTo1CConnecting':
        // webservice: we are reaching out to 1C.
        cls = 'cti-summary-yellow';
        led = 'warn';
        icon = spinner;
        text = tr('mod_cti_state_connecting_1c', 'Connecting to 1C…');
        break;

      case 'ConnectionError':
        {
          cls = 'cti-summary-red';
          led = 'error';
          var names = Array.isArray(data.names) ? data.names.filter(Boolean) : [];

          if (names.length > 0) {
            text = "".concat(tr('mod_cti_StatusProblem', 'Problem'), ": ").concat(names.join(', '));
          } else {
            text = tr('mod_cti_ConnectionError', 'Failure');
          }

          break;
        }

      case 'Disabled':
        cls = 'cti-summary-grey';
        led = 'unknown';
        text = tr('mod_cti_StatusModuleDisabled', 'Module is disabled');
        break;

      case 'Disconnected':
        cls = 'cti-summary-grey';
        led = 'unknown';
        text = tr('mod_cti_Disconnected', 'Disconnected');
        break;

      case 'Updating':
        cls = 'cti-summary-grey';
        led = 'unknown';
        icon = spinner;
        text = tr('mod_cti_UpdateStatus', 'Updating status…');
        break;

      default:
        cls = 'cti-summary-red';
        led = 'error';
        text = tr('mod_cti_ConnectionError', 'Failure');
        break;
    }

    $s.removeClass('cti-summary-grey cti-summary-green cti-summary-yellow cti-summary-red').addClass(cls).html("<span class=\"cti-summary-led ".concat(esc(led), "\"></span>") + "<span class=\"cti-summary-text\">".concat(icon).concat(esc(text), "</span>"));
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJjb25uZWN0ZWQiLCJ3YWl0aW5nXzFjIiwiY29ubmVjdGluZ18xYyIsImVycm9yIiwiZmFpbCIsImZhaWxlZCIsImRvd24iLCJzdG9wcGVkIiwidW5rbm93biIsInBlbmRpbmciLCJzdGFydGluZyIsInFyY29kZSIsInJlYXV0aCIsImF1dGgiLCJhdXRoX3JlcXVpcmVkIiwid2FybiIsIndhcm5pbmciLCJtdWx0aUluc3RhbmNlU2VydmljZXMiLCJjaGF0cyIsInRnIiwibWF4IiwiaW5pdGlhbGl6ZSIsInJlc3RhcnRXb3JrZXIiLCJjaGFuZ2VTdGF0dXMiLCJ3aW5kb3ciLCJjbGVhclRpbWVvdXQiLCJ3b3JrZXIiLCJjaGVja2JveCIsImFwaSIsInVybCIsIkNvbmZpZyIsInBieFVybCIsIm9uIiwic3VjY2Vzc1Rlc3QiLCJQYnhBcGkiLCJvbkNvbXBsZXRlIiwic2V0VGltZW91dCIsIm9uUmVzcG9uc2UiLCJyZXNwb25zZSIsInJlbW92ZSIsImRhdGEiLCJub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJzdGFydHVwX2dyYWNlIiwic2VsZiIsImNybTFjIiwiaGFzRXJyb3IiLCJoYXNTdGFydGluZyIsImVyck5hbWVzIiwic3RhcnROYW1lcyIsImZvckVhY2giLCJzIiwibmFtZSIsInN0YXRlIiwic2VydmljZUxhYmVsIiwiZXJyb3JMaXN0Iiwic3RhcnRMaXN0IiwibmFtZXMiLCJjb3VudCIsInJlbmRlckRpc2FibGVkUGFuZWwiLCJhY3RpdmUiLCJyZW1vdGVfbWlncmF0aW9uX2FjdGl2ZSIsInNlcnZpY2VzIiwicmVtb3RlX21pZ3JhdGlvbl9zZXJ2aWNlcyIsImRpc3BhdGNoRXZlbnQiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIiRwYW5lbCIsImxhYmVsIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCIsIiRyb3dzIiwiJHBsYWNlaG9sZGVyIiwiZW1wdHkiLCJodG1sIiwiZXNjYXBlSHRtbCIsInNob3ciLCJlc2MiLCJzaG93UGxhY2Vob2xkZXIiLCJ0ZXh0IiwidHIiLCJoYXNoIiwiY2hpbGRyZW4iLCJoaWRlIiwiZ3JvdXBzIiwib3JkZXIiLCJzdmMiLCJwdXNoIiwiaGFzUmVtb3RlIiwic29tZSIsImxvY2F0aW9uIiwiY29sQ291bnQiLCJoZWFkIiwiYm9keSIsInJvd3MiLCJpc011bHRpIiwicmVuZGVyU2VydmljZVJvdyIsImpvaW4iLCJncm91cGVkIiwic3RhdGVSYXciLCJjYW5vbiIsImNhbm9uU3RhdGUiLCJsZWRDbGFzcyIsInN0YXRlVGV4dCIsImRpc3BsYXlOYW1lIiwic2hvcnRBcmVhIiwiYXJlYSIsIm5hbWVJY29uIiwidXB0aW1lIiwidmVyc2lvbiIsImxhc3RFcnJvciIsImxhc3RfZXJyb3IiLCJkYXNoIiwic3RhdHVzQ2VsbCIsIm5hbWVDZWxsIiwibG9jQ2VsbCIsImxvY2F0aW9uQmFkZ2UiLCJjZWxscyIsInRydW5jYXRlIiwiU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJpbmRleE9mIiwia2V5IiwiZmFsbGJhY2siLCJtYXAiLCJtb25pdG9yZCIsIm5hdHMiLCJwcm94eSIsInJhdyIsImV4YWN0S2V5IiwiY2Fub25LZXkiLCJzdWJzdHJpbmciLCJzdHIiLCJ2YWx1ZSIsInN0YXR1cyIsImluZm8iLCIkcyIsInNwaW5uZXIiLCJjbHMiLCJsZWQiLCJpY29uIiwicHJvZ3Jlc3MiLCJmaWx0ZXIiLCJCb29sZWFuIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsSUFBTUEsb0NBQW9DLEdBQUc7QUFDNUNDLEVBQUFBLFFBQVEsRUFBRUMsQ0FBQyxDQUFDLHlCQUFELENBRGlDO0FBRTVDQyxFQUFBQSxhQUFhLEVBQUVELENBQUMsQ0FBQyx1QkFBRCxDQUY0QjtBQUc1Q0UsRUFBQUEsaUJBQWlCLEVBQUVGLENBQUMsQ0FBQywwQkFBRCxDQUh3QjtBQUk1Q0csRUFBQUEsWUFBWSxFQUFFSCxDQUFDLENBQUMsb0JBQUQsQ0FKNkI7QUFLNUNJLEVBQUFBLGFBQWEsRUFBRUosQ0FBQyxDQUFDLHFCQUFELENBTDRCO0FBTTVDSyxFQUFBQSxhQUFhLEVBQUVMLENBQUMsQ0FBQyxlQUFELENBTjRCO0FBTzVDTSxFQUFBQSxVQUFVLEVBQUVOLENBQUMsQ0FBQyx5Q0FBRCxDQVArQjtBQVE1Q08sRUFBQUEsZUFBZSxFQUFFUCxDQUFDLENBQUMsc0JBQUQsQ0FSMEI7QUFTNUNRLEVBQUFBLE9BQU8sRUFBRSxJQVRtQztBQVU1Q0MsRUFBQUEsYUFBYSxFQUFFLEVBVjZCO0FBVzVDQyxFQUFBQSxXQUFXLEVBQUUsQ0FYK0I7QUFZNUNDLEVBQUFBLGNBQWMsRUFBRSxFQVo0Qjs7QUFjNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQ0MsRUFBQUEsYUFBYSxFQUFFO0FBQ2RDLElBQUFBLEVBQUUsRUFBRSxJQURVO0FBRWRDLElBQUFBLGFBQWEsRUFBRSxJQUZEO0FBR2RDLElBQUFBLFNBQVMsRUFBRSxJQUhHO0FBSWRDLElBQUFBLFVBQVUsRUFBRSxNQUpFO0FBS2RDLElBQUFBLGFBQWEsRUFBRSxNQUxEO0FBTWRDLElBQUFBLEtBQUssRUFBRSxPQU5PO0FBT2RDLElBQUFBLElBQUksRUFBRSxPQVBRO0FBUWRDLElBQUFBLE1BQU0sRUFBRSxPQVJNO0FBU2RDLElBQUFBLElBQUksRUFBRSxPQVRRO0FBVWRDLElBQUFBLE9BQU8sRUFBRSxPQVZLO0FBV2RDLElBQUFBLE9BQU8sRUFBRSxTQVhLO0FBWWRDLElBQUFBLE9BQU8sRUFBRSxNQVpLO0FBYWRDLElBQUFBLFFBQVEsRUFBRSxNQWJJO0FBY2RDLElBQUFBLE1BQU0sRUFBRSxNQWRNO0FBZWRDLElBQUFBLE1BQU0sRUFBRSxNQWZNO0FBZ0JkQyxJQUFBQSxJQUFJLEVBQUUsTUFoQlE7QUFpQmRDLElBQUFBLGFBQWEsRUFBRSxNQWpCRDtBQWtCZEMsSUFBQUEsSUFBSSxFQUFFLE1BbEJRO0FBbUJkQyxJQUFBQSxPQUFPLEVBQUU7QUFuQkssR0FsQjZCOztBQXdDNUM7QUFDRDtBQUNBO0FBQ0NDLEVBQUFBLHFCQUFxQixFQUFFO0FBQ3RCQyxJQUFBQSxLQUFLLEVBQUUsSUFEZTtBQUV0QkMsSUFBQUEsRUFBRSxFQUFFLElBRmtCO0FBR3RCQyxJQUFBQSxHQUFHLEVBQUU7QUFIaUIsR0EzQ3FCO0FBaUQ1Q0MsRUFBQUEsVUFqRDRDLHdCQWlEL0I7QUFDWnRDLElBQUFBLG9DQUFvQyxDQUFDdUMsYUFBckM7QUFDQSxHQW5EMkM7QUFxRDVDQSxFQUFBQSxhQXJENEMsMkJBcUQ1QjtBQUNmdkMsSUFBQUEsb0NBQW9DLENBQUNZLFdBQXJDLEdBQW1ELENBQW5EO0FBQ0FaLElBQUFBLG9DQUFvQyxDQUFDd0MsWUFBckMsQ0FBa0QsVUFBbEQ7QUFDQUMsSUFBQUEsTUFBTSxDQUFDQyxZQUFQLENBQW9CMUMsb0NBQW9DLENBQUNXLGFBQXpEO0FBQ0FYLElBQUFBLG9DQUFvQyxDQUFDMkMsTUFBckM7QUFDQSxHQTFEMkM7QUE0RDVDQSxFQUFBQSxNQTVENEMsb0JBNERuQztBQUNSLFFBQUkzQyxvQ0FBb0MsQ0FBQ0csYUFBckMsQ0FBbUR5QyxRQUFuRCxDQUE0RCxZQUE1RCxDQUFKLEVBQStFO0FBQzlFMUMsTUFBQUEsQ0FBQyxDQUFDMkMsR0FBRixDQUFNO0FBQ0xDLFFBQUFBLEdBQUcsWUFBS0MsTUFBTSxDQUFDQyxNQUFaLCtDQURFO0FBRUxDLFFBQUFBLEVBQUUsRUFBRSxLQUZDO0FBR0xDLFFBQUFBLFdBQVcsRUFBRUMsTUFBTSxDQUFDRCxXQUhmO0FBSUxFLFFBQUFBLFVBSkssd0JBSVE7QUFDWnBELFVBQUFBLG9DQUFvQyxDQUFDVyxhQUFyQyxHQUFxRDhCLE1BQU0sQ0FBQ1ksVUFBUCxDQUNwRHJELG9DQUFvQyxDQUFDMkMsTUFEZSxFQUVwRDNDLG9DQUFvQyxDQUFDVSxPQUZlLENBQXJEO0FBSUEsU0FUSTtBQVVMNEMsUUFBQUEsVUFWSyxzQkFVTUMsUUFWTixFQVVnQjtBQUNwQnJELFVBQUFBLENBQUMsQ0FBQyxlQUFELENBQUQsQ0FBbUJzRCxNQUFuQjs7QUFDQSxjQUFJLE9BQVFELFFBQVEsQ0FBQ0UsSUFBakIsS0FBMkIsV0FBL0IsRUFBNEM7QUFDM0N6RCxZQUFBQSxvQ0FBb0MsQ0FBQzBELHlCQUFyQyxDQUErRCxJQUEvRDtBQUNBO0FBQ0EsV0FMbUIsQ0FPcEI7OztBQUNBMUQsVUFBQUEsb0NBQW9DLENBQUMyRCxvQkFBckMsQ0FBMERKLFFBQVEsQ0FBQ0UsSUFBbkU7QUFDQXpELFVBQUFBLG9DQUFvQyxDQUFDMEQseUJBQXJDLENBQStESCxRQUFRLENBQUNFLElBQXhFLEVBVG9CLENBV3BCOztBQUNBLGNBQUlHLGlCQUFpQixHQUFHQyxJQUFJLENBQUNDLFNBQUwsQ0FBZVAsUUFBUSxDQUFDRSxJQUF4QixFQUE4QixJQUE5QixFQUFvQyxDQUFwQyxDQUF4Qjs7QUFDQSxjQUFJLE9BQU9HLGlCQUFQLEtBQTZCLFFBQWpDLEVBQTJDO0FBQzFDQSxZQUFBQSxpQkFBaUIsR0FBR0EsaUJBQWlCLENBQUNHLE9BQWxCLENBQTBCLEtBQTFCLEVBQWlDLE9BQWpDLENBQXBCOztBQUNBLGdCQUFJQyxNQUFNLENBQUNDLElBQVAsQ0FBWVYsUUFBWixFQUFzQlcsTUFBdEIsR0FBK0IsQ0FBL0IsSUFBb0NYLFFBQVEsQ0FBQ1ksTUFBVCxLQUFvQixJQUE1RCxFQUFrRTtBQUNqRW5FLGNBQUFBLG9DQUFvQyxDQUFDUSxVQUFyQyxDQUNFNEQsS0FERixrR0FFd0NSLGlCQUZ4QztBQUlBLGFBTEQsTUFLTztBQUNONUQsY0FBQUEsb0NBQW9DLENBQUNRLFVBQXJDLENBQ0U0RCxLQURGLDJKQUd1Q1IsaUJBSHZDO0FBS0E7QUFDRDtBQUNELFNBdENJO0FBdUNMUyxRQUFBQSxTQXZDSyx1QkF1Q087QUFDWHJFLFVBQUFBLG9DQUFvQyxDQUFDd0MsWUFBckMsQ0FBa0QsV0FBbEQ7QUFDQXhDLFVBQUFBLG9DQUFvQyxDQUFDWSxXQUFyQyxHQUFtRCxDQUFuRDtBQUNBNkIsVUFBQUEsTUFBTSxDQUFDQyxZQUFQLENBQW9CMUMsb0NBQW9DLENBQUNXLGFBQXpEO0FBQ0EsU0EzQ0k7QUE0Q0wyRCxRQUFBQSxTQTVDSyxxQkE0Q0tmLFFBNUNMLEVBNENlO0FBQ25CdkQsVUFBQUEsb0NBQW9DLENBQUNZLFdBQXJDLElBQW9ELENBQXBEO0FBQ0EsY0FBTTZDLElBQUksR0FBSUYsUUFBUSxJQUFJQSxRQUFRLENBQUNFLElBQXRCLEdBQThCRixRQUFRLENBQUNFLElBQXZDLEdBQThDLElBQTNEO0FBQ0EsY0FBTWMsUUFBUSxHQUFJZCxJQUFJLElBQUllLEtBQUssQ0FBQ0MsT0FBTixDQUFjaEIsSUFBSSxDQUFDYyxRQUFuQixDQUFULEdBQ2RkLElBQUksQ0FBQ2MsUUFEUyxHQUNFLElBRG5COztBQUVBLGNBQUksQ0FBQ0EsUUFBTCxFQUFlO0FBQ2R2RSxZQUFBQSxvQ0FBb0MsQ0FBQ3dDLFlBQXJDLENBQWtELGlCQUFsRDtBQUNBO0FBQ0EsV0FSa0IsQ0FTbkI7QUFDQTtBQUNBO0FBQ0E7OztBQUNBLGNBQUlpQixJQUFJLENBQUNpQixhQUFMLEtBQXVCLElBQTNCLEVBQWlDO0FBQ2hDMUUsWUFBQUEsb0NBQW9DLENBQUN3QyxZQUFyQyxDQUFrRCxvQkFBbEQ7QUFDQTtBQUNBLFdBaEJrQixDQWlCbkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0EsY0FBTW1DLElBQUksR0FBRzNFLG9DQUFiO0FBQ0EsY0FBSTRFLEtBQUssR0FBRyxJQUFaO0FBQ0EsY0FBSUMsUUFBUSxHQUFHLEtBQWY7QUFDQSxjQUFJQyxXQUFXLEdBQUcsS0FBbEI7QUFDQSxjQUFNQyxRQUFRLEdBQUcsRUFBakI7QUFDQSxjQUFNQyxVQUFVLEdBQUcsRUFBbkI7QUFDQVQsVUFBQUEsUUFBUSxDQUFDVSxPQUFULENBQWlCLFVBQUNDLENBQUQsRUFBTztBQUN2QixnQkFBSSxDQUFDQSxDQUFELElBQU0sT0FBT0EsQ0FBQyxDQUFDQyxJQUFULEtBQWtCLFdBQTVCLEVBQXlDO0FBQ3pDLGdCQUFJRCxDQUFDLENBQUNDLElBQUYsS0FBVyxRQUFmLEVBQXlCUCxLQUFLLEdBQUdNLENBQUMsQ0FBQ0UsS0FBVjs7QUFDekIsZ0JBQUlGLENBQUMsQ0FBQ0UsS0FBRixLQUFZLE9BQVosSUFBdUJGLENBQUMsQ0FBQ0UsS0FBRixLQUFZLE1BQW5DLElBQTZDRixDQUFDLENBQUNFLEtBQUYsS0FBWSxRQUF6RCxJQUNBRixDQUFDLENBQUNFLEtBQUYsS0FBWSxNQURaLElBQ3NCRixDQUFDLENBQUNFLEtBQUYsS0FBWSxTQUR0QyxFQUNpRDtBQUNoRFAsY0FBQUEsUUFBUSxHQUFHLElBQVg7QUFDQUUsY0FBQUEsUUFBUSxDQUFDSixJQUFJLENBQUNVLFlBQUwsQ0FBa0JILENBQUMsQ0FBQ0MsSUFBcEIsQ0FBRCxDQUFSLEdBQXNDLElBQXRDO0FBQ0E7O0FBQ0QsZ0JBQUlELENBQUMsQ0FBQ0UsS0FBRixLQUFZLFVBQVosSUFBMEJGLENBQUMsQ0FBQ0UsS0FBRixLQUFZLFNBQXRDLElBQ0FGLENBQUMsQ0FBQ0UsS0FBRixLQUFZLFNBRGhCLEVBQzJCO0FBQzFCTixjQUFBQSxXQUFXLEdBQUcsSUFBZDtBQUNBRSxjQUFBQSxVQUFVLENBQUNMLElBQUksQ0FBQ1UsWUFBTCxDQUFrQkgsQ0FBQyxDQUFDQyxJQUFwQixDQUFELENBQVYsR0FBd0MsSUFBeEM7QUFDQTtBQUNELFdBYkQ7QUFjQSxjQUFNRyxTQUFTLEdBQUd0QixNQUFNLENBQUNDLElBQVAsQ0FBWWMsUUFBWixDQUFsQjtBQUNBLGNBQU1RLFNBQVMsR0FBR3ZCLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZZSxVQUFaLENBQWxCLENBM0NtQixDQTRDbkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLGNBQUlILFFBQUosRUFBYztBQUNiRixZQUFBQSxJQUFJLENBQUNuQyxZQUFMLENBQWtCLGlCQUFsQixFQUFxQztBQUFFZ0QsY0FBQUEsS0FBSyxFQUFFRjtBQUFULGFBQXJDO0FBQ0EsV0FGRCxNQUVPLElBQUlWLEtBQUssS0FBSyxZQUFkLEVBQTRCO0FBQ2xDRCxZQUFBQSxJQUFJLENBQUNuQyxZQUFMLENBQWtCLHVCQUFsQjtBQUNBLFdBRk0sTUFFQSxJQUFJb0MsS0FBSyxLQUFLLGVBQWQsRUFBK0I7QUFDckNELFlBQUFBLElBQUksQ0FBQ25DLFlBQUwsQ0FBa0IsMEJBQWxCO0FBQ0EsV0FGTSxNQUVBLElBQUlzQyxXQUFKLEVBQWlCO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBLGdCQUFJSCxJQUFJLENBQUMvRCxXQUFMLEdBQW1CLEVBQXZCLEVBQTJCO0FBQzFCK0QsY0FBQUEsSUFBSSxDQUFDbkMsWUFBTCxDQUFrQixvQkFBbEIsRUFBd0M7QUFBRWlELGdCQUFBQSxLQUFLLEVBQUVGLFNBQVMsQ0FBQ3JCO0FBQW5CLGVBQXhDO0FBQ0EsYUFGRCxNQUVPO0FBQ05TLGNBQUFBLElBQUksQ0FBQ25DLFlBQUwsQ0FBa0IsaUJBQWxCLEVBQXFDO0FBQUVnRCxnQkFBQUEsS0FBSyxFQUFFRDtBQUFULGVBQXJDO0FBQ0E7QUFDRCxXQVRNLE1BU0E7QUFDTlosWUFBQUEsSUFBSSxDQUFDbkMsWUFBTCxDQUFrQixXQUFsQjtBQUNBO0FBQ0Q7QUFoSEksT0FBTjtBQWtIQSxLQW5IRCxNQW1ITztBQUNOeEMsTUFBQUEsb0NBQW9DLENBQUNZLFdBQXJDLEdBQW1ELENBQW5EO0FBQ0FaLE1BQUFBLG9DQUFvQyxDQUFDMEQseUJBQXJDLENBQStELElBQS9EO0FBQ0ExRCxNQUFBQSxvQ0FBb0MsQ0FBQ3dDLFlBQXJDLENBQWtELFVBQWxEO0FBQ0F4QyxNQUFBQSxvQ0FBb0MsQ0FBQzBGLG1CQUFyQztBQUNBO0FBQ0QsR0F0TDJDOztBQXdMNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNDaEMsRUFBQUEseUJBN0w0QyxxQ0E2TGxCRCxJQTdMa0IsRUE2TFo7QUFDL0IsUUFBTWtDLE1BQU0sR0FBR2xDLElBQUksSUFBSUEsSUFBSSxDQUFDbUMsdUJBQUwsS0FBaUMsSUFBeEQ7QUFDQSxRQUFNQyxRQUFRLEdBQUlwQyxJQUFJLElBQUllLEtBQUssQ0FBQ0MsT0FBTixDQUFjaEIsSUFBSSxDQUFDcUMseUJBQW5CLENBQVQsR0FDZHJDLElBQUksQ0FBQ3FDLHlCQURTLEdBQ21CLEVBRHBDO0FBRUFyRCxJQUFBQSxNQUFNLENBQUNzRCxhQUFQLENBQXFCLElBQUlDLFdBQUosQ0FBZ0IsNEJBQWhCLEVBQThDO0FBQ2xFQyxNQUFBQSxNQUFNLEVBQUU7QUFDUE4sUUFBQUEsTUFBTSxFQUFOQSxNQURPO0FBRVBFLFFBQUFBLFFBQVEsRUFBUkE7QUFGTztBQUQwRCxLQUE5QyxDQUFyQjtBQU1BLEdBdk0yQzs7QUF5TTVDO0FBQ0Q7QUFDQTtBQUNDSCxFQUFBQSxtQkE1TTRDLGlDQTRNdEI7QUFDckIsUUFBTWYsSUFBSSxHQUFHM0Usb0NBQWI7QUFDQSxRQUFNa0csTUFBTSxHQUFHdkIsSUFBSSxDQUFDbEUsZUFBcEI7O0FBQ0EsUUFBSSxDQUFDeUYsTUFBRCxJQUFXQSxNQUFNLENBQUNoQyxNQUFQLEtBQWtCLENBQWpDLEVBQW9DO0FBQ25DO0FBQ0E7O0FBQ0QsUUFBTWlDLEtBQUssR0FBSSxPQUFPQyxlQUFQLEtBQTJCLFdBQTNCLElBQ1hBLGVBQWUsQ0FBQ0MsNEJBRE4sR0FFWEQsZUFBZSxDQUFDQyw0QkFGTCxHQUdYLG9CQUhILENBTnFCLENBVXJCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxRQUFNQyxLQUFLLEdBQUdwRyxDQUFDLENBQUMsMkJBQUQsQ0FBZjtBQUNBLFFBQU1xRyxZQUFZLEdBQUdyRyxDQUFDLENBQUMsa0NBQUQsQ0FBdEI7QUFDQXlFLElBQUFBLElBQUksQ0FBQzlELGNBQUwsR0FBc0IsRUFBdEI7O0FBQ0EsUUFBSXlGLEtBQUssQ0FBQ3BDLE1BQU4sR0FBZSxDQUFuQixFQUFzQjtBQUNyQm9DLE1BQUFBLEtBQUssQ0FBQ0UsS0FBTjtBQUNBOztBQUNELFFBQUlELFlBQVksQ0FBQ3JDLE1BQWIsR0FBc0IsQ0FBMUIsRUFBNkI7QUFDNUJxQyxNQUFBQSxZQUFZLENBQUNFLElBQWIsdUJBQWlDOUIsSUFBSSxDQUFDK0IsVUFBTCxDQUFnQlAsS0FBaEIsQ0FBakMsY0FBa0VRLElBQWxFO0FBQ0EsS0FGRCxNQUVPO0FBQ05ULE1BQUFBLE1BQU0sQ0FBQ08sSUFBUCwyQ0FBNkM5QixJQUFJLENBQUMrQixVQUFMLENBQWdCUCxLQUFoQixDQUE3QztBQUNBO0FBQ0QsR0F2TzJDOztBQXlPNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDeEMsRUFBQUEsb0JBalA0QyxnQ0FpUHZCRixJQWpQdUIsRUFpUGpCO0FBQzFCLFFBQU1rQixJQUFJLEdBQUczRSxvQ0FBYjtBQUNBLFFBQU1rRyxNQUFNLEdBQUd2QixJQUFJLENBQUNsRSxlQUFwQjs7QUFDQSxRQUFJLENBQUN5RixNQUFELElBQVdBLE1BQU0sQ0FBQ2hDLE1BQVAsS0FBa0IsQ0FBakMsRUFBb0M7QUFDbkM7QUFDQTs7QUFFRCxRQUFNMEMsR0FBRyxHQUFHakMsSUFBSSxDQUFDK0IsVUFBakI7QUFDQSxRQUFNSixLQUFLLEdBQUdwRyxDQUFDLENBQUMsMkJBQUQsQ0FBZjtBQUNBLFFBQU1xRyxZQUFZLEdBQUdyRyxDQUFDLENBQUMsa0NBQUQsQ0FBdEI7O0FBQ0EsUUFBTTJHLGVBQWUsR0FBRyxTQUFsQkEsZUFBa0IsQ0FBQ0MsSUFBRCxFQUFVO0FBQ2pDbkMsTUFBQUEsSUFBSSxDQUFDOUQsY0FBTCxHQUFzQixFQUF0QjtBQUNBeUYsTUFBQUEsS0FBSyxDQUFDRSxLQUFOOztBQUNBLFVBQUlELFlBQVksQ0FBQ3JDLE1BQWIsR0FBc0IsQ0FBMUIsRUFBNkI7QUFDNUJxQyxRQUFBQSxZQUFZLENBQUNFLElBQWIsdUJBQWlDRyxHQUFHLENBQUNFLElBQUQsQ0FBcEMsY0FBcURILElBQXJEO0FBQ0EsT0FGRCxNQUVPO0FBQ05ULFFBQUFBLE1BQU0sQ0FBQ08sSUFBUCwyQ0FBNkNHLEdBQUcsQ0FBQ0UsSUFBRCxDQUFoRDtBQUNBO0FBQ0QsS0FSRDs7QUFVQSxRQUFNdkMsUUFBUSxHQUFJZCxJQUFJLElBQUlBLElBQUksQ0FBQ2MsUUFBZCxHQUEwQmQsSUFBSSxDQUFDYyxRQUEvQixHQUEwQyxJQUEzRCxDQXBCMEIsQ0FzQjFCOztBQUNBLFFBQUksQ0FBQ0MsS0FBSyxDQUFDQyxPQUFOLENBQWNGLFFBQWQsQ0FBTCxFQUE4QjtBQUM3QixVQUFNdUMsSUFBSSxHQUFJLE9BQU92QyxRQUFQLEtBQW9CLFFBQXJCLEdBQ1ZBLFFBRFUsR0FFVkksSUFBSSxDQUFDb0MsRUFBTCxDQUFRLDJCQUFSLEVBQXFDLG9CQUFyQyxDQUZIO0FBR0FGLE1BQUFBLGVBQWUsQ0FBQ0MsSUFBRCxDQUFmO0FBQ0E7QUFDQSxLQTdCeUIsQ0ErQjFCO0FBQ0E7OztBQUNBLFFBQU1FLElBQUksR0FBR25ELElBQUksQ0FBQ0MsU0FBTCxDQUFlUyxRQUFmLENBQWI7O0FBQ0EsUUFBSXlDLElBQUksS0FBS3JDLElBQUksQ0FBQzlELGNBQWQsSUFBZ0N5RixLQUFLLENBQUNXLFFBQU4sR0FBaUIvQyxNQUFqQixHQUEwQixDQUE5RCxFQUFpRTtBQUNoRSxVQUFJcUMsWUFBWSxDQUFDckMsTUFBYixHQUFzQixDQUExQixFQUE2QjtBQUM1QnFDLFFBQUFBLFlBQVksQ0FBQ1csSUFBYjtBQUNBOztBQUNEO0FBQ0EsS0F2Q3lCLENBeUMxQjs7O0FBQ0EsUUFBTUMsTUFBTSxHQUFHLEVBQWY7QUFDQSxRQUFNQyxLQUFLLEdBQUcsRUFBZDtBQUNBN0MsSUFBQUEsUUFBUSxDQUFDVSxPQUFULENBQWlCLFVBQUNvQyxHQUFELEVBQVM7QUFDekIsVUFBSSxDQUFDQSxHQUFELElBQVEsUUFBT0EsR0FBUCxNQUFlLFFBQTNCLEVBQXFDO0FBQ3BDO0FBQ0E7O0FBQ0QsVUFBTWxDLElBQUksR0FBSSxPQUFPa0MsR0FBRyxDQUFDbEMsSUFBWCxLQUFvQixRQUFwQixJQUFnQ2tDLEdBQUcsQ0FBQ2xDLElBQUosQ0FBU2pCLE1BQVQsR0FBa0IsQ0FBbkQsR0FBd0RtRCxHQUFHLENBQUNsQyxJQUE1RCxHQUFtRSxTQUFoRjs7QUFDQSxVQUFJLENBQUNnQyxNQUFNLENBQUNoQyxJQUFELENBQVgsRUFBbUI7QUFDbEJnQyxRQUFBQSxNQUFNLENBQUNoQyxJQUFELENBQU4sR0FBZSxFQUFmO0FBQ0FpQyxRQUFBQSxLQUFLLENBQUNFLElBQU4sQ0FBV25DLElBQVg7QUFDQTs7QUFDRGdDLE1BQUFBLE1BQU0sQ0FBQ2hDLElBQUQsQ0FBTixDQUFhbUMsSUFBYixDQUFrQkQsR0FBbEI7QUFDQSxLQVZEOztBQVlBLFFBQUlELEtBQUssQ0FBQ2xELE1BQU4sS0FBaUIsQ0FBckIsRUFBd0I7QUFDdkIyQyxNQUFBQSxlQUFlLENBQUNsQyxJQUFJLENBQUNvQyxFQUFMLENBQVEscUJBQVIsRUFBK0Isc0JBQS9CLENBQUQsQ0FBZjtBQUNBO0FBQ0EsS0EzRHlCLENBNkQxQjs7O0FBQ0EsUUFBTVEsU0FBUyxHQUFHaEQsUUFBUSxDQUFDaUQsSUFBVCxDQUFjLFVBQUN0QyxDQUFEO0FBQUEsYUFBT0EsQ0FBQyxJQUFJQSxDQUFDLENBQUN1QyxRQUFGLEtBQWUsUUFBM0I7QUFBQSxLQUFkLENBQWxCO0FBQ0EsUUFBTUMsUUFBUSxHQUFHSCxTQUFTLEdBQUcsQ0FBSCxHQUFPLENBQWpDO0FBRUEsUUFBTUksSUFBSSxHQUFHLHVEQUNvQmYsR0FBRyxDQUFDakMsSUFBSSxDQUFDb0MsRUFBTCxDQUFRLG1CQUFSLEVBQTZCLFFBQTdCLENBQUQsQ0FEdkIsa0RBRWtCSCxHQUFHLENBQUNqQyxJQUFJLENBQUNvQyxFQUFMLENBQVEsb0JBQVIsRUFBOEIsU0FBOUIsQ0FBRCxDQUZyQixjQUdUUSxTQUFTLHVDQUE4QlgsR0FBRyxDQUFDakMsSUFBSSxDQUFDb0MsRUFBTCxDQUFRLHFCQUFSLEVBQStCLFVBQS9CLENBQUQsQ0FBakMsYUFBdUYsRUFIdkYsMkNBSW9CSCxHQUFHLENBQUNqQyxJQUFJLENBQUNvQyxFQUFMLENBQVEsbUJBQVIsRUFBNkIsUUFBN0IsQ0FBRCxDQUp2QixxREFLcUJILEdBQUcsQ0FBQ2pDLElBQUksQ0FBQ29DLEVBQUwsQ0FBUSxvQkFBUixFQUE4QixTQUE5QixDQUFELENBTHhCLGFBTVYsZUFOSDtBQVFBLFFBQU1hLElBQUksR0FBRyxFQUFiO0FBQ0FSLElBQUFBLEtBQUssQ0FBQ25DLE9BQU4sQ0FBYyxVQUFDRSxJQUFELEVBQVU7QUFDdkIsVUFBTTBDLElBQUksR0FBR1YsTUFBTSxDQUFDaEMsSUFBRCxDQUFuQjtBQUNBLFVBQU0yQyxPQUFPLEdBQUduRCxJQUFJLENBQUN6QyxxQkFBTCxDQUEyQmlELElBQTNCLE1BQXFDLElBQXJDLElBQTZDMEMsSUFBSSxDQUFDM0QsTUFBTCxHQUFjLENBQTNFOztBQUNBLFVBQUk0RCxPQUFKLEVBQWE7QUFDWkYsUUFBQUEsSUFBSSxDQUFDTixJQUFMLENBQVUsb0RBQTBDSSxRQUExQyxvREFDeUJkLEdBQUcsQ0FBQ2pDLElBQUksQ0FBQ1UsWUFBTCxDQUFrQkYsSUFBbEIsQ0FBRCxDQUQ1Qiw0Q0FFd0IwQyxJQUFJLENBQUMzRCxNQUY3QixzQkFBVjtBQUdBMkQsUUFBQUEsSUFBSSxDQUFDNUMsT0FBTCxDQUFhLFVBQUNvQyxHQUFELEVBQVM7QUFDckJPLFVBQUFBLElBQUksQ0FBQ04sSUFBTCxDQUFVM0MsSUFBSSxDQUFDb0QsZ0JBQUwsQ0FBc0JWLEdBQXRCLEVBQTJCLElBQTNCLEVBQWlDRSxTQUFqQyxDQUFWO0FBQ0EsU0FGRDtBQUdBLE9BUEQsTUFPTztBQUNOSyxRQUFBQSxJQUFJLENBQUNOLElBQUwsQ0FBVTNDLElBQUksQ0FBQ29ELGdCQUFMLENBQXNCRixJQUFJLENBQUMsQ0FBRCxDQUExQixFQUErQixLQUEvQixFQUFzQ04sU0FBdEMsQ0FBVjtBQUNBO0FBQ0QsS0FiRDtBQWVBakIsSUFBQUEsS0FBSyxDQUFDRyxJQUFOLENBQVcsaUZBQ1JrQixJQURRLEdBQ0QsU0FEQyxHQUNXQyxJQUFJLENBQUNJLElBQUwsQ0FBVSxFQUFWLENBRFgsR0FDMkIsa0JBRHRDO0FBRUFyRCxJQUFBQSxJQUFJLENBQUM5RCxjQUFMLEdBQXNCbUcsSUFBdEI7O0FBQ0EsUUFBSVQsWUFBWSxDQUFDckMsTUFBYixHQUFzQixDQUExQixFQUE2QjtBQUM1QnFDLE1BQUFBLFlBQVksQ0FBQ1csSUFBYjtBQUNBO0FBQ0QsR0FoVjJDOztBQWtWNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDYSxFQUFBQSxnQkExVjRDLDRCQTBWM0JWLEdBMVYyQixFQTBWdEJZLE9BMVZzQixFQTBWYlYsU0ExVmEsRUEwVkY7QUFDekMsUUFBTTVDLElBQUksR0FBRzNFLG9DQUFiO0FBQ0EsUUFBTTRHLEdBQUcsR0FBR2pDLElBQUksQ0FBQytCLFVBQWpCO0FBQ0EsUUFBTWdCLFFBQVEsR0FBR0gsU0FBUyxHQUFHLENBQUgsR0FBTyxDQUFqQztBQUVBLFFBQU1XLFFBQVEsR0FBSSxPQUFPYixHQUFHLENBQUNqQyxLQUFYLEtBQXFCLFFBQXJCLElBQWlDaUMsR0FBRyxDQUFDakMsS0FBSixDQUFVbEIsTUFBVixHQUFtQixDQUFyRCxHQUEwRG1ELEdBQUcsQ0FBQ2pDLEtBQTlELEdBQXNFLFNBQXZGO0FBQ0EsUUFBTStDLEtBQUssR0FBR3hELElBQUksQ0FBQ3lELFVBQUwsQ0FBZ0JGLFFBQWhCLENBQWQ7QUFDQSxRQUFNRyxRQUFRLEdBQUcxRCxJQUFJLENBQUM3RCxhQUFMLENBQW1CcUgsS0FBbkIsS0FBNkIsTUFBOUM7QUFDQSxRQUFNRyxTQUFTLEdBQUczRCxJQUFJLENBQUMyRCxTQUFMLENBQWVKLFFBQWYsQ0FBbEI7QUFFQSxRQUFNSyxXQUFXLEdBQUdOLE9BQU8sR0FDeEJ0RCxJQUFJLENBQUM2RCxTQUFMLENBQWVuQixHQUFHLENBQUNvQixJQUFuQixDQUR3QixHQUV4QjlELElBQUksQ0FBQ1UsWUFBTCxDQUFrQmdDLEdBQUcsQ0FBQ2xDLElBQXRCLENBRkg7QUFHQSxRQUFNdUQsUUFBUSxHQUFHVCxPQUFPLEdBQUcsOEJBQUgsR0FBb0MsRUFBNUQ7QUFFQSxRQUFNVSxNQUFNLEdBQUksT0FBT3RCLEdBQUcsQ0FBQ3NCLE1BQVgsS0FBc0IsUUFBdEIsSUFBa0N0QixHQUFHLENBQUNzQixNQUFKLENBQVd6RSxNQUFYLEdBQW9CLENBQXZELEdBQTREbUQsR0FBRyxDQUFDc0IsTUFBaEUsR0FBeUUsRUFBeEY7QUFDQSxRQUFNQyxPQUFPLEdBQUksT0FBT3ZCLEdBQUcsQ0FBQ3VCLE9BQVgsS0FBdUIsUUFBdkIsSUFBbUN2QixHQUFHLENBQUN1QixPQUFKLENBQVkxRSxNQUFaLEdBQXFCLENBQXpELEdBQThEbUQsR0FBRyxDQUFDdUIsT0FBbEUsR0FBNEUsRUFBNUY7QUFDQSxRQUFNQyxTQUFTLEdBQUksT0FBT3hCLEdBQUcsQ0FBQ3lCLFVBQVgsS0FBMEIsUUFBMUIsSUFBc0N6QixHQUFHLENBQUN5QixVQUFKLENBQWU1RSxNQUFmLEdBQXdCLENBQS9ELEdBQW9FbUQsR0FBRyxDQUFDeUIsVUFBeEUsR0FBcUYsRUFBdkc7QUFDQSxRQUFNQyxJQUFJLEdBQUcsZ0NBQWI7QUFFQSxRQUFNQyxVQUFVLEdBQUcsb0NBQTRCcEMsR0FBRyxDQUFDeUIsUUFBRCxDQUEvQix3QkFBcUR6QixHQUFHLENBQUNzQixRQUFELENBQXhELDBEQUNldEIsR0FBRyxDQUFDMEIsU0FBRCxDQURsQixZQUFuQjtBQUdBLFFBQU1XLFFBQVEsdUNBQStCaEIsT0FBTyxHQUFHLGtCQUFILEdBQXdCLEVBQTlELGdCQUFxRVMsUUFBckUsU0FBZ0Y5QixHQUFHLENBQUMyQixXQUFELENBQW5GLFlBQWQ7QUFFQSxRQUFNVyxPQUFPLEdBQUczQixTQUFTLHVDQUE4QjVDLElBQUksQ0FBQ3dFLGFBQUwsQ0FBbUI5QixHQUFHLENBQUNJLFFBQXZCLENBQTlCLGFBQXdFLEVBQWpHO0FBRUEsUUFBTTJCLEtBQUssR0FBRyx1Q0FBOEJKLFVBQTlCLGtEQUNpQkMsUUFEakIsYUFFWEMsT0FGVywwQ0FHbUJQLE1BQU0sS0FBSyxFQUFYLEdBQWdCL0IsR0FBRyxDQUFDK0IsTUFBRCxDQUFuQixHQUE4QkksSUFIakQscURBSW9CSCxPQUFPLEtBQUssRUFBWixHQUFpQmhDLEdBQUcsQ0FBQ2dDLE9BQUQsQ0FBcEIsR0FBZ0NHLElBSnBELFVBQWQ7QUFNQSxRQUFJdEMsSUFBSSxHQUFHLGlDQUF5QndCLE9BQU8sR0FBRyxpQkFBSCxHQUF1QixFQUF2RCxnQ0FDTXJCLEdBQUcsQ0FBQ1MsR0FBRyxDQUFDbEMsSUFBSixJQUFZLEVBQWIsQ0FEVCw0QkFDeUN5QixHQUFHLENBQUNTLEdBQUcsQ0FBQ29CLElBQUosSUFBWSxFQUFiLENBRDVDLGdCQUNpRVcsS0FEakUsVUFBWCxDQWpDeUMsQ0FvQ3pDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLFFBQUlQLFNBQVMsS0FBSyxFQUFkLElBQW9CUixRQUFRLEtBQUssT0FBckMsRUFBOEM7QUFDN0M1QixNQUFBQSxJQUFJLElBQUksd0RBQThDaUIsUUFBOUMsbUZBRVdkLEdBQUcsQ0FBQ2lDLFNBQUQsQ0FGZCxnQkFFOEJqQyxHQUFHLENBQUNqQyxJQUFJLENBQUMwRSxRQUFMLENBQWNSLFNBQWQsRUFBeUIsR0FBekIsQ0FBRCxDQUZqQyxlQUdMLFlBSEg7QUFJQTs7QUFFRCxXQUFPcEMsSUFBUDtBQUNBLEdBN1kyQzs7QUErWTVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0MwQyxFQUFBQSxhQXRaNEMseUJBc1o5QjFCLFFBdFo4QixFQXNacEI7QUFDdkIsUUFBTTlDLElBQUksR0FBRzNFLG9DQUFiO0FBQ0EsUUFBTTRHLEdBQUcsR0FBR2pDLElBQUksQ0FBQytCLFVBQWpCOztBQUNBLFFBQUllLFFBQVEsS0FBSyxRQUFqQixFQUEyQjtBQUMxQixhQUFPLHVGQUNEYixHQUFHLENBQUNqQyxJQUFJLENBQUNvQyxFQUFMLENBQVEsd0JBQVIsRUFBa0MsS0FBbEMsQ0FBRCxDQURGLFlBQVA7QUFFQTs7QUFDRCxRQUFJVSxRQUFRLEtBQUssT0FBakIsRUFBMEI7QUFDekIsYUFBTyx3RUFDRGIsR0FBRyxDQUFDakMsSUFBSSxDQUFDb0MsRUFBTCxDQUFRLHVCQUFSLEVBQWlDLE9BQWpDLENBQUQsQ0FERixZQUFQO0FBRUE7O0FBQ0QsV0FBTyxnQ0FBUDtBQUNBLEdBbGEyQzs7QUFvYTVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NxQixFQUFBQSxVQTNhNEMsc0JBMmFqQ2hELEtBM2FpQyxFQTJhMUI7QUFDakIsUUFBTUYsQ0FBQyxHQUFHb0UsTUFBTSxDQUFDbEUsS0FBSyxJQUFJLEVBQVYsQ0FBTixDQUFvQm1FLFdBQXBCLEVBQVY7O0FBQ0EsUUFBSXJFLENBQUMsS0FBSyxFQUFWLEVBQWM7QUFDYixhQUFPLFNBQVA7QUFDQTs7QUFDRCxRQUFJQSxDQUFDLENBQUNzRSxPQUFGLENBQVUsSUFBVixNQUFvQixDQUFDLENBQXpCLEVBQTRCO0FBQzNCLGFBQU8sUUFBUDtBQUNBOztBQUNELFFBQUl0RSxDQUFDLENBQUNzRSxPQUFGLENBQVUsVUFBVixNQUEwQixDQUFDLENBQTNCLElBQWdDdEUsQ0FBQyxDQUFDc0UsT0FBRixDQUFVLFFBQVYsTUFBd0IsQ0FBQyxDQUF6RCxJQUNBdEUsQ0FBQyxDQUFDc0UsT0FBRixDQUFVLGVBQVYsTUFBK0IsQ0FBQyxDQURoQyxJQUNxQ3RFLENBQUMsQ0FBQ3NFLE9BQUYsQ0FBVSxLQUFWLE1BQXFCLENBQUMsQ0FEL0QsRUFDa0U7QUFDakUsYUFBTyxRQUFQO0FBQ0E7O0FBQ0QsUUFBSXRFLENBQUMsS0FBSyxlQUFWLEVBQTJCO0FBQzFCLGFBQU8sZUFBUDtBQUNBOztBQUNELFdBQU9BLENBQVA7QUFDQSxHQTNiMkM7O0FBNmI1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDNkIsRUFBQUEsRUFwYzRDLGNBb2N6QzBDLEdBcGN5QyxFQW9jcENDLFFBcGNvQyxFQW9jMUI7QUFDakIsUUFBSSxPQUFPdEQsZUFBUCxLQUEyQixXQUEzQixJQUEwQ0EsZUFBZSxDQUFDcUQsR0FBRCxDQUE3RCxFQUFvRTtBQUNuRSxhQUFPckQsZUFBZSxDQUFDcUQsR0FBRCxDQUF0QjtBQUNBOztBQUNELFdBQU9DLFFBQVA7QUFDQSxHQXpjMkM7O0FBMmM1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3JFLEVBQUFBLFlBamQ0Qyx3QkFpZC9CRixJQWpkK0IsRUFpZHpCO0FBQ2xCLFFBQU13RSxHQUFHLEdBQUc7QUFDWEMsTUFBQUEsUUFBUSxFQUFFLHNCQURDO0FBRVhDLE1BQUFBLElBQUksRUFBRSxrQkFGSztBQUdYLGdCQUFVLGlCQUhDO0FBSVgvSCxNQUFBQSxJQUFJLEVBQUUsa0JBSks7QUFLWGdJLE1BQUFBLEtBQUssRUFBRSxtQkFMSTtBQU1YLHNCQUFnQixpQkFOTDtBQU9YM0gsTUFBQUEsS0FBSyxFQUFFLG1CQVBJO0FBUVhDLE1BQUFBLEVBQUUsRUFBRSxnQkFSTztBQVNYQyxNQUFBQSxHQUFHLEVBQUUsaUJBVE07QUFVWCxxQkFBZSx5QkFWSjtBQVdYLHVCQUFpQjtBQVhOLEtBQVo7QUFhQSxRQUFNb0gsR0FBRyxHQUFHRSxHQUFHLENBQUN4RSxJQUFELENBQWY7O0FBQ0EsUUFBSXNFLEdBQUcsSUFBSSxPQUFPckQsZUFBUCxLQUEyQixXQUFsQyxJQUFpREEsZUFBZSxDQUFDcUQsR0FBRCxDQUFwRSxFQUEyRTtBQUMxRSxhQUFPckQsZUFBZSxDQUFDcUQsR0FBRCxDQUF0QjtBQUNBOztBQUNELFdBQU90RSxJQUFJLElBQUksU0FBZjtBQUNBLEdBcGUyQzs7QUFzZTVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ21ELEVBQUFBLFNBOWU0QyxxQkE4ZWxDbEQsS0E5ZWtDLEVBOGUzQjtBQUNoQixRQUFNVCxJQUFJLEdBQUczRSxvQ0FBYjtBQUNBLFFBQU0rSixHQUFHLEdBQUdULE1BQU0sQ0FBQ2xFLEtBQUssSUFBSSxFQUFWLENBQWxCLENBRmdCLENBR2hCOztBQUNBLFFBQU00RSxRQUFRLDJCQUFvQkQsR0FBcEIsQ0FBZDs7QUFDQSxRQUFJLE9BQU8zRCxlQUFQLEtBQTJCLFdBQTNCLElBQTBDQSxlQUFlLENBQUM0RCxRQUFELENBQTdELEVBQXlFO0FBQ3hFLGFBQU81RCxlQUFlLENBQUM0RCxRQUFELENBQXRCO0FBQ0E7O0FBQ0QsUUFBTTdCLEtBQUssR0FBR3hELElBQUksQ0FBQ3lELFVBQUwsQ0FBZ0IyQixHQUFoQixDQUFkO0FBQ0EsUUFBTUUsUUFBUSwyQkFBb0I5QixLQUFwQixDQUFkOztBQUNBLFFBQUksT0FBTy9CLGVBQVAsS0FBMkIsV0FBM0IsSUFBMENBLGVBQWUsQ0FBQzZELFFBQUQsQ0FBN0QsRUFBeUU7QUFDeEUsYUFBTzdELGVBQWUsQ0FBQzZELFFBQUQsQ0FBdEI7QUFDQTs7QUFDRCxRQUFNUCxRQUFRLEdBQUc7QUFDaEIzSSxNQUFBQSxFQUFFLEVBQUUsSUFEWTtBQUVoQkMsTUFBQUEsYUFBYSxFQUFFLGVBRkM7QUFHaEJDLE1BQUFBLFNBQVMsRUFBRSxpQkFISztBQUloQkMsTUFBQUEsVUFBVSxFQUFFLDJCQUpJO0FBS2hCQyxNQUFBQSxhQUFhLEVBQUUsbUJBTEM7QUFNaEJDLE1BQUFBLEtBQUssRUFBRSxPQU5TO0FBT2hCSyxNQUFBQSxPQUFPLEVBQUUsU0FQTztBQVFoQkMsTUFBQUEsT0FBTyxFQUFFLFNBUk87QUFTaEJDLE1BQUFBLFFBQVEsRUFBRSxVQVRNO0FBVWhCQyxNQUFBQSxNQUFNLEVBQUUsZ0NBVlE7QUFXaEJDLE1BQUFBLE1BQU0sRUFBRTtBQVhRLEtBQWpCO0FBYUEsV0FBTzZILFFBQVEsQ0FBQ3ZCLEtBQUQsQ0FBUixJQUFtQjRCLEdBQTFCO0FBQ0EsR0F6Z0IyQzs7QUEyZ0I1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3ZCLEVBQUFBLFNBamhCNEMscUJBaWhCbENDLElBamhCa0MsRUFpaEI1QjtBQUNmLFFBQUksT0FBT0EsSUFBUCxLQUFnQixRQUFoQixJQUE0QkEsSUFBSSxDQUFDdkUsTUFBTCxLQUFnQixDQUFoRCxFQUFtRDtBQUNsRCxhQUFPLEVBQVA7QUFDQTs7QUFDRCxRQUFJdUUsSUFBSSxDQUFDdkUsTUFBTCxJQUFlLEVBQW5CLEVBQXVCO0FBQ3RCLGFBQU91RSxJQUFQO0FBQ0E7O0FBQ0QscUJBQVVBLElBQUksQ0FBQ3lCLFNBQUwsQ0FBZSxDQUFmLEVBQWtCLENBQWxCLENBQVY7QUFDQSxHQXpoQjJDOztBQTJoQjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NiLEVBQUFBLFFBbGlCNEMsb0JBa2lCbkNjLEdBbGlCbUMsRUFraUI5QjlILEdBbGlCOEIsRUFraUJ6QjtBQUNsQixRQUFJLE9BQU84SCxHQUFQLEtBQWUsUUFBbkIsRUFBNkI7QUFDNUIsYUFBTyxFQUFQO0FBQ0E7O0FBQ0QsUUFBSUEsR0FBRyxDQUFDakcsTUFBSixJQUFjN0IsR0FBbEIsRUFBdUI7QUFDdEIsYUFBTzhILEdBQVA7QUFDQTs7QUFDRCxxQkFBVUEsR0FBRyxDQUFDRCxTQUFKLENBQWMsQ0FBZCxFQUFpQjdILEdBQWpCLENBQVY7QUFDQSxHQTFpQjJDOztBQTRpQjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDcUUsRUFBQUEsVUFsakI0QyxzQkFrakJqQzBELEtBbGpCaUMsRUFrakIxQjtBQUNqQixRQUFJQSxLQUFLLEtBQUssSUFBVixJQUFrQixPQUFPQSxLQUFQLEtBQWlCLFdBQXZDLEVBQW9EO0FBQ25ELGFBQU8sRUFBUDtBQUNBOztBQUNELFdBQU9kLE1BQU0sQ0FBQ2MsS0FBRCxDQUFOLENBQ0xyRyxPQURLLENBQ0csSUFESCxFQUNTLE9BRFQsRUFFTEEsT0FGSyxDQUVHLElBRkgsRUFFUyxNQUZULEVBR0xBLE9BSEssQ0FHRyxJQUhILEVBR1MsTUFIVCxFQUlMQSxPQUpLLENBSUcsSUFKSCxFQUlTLFFBSlQsRUFLTEEsT0FMSyxDQUtHLElBTEgsRUFLUyxPQUxULENBQVA7QUFNQSxHQTVqQjJDOztBQThqQjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDdkIsRUFBQUEsWUF2a0I0Qyx3QkF1a0IvQjZILE1BdmtCK0IsRUF1a0J2QkMsSUF2a0J1QixFQXVrQmpCO0FBQzFCLFFBQU0zRixJQUFJLEdBQUczRSxvQ0FBYjtBQUNBLFFBQU11SyxFQUFFLEdBQUc1RixJQUFJLENBQUNyRSxhQUFoQjs7QUFDQSxRQUFJLENBQUNpSyxFQUFELElBQU9BLEVBQUUsQ0FBQ3JHLE1BQUgsS0FBYyxDQUF6QixFQUE0QjtBQUMzQjtBQUNBOztBQUNELFFBQU1ULElBQUksR0FBRzZHLElBQUksSUFBSSxFQUFyQjtBQUNBLFFBQU0xRCxHQUFHLEdBQUdqQyxJQUFJLENBQUMrQixVQUFqQjtBQUNBLFFBQU04RCxPQUFPLEdBQUcsc0NBQWhCOztBQUNBLFFBQU16RCxFQUFFLEdBQUcsU0FBTEEsRUFBSyxDQUFDMEMsR0FBRCxFQUFNQyxRQUFOO0FBQUEsYUFBbUIvRSxJQUFJLENBQUNvQyxFQUFMLENBQVEwQyxHQUFSLEVBQWFDLFFBQWIsQ0FBbkI7QUFBQSxLQUFYOztBQUVBLFFBQUllLEdBQUcsR0FBRyxrQkFBVjtBQUNBLFFBQUlDLEdBQUcsR0FBRyxTQUFWO0FBQ0EsUUFBSUMsSUFBSSxHQUFHLEVBQVg7QUFDQSxRQUFJN0QsSUFBSSxHQUFHLEVBQVg7O0FBRUEsWUFBUXVELE1BQVI7QUFDQyxXQUFLLFdBQUw7QUFDQ0ksUUFBQUEsR0FBRyxHQUFHLG1CQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxJQUFOO0FBQ0E1RCxRQUFBQSxJQUFJLEdBQUdDLEVBQUUsQ0FBQyxtQkFBRCxFQUFzQiwrQkFBdEIsQ0FBVDtBQUNBOztBQUNELFdBQUssb0JBQUw7QUFBMkI7QUFDMUIwRCxVQUFBQSxHQUFHLEdBQUcsb0JBQU47QUFDQUMsVUFBQUEsR0FBRyxHQUFHLE1BQU47QUFDQUMsVUFBQUEsSUFBSSxHQUFHSCxPQUFQO0FBQ0EsY0FBSUksUUFBUSxHQUFHN0QsRUFBRSxDQUFDLDRCQUFELEVBQStCLDhCQUEvQixDQUFqQjs7QUFDQSxjQUFJdEQsSUFBSSxDQUFDZ0MsS0FBTCxJQUFjaEMsSUFBSSxDQUFDZ0MsS0FBTCxHQUFhLENBQS9CLEVBQWtDO0FBQ2pDbUYsWUFBQUEsUUFBUSxnQkFBU25ILElBQUksQ0FBQ2dDLEtBQWQsTUFBUjtBQUNBOztBQUNEcUIsVUFBQUEsSUFBSSxHQUFHOEQsUUFBUDtBQUNBO0FBQ0E7O0FBQ0QsV0FBSyx1QkFBTDtBQUNDO0FBQ0FILFFBQUFBLEdBQUcsR0FBRyxvQkFBTjtBQUNBQyxRQUFBQSxHQUFHLEdBQUcsTUFBTjtBQUNBQyxRQUFBQSxJQUFJLEdBQUdILE9BQVA7QUFDQTFELFFBQUFBLElBQUksR0FBR0MsRUFBRSxDQUFDLDBCQUFELEVBQTZCLDJCQUE3QixDQUFUO0FBQ0E7O0FBQ0QsV0FBSywwQkFBTDtBQUNDO0FBQ0EwRCxRQUFBQSxHQUFHLEdBQUcsb0JBQU47QUFDQUMsUUFBQUEsR0FBRyxHQUFHLE1BQU47QUFDQUMsUUFBQUEsSUFBSSxHQUFHSCxPQUFQO0FBQ0ExRCxRQUFBQSxJQUFJLEdBQUdDLEVBQUUsQ0FBQyw2QkFBRCxFQUFnQyxtQkFBaEMsQ0FBVDtBQUNBOztBQUNELFdBQUssaUJBQUw7QUFBd0I7QUFDdkIwRCxVQUFBQSxHQUFHLEdBQUcsaUJBQU47QUFDQUMsVUFBQUEsR0FBRyxHQUFHLE9BQU47QUFDQSxjQUFNbEYsS0FBSyxHQUFHaEIsS0FBSyxDQUFDQyxPQUFOLENBQWNoQixJQUFJLENBQUMrQixLQUFuQixJQUE0Qi9CLElBQUksQ0FBQytCLEtBQUwsQ0FBV3FGLE1BQVgsQ0FBa0JDLE9BQWxCLENBQTVCLEdBQXlELEVBQXZFOztBQUNBLGNBQUl0RixLQUFLLENBQUN0QixNQUFOLEdBQWUsQ0FBbkIsRUFBc0I7QUFDckI0QyxZQUFBQSxJQUFJLGFBQU1DLEVBQUUsQ0FBQyx1QkFBRCxFQUEwQixTQUExQixDQUFSLGVBQWlEdkIsS0FBSyxDQUFDd0MsSUFBTixDQUFXLElBQVgsQ0FBakQsQ0FBSjtBQUNBLFdBRkQsTUFFTztBQUNObEIsWUFBQUEsSUFBSSxHQUFHQyxFQUFFLENBQUMseUJBQUQsRUFBNEIsU0FBNUIsQ0FBVDtBQUNBOztBQUNEO0FBQ0E7O0FBQ0QsV0FBSyxVQUFMO0FBQ0MwRCxRQUFBQSxHQUFHLEdBQUcsa0JBQU47QUFDQUMsUUFBQUEsR0FBRyxHQUFHLFNBQU47QUFDQTVELFFBQUFBLElBQUksR0FBR0MsRUFBRSxDQUFDLDhCQUFELEVBQWlDLG9CQUFqQyxDQUFUO0FBQ0E7O0FBQ0QsV0FBSyxjQUFMO0FBQ0MwRCxRQUFBQSxHQUFHLEdBQUcsa0JBQU47QUFDQUMsUUFBQUEsR0FBRyxHQUFHLFNBQU47QUFDQTVELFFBQUFBLElBQUksR0FBR0MsRUFBRSxDQUFDLHNCQUFELEVBQXlCLGNBQXpCLENBQVQ7QUFDQTs7QUFDRCxXQUFLLFVBQUw7QUFDQzBELFFBQUFBLEdBQUcsR0FBRyxrQkFBTjtBQUNBQyxRQUFBQSxHQUFHLEdBQUcsU0FBTjtBQUNBQyxRQUFBQSxJQUFJLEdBQUdILE9BQVA7QUFDQTFELFFBQUFBLElBQUksR0FBR0MsRUFBRSxDQUFDLHNCQUFELEVBQXlCLGtCQUF6QixDQUFUO0FBQ0E7O0FBQ0Q7QUFDQzBELFFBQUFBLEdBQUcsR0FBRyxpQkFBTjtBQUNBQyxRQUFBQSxHQUFHLEdBQUcsT0FBTjtBQUNBNUQsUUFBQUEsSUFBSSxHQUFHQyxFQUFFLENBQUMseUJBQUQsRUFBNEIsU0FBNUIsQ0FBVDtBQUNBO0FBOURGOztBQWlFQXdELElBQUFBLEVBQUUsQ0FDQVEsV0FERixDQUNjLHVFQURkLEVBRUVDLFFBRkYsQ0FFV1AsR0FGWCxFQUdFaEUsSUFIRixDQUdPLHdDQUFnQ0csR0FBRyxDQUFDOEQsR0FBRCxDQUFuQyw2REFDK0JDLElBRC9CLFNBQ3NDL0QsR0FBRyxDQUFDRSxJQUFELENBRHpDLFlBSFA7QUFLQTtBQTdwQjJDLENBQTdDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIE1pa29QQlggLSBmcmVlIHBob25lIHN5c3RlbSBmb3Igc21hbGwgYnVzaW5lc3NcbiAqIENvcHlyaWdodCAoQykgMjAxNy0yMDIxIEFsZXhleSBQb3J0bm92IGFuZCBOaWtvbGF5IEJla2V0b3ZcbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICogaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAqIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb247IGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gKiAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICogYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAqIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYWxvbmcgd2l0aCB0aGlzIHByb2dyYW0uXG4gKiBJZiBub3QsIHNlZSA8aHR0cHM6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuICovXG5cbi8qIGdsb2JhbCBnbG9iYWxUcmFuc2xhdGUsIEZvcm0sIENvbmZpZywgUGJ4QXBpICovXG5cbi8qKlxuICog0KLQtdGB0YLQuNGA0L7QstCw0L3QuNC1INGB0L7QtdC00LjQvdC10L3QuNGPINC80L7QtNGD0LvRjyDRgSAx0KEgKyDRgNC10L3QtNC10YAg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIg0YHQtdGA0LLQuNGB0L7Qsi5cbiAqL1xuY29uc3QgbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyID0ge1xuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcblx0JHN0YXR1c1RvZ2dsZTogJCgnI21vZHVsZS1zdGF0dXMtdG9nZ2xlJyksXG5cdCR3ZWJTZXJ2aWNlVG9nZ2xlOiAkKCcjd2ViLXNlcnZpY2UtbW9kZS10b2dnbGUnKSxcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcblx0JG1vZHVsZVN0YXR1czogJCgnI2N0aS1zdGF0dXMtc3VtbWFyeScpLFxuXHQkc3VibWl0QnV0dG9uOiAkKCcjc3VibWl0YnV0dG9uJyksXG5cdCRkZWJ1Z0luZm86ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIHNwYW4jZGVidWctaW5mbycpLFxuXHQkc2VydmljZXNTdGF0dXM6ICQoJyNjdGktc2VydmljZXMtc3RhdHVzJyksXG5cdHRpbWVPdXQ6IDMwMDAsXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxuXHRlcnJvckNvdW50czogMCxcblx0bGFzdFJlbmRlckhhc2g6ICcnLFxuXG5cdC8qKlxuXHQgKiDQnNCw0L/Qv9C40L3QsyBzdGF0ZSAtPiBDU1Mt0LrQu9Cw0YHRgSDQu9Cw0LzQv9C+0YfQutC4LlxuXHQgKiDQm9GO0LHQvtC1INC90LXQuNC30LLQtdGB0YLQvdC+0LUg0YHQvtGB0YLQvtGP0L3QuNC1IC0+INC20ZHQu9GC0L7QtSAod2FybikuXG5cdCAqL1xuXHRzdGF0ZUxlZENsYXNzOiB7XG5cdFx0b2s6ICdvaycsXG5cdFx0YXV0aGVudGljYXRlZDogJ29rJyxcblx0XHRjb25uZWN0ZWQ6ICdvaycsXG5cdFx0d2FpdGluZ18xYzogJ3dhcm4nLFxuXHRcdGNvbm5lY3RpbmdfMWM6ICd3YXJuJyxcblx0XHRlcnJvcjogJ2Vycm9yJyxcblx0XHRmYWlsOiAnZXJyb3InLFxuXHRcdGZhaWxlZDogJ2Vycm9yJyxcblx0XHRkb3duOiAnZXJyb3InLFxuXHRcdHN0b3BwZWQ6ICdlcnJvcicsXG5cdFx0dW5rbm93bjogJ3Vua25vd24nLFxuXHRcdHBlbmRpbmc6ICd3YXJuJyxcblx0XHRzdGFydGluZzogJ3dhcm4nLFxuXHRcdHFyY29kZTogJ3dhcm4nLFxuXHRcdHJlYXV0aDogJ3dhcm4nLFxuXHRcdGF1dGg6ICd3YXJuJyxcblx0XHRhdXRoX3JlcXVpcmVkOiAnd2FybicsXG5cdFx0d2FybjogJ3dhcm4nLFxuXHRcdHdhcm5pbmc6ICd3YXJuJyxcblx0fSxcblxuXHQvKipcblx0ICog0KHQtdGA0LLQuNGB0YssINC60L7RgtC+0YDRi9C1INC80L7Qs9GD0YIg0LjQtNGC0Lgg0LIg0L3QtdGB0LrQvtC70YzQutC40YUg0LjQvdGB0YLQsNC90YHQsNGFINGBINGA0LDQt9C90YvQvCBhcmVhLlxuXHQgKi9cblx0bXVsdGlJbnN0YW5jZVNlcnZpY2VzOiB7XG5cdFx0Y2hhdHM6IHRydWUsXG5cdFx0dGc6IHRydWUsXG5cdFx0bWF4OiB0cnVlLFxuXHR9LFxuXG5cdGluaXRpYWxpemUoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlc3RhcnRXb3JrZXIoKTtcblx0fSxcblxuXHRyZXN0YXJ0V29ya2VyKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcblx0XHR3aW5kb3cuY2xlYXJUaW1lb3V0KG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlKTtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyKCk7XG5cdH0sXG5cblx0d29ya2VyKCkge1xuXHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XG5cdFx0XHQkLmFwaSh7XG5cdFx0XHRcdHVybDogYCR7Q29uZmlnLnBieFVybH0vcGJ4Y29yZS9hcGkvbW9kdWxlcy9Nb2R1bGVDVElDbGllbnQvY2hlY2tgLFxuXHRcdFx0XHRvbjogJ25vdycsXG5cdFx0XHRcdHN1Y2Nlc3NUZXN0OiBQYnhBcGkuc3VjY2Vzc1Rlc3QsXG5cdFx0XHRcdG9uQ29tcGxldGUoKSB7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUgPSB3aW5kb3cuc2V0VGltZW91dChcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIsXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvblJlc3BvbnNlKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0JCgnLm1lc3NhZ2UuYWpheCcpLnJlbW92ZSgpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLm5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2sobnVsbCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUmVuZGVyIHNlcnZpY2VzIHN0YXR1cyBwYW5lbCBmb3IgYm90aCBzdWNjZXNzIGFuZCBwYXJ0aWFsIHJlc3BvbnNlcy5cblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyU2VydmljZXNTdGF0dXMocmVzcG9uc2UuZGF0YSk7XG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLm5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2socmVzcG9uc2UuZGF0YSk7XG5cblx0XHRcdFx0XHQvLyBEZWJ1ZyBKU09OIHBhbmUgKGxlZ2FjeSBkZWJ1ZyB0YWIpLlxuXHRcdFx0XHRcdGxldCB2aXN1YWxFcnJvclN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLmRhdGEsIG51bGwsIDIpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgdmlzdWFsRXJyb3JTdHJpbmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHR2aXN1YWxFcnJvclN0cmluZyA9IHZpc3VhbEVycm9yU3RyaW5nLnJlcGxhY2UoL1xcbi9nLCAnPGJyLz4nKTtcblx0XHRcdFx0XHRcdGlmIChPYmplY3Qua2V5cyhyZXNwb25zZSkubGVuZ3RoID4gMCAmJiByZXNwb25zZS5yZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRkZWJ1Z0luZm9cblx0XHRcdFx0XHRcdFx0XHQuYWZ0ZXIoYDxkaXYgY2xhc3M9XCJ1aSBtZXNzYWdlIGFqYXhcIj5cblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+ICR7dmlzdWFsRXJyb3JTdHJpbmd9PC9wcmU+XG5cdFx0XHRcdFx0XHRcdFx0PC9kaXY+YCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PGkgY2xhc3M9XCJzcGlubmVyIGxvYWRpbmcgaWNvblwiPjwvaT5cblx0XHRcdFx0XHRcdFx0XHRcdDxwcmUgc3R5bGU9J3doaXRlLXNwYWNlOiBwcmUtd3JhcCc+JHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0XHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZhaWx1cmUocmVzcG9uc2UpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgKz0gMTtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEpID8gcmVzcG9uc2UuZGF0YSA6IG51bGw7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBBcnJheS5pc0FycmF5KGRhdGEuc3RhdHVzZXMpKVxuXHRcdFx0XHRcdFx0PyBkYXRhLnN0YXR1c2VzIDogbnVsbDtcblx0XHRcdFx0XHRpZiAoIXN0YXR1c2VzKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gTW9kdWxlIHN0YXJ0dXAgZ3JhY2U6IHRoZSBiYWNrZW5kIGhhcyBhbHJlYWR5IGRvd25ncmFkZWQgYW55XG5cdFx0XHRcdFx0Ly8gaGFyZCBlcnJvciB0byBcInN0YXJ0aW5nXCIgd2hpbGUgdGhlIHN0YWNrIGJvb3RzLCBzbyBzaG93IG9uZVxuXHRcdFx0XHRcdC8vIGNhbG0gcHJvZ3Jlc3MgYmFkZ2UgYW5kIG5ldmVyIGVzY2FsYXRlIHRvIGEgZmFpbHVyZSBoZXJlIOKAlFxuXHRcdFx0XHRcdC8vIHRoaXMgaXMgd2hhdCBrZWVwcyB0aGUgZmlyc3QgfjIgbWludXRlcyBmcmVlIG9mIGZhbHNlIHJlZHMuXG5cdFx0XHRcdFx0aWYgKGRhdGEuc3RhcnR1cF9ncmFjZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENsYXNzaWZ5IHRoZSByZXNwb25zZSBieSB0aGUgd29yc3Qgbm9uLXN5c3RlbSBzdGF0ZS5cblx0XHRcdFx0XHQvLyBjcm0tMWMgaXMgc3BlY2lhbDogaXQncyB0aGUgMUMgYnJpZGdlIOKAlCBpdHMgb3duIGVycm9yIGxhYmVsLlxuXHRcdFx0XHRcdC8vIEFsb25nc2lkZSB0aGUgYm9vbGVhbnMsIGNvbGxlY3QgZGVkdXBlZCBodW1hbiBzZXJ2aWNlIG5hbWVzXG5cdFx0XHRcdFx0Ly8gKGJ5IGxhYmVsKSBmb3IgZWFjaCBidWNrZXQgc28gdGhlIHN1bW1hcnkgbGluZSBjYW4gTkFNRSB0aGVcblx0XHRcdFx0XHQvLyBzZXJ2aWNlcyB0aGF0IGFyZSBmYWlsaW5nIG9yIHN0dWNrIGluc3RlYWQgb2YgYSBiYXJlIGNvbG91ci5cblx0XHRcdFx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdFx0XHRcdGxldCBjcm0xYyA9IG51bGw7XG5cdFx0XHRcdFx0bGV0IGhhc0Vycm9yID0gZmFsc2U7XG5cdFx0XHRcdFx0bGV0IGhhc1N0YXJ0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0Y29uc3QgZXJyTmFtZXMgPSB7fTtcblx0XHRcdFx0XHRjb25zdCBzdGFydE5hbWVzID0ge307XG5cdFx0XHRcdFx0c3RhdHVzZXMuZm9yRWFjaCgocykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzIHx8IHR5cGVvZiBzLm5hbWUgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAocy5uYW1lID09PSAnY3JtLTFjJykgY3JtMWMgPSBzLnN0YXRlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdlcnJvcicgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWwnIHx8IHMuc3RhdGUgPT09ICdmYWlsZWQnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICdkb3duJyB8fCBzLnN0YXRlID09PSAnc3RvcHBlZCcpIHtcblx0XHRcdFx0XHRcdFx0aGFzRXJyb3IgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRlcnJOYW1lc1tzZWxmLnNlcnZpY2VMYWJlbChzLm5hbWUpXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ3N0YXJ0aW5nJyB8fCBzLnN0YXRlID09PSAncGVuZGluZydcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ3Vua25vd24nKSB7XG5cdFx0XHRcdFx0XHRcdGhhc1N0YXJ0aW5nID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0c3RhcnROYW1lc1tzZWxmLnNlcnZpY2VMYWJlbChzLm5hbWUpXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JMaXN0ID0gT2JqZWN0LmtleXMoZXJyTmFtZXMpO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGlzdCA9IE9iamVjdC5rZXlzKHN0YXJ0TmFtZXMpO1xuXHRcdFx0XHRcdC8vIFNldmVyaXR5IG9yZGVyOiBhIGdlbnVpbmUgcmVkIGZhaWx1cmUgKGluY2wuIGEgY3JtLTFjIGJyaWRnZVxuXHRcdFx0XHRcdC8vIGRhZW1vbiB0aGF0IGlzIGFjdHVhbGx5IGRvd24g4oCUIGl0IHN0YXlzICdlcnJvcicpIHdpbnMgdGhlXG5cdFx0XHRcdFx0Ly8gaGVhZGxpbmUgc28gaXQgaXMgbmV2ZXIgbWFza2VkIGJ5IGEgY2FsbWVyIG1lc3NhZ2UuIFRoZW4gdGhlXG5cdFx0XHRcdFx0Ly8gMUMgYnJpZGdlJ3MgbW9kZS1hd2FyZSBcIm5vIGxpdmUgc2Vzc2lvbiB5ZXRcIiBzdGF0ZXMgKGZyb21cblx0XHRcdFx0XHQvLyByZWZpbmVDcm1TdGF0dXM6IGNvbm5lY3RpbmdfMWMgLyB3YWl0aW5nXzFjKSDigJQgYWx3YXlzIGEgY2FsbVxuXHRcdFx0XHRcdC8vIHllbGxvdywgbmV2ZXIgcmVkLiBUaGVuIGdlbmVyaWMgc3RhcnR1cCBwcm9ncmVzcy5cblx0XHRcdFx0XHRpZiAoaGFzRXJyb3IpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InLCB7IG5hbWVzOiBlcnJvckxpc3QgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjcm0xYyA9PT0gJ3dhaXRpbmdfMWMnKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNXYWl0aW5nJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjcm0xYyA9PT0gJ2Nvbm5lY3RpbmdfMWMnKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNDb25uZWN0aW5nJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNTdGFydGluZykge1xuXHRcdFx0XHRcdFx0Ly8gU3RpbGwgc3RhcnRpbmc6IHNob3cgcHJvZ3Jlc3MgdW50aWwgd2UgZ2l2ZSB1cCBhZnRlciAxMFxuXHRcdFx0XHRcdFx0Ly8gZmFpbGVkIHBvbGxzLCB0aGVuIHRyZWF0IHRoZSBzdHVjayBkYWVtb24gYXMgYW4gZXJyb3Jcblx0XHRcdFx0XHRcdC8vIGluc3RlYWQgb2YgZmFsc2VseSByZXBvcnRpbmcgaXQgYXMgQ29ubmVjdGVkLlxuXHRcdFx0XHRcdFx0aWYgKHNlbGYuZXJyb3JDb3VudHMgPCAxMCkge1xuXHRcdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJywgeyBjb3VudDogc3RhcnRMaXN0Lmxlbmd0aCB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InLCB7IG5hbWVzOiBzdGFydExpc3QgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5ub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrKG51bGwpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnRGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJEaXNhYmxlZFBhbmVsKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC+0L7QsdGJ0LjRgtGMINGE0L7RgNC80LUg0L3QsNGB0YLRgNC+0LXQuiwg0YfRgtC+IHJlbW90ZS9WUFMg0L/QvtC70Y8g0L3Rg9C20L3QviDQt9Cw0LHQu9C+0LrQuNGA0L7QstCw0YLRjCDQuNC70Lgg0YDQsNC30LHQu9C+0LrQuNGA0L7QstCw0YLRjC5cblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R8bnVsbH0gZGF0YSDQntGC0LLQtdGCIEFQSSBjaGVjay5cblx0ICovXG5cdG5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2soZGF0YSkge1xuXHRcdGNvbnN0IGFjdGl2ZSA9IGRhdGEgJiYgZGF0YS5yZW1vdGVfbWlncmF0aW9uX2FjdGl2ZSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IChkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS5yZW1vdGVfbWlncmF0aW9uX3NlcnZpY2VzKSlcblx0XHRcdD8gZGF0YS5yZW1vdGVfbWlncmF0aW9uX3NlcnZpY2VzIDogW107XG5cdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdSZW1vdGVNaWdyYXRpb25Mb2NrQ2hhbmdlZCcsIHtcblx0XHRcdGRldGFpbDoge1xuXHRcdFx0XHRhY3RpdmUsXG5cdFx0XHRcdHNlcnZpY2VzLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0L7QvtCx0YnQtdC90LjQtSDQsiDQv9Cw0L3QtdC70Lgg0YHRgtCw0YLRg9GB0L7Qsiwg0LrQvtCz0LTQsCDQvNC+0LTRg9C70Ywg0LLRi9C60LvRjtGH0LXQvS5cblx0ICovXG5cdHJlbmRlckRpc2FibGVkUGFuZWwoKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhYmVsID0gKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnXG5cdFx0XHQmJiBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZClcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWRcblx0XHRcdDogJ01vZHVsZSBpcyBkaXNhYmxlZCc7XG5cdFx0Ly8gRG9uJ3QgcmVwbGFjZSB0aGUgcGFuZWwncyBpbm5lckhUTUw6IHRoYXQgZGVzdHJveXMgI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93c1xuXHRcdC8vIGFuZCAjY3RpLXNlcnZpY2VzLXN0YXR1cy1wbGFjZWhvbGRlciwgc28gYSBsYXRlciByZS1lbmFibGUgV0lUSE9VVCBhIHBhZ2Vcblx0XHQvLyByZWxvYWQgd291bGQgbGVhdmUgcmVuZGVyU2VydmljZXNTdGF0dXMoKSB3cml0aW5nIGludG8gYW4gZW1wdHkgc2VsZWN0aW9uXG5cdFx0Ly8gYW5kIHRoZSB0YWJsZSB3b3VsZCBuZXZlciBjb21lIGJhY2suIFJldXNlIHRoZSBwbGFjZWhvbGRlciBpbnN0ZWFkLFxuXHRcdC8vIG1pcnJvcmluZyByZW5kZXJTZXJ2aWNlc1N0YXR1cygpJ3Mgc2hvd1BsYWNlaG9sZGVyLCBzbyB0aGUgc3RydWN0dXJlXG5cdFx0Ly8gc3Vydml2ZXMuIEZhbGwgYmFjayB0byByZXBsYWNpbmcgdGhlIHBhbmVsIG9ubHkgaWYgdGhlIHNrZWxldG9uIGlzIGFic2VudC5cblx0XHRjb25zdCAkcm93cyA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXJvd3MnKTtcblx0XHRjb25zdCAkcGxhY2Vob2xkZXIgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1wbGFjZWhvbGRlcicpO1xuXHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcblx0XHRpZiAoJHJvd3MubGVuZ3RoID4gMCkge1xuXHRcdFx0JHJvd3MuZW1wdHkoKTtcblx0XHR9XG5cdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcGxhY2Vob2xkZXIuaHRtbChgPHNwYW4+Jm5ic3A7JHtzZWxmLmVzY2FwZUh0bWwobGFiZWwpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdCRwYW5lbC5odG1sKGA8ZGl2IGNsYXNzPVwidWkgYmFzaWMgc2VnbWVudFwiPiR7c2VsZi5lc2NhcGVIdG1sKGxhYmVsKX08L2Rpdj5gKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCg0LXQvdC00LXRgCDRgtCw0LHQu9C40YbRiyDRgdGC0LDRgtGD0YHQvtCyOiDCq9C40L3QtNC40LrQsNGC0L7RgCArINGB0LXRgNCy0LjRgS/QutCw0L3QsNC7ICsg0YDQsNGB0L/QvtC70L7QttC10L3QuNC1ICtcblx0ICog0LDQv9GC0LDQudC8ICsg0LLQtdGA0YHQuNGPwrsuINCa0L7Qu9C+0L3QutCwIMKr0KDQsNGB0L/QvtC70L7QttC10L3QuNC1wrsg0L/QvtGP0LLQu9GP0LXRgtGB0Y8g0YLQvtC70YzQutC+INC10YHQu9C4INGF0L7RgtGPINCx0Ytcblx0ICog0L7QtNC40L0g0YHQtdGA0LLQuNGBINCy0YvQvdC10YHQtdC9INC90LAgVlBTIOKAlCDQvdCwINC+0LHRi9GH0L3QvtC5INC70L7QutCw0LvRjNC90L7QuSDRg9GB0YLQsNC90L7QstC60LUg0YLQsNCx0LvQuNGG0LBcblx0ICog0L7RgdGC0LDRkdGC0YHRjyDQutC+0LzQv9Cw0LrRgtC90L7QuS5cblx0ICpcblx0ICogQHBhcmFtIHtPYmplY3R9IGRhdGEg0J7RgtCy0LXRgiBBUEkgKHJlc3BvbnNlLmRhdGEpLlxuXHQgKi9cblx0cmVuZGVyU2VydmljZXNTdGF0dXMoZGF0YSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgJHBhbmVsID0gc2VsZi4kc2VydmljZXNTdGF0dXM7XG5cdFx0aWYgKCEkcGFuZWwgfHwgJHBhbmVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRjb25zdCAkcm93cyA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXJvd3MnKTtcblx0XHRjb25zdCAkcGxhY2Vob2xkZXIgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1wbGFjZWhvbGRlcicpO1xuXHRcdGNvbnN0IHNob3dQbGFjZWhvbGRlciA9ICh0ZXh0KSA9PiB7XG5cdFx0XHRzZWxmLmxhc3RSZW5kZXJIYXNoID0gJyc7XG5cdFx0XHQkcm93cy5lbXB0eSgpO1xuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdCRwbGFjZWhvbGRlci5odG1sKGA8c3Bhbj4mbmJzcDske2VzYyh0ZXh0KX08L3NwYW4+YCkuc2hvdygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHtlc2ModGV4dCl9PC9kaXY+YCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0YXR1c2VzID0gKGRhdGEgJiYgZGF0YS5zdGF0dXNlcykgPyBkYXRhLnN0YXR1c2VzIDogbnVsbDtcblxuXHRcdC8vINCR0Y3QuiDQvNC+0LbQtdGCINCy0LXRgNC90YPRgtGMINGB0YLRgNC+0LrRgyAnTW9kdWxlIGRpc2FibGVkJyDQstC80LXRgdGC0L4g0LzQsNGB0YHQuNCy0LAuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHN0YXR1c2VzKSkge1xuXHRcdFx0Y29uc3QgdGV4dCA9ICh0eXBlb2Ygc3RhdHVzZXMgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQ/IHN0YXR1c2VzXG5cdFx0XHRcdDogc2VsZi50cignbW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZScsICdTdGF0dXMgdW5hdmFpbGFibGUnKTtcblx0XHRcdHNob3dQbGFjZWhvbGRlcih0ZXh0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQn9GA0L7Qv9GD0YHQutCw0LXQvCDQv9C10YDQtdGA0LjRgdC+0LLQutGDIERPTSwg0LXRgdC70Lgg0LTQsNC90L3Ri9C1INC90LUg0LjQt9C80LXQvdC40LvQuNGB0Ywg4oCUINGD0LHQuNGA0LDQtdGCXG5cdFx0Ly8g0LzQtdGA0YbQsNC90LjQtSDRgtCw0LHQu9C40YbRiyDQv9GA0Lgg0L7Qv9GA0L7RgdC1INGA0LDQtyDQsiAzINGB0LXQutGD0L3QtNGLLlxuXHRcdGNvbnN0IGhhc2ggPSBKU09OLnN0cmluZ2lmeShzdGF0dXNlcyk7XG5cdFx0aWYgKGhhc2ggPT09IHNlbGYubGFzdFJlbmRlckhhc2ggJiYgJHJvd3MuY2hpbGRyZW4oKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmhpZGUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQk9GA0YPQv9C/0LjRgNGD0LXQvCDQv9C+INC40LzQtdC90Lgg0YHQtdGA0LLQuNGB0LAuINCS0L3Rg9GC0YDQuCDQs9GA0YPQv9C/0Ysg4oCUINGB0YLRgNC+0LrQuCDQv9C+IGFyZWEgKNC60LDQvdCw0LvRiykuXG5cdFx0Y29uc3QgZ3JvdXBzID0ge307XG5cdFx0Y29uc3Qgb3JkZXIgPSBbXTtcblx0XHRzdGF0dXNlcy5mb3JFYWNoKChzdmMpID0+IHtcblx0XHRcdGlmICghc3ZjIHx8IHR5cGVvZiBzdmMgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5hbWUgPSAodHlwZW9mIHN2Yy5uYW1lID09PSAnc3RyaW5nJyAmJiBzdmMubmFtZS5sZW5ndGggPiAwKSA/IHN2Yy5uYW1lIDogJ3Vua25vd24nO1xuXHRcdFx0aWYgKCFncm91cHNbbmFtZV0pIHtcblx0XHRcdFx0Z3JvdXBzW25hbWVdID0gW107XG5cdFx0XHRcdG9yZGVyLnB1c2gobmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRncm91cHNbbmFtZV0ucHVzaChzdmMpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKG9yZGVyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0c2hvd1BsYWNlaG9sZGVyKHNlbGYudHIoJ21vZF9jdGlfU3RhdHVzRW1wdHknLCAnTm8gc2VydmljZXMgcmVwb3J0ZWQnKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g0JrQvtC70L7QvdC60LAgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCuyDigJQg0YLQvtC70YzQutC+INC60L7Qs9C00LAg0LXRgdGC0Ywg0YXQvtGC0Ywg0L7QtNC40L0g0YPQtNCw0LvRkdC90L3Ri9C5INGB0LXRgNCy0LjRgS5cblx0XHRjb25zdCBoYXNSZW1vdGUgPSBzdGF0dXNlcy5zb21lKChzKSA9PiBzICYmIHMubG9jYXRpb24gPT09ICdyZW1vdGUnKTtcblx0XHRjb25zdCBjb2xDb3VudCA9IGhhc1JlbW90ZSA/IDUgOiA0O1xuXG5cdFx0Y29uc3QgaGVhZCA9ICc8dGhlYWQ+PHRyPidcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xTdGF0dXMnLCAnU3RhdHVzJykpfTwvdGg+YFxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC1uYW1lXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xTZXJ2aWNlJywgJ1NlcnZpY2UnKSl9PC90aD5gXG5cdFx0XHQrIChoYXNSZW1vdGUgPyBgPHRoIGNsYXNzPVwiY3RpLWNvbC1sb2NcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbExvY2F0aW9uJywgJ0xvY2F0aW9uJykpfTwvdGg+YCA6ICcnKVxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFVwdGltZScsICdVcHRpbWUnKSl9PC90aD5gXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXZlcnNpb25cIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFZlcnNpb24nLCAnVmVyc2lvbicpKX08L3RoPmBcblx0XHRcdCsgJzwvdHI+PC90aGVhZD4nO1xuXG5cdFx0Y29uc3QgYm9keSA9IFtdO1xuXHRcdG9yZGVyLmZvckVhY2goKG5hbWUpID0+IHtcblx0XHRcdGNvbnN0IHJvd3MgPSBncm91cHNbbmFtZV07XG5cdFx0XHRjb25zdCBpc011bHRpID0gc2VsZi5tdWx0aUluc3RhbmNlU2VydmljZXNbbmFtZV0gPT09IHRydWUgfHwgcm93cy5sZW5ndGggPiAxO1xuXHRcdFx0aWYgKGlzTXVsdGkpIHtcblx0XHRcdFx0Ym9keS5wdXNoKGA8dHIgY2xhc3M9XCJjdGktc3ZjLWdyb3VwXCI+PHRkIGNvbHNwYW49XCIke2NvbENvdW50fVwiPmBcblx0XHRcdFx0XHQrIGA8aSBjbGFzcz1cImNvbW1lbnRzIGljb25cIj48L2k+JHtlc2Moc2VsZi5zZXJ2aWNlTGFiZWwobmFtZSkpfWBcblx0XHRcdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtY291bnRcIj4ke3Jvd3MubGVuZ3RofTwvc3Bhbj48L3RkPjwvdHI+YCk7XG5cdFx0XHRcdHJvd3MuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRcdFx0Ym9keS5wdXNoKHNlbGYucmVuZGVyU2VydmljZVJvdyhzdmMsIHRydWUsIGhhc1JlbW90ZSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJvZHkucHVzaChzZWxmLnJlbmRlclNlcnZpY2VSb3cocm93c1swXSwgZmFsc2UsIGhhc1JlbW90ZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0JHJvd3MuaHRtbCgnPHRhYmxlIGNsYXNzPVwidWkgY2VsbGVkIHN0cmlwZWQgY29tcGFjdCB1bnN0YWNrYWJsZSB0YWJsZSBjdGktc3RhdHVzLXRhYmxlXCI+J1xuXHRcdFx0KyBoZWFkICsgJzx0Ym9keT4nICsgYm9keS5qb2luKCcnKSArICc8L3Rib2R5PjwvdGFibGU+Jyk7XG5cdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9IGhhc2g7XG5cdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcGxhY2Vob2xkZXIuaGlkZSgpO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGC0LDQsdC70LjRhtGLICjRgdC10YDQstC40YEg0LjQu9C4INC60LDQvdCw0LspLlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gc3ZjINC30LDQv9C40YHRjCDQuNC3IHN0YXR1c2VzW11cblx0ICogQHBhcmFtIHtib29sZWFufSBncm91cGVkINGB0YLRgNC+0LrQsCDQv9C+0LQg0LPRgNGD0L/Qv9C+0LLRi9C8INC30LDQs9C+0LvQvtCy0LrQvtC8ICjQutCw0L3QsNC7INC80LXRgdGB0LXQvdC00LbQtdGA0LApXG5cdCAqIEBwYXJhbSB7Ym9vbGVhbn0gaGFzUmVtb3RlINC/0L7QutCw0LfRi9Cy0LDRgtGMINC70Lgg0LrQvtC70L7QvdC60YMgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCu1xuXHQgKiBAcmV0dXJucyB7c3RyaW5nfSBIVE1MICjQvtC00L3QsCA8dHI+LCDQv9C70Y7RgSA8dHI+INGBINC+0YjQuNCx0LrQvtC5INC/0YDQuCDQvdCw0LvQuNGH0LjQuClcblx0ICovXG5cdHJlbmRlclNlcnZpY2VSb3coc3ZjLCBncm91cGVkLCBoYXNSZW1vdGUpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRjb25zdCBjb2xDb3VudCA9IGhhc1JlbW90ZSA/IDUgOiA0O1xuXG5cdFx0Y29uc3Qgc3RhdGVSYXcgPSAodHlwZW9mIHN2Yy5zdGF0ZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnN0YXRlLmxlbmd0aCA+IDApID8gc3ZjLnN0YXRlIDogJ3Vua25vd24nO1xuXHRcdGNvbnN0IGNhbm9uID0gc2VsZi5jYW5vblN0YXRlKHN0YXRlUmF3KTtcblx0XHRjb25zdCBsZWRDbGFzcyA9IHNlbGYuc3RhdGVMZWRDbGFzc1tjYW5vbl0gfHwgJ3dhcm4nO1xuXHRcdGNvbnN0IHN0YXRlVGV4dCA9IHNlbGYuc3RhdGVUZXh0KHN0YXRlUmF3KTtcblxuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ3JvdXBlZFxuXHRcdFx0PyBzZWxmLnNob3J0QXJlYShzdmMuYXJlYSlcblx0XHRcdDogc2VsZi5zZXJ2aWNlTGFiZWwoc3ZjLm5hbWUpO1xuXHRcdGNvbnN0IG5hbWVJY29uID0gZ3JvdXBlZCA/ICc8aSBjbGFzcz1cImhhc2h0YWcgaWNvblwiPjwvaT4nIDogJyc7XG5cblx0XHRjb25zdCB1cHRpbWUgPSAodHlwZW9mIHN2Yy51cHRpbWUgPT09ICdzdHJpbmcnICYmIHN2Yy51cHRpbWUubGVuZ3RoID4gMCkgPyBzdmMudXB0aW1lIDogJyc7XG5cdFx0Y29uc3QgdmVyc2lvbiA9ICh0eXBlb2Ygc3ZjLnZlcnNpb24gPT09ICdzdHJpbmcnICYmIHN2Yy52ZXJzaW9uLmxlbmd0aCA+IDApID8gc3ZjLnZlcnNpb24gOiAnJztcblx0XHRjb25zdCBsYXN0RXJyb3IgPSAodHlwZW9mIHN2Yy5sYXN0X2Vycm9yID09PSAnc3RyaW5nJyAmJiBzdmMubGFzdF9lcnJvci5sZW5ndGggPiAwKSA/IHN2Yy5sYXN0X2Vycm9yIDogJyc7XG5cdFx0Y29uc3QgZGFzaCA9ICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+JztcblxuXHRcdGNvbnN0IHN0YXR1c0NlbGwgPSBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWxlZCAke2VzYyhsZWRDbGFzcyl9XCIgdGl0bGU9XCIke2VzYyhzdGF0ZVJhdyl9XCI+PC9zcGFuPmBcblx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1zdGF0ZVwiPiR7ZXNjKHN0YXRlVGV4dCl9PC9zcGFuPmA7XG5cblx0XHRjb25zdCBuYW1lQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbmFtZSR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1jaGFubmVsJyA6ICcnfVwiPiR7bmFtZUljb259JHtlc2MoZGlzcGxheU5hbWUpfTwvc3Bhbj5gO1xuXG5cdFx0Y29uc3QgbG9jQ2VsbCA9IGhhc1JlbW90ZSA/IGA8dGQgY2xhc3M9XCJjdGktY29sLWxvY1wiPiR7c2VsZi5sb2NhdGlvbkJhZGdlKHN2Yy5sb2NhdGlvbil9PC90ZD5gIDogJyc7XG5cblx0XHRjb25zdCBjZWxscyA9IGA8dGQgY2xhc3M9XCJjdGktY29sLXN0YXR1c1wiPiR7c3RhdHVzQ2VsbH08L3RkPmBcblx0XHRcdCsgYDx0ZCBjbGFzcz1cImN0aS1jb2wtbmFtZVwiPiR7bmFtZUNlbGx9PC90ZD5gXG5cdFx0XHQrIGxvY0NlbGxcblx0XHRcdCsgYDx0ZCBjbGFzcz1cImN0aS1jb2wtdXB0aW1lXCI+JHt1cHRpbWUgIT09ICcnID8gZXNjKHVwdGltZSkgOiBkYXNofTwvdGQ+YFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC12ZXJzaW9uXCI+JHt2ZXJzaW9uICE9PSAnJyA/IGVzYyh2ZXJzaW9uKSA6IGRhc2h9PC90ZD5gO1xuXG5cdFx0bGV0IGh0bWwgPSBgPHRyIGNsYXNzPVwiY3RpLXN2Yy1yb3cke2dyb3VwZWQgPyAnIGN0aS1zdmMtc3Vicm93JyA6ICcnfVwiYFxuXHRcdFx0KyBgIGRhdGEtc3ZjPVwiJHtlc2Moc3ZjLm5hbWUgfHwgJycpfVwiIGRhdGEtYXJlYT1cIiR7ZXNjKHN2Yy5hcmVhIHx8ICcnKX1cIj4ke2NlbGxzfTwvdHI+YDtcblxuXHRcdC8vIGxhc3RfZXJyb3IgZnJvbSBtb25pdG9yZCBpcyBzdGlja3kgKFwibGFzdCBlcnJvciBldmVyIHNlZW5cIikgYW5kIGlzIE5PVFxuXHRcdC8vIGNsZWFyZWQgb24gcmVjb3Zlcnkg4oCUIGl0IHN0YXlzIGluIHRoZSBBUEkgcGF5bG9hZCBvbiBwdXJwb3NlIChoYW5keSBmb3Jcblx0XHQvLyBkZWJ1Z2dpbmcpLiBTdXJmYWNlIGl0IHRvIHRoZSBvcGVyYXRvciBPTkxZIHdoZW4gdGhlIHNlcnZpY2UgaXMgYWN0dWFsbHlcblx0XHQvLyBpbiBhIHJlZCBlcnJvciBzdGF0ZS4gQSByZWNvdmVyZWQgZ2xpdGNoIChzdGF0ZT1vaykgb3IgYSBzZXJ2aWNlIHN0aWxsXG5cdFx0Ly8gc3RhcnRpbmcvd2FybWluZyB1cCAoc3RhdGU9c3RhcnRpbmcgLT4gd2FybiBMRUQsIGluY2wuIHRoZSBzdGFydHVwIGdyYWNlXG5cdFx0Ly8gd2luZG93KSBtdXN0IE5PVCBwcmludCBzdGFsZSBlcnJvciB0ZXh0IOKAlCBvdGhlcndpc2Ugd2UnZCBiZSByZXBvcnRpbmcgYVxuXHRcdC8vIHNlcnZpY2UgZmFpbHVyZSBpbiB0aGUgZmlyc3QgbWludXRlLCB3aGljaCBpcyBleGFjdGx5IHdoYXQgd2Ugc3VwcHJlc3MuXG5cdFx0aWYgKGxhc3RFcnJvciAhPT0gJycgJiYgbGVkQ2xhc3MgPT09ICdlcnJvcicpIHtcblx0XHRcdGh0bWwgKz0gYDx0ciBjbGFzcz1cImN0aS1zdmMtZXJyb3Itcm93XCI+PHRkIGNvbHNwYW49XCIke2NvbENvdW50fVwiPmBcblx0XHRcdFx0KyBgPGkgY2xhc3M9XCJleGNsYW1hdGlvbiB0cmlhbmdsZSBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgPHNwYW4gdGl0bGU9XCIke2VzYyhsYXN0RXJyb3IpfVwiPiR7ZXNjKHNlbGYudHJ1bmNhdGUobGFzdEVycm9yLCAyMDApKX08L3NwYW4+YFxuXHRcdFx0XHQrICc8L3RkPjwvdHI+Jztcblx0XHR9XG5cblx0XHRyZXR1cm4gaHRtbDtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC50LTQtiDRgNCw0YHQv9C+0LvQvtC20LXQvdC40Y8g0YHQtdGA0LLQuNGB0LA6INGP0YDQutC40LkgwqtWUFPCuyDQtNC70Y8g0LLRi9C90LXRgdC10L3QvdGL0YUg0LrQsNC90LDQu9C+0LIg0Lhcblx0ICog0L/RgNC40LPQu9GD0YjRkdC90L3Ri9C5IMKr0JvQvtC60LDQu9GM0L3QvsK7INC00LvRjyDQstGB0LXQs9C+INC+0YHRgtCw0LvRjNC90L7Qs9C+LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbG9jYXRpb24gJ3JlbW90ZScgfCAnbG9jYWwnIHwgdW5kZWZpbmVkXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUxcblx0ICovXG5cdGxvY2F0aW9uQmFkZ2UobG9jYXRpb24pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRpZiAobG9jYXRpb24gPT09ICdyZW1vdGUnKSB7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwidWkgdGVhbCBsYWJlbCBjdGktbG9jLWJhZGdlXCI+PGkgY2xhc3M9XCJjbG91ZCBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvblJlbW90ZScsICdWUFMnKSl9PC9zcGFuPmA7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ2xvY2FsJykge1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cImN0aS1sb2MtbG9jYWxcIj48aSBjbGFzcz1cImhvbWUgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYCR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfTG9jYXRpb25Mb2NhbCcsICdMb2NhbCcpKX08L3NwYW4+YDtcblx0XHR9XG5cdFx0cmV0dXJuICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+Jztcblx0fSxcblxuXHQvKipcblx0ICog0JrQsNC90L7QvdC40LfQsNGG0LjRjyDRgdCy0L7QsdC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0L7RgdGC0L7Rj9C90LjRjyDQsiDQuNC30LLQtdGB0YLQvdGL0Lkg0LrQu9GO0Ycg0LTQu9GPINC70LDQvNC/0L7Rh9C60Lgg0Lhcblx0ICog0L/QtdGA0LXQstC+0LTQsC4gbW9uaXRvcmQg0LzQvtC20LXRgiDQv9GA0LjRgdGL0LvQsNGC0Ywgwqthd2FpdGluZyBhdXRob3JpemF0aW9uIGNvZGXCuyDQuCDQv9GALlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGNhbm9uU3RhdGUoc3RhdGUpIHtcblx0XHRjb25zdCBzID0gU3RyaW5nKHN0YXRlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChzID09PSAnJykge1xuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZigncXInKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAncXJjb2RlJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZignYXdhaXRpbmcnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCdyZWF1dGgnKSAhPT0gLTFcblx0XHRcdHx8IHMuaW5kZXhPZignYXV0aF9yZXF1aXJlZCcpICE9PSAtMSB8fCBzLmluZGV4T2YoJzJmYScpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdyZWF1dGgnO1xuXHRcdH1cblx0XHRpZiAocyA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dGhlbnRpY2F0ZWQnO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fSxcblxuXHQvKipcblx0ICog0KXQtdC70L/QtdGAINC/0LXRgNC10LLQvtC00LAg0YEg0YTQvtC70LHRjdC60L7QvC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGtleSDQutC70Y7RhyBnbG9iYWxUcmFuc2xhdGVcblx0ICogQHBhcmFtIHtzdHJpbmd9IGZhbGxiYWNrINC30L3QsNGH0LXQvdC40LUg0L/QviDRg9C80L7Qu9GH0LDQvdC40Y5cblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRyKGtleSwgZmFsbGJhY2spIHtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUg0LrQsNC90LDQu9CwL9GB0LXRgNCy0LjRgdCwICjQvdCw0L/RgNC40LzQtdGAIMKr0J/QvtC00LrQu9GO0YfRkdC9wrssXG5cdCAqIMKr0KLRgNC10LHRg9C10YIg0LDQstGC0L7RgNC40LfQsNGG0LjQuMK7KS4g0KHQvdCw0YfQsNC70LAg0LjRidC10Lwg0YLQvtGH0L3Ri9C5INC60LvRjtGHLCDQt9Cw0YLQtdC8INC/0L4g0LrQsNC90L7QvdC40YfQtdGB0LrQvtC80YNcblx0ICog0YHQvtGB0YLQvtGP0L3QuNGOLCDQt9Cw0YLQtdC8IOKAlCDQsNC90LPQu9C40LnRgdC60LjQuSDRhNC+0LvQsdGN0LosINC4INCyINC60YDQsNC50L3QtdC8INGB0LvRg9GH0LDQtSDQuNGB0YXQvtC00L3Rg9GOINGB0YLRgNC+0LrRgy5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0ZVRleHQoc3RhdGUpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IHJhdyA9IFN0cmluZyhzdGF0ZSB8fCAnJyk7XG5cdFx0Ly8g0KLQvtGH0L3Ri9C5INC60LvRjtGHINC/0L7QtCDQuNGB0YXQvtC00L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAo0L3QsCDRgdC70YPRh9Cw0Lkg0YHQv9C10YbQuNGE0LjRh9C90YvRhSDQv9C10YDQtdCy0L7QtNC+0LIpLlxuXHRcdGNvbnN0IGV4YWN0S2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtyYXd9YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2V4YWN0S2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtleGFjdEtleV07XG5cdFx0fVxuXHRcdGNvbnN0IGNhbm9uID0gc2VsZi5jYW5vblN0YXRlKHJhdyk7XG5cdFx0Y29uc3QgY2Fub25LZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke2Nhbm9ufWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbY2Fub25LZXldO1xuXHRcdH1cblx0XHRjb25zdCBmYWxsYmFjayA9IHtcblx0XHRcdG9rOiAnT0snLFxuXHRcdFx0YXV0aGVudGljYXRlZDogJ0F1dGhlbnRpY2F0ZWQnLFxuXHRcdFx0Y29ubmVjdGVkOiAnQ29ubmVjdGVkIHRvIDFDJyxcblx0XHRcdHdhaXRpbmdfMWM6ICdXYWl0aW5nIGZvciAxQyB0byBjb25uZWN0Jyxcblx0XHRcdGNvbm5lY3RpbmdfMWM6ICdDb25uZWN0aW5nIHRvIDFD4oCmJyxcblx0XHRcdGVycm9yOiAnRXJyb3InLFxuXHRcdFx0dW5rbm93bjogJ1Vua25vd24nLFxuXHRcdFx0cGVuZGluZzogJ1BlbmRpbmcnLFxuXHRcdFx0c3RhcnRpbmc6ICdTdGFydGluZycsXG5cdFx0XHRxcmNvZGU6ICdBd2FpdGluZyBRUi1jb2RlIGF1dGhvcml6YXRpb24nLFxuXHRcdFx0cmVhdXRoOiAnQXV0aG9yaXphdGlvbiByZXF1aXJlZCcsXG5cdFx0fTtcblx0XHRyZXR1cm4gZmFsbGJhY2tbY2Fub25dIHx8IHJhdztcblx0fSxcblxuXHQvKipcblx0ICog0JrQvtGA0L7RgtC60L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBhcmVhLUdVSUQg4oCUINC/0LXRgNCy0YvQtSA4INGB0LjQvNCy0L7Qu9C+0LIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBhcmVhXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzaG9ydEFyZWEoYXJlYSkge1xuXHRcdGlmICh0eXBlb2YgYXJlYSAhPT0gJ3N0cmluZycgfHwgYXJlYS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKGFyZWEubGVuZ3RoIDw9IDEyKSB7XG5cdFx0XHRyZXR1cm4gYXJlYTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FyZWEuc3Vic3RyaW5nKDAsIDgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XG5cdFx0aWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChzdHIubGVuZ3RoIDw9IG1heCkge1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LfQvtC/0LDRgdC90YvQuSDRjdC60YDQsNC90LXRgCBIVE1MLlxuXHQgKlxuXHQgKiBAcGFyYW0geyp9IHZhbHVlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRlc2NhcGVIdG1sKHZhbHVlKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSlcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblx0fSxcblxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0L7QsdGJ0LXQs9C+INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyDigJQg0YHRgtGA0L7QutCwLdGB0LLQvtC00LrQsCDQstCy0LXRgNGF0YMg0LLQutC70LDQtNC60LggwqvQodGC0LDRgtGD0YHCu1xuXHQgKiAo0LfQsNC80LXQvdC40LvQsCDQv9GA0LXQttC90LjQuSDRg9Cz0LvQvtCy0L7QuSDQsdC10LnQtNC2ICNzdGF0dXMpLiDQoNC40YHRg9C10YIg0YbQstC10YLQvdGD0Y4g0LvQsNC80L/QvtGH0LrRgyArINGC0LXQutGB0YI7XG5cdCAqINC00LvRjyDQutGA0LDRgdC90L7Qs9C+INGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LbQtdGCINCd0JDQl9CS0JDQotCsINC60L7QvdC60YDQtdGC0L3Ri9C1INC/0YDQvtCx0LvQtdC80L3Ri9C1INGB0LXRgNCy0LjRgdGLLCDQsCDQtNC70Y9cblx0ICog0L/RgNC+0LPRgNC10YHRgdCwIOKAlCDQv9C+0LrQsNC30LDRgtGMINC40YUg0LrQvtC70LjRh9C10YHRgtCy0L4uXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXMg0LrQu9GO0Ycg0YHQvtGB0YLQvtGP0L3QuNGPXG5cdCAqIEBwYXJhbSB7e25hbWVzPzogc3RyaW5nW10sIGNvdW50PzogbnVtYmVyfX0gW2luZm9dINC00L7Qvy4g0LTQsNC90L3Ri9C1INC00LvRjyDRgtC10LrRgdGC0LBcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMsIGluZm8pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRzID0gc2VsZi4kbW9kdWxlU3RhdHVzO1xuXHRcdGlmICghJHMgfHwgJHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBpbmZvIHx8IHt9O1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRjb25zdCBzcGlubmVyID0gJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+Jztcblx0XHRjb25zdCB0ciA9IChrZXksIGZhbGxiYWNrKSA9PiBzZWxmLnRyKGtleSwgZmFsbGJhY2spO1xuXG5cdFx0bGV0IGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRsZXQgbGVkID0gJ3Vua25vd24nO1xuXHRcdGxldCBpY29uID0gJyc7XG5cdFx0bGV0IHRleHQgPSAnJztcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JlZW4nO1xuXHRcdFx0XHRsZWQgPSAnb2snO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGVkJywgJ1RoZSBtb2R1bGUgd29ya3Mgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0bGV0IHByb2dyZXNzID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzJywgJ01vZHVsZSBzZXJ2aWNlcyBhcmUgc3RhcnRpbmcnKTtcblx0XHRcdFx0aWYgKGRhdGEuY291bnQgJiYgZGF0YS5jb3VudCA+IDApIHtcblx0XHRcdFx0XHRwcm9ncmVzcyArPSBgICgke2RhdGEuY291bnR9KWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGV4dCA9IHByb2dyZXNzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdGluZyc6XG5cdFx0XHRcdC8vIGxvbmdwb29sOiAxQyBjb25uZWN0cyB0byB1czsgd2UgYXJlIHdhaXRpbmcgZm9yIGl0LlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX3N0YXRlX3dhaXRpbmdfMWMnLCAnV2FpdGluZyBmb3IgMUMgdG8gY29ubmVjdCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDQ29ubmVjdGluZyc6XG5cdFx0XHRcdC8vIHdlYnNlcnZpY2U6IHdlIGFyZSByZWFjaGluZyBvdXQgdG8gMUMuXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS15ZWxsb3cnO1xuXHRcdFx0XHRsZWQgPSAnd2Fybic7XG5cdFx0XHRcdGljb24gPSBzcGlubmVyO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfc3RhdGVfY29ubmVjdGluZ18xYycsICdDb25uZWN0aW5nIHRvIDFD4oCmJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBBcnJheS5pc0FycmF5KGRhdGEubmFtZXMpID8gZGF0YS5uYW1lcy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcblx0XHRcdFx0aWYgKG5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0ZXh0ID0gYCR7dHIoJ21vZF9jdGlfU3RhdHVzUHJvYmxlbScsICdQcm9ibGVtJyl9OiAke25hbWVzLmpvaW4oJywgJyl9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvbkVycm9yJywgJ0ZhaWx1cmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Rpc2FibGVkJzpcblx0XHRcdFx0Y2xzID0gJ2N0aS1zdW1tYXJ5LWdyZXknO1xuXHRcdFx0XHRsZWQgPSAndW5rbm93bic7XG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCcsICdNb2R1bGUgaXMgZGlzYWJsZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XG5cdFx0XHRcdGxlZCA9ICd1bmtub3duJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Rpc2Nvbm5lY3RlZCcsICdEaXNjb25uZWN0ZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX1VwZGF0ZVN0YXR1cycsICdVcGRhdGluZyBzdGF0dXPigKYnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcicsICdGYWlsdXJlJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdCRzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2N0aS1zdW1tYXJ5LWdyZXkgY3RpLXN1bW1hcnktZ3JlZW4gY3RpLXN1bW1hcnkteWVsbG93IGN0aS1zdW1tYXJ5LXJlZCcpXG5cdFx0XHQuYWRkQ2xhc3MoY2xzKVxuXHRcdFx0Lmh0bWwoYDxzcGFuIGNsYXNzPVwiY3RpLXN1bW1hcnktbGVkICR7ZXNjKGxlZCl9XCI+PC9zcGFuPmBcblx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3VtbWFyeS10ZXh0XCI+JHtpY29ufSR7ZXNjKHRleHQpfTwvc3Bhbj5gKTtcblx0fSxcbn07XG4iXX0=