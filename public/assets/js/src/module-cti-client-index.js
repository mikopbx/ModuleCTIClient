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
	$moduleStatus: $('#status'),
	$debugToggle: $('#debug-mode-toggle'),
	$autoSettingsToggle: $('#auto-settings-mode-toggle'),
	$onlyAutoSettingsVisible: $('#module-cti-client-form .only-auto-settings'),
	$onlyManualSettingsVisible: $('#module-cti-client-form .only-manual-settings'),
	$wsOnlyFields: $('.ws-only'),
	$dirrtyField: $('#dirrty'),
	$sslModeSelect: $('.server1c_scheme select'),
	$debugTab: $('#module-cti-client-tabs .item[data-tab="debug"]'),
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
		moduleCTIClient.initializeRemoteConnectionTest();
		window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
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
			if (probe && probe.ok === true) {
				const okLabel = globalTranslate.mod_cti_RemoteTestOk || 'connected';
				const arch = probe.arch ? ` (${probe.arch})` : '';
				$result.css('color', '#21ba45').text(`${okLabel}${arch}`);
				return;
			}
			const failLabel = globalTranslate.mod_cti_RemoteTestFail || 'failed';
			const err = (probe && probe.error) ? probe.error : (fallbackErr || '');
			$result.css('color', '#db2828').text(err ? `${failLabel}: ${err}` : failLabel);
		};

		$btn.on('click', (e) => {
			e.preventDefault();
			$btn.addClass('loading disabled');
			$result.removeClass('green red')
				.css('color', '#666')
				.text(globalTranslate.mod_cti_RemoteTestRunning || 'Probing…');
			$.ajax({
				url: `${Config.pbxUrl}/pbxcore/api/modules/ModuleCTIClient/testRemoteConnection`,
				method: 'POST',
				contentType: 'application/json',
				dataType: 'json',
				data: JSON.stringify({
					host: $('#remote_host').val() || '',
					port: $('#remote_ssh_port').val() || '',
					login: $('#remote_ssh_login').val() || '',
					key: $('#remote_ssh_key').val() || '',
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

