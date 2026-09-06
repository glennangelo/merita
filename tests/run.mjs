/* Runs every suite and adds up the results.

   Each suite needs the site running. If nothing is answering on the test
   address, this starts `wrangler dev` itself and stops it again at the end,
   so `npm test` is the only thing anyone has to remember. */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8788';

const SUITES = ['accessibility', 'resilience', 'forms', 'moderation', 'design'];

async function answering() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

async function waitFor(seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await answering()) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

let server = null;
if (!(await answering())) {
  console.log(`Nothing answering at ${BASE} — starting the site.\n`);
  server = spawn('npx', ['wrangler', 'dev', '--port', '8788', '--local'],
                 { cwd: join(HERE, '..'), stdio: 'ignore', detached: true });
  if (!(await waitFor(60))) {
    console.error('The site did not start. Try "npm start" in another terminal, then run this again.');
    if (server) process.kill(-server.pid);
    process.exit(1);
  }
}

function runSuite(name) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [join(HERE, name + '.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; process.stdout.write(d); });
    child.stderr.on('data', d => { out += d; process.stderr.write(d); });
    child.on('close', code => {
      const m = out.match(/RESULT (\d+) passed, (\d+) failed/);
      resolve(m ? { passed: +m[1], failed: +m[2], code }
                : { passed: 0, failed: 1, code, crashed: true });
    });
  });
}

let passed = 0, failed = 0;
const summary = [];
for (const name of SUITES) {
  console.log(`\n──────── ${name} ────────`);
  const r = await runSuite(name);
  passed += r.passed; failed += r.failed;
  summary.push(`  ${name.padEnd(16)} ${r.passed} passed` +
               (r.failed ? `, ${r.failed} failed` : '') +
               (r.crashed ? '  (the suite stopped early)' : ''));
}

console.log('\n════════ everything ════════');
console.log(summary.join('\n'));
console.log(`\n  ${passed} passed, ${failed} failed`);
if (!failed) console.log('\n  All good. Run "npm run check" before sending the address to anyone.');

if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } }
process.exit(failed ? 1 : 0);
