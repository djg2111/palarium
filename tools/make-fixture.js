#!/usr/bin/env node
/* Build the checked-in synthetic saves in tests/.
 *
 *   node make-fixture.js
 *
 * These exist so the parser has a test that doesn't depend on anyone's
 * personal save. A real Level.sav carries a Steam ID, a world GUID and player
 * names and must never enter the repo; these carry made-up pals and nothing
 * else.
 *
 * They are written with STORED quanta — the Oodle container's "this block is
 * not compressed" form, which both the shipped reader and the reference
 * decoder accept. That means a fixture can be generated without an Oodle
 * compressor, which does not exist outside Rad Game Tools. The compressed
 * path is covered by the real-save check in sav-check.js instead.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- tiny GVAS writer ----------
function buf() { return {b: []}; }
const w = {
  u8: (o, v) => o.b.push(v & 0xFF),
  u32: (o, v) => { for (let i = 0; i < 4; i++) o.b.push((v >>> (i * 8)) & 0xFF); },
  i32: (o, v) => w.u32(o, v >>> 0),
  u64: (o, v) => { w.u32(o, v % 4294967296); w.u32(o, Math.floor(v / 4294967296)); },
  raw: (o, a) => { for (const b of a) o.b.push(b); },
  // UE FString: positive length = ASCII with NUL, negative = UTF-16LE. The
  // fixture writes a UTF-16 nickname on purpose so the reader's negative-length
  // branch is exercised by a test rather than only by trust.
  str: (o, s) => {
    if (s === '') { w.i32(o, 0); return; }
    if (/^[\x20-\x7e]*$/.test(s)) {
      w.i32(o, s.length + 1);
      for (let i = 0; i < s.length; i++) o.b.push(s.charCodeAt(i));
      o.b.push(0);
    } else {
      w.i32(o, -(s.length + 1));
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); o.b.push(c & 0xFF, c >> 8); }
      o.b.push(0, 0);
    }
  },
  guid: (o, hex) => { for (let i = 0; i < 16; i++) o.b.push(parseInt(hex.substr(i * 2, 2), 16)); },
};
// property helpers: each writes name/type/size/flag/value
function prop(o, name, type, writeVal, structType) {
  w.str(o, name); w.str(o, type);
  const v = buf(); writeVal(v);
  w.u64(o, v.b.length);
  if (type === 'StructProperty') { w.str(o, structType); w.raw(o, new Array(16).fill(0)); w.u8(o, 0); }
  else w.u8(o, 0);
  w.raw(o, v.b);
}
const pInt = (o, n, v) => prop(o, n, 'IntProperty', x => w.i32(x, v));
const pByte = (o, n, v) => prop(o, n, 'ByteProperty', x => w.u8(x, v), null);
const pName = (o, n, v) => prop(o, n, 'NameProperty', x => w.str(x, v));
const pStr = (o, n, v) => prop(o, n, 'StrProperty', x => w.str(x, v));
const pBool = (o, n, v) => { w.str(o, n); w.str(o, 'BoolProperty'); w.u64(o, 0); w.u8(o, v ? 1 : 0); w.u8(o, 0); };
const pEnum = (o, n, e, v) => { w.str(o, n); w.str(o, 'EnumProperty'); const t = buf(); w.str(t, v); w.u64(o, t.b.length); w.str(o, e); w.u8(o, 0); w.raw(o, t.b); };
const pNameArr = (o, n, vals) => {
  w.str(o, n); w.str(o, 'ArrayProperty');
  const v = buf(); w.i32(v, vals.length); for (const s of vals) w.str(v, s);
  w.u64(o, v.b.length); w.str(o, 'NameProperty'); w.u8(o, 0); w.raw(o, v.b);
};
// ByteProperty needs its enum-name string before the flag byte
function pByteReal(o, n, v) {
  w.str(o, n); w.str(o, 'ByteProperty'); w.u64(o, 1); w.str(o, 'None'); w.u8(o, 0); w.u8(o, v);
}

function palRawData(p) {
  const inner = buf();
  const sp = buf();
  if (p.cid) pName(sp, 'CharacterID', p.cid);
  if (p.gender) pEnum(sp, 'Gender', 'EPalGenderType', 'EPalGenderType::' + (p.gender === 'M' ? 'Male' : 'Female'));
  if (p.level != null) pByteReal(sp, 'Level', p.level);
  if (p.iv) { pByteReal(sp, 'Talent_HP', p.iv[0]); pByteReal(sp, 'Talent_Shot', p.iv[1]); pByteReal(sp, 'Talent_Defense', p.iv[2]); }
  if (p.passives && p.passives.length) pNameArr(sp, 'PassiveSkillList', p.passives);
  if (p.nickname) pStr(sp, 'NickName', p.nickname);
  if (p.isPlayer) pBool(sp, 'IsPlayer', true);
  if (p.rare) pBool(sp, 'IsRarePal', true);
  w.str(sp, 'None');
  prop(inner, 'SaveParameter', 'StructProperty', x => w.raw(x, sp.b), 'PalIndividualCharacterSaveParameter');
  w.str(inner, 'None');
  return inner.b;
}

function buildGvas(pals) {
  const o = buf();
  w.raw(o, [0x47, 0x56, 0x41, 0x53]);       // GVAS
  w.u32(o, 3); w.u32(o, 522); w.u32(o, 1008);
  o.b.push(5, 0, 1, 0, 1, 0);                // engine 5.1.1
  w.u32(o, 0);
  w.str(o, '++UE5+Release-5.1');
  w.u32(o, 3);
  w.u32(o, 0);                               // no custom versions — keeps it small
  w.str(o, '/Script/Pal.PalWorldSaveGame');

  pInt(o, 'Version', 100);

  // worldSaveData { CharacterSaveParameterMap }
  const world = buf();
  {
    w.str(world, 'CharacterSaveParameterMap'); w.str(world, 'MapProperty');
    const m = buf();
    w.u32(m, 0); w.u32(m, pals.length);
    for (const p of pals) {
      const k = buf();
      prop(k, 'PlayerUId', 'StructProperty', x => w.guid(x, p.owner || '00000000000000000000000001000000'), 'Guid');
      prop(k, 'InstanceId', 'StructProperty', x => w.guid(x, p.guid), 'Guid');
      w.str(k, 'None');
      w.raw(m, k.b);
      const val = buf();
      const rd = palRawData(p);
      w.str(val, 'RawData'); w.str(val, 'ArrayProperty');
      const av = buf(); w.i32(av, rd.length); w.raw(av, rd);
      w.u64(val, av.b.length); w.str(val, 'ByteProperty'); w.u8(val, 0); w.raw(val, av.b);
      w.str(val, 'None');
      w.raw(m, val.b);
    }
    w.u64(world, m.b.length);
    w.str(world, 'StructProperty'); w.str(world, 'StructProperty'); w.u8(world, 0);
    w.raw(world, m.b);
  }
  w.str(world, 'None');
  prop(o, 'worldSaveData', 'StructProperty', x => w.raw(x, world.b), 'PalWorldSaveData');
  w.str(o, 'None');
  return Buffer.from(o.b);
}

// ---------- container ----------
// Stored quanta: block header 0x8c 0x0a, then per <=256 KB block a 3-byte
// quantum header whose length equals the block length, which both decoders
// read as "copy this through".
function wrapOodle(gvas) {
  const parts = [];
  let p = 0;
  while (p < gvas.length) {
    const n = Math.min(262144, gvas.length - p);
    const hdr = Buffer.from([0x8c, 0x0a, ((n - 1) >> 16) & 0xFF, ((n - 1) >> 8) & 0xFF, (n - 1) & 0xFF]);
    parts.push(hdr, gvas.subarray(p, p + n));
    p += n;
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(gvas.length, 0);
  head.writeUInt32LE(body.length, 4);
  head.write('PlM', 8, 'latin1');
  head[11] = 0x31;
  return Buffer.concat([head, body]);
}

// ---------- the fixture pals ----------
// Deliberate coverage: an alpha (BOSS_), a pal with no passives, a pal with
// four, a pal missing Level and Talents entirely (UE omits defaults), a
// non-ASCII nickname to exercise the UTF-16 string branch, the player row
// (which has no CharacterID and must be skipped), and two identical Anubis so
// an ambiguous match has something to be ambiguous about.
const BEFORE = [
  {guid: '1111111111111111111111111111aaaa', cid: 'SheepBall', gender: 'M', level: 12, iv: [50, 60, 70], passives: ['Noukin', 'PAL_ALLAttack_up2']},
  {guid: '2222222222222222222222222222bbbb', cid: 'PinkCat', gender: 'F', level: 30, iv: [100, 0, 45], passives: ['Legend', 'PAL_ALLAttack_up3', 'Deffence_up2', 'MoveSpeed_up_2'], nickname: 'Ｍｉｓｏ ねこ'},
  {guid: '3333333333333333333333333333cccc', cid: 'BOSS_Anubis', gender: 'M', level: 45, iv: [90, 91, 92], passives: ['Legend'], rare: true},
  {guid: '4444444444444444444444444444dddd', cid: 'Anubis', gender: 'M', passives: ['Noukin']},
  {guid: '5555555555555555555555555555eeee', cid: 'Anubis', gender: 'M', passives: ['Noukin']},
  {guid: '6666666666666666666666666666ffff', cid: 'BluePlatypus_Fire', gender: 'F', level: 7, iv: [1, 2, 3], passives: []},
  {guid: '77777777777777777777777777770000', cid: 'Penguin', gender: 'F', level: 20, iv: [35, 60, 34], passives: ['ElementResist_Dragon_1_PAL']},
  {guid: '88888888888888888888888888880000', isPlayer: true, nickname: 'TestPlayer'},
];
// The same world an hour later: PinkCat renamed in-game and levelled, SheepBall
// levelled, one new pal caught, nothing removed.
const AFTER = BEFORE.map(p => ({...p})).map(p => {
  if (p.guid === '2222222222222222222222222222bbbb') return {...p, level: 41, iv: [100, 5, 45], nickname: 'RenamedInGame'};
  if (p.guid === '1111111111111111111111111111aaaa') return {...p, level: 25};
  return p;
}).concat([{guid: '99999999999999999999999999990000', cid: 'FoxMage', gender: 'F', level: 3, iv: [11, 22, 33], passives: ['PAL_ALLAttack_up1']}]);

const outDir = path.join(__dirname, '..', 'tests');
fs.mkdirSync(outDir, {recursive: true});
for (const [name, pals] of [['fixture-before', BEFORE], ['fixture-after', AFTER]]) {
  const gvas = buildGvas(pals);
  const sav = wrapOodle(gvas);
  fs.writeFileSync(path.join(outDir, name + '.sav'), sav);
  console.log(`${name}.sav  ${sav.length} bytes (${gvas.length} decompressed, ${pals.length} entries)`);
}
// a file that is not a save at all, and a truncated one — both are benchmarks
fs.writeFileSync(path.join(outDir, 'fixture-notasave.sav'), Buffer.from('This is a screenshot, not a save file.\n'.repeat(40)));
const full = fs.readFileSync(path.join(outDir, 'fixture-before.sav'));
fs.writeFileSync(path.join(outDir, 'fixture-truncated.sav'), full.subarray(0, Math.floor(full.length / 3)));
console.log('fixture-notasave.sav and fixture-truncated.sav written');
