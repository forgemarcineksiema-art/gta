# Third-party assets

Every non-original asset in the build is listed here with its source URL and licence. Nothing without a clear licence goes in. Code dependencies are listed in `docs/ARCHITECTURE.md`, not here.

| Asset | Used for | Source | Licence | Added |
|---|---|---|---|---|
| Rubik, three faces: Bold 700, Black 900, Black Italic 900 (`public/fonts/rubik-700.woff2`, `rubik-900.woff2`, `rubik-900i.woff2`, 50 KB together) | The screen's one typeface (docs/M8.9_PLAN.md R2, slice 6): the labels in Bold, the display and the maps' words in Black | github.com/google/fonts, `ofl/rubik/Rubik[wght].ttf` and `Rubik-Italic[wght].ttf` (the variable fonts: the static TTFs the plan named are not published there any more); © 2015 The Rubik Project Authors (github.com/googlefonts/rubik) | SIL Open Font License 1.1, its text beside the files (`public/fonts/OFL.txt`) | 2026-09-25, M8.9 slice 6 |

Rubik's faces were made once with fontTools 4 from the variable fonts: `fontTools.varLib.instancer` at wght 700 and 900 (instance names updated), then `pyftsubset` to woff2 with the default layout features plus `tnum`, no hinting, name IDs 0–6, and these ranges (`src/ui/fonts.ts` FONT_RANGES, pinned by `tests/ui/fonts.test.ts`): U+20-7E, U+A0-FF, U+104-107, U+118-119, U+141-144, U+15A-15B, U+179-17C, U+2013-2014, U+2018-2019, U+201C-201E, U+2026, U+2039-203A. Rubik has no ★: the screen draws the HUD's star inline (`src/ui/hud/stars.ts`). A character outside the ranges falls to the system's sans.

Everything else in the current build is generated in code: the playground and seeded city (`src/sim/city/`), district landmarks and minimap, the cars (`src/render/cars/carMesh.ts`), the sky, the engine/wind/skid audio (`src/audio/EngineAudio.ts`), the sirens and every sting (`src/audio/Sfx.ts`, `src/audio/Siren.ts`: the job, purchase, daily and streak sounds are oscillator notes). No third-party art or runtime dependencies.

The music bed (`docs/history/M5_PLAN.md` slice 8) is not in M5: a track means downloading a third-party file, which needs Marcin's yes on the exact file, its source and its licence. The plan's hook stands (one CC0 loop fetched after `gameplayStart()`, through the master gain at -14 dB); BACKLOG holds it.
