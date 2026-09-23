/**
 * The jobs' placement for the shipping seed, baked so the boot does not generate the chunks `placeJobs`
 * checks (M5.1). Written by `npm run bake:jobs`; jobs 1.1 fails when it drifts from the generator.
 */
import type { JobDef } from './catalog';

export const BAKED_JOBS: Readonly<Record<number, readonly JobDef[]>> = {
  42: [
    { id: 1, kind: 'escape', x: -18, z: 650, yaw: 0.6240230529767569, targetX: 0, targetZ: 0, level: 2, descriptor: -1, payout: 3000, limitSeconds: 0, heat: 0 },
    { id: 2, kind: 'escape', x: -650, z: 207, yaw: -0.9467732738181398, targetX: 0, targetZ: 0, level: 2, descriptor: -1, payout: 3000, limitSeconds: 0, heat: 0 },
    { id: 3, kind: 'escape', x: -207, z: -650, yaw: -2.5175696006130366, targetX: 0, targetZ: 0, level: 3, descriptor: -1, payout: 4500, limitSeconds: 0, heat: 0 },
    { id: 4, kind: 'escape', x: 650, z: -468, yaw: 0.9467732738181398, targetX: 0, targetZ: 0, level: 4, descriptor: -1, payout: 6000, limitSeconds: 0, heat: 0 },
    { id: 5, kind: 'delivery', x: -432, z: -432, yaw: -2.356194490192345, targetX: -428.2, targetZ: -368, level: 0, descriptor: -1, payout: 6500, limitSeconds: 67, heat: 10 },
    { id: 6, kind: 'delivery', x: 468, z: -432, yaw: -2.356194490192345, targetX: 477.5, targetZ: -368, level: 0, descriptor: -1, payout: 6500, limitSeconds: 67, heat: 10 },
    { id: 7, kind: 'delivery', x: 468, z: 243, yaw: -2.356194490192345, targetX: 532, targetZ: 471.8, level: 0, descriptor: -1, payout: 6300, limitSeconds: 65, heat: 10 },
    { id: 8, kind: 'order', x: -18, z: 18, yaw: 2.356194490192345, targetX: 477.5, targetZ: -368, level: 0, descriptor: 49568767, payout: 5000, limitSeconds: 240, heat: 8 },
    { id: 9, kind: 'order', x: -468, z: 650, yaw: 0.6240230529767569, targetX: -368.6310009758291, targetZ: 419.1443242133293, level: 0, descriptor: 32791551, payout: 4000, limitSeconds: 240, heat: 8 },
    { id: 10, kind: 'order', x: 207, z: -650, yaw: 2.5175696006130366, targetX: 477.5, targetZ: -368, level: 0, descriptor: 28767554, payout: 4000, limitSeconds: 240, heat: 8 },
    { id: 11, kind: 'order', x: 207, z: -243, yaw: 0.7853981633974483, targetX: 532, targetZ: 471.8, level: 0, descriptor: 35396386, payout: 5000, limitSeconds: 240, heat: 8 },
    { id: 12, kind: 'delivery', x: 650, z: -18, yaw: 0.9467732738181398, targetX: 532, targetZ: 471.8, level: 0, descriptor: -1, payout: 6700, limitSeconds: 62, heat: 10 },
    { id: 13, kind: 'order', x: 243, z: 468, yaw: -2.356194490192345, targetX: 477.5, targetZ: -368, level: 0, descriptor: 32791551, payout: 4000, limitSeconds: 240, heat: 8 },
    { id: 14, kind: 'delivery', x: -243, z: 432, yaw: 0.7853981633974483, targetX: -428.2, targetZ: -368, level: 0, descriptor: -1, payout: 8300, limitSeconds: 82, heat: 10 },
    { id: 15, kind: 'delivery', x: -432, z: 18, yaw: -2.356194490192345, targetX: -428.2, targetZ: -368, level: 0, descriptor: -1, payout: 7000, limitSeconds: 72, heat: 10 },
    { id: 16, kind: 'order', x: 18, z: -432, yaw: -2.356194490192345, targetX: 477.5, targetZ: -368, level: 0, descriptor: 16014335, payout: 6000, limitSeconds: 240, heat: 8 },
    { id: 17, kind: 'trial', x: 432, z: -207, yaw: 2.356194490192345, targetX: -220.5, targetZ: 562.5, level: 0, descriptor: -1, payout: 8000, limitSeconds: 92, heat: 0 },
    { id: 18, kind: 'trial', x: -468, z: 207, yaw: 0.7853981633974483, targetX: 334.32249705129857, targetZ: -336.4491819726335, level: 0, descriptor: -1, payout: 8000, limitSeconds: 91, heat: 0 },
    { id: 19, kind: 'trial', x: 243, z: 243, yaw: -2.356194490192345, targetX: -687, targetZ: 562.5, level: 0, descriptor: -1, payout: 8000, limitSeconds: 90, heat: 0 },
    { id: 20, kind: 'trial', x: 468, z: -650, yaw: -2.5175696006130366, targetX: 112.5, targetZ: 454.5, level: 0, descriptor: -1, payout: 8000, limitSeconds: 91, heat: 0 },
    { id: 21, kind: 'race', x: 243, z: -468, yaw: -0.7853981633974483, targetX: 229.5, targetZ: 562.5, level: 0, descriptor: -1, payout: 6000, limitSeconds: 160, heat: 0 },
    { id: 22, kind: 'race', x: -207, z: 243, yaw: -2.356194490192345, targetX: 337.5, targetZ: -687, level: 0, descriptor: -1, payout: 6000, limitSeconds: 160, heat: 0 },
    { id: 23, kind: 'race', x: 650, z: -243, yaw: 0.9467732738181398, targetX: -562.5, targetZ: 4.5, level: 0, descriptor: -1, payout: 6000, limitSeconds: 161, heat: 0 },
    { id: 24, kind: 'race', x: -650, z: 432, yaw: -0.9467732738181398, targetX: 679, targetZ: 562.5, level: 0, descriptor: -1, payout: 6000, limitSeconds: 163, heat: 0 },
    { id: 25, kind: 'rage', x: 18, z: -243, yaw: -0.7853981633974483, targetX: 18, targetZ: -243, level: 6, descriptor: -1, payout: 10000, limitSeconds: 60, heat: 10 },
    { id: 26, kind: 'mayhem', x: 18, z: -650, yaw: -2.5175696006130366, targetX: 18, targetZ: -650, level: 5000, descriptor: -1, payout: 8000, limitSeconds: 60, heat: 15 },
    { id: 27, kind: 'rage', x: -18, z: 243, yaw: 2.356194490192345, targetX: -18, targetZ: 243, level: 6, descriptor: -1, payout: 10000, limitSeconds: 60, heat: 10 },
    { id: 28, kind: 'mayhem', x: 432, z: -18, yaw: 0.7853981633974483, targetX: 432, targetZ: -18, level: 5000, descriptor: -1, payout: 8000, limitSeconds: 60, heat: 15 },
    { id: 29, kind: 'duel', x: -181.5, z: 10.15, yaw: 1.5707963267948966, targetX: -410, targetZ: 454.5, level: 0, descriptor: -1, payout: 4000, limitSeconds: 120, heat: 0 },
    { id: 30, kind: 'duel', x: 235.15, z: 50.5, yaw: 3.141592653589793, targetX: -687, targetZ: -562.5, level: 1, descriptor: -1, payout: 6000, limitSeconds: 191, heat: 0 },
    { id: 31, kind: 'duel', x: 10.15, z: -575.5, yaw: 3.141592653589793, targetX: 477.5, targetZ: -368, level: 2, descriptor: -1, payout: 8000, limitSeconds: 111, heat: 0 },
    { id: 32, kind: 'duel', x: 345.8687623865864, z: 308.00424693865824, yaw: 2.298100640092944, targetX: -679, targetZ: -337.5, level: 3, descriptor: -1, payout: 10000, limitSeconds: 217, heat: 0 },
    { id: 33, kind: 'duel', x: 460.15, z: -505.5, yaw: 3.141592653589793, targetX: 110, targetZ: -229.5, level: 4, descriptor: -1, payout: 12000, limitSeconds: 104, heat: 0 },
    { id: 34, kind: 'duel', x: -439.85, z: -610.5, yaw: 3.141592653589793, targetX: 322.42567929867556, targetZ: 322.42580877271, level: 5, descriptor: -1, payout: 15000, limitSeconds: 211, heat: 0 },
    { id: 35, kind: 'duel', x: 155.5, z: 460.15, yaw: 1.5707963267948966, targetX: -562.5, targetZ: -671, level: 6, descriptor: -1, payout: 18000, limitSeconds: 226, heat: 0 },
    { id: 36, kind: 'duel', x: -10.15, z: -181.5, yaw: 0, targetX: -365, targetZ: -445.5, level: 7, descriptor: -1, payout: 22000, limitSeconds: 122, heat: 0 },
    { id: 37, kind: 'duel', x: -235.15, z: 507.5, yaw: 0, targetX: 562.5, targetZ: -663, level: 8, descriptor: -1, payout: 30000, limitSeconds: 234, heat: 0 },
    { id: 38, kind: 'duel', x: -271.56160376757475, z: -642.7926638905121, yaw: 5.4977871437821335, targetX: 562.5, targetZ: 671, level: 9, descriptor: -1, payout: 50000, limitSeconds: 274, heat: 0 },
    { id: 39, kind: 'duel', x: 134.5, z: -235.15, yaw: 4.71238898038469, targetX: 134.5, targetZ: -235.15, level: 10, descriptor: -1, payout: 100000, limitSeconds: 0, heat: 0 },
  ],
};
