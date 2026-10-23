/**
 * SLAY fx: the particle front door.
 *
 * `FXSystem.burst(id, x, y, z)` fires a named emitter from the kit library
 * (`kit/Emitters.ts`) into one stateless GPU particle field (`kit/Particles.ts`).
 * Every particle in the game, sparks to smoke, is one draw call, blended with
 * the kit's premultiplied "light over" mode: light adds, matter occludes, and a
 * pile of overlapping effects keeps its own colour instead of turning white.
 *
 * Budgets: counts scale with `QualityProfile.fxScale`; a per-frame ceiling and
 * an eased pressure throttle thin out crowd layers in a saturated fight, while
 * single-sprite layers (the flash, the ring at the heart of an effect) always
 * play. Nothing is allocated per burst or per frame.
 *
 * Smoke is lit by the strongest few lights near the view, picked here each
 * frame from the scene's point and spot lights (torches, the hero's light,
 * spell flashes).
 */

import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import { events } from '../core/Events';
import { Random } from '../core/RNG';
import type { Rng } from '../types';
import { ParticleField, SMOKE_LIGHTS } from './kit/Particles';
import { EMITTERS, AMBIENT, emitLayer, emitterIds as kitEmitterIds, ambientIds as kitAmbientIds, type EmitOpts, type Layer } from './kit/Emitters';
import { spriteAtlas, ATLAS_CELLS } from './kit/Atlas';
import { BOOST } from './kit/Boost';
import { WorldText } from './WorldText';
import type { School } from './kit/Palette';

/** Options for `burst`. `count` 12 means "as authored". */
export type BurstOpts = EmitOpts;

/** Largest count multiplier a burst honours (count 36 = three times authored). */
const MAX_COUNT_MUL = 3;
/** Largest sprite scale a burst honours. */
const MAX_BURST_SCALE = 3.5;

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _w = new THREE.Color();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _lp = new THREE.Vector3();
/** How far ahead of the camera the lights are picked round (the play distance). */
const LOOK_AHEAD = 13;
/** Lights past their reach by more than this from the look point are skipped. */
const LIGHT_SLACK = 12;
/** Seconds between looks through the scene for lights. */
const LIGHT_SCAN = 0.5;

export class FXSystem {
  readonly field: ParticleField;
  /** The stream every particle draws from. Effects share it. */
  readonly rng: Rng;
  private scene: THREE.Scene;
  private quality: QualityProfile;
  private text: WorldText | null = null;
  /** Scratch options for a capped burst (never allocates). */
  private readonly capped: BurstOpts = {};
  private time = 0;
  /** Global size multiplier for the whole look. */
  scale = 1;

  private ambientKind: string | null = null;
  private ambientBounds = new THREE.Box3();
  private ambientAccum = 0;
  private focus = new THREE.Vector3();

  private frameSpawned = 0;
  private recent = new Float32Array(10);
  private bucket = 0;
  private bucketT = 0;
  private throttle = 1;
  /** Times a burst was cut short by the per-frame ceiling. */
  clipped = 0;

  /** The scene's point and spot lights, looked up every `LIGHT_SCAN` seconds. */
  private lights: Array<THREE.PointLight | THREE.SpotLight> = [];
  private lightScan = 0;
  /** The camera the lights are picked for (`setView`); none, no lit smoke. */
  private view: THREE.Camera | null = null;
  /** The picked lights and their weights, strongest first. */
  private picked: Array<THREE.PointLight | THREE.SpotLight | null> = new Array(SMOKE_LIGHTS).fill(null);
  private pickW = new Float32Array(SMOKE_LIGHTS);

  private unQuality: () => void;

  constructor(scene: THREE.Scene, quality: QualityProfile) {
    this.scene = scene;
    this.quality = quality;
    this.rng = new Random(0x1f0c5a);
    const fx = Math.max(0.25, quality.fxScale);
    this.field = new ParticleField(Math.round(32000 * fx));
    scene.add(this.field.mesh);
    this.unQuality = events.on('quality:changed', ({ profile }) => this.setQuality(profile));
  }

  /**
   * Follows a quality change live: how much each burst and ambient stream
   * spawns. The pool keeps the size it was built with until the next scene.
   */
  setQuality(q: QualityProfile): void {
    this.quality = q;
  }

  get capacity(): number {
    return this.field.capacity;
  }

  /** Most particles one frame may spawn: an eighth of the field. */
  get frameBudget(): number {
    return Math.max(120, Math.round(this.capacity * 0.125));
  }

  /** How full the field is, 0..1+: last second's spawns times a typical life, over capacity. */
  get pressure(): number {
    let sum = 0;
    for (let i = 0; i < this.recent.length; i++) sum += this.recent[i]!;
    return (sum * 0.75) / Math.max(1, this.capacity);
  }

  /** The camera smoke is lit for: the lights it looks at light the smoke. */
  setView(camera: THREE.Camera | null): void {
    this.view = camera;
    if (!camera) this.field.setLightCount(0);
  }

  /** Ambient emission follows this point (the player) so the budget lands on screen. */
  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
  }

  has(id: string): boolean {
    return id in EMITTERS;
  }

  /** Fires a named emitter. Unknown ids fall back to `hit.physical`, never throw. */
  burst(id: string, x: number, y: number, z: number, opts?: BurstOpts): void {
    const em = EMITTERS[id] ?? EMITTERS['hit.physical']!;
    // Older callers ask for absolute counts (60) and huge scales (6); against
    // authored emitters that is five stacked bursts of giant sprites. Cap both.
    if (opts && opts.scale !== undefined && opts.scale > MAX_BURST_SCALE) {
      const c = this.capped;
      c.count = opts.count; c.color = opts.color; c.dir = opts.dir; c.speed = opts.speed; c.life = opts.life;
      c.ring = opts.ring; c.scatter = opts.scatter; c.school = opts.school; c.scale = MAX_BURST_SCALE;
      opts = c;
    }
    const countMul = opts?.count !== undefined ? Math.min(MAX_COUNT_MUL, opts.count / 12) : 1;
    const school = opts?.school ?? em.school;
    const keyed = em.keyed === true;
    for (let i = 0; i < em.layers.length; i++) this.emit(em.layers[i]!, school, x, y, z, opts, countMul, keyed);
  }

  /** Emits one layer (Effects composes spells from layers). */
  emit(layer: Layer, school: School, x: number, y: number, z: number, opts: BurstOpts | undefined, countMul = 1, keyed = false): void {
    // A hard per-frame ceiling: crowd layers stop at 80% of it, and the last
    // fifth is kept for the single flashes and rings at the heart of effects.
    // Detail kept for High and Ultra.
    if (layer.rich && this.quality.fxScale < 0.9) return;
    const core = layer.count <= 2;
    const budget = this.frameBudget;
    const room = (core ? budget : budget * 0.8) - this.frameSpawned;
    // The single flash or ring at a burst's heart is drawn once, whatever the
    // count: stacking them only whitens the frame. A skill drawn at a high
    // rank throws more of the rest (`kit/Boost.ts`).
    let mul = core ? 1 : countMul * this.quality.fxScale * this.throttle * BOOST.density;
    const want = layer.count * mul;
    if (want > room) {
      this.clipped++;
      if (room < 1 || core) return;
      mul = room / layer.count;
    }
    const n = emitLayer(this.field, this.rng, layer, school, x, y, z, opts, mul, keyed);
    this.frameSpawned += n;
    this.recent[this.bucket] = this.recent[this.bucket]! + n;
  }

  // -- ambient -----------------------------------------------------------------

  /** Sets the biome mood (`null` stops it). Emission stays inside `bounds`. */
  setAmbient(kind: string | null, bounds: THREE.Box3): void {
    this.ambientKind = kind && AMBIENT[kind] ? kind : null;
    this.ambientBounds.copy(bounds);
    if (this.ambientBounds.isEmpty()) {
      this.ambientBounds.min.set(-40, 0, -40);
      this.ambientBounds.max.set(40, 8, 40);
    }
    this.ambientBounds.getCenter(this.focus);
    this.ambientAccum = 0;
  }

  private tickAmbient(dt: number): void {
    if (!this.ambientKind) return;
    const def = AMBIENT[this.ambientKind]!;
    this.ambientAccum += def.rate * this.quality.fxScale * this.throttle * dt;
    let n = Math.floor(this.ambientAccum);
    if (n <= 0) return;
    this.ambientAccum -= n;
    if (n > 30) n = 30;
    const b = this.ambientBounds;
    const rng = this.rng;
    const one = 1 / Math.max(1, def.layer.count);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * def.spread;
      const x = THREE.MathUtils.clamp(this.focus.x + Math.cos(a) * r, b.min.x, b.max.x);
      const z = THREE.MathUtils.clamp(this.focus.z + Math.sin(a) * r, b.min.z, b.max.z);
      const y = b.min.y + rng.range(def.yMin, def.yMax);
      this.frameSpawned += emitLayer(this.field, rng, def.layer, 'physical', x, y, z, undefined, one);
    }
  }

  // -- text --------------------------------------------------------------------

  private glyphs(): WorldText {
    if (!this.text) {
      this.text = new WorldText(Math.round(400 * Math.max(0.5, this.quality.fxScale)));
      this.scene.add(this.text.mesh);
    }
    return this.text;
  }

  /** Floating text that matters (combo callouts). Crits are bigger and warmer. */
  damageNumber(text: string, x: number, y: number, z: number, color: number, crit: boolean): void {
    const rng = this.rng;
    _c.setHex(color);
    if (crit) _c.lerp(_w.setRGB(1, 0.92, 0.72), 0.35).multiplyScalar(1.9);
    else _c.multiplyScalar(1.25);
    const ang = rng.next() * Math.PI * 2;
    const drift = crit ? rng.range(0.5, 1.1) : rng.range(0.25, 0.7);
    this.glyphs().push(
      text, x + rng.range(-0.12, 0.12), y, z + rng.range(-0.12, 0.12), _c,
      crit ? rng.range(0.52, 0.6) : rng.range(0.3, 0.36), crit, crit ? 1.35 : 1.0,
      Math.cos(ang) * drift, Math.sin(ang) * drift, crit ? 3.4 : 2.5, crit ? 0.16 : 0.05, this.time,
    );
    if (crit) this.burst('crit', x, y + 0.1, z, { scale: 0.55, count: 8 });
  }

  /** Non-damage floating text (MISS, BLOCK, IMMUNE). */
  statusText(text: string, x: number, y: number, z: number, color = 0xd8d8d8): void {
    _c.setHex(color).multiplyScalar(1.1);
    this.glyphs().push(text, x, y, z, _c, 0.26, false, 1.2, 0, 0, 2.0, 0, this.time);
  }

  // -- frame -------------------------------------------------------------------

  update(dt: number, elapsed: number, camera?: THREE.Camera): void {
    this.time = elapsed;
    this.frameSpawned = 0;
    this.bucketT += dt;
    while (this.bucketT >= 0.1) {
      this.bucketT -= 0.1;
      this.bucket = (this.bucket + 1) % this.recent.length;
      this.recent[this.bucket] = 0;
    }
    const p = this.pressure;
    const want = p <= 0.55 ? 1 : Math.max(0.3, 1 - (p - 0.55) * 1.6);
    this.throttle += (want - this.throttle) * Math.min(1, dt * 6);
    if (camera) {
      camera.getWorldPosition(_v);
      this.focus.x = _v.x;
      this.focus.z = _v.z;
    }
    this.tickAmbient(dt);
    const view = camera ?? this.view;
    if (view) this.pickLights(dt, view);
    this.field.setFog(this.scene.fog ?? null);
    this.field.update(dt, this.scale);
    this.text?.flush(elapsed);
  }

  /**
   * Hands the field the lights that light its smoke: the strongest few near
   * where the camera looks (half as many on Low and Medium).
   */
  private pickLights(dt: number, camera: THREE.Camera): void {
    this.lightScan -= dt;
    if (this.lightScan <= 0) {
      this.lightScan = LIGHT_SCAN;
      const list = this.lights;
      list.length = 0;
      this.scene.traverse((o) => {
        const l = o as THREE.PointLight | THREE.SpotLight;
        if ((l as THREE.PointLight).isPointLight || (l as THREE.SpotLight).isSpotLight) list.push(l);
      });
    }
    const max = this.quality.fxScale >= 0.9 ? SMOKE_LIGHTS : SMOKE_LIGHTS >> 1;
    camera.getWorldPosition(_look);
    _fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    _look.addScaledVector(_fwd, LOOK_AHEAD);
    const picked = this.picked;
    const w = this.pickW;
    let n = 0;
    for (let li = 0; li < this.lights.length; li++) {
      const l = this.lights[li]!;
      if (!l.visible || !(l.intensity > 0.01) || !l.parent) continue;
      _lp.setFromMatrixPosition(l.matrixWorld);
      const reach = l.distance > 0 ? l.distance : 14;
      const d = _lp.distanceTo(_look);
      if (d > reach + LIGHT_SLACK) continue;
      const gap = Math.max(0, d - reach * 0.4);
      const weight = (l.intensity * reach) / (1 + gap * gap);
      // Insert by weight, strongest first.
      let k = Math.min(n, max);
      if (k === max && weight <= w[max - 1]!) continue;
      if (k === max) k = max - 1;
      while (k > 0 && w[k - 1]! < weight) {
        w[k] = w[k - 1]!;
        picked[k] = picked[k - 1]!;
        k--;
      }
      w[k] = weight;
      picked[k] = l;
      if (n < max) n++;
    }
    for (let i = 0; i < n; i++) {
      const l = picked[i]!;
      _lp.setFromMatrixPosition(l.matrixWorld);
      const k = l.intensity;
      this.field.setLight(i, _lp.x, _lp.y, _lp.z, l.distance > 0 ? l.distance : 14, l.color.r * k, l.color.g * k, l.color.b * k);
      picked[i] = null;
    }
    this.field.setLightCount(n);
  }

  /** Kills everything in flight (scene changes). */
  clear(): void {
    this.field.clear();
    this.lights.length = 0;
    this.lightScan = 0;
    this.field.setLightCount(0);
    this.text?.clear();
  }

  dispose(): void {
    this.unQuality();
    this.scene.remove(this.field.mesh);
    this.field.dispose();
    if (this.text) {
      this.scene.remove(this.text.mesh);
      this.text.dispose();
      this.text = null;
    }
  }
}

/** The sprite sheet, for tooling and checks. */
export function spriteAtlasTexture(): THREE.Texture {
  return spriteAtlas();
}

/** How many cells the sprite sheet holds. */
export const SPRITE_CELLS = ATLAS_CELLS;

/** Every sprite index any emitter layer uses, for the static checks. */
export function emitterSprites(): Array<{ id: string; sprite: number; variants: number }> {
  const out: Array<{ id: string; sprite: number; variants: number }> = [];
  for (const [id, em] of Object.entries(EMITTERS)) for (const l of em.layers) out.push({ id, sprite: l.sprite, variants: l.variants });
  return out;
}

export function emitterIds(): string[] {
  return kitEmitterIds();
}

export function ambientIds(): string[] {
  return kitAmbientIds();
}
