#!/usr/bin/env node
/* Census the compressed container of a .sav, without decompressing it.
 *
 *   node sav-oodle.js <file.sav> [--chunks] [--arrays]
 *
 * This is the tool to reach for when Palworld changes its save format again.
 * It walks the framing and reports what it finds; if the walk lands exactly on
 * the end of the file, the framing is understood, and if it doesn't, the first
 * place it goes wrong is where to start looking.
 *
 *   --chunks   print every block and quantum, not just the summary
 *   --arrays   also walk each Mermaid chunk's arrays and census their types
 *
 * The format this expects is in docs/save-format.md. The short version:
 *
 *   12-byte header: u32 uncompressed, u32 compressed, 3-byte magic, 1 type byte
 *     magic "PlZ" -> zlib          magic "PlM" -> Oodle
 *   then per <=256 KB block: 2-byte Oodle block header
 *     b0 & 0x0F == 0x0C            b1 & 0x7F = decoder type (10 = Mermaid)
 *     b0 >> 6 & 1 = uncompressed   b1 >> 7   = quantum CRCs present
 *   then per quantum: 3-byte big-endian header
 *     compressed length = (v & 0x3FFFF) + 1   (+3 bytes of CRC if flagged)
 *     length == block length -> the block is stored verbatim
 *
 * A first sanity check on any new save is simply: does this end EXACTLY on the
 * file length? Everything downstream depends on that.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const C = {d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m`};

const file = process.argv[2];
const SHOW_CHUNKS = process.argv.includes('--chunks');
const SHOW_ARRAYS = process.argv.includes('--arrays');
if (!file) { console.error('usage: sav-oodle.js <file.sav> [--chunks] [--arrays]'); process.exit(2); }

const b = new Uint8Array(fs.readFileSync(file));
const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
const be24 = p => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
const num = n => n.toLocaleString();

const uncompressed = dv.getUint32(0, true);
const compressed = dv.getUint32(4, true);
const magic = String.fromCharCode(b[8], b[9], b[10]);
const type = b[11];

console.log(C.b(`\n${path.basename(file)}`));
console.log(`  file            ${num(b.length)} bytes`);
console.log(`  header says     ${num(uncompressed)} uncompressed · ${num(compressed)} compressed`);
console.log(`  magic           ${C.c(magic + '' + String.fromCharCode(type))} ` +
  (magic === 'PlZ' ? C.d('(zlib — pre-0.6; the browser reads this natively)')
   : magic === 'PlM' ? C.d('(Oodle — 0.6 and later, including 1.0)') : C.r('(unknown)')));
console.log(`  payload         ${num(b.length - 12)} bytes ` +
  (compressed === b.length - 12 ? C.g('= compressed size ✓') : C.r(`≠ compressed size (${num(compressed)})`)));

if (magic !== 'PlM') {
  if (magic === 'PlZ') {
    console.log(`  zlib header     ${b[12].toString(16)} ${b[13].toString(16)}` +
      (b[12] === 0x78 ? C.g('  (0x78 = deflate ✓)') : C.r('  (expected 0x78)')));
  }
  console.log('');
  process.exit(0);
}

// ---------- walk the Oodle framing ----------
const decoderTypes = {}, arrayTypes = {}, chunkTypes = {};
let p = 12, left = uncompressed, blocks = 0, quanta = 0, stored = 0, chunks = 0;
let firstProblem = null;

// array header: enough of it to know the type and how far to step over it
function arrayHeader(at, end) {
  const first = b[at];
  let t = first >> 4;
  if (first >= 0x80) {
    t &= 7;
    if (t === 0) { const h = (b[at] << 8) | b[at + 1]; return {t: 0, used: 2 + (h & 0xFFF), toLen: h & 0xFFF, short: true}; }
    const h = be24(at), cl = h & 1023;
    return {t, used: 3 + cl, toLen: ((h >> 10) & 1023) + cl + 1, short: true};
  }
  if (t === 0) { const h = be24(at); return {t: 0, used: 3 + (h & 0x3FFFF), toLen: h & 0x3FFFF}; }
  const hv = (BigInt(b[at]) << 32n) | BigInt(((b[at + 1] << 24) >>> 0) + (b[at + 2] << 16) + (b[at + 3] << 8) + b[at + 4]);
  const at2 = Number(hv >> 36n), cl = Number(hv & 0x3FFFFn);
  return {t: at2, used: 5 + cl, toLen: Number((hv >> 18n) & 0x3FFFFn) + 1};
}
const ARRAY_NAMES = {0: 'uncompressed', 1: 'TANS', 2: 'Huffman', 3: 'RLE', 4: 'Huffman ×6', 5: 'split'};

while (left > 0) {
  if (p + 5 > b.length) { firstProblem = `ran out of file at ${num(p)} with ${num(left)} bytes still to produce`; break; }
  const b0 = b[p], b1 = b[p + 1];
  if ((b0 & 0x0F) !== 0x0C) { firstProblem = `block header at ${num(p)} is ${b0.toString(16)} ${b1.toString(16)} — low nibble should be 0xC`; break; }
  const dt = b1 & 0x7F, crc = b1 >> 7, unc = (b0 >> 6) & 1;
  decoderTypes[dt] = (decoderTypes[dt] || 0) + 1;
  p += 2;
  const blockLen = Math.min(262144, left);
  const v = be24(p); p += 3;
  if (crc) p += 3;
  const size = v & 0x3FFFF;
  const compLen = size === 0x3FFFF ? blockLen : size + 1;
  if (p + compLen > b.length) { firstProblem = `quantum at ${num(p)} claims ${num(compLen)} bytes, past the end of the file`; break; }

  if (SHOW_CHUNKS) console.log(C.d(`  block ${String(blocks).padStart(4)} @${String(num(p - (crc ? 8 : 5))).padStart(11)} ` +
    `decoder ${dt} crc ${crc} unc ${unc} · quantum ${num(compLen)} B -> ${num(blockLen)} B`));

  if (compLen === blockLen) stored++;
  else if (compLen !== 0 && SHOW_ARRAYS && dt === 10) {
    // walk the Mermaid chunks inside this quantum
    let cp = p, to = 0;
    while (to < blockLen && cp < p + compLen) {
      const chunkLen = Math.min(131072, blockLen - to);
      const h = be24(cp);
      if (h >= (1 << 23)) {
        const ct = (h >> 19) & 0xF, ccl = h & ((1 << 19) - 1);
        chunkTypes[ct] = (chunkTypes[ct] || 0) + 1;
        chunks++;
        cp += 3;
        if (ccl < chunkLen) {
          // literals array, then packets array
          let q = cp + (to === 0 && p === 17 ? 8 : 0);
          if (to === 0 && blocks === 0) q = cp + 8;   // the 8 raw seed bytes at stream start
          for (let k = 0; k < 2 && q < cp + ccl; k++) {
            const a = arrayHeader(q, cp + ccl);
            arrayTypes[a.t] = (arrayTypes[a.t] || 0) + 1;
            q += a.used;
          }
        }
        cp += ccl; to += chunkLen;
      } else {
        const a = arrayHeader(cp, p + compLen);
        arrayTypes['whole-chunk ' + a.t] = (arrayTypes['whole-chunk ' + a.t] || 0) + 1;
        cp += a.used; to += chunkLen;
      }
    }
  }

  p += compLen; left -= blockLen; blocks++; quanta++;
}

console.log('');
console.log(`  blocks          ${num(blocks)}${stored ? ` (${num(stored)} stored verbatim)` : ''}`);
console.log(`  decoder types   ${Object.entries(decoderTypes).map(([k, v]) => `${k}${k === '10' ? ' (Mermaid/Selkie)' : ''} ×${num(v)}`).join(', ') || '—'}`);
if (SHOW_ARRAYS) {
  console.log(`  chunk types     ${Object.entries(chunkTypes).map(([k, v]) => `${k}${k === '1' ? ' (raw literals)' : k === '0' ? ' (sub literals)' : ''} ×${num(v)}`).join(', ') || '—'}`);
  console.log(`  array types     ${Object.entries(arrayTypes).map(([k, v]) => `${ARRAY_NAMES[k] || k} ×${num(v)}`).join(', ') || '—'}`);
  const unsupported = Object.keys(arrayTypes).filter(k => ['1', '5'].includes(k));
  if (unsupported.length) console.log(C.r(`  !! array type(s) ${unsupported.join(', ')} are NOT implemented in js/savparse.js`));
}
if (firstProblem) {
  console.log(C.r(`\n  framing broke: ${firstProblem}`));
  console.log(C.d('  that offset is where to start looking — see docs/save-reverse-engineering.md'));
  console.log('');
  process.exit(1);
}
console.log(p === b.length
  ? C.g(`  walk ended at ${num(p)} = the file length — framing is understood ✓`)
  : C.r(`  walk ended at ${num(p)} but the file is ${num(b.length)} — off by ${num(b.length - p)}`));
console.log('');
process.exit(p === b.length ? 0 : 1);
