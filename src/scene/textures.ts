import * as THREE from 'three';
import { Rng } from '../core/rng';
import { TRACK } from '../config/trackConfig';

/** All textures are generated on canvases at runtime: no external assets. */

let maxAnisotropy = 4;
export function setMaxAnisotropy(v: number): void {
  maxAnisotropy = Math.min(8, v);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = false, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = maxAnisotropy;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, count: number, colors: string[], size: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    ctx.fillRect(rng.next() * w, rng.next() * h, size * (0.5 + rng.next()), size * (0.5 + rng.next()));
  }
}

/** Road: u across the width, v along the track (one repeat = TRACK.roadTexLength meters). */
export function makeRoadTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const rng = new Rng(11);
  ctx.fillStyle = '#3b3e44';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, 9000, ['#464a51', '#33363b', '#4b4f56', '#2e3136'], 2);
  // darker driving line streaks
  for (const u of [0.22, 0.38, 0.62, 0.78]) {
    const g = ctx.createLinearGradient((u - 0.05) * w, 0, (u + 0.05) * w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect((u - 0.05) * w, 0, 0.1 * w, h);
  }
  // Edge lines (solid) and lane lines (dashed). 18 m road => 512px ~ 3.5cm/px
  ctx.fillStyle = '#e8e8e2';
  ctx.fillRect(w * 0.025, 0, 11, h);
  ctx.fillRect(w * 0.975 - 11, 0, 11, h);
  const dashLen = (4 / TRACK.roadTexLength) * h;
  for (const u of [1 / 3, 2 / 3]) {
    ctx.fillRect(u * w - 4, 0, 8, dashLen);
  }
  const t = toTexture(c, true);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeKerbTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(32, 64);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#c8202a';
  ctx.fillRect(0, 32, 32, 32);
  return toTexture(c, true);
}

/** Barrier: u across the height (white / red / white band), v along the track. */
export function makeBarrierTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 128);
  ctx.fillStyle = '#d9d9d6';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#c62828';
  ctx.fillRect(22, 0, 20, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 64, 3); // seam between concrete blocks
  return toTexture(c, true);
}

export function makeGrassTexture(color: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  const rng = new Rng(5);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 5000, ['#5d9e47', '#437f33', '#6aa94f', '#3a7330'], 3);
  return toTexture(c, true);
}

export function makeGravelTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const rng = new Rng(17);
  ctx.fillStyle = '#9b8c72';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 2500, ['#b4a589', '#7f7258', '#a69877', '#8a7b60'], 2);
  return toTexture(c, true);
}

export function makeCheckerTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 64);
  const cell = 32;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f4f4' : '#111';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const t = toTexture(c);
  t.anisotropy = maxAnisotropy;
  return t;
}

export function makeBannerTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 96);
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#2a2f3a');
  g.addColorStop(1, '#14171d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  ctx.fillStyle = '#e63946';
  ctx.fillRect(0, 0, 512, 6);
  ctx.fillRect(0, 90, 512, 6);
  return toTexture(c);
}

export function makeWindowTexture(seed: number, wallColor: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const rng = new Rng(seed);
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 128, 128);
  const cols = 4;
  const rows = 4;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(0.25);
      ctx.fillStyle = lit ? '#ffe9a8' : '#27384a';
      ctx.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
    }
  }
  return toTexture(c, true);
}

/** A cube face for card boxes: a card-like face with a suit symbol. */
export function makeBoxFaceTexture(symbol: string, red: boolean): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, '#fff7da');
  g.addColorStop(1, '#ffe08a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#7a4b00';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.fillStyle = red ? '#c1121f' : '#1b1b1f';
  ctx.font = 'bold 84px system-ui, "Segoe UI Symbol", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 64, 70);
  return toTexture(c);
}

export function makeMirrorTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 64);
  const g = ctx.createLinearGradient(0, 0, 256, 64);
  g.addColorStop(0, '#9db8cc');
  g.addColorStop(0.45, '#d7e6f0');
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(0.55, '#c9dbe8');
  g.addColorStop(1, '#7f9db3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 64);
  return toTexture(c);
}
