/**
 * Autopilot perf run under 4x CPU throttle (CDP). Writes perf/latest.json,
 * checks the budgets from docs/BRIEF.md §6 and flags regressions above 10%
 * against perf/previous.json. Headless numbers are a CPU-side signal only;
 * `npm run perf:headed` on real hardware gives the GPU picture.
 */
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { PerfResult } from '../src/app/perf';

const BUDGET = {
  frameP95Ms: 33.4, // stable 30+ on the low tier (throttled)
  drawCallsMax: 300,
  trianglesMax: 600_000,
  heapMbMax: 250,
};

test('bot drives 60 s under 4x CPU throttle within budget', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP throttling needs Chromium');
  const seed = Number(process.env.PERF_SEED ?? '42');
  const duration = Number(process.env.PERF_DURATION ?? '60');
  const throttle = Number(process.env.PERF_THROTTLE ?? '4');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

  await page.goto(`/?bot=1&seed=${seed}&duration=${duration}`);
  await page.waitForFunction(() => window.__game?.started === true, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__perfDone === true, null, { timeout: (duration + 60) * 1000 });
  const perf = (await page.evaluate(() => window.__perf)) as PerfResult;
  expect(perf).toBeTruthy();

  mkdirSync('perf', { recursive: true });
  if (existsSync('perf/latest.json')) renameSync('perf/latest.json', 'perf/previous.json');
  writeFileSync('perf/latest.json', JSON.stringify({ ...perf, seed, throttle, measuredAt: new Date().toISOString() }, null, 2));

  const lines = [
    `gl ${perf.glRenderer}${perf.softwareGl ? '  (SOFTWARE GL: frame times are a CPU signal only)' : ''}`,
    `frames ${perf.frames}  fps(mean) ${perf.fpsMean.toFixed(1)}`,
    `frame ms  p50 ${perf.frameMs.p50.toFixed(2)}  p95 ${perf.frameMs.p95.toFixed(2)}  p99 ${perf.frameMs.p99.toFixed(2)}  max ${perf.frameMs.max.toFixed(2)}`,
    `step ms   p50 ${perf.stepMs.p50.toFixed(2)}  p95 ${perf.stepMs.p95.toFixed(2)}  max ${perf.stepMs.max.toFixed(2)}`,
    `draw calls mean ${perf.drawCalls.mean.toFixed(0)} max ${perf.drawCalls.max}   tris mean ${(perf.triangles.mean / 1000).toFixed(0)}k max ${(perf.triangles.max / 1000).toFixed(0)}k`,
    `heap MB start ${perf.heapMb.start.toFixed(0)} end ${perf.heapMb.end.toFixed(0)} max ${perf.heapMb.max.toFixed(0)}   dropped ${perf.droppedTime.toFixed(2)} s  bot resets ${perf.botResets}`,
  ];
  console.log('[perf]\n' + lines.join('\n'));

  expect(perf.drawCalls.max, 'draw calls').toBeLessThanOrEqual(BUDGET.drawCallsMax);
  expect(perf.triangles.max, 'triangles').toBeLessThanOrEqual(BUDGET.trianglesMax);
  if (perf.heapMb.max > 0) expect(perf.heapMb.max, 'JS heap').toBeLessThanOrEqual(BUDGET.heapMbMax);
  // frame time only means something on a real GPU; on software GL it is reported, not enforced
  if (perf.frameMs.p95 > BUDGET.frameP95Ms) console.warn(`[perf] p95 frame ${perf.frameMs.p95.toFixed(1)} ms exceeds ${BUDGET.frameP95Ms} ms`);
  if (!perf.softwareGl) expect(perf.frameMs.p95, 'p95 frame time under 4x CPU throttle').toBeLessThan(BUDGET.frameP95Ms);
  // the sim step is CPU-only and must stay cheap everywhere
  expect(perf.stepMs.p95, 'p95 sim step time (all substeps of a frame)').toBeLessThan(12);

  if (existsSync('perf/previous.json')) {
    const prev = JSON.parse(readFileSync('perf/previous.json', 'utf-8')) as PerfResult;
    const regress = (name: string, now: number, before: number) => {
      if (before > 0 && now > before * 1.1) console.warn(`[perf] regression: ${name} ${before.toFixed(2)} -> ${now.toFixed(2)} (+${(((now - before) / before) * 100).toFixed(0)}%)`);
    };
    regress('frame p95', perf.frameMs.p95, prev.frameMs.p95);
    regress('step p95', perf.stepMs.p95, prev.stepMs.p95);
    regress('draw calls', perf.drawCalls.max, prev.drawCalls.max);
    regress('triangles', perf.triangles.max, prev.triangles.max);
    regress('heap max', perf.heapMb.max, prev.heapMb.max);
  }
});
