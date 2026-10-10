/**
 * SLAY — eyes. A wet sphere in each socket with a painted iris, so a face has
 * someone behind it: the highlight on the cornea is what the eye reads as
 * alive. Glowing eyes (the revenant) are emissive instead.
 */
import * as THREE from 'three';
import { skinRigid, heroBoneIndex } from './Skinning';

const irisCache = new Map<number, THREE.CanvasTexture>();

/** Sclera, iris and pupil painted on an equirectangular map; the iris sits at u = 0.5 (facing +Z). */
function irisTexture(iris: number): THREE.CanvasTexture {
  const hit = irisCache.get(iris);
  if (hit) return hit;
  const W = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = W / 2;
  const g = c.getContext('2d')!;
  // Sclera: off-white, warmer and redder toward the edges.
  const sc = g.createRadialGradient(W * 0.5, W * 0.25, 2, W * 0.5, W * 0.25, W * 0.5);
  sc.addColorStop(0, '#e8e2da');
  sc.addColorStop(0.5, '#d8c8bc');
  sc.addColorStop(1, '#a87870');
  g.fillStyle = sc;
  g.fillRect(0, 0, W, W / 2);
  const col = new THREE.Color(iris);
  const dark = col.clone().multiplyScalar(0.35);
  const lite = col.clone().lerp(new THREE.Color(0xffffff), 0.25);
  const ir = W * 0.075;
  const grad = g.createRadialGradient(W * 0.5, W * 0.25, ir * 0.3, W * 0.5, W * 0.25, ir);
  grad.addColorStop(0, `#${lite.getHexString()}`);
  grad.addColorStop(0.7, `#${col.getHexString()}`);
  grad.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = grad;
  g.beginPath();
  // Equirectangular: the iris is wider in u than v by the map's 2:1 aspect.
  g.ellipse(W * 0.5, W * 0.25, ir, ir * 1.0, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#060504';
  g.beginPath();
  g.ellipse(W * 0.5, W * 0.25, ir * 0.42, ir * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  irisCache.set(iris, tex);
  return tex;
}

const matCache = new Map<string, THREE.Material>();

export function eyeMaterial(iris: number, glow?: number): THREE.Material {
  const key = `${iris}|${glow ?? ''}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  if (glow !== undefined) {
    m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: glow, emissiveIntensity: 3.2, roughness: 0.3 });
  } else {
    m = new THREE.MeshStandardMaterial({ map: irisTexture(iris), roughness: 0.06, metalness: 0, envMapIntensity: 1.4 });
  }
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

/** Both eyeballs as one geometry, bound rigidly to the head. */
export function eyeGeometry(L: THREE.Vector3, R: THREE.Vector3, r: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const c of [L, R]) {
    const g = new THREE.SphereGeometry(r, 16, 12);
    // Sphere's u = 0.5 faces -X by default; turn the iris to face forward.
    g.rotateY(-Math.PI * 0.5);
    g.translate(c.x, c.y, c.z);
    parts.push(g);
  }
  const out = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const g of parts) {
    const o = pos.length / 3;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    uv.push(...(g.getAttribute('uv').array as Float32Array));
    const ix = g.getIndex()!.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + o);
    g.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  skinRigid(out, heroBoneIndex('head'));
  return out;
}
