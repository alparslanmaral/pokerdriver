/* eslint-disable @typescript-eslint/no-explicit-any */
/** Minimal typed event emitter used to decouple game systems from UI/FX. */
export class Emitter<Events extends { [K in keyof Events]: any[] }> {
  private listeners = new Map<keyof Events, Set<(...args: any[]) => void>>();

  on<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }

  clear(): void {
    this.listeners.clear();
  }
}
