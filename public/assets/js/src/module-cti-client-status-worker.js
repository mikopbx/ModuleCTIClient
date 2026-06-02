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

	/**
	 * Маппинг state -> CSS-класс лампочки.
	 * Любое неизвестное состояние -> жёлтое (warn).
	 */
	stateLedClass: {
		ok: 'ok',
		error: 'error',
		fail: 'error',
		failed: 'error',
		down: 'error',
		stopped: 'error',
		unknown: 'unknown',
		pending: 'warn',
		starting: 'warn',
		qrcode: 'warn',
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
					} else if (hasStarting && moduleCTIClientConnectionCheckWorker.errorCounts < 10) {
						moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
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
	 * Рендер панели «лампочка + сервис + area + uptime + версия».
	 *
	 * @param {Object} data Ответ API (response.data).
	 */
	renderServicesStatus(data) {
		const $panel = moduleCTIClientConnectionCheckWorker.$servicesStatus;
		if (!$panel || $panel.length === 0) {
			return;
		}

		const $rows = $('#cti-services-status-rows');
		const $placeholder = $('#cti-services-status-placeholder');
		const showPlaceholder = (text) => {
			$rows.empty();
			if ($placeholder.length > 0) {
				$placeholder.html(`<span>&nbsp;${moduleCTIClientConnectionCheckWorker.escapeHtml(text)}</span>`).show();
			} else {
				$panel.html(`<div class="ui basic segment">${moduleCTIClientConnectionCheckWorker.escapeHtml(text)}</div>`);
			}
		};

		const statuses = (data && data.statuses) ? data.statuses : null;

		// Бэк может вернуть строку 'Module disabled' вместо массива.
		if (!Array.isArray(statuses)) {
			const text = (typeof statuses === 'string')
				? statuses
				: ((typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusUnavailable)
					? globalTranslate.mod_cti_StatusUnavailable
					: 'Status unavailable');
			showPlaceholder(text);
			return;
		}

		// Сгруппируем по имени сервиса. Внутри группы — строки по area.
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

		const parts = [];
		order.forEach((name) => {
			const rows = groups[name];
			const isMulti = moduleCTIClientConnectionCheckWorker.multiInstanceServices[name] === true
				|| rows.length > 1;
			if (isMulti) {
				parts.push(`<div class="cti-svc-group-header">${moduleCTIClientConnectionCheckWorker.escapeHtml(
					moduleCTIClientConnectionCheckWorker.serviceLabel(name),
				)}</div>`);
				rows.forEach((svc) => {
					parts.push(moduleCTIClientConnectionCheckWorker.renderServiceRow(svc, true));
				});
			} else {
				parts.push(moduleCTIClientConnectionCheckWorker.renderServiceRow(rows[0], false));
			}
		});

		if (parts.length === 0) {
			const empty = (typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_StatusEmpty)
				? globalTranslate.mod_cti_StatusEmpty
				: 'No services reported';
			showPlaceholder(empty);
			return;
		}

		$rows.html(parts.join(''));
		if ($placeholder.length > 0) {
			$placeholder.hide();
		}
	},

	/**
	 * Рендер одной строки сервиса.
	 *
	 * @param {Object} svc запись из statuses[]
	 * @param {boolean} grouped true если строка идёт под групповым заголовком (multi-instance)
	 * @returns {string} HTML
	 */
	renderServiceRow(svc, grouped) {
		const stateRaw = (typeof svc.state === 'string' && svc.state.length > 0) ? svc.state : 'unknown';
		const ledClass = moduleCTIClientConnectionCheckWorker.stateLedClass[stateRaw] || 'warn';
		const displayName = grouped
			? moduleCTIClientConnectionCheckWorker.shortArea(svc.area)
			: moduleCTIClientConnectionCheckWorker.serviceLabel(svc.name);
		const uptime = (typeof svc.uptime === 'string' && svc.uptime.length > 0) ? svc.uptime : '';
		const version = (typeof svc.version === 'string' && svc.version.length > 0) ? svc.version : '';
		const lastError = (typeof svc.last_error === 'string' && svc.last_error.length > 0) ? svc.last_error : '';

		const uptimeLabel = (typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_Uptime)
			? globalTranslate.mod_cti_Uptime
			: 'Uptime';
		const versionLabel = (typeof globalTranslate !== 'undefined' && globalTranslate.mod_cti_Version)
			? globalTranslate.mod_cti_Version
			: 'Version';

		const esc = moduleCTIClientConnectionCheckWorker.escapeHtml;

		const metaParts = [];
		if (uptime !== '') {
			metaParts.push(`<span class="cti-svc-meta">${esc(uptimeLabel)}: ${esc(uptime)}</span>`);
		}
		if (version !== '') {
			metaParts.push(`<span class="cti-svc-meta">${esc(versionLabel)}: ${esc(version)}</span>`);
		}

		let extra = '';
		if (grouped && svc.area) {
			// area уже в displayName; ничего дополнительно не печатаем.
		} else if (!grouped && typeof svc.area === 'string' && svc.area.length > 0) {
			extra = `<span class="cti-svc-area">${esc(moduleCTIClientConnectionCheckWorker.shortArea(svc.area))}</span>`;
		}

		const errBlock = lastError !== ''
			? `<span class="cti-svc-error" title="${esc(lastError)}">${esc(moduleCTIClientConnectionCheckWorker.truncate(lastError, 120))}</span>`
			: '';

		return `<div class="cti-svc-row" data-svc="${esc(svc.name || '')}" data-area="${esc(svc.area || '')}">`
			+ `<span class="cti-svc-led ${esc(ledClass)}" title="${esc(stateRaw)}"></span>`
			+ `<span class="cti-svc-name">${esc(displayName)}</span>`
			+ extra
			+ metaParts.join(' &middot; ')
			+ errBlock
			+ '</div>';
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
	 * Человекочитаемое представление state.
	 *
	 * @param {string} state
	 * @returns {string}
	 */
	stateText(state) {
		const key = `mod_cti_state_${state}`;
		if (typeof globalTranslate !== 'undefined' && globalTranslate[key]) {
			return globalTranslate[key];
		}
		return state;
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
