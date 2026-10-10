/**
 * SLAY — the music: recorded tracks per place, menu, death, victory and boss.
 *
 * Callers ask for a key: a scene name ('menu', 'town', 'death'), a biome's
 * music key ('dirge', or a new biome id), a boss's key ('boss.crypt') or
 * 'ambient' for "back to wherever we are". Keys fold onto the tracks that
 * exist through `placeOf`, so a new biome always has music.
 *
 * The victory theme plays once after a boss dies and then the place's own
 * music comes back.
 */

import { events } from '../core/Events';
import type { Rng } from '../types';
import { MUSIC_FILES } from './manifest';
import { placeOf } from './Places';
import { StreamLayer } from './Streams';

/** Scene keys that share a track. */
const SCENE: Record<string, string> = {
  title: 'menu',
  charSelect: 'menu',
  menu: 'menu',
};

/** Boss keys onto the boss tracks that exist. */
const BOSS: Record<string, string> = {
  boss: 'boss.epic',
  'boss.final': 'boss.epic',
  'boss.demon': 'boss.epic',
  'boss.void': 'boss.epic',
  'boss.crypt': 'boss.dread',
  'boss.arcane': 'boss.dread',
  'boss.temple': 'boss.dread',
  'boss.frost': 'boss.dread',
  'boss.hive': 'boss.war',
  'boss.beast': 'boss.war',
  'boss.ooze': 'boss.war',
  'boss.foundry': 'boss.metal',
  'boss.storm': 'boss.metal',
};

/** Played through once rather than looped. */
const ONCE = new Set(['death', 'victory']);

/** Per-track level, so quiet recordings and loud ones sit together. */
const LEVEL: Record<string, number> = {
  menu: 0.9,
  victory: 1,
  death: 0.9,
};

const files = (key: string): string[] => MUSIC_FILES[key] ?? [];

/**
 * The track key a request plays, or null. `strict` refuses the last-resort
 * fallback, which is how tooling tells a real track from a guess.
 */
export function trackFor(key: string, strict = false): string | null {
  if (files(key).length > 0) return key;
  const scene = SCENE[key];
  if (scene && files(scene).length > 0) return scene;
  if (key.startsWith('boss')) {
    const b = BOSS[key] ?? (strict ? null : 'boss.epic');
    return b && files(b).length > 0 ? b : null;
  }
  if (/^(death|victory|danger|ambient)$/.test(key)) return null;
  const place = placeOf(key);
  if (place && files(place).length > 0) return place;
  if (strict) return null;
  return files('crypt').length > 0 ? 'crypt' : null;
}

/** True when `key` names a real track (not the last-resort fallback). */
export function hasTrack(key: string): boolean {
  return trackFor(key, true) !== null;
}

/** Every track with files, for tooling. */
export function musicTracks(): string[] {
  return Object.keys(MUSIC_FILES).filter((k) => files(k).length > 0).sort();
}

/** Owns the music layer and the boss → victory → place flow. */
export class Score {
  private layer: StreamLayer;
  private rng: Rng;
  private current: string | null = null;
  /** The last place track, for 'ambient' and after the victory theme. */
  private placeTrack: string | null = null;
  private victoryUntil = 0;
  private pendingReturn = false;
  private ctx: AudioContext;
  private unsubs: Array<() => void> = [];

  constructor(ctx: AudioContext, dest: AudioNode, rng: Rng) {
    this.ctx = ctx;
    this.rng = rng;
    this.layer = new StreamLayer(ctx, dest);
    this.unsubs.push(
      events.on('boss:killed', () => {
        this.play('victory', 1.2);
        this.victoryUntil = this.ctx.currentTime + 9;
        this.pendingReturn = true;
      }),
    );
  }

  get currentTrack(): string | null {
    return this.current;
  }

  /** Crossfades to the track for `key`. Re-requesting the current one is a no-op. */
  play(key: string, fade = 2): void {
    if (key === 'ambient') {
      if (this.ctx.currentTime < this.victoryUntil) {
        this.pendingReturn = true;
        return;
      }
      key = this.placeTrack ?? 'crypt';
    }
    const track = trackFor(key);
    if (!track) return;
    if (!/^(boss|victory|danger|death|menu)/.test(track)) this.placeTrack = track;
    if (track === 'menu' || track === 'death') this.placeTrack = null;
    this.current = track;
    const once = ONCE.has(track);
    this.layer.play(track, files(track), {
      fade,
      mode: once ? 'once' : 'loop',
      rng: once ? undefined : this.rng,
      overlap: 4,
      gain: LEVEL[track] ?? 0.85,
    });
  }

  stop(fade = 1): void {
    this.current = null;
    this.layer.stop(fade);
  }

  setRunning(running: boolean): void {
    this.layer.setRunning(running);
  }

  /** Volume slider, already squared for a natural taper. */
  setLevel(v: number): void {
    this.layer.setLevel(v);
  }

  tick(): void {
    this.layer.tick();
    if (this.pendingReturn && this.ctx.currentTime >= this.victoryUntil) {
      this.pendingReturn = false;
      if (this.placeTrack) this.play(this.placeTrack, 4);
    }
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.layer.dispose();
  }
}
