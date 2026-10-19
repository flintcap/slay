/**
 * SLAY vfx kit: light. What makes a spell part of the room instead of a
 * sticker on the screen is that it lights the walls and the floor around it.
 *
 * A fixed pool of point lights is created once and never removed or hidden.
 * They cast no shadow, so they are packed lights (`core/Lighting.ts`): their
 * count never changes a shader and a parked one costs a pixel nothing. Idle
 * lights sit at zero intensity. The quality sets how many may be lit at once
 * (`QualityProfile.fxLights`), so a big fight's hits each light the floor.
 *
 * A flash beside one still bright joins it rather than taking a light of its
 * own: twenty hits on one spot light it as one brighter blaze.
 *
 * A skill drawn at a high rank lights a little brighter and wider
 * (`Boost.ts`).
 *
 * Two uses:
 *  - `flash`: a snap of light that dies on a quadratic curve (impacts, casts).
 *  - `hold`: a light that follows something (a fireball in flight, a burning
 *    zone) until released. Holds lose to brighter flashes when the pool is
 *    full, so a big explosion always gets its light.
 */

import * as THREE from 'three';
import { BOOST } from './Boost';

/** Most lights a pool holds (Ultra's `fxLights`). */
export const MAX_FX_LIGHTS = 24;
/** A flash this share of its reach from a bright one joins it. */
const JOIN = 0.4;
/** A joined flash grows to at most this many times the brighter of the two. */
const JOIN_CAP = 2.5;

const _c = new THREE.Color();

interface Slot {
  light: THREE.PointLight;
  /** Seconds left of a flash, or of a hold's fade-out. */
  left: number;
  total: number;
  peak: number;
  /** The brightest single flash joined into this one (caps how far joins grow it). */
  base: number;
  /** Generation stamp so stale hold handles do nothing. */
  gen: number;
  holding: boolean;
  /** Flicker amount for holds (fire flickers, arcane does not). */
  flicker: number;
  phase: number;
}

export interface LightHandle {
  readonly slot: number;
  readonly gen: number;
}

export class LightPool {
  private slots: Slot[] = [];
  private scene: THREE.Scene;
  private time = 0;
  /** Lights that may be lit (the quality's), the first of `slots`. */
  private limit: number;

  constructor(scene: THREE.Scene, count: number, limit = count) {
    this.scene = scene;
    this.limit = Math.max(1, Math.min(count, limit));
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 8, 2);
      light.castShadow = false;
      light.name = 'fx:light';
      scene.add(light);
      this.slots.push({ light, left: 0, total: 1, peak: 0, base: 0, gen: 0, holding: false, flicker: 0, phase: i * 1.7 });
    }
  }

  /** Lights that may be lit at once. */
  get size(): number {
    return this.limit;
  }

  /** Sets how many lights may be lit at once (the quality's); the rest go dark. */
  setLimit(n: number): void {
    this.limit = Math.max(1, Math.min(this.slots.length, Math.round(n)));
    for (let i = this.limit; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      s.gen++;
      s.holding = false;
      s.left = 0;
      s.light.intensity = 0;
    }
  }

  /** Share of the usable pool lit right now, 0..1. */
  get busy(): number {
    let n = 0;
    for (let i = 0; i < this.limit; i++) {
      const s = this.slots[i]!;
      if (s.left > 0 || s.holding) n++;
    }
    return this.limit ? n / this.limit : 1;
  }

  private pick(intensity: number): Slot | null {
    let best: Slot | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < this.limit; i++) {
      const s = this.slots[i]!;
      const score = s.holding ? s.peak * 0.9 : s.left <= 0 ? -1 : s.peak * (s.left / s.total);
      if (score < bestScore) {
        bestScore = score;
        best = s;
        if (score < 0) break;
      }
    }
    if (!best) return null;
    if (bestScore > 0 && bestScore >= intensity * 0.9) return null;
    return best;
  }

  /** A flash still lit within `reach` of the point, the nearest. */
  private near(x: number, y: number, z: number, reach: number): Slot | null {
    let best: Slot | null = null;
    let bestD = reach * reach;
    for (let i = 0; i < this.limit; i++) {
      const s = this.slots[i]!;
      if (s.holding || s.left <= 0 || s.left < s.total * 0.35) continue;
      const p = s.light.position;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** A one-shot flash. Colour is sRGB hex. */
  flash(x: number, y: number, z: number, color: number, intensity: number, distance: number, duration: number): void {
    intensity *= BOOST.glow;
    distance *= Math.sqrt(BOOST.size);
    const m = this.near(x, y, z, distance * JOIN);
    if (m) {
      // Joins the bright flash beside it: brighter, as long as the longer of
      // the two, leaning toward the newer in place and colour.
      const t = m.left / m.total;
      const now = m.peak * t * t;
      const hi = Math.max(now, intensity);
      m.base = Math.max(m.base, intensity);
      m.peak = Math.min(hi + 0.35 * Math.min(now, intensity), JOIN_CAP * m.base);
      m.left = m.total = Math.max(m.left, duration, 0.02);
      m.light.distance = Math.max(m.light.distance, distance);
      const w = intensity / (now + intensity || 1);
      m.light.position.x += (x - m.light.position.x) * w * 0.5;
      m.light.position.y += (y - m.light.position.y) * w * 0.5;
      m.light.position.z += (z - m.light.position.z) * w * 0.5;
      m.light.color.lerp(_c.setHex(color), w);
      m.light.intensity = m.peak;
      return;
    }
    const s = this.pick(intensity);
    if (!s) return;
    s.gen++;
    s.holding = false;
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.position.set(x, y, z);
    s.peak = intensity;
    s.base = intensity;
    s.left = Math.max(0.02, duration);
    s.total = s.left;
    s.light.intensity = intensity;
  }

  /** A light that stays until released. Returns null when the pool is full of brighter light. */
  hold(x: number, y: number, z: number, color: number, intensity: number, distance: number, flicker = 0): LightHandle | null {
    intensity *= BOOST.glow;
    distance *= Math.sqrt(BOOST.size);
    const s = this.pick(intensity);
    if (!s) return null;
    s.gen++;
    s.holding = true;
    s.flicker = flicker;
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.position.set(x, y, z);
    s.peak = intensity;
    s.left = 0;
    s.light.intensity = intensity;
    return { slot: this.slots.indexOf(s), gen: s.gen };
  }

  move(h: LightHandle | null, x: number, y: number, z: number): void {
    if (!h) return;
    const s = this.slots[h.slot];
    if (!s || s.gen !== h.gen || !s.holding) return;
    s.light.position.set(x, y, z);
  }

  /** Changes a hold's brightness (0 keeps the slot but dark). */
  set(h: LightHandle | null, intensity: number): void {
    if (!h) return;
    const s = this.slots[h.slot];
    if (!s || s.gen !== h.gen || !s.holding) return;
    s.peak = intensity * BOOST.glow;
  }

  /** Lets a hold go, fading over `fade` seconds. */
  release(h: LightHandle | null, fade = 0.12): void {
    if (!h) return;
    const s = this.slots[h.slot];
    if (!s || s.gen !== h.gen || !s.holding) return;
    s.holding = false;
    s.left = Math.max(0.02, fade);
    s.total = s.left;
  }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.slots) {
      if (s.holding) {
        const f = s.flicker > 0 ? 1 - s.flicker * (0.5 + 0.5 * Math.sin(this.time * 23 + s.phase) * Math.sin(this.time * 7.3 + s.phase * 2)) : 1;
        s.light.intensity = s.peak * f;
        continue;
      }
      if (s.left <= 0) continue;
      s.left -= dt;
      if (s.left <= 0) {
        s.left = 0;
        s.light.intensity = 0;
        continue;
      }
      const t = s.left / s.total;
      s.light.intensity = s.peak * t * t;
    }
  }

  clear(): void {
    for (const s of this.slots) {
      s.gen++;
      s.holding = false;
      s.left = 0;
      s.light.intensity = 0;
    }
  }

  dispose(): void {
    for (const s of this.slots) this.scene.remove(s.light);
    this.slots.length = 0;
  }
}
