/**
 * SLAY — boss room rules: the fifteen puzzles a boss room can be built around.
 *
 * A phase names its rule in `arena`, the same field the older hooks use
 * (lava floors, pillars). Boss.setArena hands any kind listed here to a rule
 * object, which runs beside the boss for as long as the phase does. When the
 * next phase names the same rule, the rule carries on rather than starting
 * over (limbs stay broken, chains stay cut).
 *
 * Every rule keeps the fair-fight rules (sim/FairFight.ts):
 *  - Getting a rule wrong costs time, never life. The boss calls
 *    `Boss.fumble`: it heals, wards, hides or calls adds, and the fight clock
 *    gets the time back.
 *  - Any blow a rule throws is a boss blow (hit-capped by the scene) and is
 *    shown on the floor at least 0.8 s before it lands.
 *  - Nothing here holds the hero; the worst is a short slow.
 *
 * The objects a rule puts in the room (portals, bells, heartstones, braziers,
 * anchors) are monsters marked `object` in data/monsters.ts: they stand still,
 * never fight, and pay nothing when broken.
 */
import type { DamagePacket } from '../types';
import type { Boss } from './Boss';
import type { Enemy } from './Enemy';
import { events } from '../core/Events';
import { SAFE_TONE } from '../fx/Decals';
import { after, angleDelta, angleTo, dashToward, dist, getAbility, hitPlayer, spawnAt, spawnHazard, type CombatContext } from './Abilities';

export const RULE_KINDS = [
  'wardPortals',
  'heartstones',
  'bells',
  'braziers',
  'linked',
  'lure',
  'tiles',
  'stalker',
  'mirror',
  'breakingCast',
  'chase',
  'defend',
  'guardBreak',
  'weakPoints',
  'chains',
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export function isRoomRule(kind: string | null | undefined): kind is RuleKind {
  return !!kind && (RULE_KINDS as readonly string[]).includes(kind);
}

/** The colour the floor uses for "stand here" (the fight checker reads it too). */
export const SAFE_RING = SAFE_TONE;
const TAU = Math.PI * 2;

export abstract class RoomRule {
  abstract readonly kind: RuleKind;
  /** Times the hero solved it, and times they got it wrong (each one a fumble). */
  solved = 0;
  fumbled = 0;
  /** Room objects this rule put down and is keeping. */
  protected objects: Enemy[] = [];

  constructor(protected readonly boss: Boss) {}

  /** A phase that names this rule began (the first, or a later one). */
  start(_ctx: CombatContext): void {}
  tick(_dt: number, _ctx: CombatContext): void {}
  /** Share of a hero's blow that lands. 0 turns it aside. */
  intake(_packet: DamagePacket, _ctx: CombatContext): number {
    return 1;
  }
  /** A hero's blow landed for `taken` life (`raw` before the rule's share). */
  struck(_taken: number, _raw: number, _ctx: CombatContext): void {}
  /** The boss reached zero life. True keeps it standing. */
  holdDeath(_ctx: CombatContext): boolean {
    return false;
  }
  /** True while the boss cannot be hurt for the rule's sake: the fight clock waits. */
  freezesClock(): boolean {
    return false;
  }
  /** The phase moved on to another rule, or the boss fell. Tidy the room. */
  stop(ctx: CombatContext): void {
    this.clearObjects(ctx);
    this.boss.setHidden(false, ctx);
    this.meter('', 0);
  }

  // --- helpers -------------------------------------------------------------

  protected get home(): { x: number; z: number } {
    return this.boss.home;
  }

  /** Puts `n` objects round the room's centre, `r` metres out, from angle `a0`. */
  protected place(ctx: CombatContext, id: string, n: number, r: number, a0 = Math.PI / 4): Enemy[] {
    const out: Enemy[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      const e = this.putAt(ctx, id, this.home.x + Math.sin(a) * r, this.home.z + Math.cos(a) * r);
      if (e) out.push(e);
    }
    return out;
  }

  protected putAt(ctx: CombatContext, id: string, x: number, z: number, rank?: string): Enemy | null {
    const e = spawnAt(this.boss, ctx, id, x, z, rank);
    if (e) this.objects.push(e);
    return e;
  }

  protected living(id?: string): Enemy[] {
    return this.objects.filter((e) => e.alive && (!id || e.monsterId === id));
  }

  protected clearObjects(ctx: CombatContext): void {
    for (const e of this.objects) {
      if (e.alive) e.takeDamage({ amount: e.maxLife * 10, type: 'arcane', crit: false, source: this.boss.id, ability: 'boss_end' }, ctx);
    }
    this.objects.length = 0;
  }

  /** The rule's bar under the boss bar. An empty label hides it. */
  protected meter(label: string, value: number): void {
    events.emit('boss:rule', { label, value: Math.max(0, Math.min(1, value)) });
  }

  protected say(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    events.emit('toast', { text, kind });
  }

  protected heroNear(ctx: CombatContext, x: number, z: number, r: number): boolean {
    const h = ctx.heroPos ?? ctx.playerPos;
    return dist(h.x, h.z, x, z) < r;
  }

  /** Life the boss gets back on its own terms (a pool burns it, a limb breaks). */
  protected wound(ctx: CombatContext, share: number, ability: string): void {
    this.boss.takeDamage({ amount: this.boss.maxLife * share, type: 'physical', crit: false, source: this.boss.id, ability }, ctx);
  }
}

// ---------------------------------------------------------------------------
// 1. Ward portals: portals feed the boss a shield. Break them to drop it.
// ---------------------------------------------------------------------------

class WardPortals extends RoomRule {
  readonly kind = 'wardPortals';
  private feed = 6;
  private addT = 10;
  private closed = false;
  private reopen = 0;

  override start(ctx: CombatContext): void {
    if (this.living('ward_portal').length === 0 && !this.closed) this.open(ctx);
  }

  private open(ctx: CombatContext): void {
    this.place(ctx, 'ward_portal', 3, 8, Math.PI / 6 + this.solved);
    this.feed = 6;
    this.say('Ward portals open. Break them to drop its shield.', 'bad');
  }

  override tick(dt: number, ctx: CombatContext): void {
    const live = this.living('ward_portal');
    if (this.closed) {
      this.reopen -= dt;
      this.meter('Portals closed', this.reopen / 24);
      if (this.reopen <= 0) {
        this.closed = false;
        this.open(ctx);
      }
      return;
    }
    this.meter('Ward portals', live.length / 3);
    if (live.length === 0) {
      this.closed = true;
      this.reopen = 24;
      this.solved++;
      this.boss.shield = 0;
      this.boss.buff('ward_down', 8, { taken: 1.25 });
      this.say('The portals close. Its ward falls.', 'good');
      return;
    }
    // A portal left standing feeds it: a ward layer every few seconds.
    this.feed -= dt;
    if (this.feed <= 0) {
      this.feed = 6;
      this.fumbled++;
      this.boss.fumble('shield', ctx);
      for (const p of live) ctx.fx.burst('shock', p.root.position.x, 1.3, p.root.position.z, { count: 10, color: 0x80c8ff });
    }
    // And lets a few of its kind walk through.
    this.addT -= dt;
    const adds = this.boss.bossDef.adds ?? [];
    if (this.addT <= 0 && adds.length) {
      this.addT = 12;
      const p = live[this.solved % live.length]!.root.position;
      if (ctx.enemies.filter((e) => e.alive && !e.def.object).length < 8) spawnAt(this.boss, ctx, adds[0]!, p.x, p.z + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Heartstones: it cannot be hurt while the stones beat. They grow back.
// ---------------------------------------------------------------------------

class Heartstones extends RoomRule {
  readonly kind = 'heartstones';
  private bare = 0;
  private grown = false;
  private beat = 0;
  static readonly BARE = 14;

  override start(ctx: CombatContext): void {
    if (!this.grown) this.grow(ctx);
  }

  private grow(ctx: CombatContext): void {
    this.place(ctx, 'heartstone', 3, 7.5, this.solved * 0.9);
    this.grown = true;
  }

  override intake(): number {
    return this.living('heartstone').length > 0 ? 0 : 1;
  }

  override freezesClock(): boolean {
    return this.living('heartstone').length > 0;
  }

  override tick(dt: number, ctx: CombatContext): void {
    const live = this.living('heartstone');
    if (this.bare > 0) {
      this.bare -= dt;
      this.meter('Its heart is bare', this.bare / Heartstones.BARE);
      if (this.bare <= 0) {
        this.grow(ctx);
        this.say('The heartstones beat again.', 'bad');
      }
      return;
    }
    this.meter('Heartstones beating', live.length / 3);
    if (live.length === 0 && this.grown) {
      this.grown = false;
      this.bare = Heartstones.BARE;
      this.solved++;
      this.say('The heartstones are still. Strike now!', 'good');
      return;
    }
    this.beat -= dt;
    if (this.beat <= 0) {
      this.beat = 1.2;
      const b = this.boss.root.position;
      for (const s of live) ctx.fx.burst('blood', s.root.position.x, 1, s.root.position.z, { count: 6, color: 0xff4040 });
      ctx.fx.burst('shock', b.x, 1.2 * this.boss.sizeScale, b.z, { count: 8, color: 0xff4040 });
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Bells: a long cast. Ring three bells to break it, or it heals and wards.
// ---------------------------------------------------------------------------

class Bells extends RoomRule {
  readonly kind = 'bells';
  private next = 8;
  private casting = 0;
  static readonly CAST = 10;

  override tick(dt: number, ctx: CombatContext): void {
    if (this.casting <= 0) {
      this.next -= dt;
      this.meter('', 0);
      if (this.next <= 0 && !this.boss.busy) this.begin(ctx);
      return;
    }
    this.casting -= dt;
    const left = this.living('rite_bell').length;
    this.meter('Bells rung', (3 - left) / 3);
    if (left === 0) {
      this.end();
      this.solved++;
      this.boss.rootTimer = 3;
      this.boss.buff('knell_broken', 5, { taken: 1.4 });
      this.say('The knell breaks!', 'good');
      return;
    }
    if (this.casting <= 0) {
      this.end();
      this.clearObjects(ctx);
      this.fumbled++;
      this.boss.fumble('heal', ctx);
      this.boss.fumble('shield', ctx);
      this.say(`The knell lands. ${this.boss.bossDef.name} mends and wards.`, 'bad');
    }
  }

  private begin(ctx: CombatContext): void {
    this.casting = Bells.CAST;
    this.objects = this.objects.filter((e) => e.alive);
    this.place(ctx, 'rite_bell', 3, 9, ctx.rng.next() * TAU);
    this.boss.channel = Bells.CAST;
    this.boss.rootTimer = Bells.CAST;
    events.emit('boss:cast', { name: this.boss.bossDef.name, ability: 'The Knell', windup: Bells.CAST });
    this.say('A long knell begins. Ring the three bells!', 'bad');
  }

  private end(): void {
    this.casting = 0;
    this.next = 26;
    this.boss.channel = 0;
    this.boss.rootTimer = 0;
    events.emit('boss:castEnd', {});
  }
}

// ---------------------------------------------------------------------------
// 4. Braziers: the room is dark and it is unseen. Light braziers to see it.
// ---------------------------------------------------------------------------

class Braziers extends RoomRule {
  readonly kind = 'braziers';
  private lit: Array<{ x: number; z: number }> = [];
  private set = false;
  private snuff = 15;
  private flicker = 0;

  override start(ctx: CombatContext): void {
    if (this.set) return;
    this.set = true;
    this.place(ctx, 'rite_brazier', 4, 8);
    this.say('The dark hides it. Light the braziers.', 'bad');
  }

  private get seen(): boolean {
    return this.lit.length >= 2;
  }

  override intake(): number {
    return this.seen ? 1 : 0.35;
  }

  override tick(dt: number, ctx: CombatContext): void {
    // A brazier struck is a brazier lit.
    for (const e of this.objects) {
      if (e.alive || e.monsterId !== 'rite_brazier') continue;
      this.lit.push({ x: e.root.position.x, z: e.root.position.z });
      ctx.fx.burst('fire', e.root.position.x, 1.1, e.root.position.z, { count: 30 });
      if (this.lit.length === 2) {
        this.solved++;
        this.say('Firelight finds it!', 'good');
      }
    }
    this.objects = this.objects.filter((e) => e.alive);
    this.boss.setHidden(!this.seen, ctx);
    this.meter('Braziers lit', this.lit.length / 4);

    this.flicker -= dt;
    if (this.flicker <= 0) {
      this.flicker = 0.5;
      for (const l of this.lit) {
        ctx.fx.burst('fire', l.x, 1.1, l.z, { count: 4 });
        ctx.decals.add('glow', l.x, l.z, 3.5);
      }
      // In the dark, only a stir of its passing gives it away.
      if (!this.seen) {
        const p = this.boss.root.position;
        ctx.fx.burst('void', p.x, 0.8, p.z, { count: 3, color: 0x201830 });
      }
    }
    // Its wax children snuff one out now and then.
    this.snuff -= dt;
    if (this.snuff <= 0) {
      this.snuff = 15;
      const out = this.lit.shift();
      if (out) {
        this.putAt(ctx, 'rite_brazier', out.x, out.z);
        ctx.fx.burst('dust', out.x, 1, out.z, { count: 12 });
        this.say('A brazier gutters out.', 'bad');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Linked pair: kill one and the other raises it, unless both fall together.
// ---------------------------------------------------------------------------

class Linked extends RoomRule {
  readonly kind = 'linked';
  private partner: Enemy | null = null;
  private partnerAt = { x: 0, z: 0 };
  /** Seconds left to bring the boss down after its partner fell. */
  private window = 0;
  private kneel = 0;
  static readonly WINDOW = 8;

  override start(ctx: CombatContext): void {
    if (this.partner) return;
    this.raise(ctx, 1);
  }

  private raise(ctx: CombatContext, share: number): void {
    const id = this.boss.bossDef.partner ?? this.boss.bossDef.adds?.[0] ?? 'skeleton_rattler';
    const p = this.partner?.root.position ?? { x: this.home.x + 4, z: this.home.z };
    const e = spawnAt(this.boss, ctx, id, p.x, p.z, 'champion');
    if (!e) return;
    e.maxLife = Math.round(this.boss.maxLife * 0.55);
    e.life = Math.max(1, Math.round(e.maxLife * share));
    this.partner = e;
    this.objects.push(e);
  }

  override holdDeath(ctx: CombatContext): boolean {
    if (!this.partner?.alive) return false;
    // Down, not dead: it waits on its other half.
    this.kneel = Linked.WINDOW;
    this.boss.buff('kneel', Linked.WINDOW, { invulnerable: 1 });
    this.boss.channel = Linked.WINDOW;
    this.boss.rootTimer = Linked.WINDOW;
    this.say(`${this.boss.bossDef.name} kneels. Bring down ${this.partner.name} before it rises!`, 'bad');
    void ctx;
    return true;
  }

  override freezesClock(): boolean {
    return this.kneel > 0;
  }

  override tick(dt: number, ctx: CombatContext): void {
    const partner = this.partner;
    if (!partner) return;
    if (this.kneel > 0) {
      this.kneel -= dt;
      this.meter('Bring them down together', this.kneel / Linked.WINDOW);
      if (!partner.alive) {
        this.kneel = 0;
        this.solved++;
        this.boss.unbuff('kneel');
        this.boss.letDie(ctx);
        return;
      }
      if (this.kneel <= 0) {
        this.boss.unbuff('kneel');
        this.boss.channel = 0;
        this.boss.rootTimer = 0;
        this.fumbled++;
        this.boss.fumble('heal', ctx);
        this.say(`${this.boss.bossDef.name} stands again.`, 'bad');
      }
      return;
    }
    if (!partner.alive) {
      if (this.window <= 0) {
        this.window = Linked.WINDOW;
        this.partnerAt = { x: partner.root.position.x, z: partner.root.position.z };
        this.say(`${partner.name} falls. Bring ${this.boss.bossDef.name} down before it rises!`, 'info');
      }
      this.window -= dt;
      this.meter('Bring them down together', this.window / Linked.WINDOW);
      if (this.window <= 0) {
        this.window = 0;
        this.fumbled++;
        this.boss.fumble('reset', ctx, 6);
        this.raise(ctx, 0.5);
        if (this.partner) this.partner.root.position.set(this.partnerAt.x, 0, this.partnerAt.z);
        this.say(`${partner.name} rises again.`, 'bad');
      }
      return;
    }
    this.window = 0;
    this.meter(partner.name, partner.life / partner.maxLife);
  }
}

// ---------------------------------------------------------------------------
// 6. Lure: you cannot hurt it, but its own pools crack it. Lead it in.
// ---------------------------------------------------------------------------

class Lure extends RoomRule {
  readonly kind = 'lure';
  private pools: Array<{ x: number; z: number; until: number }> = [];
  private dropT = 3;
  private cracked = 0;
  private soakCd = 0;
  static readonly POOL = 2.6;
  static readonly CRACK = 9;

  override intake(): number {
    return this.cracked > 0 ? 1 : 0;
  }

  override freezesClock(): boolean {
    return this.cracked <= 0;
  }

  override tick(dt: number, ctx: CombatContext): void {
    const now = ctx.elapsed;
    this.pools = this.pools.filter((p) => p.until > now);
    this.cracked = Math.max(0, this.cracked - dt);
    this.soakCd = Math.max(0, this.soakCd - dt);
    this.meter(this.cracked > 0 ? 'Glaze cracked' : 'Glazed: lead it into its pools', this.cracked / Lure.CRACK);

    // It sheds a quench pool where you stand. Step off; then make it walk through.
    this.dropT -= dt;
    if (this.dropT <= 0) {
      this.dropT = 6.5;
      const h = ctx.heroPos ?? ctx.playerPos;
      const x = h.x;
      const z = h.z;
      const tel = ctx.decals.telegraph('circle', x, z, Lure.POOL, 0, 1.2, 0x40c0ff);
      after(1.2, (c) => {
        tel.cancel();
        if (!this.boss.alive) return;
        spawnHazard(this.boss, c, x, z, Lure.POOL, 0.2, 'cold', 'arena.quench', { duration: 16, tickRate: 1, color: 0x40c0ff });
        this.pools.push({ x, z, until: c.elapsed + 16 });
      });
    }
    if (this.soakCd > 0) return;
    const b = this.boss.root.position;
    const i = this.pools.findIndex((p) => dist(p.x, p.z, b.x, b.z) < Lure.POOL + this.boss.hitRadius * 0.4);
    if (i < 0) return;
    const pool = this.pools.splice(i, 1)[0]!;
    this.soakCd = 2;
    this.cracked = Lure.CRACK;
    this.solved++;
    this.boss.buff('glaze_cracked', Lure.CRACK, { defense: 0.7 });
    ctx.fx.burst('frost', pool.x, 0.6, pool.z, { count: 40, scale: 3 });
    events.emit('shake', { amount: 0.4, duration: 0.3 });
    this.wound(ctx, 0.03, 'arena.quench');
    this.say('Steam bursts. The glaze cracks!', 'good');
  }
}

// ---------------------------------------------------------------------------
// 7. Tile sequence: walk the lit tiles in order to open it. A wrong tile slows
//    you and wards it.
// ---------------------------------------------------------------------------

class Tiles extends RoomRule {
  readonly kind = 'tiles';
  private next = 5;
  private t = -1;
  private step = 0;
  private open = 0;
  private wrongCd = 0;
  private tiles: Array<{ x: number; z: number }> = [];
  private decoys: Array<{ x: number; z: number }> = [];
  static readonly R = 1.5;
  static readonly GAP = 2.6;
  static readonly HOLD = 3.4;
  static readonly OPEN = 9;

  override intake(): number {
    return this.open > 0 ? 1 : 0.3;
  }

  override tick(dt: number, ctx: CombatContext): void {
    this.wrongCd = Math.max(0, this.wrongCd - dt);
    if (this.open > 0) {
      this.open -= dt;
      this.meter('Open', this.open / Tiles.OPEN);
    }
    if (this.t < 0) {
      if (this.open <= 0) this.meter('Warded: wait for the tiles', 0);
      this.next -= dt;
      if (this.next <= 0) this.begin(ctx);
      return;
    }
    this.t += dt;
    this.meter('Tiles walked', this.step / 3);
    const h = ctx.heroPos ?? ctx.playerPos;
    if (this.wrongCd <= 0 && this.decoys.some((d) => dist(d.x, d.z, h.x, h.z) < Tiles.R)) {
      this.wrongCd = 2;
      this.fumbled++;
      ctx.applyHeroStatus?.('chill', 1.2, 0.5);
      this.boss.fumble('shield', ctx);
      this.say('Wrong tile.', 'bad');
    }
    const tile = this.tiles[this.step]!;
    const from = this.step * Tiles.GAP;
    if (this.t >= from && dist(tile.x, tile.z, h.x, h.z) < Tiles.R) {
      this.step++;
      ctx.fx.burst('crit', tile.x, 0.4, tile.z, { count: 20, color: SAFE_RING });
      if (this.step === 3) {
        this.t = -1;
        this.next = Tiles.OPEN + 4;
        this.open = Tiles.OPEN;
        this.solved++;
        this.say('You walked the measure. It is open!', 'good');
      }
      return;
    }
    if (this.t > from + Tiles.HOLD) {
      this.t = -1;
      this.next = 3;
      this.fumbled++;
      this.boss.fumble('reset', ctx, 4);
      this.say('The measure fades.', 'bad');
    }
  }

  private begin(ctx: CombatContext): void {
    const spot = (): { x: number; z: number } => {
      const a = ctx.rng.next() * TAU;
      const r = ctx.rng.range(4, 9);
      return { x: this.home.x + Math.sin(a) * r, z: this.home.z + Math.cos(a) * r };
    };
    const far = (p: { x: number; z: number }, from: Array<{ x: number; z: number }>): boolean => from.every((q) => dist(p.x, p.z, q.x, q.z) > Tiles.R * 2.6);
    this.tiles = [];
    this.decoys = [];
    for (let tries = 0; this.tiles.length < 3 && tries < 60; tries++) {
      const p = spot();
      if (far(p, this.tiles)) this.tiles.push(p);
    }
    for (let tries = 0; this.decoys.length < 2 && tries < 60; tries++) {
      const p = spot();
      if (far(p, [...this.tiles, ...this.decoys])) this.decoys.push(p);
    }
    while (this.tiles.length < 3) this.tiles.push(spot());
    this.t = 0;
    this.step = 0;
    const span = Tiles.GAP * 3 + Tiles.HOLD;
    this.tiles.forEach((p, k) => {
      after(k * Tiles.GAP, (c) => {
        if (this.t >= 0) c.decals.safeZone(p.x, p.z, Tiles.R, Tiles.HOLD);
      });
    });
    for (const d of this.decoys) ctx.decals.telegraph('circle', d.x, d.z, Tiles.R, 0, span, 0xff4040);
    this.say('The floor lights in order. Follow it.', 'info');
  }
}

// ---------------------------------------------------------------------------
// 8. Stalker: unseen, it leaves tracks. Any blow shows it for a moment.
// ---------------------------------------------------------------------------

class Stalker extends RoomRule {
  readonly kind = 'stalker';
  private seen = 0;
  private last = { x: 0, z: 0 };
  private walked = 0;
  static readonly SEEN = 3.5;

  override start(ctx: CombatContext): void {
    const p = this.boss.root.position;
    this.last = { x: p.x, z: p.z };
    this.boss.setHidden(true, ctx);
    this.say('It fades from sight. Watch for its tracks.', 'bad');
  }

  override intake(): number {
    return this.seen > 0 ? 1 : 0.6;
  }

  override struck(taken: number): void {
    if (taken <= 0) return;
    if (this.seen <= 0) this.solved++;
    this.seen = Stalker.SEEN;
  }

  override tick(dt: number, ctx: CombatContext): void {
    this.seen = Math.max(0, this.seen - dt);
    this.boss.setHidden(this.seen <= 0, ctx);
    this.meter(this.seen > 0 ? 'Seen' : 'Unseen: follow the tracks', this.seen / Stalker.SEEN);
    const p = this.boss.root.position;
    this.walked += dist(p.x, p.z, this.last.x, this.last.z);
    this.last = { x: p.x, z: p.z };
    if (this.walked > 0.9) {
      this.walked = 0;
      ctx.decals.add('dust', p.x, p.z, 0.35 * this.boss.sizeScale);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Mirror: copies of you. While they stand, it takes half.
// ---------------------------------------------------------------------------

class Mirror extends RoomRule {
  readonly kind = 'mirror';
  private next = 3;
  private born = new Map<Enemy, number>();

  override intake(): number {
    return this.living('hero_echo').length > 0 ? 0.5 : 1;
  }

  override tick(dt: number, ctx: CombatContext): void {
    const live = this.living('hero_echo');
    this.meter(live.length ? 'Your echoes stand' : '', live.length / 2);
    this.next -= dt;
    if (this.next <= 0 && live.length < 2) {
      this.next = 20;
      const n = this.boss.phaseIndex > 0 ? 2 : 1;
      const h = ctx.heroPos ?? ctx.playerPos;
      for (let i = 0; i < n; i++) {
        const a = (ctx.heroFacing ?? 0) + Math.PI + (i - (n - 1) / 2) * 1.2;
        const e = this.putAt(ctx, 'hero_echo', h.x + Math.sin(a) * 3.5, h.z + Math.cos(a) * 3.5, 'champion');
        if (!e) continue;
        e.maxLife = Math.round(this.boss.maxLife * 0.06);
        e.life = e.maxLife;
        this.born.set(e, ctx.elapsed);
      }
      this.say('Your own shape steps out of the glass.', 'bad');
    }
    for (const e of live) {
      const at = this.born.get(e) ?? ctx.elapsed;
      // Left standing too long, an echo lends it a ward.
      if (ctx.elapsed - at > 14) {
        this.born.set(e, ctx.elapsed);
        this.fumbled++;
        this.boss.fumble('shield', ctx);
      }
    }
    for (const [e] of this.born) if (!e.alive) {
      this.born.delete(e);
      this.solved++;
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Breaking cast: a long cast with a damage bar. Break it in time.
// ---------------------------------------------------------------------------

class BreakingCast extends RoomRule {
  readonly kind = 'breakingCast';
  private next = 12;
  private casting = 0;
  private done = 0;
  private need = 1;
  static readonly CAST = 8;

  override struck(taken: number): void {
    if (this.casting > 0) this.done += taken;
  }

  override tick(dt: number, ctx: CombatContext): void {
    if (this.casting <= 0) {
      this.meter('', 0);
      this.next -= dt;
      if (this.next <= 0 && !this.boss.busy) {
        this.casting = BreakingCast.CAST;
        this.done = 0;
        this.need = this.boss.maxLife * 0.1;
        this.boss.channel = BreakingCast.CAST;
        this.boss.rootTimer = BreakingCast.CAST;
        events.emit('boss:cast', { name: this.boss.bossDef.name, ability: 'The Hour', windup: BreakingCast.CAST });
        this.say('A great cast begins. Break it with damage!', 'bad');
      }
      return;
    }
    this.casting -= dt;
    this.meter('Break the cast', this.done / this.need);
    if (this.done >= this.need) {
      this.end();
      this.solved++;
      this.boss.rootTimer = 3;
      this.boss.buff('cast_broken', 5, { taken: 1.3 });
      this.say('The cast breaks!', 'good');
      return;
    }
    if (this.casting <= 0) {
      this.end();
      this.fumbled++;
      this.boss.fumble('heal', ctx);
      this.boss.fumble('adds', ctx);
      this.say(`The cast lands. ${this.boss.bossDef.name} winds back its wounds.`, 'bad');
    }
  }

  private end(): void {
    this.casting = 0;
    this.next = 30;
    this.boss.channel = 0;
    this.boss.rootTimer = 0;
    events.emit('boss:castEnd', {});
  }
}

// ---------------------------------------------------------------------------
// 11. Chase: each phase it flees to the next room and turns at bay there.
// ---------------------------------------------------------------------------

class Chase extends RoomRule {
  readonly kind = 'chase';
  private leg = 0;

  override start(ctx: CombatContext): void {
    if (this.leg++ === 0) return;
    this.boss.fleeTo(this.boss.nextChasePoint(), ctx);
  }

  override freezesClock(): boolean {
    return this.boss.fleeing;
  }

  override tick(): void {
    const n = this.boss.bossDef.phases.length;
    this.meter(`Room ${Math.min(n, this.leg)} of ${n}`, Math.min(n, this.leg) / n);
  }
}

// ---------------------------------------------------------------------------
// 12. Defend: keep the lantern lit. While it is out, the boss heals.
// ---------------------------------------------------------------------------

class Defend extends RoomRule {
  readonly kind = 'defend';
  private at: { x: number; z: number } | null = null;
  light = 1;
  private out = false;
  private snuff = 8;
  private mark = 0;
  private relight = 0;
  private feed = 4;
  static readonly R = 2.6;

  override start(ctx: CombatContext): void {
    if (this.at) return;
    const s = this.boss.spawnAt;
    const h = ctx.heroPos ?? ctx.playerPos;
    const a = angleTo(s.x, s.z, h.x, h.z);
    // Off to one side of the way in, so it has to be walked to.
    const side = a + (ctx.rng.next() < 0.5 ? 1 : -1) * 1.1;
    let r = Math.min(7.5, this.boss.arenaRadius - 2);
    while (r > 3 && !ctx.nav.lineOfSight(s.x, s.z, s.x + Math.sin(side) * r, s.z + Math.cos(side) * r)) r -= 0.5;
    this.at = { x: s.x + Math.sin(side) * r, z: s.z + Math.cos(side) * r };
    this.say('Keep the lantern lit! It cannot stand in the light.', 'info');
  }

  override tick(dt: number, ctx: CombatContext): void {
    const at = this.at;
    if (!at) return;
    const near = this.heroNear(ctx, at.x, at.z, Defend.R);
    this.meter(this.out ? 'The lantern is out: relight it' : 'Lantern', this.out ? this.relight / 2 : this.light);
    this.mark -= dt;
    if (this.mark <= 0) {
      this.mark = 2;
      ctx.decals.safeZone(at.x, at.z, Defend.R, 2.05);
      if (!this.out) {
        ctx.decals.add('glow', at.x, at.z, 4 * this.light + 1);
        ctx.fx.burst('fire', at.x, 1.2, at.z, { count: 5 });
      }
    }
    if (this.out) {
      // Dark: it feeds until the flame is back.
      this.feed -= dt;
      if (this.feed <= 0) {
        this.feed = 4;
        this.fumbled++;
        this.boss.fumble('heal', ctx);
      }
      this.relight = near ? this.relight + dt : 0;
      if (this.relight >= 2) {
        this.out = false;
        this.light = 1;
        this.relight = 0;
        this.solved++;
        this.boss.setHidden(false, ctx);
        ctx.fx.burst('fire', at.x, 1.2, at.z, { count: 30 });
        this.say('The lantern burns again.', 'good');
      }
      return;
    }
    if (near) this.light = Math.min(1, this.light + dt * 0.08);
    // While it burns, its light keeps the boss out: guard it and you are out
    // of reach of its hands, but you must leave the light to strike it.
    const bp = this.boss.root.position;
    const ward = Defend.R + 1 + this.boss.sizeScale * 2.2;
    const d = dist(bp.x, bp.z, at.x, at.z);
    if (d < ward) {
      const away = d > 0.01 ? angleTo(at.x, at.z, bp.x, bp.z) : 0;
      this.boss.ruleStep(Math.sin(away) * (ward - d), Math.cos(away) * (ward - d), ctx);
    }
    this.snuff -= dt;
    if (this.snuff > 0) return;
    this.snuff = 9;
    // A grey hand reaches for the flame, shown first. Stand guard and your
    // own light turns it away; guarding costs you only the ground you hold.
    // It is not a blow at you, so it is drawn as the place to stand, not one to leave.
    ctx.fx.burst('void', at.x, 2.4, at.z, { count: 12, color: 0x6040a0 });
    const tel = ctx.decals.safeZone(at.x, at.z, Defend.R * 0.85, 1.2);
    after(1.2, (c) => {
      tel.cancel();
      if (!this.boss.alive || this.out) return;
      if (this.heroNear(c, at.x, at.z, Defend.R)) {
        c.fx.burst('block', at.x, 1.2, at.z, { count: 18 });
        return;
      }
      c.fx.burst('void', at.x, 1, at.z, { count: 24, color: 0x201830 });
      this.light -= 0.5;
      if (this.light <= 0.01) {
        this.light = 0;
        this.out = true;
        this.feed = 1;
        this.say('The lantern goes out. It feeds in the dark.', 'bad');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 13. Guard break: a guard bar. Break it for a few seconds of big damage.
// ---------------------------------------------------------------------------

class GuardBreak extends RoomRule {
  readonly kind = 'guardBreak';
  private guard = -1;
  private max = 1;
  private broken = 0;
  static readonly OPEN = 6;

  override start(): void {
    if (this.guard >= 0) return;
    this.max = this.boss.maxLife * 0.12;
    this.guard = this.max;
  }

  override intake(): number {
    return this.broken > 0 ? 1 : 0.35;
  }

  override struck(_taken: number, raw: number, ctx: CombatContext): void {
    if (this.broken > 0 || raw <= 0) return;
    this.guard -= raw * 0.8;
    if (this.guard > 0) return;
    this.broken = GuardBreak.OPEN;
    this.solved++;
    this.boss.buff('guard_broken', GuardBreak.OPEN, { taken: 1.6, defense: 0.6 });
    this.boss.rootTimer = 2.5;
    this.boss.channel = 2.5;
    const p = this.boss.root.position;
    ctx.fx.burst('crit', p.x, 1.4 * this.boss.sizeScale, p.z, { count: 40, color: 0xffe066 });
    events.emit('shake', { amount: 0.5, duration: 0.3 });
    this.say('Guard broken!', 'good');
  }

  override tick(dt: number): void {
    if (this.broken > 0) {
      this.broken -= dt;
      this.meter('Guard broken', this.broken / GuardBreak.OPEN);
      if (this.broken <= 0) {
        this.guard = this.max;
        this.say(`${this.boss.bossDef.name} raises its guard.`, 'info');
      }
      return;
    }
    this.meter('Guard', this.guard / this.max);
  }
}

// ---------------------------------------------------------------------------
// 14. Weak points: limbs to break; each broken limb takes away an attack.
// ---------------------------------------------------------------------------

class WeakPoints extends RoomRule {
  readonly kind = 'weakPoints';
  private limbs: Array<{ name: string; ability?: string; life: number; broken: boolean }> = [];

  override start(): void {
    if (!this.limbs.length) {
      const named = this.boss.bossDef.limbs ?? [{ name: 'left arm' }, { name: 'right arm' }, { name: 'left leg' }, { name: 'right leg' }];
      this.limbs = named.slice(0, 4).map((l) => ({ ...l, life: this.boss.maxLife * 0.08, broken: false }));
    }
    // A new phase brings a new kit; what is broken stays broken.
    for (const l of this.limbs) if (l.broken) this.strip(l);
  }

  /** The limb on the side the hero is striking from: arms in front, legs behind. */
  private facingLimb(ctx: CombatContext): number {
    const b = this.boss.root.position;
    const h = ctx.heroPos ?? ctx.playerPos;
    const rel = angleDelta(this.boss.facing, angleTo(b.x, b.z, h.x, h.z));
    return (Math.abs(rel) < Math.PI / 2 ? 0 : 2) + (rel > 0 ? 0 : 1);
  }

  override struck(taken: number, _raw: number, ctx: CombatContext): void {
    if (taken <= 0) return;
    const l = this.limbs[this.facingLimb(ctx) % this.limbs.length];
    if (!l || l.broken) return;
    l.life -= taken * 0.9;
    if (l.life > 0) return;
    l.broken = true;
    this.solved++;
    const lost = this.strip(l);
    this.boss.rootTimer = 2.5;
    this.boss.buff('limb_broken', 4, { taken: 1.3 });
    const p = this.boss.root.position;
    ctx.fx.burst('bossSlam', p.x, 1.2 * this.boss.sizeScale, p.z, { count: 40, scale: 3 });
    events.emit('shake', { amount: 0.8, duration: 0.4 });
    this.say(lost ? `Its ${l.name} breaks! No more ${lost}.` : `Its ${l.name} breaks!`, 'good');
    this.wound(ctx, 0.03, 'arena.limb');
  }

  /** Takes the limb's attack out of the kit. Returns the attack's name. */
  private strip(l: { name: string; ability?: string }): string | null {
    const kit = this.boss.abilityIds;
    if (kit.length <= 1) return null;
    let i = l.ability ? kit.indexOf(l.ability) : -1;
    if (i < 0) {
      // The heaviest move left goes with the limb.
      let best = -1;
      kit.forEach((id, k) => {
        const m = getAbility(id)?.damageMul ?? 0;
        if (id !== 'basic_strike' && m > best) {
          best = m;
          i = k;
        }
      });
    }
    if (i < 0) return null;
    const id = kit.splice(i, 1)[0]!;
    if (!l.ability) l.ability = id;
    return getAbility(id)?.name ?? null;
  }

  override tick(): void {
    this.meter('Limbs broken', this.limbs.filter((l) => l.broken).length / Math.max(1, this.limbs.length));
  }

  get broken(): number {
    return this.limbs.filter((l) => l.broken).length;
  }
}

// ---------------------------------------------------------------------------
// 15. Chains: chained to anchors. Cut one and it charges; into a wall, it is
//     stunned and open.
// ---------------------------------------------------------------------------

class Chains extends RoomRule {
  readonly kind = 'chains';
  private set = false;
  private held = 4;
  private link = 0;
  static readonly REACH = 16;

  override start(ctx: CombatContext): void {
    if (this.set) return;
    this.set = true;
    this.place(ctx, 'chain_anchor', 4, 8);
    this.held = 4;
    this.say('It is chained down. Cut a chain and it charges.', 'info');
  }

  override intake(): number {
    return this.living('chain_anchor').length > 0 ? 0.6 : 1;
  }

  override tick(dt: number, ctx: CombatContext): void {
    const anchors = this.living('chain_anchor');
    this.meter('Chains holding', anchors.length / 4);
    if (anchors.length < this.held) {
      this.held = anchors.length;
      this.charge(ctx);
    }
    if (!anchors.length) return;
    // The chains hold it near the middle; each one cut lets it range further.
    const p = this.boss.root.position;
    const leash = 3 + (4 - anchors.length) * 2;
    const d = dist(p.x, p.z, this.home.x, this.home.z);
    if (d > leash && !this.boss.motionOverride) {
      const a = angleTo(p.x, p.z, this.home.x, this.home.z);
      const pull = Math.min(d - leash, 6 * dt);
      this.boss.ruleStep(Math.sin(a) * pull, Math.cos(a) * pull, ctx);
    }
    this.link -= dt;
    if (this.link <= 0) {
      this.link = 0.6;
      for (const an of anchors) {
        const q = an.root.position;
        ctx.fx.burst('sparks', (p.x + q.x) / 2, 0.6, (p.z + q.z) / 2, { count: 2, color: 0xc0a070 });
      }
    }
  }

  private charge(ctx: CombatContext): void {
    const b = this.boss.root.position;
    const h = ctx.heroPos ?? ctx.playerPos;
    const heading = angleTo(b.x, b.z, h.x, h.z);
    this.boss.facing = heading;
    this.boss.channel = 1.3;
    this.boss.rootTimer = 1.2;
    ctx.decals.telegraph('line', b.x, b.z, Chains.REACH, heading, 1.2, 0xff8030);
    this.say('A chain snaps. It charges!', 'bad');
    after(1.2, (c) => {
      if (!this.boss.alive) return;
      const s = this.boss.root.position;
      // Run the line until a wall or the room's edge stops it.
      let len = 0;
      let wall = false;
      for (let k = 0.5; k <= Chains.REACH; k += 0.5) {
        const x = s.x + Math.sin(heading) * k;
        const z = s.z + Math.cos(heading) * k;
        const open = c.nav.lineOfSight(s.x, s.z, x, z) && dist(x, z, this.boss.spawnAt.x, this.boss.spawnAt.z) < this.boss.arenaRadius;
        if (!open) {
          wall = true;
          break;
        }
        len = k;
      }
      const ex = s.x + Math.sin(heading) * len;
      const ez = s.z + Math.cos(heading) * len;
      dashToward(this.boss, c, ex, ez, 18, {
        trample: { mul: 1.6, radius: 1.3 * (this.boss.reach ?? this.boss.sizeScale), type: 'physical' },
        onLand: (_self, cc) => {
          if (!wall || !this.boss.alive) return;
          this.solved++;
          this.boss.rootTimer = 4;
          this.boss.channel = 4;
          this.boss.buff('wall_stunned', 4, { taken: 1.6 });
          cc.fx.burst('bossSlam', ex, 1, ez, { count: 50, scale: 3 });
          cc.decals.add('crack', ex, ez, 3);
          events.emit('shake', { amount: 1.0, duration: 0.5 });
          this.say('It slams into the wall, stunned!', 'good');
        },
      });
    });
  }
}

const MAKERS: Record<RuleKind, (b: Boss) => RoomRule> = {
  wardPortals: (b) => new WardPortals(b),
  heartstones: (b) => new Heartstones(b),
  bells: (b) => new Bells(b),
  braziers: (b) => new Braziers(b),
  linked: (b) => new Linked(b),
  lure: (b) => new Lure(b),
  tiles: (b) => new Tiles(b),
  stalker: (b) => new Stalker(b),
  mirror: (b) => new Mirror(b),
  breakingCast: (b) => new BreakingCast(b),
  chase: (b) => new Chase(b),
  defend: (b) => new Defend(b),
  guardBreak: (b) => new GuardBreak(b),
  weakPoints: (b) => new WeakPoints(b),
  chains: (b) => new Chains(b),
};

export function makeRule(kind: RuleKind, boss: Boss): RoomRule {
  return MAKERS[kind](boss);
}
