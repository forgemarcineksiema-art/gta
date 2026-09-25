/**
 * What a body drives like, measured on the playground's straight (M8.8 slice 4): the table the gate report carries and
 * the "best at" pins of the trophies and the new vehicles read. Not a test file: the long pins import it.
 */
import type { BodyId } from '../../src/sim/traffic/bodies';
import { createWorld, fullThrottle, kmh, position, run, runUntil } from './helpers';

export interface BodyRow {
  body: BodyId;
  /** Seconds from a standstill at full throttle; -1 when not reached in 25 s. */
  to60: number;
  to100: number;
  /** km/h at full throttle without boost, held on the straight until it stops rising. */
  top: number;
  /** Metres from 100 km/h to a stop on full brake; -1 when 100 is not reached. */
  brake100: number;
}

export async function measureBody(body: BodyId): Promise<BodyRow> {
  const sim = await createWorld({ spawn: 'straight', body });
  let to60 = -1, to100 = -1, top = 0;
  try {
    run(sim, 1);
    to60 = runUntil(sim, 25, (s) => kmh(s) >= 60, fullThrottle);
    if (to60 > 0) {
      const more = runUntil(sim, 25, (s) => kmh(s) >= 100, fullThrottle);
      to100 = more > 0 ? to60 + more : -1;
    }
    let last = -1;
    for (let i = 0; i < 120; i++) {
      run(sim, 1, (_t, c, s) => {
        c.throttle = 1;
        const p = position(s);
        if (p.z > 500) s.vehicle.body.setTranslation({ x: p.x, y: p.y, z: p.z - 500 }, true);
      });
      top = kmh(sim);
      if (top - last < 0.05) break;
      last = top;
    }
  } finally { sim.dispose(); }
  let brake100 = -1;
  if (to100 > 0) {
    const b = await createWorld({ spawn: 'straight', body });
    try {
      run(b, 1);
      runUntil(b, 25, (s) => kmh(s) >= 100, fullThrottle);
      const z0 = position(b).z;
      if (runUntil(b, 10, (s) => kmh(s) < 2, (_t, c) => (c.brake = 1)) > 0) brake100 = position(b).z - z0;
    } finally { b.dispose(); }
  }
  return { body, to60, to100, top, brake100 };
}
