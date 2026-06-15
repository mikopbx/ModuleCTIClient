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
const moduleCTIClientConnectionCheckWorker = {
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
		warning: 'warn',
	},

	/**
	 * Сервисы, которые могут идти в нескольких инстансах с разным area.
	 */
	multiInstanceServices: {
		chats: true,
		tg: true,
		max: true,
	},

	initialize() {
		moduleCTIClientConnectionCheckWorker.restartWorker();
	},

	restartWorker() {
		moduleCTIClientConnectionCheckWorker.errorCounts = 0;
		moduleCTIClientConnectionCheckWorker.changeStatus('Updating');
		window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeOutHandle);
		moduleCTIClientConnectionCheckWorker.worker();
	},

	worker() {
		if (moduleCTIClientConnectionCheckWorker.$statusToggle.checkbox('is checked')) {
			$.api({
				url: `${Config.pbxUrl}/pbxcore/api/modules/ModuleCTIClient/check`,
				on: 'now',
				successTest: PbxApi.successTest,
				onComplete() {
					moduleCTIClientConnectionCheckWorker.timeOutHandle = window.setTimeout(
						moduleCTIClientConnectionCheckWorker.worker,
						moduleCTIClientConnectionCheckWorker.timeOut,
					);
				},
				onResponse(response) {
					$('.message.ajax').remove();
					if (typeof (response.data) === 'undefined') {
						moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(null);
						return;
					}

					// Render services status panel for both success and partial responses.
					moduleCTIClientConnectionCheckWorker.renderServicesStatus(response.data);
					moduleCTIClientConnectionCheckWorker.notifyRemoteMigrationLock(response.data);

					// Debug JSON pane (legacy debug tab).
					let visualErrorString = JSON.stringify(response.data, null, 2);
					if (typeof visualErrorString === 'string') {
						visualErrorString = visualErrorString.replace(/\n/g, '<br/>');
						if (Object.keys(response).length > 0 && response.result === true) {
							moduleCTIClientConnectionCheckWorker.$debugInfo
								.after(`<div class="ui message ajax">
									<pre style='white-space: pre-wrap'> ${visualErrorString}</pre>
								</div>`);
						} else {
							moduleCTIClientConnectionCheckWorker.$debugInfo
								.after(`<div class="ui message ajax">
									<i class="spinner loading icon"></i>
									<pre style='white-space: pre-wrap'>${visualErrorString}</pre>
								</div>`);
						}
					}
				},
				onSuccess() {
					moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
					moduleCTIClientConnectionCheckWorker.errorCounts = 0;
					window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeOutHandle);
				},
				onFailure(response) {
					moduleCTIClientConnectionCheckWorker.errorCounts += 1;
					const data = (response && response.data) ? response.data : null;
					const statuses = (data && Array.isArray(data.statuses))
						? data.statuses : null;
					if (!statuses) {
						moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
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
					const self = moduleCTIClientConnectionCheckWorker;
					let crm1c = null;
					let hasError = false;
					let hasStarting = false;
					const errNames = {};
					const startNames = {};
					statuses.forEach((s) => {
						if (!s || typeof s.name === 'undefined') return;
						if (s.name === 'crm-1c') crm1c = s.state;
						if (s.state === 'error' || s.state === 'fail' || s.state === 'failed'
							|| s.state === 'down' || s.state === 'stopped') {
							hasError = true;
							errNames[self.serviceLabel(s.name)] = true;
						}
						if (s.state === 'starting' || s.state === 'pending'
							|| s.state === 'unknown') {
							hasStarting = true;
							startNames[self.serviceLabel(s.name)] = true;
						}
					});
					const errorList = Object.keys(errNames);
					const startList = Object.keys(startNames);
					// Severity order: a genuine red failure (incl. a crm-1c bridge
					// daemon that is actually down — it stays 'error') wins the
					// headline so it is never masked by a calmer message. Then the
					// 1C bridge's mode-aware "no live session yet" states (from
					// refineCrmStatus: connecting_1c / waiting_1c) — always a calm
					// yellow, never red. Then generic startup progress.
					if (hasError) {
						self.changeStatus('ConnectionError', { names: errorList });
					} else if (crm1c === 'waiting_1c') {
						self.changeStatus('ConnectionTo1CWaiting');
					} else if (crm1c === 'connecting_1c') {
						self.changeStatus('ConnectionTo1CConnecting');
					} else if (hasStarting) {
						// Still starting: show progress until we give up after 10
						// failed polls, then treat the stuck daemon as an error
						// instead of falsely reporting it as Connected.
						if (self.errorCounts < 10) {
							self.changeStatus('ConnectionProgress', { count: startList.length });
						} else {
							self.changeStatus('ConnectionError', { names: startList });
						}
					} else {
						self.changeStatus('Connected');
					}
				},
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
	notifyRemoteMigrationLock(data) {
		const active = data && data.remote_migration_active === true;
		const services = (data && Array.isArray(data.remote_migration_services))
			? data.remote_migration_services : [];
		window.dispatchEvent(new CustomEvent('RemoteMigrationLockChanged', {
			detail: {
				active,
				services,
			},
		}));
	},

	/**
	 * Сообщение в панели статусов, когда модуль выключен.
	 */
	renderDisabledPanel() {
		const self = moduleCTIClientConnectionCheckWorker;
		const $panel = self.$servicesStatus;
		if (!$panel || $panel.length === 0) {
			return;
		}
		const label = (typeof globalTranslate !== 'undefined'
			&& globalTranslate.mod_cti_StatusModuleDisabled)
			? globalTranslate.mod_cti_StatusModuleDisabled
			: 'Module is disabled';
		// Don't replace the panel's innerHTML: that destroys #cti-services-status-rows
		// and #cti-services-status-placeholder, so a later re-enable WITHOUT a page
		// reload would leave renderServicesStatus() writing into an empty selection
		// and the table would never come back. Reuse the placeholder instead,
		// mirroring renderServicesStatus()'s showPlaceholder, so the structure
		// survives. Fall back to replacing the panel only if the skeleton is absent.
		const $rows = $('#cti-services-status-rows');
		const $placeholder = $('#cti-services-status-placeholder');
		self.lastRenderHash = '';
		if ($rows.length > 0) {
			$rows.empty();
		}
		if ($placeholder.length > 0) {
			$placeholder.html(`<span>&nbsp;${self.escapeHtml(label)}</span>`).show();
		} else {
			$panel.html(`<div class="ui basic segment">${self.escapeHtml(label)}</div>`);
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
	renderServicesStatus(data) {
		const self = moduleCTIClientConnectionCheckWorker;
		const $panel = self.$servicesStatus;
		if (!$panel || $panel.length === 0) {
			return;
		}

		const esc = self.escapeHtml;
		const $rows = $('#cti-services-status-rows');
		const $placeholder = $('#cti-services-status-placeholder');
		const showPlaceholder = (text) => {
			self.lastRenderHash = '';
			$rows.empty();
			if ($placeholder.length > 0) {
				$placeholder.html(`<span>&nbsp;${esc(text)}</span>`).show();
			} else {
				$panel.html(`<div class="ui basic segment">${esc(text)}</div>`);
			}
		};

		const statuses = (data && data.statuses) ? data.statuses : null;

		// Phase C: per-service failback eligibility + warm-standby mirror age.
		self.remoteFailback = (data && data.remote_failback && typeof data.remote_failback === 'object')
			? data.remote_failback : {};

		// Бэк может вернуть строку 'Module disabled' вместо массива.
		if (!Array.isArray(statuses)) {
			const text = (typeof statuses === 'string')
				? statuses
				: self.tr('mod_cti_StatusUnavailable', 'Status unavailable');
			showPlaceholder(text);
			return;
		}

		// Пропускаем перерисовку DOM, если данные не изменились — убирает
		// мерцание таблицы при опросе раз в 3 секунды. Включаем remoteFailback в
		// хэш, иначе появление кнопки/обновление возраста копии не перерисуется.
		const hash = JSON.stringify({ s: statuses, f: self.remoteFailback });
		if (hash === self.lastRenderHash && $rows.children().length > 0) {
			if ($placeholder.length > 0) {
				$placeholder.hide();
			}
			return;
		}

		// Группируем по имени сервиса. Внутри группы — строки по area (каналы).
		const groups = {};
		const order = [];
		statuses.forEach((svc) => {
			if (!svc || typeof svc !== 'object') {
				return;
			}
			const name = (typeof svc.name === 'string' && svc.name.length > 0) ? svc.name : 'unknown';
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
		const hasRemote = statuses.some((s) => s && s.location === 'remote');
		const colCount = hasRemote ? 5 : 4;

		const head = '<thead><tr>'
			+ `<th class="cti-col-status">${esc(self.tr('mod_cti_colStatus', 'Status'))}</th>`
			+ `<th class="cti-col-name">${esc(self.tr('mod_cti_colService', 'Service'))}</th>`
			+ (hasRemote ? `<th class="cti-col-loc">${esc(self.tr('mod_cti_colLocation', 'Location'))}</th>` : '')
			+ `<th class="cti-col-uptime">${esc(self.tr('mod_cti_colUptime', 'Uptime'))}</th>`
			+ `<th class="cti-col-version">${esc(self.tr('mod_cti_colVersion', 'Version'))}</th>`
			+ '</tr></thead>';

		const body = [];
		order.forEach((name) => {
			const rows = groups[name];
			const isMulti = self.multiInstanceServices[name] === true || rows.length > 1;
			if (isMulti) {
				body.push(`<tr class="cti-svc-group"><td colspan="${colCount}">`
					+ `<i class="comments icon"></i>${esc(self.serviceLabel(name))}`
					+ `<span class="cti-svc-count">${rows.length}</span></td></tr>`);
				rows.forEach((svc) => {
					body.push(self.renderServiceRow(svc, true, hasRemote));
				});
			} else {
				body.push(self.renderServiceRow(rows[0], false, hasRemote));
			}
			// Phase C: offer "bring back to local" once per service group whose
			// channels still live on the VPS (derive the base svc from a
			// "chats.<area>" group name).
			const svcKey = name.indexOf('.') >= 0 ? name.split('.')[0] : name;
			const fbRow = self.failbackControlRow(svcKey, colCount);
			if (fbRow !== '') {
				body.push(fbRow);
			}
		});

		$rows.html('<table class="ui celled striped compact unstackable table cti-status-table">'
			+ head + '<tbody>' + body.join('') + '</tbody></table>');
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
	renderServiceRow(svc, grouped, hasRemote) {
		const self = moduleCTIClientConnectionCheckWorker;
		const esc = self.escapeHtml;
		const colCount = hasRemote ? 5 : 4;

		const stateRaw = (typeof svc.state === 'string' && svc.state.length > 0) ? svc.state : 'unknown';
		const canon = self.canonState(stateRaw);
		const ledClass = self.stateLedClass[canon] || 'warn';
		const stateText = self.stateText(stateRaw);

		const displayName = grouped
			? self.shortArea(svc.area)
			: self.serviceLabel(svc.name);
		const nameIcon = grouped ? '<i class="hashtag icon"></i>' : '';

		const uptime = (typeof svc.uptime === 'string' && svc.uptime.length > 0) ? svc.uptime : '';
		const version = (typeof svc.version === 'string' && svc.version.length > 0) ? svc.version : '';
		const lastError = (typeof svc.last_error === 'string' && svc.last_error.length > 0) ? svc.last_error : '';
		const dash = '<span class="cti-dim">—</span>';

		const statusCell = `<span class="cti-svc-led ${esc(ledClass)}" title="${esc(stateRaw)}"></span>`
			+ `<span class="cti-svc-state">${esc(stateText)}</span>`;

		const nameCell = `<span class="cti-svc-name${grouped ? ' cti-svc-channel' : ''}">${nameIcon}${esc(displayName)}</span>`;

		const locCell = hasRemote ? `<td class="cti-col-loc">${self.locationBadge(svc.location)}</td>` : '';

		const cells = `<td class="cti-col-status">${statusCell}</td>`
			+ `<td class="cti-col-name">${nameCell}</td>`
			+ locCell
			+ `<td class="cti-col-uptime">${uptime !== '' ? esc(uptime) : dash}</td>`
			+ `<td class="cti-col-version">${version !== '' ? esc(version) : dash}</td>`;

		let html = `<tr class="cti-svc-row${grouped ? ' cti-svc-subrow' : ''}"`
			+ ` data-svc="${esc(svc.name || '')}" data-area="${esc(svc.area || '')}">${cells}</tr>`;

		// last_error from monitord is sticky ("last error ever seen") and is NOT
		// cleared on recovery — it stays in the API payload on purpose (handy for
		// debugging). Surface it to the operator ONLY when the service is actually
		// in a red error state. A recovered glitch (state=ok) or a service still
		// starting/warming up (state=starting -> warn LED, incl. the startup grace
		// window) must NOT print stale error text — otherwise we'd be reporting a
		// service failure in the first minute, which is exactly what we suppress.
		if (lastError !== '' && ledClass === 'error') {
			html += `<tr class="cti-svc-error-row"><td colspan="${colCount}">`
				+ `<i class="exclamation triangle icon"></i>`
				+ `<span title="${esc(lastError)}">${esc(self.truncate(lastError, 200))}</span>`
				+ '</td></tr>';
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
	failbackControlRow(svc, colCount) {
		const self = moduleCTIClientConnectionCheckWorker;
		const esc = self.escapeHtml;
		const info = self.remoteFailback ? self.remoteFailback[svc] : null;
		if (!info || info.can_failback !== true) {
			return '';
		}
		const label = self.tr('mod_cti_FailbackToLocal', 'Bring back to local');
		const age = self.mirrorAgeText(info.last_mirror_ts);
		return `<tr class="cti-failback-row"><td colspan="${colCount}">`
			+ `<button class="ui tiny basic orange button cti-failback-btn" data-svc="${esc(svc)}">`
			+ `<i class="reply icon"></i>${esc(label)}</button>`
			+ `<span class="cti-failback-age">${esc(age)}</span>`
			+ '</td></tr>';
	},

	/**
	 * Phase C: человекочитаемый возраст локальной копии сессии (warm-standby
	 * mirror). ts — unix-секунды; 0/пусто => «копии ещё нет».
	 *
	 * @param {number} ts
	 * @returns {string}
	 */
	mirrorAgeText(ts) {
		const self = moduleCTIClientConnectionCheckWorker;
		const n = parseInt(ts, 10);
		if (!n || n <= 0) {
			return self.tr('mod_cti_MirrorNever', 'local copy: none yet');
		}
		const secs = Math.max(0, Math.floor(Date.now() / 1000) - n);
		let human;
		if (secs < 90) {
			human = `${secs}s`;
		} else if (secs < 5400) {
			human = `${Math.round(secs / 60)}m`;
		} else {
			human = `${Math.round(secs / 3600)}h`;
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
	locationBadge(location) {
		const self = moduleCTIClientConnectionCheckWorker;
		const esc = self.escapeHtml;
		if (location === 'remote') {
			return `<span class="ui teal label cti-loc-badge"><i class="cloud icon"></i>`
				+ `${esc(self.tr('mod_cti_LocationRemote', 'VPS'))}</span>`;
		}
		if (location === 'local') {
			return `<span class="cti-loc-local"><i class="home icon"></i>`
				+ `${esc(self.tr('mod_cti_LocationLocal', 'Local'))}</span>`;
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
	canonState(state) {
		const s = String(state || '').toLowerCase();
		if (s === '') {
			return 'unknown';
		}
		if (s.indexOf('qr') !== -1) {
			return 'qrcode';
		}
		if (s.indexOf('awaiting') !== -1 || s.indexOf('reauth') !== -1
			|| s.indexOf('auth_required') !== -1 || s.indexOf('2fa') !== -1) {
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
	tr(key, fallback) {
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
	serviceLabel(name) {
		const map = {
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
			'remote-tunnel': 'mod_cti_svc_remote_tunnel',
		};
		const key = map[name];
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
	stateText(state) {
		const self = moduleCTIClientConnectionCheckWorker;
		const raw = String(state || '');
		// Точный ключ под исходное состояние (на случай специфичных переводов).
		const exactKey = `mod_cti_state_${raw}`;
		if (typeof globalTranslate !== 'undefined' && globalTranslate[exactKey]) {
			return globalTranslate[exactKey];
		}
		const canon = self.canonState(raw);
		const canonKey = `mod_cti_state_${canon}`;
		if (typeof globalTranslate !== 'undefined' && globalTranslate[canonKey]) {
			return globalTranslate[canonKey];
		}
		const fallback = {
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
			reauth: 'Authorization required',
		};
		return fallback[canon] || raw;
	},

	/**
	 * Короткое представление area-GUID — первые 8 символов.
	 *
	 * @param {string} area
	 * @returns {string}
	 */
	shortArea(area) {
		if (typeof area !== 'string' || area.length === 0) {
			return '';
		}
		if (area.length <= 12) {
			return area;
		}
		return `${area.substring(0, 8)}…`;
	},

	/**
	 * Усечение строки.
	 *
	 * @param {string} str
	 * @param {number} max
	 * @returns {string}
	 */
	truncate(str, max) {
		if (typeof str !== 'string') {
			return '';
		}
		if (str.length <= max) {
			return str;
		}
		return `${str.substring(0, max)}…`;
	},

	/**
	 * Безопасный экранер HTML.
	 *
	 * @param {*} value
	 * @returns {string}
	 */
	escapeHtml(value) {
		if (value === null || typeof value === 'undefined') {
			return '';
		}
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
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
	changeStatus(status, info) {
		const self = moduleCTIClientConnectionCheckWorker;
		const $s = self.$moduleStatus;
		if (!$s || $s.length === 0) {
			return;
		}
		const data = info || {};
		const esc = self.escapeHtml;
		const spinner = '<i class="spinner loading icon"></i>';
		const tr = (key, fallback) => self.tr(key, fallback);

		let cls = 'cti-summary-grey';
		let led = 'unknown';
		let icon = '';
		let text = '';

		switch (status) {
			case 'Connected':
				cls = 'cti-summary-green';
				led = 'ok';
				text = tr('mod_cti_Connected', 'The module works successfully');
				break;
			case 'ConnectionProgress': {
				cls = 'cti-summary-yellow';
				led = 'warn';
				icon = spinner;
				let progress = tr('mod_cti_ConnectionProgress', 'Module services are starting');
				if (data.count && data.count > 0) {
					progress += ` (${data.count})`;
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
			case 'ConnectionError': {
				cls = 'cti-summary-red';
				led = 'error';
				const names = Array.isArray(data.names) ? data.names.filter(Boolean) : [];
				if (names.length > 0) {
					text = `${tr('mod_cti_StatusProblem', 'Problem')}: ${names.join(', ')}`;
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

		$s
			.removeClass('cti-summary-grey cti-summary-green cti-summary-yellow cti-summary-red')
			.addClass(cls)
			.html(`<span class="cti-summary-led ${esc(led)}"></span>`
				+ `<span class="cti-summary-text">${icon}${esc(text)}</span>`);
	},
};
