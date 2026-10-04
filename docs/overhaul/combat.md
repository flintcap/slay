# Stream: combat (how fighting plays)

Status: in progress

## Milestones

- [x] Controls: instant, forgiving input. Input buffering, attack-move, hold-to-attack, force-stand, a short evade or dodge if it fits the classes, no dropped clicks. — "Make every press count: buffered, held and attack-move controls"
- [ ] Enemy behaviours: clear archetypes (rusher, flanker, ranged kiter, caster, support, swarm, tank) with readable telegraphs and pack tactics instead of everyone walking straight at you.
- [ ] Elites and mini-bosses: more elite affixes that combine into real threats, and a mini-boss with its own mechanic on most floors.
- [ ] Boss fights: phases, arena mechanics, enrage, and attacks you can learn and dodge, for every boss.
- [ ] Skill depth: synergies between skills, meaningful choices per rank, and a reason to mix skills instead of spamming one.
- [ ] Difficulty curve: headless fights confirm every class at every depth band is challenged but not walled; tune enemies up and classes up, never monsters down.
- [ ] Sweep: every skill and every monster ability has been exercised by a checker; nothing is unhittable, unavoidable or broken.

## Next up

Milestone 2, enemy behaviours. Start in `src/entities/AI.ts` (role profiles,
`think`, `claimSlot`). The roles in `MonsterRole` are melee, ranged, caster,
brute, swarm, support, ambusher; map them onto archetypes (rusher, flanker,
kiter, caster, support, swarm, tank) without touching `src/data/monsters.ts`
(depth owns it). Build a headless pack-fight checker on the pattern of
`tools/aggro-entry.ts` that installs the real catalogue.

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
- `tools/check-unfinished.mjs` reports `dreadaura` and `bossEnrage` statuses as never
  applied; wire `bossEnrage` in the boss milestone.
