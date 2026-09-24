/**
 * The e2e port (CLAUDE.md, Two milestones at once): each checkout serves its own build, so a suite never tests
 * another session's build or Marcin's game.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MAIN_PORT, e2ePort, worktreePort } from '../../e2e/port';

describe('e2e port', () => {
  test('the main folder keeps 4173; a linked worktree takes its own port from its name', () => {
    const base = mkdtempSync(join(tmpdir(), 'e2e-port-'));
    const main = join(base, 'main');
    mkdirSync(join(main, '.git'), { recursive: true });
    const tree = join(base, 'm8.8-fleet');
    mkdirSync(tree);
    writeFileSync(join(tree, '.git'), 'gitdir: elsewhere');
    expect(e2ePort(main, {})).toBe(MAIN_PORT);
    const port = e2ePort(tree, {});
    expect(port).toBe(worktreePort('m8.8-fleet'));
    expect(port).toBeGreaterThanOrEqual(4200);
    expect(port).toBeLessThan(4300);
  });

  test('the two milestones\' worktrees never share a port', () => {
    expect(worktreePort('m8.8-fleet')).not.toBe(worktreePort('m8.9-ui'));
  });

  test('E2E_PORT overrides the checkout', () => {
    expect(e2ePort('/nowhere', { E2E_PORT: '4999' })).toBe(4999);
  });
});
