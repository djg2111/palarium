// Measure encode options for real instead of arguing about them.
// Reports size and, for lossy encodes, how far the pixels actually moved.
const sharp = require('sharp');
const fs = require('fs');

const kb = n => (n / 1024).toFixed(0) + ' KB';
const mb = n => (n / 1024 / 1024).toFixed(2) + ' MB';

// mean abs error + peak error + PSNR against the source pixels
async function diff(srcBuf, outBuf, w, h) {
  const a = await sharp(srcBuf).ensureAlpha().raw().toBuffer();
  const b = await sharp(outBuf).ensureAlpha().raw().toBuffer();
  let sum = 0, peak = 0, sq = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d; sq += d * d; if (d > peak) peak = d;
  }
  const mse = sq / a.length;
  return { mae: sum / a.length, peak, psnr: mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse) };
}

(async () => {
  // ---------- icons (128x128 RGBA, 424 of them) ----------
  const iconDir = 'extract/icons';
  const icons = fs.readdirSync(iconDir).filter(f => f.endsWith('.png'));
  const sample = icons.slice(0, 60);
  const modes = [
    ['PNG (as extracted)', null],
    ['PNG max effort', { png: { compressionLevel: 9, effort: 10 } }],
    ['WebP LOSSLESS', { webp: { lossless: true, effort: 6 } }],
    ['WebP q100', { webp: { quality: 100, effort: 6 } }],
    ['WebP q90', { webp: { quality: 90, effort: 6 } }],
  ];
  console.log(`\n=== ICONS — ${sample.length} of ${icons.length} sampled (128x128 RGBA) ===`);
  console.log('mode                  total      avg/icon   proj. 299   quality');
  for (const [name, opt] of modes) {
    let total = 0, worstPeak = 0, worstMae = 0;
    for (const f of sample) {
      const src = fs.readFileSync(`${iconDir}/${f}`);
      let out = src;
      if (opt) {
        const s = sharp(src);
        out = await (opt.webp ? s.webp(opt.webp) : s.png(opt.png)).toBuffer();
      }
      total += out.length;
      if (opt?.webp && !opt.webp.lossless) {
        const d = await diff(src, out);
        worstPeak = Math.max(worstPeak, d.peak); worstMae = Math.max(worstMae, d.mae);
      }
    }
    const avg = total / sample.length;
    const q = opt?.webp && !opt.webp.lossless ? `max err ${worstPeak}/255, mae ${worstMae.toFixed(2)}`
      : 'identical pixels';
    console.log(`${name.padEnd(21)} ${kb(total).padStart(8)} ${kb(avg).padStart(11)} ${mb(avg * 299).padStart(11)}   ${q}`);
  }

  // ---------- world map (8192x8192) ----------
  console.log('\n=== WORLD MAP — 8192x8192 ===');
  const mapSrc = fs.readFileSync('extract/maps/T_WorldMap.png');
  console.log(`PNG (as extracted)    ${mb(mapSrc.length).padStart(9)}   identical pixels`);
  for (const [name, opt] of [
    ['WebP LOSSLESS', { lossless: true, effort: 5 }],
    ['WebP q100', { quality: 100, effort: 5 }],
    ['WebP q95', { quality: 95, effort: 5 }],
    ['WebP q90', { quality: 90, effort: 5 }],
    ['WebP q85', { quality: 85, effort: 5 }],
  ]) {
    const out = await sharp(mapSrc, { limitInputPixels: false }).webp(opt).toBuffer();
    let q = 'identical pixels';
    if (!opt.lossless) {
      const d = await diff(mapSrc, out);
      q = `PSNR ${d.psnr.toFixed(1)} dB · max err ${d.peak}/255 · mae ${d.mae.toFixed(2)}`;
    }
    fs.writeFileSync(`extract/maps/bench_${name.replace(/\W+/g, '_')}.webp`, out);
    console.log(`${name.padEnd(21)} ${mb(out.length).padStart(9)}   ${q}`);
  }
})();
