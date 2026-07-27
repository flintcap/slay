/**
 * SLAY — the WebAudio synthesis engine.
 *
 * There are no audio files in this game. Every sword hit, every spell, every
 * bar of music is built here out of oscillators, noise buffers, filters and
 * envelopes. That constraint is also an advantage: a synthesised hit can have
 * its pitch, brightness and length varied per call, so forty kills in a row
 * never machine-gun the same waveform.
 *
 * Signal chain:
 *
 *     sfxBus  ──┬──────────────────────────┐
 *               └─► sfxSend  ─┐            │
 *     musicBus ─┬──────────── ┼──────────► master ─► limiter ─► destination
 *               ├─► musSend  ─┤            │
 *               └─► delay ────┘            │
 *                              reverb ─────┘
 *
 * The reverb is a *generated* impulse response: filtered, decaying noise
 * rendered into an AudioBuffer at init. The limiter on the master is what
 * keeps forty simultaneous deaths from clipping into a fuzz.
 */

import { Random } from '../core/RNG';
import type { Rng } from '../types';

export type NoiseColor = 'white' | 'pink' | 'brown';

export interface ADSR {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** Sweep target; the filter glides here over the note's body. */
  endFreq?: number;
  q?: number;
  /** Time in seconds for the sweep. Defaults to the note duration. */
  sweep?: number;
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Pitch glide target. */
  freqEnd?: number;
  /** Glide duration; defaults to the whole note. */
  freqTime?: number;
  /** Exponential (default) or linear pitch glide. */
  glide?: 'exp' | 'lin';
  detune?: number;
  gain?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** Total time held before the release stage. */
  duration?: number;
  filter?: FilterSpec;
  /** 0..1 waveshaper drive. */
  distortion?: number;
  /** -1 left, 1 right. */
  pan?: number;
  /** Reverb send, 0..1. */
  send?: number;
  /** Delay send, 0..1. */
  delaySend?: number;
  vibrato?: { rate: number; depth: number };
  /** Ring/AM modulation for metallic and unnatural timbres. */
  ring?: { freq: number; depth: number };
  when?: number;
  dest?: AudioNode;
  /** Number of detuned copies. 2-3 makes a pad; 1 is a pure tone. */
  unison?: number;
  unisonSpread?: number;
}

export interface NoiseOpts {
  color?: NoiseColor;
  gain?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  duration?: number;
  filter?: FilterSpec;
  distortion?: number;
  pan?: number;
  send?: number;
  delaySend?: number;
  /** Playback rate — shifts the noise character brighter or darker. */
  rate?: number;
  when?: number;
  dest?: AudioNode;
}

const DEFAULT_ADSR: ADSR = { attack: 0.004, decay: 0.08, sustain: 0.0, release: 0.06 };

/** Equal temperament. MIDI 69 = A4 = 440Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Synth {
  readonly ctx: AudioContext;

  /** Everything terminates here. */
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;

  readonly reverb: ConvolverNode;
  readonly reverbReturn: GainNode;
  readonly sfxSend: GainNode;
  readonly musicSend: GainNode;

  readonly delay: DelayNode;
  readonly delayFeedback: GainNode;
  readonly delayFilter: BiquadFilterNode;
  readonly delaySendBus: GainNode;

  private noiseCache = new Map<NoiseColor, AudioBuffer>();
  private shaperCache = new Map<number, Float32Array<ArrayBuffer>>();
  private rng: Rng = new Random(0x5ec0de);

  /** Nodes that are still sounding, so `stopAll` can silence them. */
  private activeNodes = new Set<AudioScheduledSourceNode>();

  /** Simple polyphony cap — the voice limiter. */
  private voices = 0;
  maxVoices = 26;

  ready = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });

    const ctx = this.ctx;

    // A gentle limiter, not a pumping compressor: high ratio, high threshold,
    // fast attack. Its only job is to catch transient stacks.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.limiter);

    // --- reverb ------------------------------------------------------------
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4, 2600, 0.55);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.9;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    // --- delay -------------------------------------------------------------
    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.38;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.36;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2200;
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delayFilter.connect(this.master);
    this.delaySendBus = ctx.createGain();
    this.delaySendBus.gain.value = 1;
    this.delaySendBus.connect(this.delay);

    // --- buses -------------------------------------------------------------
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.16;
    this.sfxBus.connect(this.sfxSend);
    this.sfxSend.connect(this.reverb);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.32;
    this.musicBus.connect(this.musicSend);
    this.musicSend.connect(this.reverb);

    this.ready = true;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Browsers start the context suspended until a gesture. Call this on input. */
  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Sets the reverb character — small stone room vs cathedral. */
  setSpace(seconds: number, decay: number, tone: number): void {
    this.reverb.buffer = this.makeImpulse(seconds, decay, tone, 0.55);
  }

  // -- generators -----------------------------------------------------------

  /**
   * Renders a reverb impulse response: stereo decaying noise, low-passed by a
   * running one-pole so the tail darkens as it decays (which is what makes an
   * artificial reverb sound like a room instead of like static).
   */
  makeImpulse(seconds: number, decay: number, tone: number, stereoWidth: number): AudioBuffer {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    const rng = new Random(0xa11ce);
    // One-pole coefficient from the target cutoff.
    const baseCoef = Math.exp((-2 * Math.PI * tone) / rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      const width = ch === 0 ? 1 : 1 - stereoWidth * 0.35;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        // Darken progressively: the coefficient walks toward 1 over the tail.
        const coef = baseCoef + (1 - baseCoef) * t * 0.85;
        const n = rng.range(-1, 1);
        lp = n * (1 - coef) + lp * coef;
        // A short pre-delay-free early build avoids an unnatural instant onset.
        const onset = i < rate * 0.006 ? i / (rate * 0.006) : 1;
        data[i] = lp * env * onset * width;
      }
    }
    return buf;
  }

  /** Cached noise buffers. Pink and brown are integrated white noise. */
  noiseBuffer(color: NoiseColor = 'white'): AudioBuffer {
    const cached = this.noiseCache.get(color);
    if (cached) return cached;
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 2);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const rng = new Random(color === 'white' ? 0x11 : color === 'pink' ? 0x22 : 0x33);

    if (color === 'white') {
      for (let i = 0; i < len; i++) d[i] = rng.range(-1, 1);
    } else if (color === 'pink') {
      // Voss-McCartney-ish: sum of octave-spaced random walks.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rng.range(-1, 1);
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = rng.range(-1, 1);
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    this.noiseCache.set(color, buf);
    return buf;
  }

  /** Cached tanh-ish waveshaper curves for distortion / saturation. */
  private shaperCurve(amount: number): Float32Array<ArrayBuffer> {
    const key = Math.round(amount * 20);
    const cached = this.shaperCache.get(key);
    if (cached) return cached;
    const n = 1024;
    const curve = new Float32Array(n);
    const k = 1 + amount * 60;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    this.shaperCache.set(key, curve);
    return curve;
  }

  // -- routing helpers ------------------------------------------------------

  private buildTail(
    src: AudioNode,
    o: { filter?: FilterSpec; distortion?: number; pan?: number; send?: number; delaySend?: number; dest?: AudioNode },
    t0: number,
    body: number,
  ): { input: AudioNode; out: GainNode } {
    const ctx = this.ctx;
    let node: AudioNode = src;

    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.setValueAtTime(Math.max(20, o.filter.freq), t0);
      f.Q.value = o.filter.q ?? 1;
      if (o.filter.endFreq !== undefined) {
        f.frequency.exponentialRampToValueAtTime(
          Math.max(20, o.filter.endFreq),
          t0 + Math.max(0.01, o.filter.sweep ?? body),
        );
      }
      node.connect(f);
      node = f;
    }

    if (o.distortion && o.distortion > 0) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.shaperCurve(o.distortion);
      ws.oversample = '2x';
      node.connect(ws);
      node = ws;
    }

    const out = ctx.createGain();
    out.gain.value = 1;
    node.connect(out);

    let terminal: AudioNode = out;
    if (o.pan !== undefined && o.pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(p);
      terminal = p;
    }

    terminal.connect(o.dest ?? this.sfxBus);
    if (o.send) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      terminal.connect(s);
      s.connect(this.reverb);
    }
    if (o.delaySend) {
      const s = ctx.createGain();
      s.gain.value = o.delaySend;
      terminal.connect(s);
      s.connect(this.delaySendBus);
    }
    return { input: src, out };
  }

  /**
   * Applies an ADSR to a gain param. Uses `setTargetAtTime` for the decay so
   * the curve is exponential — linear decays sound synthetic and cheap.
   */
  private applyEnv(param: AudioParam, t0: number, adsr: ADSR, peak: number, body: number): number {
    const a = Math.max(0.001, adsr.attack);
    const d = Math.max(0.001, adsr.decay);
    const s = Math.max(0, adsr.sustain) * peak;
    const r = Math.max(0.008, adsr.release);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    if (s > 0.0002) {
      param.setTargetAtTime(s, t0 + a, d * 0.4);
      param.setValueAtTime(Math.max(0.0002, s), t0 + a + body);
      param.exponentialRampToValueAtTime(0.0001, t0 + a + body + r);
      return a + body + r;
    }
    param.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
    return a + d + r;
  }

  private track(node: AudioScheduledSourceNode, stopAt: number): void {
    this.activeNodes.add(node);
    this.voices++;
    node.onended = () => {
      this.activeNodes.delete(node);
      this.voices = Math.max(0, this.voices - 1);
      try {
        node.disconnect();
      } catch {
        /* already torn down */
      }
    };
    try {
      node.stop(stopAt);
    } catch {
      /* stop already scheduled */
    }
  }

  /** True when the voice budget still has room. */
  canVoice(cost = 1): boolean {
    return this.voices + cost <= this.maxVoices;
  }

  get activeVoices(): number {
    return this.voices;
  }

  // -- players --------------------------------------------------------------

  /** Plays a single oscillator voice (or a detuned unison stack). */
  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const t0 = o.when ?? ctx.currentTime;
    const body = o.duration ?? 0;
    const adsr: ADSR = {
      attack: o.attack ?? DEFAULT_ADSR.attack,
      decay: o.decay ?? DEFAULT_ADSR.decay,
      sustain: o.sustain ?? DEFAULT_ADSR.sustain,
      release: o.release ?? DEFAULT_ADSR.release,
    };

    const merge = ctx.createGain();
    merge.gain.value = 1;
    const tail = this.buildTail(merge, o, t0, Math.max(body, adsr.decay));
    const total = this.applyEnv(tail.out.gain, t0, adsr, o.gain ?? 0.3, body);
    const stopAt = t0 + total + 0.05;

    const unison = Math.max(1, o.unison ?? 1);
    const spread = o.unisonSpread ?? 9;

    for (let i = 0; i < unison; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? 'sine';
      const detune = (o.detune ?? 0) + (unison > 1 ? (i - (unison - 1) / 2) * spread : 0);
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(Math.max(1, o.freq), t0);
      if (o.freqEnd !== undefined) {
        const ft = t0 + Math.max(0.005, o.freqTime ?? Math.max(body, adsr.decay));
        if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, o.freqEnd), ft);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), ft);
      }

      if (o.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = o.vibrato.rate;
        const lg = ctx.createGain();
        lg.gain.value = o.vibrato.depth;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(stopAt);
      }

      if (o.ring) {
        // Ring modulation: multiply by a second oscillator via a gain node.
        const carrier = ctx.createOscillator();
        carrier.frequency.value = o.ring.freq;
        const ringGain = ctx.createGain();
        ringGain.gain.value = 1 - o.ring.depth;
        const modDepth = ctx.createGain();
        modDepth.gain.value = o.ring.depth;
        carrier.connect(modDepth);
        modDepth.connect(ringGain.gain);
        osc.connect(ringGain);
        ringGain.connect(merge);
        carrier.start(t0);
        carrier.stop(stopAt);
      } else {
        osc.connect(merge);
      }

      osc.start(t0);
      this.track(osc, stopAt);
    }
  }

  /** Plays a filtered noise burst — the backbone of every impact and footstep. */
  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    const t0 = o.when ?? ctx.currentTime;
    const body = o.duration ?? 0;
    const adsr: ADSR = {
      attack: o.attack ?? 0.002,
      decay: o.decay ?? 0.12,
      sustain: o.sustain ?? 0,
      release: o.release ?? 0.05,
    };
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(o.color ?? 'white');
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    const tail = this.buildTail(src, o, t0, Math.max(body, adsr.decay));
    const total = this.applyEnv(tail.out.gain, t0, adsr, o.gain ?? 0.3, body);
    const stopAt = t0 + total + 0.05;
    src.start(t0, this.rng.range(0, 1.5));
    this.track(src, stopAt);
  }

  /** Silences everything currently sounding. */
  stopAll(): void {
    const t = this.ctx.currentTime;
    for (const node of Array.from(this.activeNodes)) {
      try {
        node.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.activeNodes.clear();
    this.voices = 0;
  }

  dispose(): void {
    this.stopAll();
    try {
      void this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
