/**
 * SLAY — mini-bosses.
 *
 * Most floors that are not a boss floor promote one pack leader into a
 * mini-boss: a named monster with more life, a title on its plate, and one
 * mechanic of its own that the player has to learn. Each mechanic is a single,
 * readable idea with a telegraph and a punish window:
 *
 * - **Warlord** sounds a horn at two-thirds and one-third life, calling its kin
 *   and driving the whole pack into a frenzy. Kill it fast or fight a crowd.
 * - **Executioner** marks the hero with a circle that follows them, then locks
 *   and leaps onto it. Move when it locks. It is stuck in the floor afterwards.
 * - **Stalker** steps out of the hero's shadow and strikes from behind. Turn.
 * - **Pyrelord** cages the hero in a ring of fire with one gap, then fills the
 *   cage. Get out through the gap, or dodge through the wall.
 * - **Broodmother** keeps a brood around it and cannot be hurt properly while
 *   three of them live. Thin the brood, then strike.
 * - **Deadeye** shows three lines and then fires down them. Step between.
 * - **Rampager** lines up and charges. If it hits a wall it stuns itself.
 *
 * Every mini-boss also makes a last stand at 30% life.
 *
 * The scene asks `planMiniBoss` which spawn to promote before it builds the
 * floor, builds that monster with the plan's rank and name, then calls
 * `attachMiniBoss`. Everything else happens through `Enemy.miniBoss`.
 */

import type { MonsterRank, MonsterRole, Rng, SpawnPoint } from '../types';
import type { NamedRare } from '../data/namedRares';
import type { Enemy, MiniBossHook } from './Enemy';
import { events } from '../core/Events';
import { getMonster, MONSTERS } from '../data/monsters';
import {
  after,
  alliesNear,
  angleTo,
  circleHit,
  dashToward,
  dist,
  fireProjectile,
  hitPlayer,
  inCone,
  spawnHazard,
  summon,
  type CombatContext,
} from './Abilities';

export type MiniBossKind =
  | 'warlord'
  | 'executioner'
  | 'stalker'
  | 'pyrelord'
  | 'broodmother'
  | 'deadeye'
  | 'rampager';

interface KindDef {
  id: MiniBossKind;
  /** Appended to the monster's own name: "Bone Archer Deadeye". */
  noun: string;
  /** The line under the name on its plate. Tells you the mechanic. */
  title: string;
  roles: readonly MonsterRole[];
}

export const MINIBOSS_KINDS: readonly KindDef[] = [
  { id: 'warlord', noun: 'Warlord', title: 'Sounds the horn as it weakens', roles: ['melee', 'brute', 'support', 'swarm'] },
  { id: 'executioner', noun: 'Executioner', title: 'Marks you, then leaps', roles: ['brute', 'melee'] },
  { id: 'stalker', noun: 'Stalker', title: 'Strikes from your shadow', roles: ['ambusher', 'melee'] },
  { id: 'pyrelord', noun: 'Pyrelord', title: 'Cages its prey in flame', roles: ['caster', 'support'] },
  { id: 'broodmother', noun: 'Broodmother', title: 'Shielded while its brood lives', roles: ['swarm', 'support', 'caster'] },
  { id: 'deadeye', noun: 'Deadeye', title: 'Fires down the lines it shows you', roles: ['ranged'] },
  { id: 'rampager', noun: 'Rampager', title: 'Charges blind; walls stop it cold', roles: ['brute', 'melee'] },
];

const KIND_BY_ID = new Map(MINIBOSS_KINDS.map((k) => [k.id, k]));

export interface MiniBossPlan {
  /** Index into the level's spawn list. */
  index: number;
  kind: MiniBossKind;
  rank: MonsterRank;
  /** Handed to the Enemy constructor as its name, title and multipliers. */
  named: NamedRare;
}

const RANK_WEIGHT: Record<MonsterRank, number> = { normal: 1, champion: 1.5, elite: 2, rare: 3, boss: 0 };

/**
 * Picks the pack leader to promote on this floor, or null for none. Boss
 * floors never get one; the boss is the floor's set piece.
 */
export function planMiniBoss(
  spawns: readonly SpawnPoint[],
  depth: number,
  isBossLevel: boolean,
  rng: Rng,
): MiniBossPlan | null {
  if (isBossLevel || spawns.length === 0) return null;
  // Most floors. The very first floors of the game get one less often, so a
  // new character meets the idea before it meets it every time.
  if (!rng.chance(depth <= 1 ? 0.5 : 0.85)) return null;

  const seenPack = new Set<number>();
  const leaders: Array<{ index: number; kinds: KindDef[]; weight: number }> = [];
  spawns.forEach((s, index) => {
    if (seenPack.has(s.packId)) return;
    seenPack.add(s.packId);
    if (s.named) return;
    const def = getMonster(s.monsterId);
    if (!def || def.speed <= 0.5) return;
    const kinds = MINIBOSS_KINDS.filter((k) => k.roles.includes(def.role));
    if (kinds.length === 0) return;
    leaders.push({ index, kinds, weight: RANK_WEIGHT[s.rank] ?? 1 });
  });
  if (leaders.length === 0) return null;

  const pick = rng.weighted(leaders, (l) => l.weight);
  const kind = rng.pick(pick.kinds);
  const spawn = spawns[pick.index]!;
  const def = getMonster(spawn.monsterId)!;
  // Gentler on the opening floors; a full rare from depth 3.
  const rank: MonsterRank = depth <= 2 ? 'elite' : 'rare';
  const named: NamedRare = {
    id: `miniboss.${kind.id}`,
    name: `${def.name} ${kind.noun}`,
    title: kind.title,
    monsterId: def.id,
    minDepth: 1,
    weight: 0,
    affixes: [],
    lifeMul: 1.8 + Math.min(0.8, depth * 0.03),
    damageMul: 1.2,
  };
  return { index: pick.index, kind: kind.id, rank, named };
}

/** Turns a freshly built monster into the plan's mini-boss. */
export function attachMiniBoss(e: Enemy, plan: Pick<MiniBossPlan, 'kind'>): MiniBossController {
  const c = new MiniBossController(e, plan.kind);
  e.miniBoss = c;
  return c;
}

/** How often each mechanic comes round, in seconds. */
const CADENCE: Record<MiniBossKind, number> = {
  warlord: 12,
  executioner: 10,
  stalker: 8,
  pyrelord: 13,
  broodmother: 9,
  deadeye: 8,
  rampager: 10,
};

type Step = (ctx: CombatContext) => void;

export class MiniBossController implements MiniBossHook {
  readonly kind: MiniBossKind;
  private next = 3;
  private engaged = false;
  private lastStand = false;
  private hornsBlown = 0;
  private brood: Enemy[] = [];
  /** Scripted beats of the mechanic in progress, run in order. */
  private script: Array<{ at: number; run: Step }> = [];
  private scriptT = 0;
  /** Mechanic uses so far, for the checker. */
  uses = 0;

  constructor(
    private readonly self: Enemy,
    kind: MiniBossKind,
  ) {
    this.kind = kind;
  }

  get busy(): boolean {
    return this.script.length > 0;
  }

  /**
   * True when the mechanic is due or running. The body holds off starting
   * ordinary abilities so the signature move is not starved by them.
   */
  get wantsTurn(): boolean {
    return this.engaged && (this.script.length > 0 || this.next <= 0);
  }

  tick(dt: number, ctx: CombatContext): void {
    const self = this.self;
    if (!self.alive) return;
    const p = self.root.position;
    const h = ctx.heroPos ?? ctx.playerPos;
    const d = dist(p.x, p.z, h.x, h.z);

    if (!this.engaged) {
      if (!self.ai || self.ai.isDormant || d > 18) return;
      this.engaged = true;
      events.emit('miniboss:engaged', { id: self.id, name: self.name, title: self.named?.title ?? '', kind: this.kind });
      events.emit('toast', { text: `${self.name}: ${self.named?.title ?? ''}`, kind: 'bad' });
    }

    // The scripted beats of a mechanic run on their own clock.
    if (this.script.length) {
      this.scriptT += dt;
      while (this.script.length && this.scriptT >= this.script[0]!.at) {
        const beat = this.script.shift()!;
        if (self.alive) beat.run(ctx);
      }
      return;
    }

    // Last stand.
    if (!this.lastStand && self.lifeFraction <= 0.3) {
      this.lastStand = true;
      self.buff('miniboss_last_stand', 9999, { speed: 1.15, attackSpeed: 1.3, damage: 1.15 });
      ctx.fx.burst('crit', p.x, 1.2 * self.sizeScale, p.z, { count: 36, color: 0xff3020 });
      events.emit('toast', { text: `${self.name} makes its last stand!`, kind: 'bad' });
      events.emit('shake', { amount: 0.35, duration: 0.3 });
    }

    // Threshold mechanics that do not wait for the cadence.
    if (this.kind === 'warlord') {
      const due = self.lifeFraction <= 0.33 ? 2 : self.lifeFraction <= 0.66 ? 1 : 0;
      if (due > this.hornsBlown && !self.busy && !self.motionOverride) {
        this.hornsBlown = due;
        this.horn(ctx);
        return;
      }
    }
    if (this.kind === 'broodmother') this.wardByBrood(ctx);

    this.next -= dt;
    if (this.next > 0 || self.busy || self.motionOverride || self.rootTimer > 0) return;
    if (this.begin(ctx, d)) {
      this.uses++;
      this.next = CADENCE[this.kind] * (this.lastStand ? 0.7 : 1);
    } else {
      this.next = 0.5;
    }
  }

  onDeath(ctx: CombatContext): void {
    this.script.length = 0;
    events.emit('miniboss:killed', { id: this.self.id, name: this.self.name, kind: this.kind });
    void ctx;
  }

  // -------------------------------------------------------------------------

  private run(beats: Array<[number, Step]>): void {
    this.scriptT = 0;
    this.script = beats.map(([at, run]) => ({ at, run }));
  }

  /** Starts this kind's mechanic. False when the moment is wrong. */
  private begin(ctx: CombatContext, d: number): boolean {
    switch (this.kind) {
      case 'warlord':
        return this.warCry(ctx, d);
      case 'executioner':
        return d < 12 && this.execute(ctx);
      case 'stalker':
        return d < 14 && this.shadowStep(ctx);
      case 'pyrelord':
        return d < 16 && this.cage(ctx);
      case 'broodmother':
        return this.spawnBrood(ctx);
      case 'deadeye':
        return d > 4 && d < 22 && this.volley(ctx);
      case 'rampager':
        return d > 1.5 && d < 16 && this.rampage(ctx, d);
      default:
        return false;
    }
  }

  private hero(ctx: CombatContext): { x: number; z: number } {
    const h = ctx.heroPos ?? ctx.playerPos;
    return { x: h.x, z: h.z };
  }

  // --- warlord -------------------------------------------------------------

  private warCry(ctx: CombatContext, d: number): boolean {
    if (d > 14) return false;
    const p = this.self.root.position;
    ctx.decals.telegraph('ring', p.x, p.z, 10, 0, 0.5, 0xff9040);
    for (const ally of alliesNear(ctx, p.x, p.z, 10, this.self.id)) {
      ally.buff('war_cry', 5, { attackSpeed: 1.25, speed: 1.1 });
    }
    ctx.fx.burst('embers', p.x, 1.4 * this.self.sizeScale, p.z, { count: 24, color: 0xff9040 });
    events.emit('sfx', { id: 'warcry', x: p.x, z: p.z });
    return true;
  }

  private horn(ctx: CombatContext): void {
    const self = this.self;
    const p = self.root.position;
    self.rootTimer = 0.9;
    ctx.decals.telegraph('ring', p.x, p.z, 12, 0, 0.9, 0xffc040);
    events.emit('toast', { text: `${self.name} sounds the horn!`, kind: 'bad' });
    this.run([
      [
        0.9,
        (c) => {
          const n = Math.min(4, 2 + Math.floor(self.depth / 12));
          const kin = summon(self, c, self.monsterId, n, 3.5);
          for (const k of kin) k.packId = self.packId;
          for (const ally of alliesNear(c, p.x, p.z, 14, self.id)) {
            ally.buff('warlord_horn', 10, { damage: 1.3, speed: 1.1 });
          }
          c.fx.burst('bossSlam', p.x, 0.6, p.z, { count: 40, color: 0xffc040 });
          events.emit('shake', { amount: 0.4, duration: 0.35 });
        },
      ],
    ]);
  }

  // --- executioner ---------------------------------------------------------

  private execute(ctx: CombatContext): boolean {
    const self = this.self;
    const R = 2.6;
    // The mark follows the hero for a second, then locks. Each segment is
    // its own short telegraph re-placed on the hero, so it visibly tracks.
    const lock = { x: 0, z: 0 };
    const mark = (c: CombatContext, seconds: number): void => {
      const h = this.hero(c);
      lock.x = h.x;
      lock.z = h.z;
      c.decals.telegraph('circle', h.x, h.z, R, 0, seconds, 0xff2040);
    };
    self.rootTimer = 1.0;
    events.emit('toast', { text: `${self.name} marks you!`, kind: 'bad' });
    mark(ctx, 0.25);
    this.run([
      [0.25, (c) => mark(c, 0.25)],
      [0.5, (c) => mark(c, 0.25)],
      [0.75, (c) => mark(c, 0.25)],
      // Locked: it will land here, wherever you are now.
      [1.0, (c) => {
        mark(c, 0.7);
        dashToward(self, c, lock.x, lock.z, Math.max(8, dist(self.root.position.x, self.root.position.z, lock.x, lock.z) / 0.6), {
          arc: 2.2,
          kind: 'leap',
        });
      }],
      [1.7, (c) => {
        circleHit(self, c, lock.x, lock.z, R, 3.0, 'physical', 'execution', { knockback: 4 });
        c.decals.add('crack', lock.x, lock.z, R);
        events.emit('shake', { amount: 0.5, duration: 0.3 });
        // The axe is stuck in the floor: this is your window.
        self.rootTimer = 1.4;
        self.buff('executioner_stuck', 1.4, { defense: 0.5, taken: 1.35 });
      }],
    ]);
    return true;
  }

  // --- stalker -------------------------------------------------------------

  private shadowStep(ctx: CombatContext): boolean {
    const self = this.self;
    const p = self.root.position;
    self.buff('shadow_step', 0.6, { invulnerable: 1 });
    ctx.fx.burst('void', p.x, 1, p.z, { count: 20, color: 0x402060 });
    const at = { x: 0, z: 0 };
    this.run([
      [0.6, (c) => {
        const h = this.hero(c);
        const behind = (c.heroFacing ?? 0) + Math.PI;
        const t = c.nav.clampToWalkable(h.x + Math.sin(behind) * 2.2, h.z + Math.cos(behind) * 2.2);
        self.teleportTo(t.x, t.y, c);
        at.x = t.x;
        at.z = t.y;
        self.facing = angleTo(t.x, t.y, h.x, h.z);
        self.rootTimer = 0.55;
        c.fx.burst('void', t.x, 1, t.y, { count: 20, color: 0x402060 });
        c.decals.telegraph('cone', t.x, t.y, 3.2, self.facing, 0.55, 0xa040ff);
      }],
      [1.15, (c) => {
        const h = c.playerPos;
        if (inCone(at.x, at.z, self.facing, 50, 3.4, h.x, h.z)) {
          hitPlayer(self, c, 2.2, 'physical', 'shadow_strike', {
            applies: [{ id: 'bleeding', duration: 5, magnitude: 1.2 }],
          });
        }
      }],
    ]);
    return true;
  }

  // --- pyrelord ------------------------------------------------------------

  private cage(ctx: CombatContext): boolean {
    const self = this.self;
    const h = this.hero(ctx);
    const p = self.root.position;
    const R = 5.5;
    const N = 16;
    // The gap faces away from the caster: the way out is the way it wants you
    // to go, and away from it is still away from it.
    const gap = angleTo(p.x, p.z, h.x, h.z);
    for (let i = 0; i < N; i++) {
      const a = gap + (i / N) * Math.PI * 2;
      if (i === 0 || i === 1 || i === N - 1) continue;
      spawnHazard(self, ctx, h.x + Math.sin(a) * R, h.z + Math.cos(a) * R, 1.15, 0.45, 'fire', 'pyre_cage', {
        duration: 5,
        tickRate: 2,
      });
    }
    self.rootTimer = 1.0;
    const fill = 4;
    ctx.decals.telegraph('circle', h.x, h.z, fill, 0, 2.4, 0xff5020);
    events.emit('toast', { text: `${self.name} cages you in flame!`, kind: 'bad' });
    this.run([
      [2.4, (c) => {
        circleHit(self, c, h.x, h.z, fill, 2.6, 'fire', 'pyre_cage', { knockback: 2 });
        c.fx.burst('hit.fire', h.x, 0.5, h.z, { count: 50, scale: 3 });
      }],
    ]);
    return true;
  }

  // --- broodmother ---------------------------------------------------------

  private broodId(): string {
    const self = this.self;
    const kin = MONSTERS.find(
      (m) => m.family === self.family && m.role === 'swarm' && m.minDepth <= Math.max(3, self.depth) && m.weight > 0,
    );
    return kin?.id ?? self.monsterId;
  }

  private spawnBrood(ctx: CombatContext): boolean {
    this.brood = this.brood.filter((b) => b.alive);
    if (this.brood.length >= 8) return false;
    const self = this.self;
    const p = self.root.position;
    ctx.decals.telegraph('ring', p.x, p.z, 3, 0, 0.6, 0x80ff60);
    const kids = summon(self, ctx, this.broodId(), 2, 2.8);
    for (const k of kids) {
      k.packId = self.packId;
      this.brood.push(k);
    }
    return kids.length > 0;
  }

  private wardByBrood(ctx: CombatContext): void {
    const p = this.self.root.position;
    let near = 0;
    for (const b of this.brood) {
      if (!b.alive) continue;
      if (dist(p.x, p.z, b.root.position.x, b.root.position.z) < 12) near++;
    }
    if (near >= 3) {
      this.self.buff('brood_ward', 0.4, { absorb: 0.6 });
      if (ctx.rng.next() < 0.08) ctx.fx.burst('heal', p.x, 1.2 * this.self.sizeScale, p.z, { count: 4, color: 0x80ff60 });
    }
  }

  /** True while the brood shields it. For the checker and the HUD. */
  get warded(): boolean {
    return this.self.hasBuff('brood_ward');
  }

  // --- deadeye -------------------------------------------------------------

  private volley(ctx: CombatContext): boolean {
    const self = this.self;
    const p = self.root.position;
    const h = this.hero(ctx);
    const base = angleTo(p.x, p.z, h.x, h.z);
    const LEN = 22;
    const angles = [base - 0.28, base, base + 0.28];
    self.facing = base;
    self.rootTimer = 1.3;
    for (const a of angles) ctx.decals.telegraph('line', p.x, p.z, LEN, a, 1.1, 0xffe080);
    this.run([
      [1.1, (c) => {
        for (const a of angles) {
          fireProjectile(self, c, p.x + Math.sin(a) * LEN, p.z + Math.cos(a) * LEN, 1.7, 'physical', 'deadeye_volley', {
            shape: 'bolt',
            speed: 34,
            life: LEN / 34 + 0.1,
            radius: 0.7,
          });
        }
      }],
    ]);
    return true;
  }

  // --- rampager ------------------------------------------------------------

  private rampage(ctx: CombatContext, d: number): boolean {
    const self = this.self;
    const p = self.root.position;
    const h = this.hero(ctx);
    const ang = angleTo(p.x, p.z, h.x, h.z);
    const len = Math.max(8, d + 4);
    self.facing = ang;
    self.rootTimer = 1.1;
    ctx.decals.telegraph('line', p.x, p.z, len, ang, 1.1, 0xff6020);
    this.run([
      [1.1, (c) => {
        const from = self.root.position;
        // Walk the line to the first wall. Stopping short means it hit one.
        let reach = len;
        for (let s = 0.5; s <= len; s += 0.5) {
          const x = from.x + Math.sin(ang) * s;
          const z = from.z + Math.cos(ang) * s;
          if (!c.nav.lineOfSight(from.x, from.z, x, z)) {
            reach = Math.max(0, s - 0.6);
            break;
          }
        }
        const walled = reach < len - 0.1;
        dashToward(self, c, from.x + Math.sin(ang) * reach, from.z + Math.cos(ang) * reach, 16, {
          trample: { mul: 2.6, radius: 1.0, type: 'physical' },
          onLand: (_s, cc) => {
            if (!walled) return;
            self.rootTimer = 2.2;
            self.buff('rampager_dazed', 2.2, { defense: 0.5, taken: 1.35 });
            cc.fx.burst('dust', self.root.position.x, 1, self.root.position.z, { count: 30, scale: 2 });
            events.emit('shake', { amount: 0.45, duration: 0.3 });
            events.emit('toast', { text: `${self.name} slams into the wall!`, kind: 'good' });
          },
        });
      }],
    ]);
    return true;
  }
}

/** The kind's display data, for the HUD or a checker. */
export function miniBossKind(id: string): KindDef | undefined {
  return KIND_BY_ID.get(id as MiniBossKind);
}
