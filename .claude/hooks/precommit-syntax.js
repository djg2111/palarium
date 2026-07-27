// PreToolUse hook: before any `git commit`, syntax-check the staged JS files.
// Wired up by .claude/settings.json (hooks.PreToolUse, matcher "Bash").
// Exit 0 = allow the command; exit 2 = block it and feed stderr back to Claude.
const {execSync} = require('child_process');

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = JSON.parse(raw).tool_input?.command || ''; } catch { process.exit(0); }
  if (!/\bgit commit\b/.test(cmd)) process.exit(0);

  let staged = [];
  try {
    staged = execSync('git diff --cached --name-only --diff-filter=ACM', {encoding: 'utf8'})
      .split('\n').filter(f => f.endsWith('.js') && !f.startsWith('tools/node_modules'));
  } catch { process.exit(0); } // not a repo / nothing staged — let git say so
  const bad = [];
  for (const f of staged) {
    try { execSync(`node --check "${f}"`, {stdio: 'pipe'}); }
    catch (e) { bad.push(`${f}:\n${String(e.stderr || e.message).trim()}`); }
  }
  if (bad.length) {
    console.error(`Blocked: ${bad.length} staged JS file(s) fail node --check — fix before committing.\n\n` + bad.join('\n\n'));
    process.exit(2);
  }
  process.exit(0);
});
