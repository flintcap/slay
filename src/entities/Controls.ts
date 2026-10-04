/**
 * SLAY — combat controls.
 *
 * Everything between "the player pressed something" and "the player's body did
 * something" lives here, so it can be tested without a browser and tuned
 * without touching the scene. The scene builds one of these, hands it a few
 * hooks into the skill runner, and calls `update` once a frame.
 *
 * What it guarantees, in the order a player would notice:
 *
 * 1. **No dropped presses.** A press that lands while the hero is mid-swing is
 *    held in a short buffer and fires the moment the swing ends. A click that
 *    goes down and up inside one frame still counts. Hotbar keys, potions and
 *    the dodge keep working while the cursor is over the HUD; only the mouse
 *    buttons are claimed by panels.
 * 2. **Hold to attack, hold to cast.** Holding the attack button or a hotbar key
 *    keeps acting whenever the hero is free, without spamming "not enough mana"
 *    toasts on every retry.
 * 3. **Attack-move and target lock.** Clicking a monster out of reach walks to
 *    it and strikes once on arrival, even if the button is already up. Holding
 *    the button keeps the same target even when the cursor wanders off it, and
 *    picks the next one under the cursor when it dies.
 * 4. **Force-stand.** Shift plants your feet: the attack fires where you aim
 *    instead of walking anywhere, and Shift with the left button attacks too.
 * 5. **Evade.** The dodge cancels any attack recovery, so it is always an
 *    answer to a telegraph; pressed a moment early it still fires.
 *
 * Nothing here decides *whether* a hit lands or how it looks. It only decides
 * when the player's intent is turned into an action.
 */

import * as THREE from 'three';
import type { Player } from './Player';
import type { Enemy } from './Enemy';
import { getSkill } from '../data/skills';
import { skillRank } from '../sim/Character';

/** The slice of `core/Input` the controller reads. */
export interface ControlInput {
  readonly worldPoint: THREE.Vector3;
  mouseLeft: boolean;
  mouseRight: boolean;
  mouseLeftPressed: boolean;
  mouseRightPressed: boolean;
  pointerOverUI: boolean;
  pointerOverClickable: boolean;
  keyDown(code: string): boolean;
  keyPressed(code: string): boolean;
  wasPressed(action: 'potionLife' | 'potionMana' | 'dodge'): boolean;
}

/** What the scene lets the controller do. */
export interface ControlHooks {
  /** Fires a skill at a point. False when it could not. */
  cast(skillId: string, target: THREE.Vector3): boolean;
  /** The free basic attack. */
  basic(target: THREE.Vector3): boolean;
  /** True while the hero is fighting in melee (or bare-handed). */
  melee(): boolean;
  /** Runs after any attack button swing (breaks barrels and the like). */
  afterSwing?(target: THREE.Vector3): void;
  drink(kind: 'life' | 'mana'): void;
  /** Called after a successful dodge, for camera and sound. */
  dodged?(): void;
}

/** How long a press waits for the hero to be free before it is dropped. */
export const BUFFER_WINDOW = 0.45;
/** How far a melee swing reaches, measured from the target's body edge. */
export const MELEE_REACH = 1.9;
/** How long attack-move keeps chasing a target after the click. */
const PURSUIT_TIME = 4;
/** Extra pick radius on a fresh click, on top of the monster's own body. */
const PICK_SLACK = 1.1;
/** A wider net, used only when nothing is directly under the cursor. */
const ASSIST_SLACK = 2.2;

type Queued =
  | { kind: 'primary'; until: number }
  | { kind: 'skill'; id: string; until: number }
  | { kind: 'dodge'; until: number };

interface Pursuit {
  target: Enemy;
  /** Skill to fire on arrival, or null for the attack button. */
  skill: string | null;
  until: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Skill effect families that have to be in arm's reach to land. */
function needsReach(skillId: string | null): boolean {
  if (skillId === null) return true;
  const def = getSkill(skillId);
  if (!def) return false;
  const family = (def.effect ?? 'melee').split('.')[0] ?? 'melee';
  return family === 'melee' || family === 'cleave' || family === 'whirlwind';
}

export class CombatControls {
  /** World-space keyboard direction this frame, rotated to the camera. */
  readonly keyDir = new THREE.Vector3();

  private time = 0;
  private queued: Queued | null = null;
  private lock: Enemy | null = null;
  private pursuit: Pursuit | null = null;
  private readonly aim = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  /** Diagnostics for the checkers: what happened to presses this session. */
  readonly stats = { buffered: 0, bufferedFired: 0, bufferedExpired: 0, pursuits: 0, pursuitStrikes: 0 };

  constructor(
    private readonly player: Player,
    private readonly hooks: ControlHooks,
  ) {}

  /** The monster the attack button is currently locked onto, if any. */
  get lockedTarget(): Enemy | null {
    return this.lock;
  }

  /** What is waiting in the input buffer, for the HUD or a checker. */
  get pending(): string | null {
    if (!this.queued) return null;
    return this.queued.kind === 'skill' ? this.queued.id : this.queued.kind;
  }

  /** Forget everything in flight. Used on level change and death. */
  reset(): void {
    this.queued = null;
    this.lock = null;
    this.pursuit = null;
    this.keyDir.set(0, 0, 0);
  }

  update(dt: number, input: ControlInput, cameraYaw: number, enemies: readonly Enemy[], boss: Enemy | null): void {
    this.time += dt;
    const p = this.player;

    // --- keyboard movement -------------------------------------------------
    this.keyDir.set(0, 0, 0);
    if (input.keyDown('KeyW') || input.keyDown('ArrowUp')) this.keyDir.z -= 1;
    if (input.keyDown('KeyS') || input.keyDown('ArrowDown')) this.keyDir.z += 1;
    if (input.keyDown('KeyA') || input.keyDown('ArrowLeft')) this.keyDir.x -= 1;
    if (input.keyDown('KeyD') || input.keyDown('ArrowRight')) this.keyDir.x += 1;
    const keyMoving = this.keyDir.lengthSq() > 0;
    if (keyMoving) {
      this.keyDir.applyAxisAngle(UP, cameraYaw);
      // Steering by hand overrides any walk-to-attack in progress.
      this.pursuit = null;
    }

    if (!p.alive) {
      this.reset();
      return;
    }

    const stand = input.keyDown('ShiftLeft') || input.keyDown('ShiftRight');
    const mouseFree = !input.pointerOverUI;
    const rightHeld = input.mouseRight || input.mouseRightPressed;
    if (!rightHeld) this.lock = null;
    if (this.lock && !this.lock.alive) this.lock = null;

    // --- left button: move, or attack in place with Shift ------------------
    // A click that went down and came back up inside one frame still counts.
    const leftHeld = input.mouseLeft || input.mouseLeftPressed;
    if (mouseFree && leftHeld && !input.pointerOverClickable) {
      if (stand) {
        this.requestPrimary(input, enemies, boss, input.mouseLeftPressed, true);
      } else if (!keyMoving) {
        this.pursuit = null;
        p.moveTo(input.worldPoint.x, input.worldPoint.z);
      }
    }

    // --- right button: the attack button ------------------------------------
    if (mouseFree && rightHeld) {
      this.requestPrimary(input, enemies, boss, input.mouseRightPressed, stand);
    }

    // --- hotbar: press to cast, hold to keep casting ------------------------
    const bar = p.character.hotbar;
    for (let i = 0; i < 6; i++) {
      const id = bar[i];
      if (!id) continue;
      const code = `Digit${i + 1}`;
      const fresh = input.keyPressed(code);
      if (!fresh && !input.keyDown(code)) continue;
      this.requestSkill(id, input, enemies, boss, fresh, stand);
    }

    // --- potions and dodge never wait on the cursor -------------------------
    if (input.wasPressed('potionLife')) this.hooks.drink('life');
    if (input.wasPressed('potionMana')) this.hooks.drink('mana');
    if (input.wasPressed('dodge')) this.requestDodge(input);

    // --- the buffer and the chase --------------------------------------------
    this.drainQueue(input, enemies, boss);
    this.tickPursuit();
  }

  // -------------------------------------------------------------------------

  /**
   * The target a click means. A fresh click takes whatever is nearest the
   * cursor and locks it; holding the button keeps the lock even when the
   * cursor drifts off the monster, which is what makes a moving pack hittable.
   */
  private resolveTarget(input: ControlInput, enemies: readonly Enemy[], boss: Enemy | null, fresh: boolean): Enemy | null {
    if (!fresh && this.lock?.alive) return this.lock;
    const picked = pickNear(input.worldPoint, enemies, boss, PICK_SLACK) ?? pickNear(input.worldPoint, enemies, boss, ASSIST_SLACK);
    this.lock = picked;
    return picked;
  }

  private aimAt(input: ControlInput, target: Enemy | null): THREE.Vector3 {
    if (target) return this.aim.copy(target.root.position).setY(0);
    return this.aim.copy(input.worldPoint).setY(0);
  }

  private gapTo(target: Enemy): number {
    const d = this.tmp.subVectors(target.root.position, this.player.position).setY(0).length();
    return d - target.hitRadius;
  }

  private requestPrimary(
    input: ControlInput,
    enemies: readonly Enemy[],
    boss: Enemy | null,
    fresh: boolean,
    stand: boolean,
  ): void {
    const p = this.player;
    const target = this.resolveTarget(input, enemies, boss, fresh);

    // Attack-move: out of reach in melee, walk in and strike on arrival. Only
    // with a monster to walk to; clicking bare ground still swings on the spot
    // rather than turning the attack button into a second move key.
    if (target && !stand && this.hooks.melee() && this.gapTo(target) > MELEE_REACH) {
      this.beginPursuit(target, null);
      return;
    }
    if (p.isBusy) {
      if (fresh) this.enqueue({ kind: 'primary', until: this.time + BUFFER_WINDOW });
      return;
    }
    this.pursuit = null;
    this.firePrimary(this.aimAt(input, target), fresh);
  }

  private firePrimary(point: THREE.Vector3, fresh: boolean): boolean {
    const assigned = this.player.character.primaryAttack;
    let acted = false;
    // Held retries skip a skill that cannot fire, so being out of mana falls
    // through to the basic attack quietly instead of toasting every swing. A
    // fresh press still goes through `cast` so the player hears why.
    if (assigned && (fresh || this.skillReady(assigned))) {
      acted = this.hooks.cast(assigned, point);
    }
    if (!acted) acted = this.hooks.basic(point);
    this.hooks.afterSwing?.(point);
    return acted;
  }

  private requestSkill(
    id: string,
    input: ControlInput,
    enemies: readonly Enemy[],
    boss: Enemy | null,
    fresh: boolean,
    stand: boolean,
  ): void {
    const p = this.player;
    const target = pickNear(input.worldPoint, enemies, boss, PICK_SLACK);
    if (target && fresh && !stand && needsReach(id) && this.hooks.melee() && this.gapTo(target) > MELEE_REACH) {
      this.beginPursuit(target, id);
      return;
    }
    if (p.isBusy) {
      if (fresh) this.enqueue({ kind: 'skill', id, until: this.time + BUFFER_WINDOW });
      return;
    }
    if (!fresh && !this.skillReady(id)) return;
    // Pressed a beat before the cooldown came back: hold it rather than drop it.
    if (fresh && p.isOnCooldown(id)) {
      if (p.cooldownRemaining(id) <= BUFFER_WINDOW) {
        this.enqueue({ kind: 'skill', id, until: this.time + BUFFER_WINDOW });
      }
      return;
    }
    this.pursuit = null;
    this.hooks.cast(id, this.aimAt(input, target));
  }

  private requestDodge(input: ControlInput): void {
    if (this.tryDodge(input)) return;
    // Spent a moment ago, or mid-dash: keep the press if it would come good soon.
    if (this.player.dodgeReadyIn <= BUFFER_WINDOW) {
      this.enqueue({ kind: 'dodge', until: this.time + BUFFER_WINDOW });
    }
  }

  private tryDodge(input: ControlInput): boolean {
    const p = this.player;
    const d = this.tmp.subVectors(input.worldPoint, p.position).setY(0);
    if (this.keyDir.lengthSq() > 0) d.copy(this.keyDir);
    if (d.lengthSq() < 1e-4) d.set(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
    if (!p.dodge(d.x, d.z)) return false;
    this.pursuit = null;
    this.hooks.dodged?.();
    return true;
  }

  private enqueue(q: Queued): void {
    // Latest intent wins. A dodge is never overwritten by an attack, though:
    // mashing attack while trying to escape must not eat the escape.
    if (this.queued?.kind === 'dodge' && q.kind !== 'dodge') return;
    if (!this.queued) this.stats.buffered++;
    this.queued = q;
  }

  private drainQueue(input: ControlInput, enemies: readonly Enemy[], boss: Enemy | null): void {
    const q = this.queued;
    if (!q) return;
    if (this.time > q.until) {
      this.queued = null;
      this.stats.bufferedExpired++;
      return;
    }
    const p = this.player;
    let fired = false;
    if (q.kind === 'dodge') {
      fired = this.tryDodge(input);
    } else if (!p.isBusy) {
      if (q.kind === 'primary') {
        const target = this.lock?.alive ? this.lock : pickNear(input.worldPoint, enemies, boss, PICK_SLACK);
        fired = this.firePrimary(this.aimAt(input, target), true);
      } else if (!p.isOnCooldown(q.id)) {
        const target = pickNear(input.worldPoint, enemies, boss, PICK_SLACK);
        fired = this.hooks.cast(q.id, this.aimAt(input, target));
        // A refusal for any reason but timing (mana, wrong weapon) is final.
        if (!fired) {
          this.queued = null;
          return;
        }
      }
    }
    if (fired) {
      this.queued = null;
      this.stats.bufferedFired++;
    }
  }

  private beginPursuit(target: Enemy, skill: string | null): void {
    if (this.pursuit?.target !== target || this.pursuit.skill !== skill) this.stats.pursuits++;
    this.pursuit = { target, skill, until: this.time + PURSUIT_TIME };
    this.player.moveTo(target.root.position.x, target.root.position.z);
  }

  private tickPursuit(): void {
    const chase = this.pursuit;
    if (!chase) return;
    const p = this.player;
    if (!chase.target.alive || this.time > chase.until) {
      this.pursuit = null;
      return;
    }
    if (this.gapTo(chase.target) > MELEE_REACH) {
      // Keep steering at it as it moves.
      p.moveTo(chase.target.root.position.x, chase.target.root.position.z);
      return;
    }
    if (p.isBusy) return;
    const point = this.aim.copy(chase.target.root.position).setY(0);
    p.stop();
    const acted = chase.skill ? this.hooks.cast(chase.skill, point) : this.firePrimary(point, true);
    this.pursuit = null;
    if (acted) this.stats.pursuitStrikes++;
  }

  private skillReady(id: string): boolean {
    const p = this.player;
    if (skillRank(p.character, id) <= 0) return false;
    if (p.isOnCooldown(id)) return false;
    const def = getSkill(id);
    if (!def || def.targeting === 'passive') return false;
    const cost = def.manaCost ? def.manaCost(skillRank(p.character, id)) : 0;
    if (cost <= 0 || p.mana >= cost) return true;
    // Crimson Covenant pays the shortfall in life.
    return p.passives.lifePerMana > 0 && p.life > (cost - p.mana) * p.passives.lifePerMana;
  }
}

/**
 * The living monster nearest a ground point, within its body plus `slack`.
 * Allocation-free: it runs every frame a button is held.
 */
export function pickNear(point: THREE.Vector3, enemies: readonly Enemy[], boss: Enemy | null, slack: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  const gx = point.x;
  const gz = point.z;
  const consider = (t: Enemy, extra: number): void => {
    if (!t.alive || t.life <= 0) return;
    const dx = t.root.position.x - gx;
    const dz = t.root.position.z - gz;
    const d2 = dx * dx + dz * dz;
    const grab = t.hitRadius + slack + extra;
    if (d2 < grab * grab && d2 < bestD) {
      bestD = d2;
      best = t;
    }
  };
  for (let i = 0; i < enemies.length; i++) consider(enemies[i]!, 0);
  if (boss) consider(boss, 0.3);
  return best;
}
