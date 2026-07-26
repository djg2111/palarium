/* One Import button, the folder picker, and the world list.
 *
 *   node b7-folder.js [pathToSaveGamesFolder]
 *
 * The folder is chosen with <input webkitdirectory>, not showDirectoryPicker.
 * That matters and is the reason this test exists: Palworld saves live under
 * %LOCALAPPDATA%, Chrome blocklists the whole AppData tree as "system files",
 * and showDirectoryPicker therefore refuses the one folder anybody needs.
 * webkitdirectory is not on that blocklist — and, usefully, Playwright can
 * drive it with a real directory path, so this exercises the real mechanism
 * rather than a stub.
 */
const {open, problems} = require('./lib');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Pal', 'Saved', 'SaveGames');
let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

(async () => {
  if (!fs.existsSync(ROOT)) { console.log(`no save folder at ${ROOT} — skipping`); process.exit(0); }
  const h = await open();
  const {page} = h;
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);

  console.log('\nONE IMPORT BUTTON');
  const buttons = await page.$$eval('.collacts .alink', els => els.map(e => e.textContent.trim()));
  console.log('  roster actions:', JSON.stringify(buttons));
  check('one Import button, not an Import and a Read-my-save',
    buttons.filter(b => /import|read my save/i.test(b)).length, 1);

  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  const heads = await page.$$eval('#smPick .smh3', els => els.map(e => e.textContent.trim()));
  check('both sources are described before anything is picked', heads,
    ['From my Palworld save', 'From a Palarium backup']);
  await page.waitForTimeout(400);   // let the dialog's pop animation settle
  await page.screenshot({path: path.join(__dirname, 'shot-import-desktop.png')});

  console.log('\nFOLDER PICKER');
  const t0 = Date.now();
  await page.setInputFiles('#saveDir', ROOT);
  await page.waitForSelector('#smWorlds:not([hidden])', {timeout: 60000});
  console.log(`  scanned and named every world in ${Date.now() - t0} ms`);
  console.log('  ' + (await page.textContent('#smWorldsSum')).trim());
  const rows = await page.$$eval('#smWorldList .worldbtn', els => els.map(e => ({
    name: e.querySelector('.wname').textContent,
    sub: e.querySelector('.wsub').textContent,
    path: e.querySelector('.wpath').textContent,
  })));
  for (const r of rows) console.log(`    ${r.name}  —  ${r.sub}   [${r.path}]`);
  check('at least one world was found', rows.length > 0, true);
  check('named from LevelMeta.sav, not the folder GUID',
    rows.some(r => !/^[0-9A-F]{32}$/i.test(r.name)), true);
  check('the row says who plays it and how far in it is',
    rows.some(r => /Lv \d+/.test(r.sub) && /day \d+/.test(r.sub)), true);
  check('timestamped backup copies are not offered as worlds',
    rows.some(r => /backup/i.test(r.path)), false);
  check('the Steam account id is kept off the screen',
    rows.some(r => /\d{17}/.test(r.path)), false);

  await page.screenshot({path: path.join(__dirname, 'shot-worlds-desktop.png')});
  await page.setViewportSize({width: 320, height: 1000});
  await page.waitForTimeout(250);
  await page.screenshot({path: path.join(__dirname, 'shot-worlds-320.png')});
  await page.setViewportSize({width: 1280, height: 900});
  await page.waitForTimeout(200);

  console.log('\nREADING THE WORLD YOU PICK');
  await page.click('#smWorldList .worldbtn');
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 60000});
  const summary = (await page.textContent('#smSummary')).trim();
  console.log('  ' + summary);
  check('picking a world reads its Level.sav', /Found \d+ pals/.test(summary), true);
  await page.click('#smApply');
  await page.waitForTimeout(1000);

  console.log('\nRESTORING A BACKUP, IN THE SAME DIALOG');
  const backup = await page.evaluate(() => JSON.stringify({
    app: 'palarium', savedAt: new Date().toISOString(),
    roster: JSON.parse(localStorage.getItem('palbreed_roster')),
    plans: [], owned: JSON.parse(localStorage.getItem('palbreed_owned')),
  }));
  const tmp = path.join(os.tmpdir(), 'palarium-backup-test.json');
  fs.writeFileSync(tmp, backup);
  await page.evaluate(() => localStorage.setItem('palbreed_roster', '[]'));
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(250);
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  await page.setInputFiles('#importFile', tmp);
  await page.waitForSelector('#smBackup:not([hidden])', {timeout: 15000});
  const bsum = (await page.textContent('#smBackupSum')).trim();
  const bwarn = (await page.textContent('#smBackupWarn')).trim();
  console.log('  ' + bsum);
  console.log('  ' + bwarn);
  check('the backup is described before it is applied', /holds \d+ pals/.test(bsum), true);
  check('and it says plainly what it replaces', /replaces your current roster/.test(bwarn), true);
  await page.screenshot({path: path.join(__dirname, 'shot-backup-desktop.png')});
  await page.click('#smBackupApply');
  await page.waitForTimeout(800);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_roster')).length);
  check('restoring puts the roster back', restored > 100, true);

  console.log('\nA FILE THAT IS NOT A BACKUP');
  await page.click('#importBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  const junk = path.join(os.tmpdir(), 'palarium-not-a-backup.json');
  fs.writeFileSync(junk, '{"hello":"world"}');
  await page.setInputFiles('#importFile', junk);
  await page.waitForSelector('#smError:not([hidden])', {timeout: 15000});
  const emsg = (await page.textContent('#smErrMsg')).trim();
  console.log('  ' + emsg);
  check('it says so and changes nothing', /Nothing was changed\.$/.test(emsg), true);
  await page.click('#smClose');

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) failures++;
  await h.browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall assertions passed');
  process.exit(failures ? 1 : 0);
})();
