# Stream: skillcore (Wave 5: attack speed, cast rate, item speed)

Status: in progress

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

- [x] 1. Audit (read code, no browser). ("skillcore: speed audit") Write a table under "Notes for
  resume": every weapon type's base speed, the real time of its basic attack
  today, the real cast time today, how attack skills and spells take their
  time (per skill `speedBonus`, dual wield, channel ticks), every source of
  speed (affix ladders, uniques, sets, runes, runewords, gems, charms,
  passives, stacking buffs, auras) with its range, and the caps. Next to it,
  the target column from the reference above, per weapon type and per
  caster. Say plainly which are too fast and by how much.
- [x] 2. One speed model. ("skillcore: one speed model in sim/Speed.ts") The weapon's base speed drives the basic attack
  and attack skills. Add the shared fields class streams will time skills
  with: a per-skill attack time factor (attack skills) and a per-skill cast
  time (spells), both in `src/types.ts` on the skill shape, with sensible
  defaults so every current skill keeps working. Speed from gear and buffs
  goes through one function with diminishing returns and a ceiling (about
  2.5 to 3.2 attacks a second at most, about 3 to 3.5 casts a second at
  most). Every place from the audit uses that one function; delete the old
  sums and constants (grep shows zero hits). Caster weapons still have no
  basic attack.
- [x] 3. Item speed. ("skillcore: item speed on the new scale, save v3") Retune every speed line to sizes like the reference
  (about 5 to 20% on gear, up to about 30% on weapons, smaller on charms),
  including uniques, sets, runes, runewords, gems and charms (numbers only;
  do not change what an item is). Stacking passives and buffs (Flurry, Storm
  Fury, Precise Cut's passive, any others the audit finds) fit under the
  same ceiling. Items already owned keep their place in the range but move
  to the new scale (a roll at the top of the old range lands at the top of
  the new one), the way owned uniques and sets were updated before (find
  that code from `migrateAccount` in `src/core/Save.ts` and reuse it). Write what happens to old
  saves under "Notes for resume".
- [x] 4. Damage per hit unchanged (owner change). ("skillcore: curve before and after") Damage per swing, per
  shot and per cast must NOT change because of speed: per-hit damage stays
  exactly what it is today. Do not touch weapon damage bands in
  `src/data/itemBases.ts`, per-hit numbers in `src/sim/HeroPower.ts`, skill
  damage numbers, or any blow scale tied to swing time (`DUAL_BLOW_SCALE`
  and the dual skill blow scale keep today's value, frozen as a number,
  never derived from the new speed). Only speeds change; damage per second
  moves with speed and that is accepted. Run `check-curve` once before and
  once after, for information only: if a class becomes walled where it was
  not, do NOT change damage and do NOT touch monsters. Write the before and
  after table under "Notes for resume" for the owner. If
  `tools/curve-entry.ts` hard-codes 0.42 or any old time, fix it.
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

Milestone 5: `contactDelay` / `CONTACT_CAP` in `Player.ts` and the
Animator clip speed follow the action time (hit on the clip's hit frame,
no smear, no float), plus the three class-stream requests under "Notes for
resume". Then one browser check (`check-attack` or `check-clips`) with
`get-chrome` first, `flock`, `timeout`, `SLAY_PORT=4351`.

## Notes for resume

### Audit (milestone 1, read from the code on 2026-10-20)

How an action takes its time today. The next action waits for the whole
action (`Player.isBusy` = `actionLock > 0`), so rate = 1 / time.

| Action | Time today (no gear) | Where |
| --- | --- | --- |
| Melee basic, any weapon | 0.42 s (2.38/s), base speed ignored | `SkillRunner.basicAttack` |
| Melee basic, two blades | 0.32 s per blade (3.13/s), blow x1.234 | `DUAL_SWING`, `DUAL_BLOW_SCALE` |
| Bow or crossbow basic | 0.46 s (2.17/s) | `basicAttack` ranged branch |
| Melee skill | 0.42 x dual 1.35 / (1 + speedBonus%) | `melee`/`cleave` branch, `DUAL_SKILL_TIME` |
| Spin (melee.channel) | 0.42 x tickRate/0.42 (Whirlwind 0.35 s) | same branch |
| whirlwind / slam / wave family | 0.59 / 0.63 / 0.42 s | family branches |
| Bow skills (projectile etc.) | 0.5 s on CAST speed (bug: attack speed ignored) | `projectile`/`cone`/... branches |
| Spells | 0.5 s (2.0/s); heal/buff 0.35 s; channel 0.8 s | `castTime` and x0.7 / x1.6 |
| Paladin rites / vigils | 0.42 x rite.time (0.7-2.0) / 0.5 x act.time | `paladin/Rites.ts`, `Vigils.ts` |
| Shifter skills | swing x0.85-1.7, cast x1.1-1.8, leaps by distance | `ShifterRunner.ts` |
| Leap / blink / dash | 0.34 s / 0.26 s / 0.32-0.5 s fixed | movement, not speed-scaled |
| Channel tether ticks | tickRate (0.25 s) fixed | `channel.tether` |

Speed today: time / max(0.4, 1 + pct/100), linear, `attackSpeed` and
`castSpeed` clamped to [-75, 200] in `computeStats`. Fastest possible: swing
0.14 s (7.1/s), two blades 0.107 s (9.4/s), bow 0.15 s (6.5/s), cast 0.167 s
(6/s). `Stats.attacksPerSecond` / `castTimeScale` were unused. `AttackEstimate`
copies 0.42 / 0.46 / 0.5. The base speed only showed in tooltips.

Weapon base speeds (`itemBases.ts`, attacks a second): dagger 1.5-1.75,
sword 1h 1.2-1.55, axe 1h 1.1-1.25, mace 1h 1.05-1.2, scepter 1.05-1.35,
wand 1.3-1.55, spear 0.85-1.15, sword 2h 0.85, axe 2h 0.65-0.8, mace 2h
0.58-0.85, staff 0.9-1.1, bow 0.85-1.35, crossbow 0.7-1.2.

Speed sources (positive unless marked):
- Affixes: `pre/suf.aspd` and `pre/suf.cspd` 3-6 up to 34-40 (weapons,
  gloves, rings, amulet / caster weapons, jewelry, gloves, helm);
  `.great` 42-72 (rare only); `suf.gloves.grip` 12-47 (gloves, rings,
  amulet); `pre.orb.conduit` 14-54 (orb, wand). One speed line per item.
- Charms: grand charms only, 0.8 x the jewel ladder (2-5 up to 27-32), and
  they stack in the pack. Unique charms up to 19.
- Uniques: 110 lines on 415 uniques, up to 58 (staff cast), 52 (bow), 45
  (axe); extra lines (`extraLines.ts`, 83 lines) up to 50; depth uniques by
  curve `8 + 0.25 x ilvl` (30 at 90).
- Sets: pieces 5-35, bonuses 10-30 per tier, up to 50 for a full set.
- Gems: garnet (attack) and opal (cast) in weapons 4/7/11/15/20/27 per
  socket, weapons hold up to 6 sockets (162% from one weapon).
- Runes: 3-14. Runewords: 5-10 base, +2-3 per cut, up to 25.
- Item powers (`ItemPowers.ts`): +12 to +25, costs -12 to -25.
- Boons: Quicksilver +20/+20, Soul Well +15 cast. Statuses: haste +25/+25,
  frenzy +6, fervent +8/+8; slows on the hero: chilled -15, entangled -20,
  staggered -20, exhausted -25/-25.
- Skill passives (rank 1 / 10 / 20): Quick Draw 3/21/28, Reaver 3/18/26,
  Cold Focus 2/14/20, Corrosive Edge 2/14/20, Butchery 1/10/15, Volley
  Mastery 1/7/11, Frenzy Mastery 1/10/20, Measured Step 2/11/16 (attack);
  Heat Shimmer 4/26/35, Storm Fury 3/21/30, Liturgy 1/9/12 (cast).
- Stacking: Flurry (10 + 1 per rank) per stack x 6 stacks = 60% at rank 1,
  174% at rank 20. Storm Fury 1 per stack x 10. Pack Instinct (2 + 0.3 per
  rank) x 5. Fervour aura 8 + 1.2 per rank. Cat form 10 + 1 per rank.
- Precise Cut `speedBonus: 15` (0.37 s a cut alone, about 0.2 s with two
  blades). Only skill with `speedBonus`.

Target (from the reference, our own numbers), attacks a second with no gear
and at the most gear can give:

| Weapon | Base today in play | Target base | Target ceiling |
| --- | --- | --- | --- |
| Dagger | 2.38 (3.13 two blades) | 1.5-1.75 | 3.0 |
| Sword 1h | 2.38 | 1.2-1.55 | 2.4-3.0 |
| Axe / mace 1h, scepter | 2.38 | 1.05-1.35 | 2.1-2.7 |
| Spear, 2h sword/axe/mace | 2.38 | 0.85-1.15 | 1.7-2.3 |
| Bow | 2.17 | 1.15-1.5 | 2.3-3.0 |
| Crossbow | 2.17 | 0.95-1.2 | 1.9-2.4 |
| Spell | 2.0 | 2.0 (0.5 s) | 3.4 |

Too fast today: every weapon's basic and attack skills run at 2.38/s, so
daggers are about 1.4x their target and two-handers 2-2.8x; with gear the
linear sum reaches 7/s melee (2.5x the target ceiling), 9.4/s with two
blades (3x), 6/s casts (1.8x). Bow skills ignore attack speed entirely.

### Curve before and after (check-curve, default grid, for the owner)

Information only (owner's rule): damage per hit and monsters were not
touched. Before = before any skillcore change; after = milestones 2 and 3
(weapon-paced swings, item speed on the new scale). Times are seconds per
pack and per boss; "low" lines dropped.

| Class | Depth | Before | After |
| --- | --- | --- | --- |
| warden | 1 | ok: packs 3/3 (16/5/3 s), bosses 2/3 (38/68/49 s) | FAIL: packs 3/3 (26/8/5 s), bosses 0/3 (46/117/83 s) |
| warden | 5 | FAIL: packs 3/3 (6/5/6 s), bosses 0/3 (39/51/30 s) | FAIL: packs 3/3 (5/8/11 s), bosses 0/3 (59/38/39 s) |
| warden | 12 | ok: packs 3/3 (101/59/29 s), bosses 2/3 (178/96/152 s) | ok: packs 2/3 (120/88/50 s), bosses 1/3 (300/106/136 s) |
| warden | 25 | ok: packs 3/3 (11/7/47 s), bosses 2/3 (74/42/14 s) | ok: packs 3/3 (18/13/83 s), bosses 1/3 (68/80/47 s) |
| warden | 40 | ok: packs 3/3 (41/13/19 s), bosses 2/3 (44/44/18 s) | ok: packs 2/3 (50/23/19 s), bosses 2/3 (26/19/24 s) |
| mage | 1 | ok: packs 3/3 (9/4/2 s), bosses 1/3 (26/55/23 s) | ok: packs 3/3 (9/4/2 s), bosses 1/3 (26/55/23 s) |
| mage | 5 | ok: packs 3/3 (3/6/3 s), bosses 1/3 (22/47/34 s) | FAIL: packs 3/3 (4/6/3 s), bosses 0/3 (49/50/27 s) |
| mage | 12 | ok: packs 3/3 (9/1/4 s), bosses 2/3 (34/16/49 s) | ok: packs 3/3 (11/2/4 s), bosses 2/3 (37/18/33 s) |
| mage | 25 | ok: packs 3/3 (0/0/2 s), bosses 3/3 (47/39/19 s) | ok: packs 3/3 (0/0/2 s), bosses 3/3 (37/51/19 s) |
| mage | 40 | ok: packs 3/3 (18/2/0 s), bosses 2/3 (55/18/20 s) | ok: packs 3/3 (18/2/0 s), bosses 3/3 (47/18/20 s) |
| shadowblade | 1 | ok: packs 3/3 (13/5/4 s), bosses 2/3 (19/41/23 s) | ok: packs 3/3 (18/5/5 s), bosses 2/3 (32/52/32 s) |
| shadowblade | 5 | ok: packs 3/3 (4/3/7 s), bosses 2/3 (20/25/11 s) | ok: packs 3/3 (4/5/6 s), bosses 2/3 (32/22/19 s) |
| shadowblade | 12 | ok: packs 3/3 (22/12/7 s), bosses 3/3 (39/16/16 s) | ok: packs 3/3 (24/15/8 s), bosses 3/3 (50/19/20 s) |
| shadowblade | 25 | ok: packs 3/3 (5/4/18 s), bosses 3/3 (41/29/11 s) | ok: packs 3/3 (10/6/31 s), bosses 1/3 (39/68/11 s) |
| shadowblade | 40 | ok: packs 2/3 (55/17/5 s), bosses 1/3 (49/51/51 s) | FAIL: packs 2/3 (54/18/13 s), bosses 0/3 (23/69/68 s) |
| revenant | 1 | ok: packs 3/3 (6/3/3 s), bosses 3/3 (17/38/15 s) | ok: packs 3/3 (7/3/4 s), bosses 2/3 (24/40/24 s) |
| revenant | 5 | FAIL: packs 3/3 (7/9/7 s), bosses 0/3 (30/44/24 s) | ok: packs 3/3 (5/7/3 s), bosses 1/3 (44/37/31 s) |
| revenant | 12 | ok: packs 1/3 (11/12/8 s), bosses 3/3 (77/41/48 s) | ok: packs 1/3 (12/14/8 s), bosses 2/3 (75/34/60 s) |
| revenant | 25 | ok: packs 3/3 (2/1/10 s), bosses 3/3 (20/20/11 s) | ok: packs 3/3 (2/1/10 s), bosses 3/3 (25/20/10 s) |
| revenant | 40 | ok: packs 3/3 (9/7/6 s), bosses 2/3 (17/21/20 s) | ok: packs 3/3 (9/5/6 s), bosses 3/3 (31/38/19 s) |
| ranger | 1 | ok: packs 3/3 (7/2/2 s), bosses 3/3 (22/38/20 s) | ok: packs 2/3 (13/5/3 s), bosses 3/3 (38/66/38 s) |
| ranger | 5 | FAIL: packs 3/3 (9/11/7 s), bosses 0/3 (45/37/16 s) | FAIL: packs 2/3 (15/7/9 s), bosses 0/3 (50/62/27 s) |
| ranger | 12 | FAIL: packs 1/3 (120/57/63 s), bosses 0/3 (72/14/40 s) | FAIL: packs 0/3 (95/49/16 s), bosses 0/3 (66/11/46 s) |
| ranger | 25 | ok: packs 3/3 (8/6/12 s), bosses 1/3 (37/14/16 s) | ok: packs 3/3 (8/9/16 s), bosses 1/3 (19/14/17 s) |
| ranger | 40 | ok: packs 1/3 (24/7/12 s), bosses 1/3 (20/18/32 s) | FAIL: packs 1/3 (20/9/18 s), bosses 0/3 (23/25/57 s) |
| paladin | 1 | ok: packs 3/3 (21/8/7 s), bosses 3/3 (48/101/38 s) | FAIL: packs 2/3 (15/12/9 s), bosses 0/3 (82/171/98 s) |
| paladin | 5 | FAIL: packs 3/3 (6/6/13 s), bosses 0/3 (51/54/25 s) | FAIL: packs 3/3 (8/13/20 s), bosses 0/3 (52/59/41 s) |
| paladin | 12 | ok: packs 3/3 (38/15/13 s), bosses 3/3 (64/29/29 s) | FAIL: packs 2/3 (34/47/19 s), bosses 0/3 (79/35/50 s) |
| paladin | 25 | ok: packs 3/3 (25/10/53 s), bosses 1/3 (94/60/43 s) | FAIL: packs 3/3 (22/13/83 s), bosses 0/3 (51/67/61 s) |
| paladin | 40 | ok: packs 3/3 (29/7/15 s), bosses 3/3 (43/37/15 s) | ok: packs 3/3 (43/10/19 s), bosses 1/3 (51/75/21 s) |
| shapeshifter | 1 | ok: packs 3/3 (11/5/4 s), bosses 3/3 (22/49/24 s) | ok: packs 2/3 (13/6/7 s), bosses 2/3 (40/86/40 s) |
| shapeshifter | 5 | FAIL: packs 3/3 (5/5/8 s), bosses 0/3 (22/41/19 s) | ok: packs 3/3 (8/8/5 s), bosses 1/3 (26/41/37 s) |
| shapeshifter | 12 | ok: packs 2/3 (40/20/16 s), bosses 1/3 (84/38/43 s) | FAIL: packs 2/3 (15/28/26 s), bosses 0/3 (65/44/46 s) |
| shapeshifter | 25 | ok: packs 3/3 (14/11/37 s), bosses 1/3 (33/28/21 s) | ok: packs 3/3 (73/21/94 s), bosses 1/3 (62/51/35 s) |
| shapeshifter | 40 | FAIL: packs 2/3 (54/20/24 s), bosses 0/3 (28/66/43 s) | FAIL: packs 1/3 (37/16/30 s), bosses 0/3 (48/45/46 s) |

7 of 35 failed before, 13 of 35 after. Walled now and not before: warden
d1, mage d5, shadowblade d40, ranger d40, paladin d1, d12 and d25,
shapeshifter d12. Passing now and not before: revenant d5, shapeshifter
d5. The paladin (two-handed mace, 0.84-0.98 swings a second, was 2.38)
and the warden lose the most; the mage and revenant barely move. Both
logs: scratchpad `curve-before.keep` and `curve-after-sc.log`. Both runs
print the pre-existing CombatFeel.onKill TypeError lines (see "For
skillqa").

### Item speed (milestone 3)

One curve shrinks every item speed line: f(v) = sign(v) x round(40|v| /
(|v| + 40)). 3 stays 3, 6 -> 5, 10 -> 8, 15 -> 11, 20 -> 13, 25 -> 15,
30 -> 17, 40 -> 20, 50 -> 22, 72 -> 26.

| Source | Before | After |
| --- | --- | --- |
| `pre/suf.aspd`, `pre/suf.cspd` | 3-6 ... 34-40 | 3-5 ... 19-20 |
| `.great` (rare only) | 42-72 | 21-26 |
| `suf.gloves.grip` | 12-47 | 9-22 |
| `pre.orb.conduit` | 14-54 | 10-23 |
| Base implicits | up to 20-32 | f on both ends, up to 13-18 |
| Uniques, extra lines, set pieces | up to 58 | f (Windforce 25-35 -> 15-19) |
| Depth unique curve (`kit.ts`) | 8 + 0.25 x ilvl | 7 + 0.12 x ilvl |
| Set bonuses | 10-30 | 8-17 (text too) |
| Grand charm line | 2-32 | 1-8 (`CHARM_SPEED_SHARE` 0.5) |
| Unique charms | up to 26 | half of f |
| Garnet / opal in a weapon | 4/7/11/15/20/27 | 2/3/4/6/8/10 |
| Runes | 3, 10, 12 / 5, 10, 14 | 2, 6, 7 / 3, 6, 8 |
| Runewords | 5-10 + 2-3 a cut (max 25) | 4-8 + 1-1.4 a cut (max 15) |
| Item powers | +12 to +25, costs -12 to -25 | f: +9 to +15, costs -9 to -15 |

Item price per speed point went 16 -> 26 (`STAT_VALUE`), so speed items
keep about their price. Power costs now read "you lose 13% cast speed"
(points of the stat, like a gear line) instead of "you cast 20% slower",
since the real rate comes out of the diminishing-returns curve and the
character panel shows it. Skill passives, buffs, boons and statuses were
not changed (class streams own the passives; all of it goes through the
same curve and ceiling).

What happens to old saves: `SAVE_VERSION` is now 3. The first load of an
older save runs `rescaleOldSpeed` (`sim/Loot.ts`) on every item the
account holds (worn, pack, vault, map loot, the Enchanter's waiting
offers): each attack and cast speed line goes through f (halved on a
charm), a rolled line is then held in its tier's range today (anvil
bonus up to 12% over still allowed), and `refreshFixedLines` holds unique
and set lines in theirs. f only rises, so the top of an old range lands at
the top of the new one and the bottom at the bottom. The save is written
back as version 3 and the step never runs twice. `check-save` has a case
for it (old top 40 -> 20, old bottom 34 -> 19, grand charm 32 -> 8,
Windforce 35 -> 19 and 25 -> 15, second load unchanged).

### Requests from the class streams (coordinator, for milestone 5)

Handle in milestone 5 or write the gap in the Handover:
1. sk-paladin: every weapon blow connects within `CONTACT_CAP` 0.16 s
   (`Player.ts`), so heavy blows land as fast as a jab. Contact should
   follow the action's own time, on the clip's hit frame.
2. sk-paladin: rushes (up to 9 m in about 0.13 s) read as a blink. Add a
   travel time that follows distance and speed if the model has a place
   for it, else note the gap.
3. sk-paladin and sk-mage: spells and throws release on the key press, not
   on the gesture's release frame. Add a shared release-frame hook if it
   belongs in the model, else note it.
Full notes: `docs/remake/sk-paladin.md`, `docs/remake/sk-mage.md`.

## For the owner to test

(empty)

## For skillqa

- `check-economy` fails once: "shapeshifter: no set or unique in a whole
  descent at depth 30" (retried, same result; the sim is seeded). Drop
  rates are untouched; narrow speed ranges (lo = hi) skip a random draw in
  `rollValue`, so the seeded descent rolls different items. Luck, not a
  rate change, but worth a look if it stays red.

- `check-curve` prints "[feel] hit report failed TypeError: Cannot convert
  object to primitive value" from `CombatFeel.onKill` about 1500 times a run
  (seen before any skillcore change).

## Handover

(empty)
