'use strict';
// 1) The DEFAULT rendered structure of the certificate block (index.volt + en/ru messages, volt tags substituted).
// 2) The REAL panel logic from the source and from the shipped asset against synthetic status payloads on a recording
//    stub document. No network, no real DOM. The panel is read-only: it has no regenerate/CSRF/command surface.
// Usage: node tests/CtiTlsPanelRenderTest.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = {
  source: path.join(root, 'public/assets/js/src/module-cti-client-index.js'),
  asset: path.join(root, 'public/assets/js/module-cti-client-index.js'),
};
let failed = 0;
function check(label, ok, detail) {
  if (ok) { console.log('PASS ' + label); } else { failed += 1; console.log('FAIL ' + label + (detail ? ' :: ' + detail : '')); }
}

function messages(lang) {
  const text = fs.readFileSync(path.join(root, 'Messages', lang + '.php'), 'utf8');
  const map = {};
  const re = /^\s*'(mod_cti_[A-Za-z0-9_]+)'\s*=>\s*'((?:[^'\\]|\\.)*)',\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) { map[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\'); }
  return map;
}
function renderedPanel(lang) {
  const t = messages(lang);
  let volt = fs.readFileSync(path.join(root, 'App/Views/index.volt'), 'utf8').replace(/\{#[\s\S]*?#\}/g, '');
  volt = volt.replace(/\{\{\s*t\._\(['"]([A-Za-z0-9_]+)['"]\)\s*\}\}/g, (all, key) => (t[key] === undefined ? '[[MISSING ' + key + ']]' : t[key]))
    .replace(/\{\{\s*form\.render\('cti_tls_hostname'\)\s*\}\}/, '<input type="text" id="cti_tls_hostname" name="cti_tls_hostname" maxlength="254">');
  const start = volt.indexOf('<div id="cti-tls-panel"');
  if (start === -1) { return null; }
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(volt)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { return { html: volt.slice(start, m.index + 6), t }; }
  }
  return null;
}
const textOf = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
for (const lang of ['en', 'ru']) {
  const panel = renderedPanel(lang);
  check('[' + lang + '] panel renders', !!panel);
  if (!panel) { continue; }
  const html = panel.html;
  check('[' + lang + '] the missing-address guidance is also rendered with the page',
    /data-missing-address="[^"\n]+"/.test(html));
  const d0 = html.indexOf('<details');
  const d1 = html.indexOf('</details>');
  const outside = d0 === -1 ? html : html.slice(0, d0) + html.slice(d1 + 10);
  const inside = d0 === -1 ? '' : html.slice(d0, d1);
  check('[' + lang + '] one collapsed details block', d0 !== -1 && d1 > d0 && !/<details[^>]*\bopen\b/.test(html) && /<details[^>]*display:\s*none/.test(html));
  const sections = outside.split('<div class="ui attached segment">');
  check('[' + lang + '] heading and segment use the same attached layout as adjacent settings',
    sections.length === 2 && /class="ui top attached header cti-tls-header"/.test(sections[0])
    && /<h4 class="cti-tls-title">[^<]+<\/h4>/.test(sections[0]));
  check('[' + lang + '] status is in the header; setup guidance and download remain in the body', sections.length === 2
    && /<span class="cti-tls-status-dot"[^>]*>[\s\S]*?<span id="cti-tls-summary" role="status"/.test(sections[0])
    && /id="cti-tls-next-step"/.test(sections[1])
    && /<button[^>]*id="cti-tls-server"[^>]*>\s*<i class="download icon"/.test(sections[1]));
  check('[' + lang + '] Details is an unboxed disclosure and the healthy badge has no punctuation',
    !/<details[^>]*\bsegment\b/.test(inside) && !/<pre\b/.test(inside) && !/\.$/.test(panel.t.mod_cti_TlsRunning));
  check('[' + lang + '] default view: address field, hint and one status line, nothing else',
    /id="cti_tls_hostname"/.test(outside) && /id="cti-tls-summary"/.test(outside)
    && !/<button|<pre|<textarea|\bdisabled\b/.test(outside.replace(/<button[^>]*id="cti-tls-server"[^>]*display:\s*none[^>]*>[\s\S]*?<\/button>/, '')));
  check('[' + lang + '] public server download is outside Details and starts hidden', /id="cti-tls-server"[^>]*display:\s*none/.test(outside));
  const visible = textOf(outside);
  check('[' + lang + '] default view is compact (' + visible.length + ' chars)', visible.length > 0 && visible.length <= 520, visible);
  check('[' + lang + '] heading uses full product names without CTI jargon', /Nightbird/.test(visible)
    && visible.includes(lang === 'ru' ? '1С:Предприятие' : '1C:Enterprise')
    && !/\bCTI\b/.test(visible + ' ' + panel.t.mod_cti_TlsRunning));
  check('[' + lang + '] both local paths use the same source label without guessing provenance',
    panel.t.mod_cti_TlsSourcePrevious === panel.t.mod_cti_TlsSourceOwn);
  const statuses = ['Loading', 'RefreshRequired', 'Running', 'Pending', 'Mixed', 'AddressMissing', 'AwaitingApply',
    'NotReady', 'Refused', 'RefusedRunning', 'StatusUnknown'];
  check('[' + lang + '] all header statuses are short labels without instructions or technical codes', statuses.every(name => {
    const value = panel.t['mod_cti_Tls' + name];
    return typeof value === 'string' && value.length > 0 && value.length <= 55
      && !/[.!?;]$|«Подробнее»|\b(?:HTTP|Save|Details)\b|Сохраните|войдите|нажмите/i.test(value);
  }));
  check('[' + lang + '] details: retry and CA downloads hidden initially; no regenerate/copy/command', ['details', 'trust', 'manual-block', 'refresh', 'intermediates', 'root']
    .every(id => inside.indexOf('id="cti-tls-' + id + '"') !== -1)
    && ['refresh', 'intermediates', 'root'].every(k => new RegExp('id="cti-tls-' + k + '"[^>]*display:\\s*none').test(inside))
    && !/regenerate|cti-tls-copy|cti-tls-command|<textarea/.test(html));
  check('[' + lang + '] no missing translations', html.indexOf('[[MISSING') === -1);
  const copy = panel.t.mod_cti_TlsManualSource || '';
  check('[' + lang + '] unreadable HTTPS instructions protect the original key', lang === 'ru'
    ? /скопируйте/i.test(copy) && /не меняйте права исходных/i.test(copy) && /0600/.test(copy)
    : /copy/i.test(copy) && /do not change.*original/i.test(copy) && /0600/.test(copy));
}

function inert() {
  const f = function () { return inert(); };
  return new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : inert()), apply: () => inert(), construct: () => inert(), set: () => true });
}
function load(file, untranslated) {
  const nodes = {};
  const element = id => nodes[id] || (nodes[id] = { id, textContent: '', style: { display: 'none' }, value: '', disabled: false, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } });
  const timers = [];
  const requests = [];
  const queue = [];
  const saved = [];
  function XMLHttpRequest() {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.setRequestHeader = () => {};
    this.send = () => {
      requests.push(this.method + ' ' + this.url);
      const next = queue.length ? queue.shift() : { status: 200, body: {} };
      this.status = next.status;
      this.responseText = next.pem || JSON.stringify(next.body);
      this.getResponseHeader = () => (next.pem ? 'application/x-pem-file' : null);
      this.onload();
    };
  }
  const sandbox = {
    $: inert(), jQuery: inert(), globalTranslate: new Proxy({}, { get: (t, k) => (typeof k === 'string'
      ? ((untranslated || []).includes(k) ? k : '[' + k.replace('mod_cti_Tls', '') + ']') : undefined) }),
    document: { getElementById: id => element(id.replace('cti-tls-', '')), addEventListener() {}, createElement: () => element('x') },
    window: { addEventListener() {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
      navigator: { msSaveBlob: (blob, filename) => saved.push(filename) } },
    globalRootUrl: '/', Form: inert(), Config: {}, XMLHttpRequest, setTimeout() {}, console, navigator: {}, URL: {}, Blob: function () {},
    Event: function () {}, CustomEvent: function () {},
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__panel = ctiTlsPanel;', sandbox, { filename: file });
  const panel = sandbox.__panel;
  const shown = id => element(id).style.display !== 'none';
  return { panel, element, shown, timers, requests, queue, saved, render(status) {
    panel.clear();
    panel.render(status);
    panel.snapshot = { certificateStatus: status };
    panel.controls(true);
    return { summary: element('summary').textContent, details: element('details').textContent, refresh: shown('refresh'),
      nextStep: element('next-step').textContent, nextStepVisible: shown('next-step'),
      state: element('panel').attrs['data-state'], more: shown('more'), manual: shown('manual-block'),
      trust: shown('trust'), server: shown('server'), intermediates: shown('intermediates'), root: shown('root'), manualText: element('manual').textContent };
  } };
}

const D = 'a'.repeat(64);
const cert = { sha256: D, subject: 'CN=cti', issuer: 'CN=cti', san: ['IP Address:172.16.32.70'], notBefore: 1, notAfter: 2000000000, selfSigned: true };
const match = { api: { state: 'match', required: true }, nats: { state: 'match', required: true }, proxy: { state: 'match', required: false } };
const base = { hostname: 'pbx.test', errorCode: null, state: 'error', runtime: {}, downloads: [], configured: null, configuredGeneration: null, source: null,
  trust: { kind: 'unknown', rootAvailable: false } };
const running = { ...base, state: 'running', source: 'previous', configured: cert, configuredGeneration: D, runtime: match, downloads: ['server'],
  publicPath: '/m/etc/ssl/gnatsd.crt', trust: { kind: 'self_signed', rootAvailable: false } };
const cases = [
  ['previous pair running: one success line, only the self-signed leaf download, trust text', running,
    { state: 'running', more: true, server: true, intermediates: false, root: false, trust: true, manual: false, refresh: false },
    { has: ['[Running]'], lacks: ['[Pending]'], details: ['[SourcePrevious]', '[TypeSelfSigned]'] }],
  ['CA-issued leaf with a verified root offers both; provenance is not guessed', { ...running, source: 'own', configured: { ...cert, selfSigned: false }, downloads: ['server', 'root'], trust: { kind: 'ca_issued', rootAvailable: true } },
    { server: true, root: true, trust: true, refresh: false }, { has: ['[Running]'], details: ['[SourceOwn]', '[TypeCaIssued]'] }],
  ['CA-issued leaf without the root is downloadable without a root-trust claim', { ...running, configured: { ...cert, selfSigned: false }, trust: { kind: 'ca_issued', rootAvailable: false } },
    { server: true, root: false, trust: false, refresh: false }, { details: ['[SourcePrevious]', '[TypeCaIssued]'] }],
  ['intermediates only: offered for download but NO root-trust text (never trust an intermediate as a root)', { ...running, downloads: ['intermediates'], trust: { kind: 'ca_issued', rootAvailable: false } },
    { server: false, root: false, intermediates: true, trust: false }, { has: ['[Running]'] }],
  ['required peer not matching is an unknown status, not success', { ...running, runtime: { ...match, nats: { state: 'unavailable', required: true } } },
    { state: 'unknown' }, { has: ['[StatusUnknown]'], lacks: ['[Running]'] }],
  ['pending: honest "not confirmed"', { ...running, state: 'pending', runtime: {} }, { state: 'pending' }, { has: ['[Pending]'], lacks: ['[Running]'] }],
  ['mixed services: a problem line', { ...running, runtime: { ...match, proxy: { state: 'different', required: true } } }, { state: 'mixed' }, { has: ['[Mixed]'] }],
  ['no address and no pair: the single next step is the address; no manual block', { ...base, hostname: '', errorCode: 'invalid_hostname' },
    { state: 'error', manual: false, more: false, server: false, nextStep: '[MissingDomain]', nextStepVisible: true },
    { has: ['[AddressMissing]'], lacks: ['[MissingDomain]'] }],
  ['not applied: neutral status, Save instruction in the body, no machine code', { ...base, errorCode: 'tls_apply_required' },
    { state: 'error', manual: false, more: false, details: '', nextStep: '[SaveToApply]', nextStepVisible: true },
    { has: ['[AwaitingApply]'], lacks: ['[SaveToApply]', 'tls_apply_required'] }],
  ['unreadable HTTPS source: copy instruction, not destination access advice', { ...base, errorCode: 'source_unreadable', manualPaths: { cert: '/c/tls/cti.crt', key: '/c/tls/cti.key' } },
    { manual: true, more: true }, { has: ['[NotReady]'], manual: ['[ManualSource]'], manualLacks: ['[ManualAccess]', '[ManualReplace]', '[ManualFresh]'] }],
  ['installed pair unusable: separate replace-and-keep-the-original instruction', { ...base, errorCode: 'installed_pair_unusable', manualPaths: { cert: '/c/tls/cti.crt', key: '/c/tls/cti.key' } },
    { manual: true }, { has: ['[NotReady]'], manual: ['[ManualReplace]'], manualLacks: ['[ManualAccess]', '[ManualFresh]'] }],
  ['unknown PBX selection: fresh-destination instruction', { ...base, errorCode: 'source_selection_unknown', manualPaths: { cert: '/c/tls/cti.crt', key: '/c/tls/cti.key' } },
    { manual: true }, { has: ['[NotReady]'], manual: ['[ManualFresh]'], manualLacks: ['[ManualAccess]', '[ManualReplace]'] }],
  ['recorded refusal while the previous certificate runs: one short line that says so, still running', { ...running, applyError: 'installed_pair_unusable', manualPaths: { cert: '/c/tls/cti.crt', key: '/c/tls/cti.key' } },
    { state: 'running', manual: true }, { has: ['[RefusedRunning]'], lacks: ['[Running]', '[NotReady]'], manual: ['[ManualReplace]'] }],
  ['recorded refusal with nothing confirmed running: selection failed, an error state', { ...running, state: 'pending', runtime: {}, applyError: 'tls_prepare_failed', manualPaths: { cert: '/c/tls/cti.crt', key: '/c/tls/cti.key' } },
    { state: 'error', manual: true }, { has: ['[Refused]'], lacks: ['[RefusedRunning]', '[Running]'], manual: ['[ManualAccess]'] }],
];
for (const [label, file] of Object.entries(files)) {
  const view = load(file);
  for (const [title, status, want, text] of cases) {
    const got = view.render(status);
    const problems = [];
    Object.keys(want).forEach(k => { if (got[k] !== want[k]) { problems.push(k + '=' + got[k] + ' expected ' + want[k]); } });
    ((text && text.has) || []).forEach(s => { if (got.summary.indexOf(s) === -1) { problems.push('summary lacks ' + s); } });
    ((text && text.lacks) || []).forEach(s => { if (got.summary.indexOf(s) !== -1) { problems.push('summary has ' + s); } });
    if (got.summary.indexOf('\n') !== -1) { problems.push('summary is not one line'); }
    if (/\b(?:match|unavailable|different)\b/.test(got.details)) { problems.push('raw service state displayed'); }
    if (status.errorCode && [got.summary, got.details, got.nextStep, got.manualText].some(s => s.includes(status.errorCode))) {
      problems.push('internal outcome code displayed');
    }
    if (got.details.indexOf('\n\n') !== -1) { problems.push('certificate details have empty spacer lines'); }
    ((text && text.details) || []).forEach(s => { if (got.details.indexOf(s) === -1) { problems.push('details lack ' + s); } });
    if (want.manual && got.manualText.indexOf('/c/tls/cti.crt') === -1) { problems.push('manual path missing'); }
    ((text && text.manual) || []).forEach(s => { if (got.manualText.indexOf(s) === -1) { problems.push('manual text lacks ' + s); } });
    ((text && text.manualLacks) || []).forEach(s => { if (got.manualText.indexOf(s) !== -1) { problems.push('manual text has ' + s); } });
    if (problems.length) { failed += 1; console.log('FAIL [' + label + '] ' + title + ': ' + problems.join('; ') + ' :: ' + JSON.stringify(got.summary)); }
    else { console.log('PASS [' + label + '] ' + title); }
  }
  const staleLanguage = load(file, ['mod_cti_TlsSourcePrevious', 'mod_cti_TlsTypeCaIssued']);
  const staleView = staleLanguage.render({ ...running, configured: { ...cert, selfSigned: false } });
  check('[' + label + '] an older language asset never renders raw message keys', !/mod_cti_/.test(staleView.details));
  const missing = load(file, ['mod_cti_TlsMissingDomain']);
  missing.element('panel').setAttribute('data-missing-address', 'Укажите домен или IP-адрес АТС.');
  const missingView = missing.render({ ...base, hostname: '', errorCode: 'invalid_hostname' });
  check('[' + label + '] missing address shows an instruction, not a technical code, even with stale translations',
    missingView.summary === '[AddressMissing]' && missingView.nextStep === 'Укажите домен или IP-адрес АТС.'
      && missingView.details === '' && !missingView.more);
  const downloadView = load(file);
  for (const kind of ['server', 'root', 'intermediates']) {
    downloadView.render({ ...running, downloads: [kind] });
    downloadView.queue.push({ status: 200, pem: '-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n' });
    downloadView.panel.download(kind);
  }
  check('[' + label + '] single certificates are CER; the chain stays PEM',
    JSON.stringify(downloadView.saved.map(fileName => fileName.split('.').pop())) === '["cer","cer","pem"]');
  check('[' + label + '] no regenerate/command surface in the panel', typeof view.panel.regenerate === 'undefined' && typeof view.panel.copy === 'undefined');
  const view2 = load(file);
  view2.queue.push({ status: 403, body: { ok: false, errorCode: 'admin_required' } });
  view2.panel.refresh();
  check('[' + label + '] failed status read: short header and help below without HTTP or machine codes',
    view2.element('summary').textContent === '[RefreshRequired]' && view2.element('next-step').textContent === '[RefreshHint]'
    && view2.shown('next-step') && view2.shown('more') && view2.shown('refresh') && !view2.shown('server') && view2.timers.length === 0);
  const ok = body => ({ status: 200, body: { ok: true, certificateStatus: body } });
  const view3 = load(file);
  view3.queue.push(ok({ ...running, state: 'pending', runtime: {} }));
  view3.panel.initialize();
  check('[' + label + '] page load: one read, no re-poll', view3.requests.length === 1 && view3.timers.length === 0);
  for (let i = 0; i < 6; i += 1) { view3.queue.push(ok({ ...running, state: 'pending', runtime: {} })); }
  view3.panel.refresh(3);
  let guard = 0;
  while (view3.timers.length && guard++ < 10) { view3.timers.shift().fn(); }
  check('[' + label + '] after Save: one read plus at most 3 re-reads, then stop (' + (view3.requests.length - 1) + ')', view3.requests.length === 5 && view3.timers.length === 0);
  const view4 = load(file);
  view4.queue.push(ok({ ...running, state: 'pending', runtime: {} }), ok(running), ok(running));
  view4.panel.refresh(3);
  guard = 0;
  while (view4.timers.length && guard++ < 10) { view4.timers.shift().fn(); }
  check('[' + label + '] after Save: stops re-reading once running (' + view4.requests.length + ' reads)', view4.requests.length === 2 && view4.element('summary').textContent === '[Running]');
  check('[' + label + '] only GET requests to the two public endpoints', view3.requests.every(r => /^GET .*tlsCertificateInfo/.test(r)));
}
const asset = fs.readFileSync(files.asset, 'utf8');
check('asset is ES5 (no ES6 syntax)', !/=>|\bconst\b|\blet\b|`/.test(asset));
check('asset carries the same panel text as the source', (() => {
  const grab = s => s.slice(s.indexOf('var ctiTlsPanel = {'), s.indexOf('$(document).ready')).replace(/\r\n/g, '\n');
  return grab(fs.readFileSync(files.source, 'utf8')) === grab(asset);
})());
console.log(failed ? 'FAILED ' + failed : 'PASS CtiTlsPanelRender');
process.exit(failed ? 1 : 0);
