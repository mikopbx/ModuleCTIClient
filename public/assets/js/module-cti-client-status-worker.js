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
      // Per request: a parallel poll (restartWorker after a form save) must not mark this one.
      var rendered = false;
      $.api({
        url: "".concat(Config.pbxUrl, "/pbxcore/api/modules/ModuleCTIClient/check"),
        on: 'now',
        successTest: PbxApi.successTest,
        onComplete: function onComplete() {
          moduleCTIClientConnectionCheckWorker.timeOutHandle = window.setTimeout(moduleCTIClientConnectionCheckWorker.worker, moduleCTIClientConnectionCheckWorker.timeOut);
        },
        onResponse: function onResponse(response) {
          rendered = true;
          moduleCTIClientConnectionCheckWorker.renderCheckResponse(response);
        },
        onSuccess: function onSuccess() {
          moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
          moduleCTIClientConnectionCheckWorker.errorCounts = 0;
          window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeOutHandle);
        },
        onFailure: function onFailure(response) {
          // Core#1166: newer cores answer a failed check with HTTP 4xx/5xx, and $.api
          // skips onResponse on a non-2xx status, so the panel is drawn here instead.
          if (!rendered && response && _typeof(response) === 'object' && typeof response.data !== 'undefined') {
            moduleCTIClientConnectionCheckWorker.renderCheckResponse(response);
          }

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
   * Draw the services panel, the remote lock and the debug pane from a check answer.
   */
  renderCheckResponse: function renderCheckResponse(response) {
    $('.message.ajax').remove();

    if (typeof response.data === 'undefined') {
      moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(null);
      return;
    } // Render services status panel for both success and partial responses.


    moduleCTIClientConnectionCheckWorker.renderServicesStatus(response.data);
    moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(response.data); // Debug JSON pane (legacy debug tab). Daemon strings go in as text, never as markup.

    var visualErrorString = JSON.stringify(response.data, null, 2);

    if (typeof visualErrorString === 'string') {
      var $pane = $('<div class="ui message ajax"></div>');

      if (!(Object.keys(response).length > 0 && response.result === true)) {
        $pane.append('<i class="spinner loading icon"></i>');
      }

      $pane.append($('<pre style="white-space: pre-wrap"></pre>').text(visualErrorString));
      moduleCTIClientConnectionCheckWorker.$debugInfo.after($pane);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9tb2R1bGUtY3RpLWNsaWVudC1zdGF0dXMtd29ya2VyLmpzIl0sIm5hbWVzIjpbIm1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciIsIiRmb3JtT2JqIiwiJCIsIiRzdGF0dXNUb2dnbGUiLCIkd2ViU2VydmljZVRvZ2dsZSIsIiRkZWJ1Z1RvZ2dsZSIsIiRtb2R1bGVTdGF0dXMiLCIkc3VibWl0QnV0dG9uIiwiJGRlYnVnSW5mbyIsIiRzZXJ2aWNlc1N0YXR1cyIsInRpbWVPdXQiLCJ0aW1lT3V0SGFuZGxlIiwiZXJyb3JDb3VudHMiLCJsYXN0UmVuZGVySGFzaCIsInN0YXRlTGVkQ2xhc3MiLCJvayIsImF1dGhlbnRpY2F0ZWQiLCJjb25uZWN0ZWQiLCJ3YWl0aW5nXzFjIiwiY29ubmVjdGluZ18xYyIsImVycm9yIiwiZmFpbCIsImZhaWxlZCIsImRvd24iLCJzdG9wcGVkIiwidW5rbm93biIsInBlbmRpbmciLCJzdGFydGluZyIsInFyY29kZSIsInJlYXV0aCIsImF1dGgiLCJhdXRoX3JlcXVpcmVkIiwid2FybiIsIndhcm5pbmciLCJtdWx0aUluc3RhbmNlU2VydmljZXMiLCJjaGF0cyIsInRnIiwibWF4IiwiaW5pdGlhbGl6ZSIsInJlc3RhcnRXb3JrZXIiLCJjaGFuZ2VTdGF0dXMiLCJ3aW5kb3ciLCJjbGVhclRpbWVvdXQiLCJ3b3JrZXIiLCJjaGVja2JveCIsInJlbmRlcmVkIiwiYXBpIiwidXJsIiwiQ29uZmlnIiwicGJ4VXJsIiwib24iLCJzdWNjZXNzVGVzdCIsIlBieEFwaSIsIm9uQ29tcGxldGUiLCJzZXRUaW1lb3V0Iiwib25SZXNwb25zZSIsInJlc3BvbnNlIiwicmVuZGVyQ2hlY2tSZXNwb25zZSIsIm9uU3VjY2VzcyIsIm9uRmFpbHVyZSIsImRhdGEiLCJzdGF0dXNlcyIsIkFycmF5IiwiaXNBcnJheSIsInN0YXJ0dXBfZ3JhY2UiLCJzZWxmIiwiY3JtMWMiLCJoYXNFcnJvciIsImhhc1N0YXJ0aW5nIiwiZXJyTmFtZXMiLCJzdGFydE5hbWVzIiwiZm9yRWFjaCIsInMiLCJuYW1lIiwic3RhdGUiLCJzZXJ2aWNlTGFiZWwiLCJlcnJvckxpc3QiLCJPYmplY3QiLCJrZXlzIiwic3RhcnRMaXN0IiwibmFtZXMiLCJjb3VudCIsImxlbmd0aCIsIm5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJyZW5kZXJEaXNhYmxlZFBhbmVsIiwicmVtb3ZlIiwicmVuZGVyU2VydmljZXNTdGF0dXMiLCJ2aXN1YWxFcnJvclN0cmluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCIkcGFuZSIsInJlc3VsdCIsImFwcGVuZCIsInRleHQiLCJhZnRlciIsImFjdGl2ZSIsInJlbW90ZV9taWdyYXRpb25fYWN0aXZlIiwic2VydmljZXMiLCJyZW1vdGVfbWlncmF0aW9uX3NlcnZpY2VzIiwiZGlzcGF0Y2hFdmVudCIsIkN1c3RvbUV2ZW50IiwiZGV0YWlsIiwiJHBhbmVsIiwibGFiZWwiLCJnbG9iYWxUcmFuc2xhdGUiLCJtb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkIiwiJHJvd3MiLCIkcGxhY2Vob2xkZXIiLCJlbXB0eSIsImh0bWwiLCJlc2NhcGVIdG1sIiwic2hvdyIsImVzYyIsInNob3dQbGFjZWhvbGRlciIsInJlbW90ZUZhaWxiYWNrIiwicmVtb3RlX2ZhaWxiYWNrIiwidHIiLCJhZ2VCdWNrZXQiLCJyZiIsInNvbWUiLCJrIiwiY2FuX2ZhaWxiYWNrIiwiTWF0aCIsImZsb29yIiwiRGF0ZSIsIm5vdyIsImhhc2giLCJmIiwiYSIsImNoaWxkcmVuIiwiaGlkZSIsImdyb3VwcyIsIm9yZGVyIiwic3ZjIiwicHVzaCIsImhhc1JlbW90ZSIsImxvY2F0aW9uIiwiY29sQ291bnQiLCJoZWFkIiwiYm9keSIsInJvd3MiLCJpc011bHRpIiwicmVuZGVyU2VydmljZVJvdyIsInN2Y0tleSIsImluZGV4T2YiLCJzcGxpdCIsImZiUm93IiwiZmFpbGJhY2tDb250cm9sUm93Iiwiam9pbiIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImNhbm9uIiwiY2Fub25TdGF0ZSIsImxlZENsYXNzIiwic3RhdGVUZXh0IiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwibmFtZUljb24iLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsImRhc2giLCJzdGF0dXNDZWxsIiwibmFtZUNlbGwiLCJsb2NDZWxsIiwibG9jYXRpb25CYWRnZSIsImNlbGxzIiwidHJ1bmNhdGUiLCJpbmZvIiwiYWdlIiwibWlycm9yQWdlVGV4dCIsImxhc3RfbWlycm9yX3RzIiwidHMiLCJuIiwicGFyc2VJbnQiLCJzZWNzIiwiaHVtYW4iLCJyb3VuZCIsInJlcGxhY2UiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImtleSIsImZhbGxiYWNrIiwibWFwIiwibW9uaXRvcmQiLCJuYXRzIiwicHJveHkiLCJyYXciLCJleGFjdEtleSIsImNhbm9uS2V5Iiwic3Vic3RyaW5nIiwic3RyIiwidmFsdWUiLCJzdGF0dXMiLCIkcyIsInNwaW5uZXIiLCJjbHMiLCJsZWQiLCJpY29uIiwicHJvZ3Jlc3MiLCJmaWx0ZXIiLCJCb29sZWFuIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsSUFBTUEsb0NBQW9DLEdBQUc7QUFDNUNDLEVBQUFBLFFBQVEsRUFBRUMsQ0FBQyxDQUFDLHlCQUFELENBRGlDO0FBRTVDQyxFQUFBQSxhQUFhLEVBQUVELENBQUMsQ0FBQyx1QkFBRCxDQUY0QjtBQUc1Q0UsRUFBQUEsaUJBQWlCLEVBQUVGLENBQUMsQ0FBQywwQkFBRCxDQUh3QjtBQUk1Q0csRUFBQUEsWUFBWSxFQUFFSCxDQUFDLENBQUMsb0JBQUQsQ0FKNkI7QUFLNUNJLEVBQUFBLGFBQWEsRUFBRUosQ0FBQyxDQUFDLHFCQUFELENB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QUksR0FBR3VCLEVBQUUsQ0FBQyxzQkFBRCxFQUF5QixjQUF6QixDQUFUO0FBQ0E7O0FBQ0QsV0FBSyxVQUFMO0FBQ0NrRixRQUFBQSxHQUFHLEdBQUcsa0JBQU47QUFDQUMsUUFBQUEsR0FBRyxHQUFHLFNBQU47QUFDQUMsUUFBQUEsSUFBSSxHQUFHSCxPQUFQO0FBQ0F4RyxRQUFBQSxJQUFJLEdBQUd1QixFQUFFLENBQUMsc0JBQUQsRUFBeUIsa0JBQXpCLENBQVQ7QUFDQTs7QUFDRDtBQUNDa0YsUUFBQUEsR0FBRyxHQUFHLGlCQUFOO0FBQ0FDLFFBQUFBLEdBQUcsR0FBRyxPQUFOO0FBQ0ExRyxRQUFBQSxJQUFJLEdBQUd1QixFQUFFLENBQUMseUJBQUQsRUFBNEIsU0FBNUIsQ0FBVDtBQUNBO0FBOURGOztBQWlFQWdGLElBQUFBLEVBQUUsQ0FDQVEsV0FERixDQUNjLHVFQURkLEVBRUVDLFFBRkYsQ0FFV1AsR0FGWCxFQUdFekYsSUFIRixDQUdPLHdDQUFnQ0csR0FBRyxDQUFDdUYsR0FBRCxDQUFuQyw2REFDK0JDLElBRC9CLFNBQ3NDeEYsR0FBRyxDQUFDbkIsSUFBRCxDQUR6QyxZQUhQO0FBS0E7QUE5dUIyQyxDQUE3QyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaWtvUEJYIC0gZnJlZSBwaG9uZSBzeXN0ZW0gZm9yIHNtYWxsIGJ1c2luZXNzXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTctMjAyMSBBbGV4ZXkgUG9ydG5vdiBhbmQgTmlrb2xheSBCZWtldG92XG4gKlxuICogVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAqIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gKiB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uOyBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICogKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cbiAqXG4gKiBUaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAqIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gKiBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gKiBHTlUgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuICpcbiAqIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFsb25nIHdpdGggdGhpcyBwcm9ncmFtLlxuICogSWYgbm90LCBzZWUgPGh0dHBzOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiAqL1xuXG4vKiBnbG9iYWwgZ2xvYmFsVHJhbnNsYXRlLCBGb3JtLCBDb25maWcsIFBieEFwaSAqL1xuXG4vKipcbiAqINCi0LXRgdGC0LjRgNC+0LLQsNC90LjQtSDRgdC+0LXQtNC40L3QtdC90LjRjyDQvNC+0LTRg9C70Y8g0YEgMdChICsg0YDQtdC90LTQtdGAINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyINGB0LXRgNCy0LjRgdC+0LIuXG4gKi9cbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcblx0JGZvcm1PYmo6ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtJyksXG5cdCRzdGF0dXNUb2dnbGU6ICQoJyNtb2R1bGUtc3RhdHVzLXRvZ2dsZScpLFxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXG5cdCRkZWJ1Z1RvZ2dsZTogJCgnI2RlYnVnLW1vZGUtdG9nZ2xlJyksXG5cdCRtb2R1bGVTdGF0dXM6ICQoJyNjdGktc3RhdHVzLXN1bW1hcnknKSxcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxuXHQkZGVidWdJbmZvOiAkKCcjbW9kdWxlLWN0aS1jbGllbnQtZm9ybSBzcGFuI2RlYnVnLWluZm8nKSxcblx0JHNlcnZpY2VzU3RhdHVzOiAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cycpLFxuXHR0aW1lT3V0OiAzMDAwLFxuXHR0aW1lT3V0SGFuZGxlOiAnJyxcblx0ZXJyb3JDb3VudHM6IDAsXG5cdGxhc3RSZW5kZXJIYXNoOiAnJyxcblxuXHQvKipcblx0ICog0JzQsNC/0L/QuNC90LMgc3RhdGUgLT4gQ1NTLdC60LvQsNGB0YEg0LvQsNC80L/QvtGH0LrQuC5cblx0ICog0JvRjtCx0L7QtSDQvdC10LjQt9Cy0LXRgdGC0L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAtPiDQttGR0LvRgtC+0LUgKHdhcm4pLlxuXHQgKi9cblx0c3RhdGVMZWRDbGFzczoge1xuXHRcdG9rOiAnb2snLFxuXHRcdGF1dGhlbnRpY2F0ZWQ6ICdvaycsXG5cdFx0Y29ubmVjdGVkOiAnb2snLFxuXHRcdHdhaXRpbmdfMWM6ICd3YXJuJyxcblx0XHRjb25uZWN0aW5nXzFjOiAnd2FybicsXG5cdFx0ZXJyb3I6ICdlcnJvcicsXG5cdFx0ZmFpbDogJ2Vycm9yJyxcblx0XHRmYWlsZWQ6ICdlcnJvcicsXG5cdFx0ZG93bjogJ2Vycm9yJyxcblx0XHRzdG9wcGVkOiAnZXJyb3InLFxuXHRcdHVua25vd246ICd1bmtub3duJyxcblx0XHRwZW5kaW5nOiAnd2FybicsXG5cdFx0c3RhcnRpbmc6ICd3YXJuJyxcblx0XHRxcmNvZGU6ICd3YXJuJyxcblx0XHRyZWF1dGg6ICd3YXJuJyxcblx0XHRhdXRoOiAnd2FybicsXG5cdFx0YXV0aF9yZXF1aXJlZDogJ3dhcm4nLFxuXHRcdHdhcm46ICd3YXJuJyxcblx0XHR3YXJuaW5nOiAnd2FybicsXG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0LXRgNCy0LjRgdGLLCDQutC+0YLQvtGA0YvQtSDQvNC+0LPRg9GCINC40LTRgtC4INCyINC90LXRgdC60L7Qu9GM0LrQuNGFINC40L3RgdGC0LDQvdGB0LDRhSDRgSDRgNCw0LfQvdGL0LwgYXJlYS5cblx0ICovXG5cdG11bHRpSW5zdGFuY2VTZXJ2aWNlczoge1xuXHRcdGNoYXRzOiB0cnVlLFxuXHRcdHRnOiB0cnVlLFxuXHRcdG1heDogdHJ1ZSxcblx0fSxcblxuXHRpbml0aWFsaXplKCkge1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZXN0YXJ0V29ya2VyKCk7XG5cdH0sXG5cblx0cmVzdGFydFdvcmtlcigpIHtcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ1VwZGF0aW5nJyk7XG5cdFx0d2luZG93LmNsZWFyVGltZW91dChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIudGltZU91dEhhbmRsZSk7XG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcigpO1xuXHR9LFxuXG5cdHdvcmtlcigpIHtcblx0XHRpZiAobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLiRzdGF0dXNUb2dnbGUuY2hlY2tib3goJ2lzIGNoZWNrZWQnKSkge1xuXHRcdFx0Ly8gUGVyIHJlcXVlc3Q6IGEgcGFyYWxsZWwgcG9sbCAocmVzdGFydFdvcmtlciBhZnRlciBhIGZvcm0gc2F2ZSkgbXVzdCBub3QgbWFyayB0aGlzIG9uZS5cblx0XHRcdGxldCByZW5kZXJlZCA9IGZhbHNlO1xuXHRcdFx0JC5hcGkoe1xuXHRcdFx0XHR1cmw6IGAke0NvbmZpZy5wYnhVcmx9L3BieGNvcmUvYXBpL21vZHVsZXMvTW9kdWxlQ1RJQ2xpZW50L2NoZWNrYCxcblx0XHRcdFx0b246ICdub3cnLFxuXHRcdFx0XHRzdWNjZXNzVGVzdDogUGJ4QXBpLnN1Y2Nlc3NUZXN0LFxuXHRcdFx0XHRvbkNvbXBsZXRlKCkge1xuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIud29ya2VyLFxuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25SZXNwb25zZShyZXNwb25zZSkge1xuXHRcdFx0XHRcdHJlbmRlcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyQ2hlY2tSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xuXHRcdFx0XHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkZhaWx1cmUocmVzcG9uc2UpIHtcblx0XHRcdFx0XHQvLyBDb3JlIzExNjY6IG5ld2VyIGNvcmVzIGFuc3dlciBhIGZhaWxlZCBjaGVjayB3aXRoIEhUVFAgNHh4LzV4eCwgYW5kICQuYXBpXG5cdFx0XHRcdFx0Ly8gc2tpcHMgb25SZXNwb25zZSBvbiBhIG5vbi0yeHggc3RhdHVzLCBzbyB0aGUgcGFuZWwgaXMgZHJhd24gaGVyZSBpbnN0ZWFkLlxuXHRcdFx0XHRcdGlmICghcmVuZGVyZWRcblx0XHRcdFx0XHRcdCYmIHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCdcblx0XHRcdFx0XHRcdCYmIHR5cGVvZiByZXNwb25zZS5kYXRhICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlckNoZWNrUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgKz0gMTtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gKHJlc3BvbnNlICYmIHJlc3BvbnNlLmRhdGEpID8gcmVzcG9uc2UuZGF0YSA6IG51bGw7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBBcnJheS5pc0FycmF5KGRhdGEuc3RhdHVzZXMpKVxuXHRcdFx0XHRcdFx0PyBkYXRhLnN0YXR1c2VzIDogbnVsbDtcblx0XHRcdFx0XHRpZiAoIXN0YXR1c2VzKSB7XG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gTW9kdWxlIHN0YXJ0dXAgZ3JhY2U6IHRoZSBiYWNrZW5kIGhhcyBhbHJlYWR5IGRvd25ncmFkZWQgYW55XG5cdFx0XHRcdFx0Ly8gaGFyZCBlcnJvciB0byBcInN0YXJ0aW5nXCIgd2hpbGUgdGhlIHN0YWNrIGJvb3RzLCBzbyBzaG93IG9uZVxuXHRcdFx0XHRcdC8vIGNhbG0gcHJvZ3Jlc3MgYmFkZ2UgYW5kIG5ldmVyIGVzY2FsYXRlIHRvIGEgZmFpbHVyZSBoZXJlIOKAlFxuXHRcdFx0XHRcdC8vIHRoaXMgaXMgd2hhdCBrZWVwcyB0aGUgZmlyc3QgfjIgbWludXRlcyBmcmVlIG9mIGZhbHNlIHJlZHMuXG5cdFx0XHRcdFx0aWYgKGRhdGEuc3RhcnR1cF9ncmFjZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENsYXNzaWZ5IHRoZSByZXNwb25zZSBieSB0aGUgd29yc3Qgbm9uLXN5c3RlbSBzdGF0ZS5cblx0XHRcdFx0XHQvLyBjcm0tMWMgaXMgc3BlY2lhbDogaXQncyB0aGUgMUMgYnJpZGdlIOKAlCBpdHMgb3duIGVycm9yIGxhYmVsLlxuXHRcdFx0XHRcdC8vIEFsb25nc2lkZSB0aGUgYm9vbGVhbnMsIGNvbGxlY3QgZGVkdXBlZCBodW1hbiBzZXJ2aWNlIG5hbWVzXG5cdFx0XHRcdFx0Ly8gKGJ5IGxhYmVsKSBmb3IgZWFjaCBidWNrZXQgc28gdGhlIHN1bW1hcnkgbGluZSBjYW4gTkFNRSB0aGVcblx0XHRcdFx0XHQvLyBzZXJ2aWNlcyB0aGF0IGFyZSBmYWlsaW5nIG9yIHN0dWNrIGluc3RlYWQgb2YgYSBiYXJlIGNvbG91ci5cblx0XHRcdFx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdFx0XHRcdGxldCBjcm0xYyA9IG51bGw7XG5cdFx0XHRcdFx0bGV0IGhhc0Vycm9yID0gZmFsc2U7XG5cdFx0XHRcdFx0bGV0IGhhc1N0YXJ0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0Y29uc3QgZXJyTmFtZXMgPSB7fTtcblx0XHRcdFx0XHRjb25zdCBzdGFydE5hbWVzID0ge307XG5cdFx0XHRcdFx0c3RhdHVzZXMuZm9yRWFjaCgocykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzIHx8IHR5cGVvZiBzLm5hbWUgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG5cdFx0XHRcdFx0XHRpZiAocy5uYW1lID09PSAnY3JtLTFjJykgY3JtMWMgPSBzLnN0YXRlO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdlcnJvcicgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWwnIHx8IHMuc3RhdGUgPT09ICdmYWlsZWQnXG5cdFx0XHRcdFx0XHRcdHx8IHMuc3RhdGUgPT09ICdkb3duJyB8fCBzLnN0YXRlID09PSAnc3RvcHBlZCcpIHtcblx0XHRcdFx0XHRcdFx0aGFzRXJyb3IgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRlcnJOYW1lc1tzZWxmLnNlcnZpY2VMYWJlbChzLm5hbWUpXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gJ3N0YXJ0aW5nJyB8fCBzLnN0YXRlID09PSAncGVuZGluZydcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ3Vua25vd24nKSB7XG5cdFx0XHRcdFx0XHRcdGhhc1N0YXJ0aW5nID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0c3RhcnROYW1lc1tzZWxmLnNlcnZpY2VMYWJlbChzLm5hbWUpXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JMaXN0ID0gT2JqZWN0LmtleXMoZXJyTmFtZXMpO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGlzdCA9IE9iamVjdC5rZXlzKHN0YXJ0TmFtZXMpO1xuXHRcdFx0XHRcdC8vIFNldmVyaXR5IG9yZGVyOiBhIGdlbnVpbmUgcmVkIGZhaWx1cmUgKGluY2wuIGEgY3JtLTFjIGJyaWRnZVxuXHRcdFx0XHRcdC8vIGRhZW1vbiB0aGF0IGlzIGFjdHVhbGx5IGRvd24g4oCUIGl0IHN0YXlzICdlcnJvcicpIHdpbnMgdGhlXG5cdFx0XHRcdFx0Ly8gaGVhZGxpbmUgc28gaXQgaXMgbmV2ZXIgbWFza2VkIGJ5IGEgY2FsbWVyIG1lc3NhZ2UuIFRoZW4gdGhlXG5cdFx0XHRcdFx0Ly8gMUMgYnJpZGdlJ3MgbW9kZS1hd2FyZSBcIm5vIGxpdmUgc2Vzc2lvbiB5ZXRcIiBzdGF0ZXMgKGZyb21cblx0XHRcdFx0XHQvLyByZWZpbmVDcm1TdGF0dXM6IGNvbm5lY3RpbmdfMWMgLyB3YWl0aW5nXzFjKSDigJQgYWx3YXlzIGEgY2FsbVxuXHRcdFx0XHRcdC8vIHllbGxvdywgbmV2ZXIgcmVkLiBUaGVuIGdlbmVyaWMgc3RhcnR1cCBwcm9ncmVzcy5cblx0XHRcdFx0XHRpZiAoaGFzRXJyb3IpIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InLCB7IG5hbWVzOiBlcnJvckxpc3QgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjcm0xYyA9PT0gJ3dhaXRpbmdfMWMnKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNXYWl0aW5nJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjcm0xYyA9PT0gJ2Nvbm5lY3RpbmdfMWMnKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNDb25uZWN0aW5nJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNTdGFydGluZykge1xuXHRcdFx0XHRcdFx0Ly8gU3RpbGwgc3RhcnRpbmc6IHNob3cgcHJvZ3Jlc3MgdW50aWwgd2UgZ2l2ZSB1cCBhZnRlciAxMFxuXHRcdFx0XHRcdFx0Ly8gZmFpbGVkIHBvbGxzLCB0aGVuIHRyZWF0IHRoZSBzdHVjayBkYWVtb24gYXMgYW4gZXJyb3Jcblx0XHRcdFx0XHRcdC8vIGluc3RlYWQgb2YgZmFsc2VseSByZXBvcnRpbmcgaXQgYXMgQ29ubmVjdGVkLlxuXHRcdFx0XHRcdFx0aWYgKHNlbGYuZXJyb3JDb3VudHMgPCAxMCkge1xuXHRcdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJywgeyBjb3VudDogc3RhcnRMaXN0Lmxlbmd0aCB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InLCB7IG5hbWVzOiBzdGFydExpc3QgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0ZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5ub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrKG51bGwpO1xuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnRGlzYWJsZWQnKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJEaXNhYmxlZFBhbmVsKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiBEcmF3IHRoZSBzZXJ2aWNlcyBwYW5lbCwgdGhlIHJlbW90ZSBsb2NrIGFuZCB0aGUgZGVidWcgcGFuZSBmcm9tIGEgY2hlY2sgYW5zd2VyLlxuXHQgKi9cblx0cmVuZGVyQ2hlY2tSZXNwb25zZShyZXNwb25zZSkge1xuXHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcblx0XHRpZiAodHlwZW9mIChyZXNwb25zZS5kYXRhKSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5ub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrKG51bGwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBzZXJ2aWNlcyBzdGF0dXMgcGFuZWwgZm9yIGJvdGggc3VjY2VzcyBhbmQgcGFydGlhbCByZXNwb25zZXMuXG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlclNlcnZpY2VzU3RhdHVzKHJlc3BvbnNlLmRhdGEpO1xuXHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5ub3RpZnlSZW1vdGVNaWdyYXRpb25Mb2NrKHJlc3BvbnNlLmRhdGEpO1xuXG5cdFx0Ly8gRGVidWcgSlNPTiBwYW5lIChsZWdhY3kgZGVidWcgdGFiKS4gRGFlbW9uIHN0cmluZ3MgZ28gaW4gYXMgdGV4dCwgbmV2ZXIgYXMgbWFya3VwLlxuXHRcdGNvbnN0IHZpc3VhbEVycm9yU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuZGF0YSwgbnVsbCwgMik7XG5cdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0ICRwYW5lID0gJCgnPGRpdiBjbGFzcz1cInVpIG1lc3NhZ2UgYWpheFwiPjwvZGl2PicpO1xuXHRcdFx0aWYgKCEoT2JqZWN0LmtleXMocmVzcG9uc2UpLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UucmVzdWx0ID09PSB0cnVlKSkge1xuXHRcdFx0XHQkcGFuZS5hcHBlbmQoJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+Jyk7XG5cdFx0XHR9XG5cdFx0XHQkcGFuZS5hcHBlbmQoJCgnPHByZSBzdHlsZT1cIndoaXRlLXNwYWNlOiBwcmUtd3JhcFwiPjwvcHJlPicpLnRleHQodmlzdWFsRXJyb3JTdHJpbmcpKTtcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvLmFmdGVyKCRwYW5lKTtcblx0XHR9XG5cdH0sXG5cblx0LyoqXG5cdCAqINCh0L7QvtCx0YnQuNGC0Ywg0YTQvtGA0LzQtSDQvdCw0YHRgtGA0L7QtdC6LCDRh9GC0L4gcmVtb3RlL1ZQUyDQv9C+0LvRjyDQvdGD0LbQvdC+INC30LDQsdC70L7QutC40YDQvtCy0LDRgtGMINC40LvQuCDRgNCw0LfQsdC70L7QutC40YDQvtCy0LDRgtGMLlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdHxudWxsfSBkYXRhINCe0YLQstC10YIgQVBJIGNoZWNrLlxuXHQgKi9cblx0bm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhkYXRhKSB7XG5cdFx0Y29uc3QgYWN0aXZlID0gZGF0YSAmJiBkYXRhLnJlbW90ZV9taWdyYXRpb25fYWN0aXZlID09PSB0cnVlO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gKGRhdGEgJiYgQXJyYXkuaXNBcnJheShkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMpKVxuXHRcdFx0PyBkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMgOiBbXTtcblx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ1JlbW90ZU1pZ3JhdGlvbkxvY2tDaGFuZ2VkJywge1xuXHRcdFx0ZGV0YWlsOiB7XG5cdFx0XHRcdGFjdGl2ZSxcblx0XHRcdFx0c2VydmljZXMsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fSxcblxuXHQvKipcblx0ICog0KHQvtC+0LHRidC10L3QuNC1INCyINC/0LDQvdC10LvQuCDRgdGC0LDRgtGD0YHQvtCyLCDQutC+0LPQtNCwINC80L7QtNGD0LvRjCDQstGL0LrQu9GO0YfQtdC9LlxuXHQgKi9cblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRwYW5lbCA9IHNlbGYuJHNlcnZpY2VzU3RhdHVzO1xuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcblx0XHRcdCYmIGdsb2JhbFRyYW5zbGF0ZS5tb2RfY3RpX1N0YXR1c01vZHVsZURpc2FibGVkKVxuXHRcdFx0PyBnbG9iYWxUcmFuc2xhdGUubW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZFxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcblx0XHQvLyBEb24ndCByZXBsYWNlIHRoZSBwYW5lbCdzIGlubmVySFRNTDogdGhhdCBkZXN0cm95cyAjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzXG5cdFx0Ly8gYW5kICNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyLCBzbyBhIGxhdGVyIHJlLWVuYWJsZSBXSVRIT1VUIGEgcGFnZVxuXHRcdC8vIHJlbG9hZCB3b3VsZCBsZWF2ZSByZW5kZXJTZXJ2aWNlc1N0YXR1cygpIHdyaXRpbmcgaW50byBhbiBlbXB0eSBzZWxlY3Rpb25cblx0XHQvLyBhbmQgdGhlIHRhYmxlIHdvdWxkIG5ldmVyIGNvbWUgYmFjay4gUmV1c2UgdGhlIHBsYWNlaG9sZGVyIGluc3RlYWQsXG5cdFx0Ly8gbWlycm9yaW5nIHJlbmRlclNlcnZpY2VzU3RhdHVzKCkncyBzaG93UGxhY2Vob2xkZXIsIHNvIHRoZSBzdHJ1Y3R1cmVcblx0XHQvLyBzdXJ2aXZlcy4gRmFsbCBiYWNrIHRvIHJlcGxhY2luZyB0aGUgcGFuZWwgb25seSBpZiB0aGUgc2tlbGV0b24gaXMgYWJzZW50LlxuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9ICcnO1xuXHRcdGlmICgkcm93cy5sZW5ndGggPiAwKSB7XG5cdFx0XHQkcm93cy5lbXB0eSgpO1xuXHRcdH1cblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5odG1sKGA8c3Bhbj4mbmJzcDske3NlbGYuZXNjYXBlSHRtbChsYWJlbCl9PC9zcGFuPmApLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHtzZWxmLmVzY2FwZUh0bWwobGFiZWwpfTwvZGl2PmApO1xuXHRcdH1cblx0fSxcblxuXHQvKipcblx0ICog0KDQtdC90LTQtdGAINGC0LDQsdC70LjRhtGLINGB0YLQsNGC0YPRgdC+0LI6IMKr0LjQvdC00LjQutCw0YLQvtGAICsg0YHQtdGA0LLQuNGBL9C60LDQvdCw0LsgKyDRgNCw0YHQv9C+0LvQvtC20LXQvdC40LUgK1xuXHQgKiDQsNC/0YLQsNC50LwgKyDQstC10YDRgdC40Y/Cuy4g0JrQvtC70L7QvdC60LAgwqvQoNCw0YHQv9C+0LvQvtC20LXQvdC40LXCuyDQv9C+0Y/QstC70Y/QtdGC0YHRjyDRgtC+0LvRjNC60L4g0LXRgdC70Lgg0YXQvtGC0Y8g0LHRi1xuXHQgKiDQvtC00LjQvSDRgdC10YDQstC40YEg0LLRi9C90LXRgdC10L0g0L3QsCBWUFMg4oCUINC90LAg0L7QsdGL0YfQvdC+0Lkg0LvQvtC60LDQu9GM0L3QvtC5INGD0YHRgtCw0L3QvtCy0LrQtSDRgtCw0LHQu9C40YbQsFxuXHQgKiDQvtGB0YLQsNGR0YLRgdGPINC60L7QvNC/0LDQutGC0L3QvtC5LlxuXHQgKlxuXHQgKiBAcGFyYW0ge09iamVjdH0gZGF0YSDQntGC0LLQtdGCIEFQSSAocmVzcG9uc2UuZGF0YSkuXG5cdCAqL1xuXHRyZW5kZXJTZXJ2aWNlc1N0YXR1cyhkYXRhKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcblx0XHRpZiAoISRwYW5lbCB8fCAkcGFuZWwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xuXHRcdGNvbnN0ICRwbGFjZWhvbGRlciA9ICQoJyNjdGktc2VydmljZXMtc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3Qgc2hvd1BsYWNlaG9sZGVyID0gKHRleHQpID0+IHtcblx0XHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcblx0XHRcdCRyb3dzLmVtcHR5KCk7XG5cdFx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmh0bWwoYDxzcGFuPiZuYnNwOyR7ZXNjKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke2VzYyh0ZXh0KX08L2Rpdj5gKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xuXG5cdFx0Ly8gUGhhc2UgQzogcGVyLXNlcnZpY2UgZmFpbGJhY2sgZWxpZ2liaWxpdHkgKyB3YXJtLXN0YW5kYnkgbWlycm9yIGFnZS5cblx0XHRzZWxmLnJlbW90ZUZhaWxiYWNrID0gKGRhdGEgJiYgZGF0YS5yZW1vdGVfZmFpbGJhY2sgJiYgdHlwZW9mIGRhdGEucmVtb3RlX2ZhaWxiYWNrID09PSAnb2JqZWN0Jylcblx0XHRcdD8gZGF0YS5yZW1vdGVfZmFpbGJhY2sgOiB7fTtcblxuXHRcdC8vINCR0Y3QuiDQvNC+0LbQtdGCINCy0LXRgNC90YPRgtGMINGB0YLRgNC+0LrRgyAnTW9kdWxlIGRpc2FibGVkJyDQstC80LXRgdGC0L4g0LzQsNGB0YHQuNCy0LAuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHN0YXR1c2VzKSkge1xuXHRcdFx0Y29uc3QgdGV4dCA9ICh0eXBlb2Ygc3RhdHVzZXMgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQ/IHN0YXR1c2VzXG5cdFx0XHRcdDogc2VsZi50cignbW9kX2N0aV9TdGF0dXNVbmF2YWlsYWJsZScsICdTdGF0dXMgdW5hdmFpbGFibGUnKTtcblx0XHRcdHNob3dQbGFjZWhvbGRlcih0ZXh0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDQn9GA0L7Qv9GD0YHQutCw0LXQvCDQv9C10YDQtdGA0LjRgdC+0LLQutGDIERPTSwg0LXRgdC70Lgg0LTQsNC90L3Ri9C1INC90LUg0LjQt9C80LXQvdC40LvQuNGB0Ywg4oCUINGD0LHQuNGA0LDQtdGCXG5cdFx0Ly8g0LzQtdGA0YbQsNC90LjQtSDRgtCw0LHQu9C40YbRiyDQv9GA0Lgg0L7Qv9GA0L7RgdC1INGA0LDQtyDQsiAzINGB0LXQutGD0L3QtNGLLiDQktC60LvRjtGH0LDQtdC8IHJlbW90ZUZhaWxiYWNrINCyXG5cdFx0Ly8g0YXRjdGILCDQuNC90LDRh9C1INC/0L7Rj9Cy0LvQtdC90LjQtSDQutC90L7Qv9C60Lgv0L7QsdC90L7QstC70LXQvdC40LUg0LLQvtC30YDQsNGB0YLQsCDQutC+0L/QuNC4INC90LUg0L/QtdGA0LXRgNC40YHRg9C10YLRgdGPLlxuXHRcdC8vINCa0L7Qs9C00LAg0L/QvtC60LDQt9Cw0L3QsCDRgdGC0YDQvtC60LAgZmFpbGJhY2ssINC10ZEgwqtsb2NhbCBjb3B5OiBOIGFnb8K7INC00L7Qu9C20LXQvSDQuNC00YLQuCDQtNCw0LbQtVxuXHRcdC8vINC/0YDQuCDQt9Cw0YHRgtGL0LLRiNC40YUgc3RhdHVzZXMvcmVtb3RlRmFpbGJhY2sgKNGC0YPQvdC90LXQu9GMINC70LXQttC40YIg4oCUIGxhc3RfbWlycm9yX3RzINC90LVcblx0XHQvLyDRgNCw0YHRgtGR0YIpLCDQv9C+0Y3RgtC+0LzRgyDQv9C+0LTQvNC10YjQuNCy0LDQtdC8INCz0YDRg9Cx0YvQuSAxNS3RgdC10LrRg9C90LTQvdGL0Lkg0LHQsNC60LXRgiDQstGA0LXQvNC10L3QuCDQsiDRhdGN0YguXG5cdFx0bGV0IGFnZUJ1Y2tldCA9IDA7XG5cdFx0Y29uc3QgcmYgPSBzZWxmLnJlbW90ZUZhaWxiYWNrO1xuXHRcdGlmIChyZiAmJiB0eXBlb2YgcmYgPT09ICdvYmplY3QnXG5cdFx0XHQmJiBPYmplY3Qua2V5cyhyZikuc29tZSgoaykgPT4gcmZba10gJiYgcmZba10uY2FuX2ZhaWxiYWNrID09PSB0cnVlKSkge1xuXHRcdFx0YWdlQnVja2V0ID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTUwMDApO1xuXHRcdH1cblx0XHRjb25zdCBoYXNoID0gSlNPTi5zdHJpbmdpZnkoeyBzOiBzdGF0dXNlcywgZjogc2VsZi5yZW1vdGVGYWlsYmFjaywgYTogYWdlQnVja2V0IH0pO1xuXHRcdGlmIChoYXNoID09PSBzZWxmLmxhc3RSZW5kZXJIYXNoICYmICRyb3dzLmNoaWxkcmVuKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g0JPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhICjQutCw0L3QsNC70YspLlxuXHRcdGNvbnN0IGdyb3VwcyA9IHt9O1xuXHRcdGNvbnN0IG9yZGVyID0gW107XG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XG5cdFx0XHRpZiAoIXN2YyB8fCB0eXBlb2Ygc3ZjICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuYW1lID0gKHR5cGVvZiBzdmMubmFtZSA9PT0gJ3N0cmluZycgJiYgc3ZjLm5hbWUubGVuZ3RoID4gMCkgPyBzdmMubmFtZSA6ICd1bmtub3duJztcblx0XHRcdGlmICghZ3JvdXBzW25hbWVdKSB7XG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xuXHRcdFx0XHRvcmRlci5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcblx0XHR9KTtcblxuXHRcdGlmIChvcmRlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHNob3dQbGFjZWhvbGRlcihzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c0VtcHR5JywgJ05vIHNlcnZpY2VzIHJlcG9ydGVkJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vINCa0L7Qu9C+0L3QutCwIMKr0KDQsNGB0L/QvtC70L7QttC10L3QuNC1wrsg4oCUINGC0L7Qu9GM0LrQviDQutC+0LPQtNCwINC10YHRgtGMINGF0L7RgtGMINC+0LTQuNC9INGD0LTQsNC70ZHQvdC90YvQuSDRgdC10YDQstC40YEuXG5cdFx0Y29uc3QgaGFzUmVtb3RlID0gc3RhdHVzZXMuc29tZSgocykgPT4gcyAmJiBzLmxvY2F0aW9uID09PSAncmVtb3RlJyk7XG5cdFx0Y29uc3QgY29sQ291bnQgPSBoYXNSZW1vdGUgPyA1IDogNDtcblxuXHRcdGNvbnN0IGhlYWQgPSAnPHRoZWFkPjx0cj4nXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLXN0YXR1c1wiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU3RhdHVzJywgJ1N0YXR1cycpKX08L3RoPmBcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtbmFtZVwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sU2VydmljZScsICdTZXJ2aWNlJykpfTwvdGg+YFxuXHRcdFx0KyAoaGFzUmVtb3RlID8gYDx0aCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xMb2NhdGlvbicsICdMb2NhdGlvbicpKX08L3RoPmAgOiAnJylcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdXB0aW1lXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xVcHRpbWUnLCAnVXB0aW1lJykpfTwvdGg+YFxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC12ZXJzaW9uXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xWZXJzaW9uJywgJ1ZlcnNpb24nKSl9PC90aD5gXG5cdFx0XHQrICc8L3RyPjwvdGhlYWQ+JztcblxuXHRcdGNvbnN0IGJvZHkgPSBbXTtcblx0XHRvcmRlci5mb3JFYWNoKChuYW1lKSA9PiB7XG5cdFx0XHRjb25zdCByb3dzID0gZ3JvdXBzW25hbWVdO1xuXHRcdFx0Y29uc3QgaXNNdWx0aSA9IHNlbGYubXVsdGlJbnN0YW5jZVNlcnZpY2VzW25hbWVdID09PSB0cnVlIHx8IHJvd3MubGVuZ3RoID4gMTtcblx0XHRcdGlmIChpc011bHRpKSB7XG5cdFx0XHRcdGJvZHkucHVzaChgPHRyIGNsYXNzPVwiY3RpLXN2Yy1ncm91cFwiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHRcdFx0KyBgPGkgY2xhc3M9XCJjb21tZW50cyBpY29uXCI+PC9pPiR7ZXNjKHNlbGYuc2VydmljZUxhYmVsKG5hbWUpKX1gXG5cdFx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWNvdW50XCI+JHtyb3dzLmxlbmd0aH08L3NwYW4+PC90ZD48L3RyPmApO1xuXHRcdFx0XHRyb3dzLmZvckVhY2goKHN2YykgPT4ge1xuXHRcdFx0XHRcdGJvZHkucHVzaChzZWxmLnJlbmRlclNlcnZpY2VSb3coc3ZjLCB0cnVlLCBoYXNSZW1vdGUpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHJvd3NbMF0sIGZhbHNlLCBoYXNSZW1vdGUpKTtcblx0XHRcdH1cblx0XHRcdC8vIFBoYXNlIEM6IG9mZmVyIFwiYnJpbmcgYmFjayB0byBsb2NhbFwiIG9uY2UgcGVyIHNlcnZpY2UgZ3JvdXAgd2hvc2Vcblx0XHRcdC8vIGNoYW5uZWxzIHN0aWxsIGxpdmUgb24gdGhlIFZQUyAoZGVyaXZlIHRoZSBiYXNlIHN2YyBmcm9tIGFcblx0XHRcdC8vIFwiY2hhdHMuPGFyZWE+XCIgZ3JvdXAgbmFtZSkuXG5cdFx0XHRjb25zdCBzdmNLZXkgPSBuYW1lLmluZGV4T2YoJy4nKSA+PSAwID8gbmFtZS5zcGxpdCgnLicpWzBdIDogbmFtZTtcblx0XHRcdGNvbnN0IGZiUm93ID0gc2VsZi5mYWlsYmFja0NvbnRyb2xSb3coc3ZjS2V5LCBjb2xDb3VudCk7XG5cdFx0XHRpZiAoZmJSb3cgIT09ICcnKSB7XG5cdFx0XHRcdGJvZHkucHVzaChmYlJvdyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQkcm93cy5odG1sKCc8dGFibGUgY2xhc3M9XCJ1aSBjZWxsZWQgc3RyaXBlZCBjb21wYWN0IHVuc3RhY2thYmxlIHRhYmxlIGN0aS1zdGF0dXMtdGFibGVcIj4nXG5cdFx0XHQrIGhlYWQgKyAnPHRib2R5PicgKyBib2R5LmpvaW4oJycpICsgJzwvdGJvZHk+PC90YWJsZT4nKTtcblx0XHRzZWxmLmxhc3RSZW5kZXJIYXNoID0gaGFzaDtcblx0XHRpZiAoJHBsYWNlaG9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XG5cdFx0fVxuXHR9LFxuXG5cdC8qKlxuXHQgKiDQoNC10L3QtNC10YAg0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YLQsNCx0LvQuNGG0YsgKNGB0LXRgNCy0LjRgSDQuNC70Lgg0LrQsNC90LDQuykuXG5cdCAqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fSBzdmMg0LfQsNC/0LjRgdGMINC40Lcgc3RhdHVzZXNbXVxuXHQgKiBAcGFyYW0ge2Jvb2xlYW59IGdyb3VwZWQg0YHRgtGA0L7QutCwINC/0L7QtCDQs9GA0YPQv9C/0L7QstGL0Lwg0LfQsNCz0L7Qu9C+0LLQutC+0LwgKNC60LDQvdCw0Lsg0LzQtdGB0YHQtdC90LTQttC10YDQsClcblx0ICogQHBhcmFtIHtib29sZWFufSBoYXNSZW1vdGUg0L/QvtC60LDQt9GL0LLQsNGC0Ywg0LvQuCDQutC+0LvQvtC90LrRgyDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7XG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUwgKNC+0LTQvdCwIDx0cj4sINC/0LvRjtGBIDx0cj4g0YEg0L7RiNC40LHQutC+0Lkg0L/RgNC4INC90LDQu9C40YfQuNC4KVxuXHQgKi9cblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQsIGhhc1JlbW90ZSkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XG5cblx0XHRjb25zdCBzdGF0ZVJhdyA9ICh0eXBlb2Ygc3ZjLnN0YXRlID09PSAnc3RyaW5nJyAmJiBzdmMuc3RhdGUubGVuZ3RoID4gMCkgPyBzdmMuc3RhdGUgOiAndW5rbm93bic7XG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUoc3RhdGVSYXcpO1xuXHRcdGNvbnN0IGxlZENsYXNzID0gc2VsZi5zdGF0ZUxlZENsYXNzW2Nhbm9uXSB8fCAnd2Fybic7XG5cdFx0Y29uc3Qgc3RhdGVUZXh0ID0gc2VsZi5zdGF0ZVRleHQoc3RhdGVSYXcpO1xuXG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBncm91cGVkXG5cdFx0XHQ/IHNlbGYuc2hvcnRBcmVhKHN2Yy5hcmVhKVxuXHRcdFx0OiBzZWxmLnNlcnZpY2VMYWJlbChzdmMubmFtZSk7XG5cdFx0Y29uc3QgbmFtZUljb24gPSBncm91cGVkID8gJzxpIGNsYXNzPVwiaGFzaHRhZyBpY29uXCI+PC9pPicgOiAnJztcblxuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcblx0XHRjb25zdCB2ZXJzaW9uID0gKHR5cGVvZiBzdmMudmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgc3ZjLnZlcnNpb24ubGVuZ3RoID4gMCkgPyBzdmMudmVyc2lvbiA6ICcnO1xuXHRcdGNvbnN0IGxhc3RFcnJvciA9ICh0eXBlb2Ygc3ZjLmxhc3RfZXJyb3IgPT09ICdzdHJpbmcnICYmIHN2Yy5sYXN0X2Vycm9yLmxlbmd0aCA+IDApID8gc3ZjLmxhc3RfZXJyb3IgOiAnJztcblx0XHRjb25zdCBkYXNoID0gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xuXG5cdFx0Y29uc3Qgc3RhdHVzQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbGVkICR7ZXNjKGxlZENsYXNzKX1cIiB0aXRsZT1cIiR7ZXNjKHN0YXRlUmF3KX1cIj48L3NwYW4+YFxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLXN0YXRlXCI+JHtlc2Moc3RhdGVUZXh0KX08L3NwYW4+YDtcblxuXHRcdGNvbnN0IG5hbWVDZWxsID0gYDxzcGFuIGNsYXNzPVwiY3RpLXN2Yy1uYW1lJHtncm91cGVkID8gJyBjdGktc3ZjLWNoYW5uZWwnIDogJyd9XCI+JHtuYW1lSWNvbn0ke2VzYyhkaXNwbGF5TmFtZSl9PC9zcGFuPmA7XG5cblx0XHRjb25zdCBsb2NDZWxsID0gaGFzUmVtb3RlID8gYDx0ZCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtzZWxmLmxvY2F0aW9uQmFkZ2Uoc3ZjLmxvY2F0aW9uKX08L3RkPmAgOiAnJztcblxuXHRcdGNvbnN0IGNlbGxzID0gYDx0ZCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtzdGF0dXNDZWxsfTwvdGQ+YFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1uYW1lXCI+JHtuYW1lQ2VsbH08L3RkPmBcblx0XHRcdCsgbG9jQ2VsbFxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke3VwdGltZSAhPT0gJycgPyBlc2ModXB0aW1lKSA6IGRhc2h9PC90ZD5gXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLXZlcnNpb25cIj4ke3ZlcnNpb24gIT09ICcnID8gZXNjKHZlcnNpb24pIDogZGFzaH08L3RkPmA7XG5cblx0XHRsZXQgaHRtbCA9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLXJvdyR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1zdWJyb3cnIDogJyd9XCJgXG5cdFx0XHQrIGAgZGF0YS1zdmM9XCIke2VzYyhzdmMubmFtZSB8fCAnJyl9XCIgZGF0YS1hcmVhPVwiJHtlc2Moc3ZjLmFyZWEgfHwgJycpfVwiPiR7Y2VsbHN9PC90cj5gO1xuXG5cdFx0Ly8gbGFzdF9lcnJvciBmcm9tIG1vbml0b3JkIGlzIHN0aWNreSAoXCJsYXN0IGVycm9yIGV2ZXIgc2VlblwiKSBhbmQgaXMgTk9UXG5cdFx0Ly8gY2xlYXJlZCBvbiByZWNvdmVyeSDigJQgaXQgc3RheXMgaW4gdGhlIEFQSSBwYXlsb2FkIG9uIHB1cnBvc2UgKGhhbmR5IGZvclxuXHRcdC8vIGRlYnVnZ2luZykuIFN1cmZhY2UgaXQgdG8gdGhlIG9wZXJhdG9yIE9OTFkgd2hlbiB0aGUgc2VydmljZSBpcyBhY3R1YWxseVxuXHRcdC8vIGluIGEgcmVkIGVycm9yIHN0YXRlLiBBIHJlY292ZXJlZCBnbGl0Y2ggKHN0YXRlPW9rKSBvciBhIHNlcnZpY2Ugc3RpbGxcblx0XHQvLyBzdGFydGluZy93YXJtaW5nIHVwIChzdGF0ZT1zdGFydGluZyAtPiB3YXJuIExFRCwgaW5jbC4gdGhlIHN0YXJ0dXAgZ3JhY2Vcblx0XHQvLyB3aW5kb3cpIG11c3QgTk9UIHByaW50IHN0YWxlIGVycm9yIHRleHQg4oCUIG90aGVyd2lzZSB3ZSdkIGJlIHJlcG9ydGluZyBhXG5cdFx0Ly8gc2VydmljZSBmYWlsdXJlIGluIHRoZSBmaXJzdCBtaW51dGUsIHdoaWNoIGlzIGV4YWN0bHkgd2hhdCB3ZSBzdXBwcmVzcy5cblx0XHRpZiAobGFzdEVycm9yICE9PSAnJyAmJiBsZWRDbGFzcyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0aHRtbCArPSBgPHRyIGNsYXNzPVwiY3RpLXN2Yy1lcnJvci1yb3dcIj48dGQgY29sc3Bhbj1cIiR7Y29sQ291bnR9XCI+YFxuXHRcdFx0XHQrIGA8aSBjbGFzcz1cImV4Y2xhbWF0aW9uIHRyaWFuZ2xlIGljb25cIj48L2k+YFxuXHRcdFx0XHQrIGA8c3BhbiB0aXRsZT1cIiR7ZXNjKGxhc3RFcnJvcil9XCI+JHtlc2Moc2VsZi50cnVuY2F0ZShsYXN0RXJyb3IsIDIwMCkpfTwvc3Bhbj5gXG5cdFx0XHRcdCsgJzwvdGQ+PC90cj4nO1xuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiBQaGFzZSBDOiDRgdGC0YDQvtC60LAg0YEg0LrQvdC+0L/QutC+0LkgwqvQstC10YDQvdGD0YLRjCDQvdCwINC70L7QutCw0LvRjMK7ICsg0LLQvtC30YDQsNGB0YLQvtC8INC70L7QutCw0LvRjNC90L7QuSDQutC+0L/QuNC4LFxuXHQgKiDQv9C+0LrQsNC30YvQstCw0LXRgtGB0Y8g0LTQu9GPINGB0LXRgNCy0LjRgdCwLCDRh9GM0Lgg0LrQsNC90LDQu9GLINC10YnRkSDQvdCwIFZQUyAoY2FuX2ZhaWxiYWNrKS5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN2YyDQsdCw0LfQvtCy0L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAgKGNoYXRzfHRnfG1heClcblx0ICogQHBhcmFtIHtudW1iZXJ9IGNvbENvdW50INGH0LjRgdC70L4g0LrQvtC70L7QvdC+0Log0YLQsNCx0LvQuNGG0Ytcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTCAoPHRyPikg0LvQuNCx0L4gJycg0LXRgdC70LggZmFpbGJhY2sg0L3QtSDQv9GA0LjQvNC10L3QuNC8XG5cdCAqL1xuXHRmYWlsYmFja0NvbnRyb2xSb3coc3ZjLCBjb2xDb3VudCkge1xuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xuXHRcdGNvbnN0IGluZm8gPSBzZWxmLnJlbW90ZUZhaWxiYWNrID8gc2VsZi5yZW1vdGVGYWlsYmFja1tzdmNdIDogbnVsbDtcblx0XHRpZiAoIWluZm8gfHwgaW5mby5jYW5fZmFpbGJhY2sgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSBzZWxmLnRyKCdtb2RfY3RpX0ZhaWxiYWNrVG9Mb2NhbCcsICdCcmluZyBiYWNrIHRvIGxvY2FsJyk7XG5cdFx0Y29uc3QgYWdlID0gc2VsZi5taXJyb3JBZ2VUZXh0KGluZm8ubGFzdF9taXJyb3JfdHMpO1xuXHRcdHJldHVybiBgPHRyIGNsYXNzPVwiY3RpLWZhaWxiYWNrLXJvd1wiPjx0ZCBjb2xzcGFuPVwiJHtjb2xDb3VudH1cIj5gXG5cdFx0XHQrIGA8YnV0dG9uIGNsYXNzPVwidWkgdGlueSBiYXNpYyBvcmFuZ2UgYnV0dG9uIGN0aS1mYWlsYmFjay1idG5cIiBkYXRhLXN2Yz1cIiR7ZXNjKHN2Yyl9XCI+YFxuXHRcdFx0KyBgPGkgY2xhc3M9XCJyZXBseSBpY29uXCI+PC9pPiR7ZXNjKGxhYmVsKX08L2J1dHRvbj5gXG5cdFx0XHQrIGA8c3BhbiBjbGFzcz1cImN0aS1mYWlsYmFjay1hZ2VcIj4ke2VzYyhhZ2UpfTwvc3Bhbj5gXG5cdFx0XHQrICc8L3RkPjwvdHI+Jztcblx0fSxcblxuXHQvKipcblx0ICogUGhhc2UgQzog0YfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNGL0Lkg0LLQvtC30YDQsNGB0YIg0LvQvtC60LDQu9GM0L3QvtC5INC60L7Qv9C40Lgg0YHQtdGB0YHQuNC4ICh3YXJtLXN0YW5kYnlcblx0ICogbWlycm9yKS4gdHMg4oCUIHVuaXgt0YHQtdC60YPQvdC00Ys7IDAv0L/Rg9GB0YLQviA9PiDCq9C60L7Qv9C40Lgg0LXRidGRINC90LXRgsK7LlxuXHQgKlxuXHQgKiBAcGFyYW0ge251bWJlcn0gdHNcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdG1pcnJvckFnZVRleHQodHMpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IG4gPSBwYXJzZUludCh0cywgMTApO1xuXHRcdGlmICghbiB8fCBuIDw9IDApIHtcblx0XHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvck5ldmVyJywgJ2xvY2FsIGNvcHk6IG5vbmUgeWV0Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlY3MgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSAtIG4pO1xuXHRcdGxldCBodW1hbjtcblx0XHRpZiAoc2VjcyA8IDkwKSB7XG5cdFx0XHRodW1hbiA9IGAke3NlY3N9c2A7XG5cdFx0fSBlbHNlIGlmIChzZWNzIDwgNTQwMCkge1xuXHRcdFx0aHVtYW4gPSBgJHtNYXRoLnJvdW5kKHNlY3MgLyA2MCl9bWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGh1bWFuID0gYCR7TWF0aC5yb3VuZChzZWNzIC8gMzYwMCl9aGA7XG5cdFx0fVxuXHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvckFnZScsICdsb2NhbCBjb3B5OiAlYWdlJSBhZ28nKS5yZXBsYWNlKCclYWdlJScsIGh1bWFuKTtcblx0fSxcblxuXHQvKipcblx0ICog0JHQtdC50LTQtiDRgNCw0YHQv9C+0LvQvtC20LXQvdC40Y8g0YHQtdGA0LLQuNGB0LA6INGP0YDQutC40LkgwqtWUFPCuyDQtNC70Y8g0LLRi9C90LXRgdC10L3QvdGL0YUg0LrQsNC90LDQu9C+0LIg0Lhcblx0ICog0L/RgNC40LPQu9GD0YjRkdC90L3Ri9C5IMKr0JvQvtC60LDQu9GM0L3QvsK7INC00LvRjyDQstGB0LXQs9C+INC+0YHRgtCw0LvRjNC90L7Qs9C+LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gbG9jYXRpb24gJ3JlbW90ZScgfCAnbG9jYWwnIHwgdW5kZWZpbmVkXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUxcblx0ICovXG5cdGxvY2F0aW9uQmFkZ2UobG9jYXRpb24pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRpZiAobG9jYXRpb24gPT09ICdyZW1vdGUnKSB7XG5cdFx0XHRyZXR1cm4gYDxzcGFuIGNsYXNzPVwidWkgdGVhbCBsYWJlbCBjdGktbG9jLWJhZGdlXCI+PGkgY2xhc3M9XCJjbG91ZCBpY29uXCI+PC9pPmBcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvblJlbW90ZScsICdWUFMnKSl9PC9zcGFuPmA7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ2xvY2FsJykge1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cImN0aS1sb2MtbG9jYWxcIj48aSBjbGFzcz1cImhvbWUgaWNvblwiPjwvaT5gXG5cdFx0XHRcdCsgYCR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfTG9jYXRpb25Mb2NhbCcsICdMb2NhbCcpKX08L3NwYW4+YDtcblx0XHR9XG5cdFx0cmV0dXJuICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+Jztcblx0fSxcblxuXHQvKipcblx0ICog0JrQsNC90L7QvdC40LfQsNGG0LjRjyDRgdCy0L7QsdC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGB0L7RgdGC0L7Rj9C90LjRjyDQsiDQuNC30LLQtdGB0YLQvdGL0Lkg0LrQu9GO0Ycg0LTQu9GPINC70LDQvNC/0L7Rh9C60Lgg0Lhcblx0ICog0L/QtdGA0LXQstC+0LTQsC4gbW9uaXRvcmQg0LzQvtC20LXRgiDQv9GA0LjRgdGL0LvQsNGC0Ywgwqthd2FpdGluZyBhdXRob3JpemF0aW9uIGNvZGXCuyDQuCDQv9GALlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RhdGVcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdGNhbm9uU3RhdGUoc3RhdGUpIHtcblx0XHRjb25zdCBzID0gU3RyaW5nKHN0YXRlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmIChzID09PSAnJykge1xuXHRcdFx0cmV0dXJuICd1bmtub3duJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZigncXInKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAncXJjb2RlJztcblx0XHR9XG5cdFx0aWYgKHMuaW5kZXhPZignYXdhaXRpbmcnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCdyZWF1dGgnKSAhPT0gLTFcblx0XHRcdHx8IHMuaW5kZXhPZignYXV0aF9yZXF1aXJlZCcpICE9PSAtMSB8fCBzLmluZGV4T2YoJzJmYScpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdyZWF1dGgnO1xuXHRcdH1cblx0XHRpZiAocyA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dGhlbnRpY2F0ZWQnO1xuXHRcdH1cblx0XHRyZXR1cm4gcztcblx0fSxcblxuXHQvKipcblx0ICog0KXQtdC70L/QtdGAINC/0LXRgNC10LLQvtC00LAg0YEg0YTQvtC70LHRjdC60L7QvC5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IGtleSDQutC70Y7RhyBnbG9iYWxUcmFuc2xhdGVcblx0ICogQHBhcmFtIHtzdHJpbmd9IGZhbGxiYWNrINC30L3QsNGH0LXQvdC40LUg0L/QviDRg9C80L7Qu9GH0LDQvdC40Y5cblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRyKGtleSwgZmFsbGJhY2spIHtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xuXHRcdGNvbnN0IG1hcCA9IHtcblx0XHRcdG1vbml0b3JkOiAnbW9kX2N0aV9zdmNfbW9uaXRvcmQnLFxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxuXHRcdFx0J2NybS0xYyc6ICdtb2RfY3RpX3N2Y19jcm0nLFxuXHRcdFx0YXV0aDogJ21vZF9jdGlfc3ZjX2F1dGgnLFxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXG5cdFx0XHQnYW1pLWxpc3RlbmVyJzogJ21vZF9jdGlfc3ZjX2FtaScsXG5cdFx0XHRjaGF0czogJ21vZF9jdGlfc3ZjX2NoYXRzJyxcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxuXHRcdFx0bWF4OiAnbW9kX2N0aV9zdmNfbWF4Jyxcblx0XHRcdCdtYW5hZ2VyLmFwaSc6ICdtb2RfY3RpX3N2Y19tYW5hZ2VyX2FwaScsXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcblx0XHR9O1xuXHRcdGNvbnN0IGtleSA9IG1hcFtuYW1lXTtcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XG5cdFx0XHRyZXR1cm4gZ2xvYmFsVHJhbnNsYXRlW2tleV07XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcblx0fSxcblxuXHQvKipcblx0ICog0KfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgc3RhdGUg0LrQsNC90LDQu9CwL9GB0LXRgNCy0LjRgdCwICjQvdCw0L/RgNC40LzQtdGAIMKr0J/QvtC00LrQu9GO0YfRkdC9wrssXG5cdCAqIMKr0KLRgNC10LHRg9C10YIg0LDQstGC0L7RgNC40LfQsNGG0LjQuMK7KS4g0KHQvdCw0YfQsNC70LAg0LjRidC10Lwg0YLQvtGH0L3Ri9C5INC60LvRjtGHLCDQt9Cw0YLQtdC8INC/0L4g0LrQsNC90L7QvdC40YfQtdGB0LrQvtC80YNcblx0ICog0YHQvtGB0YLQvtGP0L3QuNGOLCDQt9Cw0YLQtdC8IOKAlCDQsNC90LPQu9C40LnRgdC60LjQuSDRhNC+0LvQsdGN0LosINC4INCyINC60YDQsNC50L3QtdC8INGB0LvRg9GH0LDQtSDQuNGB0YXQvtC00L3Rg9GOINGB0YLRgNC+0LrRgy5cblx0ICpcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXRlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzdGF0ZVRleHQoc3RhdGUpIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0IHJhdyA9IFN0cmluZyhzdGF0ZSB8fCAnJyk7XG5cdFx0Ly8g0KLQvtGH0L3Ri9C5INC60LvRjtGHINC/0L7QtCDQuNGB0YXQvtC00L3QvtC1INGB0L7RgdGC0L7Rj9C90LjQtSAo0L3QsCDRgdC70YPRh9Cw0Lkg0YHQv9C10YbQuNGE0LjRh9C90YvRhSDQv9C10YDQtdCy0L7QtNC+0LIpLlxuXHRcdGNvbnN0IGV4YWN0S2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtyYXd9YDtcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2V4YWN0S2V5XSkge1xuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtleGFjdEtleV07XG5cdFx0fVxuXHRcdGNvbnN0IGNhbm9uID0gc2VsZi5jYW5vblN0YXRlKHJhdyk7XG5cdFx0Y29uc3QgY2Fub25LZXkgPSBgbW9kX2N0aV9zdGF0ZV8ke2Nhbm9ufWA7XG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV0pIHtcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbY2Fub25LZXldO1xuXHRcdH1cblx0XHRjb25zdCBmYWxsYmFjayA9IHtcblx0XHRcdG9rOiAnT0snLFxuXHRcdFx0YXV0aGVudGljYXRlZDogJ0F1dGhlbnRpY2F0ZWQnLFxuXHRcdFx0Y29ubmVjdGVkOiAnQ29ubmVjdGVkIHRvIDFDJyxcblx0XHRcdHdhaXRpbmdfMWM6ICdXYWl0aW5nIGZvciAxQyB0byBjb25uZWN0Jyxcblx0XHRcdGNvbm5lY3RpbmdfMWM6ICdDb25uZWN0aW5nIHRvIDFD4oCmJyxcblx0XHRcdGVycm9yOiAnRXJyb3InLFxuXHRcdFx0dW5rbm93bjogJ1Vua25vd24nLFxuXHRcdFx0cGVuZGluZzogJ1BlbmRpbmcnLFxuXHRcdFx0c3RhcnRpbmc6ICdTdGFydGluZycsXG5cdFx0XHRxcmNvZGU6ICdBd2FpdGluZyBRUi1jb2RlIGF1dGhvcml6YXRpb24nLFxuXHRcdFx0cmVhdXRoOiAnQXV0aG9yaXphdGlvbiByZXF1aXJlZCcsXG5cdFx0fTtcblx0XHRyZXR1cm4gZmFsbGJhY2tbY2Fub25dIHx8IHJhdztcblx0fSxcblxuXHQvKipcblx0ICog0JrQvtGA0L7RgtC60L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBhcmVhLUdVSUQg4oCUINC/0LXRgNCy0YvQtSA4INGB0LjQvNCy0L7Qu9C+0LIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBhcmVhXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRzaG9ydEFyZWEoYXJlYSkge1xuXHRcdGlmICh0eXBlb2YgYXJlYSAhPT0gJ3N0cmluZycgfHwgYXJlYS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKGFyZWEubGVuZ3RoIDw9IDEyKSB7XG5cdFx0XHRyZXR1cm4gYXJlYTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FyZWEuc3Vic3RyaW5nKDAsIDgpfeKApmA7XG5cdH0sXG5cblx0LyoqXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxuXHQgKlxuXHQgKiBAcGFyYW0ge3N0cmluZ30gc3RyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcblx0ICogQHJldHVybnMge3N0cmluZ31cblx0ICovXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XG5cdFx0aWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmIChzdHIubGVuZ3RoIDw9IG1heCkge1xuXHRcdFx0cmV0dXJuIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4KX3igKZgO1xuXHR9LFxuXG5cdC8qKlxuXHQgKiDQkdC10LfQvtC/0LDRgdC90YvQuSDRjdC60YDQsNC90LXRgCBIVE1MLlxuXHQgKlxuXHQgKiBAcGFyYW0geyp9IHZhbHVlXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XG5cdCAqL1xuXHRlc2NhcGVIdG1sKHZhbHVlKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSlcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblx0fSxcblxuXHQvKipcblx0ICog0J7QsdC90L7QstC70LXQvdC40LUg0L7QsdGJ0LXQs9C+INGB0YLQsNGC0YPRgdCwINC80L7QtNGD0LvRjyDigJQg0YHRgtGA0L7QutCwLdGB0LLQvtC00LrQsCDQstCy0LXRgNGF0YMg0LLQutC70LDQtNC60LggwqvQodGC0LDRgtGD0YHCu1xuXHQgKiAo0LfQsNC80LXQvdC40LvQsCDQv9GA0LXQttC90LjQuSDRg9Cz0LvQvtCy0L7QuSDQsdC10LnQtNC2ICNzdGF0dXMpLiDQoNC40YHRg9C10YIg0YbQstC10YLQvdGD0Y4g0LvQsNC80L/QvtGH0LrRgyArINGC0LXQutGB0YI7XG5cdCAqINC00LvRjyDQutGA0LDRgdC90L7Qs9C+INGB0L7RgdGC0L7Rj9C90LjRjyDQvNC+0LbQtdGCINCd0JDQl9CS0JDQotCsINC60L7QvdC60YDQtdGC0L3Ri9C1INC/0YDQvtCx0LvQtdC80L3Ri9C1INGB0LXRgNCy0LjRgdGLLCDQsCDQtNC70Y9cblx0ICog0L/RgNC+0LPRgNC10YHRgdCwIOKAlCDQv9C+0LrQsNC30LDRgtGMINC40YUg0LrQvtC70LjRh9C10YHRgtCy0L4uXG5cdCAqXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0dXMg0LrQu9GO0Ycg0YHQvtGB0YLQvtGP0L3QuNGPXG5cdCAqIEBwYXJhbSB7e25hbWVzPzogc3RyaW5nW10sIGNvdW50PzogbnVtYmVyfX0gW2luZm9dINC00L7Qvy4g0LTQsNC90L3Ri9C1INC00LvRjyDRgtC10LrRgdGC0LBcblx0ICovXG5cdGNoYW5nZVN0YXR1cyhzdGF0dXMsIGluZm8pIHtcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xuXHRcdGNvbnN0ICRzID0gc2VsZi4kbW9kdWxlU3RhdHVzO1xuXHRcdGlmICghJHMgfHwgJHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBpbmZvIHx8IHt9O1xuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcblx0XHRjb25zdCBzcGlubmVyID0gJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+Jztcblx0XHRjb25zdCB0ciA9IChrZXksIGZhbGxiYWNrKSA9PiBzZWxmLnRyKGtleSwgZmFsbGJhY2spO1xuXG5cdFx0bGV0IGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRsZXQgbGVkID0gJ3Vua25vd24nO1xuXHRcdGxldCBpY29uID0gJyc7XG5cdFx0bGV0IHRleHQgPSAnJztcblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JlZW4nO1xuXHRcdFx0XHRsZWQgPSAnb2snO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGVkJywgJ1RoZSBtb2R1bGUgd29ya3Mgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblByb2dyZXNzJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0bGV0IHByb2dyZXNzID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzJywgJ01vZHVsZSBzZXJ2aWNlcyBhcmUgc3RhcnRpbmcnKTtcblx0XHRcdFx0aWYgKGRhdGEuY291bnQgJiYgZGF0YS5jb3VudCA+IDApIHtcblx0XHRcdFx0XHRwcm9ncmVzcyArPSBgICgke2RhdGEuY291bnR9KWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGV4dCA9IHByb2dyZXNzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDV2FpdGluZyc6XG5cdFx0XHRcdC8vIGxvbmdwb29sOiAxQyBjb25uZWN0cyB0byB1czsgd2UgYXJlIHdhaXRpbmcgZm9yIGl0LlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93Jztcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX3N0YXRlX3dhaXRpbmdfMWMnLCAnV2FpdGluZyBmb3IgMUMgdG8gY29ubmVjdCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25UbzFDQ29ubmVjdGluZyc6XG5cdFx0XHRcdC8vIHdlYnNlcnZpY2U6IHdlIGFyZSByZWFjaGluZyBvdXQgdG8gMUMuXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS15ZWxsb3cnO1xuXHRcdFx0XHRsZWQgPSAnd2Fybic7XG5cdFx0XHRcdGljb24gPSBzcGlubmVyO1xuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfc3RhdGVfY29ubmVjdGluZ18xYycsICdDb25uZWN0aW5nIHRvIDFD4oCmJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzoge1xuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBBcnJheS5pc0FycmF5KGRhdGEubmFtZXMpID8gZGF0YS5uYW1lcy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcblx0XHRcdFx0aWYgKG5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0ZXh0ID0gYCR7dHIoJ21vZF9jdGlfU3RhdHVzUHJvYmxlbScsICdQcm9ibGVtJyl9OiAke25hbWVzLmpvaW4oJywgJyl9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvbkVycm9yJywgJ0ZhaWx1cmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0Rpc2FibGVkJzpcblx0XHRcdFx0Y2xzID0gJ2N0aS1zdW1tYXJ5LWdyZXknO1xuXHRcdFx0XHRsZWQgPSAndW5rbm93bic7XG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCcsICdNb2R1bGUgaXMgZGlzYWJsZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdEaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XG5cdFx0XHRcdGxlZCA9ICd1bmtub3duJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Rpc2Nvbm5lY3RlZCcsICdEaXNjb25uZWN0ZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdVcGRhdGluZyc6XG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS1ncmV5Jztcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xuXHRcdFx0XHRpY29uID0gc3Bpbm5lcjtcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX1VwZGF0ZVN0YXR1cycsICdVcGRhdGluZyBzdGF0dXPigKYnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktcmVkJztcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX0Nvbm5lY3Rpb25FcnJvcicsICdGYWlsdXJlJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdCRzXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2N0aS1zdW1tYXJ5LWdyZXkgY3RpLXN1bW1hcnktZ3JlZW4gY3RpLXN1bW1hcnkteWVsbG93IGN0aS1zdW1tYXJ5LXJlZCcpXG5cdFx0XHQuYWRkQ2xhc3MoY2xzKVxuXHRcdFx0Lmh0bWwoYDxzcGFuIGNsYXNzPVwiY3RpLXN1bW1hcnktbGVkICR7ZXNjKGxlZCl9XCI+PC9zcGFuPmBcblx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3VtbWFyeS10ZXh0XCI+JHtpY29ufSR7ZXNjKHRleHQpfTwvc3Bhbj5gKTtcblx0fSxcbn07XG4iXX0=