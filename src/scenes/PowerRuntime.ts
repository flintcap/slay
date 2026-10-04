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
  dropBonus: (at: THREE.Vector3, ilvl: number) => void;
}

/** Hits the runtime throws itself. They never trigger further procs. */
const PROC_ABILITIES = new Set(['Cleave', 'Pierce', 'Return', 'Echo', 'Sentry', 'Rot Cyclone', 'Pyre', 'Shatter']);

interface Scheduled {
  t: number;
  target: Enemy;
  packet: DamagePacket;
}

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

  constructor(host: PowerHost) {
    this.host = host;
    this.refresh();
    powerHooks.outgoing = (t, p, ctx) => this.outgoing(t as Enemy, p, ctx as CombatContext);
    powerHooks.afterHit = (t, p, taken, ctx) => this.afterHit(t as Enemy, p, taken, ctx as CombatContext);
    this.offs.push(
      events.on('item:equipped', () => this.refresh()),
      events.on('item:unequipped', () => this.refresh()),
      events.on('loot:gold', () => this.onGold()),
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
    if (target.family === 'undead') more += p.vsUndeadPct;
    else more -= p.vsLivingPenaltyPct;
    if (target.family === 'demon') more += p.vsDemonPct;
    if (target.family === 'beast') more += p.vsBeastPct;
    if (p.vsStaggeredPct > 0 && target.hasStatus('stunned')) more += p.vsStaggeredPct;

    let mul = 1 + more / 100;
    let tap = 0;
    if (p.lifeTapChance > 0 && !PROC_ABILITIES.has(packet.ability ?? '') && ctx.rng.chance(Math.min(1, p.lifeTapChance / 100))) {
      mul *= 1 + p.lifeTapPct / 100;
      tap = p.lifeTapPct / (100 + p.lifeTapPct);
    }
    const knock = p.knockback > 0 ? Math.max(packet.knockback ?? 0, p.knockback) : packet.knockback;
    if (type === packet.type && mul === 1 && knock === packet.knockback && tap === 0) return packet;
    const out: DamagePacket = { ...packet, type, amount: Math.max(0, packet.amount * mul) };
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
      if (st.lifeSteal > 0) player.heal(Math.min(st.life / 6, (taken * st.lifeSteal) / 100));
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
      this.host.dropBonus(at, enemy.ilvl);
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
  }
}
