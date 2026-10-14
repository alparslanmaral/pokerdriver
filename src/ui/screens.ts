import { PAYOUT_DEFAULT, PAYOUTS } from '../config/gameConfig';
import { el, formatMoney, ordinal } from './dom';

export function payoutFor(position: number): number {
  return PAYOUTS[position - 1] ?? PAYOUT_DEFAULT;
}

/** Main menu overlay. */
export class MenuScreen {
  readonly root: HTMLElement;
  private moneyEl: HTMLElement;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.root = el('div', 'screen menu', parent);
    const panel = el('div', 'panel menu-panel', this.root);
    const suits = el('div', 'menu-suits', panel);
    suits.innerHTML = '<span>♠</span><span class="red">♥</span><span class="red">♦</span><span>♣</span>';
    el('h1', 'title', panel, 'POKER RACER');
    el('p', 'tagline', panel, 'Steer with one hand. Play poker with the other. You only have one mouse.');

    const moneyRow = el('div', 'menu-money', panel);
    el('span', 'label', moneyRow, 'BANK');
    this.moneyEl = el('span', 'value', moneyRow, '$0');

    const start = el('button', 'btn primary big', panel, 'Start Race');
    start.addEventListener('click', onStart);

    const help = el('div', 'help', panel);
    help.innerHTML = `
      <div class="help-col">
        <h3>Driving</h3>
        <ul>
          <li><kbd>W</kbd> throttle &nbsp; <kbd>S</kbd> brake / reverse</li>
          <li><kbd>Space</kbd> handbrake (drift)</li>
          <li><b>Mouse:</b> hold the left button on the steering wheel and move around it. Let go to center it.</li>
          <li><kbd>R</kbd> reset car &nbsp; <kbd>Esc</kbd> pause &nbsp; <kbd>M</kbd> mute</li>
        </ul>
      </div>
      <div class="help-col">
        <h3>Cards</h3>
        <ul>
          <li>Drive through floating card boxes to draw 2 cards.</li>
          <li>Click cards to select (max 5), then press <b>PLAY</b>.</li>
          <li>Drag a card out of the window to throw it away.</li>
          <li>Hard crashes knock a card off your table!</li>
          <li>Letting go of the wheel to use cards is a risk.</li>
        </ul>
      </div>`;
  }

  setMoney(amount: number): void {
    this.moneyEl.textContent = formatMoney(amount);
  }

  show(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}

export class PauseOverlay {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, onResume: () => void, onQuit: () => void) {
    this.root = el('div', 'screen pause', parent);
    this.root.style.display = 'none';
    const panel = el('div', 'panel', this.root);
    el('h2', '', panel, 'PAUSED');
    const resume = el('button', 'btn primary', panel, 'Resume');
    const quit = el('button', 'btn', panel, 'Quit to menu');
    resume.addEventListener('click', onResume);
    quit.addEventListener('click', onQuit);
  }

  show(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}

export interface FinishRow {
  name: string;
  color: number;
  isPlayer: boolean;
  /** Seconds, or null when the car had not finished yet. */
  time: number | null;
}

export class FinishScreen {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'screen finish', parent);
    this.root.style.display = 'none';
  }

  show(position: number, payout: number, bank: number, rows: FinishRow[], onAgain: () => void, onMenu: () => void): void {
    this.root.innerHTML = '';
    this.root.style.display = '';
    const panel = el('div', 'panel finish-panel', this.root);
    el('div', 'finish-label', panel, 'RACE FINISHED');
    el('div', `finish-pos pos-${Math.min(position, 4)}`, panel, ordinal(position));
    const pay = el('div', 'finish-pay', panel);
    el('span', 'label', pay, 'PAYOUT');
    el('span', 'value good', pay, `+${formatMoney(payout)}`);
    const bankRow = el('div', 'finish-pay', panel);
    el('span', 'label', bankRow, 'BANK');
    el('span', 'value', bankRow, formatMoney(bank));

    const table = el('div', 'standings', panel);
    rows.forEach((r, i) => {
      const row = el('div', `st-row${r.isPlayer ? ' me' : ''}`, table);
      el('span', 'st-pos', row, String(i + 1));
      const dot = el('span', 'st-dot', row);
      dot.style.background = '#' + r.color.toString(16).padStart(6, '0');
      el('span', 'st-name', row, r.isPlayer ? 'You' : r.name);
      el('span', 'st-time', row, r.time === null ? '-' : formatTime(r.time));
    });

    const buttons = el('div', 'btn-row', panel);
    const again = el('button', 'btn primary', buttons, 'Race again');
    const menu = el('button', 'btn', buttons, 'Main menu');
    again.addEventListener('click', onAgain);
    menu.addEventListener('click', onMenu);
  }

  hide(): void {
    this.root.style.display = 'none';
    this.root.innerHTML = '';
  }
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
