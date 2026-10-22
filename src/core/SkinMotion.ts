/**
 * SLAY — each body's own last pose, for the motion target.
 *
 * Temporal smoothing reads every pixel's motion to find where it was last
 * frame. A skinned body's motion is its pose now against its pose then, and
 * three.js keeps "then" in a bone buffer made when the body's shader is
 * built, kept per skeleton. Bodies that share a look (every rat of a pack,
 * every townsperson, the hero and the paperdoll's hero) share one shader, so
 * all of them read the last pose of whichever skeleton built it: a body
 * standing still read as moving hundreds of pixels, its history was thrown
 * away every frame, and the hero, the townsfolk and the monsters shimmered
 * while the walls around them held still.
 *
 * Here the last pose is the skeleton's own (`previousBoneMatrices`), read
 * per draw the way three.js reads the current one
 * (`referenceBuffer('skeleton.boneMatrices')`), and kept by the skeleton's
 * own update: the pose it held up to the moment it takes the new one.
 */
import * as THREE from 'three/webgpu';
import { add, attribute, positionGeometry, positionPrevious, reference, referenceBuffer } from 'three/tsl';
import { hookSeen } from './ThreeHooks';

/** A skeleton with the pose it held before its last update. */
export type PosedSkeleton = THREE.Skeleton & { previousBoneMatrices?: Float32Array };

/** Copies the pose `s` holds now into its last pose, before it takes a new one. */
export function keepLastPose(s: PosedSkeleton, floats = s.boneMatrices!.length): void {
  const prev = s.previousBoneMatrices;
  if (prev && prev.length === s.boneMatrices!.length) prev.set(s.boneMatrices!.subarray(0, floats));
}

type Builder = THREE.NodeBuilder & {
  object: THREE.Object3D | null;
  needsPreviousData(): boolean;
  getUniformBufferLimit(): number;
};

let installed = false;

export function installSkinMotion(): void {
  if (installed) return;
  installed = true;
  const mat = THREE.NodeMaterial.prototype as unknown as { setupPosition(b: Builder): THREE.Node };
  const skel = THREE.Skeleton.prototype as unknown as { update(this: PosedSkeleton): void };
  if (!hookSeen('Skinning previous bone matrices', typeof mat.setupPosition === 'function' && typeof skel.update === 'function')) return;

  // Made on first read: a body whose shader another body built never
  // passed through `setupPosition` to be given one.
  const own = new WeakMap<THREE.Skeleton, Float32Array>();
  Object.defineProperty(THREE.Skeleton.prototype, 'previousBoneMatrices', {
    configurable: true,
    get(this: THREE.Skeleton) {
      let m = own.get(this);
      if (!m || m.length !== this.boneMatrices!.length) own.set(this, (m = new Float32Array(this.boneMatrices!)));
      return m;
    },
    set(this: THREE.Skeleton, v: Float32Array) {
      own.set(this, v);
    },
  });

  const update = skel.update;
  skel.update = function (this: PosedSkeleton) {
    keepLastPose(this);
    update.call(this);
  };

  const setup = mat.setupPosition;
  mat.setupPosition = function (this: THREE.NodeMaterial, builder: Builder) {
    const o = builder.object as THREE.SkinnedMesh | null;
    // A bone buffer too big for a uniform buffer goes through a texture
    // in three.js; those are left to it.
    if (!o?.isSkinnedMesh || !builder.needsPreviousData() || o.skeleton.bones.length * 64 > builder.getUniformBufferLimit()) {
      return setup.call(this, builder);
    }
    const s = o.skeleton;
    // three.js's own last pose (the shared one) is left out.
    builder.needsPreviousData = () => false;
    let out: THREE.Node;
    try {
      out = setup.call(this, builder);
    } finally {
      delete (builder as Partial<Builder>).needsPreviousData;
    }
    const bones = referenceBuffer('skeleton.previousBoneMatrices', 'mat4', s.bones.length, null) as unknown as {
      element(i: THREE.Node): THREE.Node<'mat4'>;
    };
    const index = attribute('skinIndex', 'uvec4');
    const weight = attribute('skinWeight', 'vec4');
    const at = reference('bindMatrix', 'mat4', null).mul(positionGeometry);
    const posed = add(
      bones.element(index.x).mul(weight.x).mul(at),
      bones.element(index.y).mul(weight.y).mul(at),
      bones.element(index.z).mul(weight.z).mul(at),
      bones.element(index.w).mul(weight.w).mul(at),
    );
    const inverse = reference('bindMatrixInverse', 'mat4', null);
    positionPrevious.assign((inverse.mul(posed) as unknown as THREE.Node<'vec4'>).xyz);
    return out;
  };
}
