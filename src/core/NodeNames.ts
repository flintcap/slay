/**
 * SLAY — stable names for the uniform buffers three.js declares in WGSL.
 *
 * A buffer node with no name of its own (a skeleton's bone matrices, a small
 * instanced mesh's matrices) is declared as `NodeBuffer_<node id>`, and every
 * build makes a new node. So two monsters on the same rig wrote different
 * shader text, and each was a separate shader compile and pipeline: every
 * skinned body in a scene its own, and every monster that walked in mid-fight
 * a compile on that frame. Named by their order in the shader instead, equal
 * shaders read the same and the GPU compiles them once.
 */
import * as THREE from 'three/webgpu';

type GetUniform = (this: THREE.NodeBuilder, node: THREE.Node, type: string, stage?: string, name?: string | null) => unknown;

const names = new WeakMap<THREE.NodeBuilder, Map<THREE.Node, string>>();
const proto = THREE.WGSLNodeBuilder.prototype as unknown as { getUniformFromNode: GetUniform };
const base = proto.getUniformFromNode;

proto.getUniformFromNode = function (node, type, stage, name = null) {
  if (!name && type === 'buffer') {
    let mine = names.get(this);
    if (!mine) {
      mine = new Map();
      names.set(this, mine);
    }
    name = mine.get(node) ?? `NodeBuffer${mine.size}`;
    mine.set(node, name);
  }
  return base.call(this, node, type, stage, name);
};
