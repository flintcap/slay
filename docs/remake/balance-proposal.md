# Item balance proposal (needs the owner's OK)

Nothing on this list is applied yet. Say which numbers you approve (for
example "yes to 1 to 6, no to 9"), and milestone 5 of `balance.md` applies
exactly those.

## How it was measured

`node tools/balance-report.mjs` (new, headless, read only) prints every
table this page quotes. A stat line is scored as a share of a unique's usual
top roll at that item level, so "+20 life" and "+5% fire resist" sit on one
ruler (the same ruler `check-setpower` already uses). 1.0 means "as good as
a unique's usual line for that level". Powers and skill bends are not
counted; 302 of the 367 worn uniques have one.

Kills are an average floor kill (mostly plain monsters, some champions and
elites). A descent is roughly 500 to 1,500 kills.

## Short version

- **Runes are almost never found.** The first rune takes about 1,700 kills
  at depth 60. 16 of the 22 runewords need a rune that takes over 40,000
  kills, and the top ones take billions. This is the biggest problem.
- **Uniques do not grow when found deeper**, but set pieces do. 207 of 367
  uniques are weaker than an ordinary rare when they drop 20 levels past
  their own level, while they still drop at full rate.
- **Deep uniques (item level 55 and up) lag rares**, because rares jump
  when their "greater" lines open at 55. 45 of 132 sit under a usual rare.
- **A lot of deep loot cannot be worn yet**: at depth 40 about 1 in 5 drops
  needs a higher level than the hero has.
- **The depth gate shows the wrong item level** (64 at depth 40; kills
  really drop item level 46).
- Charms, prices, set pieces and the normal drop odds look healthy: no
  change proposed.

## The change list

Each line: what, from, to, why.

1. **Rune drop rate.** Rune weight in `socketableWeight` (`src/data/gems.ts`):
   from `40 / 1.34^(n-1)` to `300 / 1.22^(n-1)` (n = the rune's place on the
   ladder, 1 to 33). Why: runes share one drop roll with 66 gems, and today
   they are about 5% of it. Kills to own one at depth 100, today then after:
   Ashk 1,845 to 355; Kell 34,000 to 2,600; Vosk 861,000 to 23,000; Kharvos
   3.7 million to 62,000; Vorhal 12 million to 138,000; Slay 21.5 million to
   206,000. The top rune stays a real chase (over 100 descents); the middle
   runewords become reachable.

2. **Keep gems as common as now.** Gem or rune chance per kill
   (`RANK_PROFILE.socketableChance` in `src/sim/Loot.ts`): every rank times
   1.45 (plain 0.035 to 0.051, champion 0.10 to 0.145, elite 0.17 to 0.25,
   rare 0.26 to 0.38, boss 0.85 to 1.0). Why: with change 1, runes take a
   bigger share of the roll; this puts gems back where they are today, so
   change 1 is pure gain. Runes then come about 1.45 times faster again than
   the numbers in line 1.

3. **Rune prices follow rune rarity.** Rune value (`RUNES` in
   `src/data/gems.ts`): from `40 x 1.42^n` to `40 x 1.30^n`. Slay rune value
   from 4.2 million to 230,000 gold. Why: fusing three runes costs 30% of
   the rune's value in gold. Today fusing three Thessik runes costs 444,000
   gold, about 480 kills' worth of gold at depth 80, for a rune that is now
   much easier to find.

4. **Weak rune lines made worth socketing.** In `RUNE_ROWS`
   (`src/data/gems.ts`), with the share of a unique line at the rune's level
   before and after:
   - Uld: weapon +22% to +70% enhanced damage (0.12 to 0.38); armour +30% to
     +90% enhanced defence (0.14 to 0.42).
   - Kharvos: weapon +45% to +120% enhanced damage (0.19 to 0.50).
   - Pell, Quor, Rusk, Skarn: +10 to +15, +16, +17, +18 of their attribute
     (0.5 to about 0.84).
   - Gest, Hask, Irn, Juv weapon element: 12, 14, 18, 13 to 24, 28, 34, 26
     (about 0.3 to 0.6).
   - Esk jewellery: +6% to +12% arcane resist (0.27 to 0.54).
   - Dagh jewellery: +2% to +4% block (0.21 to 0.42).
   Why: these sit far under a gem of a lower level (a level 32 gem gives
   +15 attribute; the level 37 Skarn rune gives +10).

5. **Gem weapon element lines times 1.6.** Ruby, Sapphire, Topaz, Emerald
   and Amethyst weapon ladders in `GEM_FAMILIES` (`src/data/gems.ts`). For
   example Ruby from 3, 7, 13, 22, 36, 58 to 5, 11, 21, 35, 58, 93 fire
   damage. Why: these sit at about 0.25 to 0.3 of a unique line while the
   other gem lines sit at 0.6 to 1.0, so nobody would pick them.

6. **Uniques grow when found deeper**, the way set pieces already do. In
   `buildUniqueItem` (`src/sim/Loot.ts`): each number line grows by the
   same ratio an ordinary rare's line grows between the unique's own level
   and the drop's level, capped at 20 levels of growth. Skill levels stay as
   written. Why: today 207 of 367 uniques fall under an ordinary rare when
   found 20 levels deep, while their drop rate is still full. Old uniques
   still fade from the table past 20 levels, as now.

7. **Deep uniques lifted.** Uniques of item level 55 and up: number lines
   times 1.3 (from as written to 1.3 times, skill levels unchanged). Why:
   45 of the 132 deep uniques sit under an ordinary rare at their own level
   (the worst at 0.73 of one). All of them have a power, so none is dead,
   but a unique should not be a step down in numbers.

8. **Mid-game rares stop rolling junk** (optional, see note). In
   `eligibleTiers` (`src/sim/Loot.ts`): an affix may roll its best 4
   unlocked steps, not its best 5. Average rare score at item level 45 from
   1.37 to 1.70; at 60 from 2.18 to 2.96; at 90 from 3.05 to 3.83. Why: at
   item level 30 to 50 the lowest step still has the most weight, so "+1 to
   3 Strength" is the most common roll on a level 45 rare. Note: this makes
   every rare about 25% to 35% better, at every depth. Set pieces follow it
   on their own. If you approve 8, line 7 should be times 1.5 instead of
   1.3, or deep uniques fall further behind (measured: worst unique would
   drop to 0.58 of a rare).

9. **More drops the hero can wear** (optional). In `baseDropWeight`
   (`src/data/itemBases.ts`) and `uniqueDropWeight` (`src/data/uniques.ts`):
   a base or unique whose wear level is above 0.85 times the item level
   drops at a quarter of its weight (today: full weight up to item level
   plus 2). Wearable share of drops, today: depth 25 95%, depth 40 82%,
   depth 60 about 61%; uniques 90%, 75%, about 55%. Why: drops come out at
   item level depth x 1.15, but the hero gains levels slower than that, so
   more and more of what drops must sit in the stash. (Depth 60 uses an
   estimated hero level; the class checker stops at depth 40.)

10. **The depth gate tells the truth about item level.**
    `itemLevelForDepth` (`src/sim/Difficulty.ts`): from `depth x 1.6` (soft
    cap past 60) to `depth x 1.15`, the formula monsters really use. Only
    the gate panel and the depth summary text read it, so no drop changes.
    Why: the gate says item level 64 at depth 40; kills drop 46 (48 from
    champions and up).

## Checked, no change proposed

- **Charms.** Score per pack cell: small 0.20, medium 0.15, large 0.14,
  grand 0.11 plus the grand-only lines (skills, crits, cast speed). That is
  what the charm design note asks for.
- **Prices.** A rare body armour costs 37 to 105 kills of gold to buy; a
  gamble costs 38 to 51 kills at every depth. Steady from depth 1 to 80.
- **Normal drop odds.** About 1 rare per 110 to 130 kills, 1 set piece per
  260 to 980, 1 unique per 520 to 1,950 (fewer early on purpose).
- **Set pieces.** `check-setpower` passes: every piece beats a usual rare,
  431 of 441 beat a good one.
- **Unique tiers.** At their own level, uniques average 1.76 times a usual
  rare, mythics 2.19 times, ancients 3.68 times.
- **Gambling odds.** 5.5% unique and 1% mythic per gamble; at 40 kills of
  gold a gamble, that is about one unique per 730 kills of gold, close to
  the drop rate.

## What I would do

Approve 1 to 7 and 10. They only make loot better or more honest, and
nothing gets weaker. 8 and 9 are bigger shifts in how loot feels; I lean
yes on both, but they are your call.
