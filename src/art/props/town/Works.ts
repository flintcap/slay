/**
 * SLAY — the town's walls, gate, trees and yard dressing.
 *
 * The palisade is a ring of sharpened logs lashed to rails. The gate is the
 * one piece of old stonework: two battered rubble towers, a voussoir arch, a
 * raised portcullis and a timber fighting gallery, the portal standing in the
 * arch. Two log watch towers with thatched caps flank it. Outside, the dark
 * pines the clearing was cut from.
 *
 * Inside: the fire ring, the memorial cairn, lantern posts, a well, the
 * practice ground and the clutter of people living close together.
 */
import * as THREE from 'three';
import type { Rng } from '../../../types';
import { box, cloth as clothGeo, cyl, jag, lathe, log, merge, mottle, plank, rock, xf, clean } from '../Kit';
import { TM, Site, type Collider, type LanternSpec, type SwayItem, type TownBatch } from './TownKit';
import { sack } from './Houses';

// ---------------------------------------------------------------------------
// Gatehouse
// ---------------------------------------------------------------------------

/** A battered rubble tower `s` square and `h` tall, base at the site's origin. */
function tower(site: Site, rng: Rng, x: number, s: number, h: number): void {
  const g = new THREE.BoxGeometry(s, h + 0.3, s, 4, Math.round(h / 0.5), 4);
  // Batter: the base splays out a little.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + (h + 0.3) / 2) / (h + 0.3);
    const k = 1 + (1 - t) * 0.12;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  jag(g, rng, 0.04, 2.5);
  mottle(g, rng, 0.45, 2.2);
  site.add(TM.stoneDark(), g, { x, y: (h - 0.3) / 2 }, 0.95);
  // Quoins up the corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < Math.floor(h / 0.55); i++) {
        const long = i % 2 === 0;
        const t = (i * 0.55) / h;
        const k = 1 + (1 - t) * 0.12;
        const q = jag(box(long ? 0.6 : 0.34, 0.5, long ? 0.34 : 0.6, 0.04), rng, 0.02, 3);
        site.add(TM.stone(), q, { x: x + sx * (s / 2 * k - (long ? 0.26 : 0.13)), y: i * 0.55 + 0.27, z: sz * (s / 2 * k - (long ? 0.13 : 0.26)) }, rng.range(0.8, 0.95));
      }
    }
  }
  // Corbelled parapet and merlons.
  site.add(TM.stone(), jag(box(s + 0.3, 0.3, s + 0.3, 0.04, 3), rng, 0.02, 3), { x, y: h - 0.15 }, 0.9);
  for (const u of [-0.78, 0, 0.78]) {
    for (const side of [0, 1, 2, 3]) {
      const a = (side * Math.PI) / 2;
      const lx = Math.cos(a) * u + Math.sin(a) * (s / 2 + 0.05);
      const lz = -Math.sin(a) * u + Math.cos(a) * (s / 2 + 0.05);
      site.add(TM.stone(), jag(box(0.42, 0.6, 0.3, 0.04), rng, 0.02, 3), { x: x + lx, y: h + 0.15, z: lz, ry: a }, rng.range(0.8, 0.95));
    }
  }
}

export interface GateBuilt {
  lanterns: LanternSpec[];
  /** Where the portal stands: the arch's centre on the ground. */
  portal: THREE.Vector3;
}

/** The gatehouse. Front (toward the town) is local +Z; the portal stands in the arch at the origin. */
export function gatehouse(site: Site, rng: Rng): GateBuilt {
  const S = 2.0;
  const H = 6.4;
  const X = 3.3;
  for (const s of [-1, 1]) {
    tower(site, rng, s * X, S, H);
    site.solid(s * X, 0, S + 0.24, S + 0.24);
  }
  // The arch: voussoirs round a half circle springing from the towers' inner faces.
  const r0 = X - S / 2;
  const spring = 3.4;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i + 0.5) / N * Math.PI;
    const rr = r0 + 0.35;
    const key = i === (N - 1) / 2;
    const g = jag(box(0.7 + (key ? 0.12 : 0), (Math.PI * rr) / N - 0.03, 1.7, 0.04), rng, 0.015, 3);
    site.add(TM.stone(), g, { x: Math.cos(a) * rr, y: spring + Math.sin(a) * rr, rz: a }, key ? 1 : rng.range(0.8, 0.95));
  }
  // Spandrels: the corners between the ring and the towers, under the gallery.
  for (const sgn of [-1, 1]) {
    const sp = jag(box(0.6, H - 5.0, 1.5, 0.03), rng, 0.02, 3);
    site.add(TM.stoneDark(), sp, { x: sgn * (r0 - 0.3), y: 5.0 + (H - 5.0) / 2 }, 0.9);
  }
  // The portcullis, raised into the arch: an iron grid, its teeth just showing.
  const pz = 0.45;
  for (let i = 0; i < 7; i++) {
    const x = -1.5 + i * 0.5;
    const len = Math.sqrt(Math.max(0.1, r0 * r0 - x * x)) + spring - 4.2;
    site.box(TM.iron(), 0.07, len, 0.07, { x, y: 4.2, z: pz }, 0.85, 0.01);
    site.add(TM.iron(), new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(Math.PI), { x, y: 4.1, z: pz }, 0.85);
  }
  for (const y of [4.45, 5.0, 5.5]) site.add(TM.iron(), box(Math.min(3.4, 2 * Math.sqrt(Math.max(0.1, r0 * r0 - (y - spring) ** 2)) - 0.1), 0.07, 0.07, 0.01), { y, z: pz }, 0.85);
  // The fighting gallery over the arch: a plank floor, a timber hoarding front and back.
  site.add(TM.planks(), box(2 * X + S, 0.14, 2.0, 0.02, 4), { y: H }, 0.8);
  for (const side of [-1, 1]) {
    const z = side * 0.95;
    for (let i = 0; i < 9; i++) {
      const x = -X + 0.4 + i * ((2 * X - 0.8) / 8);
      site.add(TM.planks(), plank(1.0, 0.05, 0.62, rng, 0.8), { x, y: H + 0.62, z, rz: Math.PI / 2 }, rng.range(0.55, 0.8));
    }
    site.add(TM.timberDark(), box(2 * X - 0.4, 0.14, 0.14, 0.02), { y: H + 1.1, z }, 0.8);
  }
  for (const s of [-1, 1]) for (const z of [-0.95, 0.95]) site.box(TM.timberDark(), 0.16, 1.9, 0.16, { x: s * (X - 1.25), y: H, z }, 0.85, 0.02);
  // A pent roof of planks over the gallery.
  site.add(TM.planks(), box(2 * X - 0.2, 0.08, 2.5, 0.02, 3), { y: H + 2.0, rx: 0.18 }, 0.6);
  // Banners down the tower fronts.
  for (const s of [-1, 1]) {
    const g = clothGeo(0.9, 2.6, rng, { segsX: 4, segsY: 8, ripple: 0.04, flare: 0.1, tatter: 0.25 });
    site.add(TM.banner(), g, { x: s * X, y: H - 0.6, z: S / 2 + 0.16 }, 0.85);
    site.add(TM.timberDark(), box(1.1, 0.07, 0.07, 0.01), { x: s * X, y: H - 0.55, z: S / 2 + 0.16 }, 0.8);
  }
  // Wing walls out to the palisade.
  for (const s of [-1, 1]) {
    const x0 = s * (X + S / 2);
    const x1 = s * 6.9;
    const len = Math.abs(x1 - x0);
    const g = new THREE.BoxGeometry(len, 3.6, 0.8, 5, 4, 2);
    jag(g, rng, 0.04, 3);
    mottle(g, rng, 0.4, 2);
    site.add(TM.stone(), g, { x: (x0 + x1) / 2, y: 1.5, z: -0.2 }, 0.85);
    for (let i = 0; i < 4; i++) site.add(TM.stone(), jag(box(0.42, 0.42, 0.85, 0.04), rng, 0.02, 3), { x: x0 + s * (0.35 + i * (len - 0.5) / 3), y: 3.3, z: -0.2 }, 0.85);
    site.solid((x0 + x1) / 2, -0.2, len, 0.8);
  }
  // A flagged threshold, worn hollow, and the old ramp down into it.
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-2.0, 2.0);
    const z = rng.range(-0.6, 3.6);
    site.add(TM.stone(), jag(box(rng.range(0.6, 1.0), 0.08, rng.range(0.5, 0.9), 0.03), rng, 0.01, 4), { x, y: 0.02, z, ry: rng.range(-0.3, 0.3) }, rng.range(0.6, 0.85), false);
  }
  // Braziers on the tower tops: the gate's two lit lanterns.
  const lanterns: LanternSpec[] = [];
  for (const s of [-1, 1]) {
    site.add(TM.iron(), cyl(0.32, 0.18, 0.4, 8, true), { x: s * X, y: H + 0.5 }, 0.85);
    site.add(TM.iron(), cyl(0.05, 0.08, 0.5, 6), { x: s * X, y: H }, 0.85);
    const p = site.world(s * X, H + 0.8, 0);
    lanterns.push({ x: p.x, y: p.y, z: p.z, color: 0xb46cff, intensity: 11, distance: 15, flicker: 0.5, radius: 0.15, lit: true });
  }
  // Sandbags and a rack of spears: someone stands watch here.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      site.add(TM.canvas(), sack(rng).scale(1.15, 0.8, 1.0), { x: s * (4.7 + (i % 3) * 0.55), y: Math.floor(i / 3) * 0.32, z: 1.5 + (i % 2) * 0.15, ry: rng.range(-0.4, 0.4) }, rng.range(0.75, 0.95));
    }
    site.solid(s * 5.25, 1.55, 1.8, 0.7);
  }
  weaponRack(site, rng, -5.2, 3.6, 0);
  site.template('barrel', 0, 5.0, 3.2, 0, 1);
  site.solid(5.0, 3.2, 0.7, 0.7);
  site.template('crate', 1, 5.4, 4.1, 0.3, 0.9);
  site.solid(5.4, 4.1, 0.85, 0.85, 0.3);
  return { lanterns, portal: site.world(0, 0, 0) };
}

// ---------------------------------------------------------------------------
// Palisade and watch towers
// ---------------------------------------------------------------------------

export interface PalisadeOpts {
  R: number;
  /** Skip a stake here (the gate mouth). */
  gap: (x: number, z: number) => boolean;
  /** Footprints a torch must keep clear of (houses and their eaves). */
  avoid: Collider[];
}

/** The ring of stakes. Returns its torches (unlit bulbs). */
export function palisade(batch: TownBatch, rng: Rng, o: PalisadeOpts): LanternSpec[] {
  const site = new Site(batch, 0, 0);
  const step = 0.62;
  const total = Math.floor((Math.PI * 2 * o.R) / step);
  const torches: LanternSpec[] = [];
  const clear = (x: number, z: number, pad: number): boolean =>
    !o.avoid.some((c) => Math.abs(c.x - x) < c.w / 2 + pad && Math.abs(c.z - z) < c.d / 2 + pad);
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2;
    const x = Math.cos(a) * o.R;
    const z = Math.sin(a) * o.R;
    if (o.gap(x, z)) continue;
    const h = rng.range(3.4, 4.2);
    const r = rng.range(0.16, 0.22);
    site.add(TM.bark(), log(h, r, rng, { taper: 0.9, bend: 0.01, seg: 7 }), { x, y: -0.2, z, rx: rng.range(-0.03, 0.03), rz: rng.range(-0.03, 0.03) }, rng.range(0.75, 1));
    // Sharpened tip, the bark shaved off.
    site.add(TM.timber(), new THREE.ConeGeometry(r * 0.9, 0.55, 7).translate(0, 0.27, 0), { x, y: h - 0.22, z }, 0.9);
    site.solid(x, z, 0.36, 0.36);
    // Lashing rails inside, every third stake.
    if (i % 3 === 0) {
      for (const y of [1.0, 2.6]) {
        const g = log(step * 3.3, 0.06, rng, { taper: 0.95, bend: 0.005, seg: 5 });
        g.translate(0, -(step * 3.3) / 2, 0);
        const ri = o.R - 0.26;
        const am = a + (step * 1.5) / o.R;
        site.add(TM.timber(), g, { x: Math.cos(am) * ri, y, z: Math.sin(am) * ri, rz: Math.PI / 2, ry: -am + Math.PI / 2 }, 0.85);
      }
    }
    // A torch basket on a post every seventh stake, where nothing stands in front.
    if (i % 7 === 0) {
      const bx = Math.cos(a) * (o.R - 0.9);
      const bz = Math.sin(a) * (o.R - 0.9);
      if (!clear(bx, bz, 1.0)) continue;
      site.add(TM.timber(), log(2.6, 0.07, rng, { bend: 0.01, seg: 6 }), { x: bx, z: bz }, 0.9);
      site.add(TM.iron(), cyl(0.28, 0.16, 0.36, 8, true), { x: bx, y: 2.58, z: bz }, 0.85);
      site.solid(bx, bz, 0.12, 0.12);
      torches.push({ x: bx, y: 2.85, z: bz, color: 0xffa044, intensity: 13, distance: 17, flicker: 0.85, radius: 0.13, lit: false });
    }
  }
  return torches;
}

/** A log watch tower with a thatched cap; its lantern is an unlit bulb. */
export function watchTower(site: Site, rng: Rng, ladderSide: number): LanternSpec {
  const P = 0.9;
  const H = 4.4;
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      site.add(TM.bark(), log(H + 2.0, 0.17, rng, { taper: 0.85, bend: 0.01 }), { x: dx * P, y: -0.2, z: dz * P }, 0.9);
    }
  }
  // Braced on all four faces: the whole footprint is solid.
  site.solid(0, 0, 2 * P + 0.3, 2 * P + 0.3);
  // Cross braces on all four sides.
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    const n = P;
    for (const s of [-1, 1]) {
      const len = Math.hypot(2 * P, 2.6);
      const g = log(len, 0.06, rng, { bend: 0, taper: 0.95, seg: 5 });
      g.translate(0, -len / 2, 0);
      const ang = Math.atan2(2 * P, 2.6) * s;
      site.add(TM.timber(), g, { x: Math.sin(a) * n, y: 0.6 + 1.3, z: Math.cos(a) * n, rz: ang, ry: a }, 0.85);
    }
  }
  site.add(TM.planks(), box(2.6, 0.18, 2.6, 0.02, 3), { y: H }, 0.8);
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    for (let i = 0; i < 5; i++) {
      const u = -1.05 + i * 0.52;
      site.add(TM.planks(), plank(0.8, 0.05, 0.48, rng, 0.8), { x: Math.cos(a) * u + Math.sin(a) * 1.25, y: H + 0.55, z: -Math.sin(a) * u + Math.cos(a) * 1.25, ry: a, rz: Math.PI / 2 }, rng.range(0.55, 0.8));
    }
  }
  // Thatched cap on the post tops.
  const cap = new THREE.ConeGeometry(2.1, 1.5, 4, 3);
  cap.rotateY(Math.PI / 4);
  jag(cap, rng, 0.05, 2);
  site.add(TM.thatch(), cap, { y: H + 2.0 + 0.6 }, 0.85);
  // Ladder up the town side.
  const lz = ladderSide * 1.15;
  for (const sx of [-1, 1]) site.box(TM.timber(), 0.07, H + 0.6, 0.07, { x: sx * 0.32, z: lz }, 0.85, 0.01);
  site.solid(0, lz, 0.72, 0.12);
  for (let i = 0; i < 8; i++) site.add(TM.timber(), box(0.7, 0.06, 0.06, 0.01), { y: 0.4 + i * 0.52, z: lz }, 0.85);
  const p = site.world(0, H + 1.4, 0);
  return { x: p.x, y: p.y, z: p.z, color: 0xffa044, intensity: 9, distance: 15, flicker: 0.8, radius: 0.13, lit: false };
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

/** A dark conifer: a bare trunk and shaggy drooping skirts of needles. */
export function pine(site: Site, rng: Rng, h: number): void {
  site.add(TM.bark(), log(h * 0.92, h * 0.032, rng, { taper: 0.35, bend: 0.015, seg: 7 }), { y: -0.2 }, 0.9);
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = h * (0.27 - t * 0.19);
    const th = h * 0.22;
    const g = new THREE.ConeGeometry(r, th, 9, 2, true);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    // Droop: the rim hangs lower than the cone's base, ragged.
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      if (y < -th / 2 + 0.01) p.setY(k, y - rng.range(0.05, 0.25) * r);
    }
    g.computeVertexNormals();
    jag(g, rng, r * 0.12, 2.5 / Math.max(0.3, r));
    site.add(TM.needles(), g, { y: h * (0.28 + t * 0.62), ry: rng.range(0, 6.3) }, rng.range(0.7, 1.0));
  }
  // Square-on round the trunk: a turned box would be a smaller box.
  site.batch.solid(site.x, site.z, h * 0.058, h * 0.058);
}

// ---------------------------------------------------------------------------
// The fire, the cairn, posts, the well
// ---------------------------------------------------------------------------

/** The fire ring, logs, tripod, sitting logs and bedrolls. The flame and its light stay in Town.ts. */
export function fireRing(site: Site, rng: Rng): void {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const s = rng.range(0.24, 0.4);
    // No shadows from inside the ring: the light is right above them.
    site.add(TM.stone(), rock(s, rng, { flat: 0.6 }), { x: Math.cos(a) * 1.85, y: s * 0.25, z: Math.sin(a) * 1.85, ry: rng.range(0, 6) }, rng.range(0.6, 0.85), false);
  }
  site.add(TM.stoneDark(), jag(new THREE.CircleGeometry(1.7, 20).rotateX(-Math.PI / 2), rng, 0.02, 3), { y: 0.07 }, 0.25, false);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI + rng.range(-0.2, 0.2);
    const g = log(1.9, 0.12, rng, { taper: 0.85, bend: 0.02 });
    g.translate(0, -0.95, 0);
    site.add(TM.bark(), g, { x: Math.cos(a) * -0.2, y: 0.3 + i * 0.05, z: Math.sin(a) * -0.2, rx: Math.PI / 2 - 0.24, ry: a }, 0.55, false);
  }
  site.solid(0, 0, 3.2, 3.2);
  // Tripod and pot.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    site.add(TM.timber(), log(3.0, 0.04, rng, { taper: 0.8, bend: 0.01 }), { x: Math.cos(a) * 1.5, z: Math.sin(a) * 1.5, rx: Math.sin(a) * -0.48, rz: Math.cos(a) * 0.48 }, 0.8, false);
  }
  site.add(TM.iron(), new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6), { y: 2.2 }, 0.8, false);
  site.add(TM.iron(), new THREE.TorusGeometry(0.4, 0.03, 5, 16).rotateX(Math.PI / 2), { y: 2.3 }, 0.8, false);
  site.add(TM.iron(), box(0.02, 0.5, 0.02, 0), { y: 2.3 }, 0.8, false);
  // Sitting logs and bedrolls round it.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    const x = Math.cos(a) * 3.4;
    const z = Math.sin(a) * 3.4;
    const g = log(2.4, 0.26, rng, { taper: 0.9, bend: 0.01 });
    g.translate(0, -1.2, 0);
    // Lying along the ring's tangent.
    site.add(TM.bark(), g, { x, y: 0.24, z, rz: Math.PI / 2, ry: -a + Math.PI / 2 }, 0.8);
    site.solid(x, z, 2.3, 0.56, -a + Math.PI / 2);
    if (i % 2 === 0) {
      const b = Math.cos(a + 0.5) * 4.6;
      const c = Math.sin(a + 0.5) * 4.6;
      site.add(TM.canvas(), cyl(0.17, 0.17, 1.5, 9).translate(0, -0.75, 0), { x: b, y: 0.17, z: c, rz: Math.PI / 2, ry: -a }, 0.85);
    }
  }
}

export interface CairnBuilt {
  lanterns: LanternSpec[];
  sway: SwayItem[];
  owned: THREE.BufferGeometry[];
}

/** The memorial cairn: stacked stones, a sword driven in, ribbons, a ring of candles. */
export function cairn(site: Site, rng: Rng): CairnBuilt {
  let y = 0;
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const s = 0.75 - t * 0.5;
    const g = rock(s, rng, { flat: 0.45, rough: 0.6 });
    site.add(TM.stone(), g, { x: rng.range(-0.08, 0.08), y: y + s * 0.3, z: rng.range(-0.08, 0.08), ry: rng.range(0, 6.2) }, rng.range(0.75, 0.95));
    y += s * 0.55;
  }
  site.solid(0, 0, 1.6, 1.6);
  // The sword, blade down in the top.
  site.add(TM.iron(), box(0.1, 1.3, 0.025, 0.005), { y: y + 0.25 }, 0.95);
  site.add(TM.bronze(), box(0.5, 0.07, 0.09, 0.01), { y: y + 0.93 }, 0.9);
  site.add(TM.leather(), cyl(0.035, 0.04, 0.32, 6), { y: y + 0.96 }, 0.8);
  site.add(TM.bronze(), new THREE.SphereGeometry(0.06, 8, 6), { y: y + 1.32 }, 0.9);
  // A stake with ribbons tied on: one swaying mesh.
  site.add(TM.timber(), log(2.3, 0.05, rng, { bend: 0.01 }), { x: -1.7, z: 0.5 }, 0.9);
  site.solid(-1.7, 0.5, 0.09, 0.09);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = clothGeo(0.11, rng.range(0.5, 0.95), rng, { segsX: 2, segsY: 5, ripple: 0.1, flare: 0.1, tatter: 0.3 });
    xf(g, { x: rng.range(-0.09, 0.09), y: -i * 0.07, z: rng.range(-0.09, 0.09), ry: rng.range(0, 3) });
    parts.push(clean(g));
  }
  const ribbons = merge(parts);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(ribbons, TM.banner());
  const anchor = site.world(-1.7, 2.0, 0.5);
  mesh.position.copy(anchor);
  mesh.rotation.y = site.ry;
  mesh.castShadow = false;
  // Candles in a ring, each a bulb.
  const lanterns: LanternSpec[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cx = Math.cos(a) * 2.1;
    const cz = Math.sin(a) * 2.1;
    const h = rng.range(0.18, 0.34);
    site.add(TM.wax(), cyl(0.045, 0.055, h, 6), { x: cx, z: cz }, rng.range(0.85, 1), false);
    const p = site.world(cx, h + 0.06, cz);
    lanterns.push({ x: p.x, y: p.y, z: p.z, color: 0xffca80, intensity: 6, distance: 6, flicker: 1.0, radius: 0.04, lit: false });
  }
  return { lanterns, sway: [{ obj: mesh, phase: 1.7, amp: 0.16, axis: 'x' }], owned: [ribbons] };
}

/** A lantern post: a log, an iron arm, a hanging cage. */
export function lanternPost(site: Site, rng: Rng, lit: boolean): LanternSpec {
  site.add(TM.timber(), log(3.05, 0.09, rng, { taper: 0.75, bend: 0.01 }), { y: -0.1 }, 0.85);
  site.add(TM.stone(), rock(0.22, rng, { flat: 0.5 }), { x: 0.12, y: 0.05, z: 0.08 }, 0.8);
  site.add(TM.iron(), box(0.5, 0.05, 0.05, 0.01), { x: 0.2, y: 3.0 }, 0.85);
  site.add(TM.iron(), box(0.04, 0.3, 0.04, 0.01), { x: 0.05, y: 2.75, rz: 0.8 }, 0.85);
  site.add(TM.iron(), cyl(0.12, 0.16, 0.32, 7, true), { x: 0.24, y: 2.7 }, 0.85);
  site.add(TM.iron(), new THREE.ConeGeometry(0.15, 0.14, 7).translate(0, 0.07, 0), { x: 0.24, y: 3.02 - 0.06 }, 0.85);
  site.solid(0, 0, 0.16, 0.16);
  const p = site.world(0.24, 2.86, 0);
  return { x: p.x, y: p.y, z: p.z, color: 0xffb964, intensity: 20, distance: 24, flicker: 0.55, radius: 0.1, lit };
}

/** A stone well with a timber windlass and a little shingled hood. */
export function well(site: Site, rng: Rng): void {
  const ring = lathe([[0.7, 0], [0.92, 0], [0.86, 0.85], [0.7, 0.85]], 16);
  jag(ring, rng, 0.025, 3);
  mottle(ring, rng, 0.4, 2);
  site.add(TM.stone(), ring, { y: -0.05 }, 0.85);
  site.add(TM.stone(), jag(new THREE.TorusGeometry(0.8, 0.12, 5, 14).rotateX(Math.PI / 2), rng, 0.02, 4), { y: 0.86 }, 0.9);
  site.add(TM.timberDark(), new THREE.CircleGeometry(0.7, 14).rotateX(-Math.PI / 2), { y: 0.3 }, 0.1, false);
  for (const s of [-1, 1]) site.box(TM.timber(), 0.14, 2.1, 0.14, { x: s * 0.82 }, 0.85, 0.02);
  site.add(TM.timber(), cyl(0.08, 0.08, 1.7, 8).translate(0, -0.85, 0), { y: 1.55, rz: Math.PI / 2 }, 0.85);
  site.add(TM.rope(), cyl(0.11, 0.11, 0.6, 8).translate(0, -0.3, 0), { y: 1.55, rz: Math.PI / 2 }, 0.85);
  site.add(TM.rope(), box(0.02, 0.7, 0.02, 0), { y: 0.85 }, 0.8);
  site.add(TM.planks(), cyl(0.15, 0.13, 0.26, 8), { x: 0.0, y: 0.6 }, 0.7);
  site.add(TM.iron(), box(0.04, 0.4, 0.04, 0.01), { x: 0.92, y: 1.35, rz: 0.3 }, 0.85);
  for (const s of [-1, 1]) site.add(TM.planks(), box(2.0, 0.06, 0.8, 0.01, 2), { y: 2.05 + 0.18, z: s * 0.36, rx: s * 0.5 }, 0.65);
  // Round: one square-on box, its corners just past the rim.
  site.batch.solid(site.x, site.z, 1.5, 1.5);
}

// ---------------------------------------------------------------------------
// Yard dressing
// ---------------------------------------------------------------------------

/** A rack of spears and poles. */
export function weaponRack(site: Site, rng: Rng, x: number, z: number, ry: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (u: number): [number, number] => [x + u * c, z - u * s];
  for (const u of [-0.7, 0.7]) {
    const [px, pz] = at(u);
    site.box(TM.timber(), 0.1, 1.5, 0.1, { x: px, z: pz, ry }, 0.85, 0.01);
  }
  site.solid(x, z, 1.5, 0.3, ry);
  site.add(TM.timber(), box(1.6, 0.08, 0.12, 0.01), { x, y: 1.35, z, ry }, 0.85);
  site.add(TM.timber(), box(1.6, 0.06, 0.32, 0.01), { x, y: 0.12, z, ry }, 0.8);
  for (let i = 0; i < 5; i++) {
    const [px, pz] = at((i / 4 - 0.5) * 1.2);
    const len = rng.range(1.5, 1.9);
    const lean = rng.range(-0.1, 0.1);
    site.add(TM.timber(), cyl(0.025, 0.03, len, 5), { x: px, y: 0.12, z: pz, rz: lean, ry }, 0.85);
    site.add(TM.iron(), new THREE.ConeGeometry(0.04, 0.26, 4).translate(0, 0.13, 0), { x: px - Math.sin(lean) * len * c, y: 0.12 + len * Math.cos(lean), z: pz + Math.sin(lean) * len * s, rz: lean, ry }, 0.9);
  }
}

/** A stack of split firewood against something; `rows` high. */
export function woodpile(site: Site, rng: Rng, x: number, z: number, ry: number, rows: number): void {
  for (let r = 0; r < rows; r++) {
    const n = 6 - Math.floor(r / 2);
    for (let i = 0; i < n; i++) {
      const g = log(1.1, 0.08, rng, { taper: 0.95, bend: 0, seg: 6 });
      g.translate(0, -0.55, 0);
      const u = (i - (n - 1) / 2) * 0.17 + rng.range(-0.015, 0.015);
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      site.add(TM.timber(), g, { x: x + u * c, y: 0.08 + r * 0.15, z: z - u * s, rx: Math.PI / 2, ry }, rng.range(0.7, 1));
    }
  }
  site.solid(x, z, 1.1, 1.2, ry);
}

/** A training dummy: post, straw body, crossbar, arrows in it. */
export function dummy(site: Site, rng: Rng, x: number, z: number, lean: number): void {
  site.add(TM.timber(), log(1.6, 0.09, rng, { bend: 0.01 }), { x, z }, 0.85);
  site.add(TM.straw(), new THREE.CylinderGeometry(0.21, 0.23, 0.9, 9, 3).translate(0, 0.45, 0), { x, y: 1.1, z, rz: lean }, 0.9);
  site.add(TM.timber(), box(1.4, 0.07, 0.07, 0.01), { x, y: 1.85, z, ry: rng.range(-0.4, 0.4) }, 0.85);
  site.add(TM.hide(), new THREE.SphereGeometry(0.21, 9, 7).scale(1, 1.15, 1), { x, y: 2.25, z }, 0.85);
  for (let i = 0; i < 3; i++) site.add(TM.timber(), cyl(0.012, 0.014, 0.5, 4), { x: x + rng.range(-0.14, 0.14), y: 1.35 + rng.range(-0.15, 0.3), z: z + 0.15, rx: Math.PI / 2 + rng.range(-0.2, 0.2) }, 0.8, false);
  site.solid(x, z, 0.3, 0.3);
}

/** A round straw bale on its side. */
export function bale(site: Site, rng: Rng, x: number, z: number, ry: number): void {
  const g = new THREE.CylinderGeometry(0.6, 0.6, 1.1, 14, 2);
  jag(g, rng, 0.03, 3);
  g.rotateZ(Math.PI / 2);
  site.add(TM.straw(), g, { x, y: 0.58, z, ry }, 0.9);
  site.solid(x, z, 1.1, 1.2, ry);
}

/** A washing line between two posts, the washing one swaying mesh. */
export function washLine(site: Site, rng: Rng, x1: number, z1: number, x2: number, z2: number, count: number): { sway: SwayItem; owned: THREE.BufferGeometry } {
  for (const [x, z] of [[x1, z1], [x2, z2]] as Array<[number, number]>) {
    site.add(TM.timber(), log(2.4, 0.06, rng, { bend: 0.01 }), { x, z }, 0.85);
    site.solid(x, z, 0.11, 0.11);
  }
  const len = Math.hypot(x2 - x1, z2 - z1);
  const yaw = Math.atan2(x2 - x1, z2 - z1);
  site.add(TM.rope(), cyl(0.012, 0.012, len, 4).translate(0, -len / 2, 0), { x: x1, y: 2.3, z: z1, rx: Math.PI / 2, ry: yaw }, 0.8, false);
  // The washing, in the line's own frame, swung as one.
  const parts: THREE.BufferGeometry[] = [];
  const mats = [0xa79880, 0x8f8471, 0x6a5a44];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.7) / (count + 0.4);
    const w = rng.range(0.4, 0.7);
    const h = rng.range(0.5, 1.0);
    const g = clothGeo(w, h, rng, { segsX: 4, segsY: 6, ripple: 0.06, flare: 0.15, tatter: rng.next() < 0.3 ? 0.25 : 0 });
    xf(g, { x: 0, y: -0.02, z: (t - 0.5) * len, ry: Math.PI / 2 });
    const col = new THREE.Color(mats[i % mats.length]!);
    clean(g);
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let k = 0; k < c.count; k++) c.setXYZ(k, col.r * 1.4, col.g * 1.4, col.b * 1.4);
    parts.push(g);
  }
  const geo = merge(parts);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, TM.linen());
  mesh.position.set((x1 + x2) / 2, 2.28, (z1 + z2) / 2);
  mesh.position.set(site.wx(mesh.position.x, mesh.position.z), site.y + 2.28, site.wz((x1 + x2) / 2, (z1 + z2) / 2));
  mesh.rotation.y = site.ry + yaw;
  mesh.castShadow = true;
  return { sway: { obj: mesh, phase: rng.range(0, 100), amp: 0.055, axis: 'z' }, owned: geo };
}

/** A drying rack of pelts, the pelts one swaying mesh. */
export function peltRack(site: Site, rng: Rng, x: number, z: number, ry: number): { sway: SwayItem; owned: THREE.BufferGeometry } {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const u of [-1.6, 1.6]) {
    site.add(TM.timber(), log(2.2, 0.07, rng, { bend: 0.01 }), { x: x + u * c, z: z - u * s }, 0.85);
    site.solid(x + u * c, z - u * s, 0.12, 0.12);
  }
  site.add(TM.timber(), cyl(0.05, 0.05, 3.4, 6).translate(0, -1.7, 0), { x: x - 1.7 * c, y: 2.1, z: z + 1.7 * s, rz: Math.PI / 2, ry }, 0.85);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = clothGeo(0.8, 1.2, rng, { segsX: 4, segsY: 6, ripple: 0.07, flare: 0.3, tatter: 0.2 });
    xf(g, { x: -1.1 + i * 1.1 });
    parts.push(clean(g));
  }
  const geo = merge(parts);
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, TM.hide());
  mesh.position.set(site.wx(x, z), site.y + 2.05, site.wz(x, z));
  mesh.rotation.y = site.ry + ry;
  mesh.castShadow = true;
  return { sway: { obj: mesh, phase: rng.range(0, 100), amp: 0.05, axis: 'x' }, owned: geo };
}

/** A grain sack dropped on the ground. */
export function sackAt(site: Site, rng: Rng, x: number, z: number, s = 1, y = 0): void {
  site.add(TM.canvas(), sack(rng).scale(s, s, s), { x, y, z, ry: rng.range(0, 6.3), rx: rng.range(-0.08, 0.08) }, rng.range(0.75, 0.95));
}

/** A bench of a split log on two stumps. */
export function bench(site: Site, rng: Rng, x: number, z: number, ry: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const u of [-0.6, 0.6]) site.add(TM.bark(), log(0.42, 0.13, rng, { bend: 0, taper: 0.95 }), { x: x + u * c, z: z - u * s }, 0.8);
  site.add(TM.timber(), box(1.7, 0.09, 0.34, 0.02, 3), { x, y: 0.42, z, ry }, 0.85);
  site.solid(x, z, 1.7, 0.4, ry);
}
