'use strict';
// The REAL services-status worker (ES6 source and generated IE11 asset) against synthetic check answers, with a
// recording jQuery stand-in. A known "certificate setup incomplete, nothing started" state must end the spinner
// with a plain statement; real startup progress, errors, success and recovery must behave as before.
// Usage: node tests/CtiStatusWorkerTest.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = {
  source: path.join(__dirname, '..', 'public/assets/js/src/module-cti-client-status-worker.js'),
  asset: path.join(__dirname, '..', 'public/assets/js/module-cti-client-status-worker.js'),
};
let failed = 0;
function check(label, ok, detail) {
  if (ok) { console.log('PASS ' + label); } else { failed += 1; console.log('FAIL ' + label + (detail ? ' :: ' + detail : '')); }
}

function load(file) {
  const els = {};
  const wrap = e => {
    const w = {
      length: 1, html(v) { if (v === undefined) { return e.html; } e.html = v; return w; }, empty() { e.html = ''; return w; },
      show() { e.shown = true; return w; }, hide() { e.shown = false; return w; }, children() { return { length: e.html ? 1 : 0 }; },
      removeClass() { return w; }, addClass(c) { e.classes.push(c); return w; }, checkbox(cmd) { return cmd === 'is checked'; },
      remove() { return w; }, after() { return w; }, append() { return w; }, text() { return w; }, ready() { return w; },
    };
    return w;
  };
  const jq = sel => {
    if (typeof sel !== 'string' || sel.charAt(0) === '<') { return wrap({ html: '', shown: true, classes: [] }); }
    return wrap(els[sel] || (els[sel] = { html: '', shown: true, classes: [] }));
  };
  const apiCalls = [];
  jq.api = opts => { apiCalls.push(opts); };
  let panelState = 'unknown';
  let panelPresent = true;
  const timers = [];
  const sandbox = {
    $: jq, jQuery: jq, document: { getElementById: id => (id === 'cti-tls-panel' && panelPresent ? { getAttribute: () => panelState } : null) },
    window: { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, dispatchEvent() {} },
    globalTranslate: { mod_cti_StatusTlsNotStarted: 'NOT-STARTED', mod_cti_ConnectionProgress: 'PROGRESS', mod_cti_UpdateStatus: 'UPDATING',
      mod_cti_Connected: 'CONNECTED', mod_cti_StatusModuleDisabled: 'DISABLED', mod_cti_ConnectionError: 'FAILURE', mod_cti_StatusProblem: 'PROBLEM' },
    Config: { pbxUrl: '' }, PbxApi: { successTest() { return true; } }, Form: {}, CustomEvent: function () {}, console, Date, JSON,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__w = moduleCTIClientConnectionCheckWorker;', sandbox, { filename: file });
  const w = sandbox.__w;
  const summary = () => els['#cti-status-summary'].html;
  const rows = () => els['#cti-services-status-rows'] ? els['#cti-services-status-rows'].html : '';
  const placeholder = () => els['#cti-services-status-placeholder'] ? els['#cti-services-status-placeholder'] : { html: '', shown: true };
  return { w, summary, rows, placeholder, setPanel(state) { panelState = state; }, removePanel() { panelPresent = false; },
    /** One poll: the worker asks, the API answers (HTTP 2xx with result=false is "failure" in $.api terms). */
    poll(response) {
      w.worker();
      const opts = apiCalls[apiCalls.length - 1];
      opts.onResponse(response);
      if (response.result === true) { opts.onSuccess(response); } else { opts.onFailure(response); }
      opts.onComplete();
      return timers.length;
    } };
}
const row = (name, state, extra) => Object.assign({ name, state }, extra || {});
const stopped = { result: false, data: { statuses: [row('monitord', 'unknown'), row('nats', 'unknown', { version: 'unknown' }), row('manager.api', 'unknown'),
  row('auth', 'starting'), row('ami-listener', 'starting')], startup_grace: true, remote_migration_active: false, remote_migration_services: [] } };
const monitordUpOthersStarting = { result: false, data: { statuses: [row('monitord', 'ok', { pid: '1' }), row('nats', 'unknown'), row('auth', 'starting')],
  startup_grace: true, remote_migration_active: false, remote_migration_services: [] } };
const healthy = { result: true, data: { statuses: [row('monitord', 'ok', { uptime: '5m' }), row('nats', 'ok', { uptime: '5m' }), row('auth', 'ok', { uptime: '5m' })],
  startup_grace: false, remote_migration_active: false, remote_migration_services: [] } };

for (const [label, file] of Object.entries(files)) {
  const p = name => '[' + label + '] ' + name;
  // Known setup state: nothing started and the certificate panel says there is a problem -> no perpetual connecting.
  let v = load(file);
  v.setPanel('error');
  const timersAfter = v.poll(stopped);
  check(p('not configured / nothing available: plain state, no spinner'), v.summary().indexOf('NOT-STARTED') !== -1 && v.summary().indexOf('spinner') === -1
    && v.summary().indexOf('PROGRESS') === -1, v.summary());
  check(p('not configured: the services table does not show endless "starting" rows or a loader'),
    v.rows() === '' && v.placeholder().html.indexOf('NOT-STARTED') !== -1 && v.placeholder().html.indexOf('loader') === -1 && v.placeholder().shown === true,
    JSON.stringify([v.rows(), v.placeholder().html]));
  check(p('polling continues, so a normal Save can recover'), timersAfter === 1);
  // Recovery after a normal Save: the panel leaves the error state and the stack comes up.
  v.setPanel('pending');
  v.poll(monitordUpOthersStarting);
  check(p('recovery step 1: real startup progress is shown again'), v.summary().indexOf('PROGRESS') !== -1 && v.summary().indexOf('spinner') !== -1, v.summary());
  v.setPanel('running');
  v.poll(healthy);
  check(p('recovery step 2: success only when the services report ok'), v.summary().indexOf('CONNECTED') !== -1 && v.rows().indexOf('<table') !== -1, v.summary());
  // A stale error verdict must never mask a stack that is really running.
  v = load(file);
  v.setPanel('error');
  v.poll(monitordUpOthersStarting);
  check(p('running monitord is never reported as not started'), v.summary().indexOf('NOT-STARTED') === -1 && v.summary().indexOf('PROGRESS') !== -1, v.summary());
  v.poll(healthy);
  check(p('healthy services stay a success even with a stale error verdict'), v.summary().indexOf('CONNECTED') !== -1, v.summary());
  // Without a panel verdict an empty stack is still "starting" (unchanged behaviour), not a claimed setup problem.
  for (const state of ['unknown', 'running', 'pending', 'mixed']) {
    v = load(file);
    v.setPanel(state);
    v.poll(stopped);
    check(p('panel state "' + state + '" keeps the startup progress'), v.summary().indexOf('PROGRESS') !== -1 && v.summary().indexOf('NOT-STARTED') === -1, v.summary());
  }
  v = load(file);
  v.removePanel();
  v.poll(stopped);
  check(p('no certificate panel on the page: unchanged'), v.summary().indexOf('PROGRESS') !== -1 && v.summary().indexOf('NOT-STARTED') === -1, v.summary());
  // A genuine failed daemon is still an error, not a setup statement.
  v = load(file);
  v.setPanel('error');
  v.poll({ result: false, data: { statuses: [row('monitord', 'ok'), row('nats', 'error')], startup_grace: false } });
  check(p('a failed daemon with monitord running is still reported as a problem'), v.summary().indexOf('PROBLEM') !== -1, v.summary());
}
console.log(failed ? 'FAILED ' + failed : 'PASS CtiStatusWorker');
process.exit(failed ? 1 : 0);
