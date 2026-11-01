import Peer, { DataConnection } from 'peerjs';
import { RIVALS } from '../config/gameConfig';
import { NET, peerOptions } from '../config/netConfig';
import { Emitter } from '../core/emitter';
import { Rng, randomSeed } from '../core/rng';
import { CarSnap, FxMsg, LobbyPlayer, NetMsg, RosterEntry, StartInfo } from './protocol';

interface SessionEvents {
  lobby: [players: LobbyPlayer[]];
  /** A race was started by the host: build it now. */
  start: [info: StartInfo];
  /** Everybody finished loading: begin the countdown. */
  go: [];
  snap: [ts: number, cars: CarSnap[]];
  fx: [fx: FxMsg];
  /** A human left while a race was running. */
  left: [slot: number];
  closed: [reason: string];
}

export function sanitizeName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NET.nameMaxLength);
  return clean || 'Racer';
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NET.codeLength);
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < NET.codeLength; i++) code += NET.codeAlphabet[Math.floor(Math.random() * NET.codeAlphabet.length)];
  return code;
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = window.setTimeout(() => {
      peer.destroy();
      reject(new Error('Could not reach the matchmaking server'));
    }, NET.connectTimeoutMs);
    peer.on('open', () => {
      window.clearTimeout(timer);
      peer.off('error', onError);
      resolve(peer);
    });
    const onError = (err: { type?: string; message?: string }): void => {
      window.clearTimeout(timer);
      peer.destroy();
      reject(Object.assign(new Error(err.message ?? 'Connection error'), { type: err.type }));
    };
    peer.on('error', onError);
  });
}

/**
 * Online room over WebRTC (PeerJS). Star topology: the host owns the room (its PeerJS id is derived from the room
 * code), every other player connects to the host, and the host relays state between clients. Car physics is
 * client-authoritative: each player simulates their own car and streams snapshots; the host also simulates the AI cars.
 */
export class NetSession {
  readonly events = new Emitter<SessionEvents>();
  players: LobbyPlayer[] = [];
  roster: RosterEntry[] = [];
  /** True between the host starting a race and everybody being back in the lobby. */
  racing = false;
  /** The countdown signal already happened for the current race (a late loader must not wait for it). */
  hasGone = false;

  /** Host: every client connection. Client: only the host connection. */
  private readonly conns = new Map<string, DataConnection>();
  private readonly ready = new Set<string>();
  private readyTimer = 0;
  private pulse = 0;
  private closed = false;
  /** Host: when each client was last heard from. */
  private readonly lastSeen = new Map<string, number>();
  private readonly onPageHide = (): void => this.close();

  private constructor(
    private readonly peer: Peer,
    readonly isHost: boolean,
    readonly code: string,
  ) {
    peer.on('disconnected', () => {
      if (!this.closed) peer.reconnect(); // keep the room code alive after a signaling hiccup
    });
    peer.on('error', () => {
      /* established data connections keep working; fatal cases surface through their close events */
    });
    // Closing the tab: leave cleanly so the others notice immediately instead of after a WebRTC timeout
    window.addEventListener('pagehide', this.onPageHide);
  }

  get myId(): string {
    return this.peer.id;
  }

  // ------------------------------------------------------------------ creating / joining

  static async host(name: string): Promise<NetSession> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode();
      try {
        const peer = await openPeer(NET.idPrefix + code);
        const s = new NetSession(peer, true, code);
        s.players = [{ id: peer.id, name: sanitizeName(name), host: true }];
        peer.on('connection', (conn) => s.onClientConnection(conn));
        s.pulse = window.setInterval(() => s.dropSilentClients(), 2000);
        return s;
      } catch (e) {
        if ((e as { type?: string }).type !== 'unavailable-id') throw e;
      }
    }
    throw new Error('Could not allocate a room code, please try again');
  }

  static async join(rawCode: string, name: string): Promise<NetSession> {
    const code = normalizeCode(rawCode);
    if (code.length !== NET.codeLength) throw new Error('Enter the 5-character room code');
    const peer = await openPeer();
    try {
      const conn = peer.connect(NET.idPrefix + code, { reliable: true, serialization: 'json' });
      const session = new NetSession(peer, false, code);
      await session.handshake(conn, sanitizeName(name));
      return session;
    } catch (e) {
      peer.destroy();
      throw e;
    }
  }

  private handshake(conn: DataConnection, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => fail('Could not connect to that room'), NET.connectTimeoutMs);
      const fail = (msg: string): void => {
        window.clearTimeout(timer);
        this.peer.off('error', onPeerError);
        reject(new Error(msg));
      };
      const onPeerError = (err: { type?: string }): void => {
        if (err.type === 'peer-unavailable') fail('Room not found. Check the code.');
      };
      this.peer.on('error', onPeerError);
      conn.on('open', () => conn.send({ t: 'hello', name } satisfies NetMsg));
      conn.on('error', () => fail('Could not connect to that room'));
      conn.on('close', () => fail('The room closed the connection'));
      conn.on('data', (raw) => {
        const m = raw as NetMsg;
        if (m.t === 'reject') return fail(m.reason);
        if (m.t !== 'welcome') return;
        window.clearTimeout(timer);
        this.peer.off('error', onPeerError);
        this.players = m.players;
        this.conns.set(conn.peer, conn);
        conn.off('data');
        conn.off('close');
        conn.off('error');
        conn.on('data', (d) => this.onHostMsg(d as NetMsg));
        const lost = (): void => this.fireClosed('The host left the room or the connection was lost');
        conn.on('close', lost);
        conn.on('error', lost);
        this.pulse = window.setInterval(() => this.sendToHost({ t: 'ping' }), NET.pingMs);
        resolve();
      });
    });
  }

  // ------------------------------------------------------------------ host side

  private onClientConnection(conn: DataConnection): void {
    let joined = false;
    const reject = (reason: string): void => {
      conn.send({ t: 'reject', reason } satisfies NetMsg);
      window.setTimeout(() => conn.close(), 300);
    };
    conn.on('data', (raw) => {
      const m = raw as NetMsg;
      this.lastSeen.set(conn.peer, performance.now());
      if (!joined) {
        if (m.t !== 'hello') return;
        if (this.racing) return reject('A race is already in progress');
        if (this.players.length >= NET.maxPlayers) return reject('The room is full');
        joined = true;
        this.conns.set(conn.peer, conn);
        this.lastSeen.set(conn.peer, performance.now());
        this.players.push({ id: conn.peer, name: sanitizeName(m.name), host: false });
        conn.send({ t: 'welcome', players: this.players } satisfies NetMsg);
        this.broadcast({ t: 'lobby', players: this.players }, conn.peer);
        this.events.emit('lobby', this.players);
        return;
      }
      this.onClientMsg(conn.peer, m);
    });
    const gone = (): void => {
      if (joined) this.onClientGone(conn.peer);
      joined = false;
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  /** Host: drop clients that stopped sending anything (crashed tab, lost network). */
  private dropSilentClients(): void {
    const now = performance.now();
    for (const [id, conn] of this.conns) {
      if (now - (this.lastSeen.get(id) ?? now) > NET.dropAfterMs) conn.close();
    }
  }

  private onClientMsg(from: string, m: NetMsg): void {
    switch (m.t) {
      case 'ready':
        this.ready.add(from);
        this.checkAllReady();
        break;
      case 'snap':
        this.broadcast(m, from);
        this.events.emit('snap', m.ts, m.cars);
        break;
      case 'fx':
        this.broadcast(m, from);
        this.events.emit('fx', m.fx);
        break;
    }
  }

  private onClientGone(id: string): void {
    this.conns.delete(id);
    this.ready.delete(id);
    this.lastSeen.delete(id);
    this.players = this.players.filter((p) => p.id !== id);
    if (this.racing) {
      const slot = this.roster.find((r) => r.pid === id)?.slot;
      if (slot !== undefined) {
        this.broadcast({ t: 'left', slot });
        this.events.emit('left', slot);
      }
      this.checkAllReady();
    } else {
      this.broadcast({ t: 'lobby', players: this.players });
    }
    this.events.emit('lobby', this.players);
  }

  /** Host: build the roster (optionally filling free slots with AI), tell everybody and start loading. */
  startRace(fillAi: boolean): StartInfo {
    const rng = new Rng(randomSeed());
    const entries: Array<Omit<RosterEntry, 'slot'>> = this.players.map((p) => ({ name: p.name, ai: false, pid: p.id }));
    if (fillAi) {
      const names = rng.shuffle(RIVALS.map((r) => r.name));
      for (let i = entries.length, n = 0; i < NET.maxPlayers; i++, n++) entries.push({ name: names[n % names.length], ai: true, pid: null });
    }
    rng.shuffle(entries);
    const info: StartInfo = { seed: randomSeed(), roster: entries.map((e, slot) => ({ ...e, slot })) };

    this.roster = info.roster;
    this.racing = true;
    this.hasGone = false;
    this.ready.clear();
    this.broadcast({ t: 'start', seed: info.seed, roster: info.roster });
    window.clearTimeout(this.readyTimer);
    this.readyTimer = window.setTimeout(() => this.go(), NET.readyTimeoutMs);
    this.events.emit('start', info);
    return info;
  }

  private checkAllReady(): void {
    if (!this.racing || this.hasGone) return;
    if (this.players.every((p) => this.ready.has(p.id))) this.go();
  }

  private go(): void {
    if (this.hasGone || !this.racing) return;
    window.clearTimeout(this.readyTimer);
    this.hasGone = true;
    this.broadcast({ t: 'go' });
    this.events.emit('go');
  }

  /** Host: the race screen is closed, new players may join again. */
  endRace(): void {
    this.racing = false;
    if (this.isHost) this.broadcast({ t: 'lobby', players: this.players });
  }

  private broadcast(m: NetMsg, except?: string): void {
    for (const [id, conn] of this.conns) {
      if (id !== except && conn.open) conn.send(m);
    }
  }

  // ------------------------------------------------------------------ client side

  private onHostMsg(m: NetMsg): void {
    switch (m.t) {
      case 'lobby':
        this.players = m.players;
        this.events.emit('lobby', this.players);
        break;
      case 'start':
        this.roster = m.roster;
        this.racing = true;
        this.hasGone = false;
        this.events.emit('start', { seed: m.seed, roster: m.roster });
        break;
      case 'go':
        this.hasGone = true;
        this.events.emit('go');
        break;
      case 'snap':
        this.events.emit('snap', m.ts, m.cars);
        break;
      case 'fx':
        this.events.emit('fx', m.fx);
        break;
      case 'left':
        this.events.emit('left', m.slot);
        break;
    }
  }

  // ------------------------------------------------------------------ in-race messaging

  /** The local race finished building its world. The host starts the countdown once everyone reported in. */
  markReady(): void {
    if (this.isHost) {
      this.ready.add(this.myId);
      this.checkAllReady();
    } else this.sendToHost({ t: 'ready' });
  }

  sendSnap(cars: CarSnap[]): void {
    const m: NetMsg = { t: 'snap', ts: performance.now(), cars };
    if (this.isHost) this.broadcast(m);
    else this.sendToHost(m);
  }

  sendFx(fx: FxMsg): void {
    const m: NetMsg = { t: 'fx', fx };
    if (this.isHost) this.broadcast(m);
    else this.sendToHost(m);
  }

  private sendToHost(m: NetMsg): void {
    for (const conn of this.conns.values()) if (conn.open) conn.send(m);
  }

  // ------------------------------------------------------------------ teardown

  private fireClosed(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.stopTimers();
    this.events.emit('closed', reason);
    this.peer.destroy();
  }

  private stopTimers(): void {
    window.clearTimeout(this.readyTimer);
    window.clearInterval(this.pulse);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  /** Leave the room (host: closes it for everybody). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopTimers();
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    this.peer.destroy();
    this.events.clear();
  }
}
