import type { AccountSave, Character, GameSettings, Item, OpenPortal, PanelPlace } from '../types';
import { VIDEO_EFFECTS } from '../types';
import { events } from './Events';
import { bindsAreValid, TEXT_SCALE_MIN, TEXT_SCALE_MAX } from './Access';
import { UNIQUE_TEXT } from '../data/story/uniqueText';
import { LEGACY_RUNE_IDS, RUNES } from '../data/gems';
import { migrateClassId } from '../data/classes';
import { INV_COLS, INV_ROWS, STASH_COLS, STASH_ROWS, findFit, repairLayout } from '../sim/Grid';
import { refreshFixedLines, rescaleOldSpeed } from '../sim/Loot';
import { beginRun, endRun, forfeitRun, type Forfeit } from '../sim/RunLedger';
import { tr } from './I18n';
import { FRAME_CAPS } from './FramePace';
import { HUD_SCALE_MAX, HUD_SCALE_MIN, MINIMAP_SCALE_MAX, MINIMAP_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_MIN } from './UiScale';

/**
 * The primary save. The key still says v1 because it predates versioning; the
 * real format version lives inside the save (`version`), and renaming the key
 * would orphan every existing player's account.
 */
export const SAVE_KEY = 'slay.account.v1';
/** A second copy of a save that loaded cleanly. Read only when the primary is damaged. */
export const BACKUP_KEY = 'slay.account.backup';
/** Raw text of a save that could not be read, kept so nothing is ever thrown away. */
export const CORRUPT_KEY = 'slay.account.corrupt';
/** Items and characters too damaged to load, kept for a later fix to restore. */
export const QUARANTINE_KEY = 'slay.account.quarantine';
/**
 * Ids of every hero who has died. Kept apart from the account on purpose: an
 * old export, the backup or a pasted save cannot bring a buried hero back, and
 * deleting the save does not clear it.
 */
export const GRAVE_KEY = 'slay.account.graves';
/** A save written by a newer build, kept untouched so going back a version never loses it. */
export const NEWER_KEY = `${CORRUPT_KEY}.newer`;
/** Rebuildable caches (rendered portraits) in the same storage. They always give way to the save. */
const CACHE_PREFIXES = ['slay.portrait.', 'slay.bossportrait.'];

/** Every cache key in `store`, when it can list its keys (`localStorage` can). */
function cacheKeys(store: SaveStore): string[] {
  const s = store as Partial<Storage>;
  if (typeof s.length !== 'number' || typeof s.key !== 'function') return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && CACHE_PREFIXES.some((p) => k.startsWith(p))) out.push(k);
  }
  return out;
}

/**
 * Removes a cache's entries from older builds: every `localStorage` key that
 * starts with `prefix` but not with `current`. Their art changed, so they are
 * never read again, and they used to stay for good.
 */
export function purgeStaleCache(prefix: string, current: string): void {
  try {
    const ls = globalThis.localStorage;
    const old: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(prefix) && !k.startsWith(current)) old.push(k);
    }
    for (const k of old) ls.removeItem(k);
  } catch {
    /* no storage */
  }
}

/**
 * Current save format.
 *
 *  1  the original shape
 *  2  roster made authoritative (the live character is the roster entry, not a
 *     copy of it), every field range-checked on load
 *  3  item attack and cast speed moved to the Wave 5 scale (smaller lines;
 *     every owned roll keeps its place in its range, `rescaleOldSpeed`)
 *  4  the story and the loot filter belong to each hero, not the account;
 *     the camp's news of the last map moved to `news`
 */
export const SAVE_VERSION = 4;

export const STASH_TAB_SIZE = STASH_COLS * STASH_ROWS; // 12 x 10 grid per tab
export const DEFAULT_STASH_TABS = 4;
/** Tabs a vault can grow to with gold. The Legacy tab comes on top. */
export const MAX_STASH_TABS = 10;
/**
 * What each bought tab costs, in order, past the four every vault starts
 * with. Paid from the bank first, then the live hero's purse.
 */
export const STASH_TAB_PRICES = [2_500, 6_000, 15_000, 40_000, 100_000, 250_000] as const;
/** Marks the free Legacy "Vault Extension" tab as granted, in `unlocks`. */
const LEGACY_TAB = 'vault:legacyTab';
/**
 * Tabs a vault may hold at all. Above the buying cap only because a vault
 * from before items took more than one cell may need extra room to unpack.
 */
export const STASH_TAB_CEILING = 40;
export const INVENTORY_SIZE = INV_COLS * INV_ROWS;

/** How often, at most, the backup copy is refreshed during play. */
const BACKUP_INTERVAL_MS = 2 * 60 * 1000;

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.85,
  ambienceVolume: 0.85,
  uiVolume: 0.85,
  voiceVolume: 0.85,
  muteInBackground: true,
  quality: 'high',
  autoQuality: true,
  showDamageNumbers: true,
  screenShake: 1,
  cameraDistance: 1,
  hints: true,
  titleCards: true,
  reduceMotion: false,
  showFps: false,
  frameCap: 0,
  brightness: 1,
  effectsOff: [],
  flashReduce: false,
  renderScale: 1,
  textScale: 1,
  uiScale: 1,
  hudScale: 1,
  minimapScale: 1,
  colorBlindRarity: false,
  trackerHidden: false,
  mapOverlay: false,
  mapOverlayOpacity: 0.7,
  mapOverlaySize: 1,
  keybinds: {},
};

const EQUIP_SLOTS = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];

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

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** The slice of `Storage` the save needs. Lets a checker run this under Node. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `localStorage`, or a memory stand-in when the browser refuses it (private
 * windows, blocked site data, sandboxed frames all throw on access). The game
 * still runs; it just cannot keep anything past the tab.
 */
function defaultStore(): SaveStore {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__slay_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* fall through */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

// ---------------------------------------------------------------------------
// Validation and repair
// ---------------------------------------------------------------------------

/** What happened on load, for the player and for checkers. */
export interface LoadReport {
  /** Where the account came from. */
  source: 'primary' | 'backup' | 'fresh';
  /** Format version the save was written in (0 when there was none). */
  fromVersion: number;
  /** Human-readable list of every repair made. Empty for a clean load. */
  repairs: string[];
  /** Items or characters moved aside because they could not be repaired. */
  quarantined: number;
  /** True when a damaged primary was set aside before recovering. */
  primaryDamaged: boolean;
  /** True when the save came from a newer build of the game. */
  newerVersion: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Repairer {
  repairs: string[] = [];
  quarantine: unknown[] = [];
  /** Set for saves before version 3: every item's speed lines move to today's scale. */
  oldSpeed = false;

  note(what: string): void {
    if (this.repairs.length < 200) this.repairs.push(what);
  }

  /** A finite number in [min, max], or `fallback` (noting the repair). */
  num(v: unknown, fallback: number, where: string, min = -Infinity, max = Infinity, int = false): number {
    if (!finite(v)) {
      if (v !== undefined) this.note(`${where}: ${String(v)} -> ${fallback}`);
      return fallback;
    }
    let n = Math.min(max, Math.max(min, v));
    if (int) n = Math.round(n);
    if (n !== v) this.note(`${where}: ${v} -> ${n}`);
    return n;
  }

  /**
   * An item, repaired in place where it can be. Returns null — and keeps the
   * original aside — only when there is nothing identifying left (no uid or no
   * base), because without those the game cannot draw or place it.
   */
  item(v: unknown, where: string): Item | null {
    if (v === null || v === undefined) return null;
    if (!isObj(v) || !isStr(v.uid) || !v.uid || !isStr(v.baseId) || !v.baseId) {
      this.note(`${where}: unreadable item set aside`);
      this.quarantine.push({ where, item: v });
      return null;
    }
    const it = v as unknown as Item;
    if (!isStr(it.name)) {
      it.name = it.baseId;
      this.note(`${where}: item had no name`);
    }
    if (!isStr(it.rarity)) {
      it.rarity = 'normal';
      this.note(`${where}: item had no rarity`);
    }
    it.ilvl = this.num(it.ilvl, 1, `${where}.ilvl`, 1, 9999, true);
    it.upgrade = this.num(it.upgrade, 0, `${where}.upgrade`, 0, 99, true);
    it.value = this.num(it.value, 1, `${where}.value`, 0);
    if (!Array.isArray(it.mods)) {
      it.mods = [];
      this.note(`${where}: item mods were missing`);
    } else {
      const before = it.mods.length;
      it.mods = it.mods.filter((m) => isObj(m) && isStr(m.affixId) && isStr(m.stat) && finite(m.value));
      if (it.mods.length !== before) this.note(`${where}: dropped ${before - it.mods.length} broken mods`);
    }
    // Lines the Enchanter laid out and the player has not picked from yet.
    if (it.offers !== undefined) {
      const o = it.offers as unknown;
      const mods = isObj(o) && Array.isArray(o.mods) ? o.mods.filter((m) => isObj(m) && isStr(m.affixId) && isStr(m.stat) && finite(m.value)) : [];
      if (!isObj(o) || (o.line !== null && !isStr(o.line)) || (o.kind !== 'prefix' && o.kind !== 'suffix') || mods.length === 0) {
        delete it.offers;
        this.note(`${where}: unreadable enchanter offers dropped`);
      } else it.offers.mods = mods as Item['mods'];
    }
    if (!Array.isArray(it.sockets)) {
      it.sockets = [];
      if ((v as Record<string, unknown>).sockets !== undefined) this.note(`${where}: sockets were not a list`);
    } else {
      // Runes cut before SLAY's own ladder take their new rune, in sockets too.
      it.sockets = it.sockets.map((s) => {
        const id = isObj(s) && isStr(s.gemId) ? s.gemId : null;
        return { gemId: id ? (LEGACY_RUNE_IDS[id] ?? id) : null };
      });
    }
    if (LEGACY_RUNE_IDS[it.baseId]) it.baseId = LEGACY_RUNE_IDS[it.baseId]!;
    // Uniques were renamed by the story pass; one that dropped before then
    // takes its current name. Silent, because nothing was damaged.
    if (isStr(it.uniqueId) && !isStr(it.setId)) {
      const name = UNIQUE_TEXT[it.uniqueId]?.name;
      if (name && it.name !== name) it.name = name;
    }
    // Speed lines from before the Wave 5 retune move to today's scale first,
    // so the refresh below holds them in today's ranges. Silent.
    if (this.oldSpeed) rescaleOldSpeed(it);
    // A unique or set piece found before each name had its own fixed lines
    // takes them now, at its own item level. Silent: nothing was damaged.
    if (isStr(it.uniqueId)) refreshFixedLines(it);
    // Runes took SLAY's own names; one picked up before then takes its new one.
    if (it.baseId.startsWith('rune.')) {
      const name = RUNES.find((r) => r.id === it.baseId)?.name;
      if (name && it.name !== name) it.name = name;
    }
    return it;
  }

  /** A list of item slots of exactly `length`, every entry an item or null. */
  slots(v: unknown, length: number, where: string): Array<Item | null> {
    const src = Array.isArray(v) ? v : [];
    if (!Array.isArray(v)) this.note(`${where}: was not a list`);
    const out = new Array<Item | null>(length).fill(null);
    for (let i = 0; i < src.length; i++) {
      const it = this.item(src[i], `${where}[${i}]`);
      if (!it) continue;
      if (i < length) out[i] = it;
      else {
        // Overflow past the grid goes into the first free slot, not the bin.
        const free = out.indexOf(null);
        if (free >= 0) out[free] = it;
        else {
          this.note(`${where}: no room for ${it.name}, set aside`);
          this.quarantine.push({ where, item: it });
        }
      }
    }
    return out;
  }

  /**
   * A character, repaired field by field. Only a character with no class can
   * not be rebuilt; everything else falls back to a safe value so the hero
   * survives a damaged save with as much of themselves as possible.
   */
  character(v: unknown, where: string): Character | null {
    if (v === null || v === undefined) return null;
    if (!isObj(v) || !isStr(v.classId) || !v.classId) {
      this.note(`${where}: unreadable character set aside`);
      this.quarantine.push({ where, character: v });
      return null;
    }
    const c = v as unknown as Character;
    // The Pyromancer and the Stormcaller became the Mage.
    c.classId = migrateClassId(c.classId);
    if (!isStr(c.id) || !c.id) {
      c.id = `recovered-${Date.now().toString(36)}-${this.repairs.length}`;
      this.note(`${where}: character had no id`);
    }
    if (!isStr(c.name) || !c.name.trim()) {
      c.name = 'Nameless'; // i18n-ignore: saved as the hero's own name, like one typed in
      this.note(`${where}: character had no name`);
    }
    const at = `${where}(${c.name})`;
    c.level = this.num(c.level, 1, `${at}.level`, 1, 999, true);
    c.xp = this.num(c.xp, 0, `${at}.xp`, 0);
    c.statPoints = this.num(c.statPoints, 0, `${at}.statPoints`, 0, 99999, true);
    c.skillPoints = this.num(c.skillPoints, 0, `${at}.skillPoints`, 0, 99999, true);
    c.gold = this.num(c.gold, 0, `${at}.gold`, 0);
    c.depthRecord = this.num(c.depthRecord, 0, `${at}.depthRecord`, 0, 1e6, true);
    c.playtime = this.num(c.playtime, 0, `${at}.playtime`, 0);
    c.createdAt = this.num(c.createdAt, Date.now(), `${at}.createdAt`, 0);

    const alloc = isObj(c.allocated) ? c.allocated : ({} as Character['allocated']);
    if (!isObj(c.allocated)) this.note(`${at}: attribute points were missing`);
    c.allocated = {
      strength: this.num(alloc.strength, 0, `${at}.strength`, 0, 99999, true),
      dexterity: this.num(alloc.dexterity, 0, `${at}.dexterity`, 0, 99999, true),
      vitality: this.num(alloc.vitality, 0, `${at}.vitality`, 0, 99999, true),
      energy: this.num(alloc.energy, 0, `${at}.energy`, 0, 99999, true),
    };

    const skills: Record<string, number> = {};
    if (isObj(c.skills)) {
      for (const [id, rank] of Object.entries(c.skills)) {
        if (finite(rank) && rank > 0) skills[id] = Math.round(rank);
        else if (rank !== 0) this.note(`${at}.skills.${id}: ${String(rank)} dropped`);
      }
    } else this.note(`${at}: skills were missing`);
    c.skills = skills;

    const bar = Array.isArray(c.hotbar) ? c.hotbar : [];
    if (!Array.isArray(c.hotbar)) this.note(`${at}: hotbar was missing`);
    c.hotbar = bar.map((s) => (isStr(s) ? s : null));
    while (c.hotbar.length < 6) c.hotbar.push(null);
    if (c.primaryAttack !== undefined && c.primaryAttack !== null && !isStr(c.primaryAttack)) {
      c.primaryAttack = null;
      this.note(`${at}: right-click skill was unreadable`);
    }

    const eq: Character['equipment'] = {};
    if (isObj(c.equipment)) {
      for (const [slot, raw] of Object.entries(c.equipment)) {
        if (!EQUIP_SLOTS.includes(slot)) {
          const it = this.item(raw, `${at}.equipment.${slot}`);
          if (it) {
            this.note(`${at}: ${it.name} was in unknown slot "${slot}", moved to the pack`);
            (c.inventory as unknown[]) = Array.isArray(c.inventory) ? c.inventory : [];
            (c.inventory as unknown[]).push(it);
          }
          continue;
        }
        const it = this.item(raw, `${at}.equipment.${slot}`);
        if (it) eq[slot as keyof Character['equipment']] = it;
      }
    } else this.note(`${at}: equipment was missing`);
    c.equipment = eq;

    const invLen = Math.max(INVENTORY_SIZE, Array.isArray(c.inventory) ? Math.min(c.inventory.length, 240) : 0);
    c.inventory = this.slots(c.inventory, invLen, `${at}.inventory`);
    this.runNote(c, at);
    this.openPortal(c, at);
    return c;
  }

  /**
   * A Trinket of Town's portal still standing in town (`sim/Trinkets.ts`).
   * One that does not read is closed: the hero is in town with everything
   * already, so all it costs is the rest of that map.
   */
  private openPortal(c: Character, at: string): void {
    const r = (c as { portal?: unknown }).portal;
    if (r === undefined) return;
    const q = isObj(r) ? r.quest : undefined;
    if (!isObj(r) || !finite(r.depth) || !finite(r.seed) || !finite(r.level) || !isObj(q) || !Array.isArray(q.objectives)) {
      delete c.portal;
      this.note(`${at}: an unreadable town portal was closed`);
      return;
    }
    const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => finite(n) && n >= 0).map(Math.floor) : []);
    const tiles = Array.isArray(r.used)
      ? r.used.filter((t): t is [number, number] => Array.isArray(t) && finite(t[0]) && finite(t[1])).map(([x, y]) => [Math.floor(x), Math.floor(y)] as [number, number])
      : [];
    const loot: NonNullable<Character['portal']>['loot'] = [];
    if (Array.isArray(r.loot)) {
      r.loot.forEach((l, i) => {
        if (!isObj(l) || !finite(l.x) || !finite(l.z)) return;
        const item = l.item === null ? null : this.item(l.item, `${at}.portal.loot[${i}]`);
        const gold = finite(l.gold) && l.gold > 0 ? Math.floor(l.gold) : 0;
        if (item || gold > 0) loot.push({ item, gold: item ? 0 : gold, x: l.x, z: l.z });
      });
    }
    const home = isObj(r.home) && finite(r.home.x) && finite(r.home.z) ? { x: r.home.x, z: r.home.z } : null;
    c.portal = {
      v: 1,
      at: this.num(r.at, Date.now(), `${at}.portal.at`, 0),
      depth: this.num(r.depth, 1, `${at}.portal.depth`, 1, 1e6, true),
      seed: Math.floor(r.seed) >>> 0,
      pacts: Array.isArray(r.pacts) ? r.pacts.filter(isStr) : [],
      name: isStr(r.name) ? r.name : '',
      level: this.num(r.level, 0, `${at}.portal.level`, 0, 64, true),
      x: this.num(r.x, 0, `${at}.portal.x`),
      z: this.num(r.z, 0, `${at}.portal.z`),
      killed: ints(r.killed),
      bossDead: r.bossDead === true,
      wardenDead: r.wardenDead === true,
      home,
      used: tiles,
      loot,
      vaultOpen: r.vaultOpen === true,
      quest: q as unknown as NonNullable<Character['portal']>['quest'],
      time: this.num(r.time, 0, `${at}.portal.time`, 0),
      ...(isStr(r.chart) ? { chart: r.chart } : {}),
    };
  }

  /**
   * The note of what a hero took down the map in progress (`sim/RunLedger.ts`).
   * A damaged one is dropped, which keeps what the hero holds now: losing
   * the note must never cost the player their gear.
   */
  private runNote(c: Character, at: string): void {
    const r = (c as { run?: unknown }).run;
    if (r === undefined) return;
    if (!isObj(r) || !isObj(r.equipment) || !Array.isArray(r.inventory)) {
      delete c.run;
      this.note(`${at}: the note of the map in progress was unreadable, dropped`);
      return;
    }
    const eq: Character['equipment'] = {};
    for (const [slot, raw] of Object.entries(r.equipment)) {
      if (!EQUIP_SLOTS.includes(slot)) continue;
      const it = this.item(raw, `${at}.run.equipment.${slot}`);
      if (it) eq[slot as keyof Character['equipment']] = it;
    }
    const materials: Record<string, number> = {};
    if (isObj(r.materials)) for (const [id, n] of Object.entries(r.materials)) if (finite(n) && n > 0) materials[id] = Math.floor(n);
    c.run = {
      v: 1,
      at: this.num(r.at, Date.now(), `${at}.run.at`, 0),
      depth: this.num(r.depth, 1, `${at}.run.depth`, 1, 1e6, true),
      equipment: eq,
      inventory: this.slots(r.inventory, Math.max(INVENTORY_SIZE, Math.min(r.inventory.length, 240)), `${at}.run.inventory`),
      gold: this.num(r.gold, 0, `${at}.run.gold`, 0),
      materials,
    };
  }
}

/**
 * Takes anything at all and returns a valid, current-version account, plus a
 * list of what had to be fixed. Never throws. This is the single gate every
 * save passes through, from disk, from the backup, or from an import.
 */
export function migrateAccount(raw: unknown): { data: AccountSave; report: LoadReport; quarantine: unknown[] } {
  const fx = new Repairer();
  const base = emptyAccount();
  const report: LoadReport = {
    source: 'primary',
    fromVersion: 0,
    repairs: fx.repairs,
    quarantined: 0,
    primaryDamaged: false,
    newerVersion: false,
  };
  if (!isObj(raw)) {
    fx.note('save was not an account');
    return { data: base, report, quarantine: fx.quarantine };
  }
  const s = raw as Partial<AccountSave> & Record<string, unknown>;
  const from = finite(s.version) ? s.version : 1;
  report.fromVersion = from;
  report.newerVersion = from > SAVE_VERSION;

  // --- versioned steps -----------------------------------------------------
  // Each step takes the account from version N to N+1 and only adds or
  // reshapes; the sanitising pass below then range-checks every field, so a
  // step never has to defend against garbage itself.
  if (from < 2) {
    // v1 -> v2: the roster did not exist in the earliest saves.
    if (!Array.isArray(s.roster)) s.roster = [];
  }
  // v2 -> v3: item speed lines shrank. Done per item in `Repairer.item`,
  // which every item in the account passes through below.
  if (from < 3) fx.oldSpeed = true;

  // --- sanitise --------------------------------------------------------------
  const out: AccountSave = { ...base };
  // Keep fields a newer build added, so loading in an older build and saving
  // again does not strip them.
  for (const [k, v] of Object.entries(s)) if (!(k in out)) (out as unknown as Record<string, unknown>)[k] = v;
  out.version = Math.max(SAVE_VERSION, from);

  // Tabs are never fewer than the items need: a damaged count must not push
  // a whole tab of someone's vault into the quarantine.
  const minTabs = Array.isArray(s.stash) ? Math.ceil(s.stash.length / STASH_TAB_SIZE) : 1;
  out.stashTabs = fx.num(s.stashTabs, Math.max(DEFAULT_STASH_TABS, minTabs), 'stashTabs', 1, STASH_TAB_CEILING, true);
  if (out.stashTabs < Math.min(STASH_TAB_CEILING, minTabs)) {
    fx.note(`stashTabs: ${out.stashTabs} -> ${Math.min(STASH_TAB_CEILING, minTabs)} to fit the vault`);
    out.stashTabs = Math.min(STASH_TAB_CEILING, minTabs);
  }
  out.stash = fx.slots(s.stash, STASH_TAB_SIZE * out.stashTabs, 'stash');
  out.bankGold = fx.num(s.bankGold, 0, 'bankGold', 0);
  out.bestDepth = fx.num(s.bestDepth, 0, 'bestDepth', 0, 1e6, true);

  out.fallen = [];
  if (Array.isArray(s.fallen)) {
    for (const f of s.fallen.slice(0, 50)) {
      if (!isObj(f)) continue;
      out.fallen.push({
        name: isStr(f.name) ? f.name : tr('Nameless'),
        classId: migrateClassId(isStr(f.classId) ? f.classId : 'warden'),
        level: finite(f.level) ? f.level : 1,
        depth: finite(f.depth) ? f.depth : 0,
        killedBy: isStr(f.killedBy) ? f.killedBy : 'something',
        at: finite(f.at) ? f.at : 0,
      });
    }
  } else if (s.fallen !== undefined) fx.note('memorial was not a list');

  out.unlocks = Array.isArray(s.unlocks) ? s.unlocks.filter(isStr) : [];

  out.materials = {};
  if (isObj(s.materials)) {
    for (const [id, n] of Object.entries(s.materials)) {
      if (finite(n) && n > 0) out.materials[id] = Math.floor(n);
      else if (n !== 0) fx.note(`materials.${id}: ${String(n)} dropped`);
    }
  }

  out.settings = sanitizeSettings(isObj(s.settings) ? s.settings : {}, fx);

  // The live character and the roster. `current` is the authoritative copy:
  // it is the one the game was mutating when the save was written. The roster
  // entry with the same id is replaced by it, so the two are one object again
  // after loading — otherwise picking the same hero from the roster later
  // hands back the copy as it was at boot, and the progress in between is lost.
  const cur = fx.character(s.current, 'current');
  const roster: Character[] = [];
  const seen = new Set<string>();
  if (Array.isArray(s.roster)) {
    s.roster.forEach((r, i) => {
      if (cur && isObj(r) && r.id === cur.id) {
        if (!seen.has(cur.id)) roster.push(cur);
        seen.add(cur.id);
        return;
      }
      const c = fx.character(r, `roster[${i}]`);
      if (!c || seen.has(c.id)) return;
      seen.add(c.id);
      roster.push(c);
    });
  }
  // A save from before the roster, or one whose roster lost the live hero:
  // without this they load and play fine but never appear in the list.
  if (cur && !seen.has(cur.id)) roster.unshift(cur);
  out.current = cur;
  out.roster = roster;
  fitGrids(out, fx);

  // v3 -> v4: the story and the loot filter were shared by every hero; now
  // each hero keeps their own (owner). Heroes already made keep a copy of
  // what they had, so nothing is lost; heroes made from now on start fresh.
  if (from < 4) {
    const old = isObj(s.story) ? s.story : null;
    for (const c of roster) {
      if (old && !c.story) {
        const own = structuredClone(old) as Record<string, unknown>;
        delete own.last;
        c.story = own as unknown as NonNullable<Character['story']>;
      }
      if (isObj(s.lootFilter) && !c.lootFilter) c.lootFilter = structuredClone(s.lootFilter) as Character['lootFilter'];
    }
    if (old && isObj(old.last)) out.news = old.last as unknown as AccountSave['news'];
  }
  delete out.story;
  delete out.lootFilter;
  const news = out.news as unknown;
  if (news !== undefined && !(isObj(news) && (news.kind === 'cleared' || news.kind === 'died') && finite(news.at) && finite(news.depth) && isStr(news.name))) {
    delete out.news;
    fx.note('camp news did not read');
  }

  report.quarantined = fx.quarantine.length;
  return { data: out, report, quarantine: fx.quarantine };
}

/**
 * Items cover blocks of cells. A pack or vault saved before that (or damaged)
 * can have items lying on top of each other; this unpacks them. Items in a
 * legal spot stay where they are. What a pack cannot hold goes to the vault,
 * and the vault grows tabs, past the buying cap if it must, before anything
 * is set aside.
 */
function fitGrids(out: AccountSave, fx: Repairer): void {
  const spill: Item[] = [];
  const heroes = new Set<Character>(out.roster);
  if (out.current) heroes.add(out.current);
  for (const c of heroes) {
    const extra = c.inventory.slice(INVENTORY_SIZE).filter((it): it is Item => !!it);
    c.inventory.length = INVENTORY_SIZE;
    for (let i = 0; i < INVENTORY_SIZE; i++) if (c.inventory[i] === undefined) c.inventory[i] = null;
    const left = repairLayout(c.inventory);
    for (const it of [...extra, ...left]) {
      const at = findFit(c.inventory, it);
      if (at >= 0) c.inventory[at] = it;
      else {
        fx.note(`${c.name}: no room in the pack for ${it.name}, moved to the vault`);
        spill.push(it);
      }
    }
  }
  spill.push(...repairLayout(out.stash));
  for (const it of spill) {
    let at = findFit(out.stash, it);
    while (at < 0 && out.stashTabs < STASH_TAB_CEILING) {
      out.stashTabs++;
      out.stash.push(...new Array<Item | null>(STASH_TAB_SIZE).fill(null));
      fx.note(`stash: added tab ${out.stashTabs} to fit everything`);
      at = findFit(out.stash, it);
    }
    if (at >= 0) out.stash[at] = it;
    else {
      fx.note(`stash: no room for ${it.name}, set aside`);
      fx.quarantine.push({ where: 'stash', item: it });
    }
  }
}

function sanitizeSettings(s: Record<string, unknown>, fx: Repairer): GameSettings {
  const d = DEFAULT_SETTINGS;
  const out: GameSettings = { ...d };
  // Keep unknown keys: a setting another build added survives a round trip.
  for (const [k, v] of Object.entries(s)) if (!(k in out)) (out as unknown as Record<string, unknown>)[k] = v;
  const vol = (k: 'masterVolume' | 'musicVolume' | 'sfxVolume') => {
    out[k] = s[k] === undefined ? d[k] : fx.num(s[k], d[k], `settings.${k}`, 0, 1);
  };
  vol('masterVolume');
  vol('musicVolume');
  vol('sfxVolume');
  // A save from before these had their own sliders keeps the mix it had:
  // all three were the effects slider.
  for (const k of ['ambienceVolume', 'uiVolume', 'voiceVolume'] as const) {
    out[k] = s[k] === undefined ? out.sfxVolume : fx.num(s[k], out.sfxVolume, `settings.${k}`, 0, 1);
  }
  out.quality = (['low', 'medium', 'high', 'ultra'] as const).includes(s.quality as GameSettings['quality'])
    ? (s.quality as GameSettings['quality'])
    : d.quality;
  out.showDamageNumbers = typeof s.showDamageNumbers === 'boolean' ? s.showDamageNumbers : d.showDamageNumbers;
  out.screenShake = s.screenShake === undefined ? d.screenShake : fx.num(s.screenShake, d.screenShake, 'settings.screenShake', 0, 2);
  out.cameraDistance =
    s.cameraDistance === undefined ? d.cameraDistance : fx.num(s.cameraDistance, d.cameraDistance, 'settings.cameraDistance', 0.5, 2);
  out.frameCap = FRAME_CAPS.includes(Number(s.frameCap)) ? Number(s.frameCap) : d.frameCap;
  out.brightness = s.brightness === undefined ? d.brightness : fx.num(s.brightness, d.brightness ?? 1, 'settings.brightness', 0.7, 1.4);
  out.effectsOff = Array.isArray(s.effectsOff) ? VIDEO_EFFECTS.filter((e) => (s.effectsOff as unknown[]).includes(e)) : [];
  out.renderScale =
    s.renderScale === undefined ? d.renderScale : fx.num(s.renderScale, d.renderScale ?? 1, 'settings.renderScale', 0.5, 1);
  out.textScale =
    s.textScale === undefined ? d.textScale : fx.num(s.textScale, d.textScale ?? 1, 'settings.textScale', TEXT_SCALE_MIN, TEXT_SCALE_MAX);
  out.uiScale = s.uiScale === undefined ? d.uiScale : fx.num(s.uiScale, 1, 'settings.uiScale', UI_SCALE_MIN, UI_SCALE_MAX);
  out.hudScale = s.hudScale === undefined ? d.hudScale : fx.num(s.hudScale, 1, 'settings.hudScale', HUD_SCALE_MIN, HUD_SCALE_MAX);
  out.minimapScale =
    s.minimapScale === undefined ? d.minimapScale : fx.num(s.minimapScale, 1, 'settings.minimapScale', MINIMAP_SCALE_MIN, MINIMAP_SCALE_MAX);
  out.mapOverlayOpacity =
    s.mapOverlayOpacity === undefined ? d.mapOverlayOpacity : fx.num(s.mapOverlayOpacity, d.mapOverlayOpacity ?? 0.7, 'settings.mapOverlayOpacity', 0.2, 1);
  out.mapOverlaySize =
    s.mapOverlaySize === undefined ? d.mapOverlaySize : fx.num(s.mapOverlaySize, d.mapOverlaySize ?? 1, 'settings.mapOverlaySize', 0.5, 2);
  // Panel places: keep only well-formed entries; a bad one just recentres.
  if (isObj(s.panelPlaces)) {
    const places: Record<string, PanelPlace> = {};
    for (const [id, v] of Object.entries(s.panelPlaces)) {
      if (!isObj(v) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
      places[id] = { x: Number(v.x), y: Number(v.y), dock: v.dock === 'left' || v.dock === 'right' ? v.dock : null };
    }
    out.panelPlaces = places;
  }
  out.colorBlindRarity = typeof s.colorBlindRarity === 'boolean' ? s.colorBlindRarity : d.colorBlindRarity;
  // Plain on/off settings, including ones other streams add: keep the saved
  // value when it is a boolean, the default otherwise.
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'boolean') (out as unknown as Record<string, unknown>)[k] = typeof s[k] === 'boolean' ? s[k] : v;
  }
  if (s.keybinds === undefined) out.keybinds = {};
  else if (bindsAreValid(s.keybinds)) out.keybinds = { ...s.keybinds };
  else {
    // A broken key map could leave an action with no key at all. Start over.
    fx.note('settings.keybinds were not a clean swap; reset to defaults');
    out.keybinds = {};
  }
  return out;
}

/** True when a parsed blob is plausibly an account rather than any old JSON. */
function looksLikeAccount(v: unknown): boolean {
  return isObj(v) && ('stash' in v || 'roster' in v || 'current' in v || 'bankGold' in v || 'fallen' in v);
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/**
 * Account persistence — the stash, gold, and the memorial of dead characters
 * all survive death. The live character does not; `killCharacter` is what
 * makes the roguelike loop bite.
 *
 * Safety, in order:
 *  - every load goes through `migrateAccount`, which repairs field by field
 *    and only ever sets aside what cannot be repaired (into the quarantine)
 *  - a primary that will not parse is copied aside and the backup is used
 *  - the backup is refreshed from a clean load and every couple of minutes
 *  - a second tab writing the same save stops this one writing over it
 */
export class SaveManager {
  private data: AccountSave = emptyAccount();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBackupAt = 0;
  private store: SaveStore;
  private warnedWriteFail = false;

  /** What the last `load()` found. */
  loadReport: LoadReport = {
    source: 'fresh',
    fromVersion: 0,
    repairs: [],
    quarantined: 0,
    primaryDamaged: false,
    newerVersion: false,
  };

  /**
   * Set when another tab wrote the save. From then on this tab never writes,
   * because whatever it holds is older than what is on disk.
   */
  readOnly = false;

  /** Number of writes that failed (quota, blocked storage). */
  writeFailures = 0;

  /** Heroes whose map the last load settled (`settleLeftMaps`), by id. */
  private forfeits = new Map<string, Forfeit>();

  constructor(store?: SaveStore) {
    this.store = store ?? defaultStore();
  }

  /** Swap the backing store. For checkers only. */
  useStore(store: SaveStore): void {
    this.store = store;
  }

  load(): AccountSave {
    this.readOnly = false;
    let raw: string | null = null;
    try {
      raw = this.store.getItem(SAVE_KEY);
    } catch (err) {
      console.warn('[save] storage unreadable', err);
    }

    if (raw === null) {
      // A missing primary is a new player or a deliberate delete. Never
      // resurrect the backup for it.
      this.data = emptyAccount();
      this.loadReport = { ...this.loadReport, source: 'fresh', fromVersion: 0, repairs: [], quarantined: 0, primaryDamaged: false, newerVersion: false };
      return this.data;
    }

    const primary = this.parse(raw);
    if (primary !== undefined) {
      this.adopt(primary, 'primary', false);
      if (this.loadReport.newerVersion) this.keepCopy(NEWER_KEY, raw);
      // A clean load is the best possible backup.
      else if (this.loadReport.repairs.length === 0) this.writeBackup(raw);
      return this.data;
    }

    // The primary is damaged. Keep its text, then try the backup.
    console.warn('[save] primary save unreadable, trying the backup');
    this.keepCopy(CORRUPT_KEY, raw);
    let backupRaw: string | null = null;
    try {
      backupRaw = this.store.getItem(BACKUP_KEY);
    } catch {
      /* ignore */
    }
    const backup = backupRaw !== null ? this.parse(backupRaw) : undefined;
    if (backup !== undefined) {
      this.adopt(backup, 'backup', true);
      // Put the recovered account back as the primary straight away.
      this.dirty = true;
      this.flush();
      return this.data;
    }

    console.error('[save] backup unreadable too; starting a new account (damaged save kept)');
    this.data = emptyAccount();
    this.loadReport = {
      source: 'fresh',
      fromVersion: 0,
      repairs: [tr('the save and its backup were both unreadable')],
      quarantined: 0,
      primaryDamaged: true,
      newerVersion: false,
    };
    return this.data;
  }

  /** JSON text to an account-shaped object, or undefined if it is not one. */
  private parse(raw: string): unknown {
    try {
      const v = JSON.parse(raw) as unknown;
      return looksLikeAccount(v) ? v : undefined;
    } catch {
      return undefined;
    }
  }

  private adopt(parsed: unknown, source: 'primary' | 'backup', primaryDamaged: boolean): void {
    const { data, report, quarantine } = migrateAccount(parsed);
    this.data = data;
    this.loadReport = { ...report, source, primaryDamaged };
    this.keepTheDeadDead();
    this.settleLeftMaps();
    if (quarantine.length) this.addToQuarantine(quarantine);
    if (report.repairs.length) {
      console.warn(`[save] repaired ${report.repairs.length} problems on load`, report.repairs.slice(0, 20));
      this.dirty = true;
    }
  }

  private graves(): string[] {
    try {
      const v = JSON.parse(this.store.getItem(GRAVE_KEY) ?? '[]') as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private bury(id: string): void {
    const list = this.graves();
    if (list.includes(id)) return;
    list.push(id);
    try {
      this.store.setItem(GRAVE_KEY, JSON.stringify(list.slice(-5000)));
    } catch (err) {
      console.warn('[save] could not record a death', err);
    }
  }

  /**
   * A hero saved mid-map left it without ending it: the game closed, the
   * page reloaded, the browser crashed. They wake in town as they went down,
   * less a little experience (`sim/RunLedger.ts`), and are told so there.
   */
  private settleLeftMaps(): void {
    this.forfeits.clear();
    for (const c of new Set([...this.roster, ...(this.data.current ? [this.data.current] : [])])) {
      if (!c.run) continue;
      const f = this.settle(c);
      if (f) this.forfeits.set(c.id, f);
      this.dirty = true;
    }
  }

  /** Puts `c` back as they went down the map, and fits the pack again. */
  private settle(c: Character): Forfeit | null {
    const f = forfeitRun(c, this.data.materials);
    if (!f) return null;
    for (let i = c.inventory.length; i < INVENTORY_SIZE; i++) c.inventory[i] = null;
    for (const it of repairLayout(c.inventory)) {
      const at = findFit(c.inventory, it);
      if (at >= 0) c.inventory[at] = it;
      else if (!this.stashItem(it)) this.addToQuarantine([{ where: `${c.name}.run`, item: it }]);
    }
    return f;
  }

  /** Death is permanent: a loaded account loses any hero who already died. */
  private keepTheDeadDead(): void {
    const dead = new Set(this.graves());
    if (dead.size === 0) return;
    const list = this.roster;
    const kept = list.filter((c) => !dead.has(c.id));
    this.data.roster = kept;
    if (this.data.current && dead.has(this.data.current.id)) this.data.current = null;
    if (kept.length !== list.length) this.dirty = true;
  }

  private addToQuarantine(items: unknown[]): void {
    try {
      const prev = JSON.parse(this.store.getItem(QUARANTINE_KEY) ?? '[]') as unknown;
      const list = Array.isArray(prev) ? prev : [];
      list.push(...items.map((x) => ({ at: Date.now(), ...((isObj(x) ? x : { value: x }) as object) })));
      this.store.setItem(QUARANTINE_KEY, JSON.stringify(list.slice(-200)));
    } catch (err) {
      console.warn('[save] could not keep quarantined data', err);
    }
  }

  private keepCopy(key: string, raw: string): void {
    try {
      this.store.setItem(key, raw);
    } catch {
      /* best effort; a full disk is why we are here sometimes */
    }
  }

  private writeBackup(raw: string): void {
    for (let tries = 0; tries < 2; tries++) {
      try {
        this.store.setItem(BACKUP_KEY, raw);
        this.lastBackupAt = Date.now();
        return;
      } catch (err) {
        // Full: rendered portraits go before the backup does.
        if (tries === 0 && this.dropCaches() > 0) continue;
        console.warn('[save] backup write failed', err);
        return;
      }
    }
  }

  /** Deletes the rebuildable caches (portraits) to make room. Returns how many went. */
  private dropCaches(): number {
    const keys = cacheKeys(this.store);
    for (const k of keys) {
      try {
        this.store.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    return keys.length;
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
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 900);
  }

  flush(): void {
    if (!this.dirty) return;
    if (this.readOnly) return;
    let text: string;
    try {
      text = JSON.stringify(this.data);
    } catch (err) {
      // A cycle or a BigInt somewhere in the account. Writing nothing keeps
      // the last good save on disk, which is the right failure.
      console.error('[save] account could not be serialised', err);
      this.reportWriteFailure();
      return;
    }
    try {
      this.store.setItem(SAVE_KEY, text);
      this.dirty = false;
      this.writeFailures = 0;
      if (Date.now() - this.lastBackupAt > BACKUP_INTERVAL_MS) this.writeBackup(text);
    } catch (err) {
      // Quota exceeded is the realistic failure: a huge stash of rolled items.
      // Rendered portraits go first; they are drawn again when next shown.
      console.error('[save] write failed', err);
      if (this.dropCaches() > 0) {
        try {
          this.store.setItem(SAVE_KEY, text);
          this.dirty = false;
          this.writeFailures = 0;
          return;
        } catch {
          /* still full */
        }
      }
      // Then the backup, and try once more.
      try {
        this.store.removeItem(BACKUP_KEY);
        this.store.removeItem(CORRUPT_KEY);
        this.store.setItem(SAVE_KEY, text);
        this.dirty = false;
        return;
      } catch {
        /* still full */
      }
      this.reportWriteFailure();
    }
  }

  private reportWriteFailure(): void {
    this.writeFailures++;
    if (this.warnedWriteFail) return;
    this.warnedWriteFail = true;
    events.emit('toast', { text: tr('Could not save. Your browser storage may be full.'), kind: 'bad' });
  }

  /**
   * Another tab just wrote the save. Called from the `storage` event.
   * Everything this tab holds is now older than what is on disk.
   */
  foreignWrite(): void {
    if (this.readOnly) return;
    this.readOnly = true;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    events.emit('toast', {
      text: tr('SLAY is open in another tab. This tab has stopped saving. Reload it to continue here.'),
      kind: 'bad',
    });
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

  /** The live hero goes down a map: what they carry is written down first. */
  beginRun(depth: number): void {
    const c = this.data.current;
    if (!c) return;
    // A note still open is a map that never ended: it is settled first.
    if (c.run) {
      const f = this.settle(c);
      if (f) this.forfeits.set(c.id, f);
    }
    beginRun(c, this.data.materials, depth);
    this.touch();
    this.flush();
  }

  /** The map ended well (its last exit, the waypoint): the hero keeps everything. */
  endRun(): void {
    const c = this.data.current;
    if (!c?.run) return;
    endRun(c);
    this.touch();
  }

  /**
   * The live hero leaves the map early, from the menu: back as they went
   * down, less some experience. Null if no map was in progress.
   */
  forfeitRun(): Forfeit | null {
    const c = this.data.current;
    if (!c?.run) return null;
    const f = this.settle(c);
    // Told in town, wherever the hero went (`takeForfeit`).
    if (f) this.forfeits.set(c.id, f);
    this.touch();
    this.flush();
    return f;
  }

  /**
   * The live hero steps through a Trinket of Town's portal: home with
   * everything, and the map kept in `portal` to go back to.
   */
  leaveByPortal(portal: OpenPortal): void {
    const c = this.data.current;
    if (!c) return;
    endRun(c);
    c.portal = portal;
    this.touch();
    this.flush();
  }

  /** The live hero's portal closes: they went back through it, or shut it from town. */
  closePortal(): void {
    const c = this.data.current;
    if (!c?.portal) return;
    delete c.portal;
    this.touch();
    this.flush();
  }

  /** What the last load's settling took from hero `id`, once. */
  takeForfeit(id: string): Forfeit | null {
    const f = this.forfeits.get(id) ?? null;
    this.forfeits.delete(id);
    return f;
  }

  /**
   * Kill the live character. Gear on the corpse is lost; the stash is not.
   * This is the whole roguelike contract in one method.
   */
  killCharacter(killedBy: string, depth: number): void {
    const c = this.data.current;
    if (c) {
      this.bury(c.id);
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
    if (!Number.isFinite(n)) return;
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
  firstFreeStashSlot(item?: Item): number {
    return item ? findFit(this.data.stash, item) : this.data.stash.indexOf(null);
  }

  stashItem(item: Item): boolean {
    const i = this.firstFreeStashSlot(item);
    if (i < 0) return false;
    this.data.stash[i] = item;
    this.touch();
    return true;
  }

  private addStashTab(): void {
    this.data.stashTabs++;
    this.data.stash.push(...new Array<Item | null>(STASH_TAB_SIZE).fill(null));
    this.touch();
  }

  /** Gold for the next vault tab, or null when no more can be bought. */
  stashTabPrice(): number | null {
    const legacy = this.data.unlocks.includes(LEGACY_TAB) ? 1 : 0;
    const bought = Math.max(0, this.data.stashTabs - DEFAULT_STASH_TABS - legacy);
    return bought < STASH_TAB_PRICES.length ? STASH_TAB_PRICES[bought]! : null;
  }

  /** Buys a vault tab with banked gold, then the live hero's gold. */
  buyStashTab(): 'ok' | 'max' | 'gold' {
    const price = this.stashTabPrice();
    if (price === null) return 'max';
    const c = this.data.current;
    if (this.data.bankGold + (c?.gold ?? 0) < price) return 'gold';
    const fromBank = Math.min(this.data.bankGold, price);
    this.data.bankGold -= fromBank;
    if (c) c.gold -= price - fromBank;
    this.addStashTab();
    return 'ok';
  }

  /** The Legacy "Vault Extension" tab: free, once, and on top of the bought ones. */
  grantStashTab(): void {
    if (this.data.unlocks.includes(LEGACY_TAB)) return;
    this.data.unlocks.push(LEGACY_TAB);
    this.addStashTab();
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

  /**
   * Refresh the backup now if it is stale. Called on scene changes, which are
   * natural "the world is consistent" moments.
   */
  checkpoint(): void {
    if (this.readOnly) return;
    this.flush();
    if (Date.now() - this.lastBackupAt < BACKUP_INTERVAL_MS) return;
    try {
      const raw = this.store.getItem(SAVE_KEY);
      if (raw !== null && this.parse(raw) !== undefined) this.writeBackup(raw);
    } catch {
      /* ignore */
    }
  }

  /** Wipes everything. Used by the settings "delete save" action. */
  hardReset(): void {
    this.data = emptyAccount();
    this.dirty = false;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Every copy of the account; the graves stay on purpose (see GRAVE_KEY).
    for (const k of [SAVE_KEY, BACKUP_KEY, CORRUPT_KEY, NEWER_KEY, QUARANTINE_KEY]) {
      try {
        this.store.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }

  exportSave(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
  }

  /**
   * Replace the account with a pasted export. Anything that is not a readable
   * account is refused and the current save is left exactly as it was. The
   * account being replaced becomes the backup, so a bad import is one
   * recovery away rather than permanent.
   */
  importSave(blob: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(escape(atob(blob.trim()))));
    } catch {
      return false;
    }
    if (!looksLikeAccount(parsed)) return false;
    try {
      this.writeBackup(JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
    this.adopt(parsed, 'primary', false);
    this.readOnly = false;
    this.dirty = true;
    this.flush();
    return true;
  }
}

export const save = new SaveManager();

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Best-effort flush on tab close.
  window.addEventListener('beforeunload', () => save.flush());
  window.addEventListener('pagehide', () => save.flush());
  // `storage` fires only in *other* tabs of the same origin, so any event for
  // the save key means a second copy of the game is writing it.
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY || e.key === null) save.foreignWrite();
  });
  events.on('scene:change', () => save.checkpoint());
}
