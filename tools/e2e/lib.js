// shared harness for the browser suites
const {chromium} = require('../node_modules/playwright');
const BASE = 'http://localhost:8848';

// The app registers sw.js on any http origin (js/boot.js). The worker is
// network-first for the shell, but it still answers the very first load of a
// session from cache — which means a test can silently exercise the previous
// run's app.js. Unregistering it afterwards worked, but cost a second full page
// load on every single open(); blocking registration at the context level means
// the worker never exists, and the reload goes away with it.
const CTX = {serviceWorkers: 'block'};

// Seed before the first paint rather than load → write → reload. Once per
// context only: a suite that sets a key and then reloads (a11y.js state 4, the
// map's first-visit help) must keep what it wrote, so the guard has to survive
// reloads — which is exactly what sessionStorage does and localStorage does not.
// Everything this function needs must be inside it: it is serialised and run in
// the page, where a reference to anything up here is a ReferenceError — and one
// swallowed by the catch below cost an afternoon of a suite testing an empty
// roster while reporting itself clean. Hence the literal sentinel, and hence
// open() verifying afterwards that the seed actually landed.
const seedScript = s => {
  try {
    if (sessionStorage.getItem('__palarium_seeded')) return;
    sessionStorage.setItem('__palarium_seeded', '1');
    localStorage.clear();
    for (const k of Object.keys(s)) localStorage.setItem(k, s[k]);
  } catch (e) { /* about:blank has no storage */ }
};

/* open({viewport, hash, storage, browser, settle})
 *   storage — localStorage to install before the app boots ({} means cold start)
 *   browser — reuse an existing browser; the caller then owns closing it, and
 *             this is one fresh context, which is how a group gets isolation
 *             (own storage, own viewport, own console-error capture) without
 *             paying for a browser launch.
 */
async function open(opts = {}) {
  const browser = opts.browser || await chromium.launch({channel: 'chrome'});
  const ctx = await browser.newContext({...CTX, viewport: opts.viewport || {width: 1280, height: 900}});
  if (opts.storage) await ctx.addInitScript(seedScript, opts.storage);
  const page = await ctx.newPage();
  const errors = [], consoleErrors = [], bad = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(BASE + '/index.html' + (opts.hash ? '#/' + opts.hash : ''), {waitUntil: 'load'});
  // js/router.js declares `booting` with let, so it is in the page's global
  // lexical scope but not on window — and reading it before router.js has run
  // is a temporal-dead-zone throw, hence the catch.
  await page.waitForFunction(() => { try { return booting === false; } catch (e) { return false; } }, null, {timeout: 15000})
    .catch(() => {});
  await page.waitForTimeout(opts.settle === undefined ? 500 : opts.settle);
  // A seed that silently did not apply is a suite testing the wrong state and
  // calling it clean, which is worse than a red run.
  const want = Object.keys(opts.storage || {});
  if (want.length) {
    const missing = await page.evaluate(ks => ks.filter(k => localStorage.getItem(k) === null), want);
    if (missing.length) throw new Error(`seed did not apply: ${missing.join(', ')}`);
  }
  return {browser, ctx, page, errors, consoleErrors, bad, ownsBrowser: !opts.browser};
}

const problems = h => [...h.errors.map(x => 'pageerror: ' + x), ...h.consoleErrors.map(x => 'console: ' + x), ...h.bad.map(x => 'http: ' + x)];

// Close what this handle owns: the context always, the browser only when open()
// launched it.
async function close(h) {
  await h.ctx.close().catch(() => {});
  if (h.ownsBrowser) await h.browser.close().catch(() => {});
}

module.exports = {open, problems, close, BASE};
