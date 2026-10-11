/**
 * SLAY — the undead: skeletons, ghouls, bloats, corpse hounds, wraiths,
 * the grave titan and the lich.
 */
import * as THREE from 'three';
import { bipedRig, quadRig, specterRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { Sculpt } from './Sculpt';
import { ballGeo, spikeGeo, tubeGeo } from './Sculpt';
import { weapon, type WeaponKind } from './Arms';
import {
  V,
  boneLimbs,
  claws,
  cuirass,
  fleshArms,
  fleshHead,
  fleshLegs,
  helm,
  hood,
  lerpV,
  paletteTint,
  pauldron,
  pelvisBone,
  rgb,
  ribcage,
  seq,
  skirt,
  skull,
  trunk,
} from './Kit';
import type { MotionStyle } from './Motion';

const RUST = rgb(0x7a5a44);
const IRON = rgb(0x6a6a70);
const BONE = rgb(0xd8ceb0);

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

interface SkeletonOpt {
  weapon?: WeaponKind;
  /** Brute frame (wardens, knights): broader, heavier bones. */
  brute?: boolean;
  /** 0 bare bones .. 1 full plate. */
  armor?: number;
  robe?: boolean;
  hood?: boolean;
  helm?: boolean;
  horns?: number;
  rags?: boolean;
  height?: number;
  style: Partial<MotionStyle>;
  tier?: CreatureLook['tier'];
  boneTint?: number;
  steel?: [number, number, number];
  weaponSize?: number;
}

export function skeletonLook(c: LookCtx, o: SkeletonOpt): CreatureLook {
  const tint = o.boneTint ?? paletteTint(c.visual.palette, 0xd6cfb4);
  const glow = c.visual.glow ?? 0xffdd88;
  const H = o.height ?? (o.brute ? 2.0 : 1.78);
  return {
    key: `id:${c.id}`,
    tier: o.tier ?? (o.brute ? 'big' : 'normal'),
    rig: () =>
      bipedRig(o.brute ? 'brute' : 'biped', {
        height: H,
        hip: o.brute ? 0.47 : 0.5,
        shoulders: o.brute ? 0.16 : 0.12,
        hips: o.brute ? 0.07 : 0.058,
        arms: o.brute ? 1.12 : 1.02,
        hunch: o.brute ? 0.3 : 0.12,
        head: o.brute ? 0.9 : 1,
      }),
    sculpt: (s: Sculpt) => {
      const steel = o.steel ?? RUST;
      skull(s, { horns: o.horns, glow: 1.2 });
      ribcage(s, { w: o.brute ? 0.085 : 0.072, d: o.brute ? 0.065 : 0.058, r: o.brute ? 0.009 : 0.0075 });
      pelvisBone(s);
      boneLimbs(s, { r: o.brute ? 0.017 : 0.0135 });
      const armor = o.armor ?? 0;
      if (armor > 0) {
        s.pair((side) => pauldron(s, side, (o.brute ? 0.06 : 0.048) * (0.8 + 0.4 * armor), 'metal', armor > 0.6 ? 2 : 0, steel));
        if (armor > 0.45) cuirass(s, { w: o.brute ? 0.11 : 0.09, d: o.brute ? 0.085 : 0.07, belly: armor > 0.7 });
        if (armor > 0.7) {
          // Greaves and vambraces.
          s.pair((side) => {
            s.limb(`shin${side}`, lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.15), lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.85), 0.03 * H, 0.025 * H, { mat: 'metal', k: 0.004 * H });
            s.limb(`fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.25), s.j(`hand${side}`), 0.024 * H, 0.022 * H, { mat: 'metal', k: 0.004 * H });
          });
          skirt(s, { len: 0.38, flare: 0.04, mat: 'metal', thick: 0.008 });
        }
      }
      if (o.helm) helm(s, { size: o.brute ? 0.95 : 1, horns: o.horns ? 0 : armor > 0.8 ? 0.8 : 0, crest: armor > 0.6 && !o.horns ? 1 : 0 });
      if (o.robe) {
        skirt(s, { len: 0.95, flare: 0.07, top: 0.05, thick: 0.01 });
        // A ragged mantle over the shoulders.
        s.ball('chest', s.j('chest').add(V(0, 0.05 * H, -0.01 * H)), V(0.13 * H, 0.06 * H, 0.09 * H), { mat: 'alt', k: 0.03 * H });
      } else if (o.rags) {
        skirt(s, { len: 0.42, flare: 0.03, sides: false, thick: 0.006 });
      }
      if (o.hood) hood(s, { peak: 0.8, open: 1.1 });
      if (o.weapon) weapon(s, o.weapon, { steel, size: (o.weaponSize ?? 1) * (o.brute ? 1.05 : 1), glow: o.weapon === 'staff' ? 1.3 : undefined });
      if (o.weapon === 'bow') {
        // A quiver on the back.
        const ch = s.j('chest');
        s.limb('chest', ch.clone().add(V(0.05 * H, -0.08 * H, -0.08 * H)), ch.clone().add(V(-0.06 * H, 0.12 * H, -0.1 * H)), 0.028 * H, 0.032 * H, { mat: 'alt', k: 0.004 * H });
        for (let i = 0; i < 4; i++) {
          const b = ch.clone().add(V(-0.05 * H + i * 0.01 * H, 0.12 * H, -0.1 * H));
          s.hard('chest', tubeGeo([b, b.clone().add(V(-0.01 * H, 0.08 * H, -0.01 * H))], () => 0.003 * H, 3), 'alt', [0.5, 0.45, 0.4]);
        }
      }
      s.paint.skin = { grime: 0.55, ao: 0.95, mottle: { scale: 7, amount: 0.35, col: [0.45, 0.36, 0.26] }, top: { amount: 0.15, col: [1, 0.97, 0.9] } };
      s.paint.alt = { grime: 0.6, ao: 0.8, mottle: { scale: 5, amount: 0.4, col: [0.5, 0.42, 0.34] } };
      s.paint.metal = { grime: 0.45, ao: 0.7, mottle: { scale: 9, amount: 0.5, col: [0.55, 0.35, 0.22] } };
      s.soft.skin = 0.012;
    },
    mats: {
      skin: { surface: 'bone', tint, glow },
      alt: { surface: 'cloth', tint: o.robe ? 0x2a2630 : 0x4a3e32, glow },
      metal: { surface: o.steel === IRON ? 'iron' : 'rust', tint: 0xb0a090, glow },
    },
    style: {
      heavy: o.brute ? 0.55 : 0.15,
      spawn: o.brute ? 'rise' : 'assemble',
      death: 'scatter',
      idle: o.brute ? 'breathe' : 'twitch',
      gait: o.brute ? 'march' : 'walk',
      ...o.style,
    },
  };
}

// ---------------------------------------------------------------------------
// Ghouls and bloats
// ---------------------------------------------------------------------------

export function ghoulLook(c: LookCtx, plague: boolean): CreatureLook {
  const tint = paletteTint(c.visual.palette, 0xc9bfae);
  const glow = c.visual.glow ?? 0xff5555;
  const H = 1.7;
  return {
    key: `id:${c.id}`,
    rig: () => bipedRig('biped', { height: H, hip: 0.46, shoulders: 0.12, hips: 0.055, arms: 1.35, hunch: 0.75, digitigrade: true, head: 1.05, armOut: 0.4 }),
    sculpt: (s) => {
      trunk(s, { chest: [0.085, 0.07, 0.09], pelvis: [0.065, 0.055, 0.05], ribs: 1, hump: 0.04, shoulders: 0.03 });
      fleshArms(s, { r: 0.022, claws: 0.075, clawCol: [0.3, 0.26, 0.2] });
      fleshLegs(s, { r: 0.034, toes: 0.04, toeCol: [0.3, 0.26, 0.2] });
      s.limb('neck', s.j('chest').lerp(s.j('neck'), 0.4), s.j('head'), 0.028 * H, 0.024 * H, {});
      fleshHead(s, { size: 1.05, snout: 0.6, brow: 1.4, jaw: 1.15, ears: 0.6, teeth: [0.75, 0.7, 0.5], eyes: 1.4 });
      // A spine of knobs down the back.
      const r = seq(c.id.length * 31);
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const p = lerpV(s.j('hips'), s.j('neck'), t).add(V(0, 0, -0.07 * H - Math.sin(t * Math.PI) * 0.02 * H));
        s.ball(t < 0.4 ? 'spine' : 'chest', p, 0.014 * H, { k: 0.012 * H });
      }
      skirt(s, { len: 0.3, flare: 0.02, sides: false, thick: 0.005 });
      if (plague) {
        // Boils that glow with the sickness.
        for (let i = 0; i < 9; i++) {
          const b = i < 5 ? 'chest' : i < 7 ? 'armL' : 'shinR';
          const p = s.j(b).add(V((r() - 0.5) * 0.12 * H, (r() - 0.5) * 0.1 * H, (r() - 0.2) * 0.08 * H));
          const br = (0.012 + r() * 0.01) * H;
          s.ball(b, p, br, { k: 0.006 * H });
          s.boil(b, p.clone().add(V(0, 0, br * 0.55)), br * 0.6, 0.85, [0.75, 0.9, 0.35]);
        }
      }
      if (c.visual.weapon === 'sword' || c.visual.weapon === 'dagger') {
        // A ghoul's weapon is a bone shard and its claws.
        const hr = s.j('handR');
        const tip = s.j('handRTip');
        s.hard('handR', spikeGeo(lerpV(hr, tip, 0.5), lerpV(hr, tip, 0.5).add(V(0, 0.06 * H, 0.2 * H)), 0.015 * H, 5, undefined, 2), 'skin', BONE);
      }
      s.paint.skin = {
        grime: 0.6,
        ao: 0.9,
        mottle: { scale: 5, amount: 0.5, col: plague ? [0.42, 0.5, 0.22] : [0.5, 0.38, 0.36] },
        veins: plague ? { scale: 9, cut: 0.94, glow: 0, col: [0.45, 0.55, 0.25] } : undefined,
      };
      s.paint.alt = { grime: 0.7, ao: 0.8 };
      s.lumps.skin = { amp: 0.004, scale: 22 };
    },
    mats: {
      skin: { surface: plague ? 'rot' : 'flesh', tint, glow },
      alt: { surface: 'cloth', tint: 0x3a3028, glow },
    },
    style: { heavy: 0.2, attacks: ['claw', 'bite', 'lunge'], armed: 'none', spawn: 'rise', death: 'collapse', idle: 'twitch', gait: 'stalk' },
  };
}

function bloatLook(c: LookCtx): CreatureLook {
  const tint = paletteTint(c.visual.palette, 0x6f7a4a);
  const glow = c.visual.glow ?? 0x9ce03a;
  const H = 1.85;
  return {
    key: `id:${c.id}`,
    tier: 'big',
    rig: () => bipedRig('brute', { height: H, hip: 0.42, shoulders: 0.18, hips: 0.1, arms: 1.15, hunch: 0.35, head: 0.85 }),
    sculpt: (s) => {
      const hp = s.j('hips');
      const sp = s.j('spine');
      trunk(s, { chest: [0.15, 0.13, 0.13], pelvis: [0.14, 0.12, 0.09], belly: 0.17, shoulders: 0.06 });
      // The distended gut hangs low.
      s.ball('hips', hp.clone().add(V(0, 0.02 * H, 0.12 * H)), V(0.17 * H, 0.15 * H, 0.15 * H), { k: 0.06 * H });
      fleshArms(s, { r: 0.04, swell: 0.035, fingers: 4, claws: 0.03 });
      fleshLegs(s, { r: 0.065, swell: 0.05 });
      fleshHead(s, { size: 0.85, snout: 0.2, brow: 0.6, jaw: 1.3, eyes: 1, teeth: [0.6, 0.55, 0.35] });
      // Sutures and pustules across the belly; a split seam glows.
      const r = seq(77);
      for (let i = 0; i < 12; i++) {
        const a = r() * Math.PI * 1.4 - 0.7;
        const y = hp.y + (r() - 0.3) * 0.25 * H;
        const p = V(Math.sin(a) * 0.17 * H, y, hp.z + 0.1 * H + Math.cos(a) * 0.14 * H);
        const pr = (0.015 + r() * 0.02) * H;
        const pb = p.y > sp.y ? 'spine' : 'hips';
        s.ball(pb, p, pr, { k: 0.008 * H });
        if (r() > 0.4) s.boil(pb, p.clone().add(V(Math.sin(a) * pr * 0.5, 0, Math.cos(a) * pr * 0.5)), pr * 0.65, 0.9, [0.8, 0.9, 0.4]);
      }
      s.glow(hp.clone().add(V(0, 0.05 * H, 0.27 * H)), 0.03 * H, 0.7);
      for (let i = 0; i < 5; i++) {
        const y = hp.y - 0.05 * H + i * 0.05 * H;
        s.hard('hips', tubeGeo([V(-0.03 * H, y, hp.z + 0.26 * H - Math.abs(i - 2) * 0.02 * H), V(0.03 * H, y + 0.01 * H, hp.z + 0.26 * H - Math.abs(i - 2) * 0.02 * H)], () => 0.004 * H, 3), 'skin', [0.2, 0.15, 0.1]);
      }
      skirt(s, { len: 0.4, flare: 0.05, top: -0.02, sides: true, thick: 0.008 });
      weapon(s, 'cleaver', { steel: RUST, size: 1.1 });
      s.paint.skin = { grime: 0.5, ao: 0.9, mottle: { scale: 4, amount: 0.6, col: [0.55, 0.45, 0.3] }, veins: { scale: 6, cut: 0.94, glow: 0, col: [0.45, 0.5, 0.3] } };
      s.lumps.skin = { amp: 0.012, scale: 9 };
    },
    mats: {
      skin: { surface: 'rot', tint, glow },
      alt: { surface: 'leather', tint: 0x3a2e24, glow },
      metal: { surface: 'rust', tint: 0xa09080, glow },
    },
    style: { heavy: 0.75, attacks: ['chop', 'slam'], armed: 'one', spawn: 'rise', death: 'crash', idle: 'sway', gait: 'lumber' },
  };
}

// ---------------------------------------------------------------------------
// Corpse hound
// ---------------------------------------------------------------------------

export function corpseHoundLook(c: LookCtx): CreatureLook {
  const tint = paletteTint(c.visual.palette, 0xc9bfae);
  const glow = c.visual.glow ?? 0xff4040;
  return {
    key: `id:${c.id}`,
    rig: () => quadRig({ withers: 0.7, length: 1.0, width: 0.13, neck: 0.4, neckRise: 0.3, head: 0.5, tail: 4, tailLen: 0.5, slope: -0.05 }),
    sculpt: (s) => {
      const chest = 0.17;
      quadBody(s, { girth: 0.12, chest, legR: 0.036, gaunt: 1, paws: 'claw', narrow: 0.7 });
      houndHead(s, { len: 0.5, w: 0.095, teeth: true, ears: 0.8, glow: 1.3 });
      // Ribs bared down both flanks, laid on the chest, and a ridge of spine.
      const C = quadChest(s, chest);
      const R = quadChestR(chest, 0.7);
      for (let i = 0; i < 6; i++) {
        const z = C.z + R.z * (0.35 - i * 0.24);
        const zz = (z - C.z) / R.z;
        const f = Math.sqrt(Math.max(0.05, 1 - zz * zz)) * 1.06;
        s.pair((_side, x) => {
          const pts: THREE.Vector3[] = [];
          for (let k = 0; k <= 4; k++) {
            const a = 0.25 + (k / 4) * 2.2;
            pts.push(V(x * Math.sin(a) * R.x * f, C.y + Math.cos(a) * R.y * f, z + k * 0.012));
          }
          s.hard(i < 3 ? 'chest' : 'spine', tubeGeo(pts, () => 0.008, 4), 'skin', BONE);
        });
      }
      let prevB = s.j('hips');
      for (const n of ['spine', 'chest', 'neck']) {
        const p = s.j(n);
        for (let k = 0; k < 3; k++) {
          const q = lerpV(prevB, p, k / 3).add(V(0, 0.1, 0));
          s.hard(n, spikeGeo(q, q.clone().add(V(0, 0.035, -0.012)), 0.012, 4, undefined, 1), 'skin', BONE);
        }
        prevB = p;
      }
      s.paint.skin = { grime: 0.6, ao: 0.9, mottle: { scale: 5, amount: 0.55, col: [0.55, 0.3, 0.28] }, tips: { amount: 0.3, col: [0.3, 0.25, 0.2] } };
      s.lumps.skin = { amp: 0.004, scale: 20 };
    },
    mats: { skin: { surface: 'rot', tint, glow } },
    style: { heavy: 0.15, attacks: ['bite', 'lunge'], spawn: 'emerge', death: 'flop', idle: 'prowl', gait: 'lope' },
  };
}

/** Centre and radii of a quadruped's chest (deep, narrow), for parts laid on it. */
export function quadChest(s: Sculpt, _chest: number): THREE.Vector3 {
  return s.j('chest').add(V(0, -0.05, 0.02));
}
export function quadChestR(chest: number, narrow = 0.78): THREE.Vector3 {
  return V(chest * 0.9 * narrow, chest * 1.1, chest);
}

/** A four-legged body: barrel, haunches, legs, paws or hooves. Shared with the beasts. */
export function quadBody(
  s: Sculpt,
  o: { girth: number; chest: number; belly?: number; legR: number; gaunt?: number; paws?: 'claw' | 'hoof' | 'pad'; mat?: 'skin' | 'alt'; haunch?: number; neckR?: number; narrow?: number },
): void {
  const mat = o.mat ?? 'skin';
  const hp = s.j('hips');
  const sp = s.j('spine');
  const ch = s.j('chest');
  const g = o.girth;
  const nw = o.narrow ?? 0.78;
  const gaunt = o.gaunt ?? 0;
  s.ball('hips', hp.clone().add(V(0, -0.02, 0.02)), V(g * 0.95 * nw, g * 1.0, g * 1.1 * (o.haunch ?? 1)), { mat });
  // The waist tucks up under a gaunt body.
  s.ball('spine', sp.clone().add(V(0, -0.03 + gaunt * g * 0.25, 0)), V(g * (0.95 - gaunt * 0.3) * nw, g * (1.0 - gaunt * 0.3), (ch.z - hp.z) * 0.38), { mat, k: 0.05 });
  s.ball('chest', quadChest(s, o.chest), quadChestR(o.chest, nw), { mat, k: 0.05 });
  if (o.belly) s.ball('spine', sp.clone().add(V(0, -g * 0.6, 0.05)), V(o.belly, o.belly * 0.8, o.belly * 1.6), { mat, k: 0.05 });
  // Neck.
  s.limb('neck', ch.clone().add(V(0, 0.02, 0.04)), s.j('head'), (o.neckR ?? g * 0.55), (o.neckR ?? g * 0.55) * 0.75, { mat, k: 0.04 });
  const r = o.legR;
  s.pair((side) => {
    // Front: shoulder blade into the leg.
    s.ball(`fLeg${side}`, s.j(`fLeg${side}`).add(V(0, 0.02, -0.01)), V(r * 1.2, r * 2.2, r * 1.6), { mat, k: 0.03 });
    s.limb(`fLeg${side}`, s.j(`fLeg${side}`), s.j(`fShin${side}`), r * 1.1, r * 0.8, { mat, k: 0.02, blendAt: s.j(`fLeg${side}`), blendR: r * 3 });
    s.limb(`fShin${side}`, s.j(`fShin${side}`), s.j(`fFoot${side}`), r * 0.75, r * 0.55, { mat, k: 0.012, blendAt: s.j(`fShin${side}`), blendR: r * 2 });
    paw(s, `fFoot${side}`, `fToe${side}`, r, o.paws ?? 'pad', mat);
    // Hind: haunch, gaskin, hock, cannon.
    s.ball(`hLeg${side}`, s.j(`hLeg${side}`).add(V(0, -0.03, 0.02)), V(r * 1.4, r * 2.4, r * 1.9), { mat, k: 0.035 });
    s.limb(`hLeg${side}`, s.j(`hLeg${side}`), s.j(`hShin${side}`), r * 1.2, r * 0.85, { mat, k: 0.02, blendAt: s.j(`hLeg${side}`), blendR: r * 3 });
    s.limb(`hShin${side}`, s.j(`hShin${side}`), s.j(`hHock${side}`), r * 0.8, r * 0.6, { mat, k: 0.012, blendAt: s.j(`hShin${side}`), blendR: r * 2 });
    s.limb(`hHock${side}`, s.j(`hHock${side}`), s.j(`hFoot${side}`), r * 0.55, r * 0.5, { mat, k: 0.01, blendAt: s.j(`hHock${side}`), blendR: r * 1.5 });
    paw(s, `hFoot${side}`, `hToe${side}`, r, o.paws ?? 'pad', mat);
  });
  // Tail.
  let prev = 'hips';
  for (let i = 1; i <= 12; i++) {
    const n = `tail${i}`;
    if (!s.has(n)) break;
    const t = i / 6;
    s.limb(prev, s.j(prev), s.j(n), g * 0.22 * (1 - t * 0.5), g * 0.2 * (1 - t * 0.55), { mat, k: 0.02 });
    prev = n;
  }
  if (prev !== 'hips') s.limb(prev, s.j(prev), s.j('tailTip'), g * 0.1, g * 0.04, { mat, k: 0.015 });
}

function paw(s: Sculpt, footB: string, toe: string, r: number, kind: 'claw' | 'hoof' | 'pad', mat: 'skin' | 'alt'): void {
  const f = s.j(footB);
  const t = s.j(toe);
  if (kind === 'hoof') {
    s.limb(footB, f, V(t.x, 0.03, (f.z + t.z) * 0.5), r * 0.55, r * 0.75, { mat, k: 0.01 });
    return;
  }
  s.ball(footB, V(f.x, Math.max(0.02, f.y * 0.5), (f.z + t.z) * 0.5), V(r * 0.75, r * 0.5, r * 1.0), { mat, k: 0.012 });
  if (kind === 'claw') {
    for (let i = 0; i < 3; i++) {
      const b = V(t.x + (i - 1) * r * 0.45, 0.012, t.z - r * 0.2);
      s.hard(footB, spikeGeo(b, b.clone().add(V(0, -0.01, r * 0.9)), r * 0.16, 4, undefined, 2), 'skin', [0.22, 0.2, 0.16]);
    }
  }
}

/** A canine head on the quadruped's head and jaw bones. */
export function houndHead(s: Sculpt, o: { len: number; w: number; teeth?: boolean; ears?: number; glow?: number; horns?: number; mat?: 'skin' | 'alt' }): void {
  const mat = o.mat ?? 'skin';
  const h = s.j('head');
  const sn = s.j('snout');
  const jw = s.j('jaw');
  const w = o.w;
  s.ball('head', h.clone().add(V(0, 0.01, 0.02)), V(w, w * 0.9, w * 1.1), { mat, k: 0.03 });
  s.limb('head', h.clone().add(V(0, 0.0, 0.05)), sn.clone().add(V(0, 0.01, -0.02)), w * 0.62, w * 0.42, { mat, k: 0.03 });
  s.limb('jaw', jw, sn.clone().add(V(0, -0.05, -0.04)), w * 0.45, w * 0.3, { mat, k: 0.015 });
  if (o.teeth) {
    for (let i = 0; i < 5; i++) {
      const t = 0.25 + i * 0.15;
      s.pair((_side, x) => {
        const p = lerpV(h.clone().add(V(x * w * 0.45, -0.04, 0.05)), sn.clone().add(V(x * w * 0.25, -0.03, -0.03)), t);
        s.hard('head', spikeGeo(p, p.clone().add(V(0, -0.03 * (i === 1 ? 1.6 : 1), 0.004)), 0.007, 4, undefined, 1), 'skin', [0.8, 0.76, 0.6]);
      });
    }
  }
  if (o.ears) s.pair((_side, x) => s.hard('head', spikeGeo(h.clone().add(V(x * w * 0.6, w * 0.6, -0.02)), h.clone().add(V(x * w * 0.9, w * (0.6 + 1.1 * o.ears!), -0.06)), w * 0.32, 4, undefined, 2), mat));
  if (o.horns) s.pair((_side, x) => s.hard('head', spikeGeo(h.clone().add(V(x * w * 0.5, w * 0.7, 0.02)), h.clone().add(V(x * w * 1.6 * o.horns!, w * 1.6 * o.horns!, -w * 1.2 * o.horns!)), w * 0.25, 5, V(0, w * 0.4, -w * 0.5), 4), 'skin', [0.25, 0.2, 0.17]));
  if (o.glow !== 0) s.pair((_side, x) => s.eye('head', h.clone().add(V(x * w * 0.5, w * 0.25, w * 0.72)), w * 0.12, o.glow ?? 1));
}

// ---------------------------------------------------------------------------
// Specters
// ---------------------------------------------------------------------------

export function specterLook(c: LookCtx, o: { veil?: boolean; choir?: boolean; claws?: number; mouth?: number; height?: number }): CreatureLook {
  const tint = paletteTint(c.visual.palette, 0x2e2c38);
  const glow = c.visual.glow ?? 0x9cf0ff;
  const H = o.height ?? 1.9;
  return {
    key: `id:${c.id}`,
    rig: () => specterRig({ height: H, arms: 1.25, hem: 0.03 }),
    sculpt: (s) => {
      const ch = s.j('chest');
      // A gaunt torso of shadow inside a tattered shroud.
      s.ball('chest', ch, V(0.1 * H, 0.1 * H, 0.07 * H), { mat: 'skin' });
      s.ball('spine', s.j('spine'), V(0.07 * H, 0.08 * H, 0.055 * H), { mat: 'skin', k: 0.03 * H });
      skull(s, { size: 0.95, glow: 1.6 });
      s.pair((side) => {
        s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.022 * H, 0.016 * H, { mat: 'skin' });
        s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.016 * H, 0.012 * H, { mat: 'skin' });
        claws(s, `hand${side}`, `hand${side}Tip`, 4, o.claws ?? 0.09, 0.005, 'skin', [0.15, 0.15, 0.18], 0.4);
        // Sleeves hang from the arms in tatters.
        s.limb(`arm${side}`, s.j(`arm${side}`).add(V(0, 0.01 * H, 0)), s.j(`fore${side}`).add(V(0, -0.01 * H, -0.01 * H)), 0.032 * H, 0.03 * H, { mat: 'alt', k: 0.015 * H });
        const cuff = lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.85).add(V(0, -0.025 * H, 0));
        s.limb(`fore${side}`, s.j(`fore${side}`), cuff, 0.03 * H, 0.045 * H, { mat: 'alt', k: 0.012 * H });
        // Hollow the cuff so the bony hand comes out of darkness.
        s.limb(`fore${side}`, lerpV(s.j(`fore${side}`), cuff, 0.6), cuff.clone().addScaledVector(cuff.clone().sub(s.j(`fore${side}`)).normalize(), 0.03 * H), 0.012 * H, 0.036 * H, { mat: 'alt', sub: true, k: 0.006 * H });
        // A rag hanging from each sleeve.
        s.hard(`fore${side}`, spikeGeo(cuff.clone().add(V(0, -0.02 * H, -0.02 * H)), cuff.clone().add(V(0, -0.16 * H, -0.06 * H)), 0.03 * H, 3, undefined, 2), 'alt');
      });
      // The shroud: a hood, a mantle and four trailing robe chains.
      hood(s, { size: 1.05, peak: 1.2, open: 1.15 });
      s.ball('chest', ch.clone().add(V(0, 0.02 * H, -0.01 * H)), V(0.15 * H, 0.12 * H, 0.1 * H), { mat: 'alt', k: 0.03 * H });
      s.ball('hips', s.j('hips').add(V(0, 0.02 * H, 0)), V(0.12 * H, 0.08 * H, 0.1 * H), { mat: 'alt', k: 0.04 * H });
      for (const n of ['F', 'B', 'L', 'R']) {
        const a = s.j(`robe${n}1`);
        const m = s.j(`robe${n}2`);
        const e = s.j(`robe${n}Tip`);
        s.limb(`robe${n}1`, a, m, 0.09 * H, 0.08 * H, { mat: 'alt', k: 0.05 * H });
        s.limb(`robe${n}2`, m, e, 0.08 * H, 0.03 * H, { mat: 'alt', k: 0.04 * H });
      }
      // Tatters: hard strips hanging from the hem.
      const r = seq(c.id.length * 13 + 5);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const b = i % 4 === 0 ? 'robeF2' : i % 4 === 1 ? 'robeL2' : i % 4 === 2 ? 'robeB2' : 'robeR2';
        const top = V(Math.sin(a) * 0.14 * H, 0.22 * H, Math.cos(a) * 0.12 * H - 0.03 * H);
        const bot = top.clone().add(V(Math.sin(a) * 0.04 * H, -(0.12 + r() * 0.12) * H, Math.cos(a) * 0.03 * H - 0.05 * H));
        s.hard(b, spikeGeo(top, bot, 0.03 * H, 3, undefined, 2), 'alt');
      }
      if (o.mouth) {
        // A banshee's mouth hangs open, a glowing hollow.
        s.glow(s.j('jaw').add(V(0, -0.01 * H, 0.03 * H)), 0.03 * H, o.mouth);
      }
      if (o.choir) {
        // A ring of candles and a bell-like collar.
        s.hard('chest', tubeGeo([ch.clone().add(V(-0.14 * H, 0.08 * H, 0.05 * H)), ch.clone().add(V(0, 0.1 * H, 0.1 * H)), ch.clone().add(V(0.14 * H, 0.08 * H, 0.05 * H))], () => 0.012 * H, 5), 'metal', [0.7, 0.55, 0.3], 0.3);
        for (let i = 0; i < 3; i++) {
          const cp = ch.clone().add(V((i - 1) * 0.12 * H, 0.105 * H, 0.08 * H - Math.abs(i - 1) * 0.04 * H));
          s.hard('chest', tubeGeo([cp, cp.clone().add(V(0, 0.04 * H, 0))], () => 0.008 * H, 5), 'metal', [0.85, 0.8, 0.65]);
          s.boil('chest', cp.clone().add(V(0, 0.055 * H, 0)), 0.008 * H, 1, [1, 0.9, 0.6]);
        }
      }
      s.glow(ch.clone().add(V(0, 0, 0.06 * H)), 0.035 * H, 0.45);
      s.paint.skin = { grime: 0.2, ao: 0.6, veins: { scale: 8, cut: 0.94, glow: 0.4 } };
      s.paint.alt = { grime: 0.1, ao: 0.6, mottle: { scale: 3, amount: 0.5, col: [0.4, 0.4, 0.5] }, tips: { amount: 0.6, col: [0.1, 0.1, 0.12] } };
      s.soft.alt = 0.08;
    },
    mats: {
      skin: { surface: 'bone', tint: 0x8a8e98, glow, glowIntensity: 3.2 },
      alt: { surface: 'shade', tint, glow, glowIntensity: 2.6 },
      metal: { surface: 'brass', tint: 0xb09060, glow },
    },
    style: { heavy: 0.1, attacks: ['claw', 'lunge'], spawn: 'form', death: 'fade', idle: 'hover', gait: 'glide', armed: 'none' },
  };
}

// ---------------------------------------------------------------------------
// Grave titan and the lich
// ---------------------------------------------------------------------------

function graveTitanLook(c: LookCtx): CreatureLook {
  const glow = c.visual.glow ?? 0x66ff99;
  const H = 2.1;
  return {
    key: `id:${c.id}`,
    tier: 'big',
    rig: () => bipedRig('giant', { height: H, hip: 0.42, shoulders: 0.2, hips: 0.09, arms: 1.35, hunch: 0.55, head: 0.8, armOut: 0.4 }),
    sculpt: (s) => {
      // A giant stitched from many bodies: a great ribcage of bones over a mass of dead flesh.
      trunk(s, { mat: 'alt', chest: [0.15, 0.12, 0.12], pelvis: [0.11, 0.09, 0.07], shoulders: 0.065, hump: 0.07 });
      ribcage(s, { w: 0.13, d: 0.11, r: 0.012, ribs: 6 });
      skull(s, { size: 0.85, horns: 0.7, glow: 1.5 });
      fleshArms(s, { mat: 'alt', r: 0.045, swell: 0.04 });
      fleshLegs(s, { mat: 'alt', r: 0.055, swell: 0.04 });
      // Bone plates and spurs grown through the flesh.
      s.pair((side) => {
        pauldron(s, side, 0.07, 'skin', 3, BONE);
        claws(s, `hand${side}`, `hand${side}Tip`, 4, 0.08, 0.008, 'skin', BONE, 0.5);
        s.hard(`fore${side}`, spikeGeo(s.j(`fore${side}`), s.j(`fore${side}`).add(V(side === 'L' ? 0.05 * H : -0.05 * H, 0.02 * H, -0.08 * H)), 0.015 * H, 5, undefined, 2), 'skin', BONE);
      });
      const r = seq(91);
      for (let i = 0; i < 7; i++) {
        const p = lerpV(s.j('hips'), s.j('neck'), i / 6).add(V((r() - 0.5) * 0.04 * H, 0.02 * H, -0.12 * H));
        s.hard(i < 3 ? 'spine' : 'chest', spikeGeo(p, p.clone().add(V(0, 0.06 * H, -0.08 * H)), 0.018 * H, 5, undefined, 2), 'skin', BONE);
      }
      // A green heart burns inside the cage.
      s.boil('chest', s.j('chest').add(V(0, 0, 0.03 * H)), 0.035 * H, 1, [0.7, 1, 0.8]);
      s.glow(s.j('chest').add(V(0, 0, 0.06 * H)), 0.05 * H, 0.35);
      s.paint.skin = { grime: 0.5, ao: 0.95, mottle: { scale: 6, amount: 0.3, col: [0.5, 0.42, 0.3] } };
      s.paint.alt = { grime: 0.55, ao: 0.9, mottle: { scale: 3, amount: 0.5, col: [0.35, 0.4, 0.3] }, veins: { scale: 5, cut: 0.94, glow: 0, col: [0.4, 0.45, 0.35] } };
      s.lumps.alt = { amp: 0.015, scale: 7 };
    },
    mats: {
      skin: { surface: 'bone', tint: 0xcfc6a8, glow },
      alt: { surface: 'rot', tint: 0x6a6a52, glow },
    },
    style: { heavy: 0.9, attacks: ['slam', 'swing', 'stomp'], armed: 'none', spawn: 'rise', death: 'crash', idle: 'breathe', gait: 'lumber' },
  };
}

function lichLook(c: LookCtx): CreatureLook {
  const glow = c.visual.glow ?? 0x60ffb0;
  const H = 1.95;
  return {
    key: `id:${c.id}`,
    rig: () => bipedRig('biped', { height: H, hip: 0.5, shoulders: 0.13, hips: 0.06, arms: 1.08, hunch: 0.15 }),
    sculpt: (s) => {
      skull(s, { glow: 2 });
      ribcage(s, { w: 0.07, d: 0.055 });
      boneLimbs(s, { r: 0.012, claws: 0.06 });
      // Heavy robes, a high collar, a crown of iron spikes.
      skirt(s, { len: 1.0, flare: 0.1, top: 0.08, thick: 0.012 });
      s.ball('chest', s.j('chest').add(V(0, 0.02 * H, 0)), V(0.13 * H, 0.12 * H, 0.09 * H), { mat: 'alt', k: 0.03 * H });
      s.pair((side, x) => {
        s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.04 * H, 0.05 * H, { mat: 'alt', k: 0.02 * H });
        s.limb(`fore${side}`, s.j(`fore${side}`), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.85), 0.05 * H, 0.07 * H, { mat: 'alt', k: 0.02 * H });
        // Collar wings rising behind the skull.
        const n = s.j('neck');
        s.box('chest', n.clone().add(V(x * 0.07 * H, 0.03 * H, -0.04 * H)), V(0.05 * H, 0.08 * H, 0.008 * H), { mat: 'alt', k: 0.01 * H, q: new THREE_Q(0, x * 0.5, x * 0.2) });
      });
      const hc = s.j('head').add(V(0, 0.1 * H, 0.012 * H));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const b = hc.clone().add(V(Math.sin(a) * 0.055 * H, -0.01 * H, Math.cos(a) * 0.06 * H));
        s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.01 * H, (i % 2 ? 0.05 : 0.08) * H, Math.cos(a) * 0.01 * H)), 0.01 * H, 4, undefined, 1), 'metal', [0.55, 0.5, 0.4], i === 0 ? 1 : 0);
      }
      s.hard('head', tubeGeoRing(hc, 0.06 * H, 0.008 * H), 'metal', [0.55, 0.5, 0.4]);
      weapon(s, 'staff', { glow: 1.6, size: 1.1, wood: [0.18, 0.16, 0.2] });
      // A phylactery on the chest.
      s.hard('chest', ballGeo(s.j('chest').add(V(0, 0.02 * H, 0.1 * H)), 0.022 * H, 0), 'skin', [0.6, 1, 0.8], 1);
      s.paint.skin = { grime: 0.3, ao: 0.9, mottle: { scale: 7, amount: 0.3, col: [0.4, 0.38, 0.3] } };
      s.paint.alt = { grime: 0.4, ao: 0.85, bands: { axis: 'y', period: 0.22, amount: 0.25 }, mottle: { scale: 4, amount: 0.3, col: [0.3, 0.5, 0.4] } };
    },
    mats: {
      skin: { surface: 'bone', tint: 0xb8b09a, glow, glowIntensity: 3 },
      alt: { surface: 'cloth', tint: paletteTint(c.visual.palette, 0x2e2c38), glow },
      metal: { surface: 'iron', tint: 0x9a9080, glow },
    },
    style: { heavy: 0.2, attacks: ['swing', 'thrust'], armed: 'staff', castBoth: true, spawn: 'form', death: 'scatter', idle: 'still', gait: 'glide' },
  };
}

/** A small Euler-built quaternion for tilted boxes. */
class THREE_Q extends THREE.Quaternion {
  constructor(x: number, y: number, z: number) {
    super();
    this.setFromEuler(new THREE.Euler(x, y, z));
  }
}

function tubeGeoRing(c: THREE.Vector3, r: number, tube: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(c.clone().add(V(Math.sin(a) * r, 0, Math.cos(a) * r * 1.08)));
  }
  return tubeGeo(pts, () => tube, 4);
}

// ---------------------------------------------------------------------------

export const UNDEAD: Record<string, LookFactory> = {
  skeleton_rattler: (c) => skeletonLook(c, { weapon: 'axe', rags: true, style: { attacks: ['chop', 'swing'], armed: 'one' } }),
  skeleton_archer: (c) => skeletonLook(c, { weapon: 'bow', hood: true, rags: true, style: { attacks: ['shoot'], armed: 'bow', ranged: true } }),
  skeleton_duelist: (c) => skeletonLook(c, { weapon: 'sword', armor: 0.35, rags: true, style: { attacks: ['thrust', 'swing', 'thrust'], armed: 'one', gait: 'stalk', heavy: 0.1 } }),
  bone_conjurer: (c) => skeletonLook(c, { weapon: 'staff', robe: true, hood: true, boneTint: 0x5a5560, style: { attacks: ['swing'], armed: 'staff', castBoth: true, idle: 'still' } }),
  skeleton_warden: (c) => skeletonLook(c, { brute: true, weapon: 'greataxe', armor: 0.75, helm: true, steel: IRON, style: { attacks: ['chop', 'swing'], armed: 'two' } }),
  skeletal_ballista: (c) => skeletonLook(c, { brute: true, weapon: 'crossbow', armor: 0.6, helm: true, weaponSize: 1.5, style: { attacks: ['shoot'], armed: 'bow', ranged: true } }),
  gravebound_knight: (c) => skeletonLook(c, { brute: true, weapon: 'greataxe', armor: 1, helm: true, horns: 0, steel: IRON, height: 2.05, style: { attacks: ['chop', 'swing', 'thrust'], armed: 'two', death: 'crash' } }),
  crypt_ghoul: (c) => ghoulLook(c, false),
  plague_ghoul: (c) => ghoulLook(c, true),
  rotting_bloat: (c) => bloatLook(c),
  corpse_hound: (c) => corpseHoundLook(c),
  wraith: (c) => specterLook(c, { claws: 0.11 }),
  banshee: (c) => ({ ...specterLook(c, { mouth: 2, claws: 0.06, height: 1.85 }), style: { heavy: 0.05, attacks: ['claw'], spawn: 'form', death: 'fade', idle: 'hover', gait: 'glide', armed: 'none', castBoth: true } }),
  barrow_shade: (c) => specterLook(c, { claws: 0.13, height: 2.0 }),
  sepulcher_choir: (c) => ({ ...specterLook(c, { choir: true, claws: 0.05, mouth: 1.2 }), style: { heavy: 0.1, attacks: ['claw'], spawn: 'form', death: 'fade', idle: 'hover', gait: 'glide', armed: 'none', castBoth: true } }),
  grave_titan: (c) => graveTitanLook(c),
  mortician_lich: (c) => lichLook(c),
};
