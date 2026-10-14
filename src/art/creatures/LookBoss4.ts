/**
 * SLAY — bosses, part four: the depth plan's twenty-eight, deep half.
 * The bog queen, the kiln saint, the ashmonger, the queen of hinges, the
 * last surveyor, the gilt leviathan, the crow lord, the melting hag, the
 * furnace choir, the one who came up instead, the chained gullet, the
 * archivist below, the twice-crowned saint and the deep's own name.
 */
import * as THREE from 'three';
import type { LookCtx, LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, ringGeo, spikeGeo, tubeGeo, ovalGeo } from './Sculpt';
import { V, lerpV, seq } from './Kit';
import { manLook } from './LookHumanoid';
import { specterLook } from './LookUndead';
import { botLook, floatLook, gear, grille, rivets } from './LookConstruct';
import { fire } from './LookElemental';
import { blobLook, eyeball, maw, tentacle } from './LookAberration';
import { mass } from './LookOoze';
import { mossBeard } from './LookPlant';
import { asBoss, chain } from './LookBoss';

const IRON: RGB = [0.42, 0.42, 0.45];
const DARK: RGB = [0.08, 0.07, 0.07];
const GOLD: RGB = [0.95, 0.75, 0.3];
const BRASS: RGB = [0.75, 0.58, 0.3];
const BONE: RGB = [0.86, 0.8, 0.66];
const ASH: RGB = [0.45, 0.43, 0.42];
const ICE: RGB = [0.85, 0.95, 1.0];

/** A lantern hanging at `p`: a cage round a glowing heart. */
function lantern(s: Sculpt, bone: string, p: THREE.Vector3, r: number, col: RGB): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    s.hard(bone, tubeGeo([p.clone().add(V(Math.sin(a) * r, r * 1.2, Math.cos(a) * r)), p.clone().add(V(Math.sin(a) * r, -r * 1.2, Math.cos(a) * r))], () => r * 0.1, 3), 'metal', IRON);
  }
  s.hard(bone, ringGeo(p.clone().add(V(0, r * 1.2, 0)), r, r * 0.12, V(0, 1, 0), 10), 'metal', IRON);
  s.boil(bone, p, r * 0.75, 1.1, col);
}

/** A crow perched at `p`, looking along `face`. */
function crow(s: Sculpt, bone: string, p: THREE.Vector3, size: number, face: THREE.Vector3): void {
  const f = face.clone().setY(0).normalize();
  s.hard(bone, ovalGeo(p, size, 1, 1, 0.85, 1.25), 'alt', DARK);
  const h = p.clone().addScaledVector(f, size * 0.95).add(V(0, size * 0.55, 0));
  s.hard(bone, ballGeo(h, size * 0.55, 1), 'alt', DARK);
  s.hard(bone, spikeGeo(h.clone().addScaledVector(f, size * 0.4), h.clone().addScaledVector(f, size * 1.1), size * 0.16, 3, undefined, 1), 'metal', [0.25, 0.22, 0.18]);
  s.hard(bone, spikeGeo(p.clone().addScaledVector(f, -size * 0.8), p.clone().addScaledVector(f, -size * 2).add(V(0, -size * 0.2, 0)), size * 0.35, 3, undefined, 1), 'alt', DARK);
  s.eye(bone, h.clone().addScaledVector(f, size * 0.3).add(V(0, size * 0.15, 0)), size * 0.08, 0.6);
}

/** A crown of thorns: a twisted ring with spines. */
function thorns(s: Sculpt, bone: string, c: THREE.Vector3, r: number, col: RGB): void {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(c.clone().add(V(Math.sin(a) * r, Math.sin(a * 5) * r * 0.08, Math.cos(a) * r)));
  }
  s.hard(bone, tubeGeo(pts, () => r * 0.05, 4), 'alt', col);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = c.clone().add(V(Math.sin(a) * r, 0, Math.cos(a) * r));
    s.hard(bone, spikeGeo(p, p.clone().add(V(Math.sin(a) * r * 0.3, r * (i % 2 ? 0.25 : -0.15), Math.cos(a) * r * 0.3)), r * 0.04, 3, undefined, 1), 'alt', col);
  }
}

/** A traveller dressed the way you would be: the echo and the one who came up. */
function heroDouble(c: LookCtx, height: number, glow: RGB, extra?: (s: Sculpt, H: number) => void) {
  return manLook(c, {
    height,
    build: 'normal',
    skin: 0xa8c8d8,
    skinSurface: 'crystal',
    cloth: 0x2e3a48,
    tunic: 2,
    armor: 0.55,
    cape: 0.8,
    belt: 2,
    strap: true,
    weapon: 'sword',
    weaponGlow: 0.5,
    steel: [0.75, 0.85, 0.95],
    extra: (s, H) => {
      // Cracks of light through it, as if it is not quite solid.
      const r = seq(c.id.length * 7 + 3);
      for (let i = 0; i < 10; i++) {
        const b = ['chest', 'spine', 'armL', 'armR', 'legL', 'legR', 'head'][i % 7]!;
        s.glow(s.j(b).add(V((r() - 0.5) * 0.06 * H, (r() - 0.5) * 0.06 * H, 0.04 * H)), 0.012 * H, 0.6, glow);
      }
      extra?.(s, H);
    },
    style: { heavy: 0.2, attacks: ['swing', 'thrust', 'chop'], armed: 'one', idle: 'breathe', gait: 'walk', spawn: 'form', death: 'fade' },
  });
}

// ---------------------------------------------------------------------------

export const BOSS_D: Record<string, LookFactory> = {
  // Mirelle the Unburied: a bog queen in a gown of peat and moss, a crown of
  // bog-oak, green lanterns beating at her belt like hearts.
  mirelle_unburied: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.95,
        build: 'thin',
        skin: 0x7a8a68,
        skinSurface: 'rot',
        cloth: 0x3a4a2a,
        clothSurface: 'moss',
        robe: 1.0,
        tunic: 2,
        helm: 'crown',
        extra: (s, H) => {
          // Moss hanging from the arms and the hem, peat streaked down her.
          s.pair((side) => mossBeard(s, `fore${side}`, s.j(`fore${side}`).add(V(0, -0.02 * H, 0)), 0.06 * H, 0.14 * H, 5, side === 'L' ? 31 : 33));
          mossBeard(s, 'hips', s.j('hips').add(V(0, -0.2 * H, 0.1 * H)), 0.2 * H, 0.2 * H, 9, 35);
          // A crown of black bog-oak under the iron points.
          const cc = s.j('head').add(V(0, 0.085 * H, 0));
          s.hard('head', ringGeo(cc, 0.055 * H, 0.012 * H, V(0, 1, 0), 16), 'alt', [0.15, 0.12, 0.1]);
          // Lanterns that beat like hearts, hung from her girdle.
          for (let i = 0; i < 3; i++) {
            const a = (i - 1) * 0.9;
            lantern(s, 'hips', s.j('hips').add(V(Math.sin(a) * 0.12 * H, -0.08 * H, Math.cos(a) * 0.09 * H)), 0.022 * H, [0.5, 1.4, 0.6]);
          }
          // Eyes like marsh lights.
          s.pair((_side, x) => s.glow(s.j('head').add(V(x * 0.022 * H, 0.03 * H, 0.055 * H)), 0.008 * H, 1, [0.5, 1.3, 0.6]));
          s.paint.skin = { grime: 0.7, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.45, 0.5, 0.35] } };
        },
        style: { heavy: 0.2, attacks: ['claw', 'hurl', 'swing'], armed: 'none', castBoth: true, idle: 'sway', gait: 'glide', spawn: 'emerge' },
      }),
    ),

  // The Kiln Saint: a giant of glazed blue-and-gold ceramic, a saint's halo
  // fired onto its head, water sloshing in its hollow chest.
  kiln_saint: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'giant',
        rig: { shoulders: 0.18, hips: 0.08, arms: 1.15, hunch: 0.1, head: 0.85 },
        skin: { surface: 'glaze', tint: 0x3a5aa0 },
        alt: { surface: 'glaze', tint: 0xe8e0d0 },
        metal: { surface: 'gold', tint: 0xe0b860 },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          // A smooth vase of a body, a waist like a pot's neck.
          s.ball('chest', ch, V(0.15 * H, 0.13 * H, 0.11 * H), { k: 0.03 * H });
          s.limb('spine', s.j('spine'), s.j('hips'), 0.08 * H, 0.1 * H, { mat: 'alt', k: 0.02 * H });
          s.ball('hips', s.j('hips'), V(0.11 * H, 0.07 * H, 0.09 * H), { k: 0.02 * H });
          // Gold bands and painted vines.
          for (let i = 0; i < 3; i++) s.hard('chest', ringGeo(ch.clone().add(V(0, 0.08 * H - i * 0.08 * H, 0)), (0.14 - Math.abs(i - 1) * 0.02) * H, 0.006 * H, V(0, 1, 0), 22), 'metal');
          const r = seq(61);
          for (let i = 0; i < 12; i++) s.tint(ch.clone().add(V((r() - 0.5) * 0.25 * H, (r() - 0.5) * 0.2 * H, 0.1 * H)), 0.025 * H, [0.95, 0.92, 0.85]);
          // Water seen through a round window in the chest.
          s.hard('chest', ringGeo(ch.clone().add(V(0, 0, 0.11 * H)), 0.045 * H, 0.008 * H, V(0, 0, 1), 16), 'metal');
          s.boil('chest', ch.clone().add(V(0, 0, 0.1 * H)), 0.04 * H, 0.7, [0.4, 0.8, 1.3]);
          // Limbs like thrown pots, glazed joints.
          s.pair((side) => {
            s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.055 * H, 0.045 * H, { k: 0.01 * H });
            s.ball(`fore${side}`, s.j(`fore${side}`), 0.05 * H, { mat: 'alt', k: 0.01 * H });
            s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.045 * H, 0.06 * H, { k: 0.01 * H });
            s.ball(`hand${side}`, s.j(`hand${side}`), V(0.05 * H, 0.06 * H, 0.05 * H), { mat: 'alt', k: 0.01 * H });
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.065 * H, 0.055 * H, { k: 0.01 * H });
            s.ball(`shin${side}`, s.j(`shin${side}`), 0.055 * H, { mat: 'alt', k: 0.01 * H });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.055 * H, 0.07 * H, { k: 0.01 * H });
          });
          // The head: a smooth mask with painted eyes, a gold halo behind.
          const h = s.j('head');
          s.ball('head', h, V(0.06 * H, 0.075 * H, 0.06 * H), { mat: 'alt', k: 0.01 * H });
          s.pair((_side, x) => s.tint(h.clone().add(V(x * 0.022 * H, 0.012 * H, 0.055 * H)), 0.01 * H, [0.15, 0.25, 0.6]));
          s.hard('head', ringGeo(h.clone().add(V(0, 0.03 * H, -0.05 * H)), 0.1 * H, 0.01 * H, V(0, 0.15, 1).normalize(), 24), 'metal', GOLD, 0.4);
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const p = h.clone().add(V(Math.sin(a) * 0.1 * H, 0.03 * H + Math.cos(a) * 0.1 * H, -0.05 * H));
            s.hard('head', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.03 * H, Math.cos(a) * 0.03 * H, 0)), 0.006 * H, 3, undefined, 1), 'metal', GOLD);
          }
        },
        paint: { skin: { grime: 0.1, ao: 0.6, top: { amount: 0.2, col: [1.2, 1.2, 1.25] } }, alt: { grime: 0.1, ao: 0.6 } },
        style: { heavy: 0.85, attacks: ['slam', 'stomp', 'swing'], idle: 'still', gait: 'lumber', spawn: 'assemble', death: 'scatter' },
      }),
    ),

  // Teodric the Ashmonger: a small hooded peddler grey with ash, a sack of it
  // on his back, a scoop in his hand and a scarf over his face.
  teodric_ashmonger: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.6,
        build: 'thin',
        hunch: 0.3,
        skin: 0x8a8480,
        cloth: 0x5a5654,
        robe: 0.7,
        hood: true,
        mask: true,
        tunic: 2,
        belt: 2,
        weapon: 'dagger',
        extra: (s, H) => {
          // The ash sack, overflowing.
          const c0 = s.j('chest').add(V(0, 0.0, -0.12 * H));
          s.ball('chest', c0, V(0.11 * H, 0.14 * H, 0.09 * H), { mat: 'alt', k: 0.03 * H });
          s.ball('chest', c0.clone().add(V(0, 0.13 * H, 0)), V(0.07 * H, 0.03 * H, 0.06 * H), { mat: 'metal', k: 0.02 * H });
          // Scales and a scoop on his belt.
          const hp = s.j('hips');
          s.hard('hips', ringGeo(hp.clone().add(V(0.09 * H, -0.04 * H, 0.04 * H)), 0.025 * H, 0.004 * H, V(0, 1, 0), 10), 'metal', BRASS);
          s.hard('hips', ovalGeo(hp.clone().add(V(-0.09 * H, -0.05 * H, 0.04 * H)), 0.025 * H, 1, 1, 0.5, 1), 'metal', IRON);
          // Ash heaped on his shoulders and hood.
          const r = seq(23);
          for (let i = 0; i < 10; i++) {
            const b = i % 3 === 0 ? 'head' : i % 3 === 1 ? 'armL' : 'armR';
            s.hard(b, ballGeo(s.j(b).add(V((r() - 0.5) * 0.06 * H, 0.04 * H + r() * 0.02 * H, (r() - 0.5) * 0.06 * H)), (0.01 + r() * 0.012) * H, 0), 'metal', ASH);
          }
        },
        style: { heavy: 0.1, attacks: ['thrust', 'hurl', 'swing'], armed: 'one', idle: 'jitter', gait: 'stalk', spawn: 'form', death: 'fade' },
      }),
    ),

  // The Queen of Hinges: very tall and thin, a gown of doors, a crown of
  // hinge leaves, a small shut door where her face should be.
  queen_of_hinges: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 2.2,
        build: 'thin',
        skin: 0x9a9088,
        cloth: 0x3a2a24,
        clothSurface: 'bark',
        robe: 1.0,
        tunic: 2,
        claws: 0.1,
        metal: 0x6a6460,
        metalSurface: 'iron',
        extra: (s, H) => {
          // Door panels hanging round her like a skirt, hinges and handles on each.
          const hp = s.j('hips');
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const p = hp.clone().add(V(Math.sin(a) * 0.15 * H, -0.24 * H, Math.cos(a) * 0.13 * H));
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, a, 0));
            s.hard('hips', boxGeo(p, V(0.1 * H, 0.42 * H, 0.012 * H), q), 'alt');
            const fwd = V(Math.sin(a), 0, Math.cos(a));
            s.hard('hips', ballGeo(p.clone().addScaledVector(fwd, 0.012 * H).add(V(0, 0.02 * H, 0)), 0.008 * H, 0), 'metal', BRASS);
            for (let k = 0; k < 2; k++) s.hard('hips', boxGeo(p.clone().addScaledVector(fwd, 0.01 * H).add(V(0, (k ? -0.12 : 0.12) * H, 0)), V(0.04 * H, 0.008 * H, 0.004 * H), q), 'metal', IRON);
          }
          // A crown of hinge leaves standing up, pins through them.
          const cc = s.j('head').add(V(0, 0.09 * H, 0));
          s.hard('head', ringGeo(cc, 0.05 * H, 0.006 * H, V(0, 1, 0), 16), 'metal', IRON);
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const b = cc.clone().add(V(Math.sin(a) * 0.05 * H, 0, Math.cos(a) * 0.05 * H));
            const t = b.clone().add(V(Math.sin(a) * 0.012 * H, 0.08 * H, Math.cos(a) * 0.012 * H));
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0));
            s.hard('head', boxGeo(lerpV(b, t, 0.5), V(0.014 * H, 0.04 * H, 0.002 * H), q), 'metal', IRON);
            s.hard('head', tubeGeo([b, t], () => 0.003 * H, 4, true), 'metal', BRASS);
          }
          // Long iron fingers, a hinge pin at every knuckle.
          s.pair((side) => {
            const h = s.j(`hand${side}`);
            const t = s.j(`hand${side}Tip`);
            const d = t.clone().sub(h).normalize();
            for (let i = 0; i < 4; i++) {
              const off = V((i - 1.5) * 0.012 * H, 0, 0);
              const k1 = t.clone().add(off);
              const k2 = k1.clone().addScaledVector(d, 0.05 * H).add(V(0, -0.01 * H, 0));
              s.hard(`hand${side}`, tubeGeo([h.clone().add(off), k1, k2], () => 0.003 * H, 4), 'metal', IRON);
              s.hard(`hand${side}`, tubeGeo([k1.clone().add(V(-0.005 * H, 0, 0)), k1.clone().add(V(0.005 * H, 0, 0))], () => 0.004 * H, 4, true), 'metal', BRASS);
            }
          });
          // Her face is a small shut door, a ring knocker on it; light leaks
          // round its edges.
          const h = s.j('head');
          const df = h.clone().add(V(0, 0.01 * H, 0.055 * H));
          s.hard('head', boxGeo(df, V(0.05 * H, 0.07 * H, 0.008 * H)), 'alt', [0.3, 0.22, 0.16]);
          s.hard('head', ringGeo(df.clone().add(V(0, -0.005 * H, 0.008 * H)), 0.01 * H, 0.002 * H, V(0, 0, 1), 10), 'metal', BRASS);
          s.glow(df.clone().add(V(0.026 * H, 0, 0)), 0.006 * H, 1.2);
        },
        style: { heavy: 0.15, attacks: ['claw', 'thrust', 'lunge'], armed: 'none', idle: 'still', gait: 'stalk', spawn: 'form', death: 'topple' },
      }),
    ),

  // Thessaly Vane: a surveyor in a long field coat and a tricorn, a brass
  // level in one hand and a measuring chain wound over her shoulder.
  thessaly_vane: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.85,
        build: 'thin',
        skin: 0xb89a84,
        cloth: 0x4a3a2a,
        robe: 0.75,
        tunic: 2,
        belt: 3,
        strap: true,
        cape: 0.4,
        extra: (s, H) => {
          // A tricorn hat.
          const hc = s.j('head').add(V(0, 0.07 * H, 0));
          s.ball('head', hc, V(0.06 * H, 0.025 * H, 0.06 * H), { mat: 'alt', k: 0.01 * H });
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            s.hard('head', spikeGeo(hc, hc.clone().add(V(Math.sin(a) * 0.1 * H, 0.015 * H, Math.cos(a) * 0.1 * H)), 0.03 * H, 3, undefined, 1), 'alt', [0.2, 0.16, 0.12]);
          }
          // The brass level held out in the left hand, its bubble glowing.
          const hl = lerpV(s.j('handL'), s.j('handLTip'), 0.6);
          s.hard('handL', boxGeo(hl.clone().add(V(0, 0.01 * H, 0.04 * H)), V(0.015 * H, 0.015 * H, 0.11 * H)), 'metal', BRASS);
          s.boil('handL', hl.clone().add(V(0, 0.022 * H, 0.04 * H)), 0.008 * H, 1, [0.6, 1.3, 0.7]);
          // The measuring chain, coiled over a shoulder and trailing.
          s.hard('chest', ringGeo(s.j('chest').add(V(0, 0.02 * H, 0)), 0.11 * H, 0.006 * H, V(0.5, 0.2, 0).normalize(), 20), 'metal', IRON);
          chain(s, 'handR', s.j('handR'), s.j('handR').add(V(0, -0.3 * H, 0.06 * H)), 0.01 * H, IRON);
          // A chalk-white tally on her coat.
          for (let i = 0; i < 5; i++) s.tint(s.j('spine').add(V(-0.06 * H + i * 0.012 * H, 0, 0.07 * H)), 0.006 * H, [1.4, 1.4, 1.35]);
        },
        style: { heavy: 0.15, attacks: ['swing', 'lash', 'hurl'], armed: 'none', idle: 'still', gait: 'walk' },
      }),
    ),

  // The Gilt Leviathan: an old fish the size of a barge, armoured in the
  // temple's tithe, coins nailed scale on scale, a long jaw of brass teeth.
  gilt_leviathan: (c) =>
    asBoss(
      c,
      floatLook(c, {
        hover: 1.4,
        radius: 0.9,
        orbs: 0,
        skin: { surface: 'gold', tint: 0xd8a848 },
        alt: { surface: 'scale', tint: 0x3a4a52 },
        metal: { surface: 'brass', tint: 0xc09a4a },
        tier: 'big',
        sculpt: (s, R) => {
          const c0 = s.j('core');
          // A long body, nose to flukes along +z / -z.
          s.ball('core', c0, V(R * 0.75, R * 0.7, R * 1.6), { mat: 'alt', k: R * 0.15 });
          s.ball('core', c0.clone().add(V(0, -R * 0.05, -R * 1.5)), V(R * 0.4, R * 0.4, R * 0.7), { mat: 'alt', k: R * 0.15 });
          // Flukes and fins.
          s.pair((_side, x) => {
            const t = c0.clone().add(V(0, 0, -R * 2.2));
            s.hard('core', spikeGeo(t, t.clone().add(V(x * R * 0.9, R * 0.1, -R * 0.35)), R * 0.2, 3, undefined, 1), 'alt');
            const f = c0.clone().add(V(x * R * 0.65, -R * 0.25, R * 0.4));
            s.hard('core', spikeGeo(f, f.clone().add(V(x * R * 0.7, -R * 0.35, -R * 0.4)), R * 0.18, 3, undefined, 1), 'alt');
          });
          // Coins nailed on, row on row, so the gold reads as scales.
          for (let row = 0; row < 7; row++) {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2 + row * 0.25;
              const z = R * (1.1 - row * 0.32);
              const rr = R * 0.72 * Math.sqrt(Math.max(0.15, 1 - (z / (R * 1.6)) ** 2));
              const n = V(Math.sin(a), Math.cos(a), 0);
              const p = c0.clone().add(V(Math.sin(a) * rr, Math.cos(a) * rr * 0.95, z));
              s.hard('core', ringGeo(p, R * 0.07, R * 0.03, n, 8), 'skin');
            }
          }
          // The head: a heavy jaw of brass teeth, small sad eyes.
          const hd = c0.clone().add(V(0, -R * 0.05, R * 1.55));
          for (let i = 0; i < 10; i++) {
            const a = (i / 9 - 0.5) * 2.4;
            const p = hd.clone().add(V(Math.sin(a) * R * 0.45, -R * 0.2, Math.cos(a) * R * 0.15));
            s.hard('core', spikeGeo(p, p.clone().add(V(0, -R * 0.18, R * 0.04)), R * 0.04, 3, undefined, 1), 'metal');
          }
          s.pair((_side, x) => s.eye('core', hd.clone().add(V(x * R * 0.5, R * 0.15, -R * 0.15)), R * 0.06, 0.8));
          // Chains of offering hang from its belly.
          for (let i = 0; i < 4; i++) chain(s, 'core', c0.clone().add(V((i - 1.5) * R * 0.3, -R * 0.6, R * (0.5 - i * 0.3))), c0.clone().add(V((i - 1.5) * R * 0.35, -R * 1.25, R * (0.5 - i * 0.3))), R * 0.05, GOLD);
        },
        style: { heavy: 0.75, attacks: ['lash', 'engulf'], ranged: false, idle: 'hover', gait: 'glide', spawn: 'emerge', death: 'crash' },
      }),
    ),

  // Corvus Hale: a thin man in a cloak of black feathers and a beaked mask,
  // crows perched on his shoulders and arms.
  corvus_hale: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.95,
        build: 'thin',
        skin: 0xa8988a,
        cloth: 0x1a1a20,
        robe: 0.6,
        tunic: 2,
        hood: true,
        cape: 1.0,
        weapon: 'dagger',
        weaponSize: 1.2,
        extra: (s, H) => {
          // The beaked mask.
          const h = s.j('head');
          s.hard('head', spikeGeo(h.clone().add(V(0, 0.01 * H, 0.05 * H)), h.clone().add(V(0, -0.03 * H, 0.15 * H)), 0.02 * H, 4, V(0, -0.02 * H, 0), 3), 'metal', [0.3, 0.26, 0.22]);
          s.pair((_side, x) => s.glow(h.clone().add(V(x * 0.022 * H, 0.025 * H, 0.055 * H)), 0.008 * H, 1, [1.2, 1.0, 0.5]));
          // A feather mantle: layered spikes over the shoulders and back.
          const r = seq(47);
          for (let i = 0; i < 24; i++) {
            const a = (i / 24 - 0.5) * 3.6 + Math.PI;
            const p = s.j('chest').add(V(Math.sin(a) * 0.13 * H, 0.08 * H - (i % 3) * 0.05 * H, Math.cos(a) * 0.1 * H));
            s.hard('chest', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.04 * H, -0.12 * H - r() * 0.05 * H, Math.cos(a) * 0.04 * H)), 0.018 * H, 3, undefined, 1), 'alt', DARK);
          }
          // Crows on his shoulders and one on his left arm.
          s.pair((side, x) => crow(s, `arm${side}`, s.j(`arm${side}`).add(V(x * 0.03 * H, 0.07 * H, 0)), 0.03 * H, V(x, 0, 1)));
          crow(s, 'foreL', s.j('foreL').add(V(0, 0.04 * H, 0.01 * H)), 0.028 * H, V(0.3, 0, 1));
        },
        style: { heavy: 0.1, attacks: ['thrust', 'swing', 'hurl'], armed: 'one', idle: 'still', gait: 'stalk', spawn: 'swoop', death: 'fade' },
      }),
    ),

  // Grandmother Thaw: a stooped old woman of packed snow in a knitted shawl,
  // icicles for needles, a cold hearth's ash on her apron.
  grandmother_thaw: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.8,
        build: 'stout',
        hunch: 0.4,
        skin: 0xe8f0f8,
        skinSurface: 'ice',
        cloth: 0x8a3a3a,
        robe: 0.95,
        tunic: 2,
        cape: 0.55,
        claws: 0.05,
        extra: (s, H) => {
          // A knitted shawl in bands, and a bun of snow.
          for (let i = 0; i < 3; i++) s.hard('chest', ringGeo(s.j('chest').add(V(0, 0.07 * H - i * 0.035 * H, -0.01 * H)), (0.12 + i * 0.01) * H, 0.012 * H, V(0, 1, 0.25).normalize(), 20), 'alt', i % 2 ? [0.9, 0.85, 0.8] : [0.55, 0.2, 0.2]);
          s.ball('head', s.j('head').add(V(0, 0.07 * H, -0.04 * H)), 0.035 * H, { k: 0.01 * H });
          // Icicle needles in both hands, a scarf of frost between them.
          s.pair((side) => {
            const h = lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.6);
            s.hard(`hand${side}`, spikeGeo(h.clone().add(V(0, -0.04 * H, 0)), h.clone().add(V(0, 0.16 * H, 0.04 * H)), 0.008 * H, 4, undefined, 1), 'metal', ICE, 0.4);
          });
          // Icicles hanging from her chin, elbows and hem.
          const r = seq(53);
          for (let i = 0; i < 14; i++) {
            const b = ['head', 'foreL', 'foreR', 'hips', 'hips', 'hips'][i % 6]!;
            const p = s.j(b).add(V((r() - 0.5) * (b === 'hips' ? 0.3 : 0.05) * H, b === 'hips' ? -0.38 * H : -0.03 * H, (r() - 0.3) * (b === 'hips' ? 0.25 : 0.05) * H));
            s.hard(b, spikeGeo(p, p.clone().add(V(0, -(0.04 + r() * 0.06) * H, 0)), 0.008 * H, 4, undefined, 1), 'metal', ICE, 0.3);
          }
          s.pair((_side, x) => s.glow(s.j('head').add(V(x * 0.022 * H, 0.03 * H, 0.055 * H)), 0.007 * H, 1, [0.6, 0.9, 1.4]));
        },
        style: { heavy: 0.25, attacks: ['claw', 'thrust', 'hurl'], armed: 'none', castBoth: true, idle: 'sway', gait: 'shamble' },
      }),
    ),

  // The Furnace Choir: the fire, a tall furnace with a mouth of grates and
  // three bellows breathing at its back, a chimney crowned with flame.
  furnace_choir: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'giant',
        rig: { shoulders: 0.17, hips: 0.09, arms: 1.1, hunch: 0.15, head: 0.75 },
        skin: { surface: 'iron', tint: 0x4a4440 },
        alt: { surface: 'rust', tint: 0x5a3020 },
        metal: { surface: 'brass', tint: 0xa07840 },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          // A furnace body, square shouldered, brick at the base.
          s.box('chest', ch, V(0.15 * H, 0.13 * H, 0.12 * H), { k: 0.01 * H, round: 0.02 * H });
          s.box('spine', s.j('spine'), V(0.12 * H, 0.08 * H, 0.1 * H), { mat: 'alt', k: 0.01 * H, round: 0.015 * H });
          s.box('hips', s.j('hips'), V(0.12 * H, 0.06 * H, 0.1 * H), { mat: 'alt', k: 0.01 * H, round: 0.015 * H });
          rivets(s, 'chest', ch.clone().add(V(-0.13 * H, 0.11 * H, 0.12 * H)), ch.clone().add(V(0.13 * H, 0.11 * H, 0.12 * H)), 8, 0.006 * H, BRASS);
          // Its singing mouth: a wide grate full of fire.
          grille(s, 'chest', ch.clone().add(V(0, -0.02 * H, 0.12 * H)), 0.1 * H, 0.06 * H, 6, DARK, [1.4, 0.7, 0.25]);
          // Bellows on its back, and the chimney.
          for (let i = 0; i < 3; i++) {
            const p = ch.clone().add(V((i - 1) * 0.09 * H, 0, -0.14 * H));
            s.hard('chest', boxGeo(p, V(0.07 * H, 0.12 * H, 0.03 * H)), 'alt', [0.35, 0.22, 0.15]);
            s.hard('chest', tubeGeo([p.clone().add(V(0, 0.06 * H, 0.02 * H)), p.clone().add(V(0, 0.12 * H, 0.05 * H))], () => 0.01 * H, 5), 'metal');
          }
          const st = ch.clone().add(V(0, 0.13 * H, -0.04 * H));
          s.hard('chest', tubeGeo([st, st.clone().add(V(0, 0.18 * H, 0))], () => 0.035 * H, 8, true), 'skin');
          fire(s, 'chest', st.clone().add(V(0, 0.2 * H, 0)), 5, 0.12 * H, 0.04 * H, 733);
          // Arms of pipe with tongs for hands; stout legs.
          s.pair((side) => {
            s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.045 * H, 0.04 * H, { mat: 'metal' });
            s.ball(`fore${side}`, s.j(`fore${side}`), 0.045 * H, { mat: 'alt' });
            s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.04 * H, 0.045 * H, { mat: 'metal' });
            const h = s.j(`hand${side}`);
            const t = s.j(`hand${side}Tip`);
            s.pair((_s2, y) => s.hard(`hand${side}`, tubeGeo([h, lerpV(h, t, 0.6).add(V(y * 0.02 * H, 0, 0)), t.clone().add(V(y * 0.01 * H, 0.0, 0.02 * H))], () => 0.008 * H, 4), 'skin'));
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.06 * H, 0.055 * H, { mat: 'alt' });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.055 * H, 0.065 * H);
            s.box(`foot${side}`, s.j(`foot${side}`).add(V(0, -0.01 * H, 0.03 * H)), V(0.06 * H, 0.03 * H, 0.09 * H), { k: 0.005 * H });
          });
          // A small head: a cowl vent with two burning eyes.
          const h = s.j('head');
          s.box('head', h, V(0.055 * H, 0.05 * H, 0.05 * H), { k: 0.006 * H });
          s.pair((_side, x) => s.boil('head', h.clone().add(V(x * 0.022 * H, 0.005 * H, 0.05 * H)), 0.01 * H, 1, [1.4, 0.7, 0.25]));
          gear(s, 'chest', ch.clone().add(V(0.12 * H, 0.08 * H, 0.1 * H)), 0.025 * H, V(0, 0, 1), 8, BRASS);
        },
        style: { heavy: 0.85, attacks: ['slam', 'hurl', 'stomp'], idle: 'breathe', gait: 'lumber', spawn: 'assemble', death: 'crash' },
      }),
    ),

  // The One Who Came Up Instead: you, near enough. Your coat, your stance,
  // light showing through it where it does not quite fit.
  came_up_instead: (c) =>
    asBoss(
      c,
      heroDouble(c, 1.85, [0.6, 0.85, 1.3], (s, H) => {
        // Stair dust settling off it, as if it has just climbed a long way.
        const r = seq(67);
        for (let i = 0; i < 8; i++) s.tint(s.j(i % 2 ? 'shinL' : 'shinR').add(V((r() - 0.5) * 0.05 * H, -r() * 0.1 * H, 0.03 * H)), 0.02 * H, [0.7, 0.68, 0.65]);
      }),
    ),

  // Vorrowmaw: a huge throat on a mound of flesh, four collars of chain
  // biting into it, teeth in rings all the way down.
  vorrowmaw: (c) =>
    asBoss(
      c,
      blobLook(c, {
        height: 1.6,
        radius: 1.0,
        lobes: 6,
        skin: { surface: 'flesh', tint: 0x8a5a50 },
        alt: { surface: 'slime', tint: 0x3a1418 },
        metal: { surface: 'iron', tint: 0x5a5658 },
        sculpt: (s, H, R) => {
          mass(s, H, R, { lobes: 6, top: 1.2, pod: 0.12, lobe: 0.3 });
          const t = s.j('top');
          const b = s.j('body');
          // The throat: a maw opening up and forward, rings of teeth inside.
          maw(s, 'top', t.clone().add(V(0, H * 0.12, R * 0.3)), R * 0.55, V(0, 0.6, 1), 24, 0.5);
          maw(s, 'top', t.clone().add(V(0, H * 0.08, R * 0.2)), R * 0.38, V(0, 0.6, 1), 18, 0);
          // Four iron collars biting into the flesh, chains running off.
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const p = b.clone().add(V(Math.sin(a) * R * 0.85, H * 0.1, Math.cos(a) * R * 0.85));
            s.hard('body', ringGeo(p, R * 0.12, R * 0.04, V(Math.sin(a), 0, Math.cos(a)), 12), 'metal');
            chain(s, 'body', p, p.clone().add(V(Math.sin(a) * R * 0.9, -H * 0.15, Math.cos(a) * R * 0.9)), R * 0.06, IRON);
          }
          // Small mean eyes high on the hump.
          for (let i = 0; i < 4; i++) {
            const a = (i / 3 - 0.5) * 1.6;
            eyeball(s, 'top', t.clone().add(V(Math.sin(a) * R * 0.5, H * 0.25, Math.cos(a) * R * 0.25)), R * 0.05, V(Math.sin(a), 0.3, 1), [1.3, 0.6, 0.2], true);
          }
          // Stumps of tongue lolling at the lip.
          for (let i = 0; i < 3; i++) tentacle(s, 'top', t.clone().add(V((i - 1) * R * 0.25, H * 0.05, R * 0.75)), V((i - 1) * 0.3, -0.3, 1), R * 0.6, R * 0.08, V(0, -H * 0.1, 0), 'alt');
        },
        style: { heavy: 0.85, attacks: ['engulf', 'lash', 'thrust'], idle: 'breathe', gait: 'roll', spawn: 'emerge', death: 'splat' },
      }),
    ),

  // The Archivist Below: a long grey shape like a stretched page, a quill as
  // long as a spear, blank sheets drifting round it.
  archivist_below: (c) =>
    asBoss(c, specterLook(c, { veil: true, claws: 0.12, height: 2.1 }), {
      extra: (s, H) => {
        // The quill.
        const hr = lerpV(s.j('handR'), s.j('handRTip'), 0.5);
        const qt = hr.clone().add(V(0.02 * H, 0.35 * H, 0.15 * H));
        s.hard('handR', tubeGeo([hr.clone().add(V(0, -0.05 * H, -0.02 * H)), qt], (t) => (0.006 - 0.004 * t) * H, 4), 'metal', BONE);
        for (let i = 0; i < 8; i++) {
          const p = lerpV(hr, qt, 0.3 + i * 0.08);
          s.pair((_side, x) => s.hard('handR', spikeGeo(p, p.clone().add(V(x * 0.04 * H, 0.02 * H, -0.01 * H)), 0.008 * H, 3, undefined, 1), 'alt', [0.85, 0.85, 0.82]));
        }
        // Blank pages drifting round it.
        const r = seq(89);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const p = s.j('chest').add(V(Math.sin(a) * 0.25 * H, (r() - 0.3) * 0.25 * H, Math.cos(a) * 0.22 * H));
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 0.8, a, r() * 0.6));
          s.hard('chest', boxGeo(p, V(0.06 * H, 0.08 * H, 0.002 * H), q), 'metal', [0.95, 0.93, 0.85], 0.15);
        }
        // An erased smear where a face should be.
        s.tint(s.j('head').add(V(0, 0.02 * H, 0.05 * H)), 0.04 * H, [0.75, 0.75, 0.72]);
      },
      style: { heavy: 0.1, attacks: ['claw', 'lash', 'lunge'] },
    }),

  // Saint Ossery the Twice-Crowned: an old king in plate under a royal robe,
  // a gold crown and over it a crown of thorns, weapons of old wars at his back.
  saint_ossery: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 2.0,
        build: 'stout',
        skin: 0xb8a090,
        cloth: 0x6a1a24,
        robe: 0.9,
        tunic: 2,
        armor: 0.85,
        helm: 'crown',
        cape: 1.0,
        belt: 1,
        weapon: 'sword',
        weaponSize: 1.35,
        weaponGlow: 0.6,
        steel: [0.85, 0.8, 0.65],
        metal: 0xd8b060,
        metalSurface: 'gold',
        extra: (s, H) => {
          thorns(s, 'head', s.j('head').add(V(0, 0.13 * H, 0)), 0.06 * H, [0.3, 0.22, 0.14]);
          // A long white beard.
          const h = s.j('head');
          s.hard('head', spikeGeo(h.clone().add(V(0, -0.03 * H, 0.04 * H)), h.clone().add(V(0, -0.16 * H, 0.07 * H)), 0.04 * H, 5, undefined, 2), 'alt', [0.9, 0.88, 0.85]);
          // Weapons of old wars on his back: a mace, a bow, a censer.
          const bk = s.j('chest').add(V(0, 0, -0.12 * H));
          s.hard('chest', tubeGeo([bk.clone().add(V(-0.08 * H, -0.2 * H, 0)), bk.clone().add(V(0.1 * H, 0.25 * H, -0.02 * H))], () => 0.01 * H, 5), 'metal', [0.4, 0.3, 0.2]);
          s.hard('chest', ballGeo(bk.clone().add(V(0.1 * H, 0.27 * H, -0.02 * H)), 0.035 * H, 1), 'metal', IRON);
          const bow: THREE.Vector3[] = [];
          for (let i = 0; i <= 8; i++) {
            const a = (i / 8 - 0.5) * 2.2;
            bow.push(bk.clone().add(V(Math.sin(a) * 0.08 * H - 0.02 * H, Math.cos(a) * 0.05 * H - 0.02 * H + (i / 8 - 0.5) * 0.4 * H, -0.03 * H)));
          }
          s.hard('chest', tubeGeo(bow, () => 0.007 * H, 4), 'alt', [0.35, 0.25, 0.16]);
          s.hard('hips', ballGeo(s.j('hips').add(V(0.11 * H, -0.06 * H, 0.03 * H)), 0.025 * H, 1), 'metal', GOLD);
          chain(s, 'hips', s.j('hips').add(V(0.1 * H, 0.0, 0.04 * H)), s.j('hips').add(V(0.11 * H, -0.04 * H, 0.03 * H)), 0.006 * H, GOLD);
          // A gold sun on the breastplate.
          s.hard('chest', ringGeo(s.j('chest').add(V(0, 0.02 * H, 0.1 * H)), 0.03 * H, 0.006 * H, V(0, 0, 1), 14), 'metal', GOLD, 0.3);
        },
        style: { heavy: 0.55, attacks: ['chop', 'swing', 'thrust'], armed: 'two', idle: 'breathe', gait: 'march', spawn: 'rise', death: 'topple' },
      }),
    ),

  // The Deep's Own Name: a vast slow mass at the bottom of everything, a
  // mouth that never closes, eyes that are each someone's, glowing letters
  // of every name it holds crawling over its skin.
  deeps_own_name: (c) =>
    asBoss(
      c,
      blobLook(c, {
        height: 1.8,
        radius: 1.05,
        lobes: 8,
        skin: { surface: 'shade', tint: 0x2a2038 },
        alt: { surface: 'slime', tint: 0x1a1020 },
        metal: { surface: 'bone', tint: 0xd8ccb0 },
        sculpt: (s, H, R) => {
          mass(s, H, R, { lobes: 8, top: 1.3, pod: 0.18, lobe: 0.34 });
          const t = s.j('top');
          const b = s.j('body');
          // The mouth, speaking.
          maw(s, 'top', t.clone().add(V(0, H * 0.06, R * 0.45)), R * 0.45, V(0, 0.15, 1), 26, 0.9);
          // Eyes, many, all different colours: each was someone's.
          const r = seq(997);
          for (let i = 0; i < 14; i++) {
            const a = (r() - 0.5) * 4.4;
            const up = r() > 0.5;
            const p = (up ? t : b).clone().add(V(Math.sin(a) * R * (up ? 0.6 : 0.9), H * (0.08 + r() * 0.2), Math.cos(a) * R * (up ? 0.55 : 0.82)));
            eyeball(s, up ? 'top' : 'body', p, R * (0.04 + r() * 0.05), V(Math.sin(a), 0.2, Math.cos(a)), [0.4 + r(), 0.4 + r(), 0.4 + r()], true);
          }
          // Letters of light crawling on it: short glowing strokes.
          for (let i = 0; i < 40; i++) {
            const a = r() * Math.PI * 2;
            const y = H * (r() * 0.5);
            const p = b.clone().add(V(Math.sin(a) * R * 0.98, y, Math.cos(a) * R * 0.96));
            s.glow(p, R * 0.02, 1.2, [1.2, 1.0, 1.4]);
          }
          // Long arms reaching up out of it, like the last of the ones it took.
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.3;
            const p = t.clone().add(V(Math.sin(a) * R * 0.6, H * 0.1, Math.cos(a) * R * 0.5));
            tentacle(s, 'top', p, V(Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6), R * 1.2, R * 0.08, V(Math.sin(a) * R * 0.3, -H * 0.1, Math.cos(a) * R * 0.3));
          }
        },
        style: { heavy: 0.9, attacks: ['engulf', 'lash', 'thrust'], idle: 'breathe', gait: 'roll', spawn: 'emerge', death: 'splat' },
      }),
    ),
};

export const BOSS_D_KIN: Record<string, LookFactory> = {
  // Your echo: a pale copy, thinner than you, light leaking from it.
  hero_echo: (c) => heroDouble(c, 1.8, [0.7, 0.9, 1.3]),
};
