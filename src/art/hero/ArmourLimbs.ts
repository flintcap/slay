/**
 * SLAY — gloves, boots and belts, one cut per base.
 *
 * Gloves run from plain leather to bell-cuffed gauntlets with knuckle
 * plates and spikes; silk to the forearm, wraps to the elbow, bone with
 * claws, and the eclipse disc. Boots from ankle shoes to knee-high
 * sharkskin, plate greaves with knee cops and sabatons, curled slippers,
 * scarab plates, clawed wyrmhide and winged striders. Belts from a knotted
 * sash to a gold girdle with plates and a disc, fangs on a chain, and a
 * glowing heart in a cage.
 */
import * as THREE from 'three';
import { G } from './Anatomy';
import type { Clip } from './Mesher';
import { FieldBuilder, alongY, rot, type Prim } from './Sdf';
import type { HeroBone } from './Rig';
import { Kit, V, basis, fract, hem, smooth, type Anchor, type F3, type MatKey } from './ArmourKit';

const SIDES = [true, false] as const;
const bone = (name: string, L: boolean) => `${name}${L ? 'L' : 'R'}` as HeroBone;

// ---------------------------------------------------------------------------
// Gloves
// ---------------------------------------------------------------------------

interface GloveCut {
  /** Where the cuff ends, 0 the elbow .. 1 the wrist. */
  cuff: number;
  /** Thickness on the hand. */
  t: number;
  /** Thickness on the forearm. */
  tc: number;
  /** A flared cuff: radius at its mouth, head units. */
  bell?: number;
  knuckles?: 'pad' | 'plate' | 'spiked' | 'ridge';
  back?: 'plate' | 'boss' | 'disc' | 'runes';
  thorns?: boolean;
  claws?: boolean;
  wraps?: boolean;
  strap?: boolean;
  points?: number;
}

const GLOVES: Record<string, GloveCut> = {
  'gloves.leather': { cuff: 0.78, t: 0.0028, tc: 0.006 },
  'gloves.heavy': { cuff: 0.5, t: 0.0036, tc: 0.012, bell: 0.2, knuckles: 'pad', strap: true },
  'gloves.bramble': { cuff: 0.52, t: 0.0034, tc: 0.01, thorns: true, strap: true },
  'gloves.gauntlets': { cuff: 0.52, t: 0.0045, tc: 0.012, bell: 0.2, knuckles: 'plate', back: 'plate' },
  'gloves.war': { cuff: 0.36, t: 0.005, tc: 0.013, bell: 0.25, knuckles: 'ridge', back: 'plate' },
  'gloves.ogre': { cuff: 0.24, t: 0.0055, tc: 0.014, bell: 0.32, knuckles: 'spiked', back: 'boss' },
  'gloves.silk': { cuff: 0.3, t: 0.0016, tc: 0.0022 },
  'gloves.vampirebone': { cuff: 0.45, t: 0.003, tc: 0.006, claws: true, knuckles: 'ridge' },
  'gloves.sorcerer': { cuff: 0.06, t: 0.0022, tc: 0.004, wraps: true, back: 'runes' },
  'gloves.eclipse': { cuff: 0.3, t: 0.005, tc: 0.013, bell: 0.28, knuckles: 'plate', back: 'disc', points: 3 },
};

/** The back of a hand: where it is and which way it faces (palms down, so mostly up). */
function handBack(k: Kit, L: boolean): { back: THREE.Vector3; fore: THREE.Vector3 } {
  const W = k.j[bone('hand', L)];
  const K = k.j[bone('fingers', L)];
  const T = k.j[bone('thumb', L)];
  const fore = K.clone().sub(W).normalize();
  const th = T.clone().sub(W);
  th.addScaledVector(fore, -th.dot(fore)).normalize();
  const back = new THREE.Vector3().crossVectors(fore, th).normalize();
  if (back.y < 0) back.negate();
  return { back, fore };
}

export function gloves(k: Kit): Anchor[] {
  const h = k.h;
  const look = k.look;
  const cut = GLOVES[look.cut] ?? (look.kind === 'plate' ? GLOVES['gloves.gauntlets']! : look.kind === 'silk' ? GLOVES['gloves.silk']! : GLOVES['gloves.leather']!);
  const groups = [G.armL, G.armR, G.handL, G.handR, G.fingersL, G.fingersR, G.thumbL, G.thumbR];
  const cuffs = SIDES.map((L) => k.limb(bone('foreArm', L), bone('hand', L), cut.cuff, 'b'));
  const F = new FieldBuilder();
  for (const L of SIDES) {
    if (!cut.bell) continue;
    F.group = L ? G.armL : G.armR;
    const E = k.j[bone('foreArm', L)];
    const W = k.j[bone('hand', L)];
    const dir = W.clone().sub(E).normalize();
    const mouth = E.clone().lerp(W, Math.max(0, cut.cuff - 0.04));
    F.cone(W.clone().addScaledVector(dir, -0.04 * h), mouth, 0.15 * h, cut.bell * h, 0.04 * h);
    // Hollow, so the cuff's mouth is open.
    F.cone(W.clone().addScaledVector(dir, -0.25 * h), mouth.clone().addScaledVector(dir, -0.1 * h), 0.12 * h, (cut.bell - 0.035) * h, 0.01 * h, { sub: true });
  }
  // Thin on the hand, thicker over the forearm.
  const wrists = SIDES.map((L) => ({ W: k.j[bone('hand', L)], d: k.j[bone('hand', L)].clone().sub(k.j[bone('foreArm', L)]).normalize() }));
  const base: F3 = (x, y, z) => {
    const w = wrists[x > 0 ? 0 : 1]!;
    const s = (x - w.W.x) * w.d.x + (y - w.W.y) * w.d.y + (z - w.W.z) * w.d.z;
    let t = cut.t + (cut.tc - cut.t) * smooth(0.01 * h, -0.08 * h, s);
    if (cut.wraps) {
      // Strips wound round the arm and hand.
      const band = fract((s / (0.09 * h)) + Math.atan2(y - w.W.y, z - w.W.z) / (Math.PI * 2));
      t += band < 0.8 ? 0.0018 : 0;
    }
    return t;
  };
  const edges = cuffs.map((c) => k.inside(c));
  k.edged('gloves', 'main', {
    groups,
    thickness: hem(base, edges, 0.025 * h, 0.8),
    clips: cuffs,
    extra: F.prims.length ? F.prims : undefined,
    skinGroups: groups,
    cell: 0.0045,
    tris: 3400,
    yRange: [2.2 * h, 5.2 * h],
  }, 0.045, cuffs);

  const anchors: Anchor[] = [];
  for (const L of SIDES) {
    const s = L ? 1 : -1;
    const g = L ? G.handL : G.handR;
    const ga = L ? G.armL : G.armR;
    const { back } = handBack(k, L);
    const hb = k.onLimb(bone('hand', L), bone('fingers', L), 0.45, back, [g]);
    const kn = k.onLimb(bone('hand', L), bone('fingers', L), 0.95, back, [g, L ? G.fingersL : G.fingersR]);
    const fa = k.onLimb(bone('foreArm', L), bone('hand', L), (cut.cuff + 1) / 2, back, [ga]);
    const W = k.j[bone('hand', L)];
    const K = k.j[bone('fingers', L)];
    const across = new THREE.Vector3().crossVectors(back, K.clone().sub(W).normalize()).normalize();
    const qb = alongY(back);
    if (cut.knuckles) {
      const Fk = k.fit(cut.knuckles === 'pad' ? 'strap' : 'main', g, 0.0045);
      const c = kn.p.clone().addScaledVector(kn.n, (cut.knuckles === 'pad' ? 0.02 : 0.03) * h);
      Fk.ellipsoid(c, V(0.24 * h, 0.04 * h, 0.08 * h), 0.01 * h, basis(across, back));
      if (cut.knuckles === 'spiked' || cut.knuckles === 'ridge') {
        const Fs = k.fit(cut.knuckles === 'spiked' ? 'trim' : 'main', g, 0.0045);
        for (let i = 0; i < 4; i++) {
          const p = c.clone().addScaledVector(across, (i - 1.5) * 0.09 * h);
          Fs.cone(p, p.clone().addScaledVector(back, (cut.knuckles === 'spiked' ? 0.14 : 0.05) * h), 0.03 * h, 0.004 * h, 0.008 * h);
        }
      }
    }
    if (cut.back === 'plate' || cut.back === 'boss') {
      const Fb = k.fit('main', g, 0.0045);
      Fb.ellipsoid(hb.p.clone().addScaledVector(hb.n, 0.028 * h), V(0.2 * h, 0.04 * h, 0.22 * h), 0.01 * h, qb);
      if (cut.back === 'boss') k.fit('trim', g, 0.0045).ellipsoid(hb.p.clone().addScaledVector(hb.n, 0.07 * h), V(0.08 * h, 0.06 * h, 0.08 * h), 0.01 * h, qb);
    }
    if (cut.back === 'disc') {
      const c = hb.p.clone().addScaledVector(hb.n, 0.05 * h);
      k.fit('trim', g, 0.0045).ellipsoid(c, V(0.17 * h, 0.03 * h, 0.17 * h), 0.008 * h, qb);
      k.fit('void', g, 0.0045).ellipsoid(c.clone().addScaledVector(hb.n, 0.022 * h), V(0.11 * h, 0.02 * h, 0.11 * h), 0.006 * h, qb);
      const Gl = k.fit('glow', g, 0.0045);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const d = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(K.clone().sub(W).normalize(), Math.sin(a));
        Gl.ellipsoid(c.clone().addScaledVector(d, 0.13 * h).addScaledVector(hb.n, 0.02 * h), V(0.03 * h, 0.02 * h, 0.03 * h), 0.02 * h, qb);
      }
    }
    if (cut.back === 'runes' || look.hasRunes) {
      const Gl = k.fit('glow', g, 0.004);
      const c = hb.p.clone().addScaledVector(hb.n, cut.t + 0.004);
      Gl.box(c, V(0.012 * h, 0.006 * h, 0.12 * h), 0.003 * h, 0.002 * h, qb);
      Gl.box(c.clone().addScaledVector(across, 0.05 * h), V(0.06 * h, 0.006 * h, 0.012 * h), 0.003 * h, 0.002 * h, qb);
    }
    if (cut.thorns) {
      const Ft = k.fit('wood', ga, 0.0045);
      for (let i = 0; i < 5; i++) {
        const t = cut.cuff + 0.1 + i * 0.12;
        const p = k.onLimb(bone('foreArm', L), bone('hand', L), Math.min(1.05, t), back.clone().addScaledVector(across, (i % 2 ? 0.6 : -0.6) * s), i < 4 ? [ga] : [g]);
        Ft.group = i < 4 ? ga : g;
        Ft.cone(p.p, p.p.clone().addScaledVector(p.n, 0.12 * h).addScaledVector(W.clone().sub(k.j[bone('foreArm', L)]).normalize(), -0.04 * h), 0.03 * h, 0.003 * h, 0.006 * h);
      }
    }
    if (cut.claws) {
      const Fc = k.fit('bone', L ? G.fingersL : G.fingersR, 0.004);
      const tip = k.j[bone('fingerTips', L)];
      const fwd = tip.clone().sub(K).normalize();
      for (let i = 0; i < 4; i++) {
        const p = tip.clone().addScaledVector(across, (i - 1.5) * 0.085 * h).addScaledVector(back, 0.02 * h);
        Fc.cone(p, p.clone().addScaledVector(fwd, 0.16 * h).addScaledVector(back, -0.05 * h), 0.026 * h, 0.003 * h, 0.006 * h);
      }
      k.fit('gem', ga, 0.004).ellipsoid(fa.p.clone().addScaledVector(fa.n, 0.012 * h), V(0.035 * h, 0.035 * h, 0.03 * h), 0.004 * h);
    }
    if (cut.strap) {
      const Fs = k.fit('strap', ga, 0.0045);
      const sp = k.onLimb(bone('foreArm', L), bone('hand', L), 0.92, back, [ga]);
      // A wrist strap: a short ring of studs is cheaper than a band and reads the same.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const side = back.clone().multiplyScalar(Math.cos(a)).addScaledVector(across, Math.sin(a));
        const q = k.onLimb(bone('foreArm', L), bone('hand', L), 0.9, side, [ga]);
        Fs.ellipsoid(q.p.clone().addScaledVector(q.n, cut.tc * 0.6), V(0.06 * h, 0.03 * h, 0.06 * h), 0.03 * h, alongY(q.n));
      }
      k.fit('iron', ga, 0.004).box(sp.p.clone().addScaledVector(sp.n, cut.tc + 0.008), V(0.035 * h, 0.012 * h, 0.035 * h), 0.006 * h, 0.003 * h, alongY(sp.n));
    }
    if (cut.points) {
      const Fp = k.fit('trim', ga, 0.005);
      const E = k.j[bone('foreArm', L)];
      const mouth = E.clone().lerp(W, Math.max(0, cut.cuff - 0.04));
      const d = W.clone().sub(E).normalize();
      for (let i = 0; i < cut.points; i++) {
        const a = -0.9 + i * 0.9;
        const side = back.clone().multiplyScalar(Math.cos(a)).addScaledVector(across, Math.sin(a) * s).normalize();
        const p = mouth.clone().addScaledVector(side, (cut.bell ?? 0.2) * h);
        Fp.cone(p, p.clone().addScaledVector(d, -0.2 * h).addScaledVector(side, 0.08 * h), 0.04 * h, 0.004 * h, 0.01 * h);
      }
    }
    anchors.push({ p: hb.p.clone().addScaledVector(hb.n, cut.t + 0.01 * h), n: hb.n, g, s: 0.12 * h, role: 'hand' });
    anchors.push({ p: fa.p.clone().addScaledVector(fa.n, cut.tc + 0.004), n: fa.n, g: ga, s: 0.14 * h, role: 'cuff' });
  }
  return anchors;
}

// ---------------------------------------------------------------------------
// Boots
// ---------------------------------------------------------------------------

interface BootCut {
  /** Top of the boot: 1..2 knee to ankle (1 the knee), below 1 up the thigh. */
  top: number;
  t: number;
  cuff?: boolean;
  straps?: number;
  toe?: 'cap' | 'point' | 'curl' | 'claws' | 'sabaton';
  knee?: 'cop' | 'fan' | 'spike';
  shin?: 'plate' | 'ridge' | 'scarab';
  fin?: boolean;
  wings?: boolean;
  hide?: boolean;
  runes?: boolean;
}

const BOOTS: Record<string, BootCut> = {
  'boots.boots': { top: 1.62, t: 0.0045, cuff: true, toe: 'cap' },
  'boots.heavy': { top: 1.35, t: 0.0052, straps: 2, toe: 'cap', cuff: true },
  'boots.sharkskin': { top: 1.06, t: 0.0048, fin: true, toe: 'point' },
  'boots.greaves': { top: 1.0, t: 0.006, knee: 'cop', shin: 'plate', toe: 'sabaton' },
  'boots.war': { top: 0.88, t: 0.0065, knee: 'fan', shin: 'ridge', toe: 'sabaton' },
  'boots.myrmidon': { top: 0.72, t: 0.007, knee: 'spike', shin: 'ridge', toe: 'point' },
  'boots.slippers': { top: 1.86, t: 0.0026, toe: 'curl' },
  'boots.scarabshell': { top: 1.22, t: 0.0048, shin: 'scarab', toe: 'cap' },
  'boots.wyrmhide': { top: 1.08, t: 0.0052, hide: true, toe: 'claws', runes: true },
  'boots.gale': { top: 1.22, t: 0.005, wings: true, toe: 'point', runes: true },
};

export function boots(k: Kit): Anchor[] {
  const h = k.h;
  const look = k.look;
  const cut = BOOTS[look.cut] ?? (look.kind === 'plate' ? BOOTS['boots.greaves']! : look.kind === 'silk' ? BOOTS['boots.slippers']! : BOOTS['boots.boots']!);
  const tops = SIDES.map((L) => (cut.top >= 1 ? k.limb(bone('shin', L), bone('foot', L), cut.top - 1, 'b', 0.55) : k.limb(bone('thigh', L), bone('shin', L), cut.top, 'b', 0.6)));
  // Over the linen trousers wherever they meet.
  const knee = k.j.shinL;
  const ankle = k.j.footL;
  const trouserHem = knee.y + (ankle.y - knee.y) * 0.6;
  const base: F3 = (x, y, z) => {
    let t = cut.t;
    if (y > trouserHem - 0.03) t = Math.max(t, 0.0135 * smooth(trouserHem - 0.03, trouserHem - 0.01, y));
    if (cut.hide) {
      const r = Math.floor(-y / 0.022);
      const fu = fract((Math.atan2(x - Math.sign(x) * Math.abs(knee.x), z) * 0.07) / 0.026 + (r & 1) * 0.5) * 2 - 1;
      const fy = fract(-y / 0.022);
      t += 0.0035 * (fy < 1 - 0.4 * fu * fu ? fy : 0.1);
    }
    // Soles stay on the ground.
    return t * smooth(0, 0.05 * h, y);
  };
  const groups = [G.legL, G.legR, G.footL, G.footR];
  const sole: Clip = { n: V(0, -1, 0), d: 0 };
  // The top cut only reaches so far up the leg: a plane above it takes the rest.
  const cutY = cut.top >= 1 ? knee.y + (ankle.y - knee.y) * (cut.top - 1) : k.j.thighL.y + (knee.y - k.j.thighL.y) * cut.top;
  const lid = k.below(cutY / h + 0.3);
  k.edged('boots', 'main', {
    groups,
    thickness: hem(base, tops.map((c) => k.inside(c)), 0.03 * h, 0.85),
    clips: [...tops, sole, lid],
    skinGroups: groups,
    cell: 0.0065,
    tris: 3200,
    yRange: [-0.02, 4.0 * h],
  }, 0.06, tops);

  const anchors: Anchor[] = [];
  for (const L of SIDES) {
    const s = L ? 1 : -1;
    const gl = L ? G.legL : G.legR;
    const gf = L ? G.footL : G.footR;
    const K = k.j[bone('shin', L)];
    const A = k.j[bone('foot', L)];
    const T = k.j[bone('toe', L)];
    const fwd = T.clone().sub(A).setY(0).normalize();
    const kneeHit = k.onLimb(bone('thigh', L), bone('shin', L), 0.98, V(0, 0, 1), [gl]);
    const shinHit = k.onLimb(bone('shin', L), bone('foot', L), 0.4, V(0, 0, 1), [gl]);
    const footTop = k.hit([gf], A.clone().lerp(T, 0.55).add(V(0, 1.2 * h, 0)), V(0, -1, 0)) ?? { p: A.clone().lerp(T, 0.55).add(V(0, 0.2 * h, 0)), n: V(0, 1, 0) };
    const toeHit = k.hit([gf], T.clone().add(V(0, 0.06 * h, 1.2 * h)), V(0, 0, -1)) ?? { p: T.clone(), n: fwd };
    const outer = k.onLimb(bone('shin', L), bone('foot', L), 0.92, V(s, 0, 0), [gl]);
    if (cut.cuff) {
      const at = Math.max(1.05, cut.top) - 1;
      const Fc = k.fit('strap', gl, 0.005);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const q = k.onLimb(bone('shin', L), bone('foot', L), at + 0.04, V(Math.sin(a), 0, Math.cos(a)), [gl]);
        Fc.ellipsoid(q.p.clone().addScaledVector(q.n, 0.012), V(0.09 * h, 0.06 * h, 0.09 * h), 0.04 * h, alongY(q.n));
      }
    }
    for (let i = 0; i < (cut.straps ?? 0); i++) {
      const at = cut.top - 1 + 0.12 + i * 0.22;
      const Fs = k.fit('strap', gl, 0.005);
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        const q = k.onLimb(bone('shin', L), bone('foot', L), at, V(Math.sin(a), 0, Math.cos(a)), [gl]);
        Fs.ellipsoid(q.p.clone().addScaledVector(q.n, 0.014), V(0.08 * h, 0.03 * h, 0.08 * h), 0.03 * h, alongY(q.n));
      }
      const q = k.onLimb(bone('shin', L), bone('foot', L), at, V(s, 0, 0.4), [gl]);
      k.fit('iron', gl, 0.004).box(q.p.clone().addScaledVector(q.n, 0.022), V(0.035 * h, 0.035 * h, 0.012 * h), 0.006 * h, 0.003 * h, alongY(V(0, 1, 0)).multiply(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), q.n.clone().setY(0).normalize())));
    }
    if (cut.knee) {
      const Fk = k.fit('main', gl, 0.0055);
      const c = kneeHit.p.clone().addScaledVector(kneeHit.n, 0.04 * h);
      Fk.ellipsoid(c, V(0.19 * h, 0.2 * h, 0.08 * h), 0.015 * h);
      if (cut.knee === 'fan' || cut.knee === 'spike') Fk.ellipsoid(c.clone().add(V(s * 0.17 * h, 0, -0.06 * h)), V(0.04 * h, 0.22 * h, 0.18 * h), 0.015 * h, rot(0, s * 0.3, 0));
      if (cut.knee === 'spike') k.fit('trim', gl, 0.005).cone(c, c.clone().add(V(0, 0.06 * h, 0.3 * h)), 0.07 * h, 0.005 * h, 0.02 * h);
      if (k.trimmed) k.fit('trim', gl, 0.005).ellipsoid(c.clone().addScaledVector(kneeHit.n, 0.05 * h), V(0.05 * h, 0.05 * h, 0.03 * h), 0.006 * h);
    }
    if (cut.shin) {
      const Fs = k.fit('main', gl, 0.0055);
      const top = k.onLimb(bone('shin', L), bone('foot', L), 0.12, V(0, 0, 1), [gl]);
      const bot = k.onLimb(bone('shin', L), bone('foot', L), 0.82, V(0, 0, 1), [gl]);
      const c = top.p.clone().lerp(bot.p, 0.5).addScaledVector(shinHit.n, (cut.shin === 'scarab' ? 0.05 : 0.03) * h);
      const len = top.p.distanceTo(bot.p) * 0.55;
      const along = bot.p.clone().sub(top.p).normalize();
      const q = alongY(along);
      if (cut.shin === 'scarab') {
        k.fit('main', gl, 0.0055).ellipsoid(c, V(0.2 * h, len, 0.1 * h), 0.02 * h, q);
        k.fit('void', gl, 0.0045).box(c.clone().addScaledVector(shinHit.n, 0.09 * h), V(0.008 * h, len * 0.9, 0.01 * h), 0.004 * h, 0.004 * h, q);
        k.fit('gem', gl, 0.0045).ellipsoid(top.p.clone().addScaledVector(top.n, 0.06 * h), V(0.06 * h, 0.05 * h, 0.04 * h), 0.006 * h);
        k.fit('main', gf, 0.0055).ellipsoid(footTop.p.clone().addScaledVector(footTop.n, 0.03 * h), V(0.16 * h, 0.06 * h, 0.2 * h), 0.02 * h);
      } else {
        Fs.ellipsoid(c, V(0.21 * h, len, 0.07 * h), 0.015 * h, q);
        if (cut.shin === 'ridge') Fs.box(c.clone().addScaledVector(shinHit.n, 0.05 * h), V(0.025 * h, len * 0.9, 0.025 * h), 0.012 * h, 0.03 * h, q.clone().multiply(rot(0, Math.PI / 4, 0)));
      }
    }
    if (cut.toe === 'sabaton') {
      const Fs = k.fit('main', gf, 0.005);
      for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.19;
        const p = k.hit([gf], A.clone().lerp(T, t).add(V(0, 1.2 * h, 0)), V(0, -1, 0));
        if (!p) continue;
        Fs.ellipsoid(p.p.clone().addScaledVector(p.n, 0.012 * h), V(0.2 * h, 0.04 * h, 0.12 * h), 0.01 * h, alongY(p.n));
      }
    } else if (cut.toe === 'cap') {
      k.fit('main', gf, 0.005).ellipsoid(toeHit.p.clone().addScaledVector(fwd, -0.1 * h).add(V(0, -0.01 * h, 0)), V(0.16 * h, 0.085 * h, 0.15 * h), 0.03 * h);
    } else if (cut.toe === 'point') {
      k.fit('main', gf, 0.005).cone(toeHit.p.clone().addScaledVector(fwd, -0.12 * h).add(V(0, 0.04 * h, 0)), toeHit.p.clone().addScaledVector(fwd, 0.16 * h).add(V(0, 0.03 * h, 0)), 0.13 * h, 0.01 * h, 0.05 * h);
    } else if (cut.toe === 'curl') {
      const a = toeHit.p.clone().addScaledVector(fwd, -0.05 * h).add(V(0, 0.03 * h, 0));
      const b = toeHit.p.clone().addScaledVector(fwd, 0.14 * h).add(V(0, 0.06 * h, 0));
      const F = k.fit('main', gf, 0.0045);
      F.cone(a, b, 0.09 * h, 0.03 * h, 0.04 * h);
      F.cone(b, b.clone().addScaledVector(fwd, 0.04 * h).add(V(0, 0.08 * h, 0)), 0.03 * h, 0.012 * h, 0.01 * h);
      if (k.trimmed) k.fit('gem', gf, 0.004).ellipsoid(footTop.p.clone().addScaledVector(footTop.n, 0.02 * h), V(0.035 * h, 0.03 * h, 0.035 * h), 0.004 * h);
    } else if (cut.toe === 'claws') {
      const Fc = k.fit('bone', gf, 0.0045);
      const across = V(fwd.z, 0, -fwd.x);
      for (let i = 0; i < 3; i++) {
        const p = toeHit.p.clone().addScaledVector(across, (i - 1) * 0.1 * h).add(V(0, 0.03 * h, 0));
        Fc.cone(p, p.clone().addScaledVector(fwd, 0.13 * h).add(V(0, -0.05 * h, 0)), 0.035 * h, 0.004 * h, 0.008 * h);
      }
    }
    if (cut.fin) {
      const back = k.onLimb(bone('shin', L), bone('foot', L), 0.35, V(0, 0, -1), [gl]);
      k.fit('main', gl, 0.005).box(back.p.clone().addScaledVector(back.n, 0.08 * h), V(0.016 * h, 0.3 * h, 0.1 * h), 0.01 * h, 0.04 * h, rot(-0.25, 0, 0));
    }
    if (cut.wings) {
      const Fw = k.fit('trim', gl, 0.005);
      const c = outer.p.clone().addScaledVector(outer.n, 0.03 * h);
      for (let i = 0; i < 4; i++) {
        const a = 0.35 + i * 0.32;
        Fw.ellipsoid(c.clone().add(V(s * 0.08 * h, (0.08 + 0.06 * i) * h, -(0.1 + 0.05 * i) * h)), V(0.025 * h, 0.07 * h, (0.26 - 0.04 * i) * h), 0.01 * h, rot(a, 0, 0));
      }
    }
    if (cut.runes || look.hasRunes) {
      const Gl = k.fit('glow', gl, 0.0045);
      const at = Math.max(1.05, cut.top) - 1 + 0.1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const q = k.onLimb(bone('shin', L), bone('foot', L), at, V(Math.sin(a), 0, Math.cos(a)), [gl]);
        Gl.box(q.p.clone().addScaledVector(q.n, cut.t + 0.004), V(0.025 * h, 0.04 * h, 0.006 * h), 0.003 * h, 0.002 * h, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), q.n.clone().setY(0).normalize()));
      }
    }
    anchors.push({ p: kneeHit.p.clone().addScaledVector(kneeHit.n, 0.04 * h), n: kneeHit.n, g: gl, s: 0.15 * h, role: 'knee' });
    anchors.push({ p: outer.p.clone().addScaledVector(outer.n, cut.t + 0.004), n: outer.n, g: gl, s: 0.13 * h, role: 'heel' });
    anchors.push({ p: shinHit.p.clone().addScaledVector(shinHit.n, cut.t + 0.004), n: shinHit.n, g: gl, s: 0.15 * h, role: 'shin' });
  }
  return anchors;
}

// ---------------------------------------------------------------------------
// Belts
// ---------------------------------------------------------------------------

interface BeltCut {
  lo: number;
  hi: number;
  t: number;
  mat: MatKey;
  buckle: 'knot' | 'small' | 'square' | 'plate' | 'skull' | 'disc' | 'heart';
  pouches?: number;
  plates?: number;
  tails?: boolean;
  chain?: boolean;
  fangs?: boolean;
  fur?: boolean;
  faulds?: boolean;
  web?: boolean;
  cords?: boolean;
  /** Surface the plain base is made of when its item palette would read as the bare linens. */
  tint?: string;
}

const BELTS: Record<string, BeltCut> = {
  'belt.sash': { lo: 4.14, hi: 4.42, t: 0.018, mat: 'main', buckle: 'knot', tails: true, tint: 'cloth.homespun|0x8a3424' },
  'belt.light': { lo: 4.2, hi: 4.34, t: 0.018, mat: 'main', buckle: 'small', pouches: 1 },
  'belt.spiderweb': { lo: 4.12, hi: 4.44, t: 0.018, mat: 'main', buckle: 'knot', tails: true, web: true },
  'belt.belt': { lo: 4.16, hi: 4.38, t: 0.019, mat: 'main', buckle: 'square', pouches: 2 },
  'belt.war': { lo: 4.06, hi: 4.46, t: 0.021, mat: 'strap', buckle: 'plate', plates: 6 },
  'belt.troll': { lo: 4.02, hi: 4.5, t: 0.022, mat: 'main', buckle: 'skull', pouches: 3, fur: true },
  'belt.girdle': { lo: 4.17, hi: 4.37, t: 0.019, mat: 'chain', buckle: 'plate', chain: true },
  'belt.vampirefang': { lo: 4.16, hi: 4.38, t: 0.019, mat: 'chain', buckle: 'disc', fangs: true },
  'belt.colossus': { lo: 4.04, hi: 4.48, t: 0.022, mat: 'main', buckle: 'disc', plates: 8, faulds: true },
  'belt.worldheart': { lo: 4.2, hi: 4.32, t: 0.019, mat: 'main', buckle: 'heart', cords: true },
};

export function belt(k: Kit): Anchor[] {
  const h = k.h;
  const look = k.look;
  const cut = BELTS[look.cut] ?? (look.kind === 'sash' ? BELTS['belt.sash']! : look.kind === 'chain' ? BELTS['belt.girdle']! : BELTS['belt.belt']!);
  k.hides.push('belt');
  if (cut.tint && !look.design?.main) k.setMat('main', cut.tint);
  const clips: Clip[] = [k.below(cut.hi), k.above(cut.lo)];
  const twist: F3 | number = cut.cords ? (x, y, z) => cut.t + 0.003 * Math.abs(Math.sin(Math.atan2(x, z) * 30 + y * 400)) : cut.tails ? (x, y, z) => cut.t + 0.002 * Math.sin(y * 300 + Math.atan2(x, z) * 3) : cut.t;
  k.edged('belt', cut.mat, {
    groups: [G.torso],
    thickness: twist,
    clips,
    skinGroups: [G.torso],
    cell: 0.0065,
    tris: 1400,
    yRange: [(cut.lo - 0.1) * h, (cut.hi + 0.1) * h],
  }, 0.03, clips, cut.plates !== undefined || cut.mat === 'chain');
  const mid = (cut.lo + cut.hi) / 2;
  const front = k.around(mid, 0);
  const fp = front.p.clone().addScaledVector(front.n, cut.t + 0.004);
  const q = alongY(V(0, 1, 0)).multiply(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), front.n.clone().setY(0).normalize()));
  const B = k.fit('trim', G.torso, 0.0045);
  const tall = (cut.hi - cut.lo) * h;
  switch (cut.buckle) {
    case 'knot': {
      const side = k.around(mid, 0.55);
      const p = side.p.clone().addScaledVector(side.n, cut.t + 0.01);
      const C = k.fit('main', G.torso, 0.0055);
      C.ellipsoid(p, V(0.09 * h, 0.08 * h, 0.05 * h), 0.02 * h);
      if (cut.tails) {
        C.box(p.clone().add(V(0.02 * h, -0.45 * h, 0.02 * h)), V(0.06 * h, 0.42 * h, 0.012 * h), 0.008 * h, 0.03 * h, rot(0.08, 0.55, 0.05));
        C.box(p.clone().add(V(0.1 * h, -0.36 * h, 0.0)), V(0.055 * h, 0.34 * h, 0.012 * h), 0.008 * h, 0.03 * h, rot(0.1, 0.55, -0.12));
      }
      break;
    }
    case 'small':
      B.box(fp, V(0.06 * h, tall * 0.55, 0.012 * h), 0.006 * h, 0.004 * h, q);
      break;
    case 'square':
      B.box(fp, V(0.1 * h, tall * 0.6, 0.014 * h), 0.008 * h, 0.004 * h, q);
      k.fit('strap', G.torso, 0.0045).box(fp.clone().addScaledVector(front.n, 0.012 * h), V(0.05 * h, tall * 0.3, 0.008 * h), 0.004 * h, 0.003 * h, q);
      break;
    case 'plate':
      B.box(fp, V(0.16 * h, tall * 0.62, 0.02 * h), 0.012 * h, 0.006 * h, q);
      k.fit('main', G.torso, 0.0045).ellipsoid(fp.clone().addScaledVector(front.n, 0.02 * h), V(0.07 * h, tall * 0.35, 0.02 * h), 0.006 * h, q);
      break;
    case 'skull': {
      const S = k.fit('bone', G.torso, 0.0045);
      const c = fp.clone().addScaledVector(front.n, 0.05 * h);
      S.ellipsoid(c.clone().add(V(0, 0.04 * h, 0)), V(0.15 * h, 0.15 * h, 0.12 * h), 0.03 * h);
      S.ellipsoid(c.clone().add(V(0, -0.1 * h, 0.03 * h)), V(0.09 * h, 0.06 * h, 0.08 * h), 0.03 * h);
      for (const s of [1, -1]) S.cone(c.clone().add(V(s * 0.06 * h, -0.12 * h, 0.08 * h)), c.clone().add(V(s * 0.09 * h, -0.02 * h, 0.16 * h)), 0.025 * h, 0.004 * h, 0.006 * h);
      for (const s of [1, -1]) k.fit('void', G.torso, 0.004).ellipsoid(c.clone().add(V(s * 0.06 * h, 0.05 * h, 0.1 * h)), V(0.04 * h, 0.035 * h, 0.03 * h), 0.005 * h);
      break;
    }
    case 'disc':
      B.ellipsoid(fp.clone().addScaledVector(front.n, 0.01 * h), V(0.17 * h, 0.17 * h, 0.035 * h), 0.01 * h, q);
      k.fit('gem', G.torso, 0.004).ellipsoid(fp.clone().addScaledVector(front.n, 0.045 * h), V(0.06 * h, 0.06 * h, 0.035 * h), 0.006 * h);
      break;
    case 'heart': {
      const c = fp.clone().addScaledVector(front.n, 0.06 * h);
      k.fit('glow', G.torso, 0.004).ellipsoid(c, V(0.08 * h, 0.1 * h, 0.07 * h), 0.02 * h);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        B.cone(c.clone().add(V(Math.cos(a) * 0.1 * h, -0.13 * h, Math.sin(a) * 0.06 * h)), c.clone().add(V(Math.cos(a) * 0.1 * h, 0.13 * h, Math.sin(a) * 0.06 * h)), 0.014 * h, 0.014 * h, 0.02 * h);
      }
      break;
    }
  }
  for (let i = 0; i < (cut.pouches ?? 0); i++) {
    const a = (i % 2 ? -1 : 1) * (0.95 + 0.55 * Math.floor(i / 2)) + (i === 2 ? Math.PI - 0.3 : 0);
    const hp = k.around(cut.lo - 0.08, a);
    const P = k.fit('strap', G.torso, 0.0055);
    const c = hp.p.clone().addScaledVector(hp.n, cut.t + 0.05 * h);
    P.box(c, V(0.13 * h, 0.15 * h, 0.07 * h), 0.04 * h, 0.01 * h, rot(0, a, 0));
    P.box(c.clone().add(V(0, 0.1 * h, 0)).addScaledVector(hp.n, 0.02 * h), V(0.14 * h, 0.06 * h, 0.072 * h), 0.03 * h, 0.01 * h, rot(0, a, 0));
  }
  if (cut.plates) {
    const P = k.fit(look.material === 'metal' ? 'main' : 'iron', G.torso, 0.005);
    for (let i = 0; i < cut.plates; i++) {
      const a = 0.45 + (i * (Math.PI * 2 - 0.9)) / Math.max(1, cut.plates - 1);
      const hp = k.around(mid, a);
      P.box(hp.p.clone().addScaledVector(hp.n, cut.t + 0.006), V(0.1 * h, tall * 0.55, 0.012 * h), 0.008 * h, 0.004 * h, rot(0, a, 0));
      k.fit(k.trimmed ? 'trim' : 'iron', G.torso, 0.004).ellipsoid(hp.p.clone().addScaledVector(hp.n, cut.t + 0.016), V(0.022 * h, 0.022 * h, 0.012 * h), 0.003 * h);
    }
  }
  if (cut.fur) {
    const Fr = k.fit('fur', G.torso, 0.006);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const hp = k.around(cut.hi, a);
      Fr.ellipsoid(hp.p.clone().addScaledVector(hp.n, cut.t), V(0.12 * h, 0.07 * h, 0.08 * h), 0.05 * h, rot(0, a, 0));
    }
  }
  if (cut.chain) {
    // A loop of chain hanging at the front.
    const Ch = k.fit('iron', G.torso, 0.0045);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = (t - 0.5) * 1.1;
      const hp = k.around(cut.lo - 0.25 * Math.sin(t * Math.PI), a);
      Ch.ellipsoid(hp.p.clone().addScaledVector(hp.n, cut.t + 0.02 * h), V(0.035 * h, 0.025 * h, 0.012 * h), 0.004 * h, rot(0, a, i % 2 ? Math.PI / 2 : 0));
    }
  }
  if (cut.fangs) {
    const Fg = k.fit('bone', G.torso, 0.0045);
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.28;
      if (Math.abs(a) < 0.2) continue;
      const hp = k.around(cut.lo, a);
      const p = hp.p.clone().addScaledVector(hp.n, cut.t + 0.01);
      Fg.cone(p, p.clone().add(V(0, -(0.14 + 0.05 * Math.cos(i)) * h, 0)).addScaledVector(hp.n, 0.02 * h), 0.03 * h, 0.003 * h, 0.006 * h);
    }
  }
  if (cut.faulds) {
    const Fl = k.fit('main', G.torso, 0.0055);
    for (const s of [1, -1]) {
      for (let r = 0; r < 2; r++) {
        const hp = k.around(cut.lo - 0.15 - r * 0.2, s * 0.32);
        Fl.box(hp.p.clone().addScaledVector(hp.n, cut.t + 0.012 + r * 0.004), V(0.15 * h, 0.1 * h, 0.012 * h), 0.008 * h, 0.004 * h, rot(-0.1, s * 0.32, 0));
      }
    }
  }
  if (cut.web) {
    const W = k.fit('glow', G.torso, 0.004);
    const side = k.around(mid, 0.55);
    const c = side.p.clone().addScaledVector(side.n, cut.t + 0.012);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const d = V(Math.cos(a), Math.sin(a), 0);
      W.box(c, V(0.14 * h * Math.abs(d.x) + 0.004 * h, 0.14 * h * Math.abs(d.y) + 0.004 * h, 0.003 * h), 0.002 * h, 0.001 * h, rot(0, 0.55, a));
    }
  }
  if (cut.cords) {
    const Cd = k.fit('main', G.torso, 0.0045);
    const Gl = k.fit('glow', G.torso, 0.004);
    for (const s of [1, -1]) {
      const hp = k.around(cut.lo, s * 0.3);
      const p = hp.p.clone().addScaledVector(hp.n, cut.t + 0.006);
      const end = p.clone().add(V(s * 0.03 * h, -0.55 * h, 0.03 * h));
      Cd.cone(p, end, 0.018 * h, 0.014 * h, 0.006 * h);
      Gl.ellipsoid(end, V(0.04 * h, 0.05 * h, 0.04 * h), 0.006 * h);
    }
  }
  if (look.hasGems && cut.buckle !== 'disc' && cut.buckle !== 'heart') k.fit('gem', G.torso, 0.004).ellipsoid(fp.clone().addScaledVector(front.n, 0.025 * h), V(0.035 * h, 0.035 * h, 0.025 * h), 0.004 * h);
  const hipL = k.around(mid, 1.3);
  const hipR = k.around(mid, -1.3);
  return [
    { p: fp, n: front.n, g: G.torso, s: 0.12 * h, role: 'buckle' },
    { p: hipL.p.addScaledVector(hipL.n, cut.t + 0.004), n: hipL.n, g: G.torso, s: 0.16 * h, role: 'hip' },
    { p: hipR.p.addScaledVector(hipR.n, cut.t + 0.004), n: hipR.n, g: G.torso, s: 0.16 * h, role: 'hip' },
  ];
}

export type { Prim };
