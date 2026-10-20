/**
 * A small BC7 encoder (and the decoder that checks it), for packing the
 * game's textures (`tools/pack-textures.mjs`).
 *
 * Each 4x4 block is tried in three of BC7's eight modes and the closest is
 * kept:
 *
 *  - mode 6: one RGBA line, 7-bit endpoints with a shared low bit each, and
 *    16 steps along it. Best where all four channels move together.
 *  - modes 5 and 4: a line of three channels and a separate line for the
 *    fourth, any of the four. Best where one channel is its own map (the game
 *    keeps height in the albedo's alpha and roughness in the normal map's),
 *    and for a normal map's two slopes. Mode 5 has 7- and 8-bit endpoints and
 *    4 steps a line; mode 4 has 5- and 6-bit endpoints and 8 steps on one
 *    line, 4 on the other.
 *
 * Endpoints start on the block's main axis (power iteration on the
 * covariance), are refined by least squares on the chosen steps, and the low
 * bits are searched. Plain squared error, every channel weighted the same.
 */

const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const W2 = [0, 21, 43, 64];

const lerp = (a, b, w) => ((64 - w) * a + w * b + 32) >> 6;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Writes bits into a 16-byte block, low bit first. */
class Bits {
  constructor(out, at) {
    this.out = out;
    this.at = at;
    this.pos = 0;
  }
  put(value, n) {
    for (let i = 0; i < n; i++, this.pos++) {
      if ((value >> i) & 1) this.out[this.at + (this.pos >> 3)] |= 1 << (this.pos & 7);
    }
  }
}

/** Reads bits from a 16-byte block, low bit first. */
class Reader {
  constructor(src, at) {
    this.src = src;
    this.at = at;
    this.pos = 0;
  }
  get(n) {
    let v = 0;
    for (let i = 0; i < n; i++, this.pos++) v |= ((this.src[this.at + (this.pos >> 3)] >> (this.pos & 7)) & 1) << i;
    return v;
  }
}

// --- line fitting -------------------------------------------------------------
//
// One block at a time, in buffers kept between blocks: an encoder that made
// arrays per block spent most of its time making them.

const mean = new Float64Array(4);
const axis = new Float64Array(4);
const next = new Float64Array(4);
const cov = new Float64Array(16);
const lo = new Float64Array(4);
const hi = new Float64Array(4);
const pal = new Int32Array(64);
const steps = new Uint8Array(16);
const xa = new Float64Array(4);
const xb = new Float64Array(4);

/**
 * Fits a line through channels `c0..c0+n-1` of the 16 points in `px`: the
 * ends of their spread along the main axis, into `lo` and `hi` (0..255).
 */
function fitAxis(px, c0, n) {
  mean.fill(0);
  for (let i = 0; i < 16; i++) for (let c = 0; c < n; c++) mean[c] += px[i * 4 + c0 + c];
  for (let c = 0; c < n; c++) mean[c] /= 16;
  cov.fill(0);
  for (let i = 0; i < 16; i++) {
    for (let a = 0; a < n; a++) {
      const da = px[i * 4 + c0 + a] - mean[a];
      for (let b = a; b < n; b++) cov[a * 4 + b] += da * (px[i * 4 + c0 + b] - mean[b]);
    }
  }
  for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) cov[a * 4 + b] = cov[b * 4 + a];
  // Power iteration from the widest channel.
  axis.fill(0);
  let wide = 0;
  for (let c = 1; c < n; c++) if (cov[c * 5] > cov[wide * 5]) wide = c;
  axis[wide] = 1;
  for (let it = 0; it < 6; it++) {
    let len = 0;
    for (let a = 0; a < n; a++) {
      let v = 0;
      for (let b = 0; b < n; b++) v += cov[a * 4 + b] * axis[b];
      next[a] = v;
      len += v * v;
    }
    if (len < 1e-12) break;
    len = 1 / Math.sqrt(len);
    for (let c = 0; c < n; c++) axis[c] = next[c] * len;
  }
  let tlo = Infinity;
  let thi = -Infinity;
  for (let i = 0; i < 16; i++) {
    let t = 0;
    for (let c = 0; c < n; c++) t += (px[i * 4 + c0 + c] - mean[c]) * axis[c];
    if (t < tlo) tlo = t;
    if (t > thi) thi = t;
  }
  for (let c = 0; c < n; c++) {
    lo[c] = clamp(mean[c] + tlo * axis[c], 0, 255);
    hi[c] = clamp(mean[c] + thi * axis[c], 0, 255);
  }
}

/**
 * Best step per point for decoded endpoints `a`, `b` over channels
 * `c0..c0+n-1` and weights `w`. Fills `steps`, returns the squared error.
 * Each point is projected onto the line for a first guess, then the steps
 * either side are tried.
 */
function pickSteps(px, c0, n, a, b, w) {
  const k = w.length;
  for (let s = 0; s < k; s++) for (let c = 0; c < n; c++) pal[s * 4 + c] = lerp(a[c], b[c], w[s]);
  let dd = 0;
  for (let c = 0; c < n; c++) dd += (b[c] - a[c]) * (b[c] - a[c]);
  let err = 0;
  for (let i = 0; i < 16; i++) {
    let guess = 0;
    if (dd > 0) {
      let t = 0;
      for (let c = 0; c < n; c++) t += (px[i * 4 + c0 + c] - a[c]) * (b[c] - a[c]);
      const wt = clamp((t / dd) * 64, 0, 64);
      while (guess < k - 1 && w[guess + 1] <= wt) guess++;
    }
    let bestE = Infinity;
    let bestS = 0;
    const from = guess > 0 ? guess - 1 : 0;
    const to = guess + 2 < k ? guess + 2 : k - 1;
    for (let s = from; s <= to; s++) {
      let e = 0;
      for (let c = 0; c < n; c++) {
        const d = px[i * 4 + c0 + c] - pal[s * 4 + c];
        e += d * d;
      }
      if (e < bestE) ((bestE = e), (bestS = s));
    }
    steps[i] = bestS;
    err += bestE;
  }
  return err;
}

/** Least-squares endpoints for the steps in `steps`, into `lo` and `hi`. False when there is no line to fit. */
function refine(px, c0, n, w) {
  let aa = 0;
  let ab = 0;
  let bb = 0;
  xa.fill(0);
  xb.fill(0);
  for (let i = 0; i < 16; i++) {
    const t = w[steps[i]] / 64;
    const s = 1 - t;
    aa += s * s;
    ab += s * t;
    bb += t * t;
    for (let c = 0; c < n; c++) {
      const v = px[i * 4 + c0 + c];
      xa[c] += s * v;
      xb[c] += t * v;
    }
  }
  const det = aa * bb - ab * ab;
  if (Math.abs(det) < 1e-9) return false;
  for (let c = 0; c < n; c++) {
    lo[c] = clamp((bb * xa[c] - ab * xb[c]) / det, 0, 255);
    hi[c] = clamp((aa * xb[c] - ab * xa[c]) / det, 0, 255);
  }
  return true;
}

// --- mode 6 -------------------------------------------------------------------

/** 7-bit endpoint with low bit `p`, closest to `v` (0..255). */
const q7p = (v, p) => clamp(Math.round((v - p) / 2), 0, 127);

const m6 = { err: 0, c0: new Int32Array(4), c1: new Int32Array(4), p0: 0, p1: 0, idx: new Uint8Array(16) };
const ea = new Int32Array(4);
const eb = new Int32Array(4);

/** Tries mode 6 on the block in `px`; the best is left in `m6`. */
function mode6(px) {
  fitAxis(px, 0, 4);
  m6.err = Infinity;
  for (let round = 0; round < 2; round++) {
    for (let p0 = 0; p0 < 2; p0++) {
      for (let p1 = 0; p1 < 2; p1++) {
        for (let c = 0; c < 4; c++) {
          ea[c] = (q7p(lo[c], p0) << 1) | p0;
          eb[c] = (q7p(hi[c], p1) << 1) | p1;
        }
        const err = pickSteps(px, 0, 4, ea, eb, W4);
        if (err < m6.err) {
          m6.err = err;
          for (let c = 0; c < 4; c++) ((m6.c0[c] = ea[c] >> 1), (m6.c1[c] = eb[c] >> 1));
          m6.p0 = p0;
          m6.p1 = p1;
          m6.idx.set(steps);
        }
      }
    }
    if (m6.err === 0) break;
    steps.set(m6.idx);
    if (!refine(px, 0, 4, W4)) break;
  }
}

function writeMode6(out, at, m) {
  let { c0, c1, p0, p1 } = m;
  let idx = m.idx;
  // The first step's top bit is implied 0: swap the ends if it is not.
  if (idx[0] >= 8) {
    [c0, c1, p0, p1] = [c1, c0, p1, p0];
    idx = idx.map((i) => 15 - i);
  }
  const w = new Bits(out, at);
  w.put(1 << 6, 7);
  for (let c = 0; c < 4; c++) {
    w.put(c0[c], 7);
    w.put(c1[c], 7);
  }
  w.put(p0, 1);
  w.put(p1, 1);
  w.put(idx[0], 3);
  for (let i = 1; i < 16; i++) w.put(idx[i], 4);
}

// --- modes 4 and 5 ------------------------------------------------------------
//
// Both split the block into a line of three channels and a line of its own
// for the fourth, which can be any of the four (the rotation): mode 5 with
// finer endpoints and 4 steps on each line, mode 4 with coarser endpoints and
// 8 steps on one of the two. A normal map's two slopes, or a scan's colour
// and height, are rarely one line together; most hard blocks land here.

const W3 = [0, 9, 18, 27, 37, 46, 55, 64];

/** An endpoint of `bits` bits widened to 8, as the decoder does. */
const widen = (c, bits) => (bits === 8 ? c : (c << (8 - bits)) | (c >> (2 * bits - 8)));

/** The `bits`-bit endpoint whose widening is closest to `v`. */
function quantize(v, bits) {
  if (bits === 8) return clamp(Math.round(v), 0, 255);
  const top = (1 << bits) - 1;
  const c = clamp(Math.round((v * top) / 255), 0, top);
  let bestC = c;
  let bestE = Math.abs(widen(c, bits) - v);
  for (let k = c - 1; k <= c + 1; k += 2) {
    if (k < 0 || k > top) continue;
    const e = Math.abs(widen(k, bits) - v);
    if (e < bestE) ((bestE = e), (bestC = k));
  }
  return bestC;
}

const line = (n) => ({ err: 0, c0: new Int32Array(n), c1: new Int32Array(n), idx: new Uint8Array(16) });
const copyLine = (to, from) => {
  to.err = from.err;
  to.c0.set(from.c0);
  to.c1.set(from.c1);
  to.idx.set(from.idx);
};
const wa = new Int32Array(4);
const wb = new Int32Array(4);

/** Fits `n` channels from `c0` with `bits`-bit endpoints and steps `w` into `into`. */
function fitLine(px, c0, n, into, bits, w) {
  fitAxis(px, c0, n);
  into.err = Infinity;
  for (let round = 0; round < 2; round++) {
    for (let c = 0; c < n; c++) {
      ea[c] = quantize(lo[c], bits);
      eb[c] = quantize(hi[c], bits);
      wa[c] = widen(ea[c], bits);
      wb[c] = widen(eb[c], bits);
    }
    const err = pickSteps(px, c0, n, wa, wb, w);
    if (err < into.err) {
      into.err = err;
      for (let c = 0; c < n; c++) ((into.c0[c] = ea[c]), (into.c1[c] = eb[c]));
      into.idx.set(steps);
    }
    if (into.err === 0) break;
    steps.set(into.idx);
    if (!refine(px, c0, n, w)) break;
  }
}

/** Endpoint bits and step tables (one pair per index choice) of the two modes. */
const SPLIT = {
  4: { cb: 5, ab: 6, steps: [[W2, W3], [W3, W2]] },
  5: { cb: 7, ab: 8, steps: [[W2, W2]] },
};
const m4 = { err: 0, rot: 0, idxMode: 0, color: line(3), alpha: line(1) };
const m5 = { err: 0, rot: 0, idxMode: 0, color: line(3), alpha: line(1) };
const trial = { color: line(3), alpha: line(1) };
const rotated = new Int32Array(64);

/** Tries mode `mode` (4 or 5) on the block in `px`, each rotation and index choice; the best is left in `into`. */
function split(px, mode, into) {
  const { cb, ab, steps: choices } = SPLIT[mode];
  into.err = Infinity;
  for (let rot = 0; rot < 4; rot++) {
    let src = px;
    if (rot) {
      // Channel `rot - 1` takes alpha's place; the decoder swaps them back.
      rotated.set(px);
      for (let i = 0; i < 16; i++) {
        rotated[i * 4 + rot - 1] = px[i * 4 + 3];
        rotated[i * 4 + 3] = px[i * 4 + rot - 1];
      }
      src = rotated;
    }
    for (let idxMode = 0; idxMode < choices.length; idxMode++) {
      const [cw, aw] = choices[idxMode];
      fitLine(src, 0, 3, trial.color, cb, cw);
      fitLine(src, 3, 1, trial.alpha, ab, aw);
      const err = trial.color.err + trial.alpha.err;
      if (err < into.err) {
        into.err = err;
        into.rot = rot;
        into.idxMode = idxMode;
        copyLine(into.color, trial.color);
        copyLine(into.alpha, trial.alpha);
      }
    }
  }
}

/** A line with its ends swapped where needed, so its first step's top bit is 0. */
function anchored(l, count) {
  if (l.idx[0] < count / 2) return l;
  return { c0: l.c1, c1: l.c0, idx: l.idx.map((i) => count - 1 - i) };
}

function writeSplit(out, at, mode, m) {
  const { cb, ab, steps: choices } = SPLIT[mode];
  const [cw, aw] = choices[m.idxMode];
  const col = anchored(m.color, cw.length);
  const alp = anchored(m.alpha, aw.length);
  const w = new Bits(out, at);
  w.put(1 << mode, mode + 1);
  w.put(m.rot, 2);
  if (mode === 4) w.put(m.idxMode, 1);
  for (let c = 0; c < 3; c++) {
    w.put(col.c0[c], cb);
    w.put(col.c1[c], cb);
  }
  w.put(alp.c0[0], ab);
  w.put(alp.c1[0], ab);
  // Mode 4 keeps its 2-bit steps first, whichever line has them.
  const sets = mode === 4 && m.idxMode ? [[alp, aw], [col, cw]] : [[col, cw], [alp, aw]];
  for (const [l, table] of sets) {
    const bits = Math.log2(table.length);
    w.put(l.idx[0], bits - 1);
    for (let i = 1; i < 16; i++) w.put(l.idx[i], bits);
  }
}

// --- images -------------------------------------------------------------------

/**
 * Encodes `rgba` (`width` x `height`, 8 bits a channel, rows packed) into
 * BC7 blocks. Sizes that are not a multiple of 4 repeat their last row and
 * column. Returns the blocks and the squared error over all pixels.
 */
export function encodeBC7(rgba, width, height) {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const out = new Uint8Array(bw * bh * 16);
  const px = new Int32Array(64);
  let total = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 4; y++) {
        const sy = Math.min(height - 1, by * 4 + y);
        for (let x = 0; x < 4; x++) {
          const sx = Math.min(width - 1, bx * 4 + x);
          const s = (sy * width + sx) * 4;
          const d = (y * 4 + x) * 4;
          px[d] = rgba[s];
          px[d + 1] = rgba[s + 1];
          px[d + 2] = rgba[s + 2];
          px[d + 3] = rgba[s + 3];
        }
      }
      const at = (by * bw + bx) * 16;
      mode6(px);
      let best = m6.err;
      let pick = 6;
      if (best > 0) {
        split(px, 5, m5);
        if (m5.err < best) ((best = m5.err), (pick = 5));
        split(px, 4, m4);
        if (m4.err < best) ((best = m4.err), (pick = 4));
      }
      if (pick === 6) writeMode6(out, at, m6);
      else writeSplit(out, at, pick, pick === 5 ? m5 : m4);
      total += best;
    }
  }
  return { blocks: out, error: total };
}

/** Decodes BC7 blocks written by `encodeBC7` (modes 4, 5 and 6) back to RGBA. */
export function decodeBC7(blocks, width, height) {
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const out = new Uint8Array(width * height * 4);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const r = new Reader(blocks, (by * bw + bx) * 16);
      let mode = 0;
      while (mode < 8 && r.get(1) === 0) mode++;
      const pal = [];
      const put = (i, rgba) => {
        const x = bx * 4 + (i & 3);
        const y = by * 4 + (i >> 2);
        if (x < width && y < height) out.set(rgba, (y * width + x) * 4);
      };
      if (mode === 6) {
        const e = [[], []];
        for (let c = 0; c < 4; c++) {
          e[0][c] = r.get(7);
          e[1][c] = r.get(7);
        }
        const p0 = r.get(1);
        const p1 = r.get(1);
        const a = e[0].map((c) => (c << 1) | p0);
        const b = e[1].map((c) => (c << 1) | p1);
        for (let s = 0; s < 16; s++) pal.push(a.map((v, c) => lerp(v, b[c], W4[s])));
        for (let i = 0; i < 16; i++) put(i, pal[r.get(i === 0 ? 3 : 4)]);
      } else if (mode === 4 || mode === 5) {
        const { cb, ab, steps: choices } = SPLIT[mode];
        const rot = r.get(2);
        const [cw, aw] = choices[mode === 4 ? r.get(1) : 0];
        const e = [[], []];
        for (let c = 0; c < 3; c++) {
          e[0][c] = widen(r.get(cb), cb);
          e[1][c] = widen(r.get(cb), cb);
        }
        const a0 = widen(r.get(ab), ab);
        const a1 = widen(r.get(ab), ab);
        const readSet = (bits) => Array.from({ length: 16 }, (_, i) => r.get(i === 0 ? bits - 1 : bits));
        // Mode 4 keeps its 2-bit steps first, whichever line has them.
        const swapped = mode === 4 && cw.length === 8;
        const first = readSet(Math.log2((swapped ? aw : cw).length));
        const second = readSet(Math.log2((swapped ? cw : aw).length));
        const ci = swapped ? second : first;
        const ai = swapped ? first : second;
        for (let i = 0; i < 16; i++) {
          const px = [0, 1, 2].map((c) => lerp(e[0][c], e[1][c], cw[ci[i]]));
          px.push(lerp(a0, a1, aw[ai[i]]));
          if (rot) [px[rot - 1], px[3]] = [px[3], px[rot - 1]];
          put(i, px);
        }
      } else {
        throw new Error(`BC7 mode ${mode} is not one this encoder writes`);
      }
    }
  }
  return out;
}
