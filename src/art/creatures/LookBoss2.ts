/**
 * SLAY — bosses, part two (the deep floors): the ashen prophet, the iron
 * conqueror, the treant elder, the stalker prime, the stormcrown, the hive
 * queen, the lich of seven seals, the magma sovereign, the void herald, the
 * colossus of the deep, the first devourer and the Gaunt King.
 */
import * as THREE from 'three';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, membraneGeo, spikeGeo, tubeGeo } from './Sculpt';
import { bipedRig, type BipedShape } from './Rig';
import { V, boneLimbs, claws, fleshArms, fleshLegs, lerpV, pauldron, quatAlong, ribcage, seq, skirt, skull, trunk } from './Kit';
import { weapon } from './Arms';
import type { MotionStyle } from './Motion';
import type { CreatureMatDef } from './Materials';
import { manLook } from './LookHumanoid';
import { bugHead, bugLegs, bugLook, bugWings, abdomen, carapace } from './LookBug';
import { backSpines, fiendLook, horns } from './LookDemon';
import { botLook, gear, grille, lens, mechArms, rivets } from './LookConstruct';
import { bolt, fire, walkLook } from './LookElemental';
import { blobLook, eyeball, maw, tentacle } from './LookAberration';
import { branch, leaf, mossBeard } from './LookPlant';
import { featherWings } from './LookBeast';
import { bubbles, drips, mass, skullAt } from './LookOoze';
import { asBoss, chain, ring } from './LookBoss';

const BONE: RGB = [0.86, 0.8, 0.66];
const IRON: RGB = [0.42, 0.42, 0.45];
const DARK: RGB = [0.08, 0.07, 0.07];
const GOLD: RGB = [0.95, 0.75, 0.3];
const HORN: RGB = [0.18, 0.14, 0.12];
const TOOTH: RGB = [0.85, 0.8, 0.62];

/** A biped boss sculpted from nothing on its own rig. */
function bipedBoss(
  c: LookCtx,
  o: {
    kind: 'biped' | 'brute' | 'giant';
    shape: BipedShape;
    sculpt: (s: Sculpt, H: number) => void;
    mats: { skin: Omit<CreatureMatDef, 'glow'>; alt?: Omit<CreatureMatDef, 'glow'>; metal?: Omit<CreatureMatDef, 'glow'> };
    style: Partial<MotionStyle>;
    glow: number;
  },
): CreatureLook {
  const glow = c.visual.glow ?? o.glow;
  return asBoss(c, {
    key: `id:${c.id}`,
    rig: () => bipedRig(o.kind, o.shape),
    sculpt: (s) => o.sculpt(s, o.shape.height),
    mats: {
      skin: { ...o.mats.skin, glow },
      alt: { surface: 'cloth', tint: 0x3a3430, ...o.mats.alt, glow },
      metal: { surface: 'iron', tint: 0x8a8078, ...o.mats.metal, glow },
    },
    style: o.style,
  });
}

/** A circlet with spikes standing up from it. */
function spikeCrown(s: Sculpt, bone: string, c: THREE.Vector3, r: number, n: number, len: number, col: RGB, glowEvery = 0, mat: 'skin' | 'alt' | 'metal' = 'metal'): void {
  s.hard(bone, ring(c, r, r * 0.12), mat, col);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = c.clone().add(V(Math.sin(a) * r, 0, Math.cos(a) * r));
    const l = len * (i % 2 ? 0.65 : 1) * (Math.cos(a) > 0.7 ? 1.3 : 1);
    s.hard(bone, spikeGeo(p, p.clone().add(V(Math.sin(a) * l * 0.2, l, Math.cos(a) * l * 0.2)), r * 0.14, 4, undefined, 1), mat, col, glowEvery && i % glowEvery === 0 ? 0.8 : 0);
  }
}

// ---------------------------------------------------------------------------

const BOSS_B: Record<string, LookFactory> = {
  // The ashen prophet: a tall burnt preacher, blindfolded, in a charred robe,
  // wings of smouldering feathers, a halo of fire, a censer-staff.
  ashen_prophet: (c) =>
    bipedBoss(c, {
      kind: 'biped',
      glow: 0xff5500,
      shape: { height: 2.0, hip: 0.5, shoulders: 0.12, hips: 0.06, arms: 1.08, hunch: 0.12, wings: 1.6, head: 0.95 },
      mats: { skin: { surface: 'basalt', tint: 0x8a807a }, alt: { surface: 'cloth', tint: 0x3a2a24 }, metal: { surface: 'iron', tint: 0x5a4a40 } },
      sculpt: (s, H) => {
        trunk(s, { chest: [0.09, 0.065, 0.09], pelvis: [0.07, 0.055, 0.055], shoulders: 0.03 });
        fleshArms(s, { r: 0.022, claws: 0.04, clawCol: DARK });
        fleshLegs(s, { r: 0.034 });
        s.limb('neck', s.j('chest').lerp(s.j('neck'), 0.4), s.j('head'), 0.026 * H, 0.022 * H, { k: 0.015 * H });
        const h = s.j('head').add(V(0, 0.03 * H, 0.01 * H));
        s.ball('head', h, V(0.045 * H, 0.06 * H, 0.052 * H), { k: 0.012 * H });
        s.ball('head', h.clone().add(V(0, -0.04 * H, 0.03 * H)), V(0.028 * H, 0.025 * H, 0.03 * H), { k: 0.012 * H });
        // A blindfold of burning cloth, embers where the eyes would be.
        s.ball('head', h.clone().add(V(0, 0.008 * H, 0.012 * H)), V(0.05 * H, 0.012 * H, 0.05 * H), { mat: 'alt', k: 0.004 * H });
        s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.018 * H, 0.008 * H, 0.062 * H)), 0.007 * H, 2));
        // The halo: a ring of iron behind the head, flames standing on it.
        const hc = h.clone().add(V(0, 0.04 * H, -0.07 * H));
        s.hard('head', ring(hc, 0.11 * H, 0.008 * H, V(0, 0.1, 1), 20), 'metal', [0.35, 0.3, 0.28]);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const p = hc.clone().add(V(Math.sin(a) * 0.11 * H, Math.cos(a) * 0.11 * H, 0));
          fire(s, 'head', p, 2, 0.05 * H, 0.012 * H, 401 + i);
        }
        // The robe, long and torn, a mantle of ash over the shoulders.
        skirt(s, { len: 1.0, flare: 0.12, top: 0.06, thick: 0.012 });
        s.ball('chest', s.j('chest').add(V(0, 0.03 * H, -0.005 * H)), V(0.12 * H, 0.08 * H, 0.085 * H), { mat: 'alt', k: 0.03 * H });
        s.pair((side) => {
          s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.035 * H, 0.04 * H, { mat: 'alt', k: 0.02 * H });
          s.limb(`fore${side}`, s.j(`fore${side}`), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.8), 0.04 * H, 0.055 * H, { mat: 'alt', k: 0.02 * H });
        });
        // Wings of smouldering feathers.
        featherWings(s, { len: 0.75 * H, mat: 'alt', col: [0.55, 0.45, 0.4] });
        s.pair((side) => {
          const w = s.j(`wing${side}3`);
          const t = s.j(`wing${side}Tip`);
          for (let i = 0; i < 3; i++) s.boil(`wing${side}3`, lerpV(w, t, 0.3 + i * 0.3).add(V(0, -0.02 * H, -0.08 * H)), 0.01 * H, 1, [1.4, 0.6, 0.2]);
        });
        // The censer-staff: a burning cage at the head of the staff.
        weapon(s, 'staff', { glow: 0.6, size: 1.15, wood: [0.15, 0.12, 0.1] });
        const hr = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
        const top = hr.clone().addScaledVector(V(0, 0.36, 0.93).normalize(), 0.6 * 1.15 * H * 0.9);
        s.hard('handR', ballGeo(top, 0.035 * H, 1), 'metal', [0.3, 0.25, 0.2]);
        fire(s, 'handR', top.clone().add(V(0, 0.02 * H, 0)), 5, 0.08 * H, 0.025 * H, 411);
        // Chains of prayer beads, embers in the ash.
        for (let i = 0; i < 9; i++) {
          const a = (i / 8 - 0.5) * 2.2;
          s.hard('chest', ballGeo(s.j('neck').add(V(Math.sin(a) * 0.06 * H, -0.04 * H - Math.cos(a * 0.5) * 0.06 * H + 0.06 * H, Math.cos(a) * 0.05 * H + 0.02 * H)), 0.008 * H, 0), 'metal', [0.6, 0.5, 0.4]);
        }
        s.paint.skin = { base: [1.3, 1.25, 1.2], grime: 0.4, ao: 0.9, veins: { scale: 11, cut: 0.955, glow: 0.45, col: [1.5, 0.55, 0.15] } };
        s.paint.alt = { grime: 0.6, ao: 0.85, tips: { amount: 0.5, col: [0.25, 0.15, 0.12] }, mottle: { scale: 5, amount: 0.3, col: [0.5, 0.45, 0.4] } };
        s.paint.metal = { grime: 0.4, ao: 0.7 };
      },
      style: { heavy: 0.35, attacks: ['swing', 'thrust', 'hurl'], armed: 'staff', castBoth: true, idle: 'sway', gait: 'walk', spawn: 'drop', death: 'collapse' },
    }),

  // The iron conqueror: a giant in full plate, a smooth helm with no slit,
  // banners crossed on his back, a greatsword, blue light between the plates.
  iron_conqueror: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 2.0,
        build: 'stout',
        armor: 1,
        helm: 'great',
        cape: 0.9,
        belt: 1,
        weapon: 'sword',
        weaponSize: 1.65,
        weaponGlow: 0.8,
        steel: [0.75, 0.78, 0.82],
        metal: 0xc4ccd8,
        metalSurface: 'steel',
        cloth: 0x2a3050,
        extra: (s, H) => {
          // Seal the helm: a smooth faceplate over the slit, a ridge and a plume of horsehair.
          const h = s.j('head').add(V(0, 0.05 * H, 0.012 * H));
          s.ball('head', h.clone().add(V(0, -0.005 * H, 0.03 * H)), V(0.06 * H, 0.065 * H, 0.06 * H), { mat: 'metal', k: 0.01 * H });
          s.box('head', h.clone().add(V(0, 0.06 * H, 0)), V(0.008 * H, 0.025 * H, 0.07 * H), { mat: 'metal', k: 0.004 * H });
          // Spiked pauldrons, one taller than the other.
          s.pair((side, x) => {
            pauldron(s, side, x > 0 ? 0.085 : 0.075, 'metal', 3);
            const sh = s.j(`arm${side}`).add(V(x * 0.03 * H, 0.08 * H, 0));
            for (let i = 0; i < 3; i++) s.hard(`arm${side}`, spikeGeo(sh.clone().add(V(x * i * 0.02 * H, -i * 0.01 * H, 0)), sh.clone().add(V(x * (0.03 + i * 0.03) * H, (0.08 - i * 0.015) * H, -0.01 * H)), 0.01 * H, 4, undefined, 2), 'metal');
          });
          // A tabard down the front.
          s.box('hips', s.j('hips').add(V(0, -0.12 * H, 0.08 * H)), V(0.05 * H, 0.14 * H, 0.006 * H), { mat: 'alt', k: 0.01 * H });
          // Two banners crossed on his back.
          const bk = s.j('chest').add(V(0, 0, -0.1 * H));
          s.pair((_side, x) => {
            const a = bk.clone().add(V(-x * 0.05 * H, -0.12 * H, 0));
            const t = bk.clone().add(V(x * 0.14 * H, 0.42 * H, -0.04 * H));
            s.hard('chest', tubeGeo([a, t], () => 0.008 * H, 5), 'metal', [0.3, 0.25, 0.2]);
            const fl = lerpV(a, t, 0.78);
            s.hard('chest', boxGeo(fl.clone().add(V(x * 0.05 * H, -0.04 * H, -0.004 * H)), V(0.05 * H, 0.08 * H, 0.004 * H), quatAlong(t.clone().sub(a))), 'alt', [0.35, 0.4, 0.75]);
            s.hard('chest', spikeGeo(t, t.clone().add(t.clone().sub(a).normalize().multiplyScalar(0.05 * H)), 0.01 * H, 4, undefined, 1), 'metal', GOLD);
          });
          // Trophies: three helms hanging from his belt.
          for (let i = 0; i < 3; i++) {
            const p = s.j('hips').add(V((i - 1) * 0.09 * H + 0.02 * H, -0.06 * H, 0.06 * H - Math.abs(i - 1) * 0.05 * H));
            s.hard('hips', ballGeo(p, 0.025 * H, 1).scale(1, 1, 1), 'metal', [0.45, 0.42, 0.4]);
          }
          // Light between the plates.
          s.boil('chest', s.j('chest').add(V(0, 0.0, 0.11 * H)), 0.012 * H, 1, [0.5, 0.8, 1.4]);
        },
        style: { heavy: 0.75, attacks: ['chop', 'swing', 'thrust'], armed: 'two', idle: 'breathe', gait: 'march', spawn: 'rise', death: 'topple' },
      }),
    ),

  // The treant elder: a vast drowned oak, the dead of the temple bound in its
  // roots and hung from its branches, a hollow face lit green.
  treant_elder_vhoss: (c) =>
    asBoss(
      c,
      walkLook(c, {
        height: 1.95,
        kind: 'giant',
        rig: { hip: 0.42, shoulders: 0.22, hips: 0.095, arms: 1.4, hunch: 0.35, head: 0.7, armOut: 0.42 },
        skin: { surface: 'bark', tint: 0x8a7458 },
        alt: { surface: 'moss', tint: 0x5a7a3a },
        metal: { surface: 'bone', tint: 0xcfc6a8 },
        sculpt: (s, H) => {
          trunk(s, { chest: [0.18, 0.13, 0.14], pelvis: [0.12, 0.09, 0.09], shoulders: 0.075, hump: 0.08 });
          fleshArms(s, { r: 0.055, swell: 0.025 });
          fleshLegs(s, { r: 0.07, swell: 0.02, footW: 0.08 });
          const ch = s.j('chest');
          // A crown of great branches.
          s.pair((side, x) => {
            const a = s.j(`arm${side}`);
            branch(s, `arm${side}`, a.clone().add(V(x * 0.03 * H, 0.06 * H, -0.03 * H)), V(x * 0.7, 1, -0.3), 0.4 * H, 0.035 * H, 421 + x, 2, 3);
            claws(s, `hand${side}`, `hand${side}Tip`, 5, 0.13, 0.012, 'skin', undefined, 0.45);
            // Roots instead of toes, spreading wide.
            const f = s.j(`foot${side}`);
            for (let i = 0; i < 5; i++) {
              const a2 = (i / 4 - 0.5) * 2.2;
              const p = f.clone().add(V(Math.sin(a2) * 0.03 * H, -0.01 * H, 0.02 * H));
              s.hard(`foot${side}`, spikeGeo(p, p.clone().add(V(Math.sin(a2) * 0.13 * H, -0.02 * H, Math.cos(a2) * 0.12 * H)), 0.018 * H, 4, V(0, 0.015 * H, 0), 2), 'skin');
            }
          });
          branch(s, 'chest', ch.clone().add(V(0, 0.12 * H, -0.08 * H)), V(0.1, 1, -0.4), 0.45 * H, 0.04 * H, 425, 2, 4);
          branch(s, 'chest', ch.clone().add(V(-0.08 * H, 0.08 * H, -0.1 * H)), V(-0.6, 0.8, -0.6), 0.32 * H, 0.03 * H, 427, 2, 3);
          branch(s, 'chest', ch.clone().add(V(0.08 * H, 0.08 * H, -0.1 * H)), V(0.6, 0.7, -0.7), 0.3 * H, 0.03 * H, 429, 2, 3);
          // The hollow face: a deep split, a green light inside.
          const h = s.j('head').add(V(0, 0.02 * H, 0.03 * H));
          s.ball('head', h, V(0.065 * H, 0.07 * H, 0.06 * H), { k: 0.02 * H });
          s.ball('head', h.clone().add(V(0, 0.035 * H, 0.035 * H)), V(0.07 * H, 0.02 * H, 0.03 * H), { k: 0.012 * H });
          s.pair((_side, x) => {
            s.ball('head', h.clone().add(V(x * 0.026 * H, 0.012 * H, 0.055 * H)), 0.017 * H, { sub: true, k: 0.004 * H });
            s.eye('head', h.clone().add(V(x * 0.026 * H, 0.012 * H, 0.045 * H)), 0.011 * H, 2);
          });
          s.ball('head', h.clone().add(V(0, -0.03 * H, 0.055 * H)), V(0.035 * H, 0.016 * H, 0.025 * H), { sub: true, k: 0.004 * H });
          s.boil('head', h.clone().add(V(0, -0.03 * H, 0.04 * H)), 0.012 * H, 0.8, [0.6, 1.3, 0.7]);
          mossBeard(s, 'head', h.clone().add(V(0, -0.045 * H, 0.05 * H)), 0.1 * H, 0.2 * H, 9, 431);
          mossBeard(s, 'chest', ch.clone().add(V(0, 0.02 * H, 0.14 * H)), 0.18 * H, 0.14 * H, 7, 433);
          s.pair((side, x) => s.ball(`arm${side}`, s.j(`arm${side}`).add(V(x * 0.02 * H, 0.06 * H, 0)), V(0.075 * H, 0.035 * H, 0.07 * H), { mat: 'alt', k: 0.02 * H }));
          // The dead bound into him: skulls and ribs in the trunk, roots wrapped round them.
          const r = seq(441);
          for (let i = 0; i < 4; i++) {
            const p = lerpV(s.j('hips'), ch, 0.2 + r() * 0.7).add(V((r() - 0.5) * 0.24 * H, 0, 0.12 * H));
            skullAt(s, i % 2 ? 'chest' : 'spine', p, 0.025 * H, V((r() - 0.5) * 0.5, 0, 1));
            s.hard(i % 2 ? 'chest' : 'spine', tubeGeo([p.clone().add(V(-0.04 * H, 0.03 * H, 0)), p.clone().add(V(0, 0.01 * H, 0.03 * H)), p.clone().add(V(0.04 * H, -0.03 * H, 0))], () => 0.006 * H, 4), 'skin');
          }
          for (let i = 0; i < 3; i++) {
            const p = ch.clone().add(V((i - 1) * 0.08 * H, -0.06 * H, 0.13 * H));
            for (let k = 0; k < 3; k++) s.hard('chest', tubeGeo([p.clone().add(V(-0.025 * H, -k * 0.018 * H, 0)), p.clone().add(V(0, -k * 0.018 * H + 0.004 * H, 0.012 * H)), p.clone().add(V(0.025 * H, -k * 0.018 * H, 0))], () => 0.004 * H, 4), 'metal', BONE);
          }
          // Two of the dead hang from the branches by roots, still twitching.
          s.pair((side, x) => {
            const a = s.j(`arm${side}`).add(V(x * 0.15 * H, 0.22 * H, -0.06 * H));
            const top = a.clone().add(V(0, -0.12 * H, 0));
            s.hard(`arm${side}`, tubeGeo([a, top], () => 0.005 * H, 4), 'skin');
            skullAt(s, `arm${side}`, top.clone().add(V(0, -0.02 * H, 0)), 0.018 * H, V(0, -0.3, 1));
            s.hard(`arm${side}`, tubeGeo([top.clone().add(V(0, -0.04 * H, 0)), top.clone().add(V(0, -0.14 * H, 0.01 * H))], () => 0.006 * H, 4), 'metal', BONE);
            for (let k = 0; k < 3; k++) s.hard(`arm${side}`, tubeGeo([top.clone().add(V(-0.02 * H, -0.06 * H - k * 0.025 * H, 0)), top.clone().add(V(0, -0.055 * H - k * 0.025 * H, 0.012 * H)), top.clone().add(V(0.02 * H, -0.06 * H - k * 0.025 * H, 0))], () => 0.003 * H, 3), 'metal', BONE);
          });
          // Water weed trailing from the arms.
          s.pair((side) => {
            for (let i = 0; i < 3; i++) leaf(s, `fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.2 + i * 0.25), V(0, -1, -0.2), 0.12 * H, 0.025 * H, [0.35, 0.5, 0.25]);
          });
        },
        paint: { skin: { grime: 0.55, ao: 0.95, mottle: { scale: 5, amount: 0.4, col: [0.4, 0.5, 0.35] }, top: { amount: 0.2, col: [0.9, 1.1, 0.8] } }, alt: { grime: 0.3, ao: 0.85, tips: { amount: 0.4, col: [0.5, 0.45, 0.25] } } },
        lumps: { amp: 0.014, scale: 8 },
        soft: { skin: 0.02 },
        style: { heavy: 0.95, attacks: ['slam', 'swing', 'stomp'], idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
      }),
    ),

  // The stalker prime: tall, thin, six-armed, no eyes at all, a head split by
  // a vertical mouth, blades of bone down its forearms.
  stalker_prime: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.0,
        hip: 0.52,
        hunch: 0.35,
        head: 0.9,
        arms: 1.3,
        thick: 0.95,
        digitigrade: true,
        arms2: true,
        skin: 0x3a3346,
        skinSurface: 'hide',
        alt: { surface: 'chitin', tint: 0x1a1620 },
        claws: 0.1,
        toes: 0.05,
        faceFn: (s, H) => {
          // A long smooth head, no eyes, split top to chin by a mouth of needles.
          const h = s.j('head').add(V(0, 0.03 * H, 0.0));
          s.limb('head', h.clone().add(V(0, -0.03 * H, 0.02 * H)), h.clone().add(V(0, 0.07 * H, -0.06 * H)), 0.04 * H, 0.03 * H, { k: 0.02 * H });
          s.box('head', h.clone().add(V(0, 0.0, 0.04 * H)), V(0.005 * H, 0.05 * H, 0.03 * H), { sub: true, k: 0.004 * H });
          for (let i = 0; i < 8; i++) {
            const y = (i / 7 - 0.5) * 0.08 * H;
            s.pair((_side, x) => {
              const p = h.clone().add(V(x * 0.006 * H, y, 0.05 * H));
              s.hard('head', spikeGeo(p, p.clone().add(V(-x * 0.008 * H, 0, -0.004 * H)), 0.002 * H, 3, undefined, 1), 'metal', TOOTH);
            });
          }
          s.boil('head', h.clone().add(V(0, 0.0, 0.03 * H)), 0.008 * H, 1, [0.7, 0.4, 1.4]);
        },
        extra: (s, H) => {
          // Bone blades down the upper forearms, spines down the back.
          s.pair((side, x) => {
            const f = s.j(`fore${side}`);
            const w = s.j(`hand${side}`);
            s.hard(`fore${side}`, spikeGeo(lerpV(f, w, 0.2), w.clone().add(w.clone().sub(f).multiplyScalar(0.9)).add(V(x * 0.02 * H, 0.02 * H, 0)), 0.014 * H, 4, V(x * 0.02 * H, 0, -0.02 * H), 3), 'alt');
          });
          backSpines(s, 9, 0.09, 0.1, [0.15, 0.12, 0.18]);
          // Starved: the ribs stand out of the skin.
          ribcage(s, { w: 0.07, d: 0.052, ribs: 6, r: 0.006, mat: 'alt', col: [0.55, 0.5, 0.6] });
          // Black chitin over the shoulders and down the spine, lapping plates.
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`);
            for (let i = 0; i < 3; i++) {
              const c = sh.clone().add(V(x * (0.01 + i * 0.012) * H, (0.035 - i * 0.03) * H, -0.005 * H));
              s.ball(`arm${side}`, c, V((0.05 - i * 0.008) * H, 0.022 * H, (0.055 - i * 0.008) * H), { mat: 'alt', k: 0.003 * H });
            }
            s.hard(`arm${side}`, spikeGeo(sh.clone().add(V(x * 0.02 * H, 0.04 * H, -0.01 * H)), sh.clone().add(V(x * 0.06 * H, 0.16 * H, -0.05 * H)), 0.012 * H, 4, undefined, 2), 'alt');
          });
          const ch = s.j('chest');
          const hp = s.j('hips');
          for (let i = 0; i < 6; i++) {
            const c = lerpV(ch, hp, i / 6).add(V(0, 0.03 * H, -0.06 * H));
            s.ball('chest', c, V(0.035 * H, 0.03 * H, 0.016 * H), { mat: 'alt', k: 0.003 * H });
          }
          // A ragged shroud of skin about the hips.
          skirt(s, { len: 0.55, flare: 0.06, top: 0.02, thick: 0.008, front: false });
        },
        paintSkin: { base: [1.05, 1.0, 1.15], grime: 0.55, ao: 0.95, mottle: { scale: 7, amount: 0.45, col: [0.3, 0.26, 0.38] }, tips: { amount: 0.55, col: [0.16, 0.13, 0.2] }, veins: { scale: 9, cut: 0.94, glow: 0, col: [0.16, 0.12, 0.2] } },
        style: { heavy: 0.3, attacks: ['claw', 'lunge', 'thrust'], armed: 'none', idle: 'prowl', gait: 'stalk', spawn: 'form', death: 'collapse' },
      }),
    ),

  // The stormcrown: a giant of thundercloud and slate, wings of storm, a crown
  // of standing lightning, bolts running down his arms.
  stormcrown_azhek: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.0,
        kind: 'giant',
        hip: 0.46,
        hunch: 0.2,
        head: 0.8,
        arms: 1.25,
        shoulders: 0.2,
        armOut: 0.4,
        thick: 1.3,
        wings: 1.9,
        wingMat: 'alt',
        skin: 0x6a8ab8,
        skinSurface: 'ice',
        alt: { surface: 'shade', tint: 0x5a6478 },
        metal: { surface: 'brass', tint: 0xb09040 },
        claws: 0.04,
        face: { size: 0.8, snout: 0.15, brow: 1.8, jaw: 1.1, ears: 0, eyes: 2.2 },
        extra: (s, H) => {
          // The crown of lightning: bolts standing up from a gold circlet.
          const h = s.j('head');
          const cc = h.clone().add(V(0, 0.07 * H, 0));
          s.hard('head', ring(cc, 0.055 * H, 0.008 * H), 'metal', GOLD);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const p = cc.clone().add(V(Math.sin(a) * 0.055 * H, 0, Math.cos(a) * 0.055 * H));
            bolt(s, 'head', p, p.clone().add(V(Math.sin(a) * 0.04 * H, (0.12 + (i % 2) * 0.06) * H, Math.cos(a) * 0.03 * H)), 0.006 * H, 451 + i);
          }
          // Lightning running down both arms into the fists.
          s.pair((side, x) => {
            bolt(s, `arm${side}`, s.j(`arm${side}`).add(V(x * 0.03 * H, 0.03 * H, 0.02 * H)), s.j(`fore${side}`).add(V(0, 0, 0.03 * H)), 0.005 * H, x > 0 ? 461 : 462);
            bolt(s, `fore${side}`, s.j(`fore${side}`).add(V(0, 0, 0.03 * H)), s.j(`hand${side}Tip`), 0.005 * H, x > 0 ? 463 : 464);
            s.boil(`hand${side}`, s.j(`hand${side}Tip`), 0.02 * H, 1, [1.4, 1.35, 0.8]);
          });
          // Bracers and a belt of gold, a kilt of cloud.
          s.pair((side) => s.limb(`fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.45), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.85), 0.05 * H, 0.05 * H, { mat: 'metal', k: 0.005 * H }));
          skirt(s, { len: 0.6, flare: 0.08, top: 0.03, thick: 0.014 });
          // Storm clouds massed on his shoulders.
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`);
            for (let i = 0; i < 3; i++) s.ball(`arm${side}`, sh.clone().add(V(x * (0.0 + i * 0.03) * H, (0.06 - i * 0.015) * H, (i - 1) * 0.04 * H)), (0.06 - i * 0.01) * H, { mat: 'alt', k: 0.03 * H });
          });
        },
        paintSkin: { base: [1.15, 1.2, 1.3], grime: 0.3, ao: 0.85, mottle: { scale: 4, amount: 0.4, col: [0.5, 0.55, 0.7] }, veins: { scale: 10, cut: 0.958, glow: 0.45, col: [1.4, 1.35, 0.7] } },
        style: { heavy: 0.75, attacks: ['slam', 'swing', 'claw'], armed: 'none', castBoth: true, idle: 'breathe', gait: 'march', spawn: 'drop', death: 'crash' },
      }),
      { mats: { skin: { surface: 'ice', tint: 0x6a8ab8, glow: c.visual.glow ?? 0xffee66, rough: 0.6 } } },
    ),

  // The hive queen: a crowned insect throne of a body, an abdomen as long as
  // a wagon banded with glowing amber, wings folded, scythes raised.
  hive_queen_zsarra: (c) =>
    asBoss(
      c,
      bugLook(c, {
        kind: 'insect',
        body: 0.45,
        ride: 0.75,
        abdomen: 1.6,
        reach: 1.7,
        wings: 1,
        scythes: true,
        head: 1.1,
        tint: 0x5a3e22,
        surface: 'chitin',
        alt: { surface: 'slime', tint: 0xe0a030 },
        metal: { surface: 'chitin', tint: 0xc09a4a },
        sculpt: (s, B) => {
          const b = s.j('body');
          // A raised armoured thorax.
          s.ball('body', b.clone().add(V(0, B * 0.1, B * 0.05)), V(B * 0.85, B * 0.8, B * 1.0), { k: B * 0.1 });
          carapace(s, { r: B * 0.95, ridge: 0.6, spikes: 6, hornCol: [0.2, 0.14, 0.1] });
          // The abdomen: long and swollen, amber bands lit from within, an egg tube at its end.
          abdomen(s, { r: B * 1.35, segs: 6, bulge: 1.0, sag: B * 0.3, len: 1.25, band: { mat: 'alt', w: 0.85 } });
          const a = s.j('abdomen');
          const t = s.j('abdomenTip');
          for (let i = 0; i < 6; i++) {
            const p = lerpV(a, t, 0.15 + i * 0.13);
            s.pair((_side, x) => s.boil('abdomen', p.clone().add(V(x * B * 0.9, -B * 0.1, 0)), B * 0.12, 0.9, [1.3, 0.85, 0.3]));
          }
          s.limb('abdomen', t.clone().add(V(0, 0, B * 0.3)), t.clone().add(V(0, -B * 0.5, -B * 0.4)), B * 0.18, B * 0.1, { mat: 'alt', k: B * 0.1 });
          // The crowned head: a fan of horn plates, many eyes, great mandibles.
          bugHead(s, { w: B * 0.65, eyes: 1.3, glow: 1.2, antennae: 2.4, mand: 1.4, mandCol: [0.15, 0.1, 0.08] });
          const h = s.j('head');
          for (let i = 0; i < 7; i++) {
            const ang = (i / 6 - 0.5) * 2.2;
            const p = h.clone().add(V(Math.sin(ang) * B * 0.35, B * 0.3, -B * 0.1));
            s.hard('head', spikeGeo(p, p.clone().add(V(Math.sin(ang) * B * 0.45, B * (0.95 - Math.abs(ang) * 0.2), -B * 0.3)), B * 0.09, 4, V(0, 0, -B * 0.12), 2), 'metal', [0.95, 0.7, 0.25], i === 3 ? 0.6 : 0);
          }
          bugLegs(s, { r: B * 0.09, spines: 2 });
          // Wings raised over the abdomen like a cloak of amber glass, veined
          // dark, standing clear of the body so they read from above.
          s.pair((side, x) => {
            const n = `wing${side}`;
            if (!s.has(n)) return;
            const base = s.j(n).add(V(0, B * 0.55, -B * 0.1));
            const end = base.clone().add(V(x * B * 1.5, B * 1.15, -B * 2.1));
            const perp = V(x * B * 0.75, -B * 0.1, B * 0.25);
            const rim = [lerpV(base, end, 0.25).add(perp.clone().multiplyScalar(0.7)), lerpV(base, end, 0.7).add(perp), end, lerpV(base, end, 0.75).sub(perp.clone().multiplyScalar(0.45)), lerpV(base, end, 0.3).sub(perp.clone().multiplyScalar(0.3))];
            s.hard(n, membraneGeo(base, rim, 0.01 * B, 0.06), 'alt', [1.15, 0.8, 0.35], 0.35);
            for (const r of [rim[0]!, rim[1]!, end, rim[3]!]) s.hard(n, tubeGeo([base, lerpV(base, r, 0.55), r], () => B * 0.025, 3), 'metal', [0.16, 0.11, 0.07]);
          });
          if (s.has('scytheL')) s.pair((side) => s.hard(`scythe${side}`, spikeGeo(s.j(`scythe${side}`), s.j(`scythe${side}Tip`), B * 0.08, 4, V(0, B * 0.2, B * 0.1), 3), 'metal', [0.25, 0.18, 0.1]));
        },
        paint: { base: [1.3, 1.25, 1.2], grime: 0.3, ao: 0.9, bands: { axis: 'z', period: 0.16, amount: 0.3 }, top: { amount: 0.25, col: [1.3, 1.15, 0.85] } },
        style: { heavy: 0.75, attacks: ['claw', 'bite', 'sting'], idle: 'breathe', gait: 'scuttle', spawn: 'emerge', death: 'flip', castBoth: true },
      }),
    ),

  // The lich of seven seals: a crowned skeleton in robes of state, gliding,
  // seven seals hanging on chains round him (six broken, one still burning).
  lich_of_seven_seals: (c) =>
    bipedBoss(c, {
      kind: 'biped',
      glow: 0x60ffb0,
      shape: { height: 2.05, hip: 0.5, shoulders: 0.14, hips: 0.06, arms: 1.1, hunch: 0.12 },
      mats: { skin: { surface: 'bone', tint: 0xb8b09a, glowIntensity: 3 }, alt: { surface: 'cloth', tint: 0x2e2c38 }, metal: { surface: 'gold', tint: 0xb89848 } },
      sculpt: (s, H) => {
        skull(s, { glow: 2, size: 1.05 });
        ribcage(s, { w: 0.075, d: 0.058 });
        boneLimbs(s, { r: 0.013, claws: 0.07 });
        // Robes of state with a high stiff collar and a mantle of gold.
        skirt(s, { len: 1.0, flare: 0.14, top: 0.08, thick: 0.014 });
        s.ball('chest', s.j('chest').add(V(0, 0.02 * H, 0)), V(0.14 * H, 0.12 * H, 0.095 * H), { mat: 'alt', k: 0.03 * H });
        s.ball('chest', s.j('chest').add(V(0, 0.08 * H, -0.01 * H)), V(0.16 * H, 0.04 * H, 0.1 * H), { mat: 'metal', k: 0.02 * H });
        s.pair((side, x) => {
          s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.04 * H, 0.05 * H, { mat: 'alt', k: 0.02 * H });
          s.limb(`fore${side}`, s.j(`fore${side}`), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.85), 0.05 * H, 0.075 * H, { mat: 'alt', k: 0.02 * H });
          const n = s.j('neck');
          s.box('chest', n.clone().add(V(x * 0.08 * H, 0.05 * H, -0.05 * H)), V(0.06 * H, 0.11 * H, 0.008 * H), { mat: 'alt', k: 0.01 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x * 0.5, x * 0.25)) });
        });
        // A tall crown.
        spikeCrown(s, 'head', s.j('head').add(V(0, 0.1 * H, 0.012 * H)), 0.06 * H, 9, 0.11 * H, GOLD, 3);
        // The seven seals: discs on chains from a girdle, six cracked dark, one alight.
        const hp = s.j('hips');
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.2;
          const top = hp.clone().add(V(Math.sin(a) * 0.12 * H, 0.04 * H, Math.cos(a) * 0.1 * H));
          const end = top.clone().add(V(Math.sin(a) * 0.08 * H, -0.12 * H, Math.cos(a) * 0.08 * H));
          chain(s, 'hips', top, end, 0.012 * H, [0.6, 0.5, 0.3]);
          const d = V(Math.sin(a), 0, Math.cos(a));
          const live = i === 0;
          const disc = new THREE.CylinderGeometry(0.04 * H, 0.04 * H, 0.008 * H, 14).applyQuaternion(quatAlong(d)).translate(end.x + d.x * 0.0, end.y - 0.04 * H, end.z);
          s.hard('hips', disc, 'metal', live ? [0.6, 1.2, 0.85] : [0.25, 0.22, 0.2], live ? 0.8 : 0);
          if (!live) {
            // The crack through a broken seal.
            const c0 = end.clone().add(V(0, -0.04 * H, 0)).addScaledVector(d, 0.006 * H);
            s.hard('hips', boxGeo(c0, V(0.002 * H, 0.04 * H, 0.002 * H), new THREE.Quaternion().setFromAxisAngle(d, 0.5)), 'skin', [0.6, 1.2, 0.85], 0.6);
          }
        }
        // The staff of office, a skull at its head.
        weapon(s, 'staff', { glow: 1.8, size: 1.2, wood: [0.15, 0.13, 0.18] });
        const hr = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
        const top = hr.clone().addScaledVector(V(0, 0.36, 0.93).normalize(), 0.6 * 1.2 * H * 0.9);
        skullAt(s, 'handR', top, 0.03 * H, V(0, 0.2, 1));
        // A phylactery burning in the left hand.
        s.boil('handL', lerpV(s.j('handL'), s.j('handLTip'), 0.85).add(V(0, 0.02 * H, 0.02 * H)), 0.025 * H, 1, [0.6, 1.3, 0.9]);
        s.paint.skin = { grime: 0.3, ao: 0.9, mottle: { scale: 7, amount: 0.3, col: [0.4, 0.38, 0.3] } };
        s.paint.alt = { grime: 0.4, ao: 0.85, bands: { axis: 'y', period: 0.18, amount: 0.25 }, mottle: { scale: 4, amount: 0.3, col: [0.3, 0.5, 0.4] } };
        s.paint.metal = { grime: 0.3, ao: 0.6 };
      },
      style: { heavy: 0.3, attacks: ['swing', 'thrust'], armed: 'staff', castBoth: true, spawn: 'form', death: 'scatter', idle: 'still', gait: 'glide' },
    }),

  // The magma sovereign: a hunched lord of black rock with fire showing through
  // every crack, horns like a broken crown, burnt wings, magma dripping off him.
  magma_sovereign: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.05,
        kind: 'giant',
        hip: 0.44,
        hunch: 0.4,
        head: 0.78,
        arms: 1.3,
        shoulders: 0.22,
        armOut: 0.42,
        thick: 1.6,
        digitigrade: true,
        tail: 6,
        tailLen: 0.7,
        tailTip: 'spade',
        wings: 1.8,
        skin: 0x3a2a24,
        skinSurface: 'basalt',
        alt: { surface: 'lava', tint: 0xc05020 },
        metal: { surface: 'basalt', tint: 0x1a1614 },
        horns: 'crown',
        hornLen: 1.3,
        hornCol: [0.12, 0.1, 0.09],
        face: { size: 0.78, snout: 0.5, brow: 2.0, jaw: 1.4, ears: 0, eyes: 2.4 },
        claws: 0.07,
        toes: 0.05,
        spines: 7,
        extra: (s, H) => {
          horns(s, 'ram', 0.78 * H, 1.2, [0.12, 0.1, 0.09], 0.5);
          // Fire on the shoulders and down the spine, magma dripping from the hands.
          s.pair((side, x) => {
            fire(s, `arm${side}`, s.j(`arm${side}`).add(V(x * 0.02 * H, 0.06 * H, 0)), 6, 0.14 * H, 0.05 * H, x > 0 ? 471 : 472);
            const t = s.j(`hand${side}Tip`);
            s.limb(`hand${side}`, t, t.clone().add(V(0, -0.08 * H, 0)), 0.012 * H, 0.006 * H, { mat: 'alt', k: 0.008 * H });
            s.boil(`hand${side}`, lerpV(s.j(`hand${side}`), t, 0.5), 0.025 * H, 1, [1.5, 0.7, 0.2]);
          });
          fire(s, 'chest', s.j('neck').add(V(0, 0.0, -0.06 * H)), 8, 0.16 * H, 0.12 * H, 473);
          // A molten heart showing through a split in the chest, crust plates over the belly.
          s.ball('chest', s.j('chest').add(V(0, -0.02 * H, 0.14 * H)), V(0.03 * H, 0.07 * H, 0.03 * H), { mat: 'alt', k: 0.01 * H });
          s.boil('chest', s.j('chest').add(V(0, -0.02 * H, 0.16 * H)), 0.025 * H, 1, [1.6, 0.8, 0.25]);
          // A girdle of chain with molten links.
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            s.hard('hips', ring(s.j('hips').add(V(Math.sin(a) * 0.12 * H, 0.02 * H, Math.cos(a) * 0.1 * H)), 0.012 * H, 0.004 * H, V(Math.cos(a), 0, -Math.sin(a)), 8), 'alt', [1.2, 0.5, 0.2], 0.5);
          }
        },
        paintSkin: { base: [1.5, 1.4, 1.35], grime: 0.4, ao: 0.9, top: { amount: 0.15, col: [1.2, 1.1, 1.05] }, veins: { scale: 8, cut: 0.952, glow: 0.45, col: [1.6, 0.65, 0.2] } },
        lumps: { amp: 0.012, scale: 7 },
        style: { heavy: 0.9, attacks: ['slam', 'claw', 'swing'], armed: 'none', castBoth: true, idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
      }),
    ),

  // The void herald: a towering angel of the hollow, six arms, torn wings
  // full of stars, a faceless head ringed by nine eyes.
  void_herald_shessi: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.1,
        kind: 'giant',
        hip: 0.5,
        hunch: 0.12,
        head: 0.75,
        arms: 1.35,
        shoulders: 0.18,
        armOut: 0.45,
        thick: 0.95,
        arms2: true,
        wings: 2.0,
        wingMat: 'alt',
        skin: 0x3a2a52,
        skinSurface: 'hide',
        alt: { surface: 'shade', tint: 0x1a1028 },
        metal: { surface: 'gold', tint: 0x9a7ab8 },
        claws: 0.07,
        faceFn: (s, H) => {
          // A smooth faceless head, nine eyes in a halo round it.
          const h = s.j('head').add(V(0, 0.04 * H, 0));
          s.ball('head', h, V(0.045 * H, 0.065 * H, 0.05 * H), { k: 0.015 * H });
          const hc = h.clone().add(V(0, 0.02 * H, -0.02 * H));
          s.hard('head', ring(hc, 0.11 * H, 0.006 * H, V(0, 0.15, 1), 22), 'metal');
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const p = hc.clone().add(V(Math.sin(a) * 0.11 * H, Math.cos(a) * 0.11 * H, 0.01 * H));
            s.hard('head', ballGeo(p, 0.018 * H, 1), 'skin');
            eyeball(s, 'head', p.clone().add(V(0, 0, 0.008 * H)), 0.014 * H, V(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 1), [1.4, 0.4, 1.4], false);
          }
          s.boil('head', h.clone().add(V(0, 0.0, 0.045 * H)), 0.01 * H, 1, [1.2, 0.4, 1.4]);
        },
        extra: (s, H) => {
          // Robes of the hollow, a skirt of tendrils, stars glinting in the wings.
          skirt(s, { len: 0.95, flare: 0.14, top: 0.04, thick: 0.012 });
          const hp = s.j('hips');
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            tentacle(s, 'hips', hp.clone().add(V(Math.sin(a) * 0.12 * H, -0.1 * H, Math.cos(a) * 0.1 * H)), V(Math.sin(a) * 0.4, -1, Math.cos(a) * 0.4), 0.32 * H, 0.012 * H, V(Math.sin(a) * 0.05 * H, 0, Math.cos(a) * 0.05 * H), 'skin');
          }
          const r = seq(481);
          s.pair((side) => {
            const w = s.j(`wing${side}3`);
            const t = s.j(`wing${side}Tip`);
            for (let i = 0; i < 6; i++) s.boil(`wing${side}3`, lerpV(w, t, r()).add(V(0, -r() * 0.2 * H, -r() * 0.15 * H)), 0.005 * H, 1, [1.2, 1.1, 1.4]);
          });
          // Gold bands on the arms.
          s.pair((side) => {
            for (const set of ['', '2']) {
              const f = s.j(`fore${set}${side}`);
              const w = s.j(`hand${set}${side}`);
              s.limb(`fore${set}${side}`, lerpV(f, w, 0.55), lerpV(f, w, 0.8), 0.028 * H, 0.028 * H, { mat: 'metal', k: 0.004 * H });
            }
          });
          s.boil('chest', s.j('chest').add(V(0, 0.0, 0.1 * H)), 0.02 * H, 1, [1.2, 0.4, 1.4]);
        },
        paintSkin: { base: [1.4, 1.3, 1.5], grime: 0.3, ao: 0.9, mottle: { scale: 5, amount: 0.4, col: [0.4, 0.25, 0.6] } },
        style: { heavy: 0.55, attacks: ['claw', 'slam', 'lash'], armed: 'none', castBoth: true, idle: 'sway', gait: 'stalk', spawn: 'form', death: 'collapse' },
      }),
    ),

  // The colossus of the deep: a walking foundry. Its chest is a hall of arches
  // with forge light in the windows, its head a bell tower, its legs columns.
  colossus_of_the_deep: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 1.95,
        kind: 'giant',
        rig: { hip: 0.42, shoulders: 0.24, hips: 0.11, arms: 1.3, hunch: 0.2, head: 0.7, armOut: 0.42 },
        skin: { surface: 'stone', tint: 0x9a948a },
        alt: { surface: 'iron', tint: 0x4a4644 },
        metal: { surface: 'brass', tint: 0xa88850 },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          // The hall: a block chest with a row of arched windows lit from inside.
          s.box('chest', ch.clone().add(V(0, 0.02 * H, 0)), V(0.2 * H, 0.14 * H, 0.13 * H), { k: 0.01 * H, round: 0.015 * H });
          for (let i = 0; i < 4; i++) {
            const p = ch.clone().add(V((i - 1.5) * 0.085 * H, 0.03 * H, 0.13 * H));
            s.box('chest', p, V(0.025 * H, 0.05 * H, 0.03 * H), { sub: true, k: 0.004 * H, round: 0.012 * H });
            s.boil('chest', p.clone().add(V(0, 0, -0.02 * H)), 0.02 * H, 0.9, [1.3, 0.75, 0.3]);
          }
          // A cornice and buttresses.
          s.box('chest', ch.clone().add(V(0, 0.16 * H, 0)), V(0.22 * H, 0.015 * H, 0.15 * H), { mat: 'alt', k: 0.004 * H });
          s.pair((_side, x) => s.box('chest', ch.clone().add(V(x * 0.21 * H, -0.02 * H, 0.04 * H)), V(0.02 * H, 0.13 * H, 0.1 * H), { k: 0.006 * H, round: 0.01 * H }));
          s.box('spine', s.j('spine'), V(0.15 * H, 0.08 * H, 0.1 * H), { mat: 'alt', k: 0.01 * H, round: 0.02 * H });
          grille(s, 'spine', s.j('spine').add(V(0, 0, 0.1 * H)), 0.07 * H, 0.04 * H, 7);
          s.box('hips', s.j('hips').add(V(0, 0.02 * H, 0)), V(0.15 * H, 0.06 * H, 0.1 * H), { k: 0.008 * H, round: 0.02 * H });
          // The head: a bell tower with a lantern and a spire.
          const h = s.j('head').add(V(0, 0.04 * H, 0));
          s.box('head', h, V(0.05 * H, 0.06 * H, 0.05 * H), { k: 0.004 * H, round: 0.006 * H });
          s.box('head', h.clone().add(V(0, 0.0, 0.05 * H)), V(0.025 * H, 0.035 * H, 0.03 * H), { sub: true, k: 0.003 * H, round: 0.012 * H });
          lens(s, 'head', h.clone().add(V(0, 0.0, 0.035 * H)), 0.018 * H, V(0, 0, 1), 2, IRON);
          s.hard('head', spikeGeo(h.clone().add(V(0, 0.06 * H, 0)), h.clone().add(V(0, 0.2 * H, 0)), 0.05 * H, 4, undefined, 1), 'metal', [0.35, 0.3, 0.25]);
          s.pair((_side, x) => s.hard('head', spikeGeo(h.clone().add(V(x * 0.05 * H, 0.06 * H, 0)), h.clone().add(V(x * 0.055 * H, 0.12 * H, 0)), 0.012 * H, 4, undefined, 1), 'metal', [0.35, 0.3, 0.25]));
          // Shoulders: smokestacks, smoke-blackened, fire in their mouths.
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`);
            s.box(`arm${side}`, sh.clone().add(V(x * 0.02 * H, 0.04 * H, 0)), V(0.08 * H, 0.06 * H, 0.08 * H), { k: 0.008 * H, round: 0.02 * H });
            const b = sh.clone().add(V(x * 0.03 * H, 0.08 * H, -0.04 * H));
            const t = b.clone().add(V(0, 0.22 * H, -0.02 * H));
            s.hard(`arm${side}`, tubeGeo([b, t], () => 0.03 * H, 8), 'alt', [0.3, 0.27, 0.25]);
            s.hard(`arm${side}`, ring(t, 0.032 * H, 0.008 * H, V(0, 1, 0), 10), 'metal');
            fire(s, `arm${side}`, t, 4, 0.08 * H, 0.025 * H, x > 0 ? 491 : 492);
          });
          // Columns for legs, crane arms ending in a hook and a hammer-fist.
          s.pair((side) => {
            const l = s.j(`leg${side}`);
            const k = s.j(`shin${side}`);
            const f = s.j(`foot${side}`);
            s.limb(`leg${side}`, l, k, 0.07 * H, 0.065 * H, { k: 0.006 * H });
            s.ball(`shin${side}`, k, 0.07 * H, { mat: 'alt', k: 0.006 * H });
            s.limb(`shin${side}`, k, f, 0.065 * H, 0.075 * H, { k: 0.006 * H });
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              s.hard(`shin${side}`, tubeGeo([lerpV(k, f, 0.15).add(V(Math.sin(a) * 0.07 * H, 0, Math.cos(a) * 0.07 * H)), lerpV(k, f, 0.85).add(V(Math.sin(a) * 0.078 * H, 0, Math.cos(a) * 0.078 * H))], () => 0.008 * H, 4), 'skin');
            }
            s.box(`foot${side}`, f.clone().add(V(0, -0.02 * H, 0.03 * H)), V(0.09 * H, 0.03 * H, 0.11 * H), { mat: 'alt', k: 0.006 * H, round: 0.01 * H });
          });
          mechArms(s, { r: 0.05, mat: 'alt', joint: 'metal', hand: 'fist', handK: 1.5 });
          s.pair((side) => {
            const a = s.j(`arm${side}`);
            const e = s.j(`fore${side}`);
            rivets(s, `arm${side}`, lerpV(a, e, 0.2).add(V(0, 0, 0.055 * H)), lerpV(a, e, 0.85).add(V(0, 0, 0.055 * H)), 5, 0.008 * H, [0.65, 0.5, 0.3]);
          });
          gear(s, 'chest', ch.clone().add(V(0, 0.05 * H, -0.14 * H)), 0.12 * H, V(0, 0, -1), 16, [0.65, 0.5, 0.3], 'metal', 0);
          chain(s, 'handL', s.j('handLTip'), s.j('handLTip').add(V(0, -0.25 * H, 0.04 * H)), 0.018 * H);
        },
        paint: {
          skin: { grime: 0.6, ao: 0.95, mottle: { scale: 5, amount: 0.4, col: [0.45, 0.4, 0.35] }, top: { amount: 0.2, col: [1.15, 1.1, 1.0] } },
          alt: { grime: 0.6, ao: 0.85, mottle: { scale: 6, amount: 0.4, col: [0.5, 0.35, 0.25] } },
        },
        style: { heavy: 1, attacks: ['slam', 'stomp', 'swing'], armed: 'none', idle: 'still', gait: 'lumber', spawn: 'assemble', death: 'crash' },
      }),
      { mats: { skin: { surface: 'stone', tint: 0x9a948a, glow: c.visual.glow ?? 0xffaa22, rough: 0.85 } } },
    ),

  // The first devourer: a hill of red flesh that is mostly mouth, six great
  // tentacles, nine eyes, the faces and hands of everything it ate.
  first_devourer: (c) =>
    asBoss(
      c,
      blobLook(c, {
        height: 1.5,
        radius: 0.9,
        lobes: 7,
        skin: { surface: 'flesh', tint: 0xa84a44 },
        alt: { surface: 'slime', tint: 0x5a1218 },
        metal: { surface: 'bone', tint: 0xd8ccb0 },
        sculpt: (s, H, R) => {
          mass(s, H, R, { lobes: 7, top: 1.1, pod: 0.16, lobe: 0.32 });
          const t = s.j('top');
          const b = s.j('body');
          // The mouth: a split down the front from crown to base, rows of teeth.
          maw(s, 'top', t.clone().add(V(0, H * 0.08, R * 0.45)), R * 0.5, V(0, 0.25, 1), 22, 0.35);
          maw(s, 'top', t.clone().add(V(0, H * 0.06, R * 0.38)), R * 0.36, V(0, 0.25, 1), 16, 0);
          maw(s, 'body', b.clone().add(V(0, H * 0.02, R * 0.78)), R * 0.3, V(0, 0, 1), 14, 0);
          // Six great tentacles off the back and sides.
          for (let i = 0; i < 6; i++) {
            const a = (i / 5 - 0.5) * 3.6 + Math.PI;
            const p = t.clone().add(V(Math.sin(a) * R * 0.5, H * 0.05, Math.cos(a) * R * 0.45));
            tentacle(s, 'top', p, V(Math.sin(a), 0.7, Math.cos(a)), R * 1.3, R * 0.12, V(0, -H * 0.15, -R * 0.2));
          }
          // Nine eyes, scattered and staring.
          for (let i = 0; i < 9; i++) {
            const a = (i / 9 - 0.5) * 3.2;
            const up = i % 3;
            const p = (up ? t : b).clone().add(V(Math.sin(a) * R * (up ? 0.55 : 0.85), H * (0.12 + up * 0.05), Math.cos(a) * R * (up ? 0.5 : 0.78)));
            s.ball(up ? 'top' : 'body', p, R * 0.08, { sub: true, k: R * 0.02 });
            eyeball(s, up ? 'top' : 'body', p, R * (0.06 + (i % 2) * 0.03), V(Math.sin(a), 0.2, Math.cos(a)), [1.3, 0.3, 0.45], true);
          }
          // What it ate: faces, hands and a skull pushing out of the flesh.
          const r = seq(501);
          for (let i = 0; i < 5; i++) {
            const a = (r() - 0.5) * 4;
            const p = b.clone().add(V(Math.sin(a) * R * 0.9, H * (r() * 0.2 - 0.05), Math.cos(a) * R * 0.85));
            const n = V(Math.sin(a), 0, Math.cos(a));
            if (i % 2) skullAt(s, 'body', p, R * 0.07, n);
            else {
              s.limb('body', p, p.clone().addScaledVector(n, R * 0.18).add(V(0, R * 0.1, 0)), R * 0.035, R * 0.03, { k: R * 0.03 });
              const hd = p.clone().addScaledVector(n, R * 0.2).add(V(0, R * 0.12, 0));
              for (let k = 0; k < 4; k++) s.hard('body', spikeGeo(hd, hd.clone().addScaledVector(n, R * 0.05).add(V((k - 1.5) * R * 0.02, R * 0.04, 0)), R * 0.01, 3, undefined, 1), 'skin');
            }
          }
          drips(s, H, R, 10, 503, 'alt');
          bubbles(s, 'body', b.clone().add(V(0, H * 0.1, 0)), V(R * 0.8, H * 0.2, R * 0.7), 8, R * 0.04, 505, [1.2, 0.35, 0.5], 0.6);
          s.pair((side) => {
            for (let k = 0; k < 4; k++) s.hard(`pod${side}2`, spikeGeo(lerpV(s.j(`pod${side}2`), s.j(`pod${side}Tip`), 0.2 + k * 0.2), lerpV(s.j(`pod${side}2`), s.j(`pod${side}Tip`), 0.2 + k * 0.2).add(V(0, R * 0.14, -R * 0.04)), R * 0.035, 4, undefined, 1), 'metal', TOOTH);
          });
        },
        paint: { skin: { base: [1.5, 1.25, 1.25], grime: 0.45, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.6, 0.25, 0.3] }, tips: { amount: 0.4, col: [0.9, 0.5, 0.5] } }, alt: { grime: 0, ao: 0.5 }, metal: { grime: 0.4, ao: 0.7 } },
        style: { heavy: 0.95, attacks: ['engulf', 'lash', 'slam'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
      }),
    ),

  // The Gaunt King: the last thing in the deep. Impossibly tall and starved,
  // ribs like a cage, arms to the floor, tattered wings, a crown of iron
  // nails driven into his skull, a cloak of shadow.
  the_gaunt_king: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.2,
        kind: 'giant',
        hip: 0.5,
        hunch: 0.32,
        head: 0.72,
        arms: 1.55,
        shoulders: 0.17,
        armOut: 0.36,
        thick: 0.78,
        digitigrade: true,
        tail: 7,
        tailLen: 0.75,
        tailTip: 'barb',
        wings: 2.1,
        skin: 0x5a4a5a,
        skinSurface: 'hide',
        alt: { surface: 'shade', tint: 0x1a1220 },
        metal: { surface: 'iron', tint: 0x5a5458 },
        face: { size: 0.72, snout: 0.25, brow: 1.4, jaw: 1.5, ears: 0.4, eyes: 2.4, teeth: TOOTH },
        claws: 0.14,
        toes: 0.06,
        extra: (s, H) => {
          // Ribs showing through stretched hide.
          ribcage(s, { w: 0.07, d: 0.055, r: 0.006, ribs: 6, mat: 'skin', col: [0.75, 0.68, 0.6] });
          // A crown of iron nails driven into the skull.
          const h = s.j('head');
          for (let i = 0; i < 11; i++) {
            const a = (i / 11) * Math.PI * 2;
            const p = h.clone().add(V(Math.sin(a) * 0.045 * H, 0.05 * H, Math.cos(a) * 0.045 * H));
            const l = (0.06 + (i % 3) * 0.03 + (Math.cos(a) > 0.6 ? 0.04 : 0)) * H;
            s.hard('head', spikeGeo(p.clone().add(V(-Math.sin(a) * 0.01 * H, -0.01 * H, -Math.cos(a) * 0.01 * H)), p.clone().add(V(Math.sin(a) * l * 0.25, l, Math.cos(a) * l * 0.25)), 0.006 * H, 4, undefined, 1), 'metal', [0.4, 0.38, 0.38], i % 4 === 0 ? 0.6 : 0);
          }
          horns(s, 'swept', 0.72 * H, 1.3, HORN);
          // A cloak of shadow off the shoulders, ragged to the floor.
          skirt(s, { len: 0.95, flare: 0.16, top: 0.04, thick: 0.01, front: false });
          s.ball('chest', s.j('neck').add(V(0, -0.02 * H, -0.03 * H)), V(0.13 * H, 0.04 * H, 0.08 * H), { mat: 'alt', k: 0.02 * H });
          const r = seq(511);
          for (let i = 0; i < 9; i++) {
            const a = (i / 8 - 0.5) * 2.6 + Math.PI;
            const p = s.j('hips').add(V(Math.sin(a) * 0.15 * H, -0.42 * H, Math.cos(a) * 0.12 * H - 0.03 * H));
            s.hard('hips', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.04 * H, -(0.04 + r() * 0.05) * H, Math.cos(a) * 0.03 * H)), 0.03 * H, 3, undefined, 2), 'alt');
          }
          // Long fingers of iron rings, the claws black.
          s.pair((side) => {
            const w = s.j(`hand${side}`);
            const t = s.j(`hand${side}Tip`);
            for (let i = 0; i < 3; i++) s.hard(`hand${side}`, ring(lerpV(w, t, 0.25 + i * 0.12), 0.022 * H, 0.004 * H, t.clone().sub(w).normalize(), 10), 'metal', GOLD);
          });
          s.boil('chest', s.j('chest').add(V(0, 0.0, 0.07 * H)), 0.015 * H, 1, [1.4, 0.3, 0.5]);
        },
        paintSkin: { base: [1.3, 1.25, 1.3], grime: 0.45, ao: 0.95, mottle: { scale: 6, amount: 0.35, col: [0.45, 0.38, 0.45] }, tips: { amount: 0.45, col: [0.25, 0.18, 0.22] } },
        style: { heavy: 0.8, attacks: ['claw', 'slam', 'lunge'], armed: 'none', castBoth: true, idle: 'sway', gait: 'stalk', spawn: 'rise', death: 'crash' },
      }),
    ),
};

export { BOSS_B };
