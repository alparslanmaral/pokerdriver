import { PAYOUT_DEFAULT, PAYOUTS } from '../config/gameConfig';
import { isTouchDevice } from '../core/device';
import { pwa, InstallMode } from '../pwa/pwa';
import { NET } from '../config/netConfig';
import { SaveData } from '../core/save';
import { el, formatMoney, ordinal } from './dom';

export function payoutFor(position: number): number {
  return PAYOUTS[position - 1] ?? PAYOUT_DEFAULT;
}

/** Main menu overlay. */
export class MenuScreen {
  readonly root: HTMLElement;
  private moneyEl: HTMLElement;
  private installBtn: HTMLButtonElement;
  private installNote: HTMLElement;
  private noticeEl: HTMLElement;
  private nameInput: HTMLInputElement;

  constructor(parent: HTMLElement, hooks: { onSingle: () => void; onOnline: () => void }) {
    this.root = el('div', 'screen menu', parent);
    const panel = el('div', 'panel menu-panel', this.root);
    const suits = el('div', 'menu-suits', panel);
    suits.innerHTML = '<span>♠</span><span class="red">♥</span><span class="red">♦</span><span>♣</span>';
    el('h1', 'title', panel, 'POKER RACER');
    el('p', 'tagline', panel, isTouchDevice() ? 'Steer with your left thumb. Play poker with your right. Keep your eyes on the road.' : 'Steer with the keys. Play poker with the mouse. Keep your eyes on the road.');

    const moneyRow = el('div', 'menu-money', panel);
    el('span', 'label', moneyRow, 'BANK');
    this.moneyEl = el('span', 'value', moneyRow, '$0');

    this.noticeEl = el('div', 'menu-notice', panel);
    this.noticeEl.style.display = 'none';

    const nameRow = el('label', 'menu-name', panel);
    el('span', 'label', nameRow, 'PILOT NAME');
    this.nameInput = el('input', '', nameRow);
    this.nameInput.type = 'text';
    this.nameInput.maxLength = NET.nameMaxLength;
    this.nameInput.placeholder = 'Racer';
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.value = SaveData.name;
    this.nameInput.addEventListener('input', () => SaveData.setName(this.nameInput.value));
    // Typing a name must not trigger the game's keyboard shortcuts
    this.nameInput.addEventListener('keydown', (e) => e.stopPropagation());

    const modes = el('div', 'menu-modes', panel);
    const single = el('button', 'btn primary big', modes, 'Singleplayer');
    single.addEventListener('click', hooks.onSingle);
    const online = el('button', 'btn big online', modes, 'Online');
    online.addEventListener('click', hooks.onOnline);

    this.installBtn = el('button', 'btn install', panel);
    this.installBtn.addEventListener('click', () => this.onInstallClick());
    this.installNote = el('div', 'install-note', panel);
    this.installNote.style.display = 'none';
    this.updateInstall(pwa.mode);
    pwa.events.on('changed', (mode) => this.updateInstall(mode));

    const help = el('div', 'help', panel);
    const touch = isTouchDevice();
    help.innerHTML = touch
      ? `
      <div class="help-col">
        <h3>Driving</h3>
        <ul>
          <li>Hold <b>&#9664;</b> / <b>&#9654;</b> (left thumb) to steer; let go and the wheel centers itself.</li>
          <li>Hold <b>GAS</b> to accelerate and <b>BRAKE</b> to slow down / reverse (right thumb).</li>
          <li>&#10074;&#10074; pauses, &#8634; puts the car back on the track.</li>
        </ul>
      </div>
      <div class="help-col">
        <h3>Cards</h3>
        <ul>
          <li>Drive through floating card boxes to draw 2 cards.</li>
          <li>Tap cards to select (max 5), then press <b>PLAY</b>.</li>
          <li><b>Double-tap</b> a card to throw it out of the window.</li>
          <li>Hard crashes knock a card off your table!</li>
        </ul>
      </div>`
      : `
      <div class="help-col">
        <h3>Driving</h3>
        <ul>
          <li><kbd>W</kbd> throttle &nbsp; <kbd>S</kbd> brake / reverse</li>
          <li><kbd>A</kbd> <kbd>D</kbd> steer left / right (arrow keys work too)</li>
          <li><kbd>Space</kbd> handbrake (drift)</li>
          <li><kbd>R</kbd> reset car &nbsp; <kbd>Esc</kbd> pause &nbsp; <kbd>M</kbd> mute</li>
        </ul>
      </div>
      <div class="help-col">
        <h3>Cards</h3>
        <ul>
          <li>Drive through floating card boxes to draw 2 cards.</li>
          <li>Click cards to select (max 5), then press <b>PLAY</b>.</li>
          <li><b>Double-click</b> a card to throw it out of the window.</li>
          <li>Hard crashes knock a card off your table!</li>
          <li>Looking at the cards instead of the road is a risk.</li>
        </ul>
      </div>`;
  }

  private updateInstall(mode: InstallMode): void {
    this.installBtn.style.display = mode === 'hidden' ? 'none' : '';
    this.installBtn.textContent = mode === 'ios' ? 'Add to Home Screen' : 'Install app';
    if (mode === 'hidden') this.installNote.style.display = 'none';
  }

  private async onInstallClick(): Promise<void> {
    if (pwa.mode === 'prompt') {
      await pwa.promptInstall();
      return;
    }
    // iOS Safari: no install API, show how to do it by hand
    this.installNote.innerHTML = 'Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.';
    this.installNote.style.display = '';
  }

  /** Display name for online play (empty = default). */
  get playerName(): string {
    return this.nameInput.value.trim();
  }

  /** One-line message above the buttons (e.g. "The host left the room"). */
  setNotice(text: string | null): void {
    this.noticeEl.textContent = text ?? '';
    this.noticeEl.style.display = text ? '' : 'none';
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

  constructor(parent: HTMLElement, onResume: () => void, onQuit: () => void, online = false) {
    this.root = el('div', 'screen pause', parent);
    this.root.style.display = 'none';
    const panel = el('div', 'panel', this.root);
    el('h2', '', panel, online ? 'MENU' : 'PAUSED');
    if (online) el('p', 'pause-note', panel, 'The race keeps running for the other players.');
    const resume = el('button', 'btn primary', panel, 'Resume');
    const quit = el('button', 'btn', panel, online ? 'Leave room' : 'Quit to menu');
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

  show(position: number, payout: number, bank: number, rows: FinishRow[], onAgain: () => void, onMenu: () => void, againLabel = 'Race again', menuLabel = 'Main menu'): void {
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
    const again = el('button', 'btn primary', buttons, againLabel);
    const menu = el('button', 'btn', buttons, menuLabel);
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
