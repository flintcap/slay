/**
 * SLAY — procedural adaptive music.
 *
 * The goal here is not "generative noise that fills silence". It is a score
 * you could leave running for an hour. Three things make that possible:
 *
 *  1. **Real harmony.** Every track picks a mode (aeolian, phrygian, dorian —
 *     the three that read as "dark fantasy" without sounding like a horror
 *     stinger) and a fixed four-chord progression. Nothing is chosen at random
 *     at play time; randomness happens once, at track construction, to derive a
 *     motif, and that motif then *repeats*. Repetition is what makes music
 *     sound composed rather than sampled from a dice roll.
 *
 *  2. **Layers, not tracks.** Each mood is a stack — drone, pad, bass, arp,
 *     percussion, lead, bells — and each layer has an intensity threshold.
 *     Walking an empty corridor you hear drone and pad; a pack aggros and the
 *     bass and percussion slide in underneath; the fight ends and they leave.
 *     Nothing restarts, nothing crossfades, the same bar just gets fuller.
 *
 *  3. **Long form.** An eight-bar section counter mutes and transposes layers
 *     so the loop breathes instead of nagging.
 *
 * Scheduling uses the standard lookahead pattern: a timer wakes ~20x a second
 * and schedules every note that falls inside the next 400ms directly on the
 * WebAudio clock, so tempo never drifts with the frame rate.
 */

import { events } from '../core/Events';
import { Random } from '../core/RNG';
import type { Rng } from '../types';
import { Synth, midiToFreq } from './Synth';

// ---------------------------------------------------------------------------
// Theory
// ---------------------------------------------------------------------------

const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
} as const;

type ScaleName = keyof typeof SCALES;

/** Maps a scale degree (which may be negative or > 6) to a MIDI note. */
function scaleNote(root: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + scale[idx]!;
}

type LayerName = 'drone' | 'pad' | 'bass' | 'arp' | 'perc' | 'lead' | 'bell' | 'air';

type PercStyle = 'none' | 'soft' | 'tribal' | 'industrial' | 'war' | 'pulse';

interface TrackDef {
  bpm: number;
  /** MIDI root of the tonic. */
  root: number;
  scale: ScaleName;
  /** Scale degrees of the chord roots, one entry per harmonic slot. */
  progression: number[];
  barsPerChord: number;
  layers: LayerName[];
  /** Per-layer volume trim. */
  gain: Partial<Record<LayerName, number>>;
  /** Intensity at which each layer starts to appear. */
  gate: Partial<Record<LayerName, number>>;
  perc: PercStyle;
  /** Reverb send for the whole track. */
  space: number;
  /** Pad brightness in Hz. */
  cutoff: number;
  /** Detune spread in cents; wide = unsettling, narrow = clean. */
  spread: number;
  /** Seed for the motif and any structural variation. */
  seed: number;
  /** Waveform for the melodic lead. */
  leadWave: OscillatorType;
  /** Extra character: ring-modulated lead, noise wind bed, metallic bells. */
  flavor?: 'ring' | 'wind' | 'metal' | 'glass' | 'choir';
}

const T = (d: TrackDef): TrackDef => d;

/**
 * The score. Each biome gets a mode and a tempo chosen so the eight tracks
 * sound like one composer wrote them: minor modes, slow-to-mid tempi, and a
 * shared preference for open fifths over crowded triads.
 */
const TRACKS: Record<string, TrackDef> = {
  menu: T({
    bpm: 54, root: 50, scale: 'aeolian', progression: [0, 5, 3, 4], barsPerChord: 2,
    layers: ['drone', 'pad', 'bell', 'air'],
    gain: { drone: 0.5, pad: 0.42, bell: 0.3, air: 0.2 },
    gate: {},
    perc: 'none', space: 0.55, cutoff: 900, spread: 12, seed: 0x11e0, leadWave: 'sine', flavor: 'choir',
  }),
  town: T({
    bpm: 74, root: 55, scale: 'dorian', progression: [0, 4, 5, 3], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead', 'bell'],
    gain: { drone: 0.34, pad: 0.4, bass: 0.32, arp: 0.22, lead: 0.26, bell: 0.2 },
    gate: { arp: 0.1, lead: 0.2 },
    perc: 'soft', space: 0.4, cutoff: 1500, spread: 9, seed: 0x70b1, leadWave: 'triangle',
  }),
  death: T({
    bpm: 44, root: 48, scale: 'phrygian', progression: [0, 1, 0, 6], barsPerChord: 4,
    layers: ['drone', 'pad', 'bell'],
    gain: { drone: 0.6, pad: 0.45, bell: 0.22 },
    gate: {},
    perc: 'none', space: 0.85, cutoff: 620, spread: 22, seed: 0xdead, leadWave: 'sine', flavor: 'choir',
  }),
  victory: T({
    bpm: 92, root: 55, scale: 'dorian', progression: [0, 3, 4, 0], barsPerChord: 1,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead', 'bell'],
    gain: { drone: 0.3, pad: 0.4, bass: 0.34, arp: 0.26, lead: 0.34, bell: 0.3 },
    gate: {},
    perc: 'war', space: 0.4, cutoff: 2200, spread: 8, seed: 0x1c70, leadWave: 'sawtooth',
  }),

  // --- biomes --------------------------------------------------------------
  dirge: T({ // crypt
    bpm: 60, root: 45, scale: 'aeolian', progression: [0, 5, 2, 6], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead', 'bell'],
    gain: { drone: 0.5, pad: 0.4, bass: 0.32, arp: 0.18, lead: 0.24, bell: 0.18 },
    gate: { bass: 0.12, arp: 0.35, perc: 0.4, lead: 0.55 },
    perc: 'soft', space: 0.62, cutoff: 800, spread: 14, seed: 0xc247, leadWave: 'sine', flavor: 'choir',
  }),
  drip: T({ // caverns
    bpm: 56, root: 52, scale: 'dorian', progression: [0, 6, 3, 5], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'bell', 'air', 'lead'],
    gain: { drone: 0.46, pad: 0.36, bass: 0.28, bell: 0.26, air: 0.18, lead: 0.2 },
    gate: { bass: 0.15, bell: 0, perc: 0.5, lead: 0.6 },
    perc: 'tribal', space: 0.72, cutoff: 760, spread: 16, seed: 0xcave, leadWave: 'triangle', flavor: 'glass',
  }),
  forge: T({ // foundry
    bpm: 96, root: 40, scale: 'phrygian', progression: [0, 1, 0, 4], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead'],
    gain: { drone: 0.42, pad: 0.3, bass: 0.4, arp: 0.24, lead: 0.24 },
    gate: { bass: 0.05, arp: 0.25, perc: 0.15, lead: 0.5 },
    perc: 'industrial', space: 0.35, cutoff: 1200, spread: 20, seed: 0xf02e, leadWave: 'sawtooth', flavor: 'metal',
  }),
  submerged: T({ // sunken temple
    bpm: 50, root: 47, scale: 'aeolian', progression: [0, 3, 6, 5], barsPerChord: 4,
    layers: ['drone', 'pad', 'bell', 'air', 'lead'],
    gain: { drone: 0.5, pad: 0.44, bell: 0.28, air: 0.22, lead: 0.2 },
    gate: { bell: 0, lead: 0.45, perc: 0.6 },
    perc: 'none', space: 0.9, cutoff: 640, spread: 26, seed: 0x5ub3, leadWave: 'sine', flavor: 'choir',
  }),
  chitter: T({ // hive
    bpm: 108, root: 41, scale: 'phrygian', progression: [0, 1, 5, 1], barsPerChord: 1,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead'],
    gain: { drone: 0.4, pad: 0.26, bass: 0.34, arp: 0.28, lead: 0.22 },
    gate: { bass: 0.1, arp: 0.2, perc: 0.25, lead: 0.55 },
    perc: 'tribal', space: 0.45, cutoff: 1400, spread: 24, seed: 0xb175, leadWave: 'square', flavor: 'ring',
  }),
  glacial: T({ // frostvault
    bpm: 58, root: 49, scale: 'aeolian', progression: [0, 5, 4, 6], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'bell', 'air', 'lead'],
    gain: { drone: 0.44, pad: 0.4, bass: 0.26, bell: 0.32, air: 0.2, lead: 0.22 },
    gate: { bass: 0.18, perc: 0.45, lead: 0.5 },
    perc: 'soft', space: 0.8, cutoff: 2600, spread: 7, seed: 0x1ce0, leadWave: 'triangle', flavor: 'glass',
  }),
  windswept: T({ // ashwaste
    bpm: 68, root: 50, scale: 'dorian', progression: [0, 6, 4, 5], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'air', 'lead', 'arp'],
    gain: { drone: 0.46, pad: 0.38, bass: 0.3, air: 0.28, lead: 0.24, arp: 0.16 },
    gate: { bass: 0.15, arp: 0.4, perc: 0.35, lead: 0.5 },
    perc: 'tribal', space: 0.68, cutoff: 1000, spread: 18, seed: 0xa5b0, leadWave: 'sawtooth', flavor: 'wind',
  }),
  null: T({ // voidspire
    bpm: 64, root: 42, scale: 'harmonicMinor', progression: [0, 4, 1, 0], barsPerChord: 2,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead', 'bell'],
    gain: { drone: 0.52, pad: 0.34, bass: 0.32, arp: 0.2, lead: 0.26, bell: 0.2 },
    gate: { bass: 0.1, arp: 0.3, perc: 0.35, lead: 0.45 },
    perc: 'pulse', space: 0.75, cutoff: 900, spread: 30, seed: 0x0v01, leadWave: 'sawtooth', flavor: 'ring',
  }),

  // --- states --------------------------------------------------------------
  boss: T({
    bpm: 128, root: 38, scale: 'phrygian', progression: [0, 0, 1, 6], barsPerChord: 1,
    layers: ['drone', 'pad', 'bass', 'arp', 'lead'],
    gain: { drone: 0.42, pad: 0.32, bass: 0.46, arp: 0.28, lead: 0.34 },
    gate: {},
    perc: 'war', space: 0.4, cutoff: 1600, spread: 16, seed: 0xb055, leadWave: 'sawtooth',
  }),
  danger: T({
    bpm: 104, root: 45, scale: 'aeolian', progression: [0, 0, 6, 5], barsPerChord: 1,
    layers: ['drone', 'pad', 'bass', 'arp'],
    gain: { drone: 0.4, pad: 0.28, bass: 0.4, arp: 0.24 },
    gate: { arp: 0.3 },
    perc: 'pulse', space: 0.45, cutoff: 1200, spread: 14, seed: 0xda67, leadWave: 'square',
  }),
};

// Fallbacks so an unrecognised biome track still plays something appropriate.
TRACKS['crypt'] = TRACKS['dirge']!;
TRACKS['caverns'] = TRACKS['drip']!;
TRACKS['foundry'] = TRACKS['forge']!;
TRACKS['sunkenTemple'] = TRACKS['submerged']!;
TRACKS['hive'] = TRACKS['chitter']!;
TRACKS['frostvault'] = TRACKS['glacial']!;
TRACKS['ashwaste'] = TRACKS['windswept']!;
TRACKS['voidspire'] = TRACKS['null']!;
TRACKS['title'] = TRACKS['menu']!;
TRACKS['charSelect'] = TRACKS['menu']!;
TRACKS['dungeon'] = TRACKS['dirge']!;

// ---------------------------------------------------------------------------
// Percussion patterns (16 steps = one bar of 16ths)
// ---------------------------------------------------------------------------

interface PercPattern {
  kick: number[];
  snare: number[];
  hat: number[];
  tom: number[];
}

const PERC: Record<PercStyle, PercPattern> = {
  none: { kick: [], snare: [], hat: [], tom: [] },
  soft: { kick: [0, 10], snare: [8], hat: [4, 12], tom: [] },
  tribal: { kick: [0, 6, 10], snare: [], hat: [2, 5, 9, 13], tom: [8, 14] },
  industrial: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], tom: [7] },
  war: { kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], tom: [14, 15] },
  pulse: { kick: [0, 8], snare: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], tom: [] },
};

// ---------------------------------------------------------------------------
// Motif
// ---------------------------------------------------------------------------

interface MotifNote {
  /** 16th-note position within a two-bar phrase (0..31). */
  step: number;
  /** Chord-tone index offset. */
  degree: number;
  /** Length in 16ths. */
  len: number;
}

/**
 * Builds a short melodic cell once per track. Notes land on strong beats,
 * move mostly by step, and leave rests — the three rules that separate a
 * melody from a sequence of pitches.
 */
function buildMotif(rng: Rng): MotifNote[] {
  const out: MotifNote[] = [];
  const strong = [0, 4, 6, 8, 12, 14, 16, 20, 22, 24, 28];
  let degree = rng.int(0, 2) * 2; // start on a chord tone
  let cursor = 0;
  while (cursor < 32) {
    const candidates = strong.filter((s) => s >= cursor);
    if (candidates.length === 0) break;
    const step = candidates[0]!;
    // Mostly stepwise motion, occasional leap to a chord tone.
    const move = rng.chance(0.68) ? (rng.chance(0.5) ? 1 : -1) : rng.chance(0.5) ? 2 : -2;
    degree = Math.max(-3, Math.min(9, degree + move));
    const len = rng.weighted([2, 4, 6, 8], (v) => (v === 4 ? 3 : v === 2 ? 2 : 1));
    out.push({ step, degree, len });
    // Leave breathing room: advance past the note plus a rest.
    cursor = step + len + (rng.chance(0.45) ? 2 : 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Track instance
// ---------------------------------------------------------------------------

const STEPS_PER_BAR = 16;

class TrackInstance {
  readonly name: string;
  readonly def: TrackDef;
  readonly out: GainNode;
  private synth: Synth;
  private motif: MotifNote[];
  private rng: Rng;
  private startTime: number;
  /** Next 16th-note index to schedule. */
  private step = 0;
  private stopping = false;
  ended = false;

  constructor(synth: Synth, name: string, def: TrackDef, startAt: number, fadeIn: number) {
    this.synth = synth;
    this.name = name;
    this.def = def;
    this.rng = new Random(def.seed);
    this.motif = buildMotif(new Random(def.seed ^ 0x9e37));
    this.startTime = startAt;

    this.out = synth.ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, startAt);
    this.out.gain.exponentialRampToValueAtTime(1, startAt + Math.max(0.05, fadeIn));
    this.out.connect(synth.musicBus);
  }

  get stepDuration(): number {
    return 60 / this.def.bpm / 4;
  }

  fadeOut(seconds: number): void {
    if (this.stopping) return;
    this.stopping = true;
    const t = this.synth.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, seconds));
    window.setTimeout(() => {
      this.ended = true;
      try {
        this.out.disconnect();
      } catch {
        /* already disconnected */
      }
    }, (seconds + 0.2) * 1000);
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  /** Schedules every step that begins before `until`. */
  schedule(until: number, intensity: number): void {
    if (this.stopping) return;
    const sd = this.stepDuration;
    let guard = 0;
    while (this.startTime + this.step * sd < until && guard++ < 256) {
      this.emitStep(this.step, this.startTime + this.step * sd, intensity);
      this.step++;
    }
  }

  private layerGain(layer: LayerName, intensity: number): number {
    const d = this.def;
    if (!d.layers.includes(layer) && layer !== 'perc') return 0;
    const gate = d.gate[layer] ?? 0;
    if (gate <= 0) return d.gain[layer] ?? 0.3;
    // Fade in over a 0.25-wide band above the gate so layers arrive smoothly.
    const t = Math.max(0, Math.min(1, (intensity - gate) / 0.25));
    return (d.gain[layer] ?? 0.3) * t * t * (3 - 2 * t);
  }

  private emitStep(step: number, when: number, intensity: number): void {
    const d = this.def;
    const s = this.synth;
    const scale = SCALES[d.scale];
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const chordIdx = Math.floor(bar / d.barsPerChord) % d.progression.length;
    const chordRoot = d.progression[chordIdx]!;
    const section = Math.floor(bar / 8) % 4;
    const barsIntoChord = bar % d.barsPerChord;
    const chordStart = inBar === 0 && barsIntoChord === 0;
    const chordSeconds = this.stepDuration * STEPS_PER_BAR * d.barsPerChord;
    const send = d.space;

    // --- drone: a sustained root, re-struck each chord ---------------------
    if (chordStart) {
      const g = this.layerGain('drone', intensity);
      if (g > 0.001) {
        const n = scaleNote(d.root - 12, scale, chordRoot);
        s.tone({
          type: 'sawtooth', freq: midiToFreq(n), gain: g * 0.5,
          attack: chordSeconds * 0.35, decay: chordSeconds * 0.4, sustain: 0.7,
          release: chordSeconds * 0.6, duration: chordSeconds * 0.55,
          unison: 3, unisonSpread: d.spread,
          filter: { type: 'lowpass', freq: d.cutoff * 0.5, endFreq: d.cutoff * 0.8, q: 1.6, sweep: chordSeconds },
          send: send * 1.2, dest: this.out, when,
        });
        s.tone({
          type: 'sine', freq: midiToFreq(n - 12), gain: g * 0.55,
          attack: chordSeconds * 0.25, decay: chordSeconds * 0.5, sustain: 0.8,
          release: chordSeconds * 0.5, duration: chordSeconds * 0.6,
          send: send * 0.3, dest: this.out, when,
        });
      }
    }

    // --- pad: the triad, wide and slow -------------------------------------
    if (chordStart) {
      const g = this.layerGain('pad', intensity);
      // Section 2 drops the pad for a bar-group so the loop breathes.
      const breathe = section === 2 && d.layers.includes('bell') ? 0.45 : 1;
      if (g > 0.001) {
        const tones = [0, 2, 4, 6];
        for (let i = 0; i < tones.length; i++) {
          // Voice the 7th only in the denser sections.
          if (i === 3 && section < 2) continue;
          const n = scaleNote(d.root, scale, chordRoot + tones[i]!);
          s.tone({
            type: 'sawtooth', freq: midiToFreq(n),
            gain: g * breathe * (0.34 / (1 + i * 0.35)),
            attack: chordSeconds * 0.3, decay: chordSeconds * 0.35, sustain: 0.65,
            release: chordSeconds * 0.7, duration: chordSeconds * 0.5,
            unison: 2, unisonSpread: d.spread * 0.7,
            detune: this.rng.range(-4, 4),
            filter: { type: 'lowpass', freq: d.cutoff * 0.7, endFreq: d.cutoff * 1.25, q: 2.2, sweep: chordSeconds * 0.8 },
            vibrato: { rate: 0.22 + i * 0.05, depth: 2.5 },
            send: send * 1.5, dest: this.out, when: when + i * 0.02,
          });
        }
      }
    }

    // --- bass: root and fifth on the strong beats --------------------------
    {
      const g = this.layerGain('bass', intensity);
      if (g > 0.001) {
        const pattern = d.bpm >= 100 ? [0, 3, 6, 8, 11, 14] : [0, 6, 8, 14];
        if (pattern.includes(inBar)) {
          const fifth = inBar === 6 || inBar === 11;
          const n = scaleNote(d.root - 24, scale, chordRoot + (fifth ? 4 : 0));
          s.tone({
            type: 'sawtooth', freq: midiToFreq(n), gain: g * 0.6,
            attack: 0.006, decay: this.stepDuration * 2.4, release: this.stepDuration * 1.2,
            filter: { type: 'lowpass', freq: 220, endFreq: 90, q: 4, sweep: this.stepDuration * 2 },
            distortion: 0.15,
            send: send * 0.2, dest: this.out, when,
          });
          s.tone({
            type: 'sine', freq: midiToFreq(n), gain: g * 0.45,
            attack: 0.004, decay: this.stepDuration * 2, release: this.stepDuration,
            dest: this.out, when,
          });
        }
      }
    }

    // --- arp: chord tones on 8ths (or 16ths at speed) ----------------------
    {
      const g = this.layerGain('arp', intensity);
      const every = d.bpm >= 100 ? 1 : 2;
      if (g > 0.001 && inBar % every === 0) {
        const idx = Math.floor(step / every);
        const shape = [0, 2, 4, 2, 6, 4, 2, 0];
        const n = scaleNote(d.root + 12, scale, chordRoot + shape[idx % shape.length]!);
        s.tone({
          type: 'triangle', freq: midiToFreq(n), gain: g * 0.32,
          attack: 0.004, decay: this.stepDuration * 1.6, release: this.stepDuration,
          filter: { type: 'lowpass', freq: d.cutoff * 1.6, q: 1.4 },
          send: send * 0.9, delaySend: 0.18, dest: this.out, when,
        });
      }
    }

    // --- lead: the motif, only in the busier sections ----------------------
    {
      const g = this.layerGain('lead', intensity);
      const phraseStep = step % 32;
      const playing = section === 1 || section === 3;
      if (g > 0.001 && playing) {
        for (const m of this.motif) {
          if (m.step !== phraseStep) continue;
          const transpose = section === 3 ? 2 : 0;
          const n = scaleNote(d.root + 12, scale, chordRoot + m.degree + transpose);
          const dur = m.len * this.stepDuration;
          s.tone({
            type: d.leadWave, freq: midiToFreq(n), gain: g * 0.34,
            attack: 0.02, decay: dur * 0.4, sustain: 0.55, release: dur * 0.6, duration: dur * 0.6,
            unison: d.leadWave === 'sawtooth' ? 2 : 1, unisonSpread: 7,
            filter: { type: 'lowpass', freq: d.cutoff * 2.2, q: 1.8 },
            vibrato: { rate: 5.2, depth: 5 },
            ring: d.flavor === 'ring' ? { freq: midiToFreq(n) * 1.5, depth: 0.3 } : undefined,
            send: send * 1.3, delaySend: 0.22, dest: this.out, when,
          });
        }
      }
    }

    // --- bells: sparse high sparkle on chord changes -----------------------
    if (chordStart) {
      const g = this.layerGain('bell', intensity);
      if (g > 0.001) {
        const partials = d.flavor === 'metal' ? [1, 2.76, 5.4] : d.flavor === 'glass' ? [1, 3.0, 6.2] : [1, 2.0, 3.01];
        const n = scaleNote(d.root + 24, scale, chordRoot + (section % 2 === 0 ? 0 : 4));
        const base = midiToFreq(n);
        for (let i = 0; i < partials.length; i++) {
          s.tone({
            type: 'sine', freq: base * partials[i]!, gain: (g * 0.3) / (1 + i * 1.4),
            attack: 0.01, decay: 2.4 / (1 + i * 0.7), release: 1.6,
            send: send * 2, delaySend: 0.25, dest: this.out, when: when + i * 0.008,
          });
        }
      }
    }

    // --- air: a wind / room bed --------------------------------------------
    if (chordStart) {
      const g = this.layerGain('air', intensity);
      if (g > 0.001) {
        s.noise({
          color: d.flavor === 'wind' ? 'pink' : 'brown',
          gain: g * 0.22,
          attack: chordSeconds * 0.4, decay: chordSeconds * 0.3, sustain: 0.7,
          release: chordSeconds * 0.5, duration: chordSeconds * 0.5,
          filter: { type: 'bandpass', freq: 300, endFreq: 900, q: 0.7, sweep: chordSeconds },
          send: send * 1.8, dest: this.out, when,
        });
      }
    }

    // --- percussion ---------------------------------------------------------
    {
      const g = this.layerGain('perc', intensity);
      const pat = PERC[d.perc];
      if (g > 0.001 && d.perc !== 'none') {
        // Fills on the last bar of every eight.
        const fill = bar % 8 === 7;
        if (pat.kick.includes(inBar)) {
          s.tone({
            type: 'sine', freq: 155, freqEnd: 44, freqTime: 0.14, gain: g * 0.9,
            attack: 0.001, decay: 0.19, release: 0.1, distortion: 0.25,
            dest: this.out, when,
          });
        }
        if (pat.snare.includes(inBar)) {
          s.noise({
            color: 'white', gain: g * 0.42, attack: 0.001, decay: 0.13, release: 0.09,
            filter: { type: 'bandpass', freq: 1900, endFreq: 900, q: 1.1, sweep: 0.14 },
            send: send * 1.4, dest: this.out, when,
          });
          s.tone({ type: 'triangle', freq: 196, gain: g * 0.2, attack: 0.001, decay: 0.09, release: 0.06, dest: this.out, when });
        }
        if (pat.hat.includes(inBar)) {
          s.noise({
            color: 'white', gain: g * (inBar % 4 === 0 ? 0.22 : 0.13),
            attack: 0.0008, decay: 0.035, release: 0.03,
            filter: { type: 'highpass', freq: d.perc === 'industrial' ? 5200 : 7600, q: 1 },
            pan: inBar % 8 < 4 ? -0.18 : 0.18,
            send: send * 0.6, dest: this.out, when,
          });
        }
        if (pat.tom.includes(inBar) || (fill && inBar >= 12)) {
          const pitch = 190 - ((inBar - 12) % 4) * 26;
          s.tone({
            type: 'sine', freq: pitch, freqEnd: pitch * 0.6, freqTime: 0.2, gain: g * 0.4,
            attack: 0.002, decay: 0.24, release: 0.14, distortion: 0.12,
            pan: this.rng.range(-0.3, 0.3), send: send * 0.9, dest: this.out, when,
          });
        }
        if (d.perc === 'industrial' && inBar === 8) {
          // Anvil: the foundry's signature.
          for (const r of [1, 2.76, 5.4]) {
            s.tone({
              type: 'sine', freq: 380 * r, gain: (g * 0.28) / r,
              attack: 0.001, decay: 0.9 / r, release: 0.5,
              send: send * 1.6, dest: this.out, when,
            });
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------

const LOOKAHEAD = 0.45;
const TICK_MS = 45;

/**
 * Owns the music clock, the active track stack and adaptive intensity.
 */
export class MusicDirector {
  private synth: Synth;
  private instances: TrackInstance[] = [];
  private timer: number | null = null;
  private wanted: { track: string; fade: number } | null = null;
  private current: string | null = null;

  /** Smoothed combat heat, 0..1. */
  private intensity = 0;
  private intensityTarget = 0;
  private lastTick = 0;
  private unsubs: Array<() => void> = [];

  constructor(synth: Synth) {
    this.synth = synth;
    this.lastTick = synth.ctx.currentTime;

    // Adaptive intensity: combat events push it up, silence lets it fall.
    this.unsubs.push(
      events.on('enemy:damaged', () => this.bump(0.16)),
      events.on('player:damaged', () => this.bump(0.3)),
      events.on('enemy:killed', () => this.bump(0.22)),
      events.on('boss:engaged', () => {
        this.intensityTarget = 1;
        this.play('boss', 1.6);
      }),
      events.on('boss:killed', () => this.play('victory', 2.2)),
    );
    this.start();
  }

  get currentTrack(): string | null {
    return this.current;
  }

  private bump(amount: number): void {
    this.intensityTarget = Math.min(1, this.intensityTarget + amount);
  }

  setIntensity(v: number): void {
    this.intensityTarget = Math.max(0, Math.min(1, v));
  }

  private start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** Called once the AudioContext actually starts, after the first gesture. */
  onContextStarted(): void {
    const want = this.wanted;
    if (want && this.instances.length === 0) {
      this.wanted = null;
      this.play(want.track, want.fade);
    }
  }

  /** Crossfades to `track`. Re-requesting the current track is a no-op. */
  play(track: string, fadeSeconds = 2): void {
    const def = TRACKS[track] ?? TRACKS[track.toLowerCase()] ?? TRACKS.dirge!;
    if (this.synth.ctx.state !== 'running') {
      // Remember it; `onContextStarted` will pick it up after the first input.
      this.wanted = { track, fade: fadeSeconds };
      this.current = track;
      return;
    }
    if (this.current === track && this.instances.some((i) => !i.isStopping)) return;
    this.current = track;

    for (const inst of this.instances) inst.fadeOut(fadeSeconds);

    // Start on the next beat boundary so the crossfade lands musically.
    const now = this.synth.ctx.currentTime;
    const inst = new TrackInstance(this.synth, track, def, now + 0.08, fadeSeconds * 0.8);
    this.instances.push(inst);
    // The room should match the music: cathedral for temples, cell for forges.
    this.synth.musicSend.gain.setTargetAtTime(0.18 + def.space * 0.3, now, 0.6);
  }

  stop(fadeSeconds = 1): void {
    for (const inst of this.instances) inst.fadeOut(fadeSeconds);
    this.current = null;
    this.wanted = null;
  }

  private tick(): void {
    const ctx = this.synth.ctx;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const dt = Math.max(0, Math.min(0.5, now - this.lastTick));
    this.lastTick = now;

    // Intensity rises quickly and falls slowly — combat should feel like it
    // takes a moment to settle, not like a switch flipping off.
    this.intensityTarget = Math.max(0, this.intensityTarget - dt * 0.16);
    const rate = this.intensityTarget > this.intensity ? 2.2 : 0.5;
    this.intensity += (this.intensityTarget - this.intensity) * Math.min(1, rate * dt);

    const until = now + LOOKAHEAD;
    for (let i = this.instances.length - 1; i >= 0; i--) {
      const inst = this.instances[i]!;
      if (inst.ended) {
        this.instances.splice(i, 1);
        continue;
      }
      inst.schedule(until, this.intensity);
    }
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    for (const inst of this.instances) inst.fadeOut(0.2);
    this.instances.length = 0;
  }
}

/** Every track id the director understands, for tooling and debug menus. */
export function musicTracks(): string[] {
  return Object.keys(TRACKS).sort();
}
