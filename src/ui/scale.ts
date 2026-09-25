/**
 * The HUD's one scale (docs/M8.9_PLAN.md R3): every size of the screen's rules is in rem, and the root's font size is
 * 16 px times the window's height over 720, held between 0.85 and 1.5 (450 px tall: 0.85; 720: 1; 1080: 1.5). So the
 * whole screen, the radar and the wall with it, keeps its share of the picture at any size, and a label (1 rem at
 * least) never drops under 13.6 px. The dev panel keeps its pixels.
 */
export const HUD_SCALE = { base: 720, min: 0.85, max: 1.5, rootPx: 16 } as const;

/** The scale for a window's height (CSS px). */
export function hudScale(height: number): number {
  return Math.min(HUD_SCALE.max, Math.max(HUD_SCALE.min, height / HUD_SCALE.base));
}

/** The root's font size for a window's height, in CSS px. */
export function rootFontPx(height: number): number {
  return HUD_SCALE.rootPx * hudScale(height);
}

/** Sets the root's font size now and on every resize; returns the listener's removal. */
export function applyHudScale(win: Window = window): () => void {
  const set = (): void => {
    win.document.documentElement.style.fontSize = `${rootFontPx(win.innerHeight).toFixed(2)}px`;
  };
  set();
  win.addEventListener('resize', set);
  return () => win.removeEventListener('resize', set);
}
