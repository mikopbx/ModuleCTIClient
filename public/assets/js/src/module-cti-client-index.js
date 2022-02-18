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
		moduleCTIClient.initializeForm();
		moduleCTIClient.checkStatusToggle();
		moduleCTIClient.setCallerIdToggle();
		window.addEventListener('ModuleStatusChanged', moduleCTIClient.checkStatusToggle);
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

