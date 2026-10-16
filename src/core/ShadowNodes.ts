/**
 * SLAY — what a solid surface draws into a shadow map.
 *
 * three.js draws every caster into a shadow map with one shared material,
 * and for a caster whose material has a colour node it pulls that whole node
 * in, to read its alpha. Here every colour node is a graph of its own
 * (triplanar scans, patterns, glow), so each caster's shadow shader ran its
 * full surface shading per shadow pixel, read its material's values per
 * draw, and was built and compiled as a shadow pipeline of its own.
 *
 * A shadow pass reads that alpha only for an alpha test (a cut-out leaf):
 * an opaque caster's alpha is set to one and a transparent one's is not
 * tested. The game has no alpha-tested material, so for every caster without
 * one the colour node is left out. Masks (a wall cut away near the hero, a
 * dithered roof) still apply, and so does a moved or swaying shape
 * (`positionNode`). Solid casters then share a handful of shadow pipelines.
 */
import * as THREE from 'three/webgpu';
import { Fn, vec4 } from 'three/tsl';

interface ShadowNodes {
  version: number;
  colorNode: THREE.Node | null;
  depthNode: THREE.Node | null;
  positionNode: THREE.Node | null;
}

type Mat = THREE.NodeMaterial & {
  alphaTest: number;
  alphaMap: THREE.Texture | null;
  castShadowNode?: THREE.Node | null;
  castShadowPositionNode?: THREE.Node | null;
  maskShadowNode?: THREE.Node | null;
};

/** True when the shadow pass needs the material's colour (its alpha is tested). */
function needsColour(m: Mat): boolean {
  return m.alphaTest > 0 || m.alphaToCoverage === true || !!m.alphaMap || !!m.castShadowNode?.isNode;
}

const cache = new WeakMap<THREE.Material, ShadowNodes>();

function solidShadowNodes(m: Mat): ShadowNodes {
  let c = cache.get(m);
  if (c && c.version === m.version) return c;
  const mask = (m.maskShadowNode?.isNode ? m.maskShadowNode : m.maskNode?.isNode ? m.maskNode : null) as THREE.Node<'bool'> | null;
  let colorNode: THREE.Node | null = null;
  if (mask) {
    colorNode = Fn(([color]: [THREE.Node<'vec4'>]) => {
      mask.not().discard();
      return color;
    })(vec4(0, 0, 0, 1)) as unknown as THREE.Node;
  }
  const position = m.castShadowPositionNode?.isNode ? m.castShadowPositionNode : m.positionNode?.isNode ? m.positionNode : null;
  c = { version: m.version, colorNode, depthNode: m.depthNode?.isNode ? m.depthNode : null, positionNode: position };
  cache.set(m, c);
  return c;
}

const proto = THREE.Renderer.prototype as unknown as { _getShadowNodes(m: THREE.Material): ShadowNodes };
const base = proto._getShadowNodes;
proto._getShadowNodes = function (this: THREE.Renderer, m: THREE.Material): ShadowNodes {
  const n = m as Mat;
  return needsColour(n) ? base.call(this, m) : solidShadowNodes(n);
};
