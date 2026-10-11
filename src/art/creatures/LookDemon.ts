/**
 * SLAY — demons: imps, rippers, hellhounds, cinder archers, pit brutes, the
 * lash temptress, void stalkers, ember fiends, soulbinders, the chaos maw,
 * balor lieutenants, sin eaters and the brimstone hulk.
 *
 * Built on the upright rig with the parts demons have and men do not: horns,
 * bat wings folded behind the shoulders, tails, hocks, a second pair of arms,
 * more eyes than a face should hold, and lava showing through cracked hide.
 * Each one keeps a silhouette of its own: the imp's huge head and wings, the
 * ripper's forearm blades, the brute's bull horns and knuckles, the maw's
 * belly mouth, the balor's wings and greatsword, the hulk's chimneys.
 */
import * as THREE from 'three';
import { bipedRig, flyerRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, PaintSpec, RGB, Sculpt } from './Sculpt';
import { boxGeo, membraneGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { weapon, type WeaponKind } from './Arms';
import { V, belt, claws, fleshArms, fleshHead, fleshLegs, lerpV, mixHex, quatAlong, seq, skirt, trunk } from './Kit';
import { houndHead } from './LookUndead';
import { hackles, quadLook } from './LookBeast';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const HORN: RGB = [0.2, 0.16, 0.14];
const BONE: RGB = [0.82, 0.76, 0.6];
const TOOTH: RGB = [0.85, 0.8, 0.62];
const IRON: RGB = [0.32, 0.3, 0.3];
const LAVA: RGB = [1.6, 0.7, 0.22];
const VOID: RGB = [1.0, 0.5, 1.5];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

type HornKind = 'ram' | 'bull' | 'swept' | 'nub' | 'spire' | 'crown';

/** The centre of a `fleshHead` cranium of size `k` (= size * H). */
function cranium(s: Sculpt, k: number): THREE.Vector3 {
  return s.j('head').add(V(0, 0.04 * k, 0.01 * k));
}

/** Horns off the crown of the head. `k` is the head's size times H. */
function horns(s: Sculpt, kind: HornKind, k: number, len: number, col: RGB = HORN, glowTip = 0): void {
  const c = cranium(s, k);
  if (kind === 'crown') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * Math.PI * 1.1;
      const b = c.clone().add(V(Math.sin(a) * 0.05 * k, 0.045 * k, Math.cos(a) * 0.02 * k - 0.01 * k));
      const h = (i === 3 ? 0.09 : 0.06 - Math.abs(i - 3) * 0.006) * k * len;
      s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.025 * k, h, -0.02 * k)), 0.011 * k, 5, undefined, 2), 'skin', col, glowTip);
    }
    return;
  }
  s.pair((_side, x) => {
    const b = c.clone().add(V(x * 0.036 * k, 0.042 * k, 0.012 * k));
    const L = k * len;
    let pts: THREE.Vector3[];
    let r = 0.017 * k * Math.sqrt(len);
    switch (kind) {
      case 'ram': {
        // Up and back, then curling down and forward past the ear.
        pts = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const ang = t * Math.PI * 1.55;
          const rad = 0.05 * L * (1 - 0.4 * t);
          pts.push(b.clone().add(V(x * (0.008 * k + t * 0.05 * L), Math.sin(ang) * rad, (Math.cos(ang) - 1) * rad * 0.9)));
        }
        r *= 1.25;
        break;
      }
      case 'bull':
        pts = [b, b.clone().add(V(x * 0.06 * L, 0.004 * L, 0.012 * L)), b.clone().add(V(x * 0.105 * L, 0.03 * L, 0.03 * L)), b.clone().add(V(x * 0.12 * L, 0.08 * L, 0.045 * L))];
        r *= 1.3;
        break;
      case 'swept':
        pts = [b, b.clone().add(V(x * 0.018 * L, 0.03 * L, -0.035 * L)), b.clone().add(V(x * 0.032 * L, 0.06 * L, -0.095 * L)), b.clone().add(V(x * 0.04 * L, 0.1 * L, -0.16 * L))];
        break;
      case 'spire':
        pts = [b, b.clone().add(V(x * 0.018 * L, 0.09 * L, -0.02 * L)), b.clone().add(V(x * 0.03 * L, 0.17 * L, -0.05 * L))];
        break;
      default:
        pts = [b, b.clone().add(V(x * 0.012 * L, 0.02 * L, -0.004 * L)), b.clone().add(V(x * 0.02 * L, 0.04 * L, -0.014 * L))];
    }
    s.hard('head', tubeGeo(pts, (t) => r * (1 - 0.86 * t), 7, true), 'skin', col, glowTip);
  });
}

/** Extra eyes on a `fleshHead` face: [x, y] in shares of the head size, set on the face's curve. */
function eyesAt(s: Sculpt, k: number, at: ReadonlyArray<readonly [number, number]>, r: number, glow: number): void {
  const c = cranium(s, k);
  for (const [x, y] of at) {
    const f = Math.max(0.25, 1 - (x / 0.058) ** 2 - (y / 0.064) ** 2);
    s.eye('head', c.clone().add(V(x * k, y * k, 0.064 * k * Math.sqrt(f) + 0.002 * k)), r * k, glow);
  }
}

/**
 * Bat wings folded up behind the shoulders (upright rigs) or spread (flyers):
 * an arm and forearm of bone, three finger spars off the wrist, and membrane
 * strung between them, hanging the way `trail` points.
 */
function demonWings(s: Sculpt, o: { thick?: number; mat?: CMat; bone?: CMat; trail?: THREE.Vector3; claw?: boolean; spar?: RGB }): void {
  const mat = o.mat ?? 'alt';
  const bone = o.bone ?? 'skin';
  const th = o.thick ?? 1;
  const trail = (o.trail ?? V(0, -1, -0.3)).clone().normalize();
  s.pair((side, x) => {
    const a = s.j(`wing${side}`);
    const e = s.j(`wing${side}2`);
    const w = s.j(`wing${side}3`);
    const tip = s.j(`wing${side}Tip`);
    const R = a.distanceTo(tip);
    s.limb(`wing${side}`, a, e, 0.04 * R * th, 0.028 * R * th, { mat: bone, k: 0.012 * R });
    s.limb(`wing${side}2`, e, w, 0.028 * R * th, 0.02 * R * th, { mat: bone, k: 0.01 * R });
    s.ball(`wing${side}3`, w, 0.026 * R * th, { mat: bone, k: 0.008 * R });
    const out = tip.clone().sub(w);
    const f1 = w.clone().addScaledVector(trail, R * 0.62).addScaledVector(out, 0.45);
    const f2 = w.clone().addScaledVector(trail, R * 0.72).addScaledVector(e.clone().sub(w), 0.25);
    const inner = e.clone().addScaledVector(trail, R * 0.62);
    const root = a.clone().addScaledVector(trail, R * 0.42);
    root.x *= 0.35;
    for (const f of [tip, f1, f2]) s.hard(`wing${side}3`, tubeGeo([w, lerpV(w, f, 0.5).addScaledVector(trail, R * 0.03), f], (t) => (0.016 - 0.012 * t) * R * th, 5, true), bone, o.spar);
    // Membrane panels: outer on the hand, middle on the forearm, inner on the arm.
    s.hard(`wing${side}3`, membraneGeo(w, [tip, lerpV(tip, f1, 0.5).addScaledVector(trail, -R * 0.04), f1, lerpV(f1, f2, 0.5).addScaledVector(trail, -R * 0.05), f2], 0.007 * R, 0.14), mat);
    s.hard(`wing${side}2`, membraneGeo(e, [w, f2, lerpV(f2, inner, 0.5).addScaledVector(trail, -R * 0.05), inner], 0.007 * R, 0.12), mat);
    s.hard(`wing${side}`, membraneGeo(a, [e, inner, lerpV(inner, root, 0.5).addScaledVector(trail, -R * 0.04), root], 0.007 * R, 0.1), mat);
    if (o.claw ?? true) s.hard(`wing${side}3`, spikeGeo(w, w.clone().add(V(x * 0.02 * R, R * 0.09, R * 0.03)), 0.016 * R * th, 4, undefined, 2), 'skin', HORN);
  });
}

/** A tail down the rig's tail chain, tapering, with a spade, a barb or nothing at the end. */
function demonTail(s: Sculpt, r: number, tip: 'spade' | 'barb' | 'none', mat: CMat = 'skin', col: RGB = HORN): void {
  let prev = 'hips';
  let n = 0;
  while (s.has(`tail${n + 1}`)) n++;
  if (!n) return;
  for (let i = 1; i <= n; i++) {
    const b = `tail${i}`;
    const t0 = (i - 1) / n;
    const t1 = i / n;
    s.limb(prev, i === 1 ? s.j(b).lerp(s.j('hips'), 0.6) : s.j(prev), s.j(b), r * (1 - 0.7 * t0), r * (1 - 0.7 * t1), { mat, k: r * 0.6 });
    prev = b;
  }
  const end = s.j('tailTip');
  const last = s.j(prev);
  s.limb(prev, last, end, r * 0.3, r * 0.18, { mat, k: r * 0.3 });
  const dir = end.clone().sub(last).normalize();
  if (tip === 'spade') {
    const L = r * 3.2;
    const side = V(1, 0, 0);
    const a = end.clone().addScaledVector(dir, -L * 0.15);
    s.hard(prev, membraneGeo(a, [a.clone().addScaledVector(side, L * 0.55).addScaledVector(dir, -L * 0.1), a.clone().addScaledVector(side, L * 0.35).addScaledVector(dir, L * 0.5), a.clone().addScaledVector(dir, L * 1.05), a.clone().addScaledVector(side, -L * 0.35).addScaledVector(dir, L * 0.5), a.clone().addScaledVector(side, -L * 0.55).addScaledVector(dir, -L * 0.1)], r * 0.25, 0), mat, col);
  } else if (tip === 'barb') {
    s.hard(prev, spikeGeo(end.clone().addScaledVector(dir, -r * 0.5), end.clone().addScaledVector(dir, r * 2.6).add(V(0, r * 0.5, 0)), r * 0.45, 5, V(0, r * 0.8, 0), 3), 'skin', col);
  }
}

/** A row of bone spurs down the back, hips to neck. */
function backSpines(s: Sculpt, n: number, len: number, depth: number, col: RGB = HORN, glow = 0): void {
  const H = s.rig.height;
  const hp = s.j('hips');
  const ch = s.j('chest');
  const nk = s.j('neck');
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = t < 0.55 ? lerpV(hp, ch, t / 0.55) : lerpV(ch, nk, (t - 0.55) / 0.45);
    p.z -= depth * H * (t < 0.2 ? 0.8 : 1);
    p.y += 0.02 * H;
    const bone = t < 0.3 ? 'hips' : t < 0.55 ? 'spine' : t < 0.9 ? 'chest' : 'neck';
    const l = len * H * (0.6 + 0.6 * Math.sin(t * Math.PI));
    s.hard(bone, spikeGeo(p, p.clone().add(V(0, l * 0.75, -l * 0.7)), l * 0.28, 5, V(0, l * 0.15, 0), 2), 'skin', col, glow);
  }
}

/** Iron shackles on both wrists, each with a short length of broken chain. */
function shackles(s: Sculpt, r: number): void {
  const H = s.rig.height;
  s.pair((side) => {
    const f = s.j(`fore${side}`);
    const h = s.j(`hand${side}`);
    const at = lerpV(f, h, 0.82);
    const dir = h.clone().sub(f).normalize();
    s.hard(`fore${side}`, ringGeo(at, r * H, 0.012 * H, dir, 12), 'metal', IRON);
    s.hard(`fore${side}`, ringGeo(at.clone().addScaledVector(dir, -0.03 * H), r * H * 0.98, 0.009 * H, dir, 12), 'metal', IRON);
    let p = at.clone().add(V(0, -r * H, 0));
    for (let i = 0; i < 4; i++) {
      const q = p.clone().add(V(0, -0.035 * H, (i % 2 ? 1 : -1) * 0.006 * H));
      const n = i % 2 ? V(1, 0, 0) : V(0, 0, 1);
      s.hard(`fore${side}`, ringGeo(lerpV(p, q, 0.5), 0.016 * H, 0.005 * H, n, 8).scale(1, 1, 1), 'metal', IRON);
      p = q;
    }
  });
}

// ---------------------------------------------------------------------------
// The upright fiend
// ---------------------------------------------------------------------------

interface FiendOpt {
  height: number;
  kind?: 'biped' | 'brute' | 'giant';
  /** Bulk: 1 lean man, 1.5 a brute. */
  thick?: number;
  hip?: number;
  hunch?: number;
  head?: number;
  arms?: number;
  shoulders?: number;
  armOut?: number;
  digitigrade?: boolean;
  tail?: number;
  tailLen?: number;
  tailTip?: 'spade' | 'barb' | 'none';
  wings?: number;
  wingMat?: CMat;
  arms2?: boolean;
  skin: number;
  skinSurface: Surface;
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  horns?: HornKind;
  hornLen?: number;
  hornCol?: RGB;
  /** The face: `fleshHead` options, or a function that builds its own. */
  face?: Parameters<typeof fleshHead>[1];
  faceFn?: (s: Sculpt, H: number) => void;
  claws?: number;
  toes?: number;
  spines?: number;
  /** Glowing cracks through the hide (lava or void), 0 none. */
  cracks?: number;
  crackCol?: RGB;
  belly?: number;
  hump?: number;
  weapon?: WeaponKind;
  weaponSize?: number;
  weaponGlow?: number;
  steel?: RGB;
  extra?: (s: Sculpt, H: number) => void;
  paintSkin?: PaintSpec;
  lumps?: { amp: number; scale: number };
  size?: number;
  tier?: CreatureLook['tier'];
  style: Partial<MotionStyle>;
}

function fiendLook(c: LookCtx, o: FiendOpt): CreatureLook {
  const H = o.height;
  const t = o.thick ?? 1;
  const kind = o.kind ?? 'biped';
  const glow = c.visual.glow ?? 0xff5020;
  const headK = o.face?.size ?? o.head ?? 1;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? (kind === 'giant' ? 'big' : H * (o.size ?? 1) < 1.3 ? 'small' : 'normal'),
    rig: () =>
      bipedRig(kind, {
        height: H,
        hip: o.hip ?? 0.5,
        shoulders: o.shoulders ?? 0.125 * Math.sqrt(t),
        hips: 0.062 * Math.sqrt(t),
        arms: o.arms ?? 1.05,
        hunch: o.hunch ?? 0.15,
        head: o.head ?? 1,
        digitigrade: o.digitigrade,
        tail: o.tail ?? 0,
        tailLen: o.tailLen ?? 0.55,
        wings: o.wings ?? 0,
        arms2: o.arms2,
        armOut: o.armOut,
      }),
    sculpt: (s: Sculpt) => {
      trunk(s, {
        chest: [0.112 * t, 0.078 * t, 0.112],
        pelvis: [0.08 * t, 0.064 * t, 0.064],
        shoulders: 0.046 * t,
        belly: o.belly,
        hump: o.hump,
      });
      fleshArms(s, { r: 0.033 * t, swell: 0.02 * t, claws: o.claws, fingers: 4, clawCol: HORN });
      if (o.arms2) fleshArms(s, { r: 0.027 * t, swell: 0.015 * t, claws: o.claws, fingers: 3, clawCol: HORN, set: '2' });
      fleshLegs(s, { r: 0.052 * t, swell: 0.024 * t, toes: o.toes, toeCol: HORN });
      // Neck.
      s.limb('neck', s.j('chest').lerp(s.j('neck'), 0.4), s.j('head'), 0.042 * t * H, 0.034 * H * Math.sqrt(t), { k: 0.02 * H });
      if (o.faceFn) o.faceFn(s, H);
      else fleshHead(s, { size: headK, snout: 0.45, brow: 1.6, jaw: 1.15, teeth: TOOTH, ears: 0.7, eyes: 1.5, ...o.face });
      if (o.horns) horns(s, o.horns, headK * H, o.hornLen ?? 1, o.hornCol ?? HORN);
      if (o.tail) demonTail(s, 0.032 * H * Math.sqrt(t), o.tailTip ?? 'none');
      if (o.wings) demonWings(s, { mat: o.wingMat ?? 'alt', thick: 1 });
      if (o.spines) backSpines(s, o.spines, 0.05, 0.075 * t, o.hornCol ?? HORN);
      if (o.weapon) weapon(s, o.weapon, { steel: o.steel ?? IRON, size: o.weaponSize ?? 1, glow: o.weaponGlow });
      o.extra?.(s, H);
      const crack = o.cracks ?? 0;
      s.paint.skin = o.paintSkin ?? {
        grime: 0.45,
        ao: 0.9,
        mottle: { scale: 5, amount: 0.35, col: [0.55, 0.42, 0.38] },
        top: { amount: 0.12, col: [1.1, 1.0, 0.95] },
        veins: crack ? { scale: 6, cut: 0.935, glow: Math.min(0.7, crack * 0.65), col: o.crackCol ?? LAVA } : undefined,
      };
      s.paint.alt = { grime: 0.4, ao: 0.85, mottle: { scale: 4, amount: 0.3, col: [0.5, 0.4, 0.38] }, tips: { amount: 0.35, col: [0.4, 0.3, 0.28] } };
      s.paint.metal = { grime: 0.45, ao: 0.7, mottle: { scale: 9, amount: 0.4, col: [0.5, 0.35, 0.25] } };
      if (o.lumps) s.lumps.skin = o.lumps;
    },
    mats: {
      skin: { surface: o.skinSurface, tint: o.skin, glow },
      alt: { surface: o.alt?.surface ?? 'hide', tint: o.alt?.tint ?? mixHex(o.skin, 0x000000, 0.45), glow },
      metal: { surface: o.metal?.surface ?? 'iron', tint: o.metal?.tint ?? 0x8a8078, glow },
    },
    style: {
      heavy: kind === 'giant' ? 0.75 : 0.2,
      spawn: 'rise',
      death: kind === 'giant' ? 'crash' : 'collapse',
      idle: 'breathe',
      gait: kind === 'giant' ? 'lumber' : 'walk',
      ...o.style,
    },
  };
}

// ---------------------------------------------------------------------------
// Flair
// ---------------------------------------------------------------------------

/** Long bone blades growing from the forearms past the hands (fleshripper). */
function forearmBlades(s: Sculpt, H: number): void {
  s.pair((side, x) => {
    const f = s.j(`fore${side}`);
    const h = s.j(`hand${side}`);
    const dir = h.clone().sub(f).normalize();
    const a = lerpV(f, h, 0.35).add(V(x * 0.025 * H, 0, -0.01 * H));
    const b = h.clone().addScaledVector(dir, 0.3 * H).add(V(x * 0.03 * H, 0, 0.02 * H));
    s.hard(`fore${side}`, spikeGeo(a, b, 0.022 * H, 5, V(0, 0.03 * H, 0.03 * H), 4).scale(1, 1, 1), 'skin', BONE);
    // A spur at the elbow.
    s.hard(`fore${side}`, spikeGeo(f, f.clone().add(V(x * 0.02 * H, 0.01 * H, -0.09 * H)), 0.014 * H, 4, undefined, 2), 'skin', BONE);
  });
}

/** A quiver on the back with burning arrowheads, and a harness strap (cinder archer). */
function quiver(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  const a = ch.clone().add(V(0.05 * H, -0.08 * H, -0.09 * H));
  const b = ch.clone().add(V(-0.04 * H, 0.1 * H, -0.1 * H));
  s.hard('chest', tubeGeo([a, b], () => 0.03 * H, 8), 'alt', [0.3, 0.2, 0.15]);
  for (let i = 0; i < 4; i++) {
    const p = b.clone().add(V((i - 1.5) * 0.012 * H, 0.0, (i % 2) * 0.012 * H));
    const q = p.clone().add(V(-0.01 * H, 0.08 * H, 0));
    s.hard('chest', tubeGeo([p, q], () => 0.003 * H, 3), 'alt', [0.35, 0.25, 0.15]);
    s.hard('chest', spikeGeo(q, q.clone().add(V(-0.003 * H, 0.03 * H, 0)), 0.007 * H, 4, undefined, 1), 'skin', [1, 0.6, 0.25], 1);
  }
  belt(s, { strap: true, pouches: 1, col: [0.25, 0.18, 0.14] });
}

/** A crown of flame: glowing tongues rising off the head and shoulders. */
function flames(s: Sculpt, bone: string, at: THREE.Vector3, n: number, len: number, spread: number, seed: number, col: RGB = [1, 0.55, 0.2]): void {
  const r = seq(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n - 1) - 0.5) * Math.PI * 1.2;
    const b = at.clone().add(V(Math.sin(a) * spread, 0, Math.cos(a) * spread * 0.5 - spread * 0.3));
    const l = len * (0.6 + r() * 0.6);
    s.hard(bone, spikeGeo(b, b.clone().add(V(Math.sin(a) * l * 0.25, l, -l * 0.35)), len * 0.18, 4, V(0, 0, -l * 0.2), 3), 'skin', col, 1);
  }
}

/** A hooked blade in each lower hand, on a chain (sin eater). */
function hooks(s: Sculpt, H: number): void {
  s.pair((side, x) => {
    const h = s.j(`hand2${side}`);
    const t = s.j(`hand2${side}Tip`);
    const p = lerpV(h, t, 0.7);
    const dir = t.clone().sub(h).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const a = u * Math.PI * 1.25;
      pts.push(p.clone().addScaledVector(dir, Math.sin(a) * 0.08 * H).add(V(x * 0.01 * H, (1 - Math.cos(a)) * -0.05 * H + u * 0.02 * H, u * 0.03 * H)));
    }
    s.hard(`hand2${side}`, tubeGeo(pts, (u) => (0.012 - 0.009 * u) * H, 5, true), 'metal', [0.5, 0.46, 0.42]);
    // Chain looping back up to the wrist.
    let q = p.clone();
    for (let i = 0; i < 3; i++) {
      const nq = q.clone().add(V(x * 0.006 * H, -0.03 * H, -0.01 * H));
      s.hard(`hand2${side}`, ringGeo(lerpV(q, nq, 0.5), 0.012 * H, 0.004 * H, i % 2 ? V(1, 0, 0) : V(0, 0, 1), 8), 'metal', IRON);
      q = nq;
    }
  });
}

/** Stitched lips and a row of iron staples across the mouth (sin eater). */
function stitches(s: Sculpt, k: number): void {
  const jw = s.j('jaw');
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.3;
    const p = jw.clone().add(V(Math.sin(a) * 0.03 * k, 0.004 * k, 0.04 * k + Math.cos(a) * 0.012 * k));
    s.hard('head', boxGeo(p, V(0.004 * k, 0.026 * k, 0.004 * k)), 'metal', IRON);
  }
}

/** A mouth in the belly: a split ringed with teeth, a burning throat inside (chaos maw). */
function bellyMaw(s: Sculpt, H: number, col: RGB): void {
  const sp = s.j('spine');
  const ch = s.j('chest');
  const c = lerpV(sp, ch, 0.45).add(V(0, 0, 0.165 * H));
  s.ball('spine', c.clone().add(V(0, 0, 0.01 * H)), V(0.07 * H, 0.1 * H, 0.06 * H), { sub: true, k: 0.015 * H });
  s.boil('spine', c.clone().add(V(0, 0, -0.06 * H)), 0.026 * H, 0.8, col);
  // Lips: a thick rim of flesh.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const p = c.clone().add(V(Math.sin(a) * 0.072 * H, Math.cos(a) * 0.1 * H, -0.012 * H));
    s.ball(i < 4 || i > 10 ? 'chest' : 'spine', p, 0.028 * H, { k: 0.02 * H });
    // Teeth point inward toward the throat.
    const inward = c.clone().sub(p).setZ(0).normalize();
    const b = p.clone().add(V(0, 0, 0.004 * H));
    s.hard(i < 4 || i > 10 ? 'chest' : 'spine', spikeGeo(b, b.clone().addScaledVector(inward, 0.045 * H).add(V(0, 0, -0.012 * H)), 0.01 * H, 4, undefined, 2), 'skin', TOOTH);
  }
}

/** Rock plates, a furnace heart and two chimneys on the back (brimstone hulk). */
function furnace(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  // The heart shows through a split in the chest.
  s.ball('chest', ch.clone().add(V(0, 0.0, 0.14 * H)), V(0.045 * H, 0.08 * H, 0.05 * H), { sub: true, k: 0.01 * H });
  s.boil('chest', ch.clone().add(V(0, 0.0, 0.1 * H)), 0.05 * H, 1, [1.2, 0.7, 0.3]);
  // Chimneys rising off the shoulders behind the head, a glow at each mouth.
  s.pair((_side, x) => {
    const b = ch.clone().add(V(x * 0.08 * H, 0.05 * H, -0.13 * H));
    const tp = b.clone().add(V(x * 0.03 * H, 0.26 * H, -0.06 * H));
    s.hard('chest', tubeGeo([b, lerpV(b, tp, 0.5), tp], (u) => (0.04 - 0.008 * u) * H, 8), 'skin', [0.3, 0.27, 0.25]);
    s.hard('chest', ringGeo(tp, 0.034 * H, 0.009 * H, tp.clone().sub(b).normalize(), 10), 'skin', [0.25, 0.22, 0.2]);
    s.boil('chest', tp.clone().add(V(0, -0.005 * H, 0)), 0.026 * H, 1, [1.2, 0.6, 0.2]);
  });
  // Plates of rock on the shoulders and forearms, boulder fists.
  const r = seq(77);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    for (let i = 0; i < 3; i++) {
      const p = a.clone().add(V(x * (0.02 + i * 0.015) * H, (0.05 - i * 0.025) * H, (i - 1) * 0.04 * H));
      s.box(`arm${side}`, p, V(0.05 * H, 0.035 * H, 0.05 * H), { k: 0.01 * H, round: 0.012 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() - 0.5, r(), x * (0.4 + r() * 0.3))) });
    }
    const f = s.j(`fore${side}`);
    const h = s.j(`hand${side}`);
    s.box(`fore${side}`, lerpV(f, h, 0.5).add(V(x * 0.03 * H, 0.0, -0.015 * H)), V(0.04 * H, 0.08 * H, 0.045 * H), { k: 0.01 * H, round: 0.012 * H, q: quatAlong(h.clone().sub(f)) });
    s.ball(`hand${side}`, lerpV(h, s.j(`hand${side}Tip`), 0.45), V(0.075 * H, 0.08 * H, 0.07 * H), { k: 0.02 * H });
  });
}

// ---------------------------------------------------------------------------
// The lash temptress: an upright flyer with arms
// ---------------------------------------------------------------------------

function succubusLook(c: LookCtx): CreatureLook {
  const glow = c.visual.glow ?? 0xff40a0;
  return {
    key: `id:${c.id}`,
    tier: 'normal',
    rig: () => flyerRig({ body: 0.95, hover: 1.05, span: 2.5, upright: true, arms: true, tail: 5, tailLen: 1.1, neck: 0.14 }),
    sculpt: (s) => {
      const ch = s.j('chest');
      const bd = s.j('body');
      // A lithe torso in a bodice of black iron.
      s.ball('chest', ch.clone().add(V(0, 0.02, 0)), V(0.135, 0.15, 0.095), { k: 0.04 });
      s.limb('chest', ch.clone().add(V(0, -0.04, 0)), bd.clone().add(V(0, 0.05, 0)), 0.078, 0.07, { k: 0.04 });
      s.ball('body', bd, V(0.13, 0.11, 0.1), { k: 0.05 });
      s.ball('chest', ch.clone().add(V(0, -0.03, 0.005)), V(0.125, 0.12, 0.1), { mat: 'metal', k: 0.01 });
      s.box('chest', ch.clone().add(V(0, -0.02, 0.085)), V(0.008, 0.09, 0.01), { mat: 'metal', k: 0.008 });
      s.pair((_side, x) => s.ball('chest', ch.clone().add(V(x * 0.14, 0.09, -0.01)), V(0.05, 0.035, 0.05), { mat: 'metal', k: 0.008 }));
      skirtOnFlyer(s);
      // Neck, head, swept horns, hair streaming back.
      s.limb('neck', s.j('neck'), s.j('head'), 0.035, 0.03, { k: 0.02 });
      const h = s.j('head');
      s.ball('head', h.clone().add(V(0, 0.035, 0)), V(0.06, 0.078, 0.07), { k: 0.02 });
      s.limb('jaw', s.j('jaw'), s.j('jaw').add(V(0, -0.015, 0.03)), 0.03, 0.02, { k: 0.015 });
      s.pair((_side, x) => {
        s.eye('head', h.clone().add(V(x * 0.026, 0.035, 0.064)), 0.01, 1.6);
        const b = h.clone().add(V(x * 0.035, 0.09, 0.02));
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const a = t * Math.PI * 1.1;
          pts.push(b.clone().add(V(x * (0.01 + t * 0.06), Math.sin(a) * 0.1 - t * 0.02, (Math.cos(a) - 1) * 0.1)));
        }
        s.hard('head', tubeGeo(pts, (t) => 0.018 * (1 - 0.85 * t), 6, true), 'skin', HORN);
      });
      for (let i = 0; i < 12; i++) {
        const a = (i / 11) * Math.PI * 1.4 - 0.7;
        const b = h.clone().add(V(Math.sin(a) * 0.06, 0.09 - Math.abs(a) * 0.02, -0.02 + Math.cos(a) * 0.01));
        s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.08, -0.3, -0.12)), 0.026, 3, V(0, 0, -0.05), 3), 'alt', [0.18, 0.08, 0.1]);
      }
      // Arms with long nails.
      s.pair((side) => {
        s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.04, 0.032, { k: 0.02 });
        s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.031, 0.023, { k: 0.015 });
        s.ball(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.35), V(0.02, 0.032, 0.012), { k: 0.008 });
        claws(s, `hand${side}`, `hand${side}Tip`, 4, 0.05, 0.004, 'skin', HORN, 0.4);
        // Iron bracers.
        s.limb(`fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.35), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.9), 0.035, 0.029, { mat: 'metal', k: 0.004 });
        // Legs ending in hooves, hanging.
        s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.075, 0.052, { k: 0.03 });
        s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.045, 0.028, { k: 0.015 });
        s.limb(`foot${side}`, s.j(`foot${side}`), s.j(`toe${side}`), 0.024, 0.03, { mat: 'metal', k: 0.006 });
      });
      demonWings(s, { mat: 'alt', trail: V(0, -0.45, -1), thick: 0.9 });
      demonTail(s, 0.026, 'spade');
      // The lash: a coiled whip hanging from the right hand, its tip burning.
      const ht = s.j('handRTip');
      const w: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        w.push(ht.clone().add(V(0.05 * Math.sin(t * 5), -0.85 * t, 0.12 * Math.sin(t * 3.2) - 0.1 * t)));
      }
      s.hard('handR', tubeGeo(w, (t) => 0.013 - 0.009 * t, 5, true), 'alt', [0.25, 0.08, 0.12]);
      s.boil('handR', w[14]!.clone(), 0.018, 1, [1, 0.5, 0.8]);
      s.paint.skin = { grime: 0.25, ao: 0.85, mottle: { scale: 5, amount: 0.25, col: [0.7, 0.45, 0.45] }, top: { amount: 0.15, col: [1.1, 1.0, 1.0] } };
      s.paint.alt = { grime: 0.3, ao: 0.8, tips: { amount: 0.45, col: [0.35, 0.15, 0.2] } };
    },
    mats: {
      skin: { surface: 'flesh', tint: 0xa8524e, glow },
      alt: { surface: 'hide', tint: 0x4a161e, glow },
      metal: { surface: 'iron', tint: 0x5a4a52, glow },
    },
    style: { heavy: 0.06, attacks: ['lash', 'claw'], castBoth: true, spawn: 'swoop', death: 'crash', idle: 'hover', gait: 'glide' },
  };
}

/** A short split skirt of hide panels hung from the flyer's hips. */
function skirtOnFlyer(s: Sculpt): void {
  const bd = s.j('body');
  s.pair((side, x) => {
    for (const ang of [0.4, 1.5, 2.6]) {
      const a = bd.clone().add(V(x * Math.sin(ang) * 0.11, -0.04, Math.cos(ang) * 0.09));
      const b = bd.clone().add(V(x * Math.sin(ang) * 0.16, -0.3, Math.cos(ang) * 0.14));
      s.box(`leg${side}`, lerpV(a, b, 0.5), V(0.06, a.distanceTo(b) * 0.5, 0.008), { mat: 'alt', k: 0.02, round: 0.006, q: quatAlong(b.clone().sub(a)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), x * ang)) });
    }
  });
}

// ---------------------------------------------------------------------------

const DEMON: Record<string, LookFactory> = {
  imp_scamperer: (c) =>
    fiendLook(c, {
      height: 1.0,
      size: 1.3,
      tier: 'small',
      hip: 0.44,
      hunch: 0.55,
      head: 1.4,
      arms: 1.2,
      thick: 0.8,
      digitigrade: true,
      tail: 5,
      tailLen: 0.75,
      tailTip: 'spade',
      wings: 1.3,
      skin: 0xb03a1a,
      skinSurface: 'hide',
      alt: { surface: 'hide', tint: 0x4a1a10 },
      horns: 'swept',
      hornLen: 0.8,
      face: { size: 1.4, snout: 0.35, brow: 1.5, jaw: 1.0, ears: 1.6, eyes: 1.8 },
      claws: 0.04,
      toes: 0.03,
      cracks: 0.35,
      style: { heavy: 0.02, attacks: ['claw', 'bite', 'lunge'], armed: 'none', idle: 'jitter', gait: 'stalk', stride: 1.7, spawn: 'drop', death: 'collapse' },
    }),
  fleshripper: (c) =>
    fiendLook(c, {
      height: 1.9,
      hip: 0.48,
      hunch: 0.45,
      arms: 1.3,
      thick: 1.05,
      digitigrade: true,
      tail: 6,
      tailLen: 0.6,
      tailTip: 'barb',
      skin: 0x8e2f2a,
      skinSurface: 'flesh',
      face: { size: 1.05, snout: 0.7, brow: 1.9, jaw: 1.25, ears: 0, eyes: 1.4 },
      claws: 0.05,
      toes: 0.035,
      spines: 8,
      hornCol: BONE,
      extra: forearmBlades,
      paintSkin: { grime: 0.45, ao: 0.95, mottle: { scale: 9, amount: 0.45, col: [0.45, 0.2, 0.18] }, veins: { scale: 11, cut: 0.91, glow: 0, col: [1.2, 0.75, 0.62] } },
      lumps: { amp: 0.006, scale: 16 },
      style: { heavy: 0.15, attacks: ['claw', 'claw', 'lunge'], armed: 'none', idle: 'twitch', gait: 'stalk', spawn: 'rise' },
    }),
  hellhound: (c) =>
    quadLook(c, {
      withers: 0.82,
      length: 1.0,
      width: 0.15,
      neck: 0.4,
      neckRise: 0.35,
      head: 0.5,
      tail: 4,
      tailLen: 0.6,
      girth: 0.19,
      chest: 0.25,
      legR: 0.058,
      gaunt: 0.45,
      narrow: 0.8,
      tint: 0x3a2622,
      surface: 'lava',
      alt: { surface: 'lava', tint: 0x2a1a16 },
      head2: (s) => {
        houndHead(s, { len: 0.5, w: 0.13, teeth: true, ears: 0.6, glow: 1.8, horns: 0.75 });
        // Fire in the throat.
        s.boil('jaw', s.j('jaw').add(V(0, 0.01, 0.06)), 0.03, 1, [1.2, 0.6, 0.2]);
      },
      extra: (s) => {
        hackles(s, 'spine', 'chest', 10, 0.08, 'alt');
        // A mane of flame down the neck.
        const n = s.j('neck');
        const h = s.j('head');
        for (let i = 0; i < 7; i++) {
          const p = lerpV(s.j('chest'), lerpV(n, h, 0.6), i / 6).add(V(0, 0.07, -0.02));
          const l = 0.1 + Math.sin((i / 6) * Math.PI) * 0.08;
          s.hard(i < 3 ? 'chest' : 'neck', spikeGeo(p, p.clone().add(V(0, l, -l * 0.8)), 0.022, 4, V(0, 0, -0.03), 3), 'skin', [1, 0.5, 0.18], 1);
        }
      },
      paint: { grime: 0.4, ao: 0.9, veins: { scale: 6, cut: 0.93, glow: 0.75, col: LAVA } },
      lumps: { amp: 0.006, scale: 14 },
      style: { heavy: 0.3, attacks: ['bite', 'lunge', 'claw'], idle: 'prowl', gait: 'lope', spawn: 'emerge' },
    }),
  infernal_archer: (c) =>
    fiendLook(c, {
      height: 1.85,
      hip: 0.5,
      hunch: 0.15,
      thick: 0.95,
      digitigrade: true,
      tail: 5,
      tailTip: 'barb',
      skin: 0xb03a1a,
      skinSurface: 'hide',
      alt: { surface: 'leather', tint: 0x3a2a20 },
      horns: 'swept',
      hornLen: 1.1,
      face: { size: 1, snout: 0.5, brow: 1.5, jaw: 1.0, ears: 0.9, eyes: 1.6 },
      claws: 0.03,
      toes: 0.03,
      cracks: 0.5,
      weapon: 'bow',
      weaponGlow: 0.8,
      steel: [0.25, 0.2, 0.18],
      extra: quiver,
      style: { heavy: 0.15, attacks: ['shoot'], ranged: true, armed: 'bow', idle: 'sway', gait: 'stalk' },
    }),
  pit_brute: (c) =>
    fiendLook(c, {
      height: 1.75,
      kind: 'giant',
      hip: 0.42,
      hunch: 0.55,
      head: 0.75,
      arms: 1.4,
      shoulders: 0.22,
      armOut: 0.4,
      thick: 1.5,
      tail: 4,
      tailLen: 0.4,
      tailTip: 'none',
      skin: 0x8e2f2a,
      skinSurface: 'hide',
      horns: 'bull',
      hornLen: 1.5,
      face: { size: 0.8, snout: 0.4, brow: 2.2, jaw: 1.2, ears: 0, eyes: 1.4 },
      claws: 0.05,
      toes: 0.03,
      spines: 6,
      hump: 0.09,
      extra: (s, H) => {
        shackles(s, 0.04);
        // A ring through the nose.
        s.hard('head', ringGeo(cranium(s, 0.8 * H).add(V(0, -0.03 * H, 0.075 * H)), 0.014 * H, 0.004 * H, V(1, 0, 0), 10), 'metal', IRON);
      },
      lumps: { amp: 0.01, scale: 9 },
      style: { heavy: 0.75, attacks: ['slam', 'gore', 'swing'], armed: 'none', idle: 'breathe', gait: 'lumber', death: 'crash' },
    }),
  succubus_lash: (c) => succubusLook(c),
  void_stalker: (c) =>
    fiendLook(c, {
      height: 2.0,
      hip: 0.52,
      hunch: 0.4,
      head: 0.95,
      arms: 1.35,
      thick: 0.84,
      digitigrade: true,
      tail: 7,
      tailLen: 0.8,
      tailTip: 'barb',
      skin: 0x2a1a3e,
      skinSurface: 'hide',
      alt: { surface: 'hide', tint: 0x1a1028 },
      face: { size: 0.95, snout: 1.1, brow: 0.6, jaw: 0.8, ears: 0, eyes: 0 },
      faceFn: undefined,
      claws: 0.07,
      toes: 0.03,
      cracks: 0.55,
      crackCol: VOID,
      weapon: 'sword',
      weaponSize: 1.15,
      weaponGlow: 1,
      steel: [0.3, 0.22, 0.4],
      extra: (s, H) => {
        const k = 0.95 * H;
        // Four eyes in two slanted pairs, a long crest swept back off the skull.
        eyesAt(s, k, [[0.022, 0.006], [-0.022, 0.006], [0.03, -0.012], [-0.03, -0.012]], 0.008, 1.8);
        const c0 = cranium(s, k);
        s.hard('head', spikeGeo(c0.clone().add(V(0, 0.03 * k, -0.02 * k)), c0.clone().add(V(0, 0.08 * k, -0.22 * k)), 0.03 * k, 5, V(0, 0.03 * k, 0), 3), 'skin', [0.15, 0.1, 0.2]);
        // Ragged spines of shadow off the shoulders.
        s.pair((side, x) => {
          const a = s.j(`arm${side}`);
          for (let i = 0; i < 3; i++) {
            const b = a.clone().add(V(x * 0.02 * H, 0.03 * H, (i - 1) * 0.03 * H - 0.02 * H));
            s.hard(`arm${side}`, spikeGeo(b, b.clone().add(V(x * 0.05 * H, (0.09 - i * 0.02) * H, -0.08 * H)), 0.014 * H, 4, undefined, 2), 'skin', [0.12, 0.08, 0.16]);
          }
        });
      },
      style: { heavy: 0.1, attacks: ['thrust', 'swing', 'claw'], armed: 'one', idle: 'sway', gait: 'stalk', spawn: 'form' },
    }),
  ember_fiend: (c) =>
    fiendLook(c, {
      height: 1.9,
      hip: 0.5,
      hunch: 0.2,
      thick: 1.0,
      wings: 1.1,
      skin: 0x3a2a26,
      skinSurface: 'basalt',
      alt: { surface: 'hide', tint: 0x3a1a10 },
      horns: 'crown',
      hornLen: 1,
      hornCol: [0.18, 0.14, 0.12],
      face: { size: 1, snout: 0.35, brow: 1.7, jaw: 1.1, ears: 0, eyes: 1.8 },
      claws: 0.035,
      toes: 0.025,
      cracks: 1.0,
      extra: (s, H) => {
        eyesAt(s, H, [[0, 0.03]], 0.009, 1.8);
        flames(s, 'head', cranium(s, H).add(V(0, 0.05 * H, -0.01 * H)), 6, 0.09 * H, 0.04 * H, 13);
        // Fire cupped in both hands.
        s.pair((side) => s.boil(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.7).add(V(0, 0.02 * H, 0.02 * H)), 0.03 * H, 1, [1.2, 0.6, 0.2]));
      },
      lumps: { amp: 0.008, scale: 8 },
      style: { heavy: 0.25, attacks: ['hurl'], ranged: true, castBoth: true, armed: 'none', idle: 'breathe', gait: 'march' },
    }),
  soulbinder: (c) =>
    fiendLook(c, {
      height: 2.0,
      hip: 0.5,
      hunch: 0.25,
      thick: 0.85,
      wings: 1.3,
      wingMat: 'skin',
      skin: 0x5a4a6e,
      skinSurface: 'hide',
      alt: { surface: 'cloth', tint: 0x1e1428 },
      horns: 'ram',
      hornLen: 1.1,
      hornCol: [0.5, 0.45, 0.4],
      face: { size: 1, snout: 0.55, brow: 1.3, jaw: 1.0, ears: 0.4, eyes: 0 },
      claws: 0.04,
      cracks: 0.35,
      crackCol: VOID,
      weapon: 'staff',
      weaponGlow: 1.5,
      steel: [0.3, 0.25, 0.35],
      extra: (s, H) => {
        // Six eyes, two rows of three.
        eyesAt(s, H, [[0.016, 0.004], [-0.016, 0.004], [0.034, 0.0], [-0.034, 0.0], [0.024, -0.016], [-0.024, -0.016]], 0.007, 1.8);
        skirt(s, { len: 0.95, flare: 0.09, top: 0.04, thick: 0.01 });
        s.ball('chest', s.j('neck').add(V(0, -0.03 * H, -0.01 * H)), V(0.15 * H, 0.045 * H, 0.1 * H), { mat: 'alt', k: 0.03 * H });
        // Chains hung from the waist, each ending in a small burning soul cage.
        s.pair((_side, x) => {
          const hp = s.j('hips').add(V(x * 0.08 * H, 0.02 * H, 0.04 * H));
          let p = hp.clone();
          for (let i = 0; i < 5; i++) {
            const q = p.clone().add(V(x * 0.004 * H, -0.035 * H, 0.004 * H));
            s.hard(`leg${x > 0 ? 'L' : 'R'}`, ringGeo(lerpV(p, q, 0.5), 0.012 * H, 0.004 * H, i % 2 ? V(1, 0, 0) : V(0, 0, 1), 8), 'metal', IRON);
            p = q;
          }
          s.boil(`leg${x > 0 ? 'L' : 'R'}`, p.clone().add(V(0, -0.02 * H, 0)), 0.018 * H, 1, [0.8, 0.5, 1.2]);
        });
      },
      style: { heavy: 0.15, attacks: ['thrust'], armed: 'staff', castBoth: true, idle: 'still', gait: 'march', spawn: 'form' },
    }),
  chaos_maw: (c) =>
    fiendLook(c, {
      height: 1.8,
      kind: 'giant',
      hip: 0.44,
      hunch: 0.5,
      head: 0.85,
      arms: 1.25,
      shoulders: 0.21,
      armOut: 0.4,
      thick: 1.55,
      tail: 5,
      tailLen: 0.5,
      tailTip: 'barb',
      skin: 0x4a2a6e,
      skinSurface: 'hide',
      face: { size: 0.85, snout: 0.3, brow: 1.6, jaw: 0.8, ears: 0, eyes: 0 },
      claws: 0.06,
      toes: 0.03,
      belly: 0.1,
      cracks: 0.25,
      crackCol: VOID,
      hornCol: [0.25, 0.18, 0.3],
      extra: (s, H) => {
        // A cluster of six eyes on the small head; the real mouth is the belly.
        eyesAt(s, 0.85 * H, [[0.016, 0.01], [-0.016, 0.01], [0.032, 0.0], [-0.032, 0.0], [0.012, -0.01], [-0.012, -0.01]], 0.009, 2);
        bellyMaw(s, H, [0.8, 0.3, 0.9]);
        backSpines(s, 7, 0.07, 0.11, [0.3, 0.2, 0.4], 0.5);
      },
      lumps: { amp: 0.01, scale: 8 },
      style: { heavy: 0.8, attacks: ['slam', 'stomp', 'bite'], armed: 'none', idle: 'breathe', gait: 'lumber', death: 'crash' },
    }),
  balor_lieutenant: (c) =>
    fiendLook(c, {
      height: 1.9,
      kind: 'giant',
      hip: 0.46,
      hunch: 0.28,
      head: 0.82,
      arms: 1.2,
      shoulders: 0.2,
      armOut: 0.36,
      thick: 1.45,
      digitigrade: true,
      tail: 6,
      tailLen: 0.6,
      tailTip: 'barb',
      wings: 1.6,
      skin: 0x4a2018,
      skinSurface: 'hide',
      alt: { surface: 'hide', tint: 0x2a1410 },
      horns: 'ram',
      hornLen: 1.4,
      face: { size: 0.82, snout: 0.6, brow: 2.0, jaw: 1.35, ears: 0, eyes: 2 },
      claws: 0.05,
      toes: 0.035,
      cracks: 0.85,
      weapon: 'sword',
      weaponSize: 1.45,
      weaponGlow: 1.2,
      steel: [0.22, 0.18, 0.16],
      extra: (s, H) => {
        horns(s, 'spire', 0.82 * H, 0.8, HORN);
        // A mane of flame across the shoulders and down the back of the neck.
        flames(s, 'chest', s.j('neck').add(V(0, 0.0, -0.05 * H)), 7, 0.12 * H, 0.12 * H, 29);
      },
      lumps: { amp: 0.008, scale: 10 },
      style: { heavy: 0.7, attacks: ['chop', 'swing', 'slam'], armed: 'one', idle: 'breathe', gait: 'march', spawn: 'drop', death: 'crash' },
    }),
  sin_eater: (c) =>
    fiendLook(c, {
      height: 1.95,
      hip: 0.5,
      hunch: 0.35,
      thick: 1.0,
      arms: 1.15,
      arms2: true,
      skin: 0x8a4a42,
      skinSurface: 'flesh',
      alt: { surface: 'leather', tint: 0x2e1a16 },
      face: { size: 1, snout: 0.4, brow: 1.2, jaw: 1.1, ears: 0, eyes: 0 },
      claws: 0.035,
      weapon: 'sword',
      weaponGlow: 0.6,
      steel: [0.4, 0.3, 0.3],
      extra: (s, H) => {
        // Five eyes: a great one above, two pairs below.
        eyesAt(s, H, [[0, 0.022], [0.022, 0.004], [-0.022, 0.004], [0.034, -0.012], [-0.034, -0.012]], 0.008, 1.8);
        stitches(s, H);
        hooks(s, H);
        skirt(s, { len: 0.45, flare: 0.05, top: 0.03, thick: 0.01 });
      },
      paintSkin: { grime: 0.5, ao: 0.95, mottle: { scale: 7, amount: 0.4, col: [0.5, 0.25, 0.22] }, veins: { scale: 9, cut: 0.93, glow: 0.25, col: [1.2, 0.4, 0.5] } },
      lumps: { amp: 0.005, scale: 14 },
      style: { heavy: 0.3, attacks: ['swing', 'chop', 'thrust'], armed: 'one', idle: 'twitch', gait: 'march' },
    }),
  brimstone_hulk: (c) =>
    fiendLook(c, {
      height: 1.75,
      kind: 'giant',
      hip: 0.42,
      hunch: 0.45,
      head: 0.6,
      arms: 1.35,
      shoulders: 0.23,
      armOut: 0.42,
      thick: 1.7,
      skin: 0x2e2622,
      skinSurface: 'basalt',
      alt: { surface: 'lava', tint: 0x6a3018 },
      face: { size: 0.6, snout: 0.2, brow: 2.4, jaw: 1.2, ears: 0, eyes: 0 },
      cracks: 1.2,
      extra: (s, H) => {
        eyesAt(s, 0.6 * H, [[0.018, 0.0], [-0.018, 0.0], [0.03, -0.014], [-0.03, -0.014]], 0.01, 2);
        furnace(s, H);
      },
      lumps: { amp: 0.014, scale: 6 },
      style: { heavy: 0.9, attacks: ['slam', 'stomp', 'swing'], armed: 'none', idle: 'breathe', gait: 'lumber', death: 'crash' },
    }),
};

export { DEMON, demonWings, demonTail, horns, eyesAt, backSpines, fiendLook };
export type { FiendOpt, HornKind };
