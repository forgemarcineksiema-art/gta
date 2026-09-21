# AGENTS.md

For any coding agent working in this repository (Cursor, Codex, Claude Code):

1. `CLAUDE.md` holds the standing rules: language (Polish to Marcin, English in
   the repo), layering, budgets, working method, where things live. Follow it
   regardless of which model you are. Its commit trailer names Claude; use the
   `Co-Authored-By:` line for the model that actually did the work.
2. `docs/BRIEF.md` is the project brief and is read-only.
3. `docs/PROGRESS.md` is the session log; read the newest entry and the last
   15 commits before starting, and add your own entry before stopping.
4. The current milestone contract is `docs/M3_PLAN.md`. It fixes scope,
   decisions, contracts, numbers, tests and the gate; work through its slices
   in order and stop only where it says to stop.
5. `npm run verify` must be green before your first edit and at every commit
   that ends a slice.
