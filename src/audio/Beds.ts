/**
 * SLAY — the sound of the place: recorded ambience beds.
 *
 * Music says how to feel; ambience says where you are. Each place gets one or
 * two recorded loops (room tone, wind, water, fire, birds) plus a sparse
 * scatter of recorded one-shots (a drip, a chain settling, a crow, a distant
 * rumble) at random times and random spots around the hero. The scatter is
 * what makes it a place instead of a loop: nothing repeats on a grid.
 */

import type { Rng } from '../types';
import { AMBIENCE_FILES } from './manifest';
import { placeOf, type Place } from './Places';
import { StreamLayer } from './Streams';

interface BedDef {
  /** Ambience folder for the main loop. */
  base: string;
  baseGain: number;
  /** Optional second loop on top. */
  top?: string;
  topGain?: number;
  /** One-shots (bank ids) and how often each comes, per minute on average. */
  events: Array<{ id: string; perMinute: number }>;
  /** Footstep surface for this place. */
  surface: string;
  /** How big the room sounds, 0..1 (reverb return). */
  space: number;
}

const BEDS: Record<Place, BedDef> = {
  town: {
    base: 'wind.soft', baseGain: 0.5, top: 'fire', topGain: 0.35,
    events: [{ id: 'amb.crow', perMinute: 2 }, { id: 'amb.anvil', perMinute: 3 }, { id: 'amb.bird', perMinute: 3 }, { id: 'amb.gust', perMinute: 1.5 }],
    surface: 'dirt', space: 0.15,
  },
  crypt: {
    base: 'dungeon', baseGain: 0.8,
    events: [{ id: 'amb.drip', perMinute: 7 }, { id: 'amb.chain', perMinute: 2 }, { id: 'amb.moan', perMinute: 1 }, { id: 'amb.rumble', perMinute: 1 }, { id: 'amb.stones', perMinute: 1.5 }],
    surface: 'stone', space: 0.75,
  },
  caverns: {
    base: 'cave', baseGain: 0.8,
    events: [{ id: 'amb.drip', perMinute: 16 }, { id: 'amb.rumble', perMinute: 1.5 }, { id: 'amb.stones', perMinute: 2 }, { id: 'amb.gust', perMinute: 0.8 }],
    surface: 'dirt', space: 0.8,
  },
  foundry: {
    base: 'machine', baseGain: 0.55, top: 'fire', topGain: 0.45,
    events: [{ id: 'amb.anvil', perMinute: 5 }, { id: 'amb.hiss', perMinute: 4 }, { id: 'amb.chain', perMinute: 2 }, { id: 'amb.rumble', perMinute: 1.5 }],
    surface: 'metal', space: 0.6,
  },
  temple: {
    base: 'water', baseGain: 0.6, top: 'dungeon', topGain: 0.4,
    events: [{ id: 'amb.lap', perMinute: 8 }, { id: 'amb.drip', perMinute: 10 }, { id: 'amb.whisper', perMinute: 1.5 }],
    surface: 'water', space: 0.85,
  },
  hive: {
    base: 'hive', baseGain: 0.6, top: 'cave', topGain: 0.4,
    events: [{ id: 'amb.buzz', perMinute: 8 }, { id: 'amb.drip', perMinute: 5 }, { id: 'amb.squelch', perMinute: 3 }],
    surface: 'mud', space: 0.5,
  },
  frozen: {
    base: 'wind', baseGain: 0.7,
    events: [{ id: 'amb.creak', perMinute: 4 }, { id: 'amb.gust', perMinute: 4 }, { id: 'amb.shimmer', perMinute: 1.5 }, { id: 'amb.howl', perMinute: 0.8 }],
    surface: 'snow', space: 0.35,
  },
  desert: {
    base: 'wind.desert', baseGain: 0.7,
    events: [{ id: 'amb.gust', perMinute: 5 }, { id: 'amb.stones', perMinute: 1.5 }, { id: 'amb.crow', perMinute: 1 }],
    surface: 'sand', space: 0.1,
  },
  tomb: {
    base: 'dungeon', baseGain: 0.7, top: 'wind.soft', topGain: 0.3,
    events: [{ id: 'amb.stones', perMinute: 2.5 }, { id: 'amb.whisper', perMinute: 1.5 }, { id: 'amb.moan', perMinute: 1 }, { id: 'amb.chain', perMinute: 1 }],
    surface: 'sand', space: 0.8,
  },
  void: {
    base: 'void', baseGain: 0.6, top: 'dungeon', topGain: 0.3,
    events: [{ id: 'amb.shimmer', perMinute: 4 }, { id: 'amb.whisper', perMinute: 2.5 }, { id: 'amb.moan', perMinute: 1.2 }],
    surface: 'stone', space: 0.9,
  },
  forest: {
    base: 'forest', baseGain: 0.8, top: 'wind.soft', topGain: 0.35,
    events: [{ id: 'amb.bird', perMinute: 4 }, { id: 'amb.crow', perMinute: 2 }, { id: 'amb.creak', perMinute: 2 }, { id: 'amb.howl', perMinute: 0.6 }],
    surface: 'grass', space: 0.15,
  },
  swamp: {
    base: 'swamp', baseGain: 0.8,
    events: [{ id: 'amb.lap', perMinute: 4 }, { id: 'amb.squelch', perMinute: 3 }, { id: 'amb.crow', perMinute: 1.5 }, { id: 'amb.buzz', perMinute: 2 }],
    surface: 'mud', space: 0.2,
  },
  hell: {
    base: 'fire', baseGain: 0.6, top: 'rumble', topGain: 0.6,
    events: [{ id: 'amb.rumble', perMinute: 3 }, { id: 'amb.crackle', perMinute: 6 }, { id: 'amb.moan', perMinute: 1.2 }, { id: 'amb.hiss', perMinute: 2 }],
    surface: 'ash', space: 0.45,
  },
};

/** The bed a music track or biome key implies, or null for one that should be silent. */
export function bedFor(key: string): Place | null {
  if (/^(menu|title|charSelect|death|victory)$/.test(key)) return null;
  return placeOf(key) ?? (key.startsWith('boss') || key === 'ambient' || key === 'danger' ? null : 'crypt');
}

export function bedIds(): string[] {
  return Object.keys(BEDS);
}

export function bedDef(id: string): { surface: string; events: string[]; loops: string[] } | null {
  const b = BEDS[id as Place];
  if (!b) return null;
  return { surface: b.surface, events: b.events.map((e) => e.id), loops: b.top ? [b.base, b.top] : [b.base] };
}

/** Plays one ambience event: a bank id at a spot around the listener. */
export type AmbientShot = (id: string, dx: number, dz: number, volume: number) => void;

/** Owns the two loop layers and the one-shot scatter. */
export class Beds {
  private ctx: AudioContext;
  private base: StreamLayer;
  private top: StreamLayer;
  private out: GainNode;
  private rng: Rng;
  private shot: AmbientShot;
  private live: Place | null = null;
  private nextAt = new Map<string, number>();
  private level = 1;
  private duck = 1;

  constructor(ctx: AudioContext, dest: AudioNode, rng: Rng, shot: AmbientShot) {
    this.ctx = ctx;
    this.rng = rng;
    this.shot = shot;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.base = new StreamLayer(ctx, this.out);
    this.top = new StreamLayer(ctx, this.out);
  }

  /** The place now sounding. */
  get place(): Place | null {
    return this.live;
  }

  /** The floor material under the hero. */
  get surface(): string {
    return this.live ? BEDS[this.live].surface : 'stone';
  }

  /** Reverb size for the current place, 0..1. */
  get space(): number {
    return this.live ? BEDS[this.live].space : 0.4;
  }

  play(place: Place | null, fade = 2.5): void {
    if (place === this.live) return;
    this.live = place;
    this.nextAt.clear();
    if (!place) {
      this.base.stop(fade);
      this.top.stop(fade);
      return;
    }
    const def = BEDS[place];
    const loop = (layer: StreamLayer, key: string | undefined, gain: number): void => {
      const files = key ? AMBIENCE_FILES[key] ?? [] : [];
      if (!key || files.length === 0) layer.stop(fade);
      else layer.play(`${place}:${key}`, files, { fade, mode: 'loop', rng: this.rng, overlap: 4, gain, startAt: this.rng.range(0, 0.7) });
    };
    loop(this.base, def.base, def.baseGain);
    loop(this.top, def.top, def.topGain ?? 0.4);
    // Stagger the first of each event so a new place does not open with all of them at once.
    const now = this.ctx.currentTime;
    for (const e of def.events) this.nextAt.set(e.id, now + this.rng.range(1.5, 60 / Math.max(0.2, e.perMinute)));
  }

  stop(fade = 1.5): void {
    this.play(null, fade);
  }

  setRunning(running: boolean): void {
    this.base.setRunning(running);
    this.top.setRunning(running);
  }

  /** Effects slider level for the loops. */
  setLevel(v: number): void {
    this.level = v;
    this.apply();
  }

  /** 0..1 how much fighting is going on; loops sink a little under combat. */
  setCombat(v: number): void {
    this.duck = 1 - 0.35 * Math.max(0, Math.min(1, v));
    this.apply();
  }

  private apply(): void {
    this.out.gain.setTargetAtTime(this.level * this.duck, this.ctx.currentTime, 0.6);
  }

  tick(): void {
    this.base.tick();
    this.top.tick();
    const place = this.live;
    if (!place) return;
    const now = this.ctx.currentTime;
    for (const e of BEDS[place].events) {
      const at = this.nextAt.get(e.id) ?? now;
      if (now < at) continue;
      // Exponential gaps: the scatter of a real place, not a metronome.
      const mean = 60 / Math.max(0.1, e.perMinute);
      this.nextAt.set(e.id, now + Math.max(1.2, -Math.log(1 - this.rng.next()) * mean));
      const ang = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(5, 18);
      this.shot(e.id, Math.cos(ang) * dist, Math.sin(ang) * dist, this.rng.range(0.55, 1));
    }
  }

  dispose(): void {
    this.base.dispose();
    this.top.dispose();
    this.out.disconnect();
  }
}
