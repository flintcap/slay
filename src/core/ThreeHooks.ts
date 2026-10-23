/**
 * SLAY — every place the game reaches inside three.js, and a test of them all.
 *
 * Some of the game's speed and looks come from changing or reading parts of
 * three.js that are not its public API: stable shader names, kept shadows,
 * shaders built a slice at a time, canvas uploads that do not wait, the
 * scene's light list. A new three.js can rename or drop any of them without
 * an error; the game would only get slower, stutter, or lose a shadow. So:
 *
 *  - three.js is pinned to one version in package.json (no `^`), and
 *    `THREE_TESTED` is the release these hooks were last checked on;
 *  - every hook is listed in `HOOKS`, with the three.js file and the words in
 *    it the hook depends on;
 *  - at startup `selfTest` looks for each one (on the classes, on the open
 *    renderer, or as the game first uses it) and puts what is missing in the
 *    log and the bug report;
 *  - `tools/check-threehooks.mjs` reads the installed three.js for all of
 *    them and fails on any that moved, and every browser check fails on a
 *    startup self-test that did.
 *
 * Updating three.js: bump the pin, run the checker, mend what it names, then
 * raise `THREE_TESTED`.
 *
 * i18n-ignore-file: three.js names and source lines, read by developers.
 */
import * as THREE from 'three/webgpu';
import { skinning } from 'three/tsl';

/** The three.js release (`THREE.REVISION`) these hooks were written for and checked on. */
export const THREE_TESTED = '186';

/** How a hook is checked in the running game. */
type Check =
  /** On three's classes, before anything changes them. */
  | { on: 'class'; test: () => boolean }
  /** On the game's open renderer. */
  | { on: 'renderer'; test: (gl: THREE.WebGPURenderer) => boolean }
  /** Where the game uses it: the hook reports itself (`hookSeen`) the first time. */
  | { on: 'use' };

export interface ThreeHook {
  /** What is reached, in three's names. */
  id: string;
  /** The game's file that reaches it. */
  ours: string;
  /** The three.js file (under `node_modules/three/`) and the words in it the hook needs. */
  theirs: string;
  needs: string[];
  check: Check;
}

const fn = (o: unknown, k: string): boolean => typeof (o as Record<string, unknown> | null | undefined)?.[k] === 'function';
const fns = (o: unknown, ...ks: string[]): boolean => ks.every((k) => fn(o, k));
type Inner = Record<string, unknown>;
const inner = (gl: THREE.WebGPURenderer): Inner => gl as unknown as Inner;

export const HOOKS: readonly ThreeHook[] = [
  {
    id: 'VelocityNode.projectionMatrix',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/nodes/accessors/VelocityNode.js',
    needs: ['this.projectionMatrix = null;', 'setProjectionMatrix( projectionMatrix )', 'uniform( this.projectionMatrix )'],
    check: { on: 'use' },
  },
  {
    id: 'TextureSource.getSize',
    ours: 'src/core/TextureSize.ts',
    theirs: 'src/textures/TextureSource.js',
    needs: ['getSize( target )', 'target.set( data.width, data.height, data.depth || 0 );'],
    check: { on: 'class', test: () => fn(THREE.TextureSource.prototype, 'getSize') },
  },
  {
    id: 'WGSLNodeBuilder.getUniformFromNode',
    ours: 'src/core/NodeNames.ts',
    theirs: 'src/renderers/webgpu/nodes/WGSLNodeBuilder.js',
    needs: ['getUniformFromNode( node, type, shaderStage, name = null )'],
    check: { on: 'class', test: () => fn(THREE.WGSLNodeBuilder.prototype, 'getUniformFromNode') },
  },
  {
    id: 'Renderer._getShadowNodes',
    ours: 'src/core/ShadowNodes.ts',
    theirs: 'src/renderers/common/Renderer.js',
    needs: ['_getShadowNodes( material )'],
    check: { on: 'class', test: () => fn(THREE.Renderer.prototype, '_getShadowNodes') },
  },
  {
    id: 'ShadowNode.setupRenderTarget, renderShadow',
    ours: 'src/core/ShadowCache.ts',
    theirs: 'src/nodes/lighting/ShadowNode.js',
    needs: ['setupRenderTarget( shadow, builder )', 'renderShadow( frame )', 'getRenderObjectFunction()'],
    check: { on: 'class', test: () => fns(THREE.ShadowNode.prototype, 'setupRenderTarget', 'renderShadow') && fn(THREE.Renderer.prototype, 'getRenderObjectFunction') },
  },
  {
    id: 'StorageBufferNode.generate',
    ours: 'src/core/ShaderGate.ts',
    theirs: 'src/nodes/accessors/StorageBufferNode.js',
    needs: ['generate( builder )'],
    check: { on: 'class', test: () => fn(THREE.StorageBufferNode.prototype, 'generate') },
  },
  {
    id: 'Renderer._nodes (needsRefresh, get, getForRender, getForRenderCacheKey, nodeBuilderCache)',
    ours: 'src/core/ShaderGate.ts',
    theirs: 'src/renderers/common/nodes/NodeManager.js',
    needs: ['needsRefresh( renderObject )', 'getForRenderCacheKey( renderObject )', 'this.nodeBuilderCache = new Map()', 'getForRender( renderObject'],
    check: {
      on: 'renderer',
      test: (gl) => {
        const n = inner(gl)._nodes;
        return fns(n, 'needsRefresh', 'get', 'getForRender', 'getForRenderCacheKey') && (n as Inner).nodeBuilderCache instanceof Map;
      },
    },
  },
  {
    id: 'Renderer._pipelines (getForRender, isReady)',
    ours: 'src/core/ShaderGate.ts',
    theirs: 'src/renderers/common/Pipelines.js',
    needs: ['getForRender( renderObject, promises = null )', 'isReady( renderObject )'],
    check: { on: 'renderer', test: (gl) => fns(inner(gl)._pipelines, 'getForRender', 'isReady') },
  },
  {
    id: 'Renderer._renderTarget, _mrt',
    ours: 'src/core/ShaderGate.ts',
    theirs: 'src/renderers/common/Renderer.js',
    needs: ['this._renderTarget = null', 'this._mrt = null'],
    check: { on: 'renderer', test: (gl) => '_renderTarget' in inner(gl) && '_mrt' in inner(gl) },
  },
  {
    id: 'RenderObject._nodeBuilderState',
    ours: 'src/core/ShaderGate.ts',
    theirs: 'src/renderers/common/RenderObject.js',
    needs: ['this._nodeBuilderState = null'],
    check: { on: 'use' },
  },
  {
    id: 'Renderer._objects._renderObjects',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/renderers/common/RenderObjects.js',
    needs: ['this._renderObjects = new Set()', 'this._renderObjects.delete( renderObject )'],
    check: { on: 'renderer', test: (gl) => (inner(gl)._objects as Inner | null | undefined)?._renderObjects instanceof Set },
  },
  {
    id: 'RenderObjects.createRenderObject, onDispose',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/renderers/common/RenderObjects.js',
    needs: [
      'createRenderObject( nodes, geometries, renderer, object, material, scene, camera, lightsNode, renderContext, clippingContext, passId )',
      'renderObject.onDispose = () => {',
    ],
    check: { on: 'renderer', test: (gl) => fn(inner(gl)._objects, 'createRenderObject') },
  },
  {
    id: 'NodeBuilder._getBindGroup, _currentRenderContext',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/nodes/core/NodeBuilder.js',
    needs: [
      '_getBindGroup( groupName, bindings )',
      'const currentContext = this.renderer._currentRenderContext || this.renderer;',
      'let bindingGroupsCache = _bindingGroupsCache.get( currentContext );',
    ],
    check: { on: 'class', test: () => fn(THREE.NodeBuilder.prototype, '_getBindGroup') },
  },
  {
    id: 'ViewportTextureNode.getTextureForReference, defaultFramebuffer',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/nodes/display/ViewportTextureNode.js',
    needs: [
      'getTextureForReference( reference = null )',
      'this.defaultFramebuffer = defaultFramebuffer;',
      'defaultFramebuffer = this.referenceNode.defaultFramebuffer;',
      'const framebufferTexture = defaultFramebuffer.clone();',
    ],
    check: { on: 'class', test: () => fn(THREE.ViewportTextureNode.prototype, 'getTextureForReference') },
  },
  {
    id: 'NodeMaterial.setupPosition',
    ours: 'src/art/Cloth.ts',
    theirs: 'src/materials/nodes/NodeMaterial.js',
    needs: ['setupPosition( builder ) {', "positionLocal.assign( subBuild( this.positionNode, 'POSITION', 'vec3' ) );"],
    check: { on: 'class', test: () => fn(THREE.NodeMaterial.prototype, 'setupPosition') },
  },
  {
    id: 'VelocityNode positionPrevious',
    ours: 'src/art/Cloth.ts',
    theirs: 'src/nodes/accessors/VelocityNode.js',
    needs: ['this.previousProjectionMatrix.mul( previousModelViewMatrix ).mul( positionPrevious )'],
    check: { on: 'use' },
  },
  {
    id: 'Renderer onBeforeRender, castShadowPositionNode',
    ours: 'src/art/Cloth.ts',
    theirs: 'src/renderers/common/Renderer.js',
    needs: ['object.onBeforeRender( this, scene, camera, geometry, material, group );', 'material.castShadowPositionNode && material.castShadowPositionNode.isNode'],
    check: { on: 'use' },
  },
  {
    id: 'RenderObject.onObjectDispose, _bindings',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/renderers/common/RenderObject.js',
    needs: ['this._bindings = null', 'this.onObjectDispose = () => {', "this.object.addEventListener( 'dispose', this.onObjectDispose );"],
    check: { on: 'use' },
  },
  {
    id: 'Batch.js previous matrices texture',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/nodes/accessors/Batch.js',
    needs: ['const previousMatricesTexture = new DataTexture( image.data.slice(), image.width, image.height, format, type );'],
    check: { on: 'use' },
  },
  {
    id: 'RenderObject.scene, dispose',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/renderers/common/RenderObject.js',
    needs: ['this.scene = scene', 'dispose() {'],
    check: { on: 'use' },
  },
  {
    id: 'Renderer._samples',
    ours: 'src/core/Studio.ts',
    theirs: 'src/renderers/common/Renderer.js',
    needs: ['this._samples ='],
    check: { on: 'renderer', test: (gl) => typeof inner(gl)._samples === 'number' },
  },
  {
    id: 'WebGPUTextureUtils._copyImageToTexture',
    ours: 'src/core/CanvasUpload.ts',
    theirs: 'src/renderers/webgpu/utils/WebGPUTextureUtils.js',
    needs: ['_copyImageToTexture( image, textureGPU, textureDescriptorGPU, originDepth, flipY, premultiplyAlpha, mipLevel = 0 )'],
    check: {
      on: 'renderer',
      test: (gl) => {
        const b = gl.backend as unknown as Inner;
        return fn(b.textureUtils, '_copyImageToTexture') && typeof b.device === 'object' && b.device !== null;
      },
    },
  },
  {
    id: 'Renderer.onDeviceLost',
    ours: 'src/core/Engine.ts',
    theirs: 'src/renderers/webgpu/WebGPUBackend.js',
    needs: ['renderer.onDeviceLost( deviceLossInfo )'],
    check: { on: 'renderer', test: (gl) => fn(gl, 'onDeviceLost') },
  },
  {
    id: 'TAAUNode._historyRenderTarget',
    ours: 'src/core/Renderer.ts',
    theirs: 'examples/jsm/tsl/display/TAAUNode.js',
    needs: ['this._historyRenderTarget = new RenderTarget('],
    check: { on: 'use' },
  },
  {
    id: 'TRAANode._historyRenderTarget',
    ours: 'src/core/Renderer.ts',
    theirs: 'examples/jsm/tsl/display/TRAANode.js',
    needs: ['this._historyRenderTarget = new RenderTarget('],
    check: { on: 'use' },
  },
  {
    id: 'NodeFrame.update',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/nodes/core/NodeFrame.js',
    needs: ['this.frameId ++;'],
    check: { on: 'use' },
  },
  {
    id: 'BufferNode.updateRanges',
    ours: 'src/art/creatures/Packs.ts',
    theirs: 'src/renderers/webgpu/utils/WebGPUBindingUtils.js',
    needs: ['const updateRanges = binding.updateRanges;'],
    check: { on: 'use' },
  },
  {
    id: 'NodeUniformBuffer.updateRanges',
    ours: 'src/art/creatures/Packs.ts',
    theirs: 'src/renderers/common/nodes/NodeUniformBuffer.js',
    needs: ['return this.nodeUniform.updateRanges;'],
    // Not exported: the checker reads it in three's source.
    check: { on: 'use' },
  },
  {
    id: 'Skinning previous bone matrices',
    ours: 'src/core/SkinMotion.ts',
    theirs: 'src/nodes/accessors/Skinning.js',
    needs: ['if ( builder.needsPreviousData() ) {', 'positionPrevious.assign( previousSkinnedPosition );', 'const skinVertex = bindMatrix.mul( position );', 'skeleton.update();'],
    check: { on: 'use' },
  },
  {
    id: 'skinning boneMatrices buffer',
    ours: 'src/art/creatures/Packs.ts',
    theirs: 'src/nodes/accessors/Skinning.js',
    needs: ["referenceBuffer( 'skeleton.boneMatrices', 'mat4', skeleton.bones.length )", 'skeleton.update();'],
    check: { on: 'class', test: () => typeof skinning === 'function' },
  },
  {
    id: 'ReferenceNode.setGroup',
    ours: 'src/core/Renderer.ts',
    theirs: 'src/nodes/accessors/ReferenceNode.js',
    needs: ['setGroup( group )'],
    check: { on: 'class', test: () => fn(THREE.ReferenceNode.prototype, 'setGroup') },
  },
  {
    id: 'MaterialReferenceNode.material, updateReference',
    ours: 'src/core/Tsl.ts',
    theirs: 'src/nodes/accessors/MaterialReferenceNode.js',
    needs: ['updateReference( state )', 'this.material = material'],
    check: { on: 'class', test: () => fn(THREE.MaterialReferenceNode.prototype, 'updateReference') },
  },
  {
    id: 'lighting context: radiance, irradiance',
    ours: 'src/art/Liquids.ts, src/core/BounceLight.ts',
    theirs: 'src/nodes/lighting/LightingContextNode.js',
    needs: ["radiance: vec3().toVar( 'radiance' )", "irradiance: vec3().toVar( 'irradiance' )"],
    check: { on: 'use' },
  },
  {
    id: 'lighting context: materialLightings',
    ours: 'src/core/Lighting.ts',
    theirs: 'src/nodes/lighting/LightsNode.js',
    needs: ['builder.context.materialLightings'],
    check: { on: 'use' },
  },
];

/** What the game found as it installed or first used a hook: true when it was there. */
const seen = new Map<string, boolean>();

/**
 * A hook reports whether what it needed was there, as it installs (before it
 * replaces it) or the first time it is used. The first report stands, unless
 * a later one says it was missing.
 */
export function hookSeen(id: string, found: boolean): boolean {
  if (!found || !seen.has(id)) seen.set(id, found);
  return found;
}

export interface HookReport {
  /** The running three.js release. */
  revision: string;
  /** Hooks found missing. */
  missing: string[];
  /** Hooks used only in play that have not been used yet. */
  unseen: string[];
}

/**
 * Looks for every hook. With no renderer, only the classes are looked at;
 * hooks checked "in use" count once they have reported (`hookSeen`).
 */
export function selfTest(gl: THREE.WebGPURenderer | null): HookReport {
  const missing: string[] = [];
  const unseen: string[] = [];
  for (const h of HOOKS) {
    const c = h.check;
    let ok: boolean | undefined;
    if (c.on === 'use') ok = seen.get(h.id);
    else if (c.on === 'class') ok = seen.get(h.id) ?? c.test();
    else if (gl) ok = c.test(gl);
    else continue;
    if (ok === undefined) unseen.push(h.id);
    else if (!ok) missing.push(h.id);
  }
  if (THREE.REVISION !== THREE_TESTED) missing.unshift(`three.js r${THREE.REVISION} is not r${THREE_TESTED}, the release the hooks were checked on`);
  return { revision: THREE.REVISION, missing, unseen };
}
