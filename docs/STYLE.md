# Style guide

One page. Everything visual in the game comes back to this. The palette itself is code: `src/sim/palette.ts`.

## The look in one sentence

**A candy-coloured low-poly city at the last hour of a summer evening**: warm low sun, long shadows, peach-to-violet sky, pink haze in the distance, cars in saturated paint. Cheerful, fast, slightly ridiculous. Not gritty, not neon-night, not the grey default look.

Why this and not another: the golden hour gives strong directional shadows (speed and shape read better than under flat noon light), the tinted fog hides draw distance for free, and a warm/violet thumbnail stands out in a CrazyGames grid full of blue-grey screenshots.

## Time of day and lighting

- Fixed time of day: late golden hour. No day/night cycle in v1 (a cycle costs lighting variants and makes every screenshot inconsistent).
- One directional sun (`PALETTE.sun`, intensity ~2.2) low in the sky, from the front-left of the default spawn so the car's near side is lit. A hemisphere light with a warm sky colour and a violet ground colour fills the shadows.
- Shadows: one 2048 shadow map following the player, ~60 m half-extent. Nothing else casts dynamic shadows on the low tier.
- Fog: linear, `PALETTE.fog` (peach-pink), starting ~120 m, opaque at ~700 m. Fog colour and sky horizon are close so the world dissolves into the sky.
- Sky: an inverted vertex-coloured sphere, `skyHorizon` → `skyTop` with a power curve, no texture.

## Geometry and materials

- Low-poly, flat-shaded (`flatShading: true`), vertex colours or plain material colour from the palette. No textures per asset, ever. One merged mesh per chunk for statics.
- Silhouettes do the work: cars are recognisable from their block-out (long bonnet + small cabin = muscle; tall box = van). Details are extra boxes, not detail geometry.
- Palette (hex, sRGB):

| Role | Colour | Role | Colour |
|---|---|---|---|
| asphalt | `#3a3a46` | car red | `#ff3b5c` |
| asphalt light | `#4a4a58` | car lime | `#b6f542` |
| lane mark | `#f2e9d8` | car blue | `#2bd1ff` |
| kerb | `#c9c3b3` | car orange | `#ff9f1c` |
| concrete | `#9a938a` | car magenta | `#f45bff` |
| sand | `#d9b57a` | car white | `#f7f3ea` |
| grass | `#7fae5a` | car black | `#1c1b22` |
| water | `#3fa7c9` | tyre / rim | `#15151a` / `#c4c4cd` |
| glass | `#9fd8ff` | police | `#f7f3ea` + `#1d4ed8` |
| ramp | `#e5533d` | sky top | `#2b1b5a` |
| cone | `#ff8a2b` | sky horizon | `#ff8a5b` |
| barrier | `#f7f3ea` | sun / fog | `#ffd27a` / `#e8a07a` |

- Blacks and greys for trim, rubber and metal, darkest to lightest: ink `#0c0c10`, rubber `#15151a`, charcoal `#25252c`, graphite `#35353e`, slate `#4a4a55`, steel `#6d6d78`, silver `#9d9da8`, light grey `#c4c4cd`, chrome `#e4e4ea`. A car uses at least three of them (pillars/seams in ink or charcoal, rims in graphite with light-grey spokes, badges and exhaust tips in chrome) so it does not read as one flat block of paint.
- Districts (M2) each get one dominant building hue family from this palette plus one accent, so they read as different places from the minimap and from the road.

## UI

- Plain DOM over the canvas. Typography: a heavy italic system sans for numbers and titles (`Segoe UI` 900 italic → falls back to Helvetica/Arial/system-ui), 600 weight for body text. No web fonts (bytes, offline, licensing).
- Colours: ink `#f7f3ea`, accent yellow `#ffd23f`, accent cyan `#2bd1ff`, danger `#ff3b5c`, panel `rgba(22,14,40,0.78)`.
- Skew important elements slightly (-8° to -14°) for motion; drop shadows in flat black, never blur glows.
- Text shadow on everything over the 3D view for legibility on both peach sky and dark asphalt.
- Minimum sizes at DPR 1: primary numbers ≥ 44 px, labels ≥ 12 px bold uppercase with tracking. Verify with `npm run screens`.
- Keycaps: white rounded rectangles with dark text, always beside a one-word label.

## Camera and motion

- Chase camera behind and above, FOV 60 → up to ~92 with speed and boost, pulls back and drops with speed, follows the velocity direction so drifts show the car sideways. Tiny shake at high speed. See `src/render/ChaseCamera.ts`.
- Speed lines: a screen-space pass of short streaks rushing outward from the frame's periphery above ~100 km/h and under boost (cyan lean). The centre of the frame, where the road is, is masked out; nothing is ever drawn in front of the car. This is how Burnout/NFS/Mario Kart do it: FOV, camera, peripheral blur or lines, sound; world particles only behind or beside the car.

## Tone

Slapstick. Drivers shake fists, cones fly, police are pompous and unlucky. Text is short, playful and never sarcastic at the player's expense.
