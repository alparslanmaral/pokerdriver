import { Track } from '../track/Track';
import { el, formatMoney } from './dom';

export interface HudState {
  position: number;
  total: number;
  lap: number;
  laps: number;
  speedKmh: number;
  money: number;
  nitroFrac: number;
  nitroTime: number;
  shieldTime: number;
  oilTime: number;
  slowRivalsTime: number;
}

export interface MinimapDot {
  x: number;
  z: number;
  color: string;
  isPlayer: boolean;
}

export interface NameTag {
  x: number;
  y: number;
  name: string;
  color: string;
  opacity: number;
}

export type ToastKind = 'info' | 'good' | 'bad' | 'gold';
export type FlashKind = 'crash' | 'deck' | 'pickup' | 'good';

/** In-race DOM heads-up display. */
export class HUD {
  readonly root: HTMLElement;
  private posEl: HTMLElement;
  private lapEl: HTMLElement;
  private speedEl: HTMLElement;
  private moneyEl: HTMLElement;
  private nitroFill: HTMLElement;
  private chips: HTMLElement;
  private toasts: HTMLElement;
  private countdownEl: HTMLElement;
  private flashEl: HTMLElement;
  private nitroFx: HTMLElement;
  private shieldFx: HTMLElement;
  private hintEl: HTMLElement;
  private tagLayer: HTMLElement;
  private tags: HTMLElement[] = [];
  private minimap: HTMLCanvasElement;
  private minimapBase: HTMLCanvasElement | null = null;
  private mapBounds = { minX: 0, minZ: 0, scale: 1, offX: 0, offZ: 0 };
  private lastMoney = -1;
  private cache = new Map<string, string>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.nitroFx = el('div', 'fx-nitro', this.root);
    this.shieldFx = el('div', 'fx-shield', this.root);
    this.flashEl = el('div', 'fx-flash', this.root);
    this.tagLayer = el('div', 'tag-layer', this.root);

    const tl = el('div', 'hud-tl', this.root);
    const posWrap = el('div', 'hud-pos', tl);
    this.posEl = el('span', 'hud-pos-n', posWrap, '1');
    el('span', 'hud-pos-t', posWrap, '/6');
    this.lapEl = el('div', 'hud-lap', tl, 'LAP 1/3');
    this.chips = el('div', 'chips', tl);

    const tr = el('div', 'hud-tr', this.root);
    this.moneyEl = el('div', 'hud-money', tr, '$0');
    this.minimap = el('canvas', 'minimap', tr);
    this.minimap.width = 160;
    this.minimap.height = 160;

    const br = el('div', 'hud-br', this.root);
    const speedRow = el('div', 'hud-speed', br);
    this.speedEl = el('span', 'hud-speed-n', speedRow, '0');
    el('span', 'hud-speed-u', speedRow, 'km/h');
    const bar = el('div', 'nitro-bar', br);
    el('span', 'nitro-label', bar, 'NITRO');
    const track = el('div', 'nitro-track', bar);
    this.nitroFill = el('div', 'nitro-fill', track);

    this.toasts = el('div', 'toasts', this.root);
    this.countdownEl = el('div', 'countdown', this.root);
    this.hintEl = el('div', 'hint', this.root);
    this.hintEl.style.display = 'none';
  }

  private setText(key: string, node: HTMLElement, text: string): void {
    if (this.cache.get(key) === text) return;
    this.cache.set(key, text);
    node.textContent = text;
  }

  update(s: HudState): void {
    this.setText('pos', this.posEl, String(s.position));
    (this.posEl.nextElementSibling as HTMLElement).textContent = `/${s.total}`;
    this.setText('lap', this.lapEl, `LAP ${Math.min(s.lap, s.laps)}/${s.laps}`);
    this.setText('speed', this.speedEl, String(Math.round(s.speedKmh)));
    if (s.money !== this.lastMoney) {
      if (this.lastMoney >= 0) {
        this.moneyEl.classList.remove('pop');
        void this.moneyEl.offsetWidth;
        this.moneyEl.classList.add('pop');
      }
      this.lastMoney = s.money;
      this.moneyEl.textContent = formatMoney(s.money);
    }
    this.nitroFill.style.width = `${Math.round(s.nitroFrac * 100)}%`;
    this.nitroFx.style.opacity = s.nitroTime > 0 ? '1' : '0';
    this.shieldFx.style.opacity = s.shieldTime > 0 ? '1' : '0';

    const chips: string[] = [];
    if (s.nitroTime > 0) chips.push(`<span class="chip nitro">NITRO ${s.nitroTime.toFixed(1)}s</span>`);
    if (s.shieldTime > 0) chips.push(`<span class="chip shield">SHIELD ${s.shieldTime.toFixed(1)}s</span>`);
    if (s.oilTime > 0) chips.push(`<span class="chip oil">OIL ${s.oilTime.toFixed(1)}s</span>`);
    if (s.slowRivalsTime > 0) chips.push(`<span class="chip slow">RIVALS SLOWED ${s.slowRivalsTime.toFixed(1)}s</span>`);
    const html = chips.join('');
    if (this.cache.get('chips') !== html) {
      this.cache.set('chips', html);
      this.chips.innerHTML = html;
    }
  }

  toast(text: string, kind: ToastKind = 'info', durationMs = 2000): void {
    const t = el('div', `toast ${kind}`, this.toasts, text);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add('out'), durationMs);
    window.setTimeout(() => t.remove(), durationMs + 400);
  }

  flash(kind: FlashKind): void {
    this.flashEl.className = 'fx-flash';
    void this.flashEl.offsetWidth;
    this.flashEl.className = `fx-flash on ${kind}`;
  }

  setCountdown(text: string | null): void {
    if (text === null) {
      this.countdownEl.textContent = '';
      this.countdownEl.classList.remove('on');
      return;
    }
    if (this.countdownEl.textContent !== text) {
      this.countdownEl.textContent = text;
      this.countdownEl.classList.remove('on');
      void this.countdownEl.offsetWidth;
      this.countdownEl.classList.add('on');
    }
  }

  setHint(text: string | null): void {
    if (text === null) {
      this.hintEl.style.display = 'none';
      return;
    }
    this.hintEl.style.display = '';
    this.hintEl.textContent = text;
  }

  /** Pre-render the circuit outline once. */
  setTrack(track: Track): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < track.count; i++) {
      minX = Math.min(minX, track.xs[i]);
      maxX = Math.max(maxX, track.xs[i]);
      minZ = Math.min(minZ, track.zs[i]);
      maxZ = Math.max(maxZ, track.zs[i]);
    }
    const pad = 12;
    const size = this.minimap.width - pad * 2;
    const scale = size / Math.max(maxX - minX, maxZ - minZ);
    const offX = (size - (maxX - minX) * scale) / 2 + pad;
    const offZ = (size - (maxZ - minZ) * scale) / 2 + pad;
    this.mapBounds = { minX, minZ, scale, offX, offZ };

    const base = document.createElement('canvas');
    base.width = this.minimap.width;
    base.height = this.minimap.height;
    const ctx = base.getContext('2d')!;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i <= track.count; i += 2) {
        const idx = i % track.count;
        const [px, py] = this.mapPoint(track.xs[idx], track.zs[idx]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 9;
    path();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,220,235,0.9)';
    ctx.lineWidth = 5;
    path();
    ctx.stroke();
    // start line
    const [sx, sy] = this.mapPoint(track.xs[0], track.zs[0]);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    this.minimapBase = base;
  }

  private mapPoint(x: number, z: number): [number, number] {
    const b = this.mapBounds;
    return [(x - b.minX) * b.scale + b.offX, (z - b.minZ) * b.scale + b.offZ];
  }

  updateMinimap(dots: readonly MinimapDot[]): void {
    const ctx = this.minimap.getContext('2d')!;
    ctx.clearRect(0, 0, this.minimap.width, this.minimap.height);
    if (this.minimapBase) ctx.drawImage(this.minimapBase, 0, 0);
    for (const d of dots) {
      const [px, py] = this.mapPoint(d.x, d.z);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(px, py, d.isPlayer ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (d.isPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  /** Floating rival name tags (client pixel positions). Extra pooled tags are hidden. */
  updateTags(tags: readonly NameTag[]): void {
    while (this.tags.length < tags.length) this.tags.push(el('div', 'tag', this.tagLayer));
    this.tags.forEach((node, i) => {
      const t = tags[i];
      if (!t) {
        node.style.display = 'none';
        return;
      }
      node.style.display = '';
      if (node.textContent !== t.name) node.textContent = t.name;
      node.style.color = t.color;
      node.style.opacity = String(t.opacity);
      node.style.transform = `translate(${t.x}px, ${t.y}px) translate(-50%, -100%)`;
    });
  }

  show(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
