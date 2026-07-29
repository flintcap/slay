/**
 * SLAY — the game's sound layer.
 *
 * Every id in the registry below is a *recipe*, not a file: a few oscillators,
 * a noise burst, an envelope and a filter sweep. Because they are recipes they
 * can be varied per call — pitch jitter, brightness jitter, small timing
 * offsets — which is the difference between "forty kills sound like a machine
 * gun" and "forty kills sound like a fight".
 *
 * Three things keep the mix intact under load:
 *   - a **voice limiter** (`Synth.canVoice`), so a screen-clearing nova cannot
 *     stack 200 oscillators into the master bus;
 *   - a **per-id rate limit**, so the same sound cannot retrigger inside its
 *     own attack and phase-cancel into a click;
 *   - **distance culling and attenuation** around the listener.
 *
 * Unknown ids resolve through a family fallback (`cast.*`, `hit.*`, `nova.*`,
 * `footstep.*`, `pickup.*`, `monster.*` …) and, failing that, are silently
 * ignored. A missing sound must never throw inside a combat frame.
 */

import type { GameSettings, ItemRarity, DamageType } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { Random } from '../core/RNG';
import type { Rng } from '../types';
import { Synth, midiToFreq } from './Synth';
import { MusicDirector } from './Music';

// ---------------------------------------------------------------------------
// Sound context
// ---------------------------------------------------------------------------

interface P {
  /** Scheduled start time. */
  t: number;
  /** Volume multiplier from distance + caller. */
  g: number;
  /** Pitch multiplier from variation + caller. */
  p: number;
  /** Stereo pan, -1..1. */
  pan: number;
  /** Reverb send for this instance. */
  send: number;
  rng: Rng;
}

type SoundFn = (s: Synth, p: P) => void;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** A body thump: low sine drop. The weight under every impact. */
function thump(s: Synth, p: P, freq: number, dur: number, gain: number): void {
  s.tone({
    type: 'sine',
    freq: freq * p.p,
    freqEnd: freq * p.p * 0.42,
    freqTime: dur,
    gain: gain * p.g,
    attack: 0.001,
    decay: dur,
    release: dur * 0.5,
    distortion: 0.15,
    pan: p.pan,
    send: p.send * 0.5,
    when: p.t,
  });
}

/** A bright transient: short filtered noise. The "crack" of a hit. */
function crack(s: Synth, p: P, freq: number, dur: number, gain: number, q = 1.2): void {
  s.noise({
    color: 'white',
    gain: gain * p.g,
    attack: 0.0008,
    decay: dur,
    release: dur * 0.6,
    filter: { type: 'bandpass', freq: freq * p.p, endFreq: freq * p.p * 0.45, q, sweep: dur },
    pan: p.pan,
    send: p.send,
    when: p.t,
  });
}

/** Air movement — swings, dashes, spell gestures. */
function whoosh(s: Synth, p: P, dur: number, gain: number, low = 320, high = 2400): void {
  s.noise({
    color: 'pink',
    gain: gain * p.g,
    attack: dur * 0.35,
    decay: dur * 0.65,
    release: dur * 0.4,
    filter: { type: 'bandpass', freq: low * p.p, endFreq: high * p.p, q: 1.5, sweep: dur },
    pan: p.pan,
    send: p.send * 1.2,
    when: p.t,
  });
}

/** A metallic ring built from inharmonic partials — swords, shields, chains. */
function metallic(s: Synth, p: P, base: number, dur: number, gain: number, partials = [1, 2.76, 5.4, 8.93]): void {
  for (let i = 0; i < partials.length; i++) {
    const r = partials[i]!;
    s.tone({
      type: i === 0 ? 'triangle' : 'sine',
      freq: base * r * p.p,
      gain: (gain * p.g) / (1 + i * 1.5),
      attack: 0.001,
      decay: dur / (1 + i * 0.5),
      release: dur * 0.4,
      pan: p.pan,
      send: p.send * 1.4,
      when: p.t,
    });
  }
}

/** A tuned bell/chime cluster — pickups, level-ups, quest completion. */
function chime(s: Synth, p: P, midi: number, dur: number, gain: number, spread = [0, 7, 12]): void {
  for (let i = 0; i < spread.length; i++) {
    s.tone({
      type: 'sine',
      freq: midiToFreq(midi + spread[i]!) * p.p,
      gain: (gain * p.g) / (1 + i * 0.6),
      attack: 0.004,
      decay: dur,
      release: dur * 0.7,
      pan: p.pan + (i - 1) * 0.08,
      send: p.send * 1.8,
      delaySend: 0.12,
      when: p.t + i * 0.012,
    });
  }
}

/** Wet organic squelch — flesh, ooze, poison. */
function squelch(s: Synth, p: P, dur: number, gain: number): void {
  s.noise({
    color: 'brown',
    gain: gain * p.g,
    attack: 0.002,
    decay: dur,
    release: dur * 0.5,
    filter: { type: 'lowpass', freq: 1400 * p.p, endFreq: 260 * p.p, q: 4, sweep: dur },
    distortion: 0.2,
    pan: p.pan,
    send: p.send * 0.6,
    when: p.t,
  });
  s.tone({
    type: 'sawtooth',
    freq: 180 * p.p,
    freqEnd: 62 * p.p,
    freqTime: dur * 0.8,
    gain: gain * 0.5 * p.g,
    attack: 0.002,
    decay: dur * 0.8,
    release: dur * 0.4,
    filter: { type: 'lowpass', freq: 900, q: 3 },
    pan: p.pan,
    when: p.t,
  });
}

/** A growl/roar: detuned saws through a formant-ish bandpass, with vibrato. */
function growl(s: Synth, p: P, base: number, dur: number, gain: number, roughness = 0.35): void {
  s.tone({
    type: 'sawtooth',
    freq: base * p.p,
    freqEnd: base * p.p * 0.75,
    freqTime: dur,
    gain: gain * p.g,
    attack: dur * 0.12,
    decay: dur * 0.4,
    sustain: 0.5,
    release: dur * 0.5,
    duration: dur * 0.5,
    unison: 3,
    unisonSpread: 22,
    filter: { type: 'bandpass', freq: 420 * p.p, endFreq: 240 * p.p, q: 2.4, sweep: dur },
    distortion: roughness,
    vibrato: { rate: 17, depth: base * 0.06 },
    pan: p.pan,
    send: p.send * 1.3,
    when: p.t,
  });
  s.noise({
    color: 'brown',
    gain: gain * 0.4 * p.g,
    attack: dur * 0.15,
    decay: dur * 0.6,
    sustain: 0.4,
    release: dur * 0.4,
    duration: dur * 0.4,
    filter: { type: 'bandpass', freq: 700 * p.p, endFreq: 400 * p.p, q: 1.6, sweep: dur },
    pan: p.pan,
    send: p.send,
    when: p.t,
  });
}

/** A screech: high, unstable, ring-modulated. Insects and aberrations. */
function screech(s: Synth, p: P, base: number, dur: number, gain: number): void {
  s.tone({
    type: 'sawtooth',
    freq: base * p.p,
    freqEnd: base * p.p * 1.7,
    freqTime: dur * 0.7,
    gain: gain * p.g,
    attack: 0.006,
    decay: dur * 0.5,
    sustain: 0.4,
    release: dur * 0.5,
    duration: dur * 0.35,
    ring: { freq: base * 1.42, depth: 0.55 },
    filter: { type: 'highpass', freq: 700, q: 1 },
    vibrato: { rate: 26, depth: base * 0.12 },
    distortion: 0.3,
    pan: p.pan,
    send: p.send * 1.5,
    when: p.t,
  });
}

/** Sub-bass drop for slams, roars and portal opens. */
function sub(s: Synth, p: P, freq: number, dur: number, gain: number): void {
  s.tone({
    type: 'sine',
    freq: freq * p.p,
    freqEnd: Math.max(24, freq * p.p * 0.3),
    freqTime: dur,
    gain: gain * p.g,
    attack: 0.004,
    decay: dur,
    release: dur * 0.6,
    pan: p.pan * 0.3,
    send: p.send * 0.3,
    when: p.t,
  });
}

// ---------------------------------------------------------------------------
// Elemental families
// ---------------------------------------------------------------------------

function castOf(el: string): SoundFn {
  switch (el) {
    case 'fire':
      return (s, p) => {
        whoosh(s, p, 0.34, 0.3, 240, 1800);
        s.noise({ color: 'brown', gain: 0.34 * p.g, attack: 0.01, decay: 0.34, release: 0.2, filter: { type: 'lowpass', freq: 2600 * p.p, endFreq: 620, q: 2, sweep: 0.34 }, distortion: 0.35, pan: p.pan, send: p.send, when: p.t });
        s.tone({ type: 'sawtooth', freq: 150 * p.p, freqEnd: 74 * p.p, freqTime: 0.3, gain: 0.16 * p.g, attack: 0.006, decay: 0.3, release: 0.15, filter: { type: 'lowpass', freq: 1100, q: 2 }, distortion: 0.3, pan: p.pan, when: p.t });
      };
    case 'cold':
      return (s, p) => {
        s.noise({ color: 'white', gain: 0.2 * p.g, attack: 0.008, decay: 0.3, release: 0.24, filter: { type: 'highpass', freq: 2400 * p.p, endFreq: 7200, q: 1.4, sweep: 0.3 }, pan: p.pan, send: p.send * 1.6, when: p.t });
        chime(s, { ...p, send: p.send * 1.6 }, 86, 0.5, 0.12, [0, 12, 19]);
        s.tone({ type: 'triangle', freq: 620 * p.p, freqEnd: 1500 * p.p, freqTime: 0.22, gain: 0.1 * p.g, attack: 0.004, decay: 0.24, release: 0.2, pan: p.pan, send: p.send, when: p.t });
      };
    case 'lightning':
      return (s, p) => {
        s.noise({ color: 'white', gain: 0.3 * p.g, attack: 0.001, decay: 0.09, release: 0.07, filter: { type: 'highpass', freq: 1800 * p.p, endFreq: 5200, q: 0.8, sweep: 0.1 }, distortion: 0.4, pan: p.pan, send: p.send, when: p.t });
        s.tone({ type: 'square', freq: 1400 * p.p, freqEnd: 320 * p.p, freqTime: 0.13, gain: 0.13 * p.g, attack: 0.001, decay: 0.13, release: 0.08, ring: { freq: 73, depth: 0.5 }, distortion: 0.3, pan: p.pan, when: p.t });
      };
    case 'poison':
      return (s, p) => {
        squelch(s, p, 0.36, 0.26);
        s.tone({ type: 'triangle', freq: 300 * p.p, freqEnd: 168 * p.p, freqTime: 0.34, gain: 0.11 * p.g, attack: 0.02, decay: 0.34, release: 0.2, vibrato: { rate: 9, depth: 16 }, pan: p.pan, send: p.send, when: p.t });
      };
    case 'arcane':
      return (s, p) => {
        chime(s, p, 74, 0.6, 0.16, [0, 5, 12, 17]);
        s.tone({ type: 'sine', freq: 340 * p.p, freqEnd: 900 * p.p, freqTime: 0.32, gain: 0.13 * p.g, attack: 0.05, decay: 0.34, release: 0.28, ring: { freq: 211, depth: 0.35 }, pan: p.pan, send: p.send * 1.8, delaySend: 0.2, when: p.t });
      };
    default:
      return (s, p) => {
        whoosh(s, p, 0.22, 0.24, 400, 1600);
        thump(s, p, 130, 0.14, 0.14);
      };
  }
}

function impactOf(el: string): SoundFn {
  switch (el) {
    case 'fire':
      return (s, p) => {
        thump(s, p, 96, 0.28, 0.42);
        s.noise({ color: 'brown', gain: 0.4 * p.g, attack: 0.001, decay: 0.3, release: 0.22, filter: { type: 'lowpass', freq: 3800 * p.p, endFreq: 420, q: 1.4, sweep: 0.3 }, distortion: 0.42, pan: p.pan, send: p.send, when: p.t });
      };
    case 'cold':
      return (s, p) => {
        crack(s, p, 4200, 0.13, 0.3, 2.2);
        metallic(s, { ...p, send: p.send * 1.6 }, 880, 0.5, 0.1, [1, 2.4, 4.1, 6.8]);
        thump(s, p, 120, 0.14, 0.2);
      };
    case 'lightning':
      return (s, p) => {
        s.noise({ color: 'white', gain: 0.42 * p.g, attack: 0.0005, decay: 0.07, release: 0.06, filter: { type: 'highpass', freq: 2600 * p.p, q: 0.7 }, distortion: 0.5, pan: p.pan, send: p.send, when: p.t });
        s.tone({ type: 'square', freq: 220 * p.p, freqEnd: 58 * p.p, freqTime: 0.1, gain: 0.24 * p.g, attack: 0.0008, decay: 0.11, release: 0.07, distortion: 0.45, pan: p.pan, when: p.t });
      };
    case 'poison':
      return (s, p) => {
        squelch(s, p, 0.3, 0.4);
        crack(s, p, 900, 0.09, 0.14, 1.8);
      };
    case 'arcane':
      return (s, p) => {
        s.tone({ type: 'sine', freq: 760 * p.p, freqEnd: 190 * p.p, freqTime: 0.2, gain: 0.24 * p.g, attack: 0.001, decay: 0.22, release: 0.18, ring: { freq: 313, depth: 0.45 }, pan: p.pan, send: p.send * 1.6, when: p.t });
        thump(s, p, 110, 0.18, 0.24);
        crack(s, p, 3200, 0.1, 0.16, 2);
      };
    default:
      return (s, p) => {
        thump(s, p, 118, 0.15, 0.4);
        crack(s, p, 2100, 0.075, 0.3, 1.1);
      };
  }
}

function novaOf(el: string): SoundFn {
  const impact = impactOf(el);
  return (s, p) => {
    sub(s, p, 78, 0.65, 0.4);
    impact(s, { ...p, g: p.g * 0.8 });
    // The expanding wash that sells "this covered the room".
    s.noise({
      color: 'pink',
      gain: 0.26 * p.g,
      attack: 0.02,
      decay: 0.75,
      release: 0.45,
      filter: { type: 'bandpass', freq: 260 * p.p, endFreq: 3600 * p.p, q: 0.9, sweep: 0.6 },
      pan: p.pan,
      send: p.send * 2,
      when: p.t,
    });
  };
}

function beamOf(el: string): SoundFn {
  const cast = castOf(el);
  return (s, p) => {
    cast(s, { ...p, g: p.g * 0.7 });
    s.tone({
      type: 'sawtooth',
      freq: (el === 'lightning' ? 180 : 120) * p.p,
      gain: 0.13 * p.g,
      attack: 0.03,
      decay: 0.1,
      sustain: 0.8,
      release: 0.25,
      duration: 0.42,
      unison: 3,
      unisonSpread: 14,
      filter: { type: 'bandpass', freq: 700 * p.p, endFreq: 2600 * p.p, q: 3.5, sweep: 0.45 },
      distortion: 0.3,
      pan: p.pan,
      send: p.send * 1.4,
      when: p.t,
    });
  };
}

function coneOf(el: string): SoundFn {
  const cast = castOf(el);
  return (s, p) => {
    cast(s, { ...p, g: p.g * 0.8 });
    s.noise({
      color: 'pink',
      gain: 0.3 * p.g,
      attack: 0.05,
      decay: 0.18,
      sustain: 0.7,
      release: 0.35,
      duration: 0.45,
      filter: { type: 'bandpass', freq: 900 * p.p, endFreq: 2200 * p.p, q: 1.1, sweep: 0.5 },
      distortion: 0.3,
      pan: p.pan,
      send: p.send * 1.5,
      when: p.t,
    });
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const RARITY_CHIME: Record<ItemRarity, { midi: number; spread: number[]; gain: number; dur: number }> = {
  // Rarity must be *audible*. Common drops get a dull tick; an ancient gets a
  // shimmering stack you cannot mistake for anything else in the game.
  normal: { midi: 72, spread: [0], gain: 0.12, dur: 0.16 },
  magic: { midi: 74, spread: [0, 7], gain: 0.16, dur: 0.32 },
  rare: { midi: 76, spread: [0, 4, 7], gain: 0.2, dur: 0.5 },
  set: { midi: 76, spread: [0, 5, 9, 12], gain: 0.21, dur: 0.6 },
  unique: { midi: 69, spread: [0, 7, 12, 16], gain: 0.24, dur: 0.9 },
  mythic: { midi: 71, spread: [0, 3, 7, 10, 14], gain: 0.26, dur: 1.2 },
  ancient: { midi: 67, spread: [0, 7, 12, 19, 24], gain: 0.3, dur: 1.6 },
};

const SOUNDS: Record<string, SoundFn> = {
  // --- UI ------------------------------------------------------------------
  'ui.select': (s, p) => chime(s, p, 84, 0.1, 0.12, [0, 7]),
  'ui.click': (s, p) => { crack(s, p, 3200, 0.03, 0.1, 3); chime(s, p, 88, 0.06, 0.06, [0]); },
  'ui.hover': (s, p) => chime(s, p, 91, 0.05, 0.04, [0]),
  'ui.open': (s, p) => {
    s.noise({ color: 'pink', gain: 0.14 * p.g, attack: 0.006, decay: 0.16, release: 0.1, filter: { type: 'bandpass', freq: 900, endFreq: 2600, q: 1.2, sweep: 0.16 }, pan: p.pan, send: p.send, when: p.t });
    chime(s, p, 79, 0.2, 0.1, [0, 5]);
  },
  'ui.close': (s, p) => {
    s.noise({ color: 'pink', gain: 0.14 * p.g, attack: 0.006, decay: 0.16, release: 0.1, filter: { type: 'bandpass', freq: 2600, endFreq: 800, q: 1.2, sweep: 0.16 }, pan: p.pan, send: p.send, when: p.t });
    chime(s, p, 72, 0.18, 0.09, [0]);
  },
  'ui.error': (s, p) => {
    s.tone({ type: 'square', freq: 168 * p.p, gain: 0.14 * p.g, attack: 0.002, decay: 0.1, release: 0.08, filter: { type: 'lowpass', freq: 1400, q: 2 }, distortion: 0.2, pan: p.pan, when: p.t });
    s.tone({ type: 'square', freq: 122 * p.p, gain: 0.13 * p.g, attack: 0.002, decay: 0.14, release: 0.1, filter: { type: 'lowpass', freq: 1200, q: 2 }, distortion: 0.2, pan: p.pan, when: p.t + 0.09 });
  },
  'ui.tab': (s, p) => chime(s, p, 86, 0.08, 0.08, [0, 12]),

  // --- weapons -------------------------------------------------------------
  'hit.melee': (s, p) => { thump(s, p, 122, 0.16, 0.42); crack(s, p, 2300, 0.07, 0.3, 1.1); squelch(s, { ...p, g: p.g * 0.5 }, 0.14, 0.2); },
  'hit.sword': (s, p) => { crack(s, p, 3400, 0.06, 0.34, 1.4); metallic(s, p, 620, 0.3, 0.12); thump(s, p, 140, 0.12, 0.3); },
  'hit.axe': (s, p) => { thump(s, p, 98, 0.2, 0.5); crack(s, p, 1500, 0.1, 0.32, 0.9); },
  'hit.blunt': (s, p) => { thump(s, p, 78, 0.26, 0.6); crack(s, p, 800, 0.09, 0.22, 0.7); },
  'hit.pierce': (s, p) => { crack(s, p, 4600, 0.05, 0.3, 2.6); thump(s, p, 165, 0.08, 0.2); },
  'hit.flesh': (s, p) => { squelch(s, p, 0.2, 0.4); thump(s, p, 105, 0.13, 0.3); },
  'hit.bone': (s, p) => { crack(s, p, 1900, 0.07, 0.36, 2.2); metallic(s, p, 340, 0.16, 0.08, [1, 3.1, 5.2]); },
  'hit.metal': (s, p) => { crack(s, p, 5200, 0.05, 0.3, 2.4); metallic(s, p, 780, 0.42, 0.14); },
  'hit.stone': (s, p) => { crack(s, p, 1100, 0.09, 0.34, 1.0); thump(s, p, 88, 0.15, 0.3); },
  'swing.miss': (s, p) => whoosh(s, p, 0.2, 0.22, 300, 2100),
  'swing.heavy': (s, p) => { whoosh(s, p, 0.34, 0.3, 180, 1500); sub(s, p, 70, 0.2, 0.12); },
  crit: (s, p) => {
    crack(s, p, 5600, 0.07, 0.4, 2);
    thump(s, p, 84, 0.3, 0.5);
    metallic(s, { ...p, send: p.send * 1.6 }, 940, 0.5, 0.16, [1, 2.2, 3.9, 6.1]);
    chime(s, p, 88, 0.3, 0.1, [0, 12]);
  },
  block: (s, p) => { crack(s, p, 2600, 0.06, 0.32, 1.6); metallic(s, p, 460, 0.36, 0.18, [1, 2.4, 4.3, 7.1]); thump(s, p, 130, 0.1, 0.22); },
  'block.magic': (s, p) => { chime(s, p, 81, 0.35, 0.14, [0, 7, 12]); s.noise({ color: 'white', gain: 0.16 * p.g, attack: 0.002, decay: 0.16, release: 0.14, filter: { type: 'highpass', freq: 2200, endFreq: 5600, q: 1.2, sweep: 0.18 }, pan: p.pan, send: p.send * 1.6, when: p.t }); },
  parry: (s, p) => { crack(s, p, 6200, 0.04, 0.3, 3); metallic(s, p, 1180, 0.28, 0.14); },

  // --- movement ------------------------------------------------------------
  dodge: (s, p) => { whoosh(s, p, 0.26, 0.24, 500, 2600); s.noise({ color: 'pink', gain: 0.1 * p.g, attack: 0.004, decay: 0.12, release: 0.1, filter: { type: 'highpass', freq: 1800, q: 1 }, pan: p.pan, send: p.send, when: p.t }); },
  jump: (s, p) => whoosh(s, p, 0.18, 0.18, 600, 1800),
  land: (s, p) => { thump(s, p, 72, 0.2, 0.34); crack(s, p, 700, 0.09, 0.16, 0.8); },

  // --- world / interaction -------------------------------------------------
  stairs: (s, p) => {
    s.noise({ color: 'brown', gain: 0.24 * p.g, attack: 0.02, decay: 0.5, release: 0.4, filter: { type: 'lowpass', freq: 1400, endFreq: 340, q: 1.6, sweep: 0.5 }, distortion: 0.15, pan: p.pan, send: p.send * 1.4, when: p.t });
    sub(s, p, 62, 0.7, 0.24);
    chime(s, p, 60, 0.9, 0.08, [0, 7]);
  },
  door: (s, p) => {
    s.noise({ color: 'brown', gain: 0.24 * p.g, attack: 0.04, decay: 0.55, sustain: 0.4, release: 0.3, duration: 0.3, filter: { type: 'bandpass', freq: 320 * p.p, endFreq: 180, q: 3.5, sweep: 0.6 }, distortion: 0.25, pan: p.pan, send: p.send * 1.5, when: p.t });
    thump(s, p, 66, 0.35, 0.24);
  },
  chest: (s, p) => {
    s.noise({ color: 'brown', gain: 0.2 * p.g, attack: 0.01, decay: 0.3, release: 0.2, filter: { type: 'bandpass', freq: 520, endFreq: 240, q: 2.5, sweep: 0.3 }, pan: p.pan, send: p.send, when: p.t });
    metallic(s, p, 380, 0.5, 0.14, [1, 2.7, 4.9]);
    chime(s, p, 76, 0.7, 0.12, [0, 7, 12]);
  },
  shrine: (s, p) => { chime(s, p, 65, 1.6, 0.18, [0, 7, 12, 19]); sub(s, p, 55, 1.0, 0.16); },
  portal: (s, p) => {
    sub(s, p, 58, 1.2, 0.34);
    s.tone({ type: 'sawtooth', freq: 90 * p.p, freqEnd: 260 * p.p, freqTime: 1.0, gain: 0.16 * p.g, attack: 0.3, decay: 0.5, sustain: 0.6, release: 0.6, duration: 0.6, unison: 3, unisonSpread: 18, filter: { type: 'lowpass', freq: 500, endFreq: 2600, q: 4, sweep: 1.0 }, pan: p.pan, send: p.send * 2, delaySend: 0.3, when: p.t });
    chime(s, p, 69, 1.4, 0.14, [0, 5, 12, 17]);
  },
  'quest.complete': (s, p) => {
    chime(s, p, 72, 1.0, 0.2, [0, 4, 7]);
    chime(s, { ...p, t: p.t + 0.16 }, 76, 1.0, 0.2, [0, 5, 9]);
    chime(s, { ...p, t: p.t + 0.34 }, 79, 1.6, 0.24, [0, 7, 12, 16]);
  },
  levelup: (s, p) => {
    // A rising fifth stack — unmistakable, and it lands on the octave.
    const steps = [60, 64, 67, 72, 79];
    for (let i = 0; i < steps.length; i++) {
      chime(s, { ...p, t: p.t + i * 0.085 }, steps[i]!, 1.1 + i * 0.2, 0.2, [0, 12]);
    }
    sub(s, p, 65, 0.9, 0.24);
    s.noise({ color: 'white', gain: 0.14 * p.g, attack: 0.3, decay: 0.5, release: 0.4, filter: { type: 'highpass', freq: 2400, endFreq: 8000, q: 1, sweep: 0.7 }, pan: 0, send: p.send * 2, when: p.t });
  },
  skillpoint: (s, p) => chime(s, p, 83, 0.7, 0.16, [0, 7, 12]),
  equip: (s, p) => { metallic(s, p, 300, 0.34, 0.18, [1, 2.5, 4.2, 6.6]); crack(s, p, 1800, 0.05, 0.16, 1.4); },
  unequip: (s, p) => { metallic(s, p, 220, 0.26, 0.14, [1, 2.3, 3.8]); },
  gold: (s, p) => {
    // Several tiny metallic ticks, jittered — a purse, not a single coin.
    const n = 4 + Math.floor(p.rng.next() * 3);
    for (let i = 0; i < n; i++) {
      metallic(s, { ...p, t: p.t + p.rng.range(0, 0.09), pan: p.pan + p.rng.range(-0.2, 0.2) }, p.rng.range(1500, 2600), 0.16, 0.07, [1, 2.9, 5.1]);
    }
  },
  potion: (s, p) => {
    s.tone({ type: 'sine', freq: 380 * p.p, freqEnd: 900 * p.p, freqTime: 0.28, gain: 0.14 * p.g, attack: 0.01, decay: 0.3, release: 0.2, filter: { type: 'lowpass', freq: 2600, q: 2 }, pan: p.pan, send: p.send, when: p.t });
    s.noise({ color: 'white', gain: 0.1 * p.g, attack: 0.02, decay: 0.24, release: 0.16, filter: { type: 'bandpass', freq: 3400, endFreq: 1400, q: 2.4, sweep: 0.26 }, pan: p.pan, send: p.send, when: p.t });
  },
  heal: (s, p) => {
    chime(s, p, 72, 0.9, 0.16, [0, 7, 12]);
    s.tone({ type: 'sine', freq: 220 * p.p, freqEnd: 440 * p.p, freqTime: 0.6, gain: 0.1 * p.g, attack: 0.08, decay: 0.6, release: 0.4, pan: p.pan, send: p.send * 1.8, when: p.t });
  },
  buff: (s, p) => {
    s.tone({ type: 'sawtooth', freq: 150 * p.p, freqEnd: 300 * p.p, freqTime: 0.45, gain: 0.12 * p.g, attack: 0.06, decay: 0.4, release: 0.3, unison: 3, unisonSpread: 12, filter: { type: 'lowpass', freq: 700, endFreq: 3000, q: 3, sweep: 0.5 }, pan: p.pan, send: p.send * 1.6, when: p.t });
    chime(s, p, 79, 0.6, 0.12, [0, 7]);
  },
  debuff: (s, p) => {
    s.tone({ type: 'sawtooth', freq: 300 * p.p, freqEnd: 120 * p.p, freqTime: 0.5, gain: 0.13 * p.g, attack: 0.05, decay: 0.5, release: 0.3, unison: 2, filter: { type: 'lowpass', freq: 2200, endFreq: 400, q: 3, sweep: 0.5 }, distortion: 0.2, pan: p.pan, send: p.send * 1.4, when: p.t });
  },
  slam: (s, p) => {
    sub(s, p, 62, 0.9, 0.55);
    thump(s, p, 100, 0.3, 0.5);
    s.noise({ color: 'brown', gain: 0.4 * p.g, attack: 0.002, decay: 0.6, release: 0.4, filter: { type: 'lowpass', freq: 2600 * p.p, endFreq: 200, q: 1.2, sweep: 0.55 }, distortion: 0.4, pan: p.pan, send: p.send * 1.6, when: p.t });
    crack(s, p, 1400, 0.14, 0.3, 0.8);
  },
  chain: (s, p) => {
    s.noise({ color: 'white', gain: 0.34 * p.g, attack: 0.0008, decay: 0.14, release: 0.1, filter: { type: 'highpass', freq: 2400 * p.p, endFreq: 6400, q: 0.8, sweep: 0.16 }, distortion: 0.45, pan: p.pan, send: p.send * 1.4, when: p.t });
    for (let i = 0; i < 3; i++) {
      s.tone({ type: 'square', freq: (900 - i * 180) * p.p, freqEnd: (240 - i * 40) * p.p, freqTime: 0.09, gain: 0.11 * p.g, attack: 0.0008, decay: 0.1, release: 0.06, distortion: 0.4, pan: p.pan + (i - 1) * 0.25, when: p.t + i * 0.045 });
    }
  },

  // --- player state --------------------------------------------------------
  'player.hurt': (s, p) => {
    thump(s, p, 92, 0.2, 0.44);
    squelch(s, p, 0.18, 0.3);
    s.tone({ type: 'sawtooth', freq: 240 * p.p, freqEnd: 130 * p.p, freqTime: 0.2, gain: 0.1 * p.g, attack: 0.004, decay: 0.2, release: 0.14, filter: { type: 'lowpass', freq: 1200, q: 2 }, distortion: 0.3, pan: 0, when: p.t });
  },
  'player.death': (s, p) => {
    sub(s, { ...p, pan: 0 }, 70, 2.2, 0.5);
    growl(s, { ...p, pan: 0 }, 130, 1.1, 0.22, 0.4);
    s.tone({ type: 'sawtooth', freq: 200, freqEnd: 42, freqTime: 2.0, gain: 0.2 * p.g, attack: 0.05, decay: 1.8, release: 1.2, unison: 3, unisonSpread: 26, filter: { type: 'lowpass', freq: 1400, endFreq: 180, q: 3, sweep: 2.0 }, distortion: 0.25, pan: 0, send: p.send * 2.4, when: p.t });
    chime(s, { ...p, t: p.t + 0.5, pan: 0 }, 53, 3.0, 0.14, [0, 7]);
  },
  heartbeat: (s, p) => {
    sub(s, { ...p, pan: 0 }, 54, 0.22, 0.42);
    sub(s, { ...p, t: p.t + 0.19, pan: 0 }, 48, 0.3, 0.3);
  },
  'death.normal': (s, p) => { growl(s, p, 180, 0.5, 0.2, 0.3); squelch(s, p, 0.3, 0.3); thump(s, p, 80, 0.3, 0.3); },
  'death.heavy': (s, p) => {
    growl(s, p, 96, 1.1, 0.3, 0.5);
    sub(s, p, 58, 1.0, 0.4);
    s.noise({ color: 'brown', gain: 0.3 * p.g, attack: 0.01, decay: 0.9, release: 0.6, filter: { type: 'lowpass', freq: 1800, endFreq: 220, q: 1.6, sweep: 0.9 }, distortion: 0.35, pan: p.pan, send: p.send * 1.6, when: p.t });
  },

  // --- monsters ------------------------------------------------------------
  'monster.aggro': (s, p) => growl(s, p, 210, 0.5, 0.24, 0.4),
  'monster.attack': (s, p) => { whoosh(s, p, 0.18, 0.2, 340, 1600); growl(s, p, 260, 0.22, 0.16, 0.35); },
  'monster.hurt': (s, p) => { squelch(s, p, 0.16, 0.28); growl(s, p, 300, 0.2, 0.14, 0.4); },

  // --- bosses --------------------------------------------------------------
  'boss.roar': (s, p) => {
    sub(s, { ...p, pan: 0 }, 46, 2.0, 0.55);
    growl(s, { ...p, pan: 0 }, 78, 1.8, 0.36, 0.55);
    growl(s, { ...p, pan: 0, t: p.t + 0.08 }, 117, 1.5, 0.22, 0.45);
    s.noise({ color: 'brown', gain: 0.3 * p.g, attack: 0.2, decay: 1.2, sustain: 0.5, release: 0.8, duration: 0.8, filter: { type: 'bandpass', freq: 500, endFreq: 260, q: 1.4, sweep: 1.6 }, distortion: 0.4, pan: 0, send: p.send * 2, when: p.t });
  },
  'boss.windup': (s, p) => {
    s.tone({ type: 'sawtooth', freq: 60 * p.p, freqEnd: 150 * p.p, freqTime: 0.85, gain: 0.2 * p.g, attack: 0.2, decay: 0.3, sustain: 0.85, release: 0.2, duration: 0.55, unison: 3, unisonSpread: 20, filter: { type: 'lowpass', freq: 260, endFreq: 1400, q: 5, sweep: 0.9 }, distortion: 0.3, pan: p.pan, send: p.send, when: p.t });
  },
  'boss.slam': (s, p) => {
    sub(s, p, 52, 1.4, 0.7);
    thump(s, p, 88, 0.4, 0.6);
    s.noise({ color: 'brown', gain: 0.46 * p.g, attack: 0.002, decay: 0.9, release: 0.6, filter: { type: 'lowpass', freq: 3200 * p.p, endFreq: 160, q: 1.1, sweep: 0.85 }, distortion: 0.5, pan: p.pan, send: p.send * 1.8, when: p.t });
    crack(s, p, 1200, 0.2, 0.36, 0.7);
  },
  'boss.phase': (s, p) => {
    sub(s, { ...p, pan: 0 }, 44, 2.4, 0.5);
    chime(s, { ...p, pan: 0 }, 51, 2.4, 0.18, [0, 6, 11]);
  },

  // --- spells (composite ids used by Effects.ts) ---------------------------
  'spell.explosion': (s, p) => {
    sub(s, p, 60, 1.0, 0.6);
    s.noise({ color: 'brown', gain: 0.5 * p.g, attack: 0.001, decay: 0.75, release: 0.5, filter: { type: 'lowpass', freq: 4200 * p.p, endFreq: 200, q: 1.2, sweep: 0.7 }, distortion: 0.55, pan: p.pan, send: p.send * 1.6, when: p.t });
    crack(s, p, 2600, 0.14, 0.34, 0.8);
  },
  'spell.meteor': (s, p) => {
    s.noise({ color: 'pink', gain: 0.3 * p.g, attack: 0.35, decay: 0.4, release: 0.3, filter: { type: 'bandpass', freq: 260 * p.p, endFreq: 1900 * p.p, q: 1.1, sweep: 0.7 }, distortion: 0.3, pan: p.pan, send: p.send * 1.4, when: p.t });
    sub(s, p, 84, 0.7, 0.24);
  },
  'spell.chainLightning': (s, p) => SOUNDS.chain!(s, p),
  'spell.whirlwind': (s, p) => {
    s.noise({ color: 'pink', gain: 0.24 * p.g, attack: 0.15, decay: 0.4, sustain: 0.7, release: 0.5, duration: 1.4, filter: { type: 'bandpass', freq: 420 * p.p, endFreq: 1300 * p.p, q: 2.2, sweep: 1.2 }, pan: p.pan, send: p.send * 1.5, when: p.t });
    s.tone({ type: 'sawtooth', freq: 96 * p.p, gain: 0.09 * p.g, attack: 0.2, decay: 0.4, sustain: 0.7, release: 0.5, duration: 1.2, unison: 2, vibrato: { rate: 6.5, depth: 9 }, filter: { type: 'lowpass', freq: 900, q: 3 }, pan: p.pan, when: p.t });
  },
  'spell.summon': (s, p) => {
    sub(s, p, 56, 1.0, 0.28);
    chime(s, p, 62, 1.6, 0.16, [0, 3, 7, 10]);
    s.tone({ type: 'sawtooth', freq: 110 * p.p, freqEnd: 220 * p.p, freqTime: 1.0, gain: 0.12 * p.g, attack: 0.4, decay: 0.6, release: 0.5, unison: 3, unisonSpread: 24, filter: { type: 'lowpass', freq: 400, endFreq: 1800, q: 4, sweep: 1.1 }, pan: p.pan, send: p.send * 2, when: p.t });
  },
  'spell.shield': (s, p) => {
    chime(s, p, 74, 0.9, 0.16, [0, 7, 14]);
    s.noise({ color: 'white', gain: 0.14 * p.g, attack: 0.06, decay: 0.5, release: 0.4, filter: { type: 'highpass', freq: 1800, endFreq: 5200, q: 1.2, sweep: 0.6 }, pan: p.pan, send: p.send * 1.8, when: p.t });
  },
  'spell.heal': (s, p) => SOUNDS.heal!(s, p),
  'spell.teleportOut': (s, p) => {
    s.tone({ type: 'triangle', freq: 620 * p.p, freqEnd: 120 * p.p, freqTime: 0.35, gain: 0.16 * p.g, attack: 0.004, decay: 0.35, release: 0.25, ring: { freq: 173, depth: 0.4 }, pan: p.pan, send: p.send * 1.8, delaySend: 0.25, when: p.t });
    s.noise({ color: 'white', gain: 0.14 * p.g, attack: 0.004, decay: 0.3, release: 0.2, filter: { type: 'bandpass', freq: 4200, endFreq: 700, q: 2, sweep: 0.32 }, pan: p.pan, send: p.send * 1.6, when: p.t });
  },
  'spell.teleportIn': (s, p) => {
    s.tone({ type: 'triangle', freq: 120 * p.p, freqEnd: 780 * p.p, freqTime: 0.28, gain: 0.16 * p.g, attack: 0.004, decay: 0.3, release: 0.22, ring: { freq: 211, depth: 0.4 }, pan: p.pan, send: p.send * 1.8, delaySend: 0.25, when: p.t });
    crack(s, p, 3800, 0.08, 0.22, 1.8);
  },
};

// Aliases used by different parts of the game for the same event.
SOUNDS['pickup'] = (s, p) => chime(s, p, 79, 0.3, 0.14, [0, 7]);
SOUNDS['loot.gold'] = SOUNDS['gold']!;
SOUNDS['inventory.open'] = SOUNDS['ui.open']!;
SOUNDS['inventory.close'] = SOUNDS['ui.close']!;
SOUNDS['button'] = SOUNDS['ui.click']!;
SOUNDS['click'] = SOUNDS['ui.click']!;
SOUNDS['error'] = SOUNDS['ui.error']!;
SOUNDS['open'] = SOUNDS['ui.open']!;
SOUNDS['close'] = SOUNDS['ui.close']!;
SOUNDS['select'] = SOUNDS['ui.select']!;
SOUNDS['hit.physical'] = SOUNDS['hit.melee']!;
SOUNDS['miss'] = SOUNDS['swing.miss']!;
SOUNDS['explosion'] = SOUNDS['spell.explosion']!;

// --- family fallbacks --------------------------------------------------------

const SURFACES: Record<string, { freq: number; q: number; color: 'white' | 'pink' | 'brown'; gain: number; dur: number }> = {
  stone: { freq: 1200, q: 1.4, color: 'white', gain: 0.11, dur: 0.09 },
  dirt: { freq: 620, q: 0.9, color: 'brown', gain: 0.1, dur: 0.11 },
  wood: { freq: 900, q: 2.6, color: 'pink', gain: 0.11, dur: 0.1 },
  metal: { freq: 2600, q: 3.2, color: 'white', gain: 0.09, dur: 0.13 },
  water: { freq: 1800, q: 1.2, color: 'white', gain: 0.12, dur: 0.16 },
  snow: { freq: 3200, q: 0.8, color: 'white', gain: 0.08, dur: 0.12 },
  ash: { freq: 700, q: 0.7, color: 'pink', gain: 0.09, dur: 0.13 },
  bone: { freq: 1500, q: 2.8, color: 'white', gain: 0.1, dur: 0.09 },
  flesh: { freq: 420, q: 1.0, color: 'brown', gain: 0.12, dur: 0.12 },
};

const FAMILY_GROWL: Record<string, { base: number; kind: 'growl' | 'screech' | 'metal' | 'ooze' }> = {
  undead: { base: 150, kind: 'growl' },
  demon: { base: 92, kind: 'growl' },
  beast: { base: 175, kind: 'growl' },
  construct: { base: 260, kind: 'metal' },
  insect: { base: 780, kind: 'screech' },
  aberration: { base: 340, kind: 'screech' },
  elemental: { base: 130, kind: 'growl' },
  humanoid: { base: 210, kind: 'growl' },
  plant: { base: 190, kind: 'ooze' },
  ooze: { base: 120, kind: 'ooze' },
};

function monsterVoice(family: string, kind: string): SoundFn {
  const def = FAMILY_GROWL[family] ?? FAMILY_GROWL.beast!;
  const long = kind === 'death' ? 1.0 : kind === 'aggro' ? 0.6 : 0.28;
  const gain = kind === 'death' ? 0.3 : kind === 'hurt' ? 0.2 : 0.24;
  return (s, p) => {
    switch (def.kind) {
      case 'screech':
        screech(s, p, def.base, long, gain);
        break;
      case 'metal':
        metallic(s, p, def.base, long, gain, [1, 1.9, 3.3, 5.7]);
        s.noise({ color: 'white', gain: gain * 0.5 * p.g, attack: 0.004, decay: long * 0.6, release: long * 0.4, filter: { type: 'bandpass', freq: 2200 * p.p, endFreq: 900, q: 3, sweep: long }, distortion: 0.3, pan: p.pan, send: p.send, when: p.t });
        break;
      case 'ooze':
        squelch(s, p, long, gain);
        break;
      default:
        growl(s, p, def.base, long, gain, kind === 'death' ? 0.5 : 0.35);
    }
    if (kind === 'death') thump(s, p, 78, 0.35, 0.3);
  };
}

/** Resolves an unregistered id through its family, or returns undefined. */
function derive(id: string): SoundFn | undefined {
  const parts = id.split('.');
  const head = parts[0] ?? '';
  const tail = parts.slice(1).join('.');

  switch (head) {
    case 'cast':
      return castOf(tail);
    case 'hit':
    case 'impact':
      return impactOf(tail);
    case 'nova':
      return novaOf(tail);
    case 'beam':
      return beamOf(tail);
    case 'cone':
    case 'breath':
      return coneOf(tail);
    case 'footstep':
    case 'step': {
      const sfc = SURFACES[tail] ?? SURFACES.stone!;
      return (s, p) => {
        s.noise({
          color: sfc.color,
          gain: sfc.gain * p.g,
          attack: 0.001,
          decay: sfc.dur,
          release: sfc.dur * 0.6,
          filter: { type: 'bandpass', freq: sfc.freq * p.p, endFreq: sfc.freq * 0.4 * p.p, q: sfc.q, sweep: sfc.dur },
          pan: p.pan,
          send: p.send * 1.2,
          when: p.t,
        });
        thump(s, { ...p, g: p.g * 0.45 }, 92, 0.07, 0.16);
      };
    }
    case 'pickup':
    case 'drop': {
      const r = (RARITY_CHIME as Record<string, { midi: number; spread: number[]; gain: number; dur: number }>)[tail];
      if (!r) return undefined;
      return (s, p) => {
        chime(s, p, r.midi, r.dur, r.gain, r.spread);
        if (r.dur > 0.8) {
          // High rarities get a swelling pad under the chime — the "oh" moment.
          s.tone({ type: 'sawtooth', freq: midiToFreq(r.midi - 24) * p.p, gain: 0.1 * p.g, attack: 0.12, decay: r.dur, release: r.dur * 0.6, unison: 3, unisonSpread: 16, filter: { type: 'lowpass', freq: 500, endFreq: 1800, q: 3, sweep: r.dur }, pan: 0, send: p.send * 2, when: p.t });
        }
      };
    }
    case 'monster': {
      const seg = tail.split('.');
      return monsterVoice(seg[0] ?? 'beast', seg[1] ?? 'aggro');
    }
    case 'growl':
      return monsterVoice(tail || 'beast', 'aggro');
    case 'screech':
      return (s, p) => screech(s, p, 760, 0.4, 0.24);
    case 'death':
      return monsterVoice(tail || 'beast', 'death');
    case 'block':
      return SOUNDS['block'];
    case 'spell':
      return castOf('arcane');
    case 'ui':
      return SOUNDS['ui.click'];
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// The singleton
// ---------------------------------------------------------------------------

/** Per-id retrigger guard, in seconds. Prevents phase-cancelling machine-gun. */
const MIN_INTERVAL = 0.032;
/** Beyond this many world units, a sound is not worth a voice. */
const MAX_AUDIBLE = 42;

export interface PlayOpts {
  volume?: number;
  pitch?: number;
  x?: number;
  z?: number;
}

class AudioEngine {
  private synth: Synth | null = null;
  private musicDir: MusicDirector | null = null;
  private rng: Rng = new Random(0x50a7d);

  private lx = 0;
  private lz = 0;
  private facing = 0;

  private lastPlayed = new Map<string, number>();
  private resolved = new Map<string, SoundFn | null>();

  private settings: GameSettings | null = null;
  private masterVol = 0.8;
  private sfxVol = 0.85;
  private musicVol = 0.55;
  private started = false;
  private muted = false;

  private unsubs: Array<() => void> = [];

  /** Called once at boot, before any gesture; the context resumes on input. */
  init(settings: GameSettings): void {
    if (this.synth) {
      this.applySettings(settings);
      return;
    }
    try {
      this.synth = new Synth();
    } catch (err) {
      console.warn('[audio] WebAudio unavailable; running silent', err);
      this.synth = null;
      return;
    }
    this.musicDir = new MusicDirector(this.synth);
    this.applySettings(settings);

    // Browsers hold the context suspended until the user interacts. Latch on
    // the first gesture of any kind and start whatever music was requested.
    const kick = (): void => {
      this.synth?.resume();
      if (!this.started && this.synth && this.synth.ctx.state === 'running') {
        this.started = true;
        this.musicDir?.onContextStarted();
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, kick, { passive: true });
      this.unsubs.push(() => window.removeEventListener(ev, kick));
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.unsubs.push(() => document.removeEventListener('visibilitychange', this.onVisibility));

    // Any system can request a sound or a track without importing this module.
    this.unsubs.push(
      events.on('sfx', (e) => this.play(e.id, { volume: e.volume, pitch: e.pitch, x: e.x, z: e.z })),
      events.on('music', (e) => this.music(e.track, e.fade)),
      // The settings panel emits this on every slider move. Nothing was
      // listening, so the volume sliders wrote a number into the save file and
      // changed nothing you could hear.
      events.on('settings:changed', () => this.applySettings(save.settings)),
    );
  }

  private onVisibility = (): void => {
    // Duck rather than suspend: suspending the context makes resume glitch.
    const s = this.synth;
    if (!s) return;
    const target = document.hidden ? 0 : this.masterVol;
    s.master.gain.setTargetAtTime(target, s.ctx.currentTime, 0.08);
  };

  /**
   * Fire a one-shot. `id` keys into the synth registry; unknown ids fall
   * through the family resolver and are then ignored silently.
   */
  play(id: string, opts?: PlayOpts): void {
    const s = this.synth;
    if (!s || this.muted || this.sfxVol <= 0.0001) return;
    if (s.ctx.state !== 'running') {
      s.resume();
      return;
    }

    const fn = this.lookup(id);
    if (!fn) return;

    const now = s.ctx.currentTime;
    const last = this.lastPlayed.get(id) ?? -1;
    if (now - last < MIN_INTERVAL) return;

    // --- positional ------------------------------------------------------
    let gain = opts?.volume ?? 1;
    let pan = 0;
    let send = 1;
    if (opts?.x !== undefined && opts.z !== undefined) {
      const dx = opts.x - this.lx;
      const dz = opts.z - this.lz;
      const dist = Math.hypot(dx, dz);
      if (dist > MAX_AUDIBLE) return;
      // Rotate into listener space so panning follows the camera yaw.
      const cos = Math.cos(-this.facing);
      const sin = Math.sin(-this.facing);
      const rx = dx * cos - dz * sin;
      pan = Math.max(-0.85, Math.min(0.85, rx / 11));
      gain *= 1 / (1 + dist * 0.14);
      // Distant sounds sit further back in the reverb.
      send = 1 + Math.min(1.6, dist * 0.05);
    }
    if (gain < 0.008) return;

    // --- voice budget -----------------------------------------------------
    if (!s.canVoice(2)) return;

    this.lastPlayed.set(id, now);
    const pitch = (opts?.pitch ?? 1) * this.rng.range(0.94, 1.06);

    try {
      fn(s, {
        t: now + 0.002,
        g: gain * this.sfxVol,
        p: pitch,
        pan,
        send: 0.5 * send,
        rng: this.rng,
      });
    } catch (err) {
      console.warn(`[audio] "${id}" failed`, err);
    }
  }

  private lookup(id: string): SoundFn | null {
    const cached = this.resolved.get(id);
    if (cached !== undefined) return cached;
    const fn = SOUNDS[id] ?? derive(id) ?? null;
    this.resolved.set(id, fn);
    return fn;
  }

  /** Crossfade the procedural music layer. */
  music(track: string, fadeSeconds = 2): void {
    this.musicDir?.play(track, fadeSeconds);
  }

  /** Combat heat, 0..1 — fades extra music layers in and out. */
  setIntensity(v: number): void {
    this.musicDir?.setIntensity(v);
  }

  /** Position the listener for panning. `facing` is a yaw in radians. */
  setListener(x: number, z: number, facing: number): void {
    this.lx = x;
    this.lz = z;
    this.facing = facing;
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.masterVol = clamp01(settings.masterVolume ?? 0.8);
    this.sfxVol = clamp01(settings.sfxVolume ?? 0.85);
    this.musicVol = clamp01(settings.musicVolume ?? 0.55);
    const s = this.synth;
    if (!s) return;
    const t = s.ctx.currentTime;
    s.master.gain.setTargetAtTime(document.hidden ? 0 : this.masterVol, t, 0.05);
    s.sfxBus.gain.setTargetAtTime(this.sfxVol * 1.05, t, 0.05);
    s.musicBus.gain.setTargetAtTime(this.musicVol * 0.85, t, 0.1);
  }

  stopAll(): void {
    this.synth?.stopAll();
    this.musicDir?.stop(0.4);
  }

  /** Instant silence toggle, used by the pause menu. */
  setMuted(v: boolean): void {
    this.muted = v;
    const s = this.synth;
    if (!s) return;
    s.master.gain.setTargetAtTime(v ? 0 : this.masterVol, s.ctx.currentTime, 0.05);
  }

  /** Exposed for debug overlays. */
  get diagnostics(): { voices: number; state: string; track: string | null } {
    return {
      voices: this.synth?.activeVoices ?? 0,
      state: this.synth?.ctx.state ?? 'none',
      track: this.musicDir?.currentTrack ?? null,
    };
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.musicDir?.dispose();
    this.synth?.dispose();
    this.synth = null;
    this.musicDir = null;
    void this.settings;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Fully synthesised — no audio files. */
export const audio = new AudioEngine();

/** Element ids the sound registry understands, for tooling. */
export const AUDIO_ELEMENTS: readonly DamageType[] = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane'];

/** All explicitly registered sound ids, for a debug browser. */
export function soundIds(): string[] {
  return Object.keys(SOUNDS).sort();
}
