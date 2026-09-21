/** Metre-based street architecture. Render descriptors only; solids stay simple in Rapier. */
import { IDENTITY_QUAT, quatFromYaw, type StaticDesc, type BoxFace } from '../scene';
import { CITY_COLORS, PALETTE } from '../palette';
export { CITY_COLORS } from '../palette';

export class Architecture {
  constructor(readonly statics: StaticDesc[]) {}

  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, color: number, tag = 'decor', face?: BoxFace): StaticDesc {
    const st: StaticDesc = { shape: { kind: 'box', hx, hy, hz }, position: { x, y, z }, rotation: IDENTITY_QUAT, color, tag, ...(face ? { face } : {}) };
    this.statics.push(st);
    return st;
  }

  cylinder(x: number, y: number, z: number, radius: number, halfHeight: number, color: number): void {
    this.statics.push({ shape: { kind: 'cylinder', radius, halfHeight }, position: { x, y, z }, rotation: IDENTITY_QUAT, color, tag: 'decor' });
  }

  tree(x: number, z: number, palm = false): void {
    this.cylinder(x, 2.5, z, 0.24, 2.35, 0x8b7966);
    if (palm) {
      // A narrow trunk and four broad fronds give the quay its own street silhouette.
      this.box(x, 5, z, 3.2, 0.15, 0.7, CITY_COLORS.hedge);
      this.box(x, 5.2, z, 0.7, 0.15, 3.2, CITY_COLORS.leaves);
      this.cylinder(x, 5.4, z, 1.2, 0.45, CITY_COLORS.hedge);
    } else {
      this.cylinder(x, 4.8, z, 2.7, 1.2, CITY_COLORS.hedge);
      this.cylinder(x + 0.5, 6.25, z, 2, 0.75, CITY_COLORS.leaves);
      this.cylinder(x - 1.8, 4.3, z + 0.5, 1.4, 0.8, CITY_COLORS.leaves);
    }
  }

  /** Shipping container, 12 × 2.6 × 2.4 m, solid; `tier` stacks it. */
  container(x: number, z: number, yaw: number, colour: number, tier = 0): void {
    const start = this.statics.length;
    const y = 0.14 + 1.3 + tier * 2.6;
    this.box(0, y, 0, 6, 1.3, 1.2, colour, 'building');
    // Corrugation reads as four dark ribs per side; doors at one end.
    for (const side of [-1, 1]) for (const u of [-4.5, -1.5, 1.5, 4.5]) this.box(u, y, side * 1.21, 0.08, 1.2, 0.02, CITY_COLORS.roof, 'decor', side > 0 ? 'z+' : 'z-');
    this.box(6.02, y, 0, 0.02, 1.15, 1.1, CITY_COLORS.roof, 'decor', 'x+');
    this.rotateFrom(start, x, z, yaw);
  }

  /** Vertical storage tank on a plinth with a top band. */
  tank(x: number, z: number, radius: number, height: number, colour: number, band: number): void {
    this.box(x, 0.3, z, radius + 0.6, 0.16, radius + 0.6, CITY_COLORS.roof, 'building');
    this.cylinder(x, 0.46 + height / 2, z, radius, height / 2, colour);
    this.cylinder(x, 0.46 + height - 0.4, z, radius + 0.08, 0.35, band);
    this.cylinder(x, 0.46 + height + 0.25, z, radius * 0.35, 0.3, CITY_COLORS.roof);
    this.box(x + radius + 0.2, 0.46 + height / 2, z, 0.12, height / 2, 0.5, CITY_COLORS.roof);
  }

  /** Gantry crane: two A-legs and a beam spanning `span` across local X. */
  gantry(x: number, z: number, yaw: number, span: number, colour: number): void {
    const start = this.statics.length;
    for (const side of [-1, 1]) {
      this.box(side * span / 2, 5, 0, 0.35, 5, 0.35, colour, 'building');
      this.box(side * span / 2, 0.6, 0, 1.4, 0.45, 1.4, CITY_COLORS.roof, 'building');
    }
    this.box(0, 10.4, 0, span / 2 + 0.8, 0.45, 0.6, colour);
    this.box(span * 0.2, 9.4, 0, 1.2, 0.55, 0.9, CITY_COLORS.roof);
    this.box(span * 0.2, 6.5, 0, 0.05, 2.4, 0.05, CITY_COLORS.roof);
    this.box(span * 0.2, 3.8, 0, 0.6, 0.3, 0.6, CITY_COLORS.trim);
    this.rotateFrom(start, x, z, yaw);
  }

  /** Chain-link fence run along local X: posts every 6 m and a top rail. */
  fence(x: number, z: number, yaw: number, length: number): void {
    const start = this.statics.length;
    for (let u = -length / 2; u <= length / 2; u += 6) this.box(u, 1.1, 0, 0.06, 1.1, 0.06, CITY_COLORS.roof);
    this.box(0, 2.15, 0, length / 2, 0.04, 0.04, CITY_COLORS.roof);
    this.box(0, 1.1, 0, length / 2, 0.95, 0.001, 0x6f7078, 'decor', 'z+');
    this.rotateFrom(start, x, z, yaw);
  }

  /** Floodlight mast for yards and quays. */
  mast(x: number, z: number): void {
    this.box(x, 7, z, 0.2, 7, 0.2, 0x686678);
    this.box(x, 14.2, z, 1.1, 0.25, 0.5, CITY_COLORS.roof);
    this.box(x, 14.55, z, 1.0, 0.1, 0.45, PALETTE.laneMark);
  }

  /**
   * A building whose street face (local -Z) looks along `yaw`: generated in its
   * own frame, then every member is moved and given the same rotation, so the
   * facade logic never knows the building is not axis aligned.
   */
  rotatedBuilding(x: number, z: number, yaw: number, hx: number, hz: number, district: string, floors: number, variant: number, accent: number): void {
    const start = this.statics.length;
    this.building(0, 0, hx, hz, district, 1, 1, floors, variant, accent, false, true);
    this.rotateFrom(start, x, z, yaw);
  }

  /** Move every static generated since `start` (built about the origin) to (x, z) facing `yaw`. */
  rotateFrom(start: number, x: number, z: number, yaw: number): void {
    const cos = Math.cos(yaw), sin = Math.sin(yaw), rot = quatFromYaw(yaw);
    for (let i = start; i < this.statics.length; i++) {
      const st = this.statics[i] as StaticDesc;
      const lx = st.position.x, lz = st.position.z;
      st.position = { x: x + cos * lx + sin * lz, y: st.position.y, z: z - sin * lx + cos * lz };
      st.rotation = rot;
    }
  }

  /**
   * The collider encloses the building, but the rendered walls are a core, piers
   * and spandrels. Openings are actual voids in that outer shell; glazing lives
   * behind it. No window or balcony is pasted onto an unbroken outer box.
   */
  building(x: number, z: number, hx: number, hz: number, district: string, sx: number, sz: number, floors: number, variant: number, accent: number, streetX = true, streetZ = true): void {
    const c = CITY_COLORS;
    const industrial = district === 'foundry', house = district === 'gardens';
    const marina = district === 'marina', office = district === 'crown';
    const ground = industrial ? 5.4 : house ? 2.9 : 3.8;
    const height = ground + (floors - 1) * 3.1;
    const colors = office ? [c.stone, c.lavender, c.chalk] : industrial ? [c.brick, c.stone, c.yard] : house ? [c.chalk, c.mint, c.peach] : [c.peach, c.chalk, c.mint];
    const body = colors[variant % colors.length] as number;
    const loggiaAxis = streetX ? 'x' : 'z';
    const loggia = marina && variant !== 1;
    const shellDepth = loggia ? 1.45 : 0.38;
    this.statics.push({ shape: { kind: 'box', hx, hy: height / 2, hz }, position: { x, y: height / 2 + 0.14, z },
      rotation: IDENTITY_QUAT, color: body, tag: 'building', collisionOnly: true });
    this.box(x, height / 2 + 0.14, z, hx - shellDepth, height / 2, hz - shellDepth, body);
    this.box(x, 0.3, z, hx + 0.04, 0.16, hz + 0.04, c.roof);
    this.box(x, height + 0.27, z, hx + 0.24, 0.13, hz + 0.24, c.trim);
    this.box(x, height + 0.44, z, hx - 0.32, 0.05, hz - 0.32, c.roof);

    for (const axis of ['x', 'z'] as const) for (const sign of [-1, 1]) {
      const street = axis === 'x' ? streetX && sign === -sx : streetZ && sign === -sz;
      // X walls own the corners; Z walls stop at their inner faces.
      const span = axis === 'x' ? hz : hx - shellDepth;
      const radius = axis === 'x' ? hx : hz;
      const face = `${axis}${sign > 0 ? '+' : '-'}` as BoxFace;
      // Local facade coordinates: u = horizontal, depth = outward from the wall.
      // Solids have explicit front/back depths; a surface has precisely one depth.
      const solid = (u: number, y: number, w: number, h: number, front: number, back: number, color: number) => {
        const depth = (front + back) / 2, thickness = (front - back) / 2;
        return this.box(axis === 'x' ? x + sign * (radius + depth) : x + u, y,
          axis === 'z' ? z + sign * (radius + depth) : z + u,
          axis === 'x' ? thickness : w, h, axis === 'z' ? thickness : w, color);
      };
      const surface = (u: number, y: number, w: number, h: number, depth: number, color: number, detailOnly = false) => {
        const st = this.box(axis === 'x' ? x + sign * (radius + depth) : x + u, y,
          axis === 'z' ? z + sign * (radius + depth) : z + u,
          axis === 'x' ? 0.001 : w, h, axis === 'z' ? 0.001 : w, color, 'decor', face);
        st.detailOnly = detailOnly;
        return st;
      };
      const ends: readonly [BoxFace, BoxFace] = axis === 'x' ? ['z+', 'z-'] : ['x+', 'x-'];
      const wall = (u: number, y: number, w: number, h: number, color: number, band: boolean) => {
        const st = solid(u, y, w, h, 0, -shellDepth, color);
        // Full-span X bands own the corner: without end caps the corner is open
        // and the underside of the neighbouring wall's band shows through.
        const capped = axis === 'x' && w >= span - 1e-6;
        st.faces = band ? [face, 'top', 'bottom', ...(capped ? ends : [])] : [face, ...ends];
        st.farFace = face;
      };
      // Sills, mullions, shutters: only their visible sides, no shadow pass, and
      // omitted at distance where they are below one pixel.
      const trim = (u: number, y: number, w: number, h: number, front: number, back: number, color: number, faces: BoxFace[]) => {
        const st = solid(u, y, w, h, front, back, color);
        st.faces = faces; st.tag = 'trim'; st.detailOnly = true;
        return st;
      };
      const glazing = (u: number, bottom: number, width: number, top: number, depth: number, frame: boolean, door = false) => {
        const mid = (bottom + top) / 2, half = (top - bottom) / 2;
        surface(u, mid, width / 2, half, depth, c.window).tag = 'glazing';
        // Frames sit within the opening, not across the outer plaster face.
        const trim = house ? c.trim : c.roof;
        surface(u - width / 2 + 0.045, mid, 0.045, half, depth + 0.02, trim, true);
        surface(u + width / 2 - 0.045, mid, 0.045, half, depth + 0.02, trim, true);
        surface(u, bottom + 0.045, width / 2, 0.045, depth + 0.02, trim, true);
        surface(u, top - 0.045, width / 2, 0.045, depth + 0.02, trim, true);
        if (frame) surface(u, mid, 0.035, half, depth + 0.025, trim, true);
        if (door) surface(u + 0.22, bottom + 1.05, 0.025, 0.12, depth + 0.035, c.trim, true);
      };
      // Fill the wall around a row of openings. The two full-width bands and
      // shared piers provide all four reveal surfaces, without overlapping decals.
      const row = (base: number, top: number, openings: Array<{ u: number; width: number; bottom: number; top: number }>, depth: number, wallColor: number) => {
        const low = Math.min(...openings.map((o) => o.bottom));
        const high = Math.max(...openings.map((o) => o.top));
        if (low > base) wall(0, (base + low) / 2, span, (low - base) / 2, wallColor, true);
        if (top > high) wall(0, (top + high) / 2, span, (top - high) / 2, wallColor, true);
        let left = -span;
        for (const opening of openings) {
          const a = opening.u - opening.width / 2, b = opening.u + opening.width / 2;
          if (a > left) wall((left + a) / 2, (low + high) / 2, (a - left) / 2, (high - low) / 2, wallColor, false);
          if (opening.bottom > low) wall(opening.u, (low + opening.bottom) / 2, opening.width / 2, (opening.bottom - low) / 2, wallColor, true);
          if (opening.top < high) wall(opening.u, (high + opening.top) / 2, opening.width / 2, (high - opening.top) / 2, wallColor, true);
          glazing(opening.u, opening.bottom, opening.width, opening.top, depth, opening.width > 1.7, opening.bottom < base + 0.3);
          left = b;
        }
        if (left < span) wall((left + span) / 2, (low + high) / 2, (span - left) / 2, (high - low) / 2, wallColor, false);
      };

      if (!street) {
        // Party/service walls have broad blank areas and a narrow stairwell stack.
        // The side elevation intentionally does not clone the shopfront or balconies.
        for (let floor = 0; floor < floors; floor++) {
          const base = floor === 0 ? 0.14 : ground + (floor - 1) * 3.1 + 0.14;
          const top = floor === 0 ? ground + 0.14 : base + 3.1;
          const openings = [{ u: -span * 0.5, width: industrial ? 3.2 : house ? 1.3 : 2.1, bottom: top - 1.65, top: top - 0.45 },
            { u: span * 0.5, width: industrial ? 2.4 : 1.15, bottom: top - 1.45, top: top - 0.45 }];
          row(base, top, openings, -shellDepth + 0.03, body);
        }
        continue;
      }

      // Ground floor: a small set of planned bays, with a centred entrance.
      const entryWidth = house ? 1.1 : 1.8;
      const groundOpenings = [
        { u: -span * 0.56, width: industrial ? span * 0.55 : house ? 1.8 : span * 0.55, bottom: industrial ? 0.2 : house ? 1.05 : 0.65, top: industrial ? 4.35 : house ? 2.35 : 3.05 },
        { u: 0, width: entryWidth, bottom: 0.2, top: 2.5 },
        { u: span * 0.56, width: industrial ? span * 0.55 : house ? 1.8 : span * 0.55, bottom: industrial ? 0.2 : house ? 1.05 : 0.65, top: industrial ? 4.35 : house ? 2.35 : 3.05 },
      ];
      row(0.14, ground + 0.14, groundOpenings, -shellDepth + 0.03, industrial ? c.brick : house ? body : c.stone);
      if (industrial) {
        // Roller shutters are recessed into the loading openings; canopy covers a service bay.
        for (const u of [-span * 0.56, span * 0.56]) {
          surface(u, 2.275, span * 0.275, 2.075, -0.28, c.roof);
          for (const y of [0.9, 1.7, 2.5, 3.3, 4.1]) surface(u, y, span * 0.27, 0.025, -0.26, c.yard);
        }
        solid(-span * 0.56, 4.55, span * 0.32, 0.12, 1.6, -0.2, accent);
      } else {
        solid(0, 2.68, house ? 0.9 : 1.35, 0.12, house ? 0.9 : 1.2, -0.1, house ? c.trim : accent);
        if (!house) solid(0, ground - 0.1, span + 0.08, 0.12, 0.25, -0.12, c.trim);
      }

      for (let floor = 1; floor < floors; floor++) {
        const base = ground + (floor - 1) * 3.1 + 0.14, top = base + 3.1;
        if (loggia && axis === loggiaAxis) {
          // Recessed loggias: floor slab, structural side cheeks and parapet share
          // one coordinate system. The parapet starts on the slab, never in mid-air.
          const count = span > 13 ? 3 : 2;
          const pitch = span * 2 / count, openingWidth = Math.min(5.4, pitch - 1.1);
          const openings = Array.from({ length: count }, (_, i) => ({ u: -span + pitch * (i + 0.5), width: openingWidth, bottom: base, top: top - 0.32 }));
          row(base, top, openings, -1.4, body);
          for (const o of openings) {
            const slab = solid(o.u, base + 0.08, o.width / 2, 0.08, 0.28, -1.45, c.trim);
            slab.tag = 'balcony-floor'; slab.faces = [face, 'top', 'bottom', ...ends];
            const parapet = solid(o.u, base + 0.61, o.width / 2 - 0.14, 0.45, 0.22, 0.07, variant === 0 ? c.stone : c.mint);
            parapet.tag = 'balcony-parapet'; parapet.faces = [face, 'top'];
            // Side returns connect the parapet to the facade and floor; their outer
            // faces sit inside the piers, so only the front and inner face are drawn.
            for (const [side, inner] of [[-1, ends[0]], [1, ends[1]]] as const) {
              const ret = solid(o.u + side * (o.width / 2 - 0.07), base + 0.61, 0.07, 0.45, 0.22, -1.4, c.trim);
              ret.faces = [face, 'top', inner]; ret.tag = 'trim';
            }
          }
        } else if (office && variant === 2) {
          // Broad recessed ribbon windows: a different rhythm from masonry punched openings.
          const width = span * 2 - 1.8;
          row(base, top, [{ u: 0, width, bottom: base + 0.8, top: top - 0.4 }], -0.3, body);
          for (let u = -span + 3.4; u < span - 2; u += 3.4) trim(u, base + 1.65, 0.045, 0.85, -0.15, -0.32, c.roof, [face, ...ends]);
          trim(0, base + 0.72, span, 0.07, 0.14, -0.38, c.trim, [face, 'top', 'bottom']);
        } else {
          const count = house ? 3 : variant === 1 ? 3 : 4;
          const pitch = span * 2 / count;
          const width = house ? (variant === 1 ? 2.4 : 1.35) : variant === 1 ? 1.55 : Math.min(2.6, pitch - 1.4);
          const bottom = base + (variant === 1 && !house ? 0.45 : 0.9);
          const openings = Array.from({ length: count }, (_, i) => ({ u: -span + pitch * (i + 0.5), width, bottom, top: top - 0.45 }));
          row(base, top, openings, -0.3, body);
          for (const o of openings) {
            trim(o.u, bottom - 0.065, o.width / 2 + 0.12, 0.065, 0.18, -0.38, c.trim, [face, 'top', 'bottom', ...ends]);
            if (house && variant === 0) for (const side of [-1, 1]) trim(o.u + side * (o.width / 2 + 0.26), (bottom + o.top) / 2, 0.17, (o.top - bottom) / 2, 0.07, -0.05, c.hedge, [face, ...ends]);
          }
        }
      }
    }
    if (industrial || house) {
      if (variant !== 1) this.statics.push({ shape: { kind: 'gable', hx: hx + 0.4, hy: house ? 1.4 : 1.3, hz: hz + 0.4 },
        position: { x, y: height + (house ? 1.55 : 1.45), z }, rotation: IDENTITY_QUAT, color: industrial ? c.roof : c.brick, tag: 'decor' });
      else this.box(x, height + 0.8, z, hx * 0.75, 0.4, hz * 0.7, c.trim);
      if (house) this.box(x + hx * 0.6, height + 2.2, z, 0.4, 1.1, 0.4, body);
      else this.cylinder(x + hx * 0.6, height + 1.4, z + hz * 0.6, 0.7, 1.25, c.roof);
    } else if (marina && variant === 1) {
      // Stepped art-deco parapet distinguishes this type from the loggia blocks.
      this.box(x, height + 1, z, hx * 0.65, 0.55, hz * 0.65, body);
      this.box(x, height + 1.8, z, hx * 0.35, 0.25, hz * 0.45, c.trim);
    } else if (variant === 1) {
      // Set-back penthouse floor with its own band; reads as a second silhouette step.
      this.box(x, height + 1.75, z, hx * 0.62, 1.55, hz * 0.62, body);
      this.box(x, height + 3.4, z, hx * 0.66, 0.12, hz * 0.66, c.trim);
      if (floors >= 8) this.box(x, height + 4.6, z, hx * 0.4, 1.1, hz * 0.4, c.stone);
    } else if (variant === 2) {
      // Parapet ring around the roof edge, stair head and a water tank on legs.
      for (const side of [-1, 1]) {
        this.box(x + side * (hx - 0.2), height + 0.95, z, 0.2, 0.5, hz, body);
        this.box(x, height + 0.95, z + side * (hz - 0.2), hx - 0.4, 0.5, 0.2, body);
      }
      this.box(x - hx * 0.45, height + 1.6, z + hz * 0.35, 1.8, 1.1, 1.6, c.roof);
      this.cylinder(x + hx * 0.45, height + 2.9, z - hz * 0.4, 1.3, 1.1, c.brick);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) this.box(x + hx * 0.45 + a * 0.9, height + 1.15, z - hz * 0.4 + b * 0.9, 0.08, 0.7, 0.08, c.roof);
    } else {
      this.box(x, height + 1, z, hx * 0.4, 0.45, hz * 0.4, c.roof);
      if (floors >= 8) this.box(x, height + 2.2, z, hx * 0.62, 0.9, hz * 0.62, c.stone);
    }
  }
}
