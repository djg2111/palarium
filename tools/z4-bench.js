#!/usr/bin/env node
// What does a native z4 level cost, and does lossy WebP hurt at 1:1?
//
// z3 is 4096px across an 8192px source, so the viewer upscales 2x at maximum
// zoom — that's the residual softness sharpening can only partly hide. z4 is
// native pixels and removes the upscale entirely, but it's also 4x the tiles.
// This encodes a representative strip at several settings and measures both
// size and error against the source, so the size/quality call is made on
// numbers rather than vibes.
const sharp = require('sharp');
const fs = require('fs');

const SRC = process.argv[2] || 'extract/maps/T_WorldMap.png';
const TILE = 512;
// four tiles spanning ocean, coast, forest and rock — the cheap-to-encode and
// expensive-to-encode extremes both need to be in the sample
const SAMPLES = [
  {left: 3584, top: 3584}, {left: 4096, top: 3584},
  {left: 3584, top: 4096}, {left: 5120, top: 2560},
];
const MODES = [
  {name: 'lossless', opts: {lossless: true, effort: 4}},
  {name: 'lossless e6', opts: {lossless: true, effort: 6}},
  {name: 'q95', opts: {quality: 95, effort: 5}},
  {name: 'q90', opts: {quality: 90, effort: 5}},
  {name: 'q85', opts: {quality: 85, effort: 5}},
];

async function mae(a, b) {
  const [x, y] = await Promise.all([
    sharp(a).raw().toBuffer(), sharp(b).ensureAlpha().raw().toBuffer(),
  ]);
  let s = 0;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) s += Math.abs(x[i] - y[i]);
  return s / n;
}

(async () => {
  const src = sharp(SRC, {limitInputPixels: false});
  const meta = await src.metadata();
  const perSide = meta.width / TILE;
  console.log(`source ${meta.width}px -> z4 is ${perSide}x${perSide} = ${perSide * perSide} tiles\n`);

  const patches = [];
  for (const s of SAMPLES) {
    patches.push(await sharp(SRC, {limitInputPixels: false})
      .extract({left: s.left, top: s.top, width: TILE, height: TILE})
      .png().toBuffer());
  }

  console.log('mode          avg tile      est. z4 (main)   est. both layers   MAE vs source');
  for (const m of MODES) {
    let bytes = 0, err = 0;
    for (const p of patches) {
      const enc = await sharp(p).webp(m.opts).toBuffer();
      bytes += enc.length;
      err += await mae(p, enc);
    }
    const avg = bytes / patches.length;
    const one = avg * perSide * perSide;
    console.log(`${m.name.padEnd(13)} ${(avg / 1024).toFixed(0).padStart(6)} KB   ` +
      `${(one / 1048576).toFixed(1).padStart(11)} MB   ` +
      `${(one * 2 / 1048576).toFixed(1).padStart(14)} MB   ` +
      `${(err / patches.length).toFixed(3).padStart(12)}`);
  }
  console.log('\nMAE is mean absolute error per channel byte; under ~0.5 is invisible.');
})();
