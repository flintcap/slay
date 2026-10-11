/**
 * SLAY — the town's buildings.
 *
 * Timber-framed houses on rubble footings: dark oak posts, rails and braces
 * over pale plaster, a deep thatch roof that hides most of the wall from the
 * camera, a stone chimney at one gable end. The smithy, the merchant's shop,
 * the strongroom and the apothecary are the same vocabulary bent to a trade.
 *
 * Every builder works in a `Site` (local +Z is the front) and writes straight
 * into the town's batch, with a footprint collider for each solid part it
 * draws. Nothing here owns a material; the few lit things (window glow,
 * coals) use the shared glow materials.
 */
import * as THREE from 'three';
import type { Rng } from '../../../types';
import { box, cyl, jag, log, mottle, plank, rock, sag, cloth as clothGeo } from '../Kit';
import { glowMat } from '../PropMats';
import { TM, Site, gable, type LanternSpec } from './TownKit';

/** What a building hands back besides its geometry. */
export interface Built {
  lanterns: LanternSpec[];
  smoke: THREE.Vector3[];
}

const none = (): Built => ({ lanterns: [], smoke: [] });

/** A window's warm glow at night: lived-in without a real light. */
const WINDOW_GLOW = (): THREE.Material => glowMat(0xffa24a, 1.25);
/** An unlit window: a dark pane in a frame. */
const PANE = (): THREE.Material => TM.timberDark();

interface Opening {
  u: number;
  w: number;
  /** Bottom and top, metres above the sill. */
  y0: number;
  y1: number;
  kind: 'door' | 'window';
}

/** A face of a box building: its yaw, length and how far out it stands. */
interface Face {
  fy: number;
  len: number;
  n0: number;
}

function faces(w: number, d: number): Face[] {
  return [
    { fy: 0, len: w, n0: d / 2 },
    { fy: Math.PI / 2, len: d, n0: w / 2 },
    { fy: Math.PI, len: w, n0: d / 2 },
    { fy: -Math.PI / 2, len: d, n0: w / 2 },
  ];
}

/** Puts a shape on a face: `u` along it, `y` up, `n` out from the building centre. */
function onFace(site: Site, f: Face, mat: THREE.Material, geo: THREE.BufferGeometry, u: number, y: number, n: number, rz = 0, tone?: number, cast = true): void {
  const c = Math.cos(f.fy);
  const s = Math.sin(f.fy);
  site.add(mat, geo, { x: u * c + n * s, y, z: -u * s + n * c, ry: f.fy, rz }, tone, cast);
}

/**
 * The frame on one face: sill, top plate, a rail above head height, studs and
 * corner braces, skipping the openings. Proud of the plaster by a few cm.
 */
function timberFace(site: Site, rng: Rng, f: Face, y0: number, y1: number, open: Opening[], rail: number): void {
  const T = TM.timberDark();
  const n = f.n0 + 0.035;
  const H = y1 - y0;
  const L = f.len;
  const beam = (len: number, th: number): THREE.BufferGeometry => jag(box(len, th, 0.1, 0.02, Math.max(1, Math.round(len / 0.6))), rng, 0.012, 3);
  onFace(site, f, T, beam(L + 0.08, 0.17), 0, y0 + 0.085, n, 0, rng.range(0.8, 1));
  onFace(site, f, T, beam(L + 0.08, 0.18), 0, y1 - 0.09, n, 0, rng.range(0.8, 1));
  onFace(site, f, T, beam(L, 0.14), 0, y0 + rail, n, 0, rng.range(0.75, 0.95));
  // Studs.
  const bays = Math.max(2, Math.round(L / 1.15));
  const blocked = (u: number, pad: number): boolean => open.some((o) => Math.abs(u - o.u) < o.w / 2 + pad);
  for (let i = 0; i <= bays; i++) {
    const u = -L / 2 + (i / bays) * L;
    const edge = i === 0 || i === bays;
    if (!edge && blocked(u, 0.14)) {
      // Above an opening the stud still runs from the rail to the plate.
      onFace(site, f, T, box(0.15, H - rail - 0.16, 0.1, 0.02), u, y0 + rail + (H - rail) / 2, n, 0, rng.range(0.75, 0.95));
      continue;
    }
    const u2 = edge ? u + (i === 0 ? 0.06 : -0.06) : u;
    onFace(site, f, T, box(0.17, H, 0.1, 0.02, 2), u2, y0 + H / 2, n + (edge ? 0.01 : 0), 0, rng.range(0.8, 1));
  }
  // Braces in the end bays, below the rail: the cross-timbers that sell it.
  const bayW = L / bays;
  for (const side of [-1, 1]) {
    const uA = side * (L / 2 - 0.1);
    const uB = side * (L / 2 - bayW + 0.08);
    if (blocked((uA + uB) / 2, 0.2)) continue;
    const dx = uB - uA;
    const dy = rail - 0.2;
    const len = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    onFace(site, f, T, box(len, 0.13, 0.09, 0.02, 2), (uA + uB) / 2, y0 + 0.17 + dy / 2, n - 0.005, a, rng.range(0.75, 0.95));
  }
  // Short braces above the rail in the middle bays.
  if (L > 3.4 && !blocked(0, 0.1)) {
    for (const side of [-1, 1]) {
      const dx = side * 0.5;
      const dy = H - rail - 0.3;
      onFace(site, f, T, box(Math.hypot(dx, dy), 0.12, 0.09, 0.02), dx / 2, y0 + rail + 0.08 + dy / 2, n - 0.005, Math.atan2(dy, dx), 0.85);
    }
  }
}

/** A door with its frame and a step: boards, two iron straps, a ring. */
function door(site: Site, rng: Rng, f: Face, u: number, y0: number, w = 1.0, h = 1.95): void {
  const n = f.n0 + 0.05;
  const boards = 4;
  for (let i = 0; i < boards; i++) {
    const bw = w / boards;
    const g = plank(h, 0.06, bw - 0.012, rng, 0.6);
    onFace(site, f, TM.planks(), g, u - w / 2 + bw * (i + 0.5), y0 + h / 2, n, Math.PI / 2, rng.range(0.55, 0.8));
  }
  for (const y of [0.35, h - 0.4]) onFace(site, f, TM.iron(), box(w * 0.92, 0.07, 0.02, 0.008), u, y0 + y, n + 0.04, 0, 0.9);
  onFace(site, f, TM.iron(), new THREE.TorusGeometry(0.07, 0.012, 4, 10), u + w * 0.3, y0 + h * 0.5, n + 0.06, 0, 0.9);
  // Frame: two jambs and a lintel, heavier than the wall timbers.
  for (const s of [-1, 1]) onFace(site, f, TM.timberDark(), box(0.16, h + 0.1, 0.14, 0.02), u + s * (w / 2 + 0.07), y0 + (h + 0.1) / 2, n, 0, 0.8);
  onFace(site, f, TM.timberDark(), box(w + 0.46, 0.2, 0.16, 0.02), u, y0 + h + 0.12, n, 0, 0.75);
  // A worn stone step.
  const step = jag(box(w + 0.4, 0.2, 0.5, 0.04, 2), rng, 0.02, 4);
  onFace(site, f, TM.stone(), step, u, y0 - 0.1, f.n0 + 0.3, 0, 0.85);
}

/** A window: dark or glowing pane, frame, sill, mullion, shutters. */
function windowAt(site: Site, rng: Rng, f: Face, u: number, y0: number, w: number, h: number, lit: boolean): void {
  const n = f.n0 + 0.04;
  onFace(site, f, lit ? WINDOW_GLOW() : PANE(), box(w, h, 0.03, 0.005), u, y0 + h / 2, n, 0, lit ? 1 : 0.2, false);
  const T = TM.timberDark();
  for (const s of [-1, 1]) onFace(site, f, T, box(0.09, h + 0.1, 0.08, 0.015), u + s * (w / 2 + 0.03), y0 + h / 2, n + 0.02, 0, 0.8);
  onFace(site, f, T, box(w + 0.16, 0.09, 0.08, 0.015), u, y0 + h + 0.04, n + 0.02, 0, 0.8);
  onFace(site, f, T, box(0.05, h, 0.06, 0.01), u, y0 + h / 2, n + 0.03, 0, 0.7);
  onFace(site, f, T, box(w, 0.05, 0.06, 0.01), u, y0 + h * 0.55, n + 0.03, 0, 0.7);
  onFace(site, f, TM.stone(), box(w + 0.24, 0.08, 0.16, 0.02), u, y0 - 0.04, n + 0.05, 0, 0.9);
  // Shutters: one or both, open flat to the wall or hanging askew.
  for (const s of [-1, 1]) {
    if (rng.next() < 0.25) continue;
    const g = box(w / 2, h, 0.04, 0.01, 2);
    const hang = rng.next() < 0.2 ? rng.range(-0.12, 0.12) : 0;
    onFace(site, f, TM.planks(), g, u + s * (w * 0.75 + 0.08), y0 + h / 2, n + 0.03, hang, rng.range(0.55, 0.8));
  }
}

/** A bracketed wall lantern beside a door; the bulb is a lantern spec. */
function wallLantern(site: Site, f: Face, u: number, y: number, lit: boolean, color = 0xffb35c, intensity = 8, distance = 12): LanternSpec {
  const n = f.n0 + 0.05;
  onFace(site, f, TM.iron(), box(0.05, 0.05, 0.42, 0.01), u, y + 0.25, n + 0.2, 0, 0.9);
  onFace(site, f, TM.iron(), box(0.05, 0.36, 0.05, 0.01), u, y + 0.08, n + 0.02, 0, 0.9);
  onFace(site, f, TM.iron(), cyl(0.09, 0.12, 0.26, 6, true), u, y - 0.13, n + 0.4, 0, 0.9);
  const c = Math.cos(f.fy);
  const s = Math.sin(f.fy);
  const lx = u * c + (n + 0.4) * s;
  const lz = -u * s + (n + 0.4) * c;
  const p = site.world(lx, y, lz);
  return { x: p.x, y: p.y, z: p.z, color, intensity, distance, flicker: 0.6, radius: 0.1, lit };
}

export interface RoofOpts {
  /** Ridge along local X at this height above the wall top. */
  rise: number;
  over: number;
  kind: 'thatch' | 'slate' | 'planks';
}

/** A pitched roof over a w x d box whose walls stop at `top`. Gables at the X ends. */
function roof(site: Site, rng: Rng, w: number, d: number, top: number, o: RoofOpts, gables = true): void {
  const a = Math.atan2(o.rise, d / 2);
  const run = d / 2 + o.over;
  const len = run / Math.cos(a);
  const th = o.kind === 'thatch' ? 0.42 : o.kind === 'slate' ? 0.14 : 0.1;
  const mat = o.kind === 'thatch' ? TM.thatch() : o.kind === 'slate' ? TM.slate() : TM.planks();
  const W = w + o.over * 1.4;
  for (const side of [-1, 1]) {
    // Centre of the slab: halfway down the slope, lifted by half its thickness.
    const zc = side * (run / 2);
    const yc = top + o.rise - Math.tan(a) * (run / 2) + (th / 2) / Math.cos(a);
    const segX = Math.max(2, Math.round(W / 0.5));
    const g = o.kind === 'thatch' ? box(W, th, len, 0.14, 1) : box(W, th, len, 0.03, 1);
    if (o.kind === 'thatch') {
      const seg = new THREE.BoxGeometry(W, th, len, segX, 1, 6);
      jag(seg, rng, 0.05, 1.6);
      sag(seg, 0.08, 'x');
      mottle(seg, rng, 0.35, 1.4);
      site.add(mat, seg, { y: yc, z: zc, rx: side * a }, rng.range(0.8, 0.95));
      g.dispose();
    } else {
      mottle(g, rng, 0.25, 2);
      site.add(mat, g, { y: yc, z: zc, rx: side * a }, rng.range(0.85, 1));
    }
  }
  // Ridge.
  if (o.kind === 'thatch') {
    const r = new THREE.CylinderGeometry(0.26, 0.26, W - 0.1, 10, 4);
    jag(r, rng, 0.04, 2);
    site.add(mat, r, { y: top + o.rise + 0.18, rz: Math.PI / 2 }, 0.78);
  } else {
    site.add(o.kind === 'slate' ? TM.stoneDark() : TM.timberDark(), box(W + 0.04, 0.14, 0.26, 0.03), { y: top + o.rise + th * 0.7 }, 0.85);
  }
  if (!gables) return;
  // Gable walls: plaster triangles framed in timber.
  for (const sx of [-1, 1]) {
    const gx = sx * (w / 2 - 0.1);
    site.add(TM.plaster(), gable(d - 0.02, o.rise, 0.2), { x: gx, y: top, ry: Math.PI / 2 }, rng.range(0.85, 1));
    const n = sx * (w / 2 + 0.035);
    const T = TM.timberDark();
    // King post and the two rafters along the gable's edges.
    site.add(T, box(0.15, o.rise - 0.1, 0.1, 0.02), { x: n, y: top + (o.rise - 0.1) / 2, ry: Math.PI / 2 }, 0.85);
    const rl = Math.hypot(d / 2 + 0.25, o.rise);
    for (const s2 of [-1, 1]) {
      site.add(T, box(rl, 0.18, 0.12, 0.02), { x: n + sx * 0.02, y: top + o.rise / 2 - 0.05, z: s2 * (d / 4), ry: Math.PI / 2, rz: s2 * a }, 0.8);
    }
    site.add(T, box(d * 0.55, 0.13, 0.1, 0.02), { x: n, y: top + o.rise * 0.45, ry: Math.PI / 2 }, 0.8);
  }
}

/** A rubble footing w x d, top at `y`, bedded into the ground. */
function footing(site: Site, rng: Rng, w: number, d: number, y: number, z = 0): void {
  const g = new THREE.BoxGeometry(w, y + 0.3, d, Math.max(2, Math.round(w / 0.5)), 2, Math.max(2, Math.round(d / 0.5)));
  jag(g, rng, 0.035, 3);
  mottle(g, rng, 0.4, 2.5);
  site.add(TM.stone(), g, { y: (y - 0.3) / 2, z }, rng.range(0.8, 0.95));
}

/** A stone chimney stack at local (x, z), `h` tall. Returns the smoke point. */
function chimney(site: Site, rng: Rng, x: number, z: number, h: number): THREE.Vector3 {
  const g = new THREE.BoxGeometry(0.85, h, 0.85, 2, Math.max(2, Math.round(h / 0.5)), 2);
  jag(g, rng, 0.03, 3);
  mottle(g, rng, 0.4, 2);
  site.add(TM.stone(), g, { x, y: h / 2, z }, 0.85);
  site.add(TM.stoneDark(), box(1.0, 0.18, 1.0, 0.03), { x, y: h - 0.05, z }, 0.8);
  site.add(TM.stoneDark(), box(0.5, 0.12, 0.5, 0.02), { x, y: h + 0.12, z }, 0.3);
  site.block(x, z, 0.85);
  return site.world(x, h + 0.4, z);
}

export interface HouseOpts {
  w: number;
  d: number;
  /** Wall top above the footing. */
  h?: number;
  roof?: RoofOpts['kind'];
  /** Chimney on the -X or +X gable, or none. */
  chimney?: -1 | 1 | 0;
  /** Chance each window glows. */
  lit?: number;
  lantern?: boolean;
}

/** A timber-framed house. Front (door) faces local +Z. */
export function house(site: Site, rng: Rng, o: HouseOpts): Built & { door: number } {
  const out = none();
  const { w, d } = o;
  const h = o.h ?? 2.9;
  const sill = 0.42;
  footing(site, rng, w + 0.24, d + 0.24, sill);
  // Plaster infill, a touch inside the frame line.
  const P = TM.plaster();
  const ph = h - sill;
  site.add(P, box(w - 0.02, ph, 0.2, 0.01, 2), { y: sill + ph / 2, z: d / 2 - 0.1 }, rng.range(0.85, 1));
  site.add(P, box(w - 0.02, ph, 0.2, 0.01, 2), { y: sill + ph / 2, z: -d / 2 + 0.1 }, rng.range(0.85, 1));
  for (const s of [-1, 1]) site.add(P, box(0.2, ph, d - 0.4, 0.01, 2), { x: s * (w / 2 - 0.1), y: sill + ph / 2 }, rng.range(0.85, 1));

  const F = faces(w, d);
  const doorU = rng.range(-0.25, 0.25) * w;
  const rail = 2.0 - sill + 0.1;
  const lit = o.lit ?? 0.5;
  F.forEach((f, i) => {
    const open: Opening[] = [];
    if (i === 0) open.push({ u: doorU, w: 1.0, y0: 0, y1: 1.95, kind: 'door' });
    // Windows in the bays clear of the door.
    const slots = i % 2 === 0 ? [-0.3, 0.3] : [0];
    for (const t of slots) {
      const u = t * f.len;
      if (open.some((q) => Math.abs(q.u - u) < q.w / 2 + 0.75)) continue;
      if (i === 2 && rng.next() < 0.4) continue;
      open.push({ u, w: 0.7, y0: 0.62, y1: 1.32, kind: 'window' });
    }
    timberFace(site, rng, f, sill, h, open, rail);
    for (const q of open) {
      if (q.kind === 'door') door(site, rng, f, q.u, sill);
      else windowAt(site, rng, f, q.u, sill + q.y0, q.w, q.y1 - q.y0, rng.next() < lit);
    }
    if (i === 0 && o.lantern) out.lanterns.push(wallLantern(site, f, doorU + 0.95, sill + 1.95, false));
  });
  const kind = o.roof ?? 'thatch';
  const rise = d * (kind === 'thatch' ? 0.62 : 0.5);
  roof(site, rng, w, d, h, { rise, over: kind === 'thatch' ? 0.62 : 0.4, kind });
  site.solid(0, 0, w + 0.24, d + 0.24);
  if (o.chimney) out.smoke.push(chimney(site, rng, o.chimney * (w / 2 + 0.42), -d * 0.12, h + rise + 0.7));
  return { ...out, door: doorU };
}

// ---------------------------------------------------------------------------
// The smithy
// ---------------------------------------------------------------------------

/**
 * The smithy: an open-fronted shed with a rubble back wall and a half west
 * wall, slate roof, the hearth and its chimney against the back. The anvil
 * stands on its stump out in front, under the sky, so the smith is seen
 * working from across the town. Front faces local +Z. The forge light and
 * its lantern stay in Town.ts; `forgeLight` says where the coals are.
 */
export function smithy(site: Site, rng: Rng): Built & { forgeLight: THREE.Vector3; lantern: THREE.Vector3 } {
  const W = 6.4;
  const D = 4.0;
  const oz = -1.0;
  const top = 3.0;
  const S = TM.stone();
  const T = TM.timberDark();
  // The shed in its own frame, pushed back so its eave stops short of the anvil.
  const shed = new Site(site.batch, site.wx(0, oz), site.wz(0, oz), site.ry, site.y);
  const wall = (w: number, d: number, x: number, z: number): void => {
    const g = new THREE.BoxGeometry(w, top + 0.3, d, Math.max(2, Math.round(w / 0.5)), 4, Math.max(1, Math.round(d / 0.5)));
    jag(g, rng, 0.04, 3);
    mottle(g, rng, 0.4, 2.5);
    shed.add(S, g, { x, y: (top - 0.3) / 2, z }, rng.range(0.8, 0.95));
    shed.solid(x, z, w, d);
  };
  wall(W, 0.4, 0, -D / 2 + 0.2);
  wall(0.4, 2.0, -W / 2 + 0.2, -D / 2 + 1.4);
  // Posts carrying the open sides.
  for (const [px, pz] of [[W / 2 - 0.15, D / 2 - 0.15], [-W / 2 + 0.15, D / 2 - 0.15], [W / 2 - 0.15, -0.3]] as Array<[number, number]>) {
    shed.add(T, jag(box(0.24, top, 0.24, 0.03, 3), rng, 0.015, 3), { x: px, y: top / 2, z: pz }, 0.85);
    shed.add(S, jag(box(0.42, 0.3, 0.42, 0.05), rng, 0.02, 3), { x: px, y: -0.05, z: pz }, 0.8);
    shed.solid(px, pz, 0.3, 0.3);
  }
  shed.add(T, box(W, 0.22, 0.2, 0.02, 4), { y: top - 0.11, z: D / 2 - 0.15 }, 0.8);
  for (const s of [-1, 1]) shed.add(T, box(0.2, 0.22, D, 0.02, 4), { x: s * (W / 2 - 0.15), y: top - 0.11 }, 0.8);
  const rise = 1.4;
  roof(shed, rng, W, D, top, { rise, over: 0.4, kind: 'slate' }, false);
  // Trusses at both ends; the west gable is boarded, the east left open.
  {
    const a = Math.atan2(rise, D / 2);
    const rl = Math.hypot(D / 2 + 0.2, rise);
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.15);
      shed.add(T, box(0.16, rise - 0.1, 0.14, 0.02), { x, y: top + (rise - 0.1) / 2 }, 0.8);
      for (const s2 of [-1, 1]) shed.add(T, box(rl, 0.2, 0.14, 0.02), { x, y: top + rise / 2 - 0.05, z: s2 * (D / 4), ry: Math.PI / 2, rz: s2 * a }, 0.8);
    }
    shed.add(TM.planks(), gable(D - 0.1, rise - 0.05, 0.06), { x: -W / 2 + 0.1, y: top, ry: Math.PI / 2 }, 0.7);
  }
  // Hearth: a stone box, live coals, an iron hood, the chimney up through the roof.
  const hx = -1.5;
  const hz = -D / 2 + 1.15;
  const hearth = new THREE.BoxGeometry(2.4, 1.05, 1.5, 4, 2, 3);
  jag(hearth, rng, 0.03, 3);
  shed.add(S, hearth, { x: hx, y: 0.525, z: hz }, 0.8);
  shed.solid(hx, hz, 2.4, 1.5);
  shed.add(glowMat(0xff5a14, 2.2), jag(box(1.9, 0.14, 0.95, 0.03, 3), rng, 0.03, 4), { x: hx, y: 1.0, z: hz }, 1, false);
  for (let i = 0; i < 9; i++) shed.add(TM.stoneDark(), rock(0.09, rng), { x: hx + rng.range(-0.85, 0.85), y: 1.12, z: hz + rng.range(-0.35, 0.35) }, 0.25, false);
  const hood = new THREE.CylinderGeometry(0.45, 1.5, 1.3, 4, 1, true);
  hood.rotateY(Math.PI / 4);
  shed.add(TM.rust(), hood, { x: hx, y: 2.1, z: hz }, 0.9);
  const smoke = chimney(shed, rng, hx, hz - 0.2, 5.6);
  // Bellows beside the hearth.
  shed.add(T, box(0.5, 0.06, 1.0, 0.01), { x: hx + 1.55, y: 0.7, z: hz + 0.1, rx: 0.1 }, 0.8);
  shed.add(TM.leather(), new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8, 1).rotateX(Math.PI / 2), { x: hx + 1.55, y: 0.85, z: hz + 0.1, sy: 0.5 }, 0.8);
  shed.add(T, box(0.5, 0.06, 1.0, 0.01), { x: hx + 1.55, y: 1.0, z: hz + 0.1, rx: -0.1 }, 0.8);
  shed.solid(hx + 1.55, hz + 0.1, 0.55, 1.0);
  // Tool wall on the back, and the quench trough.
  for (let i = 0; i < 6; i++) {
    const tx = 0.55 + i * 0.32;
    shed.add(T, box(0.04, 0.55, 0.04, 0.005), { x: tx, y: 1.4, z: -D / 2 + 0.44, rz: rng.range(-0.06, 0.06) }, 0.8);
    shed.add(TM.iron(), box(i % 2 ? 0.16 : 0.08, i % 2 ? 0.08 : 0.24, 0.05, 0.01), { x: tx, y: 1.7, z: -D / 2 + 0.44 }, 0.9);
  }
  shed.add(T, box(2.2, 0.08, 0.1, 0.01), { x: 1.35, y: 1.95, z: -D / 2 + 0.44 }, 0.8);
  shed.add(TM.planks(), box(1.4, 0.6, 0.76, 0.03), { x: 2.3, y: 0.3, z: -D / 2 + 0.9 }, 0.7);
  shed.add(TM.timberDark(), box(1.26, 0.04, 0.62, 0.005), { x: 2.3, y: 0.58, z: -D / 2 + 0.9 }, 0.2, false);
  shed.solid(2.3, -D / 2 + 0.9, 1.4, 0.76);
  for (let i = 0; i < 5; i++) shed.add(TM.rust(), box(1.4, 0.06, 0.06, 0.01), { x: 2.5 + rng.range(-0.05, 0.05), y: 0.03 + (i % 3) * 0.06, z: 0.2 + i * 0.09, ry: rng.range(-0.1, 0.1) }, 0.9, false);
  // Out front: the anvil on its stump, the stock beside the west post.
  site.add(TM.bark(), log(0.62, 0.42, rng, { taper: 0.92, bend: 0 }), { x: 1.2, y: -0.05, z: 1.7 }, 0.8);
  site.template('anvil', 0, 1.2, 1.7, 0.2, 1, 0.55);
  site.solid(1.2, 1.7, 0.85, 0.85);
  // Ankle high: stepped over, not walked round.
  site.template('ingotStack', 0, -2.4, 1.6, 0.4);
  site.template('barrel', 1, -2.85, 0.6, 0.5, 0.95);
  site.solid(-2.85, 0.6, 0.7, 0.7);
  return {
    lanterns: [],
    smoke: [smoke],
    forgeLight: shed.world(hx, 1.5, hz + 0.35),
    lantern: shed.world(W / 2 - 0.15, 2.7, D / 2 + 0.1),
  };
}

// ---------------------------------------------------------------------------
// The merchant's shop
// ---------------------------------------------------------------------------

/**
 * The merchant's shop: a timber-framed house whose front wall is a counter
 * under a striped awning, the shutter let down as the shelf. Front faces
 * local +Z (the shopkeeper stands outside it).
 */
export function shop(site: Site, rng: Rng): Built {
  const out = none();
  const w = 5.0;
  const d = 3.4;
  const h = 3.2;
  const sill = 0.42;
  const rise = d * 0.5;
  footing(site, rng, w + 0.24, d + 0.24, sill);
  const P = TM.plaster();
  const ph = h - sill;
  site.add(P, box(w - 0.02, ph, 0.2, 0.01, 2), { y: sill + ph / 2, z: -d / 2 + 0.1 }, 0.9);
  for (const s of [-1, 1]) site.add(P, box(0.2, ph, d - 0.4, 0.01, 2), { x: s * (w / 2 - 0.1), y: sill + ph / 2 }, 0.9);
  // Front: plaster below the counter and above the opening, a dark shop inside.
  site.add(P, box(w - 0.02, 0.6, 0.2, 0.01), { y: sill + 0.3, z: d / 2 - 0.1 }, 0.9);
  site.add(P, box(w - 0.02, 0.55, 0.2, 0.01), { y: h - 0.275, z: d / 2 - 0.1 }, 0.9);
  site.box(TM.timberDark(), w - 0.4, ph - 1.1, 0.05, { y: sill + 0.6, z: -d / 2 + 0.25 }, 0.25, 0.01);
  site.add(TM.timberDark(), box(w - 0.4, 0.04, d - 0.5, 0.01), { y: sill + 0.02 }, 0.3);
  const F = faces(w, d);
  timberFace(site, rng, F[0]!, sill, h, [{ u: 0, w: w - 0.9, y0: 0.6, y1: ph - 0.55, kind: 'window' }], 0.6);
  timberFace(site, rng, F[1]!, sill, h, [{ u: 0, w: 0.7, y0: 0.62, y1: 1.32, kind: 'window' }], 2.0 - sill + 0.1);
  windowAt(site, rng, F[1]!, 0, sill + 0.62, 0.7, 0.7, true);
  timberFace(site, rng, F[2]!, sill, h, [], 2.0 - sill + 0.1);
  timberFace(site, rng, F[3]!, sill, h, [{ u: 0, w: 1.0, y0: 0, y1: 1.95, kind: 'door' }], 2.0 - sill + 0.1);
  door(site, rng, F[3]!, 0, sill);
  // The counter: the shutter let down on chains, goods laid on it.
  const cz = d / 2 + 0.32;
  site.add(TM.planks(), box(w - 0.7, 0.08, 0.7, 0.02, 3), { y: sill + 0.62, z: cz }, 0.8);
  for (const s of [-1, 1]) {
    site.add(TM.timberDark(), box(0.1, 0.6, 0.1, 0.01), { x: s * (w / 2 - 0.5), y: sill + 0.32, z: cz + 0.28, rx: 0.25 }, 0.8);
  }
  const wares: Array<(x: number) => void> = [
    (x) => site.add(TM.cloth(0x6a2a24), cyl(0.12, 0.12, 0.55, 8).rotateZ(Math.PI / 2), { x, y: sill + 0.66, z: cz, ry: rng.range(-0.3, 0.3) }, 0.9),
    (x) => site.add(TM.cloth(0x2c3a5a), cyl(0.12, 0.12, 0.55, 8).rotateZ(Math.PI / 2), { x, y: sill + 0.66, z: cz, ry: rng.range(-0.3, 0.3) }, 0.9),
    (x) => site.add(TM.iron(), box(0.5, 0.05, 0.12, 0.01), { x, y: sill + 0.69, z: cz, ry: rng.range(-0.5, 0.5) }, 0.9),
    (x) => site.add(TM.bronze(), cyl(0.07, 0.09, 0.22, 8), { x, y: sill + 0.66, z: cz }, 0.9),
    (x) => site.add(TM.canvas(), sack(rng).scale(0.8, 0.8, 0.8), { x, y: sill + 0.66, z: cz }, 0.85),
  ];
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + 0.75 + (i / 6) * (w - 1.5) + rng.range(-0.1, 0.1);
    wares[rng.int(0, wares.length - 1)]!(x);
  }
  // Striped awning over the counter on two poles.
  const aw = w + 0.4;
  const stripes = 8;
  // The awning hangs from just under the eave and drops 0.62 m over 1.57 m.
  const awTop = h - 0.45;
  const awAt = (dz: number): number => awTop - 0.62 * (dz / 1.57);
  for (let i = 0; i < stripes; i++) {
    const g = new THREE.PlaneGeometry(aw / stripes, 1.7, 1, 4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin((p.getY(k) / 1.7 + 0.5) * Math.PI) * 0.08);
    g.rotateX(-Math.PI / 2 + 0.38);
    site.add(i % 2 ? TM.cloth(0x7a2a22) : TM.cloth(0xa89a7a), g, { x: -aw / 2 + (i + 0.5) * (aw / stripes), y: awTop - 0.31, z: d / 2 + 0.78 }, 0.9);
  }
  // A scalloped valance along the awning's lip.
  for (let i = 0; i < stripes; i++) {
    const g = clothGeo(aw / stripes, 0.24, rng, { segsX: 2, segsY: 2, ripple: 0.02, tatter: 0.1 });
    site.add(i % 2 ? TM.cloth(0xa89a7a) : TM.cloth(0x7a2a22), g, { x: -aw / 2 + (i + 0.5) * (aw / stripes), y: awAt(1.57), z: d / 2 + 1.57 }, 0.9);
  }
  for (const s of [-1, 1]) {
    site.add(TM.timber(), log(awAt(1.55) + 0.05, 0.06, rng, { bend: 0.01 }), { x: s * (aw / 2 - 0.1), z: d / 2 + 1.55 }, 0.9);
    site.solid(s * (aw / 2 - 0.1), d / 2 + 1.55, 0.11, 0.11);
  }
  // Hanging wares under the awning.
  for (let i = 0; i < 5; i++) {
    const x = -w / 2 + 0.7 + i * ((w - 1.4) / 4);
    const hy = awAt(1.25);
    site.add(TM.iron(), box(0.012, 0.3, 0.012, 0), { x, y: hy - 0.15, z: d / 2 + 1.25 }, 0.8);
    site.add(i % 2 ? TM.cloth(0x5a4632) : TM.canvas(), sack(rng).scale(0.6, 0.8, 0.6), { x, y: hy - 0.75, z: d / 2 + 1.25 }, 0.9);
  }
  // Lanterns at the awning's corners: the lit one is the merchant's light.
  out.lanterns.push(lanternAt(site, -aw / 2 + 0.3, awAt(1.45) - 0.45, d / 2 + 1.45, true, 0xffc06a, 8, 12));
  out.lanterns.push(lanternAt(site, aw / 2 - 0.3, awAt(1.45) - 0.45, d / 2 + 1.45, false, 0xffc06a, 6, 10));
  roof(site, rng, w, d, h, { rise, over: 0.35, kind: 'thatch' });
  site.solid(0, 0, w + 0.24, d + 0.24);
  site.solid(0, cz + 0.05, w - 0.7, 0.62);
  out.smoke.push(chimney(site, rng, w / 2 + 0.42, -0.6, h + rise + 0.7));
  // Stock outside: crates and sacks by the side door.
  site.template('crate', 0, -w / 2 - 0.8, -0.9, 0.3, 1);
  site.template('crate', 1, -w / 2 - 0.85, -0.85, -0.2, 0.8, 0.72);
  site.solid(-w / 2 - 0.8, -0.9, 0.9, 0.9, 0.3);
  site.template('barrel', 0, -w / 2 - 0.6, 1.2, 0, 1);
  site.solid(-w / 2 - 0.6, 1.2, 0.7, 0.7);
  return out;
}

/** A lumpy grain sack, base at y = 0. */
export function sack(rng: Rng): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.24, 9, 7);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / 0.24;
    const k = t > 0.5 ? 0.6 + (1 - t) * 0.6 : 1 + (0.5 - Math.abs(t)) * 0.08;
    p.setXYZ(i, p.getX(i) * k * 0.95, y * 1.25 + 0.3, p.getZ(i) * k * 0.8);
  }
  g.computeVertexNormals();
  jag(g, rng, 0.02, 7);
  // Slumped: the base flattens on the ground.
  const q = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < q.count; i++) if (q.getY(i) < 0.02) q.setY(i, 0.02);
  g.computeVertexNormals();
  return g;
}

/** A hanging lantern at a local point: a little iron cage, the bulb a spec. */
function lanternAt(site: Site, x: number, y: number, z: number, lit: boolean, color: number, intensity: number, distance: number): LanternSpec {
  site.add(TM.iron(), cyl(0.09, 0.12, 0.26, 6, true), { x, y: y - 0.13, z }, 0.9);
  site.add(TM.iron(), new THREE.ConeGeometry(0.12, 0.12, 6).translate(0, 0.06, 0), { x, y: y + 0.13, z }, 0.9);
  site.add(TM.iron(), box(0.015, 0.3, 0.015, 0), { x, y: y + 0.25, z }, 0.9);
  const p = site.world(x, y, z);
  return { x: p.x, y: p.y, z: p.z, color, intensity, distance, flicker: 0.5, radius: 0.1, lit };
}

// ---------------------------------------------------------------------------
// The strongroom
// ---------------------------------------------------------------------------

/**
 * The strongroom: squat dressed stone, slate roof, an iron-bound door and
 * barred slits, the stash chest out front where the vault keeper stands.
 * Front faces local +Z.
 */
export function strongroom(site: Site, rng: Rng): Built {
  const out = none();
  const w = 3.6;
  const d = 3.2;
  const h = 2.6;
  const g = new THREE.BoxGeometry(w, h + 0.3, d, 7, 5, 6);
  jag(g, rng, 0.03, 3);
  mottle(g, rng, 0.4, 2.5);
  site.add(TM.stoneDark(), g, { y: (h - 0.3) / 2 }, 0.95);
  // Quoins: bigger blocks at the corners, alternating.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const long = i % 2 === 0;
        const q = jag(box(long ? 0.62 : 0.34, 0.46, long ? 0.34 : 0.62, 0.04), rng, 0.02, 3);
        site.add(TM.stone(), q, { x: sx * (w / 2 - (long ? 0.27 : 0.13)), y: 0.05 + i * 0.5 + 0.23, z: sz * (d / 2 - (long ? 0.13 : 0.27)) }, rng.range(0.85, 1));
      }
    }
  }
  // A plinth course and a cornice.
  site.add(TM.stone(), jag(box(w + 0.2, 0.36, d + 0.2, 0.04, 3), rng, 0.02, 3), { y: -0.12 }, 0.85);
  site.add(TM.stone(), jag(box(w + 0.26, 0.2, d + 0.26, 0.03, 3), rng, 0.015, 3), { y: h - 0.1 }, 0.9);
  // Hipped slate roof: four sloped slabs meeting at a short ridge.
  const rise = 1.0;
  const over = 0.3;
  const aZ = Math.atan2(rise, d / 2);
  const aX = Math.atan2(rise, w / 2);
  for (const s of [-1, 1]) {
    const lenZ = (d / 2 + over) / Math.cos(aZ);
    const slab = box(w + over * 2, 0.14, lenZ, 0.03, 2);
    mottle(slab, rng, 0.2, 2);
    site.add(TM.slate(), slab, { y: h + rise / 2 + 0.02, z: s * (d / 4 + over / 2) - s * 0.0, rx: s * aZ }, 0.85);
    const lenX = (w / 2 + over) / Math.cos(aX);
    const side = box(lenX, 0.14, d * 0.7, 0.03, 2);
    site.add(TM.slate(), side, { x: s * (w / 4 + over / 2), y: h + rise / 2 + 0.04, rz: -s * aX }, 0.85);
  }
  site.add(TM.stoneDark(), box(w * 0.5, 0.16, 0.22, 0.03), { y: h + rise + 0.03 }, 0.8);
  // The door: iron plate on oak, studded, heavy hinges.
  const n = d / 2 + 0.03;
  site.add(TM.planks(), box(1.0, 1.9, 0.08, 0.01), { y: 0.95, z: n }, 0.55);
  for (let i = 0; i < 4; i++) site.add(TM.iron(), box(1.04, 0.09, 0.03, 0.008), { y: 0.25 + i * 0.47, z: n + 0.055 }, 0.9);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) site.add(TM.iron(), new THREE.SphereGeometry(0.022, 5, 4), { x: -0.36 + j * 0.24, y: 0.25 + i * 0.47, z: n + 0.08 }, 0.9, false);
  site.add(TM.iron(), new THREE.TorusGeometry(0.09, 0.016, 4, 10), { x: 0.3, y: 1.0, z: n + 0.09 }, 0.9);
  site.add(TM.stone(), jag(box(1.5, 0.3, 0.18, 0.03), rng, 0.02, 3), { y: 1.95, z: n + 0.05 }, 0.9);
  site.add(TM.stone(), jag(box(1.4, 0.18, 0.5, 0.04), rng, 0.02, 3), { y: -0.09, z: n + 0.28 }, 0.85);
  // Barred slits on the sides.
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 0.02);
    site.add(TM.timberDark(), box(0.03, 0.55, 0.16, 0), { x, y: 1.5 }, 0.12, false);
    for (let i = 0; i < 2; i++) site.add(TM.iron(), box(0.03, 0.58, 0.025, 0), { x: x + s * 0.02, y: 1.5, z: -0.04 + i * 0.08 }, 0.9);
  }
  // The keeper's lantern over the door: cold blue, the vault's colour.
  out.lanterns.push(wallLantern(site, faces(w, d)[0]!, 0, 2.15, true, 0x8fd0ff, 7, 11));
  site.solid(0, 0, w + 0.2, d + 0.2);
  // Strongbox stores outside: crates, a barrel, an iron-bound coffer.
  site.template('crate', 2, -w / 2 - 0.7, 0.4, 0.2, 0.95);
  site.solid(-w / 2 - 0.7, 0.4, 0.85, 0.85, 0.2);
  site.template('crate', 0, -w / 2 - 0.6, -0.6, -0.3, 0.8);
  site.solid(-w / 2 - 0.6, -0.6, 0.75, 0.75, -0.3);
  site.template('barrel', 2, w / 2 + 0.6, -0.9, 0, 0.95);
  site.solid(w / 2 + 0.6, -0.9, 0.7, 0.7);
  return out;
}

// ---------------------------------------------------------------------------
// The apothecary
// ---------------------------------------------------------------------------

/**
 * The apothecary: a lean-to stall against a plank herb shed, shelves of
 * glowing bottles, bundles of herbs drying under the eave, a cauldron on a
 * tripod over embers to one side. Front faces local +Z. Its two lights are
 * lantern specs at the cauldron and over the counter.
 */
export function apothecary(site: Site, rng: Rng, glass: THREE.Material): Built {
  const out = none();
  const W = 4.2;
  // The shed behind: planks on a timber frame, thatched lean-to roof.
  const shedD = 1.4;
  const shedZ = -1.35;
  footing(site, rng, W + 0.2, shedD + 0.2, 0.25, shedZ);
  for (let i = 0; i < 12; i++) {
    const x = -W / 2 + 0.18 + i * ((W - 0.36) / 11);
    site.add(TM.planks(), plank(2.3, 0.05, 0.34, rng, 0.7), { x, y: 0.25 + 1.15, z: shedZ + shedD / 2 - 0.03, rz: Math.PI / 2 }, rng.range(0.55, 0.8));
  }
  site.box(TM.planks(), W, 2.6, 0.06, { y: 0.25, z: shedZ - shedD / 2 + 0.03 }, 0.6, 0.01);
  for (const s of [-1, 1]) site.box(TM.planks(), 0.06, 2.4, shedD, { x: s * (W / 2 - 0.03), y: 0.25 }, 0.6, 0.01);
  const T = TM.timberDark();
  for (const s of [-1, 1]) {
    for (const z of [shedZ - shedD / 2 + 0.08, shedZ + shedD / 2 - 0.08]) site.box(T, 0.16, 2.7, 0.16, { x: s * (W / 2 - 0.08), y: 0.2, z }, 0.85, 0.02);
  }
  site.solid(0, shedZ, W + 0.2, shedD + 0.2);
  // The lean-to roof over shed and counter, one slope toward the front.
  const front = 0.9;
  const back = shedZ - shedD / 2 - 0.3;
  const yB = 3.0;
  const yF = 2.25;
  const run = front - back;
  const a = Math.atan2(yB - yF, run);
  const slab = new THREE.BoxGeometry(W + 0.7, 0.38, Math.hypot(run, yB - yF), 8, 1, 5);
  jag(slab, rng, 0.05, 1.6);
  mottle(slab, rng, 0.35, 1.4);
  site.add(TM.thatch(), slab, { y: (yB + yF) / 2 + 0.2, z: (front + back) / 2, rx: a }, 0.85);
  for (const s of [-1, 1]) {
    site.add(TM.timber(), log(yF - 0.05, 0.075, rng, { bend: 0.01 }), { x: s * (W / 2 + 0.1), z: front - 0.1 }, 0.9);
    site.solid(s * (W / 2 + 0.1), front - 0.1, 0.13, 0.13);
  }
  site.add(T, box(W + 0.5, 0.16, 0.16, 0.02), { y: yF - 0.12, z: front - 0.1 }, 0.8);
  // Herbs drying from the eave beam.
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.35 + i * ((W - 0.7) / 8);
    const hang = rng.range(0.35, 0.6);
    site.add(TM.iron(), box(0.01, 0.18, 0.01, 0), { x, y: yF - 0.3, z: front - 0.1 }, 0.6, false);
    const g = new THREE.ConeGeometry(0.1, hang, 6, 2);
    jag(g, rng, 0.025, 6);
    site.add(TM.herb(), g, { x, y: yF - 0.4 - hang / 2, z: front - 0.1, rx: Math.PI }, rng.range(0.7, 1.1));
  }
  // Counter.
  site.add(TM.planks(), box(3.6, 0.12, 1.0, 0.02, 3), { y: 0.95 }, 0.75);
  site.box(TM.planks(), 3.5, 0.88, 0.06, { y: 0.03, z: 0.45 }, 0.6, 0.01);
  for (const s of [-1, 1]) site.box(T, 0.1, 0.92, 0.9, { x: s * 1.72 }, 0.8, 0.01);
  site.solid(0, 0.2, 3.6, 1.4);
  // Shelves on the shed front, bottles on them and on the counter.
  for (const y of [1.35, 1.85]) site.add(T, box(3.4, 0.06, 0.3, 0.01), { y, z: shedZ + shedD / 2 + 0.15 }, 0.75);
  const tints = [0xd8434a, 0x3f7ad8, 0x7ec24a, 0xe0c24a, 0xb35ad8];
  for (let i = 0; i < 18; i++) {
    const shelf = i < 13;
    const row = i < 7 ? 1.41 : 1.91;
    const x = shelf ? -1.5 + ((i % 7) / 6) * 3.0 + rng.range(-0.05, 0.05) : -1.2 + ((i - 13) / 4) * 2.4;
    const y = shelf ? row : 1.01;
    const z = shelf ? shedZ + shedD / 2 + 0.15 : 0.1 + rng.range(-0.15, 0.2);
    const c = new THREE.Color(tints[i % tints.length]!);
    const hgt = rng.range(0.16, 0.3);
    site.add(glass, cyl(0.045, 0.065, hgt, 7), { x, y, z }, [c.r, c.g, c.b], false);
    site.add(TM.timberDark(), cyl(0.025, 0.03, 0.05, 5), { x, y: y + hgt, z }, 0.7, false);
  }
  // The cauldron over embers to the west.
  const cx = -W / 2 - 0.9;
  const cz = 0.6;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    site.add(TM.stone(), rock(0.16, rng), { x: cx + Math.cos(ang) * 0.6, y: 0.06, z: cz + Math.sin(ang) * 0.6 }, 0.8, false);
  }
  site.add(glowMat(0xff6a20, 1.4), jag(new THREE.CircleGeometry(0.42, 10).rotateX(-Math.PI / 2), rng, 0.02, 5), { x: cx, y: 0.07, z: cz }, 1, false);
  site.add(TM.iron(), new THREE.SphereGeometry(0.44, 12, 8, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), { x: cx, y: 0.75, z: cz }, 0.8);
  site.add(TM.iron(), new THREE.TorusGeometry(0.4, 0.035, 5, 14).rotateX(Math.PI / 2), { x: cx, y: 0.85, z: cz }, 0.9);
  site.add(glowMat(0x4ad860, 1.6), new THREE.CircleGeometry(0.37, 12).rotateX(-Math.PI / 2), { x: cx, y: 0.8, z: cz }, 1, false);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.3;
    site.add(TM.timber(), log(1.9, 0.035, rng, { bend: 0.01, taper: 0.7 }), { x: cx + Math.cos(ang) * 0.75, z: cz + Math.sin(ang) * 0.75, rx: Math.sin(ang) * 0.38, rz: -Math.cos(ang) * 0.38 }, 0.9);
  }
  site.solid(cx, cz, 1.6, 1.6);
  out.lanterns.push(at(site, cx, 0.9, cz, 0x6ad86a, 3.2, 6, 0.8, 0.16, true));
  out.lanterns.push(lanternAt(site, 0, 2.0, front - 0.1, true, 0xffd9a0, 4.5, 9));
  // Mortar, sacks and a basket of roots on the ground.
  site.template('barrel', 1, W / 2 + 0.55, -0.4, 0, 0.85);
  site.solid(W / 2 + 0.55, -0.4, 0.65, 0.65);
  site.add(TM.canvas(), sack(rng), { x: W / 2 + 0.5, z: 0.5 }, 0.85);
  site.add(TM.canvas(), sack(rng).scale(0.85, 0.85, 0.85), { x: W / 2 + 0.85, z: 0.85, ry: 1 }, 0.8);
  return out;
}

/** A bare light point at a local position (the cauldron's glow). */
function at(site: Site, x: number, y: number, z: number, color: number, intensity: number, distance: number, flicker: number, radius: number, lit: boolean): LanternSpec {
  const p = site.world(x, y, z);
  return { x: p.x, y: p.y, z: p.z, color, intensity, distance, flicker, radius, lit };
}
