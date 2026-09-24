/**
 * Dev-only tuning panel (`?dev=1` or the debug key). Generates a number field
 * for every numeric leaf of the VehicleTuning object and edits it live. "Copy
 * patch" copies only the values that differ from the defaults, ready to paste
 * into src/sim/vehicle/tuning.ts.
 */
import { DEFAULT_TUNING, type SimWorld, type VehicleTelemetry } from '../../sim';
import { TelemetryGraph } from './telemetryGraph';

type Leaf = { path: string; get: () => number; set: (v: number) => void; def: number };

export interface DebugPanelActions {
  spawnAt(name: string): void;
  refillBoost(): void;
  /** Called after any vehicle value changes (structural values need a rebuild). */
  onVehicleChange?: () => void;
  cars?: readonly string[];
  currentCar?: string;
  selectCar?: (car: string) => void;
  saveRecording?: () => void;
  loadGhost?: (text: string) => void;
  clearGhost?: () => void;
  /** Extra numeric objects to expose (e.g. camera tuning), keyed by section title. */
  extra?: Record<string, Record<string, number>>;
}

export class DebugPanel {
  readonly root: HTMLElement;
  private visible = false;
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly leaves: Leaf[] = [];
  private onChange: () => void = () => undefined;
  private readonly graph: TelemetryGraph;

  constructor(parent: HTMLElement, sim: SimWorld, actions: DebugPanelActions) {
    this.root = document.createElement('div');
    this.root.className = 'devpanel';
    parent.appendChild(this.root);

    const head = document.createElement('div');
    head.className = 'devpanel__head';
    head.textContent = 'TUNING';
    this.root.appendChild(head);

    const bar = document.createElement('div');
    bar.className = 'devpanel__bar';
    const copyBtn = button('copy patch', () => {
      const patch: Record<string, number> = {};
      for (const l of this.leaves) if (l.get() !== l.def) patch[l.path] = l.get();
      const text = JSON.stringify(patch, null, 2);
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      console.info('tuning patch\n' + text);
      copyBtn.textContent = 'copied';
      setTimeout(() => (copyBtn.textContent = 'copy patch'), 800);
    });
    const resetBtn = button('defaults', () => {
      for (const l of this.leaves) l.set(l.def);
      this.refresh();
    });
    const boostBtn = button('boost 100%', () => actions.refillBoost());
    bar.append(copyBtn, resetBtn, boostBtn);
    this.root.appendChild(bar);

    const spawns = document.createElement('div');
    spawns.className = 'devpanel__bar';
    for (const s of sim.spawns) spawns.appendChild(button(s.name, () => actions.spawnAt(s.name)));
    this.root.appendChild(spawns);

    if (actions.cars && actions.selectCar) {
      const cars = document.createElement('div');
      cars.className = 'devpanel__bar';
      for (const c of actions.cars) {
        const b = button(c === actions.currentCar ? `[${c}]` : c, () => actions.selectCar?.(c));
        cars.appendChild(b);
      }
      this.root.appendChild(cars);
    }
    const rec = document.createElement('div');
    rec.className = 'devpanel__bar';
    if (actions.saveRecording) rec.appendChild(button('save recording', () => actions.saveRecording?.()));
    if (actions.loadGhost) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        if (!f) return;
        void f.text().then((text) => actions.loadGhost?.(text));
        input.value = '';
      });
      rec.appendChild(input);
      rec.appendChild(button('load ghost', () => input.click()));
    }
    if (actions.clearGhost) rec.appendChild(button('clear ghost', () => actions.clearGhost?.()));
    this.root.appendChild(rec);
    this.graph = new TelemetryGraph(this.root);

    const body = document.createElement('div');
    body.className = 'devpanel__body';
    this.root.appendChild(body);
    this.onChange = actions.onVehicleChange ?? (() => undefined);
    this.buildSection(body, 'vehicle', sim.vehicle.tuning as unknown as Record<string, unknown>, DEFAULT_TUNING as unknown as Record<string, unknown>, '');
    this.onChange = () => undefined;
    if (actions.extra) {
      for (const [title, obj] of Object.entries(actions.extra)) {
        const defaults = { ...obj };
        this.buildSection(body, title, obj, defaults, '');
      }
    }
    // keep keystrokes inside the panel away from the game
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
  }

  private buildSection(parent: HTMLElement, title: string, obj: Record<string, unknown>, defaults: Record<string, unknown>, prefix: string): void {
    if (prefix === '') {
      const h = document.createElement('div');
      h.className = 'devpanel__section';
      h.textContent = title;
      parent.appendChild(h);
    }
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof v === 'number') {
        const def = typeof defaults[key] === 'number' ? (defaults[key]) : v;
        const changed = this.onChange;
        const leaf: Leaf = {
          path,
          get: () => obj[key] as number,
          set: (n) => {
            obj[key] = n;
            changed();
          },
          def,
        };
        this.leaves.push(leaf);
        const row = document.createElement('label');
        row.className = 'devpanel__row';
        const name = document.createElement('span');
        name.textContent = path;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = String(stepFor(v));
        input.value = String(v);
        input.addEventListener('input', () => {
          const n = Number(input.value);
          if (Number.isFinite(n)) {
            leaf.set(n);
            row.classList.toggle('is-changed', n !== def);
          }
        });
        this.inputs.set(path, input);
        row.append(name, input);
        parent.appendChild(row);
      } else if (v && typeof v === 'object') {
        this.buildSection(parent, title, v as Record<string, unknown>, (defaults[key] ?? {}) as Record<string, unknown>, path);
      }
    }
  }

  refresh(): void {
    for (const l of this.leaves) {
      const input = this.inputs.get(l.path);
      if (input) {
        input.value = String(l.get());
        input.parentElement?.classList.toggle('is-changed', l.get() !== l.def);
      }
    }
  }

  graphPush(tm: VehicleTelemetry): void {
    if (this.visible) this.graph.push(tm);
  }

  graphDraw(now: number): void {
    if (this.visible) this.graph.draw(now);
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('is-visible', v);
    if (v) this.refresh();
  }

  get isVisible(): boolean {
    return this.visible;
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function stepFor(v: number): number {
  const a = Math.abs(v);
  if (a >= 1000) return 100;
  if (a >= 100) return 10;
  if (a >= 10) return 1;
  if (a >= 1) return 0.1;
  return 0.01;
}
