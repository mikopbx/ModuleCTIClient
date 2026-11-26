function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
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
          }
          // Known setup state, not a boot in progress: nothing was started and the
          // certificate panel already says why. Stop the spinner with a plain state;
          // the next poll after a normal Save falls through to the checks below.
          if (moduleCTIClientConnectionCheckWorker.tlsNotStarted(statuses)) {
            moduleCTIClientConnectionCheckWorker.changeStatus('TlsNotStarted');
            return;
          }
          // Module startup grace: the backend has already downgraded any
          // hard error to "starting" while the stack boots, so show one
          // calm progress badge and never escalate to a failure here —
          // this is what keeps the first ~2 minutes free of false reds.
          if (data.startup_grace === true) {
            moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
            return;
          }
          // Classify the response by the worst non-system state.
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
          var startList = Object.keys(startNames);
          // Severity order: a genuine red failure (incl. a crm-1c bridge
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
   * True when the CTI stack is known not to be started because certificate setup is incomplete:
   * the certificate panel reports a problem (data-state=error) and monitord is not running.
   * Without that panel verdict an empty stack is still treated as starting up.
   *
   * @param {Array} statuses services reported by the check API.
   * @returns {boolean}
   */
  tlsNotStarted: function tlsNotStarted(statuses) {
    var panel = document.getElementById('cti-tls-panel');
    if (!panel || panel.getAttribute('data-state') !== 'error' || !Array.isArray(statuses)) {
      return false;
    }
    return !statuses.some(function (s) {
      return s && s.name === 'monitord' && s.state === 'ok';
    });
  },
  /**
   * Draw the services panel, the remote lock and the debug pane from a check answer.
   */
  renderCheckResponse: function renderCheckResponse(response) {
    $('.message.ajax').remove();
    if (typeof response.data === 'undefined') {
      moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(null);
      return;
    }

    // Render services status panel for both success and partial responses.
    moduleCTIClientConnectionCheckWorker.renderServicesStatus(response.data);
    moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(response.data);

    // Debug JSON pane (legacy debug tab). Daemon strings go in as text, never as markup.
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
    var label = typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusModuleDisabled ? globalTranslate.mod_cti_StatusModuleDisabled : 'Module is disabled';
    // Don't replace the panel's innerHTML: that destroys #cti-services-status-rows
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
    var statuses = data && data.statuses ? data.statuses : null;

    // Phase C: per-service failback eligibility + warm-standby mirror age.
    self.remoteFailback = data && data.remote_failback && _typeof(data.remote_failback) === 'object' ? data.remote_failback : {};

    // Бэк может вернуть строку 'Module disabled' вместо массива.
    if (!Array.isArray(statuses)) {
      var text = typeof statuses === 'string' ? statuses : self.tr('mod_cti_StatusUnavailable', 'Status unavailable');
      showPlaceholder(text);
      return;
    }

    // Стек не запущен из-за незавершённой настройки сертификата: не рисуем строки «starting».
    if (self.tlsNotStarted(statuses)) {
      showPlaceholder(self.tr('mod_cti_StatusTlsNotStarted', 'Not started: the CTI certificate setup is incomplete'));
      return;
    }

    // Пропускаем перерисовку DOM, если данные не изменились — убирает
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
    }

    // Группируем по имени сервиса. Внутри группы — строки по area (каналы).
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
    }

    // Колонка «Расположение» — только когда есть хоть один удалённый сервис.
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
      // Phase C: offer "bring back to local" once per service group whose
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
    var html = "<tr class=\"cti-svc-row".concat(grouped ? ' cti-svc-subrow' : '', "\"") + " data-svc=\"".concat(esc(svc.name || ''), "\" data-area=\"").concat(esc(svc.area || ''), "\">").concat(cells, "</tr>");

    // last_error from monitord is sticky ("last error ever seen") and is NOT
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
    var raw = String(state || '');
    // Точный ключ под исходное состояние (на случай специфичных переводов).
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
      case 'TlsNotStarted':
        // Plain, final state: no spinner, next step is on the Settings tab.
        cls = 'cti-summary-yellow';
        led = 'warn';
        text = tr('mod_cti_StatusTlsNotStarted', 'Not started: the CTI certificate setup is incomplete');
        break;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIiLCIkZm9ybU9iaiIsIiQiLCIkc3RhdHVzVG9nZ2xlIiwiJHdlYlNlcnZpY2VUb2dnbGUiLCIkZGVidWdUb2dnbGUiLCIkbW9kdWxlU3RhdHVzIiwiJHN1Ym1pdEJ1dHRvbiIsIiRkZWJ1Z0luZm8iLCIkc2VydmljZXNTdGF0dXMiLCJ0aW1lT3V0IiwidGltZU91dEhhbmRsZSIsImVycm9yQ291bnRzIiwibGFzdFJlbmRlckhhc2giLCJzdGF0ZUxlZENsYXNzIiwib2siLCJhdXRoZW50aWNhdGVkIiwiY29ubmVjdGVkIiwid2FpdGluZ18xYyIsImNvbm5lY3RpbmdfMWMiLCJlcnJvciIsImZhaWwiLCJmYWlsZWQiLCJkb3duIiwic3RvcHBlZCIsInVua25vd24iLCJwZW5kaW5nIiwic3RhcnRpbmciLCJxcmNvZGUiLCJyZWF1dGgiLCJhdXRoIiwiYXV0aF9yZXF1aXJlZCIsIndhcm4iLCJ3YXJuaW5nIiwibXVsdGlJbnN0YW5jZVNlcnZpY2VzIiwiY2hhdHMiLCJ0ZyIsIm1heCIsImluaXRpYWxpemUiLCJyZXN0YXJ0V29ya2VyIiwiY2hhbmdlU3RhdHVzIiwid2luZG93IiwiY2xlYXJUaW1lb3V0Iiwid29ya2VyIiwiY2hlY2tib3giLCJyZW5kZXJlZCIsImFwaSIsInVybCIsImNvbmNhdCIsIkNvbmZpZyIsInBieFVybCIsIm9uIiwic3VjY2Vzc1Rlc3QiLCJQYnhBcGkiLCJvbkNvbXBsZXRlIiwic2V0VGltZW91dCIsIm9uUmVzcG9uc2UiLCJyZXNwb25zZSIsInJlbmRlckNoZWNrUmVzcG9uc2UiLCJvblN1Y2Nlc3MiLCJvbkZhaWx1cmUiLCJfdHlwZW9mIiwiZGF0YSIsInN0YXR1c2VzIiwiQXJyYXkiLCJpc0FycmF5IiwidGxzTm90U3RhcnRlZCIsInN0YXJ0dXBfZ3JhY2UiLCJzZWxmIiwiY3JtMWMiLCJoYXNFcnJvciIsImhhc1N0YXJ0aW5nIiwiZXJyTmFtZXMiLCJzdGFydE5hbWVzIiwiZm9yRWFjaCIsInMiLCJuYW1lIiwic3RhdGUiLCJzZXJ2aWNlTGFiZWwiLCJlcnJvckxpc3QiLCJPYmplY3QiLCJrZXlzIiwic3RhcnRMaXN0IiwibmFtZXMiLCJjb3VudCIsImxlbmd0aCIsIm5vdGlmeVJlbW90ZU1pZ3JhdGlvbkxvY2siLCJyZW5kZXJEaXNhYmxlZFBhbmVsIiwicGFuZWwiLCJkb2N1bWVudCIsImdldEVsZW1lbnRCeUlkIiwiZ2V0QXR0cmlidXRlIiwic29tZSIsInJlbW92ZSIsInJlbmRlclNlcnZpY2VzU3RhdHVzIiwidmlzdWFsRXJyb3JTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiJHBhbmUiLCJyZXN1bHQiLCJhcHBlbmQiLCJ0ZXh0IiwiYWZ0ZXIiLCJhY3RpdmUiLCJyZW1vdGVfbWlncmF0aW9uX2FjdGl2ZSIsInNlcnZpY2VzIiwicmVtb3RlX21pZ3JhdGlvbl9zZXJ2aWNlcyIsImRpc3BhdGNoRXZlbnQiLCJDdXN0b21FdmVudCIsImRldGFpbCIsIiRwYW5lbCIsImxhYmVsIiwiZ2xvYmFsVHJhbnNsYXRlIiwibW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCIsIiRyb3dzIiwiJHBsYWNlaG9sZGVyIiwiZW1wdHkiLCJodG1sIiwiZXNjYXBlSHRtbCIsInNob3ciLCJlc2MiLCJzaG93UGxhY2Vob2xkZXIiLCJyZW1vdGVGYWlsYmFjayIsInJlbW90ZV9mYWlsYmFjayIsInRyIiwiYWdlQnVja2V0IiwicmYiLCJrIiwiY2FuX2ZhaWxiYWNrIiwiTWF0aCIsImZsb29yIiwiRGF0ZSIsIm5vdyIsImhhc2giLCJmIiwiYSIsImNoaWxkcmVuIiwiaGlkZSIsImdyb3VwcyIsIm9yZGVyIiwic3ZjIiwicHVzaCIsImhhc1JlbW90ZSIsImxvY2F0aW9uIiwiY29sQ291bnQiLCJoZWFkIiwiYm9keSIsInJvd3MiLCJpc011bHRpIiwicmVuZGVyU2VydmljZVJvdyIsInN2Y0tleSIsImluZGV4T2YiLCJzcGxpdCIsImZiUm93IiwiZmFpbGJhY2tDb250cm9sUm93Iiwiam9pbiIsImdyb3VwZWQiLCJzdGF0ZVJhdyIsImNhbm9uIiwiY2Fub25TdGF0ZSIsImxlZENsYXNzIiwic3RhdGVUZXh0IiwiZGlzcGxheU5hbWUiLCJzaG9ydEFyZWEiLCJhcmVhIiwibmFtZUljb24iLCJ1cHRpbWUiLCJ2ZXJzaW9uIiwibGFzdEVycm9yIiwibGFzdF9lcnJvciIsImRhc2giLCJzdGF0dXNDZWxsIiwibmFtZUNlbGwiLCJsb2NDZWxsIiwibG9jYXRpb25CYWRnZSIsImNlbGxzIiwidHJ1bmNhdGUiLCJpbmZvIiwiYWdlIiwibWlycm9yQWdlVGV4dCIsImxhc3RfbWlycm9yX3RzIiwidHMiLCJuIiwicGFyc2VJbnQiLCJzZWNzIiwiaHVtYW4iLCJyb3VuZCIsInJlcGxhY2UiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImtleSIsImZhbGxiYWNrIiwibWFwIiwibW9uaXRvcmQiLCJuYXRzIiwicHJveHkiLCJyYXciLCJleGFjdEtleSIsImNhbm9uS2V5Iiwic3Vic3RyaW5nIiwic3RyIiwidmFsdWUiLCJzdGF0dXMiLCIkcyIsInNwaW5uZXIiLCJjbHMiLCJsZWQiLCJpY29uIiwicHJvZ3Jlc3MiLCJmaWx0ZXIiLCJCb29sZWFuIiwicmVtb3ZlQ2xhc3MiLCJhZGRDbGFzcyJdLCJzb3VyY2VzIjpbIm1vZHVsZS1jdGktY2xpZW50LXN0YXR1cy13b3JrZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLypcclxuICogTWlrb1BCWCAtIGZyZWUgcGhvbmUgc3lzdGVtIGZvciBzbWFsbCBidXNpbmVzc1xyXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTctMjAyMSBBbGV4ZXkgUG9ydG5vdiBhbmQgTmlrb2xheSBCZWtldG92XHJcbiAqXHJcbiAqIFRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XHJcbiAqIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XHJcbiAqIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb247IGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXHJcbiAqIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXHJcbiAqXHJcbiAqIFRoaXMgcHJvZ3JhbSBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxyXG4gKiBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxyXG4gKiBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXHJcbiAqIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXHJcbiAqXHJcbiAqIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFsb25nIHdpdGggdGhpcyBwcm9ncmFtLlxyXG4gKiBJZiBub3QsIHNlZSA8aHR0cHM6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxyXG4gKi9cclxuXHJcbi8qIGdsb2JhbCBnbG9iYWxUcmFuc2xhdGUsIEZvcm0sIENvbmZpZywgUGJ4QXBpICovXHJcblxyXG4vKipcclxuICog0KLQtdGB0YLQuNGA0L7QstCw0L3QuNC1INGB0L7QtdC00LjQvdC10L3QuNGPINC80L7QtNGD0LvRjyDRgSAx0KEgKyDRgNC10L3QtNC10YAg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIg0YHQtdGA0LLQuNGB0L7Qsi5cclxuICovXHJcbmNvbnN0IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlciA9IHtcclxuXHQkZm9ybU9iajogJCgnI21vZHVsZS1jdGktY2xpZW50LWZvcm0nKSxcclxuXHQkc3RhdHVzVG9nZ2xlOiAkKCcjbW9kdWxlLXN0YXR1cy10b2dnbGUnKSxcclxuXHQkd2ViU2VydmljZVRvZ2dsZTogJCgnI3dlYi1zZXJ2aWNlLW1vZGUtdG9nZ2xlJyksXHJcblx0JGRlYnVnVG9nZ2xlOiAkKCcjZGVidWctbW9kZS10b2dnbGUnKSxcclxuXHQkbW9kdWxlU3RhdHVzOiAkKCcjY3RpLXN0YXR1cy1zdW1tYXJ5JyksXHJcblx0JHN1Ym1pdEJ1dHRvbjogJCgnI3N1Ym1pdGJ1dHRvbicpLFxyXG5cdCRkZWJ1Z0luZm86ICQoJyNtb2R1bGUtY3RpLWNsaWVudC1mb3JtIHNwYW4jZGVidWctaW5mbycpLFxyXG5cdCRzZXJ2aWNlc1N0YXR1czogJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMnKSxcclxuXHR0aW1lT3V0OiAzMDAwLFxyXG5cdHRpbWVPdXRIYW5kbGU6ICcnLFxyXG5cdGVycm9yQ291bnRzOiAwLFxyXG5cdGxhc3RSZW5kZXJIYXNoOiAnJyxcclxuXHJcblx0LyoqXHJcblx0ICog0JzQsNC/0L/QuNC90LMgc3RhdGUgLT4gQ1NTLdC60LvQsNGB0YEg0LvQsNC80L/QvtGH0LrQuC5cclxuXHQgKiDQm9GO0LHQvtC1INC90LXQuNC30LLQtdGB0YLQvdC+0LUg0YHQvtGB0YLQvtGP0L3QuNC1IC0+INC20ZHQu9GC0L7QtSAod2FybikuXHJcblx0ICovXHJcblx0c3RhdGVMZWRDbGFzczoge1xyXG5cdFx0b2s6ICdvaycsXHJcblx0XHRhdXRoZW50aWNhdGVkOiAnb2snLFxyXG5cdFx0Y29ubmVjdGVkOiAnb2snLFxyXG5cdFx0d2FpdGluZ18xYzogJ3dhcm4nLFxyXG5cdFx0Y29ubmVjdGluZ18xYzogJ3dhcm4nLFxyXG5cdFx0ZXJyb3I6ICdlcnJvcicsXHJcblx0XHRmYWlsOiAnZXJyb3InLFxyXG5cdFx0ZmFpbGVkOiAnZXJyb3InLFxyXG5cdFx0ZG93bjogJ2Vycm9yJyxcclxuXHRcdHN0b3BwZWQ6ICdlcnJvcicsXHJcblx0XHR1bmtub3duOiAndW5rbm93bicsXHJcblx0XHRwZW5kaW5nOiAnd2FybicsXHJcblx0XHRzdGFydGluZzogJ3dhcm4nLFxyXG5cdFx0cXJjb2RlOiAnd2FybicsXHJcblx0XHRyZWF1dGg6ICd3YXJuJyxcclxuXHRcdGF1dGg6ICd3YXJuJyxcclxuXHRcdGF1dGhfcmVxdWlyZWQ6ICd3YXJuJyxcclxuXHRcdHdhcm46ICd3YXJuJyxcclxuXHRcdHdhcm5pbmc6ICd3YXJuJyxcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiDQodC10YDQstC40YHRiywg0LrQvtGC0L7RgNGL0LUg0LzQvtCz0YPRgiDQuNC00YLQuCDQsiDQvdC10YHQutC+0LvRjNC60LjRhSDQuNC90YHRgtCw0L3RgdCw0YUg0YEg0YDQsNC30L3Ri9C8IGFyZWEuXHJcblx0ICovXHJcblx0bXVsdGlJbnN0YW5jZVNlcnZpY2VzOiB7XHJcblx0XHRjaGF0czogdHJ1ZSxcclxuXHRcdHRnOiB0cnVlLFxyXG5cdFx0bWF4OiB0cnVlLFxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemUoKSB7XHJcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVzdGFydFdvcmtlcigpO1xyXG5cdH0sXHJcblxyXG5cdHJlc3RhcnRXb3JrZXIoKSB7XHJcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xyXG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnVXBkYXRpbmcnKTtcclxuXHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xyXG5cdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLndvcmtlcigpO1xyXG5cdH0sXHJcblxyXG5cdHdvcmtlcigpIHtcclxuXHRcdGlmIChtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuJHN0YXR1c1RvZ2dsZS5jaGVja2JveCgnaXMgY2hlY2tlZCcpKSB7XHJcblx0XHRcdC8vIFBlciByZXF1ZXN0OiBhIHBhcmFsbGVsIHBvbGwgKHJlc3RhcnRXb3JrZXIgYWZ0ZXIgYSBmb3JtIHNhdmUpIG11c3Qgbm90IG1hcmsgdGhpcyBvbmUuXHJcblx0XHRcdGxldCByZW5kZXJlZCA9IGZhbHNlO1xyXG5cdFx0XHQkLmFwaSh7XHJcblx0XHRcdFx0dXJsOiBgJHtDb25maWcucGJ4VXJsfS9wYnhjb3JlL2FwaS9tb2R1bGVzL01vZHVsZUNUSUNsaWVudC9jaGVja2AsXHJcblx0XHRcdFx0b246ICdub3cnLFxyXG5cdFx0XHRcdHN1Y2Nlc3NUZXN0OiBQYnhBcGkuc3VjY2Vzc1Rlc3QsXHJcblx0XHRcdFx0b25Db21wbGV0ZSgpIHtcclxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0SGFuZGxlID0gd2luZG93LnNldFRpbWVvdXQoXHJcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci53b3JrZXIsXHJcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50aW1lT3V0LFxyXG5cdFx0XHRcdFx0KTtcclxuXHRcdFx0XHR9LFxyXG5cdFx0XHRcdG9uUmVzcG9uc2UocmVzcG9uc2UpIHtcclxuXHRcdFx0XHRcdHJlbmRlcmVkID0gdHJ1ZTtcclxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJDaGVja1Jlc3BvbnNlKHJlc3BvbnNlKTtcclxuXHRcdFx0XHR9LFxyXG5cdFx0XHRcdG9uU3VjY2VzcygpIHtcclxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5jaGFuZ2VTdGF0dXMoJ0Nvbm5lY3RlZCcpO1xyXG5cdFx0XHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmVycm9yQ291bnRzID0gMDtcclxuXHRcdFx0XHRcdHdpbmRvdy5jbGVhclRpbWVvdXQobW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnRpbWVPdXRIYW5kbGUpO1xyXG5cdFx0XHRcdH0sXHJcblx0XHRcdFx0b25GYWlsdXJlKHJlc3BvbnNlKSB7XHJcblx0XHRcdFx0XHQvLyBDb3JlIzExNjY6IG5ld2VyIGNvcmVzIGFuc3dlciBhIGZhaWxlZCBjaGVjayB3aXRoIEhUVFAgNHh4LzV4eCwgYW5kICQuYXBpXHJcblx0XHRcdFx0XHQvLyBza2lwcyBvblJlc3BvbnNlIG9uIGEgbm9uLTJ4eCBzdGF0dXMsIHNvIHRoZSBwYW5lbCBpcyBkcmF3biBoZXJlIGluc3RlYWQuXHJcblx0XHRcdFx0XHRpZiAoIXJlbmRlcmVkXHJcblx0XHRcdFx0XHRcdCYmIHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCdcclxuXHRcdFx0XHRcdFx0JiYgdHlwZW9mIHJlc3BvbnNlLmRhdGEgIT09ICd1bmRlZmluZWQnKSB7XHJcblx0XHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5yZW5kZXJDaGVja1Jlc3BvbnNlKHJlc3BvbnNlKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci5lcnJvckNvdW50cyArPSAxO1xyXG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IChyZXNwb25zZSAmJiByZXNwb25zZS5kYXRhKSA/IHJlc3BvbnNlLmRhdGEgOiBudWxsO1xyXG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBBcnJheS5pc0FycmF5KGRhdGEuc3RhdHVzZXMpKVxyXG5cdFx0XHRcdFx0XHQ/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xyXG5cdFx0XHRcdFx0aWYgKCFzdGF0dXNlcykge1xyXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uRXJyb3InKTtcclxuXHRcdFx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0Ly8gS25vd24gc2V0dXAgc3RhdGUsIG5vdCBhIGJvb3QgaW4gcHJvZ3Jlc3M6IG5vdGhpbmcgd2FzIHN0YXJ0ZWQgYW5kIHRoZVxyXG5cdFx0XHRcdFx0Ly8gY2VydGlmaWNhdGUgcGFuZWwgYWxyZWFkeSBzYXlzIHdoeS4gU3RvcCB0aGUgc3Bpbm5lciB3aXRoIGEgcGxhaW4gc3RhdGU7XHJcblx0XHRcdFx0XHQvLyB0aGUgbmV4dCBwb2xsIGFmdGVyIGEgbm9ybWFsIFNhdmUgZmFsbHMgdGhyb3VnaCB0byB0aGUgY2hlY2tzIGJlbG93LlxyXG5cdFx0XHRcdFx0aWYgKG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci50bHNOb3RTdGFydGVkKHN0YXR1c2VzKSkge1xyXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdUbHNOb3RTdGFydGVkJyk7XHJcblx0XHRcdFx0XHRcdHJldHVybjtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdC8vIE1vZHVsZSBzdGFydHVwIGdyYWNlOiB0aGUgYmFja2VuZCBoYXMgYWxyZWFkeSBkb3duZ3JhZGVkIGFueVxyXG5cdFx0XHRcdFx0Ly8gaGFyZCBlcnJvciB0byBcInN0YXJ0aW5nXCIgd2hpbGUgdGhlIHN0YWNrIGJvb3RzLCBzbyBzaG93IG9uZVxyXG5cdFx0XHRcdFx0Ly8gY2FsbSBwcm9ncmVzcyBiYWRnZSBhbmQgbmV2ZXIgZXNjYWxhdGUgdG8gYSBmYWlsdXJlIGhlcmUg4oCUXHJcblx0XHRcdFx0XHQvLyB0aGlzIGlzIHdoYXQga2VlcHMgdGhlIGZpcnN0IH4yIG1pbnV0ZXMgZnJlZSBvZiBmYWxzZSByZWRzLlxyXG5cdFx0XHRcdFx0aWYgKGRhdGEuc3RhcnR1cF9ncmFjZSA9PT0gdHJ1ZSkge1xyXG5cdFx0XHRcdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uUHJvZ3Jlc3MnKTtcclxuXHRcdFx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0Ly8gQ2xhc3NpZnkgdGhlIHJlc3BvbnNlIGJ5IHRoZSB3b3JzdCBub24tc3lzdGVtIHN0YXRlLlxyXG5cdFx0XHRcdFx0Ly8gY3JtLTFjIGlzIHNwZWNpYWw6IGl0J3MgdGhlIDFDIGJyaWRnZSDigJQgaXRzIG93biBlcnJvciBsYWJlbC5cclxuXHRcdFx0XHRcdC8vIEFsb25nc2lkZSB0aGUgYm9vbGVhbnMsIGNvbGxlY3QgZGVkdXBlZCBodW1hbiBzZXJ2aWNlIG5hbWVzXHJcblx0XHRcdFx0XHQvLyAoYnkgbGFiZWwpIGZvciBlYWNoIGJ1Y2tldCBzbyB0aGUgc3VtbWFyeSBsaW5lIGNhbiBOQU1FIHRoZVxyXG5cdFx0XHRcdFx0Ly8gc2VydmljZXMgdGhhdCBhcmUgZmFpbGluZyBvciBzdHVjayBpbnN0ZWFkIG9mIGEgYmFyZSBjb2xvdXIuXHJcblx0XHRcdFx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xyXG5cdFx0XHRcdFx0bGV0IGNybTFjID0gbnVsbDtcclxuXHRcdFx0XHRcdGxldCBoYXNFcnJvciA9IGZhbHNlO1xyXG5cdFx0XHRcdFx0bGV0IGhhc1N0YXJ0aW5nID0gZmFsc2U7XHJcblx0XHRcdFx0XHRjb25zdCBlcnJOYW1lcyA9IHt9O1xyXG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnROYW1lcyA9IHt9O1xyXG5cdFx0XHRcdFx0c3RhdHVzZXMuZm9yRWFjaCgocykgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZiAoIXMgfHwgdHlwZW9mIHMubmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcclxuXHRcdFx0XHRcdFx0aWYgKHMubmFtZSA9PT0gJ2NybS0xYycpIGNybTFjID0gcy5zdGF0ZTtcclxuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdlcnJvcicgfHwgcy5zdGF0ZSA9PT0gJ2ZhaWwnIHx8IHMuc3RhdGUgPT09ICdmYWlsZWQnXHJcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ2Rvd24nIHx8IHMuc3RhdGUgPT09ICdzdG9wcGVkJykge1xyXG5cdFx0XHRcdFx0XHRcdGhhc0Vycm9yID0gdHJ1ZTtcclxuXHRcdFx0XHRcdFx0XHRlcnJOYW1lc1tzZWxmLnNlcnZpY2VMYWJlbChzLm5hbWUpXSA9IHRydWU7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09ICdzdGFydGluZycgfHwgcy5zdGF0ZSA9PT0gJ3BlbmRpbmcnXHJcblx0XHRcdFx0XHRcdFx0fHwgcy5zdGF0ZSA9PT0gJ3Vua25vd24nKSB7XHJcblx0XHRcdFx0XHRcdFx0aGFzU3RhcnRpbmcgPSB0cnVlO1xyXG5cdFx0XHRcdFx0XHRcdHN0YXJ0TmFtZXNbc2VsZi5zZXJ2aWNlTGFiZWwocy5uYW1lKV0gPSB0cnVlO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdGNvbnN0IGVycm9yTGlzdCA9IE9iamVjdC5rZXlzKGVyck5hbWVzKTtcclxuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGlzdCA9IE9iamVjdC5rZXlzKHN0YXJ0TmFtZXMpO1xyXG5cdFx0XHRcdFx0Ly8gU2V2ZXJpdHkgb3JkZXI6IGEgZ2VudWluZSByZWQgZmFpbHVyZSAoaW5jbC4gYSBjcm0tMWMgYnJpZGdlXHJcblx0XHRcdFx0XHQvLyBkYWVtb24gdGhhdCBpcyBhY3R1YWxseSBkb3duIOKAlCBpdCBzdGF5cyAnZXJyb3InKSB3aW5zIHRoZVxyXG5cdFx0XHRcdFx0Ly8gaGVhZGxpbmUgc28gaXQgaXMgbmV2ZXIgbWFza2VkIGJ5IGEgY2FsbWVyIG1lc3NhZ2UuIFRoZW4gdGhlXHJcblx0XHRcdFx0XHQvLyAxQyBicmlkZ2UncyBtb2RlLWF3YXJlIFwibm8gbGl2ZSBzZXNzaW9uIHlldFwiIHN0YXRlcyAoZnJvbVxyXG5cdFx0XHRcdFx0Ly8gcmVmaW5lQ3JtU3RhdHVzOiBjb25uZWN0aW5nXzFjIC8gd2FpdGluZ18xYykg4oCUIGFsd2F5cyBhIGNhbG1cclxuXHRcdFx0XHRcdC8vIHllbGxvdywgbmV2ZXIgcmVkLiBUaGVuIGdlbmVyaWMgc3RhcnR1cCBwcm9ncmVzcy5cclxuXHRcdFx0XHRcdGlmIChoYXNFcnJvcikge1xyXG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJywgeyBuYW1lczogZXJyb3JMaXN0IH0pO1xyXG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjcm0xYyA9PT0gJ3dhaXRpbmdfMWMnKSB7XHJcblx0XHRcdFx0XHRcdHNlbGYuY2hhbmdlU3RhdHVzKCdDb25uZWN0aW9uVG8xQ1dhaXRpbmcnKTtcclxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY3JtMWMgPT09ICdjb25uZWN0aW5nXzFjJykge1xyXG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblRvMUNDb25uZWN0aW5nJyk7XHJcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGhhc1N0YXJ0aW5nKSB7XHJcblx0XHRcdFx0XHRcdC8vIFN0aWxsIHN0YXJ0aW5nOiBzaG93IHByb2dyZXNzIHVudGlsIHdlIGdpdmUgdXAgYWZ0ZXIgMTBcclxuXHRcdFx0XHRcdFx0Ly8gZmFpbGVkIHBvbGxzLCB0aGVuIHRyZWF0IHRoZSBzdHVjayBkYWVtb24gYXMgYW4gZXJyb3JcclxuXHRcdFx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBmYWxzZWx5IHJlcG9ydGluZyBpdCBhcyBDb25uZWN0ZWQuXHJcblx0XHRcdFx0XHRcdGlmIChzZWxmLmVycm9yQ291bnRzIDwgMTApIHtcclxuXHRcdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvblByb2dyZXNzJywgeyBjb3VudDogc3RhcnRMaXN0Lmxlbmd0aCB9KTtcclxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGlvbkVycm9yJywgeyBuYW1lczogc3RhcnRMaXN0IH0pO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRzZWxmLmNoYW5nZVN0YXR1cygnQ29ubmVjdGVkJyk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fSxcclxuXHRcdFx0fSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIuZXJyb3JDb3VudHMgPSAwO1xyXG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhudWxsKTtcclxuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLmNoYW5nZVN0YXR1cygnRGlzYWJsZWQnKTtcclxuXHRcdFx0bW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyLnJlbmRlckRpc2FibGVkUGFuZWwoKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiBUcnVlIHdoZW4gdGhlIENUSSBzdGFjayBpcyBrbm93biBub3QgdG8gYmUgc3RhcnRlZCBiZWNhdXNlIGNlcnRpZmljYXRlIHNldHVwIGlzIGluY29tcGxldGU6XHJcblx0ICogdGhlIGNlcnRpZmljYXRlIHBhbmVsIHJlcG9ydHMgYSBwcm9ibGVtIChkYXRhLXN0YXRlPWVycm9yKSBhbmQgbW9uaXRvcmQgaXMgbm90IHJ1bm5pbmcuXHJcblx0ICogV2l0aG91dCB0aGF0IHBhbmVsIHZlcmRpY3QgYW4gZW1wdHkgc3RhY2sgaXMgc3RpbGwgdHJlYXRlZCBhcyBzdGFydGluZyB1cC5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7QXJyYXl9IHN0YXR1c2VzIHNlcnZpY2VzIHJlcG9ydGVkIGJ5IHRoZSBjaGVjayBBUEkuXHJcblx0ICogQHJldHVybnMge2Jvb2xlYW59XHJcblx0ICovXHJcblx0dGxzTm90U3RhcnRlZChzdGF0dXNlcykge1xyXG5cdFx0Y29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3RpLXRscy1wYW5lbCcpO1xyXG5cdFx0aWYgKCFwYW5lbCB8fCBwYW5lbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtc3RhdGUnKSAhPT0gJ2Vycm9yJyB8fCAhQXJyYXkuaXNBcnJheShzdGF0dXNlcykpIHtcclxuXHRcdFx0cmV0dXJuIGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuICFzdGF0dXNlcy5zb21lKChzKSA9PiBzICYmIHMubmFtZSA9PT0gJ21vbml0b3JkJyAmJiBzLnN0YXRlID09PSAnb2snKTtcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiBEcmF3IHRoZSBzZXJ2aWNlcyBwYW5lbCwgdGhlIHJlbW90ZSBsb2NrIGFuZCB0aGUgZGVidWcgcGFuZSBmcm9tIGEgY2hlY2sgYW5zd2VyLlxyXG5cdCAqL1xyXG5cdHJlbmRlckNoZWNrUmVzcG9uc2UocmVzcG9uc2UpIHtcclxuXHRcdCQoJy5tZXNzYWdlLmFqYXgnKS5yZW1vdmUoKTtcclxuXHRcdGlmICh0eXBlb2YgKHJlc3BvbnNlLmRhdGEpID09PSAndW5kZWZpbmVkJykge1xyXG5cdFx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhudWxsKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIFJlbmRlciBzZXJ2aWNlcyBzdGF0dXMgcGFuZWwgZm9yIGJvdGggc3VjY2VzcyBhbmQgcGFydGlhbCByZXNwb25zZXMuXHJcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIucmVuZGVyU2VydmljZXNTdGF0dXMocmVzcG9uc2UuZGF0YSk7XHJcblx0XHRtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXIubm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhyZXNwb25zZS5kYXRhKTtcclxuXHJcblx0XHQvLyBEZWJ1ZyBKU09OIHBhbmUgKGxlZ2FjeSBkZWJ1ZyB0YWIpLiBEYWVtb24gc3RyaW5ncyBnbyBpbiBhcyB0ZXh0LCBuZXZlciBhcyBtYXJrdXAuXHJcblx0XHRjb25zdCB2aXN1YWxFcnJvclN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLmRhdGEsIG51bGwsIDIpO1xyXG5cdFx0aWYgKHR5cGVvZiB2aXN1YWxFcnJvclN0cmluZyA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0Y29uc3QgJHBhbmUgPSAkKCc8ZGl2IGNsYXNzPVwidWkgbWVzc2FnZSBhamF4XCI+PC9kaXY+Jyk7XHJcblx0XHRcdGlmICghKE9iamVjdC5rZXlzKHJlc3BvbnNlKS5sZW5ndGggPiAwICYmIHJlc3BvbnNlLnJlc3VsdCA9PT0gdHJ1ZSkpIHtcclxuXHRcdFx0XHQkcGFuZS5hcHBlbmQoJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+Jyk7XHJcblx0XHRcdH1cclxuXHRcdFx0JHBhbmUuYXBwZW5kKCQoJzxwcmUgc3R5bGU9XCJ3aGl0ZS1zcGFjZTogcHJlLXdyYXBcIj48L3ByZT4nKS50ZXh0KHZpc3VhbEVycm9yU3RyaW5nKSk7XHJcblx0XHRcdG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlci4kZGVidWdJbmZvLmFmdGVyKCRwYW5lKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiDQodC+0L7QsdGJ0LjRgtGMINGE0L7RgNC80LUg0L3QsNGB0YLRgNC+0LXQuiwg0YfRgtC+IHJlbW90ZS9WUFMg0L/QvtC70Y8g0L3Rg9C20L3QviDQt9Cw0LHQu9C+0LrQuNGA0L7QstCw0YLRjCDQuNC70Lgg0YDQsNC30LHQu9C+0LrQuNGA0L7QstCw0YLRjC5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7T2JqZWN0fG51bGx9IGRhdGEg0J7RgtCy0LXRgiBBUEkgY2hlY2suXHJcblx0ICovXHJcblx0bm90aWZ5UmVtb3RlTWlncmF0aW9uTG9jayhkYXRhKSB7XHJcblx0XHRjb25zdCBhY3RpdmUgPSBkYXRhICYmIGRhdGEucmVtb3RlX21pZ3JhdGlvbl9hY3RpdmUgPT09IHRydWU7XHJcblx0XHRjb25zdCBzZXJ2aWNlcyA9IChkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS5yZW1vdGVfbWlncmF0aW9uX3NlcnZpY2VzKSlcclxuXHRcdFx0PyBkYXRhLnJlbW90ZV9taWdyYXRpb25fc2VydmljZXMgOiBbXTtcclxuXHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnUmVtb3RlTWlncmF0aW9uTG9ja0NoYW5nZWQnLCB7XHJcblx0XHRcdGRldGFpbDoge1xyXG5cdFx0XHRcdGFjdGl2ZSxcclxuXHRcdFx0XHRzZXJ2aWNlcyxcclxuXHRcdFx0fSxcclxuXHRcdH0pKTtcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiDQodC+0L7QsdGJ0LXQvdC40LUg0LIg0L/QsNC90LXQu9C4INGB0YLQsNGC0YPRgdC+0LIsINC60L7Qs9C00LAg0LzQvtC00YPQu9GMINCy0YvQutC70Y7Rh9C10L0uXHJcblx0ICovXHJcblx0cmVuZGVyRGlzYWJsZWRQYW5lbCgpIHtcclxuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XHJcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcclxuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCdcclxuXHRcdFx0JiYgZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWQpXHJcblx0XHRcdD8gZ2xvYmFsVHJhbnNsYXRlLm1vZF9jdGlfU3RhdHVzTW9kdWxlRGlzYWJsZWRcclxuXHRcdFx0OiAnTW9kdWxlIGlzIGRpc2FibGVkJztcclxuXHRcdC8vIERvbid0IHJlcGxhY2UgdGhlIHBhbmVsJ3MgaW5uZXJIVE1MOiB0aGF0IGRlc3Ryb3lzICNjdGktc2VydmljZXMtc3RhdHVzLXJvd3NcclxuXHRcdC8vIGFuZCAjY3RpLXNlcnZpY2VzLXN0YXR1cy1wbGFjZWhvbGRlciwgc28gYSBsYXRlciByZS1lbmFibGUgV0lUSE9VVCBhIHBhZ2VcclxuXHRcdC8vIHJlbG9hZCB3b3VsZCBsZWF2ZSByZW5kZXJTZXJ2aWNlc1N0YXR1cygpIHdyaXRpbmcgaW50byBhbiBlbXB0eSBzZWxlY3Rpb25cclxuXHRcdC8vIGFuZCB0aGUgdGFibGUgd291bGQgbmV2ZXIgY29tZSBiYWNrLiBSZXVzZSB0aGUgcGxhY2Vob2xkZXIgaW5zdGVhZCxcclxuXHRcdC8vIG1pcnJvcmluZyByZW5kZXJTZXJ2aWNlc1N0YXR1cygpJ3Mgc2hvd1BsYWNlaG9sZGVyLCBzbyB0aGUgc3RydWN0dXJlXHJcblx0XHQvLyBzdXJ2aXZlcy4gRmFsbCBiYWNrIHRvIHJlcGxhY2luZyB0aGUgcGFuZWwgb25seSBpZiB0aGUgc2tlbGV0b24gaXMgYWJzZW50LlxyXG5cdFx0Y29uc3QgJHJvd3MgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1yb3dzJyk7XHJcblx0XHRjb25zdCAkcGxhY2Vob2xkZXIgPSAkKCcjY3RpLXNlcnZpY2VzLXN0YXR1cy1wbGFjZWhvbGRlcicpO1xyXG5cdFx0c2VsZi5sYXN0UmVuZGVySGFzaCA9ICcnO1xyXG5cdFx0aWYgKCRyb3dzLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0JHJvd3MuZW1wdHkoKTtcclxuXHRcdH1cclxuXHRcdGlmICgkcGxhY2Vob2xkZXIubGVuZ3RoID4gMCkge1xyXG5cdFx0XHQkcGxhY2Vob2xkZXIuaHRtbChgPHNwYW4+Jm5ic3A7JHtzZWxmLmVzY2FwZUh0bWwobGFiZWwpfTwvc3Bhbj5gKS5zaG93KCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHQkcGFuZWwuaHRtbChgPGRpdiBjbGFzcz1cInVpIGJhc2ljIHNlZ21lbnRcIj4ke3NlbGYuZXNjYXBlSHRtbChsYWJlbCl9PC9kaXY+YCk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0LyoqXHJcblx0ICog0KDQtdC90LTQtdGAINGC0LDQsdC70LjRhtGLINGB0YLQsNGC0YPRgdC+0LI6IMKr0LjQvdC00LjQutCw0YLQvtGAICsg0YHQtdGA0LLQuNGBL9C60LDQvdCw0LsgKyDRgNCw0YHQv9C+0LvQvtC20LXQvdC40LUgK1xyXG5cdCAqINCw0L/RgtCw0LnQvCArINCy0LXRgNGB0LjRj8K7LiDQmtC+0LvQvtC90LrQsCDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7INC/0L7Rj9Cy0LvRj9C10YLRgdGPINGC0L7Qu9GM0LrQviDQtdGB0LvQuCDRhdC+0YLRjyDQsdGLXHJcblx0ICog0L7QtNC40L0g0YHQtdGA0LLQuNGBINCy0YvQvdC10YHQtdC9INC90LAgVlBTIOKAlCDQvdCwINC+0LHRi9GH0L3QvtC5INC70L7QutCw0LvRjNC90L7QuSDRg9GB0YLQsNC90L7QstC60LUg0YLQsNCx0LvQuNGG0LBcclxuXHQgKiDQvtGB0YLQsNGR0YLRgdGPINC60L7QvNC/0LDQutGC0L3QvtC5LlxyXG5cdCAqXHJcblx0ICogQHBhcmFtIHtPYmplY3R9IGRhdGEg0J7RgtCy0LXRgiBBUEkgKHJlc3BvbnNlLmRhdGEpLlxyXG5cdCAqL1xyXG5cdHJlbmRlclNlcnZpY2VzU3RhdHVzKGRhdGEpIHtcclxuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XHJcblx0XHRjb25zdCAkcGFuZWwgPSBzZWxmLiRzZXJ2aWNlc1N0YXR1cztcclxuXHRcdGlmICghJHBhbmVsIHx8ICRwYW5lbC5sZW5ndGggPT09IDApIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcclxuXHRcdGNvbnN0ICRyb3dzID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcm93cycpO1xyXG5cdFx0Y29uc3QgJHBsYWNlaG9sZGVyID0gJCgnI2N0aS1zZXJ2aWNlcy1zdGF0dXMtcGxhY2Vob2xkZXInKTtcclxuXHRcdGNvbnN0IHNob3dQbGFjZWhvbGRlciA9ICh0ZXh0KSA9PiB7XHJcblx0XHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSAnJztcclxuXHRcdFx0JHJvd3MuZW1wdHkoKTtcclxuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XHJcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmh0bWwoYDxzcGFuPiZuYnNwOyR7ZXNjKHRleHQpfTwvc3Bhbj5gKS5zaG93KCk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0JHBhbmVsLmh0bWwoYDxkaXYgY2xhc3M9XCJ1aSBiYXNpYyBzZWdtZW50XCI+JHtlc2ModGV4dCl9PC9kaXY+YCk7XHJcblx0XHRcdH1cclxuXHRcdH07XHJcblxyXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSAoZGF0YSAmJiBkYXRhLnN0YXR1c2VzKSA/IGRhdGEuc3RhdHVzZXMgOiBudWxsO1xyXG5cclxuXHRcdC8vIFBoYXNlIEM6IHBlci1zZXJ2aWNlIGZhaWxiYWNrIGVsaWdpYmlsaXR5ICsgd2FybS1zdGFuZGJ5IG1pcnJvciBhZ2UuXHJcblx0XHRzZWxmLnJlbW90ZUZhaWxiYWNrID0gKGRhdGEgJiYgZGF0YS5yZW1vdGVfZmFpbGJhY2sgJiYgdHlwZW9mIGRhdGEucmVtb3RlX2ZhaWxiYWNrID09PSAnb2JqZWN0JylcclxuXHRcdFx0PyBkYXRhLnJlbW90ZV9mYWlsYmFjayA6IHt9O1xyXG5cclxuXHRcdC8vINCR0Y3QuiDQvNC+0LbQtdGCINCy0LXRgNC90YPRgtGMINGB0YLRgNC+0LrRgyAnTW9kdWxlIGRpc2FibGVkJyDQstC80LXRgdGC0L4g0LzQsNGB0YHQuNCy0LAuXHJcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RhdHVzZXMpKSB7XHJcblx0XHRcdGNvbnN0IHRleHQgPSAodHlwZW9mIHN0YXR1c2VzID09PSAnc3RyaW5nJylcclxuXHRcdFx0XHQ/IHN0YXR1c2VzXHJcblx0XHRcdFx0OiBzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c1VuYXZhaWxhYmxlJywgJ1N0YXR1cyB1bmF2YWlsYWJsZScpO1xyXG5cdFx0XHRzaG93UGxhY2Vob2xkZXIodGV4dCk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHQvLyDQodGC0LXQuiDQvdC1INC30LDQv9GD0YnQtdC9INC40Lct0LfQsCDQvdC10LfQsNCy0LXRgNGI0ZHQvdC90L7QuSDQvdCw0YHRgtGA0L7QudC60Lgg0YHQtdGA0YLQuNGE0LjQutCw0YLQsDog0L3QtSDRgNC40YHRg9C10Lwg0YHRgtGA0L7QutC4IMKrc3RhcnRpbmfCuy5cclxuXHRcdGlmIChzZWxmLnRsc05vdFN0YXJ0ZWQoc3RhdHVzZXMpKSB7XHJcblx0XHRcdHNob3dQbGFjZWhvbGRlcihzZWxmLnRyKCdtb2RfY3RpX1N0YXR1c1Rsc05vdFN0YXJ0ZWQnLCAnTm90IHN0YXJ0ZWQ6IHRoZSBDVEkgY2VydGlmaWNhdGUgc2V0dXAgaXMgaW5jb21wbGV0ZScpKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vINCf0YDQvtC/0YPRgdC60LDQtdC8INC/0LXRgNC10YDQuNGB0L7QstC60YMgRE9NLCDQtdGB0LvQuCDQtNCw0L3QvdGL0LUg0L3QtSDQuNC30LzQtdC90LjQu9C40YHRjCDigJQg0YPQsdC40YDQsNC10YJcclxuXHRcdC8vINC80LXRgNGG0LDQvdC40LUg0YLQsNCx0LvQuNGG0Ysg0L/RgNC4INC+0L/RgNC+0YHQtSDRgNCw0Lcg0LIgMyDRgdC10LrRg9C90LTRiy4g0JLQutC70Y7Rh9Cw0LXQvCByZW1vdGVGYWlsYmFjayDQslxyXG5cdFx0Ly8g0YXRjdGILCDQuNC90LDRh9C1INC/0L7Rj9Cy0LvQtdC90LjQtSDQutC90L7Qv9C60Lgv0L7QsdC90L7QstC70LXQvdC40LUg0LLQvtC30YDQsNGB0YLQsCDQutC+0L/QuNC4INC90LUg0L/QtdGA0LXRgNC40YHRg9C10YLRgdGPLlxyXG5cdFx0Ly8g0JrQvtCz0LTQsCDQv9C+0LrQsNC30LDQvdCwINGB0YLRgNC+0LrQsCBmYWlsYmFjaywg0LXRkSDCq2xvY2FsIGNvcHk6IE4gYWdvwrsg0LTQvtC70LbQtdC9INC40LTRgtC4INC00LDQttC1XHJcblx0XHQvLyDQv9GA0Lgg0LfQsNGB0YLRi9Cy0YjQuNGFIHN0YXR1c2VzL3JlbW90ZUZhaWxiYWNrICjRgtGD0L3QvdC10LvRjCDQu9C10LbQuNGCIOKAlCBsYXN0X21pcnJvcl90cyDQvdC1XHJcblx0XHQvLyDRgNCw0YHRgtGR0YIpLCDQv9C+0Y3RgtC+0LzRgyDQv9C+0LTQvNC10YjQuNCy0LDQtdC8INCz0YDRg9Cx0YvQuSAxNS3RgdC10LrRg9C90LTQvdGL0Lkg0LHQsNC60LXRgiDQstGA0LXQvNC10L3QuCDQsiDRhdGN0YguXHJcblx0XHRsZXQgYWdlQnVja2V0ID0gMDtcclxuXHRcdGNvbnN0IHJmID0gc2VsZi5yZW1vdGVGYWlsYmFjaztcclxuXHRcdGlmIChyZiAmJiB0eXBlb2YgcmYgPT09ICdvYmplY3QnXHJcblx0XHRcdCYmIE9iamVjdC5rZXlzKHJmKS5zb21lKChrKSA9PiByZltrXSAmJiByZltrXS5jYW5fZmFpbGJhY2sgPT09IHRydWUpKSB7XHJcblx0XHRcdGFnZUJ1Y2tldCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDE1MDAwKTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IGhhc2ggPSBKU09OLnN0cmluZ2lmeSh7IHM6IHN0YXR1c2VzLCBmOiBzZWxmLnJlbW90ZUZhaWxiYWNrLCBhOiBhZ2VCdWNrZXQgfSk7XHJcblx0XHRpZiAoaGFzaCA9PT0gc2VsZi5sYXN0UmVuZGVySGFzaCAmJiAkcm93cy5jaGlsZHJlbigpLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XHJcblx0XHRcdFx0JHBsYWNlaG9sZGVyLmhpZGUoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8g0JPRgNGD0L/Qv9C40YDRg9C10Lwg0L/QviDQuNC80LXQvdC4INGB0LXRgNCy0LjRgdCwLiDQktC90YPRgtGA0Lgg0LPRgNGD0L/Qv9GLIOKAlCDRgdGC0YDQvtC60Lgg0L/QviBhcmVhICjQutCw0L3QsNC70YspLlxyXG5cdFx0Y29uc3QgZ3JvdXBzID0ge307XHJcblx0XHRjb25zdCBvcmRlciA9IFtdO1xyXG5cdFx0c3RhdHVzZXMuZm9yRWFjaCgoc3ZjKSA9PiB7XHJcblx0XHRcdGlmICghc3ZjIHx8IHR5cGVvZiBzdmMgIT09ICdvYmplY3QnKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdGNvbnN0IG5hbWUgPSAodHlwZW9mIHN2Yy5uYW1lID09PSAnc3RyaW5nJyAmJiBzdmMubmFtZS5sZW5ndGggPiAwKSA/IHN2Yy5uYW1lIDogJ3Vua25vd24nO1xyXG5cdFx0XHRpZiAoIWdyb3Vwc1tuYW1lXSkge1xyXG5cdFx0XHRcdGdyb3Vwc1tuYW1lXSA9IFtdO1xyXG5cdFx0XHRcdG9yZGVyLnB1c2gobmFtZSk7XHJcblx0XHRcdH1cclxuXHRcdFx0Z3JvdXBzW25hbWVdLnB1c2goc3ZjKTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdGlmIChvcmRlci5sZW5ndGggPT09IDApIHtcclxuXHRcdFx0c2hvd1BsYWNlaG9sZGVyKHNlbGYudHIoJ21vZF9jdGlfU3RhdHVzRW1wdHknLCAnTm8gc2VydmljZXMgcmVwb3J0ZWQnKSk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHQvLyDQmtC+0LvQvtC90LrQsCDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7IOKAlCDRgtC+0LvRjNC60L4g0LrQvtCz0LTQsCDQtdGB0YLRjCDRhdC+0YLRjCDQvtC00LjQvSDRg9C00LDQu9GR0L3QvdGL0Lkg0YHQtdGA0LLQuNGBLlxyXG5cdFx0Y29uc3QgaGFzUmVtb3RlID0gc3RhdHVzZXMuc29tZSgocykgPT4gcyAmJiBzLmxvY2F0aW9uID09PSAncmVtb3RlJyk7XHJcblx0XHRjb25zdCBjb2xDb3VudCA9IGhhc1JlbW90ZSA/IDUgOiA0O1xyXG5cclxuXHRcdGNvbnN0IGhlYWQgPSAnPHRoZWFkPjx0cj4nXHJcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xTdGF0dXMnLCAnU3RhdHVzJykpfTwvdGg+YFxyXG5cdFx0XHQrIGA8dGggY2xhc3M9XCJjdGktY29sLW5hbWVcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFNlcnZpY2UnLCAnU2VydmljZScpKX08L3RoPmBcclxuXHRcdFx0KyAoaGFzUmVtb3RlID8gYDx0aCBjbGFzcz1cImN0aS1jb2wtbG9jXCI+JHtlc2Moc2VsZi50cignbW9kX2N0aV9jb2xMb2NhdGlvbicsICdMb2NhdGlvbicpKX08L3RoPmAgOiAnJylcclxuXHRcdFx0KyBgPHRoIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke2VzYyhzZWxmLnRyKCdtb2RfY3RpX2NvbFVwdGltZScsICdVcHRpbWUnKSl9PC90aD5gXHJcblx0XHRcdCsgYDx0aCBjbGFzcz1cImN0aS1jb2wtdmVyc2lvblwiPiR7ZXNjKHNlbGYudHIoJ21vZF9jdGlfY29sVmVyc2lvbicsICdWZXJzaW9uJykpfTwvdGg+YFxyXG5cdFx0XHQrICc8L3RyPjwvdGhlYWQ+JztcclxuXHJcblx0XHRjb25zdCBib2R5ID0gW107XHJcblx0XHRvcmRlci5mb3JFYWNoKChuYW1lKSA9PiB7XHJcblx0XHRcdGNvbnN0IHJvd3MgPSBncm91cHNbbmFtZV07XHJcblx0XHRcdGNvbnN0IGlzTXVsdGkgPSBzZWxmLm11bHRpSW5zdGFuY2VTZXJ2aWNlc1tuYW1lXSA9PT0gdHJ1ZSB8fCByb3dzLmxlbmd0aCA+IDE7XHJcblx0XHRcdGlmIChpc011bHRpKSB7XHJcblx0XHRcdFx0Ym9keS5wdXNoKGA8dHIgY2xhc3M9XCJjdGktc3ZjLWdyb3VwXCI+PHRkIGNvbHNwYW49XCIke2NvbENvdW50fVwiPmBcclxuXHRcdFx0XHRcdCsgYDxpIGNsYXNzPVwiY29tbWVudHMgaWNvblwiPjwvaT4ke2VzYyhzZWxmLnNlcnZpY2VMYWJlbChuYW1lKSl9YFxyXG5cdFx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWNvdW50XCI+JHtyb3dzLmxlbmd0aH08L3NwYW4+PC90ZD48L3RyPmApO1xyXG5cdFx0XHRcdHJvd3MuZm9yRWFjaCgoc3ZjKSA9PiB7XHJcblx0XHRcdFx0XHRib2R5LnB1c2goc2VsZi5yZW5kZXJTZXJ2aWNlUm93KHN2YywgdHJ1ZSwgaGFzUmVtb3RlKSk7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0Ym9keS5wdXNoKHNlbGYucmVuZGVyU2VydmljZVJvdyhyb3dzWzBdLCBmYWxzZSwgaGFzUmVtb3RlKSk7XHJcblx0XHRcdH1cclxuXHRcdFx0Ly8gUGhhc2UgQzogb2ZmZXIgXCJicmluZyBiYWNrIHRvIGxvY2FsXCIgb25jZSBwZXIgc2VydmljZSBncm91cCB3aG9zZVxyXG5cdFx0XHQvLyBjaGFubmVscyBzdGlsbCBsaXZlIG9uIHRoZSBWUFMgKGRlcml2ZSB0aGUgYmFzZSBzdmMgZnJvbSBhXHJcblx0XHRcdC8vIFwiY2hhdHMuPGFyZWE+XCIgZ3JvdXAgbmFtZSkuXHJcblx0XHRcdGNvbnN0IHN2Y0tleSA9IG5hbWUuaW5kZXhPZignLicpID49IDAgPyBuYW1lLnNwbGl0KCcuJylbMF0gOiBuYW1lO1xyXG5cdFx0XHRjb25zdCBmYlJvdyA9IHNlbGYuZmFpbGJhY2tDb250cm9sUm93KHN2Y0tleSwgY29sQ291bnQpO1xyXG5cdFx0XHRpZiAoZmJSb3cgIT09ICcnKSB7XHJcblx0XHRcdFx0Ym9keS5wdXNoKGZiUm93KTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0JHJvd3MuaHRtbCgnPHRhYmxlIGNsYXNzPVwidWkgY2VsbGVkIHN0cmlwZWQgY29tcGFjdCB1bnN0YWNrYWJsZSB0YWJsZSBjdGktc3RhdHVzLXRhYmxlXCI+J1xyXG5cdFx0XHQrIGhlYWQgKyAnPHRib2R5PicgKyBib2R5LmpvaW4oJycpICsgJzwvdGJvZHk+PC90YWJsZT4nKTtcclxuXHRcdHNlbGYubGFzdFJlbmRlckhhc2ggPSBoYXNoO1xyXG5cdFx0aWYgKCRwbGFjZWhvbGRlci5sZW5ndGggPiAwKSB7XHJcblx0XHRcdCRwbGFjZWhvbGRlci5oaWRlKCk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0LyoqXHJcblx0ICog0KDQtdC90LTQtdGAINC+0LTQvdC+0Lkg0YHRgtGA0L7QutC4INGC0LDQsdC70LjRhtGLICjRgdC10YDQstC40YEg0LjQu9C4INC60LDQvdCw0LspLlxyXG5cdCAqXHJcblx0ICogQHBhcmFtIHtPYmplY3R9IHN2YyDQt9Cw0L/QuNGB0Ywg0LjQtyBzdGF0dXNlc1tdXHJcblx0ICogQHBhcmFtIHtib29sZWFufSBncm91cGVkINGB0YLRgNC+0LrQsCDQv9C+0LQg0LPRgNGD0L/Qv9C+0LLRi9C8INC30LDQs9C+0LvQvtCy0LrQvtC8ICjQutCw0L3QsNC7INC80LXRgdGB0LXQvdC00LbQtdGA0LApXHJcblx0ICogQHBhcmFtIHtib29sZWFufSBoYXNSZW1vdGUg0L/QvtC60LDQt9GL0LLQsNGC0Ywg0LvQuCDQutC+0LvQvtC90LrRgyDCq9Cg0LDRgdC/0L7Qu9C+0LbQtdC90LjQtcK7XHJcblx0ICogQHJldHVybnMge3N0cmluZ30gSFRNTCAo0L7QtNC90LAgPHRyPiwg0L/Qu9GO0YEgPHRyPiDRgSDQvtGI0LjQsdC60L7QuSDQv9GA0Lgg0L3QsNC70LjRh9C40LgpXHJcblx0ICovXHJcblx0cmVuZGVyU2VydmljZVJvdyhzdmMsIGdyb3VwZWQsIGhhc1JlbW90ZSkge1xyXG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcclxuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcclxuXHRcdGNvbnN0IGNvbENvdW50ID0gaGFzUmVtb3RlID8gNSA6IDQ7XHJcblxyXG5cdFx0Y29uc3Qgc3RhdGVSYXcgPSAodHlwZW9mIHN2Yy5zdGF0ZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnN0YXRlLmxlbmd0aCA+IDApID8gc3ZjLnN0YXRlIDogJ3Vua25vd24nO1xyXG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUoc3RhdGVSYXcpO1xyXG5cdFx0Y29uc3QgbGVkQ2xhc3MgPSBzZWxmLnN0YXRlTGVkQ2xhc3NbY2Fub25dIHx8ICd3YXJuJztcclxuXHRcdGNvbnN0IHN0YXRlVGV4dCA9IHNlbGYuc3RhdGVUZXh0KHN0YXRlUmF3KTtcclxuXHJcblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGdyb3VwZWRcclxuXHRcdFx0PyBzZWxmLnNob3J0QXJlYShzdmMuYXJlYSlcclxuXHRcdFx0OiBzZWxmLnNlcnZpY2VMYWJlbChzdmMubmFtZSk7XHJcblx0XHRjb25zdCBuYW1lSWNvbiA9IGdyb3VwZWQgPyAnPGkgY2xhc3M9XCJoYXNodGFnIGljb25cIj48L2k+JyA6ICcnO1xyXG5cclxuXHRcdGNvbnN0IHVwdGltZSA9ICh0eXBlb2Ygc3ZjLnVwdGltZSA9PT0gJ3N0cmluZycgJiYgc3ZjLnVwdGltZS5sZW5ndGggPiAwKSA/IHN2Yy51cHRpbWUgOiAnJztcclxuXHRcdGNvbnN0IHZlcnNpb24gPSAodHlwZW9mIHN2Yy52ZXJzaW9uID09PSAnc3RyaW5nJyAmJiBzdmMudmVyc2lvbi5sZW5ndGggPiAwKSA/IHN2Yy52ZXJzaW9uIDogJyc7XHJcblx0XHRjb25zdCBsYXN0RXJyb3IgPSAodHlwZW9mIHN2Yy5sYXN0X2Vycm9yID09PSAnc3RyaW5nJyAmJiBzdmMubGFzdF9lcnJvci5sZW5ndGggPiAwKSA/IHN2Yy5sYXN0X2Vycm9yIDogJyc7XHJcblx0XHRjb25zdCBkYXNoID0gJzxzcGFuIGNsYXNzPVwiY3RpLWRpbVwiPuKAlDwvc3Bhbj4nO1xyXG5cclxuXHRcdGNvbnN0IHN0YXR1c0NlbGwgPSBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLWxlZCAke2VzYyhsZWRDbGFzcyl9XCIgdGl0bGU9XCIke2VzYyhzdGF0ZVJhdyl9XCI+PC9zcGFuPmBcclxuXHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3ZjLXN0YXRlXCI+JHtlc2Moc3RhdGVUZXh0KX08L3NwYW4+YDtcclxuXHJcblx0XHRjb25zdCBuYW1lQ2VsbCA9IGA8c3BhbiBjbGFzcz1cImN0aS1zdmMtbmFtZSR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1jaGFubmVsJyA6ICcnfVwiPiR7bmFtZUljb259JHtlc2MoZGlzcGxheU5hbWUpfTwvc3Bhbj5gO1xyXG5cclxuXHRcdGNvbnN0IGxvY0NlbGwgPSBoYXNSZW1vdGUgPyBgPHRkIGNsYXNzPVwiY3RpLWNvbC1sb2NcIj4ke3NlbGYubG9jYXRpb25CYWRnZShzdmMubG9jYXRpb24pfTwvdGQ+YCA6ICcnO1xyXG5cclxuXHRcdGNvbnN0IGNlbGxzID0gYDx0ZCBjbGFzcz1cImN0aS1jb2wtc3RhdHVzXCI+JHtzdGF0dXNDZWxsfTwvdGQ+YFxyXG5cdFx0XHQrIGA8dGQgY2xhc3M9XCJjdGktY29sLW5hbWVcIj4ke25hbWVDZWxsfTwvdGQ+YFxyXG5cdFx0XHQrIGxvY0NlbGxcclxuXHRcdFx0KyBgPHRkIGNsYXNzPVwiY3RpLWNvbC11cHRpbWVcIj4ke3VwdGltZSAhPT0gJycgPyBlc2ModXB0aW1lKSA6IGRhc2h9PC90ZD5gXHJcblx0XHRcdCsgYDx0ZCBjbGFzcz1cImN0aS1jb2wtdmVyc2lvblwiPiR7dmVyc2lvbiAhPT0gJycgPyBlc2ModmVyc2lvbikgOiBkYXNofTwvdGQ+YDtcclxuXHJcblx0XHRsZXQgaHRtbCA9IGA8dHIgY2xhc3M9XCJjdGktc3ZjLXJvdyR7Z3JvdXBlZCA/ICcgY3RpLXN2Yy1zdWJyb3cnIDogJyd9XCJgXHJcblx0XHRcdCsgYCBkYXRhLXN2Yz1cIiR7ZXNjKHN2Yy5uYW1lIHx8ICcnKX1cIiBkYXRhLWFyZWE9XCIke2VzYyhzdmMuYXJlYSB8fCAnJyl9XCI+JHtjZWxsc308L3RyPmA7XHJcblxyXG5cdFx0Ly8gbGFzdF9lcnJvciBmcm9tIG1vbml0b3JkIGlzIHN0aWNreSAoXCJsYXN0IGVycm9yIGV2ZXIgc2VlblwiKSBhbmQgaXMgTk9UXHJcblx0XHQvLyBjbGVhcmVkIG9uIHJlY292ZXJ5IOKAlCBpdCBzdGF5cyBpbiB0aGUgQVBJIHBheWxvYWQgb24gcHVycG9zZSAoaGFuZHkgZm9yXHJcblx0XHQvLyBkZWJ1Z2dpbmcpLiBTdXJmYWNlIGl0IHRvIHRoZSBvcGVyYXRvciBPTkxZIHdoZW4gdGhlIHNlcnZpY2UgaXMgYWN0dWFsbHlcclxuXHRcdC8vIGluIGEgcmVkIGVycm9yIHN0YXRlLiBBIHJlY292ZXJlZCBnbGl0Y2ggKHN0YXRlPW9rKSBvciBhIHNlcnZpY2Ugc3RpbGxcclxuXHRcdC8vIHN0YXJ0aW5nL3dhcm1pbmcgdXAgKHN0YXRlPXN0YXJ0aW5nIC0+IHdhcm4gTEVELCBpbmNsLiB0aGUgc3RhcnR1cCBncmFjZVxyXG5cdFx0Ly8gd2luZG93KSBtdXN0IE5PVCBwcmludCBzdGFsZSBlcnJvciB0ZXh0IOKAlCBvdGhlcndpc2Ugd2UnZCBiZSByZXBvcnRpbmcgYVxyXG5cdFx0Ly8gc2VydmljZSBmYWlsdXJlIGluIHRoZSBmaXJzdCBtaW51dGUsIHdoaWNoIGlzIGV4YWN0bHkgd2hhdCB3ZSBzdXBwcmVzcy5cclxuXHRcdGlmIChsYXN0RXJyb3IgIT09ICcnICYmIGxlZENsYXNzID09PSAnZXJyb3InKSB7XHJcblx0XHRcdGh0bWwgKz0gYDx0ciBjbGFzcz1cImN0aS1zdmMtZXJyb3Itcm93XCI+PHRkIGNvbHNwYW49XCIke2NvbENvdW50fVwiPmBcclxuXHRcdFx0XHQrIGA8aSBjbGFzcz1cImV4Y2xhbWF0aW9uIHRyaWFuZ2xlIGljb25cIj48L2k+YFxyXG5cdFx0XHRcdCsgYDxzcGFuIHRpdGxlPVwiJHtlc2MobGFzdEVycm9yKX1cIj4ke2VzYyhzZWxmLnRydW5jYXRlKGxhc3RFcnJvciwgMjAwKSl9PC9zcGFuPmBcclxuXHRcdFx0XHQrICc8L3RkPjwvdHI+JztcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gaHRtbDtcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiBQaGFzZSBDOiDRgdGC0YDQvtC60LAg0YEg0LrQvdC+0L/QutC+0LkgwqvQstC10YDQvdGD0YLRjCDQvdCwINC70L7QutCw0LvRjMK7ICsg0LLQvtC30YDQsNGB0YLQvtC8INC70L7QutCw0LvRjNC90L7QuSDQutC+0L/QuNC4LFxyXG5cdCAqINC/0L7QutCw0LfRi9Cy0LDQtdGC0YHRjyDQtNC70Y8g0YHQtdGA0LLQuNGB0LAsINGH0YzQuCDQutCw0L3QsNC70Ysg0LXRidGRINC90LAgVlBTIChjYW5fZmFpbGJhY2spLlxyXG5cdCAqXHJcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN2YyDQsdCw0LfQvtCy0L7QtSDQuNC80Y8g0YHQtdGA0LLQuNGB0LAgKGNoYXRzfHRnfG1heClcclxuXHQgKiBAcGFyYW0ge251bWJlcn0gY29sQ291bnQg0YfQuNGB0LvQviDQutC+0LvQvtC90L7QuiDRgtCw0LHQu9C40YbRi1xyXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9IEhUTUwgKDx0cj4pINC70LjQsdC+ICcnINC10YHQu9C4IGZhaWxiYWNrINC90LUg0L/RgNC40LzQtdC90LjQvFxyXG5cdCAqL1xyXG5cdGZhaWxiYWNrQ29udHJvbFJvdyhzdmMsIGNvbENvdW50KSB7XHJcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xyXG5cdFx0Y29uc3QgZXNjID0gc2VsZi5lc2NhcGVIdG1sO1xyXG5cdFx0Y29uc3QgaW5mbyA9IHNlbGYucmVtb3RlRmFpbGJhY2sgPyBzZWxmLnJlbW90ZUZhaWxiYWNrW3N2Y10gOiBudWxsO1xyXG5cdFx0aWYgKCFpbmZvIHx8IGluZm8uY2FuX2ZhaWxiYWNrICE9PSB0cnVlKSB7XHJcblx0XHRcdHJldHVybiAnJztcclxuXHRcdH1cclxuXHRcdGNvbnN0IGxhYmVsID0gc2VsZi50cignbW9kX2N0aV9GYWlsYmFja1RvTG9jYWwnLCAnQnJpbmcgYmFjayB0byBsb2NhbCcpO1xyXG5cdFx0Y29uc3QgYWdlID0gc2VsZi5taXJyb3JBZ2VUZXh0KGluZm8ubGFzdF9taXJyb3JfdHMpO1xyXG5cdFx0cmV0dXJuIGA8dHIgY2xhc3M9XCJjdGktZmFpbGJhY2stcm93XCI+PHRkIGNvbHNwYW49XCIke2NvbENvdW50fVwiPmBcclxuXHRcdFx0KyBgPGJ1dHRvbiBjbGFzcz1cInVpIHRpbnkgYmFzaWMgb3JhbmdlIGJ1dHRvbiBjdGktZmFpbGJhY2stYnRuXCIgZGF0YS1zdmM9XCIke2VzYyhzdmMpfVwiPmBcclxuXHRcdFx0KyBgPGkgY2xhc3M9XCJyZXBseSBpY29uXCI+PC9pPiR7ZXNjKGxhYmVsKX08L2J1dHRvbj5gXHJcblx0XHRcdCsgYDxzcGFuIGNsYXNzPVwiY3RpLWZhaWxiYWNrLWFnZVwiPiR7ZXNjKGFnZSl9PC9zcGFuPmBcclxuXHRcdFx0KyAnPC90ZD48L3RyPic7XHJcblx0fSxcclxuXHJcblx0LyoqXHJcblx0ICogUGhhc2UgQzog0YfQtdC70L7QstC10LrQvtGH0LjRgtCw0LXQvNGL0Lkg0LLQvtC30YDQsNGB0YIg0LvQvtC60LDQu9GM0L3QvtC5INC60L7Qv9C40Lgg0YHQtdGB0YHQuNC4ICh3YXJtLXN0YW5kYnlcclxuXHQgKiBtaXJyb3IpLiB0cyDigJQgdW5peC3RgdC10LrRg9C90LTRizsgMC/Qv9GD0YHRgtC+ID0+IMKr0LrQvtC/0LjQuCDQtdGJ0ZEg0L3QtdGCwrsuXHJcblx0ICpcclxuXHQgKiBAcGFyYW0ge251bWJlcn0gdHNcclxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxyXG5cdCAqL1xyXG5cdG1pcnJvckFnZVRleHQodHMpIHtcclxuXHRcdGNvbnN0IHNlbGYgPSBtb2R1bGVDVElDbGllbnRDb25uZWN0aW9uQ2hlY2tXb3JrZXI7XHJcblx0XHRjb25zdCBuID0gcGFyc2VJbnQodHMsIDEwKTtcclxuXHRcdGlmICghbiB8fCBuIDw9IDApIHtcclxuXHRcdFx0cmV0dXJuIHNlbGYudHIoJ21vZF9jdGlfTWlycm9yTmV2ZXInLCAnbG9jYWwgY29weTogbm9uZSB5ZXQnKTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHNlY3MgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSAtIG4pO1xyXG5cdFx0bGV0IGh1bWFuO1xyXG5cdFx0aWYgKHNlY3MgPCA5MCkge1xyXG5cdFx0XHRodW1hbiA9IGAke3NlY3N9c2A7XHJcblx0XHR9IGVsc2UgaWYgKHNlY3MgPCA1NDAwKSB7XHJcblx0XHRcdGh1bWFuID0gYCR7TWF0aC5yb3VuZChzZWNzIC8gNjApfW1gO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aHVtYW4gPSBgJHtNYXRoLnJvdW5kKHNlY3MgLyAzNjAwKX1oYDtcclxuXHRcdH1cclxuXHRcdHJldHVybiBzZWxmLnRyKCdtb2RfY3RpX01pcnJvckFnZScsICdsb2NhbCBjb3B5OiAlYWdlJSBhZ28nKS5yZXBsYWNlKCclYWdlJScsIGh1bWFuKTtcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiDQkdC10LnQtNC2INGA0LDRgdC/0L7Qu9C+0LbQtdC90LjRjyDRgdC10YDQstC40YHQsDog0Y/RgNC60LjQuSDCq1ZQU8K7INC00LvRjyDQstGL0L3QtdGB0LXQvdC90YvRhSDQutCw0L3QsNC70L7QsiDQuFxyXG5cdCAqINC/0YDQuNCz0LvRg9GI0ZHQvdC90YvQuSDCq9Cb0L7QutCw0LvRjNC90L7CuyDQtNC70Y8g0LLRgdC10LPQviDQvtGB0YLQsNC70YzQvdC+0LPQvi5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBsb2NhdGlvbiAncmVtb3RlJyB8ICdsb2NhbCcgfCB1bmRlZmluZWRcclxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfSBIVE1MXHJcblx0ICovXHJcblx0bG9jYXRpb25CYWRnZShsb2NhdGlvbikge1xyXG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcclxuXHRcdGNvbnN0IGVzYyA9IHNlbGYuZXNjYXBlSHRtbDtcclxuXHRcdGlmIChsb2NhdGlvbiA9PT0gJ3JlbW90ZScpIHtcclxuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cInVpIHRlYWwgbGFiZWwgY3RpLWxvYy1iYWRnZVwiPjxpIGNsYXNzPVwiY2xvdWQgaWNvblwiPjwvaT5gXHJcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvblJlbW90ZScsICdWUFMnKSl9PC9zcGFuPmA7XHJcblx0XHR9XHJcblx0XHRpZiAobG9jYXRpb24gPT09ICdsb2NhbCcpIHtcclxuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cImN0aS1sb2MtbG9jYWxcIj48aSBjbGFzcz1cImhvbWUgaWNvblwiPjwvaT5gXHJcblx0XHRcdFx0KyBgJHtlc2Moc2VsZi50cignbW9kX2N0aV9Mb2NhdGlvbkxvY2FsJywgJ0xvY2FsJykpfTwvc3Bhbj5gO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuICc8c3BhbiBjbGFzcz1cImN0aS1kaW1cIj7igJQ8L3NwYW4+JztcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiDQmtCw0L3QvtC90LjQt9Cw0YbQuNGPINGB0LLQvtCx0L7QtNC90L7QuSDRgdGC0YDQvtC60Lgg0YHQvtGB0YLQvtGP0L3QuNGPINCyINC40LfQstC10YHRgtC90YvQuSDQutC70Y7RhyDQtNC70Y8g0LvQsNC80L/QvtGH0LrQuCDQuFxyXG5cdCAqINC/0LXRgNC10LLQvtC00LAuIG1vbml0b3JkINC80L7QttC10YIg0L/RgNC40YHRi9C70LDRgtGMIMKrYXdhaXRpbmcgYXV0aG9yaXphdGlvbiBjb2Rlwrsg0Lgg0L/RgC5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0ZVxyXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XHJcblx0ICovXHJcblx0Y2Fub25TdGF0ZShzdGF0ZSkge1xyXG5cdFx0Y29uc3QgcyA9IFN0cmluZyhzdGF0ZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcclxuXHRcdGlmIChzID09PSAnJykge1xyXG5cdFx0XHRyZXR1cm4gJ3Vua25vd24nO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHMuaW5kZXhPZigncXInKSAhPT0gLTEpIHtcclxuXHRcdFx0cmV0dXJuICdxcmNvZGUnO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHMuaW5kZXhPZignYXdhaXRpbmcnKSAhPT0gLTEgfHwgcy5pbmRleE9mKCdyZWF1dGgnKSAhPT0gLTFcclxuXHRcdFx0fHwgcy5pbmRleE9mKCdhdXRoX3JlcXVpcmVkJykgIT09IC0xIHx8IHMuaW5kZXhPZignMmZhJykgIT09IC0xKSB7XHJcblx0XHRcdHJldHVybiAncmVhdXRoJztcclxuXHRcdH1cclxuXHRcdGlmIChzID09PSAnYXV0aGVudGljYXRlZCcpIHtcclxuXHRcdFx0cmV0dXJuICdhdXRoZW50aWNhdGVkJztcclxuXHRcdH1cclxuXHRcdHJldHVybiBzO1xyXG5cdH0sXHJcblxyXG5cdC8qKlxyXG5cdCAqINCl0LXQu9C/0LXRgCDQv9C10YDQtdCy0L7QtNCwINGBINGE0L7Qu9Cx0Y3QutC+0LwuXHJcblx0ICpcclxuXHQgKiBAcGFyYW0ge3N0cmluZ30ga2V5INC60LvRjtGHIGdsb2JhbFRyYW5zbGF0ZVxyXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBmYWxsYmFjayDQt9C90LDRh9C10L3QuNC1INC/0L4g0YPQvNC+0LvRh9Cw0L3QuNGOXHJcblx0ICogQHJldHVybnMge3N0cmluZ31cclxuXHQgKi9cclxuXHR0cihrZXksIGZhbGxiYWNrKSB7XHJcblx0XHRpZiAodHlwZW9mIGdsb2JhbFRyYW5zbGF0ZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZ2xvYmFsVHJhbnNsYXRlW2tleV0pIHtcclxuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtrZXldO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xyXG5cdH0sXHJcblxyXG5cdC8qKlxyXG5cdCAqINCn0LXQu9C+0LLQtdC60L7Rh9C40YLQsNC10LzQvtC1INC40LzRjyDRgdC10YDQstC40YHQsC5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXHJcblx0ICogQHJldHVybnMge3N0cmluZ31cclxuXHQgKi9cclxuXHRzZXJ2aWNlTGFiZWwobmFtZSkge1xyXG5cdFx0Y29uc3QgbWFwID0ge1xyXG5cdFx0XHRtb25pdG9yZDogJ21vZF9jdGlfc3ZjX21vbml0b3JkJyxcclxuXHRcdFx0bmF0czogJ21vZF9jdGlfc3ZjX25hdHMnLFxyXG5cdFx0XHQnY3JtLTFjJzogJ21vZF9jdGlfc3ZjX2NybScsXHJcblx0XHRcdGF1dGg6ICdtb2RfY3RpX3N2Y19hdXRoJyxcclxuXHRcdFx0cHJveHk6ICdtb2RfY3RpX3N2Y19wcm94eScsXHJcblx0XHRcdCdhbWktbGlzdGVuZXInOiAnbW9kX2N0aV9zdmNfYW1pJyxcclxuXHRcdFx0Y2hhdHM6ICdtb2RfY3RpX3N2Y19jaGF0cycsXHJcblx0XHRcdHRnOiAnbW9kX2N0aV9zdmNfdGcnLFxyXG5cdFx0XHRtYXg6ICdtb2RfY3RpX3N2Y19tYXgnLFxyXG5cdFx0XHQnbWFuYWdlci5hcGknOiAnbW9kX2N0aV9zdmNfbWFuYWdlcl9hcGknLFxyXG5cdFx0XHQncmVtb3RlLXR1bm5lbCc6ICdtb2RfY3RpX3N2Y19yZW1vdGVfdHVubmVsJyxcclxuXHRcdH07XHJcblx0XHRjb25zdCBrZXkgPSBtYXBbbmFtZV07XHJcblx0XHRpZiAoa2V5ICYmIHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtrZXldKSB7XHJcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVba2V5XTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBuYW1lIHx8ICd1bmtub3duJztcclxuXHR9LFxyXG5cclxuXHQvKipcclxuXHQgKiDQp9C10LvQvtCy0LXQutC+0YfQuNGC0LDQtdC80L7QtSDQv9GA0LXQtNGB0YLQsNCy0LvQtdC90LjQtSBzdGF0ZSDQutCw0L3QsNC70LAv0YHQtdGA0LLQuNGB0LAgKNC90LDQv9GA0LjQvNC10YAgwqvQn9C+0LTQutC70Y7Rh9GR0L3CuyxcclxuXHQgKiDCq9Ci0YDQtdCx0YPQtdGCINCw0LLRgtC+0YDQuNC30LDRhtC40LjCuykuINCh0L3QsNGH0LDQu9CwINC40YnQtdC8INGC0L7Rh9C90YvQuSDQutC70Y7Rhywg0LfQsNGC0LXQvCDQv9C+INC60LDQvdC+0L3QuNGH0LXRgdC60L7QvNGDXHJcblx0ICog0YHQvtGB0YLQvtGP0L3QuNGOLCDQt9Cw0YLQtdC8IOKAlCDQsNC90LPQu9C40LnRgdC60LjQuSDRhNC+0LvQsdGN0LosINC4INCyINC60YDQsNC50L3QtdC8INGB0LvRg9GH0LDQtSDQuNGB0YXQvtC00L3Rg9GOINGB0YLRgNC+0LrRgy5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7c3RyaW5nfSBzdGF0ZVxyXG5cdCAqIEByZXR1cm5zIHtzdHJpbmd9XHJcblx0ICovXHJcblx0c3RhdGVUZXh0KHN0YXRlKSB7XHJcblx0XHRjb25zdCBzZWxmID0gbW9kdWxlQ1RJQ2xpZW50Q29ubmVjdGlvbkNoZWNrV29ya2VyO1xyXG5cdFx0Y29uc3QgcmF3ID0gU3RyaW5nKHN0YXRlIHx8ICcnKTtcclxuXHRcdC8vINCi0L7Rh9C90YvQuSDQutC70Y7RhyDQv9C+0LQg0LjRgdGF0L7QtNC90L7QtSDRgdC+0YHRgtC+0Y/QvdC40LUgKNC90LAg0YHQu9GD0YfQsNC5INGB0L/QtdGG0LjRhNC40YfQvdGL0YUg0L/QtdGA0LXQstC+0LTQvtCyKS5cclxuXHRcdGNvbnN0IGV4YWN0S2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtyYXd9YDtcclxuXHRcdGlmICh0eXBlb2YgZ2xvYmFsVHJhbnNsYXRlICE9PSAndW5kZWZpbmVkJyAmJiBnbG9iYWxUcmFuc2xhdGVbZXhhY3RLZXldKSB7XHJcblx0XHRcdHJldHVybiBnbG9iYWxUcmFuc2xhdGVbZXhhY3RLZXldO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgY2Fub24gPSBzZWxmLmNhbm9uU3RhdGUocmF3KTtcclxuXHRcdGNvbnN0IGNhbm9uS2V5ID0gYG1vZF9jdGlfc3RhdGVfJHtjYW5vbn1gO1xyXG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUcmFuc2xhdGUgIT09ICd1bmRlZmluZWQnICYmIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV0pIHtcclxuXHRcdFx0cmV0dXJuIGdsb2JhbFRyYW5zbGF0ZVtjYW5vbktleV07XHJcblx0XHR9XHJcblx0XHRjb25zdCBmYWxsYmFjayA9IHtcclxuXHRcdFx0b2s6ICdPSycsXHJcblx0XHRcdGF1dGhlbnRpY2F0ZWQ6ICdBdXRoZW50aWNhdGVkJyxcclxuXHRcdFx0Y29ubmVjdGVkOiAnQ29ubmVjdGVkIHRvIDFDJyxcclxuXHRcdFx0d2FpdGluZ18xYzogJ1dhaXRpbmcgZm9yIDFDIHRvIGNvbm5lY3QnLFxyXG5cdFx0XHRjb25uZWN0aW5nXzFjOiAnQ29ubmVjdGluZyB0byAxQ+KApicsXHJcblx0XHRcdGVycm9yOiAnRXJyb3InLFxyXG5cdFx0XHR1bmtub3duOiAnVW5rbm93bicsXHJcblx0XHRcdHBlbmRpbmc6ICdQZW5kaW5nJyxcclxuXHRcdFx0c3RhcnRpbmc6ICdTdGFydGluZycsXHJcblx0XHRcdHFyY29kZTogJ0F3YWl0aW5nIFFSLWNvZGUgYXV0aG9yaXphdGlvbicsXHJcblx0XHRcdHJlYXV0aDogJ0F1dGhvcml6YXRpb24gcmVxdWlyZWQnLFxyXG5cdFx0fTtcclxuXHRcdHJldHVybiBmYWxsYmFja1tjYW5vbl0gfHwgcmF3O1xyXG5cdH0sXHJcblxyXG5cdC8qKlxyXG5cdCAqINCa0L7RgNC+0YLQutC+0LUg0L/RgNC10LTRgdGC0LDQstC70LXQvdC40LUgYXJlYS1HVUlEIOKAlCDQv9C10YDQstGL0LUgOCDRgdC40LzQstC+0LvQvtCyLlxyXG5cdCAqXHJcblx0ICogQHBhcmFtIHtzdHJpbmd9IGFyZWFcclxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxyXG5cdCAqL1xyXG5cdHNob3J0QXJlYShhcmVhKSB7XHJcblx0XHRpZiAodHlwZW9mIGFyZWEgIT09ICdzdHJpbmcnIHx8IGFyZWEubGVuZ3RoID09PSAwKSB7XHJcblx0XHRcdHJldHVybiAnJztcclxuXHRcdH1cclxuXHRcdGlmIChhcmVhLmxlbmd0aCA8PSAxMikge1xyXG5cdFx0XHRyZXR1cm4gYXJlYTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBgJHthcmVhLnN1YnN0cmluZygwLCA4KX3igKZgO1xyXG5cdH0sXHJcblxyXG5cdC8qKlxyXG5cdCAqINCj0YHQtdGH0LXQvdC40LUg0YHRgtGA0L7QutC4LlxyXG5cdCAqXHJcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0clxyXG5cdCAqIEBwYXJhbSB7bnVtYmVyfSBtYXhcclxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxyXG5cdCAqL1xyXG5cdHRydW5jYXRlKHN0ciwgbWF4KSB7XHJcblx0XHRpZiAodHlwZW9mIHN0ciAhPT0gJ3N0cmluZycpIHtcclxuXHRcdFx0cmV0dXJuICcnO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHN0ci5sZW5ndGggPD0gbWF4KSB7XHJcblx0XHRcdHJldHVybiBzdHI7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gYCR7c3RyLnN1YnN0cmluZygwLCBtYXgpfeKApmA7XHJcblx0fSxcclxuXHJcblx0LyoqXHJcblx0ICog0JHQtdC30L7Qv9Cw0YHQvdGL0Lkg0Y3QutGA0LDQvdC10YAgSFRNTC5cclxuXHQgKlxyXG5cdCAqIEBwYXJhbSB7Kn0gdmFsdWVcclxuXHQgKiBAcmV0dXJucyB7c3RyaW5nfVxyXG5cdCAqL1xyXG5cdGVzY2FwZUh0bWwodmFsdWUpIHtcclxuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XHJcblx0XHRcdHJldHVybiAnJztcclxuXHRcdH1cclxuXHRcdHJldHVybiBTdHJpbmcodmFsdWUpXHJcblx0XHRcdC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcblx0XHRcdC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuXHRcdFx0LnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXHJcblx0XHRcdC5yZXBsYWNlKC8nL2csICcmIzM5OycpO1xyXG5cdH0sXHJcblxyXG5cdC8qKlxyXG5cdCAqINCe0LHQvdC+0LLQu9C10L3QuNC1INC+0LHRidC10LPQviDRgdGC0LDRgtGD0YHQsCDQvNC+0LTRg9C70Y8g4oCUINGB0YLRgNC+0LrQsC3RgdCy0L7QtNC60LAg0LLQstC10YDRhdGDINCy0LrQu9Cw0LTQutC4IMKr0KHRgtCw0YLRg9GBwrtcclxuXHQgKiAo0LfQsNC80LXQvdC40LvQsCDQv9GA0LXQttC90LjQuSDRg9Cz0LvQvtCy0L7QuSDQsdC10LnQtNC2ICNzdGF0dXMpLiDQoNC40YHRg9C10YIg0YbQstC10YLQvdGD0Y4g0LvQsNC80L/QvtGH0LrRgyArINGC0LXQutGB0YI7XHJcblx0ICog0LTQu9GPINC60YDQsNGB0L3QvtCz0L4g0YHQvtGB0YLQvtGP0L3QuNGPINC80L7QttC10YIg0J3QkNCX0JLQkNCi0Kwg0LrQvtC90LrRgNC10YLQvdGL0LUg0L/RgNC+0LHQu9C10LzQvdGL0LUg0YHQtdGA0LLQuNGB0YssINCwINC00LvRj1xyXG5cdCAqINC/0YDQvtCz0YDQtdGB0YHQsCDigJQg0L/QvtC60LDQt9Cw0YLRjCDQuNGFINC60L7Qu9C40YfQtdGB0YLQstC+LlxyXG5cdCAqXHJcblx0ICogQHBhcmFtIHtzdHJpbmd9IHN0YXR1cyDQutC70Y7RhyDRgdC+0YHRgtC+0Y/QvdC40Y9cclxuXHQgKiBAcGFyYW0ge3tuYW1lcz86IHN0cmluZ1tdLCBjb3VudD86IG51bWJlcn19IFtpbmZvXSDQtNC+0L8uINC00LDQvdC90YvQtSDQtNC70Y8g0YLQtdC60YHRgtCwXHJcblx0ICovXHJcblx0Y2hhbmdlU3RhdHVzKHN0YXR1cywgaW5mbykge1xyXG5cdFx0Y29uc3Qgc2VsZiA9IG1vZHVsZUNUSUNsaWVudENvbm5lY3Rpb25DaGVja1dvcmtlcjtcclxuXHRcdGNvbnN0ICRzID0gc2VsZi4kbW9kdWxlU3RhdHVzO1xyXG5cdFx0aWYgKCEkcyB8fCAkcy5sZW5ndGggPT09IDApIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgZGF0YSA9IGluZm8gfHwge307XHJcblx0XHRjb25zdCBlc2MgPSBzZWxmLmVzY2FwZUh0bWw7XHJcblx0XHRjb25zdCBzcGlubmVyID0gJzxpIGNsYXNzPVwic3Bpbm5lciBsb2FkaW5nIGljb25cIj48L2k+JztcclxuXHRcdGNvbnN0IHRyID0gKGtleSwgZmFsbGJhY2spID0+IHNlbGYudHIoa2V5LCBmYWxsYmFjayk7XHJcblxyXG5cdFx0bGV0IGNscyA9ICdjdGktc3VtbWFyeS1ncmV5JztcclxuXHRcdGxldCBsZWQgPSAndW5rbm93bic7XHJcblx0XHRsZXQgaWNvbiA9ICcnO1xyXG5cdFx0bGV0IHRleHQgPSAnJztcclxuXHJcblx0XHRzd2l0Y2ggKHN0YXR1cykge1xyXG5cdFx0XHRjYXNlICdDb25uZWN0ZWQnOlxyXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS1ncmVlbic7XHJcblx0XHRcdFx0bGVkID0gJ29rJztcclxuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGVkJywgJ1RoZSBtb2R1bGUgd29ya3Mgc3VjY2Vzc2Z1bGx5Jyk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGNhc2UgJ0Nvbm5lY3Rpb25Qcm9ncmVzcyc6IHtcclxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93JztcclxuXHRcdFx0XHRsZWQgPSAnd2Fybic7XHJcblx0XHRcdFx0aWNvbiA9IHNwaW5uZXI7XHJcblx0XHRcdFx0bGV0IHByb2dyZXNzID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvblByb2dyZXNzJywgJ01vZHVsZSBzZXJ2aWNlcyBhcmUgc3RhcnRpbmcnKTtcclxuXHRcdFx0XHRpZiAoZGF0YS5jb3VudCAmJiBkYXRhLmNvdW50ID4gMCkge1xyXG5cdFx0XHRcdFx0cHJvZ3Jlc3MgKz0gYCAoJHtkYXRhLmNvdW50fSlgO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHR0ZXh0ID0gcHJvZ3Jlc3M7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvblRvMUNXYWl0aW5nJzpcclxuXHRcdFx0XHQvLyBsb25ncG9vbDogMUMgY29ubmVjdHMgdG8gdXM7IHdlIGFyZSB3YWl0aW5nIGZvciBpdC5cclxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnkteWVsbG93JztcclxuXHRcdFx0XHRsZWQgPSAnd2Fybic7XHJcblx0XHRcdFx0aWNvbiA9IHNwaW5uZXI7XHJcblx0XHRcdFx0dGV4dCA9IHRyKCdtb2RfY3RpX3N0YXRlX3dhaXRpbmdfMWMnLCAnV2FpdGluZyBmb3IgMUMgdG8gY29ubmVjdCcpO1xyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlICdDb25uZWN0aW9uVG8xQ0Nvbm5lY3RpbmcnOlxyXG5cdFx0XHRcdC8vIHdlYnNlcnZpY2U6IHdlIGFyZSByZWFjaGluZyBvdXQgdG8gMUMuXHJcblx0XHRcdFx0Y2xzID0gJ2N0aS1zdW1tYXJ5LXllbGxvdyc7XHJcblx0XHRcdFx0bGVkID0gJ3dhcm4nO1xyXG5cdFx0XHRcdGljb24gPSBzcGlubmVyO1xyXG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9zdGF0ZV9jb25uZWN0aW5nXzFjJywgJ0Nvbm5lY3RpbmcgdG8gMUPigKYnKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0Y2FzZSAnQ29ubmVjdGlvbkVycm9yJzoge1xyXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS1yZWQnO1xyXG5cdFx0XHRcdGxlZCA9ICdlcnJvcic7XHJcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBBcnJheS5pc0FycmF5KGRhdGEubmFtZXMpID8gZGF0YS5uYW1lcy5maWx0ZXIoQm9vbGVhbikgOiBbXTtcclxuXHRcdFx0XHRpZiAobmFtZXMubGVuZ3RoID4gMCkge1xyXG5cdFx0XHRcdFx0dGV4dCA9IGAke3RyKCdtb2RfY3RpX1N0YXR1c1Byb2JsZW0nLCAnUHJvYmxlbScpfTogJHtuYW1lcy5qb2luKCcsICcpfWA7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9Db25uZWN0aW9uRXJyb3InLCAnRmFpbHVyZScpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0fVxyXG5cdFx0XHRjYXNlICdUbHNOb3RTdGFydGVkJzpcclxuXHRcdFx0XHQvLyBQbGFpbiwgZmluYWwgc3RhdGU6IG5vIHNwaW5uZXIsIG5leHQgc3RlcCBpcyBvbiB0aGUgU2V0dGluZ3MgdGFiLlxyXG5cdFx0XHRcdGNscyA9ICdjdGktc3VtbWFyeS15ZWxsb3cnO1xyXG5cdFx0XHRcdGxlZCA9ICd3YXJuJztcclxuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfU3RhdHVzVGxzTm90U3RhcnRlZCcsICdOb3Qgc3RhcnRlZDogdGhlIENUSSBjZXJ0aWZpY2F0ZSBzZXR1cCBpcyBpbmNvbXBsZXRlJyk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGNhc2UgJ0Rpc2FibGVkJzpcclxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XHJcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xyXG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9TdGF0dXNNb2R1bGVEaXNhYmxlZCcsICdNb2R1bGUgaXMgZGlzYWJsZWQnKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0Y2FzZSAnRGlzY29ubmVjdGVkJzpcclxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XHJcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xyXG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9EaXNjb25uZWN0ZWQnLCAnRGlzY29ubmVjdGVkJyk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGNhc2UgJ1VwZGF0aW5nJzpcclxuXHRcdFx0XHRjbHMgPSAnY3RpLXN1bW1hcnktZ3JleSc7XHJcblx0XHRcdFx0bGVkID0gJ3Vua25vd24nO1xyXG5cdFx0XHRcdGljb24gPSBzcGlubmVyO1xyXG5cdFx0XHRcdHRleHQgPSB0cignbW9kX2N0aV9VcGRhdGVTdGF0dXMnLCAnVXBkYXRpbmcgc3RhdHVz4oCmJyk7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0Y2xzID0gJ2N0aS1zdW1tYXJ5LXJlZCc7XHJcblx0XHRcdFx0bGVkID0gJ2Vycm9yJztcclxuXHRcdFx0XHR0ZXh0ID0gdHIoJ21vZF9jdGlfQ29ubmVjdGlvbkVycm9yJywgJ0ZhaWx1cmUnKTtcclxuXHRcdFx0XHRicmVhaztcclxuXHRcdH1cclxuXHJcblx0XHQkc1xyXG5cdFx0XHQucmVtb3ZlQ2xhc3MoJ2N0aS1zdW1tYXJ5LWdyZXkgY3RpLXN1bW1hcnktZ3JlZW4gY3RpLXN1bW1hcnkteWVsbG93IGN0aS1zdW1tYXJ5LXJlZCcpXHJcblx0XHRcdC5hZGRDbGFzcyhjbHMpXHJcblx0XHRcdC5odG1sKGA8c3BhbiBjbGFzcz1cImN0aS1zdW1tYXJ5LWxlZCAke2VzYyhsZWQpfVwiPjwvc3Bhbj5gXHJcblx0XHRcdFx0KyBgPHNwYW4gY2xhc3M9XCJjdGktc3VtbWFyeS10ZXh0XCI+JHtpY29ufSR7ZXNjKHRleHQpfTwvc3Bhbj5gKTtcclxuXHR9LFxyXG59O1xyXG4iXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLElBQU1BLG9DQUFvQyxHQUFHO0VBQzVDQyxRQUFRLEVBQUVDLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQztFQUN0Q0MsYUFBYSxFQUFFRCxDQUFDLENBQUMsdUJBQXVCLENBQUM7RUFDekNFLGlCQUFpQixFQUFFRixDQUFDLENBQUMsMEJBQTBCLENBQUM7RUFDaERHLFlBQVksRUFBRUgsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO0VBQ3JDSSxhQUFhLEVBQUVKLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztFQUN2Q0ssYUFBYSxFQUFFTCxDQUFDLENBQUMsZUFB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
