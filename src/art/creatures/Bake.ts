/**
 * SLAY — baking a sculpt into skinned meshes.
 *
 * Per material: mesh the field (sparse surface nets), simplify to the
 * triangle budget, take normals from the field's gradient, weight every
 * vertex to the bones whose primitives it lies on (softly across joints for
 * flesh, almost rigidly for bone and plate), and paint it: occlusion from
 * the whole body's field, grime toward the floor, mottling, bands, veins
 * that glow, painted regions. Hard parts are appended rigidly to their bone
 * and painted the same way.
 *
 * Output per material: one indexed geometry with position, normal, color
 * (rgb, stored at half value so it can brighten), glow (0..1), skinIndex,
 * skinWeight. Bind pose is the rig's.
 */
import * as THREE from 'three';
import { Field, type Prim } from '../hero/Sdf';
import { meshField, fieldNormals, type Inflate } from '../hero/Mesher';
import { simplify } from '../hero/Decimate';
import { Noise } from '../Noise';
import { CMATS, type CMat, type PaintSpec, type Sculpt, type SculptQuality } from './Sculpt';

const noise = new Noise(0x5c0a7);

export interface Baked {
  mat: CMat;
  geo: THREE.BufferGeometry;
}

/** Content hash of a sculpt: fields, hard parts, paint, quality. */
export function sculptKey(s: Sculpt, q: SculptQuality): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const eatF = (arr: ArrayLike<number>) => {
    const f = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) f[i] = arr[i]!;
    const b = new Uint8Array(f.buffer);
    for (let i = 0; i < b.length; i++) {
      h1 = Math.imul(h1 ^ b[i]!, 0x01000193);
      h2 = Math.imul(h2 ^ b[i]!, 0x5bd1e995) ^ (h2 >>> 15);
    }
  };
  const eatS = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
      h2 = Math.imul(h2 ^ str.charCodeAt(i), 0x5bd1e995) ^ (h2 >>> 15);
    }
  };
  for (const m of CMATS) {
    const f = s.fields[m];
    if (f.prims.length) eatS(new Field(f.prims).hash());
    eatS(m);
  }
  for (const p of s.parts) {
    eatS(`${p.bone}|${p.mat}|${p.col ?? ''}|${p.glow ?? ''}|${p.pull ? `${p.pull.bone}${p.pull.near.toArray().join()}${p.pull.r}` : ''}`);
    eatF(p.geo.getAttribute('position').array as Float32Array);
  }
  for (const r of s.regions) eatF([r.c.x, r.c.y, r.c.z, r.r, ...(r.col ?? [9, 9, 9]), r.glow ?? -1, (r.mats ?? []).length]);
  eatS(JSON.stringify([s.paint, s.soft, s.lumps, q, s.rig.order.length, s.rig.kind]));
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

function lumpInflate(l: { amp: number; scale: number } | undefined): Inflate {
  if (!l) return 0;
  return (x, y, z) => l.amp * noise.fbm3(x * l.scale, y * l.scale, z * l.scale, 3);
}

/** Bone weights from the field's per-group distances: soft across joints, top four. */
function weigh(field: Field, pos: Float32Array, groups: number, soft: number): { index: Uint16Array; weight: Float32Array } {
  const n = pos.length / 3;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const gd = new Float32Array(groups);
  const wbuf = new Float32Array(groups);
  for (let v = 0; v < n; v++) {
    field.groups(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!, gd);
    let dmin = Infinity;
    for (let g = 0; g < groups; g++) if (gd[g]! < dmin) dmin = gd[g]!;
    for (let g = 0; g < groups; g++) {
      const e = (gd[g]! - dmin) / soft;
      wbuf[g] = e > 3 ? 0 : Math.exp(-e * e);
    }
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      let bi = 0;
      let bw = -1;
      for (let g = 0; g < groups; g++)
        if (wbuf[g]! > bw) {
          bw = wbuf[g]!;
          bi = g;
        }
      index[v * 4 + k] = bi;
      weight[v * 4 + k] = Math.max(0, bw);
      sum += Math.max(0, bw);
      wbuf[bi] = -1;
    }
    if (sum <= 0) {
      weight[v * 4] = 1;
      sum = 1;
    }
    for (let k = 0; k < 4; k++) weight[v * 4 + k]! /= sum;
  }
  return { index, weight };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Vertex colour (rgb, full value) and glow for every vertex. */
function paint(
  s: Sculpt,
  mat: CMat,
  all: Field | null,
  pos: Float32Array,
  nor: Float32Array,
  spec: PaintSpec,
  partCol: [number, number, number] | undefined,
  partGlow: number | undefined,
): { col: Float32Array; glow: Float32Array } {
  const n = pos.length / 3;
  const col = new Float32Array(n * 3);
  const glow = new Float32Array(n);
  const H = Math.max(0.3, s.rig.height);
  const aoK = spec.ao ?? 0.8;
  const base = spec.base ?? [1, 1, 1];
  const regs = s.regions.filter((r) => !r.mats || r.mats.includes(mat));
  // Occlusion probes scale with the body.
  const pr = [0.012 * H, 0.03 * H, 0.07 * H];
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3]!;
    const y = pos[v * 3 + 1]!;
    const z = pos[v * 3 + 2]!;
    const nx = nor[v * 3]!;
    const ny = nor[v * 3 + 1]!;
    const nz = nor[v * 3 + 2]!;
    let r = base[0];
    let g = base[1];
    let b = base[2];
    if (partCol) {
      r *= partCol[0];
      g *= partCol[1];
      b *= partCol[2];
    }
    let gl = partGlow ?? 0;
    if (all) {
      let occ = 0;
      const wts = [0.5, 0.3, 0.2];
      for (let i = 0; i < 3; i++) {
        const d = pr[i]!;
        const f = all.eval(x + nx * d, y + ny * d, z + nz * d);
        occ += wts[i]! * clamp01((d - f) / d);
      }
      const ao = 1 - aoK * Math.min(1, occ * 1.3);
      r *= ao;
      g *= ao;
      b *= ao;
    }
    if (spec.grime) {
      const f = 1 - clamp01(y / (H * 0.55));
      const k = 1 - spec.grime * 0.55 * f * f;
      r *= k;
      g *= k;
      b *= k * 0.97;
    }
    if (spec.mottle) {
      const m = spec.mottle;
      const t = sstep(-0.05, 0.45, noise.fbm3(x * m.scale + 11.3, y * m.scale, z * m.scale - 4.1, 3)) * m.amount;
      r += (r * m.col[0] - r) * t;
      g += (g * m.col[1] - g) * t;
      b += (b * m.col[2] - b) * t;
    }
    if (spec.top && ny > 0) {
      const t = ny * ny * spec.top.amount;
      r += (spec.top.col[0] - r) * t;
      g += (spec.top.col[1] - g) * t;
      b += (spec.top.col[2] - b) * t;
    }
    if (spec.bands) {
      const c = spec.bands.axis === 'y' ? y : z;
      const w = 0.5 + 0.5 * Math.cos((c / spec.bands.period) * Math.PI * 2);
      const k = 1 - spec.bands.amount * Math.pow(w, 6);
      r *= k;
      g *= k;
      b *= k;
    }
    if (spec.veins) {
      const vv = spec.veins;
      // A vein thinner than the mesh's vertex spacing aliases into blotches
      // (camouflage, not cracks). Where it would, the network is drawn
      // coarser (up to about twice the cell) and its lines a little wider,
      // so each crack spans a couple of vertices; the fine second octave
      // drops out, and the glow dims to keep the overall heat.
      const band = 1 - vv.cut;
      const sp = 0.018 * H;
      const sc = Math.max(vv.scale * 0.45, Math.min(vv.scale, band / (sp * 1.3)));
      const b1 = Math.max(band, sp * sc * 1.3);
      const b2 = Math.max(band, sp * sc * 2.1 * 1.3);
      const w2 = clamp01((band / b2 - 0.4) / 0.6);
      const ridge = 1 - Math.abs(noise.simplex3(x * sc, y * sc + 3.7, z * sc));
      const ridge2 = w2 > 0 ? 1 - Math.abs(noise.simplex3(x * sc * 2.1 + 5, y * sc * 2.1, z * sc * 2.1 - 2)) : 0;
      const t = Math.max(sstep(1 - b1, 1, ridge), sstep(1 - b2, 1, ridge2) * 0.96 * w2);
      if (t > 0) {
        gl = Math.max(gl, t * vv.glow * Math.sqrt(band / b1));
        if (vv.col) {
          r += (vv.col[0] - r) * t;
          g += (vv.col[1] - g) * t;
          b += (vv.col[2] - b) * t;
        }
      }
    }
    for (const rg of regs) {
      const dx = x - rg.c.x;
      const dy = y - rg.c.y;
      const dz = z - rg.c.z;
      const k = Math.exp(-(dx * dx + dy * dy + dz * dz) / (rg.r * rg.r));
      if (k < 0.01) continue;
      if (rg.col) {
        r *= 1 + (rg.col[0] - 1) * k;
        g *= 1 + (rg.col[1] - 1) * k;
        b *= 1 + (rg.col[2] - 1) * k;
      }
      if (rg.glow) gl = Math.max(gl, rg.glow * Math.min(1, k * 1.6));
    }
    col[v * 3] = r;
    col[v * 3 + 1] = g;
    col[v * 3 + 2] = b;
    glow[v] = clamp01(gl);
  }
  return { col, glow };
}

/** Paint at half value in rgb, glow in alpha: four bytes a vertex, the smallest vertex format the GPU reads without padding. */
function packPaint(col: Float32Array, glow: Float32Array): THREE.BufferAttribute {
  const c8 = new Uint8Array(glow.length * 4);
  for (let v = 0; v < glow.length; v++) {
    for (let k = 0; k < 3; k++) c8[v * 4 + k] = Math.round(clamp01(col[v * 3 + k]! * 0.5) * 255);
    c8[v * 4 + 3] = Math.round(clamp01(glow[v]!) * 255);
  }
  return new THREE.BufferAttribute(c8, 4, true);
}

const SHEET_AO = 0.86;

/** A cloth sheet's paint (`Sculpt.cloths`), as a hard part of its material is painted. */
export function paintSheet(s: Sculpt, mat: CMat, geo: THREE.BufferGeometry, col?: [number, number, number]): void {
  const pos = geo.getAttribute('position').array as Float32Array;
  const nor = geo.getAttribute('normal').array as Float32Array;
  // No occlusion probes (the sheet moves off the body): a flat share of it instead.
  const c = col ?? [1, 1, 1];
  const pc = paint(s, mat, null, pos, nor, { ...s.paint[mat], veins: undefined, mottle: undefined }, [c[0] * SHEET_AO, c[1] * SHEET_AO, c[2] * SHEET_AO], undefined);
  geo.setAttribute('color', packPaint(pc.col, pc.glow));
}

function finish(pos: Float32Array, nor: Float32Array, idx: Uint32Array, col: Float32Array, glow: Float32Array, si: Uint16Array, sw: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', packPaint(col, glow));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function concat(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (list.length === 1) return list[0]!;
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.getAttribute('position').count;
    ni += g.getIndex()!.count;
  }
  const out = new THREE.BufferGeometry();
  const names: Array<[string, number, boolean, 'f' | 'u8' | 'u16']> = [
    ['position', 3, false, 'f'],
    ['normal', 3, false, 'f'],
    ['color', 4, true, 'u8'],
    ['skinIndex', 4, false, 'u16'],
    ['skinWeight', 4, false, 'f'],
  ];
  for (const [name, size, norm, kind] of names) {
    const arr = kind === 'f' ? new Float32Array(nv * size) : kind === 'u8' ? new Uint8Array(nv * size) : new Uint16Array(nv * size);
    let o = 0;
    for (const g of list) {
      const a = g.getAttribute(name).array as ArrayLike<number>;
      (arr as Float32Array).set(a as Float32Array, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, norm));
  }
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const ix = g.getIndex()!.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i]! + vo;
    vo += g.getAttribute('position').count;
    io += ix.length;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const g of list) g.dispose();
  return out;
}

export interface BakeTimes {
  mesh: number;
  simplify: number;
  rest: number;
}

/** Bakes every material of a sculpt. Materials with nothing in them are left out. */
export function bakeSculpt(s: Sculpt, q: SculptQuality, times?: BakeTimes): Baked[] {
  const groups = s.rig.order.length;
  const allPrims: Prim[] = [];
  for (const m of CMATS) for (const p of s.fields[m].prims) if (!p.sub) allPrims.push(p);
  const all = allPrims.length ? new Field(allPrims) : null;
  const out: Baked[] = [];
  for (const m of CMATS) {
    const prims = s.fields[m].prims;
    const parts = s.parts.filter((p) => p.mat === m);
    if (!prims.length && !parts.length) continue;
    const pieces: THREE.BufferGeometry[] = [];
    if (prims.length) {
      const field = new Field(prims);
      const inflate = lumpInflate(s.lumps[m]);
      const t0 = performance.now();
      const raw = meshField(field, { cell: q.cell, inflate, project: 2 });
      const t1 = performance.now();
      if (raw.index.length >= 3) {
        const sm = simplify(raw.pos, raw.index, q.tris[m]);
        const t2 = performance.now();
        const pos = Float32Array.from(sm.pos);
        const nor = fieldNormals(field, pos, q.cell * 0.35, [], inflate);
        const w = weigh(field, pos, groups, s.soft[m]);
        const pc = paint(s, m, all, pos, nor, s.paint[m], undefined, undefined);
        pieces.push(finish(pos, nor, Uint32Array.from(sm.index), pc.col, pc.glow, w.index, w.weight));
        if (times) {
          times.mesh += t1 - t0;
          times.simplify += t2 - t1;
          times.rest += performance.now() - t2;
        }
      }
    }
    for (const part of parts) {
      let g = part.geo;
      if (!g.getIndex()) {
        const n = g.getAttribute('position').count;
        g.setIndex(Array.from({ length: n }, (_, i) => i));
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const pos = Float32Array.from(g.getAttribute('position').array as Float32Array);
      const nor = Float32Array.from(g.getAttribute('normal').array as Float32Array);
      const idx = Uint32Array.from(g.getIndex()!.array as ArrayLike<number>);
      const nv = pos.length / 3;
      const si = new Uint16Array(nv * 4);
      const sw = new Float32Array(nv * 4);
      const bi = s.group(part.bone);
      const pull = part.pull;
      const pb = pull ? s.group(pull.bone) : bi;
      for (let i = 0; i < nv; i++) {
        const near = pull && (pos[i * 3]! - pull.near.x) ** 2 + (pos[i * 3 + 1]! - pull.near.y) ** 2 + (pos[i * 3 + 2]! - pull.near.z) ** 2 < pull.r * pull.r;
        si[i * 4] = near ? pb : bi;
        sw[i * 4] = 1;
      }
      const pc = paint(s, m, all, pos, nor, { ...s.paint[m], veins: undefined, mottle: undefined }, part.col, part.glow);
      pieces.push(finish(pos, nor, idx, pc.col, pc.glow, si, sw));
      g.dispose();
      g = null as unknown as THREE.BufferGeometry;
    }
    if (pieces.length) {
      const geo = concat(pieces);
      geo.computeBoundingSphere();
      out.push({ mat: m, geo });
    }
  }
  return out;
}
