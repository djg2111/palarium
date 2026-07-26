// shared harness for the save-import browser tests
const {chromium} = require('../node_modules/playwright');
const BASE = 'http://localhost:8848';
async function open(opts = {}) {
  const browser = await chromium.launch({channel: 'chrome'});
  const ctx = await browser.newContext({viewport: opts.viewport || {width: 1280, height: 900}});
  const page = await ctx.newPage();
  const errors = [], consoleErrors = [], bad = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(BASE + '/index.html' + (opts.hash ? '#/' + opts.hash : ''), {waitUntil: 'load'});
  // The service worker is network-first for the shell, but it still answers the
  // very first load of a session from cache — which means a test can silently
  // exercise the previous run's app.js. Clear it, or spend an hour proving a
  // regex works while watching it not work.
  await page.evaluate(async () => {
    if (!navigator.serviceWorker) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(500);
  return {browser, ctx, page, errors, consoleErrors, bad};
}
const problems = h => [...h.errors.map(x => 'pageerror: ' + x), ...h.consoleErrors.map(x => 'console: ' + x), ...h.bad.map(x => 'http: ' + x)];
module.exports = {open, problems, BASE};
