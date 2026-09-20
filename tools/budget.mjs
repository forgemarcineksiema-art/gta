#!/usr/bin/env node
/**
 * Build budget check (docs/BRIEF.md §6). Fails when a target is exceeded.
 *
 *  - bytes requested before gameplay-start: from perf/startup.json when the smoke
 *    test has produced it, otherwise the sum of every eagerly loaded asset in dist/
 *  - total build size and file count
 *  - absolute paths in the build (CrazyGames serves from an arbitrary base path)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const BUDGET = {
  startupBytesTarget: 8 * 1024 * 1024,
  startupBytesFail: 12 * 1024 * 1024,
  totalBytes: 40 * 1024 * 1024,
  fileCount: 200,
};

if (!existsSync(DIST)) {
  console.error('budget: dist/ not found, run `npm run build` first');
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push({ path: relative(DIST, p).replaceAll('\\', '/'), bytes: st.size });
  }
})(DIST);

const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
let failed = false;
const mb = (b) => (b / (1024 * 1024)).toFixed(2) + ' MB';
const report = (label, value, limit, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(40)} ${value}${limit ? `  (limit ${limit})` : ''}`);
  if (!ok) failed = true;
};

// --- startup bytes ---------------------------------------------------------
let startupBytes;
let startupSource;
if (existsSync('perf/startup.json')) {
  const s = JSON.parse(readFileSync('perf/startup.json', 'utf-8'));
  startupBytes = s.bytesBeforeGameplayStart;
  startupSource = `measured by smoke test (${s.requests.filter((r) => r.beforeGameplayStart).length} requests, gameplay-start at ${s.timeToGameplayStartMs} ms)`;
} else {
  // everything referenced from index.html plus the chunks it imports eagerly
  startupBytes = files.filter((f) => !f.path.includes('lazy')).reduce((a, f) => a + f.bytes, 0);
  startupSource = 'estimated from dist/ (no perf/startup.json; run the smoke test for a measurement)';
}
console.log(`startup bytes: ${startupSource}`);
report('bytes before gameplay-start', mb(startupBytes), mb(BUDGET.startupBytesFail), startupBytes <= BUDGET.startupBytesFail);
if (startupBytes > BUDGET.startupBytesTarget) console.log(`warn  above the ${mb(BUDGET.startupBytesTarget)} target`);

// --- total size / count -------------------------------------------------------
report('total build size', mb(totalBytes), mb(BUDGET.totalBytes), totalBytes <= BUDGET.totalBytes);
report('file count', String(files.length), String(BUDGET.fileCount), files.length <= BUDGET.fileCount);

// --- absolute paths --------------------------------------------------------------
const textExt = /\.(html|js|css|json|svg|webmanifest)$/;
const absolute = [];
for (const f of files) {
  if (!textExt.test(f.path)) continue;
  const text = readFileSync(join(DIST, f.path), 'utf-8');
  const patterns = [/(?:src|href)=["']\/(?!\/)/g, /url\(\s*["']?\/(?!\/)/g, /import\(\s*["']\/(?!\/)/g, /from\s*["']\/(?!\/)/g];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) absolute.push(`${f.path}: ${m.length}x ${m[0]}`);
  }
}
report('absolute paths in build', absolute.length ? absolute.join('; ') : 'none', 'none', absolute.length === 0);

// --- largest files -------------------------------------------------------------
console.log('largest files:');
for (const f of [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 6)) console.log(`      ${mb(f.bytes).padStart(9)}  ${f.path}`);

process.exit(failed ? 1 : 0);
