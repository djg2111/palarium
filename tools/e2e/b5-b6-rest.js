/* Benchmarks 5 and 6.
 *
 * 5. The Planner's "use my pals" partner mode and Breedable-now reflect the
 *    real collection rather than the sliver someone typed.
 * 6. A very large save, a save from another game, and a truncated file each
 *    fail with a clear message and leave the existing roster untouched.
 */
const {open, problems} = require('./lib');
const path = require('path');
const fs = require('fs');
const SAVE = process.argv[2] || path.join(__dirname, '..', 'saves', 'Level.sav');
const TESTS = path.join(__dirname, '..', '..', 'tests');

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

(async () => {
  const h = await open();
  const {page} = h;

  console.log('\nBENCHMARK 5 — the Planner and Breedable-now see the real collection');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);

  await page.evaluate(() => location.hash = '#/hatch');
  await page.waitForTimeout(600);
  const hatchBefore = (await page.textContent('#hatchStats')).trim();
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);
  const stripBefore = await page.$$eval('#rosterStrip button', e => e.length).catch(() => 0);

  await page.click('#importBtn');
  await page.setInputFiles('#saveFile', SAVE);
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 60000});
  await page.click('#smApply');
  await page.waitForTimeout(1200);

  await page.evaluate(() => location.hash = '#/hatch');
  await page.waitForTimeout(1500);
  const hatchAfter = (await page.textContent('#hatchStats')).trim();
  console.log('  Breedable now, before import:', JSON.stringify(hatchBefore));
  console.log('  Breedable now, after import: ', JSON.stringify(hatchAfter));
  const hatchTiles = await page.$$eval('#hatchList > *', e => e.length);
  check('Breedable-now went from nothing to a real list', [hatchBefore === '' || /^0/.test(hatchBefore), hatchTiles > 0], [true, true]);

  // the Planner's quick-add strip is the "use my pals" surface
  await page.evaluate(() => location.hash = '#/plan');
  await page.waitForTimeout(700);
  const stripAfter = await page.$$eval('#rosterStrip button', e => e.length);
  console.log(`  Planner quick-add-from-roster: ${stripBefore} entries before, ${stripAfter} after`);
  check('the Planner can start from the imported pals', stripAfter > 50, true);

  // and the owned-only pair filter now has something to filter on
  await page.evaluate(() => location.hash = '#/reverse');
  await page.waitForTimeout(500);
  const ownedCount = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_owned')).length);
  check('every species in the save is starred as owned', ownedCount >= 60, true);
  console.log('  owned species after import:', ownedCount);

  console.log('\nBENCHMARK 6 — a save from another game, a truncated file, and a huge one');
  const rosterBefore = await page.evaluate(() => localStorage.getItem('palbreed_roster'));
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);

  for (const [file, label] of [
    ['fixture-notasave.sav', 'a file that is not a save at all'],
    ['fixture-truncated.sav', 'a truncated save'],
  ]) {
    await page.click('#importBtn');
    await page.setInputFiles('#saveFile', path.join(TESTS, file));
    await page.waitForSelector('#smError:not([hidden])', {timeout: 20000});
    const msg = (await page.textContent('#smErrMsg')).trim();
    console.log(`  ${label}: "${msg}"`);
    check(`  ${label} says what happened and that nothing changed`, /Nothing was changed\.$/.test(msg), true);
    await page.click('#smClose');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => localStorage.getItem('palbreed_roster'));
    check(`  ${label} left the roster untouched`, after === rosterBefore, true);
  }

  // A save that claims to decompress past what a tab can hold. Built here
  // rather than checked in — it is 400 MB on disk.
  const bigPath = path.join(require('os').tmpdir(), 'palarium-huge.sav');
  if (!fs.existsSync(bigPath)) {
    const head = Buffer.alloc(12);
    head.writeUInt32LE(4000000000, 0);          // claims ~4 GB decompressed
    head.writeUInt32LE(400 * 1024 * 1024, 4);
    head.write('PlM', 8, 'latin1'); head[11] = 0x31;
    const fd = fs.openSync(bigPath, 'w');
    fs.writeSync(fd, head);
    const block = Buffer.alloc(4 * 1024 * 1024, 0x5a);
    for (let i = 0; i < 100; i++) fs.writeSync(fd, block);
    fs.closeSync(fd);
  }
  console.log(`  built a ${(fs.statSync(bigPath).size / 1048576).toFixed(0)} MB save claiming 4 GB decompressed`);
  await page.click('#importBtn');
  const t0 = Date.now();
  await page.setInputFiles('#saveFile', bigPath);
  await page.waitForSelector('#smError:not([hidden])', {timeout: 120000});
  const bigMsg = (await page.textContent('#smErrMsg')).trim();
  console.log(`  400 MB save: "${bigMsg}" (${Date.now() - t0} ms, no hang)`);
  check('  the huge save fails honestly instead of killing the tab', /Nothing was changed\.$/.test(bigMsg), true);
  await page.click('#smClose');
  await page.waitForTimeout(200);
  const afterBig = await page.evaluate(() => localStorage.getItem('palbreed_roster'));
  check('  and left the roster untouched', afterBig === rosterBefore, true);

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) failures++;
  await h.browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall assertions passed');
  process.exit(failures ? 1 : 0);
})();
