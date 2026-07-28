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
const checks = require('./checks');

function makeReport() {
  const records = [];
  const sink = {pending: null};
  checks.setSink(sink);
  let group = null, orig = null, started = 0;

  function parse(line) {
    const m = /^ {2}(✓|✗) ([\s\S]*)$/.exec(line);
    if (!m) return;
    const rec = {group, ok: m[1] === '✓', message: m[2]};
    if (/^UNREACHABLE — /.test(rec.message)) rec.kind = 'unreachable';
    if (sink.pending) Object.assign(rec, sink.pending);
    sink.pending = null;
    records.push(rec);
  }

  return {
    hook() {
      if (orig) return;
      orig = console.log;
      console.log = (...a) => { try { parse(a.map(String).join(' ')); } catch (e) {} orig(...a); };
    },
    unhook() { if (orig) { console.log = orig; orig = null; } },
    group(name) { group = name; },
    begin() { started = Date.now(); },
    records: () => records,
    summary() {
      const failed = records.filter(r => !r.ok);
      const groups = {};
      for (const r of records) {
        const g = groups[r.group] = groups[r.group] || {checks: 0, failed: 0};
        g.checks++; if (!r.ok) g.failed++;
      }
      return {checks: records.length, failed: failed.length, groups};
    },
    write(file, meta) {
      const out = {
        tool: 'palarium-audit', version: 1,
        ...meta,
        elapsedMs: started ? Date.now() - started : null,
        ...this.summary(),
        results: records,
      };
      fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
      fs.writeFileSync(file, JSON.stringify(out, null, 2));
      return out;
    },
  };
}

module.exports = {makeReport};
