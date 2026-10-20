# Stream: sk-paladin (Wave 5: Paladin skills remake)

Status: in progress

Class: Paladin (code id `paladin`). Trees: Mace, Blade, Aura (`palMace`, `palBlade`, `palAura`). Port 4357.
Fights with melee: maces, scepters, swords, shields (starts with a club and a buckler). Class color: candle gold (`0xe8cf96`).

Goal (owner): fix every Paladin skill and remake the kit to a AAA
standard. Keep the skills that are good, change the ones that are close,
replace the ones that feel lackluster, and add new skills where the kit has
a gap. Fix everything about the rest. Speeds stay near the feel of
similar classes in Diablo II and Path of Exile (our own numbers and names,
never theirs).

Milestones 1 and 2 (skill audit and new kit plan) only read code and write
in this file, so they may run while skillcore is still working. Milestone 3
on needs skillcore: if `skillcore.md` does not say `Status: done` when you
finish milestone 2, push your file, set `Status: waiting for skillcore`, and
end with one line saying so; you will be resumed. Once it is done, read its
"Handover" and `CONTRACTS.md` first: time every skill through skillcore's
fields and speed function, never with new hard-coded seconds. Do not touch
code before skillcore is done.

Your files (Wave 5 file ownership in `PLAN.md`): `src/data/classSkills/paladin.ts` and `paladinStatuses.ts`, and `src/scenes/paladin/*`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=paladin`). Browser, one at a time, at
most once per milestone: `check-skills --classes=paladin`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Mace skills should feel heavy and stunning, blade skills quick and
  exact, auras calm and steady. Only one aura at a time stays true.

## Milestones

- [x] 1. Skill audit (read code only). (sk-paladin: skill audit and kit plan) For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. Plan the new kit (sk-paladin: skill audit and kit plan) (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. Speed audit (sk-paladin: speed audit) (owner: before any skill is changed). Under skillcore's model, write a table
  under "Notes for resume": the Paladin's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [x] 4. Build (sk-paladin: build). Make the changes, replacements and new skills from the
  plan. Every skill, old and new:
  - works, with its tooltip telling the truth (`check-skillparams`,
    `check-stattext`)
  - gets stronger every rank (damage, strength, time, size), not only
    cheaper or faster (`skillPower` lines, `check-rankpower`)
  - melee: its own swing animation with a clear wind up, hit and follow
    through, timed to the skill's speed
  - ranged and spells: its own projectile or cast effect, motion and hit
  - its own sound (`check-skillsound`)
  - mana only, no new resources; caster weapons have no basic attack
  - synergies, skill bends and the uniques and sets that name it still
    point at real skills and real settings
  - old saves stay safe: removed or moved skills refund their points and
    leave the hotbar (check that `src/sim/Character.ts` still does this for your ids)
  - all player text through `tr()`, then extract strings (`check-i18n`)
- [x] 5. Icons (sk-paladin: icons). Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
- [ ] 6. Effects quality and cost. Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
- [ ] 7. Check. `check-skills --classes=paladin` once (one retry if it fails,
  then note it) and `check-curve --classes=paladin` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

1. Milestone 6: effects polish and cost (the looks in `fx/paladin/`
   already exist and are warmed; check per-frame code for allocation).
2. Milestone 7: `check-skills --classes=paladin` once (get-chrome first,
   `mkdir -p shots`, flock, timeout 3500), `check-curve --classes=paladin`
   once.
3. Milestone 8: handover.

## Notes for resume

### Milestone 5: icons

- The Paladin has his own icon set, `art/icons/paladinIcons.ts`: every key
  is `pl-<name>` and is spread into `ICON_MAP`, so no other class's name can
  be picked up. No two skills in the game share a picture (checked across
  every class's icon keys; Vespers was the last one, a copy of the
  Shapeshifter's Night Hunt, now a rosary under the aura ring).
- New glyphs in `art/PaladinGlyphs.ts`: `plsword` (the Blade tree's arming
  sword in nine poses), `pldoor` (a chapel door, barred or broken in),
  `plstone` (a hewn church step, cracked, or two steps) and `plboot` (an
  armoured foot on a measured line, or a step aside). `scroll` v3 is the
  Red Psalm, written in blood.
- The 7 copies have their own picture: Doorbreaker (door broken in), Weight
  of Stone (two steps), Answer in Steel (crossed swords, sparks), Whetted Faith
  (sword on a whetstone), Confession Thrust (a level thrust), Red Psalm (the blood
  scroll), Measured Step (the foot on its rule). The 5 off-theme ones were
  redrawn: Feint (a ghost step aside), Crosswise (crossing cuts), Sevenfold
  (seven thrusts), Mercy Stroke (point down over a drop), Saint's Reach (the
  long reach). Oath Cut, Turn the Blade, Twin Verse and Last Rites now use
  the same sword so the tree reads as one.
- Each tree has its own light (`CLASS_LOOK.paladin.trees`): Mace bell
  bronze, Blade whitened steel, Aura candle gold.
- Looked at all three trees on a contact sheet (`check-skillicons`): every
  icon reads at hotbar size. i18n, iconmatch, passives, rankpower,
  skilldepth and stattext pass.

### Milestone 4: what was built

- Rites (`scenes/paladin/Rites.ts`): every blow lands on its gesture's
  contact; flurries (Twin Verse, Litany, Crosswise, Sevenfold) land on the
  gesture's own `cuts` and stop on a dodge or a new action, and a cut needs
  the target in reach. Knell's echo stays free.
- Doorbreaker runs at 14 m/s (`RUSH_SPEED`, `travelTime`), Confession
  Thrust lunges at 12 m/s, Feint steps to the side and Last Rites goes to
  the side and round behind at 10 m/s, all carried by `Player.carry` with
  the blow on arrival; the action is at least twice the run so a move order
  cannot cut it. A rush or lunge is refused while rooted. Bodies in
  Doorbreaker's lane are knocked aside for 25% (`shove`).
- Crushing Weight, Red Rosary's more damage and its crit Opens moved to
  `SkillRunner.tune`: every hit of the hero counts them.
- Pilgrim's Maul breaks the floor: others within 3 m (+0.05 a rank) take
  20%, their Dents spent the same way. Crosswise's first cut sweeps 150
  degrees within 3 m. Relic Bash reads Dents and leaves them. The Last
  Bell's Toll is seen (bronze ring) and heard (the bell's note).
- Turn the Blade: window +0.03 s a rank; the first blow it turns is
  answered at once with its own riposte action
  (`skill.turnTheBlade.answer`), else the answer comes as the guard drops.
- Saint's Reach: dexterity gone; Blade skills reach 0.4 m further, and each
  Blade cut carries on into the nearest enemy behind its target (2 m) for
  30% (+2% a rank). Rule in `sim/passives/paladin.ts`.
- Vigils: each reads its own bent knobs and its own `radius` (Wide Wick and
  aura reach on top), a bend's `more` raises its damage, and the burn and
  toll land flat (`VigilHost.flat`). Tolling Bell's toll draws a bronze
  ring out to its real reach. Censure and The Last Hour let go on the
  gesture's frame (`atRelease`); Censure's leap draws a line of ash; The
  Last Hour calls a real bronze bell (`fx/paladin/GreatBell.ts`) that hangs
  over its target as it falls.
- Hurl the Censer throws a real censer on its chain
  (`fx/paladin/Censer.ts`) on the throw frame.
- Self rites (Bar the Door, Turn the Blade) and rushes no longer walk to
  the enemy first (`Controls.ts`).
- Every weapon skill has its own blow in `art/hero/gestures/paladin.ts`
  (with `alt.great` for a two-hander); the Paladin `PLAIN_MOVES` are gone.
  Hit looks are in `fx/paladin/RiteLooks.ts`, warmed by
  `paladinStandIns()` in `DungeonScene.warmup()`.
- Checkers: rankpower, stattext, i18n, iconmatch, skilldepth, passives
  pass. skillparams and skillsound fail only on Ranger and Revenant skills
  (their streams are still building).

### Milestone 3: speed audit (read from the code after skillcore, 0616b06)

How it works now (`sim/Speed.ts`): a rite is an attack (family `rite`),
`pace.attack` = its `attackTime` swings of the weapon in hand; a vigil is a
spell (`vigil` is not in `CAST_BASE`), `pace.cast` = its `castTime`
seconds. Before this milestone `Rites.ts` and `Vigils.ts` multiplied their
own `time` factor onto one swing or one 0.5 s cast; those factors are gone
and each skill carries its own `attackTime` / `castTime` in `paladin.ts`.
Speed gear: summed % through `100p/(p+100)`, so x1.5 at +100% and never
past x2; the attack ceiling is 3 a second (0.33 s), the cast ceiling 3.4 a
second (0.29 s). A rush or step adds its travel by distance
(`travelTime`, 14 m/s rush, 12 lunge, 10 step) before the blow. Columns:
seconds per use with no gear / at x2 (the limit). Weapon: 1h mace 1.05
(Mace) to 1.2 (Club); sword 1.4 (Short Sword; Broad 1.2, Rapier 1.55);
2h mace 1.00-1.08; 2h sword 1.08; spell 0.5 s.

| Use | Was | Now | No gear | Limit | Reference feel | Mark |
| --- | --- | --- | --- | --- | --- | --- |
| Basic, 1h mace | 1 swing | same | 0.83-0.95 | 0.42-0.48 | heavy one-hander, 0.8-1 s | right |
| Basic, scepter | 1 swing | same | 0.74-0.95 | 0.37-0.48 | as a mace | right |
| Basic, 1h sword | 1 swing | same | 0.65-0.83 | 0.33-0.42 | quick blade, 0.6-0.8 s | right |
| Basic, 2h mace / sword | 1 swing | same | 0.93-1.0 | 0.46-0.5 | big two-hander, about 1 s | right |
| Tolling Blow (mace) | 1.25 | 1.0 | 0.95 | 0.48 | the starter, a plain heavy blow | too slow, fixed |
| Shield Crack | 0.9 | 0.9 | 0.86 | 0.43 | a quick rim strike | right |
| Anvilfall | 1.55 | 1.3 | 1.24 | 0.62 | big two-hand drop | too slow, fixed |
| Doorbreaker | 1.1, 9 m in 0.3 s (30 m/s) | run by distance + 0.7 | 0.15-0.6 run + 0.67 | run + 0.33 | a charge you can watch | too fast (a blink), fixed |
| Knell | 1.35 | 1.3 | 1.24 | 0.62 | a heavy side blow | right |
| Pilgrim's Maul | 1.7 | 1.6 | 1.52 | 0.76 | the slow, long coil | right |
| Bar the Door | 0.8 | 0.6 | 0.57 | 0.33 | setting a shield, a beat | slightly slow, fixed |
| Hurl the Censer | 1.1, left on the press | 0.9, leaves on the throw frame | 0.86 | 0.43 | an underarm throw | slightly slow, fixed |
| Relic Bash | 1.0 | 1.0 | 0.95 | 0.48 | a shield punch | right |
| Iron Verdict | 2.0 | 1.8 | 1.71 | 0.86 | the biggest single blow | slightly slow, fixed |
| Oath Cut (sword) | 0.8 | 0.8 | 0.57 | 0.33 | a short thrust from guard | right |
| Turn the Blade | 0.7, answer had no swing | 0.6 guard, 0.8 answer | 0.43 + 0.57 | 0.33 + 0.33 | a parry then a riposte | answer fixed |
| Twin Verse | 1.0, gap 0.16 s fixed | 1.2, cuts on the gesture | 0.86 | 0.43 | two real cuts | too fast, fixed |
| Feint | 0.9, 5-hop slide | 1.0 + a 10 m/s step | 0.2 step + 0.71 | step + 0.36 | a side step and a cut | slide fixed |
| Litany | 1.5, gaps 0.12 s fixed | 1.6, cuts on the gesture | 1.14 | 0.57 | five cuts, one prayer | right, gaps fixed |
| Confession Thrust | 1.1, 5 m in 0.23 s (22 m/s) | 12 m/s lunge + 0.8 | 0.15-0.35 + 0.57 | lunge + 0.33 | a fencer's lunge | too fast, fixed |
| Crosswise | 1.1, gap 0.2 s fixed | 1.3, cuts on the gesture | 0.93 | 0.46 | a sweep and a downcut | too fast, fixed |
| Mercy Stroke | 1.0 | 1.0 | 0.71 | 0.36 | a stab | right |
| Sevenfold | 1.6, gaps 0.09 s fixed | 1.8, cuts on the gesture | 1.29 | 0.64 | seven thrusts | right, gaps fixed |
| Last Rites | 1.3, 5-hop slide | 1.1 + a 10 m/s step round | 0.3-0.5 step + 0.79 | step + 0.39 | a step round and a stab | slide fixed |
| Vigils (8 rings) | 0.5 x 1.2 | castTime 0.6 | 0.6 | 0.3 | a short calm rite | right |
| Anoint | 0.5 x 1.1 | 0.55 | 0.55 | 0.29 | a quick buff | right |
| Martyr's Vow | 0.5 x 1.2 | 0.6 | 0.6 | 0.3 | a quick buff | right |
| Censure | 0.5, landed on the press | 0.5, lands on the gesture | 0.5 | 0.29 | a pointed curse | right |
| The Last Hour | 0.5 x 1.3, bell called on the press | 0.8, called on the gesture, falls 0.7 s | 0.8 (+0.7 fall) | 0.4 | a long call | slightly fast, fixed |

Damage per hit is untouched everywhere. Tolling Blow, Anvilfall and Iron
Verdict are quicker than before; Twin Verse, Crosswise, Litany and
Sevenfold are a little slower because their cuts now follow the swing.

### Milestone 1: skill audit (read from the code on 2026-10-20, before skillcore)

How the Paladin's skills run today (read from the code, not notes):

- Data: `src/data/classSkills/paladin.ts`, three trees of 18, every slot
  used. Mace 10 actives / 8 passives, Blade 10 / 8, Aura 12 / 6. Statuses
  in `paladinStatuses.ts`. Passive rules in `src/sim/passives/paladin.ts`.
  Sounds in `src/audio/PaladinSounds.ts`. Glyphs in `src/art/PaladinGlyphs.ts`
  (mace, bell, censer, scroll, rosary, candle, rood, writ).
- Runner: `SkillRunner.cast` hands family `rite` (all 20 Mace and Blade
  actives) to `castRite` (`scenes/paladin/Rites.ts`) and family `vigil` (all
  12 Aura actives) to `castVigil` (`scenes/paladin/Vigils.ts`). A rite picks
  ONE target (`pickOne`: nearest the aim within reach, in front), plays
  `beginAction(skillAction(id) ?? rite.clip, attackTime * rite.time)`
  (attackTime = 0.42 / (1 + AS%)), and lands at `p.contactIn` if the action
  was not cut off and the target is still within reach + 0.6 m. Riders ride
  on `blow()`, which also applies Crushing Weight, Red Rosary and The Last
  Bell. Every rite hit goes through `landRite` (the full hit pipeline) and
  draws the shared `effects.meleeHit` spark. Vigils (rings) are lit with
  `castTime * 1.2` (0.6 s), burn until pressed again (free, before mana),
  tick twice a second (`pulse`) at 5 m whatever the rank, one at a time (two
  with Twin Wick, verified: `vigilSlots`).
- Body move: 17 of the 20 weapon rites are in `PLAIN_MOVES`
  (`art/hero/SkillActions.ts`): `slam` (Tolling Blow, Anvilfall, Knell,
  Pilgrim's Maul, Iron Verdict), `lunge` (Shield Crack, Doorbreaker, Relic
  Bash, Confession Thrust, Last Rites), `thrust` (Oath Cut, Feint, Mercy
  Stroke), `attack1` / `attack2` (Litany, Sevenfold / Twin Verse,
  Crosswise). `attack1` / `attack2` are the basic attack's own chain (with a
  shield: forehand, backhand, shield bash, `Actions.ts` `CHAINS.shield`), so
  those four swing exactly like a basic attack. `slam`, `thrust` and `lunge`
  are the same moves the Knight's Overhead, Ruin, Gash, Shield Bash and Maim
  play. Bar the Door, Hurl the Censer, Turn the Blade and all 12 Aura
  actives have their own gesture in `art/hero/gestures/paladin.ts`.
- Contact: `contactDelay` caps every weapon contact at `CONTACT_CAP` = 0.16 s
  (`Player.ts`), so every Mace blow, from Tolling Blow to "Judgement, in one
  blow", lands within 0.16 s of the press and the rest of the action is
  recovery. A release gesture (`skill.*` without `hit`) has contact 0: what
  it throws leaves on the press.
- Look: weapon rites draw no motif (`fx/paladin/motifs.ts` lists only Bar
  the Door, Hurl the Censer, Turn the Blade and the Aura actives) and no
  effect of their own: only the shared swing ribbon and the shared
  `meleeHit` spark. So 17 weapon skills look like a basic attack with a
  different number. Aura actives: the quiet candle ring (`fx/paladin/VigilRing.ts`,
  drawn 1.1 m at the feet by the owner's call) plus one motif each.
- Speed today (skillcore owns the model; milestone 3 redoes this): basic
  melee 0.42 s. Rites 0.42 x `time`: Oath Cut 0.34 s, Turn the Blade
  0.29 s, Shield Crack 0.38 s, Feint 0.38 s, Twin Verse / Relic Bash / Mercy
  Stroke 0.42 s, Doorbreaker / Hurl / Confession / Crosswise 0.46 s,
  Tolling Blow 0.53 s, Last Rites 0.55 s, Knell 0.57 s, Litany 0.63 s,
  Anvilfall 0.65 s, Sevenfold 0.67 s, Pilgrim's Maul 0.71 s, Iron Verdict
  0.84 s, Bar the Door 0.34 s. Vigils 0.6 s, Anoint 0.55 s, Martyr's Vow
  0.6 s, Censure 0.5 s, The Last Hour 0.65 s plus 0.7 s fall. Flurry gaps
  (Twin Verse 0.16, Litany 0.12, Crosswise 0.2, Sevenfold 0.09, Knell echo
  0.55) are fixed seconds that do not follow speed.
- Icons: `ICON_MAP` in `art/SkillIconArt.ts`, `glyph[:variant][^modifier]`.
  Every Paladin icon has the class's hammered bronze ring and candle gold
  light (fire skills: the fire tone); the three trees differ only by the
  pips. The Paladin's own glyphs are well themed, but they are spread thin:
  `sword` x7, `bell` x5, `candle` x5, `mace` x4, `rood` x4, `scroll` x4. Seven
  plans are exact copies of other classes' icons: doorbreaker = Knight's
  Shield Bash (`shield^impact`), weight-stone = Knight's Immovable
  (`boulder`), answer-steel = Knight's (`sword^rise`), whetted-faith =
  Knight's Sworn Brother (`sword^aura`), confession = Knight's (`sword^speed`),
  red-psalm = Knight's Oath of Blood and Revenant's Curse of Blood
  (`drop^aura`), measured-step = Knight's and Ranger's (`footprints`). Off
  theme: `dagger` for Crosswise and Sevenfold (a Paladin cannot hold a
  dagger), `hourglass` for Mercy Stroke (the Revenant's doom glyph), `lance`
  for Saint's Reach.
- Sound: every active has its own row, 54 `skill.pal.*` bank ids, all
  used (no free take left for new sounds). Passive procs (The Last Bell's
  Toll, Answer in Steel's counter) have no sound of their own.
- Uniques that bend Paladin skills (`data/uniqueBatches/*`): Litany (`cuts`
  +2), Knell (`ring`, `echo`), Anvilfall (`dents` +1, `reach`), Hurl the
  Censer (`range`, `duration`), Tolling Bell (`radius`, `ring`, +20%),
  Bar the Door (`duration`, `block`, `dr`), Consecrated Ground (`radius`,
  `slow`, `drag`, +25%), Mercy Stroke (`threshold`, `reach`, +30%). Rites
  read the bent `num` from the runner, so those six work. Vigil ticks read
  the raw params (`reader(def)` in `Vigils.ts`) and the hard-coded 5 m
  (`reachOf`), so the Tolling Bell and Consecrated Ground uniques do
  nothing. No set names a Paladin skill. No entry in `skillBends.ts` is
  Paladin-only.

Legend: works = the code does what the tooltip says. Move: own = its own
gesture; plain = a shared plain move. Speed is today's, before skillcore.
Verdict: K keep, C change, R replace.

| Skill (tier.col) | Works? | Move | Effect | Too fast? | Icon | Verdict, why |
| --- | --- | --- | --- | --- | --- | --- |
| **Mace** | | | | | | |
| Tolling Blow (1.0) | Yes (150%, Staggered 2 s) | plain `slam` (shared with 4 Mace skills and the Knight's) | swing ribbon + shared spark | yes: 0.53 s, lands at 0.16 s | mace^impact | C: own bell-ringer's overhand, a bronze ring off the head |
| Hallowed Iron (1.1) | Yes | - | - | - | mace:2 | K |
| Shield Crack (1.2) | Yes (Rung 1 s +0.03 a rank, shove 1.5) | plain `lunge`: a weapon lunge, the shield still | ribbon + spark | yes: 0.38 s | shield^burst | C: own rising rim strike, iron spark at the rim |
| Anvilfall (2.0) | Yes (2 Dents, 6 s) | plain `slam` | ribbon + spark | yes: lands at 0.16 s of 0.65 s | anvil^impact | C: own straight-down drop, floor crack, dent spark |
| Forged Faith (2.1) | Yes | - | - | - | anvil^aura | K |
| Doorbreaker (2.2) | Half: a rush of up to 9 m is done in 0.13 s (over 50 m/s, `rushTo` at `contactIn * 0.9`), a skating lunge that reads as a blink | plain `lunge` | ribbon + spark | yes | shield^impact (copy of Knight's) | C: a real shield-first run, blow on arrival, dust wake |
| Knell (3.0) | Yes (echo 50% after 0.55 s, Rung 0.6 s) | plain `slam`; nothing shows at the echo | ribbon + spark | yes: 0.57 s | bell:2 | C: own clapper side swing, a sound ring at the echo |
| Crushing Weight (3.1) | Half: read only in `blow()` (rites); basic attacks, counters and vigil blows ignore it; the tooltip says "+7% damage" plainly | - | - | - | boulder^impact | C: read for every hit of the hero |
| Bellguard (3.2) | Yes (`paladinBlocked`) | - | - | - | bell^aura | K |
| Pilgrim's Maul (4.0) | Yes (spends Dents, +30% each) | plain `slam`: "a long, slow blow" lands at 0.16 s of 0.71 s | ribbon + spark | yes | mace:1^impact | C: own long coil; the floor breaks round the target (the Mace crowd blow) |
| Iron Penance (4.1) | Yes (`onHitStatuses`, any physical hit) | - | - | - | crack^chain | K |
| Bar the Door (4.2) | Yes; but with an enemy under the cursor it walks to it first (`needsReach` in `Controls.ts` counts self rites); its `alt.great` keys are dead (the rite refuses without a shield) | own | self burst + domes pulse | ok (0.34 s) | tower^field | K (small fix: no walk) |
| Hurl the Censer (5.0) | Yes (fire, Smoked 4 s +0.1) | own gesture; the censer leaves on the press, not the throw frame | a generic fire ball with an arc (`effects.projectile`, `impact: false`), the shared spark on landing | ok | censer:1 | C: a real censer on its chain, an ash and coal burst |
| Weight of Stone (5.1) | Yes | - | - | - | boulder (copy of Knight's) | K |
| Relic Bash (5.2) | Yes; but it spends Dents for a small heal, fighting Pilgrim's Maul and Iron Verdict for the same Dents | plain `lunge` | ribbon + spark | yes: 0.42 s | chalice^impact | C: own shield-boss punch; reads Dents, leaves them |
| The Last Bell (6.0) | Yes, for Mace skills only (Knell's echo counts as a second blow); the tooltip says "Mace blow"; the Toll has no look or sound | - | none | - | bell:1^rise | C: a seen and heard Toll, true tooltip |
| Iron Verdict (6.1) | Yes (500%, Rung 0.4 s +0.4 a Dent, cap 2.5) | plain `slam`: lands at 0.16 s, as quick as a jab | ribbon + spark | yes | mace:2^burst | C: own huge blow with a held wind up, cracked floor star |
| Unbroken (6.2) | Yes | - | - | - | helm^aura | K |
| **Blade** | | | | | | |
| Oath Cut (1.0) | Yes (one Opened stack, 12% share, 5 s) | plain `thrust` | ribbon + spark | yes: 0.34 s, quicker than a basic swing | sword^impact | C: own short thrust from the guard, a cut mark |
| Blade Catechism (1.1) | Yes | - | - | - | scroll | K |
| Turn the Blade (1.2) | Half: the answer lands 1.2 s later on whoever is in front whether or not a blow was blocked, with no swing (no action starts) and no look | own (guard) | crescents orbit | ok | sword^spin | C: the first blocked blow is answered at once with a riposte cut |
| Twin Verse (2.0) | Yes (two cuts) | plain `attack2` = basic chain blow: one swing, two cuts | ribbon + spark | yes | sword^chain | C: own two cuts, each on its own swing |
| Red Psalm (2.1) | Yes (`vsBleedingPct`; Opened is a physical dot, so it counts) | - | - | - | drop^aura (copy of two others) | K |
| Feint (2.2) | Yes (flank step, Exposed 4 s) | plain `thrust`; `stepTo` slides 2 to 3 m in 0.1 s | ribbon + spark | yes | footprints^speed | C: own fake high and cut from the side, a real step |
| Litany (3.0) | Half: five cuts on one swing; the cuts are not tied to the action (a dodge does not stop them, they land after he walks off) and the gaps are fixed, so at high speed two Litanies overlap | plain `attack1` | ribbon + spark | yes | scroll:1 | C: own five cuts walking forward, each on its hit |
| Measured Step (3.1) | Yes | - | - | - | footprints (copy) | K (speed numbers in M3) |
| Answer in Steel (3.2) | Yes (shared `blockCounter*`, `counterAttack`) | the counter has no swing (shared with Knight's Riposte) | shared | - | sword^rise (copy) | K |
| Confession Thrust (4.0) | Yes (spends Opened, +40% each); the 5 m rush takes 0.13 s | plain `lunge` | ribbon + spark; nothing when wounds confess | yes | sword^speed (copy) | C: own fencer's lunge at a real speed, a blood burst a wound |
| Whetted Faith (4.1) | Yes | - | - | - | sword^aura (copy) | K |
| Crosswise (4.2) | Yes (two cuts, Exposed on the second), but it is Twin Verse again with another rider | plain `attack2` | ribbon + spark | yes | dagger:1^burst (a dagger) | C: the Blade crowd blow, a flat sweep then a down cut |
| Mercy Stroke (5.0) | Yes (x8 below 15%, never a boss) | plain `thrust` | ribbon + spark | yes | hourglass^impact (Revenant's glyph) | C: own point-down stroke, a heavy burst when mercy lands |
| The Fifth Verse (5.1) | Yes (`guaranteedCritEvery`) | - | - | - | scroll^rise | K |
| Sevenfold (5.2) | Half: as Litany (one swing, cuts untied, fixed 0.09 s gaps) | plain `attack1` | ribbon + spark | yes: 7 hits in 0.7 s at any speed | dagger:2^speed (a dagger) | C: own seven thrusts from guard, tied to the action |
| Red Rosary (6.0) | Half: "+15% to Opened" and "a critical rite Opens" are read only in rites; faster bleed ticks hold for all | - | - | - | rosary:1 | C: read for every hit of the hero |
| Last Rites (6.1) | Yes (step behind, 450%, Opened x3, Exposed 6 s); the step round is a 0.13 s slide | plain `lunge` | ribbon + spark | yes | sword^burst | C: own step round and reverse-grip thrust |
| Saint's Reach (6.2) | Yes | - | - | - | lance^rise (a lance) | C: a tier 6 stat stick (crit, AR, dex); becomes reach and carry-through |
| **Aura** | | | | | | |
| Tallow Light (1.0) | Yes | own (kneel, light) | ring + motes rise | ok (0.6 s) | candle^aura | K |
| Liturgy (1.1) | Yes | - | - | - | scroll:2 | K |
| Iron Vigil (1.2) | Yes | own (kneel on the weapon) | ring + halos crown | ok | rood:2^wall | K |
| Smouldering Rood (2.0) | Mostly: `areaDamage` falls off to 65% at the edge, the tooltip says flat 28% | own | ring + cinder beds ring | ok | rood:1^aura | K (small fix: no falloff) |
| Anoint (2.1) | Yes | own | self burst + flares drip | ok | chalice^rise | K |
| Censure (2.2) | Yes (finds the next within 8 m on a death); the leap cannot be seen | own (point) | sigil brands fall | ok | writ | K (small fix: a seen leap) |
| Censer Smoke (3.0) | Yes | own (censer swung round) | ring + smoke clouds orbit | ok | censer^field | K |
| Wide Wick (3.1) | Yes | - | - | - | candle^nova | K |
| Fervour (3.2) | Yes | own | ring + embers helix | ok | candle:2^speed | K (speed numbers in M3) |
| Tolling Bell (4.0) | Half: its unique does nothing (vigils read raw params); its `radius` is never read; the toll falls off at the edge; each toll has a sound but no look | own (haul the rope) | ring + shock rings (on lighting only) | ok | bell^nova | C: honour bend and radius, a seen toll |
| Penitent Ground (4.1) | Yes | - | - | - | rood^field | K |
| Martyr's Vow (4.2) | Yes (ward, flat reduction) | own | self burst + hearts pulse | ok | heart^wall | K |
| Writ of Ash (5.0) | Yes | own | ring + ash flurries spiral | ok | writ:1 | K |
| Vespers (5.1) | Yes | - | - | - | moon^aura | K |
| Consecrated Ground (5.2) | Half: its unique (+30% radius, +25% slow, +40% drag) does nothing, as Tolling Bell | own | ring + holy fields ring | ok | candle^field | C: honour the bend and radius |
| Twin Wick (6.0) | Yes | - | - | - | candle:1 | K |
| The Last Hour (6.1) | Yes (falls 0.7 s, 600%, Rung 1.5 s) | own | a `domes fall` motif; no bell is drawn | ok | bell:1^rain | C: a real great bell falls and lands |
| Ember Saint (6.2) | Yes | - | - | - | rood:1^rise | K |

Totals: keep 28 (most passives, Bar the Door, most of the Aura tree),
change 26, replace 0. Broken or half working: Doorbreaker (blink rush),
Crushing Weight and Red Rosary (rites only), Turn the Blade (answer),
Litany and Sevenfold (untied cuts), Tolling Bell and Consecrated Ground
(uniques, radius), plus the small ones (Bar the Door and Turn the Blade
walk to a hovered enemy, Smouldering Rood falloff, the Last Bell tooltip).
Every weapon skill: no swing of its own, no look of its own, too fast.

### Milestone 2: the new kit

All three trees are full (18 of 18) and the shape is right: Mace breaks
one target (Stagger, Dents, Rung), Blade opens one (Opened, Exposed),
Aura is one burning vigil at a time. So nothing is replaced: every slot
keeps its id, tier, column and `requires`, saves keep their ranks, and no
synergy or capstone breaks. The kit's real gap is crowds: neither weapon
tree has one blow that reaches more than one enemy, so a pack is cleared
only by the vigils (the curve already fails at depth 5 for the Paladin,
see `skillcore.md`). Two close skills fill it in their own tree's language
(Pilgrim's Maul for Mace, Crosswise for Blade). The other lackluster slot
(Saint's Reach, a tier 6 stat stick) gets a new idea in place.

Rules for every build item: time through skillcore's per-skill fields and
speed function (never new hard-coded seconds); damage per hit stays what it
is today; every rank grows damage, strength, time or size (`skillPower.ts`,
`check-rankpower`); text through `tr()`; weapon skills look physical (iron,
bronze, blood, dust, broken floor), never a spell sigil.

Every weapon rite leaves `PLAIN_MOVES` and gets its own blow in
`art/hero/gestures/paladin.ts` (`hit: true`, the weapon placed with
`reach`, a wind up, contact and follow through, `alt.great` keys for a
two-hander, `alt.shield` where the shield moves). Their looks go in new
files under `src/fx/paladin/` (`RiteLooks.ts` for the hit looks, `Censer.ts`,
`GreatBell.ts`), each with a `warmup()` stand-in; `landRite` skips the
shared spark when a rite draws its own.

**Keep as is (28):** Hallowed Iron, Forged Faith, Bellguard, Iron Penance,
Weight of Stone, Unbroken, Bar the Door; Blade Catechism, Red Psalm,
Measured Step, Answer in Steel, Whetted Faith, The Fifth Verse; Tallow
Light, Liturgy, Iron Vigil, Smouldering Rood, Anoint, Censure, Censer
Smoke, Wide Wick, Fervour, Penitent Ground, Martyr's Vow, Writ of Ash,
Vespers, Twin Wick, Ember Saint. All still get new icons (milestone 5) and
their speed checked (milestone 3). Small fixes among them:
- Bar the Door (and Turn the Blade): a self rite does not walk to the enemy
  under the cursor first (`needsReach` in `Controls.ts`: `rite` needs reach
  only when it targets an enemy).
- Every vigil reads its bent knobs (`bendFor` + `bentKnob`, as the runner
  does) and its own `radius` param instead of the hard-coded 5 m (Wide Wick
  and aura radius still add on top). Vigil blows land flat, without the
  nova falloff, so "28% weapon damage" is what lands (Smouldering Rood,
  Tolling Bell).
- Censure: when it finds the next enemy, a thin line of ash runs from the
  dead to the next, so the leap is seen.

**Change (26):**

Mace (every one its own blow; damage per hit stays)
- Tolling Blow: the bell-ringer's blow: up on the toes, weapon high behind
  the head, down through the crown; a bronze ring of sound off the head on
  contact. Numbers stay.
- Shield Crack: the shield turned edge-on and driven up into the jaw (a
  rising rim strike off the lead foot); a two-hander jabs the haft butt;
  iron sparks off the rim, the Rung shown as a ringing halo of sound.
- Anvilfall: a straight-down drop, weapon brought up over the head and
  dropped like a smith's hammer (both hands on a two-hander); a crack in the
  floor and a flat dent spark on the plate for each Dent laid.
- Doorbreaker: a real shield-first run: its own held gesture (shield up and
  forward, shoulder behind it), the hero carried at a running speed set by
  skillcore's timing (about 14 m/s: 9 m in about 0.65 s), the blow on
  arrival, a dust wake behind. Bodies in the lane are shoved aside.
- Knell: a flat side swing like a clapper striking a bell; at the echo a
  second bronze sound ring on the head, so both rings are seen.
- Crushing Weight: honoured by every hit of the hero (basic attack,
  counters, vigil blows), through a Paladin-only line in the runner's hit
  tuning; the tooltip is then true as written.
- Pilgrim's Maul (the Mace crowd blow): a long coil over the shoulder and
  a slow arc down through the target into the floor. The target takes the
  blow as today (300% +42% a rank, +30% for each of its Dents spent). New:
  the floor breaks round it: every other enemy within 3 m (+0.05 m a rank)
  takes a fifth of the blow and its own Dents are spent the same way. A
  ring of broken flagstones. New params `shock: 0.2`, `shockRadius: 3`,
  `shockRadiusPerRank: 0.05`.
- Hurl the Censer: a real brass censer on its chain (built in code),
  leaving on the gesture's throw frame, swinging out in an arc trailing
  smoke and coals, bursting in ash and embers on the target, the chain
  pulled back. Numbers stay.
- Relic Bash: a straight shield-boss punch with a short step in (a
  two-hander drives the haft); a pale glow at the boss on contact. It reads
  the Dents and leaves them (heal 3% +0.15% a rank per Dent), so the Mace
  loop no longer fights itself.
- The Last Bell (capstone): the Toll is seen and heard (a big bronze sound
  ring off the target and a bell toll); the tooltip says "Mace skill blow",
  which is what the code counts. Numbers stay.
- Iron Verdict: the biggest blow in the tree: the weapon raised high and
  held a beat, then down with the whole body; the target hammered to its
  knees, a cracked star in the floor, the Rung shown. Numbers stay.

Blade (every one its own cut; damage per hit stays)
- Oath Cut: a short stepping thrust from a low guard, back to guard; a thin
  cut mark and a spurt of blood (Opened).
- Turn the Blade: blade up and turned for 1.2 s (+0.03 s a rank). The first
  blow blocked in that time is answered at once with its own riposte cut
  (a real action, `skill.turnTheBlade.answer`), at 200% (+25%) and Exposed
  3 s; if nothing is blocked, the answer comes as the guard drops, as
  today. A parry spark on the blade at each block.
- Twin Verse: a forehand and a backhand, two swings in one gesture, each
  hit on its own contact key.
- Feint: the blade shown high, a real side step (feet planted, at a
  stepping speed from skillcore's timing) and a cut from the side.
- Litany: five alternating diagonal cuts with a small step forward each,
  each cut timed to its hit. Every flurry (Twin Verse, Litany, Crosswise,
  Sevenfold) is tied to its action: a dodge or a new action stops the rest,
  a cut needs the target in reach, and the gaps follow skillcore's
  multi-hit timing (they scale with speed). Knell's echo stays a free echo.
- Confession Thrust: a long low fencer's lunge, the body carried at a
  lunging speed (about 12 m/s: 5 m in about 0.4 s); a burst of blood for
  each Opened wound spent.
- Crosswise (the Blade crowd blow): two cuts that cross. The first sweeps
  flat across 150 degrees and strikes every enemy within 3 m for 130%
  (+18% a rank); the second comes straight down through the one in the
  middle for 130% (+18%) and leaves it Exposed 5 s. A steel cross scored on
  the floor. New params `arc: 150`, `radius: 3`.
- Mercy Stroke: the point turned down and driven in (a short downward
  stab); when the x8 lands, a heavy burst of blood and the body dropped.
- Sevenfold: seven quick thrusts from guard, alternating high and low,
  each on its own contact; the seventh a full extension that Exposes.
- Red Rosary (capstone): its +damage against Opened and its "critical hit
  Opens" are honoured by every hit of the hero (as Crushing Weight); the
  tooltip says "critical hit" instead of "critical rite". Numbers stay.
- Last Rites: a real step round behind (a turn on the lead foot at a
  stepping speed), then the blade reversed and driven through the back; a
  spray of blood out of the front.
- Saint's Reach (tier 6 passive, new idea in place): "The long arm of a
  patient man. +1% critical chance per rank (toward 10%) and +18 attack
  rating per rank. Your Blade skills reach 0.4 m further, and every Blade
  cut carries on into the nearest enemy behind its target, within 2 m, for
  30% of its damage (+2% per rank)." Dexterity goes. New rule in
  `sim/passives/paladin.ts` (`pal.reachBonus`, `pal.carryPct`), read in
  `Rites.ts`.

Aura
- Tolling Bell: honours its unique and its `radius`; each toll is seen: a
  bronze sound ring sweeping out to the ring's real reach, and the hit
  bodies jolt. The toll damage lands flat (no falloff).
- Consecrated Ground: honours its unique (`radius`, `slow`, `drag`, more).
- The Last Hour: a real great bell (bronze, built in code) appears high
  over the one it names and falls for its 0.7 s, lands with a dust ring
  and a shock ring, stands a beat and fades. Numbers stay.

**Replace:** none. **New skills:** none beyond the two crowd changes; every
tree is full and every other slot is worth keeping once it works and looks
its own.

**Speeds (milestone 3, under skillcore's model; starting points):** Mace
blows heavy and slow: Tolling Blow and Relic Bash about one mace swing,
Knell and Anvilfall about 1.3 swings, Pilgrim's Maul about 1.6, Iron
Verdict about 1.8, each with its contact well after the wind up (needs the
0.16 s contact cap lifted for skill blows, or skillcore's own contact
field). Shield work a short beat (Shield Crack about 0.9 swings). Blade
cuts quick and exact: Oath Cut and Mercy Stroke about one sword swing,
Feint 1.1, Twin Verse about 1.3 for two cuts, Crosswise about 1.4,
Litany and Sevenfold about 2 swings for the whole flurry. Rushes and steps
by distance at a running or stepping speed, not a share of a swing. Vigils
a calm, short rite (about 0.7 s); The Last Hour a longer call.

**Uniques that name Paladin skills (all still valid after the plan):**
Litany (`cuts`), Knell (`ring`, `echo`), Anvilfall (`dents`, `reach`), Hurl
the Censer (`range`, `duration`), Tolling Bell (`radius`, `ring`, now
honoured), Bar the Door (`duration`, `block`, `dr`), Consecrated Ground
(`radius`, `slow`, `drag`, now honoured), Mercy Stroke (`threshold`,
`reach`). No set names a Paladin skill.

**Out of my files, small additive edits (shared):** `Controls.ts` (self
rites need no reach), `SkillRunner.ts` (Paladin-only lines: the rite host's
`land` can skip the shared spark, Crushing Weight and Red Rosary in the
hit tuning, flat vigil area damage), `DungeonScene.ts` (`warmup()`
stand-ins). Sounds: no free `skill.pal.*` take is left; the Toll, Turn the
Blade's answer and the Pilgrim's Maul shock reuse their own skill's
recordings, and a new take is a request for `finish` if one is needed.

**Requests to skillcore (to check at milestone 3):** a skill's weapon blow
must be able to connect later than `CONTACT_CAP` (0.16 s) so a heavy blow
has a wind up; rush and step travel times by distance; multi-hit gaps that
follow the speed.

## For the owner to test

(empty)

## For skillqa

- Found in milestone 1, not mine to fix (game-wide): a `skill.*` release
  gesture has contact 0 (`contactDelay` in `Player.ts`), so whatever such a
  skill throws leaves on the key press, a beat before the hand opens. The
  Paladin will time Hurl the Censer off its own throw frame.
- Found in milestone 1, game-wide: `areaDamage` in `SkillRunner.ts` falls
  off to 65% at the edge of every nova and area, and no tooltip says so.
  The Paladin's vigils will land flat; other classes' novas are untouched.

## Handover

(empty)
