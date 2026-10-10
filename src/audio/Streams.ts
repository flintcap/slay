/**
 * SLAY — long recorded audio (music and ambience beds), streamed.
 *
 * A two-minute track decoded into memory costs tens of megabytes, so long
 * files play through `<audio>` elements routed into the WebAudio graph. Each
 * layer owns two decks and crossfades between them, both when it changes
 * track and when a track nears its end, so loops have no gap at the seam and
 * playlists flow from one file into the next.
 *
 * A file that fails to load is skipped; a layer whose every file fails just
 * stays silent.
 */

import { assetUrl } from '../core/Assets';
import type { Rng } from '../types';

interface Deck {
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode | null;
  gain: GainNode;
  file: string | null;
  /** True while this deck is the one the layer is playing (not fading out). */
  live: boolean;
}

export interface StreamOpts {
  /** Seconds to fade the new material in (and the old out). */
  fade?: number;
  /** 'loop' cycles the playlist forever; 'once' plays it through and stops. */
  mode?: 'loop' | 'once';
  /** Shuffles playlist order with this stream. */
  rng?: Rng;
  /** Seconds of overlap between consecutive files. */
  overlap?: number;
  /** Linear gain for this material. */
  gain?: number;
  /** Start partway into the first file (0..1 of its length), so a bed does not always begin at the same drip. */
  startAt?: number;
}

/** One layer of streamed audio: a playlist on two crossfading decks. */
export class StreamLayer {
  private ctx: AudioContext;
  private out: GainNode;
  private decks: [Deck, Deck];
  private cur = 0;
  private list: string[] = [];
  private index = 0;
  private opts: Required<Omit<StreamOpts, 'rng'>> & { rng?: Rng } = { fade: 2, mode: 'loop', overlap: 3, gain: 1, startAt: 0 };
  private failed = new Set<string>();
  private active = false;
  private key: string | null = null;
  /** True while the owning context is running and elements may play. */
  private running = false;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.decks = [this.makeDeck(), this.makeDeck()];
  }

  private makeDeck(): Deck {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = false;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.out);
    let node: MediaElementAudioSourceNode | null = null;
    try {
      node = this.ctx.createMediaElementSource(el);
      node.connect(gain);
    } catch {
      node = null;
    }
    const deck: Deck = { el, node, gain, file: null, live: false };
    el.addEventListener('error', () => {
      if (deck.file) this.failed.add(deck.file);
      if (deck.live) this.advance();
    });
    el.addEventListener('ended', () => {
      if (deck.live) this.advance(true);
    });
    return deck;
  }

  /** What this layer is playing, as the key it was asked for. */
  get playing(): string | null {
    return this.active ? this.key : null;
  }

  /**
   * Plays `files` under `key`. Asking again for the key already playing does
   * nothing, so scenes can re-request their music freely.
   */
  play(key: string, files: readonly string[], opts: StreamOpts = {}): void {
    if (this.active && this.key === key) return;
    this.key = key;
    this.opts = { fade: opts.fade ?? 2, mode: opts.mode ?? 'loop', overlap: opts.overlap ?? 3, gain: opts.gain ?? 1, startAt: opts.startAt ?? 0, rng: opts.rng };
    const list = files.filter((f) => !this.failed.has(f));
    if (opts.rng && list.length > 1) opts.rng.shuffle(list);
    this.list = list;
    this.index = 0;
    this.active = list.length > 0;
    if (!this.active) {
      this.fadeAll(this.opts.fade);
      return;
    }
    this.startFile(this.list[0]!, this.opts.fade, this.opts.startAt);
  }

  /** Fades everything out. */
  stop(fade = 1.5): void {
    this.active = false;
    this.key = null;
    this.fadeAll(fade);
  }

  /** The owning context started or stopped; elements follow. */
  setRunning(running: boolean): void {
    this.running = running;
    for (const d of this.decks) {
      if (!d.live) continue;
      if (running) void d.el.play().catch(() => undefined);
      else d.el.pause();
    }
  }

  /** Per-layer level, for ducking and the volume slider. */
  setLevel(v: number, time = 0.3): void {
    this.out.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, time);
  }

  /** Called a few times a second: starts the next file before this one ends. */
  tick(): void {
    if (!this.active) return;
    const d = this.decks[this.cur];
    if (!d.live) return;
    const dur = d.el.duration;
    if (!isFinite(dur) || dur <= 0) return;
    const overlap = Math.min(this.opts.overlap, dur * 0.25);
    if (d.el.currentTime >= dur - overlap) this.advance();
  }

  private advance(ended = false): void {
    if (!this.active) return;
    const atEnd = this.index + 1 >= this.list.length;
    if (atEnd && this.opts.mode === 'once') {
      if (ended) this.stop(0.2);
      return;
    }
    // Skip files that failed since the playlist was made.
    for (let tries = 0; tries < this.list.length; tries++) {
      this.index = (this.index + 1) % this.list.length;
      if (this.index === 0 && this.opts.rng && this.list.length > 2) {
        // Reshuffle each cycle, but never repeat the file that just played.
        const last = this.list[this.list.length - 1]!;
        this.opts.rng.shuffle(this.list);
        if (this.list[0] === last) this.list.push(this.list.shift()!);
      }
      const next = this.list[this.index]!;
      if (!this.failed.has(next)) {
        this.startFile(next, ended ? 0.05 : Math.min(this.opts.overlap, 4), 0);
        return;
      }
    }
    this.stop(0.5);
  }

  private startFile(file: string, fade: number, startAt: number): void {
    const now = this.ctx.currentTime;
    const old = this.decks[this.cur];
    const next = this.decks[1 - this.cur]!;
    this.cur = 1 - this.cur;
    // Fade the outgoing deck.
    if (old.live) this.fadeDeck(old, fade);
    const prev = next.file;
    next.live = true;
    next.file = file;
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(0.0001, now);
    next.gain.gain.linearRampToValueAtTime(this.opts.gain, now + Math.max(0.02, fade));
    if (prev !== file || !next.el.src) next.el.src = assetUrl(file);
    const seek = (): void => {
      if (startAt > 0 && isFinite(next.el.duration)) next.el.currentTime = next.el.duration * Math.min(0.9, startAt);
    };
    if (next.el.readyState >= 1) seek();
    else next.el.addEventListener('loadedmetadata', seek, { once: true });
    if (startAt <= 0) {
      try {
        next.el.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
    if (this.running) void next.el.play().catch(() => undefined);
  }

  private fadeDeck(d: Deck, fade: number): void {
    const now = this.ctx.currentTime;
    d.live = false;
    const g = d.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + Math.max(0.02, fade));
    const el = d.el;
    window.setTimeout(() => {
      if (!d.live) el.pause();
    }, (fade + 0.1) * 1000);
  }

  private fadeAll(fade: number): void {
    for (const d of this.decks) if (d.live) this.fadeDeck(d, fade);
  }

  dispose(): void {
    for (const d of this.decks) {
      d.live = false;
      d.el.pause();
      d.el.removeAttribute('src');
      d.node?.disconnect();
      d.gain.disconnect();
    }
    this.out.disconnect();
  }
}
