/**
 * SLAY — the deep families (depth 30 on).
 *
 * The Kept: the Tenant's household. Servants so long at their work they went
 * to wax and soot. Every one wears a candle for a crown (a stub melted down
 * over the brow, the wick still lit) and carries a tool of the house: a
 * broom, a snuffer pole, a shelf, a ring of keys, a pair of shears.
 *
 * The Nailborn: glass that grew wrong in the Hollow Spire. Cut planes, nails
 * of glass driven out at angles nothing living holds, a cold light caught
 * inside. They read by their edges.
 *
 * The Stayed: delvers who never came back up. Bone in the gear they died in,
 * a cold blue light in the sockets, each still carrying the delver's rope at
 * the hip and the tool of the trade it learned in town.
 */
import * as THREE from 'three';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, ovalGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { WEAPON_DIR } from './Arms';
import { V, claws, fleshArms, fleshLegs, lerpV, quatAlong, seq, trunk } from './Kit';
import { manLook } from './LookHumanoid';
import { crystals, facet, fire, prism, walkLook, wispLook } from './LookElemental';
import { skeletonLook, specterLook } from './LookUndead';
import { shield } from './LookConstruct';

const FLAME: RGB = [1.45, 0.85, 0.35];
const WICK: RGB = [0.12, 0.09, 0.07];
const STRAW: RGB = [0.62, 0.52, 0.32];
const OAK: RGB = [0.34, 0.24, 0.15];
const BRASS: RGB = [0.72, 0.56, 0.3];
const LIGHT: RGB = [0.85, 1.25, 1.45];
const PALE_GLASS: RGB = [0.7, 0.82, 0.92];
const DARK_GLASS: RGB = [0.14, 0.15, 0.2];
const WRONG: RGB = [1.05, 0.6, 1.45];
const ROPE: RGB = [0.5, 0.42, 0.3];
const COLD: RGB = [0.6, 0.85, 1.3];

/** The cutting edge of a held item, the way a chop travels (Arms.ts). */
const EDGE = V(0, -0.93, 0.36).normalize();
const X = V(1, 0, 0);

/** Points along a held item in the right hand, the way `weapon()` lays one out. */
function grip(s: Sculpt, len: number, side: 'L' | 'R' = 'R'): (t: number) => THREE.Vector3 {
  const g = lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.55);
  return (t: number) => g.clone().addScaledVector(WEAPON_DIR, t * len);
}

// ===========================================================================
// THE KEPT
// ===========================================================================

/** A candle melted down over the crown of the head, its wick lit. */
function candleCrown(s: Sculpt, H: number, seed: number, o: { flame?: number; drips?: number; at?: THREE.Vector3; r?: number } = {}): void {
  const r = (o.r ?? 1) * H;
  const top = (o.at ?? s.j('head').add(V(0, 0.085 * H, 0))).clone();
  s.limb('head', top.clone().add(V(0, -0.02 * r, 0)), top.clone().add(V(0, 0.05 * r, 0)), 0.03 * r, 0.026 * r, { mat: 'skin', k: 0.012 * r });
  const rnd = seq(seed);
  const n = o.drips ?? 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const p = top.clone().add(V(Math.sin(a) * 0.032 * r, 0.03 * r, Math.cos(a) * 0.032 * r));
    const len = (0.04 + rnd() * 0.07) * r;
    s.limb('head', p, p.clone().add(V(Math.sin(a) * 0.016 * r, -len, Math.cos(a) * 0.016 * r)), 0.009 * r, 0.006 * r, { mat: 'skin', k: 0.006 * r });
  }
  const w = top.clone().add(V(0, 0.05 * r, 0));
  s.hard('head', tubeGeo([w, w.clone().add(V(0, 0.018 * r, 0))], () => 0.003 * r, 3), 'alt', WICK);
  fire(s, 'head', w.clone().add(V(0, 0.016 * r, 0)), 4, 0.06 * r * (o.flame ?? 1), 0.008 * r, seed + 1, FLAME, 0.1);
  s.glow(w.clone().add(V(0, 0.04 * r, 0)), 0.035 * r, 0.6, FLAME);
}

/** An apron tied over the dress: a pale panel down the front. */
function apron(s: Sculpt, H: number, col: RGB = [0.62, 0.58, 0.5]): void {
  const hp = s.j('hips');
  s.hard('hips', boxGeo(hp.clone().add(V(0, -0.1 * H, 0.075 * H)), V(0.13 * H, 0.26 * H, 0.012 * H)), 'alt', col);
  s.hard('chest', boxGeo(s.j('chest').add(V(0, 0.0, 0.085 * H)), V(0.1 * H, 0.12 * H, 0.01 * H)), 'alt', col);
}

/** A long-handled broom, bristles leading. */
function broom(s: Sculpt, H: number): void {
  const at = grip(s, 0.9 * H);
  s.hard('handR', tubeGeo([at(-0.45), at(0.6)], () => 0.012 * H, 6), 'metal', OAK);
  s.hard('handR', ringGeo(at(0.6), 0.02 * H, 0.006 * H, WEAPON_DIR, 10), 'metal', BRASS);
  const rnd = seq(301);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const out = X.clone().multiplyScalar(Math.cos(a) * (0.6 + rnd() * 0.5)).addScaledVector(EDGE, Math.sin(a) * 0.35);
    s.hard('handR', spikeGeo(at(0.6), at(0.88).addScaledVector(out, 0.07 * H), 0.012 * H, 3, undefined, 1), 'alt', STRAW);
  }
}

/** A snuffer pole: a long haft, a hooked bell, a burning wick held out to throw. */
function snufferPole(s: Sculpt, H: number): void {
  const at = grip(s, 0.95 * H);
  s.hard('handR', tubeGeo([at(-0.4), at(0.62)], () => 0.01 * H, 6), 'metal', OAK);
  const b = at(0.64);
  s.hard('handR', spikeGeo(b.clone().addScaledVector(WEAPON_DIR, 0.08 * H), b.clone().addScaledVector(WEAPON_DIR, -0.01 * H), 0.035 * H, 7, undefined, 1), 'metal', BRASS);
  const hook = [at(0.6), at(0.62).addScaledVector(EDGE, -0.05 * H), at(0.68).addScaledVector(EDGE, -0.07 * H), at(0.72).addScaledVector(EDGE, -0.04 * H)];
  s.hard('handR', tubeGeo(hook, () => 0.005 * H, 4), 'metal', BRASS);
  const w = at(0.72).addScaledVector(EDGE, -0.04 * H);
  fire(s, 'handR', w, 5, 0.07 * H, 0.012 * H, 307, FLAME, 0.1);
  s.glow(w.clone().add(V(0, 0.03 * H, 0)), 0.05 * H, 0.7, FLAME);
  // A bundle of fresh wicks at the belt.
  const hp = s.j('hips');
  for (let i = 0; i < 5; i++) s.hard('hips', tubeGeo([hp.clone().add(V(-0.1 * H, -0.02 * H, (i - 2) * 0.01 * H)), hp.clone().add(V(-0.11 * H, -0.12 * H, (i - 2) * 0.012 * H))], () => 0.004 * H, 3), 'alt', [0.85, 0.8, 0.68]);
}

/** A shelf torn off the wall, held like a club, books still on it. */
function shelf(s: Sculpt, H: number): void {
  const at = grip(s, 0.85 * H);
  s.hard('handR', tubeGeo([at(-0.08), at(0.12)], () => 0.016 * H, 6), 'metal', OAK);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, EDGE, WEAPON_DIR));
  const c = at(0.42);
  s.hard('handR', boxGeo(c, V(0.07 * H, 0.03 * H, 0.62 * H), q), 'metal', OAK);
  const rnd = seq(311);
  const cols: RGB[] = [[0.42, 0.14, 0.12], [0.18, 0.26, 0.2], [0.5, 0.4, 0.22], [0.2, 0.2, 0.32], [0.36, 0.22, 0.14]];
  for (let i = 0; i < 9; i++) {
    const t = 0.16 + i * 0.058;
    const tall = 0.05 + rnd() * 0.03;
    s.hard('handR', boxGeo(at(t).addScaledVector(EDGE, -(0.015 + tall / 2) * H), V(0.055 * H, tall * H, 0.03 * H), q), 'alt', cols[i % cols.length]);
  }
  // Brackets still nailed on.
  for (const t of [0.15, 0.68]) s.hard('handR', boxGeo(at(t).addScaledVector(EDGE, 0.03 * H), V(0.012 * H, 0.06 * H, 0.012 * H), q), 'metal', [0.3, 0.3, 0.32]);
}

/** A key as long as a staff, and a ring of ordinary ones at the belt. */
function keys(s: Sculpt, H: number): void {
  const at = grip(s, 0.85 * H);
  s.hard('handR', tubeGeo([at(-0.5), at(0.5)], () => 0.011 * H, 6), 'metal', BRASS);
  s.hard('handR', ringGeo(at(-0.56), 0.05 * H, 0.012 * H, X, 14), 'metal', BRASS);
  for (const t of [0.36, 0.44]) s.hard('handR', boxGeo(at(t).addScaledVector(EDGE, 0.035 * H), V(0.012 * H, 0.06 * H, 0.03 * H), quatAlong(EDGE)), 'metal', BRASS);
  s.boil('handR', at(-0.56), 0.02 * H, 0.9, [1.2, 0.95, 0.5]);
  const hp = s.j('hips').add(V(0.1 * H, -0.03 * H, 0.02 * H));
  s.hard('hips', ringGeo(hp, 0.035 * H, 0.004 * H, V(1, 0, 0.3).normalize(), 12), 'metal', BRASS);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = hp.clone().add(V(0, Math.sin(a) * 0.035 * H, Math.cos(a) * 0.035 * H));
    s.hard('hips', tubeGeo([p, p.clone().add(V(0.005 * H, -0.06 * H, 0.01 * H))], () => 0.004 * H, 3), 'metal', BRASS);
  }
}

/** Shears in the right hand, the blades open, and a crown of candles. */
function housemother(s: Sculpt, H: number): void {
  const at = grip(s, 0.7 * H);
  for (const sgn of [1, -1]) {
    const tip = at(0.6).addScaledVector(X, sgn * 0.05 * H);
    s.hard('handR', tubeGeo([at(-0.06), at(0.02).addScaledVector(X, sgn * 0.01 * H), tip], (t) => (0.012 - 0.009 * t) * H, 4), 'metal', [0.55, 0.55, 0.58]);
    s.hard('handR', ringGeo(at(-0.1).addScaledVector(X, sgn * 0.03 * H), 0.025 * H, 0.005 * H, EDGE, 10), 'metal', [0.3, 0.3, 0.32]);
  }
  // Long fingers on the free hand.
  claws(s, 'handL', 'handLTip', 4, 0.11 * H, 0.006 * H, 'skin', [0.86, 0.8, 0.66], 0.6);
  // A crown of five candles, the middle one tallest.
  const c = s.j('head').add(V(0, 0.085 * H, 0));
  for (let i = 0; i < 5; i++) {
    const a = ((i - 2) / 4) * Math.PI * 0.9;
    const p = c.clone().add(V(Math.sin(a) * 0.05 * H, (i === 2 ? 0.03 : 0) * H, Math.cos(a) * 0.02 * H - 0.01 * H));
    candleCrown(s, H, 321 + i * 3, { at: p, r: i === 2 ? 0.75 : 0.5, drips: 3 });
  }
  // A veil from the crown down the back.
  const v = c.clone().add(V(0, -0.02 * H, -0.04 * H));
  s.limb('chest', v, s.j('chest').add(V(0, -0.1 * H, -0.09 * H)), 0.06 * H, 0.1 * H, { mat: 'alt', k: 0.02 * H });
}

/** A ball of swept-up soot with two coals for eyes and a stub of candle on top. */
function dustling(s: Sculpt, R: number): void {
  const c0 = s.j('core');
  s.ball('core', c0, V(R * 0.9, R * 0.8, R * 0.85), { k: R * 0.15 });
  const rnd = seq(331);
  for (let i = 0; i < 9; i++) {
    const d = V(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).normalize();
    s.ball('core', c0.clone().addScaledVector(d, R * 0.7), R * (0.3 + rnd() * 0.2), { k: R * 0.1 });
  }
  s.pair((_side, x) => s.eye('eye', s.j('eye').add(V(x * R * 0.3, R * 0.05, R * 0.45)), R * 0.12, 1.4));
  const top = s.j('crown').add(V(0, -R * 0.35, 0));
  s.limb('crown', top, top.clone().add(V(0, R * 0.3, 0)), R * 0.14, R * 0.12, { mat: 'alt', k: R * 0.05 });
  fire(s, 'crown', top.clone().add(V(0, R * 0.33, 0)), 4, R * 0.4, R * 0.04, 333, FLAME, 0.1);
  for (let i = 0; i < 3; i++) {
    const p = s.j(`orb${i}`);
    s.ball(`orb${i}`, p, R * 0.18, { k: R * 0.06 });
  }
}

// ===========================================================================
// THE NAILBORN
// ===========================================================================

/** Glass nails driven out of a point at angles that should not hold. */
function nails(s: Sculpt, bone: string, c: THREE.Vector3, n: number, len: number, r: number, seed: number, col: RGB = PALE_GLASS): void {
  const rnd = seq(seed);
  for (let i = 0; i < n; i++) {
    const d = V(rnd() - 0.5, rnd() - 0.4, rnd() - 0.5).normalize();
    const l = len * (0.6 + rnd() * 0.6);
    const b = c.clone().addScaledVector(d, -l * 0.2);
    s.hard(bone, spikeGeo(b, b.clone().addScaledVector(d, l), r, 4, undefined, 1), 'skin', col);
    // The flat head of the nail at its root.
    s.hard(bone, ringGeo(b, r * 1.6, r * 0.5, d, 6), 'skin', col);
  }
}

/** A thin figure of bundled glass: prisms for limbs, one long spike for a head. */
function nailwalker(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  const hp = s.j('hips');
  facet(s, 'chest', ch.clone().add(V(0, 0.01 * H, 0)), V(0.075 * H, 0.08 * H, 0.05 * H), 401);
  facet(s, 'spine', s.j('spine'), V(0.045 * H, 0.05 * H, 0.04 * H), 403);
  facet(s, 'hips', hp.clone().add(V(0, 0.01 * H, 0)), V(0.06 * H, 0.045 * H, 0.045 * H), 405);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    const e = s.j(`fore${side}`);
    const w = s.j(`hand${side}`);
    const t = s.j(`hand${side}Tip`);
    prism(s, `arm${side}`, lerpV(a, e, 0.05), lerpV(a, e, 0.95), 0.018 * H, 0.016 * H);
    prism(s, `fore${side}`, lerpV(e, w, 0.05), lerpV(e, w, 0.95), 0.016 * H, 0.015 * H);
    // The hands end in a single long nail each.
    const dir = t.clone().sub(w).normalize();
    s.hard(`hand${side}`, spikeGeo(w, w.clone().addScaledVector(dir, 0.24 * H), 0.016 * H, 4, undefined, 1), 'skin', PALE_GLASS);
    const l = s.j(`leg${side}`);
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    prism(s, `leg${side}`, lerpV(l, k, 0.05), lerpV(l, k, 0.95), 0.026 * H, 0.024 * H);
    prism(s, `shin${side}`, lerpV(k, f, 0.05), lerpV(k, f, 0.95), 0.022 * H, 0.02 * H);
    s.box(`foot${side}`, lerpV(f, s.j(`toe${side}`), 0.5), V(0.02 * H, 0.012 * H, 0.05 * H), { k: 0.003 * H, round: 0.003 * H });
    s.boil(`fore${side}`, e, 0.012 * H, 0.9, LIGHT);
    s.boil(`shin${side}`, k, 0.014 * H, 0.9, LIGHT);
    nails(s, `arm${side}`, a.clone().add(V(x * 0.02 * H, 0.02 * H, 0)), 3, 0.1 * H, 0.008 * H, 407 + x);
  });
  nails(s, 'chest', ch.clone().add(V(0, 0.03 * H, -0.04 * H)), 6, 0.14 * H, 0.01 * H, 411);
  s.boil('chest', ch.clone().add(V(0, 0, 0.045 * H)), 0.026 * H, 1, LIGHT);
  const h = s.j('head').add(V(0, 0.02 * H, 0.01 * H));
  s.hard('head', spikeGeo(h.clone().add(V(0, -0.02 * H, 0)), h.clone().add(V(0, 0.2 * H, 0.04 * H)), 0.03 * H, 4, undefined, 1), 'skin', PALE_GLASS);
  s.hard('head', ringGeo(h.clone().add(V(0, -0.02 * H, 0)), 0.045 * H, 0.012 * H, V(0, 1, 0), 6), 'skin', PALE_GLASS);
  s.eye('head', h.clone().add(V(0, 0.04 * H, 0.03 * H)), 0.012 * H, 1.6);
}

/** A hulk with a nail's head for a face and nails driven through it. */
function nailhead(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.16, 0.11, 0.12], pelvis: [0.1, 0.075, 0.07], shoulders: 0.07, hump: 0.06 });
  fleshArms(s, { r: 0.045, swell: 0.02 });
  fleshLegs(s, { r: 0.06, swell: 0.02 });
  const ch = s.j('chest');
  const h = s.j('head').add(V(0, 0.03 * H, 0.02 * H));
  // The head is a nail's flat head, set edge-on, the shank running down into the chest.
  s.hard('head', ringGeo(h, 0.09 * H, 0.03 * H, V(0, 0.2, 1).normalize(), 8), 'skin', PALE_GLASS);
  s.hard('head', ovalGeo(h, 0.07 * H, 1, 1, 1, 0.35), 'skin', DARK_GLASS);
  s.eye('head', h.clone().add(V(0, 0, 0.03 * H)), 0.022 * H, 1.6);
  // Nails through the body, heads on one side, points out the other.
  const rnd = seq(421);
  for (let i = 0; i < 7; i++) {
    const p = ch.clone().add(V((rnd() - 0.5) * 0.24 * H, (rnd() - 0.5) * 0.16 * H, (rnd() - 0.5) * 0.08 * H));
    const d = V(rnd() - 0.5, rnd() * 0.4, rnd() > 0.5 ? 1 : -1).normalize();
    s.hard('chest', spikeGeo(p.clone().addScaledVector(d, -0.18 * H), p.clone().addScaledVector(d, 0.22 * H), 0.016 * H, 4, undefined, 1), 'skin', PALE_GLASS);
    s.hard('chest', ringGeo(p.clone().addScaledVector(d, -0.18 * H), 0.03 * H, 0.008 * H, d, 6), 'skin', PALE_GLASS);
  }
  // The right fist is one great nail; the left a cluster of shards.
  const w = s.j('handR');
  const t = s.j('handRTip');
  const dir = t.clone().sub(w).normalize();
  s.hard('handR', spikeGeo(w, w.clone().addScaledVector(dir, 0.4 * H), 0.04 * H, 4, undefined, 1), 'skin', PALE_GLASS);
  s.hard('handR', ringGeo(w, 0.06 * H, 0.015 * H, dir, 6), 'skin', PALE_GLASS);
  crystals(s, 'handL', lerpV(s.j('handL'), s.j('handLTip'), 0.4), 6, 0.14 * H, 0.025 * H, 425, V(0, -1, 0.4), 0.6, 'skin', PALE_GLASS);
  s.pair((side, x) => crystals(s, `arm${side}`, s.j(`arm${side}`).add(V(x * 0.03 * H, 0.04 * H, 0)), 4, 0.16 * H, 0.025 * H, 427 + x, V(x * 0.5, 1, -0.2), 0.4, 'skin', PALE_GLASS));
  s.boil('chest', ch.clone().add(V(0, -0.01 * H, 0.11 * H)), 0.04 * H, 1, LIGHT);
}

/** A thin dark figure whose joints bend where they should not. */
function wrongAngle(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  facet(s, 'chest', ch.clone().add(V(0.01 * H, 0.01 * H, 0)), V(0.07 * H, 0.085 * H, 0.04 * H), 431);
  facet(s, 'hips', s.j('hips'), V(0.055 * H, 0.04 * H, 0.04 * H), 433);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    const e = s.j(`fore${side}`);
    const w = s.j(`hand${side}`);
    prism(s, `arm${side}`, lerpV(a, e, 0.05), lerpV(a, e, 0.95), 0.014 * H, 0.012 * H);
    prism(s, `fore${side}`, lerpV(e, w, 0.05), lerpV(e, w, 0.95), 0.012 * H, 0.011 * H);
    // An extra joint at each elbow, angled back the wrong way.
    s.hard(`fore${side}`, spikeGeo(e, e.clone().add(V(x * 0.06 * H, 0.05 * H, -0.08 * H)), 0.014 * H, 4, undefined, 1), 'skin', DARK_GLASS);
    s.boil(`fore${side}`, e, 0.012 * H, 1, WRONG);
    claws(s, `hand${side}`, `hand${side}Tip`, 3, 0.12 * H, 0.006 * H, 'skin', DARK_GLASS, 0.1);
    const l = s.j(`leg${side}`);
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    prism(s, `leg${side}`, lerpV(l, k, 0.05), lerpV(l, k, 0.95), 0.02 * H, 0.018 * H);
    prism(s, `shin${side}`, lerpV(k, f, 0.05), lerpV(k, f, 0.95), 0.016 * H, 0.015 * H);
    s.hard(`shin${side}`, spikeGeo(k, k.clone().add(V(0, 0.04 * H, -0.09 * H)), 0.014 * H, 4, undefined, 1), 'skin', DARK_GLASS);
    s.box(`foot${side}`, lerpV(f, s.j(`toe${side}`), 0.5), V(0.016 * H, 0.01 * H, 0.05 * H), { k: 0.003 * H, round: 0.003 * H });
  });
  // The head sits turned a quarter on its side, one eye above the other.
  const h = s.j('head').add(V(0, 0.035 * H, 0.01 * H));
  s.box('head', h, V(0.035 * H, 0.06 * H, 0.04 * H), { k: 0.004 * H, round: 0.004 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.3, Math.PI / 2.3)) });
  s.eye('head', h.clone().add(V(-0.012 * H, 0.025 * H, 0.04 * H)), 0.01 * H, 1.6);
  s.eye('head', h.clone().add(V(0.012 * H, -0.02 * H, 0.04 * H)), 0.01 * H, 1.6);
  crystals(s, 'chest', ch.clone().add(V(-0.04 * H, 0.06 * H, -0.03 * H)), 4, 0.18 * H, 0.016 * H, 437, V(-1, 0.6, -0.4), 0.3, 'skin', DARK_GLASS);
  s.boil('chest', ch.clone().add(V(0.02 * H, 0, 0.04 * H)), 0.022 * H, 1, WRONG);
}

// ===========================================================================
// THE STAYED
// ===========================================================================

/** The delver's rope at the hip, a brass tag on the chest, frost on the bone. */
function delverKit(s: Sculpt, H: number, seed: number): void {
  const hp = s.j('hips').add(V(-0.09 * H, -0.02 * H, 0));
  s.hard('hips', ringGeo(hp, 0.05 * H, 0.012 * H, V(1, 0, 0.2).normalize(), 12), 'alt', ROPE);
  s.hard('hips', ringGeo(hp.clone().add(V(-0.005 * H, -0.01 * H, 0)), 0.042 * H, 0.011 * H, V(1, 0.1, 0.3).normalize(), 12), 'alt', ROPE);
  const ch = s.j('chest');
  s.hard('chest', boxGeo(ch.clone().add(V(0.03 * H, 0.04 * H, 0.075 * H)), V(0.03 * H, 0.02 * H, 0.004 * H)), 'metal', BRASS);
  s.glow(ch.clone().add(V(0, 0.02 * H, 0.05 * H)), 0.05 * H, 0.25, COLD);
  const rnd = seq(seed);
  for (let i = 0; i < 4; i++) s.tint(s.j(i % 2 ? 'armL' : 'shinR').add(V((rnd() - 0.5) * 0.04 * H, 0, (rnd() - 0.5) * 0.04 * H)), 0.06 * H, [0.82, 0.9, 1.0]);
}

/** A round shield on the left arm, a ring of rivets round its boss. */
function roundShield(s: Sculpt, H: number): void {
  shield(s, H, { h: 0.34, w: 0.16, col: [0.36, 0.3, 0.24], boss: [0.62, 0.6, 0.56] });
}

/** A second dagger in the off hand and a scarf drawn up over the jaw. */
function cutthroat(s: Sculpt, H: number): void {
  const at = grip(s, 0.6 * H, 'L');
  s.hard('handL', tubeGeo([at(-0.05), at(0.04)], () => 0.01 * H, 4), 'metal', OAK);
  s.hard('handL', spikeGeo(at(0.05), at(0.3), 0.018 * H, 4, undefined, 1), 'metal', [0.6, 0.6, 0.62]);
  const h = s.j('head');
  s.limb('head', h.clone().add(V(-0.05 * H, 0.0, 0.02 * H)), h.clone().add(V(0.05 * H, 0.0, 0.02 * H)), 0.035 * H, 0.035 * H, { mat: 'alt', k: 0.01 * H });
  s.limb('neck', h.clone().add(V(0.03 * H, -0.01 * H, -0.04 * H)), s.j('chest').add(V(0.06 * H, 0.0, -0.1 * H)), 0.015 * H, 0.008 * H, { mat: 'alt', k: 0.004 * H });
}

/** Cold motes turning round a spellwright's free hand. */
function spellwright(s: Sculpt, H: number): void {
  const w = lerpV(s.j('handL'), s.j('handLTip'), 0.7);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    s.boil('handL', w.clone().add(V(Math.cos(a) * 0.05 * H, Math.sin(a) * 0.05 * H, 0.02 * H)), 0.01 * H, 1, COLD);
  }
  crystals(s, 'handL', w, 3, 0.06 * H, 0.008 * H, 451, V(0, 1, 0.3), 0.5, 'skin', [0.75, 0.9, 1.1], 0.6);
}

/** A hanging censer of warm light on the chaplain's staff, a book chained at the hip. */
function chaplain(s: Sculpt, H: number): void {
  const at = grip(s, 0.9 * H);
  const top = at(0.58);
  const hang = top.clone().add(V(0, -0.12 * H, 0.02 * H));
  s.hard('handR', tubeGeo([top, hang], () => 0.003 * H, 3), 'metal', BRASS);
  s.hard('handR', ballGeo(hang.clone().add(V(0, -0.025 * H, 0)), 0.03 * H, 1), 'metal', BRASS);
  s.boil('handR', hang.clone().add(V(0, -0.025 * H, 0.02 * H)), 0.014 * H, 1, [1.4, 1.2, 0.7]);
  s.glow(hang.clone().add(V(0, -0.02 * H, 0)), 0.06 * H, 0.6, [1.3, 1.1, 0.6]);
  const hp = s.j('hips').add(V(0.1 * H, -0.06 * H, 0.03 * H));
  s.hard('hips', boxGeo(hp, V(0.05 * H, 0.065 * H, 0.02 * H)), 'alt', [0.32, 0.12, 0.1]);
  s.hard('hips', tubeGeo([s.j('hips').add(V(0.07 * H, 0.0, 0.05 * H)), hp.clone().add(V(0, 0.06 * H, 0))], () => 0.003 * H, 3), 'metal', [0.5, 0.5, 0.52]);
}

/** A champion's torn banner on a pole across the back. */
function champion(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  const a = ch.clone().add(V(0.06 * H, -0.2 * H, -0.11 * H));
  const b = ch.clone().add(V(-0.08 * H, 0.42 * H, -0.12 * H));
  s.hard('chest', tubeGeo([a, b], () => 0.01 * H, 5), 'metal', OAK);
  const top = lerpV(a, b, 0.92);
  s.hard('chest', boxGeo(top.clone().add(V(-0.08 * H, -0.08 * H, -0.005 * H)), V(0.15 * H, 0.17 * H, 0.008 * H)), 'alt', [0.4, 0.14, 0.12]);
  s.hard('chest', spikeGeo(top.clone().add(V(-0.14 * H, -0.17 * H, -0.005 * H)), top.clone().add(V(-0.12 * H, -0.27 * H, -0.005 * H)), 0.03 * H, 3, undefined, 1), 'alt', [0.4, 0.14, 0.12]);
}

/** A Stayed look: the skeleton in its gear, plus its kit and its trade. */
function stayed(c: LookCtx, o: Parameters<typeof skeletonLook>[1], extra?: (s: Sculpt, H: number) => void): CreatureLook {
  const base = skeletonLook(c, { boneTint: 0xc8c4b8, ...o });
  const H = o.height ?? (o.brute ? 2.0 : 1.78);
  return {
    ...base,
    sculpt: (s) => {
      base.sculpt(s);
      delverKit(s, H, c.id.length * 7);
      extra?.(s, H);
    },
  };
}

// ===========================================================================

const DEEP: Record<string, LookFactory> = {
  // A Restless monster's ghost: a thin, pale specter that glides.
  restless_shade: (c) => ({
    ...specterLook(c, { claws: 0.1, height: 1.8 }),
    style: { heavy: 0.05, attacks: ['claw'], spawn: 'form', death: 'fade', idle: 'hover', gait: 'glide', armed: 'none' },
  }),
  // --- The Kept --------------------------------------------------------------
  kept_hallsweeper: (c) =>
    manLook(c, {
      height: 1.72,
      build: 'thin',
      head: 'bald',
      hunch: 0.35,
      skin: 0xd8c8a4,
      skinSurface: 'glaze',
      cloth: 0x2a2622,
      robe: 0.85,
      tunic: 2,
      extra: (s, H) => {
        candleCrown(s, H, 341);
        apron(s, H);
        broom(s, H);
      },
      paintSkin: { grime: 0.35, ao: 0.85, mottle: { scale: 5, amount: 0.2, col: [0.95, 0.88, 0.7] } },
      style: { heavy: 0.15, attacks: ['swing', 'chop'], armed: 'two', idle: 'sway', gait: 'shamble' },
    }),
  kept_wicktrimmer: (c) =>
    manLook(c, {
      height: 1.78,
      build: 'thin',
      head: 'bald',
      hunch: 0.2,
      skin: 0xdcccaa,
      skinSurface: 'glaze',
      cloth: 0x332c26,
      robe: 0.9,
      hood: true,
      extra: (s, H) => {
        candleCrown(s, H, 351, { flame: 1.4 });
        snufferPole(s, H);
      },
      paintSkin: { grime: 0.35, ao: 0.85, mottle: { scale: 5, amount: 0.2, col: [0.95, 0.88, 0.7] } },
      style: { attacks: ['hurl'], ranged: true, armed: 'staff', idle: 'still', gait: 'walk' },
    }),
  kept_dustling: (c) =>
    wispLook(c, {
      hover: 0.55,
      radius: 0.24,
      orbs: 3,
      size: 1.2,
      skin: { surface: 'shade', tint: 0x2a2622 },
      alt: { surface: 'glaze', tint: 0xd8c8a4 },
      sculpt: dustling,
      paint: { skin: { grime: 0.6, ao: 0.9, mottle: { scale: 9, amount: 0.5, col: [0.4, 0.38, 0.35] } } },
      style: { attacks: ['lunge'], idle: 'jitter', spawn: 'form', death: 'scatter' },
    }),
  kept_shelver: (c) =>
    manLook(c, {
      height: 1.95,
      build: 'brute',
      head: 'bald',
      skin: 0xd0c098,
      skinSurface: 'glaze',
      cloth: 0x2a2622,
      robe: 0.5,
      tunic: 1,
      extra: (s, H) => {
        candleCrown(s, H, 361, { r: 0.9 });
        apron(s, H, [0.5, 0.46, 0.4]);
        shelf(s, H);
      },
      paintSkin: { grime: 0.45, ao: 0.9, mottle: { scale: 5, amount: 0.25, col: [0.9, 0.82, 0.62] } },
      style: { heavy: 0.6, attacks: ['chop', 'swing'], armed: 'two', idle: 'breathe', gait: 'lumber', death: 'crash' },
    }),
  kept_turnkey: (c) =>
    manLook(c, {
      height: 1.8,
      build: 'normal',
      head: 'bald',
      skin: 0xd4c49e,
      skinSurface: 'glaze',
      cloth: 0x24201e,
      robe: 0.75,
      belt: 1,
      extra: (s, H) => {
        candleCrown(s, H, 371);
        // A gaoler's leather bib.
        apron(s, H, [0.3, 0.21, 0.14]);
        keys(s, H);
      },
      paintSkin: { grime: 0.4, ao: 0.85, mottle: { scale: 5, amount: 0.2, col: [0.95, 0.88, 0.7] } },
      style: { attacks: ['thrust'], armed: 'staff', idle: 'still', gait: 'march', castBoth: false },
    }),
  kept_housemother: (c) =>
    manLook(c, {
      height: 2.05,
      build: 'thin',
      head: 'bald',
      hunch: 0.1,
      skin: 0xe2d4b4,
      skinSurface: 'glaze',
      cloth: 0x1a1816,
      robe: 1.0,
      tunic: 2,
      extra: housemother,
      paintSkin: { grime: 0.25, ao: 0.8, mottle: { scale: 4, amount: 0.15, col: [1, 0.94, 0.8] } },
      style: { heavy: 0.1, attacks: ['thrust', 'swing'], armed: 'one', idle: 'still', gait: 'glide' },
    }),

  // --- The Nailborn ----------------------------------------------------------
  nail_splinter: (c) =>
    wispLook(c, {
      hover: 1.0,
      radius: 0.2,
      orbs: 3,
      size: 1.25,
      skin: { surface: 'crystal', tint: 0xa8c4dc },
      alt: { surface: 'crystal', tint: 0x6a8aa8 },
      sculpt: (s, R) => {
        const c0 = s.j('core');
        s.ball('core', c0, R * 0.4, { k: R * 0.1, mat: 'alt' });
        nails(s, 'core', c0, 10, R * 1.6, R * 0.08, 461);
        s.boil('core', c0, R * 0.25, 1, LIGHT);
        s.eye('eye', s.j('eye').add(V(0, 0, R * 0.3)), R * 0.12, 1.6);
        for (let i = 0; i < 3; i++) {
          const p = s.j(`orb${i}`);
          s.hard(`orb${i}`, spikeGeo(p.clone().add(V(0, -R * 0.3, 0)), p.clone().add(V(R * 0.1, R * 0.3, 0)), R * 0.07, 4, undefined, 1), 'skin', PALE_GLASS);
        }
      },
      paint: { skin: { grime: 0.05, ao: 0.5, top: { amount: 0.3, col: [1.2, 1.25, 1.3] } }, alt: { grime: 0, ao: 0.4 } },
      glowIntensity: 2.2,
      style: { attacks: ['lunge'], idle: 'jitter', spawn: 'form', death: 'scatter' },
    }),
  nail_facet: (c) =>
    wispLook(c, {
      hover: 1.3,
      radius: 0.3,
      orbs: 4,
      size: 1.1,
      skin: { surface: 'crystal', tint: 0xb8d4ec },
      alt: { surface: 'crystal', tint: 0x8aa8c4 },
      sculpt: (s, R) => {
        // One great cut stone, point down, light caught in the middle.
        const c0 = s.j('core');
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));
        s.hard('core', spikeGeo(c0.clone(), c0.clone().add(V(0, R * 1.1, 0)), R * 0.6, 4, undefined, 1).applyQuaternion(q), 'skin', PALE_GLASS);
        s.hard('core', spikeGeo(c0.clone(), c0.clone().add(V(0, -R * 1.5, 0)), R * 0.6, 4, undefined, 1), 'skin', PALE_GLASS);
        s.boil('core', c0, R * 0.3, 1, LIGHT);
        s.eye('eye', s.j('eye').add(V(0, 0, R * 0.35)), R * 0.14, 1.8);
        for (let i = 0; i < 4; i++) {
          const p = s.j(`orb${i}`);
          s.hard(`orb${i}`, spikeGeo(p.clone().add(V(0, -R * 0.25, 0)), p.clone().add(V(0, R * 0.25, 0)), R * 0.12, 4, undefined, 1), 'skin', PALE_GLASS);
          s.hard(`orb${i}`, spikeGeo(p.clone().add(V(0, R * 0.2, 0)), p.clone().add(V(0, -R * 0.25, 0)), R * 0.12, 4, undefined, 1), 'skin', PALE_GLASS);
        }
      },
      paint: { skin: { grime: 0.02, ao: 0.45, tips: { amount: 0.5, col: [1.3, 1.4, 1.5] } }, alt: { grime: 0, ao: 0.4 } },
      glowIntensity: 2.6,
      style: { attacks: ['lash'], ranged: true, castBoth: true, idle: 'hover', spawn: 'form', death: 'scatter' },
    }),
  nail_walker: (c) =>
    walkLook(c, {
      height: 2.0,
      rig: { shoulders: 0.11, hips: 0.05, arms: 1.12, hunch: 0.12 },
      skin: { surface: 'crystal', tint: 0x3a4250 },
      sculpt: nailwalker,
      paint: { skin: { grime: 0.15, ao: 0.7, top: { amount: 0.35, col: [1.4, 1.45, 1.55] }, veins: { scale: 12, cut: 0.955, glow: 0.45, col: LIGHT } } },
      soft: { skin: 0.006 },
      style: { heavy: 0.2, attacks: ['thrust', 'swing'], idle: 'twitch', gait: 'stalk', spawn: 'rise', death: 'scatter' },
    }),
  nail_prism: (c) =>
    wispLook(c, {
      hover: 1.4,
      radius: 0.32,
      orbs: 3,
      size: 1.1,
      skin: { surface: 'crystal', tint: 0xc4b8dc },
      alt: { surface: 'crystal', tint: 0x6a5a88 },
      sculpt: (s, R) => {
        // A triangular prism split down its length, the light leaking out of the gap.
        const c0 = s.j('core');
        s.pair((_side, x) => {
          const off = V(x * R * 0.18, 0, 0);
          s.hard('core', boxGeo(c0.clone().add(off).add(V(x * R * 0.2, 0, 0)), V(R * 0.4, R * 1.6, R * 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, x * 0.5, x * 0.12))), 'skin', [0.78, 0.72, 0.9]);
        });
        s.boil('core', c0, R * 0.22, 1, WRONG);
        s.boil('core', c0.clone().add(V(0, R * 0.45, 0)), R * 0.12, 1, WRONG);
        s.boil('core', c0.clone().add(V(0, -R * 0.45, 0)), R * 0.12, 1, WRONG);
        s.eye('eye', s.j('eye').add(V(0, R * 0.25, R * 0.2)), R * 0.08, 1.6);
        s.eye('eye', s.j('eye').add(V(-R * 0.1, 0, R * 0.2)), R * 0.08, 1.6);
        s.eye('eye', s.j('eye').add(V(R * 0.1, -R * 0.2, R * 0.2)), R * 0.08, 1.6);
        for (let i = 0; i < 3; i++) {
          const p = s.j(`orb${i}`);
          s.hard(`orb${i}`, boxGeo(p, V(R * 0.12, R * 0.35, R * 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 * i, 0.8, 0.2))), 'skin', [0.78, 0.72, 0.9], 0.5);
        }
      },
      paint: { skin: { grime: 0.02, ao: 0.45, veins: { scale: 10, cut: 0.95, glow: 0.5, col: WRONG } }, alt: { grime: 0, ao: 0.4 } },
      glowIntensity: 2.6,
      style: { attacks: ['lash'], ranged: true, castBoth: true, idle: 'hover', spawn: 'form', death: 'scatter' },
    }),
  nail_nailhead: (c) =>
    walkLook(c, {
      height: 1.9,
      kind: 'giant',
      rig: { hip: 0.44, shoulders: 0.2, hips: 0.085, arms: 1.25, hunch: 0.4, head: 0.7, armOut: 0.4 },
      skin: { surface: 'crystal', tint: 0x2e3440 },
      sculpt: nailhead,
      paint: { skin: { grime: 0.2, ao: 0.8, top: { amount: 0.3, col: [1.3, 1.35, 1.45] }, veins: { scale: 9, cut: 0.955, glow: 0.45, col: LIGHT } } },
      lumps: { amp: 0.008, scale: 7 },
      style: { heavy: 0.85, attacks: ['thrust', 'slam', 'swing'], idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'scatter' },
    }),
  nail_wrongangle: (c) =>
    walkLook(c, {
      height: 1.95,
      rig: { shoulders: 0.12, hips: 0.05, arms: 1.2, hunch: 0.3 },
      skin: { surface: 'crystal', tint: 0x1e1a28 },
      sculpt: wrongAngle,
      paint: { skin: { grime: 0.1, ao: 0.7, top: { amount: 0.25, col: [1.2, 1.1, 1.4] }, veins: { scale: 12, cut: 0.955, glow: 0.5, col: WRONG } } },
      soft: { skin: 0.006 },
      style: { heavy: 0.1, attacks: ['claw', 'lunge', 'thrust'], idle: 'twitch', gait: 'stalk', spawn: 'form', death: 'scatter' },
    }),

  // --- The Stayed ------------------------------------------------------------
  stayed_sellsword: (c) =>
    stayed(c, { weapon: 'sword', armor: 0.65, helm: true, steel: [0.5, 0.48, 0.46], style: { attacks: ['swing', 'chop', 'thrust'], armed: 'one', gait: 'march', idle: 'breathe' } }, roundShield),
  stayed_archer: (c) =>
    stayed(c, { weapon: 'bow', hood: true, rags: true, armor: 0.25, style: { attacks: ['shoot'], ranged: true, armed: 'bow', idle: 'sway' } }),
  stayed_spellwright: (c) =>
    stayed(c, { weapon: 'staff', robe: true, hood: true, style: { attacks: ['thrust'], armed: 'staff', idle: 'still', castBoth: false, gait: 'walk' } }, spellwright),
  stayed_cutthroat: (c) =>
    stayed(c, { weapon: 'dagger', hood: true, rags: true, weaponSize: 1.2, style: { heavy: 0.05, attacks: ['thrust', 'swing', 'lunge'], armed: 'one', idle: 'twitch', gait: 'stalk' } }, cutthroat),
  stayed_chaplain: (c) =>
    stayed(c, { weapon: 'staff', armor: 0.5, robe: true, helm: true, style: { attacks: ['thrust'], armed: 'staff', idle: 'still', gait: 'march', castBoth: true } }, chaplain),
  stayed_champion: (c) =>
    stayed(c, { weapon: 'greataxe', brute: true, armor: 1, helm: true, horns: 0.8, steel: [0.45, 0.43, 0.42], style: { heavy: 0.6, attacks: ['chop', 'swing'], armed: 'two', gait: 'march', idle: 'breathe', death: 'crash' } }, champion),
};

export { DEEP, apron, candleCrown, champion, delverKit, grip, housemother, keys, nails, roundShield, stayed };
