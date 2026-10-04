# Stream: combat (how fighting plays)

Status: paused

## Milestones

- [x] Controls: instant, forgiving input. Input buffering, attack-move, hold-to-attack, force-stand, a short evade or dodge if it fits the classes, no dropped clicks. — "Make every press count: buffered, held and attack-move controls"
- [x] Enemy behaviours: clear archetypes (rusher, flanker, ranged kiter, caster, support, swarm, tank) with readable telegraphs and pack tactics instead of everyone walking straight at you. — "Teach packs to fight together: archetypes, flanks, guards and waves"
- [x] Elites and mini-bosses: more elite affixes that combine into real threats, and a mini-boss with its own mechanic on most floors. — "Give most floors a mini-boss and elites that combine"
- [ ] Boss fights: phases, arena mechanics, enrage, and attacks you can learn and dodge, for every boss.
- [ ] Skill depth: synergies between skills, meaningful choices per rank, and a reason to mix skills instead of spamming one.
- [ ] Difficulty curve: headless fights confirm every class at every depth band is challenged but not walled; tune enemies up and classes up, never monsters down.
- [ ] Sweep: every skill and every monster ability has been exercised by a checker; nothing is unhittable, unavoidable or broken.

## Next up

Milestone 4, boss fights, is about two-thirds done and committed (all of it is
live, typecheck clean, existing checkers pass). Already in:
- Bosses fight in a learnable rotation: `Boss.preferredAbility` walks the current
  phase's ability list in order (skips cooling/gated moves, walks in for an
  out-of-reach one for ~3s). AI asks `Enemy.preferredAbility` first.
- Soft enrage on every boss: `softEnrageAfter(phases)` = 75 + 55*phases seconds;
  then `soft_enrage` buff (+60% damage, +25% attack speed), the `bossEnrage`
  status, and `dreadaura` on a hero within 10m (via new `ctx.applyHeroStatus`).
  Warning toast 15s before. Events `boss:enraged`, `boss:cast`.
- First use of each big move (windup >= 0.8 or damage >= 2x) is named in a toast.
- `darkness` arena now does something (boss steps out of the dark beside you with
  a cone tell). New `hookSweep` arena (rotating cross of chain lines), given to
  Grell's phase 2.
- Readability: Pounce (ambush_leap) now has a 0.5s marker and lands on it;
  Blink Strike windup 0.6; Shatter death has a 0.6s ring. `node tools/check-readable.mjs`
  passes (every heavy blow is marked).

Left to do for milestone 4:
1. Finish `tools/bossfight-entry.ts` (written, never run to completion) and create
   `tools/check-bossfights.mjs` by copying `tools/check-controls.mjs` with the entry
   name and scratch dir changed. It fights all 24 bosses twice (standing hero vs a
   hero that steps out of markers) for up to 260s each plus a soft-enrage run; that
   was too slow (> 10 min). Cut it down: fight a sample (e.g. every third boss, or
   TTK 45s and cap 120s) or run bosses in parallel processes.
2. Use its output to fix any boss whose phases are not all reached, whose kit is
   mostly unused, or where dodging does not cut damage taken below ~60%.
3. Then tick milestone 4 and move on to milestone 5 (skill depth).

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
- Flankers do not use movement abilities (leaps) until committed to their flank.
- `node tools/check-tactics.mjs` covers all of the above with real monsters.
- Elites: seven new affixes in `data/monsterAffixes.ts` (desecrator, fire_chains,
  bulwark, splitter, hexing, adaptive, lancer), behaviours in `Enemy.tickAffixes`,
  `Enemy.adapt`, `runDeathAffixes`, `Abilities.affixRiders`.
- Combos: any blow that roots/stuns/slows/pulls the hero calls `noteControl`
  (Abilities.ts); follow-up affixes in `COMBO_FOLLOWUPS` (Enemy.ts) fire at once
  when `heroControlled(ctx)`, at most every 6s per affix.
- Monster buffs: `damage`, `defense` and new `taken` BuffMods are now applied
  (`rollPacket` reads `Enemy.buffDamageMul`; `takeDamage` scales armour and damage
  taken). Before this every damage buff in the game (Empowered, war cries, enrage)
  was cosmetic.
- Mini-bosses: `src/entities/MiniBoss.ts`. `planMiniBoss` picks a pack leader on
  ~85% of non-boss floors (50% at depth 1) using its own RNG stream; the scene
  builds it with `plan.rank` and `plan.named` and calls `attachMiniBoss`. Seven
  kinds (warlord, executioner, stalker, pyrelord, broodmother, deadeye, rampager),
  each with a telegraph and a punish window, plus a last stand at 30%. While its
  mechanic is due, `Enemy.beginAbility` waits (`MiniBossHook.wantsTurn`).
  Events: `miniboss:engaged`, `miniboss:killed`.
- `tools/combat-arena.ts` is a shared headless arena for combat checkers.
  `node tools/check-elites.mjs` covers milestone 3.
- `tools/check-unfinished.mjs` reports `dreadaura` and `bossEnrage` statuses as never
  applied; wire `bossEnrage` in the boss milestone.

## Notes for other streams

- hud: new affix behaviours have no glyph yet in `AFFIX_GLYPH` (Icons.ts) and fall
  back to a star: desecrator, fire_chains, bulwark, splitter, hexing, adaptive, lancer.
  Mini-bosses raise `miniboss:engaged` { id, name, title, kind } and `miniboss:killed`;
  a mini-boss health bar could hang off those. Their nameplate title names the mechanic.
- feel: `player:evaded` fires when a hit lands during the dodge. Mini-boss beats
  (horn, mark, shadow step, cage, volley, charge) currently use existing bursts and toasts.
