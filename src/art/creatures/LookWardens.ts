/**
 * SLAY — the sixteen floor wardens. Each guards one floor's stair: the
 * lantern thief, the debt-taker, the girl in borrowed plate, the wet-brick
 * golem, the ink-witch, the kennel master, the gravedigger, the watchman,
 * the glass moth, the rope-dancer, the censer monk, the hedge-crone, the
 * ice archer, the brass abbess, the ferryman and the Lock-Saint.
 */
import * as THREE from 'three';
import type { LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, membraneGeo, ringGeo, slabGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, lerpV, seq, skirt } from './Kit';
import { WEAPON_DIR } from './Arms';
import { manLook } from './LookHumanoid';
import { skeletonLook, specterLook } from './LookUndead';
import { flyerLook } from './LookBeast';
import { botLook, gear, lens, rivets, shield } from './LookConstruct';
import { leaf, mossBeard, thorns } from './LookPlant';
import { asBoss, chain } from './LookBoss';

const IRON: RGB = [0.42, 0.42, 0.45];
const DARK: RGB = [0.08, 0.07, 0.07];
const BRASS: RGB = [0.75, 0.58, 0.3];
const WOOD: RGB = [0.32, 0.22, 0.14];
const LEATHER: RGB = [0.35, 0.25, 0.16];
const PAPER: RGB = [0.88, 0.84, 0.72];
const ICE: RGB = [0.85, 0.95, 1.0];
const EDGE = V(0, -0.93, 0.36).normalize();

/** A point along a held pole: the same line the weapon builder uses, `t` in units of `k` from the grip. */
function along(s: Sculpt, side: 'L' | 'R', k: number, t: number): THREE.Vector3 {
  const g = lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.55);
  return g.addScaledVector(WEAPON_DIR, t * k);
}

/** A lantern at `p`: four bars, a cap and a glowing heart. */
function lantern(s: Sculpt, bone: string, p: THREE.Vector3, r: number, col: RGB): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    s.hard(bone, tubeGeo([p.clone().add(V(Math.sin(a) * r, r * 1.2, Math.cos(a) * r)), p.clone().add(V(Math.sin(a) * r, -r * 1.2, Math.cos(a) * r))], () => r * 0.1, 3), 'metal', IRON);
  }
  s.hard(bone, ringGeo(p.clone().add(V(0, r * 1.2, 0)), r, r * 0.12, V(0, 1, 0), 10), 'metal', IRON);
  s.hard(bone, spikeGeo(p.clone().add(V(0, r * 1.2, 0)), p.clone().add(V(0, r * 1.9, 0)), r * 0.7, 6, undefined, 1), 'metal', IRON);
  s.boil(bone, p, r * 0.7, 1.1, col);
}

/** A key: a ring bow, a shank, and a toothed bit. */
function key(s: Sculpt, bone: string, top: THREE.Vector3, len: number, col: RGB = IRON): void {
  s.hard(bone, ringGeo(top, len * 0.2, len * 0.05, V(0, 0, 1), 10), 'metal', col);
  const a = top.clone().add(V(0, -len * 0.2, 0));
  const b = top.clone().add(V(0, -len, 0));
  s.hard(bone, tubeGeo([a, b], () => len * 0.05, 4), 'metal', col);
  s.hard(bone, boxGeo(b.clone().add(V(len * 0.1, len * 0.08, 0)), V(len * 0.1, len * 0.05, len * 0.03)), 'metal', col);
  s.hard(bone, boxGeo(b.clone().add(V(len * 0.08, len * 0.22, 0)), V(len * 0.07, len * 0.03, len * 0.03)), 'metal', col);
}

/** A book at `c`, `w` wide, open or shut. */
function book(s: Sculpt, bone: string, c: THREE.Vector3, w: number, cover: RGB, q?: THREE.Quaternion): void {
  s.hard(bone, boxGeo(c, V(w * 0.5, w * 0.65, w * 0.16), q), 'metal', cover);
  s.hard(bone, boxGeo(c.clone().add(V(w * 0.04, 0, 0)), V(w * 0.47, w * 0.6, w * 0.165), q), 'alt', PAPER);
}

// ---------------------------------------------------------------------------

export const WARDEN_LOOKS: Record<string, LookFactory> = {
  // Mott: a hunched little thief in a deep hood, a sack of stolen lanterns
  // on his back, each still lit, and a thin knife.
  warden_mott: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.6,
        build: 'thin',
        hunch: 0.3,
        head: 'goblin',
        skin: 0x8a9a6a,
        cloth: 0x3a3428,
        hood: true,
        mask: true,
        tunic: 2,
        belt: 2,
        weapon: 'dagger',
        weaponSize: 1.1,
        extra: (s, H) => {
          // The sack: a fat bundle of sacking with lantern tops poking out.
          const bk = s.j('chest').add(V(0, 0.0, -0.13 * H));
          s.ball('chest', bk, V(0.13 * H, 0.15 * H, 0.1 * H), { mat: 'alt', k: 0.04 * H });
          s.hard('chest', ringGeo(bk.clone().add(V(0, 0.14 * H, 0)), 0.05 * H, 0.008 * H, V(0, 1, 0), 10), 'metal', LEATHER);
          const glows: RGB[] = [[1.3, 0.85, 0.4], [0.6, 1.1, 0.6], [1.2, 0.5, 0.9], [0.6, 0.9, 1.3]];
          for (let i = 0; i < 4; i++) {
            const a = (i / 4 - 0.4) * 1.6;
            lantern(s, 'chest', bk.clone().add(V(Math.sin(a) * 0.07 * H, 0.15 * H + (i % 2) * 0.03 * H, Math.cos(a) * 0.03 * H - 0.02 * H)), 0.028 * H, glows[i]!);
          }
          // The sack's strap across his chest.
          s.hard('chest', tubeGeo([s.j('armL').add(V(0, 0.03 * H, 0)), s.j('chest').add(V(0, -0.02 * H, 0.08 * H)), s.j('hips').add(V(0.08 * H, 0.05 * H, 0.03 * H))], () => 0.008 * H, 4), 'metal', LEATHER);
          // One more lantern swinging from his belt, and a ring of picks.
          lantern(s, 'hips', s.j('hips').add(V(-0.09 * H, -0.06 * H, 0.04 * H)), 0.024 * H, [1.3, 0.85, 0.4]);
          s.hard('hips', ringGeo(s.j('hips').add(V(0.09 * H, -0.02 * H, 0.03 * H)), 0.02 * H, 0.003 * H, V(1, 0, 0), 10), 'metal', IRON);
          for (let i = 0; i < 3; i++) s.hard('hips', tubeGeo([s.j('hips').add(V(0.09 * H, -0.04 * H, 0.03 * H + (i - 1) * 0.008 * H)), s.j('hips').add(V(0.095 * H, -0.09 * H, 0.03 * H + (i - 1) * 0.012 * H))], () => 0.0025 * H, 3), 'metal', IRON);
        },
        style: { heavy: 0.05, attacks: ['thrust', 'lunge', 'swing'], armed: 'one', idle: 'jitter', gait: 'stalk' },
      }),
    ),

  // Brannoch: a big man in a fur-trimmed coat, a ledger chained to his belt,
  // spectacles on his nose, a quill behind his ear and an iron mace.
  warden_brannoch: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.95,
        build: 'brute',
        skin: 0xc09078,
        cloth: 0x4a3022,
        clothSurface: 'leather',
        tunic: 2,
        robe: 0.5,
        belt: 2,
        weapon: 'mace',
        weaponSize: 1.25,
        extra: (s, H) => {
          // The ledger, thick as a brick, chained to his belt on the left.
          const lg = s.j('hips').add(V(-0.12 * H, -0.08 * H, 0.03 * H));
          book(s, 'hips', lg, 0.12 * H, [0.35, 0.12, 0.1]);
          s.hard('hips', boxGeo(lg.clone().add(V(0, 0, 0.022 * H)), V(0.01 * H, 0.08 * H, 0.004 * H)), 'metal', BRASS);
          chain(s, 'hips', s.j('hips').add(V(-0.07 * H, 0.03 * H, 0.06 * H)), lg.clone().add(V(0, 0.08 * H, 0.01 * H)), 0.012 * H, IRON);
          // Spectacles and a quill.
          const h = s.j('head');
          s.pair((_side, x) => s.hard('head', ringGeo(h.clone().add(V(x * 0.025 * H, 0.03 * H, 0.07 * H)), 0.014 * H, 0.002 * H, V(0, 0, 1), 10), 'metal', BRASS));
          s.hard('head', spikeGeo(h.clone().add(V(0.06 * H, 0.03 * H, 0)), h.clone().add(V(0.07 * H, 0.13 * H, -0.06 * H)), 0.012 * H, 3, undefined, 2), 'alt', PAPER);
          // A fur collar over the coat.
          s.ball('chest', s.j('neck').add(V(0, -0.02 * H, -0.01 * H)), V(0.13 * H, 0.04 * H, 0.09 * H), { mat: 'alt', k: 0.03 * H });
          // Coins sewn in rows down the coat front: what he has already collected.
          for (let i = 0; i < 5; i++) s.pair((_side, x) => s.hard('chest', ringGeo(s.j('chest').add(V(x * 0.035 * H, 0.05 * H - i * 0.035 * H, 0.105 * H)), 0.008 * H, 0.003 * H, V(0, 0, 1), 8), 'metal', [0.95, 0.75, 0.3], 0.2));
        },
        style: { heavy: 0.45, attacks: ['chop', 'swing', 'slam'], armed: 'one', idle: 'breathe', gait: 'march' },
      }),
    ),

  // Ysolde: a slight girl in plate made for someone much larger, the left
  // pauldron too big, a shield taller than her and a notched old sword.
  warden_ysolde: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.6,
        build: 'thin',
        skin: 0xd8b8a0,
        cloth: 0x5a5a62,
        metal: 0x8a8a90,
        metalSurface: 'steel',
        armor: 0.85,
        helm: 'open',
        tunic: 1,
        belt: 1,
        weapon: 'sword',
        weaponSize: 1.15,
        steel: [0.55, 0.53, 0.5],
        extra: (s, H) => {
          shield(s, H, { h: 0.62, w: 0.24, tower: true, col: [0.55, 0.55, 0.58], boss: [0.75, 0.58, 0.3] });
          // A sun painted on the shield, half scraped off.
          const f = lerpV(s.j('foreL'), s.j('handL'), 0.5).add(V(0.075 * H, 0, 0));
          s.hard('foreL', ringGeo(f, 0.06 * H, 0.008 * H, V(1, 0, 0), 14), 'alt', [0.8, 0.6, 0.2]);
          // A pauldron far too big, borrowed from a man twice her size.
          const sh = s.j('armL').add(V(-0.02 * H, 0.03 * H, 0));
          s.ball('armL', sh, V(0.085 * H, 0.05 * H, 0.08 * H), { mat: 'metal', k: 0.01 * H });
          rivets(s, 'armL', sh.clone().add(V(-0.06 * H, 0.0, 0.05 * H)), sh.clone().add(V(-0.06 * H, 0.0, -0.05 * H)), 4, 0.006 * H, BRASS);
          // A braid hanging out the back of the helm, and straps cinched tight.
          const nape = s.j('head').add(V(0, -0.02 * H, -0.06 * H));
          const pts = [nape, nape.clone().add(V(0.01 * H, -0.08 * H, -0.03 * H)), nape.clone().add(V(0.0, -0.16 * H, -0.04 * H))];
          s.hard('head', tubeGeo(pts, (t) => (0.016 - 0.008 * t) * H, 5), 'alt', [0.55, 0.35, 0.2]);
          for (let i = 0; i < 2; i++) s.hard('chest', ringGeo(s.j('chest').add(V(0, -0.03 * H - i * 0.06 * H, 0)), 0.1 * H, 0.006 * H, V(0, 1, 0), 14), 'alt', LEATHER);
        },
        style: { heavy: 0.25, attacks: ['thrust', 'swing', 'lunge'], armed: 'one', idle: 'breathe', gait: 'march' },
      }),
    ),

  // Gorm: a golem of wet brick and mortar, rows of bricks for a chest, moss in
  // the cracks, water running from its shoulders, one brick missing for a mouth.
  warden_gorm: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'brute',
        rig: { shoulders: 0.18, hips: 0.08, arms: 1.15, hunch: 0.2, head: 0.75 },
        skin: { surface: 'stone', tint: 0x7a4a34 },
        alt: { surface: 'moss', tint: 0x4a5a2a },
        metal: { surface: 'stone', tint: 0x9a9080 },
        lumps: { amp: 0.01, scale: 6 },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          s.ball('chest', ch, V(0.17 * H, 0.13 * H, 0.12 * H), { k: 0.01 * H });
          s.ball('spine', s.j('spine'), V(0.12 * H, 0.09 * H, 0.09 * H), { k: 0.01 * H });
          s.ball('hips', s.j('hips'), V(0.11 * H, 0.07 * H, 0.08 * H), { k: 0.01 * H });
          // Courses of brick across the chest, staggered, mortar showing between.
          const r = seq(41);
          for (let row = 0; row < 5; row++) {
            const y = 0.1 * H - row * 0.05 * H;
            for (let i = 0; i < 4; i++) {
              const x = (i - 1.5 + (row % 2) * 0.5) * 0.075 * H;
              if (Math.abs(x) > 0.14 * H) continue;
              const tone = 0.8 + r() * 0.35;
              s.hard('chest', boxGeo(ch.clone().add(V(x, y, 0.11 * H + (r() - 0.5) * 0.01 * H)), V(0.034 * H, 0.02 * H, 0.02 * H)), 'skin', [0.62 * tone, 0.36 * tone, 0.26 * tone]);
            }
          }
          s.pair((side, x) => {
            s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.06 * H, 0.055 * H, { k: 0.01 * H });
            s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.06 * H, 0.07 * H, { k: 0.01 * H });
            s.box(`hand${side}`, s.j(`hand${side}`), V(0.06 * H, 0.06 * H, 0.06 * H), { k: 0.008 * H });
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.065 * H, 0.06 * H, { k: 0.01 * H });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.06 * H, 0.07 * H, { k: 0.01 * H });
            s.box(`foot${side}`, s.j(`foot${side}`).add(V(0, -0.01 * H, 0.03 * H)), V(0.06 * H, 0.03 * H, 0.09 * H), { k: 0.006 * H });
            // Water running off each shoulder in a thin sheet.
            const sh = s.j(`arm${side}`).add(V(x * 0.02 * H, 0.05 * H, -0.02 * H));
            s.hard(`arm${side}`, tubeGeo([sh, sh.clone().add(V(x * 0.03 * H, -0.12 * H, -0.03 * H)), sh.clone().add(V(x * 0.04 * H, -0.28 * H, -0.02 * H))], (t) => (0.012 - 0.008 * t) * H, 4), 'metal', [0.5, 0.65, 0.75], 0.25);
            // Moss in the cracks of the shoulders.
            s.ball(`arm${side}`, s.j(`arm${side}`).add(V(x * 0.01 * H, 0.05 * H, 0)), V(0.06 * H, 0.025 * H, 0.06 * H), { mat: 'alt', k: 0.02 * H });
          });
          // The head: one big block with a gap for a mouth and two dim eyes.
          const h = s.j('head');
          s.box('head', h, V(0.08 * H, 0.06 * H, 0.07 * H), { k: 0.008 * H });
          s.box('head', h.clone().add(V(0, -0.025 * H, 0.06 * H)), V(0.035 * H, 0.012 * H, 0.02 * H), { sub: true, k: 0.004 * H });
          s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.035 * H, 0.015 * H, 0.068 * H)), 0.01 * H, 0.9));
          mossBeard(s, 'head', h.clone().add(V(0, -0.05 * H, 0.06 * H)), 0.12 * H, 0.08 * H, 6, 77);
        },
        style: { heavy: 0.75, attacks: ['slam', 'swing', 'stomp'], idle: 'breathe', gait: 'lumber', spawn: 'emerge', death: 'crash' },
      }),
    ),

  // Hesper: a thin ink-witch in a long black robe, pages floating round her
  // like moths, ink dripping from her fingers, a quill-staff that glows violet.
  warden_hesper: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.8,
        build: 'thin',
        skin: 0xd0c8c0,
        cloth: 0x1a1a2a,
        robe: 0.95,
        tunic: 2,
        hood: true,
        cape: 0.6,
        weapon: 'staff',
        weaponGlow: 0x6040c0,
        extra: (s, H) => {
          // Loose pages in a ring round her, each tilted as if blown.
          const r = seq(83);
          const ch = s.j('chest');
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const p = ch.clone().add(V(Math.sin(a) * 0.28 * H, (r() - 0.3) * 0.25 * H, Math.cos(a) * 0.24 * H));
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() - 0.5, a, (r() - 0.5) * 0.8));
            s.hard('chest', boxGeo(p, V(0.035 * H, 0.045 * H, 0.002 * H), q), 'alt', PAPER, 0.15);
            // Lines of ink on each page.
            s.hard('chest', boxGeo(p.clone().add(V(0, 0.01 * H, 0)), V(0.025 * H, 0.003 * H, 0.0025 * H), q), 'metal', DARK);
          }
          // Ink running off her fingers and pooling at her hem.
          s.pair((side) => {
            const hd = s.j(`hand${side}`);
            for (let i = 0; i < 3; i++) s.hard(`hand${side}`, tubeGeo([hd.clone().add(V((i - 1) * 0.01 * H, -0.01 * H, 0.01 * H)), hd.clone().add(V((i - 1) * 0.012 * H, -0.07 * H - i * 0.015 * H, 0.012 * H))], (t) => (0.006 - 0.004 * t) * H, 4), 'metal', [0.1, 0.06, 0.2], 0.4);
          });
          for (let i = 0; i < 6; i++) s.tint(s.j('hips').add(V((r() - 0.5) * 0.25 * H, -0.3 * H - r() * 0.15 * H, (r() - 0.3) * 0.15 * H)), 0.05 * H, [0.15, 0.08, 0.3]);
          // An inkpot on her belt and a quill thrust through the hood.
          s.hard('hips', ballGeo(s.j('hips').add(V(0.09 * H, 0.0, 0.05 * H)), 0.022 * H, 1), 'metal', [0.15, 0.12, 0.25], 0.3);
          s.hard('head', spikeGeo(s.j('head').add(V(-0.05 * H, 0.06 * H, -0.02 * H)), s.j('head').add(V(-0.1 * H, 0.2 * H, -0.08 * H)), 0.014 * H, 3, undefined, 2), 'alt', PAPER);
        },
        style: { heavy: 0.1, attacks: ['hurl', 'swing'], armed: 'staff', castBoth: true, ranged: true, idle: 'sway', gait: 'walk' },
      }),
    ),

  // Rook: a stooped old kennel man in a leather jerkin, leashes and collars
  // hung from his belt, a bone whistle on a cord and a boar spear.
  warden_rook: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.85,
        build: 'normal',
        hunch: 0.25,
        head: 'bald',
        skin: 0xb08a70,
        cloth: 0x5a4630,
        clothSurface: 'leather',
        tunic: 1,
        belt: 3,
        strap: true,
        weapon: 'spear',
        weaponSize: 1.1,
        extra: (s, H) => {
          const h = s.j('head');
          // A grey beard and a scar of bites down one arm.
          for (let i = 0; i < 7; i++) {
            const a = (i / 6 - 0.5) * 1.6;
            const p = h.clone().add(V(Math.sin(a) * 0.04 * H, -0.03 * H, 0.05 * H + Math.cos(a) * 0.01 * H));
            s.hard('head', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.01 * H, -0.08 * H, 0.02 * H)), 0.012 * H, 3, undefined, 2), 'alt', [0.7, 0.68, 0.65]);
          }
          // The whistle on its cord.
          const w = s.j('chest').add(V(0.02 * H, -0.02 * H, 0.1 * H));
          s.hard('chest', tubeGeo([s.j('neck').add(V(-0.04 * H, 0, 0.03 * H)), w, s.j('neck').add(V(0.04 * H, 0, 0.03 * H))], () => 0.0025 * H, 3), 'alt', LEATHER);
          s.hard('chest', tubeGeo([w, w.clone().add(V(0.03 * H, -0.01 * H, 0.01 * H))], () => 0.006 * H, 5, true), 'metal', [0.85, 0.8, 0.65]);
          // Collars and leashes on the belt: three dogs' worth, none of them worn.
          for (let i = 0; i < 3; i++) {
            const p = s.j('hips').add(V(-0.06 * H - i * 0.02 * H, -0.04 * H, 0.06 * H - i * 0.03 * H));
            s.hard('hips', ringGeo(p.clone().add(V(0, -0.04 * H, 0)), 0.03 * H, 0.006 * H, V(0.3, 0, 1), 12), 'alt', [0.4, 0.15, 0.1]);
            s.hard('hips', tubeGeo([p, p.clone().add(V(-0.02 * H, -0.1 * H, 0.01 * H)), p.clone().add(V(0.0, -0.18 * H, 0.03 * H))], () => 0.004 * H, 3), 'alt', LEATHER);
            s.hard('hips', spikeGeo(p.clone().add(V(0.03 * H, -0.04 * H, 0)), p.clone().add(V(0.05 * H, -0.04 * H, 0)), 0.004 * H, 3, undefined, 1), 'metal', IRON);
          }
          // A boar's crossbar on the spear, below the blade.
          const k = 1.1 * H * 0.9;
          s.hard('handR', tubeGeo([along(s, 'R', k, 0.72).addScaledVector(EDGE, 0.06 * k), along(s, 'R', k, 0.72).addScaledVector(EDGE, -0.06 * k)], () => 0.008 * k, 4), 'metal', IRON);
        },
        style: { heavy: 0.3, attacks: ['thrust', 'lunge', 'swing'], armed: 'two', idle: 'breathe', gait: 'stalk' },
      }),
    ),

  // Cassia: the dead gravedigger, grey and patient, a spade over her
  // shoulder, earth caked to the knee, grave flowers in her hair.
  warden_cassia: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.85,
        build: 'thin',
        hunch: 0.2,
        skin: 0x8a9480,
        skinSurface: 'rot',
        cloth: 0x3c3a34,
        robe: 0.6,
        tunic: 2,
        belt: 1,
        extra: (s, H) => {
          // The spade: a long ash handle with a T grip and a worn iron blade.
          const k = H * 0.95;
          const a = along(s, 'R', k, -0.3);
          const b = along(s, 'R', k, 0.62);
          s.hard('handR', tubeGeo([a, b], () => 0.012 * k, 6), 'metal', WOOD);
          s.hard('handR', tubeGeo([a.clone().add(V(-0.05 * k, 0, 0)), a.clone().add(V(0.05 * k, 0, 0))], () => 0.012 * k, 5), 'metal', WOOD);
          const bt = along(s, 'R', k, 0.62);
          const be = along(s, 'R', k, 0.84);
          s.hard('handR', slabGeo(bt, be, V(1, 0, 0), 0.07 * k, 0.09 * k, 0.012 * k, 0.004 * k), 'metal', [0.4, 0.38, 0.35]);
          // Earth caked on her shins and hem.
          s.pair((side) => {
            s.limb(`shin${side}`, lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.3), s.j(`foot${side}`), 0.032 * H, 0.038 * H, { mat: 'alt', k: 0.01 * H });
            s.tint(s.j(`foot${side}`), 0.06 * H, [0.32, 0.24, 0.16]);
          });
          // Grave flowers in her hair, pale and closed.
          const h = s.j('head').add(V(0, 0.06 * H, -0.01 * H));
          const r = seq(29);
          for (let i = 0; i < 6; i++) {
            const a2 = (i / 6) * Math.PI * 2;
            const p = h.clone().add(V(Math.sin(a2) * 0.05 * H, (r() - 0.5) * 0.02 * H, Math.cos(a2) * 0.05 * H));
            s.hard('head', ballGeo(p, 0.012 * H, 1), 'alt', [0.85, 0.82, 0.9], 0.1);
          }
          // A grave lantern on her belt, burning low and green.
          lantern(s, 'hips', s.j('hips').add(V(-0.1 * H, -0.05 * H, 0.03 * H)), 0.022 * H, [0.6, 1.1, 0.7]);
        },
        style: { heavy: 0.4, attacks: ['chop', 'swing', 'thrust'], armed: 'two', idle: 'sway', gait: 'shamble', spawn: 'emerge' },
      }),
    ),

  // Pike: a skeleton watchman still on his round, a half-helm and a torn
  // tabard of the old watch, a halberd, and a lantern burning cold blue.
  warden_pike: (c) =>
    asBoss(
      c,
      skeletonLook(c, {
        brute: true,
        height: 2.0,
        armor: 0.55,
        helm: true,
        weapon: 'spear',
        weaponSize: 1.25,
        steel: [0.45, 0.45, 0.48],
        style: { heavy: 0.5, attacks: ['thrust', 'chop', 'swing'], armed: 'two', spawn: 'rise', death: 'scatter', gait: 'march', idle: 'still' },
      }),
      {
        extra: (s, H) => {
          // The halberd's axe blade and back hook, below the spear point.
          const k = 1.25 * H * 0.9;
          const top = along(s, 'R', k, 0.68);
          s.hard('handR', slabGeo(top, top.clone().addScaledVector(EDGE, 0.16 * k), WEAPON_DIR, 0.06 * k, 0.2 * k, 0.02 * k, 0.005 * k), 'metal', [0.5, 0.5, 0.53]);
          s.hard('handR', spikeGeo(top, top.clone().addScaledVector(EDGE, -0.09 * k).addScaledVector(WEAPON_DIR, 0.03 * k), 0.016 * k, 4, undefined, 1), 'metal', [0.5, 0.5, 0.53]);
          // The watch tabard: a long panel front and back with a tower badge.
          const ch = s.j('chest');
          for (const z of [1, -1]) {
            s.box('chest', ch.clone().add(V(0, -0.06 * H, z * 0.07 * H)), V(0.07 * H, 0.12 * H, 0.005 * H), { mat: 'alt', k: 0.01 * H });
            s.hard('hips', spikeGeo(s.j('hips').add(V(0, 0.0, z * 0.075 * H)), s.j('hips').add(V(0, -0.18 * H, z * 0.09 * H)), 0.06 * H, 3, undefined, 2), 'alt');
          }
          s.hard('chest', boxGeo(ch.clone().add(V(0, -0.02 * H, 0.078 * H)), V(0.02 * H, 0.035 * H, 0.003 * H)), 'metal', [0.8, 0.8, 0.85], 0.2);
          // The lantern on his hip and a horn on a cord.
          lantern(s, 'hips', s.j('hips').add(V(-0.11 * H, -0.05 * H, 0.04 * H)), 0.03 * H, [0.6, 0.9, 1.4]);
          const hn = s.j('hips').add(V(0.1 * H, 0.02 * H, -0.02 * H));
          s.hard('hips', tubeGeo([hn, hn.clone().add(V(0.02 * H, -0.03 * H, 0.06 * H)), hn.clone().add(V(0.0, -0.01 * H, 0.1 * H))], (t) => (0.008 + 0.014 * t) * H, 6, true), 'metal', [0.8, 0.75, 0.6]);
        },
      },
    ),

  // Selk: a great moth of glass, wings set like church windows in lead,
  // an eye painted in each pane, six lamp eyes and feathered antennae.
  warden_selk: (c) =>
    asBoss(
      c,
      flyerLook(c, {
        body: 0.9,
        hover: 1.4,
        span: 2.4,
        upright: true,
        surface: 'fur',
        alt: { surface: 'hide', tint: 0x9ad8e8 },
        sculpt: (s) => {
          const ch = s.j('chest');
          const bd = s.j('body');
          // A furred thorax and a long ringed abdomen.
          s.ball('chest', ch, V(0.13, 0.15, 0.12), { k: 0.04 });
          s.limb('body', bd.clone().add(V(0, 0.05, 0)), bd.clone().add(V(0, -0.4, -0.08)), 0.11, 0.05, { k: 0.04 });
          for (let i = 0; i < 5; i++) s.hard('body', ringGeo(bd.clone().add(V(0, -0.04 - i * 0.075, -0.015 * i)), 0.1 - i * 0.012, 0.012, V(0, 1, 0.15).normalize(), 14), 'alt', [0.7, 0.85, 0.9]);
          const h = s.j('head');
          s.ball('head', h, V(0.075, 0.07, 0.07), { k: 0.02 });
          // Six eyes: two great ones and four small above.
          s.pair((_side, x) => {
            s.eye('head', h.clone().add(V(x * 0.05, 0.0, 0.05)), 0.028, 1.4);
            s.eye('head', h.clone().add(V(x * 0.022, 0.04, 0.06)), 0.012, 1.2);
            s.eye('head', h.clone().add(V(x * 0.045, 0.045, 0.04)), 0.01, 1.2);
            // Feathered antennae: a quill with barbs.
            const a = h.clone().add(V(x * 0.02, 0.06, 0.03));
            const tip = a.clone().add(V(x * 0.14, 0.28, 0.06));
            s.hard('head', tubeGeo([a, lerpV(a, tip, 0.5).add(V(x * 0.02, 0, 0.03)), tip], () => 0.005, 3), 'alt', [0.85, 0.85, 0.8]);
            for (let i = 1; i < 6; i++) {
              const p = lerpV(a, tip, i / 6);
              s.hard('head', spikeGeo(p, p.clone().add(V(x * 0.04, -0.01, 0.03)), 0.006, 3, undefined, 1), 'alt', [0.85, 0.85, 0.8]);
              s.hard('head', spikeGeo(p, p.clone().add(V(-x * 0.02, 0.02, 0.04)), 0.006, 3, undefined, 1), 'alt', [0.85, 0.85, 0.8]);
            }
          });
          // The wings: panes of glass in a lead frame, an eye in each pane.
          const panes: RGB[] = [[0.5, 0.8, 1.0], [0.9, 0.5, 0.6], [0.95, 0.85, 0.45], [0.55, 0.9, 0.6]];
          s.pair((side, x) => {
            const a = s.j(`wing${side}`);
            const e = s.j(`wing${side}2`);
            const w = s.j(`wing${side}3`);
            const tip = s.j(`wing${side}Tip`);
            const R = a.distanceTo(tip);
            const low = a.clone().add(V(x * R * 0.55, -R * 0.75, -R * 0.1));
            const rims: Array<[string, THREE.Vector3, THREE.Vector3[]]> = [
              [`wing${side}`, a, [e, lerpV(e, low, 0.5), a.clone().add(V(x * R * 0.08, -R * 0.2, 0))]],
              [`wing${side}2`, e, [w, tip.clone().add(V(0, -R * 0.15, 0)), lerpV(e, low, 0.5)]],
              [`wing${side}3`, w, [tip, tip.clone().add(V(-x * R * 0.05, -R * 0.15, 0))]],
              [`wing${side}`, a.clone().add(V(x * R * 0.08, -R * 0.2, 0)), [lerpV(e, low, 0.5), low, a.clone().add(V(x * R * 0.15, -R * 0.55, -R * 0.05))]],
            ];
            rims.forEach(([bone, root, rim], i) => {
              s.hard(bone, membraneGeo(root, rim, 0.004 * R, 0.04), 'alt', panes[i]!, 0.35);
              // The lead: a dark tube round each pane.
              s.hard(bone, tubeGeo([root, ...rim, root], () => 0.006 * R, 3), 'metal', [0.18, 0.18, 0.2]);
              // A painted eye in the middle of the pane.
              const mid = rim.reduce((m, p) => m.add(p), root.clone()).multiplyScalar(1 / (rim.length + 1));
              s.hard(bone, ringGeo(mid.clone().add(V(0, 0, 0.004 * R)), 0.035 * R, 0.006 * R, V(0, 0, 1), 12), 'metal', [0.15, 0.12, 0.2]);
              s.glow(mid.clone().add(V(0, 0, 0.006 * R)), 0.014 * R, 0.8, [0.9, 0.95, 1.3]);
            });
          });
          // Little hooked legs folded under the thorax.
          s.pair((side) => {
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.014, 0.01, { k: 0.005 });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.01, 0.006, { k: 0.004 });
          });
        },
        style: { heavy: 0.15, attacks: ['claw', 'hurl', 'lunge'], ranged: true, idle: 'hover', spawn: 'swoop', death: 'crash' },
      }),
      { mats: { skin: { surface: 'fur', tint: 0xc8d8e0, glow: 0x9ad8ff }, alt: { surface: 'crystal', tint: 0x9ad8e8, glow: 0x9ad8ff } } },
    ),

  // Tamsin: a rope-dancer in red and gold, a coil of rope over her shoulder,
  // ribbons at her wrists, bells at her ankles, a knife in each hand.
  warden_tamsin: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.7,
        build: 'thin',
        skin: 0xd8a888,
        cloth: 0x8a2a2a,
        tunic: 1,
        belt: 1,
        mask: true,
        weapon: 'dagger',
        weaponSize: 1.1,
        extra: (s, H) => {
          // A coil of rope over the right shoulder and across to the left hip.
          const sh = s.j('armR').add(V(-0.02 * H, 0.02 * H, 0));
          const hip = s.j('hips').add(V(-0.08 * H, 0.03 * H, 0));
          for (let i = 0; i < 3; i++) s.hard('chest', tubeGeo([sh.clone().add(V(0, 0, i * 0.008 * H)), s.j('chest').add(V(0, -0.02 * H, 0.09 * H + i * 0.006 * H)), hip.clone().add(V(0, 0, 0.06 * H + i * 0.006 * H)), s.j('chest').add(V(0, -0.05 * H, -0.09 * H)), sh.clone().add(V(0, 0, -i * 0.008 * H))], () => 0.008 * H, 4, true), 'alt', [0.75, 0.62, 0.4]);
          // A second knife in the left hand.
          const g = lerpV(s.j('handL'), s.j('handLTip'), 0.55);
          s.hard('handL', tubeGeo([g.clone().addScaledVector(WEAPON_DIR, -0.04 * H), g.clone().addScaledVector(WEAPON_DIR, 0.03 * H)], () => 0.008 * H, 5), 'metal', WOOD);
          s.hard('handL', spikeGeo(g.clone().addScaledVector(WEAPON_DIR, 0.03 * H), g.clone().addScaledVector(WEAPON_DIR, 0.2 * H), 0.012 * H, 4, undefined, 1), 'metal', [0.7, 0.7, 0.72]);
          // Ribbons from the wrists and bells at the ankles.
          s.pair((side, x) => {
            const wr = lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.85);
            s.hard(`fore${side}`, spikeGeo(wr, wr.clone().add(V(x * 0.03 * H, -0.12 * H, -0.06 * H)), 0.02 * H, 2, undefined, 2), 'alt', [0.95, 0.75, 0.3]);
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2;
              s.hard(`shin${side}`, ballGeo(lerpV(s.j(`shin${side}`), s.j(`foot${side}`), 0.85).add(V(Math.sin(a) * 0.028 * H, 0, Math.cos(a) * 0.028 * H)), 0.008 * H, 1), 'metal', [0.95, 0.75, 0.3]);
            }
          });
          // A sash of gold coins at the waist.
          for (let i = 0; i < 8; i++) {
            const a = (i / 7 - 0.5) * 2.4;
            s.hard('hips', ringGeo(s.j('hips').add(V(Math.sin(a) * 0.085 * H, 0.0, Math.cos(a) * 0.07 * H)), 0.008 * H, 0.003 * H, V(Math.sin(a), 0, Math.cos(a)), 8), 'metal', [0.95, 0.75, 0.3]);
          }
        },
        style: { heavy: 0.02, attacks: ['thrust', 'lunge', 'swing'], armed: 'one', idle: 'sway', gait: 'lope', spawn: 'drop' },
      }),
    ),

  // Brother Ash: a broad monk in a rust robe, his face grey with ash, a
  // censer as big as a bell swung on a chain, embers rising from his shoulders.
  warden_brother_ash: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.9,
        build: 'stout',
        head: 'bald',
        skin: 0x8a8480,
        cloth: 0x6a3a1a,
        robe: 1,
        tunic: 2,
        hood: true,
        belt: 1,
        extra: (s, H) => {
          // The censer: a chain from his fist to a pierced iron bell full of coals.
          const hd = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
          const bell = hd.clone().add(V(0.02 * H, -0.28 * H, 0.08 * H));
          chain(s, 'handR', hd, bell.clone().add(V(0, 0.08 * H, 0)), 0.014 * H, IRON);
          s.hard('handR', ballGeo(bell, 0.075 * H, 1).scale(1, 1.1, 1), 'metal', [0.3, 0.28, 0.27]);
          s.hard('handR', ringGeo(bell.clone().add(V(0, -0.02 * H, 0)), 0.078 * H, 0.008 * H, V(0, 1, 0), 16), 'metal', BRASS);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            s.glow(bell.clone().add(V(Math.sin(a) * 0.07 * H, 0.02 * H, Math.cos(a) * 0.07 * H)), 0.012 * H, 1.2, [1.4, 0.6, 0.2]);
          }
          s.boil('handR', bell.clone().add(V(0, 0.07 * H, 0)), 0.03 * H, 1.2, [1.4, 0.55, 0.2]);
          // Prayer beads and a rope belt.
          for (let i = 0; i < 14; i++) {
            const a = (i / 13 - 0.5) * 2.4;
            s.hard('chest', ballGeo(s.j('chest').add(V(Math.sin(a) * 0.08 * H, 0.06 * H - Math.cos(a) * 0.1 * H, 0.08 * H + Math.cos(a) * 0.02 * H)), 0.01 * H, 1), 'metal', [0.25, 0.18, 0.12]);
          }
          // Embers rising off his shoulders.
          const r = seq(61);
          s.pair((side) => {
            for (let i = 0; i < 4; i++) s.glow(s.j(`arm${side}`).add(V((r() - 0.5) * 0.06 * H, 0.05 * H + r() * 0.12 * H, (r() - 0.5) * 0.06 * H)), 0.006 * H, 1.2, [1.4, 0.55, 0.2]);
          });
          // Ash smeared on the face, the eyes bright in it.
          s.tint(s.j('head').add(V(0, 0.02 * H, 0.06 * H)), 0.05 * H, [0.35, 0.34, 0.33]);
        },
        style: { heavy: 0.45, attacks: ['swing', 'slam', 'lash'], armed: 'one', idle: 'breathe', gait: 'march' },
      }),
    ),

  // Maudry: a bent crone grown into a hedge, bark skin, brambles over her
  // back, a crown of thorny twigs, moss hanging from her chin, long claws.
  warden_maudry: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.8,
        build: 'thin',
        hunch: 0.45,
        skin: 0x6a5a40,
        skinSurface: 'bark',
        cloth: 0x3a4a22,
        clothSurface: 'moss',
        robe: 0.8,
        tunic: 2,
        claws: 0.07,
        extra: (s, H) => {
          // Brambles over her back and shoulders.
          const bk = s.j('chest').add(V(0, 0.04 * H, -0.08 * H));
          s.ball('chest', bk, V(0.15 * H, 0.1 * H, 0.08 * H), { mat: 'alt', k: 0.04 * H });
          thorns(s, 'chest', bk, 0.14 * H, 18, 0.05 * H, 31);
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`).add(V(0, 0.04 * H, 0));
            thorns(s, `arm${side}`, sh, 0.04 * H, 6, 0.04 * H, 33 + (x > 0 ? 1 : 0));
            // Leaves sprouting from the brambles.
            for (let i = 0; i < 3; i++) leaf(s, `arm${side}`, sh.clone().add(V(x * 0.03 * H, 0.01 * H * i, -0.02 * H)), V(x, 0.6 + i * 0.3, -0.4), 0.06 * H, 0.025 * H, [0.35, 0.5, 0.2]);
          });
          // A crown of thorny twigs.
          const hc = s.j('head').add(V(0, 0.07 * H, 0));
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const p = hc.clone().add(V(Math.sin(a) * 0.05 * H, 0, Math.cos(a) * 0.05 * H));
            s.hard('head', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.04 * H, 0.08 * H + (i % 2) * 0.04 * H, Math.cos(a) * 0.04 * H)), 0.01 * H, 4, V(0, 0.02 * H, 0), 2), 'skin', [0.35, 0.28, 0.2]);
          }
          mossBeard(s, 'head', s.j('head').add(V(0, -0.04 * H, 0.05 * H)), 0.07 * H, 0.14 * H, 6, 13);
          // Green light in the hollows of her eyes and through the brambles.
          s.pair((_side, x) => s.eye('head', s.j('head').add(V(x * 0.025 * H, 0.03 * H, 0.065 * H)), 0.01 * H, 1.3));
          const r = seq(47);
          for (let i = 0; i < 5; i++) s.glow(bk.clone().add(V((r() - 0.5) * 0.2 * H, (r() - 0.5) * 0.12 * H, -0.06 * H)), 0.012 * H, 0.8, [0.7, 1.3, 0.5]);
        },
        style: { heavy: 0.2, attacks: ['claw', 'lash', 'hurl'], armed: 'none', castBoth: true, ranged: true, idle: 'sway', gait: 'shamble', spawn: 'emerge' },
      }),
    ),

  // Orrin Vael: a tall archer rimed white, icicles hanging from his cloak,
  // a crown of frost, a quiver of ice arrows and a pale bow.
  warden_orrin_vael: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.95,
        build: 'thin',
        skin: 0xb8c8d8,
        cloth: 0xa8d8f0,
        metal: 0xc8e8ff,
        metalSurface: 'ice',
        tunic: 2,
        cape: 0.7,
        hood: true,
        belt: 1,
        strap: true,
        weapon: 'bow',
        weaponSize: 1.2,
        extra: (s, H) => {
          // The quiver on his back, ice arrows in it.
          const q = s.j('chest').add(V(0.04 * H, 0.0, -0.1 * H));
          s.hard('chest', tubeGeo([q.clone().add(V(-0.02 * H, -0.12 * H, 0)), q.clone().add(V(0.02 * H, 0.08 * H, -0.01 * H))], () => 0.03 * H, 8, true), 'alt', [0.4, 0.45, 0.55]);
          for (let i = 0; i < 6; i++) {
            const p = q.clone().add(V(0.02 * H + (i % 3 - 1) * 0.012 * H, 0.08 * H, -0.01 * H + (i < 3 ? 0.01 : -0.01) * H));
            s.hard('chest', spikeGeo(p, p.clone().add(V(0.01 * H, 0.1 * H, -0.01 * H)), 0.008 * H, 4, undefined, 1), 'metal', ICE, 0.5);
          }
          // Icicles hanging from the cloak's hem and his elbows.
          const r = seq(71);
          const hem = s.j('hips').add(V(0, -0.15 * H, -0.12 * H));
          for (let i = 0; i < 7; i++) {
            const p = hem.clone().add(V((i / 6 - 0.5) * 0.24 * H, r() * 0.03 * H, 0));
            s.hard('hips', spikeGeo(p, p.clone().add(V(0, -0.05 * H - r() * 0.05 * H, 0)), 0.01 * H, 4, undefined, 1), 'metal', ICE, 0.3);
          }
          s.pair((side) => {
            const el = s.j(`fore${side}`);
            for (let i = 0; i < 2; i++) s.hard(`fore${side}`, spikeGeo(el.clone().add(V((i - 0.5) * 0.015 * H, -0.01 * H, 0)), el.clone().add(V((i - 0.5) * 0.015 * H, -0.06 * H, 0)), 0.006 * H, 4, undefined, 1), 'metal', ICE, 0.3);
          });
          // A crown of frost round the hood.
          const hc = s.j('head').add(V(0, 0.08 * H, 0.0));
          for (let i = 0; i < 9; i++) {
            const a = (i / 8 - 0.5) * 2.6;
            const p = hc.clone().add(V(Math.sin(a) * 0.06 * H, 0, Math.cos(a) * 0.06 * H));
            s.hard('head', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.02 * H, 0.05 * H + (i % 2) * 0.04 * H, Math.cos(a) * 0.02 * H)), 0.008 * H, 4, undefined, 1), 'metal', ICE, 0.6);
          }
          s.pair((_side, x) => s.eye('head', s.j('head').add(V(x * 0.022 * H, 0.03 * H, 0.068 * H)), 0.008 * H, 1.5));
        },
        style: { heavy: 0.1, attacks: ['shoot', 'shoot', 'thrust'], armed: 'bow', ranged: true, idle: 'still', gait: 'stalk' },
      }),
    ),

  // Cog: a brass nun on clockwork, a wimple of black enamel, a face plate
  // with lens eyes, a prayer wheel in one hand and a wind-up key in her back.
  warden_cog: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'biped',
        rig: { shoulders: 0.13, hips: 0.07, arms: 1.05, head: 0.9 },
        skin: { surface: 'brass', tint: 0xb08a40 },
        alt: { surface: 'iron', tint: 0x1a1a20 },
        metal: { surface: 'gold', tint: 0xd0a850 },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          // A narrow brass bodice and a bell skirt of overlapping plates.
          s.ball('chest', ch, V(0.1 * H, 0.11 * H, 0.08 * H), { k: 0.01 * H });
          s.ball('spine', s.j('spine'), V(0.075 * H, 0.08 * H, 0.06 * H), { k: 0.01 * H });
          skirt(s, { len: 0.95, flare: 1.6, mat: 'alt' });
          for (let i = 0; i < 3; i++) s.hard('hips', ringGeo(s.j('hips').add(V(0, -0.08 * H - i * 0.14 * H, 0)), (0.13 + i * 0.045) * H, 0.007 * H, V(0, 1, 0), 22), 'metal');
          // Arms on visible joints.
          s.pair((side) => {
            s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.03 * H, 0.026 * H);
            s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.026 * H, 0.022 * H);
            s.hard(`fore${side}`, ballGeo(s.j(`fore${side}`), 0.032 * H, 1), 'metal');
            s.ball(`hand${side}`, s.j(`hand${side}`), V(0.03 * H, 0.035 * H, 0.025 * H), { k: 0.005 * H });
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.035 * H, 0.03 * H);
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.03 * H, 0.028 * H);
            s.box(`foot${side}`, s.j(`foot${side}`).add(V(0, -0.01 * H, 0.03 * H)), V(0.035 * H, 0.02 * H, 0.06 * H), { k: 0.004 * H });
          });
          // The wimple: a black hood with a white band, and a brass face plate.
          const h = s.j('head');
          s.ball('head', h.clone().add(V(0, 0.01 * H, -0.01 * H)), V(0.075 * H, 0.085 * H, 0.08 * H), { mat: 'alt', k: 0.01 * H });
          s.ball('chest', s.j('neck').add(V(0, -0.03 * H, -0.02 * H)), V(0.12 * H, 0.05 * H, 0.09 * H), { mat: 'alt', k: 0.02 * H });
          s.hard('head', ringGeo(h.clone().add(V(0, 0.01 * H, 0.0)), 0.07 * H, 0.008 * H, V(0, 0.2, 1).normalize(), 20), 'metal', [0.9, 0.88, 0.82]);
          s.hard('head', ballGeo(h.clone().add(V(0, 0.0, 0.045 * H)), 0.05 * H, 1).scale(1, 1.25, 0.5), 'skin');
          s.pair((_side, x) => lens(s, 'head', h.clone().add(V(x * 0.02 * H, 0.012 * H, 0.068 * H)), 0.011 * H, V(0, 0, 1), 1.6));
          // The prayer wheel: a drum on a handle with a gear on its end.
          const g = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
          const drum = g.clone().addScaledVector(WEAPON_DIR, 0.16 * H);
          s.hard('handR', tubeGeo([g.clone().addScaledVector(WEAPON_DIR, -0.04 * H), drum], () => 0.008 * H, 5), 'metal', WOOD);
          s.hard('handR', tubeGeo([drum.clone().add(V(0, -0.04 * H, 0)), drum.clone().add(V(0, 0.04 * H, 0))], () => 0.035 * H, 10, true), 'metal');
          gear(s, 'handR', drum.clone().add(V(0, 0.045 * H, 0)), 0.04 * H, V(0, 1, 0), 10, BRASS);
          // The wind-up key in her back, and gears turning in an open panel.
          const bk = ch.clone().add(V(0, 0.0, -0.085 * H));
          s.hard('chest', tubeGeo([bk, bk.clone().add(V(0, 0, -0.06 * H))], () => 0.01 * H, 6), 'metal');
          s.pair((_side, x) => s.hard('chest', ballGeo(bk.clone().add(V(x * 0.04 * H, 0.0, -0.065 * H)), 0.035 * H, 1).scale(1, 0.7, 0.25), 'metal'));
          gear(s, 'chest', ch.clone().add(V(0, -0.02 * H, 0.085 * H)), 0.035 * H, V(0, 0, 1), 12, [0.85, 0.65, 0.3], 'metal', 0.3);
          rivets(s, 'chest', ch.clone().add(V(-0.07 * H, 0.06 * H, 0.07 * H)), ch.clone().add(V(0.07 * H, 0.06 * H, 0.07 * H)), 6, 0.005 * H, BRASS);
        },
        style: { heavy: 0.35, attacks: ['swing', 'slam', 'hurl'], armed: 'one', idle: 'still', gait: 'march' },
      }),
    ),

  // Hollis: the drowned ferryman, a long wraith in a wet coat and a wide
  // hat, coins on his eyes, a ferry pole with a lantern hung from its top.
  warden_hollis: (c) =>
    asBoss(c, specterLook(c, { veil: true, claws: 0.06, height: 2.1 }), {
      extra: (s, H) => {
        // The ferry pole: a long wet shaft with a hook and a lantern at the top.
        const k = H;
        const a = along(s, 'R', k, -0.5);
        const top = along(s, 'R', k, 0.75);
        s.hard('handR', tubeGeo([a, top], () => 0.011 * k, 6), 'metal', [0.25, 0.22, 0.18]);
        s.hard('handR', tubeGeo([top, top.clone().addScaledVector(EDGE, -0.04 * k).addScaledVector(WEAPON_DIR, 0.03 * k), top.clone().addScaledVector(EDGE, -0.06 * k)], () => 0.007 * k, 4), 'metal', IRON);
        lantern(s, 'handR', top.clone().addScaledVector(EDGE, 0.06 * k), 0.03 * H, [0.5, 1.1, 1.2]);
        // A broad-brimmed hat over the hood, dripping.
        const hc = s.j('head').add(V(0, 0.08 * H, 0));
        s.hard('head', ringGeo(hc, 0.11 * H, 0.014 * H, V(0, 1, 0.1).normalize(), 20), 'alt', [0.15, 0.18, 0.2]);
        s.ball('head', hc.clone().add(V(0, 0.03 * H, 0)), V(0.06 * H, 0.04 * H, 0.06 * H), { mat: 'alt', k: 0.01 * H });
        const r = seq(37);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const p = hc.clone().add(V(Math.sin(ang) * 0.11 * H, -0.005 * H, Math.cos(ang) * 0.11 * H));
          s.hard('head', spikeGeo(p, p.clone().add(V(0, -0.03 * H - r() * 0.04 * H, 0)), 0.004 * H, 3, undefined, 1), 'metal', [0.5, 0.75, 0.8], 0.4);
        }
        // Two coins over the eyes, for the fare he never took.
        s.pair((_side, x) => s.hard('head', ringGeo(s.j('head').add(V(x * 0.025 * H, 0.03 * H, 0.07 * H)), 0.012 * H, 0.005 * H, V(0, 0, 1), 10), 'metal', [0.75, 0.6, 0.35], 0.3));
        // Weed hanging from his sleeves.
        s.pair((side) => mossBeard(s, `fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.5), 0.05 * H, 0.12 * H, 4, side === 'L' ? 3 : 4));
      },
      style: { heavy: 0.2, attacks: ['thrust', 'swing', 'hurl'], armed: 'two', idle: 'sway' },
      mats: { alt: { surface: 'cloth', tint: 0x2a3a44, glow: 0x60c0d0 } },
    }),

  // Vey, the Lock-Saint: a tall figure in iron robes, a keyhole where the face
  // should be with an eye looking out of it, a halo of hanging keys, a sword.
  warden_vey: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 2.0,
        build: 'normal',
        head: 'bald',
        skin: 0x6a6a72,
        skinSurface: 'iron',
        cloth: 0x4a4a52,
        metal: 0x5a5a62,
        metalSurface: 'iron',
        robe: 0.9,
        tunic: 2,
        armor: 0.4,
        cape: 0.6,
        weapon: 'sword',
        weaponSize: 1.2,
        weaponGlow: 0xc080ff,
        extra: (s, H) => {
          const h = s.j('head');
          // An iron plate over the face with a keyhole cut in it.
          const fc = h.clone().add(V(0, 0.02 * H, 0.06 * H));
          s.hard('head', ballGeo(fc, 0.06 * H, 1).scale(1, 1.3, 0.4), 'metal', [0.35, 0.35, 0.38]);
          s.hard('head', ballGeo(fc.clone().add(V(0, 0.02 * H, 0.02 * H)), 0.014 * H, 1).scale(1, 1, 0.3), 'alt', DARK);
          s.hard('head', boxGeo(fc.clone().add(V(0, -0.012 * H, 0.02 * H)), V(0.007 * H, 0.022 * H, 0.004 * H)), 'alt', DARK);
          s.eye('head', fc.clone().add(V(0, 0.02 * H, 0.016 * H)), 0.009 * H, 1.8);
          // The halo: an iron ring behind the head, keys hanging all round it.
          const hc = h.clone().add(V(0, 0.06 * H, -0.08 * H));
          s.hard('head', ringGeo(hc, 0.13 * H, 0.008 * H, V(0, 0, 1), 26), 'metal', IRON, 0.2);
          for (let i = 0; i < 11; i++) {
            const a = (i / 11) * Math.PI * 2;
            key(s, 'head', hc.clone().add(V(Math.sin(a) * 0.13 * H, Math.cos(a) * 0.13 * H - 0.012 * H, 0)), 0.05 * H, i % 3 ? IRON : [0.75, 0.58, 0.3]);
          }
          // Rings of keys on chains at the belt.
          s.pair((_side, x) => {
            const p = s.j('hips').add(V(x * 0.09 * H, -0.02 * H, 0.04 * H));
            s.hard('hips', ringGeo(p, 0.025 * H, 0.004 * H, V(0, 0, 1), 12), 'metal', IRON);
            for (let i = 0; i < 4; i++) key(s, 'hips', p.clone().add(V((i - 1.5) * 0.012 * H, -0.025 * H, 0.004 * H * i)), 0.045 * H);
          });
          // A padlock hanging on the chest, shut.
          const lk = s.j('chest').add(V(0, -0.02 * H, 0.11 * H));
          s.hard('chest', boxGeo(lk, V(0.03 * H, 0.025 * H, 0.012 * H)), 'metal', [0.75, 0.58, 0.3]);
          s.hard('chest', ringGeo(lk.clone().add(V(0, 0.03 * H, 0)), 0.018 * H, 0.004 * H, V(0, 0, 1), 10), 'metal', IRON);
          chain(s, 'chest', s.j('neck').add(V(-0.05 * H, 0, 0.03 * H)), lk.clone().add(V(-0.01 * H, 0.04 * H, 0)), 0.01 * H, IRON);
          chain(s, 'chest', s.j('neck').add(V(0.05 * H, 0, 0.03 * H)), lk.clone().add(V(0.01 * H, 0.04 * H, 0)), 0.01 * H, IRON);
        },
        style: { heavy: 0.4, attacks: ['chop', 'thrust', 'swing'], armed: 'one', idle: 'still', gait: 'march' },
      }),
    ),
};

