/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */

/* global globalRootUrl,globalTranslate, Form, Config, PbxApi */

/**
 * Тестирование соединения модуля с 1С
 */
const moduleCTIClientConnectionCheckWorker = {
	$formObj: $('#module-cti-client-form'),
	$statusToggle: $('#module-status-toggle'),
	$webServiceToggle: $('#web-service-mode-toggle'),
	$debugToggle: $('#debug-mode-toggle'),
	$moduleStatus: $('#status'),
	$submitButton: $('#submitbutton'),
	$debugInfo: $('#module-cti-client-form span#debug-info'),
	timeOut: 3000,
	timeOutHandle: '',
	errorCounts: 0,
	initialize() {
		moduleCTIClientConnectionCheckWorker.restartWorker();
	},
	restartWorker() {
		moduleCTIClientConnectionCheckWorker.changeStatus('Updating');
		window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeoutHandle);
		moduleCTIClientConnectionCheckWorker.worker();
	},
	worker() {
		if (moduleCTIClientConnectionCheckWorker.$statusToggle.checkbox('is checked')) {
			$.api({
				url: `${Config.pbxUrl}/pbxcore/api/modules/ModuleCTIClient/check`,
				on: 'now',
				successTest: PbxApi.successTest,
				onComplete() {
					moduleCTIClientConnectionCheckWorker.timeoutHandle = window.setTimeout(
						moduleCTIClientConnectionCheckWorker.worker,
						moduleCTIClientConnectionCheckWorker.timeOut,
					);
				},
				onResponse(response) {
					$('.message.ajax').remove();
					// Debug mode
					if (typeof (response.data) !== 'undefined') {
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
					}
				},
				onSuccess() {
					moduleCTIClientConnectionCheckWorker.changeStatus('Connected');
					moduleCTIClientConnectionCheckWorker.errorCounts = 0;
				},
				onFailure(response) {
					if (Object.keys(response).length > 0
						&& response.result === false
						&& typeof (response.data) !== 'undefined'
					) {
						moduleCTIClientConnectionCheckWorker.errorCounts += 1;
						if (typeof (response.data) !== 'undefined'
							&& typeof (response.data.statuses) !== 'undefined'
						) {
							let countHealthy = 0;
							let status1C = 'undefined';

							$.each(response.data.statuses, (key, value) => {
								if (typeof (value.name) !== 'undefined'
								&& value.state === 'ok'){
									countHealthy++;
								}
								if (typeof (value.name) !== 'undefined'
									&& value.name === 'crm-1c') {
									status1C = value.state;
								}
							});
							if (status1C !== 'ok' && countHealthy === 5 ) {
								if (moduleCTIClientConnectionCheckWorker.$webServiceToggle.checkbox('is checked')) {
									moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CError');
								} else {
									moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CWait');
								}
							} else if (countHealthy < 5) {
								if (moduleCTIClientConnectionCheckWorker.errorCounts < 10) {
									moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionProgress');
								} else {
									moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
								}
							}

						} else { // Unknown
							moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
						}
					} else {
						moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionError');
					}
				},
			});
		} else {
			moduleCTIClientConnectionCheckWorker.errorCounts = 0;
		}
	},
	/**
	 * Обновление статуса модуля
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

const moduleCTIClient = {
	$wsToggle: $('#web-service-mode-toggle'),
	$wsToggleRadio: $('#module-cti-client-form .web-service-radio'),
	$statusToggle: $('#module-status-toggle'),
	$formObj: $('#module-cti-client-form'),
	$moduleStatus: $('#status'),
	$debugToggle: $('#debug-mode-toggle'),
	$autoSettingsToggle: $('#auto-settings-mode-toggle'),
	$onlyAutoSettingsVisible: $('#module-cti-client-form .only-auto-settings'),
	$onlyManualSettingsVisible: $('#module-cti-client-form .only-manual-settings'),
	$wsOnlyFields: $('.ws-only'),
	$debugTab: $('#module-cti-client-tabs .item[data-tab="debug"]'),
	validateRules: {
		server1chost: {
			depends: 'web_service_mode',
			identifier: 'server1chost',
			rules: [
				{
					type: 'empty',
					prompt: globalTranslate.mod_cti_ValidateServer1CHostEmpty,
				},
			],
		},
		server1cport: {
			depends: 'web_service_mode',
			identifier: 'server1cport',
			rules: [
				{
					type: 'integer[0..65535]',
					prompt: globalTranslate.mod_cti_ValidateServer1CPortRange,
				},
			],
		},
		database: {
			depends: 'web_service_mode',
			identifier: 'database',
			rules: [
				{
					type: 'empty',
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

		if (moduleCTIClient.$autoSettingsToggle.checkbox('is checked')){
			moduleCTIClient.$onlyManualSettingsVisible.hide()
		} else {
			moduleCTIClient.$onlyAutoSettingsVisible.hide()
		}
		moduleCTIClient.$autoSettingsToggle
			.checkbox({
				onChecked() {
					moduleCTIClient.$onlyAutoSettingsVisible.show()
					moduleCTIClient.$onlyManualSettingsVisible.hide()
				},
				onUnchecked() {
					moduleCTIClient.$onlyAutoSettingsVisible.hide()
					moduleCTIClient.$onlyManualSettingsVisible.show()
				},
			});


		if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
			moduleCTIClient.enableWsFields();
		}
		moduleCTIClient.$wsToggleRadio
			.checkbox({
				onChecked() {
					if (moduleCTIClient.$wsToggle.checkbox('is checked')) {
						moduleCTIClient.enableWsFields();
					} else {
						moduleCTIClient.disableWsFields();
					}
				},
			});
		moduleCTIClient.initializeForm();
		moduleCTIClient.checkStatusToggle();
		window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
	},
	/**
	 * Проверка состояния модуля
	 */
	checkStatusToggle() {
		if (moduleCTIClient.$statusToggle.checkbox('is checked')) {
			$('.disability').removeClass('disabled');
			moduleCTIClient.$moduleStatus.show();
			moduleCTIClientConnectionCheckWorker.errorCounts = 0;
			moduleCTIClientConnectionCheckWorker.initialize();
		} else {
			moduleCTIClient.$moduleStatus.hide();
			moduleCTIClient.$moduleStatus.hide();
			$('.disability').addClass('disabled');
			$('.message.ajax').remove();
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
	 * Применение настроек модуля после изменения данных формы
	 */
	applyConfigurationChanges() {
		$.api({
			url: `${Config.pbxUrl}/pbxcore/api/modules/ModuleCTIClient/reload`,
			on: 'now',
			successTest(response) {
				// test whether a JSON response is valid
				return Object.keys(response).length > 0 && response.result === true;
			},
			onSuccess() {
				moduleCTIClientConnectionCheckWorker.initialize();
				moduleCTIClient.initialize();
			},
		});
	},
	cbBeforeSendForm(settings) {
		const result = settings;
		result.data = moduleCTIClient.$formObj.form('get values');
		return result;
	},
	cbAfterSendForm() {
		moduleCTIClient.applyConfigurationChanges();
		moduleCTIClientConnectionCheckWorker.errorCounts = 0;
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

$(document).ready(() => {
	moduleCTIClient.initialize();
});

