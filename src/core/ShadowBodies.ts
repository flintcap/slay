/**
 * SLAY — bodies drawn only into shadow maps.
 *
 * A monster is three to five parts (skin, cloth, metal, bone), and each part
 * cast its own shadow: one draw per part per monster in the shadow pass. A
 * shadow body is all of a creature's parts in one geometry
 * (`art/creatures/Creature.ts`), and the parts cast none, so each monster's
 * shadow is one draw.
 *
 * three.js has no "shadow only" switch (its shadow pass tests layers against
 * the game camera), so the bodies share one material that is hidden while the
 * frame's draw list is built and shown just for the shadow pass:
 * `Renderer.render` hides it before each frame, and every shadow-casting
 * light shows it as its shadow map is drawn (`watchShadowLight`). It never
 * writes colour or depth, so a body that does reach a colour pass (another
 * renderer, a stand-in) draws nothing.
 */
import * as THREE from 'three';

let mat: THREE.MeshBasicMaterial | null = null;
const watched = new WeakSet<THREE.LightShadow>();

/** The one material every shadow body wears. */
export function shadowBodyMaterial(): THREE.MeshBasicMaterial {
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    mat.name = 'creature:shadow';
    mat.userData.shared = true;
  }
  return mat;
}

/** Hides the shadow bodies from the frame's own draw list. */
export function hideShadowBodies(): void {
  if (mat) mat.visible = false;
}

/**
 * Shows the shadow bodies to `light`'s shadow pass, which runs after the draw
 * list is built. Every shadow pass points the shadow camera before it draws
 * (a point light once per cube face, without the shadow's own
 * `updateMatrices`), so the camera's update is the hook.
 */
export function watchShadowLight(light: THREE.Light): void {
  const shadow = (light as THREE.DirectionalLight).shadow as THREE.LightShadow | undefined;
  if (!shadow || watched.has(shadow)) return;
  watched.add(shadow);
  const cam = shadow.camera;
  const update = cam.updateMatrixWorld.bind(cam);
  cam.updateMatrixWorld = (force?: boolean) => {
    if (mat) mat.visible = true;
    update(force);
  };
}
