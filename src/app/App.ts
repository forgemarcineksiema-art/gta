/**
 * Wires everything together: platform → sim → renderer/audio/ui, the fixed-step
 * loop, pause rules, the autopilot and the perf probe. This is the only module
 * that knows about all layers.
 */
import { EngineAudio } from '../audio/EngineAudio';
import { Sfx } from '../audio/Sfx';
import { InputManager } from '../input/InputManager';
import { KeyboardDevice } from '../input/KeyboardDevice';
import { createPlatform, type Platform } from '../platform';
import { Renderer } from '../render/Renderer';
import { ACTIONS } from '../input/actions';
import { CAR_IDS, ECONOMY, FIXED_DT, Recorder, SimWorld, districtAt, initPhysics, type CarId, type EventLog, type RecordingJSON, TRAFFIC, PEDS, DAMAGE, SWAP } from '../sim';
import { DebugPanel } from '../ui/debugPanel';
import { Hud } from '../ui/hud';
import { BotDriver } from './bot';
import { AgentState } from '../sim/traffic/Traffic';
import { CITY_BOT_TUNING, TrackBot } from './trackBot';
import { FixedStepLoop } from './loop';
import { PerfProbe, heapMb } from './perf';
import { SimProfile } from './simProfile';

/** Filled during `App.boot`; copied into the handle for `?dev` and the startup gate. */
const bootTimings: Record<string, number> = {};

/** `?traffic=` / `?peds=` density scale. Missing or unreadable stays at 1. */
function densityParam(raw: string | null): number {
  if (raw === null) return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** Last five event kinds, oldest first. Allocates; this hook is not a frame path. */
function recentEventKinds(log: EventLog): string[] {
  const kinds: string[] = [];
  log.readFrom(Math.max(0, log.sequence - 5), (e) => kinds.push(e.kind));
  return kinds;
}

export interface GameHandle {
  started: boolean;
  /** Milliseconds since navigation start at each boot phase (perf diagnostics). */
  bootTimings: Record<string, number>;
  paused: boolean;
  sim: SimWorld;
  platformCalls: unknown;
  errors: string[];
  bot: boolean;
  version: string;
  /** The renderer, for headless probes (draw stats) and scene inspection from the console. */
  renderer: Renderer;
  roadBot: TrackBot | null;
}

declare global {
  interface Window {
    __game?: GameHandle;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const MAX_FRAME_DT = 0.25;

export class App {
  private readonly platform: Platform;
  private readonly sim: SimWorld;
  private readonly renderer: Renderer;
  private readonly input: InputManager;
  private readonly hud: Hud;
  private readonly audio: EngineAudio;
  private readonly sfx: Sfx;
  private readonly panel: DebugPanel | null;
  private readonly loop = new FixedStepLoop(FIXED_DT, 5);
  private readonly bot: BotDriver | TrackBot | null;
  private readonly perf: PerfProbe | null;
  private readonly simProfile: SimProfile | null;
  private readonly handle: GameHandle;
  private readonly hintsUntil: number;
  private lastTime = 0;
  private started = false;
  private userPaused = false;
  private focusPaused = false;
  private frameMsSmooth = 16.7;
  private stepMsLast = 0;
  private raf = 0;
  private readonly manual: boolean;

  private constructor(platform: Platform, sim: SimWorld, canvas: HTMLCanvasElement, params: URLSearchParams) {
    this.platform = platform;
    this.sim = sim;
    this.manual = params.get('manual') === '1';
    const quality = params.get('quality');
    this.renderer = new Renderer(canvas, sim, quality === 'low' || quality === 'high' ? quality : undefined);
    this.input = new InputManager();
    this.input.addDevice(new KeyboardDevice());
    this.audio = new EngineAudio();
    this.sfx = new Sfx(this.audio);
    const uiRoot = document.getElementById('ui') ?? document.body;
    this.hud = new Hud(uiRoot, sim);
    this.hud.setHints({
      throttle: this.input.label('throttle'),
      brake: this.input.label('brake'),
      steerLeft: this.input.label('steerLeft'),
      steerRight: this.input.label('steerRight'),
      handbrake: this.input.label('handbrake'),
      boost: this.input.label('boost'),
      reset: this.input.label('reset'),
      pause: this.input.label('pause'),
      camera: this.input.label('camera'),
      debug: this.input.label('debug'),
      swap: this.input.label('swap'),
    });
    this.hintsUntil = performance.now() + 12000;

    const dev = params.get('dev') === '1';
    this.panel = new DebugPanel(uiRoot, sim, {
      spawnAt: (name) => sim.spawnAt(name),
      refillBoost: () => (sim.vehicle.boostMeter = 1),
      onVehicleChange: () => sim.vehicle.applyTuning(),
      cars: CAR_IDS,
      currentCar: sim.carId,
      selectCar: (car) => {
        const url = new URL(location.href);
        url.searchParams.set('car', car);
        url.searchParams.set('dev', '1');
        location.href = url.toString();
      },
      saveRecording: () => {
        if (!sim.recorder) return;
        const json = JSON.stringify(sim.recorder.toJSON(sim.carId, sim.spawnName));
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `recording-${sim.carId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      loadGhost: (text) => {
        try {
          const rec = Recorder.fromJSON(JSON.parse(text) as RecordingJSON);
          // the ghost is the first full lap of the recording, or the whole stream when there is none
          const from = rec.lapStarts[0] ?? 0;
          const to = rec.lapStarts[1] ?? rec.ticks;
          sim.bestLapPoses = rec.slicePoses(from, to);
          this.hud.showToast('GHOST LOADED', 1.5);
        } catch (e) {
          console.warn('ghost load failed', e);
          this.hud.showToast('BAD RECORDING', 1.5);
        }
      },
      clearGhost: () => (sim.bestLapPoses = null),
      extra: {
        camera: this.renderer.chase.tuning as unknown as Record<string, number>,
        // the life numbers (docs/M3_PLAN.md §3.4): live-editable, same objects the sim reads
        traffic: TRAFFIC as unknown as Record<string, number>,
        peds: PEDS as unknown as Record<string, number>,
        economy: ECONOMY as unknown as Record<string, number>,
        damage: DAMAGE as unknown as Record<string, number>,
        swap: SWAP as unknown as Record<string, number>,
      },
    });
    this.hud.setDebugVisible(dev);
    if (dev) this.panel.setVisible(true);

    const botParam = params.get('bot');
    const botOn = botParam === '1' || botParam === 'track';
    this.bot = botOn && sim.city ? new TrackBot(sim.carId, CITY_BOT_TUNING)
      : botParam === 'track' ? new TrackBot(this.sim.carId) : botOn ? new BotDriver(Number(params.get('seed') ?? '42')) : null;
    const duration = Number(params.get('duration') ?? '0');
    // The phase profile costs five `performance.now()` calls per step, so it is
    // only installed for a measured run, never for play.
    this.simProfile = (botOn && duration > 0) || params.get('profile') === '1' ? new SimProfile() : null;
    if (this.simProfile) sim.mark = this.simProfile.mark;
    this.perf = botOn && duration > 0 ? new PerfProbe(duration, this.simProfile) : null;

    this.handle = {
      started: false,
      bootTimings: { ...bootTimings, renderer: performance.now() },
      paused: false,
      sim,
      platformCalls: (platform as unknown as { calls?: unknown }).calls,
      errors: [],
      bot: botOn,
      version: __APP_VERSION__,
      renderer: this.renderer,
      roadBot: sim.city && this.bot instanceof TrackBot ? this.bot : null,
    };
    window.__game = this.handle;
    window.render_game_to_text = () => {
      const p = sim.vehicle.body.translation();
      return JSON.stringify({
        axes: '+Y up, +Z north, +X west; metres', mode: this.paused ? 'paused' : 'driving',
        map: sim.city ? 'city' : 'playground', seed: sim.city?.seed,
        carId: sim.carId,
        damage: { value: sim.life.state.damage, stage: sim.life.state.stage, wrecked: sim.life.state.wrecked },
        traffic: sim.traffic ? { kinematic: sim.traffic.count(AgentState.Kinematic), physical: sim.traffic.count(AgentState.Physical), wrecked: sim.traffic.count(AgentState.Wrecked) } : null,
        peds: sim.peds ? { count: sim.peds.count(), hops: sim.peds.guaranteeHops } : null,
        billboards: sim.collectibles ? { smashed: sim.collectibles.smashedCount, total: sim.collectibles.total } : null,
        events: recentEventKinds(sim.events),
        trafficDensity: sim.trafficDensity,
        pedsDensity: sim.pedsDensity,
        player: { x: p.x, y: p.y, z: p.z, speedKmh: sim.vehicle.telemetry.speedKmh, boost: sim.vehicle.boostMeter },
        district: sim.city ? districtAt(p.x, p.z).name : null,
        quality: this.renderer.quality, collisionChunks: sim.city?.active.size,
        renderChunks: this.renderer.cityView?.meshes.size, lanesVisited: this.handle.roadBot?.visitedLanes.size,
        tourComplete: this.handle.roadBot?.tourComplete, resets: this.bot?.resets ?? 0, tick: sim.tick,
      });
    };
    if (this.manual) window.advanceTime = (ms) => {
      const count = Math.max(0, Math.round(ms / (FIXED_DT * 1000)));
      for (let i = 0; i < count; i++) this.frame(this.lastTime + FIXED_DT * 1000);
    };
    window.addEventListener('error', (e) => this.handle.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.handle.errors.push(String((e).reason)));

    platform.onAdEvent((event) => {
      if (event === 'adStarted') {
        this.audio.setMuted(true);
        this.input.blocked = true;
      } else {
        this.audio.setMuted(false);
        this.input.blocked = false;
      }
    });

    // CrazyGames common fixes: no page scroll from the wheel, no context menu on the canvas
    window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('blur', () => this.setFocusPaused(true));
    window.addEventListener('focus', () => this.setFocusPaused(false));
    document.addEventListener('visibilitychange', () => this.setFocusPaused(document.hidden));
    canvas.addEventListener('pointerdown', () => {
      canvas.focus();
      this.setFocusPaused(false);
    });
  }

  static async boot(canvas: HTMLCanvasElement): Promise<App> {
    const params = new URLSearchParams(location.search);
    const platform = createPlatform();
    await platform.init();
    platform.loadingStart();
    bootTimings['platform'] = performance.now();
    await initPhysics();
    bootTimings['physics'] = performance.now();
    const spawn = params.get('spawn') ?? undefined;
    const carParam = params.get('car');
    const car = (CAR_IDS as string[]).includes(carParam ?? '') ? (carParam as CarId) : undefined;
    const citySpawns = ['city', 'crown', 'foundry', 'gardens', 'marina', 'highway'];
    const map = params.get('map') === 'playground' || params.get('bot') === 'track' || (spawn && !citySpawns.includes(spawn)) ? 'playground' : 'city';
    const seed = Number(params.get('seed') ?? '42');
    const lifeOff = params.get('life') === '0';
    const traffic = lifeOff ? 0 : densityParam(params.get('traffic'));
    const peds = lifeOff ? 0 : densityParam(params.get('peds'));
    const sim = new SimWorld({
      map,
      seed: Number.isFinite(seed) ? seed : 42,
      traffic,
      peds,
      ...(spawn ? { spawn } : {}),
      ...(car ? { car } : {}),
    });
    bootTimings['sim'] = performance.now();
    const app = new App(platform, sim, canvas, params);
    platform.loadingStop();
    app.start();
    return app;
  }

  private start(): void {
    document.getElementById('loading')?.classList.add('is-hidden');
    this.lastTime = performance.now();
    if (this.manual) this.frame(this.lastTime + FIXED_DT * 1000);
    else this.raf = requestAnimationFrame(this.frame);
  }

  private heapMbCached = 0;
  private heapFrames = 0;
  /** `performance.memory` is slow to read; once every 30 frames is plenty for a readout. */
  private heapSample(): number {
    if (this.heapFrames++ % 30 === 0) this.heapMbCached = heapMb();
    return this.heapMbCached;
  }

  private get paused(): boolean {
    return this.userPaused || this.focusPaused;
  }

  private setFocusPaused(v: boolean): void {
    // automatic pause: no gameplayStop(), the platform tracks focus itself
    if (this.bot) return;
    if (this.focusPaused === v) return;
    this.focusPaused = v;
    this.hud.setPaused(this.paused, this.userPaused ? 'user' : 'focus');
    this.handle.paused = this.paused;
    if (!v) this.lastTime = performance.now();
  }

  private toggleUserPause(): void {
    this.userPaused = !this.userPaused;
    this.hud.setPaused(this.paused, 'user');
    this.handle.paused = this.paused;
    if (this.userPaused) this.platform.gameplayStop();
    else {
      this.platform.gameplayStart();
      this.lastTime = performance.now();
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.manual) this.raf = requestAnimationFrame(this.frame);
    const rawDt = Math.max(0, (now - this.lastTime) / 1000);
    const frameDt = Math.min(MAX_FRAME_DT, rawDt);
    this.lastTime = now;
    const frameStart = performance.now();

    this.input.update();
    const st = this.input.state;
    if (st.pressed.pause) this.toggleUserPause();
    if (st.pressed.debug && this.panel) {
      const v = this.panel.toggle();
      this.hud.setDebugVisible(v);
    }
    if (st.pressed.camera) this.renderer.chase.toggleMode();
    if (st.pressed.mute) this.hud.showToast(this.audio.toggleUserMute() ? 'MUTED' : 'SOUND ON', 1);

    // takedown slow motion: the fixed-step loop gets scaled time (the sim never sees wall time); any key skips it
    if (this.sim.life.state.slowMo > 0 && !this.bot) {
      for (const action of ACTIONS) if (st.pressed[action]) { this.sim.life.skipSlowMo(); break; }
    }
    const timeScale = this.sim.life.state.slowMo > 0 ? ECONOMY.slowMoScale : 1;
    let alpha = 0;
    if (!this.paused) {
      const stepStart = performance.now();
      alpha = this.loop.advance(frameDt * timeScale, () => {
        const c = this.sim.controls;
        if (this.bot) {
          this.bot.drive(this.sim, c, FIXED_DT);
        } else {
          c.throttle = st.value.throttle;
          c.brake = st.value.brake;
          c.steer = st.steer;
          c.handbrake = st.value.handbrake;
          c.boost = st.value.boost;
          if (st.pressed.reset) c.reset = true;
          if (st.pressed.swap) c.swap = true;
        }
        this.simProfile?.begin();
        this.sim.step();
        this.panel?.graphPush(this.sim.vehicle.telemetry);
      });
      this.stepMsLast = performance.now() - stepStart;
    }

    this.renderer.render(alpha, this.paused ? 0 : frameDt);
    this.audio.update(this.sim.vehicle.telemetry, frameDt);
    this.sfx.update(this.sim);

    if (!this.started) {
      // the player is in control from this frame on
      this.started = true;
      this.handle.bootTimings['firstFrame'] = performance.now();
      this.handle.started = true;
      this.platform.gameplayStart();
    }

    this.panel?.graphDraw(now);
    const frameMs = performance.now() - frameStart;
    this.frameMsSmooth += (frameMs - this.frameMsSmooth) * 0.05;
    const stats = this.renderer.stats;
    this.hud.setHintsVisible(now < this.hintsUntil && !this.bot);
    this.hud.update(
      this.sim,
      frameDt,
      {
        fps: frameDt > 0 ? 1 / frameDt : 0,
        frameMs: this.frameMsSmooth,
        stepMs: this.stepMsLast,
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
        heapMb: this.heapSample(),
        dpr: stats.dpr,
        tick: this.sim.tick,
        steps: this.loop.lastSteps,
      },
      now,
    );

    if (this.perf && !this.perf.done && this.started) {
      this.perf.frame(rawDt * 1000, this.stepMsLast, stats, this.loop.droppedTime, this.bot?.resets ?? 0);
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.sim.dispose();
  }
}
