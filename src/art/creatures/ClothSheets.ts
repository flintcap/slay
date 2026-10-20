/**
 * SLAY — the capes and banners a boss wears as cloth.
 *
 * Each helper lays a sheet's rest shape in the bind pose (character space,
 * like every other part), says which points are held and how far the rest
 * may swing, and names what the cloth falls against: the back, the legs, the
 * head, a banner's pole. The sculpt keeps the sheets (`Sculpt.cloths`); each
 * spawn wears them as cloth that moves (`CreatureCloth.ts`).
 */
import * as THREE from 'three';
import type { ClothBody, CMat, RGB, Sculpt } from './Sculpt';

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A grid's triangles and turns: `at(c, r)` is the point in column c, row r. */
function sheetGeo(cols: number, rows: number, at: (c: number, r: number) => THREE.Vector3): THREE.BufferGeometry {
  const pos = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) at(c, r).toArray(pos, (r * cols + c) * 3);
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      idx.push(a, b, d, b, d + 1, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A capsule between two bind points, each riding its bone; null when the rig lacks either bone. */
function body(s: Sculpt, a: string, at: THREE.Vector3, b: string, bt: THREE.Vector3, r: number): ClothBody | null {
  return s.has(a) && s.has(b) ? { a, at: at.clone(), b, bt: bt.clone(), r } : null;
}

/** The back from the hips to the shoulders, and the head. */
function torso(s: Sculpt, H: number, head: boolean): Array<ClothBody | null> {
  const hp = s.j('hips');
  const ch = s.j('chest');
  return [
    body(s, 'hips', hp.clone().add(V(0, 0.02 * H, 0)), 'chest', lerp(hp, ch, 0.5), 0.085 * H),
    body(s, 'chest', ch.clone().add(V(0, -0.04 * H, 0)), 'chest', ch.clone().add(V(0, 0.06 * H, 0)), 0.062 * H),
    head ? body(s, 'head', s.j('head'), 'head', s.j('head').add(V(0, 0.06 * H, 0)), 0.075 * H) : null,
  ];
}

const lerp = (a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 => a.clone().lerp(b, t);

const CAPE_COLS = 11;
const CAPE_ROWS = 15;
/** How far a cape's hem may swing from where it hangs at rest, a share of its length. */
const CAPE_REACH = 0.72;

/**
 * A cape from the shoulders (`top`) past the seat (`mid`) to the hem (`bot`),
 * `w` half-wide at the shoulders and a third wider at the hem. Its top row is
 * held by the chest. `torn` hangs ragged tongues off the hem.
 */
export function capeCloth(s: Sculpt, o: { top: THREE.Vector3; mid: THREE.Vector3; bot: THREE.Vector3; w: number; mat: CMat; torn: number; rand: () => number }): void {
  const H = s.rig.height;
  const C = CAPE_COLS;
  const R = CAPE_ROWS;
  const l1 = o.top.distanceTo(o.mid);
  const l2 = o.mid.distanceTo(o.bot);
  const len = l1 + l2;
  const fall = o.bot.clone().sub(o.mid).normalize();
  const tongue = Array.from({ length: C }, (_, c) => o.torn * H * (c % 2 ? 0.03 + o.rand() * 0.07 : o.rand() * 0.03));
  // A point `d` down the cape's middle: shoulders to seat to hem, then on past it.
  const down = (d: number): THREE.Vector3 =>
    d <= l1 ? lerp(o.top, o.mid, d / l1) : d <= len ? lerp(o.mid, o.bot, (d - l1) / l2) : o.bot.clone().addScaledVector(fall, d - len);
  const geo = sheetGeo(C, R, (c, r) => {
    const t = r / (R - 1);
    const u = (c / (C - 1)) * 2 - 1;
    const p = down(t * len + tongue[c]! * t ** 4);
    // Wider at the hem, and its edges come forward round the shoulders.
    p.x += u * o.w * (0.9 + 0.35 * t);
    p.z += 0.035 * H * u * u * (1 - 0.7 * t);
    return p;
  });
  const n = C * R;
  const pin = new Float32Array(n);
  const reach = new Float32Array(n);
  for (let r = 0; r < R; r++) {
    const t = r / (R - 1);
    for (let c = 0; c < C; c++) {
      const u = (c / (C - 1)) * 2 - 1;
      pin[r * C + c] = r === 0 ? 1 : 0;
      // The edges flap a little further than the middle.
      reach[r * C + c] = (len + tongue[c]!) * CAPE_REACH * t ** 1.4 * (1 + 0.15 * Math.abs(u));
    }
  }
  const legs = (['L', 'R'] as const).flatMap((side) => {
    const hip = `leg${side}`;
    const knee = `shin${side}`;
    const ankle = s.has(`hock${side}`) ? `hock${side}` : `foot${side}`;
    return [body(s, hip, s.j(hip), hip, s.j(knee), 0.05 * H), body(s, knee, s.j(knee), knee, s.j(ankle), 0.04 * H)];
  });
  s.cloths.push({
    bone: 'chest',
    feel: 'cape',
    mat: o.mat,
    cols: C,
    rows: R,
    geo,
    pin,
    reach,
    bodies: [...torso(s, H, false), ...legs].filter((b): b is ClothBody => !!b),
  });
}

/**
 * A flag along a pole: its first column held on the pole from `root` down
 * along `down`, flying out along `out`. `torn` frays the fly end.
 */
export function poleBanner(
  s: Sculpt,
  o: { bone: string; root: THREE.Vector3; down: THREE.Vector3; out: THREE.Vector3; w: number; h: number; mat: CMat; col?: RGB; torn: number; rand: () => number; pole: [THREE.Vector3, THREE.Vector3, number] },
): void {
  const H = s.rig.height;
  const C = 7;
  const R = 9;
  const fray = Array.from({ length: R }, () => o.torn * o.rand() * 0.3 * o.w);
  const geo = sheetGeo(C, R, (c, r) => {
    const f = c / (C - 1);
    return o.root.clone().addScaledVector(o.out, o.w * f - fray[r]! * f ** 3).addScaledVector(o.down, (o.h * r) / (R - 1));
  });
  const n = C * R;
  const pin = new Float32Array(n);
  const reach = new Float32Array(n);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      pin[r * C + c] = c === 0 ? 1 : 0;
      // The top edge holds out from the pole; lower down it droops further.
      reach[r * C + c] = ((o.w * c) / (C - 1)) * (0.3 + (0.6 * r) / (R - 1));
    }
  }
  s.cloths.push({
    bone: o.bone,
    feel: 'banner',
    mat: o.mat,
    col: o.col,
    cols: C,
    rows: R,
    geo,
    pin,
    reach,
    bodies: [body(s, o.bone, o.pole[0], o.bone, o.pole[1], o.pole[2]), ...torso(s, H, true)].filter((b): b is ClothBody => !!b),
  });
}

/**
 * A banner hung from a crossbar: its top row held from `left` along
 * `across`, `w` wide, hanging `h` along `down`. `torn` hangs ragged tongues
 * off its foot.
 */
export function barBanner(
  s: Sculpt,
  o: { bone: string; left: THREE.Vector3; across: THREE.Vector3; down: THREE.Vector3; w: number; h: number; mat: CMat; col?: RGB; torn: number; rand: () => number; pole: [THREE.Vector3, THREE.Vector3, number] },
): void {
  const H = s.rig.height;
  const C = 9;
  const R = 11;
  const tongue = Array.from({ length: C }, (_, c) => o.torn * H * (c % 3 === 1 ? 0.04 + o.rand() * 0.08 : o.rand() * 0.03));
  const geo = sheetGeo(C, R, (c, r) => {
    const t = r / (R - 1);
    return o.left.clone().addScaledVector(o.across, (o.w * c) / (C - 1)).addScaledVector(o.down, o.h * t + tongue[c]! * t ** 4);
  });
  const n = C * R;
  const pin = new Float32Array(n);
  const reach = new Float32Array(n);
  for (let r = 0; r < R; r++) {
    const t = r / (R - 1);
    for (let c = 0; c < C; c++) {
      pin[r * C + c] = r === 0 ? 1 : 0;
      reach[r * C + c] = (o.h + tongue[c]!) * 0.7 * t ** 1.3;
    }
  }
  s.cloths.push({
    bone: o.bone,
    feel: 'banner',
    mat: o.mat,
    col: o.col,
    cols: C,
    rows: R,
    geo,
    pin,
    reach,
    bodies: [body(s, o.bone, o.pole[0], o.bone, o.pole[1], o.pole[2]), ...torso(s, H, true)].filter((b): b is ClothBody => !!b),
  });
}
