/**
 * The port the e2e suites serve the build on (CLAUDE.md, Two milestones at once). The main folder keeps 4173, where
 * `npm start` plays and may already answer with the same checkout's build; a linked git worktree (its `.git` is a
 * file) gets its own port from its folder's name, 4200–4299, so two sessions' suites and Marcin's game never answer for
 * one another: Playwright reuses whatever answers on its port. `E2E_PORT` overrides both.
 */
import { statSync } from 'node:fs';
import { basename, join } from 'node:path';

export const MAIN_PORT = 4173;

/** A worktree folder's name to a port in 4200–4299 (FNV-1a). */
export function worktreePort(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 4200 + (h % 100);
}

/** A linked worktree's `.git` is a file pointing at the main repository's; the main folder's is a directory. */
export function isLinkedWorktree(root: string): boolean {
  try {
    return statSync(join(root, '.git')).isFile();
  } catch {
    return false;
  }
}

export function e2ePort(root: string = process.cwd(), env: Record<string, string | undefined> = process.env): number {
  const forced = Number(env['E2E_PORT']);
  if (Number.isInteger(forced) && forced > 0) return forced;
  return isLinkedWorktree(root) ? worktreePort(basename(root)) : MAIN_PORT;
}
