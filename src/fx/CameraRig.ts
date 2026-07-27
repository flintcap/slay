/**
 * SLAY — the ARPG camera and everything that makes a hit feel like a hit.
 *
 * Game feel is mostly camera. This rig owns:
 *
 *  - a critically-damped follow so the camera never overshoots or rubber-bands;
 *  - cursor look-ahead, clamped, so aiming reveals what you are aiming at
 *    without the view sliding off the player;
 *  - wall collision — a slab test against the dungeon's AABB colliders, pulling
 *    in fast and pushing back out slowly so doorways do not strobe;
 *  - **trauma-based screen shake**: callers add trauma, the rig shakes by
 *    `trauma²` sampled from simplex noise. Squaring makes small hits barely
 *    register and heavy hits slam, and the decay is naturally non-linear. A
 *    sine wave would read as a mechanical wobble; noise reads as impact;
 *  - hit-stop and slow motion, exposed as a `timeScale` the scene multiplies
 *    its own dt by, so gameplay, animation and FX all dilate together;
 *  - a boss punch-in (dolly + FOV) and a slow menu orbit.
 *
 * The rig subscribes to the `shake` event on the bus, so any system can ask for
 * a shake without holding a camera reference.
 */

import * as THREE from 'three';
import { events } from '../core/Events';
import { Noise, clamp01, lerp } from '../art/Noise';
import type { GameSettings } from '../types';

export interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface CameraRigOptions {
  /** Base boom length in world units, before the settings multiplier. */
  distance?: number;
  /** Downward pitch in radians. ~0.92 gives the classic three-quarter view. */
  pitch?: number;
  /** Yaw in radians. */
  yaw?: number;
  fov?: number;
  near?: number;
  far?: number;
  /** How far the view leans toward the cursor, as a fraction of the offset. */
  lookAhead?: number;
  /** Maximum look-ahead distance in world units. */
  lookAheadMax?: number;
  /** Follow stiffness — higher is snappier. */
  stiffness?: number;
}

const DEFAULTS: Required<CameraRigOptions> = {
  distance: 15.5,
  pitch: 0.92,
  yaw: Math.PI * 0.25,
  fov: 46,
  near: 0.35,
  far: 260,
  lookAhead: 0.3,
  lookAheadMax: 4.2,
  stiffness: 9.5,
};

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * Slab test: distance along `dir` (unit) from `ox,oz` at which the ray enters
 * the AABB, or -1 for a miss. The camera boom only cares about XZ; dungeon
 * walls are full-height, so a 2D test is both correct and much cheaper.
 */
function rayBoxXZ(
  ox: number, oz: number,
  dx: number, dz: number,
  cx: number, cz: number, hw: number, hd: number,
  maxT: number,
): number {
  let tmin = 0;
  let tmax = maxT;

  if (Math.abs(dx) < 1e-6) {
    if (ox < cx - hw || ox > cx + hw) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (cx - hw - ox) * inv;
    let t2 = (cx + hw - ox) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  if (Math.abs(dz) < 1e-6) {
    if (oz < cz - hd || oz > cz + hd) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (cz - hd - oz) * inv;
    let t2 = (cz + hd - oz) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  return tmin;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private opts: Required<CameraRigOptions>;

  /** Where the rig is asked to look. */
  private goal = new THREE.Vector3();
  /** Where it is actually looking, after smoothing. */
  private smooth = new THREE.Vector3();
  private smoothVel = new THREE.Vector3();
  private cursor = new THREE.Vector3();
  private hasCursor = false;
  private leadOffset = new THREE.Vector3();

  private colliders: Collider[] = [];
  /** Current boom length after collision pull-in. */
  private boom: number;
  private boomTarget: number;

  // --- shake -------------------------------------------------------------
  private trauma = 0;
  private traumaDecay = 1.35;
  private noise = new Noise(0xca77);
  private shakeTime = 0;
  private shakeIntensity = 1;
  /** Extra sustained trauma floor, e.g. while a boss is charging. */
  private rumble = 0;

  // --- time -------------------------------------------------------------
  private hitStopLeft = 0;
  private hitStopScale = 0;
  private slowLeft = 0;
  private slowTotal = 0;
  private slowScale = 1;
  private easeBack = 0;
  /** The dt multiplier for this frame. */
  timeScale = 1;

  // --- framing ----------------------------------------------------------
  private punch = 0;
  private punchLeft = 0;
  private punchTotal = 0;
  private distanceMul = 1;
  private zoomBias = 0;

  private orbitOn = false;
  private orbitSpeed = 0.09;
  private orbitYaw = 0;
  private orbitBob = 0;

  private unsubs: Array<() => void> = [];

  constructor(opts: CameraRigOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.camera = new THREE.PerspectiveCamera(
      this.opts.fov,
      window.innerWidth / Math.max(1, window.innerHeight),
      this.opts.near,
      this.opts.far,
    );
    this.boom = this.opts.distance;
    this.boomTarget = this.opts.distance;
    this.camera.position.set(0, this.opts.distance, this.opts.distance);
    this.camera.lookAt(0, 0, 0);

    this.unsubs.push(
      events.on('shake', ({ amount, duration }) => this.shake(amount, duration)),
      events.on('boss:engaged', () => {
        this.punchIn(0.16, 1.5);
        this.shake(0.35, 0.5);
      }),
      events.on('boss:killed', () => {
        this.slowMo(0.35, 1.4);
        this.punchIn(0.1, 1.8);
      }),
    );
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.updateProjectionMatrix();
  };

  // -- configuration --------------------------------------------------------

  /** `cameraDistance` is a 0.6..1.6 multiplier; `screenShake` scales trauma. */
  applySettings(settings: GameSettings): void {
    this.distanceMul = THREE.MathUtils.clamp(settings.cameraDistance || 1, 0.5, 2);
    this.shakeIntensity = THREE.MathUtils.clamp(settings.screenShake ?? 1, 0, 2);
  }

  setAngles(yaw: number, pitch: number): void {
    this.opts.yaw = yaw;
    this.opts.pitch = THREE.MathUtils.clamp(pitch, 0.25, 1.45);
  }

  get yaw(): number {
    return this.opts.yaw;
  }

  get pitch(): number {
    return this.opts.pitch;
  }

  /** Player-driven zoom, in the same units as the boom. Clamped. */
  zoom(delta: number): void {
    this.zoomBias = THREE.MathUtils.clamp(this.zoomBias + delta, -6, 9);
  }

  setColliders(list: Collider[]): void {
    this.colliders = list;
  }

  // -- targeting ------------------------------------------------------------

  setTarget(x: number, y: number, z: number): void {
    this.goal.set(x, y, z);
  }

  follow(obj: THREE.Object3D): void {
    obj.getWorldPosition(_tmp);
    this.goal.copy(_tmp);
  }

  /** World point under the cursor; drives look-ahead. Pass null to disable. */
  setCursor(p: THREE.Vector3 | null): void {
    if (p) {
      this.cursor.copy(p);
      this.hasCursor = true;
    } else {
      this.hasCursor = false;
    }
  }

  /** Teleports the camera to its goal — use after a scene load or a warp. */
  snap(): void {
    this.smooth.copy(this.goal);
    this.smoothVel.set(0, 0, 0);
    this.leadOffset.set(0, 0, 0);
    this.boom = this.currentDistance();
    this.boomTarget = this.boom;
    this.placeCamera(0, 0, 0, 0);
  }

  // -- feel -----------------------------------------------------------------

  /**
   * Adds trauma. Amount is in "hit units": 0.15 is a light sword hit, 0.35 a
   * crit, 0.7 a boss slam, 1.0 saturates. Trauma accumulates so a flurry of
   * hits builds rather than each one restarting the shake.
   */
  addTrauma(amount: number): void {
    this.trauma = clamp01(this.trauma + amount * this.shakeIntensity);
  }

  /** Bus-compatible shake: `amount` 0..1, `duration` tunes the decay rate. */
  shake(amount: number, duration = 0.35): void {
    this.addTrauma(amount);
    // Longer requested durations decay more slowly.
    this.traumaDecay = THREE.MathUtils.clamp(1 / Math.max(0.08, duration), 0.6, 6);
  }

  /** A sustained low-level rumble, 0..1. Set to 0 to stop. */
  setRumble(v: number): void {
    this.rumble = clamp01(v);
  }

  /**
   * Freezes time briefly. This is the single cheapest way to make a heavy hit
   * feel heavy: 40-90ms at scale 0.05 reads as the world flinching.
   */
  hitStop(duration = 0.06, scale = 0.04): void {
    if (duration > this.hitStopLeft) {
      this.hitStopLeft = duration;
      this.hitStopScale = scale;
    }
  }

  /** Longer, eased time dilation — boss kills, last-hit slow motion. */
  slowMo(scale = 0.35, duration = 1.0): void {
    this.slowLeft = Math.max(this.slowLeft, duration);
    this.slowTotal = Math.max(this.slowTotal, duration);
    this.slowScale = Math.min(this.slowScale, scale);
  }

  clearTimeEffects(): void {
    this.hitStopLeft = 0;
    this.slowLeft = 0;
    this.slowScale = 1;
    this.easeBack = 0;
    this.timeScale = 1;
  }

  /** Dolly + FOV punch. `amount` is a fraction of the boom (0.15 is strong). */
  punchIn(amount: number, duration = 1.2): void {
    this.punch = Math.max(this.punch, amount);
    this.punchLeft = Math.max(this.punchLeft, duration);
    this.punchTotal = Math.max(this.punchTotal, duration);
  }

  /** Slow orbit for menus and the character-select turntable. */
  setOrbit(on: boolean, speed = 0.09): void {
    this.orbitOn = on;
    this.orbitSpeed = speed;
  }

  // -- frame ----------------------------------------------------------------

  private currentDistance(): number {
    return Math.max(4, (this.opts.distance * this.distanceMul + this.zoomBias) * (1 - this.punchAmount()));
  }

  private punchAmount(): number {
    if (this.punchLeft <= 0 || this.punchTotal <= 0) return 0;
    const t = 1 - this.punchLeft / this.punchTotal;
    // Fast in, slow out — a snap toward the boss then a gentle release.
    const env = t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 1.6);
    return this.punch * clamp01(env);
  }

  /**
   * Advances the rig. Returns the **scaled** delta the caller should use for
   * gameplay, animation and FX, so hit-stop dilates the whole world at once.
   */
  update(rawDt: number, elapsed: number): number {
    // --- time dilation -----------------------------------------------------
    let scale = 1;
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= rawDt;
      scale = this.hitStopScale;
      if (this.hitStopLeft <= 0) this.easeBack = 0.07;
    } else if (this.easeBack > 0) {
      this.easeBack -= rawDt;
      scale = lerp(this.hitStopScale, 1, clamp01(1 - this.easeBack / 0.07));
    }
    if (this.slowLeft > 0) {
      this.slowLeft -= rawDt;
      const t = 1 - clamp01(this.slowLeft / Math.max(this.slowTotal, 1e-3));
      // Ease in over the first 12%, hold, then ease back over the last 35%.
      const env = t < 0.12 ? t / 0.12 : t > 0.65 ? clamp01((1 - t) / 0.35) : 1;
      scale = Math.min(scale, lerp(1, this.slowScale, env));
      if (this.slowLeft <= 0) {
        this.slowScale = 1;
        this.slowTotal = 0;
      }
    }
    this.timeScale = scale;
    const dt = rawDt * scale;
    // The camera itself runs on a partially dilated clock: fully frozen camera
    // motion during hit-stop looks broken, fully live motion breaks the freeze.
    const camDt = rawDt * lerp(1, scale, 0.55);

    // --- orbit -------------------------------------------------------------
    if (this.orbitOn) {
      this.orbitYaw += this.orbitSpeed * rawDt;
      this.orbitBob = Math.sin(elapsed * 0.35) * 0.06;
    }

    // --- follow ------------------------------------------------------------
    // Critically damped spring: no overshoot, frame-rate independent.
    const k = this.opts.stiffness;
    const step = Math.min(camDt, 1 / 30);
    _tmp.copy(this.goal).sub(this.smooth).multiplyScalar(k * k * step);
    this.smoothVel.add(_tmp);
    _tmp.copy(this.smoothVel).multiplyScalar(2 * k * step);
    this.smoothVel.sub(_tmp);
    _tmp.copy(this.smoothVel).multiplyScalar(step);
    this.smooth.add(_tmp);

    // --- look-ahead --------------------------------------------------------
    if (this.hasCursor && this.opts.lookAhead > 0) {
      _look.copy(this.cursor).sub(this.smooth);
      _look.y = 0;
      const len = _look.length();
      if (len > 1e-3) {
        _look.multiplyScalar(Math.min(len * this.opts.lookAhead, this.opts.lookAheadMax) / len);
      } else {
        _look.set(0, 0, 0);
      }
    } else {
      _look.set(0, 0, 0);
    }
    this.leadOffset.lerp(_look, 1 - Math.exp(-3.2 * camDt));

    _target.copy(this.smooth).add(this.leadOffset);
    _target.y += 0.9; // aim a little above the floor so the player sits low

    // --- boom + collision --------------------------------------------------
    const yaw = this.opts.yaw + (this.orbitOn ? this.orbitYaw : 0);
    const pitch = this.opts.pitch + (this.orbitOn ? this.orbitBob : 0);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    _dir.set(Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp);

    const want = this.currentDistance();
    let allowed = want;
    if (this.colliders.length > 0) {
      // Test in XZ only; walls are full height and the boom always rises.
      const hx = _dir.x;
      const hz = _dir.z;
      const hLen = Math.hypot(hx, hz);
      if (hLen > 1e-4) {
        const dx = hx / hLen;
        const dz = hz / hLen;
        const maxT = want * hLen;
        let nearest = maxT;
        const ox = _target.x;
        const oz = _target.z;
        for (let i = 0; i < this.colliders.length; i++) {
          const c = this.colliders[i]!;
          const t = rayBoxXZ(ox, oz, dx, dz, c.x, c.z, c.w * 0.5 + 0.35, c.d * 0.5 + 0.35, nearest);
          if (t >= 0 && t < nearest) nearest = t;
        }
        if (nearest < maxT) allowed = Math.max(3.2, nearest / hLen);
      }
    }
    this.boomTarget = allowed;
    // Snap in fast so a wall never clips; ease out slowly so a doorway does
    // not cause the view to pump.
    const inRate = 1 - Math.exp(-18 * camDt);
    const outRate = 1 - Math.exp(-3.5 * camDt);
    this.boom += (this.boomTarget - this.boom) * (this.boomTarget < this.boom ? inRate : outRate);

    // --- shake -------------------------------------------------------------
    if (this.punchLeft > 0) this.punchLeft = Math.max(0, this.punchLeft - rawDt);
    this.trauma = Math.max(this.rumble * 0.4, this.trauma - this.traumaDecay * rawDt);
    this.shakeTime += rawDt;

    let shakeX = 0;
    let shakeY = 0;
    let shakeRoll = 0;
    const t2 = this.trauma * this.trauma;
    if (t2 > 1e-4) {
      const f = 22 + 16 * this.trauma;
      const st = this.shakeTime * f;
      shakeX = this.noise.simplex2(st, 0.0) * t2 * 0.5;
      shakeY = this.noise.simplex2(st, 37.5) * t2 * 0.42;
      shakeRoll = this.noise.simplex2(st, 91.2) * t2 * 0.055;
    }

    this.placeCamera(shakeX, shakeY, shakeRoll, camDt);
    return dt;
  }

  private placeCamera(shakeX: number, shakeY: number, shakeRoll: number, camDt: number): void {
    const yaw = this.opts.yaw + (this.orbitOn ? this.orbitYaw : 0);
    const pitch = this.opts.pitch + (this.orbitOn ? this.orbitBob : 0);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    _dir.set(Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp);

    _desired.copy(_target).addScaledVector(_dir, this.boom);
    this.camera.position.copy(_desired);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(_target);

    // Shake is applied in camera space so it always reads as screen motion,
    // independent of the yaw the player is viewing from.
    if (shakeX !== 0 || shakeY !== 0) {
      _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(_right, shakeX);
      this.camera.position.addScaledVector(_up, shakeY);
      this.camera.lookAt(
        _target.x + _right.x * shakeX * 0.25,
        _target.y + _up.y * shakeY * 0.25,
        _target.z + _right.z * shakeX * 0.25,
      );
    }
    if (shakeRoll !== 0) this.camera.rotateZ(shakeRoll);

    // Punch-in also tightens the FOV a touch — a pure dolly reads as a zoom,
    // dolly plus FOV reads as the world leaning in.
    const targetFov = this.opts.fov * (1 - this.punchAmount() * 0.32);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = camDt > 0 ? lerp(this.camera.fov, targetFov, 1 - Math.exp(-9 * camDt)) : targetFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Where the rig is currently looking — useful for ambient FX focus. */
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.smooth);
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    window.removeEventListener('resize', this.onResize);
  }
}
