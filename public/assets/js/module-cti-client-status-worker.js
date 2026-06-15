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

    var statuses = data && data.statuses ? data.statuses : null; // Phase C: per-service failback eligibility + warm-standby mirror age.

    self.remoteFailback = data && data.remote_failback && _typeof(data.remote_failback) === 'object' ? data.remote_failback : {}; // Бэк может вернуть строку 'Module disabled' вместо массива.

    if (!Array.isArray(statuses)) {
      var text = typeof statuses === 'string' ? statuses : self.tr('mod_cti_StatusUnavailable', 'Status unavailable');
      showPlaceholder(text);
      return;
    } // Пропускаем перерисовку DOM, если данные не изменились — убирает
    // мерцание таблицы при опросе раз в 3 секунды. Включаем remoteFailback в
    // хэш, иначе появление кнопки/обновление возраста копии не перерисуется.


    var hash = JSON.stringify({
      s: statuses,
      f: self.remoteFailback
    });

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
      } // Phase C: offer "bring back to local" once per service group whose
      // channels still live on the VPS (derive the base svc from a
      // "chats.<area>" group name).


      var svcKey = name.indexOf('.') >= 0 ? name.split('.')[0] : name;
      var fbRow = self.failbackControlRow(svcKey, colCount);

      if (fbRow !== '') {
        body.push(fbRow);
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
   * Phase C: строка с кнопкой «вернуть на локаль» + возрастом локальной копии,
   * показывается для сервиса, чьи каналы ещё на VPS (can_failback).
   *
   * @param {string} svc базовое имя сервиса (chats|tg|max)
   * @param {number} colCount число колонок таблицы
   * @returns {string} HTML (<tr>) либо '' если failback не применим
   */
  failbackControlRow: function failbackControlRow(svc, colCount) {
    var self = moduleCTIClientConnectionCheckWorker;
    var esc = self.escapeHtml;
    var info = self.remoteFailback ? self.remoteFailback[svc] : null;

    if (!info || info.can_failback !== true) {
      return '';
    }

    var label = self.tr('mod_cti_FailbackToLocal', 'Bring back to local');
    var age = self.mirrorAgeText(info.last_mirror_ts);
    return "<tr class=\"cti-failback-row\"><td colspan=\"".concat(colCount, "\">") + "<button class=\"ui tiny basic orange button cti-failback-btn\" data-svc=\"".concat(esc(svc), "\">") + "<i class=\"reply icon\"></i>".concat(esc(label), "</button>") + "<span class=\"cti-failback-age\">".concat(esc(age), "</span>") + '</td></tr>';
  },

  /**
   * Phase C: человекочитаемый возраст локальной копии сессии (warm-standby
   * mirror). ts — unix-секунды; 0/пусто => «копии ещё нет».
   *
   * @param {number} ts
   * @returns {string}
   */
  mirrorAgeText: function mirrorAgeText(ts) {
    var self = moduleCTIClientConnectionCheckWorker;
    var n = parseInt(ts, 10);

    if (!n || n <= 0) {
      return self.tr('mod_cti_MirrorNever', 'local copy: none yet');
    }

    var secs = Math.max(0, Math.floor(Date.now() / 1000) - n);
    var human;

    if (secs < 90) {
      human = "".concat(secs, "s");
    } else if (secs < 5400) {
      human = "".concat(Math.round(secs / 60), "m");
    } else {
      human = "".concat(Math.round(secs / 3600), "h");
    }

    return self.tr('mod_cti_MirrorAge', 'local copy: %age% ago').replace('%age%', human);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJjb25uZWN0ZWQiLCJ3YWl0aW5nXzFjIiwiY29ubmVjdGluZ18xYyIsImVycm9yIiwiZmFpbCIsImZhaWxlZCIsImRvd24iLCJzdG9wcGVkIiwidW5rbm93biIsInBlbmRpbmciLCJzdGFydGluZyIsInFyY29kZSIsInJlYXV0aCIsImF1dGgiLCJhdXRoX3JlcXVpcmVkIiwid2FybiIsIndhcm5pbmciLCJtdWx0aUluc3RhbmNlU2VydmljZXMiLCJjaGF0cyIsInRnIiwibWF4IiwiaW5pdGlhbGl6ZSIsInJlc3RhcnRXb3JrZXIiLCJjaGFuZ2VTdGF0dXMiLCJ3aW5kb3ciLCJjbGVhclRpbWVvdXQiLCJ3b3JrZXIiLCJjaGVja2JveCIsImFwaSIsInVybCIsIkNvbmZpZyIsInBieFVybCIsIm9uIiwic3VjY2Vzc1Rlc3QiLCJQYnhBcGkiLCJvbkNvbXBsZXRlIiwic2V0VGltZW91dCIsIm9uUmVzcG9uc2UiLCJyZXNwb25zZSIsInJlbW92ZSIsImRhdGEiLCJub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJzdGFydHVwX2dyYWNlIiwic2VsZiIsImNybTFjIiwiaGFzRXJyb3IiLCJoYXNTdGFydGluZyIsImVyck5hbWVzIiwic3RhcnROYW1lcyIsImZvckVhY2giLCJzIiwibmFtZSIsInN0YXRlIiwic2VydmljZUxhYmVsIiwiZXJyb3JMaXN0Iiwic3RhcnRMaXN0IiwibmFtZXMiLCJjb3VudCIsInJlbmRlckRpc2FibGVkUGFuZWwiLCJhY3RpdmUiLCJyZW1vdGVfbWlncmF0aW9uX2FjdGl2ZSIsInNlcnZpY2VzIiwicmVtb3RlX21pZ3JhdGlvbl9zZXJ2aWNlcyIsImRpc3BhdGNoRXZlbnQiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIiRwYW5lbCIsImxhYmVsIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCIsIiRyb3dzIiwiJHBsYWNlaG9sZGVyIiwiZW1wdHkiLCJodG1sIiwiZXNjYXBlSHRtbCIsInNob3ciLCJlc2MiLCJzaG93UGxhY2Vob2xkZXIiLCJ0ZXh0IiwicmVtb3RlRmFpbGJhY2siLCJyZW1vdGVfZmFpbGJhY2siLCJ0ciIsImhhc2giLCJmIiwiY2hpbGRyZW4iLCJoaWRlIiwiZ3JvdXBzIiwib3JkZXIiLCJzdmMiLCJwdXNoIiwiaGFzUmVtb3RlIiwic29tZSIsImxvY2F0aW9uIiwiY29sQ291bnQiLCJoZWFkIiwiYm9keSIsInJvd3MiLCJpc011bHRpIiwicmVuZGVyU2VydmljZVJvdyIsInN2Y0tleSIsImluZGV4T2YiLCJzcGxpdCIsImZiUm93IiwiZmFpbGJhY2tDb250cm9sUm93Iiwiam9pbiIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImNhbm9uIiwiY2Fub25TdGF0ZSIsImxlZENsYXNzIiwic3RhdGVUZXh0IiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwibmFtZUljb24iLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsImRhc2giLCJzdGF0dXNDZWxsIiwibmFtZUNlbGwiLCJsb2NDZWxsIiwibG9jYXRpb25CYWRnZSIsImNlbGxzIiwidHJ1bmNhdGUiLCJpbmZvIiwiY2FuX2ZhaWxiYWNrIiwiYWdlIiwibWlycm9yQWdlVGV4dCIsImxhc3RfbWlycm9yX3RzIiwidHMiLCJuIiwicGFyc2VJbnQiLCJzZWNzIiwiTWF0aCIsImZsb29yIiwiRGF0ZSIsIm5vdyIsImh1bWFuIiwicm91bmQiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImtleSIsImZhbGxiYWNrIiwibWFwIiwibW9uaXRvcmQiLCJuYXRzIiwicHJveHkiLCJyYXciLCJleGFjdEtleSIsImNhbm9uS2V5Iiwic3Vic3RyaW5nIiwic3RyIiwidmFsdWUiLCJzdGF0dXMiLCIkcyIsInNwaW5uZXIiLCJjbHMiLCJsZWQiLCJpY29uIiwicHJvZ3Jlc3MiLCJmaWx0ZXIiLCJCb29sZWFuIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsSUFBTUEsb0NBQW9DLEdBQUc7QUFDNUNDLEVBQUFBLFFBQVEsRUFBRUMsQ0FBQyxDQUFDLHlCQUFELENBRGlDO0FBRTVDQyxFQUFBQSxhQUFhLEVBQUVELENBQUMsQ0FBQyx1QkFBRCxDQUY0QjtBQUc1Q0UsRUFBQUEsaUJBQWlCLEVBQUVGLENBQUMsQ0FBQywwQkFBRCxDQUh3QjtBQUk1Q0csRUFBQUEsWUFBWSxFQUFFSCxDQUFDLENBQUMsb0JBQUQsQ0FKNkI7QUFLNUNJLEVBQUFBLGFBQWEsRUFBRUosQ0FBQyxDQUFDLHFCQUFELENBTDRCO0FBTTVDSyxFQUFBQSxhQUFhLEVBQUVMLENBQUMsQ0FBQyxlQUFELENBTjRCO0FBTzVDTSxFQUFBQSxVQUFVLEVBQUVOLENB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SUFBSSxHQUFHRyxFQUFFLENBQUMsc0JBQUQsRUFBeUIsY0FBekIsQ0FBVDtBQUNBOztBQUNELFdBQUssVUFBTDtBQUNDNkUsUUFBQUEsR0FBRyxHQUFHLGtCQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxTQUFOO0FBQ0FDLFFBQUFBLElBQUksR0FBR0gsT0FBUDtBQUNBL0UsUUFBQUEsSUFBSSxHQUFHRyxFQUFFLENBQUMsc0JBQUQsRUFBeUIsa0JBQXpCLENBQVQ7QUFDQTs7QUFDRDtBQUNDNkUsUUFBQUEsR0FBRyxHQUFHLGlCQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxPQUFOO0FBQ0FqRixRQUFBQSxJQUFJLEdBQUdHLEVBQUUsQ0FBQyx5QkFBRCxFQUE0QixTQUE1QixDQUFUO0FBQ0E7QUE5REY7O0FBaUVBMkUsSUFBQUEsRUFBRSxDQUNBUSxXQURGLENBQ2MsdUVBRGQsRUFFRUMsUUFGRixDQUVXUCxHQUZYLEVBR0VyRixJQUhGLENBR08sd0NBQWdDRyxHQUFHLENBQUNtRixHQUFELENBQW5DLDZEQUMrQkMsSUFEL0IsU0FDc0NwRixHQUFHLENBQUNFLElBQUQsQ0FEekMsWUFIUDtBQUtBO0FBM3RCMkMsQ0FBN0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWlrb1BCWCAtIGZyZWUgcGhvbmUgc3lzdGVtIGZvciBzbWFsbCBidXNpbmVzc1xuICogQ29weXJpZ2h0IChDKSAyMDE3LTIwMjEgQWxleGV5IFBvcnRub3YgYW5kIE5pa29sYXkgQmVrZXRvdlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gKiBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICogdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbjsgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAqIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gKiBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICogTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cbiAqXG4gKiBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS5cbiAqIElmIG5vdCwgc2VlIDxodHRwczovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4gKi9cblxuLyogZ2xvYmFsIGdsb2JhbFRyYW5zbGF0ZSwgRm9ybSwgQ29uZmlnLCBQYnhBcGkgKi9cblxuLyoqXG4gKiDQotC10YHRgtC40YDQvtCy0LDQvdC40LUg0YHQvtC10LTQuNC90LXQvdC40Y8g0LzQvtC00YPQu9GPINGBIDHQoSArINGA0LXQvdC00LXRgCDQv9Cw0L3QtdC70Lgg0YHRgtCw0YLRg9GB0L7QsiDRgdC10YDQstC40YHQvtCyLlxuICovXG5jb25zdCBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIgPSB7XG5cdCRmb3JtT2JqOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybScpLFxuXHQkc3RhdHVzVG9nZ2xlOiAkKCcjbW9kdWxlLXN0YXR1cy10b2dnbGUnKSxcblx0JHdlYlNlcnZpY2VUb2dnbGU6ICQoJyN3ZWItc2VydmljZS1tb2RlLXRvZ2dsZScpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjY3RpLXN0YXR1cy1zdW1tYXJ5JyksXG5cdCRzdWJtaXRCdXR0b246ICQoJyNzdWJtaXRidXR0b24nKSxcblx0JGRlYnVnSW5mbzogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gc3BhbiNkZWJ1Zy1pbmZvJyksXG5cdCRzZXJ2aWNlc1N0YXR1czogJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMnKSxcblx0dGltZU91dDogMzAwMCxcblx0dGltZU91dEhhbmRsZTogJycsXG5cdGVycm9yQ291bnRzOiAwLFxuXHRsYXN0UmVuZGVySGFzaDogJycsXG5cblx0LyoqXG5cdCAqINCc0LDQv9C/0LjQvdCzIHN0YXRlIC0+IENTUy3QutC70LDRgdGBINC70LDQvNC/0L7Rh9C60LguXG5cdCAqINCb0Y7QsdC+0LUg0L3QtdC40LfQstC10YHRgtC90L7QtSDRgdC+0YHRgtC+0Y/QvdC40LUgLT4g0LbRkdC70YLQvtC1ICh3YXJuKS5cblx0ICovXG5cdHN0YXRlTGVkQ2xhc3M6IHtcblx0XHRvazogJ29rJyxcblx0XHRhdXRoZW50aWNhdGVkOiAnb2snLFxuXHRcdGNvbm5lY3RlZDogJ29rJyxcblx0XHR3YWl0aW5nXzFjOiAnd2FybicsXG5cdFx0Y29ubmVjdGluZ18xYzogJ3dhcm4nLFxuXHRcdGVycm9yOiAnZXJyb3InLFxuXHRcdGZhaWw6ICdlcnJvcicsXG5cdFx0ZmFpbGVkOiAnZXJyb3InLFxuXHRcdGRvd246ICdlcnJvcicsXG5cdFx0c3RvcHBlZDogJ2Vycm9yJyxcblx0XHR1bmtub3duOiAndW5rbm93bicsXG5cdFx0cGVuZGluZzogJ3dhcm4nLFxuXHRcdHN0YXJ0aW5nOiAnd2FybicsXG5cdFx0cXJjb2RlOiAnd2FybicsXG5cdFx0cmVhdXRoOiAnd2FybicsXG5cdFx0YXV0aDogJ3dhcm4nLFxuXHRcdGF1dGhfcmVxdWlyZWQ6ICd3YXJuJyxcblx0XHR3YXJuOiAnd2FybicsXG5cdFx0d2FybmluZzogJ3dhcm4nLFxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC10YDQstC40YHRiywg0LrQvtGC0L7RgNGL0LUg0LzQvtCz0YPRgiDQuNC00YLQuCDQsiDQvdC10YHQutC+0LvRjNC60LjRhSDQuNC90YHRgtCw0L3RgdCw0YUg0YEg0YDQsNC30L3Ri9C8IGFyZWEuXG5cdCAqL1xuXHRtdWx0aUluc3RhbmNlU2VydmljZXM6IHtcblx0XHRjaGF0czogdHJ1ZSxcblx0XHR0ZzogdHJ1ZSxcblx0XHRtYXg6IHRydWUsXG5cdH0sXG5cblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVzdGFydFdvcmtlcigpO1xuXHR9LFxuXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdVcGRhdGluZycpO1xuXHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIoKTtcblx0fSxcblxuXHR3b3JrZXIoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc3RhdHVzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdCQuYXBpKHtcblx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9jaGVja2AsXG5cdFx0XHRcdG9uOiAnbm93Jyxcblx0XHRcdFx0c3VjY2Vzc1Rlc3Q6IFBieEFwaS5zdWNjZXNzVGVzdCxcblx0XHRcdFx0b25Db21wbGV0ZSgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcixcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uUmVzcG9uc2UocmVzcG9uc2UpIHtcblx0XHRcdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhudWxsKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZW5kZXIgc2VydmljZXMgc3RhdHVzIHBhbmVsIGZvciBib3RoIHN1Y2Nlc3MgYW5kIHBhcnRpYWwgcmVzcG9uc2VzLlxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlc1N0YXR1cyhyZXNwb25zZS5kYXRhKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhyZXNwb25zZS5kYXRhKTtcblxuXHRcdFx0XHRcdC8vIERlYnVnIEpTT04gcGFuZSAobGVnYWN5IGRlYnVnIHRhYikuXG5cdFx0XHRcdFx0bGV0IHZpc3VhbEVycm9yU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuZGF0YSwgbnVsbCwgMik7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHZpc3VhbEVycm9yU3RyaW5nID0gdmlzdWFsRXJyb3JTdHJpbmcucmVwbGFjZSgvXFxuL2csICc8YnIvPicpO1xuXHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4gJHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSAocmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSkgPyByZXNwb25zZS5kYXRhIDogbnVsbDtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNlcyA9IChkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS5zdGF0dXNlcykpXG5cdFx0XHRcdFx0XHQ/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXHRcdFx0XHRcdGlmICghc3RhdHVzZXMpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBNb2R1bGUgc3RhcnR1cCBncmFjZTogdGhlIGJhY2tlbmQgaGFzIGFscmVhZHkgZG93bmdyYWRlZCBhbnlcblx0XHRcdFx0XHQvLyBoYXJkIGVycm9yIHRvIFwic3RhcnRpbmdcIiB3aGlsZSB0aGUgc3RhY2sgYm9vdHMsIHNvIHNob3cgb25lXG5cdFx0XHRcdFx0Ly8gY2FsbSBwcm9ncmVzcyBiYWRnZSBhbmQgbmV2ZXIgZXNjYWxhdGUgdG8gYSBmYWlsdXJlIGhlcmUg4oCUXG5cdFx0XHRcdFx0Ly8gdGhpcyBpcyB3aGF0IGtlZXBzIHRoZSBmaXJzdCB+MiBtaW51dGVzIGZyZWUgb2YgZmFsc2UgcmVkcy5cblx0XHRcdFx0XHRpZiAoZGF0YS5zdGFydHVwX2dyYWNlID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ2xhc3NpZnkgdGhlIHJlc3BvbnNlIGJ5IHRoZSB3b3JzdCBub24tc3lzdGVtIHN0YXRlLlxuXHRcdFx0XHRcdC8vIGNybS0xYyBpcyBzcGVjaWFsOiBpdCdzIHRoZSAxQyBicmlkZ2Ug4oCUIGl0cyBvd24gZXJyb3IgbGFiZWwuXG5cdFx0XHRcdFx0Ly8gQWxvbmdzaWRlIHRoZSBib29sZWFucywgY29sbGVjdCBkZWR1cGVkIGh1bWFuIHNlcnZpY2UgbmFtZXNcblx0XHRcdFx0XHQvLyAoYnkgbGFiZWwpIGZvciBlYWNoIGJ1Y2tldCBzbyB0aGUgc3VtbWFyeSBsaW5lIGNhbiBOQU1FIHRoZVxuXHRcdFx0XHRcdC8vIHNlcnZpY2VzIHRoYXQgYXJlIGZhaWxpbmcgb3Igc3R1Y2sgaW5zdGVhZCBvZiBhIGJhcmUgY29sb3VyLlxuXHRcdFx0XHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0XHRcdFx0bGV0IGNybTFjID0gbnVsbDtcblx0XHRcdFx0XHRsZXQgaGFzRXJyb3IgPSBmYWxzZTtcblx0XHRcdFx0XHRsZXQgaGFzU3RhcnRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRjb25zdCBlcnJOYW1lcyA9IHt9O1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TmFtZXMgPSB7fTtcblx0XHRcdFx0XHRzdGF0dXNlcy5mb3JFYWNoKChzKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXMgfHwgdHlwZW9mIHMubmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChzLm5hbWUgPT09ICdjcm0tMWMnKSBjcm0xYyA9IHMuc3RhdGU7XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBzLnN0YXRlID09PSAnZmFpbCcgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWxlZCdcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ2Rvd24nIHx8IHMuc3RhdGUgPT09ICdzdG9wcGVkJykge1xuXHRcdFx0XHRcdFx0XHRoYXNFcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGVyck5hbWVzW3NlbGYuc2VydmljZUxhYmVsKHMubmFtZSldID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChzLnN0YXRlID09PSAnc3RhcnRpbmcnIHx8IHMuc3RhdGUgPT09ICdwZW5kaW5nJ1xuXHRcdFx0XHRcdFx0XHR8fCBzLnN0YXRlID09PSAndW5rbm93bicpIHtcblx0XHRcdFx0XHRcdFx0aGFzU3RhcnRpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRzdGFydE5hbWVzW3NlbGYuc2VydmljZUxhYmVsKHMubmFtZSldID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCBlcnJvckxpc3QgPSBPYmplY3Qua2V5cyhlcnJOYW1lcyk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRMaXN0ID0gT2JqZWN0LmtleXMoc3RhcnROYW1lcyk7XG5cdFx0XHRcdFx0Ly8gU2V2ZXJpdHkgb3JkZXI6IGEgZ2VudWluZSByZWQgZmFpbHVyZSAoaW5jbC4gYSBjcm0tMWMgYnJpZGdlXG5cdFx0XHRcdFx0Ly8gZGFlbW9uIHRoYXQgaXMgYWN0dWFsbHkgZG93biDigJQgaXQgc3RheXMgJ2Vycm9yJykgd2lucyB0aGVcblx0XHRcdFx0XHQvLyBoZWFkbGluZSBzbyBpdCBpcyBuZXZlciBtYXNrZWQgYnkgYSBjYWxtZXIgbWVzc2FnZS4gVGhlbiB0aGVcblx0XHRcdFx0XHQvLyAxQyBicmlkZ2UncyBtb2RlLWF3YXJlIFwibm8gbGl2ZSBzZXNzaW9uIHlldFwiIHN0YXRlcyAoZnJvbVxuXHRcdFx0XHRcdC8vIHJlZmluZUNybVN0YXR1czogY29ubmVjdGluZ18xYyAvIHdhaXRpbmdfMWMpIOKAlCBhbHdheXMgYSBjYWxtXG5cdFx0XHRcdFx0Ly8geWVsbG93LCBuZXZlciByZWQuIFRoZW4gZ2VuZXJpYyBzdGFydHVwIHByb2dyZXNzLlxuXHRcdFx0XHRcdGlmIChoYXNFcnJvcikge1xuXHRcdFx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicsIHsgbmFtZXM6IGVycm9yTGlzdCB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNybTFjID09PSAnd2FpdGluZ18xYycpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXRpbmcnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNybTFjID09PSAnY29ubmVjdGluZ18xYycpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ0Nvbm5lY3RpbmcnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1N0YXJ0aW5nKSB7XG5cdFx0XHRcdFx0XHQvLyBTdGlsbCBzdGFydGluZzogc2hvdyBwcm9ncmVzcyB1bnRpbCB3ZSBnaXZlIHVwIGFmdGVyIDEwXG5cdFx0XHRcdFx0XHQvLyBmYWlsZWQgcG9sbHMsIHRoZW4gdHJlYXQgdGhlIHN0dWNrIGRhZW1vbiBhcyBhbiBlcnJvclxuXHRcdFx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBmYWxzZWx5IHJlcG9ydGluZyBpdCBhcyBDb25uZWN0ZWQuXG5cdFx0XHRcdFx0XHRpZiAoc2VsZi5lcnJvckNvdW50cyA8IDEwKSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnLCB7IGNvdW50OiBzdGFydExpc3QubGVuZ3RoIH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicsIHsgbmFtZXM6IHN0YXJ0TGlzdCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLm5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2sobnVsbCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdEaXNhYmxlZCcpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlckRpc2FibGVkUGFuZWwoKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0L7QvtCx0YnQuNGC0Ywg0YTQvtGA0LzQtSDQvdCw0YHRgtGA0L7QtdC6LCDRh9GC0L4gcmVtb3RlL1ZQUyDQv9C+0LvRjyDQvdGD0LbQvdC+INC30LDQsdC70L7QutC40YDQvtCy0LDRgtGMINC40LvQuCDRgNCw0LfQsdC70L7QutC40YDQvtCy0LDRgtGMLlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdHxudWxsfSBkYXRhINCe0YLQstC10YIgQVBJIGNoZWNrLlxuXHQgKi9cblx0bm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhkYXRhKSB7XG5cdFx0Y29uc3QgYWN0aXZlID0gZGF0YSAmJiBkYXRhLnJlbW90ZV9taWdyYXRpb25fYWN0aXZlID09PSB0cnVlO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gKGRhdGEgJiYgQXJyYXkuaXNBcnJheShkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMpKVxuXHRcdFx0PyBkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMgOiBbXTtcblx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ1JlbW90ZU1pZ3JhdGlvbkxvY2tDaGFuZ2VkJywge1xuXHRcdFx0ZGV0YWlsOiB7XG5cdFx0XHRcdGFjdGl2ZSxcblx0XHRcdFx0c2VydmljZXMsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRwYW5lbCA9IHNlbGYuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQvLyBEb24ndCByZXBsYWNlIHRoZSBwYW5lbCdzIGlubmVySFRNTDogdGhhdCBkZXN0cm95cyAjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzXG5cdFx0Ly8gYW5kICNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyLCBzbyBhIGxhdGVyIHJlLWVuYWJsZSBXSVRIT1VUIGEgcGFnZVxuXHRcdC8vIHJlbG9hZCB3b3VsZCBsZWF2ZSByZW5kZXJTZXJ2aWNlc1N0YXR1cygpIHdyaXRpbmcgaW50byBhbiBlbXB0eSBzZWxlY3Rpb25cblx0XHQvLyBhbmQgdGhlIHRhYmxlIHdvdWxkIG5ldmVyIGNvbWUgYmFjay4gUmV1c2UgdGhlIHBsYWNlaG9sZGVyIGluc3RlYWQsXG5cdFx0Ly8gbWlycm9yaW5nIHJlbmRlclNlcnZpY2VzU3RhdHVzKCkncyBzaG93UGxhY2Vob2xkZXIsIHNvIHRoZSBzdHJ1Y3R1cmVcblx0XHQvLyBzdXJ2aXZlcy4gRmFsbCBiYWNrIHRvIHJlcGxhY2luZyB0aGUgcGFuZWwgb25seSBpZiB0aGUgc2tlbGV0b24gaXMgYWJzZW50LlxuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9ICcnO1xuXHRcdGlmICgkcm93cy5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcm93cy5lbXB0eSgpO1xuXHRcdH1cblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5odG1sKGA8c3Bhbj4mbmJzcDske3NlbGYuZXNjYXBlSHRtbChsYWJlbCl9PC9zcGFuPmApLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHtzZWxmLmVzY2FwZUh0bWwobGFiZWwpfTwvZGl2PmApO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINGC0LDQsdC70LjRhtGLINGB0YLQsNGC0YPRgdC+0LI6IMKr0LjQvdC00LjQutCw0YLQvtGAICsg0YHQtdGA0LLQuNGBL9C60LDQvdCw0LsgKyDRgNCw0YHQv9C+0LvQvtC20LXQvdC40LUgK1xuXHQgKiDQsNC/0YLQsNC50LwgKyDQstC10YDRgdC40Y/Cuy4g0JrQvtC70L7QvdC60LAgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCuyDQv9C+0Y/QstC70Y/QtdGC0YHRjyDRgtC+0LvRjNC60L4g0LXRgdC70Lgg0YXQvtGC0Y8g0LHRi1xuXHQgKiDQvtC00LjQvSDRgdC10YDQstC40YEg0LLRi9C90LXRgdC10L0g0L3QsCBWUFMg4oCUINC90LAg0L7QsdGL0YfQvdC+0Lkg0LvQvtC60LDQu9GM0L3QvtC5INGD0YHRgtCw0L3QvtCy0LrQtSDRgtCw0LHQu9C40YbQsFxuXHQgKiDQvtGB0YLQsNGR0YLRgdGPINC60L7QvNC/0LDQutGC0L3QvtC5LlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZGF0YSDQntGC0LLQtdGCIEFQSSAocmVzcG9uc2UuZGF0YSkuXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlc1N0YXR1cyhkYXRhKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3Qgc2hvd1BsYWNlaG9sZGVyID0gKHRleHQpID0+IHtcblx0XHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcblx0XHRcdCRyb3dzLmVtcHR5KCk7XG5cdFx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmh0bWwoYDxzcGFuPiZuYnNwOyR7ZXNjKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke2VzYyh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXG5cdFx0Ly8gUGhhc2UgQzogcGVyLXNlcnZpY2UgZmFpbGJhY2sgZWxpZ2liaWxpdHkgKyB3YXJtLXN0YW5kYnkgbWlycm9yIGFnZS5cblx0XHRzZWxmLnJlbW90ZUZhaWxiYWNrID0gKGRhdGEgJiYgZGF0YS5yZW1vdGVfZmFpbGJhY2sgJiYgdHlwZW9mIGRhdGEucmVtb3RlX2ZhaWxiYWNrID09PSAnb2JqZWN0Jylcblx0XHRcdD8gZGF0YS5yZW1vdGVfZmFpbGJhY2sgOiB7fTtcblxuXHRcdC8vINCR0Y3QuiDQvNC+0LbQtdGCINCy0LXRgNC90YPRgtGMINGB0YLRgNC+0LrRgyAnTW9kdWxlIGRpc2FibGVkJyDQstC80LXRgdGC0L4g0LzQsNGB0YHQuNCy0LAuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHN0YXR1c2VzKSkge1xuXHRcdFx0Y29uc3QgdGV4dCA9ICh0eXBlb2Ygc3RhdHVzZXMgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQ/IHN0YXR1c2VzXG5cdFx0XHRcdDogc2VsZi50cignbW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZScsICdTdGF0dXMgdW5hdmFpbGFibGUnKTtcblx0XHRcdHNob3dQbGFjZWhvbGRlcih0ZXh0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQn9GA0L7Qv9GD0YHQutCw0LXQvCDQv9C10YDQtdGA0LjRgdC+0LLQutGDIERPTSwg0LXRgdC70Lgg0LTQsNC90L3Ri9C1INC90LUg0LjQt9C80LXQvdC40LvQuNGB0Ywg4oCUINGD0LHQuNGA0LDQtdGCXG5cdFx0Ly8g0LzQtdGA0YbQsNC90LjQtSDRgtCw0LHQu9C40YbRiyDQv9GA0Lgg0L7Qv9GA0L7RgdC1INGA0LDQtyDQsiAzINGB0LXQutGD0L3QtNGLLiDQktC60LvRjtGH0LDQtdC8IHJlbW90ZUZhaWxiYWNrINCyXG5cdFx0Ly8g0YXRjdGILCDQuNC90LDRh9C1INC/0L7Rj9Cy0LvQtdC90LjQtSDQutC90L7Qv9C60Lgv0L7QsdC90L7QstC70LXQvdC40LUg0LLQvtC30YDQsNGB0YLQsCDQutC+0L/QuNC4INC90LUg0L/QtdGA0LXRgNC40YHRg9C10YLRgdGPLlxuXHRcdGNvbnN0IGhhc2ggPSBKU09OLnN0cmluZ2lmeSh7IHM6IHN0YXR1c2VzLCBmOiBzZWxmLnJlbW90ZUZhaWxiYWNrIH0pO1xuXHRcdGlmIChoYXNoID09PSBzZWxmLmxhc3RSZW5kZXJIYXNoICYmICRyb3dzLmNoaWxkcmVuKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g0JPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhICjQutCw0L3QsNC70YspLlxuXHRcdGNvbnN0IGdyb3VwcyA9IHt9O1xuXHRcdGNvbnN0IG9yZGVyID0gW107XG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRpZiAoIXN2YyB8fCB0eXBlb2Ygc3ZjICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuYW1lID0gKHR5cGVvZiBzdmMubmFtZSA9PT0gJ3N0cmluZycgJiYgc3ZjLm5hbWUubGVuZ3RoID4gMCkgPyBzdmMubmFtZSA6ICd1bmtub3duJztcblx0XHRcdGlmICghZ3JvdXBzW25hbWVdKSB7XG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xuXHRcdFx0XHRvcmRlci5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcblx0XHR9KTtcblxuXHRcdGlmIChvcmRlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHNob3dQbGFjZWhvbGRlcihzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c0VtcHR5JywgJ05vIHNlcnZpY2VzIHJlcG9ydGVkJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCa0L7Qu9C+0L3QutCwIMKr0KDQsNGB0L/QvtC70L7QttC10L3QuNC1wrsg4oCUINGC0L7Qu9GM0LrQviDQutC+0LPQtNCwINC10YHRgtGMINGF0L7RgtGMINC+0LTQuNC9INGD0LTQsNC70ZHQvdC90YvQuSDRgdC10YDQstC40YEuXG5cdFx0Y29uc3QgaGFzUmVtb3RlID0gc3RhdHVzZXMuc29tZSgocykgPT4gcyAmJiBzLmxvY2F0aW9uID09PSAncmVtb3RlJyk7XG5cdFx0Y29uc3QgY29sQ291bnQgPSBoYXNSZW1vdGUgPyA1IDogNDtcblxuXHRcdGNvbnN0IGhlYWQgPSAnPHRoZWFkPjx0cj4nXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXN0YXR1c1wiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU3RhdHVzJywgJ1N0YXR1cycpKX08L3RoPmBcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtbmFtZVwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU2VydmljZScsICdTZXJ2aWNlJykpfTwvdGg+YFxuXHRcdFx0KyAoaGFzUmVtb3RlID8gYDx0aCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xMb2NhdGlvbicsICdMb2NhdGlvbicpKX08L3RoPmAgOiAnJylcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdXB0aW1lXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xVcHRpbWUnLCAnVXB0aW1lJykpfTwvdGg+YFxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC12ZXJzaW9uXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xWZXJzaW9uJywgJ1ZlcnNpb24nKSl9PC90aD5gXG5cdFx0XHQrICc8L3RyPjwvdGhlYWQ+JztcblxuXHRcdGNvbnN0IGJvZHkgPSBbXTtcblx0XHRvcmRlci5mb3JFYWNoKChuYW1lKSA9PiB7XG5cdFx0XHRjb25zdCByb3dzID0gZ3JvdXBzW25hbWVdO1xuXHRcdFx0Y29uc3QgaXNNdWx0aSA9IHNlbGYubXVsdGlJbnN0YW5jZVNlcnZpY2VzW25hbWVdID09PSB0cnVlIHx8IHJvd3MubGVuZ3RoID4gMTtcblx0XHRcdGlmIChpc011bHRpKSB7XG5cdFx0XHRcdGJvZHkucHVzaChgPHRyIGNsYXNzPVwiY3RpLXN2Yy1ncm91cFwiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHRcdFx0KyBgPGkgY2xhc3M9XCJjb21tZW50cyBpY29uXCI+PC9pPiR7ZXNjKHNlbGYuc2VydmljZUxhYmVsKG5hbWUpKX1gXG5cdFx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWNvdW50XCI+JHtyb3dzLmxlbmd0aH08L3NwYW4+PC90ZD48L3RyPmApO1xuXHRcdFx0XHRyb3dzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0XHRcdGJvZHkucHVzaChzZWxmLnJlbmRlclNlcnZpY2VSb3coc3ZjLCB0cnVlLCBoYXNSZW1vdGUpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHJvd3NbMF0sIGZhbHNlLCBoYXNSZW1vdGUpKTtcblx0XHRcdH1cblx0XHRcdC8vIFBoYXNlIEM6IG9mZmVyIFwiYnJpbmcgYmFjayB0byBsb2NhbFwiIG9uY2UgcGVyIHNlcnZpY2UgZ3JvdXAgd2hvc2Vcblx0XHRcdC8vIGNoYW5uZWxzIHN0aWxsIGxpdmUgb24gdGhlIFZQUyAoZGVyaXZlIHRoZSBiYXNlIHN2YyBmcm9tIGFcblx0XHRcdC8vIFwiY2hhdHMuPGFyZWE+XCIgZ3JvdXAgbmFtZSkuXG5cdFx0XHRjb25zdCBzdmNLZXkgPSBuYW1lLmluZGV4T2YoJy4nKSA+PSAwID8gbmFtZS5zcGxpdCgnLicpWzBdIDogbmFtZTtcblx0XHRcdGNvbnN0IGZiUm93ID0gc2VsZi5mYWlsYmFja0NvbnRyb2xSb3coc3ZjS2V5LCBjb2xDb3VudCk7XG5cdFx0XHRpZiAoZmJSb3cgIT09ICcnKSB7XG5cdFx0XHRcdGJvZHkucHVzaChmYlJvdyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQkcm93cy5odG1sKCc8dGFibGUgY2xhc3M9XCJ1aSBjZWxsZWQgc3RyaXBlZCBjb21wYWN0IHVuc3RhY2thYmxlIHRhYmxlIGN0aS1zdGF0dXMtdGFibGVcIj4nXG5cdFx0XHQrIGhlYWQgKyAnPHRib2R5PicgKyBib2R5LmpvaW4oJycpICsgJzwvdGJvZHk+PC90YWJsZT4nKTtcblx0XHRzZWxmLmxhc3RSZW5kZXJIYXNoID0gaGFzaDtcblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YLQsNCx0LvQuNGG0YsgKNGB0LXRgNCy0LjRgSDQuNC70Lgg0LrQsNC90LDQuykuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBzdmMg0LfQsNC/0LjRgdGMINC40Lcgc3RhdHVzZXNbXVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGdyb3VwZWQg0YHRgtGA0L7QutCwINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKNC60LDQvdCw0Lsg0LzQtdGB0YHQtdC90LTQttC10YDQsClcblx0ICogQHBhcmFtIHtib29sZWFufSBoYXNSZW1vdGUg0L/QvtC60LDQt9GL0LLQsNGC0Ywg0LvQuCDQutC+0LvQvtC90LrRgyDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUwgKNC+0LTQvdCwIDx0cj4sINC/0LvRjtGBIDx0cj4g0YEg0L7RiNC40LHQutC+0Lkg0L/RgNC4INC90LDQu9C40YfQuNC4KVxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQsIGhhc1JlbW90ZSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUoc3RhdGVSYXcpO1xuXHRcdGNvbnN0IGxlZENsYXNzID0gc2VsZi5zdGF0ZUxlZENsYXNzW2Nhbm9uXSB8fCAnd2Fybic7XG5cdFx0Y29uc3Qgc3RhdGVUZXh0ID0gc2VsZi5zdGF0ZVRleHQoc3RhdGVSYXcpO1xuXG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IHNlbGYuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBzZWxmLnNlcnZpY2VMYWJlbChzdmMubmFtZSk7XG5cdFx0Y29uc3QgbmFtZUljb24gPSBncm91cGVkID8gJzxpIGNsYXNzPVwiaGFzaHRhZyBpY29uXCI+PC9pPicgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblx0XHRjb25zdCBkYXNoID0gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xuXG5cdFx0Y29uc3Qgc3RhdHVzQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbGVkICR7ZXNjKGxlZENsYXNzKX1cIiB0aXRsZT1cIiR7ZXNjKHN0YXRlUmF3KX1cIj48L3NwYW4+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLXN0YXRlXCI+JHtlc2Moc3RhdGVUZXh0KX08L3NwYW4+YDtcblxuXHRcdGNvbnN0IG5hbWVDZWxsID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1uYW1lJHtncm91cGVkID8gJyBjdGktc3ZjLWNoYW5uZWwnIDogJyd9XCI+JHtuYW1lSWNvbn0ke2VzYyhkaXNwbGF5TmFtZSl9PC9zcGFuPmA7XG5cblx0XHRjb25zdCBsb2NDZWxsID0gaGFzUmVtb3RlID8gYDx0ZCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtzZWxmLmxvY2F0aW9uQmFkZ2Uoc3ZjLmxvY2F0aW9uKX08L3RkPmAgOiAnJztcblxuXHRcdGNvbnN0IGNlbGxzID0gYDx0ZCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtzdGF0dXNDZWxsfTwvdGQ+YFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1uYW1lXCI+JHtuYW1lQ2VsbH08L3RkPmBcblx0XHRcdCsgbG9jQ2VsbFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke3VwdGltZSAhPT0gJycgPyBlc2ModXB0aW1lKSA6IGRhc2h9PC90ZD5gXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLXZlcnNpb25cIj4ke3ZlcnNpb24gIT09ICcnID8gZXNjKHZlcnNpb24pIDogZGFzaH08L3RkPmA7XG5cblx0XHRsZXQgaHRtbCA9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLXJvdyR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1zdWJyb3cnIDogJyd9XCJgXG5cdFx0XHQrIGAgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPiR7Y2VsbHN9PC90cj5gO1xuXG5cdFx0Ly8gbGFzdF9lcnJvciBmcm9tIG1vbml0b3JkIGlzIHN0aWNreSAoXCJsYXN0IGVycm9yIGV2ZXIgc2VlblwiKSBhbmQgaXMgTk9UXG5cdFx0Ly8gY2xlYXJlZCBvbiByZWNvdmVyeSDigJQgaXQgc3RheXMgaW4gdGhlIEFQSSBwYXlsb2FkIG9uIHB1cnBvc2UgKGhhbmR5IGZvclxuXHRcdC8vIGRlYnVnZ2luZykuIFN1cmZhY2UgaXQgdG8gdGhlIG9wZXJhdG9yIE9OTFkgd2hlbiB0aGUgc2VydmljZSBpcyBhY3R1YWxseVxuXHRcdC8vIGluIGEgcmVkIGVycm9yIHN0YXRlLiBBIHJlY292ZXJlZCBnbGl0Y2ggKHN0YXRlPW9rKSBvciBhIHNlcnZpY2Ugc3RpbGxcblx0XHQvLyBzdGFydGluZy93YXJtaW5nIHVwIChzdGF0ZT1zdGFydGluZyAtPiB3YXJuIExFRCwgaW5jbC4gdGhlIHN0YXJ0dXAgZ3JhY2Vcblx0XHQvLyB3aW5kb3cpIG11c3QgTk9UIHByaW50IHN0YWxlIGVycm9yIHRleHQg4oCUIG90aGVyd2lzZSB3ZSdkIGJlIHJlcG9ydGluZyBhXG5cdFx0Ly8gc2VydmljZSBmYWlsdXJlIGluIHRoZSBmaXJzdCBtaW51dGUsIHdoaWNoIGlzIGV4YWN0bHkgd2hhdCB3ZSBzdXBwcmVzcy5cblx0XHRpZiAobGFzdEVycm9yICE9PSAnJyAmJiBsZWRDbGFzcyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0aHRtbCArPSBgPHRyIGNsYXNzPVwiY3RpLXN2Yy1lcnJvci1yb3dcIj48dGQgY29sc3Bhbj1cIiR7Y29sQ291bnR9XCI+YFxuXHRcdFx0XHQrIGA8aSBjbGFzcz1cImV4Y2xhbWF0aW9uIHRyaWFuZ2xlIGljb25cIj48L2k+YFxuXHRcdFx0XHQrIGA8c3BhbiB0aXRsZT1cIiR7ZXNjKGxhc3RFcnJvcil9XCI+JHtlc2Moc2VsZi50cnVuY2F0ZShsYXN0RXJyb3IsIDIwMCkpfTwvc3Bhbj5gXG5cdFx0XHRcdCsgJzwvdGQ+PC90cj4nO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBQaGFzZSBDOiDRgdGC0YDQvtC60LAg0YEg0LrQvdC+0L/QutC+0LkgwqvQstC10YDQvdGD0YLRjCDQvdCwINC70L7QutCw0LvRjMK7ICsg0LLQvtC30YDQsNGB0YLQvtC8INC70L7QutCw0LvRjNC90L7QuSDQutC+0L/QuNC4LFxuXHQgKiDQv9C+0LrQsNC30YvQstCw0LXRgtGB0Y8g0LTQu9GPINGB0LXRgNCy0LjRgdCwLCDRh9GM0Lgg0LrQsNC90LDQu9GLINC10YnRkSDQvdCwIFZQUyAoY2FuX2ZhaWxiYWNrKS5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN2YyDQsdCw0LfQvtCy0L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAgKGNoYXRzfHRnfG1heClcblx0ICogQHBhcmFtIHtudW1iZXJ9IGNvbENvdW50INGH0LjRgdC70L4g0LrQvtC70L7QvdC+0Log0YLQsNCx0LvQuNGG0Ytcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTCAoPHRyPikg0LvQuNCx0L4gJycg0LXRgdC70LggZmFpbGJhY2sg0L3QtSDQv9GA0LjQvNC10L3QuNC8XG5cdCAqL1xuXHRmYWlsYmFja0NvbnRyb2xSb3coc3ZjLCBjb2xDb3VudCkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGluZm8gPSBzZWxmLnJlbW90ZUZhaWxiYWNrID8gc2VsZi5yZW1vdGVGYWlsYmFja1tzdmNdIDogbnVsbDtcblx0XHRpZiAoIWluZm8gfHwgaW5mby5jYW5fZmFpbGJhY2sgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSBzZWxmLnRyKCdtb2RfY3RpX0ZhaWxiYWNrVG9Mb2NhbCcsICdCcmluZyBiYWNrIHRvIGxvY2FsJyk7XG5cdFx0Y29uc3QgYWdlID0gc2VsZi5taXJyb3JBZ2VUZXh0KGluZm8ubGFzdF9taXJyb3JfdHMpO1xuXHRcdHJldHVybiBgPHRyIGNsYXNzPVwiY3RpLWZhaWxiYWNrLXJvd1wiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHQrIGA8YnV0dG9uIGNsYXNzPVwidWkgdGlueSBiYXNpYyBvcmFuZ2UgYnV0dG9uIGN0aS1mYWlsYmFjay1idG5cIiBkYXRhLXN2Yz1cIiR7ZXNjKHN2Yyl9XCI+YFxuXHRcdFx0KyBgPGkgY2xhc3M9XCJyZXBseSBpY29uXCI+PC9pPiR7ZXNjKGxhYmVsKX08L2J1dHRvbj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1mYWlsYmFjay1hZ2VcIj4ke2VzYyhhZ2UpfTwvc3Bhbj5gXG5cdFx0XHQrICc8L3RkPjwvdHI+Jztcblx0fSxcblxuXHQvKipcblx0ICogUGhhc2UgQzog0YfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNGL0Lkg0LLQvtC30YDQsNGB0YIg0LvQvtC60LDQu9GM0L3QvtC5INC60L7Qv9C40Lgg0YHQtdGB0YHQuNC4ICh3YXJtLXN0YW5kYnlcblx0ICogbWlycm9yKS4gdHMg4oCUIHVuaXgt0YHQtdC60YPQvdC00Ys7IDAv0L/Rg9GB0YLQviA9PiDCq9C60L7Qv9C40Lgg0LXRidGRINC90LXRgsK7LlxuXHQgKlxuXHQgKiBAcGFyYW0ge251bWJlcn0gdHNcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdG1pcnJvckFnZVRleHQodHMpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IG4gPSBwYXJzZUludCh0cywgMTApO1xuXHRcdGlmICghbiB8fCBuIDw9IDApIHtcblx0XHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvck5ldmVyJywgJ2xvY2FsIGNvcHk6IG5vbmUgeWV0Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlY3MgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSAtIG4pO1xuXHRcdGxldCBodW1hbjtcblx0XHRpZiAoc2VjcyA8IDkwKSB7XG5cdFx0XHRodW1hbiA9IGAke3NlY3N9c2A7XG5cdFx0fSBlbHNlIGlmIChzZWNzIDwgNTQwMCkge1xuXHRcdFx0aHVtYW4gPSBgJHtNYXRoLnJvdW5kKHNlY3MgLyA2MCl9bWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGh1bWFuID0gYCR7TWF0aC5yb3VuZChzZWNzIC8gMzYwMCl9aGA7XG5cdFx0fVxuXHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvckFnZScsICdsb2NhbCBjb3B5OiAlYWdlJSBhZ28nKS5yZXBsYWNlKCclYWdlJScsIGh1bWFuKTtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC50LTQtiDRgNCw0YHQv9C+0LvQvtC20LXQvdC40Y8g0YHQtdGA0LLQuNGB0LA6INGP0YDQutC40LkgwqtWUFPCuyDQtNC70Y8g0LLRi9C90LXRgdC10L3QvdGL0YUg0LrQsNC90LDQu9C+0LIg0Lhcblx0ICog0L/RgNC40LPQu9GD0YjRkdC90L3Ri9C5IMKr0JvQvtC60LDQu9GM0L3QvsK7INC00LvRjyDQstGB0LXQs9C+INC+0YHRgtCw0LvRjNC90L7Qs9C+LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbG9jYXRpb24gJ3JlbW90ZScgfCAnbG9jYWwnIHwgdW5kZWZpbmVkXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUxcblx0ICovXG5cdGxvY2F0aW9uQmFkZ2UobG9jYXRpb24pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRpZiAobG9jYXRpb24gPT09ICdyZW1vdGUnKSB7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwidWkgdGVhbCBsYWJlbCBjdGktbG9jLWJhZGdlXCI+PGkgY2xhc3M9XCJjbG91ZCBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvblJlbW90ZScsICdWUFMnKSl9PC9zcGFuPmA7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ2xvY2FsJykge1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cImN0aS1sb2MtbG9jYWxcIj48aSBjbGFzcz1cImhvbWUgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYCR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfTG9jYXRpb25Mb2NhbCcsICdMb2NhbCcpKX08L3NwYW4+YDtcblx0XHR9XG5cdFx0cmV0dXJuICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+Jztcblx0fSxcblxuXHQvKipcblx0ICog0JrQsNC90L7QvdC40LfQsNGG0LjRjyDRgdCy0L7QsdC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0L7RgdGC0L7Rj9C90LjRjyDQsiDQuNC30LLQtdGB0YLQvdGL0Lkg0LrQu9GO0Ycg0LTQu9GPINC70LDQvNC/0L7Rh9C60Lgg0Lhcblx0ICog0L/QtdGA0LXQstC+0LTQsC4gbW9uaXRvcmQg0LzQvtC20LXRgiDQv9GA0LjRgdGL0LvQsNGC0Ywgwqthd2FpdGluZyBhdXRob3JpemF0aW9uIGNvZGXCuyDQuCDQv9GALlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGNhbm9uU3RhdGUoc3RhdGUpIHtcblx0XHRjb25zdCBzID0gU3RyaW5nKHN0YXRlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChzID09PSAnJykge1xuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZigncXInKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAncXJjb2RlJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZignYXdhaXRpbmcnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCdyZWF1dGgnKSAhPT0gLTFcblx0XHRcdHx8IHMuaW5kZXhPZignYXV0aF9yZXF1aXJlZCcpICE9PSAtMSB8fCBzLmluZGV4T2YoJzJmYScpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdyZWF1dGgnO1xuXHRcdH1cblx0XHRpZiAocyA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dGhlbnRpY2F0ZWQnO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fSxcblxuXHQvKipcblx0ICog0KXQtdC70L/QtdGAINC/0LXRgNC10LLQvtC00LAg0YEg0YTQvtC70LHRjdC60L7QvC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGtleSDQutC70Y7RhyBnbG9iYWxUcmFuc2xhdGVcblx0ICogQHBhcmFtIHtzdHJpbmd9IGZhbGxiYWNrINC30L3QsNGH0LXQvdC40LUg0L/QviDRg9C80L7Qu9GH0LDQvdC40Y5cblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRyKGtleSwgZmFsbGJhY2spIHtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUg0LrQsNC90LDQu9CwL9GB0LXRgNCy0LjRgdCwICjQvdCw0L/RgNC40LzQtdGAIMKr0J/QvtC00LrQu9GO0YfRkdC9wrssXG5cdCAqIMKr0KLRgNC10LHRg9C10YIg0LDQstGC0L7RgNC40LfQsNGG0LjQuMK7KS4g0KHQvdCw0YfQsNC70LAg0LjRidC10Lwg0YLQvtGH0L3Ri9C5INC60LvRjtGHLCDQt9Cw0YLQtdC8INC/0L4g0LrQsNC90L7QvdC40YfQtdGB0LrQvtC80YNcblx0ICog0YHQvtGB0YLQvtGP0L3QuNGOLCDQt9Cw0YLQtdC8IOKAlCDQsNC90LPQu9C40LnRgdC60LjQuSDRhNC+0LvQsdGN0LosINC4INCyINC60YDQsNC50L3QtdC8INGB0LvRg9GH0LDQtSDQuNGB0YXQvtC00L3Rg9GOINGB0YLRgNC+0LrRgy5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0ZVRleHQoc3RhdGUpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IHJhdyA9IFN0cmluZyhzdGF0ZSB8fCAnJyk7XG5cdFx0Ly8g0KLQvtGH0L3Ri9C5INC60LvRjtGHINC/0L7QtCDQuNGB0YXQvtC00L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAo0L3QsCDRgdC70YPRh9Cw0Lkg0YHQv9C10YbQuNGE0LjRh9C90YvRhSDQv9C10YDQtdCy0L7QtNC+0LIpLlxuXHRcdGNvbnN0IGV4YWN0S2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtyYXd9YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2V4YWN0S2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtleGFjdEtleV07XG5cdFx0fVxuXHRcdGNvbnN0IGNhbm9uID0gc2VsZi5jYW5vblN0YXRlKHJhdyk7XG5cdFx0Y29uc3QgY2Fub25LZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke2Nhbm9ufWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbY2Fub25LZXldO1xuXHRcdH1cblx0XHRjb25zdCBmYWxsYmFjayA9IHtcblx0XHRcdG9rOiAnT0snLFxuXHRcdFx0YXV0aGVudGljYXRlZDogJ0F1dGhlbnRpY2F0ZWQnLFxuXHRcdFx0Y29ubmVjdGVkOiAnQ29ubmVjdGVkIHRvIDFDJyxcblx0XHRcdHdhaXRpbmdfMWM6ICdXYWl0aW5nIGZvciAxQyB0byBjb25uZWN0Jyxcblx0XHRcdGNvbm5lY3RpbmdfMWM6ICdDb25uZWN0aW5nIHRvIDFD4oCmJyxcblx0XHRcdGVycm9yOiAnRXJyb3InLFxuXHRcdFx0dW5rbm93bjogJ1Vua25vd24nLFxuXHRcdFx0cGVuZGluZzogJ1BlbmRpbmcnLFxuXHRcdFx0c3RhcnRpbmc6ICdTdGFydGluZycsXG5cdFx0XHRxcmNvZGU6ICdBd2FpdGluZyBRUi1jb2RlIGF1dGhvcml6YXRpb24nLFxuXHRcdFx0cmVhdXRoOiAnQXV0aG9yaXphdGlvbiByZXF1aXJlZCcsXG5cdFx0fTtcblx0XHRyZXR1cm4gZmFsbGJhY2tbY2Fub25dIHx8IHJhdztcblx0fSxcblxuXHQvKipcblx0ICog0JrQvtGA0L7RgtC60L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBhcmVhLUdVSUQg4oCUINC/0LXRgNCy0YvQtSA4INGB0LjQvNCy0L7Qu9C+0LIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBhcmVhXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzaG9ydEFyZWEoYXJlYSkge1xuXHRcdGlmICh0eXBlb2YgYXJlYSAhPT0gJ3N0cmluZycgfHwgYXJlYS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKGFyZWEubGVuZ3RoIDw9IDEyKSB7XG5cdFx0XHRyZXR1cm4gYXJlYTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FyZWEuc3Vic3RyaW5nKDAsIDgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XG5cdFx0aWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChzdHIubGVuZ3RoIDw9IG1heCkge1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LfQvtC/0LDRgdC90YvQuSDRjdC60YDQsNC90LXRgCBIVE1MLlxuXHQgKlxuXHQgKiBAcGFyYW0geyp9IHZhbHVlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRlc2NhcGVIdG1sKHZhbHVlKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSlcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblx0fSxcblxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0L7QsdGJ0LXQs9C+INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyDigJQg0YHRgtGA0L7QutCwLdGB0LLQvtC00LrQsCDQstCy0LXRgNGF0YMg0LLQutC70LDQtNC60LggwqvQodGC0LDRgtGD0YHCu1xuXHQgKiAo0LfQsNC80LXQvdC40LvQsCDQv9GA0LXQttC90LjQuSDRg9Cz0LvQvtCy0L7QuSDQsdC10LnQtNC2ICNzdGF0dXMpLiDQoNC40YHRg9C10YIg0YbQstC10YLQvdGD0Y4g0LvQsNC80L/QvtGH0LrRgyArINGC0LXQutGB0YI7XG5cdCAqINC00LvRjyDQutGA0LDRgdC90L7Qs9C+INGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LbQtdGCINCd0JDQl9CS0JDQotCsINC60L7QvdC60YDQtdGC0L3Ri9C1INC/0YDQvtCx0LvQtdC80L3Ri9C1INGB0LXRgNCy0LjRgdGLLCDQsCDQtNC70Y9cblx0ICog0L/RgNC+0LPRgNC10YHRgdCwIOKAlCDQv9C+0LrQsNC30LDRgtGMINC40YUg0LrQvtC70LjRh9C10YHRgtCy0L4uXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXMg0LrQu9GO0Ycg0YHQvtGB0YLQvtGP0L3QuNGPXG5cdCAqIEBwYXJhbSB7e25hbWVzPzogc3RyaW5nW10sIGNvdW50PzogbnVtYmVyfX0gW2luZm9dINC00L7Qvy4g0LTQsNC90L3Ri9C1INC00LvRjyDRgtC10LrRgdGC0LBcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMsIGluZm8pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRzID0gc2VsZi4kbW9kdWxlU3RhdHVzO1xuXHRcdGlmICghJHMgfHwgJHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBpbmZvIHx8IHt9O1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRjb25zdCBzcGlubmVyID0gJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+Jztcblx0XHRjb25zdCB0ciA9IChrZXksIGZhbGxiYWNrKSA9PiBzZWxmLnRyKGtleSwgZmFsbGJhY2spO1xuXG5cdFx0bGV0IGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRsZXQgbGVkID0gJ3Vua25vd24nO1xuXHRcdGxldCBpY29uID0gJyc7XG5cdFx0bGV0IHRleHQgPSAnJztcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JlZW4nO1xuXHRcdFx0XHRsZWQgPSAnb2snO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGVkJywgJ1RoZSBtb2R1bGUgd29ya3Mgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0bGV0IHByb2dyZXNzID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzJywgJ01vZHVsZSBzZXJ2aWNlcyBhcmUgc3RhcnRpbmcnKTtcblx0XHRcdFx0aWYgKGRhdGEuY291bnQgJiYgZGF0YS5jb3VudCA+IDApIHtcblx0XHRcdFx0XHRwcm9ncmVzcyArPSBgICgke2RhdGEuY291bnR9KWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGV4dCA9IHByb2dyZXNzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdGluZyc6XG5cdFx0XHRcdC8vIGxvbmdwb29sOiAxQyBjb25uZWN0cyB0byB1czsgd2UgYXJlIHdhaXRpbmcgZm9yIGl0LlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX3N0YXRlX3dhaXRpbmdfMWMnLCAnV2FpdGluZyBmb3IgMUMgdG8gY29ubmVjdCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDQ29ubmVjdGluZyc6XG5cdFx0XHRcdC8vIHdlYnNlcnZpY2U6IHdlIGFyZSByZWFjaGluZyBvdXQgdG8gMUMuXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS15ZWxsb3cnO1xuXHRcdFx0XHRsZWQgPSAnd2Fybic7XG5cdFx0XHRcdGljb24gPSBzcGlubmVyO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfc3RhdGVfY29ubmVjdGluZ18xYycsICdDb25uZWN0aW5nIHRvIDFD4oCmJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBBcnJheS5pc0FycmF5KGRhdGEubmFtZXMpID8gZGF0YS5uYW1lcy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcblx0XHRcdFx0aWYgKG5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0ZXh0ID0gYCR7dHIoJ21vZF9jdGlfU3RhdHVzUHJvYmxlbScsICdQcm9ibGVtJyl9OiAke25hbWVzLmpvaW4oJywgJyl9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvbkVycm9yJywgJ0ZhaWx1cmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Rpc2FibGVkJzpcblx0XHRcdFx0Y2xzID0gJ2N0aS1zdW1tYXJ5LWdyZXknO1xuXHRcdFx0XHRsZWQgPSAndW5rbm93bic7XG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCcsICdNb2R1bGUgaXMgZGlzYWJsZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XG5cdFx0XHRcdGxlZCA9ICd1bmtub3duJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Rpc2Nvbm5lY3RlZCcsICdEaXNjb25uZWN0ZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX1VwZGF0ZVN0YXR1cycsICdVcGRhdGluZyBzdGF0dXPigKYnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcicsICdGYWlsdXJlJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdCRzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2N0aS1zdW1tYXJ5LWdyZXkgY3RpLXN1bW1hcnktZ3JlZW4gY3RpLXN1bW1hcnkteWVsbG93IGN0aS1zdW1tYXJ5LXJlZCcpXG5cdFx0XHQuYWRkQ2xhc3MoY2xzKVxuXHRcdFx0Lmh0bWwoYDxzcGFuIGNsYXNzPVwiY3RpLXN1bW1hcnktbGVkICR7ZXNjKGxlZCl9XCI+PC9zcGFuPmBcblx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3VtbWFyeS10ZXh0XCI+JHtpY29ufSR7ZXNjKHRleHQpfTwvc3Bhbj5gKTtcblx0fSxcbn07XG4iXX0=