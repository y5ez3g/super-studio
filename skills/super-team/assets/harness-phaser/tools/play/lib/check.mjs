// Syntax gate used by `npm run typecheck` / `npm run build` until the game
// scaffold lands (then eng-core's tsc/vite take over for src/).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['tools/play'];
const files = [];
for (const root of roots) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'fixture') continue;
        walk(p);
      } else if (e.name.endsWith('.mjs')) {
        files.push(p);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
}
// Fixture game JS is browser code; still syntax-check it.
for (const f of ['tools/play/fixture/app/agent-test.js']) {
  if (fs.existsSync(f)) files.push(f);
}
if (!files.length) {
  console.log('check: no files found');
  process.exit(0);
}
for (const f of files) {
  execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
}
console.log(`check: ${files.length} files OK`);
