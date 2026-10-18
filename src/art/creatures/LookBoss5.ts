/**
 * SLAY — bosses, part five: the six deep bosses (data/bosses3.ts).
 * Mother Wickwane, the Glasswright, Marshal Harrow, the Holdfast, the Usher
 * and the Sleeper's Hand. Each is drawn from its family's parts (wax and
 * candles, Spire glass, a delver's bones) and grown into something larger.
 */
import * as THREE from 'three';
import type { LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, ovalGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, lerpV, seq } from './Kit';
import { manLook } from './LookHumanoid';
import { specterLook } from './LookUndead';
import { botLook, grille, mechArms, mechLegs, rivets } from './LookConstruct';
import { crystals, facet, fire, prism, walkLook } from './LookElemental';
import { blobLook, eyeball } from './LookAberration';
import { apron, candleCrown, champion, grip, housemother, nails, roundShield, stayed } from './LookDeep';
import { asBoss, chain } from './LookBoss';

const IRON: RGB = [0.3, 0.3, 0.33];
const BRASS: RGB = [0.72, 0.56, 0.3];
const LEAD: RGB = [0.16, 0.16, 0.19];
const PANE: RGB = [0.7, 0.84, 0.95];
const LIGHT: RGB = [0.85, 1.25, 1.45];
const FLAME: RGB = [1.45, 0.85, 0.35];
const COLD: RGB = [0.6, 0.85, 1.3];
const DUSK: RGB = [0.9, 0.7, 1.4];
const ROSE: RGB = [1.4, 0.6, 1.0];

/** A candlestick with `n` arms held at `p`, every candle lit. */
function candelabra(s: Sculpt, bone: string, p: THREE.Vector3, H: number, n: number, seed: number): void {
  s.hard(bone, tubeGeo([p.clone().add(V(0, -0.12 * H, 0)), p.clone().add(V(0, 0.06 * H, 0))], () => 0.01 * H, 6), 'metal', BRASS);
  s.hard(bone, ballGeo(p.clone().add(V(0, -0.12 * H, 0)), 0.02 * H, 1), 'metal', BRASS);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * 0.16 * H;
    const top = p.clone().add(V(x, 0.07 * H + (i === (n - 1) / 2 ? 0.02 * H : 0), 0));
    s.hard(bone, tubeGeo([p.clone().add(V(0, 0.04 * H, 0)), p.clone().add(V(x, 0.05 * H, 0)), top], () => 0.005 * H, 4), 'metal', BRASS);
    s.limb(bone, top, top.clone().add(V(0, 0.04 * H, 0)), 0.008 * H, 0.007 * H, { mat: 'skin', k: 0.003 * H });
    fire(s, bone, top.clone().add(V(0, 0.05 * H, 0)), 3, 0.03 * H, 0.004 * H, seed + i, FLAME, 0.1);
  }
  s.glow(p.clone().add(V(0, 0.1 * H, 0)), 0.1 * H, 0.6, FLAME);
}

/** A strip of lead between two points: the dark lines between glass panes. */
function lead(s: Sculpt, bone: string, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  s.hard(bone, tubeGeo([a, b], () => r, 4), 'alt', LEAD);
}

/** A leaded pane, flat, standing at `c` facing `n`. */
function pane(s: Sculpt, bone: string, c: THREE.Vector3, w: number, h: number, n: THREE.Vector3, glow: number): void {
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n.clone().normalize());
  s.hard(bone, boxGeo(c, V(w, h, w * 0.04), q), 'skin', PANE, glow);
  const up = V(0, 1, 0).applyQuaternion(q);
  const side = V(1, 0, 0).applyQuaternion(q);
  const r = w * 0.03;
  for (const sx of [-1, 1]) lead(s, bone, c.clone().addScaledVector(side, (sx * w) / 2).addScaledVector(up, -h / 2), c.clone().addScaledVector(side, (sx * w) / 2).addScaledVector(up, h / 2), r);
  for (const sy of [-1, 0, 1]) lead(s, bone, c.clone().addScaledVector(up, (sy * h) / 2).addScaledVector(side, -w / 2), c.clone().addScaledVector(up, (sy * h) / 2).addScaledVector(side, w / 2), r);
}

/** The Glasswright's body: leaded facets for a trunk, prisms for limbs. */
function glasswright(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  const hp = s.j('hips');
  facet(s, 'chest', ch.clone().add(V(0, 0.01 * H, 0)), V(0.09 * H, 0.09 * H, 0.055 * H), 901);
  facet(s, 'spine', s.j('spine'), V(0.055 * H, 0.06 * H, 0.045 * H), 903);
  facet(s, 'hips', hp.clone().add(V(0, 0.01 * H, 0)), V(0.07 * H, 0.05 * H, 0.05 * H), 905);
  // Lead lines across the chest, like the cames of a window.
  for (let i = -1; i <= 1; i++) lead(s, 'chest', ch.clone().add(V(-0.09 * H, i * 0.05 * H, 0.06 * H)), ch.clone().add(V(0.09 * H, i * 0.05 * H + 0.01 * H, 0.06 * H)), 0.004 * H);
  lead(s, 'chest', ch.clone().add(V(0, 0.09 * H, 0.065 * H)), ch.clone().add(V(0, -0.08 * H, 0.06 * H)), 0.004 * H);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    const e = s.j(`fore${side}`);
    const w = s.j(`hand${side}`);
    prism(s, `arm${side}`, lerpV(a, e, 0.05), lerpV(a, e, 0.95), 0.022 * H, 0.02 * H);
    prism(s, `fore${side}`, lerpV(e, w, 0.05), lerpV(e, w, 0.95), 0.02 * H, 0.018 * H);
    const l = s.j(`leg${side}`);
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    prism(s, `leg${side}`, lerpV(l, k, 0.05), lerpV(l, k, 0.95), 0.03 * H, 0.028 * H);
    prism(s, `shin${side}`, lerpV(k, f, 0.05), lerpV(k, f, 0.95), 0.026 * H, 0.024 * H);
    s.box(`foot${side}`, lerpV(f, s.j(`toe${side}`), 0.5), V(0.024 * H, 0.014 * H, 0.055 * H), { k: 0.003 * H, round: 0.003 * H });
    s.boil(`fore${side}`, e, 0.014 * H, 0.9, LIGHT);
    s.boil(`shin${side}`, k, 0.016 * H, 0.9, LIGHT);
    // Two panes on the back stand out like folded wings: these are what break.
    const back = ch.clone().add(V(x * 0.12 * H, 0.08 * H, -0.09 * H));
    pane(s, 'chest', back, 0.16 * H, 0.32 * H, V(x * 0.5, 0, -1), 0.4);
    nails(s, `arm${side}`, a.clone().add(V(x * 0.02 * H, 0.03 * H, 0)), 3, 0.12 * H, 0.009 * H, 907 + x);
  });
  // The rule in the right hand: a long straightedge of glass, ground sharp.
  const at = grip(s, 0.9 * H);
  s.hard('handR', tubeGeo([at(-0.12), at(0.04)], () => 0.011 * H, 5), 'alt', LEAD);
  s.hard('handR', boxGeo(at(0.4), V(0.012 * H, 0.05 * H, 0.7 * H), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), at(1).sub(at(0)).normalize())), 'skin', PANE, 0.5);
  for (let i = 1; i <= 6; i++) s.hard('handR', boxGeo(at(0.1 * i), V(0.014 * H, 0.004 * H, 0.004 * H)), 'alt', LEAD);
  // A diamond cutter in the left, and a lens for a face.
  s.hard('handL', spikeGeo(s.j('handL'), s.j('handLTip').add(V(0, -0.04 * H, 0.03 * H)), 0.012 * H, 4, undefined, 1), 'skin', [1.0, 1.0, 1.1], 0.8);
  const h = s.j('head').add(V(0, 0.03 * H, 0.01 * H));
  facet(s, 'head', h, V(0.045 * H, 0.06 * H, 0.04 * H), 911);
  s.hard('head', ringGeo(h.clone().add(V(0, 0, 0.042 * H)), 0.032 * H, 0.006 * H, V(0, 0, 1), 16), 'alt', LEAD);
  s.eye('head', h.clone().add(V(0, 0, 0.045 * H)), 0.026 * H, 1.8);
  crystals(s, 'head', h.clone().add(V(0, 0.05 * H, -0.01 * H)), 5, 0.12 * H, 0.012 * H, 913, V(0, 1, -0.3), 0.5, 'skin', PANE, 0.5);
  s.boil('chest', ch.clone().add(V(0, 0, 0.05 * H)), 0.03 * H, 1, LIGHT);
}

/** The Holdfast: an iron engine bolted to a plate, chains running down from its fists. */
function holdfast(s: Sculpt, H: number): void {
  const { trunk } = HOLD;
  trunk(s);
  const ch = s.j('chest');
  grille(s, 'chest', ch.clone().add(V(0, -0.02 * H, 0.17 * H)), 0.08 * H, 0.06 * H, 6);
  for (let i = 0; i < 4; i++) rivets(s, 'chest', ch.clone().add(V(-0.17 * H, 0.1 * H - i * 0.06 * H, 0.11 * H)), ch.clone().add(V(0.17 * H, 0.1 * H - i * 0.06 * H, 0.11 * H)), 10, 0.009 * H);
  mechArms(s, { r: 0.055, mat: 'skin', joint: 'alt', hand: 'fist', handK: 1.7 });
  mechLegs(s, { r: 0.07, mat: 'skin', joint: 'alt', footW: 0.09 });
  // Its head is a great bolt-head, sunk between the shoulders, one furnace eye.
  const h = s.j('head').add(V(0, 0.02 * H, 0.03 * H));
  s.hard('head', ringGeo(h, 0.07 * H, 0.025 * H, V(0, 0.15, 1).normalize(), 6), 'skin');
  s.box('head', h, V(0.055 * H, 0.05 * H, 0.05 * H), { k: 0.005 * H, round: 0.01 * H });
  s.eye('head', h.clone().add(V(0, 0, 0.05 * H)), 0.024 * H, 2);
  // A nail of Spire glass driven down through its back, the top still showing.
  const back = ch.clone().add(V(0, 0.1 * H, -0.12 * H));
  s.hard('chest', spikeGeo(back.clone().add(V(0, 0.4 * H, -0.04 * H)), back.clone().add(V(0, -0.25 * H, 0.04 * H)), 0.05 * H, 4, undefined, 1), 'metal', PANE, 0.6);
  s.hard('chest', ringGeo(back.clone().add(V(0, 0.4 * H, -0.04 * H)), 0.08 * H, 0.025 * H, V(0, 1, 0), 6), 'metal', PANE, 0.4);
  // Chains from each wrist down to the floor, where the bolts were.
  s.pair((side, x) => {
    const w = s.j(`hand${side}`);
    s.hard(`hand${side}`, ringGeo(lerpV(s.j(`fore${side}`), w, 0.8), 0.05 * H, 0.014 * H, s.j(`fore${side}`).sub(w).normalize(), 12), 'metal', IRON);
    chain(s, `hand${side}`, lerpV(s.j(`fore${side}`), w, 0.8), w.clone().add(V(x * 0.1 * H, -0.42 * H, 0.08 * H)), 0.012 * H, IRON);
    s.pair((_s2, y) => s.hard('chest', boxGeo(s.j(`arm${side}`).add(V(x * 0.05 * H, 0.06 * H, y * 0.05 * H)), V(0.02 * H, 0.03 * H, 0.02 * H)), 'alt', BRASS));
  });
  // Orders stamped on its chest plate, glowing where the furnace shows through.
  const rnd = seq(931);
  for (let i = 0; i < 12; i++) s.glow(ch.clone().add(V((rnd() - 0.5) * 0.24 * H, 0.06 * H + (rnd() - 0.5) * 0.06 * H, 0.13 * H)), 0.006 * H, 0.9, FLAME);
}

const HOLD = {
  trunk(s: Sculpt): void {
    const H = s.rig.height;
    const ch = s.j('chest');
    s.ball('chest', ch, V(0.19 * H, 0.14 * H, 0.14 * H), { k: 0.02 * H });
    s.ball('spine', s.j('spine'), V(0.13 * H, 0.08 * H, 0.1 * H), { k: 0.02 * H });
    s.ball('hips', s.j('hips'), V(0.12 * H, 0.08 * H, 0.08 * H), { k: 0.02 * H });
    s.pair((side, x) => s.ball(`arm${side}`, s.j(`arm${side}`).add(V(x * 0.02 * H, 0.03 * H, 0)), V(0.09 * H, 0.08 * H, 0.09 * H), { k: 0.01 * H }));
  },
};

/** The Usher's door: a frame on its back, open, with the dark of another room in it. */
function usher(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  const c = ch.clone().add(V(0, 0.05 * H, -0.14 * H));
  const w = 0.2 * H;
  const h = 0.5 * H;
  const posts = [c.clone().add(V(-w / 2, -h / 2, 0)), c.clone().add(V(-w / 2, h / 2, 0)), c.clone().add(V(w / 2, h / 2, 0)), c.clone().add(V(w / 2, -h / 2, 0))];
  s.hard('chest', tubeGeo(posts, () => 0.014 * H, 4), 'metal', [0.3, 0.22, 0.16]);
  s.hard('chest', boxGeo(c.clone().add(V(0, 0, -0.005 * H)), V(w * 0.92, h * 0.96, 0.004 * H)), 'alt', [0.05, 0.03, 0.08], 0.2);
  // Through it, far off, a lit stair going down.
  for (let i = 0; i < 6; i++) s.glow(c.clone().add(V((i - 2.5) * 0.004 * H, -h * 0.35 + i * 0.05 * H, -0.01 * H)), 0.012 * H, 0.5, DUSK);
  // A brass knob, and the door itself swung open beside it.
  s.hard('chest', ballGeo(c.clone().add(V(w * 0.38, -0.02 * H, 0.01 * H)), 0.01 * H, 1), 'metal', BRASS);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -1.1, 0));
  s.hard('chest', boxGeo(c.clone().add(V(-w * 0.8, 0, -0.06 * H)), V(w * 0.9, h * 0.94, 0.012 * H), q), 'metal', [0.3, 0.22, 0.16]);
  // The lamp on its long hook in the right hand.
  const at = grip(s, 0.95 * H);
  s.hard('handR', tubeGeo([at(-0.35), at(0.6)], () => 0.009 * H, 5), 'metal', [0.25, 0.2, 0.18]);
  const hang = at(0.62).add(V(0, -0.12 * H, 0));
  s.hard('handR', tubeGeo([at(0.62), hang], () => 0.003 * H, 3), 'metal', BRASS);
  s.hard('handR', ovalGeo(hang.clone().add(V(0, -0.03 * H, 0)), 0.03 * H, 1, 1, 1.4, 1), 'metal', BRASS);
  s.boil('handR', hang.clone().add(V(0, -0.03 * H, 0)), 0.02 * H, 1.2, DUSK);
  s.glow(hang.clone().add(V(0, -0.03 * H, 0)), 0.1 * H, 0.7, DUSK);
  // A tall collar and a row of buttons: a servant's coat on a thing too long for it.
  s.limb('chest', ch.clone().add(V(-0.06 * H, 0.1 * H, 0.02 * H)), ch.clone().add(V(-0.05 * H, 0.18 * H, -0.01 * H)), 0.02 * H, 0.03 * H, { mat: 'alt' });
  s.limb('chest', ch.clone().add(V(0.06 * H, 0.1 * H, 0.02 * H)), ch.clone().add(V(0.05 * H, 0.18 * H, -0.01 * H)), 0.02 * H, 0.03 * H, { mat: 'alt' });
  for (let i = 0; i < 6; i++) s.hard('chest', ballGeo(ch.clone().add(V(0, 0.08 * H - i * 0.05 * H, 0.105 * H - i * 0.004 * H)), 0.007 * H, 1), 'metal', BRASS);
  // White gloves, much too long in the finger.
  s.pair((side) => s.tint(s.j(`hand${side}`), 0.05 * H, [0.95, 0.93, 0.88], ['skin']));
}

/** The Sleeper's Hand: a palm rising out of the floor, fingers curling up. */
/** A finger: thick, barely tapering, bending more at each joint. */
function finger(s: Sculpt, root: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, curl: THREE.Vector3): void {
  const d = dir.clone().normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(root.clone().addScaledVector(d, len * t).addScaledVector(curl, t * t));
  }
  s.hard('top', tubeGeo(pts, (t) => r * (1 - 0.4 * t), 8, true), 'skin');
}

function sleepersHand(s: Sculpt, H: number, R: number): void {
  // The wrist, coming straight up out of the floor.
  s.limb('body', V(0, -0.05 * H, 0), V(0, 0.36 * H, 0.02 * H), R * 0.52, R * 0.46, { k: R * 0.1 });
  // The palm, upright and turned to you, lines worn into it glowing.
  const palm = V(0, 0.48 * H, 0.03 * H);
  s.ball('top', palm, V(R * 0.74, 0.16 * H, R * 0.3), { k: R * 0.12 });
  const face = palm.z + R * 0.3;
  for (let l = 0; l < 3; l++) {
    for (let i = 0; i <= 10; i++) {
      const a = -1 + (i / 10) * 2;
      s.glow(V(a * R * 0.5, palm.y + (l - 1) * 0.05 * H + Math.sin(a * 2 + l) * 0.015 * H, face - Math.abs(a) * R * 0.08), R * 0.022, 1, ROSE);
    }
  }
  // Four fingers rising from the top of the palm, curling forward to grasp.
  const fingers: Array<[number, number]> = [[-0.5, 0.85], [-0.17, 1.0], [0.17, 1.05], [0.5, 0.75]];
  const digit = (root: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, curl: THREE.Vector3, eye: boolean): void => {
    finger(s, root, dir, len, r, curl);
    // A nail of glass at the tip.
    const tip = root.clone().addScaledVector(dir, len * 0.97).add(curl.clone().multiplyScalar(0.94));
    const along = root.clone().addScaledVector(dir, len).add(curl).sub(tip).normalize();
    s.hard('top', spikeGeo(tip, tip.clone().addScaledVector(along, r * 1.1), r * 0.55, 4, undefined, 1), 'metal', PANE, 0.4);
    // Knuckles: rings of old stone grown round the joints.
    for (const f of [0.35, 0.68]) {
      const at = root.clone().addScaledVector(dir, len * f).add(curl.clone().multiplyScalar(f * f));
      s.hard('top', ringGeo(at, r * (1.05 - 0.3 * f), r * 0.22, dir, 10), 'alt', [0.3, 0.26, 0.3]);
    }
    if (eye) eyeball(s, 'top', root.clone().addScaledVector(dir, len * 0.5).add(curl.clone().multiplyScalar(0.25)).add(V(0, 0, r * 0.85)), r * 0.42, V(0, 0.2, 1), [1.2, 0.5, 0.9], true);
  };
  for (const [x, k] of fingers) {
    const root = V(x * R, palm.y + 0.13 * H, palm.z);
    digit(root, V(x * 0.12, 1, 0.08).normalize(), 0.32 * H * k, R * 0.15, V(0, -0.05 * H * k, 0.2 * H * k), true);
  }
  // The thumb, out to the side and reaching in.
  digit(V(-0.68 * R, palm.y - 0.02 * H, palm.z + 0.04 * H), V(-0.8, 0.55, 0.35).normalize(), 0.22 * H, R * 0.16, V(0.08 * H, 0.02 * H, 0.1 * H), false);
  // An eye in the palm, half open, dreaming.
  eyeball(s, 'top', V(0, palm.y + 0.01 * H, face - R * 0.06), R * 0.17, V(0, 0, 1), [1.3, 0.55, 1.0], true);
  // Stone of the floor broken round its wrist.
  const rnd = seq(961);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.3;
    const p = V(Math.sin(a) * R * (0.62 + rnd() * 0.2), 0.02 * H * rnd(), Math.cos(a) * R * (0.6 + rnd() * 0.2));
    s.hard('body', boxGeo(p, V(R * (0.16 + rnd() * 0.1), R * 0.08, R * (0.12 + rnd() * 0.08)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() - 0.5, a, rnd() * 0.8 - 0.4))), 'alt', [0.32, 0.3, 0.3]);
  }
}

export const BOSS_E: Record<string, LookFactory> = {
  // Mother Wickwane: the housemother grown huge and old, a crown of many
  // candles, shears in one hand and a candelabra in the other.
  mother_wickwane: (c) =>
    asBoss(
      c,
      manLook(c, {
        height: 2.0,
        build: 'stout',
        head: 'bald',
        hunch: 0.15,
        skin: 0xe2d4b4,
        skinSurface: 'glaze',
        cloth: 0x1a1816,
        robe: 1.0,
        tunic: 2,
        belt: 1,
        extra: (s, H) => {
          housemother(s, H);
          apron(s, H, [0.7, 0.66, 0.58]);
          candelabra(s, 'handL', lerpV(s.j('handL'), s.j('handLTip'), 0.6), H, 5, 941);
          // A ring of keys at the hip, and wax run down over her shoulders.
          const hp = s.j('hips').add(V(-0.1 * H, -0.03 * H, 0.02 * H));
          s.hard('hips', ringGeo(hp, 0.04 * H, 0.005 * H, V(1, 0, 0.3).normalize(), 12), 'metal', BRASS);
          const rnd = seq(947);
          s.pair((side, x) => {
            const sh = s.j(`arm${side}`).add(V(x * 0.01 * H, 0.03 * H, 0));
            for (let i = 0; i < 4; i++) {
              const p = sh.clone().add(V((rnd() - 0.5) * 0.06 * H, 0, (rnd() - 0.5) * 0.06 * H));
              s.limb(`arm${side}`, p, p.clone().add(V(0, -(0.05 + rnd() * 0.08) * H, 0.01 * H)), 0.012 * H, 0.008 * H, { mat: 'skin', k: 0.006 * H });
            }
          });
          candleCrown(s, H, 949, { r: 1.2, flame: 1.4, at: s.j('head').add(V(0, 0.13 * H, -0.01 * H)) });
        },
        paintSkin: { grime: 0.25, ao: 0.8, mottle: { scale: 4, amount: 0.15, col: [1, 0.94, 0.8] } },
        style: { heavy: 0.35, attacks: ['thrust', 'swing'], armed: 'one', idle: 'still', gait: 'glide', spawn: 'rise', death: 'collapse' },
      }),
    ),

  // The Glasswright: a tall figure of leaded Spire glass, panes for wings,
  // a straightedge for a blade, a lens for a face.
  the_glasswright: (c) =>
    asBoss(
      c,
      walkLook(c, {
        height: 2.0,
        rig: { shoulders: 0.12, hips: 0.055, arms: 1.12, hunch: 0.08 },
        skin: { surface: 'crystal', tint: 0x9ab8d0 },
        alt: { surface: 'iron', tint: 0x2a2a30 },
        sculpt: glasswright,
        paint: { skin: { grime: 0.05, ao: 0.6, top: { amount: 0.35, col: [1.4, 1.45, 1.55] }, veins: { scale: 12, cut: 0.955, glow: 0.45, col: LIGHT } } },
        soft: { skin: 0.006 },
        style: { heavy: 0.3, attacks: ['thrust', 'swing'], armed: 'one', idle: 'still', gait: 'stalk', spawn: 'rise', death: 'scatter' },
      }),
    ),

  // Marshal Harrow: a delver's bones in a marshal's plate, the company's
  // torn banner on his back, the roll in a brass case at his hip.
  marshal_harrow: (c) =>
    asBoss(
      c,
      stayed(
        c,
        { weapon: 'sword', armor: 0.9, helm: true, steel: [0.55, 0.55, 0.58], weaponSize: 1.2, style: { heavy: 0.35, attacks: ['swing', 'chop', 'thrust'], armed: 'one', gait: 'march', idle: 'breathe', spawn: 'rise', death: 'collapse' } },
        (s, H) => {
          roundShield(s, H);
          champion(s, H);
          // The roll of the company in a brass case.
          const hp = s.j('hips').add(V(0.1 * H, -0.04 * H, 0.03 * H));
          s.hard('hips', tubeGeo([hp, hp.clone().add(V(0.01 * H, -0.12 * H, 0.02 * H))], () => 0.016 * H, 8, true), 'metal', BRASS);
          // A plume on the helm, and the marshal's sash.
          const h = s.j('head').add(V(0, 0.1 * H, -0.01 * H));
          for (let i = 0; i < 5; i++) s.hard('head', spikeGeo(h, h.clone().add(V((i - 2) * 0.01 * H, 0.1 * H, -0.08 * H - i * 0.01 * H)), 0.012 * H, 3, undefined, 2), 'alt', [0.35, 0.1, 0.1]);
          s.limb('chest', s.j('armL').add(V(0, 0.02 * H, 0.05 * H)), s.j('hips').add(V(-0.08 * H, 0, 0.07 * H)), 0.015 * H, 0.015 * H, { mat: 'alt' });
          s.glow(s.j('head').add(V(0, 0.02 * H, 0.05 * H)), 0.06 * H, 0.5, COLD);
        },
      ),
    ),

  // The Holdfast: an iron engine the size of a house, bolted to the floor,
  // a glass nail driven through its back, chains at its wrists.
  the_holdfast: (c) =>
    asBoss(
      c,
      botLook(c, {
        height: 2.0,
        kind: 'giant',
        rig: { hip: 0.42, shoulders: 0.22, hips: 0.09, arms: 1.3, hunch: 0.35, head: 0.6 },
        skin: { surface: 'iron', tint: 0x4a4a50 },
        alt: { surface: 'rust', tint: 0x5a3a2a },
        metal: { surface: 'brass', tint: 0xb08a4a },
        sculpt: holdfast,
        lumps: { amp: 0.006, scale: 6 },
        style: { heavy: 0.95, attacks: ['slam', 'swing', 'stomp'], idle: 'breathe', gait: 'lumber', spawn: 'assemble', death: 'crash' },
      }),
    ),

  // The Usher: a long, polite shape in a servant's coat, a door on its back
  // that opens on somewhere else, a lamp on a hook held out ahead.
  the_usher: (c) =>
    asBoss(c, specterLook(c, { claws: 0.14, height: 2.0 }), {
      extra: usher,
      style: { heavy: 0.25, attacks: ['claw', 'lash', 'thrust'], idle: 'hover', gait: 'glide', spawn: 'form', death: 'fade', armed: 'staff' },
    }),

  // The Sleeper's Hand: a hand as big as a tower coming up through the
  // floor, fingers uncurling, an eye half open in its palm.
  sleepers_hand: (c) =>
    asBoss(
      c,
      blobLook(c, {
        height: 3.0,
        radius: 0.9,
        lobes: 4,
        skin: { surface: 'flesh', tint: 0x8a6a74 },
        alt: { surface: 'stone', tint: 0x4a4448 },
        metal: { surface: 'crystal', tint: 0xb0c8e0 },
        sculpt: sleepersHand,
        style: { heavy: 0.9, attacks: ['slam', 'engulf', 'lash'], idle: 'breathe', gait: 'roll', spawn: 'emerge', death: 'splat' },
      }),
    ),
};

