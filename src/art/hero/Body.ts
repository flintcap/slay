/**
 * SLAY — a meshed, skinned hero body.
 *
 * The body is meshed in three resolutions: the trunk and limbs coarse, the
 * head and hands fine, each detail mesh overlapping the body by a couple of
 * centimetres at the neck and wrist and standing a hair proud of it, so the
 * join is invisible. Every mesh is simplified, given the field's own normals
 * and skinned from the field's groups.
 *
 * Bodies are cached by shape: a body costs a few hundred milliseconds to
 * mesh, and the same warden walks into town and into every dungeon.
 */
import * as THREE from 'three';
import { meshField, fieldNormals, rampInflate, type Clip, type Inflate } from './Mesher';
import { simplify } from './Decimate';
import { skinWeights } from './Skinning';
import { G, GROUP_COUNT, bodyField, type AnatomyOpts, type BodyField } from './Anatomy';
import { heroJoints, type BodyShape, type JointMap } from './Rig';
import { EVALS, type Field } from './Sdf';

export interface BodyMesh {
  /** The skin: one skinned geometry, bind pose = the rig's A-pose. */
  skin: THREE.BufferGeometry;
  anatomy: BodyField;
  joints: JointMap;
  /** Milliseconds it took to build. */
  ms: number;
}

export interface BodyQuality {
  /** Cell size for the trunk and limbs, metres. */
  bodyCell: number;
  headCell: number;
  handCell: number;
  bodyTris: number;
  headTris: number;
  handTris: number;
}

export const QUALITY_HIGH: BodyQuality = {
  bodyCell: 0.0095,
  headCell: 0.0036,
  handCell: 0.003,
  bodyTris: 7600,
  headTris: 3800,
  handTris: 1000,
};

let PROFILE = false;
export function profileBodies(on: boolean): void {
  PROFILE = on;
}

const cache = new Map<string, BodyMesh>();

function key(shape: BodyShape, opts: AnatomyOpts, q: BodyQuality): string {
  return JSON.stringify([shape, opts, q]);
}

const HAND_GROUPS = new Set<number>([G.handL, G.handR, G.fingersL, G.fingersR, G.thumbL, G.thumbR]);

/** A part: mesh, simplify, normals, skin. */
function part(
  field: Field,
  anatomy: BodyField,
  box: THREE.Box3 | undefined,
  cell: number,
  clips: Clip[],
  inflate: Inflate,
  tris: number,
  groups?: number[],
): THREE.BufferGeometry {
  const t0 = performance.now();
  EVALS.calls = 0;
  EVALS.prims = 0;
  const raw = meshField(field, { cell, box, clips, inflate, project: 2 });
  const t1 = performance.now();
  const s = simplify(raw.pos, raw.index, tris);
  const t2 = performance.now();
  const normal = fieldNormals(field, s.pos, cell * 0.35, clips, inflate);
  // Weights read the whole body's field so a detail mesh skins exactly as the
  // body under it does.
  const sk = skinWeights(anatomy.field, anatomy.chains, s.pos, GROUP_COUNT, { groups });
  const t3 = performance.now();
  if (PROFILE) console.log(`part prims=${field.n} raw=${raw.index.length / 3} mesh=${(t1 - t0) | 0} evals=${EVALS.calls} avgPrims=${(EVALS.prims / EVALS.calls).toFixed(1)} simp=${(t2 - t1) | 0} rest=${(t3 - t2) | 0}`);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(sk.index, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sk.weight, 4));
  g.setIndex(new THREE.BufferAttribute(s.index, 1));
  return g;
}

function concat(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.getAttribute('position').count;
    ni += g.getIndex()!.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const si = new Uint16Array(nv * 4);
  const sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const c = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, vo * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, vo * 3);
    si.set(g.getAttribute('skinIndex').array as Uint16Array, vo * 4);
    sw.set(g.getAttribute('skinWeight').array as Float32Array, vo * 4);
    const ix = g.getIndex()!.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += c;
    io += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Builds (or fetches) the skin for a body shape. */
export function meshBody(shape: BodyShape, opts: AnatomyOpts = {}, q: BodyQuality = QUALITY_HIGH): BodyMesh {
  const k = key(shape, opts, q);
  const hit = cache.get(k);
  if (hit) return hit;
  const t0 = performance.now();
  const joints = heroJoints(shape);
  const anatomy = bodyField(shape, joints, opts);
  const h = anatomy.h;
  const whole = anatomy.field;

  // Trunk and limbs: everything but the hands, cut at the neck and wrists.
  const trunk = whole.select((p) => !HAND_GROUPS.has(p.group));
  const clips: Clip[] = [{ n: new THREE.Vector3(0, 1, 0), d: anatomy.neckCut }];
  const wristClip = (w: BodyField['wristL'], back: number, keepHand: boolean): Clip => {
    const at = w.at.clone().addScaledVector(w.dir, -back);
    return keepHand
      ? { n: w.dir.clone().negate(), d: -w.dir.dot(at) }
      : { n: w.dir.clone(), d: w.dir.dot(at), within: [w.at.x, w.at.y, w.at.z, 0.55 * h] };
  };
  clips.push(wristClip(anatomy.wristL, 0.12 * h, false), wristClip(anatomy.wristR, 0.12 * h, false));
  const body = part(trunk, anatomy, undefined, q.bodyCell, clips, 0, q.bodyTris);

  // Head, from just under the neck cut.
  const headBox = new THREE.Box3(new THREE.Vector3(-0.62 * h, anatomy.neckCut - 0.14 * h, -0.62 * h), new THREE.Vector3(0.62 * h, 7.62 * h, 0.7 * h));
  const headField = whole.cull(headBox);
  // Under the cut the head tucks inside the neck; over it, it stands a hair proud.
  const headInf = rampInflate(new THREE.Vector3(0, 1, 0), anatomy.neckCut - 0.05 * h, -0.006, 0.0012, 0.035 * h);
  const head = part(headField, anatomy, headBox, q.headCell, [{ n: new THREE.Vector3(0, -1, 0), d: -(anatomy.neckCut - 0.1 * h) }], headInf, q.headTris);

  // Hands, from a little up the forearm.
  const hands: THREE.BufferGeometry[] = [];
  for (const L of [true, false]) {
    const w = L ? anatomy.wristL : anatomy.wristR;
    const tip = w.at.clone().addScaledVector(w.dir, 1.0 * h);
    const box = new THREE.Box3().setFromPoints([w.at.clone().addScaledVector(w.dir, -0.32 * h), tip]).expandByScalar(0.3 * h);
    const f = whole.cull(box);
    const groups = L ? [G.armL, G.handL, G.fingersL, G.thumbL] : [G.armR, G.handR, G.fingersR, G.thumbR];
    const cutAt = w.at.clone().addScaledVector(w.dir, -0.12 * h);
    const inf = rampInflate(w.dir, w.dir.dot(cutAt) - 0.05 * h, -0.005, 0.0012, 0.035 * h);
    hands.push(part(f, anatomy, box, q.handCell, [wristClip(w, 0.26 * h, true)], inf, q.handTris, groups));
  }

  const skin = concat([body, head, ...hands]);
  for (const g of [body, head, ...hands]) g.dispose();
  const out: BodyMesh = { skin, anatomy, joints, ms: performance.now() - t0 };
  cache.set(k, out);
  return out;
}
