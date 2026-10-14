/** Keyboard state + one-shot key press callbacks. Mouse steering lives in car/WheelInput.ts. */
export class Keyboard {
  private down = new Set<string>();
  private pressHandlers = new Map<string, Array<() => void>>();

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      e.preventDefault();
      // A focused button would otherwise be "clicked" by Space (e.g. PLAY while using the handbrake)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    if (e.repeat) return;
    this.down.add(e.code);
    const handlers = this.pressHandlers.get(e.code);
    if (handlers) for (const h of handlers) h();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
  };

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Register a callback for a single key press (no auto-repeat). Returns an unsubscribe function. */
  onPress(code: string, fn: () => void): () => void {
    const list = this.pressHandlers.get(code) ?? [];
    list.push(fn);
    this.pressHandlers.set(code, list);
    return () => {
      const l = this.pressHandlers.get(code);
      if (l) this.pressHandlers.set(code, l.filter((f) => f !== fn));
    };
  }
}
