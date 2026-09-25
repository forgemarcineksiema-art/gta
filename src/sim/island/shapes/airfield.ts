/**
 * The airfield's and the islet's shapes in the ground (M8.10 slice 12, docs/M8.10_PLAN.md): the islet's landing slope.
 * Its ground falls away from the mega-ramp down the flight: whole at the top of its northern beach (a car short of it
 * meets that beach, never a crest to throw it again), down to `drop` m lower at the southern end of its sand, where its
 * beach takes it on down to the sea.
 */
import { PLACES } from '../plan';

/** The landing slope (m): how far it falls, from where to where along the flight (m past the ramp's lip). */
export const LANDING = { drop: 1.2, top: 195, foot: 250 } as const;

const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const RAMP = PLACES.megaRamp;
const FX = Math.sin(RAMP.yaw), FZ = Math.cos(RAMP.yaw);
/** The islet's box, round the flight's line (m either side), and along it. */
const ACROSS = 70;

export function airfieldShape(x: number, z: number, h: number): number {
  const dx = x - RAMP.x, dz = z - RAMP.z, u = dx * FX + dz * FZ, L = LANDING;
  if (u <= L.top || u > L.foot + 80 || Math.abs(dx * FZ - dz * FX) > ACROSS) return h;
  return h - L.drop * smooth01((u - L.top) / (L.foot - L.top));
}
