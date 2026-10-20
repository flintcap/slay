/**
 * SLAY — sculpting kit: the body parts creatures are assembled from.
 *
 * Every helper works in the rig's own proportions (`H`, the rig height), so
 * a ghoul's arm and a titan's arm come out of the same call. Sizes are given
 * as shares of `H` unless said otherwise.
 */
import * as THREE from 'three';
import type { CMat, RGB, Sculpt } from './Sculpt';
import { boxGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { capeCloth } from './ClothSheets';

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Hex colour to linear-ish RGB triple for paint. */
export function rgb(hex: number, k = 1): RGB {
  return [(((hex >> 16) & 255) / 255) * k, (((hex >> 8) & 255) / 255) * k, ((hex & 255) / 255) * k];
}

/** Mixes two hex colours. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function lerpV(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return a.clone().lerp(b, t);
}

/** The palette tint carried in `MonsterVisual.palette` ("key|0xRRGGBB"). */
export function paletteTint(palette: string, fallback = 0x9a9080): number {
  const m = /0x([0-9a-f]{6})/i.exec(palette);
  return m ? parseInt(m[1]!, 16) : fallback;
}

/** A small deterministic sequence for placing repeated details (spikes, pustules). */
export function seq(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// Upright bodies
// ---------------------------------------------------------------------------

export interface LimbOpt {
  mat?: CMat;
  /** Radius at the root and at the end, shares of H. */
  r1: number;
  r2: number;
  /** Knob at the joint (bony knees and elbows), share of H. */
  knob?: number;
  /** Muscle belly: a second ellipsoid swelling the upper part. */
  swell?: number;
}

/** A two-segment limb along the rig (arm or leg). */
export function limb2(s: Sculpt, a: string, b: string, c: string, o: LimbOpt, o2?: LimbOpt): void {
  const H = s.rig.height;
  const p = s.j(a);
  const q = s.j(b);
  const r = s.j(c);
  const mat = o.mat ?? 'skin';
  const lo = o2 ?? { ...o, r1: o.r2, r2: o.r2 * 0.75 };
  s.limb(a, p, q, o.r1 * H, o.r2 * H, { mat, blendAt: p, blendR: o.r1 * H * 2.5 });
  if (o.swell) s.ball(a, lerpV(p, q, 0.38), V(o.swell * H, o.swell * H * 1.8, o.swell * H), { mat, q: quatAlong(q.clone().sub(p)) });
  s.limb(b, q, r, lo.r1 * H, lo.r2 * H, { mat, blendAt: q, blendR: lo.r1 * H * 2 });
  if (lo.swell) s.ball(b, lerpV(q, r, 0.3), V(lo.swell * H, lo.swell * H * 1.8, lo.swell * H), { mat, q: quatAlong(r.clone().sub(q)) });
  if (o.knob) s.ball(b, q, o.knob * H, { mat, k: 0.004 });
}

/** Rotation turning +Y onto `dir`. */
export function quatAlong(dir: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
}

/** Claws or fingers off a hand (hard spikes), curling forward and down. */
export function claws(s: Sculpt, hand: string, tip: string, n: number, len: number, r: number, mat: CMat = 'skin', col?: RGB, curl = 0.5): void {
  const H = s.rig.height;
  const h = s.j(hand);
  const t = s.j(tip);
  const dir = t.clone().sub(h).normalize();
  const side = h.x >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const base = lerpV(h, t, 0.75).add(V(side * u * 0.035 * H, 0, u * 0.01 * H));
    const end = base.clone().addScaledVector(dir, len * H).add(V(side * u * 0.02 * H, 0, 0));
    s.hard(hand, spikeGeo(base, end, r * H, 5, V(0, -curl * len * H * 0.5, curl * len * H * 0.4), 3), mat, col);
  }
}

/** A thumb-and-fingers hand: palm block and finger spikes. */
export function hand(s: Sculpt, hand: string, tip: string, size: number, mat: CMat = 'skin', fingers = 4): void {
  const H = s.rig.height;
  const h = s.j(hand);
  const t = s.j(tip);
  s.ball(hand, lerpV(h, t, 0.35), V(size * H * 0.55, size * H * 0.8, size * H * 0.35), { mat, q: quatAlong(t.clone().sub(h)) });
  claws(s, hand, tip, fingers, size * 0.9, size * 0.12, mat, undefined, 0.35);
}

/** A plain foot from the ankle to the toe. */
export function foot(s: Sculpt, ankle: string, toe: string, w: number, mat: CMat = 'skin'): void {
  const H = s.rig.height;
  const a = s.j(ankle);
  const t = s.j(toe);
  const c = lerpV(a, t, 0.5);
  c.y = Math.max(0.012 * H, c.y * 0.5);
  s.box(ankle, c, V(w * H, 0.022 * H, a.distanceTo(t) * 0.55), { mat, round: 0.015 * H, k: 0.012 * H });
}

/** A neck from the chest to the head. */
export function neck(s: Sculpt, r1: number, r2: number, mat: CMat = 'skin'): void {
  const H = s.rig.height;
  s.limb('neck', s.j('chest').lerp(s.j('neck'), 0.5), s.j('head'), r1 * H, r2 * H, { mat });
}

// ---------------------------------------------------------------------------
// Bone
// ---------------------------------------------------------------------------

/** A skull on the head and jaw bones: cranium, brow, sockets, cheekbones, mandible and teeth. */
export function skull(s: Sculpt, o: { size?: number; mat?: CMat; teeth?: RGB; brow?: number; horns?: number; glow?: number } = {}): void {
  const H = s.rig.height;
  const k = (o.size ?? 1) * H;
  const mat = o.mat ?? 'skin';
  const h = s.j('head');
  const jw = s.j('jaw');
  const c = h.clone().add(V(0, 0.045 * k, 0.012 * k));
  s.ball('head', c, V(0.052 * k, 0.058 * k, 0.064 * k), { mat, k: 0.01 * k });
  // Face: brow ridge, maxilla, cheekbones.
  s.box('head', c.clone().add(V(0, 0.012 * k, 0.05 * k)), V(0.045 * k, 0.012 * k * (1 + (o.brow ?? 0)), 0.018 * k), { mat, k: 0.012 * k, round: 0.008 * k });
  s.box('head', c.clone().add(V(0, -0.028 * k, 0.045 * k)), V(0.03 * k, 0.022 * k, 0.022 * k), { mat, k: 0.012 * k, round: 0.01 * k });
  s.pair((_side, x) => s.ball('head', c.clone().add(V(x * 0.038 * k, -0.012 * k, 0.04 * k)), V(0.014 * k, 0.012 * k, 0.02 * k), { mat, k: 0.01 * k }));
  // Eye sockets and the nasal hole.
  s.pair((_side, x) => s.ball('head', c.clone().add(V(x * 0.021 * k, -0.002 * k, 0.062 * k)), V(0.015 * k, 0.014 * k, 0.016 * k), { mat, sub: true, k: 0.006 * k }));
  s.ball('head', c.clone().add(V(0, -0.024 * k, 0.07 * k)), V(0.007 * k, 0.011 * k, 0.012 * k), { mat, sub: true, k: 0.004 * k });
  // Mandible.
  const m = jw.clone().add(V(0, -0.012 * k, 0.02 * k));
  s.box('jaw', m, V(0.03 * k, 0.01 * k, 0.026 * k), { mat, k: 0.008 * k, round: 0.008 * k });
  s.pair((_side, x) => s.limb('jaw', m.clone().add(V(x * 0.03 * k, 0.0, -0.02 * k)), m.clone().add(V(x * 0.034 * k, 0.03 * k, -0.035 * k)), 0.008 * k, 0.007 * k, { mat, k: 0.006 * k }));
  // Teeth: two rows of short pegs.
  const tc = o.teeth ?? [0.85, 0.8, 0.66];
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.6;
    const top = c.clone().add(V(Math.sin(a) * 0.026 * k, -0.046 * k, 0.045 * k + Math.cos(a) * 0.016 * k));
    s.hard('head', spikeGeo(top, top.clone().add(V(0, -0.011 * k, 0)), 0.004 * k, 4, undefined, 1), mat, tc);
    const bot = m.clone().add(V(Math.sin(a) * 0.024 * k, 0.01 * k, 0.012 * k + Math.cos(a) * 0.012 * k));
    s.hard('jaw', spikeGeo(bot, bot.clone().add(V(0, 0.009 * k, 0)), 0.0038 * k, 4, undefined, 1), mat, tc);
  }
  if (o.horns) {
    s.pair((_side, x) => {
      const b = c.clone().add(V(x * 0.04 * k, 0.035 * k, 0.0));
      s.hard('head', spikeGeo(b, b.clone().add(V(x * 0.09 * k * o.horns!, 0.06 * k * o.horns!, -0.05 * k * o.horns!)), 0.014 * k, 6, V(0, 0.04 * k * o.horns!, -0.03 * k), 4), mat, tc);
    });
  }
  // Eyes: the sockets burn.
  if (o.glow !== 0) s.pair((_side, x) => s.eye('head', c.clone().add(V(x * 0.021 * k, -0.002 * k, 0.052 * k)), 0.009 * k, o.glow ?? 1));
}

/** A ribcage of hard rib arcs round the chest bone, a sternum, and the spine column. */
export function ribcage(s: Sculpt, o: { w?: number; d?: number; ribs?: number; r?: number; mat?: CMat; col?: RGB } = {}): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'skin';
  const ch = s.j('chest');
  const hp = s.j('hips');
  const w = (o.w ?? 0.075) * H;
  const d = (o.d ?? 0.06) * H;
  const n = o.ribs ?? 5;
  const r = (o.r ?? 0.0075) * H;
  const backZ = ch.z - d * 0.85;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const y = ch.y + 0.07 * H - t * 0.15 * H;
    const ww = w * (0.75 + 0.35 * Math.sin((0.2 + t * 0.7) * Math.PI));
    for (const x of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 0.86;
        // Ribs dip as they come round to the front.
        pts.push(V(x * Math.sin(a) * ww, y - Math.sin(a * 0.5) * 0.025 * H, backZ + (1 - Math.cos(a)) * d * 0.9));
      }
      s.hard('chest', tubeGeo(pts, (u) => r * (1 - 0.35 * u), 5), mat, o.col);
    }
  }
  // Sternum and the spine column.
  s.box('chest', V(0, ch.y - 0.01 * H, ch.z + d * 0.75), V(0.012 * H, 0.06 * H, 0.008 * H), { mat, k: 0.004 * H });
  const nk = s.j('neck');
  const pts = 9;
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    const p = t < 0.55 ? lerpV(hp, ch, t / 0.55) : lerpV(ch, nk, (t - 0.55) / 0.45);
    p.z -= d * 0.75 * Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.5 + (t < 0.55 ? 0.01 * H : d * 0.6);
    const bone = t < 0.3 ? 'hips' : t < 0.55 ? 'spine' : t < 0.92 ? 'chest' : 'neck';
    s.ball(bone, p, V(0.016 * H, 0.011 * H, 0.014 * H), { mat, k: 0.01 * H });
  }
  // Clavicles.
  s.pair((side, x) => s.limb('chest', V(x * 0.015 * H, nk.y - 0.03 * H, ch.z + d * 0.6), s.j(`arm${side}`).add(V(0, 0.005 * H, 0)), 0.008 * H, 0.007 * H, { mat, k: 0.006 * H }));
}

/** A pelvis bone: a broad flat basin. */
export function pelvisBone(s: Sculpt, mat: CMat = 'skin'): void {
  const H = s.rig.height;
  const hp = s.j('hips');
  s.pair((_side, x) => s.ball('hips', hp.clone().add(V(x * 0.04 * H, 0.012 * H, -0.004 * H)), V(0.038 * H, 0.04 * H, 0.016 * H), { mat, k: 0.012 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x * 0.5, x * 0.25)) }));
  s.box('hips', hp.clone().add(V(0, -0.012 * H, 0.014 * H)), V(0.03 * H, 0.012 * H, 0.012 * H), { mat, k: 0.01 * H });
}

/** Bony limbs: thin shafts with knobbed joints, bony hands and feet. */
export function boneLimbs(s: Sculpt, o: { r?: number; mat?: CMat; claws?: number; arms2?: boolean } = {}): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'skin';
  const r = (o.r ?? 0.014) * H;
  const sets = o.arms2 ? ['', '2'] : [''];
  s.pair((side) => {
    for (const k of sets) {
      if (!s.has(`arm${k}${side}`)) continue;
      s.ball(`arm${k}${side}`, s.j(`arm${k}${side}`), r * 1.6, { mat, k: 0.006 * H });
      s.limb(`arm${k}${side}`, s.j(`arm${k}${side}`), s.j(`fore${k}${side}`), r, r * 0.85, { mat, k: 0.004 * H });
      s.ball(`fore${k}${side}`, s.j(`fore${k}${side}`), r * 1.35, { mat, k: 0.005 * H });
      // Two forearm bones side by side.
      const e = s.j(`fore${k}${side}`);
      const w = s.j(`hand${k}${side}`);
      s.limb(`fore${k}${side}`, e.clone().add(V(0.004 * H, 0, 0)), w.clone().add(V(0.006 * H, 0, 0)), r * 0.7, r * 0.6, { mat, k: 0.004 * H });
      s.limb(`fore${k}${side}`, e.clone().add(V(-0.004 * H, 0, 0)), w.clone().add(V(-0.005 * H, 0, 0)), r * 0.65, r * 0.6, { mat, k: 0.004 * H });
      s.ball(`hand${k}${side}`, lerpV(w, s.j(`hand${k}${side}Tip`), 0.3), V(r * 1.4, r * 1.6, r * 0.8), { mat, k: 0.004 * H });
      claws(s, `hand${k}${side}`, `hand${k}${side}Tip`, 4, o.claws ?? 0.05, 0.0045, mat, undefined, 0.6);
    }
    // Legs.
    s.ball(`leg${side}`, s.j(`leg${side}`), r * 1.7, { mat, k: 0.006 * H });
    s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), r * 1.15, r * 0.95, { mat, k: 0.004 * H });
    s.ball(`shin${side}`, s.j(`shin${side}`), r * 1.5, { mat, k: 0.006 * H });
    const ankle = s.has(`hock${side}`) ? `hock${side}` : `foot${side}`;
    s.limb(`shin${side}`, s.j(`shin${side}`), s.j(ankle), r * 0.95, r * 0.75, { mat, k: 0.004 * H });
    if (ankle !== `foot${side}`) s.limb(`hock${side}`, s.j(`hock${side}`), s.j(`foot${side}`), r * 0.8, r * 0.7, { mat, k: 0.004 * H });
    foot(s, `foot${side}`, `toe${side}`, 0.022, mat);
  });
}

// ---------------------------------------------------------------------------
// Flesh
// ---------------------------------------------------------------------------

export interface TrunkOpt {
  mat?: CMat;
  /** Chest half width, depth and height (shares of H). */
  chest: [number, number, number];
  /** Pelvis half width, depth, height. */
  pelvis?: [number, number, number];
  /** Belly radius (0 none). */
  belly?: number;
  /** Shoulder mass (deltoids, traps). */
  shoulders?: number;
  /** A hump between the shoulders. */
  hump?: number;
  /** Visible ribs pressing through (gaunt), 0..1. */
  ribs?: number;
}

/** A fleshed trunk: pelvis, waist, ribcage mass, shoulders, belly. */
export function trunk(s: Sculpt, o: TrunkOpt): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'skin';
  const hp = s.j('hips');
  const sp = s.j('spine');
  const ch = s.j('chest');
  const [cw, cd, chh] = o.chest;
  const [pw, pd, ph] = o.pelvis ?? [cw * 0.85, cd * 0.9, 0.06];
  s.ball('hips', hp.clone().add(V(0, 0.01 * H, 0)), V(pw * H, ph * H, pd * H), { mat });
  s.ball('spine', sp, V(cw * 0.8 * H, 0.07 * H, cd * 0.85 * H), { mat, k: 0.04 * H });
  s.ball('chest', ch.clone().add(V(0, 0.01 * H, 0.005 * H)), V(cw * H, chh * H, cd * H), { mat, k: 0.04 * H });
  if (o.belly) s.ball('spine', sp.clone().add(V(0, -0.02 * H, o.belly * 0.6 * H)), V(o.belly * 1.1 * H, o.belly * H, o.belly * H), { mat, k: 0.05 * H });
  if (o.shoulders) {
    s.pair((side) => {
      const a = s.j(`arm${side}`);
      s.ball(`arm${side}`, a.clone().add(V(0, 0.01 * H, 0)), V(o.shoulders! * H, o.shoulders! * 0.9 * H, o.shoulders! * H), { mat, k: 0.03 * H });
      // Trapezius from the neck to the shoulder.
      s.limb('chest', s.j('neck').add(V(0, -0.01 * H, -0.01 * H)), a.clone().add(V(0, 0.01 * H, -0.01 * H)), o.shoulders! * 0.6 * H, o.shoulders! * 0.6 * H, { mat, k: 0.03 * H });
    });
  }
  if (o.hump) s.ball('chest', ch.clone().add(V(0, 0.06 * H, -cd * 0.7 * H)), V(o.hump * 1.2 * H, o.hump * H, o.hump * H), { mat, k: 0.05 * H });
  if (o.ribs) {
    for (let i = 0; i < 4; i++) {
      const y = ch.y + 0.03 * H - i * 0.035 * H;
      s.pair((_side, x) => s.limb('chest', V(x * cw * 0.35 * H, y, ch.z + cd * 0.75 * H), V(x * cw * 0.95 * H, y - 0.02 * H, ch.z + cd * 0.15 * H), 0.008 * H * o.ribs!, 0.007 * H * o.ribs!, { mat, k: 0.012 * H }));
    }
  }
}

/** Arms of flesh with hands or claws. */
export function fleshArms(s: Sculpt, o: { r?: number; swell?: number; mat?: CMat; claws?: number; clawCol?: RGB; fingers?: number; set?: '' | '2' }): void {
  const H = s.rig.height;
  const r = o.r ?? 0.03;
  const set = o.set ?? '';
  s.pair((side) => {
    if (!s.has(`arm${set}${side}`)) return;
    limb2(s, `arm${set}${side}`, `fore${set}${side}`, `hand${set}${side}`, { mat: o.mat, r1: r, r2: r * 0.8, swell: o.swell }, { mat: o.mat, r1: r * 0.85, r2: r * 0.6, swell: o.swell ? o.swell * 0.8 : undefined });
    const h = s.j(`hand${set}${side}`);
    const t = s.j(`hand${set}${side}Tip`);
    s.ball(`hand${set}${side}`, lerpV(h, t, 0.35), V(r * 0.85 * H, r * 1.1 * H, r * 0.5 * H), { mat: o.mat, q: quatAlong(t.clone().sub(h)) });
    if (o.claws) claws(s, `hand${set}${side}`, `hand${set}${side}Tip`, o.fingers ?? 4, o.claws, r * 0.2, 'skin', o.clawCol, 0.6);
  });
}

/** Legs of flesh: plantigrade or digitigrade, with feet or claws. */
export function fleshLegs(s: Sculpt, o: { r?: number; swell?: number; mat?: CMat; toes?: number; toeCol?: RGB; footW?: number }): void {
  const H = s.rig.height;
  const r = o.r ?? 0.045;
  s.pair((side) => {
    const dig = s.has(`hock${side}`);
    limb2(s, `leg${side}`, `shin${side}`, dig ? `hock${side}` : `foot${side}`, { mat: o.mat, r1: r, r2: r * 0.7, swell: o.swell }, { mat: o.mat, r1: r * 0.68, r2: r * 0.45, swell: o.swell ? o.swell * 0.7 : undefined });
    if (dig) s.limb(`hock${side}`, s.j(`hock${side}`), s.j(`foot${side}`), r * 0.45 * H, r * 0.4 * H, { mat: o.mat, blendAt: s.j(`hock${side}`), blendR: r * H });
    foot(s, `foot${side}`, `toe${side}`, o.footW ?? r * 0.75, o.mat);
    if (o.toes) {
      const f = s.j(`foot${side}`);
      const t = s.j(`toe${side}`);
      for (let i = 0; i < 3; i++) {
        const u = (i - 1) * 0.02 * H;
        const b = V(t.x + u, 0.012 * H, t.z - 0.01 * H);
        s.hard(`foot${side}`, spikeGeo(b, b.clone().add(V(u * 0.5, -0.008 * H, o.toes * H)), 0.007 * H, 4, undefined, 2), 'skin', o.toeCol);
      }
      void f;
    }
  });
}

/** A fleshed head: skull mass, brow, snout, jaw, ears. */
export function fleshHead(s: Sculpt, o: { size?: number; snout?: number; brow?: number; ears?: number; mat?: CMat; jaw?: number; teeth?: RGB; eyes?: number }): void {
  const H = s.rig.height;
  const k = (o.size ?? 1) * H;
  const mat = o.mat ?? 'skin';
  const h = s.j('head');
  const c = h.clone().add(V(0, 0.04 * k, 0.01 * k));
  s.ball('head', c, V(0.055 * k, 0.06 * k, 0.065 * k), { mat, k: 0.015 * k });
  if (o.brow) s.box('head', c.clone().add(V(0, 0.012 * k, 0.05 * k)), V(0.05 * k, 0.012 * k * o.brow, 0.02 * k), { mat, k: 0.015 * k, round: 0.01 * k });
  const sn = o.snout ?? 0.3;
  s.ball('head', c.clone().add(V(0, -0.02 * k, 0.05 * k + sn * 0.03 * k)), V(0.035 * k, 0.03 * k, 0.03 * k + sn * 0.04 * k), { mat, k: 0.015 * k });
  const jw = s.j('jaw');
  s.ball('jaw', jw.clone().add(V(0, -0.012 * k, 0.025 * k + sn * 0.02 * k)), V(0.034 * k * (o.jaw ?? 1), 0.016 * k, 0.035 * k + sn * 0.03 * k), { mat, k: 0.012 * k });
  if (o.ears) s.pair((_side, x) => s.hard('head', spikeGeo(c.clone().add(V(x * 0.05 * k, 0.01 * k, -0.01 * k)), c.clone().add(V(x * (0.05 + 0.08 * o.ears!) * k, 0.03 * k * o.ears!, -0.04 * k)), 0.016 * k, 5, undefined, 2), mat));
  // Teeth along the jaw.
  if (o.teeth) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 5 - 0.5) * 1.5;
      const b = jw.clone().add(V(Math.sin(a) * 0.026 * k, 0.002 * k, 0.03 * k + sn * 0.04 * k + Math.cos(a) * 0.01 * k));
      s.hard('jaw', spikeGeo(b, b.clone().add(V(0, 0.016 * k, 0.002 * k)), 0.0045 * k, 4, undefined, 1), 'skin', o.teeth);
    }
  }
  if (o.eyes !== 0) s.pair((_side, x) => s.eye('head', c.clone().add(V(x * 0.024 * k, 0.0, 0.058 * k)), 0.008 * k, o.eyes ?? 1));
}

// ---------------------------------------------------------------------------
// Clothing and armour (alt and metal)
// ---------------------------------------------------------------------------

/**
 * A skirt, robe or loincloth: panels hung from the hips that ride the thighs
 * (each half skinned to its leg), so a stride swings the hem instead of the
 * legs passing through it. `len` is how far down it reaches (share of hip
 * height, 1 = to the floor), `flare` how wide the hem is.
 */
export function skirt(s: Sculpt, o: { len: number; flare: number; top?: number; mat?: CMat; front?: boolean; back?: boolean; sides?: boolean; thick?: number }): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'alt';
  const hp = s.j('hips');
  const topY = hp.y + (o.top ?? 0.03) * H;
  const botY = Math.max(0.03 * H, hp.y * (1 - o.len));
  const th = (o.thick ?? 0.012) * H;
  s.pair((side, x) => {
    const leg = `leg${side}`;
    const kn = s.j(`shin${side}`);
    const at = (y: number) => (y > kn.y ? leg : `shin${side}`);
    const wantFront = o.front ?? true;
    const wantBack = o.back ?? true;
    const wantSide = o.sides ?? true;
    const r0 = 0.085 * H;
    const r1 = r0 + o.flare * H;
    // Each panel hangs as three strips of uneven length with gaps between,
    // tilted out toward the hem: a ragged robe, where one flat box per panel
    // read as boards.
    const rnd = seq(Math.round(H * 1000) + (x > 0 ? 7 : 0));
    const panel = (ang: number) => {
      const wTot = 0.06 * H + o.flare * 0.45 * H;
      const rm = (r0 + r1) * 0.5;
      for (let i = 0; i < 3; i++) {
        const sa = ang + ((i - 1) * 2 * wTot) / (3 * rm);
        const dx = Math.sin(sa);
        const dz = Math.cos(sa);
        const bot = botY + rnd() * 0.07 * H * (i === 1 ? 0.4 : 1);
        const a = V(x * dx * r0, topY, dz * r0);
        const b = V(x * dx * (r1 + (rnd() - 0.5) * 0.02 * H), bot, dz * (r1 + (rnd() - 0.5) * 0.02 * H));
        const c = lerpV(a, b, 0.5);
        const dir = b.clone().sub(a);
        const q = quatAlong(dir);
        s.box(at(c.y), c, V(wTot * 0.3, dir.length() * 0.5, th), { mat, q: q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), x * sa + (rnd() - 0.5) * 0.3)), k: 0.012 * H, round: th * 0.8 });
      }
    };
    if (wantFront) panel(0.35);
    if (wantSide) panel(1.45);
    if (wantBack) panel(2.65);
  });
  // Waistband.
  s.ball('hips', V(0, topY, hp.z), V(0.1 * H, 0.025 * H, 0.08 * H), { mat, k: 0.01 * H });
}

/** A hood draped over the head and shoulders. */
export function hood(s: Sculpt, o: { size?: number; mat?: CMat; peak?: number; open?: number }): void {
  const H = s.rig.height;
  const k = (o.size ?? 1) * H;
  const mat = o.mat ?? 'alt';
  const c = s.j('head').add(V(0, 0.045 * k, 0.0));
  s.ball('head', c.clone().add(V(0, 0.01 * k, -0.01 * k)), V(0.075 * k, 0.08 * k, 0.085 * k), { mat, k: 0.02 * k });
  if (o.peak) s.limb('head', c.clone().add(V(0, 0.05 * k, -0.02 * k)), c.clone().add(V(0, 0.09 * k * o.peak, -0.07 * k * o.peak)), 0.04 * k, 0.005 * k, { mat, k: 0.03 * k });
  // The face opening.
  s.ball('head', c.clone().add(V(0, -0.01 * k, 0.085 * k)), V(0.05 * k * (o.open ?? 1), 0.06 * k, 0.05 * k), { mat, sub: true, k: 0.01 * k });
  // Mantle over the shoulders.
  s.ball('chest', s.j('neck').add(V(0, -0.03 * k, -0.01 * k)), V(0.16 * k, 0.05 * k, 0.11 * k), { mat, k: 0.03 * k });
}

/** A plate pauldron on a shoulder. */
export function pauldron(s: Sculpt, side: 'L' | 'R', size: number, mat: CMat = 'metal', spikes = 0, col?: RGB): void {
  const H = s.rig.height;
  const a = s.j(`arm${side}`);
  const x = side === 'L' ? 1 : -1;
  const c = a.clone().add(V(x * 0.012 * H, 0.02 * H, 0));
  s.ball(`arm${side}`, c, V(size * H, size * 0.7 * H, size * 1.05 * H), { mat, k: 0.004 * H });
  s.ball(`arm${side}`, c.clone().add(V(x * 0.01 * H, -0.03 * H, 0)), V(size * 1.05 * H, size * 0.5 * H, size * 1.1 * H), { mat, k: 0.004 * H });
  for (let i = 0; i < spikes; i++) {
    const b = c.clone().add(V(x * size * 0.4 * H, size * 0.5 * H, (i - (spikes - 1) / 2) * size * 0.6 * H));
    s.hard(`arm${side}`, spikeGeo(b, b.clone().add(V(x * 0.03 * H, size * 1.2 * H, 0)), size * 0.18 * H, 5, undefined, 2), mat, col);
  }
}

/** A plate cuirass over the chest and belly. */
export function cuirass(s: Sculpt, o: { w: number; d: number; mat?: CMat; belly?: boolean }): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'metal';
  const ch = s.j('chest');
  s.ball('chest', ch.clone().add(V(0, 0.015 * H, 0.008 * H)), V(o.w * H, 0.11 * H, o.d * H), { mat, k: 0.01 * H });
  // A keel down the breastplate.
  s.box('chest', ch.clone().add(V(0, 0.0, o.d * H * 0.92)), V(0.006 * H, 0.08 * H, 0.012 * H), { mat, k: 0.012 * H });
  if (o.belly ?? true) s.ball('spine', s.j('spine').add(V(0, 0, 0.01 * H)), V(o.w * 0.85 * H, 0.06 * H, o.d * 0.9 * H), { mat, k: 0.008 * H });
}

/** A helm: a dome over the skull, with a face slit and optional crest or horns. */
export function helm(s: Sculpt, o: { size?: number; mat?: CMat; crest?: number; horns?: number; visor?: boolean; col?: RGB; eyes?: number }): void {
  const H = s.rig.height;
  const k = (o.size ?? 1) * H;
  const mat = o.mat ?? 'metal';
  const c = s.j('head').add(V(0, 0.05 * k, 0.012 * k));
  s.ball('head', c, V(0.064 * k, 0.07 * k, 0.074 * k), { mat, k: 0.004 * k });
  if (o.visor ?? true) {
    // Face plate and the eye slit.
    s.box('head', c.clone().add(V(0, -0.03 * k, 0.05 * k)), V(0.052 * k, 0.04 * k, 0.028 * k), { mat, k: 0.008 * k, round: 0.012 * k });
    s.box('head', c.clone().add(V(0, -0.0 * k, 0.08 * k)), V(0.045 * k, 0.006 * k, 0.03 * k), { mat, sub: true, k: 0.003 * k });
    if (o.eyes !== 0) s.pair((_side, x) => s.eye('head', c.clone().add(V(x * 0.02 * k, 0, 0.066 * k)), 0.006 * k, o.eyes ?? 0.9));
  }
  if (o.crest) s.box('head', c.clone().add(V(0, 0.065 * k, -0.01 * k)), V(0.008 * k, 0.025 * k * o.crest, 0.07 * k), { mat, k: 0.004 * k });
  if (o.horns) {
    s.pair((_side, x) => {
      const b = c.clone().add(V(x * 0.055 * k, 0.02 * k, 0));
      s.hard('head', spikeGeo(b, b.clone().add(V(x * 0.1 * k * o.horns!, 0.05 * k * o.horns!, 0.02 * k)), 0.016 * k, 6, V(0, 0.06 * k * o.horns!, 0.0), 4), mat, o.col);
    });
  }
}

/**
 * A cape from the shoulders to the calves. The upper half rides the chest,
 * the lower half the hips, so a stride does not drag the whole cloak. A
 * boss wears it as cloth (`ClothSheets.ts`).
 */
export function cape(s: Sculpt, o: { len?: number; w?: number; mat?: CMat; torn?: number } = {}): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'alt';
  const ch = s.j('chest');
  const hp = s.j('hips');
  const w = (o.w ?? 0.13) * H;
  const top = ch.clone().add(V(0, 0.08 * H, -0.075 * H));
  const mid = V(0, hp.y + 0.02 * H, hp.z - 0.1 * H);
  const bot = V(0, Math.max(0.05 * H, hp.y * (1 - (o.len ?? 0.75))), hp.z - 0.16 * H);
  // Collar.
  s.ball('chest', s.j('neck').add(V(0, -0.02 * H, -0.03 * H)), V(0.11 * H, 0.03 * H, 0.06 * H), { mat, k: 0.02 * H });
  if (s.clothOn) {
    capeCloth(s, { top, mid, bot, w, mat, torn: o.torn ?? 0, rand: seq(Math.round(H * 977)) });
    return;
  }
  const th = 0.008 * H;
  const q1 = quatAlong(mid.clone().sub(top));
  const q2 = quatAlong(bot.clone().sub(mid));
  s.box('chest', lerpV(top, mid, 0.5), V(w, top.distanceTo(mid) * 0.5, th), { mat, q: q1, k: 0.02 * H, round: th });
  s.box('hips', lerpV(mid, bot, 0.5), V(w * 1.2, mid.distanceTo(bot) * 0.5, th), { mat, q: q2, k: 0.03 * H, round: th });
  if (o.torn) {
    const r = seq(Math.round(H * 977));
    for (let i = 0; i < 5; i++) {
      const x = (i / 4 - 0.5) * w * 2;
      const a = bot.clone().add(V(x, 0.02 * H, 0));
      s.hard('hips', spikeGeo(a, a.clone().add(V(x * 0.1, -(0.05 + r() * 0.08) * H * o.torn, -0.02 * H)), 0.02 * H, 3, undefined, 2), mat);
    }
  }
}

/** A cloth mask or scarf over the lower face. */
export function mask(s: Sculpt, o: { size?: number; mat?: CMat } = {}): void {
  const k = (o.size ?? 1) * s.rig.height;
  const c = s.j('head').add(V(0, 0.02 * k, 0.03 * k));
  s.ball('head', c, V(0.058 * k, 0.03 * k, 0.05 * k), { mat: o.mat ?? 'alt', k: 0.01 * k });
  s.ball('chest', s.j('neck').add(V(0, 0.0, 0.01 * k)), V(0.05 * k, 0.025 * k, 0.045 * k), { mat: o.mat ?? 'alt', k: 0.01 * k });
}

/** A belt with pouches, or a satchel strap across the chest. */
export function belt(s: Sculpt, o: { pouches?: number; strap?: boolean; mat?: CMat; col?: RGB } = {}): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'alt';
  const hp = s.j('hips');
  s.hard('hips', ringGeo(hp.clone().add(V(0, 0.035 * H, 0.005 * H)), 0.085 * H, 0.008 * H, V(0, 1, 0), 14), mat, o.col ?? [0.35, 0.25, 0.18]);
  for (let i = 0; i < (o.pouches ?? 0); i++) {
    const a = 0.6 + i * 0.7;
    const p = hp.clone().add(V(Math.sin(a) * 0.09 * H, 0.015 * H, Math.cos(a) * 0.07 * H));
    s.hard('hips', boxGeo(p, V(0.035 * H, 0.04 * H, 0.022 * H)), mat, o.col ?? [0.4, 0.3, 0.2]);
  }
  if (o.strap) {
    const ch = s.j('chest');
    s.hard('chest', tubeGeo([ch.clone().add(V(0.08 * H, 0.09 * H, 0.03 * H)), ch.clone().add(V(0, 0.0, 0.085 * H)), ch.clone().add(V(-0.09 * H, -0.08 * H, 0.04 * H))], () => 0.007 * H, 4), mat, o.col ?? [0.35, 0.25, 0.18]);
  }
}
