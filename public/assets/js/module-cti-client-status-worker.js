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
    // Когда показана строка failback, её «local copy: N ago» должен идти даже
    // при застывших statuses/remoteFailback (туннель лежит — last_mirror_ts не
    // растёт), поэтому подмешиваем грубый 15-секундный бакет времени в хэш.


    var ageBucket = 0;
    var rf = self.remoteFailback;

    if (rf && _typeof(rf) === 'object' && Object.keys(rf).some(function (k) {
      return rf[k] && rf[k].can_failback === true;
    })) {
      ageBucket = Math.floor(Date.now() / 15000);
    }

    var hash = JSON.stringify({
      s: statuses,
      f: self.remoteFailback,
      a: ageBucket
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJjb25uZWN0ZWQiLCJ3YWl0aW5nXzFjIiwiY29ubmVjdGluZ18xYyIsImVycm9yIiwiZmFpbCIsImZhaWxlZCIsImRvd24iLCJzdG9wcGVkIiwidW5rbm93biIsInBlbmRpbmciLCJzdGFydGluZyIsInFyY29kZSIsInJlYXV0aCIsImF1dGgiLCJhdXRoX3JlcXVpcmVkIiwid2FybiIsIndhcm5pbmciLCJtdWx0aUluc3RhbmNlU2VydmljZXMiLCJjaGF0cyIsInRnIiwibWF4IiwiaW5pdGlhbGl6ZSIsInJlc3RhcnRXb3JrZXIiLCJjaGFuZ2VTdGF0dXMiLCJ3aW5kb3ciLCJjbGVhclRpbWVvdXQiLCJ3b3JrZXIiLCJjaGVja2JveCIsImFwaSIsInVybCIsIkNvbmZpZyIsInBieFVybCIsIm9uIiwic3VjY2Vzc1Rlc3QiLCJQYnhBcGkiLCJvbkNvbXBsZXRlIiwic2V0VGltZW91dCIsIm9uUmVzcG9uc2UiLCJyZXNwb25zZSIsInJlbW92ZSIsImRhdGEiLCJub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXBsYWNlIiwiT2JqZWN0Iiwia2V5cyIsImxlbmd0aCIsInJlc3VsdCIsImFmdGVyIiwib25TdWNjZXNzIiwib25GYWlsdXJlIiwic3RhdHVzZXMiLCJBcnJheSIsImlzQXJyYXkiLCJzdGFydHVwX2dyYWNlIiwic2VsZiIsImNybTFjIiwiaGFzRXJyb3IiLCJoYXNTdGFydGluZyIsImVyck5hbWVzIiwic3RhcnROYW1lcyIsImZvckVhY2giLCJzIiwibmFtZSIsInN0YXRlIiwic2VydmljZUxhYmVsIiwiZXJyb3JMaXN0Iiwic3RhcnRMaXN0IiwibmFtZXMiLCJjb3VudCIsInJlbmRlckRpc2FibGVkUGFuZWwiLCJhY3RpdmUiLCJyZW1vdGVfbWlncmF0aW9uX2FjdGl2ZSIsInNlcnZpY2VzIiwicmVtb3RlX21pZ3JhdGlvbl9zZXJ2aWNlcyIsImRpc3BhdGNoRXZlbnQiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIiRwYW5lbCIsImxhYmVsIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCIsIiRyb3dzIiwiJHBsYWNlaG9sZGVyIiwiZW1wdHkiLCJodG1sIiwiZXNjYXBlSHRtbCIsInNob3ciLCJlc2MiLCJzaG93UGxhY2Vob2xkZXIiLCJ0ZXh0IiwicmVtb3RlRmFpbGJhY2siLCJyZW1vdGVfZmFpbGJhY2siLCJ0ciIsImFnZUJ1Y2tldCIsInJmIiwic29tZSIsImsiLCJjYW5fZmFpbGJhY2siLCJNYXRoIiwiZmxvb3IiLCJEYXRlIiwibm93IiwiaGFzaCIsImYiLCJhIiwiY2hpbGRyZW4iLCJoaWRlIiwiZ3JvdXBzIiwib3JkZXIiLCJzdmMiLCJwdXNoIiwiaGFzUmVtb3RlIiwibG9jYXRpb24iLCJjb2xDb3VudCIsImhlYWQiLCJib2R5Iiwicm93cyIsImlzTXVsdGkiLCJyZW5kZXJTZXJ2aWNlUm93Iiwic3ZjS2V5IiwiaW5kZXhPZiIsInNwbGl0IiwiZmJSb3ciLCJmYWlsYmFja0NvbnRyb2xSb3ciLCJqb2luIiwiZ3JvdXBlZCIsInN0YXRlUmF3IiwiY2Fub24iLCJjYW5vblN0YXRlIiwibGVkQ2xhc3MiLCJzdGF0ZVRleHQiLCJkaXNwbGF5TmFtZSIsInNob3J0QXJlYSIsImFyZWEiLCJuYW1lSWNvbiIsInVwdGltZSIsInZlcnNpb24iLCJsYXN0RXJyb3IiLCJsYXN0X2Vycm9yIiwiZGFzaCIsInN0YXR1c0NlbGwiLCJuYW1lQ2VsbCIsImxvY0NlbGwiLCJsb2NhdGlvbkJhZGdlIiwiY2VsbHMiLCJ0cnVuY2F0ZSIsImluZm8iLCJhZ2UiLCJtaXJyb3JBZ2VUZXh0IiwibGFzdF9taXJyb3JfdHMiLCJ0cyIsIm4iLCJwYXJzZUludCIsInNlY3MiLCJodW1hbiIsInJvdW5kIiwiU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJrZXkiLCJmYWxsYmFjayIsIm1hcCIsIm1vbml0b3JkIiwibmF0cyIsInByb3h5IiwicmF3IiwiZXhhY3RLZXkiLCJjYW5vbktleSIsInN1YnN0cmluZyIsInN0ciIsInZhbHVlIiwic3RhdHVzIiwiJHMiLCJzcGlubmVyIiwiY2xzIiwibGVkIiwiaWNvbiIsInByb2dyZXNzIiwiZmlsdGVyIiwiQm9vbGVhbiIsInJlbW92ZUNsYXNzIiwiYWRkQ2xhc3MiXSwibWFwcGluZ3MiOiI7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLElBQU1BLG9DQUFvQyxHQUFHO0FBQzVDQyxFQUFBQSxRQUFRLEVBQUVDLENBQUMsQ0FBQyx5QkFBRCxDQURpQztBQUU1Q0MsRUFBQUEsYUFBYSxFQUFFRCxDQUFDLENBQUMsdUJBQUQsQ0FGNEI7QUFHNUNFLEVBQUFBLGlCQUFpQixFQUFFRixDQUFDLENBQUMsMEJBQUQsQ0FId0I7QUFJNUNHLEVBQUFBLFlBQVksRUFBRUgsQ0FBQyxDQUFDLG9CQUFELENBSjZCO0FBSzVDSSxFQUFBQSxhQUFhLEVBQUVKLENBQUMsQ0FBQyxxQkFBRCxDQUw0QjtBQU01Q0ssRUFBQUEsYUFBYSxFQUFFTCxDQUFDLENBQUMsZUFBRCxDQU40QjtBQU81Q00sRUFBQUEsVUFBVSxFQUFFTixDQUFDLENBQUMseUNBQUQsQ0FQK0I7QUFRNUNPLEVBQUFBLGVBQWUsRUFBRVAsQ0FBQyxDQUFDLHNCQUFELENBUjBCO0FBUzVDUSxFQUFBQSxPQUFPLEVBQUUsSUFUbUM7QUFVNUNDLEVBQUFBLGFBQWEsRUFBRSxFQVY2QjtBQVc1Q0MsRUFBQUEsV0FBVyxFQUFFLENBWCtCO0FBWTVDQyxFQUFBQSxjQUFjLEVBQUUsRUFaNEI7O0FBYzVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0NDLEVBQUFBLGFBQWEsRUFBRTtBQUNkQyxJQUFBQSxFQUFFLEVBQUUsSUFEVTtBQUVkQyxJQUFBQSxhQUFhLEVBQUUsSUFGRDtBQUdkQyxJQUFBQSxTQUFTLEVBQUUsSUFIRztBQUlkQyxJQUFBQSxVQUFVLEVBQUUsTUFKRTtBQUtkQyxJQUFBQSxhQUFhLEVBQUUsTUFMRDtBQU1kQyxJQUFBQSxLQUFLLEVBQUUsT0FOTztBQU9kQyxJQUFBQSxJQUFJLEVBQUUsT0FQUTtBQVFkQyxJQUFBQSxNQUFNLEVBQUUsT0FSTTtBQVNkQyxJQUFBQSxJQUFJLEVBQUUsT0FUUTtBQVVkQyxJQUFBQSxPQUFPLEVBQUUsT0FWSztBQVdkQyxJQUFBQSxPQUFPLEVBQUUsU0FYSztBQVlkQyxJQUFBQSxPQUFPLEVBQUUsTUFaSztBQWFkQyxJQUFBQSxRQUFRLEVBQUUsTUFiSTtBQWNkQyxJQUFBQSxNQUFNLEVBQUUsTUFkTTtBQWVkQyxJQUFBQSxNQUFNLEVBQUUsTUFmTTtBQWdCZEMsSUFBQUEsSUFBSSxFQUFFLE1BaEJRO0FBaUJkQyxJQUFBQSxhQUFhLEVBQUUsTUFqQkQ7QUFrQmRDLElBQUFBLElBQUksRUFBRSxNQWxCUTtBQW1CZEMsSUFBQUEsT0FBTyxFQUFFO0FBbkJLLEdBbEI2Qjs7QUF3QzVDO0FBQ0Q7QUFDQTtBQUNDQyxFQUFBQSxxQkFBcUIsRUFBRTtBQUN0QkMsSUFBQUEsS0FBSyxFQUFFLElBRGU7QUFFdEJDLElBQUFBLEVBQUUsRUFBRSxJQUZrQjtBQUd0QkMsSUFBQUEsR0FBRyxFQUFFO0FBSGlCLEdBM0NxQjtBQWlENUNDLEVBQUFBLFVBakQ0Qyx3QkFpRC9CO0FBQ1p0QyxJQUFBQSxvQ0FBb0MsQ0FBQ3VDLGFBQXJDO0FBQ0EsR0FuRDJDO0FBcUQ1Q0EsRUFBQUEsYUFyRDRDLDJCQXFENUI7QUFDZnZDLElBQUFBLG9DQUFvQyxDQUFDWSxXQUFyQyxHQUFtRCxDQUFuRDtBQUNBWixJQUFBQSxvQ0FBb0MsQ0FBQ3dDLFlBQXJDLENBQWtELFVBQWxEO0FBQ0FDLElBQUFBLE1BQU0sQ0FBQ0MsWUFBUCxDQUFvQjFDLG9DQUFvQyxDQUFDVyxhQUF6RDtBQUNBWCxJQUFBQSxvQ0FBb0MsQ0FBQzJDLE1BQXJDO0FBQ0EsR0ExRDJDO0FBNEQ1Q0EsRUFBQUEsTUE1RDRDLG9CQTREbkM7QUFDUixRQUFJM0Msb0NBQW9DLENBQUNHLGFBQXJDLENBQW1EeUMsUUFBbkQsQ0FBNEQsWUFBNUQsQ0FBSixFQUErRTtBQUM5RTFDLE1BQUFBLENBQUMsQ0FBQzJDLEdBQUYsQ0FBTTtBQUNMQyxRQUFBQSxHQUFHLFlBQUtDLE1BQU0sQ0FBQ0MsTUFBWiwrQ0FERTtBQUVMQyxRQUFBQSxFQUFFLEVBQUUsS0FGQztBQUdMQyxRQUFBQSxXQUFXLEVBQUVDLE1BQU0sQ0FBQ0QsV0FIZjtBQUlMRSxRQUFBQSxVQUpLLHdCQUlRO0FBQ1pwRCxVQUFBQSxvQ0FBb0MsQ0FBQ1csYUFBckMsR0FBcUQ4QixNQUFNLENBQUNZLFVBQVAsQ0FDcERyRCxvQ0FBb0MsQ0FBQzJDLE1BRGUsRUFFcEQzQyxvQ0FBb0MsQ0FBQ1UsT0FGZSxDQUFyRDtBQUlBLFNBVEk7QUFVTDRDLFFBQUFBLFVBVkssc0JBVU1DLFFBVk4sRUFVZ0I7QUFDcEJyRCxVQUFBQSxDQUFDLENBQUMsZUFBRCxDQUFELENBQW1Cc0QsTUFBbkI7O0FBQ0EsY0FBSSxPQUFRRCxRQUFRLENBQUNFLElBQWpCLEtBQTJCLFdBQS9CLEVBQTRDO0FBQzNDekQsWUFBQUEsb0NBQW9DLENBQUMwRCx5QkFBckMsQ0FBK0QsSUFBL0Q7QUFDQTtBQUNBLFdBTG1CLENBT3BCOzs7QUFDQTFELFVBQUFBLG9DQUFvQyxDQUFDMkQsb0JBQXJDLENBQTBESixRQUFRLENBQUNFLElBQW5FO0FBQ0F6RCxVQUFBQSxvQ0FBb0MsQ0FBQzBELHlCQUFyQyxDQUErREgsUUFBUSxDQUFDRSxJQUF4RSxFQVRvQixDQVdwQjs7QUFDQSxjQUFJRyxpQkFBaUIsR0FBR0MsSUFBSSxDQUFDQyxTQUFMLENBQWVQLFFBQVEsQ0FBQ0UsSUFBeEIsRUFBOEIsSUFBOUIsRUFBb0MsQ0FBcEMsQ0FBeEI7O0FBQ0EsY0FBSSxPQUFPRyxpQkFBUCxLQUE2QixRQUFqQyxFQUEyQztBQUMxQ0EsWUFBQUEsaUJBQWlCLEdBQUdBLGlCQUFpQixDQUFDRyxPQUFsQixDQUEwQixLQUExQixFQUFpQyxPQUFqQyxDQUFwQjs7QUFDQSxnQkFBSUMsTUFBTSxDQUFDQyxJQUFQLENBQVlWLFFBQVosRUFBc0JXLE1BQXRCLEdBQStCLENBQS9CLElBQW9DWCxRQUFRLENBQUNZLE1BQVQsS0FBb0IsSUFBNUQsRUFBa0U7QUFDakVuRSxjQUFBQSxvQ0FBb0MsQ0FBQ1EsVUFBckMsQ0FDRTRELEtBREYsa0dBRXdDUixpQkFGeEM7QUFJQSxhQUxELE1BS087QUFDTjVELGNBQUFBLG9DQUFvQyxDQUFDUSxVQUFyQyxDQUNFNEQsS0FERiwySkFHdUNSLGlCQUh2QztBQUtBO0FBQ0Q7QUFDRCxTQXRDSTtBQXVDTFMsUUFBQUEsU0F2Q0ssdUJBdUNPO0FBQ1hyRSxVQUFBQSxvQ0FBb0MsQ0FBQ3dDLFlBQXJDLENBQWtELFdBQWxEO0FBQ0F4QyxVQUFBQSxvQ0FBb0MsQ0FBQ1ksV0FBckMsR0FBbUQsQ0FBbkQ7QUFDQTZCLFVBQUFBLE1BQU0sQ0FBQ0MsWUFBUCxDQUFvQjFDLG9DQUFvQyxDQUFDVyxhQUF6RDtBQUNBLFNBM0NJO0FBNENMMkQsUUFBQUEsU0E1Q0sscUJBNENLZixRQTVDTCxFQTRDZTtBQUNuQnZELFVBQUFBLG9DQUFvQyxDQUFDWSxXQUFyQyxJQUFvRCxDQUFwRDtBQUNBLGNBQU02QyxJQUFJLEdBQUlGLFFBQVEsSUFBSUEsUUFBUSxDQUFDRSxJQUF0QixHQUE4QkYsUUFBUSxDQUFDRSxJQUF2QyxHQUE4QyxJQUEzRDtBQUNBLGNBQU1jLFFBQVEsR0FBSWQsSUFBSSxJQUFJZSxLQUFLLENBQUNDLE9BQU4sQ0FBY2hCLElBQUksQ0FBQ2MsUUFBbkIsQ0FBVCxHQUNkZCxJQUFJLENBQUNjLFFBRFMsR0FDRSxJQURuQjs7QUFFQSxjQUFJLENBQUNBLFFBQUwsRUFBZTtBQUNkdkUsWUFBQUEsb0NBQW9DLENBQUN3QyxZQUFyQyxDQUFrRCxpQkFBbEQ7QUFDQTtBQUNBLFdBUmtCLENBU25CO0FBQ0E7QUFDQTtBQUNBOzs7QUFDQSxjQUFJaUIsSUFBSSxDQUFDaUIsYUFBTCxLQUF1QixJQUEzQixFQUFpQztBQUNoQzFFLFlBQUFBLG9DQUFvQyxDQUFDd0MsWUFBckMsQ0FBa0Qsb0JBQWxEO0FBQ0E7QUFDQSxXQWhCa0IsQ0FpQm5CO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBLGNBQU1tQyxJQUFJLEdBQUczRSxvQ0FBYjtBQUNBLGNBQUk0RSxLQUFLLEdBQUcsSUFBWjtBQUNBLGNBQUlDLFFBQVEsR0FBRyxLQUFmO0FBQ0EsY0FBSUMsV0FBVyxHQUFHLEtBQWxCO0FBQ0EsY0FBTUMsUUFBUSxHQUFHLEVBQWpCO0FBQ0EsY0FBTUMsVUFBVSxHQUFHLEVBQW5CO0FBQ0FULFVBQUFBLFFBQVEsQ0FBQ1UsT0FBVCxDQUFpQixVQUFDQyxDQUFELEVBQU87QUFDdkIsZ0JBQUksQ0FBQ0EsQ0FBRCxJQUFNLE9BQU9BLENBQUMsQ0FBQ0MsSUFBVCxLQUFrQixXQUE1QixFQUF5QztBQUN6QyxnQkFBSUQsQ0FBQyxDQUFDQyxJQUFGLEtBQVcsUUFBZixFQUF5QlAsS0FBSyxHQUFHTSxDQUFDLENBQUNFLEtBQVY7O0FBQ3pCLGdCQUFJRixDQUFDLENBQUNFLEtBQUYsS0FBWSxPQUFaLElBQXVCRixDQUFDLENBQUNFLEtBQUYsS0FBWSxNQUFuQyxJQUE2Q0YsQ0FBQyxDQUFDRSxLQUFGLEtBQVksUUFBekQsSUFDQUYsQ0FBQyxDQUFDRSxLQUFGLEtBQVksTUFEWixJQUNzQkYsQ0FBQyxDQUFDRSxLQUFGLEtBQVksU0FEdEMsRUFDaUQ7QUFDaERQLGNBQUFBLFFBQVEsR0FBRyxJQUFYO0FBQ0FFLGNBQUFBLFFBQVEsQ0FBQ0osSUFBSSxDQUFDVSxZQUFMLENBQWtCSCxDQUFDLENBQUNDLElBQXBCLENBQUQsQ0FBUixHQUFzQyxJQUF0QztBQUNBOztBQUNELGdCQUFJRCxDQUFDLENBQUNFLEtBQUYsS0FBWSxVQUFaLElBQTBCRixDQUFDLENBQUNFLEtBQUYsS0FBWSxTQUF0QyxJQUNBRixDQUFDLENBQUNFLEtBQUYsS0FBWSxTQURoQixFQUMyQjtBQUMxQk4sY0FBQUEsV0FBVyxHQUFHLElBQWQ7QUFDQUUsY0FBQUEsVUFBVSxDQUFDTCxJQUFJLENBQUNVLFlBQUwsQ0FBa0JILENBQUMsQ0FBQ0MsSUFBcEIsQ0FBRCxDQUFWLEdBQXdDLElBQXhDO0FBQ0E7QUFDRCxXQWJEO0FBY0EsY0FBTUcsU0FBUyxHQUFHdEIsTUFBTSxDQUFDQyxJQUFQLENBQVljLFFBQVosQ0FBbEI7QUFDQSxjQUFNUSxTQUFTLEdBQUd2QixNQUFNLENBQUNDLElBQVAsQ0FBWWUsVUFBWixDQUFsQixDQTNDbUIsQ0E0Q25CO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxjQUFJSCxRQUFKLEVBQWM7QUFDYkYsWUFBQUEsSUFBSSxDQUFDbkMsWUFBTCxDQUFrQixpQkFBbEIsRUFBcUM7QUFBRWdELGNBQUFBLEtBQUssRUFBRUY7QUFBVCxhQUFyQztBQUNBLFdBRkQsTUFFTyxJQUFJVixLQUFLLEtBQUssWUFBZCxFQUE0QjtBQUNsQ0QsWUFBQUEsSUFBSSxDQUFDbkMsWUFBTCxDQUFrQix1QkFBbEI7QUFDQSxXQUZNLE1BRUEsSUFBSW9DLEtBQUssS0FBSyxlQUFkLEVBQStCO0FBQ3JDRCxZQUFBQSxJQUFJLENBQUNuQyxZQUFMLENBQWtCLDBCQUFsQjtBQUNBLFdBRk0sTUFFQSxJQUFJc0MsV0FBSixFQUFpQjtBQUN2QjtBQUNBO0FBQ0E7QUFDQSxnQkFBSUgsSUFBSSxDQUFDL0QsV0FBTCxHQUFtQixFQUF2QixFQUEyQjtBQUMxQitELGNBQUFBLElBQUksQ0FBQ25DLFlBQUwsQ0FBa0Isb0JBQWxCLEVBQXdDO0FBQUVpRCxnQkFBQUEsS0FBSyxFQUFFRixTQUFTLENBQUNyQjtBQUFuQixlQUF4QztBQUNBLGFBRkQsTUFFTztBQUNOUyxjQUFBQSxJQUFJLENBQUNuQyxZQUFMLENBQWtCLGlCQUFsQixFQUFxQztBQUFFZ0QsZ0JBQUFBLEtBQUssRUFBRUQ7QUFBVCxlQUFyQztBQUNBO0FBQ0QsV0FUTSxNQVNBO0FBQ05aLFlBQUFBLElBQUksQ0FBQ25DLFlBQUwsQ0FBa0IsV0FBbEI7QUFDQTtBQUNEO0FBaEhJLE9BQU47QUFrSEEsS0FuSEQsTUFtSE87QUFDTnhDLE1BQUFBLG9DQUFvQyxDQUFDWSxXQUFyQyxHQUFtRCxDQUFuRDtBQUNBWixNQUFBQSxvQ0FBb0MsQ0FBQzBELHlCQUFyQyxDQUErRCxJQUEvRDtBQUNBMUQsTUFBQUEsb0NBQW9DLENBQUN3QyxZQUFyQyxDQUFrRCxVQUFsRDtBQUNBeEMsTUFBQUEsb0NBQW9DLENBQUMwRixtQkFBckM7QUFDQTtBQUNELEdBdEwyQzs7QUF3TDVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQ2hDLEVBQUFBLHlCQTdMNEMscUNBNkxsQkQsSUE3TGtCLEVBNkxaO0FBQy9CLFFBQU1rQyxNQUFNLEdBQUdsQyxJQUFJLElBQUlBLElBQUksQ0FBQ21DLHVCQUFMLEtBQWlDLElBQXhEO0FBQ0EsUUFBTUMsUUFBUSxHQUFJcEMsSUFBSSxJQUFJZSxLQUFLLENBQUNDLE9BQU4sQ0FBY2hCLElBQUksQ0FBQ3FDLHlCQUFuQixDQUFULEdBQ2RyQyxJQUFJLENBQUNxQyx5QkFEUyxHQUNtQixFQURwQztBQUVBckQsSUFBQUEsTUFBTSxDQUFDc0QsYUFBUCxDQUFxQixJQUFJQyxXQUFKLENBQWdCLDRCQUFoQixFQUE4QztBQUNsRUMsTUFBQUEsTUFBTSxFQUFFO0FBQ1BOLFFBQUFBLE1BQU0sRUFBTkEsTUFETztBQUVQRSxRQUFBQSxRQUFRLEVBQVJBO0FBRk87QUFEMEQsS0FBOUMsQ0FBckI7QUFNQSxHQXZNMkM7O0FBeU01QztBQUNEO0FBQ0E7QUFDQ0gsRUFBQUEsbUJBNU00QyxpQ0E0TXRCO0FBQ3JCLFFBQU1mLElBQUksR0FBRzNFLG9DQUFiO0FBQ0EsUUFBTWtHLE1BQU0sR0FBR3ZCLElBQUksQ0FBQ2xFLGVBQXBCOztBQUNBLFFBQUksQ0FBQ3lGLE1BQUQsSUFBV0EsTUFBTSxDQUFDaEMsTUFBUCxLQUFrQixDQUFqQyxFQUFvQztBQUNuQztBQUNBOztBQUNELFFBQU1pQyxLQUFLLEdBQUksT0FBT0MsZUFBUCxLQUEyQixXQUEzQixJQUNYQSxlQUFlLENBQUNDLDRCQUROLEdBRVhELGVBQWUsQ0FBQ0MsNEJBRkwsR0FHWCxvQkFISCxDQU5xQixDQVVyQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsUUFBTUMsS0FBSyxHQUFHcEcsQ0FBQyxDQUFDLDJCQUFELENBQWY7QUFDQSxRQUFNcUcsWUFBWSxHQUFHckcsQ0FBQyxDQUFDLGtDQUFELENBQXRCO0FBQ0F5RSxJQUFBQSxJQUFJLENBQUM5RCxjQUFMLEdBQXNCLEVBQXRCOztBQUNBLFFBQUl5RixLQUFLLENBQUNwQyxNQUFOLEdBQWUsQ0FBbkIsRUFBc0I7QUFDckJvQyxNQUFBQSxLQUFLLENBQUNFLEtBQU47QUFDQTs7QUFDRCxRQUFJRCxZQUFZLENBQUNyQyxNQUFiLEdBQXNCLENBQTFCLEVBQTZCO0FBQzVCcUMsTUFBQUEsWUFBWSxDQUFDRSxJQUFiLHVCQUFpQzlCLElBQUksQ0FBQytCLFVBQUwsQ0FBZ0JQLEtBQWhCLENBQWpDLGNBQWtFUSxJQUFsRTtBQUNBLEtBRkQsTUFFTztBQUNOVCxNQUFBQSxNQUFNLENBQUNPLElBQVAsMkNBQTZDOUIsSUFBSSxDQUFDK0IsVUFBTCxDQUFnQlAsS0FBaEIsQ0FBN0M7QUFDQTtBQUNELEdBdk8yQzs7QUF5TzVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3hDLEVBQUFBLG9CQWpQNEMsZ0NBaVB2QkYsSUFqUHVCLEVBaVBqQjtBQUMxQixRQUFNa0IsSUFBSSxHQUFHM0Usb0NBQWI7QUFDQSxRQUFNa0csTUFBTSxHQUFHdkIsSUFBSSxDQUFDbEUsZUFBcEI7O0FBQ0EsUUFBSSxDQUFDeUYsTUFBRCxJQUFXQSxNQUFNLENBQUNoQyxNQUFQLEtBQWtCLENBQWpDLEVBQW9DO0FBQ25DO0FBQ0E7O0FBRUQsUUFBTTBDLEdBQUcsR0FBR2pDLElBQUksQ0FBQytCLFVBQWpCO0FBQ0EsUUFBTUosS0FBSyxHQUFHcEcsQ0FBQyxDQUFDLDJCQUFELENBQWY7QUFDQSxRQUFNcUcsWUFBWSxHQUFHckcsQ0FBQyxDQUFDLGtDQUFELENBQXRCOztBQUNBLFFBQU0yRyxlQUFlLEdBQUcsU0FBbEJBLGVBQWtCLENBQUNDLElBQUQsRUFBVTtBQUNqQ25DLE1BQUFBLElBQUksQ0FBQzlELGNBQUwsR0FBc0IsRUFBdEI7QUFDQXlGLE1BQUFBLEtBQUssQ0FBQ0UsS0FBTjs7QUFDQSxVQUFJRCxZQUFZLENBQUNyQyxNQUFiLEdBQXNCLENBQTFCLEVBQTZCO0FBQzVCcUMsUUFBQUEsWUFBWSxDQUFDRSxJQUFiLHVCQUFpQ0csR0FBRyxDQUFDRSxJQUFELENBQXBDLGNBQXFESCxJQUFyRDtBQUNBLE9BRkQsTUFFTztBQUNOVCxRQUFBQSxNQUFNLENBQUNPLElBQVAsMkNBQTZDRyxHQUFHLENBQUNFLElBQUQsQ0FBaEQ7QUFDQTtBQUNELEtBUkQ7O0FBVUEsUUFBTXZDLFFBQVEsR0FBSWQsSUFBSSxJQUFJQSxJQUFJLENBQUNjLFFBQWQsR0FBMEJkLElBQUksQ0FBQ2MsUUFBL0IsR0FBMEMsSUFBM0QsQ0FwQjBCLENBc0IxQjs7QUFDQUksSUFBQUEsSUFBSSxDQUFDb0MsY0FBTCxHQUF1QnRELElBQUksSUFBSUEsSUFBSSxDQUFDdUQsZUFBYixJQUFnQyxRQUFPdkQsSUFBSSxDQUFDdUQsZUFBWixNQUFnQyxRQUFqRSxHQUNuQnZELElBQUksQ0FBQ3VELGVBRGMsR0FDSSxFQUQxQixDQXZCMEIsQ0EwQjFCOztBQUNBLFFBQUksQ0FBQ3hDLEtBQUssQ0FBQ0MsT0FBTixDQUFjRixRQUFkLENBQUwsRUFBOEI7QUFDN0IsVUFBTXVDLElBQUksR0FBSSxPQUFPdkMsUUFBUCxLQUFvQixRQUFyQixHQUNWQSxRQURVLEdBRVZJLElBQUksQ0FBQ3NDLEVBQUwsQ0FBUSwyQkFBUixFQUFxQyxvQkFBckMsQ0FGSDtBQUdBSixNQUFBQSxlQUFlLENBQUNDLElBQUQsQ0FBZjtBQUNBO0FBQ0EsS0FqQ3lCLENBbUMxQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUNBLFFBQUlJLFNBQVMsR0FBRyxDQUFoQjtBQUNBLFFBQU1DLEVBQUUsR0FBR3hDLElBQUksQ0FBQ29DLGNBQWhCOztBQUNBLFFBQUlJLEVBQUUsSUFBSSxRQUFPQSxFQUFQLE1BQWMsUUFBcEIsSUFDQW5ELE1BQU0sQ0FBQ0MsSUFBUCxDQUFZa0QsRUFBWixFQUFnQkMsSUFBaEIsQ0FBcUIsVUFBQ0MsQ0FBRDtBQUFBLGFBQU9GLEVBQUUsQ0FBQ0UsQ0FBRCxDQUFGLElBQVNGLEVBQUUsQ0FBQ0UsQ0FBRCxDQUFGLENBQU1DLFlBQU4sS0FBdUIsSUFBdkM7QUFBQSxLQUFyQixDQURKLEVBQ3VFO0FBQ3RFSixNQUFBQSxTQUFTLEdBQUdLLElBQUksQ0FBQ0MsS0FBTCxDQUFXQyxJQUFJLENBQUNDLEdBQUwsS0FBYSxLQUF4QixDQUFaO0FBQ0E7O0FBQ0QsUUFBTUMsSUFBSSxHQUFHOUQsSUFBSSxDQUFDQyxTQUFMLENBQWU7QUFBRW9CLE1BQUFBLENBQUMsRUFBRVgsUUFBTDtBQUFlcUQsTUFBQUEsQ0FBQyxFQUFFakQsSUFBSSxDQUFDb0MsY0FBdkI7QUFBdUNjLE1BQUFBLENBQUMsRUFBRVg7QUFBMUMsS0FBZixDQUFiOztBQUNBLFFBQUlTLElBQUksS0FBS2hELElBQUksQ0FBQzlELGNBQWQsSUFBZ0N5RixLQUFLLENBQUN3QixRQUFOLEdBQWlCNUQsTUFBakIsR0FBMEIsQ0FBOUQsRUFBaUU7QUFDaEUsVUFBSXFDLFlBQVksQ0FBQ3JDLE1BQWIsR0FBc0IsQ0FBMUIsRUFBNkI7QUFDNUJxQyxRQUFBQSxZQUFZLENBQUN3QixJQUFiO0FBQ0E7O0FBQ0Q7QUFDQSxLQXJEeUIsQ0F1RDFCOzs7QUFDQSxRQUFNQyxNQUFNLEdBQUcsRUFBZjtBQUNBLFFBQU1DLEtBQUssR0FBRyxFQUFkO0FBQ0ExRCxJQUFBQSxRQUFRLENBQUNVLE9BQVQsQ0FBaUIsVUFBQ2lELEdBQUQsRUFBUztBQUN6QixVQUFJLENBQUNBLEdBQUQsSUFBUSxRQUFPQSxHQUFQLE1BQWUsUUFBM0IsRUFBcUM7QUFDcEM7QUFDQTs7QUFDRCxVQUFNL0MsSUFBSSxHQUFJLE9BQU8rQyxHQUFHLENBQUMvQyxJQUFYLEtBQW9CLFFBQXBCLElBQWdDK0MsR0FBRyxDQUFDL0MsSUFBSixDQUFTakIsTUFBVCxHQUFrQixDQUFuRCxHQUF3RGdFLEdBQUcsQ0FBQy9DLElBQTVELEdBQW1FLFNBQWhGOztBQUNBLFVBQUksQ0FBQzZDLE1BQU0sQ0FBQzdDLElBQUQsQ0FBWCxFQUFtQjtBQUNsQjZDLFFBQUFBLE1BQU0sQ0FBQzdDLElBQUQsQ0FBTixHQUFlLEVBQWY7QUFDQThDLFFBQUFBLEtBQUssQ0FBQ0UsSUFBTixDQUFXaEQsSUFBWDtBQUNBOztBQUNENkMsTUFBQUEsTUFBTSxDQUFDN0MsSUFBRCxDQUFOLENBQWFnRCxJQUFiLENBQWtCRCxHQUFsQjtBQUNBLEtBVkQ7O0FBWUEsUUFBSUQsS0FBSyxDQUFDL0QsTUFBTixLQUFpQixDQUFyQixFQUF3QjtBQUN2QjJDLE1BQUFBLGVBQWUsQ0FBQ2xDLElBQUksQ0FBQ3NDLEVBQUwsQ0FBUSxxQkFBUixFQUErQixzQkFBL0IsQ0FBRCxDQUFmO0FBQ0E7QUFDQSxLQXpFeUIsQ0EyRTFCOzs7QUFDQSxRQUFNbUIsU0FBUyxHQUFHN0QsUUFBUSxDQUFDNkMsSUFBVCxDQUFjLFVBQUNsQyxDQUFEO0FBQUEsYUFBT0EsQ0FBQyxJQUFJQSxDQUFDLENBQUNtRCxRQUFGLEtBQWUsUUFBM0I7QUFBQSxLQUFkLENBQWxCO0FBQ0EsUUFBTUMsUUFBUSxHQUFHRixTQUFTLEdBQUcsQ0FBSCxHQUFPLENBQWpDO0FBRUEsUUFBTUcsSUFBSSxHQUFHLHVEQUNvQjNCLEdBQUcsQ0FBQ2pDLElBQUksQ0FBQ3NDLEVBQUwsQ0FBUSxtQkFBUixFQUE2QixRQUE3QixDQUFELENBRHZCLGtEQUVrQkwsR0FBRyxDQUFDakMsSUFBSSxDQUFDc0MsRUFBTCxDQUFRLG9CQUFSLEVBQThCLFNBQTlCLENBQUQsQ0FGckIsY0FHVG1CLFNBQVMsdUNBQThCeEIsR0FBRyxDQUFDakMsSUFBSSxDQUFDc0MsRUFBTCxDQUFRLHFCQUFSLEVBQStCLFVBQS9CLENBQUQsQ0FBakMsYUFBdUYsRUFIdkYsMkNBSW9CTCxHQUFHLENBQUNqQyxJQUFJLENBQUNzQyxFQUFMLENBQVEsbUJBQVIsRUFBNkIsUUFBN0IsQ0FBRCxDQUp2QixxREFLcUJMLEdBQUcsQ0FBQ2pDLElBQUksQ0FBQ3NDLEVBQUwsQ0FBUSxvQkFBUixFQUE4QixTQUE5QixDQUFELENBTHhCLGFBTVYsZUFOSDtBQVFBLFFBQU11QixJQUFJLEdBQUcsRUFBYjtBQUNBUCxJQUFBQSxLQUFLLENBQUNoRCxPQUFOLENBQWMsVUFBQ0UsSUFBRCxFQUFVO0FBQ3ZCLFVBQU1zRCxJQUFJLEdBQUdULE1BQU0sQ0FBQzdDLElBQUQsQ0FBbkI7QUFDQSxVQUFNdUQsT0FBTyxHQUFHL0QsSUFBSSxDQUFDekMscUJBQUwsQ0FBMkJpRCxJQUEzQixNQUFxQyxJQUFyQyxJQUE2Q3NELElBQUksQ0FBQ3ZFLE1BQUwsR0FBYyxDQUEzRTs7QUFDQSxVQUFJd0UsT0FBSixFQUFhO0FBQ1pGLFFBQUFBLElBQUksQ0FBQ0wsSUFBTCxDQUFVLG9EQUEwQ0csUUFBMUMsb0RBQ3lCMUIsR0FBRyxDQUFDakMsSUFBSSxDQUFDVSxZQUFMLENBQWtCRixJQUFsQixDQUFELENBRDVCLDRDQUV3QnNELElBQUksQ0FBQ3ZFLE1BRjdCLHNCQUFWO0FBR0F1RSxRQUFBQSxJQUFJLENBQUN4RCxPQUFMLENBQWEsVUFBQ2lELEdBQUQsRUFBUztBQUNyQk0sVUFBQUEsSUFBSSxDQUFDTCxJQUFMLENBQVV4RCxJQUFJLENBQUNnRSxnQkFBTCxDQUFzQlQsR0FBdEIsRUFBMkIsSUFBM0IsRUFBaUNFLFNBQWpDLENBQVY7QUFDQSxTQUZEO0FBR0EsT0FQRCxNQU9PO0FBQ05JLFFBQUFBLElBQUksQ0FBQ0wsSUFBTCxDQUFVeEQsSUFBSSxDQUFDZ0UsZ0JBQUwsQ0FBc0JGLElBQUksQ0FBQyxDQUFELENBQTFCLEVBQStCLEtBQS9CLEVBQXNDTCxTQUF0QyxDQUFWO0FBQ0EsT0Fac0IsQ0FhdkI7QUFDQTtBQUNBOzs7QUFDQSxVQUFNUSxNQUFNLEdBQUd6RCxJQUFJLENBQUMwRCxPQUFMLENBQWEsR0FBYixLQUFxQixDQUFyQixHQUF5QjFELElBQUksQ0FBQzJELEtBQUwsQ0FBVyxHQUFYLEVBQWdCLENBQWhCLENBQXpCLEdBQThDM0QsSUFBN0Q7QUFDQSxVQUFNNEQsS0FBSyxHQUFHcEUsSUFBSSxDQUFDcUUsa0JBQUwsQ0FBd0JKLE1BQXhCLEVBQWdDTixRQUFoQyxDQUFkOztBQUNBLFVBQUlTLEtBQUssS0FBSyxFQUFkLEVBQWtCO0FBQ2pCUCxRQUFBQSxJQUFJLENBQUNMLElBQUwsQ0FBVVksS0FBVjtBQUNBO0FBQ0QsS0FyQkQ7QUF1QkF6QyxJQUFBQSxLQUFLLENBQUNHLElBQU4sQ0FBVyxpRkFDUjhCLElBRFEsR0FDRCxTQURDLEdBQ1dDLElBQUksQ0FBQ1MsSUFBTCxDQUFVLEVBQVYsQ0FEWCxHQUMyQixrQkFEdEM7QUFFQXRFLElBQUFBLElBQUksQ0FBQzlELGNBQUwsR0FBc0I4RyxJQUF0Qjs7QUFDQSxRQUFJcEIsWUFBWSxDQUFDckMsTUFBYixHQUFzQixDQUExQixFQUE2QjtBQUM1QnFDLE1BQUFBLFlBQVksQ0FBQ3dCLElBQWI7QUFDQTtBQUNELEdBdFcyQzs7QUF3VzVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ1ksRUFBQUEsZ0JBaFg0Qyw0QkFnWDNCVCxHQWhYMkIsRUFnWHRCZ0IsT0FoWHNCLEVBZ1hiZCxTQWhYYSxFQWdYRjtBQUN6QyxRQUFNekQsSUFBSSxHQUFHM0Usb0NBQWI7QUFDQSxRQUFNNEcsR0FBRyxHQUFHakMsSUFBSSxDQUFDK0IsVUFBakI7QUFDQSxRQUFNNEIsUUFBUSxHQUFHRixTQUFTLEdBQUcsQ0FBSCxHQUFPLENBQWpDO0FBRUEsUUFBTWUsUUFBUSxHQUFJLE9BQU9qQixHQUFHLENBQUM5QyxLQUFYLEtBQXFCLFFBQXJCLElBQWlDOEMsR0FBRyxDQUFDOUMsS0FBSixDQUFVbEIsTUFBVixHQUFtQixDQUFyRCxHQUEwRGdFLEdBQUcsQ0FBQzlDLEtBQTlELEdBQXNFLFNBQXZGO0FBQ0EsUUFBTWdFLEtBQUssR0FBR3pFLElBQUksQ0FBQzBFLFVBQUwsQ0FBZ0JGLFFBQWhCLENBQWQ7QUFDQSxRQUFNRyxRQUFRLEdBQUczRSxJQUFJLENBQUM3RCxhQUFMLENBQW1Cc0ksS0FBbkIsS0FBNkIsTUFBOUM7QUFDQSxRQUFNRyxTQUFTLEdBQUc1RSxJQUFJLENBQUM0RSxTQUFMLENBQWVKLFFBQWYsQ0FBbEI7QUFFQSxRQUFNSyxXQUFXLEdBQUdOLE9BQU8sR0FDeEJ2RSxJQUFJLENBQUM4RSxTQUFMLENBQWV2QixHQUFHLENBQUN3QixJQUFuQixDQUR3QixHQUV4Qi9FLElBQUksQ0FBQ1UsWUFBTCxDQUFrQjZDLEdBQUcsQ0FBQy9DLElBQXRCLENBRkg7QUFHQSxRQUFNd0UsUUFBUSxHQUFHVCxPQUFPLEdBQUcsOEJBQUgsR0FBb0MsRUFBNUQ7QUFFQSxRQUFNVSxNQUFNLEdBQUksT0FBTzFCLEdBQUcsQ0FBQzBCLE1BQVgsS0FBc0IsUUFBdEIsSUFBa0MxQixHQUFHLENBQUMwQixNQUFKLENBQVcxRixNQUFYLEdBQW9CLENBQXZELEdBQTREZ0UsR0FBRyxDQUFDMEIsTUFBaEUsR0FBeUUsRUFBeEY7QUFDQSxRQUFNQyxPQUFPLEdBQUksT0FBTzNCLEdBQUcsQ0FBQzJCLE9BQVgsS0FBdUIsUUFBdkIsSUFBbUMzQixHQUFHLENBQUMyQixPQUFKLENBQVkzRixNQUFaLEdBQXFCLENBQXpELEdBQThEZ0UsR0FBRyxDQUFDMkIsT0FBbEUsR0FBNEUsRUFBNUY7QUFDQSxRQUFNQyxTQUFTLEdBQUksT0FBTzVCLEdBQUcsQ0FBQzZCLFVBQVgsS0FBMEIsUUFBMUIsSUFBc0M3QixHQUFHLENBQUM2QixVQUFKLENBQWU3RixNQUFmLEdBQXdCLENBQS9ELEdBQW9FZ0UsR0FBRyxDQUFDNkIsVUFBeEUsR0FBcUYsRUFBdkc7QUFDQSxRQUFNQyxJQUFJLEdBQUcsZ0NBQWI7QUFFQSxRQUFNQyxVQUFVLEdBQUcsb0NBQTRCckQsR0FBRyxDQUFDMEMsUUFBRCxDQUEvQix3QkFBcUQxQyxHQUFHLENBQUN1QyxRQUFELENBQXhELDBEQUNldkMsR0FBRyxDQUFDMkMsU0FBRCxDQURsQixZQUFuQjtBQUdBLFFBQU1XLFFBQVEsdUNBQStCaEIsT0FBTyxHQUFHLGtCQUFILEdBQXdCLEVBQTlELGdCQUFxRVMsUUFBckUsU0FBZ0YvQyxHQUFHLENBQUM0QyxXQUFELENBQW5GLFlBQWQ7QUFFQSxRQUFNVyxPQUFPLEdBQUcvQixTQUFTLHVDQUE4QnpELElBQUksQ0FBQ3lGLGFBQUwsQ0FBbUJsQyxHQUFHLENBQUNHLFFBQXZCLENBQTlCLGFBQXdFLEVBQWpHO0FBRUEsUUFBTWdDLEtBQUssR0FBRyx1Q0FBOEJKLFVBQTlCLGtEQUNpQkMsUUFEakIsYUFFWEMsT0FGVywwQ0FHbUJQLE1BQU0sS0FBSyxFQUFYLEdBQWdCaEQsR0FBRyxDQUFDZ0QsTUFBRCxDQUFuQixHQUE4QkksSUFIakQscURBSW9CSCxPQUFPLEtBQUssRUFBWixHQUFpQmpELEdBQUcsQ0FBQ2lELE9BQUQsQ0FBcEIsR0FBZ0NHLElBSnBELFVBQWQ7QUFNQSxRQUFJdkQsSUFBSSxHQUFHLGlDQUF5QnlDLE9BQU8sR0FBRyxpQkFBSCxHQUF1QixFQUF2RCxnQ0FDTXRDLEdBQUcsQ0FBQ3NCLEdBQUcsQ0FBQy9DLElBQUosSUFBWSxFQUFiLENBRFQsNEJBQ3lDeUIsR0FBRyxDQUFDc0IsR0FBRyxDQUFDd0IsSUFBSixJQUFZLEVBQWIsQ0FENUMsZ0JBQ2lFVyxLQURqRSxVQUFYLENBakN5QyxDQW9DekM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsUUFBSVAsU0FBUyxLQUFLLEVBQWQsSUFBb0JSLFFBQVEsS0FBSyxPQUFyQyxFQUE4QztBQUM3QzdDLE1BQUFBLElBQUksSUFBSSx3REFBOEM2QixRQUE5QyxtRkFFVzFCLEdBQUcsQ0FBQ2tELFNBQUQsQ0FGZCxnQkFFOEJsRCxHQUFHLENBQUNqQyxJQUFJLENBQUMyRixRQUFMLENBQWNSLFNBQWQsRUFBeUIsR0FBekIsQ0FBRCxDQUZqQyxlQUdMLFlBSEg7QUFJQTs7QUFFRCxXQUFPckQsSUFBUDtBQUNBLEdBbmEyQzs7QUFxYTVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3VDLEVBQUFBLGtCQTdhNEMsOEJBNmF6QmQsR0E3YXlCLEVBNmFwQkksUUE3YW9CLEVBNmFWO0FBQ2pDLFFBQU0zRCxJQUFJLEdBQUczRSxvQ0FBYjtBQUNBLFFBQU00RyxHQUFHLEdBQUdqQyxJQUFJLENBQUMrQixVQUFqQjtBQUNBLFFBQU02RCxJQUFJLEdBQUc1RixJQUFJLENBQUNvQyxjQUFMLEdBQXNCcEMsSUFBSSxDQUFDb0MsY0FBTCxDQUFvQm1CLEdBQXBCLENBQXRCLEdBQWlELElBQTlEOztBQUNBLFFBQUksQ0FBQ3FDLElBQUQsSUFBU0EsSUFBSSxDQUFDakQsWUFBTCxLQUFzQixJQUFuQyxFQUF5QztBQUN4QyxhQUFPLEVBQVA7QUFDQTs7QUFDRCxRQUFNbkIsS0FBSyxHQUFHeEIsSUFBSSxDQUFDc0MsRUFBTCxDQUFRLHlCQUFSLEVBQW1DLHFCQUFuQyxDQUFkO0FBQ0EsUUFBTXVELEdBQUcsR0FBRzdGLElBQUksQ0FBQzhGLGFBQUwsQ0FBbUJGLElBQUksQ0FBQ0csY0FBeEIsQ0FBWjtBQUNBLFdBQU8sdURBQTZDcEMsUUFBN0MsK0ZBQ3NFMUIsR0FBRyxDQUFDc0IsR0FBRCxDQUR6RSxpREFFeUJ0QixHQUFHLENBQUNULEtBQUQsQ0FGNUIsNERBRzhCUyxHQUFHLENBQUM0RCxHQUFELENBSGpDLGVBSUosWUFKSDtBQUtBLEdBM2IyQzs7QUE2YjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NDLEVBQUFBLGFBcGM0Qyx5QkFvYzlCRSxFQXBjOEIsRUFvYzFCO0FBQ2pCLFFBQU1oRyxJQUFJLEdBQUczRSxvQ0FBYjtBQUNBLFFBQU00SyxDQUFDLEdBQUdDLFFBQVEsQ0FBQ0YsRUFBRCxFQUFLLEVBQUwsQ0FBbEI7O0FBQ0EsUUFBSSxDQUFDQyxDQUFELElBQU1BLENBQUMsSUFBSSxDQUFmLEVBQWtCO0FBQ2pCLGFBQU9qRyxJQUFJLENBQUNzQyxFQUFMLENBQVEscUJBQVIsRUFBK0Isc0JBQS9CLENBQVA7QUFDQTs7QUFDRCxRQUFNNkQsSUFBSSxHQUFHdkQsSUFBSSxDQUFDbEYsR0FBTCxDQUFTLENBQVQsRUFBWWtGLElBQUksQ0FBQ0MsS0FBTCxDQUFXQyxJQUFJLENBQUNDLEdBQUwsS0FBYSxJQUF4QixJQUFnQ2tELENBQTVDLENBQWI7QUFDQSxRQUFJRyxLQUFKOztBQUNBLFFBQUlELElBQUksR0FBRyxFQUFYLEVBQWU7QUFDZEMsTUFBQUEsS0FBSyxhQUFNRCxJQUFOLE1BQUw7QUFDQSxLQUZELE1BRU8sSUFBSUEsSUFBSSxHQUFHLElBQVgsRUFBaUI7QUFDdkJDLE1BQUFBLEtBQUssYUFBTXhELElBQUksQ0FBQ3lELEtBQUwsQ0FBV0YsSUFBSSxHQUFHLEVBQWxCLENBQU4sTUFBTDtBQUNBLEtBRk0sTUFFQTtBQUNOQyxNQUFBQSxLQUFLLGFBQU14RCxJQUFJLENBQUN5RCxLQUFMLENBQVdGLElBQUksR0FBRyxJQUFsQixDQUFOLE1BQUw7QUFDQTs7QUFDRCxXQUFPbkcsSUFBSSxDQUFDc0MsRUFBTCxDQUFRLG1CQUFSLEVBQTZCLHVCQUE3QixFQUFzRGxELE9BQXRELENBQThELE9BQTlELEVBQXVFZ0gsS0FBdkUsQ0FBUDtBQUNBLEdBcGQyQzs7QUFzZDVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NYLEVBQUFBLGFBN2Q0Qyx5QkE2ZDlCL0IsUUE3ZDhCLEVBNmRwQjtBQUN2QixRQUFNMUQsSUFBSSxHQUFHM0Usb0NBQWI7QUFDQSxRQUFNNEcsR0FBRyxHQUFHakMsSUFBSSxDQUFDK0IsVUFBakI7O0FBQ0EsUUFBSTJCLFFBQVEsS0FBSyxRQUFqQixFQUEyQjtBQUMxQixhQUFPLHVGQUNEekIsR0FBRyxDQUFDakMsSUFBSSxDQUFDc0MsRUFBTCxDQUFRLHdCQUFSLEVBQWtDLEtBQWxDLENBQUQsQ0FERixZQUFQO0FBRUE7O0FBQ0QsUUFBSW9CLFFBQVEsS0FBSyxPQUFqQixFQUEwQjtBQUN6QixhQUFPLHdFQUNEekIsR0FBRyxDQUFDakMsSUFBSSxDQUFDc0MsRUFBTCxDQUFRLHVCQUFSLEVBQWlDLE9BQWpDLENBQUQsQ0FERixZQUFQO0FBRUE7O0FBQ0QsV0FBTyxnQ0FBUDtBQUNBLEdBemUyQzs7QUEyZTVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NvQyxFQUFBQSxVQWxmNEMsc0JBa2ZqQ2pFLEtBbGZpQyxFQWtmMUI7QUFDakIsUUFBTUYsQ0FBQyxHQUFHK0YsTUFBTSxDQUFDN0YsS0FBSyxJQUFJLEVBQVYsQ0FBTixDQUFvQjhGLFdBQXBCLEVBQVY7O0FBQ0EsUUFBSWhHLENBQUMsS0FBSyxFQUFWLEVBQWM7QUFDYixhQUFPLFNBQVA7QUFDQTs7QUFDRCxRQUFJQSxDQUFDLENBQUMyRCxPQUFGLENBQVUsSUFBVixNQUFvQixDQUFDLENBQXpCLEVBQTRCO0FBQzNCLGFBQU8sUUFBUDtBQUNBOztBQUNELFFBQUkzRCxDQUFDLENBQUMyRCxPQUFGLENBQVUsVUFBVixNQUEwQixDQUFDLENBQTNCLElBQWdDM0QsQ0FBQyxDQUFDMkQsT0FBRixDQUFVLFFBQVYsTUFBd0IsQ0FBQyxDQUF6RCxJQUNBM0QsQ0FBQyxDQUFDMkQsT0FBRixDQUFVLGVBQVYsTUFBK0IsQ0FBQyxDQURoQyxJQUNxQzNELENBQUMsQ0FBQzJELE9BQUYsQ0FBVSxLQUFWLE1BQXFCLENBQUMsQ0FEL0QsRUFDa0U7QUFDakUsYUFBTyxRQUFQO0FBQ0E7O0FBQ0QsUUFBSTNELENBQUMsS0FBSyxlQUFWLEVBQTJCO0FBQzFCLGFBQU8sZUFBUDtBQUNBOztBQUNELFdBQU9BLENBQVA7QUFDQSxHQWxnQjJDOztBQW9nQjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0MrQixFQUFBQSxFQTNnQjRDLGNBMmdCekNrRSxHQTNnQnlDLEVBMmdCcENDLFFBM2dCb0MsRUEyZ0IxQjtBQUNqQixRQUFJLE9BQU9oRixlQUFQLEtBQTJCLFdBQTNCLElBQTBDQSxlQUFlLENBQUMrRSxHQUFELENBQTdELEVBQW9FO0FBQ25FLGFBQU8vRSxlQUFlLENBQUMrRSxHQUFELENBQXRCO0FBQ0E7O0FBQ0QsV0FBT0MsUUFBUDtBQUNBLEdBaGhCMkM7O0FBa2hCNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0MvRixFQUFBQSxZQXhoQjRDLHdCQXdoQi9CRixJQXhoQitCLEVBd2hCekI7QUFDbEIsUUFBTWtHLEdBQUcsR0FBRztBQUNYQyxNQUFBQSxRQUFRLEVBQUUsc0JBREM7QUFFWEMsTUFBQUEsSUFBSSxFQUFFLGtCQUZLO0FBR1gsZ0JBQVUsaUJBSEM7QUFJWHpKLE1BQUFBLElBQUksRUFBRSxrQkFKSztBQUtYMEosTUFBQUEsS0FBSyxFQUFFLG1CQUxJO0FBTVgsc0JBQWdCLGlCQU5MO0FBT1hySixNQUFBQSxLQUFLLEVBQUUsbUJBUEk7QUFRWEMsTUFBQUEsRUFBRSxFQUFFLGdCQVJPO0FBU1hDLE1BQUFBLEdBQUcsRUFBRSxpQkFUTTtBQVVYLHFCQUFlLHlCQVZKO0FBV1gsdUJBQWlCO0FBWE4sS0FBWjtBQWFBLFFBQU04SSxHQUFHLEdBQUdFLEdBQUcsQ0FBQ2xHLElBQUQsQ0FBZjs7QUFDQSxRQUFJZ0csR0FBRyxJQUFJLE9BQU8vRSxlQUFQLEtBQTJCLFdBQWxDLElBQWlEQSxlQUFlLENBQUMrRSxHQUFELENBQXBFLEVBQTJFO0FBQzFFLGFBQU8vRSxlQUFlLENBQUMrRSxHQUFELENBQXRCO0FBQ0E7O0FBQ0QsV0FBT2hHLElBQUksSUFBSSxTQUFmO0FBQ0EsR0EzaUIyQzs7QUE2aUI1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0NvRSxFQUFBQSxTQXJqQjRDLHFCQXFqQmxDbkUsS0FyakJrQyxFQXFqQjNCO0FBQ2hCLFFBQU1ULElBQUksR0FBRzNFLG9DQUFiO0FBQ0EsUUFBTXlMLEdBQUcsR0FBR1IsTUFBTSxDQUFDN0YsS0FBSyxJQUFJLEVBQVYsQ0FBbEIsQ0FGZ0IsQ0FHaEI7O0FBQ0EsUUFBTXNHLFFBQVEsMkJBQW9CRCxHQUFwQixDQUFkOztBQUNBLFFBQUksT0FBT3JGLGVBQVAsS0FBMkIsV0FBM0IsSUFBMENBLGVBQWUsQ0FBQ3NGLFFBQUQsQ0FBN0QsRUFBeUU7QUFDeEUsYUFBT3RGLGVBQWUsQ0FBQ3NGLFFBQUQsQ0FBdEI7QUFDQTs7QUFDRCxRQUFNdEMsS0FBSyxHQUFHekUsSUFBSSxDQUFDMEUsVUFBTCxDQUFnQm9DLEdBQWhCLENBQWQ7QUFDQSxRQUFNRSxRQUFRLDJCQUFvQnZDLEtBQXBCLENBQWQ7O0FBQ0EsUUFBSSxPQUFPaEQsZUFBUCxLQUEyQixXQUEzQixJQUEwQ0EsZUFBZSxDQUFDdUYsUUFBRCxDQUE3RCxFQUF5RTtBQUN4RSxhQUFPdkYsZUFBZSxDQUFDdUYsUUFBRCxDQUF0QjtBQUNBOztBQUNELFFBQU1QLFFBQVEsR0FBRztBQUNoQnJLLE1BQUFBLEVBQUUsRUFBRSxJQURZO0FBRWhCQyxNQUFBQSxhQUFhLEVBQUUsZUFGQztBQUdoQkMsTUFBQUEsU0FBUyxFQUFFLGlCQUhLO0FBSWhCQyxNQUFBQSxVQUFVLEVBQUUsMkJBSkk7QUFLaEJDLE1BQUFBLGFBQWEsRUFBRSxtQkFMQztBQU1oQkMsTUFBQUEsS0FBSyxFQUFFLE9BTlM7QUFPaEJLLE1BQUFBLE9BQU8sRUFBRSxTQVBPO0FBUWhCQyxNQUFBQSxPQUFPLEVBQUUsU0FSTztBQVNoQkMsTUFBQUEsUUFBUSxFQUFFLFVBVE07QUFVaEJDLE1BQUFBLE1BQU0sRUFBRSxnQ0FWUTtBQVdoQkMsTUFBQUEsTUFBTSxFQUFFO0FBWFEsS0FBakI7QUFhQSxXQUFPdUosUUFBUSxDQUFDaEMsS0FBRCxDQUFSLElBQW1CcUMsR0FBMUI7QUFDQSxHQWhsQjJDOztBQWtsQjVDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNDaEMsRUFBQUEsU0F4bEI0QyxxQkF3bEJsQ0MsSUF4bEJrQyxFQXdsQjVCO0FBQ2YsUUFBSSxPQUFPQSxJQUFQLEtBQWdCLFFBQWhCLElBQTRCQSxJQUFJLENBQUN4RixNQUFMLEtBQWdCLENBQWhELEVBQW1EO0FBQ2xELGFBQU8sRUFBUDtBQUNBOztBQUNELFFBQUl3RixJQUFJLENBQUN4RixNQUFMLElBQWUsRUFBbkIsRUFBdUI7QUFDdEIsYUFBT3dGLElBQVA7QUFDQTs7QUFDRCxxQkFBVUEsSUFBSSxDQUFDa0MsU0FBTCxDQUFlLENBQWYsRUFBa0IsQ0FBbEIsQ0FBVjtBQUNBLEdBaG1CMkM7O0FBa21CNUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3RCLEVBQUFBLFFBem1CNEMsb0JBeW1CbkN1QixHQXptQm1DLEVBeW1COUJ4SixHQXptQjhCLEVBeW1CekI7QUFDbEIsUUFBSSxPQUFPd0osR0FBUCxLQUFlLFFBQW5CLEVBQTZCO0FBQzVCLGFBQU8sRUFBUDtBQUNBOztBQUNELFFBQUlBLEdBQUcsQ0FBQzNILE1BQUosSUFBYzdCLEdBQWxCLEVBQXVCO0FBQ3RCLGFBQU93SixHQUFQO0FBQ0E7O0FBQ0QscUJBQVVBLEdBQUcsQ0FBQ0QsU0FBSixDQUFjLENBQWQsRUFBaUJ2SixHQUFqQixDQUFWO0FBQ0EsR0FqbkIyQzs7QUFtbkI1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3FFLEVBQUFBLFVBem5CNEMsc0JBeW5CakNvRixLQXpuQmlDLEVBeW5CMUI7QUFDakIsUUFBSUEsS0FBSyxLQUFLLElBQVYsSUFBa0IsT0FBT0EsS0FBUCxLQUFpQixXQUF2QyxFQUFvRDtBQUNuRCxhQUFPLEVBQVA7QUFDQTs7QUFDRCxXQUFPYixNQUFNLENBQUNhLEtBQUQsQ0FBTixDQUNML0gsT0FESyxDQUNHLElBREgsRUFDUyxPQURULEVBRUxBLE9BRkssQ0FFRyxJQUZILEVBRVMsTUFGVCxFQUdMQSxPQUhLLENBR0csSUFISCxFQUdTLE1BSFQsRUFJTEEsT0FKSyxDQUlHLElBSkgsRUFJUyxRQUpULEVBS0xBLE9BTEssQ0FLRyxJQUxILEVBS1MsT0FMVCxDQUFQO0FBTUEsR0Fub0IyQzs7QUFxb0I1QztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQ3ZCLEVBQUFBLFlBOW9CNEMsd0JBOG9CL0J1SixNQTlvQitCLEVBOG9CdkJ4QixJQTlvQnVCLEVBOG9CakI7QUFDMUIsUUFBTTVGLElBQUksR0FBRzNFLG9DQUFiO0FBQ0EsUUFBTWdNLEVBQUUsR0FBR3JILElBQUksQ0FBQ3JFLGFBQWhCOztBQUNBLFFBQUksQ0FBQzBMLEVBQUQsSUFBT0EsRUFBRSxDQUFDOUgsTUFBSCxLQUFjLENBQXpCLEVBQTRCO0FBQzNCO0FBQ0E7O0FBQ0QsUUFBTVQsSUFBSSxHQUFHOEcsSUFBSSxJQUFJLEVBQXJCO0FBQ0EsUUFBTTNELEdBQUcsR0FBR2pDLElBQUksQ0FBQytCLFVBQWpCO0FBQ0EsUUFBTXVGLE9BQU8sR0FBRyxzQ0FBaEI7O0FBQ0EsUUFBTWhGLEVBQUUsR0FBRyxTQUFMQSxFQUFLLENBQUNrRSxHQUFELEVBQU1DLFFBQU47QUFBQSxhQUFtQnpHLElBQUksQ0FBQ3NDLEVBQUwsQ0FBUWtFLEdBQVIsRUFBYUMsUUFBYixDQUFuQjtBQUFBLEtBQVg7O0FBRUEsUUFBSWMsR0FBRyxHQUFHLGtCQUFWO0FBQ0EsUUFBSUMsR0FBRyxHQUFHLFNBQVY7QUFDQSxRQUFJQyxJQUFJLEdBQUcsRUFBWDtBQUNBLFFBQUl0RixJQUFJLEdBQUcsRUFBWDs7QUFFQSxZQUFRaUYsTUFBUjtBQUNDLFdBQUssV0FBTDtBQUNDRyxRQUFBQSxHQUFHLEdBQUcsbUJBQU47QUFDQUMsUUFBQUEsR0FBRyxHQUFHLElBQU47QUFDQXJGLFFBQUFBLElBQUksR0FBR0csRUFBRSxDQUFDLG1CQUFELEVBQXNCLCtCQUF0QixDQUFUO0FBQ0E7O0FBQ0QsV0FBSyxvQkFBTDtBQUEyQjtBQUMxQmlGLFVBQUFBLEdBQUcsR0FBRyxvQkFBTjtBQUNBQyxVQUFBQSxHQUFHLEdBQUcsTUFBTjtBQUNBQyxVQUFBQSxJQUFJLEdBQUdILE9BQVA7QUFDQSxjQUFJSSxRQUFRLEdBQUdwRixFQUFFLENBQUMsNEJBQUQsRUFBK0IsOEJBQS9CLENBQWpCOztBQUNBLGNBQUl4RCxJQUFJLENBQUNnQyxLQUFMLElBQWNoQyxJQUFJLENBQUNnQyxLQUFMLEdBQWEsQ0FBL0IsRUFBa0M7QUFDakM0RyxZQUFBQSxRQUFRLGdCQUFTNUksSUFBSSxDQUFDZ0MsS0FBZCxNQUFSO0FBQ0E7O0FBQ0RxQixVQUFBQSxJQUFJLEdBQUd1RixRQUFQO0FBQ0E7QUFDQTs7QUFDRCxXQUFLLHVCQUFMO0FBQ0M7QUFDQUgsUUFBQUEsR0FBRyxHQUFHLG9CQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxNQUFOO0FBQ0FDLFFBQUFBLElBQUksR0FBR0gsT0FBUDtBQUNBbkYsUUFBQUEsSUFBSSxHQUFHRyxFQUFFLENBQUMsMEJBQUQsRUFBNkIsMkJBQTdCLENBQVQ7QUFDQTs7QUFDRCxXQUFLLDBCQUFMO0FBQ0M7QUFDQWlGLFFBQUFBLEdBQUcsR0FBRyxvQkFBTjtBQUNBQyxRQUFBQSxHQUFHLEdBQUcsTUFBTjtBQUNBQyxRQUFBQSxJQUFJLEdBQUdILE9BQVA7QUFDQW5GLFFBQUFBLElBQUksR0FBR0csRUFBRSxDQUFDLDZCQUFELEVBQWdDLG1CQUFoQyxDQUFUO0FBQ0E7O0FBQ0QsV0FBSyxpQkFBTDtBQUF3QjtBQUN2QmlGLFVBQUFBLEdBQUcsR0FBRyxpQkFBTjtBQUNBQyxVQUFBQSxHQUFHLEdBQUcsT0FBTjtBQUNBLGNBQU0zRyxLQUFLLEdBQUdoQixLQUFLLENBQUNDLE9BQU4sQ0FBY2hCLElBQUksQ0FBQytCLEtBQW5CLElBQTRCL0IsSUFBSSxDQUFDK0IsS0FBTCxDQUFXOEcsTUFBWCxDQUFrQkMsT0FBbEIsQ0FBNUIsR0FBeUQsRUFBdkU7O0FBQ0EsY0FBSS9HLEtBQUssQ0FBQ3RCLE1BQU4sR0FBZSxDQUFuQixFQUFzQjtBQUNyQjRDLFlBQUFBLElBQUksYUFBTUcsRUFBRSxDQUFDLHVCQUFELEVBQTBCLFNBQTFCLENBQVIsZUFBaUR6QixLQUFLLENBQUN5RCxJQUFOLENBQVcsSUFBWCxDQUFqRCxDQUFKO0FBQ0EsV0FGRCxNQUVPO0FBQ05uQyxZQUFBQSxJQUFJLEdBQUdHLEVBQUUsQ0FBQyx5QkFBRCxFQUE0QixTQUE1QixDQUFUO0FBQ0E7O0FBQ0Q7QUFDQTs7QUFDRCxXQUFLLFVBQUw7QUFDQ2lGLFFBQUFBLEdBQUcsR0FBRyxrQkFBTjtBQUNBQyxRQUFBQSxHQUFHLEdBQUcsU0FBTjtBQUNBckYsUUFBQUEsSUFBSSxHQUFHRyxFQUFFLENBQUMsOEJBQUQsRUFBaUMsb0JBQWpDLENBQVQ7QUFDQTs7QUFDRCxXQUFLLGNBQUw7QUFDQ2lGLFFBQUFBLEdBQUcsR0FBRyxrQkFBTjtBQUNBQyxRQUFBQSxHQUFHLEdBQUcsU0FBTjtBQUNBckYsUUFBQUEsSUFBSSxHQUFHRyxFQUFFLENBQUMsc0JBQUQsRUFBeUIsY0FBekIsQ0FBVDtBQUNBOztBQUNELFdBQUssVUFBTDtBQUNDaUYsUUFBQUEsR0FBRyxHQUFHLGtCQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxTQUFOO0FBQ0FDLFFBQUFBLElBQUksR0FBR0gsT0FBUDtBQUNBbkYsUUFBQUEsSUFBSSxHQUFHRyxFQUFFLENBQUMsc0JBQUQsRUFBeUIsa0JBQXpCLENBQVQ7QUFDQTs7QUFDRDtBQUNDaUYsUUFBQUEsR0FBRyxHQUFHLGlCQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxPQUFOO0FBQ0FyRixRQUFBQSxJQUFJLEdBQUdHLEVBQUUsQ0FBQyx5QkFBRCxFQUE0QixTQUE1QixDQUFUO0FBQ0E7QUE5REY7O0FBaUVBK0UsSUFBQUEsRUFBRSxDQUNBUSxXQURGLENBQ2MsdUVBRGQsRUFFRUMsUUFGRixDQUVXUCxHQUZYLEVBR0V6RixJQUhGLENBR08sd0NBQWdDRyxHQUFHLENBQUN1RixHQUFELENBQW5DLDZEQUMrQkMsSUFEL0IsU0FDc0N4RixHQUFHLENBQUNFLElBQUQsQ0FEekMsWUFIUDtBQUtBO0FBcHVCMkMsQ0FBN0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTWlrb1BCWCAtIGZyZWUgcGhvbmUgc3lzdGVtIGZvciBzbWFsbCBidXNpbmVzc1xuICogQ29weXJpZ2h0IChDKSAyMDE3LTIwMjEgQWxleGV5IFBvcnRub3YgYW5kIE5pa29sYXkgQmVrZXRvdlxuICpcbiAqIFRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gKiBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICogdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbjsgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAqIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gKiBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICogTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICogR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cbiAqXG4gKiBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS5cbiAqIElmIG5vdCwgc2VlIDxodHRwczovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4gKi9cblxuLyogZ2xvYmFsIGdsb2JhbFRyYW5zbGF0ZSwgRm9ybSwgQ29uZmlnLCBQYnhBcGkgKi9cblxuLyoqXG4gKiDQotC10YHRgtC40YDQvtCy0LDQvdC40LUg0YHQvtC10LTQuNC90LXQvdC40Y8g0LzQvtC00YPQu9GPINGBIDHQoSArINGA0LXQvdC00LXRgCDQv9Cw0L3QtdC70Lgg0YHRgtCw0YLRg9GB0L7QsiDRgdC10YDQstC40YHQvtCyLlxuICovXG5jb25zdCBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIgPSB7XG5cdCRmb3JtT2JqOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybScpLFxuXHQkc3RhdHVzVG9nZ2xlOiAkKCcjbW9kdWxlLXN0YXR1cy10b2dnbGUnKSxcblx0JHdlYlNlcnZpY2VUb2dnbGU6ICQoJyN3ZWItc2VydmljZS1tb2RlLXRvZ2dsZScpLFxuXHQkZGVidWdUb2dnbGU6ICQoJyNkZWJ1Zy1tb2RlLXRvZ2dsZScpLFxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjY3RpLXN0YXR1cy1zdW1tYXJ5JyksXG5cdCRzdWJtaXRCdXR0b246ICQoJyNzdWJtaXRidXR0b24nKSxcblx0JGRlYnVnSW5mbzogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0gc3BhbiNkZWJ1Zy1pbmZvJyksXG5cdCRzZXJ2aWNlc1N0YXR1czogJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMnKSxcblx0dGltZU91dDogMzAwMCxcblx0dGltZU91dEhhbmRsZTogJycsXG5cdGVycm9yQ291bnRzOiAwLFxuXHRsYXN0UmVuZGVySGFzaDogJycsXG5cblx0LyoqXG5cdCAqINCc0LDQv9C/0LjQvdCzIHN0YXRlIC0+IENTUy3QutC70LDRgdGBINC70LDQvNC/0L7Rh9C60LguXG5cdCAqINCb0Y7QsdC+0LUg0L3QtdC40LfQstC10YHRgtC90L7QtSDRgdC+0YHRgtC+0Y/QvdC40LUgLT4g0LbRkdC70YLQvtC1ICh3YXJuKS5cblx0ICovXG5cdHN0YXRlTGVkQ2xhc3M6IHtcblx0XHRvazogJ29rJyxcblx0XHRhdXRoZW50aWNhdGVkOiAnb2snLFxuXHRcdGNvbm5lY3RlZDogJ29rJyxcblx0XHR3YWl0aW5nXzFjOiAnd2FybicsXG5cdFx0Y29ubmVjdGluZ18xYzogJ3dhcm4nLFxuXHRcdGVycm9yOiAnZXJyb3InLFxuXHRcdGZhaWw6ICdlcnJvcicsXG5cdFx0ZmFpbGVkOiAnZXJyb3InLFxuXHRcdGRvd246ICdlcnJvcicsXG5cdFx0c3RvcHBlZDogJ2Vycm9yJyxcblx0XHR1bmtub3duOiAndW5rbm93bicsXG5cdFx0cGVuZGluZzogJ3dhcm4nLFxuXHRcdHN0YXJ0aW5nOiAnd2FybicsXG5cdFx0cXJjb2RlOiAnd2FybicsXG5cdFx0cmVhdXRoOiAnd2FybicsXG5cdFx0YXV0aDogJ3dhcm4nLFxuXHRcdGF1dGhfcmVxdWlyZWQ6ICd3YXJuJyxcblx0XHR3YXJuOiAnd2FybicsXG5cdFx0d2FybmluZzogJ3dhcm4nLFxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQodC10YDQstC40YHRiywg0LrQvtGC0L7RgNGL0LUg0LzQvtCz0YPRgiDQuNC00YLQuCDQsiDQvdC10YHQutC+0LvRjNC60LjRhSDQuNC90YHRgtCw0L3RgdCw0YUg0YEg0YDQsNC30L3Ri9C8IGFyZWEuXG5cdCAqL1xuXHRtdWx0aUluc3RhbmNlU2VydmljZXM6IHtcblx0XHRjaGF0czogdHJ1ZSxcblx0XHR0ZzogdHJ1ZSxcblx0XHRtYXg6IHRydWUsXG5cdH0sXG5cblx0aW5pdGlhbGl6ZSgpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVzdGFydFdvcmtlcigpO1xuXHR9LFxuXG5cdHJlc3RhcnRXb3JrZXIoKSB7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdVcGRhdGluZycpO1xuXHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIoKTtcblx0fSxcblxuXHR3b3JrZXIoKSB7XG5cdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kc3RhdHVzVG9nZ2xlLmNoZWNrYm94KCdpcyBjaGVja2VkJykpIHtcblx0XHRcdCQuYXBpKHtcblx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9jaGVja2AsXG5cdFx0XHRcdG9uOiAnbm93Jyxcblx0XHRcdFx0c3VjY2Vzc1Rlc3Q6IFBieEFwaS5zdWNjZXNzVGVzdCxcblx0XHRcdFx0b25Db21wbGV0ZSgpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSA9IHdpbmRvdy5zZXRUaW1lb3V0KFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcixcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uUmVzcG9uc2UocmVzcG9uc2UpIHtcblx0XHRcdFx0XHQkKCcubWVzc2FnZS5hamF4JykucmVtb3ZlKCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiAocmVzcG9uc2UuZGF0YSkgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhudWxsKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZW5kZXIgc2VydmljZXMgc3RhdHVzIHBhbmVsIGZvciBib3RoIHN1Y2Nlc3MgYW5kIHBhcnRpYWwgcmVzcG9uc2VzLlxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJTZXJ2aWNlc1N0YXR1cyhyZXNwb25zZS5kYXRhKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhyZXNwb25zZS5kYXRhKTtcblxuXHRcdFx0XHRcdC8vIERlYnVnIEpTT04gcGFuZSAobGVnYWN5IGRlYnVnIHRhYikuXG5cdFx0XHRcdFx0bGV0IHZpc3VhbEVycm9yU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuZGF0YSwgbnVsbCwgMik7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHZpc3VhbEVycm9yU3RyaW5nID0gdmlzdWFsRXJyb3JTdHJpbmcucmVwbGFjZSgvXFxuL2csICc8YnIvPicpO1xuXHRcdFx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJGRlYnVnSW5mb1xuXHRcdFx0XHRcdFx0XHRcdC5hZnRlcihgPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4gJHt2aXN1YWxFcnJvclN0cmluZ308L3ByZT5cblx0XHRcdFx0XHRcdFx0XHQ8L2Rpdj5gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvXG5cdFx0XHRcdFx0XHRcdFx0LmFmdGVyKGA8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+XG5cdFx0XHRcdFx0XHRcdFx0XHQ8aSBjbGFzcz1cInNwaW5uZXIgbG9hZGluZyBpY29uXCI+PC9pPlxuXHRcdFx0XHRcdFx0XHRcdFx0PHByZSBzdHlsZT0nd2hpdGUtc3BhY2U6IHByZS13cmFwJz4ke3Zpc3VhbEVycm9yU3RyaW5nfTwvcHJlPlxuXHRcdFx0XHRcdFx0XHRcdDwvZGl2PmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25TdWNjZXNzKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyA9IDA7XG5cdFx0XHRcdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRmFpbHVyZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSAocmVzcG9uc2UgJiYgcmVzcG9uc2UuZGF0YSkgPyByZXNwb25zZS5kYXRhIDogbnVsbDtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNlcyA9IChkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS5zdGF0dXNlcykpXG5cdFx0XHRcdFx0XHQ/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXHRcdFx0XHRcdGlmICghc3RhdHVzZXMpIHtcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBNb2R1bGUgc3RhcnR1cCBncmFjZTogdGhlIGJhY2tlbmQgaGFzIGFscmVhZHkgZG93bmdyYWRlZCBhbnlcblx0XHRcdFx0XHQvLyBoYXJkIGVycm9yIHRvIFwic3RhcnRpbmdcIiB3aGlsZSB0aGUgc3RhY2sgYm9vdHMsIHNvIHNob3cgb25lXG5cdFx0XHRcdFx0Ly8gY2FsbSBwcm9ncmVzcyBiYWRnZSBhbmQgbmV2ZXIgZXNjYWxhdGUgdG8gYSBmYWlsdXJlIGhlcmUg4oCUXG5cdFx0XHRcdFx0Ly8gdGhpcyBpcyB3aGF0IGtlZXBzIHRoZSBmaXJzdCB+MiBtaW51dGVzIGZyZWUgb2YgZmFsc2UgcmVkcy5cblx0XHRcdFx0XHRpZiAoZGF0YS5zdGFydHVwX2dyYWNlID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ2xhc3NpZnkgdGhlIHJlc3BvbnNlIGJ5IHRoZSB3b3JzdCBub24tc3lzdGVtIHN0YXRlLlxuXHRcdFx0XHRcdC8vIGNybS0xYyBpcyBzcGVjaWFsOiBpdCdzIHRoZSAxQyBicmlkZ2Ug4oCUIGl0cyBvd24gZXJyb3IgbGFiZWwuXG5cdFx0XHRcdFx0Ly8gQWxvbmdzaWRlIHRoZSBib29sZWFucywgY29sbGVjdCBkZWR1cGVkIGh1bWFuIHNlcnZpY2UgbmFtZXNcblx0XHRcdFx0XHQvLyAoYnkgbGFiZWwpIGZvciBlYWNoIGJ1Y2tldCBzbyB0aGUgc3VtbWFyeSBsaW5lIGNhbiBOQU1FIHRoZVxuXHRcdFx0XHRcdC8vIHNlcnZpY2VzIHRoYXQgYXJlIGZhaWxpbmcgb3Igc3R1Y2sgaW5zdGVhZCBvZiBhIGJhcmUgY29sb3VyLlxuXHRcdFx0XHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0XHRcdFx0bGV0IGNybTFjID0gbnVsbDtcblx0XHRcdFx0XHRsZXQgaGFzRXJyb3IgPSBmYWxzZTtcblx0XHRcdFx0XHRsZXQgaGFzU3RhcnRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRjb25zdCBlcnJOYW1lcyA9IHt9O1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TmFtZXMgPSB7fTtcblx0XHRcdFx0XHRzdGF0dXNlcy5mb3JFYWNoKChzKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXMgfHwgdHlwZW9mIHMubmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcblx0XHRcdFx0XHRcdGlmIChzLm5hbWUgPT09ICdjcm0tMWMnKSBjcm0xYyA9IHMuc3RhdGU7XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBzLnN0YXRlID09PSAnZmFpbCcgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWxlZCdcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ2Rvd24nIHx8IHMuc3RhdGUgPT09ICdzdG9wcGVkJykge1xuXHRcdFx0XHRcdFx0XHRoYXNFcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGVyck5hbWVzW3NlbGYuc2VydmljZUxhYmVsKHMubmFtZSldID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChzLnN0YXRlID09PSAnc3RhcnRpbmcnIHx8IHMuc3RhdGUgPT09ICdwZW5kaW5nJ1xuXHRcdFx0XHRcdFx0XHR8fCBzLnN0YXRlID09PSAndW5rbm93bicpIHtcblx0XHRcdFx0XHRcdFx0aGFzU3RhcnRpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRzdGFydE5hbWVzW3NlbGYuc2VydmljZUxhYmVsKHMubmFtZSldID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCBlcnJvckxpc3QgPSBPYmplY3Qua2V5cyhlcnJOYW1lcyk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRMaXN0ID0gT2JqZWN0LmtleXMoc3RhcnROYW1lcyk7XG5cdFx0XHRcdFx0Ly8gU2V2ZXJpdHkgb3JkZXI6IGEgZ2VudWluZSByZWQgZmFpbHVyZSAoaW5jbC4gYSBjcm0tMWMgYnJpZGdlXG5cdFx0XHRcdFx0Ly8gZGFlbW9uIHRoYXQgaXMgYWN0dWFsbHkgZG93biDigJQgaXQgc3RheXMgJ2Vycm9yJykgd2lucyB0aGVcblx0XHRcdFx0XHQvLyBoZWFkbGluZSBzbyBpdCBpcyBuZXZlciBtYXNrZWQgYnkgYSBjYWxtZXIgbWVzc2FnZS4gVGhlbiB0aGVcblx0XHRcdFx0XHQvLyAxQyBicmlkZ2UncyBtb2RlLWF3YXJlIFwibm8gbGl2ZSBzZXNzaW9uIHlldFwiIHN0YXRlcyAoZnJvbVxuXHRcdFx0XHRcdC8vIHJlZmluZUNybVN0YXR1czogY29ubmVjdGluZ18xYyAvIHdhaXRpbmdfMWMpIOKAlCBhbHdheXMgYSBjYWxtXG5cdFx0XHRcdFx0Ly8geWVsbG93LCBuZXZlciByZWQuIFRoZW4gZ2VuZXJpYyBzdGFydHVwIHByb2dyZXNzLlxuXHRcdFx0XHRcdGlmIChoYXNFcnJvcikge1xuXHRcdFx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicsIHsgbmFtZXM6IGVycm9yTGlzdCB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNybTFjID09PSAnd2FpdGluZ18xYycpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXRpbmcnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNybTFjID09PSAnY29ubmVjdGluZ18xYycpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ0Nvbm5lY3RpbmcnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1N0YXJ0aW5nKSB7XG5cdFx0XHRcdFx0XHQvLyBTdGlsbCBzdGFydGluZzogc2hvdyBwcm9ncmVzcyB1bnRpbCB3ZSBnaXZlIHVwIGFmdGVyIDEwXG5cdFx0XHRcdFx0XHQvLyBmYWlsZWQgcG9sbHMsIHRoZW4gdHJlYXQgdGhlIHN0dWNrIGRhZW1vbiBhcyBhbiBlcnJvclxuXHRcdFx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBmYWxzZWx5IHJlcG9ydGluZyBpdCBhcyBDb25uZWN0ZWQuXG5cdFx0XHRcdFx0XHRpZiAoc2VsZi5lcnJvckNvdW50cyA8IDEwKSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnLCB7IGNvdW50OiBzdGFydExpc3QubGVuZ3RoIH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3Rpb25FcnJvcicsIHsgbmFtZXM6IHN0YXJ0TGlzdCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZi5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLm5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2sobnVsbCk7XG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdEaXNhYmxlZCcpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlckRpc2FibGVkUGFuZWwoKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0L7QvtCx0YnQuNGC0Ywg0YTQvtGA0LzQtSDQvdCw0YHRgtGA0L7QtdC6LCDRh9GC0L4gcmVtb3RlL1ZQUyDQv9C+0LvRjyDQvdGD0LbQvdC+INC30LDQsdC70L7QutC40YDQvtCy0LDRgtGMINC40LvQuCDRgNCw0LfQsdC70L7QutC40YDQvtCy0LDRgtGMLlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdHxudWxsfSBkYXRhINCe0YLQstC10YIgQVBJIGNoZWNrLlxuXHQgKi9cblx0bm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhkYXRhKSB7XG5cdFx0Y29uc3QgYWN0aXZlID0gZGF0YSAmJiBkYXRhLnJlbW90ZV9taWdyYXRpb25fYWN0aXZlID09PSB0cnVlO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gKGRhdGEgJiYgQXJyYXkuaXNBcnJheShkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMpKVxuXHRcdFx0PyBkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMgOiBbXTtcblx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ1JlbW90ZU1pZ3JhdGlvbkxvY2tDaGFuZ2VkJywge1xuXHRcdFx0ZGV0YWlsOiB7XG5cdFx0XHRcdGFjdGl2ZSxcblx0XHRcdFx0c2VydmljZXMsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRwYW5lbCA9IHNlbGYuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQvLyBEb24ndCByZXBsYWNlIHRoZSBwYW5lbCdzIGlubmVySFRNTDogdGhhdCBkZXN0cm95cyAjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzXG5cdFx0Ly8gYW5kICNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyLCBzbyBhIGxhdGVyIHJlLWVuYWJsZSBXSVRIT1VUIGEgcGFnZVxuXHRcdC8vIHJlbG9hZCB3b3VsZCBsZWF2ZSByZW5kZXJTZXJ2aWNlc1N0YXR1cygpIHdyaXRpbmcgaW50byBhbiBlbXB0eSBzZWxlY3Rpb25cblx0XHQvLyBhbmQgdGhlIHRhYmxlIHdvdWxkIG5ldmVyIGNvbWUgYmFjay4gUmV1c2UgdGhlIHBsYWNlaG9sZGVyIGluc3RlYWQsXG5cdFx0Ly8gbWlycm9yaW5nIHJlbmRlclNlcnZpY2VzU3RhdHVzKCkncyBzaG93UGxhY2Vob2xkZXIsIHNvIHRoZSBzdHJ1Y3R1cmVcblx0XHQvLyBzdXJ2aXZlcy4gRmFsbCBiYWNrIHRvIHJlcGxhY2luZyB0aGUgcGFuZWwgb25seSBpZiB0aGUgc2tlbGV0b24gaXMgYWJzZW50LlxuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9ICcnO1xuXHRcdGlmICgkcm93cy5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcm93cy5lbXB0eSgpO1xuXHRcdH1cblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5odG1sKGA8c3Bhbj4mbmJzcDske3NlbGYuZXNjYXBlSHRtbChsYWJlbCl9PC9zcGFuPmApLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHtzZWxmLmVzY2FwZUh0bWwobGFiZWwpfTwvZGl2PmApO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINGC0LDQsdC70LjRhtGLINGB0YLQsNGC0YPRgdC+0LI6IMKr0LjQvdC00LjQutCw0YLQvtGAICsg0YHQtdGA0LLQuNGBL9C60LDQvdCw0LsgKyDRgNCw0YHQv9C+0LvQvtC20LXQvdC40LUgK1xuXHQgKiDQsNC/0YLQsNC50LwgKyDQstC10YDRgdC40Y/Cuy4g0JrQvtC70L7QvdC60LAgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCuyDQv9C+0Y/QstC70Y/QtdGC0YHRjyDRgtC+0LvRjNC60L4g0LXRgdC70Lgg0YXQvtGC0Y8g0LHRi1xuXHQgKiDQvtC00LjQvSDRgdC10YDQstC40YEg0LLRi9C90LXRgdC10L0g0L3QsCBWUFMg4oCUINC90LAg0L7QsdGL0YfQvdC+0Lkg0LvQvtC60LDQu9GM0L3QvtC5INGD0YHRgtCw0L3QvtCy0LrQtSDRgtCw0LHQu9C40YbQsFxuXHQgKiDQvtGB0YLQsNGR0YLRgdGPINC60L7QvNC/0LDQutGC0L3QvtC5LlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZGF0YSDQntGC0LLQtdGCIEFQSSAocmVzcG9uc2UuZGF0YSkuXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlc1N0YXR1cyhkYXRhKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3Qgc2hvd1BsYWNlaG9sZGVyID0gKHRleHQpID0+IHtcblx0XHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcblx0XHRcdCRyb3dzLmVtcHR5KCk7XG5cdFx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmh0bWwoYDxzcGFuPiZuYnNwOyR7ZXNjKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke2VzYyh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXG5cdFx0Ly8gUGhhc2UgQzogcGVyLXNlcnZpY2UgZmFpbGJhY2sgZWxpZ2liaWxpdHkgKyB3YXJtLXN0YW5kYnkgbWlycm9yIGFnZS5cblx0XHRzZWxmLnJlbW90ZUZhaWxiYWNrID0gKGRhdGEgJiYgZGF0YS5yZW1vdGVfZmFpbGJhY2sgJiYgdHlwZW9mIGRhdGEucmVtb3RlX2ZhaWxiYWNrID09PSAnb2JqZWN0Jylcblx0XHRcdD8gZGF0YS5yZW1vdGVfZmFpbGJhY2sgOiB7fTtcblxuXHRcdC8vINCR0Y3QuiDQvNC+0LbQtdGCINCy0LXRgNC90YPRgtGMINGB0YLRgNC+0LrRgyAnTW9kdWxlIGRpc2FibGVkJyDQstC80LXRgdGC0L4g0LzQsNGB0YHQuNCy0LAuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHN0YXR1c2VzKSkge1xuXHRcdFx0Y29uc3QgdGV4dCA9ICh0eXBlb2Ygc3RhdHVzZXMgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQ/IHN0YXR1c2VzXG5cdFx0XHRcdDogc2VsZi50cignbW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZScsICdTdGF0dXMgdW5hdmFpbGFibGUnKTtcblx0XHRcdHNob3dQbGFjZWhvbGRlcih0ZXh0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQn9GA0L7Qv9GD0YHQutCw0LXQvCDQv9C10YDQtdGA0LjRgdC+0LLQutGDIERPTSwg0LXRgdC70Lgg0LTQsNC90L3Ri9C1INC90LUg0LjQt9C80LXQvdC40LvQuNGB0Ywg4oCUINGD0LHQuNGA0LDQtdGCXG5cdFx0Ly8g0LzQtdGA0YbQsNC90LjQtSDRgtCw0LHQu9C40YbRiyDQv9GA0Lgg0L7Qv9GA0L7RgdC1INGA0LDQtyDQsiAzINGB0LXQutGD0L3QtNGLLiDQktC60LvRjtGH0LDQtdC8IHJlbW90ZUZhaWxiYWNrINCyXG5cdFx0Ly8g0YXRjdGILCDQuNC90LDRh9C1INC/0L7Rj9Cy0LvQtdC90LjQtSDQutC90L7Qv9C60Lgv0L7QsdC90L7QstC70LXQvdC40LUg0LLQvtC30YDQsNGB0YLQsCDQutC+0L/QuNC4INC90LUg0L/QtdGA0LXRgNC40YHRg9C10YLRgdGPLlxuXHRcdC8vINCa0L7Qs9C00LAg0L/QvtC60LDQt9Cw0L3QsCDRgdGC0YDQvtC60LAgZmFpbGJhY2ssINC10ZEgwqtsb2NhbCBjb3B5OiBOIGFnb8K7INC00L7Qu9C20LXQvSDQuNC00YLQuCDQtNCw0LbQtVxuXHRcdC8vINC/0YDQuCDQt9Cw0YHRgtGL0LLRiNC40YUgc3RhdHVzZXMvcmVtb3RlRmFpbGJhY2sgKNGC0YPQvdC90LXQu9GMINC70LXQttC40YIg4oCUIGxhc3RfbWlycm9yX3RzINC90LVcblx0XHQvLyDRgNCw0YHRgtGR0YIpLCDQv9C+0Y3RgtC+0LzRgyDQv9C+0LTQvNC10YjQuNCy0LDQtdC8INCz0YDRg9Cx0YvQuSAxNS3RgdC10LrRg9C90LTQvdGL0Lkg0LHQsNC60LXRgiDQstGA0LXQvNC10L3QuCDQsiDRhdGN0YguXG5cdFx0bGV0IGFnZUJ1Y2tldCA9IDA7XG5cdFx0Y29uc3QgcmYgPSBzZWxmLnJlbW90ZUZhaWxiYWNrO1xuXHRcdGlmIChyZiAmJiB0eXBlb2YgcmYgPT09ICdvYmplY3QnXG5cdFx0XHQmJiBPYmplY3Qua2V5cyhyZikuc29tZSgoaykgPT4gcmZba10gJiYgcmZba10uY2FuX2ZhaWxiYWNrID09PSB0cnVlKSkge1xuXHRcdFx0YWdlQnVja2V0ID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTUwMDApO1xuXHRcdH1cblx0XHRjb25zdCBoYXNoID0gSlNPTi5zdHJpbmdpZnkoeyBzOiBzdGF0dXNlcywgZjogc2VsZi5yZW1vdGVGYWlsYmFjaywgYTogYWdlQnVja2V0IH0pO1xuXHRcdGlmIChoYXNoID09PSBzZWxmLmxhc3RSZW5kZXJIYXNoICYmICRyb3dzLmNoaWxkcmVuKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g0JPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhICjQutCw0L3QsNC70YspLlxuXHRcdGNvbnN0IGdyb3VwcyA9IHt9O1xuXHRcdGNvbnN0IG9yZGVyID0gW107XG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRpZiAoIXN2YyB8fCB0eXBlb2Ygc3ZjICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuYW1lID0gKHR5cGVvZiBzdmMubmFtZSA9PT0gJ3N0cmluZycgJiYgc3ZjLm5hbWUubGVuZ3RoID4gMCkgPyBzdmMubmFtZSA6ICd1bmtub3duJztcblx0XHRcdGlmICghZ3JvdXBzW25hbWVdKSB7XG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xuXHRcdFx0XHRvcmRlci5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcblx0XHR9KTtcblxuXHRcdGlmIChvcmRlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHNob3dQbGFjZWhvbGRlcihzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c0VtcHR5JywgJ05vIHNlcnZpY2VzIHJlcG9ydGVkJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCa0L7Qu9C+0L3QutCwIMKr0KDQsNGB0L/QvtC70L7QttC10L3QuNC1wrsg4oCUINGC0L7Qu9GM0LrQviDQutC+0LPQtNCwINC10YHRgtGMINGF0L7RgtGMINC+0LTQuNC9INGD0LTQsNC70ZHQvdC90YvQuSDRgdC10YDQstC40YEuXG5cdFx0Y29uc3QgaGFzUmVtb3RlID0gc3RhdHVzZXMuc29tZSgocykgPT4gcyAmJiBzLmxvY2F0aW9uID09PSAncmVtb3RlJyk7XG5cdFx0Y29uc3QgY29sQ291bnQgPSBoYXNSZW1vdGUgPyA1IDogNDtcblxuXHRcdGNvbnN0IGhlYWQgPSAnPHRoZWFkPjx0cj4nXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXN0YXR1c1wiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU3RhdHVzJywgJ1N0YXR1cycpKX08L3RoPmBcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtbmFtZVwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU2VydmljZScsICdTZXJ2aWNlJykpfTwvdGg+YFxuXHRcdFx0KyAoaGFzUmVtb3RlID8gYDx0aCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xMb2NhdGlvbicsICdMb2NhdGlvbicpKX08L3RoPmAgOiAnJylcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdXB0aW1lXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xVcHRpbWUnLCAnVXB0aW1lJykpfTwvdGg+YFxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC12ZXJzaW9uXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xWZXJzaW9uJywgJ1ZlcnNpb24nKSl9PC90aD5gXG5cdFx0XHQrICc8L3RyPjwvdGhlYWQ+JztcblxuXHRcdGNvbnN0IGJvZHkgPSBbXTtcblx0XHRvcmRlci5mb3JFYWNoKChuYW1lKSA9PiB7XG5cdFx0XHRjb25zdCByb3dzID0gZ3JvdXBzW25hbWVdO1xuXHRcdFx0Y29uc3QgaXNNdWx0aSA9IHNlbGYubXVsdGlJbnN0YW5jZVNlcnZpY2VzW25hbWVdID09PSB0cnVlIHx8IHJvd3MubGVuZ3RoID4gMTtcblx0XHRcdGlmIChpc011bHRpKSB7XG5cdFx0XHRcdGJvZHkucHVzaChgPHRyIGNsYXNzPVwiY3RpLXN2Yy1ncm91cFwiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHRcdFx0KyBgPGkgY2xhc3M9XCJjb21tZW50cyBpY29uXCI+PC9pPiR7ZXNjKHNlbGYuc2VydmljZUxhYmVsKG5hbWUpKX1gXG5cdFx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWNvdW50XCI+JHtyb3dzLmxlbmd0aH08L3NwYW4+PC90ZD48L3RyPmApO1xuXHRcdFx0XHRyb3dzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0XHRcdGJvZHkucHVzaChzZWxmLnJlbmRlclNlcnZpY2VSb3coc3ZjLCB0cnVlLCBoYXNSZW1vdGUpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHJvd3NbMF0sIGZhbHNlLCBoYXNSZW1vdGUpKTtcblx0XHRcdH1cblx0XHRcdC8vIFBoYXNlIEM6IG9mZmVyIFwiYnJpbmcgYmFjayB0byBsb2NhbFwiIG9uY2UgcGVyIHNlcnZpY2UgZ3JvdXAgd2hvc2Vcblx0XHRcdC8vIGNoYW5uZWxzIHN0aWxsIGxpdmUgb24gdGhlIFZQUyAoZGVyaXZlIHRoZSBiYXNlIHN2YyBmcm9tIGFcblx0XHRcdC8vIFwiY2hhdHMuPGFyZWE+XCIgZ3JvdXAgbmFtZSkuXG5cdFx0XHRjb25zdCBzdmNLZXkgPSBuYW1lLmluZGV4T2YoJy4nKSA+PSAwID8gbmFtZS5zcGxpdCgnLicpWzBdIDogbmFtZTtcblx0XHRcdGNvbnN0IGZiUm93ID0gc2VsZi5mYWlsYmFja0NvbnRyb2xSb3coc3ZjS2V5LCBjb2xDb3VudCk7XG5cdFx0XHRpZiAoZmJSb3cgIT09ICcnKSB7XG5cdFx0XHRcdGJvZHkucHVzaChmYlJvdyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQkcm93cy5odG1sKCc8dGFibGUgY2xhc3M9XCJ1aSBjZWxsZWQgc3RyaXBlZCBjb21wYWN0IHVuc3RhY2thYmxlIHRhYmxlIGN0aS1zdGF0dXMtdGFibGVcIj4nXG5cdFx0XHQrIGhlYWQgKyAnPHRib2R5PicgKyBib2R5LmpvaW4oJycpICsgJzwvdGJvZHk+PC90YWJsZT4nKTtcblx0XHRzZWxmLmxhc3RSZW5kZXJIYXNoID0gaGFzaDtcblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YLQsNCx0LvQuNGG0YsgKNGB0LXRgNCy0LjRgSDQuNC70Lgg0LrQsNC90LDQuykuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBzdmMg0LfQsNC/0LjRgdGMINC40Lcgc3RhdHVzZXNbXVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGdyb3VwZWQg0YHRgtGA0L7QutCwINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKNC60LDQvdCw0Lsg0LzQtdGB0YHQtdC90LTQttC10YDQsClcblx0ICogQHBhcmFtIHtib29sZWFufSBoYXNSZW1vdGUg0L/QvtC60LDQt9GL0LLQsNGC0Ywg0LvQuCDQutC+0LvQvtC90LrRgyDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUwgKNC+0LTQvdCwIDx0cj4sINC/0LvRjtGBIDx0cj4g0YEg0L7RiNC40LHQutC+0Lkg0L/RgNC4INC90LDQu9C40YfQuNC4KVxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQsIGhhc1JlbW90ZSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUoc3RhdGVSYXcpO1xuXHRcdGNvbnN0IGxlZENsYXNzID0gc2VsZi5zdGF0ZUxlZENsYXNzW2Nhbm9uXSB8fCAnd2Fybic7XG5cdFx0Y29uc3Qgc3RhdGVUZXh0ID0gc2VsZi5zdGF0ZVRleHQoc3RhdGVSYXcpO1xuXG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IHNlbGYuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBzZWxmLnNlcnZpY2VMYWJlbChzdmMubmFtZSk7XG5cdFx0Y29uc3QgbmFtZUljb24gPSBncm91cGVkID8gJzxpIGNsYXNzPVwiaGFzaHRhZyBpY29uXCI+PC9pPicgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblx0XHRjb25zdCBkYXNoID0gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xuXG5cdFx0Y29uc3Qgc3RhdHVzQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbGVkICR7ZXNjKGxlZENsYXNzKX1cIiB0aXRsZT1cIiR7ZXNjKHN0YXRlUmF3KX1cIj48L3NwYW4+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLXN0YXRlXCI+JHtlc2Moc3RhdGVUZXh0KX08L3NwYW4+YDtcblxuXHRcdGNvbnN0IG5hbWVDZWxsID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1uYW1lJHtncm91cGVkID8gJyBjdGktc3ZjLWNoYW5uZWwnIDogJyd9XCI+JHtuYW1lSWNvbn0ke2VzYyhkaXNwbGF5TmFtZSl9PC9zcGFuPmA7XG5cblx0XHRjb25zdCBsb2NDZWxsID0gaGFzUmVtb3RlID8gYDx0ZCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtzZWxmLmxvY2F0aW9uQmFkZ2Uoc3ZjLmxvY2F0aW9uKX08L3RkPmAgOiAnJztcblxuXHRcdGNvbnN0IGNlbGxzID0gYDx0ZCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtzdGF0dXNDZWxsfTwvdGQ+YFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1uYW1lXCI+JHtuYW1lQ2VsbH08L3RkPmBcblx0XHRcdCsgbG9jQ2VsbFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke3VwdGltZSAhPT0gJycgPyBlc2ModXB0aW1lKSA6IGRhc2h9PC90ZD5gXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLXZlcnNpb25cIj4ke3ZlcnNpb24gIT09ICcnID8gZXNjKHZlcnNpb24pIDogZGFzaH08L3RkPmA7XG5cblx0XHRsZXQgaHRtbCA9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLXJvdyR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1zdWJyb3cnIDogJyd9XCJgXG5cdFx0XHQrIGAgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPiR7Y2VsbHN9PC90cj5gO1xuXG5cdFx0Ly8gbGFzdF9lcnJvciBmcm9tIG1vbml0b3JkIGlzIHN0aWNreSAoXCJsYXN0IGVycm9yIGV2ZXIgc2VlblwiKSBhbmQgaXMgTk9UXG5cdFx0Ly8gY2xlYXJlZCBvbiByZWNvdmVyeSDigJQgaXQgc3RheXMgaW4gdGhlIEFQSSBwYXlsb2FkIG9uIHB1cnBvc2UgKGhhbmR5IGZvclxuXHRcdC8vIGRlYnVnZ2luZykuIFN1cmZhY2UgaXQgdG8gdGhlIG9wZXJhdG9yIE9OTFkgd2hlbiB0aGUgc2VydmljZSBpcyBhY3R1YWxseVxuXHRcdC8vIGluIGEgcmVkIGVycm9yIHN0YXRlLiBBIHJlY292ZXJlZCBnbGl0Y2ggKHN0YXRlPW9rKSBvciBhIHNlcnZpY2Ugc3RpbGxcblx0XHQvLyBzdGFydGluZy93YXJtaW5nIHVwIChzdGF0ZT1zdGFydGluZyAtPiB3YXJuIExFRCwgaW5jbC4gdGhlIHN0YXJ0dXAgZ3JhY2Vcblx0XHQvLyB3aW5kb3cpIG11c3QgTk9UIHByaW50IHN0YWxlIGVycm9yIHRleHQg4oCUIG90aGVyd2lzZSB3ZSdkIGJlIHJlcG9ydGluZyBhXG5cdFx0Ly8gc2VydmljZSBmYWlsdXJlIGluIHRoZSBmaXJzdCBtaW51dGUsIHdoaWNoIGlzIGV4YWN0bHkgd2hhdCB3ZSBzdXBwcmVzcy5cblx0XHRpZiAobGFzdEVycm9yICE9PSAnJyAmJiBsZWRDbGFzcyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0aHRtbCArPSBgPHRyIGNsYXNzPVwiY3RpLXN2Yy1lcnJvci1yb3dcIj48dGQgY29sc3Bhbj1cIiR7Y29sQ291bnR9XCI+YFxuXHRcdFx0XHQrIGA8aSBjbGFzcz1cImV4Y2xhbWF0aW9uIHRyaWFuZ2xlIGljb25cIj48L2k+YFxuXHRcdFx0XHQrIGA8c3BhbiB0aXRsZT1cIiR7ZXNjKGxhc3RFcnJvcil9XCI+JHtlc2Moc2VsZi50cnVuY2F0ZShsYXN0RXJyb3IsIDIwMCkpfTwvc3Bhbj5gXG5cdFx0XHRcdCsgJzwvdGQ+PC90cj4nO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBQaGFzZSBDOiDRgdGC0YDQvtC60LAg0YEg0LrQvdC+0L/QutC+0LkgwqvQstC10YDQvdGD0YLRjCDQvdCwINC70L7QutCw0LvRjMK7ICsg0LLQvtC30YDQsNGB0YLQvtC8INC70L7QutCw0LvRjNC90L7QuSDQutC+0L/QuNC4LFxuXHQgKiDQv9C+0LrQsNC30YvQstCw0LXRgtGB0Y8g0LTQu9GPINGB0LXRgNCy0LjRgdCwLCDRh9GM0Lgg0LrQsNC90LDQu9GLINC10YnRkSDQvdCwIFZQUyAoY2FuX2ZhaWxiYWNrKS5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN2YyDQsdCw0LfQvtCy0L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAgKGNoYXRzfHRnfG1heClcblx0ICogQHBhcmFtIHtudW1iZXJ9IGNvbENvdW50INGH0LjRgdC70L4g0LrQvtC70L7QvdC+0Log0YLQsNCx0LvQuNGG0Ytcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTCAoPHRyPikg0LvQuNCx0L4gJycg0LXRgdC70LggZmFpbGJhY2sg0L3QtSDQv9GA0LjQvNC10L3QuNC8XG5cdCAqL1xuXHRmYWlsYmFja0NvbnRyb2xSb3coc3ZjLCBjb2xDb3VudCkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGluZm8gPSBzZWxmLnJlbW90ZUZhaWxiYWNrID8gc2VsZi5yZW1vdGVGYWlsYmFja1tzdmNdIDogbnVsbDtcblx0XHRpZiAoIWluZm8gfHwgaW5mby5jYW5fZmFpbGJhY2sgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSBzZWxmLnRyKCdtb2RfY3RpX0ZhaWxiYWNrVG9Mb2NhbCcsICdCcmluZyBiYWNrIHRvIGxvY2FsJyk7XG5cdFx0Y29uc3QgYWdlID0gc2VsZi5taXJyb3JBZ2VUZXh0KGluZm8ubGFzdF9taXJyb3JfdHMpO1xuXHRcdHJldHVybiBgPHRyIGNsYXNzPVwiY3RpLWZhaWxiYWNrLXJvd1wiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHQrIGA8YnV0dG9uIGNsYXNzPVwidWkgdGlueSBiYXNpYyBvcmFuZ2UgYnV0dG9uIGN0aS1mYWlsYmFjay1idG5cIiBkYXRhLXN2Yz1cIiR7ZXNjKHN2Yyl9XCI+YFxuXHRcdFx0KyBgPGkgY2xhc3M9XCJyZXBseSBpY29uXCI+PC9pPiR7ZXNjKGxhYmVsKX08L2J1dHRvbj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1mYWlsYmFjay1hZ2VcIj4ke2VzYyhhZ2UpfTwvc3Bhbj5gXG5cdFx0XHQrICc8L3RkPjwvdHI+Jztcblx0fSxcblxuXHQvKipcblx0ICogUGhhc2UgQzog0YfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNGL0Lkg0LLQvtC30YDQsNGB0YIg0LvQvtC60LDQu9GM0L3QvtC5INC60L7Qv9C40Lgg0YHQtdGB0YHQuNC4ICh3YXJtLXN0YW5kYnlcblx0ICogbWlycm9yKS4gdHMg4oCUIHVuaXgt0YHQtdC60YPQvdC00Ys7IDAv0L/Rg9GB0YLQviA9PiDCq9C60L7Qv9C40Lgg0LXRidGRINC90LXRgsK7LlxuXHQgKlxuXHQgKiBAcGFyYW0ge251bWJlcn0gdHNcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdG1pcnJvckFnZVRleHQodHMpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IG4gPSBwYXJzZUludCh0cywgMTApO1xuXHRcdGlmICghbiB8fCBuIDw9IDApIHtcblx0XHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvck5ldmVyJywgJ2xvY2FsIGNvcHk6IG5vbmUgeWV0Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlY3MgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSAtIG4pO1xuXHRcdGxldCBodW1hbjtcblx0XHRpZiAoc2VjcyA8IDkwKSB7XG5cdFx0XHRodW1hbiA9IGAke3NlY3N9c2A7XG5cdFx0fSBlbHNlIGlmIChzZWNzIDwgNTQwMCkge1xuXHRcdFx0aHVtYW4gPSBgJHtNYXRoLnJvdW5kKHNlY3MgLyA2MCl9bWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGh1bWFuID0gYCR7TWF0aC5yb3VuZChzZWNzIC8gMzYwMCl9aGA7XG5cdFx0fVxuXHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvckFnZScsICdsb2NhbCBjb3B5OiAlYWdlJSBhZ28nKS5yZXBsYWNlKCclYWdlJScsIGh1bWFuKTtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC50LTQtiDRgNCw0YHQv9C+0LvQvtC20LXQvdC40Y8g0YHQtdGA0LLQuNGB0LA6INGP0YDQutC40LkgwqtWUFPCuyDQtNC70Y8g0LLRi9C90LXRgdC10L3QvdGL0YUg0LrQsNC90LDQu9C+0LIg0Lhcblx0ICog0L/RgNC40LPQu9GD0YjRkdC90L3Ri9C5IMKr0JvQvtC60LDQu9GM0L3QvsK7INC00LvRjyDQstGB0LXQs9C+INC+0YHRgtCw0LvRjNC90L7Qs9C+LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbG9jYXRpb24gJ3JlbW90ZScgfCAnbG9jYWwnIHwgdW5kZWZpbmVkXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUxcblx0ICovXG5cdGxvY2F0aW9uQmFkZ2UobG9jYXRpb24pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRpZiAobG9jYXRpb24gPT09ICdyZW1vdGUnKSB7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwidWkgdGVhbCBsYWJlbCBjdGktbG9jLWJhZGdlXCI+PGkgY2xhc3M9XCJjbG91ZCBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvblJlbW90ZScsICdWUFMnKSl9PC9zcGFuPmA7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ2xvY2FsJykge1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cImN0aS1sb2MtbG9jYWxcIj48aSBjbGFzcz1cImhvbWUgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYCR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfTG9jYXRpb25Mb2NhbCcsICdMb2NhbCcpKX08L3NwYW4+YDtcblx0XHR9XG5cdFx0cmV0dXJuICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+Jztcblx0fSxcblxuXHQvKipcblx0ICog0JrQsNC90L7QvdC40LfQsNGG0LjRjyDRgdCy0L7QsdC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0L7RgdGC0L7Rj9C90LjRjyDQsiDQuNC30LLQtdGB0YLQvdGL0Lkg0LrQu9GO0Ycg0LTQu9GPINC70LDQvNC/0L7Rh9C60Lgg0Lhcblx0ICog0L/QtdGA0LXQstC+0LTQsC4gbW9uaXRvcmQg0LzQvtC20LXRgiDQv9GA0LjRgdGL0LvQsNGC0Ywgwqthd2FpdGluZyBhdXRob3JpemF0aW9uIGNvZGXCuyDQuCDQv9GALlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGNhbm9uU3RhdGUoc3RhdGUpIHtcblx0XHRjb25zdCBzID0gU3RyaW5nKHN0YXRlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChzID09PSAnJykge1xuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZigncXInKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAncXJjb2RlJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZignYXdhaXRpbmcnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCdyZWF1dGgnKSAhPT0gLTFcblx0XHRcdHx8IHMuaW5kZXhPZignYXV0aF9yZXF1aXJlZCcpICE9PSAtMSB8fCBzLmluZGV4T2YoJzJmYScpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdyZWF1dGgnO1xuXHRcdH1cblx0XHRpZiAocyA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dGhlbnRpY2F0ZWQnO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fSxcblxuXHQvKipcblx0ICog0KXQtdC70L/QtdGAINC/0LXRgNC10LLQvtC00LAg0YEg0YTQvtC70LHRjdC60L7QvC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGtleSDQutC70Y7RhyBnbG9iYWxUcmFuc2xhdGVcblx0ICogQHBhcmFtIHtzdHJpbmd9IGZhbGxiYWNrINC30L3QsNGH0LXQvdC40LUg0L/QviDRg9C80L7Qu9GH0LDQvdC40Y5cblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRyKGtleSwgZmFsbGJhY2spIHtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUg0LrQsNC90LDQu9CwL9GB0LXRgNCy0LjRgdCwICjQvdCw0L/RgNC40LzQtdGAIMKr0J/QvtC00LrQu9GO0YfRkdC9wrssXG5cdCAqIMKr0KLRgNC10LHRg9C10YIg0LDQstGC0L7RgNC40LfQsNGG0LjQuMK7KS4g0KHQvdCw0YfQsNC70LAg0LjRidC10Lwg0YLQvtGH0L3Ri9C5INC60LvRjtGHLCDQt9Cw0YLQtdC8INC/0L4g0LrQsNC90L7QvdC40YfQtdGB0LrQvtC80YNcblx0ICog0YHQvtGB0YLQvtGP0L3QuNGOLCDQt9Cw0YLQtdC8IOKAlCDQsNC90LPQu9C40LnRgdC60LjQuSDRhNC+0LvQsdGN0LosINC4INCyINC60YDQsNC50L3QtdC8INGB0LvRg9GH0LDQtSDQuNGB0YXQvtC00L3Rg9GOINGB0YLRgNC+0LrRgy5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0ZVRleHQoc3RhdGUpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IHJhdyA9IFN0cmluZyhzdGF0ZSB8fCAnJyk7XG5cdFx0Ly8g0KLQvtGH0L3Ri9C5INC60LvRjtGHINC/0L7QtCDQuNGB0YXQvtC00L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAo0L3QsCDRgdC70YPRh9Cw0Lkg0YHQv9C10YbQuNGE0LjRh9C90YvRhSDQv9C10YDQtdCy0L7QtNC+0LIpLlxuXHRcdGNvbnN0IGV4YWN0S2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtyYXd9YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2V4YWN0S2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtleGFjdEtleV07XG5cdFx0fVxuXHRcdGNvbnN0IGNhbm9uID0gc2VsZi5jYW5vblN0YXRlKHJhdyk7XG5cdFx0Y29uc3QgY2Fub25LZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke2Nhbm9ufWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbY2Fub25LZXldO1xuXHRcdH1cblx0XHRjb25zdCBmYWxsYmFjayA9IHtcblx0XHRcdG9rOiAnT0snLFxuXHRcdFx0YXV0aGVudGljYXRlZDogJ0F1dGhlbnRpY2F0ZWQnLFxuXHRcdFx0Y29ubmVjdGVkOiAnQ29ubmVjdGVkIHRvIDFDJyxcblx0XHRcdHdhaXRpbmdfMWM6ICdXYWl0aW5nIGZvciAxQyB0byBjb25uZWN0Jyxcblx0XHRcdGNvbm5lY3RpbmdfMWM6ICdDb25uZWN0aW5nIHRvIDFD4oCmJyxcblx0XHRcdGVycm9yOiAnRXJyb3InLFxuXHRcdFx0dW5rbm93bjogJ1Vua25vd24nLFxuXHRcdFx0cGVuZGluZzogJ1BlbmRpbmcnLFxuXHRcdFx0c3RhcnRpbmc6ICdTdGFydGluZycsXG5cdFx0XHRxcmNvZGU6ICdBd2FpdGluZyBRUi1jb2RlIGF1dGhvcml6YXRpb24nLFxuXHRcdFx0cmVhdXRoOiAnQXV0aG9yaXphdGlvbiByZXF1aXJlZCcsXG5cdFx0fTtcblx0XHRyZXR1cm4gZmFsbGJhY2tbY2Fub25dIHx8IHJhdztcblx0fSxcblxuXHQvKipcblx0ICog0JrQvtGA0L7RgtC60L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBhcmVhLUdVSUQg4oCUINC/0LXRgNCy0YvQtSA4INGB0LjQvNCy0L7Qu9C+0LIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBhcmVhXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzaG9ydEFyZWEoYXJlYSkge1xuXHRcdGlmICh0eXBlb2YgYXJlYSAhPT0gJ3N0cmluZycgfHwgYXJlYS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKGFyZWEubGVuZ3RoIDw9IDEyKSB7XG5cdFx0XHRyZXR1cm4gYXJlYTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FyZWEuc3Vic3RyaW5nKDAsIDgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XG5cdFx0aWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChzdHIubGVuZ3RoIDw9IG1heCkge1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LfQvtC/0LDRgdC90YvQuSDRjdC60YDQsNC90LXRgCBIVE1MLlxuXHQgKlxuXHQgKiBAcGFyYW0geyp9IHZhbHVlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRlc2NhcGVIdG1sKHZhbHVlKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSlcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblx0fSxcblxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0L7QsdGJ0LXQs9C+INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyDigJQg0YHRgtGA0L7QutCwLdGB0LLQvtC00LrQsCDQstCy0LXRgNGF0YMg0LLQutC70LDQtNC60LggwqvQodGC0LDRgtGD0YHCu1xuXHQgKiAo0LfQsNC80LXQvdC40LvQsCDQv9GA0LXQttC90LjQuSDRg9Cz0LvQvtCy0L7QuSDQsdC10LnQtNC2ICNzdGF0dXMpLiDQoNC40YHRg9C10YIg0YbQstC10YLQvdGD0Y4g0LvQsNC80L/QvtGH0LrRgyArINGC0LXQutGB0YI7XG5cdCAqINC00LvRjyDQutGA0LDRgdC90L7Qs9C+INGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LbQtdGCINCd0JDQl9CS0JDQotCsINC60L7QvdC60YDQtdGC0L3Ri9C1INC/0YDQvtCx0LvQtdC80L3Ri9C1INGB0LXRgNCy0LjRgdGLLCDQsCDQtNC70Y9cblx0ICog0L/RgNC+0LPRgNC10YHRgdCwIOKAlCDQv9C+0LrQsNC30LDRgtGMINC40YUg0LrQvtC70LjRh9C10YHRgtCy0L4uXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXMg0LrQu9GO0Ycg0YHQvtGB0YLQvtGP0L3QuNGPXG5cdCAqIEBwYXJhbSB7e25hbWVzPzogc3RyaW5nW10sIGNvdW50PzogbnVtYmVyfX0gW2luZm9dINC00L7Qvy4g0LTQsNC90L3Ri9C1INC00LvRjyDRgtC10LrRgdGC0LBcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMsIGluZm8pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRzID0gc2VsZi4kbW9kdWxlU3RhdHVzO1xuXHRcdGlmICghJHMgfHwgJHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBpbmZvIHx8IHt9O1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRjb25zdCBzcGlubmVyID0gJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+Jztcblx0XHRjb25zdCB0ciA9IChrZXksIGZhbGxiYWNrKSA9PiBzZWxmLnRyKGtleSwgZmFsbGJhY2spO1xuXG5cdFx0bGV0IGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRsZXQgbGVkID0gJ3Vua25vd24nO1xuXHRcdGxldCBpY29uID0gJyc7XG5cdFx0bGV0IHRleHQgPSAnJztcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JlZW4nO1xuXHRcdFx0XHRsZWQgPSAnb2snO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGVkJywgJ1RoZSBtb2R1bGUgd29ya3Mgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0bGV0IHByb2dyZXNzID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzJywgJ01vZHVsZSBzZXJ2aWNlcyBhcmUgc3RhcnRpbmcnKTtcblx0XHRcdFx0aWYgKGRhdGEuY291bnQgJiYgZGF0YS5jb3VudCA+IDApIHtcblx0XHRcdFx0XHRwcm9ncmVzcyArPSBgICgke2RhdGEuY291bnR9KWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGV4dCA9IHByb2dyZXNzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdGluZyc6XG5cdFx0XHRcdC8vIGxvbmdwb29sOiAxQyBjb25uZWN0cyB0byB1czsgd2UgYXJlIHdhaXRpbmcgZm9yIGl0LlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX3N0YXRlX3dhaXRpbmdfMWMnLCAnV2FpdGluZyBmb3IgMUMgdG8gY29ubmVjdCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDQ29ubmVjdGluZyc6XG5cdFx0XHRcdC8vIHdlYnNlcnZpY2U6IHdlIGFyZSByZWFjaGluZyBvdXQgdG8gMUMuXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS15ZWxsb3cnO1xuXHRcdFx0XHRsZWQgPSAnd2Fybic7XG5cdFx0XHRcdGljb24gPSBzcGlubmVyO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfc3RhdGVfY29ubmVjdGluZ18xYycsICdDb25uZWN0aW5nIHRvIDFD4oCmJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBBcnJheS5pc0FycmF5KGRhdGEubmFtZXMpID8gZGF0YS5uYW1lcy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcblx0XHRcdFx0aWYgKG5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0ZXh0ID0gYCR7dHIoJ21vZF9jdGlfU3RhdHVzUHJvYmxlbScsICdQcm9ibGVtJyl9OiAke25hbWVzLmpvaW4oJywgJyl9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvbkVycm9yJywgJ0ZhaWx1cmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Rpc2FibGVkJzpcblx0XHRcdFx0Y2xzID0gJ2N0aS1zdW1tYXJ5LWdyZXknO1xuXHRcdFx0XHRsZWQgPSAndW5rbm93bic7XG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCcsICdNb2R1bGUgaXMgZGlzYWJsZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XG5cdFx0XHRcdGxlZCA9ICd1bmtub3duJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Rpc2Nvbm5lY3RlZCcsICdEaXNjb25uZWN0ZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX1VwZGF0ZVN0YXR1cycsICdVcGRhdGluZyBzdGF0dXPigKYnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcicsICdGYWlsdXJlJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdCRzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2N0aS1zdW1tYXJ5LWdyZXkgY3RpLXN1bW1hcnktZ3JlZW4gY3RpLXN1bW1hcnkteWVsbG93IGN0aS1zdW1tYXJ5LXJlZCcpXG5cdFx0XHQuYWRkQ2xhc3MoY2xzKVxuXHRcdFx0Lmh0bWwoYDxzcGFuIGNsYXNzPVwiY3RpLXN1bW1hcnktbGVkICR7ZXNjKGxlZCl9XCI+PC9zcGFuPmBcblx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3VtbWFyeS10ZXh0XCI+JHtpY29ufSR7ZXNjKHRleHQpfTwvc3Bhbj5gKTtcblx0fSxcbn07XG4iXX0=