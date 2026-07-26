/* Benchmarks 3 and 4, and the one rule in the brief with no exceptions.
 *
 * 3. First import onto a hand-typed roster: the pals already there are
 *    recognised and offered for resolution in one pass — not silently doubled,
 *    not silently merged.
 * 4. Play for an hour, import again: nothing duplicates, nothing is asked about
 *    twice, new pals appear, and every nickname and note typed here survives
 *    byte-identical — including on a pal renamed in-game in between — while the
 *    level and IVs update.
 */
const {open, problems} = require('./lib');
const path = require('path');
const BEFORE = path.join(__dirname, '..', '..', 'tests', 'fixture-before.sav');
const AFTER = path.join(__dirname, '..', '..', 'tests', 'fixture-after.sav');

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

(async () => {
  const h = await open();
  const {page} = h;

  // ---- a hand-typed roster, of the kind the app itself manufactures ----
  // Lamball records only species + one passive + a note (what Duplicate makes).
  // Two Anubis entries are identical to each other, which is a normal Tuesday
  // for a breeder and is what makes the save's two Anubis ambiguous.
  // Foxparks isn't in the save at all and must be left completely alone.
  await page.evaluate(() => {
    localStorage.setItem('palbreed_roster', JSON.stringify([
      {id: 'hand-lamball', k: 'SheepBall', ps: ['Musclehead'], g: 'M', nick: 'Woolly', note: 'my first pal', iv: null},
      {id: 'hand-anubis', k: 'Anubis', ps: ['Musclehead'], g: 'M', nick: '', note: 'breeding project', iv: null},
      {id: 'hand-foxparks', k: 'Kitsunebi', ps: [], g: null, nick: 'Sparky', note: 'do not touch', iv: null},
    ]));
    localStorage.setItem('palbreed_owned', JSON.stringify(['SheepBall', 'Anubis', 'Kitsunebi']));
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);

  console.log('\nBENCHMARK 3 — first import onto a hand-typed roster');
  await page.click('#savereadBtn');
  await page.setInputFiles('#saveFile', BEFORE);
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 30000});

  const conflictCount = await page.$$eval('#smConflicts .confrow', e => e.length);
  check('both hand entries that exist in the save are raised, in one pass', conflictCount, 2);
  const ambiguous = await page.$$eval('#smConflicts select', e => e.length);
  check('the two-Anubis case is ambiguous and offers a choice rather than picking', ambiguous, 1);
  const defaultChoice = await page.$eval('#smConflicts .confseg button.on', b => b.textContent);
  check('the unambiguous one defaults to Combine', defaultChoice, 'Combine');
  const ambDefault = await page.$eval('#smConflicts select', s => s.options[s.selectedIndex].textContent.slice(0, 21));
  check('the ambiguous one defaults to keeping them separate', ambDefault, 'Keep them separate — ');
  const summary1 = (await page.textContent('#smSummary')).trim();
  console.log('  summary:', summary1);

  await page.screenshot({path: path.join(__dirname, 'shot-conflicts.png')});
  await page.click('#smApply');
  await page.waitForTimeout(600);

  const after1 = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_roster')));
  const lamball = after1.find(r => r.id === 'hand-lamball');
  check('the combined Lamball is still one entry, not two', after1.filter(r => r.k === 'SheepBall').length, 1);
  check('  its typed nickname survived the combine', lamball.nick, 'Woolly');
  check('  its typed note survived the combine', lamball.note, 'my first pal');
  check('  it took the save’s IVs', lamball.iv, [50, 60, 70]);
  check('  it took the save’s level', lamball.lv, 12);
  check('  it took the save’s full passive set', lamball.ps.sort(), ['Ferocious', 'Musclehead']);
  check('  it is now linked by the save’s instance id', lamball.sid, '1111111111111111111111111111aaaa');

  const anubis = after1.filter(r => r.k === 'Anubis');
  // mine, the save's two plain Anubis, and the save's BOSS_Anubis — which is
  // the same species but carries Legend, so it never matched the hand entry
  check('the ambiguous Anubis was kept separate: mine plus the save’s three', anubis.length, 4);
  check('  the alpha came in as its own entry', anubis.filter(r => r.lv === 45).length, 1);
  check('  my Anubis entry was left alone', anubis.find(r => r.id === 'hand-anubis').note, 'breeding project');
  const fox = after1.find(r => r.id === 'hand-foxparks');
  check('a pal not in the save is untouched', [fox.nick, fox.note, fox.sid], ['Sparky', 'do not touch', undefined]);

  // ---- now type onto imported entries, then re-import an hour later ----
  console.log('\nBENCHMARK 4 — play for an hour, import again');
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('palbreed_roster'));
    // Cattiva is the pal renamed in-game between the two saves.
    const cat = r.find(x => x.k === 'PinkCat');
    cat.nick = 'Miso';
    cat.note = 'keeps the Legend line going — do not release';
    localStorage.setItem('palbreed_roster', JSON.stringify(r));
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  const beforeSecond = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_roster')));
  const catBefore = beforeSecond.find(r => r.k === 'PinkCat');
  console.log('  typed onto the imported Cattiva:', JSON.stringify({nick: catBefore.nick, note: catBefore.note, lv: catBefore.lv, iv: catBefore.iv}));
  console.log('  its in-game name at that point:', JSON.stringify(catBefore.gname));

  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(200);
  await page.click('#savereadBtn');
  await page.setInputFiles('#saveFile', AFTER);
  await page.waitForSelector('#smResult:not([hidden])', {timeout: 30000});

  // Nothing is asked twice. The hand Anubis still carries no save id, but both
  // save Anubis were imported as their own entries last time and are linked
  // now, so there is no unclaimed candidate left to ask about.
  const conflicts2 = await page.$$eval('#smConflicts .confrow', e => e.length);
  const conflictWrapHidden = await page.$eval('#smConflictWrap', e => e.hidden);
  check('nothing is asked about a second time', [conflicts2, conflictWrapHidden], [0, true]);
  const summary2 = (await page.textContent('#smSummary')).trim();
  console.log('  summary:', summary2);
  check('exactly the one newly caught pal is offered as new', /^Found 8 pals in your save\. 1 new pal to add/.test(summary2), true);

  const countBefore = beforeSecond.length;
  await page.click('#smApply');
  await page.waitForTimeout(600);
  const after2 = await page.evaluate(() => JSON.parse(localStorage.getItem('palbreed_roster')));

  check('one new pal appeared and nothing duplicated', after2.length, countBefore + 1);
  check('  the new pal is there', !!after2.find(r => r.k === 'FoxMage'), true);
  check('no species gained a phantom copy', after2.filter(r => r.k === 'PinkCat').length, 1);

  const catAfter = after2.find(r => r.k === 'PinkCat');
  check('THE RULE: the typed nickname is byte-identical', catAfter.nick, catBefore.nick);
  check('THE RULE: the typed note is byte-identical', catAfter.note, catBefore.note);
  check('  even though the pal was renamed in-game', catAfter.gname, 'RenamedInGame');
  check('  and the in-game name is visible, but not in the nick field', catAfter.gname !== catAfter.nick, true);
  check('  the level updated', [catBefore.lv, catAfter.lv], [30, 41]);
  check('  the IVs updated', [catBefore.iv, catAfter.iv], [[100, 0, 45], [100, 5, 45]]);
  const lam2 = after2.find(r => r.id === 'hand-lamball');
  check('the hand-typed Lamball kept its nickname and note through a second import', [lam2.nick, lam2.note], ['Woolly', 'my first pal']);
  check('  and its level updated', [lamball.lv, lam2.lv], [12, 25]);
  const fox2 = after2.find(r => r.id === 'hand-foxparks');
  check('the pal that is in no save is still untouched', [fox2.nick, fox2.note], ['Sparky', 'do not touch']);

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) failures++;
  await h.browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall assertions passed');
  process.exit(failures ? 1 : 0);
})();
