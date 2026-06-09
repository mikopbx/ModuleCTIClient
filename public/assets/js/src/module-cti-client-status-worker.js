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
						return;
					}

					// Render services status panel for both success and partial responses.
					moduleCTIClientConnectionCheckWorker.renderServicesStatus(response.data);

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
					const statuses = (response && response.data && Array.isArray(response.data.statuses))
						? response.data.statuses : null;
					if (!statuses) {
						moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
						return;
					}
					// Classify the response by the worst non-system state.
					// crm-1c is special: it's the 1C bridge — its own error label.
					let crm1c = null;
					let hasError = false;
					let hasStarting = false;
					statuses.forEach((s) => {
						if (!s || typeof s.name === 'undefined') return;
						if (s.name === 'crm-1c') crm1c = s.state;
						if (s.state === 'error' || s.state === 'fail' || s.state === 'failed'
							|| s.state === 'down' || s.state === 'stopped') hasError = true;
						if (s.state === 'starting' || s.state === 'pending'
							|| s.state === 'unknown') hasStarting = true;
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
				},
			});
		} else {
			moduleCTIClientConnectionCheckWorker.errorCounts = 0;
			moduleCTIClientConnectionCheckWorker.renderDisabledPanel();
		}
	},

	/**
	 * Сообщение в панели статусов, когда модуль выключен.
	 */
	renderDisabledPanel() {
		const $panel = moduleCTIClientConnectionCheckWorker.$servicesStatus;
		if (!$panel || $panel.length === 0) {
			return;
		}
		const label = (typeof globalTranslate !== 'undefined'
			&& globalTranslate.mod_cti_StatusModuleDisabled)
			? globalTranslate.mod_cti_StatusModuleDisabled
			: 'Module is disabled';
		$panel.html(`<div class="ui basic segment">${moduleCTIClientConnectionCheckWorker.escapeHtml(label)}</div>`);
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

		// Бэк может вернуть строку 'Module disabled' вместо массива.
		if (!Array.isArray(statuses)) {
			const text = (typeof statuses === 'string')
				? statuses
				: self.tr('mod_cti_StatusUnavailable', 'Status unavailable');
			showPlaceholder(text);
			return;
		}

		// Пропускаем перерисовку DOM, если данные не изменились — убирает
		// мерцание таблицы при опросе раз в 3 секунды.
		const hash = JSON.stringify(statuses);
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
		// debugging). But surface it to the operator ONLY while the service is
		// actually unhealthy, so a recovered glitch (state=ok) doesn't keep
		// reading as a current failure on the panel.
		if (lastError !== '' && ledClass !== 'ok') {
			html += `<tr class="cti-svc-error-row"><td colspan="${colCount}">`
				+ `<i class="exclamation triangle icon"></i>`
				+ `<span title="${esc(lastError)}">${esc(self.truncate(lastError, 200))}</span>`
				+ '</td></tr>';
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
	 * Обновление статуса модуля (бейдж в правом верхнем углу).
	 *
	 * @param status
	 */
	changeStatus(status) {
		moduleCTIClientConnectionCheckWorker.$moduleStatus
			.removeClass('grey')
			.removeClass('yellow')
			.removeClass('green')
			.removeClass('red');

		switch (status) {
			case 'Connected':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('green')
					.html(globalTranslate.mod_cti_Connected);
				break;
			case 'Disconnected':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('grey')
					.html(globalTranslate.mod_cti_Disconnected);
				break;
			case 'ConnectionProgress':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('yellow')
					.html(`<i class="spinner loading icon"></i>${globalTranslate.mod_cti_ConnectionProgress}`);
				break;
			case 'ConnectionTo1CWait':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('yellow')
					.html(`<i class="spinner loading icon"></i>${globalTranslate.mod_cti_ConnectionWait}`);
				break;
			case 'ConnectionTo1CError':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('yellow')
					.html(`<i class="spinner loading icon"></i>${globalTranslate.mod_cti_ConnectionTo1CError}`);
				break;
			case 'ConnectionError':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('red')
					.html(`<i class="spinner loading icon"></i>${globalTranslate.mod_cti_ConnectionError}`);
				break;
			case 'Updating':
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('grey')
					.html(`<i class="spinner loading icon"></i>${globalTranslate.mod_cti_UpdateStatus}`);
				break;
			default:
				moduleCTIClientConnectionCheckWorker.$moduleStatus
					.addClass('red')
					.html(globalTranslate.mod_cti_ConnectionError);
				break;
		}
	},
};
