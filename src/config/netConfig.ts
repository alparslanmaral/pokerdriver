/** Online mode tunables (WebRTC via PeerJS). */
export const NET = {
  maxPlayers: 6,
  /** Room code length; the PeerJS id of the host is `idPrefix + code`. */
  codeLength: 5,
  /** Unambiguous characters for room codes (no 0/O, 1/I/L). */
  codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  idPrefix: 'pokerracer-',
  nameMaxLength: 14,
  /** Car state broadcasts per second. */
  sendHz: 20,
  /** Remote cars are drawn this far in the past so there are always two snapshots to interpolate between. */
  interpDelayMs: 110,
  /** Max time a remote car is extrapolated past its last snapshot. */
  maxExtrapolateMs: 250,
  /** Jumps larger than this (m) are teleports (reset / respawn) and are not interpolated. */
  teleportDistance: 25,
  connectTimeoutMs: 12000,
  /** Clients ping the host this often; a client silent for `dropAfterMs` is removed from the room. */
  pingMs: 3000,
  dropAfterMs: 9000,
  /** After the host starts a race it waits this long for everybody to finish loading, then goes anyway. */
  readyTimeoutMs: 8000,
} as const;

/** PeerJS signaling server options. Defaults to the free PeerJS cloud; override with ?peerhost=&peerport=&peerpath=&peersecure=0 */
export function peerOptions(): Record<string, unknown> {
  const q = new URLSearchParams(location.search);
  const host = q.get('peerhost');
  if (!host) return {};
  return {
    host,
    port: Number(q.get('peerport') ?? 443),
    path: q.get('peerpath') ?? '/',
    secure: q.get('peersecure') !== '0',
  };
}
