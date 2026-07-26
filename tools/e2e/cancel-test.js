// Cancel must actually cancel: a read still inside arrayBuffer() must not
// clobber the next one.
const {open, problems} = require('./lib');
const path = require('path'); const fs = require('fs'); const os = require('os');
const BIG = path.join(os.tmpdir(), 'palarium-scale-400-3000.sav');
const TESTS = path.join(__dirname, '..', '..', 'tests');
(async () => {
  const h = await open(); const {page} = h;
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'}); await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster'); await page.waitForTimeout(300);
  await page.click('#importBtn');
  await page.setInputFiles('#saveFile', BIG);
  await page.waitForSelector('#smBusy:not([hidden])');
  await page.click('#smCancel');
  await page.setInputFiles('#saveFile', path.join(TESTS, 'fixture-before.sav'));
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 30000});
  await page.waitForTimeout(2500);   // long enough for the cancelled 400 MB read to land if it were going to
  const summary = (await page.textContent('#smSummary')).trim();
  const ok = /Found 7 pals/.test(summary);
  console.log((ok ? '✓' : '✗') + ' after cancelling a 400 MB read, the next file wins: ' + summary);
  const probs = problems(h);
  console.log('problems:', probs.length ? probs : 'none');
  await h.browser.close();
  process.exit(ok && !probs.length ? 0 : 1);
})();
