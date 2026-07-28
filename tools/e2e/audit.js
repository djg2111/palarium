// Shared checks for the browser suites: axe, horizontal overflow, focus sanity.
// One implementation for a11y.js (save reader) and states.js (the rest of the
// app) — a check fixed in one must not silently stay broken in the other.
const path = require('path');
const fs = require('fs');
const AXE = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function makeChecks() {
  let failures = 0;

  async function audit(page, label) {
    // .modal animates in from opacity:0 (@keyframes pop, since ffe460f). axe
    // sampling mid-fade composites every label over the scrim and reports
    // colour-contrast failures on text that passes when still — which made this
    // suite flake 1-2 violations a run. Settle first, then measure.
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
    await page.evaluate(AXE);
    const res = await page.evaluate(tags => axe.run(document, {runOnly: {type: 'tag', values: tags}})
      .then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length,
        target: v.nodes[0] && v.nodes[0].target.join(' ')}))), TAGS);
    if (res.length) { failures++; console.log(`  ✗ ${label}: ${res.length} violation(s)`); res.forEach(v => console.log(`      ${v.id} (${v.impact}) ×${v.n} — ${v.target}`)); }
    else console.log(`  ✓ ${label}: axe clean`);
    return res;
  }

  async function overflow(page, label) {
    const bad = [];
    for (const w of [320, 390, 768, 1280]) {
      await page.setViewportSize({width: w, height: 900});
      await page.waitForTimeout(220);
      const over = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      }));
      if (over.doc) bad.push(`${w}px (${over.sw} > ${over.cw})`);
    }
    await page.setViewportSize({width: 1280, height: 900});
    await page.waitForTimeout(150);
    if (bad.length) { failures++; console.log(`  ✗ ${label}: horizontal overflow at ${bad.join(', ')}`); }
    else console.log(`  ✓ ${label}: no horizontal overflow at 320 / 390 / 768 / 1280`);
  }

  async function focusSane(page, label) {
    const who = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? (a.tagName + (a.id ? '#' + a.id : '') + (a.className ? '.' + String(a.className).split(' ')[0] : '')) : 'null';
    });
    const lost = who === 'BODY' || who === 'null';
    if (lost) { failures++; console.log(`  ✗ ${label}: focus fell to ${who}`); }
    else console.log(`  ✓ ${label}: focus on ${who}`);
  }

  // focusSane only asks whether focus EXISTS. Twice now a hand-off has put focus
  // on a real control that an author-initiated scroll then carried off-screen and
  // left there — focus present, indicator invisible, and the next Tab jumping the
  // page hundreds of px. This asks whether the user can actually see it (2.4.11).
  async function focusVisible(page, label) {
    const m = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const r = a.getBoundingClientRect();
      const hd = document.querySelector('header');
      // A sticky header covering the control counts as not visible — but only
      // when it is actually in front of it. Inside an open dialog it is not:
      // the overlay is z-index 100 to the header's 50, and clamping anyway
      // reported "✕ focused but only 18px of 37px on screen" for every entry
      // into the pal card.
      const inDialog = [...document.querySelectorAll('.overlay.open')].some(o => o.contains(a));
      const hb = hd && !inDialog ? hd.getBoundingClientRect().bottom : 0;
      const top = Math.max(r.top, hb);
      return {who: a.tagName + (a.id ? '#' + a.id : '') + (a.className ? '.' + String(a.className).split(' ')[0] : ''),
        px: Math.round(Math.max(0, Math.min(r.bottom, innerHeight) - top)), h: Math.round(r.height)};
    });
    if (!m) { failures++; console.log(`  ✗ ${label}: focus fell to <body>`); return; }
    // half the control, or 24px — the §8 target-size floor
    const need = Math.min(24, m.h / 2);
    if (m.px < need) { failures++; console.log(`  ✗ ${label}: ${m.who} is focused but only ${m.px}px of ${m.h}px is on screen`); }
    else console.log(`  ✓ ${label}: ${m.who} focused and visible (${m.px}px of ${m.h}px)`);
  }

  return {audit, overflow, focusSane, focusVisible, fail: () => { failures++; }, failed: () => failures};
}

module.exports = {makeChecks, TAGS};
