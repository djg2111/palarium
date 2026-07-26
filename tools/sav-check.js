#!/usr/bin/env node
/* Cross-check js/savparse.js against the save file itself.
 *
 *   node sav-check.js <Level.sav> [Level.gvas]
 *
 * Two independent checks, because "my parser agrees with my parser" is not
 * evidence:
 *
 * 1. DECOMPRESSION. If a reference .gvas is given (produce one with
 *    oodle-ref, which uses OodleSharp — a different implementation in a
 *    different language), the shipped JS decoder's output is compared to it
 *    byte for byte.
 *
 * 2. THE PARSE. Every pal is re-read by a scanner that shares no code with
 *    savparse.js and doesn't walk the property tree at all: it finds each
 *    record by searching for the struct name, then locates each field by
 *    searching for its name string and decodes the value that follows. A
 *    recursive-descent parser and a string scanner fail differently, so
 *    agreement on species, gender, IVs, level and passives across every pal
 *    means the fields really are where the app thinks they are.
 *
 * Nothing here is shipped and nothing here touches the network. Point it at a
 * save that stays out of the repo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'savparse.js'));

const RED = s => `\x1b[31m${s}\x1b[0m`, GRN = s => `\x1b[32m${s}\x1b[0m`, BLD = s => `\x1b[1m${s}\x1b[0m`;

const savPath = process.argv[2];
const refPath = process.argv[3];
if (!savPath) { console.error('usage: sav-check.js <Level.sav> [Level.gvas]'); process.exit(2); }

const sav = new Uint8Array(fs.readFileSync(savPath));
const head = P.readHeader(sav);
console.log(BLD(`\n${path.basename(savPath)}`));
console.log(`  ${sav.length} bytes on disk · magic ${head.magic}${head.type.toString(16)} · ${head.uncompressed} decompressed`);

// ---- 1. decompression ----
const t0 = process.hrtime.bigint();
const gvas = new Uint8Array(head.uncompressed);
P.oodleDecode(sav, 12, gvas, head.uncompressed, null);
const decodeMs = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`  decoded in ${decodeMs.toFixed(1)} ms (${(head.uncompressed / 1048576 / (decodeMs / 1000)).toFixed(0)} MB/s)`);

let decompressOk = null;
if (refPath) {
  const ref = new Uint8Array(fs.readFileSync(refPath));
  let diff = 0, first = -1;
  const n = Math.min(ref.length, gvas.length);
  for (let i = 0; i < n; i++) if (ref[i] !== gvas[i]) { if (first < 0) first = i; diff++; }
  decompressOk = diff === 0 && ref.length === gvas.length;
  console.log(decompressOk
    ? GRN(`  decompression: byte-identical to the reference decoder (${n} bytes)`)
    : RED(`  decompression: ${diff} bytes differ, first at ${first} (lengths ${gvas.length} vs ${ref.length})`));
}

// ---- 2. an independent, non-recursive re-read ----
// UE writes a property as: name(FString) type(FString) size(u64) [flag] value.
// The scanner below finds a field by looking for its name and decodes only
// what sits immediately after it. It knows nothing about nesting.
const dv = new DataView(gvas.buffer, gvas.byteOffset, gvas.byteLength);
const rdInt = p => dv.getInt32(p, true);
function rdStr(p) {
  const n = dv.getInt32(p, true);
  if (n === 0) return {s: '', end: p + 4};
  if (n < 0) {
    let s = '';
    for (let i = 0; i < -n - 1; i++) s += String.fromCharCode(dv.getUint16(p + 4 + i * 2, true));
    return {s, end: p + 4 - n * 2};
  }
  let s = '';
  for (let i = 0; i < n - 1; i++) s += String.fromCharCode(gvas[p + 4 + i]);
  return {s, end: p + 4 + n};
}
// byte offsets of every occurrence of an ASCII FString with this exact value
function findName(hay, name, from, to) {
  const pat = Buffer.from(name + '\0', 'latin1');
  const buf = Buffer.from(gvas.buffer, gvas.byteOffset, gvas.byteLength);
  let i = from;
  for (;;) {
    i = buf.indexOf(pat, i);
    if (i < 0 || i >= to) return -1;
    // must be preceded by its own length prefix to be a real FString
    if (i >= 4 && dv.getInt32(i - 4, true) === name.length + 1) return i - 4;
    i += 1;
  }
}
// read a field that lives inside [from,to)
function field(from, to, name) {
  const at = findName(from, name, from, to);
  if (at < 0) return undefined;
  const nameEnd = at + 4 + name.length + 1;
  const t = rdStr(nameEnd);
  const size = Number(dv.getBigUint64(t.end, true));
  let p = t.end + 8;
  switch (t.s) {
    case 'IntProperty': return rdInt(p + 1);
    // Level and the three Talents are ByteProperty, not IntProperty — a u8
    // behind an enum-name string. Reading them as ints silently yields 0.
    case 'ByteProperty': { const e = rdStr(p); return e.s === 'None' ? gvas[e.end + 1] : rdStr(e.end + 1).s; }
    case 'BoolProperty': return !!gvas[p];
    case 'StrProperty': case 'NameProperty': return rdStr(p + 1).s;
    case 'EnumProperty': { const e = rdStr(p); return rdStr(e.end + 1).s; }
    case 'ArrayProperty': {
      const inner = rdStr(p); p = inner.end + 1;
      if (inner.s !== 'NameProperty' && inner.s !== 'EnumProperty') return undefined;
      const cnt = rdInt(p); p += 4;
      const out = [];
      for (let i = 0; i < cnt; i++) { const v = rdStr(p); out.push(v.s); p = v.end; }
      return out;
    }
    default: return undefined;
  }
}

// Each pal record begins with the struct name inside its own RawData blob.
const STRUCT = 'PalIndividualCharacterSaveParameter';
const buf = Buffer.from(gvas.buffer, gvas.byteOffset, gvas.byteLength);
const pat = Buffer.from(STRUCT + '\0', 'latin1');
const starts = [];
for (let i = 0; (i = buf.indexOf(pat, i)) >= 0; i += 1) starts.push(i);
console.log(`  scanner found ${starts.length} ${STRUCT} records`);

const scanned = [];
for (let i = 0; i < starts.length; i++) {
  const from = starts[i];
  const to = i + 1 < starts.length ? starts[i + 1] : Math.min(gvas.length, from + 65536);
  const cid = field(from, to, 'CharacterID');
  if (cid === undefined) continue;             // the player row carries no CharacterID
  scanned.push({
    cid,
    gender: ({'EPalGenderType::Male': 'M', 'EPalGenderType::Female': 'F'})[field(from, to, 'Gender')] || null,
    level: field(from, to, 'Level') || 1,
    iv: [field(from, to, 'Talent_HP') || 0, field(from, to, 'Talent_Shot') || 0, field(from, to, 'Talent_Defense') || 0],
    passives: field(from, to, 'PassiveSkillList') || [],
    nickname: field(from, to, 'NickName') || '',
  });
}

// ---- compare ----
const parsed = P.extractPals(gvas, 0).pals;
console.log(`  savparse.js read ${parsed.length} pals · scanner read ${scanned.length}`);

const byCid = new Map();
for (const s of scanned) { if (!byCid.has(s.cid)) byCid.set(s.cid, []); byCid.get(s.cid).push(s); }
let checked = 0, bad = 0;
const problems = [];
for (const p of parsed) {
  const cands = byCid.get(p.cid);
  if (!cands || !cands.length) { problems.push(`${p.cid}: scanner never saw this record`); bad++; continue; }
  // match on the whole tuple so duplicate species don't cross-match
  const key = x => `${x.gender}|${x.level}|${x.iv.join(',')}|${[...x.passives].sort().join(',')}|${x.nickname}`;
  const want = key(p);
  const hit = cands.findIndex(c => key(c) === want);
  checked++;
  if (hit < 0) {
    bad++;
    problems.push(`${p.cid}: parser says ${want}\n        scanner has ${cands.map(key).join(' / ')}`);
  } else cands.splice(hit, 1);
}
if (bad === 0) console.log(GRN(`  parse: all ${checked} pals agree on species, gender, level, IVs, passives and nickname`));
else {
  console.log(RED(`  parse: ${bad} of ${checked} disagree`));
  problems.slice(0, 12).forEach(x => console.log('      ' + RED(x)));
}

const leftovers = [...byCid.values()].flat();
if (leftovers.length) console.log(RED(`  ${leftovers.length} scanned record(s) the parser never produced: ` +
  leftovers.slice(0, 6).map(x => x.cid).join(', ')));

console.log();
process.exit((bad || leftovers.length || decompressOk === false) ? 1 : 0);
