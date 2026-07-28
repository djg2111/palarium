// One browser run, two readers.
//
// The a11y gate and the design review used to boot Playwright separately and
// drive the same states twice — duplicating the work and fighting for CPU while
// doing it. This turns a run into a JSON artifact both can read instead.
//
// It works by reading back the protocol the suites already speak: every
// assertion in states.js and a11y.js prints exactly one "  ✓ " or "  ✗ " line.
// Parsing that is why adding the artifact did not mean rewriting 1300 lines of
// assertions to report themselves twice — and it means the JSON can never
// disagree with what the console said.
const fs = require('fs');
const path = require('path');
const {AsyncLocalStorage} = require('async_hooks');
const checks = require('./checks');

function makeReport() {
  const records = [];
  // Groups run concurrently, so a global "current group" would attribute half
  // the lines to whichever group happened to be awaiting. The async context is
  // the only thing that knows which group a console.log came from.
  const als = new AsyncLocalStorage();
  let orig = null, started = 0;

  function parse(line, store) {
    const m = /^ {2}(✓|✗) ([\s\S]*)$/.exec(line);
    if (!m) return;
    const rec = {group: store.group, ok: m[1] === '✓', message: m[2]};
    if (/^UNREACHABLE — /.test(rec.message)) rec.kind = 'unreachable';
    if (store.pending) Object.assign(rec, store.pending);
    store.pending = null;
    records.push(rec);
  }

  const out = (...a) => (orig || console.log)(...a);

  return {
    hook() {
      if (orig) return;
      orig = console.log;
      checks.setSink(() => als.getStore());
      console.log = (...a) => {
        const store = als.getStore();
        if (!store) return orig(...a);           // the runner's own output
        const line = a.map(String).join(' ');
        try { parse(line, store); } catch (e) {}
        store.lines.push(line);                  // held until the group finishes
      };
    },
    unhook() { if (orig) { console.log = orig; orig = null; } checks.setSink(null); },

    // Run one group in its own async context, buffering its output so that
    // concurrent groups print as whole blocks instead of interleaving line by
    // line into something no one can read.
    async run(group, title, fn) {
      const store = {group, pending: null, lines: []};
      try {
        return await als.run(store, fn);
      } finally {
        out(title);
        for (const l of store.lines) out(l);
      }
    },

    begin() { started = Date.now(); },
    records: () => records,
    summary() {
      const groups = {};
      for (const r of records) {
        const g = groups[r.group] = groups[r.group] || {checks: 0, failed: 0};
        g.checks++; if (!r.ok) g.failed++;
      }
      return {checks: records.length, failed: records.filter(r => !r.ok).length, groups};
    },
    write(file, meta) {
      const doc = {
        tool: 'palarium-audit', version: 1,
        ...meta,
        elapsedMs: started ? Date.now() - started : null,
        ...this.summary(),
        results: records,
      };
      fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
      fs.writeFileSync(file, JSON.stringify(doc, null, 2));
      return doc;
    },
  };
}

module.exports = {makeReport};
