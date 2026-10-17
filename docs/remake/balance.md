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

- [ ] 1. Item audit (headless, no browser): affix ranges by item level,
  uniques and sets against rares, gems, runes, charms, prices, drop rates.
  Write the findings and a numbered change list in
  `docs/remake/balance-proposal.md` (each line: what, from, to, why). Push
  it. Do NOT apply item changes.
- [ ] 2. Mage: check-curve fails at depths 5 and 12 (known before this
  wave). Make the Mage stronger so it passes. Pre-approved.
- [ ] 3. Dead-pick skills: find skills that are clearly weaker than their
  neighbours and make them stronger only. Follow the skillPower and
  check-rankpower rules.
- [ ] 4. Extend check-curve to more depths and every class, behind an
  optional flag so the default run stays fast.
- [ ] 5. Apply the approved item list. Blocked until the owner approves
  `balance-proposal.md`; skip to 6 if still blocked and leave it unticked.
- [ ] 6. Handover.

## Next up

1. Do Setup in PROTOCOL.md. Set `Status: in progress`.
2. Milestone 1: find where affixes, uniques, sets, gems, runes, charms,
   prices and drops are defined (`src/data/*`, `src/sim/*`) and write a
   headless report tool.

## Notes for resume

- Mage check-curve failures at depths 5 and 12 were there before this wave.

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
