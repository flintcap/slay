/**
 * SLAY — humanoid foes: goblins, bandits, cultists, priests, zealots,
 * marauders and the iron captain. Built for monsters, not dressed-up heroes:
 * hunched, ragged, masked, every one with a silhouette of its own (a goblin's
 * ears and satchel, a cutthroat's hood and scarf, an inquisitor's crested great
 * helm, a priest's mitre).
 */
import * as THREE from 'three';
import { bipedRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, spikeGeo, tubeGeo } from './Sculpt';
import { weapon, type WeaponKind } from './Arms';
import { V, belt, cape, cuirass, fleshArms, fleshHead, fleshLegs, helm, hood, lerpV, mask, paletteTint, pauldron, rgb, seq, skirt, trunk } from './Kit';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const WORN = rgb(0xb8b0a4);
const IRON = rgb(0x70737a);
const BRASS = rgb(0xb08a4a);
const DARK = rgb(0x3a3a40);

type Head = 'human' | 'goblin' | 'lizard' | 'fish' | 'bald';

interface ManOpt {
  height: number;
  build?: 'thin' | 'normal' | 'stout' | 'brute';
  head?: Head;
  hunch?: number;
  skin?: number;
  skinSurface?: Surface;
  cloth?: number;
  clothSurface?: Surface;
  metal?: number;
  metalSurface?: Surface;
  steel?: RGB;
  weapon?: WeaponKind;
  weaponSize?: number;
  weaponGlow?: number;
  /** Robe or skirt length (share of hip height), 0 none. */
  robe?: number;
  hood?: boolean;
  mask?: boolean;
  /** 0 none .. 1 full plate. */
  armor?: number;
  helm?: 'none' | 'great' | 'horned' | 'open' | 'mitre' | 'crown';
  cape?: number;
  belt?: number;
  strap?: boolean;
  /** A tunic or robe top over the trunk: 0 bare, 1 short sleeves, 2 long sleeves. */
  tunic?: number;
  tunicCol?: number;
  tail?: number;
  digitigrade?: boolean;
  claws?: number;
  extra?: (s: Sculpt, H: number) => void;
  style: Partial<MotionStyle>;
  tier?: CreatureLook['tier'];
  paintSkin?: Sculpt['paint']['skin'];
}

function headFor(s: Sculpt, kind: Head, H: number): void {
  switch (kind) {
    case 'goblin': {
      // Big head, long nose, ears like knives, an underbite.
      fleshHead(s, { size: 1.25, snout: 0.8, brow: 1.3, ears: 1.6, jaw: 1.15, teeth: [0.75, 0.7, 0.45], eyes: 1 });
      const c = s.j('head').add(V(0, 0.04 * 1.25 * H, 0.01 * H));
      s.limb('head', c.clone().add(V(0, -0.005 * H, 0.06 * H)), c.clone().add(V(0, -0.03 * H, 0.12 * H)), 0.014 * H, 0.008 * H, { k: 0.01 * H });
      break;
    }
    case 'lizard': {
      // A long snout, a crest of spines and a bony frill.
      fleshHead(s, { size: 1.05, snout: 1.6, brow: 1.5, jaw: 1.1, teeth: [0.8, 0.78, 0.6], eyes: 1.2 });
      const c = s.j('head').add(V(0, 0.06 * H, -0.01 * H));
      for (let i = 0; i < 4; i++) {
        const b = c.clone().add(V(0, -i * 0.015 * H, -i * 0.025 * H));
        s.hard('head', spikeGeo(b, b.clone().add(V(0, 0.04 * H, -0.03 * H)), 0.008 * H, 4, undefined, 2), 'skin', [0.5, 0.4, 0.3]);
      }
      s.pair((_side, x) => s.hard('head', spikeGeo(c.clone().add(V(x * 0.05 * H, -0.03 * H, -0.02 * H)), c.clone().add(V(x * 0.1 * H, -0.01 * H, -0.06 * H)), 0.012 * H, 4, undefined, 2), 'skin', [0.6, 0.45, 0.35]));
      break;
    }
    case 'fish': {
      // A drowned face: wide lipless mouth, gill slits, fins for ears.
      fleshHead(s, { size: 1.05, snout: 0.5, brow: 0.6, jaw: 1.35, teeth: [0.75, 0.8, 0.75], eyes: 1.4 });
      const c = s.j('head').add(V(0, 0.04 * H, 0));
      s.pair((_side, x) => {
        s.hard('head', spikeGeo(c.clone().add(V(x * 0.055 * H, 0.0, -0.01 * H)), c.clone().add(V(x * 0.11 * H, 0.04 * H, -0.05 * H)), 0.025 * H, 3, undefined, 2), 'skin', [0.5, 0.6, 0.65]);
        for (let i = 0; i < 3; i++) s.limb('neck', s.j('neck').add(V(x * 0.035 * H, 0.03 * H - i * 0.012 * H, 0.01 * H)), s.j('neck').add(V(x * 0.04 * H, 0.03 * H - i * 0.012 * H, -0.015 * H)), 0.003 * H, 0.003 * H, { sub: true, k: 0.002 * H });
      });
      s.hard('head', spikeGeo(c.clone().add(V(0, 0.05 * H, 0.02 * H)), c.clone().add(V(0, 0.09 * H, -0.08 * H)), 0.03 * H, 3, undefined, 2), 'skin', [0.45, 0.55, 0.6]);
      break;
    }
    case 'bald':
      fleshHead(s, { size: 1, snout: 0.35, brow: 1.1, jaw: 1.05, eyes: 1 });
      break;
    default:
      fleshHead(s, { size: 1, snout: 0.35, brow: 1, jaw: 1, eyes: 0.9 });
  }
}

/** A living humanoid foe. */
export function manLook(c: LookCtx, o: ManOpt): CreatureLook {
  const H = o.height;
  const build = o.build ?? 'normal';
  const kind = build === 'brute' ? 'brute' : 'biped';
  const glow = c.visual.glow ?? 0xffaa55;
  const cloth = o.cloth ?? paletteTint(c.visual.palette, 0x4a3e32);
  const thick = build === 'thin' ? 0.82 : build === 'stout' ? 1.18 : build === 'brute' ? 1.35 : 1;
  return {
    key: `id:${c.id}`,
    tier: o.tier ?? (build === 'brute' ? 'big' : H < 1.3 ? 'small' : 'normal'),
    rig: () =>
      bipedRig(kind, {
        height: H,
        hip: o.head === 'goblin' ? 0.42 : build === 'brute' ? 0.47 : 0.5,
        shoulders: (build === 'brute' ? 0.16 : 0.12) * Math.sqrt(thick),
        hips: 0.06 * thick,
        arms: o.head === 'goblin' ? 1.15 : build === 'brute' ? 1.1 : 1.02,
        hunch: o.hunch ?? (build === 'brute' ? 0.3 : 0.08),
        head: o.head === 'goblin' ? 1.2 : build === 'brute' ? 0.9 : 1,
        digitigrade: o.digitigrade,
        tail: o.tail ?? 0,
        tailLen: 0.55,
      }),
    sculpt: (s: Sculpt) => {
      const steel = o.steel ?? WORN;
      trunk(s, {
        chest: [0.095 * thick, 0.065 * thick, 0.1],
        pelvis: [0.08 * thick, 0.06 * thick, 0.06],
        belly: build === 'stout' ? 0.08 : build === 'brute' ? 0.07 : 0,
        shoulders: (build === 'brute' ? 0.05 : 0.032) * thick,
      });
      fleshArms(s, { r: 0.026 * thick, swell: build === 'thin' ? 0 : 0.012 * thick, claws: o.claws, fingers: 4 });
      fleshLegs(s, { r: 0.04 * thick, swell: 0.015 * thick });
      headFor(s, o.head ?? 'human', H);
      if (o.tail) {
        let prev = 'hips';
        for (let i = 1; i <= 12; i++) {
          const n = `tail${i}`;
          if (!s.has(n)) break;
          s.limb(prev, s.j(prev), s.j(n), 0.03 * H * (1 - i * 0.12), 0.03 * H * (1 - (i + 1) * 0.12), { k: 0.01 * H });
          prev = n;
        }
        s.limb(prev, s.j(prev), s.j('tailTip'), 0.012 * H, 0.004 * H, { k: 0.005 * H });
      }
      const tunic = o.tunic ?? (o.head === 'goblin' || o.head === 'lizard' ? 0 : 2);
      if (tunic) {
        const tm: 'alt' = 'alt';
        const ch = s.j('chest');
        s.ball('chest', ch.clone().add(V(0, 0.01 * H, 0.005 * H)), V((0.095 * thick + 0.008) * H, 0.105 * H, (0.065 * thick + 0.008) * H), { mat: tm, k: 0.04 * H });
        s.ball('spine', s.j('spine'), V((0.076 * thick + 0.008) * H, 0.075 * H, (0.055 * thick + 0.008) * H), { mat: tm, k: 0.04 * H });
        s.ball('hips', s.j('hips').add(V(0, 0.03 * H, 0)), V((0.08 * thick + 0.008) * H, 0.05 * H, (0.06 * thick + 0.008) * H), { mat: tm, k: 0.03 * H });
        s.pair((side) => {
          const a = s.j(`arm${side}`);
          const f = s.j(`fore${side}`);
          s.limb(`arm${side}`, a, tunic > 1 ? f : lerpV(a, f, 0.6), 0.032 * thick * H, 0.03 * thick * H, { mat: tm, k: 0.015 * H });
          if (tunic > 1) s.limb(`fore${side}`, f, lerpV(f, s.j(`hand${side}`), 0.8), 0.03 * thick * H, 0.034 * thick * H, { mat: tm, k: 0.01 * H });
          // Breeches to the knee, wrapped shins.
          const l = s.j(`leg${side}`);
          const k = s.j(`shin${side}`);
          s.limb(`leg${side}`, l, k, 0.047 * thick * H, 0.036 * thick * H, { mat: tm, k: 0.012 * H, blendAt: l, blendR: 0.06 * H });
          s.limb(`shin${side}`, lerpV(k, s.j(`foot${side}`), 0.45), lerpV(k, s.j(`foot${side}`), 0.92), 0.03 * thick * H, 0.026 * thick * H, { mat: tm, k: 0.006 * H });
        });
      }
      const armor = o.armor ?? 0;
      if (armor > 0) {
        s.pair((side) => pauldron(s, side, (build === 'brute' ? 0.06 : 0.045) * (0.8 + 0.4 * armor), 'metal', armor > 0.75 ? 2 : 0, steel));
        if (armor > 0.4) cuirass(s, { w: 0.105 * thick, d: 0.075 * thick, belly: armor > 0.6 });
        if (armor > 0.6) {
          s.pair((side) => {
            s.limb(`shin${side}`, lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.1), lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.85), 0.034 * H * thick, 0.028 * H * thick, { mat: 'metal', k: 0.004 * H });
            s.limb(`fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.2), s.j(`hand${side}`), 0.026 * H * thick, 0.024 * H * thick, { mat: 'metal', k: 0.004 * H });
          });
        }
      }
      if (o.robe) skirt(s, { len: o.robe, flare: 0.03 + o.robe * 0.06, top: 0.04, thick: 0.01 });
      if (o.hood) hood(s, { peak: 0.9, open: 1.05 });
      if (o.mask) mask(s, {});
      if (o.cape) cape(s, { len: o.cape, torn: 0.8 });
      if (o.belt !== undefined || o.strap) belt(s, { pouches: o.belt ?? 0, strap: o.strap });
      switch (o.helm ?? 'none') {
        case 'great':
          helm(s, { crest: 1.3, eyes: 0.6 });
          break;
        case 'horned':
          helm(s, { horns: 1, visor: true, eyes: 0.8 });
          break;
        case 'open':
          helm(s, { visor: false });
          break;
        case 'mitre': {
          // A tall split mitre.
          const hc = s.j('head').add(V(0, 0.1 * H, 0));
          s.box('head', hc, V(0.045 * H, 0.06 * H, 0.03 * H), { mat: 'alt', k: 0.01 * H, round: 0.01 * H });
          s.box('head', hc.clone().add(V(0, 0.07 * H, 0)), V(0.006 * H, 0.03 * H, 0.04 * H), { mat: 'alt', sub: true, k: 0.004 * H });
          s.hard('head', ringGeo2(s.j('head').add(V(0, 0.065 * H, 0.005 * H)), 0.055 * H), 'metal', BRASS);
          break;
        }
        case 'crown': {
          const cc = s.j('head').add(V(0, 0.09 * H, 0.005 * H));
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const b = cc.clone().add(V(Math.sin(a) * 0.05 * H, 0, Math.cos(a) * 0.055 * H));
            s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.01 * H, 0.05 * H, Math.cos(a) * 0.01 * H)), 0.007 * H, 4, undefined, 1), 'metal', IRON);
          }
          break;
        }
        default:
      }
      if (o.weapon) weapon(s, o.weapon, { steel, size: o.weaponSize ?? 1, glow: o.weaponGlow ?? (o.weapon === 'staff' ? 1.2 : undefined) });
      o.extra?.(s, H);
      s.paint.skin = o.paintSkin ?? { grime: 0.5, ao: 0.9, mottle: { scale: 6, amount: 0.3, col: [0.7, 0.55, 0.5] } };
      s.paint.alt = { grime: 0.6, ao: 0.85, mottle: { scale: 4, amount: 0.35, col: [0.6, 0.5, 0.42] }, tips: { amount: 0.4, col: [0.35, 0.3, 0.26] } };
      s.paint.metal = { grime: 0.45, ao: 0.7, mottle: { scale: 9, amount: 0.45, col: [0.55, 0.38, 0.25] } };
    },
    mats: {
      skin: { surface: o.skinSurface ?? 'flesh', tint: o.skin ?? 0x9a8070, glow },
      alt: { surface: o.clothSurface ?? 'cloth', tint: cloth, glow },
      metal: { surface: o.metalSurface ?? 'rust', tint: o.metal ?? 0xb0a090, glow },
    },
    style: {
      heavy: build === 'brute' ? 0.55 : build === 'stout' ? 0.35 : 0.2,
      spawn: 'rise',
      death: build === 'brute' ? 'crash' : 'collapse',
      idle: 'breathe',
      gait: build === 'brute' ? 'march' : 'walk',
      ...o.style,
    },
  };
}

function ringGeo2(c: THREE.Vector3, r: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, r * 0.08, 4, 16);
  g.deleteAttribute('uv');
  g.rotateX(Math.PI / 2);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** A glowing bomb in the right hand, fuse lit, and a satchel of more. */
function bombs(s: Sculpt, H: number): void {
  const h = s.j('handR');
  const t = s.j('handRTip');
  const p = lerpV(h, t, 0.7).add(V(0, 0, 0.02 * H));
  s.hard('handR', ballGeo(p, 0.035 * H, 1), 'metal', DARK);
  s.hard('handR', tubeGeo([p.clone().add(V(0, 0.03 * H, 0)), p.clone().add(V(0.01 * H, 0.055 * H, -0.01 * H))], () => 0.004 * H, 3), 'alt', [0.6, 0.5, 0.3]);
  s.eye('handR', p.clone().add(V(0.01 * H, 0.06 * H, -0.01 * H)), 0.008 * H, 1);
  const hp = s.j('hips');
  s.ball('hips', hp.clone().add(V(-0.1 * H, -0.01 * H, -0.02 * H)), V(0.045 * H, 0.05 * H, 0.035 * H), { mat: 'alt', k: 0.01 * H });
  for (let i = 0; i < 3; i++) s.hard('hips', ballGeo(hp.clone().add(V(-0.1 * H - (i - 1) * 0.02 * H, 0.04 * H, -0.02 * H + (i % 2) * 0.015 * H)), 0.022 * H, 0), 'metal', DARK);
}

/** Ritual scars and a blood orb (blood chanter). */
function bloodMarks(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  for (let i = 0; i < 4; i++) s.glow(ch.clone().add(V((i - 1.5) * 0.04 * H, 0.03 * H, 0.08 * H)), 0.012 * H, 0.5, [0.6, 0.2, 0.2]);
  const h = s.j('handL');
  const t = s.j('handLTip');
  s.boil('handL', lerpV(h, t, 0.9).add(V(0, 0.03 * H, 0.03 * H)), 0.03 * H, 1, [1, 0.4, 0.4]);
}

/** A ring of burning sigils round a warlock's hands and horns on the hood. */
function warlockFlair(s: Sculpt, H: number): void {
  const c = s.j('head').add(V(0, 0.08 * H, -0.01 * H));
  s.pair((_side, x) => s.hard('head', spikeGeo(c.clone().add(V(x * 0.05 * H, 0, 0.01 * H)), c.clone().add(V(x * 0.11 * H, 0.08 * H, -0.06 * H)), 0.014 * H, 5, V(x * 0.02 * H, 0.05 * H, 0), 4), 'skin', [0.25, 0.2, 0.18]));
  s.pair((side) => s.boil(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.6), 0.02 * H, 1, [1, 0.7, 0.4]));
}

/** Barnacles, coral and kelp (sunken zealot). */
function drowned(s: Sculpt, H: number): void {
  const r = seq(331);
  for (let i = 0; i < 10; i++) {
    const b = i < 4 ? 'chest' : i < 7 ? `arm${i % 2 ? 'L' : 'R'}` : `leg${i % 2 ? 'L' : 'R'}`;
    const p = s.j(b).add(V((r() - 0.5) * 0.12 * H, (r() - 0.5) * 0.08 * H, (r() - 0.3) * 0.09 * H));
    s.hard(b, ballGeo(p, (0.008 + r() * 0.01) * H, 0), 'metal', [0.75, 0.72, 0.65]);
  }
  s.pair((side, x) => {
    const a = s.j(`arm${side}`).add(V(x * 0.01 * H, 0.03 * H, 0));
    s.hard(`arm${side}`, spikeGeo(a, a.clone().add(V(x * 0.03 * H, 0.08 * H, -0.02 * H)), 0.01 * H, 4, V(x * 0.02 * H, 0.02 * H, 0), 3), 'metal', [0.8, 0.45, 0.4]);
  });
  // Kelp hanging from the belt.
  const hp = s.j('hips');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const top = hp.clone().add(V(Math.sin(a) * 0.09 * H, 0.02 * H, Math.cos(a) * 0.07 * H));
    s.hard(i % 2 ? 'legL' : 'legR', tubeGeo([top, top.clone().add(V(Math.sin(a) * 0.02 * H, -0.12 * H, 0)), top.clone().add(V(Math.sin(a) * 0.01 * H, -0.24 * H, 0.01 * H))], (t) => (0.01 - 0.007 * t) * H, 3), 'alt', [0.35, 0.5, 0.3]);
  }
}

/** Ash, cinders and a horned war mask (ashen marauder). */
function ashen(s: Sculpt, H: number): void {
  s.pair((side) => {
    const a = s.j(`arm${side}`);
    for (let i = 0; i < 3; i++) {
      const b = a.clone().add(V((side === 'L' ? 1 : -1) * 0.04 * H, 0.04 * H, (i - 1) * 0.025 * H));
      s.hard(`arm${side}`, spikeGeo(b, b.clone().add(V((side === 'L' ? 1 : -1) * 0.02 * H, 0.06 * H, 0)), 0.008 * H, 4, undefined, 1), 'metal', DARK);
    }
  });
  s.glow(s.j('chest').add(V(0.03 * H, 0.0, 0.08 * H)), 0.02 * H, 0.4);
}

const HUMANOID: Record<string, LookFactory> = {
  goblin_scrapper: (c) =>
    manLook(c, {
      height: 1.3,
      build: 'thin',
      head: 'goblin',
      hunch: 0.35,
      skin: 0x6f8a4a,
      cloth: 0x4a3a2a,
      weapon: 'dagger',
      weaponSize: 1.3,
      robe: 0.35,
      belt: 2,
      claws: 0.025,
      style: { heavy: 0.05, attacks: ['thrust', 'swing'], armed: 'one', idle: 'jitter', gait: 'stalk', spawn: 'rise' },
    }),
  goblin_bomber: (c) =>
    manLook(c, {
      height: 1.3,
      build: 'thin',
      head: 'goblin',
      hunch: 0.3,
      skin: 0x6f8a4a,
      cloth: 0x5a4430,
      robe: 0.3,
      strap: true,
      belt: 1,
      extra: bombs,
      style: { heavy: 0.05, attacks: ['hurl'], ranged: true, armed: 'none', idle: 'jitter', gait: 'stalk' },
    }),
  bandit_cutthroat: (c) =>
    manLook(c, {
      height: 1.8,
      build: 'thin',
      hood: true,
      mask: true,
      cloth: 0x3e3a32,
      clothSurface: 'leather',
      weapon: 'sword',
      cape: 0.55,
      belt: 3,
      hunch: 0.15,
      style: { heavy: 0.15, attacks: ['thrust', 'swing', 'chop'], armed: 'one', idle: 'sway', gait: 'stalk' },
    }),
  bandit_crossbow: (c) =>
    manLook(c, {
      height: 1.8,
      hood: true,
      mask: true,
      cloth: 0x4a4236,
      clothSurface: 'leather',
      weapon: 'crossbow',
      belt: 2,
      strap: true,
      style: { attacks: ['shoot'], ranged: true, armed: 'crossbow', idle: 'sway' },
    }),
  cultist_zealot: (c) =>
    manLook(c, {
      height: 1.82,
      hood: true,
      mask: true,
      cloth: 0x2a2228,
      robe: 0.8,
      weapon: 'sword',
      weaponGlow: 0.6,
      steel: DARK,
      belt: 0,
      style: { heavy: 0.2, attacks: ['chop', 'thrust', 'swing'], armed: 'one', idle: 'twitch', gait: 'march' },
    }),
  cultist_acolyte: (c) =>
    manLook(c, {
      height: 1.78,
      build: 'thin',
      hood: true,
      cloth: 0x2e2836,
      robe: 0.95,
      weapon: 'staff',
      style: { attacks: ['thrust'], armed: 'staff', idle: 'sway', castBoth: true },
    }),
  dark_priest: (c) =>
    manLook(c, {
      height: 1.9,
      build: 'thin',
      head: 'bald',
      cloth: 0x1e1e26,
      robe: 1.0,
      helm: 'mitre',
      weapon: 'staff',
      cape: 0.9,
      style: { attacks: ['thrust'], armed: 'staff', idle: 'still', gait: 'march', castBoth: true },
    }),
  inquisitor: (c) =>
    manLook(c, {
      height: 1.95,
      build: 'brute',
      armor: 1,
      helm: 'great',
      cloth: 0x6a2a24,
      robe: 0.5,
      cape: 0.7,
      weapon: 'greataxe',
      steel: IRON,
      metalSurface: 'iron',
      metal: 0xc8ccd4,
      style: { attacks: ['chop', 'swing'], armed: 'two', idle: 'still', gait: 'march', death: 'crash' },
    }),
  troglodyte: (c) =>
    manLook(c, {
      height: 1.7,
      head: 'lizard',
      hunch: 0.45,
      digitigrade: true,
      tail: 6,
      skin: 0x5a6a3a,
      skinSurface: 'scale',
      cloth: 0x3a3226,
      clothSurface: 'leather',
      robe: 0.3,
      weapon: 'dagger',
      weaponSize: 1.4,
      claws: 0.04,
      paintSkin: { grime: 0.5, ao: 0.9, top: { amount: 0.2, col: [0.55, 0.6, 0.4] }, mottle: { scale: 7, amount: 0.4, col: [0.5, 0.55, 0.35] } },
      style: { heavy: 0.15, attacks: ['thrust', 'claw', 'bite'], armed: 'one', idle: 'twitch', gait: 'stalk' },
    }),
  sunken_zealot: (c) =>
    manLook(c, {
      height: 1.85,
      head: 'fish',
      hunch: 0.2,
      skin: 0x5a7a86,
      skinSurface: 'rot',
      cloth: 0x2a3a40,
      robe: 0.6,
      weapon: 'axe',
      steel: [0.4, 0.5, 0.45],
      extra: drowned,
      paintSkin: { grime: 0.6, ao: 0.9, mottle: { scale: 6, amount: 0.5, col: [0.5, 0.7, 0.75] } },
      style: { heavy: 0.25, attacks: ['chop', 'swing'], armed: 'one', idle: 'sway', gait: 'shamble' },
    }),
  ashen_marauder: (c) =>
    manLook(c, {
      height: 1.85,
      build: 'stout',
      armor: 0.7,
      helm: 'horned',
      cloth: 0x3a2a22,
      clothSurface: 'leather',
      robe: 0.4,
      weapon: 'sword',
      weaponSize: 1.15,
      steel: DARK,
      metal: 0x7a6a5a,
      extra: ashen,
      tunic: 1,
      style: { heavy: 0.35, attacks: ['chop', 'swing', 'thrust'], armed: 'one', idle: 'breathe', gait: 'march' },
    }),
  blood_chanter: (c) =>
    manLook(c, {
      height: 1.85,
      build: 'thin',
      head: 'bald',
      cloth: 0x5a1a1c,
      robe: 0.95,
      weapon: 'staff',
      weaponGlow: 1,
      extra: bloodMarks,
      skin: 0xb88a7a,
      style: { attacks: ['thrust'], armed: 'staff', idle: 'sway', castBoth: true },
    }),
  warlock_apostate: (c) =>
    manLook(c, {
      height: 1.88,
      hood: true,
      cloth: 0x3a1a14,
      robe: 0.9,
      cape: 0.85,
      weapon: 'staff',
      weaponGlow: 1.4,
      extra: warlockFlair,
      style: { attacks: ['thrust'], armed: 'staff', idle: 'still', castBoth: true },
    }),
  iron_captain: (c) =>
    manLook(c, {
      height: 2.0,
      build: 'brute',
      armor: 1,
      helm: 'great',
      cloth: 0x2a3a5a,
      cape: 0.8,
      robe: 0.4,
      weapon: 'greataxe',
      weaponSize: 1.1,
      steel: IRON,
      metalSurface: 'iron',
      metal: 0xc4ccd8,
      style: { heavy: 0.6, attacks: ['chop', 'swing', 'thrust'], armed: 'two', idle: 'still', gait: 'march', death: 'crash' },
    }),
};

export { HUMANOID };
export type { ManOpt };
