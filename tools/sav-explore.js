#!/usr/bin/env node
/* Explore a Palworld save's property tree.
 *
 *   node sav-explore.js <file.sav> [path] [options]
 *
 *   node sav-explore.js Level.sav                        top level, sizes only
 *   node sav-explore.js Level.sav worldSaveData --depth 1
 *   node sav-explore.js Level.sav worldSaveData.GroupSaveDataMap --depth 3 --raw --values
 *   node sav-explore.js Level.sav --find ItemContainerId
 *   node sav-explore.js Level.sav worldSaveData.BaseCampSaveData --json out.json
 *
 * Options
 *   --depth N     how far to expand (default 1; the tree is deep and wide)
 *   --limit N     entries shown per map/array (default 3) — sizes are still exact
 *   --raw         parse RawData byte arrays as the nested property trees they are
 *   --values      print scalar values, not just types and sizes
 *   --find NAME   print every path where a property with this name occurs
 *   --json FILE   write the walked subtree as JSON
 *   --gvas FILE   dump the decompressed bytes and stop
 *
 * The pal reader in js/savparse.js only cares about CharacterSaveParameterMap.
 * Everything else in a save — bases, containers, guilds, item stacks, world
 * objects, dungeons — is still unmapped, and this is the tool for mapping it.
 * docs/save-format.md is what is known so far; add to it.
 *
 * Nothing here touches the network, and a real save must stay out of the repo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'savparse.js'));

const C = {d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m`, m: s => `\x1b[35m${s}\x1b[0m`};

// ---------- args ----------
const argv = process.argv.slice(2);
const file = argv.find(a => !a.startsWith('--') && /\.sav$/i.test(a));
const flag = (name, dflt) => { const i = argv.indexOf('--' + name); return i < 0 ? dflt : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const has = name => argv.includes('--' + name);
const wantPath = argv.find(a => !a.startsWith('--') && a !== file && !/\.sav$/i.test(a) &&
  argv[argv.indexOf(a) - 1] !== '--find' && argv[argv.indexOf(a) - 1] !== '--json' &&
  argv[argv.indexOf(a) - 1] !== '--depth' && argv[argv.indexOf(a) - 1] !== '--limit' &&
  argv[argv.indexOf(a) - 1] !== '--gvas');
const DEPTH = Number(flag('depth', 1));
const LIMIT = Number(flag('limit', 3));
const RAW = has('raw');
const VALUES = has('values');
const FIND = flag('find', null);
const JSONOUT = flag('json', null);
const GVASOUT = flag('gvas', null);

if (!file) {
  console.error(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\* ?/, '').replace(/^ \* ?/gm, ''));
  process.exit(2);
}

// ---------- decompress, all of it (exploration is not the app's hot path) ----------
const sav = new Uint8Array(fs.readFileSync(file));
const head = P.readHeader(sav);
console.log(C.b(`\n${path.basename(file)}`));
console.log(`  ${sav.length.toLocaleString()} bytes on disk · magic ${head.magic}${head.type.toString(16)} · ${head.uncompressed.toLocaleString()} decompressed`);
let gvas;
if (head.magic === 'PlZ') {
  const zlib = require('zlib');
  gvas = new Uint8Array(zlib.inflateSync(Buffer.from(sav.subarray(12))));
  if (head.type === 0x32) gvas = new Uint8Array(zlib.inflateSync(Buffer.from(gvas.subarray(12))));
} else {
  gvas = new Uint8Array(head.uncompressed);
  const t0 = process.hrtime.bigint();
  P.oodleDecode(sav, 12, gvas, head.uncompressed, null);
  console.log(`  decompressed in ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`);
}
if (GVASOUT && GVASOUT !== true) { fs.writeFileSync(GVASOUT, gvas); console.log(`  wrote ${GVASOUT}`); process.exit(0); }

// ---------- a metadata-preserving walker ----------
// Deliberately not js/savparse.js's readProps: that returns values, and what
// you need when mapping an unknown region is types, sizes and offsets. It also
// skips by the declared size wherever it can, so pointing this at a 4 MB
// subtree doesn't have to parse all of it to tell you what's in it.
const R = P.Reader;
const num = n => n.toLocaleString();

function readHeaderEnd(r) {
  r.p = 4; r.u32(); r.u32(); r.u32(); r.p += 6; r.u32(); r.str(); r.u32();
  const nc = r.u32(); r.p += nc * 20; r.str();
  return r.p;
}

// header of one property: name, type, and where its data begins
function propHead(r) {
  const at = r.p;
  const name = r.str();
  if (name === 'None' || name === '') return null;
  const type = r.str();
  const size = r.u64();
  const n = {at, name, type, size};
  // What sits between the size and the data depends on the type, and `size`
  // counts only the data. Enum and Byte carry an enum-name FString before the
  // flag byte — miss it and every size-skip after this property is off by the
  // length of that string, which desyncs the whole walk.
  if (type === 'StructProperty') { n.structType = r.str(); r.p += 17; }
  else if (type === 'ArrayProperty') { n.inner = r.str(); r.p += 1; }
  else if (type === 'MapProperty') { n.keyType = r.str(); n.valueType = r.str(); r.p += 1; }
  else if (type === 'EnumProperty' || type === 'ByteProperty') { n.enumName = r.str(); r.p += 1; }
  // BoolProperty is the other one that bites: its size is 0 and its value byte
  // sits BEFORE the guid flag, so the property occupies two bytes that `size`
  // does not account for. Skipping by size alone lands one byte short and
  // desyncs every property after it.
  else if (type === 'BoolProperty') { n.boolValue = !!r.u8(); r.p += 1; }
  else r.p += 1;
  n.dataAt = r.p;
  return n;
}

function scalar(r, type, n) {
  switch (type) {
    case 'IntProperty': return r.i32();
    case 'Int64Property': return r.i64();
    case 'FloatProperty': return r.f32();
    case 'DoubleProperty': return r.f64();
    case 'BoolProperty': return n.boolValue;
    case 'StrProperty': case 'NameProperty': return r.str();
    case 'EnumProperty': { r.p = n.dataAt; return r.str(); }
    // Level and the Talents live here — a u8 behind an enum-name string, not
    // an int. See docs/save-format.md.
    case 'ByteProperty': { r.p = n.dataAt; return n.enumName === 'None' ? r.u8() : r.str(); }
    default: return undefined;
  }
}

// Does the position hold an FString that could be a property name?
function looksLikePropertyList(r) {
  if (r.p + 8 > r.b.length) return false;
  const n = r.v.getInt32(r.p, true);
  if (n < 2 || n > 128) return false;
  if (r.p + 4 + n > r.b.length) return false;
  if (r.b[r.p + 4 + n - 1] !== 0) return false;
  for (let i = 0; i < n - 1; i++) { const c = r.b[r.p + 4 + i]; if (c < 0x20 || c > 0x7e) return false; }
  return true;
}

// Inside a Map or a non-struct Array, a value is stored BARE: no name, no
// type, no size, no guid flag — just the value. Reading it with the
// property-header-aware reader above eats a byte that isn't there.
function bare(r, type) {
  switch (type) {
    case 'IntProperty': return r.i32();
    case 'Int64Property': return r.i64();
    case 'FloatProperty': return r.f32();
    case 'DoubleProperty': return r.f64();
    case 'BoolProperty': return !!r.u8();
    case 'ByteProperty': return r.u8();
    case 'StrProperty': case 'NameProperty': case 'EnumProperty': return r.str();
    default: return undefined;
  }
}

function walk(r, end, depth, prefix) {
  const out = [];
  const cap = Math.min(end, r.b.length);
  while (r.p < cap) {
    let n;
    try { n = propHead(r); } catch (e) { out.push({name: '(unreadable)', type: 'Property', error: e.message, at: r.p}); break; }
    if (!n) break;
    if (n.dataAt + n.size > r.b.length || n.size < 0) {
      out.push({name: n.name, type: n.type, size: n.size, at: n.at,
        error: `declared size runs past the end of the data (${n.dataAt}+${n.size} > ${r.b.length})`});
      break;
    }
    n.path = prefix ? prefix + '.' + n.name : n.name;
    const after = n.dataAt + n.size;
    try { expand(r, n, depth); } catch (e) { n.error = e.message; }
    out.push(n);
    r.p = after;
    if (r.p > end) break;
  }
  return out;
}

function expand(r, n, depth) {
  if (n.type === 'StructProperty') {
    if (['Guid', 'Vector', 'Quat', 'LinearColor', 'DateTime'].includes(n.structType)) {
      if (VALUES) n.value = n.structType === 'Guid' ? r.guid() : '(' + n.structType + ')';
      return;
    }
    if (depth > 0) n.children = walk(r, n.dataAt + n.size, depth - 1, n.path);
    return;
  }
  if (n.type === 'ArrayProperty') {
    const cnt = r.u32();
    n.count = cnt;
    if (n.inner === 'ByteProperty') {
      n.bytes = cnt;
      // A RawData blob is a whole property tree of its own. This is the step
      // naive parsers miss, and it is where every per-pal field lives. But not
      // every byte array is one — CustomVersionData sits right beside RawData
      // and is a plain version blob — so sniff before parsing.
      if (RAW && depth > 0 && cnt > 8) {
        const blob = r.b.subarray(r.p, r.p + cnt);
        if (looksLikePropertyList(new R(blob, 0))) {
          try {
            n.children = walk(new R(blob, 0), blob.length, depth - 1, n.path + '→raw');
            n.rawParsed = true;
            // A blob that starts like a property tree but doesn't finish as one
            // is a find, not a failure — it is an unmapped structure. Say so
            // plainly so it reads as work to do rather than a broken walker.
            const stuck = n.children.findIndex(c => c.error);
            if (stuck >= 0) { n.rawNote = 'starts as a property tree but does not parse to the end — unmapped'; n.children = n.children.slice(0, stuck); }
          } catch (e) { n.rawNote = 'unmapped blob: ' + e.message; }
        } else n.rawNote = 'not a property tree';
      }
      return;
    }
    if (n.inner === 'StructProperty') {
      const pn = r.str(), pt = r.str(), ps = r.u64(), st = r.str(); r.guid(); r.u8();
      n.elemStruct = st;
      if (depth > 0 && cnt > 0) {
        const arrEnd = n.dataAt + n.size;
        // Same ambiguity as a struct map key: the element may be a property
        // list, or the raw bytes of a known struct (Color, Vector, Guid…).
        // Nothing in the header says which, so sniff the first element.
        if (!looksLikePropertyList(r)) {
          n.elemForm = `POD, ${Math.round((arrEnd - r.p) / cnt)} B each`;
          return;
        }
        n.elemForm = 'property list';
        n.items = [];
        for (let i = 0; i < Math.min(cnt, LIMIT); i++) {
          const at = r.p;
          n.items.push({index: i, at, children: walk(r, arrEnd, depth - 1, n.path + '[' + i + ']')});
        }
      }
      return;
    }
    if (depth > 0 && VALUES) {
      n.items = [];
      for (let i = 0; i < Math.min(cnt, LIMIT); i++) n.items.push({index: i, value: bare(r, n.inner)});
    }
    return;
  }
  if (n.type === 'MapProperty') {
    r.u32(); const cnt = r.u32();
    n.count = cnt;
    if (depth > 0) {
      const mapEnd = n.dataAt + n.size;
      n.items = [];
      for (let i = 0; i < Math.min(cnt, LIMIT); i++) {
        if (r.p >= mapEnd) break;
        const at = r.p;
        let key;
        if (n.keyType === 'StructProperty') {
          // A struct map key is stored one of two ways and the map header does
          // not say which: a property list terminated by None (as
          // CharacterSaveParameterMap's {PlayerUId, InstanceId} is), or the
          // raw bytes of a known struct — usually a bare 16-byte Guid. You
          // have to sniff it. Reading a Guid key as a property list produces a
          // garbage FString length and takes the whole walk with it.
          if (looksLikePropertyList(r)) { key = walk(r, mapEnd, 1, ''); n.keyForm = 'property list'; }
          else if (r.p + 16 <= mapEnd) { key = [{name: '(struct key)', type: 'Guid', value: r.guid()}]; n.keyForm = 'bare Guid'; }
          else { key = [{name: '(struct key)', type: '?', error: 'no room left in the map for a key'}]; break; }
        } else key = {value: bare(r, n.keyType)};
        const val = n.valueType === 'StructProperty' ? walk(r, mapEnd, depth - 1, n.path + '{}') : {value: bare(r, n.valueType)};
        n.items.push({index: i, at, key, val});
      }
    }
    return;
  }
  if (VALUES) n.value = scalar(r, n.type, n);
}

// ---------- rendering ----------
function typeLabel(n) {
  if (n.type === 'StructProperty') return C.c(`Struct<${n.structType}>`);
  if (n.type === 'ArrayProperty') return C.c(`Array[${n.inner}${n.elemStruct ? '<' + n.elemStruct + '>' : ''}]`);
  if (n.type === 'MapProperty') return C.c(`Map<${n.keyType}→${n.valueType}>`);
  return C.c(n.type.replace('Property', ''));
}
function render(nodes, ind) {
  for (const n of nodes) {
    const bits = [`${' '.repeat(ind)}${C.b(n.name)} : ${typeLabel(n)}`];
    if (n.size != null) bits.push(C.d(num(n.size) + ' B'));
    if (n.count != null) bits.push(C.y(num(n.count) + (n.type === 'MapProperty' ? ' entries' : ' items')));
    if (n.keyForm) bits.push(C.d('key: ' + n.keyForm));
    if (n.elemForm) bits.push(C.d(n.elemForm));
    if (n.bytes != null) bits.push(C.y(num(n.bytes) + ' raw bytes'));
    if (n.value !== undefined) bits.push('= ' + C.g(JSON.stringify(n.value)));
    else if (n.boolValue !== undefined && VALUES) bits.push('= ' + C.g(String(n.boolValue)));
    if (n.error) bits.push(C.m('!! ' + n.error));
    if (n.rawError) bits.push(C.m('!! raw: ' + n.rawError));
    if (n.rawNote) bits.push(C.d(n.rawNote));
    console.log(bits.join('  '));
    if (n.children) render(n.children, ind + 2);
    if (n.items) for (const it of n.items) {
      const head = `${' '.repeat(ind + 2)}${C.d('[' + it.index + ']')}`;
      if (it.key) {
        console.log(head + ' ' + C.d('key'));
        render(Array.isArray(it.key) ? it.key : [], ind + 6);
        console.log(`${' '.repeat(ind + 2)}    ${C.d('value')}`);
        render(Array.isArray(it.val) ? it.val : [], ind + 6);
      } else if (it.children) { console.log(head); render(it.children, ind + 6); }
      else console.log(head + ' = ' + C.g(JSON.stringify(it.value)));
    }
    if (n.items && n.count > n.items.length)
      console.log(`${' '.repeat(ind + 2)}${C.d(`… ${num(n.count - n.items.length)} more (raise --limit)`)}`);
  }
}

// ---------- --find: where does this name occur? ----------
// Searches the bytes for the FString, then confirms it is a property name by
// checking the length prefix. Much faster than walking, and it finds names in
// RawData blobs that a structural walk would have to opt into.
function findName(name) {
  const buf = Buffer.from(gvas.buffer, gvas.byteOffset, gvas.byteLength);
  const dv = new DataView(gvas.buffer, gvas.byteOffset, gvas.byteLength);
  const pat = Buffer.from(name + '\0', 'latin1');
  const hits = [];
  let i = 0;
  while ((i = buf.indexOf(pat, i)) >= 0) {
    if (i >= 4 && dv.getInt32(i - 4, true) === name.length + 1) {
      const r = new R(gvas, i - 4);
      const nm = r.str(), ty = r.str();
      let sz = 0; try { sz = r.u64(); } catch {}
      hits.push({at: i - 4, type: ty, size: sz});
    }
    i += 1;
  }
  console.log(`\n${C.b(name)} occurs as a property name ${C.y(num(hits.length))} time(s)`);
  const byType = {};
  for (const hh of hits) byType[hh.type] = (byType[hh.type] || 0) + 1;
  for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1]))
    console.log(`  ${C.c(t)} × ${num(c)}`);
  for (const hh of hits.slice(0, 8))
    console.log(C.d(`  at ${num(hh.at)} · ${hh.type} · ${num(hh.size)} B`));
  if (hits.length > 8) console.log(C.d(`  … ${num(hits.length - 8)} more`));
}

// ---------- go ----------
const r = new R(gvas, 0);
const rootAt = readHeaderEnd(r);

if (FIND && FIND !== true) { findName(String(FIND)); process.exit(0); }

// resolve a dotted path by walking down one level at a time
let start = rootAt, end = gvas.length, label = '(root)';
if (wantPath) {
  const parts = String(wantPath).split('.');
  let p = rootAt, e = gvas.length;
  for (const part of parts) {
    const rr = new R(gvas, p);
    let found = null;
    while (rr.p < e) {
      const n = propHead(rr);
      if (!n) break;
      if (n.name === part) { found = n; break; }
      rr.p = n.dataAt + n.size;
    }
    if (!found) { console.error(`\n  no property named "${part}" under ${label}`); process.exit(1); }
    p = found.dataAt; e = found.dataAt + found.size; label = found.path || part;
    if (found.type === 'MapProperty' || found.type === 'ArrayProperty') {
      // stop here — a map/array isn't a property list you can descend by name
      const rr2 = new R(gvas, found.dataAt);
      found.path = part;
      expand(rr2, found, DEPTH);
      console.log('');
      render([found], 2);
      process.exit(0);
    }
  }
  start = p; end = e;
}
console.log('');
const tree = walk(new R(gvas, start), end, DEPTH, '');
render(tree, 2);
if (JSONOUT && JSONOUT !== true) {
  fs.writeFileSync(JSONOUT, JSON.stringify(tree, (k, v) => k === 'b' ? undefined : v, 1));
  console.log(C.d(`\n  wrote ${JSONOUT}`));
}
console.log('');
