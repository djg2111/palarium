#!/usr/bin/env node
// Is it worth vectorising the element / work icon sets?
//
// The pitch is that SVG scales forever. The counter-argument is that these are
// drawn at 13-20px from 48-64px sources, so they're already oversampled 3-4x,
// and colour-separated auto-tracing of multi-colour art tends to misregister at
// the seams. This renders both paths at the sizes the site actually uses plus a
// deliberately oversized one, so the question can be settled by looking.
const sharp = require('sharp');
const potrace = require('potrace');
const fs = require('fs');

const OUT = 'extract/out/vector';
const SIZES = [16, 20, 32, 96];
const SUBJECTS = [
  {src: '../assets/ui/work/kindling.webp', name: 'work-kindling'},
  {src: '../assets/ui/work/mining.webp', name: 'work-mining'},
  {src: '../assets/ui/element/fire.webp', name: 'element-fire'},
  {src: '../assets/ui/element/dragon.webp', name: 'element-dragon'},
];

// Trace one flat colour at a time: quantise, then run potrace over a mask per
// palette entry and stack the paths back up in the original colours.
function traceMask(png, opts) {
  return new Promise((res, rej) => {
    const t = new potrace.Potrace(opts);
    t.loadImage(png, err => err ? rej(err) : res(t.getPathTag()));
  });
}

async function vectorise(src, size) {
  const img = sharp(src).resize(256, 256, {kernel: 'lanczos3'});
  const {data, info} = await img.clone().ensureAlpha().raw().toBuffer({resolveWithObject: true});
  // collect the dominant colours over opaque pixels
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = [data[i] >> 5, data[i + 1] >> 5, data[i + 2] >> 5].join(',');
    const b = bins.get(key) || {n: 0, r: 0, g: 0, b: 0};
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    bins.set(key, b);
  }
  const cols = [...bins.values()].filter(b => b.n > info.width * info.height * 0.01)
    .sort((a, b) => b.n - a.n)
    .map(b => [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)]);

  const paths = [];
  for (const [r, g, bl] of cols) {
    // mask = pixels close to this colour, as black on white for potrace
    const mask = Buffer.alloc(info.width * info.height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const near = data[i + 3] > 128 &&
        Math.abs(data[i] - r) < 40 && Math.abs(data[i + 1] - g) < 40 && Math.abs(data[i + 2] - bl) < 40;
      mask[p] = near ? 0 : 255;
    }
    const png = await sharp(mask, {raw: {width: info.width, height: info.height, channels: 1}})
      .png().toBuffer();
    const tag = await traceMask(png, {threshold: 128, turdSize: 6, optCurve: true, optTolerance: 0.2});
    // getPathTag() already carries a fill; replace it rather than adding a second
    paths.push(/fill="[^"]*"/.test(tag)
      ? tag.replace(/fill="[^"]*"/, `fill="rgb(${r},${g},${bl})"`)
      : tag.replace('<path ', `<path fill="rgb(${r},${g},${bl})" `));
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${info.width} ${info.height}">${paths.join('')}</svg>`;
  return {svg, colours: cols.length};
}

(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  const rows = [];
  for (const s of SUBJECTS) {
    const {svg, colours} = await vectorise(s.src, 256);
    fs.writeFileSync(`${OUT}/${s.name}.svg`, svg);
    const rasterBytes = fs.statSync(s.src).size;
    console.log(`${s.name.padEnd(16)} raster ${String(rasterBytes).padStart(6)} B   ` +
                `svg ${String(Buffer.byteLength(svg)).padStart(6)} B   (${colours} colour layers)`);
    const cells = [];
    for (const px of SIZES) {
      const fromRaster = await sharp(s.src).resize(px, px, {kernel: 'lanczos3'})
        .extend({top: (96 - px) >> 1, bottom: (96 - px + 1) >> 1, left: (96 - px) >> 1, right: (96 - px + 1) >> 1,
                 background: {r: 0, g: 0, b: 0, alpha: 0}}).toBuffer();
      const fromVec = await sharp(Buffer.from(svg)).resize(px, px)
        .extend({top: (96 - px) >> 1, bottom: (96 - px + 1) >> 1, left: (96 - px) >> 1, right: (96 - px + 1) >> 1,
                 background: {r: 0, g: 0, b: 0, alpha: 0}}).toBuffer();
      cells.push(fromRaster, fromVec);
    }
    rows.push(cells);
  }
  // grid: one row per subject, columns are (raster, vector) per size
  const CELL = 100, cols = SIZES.length * 2;
  const comp = [];
  rows.forEach((cells, r) => cells.forEach((buf, c) => {
    comp.push({input: buf, left: c * CELL + 2, top: r * CELL + 2});
  }));
  await sharp({create: {width: cols * CELL, height: rows.length * CELL, channels: 4,
    background: {r: 26, g: 32, b: 44, alpha: 1}}}).composite(comp).png().toFile(`${OUT}/compare.png`);
  console.log(`\ncolumns: ${SIZES.map(s => `${s}px raster | ${s}px vector`).join('  ')}`);
  console.log(`sheet: ${OUT}/compare.png`);
})();
