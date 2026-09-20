/**
 * Wires everything together: platform → sim → renderer/audio/ui, the fixed-step
 * loop, pause rules, the autopilot and the perf probe. This is the only module
 * that knows about all layers.
 */
import { EngineAudio } from '../audio/EngineAudio';
import { InputManager } from '../input/InputManager';
import { KeyboardDevice } from '../input/KeyboardDevice';
import { createPlatform, type Platform } from '../platform';
import { Renderer } from '../render/Renderer';
import { FIXED_DT, SimWorld, initPhysics } from '../sim';
import { DebugPanel } from '../ui/debugPanel';
import { Hud } from '../ui/hud';
import { BotDriver } from './bot';
import { FixedStepLoop } from './loop';
import { PerfProbe, heapMb } from './perf';

export interface GameHandle {
  started: boolean;
  paused: boolean;
  sim: SimWorld;
  platformCalls: unknown;
  errors: string[];
  bot: boolean;
  version: string;
}

declare global {
  interface Window {
    __game?: GameHandle;
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
  private readonly panel: DebugPanel | null;
  private readonly loop = new FixedStepLoop(FIXED_DT, 5);
  private readonly bot: BotDriver | null;
  private readonly perf: PerfProbe | null;
  private readonly handle: GameHandle;
  private readonly hintsUntil: number;
  private lastTime = 0;
  private started = false;
  private userPaused = false;
  private focusPaused = false;
  private frameMsSmooth = 16.7;
  private stepMsLast = 0;
  private raf = 0;

  private constructor(platform: Platform, sim: SimWorld, canvas: HTMLCanvasElement, params: URLSearchParams) {
    this.platform = platform;
    this.sim = sim;
    this.renderer = new Renderer(canvas, sim);
    this.input = new InputManager();
    this.input.addDevice(new KeyboardDevice());
    this.audio = new EngineAudio();
    const uiRoot = document.getElementById('ui') ?? document.body;
    this.hud = new Hud(uiRoot);
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
    });
    this.hintsUntil = performance.now() + 12000;

    const dev = params.get('dev') === '1';
    this.panel = new DebugPanel(uiRoot, sim, {
      spawnAt: (name) => sim.spawnAt(name),
      refillBoost: () => (sim.vehicle.boostMeter = 1),
      extra: { camera: this.renderer.chase.tuning as unknown as Record<string, number> },
    });
    this.hud.setDebugVisible(dev);
    if (dev) this.panel.setVisible(true);

    const botOn = params.get('bot') === '1';
    this.bot = botOn ? new BotDriver(Number(params.get('seed') ?? '42')) : null;
    const duration = Number(params.get('duration') ?? '0');
    this.perf = botOn && duration > 0 ? new PerfProbe(duration) : null;

    this.handle = {
      started: false,
      paused: false,
      sim,
      platformCalls: (platform as unknown as { calls?: unknown }).calls,
      errors: [],
      bot: botOn,
      version: __APP_VERSION__,
    };
    window.__game = this.handle;
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
    await initPhysics();
    const spawn = params.get('spawn') ?? undefined;
    const sim = new SimWorld(spawn ? { spawn } : {});
    const app = new App(platform, sim, canvas, params);
    platform.loadingStop();
    app.start();
    return app;
  }

  private start(): void {
    document.getElementById('loading')?.classList.add('is-hidden');
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
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
    this.raf = requestAnimationFrame(this.frame);
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

    let alpha = 0;
    if (!this.paused) {
      const stepStart = performance.now();
      alpha = this.loop.advance(frameDt, () => {
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
        }
        this.sim.step();
      });
      this.stepMsLast = performance.now() - stepStart;
    }

    this.renderer.render(alpha, this.paused ? 0 : frameDt);
    this.audio.update(this.sim.vehicle.telemetry, frameDt);

    if (!this.started) {
      // the player is in control from this frame on
      this.started = true;
      this.handle.started = true;
      this.platform.gameplayStart();
    }

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
        heapMb: heapMb(),
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
