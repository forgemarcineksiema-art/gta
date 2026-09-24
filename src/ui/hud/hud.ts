/**
 * In-game HUD: plain DOM over the canvas. The corners of the driving screen
 * (DESIGN.md §17.2; `corners.ts` decides what shows): the stars, the radar,
 * the speed with the boost and the damage, the combo; the pops, the ticker,
 * a debug block, a pause overlay and the keycap hint strip. Reads sim state
 * only.
 */
import { AgentState, BALANCE, POLICE, districtAt } from '../../sim';
import type { EventKind, SimEvent, SimWorld } from '../../sim';
import { BigMap } from '../map/bigmap';
import { DRIVE, drive, hintRows, newDriveState, newPlaceClock, readDrive, screenTaken, tickPlace, type KeyHints } from './corners';
import { Minimap } from '../map/minimap';
import { HeatHud } from './heat';
import { label, num, relabel, t } from '../lang';
import { POP_SLOTS, Pops, newSaid, speak, type VoiceContext } from './voice';

export type { KeyHints } from './corners';

export interface HudDebugInfo {
  fps: number;
  frameMs: number;
  stepMs: number;
  drawCalls: number;
  triangles: number;
  heapMb: number;
  dpr: number;
  tick: number;
  steps: number;
  /** The last written save's size. */
  saveBytes: number;
}

export class Hud {
  private readonly minimap: Minimap | null;
  /** The full-screen map (M5.5 slice 15), held on a key; the radar's paths. */
  private readonly bigMap: BigMap | null;
  private readonly heat: HeatHud;
  readonly root: HTMLElement;
  /** The car's corner, bottom right: the speed, the boost, the damage. */
  private readonly speedo: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly boostFill: HTMLElement;
  private readonly boostWrap: HTMLElement;
  private readonly debug: HTMLElement;
  private readonly pause: HTMLElement;
  /** The pause screen names the mute key and the sound's state. */
  private readonly sound: HTMLElement;
  private readonly soundKey: HTMLElement;
  private readonly soundState: HTMLElement;
  private readonly hints: HTMLElement;
  private readonly toast: HTMLElement;
  /** One line at the top centre for 2 s: the heat level's news (M5.5 slice 0); the dispatch lines join in slice 4. */
  private readonly ticker: HTMLElement;
  private readonly tickerLevel: HTMLElement;
  private readonly tickerText: HTMLElement;
  private tickerLeft = 0;
  private queuedLead = '';
  private queuedText = '';
  /** Seconds since the radio last spoke: a line at most every `DISPATCH_EVERY`. */
  private dispatchQuiet = Infinity;
  private readonly lap: HTMLElement;
  private readonly lapCurrent: HTMLElement;
  private readonly lapLast: HTMLElement;
  private readonly lapBest: HTMLElement;
  private lapVisible = false;
  private debugVisible = false;
  private toastTimer = 0;
  /** The news waits while a card or the intro's caption is up (M7 slice 1). */
  private newsYield = false;
  /** The speed camera's flash: a white overlay for `flashLeft` s. */
  private readonly flash: HTMLElement;
  private flashLeft = 0;
  /** What an event's words need (DESIGN.md §17.3, `voice.ts`): the hunts' counts after the frame's finds, the cameras' limits. */
  private readonly voice: VoiceContext;
  private readonly said = newSaid();
  /** The wall or the busted card has the screen: nothing of the drive speaks over it. */
  private taken = false;
  private lastDebugAt = 0;
  private lastSpeedText = '';
  private lastBoostText = '';
  private frameIndex = 0;
  private readonly damageWrap: HTMLElement;
  /** The skill chain (M5.5 slice 14): the multiplier, the points, the last trick, the window draining. */
  private readonly skill: HTMLElement;
  private readonly skillMult: HTMLElement;
  private readonly skillPoints: HTMLElement;
  private readonly skillWord: HTMLElement;
  private readonly skillFill: HTMLElement;
  private skillSerial = -1;
  private skillShown = -1;
  private lastSkillFill = '';
  /** The corners' state and mask (M8.5 slice 1): what shows this frame; the DOM is written when a bit changes. */
  private readonly driveState = newDriveState();
  private mask = -1;
  /** The district the car is in, and seconds since it changed or a new run started: its name shows for a while. */
  private readonly place = newPlaceClock();
  private readonly damageFill: HTMLElement;
  private readonly wrecked: HTMLElement;
  private readonly wreckedSub: HTMLElement;
  /** The overlay follows the wreck itself, not only the damage stage (a wreck is not always a stage change). */
  private lastWrecked = false;
  private readonly swap: HTMLElement;
  private readonly swapKeycap: HTMLElement;
  private readonly swapLabel: HTMLElement;
  /** The candidate is a police car: the prompt says BORROW (the disguise has to be discoverable). */
  private swapBorrow = false;
  /** Under BORROW the first `chain.hintTimes` times: what the disguise does (M5.5). */
  private readonly swapHint: HTMLElement;
  private swapHintOn = false;
  private swapVisible = false;
  private lastDamageText = '';
  private lastStage = -1;
  private swapKey = 'E';
  private resetKey = 'R';
  /** The keys the hints name and the sound's state, kept to be said again in a new language. */
  private hintKeys: KeyHints | null = null;
  private muteKey = 'M';
  private muted = false;
  /** Two pops at most (DESIGN.md §17.3): `Pops` says which slot a new one takes and when each goes out. */
  private readonly popups: HTMLElement[];
  private readonly pops = new Pops();
  private eventSeq = 0;

  private lastLifeAt = 0;
  private lastLifeSeq = 0;
  private boostFlash = 0;
  private lastMeter = 0;
  /** Bound once: the event ring is polled every frame. */
  private readonly onEvent = (e: SimEvent): void => this.showEvent(e.kind, e.value, e.target);

  constructor(parent: HTMLElement, sim: SimWorld) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    this.flash = el('div', 'hud__flash');
    this.root.appendChild(this.flash);
    this.voice = {
      jumps: 0, jumpsTotal: 0, boards: 0, boardsTotal: 0, cachesTotal: sim.caches?.total ?? 0,
      cameraLimits: sim.cameras ? sim.cameras.descs.map((c) => c.limitMs * 3.6) : [],
    };
    this.minimap = sim.city ? new Minimap(this.root, sim) : null;
    this.heat = new HeatHud(this.root, sim);

    // the car's corner (DESIGN.md §17.2): no gear (the box is automatic; the debug block keeps it), no counters (a
    // find pops with its count), no ONCOMING (the combo's word says it)
    this.speedo = el('div', 'hud__speedo');
    const speedRow = el('div', 'hud__speed-row');
    this.speed = el('div', 'hud__speed', '0');
    speedRow.append(this.speed);
    const unit = label(el('div', 'hud__unit'), 'km/h');
    this.boostWrap = el('div', 'hud__boost');
    const boostLabel = label(el('div', 'hud__boost-label'), 'BOOST');
    const boostTrack = el('div', 'hud__boost-track');
    this.boostFill = el('div', 'hud__boost-fill');
    boostTrack.appendChild(this.boostFill);
    this.boostWrap.append(boostLabel, boostTrack);
    this.speedo.append(speedRow, unit, this.boostWrap);
    this.damageWrap = el('div', 'hud__damage');
    const damageTrack = el('div', 'hud__damage-track');
    this.damageFill = el('div', 'hud__damage-fill');
    damageTrack.appendChild(this.damageFill);
    this.damageWrap.append(label(el('div', 'hud__damage-label'), 'DAMAGE'), damageTrack);
    this.speedo.append(this.damageWrap);
    this.root.appendChild(this.speedo);
    this.wrecked = el('div', 'hud__wrecked');
    this.wreckedSub = el('div', 'hud__wrecked-sub', '');
    this.wrecked.append(label(el('div', 'hud__wrecked-title'), 'WRECKED'), this.wreckedSub);
    this.root.appendChild(this.wrecked);
    this.swap = el('div', 'hud__swap');
    this.swapKeycap = el('kbd', 'key', 'E');
    this.swapLabel = el('span', 'hud__swap-label', t('SWAP'));
    this.swapHint = el('div', 'hud__swap-hint', t("COPS WON'T KNOW YOU · {s} s", { s: POLICE.disguise.seconds }));
    this.swap.append(this.swapKeycap, this.swapLabel, this.swapHint);
    this.root.appendChild(this.swap);
    const stack = el('div', 'hud__popups');
    this.popups = Array.from({ length: POP_SLOTS }, () => {
      const popup = el('div', 'hud__popup');
      stack.appendChild(popup);
      return popup;
    });
    this.root.appendChild(stack);

    this.skill = el('div', 'hud__skill');
    this.skillMult = el('span', 'hud__skill-mult', '×1');
    this.skillPoints = el('span', 'hud__skill-points', '0');
    this.skillWord = el('span', 'hud__skill-word', '');
    const skillTrack = el('div', 'hud__skill-track');
    this.skillFill = el('div', 'hud__skill-fill');
    skillTrack.appendChild(this.skillFill);
    const skillRow = el('div', 'hud__skill-row');
    skillRow.append(this.skillMult, this.skillPoints, this.skillWord);
    this.skill.append(skillRow, skillTrack);
    this.root.appendChild(this.skill);


    this.debug = el('pre', 'hud__debug');
    this.root.appendChild(this.debug);

    this.pause = el('div', 'hud__pause');
    // the build stamp: which build is on screen (package version + commit, `-dirty` if uncommitted)
    this.sound = el('div', 'hud__pause-sound');
    this.soundKey = el('kbd', 'key', 'M');
    this.soundState = el('span', 'hud__pause-sound-state', t('SOUND ON'));
    this.sound.append(this.soundKey, this.soundState);
    this.pause.append(label(el('div', 'hud__pause-title'), 'PAUSED'), el('div', 'hud__pause-sub', ''), this.sound, el('div', 'hud__pause-build', `build ${__APP_VERSION__}`));
    this.root.appendChild(this.pause);

    this.hints = el('div', 'hud__hints');
    this.root.appendChild(this.hints);
    // over every layer of the UI while held (the job line, the cards and the run's layer are siblings of the HUD)
    this.bigMap = this.minimap ? new BigMap(parent, sim, this.minimap.paths) : null;

    this.toast = el('div', 'hud__toast');
    this.root.appendChild(this.toast);
    this.ticker = el('div', 'hud__ticker');
    this.tickerLevel = el('span', 'hud__ticker-level', '');
    this.tickerText = el('span', 'hud__ticker-text', '');
    this.ticker.append(this.tickerLevel, this.tickerText);
    this.root.appendChild(this.ticker);

    this.lap = el('div', 'hud__lap');
    this.lapCurrent = el('div', 'hud__lap-current', '--:--.--');
    const rowLast = el('div', 'hud__lap-row');
    this.lapLast = el('span', '', '--');
    rowLast.append(label(el('span', 'hud__lap-label'), 'LAST'), this.lapLast);
    const rowBest = el('div', 'hud__lap-row');
    this.lapBest = el('span', '', '--');
    rowBest.append(label(el('span', 'hud__lap-label'), 'BEST'), this.lapBest);
    this.lap.append(this.lapCurrent, rowLast, rowBest);
    this.root.appendChild(this.lap);
  }

  /** Show the lap timer (on the test track). */
  setLapVisible(v: boolean): void {
    if (v === this.lapVisible) return;
    this.lapVisible = v;
    this.lap.classList.toggle('is-visible', v);
  }

  setHints(k: KeyHints): void {
    this.hintKeys = k;
    this.hints.replaceChildren();
    for (const r of hintRows(k)) {
      const row = el('div', 'hud__hint');
      for (const key of r.keys) row.appendChild(el('kbd', 'key', key));
      row.appendChild(el('span', 'hud__hint-label', r.label));
      this.hints.appendChild(row);
    }
    const sub = this.pause.querySelector('.hud__pause-sub');
    if (sub) sub.textContent = t('press {key} to continue', { key: k.pause });
    this.swapKey = k.swap;
    this.resetKey = k.reset;
    this.bigMap?.setKey(k.map);
    this.swapKeycap.textContent = this.swapKey;
    this.wreckedSub.textContent = t('{swap} take a car  ·  {reset} respawn', { swap: this.swapKey, reset: this.resetKey });
  }

  /** The language changed (DESIGN.md §19): every word the HUD shows, said again; the app sends the keys anew first. */
  relabel(): void {
    relabel(this.root);
    if (this.hintKeys) this.setHints(this.hintKeys);
    this.setSound(this.muteKey, this.muted);
    this.swapLabel.textContent = t(this.swapBorrow ? 'BORROW' : 'SWAP');
    this.swapHint.textContent = t("COPS WON'T KNOW YOU · {s} s", { s: POLICE.disguise.seconds });
    // the combo's word on its next frame
    this.skillSerial = -1;
    this.minimap?.relabel();
    this.bigMap?.relabel();
  }

  /** The full-screen map while its key is held (the app decides when it may show). */
  setMapVisible(v: boolean): void {
    this.bigMap?.setVisible(v);
  }

  /** The mute key's label and whether the player muted the sound (the pause screen shows both). */
  setSound(key: string, muted: boolean): void {
    this.muteKey = key;
    this.muted = muted;
    this.soundKey.textContent = key;
    this.soundState.textContent = t(muted ? 'MUTED' : 'SOUND ON');
    this.sound.classList.toggle('is-muted', muted);
  }

  setHintsVisible(v: boolean): void {
    this.hints.classList.toggle('is-hidden', !v);
  }

  /** The radar north up, or turning with the car (the settings' RADAR row, M7 slice 3). */
  setRadarNorth(v: boolean): void {
    if (this.minimap) this.minimap.northUp = v;
  }

  /** The pause screen, for the settings rows (M7 slice 3). */
  get pauseElement(): HTMLElement {
    return this.pause;
  }

  /** The key hints' and the news' own elements, for the top of the screen's column (M7 slice 1). */
  get hintsElement(): HTMLElement {
    return this.hints;
  }

  get tickerElement(): HTMLElement {
    return this.ticker;
  }

  /** A card or the intro's caption has the top centre: the news waits, hidden, its clock stopped (M7 slice 1). */
  setNewsYield(v: boolean): void {
    if (v === this.newsYield) return;
    this.newsYield = v;
    this.ticker.classList.toggle('is-yield', v);
  }

  setPaused(paused: boolean, reason: 'user' | 'focus'): void {
    this.pause.classList.toggle('is-visible', paused);
    const sub = this.pause.querySelector('.hud__pause-sub');
    if (sub && paused) sub.textContent = reason === 'focus' ? t('click the game to continue') : (sub.textContent ?? '');
  }

  setDebugVisible(v: boolean): void {
    this.debugVisible = v;
    this.debug.classList.toggle('is-visible', v);
  }

  /** True while the ticker has news to show (shown, or waiting under a card or a caption). */
  get tickerShowing(): boolean {
    return this.tickerLeft > 0;
  }

  /** The ticker: a lead word (the level, in danger red) and the news, for `seconds`. */
  showTicker(lead: string, text: string, seconds = 2): void {
    this.tickerLevel.textContent = lead;
    this.tickerText.textContent = text;
    this.ticker.classList.add('is-on');
    this.tickerLeft = seconds;
  }

  /** The ticker now, or next when it is busy (a level's news keeps the top centre). */
  private ticker2(lead: string, text: string): void {
    if (this.tickerLeft > 0) {
      this.queuedLead = lead;
      this.queuedText = text;
    } else {
      this.showTicker(lead, text, 3);
    }
  }

  showToast(text: string, seconds = 1.5): void {
    this.toast.textContent = text;
    this.toast.classList.add('is-visible');
    this.toastTimer = seconds;
  }

  /** Read-only life counters for the debug block: agents by state, lent bodies, pedestrians, guarantee hops, events per second. */
  private lifeLine(sim: SimWorld, now: number): string {
    const traffic = sim.traffic;
    if (!traffic) return '';
    let lent = 0;
    for (let i = 0; i < traffic.capacity; i++) if (traffic.hasBody(i)) lent++;
    const seq = sim.events.readFrom(this.eventSeq, this.onEvent);
    this.eventSeq = seq;
    const dt = this.lastLifeAt > 0 ? (now - this.lastLifeAt) / 1000 : 0;
    const eps = dt > 0 ? (seq - this.lastLifeSeq) / dt : 0;
    this.lastLifeAt = now;
    this.lastLifeSeq = seq;
    const peds = sim.peds;
    const c = sim.collectibles;
    return `\ntraffic K ${traffic.count(AgentState.Kinematic)} P ${traffic.count(AgentState.Physical)} D ${traffic.count(AgentState.Disturbed)} W ${traffic.count(AgentState.Wrecked)} A ${traffic.count(AgentState.Abandoned)}  lent ${lent}  towed ${traffic.towedAway}  hops ${traffic.guardHops}` +
      `${peds ? `  peds ${peds.count()} hops ${peds.guaranteeHops}` : ''}  events ${eps.toFixed(1)}/s${c ? `  billboards ${c.smashedCount}/${c.total}` : ''}  slowmo ${sim.life.state.slowMo.toFixed(2)}`;
  }

  /** One event, one place, one text (DESIGN.md §17.3): `voice.ts` says where and what; this draws it. */
  private showEvent(kind: EventKind, value: number, target = -1): void {
    // the camera's flash is the picture, not a word: it fires with its caption
    if (kind === 'camera' && !this.taken) {
      this.flash.classList.add('is-on');
      this.flashLeft = 0.1;
    }
    const said = speak(kind, value, target, this.voice, this.said);
    // nothing of the drive speaks over the wall or the busted card
    if (said.where === 'none' || this.taken) return;
    if (said.where === 'top') {
      if (kind === 'dispatch') {
        // the radio: never over another line, at most every few seconds
        if (this.dispatchQuiet < DISPATCH_EVERY || this.tickerLeft > 0) return;
        this.dispatchQuiet = 0;
        this.showTicker(said.lead, said.text);
      } else if (kind === 'heatLevel') {
        // the stars' news takes the top at once: what the city sends from now on
        this.showTicker(said.lead, said.text);
      } else {
        this.ticker2(said.lead, said.text);
      }
      return;
    }
    const i = this.pops.push(said.text);
    const popup = this.popups[i];
    if (!popup) return;
    popup.textContent = said.text;
    popup.classList.toggle('is-gain', said.gain);
    popup.classList.toggle('is-big', said.big);
    popup.classList.add('is-on');
  }

  update(sim: SimWorld, dt: number, info: HudDebugInfo | null, now: number): void {
    // Every DOM write here costs style, layout and paint on the main thread. The
    // radar paints its own canvas at its own cadence, off the layout path.
    this.frameIndex++;
    // the corners (DESIGN.md §17.2): one mask for the frame; the district's name has its own clock
    const placeAge = tickPlace(this.place, sim.city ? districtAt(sim.probe.x, sim.probe.z) : null, sim.run.state, dt);
    const m = drive(readDrive(sim, placeAge, this.driveState));
    if (m !== this.mask) {
      this.mask = m;
      this.speedo.classList.toggle('is-hidden', (m & DRIVE.speed) === 0);
      this.damageWrap.classList.toggle('is-visible', (m & DRIVE.damage) !== 0);
      this.skill.classList.toggle('is-visible', (m & DRIVE.combo) !== 0);
      this.minimap?.setVisible((m & DRIVE.radar) !== 0);
      this.minimap?.setPlaceVisible((m & DRIVE.place) !== 0);
    }
    this.bigMap?.update(sim, now);
    this.minimap?.update(sim, dt, now);
    this.heat.update(sim, dt, (m & DRIVE.stars) !== 0);
    const tm = sim.vehicle.telemetry;
    const kmh = Math.round(Math.abs(tm.speedKmh));
    const speedText = String(kmh);
    if (speedText !== this.lastSpeedText) {
      this.speed.textContent = speedText;
      this.lastSpeedText = speedText;
    }
    const boostText = `scaleX(${tm.boost.toFixed(3)})`;
    if (boostText !== this.lastBoostText) { this.boostFill.style.transform = boostText; this.lastBoostText = boostText; }
    this.boostWrap.classList.toggle('is-active', tm.boosting);
    this.boostWrap.classList.toggle('is-full', tm.boost >= 0.999);
    if (tm.boost > this.lastMeter + 0.001) this.boostFlash = 0.3;
    this.lastMeter = tm.boost;
    if (this.boostFlash > 0) this.boostFlash -= dt;
    this.boostWrap.classList.toggle('is-gain', this.boostFlash > 0);
    const life = sim.life.state;
    const damageText = `scaleX(${life.damage.toFixed(3)})`;
    if (damageText !== this.lastDamageText) { this.damageFill.style.transform = damageText; this.lastDamageText = damageText; }
    if (life.stage !== this.lastStage || life.wrecked !== this.lastWrecked) {
      this.lastStage = life.stage;
      this.lastWrecked = life.wrecked;
      this.damageWrap.classList.toggle('is-danger', life.stage >= 3);
      this.damageWrap.classList.toggle('is-wrecked', life.stage >= 4);
      this.wrecked.classList.toggle('is-visible', life.wrecked);
    }
    // no swap behind a shut door or on the busted card: the controls are the break's
    // the cold open's own caption teaches the swap at the top: one prompt at a time
    const swapVisible = life.swapCandidate >= 0 && (sim.run.state === 'running' || sim.run.state === 'closing') && sim.coldOpen.caption !== 'swap';
    if (swapVisible !== this.swapVisible) {
      this.swapVisible = swapVisible;
      this.swap.classList.toggle('is-visible', swapVisible);
    }
    const borrow = swapVisible && sim.traffic?.police[life.swapCandidate] === 1;
    if (swapVisible && borrow !== this.swapBorrow) {
      this.swapBorrow = borrow;
      this.swapLabel.textContent = t(borrow ? 'BORROW' : 'SWAP');
    }
    const hint = borrow && sim.run.borrowHints <= BALANCE.chain.hintTimes;
    if (hint !== this.swapHintOn) {
      this.swapHintOn = hint;
      this.swapHint.classList.toggle('is-on', hint);
    }
    const voice = this.voice;
    voice.jumps = sim.jumps?.foundCount ?? 0;
    voice.jumpsTotal = sim.jumps?.descs.length ?? 0;
    voice.boards = sim.collectibles?.smashedCount ?? 0;
    voice.boardsTotal = sim.collectibles?.total ?? 0;
    const taken = screenTaken(sim.run.state);
    if (taken !== this.taken) {
      this.taken = taken;
      if (taken) {
        // the wall or the card takes the screen: the pops go, and a line still owed is stale by the next run
        const out = this.pops.clear();
        for (let i = 0; i < this.popups.length; i++) if ((out & (1 << i)) !== 0) this.popups[i]?.classList.remove('is-on');
        this.tickerLeft = 0;
        this.queuedText = '';
        this.ticker.classList.remove('is-on');
      }
    }
    this.eventSeq = sim.events.readFrom(this.eventSeq, this.onEvent);
    // the skill chain: shown while it runs (the corners' combo bit); the window drains under it
    const skill = sim.skill;
    if ((m & DRIVE.combo) !== 0) {
      const shown = Math.round(skill.points);
      if (skill.serial !== this.skillSerial || shown !== this.skillShown) {
        if (skill.serial !== this.skillSerial) {
          this.skillMult.textContent = `×${num(skill.multiplier)}`;
          this.skillWord.textContent = t(skill.word);
          this.skill.classList.toggle('is-max', skill.multiplier >= BALANCE.skill.maxMult);
        }
        this.skillSerial = skill.serial;
        this.skillShown = shown;
        this.skillPoints.textContent = num(shown);
      }
      const fill = `scaleX(${Math.max(0, Math.min(1, skill.left / BALANCE.skill.window)).toFixed(2)})`;
      if (fill !== this.lastSkillFill) { this.skillFill.style.transform = fill; this.lastSkillFill = fill; }
    }
    const gone = this.pops.step(dt);
    if (gone !== 0) for (let i = 0; i < this.popups.length; i++) if ((gone & (1 << i)) !== 0) this.popups[i]?.classList.remove('is-on');

    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      if (this.flashLeft <= 0) this.flash.classList.remove('is-on');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('is-visible');
    }
    if (this.tickerLeft > 0 && !this.newsYield) {
      this.tickerLeft -= dt;
      if (this.tickerLeft <= 0) {
        if (this.queuedText) {
          this.showTicker(this.queuedLead, this.queuedText, 3);
          this.queuedText = '';
        } else {
          this.ticker.classList.remove('is-on');
        }
      }
    }
    this.dispatchQuiet += dt;

    const lap = sim.lap;
    this.setLapVisible(lap.lapStartTick >= 0 || lap.best >= 0);
    if (this.lapVisible && this.frameIndex % 2 === 0) {
      this.lapCurrent.textContent = lap.current >= 0 ? fmtLap(lap.current) : '--:--.--';
      this.lapLast.textContent = lap.last >= 0 ? fmtLap(lap.last) : '--';
      this.lapBest.textContent = lap.best >= 0 ? fmtLap(lap.best) : '--';
      if (lap.justCompleted) this.showToast(t(lap.justBest ? 'BEST LAP {time}' : 'LAP {time}', { time: fmtLap(lap.last) }), 2);
    }

    if (this.debugVisible && info && now - this.lastDebugAt > 120) {
      this.lastDebugAt = now;
      this.debug.textContent =
        `fps ${info.fps.toFixed(0)}  frame ${info.frameMs.toFixed(2)} ms  step ${info.stepMs.toFixed(2)} ms  steps/frame ${info.steps}\n` +
        `draw ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(1)}k  heap ${info.heapMb.toFixed(0)} MB  dpr ${info.dpr.toFixed(2)}\n` +
        `tick ${info.tick}  t ${sim.time.toFixed(1)} s${sim.city ? `  chunks ${sim.city.active.size}  seed ${sim.city.seed}` : ''}  save ${(info.saveBytes / 1000).toFixed(1)} kB\n` +
        `speed ${tm.speedKmh.toFixed(1)} km/h  gear ${tm.gear}${tm.shifting ? '*' : ''}  rpm ${tm.rpm.toFixed(0)}  load ${tm.load.toFixed(2)}  slip ratio ${tm.minSlipRatio.toFixed(2)}..${tm.maxSlipRatio.toFixed(2)}\n` +
        `steer ${tm.steerDeg.toFixed(1)}°  slip ${tm.maxSlipDeg.toFixed(1)}°  drift ${tm.drifting ? 'YES' : 'no'} ${tm.driftAngleDeg.toFixed(0)}°\n` +
        `wheels ${tm.groundedWheels}/4  air ${tm.airTime.toFixed(2)} s  boost ${tm.boost.toFixed(2)}${tm.boosting ? ' ON' : ''}` +
        this.lifeLine(sim, now);
    }
  }
}

/** Seconds between two of the radio's lines. */
const DISPATCH_EVERY = 6;

function fmtLap(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
