/**
 * SLAY — a draw never waits for its shader.
 *
 * three.js builds a mesh's shader the first time it is drawn, right there in
 * the frame: the node graph is turned into WGSL on the main thread, then the
 * GPU pipeline is made with the blocking `createRenderPipeline`. A map's warm
 * frame did that for over a hundred shaders in one go, a five second task
 * that froze the page, and the pipelines queued in the GPU process held up
 * every other tab's drawing with it: the whole browser locked. In play, a
 * first Shadow Clone or a new monster's look stopped the game the same way.
 *
 * With the gate on, a mesh whose shader is not ready is left out of that
 * frame instead. Its node graph is built between frames, a few milliseconds
 * of them at a time, and its pipeline is made with `createRenderPipelineAsync`
 * on the GPU's own threads. It is drawn from the first frame both are done,
 * a few frames later, rather than stalling them.
 *
 * A node graph reads the draw it is built for from the renderer (which target,
 * which extra outputs), so each is built with the target and outputs it was
 * asked for under put back for the moment. three's own background builder
 * reads whatever the renderer holds when it gets round to it, which built
 * shaders for the wrong target: pipelines that failed, or were built twice.
 *
 * Full-screen passes (the post chain's quads) are kept as three draws them:
 * a frame missing its tone map or bloom would flash, where a mesh coming in
 * a moment late is not seen behind the load curtain, and rarely in play.
 *
 * The gate is only on while the game's own frame draws. The icon and
 * portrait studio reads its pictures straight back, so it builds as before.
 */
import * as THREE from 'three/webgpu';

/** The parts of three's render objects and managers the gate reads. */
interface RenderObjectLike {
  object: THREE.Object3D & { isQuadMesh?: boolean };
  /** Set the first time the object's shader is asked for; null until then. */
  _nodeBuilderState: unknown;
}
interface NodesLike {
  needsRefresh(ro: RenderObjectLike): number;
  getForRender(ro: RenderObjectLike): unknown;
  getForRenderCacheKey(ro: RenderObjectLike): unknown;
  get(ro: RenderObjectLike): { nodeBuilderState?: unknown };
  nodeBuilderCache: Map<unknown, unknown>;
}
interface PipelinesLike {
  getForRender(ro: RenderObjectLike, promises?: { push(p: Promise<unknown>): void } | null): unknown;
  isReady(ro: RenderObjectLike): boolean;
}
/** The renderer state a node graph reads while it is built. */
interface DrawState {
  _renderTarget: THREE.RenderTarget | null;
  _mrt: unknown;
}

/**
 * Instanced meshes keep their matrices in a storage buffer rather than a
 * uniform array. three writes a uniform array's length into the shader, so
 * every pile of rocks, bones or barrels with its own count had a shader and
 * a pipeline of its own: 37 copies of one shader on a single map. A storage
 * buffer's length is not part of the shader, so they all share one.
 *
 * Done the first time the mesh is drawn, before any shader is built for it.
 * The array is the same one, so `setMatrixAt` and `needsUpdate` work as before.
 */
const INSTANCES = 'slInstances';
const ours = new WeakSet<THREE.BufferAttribute>();
function shareInstancing(o: THREE.Object3D): void {
  const m = o as THREE.InstancedMesh;
  if (!m.isInstancedMesh) return;
  const im = m.instanceMatrix as THREE.InstancedBufferAttribute & { isStorageInstancedBufferAttribute?: boolean };
  if (im.isStorageInstancedBufferAttribute) return;
  const st = new THREE.StorageInstancedBufferAttribute(im.array as Float32Array, 16);
  st.setUsage(im.usage);
  st.name = INSTANCES;
  ours.add(st);
  m.instanceMatrix = st;
}

// A storage buffer is named in the shader after its node's id, which made
// each mesh's shader text unique again. These get fixed names: the matrices,
// and the last frame's copy that motion vectors read (a clone, which keeps
// the attribute's name but is not one of ours).
{
  const proto = THREE.StorageBufferNode.prototype as unknown as {
    generate(this: { name: string; value: unknown }, builder: unknown, output?: unknown): string;
  };
  const generate = proto.generate;
  proto.generate = function (builder, output) {
    const v = this.value as THREE.BufferAttribute | undefined;
    if (!this.name && v?.name === INSTANCES) this.name = ours.has(v) ? 'instanceMatrices' : 'instanceMatricesPrev';
    return generate.call(this, builder, output);
  };
}

/** three's `RenderObjectRefreshType.NONE`: nothing to update this frame. */
const REFRESH_NONE = 0;

export class ShaderGate {
  /** On while the game's own frame draws. */
  on = false;
  /** Draws left out since this was last zeroed, each for a shader not ready yet. */
  skipped = 0;
  /** How long one turn of building may hold the page (ms). Raised behind the load curtain. */
  sliceMs = 6;
  /** Pipelines the GPU is still making. */
  private making = 0;
  /** Shaders to build, each with the draw state it was asked for under. */
  private queue: Array<[RenderObjectLike, THREE.RenderTarget | null, unknown]> = [];
  private queued = new WeakSet<RenderObjectLike>();
  private pumping = false;
  private readonly nodes: NodesLike;
  private readonly state: DrawState;

  constructor(gl: THREE.WebGPURenderer) {
    const r = gl as unknown as { _nodes: NodesLike; _pipelines: PipelinesLike } & DrawState;
    const nodes = r._nodes;
    const pipes = r._pipelines;
    this.nodes = nodes;
    this.state = r;
    const held = (ro: RenderObjectLike): boolean => this.on && ro.object.isQuadMesh !== true;

    // First asked for here in a draw: a shader not built yet is queued and
    // the draw reports nothing to update.
    const needsRefresh = nodes.needsRefresh.bind(nodes);
    nodes.needsRefresh = (ro) => {
      if (ro._nodeBuilderState === null) {
        shareInstancing(ro.object);
        if (held(ro) && !this.built(ro)) {
          this.ask(ro);
          return REFRESH_NONE;
        }
      }
      return needsRefresh(ro);
    };

    // Then the pipeline: none while the shader is still being built, and an
    // asynchronous one once it is. `isReady` stays false until it exists, so
    // three leaves the draw out on its own.
    const making = {
      push: (p: Promise<unknown>) => {
        this.making++;
        void p.finally(() => this.making--);
      },
    };
    const getForRender = pipes.getForRender.bind(pipes);
    pipes.getForRender = (ro, promises = null) => {
      if (promises !== null || !held(ro)) return getForRender(ro, promises);
      if (ro._nodeBuilderState === null) return undefined;
      return getForRender(ro, making);
    };
    const isReady = pipes.isReady.bind(pipes);
    pipes.isReady = (ro) => {
      const ok = isReady(ro);
      if (!ok && this.on) this.skipped++;
      return ok;
    };
  }

  /** Whether any shader or pipeline is still being made. */
  get busy(): boolean {
    return this.making > 0 || this.queue.length > 0;
  }

  /**
   * Resolves once nothing is being made, or at `until` (performance.now ms).
   * Always after a task at least, so a caller looping on it lets the page run.
   */
  idle(until: number): Promise<void> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (!this.busy || performance.now() >= until) resolve();
        else setTimeout(check, 16);
      };
      setTimeout(check, 0);
    });
  }

  /** Whether the shader for `ro` is built (for it, or for another just like it). */
  private built(ro: RenderObjectLike): boolean {
    return this.nodes.get(ro).nodeBuilderState !== undefined || this.nodes.nodeBuilderCache.has(this.nodes.getForRenderCacheKey(ro));
  }

  private ask(ro: RenderObjectLike): void {
    if (this.queued.has(ro)) return;
    this.queued.add(ro);
    this.queue.push([ro, this.state._renderTarget, this.state._mrt]);
    if (!this.pumping) {
      this.pumping = true;
      setTimeout(this.pump, 0);
    }
  }

  /** Builds queued shaders for up to `sliceMs`, then gives the page back. */
  private readonly pump = (): void => {
    const st = this.state;
    const t0 = performance.now();
    while (this.queue.length > 0 && performance.now() - t0 < this.sliceMs) {
      const [ro, target, mrt] = this.queue.shift()!;
      this.queued.delete(ro);
      if (this.built(ro)) continue;
      const keepTarget = st._renderTarget;
      const keepMrt = st._mrt;
      st._renderTarget = target;
      st._mrt = mrt;
      try {
        this.nodes.getForRender(ro);
      } catch {
        // three logs a shader that fails and draws it plain; nothing to add.
      } finally {
        st._renderTarget = keepTarget;
        st._mrt = keepMrt;
      }
    }
    if (this.queue.length > 0) setTimeout(this.pump, 0);
    else this.pumping = false;
  };
}
