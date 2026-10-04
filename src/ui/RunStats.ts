/**
 * SLAY — what happened on this run.
 *
 * The death screen and the pause menu both want to say how the run went: how
 * deep, how many kills, how much gold, how long, and what finally did it. None
 * of that was recorded anywhere, so it is gathered here from the event bus.
 *
 * A "run" starts when the player walks from anywhere that is not the dungeon
 * into the dungeon, and ends on the way out (town or death). Stairs between
 * floors of the same depth do not restart it.
 *
 * This also keeps `Character.playtime` honest. Nothing ever advanced it, so
 * every "time survived" and "played" figure in the game read zero.
 */

import type { ItemRarity, MonsterRank } from '../types';
import { RARITY_ORDER } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';

export interface RunSummary {
  /** Seconds spent in the dungeon on this run. */
  seconds: number;
  kills: number;
  /** Champions, elites and rares. */
  elites: number;
  bosses: number;
  gold: number;
  items: number;
  bestRarity: ItemRarity | null;
  bestItem: string | null;
  damageTaken: number;
  deepest: number;
  floors: number;
  /** Display name of whatever landed the killing blow, if known. */
  killer: string | null;
  killerRank: MonsterRank | null;
}

function blank(): RunSummary {
  return {
    seconds: 0,
    kills: 0,
    elites: 0,
    bosses: 0,
    gold: 0,
    items: 0,
    bestRarity: null,
    bestItem: null,
    damageTaken: 0,
    deepest: 0,
    floors: 0,
    killer: null,
    killerRank: null,
  };
}

interface EnemyLike {
  id?: string;
  name?: string;
  displayName?: string;
  rank?: MonsterRank;
}

class RunStats {
  private s: RunSummary = blank();
  private last: RunSummary | null = null;
  private engine: Engine | null = null;
  private active = false;

  attach(engine: Engine): void {
    if (this.engine) return;
    this.engine = engine;

    // `scene:loading` rather than `scene:change`: the dungeon announces its
    // first floor from inside `enter`, which runs between the two.
    events.on('scene:loading', (p) => {
      if (p.to === 'dungeon' && p.from !== 'dungeon') {
        this.s = blank();
        this.active = true;
      } else if (p.to !== 'dungeon' && this.active) {
        this.last = this.s;
        this.active = false;
      }
    });
    events.on('depth:changed', (p) => {
      if (!this.active || p.depth <= 0) return;
      this.s.deepest = Math.max(this.s.deepest, p.depth);
      this.s.floors++;
    });
    events.on('enemy:killed', (p) => {
      if (!this.active) return;
      this.s.kills++;
      if (p.rank === 'champion' || p.rank === 'elite' || p.rank === 'rare') this.s.elites++;
    });
    events.on('boss:killed', () => {
      if (this.active) this.s.bosses++;
    });
    events.on('loot:gold', (p) => {
      if (this.active) this.s.gold += p.amount;
    });
    events.on('loot:pickedUp', (p) => {
      if (!this.active) return;
      this.s.items++;
      const r = p.item.rarity;
      const best = this.s.bestRarity;
      if (!best || RARITY_ORDER.indexOf(r) > RARITY_ORDER.indexOf(best)) {
        this.s.bestRarity = r;
        this.s.bestItem = p.item.name;
      }
    });
    events.on('player:damaged', (p) => {
      if (this.active) this.s.damageTaken += p.amount;
    });
    events.on('player:died', (p) => {
      const found = this.resolve(p.killedBy);
      this.s.killer = found?.name ?? null;
      this.s.killerRank = found?.rank ?? null;
    });
  }

  /** Called every UI frame. Advances run time and the character's playtime. */
  tick(dt: number): void {
    const e = this.engine;
    if (!e || e.paused || document.hidden) return;
    const id = e.currentSceneId;
    if (id !== 'dungeon' && id !== 'town') return;
    const c = save.account.current;
    if (c) c.playtime = (c.playtime || 0) + dt;
    if (this.active && id === 'dungeon') this.s.seconds += dt;
  }

  /** The run in progress, or null outside the dungeon. */
  get current(): Readonly<RunSummary> | null {
    return this.active ? this.s : null;
  }

  /** The run that most recently ended (or the live one, at the moment of death). */
  get latest(): Readonly<RunSummary> {
    return this.active ? this.s : (this.last ?? this.s);
  }

  /** Name of the killer, for the memorial. Null if it could not be identified. */
  killerName(): string | null {
    return this.s.killer;
  }

  /**
   * Turns a damage packet's `source` (an entity id) into a display name by
   * looking through the live scene's monsters. Duck-typed so this module never
   * imports the dungeon.
   */
  private resolve(source: string): { name: string; rank: MonsterRank | null } | null {
    if (!source || source === 'monster' || source === 'the dark') return null;
    const scene = this.engine?.currentScene as unknown as { enemies?: EnemyLike[]; boss?: EnemyLike | null } | null;
    if (!scene) return null;
    const pool: EnemyLike[] = [...(scene.enemies ?? [])];
    if (scene.boss) pool.push(scene.boss);
    const hit = pool.find((x) => x.id === source);
    if (!hit) return null;
    const name = hit.displayName || hit.name;
    return name ? { name, rank: hit.rank ?? null } : null;
  }
}

export const runStats = new RunStats();
