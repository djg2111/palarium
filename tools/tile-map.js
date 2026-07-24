#!/usr/bin/env node
// Slice the 8192px map textures into a zoom pyramid of WebP tiles.
//
// Why tile at all: an 8192x8192 image decodes to ~268 MB of RAM no matter how
// small the file is, which will kill mobile Safari. Tiles let the viewer hold
// only the handful on screen. It also means every tile can be LOSSLESS without
// a download cost, because you never fetch the whole pyramid.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'extract/maps';
const OUT = process.argv[2] || 'extract/tiles';
const TILE = 512;
const MAPS = [
  { key: 'main', file: 'T_WorldMap.png' },
  { key: 'tree', file: 'T_TreeMap.png' },
];
// quality mode: 'lossless' or a webp quality number
const MODE = process.argv[3] ?? 'lossless';
// Cap the pyramid below native. z3 = 4096px across the whole map, still ~2x a
// typical screen; the native z4 level alone costs 40 MB of the 62 MB full set.
const MAX_ZOOM = process.argv[4] != null ? Number(process.argv[4]) : 3;
const webpOpts = MODE === 'lossless'
  ? { lossless: true, effort: 4 }
  : { quality: Number(MODE), effort: 4 };

(async () => {
  const manifest = { tileSize: TILE, mode: MODE, maxZoom: MAX_ZOOM, maps: {} };

  for (const m of MAPS) {
    const srcPath = path.join(SRC, m.file);
    if (!fs.existsSync(srcPath)) { console.log(`skip ${m.key}: ${srcPath} missing`); continue; }
    const meta = await sharp(srcPath, { limitInputPixels: false }).metadata();
    const size = meta.width;
    const nativeZoom = Math.log2(size / TILE);      // 8192/512 -> z4 is native
    if (!Number.isInteger(nativeZoom)) throw new Error(`${m.file}: ${size}px not a power-of-two multiple of ${TILE}`);
    const maxZoom = Math.min(nativeZoom, MAX_ZOOM);

    let total = 0, count = 0;
    for (let z = 0; z <= maxZoom; z++) {
      const dim = TILE * 2 ** z;                     // full map size at this zoom
      const n = 2 ** z;                              // tiles per axis
      const dir = path.join(OUT, m.key, String(z));
      fs.mkdirSync(dir, { recursive: true });

      // resize once per level, then slice — far cheaper than re-resizing per tile
      const level = await sharp(srcPath, { limitInputPixels: false })
        .resize(dim, dim, { kernel: 'lanczos3' })
        .png({ compressionLevel: 0 })
        .toBuffer();

      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const buf = await sharp(level, { limitInputPixels: false })
            .extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE })
            .webp(webpOpts)
            .toBuffer();
          fs.writeFileSync(path.join(dir, `${x}_${y}.webp`), buf);
          total += buf.length; count++;
        }
      }
      process.stdout.write(`  ${m.key} z${z}: ${n}x${n} tiles (${dim}px)\n`);
    }
    manifest.maps[m.key] = { size, maxZoom, nativeZoom, tiles: count, bytes: total };
    console.log(`${m.key}: ${count} tiles, ${(total / 1048576).toFixed(2)} MB\n`);
  }

  fs.writeFileSync(path.join(OUT, 'tiles.json'), JSON.stringify(manifest, null, 1));
  const grand = Object.values(manifest.maps).reduce((a, b) => a + b.bytes, 0);
  console.log(`TOTAL: ${(grand / 1048576).toFixed(2)} MB across ${Object.values(manifest.maps).reduce((a, b) => a + b.tiles, 0)} tiles (${MODE})`);
})();
