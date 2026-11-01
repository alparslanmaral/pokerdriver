import { el } from './dom';

export interface TouchHooks {
  onPause(): void;
  onReset(): void;
}

type Pad = 'left' | 'right' | 'gas' | 'brake';

/**
 * On-screen driving buttons for touch devices (landscape): steer left/right on the left thumb, brake + gas on
 * the right thumb, plus small pause / reset buttons. Pointer events with capture keep multi-touch reliable
 * (e.g. steer + gas at the same time).
 */
export class TouchControls {
  readonly root: HTMLElement;
  left = false;
  right = false;
  gas = false;
  brake = false;

  private readonly pads = new Map<Pad, HTMLElement>();
  private readonly active = new Map<number, Pad>();

  constructor(parent: HTMLElement, hooks: TouchHooks) {
    this.root = el('div', 'touch', parent);

    const steer = el('div', 'touch-group touch-steer', this.root);
    this.addPad(steer, 'left', '◀', 'Steer left');
    this.addPad(steer, 'right', '▶', 'Steer right');

    const pedals = el('div', 'touch-group touch-pedals', this.root);
    this.addPad(pedals, 'brake', 'BRAKE', 'Brake');
    this.addPad(pedals, 'gas', 'GAS', 'Throttle');

    const small = el('div', 'touch-small', this.root);
    const pause = el('button', 'touch-btn', small, '❚❚');
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', hooks.onPause);
    const reset = el('button', 'touch-btn', small, '↺');
    reset.setAttribute('aria-label', 'Reset car');
    reset.addEventListener('click', hooks.onReset);
  }

  /** Release every pad (pause, finish, focus loss). */
  releaseAll(): void {
    this.active.clear();
    this.sync();
  }

  setEnabled(enabled: boolean): void {
    this.root.classList.toggle('off', !enabled);
    if (!enabled) this.releaseAll();
  }

  dispose(): void {
    this.root.remove();
  }

  private addPad(parent: HTMLElement, pad: Pad, label: string, aria: string): void {
    const node = el('div', `touch-pad pad-${pad}`, parent, label);
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', aria);
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      this.active.set(e.pointerId, pad);
      this.sync();
    });
    const up = (e: PointerEvent): void => {
      if (this.active.delete(e.pointerId)) this.sync();
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    this.pads.set(pad, node);
  }

  private sync(): void {
    const down = new Set(this.active.values());
    this.left = down.has('left');
    this.right = down.has('right');
    this.gas = down.has('gas');
    this.brake = down.has('brake');
    for (const [pad, node] of this.pads) node.classList.toggle('down', down.has(pad));
  }
}
