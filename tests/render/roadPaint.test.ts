import { expect, it } from 'vitest';
import { Color } from 'three';
import { cityGeometry } from '../../src/render/city/CityView';
import { Architecture } from '../../src/sim/city/architecture';
import { PALETTE } from '../../src/sim/palette';
import type { StaticDesc } from '../../src/sim/scene';

it('merges paint as two non-shadow triangles and preserves its linear underlay at both detail levels', () => {
  const statics: StaticDesc[] = [], a = new Architecture(statics);
  a.box(0, 2, 0, 1, 2, 1, PALETTE.kerb, 'building');
  const paint = a.box(0, 0.063, 0, 1.5, 0.001, 0.12, PALETTE.roadWhite, 'paint-parking-divider', 'top');
  paint.paint = { underlay: PALETTE.asphaltBay, fadeEnd: 52 };
  for (const detail of [true, false]) {
    const geometry = cityGeometry(statics, detail);
    try {
      expect(geometry.getAttribute('position').count).toBe(42);
      expect(geometry.userData['shadowVertices']).toBe(36);
      const attr = geometry.getAttribute('roadPaint'), colour = new Color(PALETTE.asphaltBay);
      for (let i = 0; i < 36; i++) expect(attr.getW(i)).toBe(0);
      for (let i = 36; i < 42; i++) {
        expect(Math.abs(attr.getX(i) - colour.r)).toBeLessThan(1 / 255);
        expect(Math.abs(attr.getY(i) - colour.g)).toBeLessThan(1 / 255);
        expect(Math.abs(attr.getZ(i) - colour.b)).toBeLessThan(1 / 255);
        expect(attr.getW(i) * 255).toBe(52);
      }
    } finally { geometry.dispose(); }
  }
});
