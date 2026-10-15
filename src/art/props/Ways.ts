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
import * as THREE from 'three/webgpu';
import { atan, length, pow, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import type { F, V2, V3 } from '../../core/Tsl';
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
  // Counted by DungeonScene.balanceLights, which keeps the light count fixed.
  light.name = 'way:light';

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

type WayShade = (p: V2, r: F, t: F, c: V3) => V3;

/** The veil: two spirals turning against each other over a bright core. */
const swirl: WayShade = (p, r, t, c) => {
  const a = atan(p.y, p.x);
  const s1 = sin(a.mul(3.0).add(r.mul(11.0)).sub(t.mul(2.6))).mul(0.5).add(0.5);
  const s2 = sin(a.mul(5.0).sub(r.mul(15.0)).add(t.mul(1.7))).mul(0.5).add(0.5);
  const core = r.oneMinus();
  const rim = smoothstep(0.8, 0.97, r).mul(smoothstep(0.97, 1.0, r).oneMinus());
  return c
    .mul(s1.mul(s2).mul(0.75).add(0.25))
    .mul(core)
    .mul(1.4)
    .add(c.mul(rim).mul(1.8))
    .add(vec3(0.85, 0.95, 1.0).mul(pow(core, 5.0)).mul(0.7));
};

/** The pool at its foot: soft rings running outward. */
const poolGlow: WayShade = (_p, r, t, c) => {
  const wave = sin(r.mul(12.0).sub(t.mul(3.0))).mul(0.2).add(0.8);
  return c.mul(pow(r.oneMinus(), 2.0)).mul(0.9).mul(wave);
};

export interface PortalOpts {
  width?: number;
  height?: number;
  /** Its point light's intensity and reach. */
  light?: [number, number];
  /** False keeps it facing its own +Z (the town gate) instead of the camera. */
  billboard?: boolean;
}

/** The town portal: a standing oval of light. `color` is its hue. */
export function buildPortal(color = 0x7ec8ff, o: PortalOpts = {}): WayLook {
  const owned: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const uTime = uniform(0);
  const uColor = uniform(new THREE.Color(color)) as unknown as V3;
  const additive = (shade: WayShade): THREE.MeshBasicNodeMaterial => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    m.fog = false;
    const p = uv().mul(2.0).sub(1.0);
    const r = length(p).toVar();
    m.maskNode = r.lessThanEqual(1.0);
    m.colorNode = shade(p, r, uTime, uColor);
    mats.push(m);
    return m;
  };
  const face = new THREE.Group();
  const W = o.width ?? 1.5;
  const H = o.height ?? 2.5;
  const [lightI, lightD] = o.light ?? [14, 16];
  const lift = 0.2;
  const veil = new THREE.PlaneGeometry(W, H);
  owned.push(veil);
  const veilMesh = new THREE.Mesh(veil, additive(swirl));
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
  const poolGeo = new THREE.PlaneGeometry(W * 2.1, W * 2.1);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, 0.03, 0);
  owned.push(poolGeo);
  const pool = new THREE.Mesh(poolGeo, additive(poolGlow));
  pool.renderOrder = 1;

  const light = new THREE.PointLight(color, lightI, lightD, 2);
  light.position.set(0, lift + H * 0.55, 0.4);
  // Counted by DungeonScene.balanceLights, which keeps the light count fixed.
  light.name = 'way:light';

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
      uTime.value = t;
      face.position.y = Math.sin(t * 1.7) * 0.05;
      light.intensity = lightI * (0.86 + Math.sin(t * 5.3) * 0.1 + Math.sin(t * 2.1) * 0.1);
      if (camera && o.billboard !== false) {
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
