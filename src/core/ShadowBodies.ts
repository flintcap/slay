/**
 * SLAY — bodies drawn only into shadow maps.
 *
 * A monster is three to five parts (skin, cloth, metal, bone), and each part
 * cast its own shadow: one draw per part per monster in the shadow pass. A
 * shadow body is all of a creature's parts in one geometry
 * (`art/creatures/Creature.ts`), and the parts cast none, so each monster's
 * shadow is one draw.
 *
 * three.js has no "shadow only" switch (its shadow pass tests layers against
 * the game camera), so the bodies share one material that is hidden while the
 * frame's draw list is built and shown just for the shadow pass:
 * `Renderer.render` hides it before each frame, and every shadow-casting
 * light shows it as its shadow map is drawn (`watchShadowLight`). It never
 * writes colour or depth, so a body that does reach a colour pass (another
 * renderer, a stand-in) draws nothing.
 */
import * as THREE from 'three';

let mat: THREE.MeshBasicMaterial | null = null;
const watched = new WeakSet<THREE.LightShadow>();

/** The one material every shadow body wears. */
export function shadowBodyMaterial(): THREE.MeshBasicMaterial {
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    mat.name = 'creature:shadow';
    mat.userData.shared = true;
  }
  return mat;
}

/** Hides the shadow bodies from the frame's own draw list. */
export function hideShadowBodies(): void {
  if (mat) mat.visible = false;
}

/**
 * Shows the shadow bodies to `light`'s shadow pass, which runs after the draw
 * list is built. Every shadow pass points the shadow camera before it draws
 * (a point light once per cube face, without the shadow's own
 * `updateMatrices`), so the camera's update is the hook.
 */
export function watchShadowLight(light: THREE.Light): void {
  const shadow = (light as THREE.DirectionalLight).shadow as THREE.LightShadow | undefined;
  if (!shadow || watched.has(shadow)) return;
  watched.add(shadow);
  const cam = shadow.camera;
  const update = cam.updateMatrixWorld.bind(cam);
  cam.updateMatrixWorld = (force?: boolean) => {
    if (mat) mat.visible = true;
    update(force);
  };
}

/**
 * Whether a part's shadow can come from a shadow body: drawn, opaque,
 * one-sided and not moved or cut by its own shader, so the body's plain
 * depth draw casts the same shadow it did. A part wearing its see-through
 * Veil twin counts as its opaque original.
 */
export function castsPlainShadow(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.Material & {
    alphaMap?: unknown;
    displacementMap?: unknown;
    positionNode?: unknown;
    castShadowNode?: unknown;
    maskShadowNode?: unknown;
  };
  if (!mat || Array.isArray(mat) || !mat.visible) return false;
  if (mat.side !== THREE.FrontSide || mat.shadowSide !== null) return false;
  if (mat.alphaTest > 0 || mat.alphaMap || mat.displacementMap || mat.positionNode) return false;
  if (mat.castShadowNode || mat.maskShadowNode) return false;
  if (mat.transparent && !mat.userData.veilOf) return false;
  const g = m.geometry;
  if (!g.getAttribute('position') || Object.keys(g.morphAttributes).length > 0) return false;
  return true;
}

/**
 * Parts in one indexed geometry for a shadow body: positions (moved by each
 * part's `matrix` when given) and, with `skinned`, skin indices and weights.
 * Null when a skinned part has no skin.
 */
export function mergeShadowParts(parts: Array<{ geo: THREE.BufferGeometry; matrix?: THREE.Matrix4 }>, skinned: boolean): THREE.BufferGeometry | null {
  const spans: Array<{ geo: THREE.BufferGeometry; first: number; count: number; matrix?: THREE.Matrix4 }> = [];
  let vTotal = 0;
  let iTotal = 0;
  for (const p of parts) {
    const g = p.geo;
    if (skinned) {
      const si = g.getAttribute('skinIndex');
      const sw = g.getAttribute('skinWeight');
      if (!si || !sw || si.itemSize !== 4 || sw.itemSize !== 4) return null;
    }
    const n = g.getAttribute('position').count;
    const all = g.index ? g.index.count : n;
    const first = Math.min(all, Math.max(0, g.drawRange.start));
    const count = Math.min(all - first, g.drawRange.count);
    spans.push({ geo: g, first, count, ...(p.matrix ? { matrix: p.matrix } : {}) });
    vTotal += n;
    iTotal += count;
  }
  const pos = new Float32Array(vTotal * 3);
  const si = skinned ? new Uint16Array(vTotal * 4) : null;
  const sw = skinned ? new Float32Array(vTotal * 4) : null;
  const index = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
  const v = new THREE.Vector3();
  let base = 0;
  let at = 0;
  for (const s of spans) {
    const P = s.geo.getAttribute('position');
    const n = P.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i);
      if (s.matrix) v.applyMatrix4(s.matrix);
      pos[(base + i) * 3] = v.x;
      pos[(base + i) * 3 + 1] = v.y;
      pos[(base + i) * 3 + 2] = v.z;
    }
    if (si && sw) {
      const I = s.geo.getAttribute('skinIndex');
      const W = s.geo.getAttribute('skinWeight');
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 4; k++) {
          si[(base + i) * 4 + k] = I.getComponent(i, k);
          sw[(base + i) * 4 + k] = W.getComponent(i, k);
        }
      }
    }
    const idx = s.geo.index;
    for (let i = s.first; i < s.first + s.count; i++) index[at++] = (idx ? idx.getX(i) : i) + base;
    base += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (si && sw) {
    out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

/**
 * Gives a skinned body that never changes its parts one shadow body: every
 * shown part on `skeleton` (bound in the rig's own space) whose shadow
 * `castsPlainShadow` can stand in for joins it and casts no shadow itself.
 * The body is added under `root`. Null when fewer than two parts join.
 */
export function addSkinnedShadowBody(root: THREE.Object3D, skeleton: THREE.Skeleton, name: string): THREE.SkinnedMesh | null {
  const parts: THREE.SkinnedMesh[] = [];
  const identity = new THREE.Matrix4();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.castShadow || sm.userData.shadowOnly) return;
    if (sm.skeleton !== skeleton || sm.bindMode !== 'attached' || !sm.bindMatrix.equals(identity)) return;
    for (let p: THREE.Object3D | null = sm; p && p !== root; p = p.parent) if (!p.visible) return;
    if (castsPlainShadow(sm)) parts.push(sm);
  });
  if (parts.length < 2) return null;
  const geo = mergeShadowParts(parts.map((m) => ({ geo: m.geometry })), true);
  if (!geo) return null;
  const body = new THREE.SkinnedMesh(geo, shadowBodyMaterial());
  body.name = name;
  body.userData.shadowOnly = true;
  body.castShadow = true;
  body.receiveShadow = false;
  body.frustumCulled = false;
  root.add(body);
  body.bind(skeleton, new THREE.Matrix4());
  for (const m of parts) m.castShadow = false;
  return body;
}
