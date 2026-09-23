# AGENTS.md

For any coding agent working in this repository (Cursor, Codex, Claude Code):

1. `CLAUDE.md` holds the standing rules: language (Polish to Marcin, English in
   the repo), layering, budgets, working method, where things live. Follow it
   regardless of which model you are. Its commit trailer names Claude; use a
   `Co-Authored-By:` line naming the model that actually did the work.
2. `docs/BRIEF.md` is the project brief and is read-only.
3. `docs/PROGRESS.md` is the session log; read the newest entry and the last
   15 commits before starting, and add your own entry before stopping.
4. Every remaining milestone has a written contract (now `docs/M5.5_PLAN.md`,
   the whole game before the platform; then `docs/M6_PLAN.md`, the wanted
   board, and `docs/M7_PLAN.md`, the platform; the design
   behind them in `docs/DESIGN.md`; the finished ones `docs/M3_PLAN.md`,
   `M4_PLAN.md`, `M5_PLAN.md`). A contract fixes scope,
   decisions, numbers, tests and the gate; work through its slices in order
   and stop only where it says to stop.
5. `npm run verify` must be green before your first edit and at every commit
   that ends a slice; `npm run verify:gate` (the long pins in
   `*.long.test.ts`) at a gate. Nothing else per slice: no perf runs, e2e
   suites, screens, browser checks, bot measurements or research between
   slices (`CLAUDE.md`, Pace). Never loosen a test or a budget to get green.
6. `npm start` (port 4173, the production build) is the one way to play the
   game; `npm run dev` (5173) is for editing. Other agents or Marcin may have
   either running in this folder: never kill processes you did not start, and
   stop the ones you started before you finish. Scratch scripts and
   screenshots are never committed (`output/`, `screens/`, `perf/` are
   git-ignored); `docs/DEV.md` has the details.
