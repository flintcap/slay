/**
 * SLAY — run modifiers, made real.
 *
 * Every descent rolls modifiers (`DungeonGen.rollModifiers`, encoded `id@tier`)
 * and only three of them (Teeming, Warband, Legion) ever did anything: they
 * shape the spawn table. The rest were names. This runs the others:
 *
 *   Monsters, as they appear (spawned, event-called or boss):
 *     Hardened  +15% life per tier          Savage    +12% damage per tier
 *     Swift     +8% move speed per tier     Warded    +8 all resistances per tier
 *   On a death:
 *     Conflagration  a fire pool where it fell        Unstable  elites detonate
 *   While you fight:
 *     Thorned   enemies hurt by you up close hurt you back
 *     Leeching  the nearest enemy heals from what it deals
 *     Frostbite standing still chills you
 *     Ambush    packs step out of the dark behind you
 *     Hunted    a stalker comes for you on every floor, heavier each time
 *     Unravelling  rifts open and spill voidspawn
 *   On you:
 *     Gloom  the world darkens         Hoard  richer drops (magic and gold find)
 *     Brittle Bones  you take more and deal more
 *
 * And every modifier pays: +8% magic find and gold find per tier, so a
 * nastier descent is a richer one.
 *
 * DungeonScene owns one per run: `onLevel`, `update`, `onKill`, `dispose`.
 * Monsters are only ever made stronger here, never weaker or fewer.
 */

import * as THREE from 'three';
import type { DamagePacket, DungeonLevel, MonsterRank } from '../types';
import { events, toast } from '../core/Events';
import type { Random } from '../core/RNG';
import type { Player } from '../entities/Player';
import { Enemy, type CombatContext } from '../entities/Enemy';
import type { EffectSystem } from '../fx/Effects';
import type { FXSystem } from '../fx/Particles';
import type { DecalSystem } from '../fx/Decals';
import { MONSTERS, rollAffixes } from '../data/monsters';
import { registerStatus } from '../data/statuses';
import { RUN_MODIFIERS, modifierId, modifierTier } from '../world/DungeonGen';
import { showRunModifiers } from '../ui/RunModStrip';

export interface ModifierHost {
  scene: THREE.Scene;
  player: () => Player;
  enemies: () => Enemy[];
  boss: () => Enemy | null;
  context: () => CombatContext;
  effects: EffectSystem;
  fx: FXSystem;
  decals: DecalSystem;
  rng: () => Random;
  depth: number;
  modifiers: readonly string[];
  level: () => DungeonLevel;
  walkable: (x: number, z: number) => boolean;
  /** Scene exposure trim (Gloom). Optional so a checker can leave it out. */
  setExposure?: (v: number) => void;
}

/** Per-tier strength of each runtime modifier. */
export const MOD_TUNING = {
  hardenedLife: 0.15,
  savageDamage: 0.12,
  swiftSpeed: 0.08,
  wardedResist: 8,
  rewardFind: 8,
  fragile: 15,
  greedFind: 25,
  reflectPct: 6,
  drainPct: 10,
} as const;

// Player-side statuses, one per tier so the numbers are exact on the sheet.
for (let t = 1; t <= 5; t++) {
  registerStatus({
    id: `run.fragile.${t}`,
    name: 'Brittle Bones',
    polarity: -1,
    maxStacks: 1,
    mods: {
      enhancedDamage: MOD_TUNING.fragile * t,
      physicalResist: -MOD_TUNING.fragile * t,
      fireResist: -MOD_TUNING.fragile * t,
      coldResist: -MOD_TUNING.fragile * t,
      lightningResist: -MOD_TUNING.fragile * t,
      poisonResist: -MOD_TUNING.fragile * t,
      arcaneResist: -MOD_TUNING.fragile * t,
    },
    color: 0xd8c8a8,
    icon: 'skull',
    desc: `+${MOD_TUNING.fragile * t}% damage, but -${MOD_TUNING.fragile * t}% to every resistance.`,
    tags: ['curse'],
    stacking: 'refresh',
    baseDuration: 99999,
  });
  registerStatus({
    id: `run.greed.${t}`,
    name: 'Hoard',
    polarity: 1,
    maxStacks: 1,
    mods: { magicFind: MOD_TUNING.greedFind * t, goldFind: MOD_TUNING.greedFind * t * 1.6 },
    color: 0xffc63a,
    icon: 'coin',
    desc: `Treasure runs rich: +${MOD_TUNING.greedFind * t}% magic find.`,
    tags: ['buff'],
    stacking: 'refresh',
    baseDuration: 99999,
  });
}
for (let n = 1; n <= 30; n++) {
  registerStatus({
    id: `run.spoils.${n}`,
    name: 'Spoils of Danger',
    polarity: 1,
    maxStacks: 1,
    mods: { magicFind: MOD_TUNING.rewardFind * n, goldFind: MOD_TUNING.rewardFind * n },
    color: 0xf5d76e,
    icon: 'star',
    desc: `This descent's dangers pay: +${MOD_TUNING.rewardFind * n}% magic and gold find.`,
    tags: ['buff'],
    stacking: 'refresh',
    baseDuration: 99999,
  });
}

interface Pool {
  x: number;
  z: number;
  r: number;
  dps: number;
  life: number;
  arm: number;
}
interface Blast {
  x: number;
  z: number;
  r: number;
  dmg: number;
  t: number;
}

export class RunModifiers {
  private host: ModifierHost;
  private tiers = new Map<string, number>();
  private touched = new WeakSet<Enemy>();
  private pools: Pool[] = [];
  private blasts: Blast[] = [];
  private stillFor = 0;
  private lastPos = new THREE.Vector3();
  private ambushIn = 0;
  private riftIn = 0;
  private stalkerIn = -1;
  private stalkers = 0;
  private offs: Array<() => void> = [];
  private reflecting = false;
  private serial = 0;
  private statusCheck = 0;
  /** For the checker: what each runtime modifier has done. */
  readonly tally: Record<string, number> = {};

  constructor(host: ModifierHost) {
    this.host = host;
    for (const m of host.modifiers) this.tiers.set(modifierId(m), modifierTier(m));
    this.offs.push(
      events.on('enemy:damaged', (p) => this.onEnemyDamaged(p.id, p.amount)),
      events.on('player:damaged', (p) => this.onPlayerDamaged(p.amount)),
    );
  }

  tier(id: string): number {
    return this.tiers.get(id) ?? 0;
  }

  private count(k: string, n = 1): void {
    this.tally[k] = (this.tally[k] ?? 0) + n;
  }

  /** The descent's modifiers, for the strip and the entry toast. */
  describe(): Array<{ name: string; desc: string; tier: number }> {
    const out: Array<{ name: string; desc: string; tier: number }> = [];
    for (const [id, t] of this.tiers) {
      const def = RUN_MODIFIERS.find((m) => m.id === id);
      if (!def) continue;
      out.push({ name: def.name, desc: def.desc.replace(/\{v\}/g, String(modValue(id, t))), tier: t });
    }
    return out;
  }

  /** A new floor: re-apply what lives on the player, reset the timers. */
  onLevel(index: number): void {
    this.pools = [];
    this.blasts = [];
    this.stillFor = 0;
    this.lastPos.copy(this.host.player().position);
    this.ambushIn = 30;
    this.riftIn = 45 - this.tier('mod.void') * 6;
    this.stalkerIn = this.tier('mod.hunted') ? 18 : -1;
    this.ensureStatuses();
    const gloom = this.tier('mod.gloom');
    if (gloom) this.host.setExposure?.(Math.max(0.5, 0.78 - 0.1 * (gloom - 1)));
    if (index === 0) {
      const list = this.describe();
      showRunModifiers(list);
      if (list.length) toast(`This descent: ${list.map((m) => m.name).join(', ')}.`, 'info');
    }
  }

  /** The statuses the descent puts on you. A cleanse or a purge cannot shed them for long. */
  playerStatuses(): string[] {
    const out: string[] = [];
    const fr = this.tier('mod.fragile');
    if (fr) out.push(`run.fragile.${Math.min(5, fr)}`);
    const gr = this.tier('mod.greed');
    if (gr) out.push(`run.greed.${Math.min(5, gr)}`);
    const spoils = Math.min(30, [...this.tiers.values()].reduce((a, b) => a + b, 0));
    if (spoils > 0) out.push(`run.spoils.${spoils}`);
    return out;
  }

  private ensureStatuses(): void {
    const p = this.host.player();
    for (const id of this.playerStatuses()) if (!p.status.has(id)) p.applyStatus(id, 99999, 1, 1);
  }

  /** Makes a monster what this descent says it is. Idempotent. */
  strengthen(e: Enemy): void {
    if (this.touched.has(e)) return;
    this.touched.add(e);
    const h = this.tier('mod.hardened');
    if (h) {
      const mul = 1 + MOD_TUNING.hardenedLife * h;
      const frac = e.maxLife > 0 ? e.life / e.maxLife : 1;
      e.maxLife = Math.round(e.maxLife * mul);
      e.life = Math.round(e.maxLife * frac);
      e.stats.life = e.maxLife;
    }
    const sv = this.tier('mod.savage');
    const sw = this.tier('mod.swift');
    if (sv || sw) {
      e.buff('run.modifiers', 1e9, {
        ...(sv ? { damage: 1 + MOD_TUNING.savageDamage * sv } : {}),
        ...(sw ? { speed: 1 + MOD_TUNING.swiftSpeed * sw } : {}),
      });
    }
    const wd = this.tier('mod.resistant');
    if (wd) {
      const add = MOD_TUNING.wardedResist * wd;
      const s = e.stats;
      s.physicalResist = Math.min(75, s.physicalResist + add * 0.5);
      s.fireResist = Math.min(75, s.fireResist + add);
      s.coldResist = Math.min(75, s.coldResist + add);
      s.lightningResist = Math.min(75, s.lightningResist + add);
      s.poisonResist = Math.min(75, s.poisonResist + add);
      s.arcaneResist = Math.min(75, s.arcaneResist + add);
    }
    if (h || sv || sw || wd) this.count('strengthened');
  }

  /** A monster died and was paid out. */
  onKill(e: Enemy): void {
    const rng = this.host.rng();
    const at = e.root.position;
    const dmg = Math.max(1, e.stats.maxDamage);
    const blaze = this.tier('mod.blaze');
    if (blaze && rng.chance(0.25 + 0.1 * blaze)) {
      const r = 1.6 + 0.3 * blaze;
      this.pools.push({ x: at.x, z: at.z, r, dps: dmg * (0.35 + 0.1 * blaze), life: 4 + blaze, arm: 0.7 });
      this.host.decals.telegraph('circle', at.x, at.z, r, 0, 0.7, 0xff6a20);
      this.count('firePools');
    }
    const unstable = this.tier('mod.unstable');
    if (unstable && isEliteRank(e.rank)) {
      const r = 3 + 0.4 * unstable;
      this.blasts.push({ x: at.x, z: at.z, r, dmg: dmg * (1.2 + 0.3 * unstable), t: 1.1 });
      this.host.decals.telegraph('circle', at.x, at.z, r, 0, 1.1, 0xc060ff);
      this.count('detonations');
    }
  }

  private onEnemyDamaged(id: string, amount: number): void {
    const t = this.tier('mod.reflect');
    if (!t || this.reflecting || amount <= 0) return;
    const e = this.host.enemies().find((x) => x.id === id) ?? (this.host.boss()?.id === id ? this.host.boss() : null);
    if (!e) return;
    const p = this.host.player();
    if (e.root.position.distanceTo(p.position) > 3.6) return; // melee range only
    const back = Math.min(amount * (MOD_TUNING.reflectPct * t) / 100, p.stats.life * 0.05);
    if (back < 1) return;
    this.reflecting = true;
    try {
      this.host.context().damagePlayer(packet(back, 'physical', 'mod.reflect'));
      this.count('reflected', back);
    } finally {
      this.reflecting = false;
    }
  }

  private onPlayerDamaged(amount: number): void {
    const t = this.tier('mod.drain');
    if (!t || amount <= 0) return;
    const p = this.host.player().position;
    let best: Enemy | null = null;
    let bestD = 6;
    for (const e of this.host.enemies()) {
      if (!e.alive || e.life <= 0) continue;
      const d = e.root.position.distanceTo(p);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (!best) return;
    const heal = (amount * MOD_TUNING.drainPct * t) / 100;
    best.life = Math.min(best.maxLife, best.life + heal);
    this.count('drained', heal);
  }

  update(dt: number): void {
    const enemies = this.host.enemies();
    for (const e of enemies) if (!this.touched.has(e)) this.strengthen(e);
    const boss = this.host.boss();
    if (boss && !this.touched.has(boss)) this.strengthen(boss);

    const player = this.host.player();
    const pos = player.position;
    const ctx = this.host.context();
    this.statusCheck -= dt;
    if (this.statusCheck <= 0) {
      this.statusCheck = 3;
      this.ensureStatuses();
    }

    for (let i = this.pools.length - 1; i >= 0; i--) {
      const f = this.pools[i]!;
      if (f.arm > 0) {
        f.arm -= dt;
        if (f.arm <= 0) {
          this.host.decals.add('scorch', f.x, f.z, f.r);
          this.host.fx.burst('embers', f.x, 0.3, f.z, { count: 24, scale: f.r });
        }
        continue;
      }
      f.life -= dt;
      if (Math.hypot(pos.x - f.x, pos.z - f.z) < f.r) ctx.damagePlayer(packet(f.dps * dt, 'fire', 'mod.blaze'));
      if (f.life <= 0) this.pools.splice(i, 1);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!;
      b.t -= dt;
      if (b.t > 0) continue;
      this.blasts.splice(i, 1);
      this.host.effects.explosion(b.x, 0.6, b.z, { radius: b.r, element: 'arcane', color: 0xc060ff });
      if (Math.hypot(pos.x - b.x, pos.z - b.z) < b.r) {
        ctx.damagePlayer(packet(b.dmg, 'arcane', 'mod.unstable'));
        this.count('blastHits');
      }
    }

    const frost = this.tier('mod.frostbite');
    if (frost) {
      if (pos.distanceTo(this.lastPos) > 0.4 * dt * 10) {
        this.stillFor = 0;
        this.lastPos.copy(pos);
      } else this.stillFor += dt;
      if (this.stillFor > 1.6) {
        this.stillFor = 0.8;
        player.applyStatus('chilled', 1.5 + 0.5 * frost, 1, 1);
        ctx.damagePlayer(packet(player.stats.life * 0.015 * frost, 'cold', 'mod.frostbite'));
        this.count('frostbite');
      }
    }

    const fighting = enemies.some((e) => e.alive && e.life > 0 && e.root.position.distanceTo(pos) < 12);
    const ambush = this.tier('mod.ambush');
    if (ambush && fighting) {
      this.ambushIn -= dt;
      if (this.ambushIn <= 0) {
        this.ambushIn = 38 - 6 * ambush;
        this.spawnAround(pos, 3 + ambush, 'normal', 7, 10, 'ambush');
        toast('They were waiting in the dark.', 'bad');
      }
    }
    const rift = this.tier('mod.void');
    if (rift) {
      this.riftIn -= dt;
      if (this.riftIn <= 0) {
        this.riftIn = 50 - 8 * rift;
        this.spawnAround(pos, 2 + rift, 'champion', 6, 9, 'rift');
        toast('Reality tears open.', 'bad');
      }
    }
    if (this.stalkerIn >= 0) {
      this.stalkerIn -= dt;
      if (this.stalkerIn < 0) this.spawnStalker(pos);
    }
  }

  private floorDefs() {
    const level = this.host.level();
    const ids = Array.from(new Set(level.spawns.map((s) => s.monsterId)));
    const defs = ids.map((id) => MONSTERS.find((m) => m.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
    return defs.length ? defs : MONSTERS.slice(0, 1);
  }

  /** Calls monsters out of the dark in a ring around a point. Returns them. */
  private spawnAround(at: THREE.Vector3, count: number, rank: MonsterRank, rMin: number, rMax: number, kind: string): Enemy[] {
    const rng = this.host.rng();
    const defs = this.floorDefs();
    const ctx = this.host.context();
    const out: Enemy[] = [];
    const packId = 9500 + this.serial;
    for (let i = 0; i < count; i++) {
      const def = rng.pick(defs);
      const affixes = rank === 'normal' ? [] : rollAffixes(this.host.depth, rank === 'elite' || rank === 'rare' ? 2 : 1, rng);
      const e = new Enemy(def, rank, affixes, this.host.depth, rng.fork(`rm${this.serial++}`));
      e.packId = packId;
      let placed = false;
      // Close in on the point when the far ring is all wall (a corridor, a small room).
      for (let tries = 0; tries < 32 && !placed; tries++) {
        const a = rng.range(0, Math.PI * 2);
        const shrink = 1 - Math.min(0.7, tries / 40);
        const d = rng.range(rMin, rMax) * shrink;
        const x = at.x + Math.cos(a) * d;
        const z = at.z + Math.sin(a) * d;
        if (!this.host.walkable(x, z)) continue;
        e.root.position.set(x, 0, z);
        placed = true;
      }
      if (!placed) {
        e.dispose();
        continue;
      }
      this.host.scene.add(e.root);
      this.host.enemies().push(e);
      this.strengthen(e);
      this.host.effects.teleportIn(e.root.position.x, 0.8, e.root.position.z, kind === 'rift' ? 0x9a40ff : 0x403020);
      e.wake(ctx);
      out.push(e);
    }
    this.count(kind, out.length);
    return out;
  }

  /** The thing that follows you down. Heavier on every floor it finds you. */
  private spawnStalker(at: THREE.Vector3): void {
    const t = this.tier('mod.hunted');
    const [e] = this.spawnAround(at, 1, t >= 2 ? 'rare' : 'elite', 9, 13, 'stalker');
    if (!e) {
      this.stalkerIn = 5;
      return;
    }
    this.stalkers++;
    const mul = 1.4 + 0.2 * this.stalkers;
    e.maxLife = Math.round(e.maxLife * mul);
    e.life = e.maxLife;
    e.stats.life = e.maxLife;
    if (e.ai) e.ai.fixateOnPlayer = true;
    toast('Something has followed you down.', 'epic');
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.pools = [];
    this.blasts = [];
    if (this.tier('mod.gloom')) this.host.setExposure?.(1);
    showRunModifiers([]);
  }
}

function isEliteRank(r: MonsterRank): boolean {
  return r === 'elite' || r === 'rare' || r === 'boss';
}

function packet(amount: number, type: DamagePacket['type'], ability: string): DamagePacket {
  return { amount, type, crit: false, source: 'modifier', ability };
}

/** The `{v}` in a modifier's description, at a tier. */
export function modValue(id: string, tier: number): number {
  switch (id) {
    case 'mod.swarm':
      return 14 * tier;
    case 'mod.elites':
      return 25 * tier;
    case 'mod.hardened':
      return Math.round(MOD_TUNING.hardenedLife * 100 * tier);
    case 'mod.savage':
      return Math.round(MOD_TUNING.savageDamage * 100 * tier);
    case 'mod.swift':
      return Math.round(MOD_TUNING.swiftSpeed * 100 * tier);
    case 'mod.resistant':
      return MOD_TUNING.wardedResist * tier;
    case 'mod.reflect':
      return MOD_TUNING.reflectPct * tier;
    case 'mod.greed':
      return MOD_TUNING.greedFind * tier;
    case 'mod.fragile':
      return MOD_TUNING.fragile * tier;
    case 'mod.drain':
      return MOD_TUNING.drainPct * tier;
    default:
      return tier;
  }
}
