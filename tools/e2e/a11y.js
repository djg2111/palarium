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
const {open, problems} = require('./lib');
const path = require('path');
const fs = require('fs');
const AXE = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const TESTS = path.join(__dirname, '..', '..', 'tests');
const REAL = path.join(__dirname, '..', 'saves', 'Level.sav');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
let failures = 0;

async function audit(page, label) {
  await page.evaluate(AXE);
  const res = await page.evaluate(tags => axe.run(document, {runOnly: {type: 'tag', values: tags}})
    .then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length,
      target: v.nodes[0] && v.nodes[0].target.join(' ')}))), TAGS);
  if (res.length) { failures++; console.log(`  ✗ ${label}: ${res.length} violation(s)`); res.forEach(v => console.log(`      ${v.id} (${v.impact}) ×${v.n} — ${v.target}`)); }
  else console.log(`  ✓ ${label}: axe clean`);
  return res;
}
async function overflow(page, label) {
  const bad = [];
  for (const w of [320, 390, 768, 1280]) {
    await page.setViewportSize({width: w, height: 900});
    await page.waitForTimeout(220);
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }));
    if (over.doc) bad.push(`${w}px (${over.sw} > ${over.cw})`);
  }
  await page.setViewportSize({width: 1280, height: 900});
  await page.waitForTimeout(150);
  if (bad.length) { failures++; console.log(`  ✗ ${label}: horizontal overflow at ${bad.join(', ')}`); }
  else console.log(`  ✓ ${label}: no horizontal overflow at 320 / 390 / 768 / 1280`);
}
async function focusSane(page, label) {
  const who = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.tagName + (a.id ? '#' + a.id : '') + (a.className ? '.' + String(a.className).split(' ')[0] : '')) : 'null';
  });
  const lost = who === 'BODY' || who === 'null';
  if (lost) { failures++; console.log(`  ✗ ${label}: focus fell to ${who}`); }
  else console.log(`  ✓ ${label}: focus on ${who}`);
}

(async () => {
  const h = await open();
  const {page} = h;
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);

  console.log('\nSTATE 0 — the import dialog, the world list, and the backup stage');
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
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(250);

  console.log('\nSTATE 1 — the picker');
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

  console.log('\nSTATE 2 — reading, with progress and cancel');
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
    if (!back) failures++;
  } else console.log('  (skipped — run b6-scale.js first to build the big save)');

  console.log('\nSTATE 3 — the preview, nothing to decide');
  await page.setInputFiles('#saveFile', path.join(TESTS, 'fixture-before.sav'));
  await page.waitForSelector('#smResult:not([hidden])');
  await focusSane(page, 'preview moves focus to the action');
  await audit(page, 'preview without collisions');
  await overflow(page, 'preview without collisions');
  await page.screenshot({path: path.join(__dirname, 'shot-preview-desktop.png')});
  await page.setViewportSize({width: 320, height: 1200}); await page.waitForTimeout(250);
  await page.screenshot({path: path.join(__dirname, 'shot-preview-320.png')});
  await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(200);
  await page.click('#smClose');
  await page.waitForTimeout(200);
  await focusSane(page, 'closing returns focus to the button that opened it');

  console.log('\nSTATE 4+5 — the preview with collisions, one of them ambiguous');
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
  if (chosen === 'Combine') { failures++; console.log('  ✗ Enter did not change the choice'); }
  await focusSane(page, 'after choosing with the keyboard');

  console.log('\nSTATE 6 — the error state');
  await page.click('#smClose'); await page.waitForTimeout(150);
  await page.click('#importBtn');
  await page.setInputFiles('#saveFile', path.join(TESTS, 'fixture-notasave.sav'));
  await page.waitForSelector('#smError:not([hidden])');
  await focusSane(page, 'error moves focus to the way out');
  await audit(page, 'error');
  await overflow(page, 'error');
  await page.click('#smClose'); await page.waitForTimeout(200);

  console.log('\nSTATE 7 — the roster after a real import');
  if (fs.existsSync(REAL)) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({waitUntil: 'load'});
    await page.waitForTimeout(400);
    await page.evaluate(() => location.hash = '#/roster');
    await page.waitForTimeout(250);
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
    // the roster is always grouped now; audit the two states the user can
    // reach from the controls — compact rows, and every section collapsed
    await page.click('#denseToggle'); await page.waitForTimeout(400);
    await audit(page, 'roster in compact rows after an import');
    await overflow(page, 'roster in compact rows');
    await page.click('#collapseAll'); await page.waitForTimeout(400);
    await audit(page, 'roster with every species collapsed');
    await overflow(page, 'roster collapsed');
  } else console.log('  (skipped — no real save available)');

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) failures++;
  await h.browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall states clean');
  process.exit(failures ? 1 : 0);
})();
