#!/usr/bin/env node
/**
 * `npm run verify`: typecheck, lint, sim tests, build, budget, smoke.
 * Runs every stage, prints a summary, exits non-zero if any stage failed.
 * Must be green before every milestone gate and at the start of every session.
 */
import { spawnSync } from 'node:child_process';

const stages = [
  ['typecheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']],
  ['typecheck:sim', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.sim.json']],
  ['lint', 'npx', ['eslint', '.', '--max-warnings=0']],
  ['test', 'npx', ['vitest', 'run']],
  ['build', 'npx', ['vite', 'build']],
  ['smoke', 'npx', ['playwright', 'test', 'e2e/smoke.spec.ts']],
  ['budget', 'node', ['tools/budget.mjs']],
];

const only = process.argv.slice(2);
const results = [];
let failed = false;
for (const [name, cmd, args] of stages) {
  if (only.length && !only.includes(name)) continue;
  if (failed && name !== 'budget') {
    results.push([name, 'skipped']);
    continue;
  }
  const t0 = Date.now();
  console.log(`\n=== ${name}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  results.push([name, ok ? `ok (${((Date.now() - t0) / 1000).toFixed(1)} s)` : `FAILED (exit ${r.status})`]);
  if (!ok) failed = true;
}

console.log('\n=== verify summary');
for (const [name, status] of results) console.log(`${status.startsWith('ok') ? '  ' : '!!'} ${name.padEnd(14)} ${status}`);
process.exit(failed ? 1 : 0);
