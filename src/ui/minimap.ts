import { CITY_HALF, DISTRICTS, districtAt, type SimWorld } from '../sim';
import { LANDMARKS } from '../sim/city/City';

/** Static SVG map (built once), moving heading arrow and district label. North is +Z. */
export class Minimap {
  private readonly arrow: SVGElement;
  private readonly label: HTMLElement;
  private readonly landmark: HTMLElement;
  private district = '';
  constructor(parent: HTMLElement, sim: SimWorld) {
    const wrap = document.createElement('div'); wrap.className = 'minimap';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-825 -825 1650 1650');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'City map. North is up. Yellow arrow is your car.');
    const shape = (tag: string, attrs: Record<string, string>) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      svg.appendChild(node); return node;
    };
    for (let i = 0; i < 4; i++) {
      const d = DISTRICTS[i] as typeof DISTRICTS[number];
      shape('rect', { x: i % 2 ? String(-CITY_HALF) : '0', y: i >= 2 ? String(-CITY_HALF) : '0', width: String(CITY_HALF), height: String(CITY_HALF), fill: `#${d.color.toString(16)}`, opacity: '.28' });
    }
    if (sim.city) for (const lane of sim.city.graph.lanes) {
      if (lane.from > lane.to) continue;
      const a = sim.city.graph.nodes[lane.from], b = sim.city.graph.nodes[lane.to];
      if (!a || !b) continue;
      shape('line', { x1: String(-a.x), y1: String(-a.z), x2: String(-b.x), y2: String(-b.z), stroke: lane.highway ? '#f5cd75' : '#f7f3ea', 'stroke-width': lane.highway ? '22' : '13', opacity: '.8' });
    }
    for (const { x, z } of LANDMARKS) shape('rect', { x: String(-x - 17), y: String(-z - 17), width: '34', height: '34', fill: '#2bd1ff' });
    this.arrow = shape('path', { d: 'M 0 -53 L 35 35 L 0 20 L -35 35 Z', fill: '#ffd23f', stroke: '#160e28', 'stroke-width': '14', 'stroke-linejoin': 'round' });
    const north = document.createElement('span'); north.className = 'minimap__north'; north.textContent = 'N';
    this.label = document.createElement('div'); this.label.className = 'minimap__district';
    this.landmark = document.createElement('div'); this.landmark.className = 'minimap__landmark';
    wrap.append(svg, north, this.label, this.landmark); parent.appendChild(wrap);
  }
  update(sim: SimWorld): void {
    const p = sim.transforms.currPos, q = sim.transforms.currRot, i = sim.vehicle.slot;
    const x = p[i * 3] as number, z = p[i * 3 + 2] as number;
    const qx = q[i * 4] as number, qy = q[i * 4 + 1] as number, qz = q[i * 4 + 2] as number, qw = q[i * 4 + 3] as number;
    const yaw = Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy));
    this.arrow.setAttribute('transform', `translate(${-x} ${-z}) rotate(${-yaw * 180 / Math.PI})`);
    const d = districtAt(x, z);
    if (d.id !== this.district) {
      this.district = d.id; this.label.textContent = d.name; this.landmark.textContent = d.landmark;
      this.label.style.color = `#${d.color.toString(16)}`;
    }
  }
}
