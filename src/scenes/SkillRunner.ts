import * as THREE from 'three';
import type { DamagePacket, DamageType, StatusApplication } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { SKILLS } from '../data/skills';
import { rollDamage } from '../sim/Combat';
import { skillRank } from '../sim/Character';
import type { Player } from '../entities/Player';
import type { Enemy, CombatContext } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import { EffectSystem, ELEMENTS } from '../fx/Effects';
import type { EffectHandle } from '../fx/Effects';
import { getStatus, synthesizeSkillBuff } from '../data/statuses';
import { getBase } from '../sim/Loot';
import type { ItemCategory } from '../types';
import { buildMonsterModel, monsterArchetype, RigAnimator, type RigAction } from '../entities/MonsterModels';
import { MONSTERS } from '../data/monsters';
import { Random } from '../core/RNG';

/**
 * What a summon actually looks like.
 *
 * Summons used to be a glowing ring on the floor that fired bolts. For a skill
 * called Raise Skeleton that reads, correctly, as the skill not working: you
 * press it and no skeleton appears. Each summoning skill now names a real
 * monster from the bestiary, and the minion is built from that monster's own
 * model and rig — a skeleton that walks, swings and rots away when its time is
 * up. Totems keep no body on purpose; a totem is an object, not a creature.
 */
const MINION_MONSTER: Record<string, string> = {
  raiseSkeleton: 'skeleton_rattler',
  skeletalMage: 'skeleton_archer',
  grandOssuary: 'skeleton_warden',
  claySentinel: 'animated_armor',
  swornBrother: 'bandit_cutthroat',
  shadowClone: 'bandit_cutthroat',
  livingFlame: 'ember_wisp',
};

/** How far a minion will chase before it comes back to you. */
const MINION_LEASH = 16;
const MINION_SPEED = 3.4;

/** How the equipped main hand wants to be fought with. */
export type WeaponStyle = 'melee' | 'ranged' | 'caster' | 'unarmed';

const MELEE_CATEGORIES: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const RANGED_CATEGORIES: ItemCategory[] = ['bow', 'crossbow'];
const CASTER_CATEGORIES: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];

/** Resolves the style of whatever is in the character's main hand. */
/** How hard the off-hand hits relative to the main hand. */
const OFFHAND_SCALE = 0.62;

/**
 * True when both hands hold a melee weapon.
 *
 * Not simply "has an off-hand": a shield, an orb or a quiver in that slot is
 * not something you hit with.
 */
export function isDualWielding(player: Player): boolean {
  const eq = player.character.equipment;
  if (!eq.mainHand || !eq.offHand) return false;
  try {
    const main = getBase(eq.mainHand.baseId)?.category;
    const off = getBase(eq.offHand.baseId)?.category;
    return !!main && !!off && MELEE_CATEGORIES.includes(main) && MELEE_CATEGORIES.includes(off);
  } catch {
    return false;
  }
}

/**
 * The animation a skill should play.
 *
 * Keyed on the effect id first — a `nova` stomps, a `beam` is channelled, a
 * `shout` is roared — then narrowed by what is in your hands, because the same
 * skill is a draw with a bow and a throw without one. This is the whole reason
 * skills stopped looking alike: the delivery families already differed, but
 * every one of them played the same two clips.
 */
/**
 * A skill's own particle signature.
 *
 * Emitters were picked from the damage type alone, so every fire skill threw
 * identical sparks and a whole tree looked like one spell cast at different
 * ranges. Each skill now draws an emitter and a trail from its element's own
 * pool, plus its own density and size, all keyed off its id — so two fire
 * skills are still both obviously fire while never looking the same.
 *
 * Pools stay inside the element's family on purpose. Variety that crosses into
 * the wrong element stops teaching the player what is about to hurt them.
 */
const PARTICLE_POOLS: Record<string, { burst: string[]; trail: string[] }> = {
  physical: {
    burst: ['hit.physical', 'sparks', 'dust', 'gib', 'impact'],
    trail: ['sparks', 'dust', 'smoke'],
  },
  fire: {
    burst: ['hit.fire', 'fire', 'embers', 'explosion', 'ash'],
    trail: ['fire', 'embers', 'smoke'],
  },
  cold: {
    burst: ['hit.cold', 'frost', 'steam', 'shieldHit'],
    trail: ['frost', 'steam'],
  },
  lightning: {
    burst: ['hit.lightning', 'shock', 'sparks', 'explosion'],
    trail: ['shock', 'sparks'],
  },
  poison: {
    burst: ['hit.poison', 'poison', 'dissolve', 'steam'],
    trail: ['poison', 'dissolve'],
  },
  arcane: {
    burst: ['hit.arcane', 'arcane', 'teleport', 'portal', 'void'],
    trail: ['arcane', 'summon', 'void'],
  },
};

export interface ParticleSig {
  emitter: string;
  trail: string;
  density: number;
  size: number;
}

export function particleFor(skillId: string, type: DamageType): ParticleSig {
  const pool = PARTICLE_POOLS[type] ?? PARTICLE_POOLS.physical!;
  const h = hashId(skillId);
  return {
    emitter: pool.burst[h % pool.burst.length]!,
    trail: pool.trail[(h >>> 4) % pool.trail.length]!,
    // Small, deliberate spread: enough to feel different, not enough to make
    // one skill read as twice the spell another is.
    density: 0.75 + ((h >>> 8) % 9) * 0.09,
    size: 0.82 + ((h >>> 12) % 8) * 0.055,
  };
}

/**
 * The authored status a skill inflicts.
 *
 * Both halves of this were already written and neither knew about the other:
 * `data/skills.ts` describes a curse that weakens, and `data/statuses.ts`
 * defines `weakened` with its modifiers and icon. Nothing joined them, so every
 * curse synthesized a nameless placeholder buff instead of applying the real
 * effect its own description promises.
 *
 * A skill that names `statusId` in its params still wins over this table.
 */
/**
 * Self-buff skills joined to the player status they are meant to grant.
 *
 * `applyBuff` looked for a `statusId` in a skill's params, but the params type
 * only holds numbers, so no skill could ever name one. Every self-buff fell
 * through to a synthesized placeholder carrying the skill's name and no
 * modifiers at all — which is why Veil put an icon on the bar and changed
 * nothing. These statuses were all authored with real numbers already.
 */
const SELF_BUFF_STATUS: Record<string, string> = {
  veil: 'veiled',
  camouflage: 'veiled',
  vanish: 'veiled',
  shieldWall: 'stoneform',
  fortressStance: 'stoneform',
  guardStance: 'fortitude',
  aegis: 'shielded',
  flameWard: 'warded',
  voltaicShield: 'shielded',
  boneArmor: 'shielded',
  sunbrand: 'might',
  lucentForm: 'sanctified',
  ashenShroud: 'evasion',
  stormveil: 'evasion',
  overchargeSkill: 'overcharged',
  chargeUp: 'overcharged',
  thunderstorm: 'overcharged',
  bloodPact: 'siphoning',
  revenantForm: 'frenzy',
  consumeAshes: 'inspired',
};

const SKILL_STATUS: Record<string, string> = {
  // Curses and marks
  weaken: 'weakened',
  intimidate: 'weakened',
  amplifyDamage: 'vulnerable',
  terror: 'feared',
  doomBrand: 'doomed',
  massConfusion: 'confused',
  lowerResist: 'unmade',
  huntersMark: 'marked',
  soulCage: 'grasped',
  soulTether: 'lifelink',
  boneCage: 'grasped',
  tauntingRoar: 'weakened',

  // Maiming and shredding
  crippling: 'crippled',
  crippleTendon: 'crippled',
  maim: 'crippled',
  polarize: 'brittle',
  sunder: 'brittle',
  rend: 'rent',
  gash: 'hemorrhage',
  bleedingArrow: 'hemorrhage',
  suppressing: 'exhausted',

  // Blinding smoke and darkness
  nightfall: 'blinded',
  eclipse: 'blinded',
  smokeBomb: 'blinded',
  scattershot: 'blinded',

  // Elemental afflictions named outright by the skill
  ignite: 'immolated',
  noxiousCloud: 'envenomed',
  envenomBurst: 'envenomed',

  // Traps and impacts
  snareTrap: 'rooted',
  thornBarrier: 'slowed',
  spikeTrap: 'bleeding',
  shieldBash: 'stunned',
  warStomp: 'knockedDown',
  earthshatter: 'knockedDown',
};

/** Stable small integer from a skill id. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Rotates a colour a little way around the wheel, keeping it in its own family.
 * A +/-8% shift is enough to tell two skills apart and small enough that fire
 * never turns green.
 */
function shiftHue(hex: number, seed: number): number {
  const shift = (((seed >>> 6) % 17) - 8) / 100;
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h / 6 + shift + 1) % 1;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const pp = 2 * l - q;
  const ch = (tv: number): number => {
    const tt = (tv + 1) % 1;
    if (tt < 1 / 6) return pp + (q - pp) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return pp + (q - pp) * (2 / 3 - tt) * 6;
    return pp;
  };
  const to = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3));
}

/**
 * The animation a skill plays.
 *
 * `skillId` is what splits skills that share an effect family. Five warden
 * strike skills all have the effect `melee.strike`, so hashing the effect gave
 * all five the same gesture — which is the thing this was meant to stop. The
 * id is the only part that differs, so the id is what decides.
 */
export function clipFor(effect: string | undefined, holding: WeaponStyle, skillId = ''): string {
  const raw = (effect ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');
  const f = family ?? 'melee';
  const s2 = sub ?? '';

  // Sub-effects that override their family outright.
  //
  // `strike` used to send every one of them to `thrust`, so a warden with five
  // strike skills jabbed identically five times. Alternate the two stabs by the
  // skill's own name so each keeps a fixed, distinct gesture.
  const pick = hashId(skillId || raw);
  if (s2 === 'strike') return pick % 2 === 0 ? 'thrust' : 'lunge';
  if (s2 === 'lunge') return 'lunge';
  if (s2 === 'slam' || s2 === 'smash') return 'slam';
  if (s2 === 'stream' || s2 === 'channel') return 'channel';
  // Anything thrown at the floor is thrown, not conjured.
  if (s2 === 'cloud' || s2 === 'explode' || s2 === 'vial' || s2 === 'bomb') return 'hurl';
  // Vanishing is not a two-handed conjuring gesture.
  if (f === 'teleport' || s2 === 'stealth' || s2 === 'reset' || s2 === 'blink') return 'blink';

  switch (f) {
    case 'melee':
      return 'attack1';
    case 'cleave':
    case 'whirlwind':
      return 'attack2';
    case 'slam':
      return 'slam';
    case 'meteor':
      // An archer calling arrows down draws and looses upward. Everyone else
      // brings something heavy down from overhead.
      return holding === 'ranged' ? 'skyshot' : 'slam';
    case 'wave':
      // A line of broken ground comes from striking it, not from a hand wave.
      return 'slam';
    case 'nova':
      // Traps and wards are set down by hand. Only a caster or a bruiser makes
      // a ring by stamping on the floor.
      return holding === 'ranged' ? 'plant' : 'stomp';
    case 'trap':
    case 'ward':
      return 'plant';
    case 'ground':
      return 'hurl';
    case 'beam':
      return 'channel';
    case 'cone':
      return holding === 'ranged' ? 'snapshot' : 'channel';
    case 'chain':
    case 'summon':
    case 'corpse':
    case 'curse':
      return 'point';
    case 'banner':
      // Planting a standard is planting something, not shouting.
      return 'plant';
    case 'shout':
      return 'roar';
    case 'dash':
      return 'dodge';
    case 'projectile':
    case 'bolt':
      // Split the bow's eleven skills across a full draw and a snap shot, by
      // the skill's own id so each one always plays the same one.
      if (holding === 'ranged') return pick % 2 === 0 ? 'shoot' : 'snapshot';
      return f === 'projectile' ? 'hurl' : 'point';
    case 'detonate':
      return 'point';
    case 'aoe':
      return holding === 'ranged' ? 'plant' : 'stomp';
    case 'aura':
    case 'stance':
    case 'buff':
    case 'self':
    case 'absorb':
    case 'heal':
      return 'cast';
    default:
      return holding === 'ranged' ? 'snapshot' : 'cast';
  }
}

export function weaponStyle(player: Player): WeaponStyle {
  const item = player.character.equipment.mainHand;
  if (!item) return 'unarmed';
  try {
    const cat = getBase(item.baseId)?.category;
    if (!cat) return 'unarmed';
    if (RANGED_CATEGORIES.includes(cat)) return 'ranged';
    if (CASTER_CATEGORIES.includes(cat)) return 'caster';
    if (MELEE_CATEGORIES.includes(cat)) return 'melee';
  } catch {
    /* fall through */
  }
  return 'unarmed';
}

/** Effect families that swing a weapon and therefore need one in hand. */
const MELEE_EFFECTS = new Set([
  // A dash or a leap is footwork, not a swing: gating them on a melee weapon
  // meant an archer could not roll out of a pack. The variants that do end in a
  // hit are caught by their `.strike` suffix, which is in this set already.
  'melee', 'cleave', 'whirlwind', 'strike', 'heavy', 'multislash',
]);

/**
 * True when a skill physically swings the main hand. Spells are deliberately
 * exempt: a caster with a bow can still cast, the same way Diablo II allowed.
 */
export function needsMeleeWeapon(effect: string | undefined, damageType: string | undefined): boolean {
  const raw = (effect ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');
  const hit = MELEE_EFFECTS.has(family ?? '') || MELEE_EFFECTS.has(sub ?? '');
  // Only physical swings are gated; an elemental "cleave" is a spell shaped
  // like a swing and should not demand a sword.
  return hit && (damageType ?? 'physical') === 'physical';
}

/** Anything the player can hit. Enemy and Boss both satisfy this. */
type Target = Enemy | Boss;

/**
 * Executes player skills: cost and cooldown checks, hit resolution, and the
 * visual/audio payload. Enemy abilities live in entities/Abilities.ts — this is
 * the player half only.
 *
 * Travel and timing for projectiles belong to EffectSystem; this class supplies
 * the damage callback it fires on impact.
 */
export class SkillRunner {
  private effects: EffectSystem;
  private tmp = new THREE.Vector3();
  /** Pending off-hand blow from a dual-wield basic attack. */
  private swingParity = 0;
  private offHandTimer = 0;
  private offHandSwing: {
    dir: THREE.Vector3;
    ctx: CombatContext;
    enemies: Enemy[];
    boss: Boss | null;
  } | null = null;
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();

  constructor(effects: EffectSystem) {
    this.effects = effects;
  }

  /** Attempt to cast. Returns false if on cooldown, unaffordable, or busy. */
  cast(
    skillId: string,
    player: Player,
    target: THREE.Vector3,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): boolean {
    if (player.isBusy || !player.alive) return false;

    const def = SKILLS.find((s) => s.id === skillId);
    if (!def || def.targeting === 'passive') return false;

    const rank = skillRank(player.character, skillId);
    if (rank <= 0) return false;
    if (player.isOnCooldown(skillId)) return false;

    // A bow cannot swing. Blocking this here is what makes weapon choice a
    // real decision rather than a stat stick.
    if (needsMeleeWeapon(def.effect, def.damageType)) {
      const style = weaponStyle(player);
      if (style === 'ranged' || style === 'caster') {
        events.emit('toast', {
          text: `${def.name} needs a melee weapon.`,
          kind: 'bad',
        });
        audio.play('ui.error');
        return false;
      }
    }

    const cost = def.manaCost ? def.manaCost(rank) : 0;
    if (cost > 0 && !player.spendMana(cost)) {
      // Say so. A skill that silently refuses reads as a broken button, which
      // is exactly how being out of mana was being reported as a bug.
      events.emit('toast', { text: `Not enough mana for ${def.name}.`, kind: 'bad' });
      audio.play('ui.error');
      return false;
    }

    const cd = def.cooldown ? def.cooldown(rank) : 0;
    if (cd > 0) player.startCooldown(skillId, cd);

    player.faceTowards(target.x, target.z);

    const scale = def.damageScale ? def.damageScale(rank) : 1;
    const type: DamageType = def.damageType ?? 'physical';
    // Every skill of a damage type used the one element colour, so a whole
    // tree of fire skills was the same orange on screen. Shift it by a hash of
    // the skill's own id: still unmistakably fire, no longer indistinguishable
    // from the fire skill next to it.
    const color = shiftHue(ELEMENTS[type]?.core ?? 0xffe3b0, hashId(def.id));

    const makePacket = (mult = 1): DamagePacket => {
      const p = rollDamage(player.stats, ctx.rng, {
        scale: scale * mult,
        type,
        ability: def.name,
        source: 'player',
      });
      const r = rider();
      if (r.length) p.applies = r;
      return p;
    };

    const attackTime = 0.42 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
    const castTime = 0.5 / Math.max(0.4, 1 + player.stats.castSpeed / 100);

    const params = def.params ?? {};
    const num = (k: string, d: number): number => {
      const v = params[k];
      return typeof v === 'number' ? v : d;
    };

    // Whatever this skill inflicts rides on every packet it produces, so a
    // maiming strike maims whether the runner delivered it as a swing, a
    // projectile or a nova. Attaching it in the individual branches would mean
    // remembering to, in twenty places, forever. Computed once, lazily, because
    // `num` has to exist first.
    let riderCache: StatusApplication[] | null = null;
    const rider = (): StatusApplication[] =>
      (riderCache ??= this.statusFor(def, num, color, true));

    const origin = player.position.clone().setY(1.05);
    const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();

    // Skill effects are dotted families ('buff.self', 'aura.damage'); switch on
    // the family so every variant lands on the right handler.
    const family = (def.effect ?? 'melee').split('.')[0] ?? 'melee';
    // What the body does when a skill fires depends on what is in your hands,
    // not only on the skill: the same volley is a draw with a bow and a throw
    // without one.
    const holding = weaponStyle(player);
    const rangedClip: 'shoot' | 'cast' = holding === 'ranged' ? 'shoot' : 'cast';
    // What the body does for this specific skill. Everything used to collapse
    // onto `cast` or `attack1`, so a ground slam, a war cry, a channelled beam
    // and a thrown bolt were all the same gesture.
    const clip = clipFor(def.effect, holding, def.id);
    const sig = particleFor(def.id, type);

    switch (family) {
      case 'melee':
      case 'cleave': {
        player.beginAction(clip, attackTime);
        const wide = (def.effect ?? '').includes('cleave') || (def.effect ?? '').includes('multiSlash');
        this.meleeSwing(player, dir, num('arc', wide ? 2.2 : 1.3), num('reach', 2.3), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'whirlwind': {
        player.beginAction('attack2', attackTime * 1.4);
        this.meleeSwing(player, dir, Math.PI * 2, num('reach', 2.8), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'projectile':
      case 'bolt': {
        player.beginAction(clip, castTime);
        const range = num('range', 18);
        const count = Math.max(1, Math.floor(num('count', 1)));
        const spread = num('spread', 0.16);
        const pierce = Math.floor(num('pierce', 0));
        const splash = num('splash', 0);

        for (let i = 0; i < count; i++) {
          const a = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
          const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
          const from = origin.clone();
          // A piercing shot does not stop at the first body — it flies until a
          // wall stops it. Using the first-hit distance meant `pierce` changed
          // nothing: the arrow ended at the same monster, and the line damage
          // it applied covered only the stretch up to that monster. Pierce Shot
          // and every skill built on it pierced exactly one target.
          //
          // Anything else stops at the first thing it would actually hit, so
          // the visual lands on the target instead of sailing through it.
          const stop =
            pierce > 0
              ? this.wallStop(from, d, range, ctx, num('radius', 0.42))
              : this.firstHitAlong(from, d, range, enemies, boss, num('radius', 0.42), ctx);
          const to = from.clone().addScaledVector(d, stop);

          this.effects.projectile(from, to, {
            element: type,
            color,
            trail: sig.trail,
            speed: num('speed', 17),
            size: num('radius', 0.42) * sig.size,
            onHit: (p) => {
              if (pierce > 0) {
                // Piercing shots damage everything along the flight path.
                this.lineDamage(from, d, stop, num('radius', 0.42) * 2, makePacket, ctx, enemies, boss);
              } else if (splash > 0) {
                this.areaDamage(p, splash, makePacket, ctx, enemies, boss);
              } else {
                this.pointDamage(p, num('radius', 0.42), makePacket, ctx, enemies, boss);
              }
            },
          });
        }
        audio.play(`cast.${type}`);
        break;
      }

      case 'nova': {
        player.beginAction(clip, castTime);
        const radius = num('radius', 5.2);
        this.effects.nova(player.position.x, player.position.z, radius, {
          element: type,
          color,
          emitter: sig.emitter,
          density: sig.density,
        });
        this.areaDamage(player.position, radius, makePacket, ctx, enemies, boss);
        audio.play(`nova.${type}`);
        break;
      }

      case 'slam': {
        player.beginAction('attack2', attackTime * 1.5);
        const radius = num('radius', 4.0);
        const at = target.clone().setY(0);
        // The wind-up is what gives a slam weight; damage lands on the beat.
        this.effects.slam(at.x, at.z, radius, {
          element: type,
          color,
          emitter: sig.emitter,
          density: sig.density,
          windup: num('windup', 0.25),
          onFire: () => this.areaDamage(at, radius, () => makePacket(1.25), ctx, enemies, boss),
        });
        audio.play('slam');
        break;
      }

      case 'meteor': {
        player.beginAction(clip, castTime);
        const radius = num('radius', 3.4);
        const at = target.clone().setY(0);
        this.effects.meteor(at.x, at.z, {
          radius,
          element: type,
          color,
          emitter: sig.emitter,
          density: sig.density,
          onHit: (p) => this.areaDamage(p, radius, () => makePacket(1.4), ctx, enemies, boss),
        });
        break;
      }

      case 'beam': {
        player.beginAction(clip, castTime);
        const length = num('length', 12);
        const to = origin.clone().addScaledVector(dir, length);
        this.effects.beam(origin, to, {
          element: type,
          color,
          width: num('width', 1.1) * sig.size,
          endBurst: true,
          emitter: sig.emitter,
        });
        this.lineDamage(player.position, dir, length, num('width', 1.1), makePacket, ctx, enemies, boss);
        audio.play(`beam.${type}`);
        break;
      }

      case 'cone': {
        player.beginAction(clip, castTime);
        const reach = num('reach', 6.5);
        const half = num('arc', 1.1) * 0.5;
        this.effects.cone(player.position.clone().setY(1.0), dir, half, reach, {
          element: type,
          color,
          emitter: sig.emitter,
          density: sig.density,
        });
        this.meleeSwing(player, dir, half * 2, reach, makePacket, ctx, enemies, boss, type, false);
        audio.play(`cone.${type}`);
        break;
      }

      case 'chain': {
        player.beginAction(clip, castTime);
        this.chainLightning(player, target, Math.floor(num('jumps', 4)), num('range', 7), makePacket, ctx, enemies, boss, type, color);
        audio.play('chain');
        break;
      }

      case 'dash': {
        player.dodge(dir.x, dir.z);
        this.meleeSwing(player, dir, Math.PI, num('reach', 2.4), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'heal': {
        player.beginAction(clip, castTime * 0.7);
        player.heal(num('amount', 30) * (1 + rank * 0.15));
        this.effects.impact('arcane', player.position.x, 1.0, player.position.z, {
          color: 0x7dffb0,
          decal: false,
          shake: 0,
          sfx: 'heal',
        });
        break;
      }

      case 'buff':
      case 'aura':
      case 'stance':
      case 'shout':
      case 'banner':
      case 'self':
      case 'absorb': {
        player.beginAction(clip, castTime * 0.7);
        this.applyBuff(player, def, rank, num, color);
        this.effects.impact(type, player.position.x, 1.0, player.position.z, {
          color,
          emitter: sig.emitter,
          density: sig.density,
          decal: false,
          shake: 0,
          sfx: 'buff',
        });
        break;
      }

      // -- persistent ground ------------------------------------------------
      // Fifteen skills across four classes describe leaving something burning,
      // choking or freezing on the floor. None of them left anything: the
      // family had no handler, so every one fired a plain bolt.
      case 'ground':
      case 'trap':
      case 'ward': {
        player.beginAction(clip, castTime);
        const radius = num('radius', 3.2);
        const duration = num('duration', 6);
        const at = target.clone().setY(0);
        this.addZone(
          at.x, at.z, radius, duration,
          num('tickRate', 0.5),
          // Ticking damage is a fraction of the hit it would be as a burst, or
          // standing in a field would out-damage every direct skill in the game.
          (m = 1) => makePacket(m * num('tickScale', 0.28)),
          type, color, sig.emitter,
          this.statusFor(def, num, color),
        );
        this.effects.nova(at.x, at.z, radius, { element: type, color, emitter: sig.emitter, density: sig.density });
        audio.play(`nova.${type}`);
        break;
      }

      // -- summons ----------------------------------------------------------
      // Nine skills summon. Nothing was ever summoned. A minion here is a
      // guardian that holds its ground and fights: a real presence with a real
      // lifetime, without a full pet AI it would have to path and follow.
      case 'summon':
      case 'minion': {
        player.beginAction('point', castTime);
        const count = Math.max(1, Math.floor(num('count', 1)));
        const life = num('duration', 20);
        const melee = (def.effect ?? '').includes('minion') || (def.effect ?? '').includes('sentinel');
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const spread = 1.2 + count * 0.25;
          this.addTurret(
            player.position.x + Math.cos(a) * spread,
            player.position.z + Math.sin(a) * spread,
            life,
            num('attackRate', melee ? 1.1 : 1.6),
            num('range', melee ? 2.6 : 11),
            (m = 1) => makePacket(m * num('minionScale', 0.5)),
            type, color, melee, def.id,
          );
        }
        audio.play('summon');
        break;
      }

      // -- curses and debuffs -----------------------------------------------
      // Nine skills between them, and all nine only dealt damage. A curse that
      // deals damage is not a curse.
      case 'curse':
      case 'debuff':
      case 'apply': {
        player.beginAction('point', castTime);
        const radius = num('radius', family === 'apply' ? 0.9 : 4.5);
        const at = target.clone().setY(0);
        const applies = this.statusFor(def, num, color);
        let touched = 0;
        for (const t of this.allTargets(enemies, boss)) {
          if (this.groundDistance(t.root.position, at) > radius + t.hitRadius) continue;
          t.applyStatuses(applies, ctx);
          this.effects.impact(type, t.root.position.x, 1.0, t.root.position.z, {
            color, emitter: sig.emitter, density: sig.density * 0.6, decal: false, shake: 0, sfx: null,
          });
          touched++;
        }
        this.effects.nova(at.x, at.z, radius, {
          element: type, color, emitter: sig.emitter, density: sig.density * 0.5, particles: touched > 0,
        });
        // A curse that names no status still has to do something, or ranking it
        // is a wasted point.
        if (applies.length === 0) this.areaDamage(at, radius, makePacket, ctx, enemies, boss);
        audio.play('curse');
        break;
      }

      // -- channelled tethers -------------------------------------------------
      case 'channel': {
        player.beginAction('channel', castTime * 1.6);
        const range = num('range', 12);
        const stop = this.firstHitAlong(origin, dir, range, enemies, boss, 0.5, ctx);
        const end = origin.clone().addScaledVector(dir, stop);
        this.effects.beam(origin, end, {
          element: type, color, width: num('width', 0.5),
          duration: num('duration', 0.5), endBurst: true,
          emitter: sig.emitter, density: sig.density,
        });
        this.lineDamage(origin, dir, stop, num('width', 0.9), makePacket, ctx, enemies, boss);
        audio.play(`beam.${type}`);
        break;
      }

      // -- strike from above --------------------------------------------------
      case 'sky': {
        player.beginAction(clip, castTime);
        const at = target.clone().setY(0);
        const radius = num('radius', 2.6);
        this.effects.meteor(at.x, at.z, {
          radius, color, element: type, emitter: sig.emitter, density: sig.density,
          onHit: (p) => this.areaDamage(p, radius, makePacket, ctx, enemies, boss),
        });
        audio.play(`cast.${type}`);
        break;
      }

      // -- a line of broken ground --------------------------------------------
      case 'wave': {
        player.beginAction('slam', attackTime);
        const range = num('range', 9);
        const width = num('width', 2.2);
        this.effects.cone(origin, dir, 0.22, range, {
          element: type, color, emitter: sig.emitter, density: sig.density,
        });
        this.lineDamage(player.position, dir, range, width, makePacket, ctx, enemies, boss);
        this.effects.slam(player.position.x, player.position.z, width * 0.8, {
          element: type, color, windup: 0, emitter: sig.emitter, density: sig.density,
        });
        audio.play('nova.physical');
        break;
      }

      // -- leaps and blinks ---------------------------------------------------
      case 'leap': {
        player.beginAction('dodge', 0.34);
        const range = num('range', 7);
        const stop = this.wallStop(player.position, dir, range, ctx, 0.5);
        const land = player.position.clone().addScaledVector(dir, stop);
        this.effects.teleportOut(player.position.x, 0.6, player.position.z, color);
        player.position.set(land.x, 0, land.z);
        this.effects.teleportIn(land.x, 0.6, land.z, color);
        const radius = num('radius', 2.8);
        this.effects.slam(land.x, land.z, radius, {
          element: type, color, windup: 0, emitter: sig.emitter, density: sig.density,
        });
        this.areaDamage(land, radius, makePacket, ctx, enemies, boss);
        audio.play('nova.physical');
        break;
      }

      case 'teleport': {
        player.beginAction('blink', 0.26);
        const range = num('range', 9);
        const stop = this.wallStop(player.position, dir, Math.min(range, dir.length() > 0 ? range : range), ctx, 0.5);
        const want = target.clone().setY(0);
        const reach = Math.min(stop, this.groundDistance(want, player.position));
        const land = player.position.clone().addScaledVector(dir, reach);
        this.effects.teleportOut(player.position.x, 0.9, player.position.z, color);
        player.position.set(land.x, 0, land.z);
        this.effects.teleportIn(land.x, 0.9, land.z, color);
        // A strike teleport arrives swinging.
        if ((def.effect ?? '').includes('strike') || (def.effect ?? '').includes('chain')) {
          this.meleeSwing(player, dir, 2.4, num('radius', 2.6), makePacket, ctx, enemies, boss, type, false);
        }
        audio.play('teleport');
        break;
      }

      // -- detonations and corpse work ----------------------------------------
      // These consume something already on the field: a stack of damage over
      // time, or a body. Both land as a burst centred on what they consume.
      case 'detonate':
      case 'corpse':
      case 'point':
      case 'aoe':
      case 'capstone': {
        player.beginAction(clip, castTime);
        const radius = num('radius', family === 'point' ? 1.2 : 4);
        const at = family === 'aoe' || family === 'capstone' ? player.position.clone().setY(0) : target.clone().setY(0);
        this.effects.explosion(at.x, 0.8, at.z, { radius, element: type, color });
        this.effects.nova(at.x, at.z, radius, {
          element: type, color, emitter: sig.emitter, density: sig.density,
        });
        this.areaDamage(at, radius, (m = 1) => makePacket(m * num('burstScale', 1)), ctx, enemies, boss);
        // A capstone is the top of a tree; it leaves the ground burning too.
        if (family === 'capstone') {
          this.addZone(
            at.x, at.z, radius, num('duration', 5), 0.5,
            (m = 1) => makePacket(m * 0.3), type, color, sig.emitter,
          );
        }
        this.applyBuff(player, def, rank, num, color);
        audio.play(`impact.${type}`);
        break;
      }

      default: {
        // An unknown effect id falls back to a delivery the character can
        // actually perform, rather than always to a swing: falling back to
        // melee put every bow user through a sword animation, hitting nothing,
        // on every cast of anything the runner did not recognise.
        if (holding === 'ranged' || holding === 'caster') {
          player.beginAction(clip, castTime);
          const from = player.position.clone().setY(holding === 'ranged' ? 1.28 : 1.05);
          const stop = this.firstHitAlong(from, dir, 18, enemies, boss, 0.4, ctx);
          this.effects.projectile(from, from.clone().addScaledVector(dir, stop), {
            element: type,
            color,
            trail: sig.trail,
            speed: holding === 'ranged' ? 30 : 20,
            size: holding === 'ranged' ? 0.24 : 0.36,
            onHit: (pt) => this.pointDamage(pt, 0.6, makePacket, ctx, enemies, boss),
          });
        } else {
          player.beginAction(clip, attackTime);
          this.meleeSwing(player, dir, 1.4, 2.3, makePacket, ctx, enemies, boss, type);
        }
        break;
      }
    }

    return true;
  }

  /**
   * The free basic attack. No rank, no mana, no cooldown — this is the floor
   * that guarantees left click always does something, whatever the player has
   * (or has not) bound.
   */
  basicAttack(
    player: Player,
    target: THREE.Vector3,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): boolean {
    if (player.isBusy || !player.alive) return false;

    player.faceTowards(target.x, target.z);
    const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();
    const style = weaponStyle(player);

    const packet = (mult = 1): DamagePacket =>
      rollDamage(player.stats, ctx.rng, {
        scale: mult,
        type: 'physical',
        ability: 'Attack',
        source: 'player',
      });

    // The weapon decides what a basic attack even is.
    if (style === 'ranged' || style === 'caster') {
      const castTime = 0.46 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
      // A bow is drawn and loosed; only a spell is cast. Sharing the casting
      // animation put archers through a two-handed overhead gesture with a bow
      // in their hands, which is the most wrong an archer can look.
      player.beginAction(style === 'ranged' ? 'shoot' : 'cast', castTime);

      const type: DamageType = style === 'ranged' ? 'physical' : 'arcane';
      const colour = style === 'ranged' ? 0xd8c9a0 : (ELEMENTS.arcane?.core ?? 0xff7de8);
      // Arrows leave the bow hand, spells leave the chest. A projectile that
      // starts at the sternum reads as coming out of the character's ribs.
      const from = player.position.clone().setY(style === 'ranged' ? 1.28 : 1.05);
      if (style === 'ranged') {
        // Offset to the bow side so the shot lines up with the weapon.
        from.addScaledVector(this.tmp.set(dir.z, 0, -dir.x), 0.16);
      }
      const range = style === 'ranged' ? 20 : 16;
      const stop = this.firstHitAlong(from, dir, range, enemies, boss, 0.4, ctx);
      const to = from.clone().addScaledVector(dir, stop);

      this.effects.projectile(from, to, {
        element: type,
        color: colour,
        speed: style === 'ranged' ? 30 : 19,
        size: style === 'ranged' ? 0.24 : 0.4,
        onHit: (p) => this.pointDamage(p, 0.5, packet, ctx, enemies, boss),
      });
      audio.play(style === 'ranged' ? 'cast.physical' : 'cast.arcane');
      return true;
    }

    const attackTime = 0.42 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
    // Basic melee alternates its two swings, so holding the button reads as a
    // combo rather than one animation stuttering.
    this.swingParity = (this.swingParity + 1) % 2;
    player.beginAction(this.swingParity === 0 ? 'attack1' : 'attack2', attackTime);
    this.meleeSwing(player, dir, 1.5, 2.4, packet, ctx, enemies, boss, 'physical');

    // Dual wield: the off-hand weapon follows the main one.
    //
    // Fighting with two blades only ever swung one of them, which made the
    // second weapon pure stat padding. The off-hand lands slightly later and
    // for less, the way it does everywhere else in the genre, so two one-handed
    // weapons beat one but do not simply double your damage.
    if (isDualWielding(player)) {
      this.offHandTimer = attackTime * 0.45;
      this.offHandSwing = { dir: dir.clone(), ctx, enemies, boss };
    }
    return true;
  }

  /** Fires the delayed off-hand blow queued by a dual-wield basic attack. */
  tickOffHand(dt: number, player: Player): void {
    if (!this.offHandSwing) return;
    this.offHandTimer -= dt;
    if (this.offHandTimer > 0) return;
    const queued = this.offHandSwing;
    this.offHandSwing = null;
    if (!player.alive) return;
    const packet = (mult = 1): DamagePacket =>
      rollDamage(player.stats, queued.ctx.rng, {
        // Off-hand hits for a share of the main hand, which is what stops a
        // second weapon from being a flat damage doubler.
        scale: mult * OFFHAND_SCALE,
        type: 'physical',
        ability: 'Attack',
        source: 'player',
      });
    this.meleeSwing(player, queued.dir, 1.4, 2.3, packet, queued.ctx, queued.enemies, queued.boss, 'physical');
  }

  /**
   * True when something is close enough for a basic swing to connect. Called
   * every frame the attack button is held, so it walks the arrays directly and
   * compares squared distances rather than building a target list.
   */
  hasTargetInReach(player: Player, enemies: Enemy[], boss: Boss | null, reach = 2.4): boolean {
    // Bows and staves reach across the room; they always have a shot.
    const style = weaponStyle(player);
    if (style === 'ranged' || style === 'caster') return true;
    const px = player.position.x;
    const pz = player.position.z;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (e.life <= 0) continue;
      const r = reach + e.hitRadius;
      const dx = e.root.position.x - px;
      const dz = e.root.position.z - pz;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    if (boss && boss.life > 0) {
      const r = reach + boss.hitRadius;
      const dx = boss.root.position.x - px;
      const dz = boss.root.position.z - pz;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  /**
   * Applies a skill's buff so it shows on the HUD with a running timer.
   * Most buff skills declare their duration in `params.duration`; anything
   * without one gets a sensible default rather than no feedback at all.
   */
  /**
   * The debuff a curse, field or trap lays on whatever it catches.
   *
   * Prefers a status the skill names outright. Failing that it synthesizes one
   * under the skill's own id so the effect is real and the tooltip reads — a
   * curse with no registered status used to be a curse that did nothing at all.
   */
  private statusFor(
    def: { id: string; name: string; params?: Record<string, number | number[] | string> },
    num: (k: string, d: number) => number,
    color: number,
    /**
     * True when this is the rider attached to every packet the skill throws.
     * A rider only fires when the skill genuinely names an effect: synthesizing
     * a placeholder for all 163 skills would put a meaningless icon on every
     * monster in the game.
     */
    riderOnly = false,
  ): StatusApplication[] {
    const duration = num('duration', 8);
    const magnitude = num('amp', num('magnitude', num('slow', 1)));
    const named = typeof def.params?.statusId === 'string' ? (def.params.statusId as string) : null;
    if (named && getStatus(named)) {
      return [{ id: named, duration, magnitude, stacks: 1 }];
    }
    // The authored effect this skill is describing, if the two tables can be
    // joined. This is what makes a curse actually curse.
    const mapped = SKILL_STATUS[def.id];
    if (mapped && getStatus(mapped)) {
      return [{ id: mapped, duration, magnitude, stacks: 1 }];
    }
    if (riderOnly) return [];
    const id = `skill.${def.id}`;
    if (!getStatus(id)) synthesizeSkillBuff(def.id, def.name, color, 'sparkle', duration);
    return [{ id, duration, magnitude, stacks: 1 }];
  }

  private applyBuff(
    player: Player,
    def: { id: string; name: string; params?: Record<string, number | number[]> },
    rank: number,
    num: (k: string, d: number) => number,
    color: number
  ): void {
    const duration = num('duration', 10) + num('durationPerRank', 0) * (rank - 1);

    // Prefer the authored status this skill is meant to grant, so the buff
    // carries real modifiers instead of being a decorative icon. Only skills
    // with nothing authored fall back to a synthesized placeholder named after
    // the skill, which at least reads correctly in the tooltip.
    const authored = SELF_BUFF_STATUS[def.id] ?? null;
    const id = authored && getStatus(authored) ? authored : `skill.${def.id}`;
    if (!getStatus(id)) {
      synthesizeSkillBuff(def.id, def.name, color, 'sparkle', duration);
    }
    player.applyStatus(id, Math.max(1, duration), 1, 1);
  }

  /** Distance along `dir` to the nearest target, or `max` if nothing is hit. */
  /**
   * How far a shot travels before something stops it.
   *
   * Walls count. Enemy projectiles have always tested line of sight, but the
   * player's never did, so every arrow, bolt and firebolt flew straight through
   * the level geometry and hit things in the next room.
   */
  private firstHitAlong(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    enemies: Enemy[],
    boss: Boss | null,
    radius: number,
    ctx?: CombatContext
  ): number {
    const wall = this.wallStop(from, dir, max, ctx, radius);
    let best = Infinity;
    const consider = (t: Target) => {
      if (t.life <= 0) return;
      const to = this.tmp2.copy(t.root.position).sub(from).setY(0);
      const along = to.dot(dir);
      if (along <= 0 || along > max || along >= best) return;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp > radius + t.hitRadius) return;
      // A monster is not rejected merely for sitting past the wall stop.
      //
      // `NavGrid.lineOfSight` is deliberately conservative about diagonal
      // steps, so a ray aimed at something backed against a wall clips the wall
      // tile up to a metre before reaching it. Requiring the monster's *centre*
      // to be in front of that point is exactly why shots at anything standing
      // against a wall stopped short and dealt nothing. What the shot meets is
      // the near edge of the body, plus half a metre of slack for the grid.
      // Anything in the next room is metres past the wall and still excluded.
      if (along - t.hitRadius - 0.5 > wall) return;
      best = along;
    };
    for (const e of enemies) consider(e);
    if (boss) consider(boss);
    return best === Infinity ? wall : best;
  }

  /**
   * Walks the ray in short steps and stops at the first blocked point. Stepping
   * rather than solving is deliberate: the nav grid already answers "can these
   * two points see each other" exactly, and props are boxes the grid does not
   * know about, so one loop covers both.
   */
  private wallStop(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    ctx: CombatContext | undefined,
    radius: number
  ): number {
    if (!ctx) return max;
    const STEP = 0.5;
    const bl = ctx.blockers;
    let travelled = 0;
    let px = from.x;
    let pz = from.z;
    while (travelled < max) {
      const step = Math.min(STEP, max - travelled);
      const nx = px + dir.x * step;
      const nz = pz + dir.z * step;
      if (ctx.nav && !ctx.nav.lineOfSight(px, pz, nx, nz)) return travelled;
      if (bl) {
        for (let i = 0; i < bl.length; i++) {
          const b = bl[i]!;
          if (
            Math.abs(nx - b.x) < b.w * 0.5 + radius * 0.5 &&
            Math.abs(nz - b.z) < b.d * 0.5 + radius * 0.5
          ) {
            return travelled;
          }
        }
      }
      px = nx;
      pz = nz;
      travelled += step;
    }
    return max;
  }

  private allTargets(enemies: Enemy[], boss: Boss | null): Target[] {
    const list: Target[] = [];
    for (const e of enemies) if (e.life > 0) list.push(e);
    if (boss && boss.life > 0) list.push(boss);
    return list;
  }

  private meleeSwing(
    player: Player,
    facing: THREE.Vector3,
    arc: number,
    reach: number,
    packet: (m?: number) => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    playVisual = true
  ): void {
    const origin = player.position;
    const half = arc * 0.5;
    let hits = 0;

    for (const t of this.allTargets(enemies, boss)) {
      const to = this.tmp2.copy(t.root.position).sub(origin).setY(0);
      const dist = to.length();
      if (dist > reach + t.hitRadius) continue;
      if (arc < Math.PI * 1.99) {
        to.normalize();
        if (facing.dot(to) < Math.cos(half)) continue;
      }
      t.takeDamage(packet(), ctx);
      this.effects.meleeHit(t.root.position.x, 1.0, t.root.position.z, { dir: facing, color: ELEMENTS[type]?.core });
      hits++;
    }

    if (playVisual && hits === 0) audio.play('swing.miss');
  }

  /**
   * Distance on the floor, ignoring height.
   *
   * Every hit test in this game is really a 2D one: monsters are pinned to the
   * ground and `root.position` is at their feet, while the points effects
   * happen at are at chest or head height. Measuring in 3D silently adds that
   * height difference to every range check — an arrow leaves the bow at 1.28m,
   * so a hit test with a half-metre radius could never succeed no matter how
   * squarely the shot landed. That is ranged attacks doing no damage.
   */
  private groundDistance(a: THREE.Vector3, b: THREE.Vector3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private pointDamage(
    at: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): void {
    let closest: Target | null = null;
    let bestD = Infinity;
    for (const t of this.allTargets(enemies, boss)) {
      const d = this.groundDistance(t.root.position, at) - t.hitRadius;
      if (d < bestD && d <= radius) {
        bestD = d;
        closest = t;
      }
    }
    closest?.takeDamage(packet(), ctx);
  }

  private areaDamage(
    center: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): void {
    for (const t of this.allTargets(enemies, boss)) {
      // On the floor, not through the air: a meteor lands from above, and its
      // blast should not shrink because the impact was measured from height.
      const d = this.groundDistance(t.root.position, center);
      if (d > radius + t.hitRadius) continue;
      // Falloff so the centre of a nova genuinely rewards positioning.
      const p = packet();
      p.amount *= 1 - Math.min(1, d / (radius + t.hitRadius)) * 0.35;
      t.takeDamage(p, ctx);
    }
  }

  private lineDamage(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    width: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): void {
    for (const t of this.allTargets(enemies, boss)) {
      const to = this.tmp2.copy(t.root.position).sub(origin).setY(0);
      const along = to.dot(dir);
      if (along < 0 || along > length) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp > width * 0.5 + t.hitRadius) continue;
      t.takeDamage(packet(), ctx);
    }
  }

  private chainLightning(
    player: Player,
    target: THREE.Vector3,
    jumps: number,
    range: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    color: number
  ): void {
    const pool = this.allTargets(enemies, boss);
    if (pool.length === 0) return;

    let from = player.position.clone().setY(1.1);
    const struck = new Set<Target>();

    for (let j = 0; j < jumps; j++) {
      let best: Target | null = null;
      let bestD = Infinity;
      const anchor = j === 0 ? target : from;
      for (const t of pool) {
        if (struck.has(t)) continue;
        // Anchors are at chest height; monsters are measured at their feet.
        const d = this.groundDistance(t.root.position, anchor);
        if (d < bestD && d <= range) {
          bestD = d;
          best = t;
        }
      }
      if (!best) break;
      struck.add(best);
      const to = best.root.position.clone().setY(1.0);
      this.effects.beam(from, to, { element: type, color, width: 0.35, duration: 0.16, endBurst: true });
      // Each jump loses punch, or chain skills trivialise every pack.
      const p = packet();
      p.amount *= Math.pow(0.82, j);
      best.takeDamage(p, ctx);
      from = to;
    }
  }

  // -- persistent effects ---------------------------------------------------

  /**
   * Ground zones and summons, ticked by the scene.
   *
   * Sixteen effect families had no handler at all and fell through to a plain
   * bolt, so a wall of flame left nothing on the floor and a raised skeleton
   * fought nothing. Both need something that outlives the cast, which is what
   * these two lists are: a patch of ground that hurts what stands in it, and a
   * thing that shoots on its own.
   */
  private zones: Array<{
    x: number;
    z: number;
    radius: number;
    left: number;
    tick: number;
    accum: number;
    packet: (m?: number) => DamagePacket;
    type: DamageType;
    color: number;
    emitter: string;
    /** Applied to anything caught in it, for slows, fear and the like. */
    applies?: StatusApplication[];
    fx: EffectHandle | null;
  }> = [];

  private turrets: Array<{
    x: number;
    z: number;
    left: number;
    cd: number;
    accum: number;
    range: number;
    packet: (m?: number) => DamagePacket;
    type: DamageType;
    color: number;
    /** Melee guardians swing instead of shooting. */
    melee: boolean;
    fx: EffectHandle | null;
    /** A summoned creature's body. Null for a totem, which is just a spot. */
    body: THREE.Object3D | null;
    anim: RigAnimator | null;
    facing: number;
    /** 0..1, drives the walk cycle. */
    gait: number;
    action: RigAction;
    actionT: number;
  }> = [];

  /** Wall clock for the tick, so rigs breathe and bob. */
  private runTime = 0;

  /** Context for the tick. Set every frame by the scene. */
  private tickCtx: {
    ctx: CombatContext;
    enemies: Enemy[];
    boss: Boss | null;
  } | null = null;

  /** Handed the live combat state so persistent effects can act on it. */
  setContext(ctx: CombatContext, enemies: Enemy[], boss: Boss | null): void {
    this.tickCtx = { ctx, enemies, boss };
  }

  update(dt: number): void {
    const live = this.tickCtx;
    if (!live) return;
    this.runTime += dt;
    const { ctx, enemies, boss } = live;

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!;
      z.left -= dt;
      z.accum += dt;
      if (z.accum >= z.tick) {
        z.accum = 0;
        const centre = this.tmp3.set(z.x, 0, z.z);
        this.areaDamage(centre, z.radius, z.packet, ctx, enemies, boss);
        if (z.applies?.length) {
          for (const t of this.allTargets(enemies, boss)) {
            if (this.groundDistance(t.root.position, centre) > z.radius + t.hitRadius) continue;
            t.applyStatuses(z.applies, ctx);
          }
        }
      }
      if (z.left <= 0) {
        z.fx?.stop();
        this.zones.splice(i, 1);
      }
    }

    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]!;
      t.left -= dt;
      t.accum += dt;

      // A summoned creature walks. Totems have no body and stay put.
      if (t.body) {
        let chase: Target | null = null;
        let chaseD = Infinity;
        for (const e of this.allTargets(enemies, boss)) {
          const d = this.groundDistance(e.root.position, t.body.position);
          if (d < chaseD && d <= MINION_LEASH) {
            chaseD = d;
            chase = e;
          }
        }
        // Close to just inside its own reach, then hold. Walking through the
        // thing you are hitting looks worse than stopping short of it.
        const stand = t.melee ? Math.max(1.2, t.range * 0.7) : t.range * 0.75;
        let moving = 0;
        if (chase) {
          const dx = chase.root.position.x - t.body.position.x;
          const dz = chase.root.position.z - t.body.position.z;
          t.facing = Math.atan2(dx, dz);
          if (chaseD > stand) {
            const inv = 1 / Math.max(0.0001, chaseD);
            const step = Math.min(MINION_SPEED * dt, chaseD - stand);
            t.body.position.x += dx * inv * step;
            t.body.position.z += dz * inv * step;
            moving = 1;
          }
        }
        t.x = t.body.position.x;
        t.z = t.body.position.z;
        t.body.rotation.y = t.facing;
        t.gait += (moving - t.gait) * Math.min(1, dt * 8);

        if (t.actionT > 0) {
          t.actionT = Math.max(0, t.actionT - dt * 2.6);
          if (t.actionT === 0) t.action = 'idle';
        }
        // Fade out over the last second rather than blinking away.
        const fade = Math.min(1, Math.max(0, t.left));
        t.body.scale.setScalar(t.body.scale.x > 0 ? t.body.scale.x : 1);
        t.body.visible = t.left > 0;
        t.anim?.update(dt, {
          locomotion: t.gait,
          action: t.action,
          actionT: 1 - t.actionT,
          time: this.runTime,
          deathT: t.left < 0.6 ? 1 - fade / 0.6 : 0,
        });
      }

      if (t.accum >= t.cd) {
        t.accum = 0;
        const from = this.tmp3.set(t.x, t.melee ? 1.0 : 1.2, t.z);
        let best: Target | null = null;
        let bestD = Infinity;
        for (const e of this.allTargets(enemies, boss)) {
          const d = this.groundDistance(e.root.position, from);
          if (d < bestD && d <= t.range) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          if (t.body) {
            t.action = t.melee ? 'attack' : 'cast';
            t.actionT = 1;
          }
          const to = best.root.position.clone().setY(1.0);
          if (t.melee) {
            best.takeDamage(t.packet(), ctx);
            this.effects.impact(t.type, to.x, to.y, to.z, { color: t.color, scale: 0.7, shake: 0 });
          } else {
            this.effects.projectile(from.clone(), to, {
              element: t.type,
              color: t.color,
              speed: 26,
              size: 0.18,
              onHit: (p) => this.pointDamage(p, 0.9, t.packet, ctx, enemies, boss),
            });
          }
        }
      }
      if (t.left <= 0) {
        t.fx?.stop();
        this.removeBody(t.body);
        this.turrets.splice(i, 1);
      }
    }
  }

  /** Leaves a patch of ground that keeps hurting whatever stands in it. */
  private addZone(
    x: number,
    z: number,
    radius: number,
    duration: number,
    tick: number,
    packet: (m?: number) => DamagePacket,
    type: DamageType,
    color: number,
    emitter: string,
    applies?: StatusApplication[],
  ): void {
    // A cap, because a build that stacks ten fields should cost frames, not
    // the whole run.
    if (this.zones.length >= 12) {
      this.zones[0]!.fx?.stop();
      this.zones.shift();
    }
    const fx = this.effects.summonCircle(x, z, radius, duration, color);
    this.zones.push({ x, z, radius, left: duration, tick, accum: tick, packet, type, color, emitter, applies, fx });
  }

  /** Leaves something standing that fights for you until its time runs out. */
  private addTurret(
    x: number,
    z: number,
    duration: number,
    cd: number,
    range: number,
    packet: (m?: number) => DamagePacket,
    type: DamageType,
    color: number,
    melee: boolean,
    skillId?: string,
  ): void {
    if (this.turrets.length >= 8) {
      const oldest = this.turrets[0]!;
      oldest.fx?.stop();
      this.removeBody(oldest.body);
      this.turrets.shift();
    }
    const fx = this.effects.summonCircle(x, z, melee ? 0.7 : 0.55, duration, color);
    this.effects.teleportIn(x, 0.1, z, color);

    // Give it a body if the skill names one.
    let body: THREE.Object3D | null = null;
    let anim: RigAnimator | null = null;
    const monsterId = skillId ? MINION_MONSTER[skillId] : undefined;
    const mdef = monsterId ? MONSTERS.find((m) => m.id === monsterId) : undefined;
    if (mdef) {
      try {
        const rng = new Random((Date.now() ^ this.turrets.length * 7919) >>> 0);
        const model = buildMonsterModel(mdef.visual, rng, (mdef.scale ?? 1) * 0.92);
        model.root.position.set(x, 0, z);
        this.effects.scene.add(model.root);
        anim = new RigAnimator(model.root, model.bones, monsterArchetype(mdef.visual.body), rng);
        body = model.root;
      } catch {
        // A missing rig must not swallow the cast; it just falls back to a
        // bodiless guardian rather than throwing mid-spell.
        body = null;
        anim = null;
      }
    }

    this.turrets.push({
      x, z, left: duration, cd, accum: cd * 0.5, range, packet, type, color, melee, fx,
      body, anim, facing: 0, gait: 0, action: 'spawn', actionT: 0,
    });
  }

  /** Takes a minion's body out of the scene and frees what it owns. */
  private removeBody(body: THREE.Object3D | null): void {
    if (!body) return;
    body.parent?.remove(body);
    // Geometry and materials are shared prototypes owned by the model cache and
    // released by `disposeMonsterModels`, so only the clone goes here.
  }

  dispose(): void {
    for (const z of this.zones) z.fx?.stop();
    for (const t of this.turrets) {
      t.fx?.stop();
      this.removeBody(t.body);
    }
    this.zones.length = 0;
    this.turrets.length = 0;
    this.tickCtx = null;
  }
}
