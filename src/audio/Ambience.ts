/**
 * SLAY — the sound of the place.
 *
 * Music says how to feel; ambience says where you are. Each biome gets a bed:
 * one or two looping noise layers shaped into room tone, wind, water or hum,
 * breathing slowly under their own LFOs, plus a sparse scatter of one-shot
 * "events" — a drip, a chain settling, a distant anvil, a creak of ice — at
 * random intervals and random positions in the stereo field. The scatter is
 * what makes it a place instead of a hiss: nothing repeats on a grid.
 *
 * Loops are built from raw nodes and live for as long as the bed does, so they
 * cost nothing per frame and never touch the combat voice budget. One-shots go
 * through the synth and ask for a voice like anything else; in a big fight
 * they simply wait.
 */

import { Random } from '../core/RNG';
import type { Rng } from '../types';
import { Synth, midiToFreq, type NoiseColor } from './Synth';

/** A continuous layer: filtered looping noise, or a held drone. */
interface LoopDef {
  kind: 'noise' | 'drone';
  color?: NoiseColor;
  /** Filter type and centre. */
  filter: BiquadFilterType;
  freq: number;
  q: number;
  gain: number;
  /** Slow sweep of the filter: depth in Hz and rate in Hz. */
  sweep?: { depth: number; rate: number };
  /** Slow swell of the gain: depth 0..1 and rate in Hz. */
  swell?: { depth: number; rate: number };
  /** Drone only: oscillator waveform and pitch. */
  wave?: OscillatorType;
  midi?: number;
  detune?: number;
}

type EventKind = 'drip' | 'chain' | 'rumble' | 'anvil' | 'hiss' | 'buzz' | 'creak' | 'gust' | 'crackle' | 'whisper' | 'lap' | 'bird' | 'moan' | 'shimmer';

interface BedDef {
  loops: LoopDef[];
  /** One-shots and how often each comes, per minute on average. */
  events: Array<{ kind: EventKind; perMinute: number }>;
  /** Footstep surface for this place. */
  surface: string;
}

const BEDS: Record<string, BedDef> = {
  crypt: {
    loops: [
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 260, q: 0.7, gain: 0.32, swell: { depth: 0.3, rate: 0.05 } },
      { kind: 'noise', color: 'pink', filter: 'bandpass', freq: 520, q: 3, gain: 0.05, sweep: { depth: 180, rate: 0.03 } },
    ],
    events: [{ kind: 'drip', perMinute: 8 }, { kind: 'chain', perMinute: 2.5 }, { kind: 'moan', perMinute: 1.2 }, { kind: 'rumble', perMinute: 1 }],
    surface: 'stone',
  },
  caverns: {
    loops: [
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 200, q: 0.8, gain: 0.34, swell: { depth: 0.35, rate: 0.04 } },
      { kind: 'noise', color: 'pink', filter: 'bandpass', freq: 1400, q: 1.2, gain: 0.025, sweep: { depth: 500, rate: 0.06 } },
    ],
    events: [{ kind: 'drip', perMinute: 22 }, { kind: 'rumble', perMinute: 2 }, { kind: 'gust', perMinute: 1.5 }],
    surface: 'dirt',
  },
  foundry: {
    loops: [
      { kind: 'drone', wave: 'sawtooth', midi: 31, detune: 9, filter: 'lowpass', freq: 160, q: 2, gain: 0.08, swell: { depth: 0.25, rate: 0.12 } },
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 420, q: 0.8, gain: 0.26 },
      { kind: 'noise', color: 'white', filter: 'highpass', freq: 3200, q: 0.6, gain: 0.012, swell: { depth: 0.6, rate: 0.2 } },
    ],
    events: [{ kind: 'anvil', perMinute: 5 }, { kind: 'hiss', perMinute: 5 }, { kind: 'chain', perMinute: 2 }, { kind: 'rumble', perMinute: 2 }],
    surface: 'metal',
  },
  sunkenTemple: {
    loops: [
      { kind: 'noise', color: 'pink', filter: 'lowpass', freq: 700, q: 0.6, gain: 0.1, swell: { depth: 0.6, rate: 0.09 } },
      { kind: 'drone', wave: 'sine', midi: 35, detune: 4, filter: 'lowpass', freq: 300, q: 1, gain: 0.06, swell: { depth: 0.4, rate: 0.03 } },
    ],
    events: [{ kind: 'lap', perMinute: 10 }, { kind: 'drip', perMinute: 12 }, { kind: 'whisper', perMinute: 1.5 }],
    surface: 'water',
  },
  hive: {
    loops: [
      { kind: 'drone', wave: 'sawtooth', midi: 46, detune: 22, filter: 'bandpass', freq: 520, q: 4, gain: 0.03, swell: { depth: 0.5, rate: 0.35 } },
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 300, q: 0.9, gain: 0.28, swell: { depth: 0.3, rate: 0.07 } },
    ],
    events: [{ kind: 'buzz', perMinute: 9 }, { kind: 'crackle', perMinute: 5 }, { kind: 'drip', perMinute: 5 }],
    surface: 'flesh',
  },
  frostvault: {
    loops: [
      { kind: 'noise', color: 'pink', filter: 'bandpass', freq: 600, q: 2.2, gain: 0.12, sweep: { depth: 380, rate: 0.07 }, swell: { depth: 0.5, rate: 0.05 } },
      { kind: 'noise', color: 'white', filter: 'highpass', freq: 5200, q: 0.7, gain: 0.014, swell: { depth: 0.5, rate: 0.11 } },
    ],
    events: [{ kind: 'creak', perMinute: 5 }, { kind: 'gust', perMinute: 4 }, { kind: 'shimmer', perMinute: 2 }],
    surface: 'snow',
  },
  ashwaste: {
    loops: [
      { kind: 'noise', color: 'pink', filter: 'bandpass', freq: 380, q: 1.4, gain: 0.16, sweep: { depth: 260, rate: 0.05 }, swell: { depth: 0.55, rate: 0.06 } },
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 220, q: 0.7, gain: 0.2 },
    ],
    events: [{ kind: 'gust', perMinute: 6 }, { kind: 'crackle', perMinute: 8 }, { kind: 'rumble', perMinute: 1.5 }],
    surface: 'ash',
  },
  voidspire: {
    loops: [
      { kind: 'drone', wave: 'sine', midi: 38, detune: 31, filter: 'lowpass', freq: 600, q: 1, gain: 0.07, swell: { depth: 0.5, rate: 0.04 } },
      { kind: 'drone', wave: 'triangle', midi: 69, detune: 18, filter: 'bandpass', freq: 1400, q: 3, gain: 0.012, swell: { depth: 0.8, rate: 0.07 } },
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 240, q: 0.8, gain: 0.18 },
    ],
    events: [{ kind: 'shimmer', perMinute: 5 }, { kind: 'whisper', perMinute: 3 }, { kind: 'moan', perMinute: 1.5 }],
    surface: 'stone',
  },
  town: {
    loops: [
      { kind: 'noise', color: 'pink', filter: 'bandpass', freq: 450, q: 1, gain: 0.07, sweep: { depth: 200, rate: 0.04 }, swell: { depth: 0.5, rate: 0.05 } },
      { kind: 'noise', color: 'brown', filter: 'lowpass', freq: 900, q: 0.5, gain: 0.05, swell: { depth: 0.7, rate: 0.6 } },
    ],
    events: [{ kind: 'crackle', perMinute: 10 }, { kind: 'anvil', perMinute: 3 }, { kind: 'bird', perMinute: 4 }, { kind: 'gust', perMinute: 2 }],
    surface: 'dirt',
  },
};

/** Music track ids and biome ids that map to a bed. Menus and death have none. */
const BED_FOR: Record<string, string> = {
  dirge: 'crypt', drip: 'caverns', forge: 'foundry', submerged: 'sunkenTemple',
  chitter: 'hive', glacial: 'frostvault', windswept: 'ashwaste', null: 'voidspire', town: 'town',
  crypt: 'crypt', caverns: 'caverns', foundry: 'foundry', sunkenTemple: 'sunkenTemple',
  hive: 'hive', frostvault: 'frostvault', ashwaste: 'ashwaste', voidspire: 'voidspire', dungeon: 'crypt',
};

/** The bed a music track implies, or null for one that should be silent. */
export function bedFor(track: string): string | null {
  return BED_FOR[track] ?? null;
}

export function bedIds(): string[] {
  return Object.keys(BEDS);
}

export function bedDef(id: string): { surface: string; events: string[] } | null {
  const b = BEDS[id];
  return b ? { surface: b.surface, events: b.events.map((e) => e.kind) } : null;
}

interface LiveBed {
  id: string;
  out: GainNode;
  nodes: AudioScheduledSourceNode[];
  timers: number[];
}

export class Ambience {
  private synth: Synth;
  private bus: GainNode;
  private live: LiveBed | null = null;
  private rng: Rng = new Random(0xa3b1e);
  /** Set by the engine from the sfx slider. */
  private level = 1;

  constructor(synth: Synth) {
    this.synth = synth;
    this.bus = synth.ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(synth.master);
  }

  get current(): string | null {
    return this.live?.id ?? null;
  }

  get surface(): string {
    return (this.live && BEDS[this.live.id]?.surface) ?? 'stone';
  }

  setLevel(v: number): void {
    this.level = Math.max(0, Math.min(1, v));
    this.bus.gain.setTargetAtTime(0.9 * this.level, this.synth.ctx.currentTime, 0.2);
  }

  /** Crossfades to the bed for `id`; null fades to silence. */
  play(id: string | null, fade = 2.5): void {
    if (this.live?.id === id) return;
    this.stop(fade);
    if (!id) return;
    const def = BEDS[id];
    if (!def) return;
    const ctx = this.synth.ctx;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(1, now + Math.max(0.1, fade));
    out.connect(this.bus);
    // A little of the bed in the reverb puts it in the same room as the fight.
    const send = ctx.createGain();
    send.gain.value = 0.25;
    out.connect(send);
    send.connect(this.synth.reverb);

    const bed: LiveBed = { id, out, nodes: [], timers: [] };
    for (const loop of def.loops) this.buildLoop(loop, bed);
    for (const ev of def.events) this.scheduleEvent(bed, ev.kind, ev.perMinute);
    this.live = bed;
  }

  private buildLoop(l: LoopDef, bed: LiveBed): void {
    const ctx = this.synth.ctx;
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = l.filter;
    filter.frequency.value = l.freq;
    filter.Q.value = l.q;
    const g = ctx.createGain();
    g.gain.value = l.gain;
    filter.connect(g);
    g.connect(bed.out);

    if (l.kind === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.synth.noiseBuffer(l.color ?? 'brown');
      src.loop = true;
      src.connect(filter);
      src.start(now, this.rng.range(0, 1.8));
      bed.nodes.push(src);
    } else {
      const base = midiToFreq(l.midi ?? 36);
      for (const d of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = l.wave ?? 'sine';
        o.frequency.value = base;
        o.detune.value = d * (l.detune ?? 6);
        o.connect(filter);
        o.start(now);
        bed.nodes.push(o);
      }
    }
    if (l.sweep) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = l.sweep.rate;
      const depth = ctx.createGain();
      depth.gain.value = l.sweep.depth;
      lfo.connect(depth);
      depth.connect(filter.frequency);
      lfo.start(now + this.rng.range(0, 3));
      bed.nodes.push(lfo);
    }
    if (l.swell) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = l.swell.rate;
      const depth = ctx.createGain();
      depth.gain.value = l.gain * l.swell.depth;
      lfo.connect(depth);
      depth.connect(g.gain);
      lfo.start(now + this.rng.range(0, 3));
      bed.nodes.push(lfo);
    }
  }

  /** Poisson-ish scheduling: each event re-arms itself at a random interval. */
  private scheduleEvent(bed: LiveBed, kind: EventKind, perMinute: number): void {
    const mean = 60 / Math.max(0.1, perMinute);
    const arm = (): void => {
      if (this.live !== bed) return;
      // Exponential-ish wait, clamped so nothing clumps or goes silent forever.
      const wait = Math.min(mean * 3, Math.max(0.6, -Math.log(1 - this.rng.next() * 0.98) * mean));
      const id = window.setTimeout(() => {
        if (this.live !== bed) return;
        if (this.synth.ctx.state === 'running' && this.synth.canVoice(4)) this.fire(kind, bed.out);
        arm();
      }, wait * 1000);
      bed.timers.push(id);
      if (bed.timers.length > 64) bed.timers.splice(0, bed.timers.length - 32);
    };
    arm();
  }

  /** One scattered event. Placed somewhere in the stereo field, never centre. */
  private fire(kind: EventKind, dest: AudioNode): void {
    const s = this.synth;
    const r = this.rng;
    const t = s.ctx.currentTime + 0.01;
    const pan = r.range(0.25, 0.9) * (r.chance(0.5) ? -1 : 1);
    const far = r.range(0.4, 1);
    const send = 0.5 + (1 - far) * 0.4;
    switch (kind) {
      case 'drip': {
        // A drop: a quick falling sine "plink" with a wet tail.
        const f = r.range(900, 1900);
        s.tone({ type: 'sine', freq: f, freqEnd: f * 0.55, freqTime: 0.05, gain: 0.07 * far, attack: 0.001, decay: 0.06, release: 0.08, pan, send: send * 1.6, delaySend: 0.08, dest, when: t });
        break;
      }
      case 'chain':
        for (let i = 0; i < 5; i++) {
          s.tone({ type: 'triangle', freq: r.range(700, 1300), gain: 0.025 * far, attack: 0.002, decay: 0.12, release: 0.1, pan, send: send * 1.5, dest, when: t + i * r.range(0.05, 0.12) });
        }
        break;
      case 'rumble':
        s.noise({ color: 'brown', gain: 0.22 * far, attack: 0.6, decay: 1.6, release: 1.0, filter: { type: 'lowpass', freq: 180, endFreq: 70, q: 0.8, sweep: 2 }, pan: pan * 0.4, send, dest, when: t });
        break;
      case 'anvil': {
        const b = r.range(380, 460);
        for (const k of [1, 2.76, 5.4]) {
          s.tone({ type: 'sine', freq: b * k, gain: (0.05 * far) / k, attack: 0.001, decay: 0.8 / k, release: 0.4, pan, send: send * 2, dest, when: t });
        }
        break;
      }
      case 'hiss':
        s.noise({ color: 'white', gain: 0.05 * far, attack: 0.05, decay: 0.8, release: 0.4, filter: { type: 'highpass', freq: 2600, endFreq: 1600, q: 0.7, sweep: 0.9 }, pan, send, dest, when: t });
        break;
      case 'buzz':
        s.tone({ type: 'sawtooth', freq: r.range(160, 260), gain: 0.025 * far, attack: 0.15, decay: 0.4, sustain: 0.6, release: 0.3, duration: r.range(0.4, 1.0), filter: { type: 'bandpass', freq: 900, q: 5 }, vibrato: { rate: r.range(18, 30), depth: 12 }, pan, send, dest, when: t });
        break;
      case 'creak':
        s.tone({ type: 'sawtooth', freq: r.range(70, 120), freqEnd: r.range(60, 140), freqTime: 0.6, gain: 0.03 * far, attack: 0.08, decay: 0.5, release: 0.3, filter: { type: 'bandpass', freq: 1200, q: 6 }, vibrato: { rate: 23, depth: 6 }, pan, send: send * 1.5, dest, when: t });
        break;
      case 'gust':
        s.noise({ color: 'pink', gain: 0.1 * far, attack: 0.9, decay: 1.2, release: 0.9, filter: { type: 'bandpass', freq: r.range(300, 600), endFreq: r.range(700, 1300), q: 1.8, sweep: 2.2 }, pan, send, dest, when: t });
        break;
      case 'crackle':
        for (let i = 0; i < 6; i++) {
          s.noise({ color: 'white', gain: 0.04 * far * r.range(0.4, 1), attack: 0.0006, decay: 0.012, release: 0.01, filter: { type: 'highpass', freq: 2400, q: 1 }, pan: pan + r.range(-0.1, 0.1), dest, when: t + i * r.range(0.02, 0.09) });
        }
        break;
      case 'whisper':
        s.noise({ color: 'pink', gain: 0.05 * far, attack: 0.4, decay: 0.9, release: 0.6, filter: { type: 'bandpass', freq: r.range(1800, 2600), endFreq: r.range(900, 1400), q: 7, sweep: 1.2 }, pan, send: send * 2, delaySend: 0.2, dest, when: t });
        break;
      case 'lap':
        s.noise({ color: 'brown', gain: 0.14 * far, attack: 0.25, decay: 0.5, release: 0.4, filter: { type: 'lowpass', freq: 900, endFreq: 300, q: 1.6, sweep: 0.7 }, pan, send, dest, when: t });
        break;
      case 'bird':
        for (let i = 0; i < 3; i++) {
          const f = r.range(2600, 3800);
          s.tone({ type: 'sine', freq: f, freqEnd: f * r.range(1.1, 1.4), freqTime: 0.06, gain: 0.02 * far, attack: 0.004, decay: 0.07, release: 0.04, pan, send: send * 1.4, dest, when: t + i * 0.11 });
        }
        break;
      case 'moan':
        s.tone({ type: 'sawtooth', freq: r.range(90, 130), freqEnd: r.range(70, 100), freqTime: 2, gain: 0.025 * far, attack: 0.8, decay: 1.4, release: 1.0, unison: 2, unisonSpread: 18, filter: { type: 'bandpass', freq: 500, endFreq: 320, q: 3, sweep: 2 }, vibrato: { rate: 4.5, depth: 3 }, pan, send: send * 2, dest, when: t });
        break;
      case 'shimmer': {
        const base = r.range(70, 82);
        for (let i = 0; i < 4; i++) {
          s.tone({ type: 'sine', freq: midiToFreq(base + i * 7), gain: 0.018 * far, attack: 0.3, decay: 1.2, release: 0.8, pan: pan * (1 - i * 0.2), send: send * 2.2, delaySend: 0.3, dest, when: t + i * 0.15 });
        }
        break;
      }
    }
  }

  stop(fade = 1.5): void {
    const bed = this.live;
    if (!bed) return;
    this.live = null;
    for (const id of bed.timers) window.clearTimeout(id);
    const ctx = this.synth.ctx;
    const now = ctx.currentTime;
    bed.out.gain.cancelScheduledValues(now);
    bed.out.gain.setValueAtTime(Math.max(0.0001, bed.out.gain.value), now);
    bed.out.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.05, fade));
    for (const n of bed.nodes) {
      try {
        n.stop(now + fade + 0.1);
      } catch {
        /* already stopped */
      }
    }
    window.setTimeout(() => {
      try {
        bed.out.disconnect();
      } catch {
        /* gone */
      }
    }, (fade + 0.3) * 1000);
  }

  dispose(): void {
    this.stop(0.1);
    try {
      this.bus.disconnect();
    } catch {
      /* gone */
    }
  }
}
