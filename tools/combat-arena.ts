/**
 * A headless fight arena shared by the combat checkers.
 *
 * Real monsters from the real bestiary, their real brains, bodies, abilities
 * and affixes, around a stand-in hero that never moves unless a test moves it.
 * Everything visual answers politely and does nothing; telegraphs and hits are
 * recorded so a test can ask what happened and when.
 */
import * as THREE from 'three';
import { Enemy, resetEnemyRuntime } from '../src/entities/Enemy';
import { MONSTERS } from '../src/data/monsters';
import { getAffix } from '../src/data/monsterAffixes';
import { Random } from '../src/core/RNG';
import type { CombatContext } from '../src/entities/Abilities';
import type { DamagePacket, MonsterDef, MonsterRank, MonsterRole } from '../src/types';
import type { NamedRare } from '../src/data/namedRares';

export const DT = 1 / 30;

export const shrug: any = new Proxy(function () {}, {
  get: () => shrug,
  apply: () => shrug,
});

export interface Arena {
  ctx: CombatContext;
  hero: THREE.Vector3;
  hits: Array<{ t: number; by: string; amount: number; ability: string; packet: DamagePacket }>;
  landings: Array<{ t: number; by: string; kind: string }>;
  enemies: Enemy[];
  /** Seconds since the arena opened. */
  readonly now: number;
  step(seconds: number, each?: (t: number) => void): void;
  spawn(
    def: MonsterDef,
    x: number,
    z: number,
    opts?: { rank?: MonsterRank; pack?: number; affixes?: string[]; named?: NamedRare },
  ): Enemy;
}

export interface ArenaOpts {
  seed?: number;
  /** Solid ground test, for walls. Open field when absent. */
  solid?: (x: number, z: number) => boolean;
  depth?: number;
}

export function arena(opts: ArenaOpts = {}): Arena {
  resetEnemyRuntime();
  const seed = opts.seed ?? 1;
  const solid = opts.solid ?? (() => false);
  const depth = opts.depth ?? 6;
  const hero = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const hits: Arena['hits'] = [];
  const landings: Arena['landings'] = [];
  const enemies: Enemy[] = [];
  let acting = '';
  const decals = new Proxy(
    {
      telegraph: (kind: string, _x: number, _z: number, _s: number, _r: number, duration: number) => {
        if (duration >= 0.5) landings.push({ t: ctx.elapsed + duration, by: acting, kind });
        return { cancel() {} };
      },
    } as Record<string, unknown>,
    { get: (o, k) => (k in o ? o[k as string] : shrug) },
  );
  const lineOfSight = (ax: number, az: number, bx: number, bz: number): boolean => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      if (solid(ax + (bx - ax) * k, az + (bz - az) * k)) return false;
    }
    return true;
  };
  const ctx: CombatContext = {
    playerPos: aim,
    heroPos: hero,
    heroFacing: 0,
    heroLifeFrac: 1,
    playerStats: shrug,
    playerLevel: 10,
    damagePlayer: (p) => hits.push({ t: ctx.elapsed, by: acting, amount: p.amount, ability: p.ability ?? '', packet: p }),
    nav: {
      lineOfSight,
      clampToWalkable: (x: number, z: number) => ({ x, y: z }),
      path: () => [],
    } as never,
    fx: shrug,
    decals: decals as never,
    rng: new Random(seed),
    elapsed: 1,
    enemies,
    scene: new THREE.Scene(),
  };
  const a: Arena = {
    ctx,
    hero,
    hits,
    landings,
    enemies,
    get now() {
      return ctx.elapsed - 1;
    },
    step(seconds, each) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        ctx.elapsed += DT;
        for (const e of [...enemies]) {
          acting = e.id;
          aim.copy(hero);
          e.update(DT, ctx);
        }
        acting = '';
        each?.(ctx.elapsed);
      }
    },
    spawn(def, x, z, o = {}) {
      const list = (o.affixes ?? []).map((id) => getAffix(id)).filter((q): q is NonNullable<typeof q> => !!q);
      const e = new Enemy(def, o.rank ?? 'normal', list, depth, new Random(seed * 97 + enemies.length), o.named ?? null);
      e.root.position.set(x, 0, z);
      e.packId = o.pack ?? 1;
      enemies.push(e);
      return e;
    },
  };
  return a;
}

/** Real monsters of a role, earliest first, that can walk. */
export function ofRole(role: MonsterRole, n: number): MonsterDef[] {
  const pool = MONSTERS.filter((m) => m.role === role && m.speed > 0.5 && m.weight > 0).sort(
    (a, b) => a.minDepth - b.minDepth,
  );
  const out: MonsterDef[] = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]!);
  return out;
}

export function distTo(e: Enemy, h: THREE.Vector3): number {
  return Math.hypot(e.root.position.x - h.x, e.root.position.z - h.z);
}

export interface Case {
  name: string;
  ok: boolean;
  detail: string;
}

export function caseLog(): { cases: Case[]; check(name: string, ok: boolean, detail: string): void } {
  const cases: Case[] = [];
  return {
    cases,
    check(name, ok, detail) {
      cases.push({ name, ok, detail });
    },
  };
}
