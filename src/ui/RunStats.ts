/**
 * SLAY — what happened on this run.
 *
 * The death screen and the pause menu both want to say how the run went: how
 * deep, how many kills, how much gold, how long, and what finally did it. None
 * of that was recorded anywhere, so it is gathered here from the event bus.
 *
 * A "run" starts when the player walks from anywhere that is not the dungeon
 * into the dungeon, and ends on the way out (town or death). Moving between
 * the areas of one map does not restart it.
 *
 * This also keeps `Character.playtime` honest. Nothing ever advanced it, so
 * every "time survived" and "played" figure in the game read zero.
 */

import type { DamageType, ItemRarity, MonsterRank } from '../types';
import { RARITY_ORDER } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { getAbility } from '../entities/Abilities';
import { statusDef } from '../sim/StatusRules';
import { tr } from '../core/I18n';
import { itemDisplayName } from '../sim/Loot';

/** One blow the hero took, for the death recap. */
export interface HitRecord {
  /** Run seconds when it landed (the last tick, for a merged run of ticks). */
  at: number;
  amount: number;
  type: DamageType;
  /** Who dealt it, when known. */
  who: string | null;
  rank: MonsterRank | null;
  /** The move, or the status that ticked. */
  what: string | null;
  /** A status ticking rather than a blow. */
  overTime: boolean;
  lifeAfter: number;
  maxLife: number;
}

/** Blows kept for the death recap. */
const HIT_LOG = 40;
/** Ticks of the same status from the same giver this close fold into one line. */
const TICK_FOLD = 1.5;

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
  /** The last blows taken, oldest first. */
  hits: HitRecord[];
  /** Experience earned below, and levels gained. */
  xp: number;
  levels: number;
  potions: number;
  /** The lowest life fell to, as a share of full life (1 = never hurt). */
  lowest: number;
  /** Whatever hurt most on the run, by total damage. */
  hurtMost: { name: string; amount: number } | null;
  /** A contract finished on the run. */
  quest: string | null;
  /** The map's name, when the run was a map. */
  mapName: string | null;
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
    hits: [],
    xp: 0,
    levels: 0,
    potions: 0,
    lowest: 1,
    hurtMost: null,
    quest: null,
    mapName: null,
  };
}

/** 'phase_shift' to 'Phase shift', for moves with no catalogue name. */
function plain(id: string): string {
  const t = id.replace(/[_.-]+/g, ' ').trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : '';
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
  /**
   * Names of what has hurt the hero this run, by id, kept while each was
   * alive: a poison can finish you after the monster that spat it is dead.
   */
  private hurtBy = new Map<string, { name: string; rank: MonsterRank | null }>();
  /** Damage taken this run, by the name of what dealt it. */
  private hurtTotal = new Map<string, number>();

  attach(engine: Engine): void {
    if (this.engine) return;
    this.engine = engine;

    // `scene:loading` rather than `scene:change`: the dungeon announces its
    // first floor from inside `enter`, which runs between the two.
    events.on('scene:loading', (p) => {
      if (p.to === 'dungeon' && p.from !== 'dungeon') {
        this.s = blank();
        this.hurtBy.clear();
        this.hurtTotal.clear();
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
      if (p.mapName) this.s.mapName = p.mapName;
    });
    events.on('player:xp', (p) => {
      if (this.active) this.s.xp += p.gained;
    });
    events.on('player:levelUp', () => {
      if (this.active) this.s.levels++;
    });
    events.on('potion:drunk', () => {
      if (this.active) this.s.potions++;
    });
    events.on('quest:complete', (p) => {
      if (this.active) this.s.quest = p.name;
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
        this.s.bestItem = itemDisplayName(p.item);
      }
    });
    events.on('player:damaged', (p) => {
      if (!this.active) return;
      this.s.damageTaken += p.amount;
      if (p.source && !this.hurtBy.has(p.source)) {
        const who = this.resolve(p.source);
        if (who) this.hurtBy.set(p.source, who);
      }
      if (p.maxLife > 0) this.s.lowest = Math.min(this.s.lowest, Math.max(0, p.life) / p.maxLife);
      this.logHit(p);
    });
    events.on('player:died', (p) => {
      const found = this.resolve(p.killedBy) ?? this.hurtBy.get(p.killedBy) ?? null;
      this.s.killer = found?.name ?? null;
      this.s.killerRank = found?.rank ?? null;
    });
  }

  /**
   * Notes a blow for the recap. A status ticking from the same giver folds
   * into its last line, so a long poison reads as one line, not thirty.
   */
  private logHit(p: { amount: number; type: DamageType; life: number; maxLife: number; source?: string; ability?: string; status?: string }): void {
    const who = (p.source && this.hurtBy.get(p.source)) || null;
    const overTime = !!p.status;
    const what = p.status
      ? (statusDef(p.status)?.name ?? plain(p.status))
      : p.ability
        ? (getAbility(p.ability)?.name ?? plain(p.ability))
        : null;
    const name = who?.name ?? null;
    const key = name ?? (what || tr('Unknown'));
    const total = (this.hurtTotal.get(key) ?? 0) + p.amount;
    this.hurtTotal.set(key, total);
    if (!this.s.hurtMost || total > this.s.hurtMost.amount) this.s.hurtMost = { name: key, amount: total };

    const at = this.s.seconds;
    const hits = this.s.hits;
    const prev = hits[hits.length - 1];
    if (prev && overTime && prev.overTime && prev.what === what && prev.who === name && at - prev.at <= TICK_FOLD) {
      prev.amount += p.amount;
      prev.at = at;
      prev.lifeAfter = Math.max(0, p.life);
      prev.maxLife = p.maxLife;
      return;
    }
    hits.push({
      at,
      amount: p.amount,
      type: p.type,
      who: name,
      rank: who?.rank ?? null,
      what,
      overTime,
      lifeAfter: Math.max(0, p.life),
      maxLife: p.maxLife,
    });
    if (hits.length > HIT_LOG) hits.splice(0, hits.length - HIT_LOG);
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
    if (!source || source === 'monster' || source === tr('the dark')) return null;
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
