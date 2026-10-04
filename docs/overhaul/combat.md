# Stream: combat (how fighting plays)

Status: in progress

## Milestones

- [x] Controls: instant, forgiving input. Input buffering, attack-move, hold-to-attack, force-stand, a short evade or dodge if it fits the classes, no dropped clicks. — "Make every press count: buffered, held and attack-move controls"
- [x] Enemy behaviours: clear archetypes (rusher, flanker, ranged kiter, caster, support, swarm, tank) with readable telegraphs and pack tactics instead of everyone walking straight at you. — "Teach packs to fight together: archetypes, flanks, guards and waves"
- [ ] Elites and mini-bosses: more elite affixes that combine into real threats, and a mini-boss with its own mechanic on most floors.
- [ ] Boss fights: phases, arena mechanics, enrage, and attacks you can learn and dodge, for every boss.
- [ ] Skill depth: synergies between skills, meaningful choices per rank, and a reason to mix skills instead of spamming one.
- [ ] Difficulty curve: headless fights confirm every class at every depth band is challenged but not walled; tune enemies up and classes up, never monsters down.
- [ ] Sweep: every skill and every monster ability has been exercised by a checker; nothing is unhittable, unavoidable or broken.

## Next up

Milestone 3, elites and mini-bosses. Affixes live in `src/data/monsterAffixes.ts`
(combat owns it) and their behaviours in `Enemy.tickAffixes` / `takeDamage` /
`runDeathAffixes` / `Abilities.affixRiders`. Spawns come from
`src/world/DungeonGen.ts` (depth owns it): a mini-boss per floor needs either a
small additive hook there or a scene-side promotion of one pack leader in
`DungeonScene.loadLevel` (shared, additive). Prefer a new combat-owned file
(for example `src/entities/MiniBoss.ts`) holding the mini-boss mechanics, and
extend `tools/tactics-entry.ts` or add a new checker for it.

## Notes for resume

- Controls live in `src/entities/Controls.ts` (`CombatControls`). `DungeonScene.handleInput`
  is now a three-line delegation; the old `enemyUnderCursor`, `aimPoint` and
  `MELEE_REACH` in the scene are unused leftovers kept to keep the shared-file diff small.
- Player: `inRecovery` / `cancelRecovery()` (movement cancels the last 45% of an
  action, `Player.RECOVERY_CANCEL_AT`), `dodgeReadyIn`, dodge cancels any action,
  `moveTo` no longer drops orders during an action. All hits resolve on the first
  frame of an action, so cancelling recovery never adds damage.
- New event `player:evaded` (in `core/Events.ts`) fires when a hit lands during the dash.
- Shift is force-stand (it also still shows item labels, which is harmless). Shift +
  left click attacks in place. Left click on its own is still movement only, by the
  owner's earlier decision.
- `node tools/check-controls.mjs` covers all of the above with the real Player.
- Archetypes are in `AI.ts` (`Archetype`, `archetypeOf`). Role maps to archetype;
  a support with attackRange < 4 is a rusher; every third plain melee member of a
  pack becomes a flanker (`joinPack`). Pack state (swarm gather/surge rhythm) is
  module-level in `AI.ts`, cleared by `resetPacks`.
- `ctx.heroFacing` and `ctx.heroLifeFrac` are new on `CombatContext`, set in
  `DungeonScene.context()`. Below 35% hero life, blades press harder (sprint, tighter ring).
- Sprint speed is capped at 4.4 m/s (hero runs 4.6) so running away stays an answer;
  monsters whose base speed is already higher keep it.
- Big telegraphs (windup >= 0.5) are scheduled so no two land within 0.3s
  (`telegraphClash`). Monsters pick another action rather than wait.
- Tanks (brutes) take 30% less from the front while not swinging (`Enemy.braced`).
- An elite's death makes its pack falter for 1.2s (`AIBrain.shake`).
- Fixed while here: `DungeonScene.loadLevel` never copied `spawn.packId` onto enemies
  (packs never shared aggro) and never cleared projectiles, hazards and delayed
  impacts between floors (`resetEnemyRuntime` now does, and is called there).
- `node tools/check-tactics.mjs` covers all of the above with real monsters.
- `tools/check-unfinished.mjs` reports `dreadaura` and `bossEnrage` statuses as never
  applied; wire `bossEnrage` in the boss milestone.
