#!/usr/bin/env node
// Re-encode an existing lossless z4 level to high-quality lossy, and show what
// it costs and what it changes.
//
// z4 is the level you only ever see at 1:1, and it is 2/3 of the whole pyramid's
// bytes. Re-encoding from the lossless tiles is a single lossy pass on exact
// pixels, so there is no generation loss to worry about. Run with --apply to
// replace the tiles in place; without it, this only reports.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '../assets/map';
const Q = Number(process.argv[3] || 95);
const APPLY = process.argv.includes('--apply');
const LAYERS = ['main', 'tree'];

async function mae(a, b) {
  const [x, y] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer(), sharp(b).ensureAlpha().raw().toBuffer(),
  ]);
  let s = 0, worst = 0;
  for (let i = 0; i < x.length; i++) {
    const d = Math.abs(x[i] - y[i]);
    s += d; if (d > worst) worst = d;
  }
  return {mae: s / x.length, worst};
}

(async () => {
  let before = 0, after = 0, errSum = 0, errN = 0, worstAll = 0;
  const samples = [];
  for (const layer of LAYERS) {
    const dir = path.join(ROOT, layer, '4');
    if (!fs.existsSync(dir)) { console.log(`skip ${layer}: no z4`); continue; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.webp'));
    for (const f of files) {
      const src = path.join(dir, f);
      const buf = fs.readFileSync(src);
      const enc = await sharp(buf).webp({quality: Q, effort: 5}).toBuffer();
      before += buf.length; after += enc.length;
      // measure on a sample; decoding all 512 twice is slow and adds nothing
      if (samples.length < 24 && buf.length > 120000) {
        const m = await mae(buf, enc);
        errSum += m.mae; errN++; worstAll = Math.max(worstAll, m.worst);
        samples.push({f: `${layer}/${f}`, ...m});
      }
      if (APPLY) fs.writeFileSync(src, enc);
    }
    console.log(`${layer} z4: ${files.length} tiles`);
  }
  console.log(`\nq${Q}: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB ` +
    `(${(100 - after / before * 100).toFixed(0)}% smaller)`);
  console.log(`mean absolute error over ${errN} detailed tiles: ${(errSum / errN).toFixed(3)} ` +
    `per channel byte, worst single pixel delta ${worstAll}`);
  console.log(APPLY ? 'tiles replaced in place.' : 'dry run — pass --apply to replace.');
})();
