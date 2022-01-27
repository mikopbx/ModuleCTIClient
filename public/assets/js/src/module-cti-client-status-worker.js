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
		moduleCTIClientConnectionCheckWorker.errorCounts = 0;
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
					window.clearTimeout(moduleCTIClientConnectionCheckWorker.timeoutHandle);
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
							if (status1C !== 'ok' && countHealthy === 6 ) {
								if (moduleCTIClientConnectionCheckWorker.$webServiceToggle.checkbox('is checked')) {
									moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CError');
								} else {
									moduleCTIClientConnectionCheckWorker.changeStatus('ConnectionTo1CWait');
								}
							} else if (countHealthy < 6) {
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