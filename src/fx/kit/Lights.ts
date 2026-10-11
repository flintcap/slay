/**
 * SLAY vfx kit: light. What makes a spell part of the room instead of a
 * sticker on the screen is that it lights the walls and the floor around it.
 *
 * A fixed pool of point lights is created once and never removed or hidden:
 * three.js compiles shaders per light count, so changing the count (adding,
 * removing or hiding a light) would recompile every material in the dungeon.
 * Idle lights sit at zero intensity.
 *
 * Two uses:
 *  - `flash`: a snap of light that dies on a quadratic curve (impacts, casts).
 *  - `hold`: a light that follows something (a fireball in flight, a burning
 *    zone) until released. Holds lose to brighter flashes when the pool is
 *    full, so a big explosion always gets its light.
 */

import * as THREE from 'three';

interface Slot {
  light: THREE.PointLight;
  /** Seconds left of a flash, or of a hold's fade-out. */
  left: number;
  total: number;
  peak: number;
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

  constructor(scene: THREE.Scene, count: number) {
    this.scene = scene;
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 8, 2);
      light.castShadow = false;
      light.name = 'fx:light';
      scene.add(light);
      this.slots.push({ light, left: 0, total: 1, peak: 0, gen: 0, holding: false, flicker: 0, phase: i * 1.7 });
    }
  }

  get size(): number {
    return this.slots.length;
  }

  /** Share of the pool lit right now, 0..1. */
  get busy(): number {
    let n = 0;
    for (const s of this.slots) if (s.left > 0 || s.holding) n++;
    return this.slots.length ? n / this.slots.length : 1;
  }

  private pick(intensity: number): Slot | null {
    let best: Slot | null = null;
    let bestScore = Infinity;
    for (const s of this.slots) {
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

  /** A one-shot flash. Colour is sRGB hex. */
  flash(x: number, y: number, z: number, color: number, intensity: number, distance: number, duration: number): void {
    const s = this.pick(intensity);
    if (!s) return;
    s.gen++;
    s.holding = false;
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.position.set(x, y, z);
    s.peak = intensity;
    s.left = Math.max(0.02, duration);
    s.total = s.left;
    s.light.intensity = intensity;
  }

  /** A light that stays until released. Returns null when the pool is full of brighter light. */
  hold(x: number, y: number, z: number, color: number, intensity: number, distance: number, flicker = 0): LightHandle | null {
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
    s.peak = intensity;
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
