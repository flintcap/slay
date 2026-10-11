/**
 * SLAY — aberrations: whisper wisps, the watcher eye and the gazer tyrant,
 * the thought eater, the tentacle horror and the flesh amalgam, the null
 * walker, the dimensional lurker, the star spawn, mirror images and the
 * Unmaker.
 *
 * Things that should not be: too many eyes, mouths where faces go, faces
 * where hands go, holes in the world. Wet flesh in bruise colours, void
 * purple glowing from inside.
 */
import * as THREE from 'three';
import { floaterRig, flyerRig, oozeRig, swarmRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, PaintSpec, RGB, Sculpt } from './Sculpt';
import { ballGeo, membraneGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, claws, lerpV, seq, skirt } from './Kit';
import { demonTail, fiendLook } from './LookDemon';
import { crystals } from './LookElemental';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const VOID: RGB = [0.85, 0.35, 1.3];
const TOOTH: RGB = [0.85, 0.8, 0.65];
const BRUISE: RGB = [0.5, 0.3, 0.45];
const IRIS: RGB = [1.3, 0.4, 0.9];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** A tentacle: a tapering curve of `n` points from a, along dir, curling by `curl`. */
function tentacle(s: Sculpt, bone: string, a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, curl: THREE.Vector3, mat: CMat = 'skin', col?: RGB, glow?: number): void {
  const d = dir.clone().normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(a.clone().addScaledVector(d, len * t).addScaledVector(curl, t * t));
  }
  s.hard(bone, tubeGeo(pts, (t) => r * (1 - 0.85 * t), 6, true), mat, col, glow);
}

/** An eyeball: a wet white ball, a coloured iris that glows, a black pupil, facing `n`. */
function eyeball(s: Sculpt, bone: string, c: THREE.Vector3, r: number, n: THREE.Vector3, iris: RGB = IRIS, lid = true): void {
  const d = n.clone().normalize();
  s.hard(bone, ballGeo(c, r, 2), 'alt', [1.1, 1.05, 0.95]);
  s.hard(bone, ballGeo(c.clone().addScaledVector(d, r * 0.72), r * 0.45, 1), 'skin', iris, 0.9);
  s.hard(bone, ballGeo(c.clone().addScaledVector(d, r * 0.95), r * 0.22, 1), 'skin', [0.02, 0.01, 0.02]);
  if (lid) s.hard(bone, ringGeo(c.clone().addScaledVector(d, r * 0.45), r * 0.92, r * 0.16, d, 14), 'skin');
}

/** A round mouth ringed with teeth, facing `n`. */
function maw(s: Sculpt, bone: string, c: THREE.Vector3, r: number, n: THREE.Vector3, teeth: number, glow = 0.6): void {
  const d = n.clone().normalize();
  const u = (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize();
  const v = d.clone().cross(u).normalize();
  s.ball(bone, c, r, { sub: true, k: r * 0.3 });
  // A dark throat with a glint deep inside, not a lit disc.
  s.tint(c, r * 1.05, [0.18, 0.06, 0.08]);
  if (glow > 0) s.glow(c.clone().addScaledVector(d, -r * 0.9), r * 0.35, glow, [0.5, 0.1, 0.2]);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const p = c.clone().addScaledVector(u, Math.cos(a) * r * 0.95).addScaledVector(v, Math.sin(a) * r * 0.95).addScaledVector(d, r * 0.1);
    const tip = c.clone().addScaledVector(u, Math.cos(a) * r * 0.4).addScaledVector(v, Math.sin(a) * r * 0.4).addScaledVector(d, -r * 0.2);
    s.hard(bone, spikeGeo(p, tip, r * 0.12, 4, undefined, 1), 'skin', TOOTH);
  }
}

/** The head of a mind eater: a swollen, ridged cranium and a beard of face tentacles. */
function squidHead(s: Sculpt, H: number, k = 1, eyes = 2, tent = 4): void {
  const h = s.j('head').add(V(0, 0.045 * H * k, 0.0));
  s.ball('head', h.clone().add(V(0, 0.02 * H * k, -0.02 * H * k)), V(0.058 * H * k, 0.07 * H * k, 0.075 * H * k), { k: 0.015 * H });
  // Brain-like ridges.
  for (let i = 0; i < 3; i++) s.limb('head', h.clone().add(V((i - 1) * 0.025 * H * k, 0.085 * H * k, 0.02 * H * k)), h.clone().add(V((i - 1) * 0.03 * H * k, 0.05 * H * k, -0.085 * H * k)), 0.012 * H * k, 0.01 * H * k, { k: 0.008 * H });
  s.ball('head', h.clone().add(V(0, -0.025 * H * k, 0.035 * H * k)), V(0.042 * H * k, 0.035 * H * k, 0.035 * H * k), { k: 0.015 * H });
  const ew = eyes === 2 ? [-1, 1] : [-1, -0.33, 0.33, 1];
  for (const e of ew) s.eye('head', h.clone().add(V(e * 0.03 * H * k, 0.0, 0.06 * H * k)), 0.009 * H * k, 1.6);
  // Tentacles hanging from where the mouth should be.
  for (let i = 0; i < tent; i++) {
    const x = (i / Math.max(1, tent - 1) - 0.5) * 0.06 * H * k;
    const a = h.clone().add(V(x, -0.04 * H * k, 0.055 * H * k));
    tentacle(s, 'jaw', a, V(x * 3, -1, 0.15), (0.16 + (i % 2) * 0.05) * H * k, 0.011 * H * k, V(x * 0.8, 0.02 * H * k, 0.05 * H * k));
  }
}

// ---------------------------------------------------------------------------
// Blobs and floaters
// ---------------------------------------------------------------------------

interface BlobOpt {
  height: number;
  radius: number;
  lobes?: number;
  sculpt: (s: Sculpt, H: number, R: number) => void;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  paint?: Partial<Record<CMat, PaintSpec>>;
  style: Partial<MotionStyle>;
  size?: number;
  tier?: CreatureLook['tier'];
}

function blobLook(c: LookCtx, o: BlobOpt): CreatureLook {
  const glow = c.visual.glow ?? 0xff40a0;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? 'normal',
    rig: () => oozeRig({ height: o.height, radius: o.radius, lobes: o.lobes ?? 6, pods: true }),
    sculpt: (s) => {
      s.k = 0.03;
      s.soft.skin = 0.06;
      o.sculpt(s, o.height, o.radius);
      s.paint.skin = o.paint?.skin ?? { grime: 0.4, ao: 0.9, mottle: { scale: 5, amount: 0.45, col: BRUISE } };
      s.paint.alt = o.paint?.alt ?? { grime: 0.1, ao: 0.6 };
      s.paint.metal = o.paint?.metal ?? { grime: 0.3, ao: 0.7 };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow },
      alt: { surface: o.alt?.surface ?? 'slime', tint: o.alt?.tint ?? 0xe8e0d0, glow },
      metal: { surface: o.metal?.surface ?? 'bone', tint: o.metal?.tint ?? 0xc8bca0, glow },
    },
    style: { heavy: 0.6, attacks: ['engulf', 'lash', 'thrust'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll', armed: 'none', ...o.style },
  };
}

interface EyeOpt {
  hover: number;
  radius: number;
  orbs?: number;
  tendrils?: number;
  sculpt: (s: Sculpt, R: number) => void;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  paint?: Partial<Record<CMat, PaintSpec>>;
  glowIntensity?: number;
  style: Partial<MotionStyle>;
  size?: number;
  tier?: CreatureLook['tier'];
}

function eyeLook(c: LookCtx, o: EyeOpt): CreatureLook {
  const glow = c.visual.glow ?? 0xff60c0;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? 'normal',
    rig: () => floaterRig({ hover: o.hover, radius: o.radius, orbs: o.orbs ?? 0, tendrils: o.tendrils ?? 0, segments: 3 }),
    sculpt: (s) => {
      s.k = 0.015;
      s.soft.skin = 0.03;
      o.sculpt(s, o.radius);
      s.paint.skin = o.paint?.skin ?? { grime: 0.3, ao: 0.85, mottle: { scale: 6, amount: 0.45, col: BRUISE }, veins: { scale: 11, cut: 0.955, glow: 0.25, col: [0.8, 0.2, 0.4] } };
      s.paint.alt = o.paint?.alt ?? { grime: 0.05, ao: 0.5, veins: { scale: 14, cut: 0.93, glow: 0, col: [0.8, 0.2, 0.2] } };
      s.paint.metal = o.paint?.metal ?? { grime: 0.3, ao: 0.7 };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow, glowIntensity: o.glowIntensity },
      alt: { surface: o.alt?.surface ?? 'slime', tint: o.alt?.tint ?? 0xe8e0d4, glow, glowIntensity: o.glowIntensity },
      metal: { surface: o.metal?.surface ?? 'bone', tint: o.metal?.tint ?? 0xc8bca0, glow },
    },
    style: { heavy: 0.2, attacks: ['lash'], ranged: true, castBoth: true, spawn: 'form', death: 'collapse', idle: 'hover', gait: 'glide', armed: 'none', ...o.style },
  };
}

/** Hanging tendrils for a floater: tapering, wet. */
function hangers(s: Sculpt, n: number, r: number, mat: CMat = 'skin'): void {
  for (let i = 0; i < n; i++) {
    let prev = 'core';
    for (let k = 1; k <= 3; k++) {
      const b = `ten${i}_${k}`;
      if (!s.has(b)) return;
      s.limb(b, s.j(prev), s.j(b), r * (1.15 - 0.22 * k), r * (1 - 0.22 * k), { mat, k: r * 0.4 });
      prev = b;
    }
    s.limb(prev, s.j(prev), s.j(`ten${i}Tip`), r * 0.34, r * 0.12, { mat, k: r * 0.2 });
  }
}

// ---------------------------------------------------------------------------

const ABERRATION: Record<string, LookFactory> = {
  whisper_wisp: (c) => {
    const glow = c.visual.glow ?? 0xc060ff;
    const N = 14;
    return {
      key: `id:${c.id}`,
      tier: 'small',
      size: 1.5,
      rig: () => swarmRig({ hover: 1.0, radius: 0.45, motes: N }),
      sculpt: (s) => {
        // A cloud of small whispering mouths and eyes round a faint, dark heart.
        const c0 = s.j('core');
        s.ball('core', c0, 0.09, { k: 0.02, mat: 'alt' });
        s.boil('core', c0, 0.05, 0.9, VOID);
        for (let i = 0; i < N; i++) {
          const p = s.j(`mote${i}`);
          const b = `mote${i}`;
          if (i % 2 === 0) {
            // An eye: a pale ball, a burning purple iris.
            s.hard(b, ballGeo(p, 0.035, 1), 'skin', [0.85, 0.8, 0.85]);
            s.hard(b, ballGeo(p.clone().add(V(0, 0, 0.026)), 0.016, 1), 'skin', IRIS, 1);
          } else {
            // A mouth: lips round a glowing hollow, two teeth.
            s.hard(b, ringGeo(p, 0.03, 0.012, V(0, 0, 1), 10), 'skin', [0.45, 0.2, 0.35]);
            s.hard(b, ballGeo(p.clone().add(V(0, 0, -0.008)), 0.022, 1), 'skin', VOID, 0.9);
            s.hard(b, spikeGeo(p.clone().add(V(0.01, 0.026, 0.004)), p.clone().add(V(0.008, 0.008, 0.006)), 0.006, 3, undefined, 1), 'skin', TOOTH);
            s.hard(b, spikeGeo(p.clone().add(V(-0.01, -0.026, 0.004)), p.clone().add(V(-0.008, -0.008, 0.006)), 0.006, 3, undefined, 1), 'skin', TOOTH);
          }
          // A wisp of shadow trailing each.
          s.hard(b, spikeGeo(p.clone().add(V(0, 0, -0.02)), p.clone().add(V(0, -0.02, -0.14)), 0.03, 4, undefined, 2), 'alt');
        }
        s.paint.skin = { grime: 0, ao: 0.5 };
        s.paint.alt = { grime: 0, ao: 0.5, tips: { amount: 0.7, col: [0.1, 0.05, 0.12] } };
      },
      mats: {
        skin: { surface: 'flesh', tint: 0xb090b0, glow, glowIntensity: 2.6 },
        alt: { surface: 'shade', tint: 0x3a2a4e, glow, glowIntensity: 2.6 },
      },
      style: { heavy: 0, attacks: ['lunge'], spawn: 'form', death: 'scatter', idle: 'hover', gait: 'glide', armed: 'none' },
    };
  },
  watcher_eye: (c) =>
    eyeLook(c, {
      hover: 1.35,
      radius: 0.26,
      tendrils: 5,
      size: 1.1,
      skin: { surface: 'flesh', tint: 0x7a4a5e },
      sculpt: (s, R) => {
        // One huge bloodshot eye in a sac of bruised flesh, nerves trailing.
        const c0 = s.j('core');
        s.ball('core', c0.clone().add(V(0, 0, -R * 0.15)), V(R * 0.95, R * 0.92, R * 0.95), { k: R * 0.1 });
        eyeball(s, 'eye', c0.clone().add(V(0, 0, R * 0.25)), R * 0.72, V(0, 0, 1), IRIS);
        // Heavy lids, top and bottom.
        s.ball('core', c0.clone().add(V(0, R * 0.62, R * 0.25)), V(R * 0.8, R * 0.25, R * 0.6), { k: R * 0.12 });
        s.ball('core', c0.clone().add(V(0, -R * 0.6, R * 0.25)), V(R * 0.75, R * 0.22, R * 0.55), { k: R * 0.12 });
        // Little eyes budding on the back.
        const r = seq(201);
        for (let i = 0; i < 4; i++) {
          const d = V((r() - 0.5) * 1.6, (r() - 0.3) * 1.2, -1).normalize();
          eyeball(s, 'core', c0.clone().addScaledVector(d, R * 0.85), R * 0.12, d, IRIS, false);
        }
        hangers(s, 5, R * 0.16);
      },
      style: { attacks: ['lash'], ranged: true, idle: 'hover' },
    }),
  gazer_tyrant: (c) =>
    eyeLook(c, {
      hover: 1.5,
      radius: 0.42,
      tendrils: 6,
      tier: 'big',
      skin: { surface: 'hide', tint: 0x6a3a58 },
      sculpt: (s, R) => {
        // A great orb of hide, one central eye over a fanged mouth, eye stalks writhing on top.
        const c0 = s.j('core');
        s.ball('core', c0, R, { k: R * 0.1 });
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          s.ball('core', c0.clone().add(V(Math.sin(a) * R * 0.75, R * 0.35 + Math.cos(a * 3) * R * 0.1, Math.cos(a) * R * 0.75)), R * 0.2, { k: R * 0.12 });
        }
        s.ball('core', c0.clone().add(V(0, R * 0.22, R * 0.9)), R * 0.42, { sub: true, k: R * 0.08 });
        eyeball(s, 'eye', c0.clone().add(V(0, R * 0.22, R * 0.72)), R * 0.4, V(0, 0.1, 1), IRIS);
        s.ball('core', c0.clone().add(V(0, R * 0.62, R * 0.6)), V(R * 0.55, R * 0.12, R * 0.3), { k: R * 0.1 });
        maw(s, 'core', c0.clone().add(V(0, -R * 0.4, R * 0.82)), R * 0.3, V(0, -0.25, 1), 12, 0.25);
        // Eye stalks.
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.3;
          const base = c0.clone().add(V(Math.sin(a) * R * 0.55, R * 0.8, Math.cos(a) * R * 0.45 - R * 0.1));
          const dir = V(Math.sin(a) * 0.6, 1, Math.cos(a) * 0.4 - 0.2);
          const len = R * (0.75 + (i % 3) * 0.15);
          const curl = V(Math.sin(a) * R * 0.2, -R * 0.05, R * 0.25);
          tentacle(s, 'core', base, dir, len, R * 0.07, curl);
          const tip = base.clone().addScaledVector(dir.clone().normalize(), len).add(curl);
          eyeball(s, 'core', tip, R * 0.1, V(Math.sin(a) * 0.5, 0.3, 1), IRIS, false);
        }
        hangers(s, 6, R * 0.13);
      },
      paint: { skin: { grime: 0.35, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.45, 0.25, 0.4] }, bands: { axis: 'y', period: 0.09, amount: 0.15 } } },
      style: { heavy: 0.4, attacks: ['lash', 'hurl'], ranged: true, castBoth: true, idle: 'hover' },
    }),
  thought_eater: (c) =>
    fiendLook(c, {
      height: 1.9,
      hip: 0.5,
      hunch: 0.1,
      thick: 0.8,
      arms: 1.1,
      skin: 0x7a6a8a,
      skinSurface: 'flesh',
      alt: { surface: 'cloth', tint: 0x2a1a3a },
      metal: { surface: 'gold', tint: 0x9a7a4a },
      faceFn: (s, H) => squidHead(s, H, 1, 2, 4),
      claws: 0.025,
      weapon: 'staff',
      weaponGlow: 1,
      steel: [0.5, 0.35, 0.55],
      extra: (s, H) => {
        // A high-collared robe to the floor, gold at the hem.
        skirt(s, { len: 0.92, flare: 0.08, top: 0.04, thick: 0.012 });
        s.ball('chest', s.j('chest').add(V(0, 0.02 * H, -0.005 * H)), V(0.105 * H, 0.09 * H, 0.08 * H), { mat: 'alt', k: 0.01 * H });
        for (let i = 0; i < 7; i++) {
          const a = (i / 6 - 0.5) * 2.6;
          const p = s.j('neck').add(V(Math.sin(a) * 0.065 * H, -0.02 * H, Math.cos(a) * 0.05 * H - 0.03 * H));
          s.hard('chest', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.04 * H, 0.12 * H, -0.03 * H)), 0.014 * H, 4, undefined, 2), 'alt');
        }
        // A brooch of a purple stone.
        s.boil('chest', s.j('chest').add(V(0, 0.05 * H, 0.085 * H)), 0.014 * H, 1, VOID);
      },
      paintSkin: { grime: 0.3, ao: 0.85, mottle: { scale: 6, amount: 0.4, col: [0.55, 0.45, 0.65] }, top: { amount: 0.15, col: [1.15, 1.1, 1.2] } },
      style: { heavy: 0.2, attacks: ['hurl', 'lash'], ranged: true, castBoth: true, armed: 'staff', idle: 'sway', gait: 'walk', spawn: 'form', death: 'collapse' },
    }),
  tentacle_horror: (c) =>
    blobLook(c, {
      height: 1.05,
      radius: 0.55,
      lobes: 7,
      tier: 'big',
      skin: { surface: 'flesh', tint: 0x8a3a3e },
      alt: { surface: 'slime', tint: 0xe8d8c0 },
      sculpt: (s, H, R) => {
        // A heaving mound, a beak in a ring of eyes, tentacles everywhere.
        const b = s.j('body');
        const t = s.j('top');
        s.ball('body', b.clone().add(V(0, 0, -R * 0.05)), V(R * 0.95, H * 0.36, R * 0.9));
        s.ball('top', t, V(R * 0.6, H * 0.28, R * 0.55), { k: R * 0.15 });
        for (let i = 0; i < 7; i++) s.ball(`lobe${i}`, s.j(`lobe${i}`), R * 0.3, { k: R * 0.15 });
        maw(s, 'top', t.clone().add(V(0, -H * 0.05, R * 0.5)), R * 0.22, V(0, 0, 1), 10, 0.25);
        // A parrot beak in the mouth.
        s.pair((_side, x) => s.hard('top', spikeGeo(t.clone().add(V(0, x * R * 0.07, R * 0.45)), t.clone().add(V(0, -x * R * 0.02, R * 0.72)), R * 0.09, 5, V(0, -x * R * 0.05, 0), 2), 'skin', [0.15, 0.12, 0.1]));
        const r = seq(211);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7 - 0.5) * 2.4;
          eyeball(s, 'top', t.clone().add(V(Math.sin(a) * R * 0.48, H * 0.12 + Math.cos(a * 2) * H * 0.03, Math.cos(a) * R * 0.38)), R * (0.06 + r() * 0.04), V(Math.sin(a), 0.3, Math.cos(a)), IRIS, false);
        }
        // Tentacles: the two pods as great arms, more off the lobes, a few up off the back.
        s.pair((side) => {
          s.limb(`pod${side}`, s.j(`pod${side}`), s.j(`pod${side}2`), R * 0.17, R * 0.13, { k: R * 0.12 });
          s.limb(`pod${side}2`, s.j(`pod${side}2`), s.j(`pod${side}Tip`), R * 0.13, R * 0.03, { k: R * 0.08 });
          for (let k = 0; k < 5; k++) s.hard(`pod${side}2`, ballGeo(lerpV(s.j(`pod${side}2`), s.j(`pod${side}Tip`), 0.1 + k * 0.18).add(V(0, -R * 0.1 * (1 - k * 0.15), 0)), R * 0.03 * (1 - k * 0.12), 0), 'alt', [0.95, 0.75, 0.7]);
        });
        for (let i = 0; i < 7; i++) {
          const l = s.j(`lobe${i}`);
          const d = V(l.x, 0.05, l.z).normalize();
          tentacle(s, `lobe${i}`, l.clone().addScaledVector(d, R * 0.15), d, R * (0.9 + r() * 0.5), R * 0.09, V(-d.z * R * 0.3, -H * 0.12, d.x * R * 0.3));
        }
        for (let i = 0; i < 4; i++) {
          const a = (i / 3 - 0.5) * 2.0;
          const p = t.clone().add(V(Math.sin(a) * R * 0.35, H * 0.1, -R * 0.35));
          tentacle(s, 'top', p, V(Math.sin(a) * 0.5, 1, -0.6), R * (0.9 + r() * 0.4), R * 0.08, V(Math.sin(a) * R * 0.3, -R * 0.1, R * 0.4));
        }
      },
      paint: { skin: { grime: 0.45, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.5, 0.2, 0.3] }, tips: { amount: 0.5, col: [0.9, 0.55, 0.55] } }, alt: { grime: 0.05, ao: 0.5 } },
      style: { heavy: 0.75, attacks: ['lash', 'engulf', 'swing'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  null_walker: (c) =>
    fiendLook(c, {
      height: 2.0,
      hip: 0.53,
      hunch: 0.2,
      thick: 0.72,
      arms: 1.25,
      skin: 0x24202a,
      skinSurface: 'shade',
      alt: { surface: 'shade', tint: 0x140f1a },
      faceFn: (s, H) => {
        // No face: a hole into nothing, rimmed with violet light.
        const h = s.j('head').add(V(0, 0.045 * H, 0.0));
        s.ball('head', h, V(0.048 * H, 0.068 * H, 0.055 * H), { k: 0.012 * H });
        s.ball('head', h.clone().add(V(0, 0, 0.05 * H)), V(0.03 * H, 0.045 * H, 0.03 * H), { sub: true, k: 0.006 * H });
        s.hard('head', ringGeo(h.clone().add(V(0, 0, 0.045 * H)), 0.034 * H, 0.004 * H, V(0, 0, 1), 18), 'skin', VOID, 1);
        s.hard('head', ballGeo(h.clone().add(V(0, 0, 0.03 * H)), 0.026 * H, 1), 'skin', [0.01, 0.0, 0.02]);
      },
      claws: 0.07,
      weapon: 'dagger',
      weaponGlow: 0.8,
      steel: [0.25, 0.2, 0.3],
      extra: (s, H) => {
        // Shreds of void trailing off the shoulders and the back.
        const r = seq(221);
        for (let i = 0; i < 8; i++) {
          const p = s.j('chest').add(V((r() - 0.5) * 0.2 * H, (0.02 + r() * 0.06) * H, -0.06 * H));
          s.hard('chest', spikeGeo(p, p.clone().add(V((r() - 0.5) * 0.08 * H, -(0.15 + r() * 0.2) * H, -(0.1 + r() * 0.1) * H)), 0.03 * H, 4, undefined, 2), 'alt');
        }
        // Rifts: violet slits in the body.
        for (let i = 0; i < 3; i++) s.hard('chest', ringGeo(s.j('chest').add(V((i - 1) * 0.05 * H, -0.02 * H + i * 0.02 * H, 0.075 * H)), 0.012 * H, 0.003 * H, V(0, 0, 1), 10), 'skin', VOID, 1);
      },
      paintSkin: { grime: 0.2, ao: 0.8, veins: { scale: 8, cut: 0.95, glow: 0.5, col: VOID } },
      style: { heavy: 0.15, attacks: ['thrust', 'claw', 'lunge'], armed: 'one', idle: 'still', gait: 'stalk', spawn: 'form', death: 'fade' },
    }),
  flesh_amalgam: (c) =>
    blobLook(c, {
      height: 1.15,
      radius: 0.52,
      lobes: 6,
      tier: 'big',
      skin: { surface: 'flesh', tint: 0xc09080 },
      alt: { surface: 'leather', tint: 0x4a3028 },
      metal: { surface: 'iron', tint: 0x6a645e },
      sculpt: (s, H, R) => {
        // Bodies fused into one: a heap of flesh with arms and faces pushing out, stitched with wire.
        const b = s.j('body');
        const t = s.j('top');
        s.ball('body', b, V(R * 0.95, H * 0.34, R * 0.85));
        s.ball('top', t, V(R * 0.62, H * 0.3, R * 0.55), { k: R * 0.15 });
        for (let i = 0; i < 6; i++) s.ball(`lobe${i}`, s.j(`lobe${i}`), R * 0.3, { k: R * 0.15 });
        const r = seq(231);
        // Faces: heads half-sunk in the mass, mouths open.
        const faces: Array<[string, THREE.Vector3]> = [
          ['top', t.clone().add(V(0, H * 0.12, R * 0.45))],
          ['top', t.clone().add(V(R * 0.38, -H * 0.02, R * 0.38))],
          ['body', b.clone().add(V(-R * 0.45, H * 0.05, R * 0.6))],
          ['top', t.clone().add(V(-R * 0.3, H * 0.15, -R * 0.2))],
        ];
        for (const [bone, p] of faces) {
          const k = 0.8 + r() * 0.4;
          s.ball(bone, p, V(R * 0.2 * k, R * 0.24 * k, R * 0.2 * k), { k: R * 0.06 });
          // Brow, nose, a gaping mouth, sunken sockets with a dull glint.
          s.ball(bone, p.clone().add(V(0, R * 0.07 * k, R * 0.15 * k)), V(R * 0.14 * k, R * 0.035 * k, R * 0.05 * k), { k: R * 0.03 });
          s.ball(bone, p.clone().add(V(0, -R * 0.0, R * 0.19 * k)), V(R * 0.03 * k, R * 0.05 * k, R * 0.04 * k), { k: R * 0.02 });
          s.ball(bone, p.clone().add(V(0, -R * 0.1 * k, R * 0.17 * k)), V(R * 0.06 * k, R * 0.05 * k, R * 0.06 * k), { sub: true, k: R * 0.02 });
          s.pair((_side, x) => {
            s.ball(bone, p.clone().add(V(x * R * 0.07 * k, R * 0.035 * k, R * 0.17 * k)), R * 0.04 * k, { sub: true, k: R * 0.015 });
            s.eye(bone, p.clone().add(V(x * R * 0.07 * k, R * 0.035 * k, R * 0.14 * k)), R * 0.018 * k, 0.6);
          });
        }
        // Arms reaching out of the heap, clawing.
        const arms: Array<[string, THREE.Vector3, THREE.Vector3]> = [
          ['top', t.clone().add(V(R * 0.45, H * 0.1, 0)), V(1, 0.8, 0.3)],
          ['top', t.clone().add(V(-R * 0.4, H * 0.05, R * 0.1)), V(-1, 0.6, 0.4)],
          ['body', b.clone().add(V(R * 0.2, H * 0.2, -R * 0.6)), V(0.3, 1, -0.6)],
          ['body', b.clone().add(V(-R * 0.7, -H * 0.05, -R * 0.2)), V(-1, -0.2, -0.3)],
        ];
        for (const [bone, p, d] of arms) {
          const dn = d.clone().normalize();
          const e = p.clone().addScaledVector(dn, R * 0.45).add(V(0, -R * 0.08, 0));
          const w = e.clone().addScaledVector(V(dn.x, dn.y - 0.6, dn.z).normalize(), R * 0.4);
          s.limb(bone, p, e, R * 0.1, R * 0.085, { k: R * 0.06 });
          s.limb(bone, e, w, R * 0.08, R * 0.065, { k: R * 0.04 });
          s.ball(bone, w, V(R * 0.075, R * 0.055, R * 0.09), { k: R * 0.03 });
          for (let f = 0; f < 4; f++) s.hard(bone, spikeGeo(w, w.clone().add(V((f - 1.5) * R * 0.05, -R * 0.12, R * 0.06)), R * 0.022, 4, undefined, 2), 'skin', TOOTH);
        }
        // The pods are two big grasping arms.
        s.pair((side) => {
          s.limb(`pod${side}`, s.j(`pod${side}`), s.j(`pod${side}2`), R * 0.13, R * 0.1, { k: R * 0.08 });
          s.limb(`pod${side}2`, s.j(`pod${side}2`), s.j(`pod${side}Tip`), R * 0.1, R * 0.08, { k: R * 0.06 });
          claws(s, `pod${side}2`, `pod${side}Tip`, 4, 0.12, 0.012, 'skin', TOOTH, 0.6);
        });
        // Stitches and wire.
        for (let i = 0; i < 5; i++) {
          const a = r() * Math.PI * 2;
          const p = b.clone().add(V(Math.sin(a) * R * 0.85, (r() - 0.2) * H * 0.3, Math.cos(a) * R * 0.75));
          s.hard('body', tubeGeo([p, p.clone().add(V(Math.cos(a) * R * 0.25, H * 0.12, -Math.sin(a) * R * 0.25))], () => R * 0.012, 4), 'metal');
        }
      },
      paint: { skin: { grime: 0.5, ao: 0.9, mottle: { scale: 4, amount: 0.55, col: [0.6, 0.35, 0.35] }, tips: { amount: 0.3, col: [0.55, 0.4, 0.38] } } },
      style: { heavy: 0.7, attacks: ['engulf', 'swing', 'thrust'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  dimensional_lurker: (c) => {
    const glow = c.visual.glow ?? 0xd060ff;
    return {
      key: `id:${c.id}`,
      tier: 'normal',
      size: 1.2,
      rig: () => flyerRig({ body: 0.9, hover: 1.4, span: 2.6, tail: 6, tailLen: 1.4, neck: 0.15 }),
      sculpt: (s) => {
        // A ray of the void: a flat body, broad wings of dark membrane, a head of eyes, a barbed tail.
        const bd = s.j('body');
        const ch = s.j('chest');
        s.ball('body', bd, V(0.2, 0.1, 0.28), { k: 0.05 });
        s.ball('chest', ch, V(0.19, 0.1, 0.2), { k: 0.05 });
        s.limb('body', bd, s.j('tail1'), 0.12, 0.07, { k: 0.04 });
        const h = s.j('head');
        s.limb('neck', s.j('neck'), h, 0.06, 0.05, { k: 0.03 });
        s.ball('head', h.clone().add(V(0, 0, 0.03)), V(0.08, 0.055, 0.1), { k: 0.025 });
        const r = seq(241);
        for (let i = 0; i < 6; i++) {
          const a = (i / 5 - 0.5) * 2.2;
          eyeball(s, 'head', h.clone().add(V(Math.sin(a) * 0.065, 0.035 + (i % 2) * 0.012, 0.05 + Math.cos(a) * 0.05)), 0.016 + r() * 0.008, V(Math.sin(a) * 0.6, 0.3, 1), IRIS, false);
        }
        // Mandibles under the eyes.
        s.pair((_side, x) => s.hard('jaw', spikeGeo(s.j('jaw').add(V(x * 0.03, 0, 0.02)), s.j('jaw').add(V(x * 0.01, -0.03, 0.12)), 0.012, 4, V(-x * 0.02, 0, 0), 2), 'skin', [0.15, 0.1, 0.15]));
        // Wings: a membrane from the body to each spar, a hooked claw at the wrist.
        s.pair((side, x) => {
          const w1 = s.j(`wing${side}`);
          const w2 = s.j(`wing${side}2`);
          const w3 = s.j(`wing${side}3`);
          const tp = s.j(`wing${side}Tip`);
          s.limb(`wing${side}`, w1, w2, 0.035, 0.025, { k: 0.015 });
          s.limb(`wing${side}2`, w2, w3, 0.025, 0.018, { k: 0.01 });
          s.limb(`wing${side}3`, w3, tp, 0.018, 0.006, { k: 0.01 });
          s.hard(`wing${side}2`, membraneGeo(w2, [w1.clone().add(V(0, -0.02, -0.3)), w2.clone().add(V(x * 0.05, -0.03, -0.45)), w3.clone().add(V(0, -0.02, -0.25))], 0.008, 0.03), 'alt');
          s.hard(`wing${side}3`, membraneGeo(w3, [w2.clone().add(V(x * 0.05, -0.03, -0.45)), w3.clone().add(V(0, -0.02, -0.25)), tp.clone().add(V(-x * 0.05, -0.02, -0.12)), tp], 0.008, 0.02), 'alt');
          s.hard(`wing${side}`, membraneGeo(w1, [bd.clone().add(V(x * 0.1, 0, -0.25)), w1.clone().add(V(0, -0.02, -0.3)), w2], 0.008, 0.02), 'alt');
          s.hard(`wing${side}3`, spikeGeo(w3, w3.clone().add(V(x * 0.02, 0.06, 0.08)), 0.012, 4, V(0, 0, 0.03), 2), 'skin', [0.2, 0.15, 0.2]);
        });
        demonTail(s, 0.035, 'barb');
        // Void light pulsing through it.
        s.boil('chest', ch.clone().add(V(0, -0.06, 0.05)), 0.03, 1, VOID);
        s.paint.skin = { grime: 0.2, ao: 0.85, mottle: { scale: 6, amount: 0.4, col: [0.4, 0.25, 0.5] }, tips: { amount: 0.4, col: [0.7, 0.4, 0.9] } };
        s.paint.alt = { grime: 0, ao: 0.6, veins: { scale: 9, cut: 0.96, glow: 0.35, col: VOID }, tips: { amount: 0.5, col: [0.12, 0.06, 0.16] } };
        s.soft.alt = 0.06;
      },
      mats: {
        skin: { surface: 'hide', tint: 0x4a3a5e, glow, glowIntensity: 2.6 },
        alt: { surface: 'shade', tint: 0x2a1a3a, glow, glowIntensity: 2.6 },
        metal: { surface: 'bone', tint: 0xc0b0a0, glow },
      },
      style: { heavy: 0.15, attacks: ['bite', 'sting', 'lunge'], spawn: 'swoop', death: 'crash', idle: 'hover', gait: 'glide', armed: 'none' },
    };
  },
  star_spawn: (c) =>
    fiendLook(c, {
      height: 1.85,
      kind: 'giant',
      hip: 0.45,
      hunch: 0.35,
      thick: 1.3,
      arms: 1.2,
      wings: 1.2,
      arms2: true,
      skin: 0x3a5a4a,
      skinSurface: 'scale',
      alt: { surface: 'hide', tint: 0x2a2a3a },
      faceFn: (s, H) => squidHead(s, H, 1.15, 4, 6),
      claws: 0.05,
      toes: 0.03,
      extra: (s, H) => {
        // Star-pale eyes down the chest and a glowing sigil in the belly.
        for (let i = 0; i < 3; i++) s.eye('chest', s.j('chest').add(V((i - 1) * 0.05 * H, 0.03 * H - Math.abs(i - 1) * 0.02 * H, 0.1 * H)), 0.012 * H, 1.5);
        s.hard('spine', ringGeo(s.j('spine').add(V(0, 0, 0.1 * H)), 0.04 * H, 0.005 * H, V(0, 0.1, 1).normalize(), 18), 'skin', VOID, 1);
        crystals(s, 'chest', s.j('chest').add(V(0, 0.05 * H, -0.09 * H)), 5, 0.12 * H, 0.018 * H, 251, V(0, 0.6, -1), 0.5, 'alt', [0.2, 0.15, 0.25]);
      },
      paintSkin: { grime: 0.45, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.35, 0.3, 0.5] }, top: { amount: 0.12, col: [1.1, 1.15, 1.2] } },
      lumps: { amp: 0.01, scale: 7 },
      style: { heavy: 0.75, attacks: ['slam', 'claw', 'hurl'], castBoth: true, idle: 'breathe', gait: 'lumber', spawn: 'drop', death: 'crash' },
    }),
  mirror_image: (c) =>
    fiendLook(c, {
      height: 1.85,
      hip: 0.5,
      hunch: 0.05,
      thick: 0.85,
      skin: 0xb8dcf0,
      skinSurface: 'crystal',
      alt: { surface: 'crystal', tint: 0x88b8d8 },
      faceFn: (s, H) => {
        // A smooth, faceless oval, like a face pressed into glass.
        const h = s.j('head').add(V(0, 0.045 * H, 0.0));
        s.ball('head', h, V(0.048 * H, 0.064 * H, 0.056 * H), { k: 0.012 * H });
        s.ball('head', h.clone().add(V(0, -0.005 * H, 0.03 * H)), V(0.036 * H, 0.05 * H, 0.03 * H), { k: 0.01 * H });
        s.pair((_side, x) => s.glow(h.clone().add(V(x * 0.018 * H, 0.012 * H, 0.055 * H)), 0.012 * H, 0.8));
      },
      weapon: 'dagger',
      weaponGlow: 0.6,
      steel: [0.75, 0.85, 0.95],
      extra: (s, H) => {
        // Shards breaking off the body where the copy is coming apart.
        const r = seq(261);
        for (let i = 0; i < 6; i++) {
          const bone = ['chest', 'armL', 'foreR', 'spine', 'legR', 'chest'][i]!;
          const p = s.j(bone).add(V((r() - 0.5) * 0.08 * H, (r() - 0.5) * 0.05 * H, (r() - 0.3) * 0.08 * H));
          s.hard(bone, spikeGeo(p, p.clone().add(V((r() - 0.5) * 0.1 * H, (r() - 0.2) * 0.1 * H, (r() - 0.5) * 0.1 * H)), 0.018 * H, 4, undefined, 1), 'alt');
        }
      },
      paintSkin: { grime: 0.05, ao: 0.6, top: { amount: 0.3, col: [1.3, 1.35, 1.4] }, veins: { scale: 9, cut: 0.94, glow: 0.5, col: [0.8, 1.0, 1.3] } },
      style: { heavy: 0.15, attacks: ['thrust', 'swing'], armed: 'one', idle: 'still', gait: 'walk', spawn: 'form', death: 'scatter' },
    }),
  unmaker: (c) =>
    eyeLook(c, {
      hover: 1.55,
      radius: 0.34,
      orbs: 6,
      tendrils: 6,
      skin: { surface: 'shade', tint: 0x0e0a12 },
      alt: { surface: 'crystal', tint: 0x2a1a3a },
      metal: { surface: 'gold', tint: 0x8a6a8a },
      glowIntensity: 3,
      sculpt: (s, R) => {
        // A hole in the world: a black sphere with a burning rim, rings of dark metal turning
        // round it, shards of broken stuff orbiting, smoke dripping down.
        const c0 = s.j('core');
        s.ball('core', c0, R * 0.8, { k: R * 0.1 });
        s.hard('eye', ringGeo(s.j('eye').add(V(0, 0, -R * 0.25)), R * 0.55, R * 0.06, V(0, 0, 1), 24), 'skin', [1.2, 0.5, 1.4], 1);
        s.hard('eye', ballGeo(s.j('eye').add(V(0, 0, -R * 0.3)), R * 0.5, 2), 'skin', [0, 0, 0]);
        s.boil('eye', s.j('eye').add(V(0, 0, -R * 0.5)), R * 0.12, 1, [1.4, 1.2, 1.5]);
        s.hard('crown', ringGeo(c0, R * 1.25, R * 0.05, V(0.2, 1, 0.1).normalize(), 32), 'metal');
        s.hard('core', ringGeo(c0, R * 1.45, R * 0.04, V(1, 0.3, 0.2).normalize(), 32), 'metal');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const n = V(0.2, 1, 0.1).normalize();
          const u = V(1, 0, 0).cross(n).normalize();
          const w = n.clone().cross(u);
          const p = c0.clone().addScaledVector(u, Math.cos(a) * R * 1.25).addScaledVector(w, Math.sin(a) * R * 1.25);
          s.hard('crown', ballGeo(p, R * 0.06, 1), 'skin', VOID, 1);
        }
        const r = seq(271);
        for (let i = 0; i < 6; i++) {
          const p = s.j(`orb${i}`);
          crystals(s, `orb${i}`, p, 2, R * 0.4, R * 0.08, 273 + i, V(r() - 0.5, 1, r() - 0.5), 1, 'alt', [0.35, 0.2, 0.45], 0.4);
        }
        hangers(s, 6, R * 0.12);
      },
      paint: { skin: { grime: 0, ao: 0.4, tips: { amount: 0.8, col: [0.05, 0.02, 0.08] } }, alt: { grime: 0, ao: 0.5, veins: { scale: 10, cut: 0.94, glow: 0.6, col: VOID } }, metal: { grime: 0.4, ao: 0.7, mottle: { scale: 7, amount: 0.4, col: [0.4, 0.3, 0.45] } } },
      style: { heavy: 0.3, attacks: ['lash', 'hurl'], ranged: true, castBoth: true, idle: 'hover', spawn: 'form', death: 'fade' },
    }),
};

export { ABERRATION, tentacle, eyeball, maw, squidHead, blobLook, eyeLook, hangers };
