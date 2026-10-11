/**
 * SLAY — the ways out: the waypoint and the town portal.
 *
 * The waypoint is a worn octagonal dais of the biome's own stone, a ring of
 * runes cut into it that glow gold and breathe. The portal is a standing oval
 * of swirling blue light in a rim of fire-blue, a pool of glow at its foot,
 * turned to face the camera so it always reads as a door.
 *
 * Both are small scene objects (a handful of draw calls) that own their
 * glowing materials, so they can pulse without touching the shared prop
 * materials. Call `update` every frame and `dispose` when done.
 */
import * as THREE from 'three';
import type { BiomeArt } from '../../world/Biomes';
import { hashString, streamFor } from '../../core/RNG';
import { M, makeCtx } from './Ctx';
import { PropKit, box, cyl, jag, merge, mottle } from './Kit';
import { weather } from './Stone';

export interface WayLook {
  root: THREE.Group;
  /** `camera` turns the portal to face it; the waypoint ignores it. */
  update(dt: number, camera?: THREE.Camera): void;
  dispose(): void;
}

function kitMeshes(k: PropKit, owned: THREE.BufferGeometry[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const l of k.done().layers) {
    owned.push(l.geometry);
    const m = new THREE.Mesh(l.geometry, l.material);
    m.castShadow = !l.ghost;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}

/** The waypoint dais for a biome. Walkable: it rises only 12 cm. */
export function buildWaypoint(art: BiomeArt): WayLook {
  const rng = streamFor(hashString(`waypoint|${art.id}`), 'prop');
  const c = makeCtx(art, rng, 0);
  const k = new PropKit(rng);
  const st = M.stone(c);
  const owned: THREE.BufferGeometry[] = [];
  const R = 1.45;
  // Eight rim blocks round an octagon, each a little sunk or proud.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const len = 2 * R * Math.sin(Math.PI / 8) * 0.98;
    const g = box(len, 0.12, 0.34, 0.03, 2);
    jag(g, rng, 0.012, 6);
    weather(g, c, rng, 1, 0.3);
    k.add(st, g, { x: Math.cos(a) * (R - 0.17), y: 0.06 + rng.range(-0.015, 0.01), z: Math.sin(a) * (R - 0.17), ry: -a + Math.PI / 2 }, rng.range(0.75, 0.95));
  }
  // The inner plate: flagstones cut on the octagon.
  const plate = cyl(R - 0.33, R - 0.3, 0.1, 8, false);
  plate.rotateY(Math.PI / 8);
  jag(plate, rng, 0.006, 5);
  mottle(plate, rng, 0.45, 3);
  k.add(st, weather(plate, c, rng, 1.2, 0.2), { y: 0.05 }, 0.85);
  // A raised centre disc, the sigil's seat.
  k.add(st, cyl(0.42, 0.46, 0.04, 16), { y: 0.1 + 0.02 }, 0.95);
  const meshes = kitMeshes(k, owned);

  // The glow: a ring of runes and the sigil, one owned material so it can breathe.
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb84a, emissiveIntensity: 2.2, roughness: 0.6, metalness: 0 });
  const runes: THREE.BufferGeometry[] = [];
  const ring = new THREE.RingGeometry(0.86, 0.92, 48, 1);
  ring.rotateX(-Math.PI / 2);
  ring.translate(0, 0.102, 0);
  runes.push(ring);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = new THREE.PlaneGeometry(0.09, 0.16);
    // A cut and a tick, so each rune reads as a mark rather than a dash.
    const t = new THREE.PlaneGeometry(0.05, 0.03).translate(rng.range(-0.03, 0.03), rng.range(-0.05, 0.05), 0);
    const g = merge([r, t]);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-a);
    g.translate(Math.cos(a) * 0.72, 0.102, Math.sin(a) * 0.72);
    runes.push(g);
  }
  const sigil = new THREE.RingGeometry(0.18, 0.26, 6, 1);
  sigil.rotateX(-Math.PI / 2);
  sigil.translate(0, 0.142, 0);
  runes.push(sigil);
  const runeGeo = merge(runes);
  owned.push(runeGeo);
  const glowMesh = new THREE.Mesh(runeGeo, glow);

  const light = new THREE.PointLight(0xffb85a, 6, 9, 2);
  light.position.set(0, 1.0, 0);

  const root = new THREE.Group();
  root.name = 'waypoint';
  for (const m of meshes) root.add(m);
  root.add(glowMesh, light);
  let t = 0;
  return {
    root,
    update(dt: number): void {
      t += dt;
      const b = 0.75 + 0.25 * Math.sin(t * 1.6);
      glow.emissiveIntensity = 1.6 + b * 1.2;
      light.intensity = 4.5 + b * 2;
    },
    dispose(): void {
      root.removeFromParent();
      for (const g of owned) g.dispose();
      glow.dispose();
    },
  };
}

const SWIRL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SWIRL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float s1 = sin(a * 3.0 + r * 11.0 - uTime * 2.6) * 0.5 + 0.5;
  float s2 = sin(a * 5.0 - r * 15.0 + uTime * 1.7) * 0.5 + 0.5;
  float core = 1.0 - r;
  float rim = smoothstep(0.8, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
  vec3 col = uColor * (0.25 + 0.75 * s1 * s2) * core * 1.4;
  col += uColor * rim * 1.8;
  col += vec3(0.85, 0.95, 1.0) * pow(core, 5.0) * 0.7;
  gl_FragColor = vec4(col, 1.0);
}`;

const POOL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float wave = 0.8 + 0.2 * sin(r * 12.0 - uTime * 3.0);
  gl_FragColor = vec4(uColor * pow(1.0 - r, 2.0) * 0.9 * wave, 1.0);
}`;

/** The town portal: a standing oval of light. `color` is its hue. */
export function buildPortal(color = 0x7ec8ff): WayLook {
  const owned: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } };
  const additive = (frag: string): THREE.ShaderMaterial => {
    const m = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SWIRL_VERT,
      fragmentShader: frag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mats.push(m);
    return m;
  };
  const face = new THREE.Group();
  const W = 1.5;
  const H = 2.5;
  const lift = 0.2;
  const veil = new THREE.PlaneGeometry(W, H);
  owned.push(veil);
  const veilMesh = new THREE.Mesh(veil, additive(SWIRL_FRAG));
  veilMesh.position.y = lift + H / 2;
  face.add(veilMesh);

  // The rim: an ellipse of light a little brighter than the veil's edge.
  const rimGeo = new THREE.TorusGeometry(1, 0.035, 6, 48);
  rimGeo.scale(W / 2, H / 2, 1);
  owned.push(rimGeo);
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  mats.push(rimMat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.y = lift + H / 2;
  face.add(rim);

  // A pool of glow on the ground at its foot.
  const poolGeo = new THREE.PlaneGeometry(3.2, 3.2);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, 0.03, 0);
  owned.push(poolGeo);
  const pool = new THREE.Mesh(poolGeo, additive(POOL_FRAG));
  pool.renderOrder = 1;

  const light = new THREE.PointLight(color, 14, 16, 2);
  light.position.set(0, 1.4, 0.4);

  const root = new THREE.Group();
  root.name = 'portal';
  root.add(face, pool, light);
  for (const m of [veilMesh, rim, pool]) {
    m.castShadow = false;
    m.receiveShadow = false;
  }
  let t = 0;
  const camPos = new THREE.Vector3();
  const here = new THREE.Vector3();
  return {
    root,
    update(dt: number, camera?: THREE.Camera): void {
      t += dt;
      uniforms.uTime.value = t;
      face.position.y = Math.sin(t * 1.7) * 0.05;
      light.intensity = 12 + Math.sin(t * 5.3) * 1.5 + Math.sin(t * 2.1) * 1.5;
      if (camera) {
        camera.getWorldPosition(camPos);
        root.getWorldPosition(here);
        face.rotation.y = Math.atan2(camPos.x - here.x, camPos.z - here.z) - root.rotation.y;
      }
    },
    dispose(): void {
      root.removeFromParent();
      for (const g of owned) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
