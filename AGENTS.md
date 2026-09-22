# AGENTS.md

For any coding agent working in this repository (Cursor, Codex, Claude Code):

1. `CLAUDE.md` holds the standing rules: language (Polish to Marcin, English in
   the repo), layering, budgets, working method, where things live. Follow it
   regardless of which model you are. Its commit trailer names Claude; use a
   `Co-Authored-By:` line naming the model that actually did the work.
2. `docs/BRIEF.md` is the project brief and is read-only.
3. `docs/PROGRESS.md` is the session log; read the newest entry and the last
   15 commits before starting, and add your own entry before stopping.
4. Every remaining milestone has a written contract (M4: `docs/M4_PLAN.md`;
   M5: `docs/M5_PLAN.md`; M6: `docs/M6_PLAN.md`; the design behind them in
   `docs/DESIGN.md`; M3's was `docs/M3_PLAN.md`). A contract fixes scope,
   decisions, numbers, tests and the gate; work through its slices in order
   and stop only where it says to stop.
5. `npm run verify` must be green before your first edit and at every commit
   that ends a slice; `npm run verify:gate` (the long pins in
   `*.long.test.ts`) at a gate and at the commit of a slice that added one.
   Never loosen a test or a budget to get there.
6. Other agents or Marcin may have a dev server (port 5173) or a preview
   (4173) running in this folder: never kill processes you did not start.
   Scratch scripts and screenshots are never committed (`output/`, `screens/`,
   `perf/` are git-ignored).
