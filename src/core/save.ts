import { SAVE_KEY } from '../config/gameConfig';

interface SaveShape {
  version: 1;
  money: number;
}

const DEFAULT_SAVE: SaveShape = { version: 1, money: 0 };

/**
 * Persistent player data. Wrapped in try/catch because localStorage can be unavailable
 * (private windows, blocked storage). Extend SaveShape for garage/upgrades later.
 */
class SaveDataStore {
  private data: SaveShape = { ...DEFAULT_SAVE };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SaveShape>;
      this.data = {
        version: 1,
        money: typeof parsed.money === 'number' && isFinite(parsed.money) ? Math.max(0, Math.floor(parsed.money)) : 0,
      };
    } catch {
      this.data = { ...DEFAULT_SAVE };
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable: keep the value in memory only */
    }
  }

  get money(): number {
    return this.data.money;
  }

  addMoney(amount: number): number {
    this.data.money = Math.max(0, Math.floor(this.data.money + amount));
    this.persist();
    return this.data.money;
  }
}

export const SaveData = new SaveDataStore();
