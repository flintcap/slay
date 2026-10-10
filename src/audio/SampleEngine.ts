/**
 * SLAY — the sound engine: recorded samples, recorded music, recorded rooms.
 *
 * `play(id)` looks the id up in the bank (`Bank.ts`), picks one of its
 * recorded variations with the seeded stream (never the one that just
 * played), nudges its pitch and level, places it in the stereo field from
 * where it happened relative to the hero and the fixed camera, and sends a
 * little of it into a room reverb that grows with distance and with the size
 * of the place.
 *
 * Three things keep the mix intact under load:
 *   - a **voice pool** with priorities: when it is full, a footstep or a
 *     monster grunt is cut to make room for the hit you landed or the
 *     wind-up you must dodge, never the other way round;
 *   - a **per-id limit and retrigger gap**, so forty kills are not forty
 *     copies of one file stacked on top of each other;
 *   - **distance falloff and culling** around the listener.
 *
 * Samples load lazily from `public/assets/sounds/`; the common ones are
 * fetched the moment audio starts and the rest in the background. A sound
 * whose file has not arrived yet (or never will) is simply silent.
 */

import type { GameSettings, Rng } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { fetchAsset } from '../core/Assets';
import { Random } from '../core/RNG';
import { getBase } from '../sim/Loot';
import { bankIds, coreIds, resolveSound, soundDef, soundFiles, type Bus } from './Bank';
import { Score } from './Score';
import { Beds, bedFor } from './Beds';

export interface PlayOpts {
  volume?: number;
  pitch?: number;
  x?: number;
  z?: number;
}

interface Voice {
  id: string;
  prio: number;
  bus: Bus;
  src: AudioBufferSourceNode;
  gain: GainNode;
  started: number;
  ends: number;
}

/** Beyond this many world units, a sound is not worth a voice. */
const MAX_AUDIBLE = 40;
/** Voices per bus. */
const POOL: Record<Bus, number> = { sfx: 40, ui: 8, amb: 8 };
/** A late sample may still start this long after it was asked for. */
const LATE_OK = 0.12;

/** Item categories onto the pickup sound for that kind of thing. */
const PICKUP_KIND: Record<string, string> = {
  sword: 'weapon', axe: 'weapon', mace: 'weapon', dagger: 'weapon', spear: 'weapon', bow: 'weapon', crossbow: 'weapon',
  wand: 'weapon', staff: 'weapon', scepter: 'weapon', quiver: 'weapon',
  shield: 'armor', helm: 'armor', chest: 'armor', gloves: 'armor', boots: 'armor', belt: 'armor', orb: 'jewel',
  amulet: 'jewel', ring: 'jewel', charm: 'jewel', gem: 'gem', rune: 'gem', potion: 'potion', material: 'material',
};

export class SampleEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Bus | 'music', GainNode>> = {};
  private reverbIn: GainNode | null = null;
  private reverbOut: GainNode | null = null;
  private score: Score | null = null;
  private beds: Beds | null = null;

  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices: Voice[] = [];
  private lastStart = new Map<string, number>();
  private lastPick = new Map<string, number>();
  private resolved = new Map<string, string | null>();

  private rng: Rng = new Random(0x50a7d);
  private lx = 0;
  private lz = 0;
  /** Camera yaw: panning follows the screen, not which way the hero faces. */
  private camYaw = Math.PI * 0.25;
  private stepAccum = 0;
  private stepSide = 1;
  private stepPrimed = false;

  private masterVol = 0.8;
  private sfxVol = 0.85;
  private musicVol = 0.55;
  private muted = false;
  private started = false;
  private combat = 0;
  private timer: number | null = null;
  private unsubs: Array<() => void> = [];

  /** Sounds refused for want of a voice since boot. */
  refused = 0;

  /** Called once at boot, before any gesture; the context resumes on input. */
  init(settings: GameSettings): void {
    if (this.ctx) {
      this.applySettings(settings);
      return;
    }
    const w = typeof window !== 'undefined' ? (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }) : null;
    const AC = w?.AudioContext ?? w?.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (err) {
      console.warn('[audio] WebAudio unavailable; running silent', err);
      this.ctx = null;
      return;
    }
    this.buildGraph(this.ctx);
    this.applySettings(settings);
    this.installUiSounds();
    this.installGameHooks();

    // Browsers hold the context suspended until the user interacts. Latch on
    // the first gesture of any kind and start whatever was requested.
    const kick = (): void => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== 'running') void ctx.resume().then(() => this.onRunning()).catch(() => undefined);
      else this.onRunning();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, kick, { passive: true });
      this.unsubs.push(() => window.removeEventListener(ev, kick));
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.unsubs.push(() => document.removeEventListener('visibilitychange', this.onVisibility));
    this.unsubs.push(
      events.on('sfx', (e) => this.play(e.id, { volume: e.volume, pitch: e.pitch, x: e.x, z: e.z })),
      events.on('music', (e) => this.music(e.track, e.fade)),
      events.on('settings:changed', () => this.applySettings(save.settings)),
    );
    this.timer = window.setInterval(() => this.tick(), 200);
  }

  private buildGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    // A gentle limiter so a screen-clearing nova cannot clip the output.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;
    for (const b of ['sfx', 'ui', 'amb', 'music'] as const) {
      const g = ctx.createGain();
      g.connect(master);
      this.buses[b] = g;
    }
    // Room reverb: a convolver fed by every voice's send.
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(ctx, 2.4);
    const rin = ctx.createGain();
    const rout = ctx.createGain();
    rout.gain.value = 0.35;
    rin.connect(conv);
    conv.connect(rout);
    rout.connect(this.buses.sfx!);
    this.reverbIn = rin;
    this.reverbOut = rout;
    this.score = new Score(ctx, this.buses.music!, this.rng.fork('music'));
    this.beds = new Beds(ctx, this.buses.amb!, this.rng.fork('ambience'), (id, dx, dz, v) => this.play(id, { x: this.lx + dx, z: this.lz + dz, volume: v }));
  }

  /** A decaying stereo noise tail: the impulse of a stone room. */
  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    const r = new Random(0x7e7e7);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections are denser and louder; the tail darkens as it decays.
        d[i] = (r.next() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
      }
      // One-pole lowpass so the tail is not a hiss.
      let y = 0;
      for (let i = 0; i < len; i++) {
        const k = 0.35 + 0.5 * (1 - i / len);
        y += (d[i]! - y) * k;
        d[i] = y;
      }
    }
    return buf;
  }

  private onRunning(): void {
    if (this.started || !this.ctx || this.ctx.state !== 'running') return;
    this.started = true;
    this.score?.setRunning(true);
    this.beds?.setRunning(true);
    // The common sounds first, then everything else in the background.
    const core = coreIds();
    for (const id of core) this.loadId(id);
    const rest = bankIds().filter((id) => !core.includes(id));
    let i = 0;
    const next = (): void => {
      if (!this.ctx || i >= rest.length) return;
      const batch = rest.slice(i, i + 4);
      i += 4;
      void Promise.all(batch.map((id) => this.loadId(id))).then(() => window.setTimeout(next, 30));
    };
    window.setTimeout(next, 400);
  }

  private onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(document.hidden || this.muted ? 0 : this.masterVol, ctx.currentTime, 0.08);
  };

  // -------------------------------------------------------------------------
  // Samples
  // -------------------------------------------------------------------------

  private loadId(id: string): Promise<unknown> {
    return Promise.all(soundFiles(id).map((f) => this.load(f)));
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const have = this.loading.get(file);
    if (have) return have;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const p = fetchAsset(file)
      .then((bytes) => (bytes ? ctx.decodeAudioData(bytes.slice(0)) : null))
      .catch(() => null)
      .then((buf) => {
        this.buffers.set(file, buf);
        return buf;
      });
    this.loading.set(file, p);
    return p;
  }

  private lookup(id: string): string | null {
    let r = this.resolved.get(id);
    if (r === undefined) {
      r = resolveSound(id);
      this.resolved.set(id, r);
    }
    return r;
  }

  /**
   * Fire a one-shot. Unknown ids fall through the bank's family rules and
   * are then ignored silently.
   */
  play(id: string, opts?: PlayOpts): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.sfxVol <= 0.0001) return;
    if (ctx.state !== 'running') return;
    const bank = this.lookup(id);
    if (!bank) return;
    const def = soundDef(bank);
    for (const extra of def.with) this.play(extra, opts);
    const now = ctx.currentTime;
    if (now - (this.lastStart.get(bank) ?? -1) < def.gap) return;

    // --- where it is --------------------------------------------------------
    let gain = (opts?.volume ?? 1) * def.vol;
    let pan = 0;
    let send = def.send;
    if (opts?.x !== undefined && opts.z !== undefined) {
      const dx = opts.x - this.lx;
      const dz = opts.z - this.lz;
      const dist = Math.hypot(dx, dz);
      if (dist > MAX_AUDIBLE) return;
      // Screen-right of the fixed camera: (cos yaw, -sin yaw) in world x/z.
      const sx = dx * Math.cos(this.camYaw) - dz * Math.sin(this.camYaw);
      pan = Math.max(-0.8, Math.min(0.8, sx / 12));
      gain *= 1 / (1 + Math.max(0, dist - 2) * 0.11);
      send = Math.min(1, send + dist * 0.015);
    }
    if (gain < 0.01) return;

    // --- which take ---------------------------------------------------------
    const files = soundFiles(bank);
    if (files.length === 0) return;
    let pick = files.length === 1 ? 0 : this.rng.int(0, files.length - 1);
    const last = this.lastPick.get(bank);
    if (files.length > 1 && pick === last) pick = (pick + 1 + this.rng.int(0, files.length - 2)) % files.length;
    const file = files[pick]!;
    const buf = this.buffers.get(file);
    if (buf === null) return; // known missing
    const asked = now;
    const fire = (b: AudioBuffer): void => {
      if (!this.ctx || this.ctx.currentTime - asked > LATE_OK) return;
      this.start(bank, def.prio, def.bus, def.max, b, gain, pan, send, (opts?.pitch ?? 1) * def.rate, def.jitter, def.volJitter);
    };
    this.lastStart.set(bank, now);
    this.lastPick.set(bank, pick);
    if (buf) fire(buf);
    else void this.load(file).then((b) => b && fire(b));
  }

  private start(id: string, prio: number, bus: Bus, max: number, buf: AudioBuffer, gain: number, pan: number, send: number, rate: number, jitter: number, volJitter: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.reap(now);

    // Same id already sounding too many times: cut its oldest.
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= max) {
      if (prio < 2 && same.length >= max + 1) {
        this.refused++;
        return;
      }
      this.kill(same[0]!, now);
    }
    // Bus full: make room by cutting something that matters less.
    const onBus = this.voices.filter((v) => v.bus === bus);
    if (onBus.length >= POOL[bus]) {
      let victim: Voice | null = null;
      for (const v of onBus) if (v.prio < prio || (v.prio === prio && prio < 2)) if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.started < victim.started)) victim = v;
      if (!victim) {
        this.refused++;
        return;
      }
      this.kill(victim, now);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const r = rate * (1 + this.rng.range(-jitter, jitter));
    src.playbackRate.value = Math.max(0.25, Math.min(3, r));
    const g = ctx.createGain();
    g.gain.value = Math.max(0, gain * (1 + this.rng.range(-volJitter, volJitter)));
    src.connect(g);
    let tail: AudioNode = g;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(this.buses[bus]!);
    if (send > 0.01 && this.reverbIn && bus !== 'ui') {
      const s = ctx.createGain();
      s.gain.value = send;
      tail.connect(s);
      s.connect(this.reverbIn);
      src.addEventListener('ended', () => s.disconnect(), { once: true });
    }
    const voice: Voice = { id, prio, bus, src, gain: g, started: now, ends: now + buf.duration / src.playbackRate.value };
    src.addEventListener(
      'ended',
      () => {
        tail.disconnect();
        const i = this.voices.indexOf(voice);
        if (i >= 0) this.voices.splice(i, 1);
      },
      { once: true },
    );
    src.start(now + 0.002);
    this.voices.push(voice);
  }

  private reap(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i]!.ends < now - 0.05) this.voices.splice(i, 1);
  }

  private kill(v: Voice, now: number): void {
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + 0.04);
    try {
      v.src.stop(now + 0.05);
    } catch {
      /* already stopped */
    }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  // -------------------------------------------------------------------------
  // Music and ambience
  // -------------------------------------------------------------------------

  /**
   * Crossfade the music. A place's track also brings in that place's
   * ambience bed; state tracks (boss, victory, danger) leave the bed where it
   * is, so the room does not go quiet when the boss wakes.
   */
  music(track: string, fadeSeconds = 2): void {
    this.score?.play(track, fadeSeconds);
    if (/^(boss|victory|danger|ambient)/.test(track)) return;
    this.beds?.play(bedFor(track), Math.max(1, fadeSeconds * 1.2));
    this.applySpace();
  }

  /** Sets the ambience bed directly, by place or biome key. Null for silence. */
  ambience(bed: string | null): void {
    this.beds?.play(bed ? bedFor(bed) : null);
    this.applySpace();
  }

  private applySpace(): void {
    const ctx = this.ctx;
    if (!ctx || !this.reverbOut || !this.beds) return;
    this.reverbOut.gain.setTargetAtTime(0.12 + this.beds.space * 0.5, ctx.currentTime, 1);
  }

  /** The floor material under the hero, from the current bed. */
  get surface(): string {
    return this.beds?.surface ?? 'stone';
  }

  /** How much fighting is going on right now, 0..1. The room sinks a little under a fight. */
  setCombatFloor(v: number): void {
    this.combat = v;
    this.beds?.setCombat(v);
  }

  /** Combat heat, 0..1. Recorded music has no layers to add; kept for callers. */
  setIntensity(v: number): void {
    if (v <= 0) this.beds?.setCombat(this.combat);
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  /** Buttons click and tabs tick without every panel having to remember to. */
  private installUiSounds(): void {
    const isButton = (el: Element | null): Element | null =>
      el?.closest?.('button, [role="button"], .btn, .tab, [data-sfx]') ?? null;
    let lastHover: Element | null = null;
    const down = (e: Event): void => {
      const b = isButton(e.target as Element | null);
      if (!b) return;
      if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') {
        this.play('ui.error', { volume: 0.6 });
        return;
      }
      const tag = b.getAttribute('data-sfx');
      this.play(tag ?? (b.classList.contains('tab') || b.getAttribute('role') === 'tab' ? 'ui.tab' : 'ui.click'), { volume: 0.8 });
    };
    const over = (e: Event): void => {
      const b = isButton(e.target as Element | null);
      if (!b || b === lastHover) return;
      lastHover = b;
      this.play('ui.hover', { volume: 0.5 });
    };
    document.addEventListener('pointerdown', down, { capture: true, passive: true });
    document.addEventListener('pointerover', over, { capture: true, passive: true });
    this.unsubs.push(
      () => document.removeEventListener('pointerdown', down, { capture: true }),
      () => document.removeEventListener('pointerover', over, { capture: true }),
      events.on('ui:open', (e) => {
        if (e.panel !== 'hud') this.play('ui.open', { volume: 0.8 });
      }),
      events.on('ui:close', (e) => {
        if (e.panel !== 'hud') this.play('ui.close', { volume: 0.8 });
      }),
    );
  }

  /** Sounds that follow game events rather than a caller asking. */
  private installGameHooks(): void {
    this.unsubs.push(
      // What you picked up, by what it is: a blade rings, mail rattles, a ring clicks.
      events.on('loot:pickedUp', (e) => {
        let kind = 'material';
        try {
          kind = PICKUP_KIND[getBase(e.item.baseId).category] ?? 'material';
        } catch {
          /* unknown base: the generic grab */
        }
        this.play(`pickup.kind.${kind}`, { volume: 0.9 });
      }),
      // A boss arriving gets a sting under its first roar.
      events.on('boss:engaged', () => this.play('boss.intro')),
    );
  }

  /** Position the listener. `facing` is accepted for callers; panning follows the camera. */
  setListener(x: number, z: number, _facing?: number): void {
    // Footsteps: one per stride of ground actually covered. Big jumps (a
    // teleport, a level load) are not walking and reset the stride instead.
    const moved = Math.hypot(x - this.lx, z - this.lz);
    if (!this.stepPrimed || moved > 2.5) {
      this.stepPrimed = true;
      this.stepAccum = 0;
    } else if (moved > 0.0005) {
      this.stepAccum += moved;
      const stride = 1.15;
      if (this.stepAccum >= stride) {
        this.stepAccum -= stride;
        this.stepSide = -this.stepSide;
        this.lx = x;
        this.lz = z;
        this.play(`footstep.${this.surface}`, { volume: 1, x: x + this.stepSide * 0.5, z });
      }
    }
    this.lx = x;
    this.lz = z;
  }

  /** The camera's yaw, if it ever turns; panning follows the screen. */
  setCameraYaw(yaw: number): void {
    this.camYaw = yaw;
  }

  applySettings(settings: GameSettings): void {
    this.masterVol = clamp01(settings.masterVolume ?? 0.8);
    this.sfxVol = clamp01(settings.sfxVolume ?? 0.85);
    this.musicVol = clamp01(settings.musicVolume ?? 0.55);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // Squared: sliders feel even across their travel.
    this.master?.gain.setTargetAtTime(document.hidden || this.muted ? 0 : this.masterVol, t, 0.05);
    this.buses.sfx?.gain.setTargetAtTime(this.sfxVol * this.sfxVol * 1.1, t, 0.05);
    this.buses.ui?.gain.setTargetAtTime(this.sfxVol * this.sfxVol * 1.1, t, 0.05);
    this.buses.amb?.gain.setTargetAtTime(this.sfxVol * this.sfxVol * 0.9, t, 0.1);
    this.buses.music?.gain.setTargetAtTime(this.musicVol * this.musicVol * 0.9, t, 0.1);
  }

  private tick(): void {
    this.score?.tick();
    this.beds?.tick();
  }

  stopAll(): void {
    const ctx = this.ctx;
    if (ctx) for (const v of [...this.voices]) this.kill(v, ctx.currentTime);
    this.score?.stop(0.4);
    this.beds?.stop(0.4);
  }

  /** Instant silence toggle, used by the pause menu. */
  setMuted(v: boolean): void {
    this.muted = v;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(v || document.hidden ? 0 : this.masterVol, ctx.currentTime, 0.05);
  }

  /** Exposed for debug overlays. */
  get diagnostics(): { voices: number; sfx: number; ui: number; amb: number; refused: number; loaded: number; state: string; track: string | null; bed: string | null } {
    const n = (b: Bus): number => this.voices.filter((v) => v.bus === b).length;
    return {
      voices: this.voices.length,
      sfx: n('sfx'),
      ui: n('ui'),
      amb: n('amb'),
      refused: this.refused,
      loaded: [...this.buffers.values()].filter(Boolean).length,
      state: this.ctx?.state ?? 'none',
      track: this.score?.currentTrack ?? null,
      bed: this.beds?.place ?? null,
    };
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.score?.dispose();
    this.beds?.dispose();
    this.score = null;
    this.beds = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.buffers.clear();
    this.loading.clear();
    this.voices.length = 0;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
