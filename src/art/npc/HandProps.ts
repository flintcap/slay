/**
 * SLAY — the things townsfolk carry: a smith's hammer and tongs, a ledger and
 * quill, a mortar and pestle, a ring of keys, a lantern, a broom, a tankard.
 *
 * Each prop is built in its hand's grip frame (`HERO_SOCKETS` in `Rig.ts`):
 * origin at the centre of the fist, +Y along the grip out of the thumb side,
 * +X from the wrist toward the knuckles, and +Z out of the palm. (The rig's
 * right hand has +Z out of the back of the hand, so right-hand props are
 * mirrored on the way in; authors never need to care.)
 *
 * Props never move in the hand, so they are baked straight into the body:
 * each part is put where the socket is in the bind pose, bound rigidly to the
 * hand bone, and merged with the clothes that share its material. A ledger
 * costs no draw call of its own.
 */
import * as THREE from 'three';
import { beveledBox, lathe, limb, ring, taperedBox } from '../Meshes';
import { gearMaterial, glowMaterial } from '../hero/HeroMaterials';
import { heroBoneIndex, skinRigid } from '../hero/Skinning';
import { SOCKET_BONE, type HeroRig } from '../hero/Rig';

export type PropKind =
  | 'hammer'
  | 'tongs'
  | 'ledger'
  | 'quill'
  | 'coins'
  | 'purse'
  | 'keys'
  | 'lantern'
  | 'mortar'
  | 'pestle'
  | 'bottle'
  | 'broom'
  | 'spade'
  | 'tankard'
  | 'map'
  | 'rod'
  | 'staff'
  | 'spear'
  | 'beads';

/** One piece of a prop: geometry in the grip frame and a surface key. */
interface PropPart {
  geo: THREE.BufferGeometry;
  /** A gear surface key ('metal.iron', 'cloth.linen|0xe8dcc0'), or a glow. */
  key: string;
  glow?: { color: number; intensity: number };
}

const at = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
};

/** A rod along +Y from y0 to y1. */
function rod(y0: number, y1: number, r: number, r1 = r, seg = 7): THREE.BufferGeometry {
  return at(limb(y1 - y0, r1, r, seg), 0, y0, 0);
}

function parts(kind: PropKind): PropPart[] {
  switch (kind) {
    case 'hammer': {
      // A cross-peen smithing hammer: ash haft, square iron face toward +X.
      return [
        { geo: rod(-0.09, 0.3, 0.016, 0.014), key: 'wood.oak|0xb08a60' },
        { geo: at(taperedBox(0.05, 0.05, 0.045, 0.045, 0.1, 0.006), 0.035, 0.31, 0, 0, 0, -Math.PI / 2), key: 'metal.dark' },
        { geo: at(taperedBox(0.05, 0.05, 0.05, 0.012, 0.06, 0.004), -0.055, 0.31, 0, 0, 0, Math.PI / 2), key: 'metal.dark' },
      ];
    }
    case 'tongs': {
      // Long tongs, jaws ahead, a bar of hot iron in them.
      const out: PropPart[] = [];
      for (const s of [-1, 1]) {
        out.push({ geo: at(rod(-0.12, 0.42, 0.007, 0.006, 5), 0, 0, s * 0.01, s * 0.03, 0, 0), key: 'metal.dark' });
      }
      out.push({ geo: at(beveledBox(0.03, 0.05, 0.03, 0.006), 0, 0.42, 0), key: 'metal.dark' });
      out.push({ geo: at(beveledBox(0.026, 0.2, 0.02, 0.005), 0.0, 0.53, 0), key: 'glow', glow: { color: 0xff6a1a, intensity: 2.6 } });
      return out;
    }
    case 'ledger': {
      // A thick ledger lying open on the palm, spine along the forearm.
      const cover = 'leather.fine|0x8a3a28';
      const page = 'cloth.linen|0xf2e8d0';
      return [
        { geo: at(beveledBox(0.17, 0.25, 0.012, 0.004), 0.085, 0.0, 0.03, 0, -0.12, 0), key: cover },
        { geo: at(beveledBox(0.17, 0.25, 0.012, 0.004), -0.085, 0.0, 0.03, 0, 0.12, 0), key: cover },
        { geo: at(beveledBox(0.155, 0.235, 0.02, 0.003), 0.08, 0.0, 0.046, 0, -0.12, 0), key: page },
        { geo: at(beveledBox(0.155, 0.235, 0.02, 0.003), -0.08, 0.0, 0.046, 0, 0.12, 0), key: page },
      ];
    }
    case 'quill': {
      return [
        { geo: at(taperedBox(0.004, 0.004, 0.02, 0.002, 0.2, 0.001), 0, 0.09, 0, 0, 0, 0.1), key: 'cloth.linen|0xf0ece0' },
        { geo: rod(-0.04, 0.0, 0.003, 0.003, 4), key: 'bone.pale' },
      ];
    }
    case 'coins': {
      // A short stack of coins on the open palm.
      const out: PropPart[] = [];
      for (let i = 0; i < 4; i++) {
        out.push({ geo: at(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 10), 0.03 + i * 0.002, 0.0, 0.035 + i * 0.0045, Math.PI / 2, 0, 0), key: 'metal.gold' });
      }
      return out;
    }
    case 'purse': {
      // A fat coin purse hanging from its drawstring.
      return [
        { geo: at(lathe([[0.001, 0], [0.04, 0.012], [0.055, 0.05], [0.045, 0.09], [0.02, 0.1], [0.024, 0.12], [0.001, 0.125]], 10), 0.1, 0, 0, 0, 0, Math.PI / 2), key: 'leather.worn|0x7a5a3a' },
      ];
    }
    case 'keys': {
      const out: PropPart[] = [{ geo: at(ring(0.045, 0.005, 14, 4), 0.06, 0, 0, Math.PI / 2, 0, 0), key: 'metal.bronze' }];
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32;
        out.push({ geo: at(taperedBox(0.012, 0.004, 0.008, 0.004, 0.08, 0.002), 0.1 + Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0, 0, 0, Math.PI / 2 + a), key: 'metal.bronze' });
      }
      return out;
    }
    case 'lantern': {
      // Held by its bail; the lamp hangs below the fist (toward +X).
      const frame = 'metal.dark';
      return [
        { geo: at(ring(0.045, 0.004, 10, 4), 0.03, 0, 0, Math.PI / 2, 0, 0), key: frame },
        { geo: at(lathe([[0.001, 0], [0.03, 0], [0.065, 0.04], [0.04, 0.06], [0.001, 0.065]], 6), 0.13, 0, 0, 0, 0, Math.PI / 2), key: frame },
        { geo: at(lathe([[0.001, 0], [0.06, 0], [0.065, 0.015], [0.001, 0.02]], 6), 0.3, 0, 0, 0, 0, Math.PI / 2), key: frame },
        { geo: at(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 6), 0.24, 0, 0, 0, 0, Math.PI / 2), key: 'glow', glow: { color: 0xffb050, intensity: 2.4 } },
      ];
    }
    case 'mortar': {
      // A stone bowl cradled on the palm.
      return [{ geo: at(lathe([[0.001, 0], [0.045, 0], [0.065, 0.03], [0.07, 0.075], [0.06, 0.078], [0.05, 0.035], [0.001, 0.03]], 12), 0.03, 0, 0.03, -Math.PI / 2, 0, 0), key: 'stone.temple|0xb0a890' }];
    }
    case 'pestle': {
      return [{ geo: rod(-0.07, 0.12, 0.016, 0.01, 7), key: 'stone.temple|0xb0a890' }];
    }
    case 'bottle': {
      return [
        { geo: at(lathe([[0.001, 0], [0.028, 0], [0.032, 0.05], [0.012, 0.08], [0.01, 0.11], [0.001, 0.11]], 9), 0, -0.04, 0), key: 'glow', glow: { color: 0x70d080, intensity: 1.2 } },
        { geo: at(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6), 0, 0.075, 0), key: 'wood.oak' },
      ];
    }
    case 'broom': {
      // A besom: a long haft down out of the little finger, a bundle of twigs at the floor.
      return [
        { geo: rod(-0.72, 0.45, 0.016, 0.014, 7), key: 'wood.oak|0x9a7a50' },
        { geo: at(lathe([[0.001, 0], [0.09, 0.02], [0.08, 0.14], [0.035, 0.27], [0.02, 0.3], [0.001, 0.31]], 9), 0, -1.0, 0), key: 'wood.oak|0xb09858' },
        { geo: at(ring(0.03, 0.006, 10, 4), 0, -0.72, 0, Math.PI / 2, 0, 0), key: 'leather.worn' },
      ];
    }
    case 'spade': {
      return [
        { geo: rod(-0.95, 0.2, 0.017, 0.015, 7), key: 'wood.oak|0x8a6a44' },
        { geo: at(beveledBox(0.13, 0.03, 0.03, 0.008), 0, 0.22, 0), key: 'wood.oak|0x8a6a44' },
        { geo: at(taperedBox(0.18, 0.012, 0.2, 0.01, 0.26, 0.004), 0, -1.08, 0), key: 'metal.iron' },
      ];
    }
    case 'tankard': {
      // A pewter tankard held by its handle; the body sits against the knuckles.
      return [
        { geo: at(lathe([[0.001, 0], [0.045, 0], [0.05, 0.01], [0.047, 0.13], [0.052, 0.14], [0.001, 0.142]], 12), 0.07, -0.07, 0), key: 'metal.silver|0x9a9a90' },
        { geo: at(ring(0.032, 0.008, 10, 4), 0.025, 0, 0, 0, 0, 0), key: 'metal.silver|0x9a9a90' },
        { geo: at(new THREE.CylinderGeometry(0.042, 0.042, 0.01, 12), 0.07, 0.065, 0), key: 'cloth.linen|0xe8dcb0' },
      ];
    }
    case 'map': {
      // A rolled survey map, unrolled a hand's width.
      const paper = 'cloth.linen|0xe2d4b0';
      return [
        { geo: rod(-0.16, 0.16, 0.02, 0.02, 9), key: paper },
        { geo: at(beveledBox(0.004, 0.3, 0.22, 0.001), 0.0, 0, 0.12), key: paper },
      ];
    }
    case 'rod': {
      // A surveyor's rod: a tall pole banded every foot.
      const out: PropPart[] = [{ geo: rod(-1.1, 0.95, 0.016, 0.014, 7), key: 'wood.oak|0xb89a70' }];
      for (let i = 0; i < 6; i++) out.push({ geo: at(new THREE.CylinderGeometry(0.019, 0.019, 0.05, 7), 0, -0.95 + i * 0.32, 0), key: 'cloth.banner|0xa83a2a' });
      out.push({ geo: at(lathe([[0.001, 0], [0.018, 0], [0.004, 0.06]], 6), 0, 0.95, 0), key: 'metal.bronze' });
      return out;
    }
    case 'staff': {
      // A plain walking staff, a knot of root at the head.
      return [
        { geo: rod(-1.05, 0.65, 0.02, 0.017, 7), key: 'wood.oak|0x8a7a64' },
        { geo: at(new THREE.SphereGeometry(0.04, 8, 6), 0, 0.68, 0), key: 'wood.oak|0x8a7a64' },
        { geo: at(ring(0.022, 0.006, 10, 4), 0, 0.55, 0, Math.PI / 2, 0, 0), key: 'cloth.silk|0x5a3a7a' },
      ];
    }
    case 'spear': {
      // The watch's spear: a long ash haft and a leaf blade, edge toward +X.
      return [
        { geo: rod(-1.1, 1.0, 0.017, 0.015, 7), key: 'wood.oak|0x7a5a3a' },
        { geo: at(taperedBox(0.05, 0.012, 0.004, 0.004, 0.26, 0.003), 0, 1.13, 0), key: 'metal.steel' },
        { geo: at(new THREE.CylinderGeometry(0.02, 0.016, 0.06, 7), 0, 0.99, 0), key: 'metal.iron' },
        { geo: at(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 7), 0, -1.1, 0), key: 'metal.iron' },
      ];
    }
    case 'beads': {
      // Prayer beads looped over the fingers.
      const out: PropPart[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        out.push({ geo: at(new THREE.SphereGeometry(0.008, 5, 4), 0.06 + Math.cos(a) * 0.05, Math.sin(a) * 0.03, 0.02), key: 'wood.polished' });
      }
      return out;
    }
  }
}

/** Mirrors a geometry through z = 0, keeping its faces outward. */
function mirrorZ(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  const idx = geo.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  } else {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i += 3) {
      for (const att of nrm ? [pos, nrm] : [pos]) {
        const x = att.getX(i + 1);
        const y = att.getY(i + 1);
        const z = att.getZ(i + 1);
        att.setXYZ(i + 1, att.getX(i + 2), att.getY(i + 2), att.getZ(i + 2));
        att.setXYZ(i + 2, x, y, z);
      }
    }
  }
  return geo;
}

/**
 * What a resident holds or hangs on the body: a prop, where, and an extra
 * offset and turn. In a hand ('L', 'R') the offset is in the grip frame; on
 * the body ('beltL', 'beltR', 'back') it is in character space (+X the
 * character's left, +Y up, +Z ahead) from the socket's point, unturned.
 */
export interface HeldProp {
  kind: PropKind;
  hand: 'L' | 'R' | 'beltL' | 'beltR' | 'back';
  /** Extra offset and turn (metres, radians). */
  at?: [number, number, number];
  turn?: [number, number, number];
}

const _m = new THREE.Matrix4();
const _sock = new THREE.Matrix4();
const _pos = new THREE.Vector3();

/**
 * Puts props in hand: each part placed at its socket in the bind pose,
 * bound rigidly to the hand bone and grouped by material, as skinned meshes
 * under the rig. The resident's merge folds them into the clothes after.
 */
export function bakeProps(rig: HeroRig, held: HeldProp[], name: string): THREE.SkinnedMesh[] {
  rig.root.updateMatrixWorld(true);
  const rootInv = rig.root.matrixWorld.clone().invert();
  const byKey = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.Material }>();
  for (const h of held) {
    const inHand = h.hand === 'L' || h.hand === 'R';
    const slot = h.hand === 'L' ? 'offHand' : h.hand === 'R' ? 'mainHand' : h.hand;
    const socket = rig.sockets[slot];
    _sock.multiplyMatrices(rootInv, socket.matrixWorld);
    if (!inHand) {
      // Body props keep the character's axes: only the socket's point counts.
      _pos.setFromMatrixPosition(_sock);
      _sock.makeTranslation(_pos.x, _pos.y, _pos.z);
    }
    const t = h.at ?? [0, 0, 0];
    const r = h.turn ?? [0, 0, 0];
    _m.compose(new THREE.Vector3(t[0], t[1], t[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(1, 1, 1));
    const bone = heroBoneIndex(SOCKET_BONE[slot]);
    for (const p of parts(h.kind)) {
      let g = p.geo.index ? p.geo : p.geo;
      g.applyMatrix4(_m);
      if (h.hand === 'R') g = mirrorZ(g);
      g.applyMatrix4(_sock);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      skinRigid(g, bone);
      const key = p.glow ? `glow|${p.glow.color}|${p.glow.intensity}` : p.key;
      let e = byKey.get(key);
      if (!e) byKey.set(key, (e = { geos: [], mat: p.glow ? glowMaterial(p.glow.color, p.glow.intensity) : gearMaterial(p.key) }));
      e.geos.push(g);
    }
  }
  const out: THREE.SkinnedMesh[] = [];
  for (const [key, e] of byKey) {
    for (const g of e.geos) {
      const mesh = new THREE.SkinnedMesh(g, e.mat);
      mesh.name = `${name}:prop-${key}`;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      rig.root.add(mesh);
      mesh.bind(rig.skeleton, new THREE.Matrix4());
      out.push(mesh);
    }
  }
  return out;
}
