/**
 * SLAY — bosses, part three: the depth plan's twenty-eight, shallow half.
 * The ratcatcher, the choir of rot, the root-boar, the boiler golem, the
 * sister of the bell, the candle witch, the sallow twins, the gutterking,
 * the glazier, the walking stair, the drowned duchess, the tallow shepherd,
 * the brass abbot and the saltwyrm. Their partners and flocks are at the end.
 */
import * as THREE from 'three';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, lerpV, seq } from './Kit';
import { manLook } from './LookHumanoid';
import { specterLook } from './LookUndead';
import { quadLook, serpentBody, serpentHead, serpentLook } from './LookBeast';
import { botLook, gear, grille, rivets, shield } from './LookConstruct';
import { fire, walkLook } from './LookElemental';
import { asBoss, chain } from './LookBoss';

const IRON: RGB = [0.42, 0.42, 0.45];
const DARK: RGB = [0.08, 0.07, 0.07];
const GOLD: RGB = [0.95, 0.75, 0.3];
const BRASS: RGB = [0.75, 0.58, 0.3];
const TOOTH: RGB = [0.85, 0.8, 0.62];
const WAX: RGB = [0.95, 0.9, 0.75];
const LEATHER: RGB = [0.35, 0.25, 0.16];
const GLASS: RGB = [0.7, 0.85, 0.9];

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

/** A candle standing at `p`, a flame on its wick. */
function candle(s: Sculpt, bone: string, p: THREE.Vector3, h: number, r: number, col: RGB = WAX): void {
  s.hard(bone, tubeGeo([p, p.clone().add(V(0, h, 0))], () => r, 6, true), 'metal', col);
  s.boil(bone, p.clone().add(V(0, h + r * 1.3, 0)), r * 0.9, 1, [1.3, 0.85, 0.4]);
}

/** A sack slung on the back, lumpy, tied at the neck. */
function sack(s: Sculpt, H: number, size: number, mat: CMat = 'alt'): void {
  const c = s.j('chest').add(V(0.03 * H, -0.02 * H, -0.12 * H));
  s.ball('chest', c, V(0.1 * H * size, 0.12 * H * size, 0.08 * H * size), { mat, k: 0.03 * H });
  s.ball('chest', c.clone().add(V(-0.04 * H * size, -0.05 * H * size, -0.03 * H)), V(0.06 * H * size, 0.05 * H * size, 0.05 * H * size), { mat, k: 0.03 * H });
  s.hard('chest', ringGeo(c.clone().add(V(0, 0.11 * H * size, 0)), 0.03 * H * size, 0.006 * H, V(0, 1, 0), 10), 'metal', LEATHER);
}

/** A small black bird on a perch, beak toward `face`. */
function crow(s: Sculpt, bone: string, p: THREE.Vector3, size: number, face: THREE.Vector3): void {
  const f = face.clone().setY(0).normalize();
  s.hard(bone, ballGeo(p, size, 1).scale(1, 0.85, 1.25).translate(0, 0, 0), 'alt', DARK);
  const h = p.clone().addScaledVector(f, size * 0.95).add(V(0, size * 0.55, 0));
  s.hard(bone, ballGeo(h, size * 0.55, 1), 'alt', DARK);
  s.hard(bone, spikeGeo(h.clone().addScaledVector(f, size * 0.4), h.clone().addScaledVector(f, size * 1.1).add(V(0, -size * 0.1, 0)), size * 0.16, 3, undefined, 1), 'metal', [0.25, 0.22, 0.18]);
  s.hard(bone, spikeGeo(p.clone().addScaledVector(f, -size * 0.8), p.clone().addScaledVector(f, -size * 2).add(V(0, -size * 0.2, 0)), size * 0.35, 3, undefined, 1), 'alt', DARK);
}

/** Wax running down from `top`, in drips of a candle's colour. */
function waxDrips(s: Sculpt, bone: string, top: THREE.Vector3, n: number, len: number, w: number, seed: number, col: RGB = WAX): void {
  const r = seq(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const p = top.clone().add(V(Math.sin(a) * w, 0, Math.cos(a) * w));
    const l = len * (0.5 + r() * 0.8);
    s.hard(bone, tubeGeo([p, p.clone().add(V(Math.sin(a) * w * 0.05, -l * 0.6, Math.cos(a) * w * 0.05)), p.clone().add(V(0, -l, 0))], (t) => w * (0.14 - 0.06 * t), 5, true), 'metal', col);
  }
}

/** A coat of salt crust: white lumps on the top half of the given bones, `out` from each bone's centre. */
function crust(s: Sculpt, bones: string[], n: number, r: number, seed: number, col: RGB, out = r * 2): void {
  const q = seq(seed);
  for (let i = 0; i < n; i++) {
    const b = bones[i % bones.length]!;
    if (!s.has(b)) continue;
    const a = (q() - 0.5) * Math.PI * 1.4;
    const p = s.j(b).add(V(Math.sin(a) * out, Math.cos(a) * out * 0.9, (q() - 0.5) * out * 1.2));
    s.hard(b, ballGeo(p, r * (0.6 + q()), 0), 'metal', col);
  }
}

// ---------------------------------------------------------------------------

export const BOSS_C: Record<string, LookFactory> = {
  // Pell Dunmarrow: a lean ratcatcher in a leather apron and a wide hat,
  // snares on her belt, a squirming sack across her back, a long knife.
  pell_dunmarrow: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.8,
        build: 'thin',
        cloth: 0x5a4630,
        clothSurface: 'leather',
        skin: 0xb59a82,
        robe: 0.45,
        belt: 3,
        strap: true,
        weapon: 'dagger',
        weaponSize: 1.3,
        extra: (s, H) => {
          // A wide-brimmed hat, the brim curled up on one side.
          const hc = s.j('head').add(V(0, 0.07 * H, 0));
          s.hard('head', ringGeo(hc, 0.09 * H, 0.012 * H, V(0.1, 1, 0), 18), 'alt', [0.3, 0.24, 0.17]);
          s.ball('head', hc.clone().add(V(0, 0.03 * H, 0)), V(0.055 * H, 0.04 * H, 0.055 * H), { mat: 'alt', k: 0.01 * H });
          sack(s, H, 1.1);
          // Snares: wire loops and a toothed trap hang from her belt.
          for (let i = 0; i < 4; i++) {
            const p = s.j('hips').add(V((i - 1.5) * 0.05 * H, -0.04 * H, 0.065 * H - Math.abs(i - 1.5) * 0.02 * H));
            s.hard('hips', ringGeo(p.clone().add(V(0, -0.03 * H, 0)), 0.022 * H, 0.003 * H, V(0, 0, 1), 10), 'metal', IRON);
          }
          const trap = s.j('hips').add(V(0.1 * H, -0.06 * H, 0.02 * H));
          s.hard('hips', ringGeo(trap, 0.035 * H, 0.005 * H, V(1, 0, 0), 12), 'metal', IRON);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const p = trap.clone().add(V(0, Math.sin(a) * 0.035 * H, Math.cos(a) * 0.035 * H));
            s.hard('hips', spikeGeo(p, lerpV(p, trap, 0.4), 0.004 * H, 3, undefined, 1), 'metal', TOOTH);
          }
          // A rat's tail hanging out of the sack.
          const sk = s.j('chest').add(V(0.03 * H, 0.08 * H, -0.12 * H));
          s.hard('chest', tubeGeo([sk, sk.clone().add(V(0.04 * H, 0.03 * H, -0.04 * H)), sk.clone().add(V(0.06 * H, -0.05 * H, -0.06 * H))], (t) => (0.006 - 0.004 * t) * H, 4), 'skin', [0.75, 0.55, 0.5]);
        },
        style: { heavy: 0.15, attacks: ['thrust', 'swing', 'hurl'], armed: 'one', idle: 'breathe', gait: 'stalk' },
      }),
    ),

  // The Choir of Rot: the low voice, a swollen corpse in a choir robe with a
  // hymnal chained to its neck and a bell collar, singing with its jaw unhinged.
  choir_of_rot: (c) =>
    asBoss(c, specterLook(c, { choir: true, mouth: 1.2, claws: 0.05, height: 1.95 }), {
      extra: (s, H) => {
        const ch = s.j('chest');
        // A swollen belly under the robe: the low voice is the loudest.
        s.ball('spine', s.j('spine').add(V(0, 0, 0.03 * H)), V(0.1 * H, 0.09 * H, 0.09 * H), { mat: 'alt', k: 0.04 * H });
        // A hymnal on a chain.
        const book = ch.clone().add(V(0.02 * H, -0.08 * H, 0.12 * H));
        s.hard('chest', boxGeo(book, V(0.07 * H, 0.09 * H, 0.025 * H)), 'metal', [0.35, 0.2, 0.15]);
        s.hard('chest', boxGeo(book.clone().add(V(0, 0, 0.005 * H)), V(0.062 * H, 0.082 * H, 0.026 * H)), 'alt', [0.85, 0.8, 0.65]);
        chain(s, 'chest', s.j('neck').add(V(-0.04 * H, 0, 0.03 * H)), book.clone().add(V(-0.03 * H, 0.04 * H, 0)), 0.01 * H, BRASS);
        chain(s, 'chest', s.j('neck').add(V(0.04 * H, 0, 0.03 * H)), book.clone().add(V(0.03 * H, 0.04 * H, 0)), 0.01 * H, BRASS);
        // Moss and rot down the hem.
        const r = seq(57);
        for (let i = 0; i < 8; i++) s.tint(s.j('hips').add(V((r() - 0.5) * 0.3 * H, -r() * 0.4 * H, (r() - 0.3) * 0.2 * H)), 0.06 * H, [0.45, 0.55, 0.3]);
      },
      style: { attacks: ['claw', 'lunge', 'lash'], heavy: 0.25 },
    }),

  // Old Gristle: a boar the size of a cart, roots torn up with it still
  // tangled in its bristles, tusks like ploughshares.
  old_gristle: (c) =>
    asBoss(
      c,
      quadLook(c, {
        withers: 1.0,
        length: 1.35,
        width: 0.26,
        neck: 0.22,
        neckRise: 0.05,
        head: 0.5,
        tail: 3,
        tailLen: 0.3,
        slope: -0.12,
        girth: 0.4,
        chest: 0.45,
        legR: 0.1,
        haunch: 1.0,
        narrow: 0.92,
        barrel: 1,
        paws: 'hoof',
        surface: 'fur',
        tint: 0x5a4636,
        alt: { surface: 'fur', tint: 0x3a2e24 },
        tier: 'big',
        head2: (s) => {
          const h = s.j('head');
          const sn = s.j('snout');
          const jw = s.j('jaw');
          s.ball('head', h.clone().add(V(0, 0.03, 0)), V(0.26, 0.24, 0.28), { k: 0.06 });
          s.limb('head', h.clone().add(V(0, 0, 0.08)), sn, 0.2, 0.12, { k: 0.05 });
          s.ball('head', sn.clone().add(V(0, -0.01, 0.02)), V(0.13, 0.1, 0.05), { k: 0.03 });
          s.limb('jaw', jw, sn.clone().add(V(0, -0.1, -0.06)), 0.14, 0.08, { k: 0.03 });
          s.pair((_side, x) => {
            // Tusks curling up and out.
            const t0 = lerpV(h, sn, 0.75).add(V(x * 0.1, -0.08, 0));
            s.hard('jaw', tubeGeo([t0, t0.clone().add(V(x * 0.12, 0.02, 0.1)), t0.clone().add(V(x * 0.2, 0.18, 0.08))], (t) => 0.035 * (1 - 0.8 * t), 6, true), 'metal', TOOTH);
            s.eye('head', h.clone().add(V(x * 0.15, 0.08, 0.17)), 0.025, 1);
            s.ball('head', h.clone().add(V(x * 0.18, 0.2, -0.08)), V(0.06, 0.09, 0.03), { k: 0.02 });
          });
        },
        extra: (s) => {
          // A ridge of bristles down the spine, and roots dragged up in them.
          const r = seq(83);
          for (let i = 0; i < 14; i++) {
            const p = lerpV(s.j('neck'), s.j('hips'), i / 13).add(V((r() - 0.5) * 0.08, 0.42 - Math.abs(i - 4) * 0.012, 0));
            s.hard(i < 7 ? 'chest' : 'hips', spikeGeo(p, p.clone().add(V((r() - 0.5) * 0.1, 0.14 + r() * 0.08, -0.1)), 0.035, 4, undefined, 2), 'alt');
          }
          for (let i = 0; i < 6; i++) {
            const a = s.j(i % 2 ? 'spine' : 'chest').add(V((r() - 0.5) * 0.5, 0.38, (r() - 0.5) * 0.3));
            const b = a.clone().add(V((r() - 0.5) * 0.7, -0.25 - r() * 0.2, (r() - 0.5) * 0.4));
            s.hard(i % 2 ? 'spine' : 'chest', tubeGeo([a, lerpV(a, b, 0.5).add(V(0, 0.08, 0)), b], (t) => 0.025 * (1 - 0.7 * t), 5, true), 'metal', [0.32, 0.24, 0.16]);
          }
          // Clods of earth caked on the flanks.
          for (let i = 0; i < 6; i++) s.hard('spine', ballGeo(s.j('spine').add(V((i % 2 ? 1 : -1) * 0.36, -0.1 + r() * 0.2, (r() - 0.5) * 0.6)), 0.05 + r() * 0.04, 0), 'metal', [0.3, 0.24, 0.18]);
        },
        lumps: { amp: 0.01, scale: 10 },
        style: { heavy: 0.8, attacks: ['gore', 'stomp', 'lunge'], idle: 'breathe', gait: 'lumber', death: 'collapse', spawn: 'emerge' },
      }),
    ),

  // Kettle: a riveted boiler on two stout legs, gauges on its chest, valves
  // and a stack on its back, steam leaking at every seam.
  kettle: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'brute',
        rig: { shoulders: 0.17, hips: 0.08, arms: 1.0, hunch: 0.1, head: 0.7 },
        skin: { surface: 'iron', tint: 0x6a6460 },
        alt: { surface: 'rust', tint: 0x5a3a2a },
        metal: { surface: 'brass', tint: 0xc09a4a },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          // The boiler: a fat riveted drum standing upright.
          s.limb('chest', ch.clone().add(V(0, 0.1 * H, 0)), s.j('hips').add(V(0, 0.02 * H, 0)), 0.16 * H, 0.15 * H, { k: 0.01 * H });
          for (let i = 0; i < 3; i++) {
            const y = 0.08 * H - i * 0.11 * H;
            s.hard('chest', ringGeo(ch.clone().add(V(0, y, 0)), 0.162 * H, 0.008 * H, V(0, 1, 0), 22), 'alt');
            rivets(s, 'chest', ch.clone().add(V(-0.14 * H, y, 0.08 * H)), ch.clone().add(V(0.14 * H, y, 0.08 * H)), 7, 0.006 * H, BRASS);
          }
          // Gauges on the chest, their needles leaning to red.
          s.pair((_side, x) => {
            const g = ch.clone().add(V(x * 0.065 * H, 0.04 * H, 0.155 * H));
            s.hard('chest', ringGeo(g, 0.03 * H, 0.006 * H, V(0, 0, 1), 14), 'metal');
            s.hard('chest', ballGeo(g.clone().add(V(0, 0, -0.004 * H)), 0.027 * H, 1).scale(1, 1, 0.2), 'alt', [0.9, 0.88, 0.8]);
            s.hard('chest', spikeGeo(g, g.clone().add(V(x * 0.02 * H, 0.016 * H, 0.002 * H)), 0.003 * H, 3, undefined, 1), 'alt', [0.9, 0.15, 0.1], 0.6);
          });
          // A firebox door low on the belly, glowing through its grille.
          grille(s, 'chest', ch.clone().add(V(0, -0.12 * H, 0.15 * H)), 0.07 * H, 0.05 * H, 4);
          // Valves and pipes on the back, and a stack with a cap.
          const bk = ch.clone().add(V(0, 0.02 * H, -0.15 * H));
          s.pair((_side, x) => {
            const v = bk.clone().add(V(x * 0.07 * H, 0.05 * H, -0.02 * H));
            s.hard('chest', tubeGeo([v, v.clone().add(V(0, 0, -0.06 * H))], () => 0.012 * H, 6, true), 'metal');
            s.hard('chest', ringGeo(v.clone().add(V(0, 0, -0.065 * H)), 0.028 * H, 0.006 * H, V(0, 0, 1), 10), 'alt', [0.8, 0.15, 0.1]);
          });
          const st = ch.clone().add(V(0.04 * H, 0.1 * H, -0.08 * H));
          s.hard('chest', tubeGeo([st, st.clone().add(V(0, 0.2 * H, -0.02 * H))], () => 0.03 * H, 8, true), 'alt');
          s.hard('chest', ringGeo(st.clone().add(V(0, 0.2 * H, -0.02 * H)), 0.04 * H, 0.008 * H, V(0, 1, 0), 12), 'metal');
          // The head: a pressure dome with one round porthole.
          const h = s.j('head');
          s.ball('head', h, V(0.07 * H, 0.06 * H, 0.07 * H), { k: 0.005 * H });
          s.hard('head', ringGeo(h.clone().add(V(0, 0, 0.065 * H)), 0.03 * H, 0.007 * H, V(0, 0, 1), 14), 'metal');
          s.boil('head', h.clone().add(V(0, 0, 0.06 * H)), 0.024 * H, 1, [1.3, 0.6, 0.25]);
          // Thick riveted arms with pincer-like hands, and stout legs.
          s.pair((side) => {
            s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.045 * H, 0.04 * H, { mat: 'alt' });
            s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.045 * H, 0.05 * H);
            s.ball(`hand${side}`, s.j(`hand${side}`), 0.05 * H, { mat: 'metal' });
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.055 * H, 0.05 * H, { mat: 'alt' });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.05 * H, 0.06 * H);
            s.box(`foot${side}`, s.j(`foot${side}`).add(V(0, -0.01 * H, 0.03 * H)), V(0.05 * H, 0.025 * H, 0.08 * H), { k: 0.005 * H });
          });
        },
        style: { heavy: 0.7, attacks: ['slam', 'thrust', 'stomp'], idle: 'breathe', gait: 'lumber', spawn: 'assemble', death: 'crash' },
      }),
    ),

  // Sister Abelline: a tall nun in a drowned habit and starched wimple,
  // a hand-bell raised in one hand, a rope of small bells at her waist.
  sister_abelline: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.85,
        build: 'thin',
        cloth: 0x2a2a34,
        robe: 1.0,
        hood: true,
        tunic: 2,
        skin: 0xc8c0b8,
        extra: (s, H) => {
          // A white wimple framing the face, a starched collar.
          const h = s.j('head');
          s.ball('head', h.clone().add(V(0, 0.01 * H, -0.005 * H)), V(0.068 * H, 0.08 * H, 0.068 * H), { mat: 'metal', k: 0.01 * H });
          s.ball('head', h.clone().add(V(0, 0.005 * H, 0.012 * H)), V(0.05 * H, 0.06 * H, 0.06 * H), { sub: true, mat: 'metal', k: 0.008 * H });
          s.ball('chest', s.j('neck').add(V(0, -0.02 * H, 0.01 * H)), V(0.11 * H, 0.03 * H, 0.085 * H), { mat: 'metal', k: 0.01 * H });
          // The hand-bell.
          const hb = lerpV(s.j('handR'), s.j('handRTip'), 0.6);
          s.hard('handR', tubeGeo([hb, hb.clone().add(V(0, -0.06 * H, 0.03 * H))], () => 0.007 * H, 5), 'alt', [0.3, 0.2, 0.15]);
          const bell = hb.clone().add(V(0, -0.09 * H, 0.045 * H));
          s.hard('handR', ballGeo(bell, 0.04 * H, 1).scale(1, 1.15, 1), 'metal', BRASS);
          s.hard('handR', ringGeo(bell.clone().add(V(0, -0.035 * H, 0)), 0.042 * H, 0.006 * H, V(0, 1, 0), 14), 'metal', BRASS);
          // A cord of little bells round her waist.
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const p = s.j('hips').add(V(Math.sin(a) * 0.09 * H, 0.02 * H, Math.cos(a) * 0.07 * H));
            s.hard('hips', ballGeo(p, 0.012 * H, 0), 'metal', BRASS);
          }
          // Waterweed caught in the hem.
          const r = seq(91);
          for (let i = 0; i < 6; i++) s.tint(s.j('hips').add(V((r() - 0.5) * 0.3 * H, -0.3 * H - r() * 0.15 * H, (r() - 0.5) * 0.2 * H)), 0.05 * H, [0.3, 0.4, 0.3]);
        },
        style: { heavy: 0.2, attacks: ['swing', 'hurl', 'thrust'], armed: 'none', castBoth: false, idle: 'sway', gait: 'walk' },
      }),
    ),

  // Mother Wick: a hunched old woman made of tallow, candles burning in her
  // hair and along her shoulders, wax running down her shawl.
  mother_wick: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.75,
        build: 'stout',
        hunch: 0.35,
        skin: 0xe8dcc0,
        skinSurface: 'stone',
        cloth: 0x4a3a30,
        robe: 0.95,
        tunic: 2,
        cape: 0.5,
        extra: (s, H) => {
          // A crown of candles in her hair.
          const hc = s.j('head').add(V(0, 0.08 * H, -0.01 * H));
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            candle(s, 'head', hc.clone().add(V(Math.sin(a) * 0.05 * H, 0, Math.cos(a) * 0.05 * H)), (0.04 + (i % 3) * 0.015) * H, 0.008 * H);
          }
          waxDrips(s, 'head', hc.clone().add(V(0, -0.01 * H, 0)), 8, 0.08 * H, 0.06 * H, 5);
          // Candle stubs along the shoulders, wax running down the shawl.
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`).add(V(x * 0.01 * H, 0.04 * H, 0));
            candle(s, `arm${side}`, sh, 0.035 * H, 0.009 * H);
            candle(s, `arm${side}`, sh.clone().add(V(-x * 0.04 * H, 0.01 * H, -0.03 * H)), 0.05 * H, 0.008 * H);
            waxDrips(s, `arm${side}`, sh, 5, 0.12 * H, 0.04 * H, side === 'L' ? 11 : 13);
          });
          // Long waxen fingers and a candle held like a lantern.
          const hl = lerpV(s.j('handL'), s.j('handLTip'), 0.6);
          candle(s, 'handL', hl.clone().add(V(0, 0.01 * H, 0)), 0.09 * H, 0.014 * H);
          s.paint.skin = { grime: 0.3, ao: 0.8, mottle: { scale: 5, amount: 0.25, col: [1.0, 0.92, 0.75] } };
        },
        style: { heavy: 0.25, attacks: ['claw', 'hurl', 'swing'], armed: 'none', idle: 'sway', gait: 'shamble' },
      }),
    ),

  // Ebb Sallow, the brother with the cleaver: tall, pale, waders and a
  // rope round his chest, reeds tied in his hair.
  sallow_twins: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.95,
        build: 'thin',
        skin: 0xc8d0c0,
        cloth: 0x3a4a3a,
        tunic: 1,
        belt: 1,
        strap: true,
        weapon: 'cleaver',
        weaponSize: 1.4,
        extra: (s, H) => {
          // Waders up to the chest.
          s.pair((side) => {
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.05 * H, 0.042 * H, { mat: 'alt', k: 0.01 * H });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.042 * H, 0.04 * H, { mat: 'alt', k: 0.01 * H });
          });
          s.ball('hips', s.j('hips').add(V(0, 0.05 * H, 0)), V(0.09 * H, 0.09 * H, 0.07 * H), { mat: 'alt', k: 0.02 * H });
          // Reeds tied in his hair.
          const h = s.j('head').add(V(0, 0.06 * H, -0.03 * H));
          for (let i = 0; i < 6; i++) {
            const a = (i / 6 - 0.5) * 1.8;
            s.hard('head', spikeGeo(h, h.clone().add(V(Math.sin(a) * 0.08 * H, 0.06 * H, -0.08 * H)), 0.004 * H, 3, undefined, 2), 'alt', [0.55, 0.6, 0.35]);
          }
          // A coil of rope over one shoulder.
          s.hard('chest', ringGeo(s.j('chest').add(V(0, 0.03 * H, 0)), 0.11 * H, 0.008 * H, V(0.5, 0.2, 0).normalize(), 18), 'alt', [0.6, 0.5, 0.35]);
        },
        style: { heavy: 0.3, attacks: ['chop', 'swing', 'thrust'], armed: 'one', idle: 'breathe', gait: 'stalk' },
      }),
    ),

  // Rusk the Gutterking: a goblin in a crown of bent spoons, a cloak of
  // stitched sacks, an iron shield bigger than he is.
  gutterking_rusk: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.3,
        head: 'goblin',
        skin: 0x6a7a42,
        cloth: 0x5a4a38,
        cape: 0.7,
        belt: 2,
        weapon: 'mace',
        weaponSize: 1.2,
        extra: (s, H) => {
          // The spoon crown.
          const cc = s.j('head').add(V(0, 0.12 * H, 0.005 * H));
          s.hard('head', ringGeo(cc, 0.065 * H, 0.008 * H, V(0, 1, 0), 16), 'metal', [0.75, 0.75, 0.78]);
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const b = cc.clone().add(V(Math.sin(a) * 0.065 * H, 0, Math.cos(a) * 0.065 * H));
            const t = b.clone().add(V(Math.sin(a) * 0.02 * H + (i % 2 ? 0.01 : -0.01) * H, 0.06 * H, Math.cos(a) * 0.02 * H));
            s.hard('head', tubeGeo([b, t], () => 0.004 * H, 4), 'metal', [0.75, 0.75, 0.78]);
            s.hard('head', ballGeo(t, 0.012 * H, 0).scale(1, 1.4, 0.5), 'metal', [0.8, 0.8, 0.82]);
          }
          // The shield-sled, dented, a painted crown on it.
          shield(s, H, { h: 0.6, w: 0.25, col: [0.4, 0.38, 0.36], boss: GOLD, tower: true });
          // Bottle caps and buttons sewn on as medals.
          for (let i = 0; i < 5; i++) s.hard('chest', ballGeo(s.j('chest').add(V((i - 2) * 0.03 * H, 0.04 * H - Math.abs(i - 2) * 0.01 * H, 0.09 * H)), 0.01 * H, 0), 'metal', i % 2 ? GOLD : [0.6, 0.6, 0.62]);
        },
        style: { heavy: 0.2, attacks: ['swing', 'slam', 'lunge'], armed: 'one', idle: 'jitter', gait: 'scuttle' },
      }),
    ),

  // Vaskel the Glazier: a gaunt man in a leather apron with a cutter, panes
  // of leaded glass strapped to his back like wings.
  vaskel_glazier: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.9,
        build: 'thin',
        skin: 0xb8a898,
        cloth: 0x4a3a2c,
        clothSurface: 'leather',
        robe: 0.55,
        tunic: 2,
        weapon: 'dagger',
        weaponSize: 1.1,
        weaponGlow: 0.6,
        metal: 0x9ab8c8,
        metalSurface: 'crystal',
        extra: (s, H) => {
          // Goggles pushed up on the brow, thick glass lenses.
          const h = s.j('head');
          s.pair((_side, x) => {
            const g = h.clone().add(V(x * 0.025 * H, 0.04 * H, 0.055 * H));
            s.hard('head', ringGeo(g, 0.018 * H, 0.004 * H, V(0, 0.3, 1), 12), 'alt', BRASS);
            s.hard('head', ballGeo(g, 0.016 * H, 1).scale(1, 1, 0.4), 'metal', GLASS, 0.4);
          });
          // Leaded panes fanned on his back.
          const bk = s.j('chest').add(V(0, 0.04 * H, -0.1 * H));
          for (let i = 0; i < 5; i++) {
            const a = (i / 4 - 0.5) * 1.6;
            const p = bk.clone().add(V(Math.sin(a) * 0.14 * H, 0.1 * H + Math.cos(a) * 0.06 * H, -0.02 * H - Math.abs(a) * 0.03 * H));
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, -a * 0.6));
            s.hard('chest', boxGeo(p, V(0.09 * H, 0.16 * H, 0.004 * H), q), 'metal', GLASS, 0.25);
            s.hard('chest', boxGeo(p.clone().add(V(0, 0, -0.003 * H)), V(0.1 * H, 0.17 * H, 0.002 * H), q), 'alt', [0.2, 0.2, 0.22]);
          }
          // Shards stuck in the apron.
          const r = seq(41);
          for (let i = 0; i < 5; i++) {
            const p = s.j('hips').add(V((r() - 0.5) * 0.14 * H, -r() * 0.12 * H, 0.07 * H));
            s.hard('hips', spikeGeo(p, p.clone().add(V((r() - 0.5) * 0.03 * H, 0.04 * H, 0.02 * H)), 0.008 * H, 3, undefined, 1), 'metal', GLASS, 0.3);
          }
        },
        style: { heavy: 0.15, attacks: ['thrust', 'swing', 'hurl'], armed: 'one', idle: 'still', gait: 'stalk' },
      }),
    ),

  // Holloway Stair: a staircase that stood up. Its body is a stack of worn
  // steps, its knees are landings, a newel post for a head.
  holloway_stair: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'giant',
        rig: { shoulders: 0.2, hips: 0.09, arms: 1.25, hunch: 0.3, head: 0.6, armOut: 0.3 },
        skin: { surface: 'stone', tint: 0x8a8070 },
        alt: { surface: 'stone', tint: 0x5a544a },
        metal: { surface: 'iron', tint: 0x4a4440 },
        sculpt: (s, H) => {
          // The trunk is steps stacked and twisted round.
          for (let i = 0; i < 7; i++) {
            const t = i / 6;
            const p = lerpV(s.j('hips'), s.j('chest'), t).add(V(0, 0.04 * H, 0));
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 0.35, 0));
            s.hard(t < 0.5 ? 'spine' : 'chest', boxGeo(p, V((0.24 + t * 0.08) * H, 0.05 * H, 0.12 * H), q), i % 2 ? 'skin' : 'alt');
          }
          // Shoulders: two landings with broken balusters.
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`);
            s.box(`arm${side}`, sh.clone().add(V(x * 0.02 * H, 0.03 * H, 0)), V(0.08 * H, 0.03 * H, 0.08 * H), { k: 0.004 * H });
            for (let i = 0; i < 3; i++) s.hard(`arm${side}`, tubeGeo([sh.clone().add(V(x * (0.02 + i * 0.03) * H, 0.06 * H, 0.06 * H)), sh.clone().add(V(x * (0.02 + i * 0.03) * H, (0.12 - i * 0.02) * H, 0.06 * H))], () => 0.01 * H, 5), 'alt');
          });
          // Limbs of stepped stone, each joint a landing.
          s.pair((side) => {
            for (const [a, b, r] of [[`arm${side}`, `fore${side}`, 0.05], [`fore${side}`, `hand${side}`, 0.055], [`leg${side}`, `shin${side}`, 0.065], [`shin${side}`, `foot${side}`, 0.07]] as const) {
              const pa = s.j(a);
              const pb = s.j(b);
              for (let i = 0; i < 3; i++) {
                const p = lerpV(pa, pb, (i + 0.5) / 3);
                s.hard(a, boxGeo(p, V(r * H * (1.1 - i * 0.1), pa.distanceTo(pb) * 0.18, r * H)), i % 2 ? 'alt' : 'skin');
              }
              s.box(b, pb, V(r * H * 1.25, 0.02 * H, r * H * 1.25), { mat: 'alt', k: 0.004 * H });
            }
            s.box(`hand${side}`, s.j(`hand${side}`).add(V(0, -0.04 * H, 0.01 * H)), V(0.06 * H, 0.06 * H, 0.05 * H), { k: 0.008 * H });
          });
          // The head: a newel post with a carved cap, a lamp-niche for a face.
          const h = s.j('head');
          s.box('head', h, V(0.05 * H, 0.08 * H, 0.05 * H), { k: 0.004 * H });
          s.box('head', h.clone().add(V(0, 0.085 * H, 0)), V(0.065 * H, 0.015 * H, 0.065 * H), { mat: 'alt', k: 0.003 * H });
          s.hard('head', ballGeo(h.clone().add(V(0, 0.115 * H, 0)), 0.03 * H, 1), 'alt');
          s.box('head', h.clone().add(V(0, 0.01 * H, 0.04 * H)), V(0.025 * H, 0.03 * H, 0.02 * H), { sub: true, k: 0.003 * H });
          s.boil('head', h.clone().add(V(0, 0.01 * H, 0.035 * H)), 0.014 * H, 1, [1.2, 0.85, 0.45]);
          // An iron handrail spiralling up its back.
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 12; i++) {
            const a = i * 0.55;
            pts.push(lerpV(s.j('hips'), s.j('chest'), i / 12).add(V(Math.sin(a) * 0.16 * H, 0.06 * H, -0.1 * H + Math.cos(a) * 0.04 * H)));
          }
          s.hard('chest', tubeGeo(pts, () => 0.008 * H, 5), 'metal');
        },
        lumps: { amp: 0.006, scale: 8 },
        style: { heavy: 0.95, attacks: ['slam', 'stomp', 'swing'], idle: 'still', gait: 'lumber', spawn: 'assemble', death: 'scatter' },
      }),
    ),

  // Duchess Imeris: a lady in a drowned ballgown, the skirts heavy with
  // water, a lace collar, a long rapier and a hand held behind her back.
  duchess_imeris: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 1.85,
        build: 'thin',
        skin: 0xc0c8c8,
        cloth: 0x3a2a48,
        robe: 1.0,
        tunic: 2,
        belt: 0,
        weapon: 'sword',
        weaponSize: 1.15,
        steel: [0.8, 0.82, 0.85],
        metal: 0xd0c8b0,
        metalSurface: 'gold',
        extra: (s, H) => {
          // A wide bell of a skirt.
          const hp = s.j('hips');
          for (let i = 0; i < 3; i++) s.ball('hips', hp.clone().add(V(0, -0.12 * H - i * 0.12 * H, 0)), V((0.12 + i * 0.04) * H, 0.08 * H, (0.11 + i * 0.035) * H), { mat: 'alt', k: 0.04 * H });
          // A standing lace collar and a pearl choker.
          const n = s.j('neck');
          for (let i = 0; i < 9; i++) {
            const a = (i / 8 - 0.5) * 3;
            const p = n.clone().add(V(Math.sin(a) * 0.05 * H, -0.01 * H, Math.cos(a) * 0.04 * H - 0.01 * H));
            s.hard('chest', spikeGeo(p, p.clone().add(V(Math.sin(a) * 0.03 * H, 0.06 * H, Math.cos(a) * 0.01 * H - 0.02 * H)), 0.014 * H, 3, undefined, 1), 'metal', [0.92, 0.9, 0.85]);
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            s.hard('chest', ballGeo(n.clone().add(V(Math.sin(a) * 0.028 * H, 0.01 * H, Math.cos(a) * 0.028 * H)), 0.005 * H, 0), 'metal', [1, 0.98, 0.92]);
          }
          // Hair piled high and pinned, a drowned flower in it.
          const h = s.j('head');
          s.ball('head', h.clone().add(V(0, 0.07 * H, -0.02 * H)), V(0.045 * H, 0.05 * H, 0.045 * H), { mat: 'alt', k: 0.01 * H });
          s.boil('head', h.clone().add(V(0.03 * H, 0.08 * H, 0.01 * H)), 0.012 * H, 0.6, [0.6, 0.85, 0.9]);
          // Barnacles on the hem.
          const r = seq(73);
          for (let i = 0; i < 9; i++) {
            const a = r() * Math.PI * 2;
            s.hard('hips', ballGeo(hp.clone().add(V(Math.sin(a) * 0.18 * H, -0.4 * H + r() * 0.1 * H, Math.cos(a) * 0.17 * H)), 0.01 * H, 0), 'metal', [0.75, 0.72, 0.65]);
          }
        },
        style: { heavy: 0.1, attacks: ['thrust', 'thrust', 'swing'], armed: 'one', idle: 'still', gait: 'stalk' },
      }),
    ),

  // The Tallow Shepherd: a tall herdsman in a cloak of melted wax, a crook
  // in his hand, the faces of sheep pressed into the cloak.
  tallow_shepherd: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 2.0,
        build: 'normal',
        hunch: 0.15,
        skin: 0xd8c8a8,
        cloth: 0xe0d0a8,
        clothSurface: 'stone',
        robe: 0.9,
        hood: true,
        tunic: 2,
        cape: 1.0,
        weapon: 'staff',
        weaponSize: 1.3,
        weaponGlow: 0.3,
        extra: (s, H) => {
          // The crook's hook at the top of the staff.
          const hr = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
          const top = hr.clone().addScaledVector(V(0, 0.36, 0.93).normalize(), 0.7 * H);
          s.hard('handR', tubeGeo([top, top.clone().add(V(0, 0.06 * H, 0.03 * H)), top.clone().add(V(0, 0.07 * H, 0.09 * H)), top.clone().add(V(0, 0.02 * H, 0.1 * H))], () => 0.009 * H, 5), 'alt', [0.45, 0.35, 0.25]);
          // Sheep faces pressed into the waxen cloak.
          const bk = s.j('chest').add(V(0, -0.1 * H, -0.11 * H));
          for (let i = 0; i < 5; i++) {
            const p = bk.clone().add(V((i - 2) * 0.06 * H, -Math.abs(i - 2) * 0.05 * H - (i % 2) * 0.08 * H, -0.01 * H));
            s.ball('chest', p, V(0.025 * H, 0.03 * H, 0.02 * H), { mat: 'alt', k: 0.01 * H });
            s.pair((_side, x) => s.eye('chest', p.clone().add(V(x * 0.01 * H, 0.008 * H, -0.015 * H)), 0.004 * H, 0.6));
          }
          // Wax running from the hood and shoulders, a few wicks still lit.
          waxDrips(s, 'head', s.j('head').add(V(0, 0.05 * H, 0)), 7, 0.1 * H, 0.06 * H, 17);
          s.pair((side, x) => candle(s, `arm${side}`, s.j(`arm${side}`).add(V(x * 0.02 * H, 0.05 * H, -0.02 * H)), 0.03 * H, 0.008 * H));
          // A bell on a cord at his throat.
          s.hard('chest', ballGeo(s.j('neck').add(V(0, -0.04 * H, 0.06 * H)), 0.016 * H, 1).scale(1, 1.2, 1), 'metal', BRASS);
        },
        style: { heavy: 0.3, attacks: ['swing', 'thrust', 'hurl'], armed: 'staff', castBoth: true, idle: 'sway', gait: 'walk' },
      }),
    ),

  // The Brass Abbot: a clockwork priest, a clock face for a face, a brass
  // cassock of overlapping plates, a censer swinging on a chain.
  brass_abbot: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'biped',
        rig: { shoulders: 0.15, hips: 0.07, arms: 1.05, hunch: 0.05, head: 1.1 },
        skin: { surface: 'brass', tint: 0xb89048 },
        alt: { surface: 'iron', tint: 0x3a3430 },
        metal: { surface: 'gold', tint: 0xe0c070 },
        sculpt: (s, H) => {
          const ch = s.j('chest');
          s.ball('chest', ch, V(0.11 * H, 0.1 * H, 0.08 * H), { k: 0.008 * H });
          s.ball('spine', s.j('spine'), V(0.08 * H, 0.08 * H, 0.06 * H), { mat: 'alt', k: 0.008 * H });
          // The cassock: overlapping plates to the floor.
          for (let r = 0; r < 4; r++) {
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2;
              const y = -0.02 * H - r * 0.11 * H;
              const rad = (0.1 + r * 0.025) * H;
              const p = s.j('hips').add(V(Math.sin(a) * rad, y, Math.cos(a) * rad * 0.85));
              const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, a, 0));
              s.hard('hips', boxGeo(p, V(0.07 * H, 0.12 * H, 0.008 * H), q), r % 2 ? 'skin' : 'metal');
            }
          }
          // A gear set in the breast, and a chain of office.
          gear(s, 'chest', ch.clone().add(V(0, 0.01 * H, 0.08 * H)), 0.04 * H, V(0, 0, 1), 12, GOLD, 'metal', 0.4);
          chain(s, 'chest', s.j('neck').add(V(-0.07 * H, -0.01 * H, 0.02 * H)), ch.clone().add(V(0, -0.04 * H, 0.09 * H)), 0.01 * H, GOLD);
          chain(s, 'chest', s.j('neck').add(V(0.07 * H, -0.01 * H, 0.02 * H)), ch.clone().add(V(0, -0.04 * H, 0.09 * H)), 0.01 * H, GOLD);
          // The head: a clock face under a cowl, both hands at the same hour.
          const h = s.j('head');
          s.ball('head', h.clone().add(V(0, 0.02 * H, -0.02 * H)), V(0.08 * H, 0.09 * H, 0.07 * H), { mat: 'alt', k: 0.01 * H });
          const f = h.clone().add(V(0, 0.01 * H, 0.05 * H));
          s.hard('head', ballGeo(f, 0.058 * H, 2).scale(1, 1, 0.25), 'metal', [0.95, 0.92, 0.82], 0.25);
          s.hard('head', ringGeo(f, 0.06 * H, 0.007 * H, V(0, 0, 1), 20), 'skin');
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            s.hard('head', ballGeo(f.clone().add(V(Math.sin(a) * 0.048 * H, Math.cos(a) * 0.048 * H, 0.008 * H)), 0.004 * H, 0), 'alt', DARK);
          }
          s.hard('head', spikeGeo(f.clone().add(V(0, 0, 0.012 * H)), f.clone().add(V(0.0, 0.045 * H, 0.012 * H)), 0.004 * H, 3, undefined, 1), 'alt', DARK);
          s.hard('head', spikeGeo(f.clone().add(V(0, 0, 0.014 * H)), f.clone().add(V(0.0, 0.03 * H, 0.014 * H)), 0.005 * H, 3, undefined, 1), 'alt', DARK);
          // Arms in brass sleeves; a censer on a chain in the right hand.
          s.pair((side) => {
            s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.035 * H, 0.04 * H, { k: 0.006 * H });
            s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.04 * H, 0.05 * H, { k: 0.006 * H });
            s.ball(`hand${side}`, s.j(`hand${side}`), 0.025 * H, { mat: 'alt' });
            s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.04 * H, 0.035 * H, { mat: 'alt' });
            s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.035 * H, 0.03 * H, { mat: 'alt' });
          });
          const hr = s.j('handR');
          const cz = hr.clone().add(V(0, -0.22 * H, 0.04 * H));
          chain(s, 'handR', hr, cz.clone().add(V(0, 0.03 * H, 0)), 0.008 * H, GOLD);
          s.hard('handR', ballGeo(cz, 0.035 * H, 1), 'metal', GOLD);
          s.boil('handR', cz.clone().add(V(0, 0.01 * H, 0.02 * H)), 0.012 * H, 1, [1.2, 0.9, 0.5]);
          // A bell-tower crest on its back.
          const bt = ch.clone().add(V(0, 0.12 * H, -0.08 * H));
          s.box('chest', bt, V(0.04 * H, 0.07 * H, 0.03 * H), { mat: 'alt', k: 0.004 * H });
          s.hard('chest', spikeGeo(bt.clone().add(V(0, 0.07 * H, 0)), bt.clone().add(V(0, 0.16 * H, 0)), 0.04 * H, 4, undefined, 1), 'skin');
        },
        style: { heavy: 0.5, attacks: ['swing', 'slam', 'lash'], idle: 'still', gait: 'march', spawn: 'assemble', death: 'topple' },
      }),
    ),

  // Gaellach the Saltwyrm: a long eel-dragon crusted white with salt, fins
  // like torn sails, its eyes black and wet.
  gaellach_saltwyrm: (c) =>
    asBoss(
      c,
      serpentLook(c, {
        length: 5.0,
        girth: 0.38,
        front: 5,
        rear: 7,
        rise: 1.3,
        head: 0.09,
        surface: 'scale',
        tier: 'big',
        sculpt: (s) => {
          serpentBody(s, { girth: 0.38 });
          serpentHead(s, { w: 0.34, teeth: 5, crest: 0.6, glow: 0.5 });
          crust(s, ['body', 'f1', 'f2', 'f3', 'f4', 't1', 't2', 't3', 't4', 't5'], 60, 0.07, 29, [0.95, 0.93, 0.88], 0.33);
          // Ragged fins down the back.
          for (const b of ['f2', 'f3', 'body', 't1', 't2', 't3']) {
            if (!s.has(b)) continue;
            const p = s.j(b).add(V(0, 0.34, 0));
            s.hard(b, spikeGeo(p, p.clone().add(V(0, 0.3, -0.25)), 0.12, 3, undefined, 2), 'alt');
          }
        },
        style: { heavy: 0.6, attacks: ['bite', 'lash', 'slam'], idle: 'sway', gait: 'slither', spawn: 'emerge', death: 'coil' },
      }),
    ),
};

// ---------------------------------------------------------------------------
// Partners and flocks
// ---------------------------------------------------------------------------

export const BOSS_C_KIN: Record<string, LookFactory> = {
  // The high voice of the choir: thin, veiled, its mouth a lit O.
  choir_high_voice: (c) => specterLook(c, { choir: true, veil: true, mouth: 1.5, height: 1.75 }),

  // Orrin Sallow: Ebb's brother, the one with the dripping staff.
  sallow_orrin: (c) =>
    manLook(c, {
      height: 1.95,
      build: 'thin',
      skin: 0xc8d0c0,
      cloth: 0x2e3e34,
      robe: 0.8,
      hood: true,
      tunic: 2,
      weapon: 'staff',
      weaponGlow: 1.2,
      extra: (s, H) => {
        const hr = lerpV(s.j('handR'), s.j('handRTip'), 0.55);
        const top = hr.clone().addScaledVector(V(0, 0.36, 0.93).normalize(), 0.6 * H);
        for (let i = 0; i < 4; i++) s.hard('handR', tubeGeo([top.clone().add(V((i - 1.5) * 0.01 * H, 0, 0)), top.clone().add(V((i - 1.5) * 0.012 * H, -0.06 * H - i * 0.01 * H, 0))], (t) => (0.004 - 0.002 * t) * H, 3, true), 'alt', [0.4, 0.75, 0.55], 0.5);
        s.hard('chest', ringGeo(s.j('chest').add(V(0, 0.03 * H, 0)), 0.11 * H, 0.008 * H, V(-0.5, 0.2, 0).normalize(), 18), 'alt', [0.6, 0.5, 0.35]);
      },
      style: { heavy: 0.2, attacks: ['hurl', 'swing'], armed: 'staff', castBoth: true, ranged: true, idle: 'breathe', gait: 'stalk' },
    }),

  // The slag cantor: a hunched furnace-man of cooling slag, its mouth a grate.
  slag_cantor: (c) =>
    walkLook(c, {
      height: 1.9,
      kind: 'brute',
      rig: { hunch: 0.3, shoulders: 0.17, arms: 1.15, head: 0.8 },
      skin: { surface: 'basalt', tint: 0x4a3a34 },
      alt: { surface: 'lava', tint: 0xff6020 },
      metal: { surface: 'iron', tint: 0x3a3430 },
      sculpt: (s, H) => {
        const ch = s.j('chest');
        s.ball('chest', ch, V(0.13 * H, 0.11 * H, 0.1 * H), { k: 0.02 * H });
        s.ball('spine', s.j('spine'), V(0.1 * H, 0.08 * H, 0.08 * H), { k: 0.02 * H });
        s.ball('hips', s.j('hips'), V(0.09 * H, 0.06 * H, 0.07 * H), { k: 0.02 * H });
        s.pair((side) => {
          s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.045 * H, 0.04 * H, { k: 0.01 * H });
          s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.045 * H, 0.055 * H, { k: 0.01 * H });
          s.ball(`hand${side}`, s.j(`hand${side}`), 0.05 * H, { k: 0.01 * H });
          s.limb(`leg${side}`, s.j(`leg${side}`), s.j(`shin${side}`), 0.05 * H, 0.045 * H, { k: 0.01 * H });
          s.limb(`shin${side}`, s.j(`shin${side}`), s.j(`foot${side}`), 0.045 * H, 0.05 * H, { k: 0.01 * H });
        });
        const h = s.j('head');
        s.ball('head', h, V(0.065 * H, 0.06 * H, 0.065 * H), { k: 0.01 * H });
        grille(s, 'head', h.clone().add(V(0, -0.01 * H, 0.06 * H)), 0.04 * H, 0.03 * H, 4);
        fire(s, 'chest', ch.clone().add(V(0, 0.1 * H, -0.04 * H)), 4, 0.1 * H, 0.04 * H, 621);
        const r = seq(19);
        for (let i = 0; i < 8; i++) s.glow(ch.clone().add(V((r() - 0.5) * 0.2 * H, (r() - 0.5) * 0.2 * H, 0.09 * H)), 0.015 * H, 0.6, [1.4, 0.5, 0.15]);
      },
      style: { heavy: 0.55, attacks: ['slam', 'hurl', 'swing'], idle: 'breathe', gait: 'lumber', spawn: 'emerge', death: 'collapse' },
    }),

  // A tallow sheep: a small waxen ewe, a wick burning in its fleece.
  tallow_sheep: (c) =>
    quadLook(c, {
      size: 1.2,
      withers: 0.5,
      length: 0.6,
      width: 0.16,
      neck: 0.2,
      neckRise: 0.2,
      head: 0.45,
      tail: 2,
      tailLen: 0.15,
      girth: 0.2,
      chest: 0.2,
      legR: 0.03,
      paws: 'hoof',
      surface: 'flesh',
      tint: 0xe8dcc0,
      head2: (s) => {
        const h = s.j('head');
        const sn = s.j('snout');
        s.ball('head', h, V(0.08, 0.08, 0.09), { k: 0.02 });
        s.limb('head', h, sn, 0.07, 0.045, { k: 0.02 });
        s.pair((_side, x) => {
          s.eye('head', h.clone().add(V(x * 0.06, 0.03, 0.05)), 0.012, 0.8);
          s.hard('head', ballGeo(h.clone().add(V(x * 0.09, 0.02, -0.02)), 0.035, 1).scale(1, 0.4, 0.8), 'skin');
        });
      },
      extra: (s) => {
        // Fleece of lumpy wax, and a lit wick on its back.
        const r = seq(37);
        for (let i = 0; i < 12; i++) s.ball(i % 2 ? 'spine' : 'chest', lerpV(s.j('hips'), s.j('chest'), r()).add(V((r() - 0.5) * 0.25, 0.12 + r() * 0.06, 0)), 0.07, { k: 0.03 });
        candle(s, 'spine', s.j('spine').add(V(0, 0.22, 0)), 0.04, 0.008);
      },
      lumps: { amp: 0.006, scale: 18 },
      style: { heavy: 0.1, attacks: ['bite', 'lunge'], idle: 'jitter', gait: 'scuttle', stride: 1.5, death: 'flop' },
    }),

  // A wax child: a little figure poured from chapel candles, a wick for hair.
  wax_child: (c) =>
    manLook(c, {
      height: 1.05,
      build: 'thin',
      head: 'bald',
      skin: 0xe8dcc0,
      skinSurface: 'stone',
      tunic: 0,
      extra: (s, H) => {
        candle(s, 'head', s.j('head').add(V(0, 0.08 * H, 0)), 0.03 * H, 0.008 * H);
        waxDrips(s, 'head', s.j('head').add(V(0, 0.06 * H, 0)), 6, 0.08 * H, 0.05 * H, 3);
        s.paint.skin = { grime: 0.2, ao: 0.8, mottle: { scale: 5, amount: 0.2, col: [1.0, 0.92, 0.75] } };
      },
      style: { heavy: 0.05, attacks: ['claw', 'lunge'], armed: 'none', idle: 'jitter', gait: 'walk', death: 'collapse' },
    }),
};
