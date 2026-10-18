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

1. Milestone 2: Mage fails check-curve at depth 5 (bosses 0/3, all timed
   out at 300s) and depth 12 (packs 0/3, bosses 0/3). Run
   `node tools/check-curve.mjs --classes=mage --depths=5,12 --trace` to see
   why, then make the Mage stronger (skill numbers through
   `src/data/skillPower.ts`, or Mage passives/class data), never weaker
   monsters. Re-run `--classes=mage` and `node tools/check-rankpower.mjs`.

## Notes for resume

- Mage check-curve failures at depths 5 and 12 were there before this wave.
- `node tools/balance-report.mjs` prints the item audit tables (headless,
  about a minute). The proposal quotes it.
- Milestone 1's proposal is pushed. Milestone 5 stays blocked until the
  owner says which numbered lines of `balance-proposal.md` are approved.
- The `socket` checker is a browser check; it failed once when run by
  mistake outside the browser lock (not investigated, not this stream's).

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
