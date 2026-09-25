/**
 * What the car in the showroom shows (docs/M8.9_PLAN.md R10): its paint and what it wears in each kit slot, and, while
 * a card on the wall's STYLE page is focused, that card's paint or item in its place: drawn only, the garage and the
 * kit untouched. Leaving the card shows what it wears again; buying it makes it what it wears. Pure: the wall says the
 * preview, the render draws the look.
 */
import { isShell } from '../traffic/bodies';
import type { SimWorld } from '../SimWorld';
import { KIT, isCarSlot, type KitSlot } from './kit';

/** The slots a look holds, in the STYLE page's order. */
export const LOOK_SLOTS: readonly KitSlot[] = ['wheels', 'spoiler', 'stance', 'topper', 'neon', 'horn', 'flame', 'smoke'];

/** The focused card: a paint (0xRRGGBB) or a `KIT` index; -1 for neither. */
export interface Preview {
  paint: number;
  item: number;
}

export function newPreview(): Preview {
  return { paint: -1, item: -1 };
}

/** The car's paint and each slot's `KIT` index (-1 none). */
export interface CarLook {
  paint: number;
  items: Record<KitSlot, number>;
}

export function newLook(): CarLook {
  return { paint: 0, items: { wheels: -1, spoiler: -1, stance: -1, topper: -1, neon: -1, horn: -1, flame: -1, smoke: -1 } };
}

/**
 * The look into `out`: the paint the car shows at the door (a shell the garage's, another the paint it came in), each
 * slot what the car wears; a preview's paint or item (one that fits the car) in its place. No allocation.
 */
export function carLook(sim: SimWorld, preview: Preview | null, out: CarLook): CarLook {
  const body = sim.carBody;
  out.paint = isShell(body) && sim.run.state === 'door' ? sim.garage.paintOf(body) : sim.carPaint;
  for (const slot of LOOK_SLOTS) out.items[slot] = sim.kit.worn(slot);
  if (!preview) return out;
  if (preview.paint >= 0) out.paint = preview.paint;
  const k = preview.item >= 0 ? KIT[preview.item] : undefined;
  if (k && (!isCarSlot(k.slot) || sim.kit.fits(preview.item, body))) out.items[k.slot] = preview.item;
  return out;
}
