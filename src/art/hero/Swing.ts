/**
 * SLAY — hair and hems that hang on springs.
 *
 * Long hair, a ponytail, braids and the skirt of a robe or a long coat each
 * get a short chain of bones of their own (`hair0`.., `robe0`..) hung from
 * the head or the pelvis. The part keeps its body skinning where it is
 * attached and hands more of itself to the chain toward its ends, so a crown
 * of hair stays on the skull while the tail trails, and a robe's waist stays
 * on the hips while its hem swings. The hero animator moves the chains
 * (`Secondary.ts`, `SwingChain`); a chain left alone stays in its bind pose,
 * so portraits, the paperdoll and a still townsperson look as they did.
 *
 * The part's mesh moves onto a skeleton of the rig's bones plus its chains:
 * the rig's own bone list (a contract, `Rig.ts`) is left as it is.
 */
import * as THREE from 'three';
import type { HeroModel } from './Hero';
import { HERO_BONES, type HeroBone } from './Rig';

export type SwingKind = 'hair' | 'robe';

export interface HangSpec {
  /** Bone name prefix (`hair`, `hairL`, `robe`): bones are `${name}0`.. */
  name: string;
  kind: SwingKind;
  parent: HeroBone;
  /** Top and end of the chain, character space in the bind pose. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  bones: number;
  /** Share of a vertex (bind position) given to the chain, 0..1. */
  share: (x: number, y: number, z: number) => number;
  /** Names the shape of `share`, for the geometry cache. */
  key: string;
}

/** Smooth 0..1 as `x` runs from `a` to `b` (either way round). */
export function ramp(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const swung = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();

/** `g` reweighted onto the chains (their first bones at `firsts`), cached per source and chain set. */
function swingGeometry(g: THREE.BufferGeometry, specs: HangSpec[], firsts: number[]): THREE.BufferGeometry {
  const key = specs.map((s, i) => `${s.key}|${s.from.toArray()}|${s.to.toArray()}|${s.bones}@${firsts[i]}`).join(';');
  let byKey = swung.get(g);
  if (!byKey) swung.set(g, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const pos = g.getAttribute('position');
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wt = new Float32Array(n * 4);
  const order = [0, 1, 2, 3];
  for (let v = 0; v < n; v++) {
    for (let k = 0; k < 4; k++) {
      idx[v * 4 + k] = si.getComponent(v, k);
      wt[v * 4 + k] = sw.getComponent(v, k);
    }
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    let best = -1;
    let s = 0;
    for (let j = 0; j < specs.length; j++) {
      const sj = specs[j]!.share(x, y, z);
      if (sj > s) {
        s = sj;
        best = j;
      }
    }
    if (best < 0 || s < 1e-3) continue;
    const c = specs[best]!;
    const dx = c.to.x - c.from.x;
    const dy = c.to.y - c.from.y;
    const dz = c.to.z - c.from.z;
    const t = Math.min(1, Math.max(0, ((x - c.from.x) * dx + (y - c.from.y) * dy + (z - c.from.z) * dz) / (dx * dx + dy * dy + dz * dz || 1)));
    const f = t * (c.bones - 1);
    const b0 = Math.min(c.bones - 2, Math.floor(f));
    const w1 = f - b0;
    // The body keeps its two strongest bones, scaled down to what is left.
    order.sort((a, b) => wt[v * 4 + b]! - wt[v * 4 + a]!);
    const o0 = idx[v * 4 + order[0]!]!;
    const o1 = idx[v * 4 + order[1]!]!;
    const k0 = wt[v * 4 + order[0]!]!;
    const k1 = wt[v * 4 + order[1]!]!;
    const sum = k0 + k1 || 1;
    idx[v * 4] = firsts[best]! + b0;
    idx[v * 4 + 1] = firsts[best]! + b0 + 1;
    idx[v * 4 + 2] = o0;
    idx[v * 4 + 3] = o1;
    wt[v * 4] = (1 - w1) * s;
    wt[v * 4 + 1] = w1 * s;
    wt[v * 4 + 2] = ((1 - s) * k0) / sum;
    wt[v * 4 + 3] = ((1 - s) * k1) / sum;
    order[0] = 0;
    order[1] = 1;
    order[2] = 2;
    order[3] = 3;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    if (name !== 'skinIndex' && name !== 'skinWeight') out.setAttribute(name, a);
  }
  out.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(wt, 4));
  out.setIndex(g.index);
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  if (g.boundingSphere) out.boundingSphere = g.boundingSphere.clone();
  if (g.boundingBox) out.boundingBox = g.boundingBox.clone();
  out.userData = g.userData;
  byKey.set(key, out);
  return out;
}

/**
 * Hangs `specs` chains on the hero and moves `meshes` onto them: each mesh
 * gets the reweighted geometry and a skeleton of the rig's bones plus the
 * chains. Returns the chains' top bones (take them off with the part).
 */
export function hang(hero: HeroModel, meshes: THREE.SkinnedMesh[], specs: HangSpec[]): THREE.Bone[] {
  if (!specs.length || !meshes.length) return [];
  const rig = hero.rig;
  const tops: THREE.Bone[] = [];
  const extra: THREE.Bone[] = [];
  const inverses: THREE.Matrix4[] = [];
  const firsts: number[] = [];
  for (const s of specs) {
    firsts.push(HERO_BONES.length + extra.length);
    let parent: THREE.Object3D = rig.bones[s.parent];
    let at = rig.joints[s.parent];
    for (let i = 0; i < s.bones; i++) {
      const p = s.from.clone().lerp(s.to, i / (s.bones - 1));
      const b = new THREE.Bone();
      b.name = `${s.name}${i}`;
      b.userData.swing = s.kind;
      b.position.copy(p).sub(at);
      parent.add(b);
      if (i === 0) tops.push(b);
      extra.push(b);
      // Bind pose: every bone unturned, so the inverse is just the way back from where it sits.
      inverses.push(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
      parent = b;
      at = p;
    }
  }
  const skeleton = new THREE.Skeleton([...rig.skeleton.bones, ...extra], [...rig.skeleton.boneInverses, ...inverses]);
  for (const m of meshes) {
    m.geometry = swingGeometry(m.geometry, specs, firsts);
    m.bind(skeleton, m.bindMatrix);
  }
  return tops;
}

/**
 * The chain for the skirt of a chest piece whose meshes reach below
 * `lowest` (character space): a robe, a long coat, a tabard. Null when the
 * piece stops above mid-thigh.
 */
export function robeChain(hero: HeroModel, lowest: number): HangSpec | null {
  const h = hero.body.anatomy.h;
  if (lowest > 2.9 * h) return null;
  const top = 3.85 * h;
  const hem = Math.max(0.3 * h, lowest);
  return {
    name: 'robe',
    kind: 'robe',
    parent: 'pelvis',
    from: new THREE.Vector3(0, top, 0),
    to: new THREE.Vector3(0, hem, -0.04 * h),
    bones: 3,
    // Nothing above the crotch, and little at the front, where a striding
    // knee must push the cloth instead of passing through it: the back and
    // the sides of the skirt trail, the front follows the legs.
    share: (_x, y, z) => 0.65 * ramp(3.7 * h, 2.3 * h, y) * ramp(0.2 * h, -0.2 * h, z),
    key: `robe2:${h}`,
  };
}
