/**
 * Sunset Works' set pieces moved from the grid (M8.10 slice 9, docs/M8.10_PLAN.md): the Waterworks (the grid's
 * landmark for the district) and the port crane (the one the grid's mega-ramp climbs beside). The grid builds them at
 * its own places until the switch, the island at the plan's. Statics in the grid's kit, standing on the ground at 0.
 */
import { CITY_COLORS, type Architecture } from '../../city/architecture';
import { PALETTE } from '../../palette';

/** The Waterworks about (px, pz): four legs under the tank, its top, and the works chimney beside it. */
export function waterworks(kit: Architecture, px: number, pz: number, accent: number, body: number): void {
  const box = kit.box.bind(kit), cylinder = kit.cylinder.bind(kit);
  for (const a of [-8, 8]) for (const b of [-8, 8]) box(px + a, 15, pz + b, 1, 15, 1, accent, 'building');
  cylinder(px, 34, pz, 14, 6, body);
  box(px, 40.5, pz, 14, 0.5, 14, accent);
  // The works chimney: the tallest thing in the north-east, striped at the top.
  cylinder(px + 30, 33, pz - 30, 2.4, 33, CITY_COLORS.brick);
  cylinder(px + 30, 62, pz - 30, 2.6, 1.5, accent);
  cylinder(px + 30, 66, pz - 30, 2.6, 1.5, PALETTE.laneMark);
  box(px + 30, 3, pz - 30, 4, 3, 4, CITY_COLORS.brick, 'building');
}

/**
 * A port crane at (x, z): a gantry of four orange legs, its sills and crossbeams, the cab, and the boom out along its +X
 * (turned by `yaw` about the middle, the grid's own way round when 0). Drawn only.
 */
export function portCrane(kit: Architecture, x: number, z: number, yaw = 0): void {
  const box = kit.box.bind(kit), orange = PALETTE.carOrange, start = kit.statics.length;
  // built in place when unturned (the grid's statics exactly), else about the origin and turned there
  const ox = yaw === 0 ? x : 0, oz = yaw === 0 ? z : 0;
  for (const side of [-1, 1]) {
    for (const end of [-7, 7]) box(ox + side * 7.5, 11, oz + end, 0.6, 11, 0.6, orange);
    box(ox + side * 7.5, 22.3, oz, 0.7, 0.7, 7.7, orange);
  }
  for (const end of [-7, 7]) box(ox, 22.9, oz + end, 8.2, 0.6, 0.6, orange);
  box(ox + 2, 20.6, oz, 1.5, 1.2, 1.6, PALETTE.charcoal);
  box(ox + 22, 24.2, oz, 30, 0.6, 1.3, orange);
  if (yaw !== 0) kit.rotateFrom(start, x, z, yaw);
}
