/**
 * SLAY — lingering spell fields: burning ground, a blizzard, a crawling storm,
 * a poison cloud, a smoke screen, a pool of night. Each is a living floor glow
 * the size of the field plus its own particles rising, falling or creeping
 * over it for as long as the field lasts, then fading out.
 *
 * Fields used to draw as a summoning circle (a rune ring, a light column,
 * rising runes and skulls), whatever they were. The look now follows what
 * the field is (`FieldLook` in `fx/SkillLooks.ts`); its size and life are
 * the skill's own numbers.
 *
 * Pooled: no allocation per frame. Emission scales with the area, the quality
 * (`fxScale`) and, on High and above, the skill's rank; on Low and Medium a
 * field spawns fewer particles than the summoning circle it replaced.
 */
import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import type { Rng } from '../types';
import type { FXSystem } from './Particles';
import type { DecalSystem } from './Decals';
import type { School } from './kit/Palette';
import type { GroundHandle, GroundKind } from './kit/Ground';
import { fieldLook, rankDensity, type FieldLook } from './SkillLooks';
import './Grit';

export interface FieldOpts {
  school: School;
  /** A caller's colour for the floor glow (the particles keep their curated colours). */
  color?: number;
  /** The skill casting it, for its own look. */
  skill?: string;
  rank?: number;
}

/** One stream of particles over a field. */
interface Stream {
  id: string;
  /** Bursts per second for a 3 m radius field at quality 1. */
  rate: number;
  /** Height of the burst above the floor. */
  y: number;
  /** Count passed to the burst (12 = as authored). */
  count: number;
  /** Fired straight down (snow, cinders). */
  down?: boolean;
  /** Spawn inside this share of the radius (1 = the whole disc). */
  reach?: number;
}

interface Spec {
  glow: GroundKind | null;
  glowEmit: number;
  /** A dark mark left where the field burned (life from the mark's own style). */
  mark: string | null;
  streams: Stream[];
}

const SPECS: Record<FieldLook, Spec> = {
  fire: {
    glow: 'firePool', glowEmit: 1.5, mark: 'scorch',
    streams: [
      { id: 'field.flames', rate: 7, y: 0.05, count: 12 },
      { id: 'field.soot', rate: 1.6, y: 0.3, count: 12 },
    ],
  },
  firestorm: {
    glow: 'firePool', glowEmit: 1.6, mark: 'scorch',
    streams: [
      { id: 'field.flames', rate: 5, y: 0.05, count: 12 },
      { id: 'field.cinderfall', rate: 6, y: 5.5, count: 12, down: true },
      { id: 'field.soot', rate: 1.2, y: 0.3, count: 12 },
    ],
  },
  frost: {
    glow: 'frostField', glowEmit: 1.2, mark: 'rime',
    streams: [
      { id: 'field.rime', rate: 4, y: 0.1, count: 12 },
      { id: 'field.glitter', rate: 4, y: 0.2, count: 12 },
    ],
  },
  blizzard: {
    glow: 'frostField', glowEmit: 1.3, mark: 'rime',
    streams: [
      { id: 'field.snowfall', rate: 9, y: 5, count: 12, down: true },
      { id: 'field.rime', rate: 3, y: 0.1, count: 12 },
    ],
  },
  storm: {
    glow: 'stormField', glowEmit: 1.6, mark: null,
    streams: [
      { id: 'field.crawl', rate: 7, y: 0.15, count: 12 },
    ],
  },
  pillar: {
    glow: 'stormField', glowEmit: 1.8, mark: 'fork',
    streams: [
      { id: 'field.crawl', rate: 5, y: 0.15, count: 12 },
      { id: 'field.strike', rate: 3, y: 0.1, count: 12, reach: 0.7 },
    ],
  },
  venom: {
    glow: 'poisonPool', glowEmit: 1.3, mark: 'acid',
    streams: [
      { id: 'field.miasma', rate: 3.5, y: 0.25, count: 12 },
      { id: 'field.bubbles', rate: 4, y: 0.05, count: 12 },
    ],
  },
  smoke: {
    glow: null, glowEmit: 0, mark: 'ash',
    streams: [
      { id: 'field.smoke', rate: 4.5, y: 0.3, count: 12 },
    ],
  },
  void: {
    glow: 'voidPool', glowEmit: 1.2, mark: null,
    streams: [
      { id: 'field.dark', rate: 3.5, y: 0.2, count: 12 },
      { id: 'field.motes', rate: 4, y: 0.1, count: 12 },
    ],
  },
  bone: {
    glow: 'auraRing', glowEmit: 1.0, mark: null,
    streams: [
      { id: 'field.dust', rate: 2.5, y: 0.1, count: 12 },
      { id: 'field.rattle', rate: 3, y: 0.1, count: 12, reach: 1 },
    ],
  },
  dust: {
    glow: 'auraRing', glowEmit: 0.9, mark: 'dust',
    streams: [
      { id: 'field.dust', rate: 3, y: 0.1, count: 12 },
    ],
  },
};

/** Every particle id a field may fire, for checks and warm-ups. */
export const FIELD_EMITTERS: readonly string[] = [...new Set(Object.values(SPECS).flatMap((s) => s.streams.map((t) => t.id)))];

/** Live fields at once (the skill runner caps its own at 12). */
const CAP = 16;

class Field {
  active = false;
  gen = 0;
  stopped = false;
  x = 0;
  z = 0;
  radius = 0;
  dur = 0;
  t = 0;
  school: School = 'physical';
  spec: Spec = SPECS.dust;
  /** Bursts owed per stream. */
  acc = [0, 0, 0];
  /** Multiplier on every stream's rate (area, quality, rank). */
  rate = 1;
  ground: GroundHandle | null = null;
}

class Handle {
  constructor(private f: Field, private gen: number) {}
  stop(): void {
    if (this.f.gen === this.gen && this.f.active) this.f.stopped = true;
  }
  get done(): boolean {
    return this.f.gen !== this.gen || !this.f.active;
  }
}

const _down = new THREE.Vector3(0.18, -1, 0.1);

export class FieldPool {
  private fields: Field[] = [];

  constructor(private fx: FXSystem, private decals: DecalSystem, private quality: QualityProfile, private rng: Rng) {
    for (let i = 0; i < CAP; i++) this.fields.push(new Field());
  }

  /** Lays a field down; `stop()` on the handle fades it out early. */
  start(x: number, z: number, radius: number, duration: number, opts: FieldOpts): { stop(): void; readonly done: boolean } {
    let f = this.fields.find((q) => !q.active);
    if (!f) {
      // Full: the oldest gives way.
      f = this.fields.reduce((a, b) => (b.t > a.t ? b : a));
      this.end(f);
    }
    const spec = SPECS[fieldLook(opts.skill, opts.school)];
    f.active = true;
    f.gen = (f.gen + 1) | 0;
    f.stopped = false;
    f.x = x;
    f.z = z;
    f.radius = radius;
    f.dur = duration;
    f.t = 0;
    f.school = opts.school;
    f.spec = spec;
    f.acc[0] = f.acc[1] = f.acc[2] = 0;
    const q = this.quality.fxScale;
    const area = Math.max(0.5, Math.min(3, (radius * radius) / 9));
    // Fewer, not just thinner, bursts on the lower qualities.
    const quality = q >= 0.9 ? 1 : q >= 0.5 ? 0.75 : 0.55;
    const rank = q >= 0.9 ? rankDensity(opts.rank ?? 1) : 1;
    f.rate = area * quality * rank;
    f.ground = spec.glow ? this.decals.glow(spec.glow, x, z, radius, duration, opts.color ?? opts.school, spec.glowEmit) : null;
    if (spec.mark) this.decals.add(spec.mark, x, z, radius * 0.8);
    return new Handle(f, f.gen);
  }

  update(dt: number): void {
    for (const f of this.fields) {
      if (!f.active) continue;
      f.t += dt;
      if (f.stopped || f.t >= f.dur) {
        this.end(f);
        continue;
      }
      // Particles thin out over the last moments, as the glow fades.
      const tail = Math.min(1, (f.dur - f.t) / 0.6);
      const streams = f.spec.streams;
      for (let i = 0; i < streams.length && i < 3; i++) {
        const s = streams[i]!;
        f.acc[i] = f.acc[i]! + dt * s.rate * f.rate * tail;
        // At most a few bursts a frame, whatever a long frame owed.
        let n = 0;
        while (f.acc[i]! >= 1 && n < 4) {
          f.acc[i] = f.acc[i]! - 1;
          n++;
          const a = this.rng.next() * Math.PI * 2;
          const r = Math.sqrt(this.rng.next()) * f.radius * (s.reach ?? 0.92);
          const px = f.x + Math.cos(a) * r;
          const pz = f.z + Math.sin(a) * r;
          // Falling streams start up-wind, so they land inside the field.
          const ox = s.down ? -_down.x * s.y : 0;
          const oz = s.down ? -_down.z * s.y : 0;
          this.fx.burst(s.id, px + ox, this.decals.floorY(px, pz) + s.y, pz + oz, { count: s.count, dir: s.down ? _down : undefined, school: f.school });
        }
        if (n >= 4) f.acc[i] = 0;
      }
    }
  }

  private end(f: Field): void {
    // A field that ran its time has a glow that already faded with it; one
    // cut short takes its glow with it.
    if (f.ground && f.t < f.dur) this.decals.glows.end(f.ground);
    f.ground = null;
    f.active = false;
    f.gen = (f.gen + 1) | 0;
  }

  clear(): void {
    for (const f of this.fields) if (f.active) this.end(f);
  }
}
