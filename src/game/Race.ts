import * as THREE from 'three';
import { AIDriver, Neighbor } from '../car/AIDriver';
import {
  CarInput,
  CarState,
  createCarState,
  forwardX,
  forwardZ,
  neutralInput,
  speedOf,
  stepCar,
} from '../car/Car';
import { ImpactInfo, resolveCarPair, resolveWall } from '../car/collisions';
import { WheelInput } from '../car/WheelInput';
import { applyHandReward, RewardTarget } from '../cards/applyReward';
import { CardSystem } from '../cards/CardSystem';
import { applyCrashPenalty } from '../cards/crashPenalty';
import { BOXES } from '../config/cardConfig';
import { CarStats, DEFAULT_CAR_STATS, makeRivalStats, PHYSICS } from '../config/carStats';
import { TABLE_DOM } from '../config/cabinConfig';
import { HAND_ORDER, HAND_REWARDS, describeReward } from '../config/rewards';
import { AI_CONFIG, EFFECTS, GAME, MIRROR, PLAYER_COLOR, RIVALS } from '../config/gameConfig';
import { AudioEngine } from '../core/audio';
import { Keyboard } from '../core/input';
import { clamp, wrapAngle } from '../core/math';
import { Rng, randomSeed } from '../core/rng';
import { SaveData } from '../core/save';
import { CardBoxes } from '../fx/CardBoxes';
import { OilSlicks } from '../fx/OilSlicks';
import { Particles } from '../fx/Particles';
import { buildCabin, Cabin } from '../scene/Cabin';
import { buildCarMesh, CarMesh } from '../scene/CarMesh';
import { CameraRig } from '../scene/CameraRig';
import { World } from '../scene/World';
import { CardTableUI } from '../ui/CardTableUI';
import { HUD, MinimapDot, NameTag } from '../ui/HUD';
import { FinishRow, FinishScreen, PauseOverlay, payoutFor } from '../ui/screens';
import { Track, TrackLocation, newLocation, newTrackPoint } from '../track/Track';

type Phase = 'countdown' | 'racing' | 'done';

interface Racer {
  id: number;
  name: string;
  color: number;
  isPlayer: boolean;
  state: CarState;
  stats: CarStats;
  input: CarInput;
  loc: TrackLocation;
  prev: { x: number; z: number; heading: number };
  ai: AIDriver | null;
  mesh: CarMesh | null;
  total: number;
  prevS: number;
  finished: boolean;
  finishTime: number;
  rank: number;
  stuckTimer: number;
  oilCooldown: number;
  skill: number;
}

export interface RaceDeps {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  audio: AudioEngine;
  /** Called when the player leaves the race. */
  onExit: (action: 'again' | 'menu') => void;
}

const STEP = 1 / GAME.physicsHz;

/**
 * One race session: world, cars, AI, cards, effects, HUD. Owns the fixed-step simulation and
 * hooks every system together. Dispose() releases everything.
 */
export class Race implements RewardTarget {
  readonly world: World;
  readonly track: Track;
  readonly cards: CardSystem;
  private readonly rng: Rng;
  private readonly keyboard = new Keyboard();
  private readonly cabin: Cabin;
  private readonly cameraRig: CameraRig;
  private readonly mirrorTarget: THREE.WebGLRenderTarget;
  private readonly mirrorCamera: THREE.PerspectiveCamera;
  private frameCounter = 0;
  private readonly wheel: WheelInput;
  private readonly hud: HUD;
  private readonly cardUI: CardTableUI;
  private readonly pauseUI: PauseOverlay;
  private readonly finishUI: FinishScreen;
  private readonly particles = new Particles();
  private readonly oil = new OilSlicks();
  private readonly boxes: CardBoxes;
  private readonly racers: Racer[] = [];
  readonly player: Racer;

  private phase: Phase = 'countdown';
  private paused = false;
  private accumulator = 0;
  private countdownTimer: number;
  private lastCountdownShown = -1;
  private raceTime = 0;
  private clock = 0;
  private finishShownAt = -1;
  private finishPending = false;
  private disposed = false;

  // Player effect state
  private dropOilTime = 0;
  private oilDropTimer = 0;
  private slowRivalsTime = 0;
  private lastHardCrash = -10;
  private lastScrapeSfx = -10;
  private lastDeniedToast = -10;
  private lastResetTime = -10;
  private oilToastTime = -10;

  private readonly tmpV = new THREE.Vector3();
  private readonly proj = { x: 0, y: 0 };
  private dropLineY = 0;
  private readonly pt = newTrackPoint();
  private readonly onResize = (): void => this.resize();
  private readonly onVisibility = (): void => {
    if (document.hidden && this.phase !== 'done') this.setPaused(true);
  };

  constructor(private readonly deps: RaceDeps) {
    const seed = randomSeed();
    this.rng = new Rng(seed ^ 0xa5a5a5a5);
    this.world = new World(seed);
    this.track = this.world.track;
    this.countdownTimer = GAME.countdownSeconds + 0.8;

    // ---- Rear-view mirror render target + camera
    this.mirrorTarget = new THREE.WebGLRenderTarget(MIRROR.width, MIRROR.height);
    this.mirrorTarget.texture.wrapS = THREE.RepeatWrapping;
    this.mirrorTarget.texture.repeat.x = -1; // a mirror image is horizontally flipped
    this.mirrorTarget.texture.offset.x = 1;
    this.mirrorCamera = new THREE.PerspectiveCamera(MIRROR.fov, MIRROR.width / MIRROR.height, 0.6, MIRROR.far);
    this.mirrorCamera.position.set(0, 1.35, 0.9);
    this.mirrorCamera.rotation.y = Math.PI; // looks backwards

    // ---- Cabin + camera
    this.cabin = buildCabin(MIRROR.enabled ? this.mirrorTarget.texture : undefined);
    this.cabin.root.add(this.mirrorCamera);
    this.world.scene.add(this.cabin.root);
    this.cameraRig = new CameraRig(window.innerWidth / window.innerHeight);
    this.cabin.root.add(this.cameraRig.camera);

    // ---- Wheel input
    this.wheel = new WheelInput(deps.canvas, this.cameraRig.camera, this.cabin.wheelHit, this.cabin.wheelCenter);
    this.wheel.attach();

    // ---- Cards
    this.cards = new CardSystem(this.rng);
    this.boxes = new CardBoxes(this.track, this.rng);
    this.world.scene.add(this.boxes.group, this.oil.mesh, this.particles.points);

    // ---- UI
    this.hud = new HUD(deps.uiRoot);
    this.hud.setTrack(this.track);
    this.cardUI = new CardTableUI(deps.uiRoot, this.cards, {
      onPlay: () => this.playSelectedCards(),
      getDropLineY: () => this.dropLineY,
      onSelectSound: (on) => deps.audio.cardSelect(on),
      onDiscardSound: () => deps.audio.discard(),
    });
    this.pauseUI = new PauseOverlay(
      deps.uiRoot,
      () => this.setPaused(false),
      () => this.exit('menu'),
    );
    this.finishUI = new FinishScreen(deps.uiRoot);

    // ---- Racers
    this.player = this.createRacers();

    // ---- Input hooks
    this.keyboard.attach();
    this.keyboard.onPress('Escape', () => {
      if (this.phase !== 'done') this.setPaused(!this.paused);
    });
    this.keyboard.onPress('KeyR', () => this.resetPlayer());
    this.keyboard.onPress('KeyM', () => {
      const muted = this.deps.audio.toggleMute();
      this.hud.toast(muted ? 'Sound off' : 'Sound on', 'info', 900);
    });
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    // Opening hand, dealt as the race starts
    this.cards.deal();
    this.cardUI.setEnabled(false);
    this.deps.audio.startRaceSounds();

    this.resize();
    this.updateVisuals(0, 1);
  }

  // ------------------------------------------------------------------ setup

  private createRacers(): Racer {
    const L = this.track.length;
    const slots: Array<{ s: number; lat: number }> = [];
    for (let i = 0; i < GAME.rivalCount + 1; i++) {
      const row = Math.floor(i / 2);
      slots.push({ s: L - 10 - row * 11, lat: i % 2 === 0 ? -3.6 : 3.6 });
    }
    const lanes = this.rng.shuffle([...AI_CONFIG.laneOffsets]);
    const skills: number[] = [];
    for (let i = 0; i < GAME.rivalCount; i++) {
      skills.push(AI_CONFIG.skillMin + ((AI_CONFIG.skillMax - AI_CONFIG.skillMin) * i) / Math.max(1, GAME.rivalCount - 1));
    }
    this.rng.shuffle(skills);

    let rivalIdx = 0;
    let player!: Racer;
    for (let i = 0; i < slots.length; i++) {
      const isPlayer = i === GAME.playerGridSlot;
      const slot = slots[i];
      const state = createCarState();
      this.track.pointAt(slot.s, slot.lat, this.pt);
      state.x = this.pt.x;
      state.z = this.pt.z;
      state.heading = this.pt.heading;

      const loc = newLocation();
      this.track.locate(state.x, state.z, Math.floor(slot.s / this.track.spacing), loc);

      const rival = isPlayer ? null : RIVALS[rivalIdx % RIVALS.length];
      const skill = isPlayer ? 1 : skills[rivalIdx];
      const racer: Racer = {
        id: i,
        name: rival ? rival.name : 'You',
        color: rival ? rival.color : PLAYER_COLOR,
        isPlayer,
        state,
        stats: isPlayer ? DEFAULT_CAR_STATS : makeRivalStats(skill),
        input: neutralInput(),
        loc,
        prev: { x: state.x, z: state.z, heading: state.heading },
        ai: isPlayer ? null : new AIDriver(lanes[rivalIdx], skill, (i + 1) * 7919),
        mesh: null,
        total: slot.s - L,
        prevS: loc.s,
        finished: false,
        finishTime: 0,
        rank: i + 1,
        stuckTimer: 0,
        oilCooldown: 0,
        skill,
      };
      if (!isPlayer) {
        racer.mesh = buildCarMesh(racer.color);
        this.world.scene.add(racer.mesh.root);
        rivalIdx++;
      } else {
        player = racer;
      }
      this.racers.push(racer);
    }
    return player;
  }

  // ------------------------------------------------------------------ public control

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    if (this.paused === p || this.disposed) return;
    this.paused = p;
    this.pauseUI.show(p);
    this.wheel.release();
    this.wheel.enabled = !p && this.phase !== 'done';
    this.cardUI.setEnabled(!p && this.phase === 'racing');
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.deps.renderer.setSize(w, h, false);
    this.cameraRig.setAspect(w / h);
  }

  private exit(action: 'again' | 'menu'): void {
    this.deps.onExit(action);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deps.audio.stopRaceSounds();
    this.keyboard.detach();
    this.wheel.detach();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.cardUI.dispose();
    this.hud.dispose();
    this.pauseUI.root.remove();
    this.finishUI.root.remove();
    this.cabin.dispose();
    this.mirrorTarget.dispose();
    this.boxes.dispose();
    this.oil.dispose();
    this.particles.dispose();
    this.world.dispose();
    this.deps.canvas.style.cursor = '';
  }

  render(): void {
    const renderer = this.deps.renderer;
    // The mirror reuses the sun's shadow map, so it can only run after a main pass has created it.
    if (MIRROR.enabled && this.world.sun.shadow.map && this.frameCounter++ % MIRROR.everyNthFrame === 0) this.renderMirror();
    renderer.render(this.world.scene, this.cameraRig.camera);
  }

  /** Low-res rear view for the mirror. Reuses the sun shadow map from the previous main pass. */
  private renderMirror(): void {
    const renderer = this.deps.renderer;
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this.cabin.root.visible = false;
    renderer.setRenderTarget(this.mirrorTarget);
    renderer.render(this.world.scene, this.mirrorCamera);
    renderer.setRenderTarget(null);
    this.cabin.root.visible = true;
    renderer.shadowMap.autoUpdate = shadowAuto;
  }

  // ------------------------------------------------------------------ frame update

  update(frameDt: number): void {
    if (this.disposed) return;
    const dt = Math.min(frameDt, 0.1);
    this.clock += dt;

    if (!this.paused) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 12) {
        this.step(STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === 12) this.accumulator = 0;
    }

    const alpha = clamp(this.accumulator / STEP, 0, 1);
    this.updateVisuals(this.paused ? 0 : dt, alpha);
    this.boxes.update(this.paused ? 0 : dt);
    this.oil.update(this.clock);
    this.particles.update(this.paused ? 0 : dt);
    this.updateHud();
    this.updateAudio();
  }

  // ------------------------------------------------------------------ simulation step

  private step(dt: number): void {
    // Countdown: a short intro, then 3-2-1-GO
    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownTimer > 0) {
        const n = Math.ceil(this.countdownTimer);
        if (this.countdownTimer <= GAME.countdownSeconds && n !== this.lastCountdownShown) {
          this.lastCountdownShown = n;
          this.hud.setCountdown(String(n));
          this.deps.audio.countdown(false);
        }
      } else {
        this.phase = 'racing';
        this.hud.setCountdown('GO!');
        this.deps.audio.countdown(true);
        this.cardUI.setEnabled(true);
        window.setTimeout(() => this.hud.setCountdown(null), 900);
      }
    } else {
      this.raceTime += dt;
    }

    const racing = this.phase !== 'countdown';
    const playerTotal = this.player.total;

    // Per-racer input + physics
    for (const r of this.racers) {
      r.prev.x = r.state.x;
      r.prev.z = r.state.z;
      r.prev.heading = r.state.heading;

      this.track.locate(r.state.x, r.state.z, r.loc.index, r.loc);
      r.state.offTrack = Math.abs(r.loc.lateral) > this.track.halfWidth + 0.6;
      r.oilCooldown = Math.max(0, r.oilCooldown - dt);

      if (r.isPlayer && !r.finished) {
        this.readPlayerInput(r.input, racing);
        this.wheel.update(dt, speedOf(r.state));
      } else {
        // Rubber banding + slow effect for rivals
        if (!r.isPlayer) this.applyRubberBand(r, playerTotal);
        const neighbors = this.neighborsOf(r);
        const ai = r.ai ?? this.getFinishCruiser(r);
        ai.update(r.state, r.loc, this.track, r.stats, neighbors, dt, r.input);
        if (!racing) {
          r.input.throttle = 0;
          r.input.brake = 0;
        }
        if (r.isPlayer) this.wheel.update(dt, speedOf(r.state));
      }

      stepCar(r.state, r.input, r.stats, dt);
      this.track.locate(r.state.x, r.state.z, r.loc.index, r.loc);
      const impact = resolveWall(r.state, r.loc, this.track, r.stats, dt);
      if (impact) this.onImpact(r, impact);
      else if (r.isPlayer && Math.abs(r.loc.lateral) + r.stats.halfWidth > this.track.wallOffset - 0.2) this.scrapeEffect(r);

      this.updateProgress(r);
      this.checkStuck(r, dt);
    }

    // Car-to-car
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const hit = resolveCarPair(a.state, b.state, a.stats);
        if (hit) {
          if (a.isPlayer) this.onImpact(a, hit);
          else if (b.isPlayer) this.onImpact(b, hit);
          else if (hit.impact > PHYSICS.hardCrashSpeed) this.spawnSparks(hit.x, hit.z, 6);
        }
      }
    }

    this.updateEffects(dt);
    this.updateRanks();

    if (this.player.finished && this.finishShownAt < 0) {
      this.finishShownAt = this.clock;
      this.finishPending = true;
    }
    if (this.finishPending && this.clock - this.finishShownAt >= GAME.finishScreenDelay) {
      this.finishPending = false;
      this.showFinish();
    }
  }

  private finishCruisers = new Map<number, AIDriver>();
  private getFinishCruiser(r: Racer): AIDriver {
    let ai = this.finishCruisers.get(r.id);
    if (!ai) {
      ai = new AIDriver(0, 0.8, 4242);
      this.finishCruisers.set(r.id, ai);
    }
    return ai;
  }

  private readPlayerInput(out: CarInput, racing: boolean): void {
    const k = this.keyboard;
    out.throttle = racing && k.isDown('KeyW') ? 1 : 0;
    out.brake = racing && k.isDown('KeyS') ? 1 : 0;
    out.handbrake = racing && k.isDown('Space');
    out.steer = this.wheel.value;
  }

  private applyRubberBand(r: Racer, playerTotal: number): void {
    const gap = r.total - playerTotal; // + = rival ahead of the player
    const t = clamp(gap / AI_CONFIG.rubberDistance, -1, 1);
    // ahead -> ease off, behind -> push a little
    let scale = 1 - AI_CONFIG.rubberMax * t;
    if (this.player.finished) scale = 1;
    r.state.speedScale = scale;
  }

  private neighborsOf(r: Racer): Neighbor[] {
    const out: Neighbor[] = [];
    for (const o of this.racers) {
      if (o === r) continue;
      const ds = this.track.deltaS(r.loc.s, o.loc.s);
      if (ds > -4 && ds < 18) out.push({ ds, lateral: o.loc.lateral });
    }
    return out;
  }

  private updateProgress(r: Racer): void {
    const L = this.track.length;
    let d = r.loc.s - r.prevS;
    if (d < -L / 2) d += L;
    else if (d > L / 2) d -= L;
    r.total += d;
    r.prevS = r.loc.s;
    if (!r.finished && r.total >= GAME.laps * L) {
      r.finished = true;
      r.finishTime = this.raceTime;
      if (r.isPlayer) this.onPlayerFinished();
    }
    if (r.isPlayer) {
      const lapNow = clamp(Math.floor(r.total / L) + 1, 1, GAME.laps);
      if (lapNow > this.lastLap && !r.finished) {
        this.hud.toast(`LAP ${lapNow}/${GAME.laps}`, 'info', 1500);
        this.deps.audio.lap();
      }
      this.lastLap = Math.max(this.lastLap, lapNow);
    }
  }

  private lastLap = 1;

  private checkStuck(r: Racer, dt: number): void {
    const slow = speedOf(r.state) < 1.8;
    const racing = this.phase !== 'countdown';
    // The player only counts as stuck while actually trying to drive
    const trying = !r.isPlayer || r.input.throttle > 0 || r.input.brake > 0;
    if (slow && racing && trying && !r.finished) r.stuckTimer += dt;
    else r.stuckTimer = 0;
    if (!r.isPlayer && r.stuckTimer > AI_CONFIG.stuckSeconds) this.respawn(r);
  }

  private respawn(r: Racer): void {
    this.track.pointAt(r.loc.s + 2, 0, this.pt);
    r.state.x = this.pt.x;
    r.state.z = this.pt.z;
    r.state.heading = this.pt.heading;
    r.state.vLong = 0;
    r.state.vLat = 0;
    r.state.yawRate = 0;
    r.stuckTimer = 0;
    this.track.locate(r.state.x, r.state.z, r.loc.index, r.loc);
  }

  private resetPlayer(): void {
    if (this.paused || this.phase === 'countdown' || this.player.finished) return;
    if (this.clock - this.lastResetTime < GAME.resetCooldown) return;
    this.lastResetTime = this.clock;
    this.respawn(this.player);
    this.hud.toast('Car reset', 'info', 900);
  }

  private onPlayerFinished(): void {
    this.phase = 'done';
    this.player.state.speedScale = 0.6;
    this.wheel.release();
    this.wheel.enabled = false;
    this.cardUI.setEnabled(false);
    this.deps.audio.finish();
    this.hud.setHint(null);
  }

  private updateRanks(): void {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.total - a.total;
    });
    sorted.forEach((r, i) => (r.rank = i + 1));
  }

  // ------------------------------------------------------------------ impacts + effects

  private onImpact(r: Racer, hit: ImpactInfo): void {
    const hard = hit.impact > PHYSICS.hardCrashSpeed;
    if (hit.impact > 3) this.spawnSparks(hit.x, hit.z, Math.min(18, 4 + Math.floor(hit.impact)));
    if (!r.isPlayer) return;

    if (hit.impact > 3.5) this.cameraRig.addShake(clamp(hit.impact / 22, 0.1, 0.8));
    if (hit.impact > 3.5 && hit.impact <= PHYSICS.hardCrashSpeed) this.deps.audio.scrape();

    if (!hard || this.player.finished) return;
    if (this.clock - this.lastHardCrash < PHYSICS.hardCrashCooldown) return;
    this.lastHardCrash = this.clock;

    this.deps.audio.crash(hit.impact / 25);
    this.cameraRig.addShake(clamp(0.7 + hit.impact / 25, 0.7, 1.4));

    if (r.state.shieldTime > 0) {
      this.hud.toast('SHIELD absorbed the crash', 'good', 1400);
      this.hud.flash('good');
      return;
    }
    this.hud.flash('crash');
    const res = applyCrashPenalty(this.cards, this.rng);
    this.deps.audio.knockOff();
    if (res.from === 'hand') this.hud.toast('A card was knocked off the table!', 'bad', 1800);
    else if (res.from === 'deck') {
      this.hud.flash('deck');
      this.hud.toast('Hand empty: a card was lost from the deck!', 'bad', 2000);
    } else this.hud.toast('Crash!', 'bad', 1000);
  }

  private scrapeEffect(r: Racer): void {
    if (speedOf(r.state) < 6) return;
    if (this.clock - this.lastScrapeSfx > 0.25) {
      this.lastScrapeSfx = this.clock;
      this.deps.audio.scrape();
      this.spawnSparks(r.state.x, r.state.z, 2);
    }
  }

  private spawnSparks(x: number, z: number, count: number): void {
    const orange = new THREE.Color(0xffb347);
    const white = new THREE.Color(0xfff2c6);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 7;
      this.particles.emit(x, 0.5, z, Math.cos(a) * s, 1.5 + Math.random() * 4, Math.sin(a) * s, i % 2 ? orange : white, 0.25, 0.4 + Math.random() * 0.3, {
        gravity: 14,
        drag: 1,
      });
    }
  }

  private updateEffects(dt: number): void {
    const p = this.player;

    // Oil slicks dropped behind the player
    if (this.dropOilTime > 0) {
      this.dropOilTime = Math.max(0, this.dropOilTime - dt);
      this.oilDropTimer -= dt;
      if (this.oilDropTimer <= 0 && speedOf(p.state) > 3) {
        this.oilDropTimer = EFFECTS.oilDropInterval;
        const bx = p.state.x - forwardX(p.state.heading) * 2.6;
        const bz = p.state.z - forwardZ(p.state.heading) * 2.6;
        this.oil.spawn(bx, bz, this.clock);
      }
    }
    if (this.slowRivalsTime > 0) this.slowRivalsTime = Math.max(0, this.slowRivalsTime - dt);

    // Rivals touching oil
    for (const r of this.racers) {
      if (r.isPlayer || r.oilCooldown > 0) continue;
      if (this.oil.hits(r.state.x, r.state.z, 0.9)) {
        r.oilCooldown = EFFECTS.oilCooldownPerCar;
        r.state.vLong *= EFFECTS.oilSpeedFactor;
        r.state.oilTime = EFFECTS.oilSlipSeconds;
        r.state.yawRate += (Math.random() - 0.5) * 3.5;
        for (let i = 0; i < 6; i++) {
          this.particles.emit(r.state.x, 0.3, r.state.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 0x15131c, 0.5, 0.6, { gravity: 4, grow: 1 });
        }
        if (this.clock - this.oilToastTime > 1.5) {
          this.oilToastTime = this.clock;
          this.hud.toast(`${r.name} slipped on your oil!`, 'good', 1400);
        }
      }
    }

    // Card boxes (player only)
    if (this.phase === 'racing' && !p.finished) {
      const idx = this.boxes.findTouching(p.state.x, p.state.z);
      if (idx >= 0) this.tryPickup(idx);
    }

    // Stuck hint
    if (p.stuckTimer > GAME.stuckHintSeconds && this.phase === 'racing') this.hud.setHint('Stuck? Press R to reset the car');
    else this.hud.setHint(null);
  }

  private tryPickup(idx: number): void {
    if (this.cards.handSpace <= 0 || this.cards.drawPile.length <= 0) {
      if (this.clock - this.lastDeniedToast > 2) {
        this.lastDeniedToast = this.clock;
        this.hud.toast(this.cards.handSpace <= 0 ? 'Hand full: play or discard a card' : 'Deck is empty', 'info', 1200);
        this.deps.audio.boxDenied();
      }
      return;
    }
    this.boxes.positionOf(idx, this.tmpV);
    const bx = this.tmpV.x;
    const bz = this.tmpV.z;
    this.projectToClient(this.tmpV);
    this.cardUI.setDrawOrigin(this.proj.x, this.proj.y);
    this.boxes.collect(idx);
    const drawn = this.cards.drawFromBox(BOXES.cardsPerPickup);
    this.deps.audio.boxPickup();
    this.deps.audio.cardDraw();
    this.hud.flash('pickup');
    this.hud.toast(`+${drawn.length} card${drawn.length > 1 ? 's' : ''}`, 'gold', 1100);
    const gold = new THREE.Color(0xffd34d);
    const cream = new THREE.Color(0xfff4c4);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 4;
      const s = 2 + Math.random() * 5;
      this.particles.emit(bx, BOXES.hoverHeight, bz, Math.cos(a) * s, up, Math.sin(a) * s, i % 3 ? gold : cream, 0.35, 0.7 + Math.random() * 0.3, {
        gravity: 6,
        drag: 2,
      });
    }
  }

  // ------------------------------------------------------------------ reward target

  addMoney(amount: number): void {
    SaveData.addMoney(amount);
    this.deps.audio.money();
  }

  addNitro(seconds: number): void {
    const s = this.player.state;
    s.nitroTime = Math.min(EFFECTS.nitroMaxSeconds, s.nitroTime + seconds);
    this.deps.audio.nitro();
  }

  startOil(seconds: number): void {
    this.dropOilTime += seconds;
    this.deps.audio.oil();
  }

  addShield(seconds: number): void {
    this.player.state.shieldTime = Math.min(30, this.player.state.shieldTime + seconds);
    this.deps.audio.shield();
  }

  slowRivals(factor: number, seconds: number): void {
    this.slowRivalsTime = Math.max(this.slowRivalsTime, seconds);
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      r.state.slowFactor = 1 - factor;
      r.state.slowTime = Math.max(r.state.slowTime, seconds);
    }
    this.deps.audio.slowRivals();
  }

  private playSelectedCards(): void {
    if (this.paused || this.phase !== 'racing') return;
    const res = this.cards.playSelected();
    if (!res) return;
    const kind = res.result.kind;
    applyHandReward(kind, this);
    const strength = HAND_ORDER.indexOf(kind) / (HAND_ORDER.length - 1);
    this.deps.audio.cardPlay(strength);
    this.hud.toast(`${HAND_REWARDS[kind].label.toUpperCase()}!  ${describeReward(kind)}`, 'gold', 2400);
    this.hud.flash('good');
  }

  // ------------------------------------------------------------------ finish

  private showFinish(): void {
    const position = this.player.rank;
    const payout = payoutFor(position);
    const bank = SaveData.addMoney(payout);
    const rows: FinishRow[] = [...this.racers]
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ name: r.name, color: r.color, isPlayer: r.isPlayer, time: r.finished ? r.finishTime : null }));
    this.finishUI.show(
      position,
      payout,
      bank,
      rows,
      () => this.exit('again'),
      () => this.exit('menu'),
    );
  }

  // ------------------------------------------------------------------ visuals / HUD / audio

  private projectToClient(v: THREE.Vector3): void {
    this.tmpV.copy(v);
    const cam = this.cameraRig.camera;
    this.tmpV.project(cam);
    this.proj.x = (this.tmpV.x * 0.5 + 0.5) * window.innerWidth;
    this.proj.y = (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight;
  }

  private updateVisuals(dt: number, alpha: number): void {
    const cam = this.cameraRig.camera;

    for (const r of this.racers) {
      const x = r.prev.x + (r.state.x - r.prev.x) * alpha;
      const z = r.prev.z + (r.state.z - r.prev.z) * alpha;
      const h = r.prev.heading + wrapAngle(r.state.heading - r.prev.heading) * alpha;
      if (r.isPlayer) {
        this.cabin.root.position.set(x, 0, z);
        this.cabin.root.rotation.set(0, h, 0);
      } else if (r.mesh) {
        r.mesh.root.position.set(x, 0, z);
        r.mesh.root.rotation.y = h;
        const spin = (r.state.vLong * dt) / 0.36;
        for (const w of r.mesh.wheels) w.rotation.x -= spin;
      }
    }

    const p = this.player.state;
    this.cameraRig.update(dt, speedOf(p), DEFAULT_CAR_STATS.maxSpeed, p.accLong, p.accLat, p.nitroTime > 0);
    const wheelAngle = this.player.finished
      ? this.player.input.steer * this.wheel.maxAngle * 0.8
      : this.wheel.angle;
    this.cabin.wheelSpin.rotation.z = -wheelAngle;
    this.cabin.root.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    this.wheel.refreshProjection();

    // Card table + window drop line follow the 3D console
    this.cabin.tableLeftEdge.getWorldPosition(this.tmpV);
    this.projectToClient(this.tmpV);
    const lx = this.proj.x;
    const ly = this.proj.y;
    this.cabin.tableRightEdge.getWorldPosition(this.tmpV);
    this.projectToClient(this.tmpV);
    const span = Math.hypot(this.proj.x - lx, this.proj.y - ly);
    this.cardUI.setAnchor((lx + this.proj.x) / 2, (ly + this.proj.y) / 2, span / TABLE_DOM.width);

    this.cabin.dashEdge.getWorldPosition(this.tmpV);
    this.projectToClient(this.tmpV);
    this.dropLineY = clamp(this.proj.y, window.innerHeight * 0.3, window.innerHeight * 0.7);

    this.world.followShadow(p.x, p.z);
    cam.getWorldPosition(this.tmpV);
    this.world.sky.follow(this.tmpV);

    const maxNitro = EFFECTS.nitroMaxSeconds;
    this.cabin.updateCluster(speedOf(p) * 3.6, clamp(p.nitroTime / maxNitro, 0, 1), p.shieldTime > 0);

    this.particles.setView(cam, window.innerHeight, this.deps.renderer.getPixelRatio());
    if (dt > 0) this.emitDriftSmoke();
  }

  private emitDriftSmoke(): void {
    const pp = this.player.state;
    for (const r of this.racers) {
      const s = r.state;
      const dx = s.x - pp.x;
      const dz = s.z - pp.z;
      if (dx * dx + dz * dz > 90 * 90) continue;
      const speed = speedOf(s);
      if (speed < 6) continue;
      const smoky = s.drifting || (s.offTrack && speed > 10);
      if (!smoky || Math.random() > 0.55) continue;
      const fx = forwardX(s.heading);
      const fz = forwardZ(s.heading);
      const side = Math.random() < 0.5 ? -1 : 1;
      const px = s.x - fx * 1.3 + Math.cos(s.heading) * 0.9 * side;
      const pz = s.z - fz * 1.3 - Math.sin(s.heading) * 0.9 * side;
      const color = s.offTrack ? 0x9a8a68 : 0xdedede;
      this.particles.emit(px, 0.2, pz, (Math.random() - 0.5) * 1.2, 0.5 + Math.random(), (Math.random() - 0.5) * 1.2, color, s.offTrack ? 0.9 : 1.1, 0.9, {
        grow: 3,
        alpha: s.offTrack ? 0.5 : 0.4,
        drag: 1.5,
      });
    }
  }

  private updateHud(): void {
    const p = this.player.state;
    this.hud.update({
      position: this.player.rank,
      total: this.racers.length,
      lap: clamp(Math.floor(this.player.total / this.track.length) + 1, 1, GAME.laps),
      laps: GAME.laps,
      speedKmh: speedOf(p) * 3.6,
      money: SaveData.money,
      nitroFrac: clamp(p.nitroTime / EFFECTS.nitroMaxSeconds, 0, 1),
      nitroTime: p.nitroTime,
      shieldTime: p.shieldTime,
      oilTime: this.dropOilTime,
      slowRivalsTime: this.slowRivalsTime,
    });
    const dots: MinimapDot[] = this.racers.map((r) => ({
      x: r.state.x,
      z: r.state.z,
      color: '#' + r.color.toString(16).padStart(6, '0'),
      isPlayer: r.isPlayer,
    }));
    this.hud.updateMinimap(dots);

    // Rival name tags
    const cam = this.cameraRig.camera;
    const tags: NameTag[] = [];
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const dx = r.state.x - p.x;
      const dz = r.state.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 150) continue;
      this.tmpV.set(r.state.x, 2.2, r.state.z).project(cam);
      if (this.tmpV.z >= 1 || Math.abs(this.tmpV.x) > 1.05 || Math.abs(this.tmpV.y) > 1.05) continue;
      tags.push({
        x: (this.tmpV.x * 0.5 + 0.5) * window.innerWidth,
        y: (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight,
        name: r.name,
        color: '#' + r.color.toString(16).padStart(6, '0'),
        opacity: clamp(1.6 - dist / 100, 0, 1),
      });
    }
    this.hud.updateTags(tags);
  }

  private updateAudio(): void {
    const p = this.player.state;
    const skid = p.drifting ? clamp(p.rearSlip * 2, 0, 1) : p.offTrack ? 0.3 : 0;
    this.deps.audio.updateRaceSounds(
      Math.abs(p.vLong),
      DEFAULT_CAR_STATS.maxSpeed,
      this.player.input.throttle,
      skid,
      p.nitroTime > 0,
      this.paused,
    );
  }
}
