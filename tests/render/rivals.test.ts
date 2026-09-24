/**
 * The wanted board's cars and posters (M6 slices 4–5, docs/DESIGN.md §14.3):
 * every rival's own body on its class, drawn on its footprint; the Phantom's
 * lamps dark; the lowrider's hop only at a standstill; the posters on the
 * hideout's wall follow the board.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBodyGeometry } from '../../src/render/cars/bodyMesh';
import { BODY_PROFILES } from '../../src/render/cars/bodyProfiles';
import { boardGeometry, posterStates } from '../../src/render/run/HideoutView';
import { lowriderBounce } from '../../src/render/traffic/TrafficView';
import { BALANCE, CHIEF, RIVALS, RIVAL_BODIES, bodySpec, bodyTuning } from '../../src/sim';
import { CAR_PRESETS } from '../../src/sim/vehicle/presets';
import { createWorld } from '../sim/helpers';

const HEADLAMP = new THREE.Color(0xffefca);

function hasColour(g: THREE.BufferGeometry, c: THREE.Color): boolean {
  const col = g.getAttribute('color');
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(col.getX(i) - c.r) < 1e-3 && Math.abs(col.getY(i) - c.g) < 1e-3 && Math.abs(col.getZ(i) - c.b) < 1e-3) return true;
  }
  return false;
}

function countColour(g: THREE.BufferGeometry, c: THREE.Color): number {
  const col = g.getAttribute('color');
  let n = 0;
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(col.getX(i) - c.r) < 1e-3 && Math.abs(col.getY(i) - c.g) < 1e-3 && Math.abs(col.getZ(i) - c.b) < 1e-3) n++;
  }
  return n;
}

describe('the rivals\' cars', () => {
  it('M6 4.1 each rival\'s car is its own body on its class: the limo stretched, the bubble small, the bus big', () => {
    expect(RIVALS.map((r) => r.body)).toEqual([...RIVAL_BODIES]);
    const cls = { wagon: 'muscle', pizza: 'compact', wrecker: 'heavy', twin: 'sports', fakecop: 'police', partybus: 'heavy', lowrider: 'sports', limo: 'muscle', bubble: 'compact', phantom: 'sports', chiefcar: 'police' } as const;
    for (const b of RIVAL_BODIES) {
      expect(bodySpec(b).car, b).toBe(cls[b]);
      expect(BODY_PROFILES[b].name, b).toBe(b);
    }
    const limo = bodySpec('limo'), bubble = bodySpec('bubble');
    expect(limo.stretch).toBe(true);
    expect(limo.halfLength).toBeGreaterThan(3.2);
    expect(bodyTuning('limo').mass).toBe(limo.mass);
    expect(bodyTuning('limo').torqueMax).toBeCloseTo(CAR_PRESETS.muscle.torqueMax * limo.mass / CAR_PRESETS.muscle.mass, 6);
    expect(bubble.halfLength).toBeLessThan(1.6);
    expect(bubble.halfWidth).toBeLessThan(0.8);
    expect(bodySpec('partybus').big).toBe(true);
  });

  it('M6 4.2 won, each drives out of the garage as itself on its class', async () => {
    const sim = await createWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
    try {
      for (const b of RIVAL_BODIES) {
        sim.garage.own(b);
        expect(sim.garage.select(b)).toBe(true);
        sim.garage.applyToVehicle();
        expect(sim.carBody, b).toBe(b);
        expect(sim.carId, b).toBe(bodySpec(b).car);
        expect(sim.vehicle.tuning.chassisHalfExtents.z, b).toBeCloseTo(bodySpec(b).halfLength, 6);
      }
      // a rival's car is won, never kept at a door
      sim.garage.owned.delete('wagon');
      sim.run.bank = 1e6;
      expect(sim.garage.keep('wagon', 0)).toBe('locked');
    } finally { sim.dispose(); }
  }, 60_000);

  it('M6 5.1 the Phantom\'s lamps are dark; every other rival\'s car lights up', () => {
    for (const b of RIVAL_BODIES) {
      const g = buildBodyGeometry(BODY_PROFILES[b], bodyTuning(b));
      expect(hasColour(g, HEADLAMP), b).toBe(b !== 'phantom');
      g.dispose();
    }
  });

  it('M6 5.2 the lowrider hops only standing still, at most 7 cm', () => {
    let top = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      const y = lowriderBounce(t, 0, 0);
      expect(y).toBeGreaterThanOrEqual(0);
      top = Math.max(top, y);
      expect(lowriderBounce(t, 5, 0)).toBe(0);
    }
    expect(top).toBeGreaterThan(0.06);
    expect(top).toBeLessThanOrEqual(0.07 + 1e-9);
  });

  it('M6 5.3 the posters follow the board: beaten, the next, the rest waiting; a gold bar under each beaten one', () => {
    const states = posterStates(0b11, 2);
    expect(states.length).toBe(CHIEF + 1);
    expect(states.slice(0, 4)).toEqual(['beaten', 'beaten', 'next', 'waiting']);
    // the gold is also the Nephew's paint on his swatch: the beaten add their bars on top of it
    const gold = new THREE.Color(0xe2b33c);
    const none = boardGeometry(posterStates(0, 0));
    const two = boardGeometry(states);
    expect(countColour(two, gold)).toBeGreaterThan(countColour(none, gold));
    expect(two.getAttribute('position').count).toBeGreaterThan(none.getAttribute('position').count);
    none.dispose();
    two.dispose();
    expect(BALANCE.board.pace.length).toBe(CHIEF);
  });
});
