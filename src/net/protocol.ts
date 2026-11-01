/** Wire format of the online mode. Everything is JSON over PeerJS data connections (star topology around the host). */

export interface LobbyPlayer {
  id: string;
  name: string;
  host: boolean;
}

/** One grid slot of a race. `pid` is the PeerJS id of the human driving it (null for AI). */
export interface RosterEntry {
  slot: number;
  name: string;
  ai: boolean;
  pid: string | null;
}

export interface StartInfo {
  seed: number;
  roster: RosterEntry[];
}

/** Car snapshot: [slot, x, z, heading, vLong, vLat, yawRate, totalProgress, finishTime (-1 = running), flags]. */
export type CarSnap = number[];
export const SNAP = { slot: 0, x: 1, z: 2, heading: 3, vLong: 4, vLat: 5, yawRate: 6, total: 7, finishTime: 8, flags: 9 } as const;
export const FLAG = { drifting: 1, nitro: 2, shield: 4 } as const;

/** Gameplay effects one player inflicts on the others. */
export type FxMsg =
  | { k: 'oil'; x: number; z: number; from: number }
  | { k: 'slow'; factor: number; seconds: number; from: number };

export type NetMsg =
  | { t: 'hello'; name: string }
  | { t: 'welcome'; players: LobbyPlayer[] }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; players: LobbyPlayer[] }
  | { t: 'start'; seed: number; roster: RosterEntry[] }
  | { t: 'ready' }
  | { t: 'ping' }
  | { t: 'go' }
  | { t: 'snap'; ts: number; cars: CarSnap[] }
  | { t: 'fx'; fx: FxMsg }
  | { t: 'left'; slot: number };
