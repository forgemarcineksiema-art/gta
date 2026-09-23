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
  ],
};
