/* Scale: what a several-hundred-megabyte save actually costs.
 *
 *   node b6-scale.js [sizeMB] [pals]
 *
 * Builds a well-formed save of the requested size — a real pal map followed by
 * filler blocks, all stored rather than compressed so the size is exact — then
 * reads it in Chrome and reports wall time and peak JS heap. The point is the
 * prefix decode: the pal map is the first thing in worldSaveData, so the reader
 * should touch a few megabytes of a 400 MB file and never materialise the rest.
 */
const {open, problems} = require('./lib');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SIZE_MB = Number(process.argv[2] || 400);
const NPALS = Number(process.argv[3] || 3000);

function buildBig(sizeMB, npals) {
  const out = path.join(os.tmpdir(), `palarium-scale-${sizeMB}-${npals}.sav`);
  if (fs.existsSync(out) && fs.statSync(out).size >= sizeMB * 1048576) return out;
  const {buildGvas} = require(path.join(__dirname, '..', 'make-fixture.js'));
  const SPECIES = ['SheepBall', 'PinkCat', 'Anubis', 'Penguin', 'FoxMage', 'CatBat', 'Monkey', 'WoolFox', 'LizardMan', 'PlantSlime'];
  const PASS = ['Noukin', 'Legend', 'PAL_ALLAttack_up2', 'Deffence_up2', 'MoveSpeed_up_2'];
  const pals = [];
  for (let i = 0; i < npals; i++) {
    const g = i.toString(16).padStart(32, '0');
    pals.push({
      guid: g, cid: SPECIES[i % SPECIES.length], gender: i % 2 ? 'M' : 'F',
      level: 1 + (i % 50), iv: [i % 101, (i * 7) % 101, (i * 13) % 101],
      passives: [PASS[i % PASS.length], PASS[(i + 2) % PASS.length]],
    });
  }
  // Oodle blocks are exactly 256 KB except the last, so the real data is
  // padded up to a block boundary before the filler starts — otherwise the
  // generator emits a short block mid-stream and the framing is invalid.
  const gvasRaw = buildGvas(pals);
  const pad = (262144 - (gvasRaw.length % 262144)) % 262144;
  const gvas = Buffer.concat([gvasRaw, Buffer.alloc(pad)]);

  const target = sizeMB * 1048576;
  const fd = fs.openSync(out, 'w');
  const body = [];
  // stored blocks for the real data
  let p = 0;
  const blocks = [];
  while (p < gvas.length) {
    const n = Math.min(262144, gvas.length - p);
    blocks.push(Buffer.from([0x8c, 0x0a, ((n - 1) >> 16) & 0xFF, ((n - 1) >> 8) & 0xFF, (n - 1) & 0xFF]), gvas.subarray(p, p + n));
    p += n;
  }
  const realBody = Buffer.concat(blocks);
  // filler blocks so the file is genuinely the requested size, and the header
  // claims all of it — the reader must decide not to touch them
  const fillerPayload = Buffer.alloc(262144, 0x20);
  const fillerHdr = Buffer.from([0x8c, 0x0a, ((262144 - 1) >> 16) & 0xFF, ((262144 - 1) >> 8) & 0xFF, (262144 - 1) & 0xFF]);
  const nFiller = Math.max(0, Math.ceil((target - realBody.length - 12) / (262144 + 5)));
  const uncompressed = gvas.length + nFiller * 262144;
  const bodyLen = realBody.length + nFiller * (262144 + 5);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(uncompressed, 0);
  head.writeUInt32LE(bodyLen, 4);
  head.write('PlM', 8, 'latin1'); head[11] = 0x31;
  fs.writeSync(fd, head); fs.writeSync(fd, realBody);
  for (let i = 0; i < nFiller; i++) { fs.writeSync(fd, fillerHdr); fs.writeSync(fd, fillerPayload); }
  fs.closeSync(fd);
  return out;
}

(async () => {
  console.log(`building a ${SIZE_MB} MB save with ${NPALS} pals…`);
  const file = buildBig(SIZE_MB, NPALS);
  const st = fs.statSync(file);
  console.log(`  ${file}  ${(st.size / 1048576).toFixed(1)} MB on disk`);

  const h = await open();
  const {page} = h;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metric = async name => {
    const m = await cdp.send('Performance.getMetrics');
    const e = m.metrics.find(x => x.name === name);
    return e ? e.value : 0;
  };
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(400);
  await page.evaluate(() => location.hash = '#/roster');
  await page.waitForTimeout(300);

  const heap0 = await metric('JSHeapUsedSize');
  // #savereadBtn went away in 08459ea when the two import buttons became one
  await page.click('#importBtn');
  const t0 = Date.now();
  await page.setInputFiles('#saveFile', file);
  let peak = heap0;
  const poll = setInterval(async () => { try { peak = Math.max(peak, await metric('JSHeapUsedSize')); } catch {} }, 120);
  let ok = true, msg = '';
  try {
    await page.waitForSelector('#smResult:not([hidden]), #smError:not([hidden])', {timeout: 300000});
  } catch (e) { ok = false; msg = 'timed out'; }
  clearInterval(poll);
  const ms = Date.now() - t0;
  const errShown = await page.$eval('#smError', e => !e.hidden).catch(() => false);
  if (errShown) msg = (await page.textContent('#smErrMsg')).trim();
  else if (ok) msg = (await page.textContent('#smSummary')).trim();
  peak = Math.max(peak, await metric('JSHeapUsedSize'));

  console.log(`\n  result: ${msg}`);
  console.log(`  wall time from file pick to answer: ${ms} ms`);
  console.log(`  JS heap: ${(heap0 / 1048576).toFixed(0)} MB before → ${(peak / 1048576).toFixed(0)} MB peak (main thread; the decode runs in a worker)`);
  console.log(`  the file itself is ${(st.size / 1048576).toFixed(0)} MB and is read into an ArrayBuffer before being handed over`);
  const probs = problems(h);
  console.log('  problems:', probs.length ? probs : 'none');
  await h.browser.close();
})();
