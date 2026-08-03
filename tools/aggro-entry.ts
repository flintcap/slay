/**
 * Entry point for `tools/check-aggro.mjs`.
 *
 * Reported: "summons need to aggro monsters, currently they run past them to
 * get to me". Every monster brain only ever looked at `ctx.playerPos`, so a
 * wall of skeletons was scenery.
 *
 * This drives a real `AIBrain` against a stub world and reports, for each
 * scenario, what the monster decided to fight and where it decided to walk. No
 * renderer, no scene, no playtesting.
 */
import * as THREE from 'three';
import { Enemy } from '../src/entities/Enemy';
import { Boss } from '../src/entities/Boss';
import { MONSTERS } from '../src/data/monsters';
import { BOSSES } from '../src/data/bosses';
import { Random } from '../src/core/RNG';
import type { CombatContext, MinionTarget } from '../src/entities/Abilities';

/** Anything the brain touches that we do not care about answers politely. */
const shrug: any = new Proxy(function () {}, {
  get: () => shrug,
  apply: () => shrug,
});

const nav = {
  lineOfSight: () => true,
  clampToWalkable: (x: number, z: number) => ({ x, y: z }),
  path: () => [],
};

const hero = new THREE.Vector3();
const aim = new THREE.Vector3();

function makeCtx(minions: MinionTarget[]): CombatContext {
  return {
    playerPos: aim.copy(hero),
    heroPos: hero,
    playerStats: shrug,
    playerLevel: 10,
    damagePlayer: () => {},
    nav: nav as never,
    fx: shrug,
    decals: shrug,
    rng: new Random(7),
    elapsed: 100,
    enemies: [],
    scene: new THREE.Scene(),
    minions,
    damageMinion: () => true,
  };
}

const def = MONSTERS.find((m) => m.role === 'melee') ?? MONSTERS[0]!;

/** Runs one monster for long enough that its brain has thought several times. */
function run(
  at: { x: number; z: number },
  playerAt: { x: number; z: number },
  minions: MinionTarget[],
  boss = false,
): { fighting: number | null; goesToward: 'player' | 'minion' | 'neither' } {
  hero.set(playerAt.x, 0, playerAt.z);
  const ctx = makeCtx(minions);
  const rng = new Random(3);
  const e = boss
    ? new Boss(BOSSES[0]!, 5, rng)
    : new Enemy(def, 'normal', [], 5, rng);
  e.root.position.set(at.x, 0, at.z);
  e.ai!.wake(ctx, false);
  for (let i = 0; i < 12; i++) {
    ctx.playerPos.copy(hero);
    e.ai!.update(0.2, ctx);
  }
  const want = e.ai!.desired;
  const dPlayer = Math.hypot(want.x - playerAt.x, want.z - playerAt.z);
  let dMinion = Infinity;
  for (const m of minions) dMinion = Math.min(dMinion, Math.hypot(want.x - m.x, want.z - m.z));
  const goesToward =
    dMinion < dPlayer - 0.5 ? 'minion' : dPlayer < dMinion - 0.5 ? 'player' : 'neither';
  return { fighting: e.ai!.aggroMinion, goesToward };
}

interface Case {
  name: string;
  fighting: 'minion' | 'player';
  goesToward: 'player' | 'minion' | 'neither';
  ok: boolean;
}

const cases: Case[] = [];
function check(
  name: string,
  got: { fighting: number | null; goesToward: string },
  wantFight: 'minion' | 'player',
  wantWalk: 'player' | 'minion' | 'neither',
): void {
  const fighting = got.fighting === null ? 'player' : 'minion';
  cases.push({
    name,
    fighting,
    goesToward: got.goesToward as Case['goesToward'],
    ok: fighting === wantFight && got.goesToward === wantWalk,
  });
}

// No summons at all: nothing changes for anyone who never plays a summoner.
check('no summons', run({ x: 0, z: 12 }, { x: 0, z: 0 }, []), 'player', 'player');

// A skeleton standing between the monster and the player takes the fight.
check(
  'skeleton in the way',
  run({ x: 0, z: 12 }, { x: 0, z: 0 }, [{ id: 1, x: 0, z: 6, taunt: false }]),
  'minion',
  'minion',
);

// A skeleton off behind the player is not worth the detour.
check(
  'skeleton behind the player',
  run({ x: 0, z: 12 }, { x: 0, z: 0 }, [{ id: 1, x: 0, z: -9, taunt: false }]),
  'player',
  'player',
);

// A taunting sentinel pulls even from further away than the player.
check(
  'taunting sentinel, further than the player',
  run({ x: 0, z: 12 }, { x: 0, z: 0 }, [{ id: 1, x: 9, z: 16, taunt: true }]),
  'minion',
  'minion',
);

// Out of notice range entirely: the monster never sees it.
check(
  'skeleton across the level',
  run({ x: 0, z: 12 }, { x: 0, z: 0 }, [{ id: 1, x: 60, z: 60, taunt: false }]),
  'player',
  'player',
);

// The nearest of several is the one it commits to.
check(
  'picks the nearest of three',
  run({ x: 0, z: 12 }, { x: 0, z: 0 }, [
    { id: 1, x: 0, z: 3, taunt: false },
    { id: 2, x: 0, z: 10, taunt: false },
    { id: 3, x: 5, z: 8, taunt: false },
  ]),
  'minion',
  'minion',
);

// A boss comes for you regardless. The encounter is built around the player.
check(
  'boss ignores the wall',
  run({ x: 0, z: 12 }, { x: 0, z: 0 }, [{ id: 1, x: 0, z: 6, taunt: true }], true),
  'player',
  'player',
);

console.log(JSON.stringify({ cases }));
