/**
 * SLAY — bosses, part one (depth 1 to about 20): Gharruth the bone king, the
 * brood mother, Grell the butcher, warden Calix, hound master Vess, the ooze
 * sovereign, archivist Moln, forgefather Hurn, tidewarden Nheru, plaguelord
 * Ossik, the gaze of Uln and Rimeheart.
 *
 * Each is built on a family's body and then given what makes it a boss: a
 * silhouette you know from across the arena (a fan of ribs behind a crown, an
 * egg sac bigger than the spider, hooks on chains, a vault door for a chest).
 * `asBoss` lands every one at 4 to 6 m in game, by its data scale.
 */
import * as THREE from 'three';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, ringGeo, spikeGeo, tubeGeo, ovalGeo } from './Sculpt';
import { specterRig, floaterRig } from './Rig';
import { V, belt, cape, claws, foot, lerpV, pauldron, quatAlong, seq, skirt, trunk } from './Kit';
import { weapon } from './Arms';
import { skeletonLook } from './LookUndead';
import { manLook } from './LookHumanoid';
import { bugLegs, bugLook } from './LookBug';
import { fiendLook } from './LookDemon';
import { botLook, gear, grille, lens, mechArms, mechLegs, rivets, shield } from './LookConstruct';
import { crystals, facet, fire, walkLook } from './LookElemental';
import { blobLook, eyeball, hangers, maw } from './LookAberration';
import { bubbles, drips, mass, skullAt } from './LookOoze';
import type { MotionStyle } from './Motion';

const BONE: RGB = [0.86, 0.8, 0.66];
const IRON: RGB = [0.42, 0.42, 0.45];
const DARK: RGB = [0.08, 0.07, 0.07];
const BRASS: RGB = [0.75, 0.58, 0.3];
const TOOTH: RGB = [0.85, 0.8, 0.62];
const BLOOD: RGB = [0.45, 0.06, 0.05];

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

/**
 * In-game height for a boss of data scale `k`. Large and giant bosses (1.9
 * and up) stand 4 to 6 m. Tall ones (1.3 to 1.8) stand 2.7 to 3.6 m, and
 * person sized ones (up to 1.25) 2.0 to 2.3 m: a head over the hero, no more.
 */
export function bossHeight(k: number): number {
  if (k <= 1.25) return 2.0 + Math.max(0, Math.min(0.35, k - 0.9));
  if (k < 1.9) return 2.7 + 1.8 * Math.max(0, Math.min(0.5, k - 1.3));
  return 4 + 2 * Math.min(1, Math.max(0, (k - 1.9) / 1.9));
}

/**
 * Makes a family look a boss: the boss mesh budget, a size that lands it at
 * its boss height once the data's scale is applied, and optionally more parts
 * sculpted on after the family's own (`extra`, given the rig height).
 */
export function asBoss(
  c: LookCtx,
  look: CreatureLook,
  o: { extra?: (s: Sculpt, H: number) => void; height?: number; style?: Partial<MotionStyle>; mats?: CreatureLook['mats'] } = {},
): CreatureLook {
  const rigH = look.rig().height;
  const target = o.height ?? bossHeight(c.scale || 2.5);
  const inner = look.sculpt;
  const mats = { ...look.mats };
  for (const [k, v] of Object.entries(o.mats ?? {})) mats[k as CMat] = { ...(mats[k as CMat] ?? v!), ...v! };
  return {
    ...look,
    tier: 'boss',
    size: target / (rigH * Math.max(0.1, c.scale || 2.5)),
    sculpt: o.extra
      ? (s) => {
          inner(s);
          o.extra!(s, s.rig.height);
        }
      : inner,
    mats,
    style: { ...look.style, ...o.style },
  };
}

// ---------------------------------------------------------------------------
// Shared boss parts
// ---------------------------------------------------------------------------

/** A ring of tube round a centre, in the plane whose normal is `n`. */
function ring(c: THREE.Vector3, r: number, tube: number, n = V(0, 1, 0), seg = 18): THREE.BufferGeometry {
  return ringGeo(c, r, tube, n, seg);
}

/** A chain hanging from `a` toward `b` as a run of small links. */
function chain(s: Sculpt, bone: string, a: THREE.Vector3, b: THREE.Vector3, link: number, col: RGB = IRON, mat: CMat = 'metal'): void {
  const n = Math.max(2, Math.round(a.distanceTo(b) / (link * 1.6)));
  const d = b.clone().sub(a).normalize();
  const side = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const p = lerpV(a, b, (i + 0.5) / n);
    // Alternate links turn a quarter so the run reads as chain, not beads.
    const nn = i % 2 ? side.clone().cross(d).normalize() : side.clone();
    s.hard(bone, ring(p, link * 0.55, link * 0.16, nn, 8), mat, col);
  }
}

/** A hook: a shank down from `a`, then a curl up with a point. */
function hook(s: Sculpt, bone: string, a: THREE.Vector3, size: number, face: THREE.Vector3, col: RGB = IRON, mat: CMat = 'metal'): void {
  const f = face.clone().normalize();
  const pts = [a.clone(), a.clone().add(V(0, -size * 0.6, 0)), a.clone().add(V(0, -size * 0.95, 0)).addScaledVector(f, size * 0.15), a.clone().add(V(0, -size * 0.9, 0)).addScaledVector(f, size * 0.42), a.clone().add(V(0, -size * 0.6, 0)).addScaledVector(f, size * 0.5)];
  s.hard(bone, tubeGeo(pts, (t) => size * (0.07 - 0.05 * t), 5, true), mat, col);
}

// ---------------------------------------------------------------------------

const BOSS_A: Record<string, LookFactory> = {
  // The bone king: a towering armoured skeleton, a crown of vertebrae, a fan
  // of great ribs rising behind him like the back of his throne.
  boneking_gharruth: (c) =>
    asBoss(
      c,
      skeletonLook(c, {
        brute: true,
        height: 2.1,
        armor: 0.9,
        weapon: 'greataxe',
        weaponSize: 1.2,
        steel: [0.55, 0.45, 0.28],
        boneTint: 0xd6cfb4,
        style: { heavy: 0.85, attacks: ['chop', 'swing', 'slam'], armed: 'two', spawn: 'rise', death: 'crash', gait: 'march', idle: 'breathe' },
      }),
      {
        mats: { alt: { surface: 'cloth', tint: 0x4a1616, glow: c.visual.glow ?? 0x66ff99 }, metal: { surface: 'brass', tint: 0x8a7448, glow: c.visual.glow ?? 0x66ff99 } },
        extra: (s, H) => {
          const h = s.j('head');
          // Crown: a band of bone with vertebrae stacked upward round it.
          const cc = h.clone().add(V(0, 0.07 * H, 0.0));
          s.hard('head', ring(cc, 0.065 * H, 0.012 * H), 'metal', [0.75, 0.6, 0.3]);
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const out = V(Math.sin(a), 0, Math.cos(a));
            const tall = i % 2 ? 3 : 4;
            for (let k = 0; k < tall; k++) {
              const p = cc.clone().addScaledVector(out, 0.06 * H + k * 0.006 * H).add(V(0, 0.015 * H + k * 0.022 * H, 0));
              s.hard('head', boxGeo(p, V(0.014 * H, 0.008 * H, 0.014 * H), quatAlong(V(out.x * 0.3, 1, out.z * 0.3))), 'skin', BONE);
              s.hard('head', spikeGeo(p, p.clone().addScaledVector(out, 0.016 * H), 0.004 * H, 3, undefined, 1), 'skin', BONE);
            }
          }
          s.boil('head', cc.clone().add(V(0, 0.0, 0.06 * H)), 0.01 * H, 1, [0.7, 1.2, 0.8]);
          // The throne-back: six great ribs fanning up from the shoulder blades.
          const back = s.j('chest').add(V(0, 0.02 * H, -0.08 * H));
          for (let i = 0; i < 6; i++) {
            const a = (i / 5 - 0.5) * 1.9;
            const tip = back.clone().add(V(Math.sin(a) * 0.32 * H, 0.32 * H + Math.cos(a) * 0.12 * H, -0.12 * H));
            const mid = lerpV(back, tip, 0.5).add(V(0, 0, -0.08 * H));
            s.hard('chest', tubeGeo([back.clone().add(V(Math.sin(a) * 0.04 * H, 0, 0)), mid, tip], (t) => (0.026 - 0.018 * t) * H, 6, true), 'skin', BONE);
          }
          // A tattered royal cape and a sash of skulls.
          cape(s, { len: 0.85, w: 0.16, torn: 1 });
          for (let i = 0; i < 4; i++) {
            const p = lerpV(s.j('hips'), s.j('chest'), 0.15).add(V((i - 1.5) * 0.045 * H, -0.02 * H, 0.08 * H));
            skullAt(s, 'hips', p, 0.018 * H, V(0, -0.2, 1));
          }
          // The soul fire in his chest.
          s.boil('chest', s.j('chest').add(V(0, 0.01 * H, 0.0)), 0.022 * H, 1, [0.6, 1.2, 0.75]);
        },
      },
    ),

  // The brood mother: a spider carrying an egg sac bigger than herself, eggs
  // glowing through it, young riding on top, webs trailing behind.
  broodmother_saelith: (c) =>
    asBoss(
      c,
      bugLook(c, {
        kind: 'spider',
        body: 0.4,
        ride: 0.5,
        abdomen: 1.5,
        reach: 2.5,
        tint: 0x2e3528,
        alt: { surface: 'slime', tint: 0x8a9a5a },
        metal: { surface: 'bone', tint: 0xd8ceb0 },
        sculpt: (s, B) => {
          const b = s.j('body');
          s.ball('body', b, V(B * 0.8, B * 0.55, B * 0.9), { k: B * 0.1 });
          // A crest of spines on the cephalothorax.
          for (let i = 0; i < 7; i++) {
            const p = b.clone().add(V((i - 3) * B * 0.12, B * 0.45, -B * 0.1 + Math.abs(i - 3) * B * 0.05));
            s.hard('body', spikeGeo(p, p.clone().add(V((i - 3) * B * 0.06, B * (0.45 - Math.abs(i - 3) * 0.08), -B * 0.2)), B * 0.05, 4, undefined, 2), 'skin', DARK);
          }
          const a = s.j('abdomen');
          const t = s.j('abdomenTip');
          s.limb('abdomen', b.clone().add(V(0, 0, -B * 0.6)), a, B * 0.3, B * 0.3, { k: B * 0.1 });
          const m = lerpV(a, t, 0.5).add(V(0, B * 0.35, 0));
          s.ball('abdomen', m, V(B * 1.25, B * 1.1, B * 1.55), { k: B * 0.2 });
          // The egg sac: pale swollen lobes over the back, eggs lit inside.
          const r = seq(211);
          for (let i = 0; i < 9; i++) {
            const u = r() * Math.PI * 2;
            const e = 0.3 + r() * 0.9;
            const p = m.clone().add(V(Math.sin(u) * Math.sin(e) * B * 1.1, Math.cos(e) * B * 1.0, Math.cos(u) * Math.sin(e) * B * 1.35));
            s.ball('abdomen', p, B * (0.32 + r() * 0.15), { mat: 'alt', k: B * 0.15 });
            s.boil('abdomen', p.clone().add(V(0, B * 0.1, 0)), B * (0.08 + r() * 0.05), 0.7, [0.75, 1.15, 0.4]);
          }
          // Young riding on the sac.
          for (let i = 0; i < 5; i++) {
            const u = r() * Math.PI * 2;
            const p = m.clone().add(V(Math.sin(u) * B * 0.7, B * 1.15, Math.cos(u) * B * 0.9));
            s.hard('abdomen', ballGeo(p, B * 0.07, 0), 'skin', DARK);
            for (let k = 0; k < 4; k++) {
              const w = (k / 4) * Math.PI * 2 + u;
              s.hard('abdomen', spikeGeo(p, p.clone().add(V(Math.sin(w) * B * 0.16, -B * 0.04, Math.cos(w) * B * 0.16)), B * 0.012, 3, V(0, B * 0.06, 0), 2), 'skin', DARK);
            }
          }
          // Silk trailing from the spinnerets to the floor.
          for (let i = 0; i < 4; i++) {
            const p = t.clone().add(V((i - 1.5) * B * 0.12, B * 0.1, B * 0.1));
            s.hard('abdomen', tubeGeo([p, p.clone().add(V((i - 1.5) * B * 0.3, -B * 0.4, -B * 0.6)), V(p.x + (i - 1.5) * B * 0.5, 0.02, p.z - B * 1.4)], () => B * 0.012, 3), 'metal', [0.9, 0.9, 0.85]);
          }
          // Head: eight eyes, great fangs dripping venom.
          const h = s.j('head');
          s.ball('head', h, V(B * 0.42, B * 0.34, B * 0.4), { k: B * 0.1 });
          s.pair((_side, x) => {
            s.eye('head', h.clone().add(V(x * B * 0.13, B * 0.2, B * 0.35)), B * 0.09, 1.6);
            for (let i = 0; i < 3; i++) s.eye('head', h.clone().add(V(x * B * (0.24 + i * 0.06), B * (0.26 - i * 0.05), B * (0.27 - i * 0.07))), B * 0.045, 1.2);
          });
          s.pair((side) => {
            s.hard(`mand${side}`, spikeGeo(s.j(`mand${side}`), s.j(`mand${side}Tip`).add(V(0, -B * 0.1, 0)), B * 0.1, 5, V(0, 0, B * 0.08), 3), 'skin', DARK);
            s.boil(`mand${side}`, s.j(`mand${side}Tip`).add(V(0, -B * 0.12, 0)), B * 0.035, 1, [0.7, 1.2, 0.3]);
          });
          bugLegs(s, { r: B * 0.1, hair: true, spines: 3 });
        },
        paint: { grime: 0.35, ao: 0.9, mottle: { scale: 5, amount: 0.35, col: [0.4, 0.45, 0.3] }, top: { amount: 0.12, col: [1.1, 1.15, 1.0] } },
        style: { heavy: 0.6, attacks: ['bite', 'claw', 'lunge'], spawn: 'drop', death: 'flip', idle: 'twitch', gait: 'scuttle' },
      }),
    ),

  // The butcher: a mountain of pale fat in a blood-black apron, a sack over
  // his head, hooks and chains all over him, a cleaver the size of a door.
  butcher_grell: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.0,
        kind: 'giant',
        hip: 0.42,
        hunch: 0.45,
        head: 0.75,
        arms: 1.25,
        shoulders: 0.21,
        armOut: 0.42,
        thick: 1.75,
        belly: 0.16,
        hump: 0.05,
        skin: 0xb08070,
        skinSurface: 'flesh',
        alt: { surface: 'leather', tint: 0x2a1a16 },
        metal: { surface: 'rust', tint: 0x8a7060 },
        claws: 0,
        weapon: 'cleaver',
        weaponSize: 1.7,
        steel: [0.5, 0.45, 0.4],
        faceFn: (s, H) => {
          // A sack hood tied at the neck, two ragged eye holes burning red.
          const h = s.j('head').add(V(0, 0.04 * H, 0.0));
          s.ball('head', h, V(0.07 * H, 0.08 * H, 0.075 * H), { mat: 'alt', k: 0.02 * H });
          s.ball('head', h.clone().add(V(0, 0.07 * H, -0.01 * H)), V(0.04 * H, 0.03 * H, 0.04 * H), { mat: 'alt', k: 0.02 * H });
          s.pair((_side, x) => {
            s.ball('head', h.clone().add(V(x * 0.028 * H, 0.01 * H, 0.072 * H)), 0.017 * H, { mat: 'alt', sub: true, k: 0.004 * H });
            s.eye('head', h.clone().add(V(x * 0.028 * H, 0.01 * H, 0.06 * H)), 0.009 * H, 1.8);
          });
          s.hard('head', ring(h.clone().add(V(0, -0.06 * H, 0)), 0.055 * H, 0.006 * H), 'metal', [0.45, 0.38, 0.3]);
          // A slack jaw of stubble under the sack.
          s.ball('head', h.clone().add(V(0, -0.07 * H, 0.04 * H)), V(0.05 * H, 0.03 * H, 0.04 * H), { k: 0.02 * H });
        },
        extra: (s, H) => {
          // The apron: chest to shins, splashed black.
          skirt(s, { len: 0.85, flare: 0.04, top: 0.02, thick: 0.01, back: false, sides: false });
          s.ball('chest', s.j('chest').add(V(0, -0.02 * H, 0.12 * H)), V(0.13 * H, 0.1 * H, 0.025 * H), { mat: 'alt', k: 0.02 * H });
          s.tint(s.j('spine').add(V(0.05 * H, 0, 0.17 * H)), 0.08 * H, BLOOD, ['alt', 'skin']);
          s.tint(s.j('hips').add(V(-0.06 * H, -0.08 * H, 0.14 * H)), 0.07 * H, BLOOD, ['alt']);
          s.tint(s.j('handR'), 0.06 * H, BLOOD, ['skin']);
          // Hooks on chains hanging from a belt and from a yoke on his back.
          belt(s, { pouches: 0, mat: 'alt' });
          const hp = s.j('hips');
          for (let i = 0; i < 3; i++) {
            const a = (i - 1) * 0.8 + Math.PI;
            const top = hp.clone().add(V(Math.sin(a) * 0.12 * H, 0.03 * H, Math.cos(a) * 0.1 * H));
            const end = top.clone().add(V(Math.sin(a) * 0.02 * H, -0.16 * H, Math.cos(a) * 0.02 * H));
            chain(s, 'hips', top, end, 0.014 * H);
            hook(s, 'hips', end, 0.07 * H, V(Math.sin(a), 0, Math.cos(a)));
          }
          const ch = s.j('chest');
          const yoke = ch.clone().add(V(0, 0.1 * H, -0.12 * H));
          s.hard('chest', tubeGeo([yoke.clone().add(V(0.22 * H, -0.02 * H, 0)), yoke.clone().add(V(0, 0.03 * H, -0.02 * H)), yoke.clone().add(V(-0.22 * H, -0.02 * H, 0))], () => 0.012 * H, 6), 'metal', [0.35, 0.25, 0.18]);
          s.pair((_side, x) => {
            const top = yoke.clone().add(V(x * 0.2 * H, -0.02 * H, 0));
            const end = top.clone().add(V(x * 0.02 * H, -0.14 * H, -0.02 * H));
            chain(s, 'chest', top, end, 0.014 * H);
            hook(s, 'chest', end, 0.08 * H, V(x * 0.3, 0, -1));
          });
          // Stitches across the gut, a meat hook through the left forearm.
          for (let i = 0; i < 6; i++) {
            const p = s.j('spine').add(V(-0.1 * H + i * 0.035 * H, 0.04 * H + Math.sin(i) * 0.01 * H, 0.15 * H));
            s.hard('spine', boxGeo(p, V(0.003 * H, 0.02 * H, 0.004 * H)), 'metal', DARK);
          }
          hook(s, 'foreL', lerpV(s.j('foreL'), s.j('handL'), 0.4).add(V(0.04 * H, 0.04 * H, 0)), 0.09 * H, V(1, 0, 0.3));
        },
        paintSkin: { base: [1.6, 1.4, 1.35], grime: 0.5, ao: 0.9, mottle: { scale: 4, amount: 0.4, col: [0.75, 0.45, 0.42] }, top: { amount: 0.12, col: [1.1, 1.05, 1.0] } },
        lumps: { amp: 0.012, scale: 6 },
        style: { heavy: 0.85, attacks: ['chop', 'swing', 'slam'], armed: 'one', idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
      }),
    ),

  // The vault warden: a wall of iron with a tower shield and a vault door for
  // a chest, four lamps in its visor, moss in its joints.
  warden_calix: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 1.9,
        kind: 'giant',
        rig: { hip: 0.45, shoulders: 0.21, hips: 0.09, arms: 1.25, hunch: 0.22, head: 0.72, armOut: 0.38 },
        skin: { surface: 'iron', tint: 0x8b8f96 },
        alt: { surface: 'rust', tint: 0x4a3e36 },
        metal: { surface: 'brass', tint: 0xa08048 },
        sculpt: (s, H) => {
          trunk(s, { chest: [0.16, 0.12, 0.12], pelvis: [0.11, 0.08, 0.07], shoulders: 0.07 });
          const ch = s.j('chest');
          // The vault door: a round plate with a wheel lock and bolts.
          const door = ch.clone().add(V(0, 0.0, 0.15 * H));
          s.ball('chest', door, V(0.1 * H, 0.1 * H, 0.03 * H), { k: 0.01 * H });
          gear(s, 'chest', door.clone().add(V(0, 0, 0.03 * H)), 0.07 * H, V(0, 0, 1), 12, BRASS, 'metal', 0);
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            s.hard('chest', tubeGeo([door.clone().add(V(0, 0, 0.045 * H)), door.clone().add(V(Math.sin(a) * 0.055 * H, Math.cos(a) * 0.055 * H, 0.05 * H))], () => 0.006 * H, 4), 'metal', BRASS);
          }
          s.boil('chest', door.clone().add(V(0, 0, 0.055 * H)), 0.014 * H, 1, [1.3, 0.8, 0.3]);
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            s.hard('chest', ballGeo(door.clone().add(V(Math.sin(a) * 0.095 * H, Math.cos(a) * 0.095 * H, 0.02 * H)), 0.008 * H, 0), 'metal', IRON);
          }
          s.pair((side) => pauldron(s, side, 0.1, 'skin', 0));
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`);
            for (let i = 0; i < 3; i++) s.hard(`arm${side}`, boxGeo(sh.clone().add(V(x * (0.02 + i * 0.03) * H, (0.1 - i * 0.02) * H, 0)), V(0.012 * H, 0.03 * H, 0.08 * H)), 'skin');
          });
          // A plated skirt.
          skirt(s, { len: 0.45, flare: 0.05, mat: 'skin', thick: 0.012 });
          // The head: a block helm sunk between the shoulders, four lamps in a slit.
          const h = s.j('head').add(V(0, 0.02 * H, 0.0));
          s.box('head', h, V(0.065 * H, 0.06 * H, 0.065 * H), { k: 0.006 * H, round: 0.015 * H });
          s.box('head', h.clone().add(V(0, 0.08 * H, 0)), V(0.01 * H, 0.03 * H, 0.06 * H), { k: 0.004 * H });
          for (const x of [-0.042, -0.014, 0.014, 0.042]) lens(s, 'head', h.clone().add(V(x * H, 0.01 * H, 0.066 * H)), 0.01 * H, V(0, 0, 1), 1.8, IRON);
          mechArms(s, { r: 0.045, mat: 'skin', joint: 'alt', hand: 'gauntlet', handK: 1.4 });
          mechLegs(s, { r: 0.06, mat: 'skin', joint: 'alt', footW: 0.08 });
          // Tower shield and a great mace.
          shield(s, H, { h: 0.55, w: 0.17, mat: 'skin', tower: true, boss: BRASS });
          weapon(s, 'mace', { steel: IRON, size: 1.4 });
          // Rivets down the front, moss in the cracks.
          for (let i = 0; i < 2; i++) rivets(s, 'spine', s.j('spine').add(V(-0.12 * H, (0.04 - i * 0.06) * H, 0.11 * H)), s.j('spine').add(V(0.12 * H, (0.04 - i * 0.06) * H, 0.11 * H)), 8, 0.007 * H);
        },
        paint: {
          skin: { grime: 0.6, ao: 0.9, mottle: { scale: 6, amount: 0.45, col: [0.4, 0.5, 0.3] }, top: { amount: 0.25, col: [1.1, 1.15, 1.0] } },
          alt: { grime: 0.5, ao: 0.85, mottle: { scale: 5, amount: 0.4, col: [0.35, 0.45, 0.25] } },
        },
        style: { heavy: 0.9, attacks: ['slam', 'swing', 'stomp'], armed: 'one', idle: 'still', gait: 'lumber', spawn: 'assemble', death: 'crash' },
      }),
    ),

  // The hound master: a lean huntress in furs, a wolf's skull for a helm, a
  // long whip coiled in her hand, a horn at her hip.
  hound_master_vess: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.85,
        build: 'normal',
        head: 'human',
        skin: 0xb89a80,
        cloth: 0x4a3a2a,
        clothSurface: 'leather',
        armor: 0.3,
        cape: 0.7,
        belt: 2,
        strap: true,
        tunic: 2,
        tunicCol: 0x3a2e24,
        extra: (s, H) => {
          // A wolf skull worn over the head, the upper jaw over her brow.
          const h = s.j('head').add(V(0, 0.06 * H, 0.0));
          s.ball('head', h, V(0.06 * H, 0.045 * H, 0.07 * H), { mat: 'metal', k: 0.01 * H });
          s.limb('head', h.clone().add(V(0, -0.005 * H, 0.04 * H)), h.clone().add(V(0, -0.025 * H, 0.13 * H)), 0.03 * H, 0.018 * H, { mat: 'metal', k: 0.01 * H });
          for (let i = 0; i < 6; i++) {
            const x = (i - 2.5) * 0.008 * H;
            const p = h.clone().add(V(x, -0.04 * H, 0.1 * H - Math.abs(x) * 1.2));
            s.hard('head', spikeGeo(p, p.clone().add(V(0, -0.02 * H, 0)), 0.003 * H, 3, undefined, 1), 'metal', TOOTH);
          }
          s.pair((_side, x) => {
            s.hard('head', spikeGeo(h.clone().add(V(x * 0.04 * H, 0.03 * H, -0.01 * H)), h.clone().add(V(x * 0.05 * H, 0.08 * H, -0.03 * H)), 0.01 * H, 4, undefined, 2), 'metal', TOOTH);
            s.eye('head', h.clone().add(V(x * 0.022 * H, -0.06 * H, 0.06 * H)), 0.006 * H, 1.4);
          });
          // A wolf pelt mantle: tufts of fur across the shoulders.
          const r = seq(231);
          for (let i = 0; i < 14; i++) {
            const a = (i / 13 - 0.5) * 3.4;
            const p = s.j('neck').add(V(Math.sin(a) * 0.14 * H, -0.03 * H, Math.cos(a) * 0.07 * H - 0.02 * H));
            s.hard('chest', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.05 * H, -(0.06 + r() * 0.05) * H, Math.cos(a) * 0.03 * H)), 0.022 * H, 4, undefined, 2), 'alt', [0.45, 0.4, 0.35]);
          }
          // The whip: a handle, then a long lash coiling to the floor.
          const hr = s.j('handR');
          const ht = s.j('handRTip');
          const d = ht.clone().sub(hr).normalize();
          const g0 = lerpV(hr, ht, 0.5);
          const g1 = g0.clone().addScaledVector(d, 0.14 * H);
          s.hard('handR', tubeGeo([g0.clone().addScaledVector(d, -0.04 * H), g1], () => 0.01 * H, 6), 'alt', [0.3, 0.22, 0.16]);
          const pts: THREE.Vector3[] = [g1];
          for (let i = 1; i <= 14; i++) {
            const t = i / 14;
            pts.push(g1.clone().add(V(-0.08 * H * Math.sin(t * 5) * t, -0.5 * H * t, 0.18 * H * t + 0.1 * H * Math.cos(t * 5) * t)));
          }
          s.hard('handR', tubeGeo(pts, (t) => 0.007 * H * (1 - 0.7 * t), 4), 'alt', [0.32, 0.24, 0.18]);
          // A hunting horn at her hip and a pair of long knives.
          const hp = s.j('hips');
          s.hard('hips', tubeGeo([hp.clone().add(V(0.09 * H, 0.0, -0.03 * H)), hp.clone().add(V(0.12 * H, -0.06 * H, 0.02 * H)), hp.clone().add(V(0.1 * H, -0.1 * H, 0.08 * H))], (t) => (0.008 + 0.02 * t) * H, 6), 'metal', [0.85, 0.78, 0.6]);
          s.pair((_side, x) => s.hard('hips', boxGeo(hp.clone().add(V(-x * 0.03 * H - 0.08 * H, -0.05 * H, -0.05 * H)), V(0.006 * H, 0.06 * H, 0.012 * H)), 'metal', IRON));
        },
        style: { heavy: 0.3, attacks: ['lash', 'thrust', 'swing'], armed: 'one', castBoth: false, idle: 'prowl', gait: 'stalk', spawn: 'rise', death: 'topple' },
      }),
      { mats: { metal: { surface: 'bone', tint: 0xd8ceb0, glow: c.visual.glow ?? 0xff8822 } } },
    ),

  // The ooze sovereign: a hill of clear green jelly with a drowned knight
  // inside it, his crown floating at the top, seven eyes adrift in it.
  ooze_sovereign: (c) =>
    asBoss(
      c,
      blobLook(c, {
        height: 1.45,
        radius: 0.85,
        lobes: 7,
        skin: { surface: 'jelly', tint: 0x7aa050 },
        alt: { surface: 'slime', tint: 0x3a5a20 },
        metal: { surface: 'steel', tint: 0x9a9890 },
        sculpt: (s, H, R) => {
          mass(s, H, R, { lobes: 7, top: 1.05, pod: 0.12, lobe: 0.3 });
          const b = s.j('body');
          const t = s.j('top');
          // The knight: helm, breastplate, a sword through him, gauntlets reaching up.
          const k = b.clone().add(V(0, H * 0.08, R * 0.1));
          s.hard('body', ballGeo(k.clone().add(V(0, H * 0.32, 0)), R * 0.12, 1), 'metal', [0.55, 0.55, 0.52]);
          s.hard('body', boxGeo(k.clone().add(V(0, H * 0.3, R * 0.11)), V(R * 0.08, R * 0.015, R * 0.02)), 'metal', DARK);
          s.hard('body', boxGeo(k.clone().add(V(0, H * 0.14, 0)), V(R * 0.18, H * 0.1, R * 0.1)), 'metal', [0.5, 0.5, 0.48]);
          s.pair((_side, x) => {
            s.hard('body', ballGeo(k.clone().add(V(x * R * 0.22, H * 0.22, 0)), R * 0.08, 0), 'metal', [0.5, 0.5, 0.48]);
            s.hard('body', tubeGeo([k.clone().add(V(x * R * 0.24, H * 0.2, 0)), k.clone().add(V(x * R * 0.35, H * 0.3, R * 0.15)), k.clone().add(V(x * R * 0.3, H * 0.42, R * 0.25))], () => R * 0.035, 5), 'metal', [0.5, 0.5, 0.48]);
          });
          s.hard('body', tubeGeo([k.clone().add(V(-R * 0.5, H * 0.35, -R * 0.2)), k.clone().add(V(R * 0.45, -H * 0.05, R * 0.25))], () => R * 0.02, 4), 'metal', [0.7, 0.72, 0.75]);
          s.hard('body', boxGeo(k.clone().add(V(-R * 0.38, H * 0.3, -R * 0.15)), V(R * 0.12, R * 0.02, R * 0.03), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.7)), 'metal', BRASS);
          // Bones of everything else it ate, and coins.
          const r = seq(241);
          for (let i = 0; i < 8; i++) {
            const p = b.clone().add(V((r() - 0.5) * R * 1.3, (r() - 0.3) * H * 0.3, (r() - 0.5) * R * 1.2));
            s.hard('body', tubeGeo([p, p.clone().add(V((r() - 0.5) * R * 0.4, (r() - 0.5) * R * 0.3, (r() - 0.5) * R * 0.4))], () => R * 0.018, 4), 'metal', BONE);
          }
          for (let i = 0; i < 3; i++) skullAt(s, 'body', b.clone().add(V((r() - 0.5) * R * 1.1, (r() - 0.5) * H * 0.2, (r() - 0.2) * R * 0.8)), R * 0.07, V(r() - 0.5, 0, 1));
          for (let i = 0; i < 10; i++) s.hard('body', ballGeo(b.clone().add(V((r() - 0.5) * R * 1.4, -H * 0.25 + r() * H * 0.1, (r() - 0.5) * R * 1.3)), R * 0.025, 0), 'metal', [0.95, 0.75, 0.3], 0.3);
          // The crown, floating at the top.
          const cr = t.clone().add(V(0, H * 0.22, 0));
          s.hard('top', ring(cr, R * 0.16, R * 0.025), 'metal', [0.95, 0.75, 0.3], 0.2);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const p = cr.clone().add(V(Math.sin(a) * R * 0.16, 0, Math.cos(a) * R * 0.16));
            s.hard('top', spikeGeo(p, p.clone().add(V(0, R * 0.12, 0)), R * 0.025, 4, undefined, 1), 'metal', [0.95, 0.75, 0.3], 0.2);
          }
          // Seven eyes adrift.
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.4;
            const p = (i < 3 ? t : b).clone().add(V(Math.sin(a) * R * (i < 3 ? 0.45 : 0.75), H * (i < 3 ? 0.12 : 0.15), Math.cos(a) * R * (i < 3 ? 0.4 : 0.7)));
            eyeball(s, i < 3 ? 'top' : 'body', p, R * (0.06 + (i % 3) * 0.015), V(Math.sin(a), 0.2, Math.cos(a)), [0.9, 1.2, 0.3], false);
          }
          drips(s, H, R, 10, 243, 'alt');
          bubbles(s, 'top', t.clone().add(V(0, H * 0.1, 0)), V(R * 0.5, H * 0.15, R * 0.5), 8, R * 0.035, 245, [0.8, 1.2, 0.5], 0.4);
        },
        paint: { skin: { grime: 0.1, ao: 0.5, top: { amount: 0.3, col: [1.25, 1.35, 1.15] } }, alt: { grime: 0, ao: 0.4 }, metal: { grime: 0.4, ao: 0.7, mottle: { scale: 8, amount: 0.5, col: [0.4, 0.5, 0.3] } } },
        style: { heavy: 0.85, attacks: ['engulf', 'slam', 'lash'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
      }),
    ),

  // The archivist: a skeletal scholar in a high-collared robe, an open book
  // as big as a door in one hand, books chained to his belt, candles burning
  // on his shoulders.
  archivist_moln: (c) =>
    asBoss(
      c,
      skeletonLook(c, {
        height: 2.0,
        robe: true,
        hood: true,
        weapon: 'staff',
        boneTint: 0xb8b09a,
        style: { heavy: 0.35, attacks: ['swing', 'thrust'], armed: 'staff', castBoth: true, spawn: 'form', death: 'scatter', idle: 'still', gait: 'walk' },
      }),
      {
        mats: { alt: { surface: 'cloth', tint: 0x2e2c38, glow: c.visual.glow ?? 0x60ffb0 }, metal: { surface: 'leather', tint: 0x5a3a22, glow: c.visual.glow ?? 0x60ffb0 } },
        extra: (s, H) => {
          // The book: open in the left hand, pages lit from within.
          const hl = s.j('handL');
          const hlt = s.j('handLTip');
          const bc = lerpV(hl, hlt, 0.8).add(V(0.02 * H, 0.04 * H, 0.06 * H));
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0.3, 0));
          s.pair((_side, x) => {
            const qq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), x * 0.25));
            const off = V(x * 0.11 * H, 0, 0).applyQuaternion(q);
            s.hard('handL', boxGeo(bc.clone().add(off), V(0.11 * H, 0.008 * H, 0.15 * H), qq), 'metal', [0.4, 0.25, 0.15]);
            s.hard('handL', boxGeo(bc.clone().add(off).add(V(0, 0.012 * H, 0).applyQuaternion(q)), V(0.1 * H, 0.008 * H, 0.14 * H), qq), 'skin', [1.0, 0.95, 0.8], 0.25);
          });
          s.boil('handL', bc.clone().add(V(0, 0.03 * H, 0)), 0.015 * H, 1, [0.6, 1.3, 0.9]);
          // Loose pages swirling up from it.
          const r = seq(251);
          for (let i = 0; i < 6; i++) {
            const p = bc.clone().add(V((r() - 0.5) * 0.25 * H, 0.08 * H + r() * 0.25 * H, (r() - 0.5) * 0.2 * H));
            s.hard('handL', boxGeo(p, V(0.025 * H, 0.002 * H, 0.035 * H), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3))), 'skin', [1.0, 0.95, 0.8], 0.15);
          }
          // Books chained to the belt.
          const hp = s.j('hips');
          for (let i = 0; i < 3; i++) {
            const a = (i - 1) * 0.9;
            const top = hp.clone().add(V(Math.sin(a) * 0.1 * H, 0.0, Math.cos(a) * 0.09 * H));
            const end = top.clone().add(V(Math.sin(a) * 0.04 * H, -0.18 * H, Math.cos(a) * 0.05 * H));
            chain(s, 'hips', top, end, 0.012 * H, [0.55, 0.5, 0.4]);
            s.hard('hips', boxGeo(end.clone().add(V(0, -0.05 * H, 0)), V(0.04 * H, 0.05 * H, 0.015 * H), quatAlong(V(Math.sin(a), 0.2, Math.cos(a)))), 'metal', [0.35 + i * 0.05, 0.2, 0.15]);
          }
          // A high collar and candles on the shoulders.
          s.pair((side, x) => {
            const n = s.j('neck');
            s.box('chest', n.clone().add(V(x * 0.07 * H, 0.04 * H, -0.04 * H)), V(0.05 * H, 0.09 * H, 0.008 * H), { mat: 'alt', k: 0.01 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x * 0.5, x * 0.2)) });
            const sh = s.j(`arm${side}`).add(V(x * 0.01 * H, 0.06 * H, -0.02 * H));
            for (let i = 0; i < 2; i++) {
              const p = sh.clone().add(V(x * i * 0.03 * H, 0, -i * 0.02 * H));
              const tall = (0.06 - i * 0.02) * H;
              s.hard(`arm${side}`, tubeGeo([p, p.clone().add(V(0, tall, 0))], () => 0.01 * H, 6, true), 'skin', [0.95, 0.9, 0.75]);
              s.boil(`arm${side}`, p.clone().add(V(0, tall + 0.012 * H, 0)), 0.008 * H, 1, [1.3, 1.0, 0.5]);
            }
          });
          // Spectacles of green glass.
          s.pair((_side, x) => s.hard('head', ring(s.j('head').add(V(x * 0.022 * H, 0.03 * H, 0.07 * H)), 0.014 * H, 0.002 * H, V(0, 0, 1), 10), 'metal', [0.6, 0.55, 0.4]));
        },
      },
    ),

  // The forgefather: an iron colossus with a furnace for a belly, twin
  // chimneys pouring fire, a beard of chain, and the great hammer.
  forgefather_hurn: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 1.85,
        kind: 'giant',
        rig: { hip: 0.42, shoulders: 0.22, hips: 0.095, arms: 1.3, hunch: 0.35, head: 0.72, armOut: 0.4 },
        skin: { surface: 'rust', tint: 0x8a5a34 },
        alt: { surface: 'iron', tint: 0x3a3634 },
        metal: { surface: 'brass', tint: 0xb08850 },
        sculpt: (s, H) => {
          trunk(s, { chest: [0.16, 0.12, 0.12], pelvis: [0.11, 0.09, 0.08], belly: 0.1, shoulders: 0.07, hump: 0.04 });
          // The furnace: a great grille in the belly, fire behind it.
          grille(s, 'spine', s.j('spine').add(V(0, 0.0, 0.2 * H)), 0.09 * H, 0.07 * H, 6);
          s.glow(s.j('spine').add(V(0, 0, 0.2 * H)), 0.1 * H, 0.4, [1.3, 0.6, 0.2]);
          // Twin chimneys, fire at their mouths.
          const ch = s.j('chest');
          s.pair((_side, x) => {
            const b = ch.clone().add(V(x * 0.09 * H, 0.06 * H, -0.12 * H));
            const t = b.clone().add(V(x * 0.03 * H, 0.36 * H, -0.06 * H));
            s.hard('chest', tubeGeo([b, t], (u) => (0.04 - 0.006 * u) * H, 8), 'alt', [0.3, 0.27, 0.25]);
            s.hard('chest', ring(t, 0.04 * H, 0.01 * H, V(0, 1, 0), 12), 'metal', BRASS);
            fire(s, 'chest', t.clone().add(V(0, 0.01 * H, 0)), 5, 0.12 * H, 0.04 * H, x > 0 ? 261 : 262);
          });
          s.pair((side) => pauldron(s, side, 0.1, 'skin', 3, IRON));
          // The head: an anvil brow, a burning slit, a beard of chain.
          const h = s.j('head').add(V(0, 0.03 * H, 0.02 * H));
          s.box('head', h, V(0.06 * H, 0.05 * H, 0.06 * H), { k: 0.006 * H, round: 0.012 * H });
          s.box('head', h.clone().add(V(0, 0.05 * H, 0.01 * H)), V(0.09 * H, 0.015 * H, 0.07 * H), { mat: 'alt', k: 0.006 * H, round: 0.006 * H });
          s.box('head', h.clone().add(V(0, 0.015 * H, 0.06 * H)), V(0.045 * H, 0.008 * H, 0.012 * H), { sub: true, k: 0.003 * H });
          s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.02 * H, 0.015 * H, 0.055 * H)), 0.01 * H, 2));
          for (let i = 0; i < 7; i++) {
            const x = (i - 3) * 0.014 * H;
            const top = h.clone().add(V(x, -0.04 * H, 0.055 * H));
            chain(s, 'head', top, top.clone().add(V(x * 0.3, -(0.12 - Math.abs(i - 3) * 0.02) * H, 0.02 * H)), 0.012 * H, [0.35, 0.33, 0.32]);
          }
          mechArms(s, { r: 0.048, mat: 'skin', joint: 'alt', hand: 'gauntlet', handK: 1.4 });
          mechLegs(s, { r: 0.062, mat: 'skin', joint: 'alt', footW: 0.085 });
          // A leather apron, scorched.
          skirt(s, { len: 0.7, flare: 0.04, top: 0.02, thick: 0.012, mat: 'alt', back: false, sides: false });
          weapon(s, 'hammer', { steel: [0.3, 0.28, 0.26], size: 1.55, glow: 0.8 });
          // Glowing seams on the arms where the metal runs hot.
          s.pair((side) => {
            const f = s.j(`fore${side}`);
            const w = s.j(`hand${side}`);
            rivets(s, `fore${side}`, lerpV(f, w, 0.2).add(V(0, 0, 0.055 * H)), lerpV(f, w, 0.85).add(V(0, 0, 0.06 * H)), 5, 0.008 * H, BRASS);
          });
        },
        paint: {
          skin: { grime: 0.55, ao: 0.9, mottle: { scale: 7, amount: 0.4, col: [0.55, 0.38, 0.25] }, veins: { scale: 9, cut: 0.96, glow: 0.45, col: [1.5, 0.6, 0.2] } },
          alt: { grime: 0.6, ao: 0.85 },
        },
        style: { heavy: 0.9, attacks: ['chop', 'slam', 'stomp'], armed: 'two', idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
      }),
    ),

  // The tidewarden: a standing wave in the shape of a queen, a trident of
  // coral, a crown of shells, water pouring down from her into a whirlpool.
  tidewarden_nheru: (c) => {
    const glow = c.visual.glow ?? 0x40d0ff;
    const H = 2.0;
    const look: CreatureLook = {
      key: `id:${c.id}`,
      rig: () => specterRig({ height: H, arms: 1.2, hem: 0.0 }),
      sculpt: (s) => {
        const ch = s.j('chest');
        s.ball('chest', ch.clone().add(V(0, 0.01 * H, 0)), V(0.1 * H, 0.09 * H, 0.07 * H), { k: 0.03 * H });
        s.limb('spine', ch.clone().add(V(0, -0.03 * H, 0)), s.j('hips').add(V(0, 0.03 * H, 0)), 0.07 * H, 0.09 * H, { k: 0.04 * H });
        s.limb('neck', s.j('neck').add(V(0, -0.02 * H, 0)), s.j('head'), 0.03 * H, 0.024 * H, { k: 0.02 * H });
        const h = s.j('head');
        s.ball('head', h.clone().add(V(0, 0.02 * H, 0)), V(0.05 * H, 0.06 * H, 0.055 * H), { k: 0.014 * H });
        s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.018 * H, 0.025 * H, 0.045 * H)), 0.008 * H, 1.8));
        s.eye('head', h.clone().add(V(0, 0.05 * H, 0.048 * H)), 0.008 * H, 1.8);
        // Hair of water streaming back.
        for (let i = 0; i < 11; i++) {
          const a = (i / 10 - 0.5) * 2.4;
          const b = h.clone().add(V(Math.sin(a) * 0.04 * H, 0.055 * H, -0.01 * H));
          const pts: THREE.Vector3[] = [];
          for (let k = 0; k <= 8; k++) {
            const t = k / 8;
            pts.push(b.clone().add(V(Math.sin(a) * t * 0.08 * H, -t * 0.28 * H + Math.sin(t * 3) * 0.05 * H, -t * 0.16 * H - Math.sin(t * Math.PI) * 0.04 * H)));
          }
          s.hard('head', tubeGeo(pts, (t) => 0.014 * H * (1 - 0.8 * t), 5, true), 'skin');
        }
        // A crown of shells and coral.
        const r = seq(271);
        for (let i = 0; i < 9; i++) {
          const a = (i / 8 - 0.5) * 2.6;
          const b = h.clone().add(V(Math.sin(a) * 0.05 * H, 0.07 * H, Math.cos(a) * 0.03 * H));
          s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.04 * H, (0.07 + r() * 0.07) * H, -0.01 * H)), 0.01 * H, 4, V(Math.sin(a) * 0.015 * H, 0, 0), 2), 'metal');
        }
        s.hard('head', ring(h.clone().add(V(0, 0.065 * H, 0)), 0.055 * H, 0.008 * H), 'metal', [1.0, 0.85, 0.8]);
        // Pauldrons of shell.
        s.pair((side, x) => {
          const sh = s.j(`arm${side}`);
          for (let i = 0; i < 3; i++) s.hard(`arm${side}`, ovalGeo(sh.clone().add(V(x * i * 0.02 * H, 0.03 * H - i * 0.015 * H, -i * 0.01 * H)), (0.04 - i * 0.008) * H, 1, 1, 0.6, 1), 'metal', [1.0, 0.85, 0.75]);
          s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.026 * H, 0.02 * H, { k: 0.012 * H });
          s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.02 * H, 0.014 * H, { k: 0.01 * H });
          s.ball(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.35), V(0.014 * H, 0.022 * H, 0.01 * H), { k: 0.005 * H });
          claws(s, `hand${side}`, `hand${side}Tip`, 4, 0.035, 0.0035, 'skin', undefined, 0.3);
          s.hard(`fore${side}`, spikeGeo(lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.3), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.3).add(V(0, -0.16 * H, -0.04 * H)), 0.016 * H, 4, undefined, 2), 'alt');
        });
        // The trident of coral in the right hand.
        weapon(s, 'spear', { steel: [1.0, 0.6, 0.5], wood: [0.9, 0.55, 0.45], size: 1.35 });
        const hr = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
        const dir = V(0, 0.36, 0.93).normalize();
        const tip = hr.clone().addScaledVector(dir, 0.75 * H);
        s.pair((_side, x) => s.hard('handR', spikeGeo(tip.clone().addScaledVector(dir, -0.06 * H), tip.clone().addScaledVector(dir, 0.06 * H).add(V(x * 0.05 * H, 0, 0)), 0.01 * H, 4, V(x * 0.02 * H, 0, 0), 2), 'metal', [1.0, 0.6, 0.5]));
        // A pearl burning in the left hand.
        s.boil('handL', lerpV(s.j('handL'), s.j('handLTip'), 0.9).add(V(0, 0.03 * H, 0.02 * H)), 0.035 * H, 1, [0.7, 1.2, 1.4]);
        // The wave she stands on: streams from the hips, a curling crest behind.
        s.ball('hips', s.j('hips').add(V(0, 0.02 * H, 0)), V(0.12 * H, 0.08 * H, 0.11 * H), { mat: 'alt', k: 0.04 * H });
        s.limb('hips', s.j('hips'), V(0, 0.02 * H, -0.06 * H), 0.1 * H, 0.2 * H, { mat: 'alt', k: 0.06 * H });
        for (const n of ['F', 'B', 'L', 'R']) {
          const a = s.j(`robe${n}1`);
          const m = s.j(`robe${n}2`);
          const e = s.j(`robe${n}Tip`);
          s.limb(`robe${n}1`, a, m, 0.06 * H, 0.055 * H, { mat: 'alt', k: 0.07 * H });
          s.limb(`robe${n}2`, m, e, 0.055 * H, 0.08 * H, { mat: 'alt', k: 0.07 * H });
        }
        const bk = s.j('robeB2');
        for (let i = 0; i < 7; i++) {
          const x = (i / 6 - 0.5) * 0.4 * H;
          const b = bk.clone().add(V(x, 0.12 * H, -0.02 * H));
          s.hard('robeB2', spikeGeo(b, b.clone().add(V(x * 0.3, (0.2 - Math.abs(x) * 0.4) * H, 0.12 * H)), 0.035 * H, 4, V(0, 0.04 * H, 0.06 * H), 3), 'alt');
        }
        // A whirlpool ring round her base.
        s.hard('hips', ring(V(0, 0.03 * H, 0), 0.26 * H, 0.025 * H, V(0, 1, 0), 24), 'alt');
        s.paint.skin = { grime: 0, ao: 0.5, top: { amount: 0.3, col: [1.2, 1.35, 1.4] } };
        s.paint.alt = { grime: 0, ao: 0.4, tips: { amount: 0.7, col: [1.6, 1.7, 1.75] }, top: { amount: 0.3, col: [1.3, 1.4, 1.45] } };
        s.paint.metal = { grime: 0.2, ao: 0.6 };
        s.soft.alt = 0.07;
      },
      mats: {
        skin: { surface: 'slime', tint: 0x4a8ac0, glow, glowIntensity: 2.4 },
        alt: { surface: 'slime', tint: 0x2a6a9a, glow, glowIntensity: 2.4 },
        metal: { surface: 'bone', tint: 0xe0a090, glow },
      },
      style: { heavy: 0.4, attacks: ['thrust', 'lash', 'swing'], armed: 'two', castBoth: true, spawn: 'rise', death: 'fade', idle: 'hover', gait: 'glide' },
    };
    return asBoss(c, look);
  },

  // The plaguelord: a giant made of the dead, faces pushing out of his
  // belly, spare arms hanging off him, a censer of plague swinging, flies.
  plaguelord_ossik: (c) =>
    asBoss(
      c,
      fiendLook(c, {
        height: 2.0,
        kind: 'giant',
        hip: 0.42,
        hunch: 0.5,
        head: 0.7,
        arms: 1.3,
        shoulders: 0.2,
        armOut: 0.42,
        thick: 1.6,
        belly: 0.14,
        hump: 0.08,
        skin: 0x7a8a52,
        skinSurface: 'rot',
        alt: { surface: 'cloth', tint: 0x3a3a2a },
        metal: { surface: 'bone', tint: 0xcfc6a8 },
        claws: 0.05,
        face: { size: 0.7, snout: 0.2, brow: 1.3, jaw: 1.3, ears: 0, eyes: 1.4, teeth: TOOTH },
        extra: (s, H) => {
          // Faces pressing out through the belly and chest.
          const r = seq(281);
          for (let i = 0; i < 6; i++) {
            const a = (i / 5 - 0.5) * 2.2;
            const base = i < 4 ? s.j('spine') : s.j('chest');
            const p = base.clone().add(V(Math.sin(a) * 0.12 * H, (i % 2 ? 0.04 : -0.02) * H + (i < 4 ? 0 : 0.03 * H), Math.cos(a) * 0.15 * H + 0.04 * H));
            const n = V(Math.sin(a), 0, Math.cos(a));
            s.ball(i < 4 ? 'spine' : 'chest', p, 0.035 * H, { k: 0.02 * H });
            s.pair((_side, x) => s.eye(i < 4 ? 'spine' : 'chest', p.clone().addScaledVector(n, 0.03 * H).add(V(x * 0.012 * H, 0.008 * H, 0)), 0.005 * H, 1.2));
            s.ball(i < 4 ? 'spine' : 'chest', p.clone().addScaledVector(n, 0.032 * H).add(V(0, -0.014 * H, 0)), V(0.01 * H, 0.008 * H, 0.01 * H), { sub: true, k: 0.004 * H });
          }
          // Spare arms hanging off his flanks and back.
          for (let i = 0; i < 4; i++) {
            const x = i % 2 ? 1 : -1;
            const top = s.j(i < 2 ? 'chest' : 'spine').add(V(x * 0.16 * H, 0.0, -0.04 * H));
            const el = top.clone().add(V(x * 0.06 * H, -0.12 * H, 0.03 * H));
            const hd = el.clone().add(V(x * 0.01 * H, -0.12 * H, 0.04 * H));
            const bone = i < 2 ? 'chest' : 'spine';
            s.limb(bone, top, el, 0.022 * H, 0.018 * H, { k: 0.015 * H });
            s.limb(bone, el, hd, 0.018 * H, 0.014 * H, { k: 0.01 * H });
            for (let k = 0; k < 4; k++) s.hard(bone, spikeGeo(hd, hd.clone().add(V((k - 1.5) * 0.008 * H, -0.04 * H, 0.01 * H)), 0.004 * H, 3, undefined, 2), 'skin');
          }
          // Pustules, boils, a crown of bone shards.
          for (let i = 0; i < 14; i++) {
            const p = lerpV(s.j('hips'), s.j('neck'), r()).add(V((r() - 0.5) * 0.3 * H, 0, (r() - 0.3) * 0.25 * H));
            s.boil(r() > 0.5 ? 'chest' : 'spine', p, (0.01 + r() * 0.012) * H, 0.8, [0.75, 1.15, 0.3]);
          }
          const h = s.j('head');
          for (let i = 0; i < 7; i++) {
            const a = (i / 6 - 0.5) * 2.4;
            const b = h.clone().add(V(Math.sin(a) * 0.045 * H, 0.06 * H, Math.cos(a) * 0.03 * H));
            s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.03 * H, (0.05 + (i % 2) * 0.04) * H, -0.01 * H)), 0.008 * H, 4, undefined, 2), 'metal', BONE);
          }
          // A censer of plague on a chain from the left hand.
          const hl = s.j('handLTip');
          chain(s, 'handL', hl, hl.clone().add(V(0.02 * H, -0.2 * H, 0.04 * H)), 0.014 * H, [0.4, 0.38, 0.3]);
          const cz = hl.clone().add(V(0.02 * H, -0.25 * H, 0.04 * H));
          s.hard('handL', ballGeo(cz, 0.04 * H, 1), 'metal', [0.45, 0.4, 0.3]);
          s.boil('handL', cz.clone().add(V(0, 0, 0.03 * H)), 0.015 * H, 1, [0.75, 1.2, 0.35]);
          // A rag loincloth, flies.
          skirt(s, { len: 0.45, flare: 0.05, top: 0.02, thick: 0.01, sides: false });
          for (let i = 0; i < 18; i++) s.hard('head', ballGeo(h.clone().add(V((r() - 0.5) * 0.5 * H, (r() - 0.2) * 0.3 * H, (r() - 0.5) * 0.4 * H)), 0.005 * H, 0), 'metal', [0.05, 0.05, 0.04]);
        },
        paintSkin: { grime: 0.55, ao: 0.95, mottle: { scale: 4, amount: 0.55, col: [0.5, 0.45, 0.3] }, tips: { amount: 0.3, col: [0.45, 0.3, 0.3] } },
        lumps: { amp: 0.014, scale: 6 },
        style: { heavy: 0.85, attacks: ['slam', 'swing', 'hurl'], armed: 'none', idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
      }),
    ),

  // The thousand gaze: a sphere with no front, eyes all over it, four great
  // eyes orbiting, rings of bone turning round it, a fringe of tendrils.
  gaze_of_uln: (c) => {
    const glow = c.visual.glow ?? 0xff40e0;
    const Y = 1.6;
    const R = 0.55;
    const look: CreatureLook = {
      key: `id:${c.id}`,
      rig: () => floaterRig({ hover: Y, radius: R, orbs: 4, tendrils: 8, segments: 3 }),
      sculpt: (s) => {
        s.k = 0.015;
        s.soft.skin = 0.03;
        const c0 = s.j('core');
        s.ball('core', c0, R, { k: R * 0.1 });
        // Eyes everywhere: a lattice of sockets over the whole sphere.
        const n = 22;
        for (let i = 0; i < n; i++) {
          const y = 1 - (2 * (i + 0.5)) / n;
          const rr = Math.sqrt(1 - y * y);
          const a = i * 2.39996;
          const d = V(Math.cos(a) * rr, y, Math.sin(a) * rr);
          if (d.y < -0.75) continue;
          const big = i % 4 === 0;
          const er = R * (big ? 0.2 : 0.12);
          s.ball('core', c0.clone().addScaledVector(d, R * 0.98), er * 1.05, { sub: true, k: R * 0.03 });
          eyeball(s, 'core', c0.clone().addScaledVector(d, R * 0.9), er, d, [1.3, 0.4, 0.9], true);
        }
        // The orbiting eyes, each in a ring of bone.
        for (let i = 0; i < 4; i++) {
          const o = s.j(`orb${i}`);
          const d = o.clone().sub(c0).setY(0).normalize();
          s.ball(`orb${i}`, o, R * 0.2, { k: R * 0.05 });
          eyeball(s, `orb${i}`, o.clone().addScaledVector(d, R * 0.08), R * 0.16, d, [1.3, 0.4, 0.9], false);
          s.hard(`orb${i}`, ring(o, R * 0.28, R * 0.025, d, 14), 'metal');
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2;
            const up = V(0, 1, 0);
            const side = d.clone().cross(up).normalize();
            const p = o.clone().addScaledVector(up, Math.cos(a) * R * 0.28).addScaledVector(side, Math.sin(a) * R * 0.28);
            s.hard(`orb${i}`, spikeGeo(p, p.clone().addScaledVector(p.clone().sub(o).normalize(), R * 0.14), R * 0.025, 4, undefined, 1), 'metal');
          }
        }
        // Two rings of bone round the body, at angles, studded with spikes.
        for (const [tilt, rr] of [[0.5, 1.35], [-0.9, 1.5]] as const) {
          const nn = V(Math.sin(tilt), Math.cos(tilt), 0.3).normalize();
          s.hard('crown', ring(c0, R * rr, R * 0.04, nn, 28), 'metal');
          const u = V(0, 0, 1).cross(nn).normalize();
          const w = nn.clone().cross(u).normalize();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const p = c0.clone().addScaledVector(u, Math.cos(a) * R * rr).addScaledVector(w, Math.sin(a) * R * rr);
            s.hard('crown', spikeGeo(p, p.clone().addScaledVector(p.clone().sub(c0).normalize(), R * 0.18), R * 0.03, 4, undefined, 1), 'metal');
          }
        }
        // A lipless mouth underneath, tendrils hanging from it.
        maw(s, 'core', c0.clone().add(V(0, -R * 0.82, 0.0)), R * 0.32, V(0, -1, 0), 14, 0.2);
        hangers(s, 8, R * 0.11);
        s.paint.skin = { grime: 0.3, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.45, 0.28, 0.5] }, bands: { axis: 'y', period: 0.09, amount: 0.12 } };
        s.paint.alt = { grime: 0.05, ao: 0.5 };
        s.paint.metal = { grime: 0.3, ao: 0.7, mottle: { scale: 7, amount: 0.3, col: [0.5, 0.45, 0.4] } };
      },
      mats: {
        skin: { surface: 'hide', tint: 0x5a3a6e, glow },
        alt: { surface: 'slime', tint: 0xe8e0d4, glow },
        metal: { surface: 'bone', tint: 0xc8bca0, glow },
      },
      style: { heavy: 0.45, attacks: ['lash', 'hurl'], ranged: true, castBoth: true, spawn: 'form', death: 'collapse', idle: 'hover', gait: 'glide', armed: 'none' },
    };
    return asBoss(c, look);
  },

  // Rimeheart: a mountain of ice in the shape of a giant, spires growing from
  // his shoulders, his chest split open on a furious burning heart.
  rimeheart_valdr: (c) =>
    asBoss(
      c,
      walkLook(c, {
        height: 1.9,
        kind: 'giant',
        rig: { hip: 0.42, shoulders: 0.23, hips: 0.1, arms: 1.35, hunch: 0.45, head: 0.65, armOut: 0.42 },
        skin: { surface: 'ice', tint: 0x6a90b0 },
        alt: { surface: 'crystal', tint: 0xc8ecff },
        metal: { surface: 'basalt', tint: 0x3a4250 },
        sculpt: (s, H) => {
          trunk(s, { chest: [0.18, 0.13, 0.13], pelvis: [0.11, 0.09, 0.08], shoulders: 0.08, hump: 0.08 });
          const ch = s.j('chest');
          // The split chest: a cleft of crystal round a heart that burns.
          const heart = ch.clone().add(V(0, -0.01 * H, 0.1 * H));
          s.ball('chest', heart.clone().add(V(0, 0, 0.06 * H)), V(0.05 * H, 0.08 * H, 0.06 * H), { sub: true, k: 0.01 * H });
          s.boil('chest', heart, 0.05 * H, 1, [0.8, 1.2, 1.5]);
          crystals(s, 'chest', heart.clone().add(V(0, 0, 0.02 * H)), 10, 0.09 * H, 0.012 * H, 291, V(0, 0, 1), 1.4);
          // Shoulder spires and a ridge of ice down the back.
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`).add(V(0, 0.05 * H, -0.02 * H));
            s.ball(`arm${side}`, sh, 0.08 * H, { k: 0.03 * H });
            crystals(s, `arm${side}`, sh.clone().add(V(0, 0.04 * H, 0)), 6, 0.32 * H, 0.03 * H, x > 0 ? 293 : 294, V(x * 0.3, 1, -0.2), 0.5);
          });
          crystals(s, 'spine', s.j('spine').add(V(0, 0.08 * H, -0.12 * H)), 7, 0.18 * H, 0.025 * H, 295, V(0, 0.6, -1), 0.8);
          // Head sunk low: a brow of ice, two cold eyes, a crown of icicles.
          const h = s.j('head').add(V(0, 0.02 * H, 0.02 * H));
          s.ball('head', h, V(0.055 * H, 0.05 * H, 0.06 * H), { k: 0.015 * H });
          s.box('head', h.clone().add(V(0, 0.025 * H, 0.04 * H)), V(0.06 * H, 0.015 * H, 0.03 * H), { k: 0.01 * H });
          s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.022 * H, 0.008 * H, 0.055 * H)), 0.01 * H, 2));
          crystals(s, 'head', h.clone().add(V(0, 0.045 * H, -0.01 * H)), 7, 0.12 * H, 0.012 * H, 297, V(0, 1, -0.2), 0.6);
          // Arms of packed ice with crystal knuckles, legs like glacier feet.
          s.pair((side) => {
            const a = s.j(`arm${side}`);
            const e = s.j(`fore${side}`);
            const w = s.j(`hand${side}`);
            const t = s.j(`hand${side}Tip`);
            s.limb(`arm${side}`, a, e, 0.06 * H, 0.05 * H, { k: 0.02 * H });
            s.limb(`fore${side}`, e, w, 0.055 * H, 0.07 * H, { k: 0.02 * H });
            s.ball(`hand${side}`, lerpV(w, t, 0.45), V(0.07 * H, 0.08 * H, 0.06 * H), { k: 0.02 * H });
            crystals(s, `hand${side}`, lerpV(w, t, 0.8), 5, 0.07 * H, 0.012 * H, side === 'L' ? 298 : 299, t.clone().sub(w).normalize(), 0.7);
            const l = s.j(`leg${side}`);
            const k = s.j(`shin${side}`);
            const f = s.j(`foot${side}`);
            s.limb(`leg${side}`, l, k, 0.07 * H, 0.06 * H, { k: 0.02 * H });
            s.limb(`shin${side}`, k, f, 0.06 * H, 0.07 * H, { k: 0.02 * H });
            foot(s, `foot${side}`, `toe${side}`, 0.1, 'skin');
          });
          // Basalt boulders frozen into him.
          const r = seq(301);
          for (let i = 0; i < 6; i++) facet(s, r() > 0.5 ? 'chest' : 'spine', lerpV(s.j('hips'), s.j('chest'), r()).add(V((r() - 0.5) * 0.3 * H, 0, (r() - 0.6) * 0.25 * H)), V(0.03 * H, 0.025 * H, 0.03 * H), 303 + i, 'metal', 0.004 * H);
        },
        paint: {
          skin: { base: [1.3, 1.35, 1.45], grime: 0.25, ao: 0.75, top: { amount: 0.4, col: [1.5, 1.55, 1.6] } },
          alt: { grime: 0, ao: 0.4, tips: { amount: 0.5, col: [1.4, 1.5, 1.6] } },
          metal: { grime: 0.3, ao: 0.8, top: { amount: 0.5, col: [1.5, 1.55, 1.6] } },
        },
        lumps: { amp: 0.014, scale: 5 },
        glowIntensity: 3,
        style: { heavy: 0.95, attacks: ['slam', 'swing', 'stomp'], armed: 'none', idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
      }),
      { mats: { skin: { surface: 'ice', tint: 0x6a90b0, glow: c.visual.glow ?? 0x66ddff, rough: 0.45 } } },
    ),
};

export { BOSS_A, chain, hook, ring };
