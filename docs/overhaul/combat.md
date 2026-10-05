# Stream: combat (how fighting plays)

Status: done (all milestones ticked)

## Milestones

- [x] Controls: instant, forgiving input. Input buffering, attack-move, hold-to-attack, force-stand, a short evade or dodge if it fits the classes, no dropped clicks. — "Make every press count: buffered, held and attack-move controls"
- [x] Enemy behaviours: clear archetypes (rusher, flanker, ranged kiter, caster, support, swarm, tank) with readable telegraphs and pack tactics instead of everyone walking straight at you. — "Teach packs to fight together: archetypes, flanks, guards and waves"
- [x] Elites and mini-bosses: more elite affixes that combine into real threats, and a mini-boss with its own mechanic on most floors. — "Give most floors a mini-boss and elites that combine"
- [x] Boss fights: phases, arena mechanics, enrage, and attacks you can learn and dodge, for every boss. — "Bosses step back to charge, and every boss fight is checked"
- [x] Skill depth: synergies between skills, meaningful choices per rank, and a reason to mix skills instead of spamming one. — "Synergies and +skills reach skill damage, and mixing skills combos"
- [x] Difficulty curve: headless fights confirm every class at every depth band is challenged but not walled; tune enemies up and classes up, never monsters down. — "Heroes compound with level, and a class-versus-depth harness proves the curve"
- [x] Sweep: every skill and every monster ability has been exercised by a checker; nothing is unhittable, unavoidable or broken. — "Sweep every skill and monster blow: markers hold still, hazards bite on entry"

## Next up

All seven milestones are done. If more time is given, good follow-ups:
1. A live render (`SLAY_PORT=4307 node tools/screenshot.mjs --out=shots/combat
   --shots=dungeon`) to eyeball combos (`Name!` text) and hero numbers. The one
   tried at the end of this session booted into the dungeon with no game
   errors, but the page screenshot timed out (machine load ~10 on 4 cores).
   `npm run build` is clean.
2. Re-run `node tools/check-curve.mjs` after any item, progression or monster
   change; widen it to depths 60 and 80 if the deep game matters.

## Notes for resume

- From quality (after this stream finished): Sworn Brother (Warden tier 6) is
  ranked as a passive and only raised minion stats, and the Warden has no other
  minion, so it did nothing. `SkillRunner.raiseSwornBrother` now raises one
  beside the hero whenever a banner skill is cast (cap 2, +1 per 10 ranks, hard
  cap 3; 60% damage +4%/rank, 140% life). `check-summon` plants a banner to
  test it.

- `node tools/check-bossfights.mjs` fights all 24 bosses (stand vs dodge, plus a
  wound-forward enrage clock) in about 25s. `--only=3` fights one boss, `--trace`
  prints its life every 5s. It requires every phase, 85% of the kit used, dodging
  taking under 60% of standing damage, and the soft enrage.
- Bosses back off for a run-up when the next move in their rotation has a
  `minRange` (charges, hooks, leaps): `Enemy.gapWanted`, read in `AI.think`.
  The backstep is the tell. Before this, gap closers never fired in melee.
- The checker's hero focuses adds, healers first. Tide Callers' Mend heals a
  boss 30% of its life, so leaving a healer up stalls the fight (by design).

- Skill damage: `sim/Combat.skillDamageScale(skills, skillLevels, id)` is what
  `SkillRunner.cast` now uses (one line in feel's file). Before, skills used
  `damageScale(hardRank)`, so every authored synergy and all `+skills` gear did
  nothing to damage. Ranger trees had no synergies at all; they have 31 now.
- Combos: `src/entities/Combos.ts`. A skill hitting a target another of your
  skills hit within `COMBO_WINDOW` (4s) is a combo: +20% +5% per payoff tier
  (25..50%), plus the class follow-up: warden Break (0.8s stun, not bosses),
  pyromancer Flashpoint (3 burning), shadowblade Exploit (forced crit),
  stormcaller Overload (40% arcs to the nearest enemy), revenant Reap
  (weakened), ranger Expose (vulnerable). Same skill twice, basic attacks,
  summons and item powers never combo. Memory is `Enemy.lastSkillHit/At`;
  applied in `Enemy.takeDamage` after item powers, before mitigation. Shows
  `Name!` over the target and emits `combat:combo`.
- `node tools/check-skilldepth.mjs` covers synergies (all 18 trees), real-cast
  synergy and +skills damage, and combos (about 20s).

- Difficulty curve: `node tools/check-curve.mjs` (~1-2 min) builds a hero per
  class at depths 1, 5, 12, 25, 40 (level from real run XP, sensible skill and
  stat points, best rare drops plus milestone caches), fights the biggest real
  pack and the real boss under the run's real modifiers, 3 seeds per cell. A
  cell fails if it loses every try (walled) or is never hurt (unchallenged).
  Before: every class died in 2-3s from depth 25 on. Fixes, all hero-side:
  `src/sim/HeroPower.ts` (from level 8, x1.135 damage and x1.13 life per level,
  hooked at the end of `computeStats` with one line in depth's Stats.ts), and
  bladework actives hit ~30% harder (shadowblade was the weakest class).
  Results now: packs mostly 3/3 early and 1-2/3 deep; bosses 1-3/3 everywhere;
  potions always needed past depth 5. Deep floors are hard on purpose.
- Hero statuses reach the sheet now (depth's fix). `check-controls` checks a
  slow slows once, a buff counts once through any number of recomputes, and a
  poisoning hit applies one stack.
- `check-bossfights` sim cap is 150s (Hurn needed a few more seconds).

- Hero crowd control is real now: `Player.incapacitated` (stunned, frozen,
  petrified, knocked down) makes `isBusy` true and blocks the dash;
  `Player.immobilised` (rooted, grasped) holds the feet and blocks the dash but
  not attacks. Orders are kept and resume. `check-controls` cases 16. Before,
  monster stuns on the hero were only a stat line.
- Sweep: `node tools/check-sweep.mjs` (~25s) casts all 163 active skills with
  the real runner (each must hit under its own name, or leave a status, a
  minion or a move) and uses all 81 damaging monster abilities on a hero who
  stands (must land), crosses its ground (hazards, barrages), walks out of its
  marker and, if needed, dashes through it (must be avoidable). Shared fake
  effects that fire `onHit`/`onFire`/`delay` callbacks: `tools/sim-effects.ts`.
- Fixed by the sweep: a monster whose marker is drawn round its own body no
  longer walks during the windup (`Enemy.canMove`), so the blow lands where the
  marker said; ground hazards bite the moment you step in (`Hazard.inside`),
  where before a wall of spikes could be crossed free between two ticks.

**Requests from other streams (added at pause), and what was done:**
- From depth, `enemy:killed` fired twice per kill: fixed. Only `Enemy.die` raises
  `enemy:killed` and only `Boss.die` raises `boss:killed`; DungeonScene no longer
  repeats them. `node tools/check-kills.mjs` checks plain, Soul Bound, splitter
  and boss kills, and that no other file emits either event.
- From animation, melee damage on the click: fixed. `Player.CLIP_CONTACT` gives
  each swing clip's contact point as a share of the action (attack1 0.35,
  attack2 0.33, slam 0.4, thrust/lunge 0.32, stomp 0.38), capped at
  `CONTACT_CAP` 0.16s. `Player.contactIn` / `actionId`. `SkillRunner.meleeSwing`
  (feel's file, small edit) queues a visible swing until contact; a dodge first
  cancels it. Cones, teleport strikes and dashes still land at once. The swing
  whoosh still plays on the click. `debug.ts` probes wait for contact.
  `check-controls` covers it with the real SkillRunner.
- From story, "collect" and "reach" objectives from `DungeonGen.ts` never count:
  not combat's; depth has the same request in `depth.md`. `sim/Quests.ts` has
  `onCollect` and `onReach`, but nothing in the dungeon calls them yet.

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

- From animation (small edits made in `Player.ts`, keep them): `beginAction` passes `contact` (your
  `contactDelay`, or `min(0.1, 0.3 * duration)` for actions that resolve on the click) and
  `restart: true` to `animator.play`, so every strike's contact pose lands on your contact frame
  and a repeated clip replays; `refreshEquipmentVisuals` calls `animator.setWeapon(grip, category)`.
  `CLIP_CONTACT` stays the gameplay source of truth; change it freely and the swings follow.

- hud: new affix behaviours have no glyph yet in `AFFIX_GLYPH` (Icons.ts) and fall
  back to a star: desecrator, fire_chains, bulwark, splitter, hexing, adaptive, lancer.
  Mini-bosses raise `miniboss:engaged` { id, name, title, kind } and `miniboss:killed`;
  a mini-boss health bar could hang off those. Their nameplate title names the mechanic.
- animation: melee damage now lands at `contactDelay(clip, duration)` in
  `Player.ts` = min(0.16s, `CLIP_CONTACT[clip]` x action length). Author each
  strike to land there, or export your own per-clip contact and tell combat to
  read it instead of the table.
- feel: `SkillRunner.meleeSwing` now defers a visible swing to its contact frame
  (`pendingSwings`, ticked in `update`). Hit feel fires at contact; the whoosh on
  the click.
- depth / everyone: hero power (`sim/HeroPower.ts`) multiplies hero damage and
  life from level 8 on (x2.8 damage at level 16, ~x60 at level 40). Anything
  that prices or tunes against hero numbers (item powers, economy) should read
  sheets from `computeStats`, which includes it.
- feel / hud: `combat:combo` { id, name, setup, payoff, bonusPct, x, y, z } fires
  on each combo; it already floats `Name!` over the target. A sound and a skill
  tree line would help: `comboForSkill(def)` and `comboBonusPct(def)` in
  `src/entities/Combos.ts` give the text and number for a tooltip.
- animation / feel: a stunned hero now really stands still (`Player.incapacitated`);
  there is no stun pose or sound yet.
- feel: `player:evaded` fires when a hit lands during the dodge. Mini-boss beats
  (horn, mark, shadow step, cage, volley, charge) currently use existing bursts and toasts.
