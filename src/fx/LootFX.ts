/**
 * SLAY — loot that feels like loot.
 *
 * A kill used to pop its drops into existence already on the floor, with a
 * small vertical hop and no sound. This module owns the moment between the
 * body falling and the item lying there, and the moment it is picked up:
 *
 *   - **The arc.** Drops leave the body and fly out on a ballistic arc,
 *     tumbling, with their beam and floor glow hidden until they land. Gold
 *     sprays as loose coins.
 *   - **The landing.** A clink, a puff, a bounce and settle — then the beam
 *     grows up out of the floor. Rarity is audible as well as visible: a
 *     common item thunks, a magic one chimes, a rare rings, and a unique,
 *     set, mythic or ancient drop hits with a pillar of light, a camera lean
 *     and a sound you can recognise from the next room.
 *   - **The pickup.** Items zip to the hero and vanish into them instead of
 *     blinking out. Gold within reach is vacuumed in, and a run of pickups
 *     climbs in pitch so sweeping up a pile is satisfying rather than noisy.
 *
 * It never decides *what* drops or where it rests; the scene does. It only
 * animates between the two, and hands the root back untouched.
 */

import * as THREE from 'three';
import type { ItemRarity } from '../types';
import { RARITY_COLOR, RARITY_ORDER } from '../types';
import { audio } from '../audio/Audio';
import type { EffectSystem } from './Effects';

/** What a loot entry looks like to this module. Matches the scene's shape. */
export interface LootEntry {
  root: THREE.Object3D;
  /** Resting position on the floor. The scene's pickup checks read this. */
  pos: THREE.Vector3;
  gold: number;
}

type Kind = ItemRarity | 'gold';

interface Flight {
  entry: LootEntry;
  kind: Kind;
  from: THREE.Vector3;
  t: number;
  dur: number;
  height: number;
  restY: number;
  /** Tumble axis and rate while airborne. */
  spinX: number;
  spinZ: number;
  landed: boolean;
  /** Seconds since landing, for the bounce and the beam growing in. */
  since: number;
  /** Parts hidden in flight, revealed on landing. */
  hidden: THREE.Object3D[];
  beam: THREE.Object3D | null;
  spin: THREE.Object3D | null;
}

interface Zip {
  root: THREE.Object3D;
  from: THREE.Vector3;
  target: THREE.Object3D;
  t: number;
  dur: number;
  scale0: number;
  onDone: () => void;
}

/** Rarity as a number: 0 normal .. 6 ancient. */
export function rarityTier(r: ItemRarity): number {
  const i = RARITY_ORDER.indexOf(r);
  return i < 0 ? 0 : i;
}

/** Rarities that get the full jackpot treatment on landing. */
const JACKPOT = 4;

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class LootFX {
  private effects: EffectSystem;
  private flights = new Map<THREE.Object3D, Flight>();
  private zips: Zip[] = [];
  /** Gold piles resting on the floor, owned here so they sit flat. */
  private resting = new Set<THREE.Object3D>();
  private clock = 0;
  private goldStreak = 0;
  private lastGoldAt = -99;
  private lastLandSound = -99;
  /** Drops launched on the same tick come out one after another. */
  private burstAt = -1;
  private burstCount = 0;

  constructor(effects: EffectSystem) {
    this.effects = effects;
  }

  /** True while this module is animating the root; the scene leaves it alone. */
  owns(root: THREE.Object3D): boolean {
    return this.flights.has(root) || this.resting.has(root);
  }

  /**
   * Throws a drop from `from` (the body) to where it will rest. The root must
   * already be in the scene at its resting position; this moves it back to the
   * start and flies it there.
   */
  launch(entry: LootEntry, from: THREE.Vector3, kind: Kind, delay?: number): void {
    const root = entry.root;
    if (delay === undefined) {
      // A boss's pile should spill out over half a second, not all at once.
      if (this.burstAt === this.clock) this.burstCount++;
      else {
        this.burstAt = this.clock;
        this.burstCount = 0;
      }
      delay = Math.min(0.9, this.burstCount * (kind === 'gold' ? 0.03 : 0.07));
    }
    const tier = kind === 'gold' ? 0 : rarityTier(kind);
    const hidden: THREE.Object3D[] = [];
    let beam: THREE.Object3D | null = null;
    let spin: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (o.name === 'beam') beam = o;
      if (o.name === 'spin') spin = o;
      if (o.name === 'beam' || o.name === 'pool' || o.name === 'sigil' || o.name === 'dropLight') {
        if (o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      }
    });
    const dist = Math.hypot(entry.pos.x - from.x, entry.pos.z - from.z);
    const f: Flight = {
      entry,
      kind,
      from: new THREE.Vector3(from.x, Math.max(0.5, from.y), from.z),
      // A short negative start time staggers a pile so it comes out one by one.
      t: -delay,
      dur: 0.5 + Math.min(0.35, dist * 0.12) + tier * 0.03,
      height: 1.3 + Math.min(1.2, dist * 0.35) + tier * 0.12,
      restY: kind === 'gold' ? 0 : 0.28,
      spinX: this.effects.chance(0.5) ? 7 : -7,
      spinZ: this.effects.chance(0.5) ? 5 : -5,
      landed: false,
      since: 0,
      hidden,
      beam,
      spin,
    };
    root.position.copy(f.from);
    this.flights.set(root, f);
    if (delay <= 0) this.onLaunch(f);
  }

  private onLaunch(f: Flight): void {
    const p = f.from;
    if (f.kind === 'gold') {
      audio.play('gold.spill', { x: p.x, z: p.z, volume: 0.7 });
    } else {
      audio.play('loot.toss', { x: p.x, z: p.z, volume: 0.6 });
    }
  }

  private onLand(f: Flight): void {
    const { root, pos } = f.entry;
    const x = pos.x;
    const z = pos.z;
    const fx = this.effects;
    for (const o of f.hidden) o.visible = true;
    if (f.beam) f.beam.scale.y = 0.01;

    if (f.kind === 'gold') {
      fx.fx.burst('gold', x, 0.2, z, { count: 8, scale: 0.7 });
      // Several coins landing at once should be one sound, not a machine gun.
      if (this.clock - this.lastLandSound > 0.05) audio.play('gold.land', { x, z, volume: 0.8 });
      this.lastLandSound = this.clock;
      this.resting.add(root);
      return;
    }

    const tier = rarityTier(f.kind);
    const color = (root.userData.color as number | undefined) ?? RARITY_COLOR[f.kind] ?? 0xc8c8c8;
    fx.fx.burst('dust', x, 0.15, z, { count: 6, scale: 0.6 });
    fx.fx.burst('itemDrop', x, 0.35, z, { color, count: 6 + tier * 4, scale: 0.8 + tier * 0.1 });
    if (this.clock - this.lastLandSound > 0.04) audio.play('loot.clink', { x, z });
    this.lastLandSound = this.clock;
    // The rarity chime. A plain drop does not get one: quiet is information too.
    if (tier >= 1) audio.play(`drop.${f.kind}`, { x, z, volume: 0.9 + tier * 0.05 });
    if (tier >= 2) {
      fx.flash(x, 0.8, z, color, 4 + tier * 2, 5 + tier, 0.4);
      fx.decals.add('ring', x, z, 0.9 + tier * 0.15);
    }
    if (tier >= JACKPOT) {
      // The jackpot: a pillar of light from the floor to the ceiling, a ring
      // across the room, a lean of the camera and its own fanfare.
      const top = _t.set(x, 14, z);
      fx.beam(_v.set(x, 0.1, z), top, { color, width: 0.55 + (tier - JACKPOT) * 0.15, duration: 0.9, endBurst: false, power: 1.4 });
      fx.nova(x, z, 3 + tier * 0.3, { color, duration: 0.7, particles: false, thickness: 0.08 });
      fx.fx.burst('levelup', x, 0.6, z, { color, count: 30, scale: 0.8 });
      fx.flash(x, 1.6, z, color, 30, 14, 0.8);
      fx.cameraRig?.punchIn(0.03 + (tier - JACKPOT) * 0.015, 0.8);
      audio.play('loot.legendary', { x, z, volume: 1 + (tier - JACKPOT) * 0.1 });
    }
  }

  /**
   * Hands a root over for its pickup flourish: it zips to `target` and
   * shrinks into it, then `onDone` frees it. The scene has already credited
   * the item or gold; this is only the picture.
   */
  collect(root: THREE.Object3D, target: THREE.Object3D, kind: Kind, onDone: () => void): void {
    this.flights.delete(root);
    this.resting.delete(root);
    const p = root.position;
    if (kind === 'gold') {
      // A run of coins climbs in pitch: sweeping up a pile should sing.
      this.goldStreak = this.clock - this.lastGoldAt < 1.4 ? this.goldStreak + 1 : 0;
      this.lastGoldAt = this.clock;
      audio.play('gold', { x: p.x, z: p.z, pitch: 1 + Math.min(0.6, this.goldStreak * 0.07) });
      this.effects.fx.burst('pickup', p.x, 0.4, p.z, { count: 10, color: 0xffc63a });
    } else {
      const tier = rarityTier(kind);
      audio.play(`pickup.${kind}`, { x: p.x, z: p.z });
      audio.play('loot.grab', { x: p.x, z: p.z, volume: 0.7 });
      this.effects.fx.burst('pickup', p.x, 0.5, p.z, { count: 10 + tier * 3, color: RARITY_COLOR[kind] });
    }
    // Hide the beam and floor glow at once; only the object itself flies.
    root.traverse((o) => {
      if (o.name === 'beam' || o.name === 'pool' || o.name === 'sigil' || o.name === 'dropLight') o.visible = false;
    });
    this.zips.push({ root, from: p.clone(), target, t: 0, dur: kind === 'gold' ? 0.16 : 0.22, scale0: root.scale.x, onDone });
  }

  /**
   * Pulls gold within `radius` toward the hero. Moves the entry's resting
   * position with it, so the scene's own pickup check fires when it arrives.
   */
  magnet(entries: readonly LootEntry[], hero: THREE.Vector3, dt: number, radius = 3.2): void {
    for (const e of entries) {
      if (e.gold <= 0 || !this.resting.has(e.root)) continue;
      const dx = hero.x - e.pos.x;
      const dz = hero.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-3) continue;
      // Accelerates as it closes: a tug, then a snap.
      const speed = 3 + (radius - d) * 6;
      const step = Math.min(d, speed * dt);
      e.pos.x += (dx / d) * step;
      e.pos.z += (dz / d) * step;
      e.root.position.x = e.pos.x;
      e.root.position.z = e.pos.z;
      e.root.position.y = Math.sin(Math.min(1, (radius - d) / radius) * Math.PI) * 0.35;
    }
  }

  update(dt: number): void {
    this.clock += dt;

    for (const f of this.flights.values()) {
      const root = f.entry.root;
      if (!f.landed) {
        const was = f.t;
        f.t += dt;
        if (was < 0 && f.t >= 0) this.onLaunch(f);
        if (f.t < 0) {
          root.position.copy(f.from);
          root.visible = false;
          continue;
        }
        root.visible = true;
        const k = Math.min(1, f.t / f.dur);
        const to = f.entry.pos;
        root.position.set(
          f.from.x + (to.x - f.from.x) * k,
          f.from.y + (f.restY - f.from.y) * k + Math.sin(k * Math.PI) * f.height,
          f.from.z + (to.z - f.from.z) * k,
        );
        const tumble = f.spin ?? root;
        tumble.rotation.x += f.spinX * dt;
        tumble.rotation.z += f.spinZ * dt;
        if (k >= 1) {
          f.landed = true;
          f.since = 0;
          root.position.set(to.x, f.restY, to.z);
          this.onLand(f);
        }
        continue;
      }

      // One small bounce, then settle; the beam grows up out of the floor.
      f.since += dt;
      const b = f.since / 0.3;
      if (b < 1) root.position.y = f.restY + Math.sin(b * Math.PI) * 0.14 * (1 - b);
      else root.position.y = f.restY;
      // Ease the tumble out so the thing comes to rest upright.
      const tb = f.spin ?? root;
      const settle = Math.max(0, 1 - dt * 12);
      tb.rotation.x *= settle;
      tb.rotation.z *= settle;
      if (f.beam) f.beam.scale.y = Math.min(1, f.since / 0.35);
      if (f.since > 0.4) {
        if (f.beam) f.beam.scale.y = 1;
        tb.rotation.x = 0;
        tb.rotation.z = 0;
        this.flights.delete(root);
      }
    }

    for (let i = this.zips.length - 1; i >= 0; i--) {
      const z = this.zips[i]!;
      z.t += dt;
      const k = Math.min(1, z.t / z.dur);
      z.target.getWorldPosition(_t);
      _t.y += 1.0;
      // Ease in: it leaves slowly and arrives fast, like it was pulled.
      const e = k * k;
      z.root.position.lerpVectors(z.from, _t, e);
      z.root.position.y += Math.sin(k * Math.PI) * 0.4;
      z.root.scale.setScalar(z.scale0 * (1 - e * 0.85));
      if (k >= 1) {
        this.zips.splice(i, 1);
        z.onDone();
      }
    }
  }

  /** Lets go of everything, e.g. when the level is torn down. */
  clear(): void {
    this.flights.clear();
    this.resting.clear();
    for (const z of this.zips) z.onDone();
    this.zips.length = 0;
  }
}

/** Every sound id this module can ask for. */
export function lootSoundIds(): string[] {
  const out = ['gold.spill', 'gold.land', 'gold', 'loot.toss', 'loot.clink', 'loot.grab', 'loot.legendary'];
  for (const r of RARITY_ORDER) {
    out.push(`drop.${r}`, `pickup.${r}`);
  }
  return out;
}
