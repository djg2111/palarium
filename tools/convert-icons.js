#!/usr/bin/env node
// Convert extracted pal icons to lossless WebP and point data.js at them.
//
// Lossless WebP beats lossless PNG here (~3.1 MB vs ~3.5 MB for 299 icons, and
// 5.8 MB for the PNGs previously shipped) at identical visible pixels. It is
// NOT bit-identical only because WebP normalises the RGB channels underneath
// fully-transparent pixels, which cannot affect rendering.
//
//   node convert-icons.js <extractedIconDir> <outDir> [dataJs]
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || 'extract/icons';
const OUT = process.argv[3] || '../assets/pals';
const DATA = process.argv[4] || '../js/data.js';

const raw = b => sharp(b).ensureAlpha().raw().toBuffer();

(async () => {
  const src = fs.readFileSync(DATA, 'utf8');
  const sb = { window: {} }; new Function('window', src).call(sb, sb.window);
  const D = sb.window.PALDATA;

  fs.mkdirSync(OUT, { recursive: true });
  let converted = 0, missing = [], bytes = 0, worstVisible = 0;

  for (const p of D.pals) {
    const stem = `T_${p.k}_icon_normal`;
    // the game's tables disagree on casing, so match case-insensitively
    const file = fs.readdirSync(SRC).find(f => f.toLowerCase() === `${stem.toLowerCase()}.png`);
    if (!file) { missing.push(p.k); continue; }

    const srcBuf = fs.readFileSync(path.join(SRC, file));
    const out = await sharp(srcBuf).webp({ lossless: true, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `${stem}.webp`), out);
    bytes += out.length; converted++;

    // prove nothing visible moved
    const a = await raw(srcBuf), b = await raw(out);
    let sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] === 0) continue;                 // invisible pixel
      for (let c = 0; c < 4; c++) { sum += Math.abs(a[i + c] - b[i + c]); n++; }
    }
    if (n) worstVisible = Math.max(worstVisible, sum / n);

    p.img = `pals/${stem}.webp`;
  }

  console.log(`converted ${converted} icons -> ${(bytes / 1048576).toFixed(2)} MB`);
  console.log(`worst visible-pixel error across all icons: ${worstVisible.toFixed(4)} (0 = identical)`);
  if (missing.length) console.log(`MISSING (${missing.length}): ${missing.slice(0, 20).join(', ')}`);

  if (!missing.length) {
    fs.writeFileSync(DATA, `window.PALDATA = ${JSON.stringify(D)};\n`);
    console.log(`updated ${DATA} image paths to .webp`);
  } else {
    console.log('data.js NOT updated — resolve missing icons first');
  }
})();
