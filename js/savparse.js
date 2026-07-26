/* Palworld save reader — runs in a Web Worker, and nowhere else.
 *
 * PRIVACY: this file never opens a network connection. It is handed an
 * ArrayBuffer by the page, decompresses it in memory, reads the pals out and
 * posts them back. Nothing is uploaded, cached or reported. The site is static
 * and has no backend to send anything to even if it wanted one.
 *
 * ---------------------------------------------------------------------------
 * The Oodle decoder below is a JavaScript port of the Mermaid/Selkie path of
 * OodleSharp <https://github.com/NotOfficer/OodleSharp> — MIT licence,
 * Copyright (c) 2026 Marlon — which is itself a managed reimplementation of
 * the Oodle format. Only the Mermaid/Selkie decode path is ported, read-only.
 *
 *   MIT License
 *   Permission is hereby granted, free of charge, to any person obtaining a
 *   copy of this software and associated documentation files (the "Software"),
 *   to deal in the Software without restriction ... THE SOFTWARE IS PROVIDED
 *   "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * Why this is here at all: Palworld 1.0 does not use zlib. A 1.0 save carries
 * the magic "PlM1" and an Oodle stream; only pre-0.6 saves are "PlZ1" + zlib.
 * There is no browser-native Oodle, so reading a current save means carrying a
 * decoder. The pre-0.6 zlib path is still handled, natively, below.
 * ---------------------------------------------------------------------------
 */
'use strict';

// ---------- errors the UI is expected to show verbatim ----------
function SaveError(msg, kind) {
  const e = new Error(msg);
  e.kind = kind || 'bad';
  return e;
}

// ---------- Oodle: container ----------
// Layout, established against real 1.0 saves and confirmed byte-exact:
//   per <=256 KB block:  2-byte block header
//     block header b0: (b0 & 0xF) == 0xC, uncompressed = b0>>6 & 1
//                  b1: decoder type = b1 & 0x7F (10 = Mermaid/Selkie),
//                      quantum CRCs = b1 >> 7
//   per quantum: 3-byte big-endian header, compressed length = (v & 0x3FFFF)+1
//                (+3 more bytes when the block says it carries CRCs)
const OODLE_BLOCK = 262144;
const NEWLZF_CHUNK_LEN = 131072;
const NEWLZF_MIN_CHUNK_LEN = 128;
const NEWLZF_LRL_EXCESS = 64;
const NEWLZF_ML_EXCESS = 91;
const NEWLZF_OFF24_MML_DECODE = 8;
const NEWLZF_OFFSET_FOURBYTE_SHIFT = 22;
const NEWLZF_OFFSET_FOURBYTE_THRESHOLD = (1 << 24) - (1 << NEWLZF_OFFSET_FOURBYTE_SHIFT);

const be24 = (b, p) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
const le16 = (b, p) => b[p] | (b[p + 1] << 8);
const le24 = (b, p) => b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);

// Copy a match. Every offset Mermaid emits is >= 8, so a forward byte-wise
// copy and the decoder's 8-byte block copy agree; doing it forward also keeps
// the overlapping case (offset < length) correct, which is the whole point of
// an LZ match and what copyWithin would get wrong on its own.
function copyMatch(dst, to, from, len) {
  const off = to - from;
  if (off >= len) { dst.copyWithin(to, from, from + len); return; }
  for (let i = 0; i < len; i++) dst[to + i] = dst[from + i];
}

// ---------- entropy layer ----------
// Palworld's literal arrays come through uncompressed, but the packet arrays
// are Huffman-coded (type 4, the six-stream variant), so the entropy layer is
// not optional. Types seen across real 1.0 saves: 0 uncompressed, 3 RLE,
// 4 HUFF6. TANS (1) and SPLIT (5) have never turned up and are not ported;
// they raise an honest error rather than decoding to nonsense.
const HUFF_CODELEN_LIMIT = 11;
const HUFF_TABLE_SIZE = 2048;
const MASK64 = (1n << 64n) - 1n;

// MSB-first bit reader over a 64-bit accumulator. Only used for the small
// per-array headers, so BigInt's cost is irrelevant and its exactness isn't.
class VarBits {
  constructor(src, cur, end) { this.s = src; this.cur = cur; this.end = end; this.bits = 0n; this.inv = 63; this.refill(); }
  refill() {
    let bitlen = 63 - this.inv;
    while (bitlen <= 56 && this.cur < this.end) {
      this.bits |= BigInt(this.s[this.cur++]) << BigInt(56 - bitlen);
      bitlen += 8; this.inv -= 8;
    }
  }
  get1() { if (this.inv > 63) this.refill(); const r = Number(this.bits >> 63n); this.bits = (this.bits << 1n) & MASK64; this.inv += 1; return r; }
  get(n) { if (n === 0) return 0; if (this.inv > 63 - n) this.refill(); const r = Number(this.bits >> BigInt(64 - n)); this.bits = (this.bits << BigInt(n)) & MASK64; this.inv += n; return r; }
  use(n) { this.bits = (this.bits << BigInt(n)) & MASK64; this.inv += n; }
  peek(n) { return Number(this.bits >> BigInt(64 - n)); }
  clz() {
    if (this.bits === 0n) return 64;
    const hi = Number(this.bits >> 32n);
    return hi !== 0 ? Math.clz32(hi) : 32 + Math.clz32(Number(this.bits & 0xFFFFFFFFn));
  }
  sizeBytes(start) { return this.cur - start - ((63 - this.inv) >> 3); }
}

const BITREV6 = new Uint8Array(64);
for (let i = 0; i < 64; i++) { let r = 0; for (let b = 0; b < 6; b++) if (i & (1 << b)) r |= 1 << (5 - b); BITREV6[i] = r; }
const huffBitReverse = x => (BITREV6[x & 0x3f] << 5) | BITREV6[x >> 5];

function packhuff8Runlen(vb) {
  if (vb.peek(8) === 0) return 511;
  const clz = vb.clz();
  return vb.get(clz * 2 + 2) - 1;
}

function decodeHufflens(vb, symLists, lastSymOfLen) {
  let gotNumSyms = -1;
  if (vb.get1() !== 0) {
    const riceBits = vb.get(2);
    const maxUnaryPrefixVal = ((HUFF_CODELEN_LIMIT - 1) * 2) >> riceBits;
    const riceLenBias = riceBits + 1;
    let prevCodeLen4 = 32, i = 0;
    vb.refill(); gotNumSyms = 0;
    if (vb.get1() === 0) i = packhuff8Runlen(vb);
    while (i < 256) {
      vb.refill();
      let nzRunLen = packhuff8Runlen(vb);
      if (i + nzRunLen > 256) return -1;
      vb.refill();
      gotNumSyms += nzRunLen;
      do {
        const clz = vb.clz();
        if (clz > maxUnaryPrefixVal) return -1;
        const riceTail = vb.get(clz + riceLenBias);
        const code = ((clz - 1) << riceBits) + riceTail;
        const delta = (code & 1) ? -((code + 1) >> 1) : (code >> 1);
        const curCodeLen = delta + ((prevCodeLen4 + 2) >> 2);
        if (curCodeLen < 1 || curCodeLen > HUFF_CODELEN_LIMIT) return -1;
        prevCodeLen4 = ((prevCodeLen4 * 3 + 2) >> 2) + curCodeLen;
        const count = lastSymOfLen[curCodeLen];
        vb.refill();
        symLists[count] = i; lastSymOfLen[curCodeLen] = count + 1;
        i++;
      } while (--nzRunLen > 0);
      if (i >= 256) break;
      i += packhuff8Runlen(vb);
    }
    if (i !== 256 || gotNumSyms < 2) gotNumSyms = -1;
  } else {
    gotNumSyms = vb.get(8);
    if (gotNumSyms === 0) return -1;
    if (gotNumSyms === 1) { symLists[0] = vb.get(8); }
    else {
      const log2CodeLen = vb.get(3);
      if (log2CodeLen > 4) return -1;
      for (let i = 0; i < gotNumSyms; i++) {
        vb.refill();
        const sym = vb.get(8);
        const curCodeLen = vb.get(log2CodeLen) + 1;
        if (curCodeLen > HUFF_CODELEN_LIMIT) return -1;
        const count = lastSymOfLen[curCodeLen];
        symLists[count] = sym; lastSymOfLen[curCodeLen] = count + 1;
      }
    }
  }
  return gotNumSyms;
}

function decodeUnaryBlock(unary, count, br) {
  if (count <= 0) return count;
  let p = br.ptr, pos = br.pos, i = 0;
  unary[0] = 0;
  while (i < count) {
    if (p >= br.end) return -1;
    const bit = (br.s[p] >> (7 - pos)) & 1;
    if (++pos === 8) { pos = 0; p++; }
    if (bit === 0) unary[i]++;
    else { i++; if (i < count) unary[i] = 0; }
  }
  br.ptr = p; br.pos = pos;
  return count;
}
function decodeRiceBottom(codes, count, riceK, br) {
  if (riceK < 0 || riceK > 3) return -1;
  if (riceK === 0) return count;
  let p = br.ptr, pos = br.pos;
  if (p + (((pos + count * riceK) + 7) >> 3) > br.end) return -1;
  for (let i = 0; i < count; i++) {
    let val = 0;
    for (let k = 0; k < riceK; k++) {
      val = (val << 1) | ((br.s[p] >> (7 - pos)) & 1);
      if (++pos === 8) { pos = 0; p++; }
    }
    codes[i] = ((codes[i] << riceK) | val) & 0xFF;
  }
  br.ptr = p; br.pos = pos;
  return count;
}
function shapeNumEG(numSyms, vb) {
  if (numSyms === 256) return 0;
  const bound = Math.min(numSyms, 257 - numSyms) * 2;
  const nbits = 32 - Math.clz32(bound - 1);
  const largeThresh = (1 << nbits) - bound;
  const peek = vb.peek(nbits);
  if ((peek >> 1) < largeThresh) { const v = peek >> 1; vb.get(nbits - 1); return v; }
  const v = peek - largeThresh; vb.get(nbits); return v;
}
const shapeZeroRun = (prefix, vb) => prefix > 7 ? 511 : ((1 << (prefix + 1)) + vb.get(prefix + 1)) - 1;
const shapeNonzeroRun = (prefix, vb) => prefix > 8 ? 511 : ((1 << prefix) + vb.get(prefix));
function shapeRunlens(runLens, numNonzeroSyms, numEG, runPrefix, rpOff, vb) {
  if (numNonzeroSyms === 0 || numNonzeroSyms > 256 || numEG > 255) return -1;
  const numRunPairs = numEG >> 1;
  let curSymbol = 0;
  if (numEG & 1) { vb.refill(); curSymbol = shapeZeroRun(runPrefix[rpOff++], vb); }
  for (let pair = 0; pair < numRunPairs; pair++) {
    vb.refill();
    runLens[pair * 2 + 1] = shapeNonzeroRun(runPrefix[rpOff], vb);
    runLens[pair * 2 + 2] = shapeZeroRun(runPrefix[rpOff + 1], vb);
    rpOff += 2;
  }
  let totalNonzero = 0;
  for (let pair = 0; pair < numRunPairs; pair++) {
    const nz = runLens[pair * 2 + 1], z = runLens[pair * 2 + 2];
    runLens[pair * 2] = curSymbol;
    curSymbol += nz + z; totalNonzero += nz;
  }
  if (curSymbol >= 256 || totalNonzero >= numNonzeroSyms) return -1;
  const finalRunLen = numNonzeroSyms - totalNonzero;
  if (curSymbol + finalRunLen > 256) return -1;
  runLens[numRunPairs * 2] = curSymbol;
  runLens[numRunPairs * 2 + 1] = finalRunLen;
  return numRunPairs + 1;
}
function decodeHufflens2(vb, symLists, lastSymOfLen) {
  const riceBits = vb.get(2);
  const gotNumSyms = vb.get(8) + 1;
  if (gotNumSyms < 2) return -1;
  const numEG = shapeNumEG(gotNumSyms, vb);
  const lenIn = 63 - vb.inv;
  const br = {s: vb.s, ptr: vb.cur - ((lenIn + 7) >> 3), end: vb.end, pos: (0 - lenIn) & 7};
  const numUnary = gotNumSyms + numEG;
  const unary = new Uint8Array(544);
  if (decodeUnaryBlock(unary, numUnary, br) !== numUnary) return -1;
  if (decodeRiceBottom(unary, gotNumSyms, riceBits, br) !== gotNumSyms) return -1;
  const vb2 = new VarBits(vb.s, br.ptr, br.end);
  if (br.pos > 0) vb2.use(br.pos);
  const codelens = new Uint8Array(256);
  let prevCodeLen4 = 8 * 4 + 2;
  for (let i = 0; i < gotNumSyms; i++) {
    const code = unary[i];
    const delta = (code & 1) ? -((code + 1) >> 1) : (code >> 1);
    const curCodeLen = (prevCodeLen4 >> 2) + delta;
    if (curCodeLen <= 0 || curCodeLen > HUFF_CODELEN_LIMIT) return -1;
    prevCodeLen4 += delta;
    codelens[i] = curCodeLen;
  }
  const runLens = new Uint16Array(128 * 2 + 8 + 1);
  const numRunPairs = shapeRunlens(runLens, gotNumSyms, numEG, unary, gotNumSyms, vb2);
  if (numRunPairs < 0) return -1;
  let lenIdx = 0;
  for (let pair = 0; pair < numRunPairs; pair++) {
    let curSymbol = runLens[pair * 2], runLen = runLens[pair * 2 + 1];
    do {
      if (lenIdx >= gotNumSyms) return -1;
      const cl = codelens[lenIdx++];
      const count = lastSymOfLen[cl];
      symLists[count] = curSymbol & 0xFF;
      lastSymOfLen[cl] = count + 1;
      curSymbol++;
    } while (--runLen > 0);
  }
  vb.cur = vb2.cur; vb.bits = vb2.bits; vb.inv = vb2.inv;
  return gotNumSyms;
}
function buildMsbTable(firstSymOfLen, lastSymOfLen, lens, syms, symLists) {
  let curCode = 0;
  for (let codeLen = 1; codeLen < HUFF_CODELEN_LIMIT; codeLen++) {
    const num = lastSymOfLen[codeLen] - firstSymOfLen[codeLen];
    if (num === 0) continue;
    const perSym = 1 << (HUFF_CODELEN_LIMIT - codeLen);
    const total = num * perSym;
    if (curCode + total > HUFF_TABLE_SIZE) return false;
    lens.fill(codeLen, curCode, curCode + total);
    const base = firstSymOfLen[codeLen];
    for (let i = 0; i < num; i++) { syms.fill(symLists[base + i], curCode, curCode + perSym); curCode += perSym; }
  }
  const numLast = lastSymOfLen[HUFF_CODELEN_LIMIT] - firstSymOfLen[HUFF_CODELEN_LIMIT];
  if (numLast !== 0) {
    if (curCode + numLast > HUFF_TABLE_SIZE) return false;
    lens.fill(HUFF_CODELEN_LIMIT, curCode, curCode + numLast);
    const base = firstSymOfLen[HUFF_CODELEN_LIMIT];
    for (let k = 0; k < numLast; k++) syms[curCode + k] = symLists[base + k];
    curCode += numLast;
  }
  return curCode === HUFF_TABLE_SIZE;
}

// Three interleaved bit streams — two running forward, one backward — with
// symbols emitted strictly stream0, stream1, stream2, round and round.
function huffStreams(src, table, out, outOff, outEnd, in0, in1, in2, strm0End) {
  let cb0 = 0, cc0 = 0, cb1 = 0, cc1 = 0, cb2 = 0, cc2 = 0;
  let dp = outOff;
  if (in0 > in2) return -1;
  while (dp < outEnd) {
    let avail = in2 - in0;
    if (avail > 1) cb0 |= (src[in0] | (src[in0 + 1] << 8)) << cc0;
    else if (avail === 1) cb0 |= src[in0] << cc0;
    let e = table[cb0 & 2047], cl = e & 0xFF;
    if (cc0 + (avail < 2 ? avail : 2) * 8 < cl) return -1;
    cb0 >>>= cl; cc0 -= cl; in0 += (7 - cc0) >> 3; cc0 &= 7;
    out[dp++] = e >> 8;
    if (dp >= outEnd) break;

    avail = in1 - in2;
    if (avail > 1) {
      cb1 |= ((src[in1 - 2] << 8) | src[in1 - 1]) << cc1;
      cb2 |= (src[in2] | (src[in2 + 1] << 8)) << cc2;
    } else if (avail === 1) { cb1 |= src[in2] << cc1; cb2 |= src[in2] << cc2; }
    e = table[cb1 & 2047]; cl = e & 0xFF;
    if (cc1 + (avail < 2 ? avail : 2) * 8 < cl) return -1;
    cb1 >>>= cl; cc1 -= cl; in1 -= (7 - cc1) >> 3; cc1 &= 7;
    out[dp++] = e >> 8;
    if (dp >= outEnd) break;

    e = table[cb2 & 2047]; cl = e & 0xFF;
    if (cc2 + (avail < 2 ? avail : 2) * 8 < cl) return -1;
    cb2 >>>= cl; cc2 -= cl; in2 += (7 - cc2) >> 3; cc2 &= 7;
    out[dp++] = e >> 8;

    if (in0 > in2 || in2 > in1) return -1;
  }
  if (dp !== outEnd) return -1;
  if (in0 !== strm0End || in1 !== in2) return -1;
  return 0;
}

function decodeHuff(src, comp, compLen, out, toLen, isHuff6) {
  const compEnd = comp + compLen;
  const vb = new VarBits(src, comp, compEnd);
  const symLists = new Uint8Array(256 + 256 * (HUFF_CODELEN_LIMIT - 7));
  const firstSymOfLen = new Uint32Array(HUFF_CODELEN_LIMIT + 1);
  const lastSymOfLen = new Uint32Array(HUFF_CODELEN_LIMIT + 1);
  let cur = 0;
  for (let i = 1; i <= 7; i++) { firstSymOfLen[i] = cur; lastSymOfLen[i] = cur; cur += 1 << i; }
  for (let i = 8; i <= HUFF_CODELEN_LIMIT; i++) { firstSymOfLen[i] = cur; lastSymOfLen[i] = cur; cur += 256; }

  let gotNumSymbols;
  if (vb.get1() !== 0) {
    if (vb.get1() !== 0) return -1;
    gotNumSymbols = decodeHufflens2(vb, symLists, lastSymOfLen);
  } else gotNumSymbols = decodeHufflens(vb, symLists, lastSymOfLen);
  if (gotNumSymbols < 1) return -1;
  if (gotNumSymbols === 1) { out.fill(symLists[0], 0, toLen); return vb.sizeBytes(comp); }

  const lens = new Uint8Array(HUFF_TABLE_SIZE), syms = new Uint8Array(HUFF_TABLE_SIZE);
  if (!buildMsbTable(firstSymOfLen, lastSymOfLen, lens, syms, symLists)) return -1;
  const table = new Uint16Array(HUFF_TABLE_SIZE);
  for (let i = 0; i < HUFF_TABLE_SIZE; i++) table[huffBitReverse(i)] = lens[i] | (syms[i] << 8);

  const headerSize = vb.cur - comp - ((63 - vb.inv) >> 3);
  let cs = comp + headerSize;
  if (!isHuff6) {
    if (compEnd - cs < 3) return -1;
    const cl1 = le16(src, cs); cs += 2;
    if (compEnd - cs < cl1 + 2) return -1;
    if (huffStreams(src, table, out, 0, toLen, cs, compEnd, cs + cl1, cs + cl1) < 0) return -1;
  } else {
    if (compEnd - cs < 6) return -1;
    const firstHalfToLen = (toLen + 1) >> 1;
    const firstHalfLen = le24(src, cs); cs += 3;
    if (compEnd - cs < firstHalfLen) return -1;
    const firstHalfEnd = cs + firstHalfLen;
    const str0len = le16(src, cs); cs += 2;
    if (firstHalfEnd - cs < str0len + 2) return -1;
    let mid = firstHalfEnd;
    if (compEnd - mid < 3) return -1;
    const str3len = le16(src, mid); mid += 2;
    if (compEnd - mid < str3len + 2) return -1;
    if (huffStreams(src, table, out, 0, firstHalfToLen, cs, firstHalfEnd, cs + str0len, cs + str0len) < 0) return -1;
    if (huffStreams(src, table, out, firstHalfToLen, toLen, mid, compEnd, mid + str3len, mid + str3len) < 0) return -1;
  }
  return compLen;
}

function decodeRle(src, comp, compLen, out, toLen) {
  if (compLen <= 1 || toLen <= 0) {
    if (compLen === 1) { out.fill(src[comp], 0, toLen); return compLen; }
    return -1;
  }
  let litsBuf = src, lits = comp + 1, pkts = comp + compLen, pktBuf = src;
  if (src[comp] !== 0) {
    const inner = getArray(src, comp, comp + compLen, 1 << 20);
    if (!inner) return -1;
    const rest = compLen - inner.used;
    const tmp = new Uint8Array(inner.len + rest);
    tmp.set(inner.buf.subarray(inner.off, inner.off + inner.len), 0);
    tmp.set(src.subarray(comp + inner.used, comp + compLen), inner.len);
    litsBuf = tmp; lits = 0; pktBuf = tmp; pkts = inner.len + rest;
  }
  let op = 0, runVal = 0;
  const litEnd = lits;
  while (pkts > litEnd && op < toLen) {
    const packet = pktBuf[--pkts];
    if (((packet - 1) & 0xFF) >= 0x2F) {
      const lrl = (15 - packet) & 0xF, rl = packet >> 4;
      for (let i = 0; i < lrl; i++) out[op + i] = litsBuf[lits + i];
      lits += lrl; op += lrl;
      if (rl > 0) { out.fill(runVal, op, op + rl); op += rl; }
    } else if (packet >= 0x10) {
      pkts--; const v = le16(pktBuf, pkts) - 0x1000;
      const lrl = v & 0x3f, rl = v >> 6;
      for (let i = 0; i < lrl; i++) out[op + i] = litsBuf[lits + i];
      lits += lrl; op += lrl;
      if (rl > 0) { out.fill(runVal, op, op + rl); op += rl; }
    } else if (packet === 1) { runVal = litsBuf[lits++]; }
    else if (packet >= 0x09) {
      pkts--; const rl = (le16(pktBuf, pkts) - 0x900 + 1) << 7;
      out.fill(runVal, op, op + rl); op += rl;
    } else {
      pkts--; const lrl = (le16(pktBuf, pkts) - 0x200 + 1) << 6;
      for (let i = 0; i < lrl; i++) out[op + i] = litsBuf[lits + i];
      lits += lrl; op += lrl;
    }
  }
  return compLen;
}

// newLZ_get_array. Returns {buf, off, len, used} — buf is `src` itself for the
// uncompressed forms (no copy) and a fresh array otherwise.
function getArray(src, from, fromEnd, toLenMax) {
  if (fromEnd - from < 2) return null;
  const first = src[from];
  let arrayType = first >> 4;
  if (first >= 0x80) {
    arrayType &= 7;
    if (arrayType === 0) {
      const toLen = ((src[from] << 8) | src[from + 1]) & 0xFFF;
      if (toLen > toLenMax || from + 2 + toLen > fromEnd) return null;
      return {buf: src, off: from + 2, len: toLen, used: 2 + toLen};
    }
  } else {
    if (fromEnd - from < 4) {
      if (fromEnd - from === 3 && be24(src, from) === 0) return {buf: src, off: from, len: 0, used: 3};
      return null;
    }
    if (arrayType === 0) {
      const header = be24(src, from);
      if ((header >>> 18) !== 0) return null;
      const toLen = header & 0x3FFFF;
      if (toLen > toLenMax || from + 3 + toLen > fromEnd) return null;
      return {buf: src, off: from + 3, len: toLen, used: 3 + toLen};
    }
  }
  // compressed
  let p = from, compLen, toLen;
  if (src[p] >= 0x80) {
    if (fromEnd - p < 4) return null;
    const header = be24(src, p); p += 3;
    compLen = header & 1023;
    if (compLen > fromEnd - p) return null;
    toLen = ((header >> 10) & 1023) + compLen + 1;
    if (toLen > toLenMax) return null;
  } else {
    if (fromEnd - p < 5) return null;
    const h1 = BigInt(src[p]);
    const h2 = BigInt(((src[p + 1] << 24) >>> 0) + (src[p + 2] << 16) + (src[p + 3] << 8) + src[p + 4]);
    const hv = (h1 << 32n) | h2;
    p += 5;
    if (Number(hv >> 36n) !== arrayType) return null;
    compLen = Number(hv & 0x3FFFFn);
    if (compLen > fromEnd - p) return null;
    toLen = Number((hv >> 18n) & 0x3FFFFn) + 1;
    if (toLen > toLenMax || compLen >= toLen) return null;
  }
  const out = new Uint8Array(toLen);
  let used;
  if (arrayType === 3) used = decodeRle(src, p, compLen, out, toLen);
  else if (arrayType === 2 || arrayType === 4) used = decodeHuff(src, p, compLen, out, toLen, arrayType === 4);
  else throw SaveError(
    'This save uses an Oodle array type Palarium can’t read yet (type ' + arrayType + '). ' +
    'Nothing was changed. Please report the Palworld version you saved on.', 'unsupported');
  if (used !== compLen) return null;
  return {buf: out, off: 0, len: toLen, used: (p - from) + compLen};
}

// Mermaid excess value: one byte, or one byte plus a 16-bit extension.
function getv(st) {
  if (st.p >= st.end) return 0;
  let b = st.src[st.p++];
  if (b > 251) {
    if (st.p + 2 > st.end) return 0;
    b += le16(st.src, st.p) << 2;
    st.p += 2;
  }
  return b;
}

// One 128 KB Mermaid chunk. dst is the whole output; chunkPos is its absolute
// start, which is also how far back a match may reach.
function mermaidChunk(src, comp, compEnd, dst, chunkPos, chunkLen, chunkType) {
  if (chunkType > 1) return -1;
  let cp = comp;
  if (compEnd - cp < 10) return -1;

  let to = chunkPos;
  // The first eight bytes of the stream have no history to match against, so
  // they are always stored raw.
  if (chunkPos === 0) {
    for (let i = 0; i < 8; i++) dst[to + i] = src[cp + i];
    to += 8; cp += 8;
  }

  let a = getArray(src, cp, compEnd, chunkLen);
  if (!a) return -1;
  const litBuf = a.buf; let litPtr = a.off; cp += a.used;

  a = getArray(src, cp, compEnd, chunkLen);
  if (!a) return -1;
  const pkBuf = a.buf, packets = a.off, packetsCount = a.len; cp += a.used;

  let packetsCount1;
  if (chunkLen > 65536) {
    if (cp + 2 > compEnd) return -1;
    packetsCount1 = le16(src, cp); cp += 2;
  } else packetsCount1 = packetsCount;
  if (packetsCount1 > packetsCount) return -1;

  if (compEnd - cp < 2) return -1;
  let numOff16 = le16(src, cp); cp += 2;
  let off16Ptr;
  let off16Split = null;
  if (numOff16 === 0xFFFF) {
    // Offsets split into high and low byte arrays.
    a = getArray(src, cp, compEnd, chunkLen >> 1); if (!a) return -1;
    const hiBuf = a.buf, hi = a.off, hiN = a.len; cp += a.used;
    a = getArray(src, cp, compEnd, chunkLen >> 1); if (!a) return -1;
    const loBuf = a.buf, lo = a.off, loN = a.len; cp += a.used;
    if (hiN !== loN) return -1;
    numOff16 = hiN;
    off16Split = new Uint16Array(numOff16);
    for (let i = 0; i < numOff16; i++) off16Split[i] = loBuf[lo + i] | (hiBuf[hi + i] << 8);
    off16Ptr = 0;
  } else {
    if (2 * numOff16 > compEnd - cp) return -1;
    off16Ptr = cp; cp += 2 * numOff16;
  }
  let off16i = 0;
  const nextOff16 = () => {
    const v = off16Split ? off16Split[off16i] : le16(src, off16Ptr + off16i * 2);
    off16i++; return v;
  };

  if (compEnd - cp < 3) return -1;
  const off24Header = le24(src, cp); cp += 3;
  let esc1 = null, esc2 = null;
  if (off24Header === 0) { esc1 = new Uint32Array(0); esc2 = esc1; }
  else {
    let n1 = off24Header >>> 12, n2 = off24Header & 0xFFF;
    if (n1 === 0xFFF) { if (compEnd - cp < 2) return -1; n1 = le16(src, cp); cp += 2; }
    if (n2 === 0xFFF) { if (compEnd - cp < 2) return -1; n2 = le16(src, cp); cp += 2; }
    esc1 = new Uint32Array(n1); esc2 = new Uint32Array(n2);
    let used = unpackEscapes(src, cp, compEnd, esc1, chunkPos); if (used < 0) return -1; cp += used;
    used = unpackEscapes(src, cp, compEnd, esc2, chunkPos + 65536); if (used < 0) return -1; cp += used;
  }

  const ex = {src, p: cp, end: compEnd};
  const isSub = chunkType === 0;
  let negOffset = -8;

  const chunkLen1 = Math.min(65536, chunkLen);
  const chunkLen2 = chunkLen - chunkLen1;

  for (let twice = 0; twice < 2; twice++) {
    let base, len, pk, pkEnd, esc, escI = 0;
    if (twice === 0) {
      base = chunkPos; len = chunkLen1; esc = esc1;
      pk = packets; pkEnd = packets + packetsCount1;
    } else {
      if (chunkLen2 === 0) break;
      base = chunkPos + chunkLen1; len = chunkLen2; esc = esc2;
      pk = packets + packetsCount1; pkEnd = packets + packetsCount;
    }
    const parseEnd = base + len;
    if (twice === 0 && chunkPos === 0) { /* to already advanced past the 8 raw bytes */ }
    else to = base;

    while (pk < pkEnd) {
      const packet = pkBuf[pk++];
      if (packet >= 24) {
        const lrl = packet & 7;
        const ml = (packet >> 3) & 0xF;
        // packet >= 128 repeats the previous offset; below that a new one is
        // pulled from the off16 stream.
        if (isSub) for (let i = 0; i < lrl; i++) dst[to + i] = (litBuf[litPtr + i] + dst[to + i + negOffset]) & 0xFF;
        else for (let i = 0; i < lrl; i++) dst[to + i] = litBuf[litPtr + i];
        to += lrl; litPtr += lrl;
        if (packet < 128) negOffset = -nextOff16();
        const from = to + negOffset;
        if (from < 0) return -1;
        copyMatch(dst, to, from, ml);
        to += ml;
      } else if (packet === 0) {
        const lrl = getv(ex) + NEWLZF_LRL_EXCESS;
        if (to + lrl > parseEnd) return -1;
        if (isSub) for (let i = 0; i < lrl; i++) dst[to + i] = (litBuf[litPtr + i] + dst[to + i + negOffset]) & 0xFF;
        else for (let i = 0; i < lrl; i++) dst[to + i] = litBuf[litPtr + i];
        to += lrl; litPtr += lrl;
      } else if (packet === 1) {
        const ml = NEWLZF_ML_EXCESS + getv(ex);
        negOffset = -nextOff16();
        const from = to + negOffset;
        if (from < 0) return -1;
        copyMatch(dst, to, from, ml);
        to += ml;
      } else if (packet === 2) {
        const ml = 21 + NEWLZF_OFF24_MML_DECODE + getv(ex);
        if (escI >= esc.length) return -1;
        const from = base - esc[escI++];
        if (from < 0) return -1;
        negOffset = from - to;
        copyMatch(dst, to, from, ml);
        to += ml;
      } else {
        // packets 3..23 — short match on a fresh 24-bit offset
        const ml = packet - 3 + NEWLZF_OFF24_MML_DECODE;
        if (escI >= esc.length) return -1;
        const from = base - esc[escI++];
        if (from < 0) return -1;
        negOffset = from - to;
        copyMatch(dst, to, from, ml);
        to += ml;
      }
    }
    // whatever is left of this parse chunk is literals
    if (to < parseEnd) {
      const lrl = parseEnd - to;
      if (isSub) for (let i = 0; i < lrl; i++) dst[to + i] = (litBuf[litPtr + i] + dst[to + i + negOffset]) & 0xFF;
      else for (let i = 0; i < lrl; i++) dst[to + i] = litBuf[litPtr + i];
      to += lrl; litPtr += lrl;
    }
  }
  return 0;
}

function unpackEscapes(src, from, fromEnd, out, maxOffset) {
  if (out.length === 0) return 0;
  let p = from;
  for (let i = 0; i < out.length; i++) {
    if (p + 3 > fromEnd) return -1;
    let off = le24(src, p); p += 3;
    if (off >= NEWLZF_OFFSET_FOURBYTE_THRESHOLD) {
      if (p >= fromEnd) return -1;
      off += src[p++] << NEWLZF_OFFSET_FOURBYTE_SHIFT;
    }
    if (off > maxOffset) return -1;
    out[i] = off;
  }
  return p - from;
}

function mermaidQuantum(src, comp, compLen, dst, dstPos, dstLen) {
  const compEnd = comp + compLen;
  let cp = comp, to = dstPos;
  const end = dstPos + dstLen;
  while (to < end) {
    const chunkLen = Math.min(NEWLZF_CHUNK_LEN, end - to);
    if (compEnd - cp < 4) return -1;
    let h = be24(src, cp);
    if (h >= (1 << 23)) {
      const chunkType = (h >> 19) & 0xF;
      const chunkCompLen = h & ((1 << 19) - 1);
      cp += 3;
      if (chunkCompLen > compEnd - cp) return -1;
      if (chunkCompLen >= chunkLen) {
        if (chunkCompLen > chunkLen || chunkType !== 0) return -1;
        dst.set(src.subarray(cp, cp + chunkLen), to);
      } else {
        if (chunkLen < NEWLZF_MIN_CHUNK_LEN) return -1;
        if (mermaidChunk(src, cp, cp + chunkCompLen, dst, to, chunkLen, chunkType) < 0) return -1;
      }
      cp += chunkCompLen;
      to += chunkLen;
    } else {
      // whole chunk is one entropy-coded literal array — needs the Huffman
      // layer, which is not ported. getArray raises the honest message.
      const a = getArray(src, cp, compEnd, chunkLen);
      if (!a || a.len !== chunkLen) return -1;
      dst.set(a.buf.subarray(a.off, a.off + a.len), to);
      cp += a.used; to += chunkLen;
    }
  }
  return 0;
}

/* Decode an Oodle stream into dst, stopping once `wantAtLeast()` bytes exist.
 * Decoding a prefix is safe: matches only ever reach backwards, so the bytes
 * already produced are final. This is what keeps a 400 MB save affordable —
 * the pal map is the first thing in worldSaveData, so a few MB is usually
 * enough and the other 4 GB is never materialised. */
function oodleDecode(src, off, dst, dstLen, onProgress) {
  let sp = off, dp = 0;
  while (dp < dstLen) {
    if (sp + 2 > src.length) throw SaveError('The save file ends in the middle of a compressed block — it looks truncated or still being written. Nothing was changed.', 'truncated');
    const b0 = src[sp], b1 = src[sp + 1];
    if ((b0 & 0xF) !== 0xC) throw SaveError('This doesn’t look like a Palworld save Palarium can read — the compressed data isn’t in a format it recognises. Nothing was changed.', 'bad');
    const decoderType = b1 & 0x7F;
    const hasCrc = b1 >> 7;
    sp += 2;
    const blockLen = Math.min(OODLE_BLOCK, dstLen - dp);
    if (decoderType !== 10) {
      throw SaveError('This save was compressed with an Oodle codec Palarium can’t read (type ' + decoderType +
        '). Only Mermaid/Selkie, which is what Palworld writes, is supported. Nothing was changed.', 'unsupported');
    }
    if (sp + 3 > src.length) throw SaveError('The save file ends in the middle of a compressed block — it looks truncated or still being written. Nothing was changed.', 'truncated');
    const v = be24(src, sp); sp += 3;
    if (hasCrc) sp += 3;
    const size = v & 0x3FFFF;
    let compLen;
    if (size === 0x3FFFF) compLen = blockLen; else compLen = size + 1;
    if (sp + compLen > src.length) throw SaveError('The save file ends in the middle of a compressed block — it looks truncated or still being written. Nothing was changed.', 'truncated');
    if (compLen === blockLen) {
      dst.set(src.subarray(sp, sp + blockLen), dp);
    } else if (compLen === 0) {
      dst.fill(0, dp, dp + blockLen);
    } else {
      if (mermaidQuantum(src, sp, compLen, dst, dp, blockLen) < 0)
        throw SaveError('The compressed data in this save didn’t decode — the file may be damaged. Nothing was changed.', 'bad');
    }
    sp += compLen === blockLen ? blockLen : compLen;
    dp += blockLen;
    if (onProgress && onProgress(dp)) return dp; // caller has enough
  }
  return dp;
}

// ---------- GVAS property tree ----------
const ASCII = new TextDecoder('windows-1252');
const UTF16 = new TextDecoder('utf-16le');

class Reader {
  constructor(buf, p) { this.b = buf; this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); this.p = p || 0; }
  u8() { return this.b[this.p++]; }
  i32() { const x = this.v.getInt32(this.p, true); this.p += 4; return x; }
  u32() { const x = this.v.getUint32(this.p, true); this.p += 4; return x; }
  u64() { const x = this.v.getBigUint64(this.p, true); this.p += 8; return Number(x); }
  i64() { const x = this.v.getBigInt64(this.p, true); this.p += 8; return Number(x); }
  f32() { const x = this.v.getFloat32(this.p, true); this.p += 4; return x; }
  f64() { const x = this.v.getFloat64(this.p, true); this.p += 8; return x; }
  // UE strings are length-prefixed, and a NEGATIVE length means UTF-16LE. Get
  // that wrong and every save with a non-ASCII nickname reads as garbage.
  str() {
    const n = this.i32();
    if (n === 0) return '';
    if (n < 0) { const s = UTF16.decode(this.b.subarray(this.p, this.p - 2 - n * 2)); this.p += -n * 2; return s.replace(/\0+$/, ''); }
    const s = ASCII.decode(this.b.subarray(this.p, this.p + n - 1)); this.p += n; return s;
  }
  guid() {
    let s = '';
    for (let i = 0; i < 16; i++) s += this.b[this.p + i].toString(16).padStart(2, '0');
    this.p += 16; return s;
  }
  bytes(n) { const s = this.b.subarray(this.p, this.p + n); this.p += n; return s; }
}

function readProps(r, stopAt) {
  const o = {};
  for (;;) {
    if (stopAt != null && r.p >= stopAt) break;
    const name = r.str();
    if (name === 'None' || name === '') break;
    const type = r.str();
    const size = r.u64();
    o[name] = readValue(r, type, size);
  }
  return o;
}
function readValue(r, type, size) {
  switch (type) {
    case 'IntProperty': r.u8(); return r.i32();
    case 'Int64Property': r.u8(); return r.i64();
    case 'FloatProperty': r.u8(); return r.f32();
    case 'DoubleProperty': r.u8(); return r.f64();
    case 'BoolProperty': { const v = r.u8(); r.u8(); return !!v; }
    case 'StrProperty': case 'NameProperty': r.u8(); return r.str();
    case 'EnumProperty': { r.str(); r.u8(); return r.str(); }
    case 'ByteProperty': { const en = r.str(); r.u8(); return en === 'None' ? r.u8() : r.str(); }
    case 'StructProperty': { const st = r.str(); r.guid(); r.u8(); return readStruct(r, st); }
    case 'ArrayProperty': {
      const inner = r.str(); r.u8(); const at = r.p;
      if (inner === 'ByteProperty') { const n = r.u32(); const by = r.bytes(n); r.p = at + size; return by; }
      if (inner === 'StructProperty') {
        const cnt = r.u32(); r.str(); r.str(); r.u64(); const st = r.str(); r.guid(); r.u8();
        const a = []; for (let i = 0; i < cnt; i++) a.push(readStruct(r, st));
        r.p = at + size; return a;
      }
      const cnt = r.u32(); const a = [];
      for (let i = 0; i < cnt; i++) a.push(readSimple(r, inner));
      r.p = at + size; return a;
    }
    case 'MapProperty': {
      const kt = r.str(), vt = r.str(); r.u8(); const at = r.p;
      r.u32(); const cnt = r.u32(); const m = [];
      for (let i = 0; i < cnt; i++) {
        const k = kt === 'StructProperty' ? readProps(r) : readSimple(r, kt);
        const v = vt === 'StructProperty' ? readProps(r) : readSimple(r, vt);
        m.push([k, v]);
      }
      r.p = at + size; return m;
    }
    default: throw SaveError('This save contains a property type Palarium doesn’t know (' + type + '). Nothing was changed.', 'bad');
  }
}
function readSimple(r, t) {
  switch (t) {
    case 'IntProperty': return r.i32();
    case 'Int64Property': return r.i64();
    case 'FloatProperty': return r.f32();
    case 'StrProperty': case 'NameProperty': case 'EnumProperty': return r.str();
    case 'ByteProperty': return r.u8();
    case 'BoolProperty': return !!r.u8();
    case 'StructProperty': return readProps(r);
    default: throw SaveError('This save contains a property type Palarium doesn’t know (' + t + '). Nothing was changed.', 'bad');
  }
}
function readStruct(r, st) {
  switch (st) {
    case 'Guid': return r.guid();
    case 'Vector': return [r.f64(), r.f64(), r.f64()];
    case 'Quat': return [r.f64(), r.f64(), r.f64(), r.f64()];
    case 'LinearColor': return [r.f32(), r.f32(), r.f32(), r.f32()];
    case 'DateTime': return r.u64();
    default: return readProps(r);
  }
}

// ---------- save container ----------
const MAGIC_OODLE = 'PlM', MAGIC_ZLIB = 'PlZ';

function readHeader(bytes) {
  if (bytes.length < 24) throw SaveError('That file is too small to be a Palworld save. Nothing was changed.', 'bad');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uncompressed = v.getUint32(0, true);
  const compressed = v.getUint32(4, true);
  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10]);
  const type = bytes[11];
  if (magic !== MAGIC_OODLE && magic !== MAGIC_ZLIB)
    throw SaveError('That isn’t a Palworld save file — Palarium expects Level.sav from your save folder. Nothing was changed.', 'bad');
  if (compressed > bytes.length - 12)
    throw SaveError('This save file is incomplete — it claims more data than the file holds, so it was probably truncated or copied while the game was writing. Nothing was changed.', 'truncated');
  return {uncompressed, compressed, magic, type};
}

// ---------- pals ----------
const GENDER = {'EPalGenderType::Male': 'M', 'EPalGenderType::Female': 'F'};

function extractPals(gvas, limit) {
  const r = new Reader(gvas, 0);
  const magic = ASCII.decode(gvas.subarray(0, 4));
  if (magic !== 'GVAS') throw SaveError('The decompressed save doesn’t start with a GVAS header — Palarium can’t read it. Nothing was changed.', 'bad');
  r.p = 4;
  r.u32(); r.u32(); r.u32();      // save version, UE4 + UE5 package versions
  r.p += 6;                        // engine major/minor/patch
  r.u32();                         // changelist
  r.str();                         // branch
  r.u32();                         // custom format version
  const nc = r.u32(); r.p += nc * 20;
  r.str();                         // save game class

  // top-level properties, skipping by size until worldSaveData
  let mapAt = -1, mapSize = 0;
  for (let guard = 0; guard < 64; guard++) {
    const name = r.str();
    if (name === 'None' || name === '') break;
    const type = r.str(); const size = r.u64();
    let dataAt;
    if (type === 'StructProperty') { r.str(); r.p += 17; dataAt = r.p; }
    else { r.p += 1; dataAt = r.p; }
    if (name === 'worldSaveData') {
      const end = dataAt + size;
      while (r.p < end) {
        const cn = r.str(); if (cn === 'None' || cn === '') break;
        const ct = r.str(); const cs = r.u64(); let cd;
        if (ct === 'StructProperty') { r.str(); r.p += 17; cd = r.p; }
        else if (ct === 'ArrayProperty') { r.str(); r.p += 1; cd = r.p; }
        else if (ct === 'MapProperty') { r.str(); r.str(); r.p += 1; cd = r.p; }
        else { r.p += 1; cd = r.p; }
        if (cn === 'CharacterSaveParameterMap') { mapAt = cd; mapSize = cs; break; }
        r.p = cd + cs;
      }
      break;
    }
    r.p = dataAt + size;
  }
  if (mapAt < 0) throw SaveError('This save has no pal list in it. If you picked LevelMeta.sav or a player file by mistake, pick Level.sav instead. Nothing was changed.', 'bad');
  if (limit && mapAt + mapSize > limit) return {need: mapAt + mapSize};

  const rr = new Reader(gvas, mapAt);
  rr.u32();
  const cnt = rr.u32();
  const pals = [];
  let players = 0, skipped = 0;
  for (let i = 0; i < cnt; i++) {
    const key = readProps(rr);
    const val = readProps(rr);
    const raw = val.RawData;
    if (!raw || !raw.length) { skipped++; continue; }
    let sp;
    try { sp = readProps(new Reader(raw, 0)).SaveParameter; } catch (e) { skipped++; continue; }
    if (!sp) { skipped++; continue; }
    if (sp.IsPlayer) { players++; continue; }
    if (!sp.CharacterID) { skipped++; continue; }
    // UE only writes non-default values, so an absent field is the default:
    // no Level property means level 1, no Talent means 0, no PassiveSkillList
    // means the pal has no passives at all.
    const cid = String(sp.CharacterID);
    const boss = /^BOSS_/i.test(cid);
    pals.push({
      guid: key.InstanceId || '',
      owner: key.PlayerUId || '',
      cid, boss,
      species: boss ? cid.slice(5) : cid,
      gender: GENDER[sp.Gender] || null,
      level: sp.Level || 1,
      iv: [sp.Talent_HP || 0, sp.Talent_Shot || 0, sp.Talent_Defense || 0],
      passives: Array.isArray(sp.PassiveSkillList) ? sp.PassiveSkillList.map(String) : [],
      nickname: sp.NickName || '',
      rare: !!sp.IsRarePal,
      container: sp.SlotId && sp.SlotId.ContainerId ? String(sp.SlotId.ContainerId.ID || '') : '',
      slot: sp.SlotId ? (sp.SlotId.SlotIndex || 0) : 0,
    });
  }
  return {pals, players, skipped, count: cnt};
}

// ---------- top level ----------
async function inflate(bytes, off) {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  w.write(bytes.subarray(off)); w.close();
  const parts = []; let total = 0;
  const rd = ds.readable.getReader();
  for (;;) { const {done, value} = await rd.read(); if (done) break; parts.push(value); total += value.length; }
  const out = new Uint8Array(total); let p = 0;
  for (const q of parts) { out.set(q, p); p += q.length; }
  return out;
}

// Hard ceiling on what we will materialise. A save whose pal map genuinely
// sits past this is beyond what a browser tab can hold, and saying so beats a
// dead tab.
const PREFIX_CAP = 192 * 1024 * 1024;

async function parseSave(buf, onProgress) {
  const bytes = new Uint8Array(buf);
  const h = readHeader(bytes);
  let gvas;
  if (h.magic === MAGIC_ZLIB) {
    // pre-0.6 saves: plain zlib, and the browser has that natively
    gvas = await inflate(bytes, 12);
    if (h.type === 0x32) gvas = await inflate(gvas, 12);
    onProgress && onProgress('read', 1);
  } else {
    // Decode only as far as the pal list, and only allocate that much. The
    // buffer starts at a megabyte and grows to what the file actually asks
    // for, so a save that decompresses to gigabytes still costs a few MB —
    // the pal map is the first thing in worldSaveData, and everything after
    // it is bases, foliage and dungeons that no roster needs.
    let cap = Math.min(h.uncompressed, 1 << 20);
    let need = Math.min(cap, 1 << 18);
    for (let round = 0; round < 24; round++) {
      const dst = new Uint8Array(cap);
      const have = oodleDecode(bytes, 12, dst, cap, done => {
        onProgress && onProgress('read', Math.min(0.99, done / Math.max(need, 1)));
        return done >= need;
      });
      let probe = null, err = null;
      try { probe = extractPals(dst.subarray(0, have), have); } catch (e) { err = e; }
      if (probe && probe.need == null) return finish(probe, h);
      const want = probe ? probe.need : have * 4;
      if (have >= h.uncompressed || cap >= h.uncompressed) { if (err) throw err; }
      if (want > PREFIX_CAP)
        throw SaveError('This save’s pal list starts ' + Math.round(want / 1048576) +
          ' MB into the file, which is more than Palarium can hold in a browser tab. Nothing was changed.', 'toobig');
      if (cap >= h.uncompressed && err) throw err;
      need = Math.min(want, h.uncompressed);
      cap = Math.min(h.uncompressed, Math.max(need, cap * 4));
    }
    throw SaveError('Palarium couldn’t locate the pal list in this save. Nothing was changed.', 'bad');
  }
  return finish(extractPals(gvas, 0), h);
}
function finish(res, h) {
  return {pals: res.pals, players: res.players, skipped: res.skipped, entries: res.count,
    uncompressed: h.uncompressed, magic: h.magic};
}

// ---------- worker plumbing ----------
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.onmessage = async ev => {
    const {buf} = ev.data || {};
    try {
      const t0 = Date.now();
      const res = await parseSave(buf, (phase, pct) => self.postMessage({type: 'progress', phase, pct}));
      res.ms = Date.now() - t0;
      self.postMessage({type: 'done', res});
    } catch (e) {
      self.postMessage({type: 'error', message: e && e.message || String(e), kind: (e && e.kind) || 'bad'});
    }
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {parseSave, oodleDecode, readHeader, extractPals, Reader, readProps};
}
