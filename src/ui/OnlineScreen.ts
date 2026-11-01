import { NET } from '../config/netConfig';
import { LobbyPlayer } from '../net/protocol';
import { normalizeCode } from '../net/NetSession';
import { el } from './dom';

export interface OnlineHooks {
  onCreate(): void;
  onJoin(code: string): void;
  /** Back from the create/join choice to the main menu. */
  onBack(): void;
  /** Leave the lobby (host: closes the room). */
  onLeave(): void;
  /** Host pressed start. `fillAi` is whether empty grid slots get AI drivers. */
  onStart(fillAi: boolean): void;
}

export interface LobbyInfo {
  code: string;
  isHost: boolean;
  myId: string;
}

/** Online mode screens: create / join choice, connecting spinner, lobby with the player list and the AI-fill question. */
export class OnlineScreen {
  readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private info: LobbyInfo | null = null;
  private players: LobbyPlayer[] = [];

  constructor(parent: HTMLElement, private readonly hooks: OnlineHooks) {
    this.root = el('div', 'screen online', parent);
    this.root.style.display = 'none';
    this.panel = el('div', 'panel online-panel', this.root);
  }

  hide(): void {
    this.root.style.display = 'none';
    this.info = null;
  }

  private reset(title: string): void {
    this.root.style.display = '';
    this.panel.innerHTML = '';
    el('h2', 'online-title', this.panel, title);
  }

  // ------------------------------------------------------------------ choice

  showChoice(error?: string, prefillCode = ''): void {
    this.info = null;
    this.reset('ONLINE');
    if (error) el('div', 'online-error', this.panel, error);

    const create = el('button', 'btn primary big', this.panel, 'Create room');
    create.addEventListener('click', () => this.hooks.onCreate());

    el('div', 'online-or', this.panel, 'or join a friend');
    const row = el('div', 'online-join', this.panel);
    const input = el('input', 'code-input', row);
    input.type = 'text';
    input.maxLength = NET.codeLength;
    input.placeholder = 'ROOM CODE';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.value = normalizeCode(prefillCode);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') join.click();
    });
    input.addEventListener('input', () => {
      input.value = normalizeCode(input.value);
    });
    const join = el('button', 'btn', row, 'Join');
    join.addEventListener('click', () => this.hooks.onJoin(input.value));

    const back = el('button', 'btn link', this.panel, 'Back');
    back.addEventListener('click', () => this.hooks.onBack());
    if (prefillCode) input.focus();
  }

  showBusy(text: string): void {
    this.reset('ONLINE');
    el('div', 'online-busy', this.panel, text);
  }

  // ------------------------------------------------------------------ lobby

  showLobby(info: LobbyInfo, players: LobbyPlayer[]): void {
    this.info = info;
    this.players = players;
    this.renderLobby();
  }

  updateLobby(players: LobbyPlayer[]): void {
    if (!this.info) return;
    this.players = players;
    if (this.root.style.display !== 'none') this.renderLobby();
  }

  private renderLobby(): void {
    const info = this.info!;
    this.reset('LOBBY');

    const codeBox = el('div', 'room-code', this.panel);
    el('span', 'label', codeBox, 'ROOM CODE');
    el('span', 'code', codeBox, info.code);
    const copyRow = el('div', 'copy-row', this.panel);
    const copy = el('button', 'btn small', copyRow, 'Copy invite link');
    copy.addEventListener('click', () => void this.copyInvite(info.code, copy));

    const list = el('div', 'slot-list', this.panel);
    for (let i = 0; i < NET.maxPlayers; i++) {
      const p = this.players[i];
      const row = el('div', `slot${p ? '' : ' empty'}`, list);
      el('span', 'slot-n', row, String(i + 1));
      el('span', 'slot-name', row, p ? p.name : 'Waiting for player...');
      if (p?.host) el('span', 'badge host', row, 'HOST');
      if (p?.id === info.myId) el('span', 'badge you', row, 'YOU');
    }

    const buttons = el('div', 'btn-row', this.panel);
    if (info.isHost) {
      const start = el('button', 'btn primary', buttons, 'Start race');
      start.addEventListener('click', () => this.onStartClicked());
    } else {
      el('div', 'online-wait', this.panel, 'Waiting for the host to start the race...');
    }
    const leave = el('button', 'btn', buttons, info.isHost ? 'Close room' : 'Leave');
    leave.addEventListener('click', () => this.hooks.onLeave());
  }

  private onStartClicked(): void {
    const humans = this.players.length;
    if (humans >= NET.maxPlayers) {
      this.hooks.onStart(false);
      return;
    }
    this.renderAiQuestion(humans);
  }

  /** Not enough players for a full grid: ask whether AI drivers should take the empty slots. */
  private renderAiQuestion(humans: number): void {
    const empty = NET.maxPlayers - humans;
    this.reset('FILL THE GRID?');
    el('p', 'online-question', this.panel, `Only ${humans} of ${NET.maxPlayers} players are here. Fill the ${empty} empty slot${empty > 1 ? 's' : ''} with AI drivers?`);
    const buttons = el('div', 'btn-col', this.panel);
    const yes = el('button', 'btn primary', buttons, `Yes, add ${empty} AI driver${empty > 1 ? 's' : ''}`);
    yes.addEventListener('click', () => this.hooks.onStart(true));
    const no = el('button', 'btn', buttons, humans > 1 ? 'No, only the players' : 'No (needs at least 2 players)');
    no.disabled = humans < 2;
    no.addEventListener('click', () => this.hooks.onStart(false));
    const cancel = el('button', 'btn link', buttons, 'Cancel');
    cancel.addEventListener('click', () => this.renderLobby());
  }

  private async copyInvite(code: string, btn: HTMLElement): Promise<void> {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = url;
    }
    window.setTimeout(() => {
      if (btn.isConnected) btn.textContent = 'Copy invite link';
    }, 2200);
  }
}
