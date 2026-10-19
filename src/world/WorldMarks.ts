/**
 * SLAY — marks the years left on a level: moss creeping up the foot of a
 * wall and onto the floor, water and rust running down from the top, soot
 * above every wall torch, old blood, scorch and damp.
 *
 * Each mark is a box laid against the surface it marks. Drawn after the
 * solid world, a box reads the depth already in the frame, finds the
 * surface point behind each of its pixels and paints that point by where it
 * sits in the box. So a mark follows any shape (lumpy cave rock, a pillar's
 * corner, the step where wall meets floor) with no geometry of its own, and
 * one draw holds every mark on the level.
 *
 * Marks only darken and tint (the colour under them is multiplied), so they
 * take whatever light already falls there and never glow in the dark. A
 * surface facing away from a mark's axis takes less of it; a mark that wraps
 * (moss, damp, blood) bends round onto the floor at a wall's foot.
 */

import * as THREE from 'three/webgpu';
import {
  Discard, Fn, abs, attribute, cameraProjectionMatrixInverse, cameraWorldMatrix, cross, dFdx, dFdy, dot, float, getViewPosition,
  length, max, mix, screenUV, sin, smoothstep, step, vec2, vec3, vec4, viewportDepthTexture,
} from 'three/tsl';
import { fxf, fxn } from '../fx/kit/Nodes';
import { vary, type F, type V2, type V4 } from '../core/Tsl';
import { streamFor } from '../core/RNG';
import type { BiomeId, DungeonLevel } from '../types';
import { STEP_HEIGHT, TILE_SIZE } from './DungeonGen';
import { T_WALL, isWalkableValue } from './Layouts';

export const MARK = { moss: 0, streak: 1, soot: 2, blood: 3, scorch: 4, rust: 5, damp: 6 } as const;
export type MarkKind = keyof typeof MARK;

/** What each kind multiplies the surface by at full strength (linear). */
const TINT: Record<MarkKind, readonly [number, number, number]> = {
  moss: [0.42, 0.62, 0.3],
  streak: [0.55, 0.53, 0.5],
  soot: [0.2, 0.18, 0.17],
  blood: [0.36, 0.05, 0.04],
  scorch: [0.2, 0.17, 0.15],
  rust: [0.82, 0.48, 0.28],
  damp: [0.64, 0.62, 0.6],
};

/** Kinds that bend round onto the floor at a wall's foot. */
const WRAPS: ReadonlySet<MarkKind> = new Set(['moss', 'damp', 'blood']);

export interface MarkSpec {
  kind: MarkKind;
  /** Centre of the box. */
  x: number;
  y: number;
  z: number;
  /** The axis the mark is projected along: out of the surface (unit). */
  nx: number;
  ny: number;
  nz: number;
  /** Width and height on the surface and depth either side of it, metres. */
  w: number;
  h: number;
  d: number;
  /** 0..1 */
  strength: number;
}

/** How much of each kind a biome wears: per wall face, and per floor tile. */
interface MarkMix {
  wall: Partial<Record<MarkKind, number>>;
  floor: Partial<Record<MarkKind, number>>;
  /** Soot above wall torches. */
  soot: boolean;
}

const MIXES: Partial<Record<BiomeId, MarkMix>> = {
  crypt: { wall: { streak: 0.08, moss: 0.06, blood: 0.015 }, floor: { damp: 0.03, blood: 0.01 }, soot: true },
  caverns: { wall: { streak: 0.12, moss: 0.14 }, floor: { damp: 0.05, moss: 0.03 }, soot: true },
  foundry: { wall: { rust: 0.14, scorch: 0.05 }, floor: { scorch: 0.03 }, soot: true },
  sunkenTemple: { wall: { streak: 0.2, moss: 0.24 }, floor: { moss: 0.06, damp: 0.06 }, soot: true },
  hive: { wall: { moss: 0.12, streak: 0.08, blood: 0.02 }, floor: { damp: 0.04 }, soot: true },
  frostvault: { wall: { streak: 0.1 }, floor: { damp: 0.03 }, soot: true },
  desertTomb: { wall: { streak: 0.04, blood: 0.01 }, floor: { scorch: 0.008 }, soot: true },
  ashwaste: { wall: { scorch: 0.1, streak: 0.04 }, floor: { scorch: 0.04 }, soot: true },
  hell: { wall: { scorch: 0.1, blood: 0.05 }, floor: { scorch: 0.03, blood: 0.03 }, soot: true },
  voidspire: { wall: { streak: 0.06, scorch: 0.04 }, floor: { scorch: 0.01 }, soot: true },
};

/** Most marks one level holds. */
const MAX_MARKS = 900;

export interface MarkPlanInput {
  level: DungeonLevel;
  biome: BiomeId;
  heights: Int8Array;
  wallHeight: number;
  /** Raw rock walls bulge: their marks reach further either side. */
  rough: boolean;
  /** Wall torches: flame position and the way the bracket faces. */
  torches: ReadonlyArray<{ x: number; y: number; z: number }>;
}

/** Where the marks go. Its own random stream: the level is the same with or without them. */
export function planMarks(o: MarkPlanInput): MarkSpec[] {
  const mix = MIXES[o.biome];
  if (!mix) return [];
  const lv = o.level;
  const W = lv.width;
  const H = lv.height;
  const rng = streamFor(lv.seed, 'worldMarks');
  const out: MarkSpec[] = [];
  const tx = (x: number): number => (x - W / 2 + 0.5) * TILE_SIZE;
  const tz = (y: number): number => (y - H / 2 + 0.5) * TILE_SIZE;
  const reach = o.rough ? 0.55 : 0.3;
  const half = TILE_SIZE / 2;
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const wallKinds = Object.entries(mix.wall) as Array<[MarkKind, number]>;
  const floorKinds = Object.entries(mix.floor) as Array<[MarkKind, number]>;

  for (let y = 0; y < H && out.length < MAX_MARKS; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isWalkableValue(lv.tiles[i]!)) continue;
      const fy = o.heights[i]! * STEP_HEIGHT;
      const cx = tx(x);
      const cz = tz(y);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || lv.tiles[ny * W + nx] !== T_WALL) continue;
        // The face sits on the tile's edge and looks back into the tile.
        const fx = cx + dx * half;
        const fz = cz + dy * half;
        for (const [kind, p] of wallKinds) {
          if (!rng.chance(p)) continue;
          const along = rng.range(-0.4, 0.4) * TILE_SIZE;
          const px = fx + (dy !== 0 ? along : 0);
          const pz = fz + (dx !== 0 ? along : 0);
          const w = rng.range(0.9, 1.9);
          let h: number;
          let my: number;
          if (kind === 'streak' || kind === 'rust') {
            // From the top of the wall down most of its height.
            h = o.wallHeight * rng.range(0.55, 0.9);
            my = fy + o.wallHeight - h / 2;
          } else if (kind === 'moss' || kind === 'damp') {
            // From the foot up, reaching onto the floor.
            h = rng.range(0.9, 1.8);
            my = fy + h * 0.3;
          } else {
            h = rng.range(0.8, 1.5);
            my = fy + rng.range(0.6, 1.6);
          }
          out.push({ kind, x: px, y: my, z: pz, nx: -dx, ny: 0, nz: -dy, w, h, d: reach + (WRAPS.has(kind) ? 0.35 : 0), strength: rng.range(0.6, 1) });
        }
      }
      for (const [kind, p] of floorKinds) {
        if (!rng.chance(p)) continue;
        const s = rng.range(1.0, 2.4);
        out.push({
          kind, x: cx + rng.range(-0.5, 0.5), y: fy, z: cz + rng.range(-0.5, 0.5), nx: 0, ny: 1, nz: 0,
          w: s, h: s * rng.range(0.7, 1.3), d: 0.3, strength: rng.range(0.5, 0.9),
        });
      }
    }
  }

  if (mix.soot) {
    for (const t of o.torches) {
      if (out.length >= MAX_MARKS) break;
      // The wall face nearest the flame, if it is close: a free-standing
      // brazier blackens no wall.
      const gx = Math.floor(t.x / TILE_SIZE + W / 2);
      const gy = Math.floor(t.z / TILE_SIZE + H / 2);
      let best: { nx: number; nz: number; px: number; pz: number; d: number } | null = null;
      for (const [dx, dy] of dirs) {
        const wx = gx + dx;
        const wy = gy + dy;
        if (wx < 0 || wy < 0 || wx >= W || wy >= H || lv.tiles[wy * W + wx] !== T_WALL) continue;
        const px = dx !== 0 ? tx(gx) + dx * half : t.x;
        const pz = dy !== 0 ? tz(gy) + dy * half : t.z;
        const d = Math.hypot(px - t.x, pz - t.z);
        if (d < 0.9 && (!best || d < best.d)) best = { nx: -dx, nz: -dy, px, pz, d };
      }
      if (!best) continue;
      const h = rng.range(1.4, 2.0);
      out.push({ kind: 'soot', x: best.px, y: t.y - 0.15 + h / 2, z: best.pz, nx: best.nx, ny: 0, nz: best.nz, w: rng.range(0.9, 1.2), h, d: reach + 0.1, strength: rng.range(0.75, 1) });
    }
  }
  return out;
}

/** The marks of one level: one instanced draw. */
export class WorldMarks {
  readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.BoxGeometry;
  private readonly mat: THREE.MeshBasicNodeMaterial;

  constructor(marks: readonly MarkSpec[]) {
    const n = marks.length;
    this.geo = new THREE.BoxGeometry(2, 2, 2);
    const iC = new Float32Array(n * 4);
    const iR = new Float32Array(n * 4);
    const iU = new Float32Array(n * 4);
    const iN = new Float32Array(n * 4);
    const iT = new Float32Array(n * 4);
    this.mat = marksMaterial();
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, n));
    this.mesh.name = 'worldMarks';
    this.mesh.count = n;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Before every glow and spark: a mark multiplies what is under it.
    this.mesh.renderOrder = -10;
    const m = new THREE.Matrix4();
    const N = new THREE.Vector3();
    const U = new THREE.Vector3();
    const R = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const s = marks[k]!;
      N.set(s.nx, s.ny, s.nz).normalize();
      // Up on the surface: world up on a wall, along +z on a floor.
      U.set(0, 1, 0);
      if (Math.abs(N.y) > 0.7) U.set(0, 0, 1);
      R.crossVectors(U, N).normalize();
      U.crossVectors(N, R).normalize();
      const hw = s.w / 2;
      const hh = s.h / 2;
      m.makeBasis(R.clone().multiplyScalar(hw), U.clone().multiplyScalar(hh), N.clone().multiplyScalar(s.d));
      m.setPosition(s.x, s.y, s.z);
      this.mesh.setMatrixAt(k, m);
      iC.set([s.x, s.y, s.z, MARK[s.kind]], k * 4);
      iR.set([R.x / hw, R.y / hw, R.z / hw, ((k * 0.618034) % 1) * 97], k * 4);
      iU.set([U.x / hh, U.y / hh, U.z / hh, s.strength], k * 4);
      iN.set([N.x / s.d, N.y / s.d, N.z / s.d, WRAPS.has(s.kind) ? 1 : 0], k * 4);
      const t = TINT[s.kind];
      iT.set([t[0], t[1], t[2], N.y > 0.7 ? 1 : 0], k * 4);
    }
    this.geo.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 4));
    this.geo.setAttribute('iR', new THREE.InstancedBufferAttribute(iR, 4));
    this.geo.setAttribute('iU', new THREE.InstancedBufferAttribute(iU, 4));
    this.geo.setAttribute('iN', new THREE.InstancedBufferAttribute(iN, 4));
    this.geo.setAttribute('iT', new THREE.InstancedBufferAttribute(iT, 4));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** 1 inside a soft-edged blob of radius r round 0, its edge broken by noise. */
function blob(p: V2, r: number, seed: F, rough: number): F {
  const e = fxf(p.mul(2.6).add(seed)).sub(0.5).mul(rough);
  return smoothstep(r, r * 0.55, length(p).add(e));
}

function marksMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.name = 'worldMarks';
  mat.transparent = true;
  mat.depthWrite = false;
  mat.depthTest = true;
  mat.fog = false;
  mat.toneMapped = false;
  // Colour out = colour under times the mark's: it darkens and tints only.
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.ZeroFactor;
  mat.blendDst = THREE.SrcColorFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;

  const vC = vary(attribute<'vec4'>('iC', 'vec4'));
  const vR = vary(attribute<'vec4'>('iR', 'vec4'));
  const vU = vary(attribute<'vec4'>('iU', 'vec4'));
  const vN = vary(attribute<'vec4'>('iN', 'vec4'));
  const vT = vary(attribute<'vec4'>('iT', 'vec4'));

  mat.colorNode = Fn(() => {
    const depth = viewportDepthTexture(screenUV).x;
    const vp = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse);
    const wp = cameraWorldMatrix.mul(vec4(vp, 1.0)).xyz.toVar();
    // The surface's facing, before anything is thrown away.
    const ng = cross(dFdx(wp), dFdy(wp)).normalize().toVar();
    const rel = wp.sub(vC.xyz).toVar();
    const u = dot(rel, vR.xyz).toVar();
    const v = dot(rel, vU.xyz).toVar();
    const w = dot(rel, vN.xyz).toVar();
    Discard(max(max(abs(u), abs(v)), abs(w)).greaterThan(1.0));
    const kind = vC.w;
    const seed = vR.w;
    const p = vec2(u, v).toVar();
    const a = float(0.0).toVar();

    // Moss: blotches thicker toward the foot, speckled at the edge.
    const moss = (): F => {
      const body = fxf(p.mul(vec2(2.4, 2.0)).add(seed)).mul(0.75).add(smoothstep(0.9, -0.7, v).mul(0.45));
      const speck = fxn(p.mul(14.0).add(seed.mul(1.7)));
      return smoothstep(0.5, 0.66, body.add(speck.mul(0.12))).mul(smoothstep(1.0, 0.7, abs(u)));
    };
    // Runs down from the top: thin columns of different lengths.
    const runs = (): F => {
      const x = u.mul(5.5).add(sin(v.mul(6.0).add(seed)).mul(0.12));
      const col = fxn(vec2(x.add(seed), seed.mul(0.31)));
      const len = fxn(vec2(u.mul(3.1).add(seed.mul(2.0)), 7.0)).mul(1.4).add(0.35);
      const t = v.oneMinus().mul(0.5);
      return smoothstep(0.42, 0.68, col).mul(smoothstep(len, len.mul(0.55), t)).mul(smoothstep(1.0, 0.75, abs(u)));
    };
    // A plume rising from the flame at the bottom edge.
    const soot = (): F => {
      const rise = v.add(1.0).mul(0.5);
      const wid = rise.mul(0.6).add(0.22);
      const off = abs(u.add(fxn(vec2(v.mul(2.5), seed)).sub(0.5).mul(0.3)));
      return smoothstep(wid, wid.mul(0.35), off).mul(smoothstep(0.0, 0.18, rise)).mul(smoothstep(1.0, 0.45, rise))
        .mul(fxf(p.mul(3.0).add(seed)).mul(0.5).add(0.6));
    };
    // A splash with droplets; on a wall it runs.
    const blood = (): F => {
      const main = blob(p, 0.55, seed, 0.6);
      const drops = smoothstep(0.8, 0.88, fxn(p.mul(9.0).add(seed))).mul(smoothstep(1.0, 0.5, length(p)));
      const runsDown = vT.w.lessThan(0.5).select(
        smoothstep(0.78, 0.86, fxn(vec2(u.mul(11.0).add(seed), 0.5))).mul(step(v, 0.0)).mul(smoothstep(-0.95, -0.2, v)).mul(smoothstep(0.4, 0.2, abs(u))),
        float(0.0),
      );
      return max(max(main, drops), runsDown);
    };
    const scorch = (): F => blob(p, 0.95, seed, 0.9).mul(fxf(p.mul(5.0).add(seed)).mul(0.4).add(0.7));
    const damp = (): F => blob(p, 0.95, seed, 1.0).mul(0.8);

    a.assign(
      kind.lessThan(0.5).select(moss(),
        kind.lessThan(1.5).select(runs(),
          kind.lessThan(2.5).select(soot(),
            kind.lessThan(3.5).select(blood(),
              kind.lessThan(4.5).select(scorch(),
                kind.lessThan(5.5).select(runs(), damp())))))),
    );

    // Faces turned from the mark's axis take less; wrapping kinds bend round.
    const axis = vN.xyz.normalize();
    const facing = abs(dot(ng, axis));
    const wrap = vN.w;
    const face = smoothstep(mix(0.55, -0.3, wrap), mix(0.85, 0.4, wrap), facing);
    const k = a.mul(face).mul(smoothstep(1.0, 0.6, abs(w))).mul(vU.w).clamp(0.0, 1.0);
    return vec4(mix(vec3(1.0), vT.xyz, k), 1.0);
  })() as V4 as unknown as THREE.Node<'vec4'>;
  return mat;
}

