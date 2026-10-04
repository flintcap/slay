/**
 * Entry point for `tools/check-controls.mjs`.
 *
 * Drives the real `CombatControls` and the real `Player` through scripted
 * presses, frame by frame, and reports whether each intent became an action.
 * The skill runner is replaced by hooks that obey the same contract (refuse
 * while busy, on cooldown or short of mana), so what is under test is only the
 * part between the button and the body.
 */
import * as THREE from 'three';
import { Player } from '../src/entities/Player';
import { CombatControls, type ControlInput } from '../src/entities/Controls';
import { Enemy } from '../src/entities/Enemy';
import { MONSTERS } from '../src/data/monsters';
import { createCharacter, setPrimaryAttack, skillRank } from '../src/sim/Character';
import { getSkill } from '../src/data/skills';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';

const DT = 1 / 60;

class FakeInput implements ControlInput {
  readonly worldPoint = new THREE.Vector3();
  mouseLeft = false;
  mouseRight = false;
  mouseLeftPressed = false;
  mouseRightPressed = false;
  pointerOverUI = false;
  pointerOverClickable = false;
  down = new Set<string>();
  pressed = new Set<string>();
  keyDown(code: string): boolean {
    return this.down.has(code);
  }
  keyPressed(code: string): boolean {
    return this.pressed.has(code);
  }
  wasPressed(action: 'potionLife' | 'potionMana' | 'dodge'): boolean {
    const code = action === 'dodge' ? 'Space' : action === 'potionLife' ? 'KeyQ' : 'KeyF';
    return this.pressed.has(code);
  }
  tap(code: string): void {
    this.pressed.add(code);
  }
  hold(code: string): void {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }
  release(code: string): void {
    this.down.delete(code);
  }
  endFrame(): void {
    this.pressed.clear();
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
  }
}

interface Log {
  casts: Array<{ id: string; t: number; x: number; z: number }>;
  basics: Array<{ t: number; x: number; z: number }>;
  refusals: number;
  drinks: number;
  dodges: number;
}

function world(classId: 'warden' | 'pyromancer' = 'warden') {
  const c = createCharacter('Test', classId, new Random(1));
  const player = new Player(c, 1);
  const input = new FakeInput();
  const log: Log = { casts: [], basics: [], refusals: 0, drinks: 0, dodges: 0 };
  let t = 0;
  let melee = classId === 'warden';
  const controls = new CombatControls(player, {
    cast(id, target) {
      const def = getSkill(id);
      const rank = skillRank(player.character, id);
      if (player.isBusy || !def || rank <= 0 || player.isOnCooldown(id)) return false;
      const cost = def.manaCost ? def.manaCost(rank) : 0;
      if (cost > 0 && !player.spendMana(cost)) {
        log.refusals++;
        return false;
      }
      const cd = def.cooldown ? def.cooldown(rank) : 0;
      if (cd > 0) player.startCooldown(id, cd);
      player.faceTowards(target.x, target.z);
      player.beginAction('cast', 0.5);
      log.casts.push({ id, t, x: target.x, z: target.z });
      return true;
    },
    basic(target) {
      if (player.isBusy) return false;
      player.faceTowards(target.x, target.z);
      player.beginAction('attack1', 0.42);
      log.basics.push({ t, x: target.x, z: target.z });
      return true;
    },
    melee: () => melee,
    drink: () => {
      log.drinks++;
    },
    dodged: () => {
      log.dodges++;
    },
  });
  const enemies: Enemy[] = [];
  const pctx = { colliders: [], walkableAt: () => true };
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      controls.update(DT, input, 0, enemies, null);
      player.update(DT, pctx, controls.keyDir.lengthSq() > 0 ? controls.keyDir : null);
      input.endFrame();
      t += DT;
    }
  };
  const addEnemy = (x: number, z: number): Enemy => {
    const def = MONSTERS.find((m) => m.role === 'melee') ?? MONSTERS[0]!;
    const e = new Enemy(def, 'normal', [], 3, new Random(enemies.length + 5));
    e.root.position.set(x, 0, z);
    enemies.push(e);
    return e;
  };
  return {
    c,
    player,
    input,
    log,
    controls,
    enemies,
    step,
    addEnemy,
    setMelee: (v: boolean) => (melee = v),
  };
}

const cases: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string): void => {
  cases.push({ name, ok, detail });
};

/** A caster with its opener moved from right click onto hotbar slot 1. */
function casterOnBar() {
  const w = world('pyromancer');
  const id = w.c.primaryAttack!;
  setPrimaryAttack(w.c, null);
  w.c.hotbar[0] = id;
  w.player.mana = 9999;
  return { w, id };
}

// 1. A click that goes down and up inside a single frame still attacks.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  w.input.worldPoint.set(0, 0, 3);
  w.input.mouseRightPressed = true; // down and up already, before the frame ran
  w.step();
  check('one-frame click still attacks', w.log.basics.length === 1, `${w.log.basics.length} swings`);
}

// 2. A hotbar press during a swing fires when the swing ends.
{
  const { w, id } = casterOnBar();
  w.input.worldPoint.set(0, 0, 5);
  w.input.mouseRightPressed = true;
  w.input.mouseRight = true;
  w.step();
  w.input.mouseRight = false;
  w.step(6); // 0.1s into a 0.42s swing
  w.input.tap('Digit1');
  w.step(40);
  const fired = w.log.casts.filter((c) => c.id === id).length;
  check(
    'hotbar press mid-swing is buffered',
    fired === 1 && w.controls.stats.bufferedFired >= 1,
    `${fired} casts, ${w.controls.stats.bufferedFired} from buffer`,
  );
}

// 3. A press far too early is dropped rather than firing seconds later.
{
  const { w } = casterOnBar();
  w.player.beginAction('channel', 2.0);
  w.input.tap('Digit1');
  w.step(150);
  check(
    'stale press expires',
    w.log.casts.length === 0 && w.controls.stats.bufferedExpired === 1,
    `${w.log.casts.length} casts`,
  );
}

// 4. Holding a hotbar key keeps casting whenever the hero is free.
{
  const { w } = casterOnBar();
  w.input.worldPoint.set(0, 0, 5);
  w.input.hold('Digit1');
  w.step(120);
  const n = w.log.casts.length;
  check('holding a skill key repeats it', n >= 3, `${n} casts in 2s`);
}

// 5. Holding attack with an unaffordable skill falls back quietly.
{
  const w = world('pyromancer');
  w.player.mana = 0;
  w.player.stats.manaRegen = 0;
  w.input.worldPoint.set(0, 0, 5);
  w.input.mouseRightPressed = true;
  w.input.mouseRight = true;
  w.step(120);
  check(
    'held attack while dry does not nag',
    w.log.refusals <= 1 && w.log.basics.length >= 3,
    `${w.log.refusals} refusals, ${w.log.basics.length} basic swings`,
  );
}

// 6. Attack-move: one click on a distant monster walks there and strikes.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  const e = w.addEnemy(0, 9);
  w.input.worldPoint.set(0, 0, 9);
  w.input.mouseRightPressed = true;
  w.step(); // released straight away
  w.step(240);
  const hit = w.log.basics.length === 1 && Math.abs(w.log.basics[0]!.z - e.root.position.z) < 0.01;
  check(
    'click a far monster: walk in and strike',
    hit,
    `${w.log.basics.length} swings, hero at z=${w.player.position.z.toFixed(2)}`,
  );
}

// 7. Force-stand: Shift attacks in place, never walks.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  w.addEnemy(0, 9);
  w.input.worldPoint.set(0, 0, 9);
  w.input.hold('ShiftLeft');
  w.input.mouseRightPressed = true;
  w.input.mouseRight = true;
  w.step(30);
  const moved = w.player.position.length();
  check(
    'Shift attacks in place',
    w.log.basics.length >= 1 && moved < 0.05,
    `${w.log.basics.length} swings, moved ${moved.toFixed(2)}`,
  );
}

// 8. Target lock: the cursor drifting off the monster keeps the target.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  const e = w.addEnemy(1.5, 0.5);
  w.input.worldPoint.set(1.5, 0, 0.5);
  w.input.mouseRightPressed = true;
  w.input.mouseRight = true;
  w.step();
  w.input.worldPoint.set(-6, 0, -6); // wandered far off
  w.step(60);
  const allOnTarget = w.log.basics.every((b) => Math.abs(b.x - e.root.position.x) < 0.01);
  check(
    'held attack keeps its target',
    w.log.basics.length >= 2 && allOnTarget,
    `${w.log.basics.length} swings, all on target: ${allOnTarget}`,
  );
}

// 9. Dodge cancels an attack.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  w.input.worldPoint.set(0, 0, 3);
  w.input.mouseRightPressed = true;
  w.step();
  w.input.tap('Space');
  w.step();
  check('dodge cancels a swing', w.log.dodges === 1, `${w.log.dodges} dodges`);
}

// 10. Dodge pressed just before it comes back still fires.
{
  const w = world();
  w.input.worldPoint.set(0, 0, 3);
  w.input.tap('Space');
  w.step();
  const first = w.log.dodges;
  const frames = Math.round((w.player.dodgeCdMax - 0.3) / DT);
  w.step(frames);
  w.input.tap('Space');
  w.step(30);
  check('early dodge press is kept', first === 1 && w.log.dodges === 2, `${w.log.dodges} dodges`);
}

// 11. Keys work while the cursor is over the HUD; mouse buttons do not.
{
  const { w } = casterOnBar();
  w.input.pointerOverUI = true;
  w.input.tap('Digit1');
  w.input.tap('KeyQ');
  w.input.mouseRightPressed = true;
  w.step();
  check(
    'keys work over the HUD, clicks do not',
    w.log.casts.length === 1 && w.log.drinks === 1 && w.log.basics.length === 0,
    `${w.log.casts.length} casts, ${w.log.drinks} drinks, ${w.log.basics.length} swings`,
  );
}

// 12. Steering walks out of the swing's follow-through, not its start.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  w.input.worldPoint.set(0, 0, 3);
  w.input.mouseRightPressed = true;
  w.step();
  w.input.hold('KeyD');
  w.step(3);
  const earlyLocked = w.player.isBusy;
  w.step(15);
  const freed = !w.player.isBusy && w.player.position.x > 0.05;
  check(
    'movement cancels only the recovery',
    earlyLocked && freed,
    `locked early: ${earlyLocked}, walking by 0.3s: ${freed}`,
  );
}

// 13. A hit during the dash is evaded and announced.
{
  const w = world();
  let evaded = 0;
  const off = events.on('player:evaded', () => evaded++);
  w.input.worldPoint.set(0, 0, 3);
  w.input.tap('Space');
  w.step();
  const before = w.player.life;
  const taken = w.player.takeDamage(
    { amount: 50, type: 'physical', crit: false, source: 'x', ability: 'test' },
    new Random(2),
  );
  off();
  check(
    'dodge evades and says so',
    taken === 0 && w.player.life === before && evaded === 1,
    `taken ${taken}, events ${evaded}`,
  );
}

// 14. A left click during a swing is not thrown away.
{
  const w = world();
  setPrimaryAttack(w.c, null);
  w.input.worldPoint.set(0, 0, 3);
  w.input.mouseRightPressed = true;
  w.step();
  w.input.worldPoint.set(6, 0, 0);
  w.input.mouseLeftPressed = true; // a single quick click mid-swing
  w.step();
  w.step(90);
  check('move click mid-swing is kept', w.player.position.x > 3, `hero at x=${w.player.position.x.toFixed(2)}`);
}

console.log(JSON.stringify({ cases }));
