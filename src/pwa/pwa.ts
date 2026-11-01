import { Emitter } from '../core/emitter';
import { isIOS, isStandalone } from '../core/device';

/** How the "Install app" option should behave right now. */
export type InstallMode = 'hidden' | 'prompt' | 'ios';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA support: registers the service worker (offline play) and exposes the "Install app" option.
 *  - Chromium / Android: captures `beforeinstallprompt` and shows the native install dialog on demand.
 *  - iOS Safari has no install API, so the UI shows "Share -> Add to Home Screen" instructions.
 *  - Already installed (standalone): the option is hidden.
 */
class PwaInstaller {
  readonly events = new Emitter<{ changed: [mode: InstallMode] }>();
  private deferred: BeforeInstallPromptEvent | null = null;
  private installed = isStandalone();

  init(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.events.emit('changed', this.mode);
    });
    window.addEventListener('appinstalled', () => {
      this.installed = true;
      this.deferred = null;
      this.events.emit('changed', this.mode);
    });
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        // Relative to the page so it also works under a sub-path (GitHub Pages)
        navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {
          /* offline support is optional */
        });
      });
    }
  }

  get mode(): InstallMode {
    if (this.installed) return 'hidden';
    if (this.deferred) return 'prompt';
    if (isIOS()) return 'ios';
    return 'hidden';
  }

  /** Show the native install dialog (only meaningful in 'prompt' mode). */
  async promptInstall(): Promise<boolean> {
    const e = this.deferred;
    if (!e) return false;
    this.deferred = null;
    await e.prompt();
    const choice = await e.userChoice;
    this.events.emit('changed', this.mode);
    return choice.outcome === 'accepted';
  }
}

export const pwa = new PwaInstaller();
