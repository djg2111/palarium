// Benchmark 1 + 2: pick a save, see real pals in the roster, filter them truthfully.
const {open, problems} = require('./lib');
const path = require('path');
const SAVE = process.argv[2] || path.join(__dirname, '..', 'saves', 'Level.sav');
(async () => {
  const h = await open();
  const {page} = h;
  await page.click('.tabs button[data-t="roster"]').catch(() => {});
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  const t0 = Date.now();
  await page.setInputFiles('#saveFile', SAVE);
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 60000});
  const parseMs = Date.now() - t0;
  const summary = await page.textContent('#smSummary');
  console.log('summary:', summary.trim());
  console.log('wall time from file pick to preview:', parseMs, 'ms');
  const applyLabel = await page.textContent('#smApply');
  await page.click('#smApply');
  await page.waitForTimeout(800);
  const stats = await page.textContent('#rosterStats');
  console.log('apply button said:', applyLabel.trim());
  console.log('roster stats now:', stats.trim());
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_roster')).length);
  const owned = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_owned')).length);
  console.log('roster entries in storage:', n, '· owned species:', owned);
  // benchmark 2: filter by a passive and check the answer is truthful
  const opts = await page.$$eval('#rosterPassiveFilter option', os => os.map(o => o.value).filter(Boolean));
  const pick = await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('palbreed_roster'));
    const counts = {};
    for (const e of r) for (const p of e.ps) counts[p] = (counts[p] || 0) + 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? {name: best[0], n: best[1]} : null;
  });
  if (pick && opts.includes(pick.name)) {
    await page.selectOption('#rosterPassiveFilter', pick.name);
    await page.waitForTimeout(300);
    // Tiles is the default view and shows one tile per species, so a per-pal
    // count only exists in Rows. Counting .rosrow in Tiles reported 0 forever.
    await page.click('#rosterView button[data-v="rows"]');
    await page.waitForTimeout(300);
    const shown = await page.$$eval('#rosterList .rosrow', els => els.length);
    console.log(`filter "${pick.name}": storage says ${pick.n}, roster shows ${shown}`, shown === pick.n ? 'MATCH ✓' : 'MISMATCH ✗');
  } else console.log('passive filter: could not pick a common passive', pick);
  await page.screenshot({path: path.join(__dirname, 'shot-roster-desktop.png'), fullPage: false});
  console.log('problems:', problems(h).length ? problems(h) : 'none');
  await h.browser.close();
})();
