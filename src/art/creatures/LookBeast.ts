/**
 * SLAY — beasts: rats, bats, wolves, bears, great cats, harpies, frogs,
 * worms, wyverns, stags, lions and the chasm leviathan. Real animal
 * proportions pushed toward menace: deep chests, low heads, too many teeth.
 */
import * as THREE from 'three';
import { flyerRig, quadRig, serpentRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, RGB, Sculpt } from './Sculpt';
import { ballGeo, membraneGeo, ringGeo, spikeGeo, tubeGeo, ovalGeo } from './Sculpt';
import { V, lerpV, paletteTint, seq } from './Kit';
import { houndHead, quadBody, quadChest, quadChestR } from './LookUndead';
import type { MotionStyle } from './Motion';

const TOOTH: RGB = [0.85, 0.8, 0.66];
const HORN: RGB = [0.32, 0.27, 0.22];
const CLAW: RGB = [0.2, 0.18, 0.15];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** Clumps of fur standing off the back and neck (a ruff, hackles). */
function hackles(s: Sculpt, from: string, to: string, n: number, len: number, mat: CMat = 'skin', spread = 0.6): void {
  const a = s.j(from);
  const b = s.j(to);
  const r = seq(n * 97 + Math.round(len * 1000));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = lerpV(a, b, t);
    const side = (r() - 0.5) * spread;
    const bone = t < 0.5 ? from : to;
    const base = p.clone().add(V(side * len * 0.8, len * 0.6, 0));
    s.hard(bone, spikeGeo(base, base.clone().add(V(side * len * 0.6, len * (0.8 + r() * 0.5), -len * 0.9)), len * 0.35, 4, undefined, 2), mat);
  }
}

/** A mane of fur round the neck and head (lion, alpha wolf). */
function mane(s: Sculpt, size: number, mat: CMat = 'alt'): void {
  const n = s.j('neck');
  const h = s.j('head');
  s.ball('neck', lerpV(n, h, 0.3), V(size * 0.85, size, size * 0.9), { mat, k: size * 0.4 });
  s.ball('neck', lerpV(n, h, 0.7).add(V(0, 0.02, -0.03)), V(size * 0.95, size * 1.05, size * 0.7), { mat, k: size * 0.4 });
  const r = seq(Math.round(size * 1999));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const c = lerpV(n, h, 0.55).add(V(Math.sin(a) * size * 0.85, Math.cos(a) * size * 0.85, -size * 0.2));
    s.hard('neck', spikeGeo(c, c.clone().add(V(Math.sin(a) * size * 0.5, Math.cos(a) * size * 0.4, -size * (0.4 + r() * 0.4))), size * 0.25, 4, undefined, 2), mat);
  }
}

/** A cat's head: short muzzle, round skull, flat ears, sabre fangs if asked. */
function catHead(s: Sculpt, o: { w: number; sabre?: number; glow?: number; ears?: number }): void {
  const h = s.j('head');
  const sn = s.j('snout');
  const jw = s.j('jaw');
  const w = o.w;
  s.ball('head', h.clone().add(V(0, 0.01, 0)), V(w, w * 0.85, w), { k: 0.03 });
  s.limb('head', h.clone().add(V(0, -0.01, 0.04)), sn.clone().add(V(0, 0.0, -0.01)), w * 0.6, w * 0.45, { k: 0.03 });
  s.ball('head', lerpV(h, sn, 0.75).add(V(0, -0.015, 0)), V(w * 0.6, w * 0.4, w * 0.45), { k: 0.02 });
  s.limb('jaw', jw, sn.clone().add(V(0, -0.05, -0.03)), w * 0.42, w * 0.3, { k: 0.015 });
  s.pair((_side, x) => {
    s.hard('head', spikeGeo(h.clone().add(V(x * w * 0.55, w * 0.55, -w * 0.15)), h.clone().add(V(x * w * 0.8, w * (0.6 + 0.5 * (o.ears ?? 1)), -w * 0.35)), w * 0.3, 4, undefined, 2), 'skin');
    const f = lerpV(h, sn, 0.8).add(V(x * w * 0.25, -w * 0.25, 0));
    const len = o.sabre ? w * 1.4 * o.sabre : w * 0.35;
    s.hard('head', spikeGeo(f, f.clone().add(V(0, -len, len * 0.15)), w * (o.sabre ? 0.12 : 0.08), 4, V(0, 0, len * 0.15), 3), 'skin', TOOTH);
    s.eye('head', h.clone().add(V(x * w * 0.45, w * 0.3, w * 0.75)), w * 0.11, o.glow ?? 1);
  });
}

/** A bear's head: broad, heavy brow, short round ears. */
function bearHead(s: Sculpt, w: number, glow = 0.8): void {
  const h = s.j('head');
  const sn = s.j('snout');
  const jw = s.j('jaw');
  s.ball('head', h.clone().add(V(0, 0.02, 0)), V(w * 1.05, w * 0.95, w), { k: 0.04 });
  s.limb('head', h.clone().add(V(0, -0.01, 0.05)), sn.clone().add(V(0, 0.0, -0.02)), w * 0.62, w * 0.42, { k: 0.04 });
  s.limb('jaw', jw, sn.clone().add(V(0, -0.06, -0.04)), w * 0.45, w * 0.32, { k: 0.02 });
  s.pair((_side, x) => {
    s.ball('head', h.clone().add(V(x * w * 0.75, w * 0.75, -w * 0.2)), V(w * 0.28, w * 0.28, w * 0.15), { k: 0.02 });
    s.eye('head', h.clone().add(V(x * w * 0.42, w * 0.32, w * 0.78)), w * 0.08, glow);
    for (let i = 0; i < 2; i++) {
      const f = lerpV(h, sn, 0.85).add(V(x * w * (0.2 + i * 0.12), -w * 0.3, -i * 0.03));
      s.hard('head', spikeGeo(f, f.clone().add(V(0, -w * 0.35, w * 0.04)), w * 0.07, 4, undefined, 1), 'skin', TOOTH);
    }
  });
}

/** A rat's head: long wedge snout, round ears, buck teeth. */
function ratHead(s: Sculpt, w: number, glow = 1): void {
  const h = s.j('head');
  const sn = s.j('snout');
  s.ball('head', h, V(w, w * 0.85, w * 1.1), { k: 0.02 });
  s.limb('head', h.clone().add(V(0, 0, 0.03)), sn, w * 0.7, w * 0.18, { k: 0.02 });
  s.pair((_side, x) => {
    s.hard('head', ovalGeo(h.clone().add(V(x * w * 0.75, w * 0.8, -w * 0.2)), w * 0.45, 1, 1, 1, 0.3).translate(0, 0, 0), 'skin', [1, 0.8, 0.8]);
    s.eye('head', h.clone().add(V(x * w * 0.55, w * 0.35, w * 0.6)), w * 0.16, glow);
  });
  const t = sn.clone().add(V(0, -w * 0.25, -w * 0.15));
  s.hard('head', spikeGeo(t, t.clone().add(V(0, -w * 0.4, 0.0)), w * 0.12, 4, undefined, 1), 'skin', [0.9, 0.8, 0.45]);
}

/** Wings of membrane strung between finger bones (bats, wyverns). */
function batWings(s: Sculpt, o: { thick: number; mat?: CMat; claw?: boolean }): void {
  const mat = o.mat ?? 'skin';
  s.pair((side) => {
    const a = s.j(`wing${side}`);
    const e = s.j(`wing${side}2`);
    const w = s.j(`wing${side}3`);
    const tip = s.j(`wing${side}Tip`);
    const R = a.distanceTo(tip);
    s.limb(`wing${side}`, a, e, 0.034 * R * o.thick, 0.026 * R * o.thick, { mat, k: 0.01 });
    s.limb(`wing${side}2`, e, w, 0.026 * R * o.thick, 0.018 * R * o.thick, { mat, k: 0.01 });
    // Finger spars from the wrist.
    const back = V(0, 0, -1);
    const fingers = [tip, lerpV(tip, w.clone().addScaledVector(back, R * 0.55), 0.45), w.clone().addScaledVector(back, R * 0.5).add(V(0, -R * 0.08, 0))];
    for (const f of fingers) s.hard(`wing${side}3`, tubeGeo([w, f], (t) => (0.014 - 0.01 * t) * R * o.thick, 4), mat, [0.6, 0.55, 0.5]);
    // Membrane panels: outer on the hand, middle on the forearm, inner on the arm.
    const body = s.j('body');
    s.hard(`wing${side}3`, membraneGeo(w, [tip, fingers[1]!, fingers[2]!], 0.006 * R, 0.12), mat);
    s.hard(`wing${side}2`, membraneGeo(e, [w, fingers[2]!, lerpV(e, fingers[2]!, 0.5).addScaledVector(back, R * 0.15)], 0.006 * R, 0.1), mat);
    s.hard(`wing${side}`, membraneGeo(a, [e, lerpV(e, fingers[2]!, 0.5).addScaledVector(back, R * 0.15), body.clone().add(V(0, 0, -R * 0.25))], 0.006 * R, 0.08), mat);
    if (o.claw) s.hard(`wing${side}3`, spikeGeo(w, w.clone().add(V(0, R * 0.06, R * 0.05)), 0.012 * R, 4, undefined, 1), 'skin', CLAW);
  });
}

/** One feather: a pointed vane from `root` along `dir`, `w` wide across `side`. */
function featherGeo(root: THREE.Vector3, dir: THREE.Vector3, side: THREE.Vector3, len: number, w: number, thick: number): THREE.BufferGeometry {
  const at = (u: number, x: number) => root.clone().addScaledVector(dir, len * u).addScaledVector(side, w * x);
  return membraneGeo(root, [at(0.05, 0.45), at(0.45, 0.55), at(0.82, 0.32), at(1, 0), at(0.82, -0.28), at(0.4, -0.42), at(0.05, -0.35)], thick, 0);
}

/**
 * Feathered wings: thin arm bones, three rows of short coverts lapping each
 * other over the arm, then long flight feathers fanned back off the hand and
 * forearm, each its own pointed vane (harpy, the ashen prophet). Rows of
 * separate feathers, so a wing never reads as one plank.
 */
function featherWings(s: Sculpt, o: { len: number; mat?: CMat; col?: RGB }): void {
  const mat = o.mat ?? 'alt';
  const col = o.col ?? [0.62, 0.56, 0.5];
  const dark: RGB = [col[0] * 0.7, col[1] * 0.68, col[2] * 0.66];
  const pale: RGB = [Math.min(1.5, col[0] * 1.25), Math.min(1.5, col[1] * 1.22), Math.min(1.5, col[2] * 1.2)];
  s.pair((side) => {
    const a = s.j(`wing${side}`);
    const e = s.j(`wing${side}2`);
    const w = s.j(`wing${side}3`);
    const tip = s.j(`wing${side}Tip`);
    const R = a.distanceTo(tip);
    s.limb(`wing${side}`, a, e, 0.024 * R, 0.018 * R, { mat, k: 0.02 });
    s.limb(`wing${side}2`, e, w, 0.018 * R, 0.012 * R, { mat, k: 0.02 });
    // Feathers trail back and down off the arm, so the spread wing reads
    // from the front as well as from above.
    const back = V(0, -0.55, -0.85).normalize();
    const up = V(0, 1, 0);
    const th = Math.max(0.004, 0.004 * R);
    // Coverts: three rows over the arm and forearm, the top row shortest.
    const bones: Array<[string, THREE.Vector3, THREE.Vector3]> = [[`wing${side}`, a, e], [`wing${side}2`, e, w]];
    for (let row = 0; row < 3; row++) {
      for (const [bone, p0, p1] of bones) {
        const along = p1.clone().sub(p0);
        const n = 5;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5 + (row % 2) * 0.5) / (n + 0.5);
          const root = lerpV(p0, p1, t).addScaledVector(back, R * 0.035 * row).addScaledVector(up, -0.01 * R * row);
          const dir = back.clone().addScaledVector(along.clone().normalize(), 0.25).normalize();
          const sideV = along.clone().normalize();
          const len = R * (0.13 + 0.07 * row) * (bone.endsWith('2') ? 0.9 : 1);
          s.hard(bone, featherGeo(root, dir, sideV, len, (along.length() / n) * 1.5, th), mat, row === 0 ? dark : col);
        }
      }
    }
    // Flight feathers: long vanes fanning from the hand and forearm.
    const out = tip.clone().sub(w).normalize();
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const onHand = t < 0.5;
      const root = onHand ? lerpV(tip, w, t / 0.5) : lerpV(w, e, (t - 0.5) / 0.5);
      const dir = out.clone().lerp(back, Math.min(1, 0.2 + t * 1.15)).normalize();
      const len = o.len * (onHand ? 0.58 - t * 0.22 : 0.44 - (t - 0.5) * 0.3);
      const sideV = new THREE.Vector3().crossVectors(dir, up).normalize();
      s.hard(onHand ? `wing${side}3` : `wing${side}2`, featherGeo(root, dir, sideV, len, len * 0.2, th), mat, i % 3 === 1 ? pale : col);
    }
  });
}

/** A serpent body down its chain, tapering to the tail. */
function serpentBody(s: Sculpt, o: { girth: number; head?: number; mat?: CMat; plates?: RGB; rings?: number }): void {
  const mat = o.mat ?? 'skin';
  const g = o.girth;
  const front: string[] = [];
  for (let i = 1; i <= 9; i++) if (s.has(`f${i}`)) front.push(`f${i}`);
  let prev = 'body';
  for (let i = 0; i < front.length; i++) {
    const n = front[i]!;
    const t = (i + 1) / front.length;
    // The body narrows into a neck behind the head.
    const t0 = i / front.length;
    s.limb(prev, s.j(prev), s.j(n), g * (1 - 0.4 * Math.pow(t0, 1.3)), g * (1 - 0.4 * Math.pow(t, 1.3)), { mat, k: g * 0.3 });
    prev = n;
  }
  s.limb(prev, s.j(prev), s.j('head'), g * 0.6, g * 0.55, { mat, k: g * 0.25 });
  const rear: string[] = [];
  for (let i = 1; i <= 12; i++) if (s.has(`t${i}`)) rear.push(`t${i}`);
  prev = 'body';
  for (let i = 0; i < rear.length; i++) {
    const n = rear[i]!;
    const t = i / rear.length;
    s.limb(prev, s.j(prev), s.j(n), g * (1 - 0.6 * t), g * (1 - 0.6 * (t + 1 / rear.length)), { mat, k: g * 0.4 });
    prev = n;
  }
  s.limb(prev, s.j(prev), s.j('tailTip'), g * 0.35, g * 0.08, { mat, k: g * 0.2 });
  if (o.plates) {
    // Armour plates down the spine.
    const all = ['body', ...front, ...rear];
    for (const n of all) {
      const p = s.j(n).add(V(0, g * 0.85, 0));
      s.hard(n, spikeGeo(p, p.clone().add(V(0, g * 0.3, -g * 0.45)), g * 0.28, 4, undefined, 1), 'skin', o.plates);
    }
  }
  if (o.rings) {
    const all = ['body', ...front, ...rear];
    for (const n of all) {
      const d = n === 'body' ? s.j('f1').sub(s.j('body')) : s.j(n).sub(s.j(n.startsWith('t') ? (n === 't1' ? 'body' : `t${Number(n.slice(1)) - 1}`) : n === 'f1' ? 'body' : `f${Number(n.slice(1)) - 1}`));
      const r = n.startsWith('t') ? g * (1 - 0.5 * (Number(n.slice(1)) / Math.max(1, rear.length))) : g;
      s.hard(n, ringGeo(s.j(n), r * 0.98, r * 0.12 * o.rings, d.lengthSq() > 0 ? d.normalize() : V(0, 0, 1), 14), 'skin', [0.7, 0.62, 0.55]);
    }
  }
}

/** A serpent's head: wedge skull and a hinged jaw. */
function serpentHead(s: Sculpt, o: { w: number; teeth?: number; crest?: number; glow?: number; horns?: number }): void {
  const h = s.j('head');
  const sn = s.j('snout');
  const jw = s.j('jaw');
  const w = o.w;
  // A broad flat wedge, wider than the neck behind it, with a heavy brow.
  const fwd = sn.clone().sub(h).normalize();
  s.ball('head', h.clone().add(V(0, w * 0.1, 0)), V(w, w * 0.55, w * 1.0), { k: w * 0.2 });
  s.limb('head', h.clone().add(V(0, w * 0.08, 0)).addScaledVector(fwd, w * 0.4), sn.clone().addScaledVector(fwd, w * 0.4), w * 0.78, w * 0.32, { k: w * 0.2 });
  s.pair((_side, x) => s.ball('head', h.clone().add(V(x * w * 0.55, w * 0.42, 0)).addScaledVector(fwd, w * 0.45), V(w * 0.3, w * 0.16, w * 0.45), { k: w * 0.1 }));
  s.limb('jaw', jw, sn.clone().add(V(0, -w * 0.3, 0)).addScaledVector(fwd, w * 0.2), w * 0.65, w * 0.25, { k: w * 0.15 });
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * w * 0.6, w * 0.35, w * 0.5)), w * 0.13, o.glow ?? 1));
  for (let i = 0; i < (o.teeth ?? 4); i++) {
    const t = 0.3 + (i / Math.max(1, (o.teeth ?? 4) - 1)) * 0.6;
    s.pair((_side, x) => {
      const p = lerpV(h, sn, t).add(V(x * w * 0.45 * (1 - t * 0.5), -w * 0.25, 0));
      s.hard('head', spikeGeo(p, p.clone().add(V(0, -w * (i === 0 ? 0.6 : 0.35), w * 0.05)), w * 0.07, 4, undefined, 1), 'skin', TOOTH);
    });
  }
  if (o.crest) {
    for (let i = 0; i < 5; i++) {
      const p = h.clone().add(V(0, w * 0.6, -i * w * 0.35));
      s.hard('head', spikeGeo(p, p.clone().add(V(0, w * o.crest * (1 - i * 0.12), -w * 0.5)), w * 0.12, 4, undefined, 2), 'skin', HORN);
    }
  }
  if (o.horns) s.pair((_side, x) => s.hard('head', spikeGeo(h.clone().add(V(x * w * 0.6, w * 0.5, -w * 0.2)), h.clone().add(V(x * w * 1.3 * o.horns!, w * 0.9 * o.horns!, -w * 1.4 * o.horns!)), w * 0.18, 5, V(0, w * 0.3, 0), 3), 'skin', HORN));
}

/** Antlers branching from the skull (rime stag). */
function antlers(s: Sculpt, size: number, col: RGB, glow = 0): void {
  const h = s.j('head');
  s.pair((_side, x) => {
    const base = h.clone().add(V(x * size * 0.12, size * 0.12, -size * 0.05));
    const main = [base, base.clone().add(V(x * size * 0.25, size * 0.4, -size * 0.15)), base.clone().add(V(x * size * 0.45, size * 0.75, -size * 0.1)), base.clone().add(V(x * size * 0.55, size * 1.05, size * 0.05))];
    s.hard('head', tubeGeo(main, (t) => (0.035 - 0.025 * t) * size, 5), 'skin', col, glow);
    for (let i = 1; i < 4; i++) {
      const p = main[i]!;
      const tine = p.clone().add(V(x * size * 0.05, size * 0.22, size * (0.15 + i * 0.03)));
      s.hard('head', spikeGeo(p, tine, 0.02 * size, 4, undefined, 2), 'skin', col, glow);
    }
  });
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

interface QuadOpt {
  withers: number;
  length: number;
  width?: number;
  neck?: number;
  neckRise?: number;
  head?: number;
  tail?: number;
  tailLen?: number;
  slope?: number;
  splay?: number;
  girth: number;
  chest: number;
  legR: number;
  gaunt?: number;
  belly?: number;
  haunch?: number;
  narrow?: number;
  muscle?: number;
  barrel?: number;
  paws?: 'claw' | 'hoof' | 'pad';
  surface?: 'fur' | 'hide' | 'scale' | 'flesh' | 'ice' | 'lava' | 'slime';
  tint?: number;
  alt?: { surface: 'fur' | 'hide' | 'ice' | 'lava'; tint: number };
  head2: (s: Sculpt) => void;
  extra?: (s: Sculpt) => void;
  paint?: Sculpt['paint']['skin'];
  lumps?: { amp: number; scale: number };
  style: Partial<MotionStyle>;
  tier?: CreatureLook['tier'];
  size?: number;
}

function quadLook(c: LookCtx, o: QuadOpt): CreatureLook {
  const tint = o.tint ?? paletteTint(c.visual.palette, 0x8f7a68);
  const glow = c.visual.glow ?? 0xffcc66;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? (o.withers < 0.45 ? 'small' : o.withers > 1.0 ? 'big' : 'normal'),
    rig: () => quadRig({ withers: o.withers, length: o.length, width: o.width, neck: o.neck, neckRise: o.neckRise, head: o.head, tail: o.tail, tailLen: o.tailLen, slope: o.slope, splay: o.splay }),
    sculpt: (s) => {
      quadBody(s, { girth: o.girth, chest: o.chest, legR: o.legR, gaunt: o.gaunt, belly: o.belly, haunch: o.haunch, narrow: o.narrow, paws: o.paws ?? 'claw', muscle: o.muscle ?? 1, barrel: o.barrel ?? 1 });
      o.head2(s);
      o.extra?.(s);
      s.paint.skin = o.paint ?? { grime: 0.5, ao: 0.9, top: { amount: 0.15, col: [1.1, 1.05, 1] } };
      s.paint.alt = { grime: 0.4, ao: 0.85, tips: { amount: 0.35, col: [0.6, 0.55, 0.5] } };
      if (o.lumps) s.lumps.skin = o.lumps;
    },
    mats: {
      skin: { surface: o.surface ?? 'fur', tint, glow },
      alt: { surface: o.alt?.surface ?? 'fur', tint: o.alt?.tint ?? tint, glow },
      metal: { surface: 'bone', tint: 0xd8ceb0, glow },
    },
    style: { heavy: 0.3, attacks: ['bite', 'lunge'], spawn: 'emerge', death: 'flop', idle: 'prowl', gait: 'lope', ...o.style },
  };
}

function flyerLook(c: LookCtx, o: { body: number; hover: number; span: number; upright?: boolean; tail?: number; neck?: number; sculpt: (s: Sculpt) => void; surface: 'hide' | 'fur' | 'scale' | 'flesh'; alt?: { surface: 'hide' | 'fur' | 'cloth' | 'leather'; tint: number }; style: Partial<MotionStyle>; tier?: CreatureLook['tier']; size?: number }): CreatureLook {
  const tint = paletteTint(c.visual.palette, 0x8f7a68);
  const glow = c.visual.glow ?? 0xffcc44;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? (o.span < 1.2 ? 'small' : 'normal'),
    rig: () => flyerRig({ body: o.body, hover: o.hover, span: o.span, upright: o.upright, tail: o.tail, neck: o.neck }),
    sculpt: (s) => {
      o.sculpt(s);
      s.paint.skin = { grime: 0.3, ao: 0.9, top: { amount: 0.15, col: [1.1, 1.05, 1] } };
      s.paint.alt = { grime: 0.3, ao: 0.8, tips: { amount: 0.4, col: [0.5, 0.45, 0.4] } };
    },
    mats: {
      skin: { surface: o.surface, tint, glow },
      alt: { surface: o.alt?.surface ?? 'hide', tint: o.alt?.tint ?? tint, glow },
      metal: { surface: 'bone', tint: 0xd0c6aa, glow },
    },
    style: { heavy: 0.1, attacks: ['bite', 'claw'], spawn: 'swoop', death: 'crash', idle: 'hover', gait: 'glide', ...o.style },
  };
}

function serpentLook(c: LookCtx, o: { length: number; girth: number; front?: number; rear?: number; rise?: number; head?: number; sculpt: (s: Sculpt) => void; surface: 'scale' | 'flesh' | 'hide' | 'rot' | 'bark'; style: Partial<MotionStyle>; tier?: CreatureLook['tier']; paint?: Sculpt['paint']['skin']; size?: number }): CreatureLook {
  const tint = paletteTint(c.visual.palette, 0x3d4a35);
  const glow = c.visual.glow ?? 0xd8d060;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? (o.length > 3.5 ? 'big' : 'normal'),
    rig: () => serpentRig({ length: o.length, girth: o.girth, front: o.front, rear: o.rear, rise: o.rise, head: o.head }),
    sculpt: (s) => {
      o.sculpt(s);
      s.paint.skin = o.paint ?? { grime: 0.4, ao: 0.9, bands: { axis: 'z', period: o.girth * 0.9, amount: 0.25 }, top: { amount: 0.1, col: [1.1, 1.1, 1] } };
    },
    mats: {
      skin: { surface: o.surface, tint, glow },
      alt: { surface: 'hide', tint: 0x6a5a48, glow },
      metal: { surface: 'bone', tint: 0xd8ceb0, glow },
    },
    style: { heavy: 0.4, attacks: ['bite', 'lash'], spawn: 'emerge', death: 'coil', idle: 'sway', gait: 'slither', ...o.style },
  };
}

const BEAST: Record<string, LookFactory> = {
  dire_rat: (c) =>
    quadLook(c, {
      size: 2.2,
      withers: 0.28,
      length: 0.55,
      width: 0.22,
      neck: 0.25,
      neckRise: 0.1,
      head: 0.55,
      tail: 6,
      tailLen: 0.85,
      slope: 0.12,
      girth: 0.12,
      chest: 0.105,
      legR: 0.03,
      haunch: 1.2,
      narrow: 0.95,
      head2: (s) => ratHead(s, 0.07, 1),
      extra: (s) => hackles(s, 'spine', 'chest', 6, 0.03),
      lumps: { amp: 0.003, scale: 40 },
      style: { heavy: 0.02, attacks: ['bite', 'lunge'], idle: 'jitter', gait: 'scuttle', stride: 1.6, death: 'flip' },
    }),
  gorge_wolf: (c) =>
    quadLook(c, {
      withers: 0.75,
      length: 0.95,
      width: 0.14,
      neck: 0.4,
      neckRise: 0.35,
      head: 0.5,
      tail: 4,
      tailLen: 0.55,
      girth: 0.165,
      chest: 0.215,
      legR: 0.05,
      gaunt: 0.5,
      narrow: 0.75,
      head2: (s) => houndHead(s, { len: 0.5, w: 0.11, teeth: true, ears: 0.9, glow: 1 }),
      extra: (s) => hackles(s, 'chest', 'neck', 7, 0.05),
      lumps: { amp: 0.004, scale: 22 },
      style: { heavy: 0.15, attacks: ['bite', 'lunge'], idle: 'prowl', gait: 'lope' },
    }),
  pack_alpha: (c) =>
    quadLook(c, {
      size: 0.85,
      withers: 0.92,
      length: 1.1,
      width: 0.15,
      neck: 0.42,
      neckRise: 0.4,
      head: 0.52,
      tail: 4,
      tailLen: 0.55,
      girth: 0.2,
      chest: 0.265,
      legR: 0.062,
      gaunt: 0.3,
      narrow: 0.8,
      alt: { surface: 'fur', tint: 0x3a3028 },
      head2: (s) => {
        houndHead(s, { len: 0.52, w: 0.13, teeth: true, ears: 1, glow: 1.3 });
        mane(s, 0.19, 'alt');
      },
      extra: (s) => {
        hackles(s, 'spine', 'chest', 9, 0.07, 'alt');
        // Old scars.
        s.tint(s.j('chest').add(V(0.1, 0.05, 0.05)), 0.05, [0.6, 0.4, 0.38]);
      },
      lumps: { amp: 0.005, scale: 18 },
      style: { heavy: 0.3, attacks: ['bite', 'lunge', 'claw'], idle: 'prowl', gait: 'lope' },
    }),
  crag_bear: (c) =>
    quadLook(c, {
      size: 0.85,
      withers: 1.0,
      length: 1.3,
      width: 0.24,
      neck: 0.3,
      neckRise: 0.15,
      head: 0.45,
      tail: 0,
      slope: -0.08,
      girth: 0.36,
      chest: 0.4,
      legR: 0.11,
      haunch: 1.1,
      narrow: 0.9,
      tier: 'big',
      head2: (s) => bearHead(s, 0.19),
      extra: (s) => {
        // A hump of muscle and stone-crusted fur over the shoulders.
        s.ball('chest', s.j('chest').add(V(0, 0.22, -0.05)), V(0.22, 0.16, 0.25), { k: 0.08 });
        const r = seq(71);
        for (let i = 0; i < 7; i++) {
          const p = lerpV(s.j('spine'), s.j('chest'), r()).add(V((r() - 0.5) * 0.3, 0.3 + r() * 0.05, 0));
          s.hard('chest', ballGeo(p, 0.04 + r() * 0.04, 0), 'metal', [0.5, 0.48, 0.45]);
        }
      },
      lumps: { amp: 0.008, scale: 12 },
      style: { heavy: 0.75, attacks: ['claw', 'slam', 'bite'], idle: 'breathe', gait: 'lumber', death: 'collapse' },
    }),
  saber_prowler: (c) =>
    quadLook(c, {
      withers: 0.8,
      length: 1.15,
      width: 0.15,
      neck: 0.3,
      neckRise: 0.2,
      head: 0.38,
      tail: 6,
      tailLen: 0.8,
      slope: 0.02,
      girth: 0.17,
      chest: 0.215,
      legR: 0.058,
      gaunt: 0.45,
      narrow: 0.8,
      head2: (s) => catHead(s, { w: 0.12, sabre: 1, glow: 1.2 }),
      paint: { grime: 0.4, ao: 0.9, bands: { axis: 'z', period: 0.14, amount: 0.4 }, top: { amount: 0.1, col: [1.1, 1.05, 0.95] } },
      style: { heavy: 0.2, attacks: ['claw', 'bite', 'lunge'], idle: 'prowl', gait: 'stalk', death: 'flop' },
    }),
  gulper_frog: (c) =>
    quadLook(c, {
      withers: 0.45,
      length: 0.6,
      width: 0.4,
      neck: 0.15,
      neckRise: 0.1,
      head: 0.7,
      tail: 0,
      slope: 0.15,
      splay: 0.9,
      girth: 0.22,
      chest: 0.18,
      belly: 0.16,
      legR: 0.05,
      haunch: 1.3,
      narrow: 1.2,
      paws: 'pad',
      surface: 'slime',
      head2: (s) => {
        // A wide flat head that is mostly mouth, eyes on top.
        const h = s.j('head');
        const sn = s.j('snout');
        s.ball('head', lerpV(h, sn, 0.4), V(0.22, 0.09, 0.2), { k: 0.06 });
        s.ball('jaw', lerpV(s.j('jaw'), sn, 0.4).add(V(0, -0.03, 0)), V(0.2, 0.06, 0.18), { k: 0.05 });
        s.pair((_side, x) => {
          s.ball('head', h.clone().add(V(x * 0.11, 0.08, 0.02)), 0.05, { k: 0.03 });
          s.eye('head', h.clone().add(V(x * 0.12, 0.1, 0.05)), 0.028, 1);
        });
        s.glow(s.j('jaw').add(V(0, 0, 0.1)), 0.05, 0.3);
      },
      extra: (s) => {
        const r = seq(13);
        for (let i = 0; i < 9; i++) s.boil('spine', s.j('spine').add(V((r() - 0.5) * 0.3, 0.16 + r() * 0.05, (r() - 0.5) * 0.3)), 0.018 + r() * 0.012, 0.3, [0.8, 0.85, 0.5]);
      },
      paint: { grime: 0.3, ao: 0.8, mottle: { scale: 7, amount: 0.5, col: [0.6, 0.75, 0.4] }, top: { amount: 0.2, col: [0.7, 0.8, 0.5] } },
      style: { heavy: 0.3, attacks: ['bite', 'lunge'], idle: 'breathe', gait: 'hop', death: 'flip' },
    }),
  rime_stag: (c) =>
    quadLook(c, {
      size: 0.7,
      withers: 1.25,
      length: 1.2,
      width: 0.12,
      neck: 0.5,
      neckRise: 0.7,
      head: 0.4,
      tail: 2,
      tailLen: 0.15,
      girth: 0.25,
      chest: 0.31,
      legR: 0.055,
      narrow: 0.72,
      paws: 'hoof',
      tier: 'big',
      alt: { surface: 'ice', tint: 0xcfefff },
      head2: (s) => {
        const h = s.j('head');
        const sn = s.j('snout');
        s.ball('head', h, V(0.08, 0.08, 0.1), { k: 0.03 });
        s.limb('head', h.clone().add(V(0, 0, 0.04)), sn, 0.06, 0.035, { k: 0.03 });
        s.limb('jaw', s.j('jaw'), sn.clone().add(V(0, -0.04, -0.03)), 0.04, 0.025, { k: 0.015 });
        s.pair((_side, x) => {
          s.eye('head', h.clone().add(V(x * 0.065, 0.03, 0.06)), 0.013, 1.3);
          s.hard('head', spikeGeo(h.clone().add(V(x * 0.06, 0.05, -0.03)), h.clone().add(V(x * 0.14, 0.09, -0.08)), 0.025, 4, undefined, 2), 'skin');
        });
        antlers(s, 0.9, [0.8, 0.92, 1], 0.4);
      },
      extra: (s) => {
        // Ice crusts on the flanks and a frozen beard.
        const r = seq(91);
        for (let i = 0; i < 10; i++) {
          const b = i < 5 ? 'chest' : 'hips';
          const p = s.j(b).add(V((r() - 0.5) * 0.35, 0.05 + r() * 0.15, (r() - 0.5) * 0.3));
          s.hard(b, spikeGeo(p, p.clone().add(V((r() - 0.5) * 0.1, 0.12 + r() * 0.1, -0.05)), 0.03, 4, undefined, 1), 'alt', [1, 1, 1], 0.25);
        }
        s.ball('neck', lerpV(s.j('neck'), s.j('head'), 0.3).add(V(0, -0.08, 0.05)), V(0.08, 0.12, 0.08), { mat: 'alt', k: 0.05 });
      },
      paint: { grime: 0.3, ao: 0.85, top: { amount: 0.45, col: [1.3, 1.35, 1.4] } },
      style: { heavy: 0.6, attacks: ['gore', 'stomp'], idle: 'still', gait: 'walk', death: 'collapse' },
    }),
  ashen_lion: (c) =>
    quadLook(c, {
      size: 0.85,
      withers: 1.0,
      length: 1.3,
      width: 0.15,
      neck: 0.32,
      neckRise: 0.3,
      head: 0.42,
      tail: 6,
      tailLen: 0.75,
      girth: 0.23,
      chest: 0.285,
      legR: 0.075,
      narrow: 0.82,
      tint: 0x6e6258,
      alt: { surface: 'lava', tint: 0x4a3028 },
      head2: (s) => {
        catHead(s, { w: 0.15, glow: 1.4 });
        mane(s, 0.28, 'alt');
      },
      extra: (s) => {
        // Embers in the mane and a burning tail tuft.
        s.boil('tail6', s.j('tailTip'), 0.05, 1, [1, 0.6, 0.3]);
        const r = seq(5);
        for (let i = 0; i < 8; i++) s.boil('neck', lerpV(s.j('neck'), s.j('head'), 0.5).add(V((r() - 0.5) * 0.4, (r() - 0.3) * 0.35, -0.1 - r() * 0.1)), 0.012, 1, [1, 0.6, 0.3]);
      },
      paint: { grime: 0.6, ao: 0.9, top: { amount: 0.25, col: [0.6, 0.58, 0.55] } },
      style: { heavy: 0.4, attacks: ['claw', 'bite', 'lunge'], idle: 'prowl', gait: 'stalk' },
    }),
  cave_bat: (c) =>
    flyerLook(c, {
      size: 2.0,
      body: 0.32,
      hover: 1.5,
      span: 1.1,
      surface: 'fur',
      alt: { surface: 'hide', tint: 0x4a3a32 },
      sculpt: (s) => {
        s.ball('body', s.j('body'), V(0.06, 0.06, 0.09), { k: 0.02 });
        s.ball('chest', s.j('chest'), V(0.065, 0.06, 0.06), { k: 0.02 });
        const h = s.j('head');
        s.ball('head', h, 0.045, { k: 0.015 });
        s.limb('head', h, h.clone().add(V(0, -0.01, 0.05)), 0.03, 0.018, { k: 0.01 });
        s.pair((_side, x) => {
          s.hard('head', spikeGeo(h.clone().add(V(x * 0.025, 0.025, -0.005)), h.clone().add(V(x * 0.05, 0.1, -0.02)), 0.022, 4, undefined, 2), 'alt');
          s.eye('head', h.clone().add(V(x * 0.022, 0.012, 0.04)), 0.008, 1);
          s.hard('jaw', spikeGeo(h.clone().add(V(x * 0.01, -0.015, 0.06)), h.clone().add(V(x * 0.01, -0.04, 0.065)), 0.004, 3, undefined, 1), 'skin', TOOTH);
        });
        batWings(s, { thick: 1, mat: 'alt', claw: true });
        s.pair((side) => s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`foot${side}`), 0.01, 0.006, { k: 0.005 }));
      },
      style: { heavy: 0.02, attacks: ['bite', 'claw'], idle: 'hover' },
    }),
  harpy_screecher: (c) =>
    flyerLook(c, {
      body: 1.0,
      hover: 1.25,
      span: 2.3,
      upright: true,
      tail: 3,
      surface: 'flesh',
      alt: { surface: 'fur', tint: 0x4a3c30 },
      sculpt: (s) => {
        const ch = s.j('chest');
        const bd = s.j('body');
        // A starved woman's torso, ribs showing, feathered from the waist down.
        s.ball('chest', ch.clone().add(V(0, 0.02, 0)), V(0.13, 0.15, 0.095), { k: 0.04 });
        s.limb('chest', ch, bd.clone().add(V(0, 0.06, 0)), 0.1, 0.085, { k: 0.04 });
        s.ball('body', bd, V(0.15, 0.13, 0.12), { mat: 'alt', k: 0.05 });
        for (let i = 0; i < 4; i++) s.pair((_side, x) => s.limb('chest', ch.clone().add(V(x * 0.02, -0.02 - i * 0.04, 0.085)), ch.clone().add(V(x * 0.12, -0.04 - i * 0.045, 0.03)), 0.01, 0.008, { k: 0.01 }));
        s.limb('neck', s.j('neck'), s.j('head'), 0.045, 0.04, { k: 0.02 });
        const h = s.j('head');
        s.ball('head', h.clone().add(V(0, 0.03, 0)), V(0.075, 0.09, 0.085), { k: 0.02 });
        s.limb('jaw', s.j('jaw'), s.j('jaw').add(V(0, -0.03, 0.035)), 0.045, 0.03, { k: 0.015 });
        // A screaming hole of a mouth.
        s.ball('jaw', s.j('jaw').add(V(0, -0.005, 0.05)), V(0.025, 0.035, 0.03), { sub: true, k: 0.01 });
        // Wild hair streaming back.
        for (let i = 0; i < 11; i++) {
          const a = (i / 10) * Math.PI * 1.5 - 0.75;
          const b = h.clone().add(V(Math.sin(a) * 0.07, 0.08, -0.02 + Math.cos(a) * 0.01));
          s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.1, -0.2, -0.14)), 0.03, 3, undefined, 2), 'alt', [0.3, 0.28, 0.27]);
        }
        s.pair((side, x) => {
          s.eye('head', h.clone().add(V(x * 0.032, 0.035, 0.075)), 0.011, 1.4);
          s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.065, 0.045, { mat: 'alt', k: 0.03 });
          s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.03, 0.022, { k: 0.01 });
          const f = s.j(`foot${side}`);
          for (let i = 0; i < 3; i++) s.hard(`foot${side}`, spikeGeo(f, f.clone().add(V((i - 1) * 0.045, -0.08, 0.1)), 0.012, 4, V(0, -0.03, 0.03), 3), 'skin', CLAW);
          s.hard(`foot${side}`, spikeGeo(f, f.clone().add(V(0, -0.07, -0.08)), 0.011, 4, V(0, -0.02, -0.02), 3), 'skin', CLAW);
        });
        featherWings(s, { len: 0.75, mat: 'alt' });
        for (let i = 1; i <= 3; i++) {
          const p = s.j(`tail${i}`);
          s.pair((_side, x) => s.hard(`tail${i}`, membraneGeo(p, [p.clone().add(V(x * 0.04, -0.02, -0.08)), p.clone().add(V(x * 0.1, -0.08, -0.32)), p.clone().add(V(x * 0.01, -0.06, -0.3))], 0.008, 0.03), 'alt'));
        }
      },
      style: { heavy: 0.1, attacks: ['claw', 'hurl'], ranged: true, idle: 'hover', spawn: 'swoop' },
    }),
  wyvern_whelp: (c) =>
    flyerLook(c, {
      body: 1.0,
      hover: 1.4,
      span: 2.8,
      tail: 6,
      neck: 0.45,
      surface: 'scale',
      alt: { surface: 'hide', tint: 0x4a5a3a },
      tier: 'normal',
      sculpt: (s) => {
        s.ball('body', s.j('body'), V(0.21, 0.2, 0.32), { k: 0.06 });
        s.ball('chest', s.j('chest'), V(0.22, 0.22, 0.2), { k: 0.06 });
        s.ball('body', s.j('body').add(V(0, -0.08, 0.1)), V(0.16, 0.12, 0.22), { mat: 'alt', k: 0.05 });
        s.limb('neck', s.j('chest'), s.j('neck'), 0.13, 0.1, { k: 0.05 });
        s.limb('neck', s.j('neck'), s.j('head'), 0.1, 0.08, { k: 0.04 });
        const h = s.j('head');
        s.ball('head', h, V(0.1, 0.085, 0.12), { k: 0.03 });
        s.limb('head', h, h.clone().add(V(0, -0.01, 0.2)), 0.075, 0.04, { k: 0.02 });
        s.limb('jaw', s.j('jaw'), s.j('jaw').add(V(0, -0.025, 0.15)), 0.05, 0.028, { k: 0.015 });
        s.pair((side, x) => {
          s.eye('head', h.clone().add(V(x * 0.07, 0.035, 0.08)), 0.016, 1.2);
          s.hard('head', spikeGeo(h.clone().add(V(x * 0.05, 0.05, -0.05)), h.clone().add(V(x * 0.11, 0.1, -0.26)), 0.028, 5, V(0, 0.04, 0), 3), 'skin', HORN);
          s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.085, 0.055, { k: 0.03 });
          s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.045, 0.032, { k: 0.015 });
          const f = s.j(`foot${side}`);
          for (let i = 0; i < 3; i++) s.hard(`foot${side}`, spikeGeo(f, f.clone().add(V((i - 1) * 0.04, -0.05, 0.09)), 0.01, 4, V(0, -0.02, 0.02), 3), 'skin', CLAW);
        });
        for (let i = 0; i < 5; i++) {
          const t = 0.15 + i * 0.12;
          s.pair((_side, x) => {
            const p = lerpV(s.j('jaw'), s.j('jaw').add(V(0, 0, 0.15)), t).add(V(x * 0.035, 0.02, 0));
            s.hard('head', spikeGeo(p, p.clone().add(V(0, -0.035, 0)), 0.007, 3, undefined, 1), 'skin', TOOTH);
          });
        }
        let prev = 'body';
        for (let i = 1; i <= 6; i++) {
          const n = `tail${i}`;
          s.limb(prev, s.j(prev), s.j(n), 0.13 * (1 - i * 0.13), 0.13 * (1 - (i + 1) * 0.13), { k: 0.03 });
          prev = n;
        }
        // The barb.
        const tt = s.j('tailTip');
        s.hard('tail6', spikeGeo(s.j('tail6'), tt.clone().add(V(0, 0.03, -0.1)), 0.06, 4, undefined, 2), 'skin', HORN);
        batWings(s, { thick: 1.2, mat: 'alt', claw: true });
        hackles(s, 'body', 'chest', 6, 0.08, 'skin', 0.1);
      },
      style: { heavy: 0.35, attacks: ['bite', 'sting', 'claw'], idle: 'hover', spawn: 'swoop' },
    }),
  basilisk: (c) =>
    serpentLook(c, {
      length: 3.4,
      girth: 0.26,
      front: 4,
      rear: 6,
      rise: 0.75,
      head: 0.09,
      surface: 'scale',
      sculpt: (s) => {
        serpentBody(s, { girth: 0.26, plates: HORN });
        serpentHead(s, { w: 0.22, teeth: 4, crest: 1, glow: 2 });
        // A crown of spines and a frill that flares behind the head.
        const h = s.j('head');
        s.pair((_side, x) => s.hard('head', membraneGeo(h.clone().add(V(x * 0.1, 0.05, -0.05)), [h.clone().add(V(x * 0.32, 0.25, -0.15)), h.clone().add(V(x * 0.36, 0.05, -0.2)), h.clone().add(V(x * 0.28, -0.15, -0.15))], 0.01, 0.1), 'alt'));
        // Six stubby legs along the body.
        for (const [b, k] of [['f1', 0], ['body', 1], ['t2', 2]] as const) {
          s.pair((_side, x) => {
            const p = s.j(b);
            const foot = V(p.x + x * 0.42, 0.04, p.z + 0.06);
            s.limb(b, p.clone().add(V(x * 0.18, -0.04, 0)), foot, 0.08, 0.05, { k: 0.04 });
            for (let i = 0; i < 3; i++) s.hard(b, spikeGeo(foot, foot.clone().add(V(x * 0.03 + (i - 1) * 0.04, -0.03, 0.12)), 0.016, 3, undefined, 1), 'skin', CLAW);
            void k;
          });
        }
      },
      style: { heavy: 0.45, attacks: ['bite', 'lash'], idle: 'sway', gait: 'slither', ranged: false },
    }),
  tunnel_worm: (c) =>
    serpentLook(c, {
      size: 0.8,
      length: 4.0,
      girth: 0.3,
      front: 4,
      rear: 6,
      rise: 1.0,
      head: 0.06,
      surface: 'flesh',
      tier: 'big',
      sculpt: (s) => {
        serpentBody(s, { girth: 0.3, rings: 1 });
        // A round lamprey maw ringed with teeth, no eyes.
        const h = s.j('head');
        const sn = s.j('snout');
        s.ball('head', h, V(0.32, 0.32, 0.25), { k: 0.08 });
        s.ball('head', sn.clone().add(V(0, 0, 0.02)), V(0.22, 0.22, 0.12), { sub: true, k: 0.04 });
        for (let ring = 0; ring < 2; ring++) {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + ring * 0.3;
            const p = sn.clone().add(V(Math.sin(a) * (0.22 - ring * 0.07), Math.cos(a) * (0.22 - ring * 0.07) + 0.02, -0.04 - ring * 0.06));
            s.hard('head', spikeGeo(p, p.clone().add(V(-Math.sin(a) * 0.08, -Math.cos(a) * 0.08, -0.03)), 0.018, 3, undefined, 1), 'skin', TOOTH);
          }
        }
        s.glow(sn.clone().add(V(0, 0, -0.1)), 0.12, 0.2);
      },
      paint: { grime: 0.5, ao: 0.95, mottle: { scale: 4, amount: 0.4, col: [0.8, 0.6, 0.6] }, bands: { axis: 'z', period: 0.28, amount: 0.35 } },
      style: { heavy: 0.6, attacks: ['bite', 'slam'], idle: 'sway', gait: 'slither', spawn: 'emerge', death: 'coil' },
    }),
  chasm_leviathan: (c) =>
    serpentLook(c, {
      size: 0.65,
      length: 6.0,
      girth: 0.5,
      front: 5,
      rear: 7,
      rise: 1.6,
      head: 0.09,
      surface: 'scale',
      tier: 'big',
      sculpt: (s) => {
        serpentBody(s, { girth: 0.5, plates: [0.35, 0.4, 0.3] });
        serpentHead(s, { w: 0.44, teeth: 6, horns: 1, glow: 2 });
        // Fins down the neck, glowing gill slits.
        for (let i = 1; i <= 4; i++) {
          const p = s.j(`f${i}`);
          s.pair((_side, x) => {
            s.hard(`f${i}`, membraneGeo(p.clone().add(V(x * 0.42, 0.05, 0)), [p.clone().add(V(x * 0.9, 0.35, -0.2)), p.clone().add(V(x * 1.0, 0.0, -0.45)), p.clone().add(V(x * 0.65, -0.18, -0.4))], 0.025, 0.15), 'alt');
            // Gill slits: dark grooves.
            for (let k = 0; k < 3; k++) s.tint(p.clone().add(V(x * 0.46, 0.1 - k * 0.09, 0.12)), 0.05, [0.35, 0.2, 0.18]);
          });
        }
      },
      style: { heavy: 0.8, attacks: ['bite', 'lash', 'slam'], idle: 'sway', gait: 'slither', spawn: 'emerge', death: 'coil' },
    }),
};

export { BEAST, quadLook, flyerLook, serpentLook, catHead, bearHead, batWings, featherWings, serpentBody, serpentHead, hackles, mane, antlers };
export type { QuadOpt };
void quadChest;
void quadChestR;
void THREE;
