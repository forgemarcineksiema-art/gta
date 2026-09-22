import RAPIER from "@dimforge/rapier3d-compat";
const ALL = 65535;
function interactionGroups(membership, filter) {
	return (membership & ALL) << 16 | filter & ALL;
}
const GROUPS_TERRAIN = interactionGroups(2, ALL);
const GROUPS_SOLID = interactionGroups(1, ALL);
const GROUPS_CHASSIS_UPRIGHT = interactionGroups(4, 65533);
const GROUPS_CHASSIS_FLIPPED = interactionGroups(4, ALL);
//#endregion
//#region src/sim/palette.ts
/**
* The shared low-poly palette (docs/STYLE.md). Every mesh colour comes from here,
* so the renderer can use vertex colours / one material and the game reads as one style.
*/
const PALETTE = {
	asphalt: 3816006,
	asphaltLight: 4868696,
	asphaltBay: 5921129,
	laneMark: 15919576,
	roadWhite: 13947071,
	roadYellow: 15121251,
	kerb: 13222835,
	concrete: 10130314,
	sand: 14267770,
	grass: 8887156,
	water: 4171721,
	glass: 10475775,
	ramp: 15029053,
	cone: 16747051,
	barrier: 16249834,
	carRed: 16726876,
	carLime: 11990338,
	carBlue: 2871807,
	carOrange: 16752412,
	carMagenta: 16014335,
	carWhite: 16249834,
	carBlack: 1841954,
	ink: 789520,
	rubber: 1381658,
	charcoal: 2434348,
	graphite: 3487038,
	slate: 4868693,
	steel: 7171448,
	silver: 10329512,
	lightGrey: 12895437,
	chrome: 15000810,
	tyre: 1381658,
	rim: 12895437,
	glassDark: 5203570,
	policeWhite: 16249834,
	policeBlue: 1920728,
	skyTop: 7367835,
	skyHorizon: 15054501,
	sun: 16769978,
	fog: 14268588
};
const CITY_COLORS = {
	stone: 13945789,
	chalk: 14932164,
	lavender: 11643066,
	brick: 11368548,
	peach: 14134940,
	mint: 9546915,
	trim: 14866889,
	roof: 6447980,
	window: 5401206,
	windowLight: 8558492,
	shop: 4282723,
	soil: 9081464,
	yard: 10131857,
	hedge: 6651748,
	leaves: 8690544
};
//#endregion
//#region src/sim/random.ts
/** mulberry32. Deterministic, allocation-free after the closure is built. */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = a + 1831565813 >>> 0;
		let t = a;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
//#endregion
//#region src/sim/scene.ts
const IDENTITY_QUAT = {
	x: 0,
	y: 0,
	z: 0,
	w: 1
};
function quatFromAxisAngle(ax, ay, az, angle) {
	const h = angle * .5;
	const s = Math.sin(h);
	return {
		x: ax * s,
		y: ay * s,
		z: az * s,
		w: Math.cos(h)
	};
}
function quatFromYaw(yaw) {
	return quatFromAxisAngle(0, 1, 0, yaw);
}
//#endregion
//#region src/sim/city/architecture.ts
/** Metre-based street architecture. Render descriptors only; solids stay simple in Rapier. */
var Architecture = class {
	statics;
	constructor(statics) {
		this.statics = statics;
	}
	box(x, y, z, hx, hy, hz, color, tag = "decor", face) {
		const st = {
			shape: {
				kind: "box",
				hx,
				hy,
				hz
			},
			position: {
				x,
				y,
				z
			},
			rotation: IDENTITY_QUAT,
			color,
			tag,
			...face ? { face } : {}
		};
		this.statics.push(st);
		return st;
	}
	/** Convex polygon (world XZ) extruded from y0 to y1; solid when tagged 'kerb' or 'building'. */
	prism(points, y0, y1, color, tag = "kerb") {
		let x = 0, z = 0;
		for (const pt of points) {
			x += pt.x / points.length;
			z += pt.z / points.length;
		}
		const st = {
			shape: {
				kind: "prism",
				points,
				y0,
				y1
			},
			position: {
				x,
				y: (y0 + y1) / 2,
				z
			},
			rotation: IDENTITY_QUAT,
			color,
			tag
		};
		this.statics.push(st);
		return st;
	}
	cylinder(x, y, z, radius, halfHeight, color) {
		this.statics.push({
			shape: {
				kind: "cylinder",
				radius,
				halfHeight
			},
			position: {
				x,
				y,
				z
			},
			rotation: IDENTITY_QUAT,
			color,
			tag: "decor"
		});
	}
	tree(x, z, palm = false) {
		this.cylinder(x, 2.5, z, .24, 2.35, 9140582);
		if (palm) {
			this.box(x, 5, z, 3.2, .15, .7, CITY_COLORS.hedge);
			this.box(x, 5.2, z, .7, .15, 3.2, CITY_COLORS.leaves);
			this.cylinder(x, 5.4, z, 1.2, .45, CITY_COLORS.hedge);
		} else {
			this.cylinder(x, 4.8, z, 2.7, 1.2, CITY_COLORS.hedge);
			this.cylinder(x + .5, 6.25, z, 2, .75, CITY_COLORS.leaves);
			this.cylinder(x - 1.8, 4.3, z + .5, 1.4, .8, CITY_COLORS.leaves);
		}
	}
	/** Shipping container, 12 × 2.6 × 2.4 m, solid; `tier` stacks it. */
	container(x, z, yaw, colour, tier = 0) {
		const start = this.statics.length;
		const y = 1.44 + tier * 2.6;
		this.box(0, y, 0, 6, 1.3, 1.2, colour, "building");
		for (const side of [-1, 1]) for (const u of [
			-4.5,
			-1.5,
			1.5,
			4.5
		]) this.box(u, y, side * 1.21, .08, 1.2, .02, CITY_COLORS.roof, "decor", side > 0 ? "z+" : "z-");
		this.box(6.02, y, 0, .02, 1.15, 1.1, CITY_COLORS.roof, "decor", "x+");
		this.rotateFrom(start, x, z, yaw);
	}
	/** Vertical storage tank on a plinth with a top band. */
	tank(x, z, radius, height, colour, band) {
		this.box(x, .3, z, radius + .6, .16, radius + .6, CITY_COLORS.roof, "building");
		this.cylinder(x, .46 + height / 2, z, radius, height / 2, colour);
		this.cylinder(x, .46 + height - .4, z, radius + .08, .35, band);
		this.cylinder(x, .46 + height + .25, z, radius * .35, .3, CITY_COLORS.roof);
		this.box(x + radius + .2, .46 + height / 2, z, .12, height / 2, .5, CITY_COLORS.roof);
	}
	/** Gantry crane: two A-legs and a beam spanning `span` across local X. */
	gantry(x, z, yaw, span, colour) {
		const start = this.statics.length;
		for (const side of [-1, 1]) {
			this.box(side * span / 2, 5, 0, .35, 5, .35, colour, "building");
			this.box(side * span / 2, .6, 0, 1.4, .45, 1.4, CITY_COLORS.roof, "building");
		}
		this.box(0, 10.4, 0, span / 2 + .8, .45, .6, colour);
		this.box(span * .2, 9.4, 0, 1.2, .55, .9, CITY_COLORS.roof);
		this.box(span * .2, 6.5, 0, .05, 2.4, .05, CITY_COLORS.roof);
		this.box(span * .2, 3.8, 0, .6, .3, .6, CITY_COLORS.trim);
		this.rotateFrom(start, x, z, yaw);
	}
	/** Chain-link fence run along local X: posts every 6 m and a top rail. */
	fence(x, z, yaw, length) {
		const start = this.statics.length;
		for (let u = -length / 2; u <= length / 2; u += 6) this.box(u, 1.1, 0, .06, 1.1, .06, CITY_COLORS.roof);
		this.box(0, 2.15, 0, length / 2, .04, .04, CITY_COLORS.roof);
		this.box(0, 1.1, 0, length / 2, .95, .001, 7303288, "decor", "z+");
		this.rotateFrom(start, x, z, yaw);
	}
	/** Floodlight mast for yards and quays. */
	mast(x, z) {
		this.box(x, 7, z, .2, 7, .2, 6841976);
		this.box(x, 14.2, z, 1.1, .25, .5, CITY_COLORS.roof);
		this.box(x, 14.55, z, 1, .1, .45, PALETTE.laneMark);
	}
	/**
	* A building whose street face (local -Z) looks along `yaw`: generated in its
	* own frame, then every member is moved and given the same rotation, so the
	* facade logic never knows the building is not axis aligned.
	*/
	rotatedBuilding(x, z, yaw, hx, hz, district, floors, variant, accent) {
		const start = this.statics.length;
		this.building(0, 0, hx, hz, district, 1, 1, floors, variant, accent, false, true);
		this.rotateFrom(start, x, z, yaw);
	}
	/** Move every static generated since `start` (built about the origin) to (x, z) facing `yaw`. */
	rotateFrom(start, x, z, yaw) {
		const cos = Math.cos(yaw), sin = Math.sin(yaw), rot = quatFromYaw(yaw);
		for (let i = start; i < this.statics.length; i++) {
			const st = this.statics[i];
			const lx = st.position.x, lz = st.position.z;
			st.position = {
				x: x + cos * lx + sin * lz,
				y: st.position.y,
				z: z - sin * lx + cos * lz
			};
			st.rotation = rot;
		}
	}
	/**
	* The collider encloses the building, but the rendered walls are a core, piers
	* and spandrels. Openings are actual voids in that outer shell; glazing lives
	* behind it. No window or balcony is pasted onto an unbroken outer box.
	*/
	building(x, z, hx, hz, district, sx, sz, floors, variant, accent, streetX = true, streetZ = true) {
		const c = CITY_COLORS;
		const industrial = district === "foundry", house = district === "gardens";
		const marina = district === "marina", office = district === "crown";
		const ground = industrial ? 5.4 : house ? 2.9 : 3.8;
		const height = ground + (floors - 1) * 3.1;
		const colors = office ? [
			c.stone,
			c.lavender,
			c.chalk
		] : industrial ? [
			c.brick,
			c.stone,
			c.yard
		] : house ? [
			c.chalk,
			c.mint,
			c.peach
		] : [
			c.peach,
			c.chalk,
			c.mint
		];
		const body = colors[variant % colors.length];
		const loggiaAxis = streetX ? "x" : "z";
		const loggia = marina && variant !== 1;
		const shellDepth = loggia ? 1.45 : .38;
		this.statics.push({
			shape: {
				kind: "box",
				hx,
				hy: height / 2,
				hz
			},
			position: {
				x,
				y: height / 2 + .14,
				z
			},
			rotation: IDENTITY_QUAT,
			color: body,
			tag: "building",
			collisionOnly: true
		});
		this.box(x, height / 2 + .14, z, hx - shellDepth, height / 2, hz - shellDepth, body);
		this.box(x, .3, z, hx + .04, .16, hz + .04, c.roof);
		this.box(x, height + .36, z, hx + .3, .22, hz + .3, c.trim);
		this.box(x, height + .62, z, hx - .32, .05, hz - .32, c.roof);
		for (const axis of ["x", "z"]) for (const sign of [-1, 1]) {
			const street = axis === "x" ? streetX && sign === -sx : streetZ && sign === -sz;
			const span = axis === "x" ? hz : hx - shellDepth;
			const radius = axis === "x" ? hx : hz;
			const face = `${axis}${sign > 0 ? "+" : "-"}`;
			const solid = (u, y, w, h, front, back, color) => {
				const depth = (front + back) / 2, thickness = (front - back) / 2;
				return this.box(axis === "x" ? x + sign * (radius + depth) : x + u, y, axis === "z" ? z + sign * (radius + depth) : z + u, axis === "x" ? thickness : w, h, axis === "z" ? thickness : w, color);
			};
			const surface = (u, y, w, h, depth, color, detailOnly = false) => {
				const st = this.box(axis === "x" ? x + sign * (radius + depth) : x + u, y, axis === "z" ? z + sign * (radius + depth) : z + u, axis === "x" ? .001 : w, h, axis === "z" ? .001 : w, color, "decor", face);
				st.detailOnly = detailOnly;
				return st;
			};
			const ends = axis === "x" ? ["z+", "z-"] : ["x+", "x-"];
			const wall = (u, y, w, h, color, band) => {
				const st = solid(u, y, w, h, 0, -shellDepth, color);
				const capped = axis === "x" && w >= span - 1e-6;
				st.faces = band ? [
					face,
					"top",
					"bottom",
					...capped ? ends : []
				] : [face, ...ends];
				st.tag = "wall";
			};
			const trim = (u, y, w, h, front, back, color, faces) => {
				const st = solid(u, y, w, h, front, back, color);
				st.faces = faces;
				st.tag = "trim";
				st.detailOnly = true;
				return st;
			};
			const glazing = (u, bottom, width, top, depth, frame, door = false) => {
				const mid = (bottom + top) / 2, half = (top - bottom) / 2;
				surface(u, mid, width / 2, half, depth, c.window).tag = "glazing";
				const trim = house ? c.stone : c.roof;
				surface(u - width / 2 + .045, mid, .045, half, depth + .02, trim, true);
				surface(u + width / 2 - .045, mid, .045, half, depth + .02, trim, true);
				surface(u, bottom + .045, width / 2, .045, depth + .02, trim, true);
				surface(u, top - .045, width / 2, .045, depth + .02, trim, true);
				if (frame) surface(u, mid, .035, half, depth + .025, trim, true);
				if (door) surface(u + .22, bottom + 1.05, .025, .12, depth + .035, c.trim, true);
			};
			const row = (base, top, openings, depth, wallColor) => {
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
					glazing(opening.u, opening.bottom, opening.width, opening.top, depth, opening.width > 1.7, opening.bottom < base + .3);
					left = b;
				}
				if (left < span) wall((left + span) / 2, (low + high) / 2, (span - left) / 2, (high - low) / 2, wallColor, false);
			};
			if (!street) {
				for (let floor = 0; floor < floors; floor++) {
					const base = floor === 0 ? .14 : ground + (floor - 1) * 3.1 + .14;
					const top = floor === 0 ? ground + .14 : base + 3.1;
					row(base, top, [{
						u: -span * .5,
						width: industrial ? 3.2 : house ? 1.3 : 2.1,
						bottom: top - 1.65,
						top: top - .45
					}, {
						u: span * .5,
						width: industrial ? 2.4 : 1.15,
						bottom: top - 1.45,
						top: top - .45
					}], -shellDepth + .03, body);
				}
				continue;
			}
			const entryWidth = house ? 1.1 : 1.8;
			const groundOpenings = [
				{
					u: -span * .56,
					width: industrial ? span * .55 : house ? 1.8 : span * .55,
					bottom: industrial ? .2 : house ? 1.05 : .65,
					top: industrial ? 4.35 : house ? 2.35 : 3.05
				},
				{
					u: 0,
					width: entryWidth,
					bottom: .2,
					top: 2.5
				},
				{
					u: span * .56,
					width: industrial ? span * .55 : house ? 1.8 : span * .55,
					bottom: industrial ? .2 : house ? 1.05 : .65,
					top: industrial ? 4.35 : house ? 2.35 : 3.05
				}
			];
			row(.14, ground + .14, groundOpenings, -shellDepth + .03, industrial ? c.brick : house ? body : c.stone);
			if (industrial) {
				for (const u of [-span * .56, span * .56]) {
					surface(u, 2.275, span * .275, 2.075, -.28, c.roof);
					for (const y of [
						.9,
						1.7,
						2.5,
						3.3,
						4.1
					]) surface(u, y, span * .27, .025, -.26, c.yard);
				}
				solid(-span * .56, 4.55, span * .32, .12, 1.6, -.2, accent);
			} else {
				solid(0, 2.68, house ? .9 : 1.35, .12, house ? .9 : 1.2, -.1, house ? c.trim : accent);
				if (!house) solid(0, ground - .1, span + .08, .12, .25, -.12, c.trim);
			}
			for (let floor = 1; floor < floors; floor++) {
				const base = ground + (floor - 1) * 3.1 + .14, top = base + 3.1;
				if (loggia && axis === loggiaAxis) {
					const count = span > 13 ? 3 : 2;
					const pitch = span * 2 / count, openingWidth = Math.min(5.4, pitch - 1.1);
					const openings = Array.from({ length: count }, (_, i) => ({
						u: -span + pitch * (i + .5),
						width: openingWidth,
						bottom: base,
						top: top - .32
					}));
					row(base, top, openings, -1.4, body);
					for (const o of openings) {
						const slab = solid(o.u, base + .08, o.width / 2, .08, .28, -1.45, c.trim);
						slab.tag = "balcony-floor";
						slab.faces = [
							face,
							"top",
							"bottom",
							...ends
						];
						const parapet = solid(o.u, base + .61, o.width / 2 - .14, .45, .22, .07, variant === 0 ? c.stone : c.mint);
						parapet.tag = "balcony-parapet";
						parapet.faces = [face, "top"];
						for (const [side, inner] of [[-1, ends[0]], [1, ends[1]]]) {
							const ret = solid(o.u + side * (o.width / 2 - .07), base + .61, .07, .45, .22, -1.4, c.trim);
							ret.faces = [
								face,
								"top",
								inner
							];
							ret.tag = "trim";
						}
					}
				} else if (office && variant === 2) {
					row(base, top, [{
						u: 0,
						width: span * 2 - 1.8,
						bottom: base + .8,
						top: top - .4
					}], -.3, body);
					for (let u = -span + 3.4; u < span - 2; u += 3.4) trim(u, base + 1.65, .045, .85, -.15, -.32, c.roof, [face, ...ends]);
					trim(0, base + .72, span, .07, .14, -.38, c.trim, [
						face,
						"top",
						"bottom"
					]);
				} else {
					const count = house ? 3 : variant === 1 ? 3 : 4;
					const pitch = span * 2 / count;
					const width = house ? variant === 1 ? 2.4 : 1.35 : variant === 1 ? 1.55 : Math.min(2.6, pitch - 1.4);
					const bottom = base + (variant === 1 && !house ? .45 : .9);
					const openings = Array.from({ length: count }, (_, i) => ({
						u: -span + pitch * (i + .5),
						width,
						bottom,
						top: top - .45
					}));
					row(base, top, openings, -.3, body);
					for (const o of openings) {
						trim(o.u, bottom - .065, o.width / 2 + .12, .065, .18, -.38, c.trim, [
							face,
							"top",
							"bottom",
							...ends
						]);
						if (house && variant === 0) for (const side of [-1, 1]) trim(o.u + side * (o.width / 2 + .26), (bottom + o.top) / 2, .17, (o.top - bottom) / 2, .07, -.05, c.hedge, [face, ...ends]);
					}
				}
			}
		}
		if (industrial || house) {
			if (variant !== 1) this.statics.push({
				shape: {
					kind: "gable",
					hx: hx + .4,
					hy: house ? 1.4 : 1.3,
					hz: hz + .4
				},
				position: {
					x,
					y: height + (house ? 1.55 : 1.45),
					z
				},
				rotation: IDENTITY_QUAT,
				color: industrial ? c.roof : c.brick,
				tag: "decor"
			});
			else this.box(x, height + .8, z, hx * .75, .4, hz * .7, c.trim);
			if (house) this.box(x + hx * .6, height + 2.2, z, .4, 1.1, .4, body);
			else this.cylinder(x + hx * .6, height + 1.4, z + hz * .6, .7, 1.25, c.roof);
		} else if (marina && variant === 1) {
			this.box(x, height + 1, z, hx * .65, .55, hz * .65, body);
			this.box(x, height + 1.8, z, hx * .35, .25, hz * .45, c.trim);
		} else if (variant === 1) {
			this.box(x, height + 1.75, z, hx * .62, 1.55, hz * .62, body);
			this.box(x, height + 3.4, z, hx * .66, .12, hz * .66, c.trim);
			if (floors >= 8) this.box(x, height + 4.6, z, hx * .4, 1.1, hz * .4, c.stone);
		} else if (variant === 2) {
			for (const side of [-1, 1]) {
				this.box(x + side * (hx - .2), height + .95, z, .2, .5, hz, body);
				this.box(x, height + .95, z + side * (hz - .2), hx - .4, .5, .2, body);
			}
			this.box(x - hx * .45, height + 1.6, z + hz * .35, 1.8, 1.1, 1.6, c.roof);
			this.cylinder(x + hx * .45, height + 2.9, z - hz * .4, 1.3, 1.1, c.brick);
			for (const [a, b] of [
				[-1, -1],
				[1, -1],
				[-1, 1],
				[1, 1]
			]) this.box(x + hx * .45 + a * .9, height + 1.15, z - hz * .4 + b * .9, .08, .7, .08, c.roof);
		} else {
			this.box(x, height + 1, z, hx * .4, .45, hz * .4, c.roof);
			if (floors >= 8) this.box(x, height + 2.2, z, hx * .62, .9, hz * .62, c.stone);
		}
	}
};
const BILLBOARD_HEIGHT = 2.5;
const BILLBOARD_BOTTOM = 2.5;
const SLOTS_PER_CHUNK = 4;
const PAINTS$1 = [
	PALETTE.carLime,
	PALETTE.carMagenta,
	PALETTE.carOrange,
	PALETTE.carBlue,
	CITY_COLORS.chalk
];
/** The same past the panel's ends: a gate sits between the kerb and the frontage, which can be 5.8 m apart. */
const SIDE_CLEARANCE = .3;
/** The run-out only needs to be clear up to car height; awnings and cornices above it do not matter. */
const CAR_CLEARANCE = 2.2;
/** Metres the posts keep from an authored road's edge (its frontage row and cut pavements). */
const CORRIDOR_CLEARANCE = 6.5;
const BLOCK$1 = 225;
/** A footway gate's centre: posts 0.5 m inside the panel's ends stand 0.6 m off the kerb and on the footway's back edge. */
const PAVEMENT_SLOT = 14.6;
/** The highway verge slot: 10 m outside the outer kerb line (675 + 19 + 10). */
const VERGE = 704;
function chunkIndex(cx, cz) {
	return (cz + 3) * 7 + (cx + 3);
}
/**
* Perimeter chunks own the highway segment leaving their node in the cyclic
* direction (+z on the west edge, +x on the north, -z on the east, -x on the
* south; the corners follow the edge that continues the cycle), which maps the
* 24 chunks one-to-one onto the 24 segments. The slot sits 62 m along it on
* the outer verge, in the gap between the two edge parks, facing the road.
* Interior chunks put one gate across a footway, 93 m from their junction,
* driven through along the street (the frontage row leaves no run-out behind
* a roadside panel): the street trees stand at 57 and 106 m and the lamps at
* 36 and 80 m, so 81–105 m is the one stretch with the run-out clear. The
* centre chunk gets two.
*/
function candidateSlots(cx, cz, out) {
	out.length = 0;
	const x0 = cx * BLOCK$1;
	const z0 = cz * BLOCK$1;
	if (Math.abs(cx) === 3 || Math.abs(cz) === 3) {
		let dx = 0, dz = 0;
		if (cx === -3 && cz !== 3) dz = 1;
		else if (cz === 3 && cx !== 3) dx = 1;
		else if (cx === 3 && cz !== -3) dz = -1;
		else dx = -1;
		const ox = dz !== 0 ? Math.sign(cx) : 0;
		const oz = dx !== 0 ? Math.sign(cz) : 0;
		const yaw = Math.atan2(-ox, -oz);
		for (const along of [
			62,
			66,
			58,
			108
		]) out.push({
			x: ox !== 0 ? ox * VERGE : x0 + dx * along,
			z: oz !== 0 ? oz * VERGE : z0 + dz * along,
			yaw,
			width: 8
		});
		return 1;
	}
	const alongs = [
		93,
		92,
		94
	];
	for (const side of [1, -1]) for (const along of alongs) out.push({
		x: x0 + side * PAVEMENT_SLOT,
		z: z0 + along,
		yaw: 0,
		width: 5
	});
	for (const side of [1, -1]) for (const along of alongs) out.push({
		x: x0 + along,
		z: z0 + side * PAVEMENT_SLOT,
		yaw: Math.PI / 2,
		width: 5
	});
	if (cx === 0 && cz === 0) {
		const first = out.splice(0, alongs.length * 2);
		out.push(...first);
		return 2;
	}
	return 1;
}
/**
* Axis-aligned footprint the panel itself must keep clear up to its top: the
* panel plus CLEARANCE along its normal and SIDE_CLEARANCE past its ends. All
* slots face an axis, so no rotation is needed.
*/
function panelFootprint(slot) {
	return footprint(slot, 1.15);
}
/**
* The footprint a car through the panel sweeps: the panel plus RUN_OUT along
* its normal on both sides, to be clear up to car height. (For a roadside
* panel the near side is the road itself, which is flat and passes.)
*/
function runOutFootprint(slot) {
	return footprint(slot, 11.15);
}
function footprint(slot, halfDepth) {
	const alongX = Math.abs(Math.sin(slot.yaw)) < .5;
	const hw = slot.width / 2 + SIDE_CLEARANCE;
	return alongX ? {
		minX: slot.x - hw,
		maxX: slot.x + hw,
		minZ: slot.z - halfDepth,
		maxZ: slot.z + halfDepth
	} : {
		minX: slot.x - halfDepth,
		maxX: slot.x + halfDepth,
		minZ: slot.z - hw,
		maxZ: slot.z + hw
	};
}
/** Car height: what the run-out must be clear up to. */
const CAR_TOP = CAR_CLEARANCE;
/**
* Conservative world-space footprint of a static that reaches above a metre
* and starts below `maxBottom` (a cornice at 13 m overhangs the footway
* without touching a panel, an awning at 2.6 m clears a car). Null for the
* rest.
*/
function tallFootprint(st, maxBottom = 5) {
	const s = st.shape;
	const p = st.position;
	const panelTop = maxBottom;
	let hx = 0, hz = 0, top = 0, bottom = 0;
	if (s.kind === "box" || s.kind === "gable") {
		const yaw = 2 * Math.atan2(st.rotation.y, st.rotation.w);
		const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
		hx = c * s.hx + sn * s.hz;
		hz = sn * s.hx + c * s.hz;
		top = p.y + s.hy;
		bottom = p.y - s.hy;
	} else if (s.kind === "cylinder") {
		hx = s.radius;
		hz = s.radius;
		top = p.y + s.halfHeight;
		bottom = p.y - s.halfHeight;
	} else if (s.kind === "prism") {
		if (s.y1 <= 1 || s.y0 >= panelTop) return null;
		let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
		for (const pt of s.points) {
			minX = Math.min(minX, pt.x);
			maxX = Math.max(maxX, pt.x);
			minZ = Math.min(minZ, pt.z);
			maxZ = Math.max(maxZ, pt.z);
		}
		return {
			minX,
			maxX,
			minZ,
			maxZ
		};
	} else return null;
	if (top <= 1 || bottom >= panelTop) return null;
	return {
		minX: p.x - hx,
		maxX: p.x + hx,
		minZ: p.z - hz,
		maxZ: p.z + hz
	};
}
function overlaps(a, b) {
	return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}
const slots = [];
/**
* Place this chunk's billboards against the statics generated so far.
* `roadClearance` is the chunk's distance-to-authored-road-edge function.
* A slot is taken when nothing taller than a metre comes within CLEARANCE of
* the panel footprint and the posts are CORRIDOR_CLEARANCE clear of any
* authored road. If no slot passes, the first one is used anyway: the unit
* test then fails and says which chunk needs another slot.
*/
function placeBillboards(cx, cz, statics, roadClearance) {
	const quota = candidateSlots(cx, cz, slots);
	const index = chunkIndex(cx, cz);
	const out = [];
	const used = [];
	for (let k = 0; k < slots.length && out.length < quota; k++) {
		const slot = slots[k];
		const box = panelFootprint(slot);
		const sweep = runOutFootprint(slot);
		let clear = roadClearance(slot.x, slot.z) >= CORRIDOR_CLEARANCE;
		for (let i = 0; clear && i < statics.length; i++) {
			const st = statics[i];
			const tall = tallFootprint(st, 5);
			if (tall && overlaps(box, tall)) {
				clear = false;
				break;
			}
			const low = tallFootprint(st, CAR_TOP);
			if (low && overlaps(sweep, low)) clear = false;
		}
		for (const u of used) if (clear && overlaps(sweep, runOutFootprint(u))) clear = false;
		if (!clear) continue;
		used.push(slot);
		out.push(describe(index, out.length, slot));
	}
	while (out.length < quota) {
		const slot = slots[out.length];
		used.push(slot);
		out.push(describe(index, out.length, slot));
	}
	return out;
}
function describe(index, slotIndex, slot) {
	return {
		id: index * SLOTS_PER_CHUNK + slotIndex,
		x: slot.x,
		z: slot.z,
		yaw: slot.yaw,
		width: slot.width,
		height: BILLBOARD_HEIGHT,
		bottom: BILLBOARD_BOTTOM,
		paint: PAINTS$1[(index + slotIndex) % PAINTS$1.length]
	};
}
var Collectibles = class {
	city;
	smashed = /* @__PURE__ */ new Uint8Array(196);
	smashedCount = 0;
	total = 50;
	constructor(city) {
		this.city = city;
	}
	/** The descriptor of a billboard id among the generated chunks, or null. */
	descOf(id) {
		for (const entry of this.city.active.values()) for (const b of entry.chunk.billboards) if (b.id === id) return b;
		return null;
	}
	/** Returns the id smashed this step or -1: the player's footprint against the panels of the loaded chunks around it. */
	step(player, minSpeed) {
		if (player.speed < minSpeed) return -1;
		const fx = Math.sin(player.yaw);
		const fz = Math.cos(player.yaw);
		const rx = -fz;
		const rz = fx;
		for (const entry of this.city.active.values()) {
			const boards = entry.chunk.billboards;
			for (let b = 0; b < boards.length; b++) {
				const board = boards[b];
				if (this.smashed[board.id]) continue;
				const dx = board.x - player.x;
				const dz = board.z - player.z;
				if (dx * dx + dz * dz > 400) continue;
				const ax = Math.cos(board.yaw), az = -Math.sin(board.yaw);
				const pitch = board.width / 4;
				for (let k = -2; k <= 2; k++) {
					const px = board.x + ax * k * pitch - player.x;
					const pz = board.z + az * k * pitch - player.z;
					const along = px * fx + pz * fz;
					const side = px * rx + pz * rz;
					if (Math.abs(along) <= player.halfLength + .3 && Math.abs(side) <= player.halfWidth + .3) {
						this.smashed[board.id] = 1;
						this.smashedCount++;
						return board.id;
					}
				}
			}
		}
		return -1;
	}
};
const CITY_HALF = 787.5;
/** Highway lane centres, metres right of the centreline: two real graph lanes per direction (decision 14, revisited in M4). */
const HIGHWAY_LANE_OFFSETS = [4, 12];
const node = (gx, gz) => ({
	x: gx * 225,
	z: gz * 225
});
/** Resample a polyline at a uniform spacing (the last point is kept exactly). */
function resample(points, spacing) {
	const out = [];
	let carried = 0;
	for (let i = 0; i + 1 < points.length; i++) {
		const a = points[i], b = points[i + 1];
		const len = Math.hypot(b.x - a.x, b.z - a.z);
		for (let d = carried; d < len; d += spacing) out.push({
			x: a.x + (b.x - a.x) * d / len,
			z: a.z + (b.z - a.z) * d / len
		});
		carried = ((carried - len) % spacing + spacing) % spacing;
	}
	out.push({ ...points[points.length - 1] });
	return out;
}
function straight(name, from, to, halfWidth, kind) {
	return {
		name,
		from,
		to,
		halfWidth,
		kind,
		centre: resample([node(...from), node(...to)], 9)
	};
}
/** Circular arc from one junction to another about `centre`, along the shorter sweep. */
function arc(name, from, to, centre, halfWidth, kind) {
	const a = node(...from), b = node(...to);
	const radius = Math.hypot(a.x - centre.x, a.z - centre.z);
	const t0 = Math.atan2(a.z - centre.z, a.x - centre.x);
	let sweep = Math.atan2(b.z - centre.z, b.x - centre.x) - t0;
	sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
	const steps = Math.ceil(Math.abs(sweep) * radius / 4.5);
	const points = [];
	for (let i = 0; i <= steps; i++) {
		const t = t0 + sweep * i / steps;
		points.push({
			x: centre.x + Math.cos(t) * radius,
			z: centre.z + Math.sin(t) * radius
		});
	}
	points[0] = a;
	points[points.length - 1] = b;
	return {
		name,
		from,
		to,
		halfWidth,
		kind,
		centre: points
	};
}
/** Catmull-Rom curve through control points; the first and last are the junctions. */
function spline(name, from, to, control, halfWidth, kind) {
	const pts = [
		node(...from),
		...control,
		node(...to)
	];
	const raw = [];
	for (let i = 0; i + 1 < pts.length; i++) {
		const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
		const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
		for (let k = 0; k < 16; k++) {
			const t = k / 16, t2 = t * t, t3 = t2 * t;
			raw.push({
				x: .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
				z: .5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
			});
		}
	}
	raw.push(pts[pts.length - 1]);
	return {
		name,
		from,
		to,
		halfWidth,
		kind,
		centre: resample(raw, 4.5)
	};
}
/**
* The M2.2 loop: each district contributes one road that asks for different
* driving. Crown: two straight diagonals aimed at the tower. Sunset Works: a
* narrow service chicane through the yards. Palm Gardens: a 225 m radius
* parkway arc. Coral Quay: a 503 m radius sweep along the quay.
*/
const SPECIAL_ROADS = [
	straight("Crown Diagonal West", [-3, -1], [-2, -2], 12, "avenue"),
	straight("Crown Diagonal North", [-2, -2], [-1, -3], 12, "avenue"),
	spline("Works Chicane", [1, -2], [2, -1], [
		{
			x: 300,
			z: -425
		},
		{
			x: 340,
			z: -370
		},
		{
			x: 340,
			z: -305
		},
		{
			x: 395,
			z: -250
		}
	], 8, "service"),
	arc("Garden Parkway", [-1, 2], [-2, 1], {
		x: -225,
		z: 225
	}, 10, "parkway"),
	arc("Quay Sweep", [2, 1], [1, 2], {
		x: 675,
		z: 675
	}, 12, "quay")
];
/** Offset a polyline to its right (facing along it); +X is left when facing +Z. */
function offsetRight(points, offset) {
	return points.map((p, i) => {
		const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
		const tx = next.x - prev.x, tz = next.z - prev.z, len = Math.hypot(tx, tz) || 1;
		return {
			x: p.x - tz / len * offset,
			z: p.z + tx / len * offset
		};
	});
}
/** Cut `inset` metres off both ends of a polyline, measured along it. */
function trim(points, inset) {
	const cut = (pts) => {
		let left = inset;
		for (let i = 0; i + 1 < pts.length; i++) {
			const a = pts[i], b = pts[i + 1];
			const len = Math.hypot(b.x - a.x, b.z - a.z);
			if (len < left) {
				left -= len;
				continue;
			}
			const t = left / len;
			return [{
				x: a.x + (b.x - a.x) * t,
				z: a.z + (b.z - a.z) * t
			}, ...pts.slice(i + 1)];
		}
		return pts.slice(-1);
	};
	return cut(cut(points).reverse()).reverse();
}
function buildRoadGraph() {
	const nodes = [];
	const lanes = [];
	for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) nodes.push({
		id: nodes.length,
		x: x * 225,
		z: z * 225,
		outgoing: []
	});
	const nodeAt = (gx, gz) => nodes[(gz + 3) * 7 + (gx + 3)];
	const add = (a, b, centre, highway, special, halfWidth = 12, laneOffset) => {
		const offset = laneOffset ?? Math.min(4.5, halfWidth - 3.5);
		const points = offsetRight(trim(centre, 23), offset);
		const first = points[0], second = points[1];
		const last = points[points.length - 1], before = points[points.length - 2];
		const lane = {
			id: lanes.length,
			from: a.id,
			to: b.id,
			highway,
			offset,
			points,
			x0: first.x,
			z0: first.z,
			x1: last.x,
			z1: last.z,
			yaw0: Math.atan2(second.x - first.x, second.z - first.z),
			yaw: Math.atan2(last.x - before.x, last.z - before.z),
			next: [],
			...special ? { special } : {}
		};
		lanes.push(lane);
		a.outgoing.push(lane.id);
	};
	for (const a of nodes) for (const b of nodes) {
		if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 225) continue;
		const highway = a.x === b.x && Math.abs(a.x) === 675 || a.z === b.z && Math.abs(a.z) === 675;
		const centre = [{
			x: a.x,
			z: a.z
		}, {
			x: b.x,
			z: b.z
		}];
		if (highway) for (const off of HIGHWAY_LANE_OFFSETS) add(a, b, centre, true, void 0, 12, off);
		else add(a, b, centre, false);
	}
	for (const road of SPECIAL_ROADS) {
		const a = nodeAt(...road.from), b = nodeAt(...road.to);
		add(a, b, road.centre, false, road.name, road.halfWidth);
		add(b, a, [...road.centre].reverse(), false, road.name, road.halfWidth);
	}
	for (const lane of lanes) lane.next = [...nodes[lane.to].outgoing];
	return {
		nodes,
		lanes,
		special: SPECIAL_ROADS
	};
}
/** A deterministic Euler tour visits every directed lane, including the perimeter. */
function roadTour(graph) {
	const remaining = graph.nodes.map((n) => [...n.outgoing]);
	const stack = [{
		node: 24,
		via: -1
	}];
	const reversed = [];
	while (stack.length) {
		const top = stack[stack.length - 1];
		const edge = remaining[top.node]?.pop();
		if (edge === void 0) {
			stack.pop();
			if (top.via >= 0) reversed.push(top.via);
		} else stack.push({
			node: graph.lanes[edge].to,
			via: edge
		});
	}
	return reversed.reverse();
}
/** Sample a lane and its connection at <= 3 m. Shared by bot and future traffic. */
function lanePath(lane, next) {
	const out = [];
	for (let i = 0; i + 1 < lane.points.length; i++) {
		const a = lane.points[i], b = lane.points[i + 1];
		const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(length / 3);
		const yaw = Math.atan2(b.x - a.x, b.z - a.z);
		for (let k = 0; k < steps; k++) {
			const t = k / steps;
			out.push({
				x: a.x + (b.x - a.x) * t,
				z: a.z + (b.z - a.z) * t,
				yaw,
				curvature: 0,
				s: 0
			});
		}
	}
	const cx0 = lane.x1 + Math.sin(lane.yaw) * 24, cz0 = lane.z1 + Math.cos(lane.yaw) * 24;
	const cx1 = next.x0 - Math.sin(next.yaw0) * 24, cz1 = next.z0 - Math.cos(next.yaw0) * 24;
	for (let i = 0; i < 24; i++) {
		const t = i / 24, u = 1 - t;
		out.push({
			x: u ** 3 * lane.x1 + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t ** 3 * next.x0,
			z: u ** 3 * lane.z1 + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t ** 3 * next.z0,
			yaw: 0,
			curvature: 0,
			s: 0
		});
	}
	return out;
}
/** Closest point on a lane's polyline; returns squared distance and writes the projection. */
function projectOnLane(lane, x, z, out) {
	let best = Infinity;
	for (let i = 0; i + 1 < lane.points.length; i++) {
		const a = lane.points[i], b = lane.points[i + 1];
		const dx = b.x - a.x, dz = b.z - a.z;
		const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
		const px = a.x + dx * t, pz = a.z + dz * t, dist = (x - px) ** 2 + (z - pz) ** 2;
		if (dist < best) {
			best = dist;
			out.x = px;
			out.z = pz;
			out.yaw = Math.atan2(dx, dz);
		}
	}
	return best;
}
/** Squared distance from a point to a sampled centreline. */
function distanceToPolyline(points, x, z) {
	let best = Infinity;
	for (let i = 0; i + 1 < points.length; i++) {
		const a = points[i], b = points[i + 1];
		const dx = b.x - a.x, dz = b.z - a.z;
		const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
		best = Math.min(best, (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2);
	}
	return Math.sqrt(best);
}
function buildCityRoute(graph) {
	const tour = roadTour(graph);
	const raw = [];
	for (let i = 0; i < tour.length; i++) {
		const lane = graph.lanes[tour[i]];
		const next = graph.lanes[tour[(i + 1) % tour.length]];
		for (const p of lanePath(lane, next)) raw.push({
			x: p.x,
			z: p.z,
			lane: lane.id
		});
	}
	const samples = [], laneAtSample = [];
	let carried = 0, distance = 0;
	for (let i = 0; i < raw.length; i++) {
		const a = raw[i], b = raw[(i + 1) % raw.length];
		const len = Math.hypot(b.x - a.x, b.z - a.z);
		for (let d = carried; d < len; d += 3) {
			samples.push({
				x: a.x + (b.x - a.x) * d / len,
				z: a.z + (b.z - a.z) * d / len,
				yaw: 0,
				curvature: 0,
				s: distance
			});
			laneAtSample.push(a.lane);
			distance += 3;
		}
		carried = (carried - len) % 3;
		if (carried < 0) carried += 3;
	}
	for (let i = 0; i < samples.length; i++) {
		const prev = samples[(i + samples.length - 1) % samples.length];
		const p = samples[i], next = samples[(i + 1) % samples.length];
		p.yaw = Math.atan2(next.x - prev.x, next.z - prev.z);
		const a = Math.atan2(p.x - prev.x, p.z - prev.z), b = Math.atan2(next.x - p.x, next.z - p.z);
		p.curvature = Math.atan2(Math.sin(b - a), Math.cos(b - a)) / 3;
	}
	const first = samples[0];
	return {
		samples,
		laneAtSample,
		gates: [],
		origin: {
			x: 0,
			z: 0
		},
		width: 24,
		length: distance,
		start: {
			x: first.x,
			z: first.z,
			yaw: first.yaw
		}
	};
}
//#endregion
//#region src/sim/city/markings.ts
/** Metre-based paint, junction furniture and usable parallel parking for every road in the city. */
/** Halfway between the two highway lane centres: where the lane dash goes. */
const HIGHWAY_LANE_DIVIDER = (HIGHWAY_LANE_OFFSETS[0] + HIGHWAY_LANE_OFFSETS[1]) / 2;
const PARKING = {
	width: 3,
	length: 7,
	kerbGap: .35
};
/** How each district uses its kerb: spaces per group, groups kept (1 = all), line colour, P stencil. */
const PARKING_STYLE = {
	crown: {
		group: 5,
		every: 1,
		colour: PALETTE.roadWhite,
		symbol: true
	},
	marina: {
		group: 5,
		every: 1,
		colour: PALETTE.roadWhite,
		symbol: true
	},
	gardens: {
		group: 3,
		every: 2,
		colour: PALETTE.roadWhite,
		symbol: true
	},
	foundry: {
		group: 3,
		every: 1,
		colour: PALETTE.roadYellow,
		symbol: false
	}
};
/** Highway lane dashes: 4 m of paint every 12 m. */
const LANE_DASH = 12;
/** Longest merged paint box; keeps every box inside one chunk's neighbourhood. */
const RUN_MAX = 12;
/** The perimeter as one closed centreline: four straights joined by quarter circles about the inner kerb corners. */
function highwayLoop() {
	const inner = 656, points = [];
	const corners = [
		[
			-656,
			inner,
			Math.PI
		],
		[
			inner,
			inner,
			Math.PI / 2
		],
		[
			inner,
			-656,
			0
		],
		[
			-656,
			-656,
			-Math.PI / 2
		]
	];
	for (const [cx, cz, from] of corners) for (let i = 0; i <= 16; i++) {
		const t = from - Math.PI / 2 * i / 16;
		points.push({
			x: cx + Math.cos(t) * 19,
			z: cz + Math.sin(t) * 19
		});
	}
	points.push({ ...points[0] });
	return points;
}
/** One owner per whole marking/bay, even where a road crosses a streaming boundary. */
function buildRoadMarkings(graph, districtAt) {
	const statics = [], parking = [], allApproaches = [];
	const architecture = new Architecture(statics);
	const roads = [];
	for (const lane of graph.lanes) {
		if (lane.special || lane.highway || lane.from > lane.to) continue;
		const a = graph.nodes[lane.from], b = graph.nodes[lane.to];
		roads.push({
			id: `grid-${lane.from}-${lane.to}`,
			kind: "street",
			points: [a, b],
			halfWidth: 12,
			district: districtAt((a.x + b.x) / 2, (a.z + b.z) / 2).id
		});
	}
	for (const r of graph.special) {
		const mid = r.centre[Math.floor(r.centre.length / 2)];
		roads.push({
			id: r.name,
			kind: r.kind,
			points: r.centre,
			halfWidth: r.halfWidth,
			district: districtAt(mid.x, mid.z).id
		});
	}
	roads.push({
		id: "highway",
		kind: "highway",
		points: highwayLoop(),
		halfWidth: 19,
		district: ""
	});
	for (const road of roads) {
		const highway = road.kind === "highway", street = road.kind === "street";
		const kerbside = street || road.kind === "avenue" || road.kind === "quay";
		const distances = [0];
		for (let i = 1; i < road.points.length; i++) {
			const a = road.points[i - 1], b = road.points[i];
			distances.push(distances[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
		}
		const total = distances[distances.length - 1];
		const segmentAt = (s) => {
			let i = 0;
			while (i + 2 < distances.length && distances[i + 1] < s) i++;
			return i;
		};
		const frame = (s, offset = 0) => {
			const i = segmentAt(s);
			const a = road.points[i], b = road.points[i + 1];
			const length = distances[i + 1] - distances[i];
			const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
			return {
				x: a.x + tx * (s - distances[i]) - tz * offset,
				z: a.z + tz * (s - distances[i]) + tx * offset,
				tx,
				tz
			};
		};
		const others = graph.special.filter((r) => r.name !== road.id);
		const clear = (p, radius) => {
			if (!others.every((r) => distanceToPolyline(r.centre, p.x, p.z) > r.halfWidth + radius + 1)) return false;
			if (street) return true;
			const gx = Math.round(p.x / 225), gz = Math.round(p.z / 225);
			const half = (g) => Math.abs(g) === 3 ? 19 : 12;
			if (highway) return (Math.abs(gx) === 3 || Math.abs(p.x - gx * 225) > 12 + radius + 1) && (Math.abs(gz) === 3 || Math.abs(p.z - gz * 225) > 12 + radius + 1);
			return Math.abs(p.x - gx * 225) > half(gx) + radius + 1 && Math.abs(p.z - gz * 225) > half(gz) + radius + 1;
		};
		const rect = (s, offset, width, length, color, tag, fadeEnd = 0, underlay = PALETTE.asphalt, y = .064, yawOffset = 0) => {
			const p = frame(s, offset);
			if (!clear(p, Math.hypot(width, length) / 2)) return null;
			const st = architecture.box(p.x, y - .001, p.z, width / 2, .001, length / 2, color, tag, "top");
			st.rotation = quatFromYaw(Math.atan2(p.tx, p.tz) + yawOffset);
			if (fadeEnd) st.paint = {
				underlay,
				fadeEnd
			};
			return st;
		};
		const runs = /* @__PURE__ */ new Map();
		const flush = (run) => {
			const a = frame(run.s0, run.offset), b = frame(run.s1, run.offset);
			const distance = Math.hypot(b.x - a.x, b.z - a.z);
			const st = architecture.box((a.x + b.x) / 2, .063, (a.z + b.z) / 2, run.width / 2, .001, distance / 2, run.color, run.tag, "top");
			st.rotation = quatFromYaw(Math.atan2(b.x - a.x, b.z - a.z));
		};
		const stroke = (s, length, offset, width, color, tag, clearance = true) => {
			const key = `${tag}:${offset}`, run = runs.get(key), segment = segmentAt(s), end = s + length;
			const a = frame(s, offset), b = frame(end, offset);
			const ok = !clearance || clear({
				x: (a.x + b.x) / 2,
				z: (a.z + b.z) / 2
			}, Math.hypot(length, width) / 2);
			if (run && ok && run.s1 === s && run.segment === segment && segmentAt(end) === segment && end - run.s0 <= RUN_MAX) {
				run.s1 = end;
				return;
			}
			if (run) {
				flush(run);
				runs.delete(key);
			}
			if (ok) runs.set(key, {
				s0: s,
				s1: end,
				segment,
				offset,
				width,
				color,
				tag
			});
		};
		const nodeOf = (end) => road.points[end ? road.points.length - 1 : 0];
		const fromNode = (end, d) => end ? total - d : d;
		const stopOuter = kerbside ? 8.1 : road.halfWidth - .6;
		const stripeCount = Math.floor((2 * road.halfWidth - 3) / 3) + 1;
		const stripes = Array.from({ length: stripeCount }, (_, i) => (i - (stripeCount - 1) / 2) * 3);
		const approach = (end) => {
			const node = nodeOf(end), f = frame(fromNode(end, 0));
			const gx = Math.round(node.x / 225), gz = Math.round(node.z / 225);
			const vx = Math.abs(gx) === 3 ? 19 : 12, vz = Math.abs(gz) === 3 ? 19 : 12;
			const alongX = street && Math.abs(f.tx) > .99, alongZ = street && Math.abs(f.tz) > .99;
			let exit = 0;
			for (; exit < 160; exit += .5) {
				const p = frame(fromNode(end, exit));
				if ((alongZ || Math.abs(p.x - node.x) >= vx) && (alongX || Math.abs(p.z - node.z) >= vz)) break;
			}
			const hasCrossing = road.kind !== "service" && Math.abs(node.x) < 675 && Math.abs(node.z) < 675;
			let crossing = null;
			const guards = street ? [[-14.25, 2.5], [14.25, 2.5]] : [[-road.halfWidth, 5], [road.halfWidth, 5]];
			if (hasCrossing) for (let d = exit + 4; d <= (street ? 54 : exit + 70); d += 2) {
				const s = fromNode(end, d);
				if (stripes.every((o) => clear(frame(s, o), 2.5)) && guards.every(([o, r]) => clear(frame(s, o), r))) {
					crossing = d;
					break;
				}
			}
			let stop = crossing === null ? null : crossing + 5;
			if (stop === null) for (let d = exit + 2; d <= exit + 40; d += 1) {
				const s = fromNode(end, d), side = end ? 1 : -1;
				if ([
					1,
					(.7 + stopOuter) / 2,
					stopOuter - .3
				].every((o) => clear(frame(s, side * o), 2.5))) {
					stop = d;
					break;
				}
			}
			const result = {
				road: road.id,
				end,
				exit,
				crossing,
				stop
			};
			allApproaches.push(result);
			return result;
		};
		const approaches = highway ? null : [approach(false), approach(true)];
		const margin = (a) => (a.stop ?? a.exit + 4) + 5;
		const start = approaches ? margin(approaches[0]) : 0;
		const finish = approaches ? total - margin(approaches[1]) : total;
		for (let s = start; s < finish; s += 2) {
			const length = Math.min(2, finish - s), mid = s + length / 2;
			if (highway) {
				for (const side of [-1, 1]) stroke(s, length, side * .24, .18, PALETTE.roadYellow, "paint-centre", false);
				if (mid % LANE_DASH < 4) for (const side of [-1, 1]) stroke(s, length, side * HIGHWAY_LANE_DIVIDER, .22, PALETTE.roadWhite, "paint-lane", false);
				stroke(s, length, 16, .22, PALETTE.roadWhite, "paint-edge", false);
				const f = frame(s), g = frame(s + length);
				if (Math.abs(f.tx - g.tx) + Math.abs(f.tz - g.tz) < 1e-9) stroke(s, length, -16, .22, PALETTE.roadWhite, "paint-edge");
				continue;
			}
			if (mid < start + 24 || mid > finish - 24) for (const side of [-1, 1]) stroke(s, length, side * .24, .18, PALETTE.roadYellow, "paint-centre");
			else if (Math.floor(mid / 6) % 2 === 0) stroke(s, length, 0, .24, PALETTE.roadYellow, "paint-centre");
			if (!kerbside) for (const side of [-1, 1]) stroke(s, length, side * (road.halfWidth - .6), .22, PALETTE.roadWhite, "paint-edge");
		}
		for (const run of runs.values()) flush(run);
		for (const end of [false, true]) {
			if (!approaches) break;
			const ap = approaches[end ? 1 : 0], node = nodeOf(end), sign = end ? 1 : -1, side = sign;
			if (ap.crossing !== null) for (const o of stripes) rect(fromNode(end, ap.crossing), o, 1.6, 3.5, PALETTE.roadWhite, "paint-crosswalk", 110);
			if (ap.stop === null) continue;
			const s = fromNode(end, ap.stop);
			rect(s, side * (.7 + stopOuter) / 2, stopOuter - .7, .5, PALETTE.roadWhite, "paint-stop", 75);
			if (!street) continue;
			const f = frame(fromNode(end, 0));
			const canContinue = graph.nodes.some((n) => Math.abs(n.x - node.x - f.tx * sign * 225) < .1 && Math.abs(n.z - node.z - f.tz * sign * 225) < .1);
			const arrow = s - sign * 10;
			if (!clear(frame(arrow, side * 4.5), 2.6)) continue;
			if (canContinue) {
				rect(arrow - sign * .5, side * 4.5, .45, 3.6, PALETTE.roadWhite, "paint-arrow", 100);
				for (const wing of [-1, 1]) rect(arrow + sign * 1.1, side * 4.5 + wing * .55, .45, 1.65, PALETTE.roadWhite, "paint-arrow", 100, PALETTE.asphalt, .064, wing * sign * Math.PI / 4);
			} else {
				const bar = arrow + sign * .6;
				rect(arrow - sign * .6, side * 4.5, .45, 2.4, PALETTE.roadWhite, "paint-arrow", 100);
				rect(bar, side * 4.5, 2.9, .45, PALETTE.roadWhite, "paint-arrow", 100);
				for (const w of [-1, 1]) for (const u of [-1, 1]) rect(bar + u * .45, side * 4.5 + w * 1.25, .45, 1.27, PALETTE.roadWhite, "paint-arrow", 100, PALETTE.asphalt, .064, Math.atan2(w, u));
			}
		}
		const style = PARKING_STYLE[road.district];
		if (!kerbside || !style) continue;
		const bayStart = start + 14, bayFinish = finish - 14;
		for (const side of [-1, 1]) {
			const offset = side * (road.halfWidth - PARKING.kerbGap - PARKING.width / 2);
			let group = [], groups = 0;
			const flushGroup = () => {
				const bays = group;
				group = [];
				if (!bays.length || groups++ % style.every !== 0) return;
				const first = bays[0] - PARKING.length / 2, last = bays[bays.length - 1] + PARKING.length / 2;
				for (const s of bays) {
					const p = frame(s, offset);
					parking.push({
						road: road.id,
						x: p.x,
						z: p.z,
						yaw: Math.atan2(p.tx, p.tz) + (side < 0 ? Math.PI : 0),
						width: PARKING.width,
						length: PARKING.length
					});
					rect(s, offset, PARKING.width, PARKING.length, PALETTE.asphaltBay, "parking-surface", 0, PALETTE.asphalt, .04);
					for (const edge of [-1, 1]) rect(s, offset + edge * (PARKING.width / 2 - .12), .24, PARKING.length, style.colour, "paint-parking-edge", 150, PALETTE.asphaltBay);
				}
				for (let s = first + .12; s <= last; s += PARKING.length) rect(s, offset, PARKING.width - .48, .24, style.colour, "paint-parking-divider", 52, PALETTE.asphaltBay);
				rect(last - .12, offset, PARKING.width - .48, .24, style.colour, "paint-parking-divider", 52, PALETTE.asphaltBay);
				if (!style.symbol) return;
				const s = bays[side > 0 ? 0 : bays.length - 1], direction = side > 0 ? 1 : -1;
				for (const [u, v, w, h] of [
					[
						-.5,
						0,
						.24,
						2
					],
					[
						0,
						.88,
						1.2,
						.24
					],
					[
						0,
						.05,
						1.2,
						.24
					],
					[
						.5,
						.46,
						.24,
						.85
					]
				]) rect(s + direction * v, offset + direction * u, w, h, PALETTE.roadWhite, "paint-parking-symbol", 65, PALETTE.asphaltBay);
			};
			let inGroup = 0;
			for (let s = bayStart + PARKING.length / 2; s + PARKING.length / 2 <= bayFinish; s += PARKING.length) {
				if (inGroup === style.group) {
					flushGroup();
					inGroup = 0;
					continue;
				}
				if (!clear(frame(s, offset), Math.hypot(PARKING.width, PARKING.length) / 2 + 2)) {
					flushGroup();
					inGroup = 0;
					continue;
				}
				group.push(s);
				inGroup++;
			}
			flushGroup();
		}
	}
	const chunks = /* @__PURE__ */ new Map();
	for (const st of statics) {
		const key = `${Math.floor((st.position.x + 225 / 2) / 225)},${Math.floor((st.position.z + 225 / 2) / 225)}`;
		const list = chunks.get(key) ?? [];
		list.push(st);
		chunks.set(key, list);
	}
	return {
		chunks,
		parking,
		approaches: allApproaches
	};
}
//#endregion
//#region src/sim/city/City.ts
/** Seeded, independently reproducible chunks. Only nearby solid bodies live in Rapier. */
const DISTRICTS = [
	{
		id: "crown",
		name: "CROWN HEIGHTS",
		color: 11835350,
		accent: 16108917,
		landmark: "Crown Tower"
	},
	{
		id: "foundry",
		name: "SUNSET WORKS",
		color: 14255976,
		accent: 6139573,
		landmark: "The Waterworks"
	},
	{
		id: "gardens",
		name: "PALM GARDENS",
		color: 15187335,
		accent: 9155971,
		landmark: "Glasshouse"
	},
	{
		id: "marina",
		name: "CORAL QUAY",
		color: 15378347,
		accent: 6801870,
		landmark: "Coral Hotel"
	}
];
function districtAt(x, z) {
	return DISTRICTS[(z >= 0 ? 2 : 0) + (x >= 0 ? 1 : 0)];
}
/** Low landmarks need an open corner; towers can rise behind the street frontage. */
const LANDMARKS = DISTRICTS.map((d, i) => {
	const offset = i < 2 ? 85 : 40;
	return {
		district: d.id,
		name: d.landmark,
		x: (i % 2 ? 450 : -450) + offset,
		z: (i < 2 ? -450 : 450) + offset,
		offset
	};
});
function chunkCoord(v) {
	return Math.max(-3, Math.min(3, Math.floor((v + 225 / 2) / 225)));
}
const PAVEMENT = 4.5;
var City = class {
	world;
	seed;
	graph = buildRoadGraph();
	roadMarkings = buildRoadMarkings(this.graph, districtAt);
	route = buildCityRoute(this.graph);
	/** Axis-aligned bounds per lane, so the reset projection skips distant lanes. */
	laneBounds = this.graph.lanes.map((lane) => {
		const b = {
			minX: Infinity,
			maxX: -Infinity,
			minZ: Infinity,
			maxZ: -Infinity
		};
		for (const pt of lane.points) {
			b.minX = Math.min(b.minX, pt.x);
			b.maxX = Math.max(b.maxX, pt.x);
			b.minZ = Math.min(b.minZ, pt.z);
			b.maxZ = Math.max(b.maxZ, pt.z);
		}
		return b;
	});
	/** Recently generated chunk descriptors: render tiles reload often at the fog edge. */
	chunkCache = /* @__PURE__ */ new Map();
	frames = /* @__PURE__ */ new Map();
	joins = /* @__PURE__ */ new Map();
	spawns;
	active = /* @__PURE__ */ new Map();
	loaded = 0;
	unloaded = 0;
	cx = Infinity;
	cz = Infinity;
	complete = false;
	constructor(world, seed = 42) {
		this.world = world;
		this.seed = seed;
		world.createCollider(RAPIER.ColliderDesc.cuboid(CITY_HALF, .5, CITY_HALF).setTranslation(0, -.5, 0).setFriction(1).setCollisionGroups(GROUPS_TERRAIN));
		for (const axis of [0, 1]) for (const sign of [-1, 1]) world.createCollider(RAPIER.ColliderDesc.cuboid(axis === 0 ? 1 : CITY_HALF, 2, axis === 1 ? 1 : CITY_HALF).setTranslation(axis === 0 ? sign * CITY_HALF : 0, 2, axis === 1 ? sign * CITY_HALF : 0).setCollisionGroups(GROUPS_SOLID).setRestitution(1));
		this.spawns = [];
		const start = this.route.start;
		this.spawns.unshift({
			name: "city",
			position: {
				x: start.x,
				y: 1,
				z: start.z
			},
			yaw: start.yaw
		});
		for (const [name, x, z] of [
			[
				"crown",
				-450,
				-450
			],
			[
				"foundry",
				450,
				-450
			],
			[
				"gardens",
				-450,
				450
			],
			[
				"marina",
				450,
				450
			],
			[
				"highway",
				-675,
				0
			]
		]) this.spawns.push({
			name,
			position: {
				x: x - (name === "highway" ? HIGHWAY_LANE_OFFSETS[0] : 4.5),
				y: 1,
				z: z + 40
			},
			yaw: 0
		});
		const first = this.graph.lanes.find((l) => l.special === "Crown Diagonal West" && this.graph.nodes[l.from]?.x === -675);
		if (first) this.spawns.push({
			name: "loop",
			position: {
				x: first.x0,
				y: 1,
				z: first.z0
			},
			yaw: first.yaw0
		});
	}
	generate(cx, cz) {
		const x = cx * 225, z = cz * 225;
		const rnd = mulberry32(this.seed ^ Math.imul(cx + 19, 73856093) ^ Math.imul(cz + 23, 19349663));
		const statics = [];
		const architecture = new Architecture(statics);
		const box = architecture.box.bind(architecture);
		const cylinder = architecture.cylinder.bind(architecture);
		const vx = Math.abs(cx) === 3 ? 19 : 12;
		const vz = Math.abs(cz) === 3 ? 19 : 12;
		box(x, -.06, z, 225 / 2, .05, 225 / 2, PALETTE.grass, "ground");
		box(x, 0, z, vx, .01, 225 / 2, PALETTE.asphalt, "road");
		for (const side of [-1, 1]) {
			const half = (225 / 2 - vx) / 2;
			box(x + side * (vx + half), 0, z, half, .01, vz, PALETTE.asphalt, "road");
		}
		statics.push(...this.roadMarkings.chunks.get(`${cx},${cz}`) ?? []);
		const corridors = this.graph.special.filter((road) => road.centre.some((pt) => Math.abs(pt.x - x) < 225 / 2 + road.halfWidth + 8 && Math.abs(pt.z - z) < 225 / 2 + road.halfWidth + 8));
		const roadClearance = (px, pz) => {
			let best = Infinity;
			for (const road of corridors) best = Math.min(best, distanceToPolyline(road.centre, px, pz) - road.halfWidth);
			return best;
		};
		const joinCuts = [];
		for (const road of corridors) {
			const joins = this.joinsFor(road);
			joinCuts.push(...joins.cuts);
			for (const piece of joins.prisms) {
				let mx = 0, mz = 0;
				for (const pt of piece.points) {
					mx += pt.x / piece.points.length;
					mz += pt.z / piece.points.length;
				}
				if (Math.abs(mx - x) < 225 / 2 && Math.abs(mz - z) < 225 / 2) architecture.prism(piece.points, 0, .14, piece.colour);
			}
		}
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
			const d = districtAt(x + sx * 55, z + sz * 55);
			const c = CITY_COLORS;
			const hx = (225 / 2 - vx) / 2, hz = (225 / 2 - vz) / 2;
			const qx = x + sx * (vx + hx), qz = z + sz * (vz + hz);
			const open = corridors.some((road) => road.centre.some((pt) => Math.abs(pt.x - qx) < hx + road.halfWidth + 6 && Math.abs(pt.z - qz) < hz + road.halfWidth + 6));
			if (!open) {
				box(qx, .07, qz, hx, .07, hz, d.id === "foundry" ? c.yard : c.soil, "kerb");
				box(x + sx * (vx + 2.25), .145, z + sz * (vz + hz), 2.25, .005, hz, PALETTE.kerb, "decor", "top");
				box(x + sx * (vx + hx), .145, z + sz * (vz + 2.25), hx, .005, 2.25, PALETTE.kerb, "decor", "top");
			} else {
				box(qx, .008, qz, hx, .001, hz, d.id === "foundry" ? c.yard : d.id === "gardens" ? PALETTE.grass : c.soil, "decor", "top");
				for (const axis of ["x", "z"]) {
					const length = axis === "x" ? hz * 2 : hx * 2;
					const start = axis === "x" ? vz : vx;
					const line = axis === "x" ? x + sx * (vx + 2.25) : z + sz * (vz + 2.25);
					const cuts = joinCuts.filter((cut) => cut.axis === axis && Math.abs(cut.line - line) < .1);
					let runStart = -1;
					for (let along = 0; along <= length + 1e-6; along += 1.5) {
						const end = along >= length;
						const px = axis === "x" ? x + sx * (vx + 2.25) : x + sx * (start + along);
						const pz = axis === "x" ? z + sz * (start + along) : z + sz * (vz + 2.25);
						const free = axis === "x" ? pz : px;
						const blocked = end || roadClearance(px, pz) < 2.5 || cuts.some((cut) => free >= cut.from && free <= cut.to);
						if (!blocked && runStart < 0) {
							const snap = cuts.find((cut) => free - (axis === "x" ? sz : sx) * 1.5 <= cut.to && free > cut.to);
							runStart = snap ? (axis === "x" ? sz * (snap.to - z) : sx * (snap.to - x)) - start : along;
						}
						if (blocked && runStart >= 0) {
							const stop = Math.min(along, length), mid = start + (runStart + stop) / 2, half = (stop - runStart) / 2;
							if (half > 1) {
								if (axis === "x") box(x + sx * (vx + 2.25), .07, z + sz * mid, 2.25, .07, half, PALETTE.kerb, "kerb");
								else box(x + sx * mid, .07, z + sz * (vz + 2.25), half, .07, 2.25, PALETTE.kerb, "kerb");
							}
							runStart = -1;
						}
					}
				}
			}
			for (const ox of [40, 85]) for (const oz of [40, 85]) {
				const landmarkOffset = d.id === "crown" || d.id === "foundry" ? 85 : 40;
				if (Math.abs(cx) === 2 && Math.abs(cz) === 2 && sx === 1 && sz === 1 && ox === landmarkOffset && oz === landmarkOffset) continue;
				if (open && [
					[0, 0],
					[-18, -18],
					[18, -18],
					[-18, 18],
					[18, 18]
				].some(([ex, ez]) => roadClearance(x + sx * ox + ex, z + sz * oz + ez) < 40)) continue;
				const backlot = ox === 85 && oz === 85;
				if (Math.abs(x + sx * ox) > 702 || Math.abs(z + sz * oz) > 702 || backlot && d.id === "gardens" || backlot && rnd() < .35) {
					const px = x + sx * ox, pz = z + sz * oz;
					box(px, .16, pz, 18, .015, 18, PALETTE.grass, "decor", "top");
					box(px, .18, pz, 1.6, .01, 18, PALETTE.kerb, "decor", "top");
					architecture.tree(px - 7, pz, d.id === "marina");
					architecture.tree(px + 9, pz + 8, d.id === "marina");
					box(px + 4, .65, pz - 5, 1.4, .12, .4, c.brick);
					box(px + 4, .9, pz - 5.35, 1.4, .35, .08, c.brick);
					continue;
				}
				const variant = Math.floor(rnd() * 3);
				const w = d.id === "gardens" ? 7 + variant : (ox === 85 ? 15 : 10) + variant;
				const depth = d.id === "gardens" ? 8 + variant : (oz === 85 ? 16 : 10) + variant;
				const setback = d.id === "gardens" ? 6 : d.id === "foundry" ? 7 : 1.3;
				const px = x + sx * (ox === 40 ? vx + 4.5 + setback + w : 82);
				const pz = z + sz * (oz === 40 ? vz + 4.5 + setback + depth : 82);
				const centreDistance = Math.hypot(px + 365, pz + 365);
				const floors = d.id === "crown" ? backlot ? 7 + Math.max(0, 5 - Math.floor(centreDistance / 100)) : 3 + variant : d.id === "foundry" ? 1 : d.id === "gardens" ? 2 : 3 + variant;
				architecture.building(px, pz, w, depth, d.id, sx, sz, floors, variant, d.accent, ox === 40 || backlot, oz === 40 || backlot);
				if (ox === 40) box(x + sx * (vx + 4.5 + setback / 2), .17, pz, setback / 2, .01, 1.5, PALETTE.kerb, "decor", "top");
				if (oz === 40) box(px, .17, z + sz * (vz + 4.5 + setback / 2), 1.5, .01, setback / 2, PALETTE.kerb, "decor", "top");
				if (d.id === "gardens") {
					if (ox === 40) {
						architecture.tree(x + sx * (vx + 7), pz + sz * 5);
						box(x + sx * (vx + 5.5), .65, pz - sz * 6, .7, .5, 4, c.hedge);
					}
				}
			}
			if (d.id !== "foundry") for (const along of [57, 106]) {
				if (roadClearance(x + sx * (vx + 2.7), z + sz * along) > 3) architecture.tree(x + sx * (vx + 2.7), z + sz * along, d.id === "marina");
				if (roadClearance(x + sx * along, z + sz * (vz + 2.7)) > 3) architecture.tree(x + sx * along, z + sz * (vz + 2.7), d.id === "marina");
			}
			for (const offset of [36, 80]) {
				if (roadClearance(x + sx * (vx + 2), z + sz * offset) < 1.5) continue;
				box(x + sx * (vx + 2), 4, z + sz * offset, .18, 4, .18, 6841976);
				box(x + sx * (vx + 1), 8, z + sz * offset, 1.4, .28, .45, PALETTE.laneMark);
			}
		}
		if (Math.abs(cx) === 2 && Math.abs(cz) === 2) {
			const d = districtAt(x, z);
			const site = LANDMARKS.find((l) => l.district === d.id);
			if (!site) throw new Error(`Missing landmark for ${d.id}`);
			const px = site.x, pz = site.z;
			box(px, .165, pz, 24, .015, 24, PALETTE.kerb, "decor", "top");
			if (site.offset === 85) {
				box(x + 49, .165, pz + 20, 36, .015, 2, PALETTE.kerb, "decor", "top");
				box(px + 20, .165, z + 49, 2, .015, 36, PALETTE.kerb, "decor", "top");
			} else {
				box(x + 15, .165, pz, 3, .015, 2, PALETTE.kerb, "decor", "top");
				box(px, .165, z + 15, 2, .015, 3, PALETTE.kerb, "decor", "top");
			}
			if (d.id === "crown") {
				architecture.building(px, pz, 14, 14, "crown", 1, 1, 30, 0, d.accent);
				box(px, 97, pz, 10, 3, 10, CITY_COLORS.stone, "building");
				box(px, 103, pz, 6, 3, 6, d.accent);
				box(px, 115, pz, .4, 9, .4, d.accent);
			} else if (d.id === "foundry") {
				for (const a of [-8, 8]) for (const b of [-8, 8]) box(px + a, 15, pz + b, 1, 15, 1, d.accent, "building");
				cylinder(px, 34, pz, 14, 6, d.color);
				box(px, 40.5, pz, 14, .5, 14, d.accent);
				cylinder(px + 30, 33, pz - 30, 2.4, 33, CITY_COLORS.brick);
				cylinder(px + 30, 62, pz - 30, 2.6, 1.5, d.accent);
				cylinder(px + 30, 66, pz - 30, 2.6, 1.5, PALETTE.laneMark);
				box(px + 30, 3, pz - 30, 4, 3, 4, CITY_COLORS.brick, "building");
			} else if (d.id === "gardens") {
				box(px, 5, pz, 18, 5, 18, d.accent, "building");
				for (const side of [-1, 1]) for (const bay of [
					-12,
					-6,
					0,
					6,
					12
				]) {
					box(px + side * 18.08, 5.3, pz + bay, .01, 3.8, 2.5, CITY_COLORS.windowLight, "decor", side > 0 ? "x+" : "x-");
					box(px + bay, 5.3, pz + side * 18.08, 2.5, 3.8, .01, CITY_COLORS.windowLight, "decor", side > 0 ? "z+" : "z-");
				}
				box(px - 18.1, 1.4, pz, .01, 1.2, 1.2, CITY_COLORS.shop, "decor", "x-");
				cylinder(px, 12, pz, 17, 2, PALETTE.glass);
				cylinder(px, 15, pz, 12, 1, PALETTE.glass);
				cylinder(px, 17, pz, 6, 1, d.accent);
				cylinder(px + 26, 23, pz + 26, .7, 23, CITY_COLORS.trim);
				box(px + 26, 47.5, pz + 26, 1.6, 1.6, 1.6, d.accent);
				box(px + 26, 1, pz + 26, 2.5, 1, 2.5, CITY_COLORS.stone, "building");
			} else {
				architecture.building(px, pz, 16, 12, "marina", 1, 1, 14, 0, d.accent);
				box(px, 46.5, pz, 7, 2, 10, d.accent, "building");
				box(px, 50, pz, 11, 1.4, .4, PALETTE.laneMark);
				box(px, 50, pz, .4, 1.4, 12, PALETTE.laneMark);
				for (const side of [-1, 1]) architecture.tree(px + side * 21, pz - 19, true);
			}
		}
		for (const road of corridors) this.specialRoad(road, cx, cz, architecture);
		if (cx === 3 && cz === 2 || cx === 2 && cz === 3) this.waterfront(cx, architecture);
		if (cx === 3 && cz >= 1 || cz === 3 && cx >= 1) this.promenade(cx, cz, architecture);
		const quay = x > 0 && z > 0;
		if (Math.abs(cx) === 3) {
			box(Math.sign(cx) * CITY_HALF, quay ? .55 : 2, z, 1, quay ? .55 : 2, 225 / 2, PALETTE.kerb, "boundary");
			if (quay) box(Math.sign(cx) * CITY_HALF, 1.16, z, 1.15, .07, 225 / 2, CITY_COLORS.trim, "boundary");
		}
		if (Math.abs(cz) === 3) {
			box(x, quay ? .55 : 2, Math.sign(cz) * CITY_HALF, 225 / 2, quay ? .55 : 2, 1, PALETTE.kerb, "boundary");
			if (quay) box(x, 1.16, Math.sign(cz) * CITY_HALF, 225 / 2, .07, 1.15, CITY_COLORS.trim, "boundary");
		}
		const billboards = placeBillboards(cx, cz, statics, roadClearance);
		return {
			key: `${cx},${cz}`,
			x: cx,
			z: cz,
			statics,
			billboards
		};
	}
	/** Coral Quay's seawall edge: paved promenade, railing, palms, benches and masts. */
	promenade(cx, cz, architecture) {
		const box = architecture.box.bind(architecture), c = CITY_COLORS;
		const start = architecture.statics.length;
		const half = 225 / 2, wall = CITY_HALF;
		box(0, .16, -5, half, .02, 4, PALETTE.kerb, "decor", "top");
		for (let u = -101.5; u < half; u += 22) architecture.tree(u, -8.5, true);
		for (let u = -90.5; u < half; u += 44) {
			box(u, .6, -3.2, 1.2, .08, .35, c.brick);
			box(u, .85, -3.5, 1.2, .3, .06, c.brick);
		}
		for (let u = -82.5; u < half; u += 75) architecture.mast(u, -7.6);
		const yaw = cx === 3 ? Math.PI / 2 : 0;
		architecture.rotateFrom(start, cx === 3 ? wall : cx * 225, cx === 3 ? cz * 225 : wall, yaw);
	}
	/** Coral Quay's sea edge: a pier with a pavilion and moored boats beyond the seawall. */
	waterfront(cx, architecture) {
		const box = architecture.box.bind(architecture), c = CITY_COLORS;
		const start = architecture.statics.length;
		box(31, 1.2, 0, 31, .22, 4.2, c.trim);
		for (let d = 4; d < 62; d += 8) for (const side of [-1, 1]) architecture.cylinder(d, .1, side * 3.4, .3, 1.1, c.roof);
		for (let d = 8; d < 60; d += 16) box(d, 2, -4.6, .12, .6, .12, c.roof);
		box(57, 3.3, 0, 3.6, 1.9, 3.6, PALETTE.kerb);
		architecture.statics.push({
			shape: {
				kind: "gable",
				hx: 4.2,
				hy: 1.4,
				hz: 4.2
			},
			position: {
				x: 57,
				y: 6.4,
				z: 0
			},
			rotation: IDENTITY_QUAT,
			color: c.brick,
			tag: "decor"
		});
		box(24, 4.2, 4.8, .14, 3, .14, 6841976);
		box(24, 7.2, 4.8, .45, .14, 1.2, PALETTE.laneMark);
		for (const [bx, bz, colour] of [
			[
				16,
				-13,
				PALETTE.carWhite
			],
			[
				30,
				12,
				PALETTE.carBlue
			],
			[
				46,
				-12,
				PALETTE.carOrange
			],
			[
				70,
				9,
				PALETTE.carWhite
			]
		]) {
			box(bx, -.1, bz, 3.2, .5, 1.2, colour);
			box(bx + .4, .9, bz, 1.2, .55, .9, c.chalk);
			box(bx - .6, 1.9, bz, .06, 1.4, .06, c.roof);
		}
		const yaw = cx === 3 ? Math.PI / 2 : 0;
		architecture.rotateFrom(start, cx === 3 ? CITY_HALF : 400, cx === 3 ? 400 : CITY_HALF, yaw);
	}
	/** Simplified landmark shapes for the renderer's always-visible skyline layer. */
	landmarkSilhouettes() {
		const statics = [];
		const a = new Architecture(statics), c = CITY_COLORS;
		for (const site of LANDMARKS) {
			const d = DISTRICTS.find((x) => x.id === site.district);
			if (!d) continue;
			const { x, z } = site;
			if (site.district === "crown") {
				a.box(x, 46.9, z, 13.5, 46.9, 13.5, c.stone, "skyline");
				a.box(x, 97, z, 9.6, 2.9, 9.6, c.stone, "skyline");
				a.box(x, 103, z, 5.7, 2.9, 5.7, d.accent, "skyline");
				a.box(x, 115, z, .38, 8.8, .38, d.accent, "skyline");
			} else if (site.district === "foundry") {
				for (const p of [-8, 8]) for (const q of [-8, 8]) a.box(x + p, 15, z + q, .9, 14.9, .9, d.accent, "skyline");
				a.cylinder(x, 34, z, 13.6, 5.9, d.color);
				a.cylinder(x + 30, 33, z - 30, 2.3, 32.9, c.brick);
				a.cylinder(x + 30, 62, z - 30, 2.5, 1.4, d.accent);
			} else if (site.district === "gardens") {
				a.cylinder(x, 12, z, 16.5, 1.9, PALETTE.glass);
				a.cylinder(x + 26, 23, z + 26, .65, 22.9, c.trim);
				a.box(x + 26, 47.5, z + 26, 1.5, 1.5, 1.5, d.accent, "skyline");
			} else {
				a.box(x, 22.3, z, 15.5, 22.2, 11.5, c.peach, "skyline");
				a.box(x, 46.5, z, 6.8, 1.9, 9.8, d.accent, "skyline");
				a.box(x, 50, z, 10.8, 1.3, .38, PALETTE.laneMark, "skyline");
			}
		}
		for (const st of statics) st.tag = "skyline";
		return statics;
	}
	/**
	* One authored road, drawn segment by segment; a segment belongs to the chunk
	* that contains its midpoint, so neighbouring chunks never draw it twice. The
	* surface is a raised top face over the grid cross, so junction overlaps do not
	* z-fight; pavements are rotated kerb boxes that stop short of the junctions.
	*/
	specialRoad(road, cx, cz, architecture) {
		const x = cx * 225, z = cz * 225, hw = road.halfWidth;
		const box = architecture.box.bind(architecture);
		const joins = this.joinsFor(road);
		const a0 = road.centre[0], a1 = road.centre[road.centre.length - 1];
		const nearJunction = (px, pz, margin) => Math.max(Math.abs(px - a0.x), Math.abs(pz - a0.z)) < margin || Math.max(Math.abs(px - a1.x), Math.abs(pz - a1.z)) < margin;
		const onGridStreet = (px, pz) => {
			const gx = Math.round(px / 225), gz = Math.round(pz / 225);
			const halfX = Math.abs(gx) === 3 ? 19 : 12, halfZ = Math.abs(gz) === 3 ? 19 : 12;
			return Math.abs(px - gx * 225) < halfX + 5 || Math.abs(pz - gz * 225) < halfZ + 5;
		};
		const c = CITY_COLORS;
		const paving = road.kind === "service" ? c.yard : road.kind === "parkway" ? PALETTE.grass : PALETTE.kerb;
		const frontage = road.kind === "avenue" ? {
			district: "crown",
			hx: 10,
			hz: 10,
			gap: 3,
			setback: 1.3,
			floors: 4,
			accent: 16108917
		} : road.kind === "quay" ? {
			district: "marina",
			hx: 12,
			hz: 9,
			gap: 5,
			setback: 1.3,
			floors: 4,
			accent: 6801870
		} : road.kind === "parkway" ? {
			district: "gardens",
			hx: 8,
			hz: 8,
			gap: 8,
			setback: 6,
			floors: 2,
			accent: 9155971
		} : null;
		const vx = Math.abs(cx) === 3 ? 19 : 12, vz = Math.abs(cz) === 3 ? 19 : 12;
		const footprintClear = (px, pz, yaw, hx, hz) => {
			const cos = Math.cos(yaw), sin = Math.sin(yaw);
			for (const [lx, lz] of [
				[-hx, -hz],
				[hx, -hz],
				[-hx, hz],
				[hx, hz]
			]) {
				const wx = px + cos * lx + sin * lz, wz = pz - sin * lx + cos * lz;
				const dx = Math.abs(wx - x), dz = Math.abs(wz - z);
				if (Math.min(dx, 225 - dx) < vx + 5 || Math.min(dz, 225 - dz) < vz + 5) return false;
				if (Math.abs(wx) > 779.5 || Math.abs(wz) > 779.5) return false;
			}
			return true;
		};
		const pitch = frontage ? 2 * frontage.hx + frontage.gap : Infinity;
		const fronts = [{
			side: 1,
			next: 40
		}, {
			side: -1,
			next: 40 + pitch / 2
		}];
		let along = 0, nextTree = 13, nextLamp = 30, nextYard = 45;
		for (let i = 0; i + 1 < road.centre.length; i++) {
			const a = road.centre[i], b = road.centre[i + 1];
			const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
			const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, yaw = Math.atan2(dx, dz);
			const rot = quatFromYaw(yaw);
			const nx = -dz / len, nz = dx / len;
			const startAlong = along;
			along += len;
			if (Math.abs(mx - x) >= 225 / 2 || Math.abs(mz - z) >= 225 / 2) continue;
			const surface = box(mx, .033, mz, hw, .001, len / 2 + .25, PALETTE.asphalt, "road", "top");
			surface.rotation = rot;
			for (const side of [-1, 1]) {
				const startClip = joins.start[side > 0 ? 1 : 0], endClip = joins.end[side > 0 ? 1 : 0];
				let ta = startAlong, tb = along, dirA = null, dirB = null;
				if (startClip && startClip.t > ta) {
					if (startClip.t >= tb) continue;
					ta = startClip.t;
					dirA = startClip.dir;
				}
				if (endClip && endClip.t < tb) {
					if (endClip.t <= ta) continue;
					tb = endClip.t;
					dirB = endClip.dir;
				}
				const pa = this.sampleRoad(road, ta), pb = this.sampleRoad(road, tb);
				const ea = {
					x: pa.x + pa.nx * side * hw,
					z: pa.z + pa.nz * side * hw
				}, eb = {
					x: pb.x + pb.nx * side * hw,
					z: pb.z + pb.nz * side * hw
				};
				const oa = dirA ?? {
					x: pa.nx * side,
					z: pa.nz * side
				}, ob = dirB ?? {
					x: pb.nx * side,
					z: pb.nz * side
				};
				const quad = [
					ea,
					eb,
					{
						x: eb.x + ob.x * PAVEMENT,
						z: eb.z + ob.z * PAVEMENT
					},
					{
						x: ea.x + oa.x * PAVEMENT,
						z: ea.z + oa.z * PAVEMENT
					}
				];
				if (paving === PALETTE.grass) {
					architecture.prism(quad, 0, .13, c.soil);
					architecture.prism(quad, .13, .14, PALETTE.grass, "decor");
				} else architecture.prism(quad, 0, .14, paving);
			}
			if (!nearJunction(mx, mz, 24)) {
				while (nextTree < along) {
					if (nextTree >= startAlong && road.kind !== "service") {
						const t = (nextTree - startAlong) / len, side = Math.floor(nextTree / 27) % 2 ? 1 : -1;
						const tx = a.x + dx * t + nx * side * (hw + 2.7), tz = a.z + dz * t + nz * side * (hw + 2.7);
						if (!onGridStreet(tx, tz)) architecture.tree(tx, tz, road.kind === "quay");
					}
					nextTree += 27;
				}
				for (const front of fronts) while (frontage && front.next < along) {
					if (front.next >= startAlong) {
						const ts = (front.next - startAlong) / len, index = Math.round(front.next / pitch), side = front.side;
						const ox = nx * side, oz = nz * side;
						const yaw = Math.atan2(ox, oz), variant = (index * 7 + (side > 0 ? 0 : 1)) % 3;
						const depth = frontage.hz + (variant === 1 ? 1 : 0), width = frontage.hx + (variant === 2 ? 1 : 0) + (index * 3 + (side > 0 ? 1 : 0)) % 3 - 1;
						const centre = hw + 4.5 + frontage.setback + depth;
						const px = a.x + dx * ts + ox * centre, pz = a.z + dz * ts + oz * centre;
						if (!nearJunction(px, pz, 20 + width) && footprintClear(px, pz, yaw, width + 1.5, depth + 1.5)) {
							const floors = road.kind === "avenue" ? 4 + Math.round(6 * Math.max(0, 1 - Math.hypot(px + 450, pz + 450) / 330)) : road.kind === "quay" ? [
								3,
								4,
								6,
								4,
								5
							][index % 5] : frontage.floors + (variant === 1 ? 1 : 0);
							architecture.rotatedBuilding(px, pz, yaw, width, depth, frontage.district, floors, variant, frontage.accent);
							const path = box(a.x + dx * ts + ox * (hw + 4.5 + frontage.setback / 2), .17, a.z + dz * ts + oz * (hw + 4.5 + frontage.setback / 2), 1.5, .01, frontage.setback / 2, PALETTE.kerb, "decor", "top");
							path.rotation = quatFromYaw(yaw);
						}
					}
					front.next += pitch;
				}
				while (road.kind === "service" && nextYard < along) {
					if (nextYard >= startAlong) {
						const t = (nextYard - startAlong) / len, k = Math.round(nextYard / 30), side = k % 2 ? -1 : 1;
						const ox = nx * side, oz = nz * side, ax = a.x + dx * t, az = a.z + dz * t;
						const place = (offset) => ({
							x: ax + ox * offset,
							z: az + oz * offset
						});
						const clear = (pt, r) => footprintClear(pt.x, pt.z, yaw, r, r);
						const kind = k % 5;
						if (kind === 0 || kind === 3) {
							const row = place(hw + 13);
							if (clear(row, 8)) {
								architecture.container(row.x, row.z, yaw + Math.PI / 2, PALETTE.carOrange);
								const back = place(hw + 16.2);
								if (clear(back, 8)) {
									architecture.container(back.x, back.z, yaw + Math.PI / 2, PALETTE.carBlue);
									architecture.container(back.x, back.z, yaw + Math.PI / 2, CITY_COLORS.brick, 1);
								}
							}
						} else if (kind === 1) {
							const pt = place(hw + 15);
							if (clear(pt, 7)) architecture.tank(pt.x, pt.z, 4.2, 7.5, CITY_COLORS.stone, road.kind === "service" ? 6139573 : PALETTE.laneMark);
						} else if (kind === 2) {
							const pt = place(hw + 20);
							if (clear(pt, 13)) architecture.gantry(pt.x, pt.z, yaw + Math.PI / 2, 22, 6139573);
						} else {
							const pt = place(hw + 12);
							if (clear(pt, 3)) architecture.mast(pt.x, pt.z);
						}
						const f = place(hw + 5.6);
						if (footprintClear(f.x, f.z, yaw, 13, .5)) architecture.fence(f.x, f.z, yaw + Math.PI / 2, 26);
					}
					nextYard += 30;
				}
				while (nextLamp < along) {
					if (nextLamp >= startAlong) {
						const t = (nextLamp - startAlong) / len, side = Math.floor(nextLamp / 45) % 2 ? -1 : 1;
						const px = a.x + dx * t + nx * side * (hw + 2), pz = a.z + dz * t + nz * side * (hw + 2);
						if (onGridStreet(px, pz)) {
							nextLamp += 45;
							continue;
						}
						box(px, 4, pz, .18, 4, .18, 6841976);
						const head = box(px - nx * side, 8, pz - nz * side, .45, .28, 1.4, PALETTE.laneMark);
						head.rotation = rot;
					}
					nextLamp += 45;
				}
			}
		}
	}
	/** Cumulative lengths and averaged right normals of an authored road's centreline. */
	frame(road) {
		const cached = this.frames.get(road.name);
		if (cached) return cached;
		const pts = road.centre, n = pts.length, cum = [0], nx = [], nz = [];
		for (let i = 0; i + 1 < n; i++) {
			const a = pts[i], b = pts[i + 1];
			cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
		}
		for (let i = 0; i < n; i++) {
			const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
			const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
			nx.push(-tz / l);
			nz.push(tx / l);
		}
		const frame = {
			cum,
			nx,
			nz,
			total: cum[n - 1]
		};
		this.frames.set(road.name, frame);
		return frame;
	}
	/** Centreline point and unit right normal at `t` metres from the road's first junction. */
	sampleRoad(road, t) {
		const f = this.frame(road), pts = road.centre;
		const tt = Math.max(0, Math.min(f.total, t));
		let i = 0;
		while (i + 2 < pts.length && f.cum[i + 1] < tt) i++;
		const seg = f.cum[i + 1] - f.cum[i] || 1, u = (tt - f.cum[i]) / seg;
		const a = pts[i], b = pts[i + 1];
		const nx = f.nx[i] + (f.nx[i + 1] - f.nx[i]) * u;
		const nz = f.nz[i] + (f.nz[i + 1] - f.nz[i]) * u;
		const l = Math.hypot(nx, nz) || 1;
		return {
			x: a.x + (b.x - a.x) * u,
			z: a.z + (b.z - a.z) * u,
			nx: nx / l,
			nz: nz / l
		};
	}
	/**
	* How an authored road's pavements meet the grid at both of its junctions.
	* For each side of the road, its carriageway edge E(u) is followed out of the
	* junction cross (u = metres from the node). The grid strip it leaves through is
	* the one it joins. If the side faces that street, the pavement between the two
	* carriageways is a wedge from the point where they separate until it is 9 m
	* wide; there the road's own band and the grid strip take over, both starting on
	* the wedge's end edge. If the side faces away, the road is crossing the strip
	* and the uncovered remainder is a sliver. Nothing overlaps and nothing is missing.
	*/
	joinsFor(road) {
		const cached = this.joins.get(road.name);
		if (cached) return cached;
		const f = this.frame(road), hw = road.halfWidth;
		const joins = {
			prisms: [],
			cuts: [],
			start: [null, null],
			end: [null, null]
		};
		for (const end of ["a0", "a1"]) {
			const node = end === "a0" ? road.centre[0] : road.centre[road.centre.length - 1];
			const gx = Math.round(node.x / 225), gz = Math.round(node.z / 225);
			const vx = Math.abs(gx) === 3 ? 19 : 12, vz = Math.abs(gz) === 3 ? 19 : 12;
			const T = (u) => end === "a0" ? u : f.total - u;
			for (const side of [-1, 1]) {
				const edge = (u) => {
					const s = this.sampleRoad(road, T(u));
					return {
						x: s.x + s.nx * side * hw,
						z: s.z + s.nz * side * hw,
						nx: s.nx * side,
						nz: s.nz * side
					};
				};
				let uExit = -1;
				for (let u = 0; u <= Math.min(140, f.total / 2); u += .5) {
					const e = edge(u);
					if (Math.abs(e.x - node.x) > vx && Math.abs(e.z - node.z) > vz) {
						uExit = u;
						break;
					}
				}
				if (uExit < 0) continue;
				const ex = edge(uExit);
				const sx = Math.sign(ex.x - node.x), sz = Math.sign(ex.z - node.z);
				const axis = Math.abs(ex.x - node.x) - vx <= Math.abs(ex.z - node.z) - vz ? "x" : "z";
				const kerbLine = axis === "x" ? node.x + sx * vx : node.z + sz * vz;
				const outerLine = axis === "x" ? node.x + sx * (vx + PAVEMENT) : node.z + sz * (vz + PAVEMENT);
				const stripLine = axis === "x" ? node.x + sx * (vx + PAVEMENT / 2) : node.z + sz * (vz + PAVEMENT / 2);
				const off = (e) => axis === "x" ? Math.abs(e.x - node.x) : Math.abs(e.z - node.z);
				const free = (e) => axis === "x" ? e.z : e.x;
				const half = axis === "x" ? vx : vz;
				const faces = (axis === "x" ? -sx * ex.nx : -sz * ex.nz) > 0;
				const target = faces ? half + 2 * PAVEMENT : half + PAVEMENT;
				let uEnd = -1;
				for (let u = uExit; u <= Math.min(160, f.total / 2); u += .5) if (off(edge(u)) >= target) {
					uEnd = u;
					break;
				}
				if (uEnd < 0) continue;
				const us = [uExit + (faces ? 2.5 : 0)];
				for (const cum of f.cum) {
					const u = end === "a0" ? cum : f.total - cum;
					if (u > us[0] + .5 && u < uEnd - .5) us.push(u);
				}
				us.sort((a, b) => a - b);
				us.push(uEnd);
				const foot = (e, line) => axis === "x" ? {
					x: line,
					z: e.z
				} : {
					x: e.x,
					z: line
				};
				for (let i = 0; i + 1 < us.length; i++) {
					const ea = edge(us[i]), eb = edge(us[i + 1]);
					const line = faces ? kerbLine : outerLine;
					const raw = [
						ea,
						eb,
						foot(eb, line),
						foot(ea, line)
					].map((pt) => ({
						x: pt.x,
						z: pt.z
					}));
					const points = raw.filter((pt, i) => {
						const prev = raw[(i + raw.length - 1) % raw.length];
						return Math.hypot(pt.x - prev.x, pt.z - prev.z) > .05;
					});
					if (points.length < 3) continue;
					joins.prisms.push({
						points,
						colour: PALETTE.kerb
					});
				}
				const eEnd = edge(uEnd);
				const fromFree = free(edge(uExit)), toFree = free(eEnd);
				joins.cuts.push({
					axis,
					line: stripLine,
					from: Math.min(fromFree, toFree) - 3,
					to: Math.max(fromFree, toFree)
				});
				let dir = null;
				if (faces) {
					const q = foot(eEnd, kerbLine), l = Math.hypot(q.x - eEnd.x, q.z - eEnd.z) || 1;
					dir = {
						x: (q.x - eEnd.x) / l,
						z: (q.z - eEnd.z) / l
					};
				}
				const clip = {
					t: T(uEnd),
					dir
				};
				const index = side > 0 ? 1 : 0;
				if (end === "a0") joins.start[index] = clip;
				else joins.end[index] = clip;
			}
		}
		this.joins.set(road.name, joins);
		return joins;
	}
	/**
	* Keep the 3×3 neighbourhood resident. A normal step loads at most one missing
	* chunk (nearest first), so crossing into a new row costs three steps instead of
	* one long one; a spawn or teleport loads all of them before the next step.
	* Removal waits until the neighbourhood is complete: load before removal.
	*/
	sync(x, z, immediate = false) {
		const cx = chunkCoord(x), cz = chunkCoord(z);
		if (cx === this.cx && cz === this.cz && this.complete) return;
		this.cx = cx;
		this.cz = cz;
		let missing = 0;
		for (let pass = 0; pass < (immediate ? 9 : 1); pass++) {
			let best = Infinity, bx = 0, bz = 0;
			missing = 0;
			for (let iz = Math.max(-3, cz - 1); iz <= Math.min(3, cz + 1); iz++) for (let ix = Math.max(-3, cx - 1); ix <= Math.min(3, cx + 1); ix++) {
				if (this.active.has(`${ix},${iz}`)) continue;
				missing++;
				const d = (ix - cx) ** 2 + (iz - cz) ** 2;
				if (d < best) {
					best = d;
					bx = ix;
					bz = iz;
				}
			}
			if (!missing) break;
			this.load(bx, bz);
			missing--;
		}
		this.complete = missing === 0;
		if (!this.complete) return;
		for (const [key, entry] of this.active) if (Math.abs(entry.chunk.x - cx) > 2 || Math.abs(entry.chunk.z - cz) > 2) {
			this.world.removeRigidBody(entry.body);
			this.active.delete(key);
			this.unloaded++;
		}
	}
	load(ix, iz) {
		const chunk = this.chunk(ix, iz);
		const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
		for (const st of chunk.statics) {
			if (st.tag !== "building" && st.tag !== "kerb") continue;
			if (st.shape.kind === "prism") {
				const pts = st.shape.points, y0 = st.shape.y0, y1 = st.shape.y1, hull = new Float32Array(pts.length * 6);
				pts.forEach((pt, i) => {
					hull.set([
						pt.x,
						y0,
						pt.z
					], i * 3);
					hull.set([
						pt.x,
						y1,
						pt.z
					], (pts.length + i) * 3);
				});
				const desc = RAPIER.ColliderDesc.convexHull(hull);
				if (desc) this.world.createCollider(desc.setFriction(1).setRestitution(st.tag === "building" ? 1 : 0).setCollisionGroups(st.tag === "building" ? GROUPS_SOLID : GROUPS_TERRAIN), body);
				continue;
			}
			if (st.shape.kind !== "box") continue;
			const p = st.position, s = st.shape;
			this.world.createCollider(RAPIER.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(p.x, p.y, p.z).setRotation(st.rotation).setFriction(1).setRestitution(st.tag === "building" ? 1 : 0).setCollisionGroups(st.tag === "building" ? GROUPS_SOLID : GROUPS_TERRAIN), body);
		}
		this.active.set(`${ix},${iz}`, {
			body,
			chunk
		});
		this.loaded++;
	}
	/** Project onto the closest driveable lane instead of resetting to a distant junction. */
	nearestRoad(x, z, out) {
		let best = Infinity;
		const hit = {
			x: 0,
			z: 0,
			yaw: 0
		};
		for (let i = 0; i < this.graph.lanes.length; i++) {
			const b = this.laneBounds[i];
			const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
			if (dx * dx + dz * dz >= best) continue;
			const dist = projectOnLane(this.graph.lanes[i], x, z, hit);
			if (dist < best) {
				best = dist;
				out.position.x = hit.x;
				out.position.z = hit.z;
				out.yaw = hit.yaw;
			}
		}
		return out;
	}
	/** The lane whose polyline is closest to a point, through the lane bounds; -1 with no lanes. */
	nearestLane(x, z) {
		let best = Infinity;
		let found = -1;
		const hit = {
			x: 0,
			z: 0,
			yaw: 0
		};
		for (let i = 0; i < this.graph.lanes.length; i++) {
			const b = this.laneBounds[i];
			const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
			if (dx * dx + dz * dz >= best) continue;
			const dist = projectOnLane(this.graph.lanes[i], x, z, hit);
			if (dist < best) {
				best = dist;
				found = i;
			}
		}
		return found;
	}
	/** Cached generation: the last 16 chunks asked for, resident physics chunks first. */
	chunk(cx, cz) {
		const key = `${cx},${cz}`;
		const resident = this.active.get(key)?.chunk;
		if (resident) return resident;
		const cached = this.chunkCache.get(key);
		if (cached) {
			this.chunkCache.delete(key);
			this.chunkCache.set(key, cached);
			return cached;
		}
		const chunk = this.generate(cx, cz);
		this.chunkCache.set(key, chunk);
		if (this.chunkCache.size > 16) this.chunkCache.delete(this.chunkCache.keys().next().value);
		return chunk;
	}
};
//#endregion
//#region src/sim/controls.ts
function createControls() {
	return {
		throttle: 0,
		brake: 0,
		steer: 0,
		handbrake: 0,
		boost: 0,
		reset: false,
		swap: false
	};
}
//#endregion
//#region src/sim/events.ts
var EventLog = class {
	capacity = 64;
	/** Next sequence number to assign. */
	sequence = 0;
	/**
	* Stamped onto each push. The world sets this to the current sim tick
	* at the start of the step; `push` has no tick argument so the ring
	* stays allocation-free.
	*/
	tick = 0;
	/** Pre-allocated ring. Length never changes after construction. */
	entries;
	write = 0;
	count = 0;
	constructor() {
		const entries = [];
		for (let i = 0; i < this.capacity; i++) entries.push({
			kind: "hit",
			value: 0,
			x: 0,
			y: 0,
			z: 0,
			tick: 0,
			target: -1,
			seq: -1
		});
		this.entries = entries;
	}
	push(kind, value, x, y, z, target = -1) {
		const e = this.entries[this.write];
		e.kind = kind;
		e.value = value;
		e.x = x;
		e.y = y;
		e.z = z;
		e.tick = this.tick;
		e.target = target;
		e.seq = this.sequence;
		this.sequence++;
		this.write++;
		if (this.write === this.capacity) this.write = 0;
		if (this.count < this.capacity) this.count++;
	}
	/**
	* Visits events with `seq >= from`, oldest first, without copying.
	* Returns the next sequence to read from.
	*/
	readFrom(from, visit) {
		const n = this.count;
		const cap = this.capacity;
		const start = n < cap ? 0 : this.write;
		for (let i = 0; i < n; i++) {
			const e = this.entries[(start + i) % cap];
			if (e.seq >= from) visit(e);
		}
		return from > this.sequence ? from : this.sequence;
	}
};
//#endregion
//#region src/sim/vehicle/tuning.ts
const DEFAULT_TUNING = {
	mass: 1300,
	chassisHalfExtents: {
		x: .95,
		y: .32,
		z: 2.25
	},
	chassisOffsetY: .42,
	centerOfMassY: -.05,
	inertiaScale: {
		x: 1,
		y: 1,
		z: 1
	},
	angularDamping: 1,
	wheelBase: 2.9,
	trackWidth: 1.72,
	wheelRadius: .36,
	wheelWidth: .28,
	suspensionAttachY: .18,
	suspensionRestLength: .32,
	suspensionStiffness: 62e3,
	suspensionDampingCompression: 5200,
	suspensionDampingRebound: 6800,
	bumpStopStiffness: 25e4,
	suspensionDampingProgressive: 400,
	antiRollStiffness: 26e3,
	maxSteerDegLow: 34,
	maxSteerDegHigh: 5,
	steerSpeedRef: 34,
	steerRate: 6,
	steerReturnRate: 8,
	steerCurve: 2.4,
	ackermann: 1,
	torqueMax: 245,
	idleRpm: 900,
	redlineRpm: 7200,
	torqueCurve: [
		.6,
		.86,
		1,
		.93,
		.8
	],
	engineBrakeTorque: 55,
	engineInertia: .25,
	gearRatios: [
		4.33,
		3.18,
		2.33,
		1.71,
		1.25,
		.99
	],
	reverseRatio: 3.2,
	finalDrive: 4.1,
	drivetrainEfficiency: .9,
	driveFrontShare: 0,
	lsdLock: .5,
	lsdPreload: 60,
	lsdStiffness: 220,
	shiftUpAt: .96,
	shiftDownAt: .5,
	shiftTime: .12,
	maxReverseSpeed: 7,
	brakeTorque: 5600,
	brakeFrontBias: .62,
	handbrakeTorque: 4e3,
	wheelInertia: 1.2,
	slipLowSpeed: 2,
	muFront: 2.2,
	muRear: 2.3,
	slipAngPeakDeg: 8,
	slipAngTail: .7,
	slipRatioPeak: .12,
	slipRatioTail: .7,
	rollingResistance: .012,
	loadSensitivity: .15,
	tireForceHeight: .85,
	tractionControl: .6,
	abs: .8,
	restDamping: 6,
	driftAssist: 1,
	powerOversteer: .14,
	brakeDriftEntry: 1,
	handbrakeGripMul: .3,
	driftGripMul: .25,
	driftFrontGripMul: .9,
	driftEnterDeg: 14,
	driftExitDeg: 7,
	driftMinSpeed: 8,
	driftMinTime: .6,
	driftExitHold: .3,
	driftCentreHold: .4,
	driftAngleRateIn: 90,
	driftAngleRateOut: 45,
	gripBlendRate: 4,
	driftMaxAngleDeg: 35,
	driftAngleGain: 14e4,
	driftAngleDamping: 9e3,
	driftYawTorqueMax: 3e4,
	driftAutoCounterSteer: 1,
	driftVelocityFollow: 2.6,
	driftFollowAccelMax: 8,
	driftSpeedLoss: .05,
	driftThrottlePush: 5e3,
	drag: 1.12,
	downforce: 1.8,
	extraGravity: 3.5,
	airPitchTorque: 3500,
	airRollTorque: 3e3,
	airLevelTorque: 22e3,
	airAngularDamping: 5e3,
	airFollowTrajectory: .8,
	airPitchBiasDeg: 4,
	airPitchMaxDeg: 25,
	airLandingLevelTime: .45,
	landingRetainVertical: .35,
	landingRetainSpin: .5,
	landingKeepMomentum: .92,
	wallFriction: .15,
	wallRestitution: .2,
	wallAlignGain: 20,
	wallAlignDamping: 7,
	wallAlignMaxDeg: 80,
	wallHitSpeed: 3,
	wallHitRetainSpin: .15,
	wallMemory: .5,
	flipRecoverySeconds: 1.5,
	boostTorqueMul: 1.25,
	boostThrust: 2500,
	boostDrain: .28,
	boostGainDrift: .16,
	boostGainAir: .35,
	boostInitial: .6
};
function cloneTuning(t) {
	return JSON.parse(JSON.stringify(t));
}
//#endregion
//#region src/sim/vehicle/presets.ts
/**
* The vehicle classes as tuning presets.
* Gearboxes: six speeds everywhere, spaced geometrically. First to fifth cover
* the range the class can reach on its own, so fifth is its top-speed gear;
* sixth is an overdrive that only pulls on boost. Each is the default tuning with the
* numbers that make the class: mass, engine, drivetrain, geometry, suspension.
* Visual profiles live in render/carProfiles.ts under the same ids.
*/
const CAR_IDS = [
	"muscle",
	"compact",
	"heavy",
	"sports",
	"police"
];
function preset(overrides) {
	return {
		...cloneTuning(DEFAULT_TUNING),
		...overrides
	};
}
const CAR_PRESETS = {
	/** Long-bonnet rear-drive coupe: the starter car. */
	muscle: cloneTuning(DEFAULT_TUNING),
	/** Small front-drive hatch: light, nimble, slow, safe. Drifts only on the handbrake. */
	compact: preset({
		mass: 1050,
		chassisHalfExtents: {
			x: .85,
			y: .34,
			z: 1.9
		},
		chassisOffsetY: .46,
		centerOfMassY: 0,
		wheelBase: 2.45,
		trackWidth: 1.5,
		wheelRadius: .3,
		wheelWidth: .2,
		suspensionRestLength: .28,
		suspensionStiffness: 42e3,
		suspensionDampingCompression: 3600,
		suspensionDampingRebound: 4800,
		antiRollStiffness: 14e3,
		maxSteerDegLow: 36,
		maxSteerDegHigh: 6,
		steerSpeedRef: 30,
		torqueMax: 150,
		redlineRpm: 6600,
		gearRatios: [
			3.95,
			2.87,
			2.08,
			1.51,
			1.1,
			.87
		],
		finalDrive: 4.2,
		driveFrontShare: 1,
		lsdLock: .2,
		brakeTorque: 4200,
		brakeFrontBias: .66,
		wheelInertia: .9,
		muFront: 2.1,
		muRear: 2.25,
		powerOversteer: 0,
		driftMaxAngleDeg: 30,
		driftThrottlePush: 3200,
		drag: 1.05,
		downforce: 1.2,
		boostTorqueMul: 1.35,
		boostThrust: 2e3
	}),
	/** Delivery van: heavy, tall, soft, slow to turn, bulldozes. */
	heavy: preset({
		mass: 2400,
		chassisHalfExtents: {
			x: 1,
			y: .5,
			z: 2.7
		},
		chassisOffsetY: .75,
		centerOfMassY: .05,
		inertiaScale: {
			x: 1.15,
			y: 1.1,
			z: 1.15
		},
		wheelBase: 3.4,
		trackWidth: 1.8,
		wheelRadius: .4,
		wheelWidth: .3,
		suspensionAttachY: .22,
		suspensionRestLength: .36,
		suspensionStiffness: 9e4,
		suspensionDampingCompression: 7500,
		suspensionDampingRebound: 9500,
		antiRollStiffness: 6e4,
		maxSteerDegLow: 32,
		maxSteerDegHigh: 4.5,
		steerSpeedRef: 28,
		steerRate: 4.5,
		torqueMax: 380,
		redlineRpm: 5200,
		gearRatios: [
			4.67,
			3.27,
			2.3,
			1.61,
			1.13,
			.93
		],
		finalDrive: 4,
		brakeTorque: 9500,
		handbrakeTorque: 6e3,
		wheelInertia: 2,
		muFront: 2,
		muRear: 2.1,
		slipAngPeakDeg: 9,
		powerOversteer: .08,
		driftMaxAngleDeg: 28,
		driftAngleGain: 26e4,
		driftYawTorqueMax: 6e4,
		driftThrottlePush: 7e3,
		driftVelocityFollow: 2.2,
		tireForceHeight: .9,
		drag: 2.2,
		downforce: 1,
		airPitchTorque: 9e3,
		airRollTorque: 7e3,
		airLevelTorque: 5e4,
		airAngularDamping: 12e3,
		boostTorqueMul: 1.3,
		boostThrust: 4e3
	}),
	/** Low coupe: the fastest body in the game and the interceptor's base. Stiff, real downforce. */
	sports: preset({
		mass: 1180,
		chassisHalfExtents: {
			x: .92,
			y: .28,
			z: 2.1
		},
		chassisOffsetY: .38,
		centerOfMassY: -.12,
		inertiaScale: {
			x: .95,
			y: .9,
			z: .95
		},
		wheelBase: 2.7,
		trackWidth: 1.76,
		wheelRadius: .34,
		wheelWidth: .3,
		suspensionRestLength: .26,
		suspensionStiffness: 78e3,
		suspensionDampingCompression: 6400,
		suspensionDampingRebound: 8200,
		antiRollStiffness: 38e3,
		maxSteerDegLow: 33,
		maxSteerDegHigh: 4.2,
		steerSpeedRef: 36,
		steerRate: 7,
		torqueMax: 300,
		redlineRpm: 8200,
		gearRatios: [
			3.85,
			2.88,
			2.15,
			1.61,
			1.2,
			.91
		],
		finalDrive: 3.9,
		brakeTorque: 7200,
		brakeFrontBias: .64,
		wheelInertia: 1,
		muFront: 2.45,
		muRear: 2.5,
		slipAngPeakDeg: 7.5,
		powerOversteer: .18,
		driftMaxAngleDeg: 32,
		drag: .95,
		downforce: 3,
		boostTorqueMul: 1.3,
		boostThrust: 3200
	}),
	/** Patrol saloon: a muscle car plus 300 kg, tuned to ram. Mass and yaw inertia carry the hit; a planted rear keeps a miss pointed at the player. */
	police: preset({
		mass: 1620,
		chassisHalfExtents: {
			x: .98,
			y: .34,
			z: 2.3
		},
		chassisOffsetY: .44,
		centerOfMassY: -.02,
		inertiaScale: {
			x: 1.05,
			y: 1.15,
			z: 1.05
		},
		wheelBase: 3,
		trackWidth: 1.78,
		wheelRadius: .37,
		wheelWidth: .29,
		suspensionRestLength: .3,
		suspensionStiffness: 84e3,
		suspensionDampingCompression: 6800,
		suspensionDampingRebound: 8600,
		antiRollStiffness: 4e4,
		maxSteerDegLow: 33,
		maxSteerDegHigh: 5,
		steerSpeedRef: 36,
		torqueMax: 290,
		redlineRpm: 7e3,
		gearRatios: [
			4.21,
			3.11,
			2.3,
			1.7,
			1.26,
			.98
		],
		finalDrive: 4,
		brakeTorque: 6800,
		brakeFrontBias: .63,
		wheelInertia: 1.3,
		muFront: 2.25,
		muRear: 2.3,
		powerOversteer: .05,
		driftMaxAngleDeg: 26,
		driftThrottlePush: 5600,
		drag: 1.18,
		downforce: 2.2,
		wallHitRetainSpin: .08,
		boostTorqueMul: 1.25,
		boostThrust: 2800
	})
};
//#endregion
//#region src/sim/economy.ts
const ECONOMY = {
	nearMissGap: 1.5,
	nearMissSpeed: 12,
	nearMissBoost: .12,
	nearMissOncomingBoost: .2,
	nearMissCooldown: 2,
	oncomingSpeed: 16,
	oncomingLaneDistance: 4,
	oncomingBoostPerSecond: .1,
	oncomingHysteresis: .3,
	pedDodgeBoost: .04,
	pedDodgeDistance: 3,
	takedownBoost: .5,
	takedownTrafficBoost: .6,
	takedownWindow: 2.5,
	takedownClosingSpeed: 14,
	takedownDeltaV: 7,
	billboardBoost: .25,
	billboardMinSpeed: 5.5,
	billboardSpeedLoss: .05,
	slowMoSeconds: 1.2,
	slowMoScale: .35
};
const DAMAGE = {
	threshold: 8,
	perMetrePerSecond: .04,
	stages: [
		.3,
		.6,
		.85,
		1
	],
	trafficFactor: .7,
	wreckRespawn: 3,
	respawnSpeed: 8,
	respawnClear: 15
};
const SWAP = {
	range: 6,
	lateral: 4,
	maxRelativeSpeed: 20,
	airborneAllowed: false,
	whipSeconds: .35
};
//#endregion
//#region src/sim/math.ts
function v3(x = 0, y = 0, z = 0) {
	return {
		x,
		y,
		z
	};
}
function set(o, x, y, z) {
	o.x = x;
	o.y = y;
	o.z = z;
	return o;
}
function copy(o, a) {
	o.x = a.x;
	o.y = a.y;
	o.z = a.z;
	return o;
}
function add(o, a, b) {
	o.x = a.x + b.x;
	o.y = a.y + b.y;
	o.z = a.z + b.z;
	return o;
}
function sub(o, a, b) {
	o.x = a.x - b.x;
	o.y = a.y - b.y;
	o.z = a.z - b.z;
	return o;
}
function scale(o, a, s) {
	o.x = a.x * s;
	o.y = a.y * s;
	o.z = a.z * s;
	return o;
}
/** o = a + b * s */
function addScaled(o, a, b, s) {
	o.x = a.x + b.x * s;
	o.y = a.y + b.y * s;
	o.z = a.z + b.z * s;
	return o;
}
function dot(a, b) {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(o, a, b) {
	const x = a.y * b.z - a.z * b.y;
	const y = a.z * b.x - a.x * b.z;
	const z = a.x * b.y - a.y * b.x;
	o.x = x;
	o.y = y;
	o.z = z;
	return o;
}
function length(a) {
	return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
function normalize(o, a) {
	const l = length(a);
	if (l > 1e-9) {
		o.x = a.x / l;
		o.y = a.y / l;
		o.z = a.z / l;
	} else {
		o.x = 0;
		o.y = 0;
		o.z = 0;
	}
	return o;
}
/** Rotate vector a by unit quaternion q into o. */
function rotate(o, q, a) {
	const { x: qx, y: qy, z: qz, w: qw } = q;
	const { x, y, z } = a;
	const tx = 2 * (qy * z - qz * y);
	const ty = 2 * (qz * x - qx * z);
	const tz = 2 * (qx * y - qy * x);
	o.x = x + qw * tx + (qy * tz - qz * ty);
	o.y = y + qw * ty + (qz * tx - qx * tz);
	o.z = z + qw * tz + (qx * ty - qy * tx);
	return o;
}
function quatMul(o, a, b) {
	const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
	const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
	const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
	const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
	o.x = x;
	o.y = y;
	o.z = z;
	o.w = w;
	return o;
}
function quatSetAxisAngle(o, ax, ay, az, angle) {
	const h = angle * .5;
	const s = Math.sin(h);
	o.x = ax * s;
	o.y = ay * s;
	o.z = az * s;
	o.w = Math.cos(h);
	return o;
}
function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}
function smoothstep(t) {
	const x = clamp01(t);
	return x * x * (3 - 2 * x);
}
/** Move `current` toward `target` by at most `maxDelta`. */
function moveToward(current, target, maxDelta) {
	const d = target - current;
	if (Math.abs(d) <= maxDelta) return target;
	return current + Math.sign(d) * maxDelta;
}
function yawOf(q) {
	const fx = 2 * (q.x * q.z + q.w * q.y);
	const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
	return Math.atan2(fx, fz);
}
const DEG = Math.PI / 180;
//#endregion
//#region src/sim/traffic/lanes.ts
const SAMPLES = 24;
/** Bezier handle length as a fraction of the endpoint gap (0.55 of the radius approximates a circular arc), capped. */
const HANDLE_RATIO = .42;
const HANDLE_MAX = 24;
const TURN_RAD = 15 * Math.PI / 180;
var LaneTables = class {
	laneCount;
	graph;
	cumStart;
	cum;
	pointCount;
	length;
	limit;
	/** Metres right of the road centreline the lane was built at (`Lane.offset`). */
	offset;
	toNode;
	midX;
	midZ;
	uturnOf;
	connections = /* @__PURE__ */ new Map();
	conflictCache = /* @__PURE__ */ new Map();
	scratch = {
		x: 0,
		z: 0,
		yaw: 0
	};
	scratchProj = {
		x: 0,
		z: 0,
		yaw: 0,
		s: 0,
		lateral: 0,
		dist: 0
	};
	constructor(graph, tuning) {
		this.graph = graph;
		this.laneCount = graph.lanes.length;
		this.pointCount = new Int16Array(this.laneCount);
		this.length = new Float32Array(this.laneCount);
		this.limit = new Float32Array(this.laneCount);
		this.offset = new Float32Array(this.laneCount);
		this.toNode = new Int16Array(this.laneCount);
		this.midX = new Float32Array(this.laneCount);
		this.midZ = new Float32Array(this.laneCount);
		this.uturnOf = new Int16Array(this.laneCount);
		this.cumStart = new Int32Array(this.laneCount);
		let points = 0;
		for (let i = 0; i < this.laneCount; i++) points += graph.lanes[i].points.length;
		this.cum = new Float32Array(points);
		let cursor = 0;
		for (let i = 0; i < this.laneCount; i++) {
			const lane = graph.lanes[i];
			this.cumStart[i] = cursor;
			this.pointCount[i] = lane.points.length;
			const base = cursor;
			this.cum[base] = 0;
			for (let p = 1; p < lane.points.length; p++) {
				const a = lane.points[p - 1];
				const b = lane.points[p];
				this.cum[base + p] = this.cum[base + p - 1] + Math.hypot(b.x - a.x, b.z - a.z);
			}
			this.length[i] = this.cum[base + lane.points.length - 1];
			this.limit[i] = limitFor(lane, graph, tuning);
			this.offset[i] = lane.offset;
			this.toNode[i] = lane.to;
			this.sample(i, this.length[i] * .5, 0, this.scratch);
			this.midX[i] = this.scratch.x;
			this.midZ[i] = this.scratch.z;
			this.uturnOf[i] = findUturn(lane, graph);
			cursor += lane.points.length;
		}
	}
	uturn(lane) {
		return this.uturnOf[lane];
	}
	outs(lane) {
		return this.graph.lanes[lane].next;
	}
	/** Absolute heading change from this lane's end to the next lane's start, radians. */
	headingChange(lane, next) {
		const a = this.graph.lanes[lane];
		const d = this.graph.lanes[next].yaw0 - a.yaw;
		return Math.atan2(Math.sin(d), Math.cos(d));
	}
	straightThrough(lane, next) {
		return Math.abs(this.headingChange(lane, next)) < TURN_RAD;
	}
	/** Length of the junction curve for an agent driving `offset` metres right of the lane (inside turns are shorter). */
	connectionLength(lane, next, offset = 0) {
		return this.connection(lane, next, offset).length;
	}
	/**
	* Pose at distance `s` along the lane, then along the connection to `next`
	* once `s` passes the lane length. `offset` is metres to the right of the
	* graph lane (the lane polyline is already offset from the centreline).
	*/
	positionAt(lane, s, offset, out, next = -1) {
		const len = this.length[lane];
		if (next < 0 || s <= len) {
			this.sample(lane, Math.max(0, Math.min(s, len)), offset, out);
			return;
		}
		const conn = this.connection(lane, next, offset);
		const cs = s - len;
		if (cs >= conn.length) {
			const over = cs - conn.length;
			const nlen = this.length[next];
			this.sample(next, Math.max(0, Math.min(over, nlen)), offset, out);
			return;
		}
		this.sampleConnection(conn, cs, out);
	}
	/**
	* Closest point on the lane polyline shifted `offset` metres to its right (the
	* path an agent with that lane offset actually drives). `lateral` is signed
	* metres to the right of that shifted path.
	*/
	project(lane, x, z, out, offset = 0) {
		const lanePts = this.graph.lanes[lane].points;
		const base = this.cumStart[lane];
		let best = Infinity;
		let bestS = 0;
		let bestX = 0;
		let bestZ = 0;
		let bestYaw = 0;
		let bestLat = 0;
		const n = this.pointCount[lane];
		for (let i = 0; i + 1 < n; i++) {
			const a = lanePts[i];
			const b = lanePts[i + 1];
			const dx = b.x - a.x;
			const dz = b.z - a.z;
			const len2 = dx * dx + dz * dz || 1;
			const yaw = Math.atan2(dx, dz);
			const ox = -Math.cos(yaw) * offset;
			const oz = Math.sin(yaw) * offset;
			const ax = a.x + ox;
			const az = a.z + oz;
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
			const px = ax + dx * t;
			const pz = az + dz * t;
			const ex = x - px;
			const ez = z - pz;
			const dist = ex * ex + ez * ez;
			if (dist < best) {
				best = dist;
				const seg = Math.sqrt(len2);
				bestS = this.cum[base + i] + seg * t;
				bestX = px;
				bestZ = pz;
				bestYaw = yaw;
				bestLat = ex * -Math.cos(yaw) + ez * Math.sin(yaw);
			}
		}
		out.x = bestX;
		out.z = bestZ;
		out.yaw = bestYaw;
		out.s = bestS;
		out.lateral = bestLat;
		out.dist = Math.sqrt(best);
	}
	/**
	* Project onto the lane and, when `next` is chosen, onto the connection curve
	* (then `s` runs past the lane length). Once the point has passed the end of
	* the connection onto `next`, `switched` is set and `s` is along `next`.
	*/
	projectPath(lane, next, x, z, out, offset = 0) {
		this.project(lane, x, z, out, offset);
		out.switched = false;
		if (next < 0) return;
		const conn = this.connection(lane, next, offset);
		let best = out.dist * out.dist;
		let bestS = -1;
		let bestX = 0;
		let bestZ = 0;
		let bestYaw = 0;
		let bestLat = 0;
		for (let i = 0; i < SAMPLES; i++) {
			const ax = conn.pts[i * 2];
			const az = conn.pts[i * 2 + 1];
			const dx = conn.pts[(i + 1) * 2] - ax;
			const dz = conn.pts[(i + 1) * 2 + 1] - az;
			const len2 = dx * dx + dz * dz || 1;
			const yaw = Math.atan2(dx, dz);
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
			const px = ax + dx * t;
			const pz = az + dz * t;
			const ex = x - px;
			const ez = z - pz;
			const d = ex * ex + ez * ez;
			if (d < best) {
				best = d;
				bestS = conn.cum[i] + Math.sqrt(len2) * t;
				bestX = px;
				bestZ = pz;
				bestYaw = yaw;
				bestLat = ex * -Math.cos(yaw) + ez * Math.sin(yaw);
			}
		}
		if (bestS < 0) return;
		out.s = this.length[lane] + bestS;
		out.x = bestX;
		out.z = bestZ;
		out.yaw = bestYaw;
		out.lateral = bestLat;
		out.dist = Math.sqrt(best);
		if (bestS < conn.length - .5) return;
		const p = this.scratchProj;
		this.project(next, x, z, p, offset);
		if (p.s > .3 && p.dist <= out.dist + .1) {
			out.switched = true;
			out.s = p.s;
			out.x = p.x;
			out.z = p.z;
			out.yaw = p.yaw;
			out.lateral = p.lateral;
			out.dist = p.dist;
		}
	}
	/**
	* True when two junction movements can collide: their connection curves come
	* within CONFLICT_DISTANCE of each other. Movements from the same approach
	* lane never conflict: the follower stays behind its leader through the box
	* (the leader gap does that), so it need not wait for the box to clear.
	* Cached per pair.
	*/
	conflicts(laneA, nextA, laneB, nextB) {
		if (laneA === laneB) return false;
		const ka = laneA * 1024 + nextA;
		const kb = laneB * 1024 + nextB;
		const key = ka < kb ? ka * 262144 + kb : kb * 262144 + ka;
		const cached = this.conflictCache.get(key);
		if (cached !== void 0) return cached;
		const a = this.connection(laneA, nextA);
		const b = this.connection(laneB, nextB);
		const limit = 25;
		let hit = false;
		for (let i = 0; i <= SAMPLES && !hit; i++) {
			const ax = a.pts[i * 2];
			const az = a.pts[i * 2 + 1];
			for (let j = 0; j <= SAMPLES; j++) {
				const dx = b.pts[j * 2] - ax;
				const dz = b.pts[j * 2 + 1] - az;
				if (dx * dx + dz * dz < limit) {
					hit = true;
					break;
				}
			}
		}
		this.conflictCache.set(key, hit);
		return hit;
	}
	sample(lane, s, offset, out) {
		const lanePts = this.graph.lanes[lane].points;
		const base = this.cumStart[lane];
		const n = this.pointCount[lane];
		let seg = 0;
		for (let i = 0; i + 1 < n; i++) if (this.cum[base + i + 1] >= s || i + 2 === n) {
			seg = i;
			break;
		}
		const a = lanePts[seg];
		const b = lanePts[seg + 1];
		const c0 = this.cum[base + seg];
		const span = this.cum[base + seg + 1] - c0 || 1;
		const t = Math.max(0, Math.min(1, (s - c0) / span));
		applyOffset(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, Math.atan2(b.x - a.x, b.z - a.z), offset, out);
	}
	sampleConnection(conn, s, out) {
		let seg = 0;
		for (let i = 0; i < SAMPLES; i++) if (conn.cum[i + 1] >= s || i + 1 === SAMPLES) {
			seg = i;
			break;
		}
		const c0 = conn.cum[seg];
		const c1 = conn.cum[seg + 1];
		const t = Math.max(0, Math.min(1, (s - c0) / (c1 - c0 || 1)));
		const x0 = conn.pts[seg * 2];
		const z0 = conn.pts[seg * 2 + 1];
		const x1 = conn.pts[(seg + 1) * 2];
		const z1 = conn.pts[(seg + 1) * 2 + 1];
		out.x = x0 + (x1 - x0) * t;
		out.z = z0 + (z1 - z0) * t;
		out.yaw = Math.atan2(x1 - x0, z1 - z0);
	}
	/**
	* The junction curve between the end of `lane` and the start of `next`, for a
	* path `offset` metres to the right of both. It is a fresh Bezier between the
	* offset endpoints (with the same tangents), never an offset of the centre
	* curve, so an inside offset on a tight corner cannot fold back on itself.
	*/
	connection(lane, next, offset = 0) {
		const key = (lane * 1024 + next) * 1024 + 512 + Math.round(offset * 10);
		const cached = this.connections.get(key);
		if (cached) return cached;
		const a = this.graph.lanes[lane];
		const b = this.graph.lanes[next];
		const ax = a.x1 - Math.cos(a.yaw) * offset;
		const az = a.z1 + Math.sin(a.yaw) * offset;
		const bx = b.x0 - Math.cos(b.yaw0) * offset;
		const bz = b.z0 + Math.sin(b.yaw0) * offset;
		const handle = Math.min(HANDLE_MAX, HANDLE_RATIO * Math.hypot(bx - ax, bz - az));
		const cx0 = ax + Math.sin(a.yaw) * handle;
		const cz0 = az + Math.cos(a.yaw) * handle;
		const cx1 = bx - Math.sin(b.yaw0) * handle;
		const cz1 = bz - Math.cos(b.yaw0) * handle;
		const pts = /* @__PURE__ */ new Float32Array(50);
		const cum = /* @__PURE__ */ new Float32Array(25);
		for (let i = 0; i <= SAMPLES; i++) {
			const t = i / SAMPLES;
			const u = 1 - t;
			pts[i * 2] = u * u * u * ax + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t * t * t * bx;
			pts[i * 2 + 1] = u * u * u * az + 3 * u * u * t * cz0 + 3 * u * t * t * cz1 + t * t * t * bz;
			if (i > 0) {
				const dx = pts[i * 2] - pts[(i - 1) * 2];
				const dz = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1];
				cum[i] = cum[i - 1] + Math.hypot(dx, dz);
			}
		}
		const conn = {
			pts,
			cum,
			length: cum[SAMPLES]
		};
		this.connections.set(key, conn);
		return conn;
	}
};
/** Right of the heading: facing +Z, +offset moves toward -X. Same rule as the graph's lane offset. */
function applyOffset(x, z, yaw, offset, out) {
	out.x = x - Math.cos(yaw) * offset;
	out.z = z + Math.sin(yaw) * offset;
	out.yaw = yaw;
}
function limitFor(lane, graph, tuning) {
	if (lane.highway) return tuning.speedHighway;
	if (lane.special) for (let i = 0; i < graph.special.length; i++) {
		const road = graph.special[i];
		if (road?.name !== lane.special) continue;
		if (road.kind === "avenue") return tuning.speedAvenue;
		if (road.kind === "parkway") return tuning.speedParkway;
		if (road.kind === "quay") return tuning.speedQuay;
		if (road.kind === "service") return tuning.speedService;
	}
	return tuning.speedStreet;
}
function findUturn(lane, graph) {
	for (let i = 0; i < lane.next.length; i++) {
		const id = lane.next[i];
		const next = graph.lanes[id];
		if (next && next.to === lane.from) return id;
	}
	return -1;
}
//#endregion
//#region src/sim/traffic/tuning.ts
const TRAFFIC = {
	agents: 48,
	physicsBodies: 16,
	spawnMin: 150,
	spawnMax: 300,
	despawn: 320,
	physicsRadius: 40,
	physicsRelease: 60,
	policeBodyReach: 25,
	policeBodies: 10,
	speedStreet: 14,
	speedHighway: 22,
	speedAvenue: 16,
	speedParkway: 16,
	speedQuay: 14,
	speedService: 11,
	speedJunction: 10,
	accel: 4,
	brake: 6,
	gapMin: 6,
	gapTime: 1.2,
	playerGap: 25,
	playerLateral: 2.6,
	junctionWait: 9,
	junctionClear: 4,
	highwayGap: 25,
	highwayKeepLane: .85,
	disturbedImpact: 1.5,
	disturbedTime: 2,
	reattachDistance: 4,
	reattachBlend: 1.5,
	wreckImpact: 7,
	wreckLinger: 10,
	wreckTow: 60,
	wreckTowNear: 40,
	wreckTowConeDeg: 55,
	honkCooldown: 3,
	wobbleTime: 1,
	yawGain: 3,
	yawRateMax: 1.5,
	subLaneOffsets: {
		highway: [0],
		street: [0]
	},
	kindWeights: {
		compact: .5,
		muscle: .3,
		heavy: .2
	},
	mass: {
		compact: 1050,
		muscle: 1300,
		heavy: 2400,
		sports: 1180,
		police: 1620
	},
	friction: .4,
	restitution: .3,
	linearDamping: .3,
	angularDamping: 1.5
};
const PEDS = {
	count: 40,
	spawnMin: 90,
	spawnMax: 180,
	despawn: 220,
	walkSpeed: [1.1, 1.6],
	lookAhead: .7,
	corridorHalfWidth: 2.6,
	diveSpeed: 6,
	diveTime: .5,
	getUpTime: .8,
	fistTime: 4,
	guaranteeDistance: 1.3,
	hopDistance: 3,
	scoreDistance: 3
};
//#endregion
//#region src/sim/traffic/Traffic.ts
/**
* Pooled traffic on the road graph with simulation LOD.
*
* Every agent is a record in typed arrays that follows a lane polyline and a
* cached junction curve. The agents nearest the player borrow one of a small
* pool of Rapier dynamic bodies: the body is steered along the same path with
* velocity control (so a hit displaces it and the contact impulse reaches the
* player's chassis), goes fully physical while disturbed, and either settles
* back onto its lane or becomes a wreck. Path following (progress along lane
* and connection, junction reservations, gaps to the leader and to the
* player) is one code path for kinematic and lent agents.
*
* Junctions: a movement reserves one of four holder slots at its node; two
* movements may hold the same node when their curves stay apart (they do not
* conflict). Straight-through highway traffic never reserves; side streets
* wait for a gap in it. A car that has waited `junctionWait` enters anyway
* and keeps that right until it has left the node, so nothing deadlocks.
*/
const KINDS = [
	"muscle",
	"compact",
	"heavy",
	"sports",
	"police"
];
const KIND_INDEX = {
	muscle: 0,
	compact: 1,
	heavy: 2,
	sports: 3,
	police: 4
};
/** The player's paint per class (docs/STYLE.md): what an abandoned player car keeps. */
const PLAYER_PAINT = {
	muscle: PALETTE.carRed,
	compact: PALETTE.carBlue,
	heavy: PALETTE.carOrange,
	sports: PALETTE.carLime,
	police: PALETTE.policeWhite
};
const PAINTS = [
	PALETTE.carLime,
	PALETTE.carBlue,
	PALETTE.carOrange,
	PALETTE.carMagenta,
	PALETTE.carWhite,
	PALETTE.carBlack,
	CITY_COLORS.mint,
	CITY_COLORS.peach
];
/** Centre spacing subtracted when one agent follows another on a lane. */
const CAR_GAP = 4.5;
/** Metres past the stop line a car may creep and still count as waiting at it. */
const STOP_TOLERANCE = 1.5;
const MAX_ON_LANE = 48;
/** Reservation slots per junction node. */
const HOLDERS = 4;
const WOBBLE_RAD = 5 * Math.PI / 180;
/** Look-ahead of the velocity controller along the path, m. */
const CARROT = 8;
/** Driving cars ignore the ground; a disturbed or wrecked car is switched onto GROUPS_SOLID so it can tumble and rest. */
const GROUPS_TRAFFIC = interactionGroups(1, 65533);
const ZERO = {
	x: 0,
	y: 0,
	z: 0
};
var Traffic = class {
	tuning;
	capacity;
	lanes;
	state;
	kind;
	/** Pursuit membership, independent of car class; retained on a police wreck until free or swap. */
	police;
	paint;
	slot;
	lane;
	next;
	/** Distance along the lane; past the lane length it runs along the connection to `next`. */
	s;
	laneOffset;
	speed;
	x;
	z;
	yaw;
	disturbedFor;
	wreckedFor;
	lastPlayerContactTick;
	honkCooldown;
	/** Speed change (m/s) the lent body took from contacts this step; 0 without a body. Diagnostics and tests. */
	contactDv;
	/** What bounded the agent's desired speed this step: 0 nothing, 1 leader, 2 player, 3 car ahead, 4 junction wait. */
	blocker;
	/** Speed change (m/s) a lent body took this step from the player's chassis, from fixed solids (walls, buildings) and from other cars. */
	playerDv;
	wallDv;
	trafficDv;
	/** A lent body's speed before this step's physics: closing speeds are measured before the impact. */
	prevSpeed;
	/** Collider handle of the player's chassis, so contacts can be attributed. The world refreshes it every step. */
	playerColliderHandle = -1;
	/** Bumps when paint or tint changes so the view reuploads instance colours. */
	paintSerial = 0;
	/** Agents that gave up waiting and entered a junction anyway. */
	waitedPast = 0;
	/** Wrecks towed away since the run began. */
	towedAway = 0;
	guardHops = 0;
	transforms;
	target;
	rng;
	nodes;
	nodeHolders;
	nodeHoldFor;
	wait;
	forced;
	wobble;
	turn;
	laneFill;
	laneIndex;
	halfW;
	halfL;
	colliderAgent = /* @__PURE__ */ new Map();
	pose = {
		x: 0,
		z: 0,
		yaw: 0
	};
	proj = {
		x: 0,
		z: 0,
		yaw: 0,
		s: 0,
		lateral: 0,
		dist: 0,
		switched: false
	};
	scratchQ = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	world;
	bodies = [];
	bodyCollider = [];
	bodyAgent;
	bodyKind;
	agentBody;
	reattachLeft;
	plannerLane;
	plannerNext;
	plannerSpeed;
	ramX;
	ramZ;
	ramSpeed;
	ramAccel;
	lin = {
		x: 0,
		y: 0,
		z: 0
	};
	ang = {
		x: 0,
		y: 0,
		z: 0
	};
	pos = {
		x: 0,
		y: 0,
		z: 0
	};
	rot = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	contactSum = 0;
	pairSum = 0;
	playerSum = 0;
	wallSum = 0;
	trafficSum = 0;
	currentCol = null;
	onTrafficManifold = (m, _flipped) => {
		const n = m.numContacts();
		for (let i = 0; i < n; i++) this.pairSum += m.contactImpulse(i);
	};
	onTrafficPair = (other) => {
		const parent = other.parent();
		const fixed = parent === null || parent.isFixed();
		if (fixed && other.restitution() < .99) return;
		const col = this.currentCol;
		if (!col) return;
		this.pairSum = 0;
		this.world.contactPair(col, other, this.onTrafficManifold);
		this.contactSum += this.pairSum;
		if (other.handle === this.playerColliderHandle) this.playerSum += this.pairSum;
		else if (fixed) this.wallSum += this.pairSum;
		else if (this.colliderAgent.has(other.handle)) this.trafficSum += this.pairSum;
	};
	constructor(world, transforms, city, seed, tuning = TRAFFIC, density = 1) {
		this.world = world;
		this.transforms = transforms;
		this.tuning = tuning;
		this.capacity = tuning.agents;
		this.target = Math.max(0, Math.min(this.capacity, Math.round(tuning.agents * density)));
		this.lanes = new LaneTables(city.graph, tuning);
		this.nodes = city.graph.nodes;
		this.rng = mulberry32(seed ^ 31249);
		const n = this.capacity;
		this.state = new Uint8Array(n);
		this.kind = new Uint8Array(n);
		this.police = new Uint8Array(n);
		this.paint = new Uint32Array(n);
		this.slot = new Int16Array(n);
		this.lane = new Int16Array(n);
		this.next = new Int16Array(n);
		this.s = new Float32Array(n);
		this.laneOffset = new Float32Array(n);
		this.speed = new Float32Array(n);
		this.x = new Float32Array(n);
		this.z = new Float32Array(n);
		this.yaw = new Float32Array(n);
		this.disturbedFor = new Float32Array(n);
		this.wreckedFor = new Float32Array(n);
		this.lastPlayerContactTick = new Int32Array(n);
		this.honkCooldown = new Float32Array(n);
		this.wait = new Float32Array(n);
		this.forced = new Uint8Array(n);
		this.contactDv = new Float32Array(n);
		this.blocker = new Uint8Array(n);
		this.playerDv = new Float32Array(n);
		this.wallDv = new Float32Array(n);
		this.trafficDv = new Float32Array(n);
		this.prevSpeed = new Float32Array(n);
		this.wobble = new Float32Array(n);
		this.turn = new Uint8Array(n);
		this.laneFill = new Uint8Array(this.lanes.laneCount);
		this.laneIndex = new Int16Array(this.lanes.laneCount * MAX_ON_LANE);
		this.nodeHolders = new Int32Array(this.nodes.length * HOLDERS);
		this.nodeHoldFor = new Float32Array(this.nodes.length * HOLDERS);
		this.nodeHolders.fill(-1);
		this.next.fill(-1);
		this.lane.fill(-1);
		this.lastPlayerContactTick.fill(-1e5);
		this.halfW = new Float32Array(KINDS.length);
		this.halfL = new Float32Array(KINDS.length);
		for (let k = 0; k < KINDS.length; k++) {
			const id = KINDS[k];
			this.halfW[k] = CAR_PRESETS[id].chassisHalfExtents.x;
			this.halfL[k] = CAR_PRESETS[id].chassisHalfExtents.z;
		}
		for (let i = 0; i < n; i++) this.slot[i] = transforms.allocate();
		this.agentBody = new Int16Array(n);
		this.reattachLeft = new Float32Array(n);
		this.agentBody.fill(-1);
		this.plannerLane = new Int16Array(n);
		this.plannerNext = new Int16Array(n);
		this.plannerSpeed = new Float32Array(n);
		this.ramX = new Float32Array(n);
		this.ramZ = new Float32Array(n);
		this.ramSpeed = new Float32Array(n);
		this.ramAccel = new Float32Array(n);
		this.plannerLane.fill(-1);
		this.plannerNext.fill(-1);
		this.bodyAgent = new Int16Array(tuning.physicsBodies);
		this.bodyAgent.fill(-1);
		this.bodyKind = new Int8Array(tuning.physicsBodies);
		this.bodyKind.fill(-1);
		for (let b = 0; b < tuning.physicsBodies; b++) {
			const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -50, 0).setCanSleep(false).setCcdEnabled(true).setLinearDamping(tuning.linearDamping).setAngularDamping(tuning.angularDamping));
			body.setEnabled(false);
			const col = world.createCollider(this.colliderDesc(0), body);
			this.bodies.push(body);
			this.bodyCollider.push(col);
		}
	}
	colliderDesc(kind) {
		const id = KINDS[kind];
		const he = CAR_PRESETS[id].chassisHalfExtents;
		const mass = this.tuning.mass[id];
		const hy = .7;
		const w = he.x * 2;
		const h = hy * 2;
		const l = he.z * 2;
		return RAPIER.ColliderDesc.cuboid(he.x, hy, he.z).setTranslation(0, hy, 0).setFriction(this.tuning.friction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(this.tuning.restitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply).setCollisionGroups(GROUPS_TRAFFIC).setMassProperties(mass, {
			x: 0,
			y: .35,
			z: 0
		}, {
			x: mass / 12 * (h * h + l * l),
			y: mass / 12 * (w * w + l * l),
			z: mass / 12 * (w * w + h * h)
		}, {
			x: 0,
			y: 0,
			z: 0,
			w: 1
		});
	}
	count(state) {
		let n = 0;
		for (let i = 0; i < this.capacity; i++) if (this.state[i] === state) n++;
		return n;
	}
	kindOf(agent) {
		return KINDS[this.kind[agent]];
	}
	halfWidthOf(agent) {
		return this.halfW[this.kind[agent]];
	}
	halfLengthOf(agent) {
		return this.halfL[this.kind[agent]];
	}
	/** True when the agent currently owns a Rapier body. */
	hasBody(agent) {
		return this.agentBody[agent] >= 0;
	}
	/** Yaw rate of the agent's lent body (rad/s), 0 without a body. Tests and the review harness. */
	bodyYawRate(agent) {
		const slot = this.agentBody[agent];
		if (slot < 0) return 0;
		this.bodies[slot].angvel(this.ang);
		return this.ang.y;
	}
	/** Seconds the agent has been waiting at a junction, 0 when not waiting. */
	waiting(agent) {
		return this.wait[agent];
	}
	/** World-up component of the lent body's up axis (1 level, 0 on its side, -1 on its roof); 1 without a body. */
	upOf(agent) {
		const slot = this.agentBody[agent];
		if (slot < 0) return 1;
		const r = this.bodies[slot].rotation(this.rot);
		return 1 - 2 * (r.x * r.x + r.z * r.z);
	}
	agentForCollider(handle) {
		return this.colliderAgent.get(handle) ?? -1;
	}
	nearest(x, z, radius) {
		let best = -1;
		let bestD = radius * radius;
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] === 0) continue;
			const dx = this.x[i] - x;
			const dz = this.z[i] - z;
			const d = dx * dx + dz * dz;
			if (d <= bestD) {
				bestD = d;
				best = i;
			}
		}
		return best;
	}
	/** Test hook: yaw the agent (and its lent body) without moving it. */
	setFacing(agent, yaw) {
		this.yaw[agent] = yaw;
		const slot = this.agentBody[agent];
		if (slot < 0) return;
		const body = this.bodies[slot];
		const q = quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
		body.setRotation(q, true);
		body.setLinvel(ZERO, true);
		body.setAngvel(ZERO, true);
	}
	/** Test and e2e hook: deterministic placement. Wrecked and Abandoned agents start stopped. */
	spawnAt(lane, s, kind, state = 1, offset = 0) {
		const i = this.findFree();
		if (i < 0) return -1;
		this.place(i, lane, s, KIND_INDEX[kind], offset, state, PAINTS[0]);
		return i;
	}
	/** A clear graph pose; police use the same records and the same body lender as civilians. */
	canSpawnAt(lane, s, clearance) {
		this.lanes.positionAt(lane, s, 0, this.pose);
		return !this.nearWorld(this.pose.x, this.pose.z, clearance);
	}
	/** Includes the whole car footprint and the near exclusion, not just its centre. */
	outOfView(x, z, radius, player, near, cosHalf) {
		const dx = x - player.x, dz = z - player.z;
		const distance = Math.hypot(dx, dz);
		if (distance <= near + radius) return false;
		return dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw) < cosHalf * Math.sqrt(distance * distance - radius * radius) - Math.sqrt(1 - cosHalf * cosHalf) * radius;
	}
	/** Only an unseen, undisturbed civilian may give up a full agent slot. */
	spawnPoliceAt(lane, s, kind, player, near, cosHalf, clearance) {
		if (!this.canSpawnAt(lane, s, clearance)) return -1;
		const index = KIND_INDEX[kind];
		const radius = Math.hypot(this.halfW[index], this.halfL[index]);
		if (!this.outOfView(this.pose.x, this.pose.z, radius, player, near, cosHalf)) return -1;
		let agent = this.findFree();
		if (agent < 0) {
			let farthest = 0;
			for (let i = 0; i < this.capacity; i++) {
				if (this.police[i] !== 0 || this.state[i] !== 1 && this.state[i] !== 2) continue;
				const x = this.x[i], z = this.z[i];
				const r = Math.hypot(this.halfWidthOf(i), this.halfLengthOf(i));
				if (!this.outOfView(x, z, r, player, near, cosHalf)) continue;
				const d = (x - player.x) ** 2 + (z - player.z) ** 2;
				if (d > farthest) {
					farthest = d;
					agent = i;
				}
			}
			if (agent < 0) return -1;
			this.free(agent);
		}
		this.place(agent, lane, s, index, 0, 1, PLAYER_PAINT[kind]);
		this.police[agent] = 1;
		return agent;
	}
	/** Off duty: the record goes back to the pool. The caller must have checked nobody is watching. */
	releasePolice(agent) {
		if (this.police[agent] !== 1) return;
		const state = this.state[agent];
		if (state !== 1 && state !== 2) return;
		this.free(agent);
	}
	/** Bounded planner inputs: a connected exit, speed, and an optional physical ram target. */
	setPolicePlan(agent, next, speed, ramX = 0, ramZ = 0, ramSpeed = 0, ramAccel = 0) {
		if (this.police[agent] !== 1) return;
		const lane = this.lane[agent];
		this.plannerLane[agent] = lane;
		this.plannerNext[agent] = lane >= 0 && this.lanes.outs(lane).includes(next) ? next : -1;
		this.plannerSpeed[agent] = Math.max(0, speed);
		this.ramX[agent] = ramX;
		this.ramZ[agent] = ramZ;
		this.ramSpeed[agent] = Math.max(0, ramSpeed);
		this.ramAccel[agent] = Math.max(0, ramAccel);
	}
	clearPolicePlan(agent) {
		this.plannerLane[agent] = -1;
		this.plannerNext[agent] = -1;
		this.plannerSpeed[agent] = 0;
		this.ramSpeed[agent] = 0;
		this.ramAccel[agent] = 0;
	}
	/** Test hook: a stopped car (wreck or abandoned) at a point, off the lane graph. */
	spawnAtPoint(x, z, yaw, kind, state) {
		const i = this.findFree();
		if (i < 0) return -1;
		this.state[i] = state;
		this.police[i] = 0;
		this.clearPolicePlan(i);
		this.kind[i] = KIND_INDEX[kind];
		this.paint[i] = PAINTS[0];
		this.lane[i] = -1;
		this.next[i] = -1;
		this.s[i] = 0;
		this.laneOffset[i] = 0;
		this.speed[i] = 0;
		this.x[i] = x;
		this.z[i] = z;
		this.yaw[i] = yaw;
		this.wait[i] = 0;
		this.forced[i] = 0;
		this.wobble[i] = 0;
		this.turn[i] = 0;
		this.honkCooldown[i] = 0;
		this.disturbedFor[i] = 0;
		this.wreckedFor[i] = 0;
		this.lastPlayerContactTick[i] = -1e5;
		this.paintSerial++;
		const q = quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
		this.transforms.writeBoth(this.slot[i], x, .03, z, q.x, q.y, q.z, q.w);
		return i;
	}
	/**
	* Car-swap. The agent's car goes to the player (`out` receives its pose,
	* velocity and class); the agent's record becomes the player's old car,
	* standing where the player was: abandoned, or a wreck if the player's car
	* was one. It keeps no lane and is lent a body next step like any obstacle.
	*/
	takeOver(agent, oldKind, oldPaint, oldPose, oldWrecked, out) {
		const yaw = this.yaw[agent];
		out.x = this.x[agent];
		out.z = this.z[agent];
		out.y = .03;
		out.yaw = yaw;
		out.kind = this.kindOf(agent);
		const slot = this.agentBody[agent];
		if (slot >= 0) {
			this.bodies[slot].linvel(this.lin);
			out.vx = this.lin.x;
			out.vz = this.lin.z;
			this.releaseBody(agent);
		} else {
			const speed = this.speed[agent];
			out.vx = Math.sin(yaw) * speed;
			out.vz = Math.cos(yaw) * speed;
		}
		this.releaseHolds(agent);
		this.police[agent] = 0;
		this.clearPolicePlan(agent);
		this.state[agent] = oldWrecked ? 4 : 5;
		this.kind[agent] = KIND_INDEX[oldKind];
		this.paint[agent] = oldPaint;
		this.lane[agent] = -1;
		this.next[agent] = -1;
		this.s[agent] = 0;
		this.laneOffset[agent] = 0;
		this.speed[agent] = 0;
		this.x[agent] = oldPose.x;
		this.z[agent] = oldPose.z;
		this.yaw[agent] = oldPose.yaw;
		this.wait[agent] = 0;
		this.forced[agent] = 0;
		this.wobble[agent] = 0;
		this.turn[agent] = 0;
		this.wreckedFor[agent] = 0;
		this.lastPlayerContactTick[agent] = -1e5;
		this.paintSerial++;
		const q = quatSetAxisAngle(this.scratchQ, 0, 1, 0, oldPose.yaw);
		this.transforms.writeBoth(this.slot[agent], oldPose.x, .03, oldPose.z, q.x, q.y, q.z, q.w);
	}
	clearAround(x, z, radius) {
		const r2 = radius * radius;
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] === 0) continue;
			const dx = this.x[i] - x;
			const dz = this.z[i] - z;
			if (dx * dx + dz * dz <= r2) this.free(i);
		}
	}
	step(player, dt, events) {
		this.despawn(player);
		this.tow(player, dt);
		this.spawn(player);
		this.releaseNodes(dt);
		for (let i = 0; i < this.capacity; i++) if (this.agentBody[i] >= 0) this.pullPose(i);
		this.buildLaneLists();
		for (let i = 0; i < this.capacity; i++) {
			const st = this.state[i];
			if (st === 0) continue;
			this.chooseNext(i);
			if (st === 1) this.moveKinematic(i, this.plan(i, player, dt, events), dt);
			if (st === 1 || st === 2) this.honk(i, player, dt, events);
		}
		this.unstick();
		this.guard(player, events);
		this.syncBodies(player, dt, events);
	}
	writeTransforms() {
		const tb = this.transforms;
		for (let i = 0; i < this.capacity; i++) {
			const slot = this.slot[i];
			if (this.state[i] === 0) {
				tb.writeBoth(slot, 0, -50, 0, 0, 0, 0, 1);
				continue;
			}
			const bodyIndex = this.agentBody[i];
			if (bodyIndex >= 0) {
				const body = this.bodies[bodyIndex];
				body.translation(this.pos);
				body.rotation(this.rot);
				this.x[i] = this.pos.x;
				this.z[i] = this.pos.z;
				this.yaw[i] = yawOf(this.rot);
				tb.write(slot, this.pos.x, this.pos.y, this.pos.z, this.rot.x, this.rot.y, this.rot.z, this.rot.w);
				continue;
			}
			let yaw = this.yaw[i];
			if (this.wobble[i] > 0) yaw += Math.sin(this.wobble[i] * 18) * WOBBLE_RAD;
			const q = quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
			tb.write(slot, this.x[i], .03, this.z[i], q.x, q.y, q.z, q.w);
		}
	}
	/** Desired speed this step from the lane limit, the leader, the player and the junction rules. */
	plan(i, player, dt, events) {
		const t = this.tuning;
		const lane = this.lane[i];
		const len = this.lanes.length[lane];
		const nxt = this.next[i];
		const s = this.s[i];
		let limit = this.lanes.limit[lane];
		const chasing = this.plannerSpeed[i] > 0;
		if (chasing) limit = this.plannerSpeed[i];
		if (nxt >= 0 && s >= len - 6 && this.turn[i] === 1) limit = t.speedJunction;
		let gap = this.leaderGap(i);
		let blocker = gap < 1e8 ? 1 : 0;
		const pGap = chasing && this.hasBody(i) ? Infinity : this.playerGapOf(i, player);
		if (pGap < gap) {
			gap = pGap;
			blocker = 2;
		}
		const aGap = this.aheadGap(i);
		if (aGap < gap) {
			gap = aGap;
			blocker = 3;
		}
		let desired = limit;
		if (gap < 1e8) desired = Math.min(limit, Math.sqrt(2 * t.brake * Math.max(0, gap - t.gapMin)));
		if (desired >= limit) blocker = 0;
		const entering = nxt >= 0 && s <= len + STOP_TOLERANCE;
		if (!entering) this.wait[i] = 0;
		if (entering && !this.mayEnter(i, player)) {
			const w = this.wait[i];
			if (w < t.junctionWait && w + dt >= t.junctionWait) {
				this.waitedPast++;
				events.push("honk", 0, this.x[i], .03, this.z[i], i);
			}
			this.wait[i] = w + dt;
			if (w + dt < t.junctionWait) {
				const stop = Math.sqrt(2 * t.brake * Math.max(0, len - .2 - s));
				if (stop < desired) {
					desired = stop;
					blocker = 4;
				}
			}
		} else if (entering && s >= len - 6) {
			this.claimNode(i);
			this.wait[i] = 0;
		}
		this.blocker[i] = blocker;
		return desired;
	}
	moveKinematic(i, desired, dt) {
		const t = this.tuning;
		const speed = this.speed[i];
		this.speed[i] = speed < desired ? Math.min(desired, speed + t.accel * dt) : Math.max(0, Math.max(desired, speed - t.brake * dt));
		const lane = this.lane[i];
		const len = this.lanes.length[lane];
		const nxt = this.next[i];
		let s = this.s[i] + this.speed[i] * dt;
		if (nxt >= 0 && this.s[i] <= len && this.wait[i] > 0 && this.wait[i] < t.junctionWait && this.forced[i] === 0) {
			if (s > len - .2) {
				s = len - .2;
				this.speed[i] = 0;
			}
		} else if (nxt >= 0 && s >= len) {
			const conn = this.lanes.connectionLength(lane, nxt, this.laneOffset[i]);
			if (s >= len + conn) {
				const over = Math.max(0, s - len - conn);
				const closest = this.closestOn(nxt);
				if (closest < over + CAR_GAP + .3) {
					s = len + conn - Math.max(.3, 4.8 - closest);
					this.speed[i] = 0;
				} else {
					this.switchLane(i, over);
					s = over;
				}
			}
		} else if (nxt < 0 && s > len) {
			s = len;
			this.speed[i] = 0;
		}
		this.s[i] = Math.max(0, s);
		this.reposition(i);
	}
	/** The agent has left its connection: continue on the chosen lane. */
	switchLane(i, s) {
		const nxt = this.next[i];
		this.retargetOffset(i, nxt);
		this.lane[i] = nxt;
		this.next[i] = -1;
		this.turn[i] = 0;
		this.wait[i] = 0;
		this.forced[i] = 0;
		this.s[i] = Math.max(0, s);
	}
	/** Read a lent body back into the record: pose, speed and progress along the path. */
	pullPose(i) {
		const body = this.bodies[this.agentBody[i]];
		body.translation(this.pos);
		body.rotation(this.rot);
		this.x[i] = this.pos.x;
		this.z[i] = this.pos.z;
		this.yaw[i] = yawOf(this.rot);
		body.linvel(this.lin);
		this.prevSpeed[i] = this.speed[i];
		this.speed[i] = Math.hypot(this.lin.x, this.lin.z);
		const lane = this.lane[i];
		if (lane < 0) return;
		this.lanes.projectPath(lane, this.next[i], this.pos.x, this.pos.z, this.proj, this.laneOffset[i]);
		if (this.proj.switched) this.switchLane(i, this.proj.s);
		else this.s[i] = this.proj.s;
	}
	/** Steer a lent body along its path: velocity toward a point 8 m ahead, nose along the motion. */
	driveBody(i, player, dt, events) {
		const t = this.tuning;
		const body = this.bodies[this.agentBody[i]];
		const lane = this.lane[i];
		if (lane < 0) return;
		let desired = this.plan(i, player, dt, events);
		const ramming = this.ramAccel[i] > 0;
		if (ramming) {
			this.pose.x = this.ramX[i];
			this.pose.z = this.ramZ[i];
			desired = Math.min(desired, this.ramSpeed[i]);
		} else this.lanes.positionAt(lane, this.s[i] + CARROT, this.laneOffset[i], this.pose, this.next[i]);
		const dx = this.pose.x - this.x[i];
		const dz = this.pose.z - this.z[i];
		const len = Math.hypot(dx, dz) || 1;
		const yaw = this.yaw[i];
		let toCarrot = Math.atan2(dx, dz) - yaw;
		toCarrot = Math.atan2(Math.sin(toCarrot), Math.cos(toCarrot));
		const turningBack = !ramming && Math.abs(toCarrot) > Math.PI / 3;
		const speedTarget = turningBack ? 0 : desired;
		body.linvel(this.lin);
		const left = this.reattachLeft[i];
		const blend = left > 0 ? 1 - left / t.reattachBlend : 1;
		if (left > 0) this.reattachLeft[i] = Math.max(0, left - dt);
		const k = Math.min(1, 6 * dt) * Math.max(0, Math.min(1, blend));
		const dvx = dx / len * speedTarget - this.lin.x;
		const dvz = dz / len * speedTarget - this.lin.z;
		const gain = ramming ? Math.min(k, this.ramAccel[i] * dt / (Math.hypot(dvx, dvz) || 1)) : k;
		this.lin.x += dvx * gain;
		this.lin.z += dvz * gain;
		body.setLinvel(this.lin, true);
		body.angvel(this.ang);
		let err = (!turningBack && Math.hypot(this.lin.x, this.lin.z) > 1.5 ? Math.atan2(this.lin.x, this.lin.z) : Math.atan2(dx, dz)) - yaw;
		err = Math.atan2(Math.sin(err), Math.cos(err));
		this.ang.y = clamp(err * t.yawGain, -t.yawRateMax, t.yawRateMax);
		body.setAngvel(this.ang, true);
	}
	leaderGap(i) {
		const lane = this.lane[i];
		const count = this.laneFill[lane];
		const base = lane * MAX_ON_LANE;
		let self = -1;
		for (let k = 0; k < count; k++) if (this.laneIndex[base + k] === i) {
			self = k;
			break;
		}
		if (self >= 0 && self + 1 < count) {
			const other = this.laneIndex[base + self + 1];
			return this.s[other] - this.s[i] - CAR_GAP;
		}
		const nxt = this.next[i];
		if (nxt < 0) return Infinity;
		const nCount = this.laneFill[nxt];
		const nBase = nxt * MAX_ON_LANE;
		for (let k = 0; k < nCount; k++) {
			const other = this.laneIndex[nBase + k];
			if (this.s[other] > 20) break;
			return this.lanes.length[lane] - this.s[i] + this.lanes.connectionLength(lane, nxt, this.laneOffset[i]) + this.s[other] - CAR_GAP;
		}
		return Infinity;
	}
	/** Along-lane distance to the player when the player is the leader. The stop band is `gapMin`. */
	playerGapOf(i, player) {
		const lane = this.lane[i];
		this.lanes.projectPath(lane, this.next[i], player.x, player.z, this.proj);
		if (this.proj.switched) return Infinity;
		const along = this.proj.s - this.s[i];
		const lateral = this.proj.lateral - this.laneOffset[i];
		if (along > 0 && along < this.tuning.playerGap && Math.abs(lateral) < this.tuning.playerLateral) return along;
		return Infinity;
	}
	/** Nearest car in the agent's own corridor ahead (within 14 m, at most `playerLateral` to either side). */
	aheadGap(i) {
		const x = this.x[i];
		const z = this.z[i];
		const yaw = this.yaw[i];
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		const rx = -Math.cos(yaw);
		const rz = Math.sin(yaw);
		const half = this.tuning.playerLateral;
		let gap = Infinity;
		for (let j = 0; j < this.capacity; j++) {
			if (j === i || this.state[j] === 0) continue;
			const dx = this.x[j] - x;
			const dz = this.z[j] - z;
			const along = dx * fx + dz * fz;
			if (along < 2 || along > 14) continue;
			if (Math.abs(dx * rx + dz * rz) > half) continue;
			const spare = along - CAR_GAP;
			if (spare < gap) gap = spare;
		}
		return gap;
	}
	mayEnter(i, player) {
		const t = this.tuning;
		if (this.forced[i] === 1) return true;
		if (this.wait[i] >= t.junctionWait) {
			this.forced[i] = 1;
			return true;
		}
		const lane = this.lane[i];
		const nxt = this.next[i];
		if (nxt < 0) return true;
		const node = this.lanes.toNode[lane];
		if (this.isHolder(node, i)) return true;
		if (this.plannerSpeed[i] <= 0 && this.playerNear(node, player)) return false;
		const fromHighway = this.lanes.limit[lane] === t.speedHighway;
		if (!fromHighway && this.highwayNode(node) && this.highwayApproaching(node)) return false;
		if (this.turn[i] === 0 && fromHighway) return true;
		if (this.waitingLonger(i, node, lane, nxt)) return false;
		const base = node * HOLDERS;
		let freeSlot = false;
		for (let k = 0; k < HOLDERS; k++) {
			const h = this.nodeHolders[base + k];
			if (h < 0) {
				freeSlot = true;
				continue;
			}
			const hNext = this.next[h];
			if (hNext < 0) continue;
			if (this.lanes.conflicts(lane, nxt, this.lane[h], hNext)) return false;
		}
		return freeSlot;
	}
	/** A conflicting car at the same node that is not a holder and has waited at least 1 s longer than `i`. */
	waitingLonger(i, node, lane, nxt) {
		const mine = this.wait[i];
		for (let k = 0; k < this.capacity; k++) {
			if (k === i) continue;
			const st = this.state[k];
			if (st !== 1 && st !== 2) continue;
			if (this.wait[k] < mine + 1 || this.forced[k] === 1) continue;
			const kLane = this.lane[k];
			const kNext = this.next[k];
			if (kLane < 0 || kNext < 0 || this.lanes.toNode[kLane] !== node) continue;
			if (this.isHolder(node, k)) continue;
			if (this.lanes.conflicts(lane, nxt, kLane, kNext)) return true;
		}
		return false;
	}
	isHolder(node, agent) {
		const base = node * HOLDERS;
		for (let k = 0; k < HOLDERS; k++) if (this.nodeHolders[base + k] === agent) return true;
		return false;
	}
	claimNode(i) {
		const lane = this.lane[i];
		const fromHighway = this.lanes.limit[lane] === this.tuning.speedHighway;
		if (this.turn[i] === 0 && fromHighway) return;
		const base = this.lanes.toNode[lane] * HOLDERS;
		let free = -1;
		for (let k = 0; k < HOLDERS; k++) {
			const h = this.nodeHolders[base + k];
			if (h === i) return;
			if (h < 0 && free < 0) free = k;
		}
		if (free < 0) return;
		this.nodeHolders[base + free] = i;
		this.nodeHoldFor[base + free] = 0;
	}
	releaseNodes(dt) {
		const clear = this.tuning.junctionClear;
		for (let n = 0; n < this.nodes.length; n++) {
			const base = n * HOLDERS;
			for (let k = 0; k < HOLDERS; k++) {
				const h = this.nodeHolders[base + k];
				if (h < 0) continue;
				this.nodeHoldFor[base + k] = this.nodeHoldFor[base + k] + dt;
				const lane = this.lane[h];
				const nxt = this.next[h];
				const leaving = lane >= 0 && nxt >= 0 && this.lanes.toNode[lane] === n && this.s[h] - this.lanes.length[lane] >= .55 * this.lanes.connectionLength(lane, nxt, this.laneOffset[h]);
				if (this.state[h] === 0 || lane < 0 || leaving || this.lanes.toNode[lane] !== n && this.s[h] >= clear || this.nodeHoldFor[base + k] > 8) {
					this.nodeHolders[base + k] = -1;
					this.nodeHoldFor[base + k] = 0;
				}
			}
		}
	}
	releaseHolds(i) {
		const lane = this.lane[i];
		if (lane < 0) return;
		const base = this.lanes.toNode[lane] * HOLDERS;
		for (let k = 0; k < HOLDERS; k++) if (this.nodeHolders[base + k] === i) this.nodeHolders[base + k] = -1;
	}
	highwayNode(node) {
		const n = this.nodes[node];
		return Math.abs(n.x) === 675 || Math.abs(n.z) === 675;
	}
	playerNear(node, player) {
		const n = this.nodes[node];
		const dx = n.x - player.x;
		const dz = n.z - player.z;
		return dx * dx + dz * dz < 144;
	}
	highwayApproaching(node) {
		const n = this.nodes[node];
		const reach = this.tuning.highwayGap;
		for (let i = 0; i < this.capacity; i++) {
			const st = this.state[i];
			if (st !== 1 && st !== 2) continue;
			const lane = this.lane[i];
			if (lane < 0 || this.lanes.limit[lane] !== this.tuning.speedHighway) continue;
			const dx = n.x - this.x[i];
			const dz = n.z - this.z[i];
			const dist2 = dx * dx + dz * dz;
			if (dist2 > reach * reach || dist2 < 1) continue;
			const fx = Math.sin(this.yaw[i]);
			const fz = Math.cos(this.yaw[i]);
			if (dx * fx + dz * fz > 0) return true;
		}
		return false;
	}
	chooseNext(i) {
		if (this.next[i] >= 0) return;
		const lane = this.lane[i];
		if (lane < 0) return;
		const len = this.lanes.length[lane];
		if (this.s[i] < len - 6) return;
		const planned = this.plannerNext[i];
		if (this.plannerLane[i] === lane && planned >= 0) {
			this.next[i] = planned;
			this.turn[i] = this.lanes.straightThrough(lane, planned) ? 0 : 1;
			return;
		}
		const outs = this.lanes.outs(lane);
		const uturn = this.lanes.uturn(lane);
		if (this.isHighway(lane) && this.rng() < this.tuning.highwayKeepLane) {
			const off = this.lanes.offset[lane];
			for (let k = 0; k < outs.length; k++) {
				const id = outs[k];
				if (id === uturn || !this.isHighway(id)) continue;
				if (Math.abs(this.lanes.offset[id] - off) > .01) continue;
				this.next[i] = id;
				this.turn[i] = this.lanes.straightThrough(lane, id) ? 0 : 1;
				return;
			}
		}
		let choices = 0;
		for (let k = 0; k < outs.length; k++) if (outs[k] !== uturn) choices++;
		let pick = -1;
		if (choices === 0) pick = outs[0] ?? -1;
		else {
			const which = this.rng() * choices | 0;
			let seen = 0;
			for (let k = 0; k < outs.length; k++) {
				const id = outs[k];
				if (id === uturn) continue;
				if (seen === which) {
					pick = id;
					break;
				}
				seen++;
			}
		}
		if (pick < 0) return;
		this.next[i] = pick;
		this.turn[i] = this.lanes.straightThrough(lane, pick) ? 0 : 1;
	}
	syncBodies(player, dt, events) {
		const t = this.tuning;
		for (let i = 0; i < this.capacity; i++) {
			if (this.agentBody[i] < 0) continue;
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			const release = t.physicsRelease + (this.police[i] === 1 ? t.policeBodyReach : 0);
			if (dx * dx + dz * dz > release * release) this.releaseBody(i);
		}
		for (let n = 0; n < this.capacity; n++) {
			const i = this.nearestNeedingBody(player);
			if (i < 0) break;
			let slot = this.freeBody();
			if (slot < 0) {
				let victim = this.lingeringWreck();
				if (victim < 0 && this.police[i] === 1 && this.policeBodies() < t.policeBodies) victim = this.farthestCivilian(player);
				if (victim < 0) victim = this.farthestUndisturbed(player, i);
				if (victim < 0) break;
				this.releaseBody(victim);
				slot = this.freeBody();
				if (slot < 0) break;
			}
			this.lend(i, slot);
		}
		for (let i = 0; i < this.capacity; i++) {
			if (this.agentBody[i] < 0) continue;
			const st = this.state[i];
			if (st === 3) {
				this.settle(i, dt);
				this.senseImpact(i);
			} else if (st === 2) {
				this.driveBody(i, player, dt, events);
				this.senseImpact(i);
			} else if (st === 4) this.senseImpact(i);
			else if (st === 5) this.senseImpact(i);
		}
	}
	/**
	* Kinematic cars inside the radius (or about to be reached), and wrecks near
	* the player without a body. A pursuit unit counts as `policeBodyReach` metres
	* nearer than it is, so it is served first and from further out: a patrol two
	* streets back still shoves when it arrives.
	*/
	nearestNeedingBody(player) {
		const t = this.tuning;
		const px = player.x + player.vx * .5;
		const pz = player.z + player.vz * .5;
		let best = -1;
		let bestD = Infinity;
		for (let i = 0; i < this.capacity; i++) {
			if (this.agentBody[i] >= 0) continue;
			const st = this.state[i];
			if (st !== 1 && st !== 4 && st !== 5) continue;
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			const dist = Math.hypot(dx, dz);
			const reach = this.police[i] === 1 ? t.policeBodyReach : 0;
			const ex = this.x[i] - px;
			const ez = this.z[i] - pz;
			const predicted = ex * ex + ez * ez < 64;
			if (dist > t.physicsRadius + reach && !predicted) continue;
			if (dist - reach < bestD) {
				bestD = dist - reach;
				best = i;
			}
		}
		return best;
	}
	/** Bodies currently lent to the pursuit. */
	policeBodies() {
		let n = 0;
		for (let i = 0; i < this.capacity; i++) if (this.police[i] === 1 && this.agentBody[i] >= 0) n++;
		return n;
	}
	/** The civilian driving body furthest from the player: what a patrol takes when the pool is full. */
	farthestCivilian(player) {
		let far = -1;
		let farD = 0;
		for (let i = 0; i < this.capacity; i++) {
			if (this.agentBody[i] < 0 || this.state[i] !== 2 || this.police[i] === 1) continue;
			if (this.reattachLeft[i] > 0) continue;
			const d = Math.hypot(this.x[i] - player.x, this.z[i] - player.z);
			if (d > farD) {
				farD = d;
				far = i;
			}
		}
		return far;
	}
	freeBody() {
		for (let b = 0; b < this.bodyAgent.length; b++) if (this.bodyAgent[b] < 0) return b;
		return -1;
	}
	/** A wreck that has had its body longer than `wreckLinger`: it gives the body up when a driving car needs it. */
	lingeringWreck() {
		let oldest = -1;
		let age = this.tuning.wreckLinger;
		for (let i = 0; i < this.capacity; i++) {
			if (this.agentBody[i] < 0 || this.state[i] !== 4) continue;
			if (this.wreckedFor[i] > age) {
				age = this.wreckedFor[i];
				oldest = i;
			}
		}
		return oldest;
	}
	/** Never a pursuit unit: the chase keeps its bodies until it is over. */
	farthestUndisturbed(player, than) {
		const thanD = Math.hypot(this.x[than] - player.x, this.z[than] - player.z);
		let far = -1;
		let farD = thanD;
		for (let i = 0; i < this.capacity; i++) {
			if (this.agentBody[i] < 0 || this.state[i] !== 2 || this.police[i] === 1) continue;
			if (this.reattachLeft[i] > 0) continue;
			const d = Math.hypot(this.x[i] - player.x, this.z[i] - player.z);
			if (d > farD) {
				farD = d;
				far = i;
			}
		}
		return far;
	}
	lend(i, slot) {
		const body = this.bodies[slot];
		const kind = this.kind[i];
		let col = this.bodyCollider[slot];
		if (this.bodyKind[slot] !== kind) {
			this.colliderAgent.delete(col.handle);
			this.world.removeCollider(col, false);
			col = this.world.createCollider(this.colliderDesc(kind), body);
			this.bodyCollider[slot] = col;
			this.bodyKind[slot] = kind;
		}
		this.colliderAgent.set(col.handle, i);
		body.userData = i;
		const yaw = this.yaw[i];
		const q = quatSetAxisAngle(this.scratchQ, 0, 1, 0, yaw);
		const driving = this.state[i] === 1;
		body.setEnabled(true);
		this.pos.x = this.x[i];
		this.pos.y = .03;
		this.pos.z = this.z[i];
		body.setTranslation(this.pos, true);
		body.setRotation(q, true);
		if (driving) {
			col.setCollisionGroups(GROUPS_TRAFFIC);
			body.setEnabledTranslations(true, false, true, true);
			const speed = this.speed[i];
			this.lin.x = Math.sin(yaw) * speed;
			this.lin.y = 0;
			this.lin.z = Math.cos(yaw) * speed;
			body.setLinvel(this.lin, true);
			this.state[i] = 2;
		} else {
			col.setCollisionGroups(GROUPS_SOLID);
			body.setEnabledTranslations(true, true, true, true);
			body.setLinvel(ZERO, true);
		}
		body.setAngvel(ZERO, true);
		this.bodyAgent[slot] = i;
		this.agentBody[i] = slot;
		this.reattachLeft[i] = 0;
	}
	/** Return the body. Driving and disturbed cars go back to kinematic; wrecks and abandoned cars keep their state and stop. */
	releaseBody(i) {
		const slot = this.agentBody[i];
		if (slot < 0) return;
		const body = this.bodies[slot];
		const col = this.bodyCollider[slot];
		this.colliderAgent.delete(col.handle);
		body.setLinvel(ZERO, true);
		body.setAngvel(ZERO, true);
		this.pos.x = 0;
		this.pos.y = -50;
		this.pos.z = 0;
		body.setTranslation(this.pos, true);
		body.setEnabled(false);
		this.bodyAgent[slot] = -1;
		this.agentBody[i] = -1;
		this.reattachLeft[i] = 0;
		const st = this.state[i];
		if (st === 2) this.state[i] = 1;
		else if (st === 3) {
			this.state[i] = 1;
			this.speed[i] = 0;
		} else this.speed[i] = 0;
		const lane = this.lane[i];
		if (lane >= 0) {
			this.lanes.projectPath(lane, this.next[i], this.x[i], this.z[i], this.proj, this.laneOffset[i]);
			if (this.proj.switched) this.switchLane(i, this.proj.s);
			else this.s[i] = this.proj.s;
			this.reposition(i);
		}
	}
	senseImpact(i) {
		const col = this.bodyCollider[this.agentBody[i]];
		this.contactSum = 0;
		this.playerSum = 0;
		this.wallSum = 0;
		this.trafficSum = 0;
		this.currentCol = col;
		this.world.contactPairsWith(col, this.onTrafficPair);
		this.currentCol = null;
		const id = KINDS[this.kind[i]];
		const mass = this.tuning.mass[id];
		const dv = this.contactSum / mass;
		this.contactDv[i] = dv;
		this.playerDv[i] = this.playerSum / mass;
		this.wallDv[i] = this.wallSum / mass;
		this.trafficDv[i] = this.trafficSum / mass;
		const st = this.state[i];
		if (st === 4 || st === 5) return;
		if (dv >= this.tuning.wreckImpact) {
			this.wreck(i);
			return;
		}
		if (dv > this.tuning.disturbedImpact) {
			if (st !== 3) this.loosen(i);
			this.state[i] = 3;
			this.disturbedFor[i] = this.tuning.disturbedTime;
		}
	}
	/** Let the lent body tumble: collide with the ground, free vertical motion. */
	loosen(i) {
		const slot = this.agentBody[i];
		if (slot < 0) return;
		this.bodyCollider[slot].setCollisionGroups(GROUPS_SOLID);
		this.bodies[slot].setEnabledTranslations(true, true, true, true);
	}
	/** The agent is a wreck from now on: a stopped obstacle until it despawns. */
	wreck(i) {
		if (this.state[i] === 4) return;
		this.loosen(i);
		this.state[i] = 4;
		this.wreckedFor[i] = 0;
		this.speed[i] = 0;
		this.releaseHolds(i);
		this.paintSerial++;
	}
	settle(i, dt) {
		this.disturbedFor[i] = this.disturbedFor[i] - dt;
		if (this.disturbedFor[i] > 0) return;
		const body = this.bodies[this.agentBody[i]];
		const r = body.rotation(this.rot);
		const up = 1 - 2 * (r.x * r.x + r.z * r.z);
		body.linvel(this.lin);
		const speed = Math.hypot(this.lin.x, this.lin.z);
		const lane = this.lane[i];
		let lateral = Infinity;
		if (lane >= 0) {
			this.lanes.projectPath(lane, this.next[i], this.x[i], this.z[i], this.proj, this.laneOffset[i]);
			lateral = Math.abs(this.proj.lateral);
		}
		if (up > .7 && speed < 6 && lateral < this.tuning.reattachDistance) {
			this.state[i] = 2;
			this.reattachLeft[i] = this.tuning.reattachBlend;
			if (this.proj.switched) this.switchLane(i, this.proj.s);
			else this.s[i] = this.proj.s;
			this.bodyCollider[this.agentBody[i]].setCollisionGroups(GROUPS_TRAFFIC);
			body.setEnabledTranslations(true, false, true, true);
			this.pos.x = this.x[i];
			this.pos.y = .03;
			this.pos.z = this.z[i];
			body.setTranslation(this.pos, true);
		} else this.wreck(i);
	}
	findFree() {
		for (let i = 0; i < this.capacity; i++) if (this.state[i] === 0) return i;
		return -1;
	}
	alive() {
		let n = 0;
		for (let i = 0; i < this.capacity; i++) if (this.state[i] !== 0) n++;
		return n;
	}
	place(i, lane, s, kind, offset, state, paint) {
		this.state[i] = state;
		this.police[i] = 0;
		this.clearPolicePlan(i);
		this.contactDv[i] = 0;
		this.playerDv[i] = 0;
		this.wallDv[i] = 0;
		this.trafficDv[i] = 0;
		this.kind[i] = kind;
		this.paint[i] = paint;
		this.lane[i] = lane;
		this.next[i] = -1;
		this.s[i] = s;
		this.laneOffset[i] = offset;
		const stopped = state === 4 || state === 5;
		this.speed[i] = stopped ? 0 : this.lanes.limit[lane];
		this.wait[i] = 0;
		this.forced[i] = 0;
		this.wobble[i] = 0;
		this.turn[i] = 0;
		this.honkCooldown[i] = 0;
		this.disturbedFor[i] = 0;
		this.wreckedFor[i] = 0;
		this.lastPlayerContactTick[i] = -1e5;
		this.lanes.positionAt(lane, s, offset, this.pose);
		this.x[i] = this.pose.x;
		this.z[i] = this.pose.z;
		this.yaw[i] = this.pose.yaw;
		this.paintSerial++;
		const q = quatSetAxisAngle(this.scratchQ, 0, 1, 0, this.pose.yaw);
		this.transforms.writeBoth(this.slot[i], this.pose.x, .03, this.pose.z, q.x, q.y, q.z, q.w);
	}
	free(i) {
		if (this.agentBody[i] >= 0) this.releaseBody(i);
		this.releaseHolds(i);
		this.state[i] = 0;
		this.police[i] = 0;
		this.clearPolicePlan(i);
		this.next[i] = -1;
		this.lane[i] = -1;
	}
	/**
	* Tow-away: a wreck older than `wreckTow` is freed the first step the player is
	* not looking at it. The sight test is instantaneous on purpose: a hidden-for
	* timer never fires for a player circling one junction.
	*/
	tow(player, dt) {
		const t = this.tuning;
		const near2 = t.wreckTowNear * t.wreckTowNear;
		const cosHalf = Math.cos(t.wreckTowConeDeg * Math.PI / 180);
		const fx = Math.sin(player.yaw);
		const fz = Math.cos(player.yaw);
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] !== 4) continue;
			const age = this.wreckedFor[i] + dt;
			this.wreckedFor[i] = age;
			if (age < t.wreckTow) continue;
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			const d2 = dx * dx + dz * dz;
			if (d2 < near2 || dx * fx + dz * fz >= cosHalf * Math.sqrt(d2)) continue;
			this.free(i);
			this.towedAway++;
		}
	}
	despawn(player) {
		const r2 = this.tuning.despawn * this.tuning.despawn;
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] === 0 || this.police[i] === 1) continue;
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			if (dx * dx + dz * dz > r2) this.free(i);
		}
	}
	spawn(player) {
		for (let n = 0; n < 4 && this.alive() < this.target; n++) if (!this.trySpawn(player)) return;
	}
	trySpawn(player) {
		const lanes = this.lanes;
		const t = this.tuning;
		for (let attempt = 0; attempt < 8; attempt++) {
			const lane = this.rng() * lanes.laneCount | 0;
			const dx = lanes.midX[lane] - player.x;
			const dz = lanes.midZ[lane] - player.z;
			const dist = Math.hypot(dx, dz);
			if (dist < t.spawnMin || dist > t.spawnMax) continue;
			if (!(dx * player.vx + dz * player.vz < 0) && dist < 230) continue;
			const len = lanes.length[lane];
			const s = this.rng() * len;
			if (this.nearOnLane(lane, s, t.gapMin + 8)) continue;
			const offset = this.pickOffset(lane);
			lanes.positionAt(lane, s, offset, this.pose);
			if (this.nearWorld(this.pose.x, this.pose.z, 10)) continue;
			const i = this.findFree();
			if (i < 0) return false;
			const roll = this.rng();
			const w = t.kindWeights;
			const kind = roll < w.compact ? KIND_INDEX.compact : roll < w.compact + w.muscle ? KIND_INDEX.muscle : KIND_INDEX.heavy;
			const paint = PAINTS[this.rng() * PAINTS.length | 0];
			this.place(i, lane, s, kind, offset, 1, paint);
			return true;
		}
		return false;
	}
	isHighway(lane) {
		return this.lanes.limit[lane] === this.tuning.speedHighway;
	}
	pickOffset(lane) {
		const list = this.isHighway(lane) ? this.tuning.subLaneOffsets.highway : this.tuning.subLaneOffsets.street;
		return list[this.rng() * list.length | 0] ?? 0;
	}
	retargetOffset(i, lane) {
		const list = this.isHighway(lane) ? this.tuning.subLaneOffsets.highway : this.tuning.subLaneOffsets.street;
		const offset = this.laneOffset[i];
		for (let k = 0; k < list.length; k++) if (list[k] === offset) return;
		this.laneOffset[i] = list[this.rng() * list.length | 0] ?? 0;
	}
	nearOnLane(lane, s, radius) {
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] === 0 || this.lane[i] !== lane) continue;
			if (Math.abs(this.s[i] - s) < radius) return true;
		}
		return false;
	}
	nearWorld(x, z, radius) {
		const r2 = radius * radius;
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] === 0) continue;
			const dx = this.x[i] - x;
			const dz = this.z[i] - z;
			if (dx * dx + dz * dz < r2) return true;
		}
		return false;
	}
	/** Per-lane lists in `s` order of every agent that occupies a lane (any state but Free). */
	buildLaneLists() {
		this.laneFill.fill(0);
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] === 0) continue;
			const lane = this.lane[i];
			if (lane < 0) continue;
			const count = this.laneFill[lane];
			if (count >= MAX_ON_LANE) continue;
			const base = lane * MAX_ON_LANE;
			let j = count;
			const si = this.s[i];
			while (j > 0 && this.s[this.laneIndex[base + j - 1]] > si) {
				this.laneIndex[base + j] = this.laneIndex[base + j - 1];
				j--;
			}
			this.laneIndex[base + j] = i;
			this.laneFill[lane] = count + 1;
		}
	}
	/** Push a kinematic car back along its lane when any car ahead of it is inside the 4.5 m spacing. */
	unstick() {
		for (let pass = 0; pass < 4; pass++) {
			let moved = false;
			for (let i = 0; i < this.capacity; i++) {
				if (this.state[i] !== 1) continue;
				for (let j = 0; j < this.capacity; j++) {
					if (j === i || this.state[j] === 0) continue;
					const dx = this.x[j] - this.x[i];
					const dz = this.z[j] - this.z[i];
					const dist = Math.hypot(dx, dz);
					if (dist >= CAR_GAP) continue;
					if (!(this.lane[i] === this.lane[j] ? this.s[j] > this.s[i] || this.s[j] === this.s[i] && j < i : dx * Math.sin(this.yaw[i]) + dz * Math.cos(this.yaw[i]) > 0)) continue;
					const deficit = CAR_GAP - dist + .2;
					const nextS = Math.max(0, this.s[i] - deficit);
					if (nextS === this.s[i]) continue;
					this.s[i] = nextS;
					if (this.speed[i] > this.speed[j]) this.speed[i] = this.speed[j];
					this.reposition(i);
					moved = true;
				}
			}
			if (!moved) return;
		}
	}
	closestOn(lane) {
		let best = Infinity;
		for (let j = 0; j < this.capacity; j++) {
			if (this.state[j] === 0 || this.lane[j] !== lane) continue;
			const sj = this.s[j];
			if (sj < best) best = sj;
		}
		return best;
	}
	reposition(i) {
		const lane = this.lane[i];
		if (lane < 0) return;
		this.lanes.positionAt(lane, this.s[i], this.laneOffset[i], this.pose, this.next[i]);
		this.x[i] = this.pose.x;
		this.z[i] = this.pose.z;
		this.yaw[i] = this.pose.yaw;
	}
	/** Last resort when the body pool is exhausted and a kinematic car overlaps the player. */
	guard(player, events) {
		for (let i = 0; i < this.capacity; i++) {
			if (this.state[i] !== 1) continue;
			if (!this.overlapsPlayer(i, player)) continue;
			const fx = Math.sin(player.yaw);
			const fz = Math.cos(player.yaw);
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			const side = dx * -fz - dz * -fx;
			this.laneOffset[i] = this.laneOffset[i] + (side >= 0 ? 3 : -3);
			this.reposition(i);
			this.guardHops++;
			events.push("honk", 0, this.x[i], .03, this.z[i], i);
		}
	}
	overlapsPlayer(i, player) {
		const yaw = this.yaw[i];
		const dx = player.x - this.x[i];
		const dz = player.z - this.z[i];
		const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
		const side = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
		const kind = this.kind[i];
		return Math.abs(side) <= this.halfW[kind] + player.halfWidth && Math.abs(along) <= this.halfL[kind] + player.halfLength;
	}
	honk(i, player, dt, events) {
		if (this.honkCooldown[i] > 0) this.honkCooldown[i] = this.honkCooldown[i] - dt;
		if (this.wobble[i] > 0) this.wobble[i] = Math.max(0, this.wobble[i] - dt);
		if (this.honkCooldown[i] > 0) return;
		const yaw = this.yaw[i];
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		const dx = player.x - this.x[i];
		const dz = player.z - this.z[i];
		const along = dx * fx + dz * fz;
		const side = dx * -Math.cos(yaw) + dz * Math.sin(yaw);
		const kind = this.kind[i];
		const ex = Math.max(0, Math.abs(side) - this.halfW[kind] - player.halfWidth);
		const ez = Math.max(0, Math.abs(along) - this.halfL[kind] - player.halfLength);
		if (ex * ex + ez * ez > 4) return;
		if (Math.hypot(player.vx - this.speed[i] * fx, player.vz - this.speed[i] * fz) <= 8) return;
		events.push("honk", 0, this.x[i], .03, this.z[i], i);
		this.honkCooldown[i] = this.tuning.honkCooldown;
		this.wobble[i] = this.tuning.wobbleTime;
	}
};
//#endregion
//#region src/sim/traffic/Pedestrians.ts
const TINTS = [
	PALETTE.carLime,
	PALETTE.carBlue,
	PALETTE.carOrange,
	PALETTE.carMagenta,
	CITY_COLORS.chalk,
	CITY_COLORS.mint
];
/** Chance to turn round at a corner instead of continuing round the block. */
const TURN_AROUND = .3;
/** Half width of the footway strip, m; the path runs down its middle. */
const PAVEMENT_HALF = 2.25;
/** A pedestrian off its line (after a dive) walks back onto it at this rate on top of its walk, m/s. */
const RETURN_SPEED = 1.5;
/** Look-ahead applies to cars faster than this, m/s. */
const CAR_MIN_SPEED = 3;
var Pedestrians = class {
	tuning;
	capacity;
	active;
	slot;
	lane;
	/** +1 walks along the lane direction, -1 against it. */
	dir;
	s;
	speed;
	x;
	z;
	yaw;
	pose;
	poseFor;
	tint;
	/** Bumps when a tint is assigned so the view reuploads instance colours. */
	tintSerial = 0;
	/** Last-resort hops (a car centre inside `guaranteeDistance`). */
	guaranteeHops = 0;
	/** Dives triggered by the player this step (Life pays boost for them). */
	dodgesThisStep = 0;
	/** Test hook: disable the dive so the guarantee alone must keep pedestrians clear. */
	dodgeEnabled = true;
	transforms;
	target;
	rng;
	graph;
	lanes;
	/** Pavement offset per lane (metres right of the lane polyline), or NaN when the lane has no footway. */
	pavement;
	walkable;
	incomingStart;
	incoming;
	diveX;
	diveZ;
	scored;
	pose3 = {
		x: 0,
		z: 0,
		yaw: 0
	};
	proj = {
		x: 0,
		z: 0,
		yaw: 0,
		s: 0,
		lateral: 0,
		dist: 0
	};
	q = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	q2 = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	q3 = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	time = 0;
	constructor(transforms, city, lanes, seed, tuning = PEDS, density = 1) {
		this.transforms = transforms;
		this.tuning = tuning;
		this.graph = city.graph;
		this.lanes = lanes;
		this.capacity = tuning.count;
		this.target = Math.max(0, Math.min(this.capacity, Math.round(tuning.count * density)));
		this.rng = mulberry32(seed ^ 40661);
		const n = this.capacity;
		this.active = new Uint8Array(n);
		this.slot = new Int16Array(n);
		this.lane = new Int16Array(n).fill(-1);
		this.dir = new Int8Array(n).fill(1);
		this.s = new Float32Array(n);
		this.speed = new Float32Array(n);
		this.x = new Float32Array(n);
		this.z = new Float32Array(n);
		this.yaw = new Float32Array(n);
		this.pose = new Uint8Array(n);
		this.poseFor = new Float32Array(n);
		this.tint = new Uint32Array(n);
		this.diveX = new Float32Array(n);
		this.diveZ = new Float32Array(n);
		this.scored = new Uint8Array(n);
		for (let i = 0; i < n; i++) this.slot[i] = transforms.allocate();
		const laneCount = this.graph.lanes.length;
		this.pavement = new Float32Array(laneCount);
		const walkable = [];
		for (let l = 0; l < laneCount; l++) {
			const offset = this.pavementOffset(l);
			this.pavement[l] = offset;
			if (!Number.isNaN(offset)) walkable.push(l);
		}
		this.walkable = Int16Array.from(walkable);
		const nodes = this.graph.nodes.length;
		const counts = new Int32Array(nodes);
		for (let l = 0; l < laneCount; l++) {
			const to = this.graph.lanes[l]?.to ?? 0;
			counts[to] = counts[to] + 1;
		}
		this.incomingStart = new Int32Array(nodes + 1);
		for (let k = 0; k < nodes; k++) this.incomingStart[k + 1] = this.incomingStart[k] + counts[k];
		this.incoming = new Int16Array(laneCount);
		const fill = new Int32Array(nodes);
		for (let l = 0; l < laneCount; l++) {
			const to = this.graph.lanes[l]?.to ?? 0;
			this.incoming[this.incomingStart[to] + fill[to]] = l;
			fill[to] = fill[to] + 1;
		}
		for (let i = 0; i < n; i++) transforms.writeBoth(this.slot[i], 0, -50, 0, 0, 0, 0, 1);
	}
	/** Metres right of the lane polyline to the middle of its footway; NaN on the highway's outer side. */
	pavementOffset(lane) {
		const l = this.graph.lanes[lane];
		if (!l) return NaN;
		let roadHalf = 12;
		let laneOffset = 4.5;
		if (l.highway) {
			roadHalf = 19;
			laneOffset = 6;
			const mid = l.points[l.points.length >> 1] ?? l.points[0];
			if (!mid) return NaN;
			const rx = -Math.cos(l.yaw);
			const rz = Math.sin(l.yaw);
			if (rx * -mid.x + rz * -mid.z <= 0) return NaN;
		} else if (l.special) for (const road of this.graph.special) {
			if (road.name !== l.special) continue;
			roadHalf = road.halfWidth;
			laneOffset = Math.min(4.5, road.halfWidth - 3.5);
		}
		return roadHalf + PAVEMENT_HALF - laneOffset;
	}
	count() {
		let n = 0;
		for (let i = 0; i < this.capacity; i++) if (this.active[i]) n++;
		return n;
	}
	/** Test and swap hook. Without a lane the pedestrian finds the nearest footway once it walks. */
	spawnAt(x, z, yaw, pose = 0) {
		const i = this.findFree();
		if (i < 0) return -1;
		this.active[i] = 1;
		this.lane[i] = -1;
		this.dir[i] = 1;
		this.s[i] = 0;
		this.x[i] = x;
		this.z[i] = z;
		this.yaw[i] = yaw;
		this.speed[i] = this.walkSpeed();
		this.pose[i] = pose;
		this.poseFor[i] = 0;
		this.scored[i] = 0;
		this.tint[i] = TINTS[this.rng() * TINTS.length | 0];
		this.tintSerial++;
		if (pose === 0) this.attach(i);
		this.writeOne(i, true);
		return i;
	}
	/** True if any active pedestrian's centre is inside the player's chassis footprint. */
	overlapsPlayer(player) {
		const fx = Math.sin(player.yaw);
		const fz = Math.cos(player.yaw);
		for (let i = 0; i < this.capacity; i++) {
			if (!this.active[i]) continue;
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			const along = dx * fx + dz * fz;
			const side = dx * -fz + dz * fx;
			if (Math.abs(along) <= player.halfLength && Math.abs(side) <= player.halfWidth) return true;
		}
		return false;
	}
	step(player, traffic, dt, events) {
		this.time += dt;
		this.dodgesThisStep = 0;
		this.despawn(player);
		this.spawn(player);
		for (let i = 0; i < this.capacity; i++) {
			if (!this.active[i]) continue;
			const pose = this.pose[i];
			if (pose === 0) this.walk(i, dt);
			else if (pose === 1) this.dive(i, dt);
			else if (pose === 2) this.getUp(i, dt);
			else this.fist(i, dt);
		}
		for (let i = 0; i < this.capacity; i++) {
			const pose = this.pose[i];
			if (this.active[i] && (pose === 1 || pose === 2)) this.tryScore(i, player, events);
		}
		if (this.dodgeEnabled) {
			this.dodgeFrom(player.x, player.z, player.vx, player.vz, true, player, events);
			if (traffic) for (let a = 0; a < traffic.capacity; a++) {
				const st = traffic.state[a];
				if (st !== 2 && st !== 3 || !traffic.hasBody(a)) continue;
				const yaw = traffic.yaw[a];
				const speed = traffic.speed[a];
				this.dodgeFrom(traffic.x[a], traffic.z[a], Math.sin(yaw) * speed, Math.cos(yaw) * speed, false, player, events);
			}
		}
		this.guarantee(player.x, player.z, player.vx, player.vz, player.yaw, player.halfWidth, player.halfLength);
		if (traffic) for (let a = 0; a < traffic.capacity; a++) {
			if (traffic.state[a] === 0 || !traffic.hasBody(a)) continue;
			const yaw = traffic.yaw[a];
			const speed = traffic.speed[a];
			this.guarantee(traffic.x[a], traffic.z[a], Math.sin(yaw) * speed, Math.cos(yaw) * speed, yaw, traffic.halfWidthOf(a), traffic.halfLengthOf(a));
		}
	}
	writeTransforms() {
		for (let i = 0; i < this.capacity; i++) this.writeOne(i, false);
	}
	writeOne(i, both) {
		const slot = this.slot[i];
		const tb = this.transforms;
		if (!this.active[i]) {
			tb.writeBoth(slot, 0, -50, 0, 0, 0, 0, 1);
			return;
		}
		const pose = this.pose[i];
		let y = 0;
		let pitch = 0;
		let roll = 0;
		if (pose === 0) y = Math.abs(Math.sin(this.s[i] * 4)) * .04;
		else if (pose === 1) pitch = Math.min(1, this.poseFor[i] / .25) * 70 * DEG;
		else if (pose === 2) pitch = Math.max(0, 1 - this.poseFor[i] / this.tuning.getUpTime) * 70 * DEG;
		else {
			roll = Math.sin(this.time * 25) * 8 * DEG;
			y = Math.abs(Math.sin(this.time * 12.5)) * .1;
		}
		quatSetAxisAngle(this.q, 0, 1, 0, this.yaw[i]);
		quatSetAxisAngle(this.q2, 1, 0, 0, pitch);
		quatMul(this.q3, this.q, this.q2);
		if (roll !== 0) {
			quatSetAxisAngle(this.q2, 0, 0, 1, roll);
			quatMul(this.q3, this.q3, this.q2);
		}
		const q = this.q3;
		if (both) tb.writeBoth(slot, this.x[i], y, this.z[i], q.x, q.y, q.z, q.w);
		else tb.write(slot, this.x[i], y, this.z[i], q.x, q.y, q.z, q.w);
	}
	walk(i, dt) {
		if (this.lane[i] < 0) this.attach(i);
		const lane = this.lane[i];
		if (lane < 0) return;
		const len = this.lanes.length[lane];
		let s = this.s[i] + this.dir[i] * this.speed[i] * dt;
		if (s > len || s < 0) {
			this.corner(i, s > len);
			s = Math.max(0, Math.min(len, this.s[i]));
		}
		this.s[i] = s;
		this.lanes.positionAt(this.lane[i], s, this.pavement[this.lane[i]], this.pose3);
		const dx = this.pose3.x - this.x[i];
		const dz = this.pose3.z - this.z[i];
		const d = Math.hypot(dx, dz);
		const step = (this.speed[i] + RETURN_SPEED) * dt;
		if (d <= step) {
			this.x[i] = this.pose3.x;
			this.z[i] = this.pose3.z;
		} else {
			this.x[i] = this.x[i] + dx / d * step;
			this.z[i] = this.z[i] + dz / d * step;
		}
		const facing = d > .5 ? Math.atan2(dx, dz) : this.dir[i] > 0 ? this.pose3.yaw : this.pose3.yaw + Math.PI;
		this.yaw[i] = facing;
	}
	/** At a corner: continue round the block (the nearest footway on the same side) or turn round. */
	corner(i, forward) {
		const lane = this.lane[i];
		if (this.rng() < TURN_AROUND) {
			this.dir[i] = -this.dir[i];
			this.s[i] = forward ? this.lanes.length[lane] : 0;
			return;
		}
		const l = this.graph.lanes[lane];
		if (!l) return;
		const x = this.x[i];
		const z = this.z[i];
		let best = 1600;
		let pick = -1;
		if (forward) {
			const outs = this.graph.nodes[l.to]?.outgoing ?? [];
			for (const c of outs) {
				const off = this.pavement[c];
				if (Number.isNaN(off) || c === lane) continue;
				this.lanes.positionAt(c, 0, off, this.pose3);
				const d = (this.pose3.x - x) ** 2 + (this.pose3.z - z) ** 2;
				if (d < best) {
					best = d;
					pick = c;
				}
			}
			if (pick >= 0) {
				this.lane[i] = pick;
				this.s[i] = 0;
				return;
			}
		} else {
			const from = l.from;
			const start = this.incomingStart[from];
			const end = this.incomingStart[from + 1];
			for (let k = start; k < end; k++) {
				const c = this.incoming[k];
				const off = this.pavement[c];
				if (Number.isNaN(off) || c === lane) continue;
				this.lanes.positionAt(c, this.lanes.length[c], off, this.pose3);
				const d = (this.pose3.x - x) ** 2 + (this.pose3.z - z) ** 2;
				if (d < best) {
					best = d;
					pick = c;
				}
			}
			if (pick >= 0) {
				this.lane[i] = pick;
				this.s[i] = this.lanes.length[pick];
				return;
			}
		}
		this.dir[i] = -this.dir[i];
		this.s[i] = forward ? this.lanes.length[lane] : 0;
	}
	/** Bind a pedestrian without a lane to the nearest footway line. */
	attach(i) {
		const x = this.x[i];
		const z = this.z[i];
		let best = Infinity;
		let pick = -1;
		let bestS = 0;
		for (let k = 0; k < this.walkable.length; k++) {
			const l = this.walkable[k];
			this.lanes.project(l, x, z, this.proj, this.pavement[l]);
			if (this.proj.dist < best) {
				best = this.proj.dist;
				pick = l;
				bestS = this.proj.s;
			}
		}
		if (pick < 0) return;
		this.lane[i] = pick;
		this.s[i] = bestS;
		this.dir[i] = this.rng() < .5 ? 1 : -1;
	}
	dodgeFrom(cx, cz, vx, vz, isPlayer, player, events) {
		const t = this.tuning;
		const speed = Math.hypot(vx, vz);
		if (speed < CAR_MIN_SPEED) return;
		const ex = cx + vx * t.lookAhead;
		const ez = cz + vz * t.lookAhead;
		const sx = ex - cx;
		const sz = ez - cz;
		const len2 = sx * sx + sz * sz;
		const nx = -vz / speed;
		const nz = vx / speed;
		for (let i = 0; i < this.capacity; i++) {
			if (!this.active[i] || this.pose[i] !== 0) continue;
			const dx = this.x[i] - cx;
			const dz = this.z[i] - cz;
			const along = (dx * sx + dz * sz) / len2;
			if (along < 0 || along > 1) continue;
			const px = cx + sx * along;
			const pz = cz + sz * along;
			if (Math.hypot(this.x[i] - px, this.z[i] - pz) > t.corridorHalfWidth) continue;
			const side = dx * nx + dz * nz >= 0 ? 1 : -1;
			this.diveX[i] = nx * side;
			this.diveZ[i] = nz * side;
			this.pose[i] = 1;
			this.poseFor[i] = 0;
			this.scored[i] = 0;
			this.yaw[i] = Math.atan2(this.diveX[i], this.diveZ[i]);
			if (isPlayer) this.tryScore(i, player, events);
		}
	}
	dive(i, dt) {
		const t = this.tuning;
		this.x[i] = this.x[i] + this.diveX[i] * t.diveSpeed * dt;
		this.z[i] = this.z[i] + this.diveZ[i] * t.diveSpeed * dt;
		this.poseFor[i] = this.poseFor[i] + dt;
		if (this.poseFor[i] >= t.diveTime) {
			this.pose[i] = 2;
			this.poseFor[i] = 0;
		}
	}
	getUp(i, dt) {
		this.poseFor[i] = this.poseFor[i] + dt;
		if (this.poseFor[i] >= this.tuning.getUpTime) {
			this.pose[i] = 0;
			this.poseFor[i] = 0;
		}
	}
	fist(i, dt) {
		this.poseFor[i] = this.poseFor[i] + dt;
		if (this.poseFor[i] >= this.tuning.fistTime) {
			this.pose[i] = 0;
			this.poseFor[i] = 0;
			this.lane[i] = -1;
		}
	}
	/** A diver the player's car passes within `scoreDistance` of its footprint scores once. Called on the dive and while down. */
	tryScore(i, player, events) {
		if (this.scored[i]) return;
		const fx = Math.sin(player.yaw);
		const fz = Math.cos(player.yaw);
		const dx = this.x[i] - player.x;
		const dz = this.z[i] - player.z;
		const along = Math.max(0, Math.abs(dx * fx + dz * fz) - player.halfLength);
		const side = Math.max(0, Math.abs(dx * -fz + dz * fx) - player.halfWidth);
		if (Math.hypot(along, side) > this.tuning.scoreDistance) return;
		this.scored[i] = 1;
		this.dodgesThisStep++;
		events.push("nearMissPed", 0, this.x[i], 0, this.z[i], i);
	}
	/** Last resort: a pedestrian inside a car's footprint grown by `guaranteeDistance` hops `hopDistance` clear of its side. */
	guarantee(cx, cz, vx, vz, yaw, halfWidth, halfLength) {
		const t = this.tuning;
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		const rx = -fz;
		const rz = fx;
		const reachAlong = halfLength + t.guaranteeDistance;
		const reachSide = halfWidth + t.guaranteeDistance;
		for (let i = 0; i < this.capacity; i++) {
			if (!this.active[i]) continue;
			const dx = this.x[i] - cx;
			const dz = this.z[i] - cz;
			const along = dx * fx + dz * fz;
			const side = dx * rx + dz * rz;
			if (Math.abs(along) > reachAlong || Math.abs(side) > reachSide) continue;
			const target = (side >= 0 ? 1 : -1) * (reachSide + t.hopDistance);
			this.x[i] = this.x[i] + rx * (target - side);
			this.z[i] = this.z[i] + rz * (target - side);
			this.guaranteeHops++;
			if (this.pose[i] === 0) {
				this.pose[i] = 2;
				this.poseFor[i] = 0;
			}
		}
	}
	findFree() {
		for (let i = 0; i < this.capacity; i++) if (!this.active[i]) return i;
		return -1;
	}
	walkSpeed() {
		const [lo, hi] = this.tuning.walkSpeed;
		return lo + this.rng() * (hi - lo);
	}
	despawn(player) {
		const r2 = this.tuning.despawn * this.tuning.despawn;
		for (let i = 0; i < this.capacity; i++) {
			if (!this.active[i]) continue;
			const dx = this.x[i] - player.x;
			const dz = this.z[i] - player.z;
			if (dx * dx + dz * dz > r2) this.active[i] = 0;
		}
	}
	spawn(player) {
		const t = this.tuning;
		let alive = this.count();
		for (let n = 0; n < 4 && alive < this.target; n++) {
			const lane = this.walkable[this.rng() * this.walkable.length | 0];
			const s = this.rng() * this.lanes.length[lane];
			this.lanes.positionAt(lane, s, this.pavement[lane], this.pose3);
			const dx = this.pose3.x - player.x;
			const dz = this.pose3.z - player.z;
			const dist = Math.hypot(dx, dz);
			if (dist < t.spawnMin || dist > t.spawnMax) continue;
			if (!(dx * player.vx + dz * player.vz < 0) && dist < 160) continue;
			const i = this.findFree();
			if (i < 0) return;
			this.active[i] = 1;
			this.lane[i] = lane;
			this.dir[i] = this.rng() < .5 ? 1 : -1;
			this.s[i] = s;
			this.x[i] = this.pose3.x;
			this.z[i] = this.pose3.z;
			this.yaw[i] = this.dir[i] > 0 ? this.pose3.yaw : this.pose3.yaw + Math.PI;
			this.speed[i] = this.walkSpeed();
			this.pose[i] = 0;
			this.poseFor[i] = 0;
			this.scored[i] = 0;
			this.tint[i] = TINTS[this.rng() * TINTS.length | 0];
			this.tintSerial++;
			this.writeOne(i, true);
			alive++;
		}
	}
};
//#endregion
//#region src/sim/life/Life.ts
/**
* Risk economy and hit classification. Damage, swap and takedowns land in
* later slices; this one pays boost for a near miss and for the oncoming lane.
*/
var Life = class {
	sim;
	damageEnabled;
	state = {
		damage: 0,
		stage: 0,
		wrecked: false,
		wreckedFor: 0,
		swapCandidate: -1,
		oncoming: false,
		slowMo: 0,
		slowMoTarget: -1,
		respawnIn: -1
	};
	wasAhead;
	cool;
	/** Agents already taken down (one takedown each); cleared when the agent is freed. */
	takenDown;
	/** The player's velocity before this step's physics, for closing speeds. */
	prevVx = 0;
	prevVz = 0;
	lastHit = -10;
	/** Collider handle of the previous step's contact, so a hit is reported once per contact, not per step. */
	lastHitHandle = -1;
	/** What the strongest contact of this step was, for the damage rules. */
	hitKind = "none";
	oncomingLeft = 0;
	oncomingEvent = 0;
	proj = {
		x: 0,
		y: 0,
		z: 0,
		yaw: 0,
		s: 0,
		lateral: 0,
		dist: 0
	};
	rot = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	handover = {
		x: 0,
		y: 0,
		z: 0,
		yaw: 0,
		vx: 0,
		vz: 0,
		kind: "muscle"
	};
	oldPose = {
		x: 0,
		y: 0,
		z: 0,
		yaw: 0
	};
	/** `damageEnabled` false keeps the playground a handling lab: hits are classified and reported, nothing dents or wrecks. */
	constructor(sim, damageEnabled = true) {
		this.sim = sim;
		this.damageEnabled = damageEnabled;
		const n = sim.traffic?.capacity ?? 1;
		this.wasAhead = new Uint8Array(n);
		this.cool = new Float32Array(n);
		this.takenDown = new Uint8Array(n);
	}
	preStep(controls, dt) {
		const st = this.state;
		st.swapCandidate = this.findSwapCandidate();
		if (controls.swap && st.swapCandidate >= 0) {
			this.swap(st.swapCandidate);
			controls.swap = false;
			return;
		}
		if (st.wrecked) {
			st.wreckedFor += dt;
			st.respawnIn = Math.max(0, st.respawnIn - dt);
			if (controls.reset || st.respawnIn <= 0) {
				this.respawn();
				controls.reset = false;
			}
		} else if (controls.reset) this.heal();
	}
	postStep(dt) {
		if (this.state.slowMo > 0) {
			this.state.slowMo = Math.max(0, this.state.slowMo - dt / ECONOMY.slowMoScale);
			if (this.state.slowMo === 0) this.state.slowMoTarget = -1;
		}
		this.hits();
		this.damageStep();
		this.takedowns();
		this.billboards();
		this.nearMisses(dt);
		this.oncomingLane(dt);
		const dodges = this.sim.peds?.dodgesThisStep ?? 0;
		if (dodges > 0) this.grant(ECONOMY.pedDodgeBoost * dodges);
	}
	/**
	* A car the player touched inside `takedownWindow` that then slams a wall or
	* another car hard, flips, or took the player's own hit at closing speed:
	* it wrecks at once, pays boost and starts the takedown slow motion.
	*/
	takedowns() {
		const traffic = this.sim.traffic;
		if (!traffic) return;
		const tm = this.sim.vehicle.telemetry;
		const window = ECONOMY.takedownWindow * 60;
		for (let i = 0; i < traffic.capacity; i++) {
			const st = traffic.state[i];
			if (st === 0) {
				this.takenDown[i] = 0;
				continue;
			}
			if (this.takenDown[i] || st === 4 || !traffic.hasBody(i)) continue;
			if (this.sim.tick - traffic.lastPlayerContactTick[i] > window) continue;
			const wall = traffic.wallDv[i] >= ECONOMY.takedownDeltaV;
			const other = traffic.trafficDv[i] >= ECONOMY.takedownDeltaV;
			const flipped = traffic.upOf(i) < .3;
			let direct = false;
			if (traffic.playerDv[i] >= ECONOMY.takedownDeltaV) {
				const ayaw = traffic.yaw[i];
				const speed = traffic.prevSpeed[i];
				direct = Math.hypot(this.prevVx - Math.sin(ayaw) * speed, this.prevVz - Math.cos(ayaw) * speed) >= ECONOMY.takedownClosingSpeed;
			}
			if (!wall && !other && !flipped && !direct) continue;
			this.takenDown[i] = 1;
			traffic.wreck(i);
			const boost = other ? ECONOMY.takedownTrafficBoost : ECONOMY.takedownBoost;
			this.grant(boost);
			this.sim.events.push(other ? "takedownTraffic" : "takedown", boost, traffic.x[i], .5, traffic.z[i], i);
			this.state.slowMo = ECONOMY.slowMoSeconds;
			this.state.slowMoTarget = i;
		}
		this.prevVx = tm.vx;
		this.prevVz = tm.vz;
	}
	/** A billboard the footprint crosses at speed smashes: boost, a small speed loss, one `billboard` event, once per id. */
	billboards() {
		const c = this.sim.collectibles;
		if (!c) return;
		const id = c.step(this.sim.probe, ECONOMY.billboardMinSpeed);
		if (id < 0) return;
		this.grant(ECONOMY.billboardBoost);
		const v = this.sim.vehicle;
		const tm = v.telemetry;
		const keep = 1 - ECONOMY.billboardSpeedLoss;
		v.setVelocity(tm.vx * keep, tm.vy, tm.vz * keep);
		const board = c.descOf(id);
		this.sim.events.push("billboard", ECONOMY.billboardBoost, board ? board.x : this.sim.probe.x, 3.75, board ? board.z : this.sim.probe.z, id);
	}
	/** Damage from this step's strongest contact: walls at full weight, traffic at `trafficFactor`, props and terrain never. */
	damageStep() {
		const st = this.state;
		if (!this.damageEnabled || st.wrecked) return;
		const kind = this.hitKind;
		if (kind !== "wall" && kind !== "traffic") return;
		const tm = this.sim.vehicle.telemetry;
		const over = tm.impact - DAMAGE.threshold;
		if (over <= 0) return;
		const delta = over * DAMAGE.perMetrePerSecond * (kind === "traffic" ? DAMAGE.trafficFactor : 1);
		st.damage = Math.min(1, st.damage + delta);
		let stage = 0;
		for (let k = 0; k < DAMAGE.stages.length; k++) if (st.damage >= DAMAGE.stages[k]) stage = k + 1;
		if (stage === st.stage) return;
		st.stage = stage;
		this.sim.events.push("damage", stage, tm.contactX, tm.contactY, tm.contactZ, -1);
		if (stage >= 4) this.wreck();
	}
	wreck() {
		const st = this.state;
		st.wrecked = true;
		st.wreckedFor = 0;
		st.respawnIn = DAMAGE.wreckRespawn;
		this.sim.vehicle.engineCut = true;
		const p = this.sim.vehicle.body.translation(this.proj);
		this.sim.events.push("wrecked", 1, p.x, p.y, p.z, -1);
	}
	heal() {
		const st = this.state;
		st.damage = 0;
		st.stage = 0;
		st.wrecked = false;
		st.wreckedFor = 0;
		st.respawnIn = -1;
		this.sim.vehicle.engineCut = false;
	}
	/** A fresh car of the same class, rolling on the nearest road, with the boost meter kept. */
	respawn() {
		const v = this.sim.vehicle;
		const pose = v.resetPose;
		v.teleport(pose.position, pose.yaw);
		v.setVelocity(Math.sin(pose.yaw) * DAMAGE.respawnSpeed, 0, Math.cos(pose.yaw) * DAMAGE.respawnSpeed);
		this.sim.traffic?.clearAround(pose.position.x, pose.position.z, DAMAGE.respawnClear);
		this.heal();
		this.sim.respawned = true;
		this.sim.events.push("respawn", 0, pose.position.x, pose.position.y, pose.position.z, -1);
	}
	/** The nearest traffic car alongside, within `SWAP.range` along and `SWAP.lateral` across, not much faster or slower. */
	findSwapCandidate() {
		const traffic = this.sim.traffic;
		if (!traffic) return -1;
		const tm = this.sim.vehicle.telemetry;
		if (!SWAP.airborneAllowed && tm.groundedWheels < 2) return -1;
		const p = this.sim.vehicle.body.translation(this.proj);
		const yaw = yawOf(this.sim.vehicle.body.rotation(this.rot));
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		const rx = -fz;
		const rz = fx;
		let best = -1;
		let bestD = Infinity;
		for (let i = 0; i < traffic.capacity; i++) {
			if (traffic.state[i] === 0) continue;
			const dx = traffic.x[i] - p.x;
			const dz = traffic.z[i] - p.z;
			const along = dx * fx + dz * fz;
			const side = dx * rx + dz * rz;
			if (Math.abs(along) > SWAP.range || Math.abs(side) > SWAP.lateral) continue;
			const ayaw = traffic.yaw[i];
			const speed = traffic.speed[i];
			if (Math.hypot(tm.vx - Math.sin(ayaw) * speed, tm.vz - Math.cos(ayaw) * speed) > SWAP.maxRelativeSpeed) continue;
			const d = along * along + side * side;
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		}
		return best;
	}
	/** Take the candidate's car: retune the vehicle in place, carry the speed, leave the old car and its driver behind. */
	swap(agent) {
		const traffic = this.sim.traffic;
		if (!traffic) return;
		const v = this.sim.vehicle;
		const p = v.body.translation(this.proj);
		const oldYaw = yawOf(v.body.rotation(this.rot));
		this.oldPose.x = p.x;
		this.oldPose.y = p.y;
		this.oldPose.z = p.z;
		this.oldPose.yaw = oldYaw;
		const oldKind = this.sim.carId;
		traffic.takeOver(agent, oldKind, PLAYER_PAINT[oldKind], this.oldPose, this.state.wrecked, this.handover);
		const h = this.handover;
		this.sim.carId = h.kind;
		v.tuning = cloneTuning(CAR_PRESETS[h.kind]);
		v.applyTuning();
		this.proj.x = h.x;
		this.proj.y = p.y;
		this.proj.z = h.z;
		v.teleport(this.proj, h.yaw);
		v.setVelocity(h.vx, 0, h.vz);
		this.heal();
		const lx = Math.cos(oldYaw);
		const lz = -Math.sin(oldYaw);
		const px = this.oldPose.x + lx * 2.2;
		const pz = this.oldPose.z + lz * 2.2;
		this.sim.peds?.spawnAt(px, pz, Math.atan2(h.x - px, h.z - pz), 3);
		this.sim.events.push("swap", 0, h.x, h.y, h.z, agent);
		this.state.swapCandidate = -1;
	}
	skipSlowMo() {
		this.state.slowMo = 0;
		this.state.slowMoTarget = -1;
	}
	/** Traffic, a fixed restitution-1 solid (building or boundary), other fixed colliders, or a dynamic prop. */
	classify(handle) {
		if (handle < 0) return "none";
		if (this.sim.traffic && this.sim.traffic.agentForCollider(handle) >= 0) return "traffic";
		const col = this.sim.world.getCollider(handle);
		if (!col) return "none";
		const parent = col.parent();
		if (!(parent === null || parent.isFixed())) return "prop";
		return col.restitution() >= .99 ? "wall" : "terrain";
	}
	hits() {
		const tm = this.sim.vehicle.telemetry;
		this.hitKind = "none";
		if (tm.hitHandle < 0 || tm.impact <= 0) {
			this.lastHitHandle = -1;
			return;
		}
		const kind = this.classify(tm.hitHandle);
		if (kind === "none") return;
		this.hitKind = kind;
		this.lastHit = this.sim.time;
		const agent = kind === "traffic" ? this.sim.traffic?.agentForCollider(tm.hitHandle) ?? -1 : -1;
		if (agent >= 0 && this.sim.traffic) this.sim.traffic.lastPlayerContactTick[agent] = this.sim.tick;
		const fresh = tm.hitHandle !== this.lastHitHandle;
		this.lastHitHandle = tm.hitHandle;
		if (!fresh && tm.impact < this.sim.vehicle.tuning.wallHitSpeed) return;
		this.sim.events.push("hit", tm.impact, tm.contactX, tm.contactY, tm.contactZ, agent);
	}
	nearMisses(dt) {
		const traffic = this.sim.traffic;
		if (!traffic) return;
		const tm = this.sim.vehicle.telemetry;
		const px = this.sim.vehicle.body.translation(this.proj);
		const playerX = px.x;
		const playerZ = px.z;
		const speed = Math.hypot(tm.vx, tm.vz);
		const recentHit = this.sim.time - this.lastHit < .5;
		for (let i = 0; i < traffic.capacity; i++) {
			if (this.cool[i] > 0) this.cool[i] = this.cool[i] - dt;
			if (traffic.state[i] === 0) continue;
			const ax = traffic.x[i];
			const az = traffic.z[i];
			const ox = ax - playerX;
			const oz = az - playerZ;
			const dist = Math.hypot(ox, oz);
			const ahead = ox * tm.vx + oz * tm.vz > 0;
			if (ahead) this.wasAhead[i] = 1;
			else if (dist > 12) this.wasAhead[i] = 0;
			if (dist > 12 || recentHit || this.cool[i] > 0 || this.wasAhead[i] !== 1 || ahead) continue;
			const id = CAR_IDS[traffic.kind[i]];
			if (!id) continue;
			const agentHw = CAR_PRESETS[id].chassisHalfExtents.x;
			if (dist - this.sim.vehicle.tuning.chassisHalfExtents.x - agentHw > ECONOMY.nearMissGap) {
				if (!ahead) this.wasAhead[i] = 0;
				continue;
			}
			const avx = Math.sin(traffic.yaw[i]) * traffic.speed[i];
			const avz = Math.cos(traffic.yaw[i]) * traffic.speed[i];
			if (Math.hypot(tm.vx - avx, tm.vz - avz) < ECONOMY.nearMissSpeed) continue;
			const heading = Math.sin(traffic.yaw[i]) * tm.vx + Math.cos(traffic.yaw[i]) * tm.vz;
			const oncoming = speed > 1 && heading / speed < -.5;
			const boost = oncoming ? ECONOMY.nearMissOncomingBoost : ECONOMY.nearMissBoost;
			this.grant(boost);
			this.sim.events.push(oncoming ? "nearMissOncoming" : "nearMiss", boost, ax, .03, az, i);
			this.cool[i] = ECONOMY.nearMissCooldown;
			this.wasAhead[i] = 0;
		}
	}
	oncomingLane(dt) {
		const traffic = this.sim.traffic;
		const tm = this.sim.vehicle.telemetry;
		const speed = Math.hypot(tm.vx, tm.vz);
		let opposed = false;
		if (traffic && speed >= ECONOMY.oncomingSpeed) {
			const pos = this.sim.vehicle.body.translation(this.proj);
			const x = pos.x;
			const z = pos.z;
			const lane = this.sim.city ? this.sim.city.nearestLane(x, z) : -1;
			let best = Infinity;
			let yaw = 0;
			if (lane >= 0) {
				traffic.lanes.project(lane, x, z, this.proj);
				best = Math.abs(this.proj.lateral);
				yaw = this.proj.yaw;
			}
			if (best <= ECONOMY.oncomingLaneDistance) opposed = (Math.sin(yaw) * tm.vx + Math.cos(yaw) * tm.vz) / speed < -.7;
		}
		if (opposed) this.oncomingLeft = ECONOMY.oncomingHysteresis;
		else this.oncomingLeft = Math.max(0, this.oncomingLeft - dt);
		const active = this.oncomingLeft > 0 && speed >= ECONOMY.oncomingSpeed;
		this.state.oncoming = active;
		if (!active) {
			this.oncomingEvent = 0;
			return;
		}
		const gained = ECONOMY.oncomingBoostPerSecond * dt;
		this.grant(gained);
		this.oncomingEvent += dt;
		if (this.oncomingEvent >= 1) {
			this.oncomingEvent -= 1;
			const pos = this.sim.vehicle.body.translation(this.proj);
			this.sim.events.push("oncoming", ECONOMY.oncomingBoostPerSecond, pos.x, pos.y, pos.z, -1);
		}
	}
	grant(amount) {
		const meter = this.sim.vehicle.boostMeter;
		this.sim.vehicle.boostMeter = Math.min(1, meter + amount);
	}
};
//#endregion
//#region src/sim/balance.ts
/** Run economy. Heat is a ratchet; only ending a run resets it. */
const BALANCE = {
	heatThresholds: [
		20,
		40,
		60,
		80,
		100
	],
	heat: {
		trafficTakedown: 4,
		policeTakedown: 10,
		billboard: 2,
		camera: 5,
		roadblock: 6
	}
};
//#endregion
//#region src/sim/heat/Heat.ts
/** Heat survives an escape. Event consumers each own a cursor into the ring. */
var Heat = class {
	events;
	traffic;
	value = 0;
	sequence = 0;
	constructor(events, traffic) {
		this.events = events;
		this.traffic = traffic;
	}
	get points() {
		return this.value;
	}
	get level() {
		let level = 0;
		for (const threshold of BALANCE.heatThresholds) if (this.value >= threshold) level++;
		return level;
	}
	add(points) {
		if (points > 0 && Number.isFinite(points)) this.value = Math.min(100, this.value + points);
	}
	reset() {
		this.value = 0;
		this.sequence = this.events.sequence;
	}
	step() {
		this.sequence = this.events.readFrom(this.sequence, this.onEvent);
	}
	onEvent = (event) => {
		const heat = BALANCE.heat;
		if (event.kind === "takedown" || event.kind === "takedownTraffic") this.add(this.traffic?.police[event.target] ? heat.policeTakedown : heat.trafficTakedown);
		else if (event.kind === "billboard") this.add(heat.billboard);
	};
};
//#endregion
//#region src/sim/police/tuning.ts
const POLICE = {
	budget: [
		0,
		2,
		4,
		5,
		6,
		8
	],
	interceptors: [
		0,
		0,
		1,
		2,
		2,
		3
	],
	escapeSeconds: [
		0,
		6,
		8,
		10,
		12,
		15
	],
	sightRange: 90,
	sightEveryTicks: 6,
	sightHeight: 1.2,
	viewHalfAngleDeg: 55,
	viewNear: 40,
	spawnMin: 45,
	spawnMax: 180,
	spawnBehind: 65,
	spawnSample: 10,
	spawnEndInset: 6,
	spawnClearance: 14,
	spawnRetrySeconds: .25,
	reinforceSeconds: 8,
	spawnHeadingWeight: 30,
	withdrawRange: 120,
	projectSeconds: 1.2,
	routeSeconds: .5,
	targetHeadingWeight: 12,
	chaseSpeed: 30,
	ramRange: 14,
	ramLeadSeconds: .15,
	ramClosingSpeed: 6,
	ramAcceleration: 14,
	ramContactDv: .8,
	ramCooldown: 1,
	interceptorSpeed: 38,
	pitRange: 11,
	catchUpRange: 55,
	catchUpSpeed: 48,
	pitAcceleration: 22,
	pitSideOffset: 1.1,
	patrolRecycle: 260
};
//#endregion
//#region src/sim/police/Police.ts
/** Two graph patrols, sharing Traffic's agent records, steering and physical body pool. */
var Police = class {
	units;
	tuning = POLICE;
	/** Units alive now, and the roster the current heat level pays for. */
	count = 0;
	budget = 0;
	ramsReceived = 0;
	sim;
	traffic;
	graph;
	seen;
	withdrawing;
	rammed;
	ramCooldown;
	ray = new RAPIER.Ray({
		x: 0,
		y: 0,
		z: 0
	}, {
		x: 0,
		y: 0,
		z: 1
	});
	pos = {
		x: 0,
		y: 0,
		z: 0
	};
	pose = {
		x: 0,
		z: 0,
		yaw: 0
	};
	projection = {
		x: 0,
		z: 0,
		yaw: 0,
		s: 0,
		lateral: 0,
		dist: 0
	};
	distance;
	visited;
	incoming;
	previousIncoming;
	laneCost;
	radius;
	targetLane = -1;
	targetS = 0;
	routeLeft = 0;
	spawnLeft = 0;
	hot = false;
	constructor(sim) {
		if (!sim.traffic || !sim.city) throw new Error("Police requires city traffic");
		this.sim = sim;
		this.traffic = sim.traffic;
		this.graph = sim.city.graph;
		this.units = new Int16Array(Math.max(...this.tuning.budget));
		this.units.fill(-1);
		this.seen = new Uint8Array(this.units.length);
		this.withdrawing = new Uint8Array(this.units.length);
		this.rammed = new Uint8Array(this.units.length);
		this.ramCooldown = new Float32Array(this.units.length);
		this.distance = new Float64Array(this.graph.nodes.length);
		this.visited = new Uint8Array(this.graph.nodes.length);
		this.incoming = new Int16Array(this.graph.nodes.length);
		this.incoming.fill(-1);
		this.previousIncoming = new Int16Array(this.graph.lanes.length);
		this.laneCost = new Float32Array(this.graph.lanes.length);
		for (let i = 0; i < this.graph.lanes.length; i++) {
			const lane = this.graph.lanes[i];
			this.previousIncoming[i] = this.incoming[lane.to];
			this.incoming[lane.to] = i;
			const from = this.graph.nodes[lane.from];
			const to = this.graph.nodes[lane.to];
			this.laneCost[i] = this.traffic.lanes.length[i] + Math.hypot(lane.x0 - from.x, lane.z0 - from.z) + Math.hypot(lane.x1 - to.x, lane.z1 - to.z);
		}
		const extents = CAR_PRESETS.police.chassisHalfExtents;
		this.radius = Math.hypot(extents.x, extents.z);
	}
	/** Runs before Traffic.step; never steps traffic or physics itself. */
	preStep(player, dt) {
		const traffic = this.traffic;
		const pursuit = this.sim.pursuit;
		const t = this.tuning;
		const level = this.sim.heat.level;
		const cosHalf = Math.cos(t.viewHalfAngleDeg * Math.PI / 180);
		this.count = 0;
		for (let u = 0; u < this.units.length; u++) {
			const agent = this.units[u];
			if (agent < 0) continue;
			const state = traffic.state[agent];
			if (traffic.police[agent] !== 1 || state === 0 || state === 4 || state === 5) {
				traffic.clearPolicePlan(agent);
				this.units[u] = -1;
				this.seen[u] = 0;
				this.rammed[u] = 0;
				this.spawnLeft = Math.max(this.spawnLeft, t.reinforceSeconds);
				continue;
			}
			this.count++;
			this.ramCooldown[u] = Math.max(0, this.ramCooldown[u] - dt);
			if (this.rammed[u] === 1 && traffic.hasBody(agent) && traffic.playerDv[agent] >= t.ramContactDv && this.ramCooldown[u] === 0) {
				this.ramsReceived++;
				this.ramCooldown[u] = t.ramCooldown;
			}
			this.rammed[u] = 0;
			traffic.clearPolicePlan(agent);
		}
		if (level === 0) {
			this.hot = false;
			this.spawnLeft = 0;
			this.seen.fill(0);
			this.withdrawing.fill(0);
			pursuit.step(dt, level, false, player.x, player.z);
			return;
		}
		if (!this.hot) {
			this.hot = true;
			this.spawnLeft = 0;
		}
		this.budget = Math.min(this.units.length, t.budget[level] ?? 0);
		this.spawnLeft -= dt;
		if (this.count < this.budget && this.spawnLeft <= 0) {
			this.spawnLeft = t.spawnRetrySeconds;
			for (let u = 0; u < this.units.length && this.count < this.budget; u++) {
				if (this.units[u] >= 0) continue;
				const agent = this.spawn(player, cosHalf, this.interceptorsWanted(level));
				if (agent < 0) break;
				this.units[u] = agent;
				this.seen[u] = 0;
				this.withdrawing[u] = 0;
				this.ramCooldown[u] = 0;
				this.count++;
			}
		}
		let visible = false;
		const every = Math.max(1, Math.round(t.sightEveryTicks));
		for (let u = 0; u < this.units.length; u++) {
			const agent = this.units[u];
			if (agent < 0) continue;
			const x = traffic.x[agent], z = traffic.z[agent];
			const distance = Math.hypot(player.x - x, player.z - z);
			if (this.withdrawing[u] === 1) {
				this.seen[u] = 0;
				if (distance >= t.withdrawRange && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) this.withdrawing[u] = 0;
				continue;
			}
			if (distance > t.sightRange) this.seen[u] = 0;
			else if (this.sim.tick % every === Math.floor(u * every / this.units.length)) this.seen[u] = this.canSee(agent, player, distance) ? 1 : 0;
			if (this.seen[u] === 1) visible = true;
		}
		const before = pursuit.state;
		pursuit.step(dt, level, visible, player.x, player.z);
		if (before === "lost" && pursuit.state === "idle") {
			this.withdrawing.fill(1);
			this.seen.fill(0);
		}
		const chasing = pursuit.state === "detected" || pursuit.state === "active";
		this.routeLeft -= dt;
		if (chasing && (this.routeLeft <= 0 || this.targetLane < 0 || before === "idle" || before === "lost")) {
			this.route(player);
			this.routeLeft = t.routeSeconds;
		}
		for (let u = 0; u < this.units.length; u++) {
			const agent = this.units[u];
			if (agent < 0) continue;
			if (!chasing) {
				if (this.withdrawing[u] === 1) {
					traffic.setPolicePlan(agent, this.awayExit(agent, player), 0);
					continue;
				}
				const x = traffic.x[agent], z = traffic.z[agent];
				if (Math.hypot(player.x - x, player.z - z) > t.patrolRecycle && traffic.outOfView(x, z, this.radius, player, t.viewNear, cosHalf)) {
					traffic.releasePolice(agent);
					this.units[u] = -1;
					this.seen[u] = 0;
					this.count--;
				}
				continue;
			}
			const next = this.routeExit(agent);
			const pit = traffic.kindOf(agent) === "sports";
			const dx = player.x - traffic.x[agent];
			const dz = player.z - traffic.z[agent];
			const gap = Math.hypot(dx, dz);
			const speed = gap > t.catchUpRange ? t.catchUpSpeed : pit ? t.interceptorSpeed : t.chaseSpeed;
			const range = pit ? t.pitRange : t.ramRange;
			if (!(this.seen[u] === 1 && traffic.state[agent] === 2 && gap <= range)) {
				traffic.setPolicePlan(agent, next, speed);
				continue;
			}
			let aimX = player.x + player.vx * t.ramLeadSeconds;
			let aimZ = player.z + player.vz * t.ramLeadSeconds;
			if (pit) {
				const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
				const side = -dx * -fz - dz * fx >= 0 ? 1 : -1;
				aimX = player.x - fx * player.halfLength * .9 + -fz * side * t.pitSideOffset;
				aimZ = player.z - fz * player.halfLength * .9 + fx * side * t.pitSideOffset;
			}
			traffic.setPolicePlan(agent, next, speed, aimX, aimZ, Math.min(speed, player.speed + t.ramClosingSpeed), pit ? t.pitAcceleration : t.ramAcceleration);
			this.rammed[u] = 1;
		}
	}
	canSee(agent, player, distance) {
		if (distance === 0) return true;
		this.sim.vehicle.body.translation(this.pos);
		this.ray.origin.x = this.traffic.x[agent];
		this.ray.origin.y = this.tuning.sightHeight;
		this.ray.origin.z = this.traffic.z[agent];
		const dx = player.x - this.ray.origin.x;
		const dz = player.z - this.ray.origin.z;
		const dy = this.pos.y - this.ray.origin.y;
		const length = Math.hypot(dx, dy, dz);
		this.ray.dir.x = dx / length;
		this.ray.dir.y = dy / length;
		this.ray.dir.z = dz / length;
		return this.sim.world.castRay(this.ray, length, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS) === null;
	}
	/** True while the roster is short of the interceptors this level pays for. */
	interceptorsWanted(level) {
		const want = this.tuning.interceptors[level] ?? 0;
		let live = 0;
		for (let u = 0; u < this.units.length; u++) {
			const agent = this.units[u];
			if (agent >= 0 && this.traffic.kindOf(agent) === "sports") live++;
		}
		return live < want;
	}
	spawn(player, cosHalf, interceptor) {
		const t = this.tuning;
		const lanes = this.traffic.lanes;
		const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
		const behindX = player.x - fx * t.spawnBehind, behindZ = player.z - fz * t.spawnBehind;
		let best = Infinity, bestLane = -1, bestS = 0;
		for (let lane = 0; lane < lanes.laneCount; lane++) {
			const len = lanes.length[lane];
			if (Math.hypot(lanes.midX[lane] - player.x, lanes.midZ[lane] - player.z) > t.spawnMax + len / 2) continue;
			for (let s = t.spawnEndInset; s <= len - t.spawnEndInset; s += t.spawnSample) {
				lanes.positionAt(lane, s, 0, this.pose);
				const dx = this.pose.x - player.x, dz = this.pose.z - player.z;
				const distance = Math.hypot(dx, dz);
				if (distance < t.spawnMin || distance > t.spawnMax) continue;
				if (!this.traffic.outOfView(this.pose.x, this.pose.z, this.radius, player, t.viewNear, cosHalf)) continue;
				const toward = -(dx * Math.sin(this.pose.yaw) + dz * Math.cos(this.pose.yaw)) / distance;
				const score = Math.hypot(this.pose.x - behindX, this.pose.z - behindZ) + (1 - toward) * t.spawnHeadingWeight;
				if (score >= best || !this.traffic.canSpawnAt(lane, s, t.spawnClearance)) continue;
				best = score;
				bestLane = lane;
				bestS = s;
			}
		}
		return bestLane < 0 ? -1 : this.traffic.spawnPoliceAt(bestLane, bestS, interceptor ? "sports" : "police", player, t.viewNear, cosHalf, t.spawnClearance);
	}
	/** Reverse Dijkstra on the authored road graph, using constructor-owned arrays. */
	route(player) {
		const lanes = this.traffic.lanes;
		const x = player.x + player.vx * this.tuning.projectSeconds;
		const z = player.z + player.vz * this.tuning.projectSeconds;
		let best = Infinity;
		this.targetLane = -1;
		for (let i = 0; i < lanes.laneCount; i++) {
			if (Math.hypot(lanes.midX[i] - x, lanes.midZ[i] - z) > lanes.length[i] / 2 + 40) continue;
			lanes.project(i, x, z, this.projection);
			const heading = Math.cos(this.projection.yaw - player.yaw);
			const cost = this.projection.dist + (1 - heading) * this.tuning.targetHeadingWeight;
			if (cost < best) {
				best = cost;
				this.targetLane = i;
				this.targetS = this.projection.s;
			}
		}
		this.distance.fill(Infinity);
		this.visited.fill(0);
		if (this.targetLane < 0) return;
		const target = this.graph.lanes[this.targetLane];
		this.distance[target.from] = this.targetS;
		for (let pass = 0; pass < this.distance.length; pass++) {
			let node = -1, cost = Infinity;
			for (let n = 0; n < this.distance.length; n++) if (this.visited[n] === 0 && this.distance[n] < cost) {
				node = n;
				cost = this.distance[n];
			}
			if (node < 0) break;
			this.visited[node] = 1;
			for (let lane = this.incoming[node]; lane >= 0; lane = this.previousIncoming[lane]) {
				const from = this.graph.lanes[lane].from;
				const candidate = cost + this.laneCost[lane];
				if (candidate < this.distance[from]) this.distance[from] = candidate;
			}
		}
	}
	routeExit(agent) {
		const lane = this.traffic.lane[agent];
		if (lane < 0 || this.targetLane < 0) return -1;
		const outs = this.traffic.lanes.outs(lane);
		let best = Infinity, next = -1;
		for (let i = 0; i < outs.length; i++) {
			const out = outs[i];
			const cost = out === this.targetLane ? this.targetS : this.laneCost[out] + this.distance[this.graph.lanes[out].to];
			if (cost < best) {
				best = cost;
				next = out;
			}
		}
		return next;
	}
	awayExit(agent, player) {
		const lane = this.traffic.lane[agent];
		if (lane < 0) return -1;
		const outs = this.traffic.lanes.outs(lane);
		let farthest = -1, next = -1;
		for (let i = 0; i < outs.length; i++) {
			const out = outs[i];
			const end = this.graph.lanes[out];
			const distance = (end.x1 - player.x) ** 2 + (end.z1 - player.z) ** 2;
			if (distance > farthest) {
				farthest = distance;
				next = out;
			}
		}
		return next;
	}
};
//#endregion
//#region src/sim/police/Pursuit.ts
/** Detection is separate from heat: escape clears the chase, never the stars. */
var Pursuit = class {
	events;
	tuning;
	state = "idle";
	visible = false;
	cooldown = 0;
	escapes = 0;
	lastX = 0;
	lastZ = 0;
	constructor(events, tuning = POLICE) {
		this.events = events;
		this.tuning = tuning;
	}
	step(dt, level, seen, x, z) {
		this.visible = level > 0 && seen;
		if (level === 0) {
			this.reset();
			return;
		}
		if (this.visible) {
			this.lastX = x;
			this.lastZ = z;
			this.cooldown = this.tuning.escapeSeconds[level] ?? 15;
			this.state = this.state === "idle" ? "detected" : "active";
			return;
		}
		if (this.state === "idle") return;
		if (this.state !== "lost") {
			this.state = "lost";
			this.cooldown = this.tuning.escapeSeconds[level] ?? 15;
		}
		this.cooldown = Math.max(0, this.cooldown - dt);
		if (this.cooldown <= 1e-9) {
			this.cooldown = 0;
			this.state = "idle";
			this.escapes++;
			this.events.push("escape", level, x, 0, z);
		}
	}
	reset() {
		this.state = "idle";
		this.visible = false;
		this.cooldown = 0;
	}
};
//#endregion
//#region src/sim/track.ts
/**
* The test track: a closed circuit for measuring the car instead of feeling it.
*
* The centreline is a closed Catmull-Rom spline through hand-placed control
* points (fast sweeper, chicane, hairpin, back straight with a small jump,
* esses, final corner), sampled every 3 m into a polyline with headings and
* curvature. Gates along it make a lap valid; a lap timer tracks current, last
* and best. Geometry (road, kerbs, edge posts, gantry, ramp) is emitted as the
* same static descriptors and colliders as the rest of the playground.
*/
/** Control points relative to the track origin (x, z), clockwise-ish, closed. */
const CONTROL = [
	[0, 0],
	[0, 80],
	[0, 160],
	[28, 218],
	[95, 242],
	[160, 225],
	[196, 175],
	[174, 134],
	[194, 96],
	[170, 56],
	[205, -10],
	[190, -72],
	[140, -100],
	[60, -100],
	[40, -97],
	[12, -84],
	[0, -50]
];
const SAMPLE_SPACING = 3;
const GATE_COUNT = 8;
function catmull(p0, p1, p2, p3, t) {
	const t2 = t * t;
	const t3 = t2 * t;
	return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function buildTrackDef(origin, width = 12) {
	const n = CONTROL.length;
	const dense = [];
	for (let i = 0; i < n; i++) {
		const p0 = CONTROL[(i + n - 1) % n];
		const p1 = CONTROL[i];
		const p2 = CONTROL[(i + 1) % n];
		const p3 = CONTROL[(i + 2) % n];
		for (let k = 0; k < 40; k++) {
			const t = k / 40;
			dense.push([origin.x + catmull(p0[0], p1[0], p2[0], p3[0], t), origin.z + catmull(p0[1], p1[1], p2[1], p3[1], t)]);
		}
	}
	const samples = [];
	let acc = 0;
	let sTotal = 0;
	for (let i = 0; i < dense.length; i++) {
		const a = dense[i];
		const b = dense[(i + 1) % dense.length];
		const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (samples.length === 0 || acc >= SAMPLE_SPACING) {
			samples.push({
				x: a[0],
				z: a[1],
				yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
				curvature: 0,
				s: sTotal
			});
			acc = 0;
		}
		acc += seg;
		sTotal += seg;
	}
	const s0 = samples[0];
	while (samples.length > 2) {
		const l = samples[samples.length - 1];
		if (Math.hypot(l.x - s0.x, l.z - s0.z) < 2.5) samples.pop();
		else break;
	}
	const m = samples.length;
	for (let i = 0; i < m; i++) {
		const prev = samples[(i + m - 1) % m];
		const next = samples[(i + 1) % m];
		let dyaw = next.yaw - prev.yaw;
		while (dyaw > Math.PI) dyaw -= Math.PI * 2;
		while (dyaw < -Math.PI) dyaw += Math.PI * 2;
		const ds = Math.hypot(next.x - prev.x, next.z - prev.z);
		samples[i].curvature = ds > 0 ? dyaw / ds : 0;
	}
	const gates = [];
	for (let g = 0; g < GATE_COUNT; g++) {
		const smp = samples[Math.floor(g / GATE_COUNT * m)];
		gates.push({
			x: smp.x,
			z: smp.z,
			yaw: smp.yaw,
			halfWidth: width / 2 + 2,
			index: g
		});
	}
	const first = samples[0];
	return {
		origin,
		samples,
		gates,
		width,
		length: sTotal,
		start: {
			x: first.x,
			z: first.z,
			yaw: first.yaw
		}
	};
}
/** Emit the track's visuals and colliders. */
function buildTrackGeometry(def, world, statics) {
	const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
	const half = def.width / 2;
	const S = def.samples;
	const m = S.length;
	const box = (hx, hy, hz, pos, yaw, color, collide, tag, tilt = 0) => {
		const rot = tilt === 0 ? quatFromYaw(yaw) : mulYawTilt(yaw, tilt);
		statics.push({
			shape: {
				kind: "box",
				hx,
				hy,
				hz
			},
			position: pos,
			rotation: rot,
			color,
			tag
		});
		if (collide) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(pos.x, pos.y, pos.z).setRotation(rot).setFriction(1).setCollisionGroups(GROUPS_TERRAIN), ground);
	};
	for (let i = 0; i < m; i++) {
		const a = S[i];
		const b = S[(i + 1) % m];
		const cx = (a.x + b.x) / 2;
		const cz = (a.z + b.z) / 2;
		const len = Math.hypot(b.x - a.x, b.z - a.z);
		const yaw = Math.atan2(b.x - a.x, b.z - a.z);
		box(half, .014, len / 2 + .6, {
			x: cx,
			y: 0,
			z: cz
		}, yaw, PALETTE.asphaltLight, false, "road");
		if (Math.abs(a.curvature) > 1 / 90) for (const side of [-1, 1]) {
			const rx = Math.cos(yaw) * side;
			const rz = -Math.sin(yaw) * side;
			const kx = cx + rx * (half + .4);
			const kz = cz + rz * (half + .4);
			box(.45, .05, len / 2 + .2, {
				x: kx,
				y: .05,
				z: kz
			}, yaw, i % 2 === 0 ? PALETTE.ramp : PALETTE.barrier, true, "kerb");
		}
		if (i % 10 === 0) for (const side of [-1, 1]) {
			const rx = Math.cos(yaw) * side;
			const rz = -Math.sin(yaw) * side;
			box(.1, .9, .1, {
				x: cx + rx * (half + 2.2),
				y: .9,
				z: cz + rz * (half + 2.2)
			}, yaw, PALETTE.barrier, false, "post");
			box(.12, .12, .12, {
				x: cx + rx * (half + 2.2),
				y: 1.75,
				z: cz + rz * (half + 2.2)
			}, yaw, PALETTE.cone, false, "post");
		}
		if (i % 3 === 0) box(.07, .02, .9, {
			x: cx,
			y: .005,
			z: cz
		}, yaw, PALETTE.laneMark, false, "mark");
	}
	const st = def.start;
	const rx = Math.cos(st.yaw);
	const rz = -Math.sin(st.yaw);
	box(half, .02, .3, {
		x: st.x,
		y: .006,
		z: st.z
	}, st.yaw, PALETTE.laneMark, false, "mark");
	for (const side of [-1, 1]) box(.18, 3, .18, {
		x: st.x + rx * side * (half + 1.2),
		y: 3,
		z: st.z + rz * side * (half + 1.2)
	}, st.yaw, PALETTE.concrete, false, "post");
	box(half + 1.4, .35, .25, {
		x: st.x,
		y: 6.2,
		z: st.z
	}, st.yaw, PALETTE.carBlue, false, "board");
	let jumpIdx = 0;
	let jumpD = Infinity;
	for (let i = 0; i < m; i++) {
		const smp = S[i];
		const d = (smp.x - (def.origin.x + 100)) ** 2 + (smp.z - (def.origin.z - 100)) ** 2;
		if (d < jumpD) {
			jumpD = d;
			jumpIdx = i;
		}
	}
	const jumpAt = S[jumpIdx];
	const rad = 7 * Math.PI / 180;
	const rl = 8;
	const fx = Math.sin(jumpAt.yaw);
	const fz = Math.cos(jumpAt.yaw);
	const cz2 = Math.cos(rad) * rl / 2;
	const cy = Math.sin(rad) * rl / 2 - .5 * Math.cos(rad) + .02;
	box(half * .7, .5, rl / 2, {
		x: jumpAt.x + fx * cz2,
		y: cy,
		z: jumpAt.z + fz * cz2
	}, jumpAt.yaw, PALETTE.ramp, true, "ramp", -rad);
	for (const g of def.gates) {
		if (g.index === 0) continue;
		const gx = Math.cos(g.yaw);
		const gz = -Math.sin(g.yaw);
		for (const side of [-1, 1]) box(.1, .5, .1, {
			x: g.x + gx * side * (half + .8),
			y: .5,
			z: g.z + gz * side * (half + .8)
		}, g.yaw, PALETTE.carLime, false, "post");
	}
}
/** yaw about Y then pitch about the local X axis (for the ramp). */
function mulYawTilt(yaw, tilt) {
	const a = quatFromYaw(yaw);
	const b = quatFromAxisAngle(1, 0, 0, tilt);
	return {
		x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
	};
}
/** Tracks gate crossings and lap times from the car position each step. */
var LapTimer = class {
	state = {
		current: -1,
		last: -1,
		best: -1,
		lapCount: 0,
		gatesPassed: 0,
		gateCount: 0,
		lapStartTick: -1,
		completedLapStartTick: -1,
		justCompleted: false,
		justBest: false
	};
	gates;
	along;
	running = false;
	constructor(def) {
		this.gates = def.gates;
		this.along = def.gates.map(() => 0);
		this.state.gateCount = def.gates.length;
	}
	update(x, z, tick, time, dt) {
		const st = this.state;
		st.justCompleted = false;
		st.justBest = false;
		if (this.running) st.current = time - st.lapStartTick * dt;
		for (const g of this.gates) {
			const fx = Math.sin(g.yaw);
			const fz = Math.cos(g.yaw);
			const dx = x - g.x;
			const dz = z - g.z;
			const alongNow = dx * fx + dz * fz;
			const lateral = Math.abs(dx * Math.cos(g.yaw) - dz * Math.sin(g.yaw));
			const prev = this.along[g.index];
			this.along[g.index] = alongNow;
			if (!(prev < 0 && alongNow >= 0 && lateral <= g.halfWidth && Math.abs(alongNow - prev) < 8)) continue;
			if (g.index === 0) {
				if (this.running && st.gatesPassed === st.gateCount - 1) {
					const lapTime = time - st.lapStartTick * dt;
					st.completedLapStartTick = st.lapStartTick;
					st.last = lapTime;
					st.lapCount++;
					st.justCompleted = true;
					if (st.best < 0 || lapTime < st.best) {
						st.best = lapTime;
						st.justBest = true;
					}
				}
				this.running = true;
				st.lapStartTick = tick;
				st.gatesPassed = 0;
				st.current = 0;
			} else if (this.running && g.index === st.gatesPassed + 1) st.gatesPassed = g.index;
		}
	}
	reset() {
		this.running = false;
		this.state.current = -1;
		this.state.gatesPassed = 0;
		this.state.lapStartTick = -1;
		for (let i = 0; i < this.along.length; i++) this.along[i] = 0;
	}
};
//#endregion
//#region src/sim/playground.ts
/**
* The M1 test playground: a flat lot with a long straight, a slalom, a skidpad,
* ramps and kerbs. Builds Rapier colliders and the matching render descriptors.
* Everything here is deterministic and allocation-free after construction.
*/
/** Straight-road constants shared with the renderer's decorations. */
const STRAIGHT = {
	x: 0,
	zStart: -60,
	zEnd: 1e3,
	width: 14
};
function buildPlayground(world) {
	const statics = [];
	const spawns = [];
	const props = [];
	const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
	const addBox = (hx, hy, hz, position, rotation, color, opts = {}) => {
		statics.push({
			shape: {
				kind: "box",
				hx,
				hy,
				hz
			},
			position,
			rotation,
			color,
			tag: opts.tag ?? "prop"
		});
		if (opts.collide !== false) {
			const terrain = opts.tag !== "wall";
			const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(position.x, position.y, position.z).setRotation(rotation).setFriction(opts.friction ?? 1).setRestitution(terrain ? 0 : 1).setCollisionGroups(terrain ? GROUPS_TERRAIN : GROUPS_SOLID);
			world.createCollider(desc, ground);
		}
	};
	const groundSize = 1400;
	addBox(groundSize / 2, .5, groundSize / 2, {
		x: 0,
		y: -.5,
		z: 400
	}, IDENTITY_QUAT, PALETTE.grass, { tag: "ground" });
	addBox(200, .01, 200, {
		x: 0,
		y: 0,
		z: 80
	}, IDENTITY_QUAT, PALETTE.asphalt, {
		collide: false,
		tag: "road"
	});
	const zMid = (STRAIGHT.zStart + STRAIGHT.zEnd) / 2;
	const halfLen = (STRAIGHT.zEnd - STRAIGHT.zStart) / 2;
	addBox(STRAIGHT.width / 2, .015, halfLen, {
		x: STRAIGHT.x,
		y: 0,
		z: zMid
	}, IDENTITY_QUAT, PALETTE.asphaltLight, {
		collide: false,
		tag: "road"
	});
	for (let z = STRAIGHT.zStart; z < STRAIGHT.zEnd; z += 12) addBox(.08, .02, 2.5, {
		x: STRAIGHT.x,
		y: .005,
		z: z + 2.5
	}, IDENTITY_QUAT, PALETTE.laneMark, {
		collide: false,
		tag: "mark"
	});
	addBox(.1, .02, halfLen, {
		x: STRAIGHT.x - STRAIGHT.width / 2 + .3,
		y: .005,
		z: zMid
	}, IDENTITY_QUAT, PALETTE.laneMark, {
		collide: false,
		tag: "mark"
	});
	addBox(.1, .02, halfLen, {
		x: STRAIGHT.x + STRAIGHT.width / 2 - .3,
		y: .005,
		z: zMid
	}, IDENTITY_QUAT, PALETTE.laneMark, {
		collide: false,
		tag: "mark"
	});
	for (let z = STRAIGHT.zStart + 20; z < STRAIGHT.zEnd; z += 20) for (const side of [-1, 1]) {
		const x = STRAIGHT.x + side * (STRAIGHT.width / 2 + 2);
		addBox(.12, 1.2, .12, {
			x,
			y: 1.2,
			z
		}, IDENTITY_QUAT, PALETTE.barrier, {
			collide: false,
			tag: "post"
		});
		addBox(.14, .15, .14, {
			x,
			y: 2.3,
			z
		}, IDENTITY_QUAT, PALETTE.cone, {
			collide: false,
			tag: "post"
		});
	}
	for (let z = 100; z <= STRAIGHT.zEnd; z += 100) {
		addBox(1.6, .6, .08, {
			x: STRAIGHT.x + STRAIGHT.width / 2 + 6,
			y: 2.2,
			z
		}, IDENTITY_QUAT, PALETTE.carBlue, {
			collide: false,
			tag: "board"
		});
		addBox(.1, 1.1, .1, {
			x: STRAIGHT.x + STRAIGHT.width / 2 + 6,
			y: .8,
			z
		}, IDENTITY_QUAT, PALETTE.concrete, {
			collide: false,
			tag: "board"
		});
	}
	addBox(STRAIGHT.width, 1, .5, {
		x: STRAIGHT.x,
		y: 1,
		z: STRAIGHT.zEnd + 5
	}, IDENTITY_QUAT, PALETTE.barrier, { tag: "wall" });
	const kerbX = 60;
	addBox(4, .015, 120, {
		x: kerbX,
		y: 0,
		z: 100
	}, IDENTITY_QUAT, PALETTE.asphaltLight, {
		collide: false,
		tag: "road"
	});
	for (const side of [-1, 1]) for (let z = -20; z < 220; z += 6) addBox(.5, .06, 2.9, {
		x: kerbX + side * 3.6,
		y: .06,
		z
	}, IDENTITY_QUAT, z / 6 % 2 === 0 ? PALETTE.ramp : PALETTE.kerb, { tag: "kerb" });
	for (let z = 150; z < 180; z += 5) addBox(4, .05, .4, {
		x: kerbX,
		y: .05,
		z
	}, IDENTITY_QUAT, PALETTE.laneMark, { tag: "kerb" });
	const slalomX = -60;
	addBox(6, .015, 130, {
		x: slalomX,
		y: 0,
		z: 90
	}, IDENTITY_QUAT, PALETTE.asphaltLight, {
		collide: false,
		tag: "road"
	});
	for (let i = 0; i < 12; i++) props.push({
		position: {
			x: slalomX,
			y: .45,
			z: 10 + i * 14
		},
		rotation: IDENTITY_QUAT,
		shape: {
			kind: "cylinder",
			radius: .28,
			halfHeight: .45
		},
		color: PALETTE.cone,
		mass: 4
	});
	for (let i = 0; i < 12; i++) addBox(2.5, .02, .15, {
		x: slalomX + (i % 2 === 0 ? 1 : -1) * 3.2,
		y: .005,
		z: 10 + i * 14
	}, IDENTITY_QUAT, PALETTE.laneMark, {
		collide: false,
		tag: "mark"
	});
	const skid = {
		x: 150,
		z: 60,
		r: 26
	};
	const segs = 48;
	for (let i = 0; i < segs; i++) {
		i / segs * Math.PI * 2;
		const a1 = (i + .5) / segs * Math.PI * 2;
		const len = Math.PI * 2 * skid.r / segs;
		for (const [r, color] of [[skid.r, PALETTE.laneMark], [skid.r - 8, PALETTE.laneMark]]) {
			const x = skid.x + Math.cos(a1) * r;
			const z = skid.z + Math.sin(a1) * r;
			addBox(len * .5 * (r / skid.r), .02, .15, {
				x,
				y: .005,
				z
			}, quatFromYaw(-a1), color, {
				collide: false,
				tag: "mark"
			});
		}
	}
	addBox(skid.r + 12, .012, skid.r + 12, {
		x: skid.x,
		y: 0,
		z: skid.z
	}, IDENTITY_QUAT, PALETTE.asphaltLight, {
		collide: false,
		tag: "road"
	});
	addBox(1.5, .02, .15, {
		x: skid.x,
		y: .005,
		z: skid.z
	}, IDENTITY_QUAT, PALETTE.laneMark, {
		collide: false,
		tag: "mark"
	});
	addBox(.15, .02, 1.5, {
		x: skid.x,
		y: .005,
		z: skid.z
	}, IDENTITY_QUAT, PALETTE.laneMark, {
		collide: false,
		tag: "mark"
	});
	const rampX = -150;
	addBox(10, .015, 220, {
		x: rampX,
		y: 0,
		z: 180
	}, IDENTITY_QUAT, PALETTE.asphaltLight, {
		collide: false,
		tag: "road"
	});
	for (const r of [
		{
			z: 40,
			deg: 8,
			len: 10
		},
		{
			z: 110,
			deg: 16,
			len: 10
		},
		{
			z: 210,
			deg: 26,
			len: 12
		}
	]) {
		const rad = r.deg * Math.PI / 180;
		const thickness = .5;
		const cz = r.z + Math.cos(rad) * r.len / 2;
		const cy = Math.sin(rad) * r.len / 2 - thickness * Math.cos(rad) + .02;
		addBox(4, thickness, r.len / 2, {
			x: rampX,
			y: cy,
			z: cz
		}, quatFromAxisAngle(1, 0, 0, -rad), PALETTE.ramp, {
			friction: 1,
			tag: "ramp"
		});
		addBox(4, .02, .5, {
			x: rampX,
			y: .005,
			z: r.z + r.len + 20 + r.deg * 1.5
		}, IDENTITY_QUAT, PALETTE.laneMark, {
			collide: false,
			tag: "mark"
		});
	}
	const big = {
		z: 320,
		deg: 22,
		len: 16
	};
	{
		const rad = big.deg * Math.PI / 180;
		const cz = big.z + Math.cos(rad) * big.len / 2;
		const cy = Math.sin(rad) * big.len / 2 - .5 * Math.cos(rad) + .02;
		addBox(5, .5, big.len / 2, {
			x: rampX,
			y: cy,
			z: cz
		}, quatFromAxisAngle(1, 0, 0, -rad), PALETTE.carMagenta, { tag: "ramp" });
		addBox(5, .02, 12, {
			x: rampX,
			y: .006,
			z: big.z + 70
		}, IDENTITY_QUAT, PALETTE.carLime, {
			collide: false,
			tag: "mark"
		});
	}
	const wallX = 250;
	addBox(8, .015, 160, {
		x: wallX,
		y: 0,
		z: 110
	}, IDENTITY_QUAT, PALETTE.asphaltLight, {
		collide: false,
		tag: "road"
	});
	for (const side of [-1, 1]) addBox(.3, .6, 150, {
		x: wallX + side * 7.3,
		y: .6,
		z: 100
	}, IDENTITY_QUAT, PALETTE.concrete, { tag: "wall" });
	{
		const len = Math.hypot(7.5, 60);
		const yaw = Math.atan2(7.5, 60);
		addBox(.3, .6, len / 2, {
			x: 493.5 / 2,
			y: .6,
			z: 220
		}, quatFromYaw(yaw), PALETTE.concrete, { tag: "wall" });
	}
	for (const z of [140, 160]) addBox(.5, 1.5, .5, {
		x: 247.5,
		y: 1.5,
		z
	}, IDENTITY_QUAT, PALETTE.concrete, { tag: "wall" });
	addBox(7.6, 1, .5, {
		x: wallX,
		y: 1,
		z: 270
	}, IDENTITY_QUAT, PALETTE.barrier, { tag: "wall" });
	for (let i = 0; i < 10; i++) props.push({
		position: {
			x: 20 + i % 5 * 4,
			y: .6,
			z: -30 - Math.floor(i / 5) * 4
		},
		rotation: IDENTITY_QUAT,
		shape: {
			kind: "box",
			hx: .6,
			hy: .6,
			hz: .6
		},
		color: i % 2 === 0 ? PALETTE.carOrange : PALETTE.sand,
		mass: 25
	});
	const track = buildTrackDef({
		x: -420,
		z: 40
	});
	buildTrackGeometry(track, world, statics);
	spawns.push({
		name: "lot",
		position: {
			x: 0,
			y: .6,
			z: -40
		},
		yaw: 0
	});
	spawns.push({
		name: "straight",
		position: {
			x: STRAIGHT.x,
			y: .6,
			z: STRAIGHT.zStart + 10
		},
		yaw: 0
	});
	spawns.push({
		name: "straight-far",
		position: {
			x: STRAIGHT.x,
			y: .6,
			z: 500
		},
		yaw: 0
	});
	spawns.push({
		name: "kerbs",
		position: {
			x: kerbX,
			y: .6,
			z: -40
		},
		yaw: 0
	});
	spawns.push({
		name: "slalom",
		position: {
			x: slalomX,
			y: .6,
			z: -10
		},
		yaw: 0
	});
	spawns.push({
		name: "skidpad",
		position: {
			x: skid.x,
			y: .6,
			z: skid.z - skid.r - 20
		},
		yaw: 0
	});
	spawns.push({
		name: "ramps",
		position: {
			x: rampX,
			y: .6,
			z: 0
		},
		yaw: 0
	});
	spawns.push({
		name: "walls",
		position: {
			x: wallX,
			y: .6,
			z: -30
		},
		yaw: 0
	});
	spawns.push({
		name: "bigjump",
		position: {
			x: rampX,
			y: .6,
			z: 250
		},
		yaw: 0
	});
	spawns.push({
		name: "track",
		position: {
			x: track.start.x - Math.sin(track.start.yaw) * 12,
			y: .6,
			z: track.start.z - Math.cos(track.start.yaw) * 12
		},
		yaw: track.start.yaw
	});
	return {
		statics,
		spawns,
		props,
		groundSize,
		track
	};
}
var Recorder = class Recorder {
	ticks = 0;
	controls = /* @__PURE__ */ new Float32Array(24576);
	poses = /* @__PURE__ */ new Float32Array(28672);
	telemetry = /* @__PURE__ */ new Float32Array(40960);
	/** Ticks at which laps started (for slicing a lap out of the stream). */
	lapStarts = [];
	grow() {
		const cap = this.controls.length / 6;
		if (this.ticks < cap) return;
		const next = cap * 2;
		const c = new Float32Array(6 * next);
		c.set(this.controls);
		this.controls = c;
		const p = new Float32Array(7 * next);
		p.set(this.poses);
		this.poses = p;
		const t = new Float32Array(10 * next);
		t.set(this.telemetry);
		this.telemetry = t;
	}
	/** Call once per step, after the sim stepped, with the controls that were applied. */
	record(c, reset, pose, poseOffset, rot, rotOffset, tm) {
		this.grow();
		const i = this.ticks;
		const co = i * 6;
		this.controls[co] = c.throttle;
		this.controls[co + 1] = c.brake;
		this.controls[co + 2] = c.steer;
		this.controls[co + 3] = c.handbrake;
		this.controls[co + 4] = c.boost;
		this.controls[co + 5] = reset ? 1 : 0;
		const po = i * 7;
		this.poses[po] = pose[poseOffset];
		this.poses[po + 1] = pose[poseOffset + 1];
		this.poses[po + 2] = pose[poseOffset + 2];
		this.poses[po + 3] = rot[rotOffset];
		this.poses[po + 4] = rot[rotOffset + 1];
		this.poses[po + 5] = rot[rotOffset + 2];
		this.poses[po + 6] = rot[rotOffset + 3];
		const to = i * 10;
		this.telemetry[to] = tm.speedKmh;
		this.telemetry[to + 1] = tm.driftAngleDeg;
		this.telemetry[to + 2] = tm.maxSlipDeg;
		this.telemetry[to + 3] = tm.gLong;
		this.telemetry[to + 4] = tm.gLat;
		this.telemetry[to + 5] = tm.steerDeg;
		this.telemetry[to + 6] = tm.throttle;
		this.telemetry[to + 7] = tm.brake;
		this.telemetry[to + 8] = tm.gear;
		this.telemetry[to + 9] = tm.rpm;
		this.ticks++;
	}
	/** Controls of a tick, written into `out`. */
	controlsAt(tick, out) {
		const co = tick * 6;
		out.throttle = this.controls[co];
		out.brake = this.controls[co + 1];
		out.steer = this.controls[co + 2];
		out.handbrake = this.controls[co + 3];
		out.boost = this.controls[co + 4];
		out.reset = this.controls[co + 5] > .5;
		out.swap = false;
	}
	/** A copy of the pose stream between two ticks (for a ghost lap). */
	slicePoses(from, to) {
		return this.poses.slice(from * 7, Math.min(to, this.ticks) * 7);
	}
	toJSON(car, spawn) {
		const round = (arr, n, digits) => Array.from(arr.subarray(0, n), (v) => Number(v.toFixed(digits)));
		return {
			version: 1,
			car,
			spawn,
			ticks: this.ticks,
			controls: round(this.controls, this.ticks * 6, 3),
			poses: round(this.poses, this.ticks * 7, 4),
			telemetry: round(this.telemetry, this.ticks * 10, 2),
			lapStarts: [...this.lapStarts]
		};
	}
	static fromJSON(j) {
		const r = new Recorder();
		r.ticks = j.ticks;
		r.controls = Float32Array.from(j.controls);
		r.poses = Float32Array.from(j.poses);
		r.telemetry = Float32Array.from(j.telemetry);
		r.lapStarts.push(...j.lapStarts);
		return r;
	}
};
//#endregion
//#region src/sim/transforms.ts
/**
* Double-buffered rigid transforms for render interpolation.
*
* The sim writes `curr` every fixed step after copying it to `prev`; the renderer
* blends between them with the accumulator alpha. Plain typed arrays, no objects
* per body, so a snapshot costs one `set()` per step.
*/
var TransformBuffer = class {
	capacity;
	count = 0;
	prevPos;
	currPos;
	prevRot;
	currRot;
	constructor(capacity) {
		this.capacity = capacity;
		this.prevPos = new Float32Array(capacity * 3);
		this.currPos = new Float32Array(capacity * 3);
		this.prevRot = new Float32Array(capacity * 4);
		this.currRot = new Float32Array(capacity * 4);
		for (let i = 0; i < capacity; i++) {
			this.prevRot[i * 4 + 3] = 1;
			this.currRot[i * 4 + 3] = 1;
		}
	}
	/** Reserve a slot; returns its index. */
	allocate() {
		if (this.count >= this.capacity) throw new Error("TransformBuffer full");
		return this.count++;
	}
	/** Copy current into previous. Call once at the start of each fixed step. */
	swap() {
		this.prevPos.set(this.currPos);
		this.prevRot.set(this.currRot);
	}
	write(slot, x, y, z, qx, qy, qz, qw) {
		const p = slot * 3;
		const r = slot * 4;
		this.currPos[p] = x;
		this.currPos[p + 1] = y;
		this.currPos[p + 2] = z;
		this.currRot[r] = qx;
		this.currRot[r + 1] = qy;
		this.currRot[r + 2] = qz;
		this.currRot[r + 3] = qw;
	}
	/** Write both buffers (teleport without an interpolation streak). */
	writeBoth(slot, x, y, z, qx, qy, qz, qw) {
		this.write(slot, x, y, z, qx, qy, qz, qw);
		const p = slot * 3;
		const r = slot * 4;
		this.prevPos[p] = x;
		this.prevPos[p + 1] = y;
		this.prevPos[p + 2] = z;
		this.prevRot[r] = qx;
		this.prevRot[r + 1] = qy;
		this.prevRot[r + 2] = qz;
		this.prevRot[r + 3] = qw;
	}
};
//#endregion
//#region src/sim/vehicle/Vehicle.ts
/**
* Arcade car on a Rapier rigid body, built from physical parts with explicit,
* tunable assists on top.
*
*  - Chassis: one dynamic body with a cuboid collider and explicit mass properties.
*  - Suspension: four raycasts, spring + split damping + bump stop + anti-roll.
*  - Engine: torque curve over rpm, five automatic gears, reverse, rev limiter,
*    engine braking. Engine rpm follows the driven wheels.
*  - Wheels: each wheel has its own angular velocity. Longitudinal tyre force
*    comes from the slip ratio and drives the wheel ODE, integrated implicitly so
*    it is stable at 60 Hz even at standstill (burnouts and lock-ups emerge).
*  - Tyres: lateral force from the slip angle with a peak-and-tail curve, a
*    friction circle with the longitudinal force, and an impulse clamp so slow
*    manoeuvres never chatter.
*  - Assists: traction control, ABS, and a drift controller (yaw-rate command +
*    velocity follow) that can each be scaled down to 0 to feel the raw model.
*
* Frame: +Z forward, +Y up, +X is the car's LEFT (right-handed). A positive
* rotation about +Y turns the nose to the left, so "steer right" rotates by -steer.
*/
const WHEEL_FR = 0;
const WHEEL_FL = 1;
const WHEEL_RR = 2;
const WHEEL_RL = 3;
const WHEEL_SUBSTEPS = 2;
const RPM_PER_RAD_S = 60 / (2 * Math.PI);
const AXIS_Y = {
	x: 0,
	y: 1,
	z: 0
};
const AXIS_Z = {
	x: 0,
	y: 0,
	z: 1
};
const AXIS_RIGHT = {
	x: -1,
	y: 0,
	z: 0
};
const scratch = {
	pos: v3(),
	vel: v3(),
	angvel: v3(),
	fwd: v3(),
	right: v3(),
	up: v3(),
	a: v3(),
	b: v3(),
	force: v3(),
	point: v3(),
	wheelFwd: v3(),
	wheelRight: v3(),
	rayDir: v3(),
	rearLocal: v3(),
	com: v3(),
	rel: v3(),
	fSum: v3(),
	tSum: v3(),
	q: {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	},
	q2: {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	},
	q3: {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	},
	n: v3(),
	cp: v3()
};
/** Velocity of a world point on the body: v + ω × (p − com). Pure JS, no WASM call. */
function velAt(p, out) {
	const s = scratch;
	sub(s.rel, p, s.com);
	cross(out, s.angvel, s.rel);
	return add(out, out, s.vel);
}
/** Accumulate a force at a world point (force + torque about the centre of mass). */
function forceAt(f, p) {
	const s = scratch;
	add(s.fSum, s.fSum, f);
	sub(s.rel, p, s.com);
	cross(s.rel, s.rel, f);
	add(s.tSum, s.tSum, s.rel);
}
var Vehicle = class {
	body;
	collider;
	wheels = [];
	slot;
	tuning;
	/** Ramped steering input in [-1, 1] before the sensitivity curve. */
	steerRaw = 0;
	/** Steering angle at the front axle (bicycle model), radians (+ = right). */
	steer = 0;
	drifting = false;
	/** Throttle and boost are ignored while a wreck cuts the engine. Brakes and steering still work. */
	engineCut = false;
	driftTime = 0;
	boostMeter;
	boosting = false;
	airTime = 0;
	flippedTime = 0;
	/** 1..n forward, -1 reverse. */
	gear = 1;
	rpm;
	shiftTimer = 0;
	/** Blended grip multipliers (drop instantly, recover at gripBlendRate). */
	rearGripMul = 1;
	frontGripMul = 1;
	/** Body slip angle of the previous step, radians (drift controller damping). */
	bodySlipPrev = 0;
	/** Drift side (+1 right) and the rate-limited commanded angle in degrees (+ = right). */
	driftDir = 1;
	driftTargetDeg = 0;
	driftDistance = 0;
	driftExitTimer = 0;
	wasAirborne = false;
	collidesWithTerrain = false;
	prevVel = v3();
	contactImpulse = 0;
	pairImpulse = 0;
	bestPairImpulse = 0;
	bestPairHandle = -1;
	contactCount = 0;
	wallTouch = false;
	pairFixed = false;
	contactSide = 0;
	wallTimer = 0;
	wallNormal = v3();
	contactNormal = v3();
	contactPoint = v3();
	onManifold = (m, flipped) => {
		let imp = 0;
		const n = m.numContacts();
		for (let i = 0; i < n; i++) imp += m.contactImpulse(i);
		if (imp <= 0) return;
		this.pairImpulse += imp;
		const nrm = scratch.n;
		m.normal(nrm);
		if (!flipped) scale(nrm, nrm, -1);
		addScaled(this.contactNormal, this.contactNormal, nrm, imp);
		this.contactImpulse += imp;
		if (this.contactCount === 0) {
			const p = m.solverContactPoint(0, scratch.cp);
			if (p) copy(this.contactPoint, p);
		}
		this.contactCount++;
		if (this.pairFixed && Math.abs(nrm.y) < .5) this.wallTouch = true;
	};
	onPair = (other) => {
		const parent = other.parent();
		this.pairFixed = parent === null || parent.isFixed();
		this.pairImpulse = 0;
		this.world.contactPair(this.collider, other, this.onManifold);
		if (this.pairImpulse > this.bestPairImpulse) {
			this.bestPairImpulse = this.pairImpulse;
			this.bestPairHandle = other.handle;
		}
	};
	telemetry;
	/** Where `reset` puts the car: updated by the world (nearest spawn point). */
	resetPose;
	ray;
	world;
	transforms;
	constructor(world, transforms, tuning, position, yaw) {
		this.world = world;
		this.transforms = transforms;
		this.tuning = tuning;
		this.boostMeter = tuning.boostInitial;
		this.rpm = tuning.idleRpm;
		this.resetPose = {
			position: { ...position },
			yaw
		};
		const rot = quatSetAxisAngle({
			x: 0,
			y: 0,
			z: 0,
			w: 1
		}, 0, 1, 0, yaw);
		const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(rot).setAngularDamping(tuning.angularDamping).setLinearDamping(0).setCcdEnabled(true).setCanSleep(false);
		this.body = world.createRigidBody(desc);
		this.collider = world.createCollider(this.colliderDesc(), this.body);
		this.slot = transforms.allocate();
		for (const [isFront, isLeft] of [
			[true, false],
			[true, true],
			[false, false],
			[false, true]
		]) this.wheels.push({
			local: v3(),
			isFront,
			isLeft,
			grounded: false,
			compression: 0,
			load: 0,
			contact: v3(),
			normal: v3(0, 1, 0),
			center: v3(),
			steer: 0,
			omega: 0,
			slipAngle: 0,
			slipRatio: 0,
			forwardSpeed: 0,
			lateralSpeed: 0,
			spin: 0,
			slot: transforms.allocate()
		});
		this.placeWheels();
		this.ray = new RAPIER.Ray({
			x: 0,
			y: 0,
			z: 0
		}, {
			x: 0,
			y: -1,
			z: 0
		});
		this.telemetry = {
			speed: 0,
			speedKmh: 0,
			drifting: false,
			driftAngleDeg: 0,
			boost: this.boostMeter,
			boosting: false,
			airborne: false,
			groundedWheels: 0,
			steer: 0,
			steerDeg: 0,
			gear: 1,
			rpm: this.rpm,
			load: 0,
			throttle: 0,
			airTime: 0,
			driftTime: 0,
			maxSlipDeg: 0,
			maxSlipRatio: 0,
			minSlipRatio: 0,
			shifting: false,
			landingImpact: 0,
			brake: 0,
			driftDistance: 0,
			vx: 0,
			vy: 0,
			vz: 0,
			yawRate: 0,
			gLong: 0,
			gLat: 0,
			gVert: 0,
			impact: 0,
			scrape: 0,
			contactSide: 0,
			contactX: 0,
			contactY: 0,
			contactZ: 0,
			contactNx: 0,
			contactNy: 0,
			contactNz: 0,
			hitHandle: -1,
			hitImpulse: 0
		};
		this.writeTransforms(true);
	}
	colliderDesc() {
		const t = this.tuning;
		const he = t.chassisHalfExtents;
		return RAPIER.ColliderDesc.cuboid(he.x, he.y, he.z).setTranslation(0, t.chassisOffsetY, 0).setFriction(t.wallFriction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(t.wallRestitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply).setCollisionGroups(GROUPS_CHASSIS_UPRIGHT).setMassProperties(t.mass, {
			x: 0,
			y: t.centerOfMassY,
			z: 0
		}, boxInertia(t), {
			x: 0,
			y: 0,
			z: 0,
			w: 1
		});
	}
	placeWheels() {
		const t = this.tuning;
		const hb = t.wheelBase * .5;
		const ht = t.trackWidth * .5;
		for (const w of this.wheels) set(w.local, w.isLeft ? ht : -ht, t.suspensionAttachY, w.isFront ? hb : -hb);
	}
	/** Re-applies structural tuning (mass, inertia, collider size, wheel positions) to the live body. */
	applyTuning() {
		this.world.removeCollider(this.collider, false);
		this.collider = this.world.createCollider(this.colliderDesc(), this.body);
		this.body.setAngularDamping(this.tuning.angularDamping);
		this.placeWheels();
	}
	/** Apply one fixed step of vehicle forces. Call before `world.step()`. */
	update(controls, dt) {
		const t = this.tuning;
		const body = this.body;
		const s = scratch;
		if (controls.reset) this.teleport(this.resetPose.position, this.resetPose.yaw);
		body.resetForces(true);
		body.resetTorques(true);
		body.translation(s.pos);
		body.rotation(s.q);
		body.linvel(s.vel);
		body.angvel(s.angvel);
		body.worldCom(s.com);
		set(s.fSum, 0, 0, 0);
		set(s.tSum, 0, 0, 0);
		rotate(s.fwd, s.q, AXIS_Z);
		rotate(s.right, s.q, AXIS_RIGHT);
		rotate(s.up, s.q, AXIS_Y);
		const forwardSpeed = dot(s.vel, s.fwd);
		const speed = length(s.vel);
		const absFwd = Math.abs(forwardSpeed);
		const throttle = this.engineCut ? 0 : clamp01(controls.throttle);
		const brakeIn = clamp01(controls.brake);
		const handbrake = controls.handbrake > .5;
		const authority = smoothstep(absFwd / t.steerSpeedRef);
		const maxSteer = lerp(t.maxSteerDegLow, t.maxSteerDegHigh, authority) * DEG;
		const target = clamp(controls.steer, -1, 1);
		const returning = Math.abs(target) < Math.abs(this.steerRaw) || Math.sign(target) !== Math.sign(this.steerRaw);
		this.steerRaw = moveToward(this.steerRaw, target, (returning ? t.steerReturnRate : t.steerRate) * dt);
		this.steer = Math.sign(this.steerRaw) * Math.pow(Math.abs(this.steerRaw), t.steerCurve) * maxSteer;
		this.boosting = !this.engineCut && controls.boost > .5 && this.boostMeter > 0;
		if (this.boosting) this.boostMeter = Math.max(0, this.boostMeter - t.boostDrain * dt);
		scale(s.rayDir, s.up, -1);
		const rayLen = t.suspensionRestLength + t.wheelRadius;
		let grounded = 0;
		for (const w of this.wheels) {
			rotate(s.a, s.q, w.local);
			add(s.point, s.pos, s.a);
			this.ray.origin.x = s.point.x;
			this.ray.origin.y = s.point.y;
			this.ray.origin.z = s.point.z;
			this.ray.dir.x = s.rayDir.x;
			this.ray.dir.y = s.rayDir.y;
			this.ray.dir.z = s.rayDir.z;
			const hit = this.world.castRayAndGetNormal(this.ray, rayLen, true, void 0, void 0, void 0, body);
			if (hit && hit.timeOfImpact > 0) {
				const d = hit.timeOfImpact;
				w.grounded = true;
				grounded++;
				w.compression = rayLen - d;
				addScaled(w.contact, s.point, s.rayDir, d);
				addScaled(w.center, s.point, s.rayDir, Math.max(0, d - t.wheelRadius));
				w.normal.x = hit.normal.x;
				w.normal.y = hit.normal.y;
				w.normal.z = hit.normal.z;
				if (dot(w.normal, s.up) < 0) scale(w.normal, w.normal, -1);
			} else {
				w.grounded = false;
				w.compression = 0;
				w.load = 0;
				addScaled(w.center, s.point, s.rayDir, t.suspensionRestLength);
				copy(w.contact, w.center);
				copy(w.normal, s.up);
			}
		}
		let landingImpact = 0;
		if (grounded > 0) {
			set(s.a, 0, 0, 0);
			for (const w of this.wheels) if (w.grounded) add(s.a, s.a, w.normal);
			normalize(s.a, s.a);
			const vn = dot(s.vel, s.a);
			if (vn < -2 && (this.wasAirborne || vn < -3.5)) {
				landingImpact = -vn;
				const total = length(s.vel) * (this.wasAirborne ? t.landingKeepMomentum : 1);
				const vnKept = vn * t.landingRetainVertical;
				addScaled(s.b, s.vel, s.a, -vn);
				const ht = length(s.b);
				const htNew = Math.max(ht, Math.sqrt(Math.max(0, total * total - vnKept * vnKept)));
				if (ht > .5) scale(s.b, s.b, htNew / ht);
				addScaled(s.b, s.b, s.a, vnKept);
				body.setLinvel(s.b, true);
				body.setAngvel({
					x: s.angvel.x * t.landingRetainSpin,
					y: s.angvel.y,
					z: s.angvel.z * t.landingRetainSpin
				}, true);
				body.linvel(s.vel);
				body.angvel(s.angvel);
			}
		}
		this.contactImpulse = 0;
		this.contactCount = 0;
		this.bestPairImpulse = 0;
		this.bestPairHandle = -1;
		this.wallTouch = false;
		this.contactSide = 0;
		set(this.contactNormal, 0, 0, 0);
		this.world.contactPairsWith(this.collider, this.onPair);
		const impact = this.contactImpulse / t.mass;
		let scrape = 0;
		const touching = this.wallTouch && this.contactImpulse > 0;
		if (touching) {
			normalize(this.wallNormal, this.contactNormal);
			this.wallTimer = t.wallMemory;
			if (impact > t.wallHitSpeed) {
				body.setAngvel({
					x: s.angvel.x * t.wallHitRetainSpin,
					y: s.angvel.y * t.wallHitRetainSpin,
					z: s.angvel.z * t.wallHitRetainSpin
				}, true);
				body.angvel(s.angvel);
			}
		} else if (this.wallTimer > 0) this.wallTimer -= dt;
		if (touching || this.wallTimer > 0) {
			copy(s.a, this.wallNormal);
			const into = -dot(s.fwd, s.a);
			const noseDeg = Math.asin(clamp(Math.abs(into), 0, 1)) / DEG;
			addScaled(s.b, s.vel, s.a, -dot(s.vel, s.a));
			const vt = length(s.b);
			let active = clamp01(vt / 5);
			let aligning = false;
			if (vt >= 2) {
				if (noseDeg < t.wallAlignMaxDeg) {
					scale(s.b, s.b, 1 / vt);
					aligning = true;
				}
			} else if (throttle > .3 && into > 0) {
				active = 1;
				const steer = clamp(controls.steer, -1, 1);
				addScaled(s.b, s.fwd, s.a, -dot(s.fwd, s.a));
				const tl = length(s.b);
				if (Math.abs(steer) >= .2) {
					cross(s.b, s.a, s.up);
					normalize(s.b, s.b);
					if (dot(s.b, s.right) * steer < 0) scale(s.b, s.b, -1);
					aligning = true;
				} else if (tl > .001 && noseDeg < 60) {
					scale(s.b, s.b, 1 / tl);
					aligning = true;
				}
			}
			if (aligning && grounded > 0) {
				cross(s.point, s.b, s.fwd);
				const err = Math.atan2(dot(s.point, s.up), dot(s.b, s.fwd));
				const yawInertia = boxInertia(t).y;
				const accel = clamp(-t.wallAlignGain * err - t.wallAlignDamping * s.angvel.y, -t.wallAlignGain, t.wallAlignGain);
				s.tSum.y += yawInertia * accel * active;
			}
			if (touching) {
				scrape = clamp01(vt / 12) * clamp01(impact / .04);
				this.contactSide = dot(s.a, s.right) > 0 ? 1 : -1;
			}
		}
		this.wasAirborne = grounded === 0;
		for (let i = 0; i < 4; i++) {
			const w = this.wheels[i];
			if (!w.grounded) continue;
			rotate(s.a, s.q, w.local);
			add(s.point, s.pos, s.a);
			velAt(s.point, s.b);
			const vAlongRay = dot(s.b, s.rayDir);
			let f = t.suspensionStiffness * w.compression;
			f += (vAlongRay > 0 ? t.suspensionDampingCompression : t.suspensionDampingRebound) * vAlongRay;
			if (vAlongRay > 0) f += t.suspensionDampingProgressive * vAlongRay * vAlongRay;
			const over = w.compression - t.suspensionRestLength;
			if (over > 0) f += t.bumpStopStiffness * over;
			const other = this.wheels[i ^ 1];
			if (other.grounded) f += t.antiRollStiffness * (w.compression - other.compression);
			const stopForce = t.suspensionStiffness * w.compression + t.mass * .25 * Math.max(0, vAlongRay) / dt;
			if (f > stopForce) f = stopForce;
			if (f < 0) f = 0;
			w.load = f;
			scale(s.force, s.up, f);
			forceAt(s.force, s.point);
		}
		const rl = this.wheels[WHEEL_RL];
		const rr = this.wheels[WHEEL_RR];
		const rearGrounded = rl.grounded || rr.grounded;
		set(s.rearLocal, 0, 0, -t.wheelBase * .5);
		rotate(s.a, s.q, s.rearLocal);
		add(s.point, s.pos, s.a);
		velAt(s.point, s.b);
		const rearFwd = dot(s.b, s.fwd);
		const rearLat = dot(s.b, s.right);
		const rearSlip = Math.atan2(Math.abs(rearLat), Math.max(.5, Math.abs(rearFwd)));
		const bodySlipDeg = Math.atan2(dot(s.vel, s.right), Math.max(.5, forwardSpeed)) * 180 / Math.PI;
		const turning = Math.abs(controls.steer) > .2;
		const brakeEntry = t.brakeDriftEntry > 0 && brakeIn > .5 && Math.abs(controls.steer) > .6 && absFwd > 14;
		if (rearGrounded && absFwd > t.driftMinSpeed) {
			if (!this.drifting && (handbrake && turning || brakeEntry || rearSlip > t.driftEnterDeg * DEG)) {
				this.drifting = true;
				this.driftTime = 0;
				this.driftDistance = 0;
				this.driftExitTimer = 0;
				this.driftDir = Math.abs(controls.steer) > .05 ? Math.sign(controls.steer) : bodySlipDeg < 0 ? 1 : -1;
				this.driftTargetDeg = -bodySlipDeg;
			} else if (this.drifting) {
				const wantsOut = !handbrake && Math.abs(this.driftTargetDeg) < 2 && rearSlip < t.driftExitDeg * DEG;
				this.driftExitTimer = wantsOut ? this.driftExitTimer + dt : 0;
				if (this.driftTime > t.driftMinTime && this.driftExitTimer > t.driftExitHold) this.drifting = false;
			}
		} else if (absFwd <= t.driftMinSpeed * .7 || grounded === 0) this.drifting = false;
		if (this.drifting) {
			this.driftTime += dt;
			this.driftDistance += speed * dt;
			const st = clamp(controls.steer, -1, 1);
			let cmd;
			if (st * this.driftDir > .05) cmd = st * t.driftMaxAngleDeg;
			else if (Math.abs(st) <= .05) cmd = handbrake ? this.driftDir * t.driftCentreHold * t.driftMaxAngleDeg : 0;
			else cmd = st * t.driftMaxAngleDeg;
			const growing = Math.abs(cmd) > Math.abs(this.driftTargetDeg) && cmd * this.driftTargetDeg >= 0;
			this.driftTargetDeg = moveToward(this.driftTargetDeg, cmd, (growing ? t.driftAngleRateIn : t.driftAngleRateOut) * dt);
			if (this.driftTargetDeg * this.driftDir < -1) this.driftDir = -this.driftDir;
		} else this.driftTargetDeg = 0;
		const bodySlip = bodySlipDeg * DEG;
		if (this.drifting && t.driftAutoCounterSteer > 0 && absFwd > t.driftMinSpeed) {
			const aligned = bodySlip + clamp(controls.steer, -1, 1) * .25 * t.maxSteerDegLow * DEG;
			this.applyAckermann(lerp(this.steer, clamp(aligned, -.9, .9), t.driftAutoCounterSteer));
		} else this.applyAckermann(this.steer);
		const powerOver = 1 - t.powerOversteer * throttle * Math.min(1, Math.abs(this.steerRaw)) * clamp01((absFwd - 20) / 12);
		const rearTarget = handbrake ? t.handbrakeGripMul : this.drifting ? t.driftGripMul : powerOver;
		const frontTarget = this.drifting ? t.driftFrontGripMul : 1;
		const blend = t.gripBlendRate * dt;
		this.rearGripMul = rearTarget < this.rearGripMul ? rearTarget : moveToward(this.rearGripMul, rearTarget, blend);
		this.frontGripMul = frontTarget < this.frontGripMul ? frontTarget : moveToward(this.frontGripMul, frontTarget, blend);
		if (this.gear !== -1 && brakeIn > .5 && throttle === 0 && absFwd < .5) this.gear = -1;
		if (this.gear === -1 && (throttle > 0 || forwardSpeed > .5)) {
			this.gear = 1;
			this.shiftTimer = 0;
		}
		const drivePedal = this.gear === -1 ? brakeIn : throttle;
		const brakePedal = this.gear === -1 ? 0 : brakeIn;
		const ratio = (this.gear === -1 ? -t.reverseRatio : t.gearRatios[this.gear - 1] ?? 1) * t.finalDrive;
		let drivenOmega = 0;
		let drivenCount = 0;
		for (const w of this.wheels) if ((w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare) > 0) {
			drivenOmega += w.omega;
			drivenCount++;
		}
		drivenOmega = drivenCount > 0 ? drivenOmega / drivenCount : 0;
		const wheelRpm = Math.abs(drivenOmega * ratio) * RPM_PER_RAD_S;
		const targetRpm = Math.max(t.idleRpm, Math.min(t.redlineRpm * 1.05, wheelRpm));
		this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-dt / Math.max(.01, t.engineInertia * .2)));
		if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
		if (this.gear > 0 && this.shiftTimer === 0 && grounded > 0) {
			if (wheelRpm > t.redlineRpm * t.shiftUpAt && this.gear < t.gearRatios.length) {
				this.gear++;
				this.shiftTimer = t.shiftTime;
			} else if (wheelRpm < t.redlineRpm * t.shiftDownAt && this.gear > 1) {
				this.gear--;
				this.shiftTimer = t.shiftTime;
			}
		}
		const shifting = this.shiftTimer > 0;
		let crankTorque = 0;
		if (drivePedal > 0 && !shifting && wheelRpm < t.redlineRpm) {
			crankTorque = drivePedal * t.torqueMax * torqueCurve(t, Math.max(t.idleRpm, wheelRpm)) * (this.boosting ? t.boostTorqueMul : 1);
			if (this.gear === -1 && absFwd > t.maxReverseSpeed) crankTorque = 0;
		} else if (drivePedal === 0) crankTorque = -t.engineBrakeTorque * (wheelRpm / t.redlineRpm);
		let tcCut = 1;
		if (t.tractionControl > 0 && crankTorque > 0) {
			let worst = 0;
			for (const w of this.wheels) if ((w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare) > 0 && w.grounded) worst = Math.max(worst, w.slipRatio);
			const excess = (worst - t.slipRatioPeak * 1.5) / (t.slipRatioPeak * 2);
			if (excess > 0) tcCut = Math.max(1 - t.tractionControl, 1 - excess * t.tractionControl);
		}
		const axleTorque = crankTorque * ratio * t.drivetrainEfficiency * tcCut;
		const lsdCap = t.lsdPreload + t.lsdLock * .5 * Math.abs(axleTorque);
		const lsdTorque = (left, right) => clamp((left.omega - right.omega) * t.lsdStiffness, -lsdCap, lsdCap);
		const lsdFront = t.driveFrontShare > 0 ? lsdTorque(this.wheels[WHEEL_FL], this.wheels[WHEEL_FR]) : 0;
		const lsdRear = t.driveFrontShare < 1 ? lsdTorque(this.wheels[WHEEL_RL], this.wheels[WHEEL_RR]) : 0;
		const staticLoad = t.mass * (9.81 + t.extraGravity) / 4;
		const comHeight = t.chassisOffsetY + t.centerOfMassY;
		let maxSlipAng = 0;
		let maxSlipRatio = -1;
		let minSlipRatio = 1;
		const h = dt / WHEEL_SUBSTEPS;
		const wheelMass = t.mass * .25 * .6;
		for (const w of this.wheels) {
			const share = w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare;
			const lsd = w.isFront ? lsdFront : lsdRear;
			const driveTorque = axleTorque * share * .5 + (w.isLeft ? -lsd : lsd);
			const bias = w.isFront ? t.brakeFrontBias : 1 - t.brakeFrontBias;
			const handIsBrake = handbrake && !w.isFront && !(this.drifting && absFwd > t.driftMinSpeed);
			const pedalTorque = (this.drifting && brakeEntry ? 0 : brakePedal) * t.brakeTorque * bias * .5;
			const handTorque = handIsBrake ? t.handbrakeTorque : 0;
			const brakeTorque = pedalTorque + handTorque;
			if (!w.grounded) {
				this.spinFreeWheel(w, driveTorque, brakeTorque, dt);
				w.slipAngle = 0;
				w.slipRatio = 0;
				w.forwardSpeed = forwardSpeed;
				w.lateralSpeed = 0;
				w.spin += w.omega * dt;
				continue;
			}
			if (w.isFront && w.steer !== 0) {
				quatSetAxisAngle(s.q2, s.up.x, s.up.y, s.up.z, -w.steer);
				rotate(s.wheelFwd, s.q2, s.fwd);
			} else copy(s.wheelFwd, s.fwd);
			const nd = dot(s.wheelFwd, w.normal);
			addScaled(s.wheelFwd, s.wheelFwd, w.normal, -nd);
			normalize(s.wheelFwd, s.wheelFwd);
			cross(s.wheelRight, w.normal, s.wheelFwd);
			normalize(s.wheelRight, s.wheelRight);
			velAt(w.contact, s.b);
			const vFwd = dot(s.b, s.wheelFwd);
			const vLat = dot(s.b, s.wheelRight);
			w.forwardSpeed = vFwd;
			w.lateralSpeed = vLat;
			const loadMul = clamp(1 - t.loadSensitivity * (w.load / staticLoad - 1), .6, 1.3);
			const muLoad = (w.isFront ? t.muFront * this.frontGripMul : t.muRear * this.rearGripMul) * loadMul * w.load;
			const r = t.wheelRadius;
			const vRef = Math.max(Math.abs(vFwd), t.slipLowSpeed);
			w.slipAngle = Math.atan2(Math.abs(vLat), Math.max(Math.abs(vFwd), .5));
			if (w.slipAngle > maxSlipAng) maxSlipAng = w.slipAngle;
			const peakA = t.slipAngPeakDeg * DEG;
			const latCurve = w.slipAngle <= peakA ? w.slipAngle / peakA : 1 - (1 - t.slipAngTail) * clamp01((w.slipAngle - peakA) / (60 * DEG - peakA));
			let fLat = -Math.sign(vLat) * muLoad * latCurve;
			const latImpulseCap = wheelMass * Math.abs(vLat) / dt;
			if (Math.abs(fLat) > latImpulseCap) fLat = -Math.sign(vLat) * latImpulseCap;
			let fLong = 0;
			for (let sub = 0; sub < WHEEL_SUBSTEPS; sub++) {
				const kappaPrev = (w.omega * r - vFwd) / vRef;
				let bt = brakeTorque;
				if (t.abs > 0 && pedalTorque > 0 && kappaPrev < -t.slipRatioPeak * 2) bt = pedalTorque * (1 - t.abs) + handTorque;
				const dir = w.omega !== 0 ? Math.sign(w.omega) : Math.sign(vFwd || 1);
				const torque = driveTorque - dir * bt;
				let omegaNew = solveWheel(t, w.omega, torque, vFwd, vRef, muLoad, h);
				if (bt > 0 && omegaNew * dir < 0) omegaNew = 0;
				w.omega = omegaNew;
				w.slipRatio = (w.omega * r - vFwd) / vRef;
				longForce(t, w.slipRatio, muLoad);
				fLong = lfForce;
			}
			if (share > 0 && w.slipRatio > maxSlipRatio) maxSlipRatio = w.slipRatio;
			if (w.slipRatio < minSlipRatio) minSlipRatio = w.slipRatio;
			fLong -= Math.sign(vFwd) * Math.min(Math.abs(vFwd) * 200, t.rollingResistance * Math.min(w.load, .5 * t.mass * 9.81));
			const mag = Math.hypot(fLat, fLong);
			if (mag > muLoad && mag > 0) {
				const kk = muLoad / mag;
				fLat *= kk;
				fLong *= kk;
			}
			w.spin += w.omega * dt;
			scale(s.force, s.wheelRight, fLat);
			addScaled(s.force, s.force, s.wheelFwd, fLong);
			addScaled(s.point, w.contact, s.up, (comHeight + t.wheelRadius) * t.tireForceHeight);
			forceAt(s.force, s.point);
		}
		if (this.boosting && grounded > 0) {
			scale(s.force, s.fwd, t.boostThrust);
			add(s.fSum, s.fSum, s.force);
		}
		if (this.drifting && t.driftAssist > 0) {
			const err = -this.driftTargetDeg * DEG - bodySlip;
			const slipRate = (bodySlip - this.bodySlipPrev) / dt;
			const torque = clamp(err * t.driftAngleGain - slipRate * t.driftAngleDamping, -t.driftYawTorqueMax, t.driftYawTorqueMax) * t.driftAssist;
			scale(s.force, s.up, torque);
			add(s.tSum, s.tSum, s.force);
			set(s.a, s.vel.x, 0, s.vel.z);
			const speedH = length(s.a);
			set(s.b, s.fwd.x, 0, s.fwd.z);
			normalize(s.b, s.b);
			if (speedH > 1 && dot(s.a, s.b) > 0) {
				scale(s.b, s.b, speedH);
				sub(s.b, s.b, s.a);
				scale(s.b, s.b, t.driftVelocityFollow * t.driftAssist);
				const accel = length(s.b);
				if (accel > t.driftFollowAccelMax) scale(s.b, s.b, t.driftFollowAccelMax / accel);
				scale(s.force, s.b, t.mass);
				add(s.fSum, s.fSum, s.force);
				const slip = Math.abs(Math.sin(bodySlipDeg * DEG));
				scale(s.force, s.a, -t.mass * t.driftSpeedLoss * slip);
				add(s.fSum, s.fSum, s.force);
			}
			if (throttle > 0 && grounded > 0) {
				scale(s.force, s.fwd, throttle * t.driftThrottlePush * t.driftAssist);
				add(s.fSum, s.fSum, s.force);
			}
		}
		if (speed > .1) {
			scale(s.force, s.vel, -t.drag * speed);
			add(s.fSum, s.fSum, s.force);
		}
		if (grounded > 0) {
			scale(s.force, s.up, -t.downforce * forwardSpeed * forwardSpeed);
			add(s.fSum, s.fSum, s.force);
		}
		set(s.force, 0, -t.extraGravity * t.mass, 0);
		add(s.fSum, s.fSum, s.force);
		if (grounded > 0 && speed < .5 && throttle === 0 && brakeIn === 0 && !handbrake) {
			scale(s.force, s.vel, -t.restDamping * t.mass);
			add(s.fSum, s.fSum, s.force);
			scale(s.force, s.angvel, -t.restDamping * t.mass * .5);
			add(s.tSum, s.tSum, s.force);
		}
		const airborne = grounded === 0;
		if (airborne) {
			this.airTime += dt;
			const pitchIn = throttle - brakeIn;
			const rollIn = controls.steer;
			scale(s.force, s.right, pitchIn * t.airPitchTorque);
			addScaled(s.force, s.force, s.fwd, rollIn * t.airRollTorque);
			const hs = Math.hypot(s.vel.x, s.vel.z);
			const pitch = clamp(Math.atan2(s.vel.y, Math.max(hs, 1)) * t.airFollowTrajectory + t.airPitchBiasDeg * DEG, -t.airPitchMaxDeg * DEG, t.airPitchMaxDeg * DEG);
			set(s.a, s.fwd.x, 0, s.fwd.z);
			normalize(s.a, s.a);
			set(s.b, -s.a.x * Math.sin(pitch), Math.cos(pitch), -s.a.z * Math.sin(pitch));
			if (s.vel.y < 0) {
				this.ray.origin.x = s.pos.x;
				this.ray.origin.y = s.pos.y;
				this.ray.origin.z = s.pos.z;
				this.ray.dir.x = 0;
				this.ray.dir.y = -1;
				this.ray.dir.z = 0;
				const hit = this.world.castRayAndGetNormal(this.ray, 14, true, void 0, void 0, void 0, body);
				if (hit) {
					if (Math.max(0, hit.timeOfImpact - (t.suspensionRestLength + t.wheelRadius)) / Math.max(.5, -s.vel.y) < t.airLandingLevelTime) set(s.b, hit.normal.x, hit.normal.y, hit.normal.z);
				}
			}
			cross(s.a, s.up, s.b);
			addScaled(s.force, s.force, s.a, t.airLevelTorque);
			addScaled(s.force, s.force, s.angvel, -t.airAngularDamping);
			add(s.tSum, s.tSum, s.force);
			this.boostMeter = Math.min(1, this.boostMeter + t.boostGainAir * dt);
		} else this.airTime = 0;
		if (this.drifting && absFwd > t.driftMinSpeed) this.boostMeter = Math.min(1, this.boostMeter + t.boostGainDrift * dt);
		const flipped = s.up.y < .35;
		if (flipped !== this.collidesWithTerrain) {
			this.collidesWithTerrain = flipped;
			this.collider.setCollisionGroups(flipped ? GROUPS_CHASSIS_FLIPPED : GROUPS_CHASSIS_UPRIGHT);
		}
		if (s.up.y < .15 && speed < 1.5) {
			this.flippedTime += dt;
			if (this.flippedTime > t.flipRecoverySeconds) {
				const yaw = yawOf(s.q);
				this.teleport({
					x: s.pos.x,
					y: s.pos.y + 1.2,
					z: s.pos.z
				}, yaw);
				this.flippedTime = 0;
			}
		} else this.flippedTime = 0;
		this.bodySlipPrev = bodySlip;
		body.addForce(s.fSum, true);
		body.addTorque(s.tSum, true);
		const tm = this.telemetry;
		tm.speed = forwardSpeed;
		tm.speedKmh = forwardSpeed * 3.6;
		tm.drifting = this.drifting;
		tm.driftAngleDeg = bodySlipDeg;
		tm.boost = this.boostMeter;
		tm.boosting = this.boosting;
		tm.airborne = airborne;
		tm.groundedWheels = grounded;
		tm.steer = this.steer;
		tm.steerDeg = this.steer / DEG;
		tm.gear = this.gear;
		tm.rpm = this.rpm;
		tm.throttle = throttle;
		tm.load = shifting ? 0 : clamp01((crankTorque > 0 ? drivePedal : 0) * (.5 + .5 * torqueCurve(t, this.rpm)) + (this.boosting ? .3 : 0));
		tm.airTime = this.airTime;
		tm.driftTime = this.driftTime;
		tm.maxSlipDeg = maxSlipAng / DEG;
		tm.maxSlipRatio = maxSlipRatio;
		tm.minSlipRatio = minSlipRatio;
		tm.shifting = shifting;
		tm.landingImpact = landingImpact;
		tm.brake = brakeIn;
		tm.driftDistance = this.driftDistance;
		tm.impact = impact;
		tm.hitHandle = this.bestPairHandle;
		tm.hitImpulse = this.bestPairImpulse;
		tm.scrape = scrape;
		tm.contactSide = this.wallTouch ? this.contactSide : 0;
		if (this.contactImpulse > 0) {
			normalize(s.b, this.contactNormal);
			tm.contactX = this.contactPoint.x;
			tm.contactY = this.contactPoint.y;
			tm.contactZ = this.contactPoint.z;
			tm.contactNx = s.b.x;
			tm.contactNy = s.b.y;
			tm.contactNz = s.b.z;
		}
		tm.vx = s.vel.x;
		tm.vy = s.vel.y;
		tm.vz = s.vel.z;
		sub(s.a, s.vel, this.prevVel);
		scale(s.a, s.a, 1 / (dt * 9.81));
		tm.yawRate = s.angvel.y;
		tm.gLong = dot(s.a, s.fwd);
		tm.gLat = -dot(s.a, s.right);
		tm.gVert = s.a.y;
		copy(this.prevVel, s.vel);
	}
	spinFreeWheel(w, driveTorque, brakeTorque, dt) {
		const t = this.tuning;
		const brakeSigned = -Math.sign(w.omega) * Math.min(brakeTorque, Math.abs(w.omega) * t.wheelInertia / dt);
		w.omega += (driveTorque + brakeSigned) / t.wheelInertia * dt;
		if ((w.isFront ? t.driveFrontShare : 1 - t.driveFrontShare) > 0) {
			const ratio = Math.abs((this.gear === -1 ? t.reverseRatio : t.gearRatios[this.gear - 1] ?? 1) * t.finalDrive);
			const omegaMax = t.redlineRpm / RPM_PER_RAD_S / ratio;
			w.omega = clamp(w.omega, -omegaMax, omegaMax);
		}
	}
	/** Inner wheel steers more than the outer one by the wheelbase/track geometry. */
	applyAckermann(d) {
		const t = this.tuning;
		const fr = this.wheels[WHEEL_FR];
		const fl = this.wheels[WHEEL_FL];
		if (Math.abs(d) < 1e-4 || t.ackermann <= 0) {
			fr.steer = d;
			fl.steer = d;
			return;
		}
		const R = t.wheelBase / Math.tan(Math.abs(d));
		const inner = Math.atan(t.wheelBase / (R - t.trackWidth * .5));
		const outer = Math.atan(t.wheelBase / (R + t.trackWidth * .5));
		const innerA = lerp(Math.abs(d), inner, t.ackermann);
		const outerA = lerp(Math.abs(d), outer, t.ackermann);
		if (d > 0) {
			fr.steer = innerA;
			fl.steer = outerA;
		} else {
			fr.steer = -outerA;
			fl.steer = -innerA;
		}
	}
	teleport(position, yaw) {
		const q = quatSetAxisAngle(scratch.q3, 0, 1, 0, yaw);
		this.body.setTranslation(position, true);
		this.body.setRotation(q, true);
		this.body.setLinvel({
			x: 0,
			y: 0,
			z: 0
		}, true);
		this.body.setAngvel({
			x: 0,
			y: 0,
			z: 0
		}, true);
		this.steer = 0;
		this.steerRaw = 0;
		set(this.prevVel, 0, 0, 0);
		this.drifting = false;
		this.bodySlipPrev = 0;
		this.airTime = 0;
		this.gear = 1;
		this.shiftTimer = 0;
		this.rpm = this.tuning.idleRpm;
		for (const w of this.wheels) {
			w.grounded = false;
			w.compression = 0;
			w.omega = 0;
			w.steer = 0;
			w.slipRatio = 0;
		}
		this.writeTransforms(true);
	}
	/** Replace linear velocity. Swap calls this after `teleport`, which zeroes it. */
	setVelocity(vx, vy, vz) {
		const v = scratch.vel;
		v.x = vx;
		v.y = vy;
		v.z = vz;
		this.body.setLinvel(v, true);
	}
	/** Copy body + wheel poses into the transform buffer. Call after `world.step()`. */
	writeTransforms(both = false) {
		const s = scratch;
		const tb = this.transforms;
		const t = this.tuning;
		this.body.translation(s.pos);
		this.body.rotation(s.q);
		if (both) tb.writeBoth(this.slot, s.pos.x, s.pos.y, s.pos.z, s.q.x, s.q.y, s.q.z, s.q.w);
		else tb.write(this.slot, s.pos.x, s.pos.y, s.pos.z, s.q.x, s.q.y, s.q.z, s.q.w);
		rotate(s.up, s.q, AXIS_Y);
		for (const wh of this.wheels) {
			quatSetAxisAngle(s.q2, 0, 1, 0, -wh.steer);
			quatMul(s.q3, s.q, s.q2);
			quatSetAxisAngle(s.q2, 1, 0, 0, wh.spin);
			quatMul(s.q3, s.q3, s.q2);
			const drop = wh.grounded ? t.suspensionRestLength - wh.compression : t.suspensionRestLength;
			rotate(s.a, s.q, wh.local);
			add(s.point, s.pos, s.a);
			addScaled(wh.center, s.point, s.up, -drop);
			if (both) tb.writeBoth(wh.slot, wh.center.x, wh.center.y, wh.center.z, s.q3.x, s.q3.y, s.q3.z, s.q3.w);
			else tb.write(wh.slot, wh.center.x, wh.center.y, wh.center.z, s.q3.x, s.q3.y, s.q3.z, s.q3.w);
		}
	}
};
/** Engine torque fraction at an rpm, piecewise linear over the tuning's curve. */
function torqueCurve(t, rpm) {
	const x = clamp(rpm / t.redlineRpm, 0, 1.05);
	const x0 = t.idleRpm / t.redlineRpm;
	const xs = [
		x0,
		.35,
		.65,
		.9,
		1
	];
	const ys = t.torqueCurve;
	if (x <= x0) return ys[0];
	for (let i = 1; i < 5; i++) {
		const x1 = xs[i];
		if (x <= x1) {
			const xa = xs[i - 1];
			return lerp(ys[i - 1], ys[i], (x - xa) / (x1 - xa));
		}
	}
	return ys[4];
}
/**
* One substep of the wheel rotation: find ω such that
*   I (ω - ω₀) / h = T - r·F(κ(ω)),   κ = (ω r - v) / vRef.
* F is piecewise linear in κ (slope muLoad/peak up to the peak, then a decaying
* plateau), so the linear-regime solution is closed-form and unconditionally
* stable; if it lands past the peak the plateau solution is used, and if the two
* disagree the answer sits on the boundary. No stiff ODE, no explicit overshoot.
*/
function solveWheel(t, omega0, torque, vFwd, vRef, muLoad, h) {
	const r = t.wheelRadius;
	const I = t.wheelInertia;
	const peak = t.slipRatioPeak;
	const slope = muLoad / peak;
	const A = I / h;
	const B = slope * r * r / vRef;
	const omegaLin = (A * omega0 + torque + slope * r * vFwd / vRef) / (A + B);
	const kLin = (omegaLin * r - vFwd) / vRef;
	if (Math.abs(kLin) <= peak) return omegaLin;
	const sgn = Math.sign(kLin);
	const kPrev = Math.abs((omega0 * r - vFwd) / vRef);
	const tail = 1 - (1 - t.slipRatioTail) * clamp01((Math.max(kPrev, peak) - peak) / (1 - peak));
	const omegaSat = omega0 + h * (torque - sgn * muLoad * tail * r) / I;
	if (sgn * ((omegaSat * r - vFwd) / vRef) >= peak) return omegaSat;
	return (sgn * peak * vRef + vFwd) / r;
}
/** Outputs of `longForce` (module scratch: no allocation in the wheel loop). */
let lfForce = 0;
let lfSlope = 0;
/**
* Longitudinal tyre force from the slip ratio: linear up to the peak, then a
* decay to the tail. Leaves the force and the local slope dF/dκ (0 when
* saturated, which the implicit wheel integrator needs) in `lfForce` / `lfSlope`.
*/
function longForce(t, kappa, muLoad) {
	const peak = t.slipRatioPeak;
	const a = Math.abs(kappa);
	if (a <= peak) {
		lfSlope = muLoad / peak;
		lfForce = lfSlope * kappa;
		return;
	}
	const tail = 1 - (1 - t.slipRatioTail) * clamp01((a - peak) / (1 - peak));
	lfForce = Math.sign(kappa) * muLoad * tail;
	lfSlope = 0;
}
function boxInertia(t) {
	const m = t.mass;
	const w = t.chassisHalfExtents.x * 2;
	const h = t.chassisHalfExtents.y * 2 + .5;
	const l = t.chassisHalfExtents.z * 2;
	return {
		x: m / 12 * (h * h + l * l) * t.inertiaScale.x,
		y: m / 12 * (w * w + l * l) * t.inertiaScale.y,
		z: m / 12 * (w * w + h * h) * t.inertiaScale.z
	};
}
//#endregion
//#region src/sim/SimWorld.ts
/**
* The headless game simulation. Owns the Rapier world, the player's vehicle and
* every simulated object. Runs on a fixed 60 Hz step and never touches Three.js
* or the DOM, so it is testable in Node and independent of the render rate.
*
* Also owns the instrumentation: a lap timer on the test track, a recorder of
* every step (controls, pose, telemetry) and the ghost of the best lap.
*/
const FIXED_DT = 1 / 60;
/** Below this height the car has fallen off the world and is respawned. */
const KILL_Y = -25;
let physicsReady = null;
/** Loads the Rapier WASM once. Safe to call many times. */
function initPhysics() {
	physicsReady ??= RAPIER.init();
	return physicsReady;
}
var SimWorld = class {
	city;
	roadReset = {
		name: "nearest-road",
		position: {
			x: 0,
			y: 1,
			z: 0
		},
		yaw: 0
	};
	world;
	transforms = new TransformBuffer(1024);
	events = new EventLog();
	/** Density scales from `SimWorldOptions`. Read by the life systems when they exist. */
	trafficDensity;
	pedsDensity;
	/** Null on the playground. Density 0 still constructs them so tests can `spawnAt`. */
	traffic;
	peds;
	life;
	heat;
	pursuit;
	police;
	/** The city's smashable billboards; null on the playground. */
	collectibles;
	statics;
	dynamics = [];
	spawns;
	vehicle;
	/** The player's class; car-swap changes it. */
	carId;
	controls = createControls();
	layout;
	track;
	lapTimer;
	recorder;
	spawnName;
	tracked = [];
	scratchPos = {
		x: 0,
		y: 0,
		z: 0
	};
	scratchRot = {
		x: 0,
		y: 0,
		z: 0,
		w: 1
	};
	/** The player's footprint and motion this step, filled before the life systems run. */
	probe = {
		x: 0,
		z: 0,
		yaw: 0,
		vx: 0,
		vz: 0,
		speed: 0,
		halfWidth: 0,
		halfLength: 0
	};
	/** Pose stream of the best lap (x, y, z, qx, qy, qz, qw per tick), for the ghost. */
	bestLapPoses = null;
	tick = 0;
	time = 0;
	/** Set when the vehicle was respawned this step (for the renderer to snap the camera). */
	respawned = false;
	/** Per-phase timing hook, installed from outside the sim (`src/app/simProfile.ts`). Null in tests and in play. */
	mark = null;
	/** `initPhysics()` must have resolved before constructing. */
	constructor(opts = {}) {
		this.trafficDensity = opts.traffic ?? 1;
		this.pedsDensity = opts.peds ?? 1;
		this.world = new RAPIER.World({
			x: 0,
			y: -9.81,
			z: 0
		});
		this.world.timestep = FIXED_DT;
		this.city = opts.map === "city" ? new City(this.world, opts.seed) : null;
		this.layout = this.city ? {
			statics: [],
			props: [],
			spawns: this.city.spawns,
			track: this.city.route,
			groundSize: 1575
		} : buildPlayground(this.world);
		this.statics = this.layout.statics;
		this.spawns = this.layout.spawns;
		this.track = this.layout.track;
		this.lapTimer = new LapTimer(this.track);
		this.recorder = opts.record ?? !this.city ? new Recorder() : null;
		for (const p of this.layout.props) {
			const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(p.position.x, p.position.y, p.position.z).setRotation(p.rotation).setLinearDamping(.4).setAngularDamping(.8);
			const body = this.world.createRigidBody(bodyDesc);
			const colliderDesc = p.shape.kind === "cylinder" ? RAPIER.ColliderDesc.cylinder(p.shape.halfHeight, p.shape.radius) : RAPIER.ColliderDesc.cuboid(p.shape.hx, p.shape.hy, p.shape.hz);
			colliderDesc.setMass(p.mass).setFriction(.55).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max).setRestitution(.6).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
			this.world.createCollider(colliderDesc, body);
			const slot = this.transforms.allocate();
			this.tracked.push({
				body,
				slot
			});
			this.dynamics.push({
				id: `prop${this.dynamics.length}`,
				shape: p.shape,
				color: p.color,
				slot,
				tag: "prop"
			});
			this.transforms.writeBoth(slot, p.position.x, p.position.y, p.position.z, p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
		}
		this.spawnName = opts.spawn ?? (this.city ? "city" : "lot");
		const spawn = this.spawns.find((s) => s.name === this.spawnName) ?? this.spawns[0];
		if (!spawn) throw new Error("map has no spawn points");
		this.carId = opts.car ?? "muscle";
		const tuning = opts.tuning ?? cloneTuning(CAR_PRESETS[this.carId]);
		this.vehicle = new Vehicle(this.world, this.transforms, tuning, spawn.position, spawn.yaw);
		this.traffic = this.city ? new Traffic(this.world, this.transforms, this.city, opts.seed ?? 42, TRAFFIC, this.trafficDensity) : null;
		this.peds = this.city && this.traffic ? new Pedestrians(this.transforms, this.city, this.traffic.lanes, opts.seed ?? 42, PEDS, this.pedsDensity) : null;
		this.collectibles = this.city ? new Collectibles(this.city) : null;
		this.life = new Life(this, opts.damage ?? this.city !== null);
		this.heat = new Heat(this.events, this.traffic);
		this.heat.add(opts.heat ?? 0);
		this.pursuit = new Pursuit(this.events);
		this.police = this.traffic ? new Police(this) : null;
		this.city?.sync(spawn.position.x, spawn.position.z, true);
	}
	/** Advance the simulation by exactly one fixed step using the current `controls`. */
	step() {
		if (this.city) {
			const pos = this.vehicle.body.translation(this.scratchPos);
			if (this.controls.reset || this.tick % 6 === 0 || this.vehicle.telemetry.groundedWheels === 0) {
				const nearest = this.nearestSpawn(pos.x, pos.z);
				this.vehicle.resetPose.position = nearest.position;
				this.vehicle.resetPose.yaw = nearest.yaw;
			}
			this.city.sync(pos.x, pos.z);
		}
		this.transforms.swap();
		this.respawned = false;
		this.events.tick = this.tick;
		this.life.preStep(this.controls, FIXED_DT);
		const reset = this.controls.reset;
		this.vehicle.update(this.controls, FIXED_DT);
		if (reset) this.respawned = true;
		this.controls.reset = false;
		this.controls.swap = false;
		this.mark?.(0);
		if (this.traffic) {
			const pos = this.vehicle.body.translation(this.scratchPos);
			const rot = this.vehicle.body.rotation(this.scratchRot);
			const tm = this.vehicle.telemetry;
			const he = this.vehicle.tuning.chassisHalfExtents;
			const probe = this.probe;
			probe.x = pos.x;
			probe.z = pos.z;
			probe.yaw = yawOf(rot);
			probe.vx = tm.vx;
			probe.vz = tm.vz;
			probe.speed = Math.hypot(tm.vx, tm.vz);
			probe.halfWidth = he.x;
			probe.halfLength = he.z;
			this.traffic.playerColliderHandle = this.vehicle.collider.handle;
			this.police?.preStep(probe, FIXED_DT);
			this.traffic.step(probe, FIXED_DT, this.events);
		}
		this.mark?.(1);
		if (this.traffic) this.peds?.step(this.probe, this.traffic, FIXED_DT, this.events);
		this.mark?.(2);
		this.world.step();
		this.mark?.(3);
		this.vehicle.writeTransforms();
		this.traffic?.writeTransforms();
		this.peds?.writeTransforms();
		this.life.postStep(FIXED_DT);
		this.heat.step();
		for (const t of this.tracked) {
			const p = t.body.translation(this.scratchPos);
			const r = t.body.rotation(this.scratchRot);
			this.transforms.write(t.slot, p.x, p.y, p.z, r.x, r.y, r.z, r.w);
		}
		const pos = this.vehicle.body.translation(this.scratchPos);
		const nearest = this.nearestSpawn(pos.x, pos.z);
		this.vehicle.resetPose.position = nearest.position;
		this.vehicle.resetPose.yaw = nearest.yaw;
		if (pos.y < KILL_Y) {
			this.vehicle.teleport(nearest.position, nearest.yaw);
			this.respawned = true;
		}
		if (reset) this.lapTimer.reset();
		this.tick++;
		this.time += FIXED_DT;
		const lap = this.lapTimer.state;
		if (!this.city) this.lapTimer.update(pos.x, pos.z, this.tick, this.time, FIXED_DT);
		if (this.recorder) {
			const slot = this.vehicle.slot;
			this.recorder.record(this.controls, reset, this.transforms.currPos, slot * 3, this.transforms.currRot, slot * 4, this.vehicle.telemetry);
			if (lap.lapStartTick === this.tick) this.recorder.lapStarts.push(this.tick);
			if (lap.justBest && lap.completedLapStartTick >= 0) this.bestLapPoses = this.recorder.slicePoses(lap.completedLapStartTick, this.tick);
		}
		this.mark?.(4);
	}
	get lap() {
		return this.lapTimer.state;
	}
	/** Pose of the best-lap ghost for the current lap progress; false when there is none to show. */
	ghostPose(out) {
		const lap = this.lapTimer.state;
		if (!this.bestLapPoses || lap.lapStartTick < 0) return false;
		const i = this.tick - lap.lapStartTick;
		const n = this.bestLapPoses.length / 7;
		if (i < 0 || i >= n) return false;
		const o = i * 7;
		const p = this.bestLapPoses;
		out.x = p[o];
		out.y = p[o + 1];
		out.z = p[o + 2];
		out.qx = p[o + 3];
		out.qy = p[o + 4];
		out.qz = p[o + 5];
		out.qw = p[o + 6];
		return true;
	}
	nearestSpawn(x, z) {
		if (this.city) return this.city.nearestRoad(x, z, this.roadReset);
		let best = this.spawns[0];
		let bestD = Infinity;
		for (const s of this.spawns) {
			const dx = s.position.x - x;
			const dz = s.position.z - z;
			const d = dx * dx + dz * dz;
			if (d < bestD) {
				bestD = d;
				best = s;
			}
		}
		return best;
	}
	/** Teleport the player to a named spawn (dev panel / tests). */
	spawnAt(name) {
		const s = this.spawns.find((sp) => sp.name === name);
		if (!s) return;
		this.vehicle.teleport(s.position, s.yaw);
		this.city?.sync(s.position.x, s.position.z, true);
		this.lapTimer.reset();
		this.respawned = true;
	}
	/** True when any tracked body has a non-finite transform (soak test). */
	hasNaN() {
		const b = this.transforms;
		for (let i = 0; i < b.count * 3; i++) if (!Number.isFinite(b.currPos[i])) return true;
		for (let i = 0; i < b.count * 4; i++) if (!Number.isFinite(b.currRot[i])) return true;
		return false;
	}
	dispose() {
		this.world.free();
	}
};
//#endregion
//#region src/app/trackBot.ts
const DEFAULT_TRACK_BOT = {
	lookBase: 5,
	lookPerSpeed: .5,
	lookMin: 7,
	lookMax: 34,
	steerGain: 2.6,
	latAccel: 17,
	brakeAccel: 9,
	planAhead: 90,
	vMax: 58,
	boostAbove: 0
};
/**
* Per-class overrides. The lateral budget is the largest that keeps the class on
* the road and on four wheels on the test track (sweep in docs/PROGRESS.md);
* above it the bot cuts corners or lifts the inside wheels and the lap time
* stops measuring the car.
*/
const TRACK_BOT_BY_CAR = {
	muscle: {},
	compact: { latAccel: 13 },
	heavy: {
		latAccel: 11,
		brakeAccel: 8
	},
	sports: {},
	police: { latAccel: 15 }
};
/** Conservative junction speeds; this is a coverage driver, not a racing opponent. */
const CITY_BOT_TUNING = {
	latAccel: 7,
	brakeAccel: 7,
	vMax: 32,
	lookBase: 3,
	lookPerSpeed: .3,
	lookMin: 5,
	lookMax: 15
};
var TrackBot = class {
	tuning;
	idx = 0;
	stuckTime = 0;
	visitedLanes = /* @__PURE__ */ new Set();
	tourComplete = false;
	resets = 0;
	constructor(car = "muscle", overrides = {}) {
		this.tuning = {
			...DEFAULT_TRACK_BOT,
			...TRACK_BOT_BY_CAR[car],
			...overrides
		};
	}
	/** Fill `controls` for one fixed step. */
	drive(sim, controls, dt) {
		const t = this.tuning;
		const S = sim.track.samples;
		const m = S.length;
		const tp = sim.transforms.currPos;
		const px = tp[sim.vehicle.slot * 3];
		const pz = tp[sim.vehicle.slot * 3 + 2];
		const tm = sim.vehicle.telemetry;
		const speed = Math.max(0, tm.speed);
		let best = this.idx;
		let bestD = Infinity;
		for (let k = sim.city ? -4 : -8; k <= (sim.city ? 16 : 24); k++) {
			const i = (this.idx + k + m) % m;
			const s = S[i];
			const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		}
		if (bestD > 1600) for (let i = 0; i < m; i++) {
			const s = S[i];
			const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		}
		this.idx = best;
		if (sim.city) {
			const lane = sim.city.route.laneAtSample[best];
			if (lane !== void 0) this.visitedLanes.add(lane);
			this.tourComplete = this.visitedLanes.size === sim.city.graph.lanes.length;
		}
		const look = Math.max(t.lookMin, Math.min(t.lookMax, t.lookBase + speed * t.lookPerSpeed));
		const target = S[(best + Math.round(look / 3)) % m];
		const q = sim.transforms.currRot;
		const qi = sim.vehicle.slot * 4;
		const qx = q[qi];
		const qy = q[qi + 1];
		const qz = q[qi + 2];
		const qw = q[qi + 3];
		const yaw = Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
		let d = Math.atan2(target.x - px, target.z - pz) - yaw;
		while (d > Math.PI) d -= Math.PI * 2;
		while (d < -Math.PI) d += Math.PI * 2;
		controls.steer = Math.max(-1, Math.min(1, -d * t.steerGain));
		let allowed = t.vMax;
		let dist = 0;
		for (let k = 0; dist < t.planAhead; k++) {
			const s = S[(best + k) % m];
			const r = 1 / Math.max(1e-4, Math.abs(s.curvature));
			const vCorner = Math.min(t.vMax, Math.sqrt(t.latAccel * r));
			const vHere = Math.sqrt(vCorner * vCorner + 2 * t.brakeAccel * dist);
			if (vHere < allowed) allowed = vHere;
			dist += 3;
		}
		controls.throttle = speed < allowed - .5 ? 1 : 0;
		controls.brake = speed > allowed + 1.5 ? 1 : 0;
		controls.handbrake = 0;
		controls.boost = t.boostAbove > 0 && speed > t.boostAbove && allowed >= t.vMax ? 1 : 0;
		if (sim.traffic && this.trafficAhead(sim, px, pz, yaw, speed)) {
			controls.throttle = 0;
			controls.brake = 1;
			controls.boost = 0;
		}
		if (speed < .8 && controls.throttle > 0) {
			this.stuckTime += dt;
			if (this.stuckTime > 2.5) {
				sim.spawnAt(sim.city ? "city" : "track");
				this.idx = 0;
				this.resets++;
				this.stuckTime = 0;
			}
		} else this.stuckTime = 0;
	}
	/** Brake for a slower car within 18 m ahead on the bot's heading. Never swaps. */
	trafficAhead(sim, px, pz, yaw, speed) {
		const traffic = sim.traffic;
		if (!traffic) return false;
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		for (let i = 0; i < traffic.capacity; i++) {
			if (traffic.state[i] === 0) continue;
			const dx = traffic.x[i] - px;
			const dz = traffic.z[i] - pz;
			const along = dx * fx + dz * fz;
			if (along < 1 || along > 18) continue;
			const side = dx * -fz + dz * fx;
			if (Math.abs(side) > 2.6) continue;
			if (traffic.speed[i] < speed - 1) return true;
		}
		return false;
	}
};
//#endregion
//#region output/m4-step-ab.ts
await initPhysics();
const rows = [];
for (const heat of [
	0,
	40,
	100
]) for (const pass of [1, 2]) {
	const sim = new SimWorld({
		map: "city",
		seed: 42,
		heat,
		record: false
	});
	const bot = new TrackBot("muscle", CITY_BOT_TUNING);
	const samples = [];
	try {
		for (let tick = 0; tick < 3600; tick++) {
			bot.drive(sim, sim.controls, 1 / 60);
			const t0 = performance.now();
			sim.step();
			samples.push(performance.now() - t0);
		}
		samples.sort((a, b) => a - b);
		const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
		rows.push({
			heat,
			pass,
			units: sim.police?.count,
			meanMs: +mean.toFixed(3),
			p50: +samples[Math.floor(samples.length * .5)].toFixed(3),
			p95: +samples[Math.floor(samples.length * .95)].toFixed(3),
			max: +samples[samples.length - 1].toFixed(3)
		});
	} finally {
		sim.dispose();
	}
}
console.table(rows);
//#endregion
export {};
