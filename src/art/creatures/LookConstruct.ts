/**
 * SLAY — constructs: clockwork scarabs and stalkers, animate armour, brass
 * sentries, arc pylons, iron golems, forge smiths, siege automatons, rune
 * guardians and their sentry totems, the colossus frame, the quicksilver
 * construct and the obsidian warden.
 *
 * Made things, so they are built like made things: plates that do not bend
 * like flesh (stiff skinning), riveted seams, ball joints at elbows and
 * knees, gears and pistons where muscles would be, and a light inside
 * (furnace, lens or rune) where a heart would be.
 */
import * as THREE from 'three';
import { bipedRig, floaterRig, type BipedShape } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, PaintSpec, RGB, Sculpt } from './Sculpt';
import { ballGeo, bladeGeo, boxGeo, ringGeo, slabGeo, spikeGeo, tubeGeo } from './Sculpt';
import { weapon } from './Arms';
import { V, claws, cuirass, foot, helm, lerpV, pauldron, quatAlong, ribcage, seq, skirt, trunk } from './Kit';
import { bugHead, bugLegs, bugLook, carapace } from './LookBug';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const DARK: RGB = [0.16, 0.15, 0.15];
const BRASS: RGB = [0.78, 0.6, 0.3];
const COPPER: RGB = [0.72, 0.42, 0.26];
const IRON: RGB = [0.36, 0.35, 0.36];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** Two unit vectors across a normal. */
function across(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const u = (Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(n).normalize();
  return [u, n.clone().cross(u).normalize()];
}

/** A gear: a toothed ring round a hub, facing along `n`. */
function gear(s: Sculpt, bone: string, c: THREE.Vector3, r: number, n: THREE.Vector3, teeth: number, col: RGB, mat: CMat = 'metal', glow = 0): void {
  const nn = n.clone().normalize();
  s.hard(bone, ringGeo(c, r * 0.8, r * 0.16, nn, 18), mat, col);
  const [u, v] = across(nn);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
    s.hard(bone, spikeGeo(c.clone().addScaledVector(d, r * 0.85), c.clone().addScaledVector(d, r * 1.12), r * 0.13, 4, undefined, 1), mat, col);
  }
  // Spokes and hub.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
    s.hard(bone, tubeGeo([c.clone().addScaledVector(d, -r * 0.75), c.clone().addScaledVector(d, r * 0.75)], () => r * 0.07, 4), mat, col);
  }
  s.hard(bone, ballGeo(c, r * 0.22, 1), mat, col, glow);
}

/** A row of rivets from a to b. */
function rivets(s: Sculpt, bone: string, a: THREE.Vector3, b: THREE.Vector3, n: number, r: number, col: RGB = IRON): void {
  for (let i = 0; i < n; i++) s.hard(bone, ballGeo(lerpV(a, b, n === 1 ? 0.5 : i / (n - 1)), r, 0), 'metal', col);
}

/** A round lens: a brass bezel and a glowing eye inside. */
function lens(s: Sculpt, bone: string, c: THREE.Vector3, r: number, n: THREE.Vector3, glow = 1.6, col: RGB = BRASS): void {
  s.hard(bone, ringGeo(c, r, r * 0.25, n.clone().normalize(), 14), 'metal', col);
  s.eye(bone, c.clone().addScaledVector(n.clone().normalize(), -r * 0.2), r * 0.85, glow);
}

/** A furnace grille: a glowing hollow behind iron bars, facing forward. */
function grille(s: Sculpt, bone: string, c: THREE.Vector3, w: number, h: number, bars: number, col: RGB = DARK, fire: RGB = [1.2, 0.6, 0.25]): void {
  s.ball(bone, c, V(w, h, w * 0.6), { sub: true, k: w * 0.2 });
  s.boil(bone, c.clone().add(V(0, 0, -w * 0.45)), Math.min(w, h) * 0.75, 1, fire);
  for (let i = 0; i < bars; i++) {
    const x = (i / Math.max(1, bars - 1) - 0.5) * w * 1.5;
    s.hard(bone, tubeGeo([c.clone().add(V(x, -h * 0.95, w * 0.15)), c.clone().add(V(x, h * 0.95, w * 0.15))], () => w * 0.07, 4), 'metal', col);
  }
}

/** Mechanical arms: armoured upper and forearm shells, ball joints, a hand of the asked kind. */
function mechArms(s: Sculpt, o: { r: number; mat?: CMat; joint?: CMat; set?: '' | '2'; hand?: 'fist' | 'claw' | 'gauntlet'; handK?: number }): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'skin';
  const jm = o.joint ?? 'alt';
  const r = o.r * H;
  const set = o.set ?? '';
  s.pair((side) => {
    const A = `arm${set}${side}`;
    const F = `fore${set}${side}`;
    const Hd = `hand${set}${side}`;
    if (!s.has(A)) return;
    const a = s.j(A);
    const e = s.j(F);
    const w = s.j(Hd);
    const t = s.j(`${Hd}Tip`);
    s.ball(A, a, r * 1.4, { mat: jm, k: r * 0.2 });
    s.limb(A, lerpV(a, e, 0.12), lerpV(a, e, 0.86), r * 1.1, r * 0.95, { mat, k: r * 0.15 });
    s.ball(F, e, r * 1.05, { mat: jm, k: r * 0.15 });
    s.limb(F, lerpV(e, w, 0.14), lerpV(e, w, 0.92), r * 1.0, r * 1.15, { mat, k: r * 0.15 });
    const k = o.handK ?? 1;
    switch (o.hand ?? 'gauntlet') {
      case 'fist':
        s.box(Hd, lerpV(w, t, 0.45), V(r * 1.25 * k, r * 1.5 * k, r * 1.1 * k), { mat, k: r * 0.2, round: r * 0.35, q: quatAlong(t.clone().sub(w)) });
        break;
      case 'claw':
        s.ball(Hd, lerpV(w, t, 0.3), V(r * 0.9, r * 1.1, r * 0.6), { mat: jm, k: r * 0.2 });
        claws(s, Hd, `${Hd}Tip`, 3, 0.07 * k, 0.012, 'metal', IRON, 0.5);
        break;
      default:
        s.box(Hd, lerpV(w, t, 0.38), V(r * 0.8 * k, r * 1.05 * k, r * 0.55 * k), { mat, k: r * 0.15, round: r * 0.25, q: quatAlong(t.clone().sub(w)) });
        claws(s, Hd, `${Hd}Tip`, 4, 0.05 * k, 0.008, mat, undefined, 0.35);
    }
  });
}

/** Mechanical legs: thigh and shin shells, knee balls, a flat armoured foot. */
function mechLegs(s: Sculpt, o: { r: number; mat?: CMat; joint?: CMat; footW?: number }): void {
  const H = s.rig.height;
  const mat = o.mat ?? 'skin';
  const jm = o.joint ?? 'alt';
  const r = o.r * H;
  s.pair((side) => {
    const l = s.j(`leg${side}`);
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    s.ball(`leg${side}`, l, r * 1.15, { mat: jm, k: r * 0.2 });
    s.limb(`leg${side}`, lerpV(l, k, 0.1), lerpV(l, k, 0.86), r * 1.15, r * 0.95, { mat, k: r * 0.15 });
    s.ball(`shin${side}`, k, r * 0.95, { mat: jm, k: r * 0.15 });
    s.limb(`shin${side}`, lerpV(k, f, 0.12), lerpV(k, f, 0.9), r * 1.0, r * 0.8, { mat, k: r * 0.15 });
    s.ball(`foot${side}`, f, r * 0.7, { mat: jm, k: r * 0.1 });
    foot(s, `foot${side}`, `toe${side}`, o.footW ?? o.r * 1.2, mat);
  });
}

/** A shield on the left forearm, facing out: kite (true) or tower. */
function shield(s: Sculpt, H: number, o: { h: number; w: number; mat?: CMat; col?: RGB; boss?: RGB; tower?: boolean }): void {
  const f = s.j('foreL');
  const w = s.j('handL');
  const dir = w.clone().sub(f).normalize();
  const c = lerpV(f, w, 0.5).add(V(0.045 * H, 0, 0));
  const a = c.clone().addScaledVector(dir, o.h * H * 0.55);
  const b = c.clone().addScaledVector(dir, -o.h * H * 0.45);
  const mat = o.mat ?? 'metal';
  s.hard('foreL', slabGeo(a, b, V(0, 0, 1), o.tower ? o.w * H : o.w * H * 0.35, o.w * H, 0.018 * H, 0.018 * H), mat, o.col);
  s.hard('foreL', ballGeo(c.clone().add(V(0.02 * H, 0, 0)), 0.035 * H, 1).scale(1, 1, 1), mat, o.boss ?? o.col);
}

// ---------------------------------------------------------------------------
// Upright constructs
// ---------------------------------------------------------------------------

interface BotOpt {
  height: number;
  kind?: 'biped' | 'brute' | 'giant';
  rig?: Partial<BipedShape>;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  sculpt: (s: Sculpt, H: number) => void;
  paint?: Partial<Record<CMat, PaintSpec>>;
  lumps?: { amp: number; scale: number };
  style: Partial<MotionStyle>;
  size?: number;
  tier?: CreatureLook['tier'];
}

function botLook(c: LookCtx, o: BotOpt): CreatureLook {
  const H = o.height;
  const kind = o.kind ?? 'biped';
  const glow = c.visual.glow ?? 0xffaa44;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? (kind === 'giant' ? 'big' : 'normal'),
    rig: () => bipedRig(kind, { height: H, hip: 0.5, hunch: 0.05, ...o.rig }),
    sculpt: (s) => {
      // Plates do not bend like flesh.
      s.soft.skin = 0.008;
      s.soft.alt = 0.02;
      s.k = 0.012;
      o.sculpt(s, H);
      s.paint.skin = o.paint?.skin ?? { grime: 0.5, ao: 0.85, mottle: { scale: 8, amount: 0.35, col: [0.62, 0.45, 0.32] }, top: { amount: 0.12, col: [1.15, 1.12, 1.05] } };
      s.paint.alt = o.paint?.alt ?? { grime: 0.5, ao: 0.85, mottle: { scale: 6, amount: 0.3, col: [0.5, 0.4, 0.32] } };
      s.paint.metal = o.paint?.metal ?? { grime: 0.35, ao: 0.7, mottle: { scale: 9, amount: 0.3, col: [0.6, 0.45, 0.3] } };
      if (o.lumps) s.lumps.skin = o.lumps;
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow },
      alt: { surface: o.alt?.surface ?? 'iron', tint: o.alt?.tint ?? 0x3a3a3e, glow },
      metal: { surface: o.metal?.surface ?? 'brass', tint: o.metal?.tint ?? 0xb08a4a, glow },
    },
    style: {
      heavy: kind === 'giant' ? 0.85 : 0.3,
      spawn: 'assemble',
      death: kind === 'giant' ? 'crash' : 'scatter',
      idle: 'still',
      gait: kind === 'giant' ? 'lumber' : 'march',
      ...o.style,
    },
  };
}

function armour(s: Sculpt, H: number): void {
  // An empty suit: plate over darkness, a cold light behind the visor.
  trunk(s, { mat: 'alt', chest: [0.085, 0.06, 0.09], pelvis: [0.07, 0.055, 0.05] });
  cuirass(s, { mat: 'skin', w: 0.118, d: 0.085, belly: true });
  s.pair((side) => pauldron(s, side, 0.062, 'skin', 0, undefined));
  s.pair((side) => {
    // Couters and poleyns: fan plates over the joints.
    s.ball(`fore${side}`, s.j(`fore${side}`), V(0.034 * H, 0.03 * H, 0.03 * H), { mat: 'metal', k: 0.004 * H });
    s.ball(`shin${side}`, s.j(`shin${side}`).add(V(0, 0, 0.02 * H)), V(0.04 * H, 0.035 * H, 0.03 * H), { mat: 'metal', k: 0.004 * H });
  });
  mechArms(s, { r: 0.028, mat: 'skin', joint: 'alt', hand: 'gauntlet' });
  mechLegs(s, { r: 0.042, mat: 'skin', joint: 'alt', footW: 0.045 });
  skirt(s, { len: 0.32, flare: 0.04, top: 0.02, thick: 0.012, mat: 'skin' });
  // A gorget, and the dark inside showing at the neck.
  s.hard('chest', ringGeo(s.j('neck').add(V(0, -0.01 * H, 0)), 0.055 * H, 0.014 * H, V(0, 1, 0), 14), 'metal', BRASS);
  s.boil('neck', s.j('neck').add(V(0, 0.01 * H, 0)), 0.03 * H, 0.35, [0.5, 0.7, 1.2]);
  helm(s, { mat: 'skin', crest: 1.2, visor: true, eyes: 1.6 });
  // Brass trim down the breastplate.
  rivets(s, 'chest', s.j('chest').add(V(0.09 * H, 0.08 * H, 0.06 * H)), s.j('chest').add(V(-0.09 * H, 0.08 * H, 0.06 * H)), 7, 0.007 * H, BRASS);
  weapon(s, 'sword', { steel: [0.7, 0.72, 0.76], size: 1.1 });
  shield(s, H, { h: 0.38, w: 0.13, mat: 'skin', boss: BRASS });
}

function sentry(s: Sculpt, H: number): void {
  // A brass barrel of a body on piston legs, one great lens for a face.
  const ch = s.j('chest');
  s.limb('chest', ch.clone().add(V(0, 0.08 * H, 0)), s.j('spine').add(V(0, -0.02 * H, 0)), 0.1 * H, 0.085 * H, { k: 0.01 * H });
  s.ball('hips', s.j('hips').add(V(0, 0.02 * H, 0)), V(0.08 * H, 0.05 * H, 0.065 * H), { mat: 'alt', k: 0.01 * H });
  for (let i = 0; i < 3; i++) s.hard('chest', ringGeo(ch.clone().add(V(0, 0.07 * H - i * 0.07 * H, 0)), 0.1 * H - i * 0.004 * H, 0.008 * H, V(0, 1, 0), 18), 'metal', COPPER);
  gear(s, 'chest', ch.clone().add(V(0, 0.0, 0.1 * H)), 0.05 * H, V(0, 0, 1), 10, BRASS, 'metal', 0.8);
  // The winding key on its back.
  const k0 = ch.clone().add(V(0, 0.02 * H, -0.09 * H));
  const k1 = k0.clone().add(V(0, 0, -0.08 * H));
  s.hard('chest', tubeGeo([k0, k1], () => 0.01 * H, 5), 'metal', BRASS);
  s.pair((_side, x) => s.hard('chest', ringGeo(k1.clone().add(V(x * 0.035 * H, 0, 0)), 0.03 * H, 0.008 * H, V(0, 0, 1), 10), 'metal', BRASS));
  // Head: a domed housing round a single lens.
  const h = s.j('head').add(V(0, 0.04 * H, 0.01 * H));
  s.limb('neck', s.j('neck'), s.j('head'), 0.02 * H, 0.02 * H, { mat: 'alt', k: 0.004 * H });
  s.ball('head', h, V(0.065 * H, 0.06 * H, 0.065 * H), { k: 0.006 * H });
  lens(s, 'head', h.clone().add(V(0, 0, 0.06 * H)), 0.035 * H, V(0, 0, 1), 1.8);
  s.hard('head', spikeGeo(h.clone().add(V(0, 0.055 * H, -0.01 * H)), h.clone().add(V(0, 0.12 * H, -0.03 * H)), 0.006 * H, 4, undefined, 2), 'metal', COPPER);
  s.boil('head', h.clone().add(V(0, 0.125 * H, -0.032 * H)), 0.01 * H, 1, [1.1, 0.9, 0.4]);
  mechArms(s, { r: 0.022, mat: 'alt', joint: 'metal', hand: 'claw', handK: 0.9 });
  mechLegs(s, { r: 0.03, mat: 'alt', joint: 'metal', footW: 0.04 });
  // Brass shells over the shins and upper arms.
  s.pair((side) => {
    s.limb(`shin${side}`, lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.15), lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.7), 0.038 * H, 0.03 * H, { k: 0.004 * H });
    s.limb(`arm${side}`, lerpV(s.j(`arm${side}`), s.j(`fore${side}`), 0.1), lerpV(s.j(`arm${side}`), s.j(`fore${side}`), 0.7), 0.03 * H, 0.026 * H, { k: 0.004 * H });
  });
  weapon(s, 'crossbow', { steel: BRASS, size: 1.1 });
}

function smith(s: Sculpt, H: number): void {
  // A squat iron smith with a furnace for a belly and a chimney on its back.
  trunk(s, { chest: [0.13, 0.095, 0.11], pelvis: [0.1, 0.08, 0.07], belly: 0.09, shoulders: 0.05 });
  grille(s, 'spine', s.j('spine').add(V(0, 0.0, 0.14 * H)), 0.05 * H, 0.04 * H, 4);
  const ch = s.j('chest');
  const b = ch.clone().add(V(0.05 * H, 0.04 * H, -0.1 * H));
  const t = b.clone().add(V(0.01 * H, 0.32 * H, -0.04 * H));
  s.hard('chest', tubeGeo([b, t], (u) => (0.032 - 0.004 * u) * H, 8), 'alt', [0.3, 0.27, 0.25]);
  s.hard('chest', ringGeo(t, 0.03 * H, 0.008 * H, V(0, 1, 0), 10), 'metal', IRON);
  s.boil('chest', t.clone().add(V(0, -0.01 * H, 0)), 0.022 * H, 1, [1.2, 0.6, 0.2]);
  // A heavy riveted head with a burning slit.
  helm(s, { mat: 'skin', visor: true, eyes: 1.6, size: 1.05 });
  rivets(s, 'head', s.j('head').add(V(-0.05 * H, 0.1 * H, 0.04 * H)), s.j('head').add(V(0.05 * H, 0.1 * H, 0.04 * H)), 5, 0.006 * H);
  mechArms(s, { r: 0.034, mat: 'skin', joint: 'alt', hand: 'gauntlet', handK: 1.1 });
  mechArms(s, { r: 0.026, mat: 'skin', joint: 'alt', hand: 'claw', set: '2' });
  mechLegs(s, { r: 0.048, mat: 'skin', joint: 'alt', footW: 0.055 });
  s.pair((side) => pauldron(s, side, 0.06, 'skin', 0));
  // A leather apron.
  skirt(s, { len: 0.75, flare: 0.03, top: 0.02, thick: 0.01, mat: 'metal', back: false, sides: false });
  weapon(s, 'hammer', { steel: IRON, size: 0.9 });
  // Tongs in the lower left hand, a lit bomb in the lower right.
  const hl = s.j('hand2L');
  const hlT = s.j('hand2LTip');
  const d = hlT.clone().sub(hl).normalize();
  s.pair((_side, x) => s.hard('hand2L', tubeGeo([lerpV(hl, hlT, 0.6), lerpV(hl, hlT, 0.6).addScaledVector(d, 0.2 * H).add(V(x * 0.01 * H, 0, 0.04 * H))], () => 0.006 * H, 4), 'alt', IRON));
  const hr = lerpV(s.j('hand2R'), s.j('hand2RTip'), 0.75);
  s.hard('hand2R', ballGeo(hr, 0.03 * H, 1), 'alt', DARK);
  s.boil('hand2R', hr.clone().add(V(0, 0.035 * H, 0)), 0.008 * H, 1, [1.2, 0.7, 0.3]);
}

function golem(s: Sculpt, H: number): void {
  // Riveted iron: a barrel chest, great pauldrons, a head sunk between them.
  trunk(s, { chest: [0.16, 0.12, 0.12], pelvis: [0.11, 0.085, 0.07], shoulders: 0.07, hump: 0.06 });
  s.pair((side) => pauldron(s, side, 0.09, 'skin', 0));
  grille(s, 'chest', s.j('chest').add(V(0, -0.01 * H, 0.165 * H)), 0.06 * H, 0.045 * H, 5);
  const ch = s.j('chest');
  for (let i = 0; i < 3; i++) rivets(s, 'chest', ch.clone().add(V(-0.15 * H, 0.09 * H - i * 0.07 * H, 0.1 * H)), ch.clone().add(V(0.15 * H, 0.09 * H - i * 0.07 * H, 0.1 * H)), 9, 0.008 * H);
  const h = s.j('head').add(V(0, 0.03 * H, 0.02 * H));
  s.box('head', h, V(0.06 * H, 0.05 * H, 0.06 * H), { k: 0.006 * H, round: 0.015 * H });
  s.box('head', h.clone().add(V(0, 0.015 * H, 0.055 * H)), V(0.05 * H, 0.008 * H, 0.012 * H), { sub: true, k: 0.003 * H });
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.022 * H, 0.015 * H, 0.052 * H)), 0.011 * H, 1.8));
  mechArms(s, { r: 0.045, mat: 'skin', joint: 'alt', hand: 'fist', handK: 1.5 });
  mechLegs(s, { r: 0.06, mat: 'skin', joint: 'alt', footW: 0.075 });
  s.pair((side) => {
    const f = s.j(`fore${side}`);
    const w = s.j(`hand${side}`);
    rivets(s, `fore${side}`, lerpV(f, w, 0.2).add(V(0, 0, 0.05 * H)), lerpV(f, w, 0.85).add(V(0, 0, 0.055 * H)), 4, 0.007 * H);
  });
}

function siege(s: Sculpt, H: number): void {
  // A walking engine: a boxy chassis, a ballista arm, a mortar on its back.
  const ch = s.j('chest');
  s.box('chest', ch.clone().add(V(0, 0.0, 0)), V(0.17 * H, 0.13 * H, 0.13 * H), { k: 0.008 * H, round: 0.025 * H });
  s.box('spine', s.j('spine'), V(0.12 * H, 0.08 * H, 0.1 * H), { mat: 'alt', k: 0.01 * H, round: 0.02 * H });
  s.box('hips', s.j('hips').add(V(0, 0.02 * H, 0)), V(0.12 * H, 0.06 * H, 0.09 * H), { k: 0.008 * H, round: 0.02 * H });
  for (let i = 0; i < 2; i++) rivets(s, 'chest', ch.clone().add(V(-0.16 * H, 0.1 * H - i * 0.2 * H, 0.135 * H)), ch.clone().add(V(0.16 * H, 0.1 * H - i * 0.2 * H, 0.135 * H)), 9, 0.008 * H);
  // A turret head with three lenses in a row.
  const h = s.j('head').add(V(0, 0.03 * H, 0.0));
  s.box('head', h, V(0.07 * H, 0.04 * H, 0.06 * H), { k: 0.006 * H, round: 0.012 * H });
  for (let i = -1; i <= 1; i++) lens(s, 'head', h.clone().add(V(i * 0.035 * H, 0.0, 0.062 * H)), 0.014 * H, V(0, 0, 1), 1.8, IRON);
  // Mortar on the back, its mouth glowing.
  const m0 = ch.clone().add(V(-0.06 * H, 0.08 * H, -0.12 * H));
  const m1 = m0.clone().add(V(-0.02 * H, 0.2 * H, -0.08 * H));
  s.hard('chest', tubeGeo([m0, m1], (u) => (0.05 + 0.01 * u) * H, 10), 'alt', [0.3, 0.27, 0.25]);
  s.hard('chest', ringGeo(m1, 0.06 * H, 0.012 * H, m1.clone().sub(m0).normalize(), 12), 'metal', IRON);
  s.boil('chest', m1.clone().addScaledVector(m1.clone().sub(m0).normalize(), -0.02 * H), 0.04 * H, 0.9, [1.2, 0.6, 0.2]);
  // An ammunition box on the other shoulder.
  s.hard('chest', boxGeo(ch.clone().add(V(0.1 * H, 0.15 * H, -0.08 * H)), V(0.12 * H, 0.08 * H, 0.1 * H)), 'alt', [0.4, 0.3, 0.2]);
  mechArms(s, { r: 0.04, mat: 'skin', joint: 'alt', hand: 'fist', handK: 1.3 });
  mechLegs(s, { r: 0.06, mat: 'skin', joint: 'alt', footW: 0.08 });
  weapon(s, 'crossbow', { steel: IRON, size: 1.6 });
}

function frame(s: Sculpt, H: number): void {
  // An open frame of girders: a cage of a chest round a burning core.
  ribcage(s, { w: 0.15, d: 0.12, ribs: 5, r: 0.014, mat: 'skin', col: [0.55, 0.55, 0.58] });
  s.boil('chest', s.j('chest').add(V(0, 0, 0.0)), 0.07 * H, 1, [1.2, 0.8, 0.35]);
  s.ball('hips', s.j('hips'), V(0.1 * H, 0.05 * H, 0.07 * H), { mat: 'alt', k: 0.008 * H });
  s.limb('spine', s.j('hips'), s.j('chest'), 0.03 * H, 0.03 * H, { mat: 'alt', k: 0.008 * H });
  s.pair((side) => pauldron(s, side, 0.08, 'skin', 2, [0.5, 0.5, 0.52]));
  // Girder limbs: a pair of rails per segment with cross ties, pistons along them.
  const girder = (bone: string, a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a).normalize();
    const [u] = across(d);
    for (const sx of [1, -1]) s.hard(bone, tubeGeo([a.clone().addScaledVector(u, r * sx), b.clone().addScaledVector(u, r * sx)], () => r * 0.35, 5), 'skin');
    for (let i = 0; i <= 4; i++) {
      const p = lerpV(a, b, i / 4);
      s.hard(bone, tubeGeo([p.clone().addScaledVector(u, -r), p.clone().addScaledVector(u, r).addScaledVector(d, r * 0.8)], () => r * 0.2, 4), 'skin');
    }
    s.hard(bone, tubeGeo([lerpV(a, b, 0.1).add(V(0, 0, r * 1.2)), lerpV(a, b, 0.75).add(V(0, 0, r * 1.2))], () => r * 0.3, 6), 'metal', BRASS);
  };
  s.pair((side) => {
    for (const [p, q, rr] of [[`arm${side}`, `fore${side}`, 0.035], [`fore${side}`, `hand${side}`, 0.032], [`leg${side}`, `shin${side}`, 0.045], [`shin${side}`, `foot${side}`, 0.04]] as const) {
      s.ball(p, s.j(p), rr * 1.3 * H, { mat: 'alt', k: 0.006 * H });
      girder(p, s.j(p), s.j(q), rr * H);
    }
    s.ball(`foot${side}`, s.j(`foot${side}`), 0.04 * H, { mat: 'alt', k: 0.006 * H });
    foot(s, `foot${side}`, `toe${side}`, 0.07, 'skin');
    s.ball(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.3), V(0.04 * H, 0.05 * H, 0.03 * H), { mat: 'alt', k: 0.006 * H });
    claws(s, `hand${side}`, `hand${side}Tip`, 3, 0.11, 0.014, 'skin', [0.5, 0.5, 0.52], 0.6);
  });
  // A bar of a head with four lenses.
  const h = s.j('head').add(V(0, 0.03 * H, 0.0));
  s.box('head', h, V(0.09 * H, 0.03 * H, 0.04 * H), { k: 0.004 * H, round: 0.01 * H });
  for (const x of [-0.06, -0.02, 0.02, 0.06]) lens(s, 'head', h.clone().add(V(x * H, 0, 0.042 * H)), 0.013 * H, V(0, 0, 1), 1.8, IRON);
  s.limb('neck', s.j('neck'), s.j('head'), 0.025 * H, 0.025 * H, { mat: 'alt', k: 0.004 * H });
}

function quicksilver(s: Sculpt, H: number): void {
  // Liquid metal poured into the shape of a man: smooth, faceless, one arm a blade.
  s.soft.skin = 0.04;
  trunk(s, { chest: [0.1, 0.065, 0.11], pelvis: [0.07, 0.055, 0.06], shoulders: 0.035 });
  s.limb('spine', s.j('hips'), s.j('chest'), 0.06 * H, 0.07 * H, { k: 0.03 * H });
  s.pair((side) => {
    s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.03 * H, 0.024 * H, { k: 0.02 * H });
    s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.024 * H, 0.018 * H, { k: 0.02 * H });
    s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.045 * H, 0.03 * H, { k: 0.02 * H });
    s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.03 * H, 0.02 * H, { k: 0.02 * H });
    s.limb(`foot${side}`, s.j(`foot${side}`), s.j(`toe${side}`), 0.022 * H, 0.012 * H, { k: 0.015 * H });
  });
  s.limb('neck', s.j('neck'), s.j('head'), 0.028 * H, 0.025 * H, { k: 0.02 * H });
  s.ball('head', s.j('head').add(V(0, 0.045 * H, 0.012 * H)), V(0.05 * H, 0.068 * H, 0.06 * H), { k: 0.02 * H });
  // The right forearm runs out into a long blade.
  const f = s.j('foreR');
  const w = s.j('handR');
  const d = w.clone().sub(f).normalize();
  s.hard('foreR', bladeGeo(lerpV(f, w, 0.4), w.clone().addScaledVector(d, 0.38 * H), 0.035 * H, 0.008 * H, V(0, -1, 0.3).normalize(), 0.3), 'skin');
  // Left hand: drawn out into points.
  s.ball('handL', lerpV(s.j('handL'), s.j('handLTip'), 0.3), V(0.02 * H, 0.03 * H, 0.012 * H), { k: 0.01 * H });
  claws(s, 'handL', 'handLTip', 4, 0.07, 0.008, 'skin', undefined, 0.3);
  // Drips running off it: the chest, the hips, the arms, the jaw.
  const r = seq(41);
  const dripFrom = ['chest', 'hips', 'chest', 'hips', 'foreL', 'foreR', 'armL', 'armR', 'head', 'chest', 'hips', 'spine'];
  for (let i = 0; i < dripFrom.length; i++) {
    const bone = dripFrom[i]!;
    const spread = bone === 'head' ? 0.04 : bone.startsWith('fore') || bone.startsWith('arm') ? 0.03 : 0.14;
    const p = s.j(bone).add(V((r() - 0.5) * spread * H, (bone === 'head' ? 0.0 : -0.05) * H, (r() - 0.2) * spread * 0.7 * H));
    s.hard(bone, spikeGeo(p, p.clone().add(V(0, -(0.04 + r() * 0.08) * H, 0)), (0.008 + r() * 0.006) * H, 5, undefined, 2), 'skin');
  }
  // Beads of metal standing up out of the shoulders and back, as if it is
  // still settling into shape.
  for (let i = 0; i < 9; i++) {
    const p = s.j('chest').add(V((r() - 0.5) * 0.22 * H, (0.02 + r() * 0.06) * H, -(0.02 + r() * 0.06) * H));
    s.ball('chest', p, (0.012 + r() * 0.014) * H, { k: 0.012 * H });
  }
  // Shallow eye pits with a cold light in them, so it has a face to read.
  const h = s.j('head').add(V(0, 0.05 * H, 0.012 * H));
  s.pair((_side, x) => {
    s.ball('head', h.clone().add(V(x * 0.02 * H, 0.004 * H, 0.055 * H)), V(0.014 * H, 0.008 * H, 0.012 * H), { sub: true, k: 0.006 * H });
    s.eye('head', h.clone().add(V(x * 0.02 * H, 0.004 * H, 0.048 * H)), 0.006 * H, 1.4);
  });
  // It pools where it stands.
  s.pair((side) => {
    const f = s.j(`foot${side}`);
    s.ball(`foot${side}`, V(f.x, 0.008 * H, f.z + 0.02 * H), V(0.06 * H, 0.008 * H, 0.07 * H), { k: 0.012 * H });
  });
}

function obsidian(s: Sculpt, H: number): void {
  // Black glass over a molten core: shards on the shoulders, a tower shield.
  trunk(s, { chest: [0.155, 0.11, 0.12], pelvis: [0.1, 0.085, 0.07], shoulders: 0.065 });
  mechArms(s, { r: 0.042, mat: 'skin', joint: 'alt', hand: 'fist', handK: 1.4 });
  mechLegs(s, { r: 0.058, mat: 'skin', joint: 'alt', footW: 0.075 });
  const r = seq(19);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    for (let i = 0; i < 4; i++) {
      const b = a.clone().add(V(x * (0.01 + r() * 0.04) * H, 0.04 * H, (r() - 0.5) * 0.1 * H));
      s.hard(`arm${side}`, spikeGeo(b, b.clone().add(V(x * (0.02 + r() * 0.04) * H, (0.08 + r() * 0.1) * H, (r() - 0.6) * 0.06 * H)), (0.02 + r() * 0.015) * H, 5, undefined, 1), 'skin', [0.14, 0.12, 0.14]);
    }
  });
  for (let i = 0; i < 5; i++) {
    const p = s.j('chest').add(V((r() - 0.5) * 0.18 * H, (0.02 + r() * 0.08) * H, -0.11 * H));
    s.hard('chest', spikeGeo(p, p.clone().add(V((r() - 0.5) * 0.06 * H, (0.1 + r() * 0.1) * H, -0.08 * H)), 0.025 * H, 5, undefined, 1), 'skin', [0.14, 0.12, 0.14]);
  }
  // Head: a faceted wedge, four eyes in a T.
  const h = s.j('head').add(V(0, 0.035 * H, 0.02 * H));
  s.box('head', h, V(0.055 * H, 0.055 * H, 0.06 * H), { k: 0.004 * H, round: 0.008 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)) });
  for (const [x, y] of [[-0.022, 0.012], [0.022, 0.012], [0, 0.012], [0, -0.012]] as const) s.eye('head', h.clone().add(V(x * H, y * H, 0.075 * H)), 0.009 * H, 1.8);
  s.boil('chest', s.j('chest').add(V(0, 0, 0.12 * H)), 0.04 * H, 0.9, [1.3, 0.6, 0.2]);
  shield(s, H, { h: 0.55, w: 0.2, mat: 'skin', boss: [1.0, 0.5, 0.2], tower: true });
}

// ---------------------------------------------------------------------------
// Floating constructs
// ---------------------------------------------------------------------------

function floatLook(c: LookCtx, o: { hover: number; radius: number; orbs: number; sculpt: (s: Sculpt, R: number) => void; skin: { surface: Surface; tint: number }; alt?: { surface: Surface; tint: number }; metal?: { surface: Surface; tint: number }; style: Partial<MotionStyle>; size?: number; tier?: CreatureLook['tier'] }): CreatureLook {
  const glow = c.visual.glow ?? 0x66ffee;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? 'normal',
    rig: () => floaterRig({ hover: o.hover, radius: o.radius, orbs: o.orbs }),
    sculpt: (s) => {
      s.soft.skin = 0.006;
      s.soft.alt = 0.01;
      s.k = 0.01;
      o.sculpt(s, o.radius);
      s.paint.skin = { grime: 0.45, ao: 0.85, mottle: { scale: 7, amount: 0.35, col: [0.6, 0.55, 0.48] }, top: { amount: 0.15, col: [1.15, 1.12, 1.05] } };
      s.paint.alt = { grime: 0.4, ao: 0.8 };
      s.paint.metal = { grime: 0.3, ao: 0.7 };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow },
      alt: { surface: o.alt?.surface ?? 'iron', tint: o.alt?.tint ?? 0x3a3a3e, glow },
      metal: { surface: o.metal?.surface ?? 'brass', tint: o.metal?.tint ?? 0xb08a4a, glow },
    },
    style: { heavy: 0.3, attacks: ['lash'], ranged: true, castBoth: true, spawn: 'form', death: 'collapse', idle: 'hover', gait: 'glide', armed: 'none', ...o.style },
  };
}

/** Floating orbs of lightning, each in a little copper cage. */
function stormOrbs(s: Sculpt, R: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const b = `orb${i}`;
    const p = s.j(b);
    s.boil(b, p, R * 0.18, 1, [1.2, 1.1, 0.6]);
    s.hard(b, ringGeo(p, R * 0.24, R * 0.03, V(0, 1, 0), 10), 'metal', COPPER);
    s.hard(b, ringGeo(p, R * 0.24, R * 0.03, V(1, 0, 0), 10), 'metal', COPPER);
  }
}

// ---------------------------------------------------------------------------

const CONSTRUCT: Record<string, LookFactory> = {
  scarab_drone: (c) =>
    bugLook(c, {
      kind: 'insect',
      body: 0.24,
      ride: 0.24,
      abdomen: 0.7,
      reach: 1.5,
      size: 1.3,
      surface: 'brass',
      tint: 0xc09a4a,
      alt: { surface: 'iron', tint: 0x3e3c3a },
      metal: { surface: 'steel', tint: 0xa0a4aa },
      sculpt: (s, B) => {
        carapace(s, { r: B * 0.95, elytra: 1.1, ridge: 1 });
        // A gear turning under a split in the wing cases.
        const a = s.j('abdomen');
        gear(s, 'abdomen', a.clone().add(V(0, B * 0.95, -B * 0.1)), B * 0.32, V(0, 1, 0), 9, BRASS, 'metal', 0.5);
        bugHead(s, { w: B * 0.5, glow: 1.6, eyeR: 0.3, antennae: 0.8, mand: 0.8, mat: 'skin', mandCol: [0.4, 0.4, 0.42] });
        bugLegs(s, { r: B * 0.1, mat: 'alt' });
      },
      paint: { grime: 0.4, ao: 0.85, mottle: { scale: 9, amount: 0.35, col: [0.5, 0.45, 0.3] }, top: { amount: 0.2, col: [1.2, 1.15, 1.0] } },
      style: { heavy: 0.1, attacks: ['bite'], idle: 'twitch', gait: 'scuttle', stride: 2.4, spawn: 'emerge', death: 'flip' },
    }),
  animated_armor: (c) =>
    botLook(c, {
      height: 1.9,
      rig: { shoulders: 0.14, hips: 0.065, arms: 1.02 },
      skin: { surface: 'iron', tint: 0x8b8f96 },
      alt: { surface: 'cloth', tint: 0x14161c },
      metal: { surface: 'brass', tint: 0xb08a4a },
      sculpt: armour,
      style: { heavy: 0.4, attacks: ['chop', 'swing', 'thrust'], armed: 'one', idle: 'still', gait: 'march', spawn: 'assemble', death: 'scatter' },
    }),
  clockwork_sentry: (c) =>
    botLook(c, {
      height: 1.75,
      rig: { shoulders: 0.13, hips: 0.06, arms: 1.0 },
      skin: { surface: 'brass', tint: 0xc09a4a },
      alt: { surface: 'iron', tint: 0x3e3c3a },
      metal: { surface: 'brass', tint: 0xb8743a },
      sculpt: sentry,
      style: { heavy: 0.25, attacks: ['shoot'], ranged: true, armed: 'crossbow', idle: 'twitch', gait: 'march' },
    }),
  arc_pylon: (c) =>
    floatLook(c, {
      hover: 1.25,
      radius: 0.28,
      orbs: 3,
      skin: { surface: 'steel', tint: 0xc4ccd8 },
      metal: { surface: 'brass', tint: 0xb8743a },
      sculpt: (s, R) => {
        // A coil tower: stacked copper windings round a steel core, a crown spike, a lens.
        const c0 = s.j('core');
        s.limb('core', c0.clone().add(V(0, -R * 1.6, 0)), c0.clone().add(V(0, R * 0.9, 0)), R * 0.32, R * 0.22, { k: R * 0.05 });
        for (let i = 0; i < 6; i++) s.hard('core', ringGeo(c0.clone().add(V(0, -R * 1.2 + i * R * 0.38, 0)), R * (0.55 - i * 0.03), R * 0.08, V(0, 1, 0), 16), 'metal', COPPER);
        s.box('core', c0.clone().add(V(0, -R * 1.75, 0)), V(R * 0.6, R * 0.1, R * 0.6), { k: R * 0.04, round: R * 0.05 });
        const cr = s.j('crown');
        s.hard('crown', spikeGeo(cr, cr.clone().add(V(0, R * 1.3, 0)), R * 0.14, 6, undefined, 2), 'skin');
        s.hard('crown', ringGeo(cr.clone().add(V(0, R * 0.5, 0)), R * 0.35, R * 0.06, V(0, 1, 0), 14), 'metal', COPPER);
        s.boil('crown', cr.clone().add(V(0, R * 1.35, 0)), R * 0.14, 1, [1.2, 1.1, 0.6]);
        lens(s, 'eye', s.j('eye').add(V(0, 0, R * 0.05)), R * 0.2, V(0, 0, 1), 1.6, COPPER);
        stormOrbs(s, R, 3);
      },
      style: { heavy: 0.25, attacks: ['lash'], idle: 'hover', spawn: 'assemble', death: 'collapse' },
    }),
  iron_golem: (c) =>
    botLook(c, {
      height: 1.75,
      kind: 'giant',
      rig: { hip: 0.42, shoulders: 0.22, hips: 0.09, arms: 1.3, hunch: 0.4, head: 0.75, armOut: 0.42 },
      skin: { surface: 'iron', tint: 0x8b8f96 },
      alt: { surface: 'rust', tint: 0x5a4a40 },
      sculpt: golem,
      style: { heavy: 0.85, attacks: ['slam', 'swing', 'stomp'], armed: 'none', idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
    }),
  forge_smith: (c) =>
    botLook(c, {
      height: 1.8,
      rig: { hip: 0.46, shoulders: 0.15, hips: 0.075, arms: 1.1, hunch: 0.25, arms2: true },
      skin: { surface: 'rust', tint: 0x8a5a34 },
      alt: { surface: 'iron', tint: 0x3a3634 },
      metal: { surface: 'leather', tint: 0x4a3222 },
      sculpt: smith,
      style: { heavy: 0.45, attacks: ['chop', 'hurl'], armed: 'one', castBoth: true, idle: 'breathe', gait: 'march', death: 'crash' },
    }),
  brass_stalker: (c) =>
    bugLook(c, {
      kind: 'spider',
      body: 0.3,
      ride: 0.42,
      abdomen: 1.1,
      reach: 2.3,
      size: 1.15,
      surface: 'brass',
      tint: 0xc09a4a,
      alt: { surface: 'iron', tint: 0x3a3836 },
      metal: { surface: 'steel', tint: 0xa0a4aa },
      sculpt: (s, B) => {
        const b = s.j('body');
        s.ball('body', b, V(B * 0.7, B * 0.42, B * 0.85), { k: B * 0.05 });
        rivets(s, 'body', b.clone().add(V(-B * 0.5, B * 0.35, 0)), b.clone().add(V(B * 0.5, B * 0.35, 0)), 6, B * 0.04);
        // The abdomen is a drum of gears round a glowing mainspring.
        const a = s.j('abdomen');
        const t = s.j('abdomenTip');
        const m = lerpV(a, t, 0.45).add(V(0, B * 0.2, 0));
        s.limb('abdomen', b.clone().add(V(0, 0, -B * 0.6)), a, B * 0.2, B * 0.2, { mat: 'alt', k: B * 0.05 });
        s.ball('abdomen', m, V(B * 0.85, B * 0.75, B * 1.05), { k: B * 0.05 });
        s.pair((_side, x) => gear(s, 'abdomen', m.clone().add(V(x * B * 0.85, 0, 0)), B * 0.45, V(1, 0, 0), 10, BRASS, 'metal', 0.4));
        s.boil('abdomen', m.clone().add(V(0, B * 0.7, 0)), B * 0.16, 1, [0.6, 1.2, 1.0]);
        const h = s.j('head');
        s.ball('head', h, V(B * 0.38, B * 0.3, B * 0.36), { k: B * 0.04 });
        s.pair((_side, x) => {
          lens(s, 'head', h.clone().add(V(x * B * 0.13, B * 0.12, B * 0.33)), B * 0.08, V(x * 0.3, 0.2, 1), 1.8);
          lens(s, 'head', h.clone().add(V(x * B * 0.26, B * 0.2, B * 0.2)), B * 0.05, V(x, 0.3, 0.6), 1.6);
        });
        s.pair((side) => s.hard(`mand${side}`, bladeGeo(s.j(`mand${side}`), s.j(`mand${side}Tip`), B * 0.08, B * 0.02, V(0, -1, 0), 0.4), 'metal'));
        bugLegs(s, { r: B * 0.085, mat: 'alt' });
        // Blade edges down each leg.
        for (let i = 0; i < 4; i++) {
          s.pair((side) => {
            const k = s.j(`knee${i}${side}`);
            const f = s.j(`foot${i}${side}`);
            s.hard(`knee${i}${side}`, bladeGeo(lerpV(k, f, 0.1), lerpV(k, f, 0.95), B * 0.06, B * 0.012, V(0, 0, 1), 0.4), 'skin');
          });
        }
      },
      paint: { grime: 0.4, ao: 0.85, mottle: { scale: 9, amount: 0.35, col: [0.5, 0.45, 0.3] }, top: { amount: 0.2, col: [1.2, 1.15, 1.0] } },
      style: { heavy: 0.15, attacks: ['bite', 'lunge', 'claw'], idle: 'still', gait: 'scuttle', spawn: 'drop', death: 'flip' },
    }),
  siege_automaton: (c) =>
    botLook(c, {
      height: 1.65,
      kind: 'giant',
      rig: { hip: 0.42, shoulders: 0.22, hips: 0.1, arms: 1.15, hunch: 0.2, head: 0.7, armOut: 0.38 },
      skin: { surface: 'rust', tint: 0x8a5a34 },
      alt: { surface: 'iron', tint: 0x3a3634 },
      sculpt: siege,
      style: { heavy: 0.75, attacks: ['shoot'], ranged: true, armed: 'crossbow', idle: 'still', gait: 'lumber', spawn: 'assemble', death: 'crash' },
    }),
  rune_guardian: (c) =>
    floatLook(c, {
      hover: 1.35,
      radius: 0.34,
      orbs: 4,
      skin: { surface: 'stone', tint: 0x8c8577 },
      alt: { surface: 'stone', tint: 0x5c574f },
      metal: { surface: 'gold', tint: 0xb89a5a },
      sculpt: (s, R) => {
        // A carved stone mask with a burning brow, a halo of rune-stones round it.
        const c0 = s.j('core');
        s.box('core', c0, V(R * 0.75, R * 0.95, R * 0.45), { k: R * 0.05, round: R * 0.12 });
        s.box('core', c0.clone().add(V(0, R * 0.3, R * 0.42)), V(R * 0.7, R * 0.1, R * 0.12), { k: R * 0.04, round: R * 0.05 });
        s.box('core', c0.clone().add(V(0, -R * 0.15, R * 0.45)), V(R * 0.14, R * 0.3, R * 0.12), { k: R * 0.04, round: R * 0.05 });
        s.box('core', c0.clone().add(V(0, -R * 0.62, R * 0.38)), V(R * 0.4, R * 0.05, R * 0.12), { sub: true, k: R * 0.02 });
        // A heavy chin and cheek flanges so it reads as a carved head, not a
        // crate; a broken crest of stone horns above the brow.
        s.box('core', c0.clone().add(V(0, -R * 0.88, R * 0.12)), V(R * 0.48, R * 0.22, R * 0.34), { k: R * 0.06, round: R * 0.08 });
        s.pair((_side, x) => {
          const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), x * 0.35);
          s.box('core', c0.clone().add(V(x * R * 0.78, -R * 0.1, R * 0.05)), V(R * 0.12, R * 0.62, R * 0.36), { mat: 'alt', k: R * 0.05, round: R * 0.05, q });
        });
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * R * 0.42;
          const b = c0.clone().add(V(x, R * 0.82, -R * 0.05));
          s.hard('core', spikeGeo(b, b.clone().add(V(x * 0.7, R * (i === 1 ? 0.75 : 0.5), -R * 0.25)), R * (i === 1 ? 0.16 : 0.12), 4, undefined, 1), 'alt');
        }
        s.pair((_side, x) => {
          s.ball('core', c0.clone().add(V(x * R * 0.32, R * 0.12, R * 0.45)), V(R * 0.16, R * 0.11, R * 0.12), { sub: true, k: R * 0.03 });
          s.eye('core', c0.clone().add(V(x * R * 0.32, R * 0.12, R * 0.36)), R * 0.09, 1.8);
        });
        // Rune lines glowing down the cheeks and brow.
        for (let i = 0; i < 5; i++) s.hard('core', boxGeo(c0.clone().add(V((i - 2) * R * 0.14, R * 0.62, R * 0.44)), V(R * 0.05, R * 0.14, R * 0.03)), 'metal', [0.5, 1.1, 1.0], 0.9);
        const cr = s.j('crown');
        s.hard('crown', ringGeo(cr.clone().add(V(0, R * 0.25, -R * 0.2)), R * 1.05, R * 0.07, V(0, 0.3, 1).normalize(), 22), 'metal', [0.72, 0.6, 0.36]);
        for (let i = 0; i < 4; i++) {
          const b = `orb${i}`;
          const p = s.j(b);
          s.box(b, p, V(R * 0.2, R * 0.32, R * 0.07), { mat: 'alt', k: R * 0.02, round: R * 0.03 });
          s.hard(b, boxGeo(p.clone().add(V(0, 0, R * 0.075)), V(R * 0.06, R * 0.36, R * 0.02)), 'metal', [0.5, 1.1, 1.0], 0.9);
        }
      },
      style: { heavy: 0.4, attacks: ['lash'], idle: 'hover', spawn: 'form', death: 'collapse' },
    }),
  arcane_sentry_totem: (c) =>
    floatLook(c, {
      hover: 1.0,
      radius: 0.2,
      orbs: 2,
      skin: { surface: 'stone', tint: 0x8c8577 },
      alt: { surface: 'stone', tint: 0x4a4648 },
      sculpt: (s, R) => {
        // A floating obelisk with one violet eye, two shards circling it.
        const c0 = s.j('core');
        s.box('core', c0.clone().add(V(0, -R * 0.3, 0)), V(R * 0.45, R * 1.5, R * 0.45), { k: R * 0.04, round: R * 0.08 });
        s.hard('crown', spikeGeo(s.j('crown').add(V(0, R * 0.3, 0)), s.j('crown').add(V(0, R * 1.3, 0)), R * 0.5, 4, undefined, 1), 'skin');
        s.ball('core', c0.clone().add(V(0, R * 0.2, R * 0.45)), R * 0.2, { sub: true, k: R * 0.03 });
        s.eye('core', c0.clone().add(V(0, R * 0.2, R * 0.38)), R * 0.16, 1.8);
        for (let i = 0; i < 3; i++) s.hard('core', boxGeo(c0.clone().add(V(0, -R * 0.5 - i * R * 0.35, R * 0.46)), V(R * 0.18, R * 0.06, R * 0.02)), 'metal', [1.0, 0.6, 1.3], 0.9);
        for (let i = 0; i < 2; i++) s.hard(`orb${i}`, spikeGeo(s.j(`orb${i}`).add(V(0, -R * 0.3, 0)), s.j(`orb${i}`).add(V(0, R * 0.35, 0)), R * 0.15, 4, undefined, 1), 'alt', undefined, 0.3);
      },
      style: { heavy: 0.3, attacks: ['lash'], idle: 'hover', spawn: 'form', death: 'collapse' },
    }),
  colossus_frame: (c) =>
    botLook(c, {
      height: 1.8,
      kind: 'giant',
      rig: { hip: 0.46, shoulders: 0.21, hips: 0.09, arms: 1.35, hunch: 0.3, head: 0.7, armOut: 0.4 },
      skin: { surface: 'iron', tint: 0x8b8f96 },
      alt: { surface: 'rust', tint: 0x4a3e36 },
      sculpt: frame,
      style: { heavy: 0.9, attacks: ['slam', 'stomp', 'swing'], armed: 'none', idle: 'still', gait: 'lumber', spawn: 'assemble', death: 'crash' },
    }),
  mercury_construct: (c) =>
    botLook(c, {
      height: 1.9,
      rig: { shoulders: 0.12, hips: 0.06, arms: 1.12, hunch: 0.15 },
      skin: { surface: 'steel', tint: 0xc4ccd8 },
      sculpt: quicksilver,
      paint: { skin: { grime: 0.15, ao: 0.6, top: { amount: 0.2, col: [1.2, 1.2, 1.25] } } },
      style: { heavy: 0.1, attacks: ['swing', 'thrust', 'claw'], armed: 'one', idle: 'sway', gait: 'stalk', spawn: 'form', death: 'fade' },
    }),
  obsidian_warden: (c) =>
    botLook(c, {
      height: 1.8,
      kind: 'giant',
      rig: { hip: 0.43, shoulders: 0.21, hips: 0.09, arms: 1.25, hunch: 0.35, head: 0.7, armOut: 0.4 },
      skin: { surface: 'basalt', tint: 0x2a2428 },
      alt: { surface: 'lava', tint: 0x5a2a18 },
      sculpt: obsidian,
      paint: { skin: { grime: 0.35, ao: 0.85, top: { amount: 0.2, col: [1.3, 1.25, 1.3] }, veins: { scale: 9, cut: 0.965, glow: 0.45, col: [1.6, 0.6, 0.2] } } },
      lumps: { amp: 0.01, scale: 7 },
      style: { heavy: 0.85, attacks: ['slam', 'swing', 'stomp'], armed: 'none', idle: 'still', gait: 'lumber', spawn: 'rise', death: 'crash' },
    }),
};

export { CONSTRUCT, gear, rivets, lens, grille, mechArms, mechLegs, shield, botLook, floatLook };
