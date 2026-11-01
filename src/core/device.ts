/** Device / display-mode detection (touch layout, installed PWA, iOS quirks). */

/** True on phones/tablets (coarse primary pointer). `?touch=1` forces the touch layout for desktop testing. */
export function isTouchDevice(): boolean {
  try {
    if (new URLSearchParams(location.search).get('touch') === '1') return true;
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** True when running as an installed PWA (standalone / fullscreen window, or iOS home-screen app). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch points
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Best effort: fullscreen + landscape lock. Needs a user gesture; failures are ignored (iOS Safari has neither). */
export async function enterImmersiveMode(): Promise<void> {
  try {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* not allowed / unsupported */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    /* not allowed / unsupported */
  }
}
