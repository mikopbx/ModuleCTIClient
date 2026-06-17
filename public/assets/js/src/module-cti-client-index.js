/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */

const moduleCTIClient = {
	$wsToggle: $('#web-service-mode-toggle'),
	$wsToggleRadio: $('#module-cti-client-form .web-service-radio'),
	$statusToggle: $('#module-status-toggle'),
	$callerIdSetupToggle: $('#setup-caller-id-toggle'),
	$callerIdTransliterationToggleBlock: $('#transliterate-caller-id-toggle-block'),
	$formObj: $('#module-cti-client-form'),
	$moduleStatus: $('#cti-status-summary'),
	$remoteMigrationLockMessage: $('#cti-remote-migration-lock-message'),
	$debugToggle: $('#debug-mode-toggle'),
	$autoSettingsToggle: $('#auto-settings-mode-toggle'),
	$onlyAutoSettingsVisible: $('#module-cti-client-form .only-auto-settings'),
	$onlyManualSettingsVisible: $('#module-cti-client-form .only-manual-settings'),
	$wsOnlyFields: $('.ws-only'),
	$dirrtyField: $('#dirrty'),
	$sslModeSelect: $('.server1c_scheme select'),
	$debugTab: $('#module-cti-client-tabs .item[data-tab="debug"]'),
	remoteMigrationLocked: false,
	remoteMigrationLockServices: [],
	remoteMigrationLockListenerBound: false,
	remoteProtectedFieldIds: [
		'remote_host',
		'remote_ssh_port',
		'remote_ssh_login',
		'remote_ssh_key',
		'remote_bin_dir',
	],
	remoteToggleFieldIds: ['remote_whatsapp', 'remote_telegram', 'remote_max'],
	remoteServiceLabelKeys: {
		chats: 'mod_cti_svc_chats',
		tg: 'mod_cti_svc_tg',
		max: 'mod_cti_svc_max',
	},
	validateRules: {
		server1chost: {
			identifier: 'server1chost',
			rules: [
				{
					type: 'emptyCustomRule',
					prompt: globalTranslate.mod_cti_ValidateServer1CHostEmpty,
				},
			],
		},
		server1cport: {
			identifier: 'server1cport',
			rules: [
				{
					type: 'wrongPortCustomRule',
					prompt: globalTranslate.mod_cti_ValidateServer1CPortRange,
				},
			],
		},
		database: {
			identifier: 'database',
			rules: [
				{
					type: 'emptyCustomRule',
					prompt: globalTranslate.mod_cti_ValidatePubName,
				},
			],
		},
	},
	initialize() {
		$('#module-cti-client-form .item').tab();
		if (moduleCTIClient.$debugToggle.checkbox('is unchecked')){
			moduleCTIClient.$debugTab.hide()
		}
		moduleCTIClient.$debugToggle
			.checkbox({
				onChecked() {
					moduleCTIClient.$debugTab.show()
				},
				onUnchecked() {
					moduleCTIClient.$debugTab.hide()
				},
			});


		moduleCTIClient.$callerIdSetupToggle
			.checkbox({
				onChange: moduleCTIClient.setCallerIdToggle
			});


		if (moduleCTIClient.$autoSettingsToggle.checkbox('is checked')){
			moduleCTIClient.$onlyManualSettingsVisible.hide();
		} else {
			moduleCTIClient.$onlyAutoSettingsVisible.hide();
		}
		moduleCTIClient.$autoSettingsToggle
			.checkbox({
				onChecked() {
					moduleCTIClient.$onlyAutoSettingsVisible.show();
					moduleCTIClient.$onlyManualSettingsVisible.hide();
					moduleCTIClient.$dirrtyField.val(Math.random());
					moduleCTIClient.$dirrtyField.trigger('change');
					Form.validateRules = {};
				},
				onUnchecked() {
					moduleCTIClient.$dirrtyField.val(Math.random());
					moduleCTIClient.$dirrtyField.trigger('change');
					moduleCTIClient.$onlyAutoSettingsVisible.hide();
					moduleCTIClient.$onlyManualSettingsVisible.show();
					Form.validateRules = moduleCTIClient.validateRules;
				},
			});


		if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
			moduleCTIClient.enableWsFields();
		}
		moduleCTIClient.$wsToggleRadio
			.checkbox({
				onChecked() {
					moduleCTIClient.$dirrtyField.val(Math.random());
					moduleCTIClient.$dirrtyField.trigger('change');
					if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
						moduleCTIClient.enableWsFields();
					} else {
						moduleCTIClient.disableWsFields();
					}
				},
			});
		moduleCTIClient.$sslModeSelect.dropdown({
			onChange: moduleCTIClient.cbSslModeOnChange
		});
		moduleCTIClient.initializeForm();
		moduleCTIClient.checkStatusToggle();
		moduleCTIClient.setCallerIdToggle();
		moduleCTIClient.initializeRemoteMigrationLock();
		moduleCTIClient.initializeRemoteConnectionTest();
		moduleCTIClient.initializeRemoteFailback();
		window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
	},
	/**
	 * Подписка на статус активной миграции мессенджеров.
	 */
	initializeRemoteMigrationLock() {
		if (!moduleCTIClient.remoteMigrationLockListenerBound) {
			window.addEventListener(
				'RemoteMigrationLockChanged',
				moduleCTIClient.setRemoteMigrationLock,
			);
			moduleCTIClient.remoteMigrationLockListenerBound = true;
		}
		moduleCTIClient.applyRemoteMigrationLock();
	},
	/**
	 * Обновить состояние блокировки remote/VPS полей.
	 * @param {CustomEvent} event
	 */
	setRemoteMigrationLock(event) {
		const detail = (event && event.detail) ? event.detail : {};
		moduleCTIClient.remoteMigrationLocked = detail.active === true;
		moduleCTIClient.remoteMigrationLockServices = Array.isArray(detail.services)
			? detail.services : [];
		moduleCTIClient.applyRemoteMigrationLock();
	},
	/**
	 * Применить текущую блокировку к полям формы без disabled-атрибутов:
	 * values должны продолжать отправляться при сохранении других настроек.
	 */
	applyRemoteMigrationLock() {
		const locked = moduleCTIClient.remoteMigrationLocked === true;
		const $remoteInputs = moduleCTIClient.getRemoteProtectedInputs();
		const $remoteToggles = moduleCTIClient.getRemoteToggleInputs();
		const $remoteTestButton = $('#cti-test-remote-conn');

		$remoteInputs
			.prop('readonly', locked)
			.attr('aria-disabled', locked ? 'true' : 'false')
			.closest('.field')
			.toggleClass('cti-remote-field-locked', locked);
		if (locked) {
			$remoteInputs.attr('tabindex', '-1');
		} else {
			$remoteInputs.removeAttr('tabindex');
		}

		$remoteToggles
			.attr('aria-disabled', locked ? 'true' : 'false')
			.closest('.ui.segment')
			.toggleClass('cti-remote-field-locked', locked);
		if (locked) {
			$remoteToggles.attr('tabindex', '-1');
		} else {
			$remoteToggles.removeAttr('tabindex');
		}

		$remoteTestButton
			.toggleClass('disabled', locked)
			.attr('aria-disabled', locked ? 'true' : 'false');

		if (moduleCTIClient.$remoteMigrationLockMessage.length > 0) {
			const serviceText = moduleCTIClient.formatRemoteMigrationServices(
				moduleCTIClient.remoteMigrationLockServices,
			);
			const baseText = globalTranslate.mod_cti_RemoteMigrationLocked
				|| 'Messenger migration is in progress. Remote settings are locked until it finishes.';
			const text = serviceText === '' ? baseText : `${baseText} (${serviceText})`;
			moduleCTIClient.$remoteMigrationLockMessage.find('p').text(text);
			moduleCTIClient.$remoteMigrationLockMessage.toggle(locked);
		}
	},
	/**
	 * @returns {jQuery}
	 */
	getRemoteProtectedInputs() {
		return $(moduleCTIClient.remoteProtectedFieldIds.map((id) => `#${id}`).join(','));
	},
	/**
	 * @returns {jQuery}
	 */
	getRemoteToggleInputs() {
		return $(moduleCTIClient.remoteToggleFieldIds.map((id) => `#${id}`).join(','));
	},
	/**
	 * @param {string[]} services
	 * @returns {string}
	 */
	formatRemoteMigrationServices(services) {
		if (!Array.isArray(services) || services.length === 0) {
			return '';
		}
		return services.map((service) => {
			const key = moduleCTIClient.remoteServiceLabelKeys[service];
			if (key && globalTranslate[key]) {
				return globalTranslate[key];
			}
			return service;
		}).join(', ');
	},
	/**
	 * Preserve locked remote values in POST data when saving unrelated settings.
	 * @param {Object} formData
	 * @returns {Object}
	 */
	syncRemoteFieldsBeforeSubmit(formData) {
		if (moduleCTIClient.remoteMigrationLocked !== true) {
			return formData;
		}
		moduleCTIClient.remoteProtectedFieldIds.forEach((id) => {
			formData[id] = $(`#${id}`).val() || '';
		});
		moduleCTIClient.remoteToggleFieldIds.forEach((id) => {
			formData[id] = $(`#${id}`).is(':checked') ? 'on' : '';
		});
		return formData;
	},
	/**
	 * Кнопка «Проверить подключение» на вкладке Удалённые мессенджеры —
	 * берёт значения формы (host/port/login/key), POSTит на бекенд,
	 * показывает результат inline. Сохранение не делает.
	 */
	initializeRemoteConnectionTest() {
		const $btn = $('#cti-test-remote-conn');
		const $result = $('#cti-test-remote-conn-result');
		if ($btn.length === 0) {
			return;
		}
		const renderResult = (probe, fallbackErr) => {
			$btn.removeClass('loading disabled');
			moduleCTIClient.applyRemoteMigrationLock();
			if (probe && probe.ok === true) {
				const okLabel = globalTranslate.mod_cti_RemoteTestOk || 'Connection OK';
				const arch = probe.arch ? ` ${probe.arch}` : '';
				const rwLabel = globalTranslate.mod_cti_RemoteTestRwOk || 'rw OK';
				$result.css('color', '#21ba45').text(`${okLabel} —${arch}, ${rwLabel}`);
				return;
			}
			const failLabel = globalTranslate.mod_cti_RemoteTestFail || 'Connection failed';
			const err = (probe && probe.error) ? probe.error : (fallbackErr || '');
			$result.css('color', '#db2828').text(err ? `${failLabel}: ${err}` : failLabel);
		};

		$btn.off('click.ctiRemoteTest').on('click.ctiRemoteTest', (e) => {
			e.preventDefault();
			if (moduleCTIClient.remoteMigrationLocked === true) {
				return;
			}
			$btn.addClass('loading disabled');
			$result.removeClass('green red')
				.css('color', '#666')
				.text(globalTranslate.mod_cti_RemoteTestRunning || 'Probing…');
			// Don't send the masked saved key back to the server — empty key
			// tells the backend to fall back to the DB value transparently.
			const rawKey = $('#remote_ssh_key').val() || '';
			const keyForPost = rawKey.indexOf('******') !== -1 ? '' : rawKey;
			$.ajax({
				url: `${Config.pbxUrl}/pbxcore/api/modules/ModuleCTIClient/testRemoteConnection`,
				method: 'POST',
				contentType: 'application/json',
				dataType: 'json',
				data: JSON.stringify({
					host: $('#remote_host').val() || '',
					port: $('#remote_ssh_port').val() || '',
					login: $('#remote_ssh_login').val() || '',
					key: keyForPost,
					base: $('#remote_bin_dir').val() || '',
				}),
				success(response) {
					// PBXApiResult: { result, data: {ok, arch, error}, messages, ... }
					const probe = (response && response.data) ? response.data : null;
					const msg = (response && Array.isArray(response.messages) && response.messages.length > 0)
						? response.messages.join('; ') : '';
					renderResult(probe, msg);
				},
				error(xhr) {
					renderResult(null, `HTTP ${xhr.status || 'error'}`);
				},
			});
		});
	},
	/**
	 * Phase C: операторский failback вынесенного сервиса обратно на локаль.
	 * Кнопка живёт в панели статусов, которая перерисовывается на каждом опросе,
	 * поэтому слушатель делегированный (на document). Бэкенд снимает тумблер
	 * (fence) и поднимает локаль из локальной копии сессии.
	 */
	initializeRemoteFailback() {
		$(document).off('click.ctiFailback', '.cti-failback-btn')
			.on('click.ctiFailback', '.cti-failback-btn', (e) => {
				e.preventDefault();
				const $btn = $(e.currentTarget);
				const svc = $btn.attr('data-svc') || '';
				if (svc === '' || $btn.hasClass('disabled')) {
					return;
				}
				const confirmMsg = globalTranslate.mod_cti_FailbackConfirm
					|| 'Bring this service back to local from the last local copy? '
						+ 'The VPS will be turned off for it.';
				// eslint-disable-next-line no-alert
				if (!window.confirm(confirmMsg)) {
					return;
				}
				$btn.addClass('loading disabled');
				const failLabel = globalTranslate.mod_cti_FailbackFailed || 'Failback failed';
				$.ajax({
					url: `${Config.pbxUrl}/pbxcore/api/modules/ModuleCTIClient/failback`,
					method: 'POST',
					contentType: 'application/json',
					dataType: 'json',
					data: JSON.stringify({ service: svc }),
					success(response) {
						const ok = response && response.data && response.data.ok === true;
						if (ok) {
							// Mirror the fence into the open settings form: the backend
							// already cleared the remote toggle in the DB, but a later
							// settings save would re-post the still-checked box and undo
							// it — so uncheck it here too.
							const fieldMap = { chats: 'remote_whatsapp', tg: 'remote_telegram', max: 'remote_max' };
							const field = fieldMap[svc];
							if (field) {
								const $cb = $(`#${field}`);
								$cb.prop('checked', false);
								$cb.closest('.ui.checkbox').checkbox('set unchecked');
							}
							// Leave the button busy; the status worker re-polls within
							// a few seconds, the service flips to local and the row
							// (with its button) disappears on the next render.
							// Safety net: if the re-poll hasn't removed the row within
							// ~15s (backend didn't converge), drop the busy state so the
							// operator can retry instead of a permanently-spinning button.
							// No-op if the row was already removed (button detached).
							setTimeout(() => {
								$btn.removeClass('loading disabled');
							}, 15000);
							return;
						}
						$btn.removeClass('loading disabled');
						const msg = (response && Array.isArray(response.messages) && response.messages.length > 0)
							? response.messages.join('; ') : '';
						// eslint-disable-next-line no-alert
						window.alert(msg ? `${failLabel}: ${msg}` : failLabel);
					},
					error(xhr) {
						$btn.removeClass('loading disabled');
						// eslint-disable-next-line no-alert
						window.alert(`${failLabel}: HTTP ${xhr.status || 'error'}`);
					},
				});
			});
	},
	/**
	 * Проверка состояния модуля
	 */
	checkStatusToggle() {
		if (moduleCTIClient.$statusToggle.checkbox('is checked')) {
			$('.disability').removeClass('disabled');
			moduleCTIClient.$moduleStatus.show();
			moduleCTIClientConnectionCheckWorker.initialize();
		} else {
			moduleCTIClient.$moduleStatus.hide();
			moduleCTIClient.$moduleStatus.hide();
			$('.disability').addClass('disabled');
			$('.message.ajax').remove();
		}
	},
	/**
	 * Переключатель установки CallerID из 1С
	 * Прячет или показывает статус транслитерации
	 */
	setCallerIdToggle() {
		if (moduleCTIClient.$callerIdSetupToggle.checkbox('is checked')) {
			moduleCTIClient.$callerIdTransliterationToggleBlock.show();
		} else {
			moduleCTIClient.$callerIdTransliterationToggleBlock.hide();
		}
	},
	/**
	 * Включение режима работы через WS
	 */
	enableWsFields() {
		moduleCTIClient.$wsOnlyFields.removeClass('disabled');
	},
	/**
	 * Выключение режима работы через WS
	 */
	disableWsFields() {
		moduleCTIClient.$wsOnlyFields.addClass('disabled');
	},
	/**
	 * При изменении SSL режима
	 * @param value
	 * @param text
	 * @param $choice
	 */
	cbSslModeOnChange(value, text, $choice){
		const port = moduleCTIClient.$formObj.form('get value','server1cport');
		if (value==='http' && port==='443'){
			moduleCTIClient.$formObj.form('set value','server1cport', 80);
		}
		if (value==='https' && port==='80'){
			moduleCTIClient.$formObj.form('set value','server1cport', 443);
		}
		return true;
	},
	cbBeforeSendForm(settings) {
		const result = settings;
		result.data = moduleCTIClient.$formObj.form('get values');
		result.data = moduleCTIClient.syncRemoteFieldsBeforeSubmit(result.data);
		return result;
	},
	cbAfterSendForm() {
		moduleCTIClient.initialize();
	},
	initializeForm() {
		Form.$formObj = moduleCTIClient.$formObj;
		Form.url = `${globalRootUrl}module-c-t-i-client/save`;
		Form.validateRules = moduleCTIClient.validateRules;
		Form.cbBeforeSendForm = moduleCTIClient.cbBeforeSendForm;
		Form.cbAfterSendForm = moduleCTIClient.cbAfterSendForm;
		Form.initialize();
	},
};


$.fn.form.settings.rules.emptyCustomRule = function (value) {
	if (moduleCTIClient.$autoSettingsToggle.checkbox('is unchecked')
		&& moduleCTIClient.$wsToggle.checkbox('is checked')
		&& value === '') {
		return false;
	}
	return true;
};

$.fn.form.settings.rules.wrongPortCustomRule = function (value) {
	if (moduleCTIClient.$autoSettingsToggle.checkbox('is unchecked')
		&& moduleCTIClient.$wsToggle.checkbox('is checked')
	) {
		return $.fn.form.settings.rules.integer(value, '1..65535');
	}
	return true;
};

$(document).ready(() => {
	moduleCTIClient.initialize();
});
