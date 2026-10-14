import * as THREE from 'three';
import { GAME } from '../config/gameConfig';
import { AudioEngine } from '../core/audio';
import { SaveData } from '../core/save';
import { setMaxAnisotropy } from '../scene/textures';
import { MenuScreen } from '../ui/screens';
import { Race } from './Race';
import { Showcase } from './Showcase';

/** Top-level state machine: menu <-> race. Owns the renderer, audio and the main loop. */
export class Game {
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly uiRoot = document.getElementById('ui')!;
  private readonly audio = new AudioEngine();
  private readonly menu: MenuScreen;
  private showcase: Showcase | null = null;
  private race: Race | null = null;
  private last = performance.now();

  constructor() {
    document.getElementById('app')!.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GAME.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.menu = new MenuScreen(this.uiRoot, () => this.startRace());
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.showcase?.resize(window.innerWidth, window.innerHeight);
    });

    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
  }

  get currentRace(): Race | null {
    return this.race;
  }

  start(): void {
    this.showMenu();
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

  private showMenu(): void {
    this.race?.dispose();
    this.race = null;
    this.showcase?.dispose();
    this.showcase = new Showcase();
    this.showcase.resize(window.innerWidth, window.innerHeight);
    this.menu.setMoney(SaveData.money);
    this.menu.show(true);
  }

  startRace(): void {
    this.audio.init();
    this.audio.uiClick();
    this.menu.show(false);
    this.showcase?.dispose();
    this.showcase = null;
    this.race?.dispose();
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
}
