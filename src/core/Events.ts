import type { Item, DamageType, SceneId, MonsterRank, ItemRarity } from '../types';

/**
 * Global typed event bus. Systems publish; UI and FX subscribe. Keeps the
 * simulation from holding references to presentation code.
 */
export interface GameEvents {
  'scene:change': { from: SceneId; to: SceneId };
  /**
   * A scene swap has faded to black and is about to build `to`. Fires before
   * the (possibly slow) `enter`, so the loading card can say where we are going.
   */
  'scene:loading': { from: SceneId; to: SceneId; payload?: unknown };
  'player:damaged': { amount: number; type: DamageType; life: number; maxLife: number };
  'player:healed': { amount: number };
  'player:died': { killedBy: string; depth: number };
  /** A hit passed through the hero's dodge. Combat emits; feel may reward it. */
  'player:evaded': { ability: string; source: string };
  /**
   * A skill landed on a target another of your skills hit moments before
   * (`sim/Combos.ts`). `name` is the class's combo ('Break', 'Flashpoint'...).
   */
  'combat:combo': { id: string; name: string; setup: string; payoff: string; bonusPct: number; x: number; y: number; z: number };
  'player:levelUp': { level: number; statPoints: number; skillPoints: number };
  'player:xp': { gained: number; total: number; toNext: number };
  'enemy:damaged': {
    id: string;
    amount: number;
    type: DamageType;
    crit: boolean;
    x: number;
    y: number;
    z: number;
  };
  'enemy:killed': { id: string; monsterId: string; rank: MonsterRank; x: number; z: number };
  'loot:dropped': { item: Item; x: number; z: number };
  'loot:pickedUp': { item: Item };
  /**
   * The player threw something away. The active scene puts it on the floor at
   * their feet; the UI has already taken it out of the pack.
   */
  'loot:discard': { item: Item };
  'loot:gold': { amount: number };
  'item:equipped': { item: Item };
  'item:unequipped': { item: Item };
  'quest:progress': { index: number; progress: number; target: number; desc: string };
  'quest:complete': { name: string };
  'depth:changed': {
    depth: number;
    level: number;
    of: number;
    place?: string;
    /** One line of flavour for the place, shown on the floor's title card. */
    blurb?: string;
    /** Biome id, so the title card can take the biome's colour. */
    biome?: string;
    /** On a boss floor, the boss waiting on it (story shows the floor's lore). */
    bossId?: string;
  };
  /** A run was finished and banked. Fires once, on the way back to town. */
  'run:cleared': { depth: number };
  'boss:engaged': { name: string; title: string; maxLife: number };
  'boss:phase': { name: string; bark?: string; index: number };
  'boss:damaged': { life: number; maxLife: number };
  'boss:killed': { name: string };
  /** A boss began winding up an ability. `windup` is the tell in seconds. */
  'boss:cast': { name: string; ability: string; windup: number };
  /** The fight ran long: the boss is enraged for the rest of it. */
  'boss:enraged': { name: string };
  /** A floor's mini-boss noticed the hero. `title` names its mechanic. */
  'miniboss:engaged': { id: string; name: string; title: string; kind: string };
  'miniboss:killed': { id: string; name: string; kind: string };
  /**
   * The hero went through something that might hold a written page: a
   * bookcase, a chest, a fallen adventurer's pack. The story layer decides
   * whether a lore note is in it (ui/StoryPlaces.ts).
   */
  'lore:search': { source: 'bookcase' | 'chest' | 'fallen'; depth: number };
  /** A narrated line for the story's subtitle (ui/StoryOverlay.ts). */
  'story:line': { text: string; speaker?: string };
  'toast': { text: string; kind?: 'info' | 'good' | 'bad' | 'epic'; rarity?: ItemRarity };
  'shake': { amount: number; duration: number };
  'sfx': { id: string; volume?: number; pitch?: number; x?: number; z?: number };
  'music': { track: string; fade?: number };
  'ui:refresh': Record<string, never>;
  /** Drink a potion. `baseId` picks a specific one; otherwise quick-drink. */
  'potion:use': { kind: 'life' | 'mana'; baseId?: string };
  'ui:open': { panel: string };
  'ui:close': { panel: string };
  'settings:changed': Record<string, never>;
  /** Asset preloading (`core/Assets.ts`): files landed so far of those requested. */
  'assets:progress': { loaded: number; total: number; label: string };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

class EventBus {
  private handlers = new Map<string, Set<(p: unknown) => void>>();

  on<K extends keyof GameEvents>(key: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(key as string);
    if (!set) {
      set = new Set();
      this.handlers.set(key as string, set);
    }
    set.add(fn as (p: unknown) => void);
    return () => this.off(key, fn);
  }

  once<K extends keyof GameEvents>(key: K, fn: Handler<K>): () => void {
    const off = this.on(key, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof GameEvents>(key: K, fn: Handler<K>): void {
    this.handlers.get(key as string)?.delete(fn as (p: unknown) => void);
  }

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(key as string);
    if (!set) return;
    // Copy so handlers may unsubscribe during dispatch.
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(key)}" threw`, err);
      }
    }
  }

  /**
   * Live subscriptions per event, for leak hunting. A count that grows every
   * time a scene is entered means something subscribes and never lets go.
   */
  listenerCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, set] of this.handlers) if (set.size) out[k] = set.size;
    return out;
  }

  /** Drop every subscription — used when tearing a scene down. */
  clear(): void {
    this.handlers.clear();
  }
}

export const events = new EventBus();

/** Shorthand used all over the UI layer. */
export function toast(text: string, kind: GameEvents['toast']['kind'] = 'info', rarity?: ItemRarity): void {
  events.emit('toast', { text, kind, rarity });
}
