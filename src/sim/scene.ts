/**
 * Renderable descriptions produced by the sim. The renderer builds meshes from
 * these once and then only reads transform slots. No Three.js here.
 */
export type ShapeDesc =
  | { kind: 'box'; hx: number; hy: number; hz: number }
  | { kind: 'gable'; hx: number; hy: number; hz: number }
  | { kind: 'cylinder'; radius: number; halfHeight: number }
  | { kind: 'wheel'; radius: number; width: number }
  /** Convex polygon in world XZ (any winding), extruded from y0 to y1; `position` is its centroid. */
  | { kind: 'prism'; points: Array<{ x: number; z: number }>; y0: number; y1: number };

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BoxFace = 'x+' | 'x-' | 'z+' | 'z-' | 'top' | 'bottom';

/** Static scenery: fixed transform, drawn as instanced / merged meshes by the renderer. */
export interface StaticDesc {
  shape: ShapeDesc;
  position: Vec3;
  rotation: Quat;
  /** Palette colour, 0xRRGGBB. */
  color: number;
  /** Optional grouping tag for the renderer (e.g. 'road', 'kerb', 'prop'). */
  tag?: string;
  /** City-only surface panel: render one outward box face instead of a closed solid. */
  face?: BoxFace;
  /** Exposed faces of a structural facade member; hidden internal faces are omitted. */
  faces?: BoxFace[];
  /** Sub-pixel frames may be omitted from distant chunks. */
  detailOnly?: boolean;
  /** Distant stand-in (e.g. a crossing as one band) drawn only in the far level. */
  farOnly?: boolean;
  /** Ground paint fades into its underlying surface before becoming sub-pixel. */
  paint?: { underlay: number; fadeEnd: number };
  /** Full collision envelope for a facade whose visible walls contain recesses. */
  collisionOnly?: boolean;
}

/** Moving object: the renderer reads `slot` from the TransformBuffer every frame. */
export interface DynamicDesc {
  id: string;
  shape: ShapeDesc;
  color: number;
  slot: number;
  tag?: string;
}

export const IDENTITY_QUAT: Readonly<Quat> = { x: 0, y: 0, z: 0, w: 1 };

export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const h = angle * 0.5;
  const s = Math.sin(h);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(h) };
}

export function quatFromYaw(yaw: number): Quat {
  return quatFromAxisAngle(0, 1, 0, yaw);
}
