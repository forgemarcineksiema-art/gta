/**
 * Wires everything together: platform → sim → renderer/audio/ui, the fixed-step
 * loop, pause rules, the autopilot and the perf probe. This is the only module
 * that knows about all layers.
 */
import { EngineAudio } from '../audio/EngineAudio';
import { Sfx } from '../audio/Sfx';
import { Siren } from '../audio/Siren';
import { InputManager } from '../input/InputManager';
import { KeyboardDevice } from '../input/KeyboardDevice';
import { createPlatform, type Platform } from '../platform';
import { Renderer } from '../render/Renderer';
import { ACTIONS, type Action } from '../input/actions';
import { CAR_IDS, ECONOMY, FIXED_DT, Recorder, SimWorld, clearControls, districtAt, initPhysics, type CarId, type EventLog, type RecordingJSON, TRAFFIC, PEDS, DAMAGE, SWAP } from '../sim';
import { DebugPanel } from '../ui/debugPanel';
import { Hud } from '../ui/hud';
import { RunHud } from '../ui/run';
import { ColdOpenHud } from '../ui/coldOpen';
import { JobsHud } from '../ui/jobs';
import { GarageUi, type GarageActions } from '../ui/garage';
import { routeToDropOff } from './doorRoute';
import { BotDriver } from './bot';
import { BotPolicy } from './botPolicy';
import { JobBot } from './jobBot';
import { AgentState } from '../sim/traffic/Traffic';
import { CITY_BOT_TUNING, TrackBot } from './trackBot';
import { FixedStepLoop } from './loop';
import { PerfProbe, heapMb } from './perf';
import { SimProfile } from './simProfile';
import { SaveStore } from './save';
import { BALANCE, POLICE, defaultSave, type SaveV1, type SimEvent } from '../sim';

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
  /** The engine audio, for the ad pins (the master gain while an ad runs). */
  audio: EngineAudio;
  /** True from an ad request at a break until the ad finished or failed. */
  adShowing: boolean;
  /** The save store (e2e: bytes, writes, the flush). */
  save: SaveStore;
}

declare global {
  interface Window {
    __game?: GameHandle;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const MAX_FRAME_DT = 0.25;
/** The wall and the busted card ignore keys this long, so a key mashed in the chase does not skip them. */
const BREAK_MIN_MS = 600;
/** Measured bot runs dismiss the wall and the card themselves after this long. */
const BREAK_AUTO_MS = 1500;
/** Any of these on the URL is a test or a dev session: no cold open unless `coldopen=1` forces it. */
const COLD_OPEN_OFF_PARAMS = ['bot', 'spawn', 'heat', 'car', 'map', 'manual', 'job'];

/** Every action ends a break except the ones that are not about driving on. */
const DISMISS: readonly Action[] = ACTIONS.filter((a) => a !== 'pause' && a !== 'mute' && a !== 'debug' && a !== 'camera');

export class App {
  private readonly platform: Platform;
  private readonly sim: SimWorld;
  private readonly renderer: Renderer;
  private readonly input: InputManager;
  private readonly hud: Hud;
  private readonly runHud: RunHud;
  private readonly coldOpenHud: ColdOpenHud;
  private readonly jobsHud: JobsHud;
  private readonly garageUi: GarageUi;
  private readonly audio: EngineAudio;
  private readonly sfx: Sfx;
  private readonly siren: Siren;
  private readonly panel: DebugPanel | null;
  private readonly loop = new FixedStepLoop(FIXED_DT, 5);
  private readonly bot: BotDriver | TrackBot | BotPolicy | JobBot | null;
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
  /** Last frame's run was being driven (running or closing): the brackets follow its edges. */
  private wasPlaying = true;
  private breakAt = 0;
  /** An ad requested at this break is still running: the break cannot be dismissed. */
  private adShowing = false;
  private readonly autoDismiss: boolean;
  /** The wall's key edges this frame, reused. */
  private readonly nav = { left: false, right: false, confirm: false, back: false };
  private readonly store: SaveStore;
  private saveCursor: number;
  /** `?date=YYYY-MM-DD` for tests and playtests; null reads the local clock. */
  private readonly fixedDate: string | null;
  /** Test sessions (a bot, manual stepping, a spawn…) keep every police site manned and draw no dailies, unless `date` is given. */
  private readonly datesOn: boolean;
  private nextDateCheck = 0;
  /** Bound once: the save's dirty marks come from the event ring. */
  private readonly onSaveEvent = (e: SimEvent): void => {
    switch (e.kind) {
      // coins are the player's for good: the throttle keeps it to one write a second while they come in
      case 'banked': case 'busted': case 'purchase': case 'dailyDone': case 'streak': case 'billboard': case 'escape': case 'coin':
        this.store.markDirty();
        break;
      default:
        break;
    }
  };

  private constructor(platform: Platform, sim: SimWorld, canvas: HTMLCanvasElement, params: URLSearchParams, store: SaveStore) {
    this.platform = platform;
    this.sim = sim;
    this.store = store;
    this.saveCursor = sim.events.sequence;
    store.bindLifecycle(window, sim);
    const date = params.get('date');
    this.fixedDate = date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    this.datesOn = this.fixedDate !== null || !COLD_OPEN_OFF_PARAMS.some((k) => params.has(k));
    // the day's three, the streak and today's police before the first step (docs/M5_PLAN.md D3)
    if (this.datesOn) sim.dailies.setDate(this.today());
    this.manual = params.get('manual') === '1';
    const quality = params.get('quality');
    this.renderer = new Renderer(canvas, sim, quality === 'low' || quality === 'high' ? quality : undefined);
    this.input = new InputManager();
    this.input.addDevice(new KeyboardDevice());
    this.audio = new EngineAudio();
    this.sfx = new Sfx(this.audio);
    this.siren = new Siren(this.audio);
    const uiRoot = document.getElementById('ui') ?? document.body;
    this.hud = new Hud(uiRoot, sim);
    this.runHud = new RunHud(uiRoot, sim);
    this.runHud.setKeys({ any: this.input.label('throttle') });
    // the garage on the wall: App is the one caller of Garage and of the rewarded ads (docs/M5_PLAN.md §3.3)
    const actions: GarageActions = {
      buy: (car) => {
        if (this.adShowing) return;
        const first = sim.garage.owned.size === 1;
        if (sim.garage.buy(car) !== 'ok') return;
        sim.garage.select(car);
        sim.garage.applyToVehicle();
        if (first) this.platform.happyTime();
      },
      select: (car) => {
        if (this.adShowing || !sim.garage.select(car)) return;
        sim.garage.applyToVehicle();
      },
      respray: (car, paint) => {
        if (this.adShowing) return;
        sim.garage.respray(car, paint);
        sim.garage.applyToVehicle();
        this.store.markDirty();
      },
      upgrade: (car, stat) => {
        if (this.adShowing || sim.garage.upgrade(car, stat) !== 'ok') return;
        sim.garage.applyToVehicle();
      },
      buyPrep: (item) => {
        if (this.adShowing) return;
        sim.garage.buyPrep(item);
      },
      offer: (kind) => this.rewarded(kind),
      driveOut: () => this.driveOut(),
    };
    this.garageUi = new GarageUi(this.runHud.wall, sim, actions);
    this.garageUi.setKeys({ left: this.input.label('steerLeft'), right: this.input.label('steerRight'), confirm: this.input.label('throttle'), back: this.input.label('brake') });
    this.coldOpenHud = new ColdOpenHud(uiRoot);
    this.jobsHud = new JobsHud(uiRoot);
    this.coldOpenHud.setKeys({
      throttle: this.input.label('throttle'),
      steerLeft: this.input.label('steerLeft'),
      brake: this.input.label('brake'),
      steerRight: this.input.label('steerRight'),
      swap: this.input.label('swap'),
      boost: this.input.label('boost'),
      skip: this.input.label('skip'),
    });
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
    this.hud.setSound(this.input.label('mute'), this.audio.isUserMuted);

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
        balance: BALANCE as unknown as Record<string, number>,
        police: POLICE as unknown as Record<string, number>,
      },
    });
    this.hud.setDebugVisible(dev);
    if (dev) this.panel.setVisible(true);

    const botParam = params.get('bot');
    const doorBot = botParam === 'door' && sim.city !== null;
    // the policies of slice 5: the road bot as a novice, or swapping and turning away as a skilled player
    const policy = (botParam === 'novice' || botParam === 'skilled') && sim.city !== null ? botParam : null;
    const jobBot = botParam === 'job' && sim.city !== null;
    const botOn = botParam === '1' || botParam === 'track' || doorBot || policy !== null || jobBot;
    this.bot = jobBot ? new JobBot(sim.carId)
      : policy ? new BotPolicy(policy, new TrackBot(sim.carId, CITY_BOT_TUNING))
      : botOn && sim.city ? new TrackBot(sim.carId, CITY_BOT_TUNING)
        : botParam === 'track' ? new TrackBot(this.sim.carId) : botOn ? new BotDriver(Number(params.get('seed') ?? '42')) : null;
    // the drive to the hideout: the road bot on a path of its own (slice 3a's e2e and measurement)
    const hideout = sim.run.dropOffs[0];
    if (doorBot && hideout && this.bot instanceof TrackBot) this.bot.setPath(routeToDropOff(sim, hideout));
    const duration = Number(params.get('duration') ?? '0');
    // Five `performance.now()` calls per step: measured runs only.
    this.simProfile = (botOn && duration > 0) || params.get('profile') === '1' ? new SimProfile() : null;
    if (this.simProfile) sim.mark = this.simProfile.mark;
    this.perf = botOn && duration > 0 ? new PerfProbe(duration, this.simProfile) : null;
    this.autoDismiss = this.perf !== null;

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
      roadBot: sim.city && this.bot instanceof TrackBot ? this.bot : this.bot instanceof BotPolicy || this.bot instanceof JobBot ? this.bot.bot : null,
      audio: this.audio,
      adShowing: false,
      save: store,
    };
    window.__game = this.handle;
    window.render_game_to_text = () => {
      const p = sim.vehicle.body.translation();
      return JSON.stringify({
        axes: '+Y up, +Z north, +X west; metres', mode: this.paused ? 'paused' : 'driving',
        map: sim.city ? 'city' : 'playground', seed: sim.city?.seed,
        carId: sim.carId,
        damage: { value: sim.life.state.damage, stage: sim.life.state.stage, wrecked: sim.life.state.wrecked },
        heat: { points: sim.heat.points, level: sim.heat.level },
        pursuit: { state: sim.pursuit.state, cooldown: sim.pursuit.cooldown, units: sim.police?.count ?? 0, escapes: sim.pursuit.escapes, swapEscapes: sim.pursuit.swapEscapes, descriptor: sim.pursuit.descriptor.kind, disguised: sim.pursuit.disguised, boxing: sim.police?.boxing ?? false },
        policy: this.bot instanceof BotPolicy ? { name: this.bot.name, swaps: this.bot.swaps, escapesBySwap: this.bot.escapesBySwap, escapesByCooldown: this.bot.escapesByCooldown, disguiseEscapes: this.bot.disguiseEscapes } : null,
        run: { state: sim.run.state, bag: sim.run.bag, bank: sim.run.bank, multiplier: sim.run.multiplier, maxHeat: sim.run.maxHeat, door: sim.run.doorProgress, busted: sim.run.bustedProgress, dropOff: sim.run.dropOffs[sim.run.dropOff]?.name ?? null, runs: sim.run.runs },
        coldOpen: { active: sim.coldOpen.active, verb: sim.coldOpen.verb, caption: sim.coldOpen.caption, done: sim.coldOpen.done },
        job: { state: sim.jobs.state, id: sim.jobs.active, kind: sim.jobs.running?.kind ?? null, remaining: sim.jobs.remaining, wanted: sim.jobs.wantedAgent, lastPaid: sim.jobs.lastPaid },
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
        this.adShowing = false;
        this.handle.adShowing = false;
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
    // the save before the world: the garage car, the bank and the seen flag are in place for the first step
    const store = new SaveStore(platform);
    let save: SaveV1;
    if (params.get('fresh') === '1') {
      await platform.clearData(BALANCE.save.key);
      save = defaultSave();
    } else {
      save = await store.load();
    }
    bootTimings['save'] = performance.now();
    const spawn = params.get('spawn') ?? undefined;
    const carParam = params.get('car');
    const car = (CAR_IDS as string[]).includes(carParam ?? '') ? (carParam as CarId) : undefined;
    const citySpawns = ['city', 'crown', 'foundry', 'gardens', 'marina', 'highway'];
    const map = params.get('map') === 'playground' || params.get('bot') === 'track' || (spawn && !citySpawns.includes(spawn)) ? 'playground' : 'city';
    const seed = Number(params.get('seed') ?? '42');
    const lifeOff = params.get('life') === '0';
    const traffic = lifeOff ? 0 : densityParam(params.get('traffic'));
    const peds = lifeOff ? 0 : densityParam(params.get('peds'));
    // the first run of a session is the cold open; the world is built at its spawn so the chunks load once
    const coldOpen = map === 'city' && coldOpenWanted(params, save);
    // forced (`coldopen=1`): shown even to a profile that has seen it
    if (coldOpen) save.seen = false;
    const sim = new SimWorld({
      map,
      seed: Number.isFinite(seed) ? seed : 42,
      traffic,
      peds,
      heat: Math.max(0, Math.min(100, Number(params.get('heat') ?? 0) * 20)),
      ...(spawn ? { spawn } : coldOpen ? { spawn: 'loop' } : {}),
      ...(car ? { car } : {}),
      save,
      coldOpen,
    });
    // the save's flag is written as it starts, so a reload never repeats it (the M4 session flag's rule)
    if (sim.coldOpen.active) void store.flush(sim);
    // `job=<id>` or `job=delivery|order|escape`: into that marker's ring at boot (tests and playtests)
    const jobParam = params.get('job');
    if (jobParam !== null && sim.city) {
      const d = sim.jobs.defs.find((k) => String(k.id) === jobParam || k.kind === jobParam);
      if (d) {
        sim.city.sync(d.x, d.z, true);
        sim.vehicle.teleport({ x: d.x, y: 0.9, z: d.z }, d.yaw);
      }
    }
    bootTimings['sim'] = performance.now();
    const app = new App(platform, sim, canvas, params, store);
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

  /**
   * The ad point of a break (docs/M4_PLAN.md slice 8, CRAZYGAMES.md A1/A3): at the door and at the busted
   * card a midgame ad, input blocked from the request until it finishes or fails (the ad events unblock and
   * unmute), the break held open meanwhile. Never at the first door of a session (it ends the cold open),
   * never a request when the platform has no ad to give.
   */
  private adBreak(firstDoor: boolean): void {
    if (firstDoor || !this.platform.adsAvailable('midgame')) return;
    this.adShowing = true;
    this.handle.adShowing = true;
    this.input.blocked = true;
    void this.platform.requestAd('midgame').then(() => {
      // the events have already restored input and sound; a platform that emitted nothing still lets go here
      this.adShowing = false;
      this.handle.adShowing = false;
      this.input.blocked = false;
      this.breakAt = performance.now();
    });
  }

  /** The local date as `YYYY-MM-DD` (the sim never reads a clock), or the `date` parameter. */
  private today(): string {
    if (this.fixedDate) return this.fixedDate;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * The door shut (docs/M5_PLAN.md D10): at most one ad per door and none at the session's first. With a bag
   * above the threshold and a rewarded ad to give, the wall offers DOUBLE THE BAG beside BANK IT; otherwise
   * the midgame request fires once as the totals appear. The garage car stands behind the door.
   */
  private openWall(): void {
    const run = this.sim.run;
    const rewarded = this.platform.adsAvailable('rewarded');
    const offer = !run.firstDoor && rewarded && run.lastBag > BALANCE.offer.doorThreshold;
    this.sim.garage.applyToVehicle();
    this.garageUi.setAdsAvailable(rewarded);
    this.garageUi.open({ offer });
    if (!offer) this.adBreak(run.firstDoor);
  }

  /** The wall's DRIVE OUT: the garage car, the door up, a new run; the save written. */
  private driveOut(): void {
    const run = this.sim.run;
    if (run.state !== 'door' || this.adShowing) return;
    this.sim.garage.applyToVehicle();
    run.openDoor();
    this.garageUi.close();
    void this.store.flush(this.sim);
  }

  /**
   * A rewarded video for the door's double or a prep item (CRAZYGAMES.md A5–A8, A12): input blocked from the
   * request, the sound cut only by `adStarted`, the reward only on a finished ad, nothing on an error, and the
   * cash path stays. The double is answered either way: one video per reward, never a second ask.
   */
  private rewarded(kind: 'lawyer' | 'fence' | 'double'): void {
    if (this.adShowing || !this.platform.adsAvailable('rewarded')) return;
    // nothing to win: an item already bought for the next run
    if (kind !== 'double' && this.sim.garage.prep[kind]) return;
    this.adShowing = true;
    this.handle.adShowing = true;
    this.input.blocked = true;
    void this.platform.requestAd('rewarded').then((result) => {
      this.adShowing = false;
      this.handle.adShowing = false;
      this.input.blocked = false;
      this.breakAt = performance.now();
      if (result.status === 'finished') {
        if (kind === 'double') this.sim.run.doubleLastBag();
        else this.sim.garage.grantPrep(kind);
        this.store.markDirty();
      }
      if (kind === 'double') this.garageUi.offerSettled();
    });
  }

  private toggleUserPause(): void {
    this.userPaused = !this.userPaused;
    this.hud.setPaused(this.paused, 'user');
    this.handle.paused = this.paused;
    // behind a shut door or a busted card the game is already on a break: no second bracket
    const driving = this.sim.run.state === 'running' || this.sim.run.state === 'closing';
    if (this.userPaused) {
      if (driving) this.platform.gameplayStop();
    } else {
      if (driving) this.platform.gameplayStart();
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
    if (st.pressed.mute) {
      const muted = this.audio.toggleUserMute();
      this.hud.showToast(muted ? 'MUTED' : 'SOUND ON', 1);
      this.hud.setSound(this.input.label('mute'), muted);
    }
    if (st.pressed.skip && this.sim.coldOpen.active) {
      this.sim.coldOpen.skip();
      this.store.markDirty();
    }

    // takedown slow motion: the fixed-step loop gets scaled time (the sim never sees wall time); any key skips it
    if (this.sim.life.state.slowMo > 0 && !this.bot) {
      for (const action of ACTIONS) if (st.pressed[action]) { this.sim.life.skipSlowMo(); break; }
    }
    // behind the shut door the wall has the keys; on the busted card any driving key drives on
    const run = this.sim.run;
    if ((run.state === 'door' || run.state === 'busted') && !this.paused && !this.adShowing) {
      const shown = now - this.breakAt;
      if (this.autoDismiss && shown > BREAK_AUTO_MS) {
        if (run.state === 'door') this.driveOut();
        else run.closeCard();
      } else if (!this.bot && shown > BREAK_MIN_MS) {
        if (run.state === 'door') {
          this.nav.left = st.pressed.steerLeft;
          this.nav.right = st.pressed.steerRight;
          this.nav.confirm = st.pressed.throttle;
          this.nav.back = st.pressed.brake;
          this.garageUi.navigate(this.nav);
        } else {
          for (const action of DISMISS) if (st.pressed[action]) { run.closeCard(); break; }
        }
      }
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
        // the car idles behind a shut door and waits out the card
        if (this.sim.run.state === 'door' || this.sim.run.state === 'busted') clearControls(c);
        this.simProfile?.begin();
        this.sim.step();
        this.panel?.graphPush(this.sim.vehicle.telemetry);
      });
      this.stepMsLast = performance.now() - stepStart;
    }

    // the platform's brackets follow the run: a shut door and a busted card are game-made breaks
    const playing = run.state === 'running' || run.state === 'closing';
    if (this.started && this.wasPlaying && !playing) {
      this.platform.gameplayStop();
      this.breakAt = now;
      // the totals are final: the door's bank and the card's fine are written at once
      void this.store.flush(this.sim);
      if (run.state === 'door') this.openWall();
      else this.adBreak(false);
    } else if (this.started && !this.wasPlaying && playing) {
      // the door opened (the wall's drive-out or a test hook): the wall is gone
      this.garageUi.close();
      this.platform.gameplayStart();
    }
    this.wasPlaying = playing;

    // midnight is a string compare: the date goes in once a minute
    if (this.datesOn && now >= this.nextDateCheck) {
      this.nextDateCheck = now + 60_000;
      this.sim.dailies.setDate(this.today());
    }
    this.saveCursor = this.sim.events.readFrom(this.saveCursor, this.onSaveEvent);
    this.store.tick(this.sim, frameDt);

    this.renderer.render(alpha, this.paused ? 0 : frameDt);
    this.audio.update(this.sim.vehicle.telemetry, frameDt);
    this.sfx.update(this.sim);
    this.siren.update(this.sim, this.paused ? 0 : frameDt);

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
    // the cold open's captions sit where the hints do and teach the same keys
    // the hints are for driving: behind a shut door or under the card the wall and the card have the keys
    this.hud.setHintsVisible(now < this.hintsUntil && !this.bot && !this.sim.coldOpen.active && !this.jobsHud.showing && playing);
    this.runHud.update(this.sim, frameDt);
    this.coldOpenHud.update(this.sim);
    this.jobsHud.update(this.sim, frameDt);
    this.garageUi.update(this.sim);
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
        saveBytes: this.store.bytes,
      },
      now,
    );

    // an ad's frames are a break's, not the game's: the probe measures play
    if (this.perf && !this.perf.done && this.started && !this.adShowing) {
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

/** The cold open runs on a plain load until the save has seen it; `coldopen=1` forces it, `coldopen=0` and test parameters turn it off. */
function coldOpenWanted(params: URLSearchParams, save: SaveV1): boolean {
  const forced = params.get('coldopen');
  if (forced === '1') return true;
  if (forced === '0') return false;
  if (COLD_OPEN_OFF_PARAMS.some((k) => params.has(k))) return false;
  return !save.seen;
}
