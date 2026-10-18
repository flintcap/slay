/**
 * SLAY — the item power runtime.
 *
 * `sim/ItemPowers.ts` decides what a character's powers add up to. This is the
 * half that acts on them in a live dungeon: the moment a hit lands, a hit is
 * taken, something dies, gold is picked up, or a second passes.
 *
 * It also makes Life Steal and Mana Steal real. Both stats rolled on hundreds
 * of items and sat on the character sheet, and nothing in the game ever read
 * either of them.
 *
 * The dungeon scene owns one of these. It installs the entity hooks on
 * construction and removes them on `dispose`, so the town and the menus never
 * run any of it.
 */

import * as THREE from 'three';
import type { DamagePacket, DamageType, StatusApplication } from '../types';
import { events, toast } from '../core/Events';
import type { Random } from '../core/RNG';
import type { Player } from '../entities/Player';
import type { Enemy, CombatContext } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import type { EffectSystem } from '../fx/Effects';
import type { FXSystem } from '../fx/Particles';
import type { DecalSystem } from '../fx/Decals';
import { rollDamage, expectedMitigated } from '../sim/Combat';
import { powerEffects, powerHooks, emptyPowerEffects, weaponKind, type PowerEffects } from '../sim/ItemPowers';
import { getBase } from '../sim/Loot';
import type { MonsterRank } from '../types';

/** Everything the runtime needs from the scene that owns it. */
export interface PowerHost {
  player: () => Player;
  enemies: () => Enemy[];
  boss: () => Boss | null;
  context: () => CombatContext;
  effects: EffectSystem;
  fx: FXSystem;
  decals: DecalSystem;
  rng: () => Random;
  /** True when a world point can be stood on. */
  walkable: (x: number, z: number) => boolean;
  /** Drops one extra item roll at a point. Covetous curses use it. */
  dropBonus: (at: THREE.Vector3, ilvl: number, rank: MonsterRank) => void;
}

/** Hits the runtime throws itself. They never trigger further procs. */
const PROC_ABILITIES = new Set([
  'Cleave', 'Pierce', 'Return', 'Echo', 'Sentry', 'Rot Cyclone', 'Pyre', 'Shatter', 'Warm Prints',
  'Toll', 'Planet', 'Grave', 'Lit Ring', 'Wax Double', 'Kiln', 'Glass Shards', 'Bell',
]);

/** Metres walked between two burning footprints. */
const PRINT_STRIDE = 0.85;
/** Seconds a footprint keeps burning. */
const PRINT_LIFE = 3;
/** How close to a print counts as standing in it. */
const PRINT_REACH = 0.6;

interface Scheduled {
  t: number;
  target: Enemy;
  packet: DamagePacket;
}

/** What Sure-Footed shrugs off. */
const SLOWS: ReadonlySet<string> = new Set(['slowed', 'rooted', 'chilled', 'crippled']);

const ELEMENTAL: ReadonlySet<DamageType> = new Set<DamageType>(['fire', 'cold', 'lightning', 'arcane']);

export class PowerRuntime {
  private host: PowerHost;
  private fx: PowerEffects = emptyPowerEffects();
  private queue: Scheduled[] = [];
  private offs: Array<() => void> = [];
  /** Damage type of the last player hit on each enemy, for Shatter. */
  private lastType = new Map<string, DamageType>();
  /** Enemies cursed by Covetous. */
  private wished = new Set<string>();
  /** Life to restore from a Life Tap, keyed by the packet that carried it. */
  private tapped = new WeakMap<DamagePacket, number>();
  private igniteCd = 0;
  private panicCd = 0;
  private rotTimer = 0;
  private sentryTimer = 0;
  private manaProcCd = 0;
  /** Overflowing Ward's pool, in life points. */
  ward = 0;
  /** Warm Prints: the footprints still burning, and where the last one fell. */
  private prints: Array<{ x: number; z: number; left: number }> = [];
  private lastPrint: THREE.Vector3 | null = null;
  private printSide = 1;
  private printTimer = 0;
  // Set signatures (see the set powers in `sim/ItemPowers.ts`).
  /** Tolls stored by blocking. */
  toll = 0;
  /** Planets turning round you, and the notes rung. */
  planets = 0;
  notes = 0;
  /** Seconds left hidden in soot; the next hit crits. */
  private unseen = 0;
  private nextCrit = false;
  /** Seconds the hero has stood still, and where. */
  private still = 0;
  private stillAt: THREE.Vector3 | null = null;
  private graves: Array<{ x: number; z: number; t: number }> = [];
  private ringTimer = 0;
  private lastForm: string | null = null;
  private waxes: Array<{ x: number; z: number; t: number }> = [];
  /** Fire taken toward the kiln's burst, in life points. */
  private kiln = 0;
  private bellHits = 0;
  /** Seconds left wearing a borrowed crown. */
  private crown = 0;

  constructor(host: PowerHost) {
    this.host = host;
    this.refresh();
    powerHooks.outgoing = (t, p, ctx) => this.outgoing(t as Enemy, p, ctx as CombatContext);
    powerHooks.afterHit = (t, p, taken, ctx) => this.afterHit(t as Enemy, p, taken, ctx as CombatContext);
    this.offs.push(
      events.on('item:equipped', () => this.refresh()),
      events.on('item:unequipped', () => this.refresh()),
      events.on('loot:gold', () => this.onGold()),
      events.on('skill:cast', () => this.onCast()),
      events.on('player:evaded', () => this.onEvade()),
    );
  }

  /** Re-reads the character's powers. Cheap; runs on every gear change. */
  refresh(): void {
    try {
      this.fx = powerEffects(this.host.player().character);
    } catch {
      this.fx = emptyPowerEffects();
    }
    if (this.fx.wardPct <= 0) this.ward = 0;
  }

  /** The live record, for tools and the HUD. */
  get effects(): PowerEffects {
    return this.fx;
  }

  // -------------------------------------------------------------------------
  // Outgoing
  // -------------------------------------------------------------------------

  private outgoing(target: Enemy, packet: DamagePacket, ctx: CombatContext): DamagePacket {
    const p = this.fx;
    let type = packet.type;
    if (type === 'physical') {
      if (p.convertFirePct > 0) type = 'fire';
      else if (p.convertColdArcanePct > 0) type = ctx.rng.chance(0.5) ? 'cold' : 'arcane';
    }
    let more = 0;
    if (type === 'fire') more += p.fireMorePct;
    if (type === 'cold') more += p.coldMorePct;
    if (type === 'lightning') more += p.lightningMorePct;
    if (type === 'poison') more += p.poisonMorePct;
    if (ELEMENTAL.has(type)) more += p.elementalMorePct;
    if (packet.crit) more += p.critMorePct;
    // The Stayed are dead delvers: undead to every blessing that hunts the dead.
    if (target.family === 'undead' || target.family === 'stayed') more += p.vsUndeadPct;
    else more -= p.vsLivingPenaltyPct;
    if (target.family === 'demon') more += p.vsDemonPct;
    if (target.family === 'beast') more += p.vsBeastPct;
    if (p.vsStaggeredPct > 0 && target.hasStatus('stunned')) more += p.vsStaggeredPct;
    if (this.crown > 0) more += p.crownPct;

    let mul = 1 + more / 100;
    // Out of the soot: the first blow is a critical strike.
    let crit = packet.crit;
    if (this.nextCrit && !PROC_ABILITIES.has(packet.ability ?? '')) {
      this.nextCrit = false;
      if (!crit) {
        crit = true;
        mul *= 1 + Math.max(50, this.host.player().stats.critDamage ?? 0) / 100;
      }
    }
    let tap = 0;
    if (p.lifeTapChance > 0 && !PROC_ABILITIES.has(packet.ability ?? '') && ctx.rng.chance(Math.min(1, p.lifeTapChance / 100))) {
      mul *= 1 + p.lifeTapPct / 100;
      tap = p.lifeTapPct / (100 + p.lifeTapPct);
    }
    const knock = p.knockback > 0 ? Math.max(packet.knockback ?? 0, p.knockback) : packet.knockback;
    if (type === packet.type && mul === 1 && knock === packet.knockback && tap === 0 && crit === packet.crit) return packet;
    const out: DamagePacket = { ...packet, type, crit, amount: Math.max(0, packet.amount * mul) };
    if (knock !== undefined) out.knockback = knock;
    if (tap > 0) this.tapped.set(out, tap);
    return out;
  }

  private afterHit(target: Enemy, packet: DamagePacket, taken: number, ctx: CombatContext): void {
    const player = this.host.player();
    if (!player.alive) return;
    const p = this.fx;
    const st = player.stats;
    this.lastType.set(target.id, packet.type);

    // --- Life Steal and Mana Steal ----------------------------------------
    // Capped per hit at a sixth of the pool, so one enormous crit cannot turn
    // a sliver of leech into a full heal.
    if (taken > 0 && !(packet.crit && p.noCritLeech > 0)) {
      if (st.lifeSteal > 0) {
        const gain = Math.min(st.life / 6, (taken * st.lifeSteal) / 100);
        const over = gain - (st.life - player.life);
        player.heal(gain);
        // Grave Pact: what overflows becomes a ward.
        if (over > 0) player.overheal(over);
      }
      if (st.manaSteal > 0) player.restoreMana(Math.min(st.mana / 6, (taken * st.manaSteal) / 100));
    }
    const tap = this.tapped.get(packet);
    if (tap && taken > 0) {
      player.heal(taken * tap);
      ctx.fx.burst('blood', target.root.position.x, 1.1, target.root.position.z, { count: 10, color: 0xc0303a });
    }

    if (PROC_ABILITIES.has(packet.ability ?? '')) return;

    // --- statuses riding the hit ------------------------------------------
    const riders: StatusApplication[] = [];
    if (p.chillChance > 0 && ctx.rng.chance(p.chillChance / 100)) riders.push({ id: 'chilled', duration: 3, magnitude: 1, stacks: 1 });
    if (p.weakenChance > 0 && ctx.rng.chance(p.weakenChance / 100)) riders.push({ id: 'weakened', duration: 5, magnitude: 1, stacks: 1 });
    if (p.fearDemonChance > 0 && target.family === 'demon' && !target.isBoss && ctx.rng.chance(p.fearDemonChance / 100)) {
      riders.push({ id: 'feared', duration: 2.5, magnitude: 1, stacks: 1 });
    }
    if (p.critStaggerSec > 0 && packet.crit) riders.push({ id: 'stunned', duration: p.critStaggerSec, magnitude: 1, stacks: 1 });
    if (riders.length && target.life > 0) target.applyStatuses(riders, ctx);
    if (p.wishCurseChance > 0 && !this.wished.has(target.id) && ctx.rng.chance(p.wishCurseChance / 100)) {
      this.wished.add(target.id);
      ctx.fx.burst('pickup', target.root.position.x, 1.6, target.root.position.z, { count: 12, color: 0xffd66b });
    }

    // --- ignition ------------------------------------------------------------
    if (p.igniteRadius > 0 && this.igniteCd <= 0) {
      this.igniteCd = 0.4;
      const at = target.root.position;
      for (const e of this.host.enemies()) {
        if (e.life <= 0 || e.root.position.distanceTo(at) > p.igniteRadius) continue;
        e.applyStatuses([{ id: 'burning', duration: 4, magnitude: 1, stacks: 1 }], ctx);
      }
      this.host.decals.add('scorch', at.x, at.z, p.igniteRadius * 0.7);
      ctx.fx.burst('embers', at.x, 0.4, at.z, { count: 14 });
    }

    // --- shape of the weapon decides what carries on --------------------------
    const main = player.character.equipment.mainHand;
    let style: ReturnType<typeof weaponKind> = 'unarmed';
    try {
      style = weaponKind(main ? getBase(main.baseId).category : undefined);
    } catch {
      /* unknown base: treat as unarmed */
    }
    if ((style === 'melee' || style === 'unarmed') && p.cleavePct > 0 && taken > 0) {
      const at = target.root.position;
      const share = (packet.amount * p.cleavePct) / 100;
      const stagger = p.cleaveRadius >= 3.5;
      for (const e of this.allTargets()) {
        if (e === target || e.life <= 0) continue;
        if (e.root.position.distanceTo(at) > p.cleaveRadius + e.hitRadius) continue;
        e.takeDamage({ amount: share, type: packet.type, crit: false, source: 'player', ability: 'Cleave' }, ctx);
        if (stagger && e.life > 0) e.applyStatuses([{ id: 'stunned', duration: 0.35, magnitude: 1, stacks: 1 }], ctx);
      }
    }
    if (style === 'ranged') {
      if (p.pierceChainPct > 0) {
        const next = this.nearestTo(target.root.position, 6, target);
        if (next) {
          this.host.effects.projectile(target.root.position.clone().setY(1.1), next.root.position.clone().setY(1.1), {
            element: packet.type, speed: 30,
          });
          next.takeDamage({ ...packet, amount: (packet.amount * p.pierceChainPct) / 100, ability: 'Pierce' }, ctx);
        }
      }
      if (p.returnHitPct > 0) {
        this.queue.push({ t: 0.28, target, packet: { ...packet, amount: (packet.amount * p.returnHitPct) / 100, ability: 'Return', crit: false } });
      }
    }
    if (p.echoHitPct > 0 && packet.ability && packet.ability !== 'Attack') {
      this.queue.push({ t: 0.35, target, packet: { ...packet, amount: (packet.amount * p.echoHitPct) / 100, ability: 'Echo', crit: false } });
    }

    // --- set signatures --------------------------------------------------------
    const skillHit = !!packet.ability && packet.ability !== 'Attack';
    if (p.tollPct > 0 && this.toll > 0 && skillHit && (style === 'melee' || style === 'unarmed')) {
      const at = target.root.position.clone();
      this.area(at, 4, (p.tollPct * this.toll) / 100, 'physical', 'Toll', ctx, [{ id: 'stunned', duration: 0.5, magnitude: 1, stacks: 1 }]);
      this.host.effects.nova(at.x, at.z, 4, { element: 'physical', color: 0xd8b060 });
      this.toll = 0;
    }
    if (p.stillPiercePct > 0 && style === 'ranged' && this.still >= 1) {
      const at = target.root.position;
      let n = 0;
      for (const e of this.allTargets()) {
        if (n >= 3 || e === target || e.root.position.distanceTo(at) > 8) continue;
        this.host.effects.projectile(at.clone().setY(1.1), e.root.position.clone().setY(1.1), { element: packet.type, speed: 34 });
        e.takeDamage({ ...packet, amount: (packet.amount * p.stillPiercePct) / 100, ability: 'Pierce', crit: false }, ctx);
        n++;
      }
    }
    if (p.bellPct > 0 && p.bellEvery > 0 && ++this.bellHits >= p.bellEvery) {
      this.bellHits = 0;
      const at = player.position.clone();
      for (const e of this.allTargets()) {
        if (e.root.position.distanceTo(at) > 4 + e.hitRadius) continue;
        const bell = rollDamage(st, ctx.rng, { scale: p.bellPct / 100, type: 'physical', ability: 'Bell', source: 'player' });
        bell.knockback = 3;
        bell.applies = [{ id: 'stunned', duration: 0.4, magnitude: 1, stacks: 1 }];
        e.takeDamage(bell, ctx);
      }
      this.host.effects.nova(at.x, at.z, 4, { element: 'cold', color: 0x70c8c0 });
    }

    // --- resources -----------------------------------------------------------
    if (this.manaProcCd <= 0) {
      if (p.manaOnLightningPct > 0 && packet.type === 'lightning') {
        player.restoreMana((st.mana * p.manaOnLightningPct) / 100);
        this.manaProcCd = 0.12;
      }
      if (p.manaOnFireLowPct > 0 && packet.type === 'fire' && player.mana < st.mana * 0.5) {
        player.restoreMana((st.mana * p.manaOnFireLowPct) / 100);
        this.manaProcCd = 0.12;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Incoming
  // -------------------------------------------------------------------------

  /** Shapes a hit aimed at the player before it is mitigated. */
  incoming(packet: DamagePacket): DamagePacket {
    const p = this.fx;
    const player = this.host.player();
    let out = packet;
    const edit = (): DamagePacket => (out === packet ? (out = { ...packet }) : out);

    if (p.freezeImmune > 0 && out.applies?.some((a) => a.id === 'chilled' || a.id === 'frozen')) {
      edit().applies = out.applies!.filter((a) => a.id !== 'chilled' && a.id !== 'frozen');
    }
    if (p.unstoppable > 0) {
      if (out.applies?.some((a) => a.id === 'stunned' || a.id === 'knockedDown')) {
        edit().applies = out.applies!.filter((a) => a.id !== 'stunned' && a.id !== 'knockedDown');
      }
      if (out.knockback) edit().knockback = 0;
    }
    if (p.poisonTakenLessPct > 0 && out.type === 'poison') {
      const cut = out.amount * Math.min(1, p.poisonTakenLessPct / 100);
      edit().amount = out.amount - cut;
      if (p.poisonFeedsPct > 0) player.restoreMana(cut * (p.poisonFeedsPct / 100) * 0.5);
      if (p.poisonTakenLessPct >= 100 && out.applies) out.applies = out.applies.filter((a) => a.id !== 'poisoned');
    }
    if (p.sureFooted > 0 && out.applies?.some((a) => SLOWS.has(a.id))) {
      edit().applies = out.applies!.filter((a) => !SLOWS.has(a.id));
    }
    if (this.unseen > 0 && out.amount > 0) edit().amount = out.amount * 0.5;
    if (this.crown > 0 && out.amount > 0) edit().amount = out.amount * 0.8;
    if (p.rangedTakenLessPct > 0 && out.ability && out.ability !== 'melee' && out.ability !== 'thorns') {
      edit().amount = out.amount * (1 - Math.min(0.75, p.rangedTakenLessPct / 100));
    }

    // Ward first, then mana: both pay for what would actually land, so they are
    // costed against the mitigated amount rather than the raw swing.
    if ((this.ward > 0 || p.manaShieldPct > 0) && out.amount > 0) {
      const est = Math.max(0.01, expectedMitigated(out.amount, out.type, player.stats));
      let absorbed = 0;
      if (this.ward > 0) {
        const use = Math.min(this.ward, est);
        this.ward -= use;
        absorbed += use;
      }
      if (p.manaShieldPct > 0 && est - absorbed > 0) {
        const want = (est - absorbed) * Math.min(1, p.manaShieldPct / 100);
        const pay = Math.min(player.mana, want);
        player.mana -= pay;
        absorbed += pay;
      }
      if (absorbed > 0) edit().amount = out.amount * Math.max(0, 1 - absorbed / est);
    }
    return out;
  }

  /** Runs after the player has been hit. */
  afterPlayerHit(packet: DamagePacket, taken: number, blocked: boolean): void {
    const p = this.fx;
    const player = this.host.player();
    if (blocked && p.manaOnBlockPct > 0) player.restoreMana((player.stats.mana * p.manaOnBlockPct) / 100);
    if (blocked && p.tollPct > 0 && this.toll < p.tollMax) {
      this.toll++;
      this.host.fx.burst('pickup', player.position.x, 1.2, player.position.z, { count: 6, color: 0xd8b060 });
    }
    if (p.kilnPct > 0 && packet.type === 'fire' && taken > 0) {
      this.kiln += taken;
      if (this.kiln >= player.stats.life * 0.2) {
        this.kiln = 0;
        const ctx = this.host.context();
        this.area(player.position, 5, p.kilnPct / 100, 'fire', 'Kiln', ctx, [{ id: 'burning', duration: 3, magnitude: 1, stacks: 1 }]);
        this.host.effects.explosion(player.position.x, 0.6, player.position.z, { radius: 5, element: 'fire' });
      }
    }
    if (
      p.panicBlinkPct > 0 &&
      this.panicCd <= 0 &&
      taken > 0 &&
      player.alive &&
      (player.life / Math.max(1, player.stats.life)) * 100 < p.panicBlinkPct
    ) {
      this.blink();
    }
    void packet;
  }

  private blink(): void {
    const player = this.host.player();
    const from = player.position.clone();
    const rng = this.host.rng();
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(7, 13);
      const x = from.x + Math.cos(a) * d;
      const z = from.z + Math.sin(a) * d;
      if (!this.host.walkable(x, z)) continue;
      this.host.effects.teleportOut(from.x, 0.8, from.z, 0x8a5cff);
      player.position.set(x, player.position.y, z);
      player.stop();
      this.host.effects.teleportIn(x, 0.8, z, 0x8a5cff);
      this.panicCd = this.fx.panicBlinkCooldown || 15;
      toast('Panic Blink', 'info');
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Kills, gold, ticking
  // -------------------------------------------------------------------------

  /** Called once per enemy, the moment its loot is granted. */
  onKill(enemy: Enemy): void {
    const p = this.fx;
    const ctx = this.host.context();
    const at = enemy.root.position.clone();
    if (this.wished.delete(enemy.id)) {
      this.host.dropBonus(at, enemy.ilvl, enemy.rank ?? 'normal');
      ctx.fx.burst('pickup', at.x, 1.0, at.z, { count: 26, color: 0xffd66b });
    }
    const last = this.lastType.get(enemy.id);
    this.lastType.delete(enemy.id);
    if (p.shatterRadius > 0 && (last === 'cold' || enemy.hasStatus('chilled') || enemy.hasStatus('frozen'))) {
      this.host.effects.nova(at.x, at.z, p.shatterRadius, { element: 'cold', color: 0x9fe0ff });
      for (const e of this.host.enemies()) {
        if (e === enemy || e.life <= 0 || e.root.position.distanceTo(at) > p.shatterRadius) continue;
        e.applyStatuses([{ id: 'frozen', duration: 1.5, magnitude: 1, stacks: 1 }], ctx);
      }
    }
    if (p.unseenSec > 0) {
      this.unseen = p.unseenSec;
      this.nextCrit = true;
      this.host.fx.burst('poison', this.host.player().position.x, 1.0, this.host.player().position.z, { count: 14, color: 0x1a1a1a });
    }
    if (p.gravePct > 0 && this.graves.length < 12) this.graves.push({ x: at.x, z: at.z, t: 1.2 });
    const elite = (enemy.rank ?? 'normal') !== 'normal';
    if (elite && p.crownSec > 0) {
      if (this.crown <= 0) toast('The Borrowed Crown', 'info');
      this.crown = p.crownSec;
    }
    if (elite && p.eliteDropChance > 0 && ctx.rng.chance(p.eliteDropChance / 100)) {
      this.host.dropBonus(at, enemy.ilvl, enemy.rank ?? 'normal');
      ctx.fx.burst('pickup', at.x, 1.0, at.z, { count: 18, color: 0xe0c080 });
    }
    if (p.pyreKillPct > 0) {
      this.area(at, 3, p.pyreKillPct / 100, 'fire', 'Pyre', ctx, [{ id: 'burning', duration: 4, magnitude: 1, stacks: 1 }]);
      this.host.decals.add('scorch', at.x, at.z, 2.2);
      this.host.effects.explosion(at.x, 0.4, at.z, { radius: 2.2, element: 'fire' });
    }
  }

  private onGold(): void {
    const p = this.fx;
    if (p.goldToLifePct <= 0) return;
    const player = this.host.player();
    if (!player.alive) return;
    player.heal((player.stats.life * p.goldToLifePct) / 100);
    this.host.fx.burst('heal', player.position.x, 1.0, player.position.z, { count: 8, color: 0xffc63a });
  }

  /** A skill went off: planets and notes. */
  private onCast(): void {
    const p = this.fx;
    const player = this.host.player();
    if (!player.alive) return;
    if (p.orreryPct > 0) {
      this.planets++;
      this.host.fx.burst('pickup', player.position.x, 1.8, player.position.z, { count: 4, color: 0x7aa8ff });
      if (this.planets >= 9) {
        this.planets = 0;
        const ctx = this.host.context();
        const foes = this.allTargets()
          .filter((e) => e.root.position.distanceTo(player.position) < 14)
          .sort((a, b) => a.root.position.distanceTo(player.position) - b.root.position.distanceTo(player.position));
        for (let i = 0; i < 9 && foes.length; i++) {
          const e = foes[i % foes.length]!;
          const a = (i / 9) * Math.PI * 2;
          const from = player.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 1.8, Math.sin(a) * 1.2));
          this.host.effects.projectile(from, e.root.position.clone().setY(1.0), { element: 'arcane', color: 0x8ab0ff, speed: 24 });
          e.takeDamage(rollDamage(player.stats, ctx.rng, { scale: p.orreryPct / 100, type: 'arcane', ability: 'Planet', source: 'player' }), ctx);
        }
      }
    }
    if (p.ninefoldPct > 0 && ++this.notes >= 9) {
      this.notes = 0;
      player.heal((player.stats.life * p.ninefoldPct) / 100);
      player.restoreMana((player.stats.mana * p.ninefoldPct) / 100);
      this.host.fx.burst('heal', player.position.x, 1.2, player.position.z, { count: 18, color: 0xe8e8ff });
    }
  }

  /** A hit passed through the dodge: the glass breaks. */
  private onEvade(): void {
    const p = this.fx;
    const player = this.host.player();
    if (p.shardPct <= 0 || !player.alive) return;
    const ctx = this.host.context();
    this.area(player.position, 3, p.shardPct / 100, 'physical', 'Glass Shards', ctx, [{ id: 'bleeding', duration: 3, magnitude: 1, stacks: 1 }]);
    this.host.fx.burst('frost', player.position.x, 1.0, player.position.z, { count: 16, color: 0xd8f0ff });
  }

  /** The set signatures that tick: stillness, graves, the lit ring, wax. */
  private tickSets(dt: number): void {
    const p = this.fx;
    const player = this.host.player();
    if (this.unseen > 0) this.unseen -= dt;
    if (this.crown > 0) this.crown -= dt;

    if (p.stillPiercePct > 0) {
      const at = (this.stillAt ??= player.position.clone());
      if (at.distanceToSquared(player.position) > 0.01) {
        at.copy(player.position);
        this.still = 0;
      } else this.still += dt;
    }

    if (this.graves.length) {
      const ctx = this.host.context();
      for (let i = this.graves.length - 1; i >= 0; i--) {
        const g = this.graves[i]!;
        if ((g.t -= dt) > 0) continue;
        this.graves.splice(i, 1);
        const at = new THREE.Vector3(g.x, 0, g.z);
        const n = this.area(at, 3, p.gravePct / 100, 'arcane', 'Grave', ctx);
        if (n > 0) player.heal(player.stats.life * 0.02 * n);
        this.host.effects.nova(g.x, g.z, 3, { element: 'arcane', color: 0xb0a0ff });
      }
    }

    if (p.ringPct > 0 && p.ringRadius > 0) {
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer = 1;
        const ctx = this.host.context();
        const hit = this.area(player.position, p.ringRadius, p.ringPct / 100, 'fire', 'Lit Ring', ctx, [
          { id: 'slowed', duration: 1.2, magnitude: 1, stacks: 1 },
          { id: 'burning', duration: 2, magnitude: 1, stacks: 1 },
        ]);
        if (hit > 0) this.host.fx.burst('embers', player.position.x, 0.3, player.position.z, { count: 10, scale: 1.4, color: 0xffd080 });
      }
    }

    const form = (player.shape?.form as string | null | undefined) ?? null;
    if (p.waxPct > 0 && form !== this.lastForm && this.waxes.length < 4) {
      const ctx = this.host.context();
      const at = player.position.clone();
      this.waxes.push({ x: at.x, z: at.z, t: 3 });
      for (const e of this.allTargets()) {
        if (e.isBoss || e.root.position.distanceTo(at) > 4) continue;
        e.applyStatuses([{ id: 'rooted', duration: 2, magnitude: 1, stacks: 1 }], ctx);
      }
      this.host.fx.burst('heal', at.x, 1.0, at.z, { count: 12, color: 0xf0e0c0 });
    }
    this.lastForm = form;
    if (this.waxes.length) {
      const ctx = this.host.context();
      for (let i = this.waxes.length - 1; i >= 0; i--) {
        const w = this.waxes[i]!;
        if ((w.t -= dt) > 0) continue;
        this.waxes.splice(i, 1);
        const at = new THREE.Vector3(w.x, 0, w.z);
        this.area(at, 4, p.waxPct / 100, 'fire', 'Wax Double', ctx, [{ id: 'burning', duration: 3, magnitude: 1, stacks: 1 }]);
        this.host.effects.explosion(w.x, 0.8, w.z, { radius: 4, element: 'fire' });
      }
    }
  }

  update(dt: number): void {
    const p = this.fx;
    const player = this.host.player();
    if (this.igniteCd > 0) this.igniteCd -= dt;
    if (this.panicCd > 0) this.panicCd -= dt;
    if (this.manaProcCd > 0) this.manaProcCd -= dt;

    // Scheduled second hits: returns and echoes.
    if (this.queue.length) {
      const ctx = this.host.context();
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i]!;
        q.t -= dt;
        if (q.t > 0) continue;
        this.queue.splice(i, 1);
        if (q.target.life <= 0 || !q.target.alive) continue;
        q.target.takeDamage(q.packet, ctx);
        this.host.effects.impact(q.packet.type, q.target.root.position.x, 1.0, q.target.root.position.z, {
          scale: 0.5, shake: 0, decal: false,
        });
      }
    }
    if (!player.alive) return;

    // Overflowing Ward fills over three seconds at full life.
    if (p.wardPct > 0) {
      const cap = (player.stats.life * p.wardPct) / 100;
      if (player.life >= player.stats.life * 0.999) this.ward = Math.min(cap, this.ward + (cap * dt) / 3);
      else this.ward = Math.min(cap, this.ward);
    }

    this.tickSets(dt);

    if (p.emberPrintPct > 0) this.tickPrints(dt);
    else if (this.prints.length) this.prints.length = 0;

    if (p.rotAuraPct > 0 && p.rotAuraRadius > 0) {
      this.rotTimer -= dt;
      if (this.rotTimer <= 0) {
        this.rotTimer = 1;
        const ctx = this.host.context();
        const hit = this.area(player.position, p.rotAuraRadius, p.rotAuraPct / 100, 'poison', 'Rot Cyclone', ctx, [
          { id: 'poisoned', duration: 3, magnitude: 1, stacks: 1 },
        ]);
        if (hit > 0) this.host.fx.burst('poison', player.position.x, 0.8, player.position.z, { count: 16, scale: 1.4 });
      }
    }

    if (p.sentryPct > 0) {
      this.sentryTimer -= dt;
      if (this.sentryTimer <= 0) {
        this.sentryTimer = p.sentryInterval || 2.5;
        const ctx = this.host.context();
        const struck = new Set<Enemy>();
        for (let i = 0; i < 2; i++) {
          let best: Enemy | null = null;
          let bestD = 9;
          for (const e of this.allTargets()) {
            if (e.life <= 0 || struck.has(e)) continue;
            const d = e.root.position.distanceTo(player.position);
            if (d < bestD) {
              bestD = d;
              best = e;
            }
          }
          if (!best) break;
          struck.add(best);
          const side = i === 0 ? 1 : -1;
          const from = player.position.clone().add(new THREE.Vector3(side * 1.1, 1.6, 0));
          this.host.effects.projectile(from, best.root.position.clone().setY(1.0), { element: 'physical', color: 0xb8c0c8, speed: 26 });
          best.takeDamage(
            rollDamage(player.stats, ctx.rng, { scale: p.sentryPct / 100, type: 'physical', ability: 'Sentry', source: 'player' }),
            ctx,
          );
        }
      }
    }
  }

  /**
   * Warm Prints. Every stride leaves a burning footprint, left and right in
   * turn, and whatever follows you through them pays for it. Monsters chase
   * you, so they walk your trail.
   */
  private tickPrints(dt: number): void {
    const player = this.host.player();
    const pos = player.position;
    const last = (this.lastPrint ??= pos.clone());
    const dx = pos.x - last.x;
    const dz = pos.z - last.z;
    const moved = Math.hypot(dx, dz);
    if (moved > 4) {
      // A blink or a portal, not a step.
      last.copy(pos);
    } else if (moved >= PRINT_STRIDE) {
      this.printSide = -this.printSide;
      const side = 0.15 * this.printSide;
      const x = pos.x - (dz / moved) * side;
      const z = pos.z + (dx / moved) * side;
      this.prints.push({ x, z, left: PRINT_LIFE });
      if (this.prints.length > 18) this.prints.shift();
      this.host.decals.add('burn', x, z, 0.32, Math.atan2(dx, dz), PRINT_LIFE);
      this.host.fx.burst('embers', x, 0.1, z, { count: 3, scale: 0.6 });
      last.copy(pos);
    }

    for (let i = this.prints.length - 1; i >= 0; i--) {
      if ((this.prints[i]!.left -= dt) <= 0) this.prints.splice(i, 1);
    }

    this.printTimer -= dt;
    if (this.printTimer > 0 || !this.prints.length) return;
    this.printTimer = 0.5;
    const ctx = this.host.context();
    for (const e of this.allTargets()) {
      const ex = e.root.position.x;
      const ez = e.root.position.z;
      const reach = (PRINT_REACH + e.hitRadius) ** 2;
      if (!this.prints.some((q) => (q.x - ex) ** 2 + (q.z - ez) ** 2 <= reach)) continue;
      const packet = rollDamage(player.stats, ctx.rng, {
        scale: this.fx.emberPrintPct / 100, type: 'fire', ability: 'Warm Prints', source: 'player',
      });
      packet.applies = [{ id: 'burning', duration: 2, magnitude: 1, stacks: 1 }];
      e.takeDamage(packet, ctx);
    }
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private allTargets(): Enemy[] {
    const list = this.host.enemies().filter((e) => e.life > 0);
    const b = this.host.boss();
    if (b && b.life > 0) list.push(b);
    return list;
  }

  private nearestTo(at: THREE.Vector3, range: number, except: Enemy): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range;
    for (const e of this.allTargets()) {
      if (e === except) continue;
      const d = e.root.position.distanceTo(at);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Weapon-scaled damage to everything in a circle. Returns how many it hit. */
  private area(
    at: THREE.Vector3,
    radius: number,
    scale: number,
    type: DamageType,
    ability: string,
    ctx: CombatContext,
    applies?: StatusApplication[],
  ): number {
    const player = this.host.player();
    let n = 0;
    for (const e of this.allTargets()) {
      if (e.root.position.distanceTo(at) > radius + e.hitRadius) continue;
      const packet = rollDamage(player.stats, ctx.rng, { scale, type, ability, source: 'player' });
      if (applies) packet.applies = applies;
      e.takeDamage(packet, ctx);
      n++;
    }
    return n;
  }

  dispose(): void {
    powerHooks.outgoing = null;
    powerHooks.afterHit = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.queue = [];
    this.lastType.clear();
    this.wished.clear();
    this.prints = [];
    this.graves = [];
    this.waxes = [];
  }
}
