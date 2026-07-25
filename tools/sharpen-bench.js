#!/usr/bin/env node
// Why the map looks soft zoomed in, and what to do about it.
//
// The pyramid stops at z3 = 4096px across an 8192px source, so at the viewer's
// maximum scale you are looking at a 2x upscale of a 2x downscale. Lanczos
// downscaling is already mildly sharpening, but the browser's bilinear upscale
// on the way back out undoes more than that.
//
// This crops the same patch at a few unsharp-mask settings, renders each the way
// the viewer would (downscale to tile resolution, then upscale 2x), and reports
// a sharpness proxy (variance of the Laplacian) plus the file cost. Look at the
// contact sheet before believing the numbers — over-sharpening shows up as
// halos long before it shows up in the metric.
const sharp = require('sharp');
const fs = require('fs');

const SRC = process.argv[2] || 'extract/maps/T_WorldMap.png';
const OUT = process.argv[3] || 'extract/out/sharpen';
// a patch with coastline, forest canopy and a road — the three things that go
// mushy first
const CROP = {left: 3600, top: 3400, width: 1024, height: 1024};

const SETTINGS = [
  {name: 'none', sharpen: null},
  {name: 'gentle', sharpen: {sigma: 0.6, m1: 0.4, m2: 0.6}},
  {name: 'medium', sharpen: {sigma: 0.8, m1: 0.6, m2: 0.9}},
  {name: 'strong', sharpen: {sigma: 1.0, m1: 1.0, m2: 1.4}},
];

// variance of the Laplacian on the luma plane — higher means more local contrast
async function sharpness(buf) {
  const {data, info} = await sharp(buf).greyscale().raw().toBuffer({resolveWithObject: true});
  const {width: w, height: h} = info;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      sum += lap; sum2 += lap * lap; n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  const base = await sharp(SRC, {limitInputPixels: false}).extract(CROP).png().toBuffer();
  console.log(`patch ${CROP.width}x${CROP.height} from ${SRC}\n`);
  console.log('setting   z3 bytes   sharpness(z3)   sharpness(as viewed 2x)');

  const tiles = [];
  for (const s of SETTINGS) {
    // exactly what tile-map.js does: resize to the level, then encode
    let img = sharp(base).resize(CROP.width / 2, CROP.height / 2, {kernel: 'lanczos3'});
    if (s.sharpen) img = img.sharpen(s.sharpen);
    const tile = await img.webp({lossless: true, effort: 4}).toBuffer();
    // and what the browser does with it at max zoom
    const viewed = await sharp(tile).resize(CROP.width, CROP.height, {kernel: 'cubic'}).png().toBuffer();
    const sz = await sharpness(tile), sv = await sharpness(viewed);
    console.log(`${s.name.padEnd(9)} ${String(tile.length).padStart(8)}   ${sz.toFixed(1).padStart(13)}   ${sv.toFixed(1).padStart(22)}`);
    fs.writeFileSync(`${OUT}/${s.name}.png`, viewed);
    tiles.push({name: s.name, viewed});
  }

  // side-by-side of the same 420px region, as it would appear on screen
  const CUT = 420;
  const comp = [];
  for (let i = 0; i < tiles.length; i++) {
    const c = await sharp(tiles[i].viewed).extract({left: 300, top: 300, width: CUT, height: CUT}).toBuffer();
    comp.push({input: c, left: (i % 2) * (CUT + 8), top: Math.floor(i / 2) * (CUT + 8)});
  }
  await sharp({create: {width: CUT * 2 + 8, height: CUT * 2 + 8, channels: 3,
    background: {r: 20, g: 26, b: 36}}}).composite(comp).png().toFile(`${OUT}/compare.png`);
  console.log(`\ncontact sheet: ${OUT}/compare.png  (TL none, TR gentle, BL medium, BR strong)`);
})();
