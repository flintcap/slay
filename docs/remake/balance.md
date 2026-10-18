# Stream: balance (Wave 4: items and classes)

Status: waiting on owner

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
- [x] 3. Dead-pick skills: find skills that are clearly weaker than their
  neighbours and make them stronger only. Follow the skillPower and
  check-rankpower rules. (balance: dead-pick skills hit as hard as their text says)
- [x] 4. Extend check-curve to more depths and every class, behind an
  optional flag so the default run stays fast. (balance: check-curve --wide
  walks every class out to depth 60)
- [ ] 5. Apply the approved item list. Blocked until the owner approves
  `balance-proposal.md`; skip to 6 if still blocked and leave it unticked.
- [x] 6. Handover.

## Next up

1. Waiting on the owner: milestone 5 starts only when the owner says which
   numbered lines of `docs/remake/balance-proposal.md` are approved. Then
   apply exactly those lines (item data in `src/data/*` and `src/sim/Loot.ts`),
   typecheck, rerun `node tools/balance-report.mjs` to confirm the numbers
   moved as the proposal says, and tick milestone 5.
2. Optional, not a milestone: the depth-60 walls found by `--wide` (see
   Notes for resume).

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
- Milestone 3 (skills, all stronger only; `node tools/skill-dps.mjs`
  found them, each code path in `SkillRunner.ts` read before changing):
  - Tempest Orb: `projectile.orb` without pierce is one hit (its duration,
    tick rate and targets a tick are never read). Now it bursts 5m on the
    first enemy (`splash: 5`), dmg 0.7+0.12 to 2.0+0.32, cd 11 to 7s.
  - Ball Lightning: same single hit. Now rolls 14m through everything
    (`pierce: 99`, like Frozen Orb), dmg 0.55+0.09 to 2.2+0.35, cd 6 to 5s.
  - Fireball and Plague Vial: a projectile's `radius` is its hit width,
    not a blast, so both hit one target. Added `splash` equal to the
    blast in their text. Plague Vial dmg 1.3+0.21 to 1.8+0.29, cd 10 to 8s.
  - Noxious Cloud and Heaven's Gate: ground zones tick at 28% unless the
    skill says `tickScale`; both now tick at the full rate their text
    promises (`tickScale: 1`).
  - Throwing Spree: `projectile.stream` throws one knife a cast. Now six
    knives in a tight fan (`count: 6, spread: 0.08`), cd 12 to 7s.
  - Void Walk: the runner does one blink and one strike, not a chain.
    dmg 1.3+0.2 to 3.2+0.5, cd 16 to 6s; text says what it does.
  - Arrow Rain and Darken The Sky: `meteor` is one volley at 140% (the
    `duration` and `ticks` are never read). Arrow Rain dmg 0.5+0.07 to
    1.8+0.28, cd 10 to 6s; Darken dmg 1.1+0.16 to 3.6+0.6, cd 45 to 24s.
  - Fan Fire: arrows 0.6 rad apart meant only one could reach a target.
    Spread 0.2, dmg 0.7+0.09 to 1.3+0.2, cd 7 to 5s.
  - Maim: 70% for a 9s cooldown was below a basic hit. dmg 0.7+0.12 to
    1.5+0.24.
  - Left alone on purpose: flags on cooldown utility skills (Aimed Shot,
    Crippling Shot, Cripple Tendon, Thunderclap, Frost Step, Bone Cage,
    Reaping) are the report measuring a cooldown against spam; per cast
    they are fine. Paladin rites and shapeshifter shift skills show 0 in
    the report because they resolve elsewhere (a harness gap, not weak).
    Bone Nova and other physical skills read low on the armoured test
    brute.
  - check-curve for mage, ranger, shadowblade and warden: all OK after.
- For `finish` (SkillRunner is not ours): if orbs, streams, meteors or
  chain blinks ever get real ticking or hopping, these numbers must come
  back down. Unique bends that grow dead knobs do nothing today: Tempest
  Orb (`targetsPerTick`, `duration`, batchC), Void Walk (`hops`,
  `window`, batchE), Arrow Rain (`ticks`, batchB).
- Milestone 4: `node tools/check-curve.mjs --wide` runs every class at
  depths 1 5 8 12 18 25 32 40 50 60 (about 6 minutes headless). The
  default run is unchanged (every class, depths 1 5 12 25 40, a few
  minutes). First `--wide` run: 67 of 70 OK. Every class passes every
  depth to 50 (so the default depths all pass too). Walled at depth 60
  (hero L46): shadowblade (packs 1/3, bosses 0/3), ranger (0/3, 0/3),
  shapeshifter (1/3, 0/3). Warden, paladin and revenant scrape through at
  60 with 1 to 3 wins. The hero model gains only 3 levels from depth 50 to
  60 (L43 to L46), so depth 60 may be the level curve, not the classes.
  Not chased this wave. Next step for whoever takes it: `--classes=ranger
  --depths=60 --trace` to see what kills it, then make the class (or the
  level pace) stronger, never the monsters weaker.
- The `socket` checker is a browser check; it failed once when run by
  mistake outside the browser lock (not investigated, not this stream's).

## For the owner to test

- Play a Mage down the fire tree to depth 12: Inferno should melt a boss
  without running dry of mana in ten seconds, and Blast Wave should clear
  what walks up to you.
- Throw Tempest Orb and Ball Lightning into a pack: the orb should burst
  on the first monster and hurt the pack; the ball should hurt every
  monster along its path.
- Throw Fireball and Plague Vial into a pack: everything in the blast
  should take damage, not only one monster.
- Cast Throwing Spree point blank: six knives, most of them on the target.
- Cast Arrow Rain and Fan Fire on a pack: both should feel like real
  damage now, not a tickle.

## Handover

What exists now:

- `docs/remake/balance-proposal.md`: the item audit and ten numbered
  item changes (runes, socket drop odds, rune values, weak rune lines,
  gem ladders, uniques growing with drop level, late uniques, optional
  rarity rungs and wear-level filter, display item level). Nothing applied.
- `tools/balance-report.mjs` (+ `tools/balance-entry.ts`): the read-only
  item audit the proposal quotes.
- `tools/skill-dps.mjs` (+ `tools/skilldps-entry.ts`): damage per second
  of every damage skill through the real runner, flags dead picks.
- `tools/check-curve.mjs --wide`: every class out to depth 60. The
  harness now holds casters at their spell reach (no basic attack).
- The Mage passes the curve at every depth (fire tree, life, energy).
- Twelve dead-pick skills hit as hard as their text says (list in Notes
  for resume).

Left for `finish` (SkillRunner is not ours):

- Inferno's data is a cone; the runner does a line.
- Orbs, streams, meteors and chain blinks ignore their tick and hop
  knobs; the numbers were raised to fit the single hit. If the runner
  learns them, lower the numbers again. Some unique bends grow those dead
  knobs (Tempest Orb, Void Walk, Arrow Rain).
- Milestone 5 (apply approved items) is blocked on the owner.
- Depth 60 walls three classes in `--wide` (Notes for resume).
