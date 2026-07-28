// ---------- data export / import ----------
// This carries the three things you typed in — roster, saved plans, owned list
// — and deliberately not the settings (filters, toggles, map prefs, recents),
// which belong to the device you're on. The wording says so everywhere it's
// shown, because "backup" reads as "everything" and this isn't that.
// Counts read as a sentence, not a table: zero terms are dropped entirely so
// "43 starred species" never arrives as "0 pals, 0 saved plans and 43…".
function countsPhrase(nr, np, no) {
  const parts = [];
  if (nr) parts.push(`${nr} pal${nr === 1 ? '' : 's'}`);
  if (np) parts.push(`${np} saved plan${np === 1 ? '' : 's'}`);
  if (no) parts.push(`${no} starred species`);
  if (!parts.length) return 'nothing';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
// Dated, because palarium-data.json → "palarium-data (3).json" tells you
// nothing about which of the three is the one you want back.
function backupFilename() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `palarium-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
const LAST_BACKUP_KEY = 'palbreed_lastbackup';

function doExport() {
  const blob = new Blob([JSON.stringify({app: 'palarium', savedAt: new Date().toISOString(),
    roster, plans, owned: [...owned]}, null, 1)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupFilename();
  try {
    a.click();
  } catch (err) {
    URL.revokeObjectURL(a.href);
    smFail('Your browser blocked the download. Check its download settings and try again.');
    return;
  }
  URL.revokeObjectURL(a.href);
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  renderHub();
  toast('Backup saved — ' + countsPhrase(roster.length, plans.length, owned.size) + '.');
}

function renderHub() {
  const empty = !roster.length && !plans.length && !owned.size;
  document.getElementById('smHubCounts').textContent = empty ? '' : 'You have ' + countsPhrase(roster.length, plans.length, owned.size) + '.';
  const last = +localStorage.getItem(LAST_BACKUP_KEY) || 0;
  document.getElementById('smHubLast').textContent = empty ? ''
    : last ? 'Last backup: ' + (relTime(last) || 'just now') + '.' : 'You haven’t saved a backup yet.';
  document.getElementById('smHubFile').textContent = empty ? '' : `Writes ${backupFilename()} to your downloads folder.`;
  // A disabled Export button can't explain itself on touch, so the whole
  // export block is swapped for a hint that names the way out.
  document.getElementById('smHubExportRow').hidden = empty;
  const eh = document.getElementById('smHubEmpty');
  eh.hidden = !empty;
  if (empty && !eh.childElementCount) {
    eh.append('Nothing to back up yet — add a pal or star a species first. ');
    const b = document.createElement('button'); b.className = 'alink'; b.textContent = 'Read my save';
    b.addEventListener('click', openSaveReader);
    eh.appendChild(b);
  }
}

function openBackupHub() {
  smCancelRead();
  smBackupData = null;
  smHome = 'backup';
  renderHub();
  if (!sov.classList.contains('open')) {
    smLastFocus = document.activeElement;
    sov.classList.add('open'); smodalEl.scrollTop = 0;   // the dialog is the scrollport, not the overlay (302765a)
    document.body.style.overflow = 'hidden';
  }
  document.getElementById('smTitle').textContent = 'Backup & restore';
  smShow('smHub');
  const empty = !roster.length && !plans.length && !owned.size;
  (empty ? document.getElementById('smHubEmpty').querySelector('button') : document.getElementById('smExport')).focus();
}
// Restoring a backup used to fire the file picker straight off the button,
// with the explanation arriving afterwards in a toast — by which point you had
// already chosen a file. It now lives in the same dialog as the save reader,
// where both options can say what they do before anything happens, and where
// "this replaces your roster" is a stage you have to read past rather than a
// notification you can miss.
let smBackupData = null, smBackupPlan = null, smBackupMode = 'merge', smBackupName = '', smHome = 'save';

// Two entries are "the same pal" by the same ladder the save reader uses:
// a stable id first, then every field a human could have typed. Field identity
// is a last resort, and each local entry can absorb only one incoming twin —
// three identical Lamballs in a backup against one here must still add two.
const entrySig = r => JSON.stringify([r.k, r.g || null, r.iv ? r.iv.map(v => (v === null ? null : v)) : null,
  [...r.ps].sort(), r.nick || '', r.note || '']);
const planSig = p => JSON.stringify([p.tK, p.steps.map(s => [s.aK, s.bK, s.cK])]);

function planBackup(d) {
  const rawR = Array.isArray(d.roster) ? d.roster : [];
  const rawP = Array.isArray(d.plans) ? d.plans : [];
  const inRoster = normRoster(rawR), inPlans = normPlans(rawP);
  const inOwned = (Array.isArray(d.owned) ? d.owned : []).filter(k => byKey.has(k));
  // Every local entry can be claimed once and once only, by whichever rung of
  // the ladder reaches it first. Without that, a pal matched by id would still
  // be sitting in the field-identity pool, and a genuinely new twin arriving
  // later would be absorbed by it and silently dropped.
  const claimed = new Set();
  const localById = new Map(roster.map(r => [r.id, r]));
  const localBySid = new Map();
  for (const r of roster) if (r.sid && !localBySid.has(r.sid)) localBySid.set(r.sid, r);
  const bySig = new Map();
  for (const r of roster) {
    const s = entrySig(r);
    if (!bySig.has(s)) bySig.set(s, []);
    bySig.get(s).push(r.id);
  }
  const addPals = [], keptPals = [];
  for (const r of inRoster) {
    const bySid = r.sid ? localBySid.get(r.sid) : null;
    if (bySid && !claimed.has(bySid.id)) { claimed.add(bySid.id); keptPals.push(r); continue; }
    const byId = localById.get(r.id);
    if (byId && !claimed.has(byId.id)) { claimed.add(byId.id); keptPals.push(r); continue; }
    const stack = bySig.get(entrySig(r)) || [];
    while (stack.length && claimed.has(stack[stack.length - 1])) stack.pop();
    if (stack.length) { claimed.add(stack.pop()); keptPals.push(r); continue; }
    addPals.push(r);
  }
  // a plan's identity is its route; matching means keeping the local copy,
  // because the local one carries the steps you have already ticked off
  const seenPlans = new Set(plans.map(planSig));
  const addPlans = [], keptPlans = [];
  for (const p of inPlans) {
    const s = planSig(p);
    if (seenPlans.has(s)) { keptPlans.push(p); continue; }
    seenPlans.add(s); addPlans.push(p);
  }
  return {inRoster, inPlans, inOwned, addPals, keptPals, addPlans, keptPlans,
    newOwned: inOwned.filter(k => !owned.has(k)),
    droppedPals: rawR.length - inRoster.length, droppedPlans: rawP.length - inPlans.length};
}

// A capped, scrolling list is a scrollable region, and a scrollable region has
// to be reachable by keyboard even when nothing inside it is focusable.
function mkSmList(label) {
  const ul = document.createElement('div');
  ul.className = 'smlist';
  ul.tabIndex = 0;
  ul.setAttribute('role', 'group');
  ul.setAttribute('aria-label', label || 'Pals in this backup');
  return ul;
}

function renderBackupPreview() {
  const P = smBackupPlan;
  if (!P) return;
  const merge = smBackupMode === 'merge';
  const coldStart = !roster.length && !plans.length && !owned.size;
  const prev = document.getElementById('smBackupPreview');
  prev.innerHTML = '';

  const pals = merge ? P.addPals : P.inRoster;
  const plns = merge ? P.addPlans : P.inPlans;
  const stars = merge ? P.newOwned.length : P.inOwned.length;

  // effect line — the consequence of the choice, in visible text
  const eff = document.getElementById('smBackupEffect');
  const warn = document.getElementById('smBackupWarn');
  if (coldStart) {
    eff.textContent = 'Palarium is empty, so this simply restores everything in the file.';
    warn.hidden = true;
  } else if (merge) {
    const adds = countsPhrase(pals.length, plns.length, stars);
    eff.textContent = adds === 'nothing' ? 'Everything in this backup is already here.'
      : `Adds ${adds}. Nothing you have is changed or removed.`;
    warn.hidden = true;
  } else {
    // the live region has to keep speaking on the destructive branch too —
    // the warnbox is not live, so switching mode would announce nothing
    eff.textContent = `Replaces everything here with the ${countsPhrase(P.inRoster.length, P.inPlans.length, P.inOwned.length)} in this backup.`;
    warn.hidden = false;
    // replaceChildren, not textContent: every other .warnbox in the app leads
    // with the triangle, and a textContent write would drop it
    warn.replaceChildren(lucide('triangleAlert', 16),
      `Removes your ${countsPhrase(roster.length, plans.length, owned.size)}. ` +
      `Then restores the ${countsPhrase(P.inRoster.length, P.inPlans.length, P.inOwned.length)} above. ` +
      'You can undo this straight after.');
  }

  const h3 = t => { const h = document.createElement('h3'); h.className = 'smh3'; h.textContent = t; prev.appendChild(h); };
  const sub = t => { const p = document.createElement('p'); p.className = 'sub'; p.textContent = t; prev.appendChild(p); };

  if (!pals.length && !plns.length && !stars) {
    h3('Nothing to add');
    sub('Everything in this backup is already here.');
  }
  if (pals.length) {
    h3(merge ? `Pals to add (${pals.length})` : `Your roster after restoring (${pals.length})`);
    const ul = mkSmList('Pals in this backup');
    for (const r of pals.slice(0, 60)) {
      const d = document.createElement('div'); d.className = 'smitem';
      d.appendChild(icon(byKey.get(r.k), 22));
      const bits = [byKey.get(r.k).n];
      if (r.g) bits.push(r.g === 'M' ? '♂' : '♀');
      if (r.iv) bits.push('IV ' + r.iv.map(v => (v === null ? '–' : v)).join('·'));
      if (r.ps.length) bits.push(r.ps.join(', '));
      if (r.nick) bits.push('“' + r.nick + '”');
      const t = document.createElement('span'); t.textContent = bits.join(' · ');
      d.appendChild(t); ul.appendChild(d);
    }
    prev.appendChild(ul);
    if (pals.length > 60) sub(merge ? `…and ${pals.length - 60} more. All ${pals.length} will be added.`
      : `…and ${pals.length - 60} more. All ${pals.length} will be restored.`);
  }
  if (merge && P.keptPals.length) sub(`${P.keptPals.length} pal${P.keptPals.length === 1 ? ' is' : 's are'} already in your roster — they keep the details you have now.`);
  if (plns.length) {
    h3(merge ? `Plans to add (${plns.length})` : `Your saved plans after restoring (${plns.length})`);
    const ul = mkSmList('Plans in this backup');
    for (const p of plns) {
      const d = document.createElement('div'); d.className = 'smitem';
      d.appendChild(icon(byKey.get(p.tK), 22));
      const t = document.createElement('span');
      t.textContent = `${p.name || byKey.get(p.tK).n} · ${p.steps.length} step${p.steps.length === 1 ? '' : 's'}`;
      d.appendChild(t); ul.appendChild(d);
    }
    prev.appendChild(ul);
  }
  if (merge && P.keptPlans.length) sub(`${P.keptPlans.length} plan${P.keptPlans.length === 1 ? ' is' : 's are'} already saved — ${P.keptPlans.length === 1 ? 'it keeps' : 'they keep'} your ticked-off steps.`);
  if (stars) sub(merge ? `${stars} more species will be starred as owned.`
    : `${stars} species will be starred as owned, replacing your current ${owned.size}.`);
  if (P.droppedPals || P.droppedPlans) {
    sub(`${countsPhrase(P.droppedPals, P.droppedPlans, 0)} in this file can’t be read and will be skipped.`);
  }

  // the apply button is named for what it does, never "OK"
  const apply = document.getElementById('smBackupApply');
  let label;
  if (!merge) label = coldStart ? 'Restore my data' : 'Replace my data';
  else if (pals.length) label = 'Add ' + countsPhrase(pals.length, plns.length, 0);
  else if (plns.length) label = 'Add ' + countsPhrase(0, plns.length, 0);
  else if (stars) label = `Star ${stars} species`;
  else label = 'Nothing to restore';
  apply.textContent = label;
  // §4: destructive is never .alink.primary — "Replace my data" sits directly
  // under a warnbox naming what it removes, and a solid accent fill on a
  // destructive default invites the mis-press the warning exists to prevent.
  // Merge and the cold-start restore are additive and stay primary.
  apply.className = 'alink ' + (merge || coldStart ? 'primary' : 'danger');
  apply.disabled = merge && !pals.length && !plns.length && !stars;
}

function showBackupStage(d, fileName) {
  smBackupData = d; smBackupName = fileName || '';
  smBackupPlan = planBackup(d);
  const P = smBackupPlan;
  const coldStart = !roster.length && !plans.length && !owned.size;
  smBackupMode = coldStart ? 'replace' : 'merge';
  document.getElementById('smTitle').textContent = 'Restore from a backup';
  const when = d.savedAt ? new Date(d.savedAt) : null;
  document.getElementById('smBackupSum').textContent =
    'This backup holds ' + countsPhrase(P.inRoster.length, P.inPlans.length, P.inOwned.length) +
    (when && !isNaN(when) ? `, exported ${relTime(when.getTime()) || 'just now'}.` : '.');
  document.getElementById('smBackupFile').textContent = fileName ? 'From ' + fileName : '';
  document.getElementById('smBackupOld').hidden = !(P.droppedPals || P.droppedPlans);
  // with nothing here to protect, merge and replace do the same thing —
  // so there is no choice to present
  const modeRow = document.getElementById('smMode');
  modeRow.hidden = coldStart;
  setSeg(modeRow, smBackupMode, 'm');
  renderBackupPreview();
  smShow('smBackup');
  (coldStart ? document.getElementById('smBackupApply') : document.getElementById('smmode-merge')).focus();
}

document.getElementById('importFile').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const wrongDoor = /\.sav$/i.test(f.name)
    ? {label: 'Read my save', fn: openSaveReader} : null;
  if (wrongDoor) {
    smFail('That looks like a Palworld save, not a Palarium backup. Nothing was changed.', wrongDoor);
    return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    let d;
    try {
      d = JSON.parse(rd.result);
      if (d.app !== 'palarium' && d.app !== 'palbreed') throw new Error('that JSON file isn’t a Palarium backup');
    } catch (err) {
      smFail('That file isn’t a Palarium backup — it should be the JSON file “Export data” writes. Nothing was changed.');
      return;
    }
    const P = planBackup(d);
    // "replace everything with nothing" is a data wipe wearing a restore
    // costume — no other flow offers one, so this one doesn't either
    if (!P.inRoster.length && !P.inPlans.length && !P.inOwned.length) {
      smFail((P.droppedPals || P.droppedPlans)
        ? 'Palarium couldn’t read anything in that file. It may be from a much older version.'
        : 'This backup is empty — no pals, plans or starred species. Nothing was changed.');
      return;
    }
    showBackupStage(d, f.name);
  };
  rd.onerror = () => smFail('That file couldn’t be read. Nothing was changed.');
  rd.readAsText(f);
});

// ---------- read a Palworld save ----------
// Deliberately not "Import data". That one restores a Palarium backup and
// replaces the roster wholesale; this reads a game file and merges. Different
// words, different button, and a preview before anything is written.
//
// MERGE, field by field:
//   game-authored  species, gender, IVs, passives, level — the save is the
//                  truth and a re-import updates them
//   human-authored nick, note — an import fills one that is empty and never
//                  replaces one that isn't
// Identity is the save's per-instance GUID, stored as the additive `sid`. An
// entry without one is a hand entry and still perfectly valid; normRoster has
// never required it.
const PASSIVE_NAME_BY_KEY = new Map(PASSIVES.filter(p => p.k).map(p => [p.k.toLowerCase(), p.n]));
// The game's own tables disagree on casing (WindChimes vs Windchimes), so every
// species lookup here is case-insensitive — an exact match drops real pals.
const palByLowerKey = new Map(PALS.map(p => [p.k.toLowerCase(), p]));
function palFromCharacterId(cid) {
  let s = String(cid || '');
  if (/^BOSS_/i.test(s)) s = s.slice(5);
  return palByLowerKey.get(s.toLowerCase()) || null;
}
const passiveDisplay = key => PASSIVE_NAME_BY_KEY.get(String(key).toLowerCase()) || String(key);

const sov = document.getElementById('soverlay');
const smodalEl = sov.querySelector('.modal');
let smWorker = null, smParsed = null, smPlan = null, smScope = 'all', smLastFocus = null;
// Reading the file into an ArrayBuffer is itself async and not cancellable, so
// Cancel can't stop one already in flight. Every read carries a token; a read
// whose token has moved on drops its result instead of clobbering a newer one.
let smRead = 0;

function smCancelRead() { smRead++; if (smWorker) { smWorker.terminate(); smWorker = null; } }
function smShow(which) {
  for (const id of ['smPick', 'smHub', 'smWorlds', 'smBackup', 'smBusy', 'smResult', 'smError'])
    document.getElementById(id).hidden = id !== which;
}

// ---------- picking a folder ----------
// Not showDirectoryPicker. That API refuses the one folder that matters:
// Palworld saves live under %LOCALAPPDATA%, and Chrome blocklists the whole
// AppData tree as "system files", so the picker rejects it outright. The older
// <input webkitdirectory> is not on that blocklist, works in every browser
// here, and hands back a flat FileList with webkitRelativePath — which is all
// this needs. The cost is that there is no handle to keep, so the folder can't
// be remembered between visits.
const SAVE_PATH = '%LOCALAPPDATA%\Pal\Saved\SaveGames';
let smWorldsFound = [];

// Group a FileList into worlds: any directory holding a Level.sav is one.
// Backups are skipped — Palworld keeps timestamped copies under backup/, and
// they are not worlds you are playing. Pick one with the single-file button if
// you ever need to.
function worldsFromFiles(files) {
  const byDir = new Map();
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const cut = rel.lastIndexOf('/');
    const dir = cut < 0 ? '' : rel.slice(0, cut);
    const base = rel.slice(cut + 1).toLowerCase();
    if (base !== 'level.sav' && base !== 'levelmeta.sav') continue;
    if (/(^|\/)backup(\/|$)/i.test(dir)) continue;
    if (!byDir.has(dir)) byDir.set(dir, {path: dir, name: dir.slice(dir.lastIndexOf('/') + 1)});
    const w = byDir.get(dir);
    if (base === 'level.sav') w.level = f; else w.meta = f;
  }
  return [...byDir.values()].filter(w => w.level);
}

// The bar is continuous feedback for anyone watching it. role="progressbar"
// makes the same number queryable by AT, and the milestones are what a screen
// reader hears without going looking — a 400 MB save used to write #smBusyMsg
// once and then say nothing until it finished. Coarse on purpose: a live region
// driven by a progress bar is a stream of interruptions (§8).
let smPctSaid = 0, smPctMax = 0, smPhase = '';
// `msg` is the phase label WITHOUT its trailing ellipsis — a milestone re-states
// it rather than replacing it, so the file name and size stay on screen for the
// whole read instead of being overwritten by a bare percentage.
function smProgress(pct, msg) {
  const out = document.getElementById('smBusyMsg');
  if (msg !== undefined) { smPhase = msg; smPctSaid = 0; smPctMax = 0; }
  // The oodle decoder restarts with a larger `need`, so the raw percentage goes
  // backwards mid-read (measured 93 -> 16 -> 93 on a 400 MB save). A bar that
  // rewinds reads as a stall, so the value only ever climbs.
  const p = smPctMax = Math.max(smPctMax, Math.max(0, Math.min(100, Math.round(pct))));
  document.getElementById('smBar').style.width = p + '%';
  document.getElementById('smPbar').setAttribute('aria-valuenow', p);
  if (msg !== undefined) { out.textContent = smPhase + '…'; return; }
  // The highest milestone crossed, once. A fast read clears all three in one
  // task, and three writes to a polite region in one task is one utterance —
  // so pick the last one rather than writing three. Nothing at 100: the
  // preview lands and takes focus in the same tick.
  const hit = [75, 50, 25].find(m => p >= m && smPctSaid < m);
  if (hit && p < 100) { smPctSaid = hit; out.textContent = smPhase + ' — ' + hit + '%'; }
}

async function useFolder(files) {
  const token = ++smRead;
  smShow('smBusy');
  smProgress(15, 'Looking for worlds');
  document.getElementById('smCancel').focus();

  const worlds = worldsFromFiles(files);
  if (!worlds.length) {
    smFail('No Level.sav in that folder. Pick the folder your worlds live in — ' + SAVE_PATH +
      ' — or use “Choose one Level.sav…”. Nothing was changed.');
    return;
  }
  smProgress(55, `Reading ${worlds.length} world${worlds.length === 1 ? '' : 's'}`);
  // LevelMeta.sav is about 2 KB, so naming every world costs almost nothing
  const items = [];
  for (let i = 0; i < worlds.length; i++) {
    worlds[i].bytes = worlds[i].level.size;
    if (!worlds[i].meta) continue;
    try { items.push({id: i, buf: await worlds[i].meta.arrayBuffer()}); } catch {}
  }
  if (token !== smRead) return;
  const metas = items.length ? await readMetaBatch(items) : [];
  if (token !== smRead) return;
  for (const m of metas) if (m.meta) worlds[m.id].meta_ = m.meta;
  smWorldsFound = worlds;
  renderWorldList();
  smShow('smWorlds');
  (document.querySelector('#smWorldList button') || document.getElementById('smRescan')).focus();
}

function readMetaBatch(items) {
  return new Promise(resolve => {
    let w;
    try { w = new Worker('js/savparse.js'); } catch { resolve([]); return; }
    const done = out => { try { w.terminate(); } catch {} resolve(out); };
    const timer = setTimeout(() => done([]), 20000);
    w.onmessage = ev => { if (ev.data && ev.data.type === 'metaDone') { clearTimeout(timer); done(ev.data.items); } };
    w.onerror = () => { clearTimeout(timer); done([]); };
    w.postMessage({type: 'meta', items}, items.map(i => i.buf));
  });
}

const relTime = ms => {
  if (!ms) return '';
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d < 0) return '';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return d + ' days ago';
  if (d < 365) return Math.round(d / 30) + ' months ago';
  return Math.round(d / 365) + ' years ago';
};

function renderWorldList() {
  const list = document.getElementById('smWorldList');
  list.innerHTML = '';
  const n = smWorldsFound.length;
  document.getElementById('smWorldsSum').textContent =
    `${n} world${n === 1 ? '' : 's'} in that folder. Pick the one to read — nothing is read until you do.`;
  // most recently played first: it is nearly always the one they want
  const rows = smWorldsFound.slice().sort((a, b) => (b.meta_ ? b.meta_.savedAt || 0 : 0) - (a.meta_ ? a.meta_.savedAt || 0 : 0));
  for (const wd of rows) {
    const m = wd.meta_;
    const row = document.createElement('div'); row.className = 'worldrow'; row.setAttribute('role', 'listitem');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'worldbtn';
    const t = document.createElement('span'); t.className = 'wname';
    t.textContent = m && m.worldName ? m.worldName : wd.name;
    b.appendChild(t);
    const sub = document.createElement('span'); sub.className = 'wsub';
    const bits = [];
    if (m && m.hostName) bits.push(m.hostName + (m.hostLevel ? ' · Lv ' + m.hostLevel : ''));
    if (m && m.inGameDay) bits.push('day ' + m.inGameDay);
    if (m && m.savedAt) bits.push('saved ' + relTime(m.savedAt));
    if (wd.bytes) bits.push((wd.bytes / 1048576).toFixed(1) + ' MB');
    if (!m) bits.push('no LevelMeta.sav — name unknown');
    sub.textContent = bits.join(' · ');
    b.appendChild(sub);
    // The folder path tells two same-named worlds apart, but one of its
    // segments is the Steam account id. Nothing here leaves the machine, but it
    // costs nothing to keep an account id off a screen someone might screenshot.
    const pth = document.createElement('span'); pth.className = 'wpath';
    pth.textContent = wd.path.replace(/\b\d{17}\b/g, '…');
    b.appendChild(pth);
    b.setAttribute('aria-label', 'Read ' + t.textContent + (bits.length ? ', ' + bits.join(', ') : ''));
    b.addEventListener('click', () => readSaveFile(wd.level));
    row.appendChild(b);
    list.appendChild(row);
  }
}

function openSaveReader() {
  smCancelRead();
  smParsed = null; smPlan = null; smScope = 'all'; smWorldsFound = []; smBackupData = null;
  smHome = 'save';
  setSeg(document.getElementById('smScope'), 'all', 's');
  document.getElementById('smTitle').textContent = 'Read my save';
  smShow('smPick');
  if (!sov.classList.contains('open')) {
    smLastFocus = document.activeElement;
    sov.classList.add('open'); smodalEl.scrollTop = 0;   // the dialog is the scrollport, not the overlay (302765a)
    document.body.style.overflow = 'hidden';
  }
  document.getElementById('smChooseDir').focus();
}
function closeSaveReader() {
  smCancelRead();
  sov.classList.remove('open');
  document.body.style.overflow = '';
  // offsetParent, not just contains: the opener is often gone or hidden by the
  // time this runs — a toast's "Read my save" button is removed when the toast
  // expires, and a view change underneath leaves #importBtn in a display:none
  // section, where focus() is a silent no-op. Same guard as closeModal and
  // closeRosterEditor; the tab bar is the floor under all three.
  const back = smLastFocus && document.contains(smLastFocus) && smLastFocus.offsetParent !== null
    ? smLastFocus : activeTabButton();
  if (back) back.focus();
  smLastFocus = null;
}
function setSeg(row, val, attr) {
  for (const b of row.querySelectorAll('button')) {
    const on = b.dataset[attr] === val;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  }
}
document.getElementById('importBtn').addEventListener('click', openSaveReader);
document.getElementById('smClose').addEventListener('click', closeSaveReader);
document.getElementById('smAbort').addEventListener('click', closeSaveReader);
// Back goes to the room you came in through. Without this, cancelling a
// backup restore drops you on the save reader — a place you never chose.
function smBack() {
  smCancelRead();
  if (smHome === 'backup') { openBackupHub(); return; }
  if (smWorldsFound.length) { smShow('smWorlds'); (document.querySelector('#smWorldList button') || document.getElementById('smRescan')).focus(); }
  else { smShow('smPick'); document.getElementById('smChooseDir').focus(); }
}
document.getElementById('smCancel').addEventListener('click', smBack);
// "Choose a different file" means exactly that on the backup path — reopening
// the picker, not walking the user back to a screen to press it again.
document.getElementById('smRetry').addEventListener('click', () => {
  if (smHome === 'backup') { document.getElementById('importFile').click(); return; }
  smBack();
});
sov.addEventListener('click', e => { if (e.target === sov) closeSaveReader(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sov.classList.contains('open')) closeSaveReader();
});
document.addEventListener('keydown', e => { if (sov.classList.contains('open')) trapTab(e, sov); });

document.getElementById('smChoose').addEventListener('click', () => document.getElementById('saveFile').click());
document.getElementById('smChooseDir').addEventListener('click', () => document.getElementById('saveDir').click());
document.getElementById('exportBtn').addEventListener('click', openBackupHub);
document.getElementById('smExport').addEventListener('click', doExport);
document.getElementById('smToHub').addEventListener('click', openBackupHub);
document.getElementById('smToSave').addEventListener('click', openSaveReader);
document.getElementById('smChooseBackup').addEventListener('click', () => document.getElementById('importFile').click());
// Switching merge/replace rebuilds the preview, so hand focus back to the
// button that was just pressed rather than dropping it on <body>.
document.getElementById('smMode').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  smBackupMode = b.dataset.m;
  setSeg(document.getElementById('smMode'), smBackupMode, 'm');
  const id = document.activeElement && document.activeElement.id;
  renderBackupPreview();
  const back = (id && document.getElementById(id)) || document.getElementById('smBackupApply');
  if (back && !back.disabled) back.focus();
});
document.getElementById('saveDir').addEventListener('change', e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) useFolder(files);
});
document.getElementById('smPath').textContent = SAVE_PATH;
document.getElementById('smCopyPath').addEventListener('click', async e => {
  try { await navigator.clipboard.writeText(SAVE_PATH); e.target.textContent = 'Copied'; }
  catch { e.target.textContent = 'Press Ctrl+C'; getSelection().selectAllChildren(document.getElementById('smPath')); }
  setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
});
document.getElementById('smRescan').addEventListener('click', () => document.getElementById('saveDir').click());
document.getElementById('smBackupCancel').addEventListener('click', smBack);
document.getElementById('smBackupApply').addEventListener('click', () => {
  const P = smBackupPlan;
  if (!P) return;
  const before = {roster: JSON.stringify(roster), plans: JSON.stringify(plans), owned: [...owned]};
  const merge = smBackupMode === 'merge';
  let msg;
  if (merge) {
    const usedIds = new Set(roster.map(r => r.id));
    for (const r of P.addPals) {
      const e = {...r};
      while (usedIds.has(e.id)) e.id = newEntryId();
      usedIds.add(e.id); roster.push(e);
    }
    const usedPlanIds = new Set(plans.map(p => p.id));
    for (const p of P.addPlans) {
      const e = {...p};
      while (usedPlanIds.has(e.id)) e.id = Date.now() + '' + Math.floor(Math.random() * 1e4);
      usedPlanIds.add(e.id); plans.push(e);
    }
    for (const k of P.newOwned) owned.add(k);
    const added = countsPhrase(P.addPals.length, P.addPlans.length, 0);
    msg = 'Backup merged — ' + (added === 'nothing'
      ? `starred ${P.newOwned.length} new species.`
      : `added ${added}` + (P.newOwned.length ? ` and starred ${P.newOwned.length} species.` : '.'));
  } else {
    roster = P.inRoster.map(r => ({...r}));
    plans = P.inPlans.map(p => ({...p}));
    owned.clear();
    for (const k of P.inOwned) owned.add(k);
    msg = `Restored ${countsPhrase(roster.length, plans.length, 0)} from that backup.`;
  }
  saveRoster(); savePlans(); localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));
  renderRoster(); renderPlans(); renderDex(); renderReverse();
  closeSaveReader();
  toast(msg, () => {
    roster = normRoster(JSON.parse(before.roster));
    plans = normPlans(JSON.parse(before.plans));
    owned.clear(); for (const k of before.owned) owned.add(k);
    saveRoster(); savePlans(); localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));
    renderRoster(); renderPlans(); renderDex(); renderReverse();
  });
});
document.getElementById('saveFile').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  // mirror of the .sav-in-the-backup-picker case: point at the right door
  if (/\.json$/i.test(f.name)) {
    smFail('That looks like a Palarium backup, not a Palworld save. Nothing was changed.',
      {label: 'Backup & restore', fn: openBackupHub});
    return;
  }
  readSaveFile(f);
});


// alt is the "you picked the wrong door" button — offered only when the file
// itself tells us which door was meant, so it never guesses.
function smFail(msg, alt) {
  smShow('smError');
  // a .warnbox now, and every other .warnbox in the app leads with the triangle
  document.getElementById('smErrMsg').replaceChildren(lucide('triangleAlert', 16), ' ' + msg);
  const b = document.getElementById('smErrAlt');
  b.hidden = !alt;
  if (alt) { b.textContent = alt.label; b.onclick = alt.fn; } else { b.onclick = null; }
  document.getElementById('smRetry').focus();
}

function readSaveFile(file) {
  const token = ++smRead;
  smShow('smBusy');
  smProgress(4, `Reading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)`);
  document.getElementById('smCancel').focus();
  file.arrayBuffer().then(buf => {
    if (token !== smRead || !sov.classList.contains('open')) return;
    // The parse happens in a worker so a several-hundred-megabyte save can't
    // freeze the tab. A frozen tab with no feedback reads as a crash.
    try { smWorker = new Worker('js/savparse.js'); }
    catch (err) { smFail('Your browser blocked the background reader this needs. Nothing was changed.'); return; }
    const w = smWorker;
    smWorker.onmessage = ev => {
      if (token !== smRead) { w.terminate(); return; }
      const d = ev.data;
      if (d.type === 'progress') { smProgress(6 + d.pct * 88); return; }
      if (d.type === 'error') { smWorker.terminate(); smWorker = null; smFail(d.message); return; }
      if (d.type === 'done') {
        smWorker.terminate(); smWorker = null;
        smProgress(100);
        smParsed = d.res;
        showSavePreview();
      }
    };
    smWorker.onerror = () => { if (smWorker) { smWorker.terminate(); smWorker = null; } if (token === smRead) smFail('The background reader stopped unexpectedly. Nothing was changed.'); };
    smWorker.postMessage({buf}, [buf]);
  }).catch(() => { if (token === smRead) smFail('That file could not be opened. Nothing was changed.'); });
}

// Does everything this hand-typed entry actually records agree with this pal
// from the save? Not field equality — the roster's own Duplicate button mints
// entries carrying only species, passives, gender and note, so a sparse entry
// is normal and must be allowed to match a fully-specified pal.
function handEntryMatches(r, sp) {
  if (r.k !== sp.palKey) return false;
  if (r.g && sp.gender && r.g !== sp.gender) return false;
  if (r.g && !sp.gender) return false;
  if (r.iv) for (let i = 0; i < 3; i++) if (r.iv[i] !== null && r.iv[i] !== sp.iv[i]) return false;
  for (const p of r.ps) if (!sp.ps.includes(p)) return false;
  return true;
}

function buildPlan() {
  const all = (smParsed.pals || []).map(p => {
    const pal = palFromCharacterId(p.cid);
    return pal ? {
      guid: p.guid, palKey: pal.k, palName: pal.n, cid: p.cid, boss: p.boss,
      gender: p.gender, lv: p.level, iv: p.iv.slice(),
      ps: p.passives.map(passiveDisplay), gname: p.nickname,
    } : null;
  });
  const unrecognised = all.filter(x => !x).length;
  let pals = all.filter(Boolean);
  if (smScope === 'ps') pals = pals.filter(p => p.ps.length);

  const bySid = new Map();
  for (const r of roster) if (r.sid) bySid.set(r.sid, r);

  const linked = [], fresh = [];
  for (const sp of pals) (bySid.has(sp.guid) ? linked : fresh).push(sp);

  // Hand entries — never had a GUID, so nothing can match automatically.
  const hand = roster.filter(r => !r.sid);
  const conflicts = [];
  const claimed = new Set();
  for (const r of hand) {
    const cands = fresh.filter(sp => handEntryMatches(r, sp));
    if (cands.length) conflicts.push({entry: r, cands, choice: cands.length === 1 ? 'combine' : 'separate', pick: cands.length === 1 ? 0 : -1});
  }
  for (const c of conflicts) if (c.choice === 'combine' && c.pick >= 0) claimed.add(c.cands[c.pick].guid);
  const added = fresh.filter(sp => !claimed.has(sp.guid));
  return {pals, allPals: all.filter(Boolean), linked, fresh, conflicts, added, unrecognised, total: all.length};
}

function showSavePreview() {
  smPlan = buildPlan();
  smShow('smResult');
  renderSavePreview();
  // The result, not the button that commits it. Focusing #smApply scrolled the
  // dialog 161px (1366) / 524px (360) past its own answer — the summary
  // sentence, the scope filter and the whole first conflict row were above the
  // viewport on arrival, and .mbar carries only ✕, so nothing on screen named
  // the dialog either. It is also the only focusable that can be DISABLED
  // (a save with nothing importable), where focus() is a no-op and the state
  // change handed focus nowhere at all.
  document.getElementById('smResult').focus();
}

function recomputePlan() {
  // Re-rendering the list destroys whatever the keyboard was on, which drops
  // focus to <body> mid-decision. Every control here carries a stable id so it
  // can be handed back afterwards.
  const hadFocus = document.activeElement && document.activeElement.id;
  // keep the user's answers while the numbers move under them
  const prev = smPlan ? smPlan.conflicts : [];
  smPlan = buildPlan();
  for (const c of smPlan.conflicts) {
    const old = prev.find(x => x.entry.id === c.entry.id);
    if (old && old.cands.length === c.cands.length) { c.choice = old.choice; c.pick = old.pick; }
  }
  const claimed = new Set();
  for (const c of smPlan.conflicts) if (c.choice === 'combine' && c.pick >= 0) claimed.add(c.cands[c.pick].guid);
  const skipped = new Set();
  for (const c of smPlan.conflicts) if (c.choice === 'mine' && c.pick >= 0) skipped.add(c.cands[c.pick].guid);
  smPlan.added = smPlan.fresh.filter(sp => !claimed.has(sp.guid) && !skipped.has(sp.guid));
  renderSavePreview();
  if (hadFocus) {
    const back = document.getElementById(hadFocus);
    if (back && back.offsetParent !== null) back.focus();
    else document.getElementById('smApply').focus();
  }
}

function describeSavePal(sp) {
  const bits = [sp.palName];
  if (sp.boss) bits.push('Alpha');   // α is off §7's allowlist and nothing on screen decoded it
  if (sp.gender) bits.push(sp.gender === 'M' ? '♂' : '♀');
  bits.push('Lv ' + sp.lv);
  bits.push('IV ' + sp.iv.join('·'));
  if (sp.ps.length) bits.push(sp.ps.join(', '));
  if (sp.gname) bits.push('“' + sp.gname + '”');
  return bits.join(' · ');
}

function renderSavePreview() {
  const P = smPlan;
  const sum = document.getElementById('smSummary');
  const parts = [];
  parts.push(`${P.added.length} new pal${P.added.length === 1 ? '' : 's'} to add`);
  if (P.linked.length) parts.push(`${P.linked.length} already imported (stats refreshed, your nicknames and notes kept)`);
  if (P.conflicts.length) parts.push(`${P.conflicts.length} to decide on below`);
  sum.textContent = `Found ${smParsed.pals.length} pals in your save. ` + parts.join(' · ') + '.';

  const note = [];
  if (P.unrecognised) note.push(`${P.unrecognised} entr${P.unrecognised === 1 ? 'y' : 'ies'} skipped — raid, tower or unreleased species the Paldex doesn’t list.`);
  if (smParsed.players) note.push(`${smParsed.players} player character${smParsed.players === 1 ? '' : 's'} skipped.`);

  const wrap = document.getElementById('smConflictWrap');
  wrap.hidden = !P.conflicts.length;
  document.getElementById('smConflictNote').textContent = P.conflicts.length
    ? 'These roster entries look like pals in your save. A hand-typed entry has never carried a save id, so this is asked once — after that they stay linked and update quietly.'
    : '';
  const cw = document.getElementById('smConflicts');
  cw.innerHTML = '';
  P.conflicts.forEach((c, ci) => {
    const p = byKey.get(c.entry.k);
    const row = document.createElement('div'); row.className = 'confrow';
    const mine = document.createElement('div'); mine.className = 'confmine';
    const mt = document.createElement('b'); mt.textContent = 'Your entry: ';
    mine.appendChild(mt);
    const bits = [p.n];
    if (c.entry.g) bits.push(c.entry.g === 'M' ? '♂' : '♀');
    if (c.entry.iv) bits.push('IV ' + c.entry.iv.map(v => v === null ? '–' : v).join('·'));
    if (c.entry.ps.length) bits.push(c.entry.ps.join(', '));
    if (c.entry.nick) bits.push('“' + c.entry.nick + '”');
    if (c.entry.note) bits.push('note: ' + c.entry.note);
    mine.append(bits.join(' · '));
    row.appendChild(mine);

    if (c.cands.length === 1) {
      const sp = document.createElement('div'); sp.className = 'confsave';
      const st = document.createElement('b'); st.textContent = 'In your save: '; sp.appendChild(st);
      sp.append(describeSavePal(c.cands[0]));
      row.appendChild(sp);
      const seg = document.createElement('div'); seg.className = 'segrow confseg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'What to do with your ' + p.n + ' entry');
      const OPTS = [
        ['combine', 'Combine', 'One entry: the save’s stats with the nickname and note you typed. Nothing is lost.'],
        ['mine', 'Keep mine', 'Leave your entry exactly as it is and don’t import the save’s copy.'],
        ['save', 'Use the save’s', 'Replace your entry with the save’s — your nickname and note on it are discarded.'],
      ];
      for (const [val, label, title] of OPTS) {
        const b = document.createElement('button'); b.type = 'button';
        b.textContent = label; b.title = title;
        b.dataset.v = val; b.id = 'confbtn' + ci + '-' + val;
        const on = c.choice === val;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { c.choice = val; c.pick = 0; recomputePlan(); });
        seg.appendChild(b);
      }
      row.appendChild(seg);
      // Three words decided whether a nickname survived, and the sentence saying
      // which only existed in a title — which touch never shows. Same fix as the
      // backup flow's #smBackupEffect: state the consequence of the selection in
      // visible text. Not a live region: recomputePlan rebuilds this whole row,
      // and a re-inserted polite region announces unreliably (DESIGN.md §4).
      const eff = document.createElement('p'); eff.className = 'sub confeff';
      eff.textContent = (OPTS.find(o => o[0] === c.choice) || OPTS[0])[2];
      row.appendChild(eff);
    } else {
      // More than one pal in the save fits. Never auto-pick one of N.
      const sp = document.createElement('div'); sp.className = 'confsave amb';
      sp.textContent = `${c.cands.length} pals in your save fit this entry — Palarium can’t tell which, so it will keep them separate unless you say.`;
      row.appendChild(sp);
      const lab = document.createElement('label'); lab.className = 'conflab';
      lab.htmlFor = 'confsel' + ci;
      lab.textContent = 'Which one is this?';
      row.appendChild(lab);
      const sel = document.createElement('select'); sel.id = 'confsel' + ci; sel.className = 'search-inp';
      const o0 = document.createElement('option'); o0.value = '-1';
      o0.textContent = 'Keep them separate — leave my entry alone, import all ' + c.cands.length;
      sel.appendChild(o0);
      // Two pals can differ only by an id the user never sees, so the question
      // "Which one is this?" could arrive with two byte-identical answers.
      // Number the ones that collide — it does not say which is which, but it
      // makes the choice answerable and the result predictable.
      const labels = c.cands.map(describeSavePal);
      const dupes = new Set(labels.filter((t, i) => labels.indexOf(t) !== i));
      c.cands.forEach((sp2, i) => {
        const o = document.createElement('option'); o.value = String(i);
        o.textContent = 'Combine with: ' + labels[i]
          + (dupes.has(labels[i]) ? ` (${i + 1} of ${c.cands.length})` : '');
        sel.appendChild(o);
      });
      sel.value = String(c.choice === 'combine' ? c.pick : -1);
      sel.addEventListener('change', () => {
        const v = +sel.value;
        if (v < 0) { c.choice = 'separate'; c.pick = -1; } else { c.choice = 'combine'; c.pick = v; }
        recomputePlan();
      });
      row.appendChild(sel);
    }
    cw.appendChild(row);
  });

  const prev = document.getElementById('smPreview');
  prev.innerHTML = '';
  if (note.length) { const n = document.createElement('p'); n.className = 'sub'; n.textContent = note.join(' '); prev.appendChild(n); }
  const h = document.createElement('h3'); h.className = 'smh3';
  h.textContent = P.added.length ? `Will be added (${P.added.length})` : 'Nothing new to add';
  prev.appendChild(h);
  if (P.added.length) {
    const ul = mkSmList('Pals that will be added from your save');
    for (const sp of P.added.slice(0, 60)) {
      const d = document.createElement('div'); d.className = 'smitem';
      d.appendChild(icon(byKey.get(sp.palKey), 20, false, true));   // named by the line beside it (§7)
      const t = document.createElement('span'); t.textContent = describeSavePal(sp);
      d.appendChild(t);
      ul.appendChild(d);
    }
    prev.appendChild(ul);
    if (P.added.length > 60) {
      const m = document.createElement('p'); m.className = 'sub';
      m.textContent = `…and ${P.added.length - 60} more. All ${P.added.length} will be added.`;
      prev.appendChild(m);
    }
  }
  // Starring happens for every species in the save, filter or no filter, and
  // the preview never said so — the toast afterwards was the first mention of
  // it. A preview that omits half of what the button writes is not a preview.
  const newStars = new Set(P.allPals.map(sp => sp.palKey).filter(k => !owned.has(k))).size;
  if (newStars) {
    const st = document.createElement('p'); st.className = 'sub';
    st.textContent = `${newStars} more species will be starred as owned — every species in the save counts as owned, whichever pals you import.`;
    prev.appendChild(st);
  }
  const apply = document.getElementById('smApply');
  const willWrite = P.added.length + P.linked.length + P.conflicts.filter(c => c.choice !== 'mine' && c.choice !== 'separate').length;
  // Nothing to import is an empty state, not a disabled button. A live filter
  // over an empty result, a greyed primary that cannot explain itself on touch
  // and one operable control reading "Cancel" — a verb for undoing something,
  // when nothing has happened. Same swap renderHub already makes for Export.
  const nothing = !willWrite && !P.added.length;
  document.querySelector('#smResult .smfilter').hidden = nothing;
  apply.hidden = nothing;
  document.getElementById('smAbort').textContent = nothing ? 'Close' : 'Cancel';
  if (nothing) {
    const why = document.createElement('p'); why.className = 'sub';
    why.textContent = P.unrecognised
      ? 'None of these species are in the Paldex — this may be a modded or unreleased pal list.'
      : 'Everything in this save is already in your roster.';
    prev.appendChild(why);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'alink';
    b.textContent = 'Choose a different save';
    b.addEventListener('click', openSaveReader);
    prev.appendChild(b);
  }
  apply.disabled = !willWrite;
  apply.textContent = P.added.length ? `Import ${P.added.length} pal${P.added.length === 1 ? '' : 's'}` : (willWrite ? 'Update my roster' : 'Nothing to import');
}

for (const b of document.getElementById('smScope').querySelectorAll('button')) {
  b.id = 'smscope-' + b.dataset.s;
  b.addEventListener('click', () => { smScope = b.dataset.s; setSeg(document.getElementById('smScope'), smScope, 's'); recomputePlan(); });
}

// game-authored fields only; nick and note are never touched here
function applyGameFields(r, sp) {
  r.k = sp.palKey; r.sid = sp.guid;
  r.g = sp.gender || null;
  r.iv = sp.iv.slice();
  r.ps = sp.ps.slice(0, 4);
  r.lv = sp.lv;
  r.gname = sp.gname || '';
}
function entryFromSavePal(sp) {
  const r = {id: newEntryId(), k: sp.palKey, ps: [], g: null, nick: '', note: '', iv: null};
  applyGameFields(r, sp);
  return r;
}

document.getElementById('smApply').addEventListener('click', () => {
  const P = smPlan;
  const before = JSON.stringify(roster), beforeOwned = [...owned];
  let updated = 0, addedN = 0, combined = 0, replaced = 0;

  const bySid = new Map();
  for (const r of roster) if (r.sid) bySid.set(r.sid, r);
  for (const sp of P.linked) {
    const r = bySid.get(sp.guid);
    if (r) { applyGameFields(r, sp); updated++; }   // nick and note deliberately untouched
  }
  for (const c of P.conflicts) {
    if (c.choice === 'combine' && c.pick >= 0) {
      const sp = c.cands[c.pick];
      const r = roster.find(x => x.id === c.entry.id);
      if (r) { applyGameFields(r, sp); combined++; }   // nick and note deliberately untouched
    } else if (c.choice === 'save' && c.pick >= 0) {
      const sp = c.cands[c.pick];
      const i = roster.findIndex(x => x.id === c.entry.id);
      if (i >= 0) { roster[i] = entryFromSavePal(sp); replaced++; }
    }
  }
  for (const sp of P.added) { roster.push(entryFromSavePal(sp)); addedN++; }

  // every species in the save is owned by definition
  let starred = 0;
  for (const sp of P.allPals) if (!owned.has(sp.palKey)) { owned.add(sp.palKey); starred++; }
  localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));

  saveRoster(); renderRoster(); renderDex(); renderReverse(); renderPlans();
  closeSaveReader();

  const bits = [];
  if (addedN) bits.push(`added ${addedN}`);
  if (updated) bits.push(`refreshed ${updated}`);
  if (combined) bits.push(`combined ${combined}`);
  if (replaced) bits.push(`replaced ${replaced}`);
  if (starred) bits.push(`starred ${starred} new species`);
  toast('Save read — ' + (bits.join(', ') || 'nothing changed') + '.', () => {
    roster = normRoster(JSON.parse(before));
    owned.clear(); for (const k of beforeOwned) owned.add(k);
    localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));
    saveRoster(); renderRoster(); renderDex(); renderReverse(); renderPlans();
  });
});

