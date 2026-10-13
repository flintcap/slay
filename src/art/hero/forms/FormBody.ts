/**
 * SLAY — puts a Shapeshifter's beast body on his hero, and takes it off.
 *
 * The beast is skinned to the hero's own skeleton (`BeastBody.ts` grows it on
 * the same joints), so every system that moves the hero moves the beast. What
 * a form changes:
 *
 *  - the man's skin, hair, linens, worn armour, set glow and held weapons are
 *    hidden (gear still counts; it just does not fit a bear),
 *  - the pelt, claws, fangs, eyes and tail are shown,
 *  - the whole hero is scaled up (`BEAST_BUILD[form].scale`) and the animator
 *    is told, so the stride still plants,
 *  - the animator takes the form's stance and chain of blows.
 *
 * The tail has its own five bones hung under the pelvis. It droops at rest,
 * lifts as the body runs, swings against turns and sways on its own.
 */
import * as THREE from 'three';
import type { HeroModel } from '../Hero';
import type { HeroAnimator } from '../Animator';
import { eyeGeometry, eyeMaterial } from '../Eyes';
import { furMaterial, hornMaterial } from '../HeroMaterials';
import { BEAST_BUILD, BEAST_EYES, BEAST_FORMS, TAIL_BONES, TAIL_SHAPE, beastReady, meshBeast, tailGeometry, type BeastForm } from './BeastBody';

/** One form's meshes, built once per hero and kept. */
interface Worn {
  group: THREE.Group;
  tail: THREE.Bone[];
  tailBase: THREE.Bone;
}

/** How each tail hangs and moves. */
const TAIL_MOTION: Readonly<Record<BeastForm, { curl: number; sway: number; rate: number; lift: number; swing: number }>> = {
  // A cat's tail hangs low with the tip curled up, and lashes.
  cat: { curl: 0.32, sway: 0.2, rate: 1.7, lift: 0.75, swing: 0.55 },
  // A wolf's brush streams out behind it at a run.
  wolf: { curl: 0.06, sway: 0.1, rate: 1.1, lift: 0.85, swing: 0.4 },
  // A bear's stub barely moves.
  bear: { curl: 0, sway: 0.04, rate: 0.9, lift: 0.15, swing: 0.1 },
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class FormBody {
  /** The form shown, or null for the man. */
  form: BeastForm | null = null;
  private worn = new Map<BeastForm, Worn>();
  /** Visibility of the hero's own parts before the form hid them. */
  private hiddenSelf = false;
  private t = 0;
  private lastPelvis = new THREE.Vector3();
  private hasLast = false;
  /** Smoothed pelvis velocity in the pelvis's own frame (x side, z forward). */
  private vel = new THREE.Vector2();
  /** Root scale easing toward the form's (the swell of the change). */
  private scaleNow = 1;
  private scaleVel = 0;
  private prewarmed = false;
  /** Grown past the form's own size (Ursa Major), 1 for none. */
  extra = 1;

  constructor(
    private readonly hero: HeroModel,
    private readonly animator: HeroAnimator,
  ) {}

  private build(form: BeastForm): Worn {
    const hit = this.worn.get(form);
    if (hit) return hit;
    const rig = this.hero.rig;
    const name = rig.root.name || 'hero';
    const beast = meshBeast(form, rig.shape);
    const group = new THREE.Group();
    group.name = `${name}:form-${form}`;
    group.userData.beastForm = form;
    const skinned = (geo: THREE.BufferGeometry, mat: THREE.Material, part: string, shadow = true) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.name = `${name}:${form}-${part}`;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      group.add(m);
      m.bind(rig.skeleton, new THREE.Matrix4());
      return m;
    };
    // The pelt and claws are cached per shape and shared: no hero frees them.
    beast.skin.userData.cached = true;
    beast.horn.userData.cached = true;
    skinned(beast.skin, furMaterial(form === 'cat' ? 0.5 : 0.7), 'pelt');
    skinned(beast.horn, hornMaterial(), 'horn');
    const e = BEAST_EYES[form];
    skinned(eyeGeometry(beast.eyes.L, beast.eyes.R, beast.eyes.r), eyeMaterial(e.iris, e.glow), 'eyes', false);

    // The tail: its own chain of bones under the pelvis.
    const pelvis = rig.bones.pelvis;
    const len = TAIL_SHAPE[form].len * beast.h;
    const seg = len / (TAIL_BONES - 1);
    const tail: THREE.Bone[] = [];
    const inverses: THREE.Matrix4[] = [];
    for (let i = 0; i < TAIL_BONES; i++) {
      const b = new THREE.Bone();
      b.name = `tail${i}`;
      if (i === 0) b.position.copy(beast.tailRoot).sub(rig.joints.pelvis);
      else b.position.set(0, 0, -seg);
      (i === 0 ? pelvis : tail[i - 1]!).add(b);
      tail.push(b);
      inverses.push(new THREE.Matrix4().makeTranslation(0, 0, seg * i));
    }
    const tailMesh = new THREE.SkinnedMesh(tailGeometry(form, beast.h), furMaterial(form === 'cat' ? 0.5 : 0.7));
    tailMesh.name = `${name}:${form}-tail`;
    tailMesh.castShadow = true;
    tailMesh.receiveShadow = true;
    tailMesh.frustumCulled = false;
    group.add(tailMesh);
    tailMesh.bind(new THREE.Skeleton(tail, inverses), new THREE.Matrix4());
    group.visible = false;
    rig.root.add(group);
    const out: Worn = { group, tail, tailBase: tail[0]! };
    this.worn.set(form, out);
    return out;
  }

  /**
   * Shows a form (or the man, with null). `ownHidden` is the set of the
   * man's parts his gear hides, to restore him exactly when he comes back.
   */
  set(form: BeastForm | null, ownHidden: Set<string>): void {
    if (form === this.form) return;
    const prev = this.form;
    this.form = form;
    if (prev) {
      const w = this.worn.get(prev);
      if (w) w.group.visible = false;
    }
    if (form) {
      const w = this.build(form);
      w.group.visible = true;
      this.hideSelf();
    } else {
      this.showSelf(ownHidden);
    }
    this.animator.setForm(form);
    const target = form ? BEAST_BUILD[form].scale * this.extra : 1;
    this.animator.bodyScale = target;
    // The change starts from the size the body was, a touch shrunk, and
    // swells past the new size before it settles.
    this.scaleNow = Math.min(this.scaleNow, target) * 0.9;
    this.scaleVel = 0;
    this.hasLast = false;
  }

  /** Call after the hero is re-dressed: new gear must not show through the pelt. */
  reapply(ownHidden: Set<string>): void {
    if (this.form) this.hideSelf();
    else if (this.hiddenSelf) this.showSelf(ownHidden);
  }

  private hideSelf(): void {
    const rig = this.hero.rig;
    for (const o of rig.root.children) {
      if (o.userData.beastForm || (o as THREE.Bone).isBone) continue;
      o.visible = false;
    }
    for (const s of Object.values(rig.sockets)) s.visible = false;
    this.hiddenSelf = true;
  }

  private showSelf(ownHidden: Set<string>): void {
    const rig = this.hero.rig;
    for (const o of rig.root.children) {
      if (o.userData.beastForm || (o as THREE.Bone).isBone) continue;
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const part = o.name.split(':')[1] ?? '';
        o.visible = !ownHidden.has(part.split('-')[0]!);
      } else {
        o.visible = true;
      }
    }
    for (const s of Object.values(rig.sockets)) s.visible = true;
    this.hiddenSelf = false;
  }

  /**
   * Meshes the forms a little at a time while nothing is happening, so the
   * first change in a fight costs no frame. Each form is a few hundred
   * milliseconds on a slow machine; one per idle slot.
   */
  prewarm(): void {
    if (this.prewarmed) return;
    this.prewarmed = true;
    const shape = this.hero.rig.shape;
    const todo = BEAST_FORMS.filter((f) => !beastReady(f, shape));
    const idle: (cb: () => void) => void =
      typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb, { timeout: 4000 }) : (cb) => setTimeout(cb, 300);
    const next = () => {
      const f = todo.shift();
      if (!f) return;
      try {
        this.build(f);
      } catch {
        // A form that fails to mesh here meshes (or fails) on first use.
      }
      if (todo.length) idle(next);
    };
    if (todo.length) idle(next);
    else for (const f of BEAST_FORMS) this.build(f);
  }

  /** Root scale and the tail. Call once a frame after the animator. */
  update(dt: number): void {
    const target = this.form ? BEAST_BUILD[this.form].scale * this.extra : 1;
    this.animator.bodyScale = target;
    if (Math.abs(this.scaleNow - target) > 1e-4 || Math.abs(this.scaleVel) > 1e-4) {
      // A stiff spring, a little under-damped: the swell overshoots once.
      const k = 260;
      const c = 2 * Math.sqrt(k) * 0.55;
      const step = Math.min(dt, 1 / 30);
      this.scaleVel += (k * (target - this.scaleNow) - c * this.scaleVel) * step;
      this.scaleNow += this.scaleVel * step;
      if (Math.abs(this.scaleNow - target) < 1e-4 && Math.abs(this.scaleVel) < 1e-3) {
        this.scaleNow = target;
        this.scaleVel = 0;
      }
      this.hero.rig.root.scale.setScalar(this.scaleNow);
    }
    if (!this.form) return;
    const w = this.worn.get(this.form);
    if (!w) return;
    this.t += dt;
    const M = TAIL_MOTION[this.form];
    const pelvis = this.hero.rig.bones.pelvis;
    pelvis.getWorldPosition(_p);
    if (this.hasLast && dt > 0) {
      const d = _p.clone().sub(this.lastPelvis).divideScalar(dt);
      pelvis.getWorldQuaternion(_q);
      d.applyQuaternion(_q.invert());
      const a = 1 - Math.exp(-dt * 6);
      this.vel.x += (Math.max(-6, Math.min(6, d.x)) - this.vel.x) * a;
      this.vel.y += (Math.max(-8, Math.min(8, d.z)) - this.vel.y) * a;
    }
    this.lastPelvis.copy(_p);
    this.hasLast = true;
    const speed = Math.min(1, Math.max(0, this.vel.y) / 5);
    const droop = TAIL_SHAPE[this.form].droop * (1 - M.lift * speed);
    const side = -this.vel.x * 0.08 * M.swing;
    for (let i = 0; i < w.tail.length; i++) {
      const b = w.tail[i]!;
      const u = i / (w.tail.length - 1);
      const wave = Math.sin(this.t * M.rate * Math.PI * 2 - i * 0.7) * M.sway * (0.4 + u) * (1 - 0.6 * speed);
      if (i === 0) {
        b.rotation.set(-droop, side + wave, 0);
      } else {
        // The tip curls up; at a run the curl straightens out.
        b.rotation.set(M.curl * u * (1 - 0.7 * speed), wave + side * 0.4, 0);
      }
    }
  }

  dispose(): void {
    for (const w of this.worn.values()) {
      w.tailBase.removeFromParent();
      w.group.removeFromParent();
      w.group.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh && !m.geometry.userData.cached) m.geometry.dispose();
      });
    }
    this.worn.clear();
  }
}
