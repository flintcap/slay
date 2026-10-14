/**
 * SLAY — insects and spiders: hive drones, hornets, wasps, beetles, mantises,
 * ticks, spinners, the brood spawn and the acid larva. Hard shells with
 * a wet sheen, too many joints, eyes that catch the light.
 */
import { manyLegRig, serpentRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, RGB, Sculpt } from './Sculpt';
import { ballGeo, membraneGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, lerpV, paletteTint, seq } from './Kit';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const DARK: RGB = [0.18, 0.16, 0.14];
const AMBER: RGB = [0.75, 0.6, 0.35];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** Every walking leg: a thick femur, a thin tibia, a knob at the knee, spines if asked. */
function bugLegs(s: Sculpt, o: { r: number; spines?: number; mat?: CMat; hair?: boolean }): void {
  const mat = o.mat ?? 'skin';
  const r = o.r;
  for (let i = 0; i < 4; i++) {
    s.pair((side) => {
      const l = `leg${i}${side}`;
      if (!s.has(l)) return;
      const hip = s.j(l);
      const kn = s.j(`knee${i}${side}`);
      const ft = s.j(`foot${i}${side}`);
      const tip = s.j(`tip${i}${side}`);
      // Coxa: a knob where the leg meets the body.
      s.ball(l, hip, r * 1.5, { mat, k: r * 0.6 });
      s.limb(l, hip, kn, r * 1.2, r * 0.95, { mat, k: r * 0.4, blendAt: hip, blendR: r * 2 });
      s.ball(`knee${i}${side}`, kn, r * 1.05, { mat, k: r * 0.5 });
      s.limb(`knee${i}${side}`, kn, ft.y > 0.01 ? ft : lerpV(kn, tip, 0.97), r * 0.8, r * 0.35, { mat, k: r * 0.3, blendAt: kn, blendR: r * 1.5 });
      if (o.spines) {
        const n = o.spines;
        for (let k = 0; k < n; k++) {
          const t = 0.25 + (k / n) * 0.6;
          const p = lerpV(kn, tip, t);
          const out = p.clone().add(V(0, r * 0.9, 0)).addScaledVector(kn.clone().sub(tip).normalize(), r * 0.6);
          s.hard(`knee${i}${side}`, spikeGeo(p, out, r * 0.25, 3, undefined, 1), 'skin', DARK);
        }
      }
      if (o.hair) {
        const rr = seq(i * 31 + (side === 'L' ? 7 : 3));
        for (let k = 0; k < 5; k++) {
          const p = lerpV(hip, kn, 0.2 + k * 0.15);
          s.hard(l, spikeGeo(p, p.clone().add(V((rr() - 0.5) * r * 2, r * (1.4 + rr()), (rr() - 0.5) * r * 2)), r * 0.15, 3, undefined, 1), 'skin', DARK);
        }
      }
    });
  }
}

/** Raised killing scythes on the front pair (mantis, reaver). */
function scythes(s: Sculpt, o: { r: number; blade: number; col?: RGB; mat?: CMat }): void {
  const mat = o.mat ?? 'skin';
  s.pair((side, x) => {
    const l = `leg0${side}`;
    if (!s.has(l)) return;
    const hip = s.j(l);
    const kn = s.j(`knee0${side}`);
    const ft = s.j(`foot0${side}`);
    const tip = s.j(`tip0${side}`);
    s.limb(l, hip, kn, o.r * 1.2, o.r, { mat, k: o.r * 0.5 });
    // The raptorial femur: thick, with a row of teeth on its inner edge.
    s.limb(`knee0${side}`, kn, ft, o.r * 1.3, o.r * 0.8, { mat, k: o.r * 0.4 });
    for (let k = 0; k < 4; k++) {
      const p = lerpV(kn, ft, 0.2 + k * 0.18).add(V(-x * o.r * 0.6, -o.r * 0.8, 0));
      s.hard(`knee0${side}`, spikeGeo(p, p.clone().add(V(-x * o.r * 0.3, -o.r * 1.6, o.r * 0.3)), o.r * 0.25, 3, undefined, 1), 'skin', o.col ?? DARK);
    }
    // The tibia folds back as a hooked blade.
    const d = tip.clone().sub(ft);
    const len = d.length() * o.blade;
    const end = ft.clone().addScaledVector(d.normalize(), len);
    s.hard(`foot0${side}`, spikeGeo(ft, end, o.r * 0.7, 4, V(0, 0, len * 0.25), 3), 'skin', o.col);
  });
}

/** An insect head: rounded capsule, big compound eyes, mandibles, antennae. */
function bugHead(s: Sculpt, o: { w: number; eyes?: number; eyeR?: number; glow?: number; antennae?: number; mand?: number; lift?: number; mat?: CMat; mandCol?: RGB; long?: number }): void {
  const mat = o.mat ?? 'skin';
  const h = s.j('head').add(V(0, o.lift ?? 0, 0));
  const w = o.w;
  s.ball('head', h, V(w, w * 0.85, w * (o.long ?? 0.9)), { mat, k: w * 0.3 });
  // Compound eyes: dark glossy domes with only a faint inner light.
  s.pair((_side, x) => {
    const e = h.clone().add(V(x * w * 0.7, w * 0.22, w * 0.32));
    s.hard('head', ballGeo(e, w * (o.eyeR ?? 0.36), 1), 'skin', [0.1, 0.11, 0.09], 0);
  });
  if (o.eyes) for (let i = 0; i < o.eyes; i++) s.pair((_side, x) => s.eye('head', h.clone().add(V(x * w * (0.18 + i * 0.12), w * 0.7, w * (0.5 - i * 0.15))), w * 0.1, (o.glow ?? 0.5) * 1.5));
  if (o.antennae) {
    s.pair((_side, x) => {
      const a = h.clone().add(V(x * w * 0.3, w * 0.7, w * 0.6));
      const L = o.antennae! * w;
      s.hard('head', tubeGeo([a, a.clone().add(V(x * L * 0.25, L * 0.45, L * 0.3)), a.clone().add(V(x * L * 0.55, L * 0.7, L * 0.65)), a.clone().add(V(x * L * 0.75, L * 0.6, L * 1.0))], (t) => w * (0.06 - 0.04 * t), 4), 'skin', DARK);
    });
  }
  if (o.mand !== 0) {
    s.pair((side, x) => {
      const m = s.j(`mand${side}`);
      const tip = s.j(`mand${side}Tip`);
      const k = o.mand ?? 1;
      const end = m.clone().add(tip.clone().sub(m).multiplyScalar(k));
      s.hard(`mand${side}`, spikeGeo(m, end, w * 0.18 * Math.max(0.6, k * 0.8), 4, V(-x * w * 0.15 * k, 0, 0), 3), 'skin', o.mandCol ?? DARK);
    });
  }
}

/** A segmented abdomen along the abdomen bone, swelling to `bulge` then tapering. */
function abdomen(s: Sculpt, o: { r: number; segs: number; bulge?: number; mat?: CMat; band?: { mat: CMat; w?: number }; sag?: number; len?: number }): void {
  const a = s.j('abdomen');
  const tip = s.j('abdomenTip');
  const end = lerpV(a, tip, o.len ?? 1);
  const mat = o.mat ?? 'skin';
  const n = o.segs;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = lerpV(a, end, t).add(V(0, -(o.sag ?? 0) * Math.sin(t * Math.PI), 0));
    const swell = Math.sin(Math.pow(t, o.bulge ?? 0.8) * Math.PI) * 0.8 + 0.25;
    const r = o.r * swell;
    const seg = a.distanceTo(end) / n;
    s.ball('abdomen', p, V(r, r * 0.85, Math.max(seg * 0.7, r * 0.8)), { mat, k: r * 0.25 });
    if (o.band && i % 2 === 1) s.ball('abdomen', p.clone().add(V(0, r * 0.02, 0)), V(r * 1.03, r * 0.88, seg * 0.32 * (o.band.w ?? 1)), { mat: o.band.mat, k: r * 0.1 });
  }
}

/** Translucent-looking wings: a veined membrane panel per wing bone. */
function bugWings(s: Sculpt, o: { len: number; w: number; mat?: CMat; col?: RGB }): void {
  const mat = o.mat ?? 'alt';
  for (const n of ['wingL', 'wingR', 'wingL2', 'wingR2']) {
    if (!s.has(n)) continue;
    const base = s.j(n);
    const tip = s.j(`${n}Tip`);
    const end = lerpV(base, tip, o.len);
    const side = n.startsWith('wingL') ? 1 : -1;
    const perp = V(side * o.w, 0, o.w * 0.25);
    s.hard(n, membraneGeo(base, [lerpV(base, end, 0.3).add(perp.clone().multiplyScalar(0.6)), lerpV(base, end, 0.75).add(perp), end, lerpV(base, end, 0.6).sub(perp.clone().multiplyScalar(0.35))], 0.006, 0.08), mat, o.col);
    // A dark vein along the leading edge.
    s.hard(n, tubeGeo([base, lerpV(base, end, 0.5).add(perp.clone().multiplyScalar(0.7)), end], () => o.w * 0.04, 3), mat, DARK);
  }
}

/** A domed carapace over the body (and wing cases over the abdomen for beetles). */
function carapace(s: Sculpt, o: { r: number; elytra?: number; ridge?: number; mat?: CMat; horn?: number; hornCol?: RGB; spikes?: number }): void {
  const mat = o.mat ?? 'skin';
  const b = s.j('body');
  const r = o.r;
  s.ball('body', b.clone().add(V(0, r * 0.15, 0.05 * r)), V(r * 0.95, r * 0.8, r * 1.1), { mat, k: r * 0.3 });
  // Pronotum: the shield over the thorax, flaring at the sides.
  s.ball('body', b.clone().add(V(0, r * 0.45, r * 0.35)), V(r * 1.05, r * 0.45, r * 0.75), { mat, k: r * 0.2 });
  if (o.elytra) {
    const a = s.j('abdomen');
    const t = s.j('abdomenTip');
    const mid = lerpV(a, t, 0.4).add(V(0, r * 0.2, 0));
    s.pair((_side, x) => s.ball('abdomen', mid.clone().add(V(x * r * 0.45, 0, 0)), V(r * 0.62 * o.elytra!, r * 0.62 * o.elytra!, a.distanceTo(t) * 0.42), { mat: 'alt', k: r * 0.08 }));
  }
  if (o.ridge) {
    for (let i = 0; i < 5; i++) {
      const p = b.clone().add(V(0, r * 0.88, r * (0.6 - i * 0.3)));
      s.hard('body', spikeGeo(p, p.clone().add(V(0, r * 0.35 * o.ridge, -r * 0.25)), r * 0.12, 4, undefined, 1), 'skin', DARK);
    }
  }
  if (o.horn) {
    const p = s.j('head').add(V(0, r * 0.3, r * 0.2));
    s.hard('head', spikeGeo(p, p.clone().add(V(0, r * 0.9 * o.horn, r * 0.7 * o.horn)), r * 0.22, 5, V(0, -r * 0.3, r * 0.2), 4), 'skin', o.hornCol ?? DARK);
    s.hard('body', spikeGeo(b.clone().add(V(0, r * 0.8, r * 0.7)), b.clone().add(V(0, r * 1.3 * o.horn, r * 1.5 * o.horn)), r * 0.16, 5, V(0, -r * 0.2, 0), 3), 'skin', o.hornCol ?? DARK);
  }
  if (o.spikes) {
    s.pair((_side, x) => {
      for (let i = 0; i < o.spikes!; i++) {
        const p = b.clone().add(V(x * r * 0.95, r * 0.35, r * (0.5 - i * 0.35)));
        s.hard('body', spikeGeo(p, p.clone().add(V(x * r * 0.45, r * 0.2, -r * 0.1)), r * 0.1, 4, undefined, 1), 'skin', DARK);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

interface BugOpt {
  kind: 'spider' | 'insect';
  body: number;
  ride: number;
  abdomen?: number;
  reach?: number;
  pairs?: number;
  scythes?: boolean;
  wings?: number;
  sting?: boolean;
  head?: number;
  knee?: number;
  size?: number;
  surface?: Surface;
  tint?: number;
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  sculpt: (s: Sculpt, B: number) => void;
  paint?: Sculpt['paint']['skin'];
  style: Partial<MotionStyle>;
  tier?: CreatureLook['tier'];
}

function bugLook(c: LookCtx, o: BugOpt): CreatureLook {
  const tint = o.tint ?? paletteTint(c.visual.palette, 0x3d4a35);
  const glow = c.visual.glow ?? 0x99ff33;
  const B = o.body;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? (B < 0.2 ? 'small' : B > 0.42 ? 'big' : 'normal'),
    rig: () => manyLegRig(o.kind, { body: B, ride: o.ride, abdomen: o.abdomen, reach: o.reach, pairs: o.pairs ?? (o.kind === 'spider' ? 4 : 3), scythes: o.scythes, wings: o.wings, sting: o.sting, head: o.head, knee: o.knee ?? (o.kind === 'insect' ? 0.4 : undefined) }),
    sculpt: (s) => {
      o.sculpt(s, B);
      s.paint.skin = o.paint ?? { grime: 0.35, ao: 0.9, bands: { axis: 'z', period: B * 0.35, amount: 0.3 }, top: { amount: 0.12, col: [1.15, 1.15, 1.05] } };
      s.paint.alt = { grime: 0.25, ao: 0.85, top: { amount: 0.2, col: [1.2, 1.15, 1.0] } };
    },
    mats: {
      skin: { surface: o.surface ?? 'chitin', tint, glow },
      alt: { surface: o.alt?.surface ?? 'chitin', tint: o.alt?.tint ?? tint, glow },
      metal: { surface: o.metal?.surface ?? 'bone', tint: o.metal?.tint ?? 0xd8ceb0, glow },
    },
    style: { heavy: 0.2, attacks: ['bite', 'claw'], spawn: 'emerge', death: 'flip', idle: 'twitch', gait: 'scuttle', ...o.style },
  };
}

/** Thorax, waist and head for ants, wasps and hornets. */
function waspBody(s: Sculpt, B: number, o: { thorax: number; head: number; band?: CMat; stingCol?: RGB }): void {
  const b = s.j('body');
  s.ball('body', b.clone().add(V(0, B * 0.05, 0.1 * B)), V(B * o.thorax * 0.8, B * o.thorax * 0.75, B * o.thorax), { k: B * 0.1 });
  // The waist: a thin stalk back to the abdomen.
  s.limb('abdomen', b.clone().add(V(0, 0, -B * 0.5)), s.j('abdomen').add(V(0, 0, B * 0.15)), B * 0.12, B * 0.1, { k: B * 0.05 });
  s.limb('head', b.clone().add(V(0, B * 0.05, B * 0.6)), s.j('head').add(V(0, 0, -B * 0.3)), B * 0.13, B * 0.12, { k: B * 0.05 });
  if (s.has('sting')) s.hard('sting', spikeGeo(s.j('sting'), s.j('stingTip'), B * 0.08, 4, V(0, -B * 0.1, 0), 3), 'skin', o.stingCol ?? DARK);
}

const BUG: Record<string, LookFactory> = {
  hive_drone: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.2,
      ride: 0.26,
      abdomen: 0.85,
      reach: 1.7,
      size: 1.6,
      sculpt: (s, B) => {
        waspBody(s, B, { thorax: 0.8, head: 0.6 });
        abdomen(s, { r: B * 0.85, segs: 4, bulge: 0.7 });
        bugHead(s, { w: B * 0.6, glow: 0.6, antennae: 2.2, mand: 1.1 });
        bugLegs(s, { r: B * 0.108 });
      },
      style: { heavy: 0.05, attacks: ['bite', 'lunge'], idle: 'twitch', gait: 'scuttle', stride: 1.0 },
    }),
  hornet_swarmer: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.16,
      ride: 0.55,
      abdomen: 0.95,
      reach: 1.4,
      wings: 2,
      sting: true,
      size: 1.8,
      alt: { surface: 'chitin', tint: 0x2a2018 },
      metal: { surface: 'chitin', tint: 0xb0a088 },
      sculpt: (s, B) => {
        waspBody(s, B, { thorax: 0.85, head: 0.7 });
        abdomen(s, { r: B * 0.85, segs: 5, bulge: 0.6, band: { mat: 'alt', w: 1.2 } });
        bugHead(s, { w: B * 0.68, glow: 0.8, antennae: 1.6, mand: 0.9 });
        bugLegs(s, { r: B * 0.06 });
        bugWings(s, { len: 1, w: B * 0.5, mat: 'metal' });
      },
      style: { heavy: 0.02, attacks: ['sting', 'bite'], idle: 'hover', gait: 'glide', spawn: 'swoop', death: 'flip' },
    }),
  venom_wasp: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.22,
      ride: 0.6,
      abdomen: 1.05,
      reach: 1.4,
      wings: 2,
      sting: true,
      size: 1.5,
      alt: { surface: 'chitin', tint: 0x1c1612 },
      metal: { surface: 'chitin', tint: 0xa89070 },
      sculpt: (s, B) => {
        waspBody(s, B, { thorax: 0.8, head: 0.65, stingCol: [0.9, 0.6, 0.3] });
        abdomen(s, { r: B * 0.8, segs: 6, bulge: 0.55, band: { mat: 'alt', w: 1.0 } });
        bugHead(s, { w: B * 0.62, glow: 1.0, antennae: 1.8, mand: 1.0 });
        bugLegs(s, { r: B * 0.055 });
        bugWings(s, { len: 1.1, w: B * 0.5, mat: 'metal' });
        // Venom beads at the sting.
        if (s.has('sting')) s.boil('sting', lerpV(s.j('sting'), s.j('stingTip'), 0.7), B * 0.06, 1, [1, 0.7, 0.3]);
      },
      style: { heavy: 0.05, attacks: ['sting'], ranged: true, idle: 'hover', gait: 'glide', spawn: 'swoop', death: 'flip' },
    }),
  hive_nurse: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.26,
      ride: 0.65,
      abdomen: 1.1,
      reach: 1.5,
      wings: 2,
      size: 1.2,
      alt: { surface: 'slime', tint: 0xd8a040 },
      metal: { surface: 'chitin', tint: 0xb8a888 },
      sculpt: (s, B) => {
        waspBody(s, B, { thorax: 0.9, head: 0.6 });
        // A swollen sac of honey and royal jelly that glows through the shell.
        abdomen(s, { r: B * 1.25, segs: 4, bulge: 0.9, sag: B * 0.15, band: { mat: 'alt', w: 0.8 } });
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        for (let i = 0; i < 4; i++) s.boil('abdomen', lerpV(a, t, 0.3 + i * 0.13).add(V(i % 2 ? B * 0.35 : -B * 0.35, -B * 0.25, 0)), B * 0.12, 0.9, [1, 0.85, 0.45]);
        bugHead(s, { w: B * 0.55, glow: 0.7, antennae: 2.0, mand: 0.7 });
        bugLegs(s, { r: B * 0.055, hair: true });
        bugWings(s, { len: 0.95, w: B * 0.55, mat: 'metal' });
        // Fuzz on the thorax.
        const r = seq(17);
        for (let i = 0; i < 12; i++) {
          const p = s.j('body').add(V((r() - 0.5) * B * 1.2, B * 0.5 + r() * B * 0.2, (r() - 0.5) * B * 1.2));
          s.hard('body', spikeGeo(p, p.clone().add(V(0, B * 0.15, 0)), B * 0.04, 3, undefined, 1), 'skin', AMBER);
        }
      },
      style: { heavy: 0.15, attacks: ['bite'], idle: 'hover', gait: 'glide', spawn: 'swoop', death: 'flip', castBoth: true },
    }),
  spitter_beetle: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.3,
      ride: 0.28,
      abdomen: 0.75,
      reach: 1.6,
      size: 1.1,
      alt: { surface: 'chitin', tint: 0x2c3a24 },
      sculpt: (s, B) => {
        carapace(s, { r: B * 0.95, elytra: 1.1 });
        abdomen(s, { r: B * 0.95, segs: 3, bulge: 0.8 });
        // Acid sacs bulging between the wing cases.
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        s.pair((_side, x) => {
          for (let i = 0; i < 2; i++) s.boil('abdomen', lerpV(a, t, 0.35 + i * 0.25).add(V(x * B * 0.85, B * 0.1, 0)), B * 0.16, 0.9, [0.7, 1, 0.35]);
        });
        bugHead(s, { w: B * 0.55, glow: 0.6, antennae: 1.1, mand: 0.9 });
        // A dripping mouth.
        s.boil('head', s.j('head').add(V(0, -B * 0.25, B * 0.5)), B * 0.08, 1, [0.7, 1, 0.35]);
        bugLegs(s, { r: B * 0.108, spines: 2 });
      },
      style: { heavy: 0.3, attacks: ['bite'], ranged: true, idle: 'twitch', gait: 'scuttle' },
    }),
  lance_mantis: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.3,
      ride: 0.55,
      abdomen: 1.15,
      reach: 1.7,
      scythes: true,
      head: 1.6,
      size: 1.1,
      alt: { surface: 'chitin', tint: 0x6a7a3a },
      sculpt: (s, B) => {
        const b = s.j('body');
        const h = s.j('head');
        // A long raised prothorax holding the head high.
        s.ball('body', b, V(B * 0.5, B * 0.45, B * 0.75), { k: B * 0.15 });
        s.limb('head', b.clone().add(V(0, B * 0.1, B * 0.4)), h.clone().add(V(0, B * 0.45, -B * 0.2)), B * 0.24, B * 0.16, { k: B * 0.1 });
        abdomen(s, { r: B * 0.55, segs: 6, bulge: 0.65, sag: -B * 0.1 });
        // Triangular head with eyes on its corners.
        const hh = h.clone().add(V(0, B * 0.5, 0));
        s.ball('head', hh, V(B * 0.42, B * 0.28, B * 0.22), { k: B * 0.08 });
        s.limb('head', hh, hh.clone().add(V(0, -B * 0.35, B * 0.12)), B * 0.15, B * 0.06, { k: B * 0.06 });
        s.pair((_side, x) => s.eye('head', hh.clone().add(V(x * B * 0.4, B * 0.06, B * 0.06)), B * 0.1, 0.35));
        s.pair((_side, x) => {
          const a = hh.clone().add(V(x * B * 0.1, B * 0.2, B * 0.1));
          s.hard('head', tubeGeo([a, a.clone().add(V(x * B * 0.2, B * 0.5, B * 0.3)), a.clone().add(V(x * B * 0.45, B * 0.6, B * 0.75))], () => B * 0.025, 3), 'skin', DARK);
        });
        scythes(s, { r: B * 0.15, blade: 1.5, col: [0.85, 0.9, 0.6] });
        bugLegs(s, { r: B * 0.095 });
        // Folded wings on its back.
        s.pair((_side, x) => s.hard('abdomen', membraneGeo(s.j('abdomen').add(V(x * B * 0.1, B * 0.4, B * 0.2)), [s.j('abdomen').add(V(x * B * 0.45, B * 0.5, -B * 0.4)), lerpV(s.j('abdomen'), s.j('abdomenTip'), 0.75).add(V(x * B * 0.3, B * 0.45, 0)), lerpV(s.j('abdomen'), s.j('abdomenTip'), 0.8).add(V(0, B * 0.48, 0))], 0.008, 0.05), 'alt'));
      },
      style: { heavy: 0.2, attacks: ['chop', 'swing'], idle: 'sway', gait: 'stalk', death: 'collapse' },
    }),
  chitin_reaver: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.32,
      ride: 0.5,
      abdomen: 1.0,
      reach: 1.7,
      scythes: true,
      head: 1.35,
      size: 1.1,
      alt: { surface: 'chitin', tint: 0x2a242a },
      sculpt: (s, B) => {
        carapace(s, { r: B * 0.75, spikes: 3, ridge: 1.2 });
        s.limb('head', s.j('body').add(V(0, B * 0.2, B * 0.4)), s.j('head').add(V(0, B * 0.2, -B * 0.15)), B * 0.28, B * 0.2, { k: B * 0.1 });
        abdomen(s, { r: B * 0.7, segs: 5, bulge: 0.6 });
        // Blade fins down the abdomen.
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        for (let i = 0; i < 4; i++) {
          const p = lerpV(a, t, 0.15 + i * 0.2).add(V(0, B * 0.5 * (1 - i * 0.15), 0));
          s.hard('abdomen', spikeGeo(p, p.clone().add(V(0, B * 0.45, -B * 0.35)), B * 0.1, 4, undefined, 1), 'skin', DARK);
        }
        bugHead(s, { w: B * 0.5, glow: 1.4, eyes: 2, mand: 1.3, lift: B * 0.2, long: 1.2 });
        scythes(s, { r: B * 0.13, blade: 1.4, col: [0.75, 0.7, 0.75] });
        bugLegs(s, { r: B * 0.108, spines: 3 });
      },
      paint: { grime: 0.3, ao: 0.9, bands: { axis: 'z', period: 0.12, amount: 0.25 }, veins: { scale: 6, cut: 0.82, glow: 0, col: [1.2, 0.6, 0.9] }, top: { amount: 0.15, col: [1.2, 1.1, 1.2] } },
      style: { heavy: 0.3, attacks: ['chop', 'swing', 'lunge'], idle: 'twitch', gait: 'stalk', death: 'collapse' },
    }),
  carapace_warden: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.5,
      ride: 0.42,
      abdomen: 0.8,
      reach: 1.5,
      size: 0.8,
      tier: 'big',
      alt: { surface: 'chitin', tint: 0x26301e },
      sculpt: (s, B) => {
        carapace(s, { r: B * 1.0, elytra: 1.15, horn: 1.1, spikes: 2 });
        abdomen(s, { r: B * 1.0, segs: 3, bulge: 0.8 });
        bugHead(s, { w: B * 0.5, glow: 0.8, mand: 0.8, antennae: 0.9 });
        bugLegs(s, { r: B * 0.135, spines: 3 });
        // Moss and grit caked in the seams.
        const r = seq(23);
        for (let i = 0; i < 6; i++) s.tint(s.j('abdomen').add(V((r() - 0.5) * B * 1.6, B * 0.5, (r() - 0.8) * B * 1.5)), B * 0.25, [0.6, 0.65, 0.45]);
      },
      style: { heavy: 0.7, attacks: ['gore', 'slam'], idle: 'breathe', gait: 'lumber', death: 'flip' },
    }),
  royal_guard_beetle: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.5,
      ride: 0.5,
      abdomen: 0.8,
      reach: 1.6,
      size: 0.75,
      tier: 'big',
      surface: 'gold',
      tint: 0xb08a3a,
      alt: { surface: 'chitin', tint: 0x6a4a1a },
      metal: { surface: 'brass', tint: 0xc8a050 },
      sculpt: (s, B) => {
        carapace(s, { r: B * 1.0, elytra: 1.1, ridge: 1.4, spikes: 3, hornCol: [0.8, 0.65, 0.3] });
        abdomen(s, { r: B * 1.0, segs: 3, bulge: 0.75 });
        // Halberd mandibles: long, hooked, gilded.
        bugHead(s, { w: B * 0.55, glow: 1.2, mand: 1.9, mandCol: [0.85, 0.7, 0.35], antennae: 1.0 });
        // A crest like a helmet plume.
        const h = s.j('head');
        for (let i = 0; i < 4; i++) {
          const p = h.clone().add(V(0, B * 0.45, B * (0.25 - i * 0.18)));
          s.hard('head', spikeGeo(p, p.clone().add(V(0, B * (0.45 - i * 0.06), -B * 0.25)), B * 0.08, 4, undefined, 2), 'metal');
        }
        bugLegs(s, { r: B * 0.135, spines: 2, mat: 'alt' });
      },
      paint: { grime: 0.35, ao: 0.9, bands: { axis: 'z', period: 0.2, amount: 0.2 }, top: { amount: 0.25, col: [1.3, 1.2, 0.9] } },
      style: { heavy: 0.75, attacks: ['bite', 'gore', 'slam'], idle: 'breathe', gait: 'march', death: 'flip' },
    }),
  burrow_tick: (c) =>
    bugLook(c, {
      kind: 'spider',
      body: 0.2,
      ride: 0.24,
      abdomen: 1.3,
      reach: 1.7,
      head: 0.85,
      size: 1.4,
      surface: 'hide',
      alt: { surface: 'chitin', tint: 0x3a2a22 },
      sculpt: (s, B) => {
        const b = s.j('body');
        // A small hard shield at the front, a vast soft bladder of blood behind.
        s.ball('body', b, V(B * 0.75, B * 0.4, B * 0.8), { mat: 'alt', k: B * 0.1 });
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        s.ball('abdomen', lerpV(a, t, 0.4).add(V(0, B * 0.15, 0)), V(B * 1.35, B * 1.0, B * 1.5), { k: B * 0.2 });
        s.ball('abdomen', lerpV(a, t, 0.4).add(V(0, B * 0.8, -B * 0.1)), V(B * 0.6, B * 0.25, B * 0.8), { mat: 'alt', k: B * 0.15 });
        // Mouth spike (hypostome) for drinking.
        const h = s.j('head');
        s.ball('head', h, V(B * 0.3, B * 0.22, B * 0.35), { mat: 'alt', k: B * 0.08 });
        s.hard('head', spikeGeo(h.clone().add(V(0, -B * 0.05, B * 0.25)), h.clone().add(V(0, -B * 0.2, B * 0.9)), B * 0.08, 4, undefined, 3), 'alt', [0.6, 0.4, 0.35]);
        s.pair((side) => s.hard(`mand${side}`, spikeGeo(s.j(`mand${side}`), s.j(`mand${side}Tip`), B * 0.06, 4), 'alt'));
        s.pair((_side, x) => s.eye('head', h.clone().add(V(x * B * 0.2, B * 0.15, B * 0.2)), B * 0.06, 1.2));
        bugLegs(s, { r: B * 0.095, mat: 'alt' });
      },
      paint: { grime: 0.4, ao: 0.9, mottle: { scale: 6, amount: 0.4, col: [0.7, 0.45, 0.45] }, top: { amount: 0.1, col: [1.1, 1, 1] } },
      style: { heavy: 0.15, attacks: ['bite', 'lunge'], idle: 'still', gait: 'scuttle', spawn: 'emerge', death: 'flip' },
    }),
  web_spinner: (c) =>
    bugLook(c, {
      kind: 'spider',
      body: 0.22,
      ride: 0.4,
      abdomen: 1.4,
      reach: 2.6,
      size: 1.4,
      alt: { surface: 'chitin', tint: 0x22281c },
      sculpt: (s, B) => {
        const b = s.j('body');
        s.ball('body', b, V(B * 0.75, B * 0.5, B * 0.85), { k: B * 0.1 });
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        s.limb('abdomen', b.clone().add(V(0, 0, -B * 0.6)), a, B * 0.25, B * 0.25, { k: B * 0.1 });
        s.ball('abdomen', lerpV(a, t, 0.45).add(V(0, B * 0.25, 0)), V(B * 1.05, B * 0.95, B * 1.35), { k: B * 0.2 });
        // A pale skull mark on the abdomen.
        s.tint(lerpV(a, t, 0.4).add(V(0, B * 1.15, 0)), B * 0.4, [1.6, 1.55, 1.3]);
        s.tint(lerpV(a, t, 0.4).add(V(0, B * 1.15, B * 0.15)), B * 0.15, [0.3, 0.3, 0.3]);
        // Spinnerets.
        s.ball('abdomen', t.clone().add(V(0, B * 0.2, B * 0.25)), B * 0.12, { k: B * 0.05 });
        const h = s.j('head');
        s.ball('head', h, V(B * 0.4, B * 0.32, B * 0.38), { k: B * 0.1 });
        // Eight eyes: two big, six small.
        s.pair((_side, x) => {
          s.eye('head', h.clone().add(V(x * B * 0.12, B * 0.18, B * 0.33)), B * 0.08, 1.4);
          for (let i = 0; i < 3; i++) s.eye('head', h.clone().add(V(x * B * (0.22 + i * 0.06), B * (0.25 - i * 0.05), B * (0.25 - i * 0.07))), B * 0.04, 1.1);
        });
        s.pair((side) => s.hard(`mand${side}`, spikeGeo(s.j(`mand${side}`), s.j(`mand${side}Tip`), B * 0.09, 4, V(0, 0, B * 0.05), 3), 'skin', DARK));
        bugLegs(s, { r: B * 0.095, hair: true });
      },
      paint: { grime: 0.3, ao: 0.9, mottle: { scale: 9, amount: 0.35, col: [0.6, 0.6, 0.45] }, top: { amount: 0.12, col: [1.1, 1.1, 1] } },
      style: { heavy: 0.1, attacks: ['bite', 'claw'], ranged: true, idle: 'still', gait: 'scuttle', spawn: 'drop', death: 'flip' },
    }),
  broodmother_spawn: (c) =>
    bugLook(c, {
      kind: 'spider',
      body: 0.32,
      ride: 0.5,
      abdomen: 1.5,
      reach: 2.4,
      size: 1.0,
      tier: 'big',
      alt: { surface: 'flesh', tint: 0xc8a8a0 },
      sculpt: (s, B) => {
        const b = s.j('body');
        s.ball('body', b, V(B * 0.8, B * 0.55, B * 0.9), { k: B * 0.1 });
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        s.ball('abdomen', lerpV(a, t, 0.45).add(V(0, B * 0.3, 0)), V(B * 1.2, B * 1.05, B * 1.45), { k: B * 0.2 });
        // Clutches of glowing eggs on the back.
        const r = seq(41);
        for (let i = 0; i < 14; i++) {
          const p = lerpV(a, t, 0.2 + r() * 0.55).add(V((r() - 0.5) * B * 1.5, B * (1.0 + r() * 0.35), 0));
          s.boil('abdomen', p, B * (0.1 + r() * 0.07), 0.55, [1, 0.6, 0.75]);
        }
        const h = s.j('head');
        s.ball('head', h, V(B * 0.42, B * 0.34, B * 0.4), { k: B * 0.1 });
        s.pair((_side, x) => {
          for (let i = 0; i < 4; i++) s.eye('head', h.clone().add(V(x * B * (0.1 + i * 0.08), B * (0.24 - i * 0.04), B * (0.34 - i * 0.07))), B * (i === 0 ? 0.08 : 0.05), 1.3);
        });
        s.pair((side) => s.hard(`mand${side}`, spikeGeo(s.j(`mand${side}`), s.j(`mand${side}Tip`), B * 0.1, 4, V(0, 0, B * 0.06), 3), 'skin', DARK));
        bugLegs(s, { r: B * 0.101, hair: true, spines: 2 });
      },
      paint: { grime: 0.35, ao: 0.9, mottle: { scale: 5, amount: 0.4, col: [0.8, 0.4, 0.45] }, top: { amount: 0.12, col: [1.1, 1, 1] } },
      style: { heavy: 0.35, attacks: ['bite', 'claw'], idle: 'breathe', gait: 'scuttle', spawn: 'drop', death: 'flip', castBoth: true },
    }),
  acid_larva: (c) => {
    const tint = paletteTint(c.visual.palette, 0x6f7a4a);
    const glow = c.visual.glow ?? 0xaaff33;
    return {
      key: `id:${c.id}`,
      size: 1.5,
      tier: 'small',
      rig: () => serpentRig({ length: 1.0, girth: 0.13, front: 3, rear: 4, rise: 0.12, head: 0.1 }),
      sculpt: (s) => {
        // A fat grub: ringed segments, glowing acid showing through the skin.
        const chainF = ['body', 'f1', 'f2', 'f3'].filter((n) => s.has(n));
        const chainT = ['body', 't1', 't2', 't3', 't4'].filter((n) => s.has(n));
        const g = 0.13;
        for (let i = 0; i < chainF.length; i++) s.ball(chainF[i]!, s.j(chainF[i]!), V(g * (1 - i * 0.08), g * 0.9 * (1 - i * 0.08), g * 0.9), { k: g * 0.4 });
        for (let i = 1; i < chainT.length; i++) s.ball(chainT[i]!, s.j(chainT[i]!), V(g * (1.05 - i * 0.14), g * 0.9 * (1.05 - i * 0.14), g * 0.85), { k: g * 0.4 });
        s.ball('t4', s.j('tailTip'), g * 0.35, { k: g * 0.3 });
        const h = s.j('head');
        s.ball('head', h, V(g * 0.7, g * 0.6, g * 0.6), { mat: 'alt', k: g * 0.2 });
        s.pair((_side, x) => s.hard('jaw', spikeGeo(h.clone().add(V(x * g * 0.3, -g * 0.2, g * 0.4)), h.clone().add(V(x * g * 0.1, -g * 0.35, g * 0.85)), g * 0.12, 4, V(-x * g * 0.1, 0, 0), 3), 'alt', DARK));
        // Acid glands down each side.
        for (const n of [...chainF, ...chainT.slice(1)]) s.pair((_side, x) => s.boil(n, s.j(n).add(V(x * g * 0.85, g * 0.1, 0)), g * 0.18, 0.9, [0.75, 1, 0.3]));
        // Stubby legs under the front.
        for (const n of chainF) s.pair((_side, x) => s.limb(n, s.j(n).add(V(x * g * 0.5, -g * 0.6, 0)), s.j(n).add(V(x * g * 0.7, -g * 0.95, g * 0.1)), g * 0.12, g * 0.08, { k: g * 0.1 }));
        s.paint.skin = { grime: 0.3, ao: 0.9, bands: { axis: 'z', period: g * 0.9, amount: 0.45 }, top: { amount: 0.15, col: [1.1, 1.15, 1.0] } };
      },
      mats: {
        skin: { surface: 'slime', tint, glow },
        alt: { surface: 'chitin', tint: 0x3a3020, glow },
        metal: { surface: 'bone', tint: 0xd8ceb0, glow },
      },
      style: { heavy: 0.15, attacks: ['bite', 'lunge'], spawn: 'emerge', death: 'splat', idle: 'sway', gait: 'slither', stride: 6 },
    };
  },
};

export { BUG, bugLook, bugLegs, bugHead, bugWings, abdomen, carapace, scythes, waspBody };
