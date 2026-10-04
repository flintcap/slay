/**
 * SLAY — what a blow feels like.
 *
 * The VFX library knows how to draw a hit and the camera knows how to shake,
 * but neither knows anything about the *fight*: how hard the blow was relative
 * to what it hit, whether it killed, whether it was the fourth kill in half a
 * second, whether the weapon was a dagger or a maul. This module does. Every
 * player blow that lands is reported here with that context, and it turns the
 * report into one coherent beat:
 *
 *   - a white-hot flash on the struck body (HitFlash);
 *   - hit-stop sized to the blow, drawn from the camera's freeze budget so a
 *     fast weapon in a crowd never turns the fight to treacle;
 *   - a directional camera kick along the line of the blow, plus trauma;
 *   - knockback as a short eased slide, not a teleport, that respects walls;
 *   - layered sound: the weapon, the body it met, the crit, the monster's
 *     voice, and on a kill the crunch that says it is over;
 *   - a heavier, element-specific punch on kills, slow motion on elites, and a
 *     multi-kill beat when a pack goes down together.
 *
 * Per-frame trauma and kick are pooled, so a nova that hits twelve monsters
 * shakes the screen once, hard, rather than twelve times.
 */

import * as THREE from 'three';
import type { DamagePacket, DamageType, MonsterRank } from '../types';
import { audio } from '../audio/Audio';
import { ELEMENTS, type EffectSystem } from './Effects';
import type { CameraRig } from './CameraRig';
import { HitFlash } from './HitFlash';

/** How a blow was delivered. Drives how hard everything below responds. */
export type HitKind =
  /** A swing from the player's own weapon. */
  | 'melee'
  /** A big committed melee skill: slams, cleaves, leaps. */
  | 'heavy'
  | 'projectile'
  | 'area'
  | 'beam'
  | 'chain'
  /** A summon or totem acting for the player. */
  | 'minion'
  /** A passive's side effect — arcs, phantom blades, shared damage. */
  | 'proc';

/** What the feel layer needs to know about something that was hit. */
export interface FeelTarget {
  readonly id: string;
  readonly root: THREE.Object3D;
  life: number;
  maxLife: number;
  readonly hitRadius: number;
  readonly rank?: MonsterRank;
  readonly family?: string;
  readonly isBoss?: boolean;
  readonly sizeScale?: number;
  readonly motionOverride?: unknown;
  readonly affixes?: ReadonlyArray<{ behavior?: string }>;
}

/** The weapon a melee blow came from, for its sound. */
export type WeaponSound = 'blade' | 'axe' | 'blunt' | 'pierce' | 'fist';

export interface HitReport {
  kind: HitKind;
  /** Where the blow came from, for knockback and kick direction. */
  fromX: number;
  fromZ: number;
  /** Life before the blow, so the feel can see what actually landed. */
  lifeBefore: number;
  weapon?: WeaponSound;
}

/** Anything that can say whether a straight floor move is clear. */
export interface FeelWorld {
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean;
}

interface Slide {
  target: FeelTarget;
  dx: number;
  dz: number;
  dist: number;
  t: number;
  dur: number;
  done: number;
}

/** Tuning, in one place so it can be read as a table. */
const STOP: Record<HitKind, number> = {
  melee: 0.042,
  heavy: 0.068,
  projectile: 0,
  area: 0,
  beam: 0,
  chain: 0,
  minion: 0,
  proc: 0,
};
const KICK: Record<HitKind, number> = {
  melee: 0.06,
  heavy: 0.13,
  projectile: 0.025,
  area: 0.05,
  beam: 0.02,
  chain: 0.02,
  minion: 0,
  proc: 0,
};
const TRAUMA: Record<HitKind, number> = {
  melee: 0.07,
  heavy: 0.16,
  projectile: 0.03,
  area: 0.06,
  beam: 0.03,
  chain: 0.04,
  minion: 0.0,
  proc: 0.0,
};
/** Base knockback distance in metres, before crits, kills and size. */
const SHOVE: Record<HitKind, number> = {
  melee: 0.16,
  heavy: 0.42,
  projectile: 0.1,
  area: 0.3,
  beam: 0.06,
  chain: 0.04,
  minion: 0.06,
  proc: 0,
};

/** Which body layer a monster family makes when struck. */
const BODY_SOUND: Record<string, string> = {
  undead: 'hit.bone',
  construct: 'hit.metal',
  elemental: 'hit.stone',
  demon: 'hit.flesh',
  beast: 'hit.flesh',
  humanoid: 'hit.flesh',
  insect: 'hit.chitin',
  aberration: 'hit.flesh',
  plant: 'hit.wood',
  ooze: 'hit.ooze',
};

const WEAPON_SOUND: Record<WeaponSound, string> = {
  blade: 'hit.sword',
  axe: 'hit.axe',
  blunt: 'hit.blunt',
  pierce: 'hit.pierce',
  fist: 'hit.fist',
};

/** The burst a kill throws, by the element that delivered it. */
const DEATH_BURST: Record<DamageType, string> = {
  physical: 'gib',
  fire: 'explosion',
  cold: 'frost',
  lightning: 'shock',
  poison: 'poison',
  arcane: 'void',
};

const RANK_WEIGHT: Record<MonsterRank, number> = {
  normal: 0,
  champion: 1,
  elite: 1.4,
  rare: 2,
  boss: 3,
};

export class CombatFeel {
  readonly flash = new HitFlash();
  private effects: EffectSystem;
  private slides: Slide[] = [];
  private clock = 0;

  // Pooled per frame so a crowd shakes once.
  private frameTrauma = 0;
  private frameTraumaSum = 0;
  private kickX = 0;
  private kickZ = 0;
  private kickAmt = 0;

  /** When each body may next make a sound with its mouth. */
  private nextVoice = new WeakMap<THREE.Object3D, number>();
  private nextAnyVoice = 0;
  /** Kill timestamps, for the multi-kill beat. */
  private kills: number[] = [];
  private multiFiredAt = -99;
  private nextPlayerHurt = 0;
  private nextHeartbeat = 0;

  constructor(effects: EffectSystem) {
    this.effects = effects;
  }

  private get rig(): CameraRig | null {
    return this.effects.cameraRig;
  }

  /**
   * Reports a player blow that has already been applied.
   *
   * Call *after* `takeDamage`, with the life the target had before it, so the
   * feel responds to what actually landed — a blow fully eaten by a shield or
   * an immunity is not a hit and gets no reaction.
   */
  hit(target: FeelTarget, packet: DamagePacket, r: HitReport, world?: FeelWorld): void {
    const landed = Math.max(0, r.lifeBefore - Math.max(0, target.life));
    if (landed <= 0) return;
    const killed = r.lifeBefore > 0 && target.life <= 0;
    const crit = !!packet.crit;
    const type = packet.type;
    const el = ELEMENTS[type] ?? ELEMENTS.physical;
    const p = target.root.position;
    const frac = Math.min(1, landed / Math.max(1, target.maxLife));
    const big = target.isBoss || (target.sizeScale ?? 1) > 1.6;

    // Direction of the blow on the floor.
    let dx = p.x - r.fromX;
    let dz = p.z - r.fromZ;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; } else { dx = 0; dz = 0; }

    // --- flash ------------------------------------------------------------
    if (r.kind !== 'proc' || crit) {
      const strength = killed || crit ? 1 : r.kind === 'heavy' ? 0.8 : 0.5 + frac;
      const dur = killed ? 0.13 : crit ? 0.11 : r.kind === 'minion' ? 0.05 : 0.08;
      this.flash.flash(target.root, el.core, Math.min(1, strength), dur);
    }

    // --- time --------------------------------------------------------------
    const rig = this.rig;
    if (rig) {
      let stop = STOP[r.kind];
      let scale = r.kind === 'heavy' ? 0.04 : 0.07;
      // A blow that took a real bite out of something is heavier than one
      // that scratched it, whatever delivered it.
      if (frac > 0.3 && stop > 0) stop += 0.018;
      if (crit) {
        stop = Math.max(stop + 0.026, r.kind === 'melee' || r.kind === 'heavy' ? 0 : 0.03);
        scale = 0.03;
      }
      if (killed) {
        const close = r.kind === 'melee' || r.kind === 'heavy';
        stop = Math.max(stop, close ? 0.07 : 0.04);
        scale = Math.min(scale, 0.04);
      }
      if (stop > 0) rig.hitStop(stop, scale, crit || killed);
    }

    // --- camera ---------------------------------------------------------------
    let trauma = TRAUMA[r.kind] * (0.7 + frac * 1.2);
    if (crit) trauma += 0.1;
    if (killed) trauma += 0.06;
    if (big) trauma *= 1.25;
    this.addTrauma(trauma);
    const kick = KICK[r.kind] * (crit ? 2.1 : 1) * (killed ? 1.5 : 1);
    if (kick > 0 && (dx !== 0 || dz !== 0)) this.addKick(dx, dz, kick);

    // --- knockback --------------------------------------------------------
    let shove = SHOVE[r.kind];
    if (crit) shove *= 1.7;
    if (killed) shove *= 2.2;
    shove /= Math.max(0.7, target.sizeScale ?? 1);
    if (shove > 0.02 && !target.isBoss && !this.immovable(target) && (dx !== 0 || dz !== 0)) {
      this.shove(target, dx, dz, Math.min(1.4, shove), killed ? 0.2 : 0.12);
    }
    void world;

    // --- sound --------------------------------------------------------------
    const x = p.x;
    const z = p.z;
    const physical = type === 'physical';
    if ((r.kind === 'melee' || r.kind === 'heavy') && physical) {
      audio.play(WEAPON_SOUND[r.weapon ?? 'blade'], { x, z, volume: r.kind === 'heavy' ? 1.15 : 1 });
      if (r.kind === 'heavy') audio.play('hit.heavy', { x, z });
    } else if (r.kind === 'projectile' && physical) {
      audio.play('hit.pierce', { x, z, volume: 0.85 });
    }
    const body = BODY_SOUND[target.family ?? 'beast'] ?? 'hit.flesh';
    if (r.kind !== 'proc' && r.kind !== 'beam') {
      audio.play(body, { x, z, volume: physical ? 0.75 : 0.45 });
    }
    if (crit) audio.play('crit', { x, z });

    if (killed) this.onKill(target, type, x, z, dx, dz, r);
    else this.voice(target, 'hurt', x, z, 0.32);
  }

  /** The beat that says it is over. */
  private onKill(target: FeelTarget, type: DamageType, x: number, z: number, dx: number, dz: number, r: HitReport): void {
    const el = ELEMENTS[type] ?? ELEMENTS.physical;
    const weight = RANK_WEIGHT[target.rank ?? 'normal'] ?? 0;
    const scale = Math.max(0.8, Math.min(2.2, target.sizeScale ?? 1));
    const y = 0.7 * scale;

    this.effects.flash(x, y + 0.3, z, el.light, 7 + weight * 5, 6 + weight * 2, 0.22);
    // The element decides how a body comes apart: fire bursts, frost shatters,
    // lightning cooks off, poison blooms. Physical throws meat.
    const burst = DEATH_BURST[type] ?? 'gib';
    this.effects.fx.burst(burst, x, y, z, {
      scale: scale * (type === 'fire' ? 0.45 : 0.9),
      count: Math.round(14 + weight * 6),
      dir: dx !== 0 || dz !== 0 ? _dir.set(dx, 0.4, dz) : undefined,
    });
    if (type !== 'physical') this.effects.fx.burst('gib', x, y, z, { scale: scale * 0.7, count: 8 });

    audio.play('kill.confirm', { x, z, volume: 0.9 + weight * 0.1 });
    this.voice(target, 'death', x, z, 1, true);

    const rig = this.rig;
    if (weight >= 1 && rig) {
      // An elite falling is a moment. Rares more so.
      rig.hitStop(0.09 + weight * 0.02, 0.03, true);
      rig.slowMo(weight >= 2 ? 0.35 : 0.5, 0.35 + weight * 0.15);
      rig.punchIn(0.035 + weight * 0.02, 0.5 + weight * 0.15);
      this.addTrauma(0.18 + weight * 0.08);
      audio.play('kill.elite', { x, z });
    }

    // --- multi-kill -------------------------------------------------------
    this.kills.push(this.clock);
    while (this.kills.length && this.clock - this.kills[0]! > 0.4) this.kills.shift();
    if (this.kills.length >= 3 && this.clock - this.multiFiredAt > 0.6) {
      this.multiFiredAt = this.clock;
      const n = this.kills.length;
      rig?.slowMo(n >= 5 ? 0.4 : 0.55, n >= 5 ? 0.45 : 0.3);
      this.addTrauma(0.12 + Math.min(0.2, n * 0.02));
      audio.play('kill.multi', { volume: Math.min(1.2, 0.7 + n * 0.08) });
    }
    void r;
  }

  /** A monster's mouth, rate-limited per body and across the whole fight. */
  private voice(target: FeelTarget, kind: 'hurt' | 'death', x: number, z: number, chance: number, force = false): void {
    const fam = target.family ?? 'beast';
    if (!force) {
      if (this.clock < this.nextAnyVoice) return;
      if (this.clock < (this.nextVoice.get(target.root) ?? 0)) return;
      if (this.effects.chance(1 - chance)) return;
    }
    this.nextVoice.set(target.root, this.clock + (kind === 'hurt' ? 0.9 : 99));
    this.nextAnyVoice = this.clock + (kind === 'hurt' ? 0.14 : 0.05);
    audio.play(`monster.${fam}.${kind}`, { x, z, volume: kind === 'death' ? 0.85 : 0.7 });
  }

  /** Bosses, juggernauts and things mid-leap do not get pushed around. */
  private immovable(t: FeelTarget): boolean {
    if (t.motionOverride) return true;
    if (t.affixes?.some((a) => a.behavior === 'juggernaut')) return true;
    return false;
  }

  private shove(target: FeelTarget, dx: number, dz: number, dist: number, dur: number): void {
    for (const s of this.slides) {
      if (s.target === target) {
        // Already sliding: redirect and extend rather than stacking two.
        s.dx = dx; s.dz = dz;
        s.dist = Math.min(1.6, s.dist - s.done + dist);
        s.done = 0; s.t = 0; s.dur = dur;
        return;
      }
    }
    if (this.slides.length >= 40) return;
    this.slides.push({ target, dx, dz, dist, t: 0, dur, done: 0 });
  }

  private addTrauma(v: number): void {
    if (v <= 0) return;
    this.frameTraumaSum += v;
    if (v > this.frameTrauma) this.frameTrauma = v;
  }

  private addKick(dx: number, dz: number, amt: number): void {
    if (amt > this.kickAmt) {
      this.kickAmt = amt;
      this.kickX = dx;
      this.kickZ = dz;
    }
  }

  /** The player was struck. `frac` is the share of max life it took. */
  playerHit(taken: number, maxLife: number): void {
    const frac = taken / Math.max(1, maxLife);
    if (this.clock >= this.nextPlayerHurt) {
      this.nextPlayerHurt = this.clock + 0.12;
      audio.play('player.hurt', { volume: Math.min(1.3, 0.55 + frac * 3) });
    }
    if (frac > 0.14) {
      // A hit that takes a real chunk freezes the frame for an instant so the
      // player registers *that* one in a flurry of small ones.
      this.rig?.hitStop(0.05 + Math.min(0.05, frac * 0.12), 0.08, true);
      audio.play('player.hurtHeavy', { volume: Math.min(1.2, 0.6 + frac * 2) });
    }
  }

  /** The last beat of a run: the death toll, and the score drops away. */
  playerDied(): void {
    audio.play('player.death', { volume: 1.1 });
    audio.setIntensity(0);
    this.flash.clear();
  }

  /**
   * Advances flashes, slides and the pooled camera response. `dt` is the
   * world's dilated step: a flash that lands with a hit-stop holds its white
   * frame for the length of the freeze, which is exactly the look.
   */
  update(dt: number, world: FeelWorld | null, lifeFrac = 1, alive = true): void {
    this.clock += dt;
    this.flash.update(dt);

    for (let i = this.slides.length - 1; i >= 0; i--) {
      const s = this.slides[i]!;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      // Ease out: most of the travel in the first frames, then it settles.
      const want = s.dist * (1 - (1 - k) * (1 - k) * (1 - k));
      const step = want - s.done;
      s.done = want;
      const pos = s.target.root.position;
      if (step > 0) {
        const nx = pos.x + s.dx * step;
        const nz = pos.z + s.dz * step;
        let ok = true;
        if (world) {
          try {
            ok = world.lineOfSight(pos.x, pos.z, nx, nz);
          } catch {
            ok = true;
          }
        }
        // Something else took over the body (a charge, a leap): let go.
        if (!ok || (s.target.life > 0 && s.target.motionOverride)) {
          this.slides.splice(i, 1);
          continue;
        }
        pos.x = nx;
        pos.z = nz;
      }
      if (k >= 1) this.slides.splice(i, 1);
    }

    const rig = this.rig;
    if (rig) {
      if (this.frameTrauma > 0) {
        // The biggest hit this frame, plus a little for every other one.
        const t = this.frameTrauma + (this.frameTraumaSum - this.frameTrauma) * 0.22;
        rig.addTrauma(Math.min(0.55, t));
      }
      if (this.kickAmt > 0) rig.kick(this.kickX, this.kickZ, Math.min(0.4, this.kickAmt));
    }
    this.frameTrauma = 0;
    this.frameTraumaSum = 0;
    this.kickAmt = 0;

    // Low life: the heart starts to be audible, and quickens as it drops.
    if (alive && lifeFrac > 0 && lifeFrac < 0.3) {
      if (this.clock >= this.nextHeartbeat) {
        const urgency = 1 - lifeFrac / 0.3;
        this.nextHeartbeat = this.clock + 1.05 - urgency * 0.45;
        audio.play('heartbeat', { volume: 0.55 + urgency * 0.5 });
      }
    }
  }

  /** Lets go of a body that is about to be removed from the scene. */
  forget(root: THREE.Object3D): void {
    this.flash.release(root);
    for (let i = this.slides.length - 1; i >= 0; i--) {
      if (this.slides[i]!.target.root === root) this.slides.splice(i, 1);
    }
  }

  /** Drops everything in flight. Call between levels. */
  clear(): void {
    this.flash.clear();
    this.slides.length = 0;
    this.kills.length = 0;
  }

  dispose(): void {
    this.clear();
    this.flash.dispose();
  }
}

const _dir = new THREE.Vector3();

/** Every sound id this module can ask for, so a check can prove none is silent. */
export function feelSoundIds(families: readonly string[]): string[] {
  const out = new Set<string>([
    ...Object.values(WEAPON_SOUND),
    ...Object.values(BODY_SOUND),
    'hit.heavy', 'hit.pierce', 'crit', 'kill.confirm', 'kill.elite', 'kill.multi',
    'player.hurt', 'player.hurtHeavy', 'heartbeat', 'player.death',
  ]);
  for (const f of families) {
    out.add(`monster.${f}.hurt`);
    out.add(`monster.${f}.death`);
  }
  return [...out];
}

/** Every particle emitter this module can ask for. */
export function feelEmitterIds(): string[] {
  return [...new Set([...Object.values(DEATH_BURST), 'gib'])];
}

/** The per-kind tuning tables, for the static check. */
export const FEEL_TABLES = { STOP, KICK, TRAUMA, SHOVE } as const;
