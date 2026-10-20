# Stream: skillcore (Wave 5: attack speed, cast rate, item speed)

Status: waiting

Goal (owner): nothing attacks or casts at warp speed. Basic attacks, attack
skills, spells and the speed that items add should feel as close as we can
get to similar classes and weapons in Diablo II and Path of Exile, in our
own numbers. Items that are like items in those games should add speed the
same way, so stacking speed gear never turns a hero into a blur. Every class
stream after you builds on what you leave, so leave one clear model.

Runs alone. Port 4351. Class streams start only after your Handover is
pushed.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch.
Likely: `stattext`, `skillparams`, `rankpower`, `items`, `uniques`,
`setpower`, `charms`, `socket`, `starter-power`, `feel`, `hits`, `curve`
(static, about two minutes for the default grid; never two runs at once in
one folder). Browser (one at a time, last resort): `clips`, `attack`,
`skills`. Run `node tools/get-chrome.mjs` once before the first browser
check.

## What the code says today (read it again yourself before you trust it)

These are starting pointers, written from the code on the day this file
was made. Check each one in the code before you rely on it.

- `src/scenes/SkillRunner.ts` near line 916: `attackTime = 0.42 /
  max(0.4, 1 + attackSpeedPct / 100)` and `castTime = 0.5 / max(0.4, 1 +
  castSpeedPct / 100)`. One fixed time for every weapon.
- Near line 1981: the bow basic attack uses 0.46. Near line 2008: the melee
  basic attack uses `DUAL_SWING` (0.32) with two blades, else 0.42.
- Near lines 123 to 139: `DUAL_SWING`, `DUAL_BLOW_SCALE`, `DUAL_SKILL_TIME`
  (1.35). Melee skill time near line 996 is `attackTime * k / (1 +
  speedBonus / 100)`.
- `src/sim/Stats.ts` near line 597: `attacksPerSecond()` and
  `castTimeScale()` exist but nothing in the game calls them.
- `src/data/itemBases.ts`: every weapon base has a `baseSpeed` (about 0.58
  to 1.75 attacks a second). Today it only shows in tooltips. Weapon damage
  bands are written as target damage per second x role / speed, so slow
  weapons hit far harder than their design and fast ones far softer,
  because every weapon swings at the same 0.42 s.
- `src/data/affixes.ts` near line 396: `ASPD` and `CSPD` ladders run from
  3-6% up to 34-40% per line, on weapons, gloves, rings, amulets (attack)
  and caster weapons, jewelry, gloves, helms (cast). More speed lines near
  lines 417, 425, 874, 947 and in `GRAND_STATS` (charms).
- `src/entities/Player.ts` near line 727: `attackSpeedPct` adds Flurry
  stacks, `castSpeedPct` adds Storm Fury stacks.
- Example of the problem: the Rogue's Precise Cut has `speedBonus: 15`, so
  about 0.37 s per cut alone and about 0.2 s per cut with two blades. Far
  too fast.
- The shapeshifter (`src/scenes/ShifterRunner.ts`) and the paladin
  (`src/scenes/paladin/*`) may have their own timing sums. Grep for every
  place that turns speed into seconds (`attackSpeedPct`, `castSpeedPct`,
  `0.42`, `0.5 /`, `speedBonus`) and list them all.

## Speed reference (feel only, never names)

Rough numbers from the two games, for the feel we want. Do your own check
of the code we have; these are targets for how it should feel, not values
to paste.

- Diablo II (25 frames a second): most melee swings take about 15 to 20
  frames with no speed gear (about 1.25 to 1.7 a second) and bottom out
  near 9 to 11 frames with heavy speed gear (about 2.3 to 2.8 a second).
  Casters start near 13 frames (about 1.9 casts a second) and bottom out
  near 7 to 9 frames (about 2.8 to 3.6 a second). Speed gear works in
  steps with heavy diminishing returns.
- Path of Exile: weapon attacks per second about 1.1 to 1.6 by weapon type,
  heavy two handers lower. Spell cast times about 0.6 to 0.9 s base.
  Speed lines on gear are small: about 5 to 27% attack speed, 5 to 30% cast
  speed, with the big rolls only on weapons.

## Milestones

- [ ] 1. Audit (read code, no browser). Write a table under "Notes for
  resume": every weapon type's base speed, the real time of its basic attack
  today, the real cast time today, how attack skills and spells take their
  time (per skill `speedBonus`, dual wield, channel ticks), every source of
  speed (affix ladders, uniques, sets, runes, runewords, gems, charms,
  passives, stacking buffs, auras) with its range, and the caps. Next to it,
  the target column from the reference above, per weapon type and per
  caster. Say plainly which are too fast and by how much.
- [ ] 2. One speed model. The weapon's base speed drives the basic attack
  and attack skills. Add the shared fields class streams will time skills
  with: a per-skill attack time factor (attack skills) and a per-skill cast
  time (spells), both in `src/types.ts` on the skill shape, with sensible
  defaults so every current skill keeps working. Speed from gear and buffs
  goes through one function with diminishing returns and a ceiling (about
  2.5 to 3.2 attacks a second at most, about 3 to 3.5 casts a second at
  most). Every place from the audit uses that one function; delete the old
  sums and constants (grep shows zero hits). Caster weapons still have no
  basic attack.
- [ ] 3. Item speed. Retune every speed line to sizes like the reference
  (about 5 to 20% on gear, up to about 30% on weapons, smaller on charms),
  including uniques, sets, runes, runewords, gems and charms (numbers only;
  do not change what an item is). Stacking passives and buffs (Flurry, Storm
  Fury, Precise Cut's passive, any others the audit finds) fit under the
  same ceiling. Items already owned keep their place in the range but move
  to the new scale (a roll at the top of the old range lands at the top of
  the new one), the way owned uniques and sets were updated before (find
  that code from `migrateAccount` in `src/core/Save.ts` and reuse it). Write what happens to old
  saves under "Notes for resume".
- [ ] 4. Keep damage per second. At equal gear, a hero's average damage per
  second should stay about where it is now (slower swings hit harder). Fix
  weapon damage bands so every weapon type meets its design damage per
  second under the new speeds, and adjust per-hit numbers in
  `src/sim/HeroPower.ts` if needed. Run `check-curve` once before and once
  after; no class may end up walled where it was not (the ranger at depth 12
  was already borderline before you; note, do not chase). If
  `tools/curve-entry.ts` hard-codes 0.42 or any old time, fix it. Never make
  monsters weaker or fewer.
- [ ] 5. Clips match the time. `src/art/hero/Animator.ts` and the swing
  code stretch each swing and cast clip to the new action time, the hit
  lands on the clip's hit frame, and no clip plays so fast it smears or so
  slow it floats. One small browser check (`check-clips` or `check-attack`)
  at the end.
- [ ] 6. Readouts. The character panel shows true attacks a second and
  casts a second; item and skill tooltips show true speed numbers
  (`check-stattext`, `check-skillparams`).
- [ ] 7. Icon pipeline. Class streams will paint richer icons. Raise the
  skill icon render size in `src/art/SkillIconArt.ts` / `src/art/Icons.ts`
  so icons stay sharp at the largest real display size (hotbar and skill
  board at UI scale 200% on a high density screen). Check memory and first
  paint cost; icons must still bake without a hitch. Do not repaint single
  icons; that is the class streams' work.
- [ ] 8. Handover. Write the final model in "Handover" and in
  `CONTRACTS.md`: the speed function, the new skill fields and their
  defaults, the target speed table (per weapon type and caster, base and at
  the ceiling), how dual wield works, how a class stream should time a new
  skill, and the icon size. Set `Status: done`, push.

## Next up

Start milestone 1.

## Notes for resume

(empty)

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
