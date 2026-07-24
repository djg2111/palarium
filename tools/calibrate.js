// Brute-force the world->pixel mapping instead of guessing it.
// Fast-travel points are overwhelmingly on land, so the correct transform is
// the one that puts the most markers on non-ocean pixels. Tries every
// axis-swap / axis-flip combination and scores each against the real texture.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const markers = JSON.parse(fs.readFileSync('extract/out/mapMarkers.json', 'utf8'));
const ui = JSON.parse(fs.readFileSync('extract/dt/DT_WorldMapUIData.json', 'utf8'))[0].Rows;
// canvas can't read a file:// image (tainted origin), so serve the folder
const http = require('http');
const PORT = 8731;
const server = http.createServer((req, res) => {
  const f = path.resolve('.' + decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => e
    ? (res.writeHead(404), res.end('no'))
    : (res.writeHead(200, { 'Content-Type': 'image/png' }), res.end(d)));
}).listen(PORT);
const fileUrl = f => `http://127.0.0.1:${PORT}/${f}`;

const CANDIDATES = [];
for (const swap of [false, true])
  for (const flipX of [false, true])
    for (const flipY of [false, true])
      CANDIDATES.push({ swap, flipX, flipY, name: `${swap ? 'swap' : 'direct'}${flipX ? '+flipX' : ''}${flipY ? '+flipY' : ''}` });

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const page = await (await b.newContext({ viewport: { width: 400, height: 300 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);

  const results = {};
  for (const layerKey of ['MainMap', 'Tree']) {
    const v = ui[layerKey];
    const cfg = {
      size: v.minMapTextureBlockSize.X,
      min: v.landScapeRealPositionMin,
      max: v.landScapeRealPositionMax,
      url: fileUrl(layerKey === 'MainMap' ? 'extract/maps/T_WorldMap.png' : 'extract/maps/T_TreeMap.png'),
    };
    const pts = markers.filter(m => m.layer === layerKey).map(m => ({ x: m.world.x, y: m.world.y, id: m.id }));

    results[layerKey] = await page.evaluate(async ({ cfg, pts, CANDIDATES }) => {
      const img = new Image();
      img.src = cfg.url;
      await img.decode();
      const S = 2048;                    // sampling resolution
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, S, S);
      const data = ctx.getImageData(0, 0, S, S).data;
      const k = S / cfg.size;   // map px -> sample px

      // ocean on this texture is dark and strongly blue-dominant; land is
      // brighter and/or not blue-dominant. sample a small patch to be robust.
      const isLand = (mapX, mapY) => {
        const px = mapX * k, py = mapY * k;
        let land = 0, n = 0;
        for (let dx = -2; dx <= 2; dx += 2) for (let dy = -2; dy <= 2; dy += 2) {
          const x = Math.round(px + dx), y = Math.round(py + dy);
          if (x < 0 || y < 0 || x >= S || y >= S) continue;
          const i = (y * S + x) * 4;
          const r = data[i], g = data[i + 1], bl = data[i + 2], a = data[i + 3];
          if (a < 8) { n++; continue; }
          const blueDom = bl > r + 18 && bl > g + 8;
          const bright = (r + g + bl) / 3;
          if (!blueDom || bright > 130) land++;
          n++;
        }
        return n && land / n >= 0.5;
      };

      const project = (cand, wx, wy) => {
        let u = (wx - cfg.min.X) / (cfg.max.X - cfg.min.X);
        let vv = (wy - cfg.min.Y) / (cfg.max.Y - cfg.min.Y);
        if (cand.flipX) u = 1 - u;
        if (cand.flipY) vv = 1 - vv;
        return cand.swap ? { x: vv * cfg.size, y: u * cfg.size } : { x: u * cfg.size, y: vv * cfg.size };
      };

      return CANDIDATES.map(cand => {
        let hits = 0, inb = 0;
        for (const p of pts) {
          const q = project(cand, p.x, p.y);
          if (q.x < 0 || q.y < 0 || q.x > cfg.size || q.y > cfg.size) continue;
          inb++;
          if (isLand(q.x, q.y)) hits++;
        }
        return { name: cand.name, ...cand, hits, inb, total: pts.length, pct: pts.length ? +(100 * hits / pts.length).toFixed(1) : 0 };
      }).sort((a, b) => b.hits - a.hits);
    }, { cfg, pts, CANDIDATES });
  }

  for (const [k, rs] of Object.entries(results)) {
    console.log(`\n=== ${k} (${rs[0].total} markers) ===`);
    rs.forEach(r => console.log(`  ${r.name.padEnd(20)} on-land ${String(r.hits).padStart(3)}/${r.total}  ${String(r.pct).padStart(5)}%${r === rs[0] ? '   <-- best' : ''}`));
  }
  fs.writeFileSync('extract/out/calibration.json', JSON.stringify(results, null, 1));
  await b.close();
  server.close();
})();
