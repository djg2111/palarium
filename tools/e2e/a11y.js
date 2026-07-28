/* Accessibility, keyboard and overflow for every state the save reader adds.
 *
 * The site was clean across fifteen states before this; these are the new ones
 * and they must not regress it.
 *   0 the import dialog, the world list, the backup confirm
 *   1 the picker           2 reading (progress + cancel)
 *   3 the preview, no collisions            4 the preview with collisions
 *   5 the ambiguous-match preview           6 the error state
 *   7 the roster after an import (level chips, in-game names, 200 tiles)
 */
const {makeChecks} = require('./checks');
const path = require('path');
const fs = require('fs');
const TESTS = path.join(__dirname, '..', '..', 'tests');
const REAL = path.join(__dirname, '..', 'saves', 'Level.sav');

const {audit, overflow, focusSane, fail, failed} = makeChecks();

// Every group opens on the roster with an empty store, which is where the
// import button lives; the seeding itself is the runner's job now.
const onRoster = async page => {
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);
};

const GROUPS = [

{name: 'import-dialog', seed: 'cold', title: 'STATE 0 — the import dialog, the world list, and the backup stage', run: async (page) => {
  await onRoster(page);
  // A real folder on disk: Playwright can drive <input webkitdirectory> with a
  // directory path, so this is the actual mechanism rather than a stand-in.
  const fakeRoot = path.join(require('os').tmpdir(), 'palarium-a11y-saves');
  const worldDir = path.join(fakeRoot, 'AWorld');
  fs.mkdirSync(worldDir, {recursive: true});
  for (const n of ['Level.sav', 'LevelMeta.sav'])
    fs.copyFileSync(path.join(TESTS, 'fixture-before.sav'), path.join(worldDir, n));

  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  await audit(page, 'import dialog offering both sources');
  await overflow(page, 'import dialog');
  await page.setInputFiles('#saveDir', fakeRoot);
  await page.waitForSelector('#smWorlds:not([hidden])', {timeout: 20000});
  await focusSane(page, 'the world list takes focus');
  await audit(page, 'world list');
  await overflow(page, 'world list');
  await page.click('#smClose');
  await page.waitForTimeout(200);

  // the backup confirm stage
  const bk = path.join(require('os').tmpdir(), 'palarium-a11y-backup.json');
  fs.writeFileSync(bk, JSON.stringify({app: 'palarium', savedAt: new Date().toISOString(),
    roster: [{id: 'x', k: 'SheepBall', ps: [], g: 'M', nick: '', note: '', iv: null}], plans: [], owned: ['SheepBall']}));
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  await page.setInputFiles('#importFile', bk);
  await page.waitForSelector('#smBackup:not([hidden])', {timeout: 15000});
  await focusSane(page, 'the backup confirm takes focus');
  await audit(page, 'backup confirm');
  await overflow(page, 'backup confirm');
  await page.click('#smClose');
  await page.waitForTimeout(200);
}},

{name: 'picker', seed: 'cold', title: 'STATE 1 — the picker', run: async (page) => {
  await onRoster(page);
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  await focusSane(page, 'opening the dialog moves focus into it');
  await audit(page, 'picker');
  await overflow(page, 'picker');
  // the "where is my save" disclosure must open from the keyboard
  await page.keyboard.press('Tab');
  const onSummary = await page.evaluate(() => document.activeElement.tagName);
  console.log('  tab from the folder button lands on:', onSummary);
  await page.click('#soverlay .moredet summary');
  await page.waitForTimeout(150);
  await audit(page, 'picker with the save-location disclosure open');
  await overflow(page, 'picker with disclosure open');

}},

{name: 'reading', seed: 'cold', title: 'STATE 2 — reading, with progress and cancel', run: async (page) => {
  await onRoster(page);
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  // a big file so the busy state is observable
  const big = path.join(require('os').tmpdir(), 'palarium-scale-400-3000.sav');
  if (fs.existsSync(big)) {
    await page.setInputFiles('#saveFile', big);
    await page.waitForSelector('#smBusy:not([hidden])');
    await focusSane(page, 'reading state keeps focus');
    await audit(page, 'reading');
    await page.click('#smCancel');
    await page.waitForTimeout(200);
    await focusSane(page, 'cancel returns focus to the picker');
    const back = await page.$eval('#smPick', e => !e.hidden);
    console.log(back ? '  ✓ cancel returns to the picker' : '  ✗ cancel did not return to the picker');
    if (!back) fail();
  } else console.log('  (skipped — run b6-scale.js first to build the big save)');

}},

{name: 'preview', seed: 'cold', title: 'STATE 3 — the preview, nothing to decide', run: async (page) => {
  await onRoster(page);
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  await page.setInputFiles('#saveFile', path.join(TESTS, 'fixture-before.sav'));
  await page.waitForSelector('#smResult:not([hidden])');
  await focusSane(page, 'preview moves focus into the result');
  // ...and to the ANSWER, not to the button that commits it. Focusing #smApply
  // scrolled the dialog 161px (1366) / 524px (360) past its own summary, the
  // scope filter and the first conflict row.
  {
    const land = await page.evaluate(() => {
      const m = document.querySelector('#soverlay .modal');
      const sum = document.getElementById('smSummary').getBoundingClientRect();
      return {onResult: document.activeElement.id === 'smResult',
        summaryVisible: sum.top >= m.getBoundingClientRect().top - 1 && sum.bottom <= m.getBoundingClientRect().bottom,
        scrolled: Math.round(m.scrollTop)};
    });
    if (land.onResult && land.summaryVisible) console.log(`  ✓ the preview opens on its own summary (${land.scrolled}px in)`);
    else { console.log(`  ✗ the preview opens past its answer: ${JSON.stringify(land)}`); fail(); }
    // everything the Import button writes has to be previewed, stars included
    const said = await page.evaluate(() => [...document.querySelectorAll('#smPreview .sub')].map(p => p.textContent).join(' '));
    const stars = await page.evaluate(() => new Set(smPlan.allPals.map(sp => sp.palKey).filter(k => !owned.has(k))).size);
    if (!stars || /will be starred as owned/.test(said)) console.log(`  ✓ the preview names the ${stars} species it will star`);
    else { console.log(`  ✗ ${stars} species get starred and the preview does not say so`); fail(); }
  }
  await audit(page, 'preview without collisions');
  await overflow(page, 'preview without collisions');
  await page.screenshot({path: path.join(__dirname, 'shot-preview-desktop.png')});
  await page.setViewportSize({width: 320, height: 1200}); await page.waitForTimeout(250);
  await page.screenshot({path: path.join(__dirname, 'shot-preview-320.png')});
  await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(200);
  await page.click('#smClose');
  await page.waitForTimeout(200);
  await focusSane(page, 'closing returns focus to the button that opened it');

  // ...and when it cannot. The opener is often gone by the time the dialog
  // closes — a toast's "Read my save" button is removed when the toast expires,
  // and a view change underneath leaves #importBtn inside a display:none
  // section, where focus() is a silent no-op.
  await page.evaluate(() => { location.hash = '#/roster'; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.getElementById('importBtn'); b.focus(); b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => showTab('breed'));
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await focusSane(page, 'closing when the opener has been hidden underneath');

}},

{name: 'collisions', seed: 'cold', title: 'STATE 4+5 — the preview with collisions, one of them ambiguous', run: async (page) => {
  await onRoster(page);
  await page.evaluate(() => {
    localStorage.setItem('palbreed_roster', JSON.stringify([
      {id: 'h1', k: 'SheepBall', ps: ['Musclehead'], g: 'M', nick: 'Woolly', note: 'my first pal', iv: null},
      {id: 'h2', k: 'Anubis', ps: ['Musclehead'], g: 'M', nick: '', note: 'breeding project', iv: null},
    ]));
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(250);
  await page.click('#importBtn');
  await page.setInputFiles('#saveFile', path.join(TESTS, 'fixture-before.sav'));
  await page.waitForSelector('#smResult:not([hidden])');
  await audit(page, 'preview with collisions and an ambiguous match');
  await overflow(page, 'preview with collisions');
  await page.screenshot({path: path.join(__dirname, 'shot-conflicts-desktop.png')});
  await page.setViewportSize({width: 320, height: 1400}); await page.waitForTimeout(250);
  await page.screenshot({path: path.join(__dirname, 'shot-conflicts-320.png')});
  await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(200);
  // drive the whole collision row from the keyboard
  await page.focus('#smConflicts .confseg button');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const chosen = await page.$eval('#smConflicts .confseg button.on', b => b.textContent);
  console.log('  keyboard changed the collision choice to:', chosen);
  if (chosen === 'Combine') { fail(); console.log('  ✗ Enter did not change the choice'); }
  await focusSane(page, 'after choosing with the keyboard');

}},

{name: 'error', seed: 'cold', title: 'STATE 6 — the error state', run: async (page) => {
  await onRoster(page);
  await page.click('#importBtn');
  await page.setInputFiles('#saveFile', path.join(TESTS, 'fixture-notasave.sav'));
  await page.waitForSelector('#smError:not([hidden])');
  await focusSane(page, 'error moves focus to the way out');
  await audit(page, 'error');
  await overflow(page, 'error');
  await page.click('#smClose'); await page.waitForTimeout(200);

}},

{name: 'imported-roster', seed: 'cold', title: 'STATE 7 — the roster after a real import', run: async (page) => {
  if (fs.existsSync(REAL)) {
    await onRoster(page);
    await page.click('#importBtn');
    await page.setInputFiles('#saveFile', REAL);
    await page.waitForSelector('#smResult:not([hidden])', {timeout: 60000});
    await page.click('#smApply');
    await page.waitForTimeout(1500);
    await audit(page, 'roster holding 200 imported pals');
    await overflow(page, 'roster holding 200 imported pals');
    await page.screenshot({path: path.join(__dirname, 'shot-roster-desktop.png')});
    await page.setViewportSize({width: 320, height: 900}); await page.waitForTimeout(300);
    await page.screenshot({path: path.join(__dirname, 'shot-roster-320.png')});
    await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(200);
    // The roster is always grouped; audit the three states the controls reach.
    // #denseToggle is disabled in Tiles with nothing open (js/roster.js renderRoster),
    // and #collapseAll went away with the Tiles/Rows switch — clicking either
    // where they used to be threw and this suite never reached its last states.
    await page.click('#rosterView button[data-v="rows"]'); await page.waitForTimeout(400);
    await audit(page, 'roster in rows after an import');
    await overflow(page, 'roster in rows');
    await page.click('#denseToggle'); await page.waitForTimeout(400);
    await audit(page, 'roster in compact rows after an import');
    await overflow(page, 'roster in compact rows');
    await page.click('#rosterView button[data-v="tiles"]'); await page.waitForTimeout(400);
    await page.click('#rosterList .rostile'); await page.waitForTimeout(400);
    await audit(page, 'roster tiles with a species panel open');
    await overflow(page, 'roster tiles with a panel open');
  } else console.log('  (skipped — no real save available)');
}},

];

module.exports = {
  name: 'a11y',
  groups: GROUPS,
  seeds: {cold: {}},
  fail, failed,
};

if (require.main === module) require('./audit').main(['--suite', 'a11y', ...process.argv.slice(2)]);
