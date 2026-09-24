#!/usr/bin/env node
/**
 * `npm run verify`: typecheck, lint, sim tests, build, budget, smoke.
 * Runs every stage, prints a summary, exits non-zero if any stage failed.
 * Must be green at the start of every session. `--gate` (`npm run verify:gate`)
 * also runs the long bot-driven pins (tests/**\/*.long.test.ts, LONG=1): the
 * form for milestone gates and for the commit of a slice that added one.
 */
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';

const stages = [
  ['typecheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']],
  ['typecheck:sim', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.sim.json']],
  ['lint', 'npx', ['eslint', '.', '--max-warnings=0']],
  ['test', 'npx', ['vitest', 'run']],
  ['build', 'npx', ['vite', 'build']],
  ['smoke', 'npx', ['playwright', 'test', 'e2e/smoke.spec.ts']],
  ['budget', 'node', ['tools/budget.mjs']],
];

const args = process.argv.slice(2);
const gate = args.includes('--gate');
const only = args.filter((a) => !a.startsWith('--'));
// The long pins time sim steps and carry timeouts sized for a core each: at the M8.7 gate seven workers on a laptop's
// four cores (eight threads) doubled them (the traffic pool's step 6.0 ms against 1.5 alone, the city tour 215 s
// against 64). The gate runs a worker a core.
if (gate) (stages.find(([name]) => name === 'test') ?? [])[2]?.push(`--maxWorkers=${Math.max(1, Math.floor(availableParallelism() / 2))}`);
const results = [];
let failed = false;
for (const [name, cmd, args] of stages) {
  if (only.length && !only.includes(name)) continue;
  if (failed && name !== 'budget') {
    results.push([name, 'skipped']);
    continue;
  }
  const t0 = Date.now();
  console.log(`\n=== ${name}: ${cmd} ${args.join(' ')}${gate && name === 'test' ? ' (LONG=1: long pins included)' : ''}`);
  const env = gate && name === 'test' ? { ...process.env, LONG: '1' } : process.env;
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env });
  const ok = r.status === 0;
  results.push([name, ok ? `ok (${((Date.now() - t0) / 1000).toFixed(1)} s)` : `FAILED (exit ${r.status})`]);
  if (!ok) failed = true;
}

console.log('\n=== verify summary');
for (const [name, status] of results) console.log(`${status.startsWith('ok') ? '  ' : '!!'} ${name.padEnd(14)} ${status}`);
process.exit(failed ? 1 : 0);
