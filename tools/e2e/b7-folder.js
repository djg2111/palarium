/* The folder picker and the world list.
 *
 * showDirectoryPicker() cannot be driven from Playwright — it is a real OS
 * dialog behind a user gesture. So the handle is injected instead: a stub
 * FileSystemDirectoryHandle backed by a directory on disk, with the same
 * entries()/getFile() surface the real one has. That exercises everything
 * downstream of the picker, which is all of the code we wrote.
 *
 *   node b7-folder.js [pathToSaveGamesFolder]
 */
const {open, problems} = require('./lib');
const path = require('path');
const fs = require('fs');

const ROOT = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Pal', 'Saved', 'SaveGames');
let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

// serialise the folder tree, with file bytes, so the page can rebuild it
function snapshot(dir, depth) {
  const out = {name: path.basename(dir), kind: 'directory', children: []};
  let entries = [];
  try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth > 0) out.children.push(snapshot(full, depth - 1)); }
    else if (/^(level|levelmeta)\.sav$/i.test(e.name)) {
      out.children.push({name: e.name, kind: 'file', data: [...fs.readFileSync(full)]});
    }
  }
  return out;
}

(async () => {
  if (!fs.existsSync(ROOT)) { console.log(`no save folder at ${ROOT} — skipping`); process.exit(0); }
  const tree = snapshot(ROOT, 3);
  const h = await open();
  const {page} = h;
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);

  // stub showDirectoryPicker with a handle over the snapshot
  await page.evaluate(tree => {
    function mk(node) {
      if (node.kind === 'file') {
        return {kind: 'file', name: node.name,
          getFile: async () => new File([new Uint8Array(node.data)], node.name)};
      }
      return {
        kind: 'directory', name: node.name,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        entries: async function* () { for (const c of node.children) yield [c.name, mk(c)]; },
      };
    }
    window.__pickCount = 0;
    window.showDirectoryPicker = async () => { window.__pickCount++; return mk(tree); };
  }, tree);

  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);

  console.log('\nFOLDER PICKER');
  await page.click('#savereadBtn');
  await page.waitForSelector('#smPick:not([hidden])');
  const dirBtnVisible = await page.$eval('#smChooseDir', e => !e.hidden);
  check('the folder button is offered when the browser supports it', dirBtnVisible, true);

  const t0 = Date.now();
  await page.click('#smChooseDir');
  await page.waitForSelector('#smWorlds:not([hidden])', {timeout: 30000});
  console.log(`  scanned and named every world in ${Date.now() - t0} ms`);

  const sum = (await page.textContent('#smWorldsSum')).trim();
  console.log('  ' + sum);
  const rows = await page.$$eval('#smWorldList .worldbtn', els => els.map(e => ({
    name: e.querySelector('.wname').textContent,
    sub: e.querySelector('.wsub').textContent,
  })));
  for (const r of rows) console.log(`    ${r.name}  —  ${r.sub}`);
  check('at least one world was found', rows.length > 0, true);
  check('the world is named from LevelMeta.sav, not the folder GUID',
    rows.some(r => !/^[0-9A-F]{32}$/i.test(r.name)), true);
  check('the row says who plays it and how far in it is',
    rows.some(r => /Lv \d+/.test(r.sub) && /day \d+/.test(r.sub)), true);

  await page.screenshot({path: path.join(__dirname, 'shot-worlds-desktop.png')});
  await page.setViewportSize({width: 320, height: 1000}); await page.waitForTimeout(250);
  await page.screenshot({path: path.join(__dirname, 'shot-worlds-320.png')});
  await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(200);

  console.log('\nREADING THE WORLD YOU PICK');
  await page.click('#smWorldList .worldbtn');
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 60000});
  const summary = (await page.textContent('#smSummary')).trim();
  console.log('  ' + summary);
  check('picking a world reads its Level.sav', /Found \d+ pals/.test(summary), true);

  console.log('\nTHE FOLDER IS REMEMBERED');
  // The full round-trip can't be driven headlessly: a real
  // FileSystemDirectoryHandle is structured-cloneable and survives IndexedDB,
  // but the stub above needs methods and so cannot be stored. What IS testable
  // is the store itself, and that a handle we can't use never breaks the dialog.
  const idbWorks = await page.evaluate(async () => {
    const openDb = () => new Promise((res, rej) => {
      const rq = indexedDB.open('palarium', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('handles');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const db = await openDb();
    await new Promise(r => { const t = db.transaction('handles', 'readwrite');
      t.objectStore('handles').put({marker: 'round-trip'}, 'saveDir'); t.oncomplete = r; });
    const back = await new Promise(r => { const t = db.transaction('handles', 'readonly');
      const g = t.objectStore('handles').get('saveDir'); t.oncomplete = () => r(g.result); });
    db.close();
    return !!back && back.marker === 'round-trip';
  });
  check('the handle store round-trips a value', idbWorks, true);
  console.log('  (that a real directory handle survives IndexedDB is a browser guarantee');
  console.log('   this stub cannot stand in for — the reopen path is checked by hand)');

  // a stored value the app cannot use must leave the dialog working
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(250);
  await page.click('#savereadBtn');
  await page.waitForTimeout(900);
  const pickUsable = await page.$eval('#smPick', e => !e.hidden);
  check('an unusable stored handle leaves the picker working rather than breaking it', pickUsable, true);
  await page.click('#smClose'); await page.waitForTimeout(200);

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) failures++;
  await h.browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall assertions passed');
  process.exit(failures ? 1 : 0);
})();
