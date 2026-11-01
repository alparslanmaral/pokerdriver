import * as THREE from 'three';
import { GAME } from '../config/gameConfig';
import { AudioEngine } from '../core/audio';
import { enterImmersiveMode, isTouchDevice } from '../core/device';
import { SaveData } from '../core/save';
import { NetSession, sanitizeName } from '../net/NetSession';
import { StartInfo } from '../net/protocol';
import { setMaxAnisotropy } from '../scene/textures';
import { OnlineScreen } from '../ui/OnlineScreen';
import { MenuScreen } from '../ui/screens';
import { Race } from './Race';
import { Showcase } from './Showcase';

/** Top-level state machine: menu <-> (online lobby) <-> race. Owns the renderer, audio, the online session and the main loop. */
export class Game {
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly uiRoot = document.getElementById('ui')!;
  private readonly audio = new AudioEngine();
  private readonly menu: MenuScreen;
  private readonly onlineUI: OnlineScreen;
  private showcase: Showcase | null = null;
  private race: Race | null = null;
  private session: NetSession | null = null;
  private sessionOff: Array<() => void> = [];
  private last = performance.now();

  constructor() {
    document.getElementById('app')!.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GAME.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.menu = new MenuScreen(this.uiRoot, {
      onSingle: () => this.startRace(),
      onOnline: () => this.onlineUI.showChoice(),
    });
    this.onlineUI = new OnlineScreen(this.uiRoot, {
      onCreate: () => void this.createRoom(),
      onJoin: (code) => void this.joinRoom(code),
      onBack: () => this.onlineUI.hide(),
      onLeave: () => this.leaveOnline(),
      onStart: (fillAi) => this.session?.startRace(fillAi),
    });
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.showcase?.resize(window.innerWidth, window.innerHeight);
    });

    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  get currentRace(): Race | null {
    return this.race;
  }

  get onlineSession(): NetSession | null {
    return this.session;
  }

  start(): void {
    this.showMenu();
    // Invite link: ?room=CODE opens the join screen with the code filled in
    const invited = new URLSearchParams(location.search).get('room');
    if (invited) this.onlineUI.showChoice(undefined, invited);

    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.race) {
        this.race.update(dt);
        this.race.render();
      } else if (this.showcase) {
        this.showcase.update(dt);
        this.showcase.render(this.renderer);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ menu

  private showMenu(notice?: string): void {
    this.race?.dispose();
    this.race = null;
    this.ensureShowcase();
    this.menu.setMoney(SaveData.money);
    this.menu.setNotice(notice ?? null);
    this.menu.show(true);
  }

  private ensureShowcase(): void {
    if (this.showcase) return;
    this.showcase = new Showcase();
    this.showcase.resize(window.innerWidth, window.innerHeight);
  }

  private enterRaceScreen(): void {
    this.audio.init();
    this.audio.uiClick();
    if (isTouchDevice()) void enterImmersiveMode();
    this.menu.show(false);
    this.onlineUI.hide();
    this.showcase?.dispose();
    this.showcase = null;
    this.race?.dispose();
    this.race = null;
  }

  // ------------------------------------------------------------------ singleplayer

  startRace(): void {
    this.enterRaceScreen();
    this.race = new Race({
      renderer: this.renderer,
      canvas: this.canvas,
      uiRoot: this.uiRoot,
      audio: this.audio,
      onExit: (action) => {
        if (action === 'again') this.startRace();
        else this.showMenu();
      },
    });
  }

  // ------------------------------------------------------------------ online

  private playerName(): string {
    const typed = this.menu.playerName;
    return sanitizeName(typed || 'Racer');
  }

  private async createRoom(): Promise<void> {
    this.audio.init();
    this.onlineUI.showBusy('Creating room...');
    try {
      this.bindSession(await NetSession.host(this.playerName()));
      this.showLobby();
    } catch (e) {
      this.onlineUI.showChoice((e as Error).message);
    }
  }

  private async joinRoom(code: string): Promise<void> {
    this.audio.init();
    this.onlineUI.showBusy('Joining room...');
    try {
      this.bindSession(await NetSession.join(code, this.playerName()));
      this.showLobby();
    } catch (e) {
      this.onlineUI.showChoice((e as Error).message, code);
    }
  }

  private bindSession(session: NetSession): void {
    this.session = session;
    this.sessionOff = [
      session.events.on('lobby', (players) => this.onlineUI.updateLobby(players)),
      session.events.on('start', (info) => this.startOnlineRace(info)),
      session.events.on('closed', (reason) => this.leaveOnline(reason)),
    ];
  }

  private showLobby(): void {
    const s = this.session;
    if (!s) return;
    this.menu.show(false);
    this.onlineUI.showLobby({ code: s.code, isHost: s.isHost, myId: s.myId }, s.players);
  }

  private startOnlineRace(info: StartInfo): void {
    const session = this.session;
    if (!session) return;
    this.enterRaceScreen();
    this.race = new Race({
      renderer: this.renderer,
      canvas: this.canvas,
      uiRoot: this.uiRoot,
      audio: this.audio,
      online: { session, info },
      onExit: (action) => {
        if (action === 'lobby') this.returnToLobby();
        else this.leaveOnline();
      },
    });
  }

  /** Back from a finished online race to the room lobby (the connection stays open). */
  private returnToLobby(): void {
    this.race?.dispose();
    this.race = null;
    this.session?.endRace();
    this.ensureShowcase();
    this.showLobby();
  }

  /** Close the room connection and go back to the main menu. */
  private leaveOnline(notice?: string): void {
    for (const off of this.sessionOff) off();
    this.sessionOff = [];
    this.session?.close();
    this.session = null;
    this.onlineUI.hide();
    this.showMenu(notice);
  }
}
