/**
 * The settings on the pause screen (M7 slice 3, DESIGN.md §15.3): MUSIC and EFFECTS (0–10), QUALITY (AUTO, LOW,
 * HIGH) and the RADAR (TURNS, NORTH UP). W and S move between the rows, A and D change the one in focus, and every
 * row is clickable. Writes the world's `settings`; `changed` tells the app to apply and save them.
 */
import { QUALITY_SETTINGS, type Settings } from '../sim';

type Row = 'music' | 'effects' | 'quality' | 'radar';
const ROWS: readonly Row[] = ['music', 'effects', 'quality', 'radar'];
const NAMES: Record<Row, string> = { music: 'MUSIC', effects: 'EFFECTS', quality: 'QUALITY', radar: 'RADAR' };

export interface SettingsNav {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export class SettingsUi {
  readonly root: HTMLElement;
  private focus = 0;
  private readonly values = new Map<Row, HTMLElement>();
  private readonly rows = new Map<Row, HTMLElement>();

  constructor(parent: HTMLElement, private readonly settings: Settings, private readonly changed: () => void) {
    this.root = el('div', 'settings');
    for (const row of ROWS) {
      const r = el('div', 'settings__row');
      const less = el('button', 'settings__step', '‹');
      const value = el('span', 'settings__value');
      const more = el('button', 'settings__step', '›');
      less.addEventListener('click', () => { this.focus = ROWS.indexOf(row); this.change(row, -1); });
      more.addEventListener('click', () => { this.focus = ROWS.indexOf(row); this.change(row, 1); });
      r.append(el('span', 'settings__name', NAMES[row]), less, value, more);
      this.root.appendChild(r);
      this.values.set(row, value);
      this.rows.set(row, r);
    }
    parent.appendChild(this.root);
    this.refresh();
  }

  /** The keys while paused: W and S the row, A and D its value. */
  navigate(nav: SettingsNav): void {
    if (nav.up) this.focus = (this.focus + ROWS.length - 1) % ROWS.length;
    if (nav.down) this.focus = (this.focus + 1) % ROWS.length;
    const row = ROWS[this.focus] as Row;
    if (nav.left) this.change(row, -1);
    else if (nav.right) this.change(row, 1);
    else if (nav.up || nav.down) this.refresh();
  }

  refresh(): void {
    const s = this.settings;
    for (let i = 0; i < ROWS.length; i++) {
      const row = ROWS[i] as Row;
      this.rows.get(row)?.classList.toggle('is-focus', i === this.focus);
      const v = this.values.get(row);
      if (!v) continue;
      if (row === 'music' || row === 'effects') {
        v.textContent = String(s[row]);
        v.style.setProperty('--fill', `${s[row] * 10}%`);
        v.classList.add('is-volume');
      } else if (row === 'quality') {
        v.textContent = s.quality.toUpperCase();
      } else {
        v.textContent = s.radarNorth ? 'NORTH UP' : 'TURNS';
      }
    }
  }

  private change(row: Row, by: number): void {
    const s = this.settings;
    if (row === 'music' || row === 'effects') s[row] = Math.max(0, Math.min(10, s[row] + by));
    else if (row === 'quality') s.quality = QUALITY_SETTINGS[(QUALITY_SETTINGS.indexOf(s.quality) + by + QUALITY_SETTINGS.length) % QUALITY_SETTINGS.length] ?? 'auto';
    else s.radarNorth = !s.radarNorth;
    this.refresh();
    this.changed();
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
