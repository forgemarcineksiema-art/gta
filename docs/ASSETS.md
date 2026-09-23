# Third-party assets

Every non-original asset in the build is listed here with its source URL and licence. Nothing without a clear licence goes in. Code dependencies are listed in `docs/ARCHITECTURE.md`, not here.

| Asset | Used for | Source | Licence | Added |
|---|---|---|---|---|
| (none yet) | | | | |

Everything in the current build is generated in code: the playground and seeded city (`src/sim/city/`), district landmarks and minimap, the cars (`src/render/carMesh.ts`), the sky, the engine/wind/skid audio (`src/audio/EngineAudio.ts`), the sirens and every sting (`src/audio/Sfx.ts`, `src/audio/Siren.ts`: the job, purchase, daily and streak sounds are oscillator notes), and the UI (system fonts only). No third-party art or runtime dependencies.

The music bed (`docs/M5_PLAN.md` slice 8) is not in M5: a track means downloading a third-party file, which needs Marcin's yes on the exact file, its source and its licence. The plan's hook stands (one CC0 loop fetched after `gameplayStart()`, through the master gain at -14 dB); BACKLOG holds it.
