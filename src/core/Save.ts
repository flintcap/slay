import type { AccountSave, Character, GameSettings, Item } from '../types';

const KEY = 'slay.account.v1';
const SAVE_VERSION = 1;

export const STASH_TAB_SIZE = 120; // 12 x 10 grid per tab
export const DEFAULT_STASH_TABS = 4;
export const INVENTORY_SIZE = 60;

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.85,
  quality: 'high',
  showDamageNumbers: true,
  screenShake: 1,
  cameraDistance: 1,
};

function emptyAccount(): AccountSave {
  return {
    version: SAVE_VERSION,
    stash: new Array<Item | null>(STASH_TAB_SIZE * DEFAULT_STASH_TABS).fill(null),
    stashTabs: DEFAULT_STASH_TABS,
    bankGold: 0,
    bestDepth: 0,
    fallen: [],
    unlocks: [],
    current: null,
    roster: [],
    materials: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Account persistence — the stash, gold, and the memorial of dead characters
 * all survive death. The live character does not; `clearCharacter` is what
 * makes the roguelike loop bite.
 */
class SaveManager {
  private data: AccountSave = emptyAccount();
  private dirty = false;
  private flushTimer: number | null = null;

  load(): AccountSave {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AccountSave;
        this.data = this.migrate(parsed);
      }
    } catch (err) {
      console.warn('[save] could not read save, starting fresh', err);
      this.data = emptyAccount();
    }
    // Defend against a truncated or hand-edited save.
    const want = STASH_TAB_SIZE * this.data.stashTabs;
    if (this.data.stash.length !== want) {
      const next = new Array<Item | null>(want).fill(null);
      for (let i = 0; i < Math.min(want, this.data.stash.length); i++) next[i] = this.data.stash[i] ?? null;
      this.data.stash = next;
    }
    this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings };
    return this.data;
  }

  private migrate(save: AccountSave): AccountSave {
    if (!save || typeof save !== 'object') return emptyAccount();
    const base = emptyAccount();
    const merged: AccountSave = { ...base, ...save, settings: { ...base.settings, ...save.settings } };
    merged.version = SAVE_VERSION;
    if (!Array.isArray(merged.stash)) merged.stash = base.stash;
    if (!Array.isArray(merged.fallen)) merged.fallen = [];
    if (!merged.materials || typeof merged.materials !== 'object') merged.materials = {};
    return merged;
  }

  get account(): AccountSave {
    return this.data;
  }

  get settings(): GameSettings {
    return this.data.settings;
  }

  /** Mark dirty; the write is debounced so loot pickup does not hammer disk. */
  touch(): void {
    this.dirty = true;
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 900);
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      this.dirty = false;
    } catch (err) {
      // Quota exceeded is the realistic failure: a huge stash of rolled items.
      console.error('[save] write failed', err);
    }
  }

  setCharacter(c: Character | null): void {
    this.data.current = c;
    if (c) this.upsertRoster(c);
    this.touch();
    this.flush();
  }

  /** Every living character on the account, newest first. */
  get roster(): Character[] {
    if (!Array.isArray(this.data.roster)) this.data.roster = [];
    return this.data.roster;
  }

  /**
   * Keeps the roster in step with the live character.
   *
   * The roster holds the same object the game is mutating, so playing a
   * character updates their roster entry for free. Only identity matters here.
   */
  private upsertRoster(c: Character): void {
    const list = this.roster;
    const at = list.findIndex((x) => x.id === c.id);
    if (at >= 0) list[at] = c;
    else list.unshift(c);
  }

  /** Switch to another character on the roster. */
  selectCharacter(id: string): Character | null {
    const found = this.roster.find((c) => c.id === id) ?? null;
    if (!found) return null;
    this.data.current = found;
    this.touch();
    this.flush();
    return found;
  }

  /** Retire a character deliberately, without it counting as a death. */
  deleteCharacter(id: string): void {
    const list = this.roster;
    const at = list.findIndex((c) => c.id === id);
    if (at >= 0) list.splice(at, 1);
    if (this.data.current?.id === id) this.data.current = null;
    this.touch();
    this.flush();
  }

  /**
   * Kill the live character. Gear on the corpse is lost; the stash is not.
   * This is the whole roguelike contract in one method.
   */
  killCharacter(killedBy: string, depth: number): void {
    const c = this.data.current;
    if (c) {
      this.data.fallen.unshift({
        name: c.name,
        classId: c.classId,
        level: c.level,
        depth,
        killedBy,
        at: Date.now(),
      });
      if (this.data.fallen.length > 50) this.data.fallen.length = 50;
      if (depth > this.data.bestDepth) this.data.bestDepth = depth;
      // Permadeath removes them from the roster as well as from play.
      const list = this.roster;
      const at = list.findIndex((x) => x.id === c.id);
      if (at >= 0) list.splice(at, 1);
    }
    this.data.current = null;
    this.touch();
    this.flush();
  }

  addMaterial(id: string, n: number): void {
    this.data.materials[id] = (this.data.materials[id] ?? 0) + n;
    if (this.data.materials[id]! <= 0) delete this.data.materials[id];
    this.touch();
  }

  materialCount(id: string): number {
    return this.data.materials[id] ?? 0;
  }

  spendMaterial(id: string, n: number): boolean {
    if (this.materialCount(id) < n) return false;
    this.addMaterial(id, -n);
    return true;
  }

  /** First free stash index, or -1. */
  firstFreeStashSlot(): number {
    return this.data.stash.indexOf(null);
  }

  stashItem(item: Item): boolean {
    const i = this.firstFreeStashSlot();
    if (i < 0) return false;
    this.data.stash[i] = item;
    this.touch();
    return true;
  }

  addStashTab(): boolean {
    if (this.data.stashTabs >= 10) return false;
    this.data.stashTabs++;
    this.data.stash.push(...new Array<Item | null>(STASH_TAB_SIZE).fill(null));
    this.touch();
    return true;
  }

  unlock(id: string): void {
    if (!this.data.unlocks.includes(id)) {
      this.data.unlocks.push(id);
      this.touch();
    }
  }

  hasUnlock(id: string): boolean {
    return this.data.unlocks.includes(id);
  }

  /** Wipes everything. Used by the settings "delete save" action. */
  hardReset(): void {
    this.data = emptyAccount();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  exportSave(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
  }

  importSave(blob: string): boolean {
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(blob)))) as AccountSave;
      this.data = this.migrate(parsed);
      this.touch();
      this.flush();
      return true;
    } catch {
      return false;
    }
  }
}

export const save = new SaveManager();

// Best-effort flush on tab close.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => save.flush());
  window.addEventListener('pagehide', () => save.flush());
}
