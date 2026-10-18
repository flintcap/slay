# Stream: balance (Wave 4: items and classes)

Status: in progress

Goal: items feel worth finding and every class feels strong. Rules that
never bend: never make monsters weaker or fewer; make classes stronger, not
monsters softer. Every skill must get stronger with each rank (damage,
strength, time, size), not only cheaper or faster; skill changes go through
`src/data/skillPower.ts` and pass `node tools/check-rankpower.mjs`. Caster
weapons (wands, staffs, orbs) have no basic attack. All randomness through
`src/core/RNG.ts`.

**Item changes need the owner's approval first.** Write the proposal, push
it, and do not apply any item change until the owner approves.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch,
`node tools/check-rankpower.mjs`, `tools/check-curve.mjs`.

## Milestones

- [x] 1. Item audit (headless, no browser): affix ranges by item level,
  uniques and sets against rares, gems, runes, charms, prices, drop rates.
  Write the findings and a numbered change list in
  `docs/remake/balance-proposal.md` (each line: what, from, to, why). Push
  it. Do NOT apply item changes. (balance: item audit and proposal for the owner)
- [x] 2. Mage: check-curve fails at depths 5 and 12 (known before this
  wave). Make the Mage stronger so it passes. Pre-approved.
  (balance: the Mage passes the curve at every depth)
- [ ] 3. Dead-pick skills: find skills that are clearly weaker than their
  neighbours and make them stronger only. Follow the skillPower and
  check-rankpower rules.
- [ ] 4. Extend check-curve to more depths and every class, behind an
  optional flag so the default run stays fast.
- [ ] 5. Apply the approved item list. Blocked until the owner approves
  `balance-proposal.md`; skip to 6 if still blocked and leave it unticked.
- [ ] 6. Handover.

## Next up

1. Milestone 3: run `node tools/skill-dps.mjs` (all classes, a few
   minutes) and read the flagged skills. The flag is a hint, not proof:
   orbs (`projectile.orb`) and some projectiles resolve through effect
   callbacks the headless stand-in only half runs, so check each flagged
   skill's code path in `src/scenes/SkillRunner.ts` before calling it weak.
   Mage already flags thunderclap, tempestOrb, ballLightning, heavensGate,
   frostStep (check orbs first; they may be measuring artefacts).
2. Raise only damage ladders (`dmg` in `src/data/skills.ts`), base mana or
   base cooldown, or `src/data/skillPower.ts` numbers. Then
   `node tools/check-rankpower.mjs` and `node tools/check-curve.mjs` for
   the classes touched (watch for "unchallenged").

## Notes for resume

- Mage check-curve failures at depths 5 and 12 were there before this wave.
- `node tools/balance-report.mjs` prints the item audit tables (headless,
  about a minute). The proposal quotes it.
- Milestone 1's proposal is pushed. Milestone 5 stays blocked until the
  owner says which numbered lines of `balance-proposal.md` are approved.
- Milestone 2 changes (all make the Mage stronger, nothing weaker):
  Inferno `dmg` 0.45+0.08 to 2.0+0.34 a pulse and mana 14+0.9 to 8+0.4
  (it hits once per 0.8s pulse, not every 0.15s as its text said; text
  now says what it does); Blast Wave `dmg` 1.4+0.22 to 2.6+0.4, cooldown
  10 to 7s; Pyroclasm `dmg` 1.1+0.18 to 1.7+0.28, cooldown 12 to 8s; Mage
  life per level 1.8 to 2.4 and per vitality 2.8 to 3.4; energy's
  elemental damage 1.3% to 1.6% a point (`DERIVE.enrElementalPct`, also
  helps the Revenant, which stays challenged). Mana was the real wall at
  depth 12: Inferno drained the pool in about ten seconds.
- `tools/curve-entry.ts` fix: casters have no basic attack (owner's rule),
  but the harness held them at 9m to throw a bolt they do not have, and
  cast Inferno (7m) from 9m. Casters now hold at their longest spell's
  reach, and a channel or cone skill's reach is its own `range`.
- For `finish` (SkillRunner is not ours): Inferno's data says a 7m cone
  (`arc: 40`) but the runner's `channel` case is a line that stops at the
  first enemy. A real cone would make Inferno the crowd skill its tier
  promises.
- The `socket` checker is a browser check; it failed once when run by
  mistake outside the browser lock (not investigated, not this stream's).

## For the owner to test

- Play a Mage down the fire tree to depth 12: Inferno should melt a boss
  without running dry of mana in ten seconds, and Blast Wave should clear
  what walks up to you.

## Handover

(Written when every milestone is ticked.)
