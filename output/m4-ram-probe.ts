import { initPhysics, SimWorld } from '../src/sim/SimWorld';
import { POLICE } from '../src/sim/police/tuning';
import { TRAFFIC } from '../src/sim/traffic/tuning';
import type { LaneProjection } from '../src/sim/traffic/lanes';

await initPhysics();
const rows: Record<string, unknown>[] = [];
for (const kind of ['police', 'sports'] as const) {
  const sim = new SimWorld({ map: 'city', seed: 42, traffic: 0, peds: 0, record: false });
  const traffic = sim.traffic!;
  const lanes = traffic.lanes;
  let lane = -1;
  for (let i = 0; i < lanes.laneCount; i++) {
    if ((lanes.limit[i] as number) === TRAFFIC.speedHighway && (lanes.length[i] as number) > 150) { lane = i; break; }
  }
  const pose = { x: 0, z: 0, yaw: 0 };
  lanes.positionAt(lane, 20, 0, pose);
  sim.vehicle.teleport({ x: pose.x, y: 1, z: pose.z }, pose.yaw);
  for (let i = 0; i < 4 * 60; i++) { sim.controls.throttle = 1; sim.step(); }
  const before = sim.vehicle.telemetry.speedKmh;
  const lateral = (x: number, z: number): number => (x - pose.x) * -Math.cos(pose.yaw) + (z - pose.z) * Math.sin(pose.yaw);
  const driftBefore = lateral(sim.probe.x, sim.probe.z);
  const here: LaneProjection = { x: 0, z: 0, yaw: 0, s: 0, lateral: 0, dist: 0 };
  lanes.project(lane, sim.probe.x, sim.probe.z, here);
  const unit = traffic.spawnPoliceAt(lane, Math.max(4, here.s - 25), kind, sim.probe, 0, -1, 4);
  let minSpeed = Infinity, contacts = 0, yawSwing = 0;
  const accel = kind === 'sports' ? POLICE.pitAcceleration : POLICE.ramAcceleration;
  for (let i = 0; i < 6 * 60; i++) {
    sim.controls.throttle = 1;
    const fx = Math.sin(sim.probe.yaw), fz = Math.cos(sim.probe.yaw);
    const dx = sim.probe.x - (traffic.x[unit] as number), dz = sim.probe.z - (traffic.z[unit] as number);
    const side = dx * fz - dz * fx >= 0 ? 1 : -1;
    const aimX = kind === 'sports' ? sim.probe.x - fx * sim.probe.halfLength * 0.9 + -fz * side * POLICE.pitSideOffset : sim.probe.x;
    const aimZ = kind === 'sports' ? sim.probe.z - fz * sim.probe.halfLength * 0.9 + fx * side * POLICE.pitSideOffset : sim.probe.z;
    traffic.setPolicePlan(unit, -1, POLICE.catchUpSpeed, aimX, aimZ, POLICE.catchUpSpeed, accel);
    sim.step();
    if ((traffic.playerDv[unit] as number) > POLICE.ramContactDv) contacts++;
    if (contacts > 0) {
      minSpeed = Math.min(minSpeed, sim.vehicle.telemetry.speedKmh);
      yawSwing = Math.max(yawSwing, Math.abs(sim.vehicle.telemetry.yawRate));
    }
  }
  rows.push({ kind, beforeKmh: +before.toFixed(1), afterKmh: +sim.vehicle.telemetry.speedKmh.toFixed(1),
    minKmh: +minSpeed.toFixed(1), keptPercent: +(100 * minSpeed / before).toFixed(0), contacts,
    pushedAcross: +Math.abs(lateral(sim.probe.x, sim.probe.z) - driftBefore).toFixed(1),
    peakYawRate: +yawSwing.toFixed(2), damage: +sim.life.state.damage.toFixed(2), wrecked: sim.life.state.wrecked });
  sim.dispose();
}
console.log(JSON.stringify(rows, null, 2));
