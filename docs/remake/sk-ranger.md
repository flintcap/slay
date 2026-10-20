# Stream: sk-ranger (Wave 5: Ranger skills remake)

Status: in progress

Class: Ranger (code id `ranger`). Trees: Marksman, Wildcraft, Volley (`marksman`, `wildcraft`, `volley`). Port 4356.
Fights with ranged: bows with a quiver (starts with a short bow). Class color: moss green (`0x7fc46a`).

Goal (owner): fix every Ranger skill and remake the kit to a AAA
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

Your files (Wave 5 file ownership in `PLAN.md`): the `MARKSMAN`, `WILDCRAFT` and `VOLLEY` sections of `src/data/skills.ts`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=ranger`). Browser, one at a time, at
most once per milestone: `check-skills --classes=ranger`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Check bow fire rate under skillcore's model: base and at the ceiling.
  Multi arrow skills must not multiply into a wall of arrows that costs
  frame rate.
- The Ranger's three trees use only 11 of their 18 slots each (21 open
  slots). This is the class with the most room to add new skills.
- The ranger at depth 12 in `check-curve` was borderline before this wave.
  If slower fire rate walls it, note the numbers for the owner; do not
  raise damage per hit to make up for it, never touch monsters.

## Milestones

- [x] 1. Skill audit (read code only). ("wip(sk-ranger): skill audit table") For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [ ] 2. Plan the new kit (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [ ] 3. Speed audit (owner: before any skill is changed). Under skillcore's model, write a table
  under "Notes for resume": the Ranger's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [ ] 4. Build. Make the changes, replacements and new skills from the
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
- [ ] 5. Icons. Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
- [ ] 6. Effects quality and cost. Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
- [ ] 7. Check. `check-skills --classes=ranger` once (one retry if it fails,
  then note it) and `check-curve --classes=ranger` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Start milestone 1 (skill audit). Do not touch code before skillcore is
done.

## Notes for resume

### Milestone 1: skill audit (read from the code on 2026-10-20)

How the code runs a Ranger skill today (all in `src/scenes/SkillRunner.ts`
`castNow` unless named; pre-skillcore numbers):

- Every bow skill (`projectile`, `bolt`, `meteor`, `beam`, `cone`, `chain`,
  `nova`) takes `castTime = 0.5 / (1 + CAST speed %)`: 2.0 a second with no
  gear. Attack speed (Quick Draw, Cold Focus, Volley Mastery, bow base
  speed) never reaches a bow skill. Buffs take `castTime x 0.7` = 0.35 s.
  Dashes are `Player.dodge`: Roll Away 6 m in 0.48 s, Disengage 8 m in 0.5 s.
- Basic attack (bow): `0.46 / (1 + attack speed %)` = 2.17 a second; the
  short bow's own 1.35 a second is ignored. Reference (skillcore audit):
  bow 1.15-1.5 a second base, 2.3-3.0 at the ceiling. So every Ranger shot
  is 1.3-1.7x too fast today, and at the clamp (+200%) the basic is 6.5 a
  second.
- Release: bow gestures are release gestures (`hit` unset), so
  `contactDelay` is 0: the arrow leaves at the press and the clip is bent
  so its release frame lands 0.1 s in. Gestures are authored 0.55-1.0 s
  long and squeezed into the 0.5 s action.
- Arrows: every Ranger arrow is the same `Body.Arrow` solid with the same
  thin `arrow` wake (`Effects.projectile`); only its speed and a motif
  (`SKILL_MOTIFS`, drawn once in front or at the target) differ. Skill
  arrows take `size: radius 0.42`, so they are drawn about 1.75x the basic
  arrow. Skills with no `speed` fly at the default 17 m/s, slower than the
  basic arrow's 30 (Bleeding Arrow, One Shot, Hunter's Mark).
- Damage: a skill with no `dmg` ladder still hits for 100% weapon damage
  (+8% a rank, `burstGrowth`) when its family deals damage, so Hunter's
  Mark and Snare Trap carry hidden damage. `meteor` hits for `makePacket(1.4)`
  (hidden x1.4; `ui/AttackEstimate.ts` does not know).
- Pierce: `pierce > 0` flies to the first wall and then hits everything on
  the line at once (`lineDamage`, kind `beam`) when the arrow arrives, not
  as it passes each enemy.
- Venom Coat poisons only packets of kind `projectile` (`coated`), so only
  the basic arrow and single-arrow skills.
- Body: every Ranger active has its own gesture in
  `src/art/hero/gestures/ranger.ts` (no plain moves, no shared clip).
- Icons: every Ranger icon is a shared glyph plus modifier (`ICON_MAP` in
  `src/art/SkillIconArt.ts`), in the Ranger frame (wood ring, grain, light
  `0xc8d890`, a pale yellow green, not the class moss `0x7fc46a`). No tree
  accent, no painted icon of its own. Size 128 px.
- Sounds: every active has its own cast sound (and hit sound for shots) in
  `src/audio/SkillSounds.ts`. Passives make none. Nothing missing.
- Trees: tiers 1 to 5 only, 11 of 18 slots each (tier 4 and tier 5 hold
  one skill each, tier 6 is empty). The three "capstones" sit at tier 5
  column 1 as actives (max 5), so `CAPSTONES` (tier 6, column 0) has no
  Ranger entry and nothing past level 24 is ever unlocked.

"Speed" is with no speed gear. "Icon dup" names another skill drawing the
same pictogram plan.

#### Marksman

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Pierce Shot `pierceShot` (T1, default right click) | Yes: flies to the first wall (22 m) and hits the whole line at once on arrival; Venom Coat skips it (kind `beam`) | Own gesture (wide base, full draw) | Plain arrow at 34 m/s + wedges line | 0.5 s on cast speed: too fast | `arrow` (own) | Keep; each enemy hit as the arrow passes, coats ride it, own heavier shaft |
| Hunter's Mark `huntersMark` (T1) | Half: shoots an arrow at the first enemy on the line for a hidden 100% weapon hit (+8% a rank), then marks it: every resistance -12 (+1.5) for 12 s, from everyone, not "12% more from you". The `marked` status text promises +15% crit chance, which no code gives | Own gesture: two fingers point, yet an arrow flies out | Plain arrow at 17 m/s + hoops pulse | 0.5 s | `target` (own) | Change: no arrow, no hidden damage, lands on the enemy under the cursor, text true, the mark jumps on when its target dies |
| Steady Hand `steadyHand` (T1) | Yes | Passive | - | - | `eye` = Rogue Night Eyes | Keep; own icon |
| Aimed Shot `aimedShot` (T2) | Yes: always crits below half life (`executeBelow`, `skillEdge`) | Own gesture (kneel, slow draw) | Plain arrow at 40 m/s + hoops converge | 0.5 s like every shot: "Slow" in the text is false | `target:1` = Rogue Deadly Aim | Change: a real slow heavy draw (skillcore's time factor), heavy arrow and impact |
| Bleeding Arrow `bleedingArrow` (T2) | Yes: Hemorrhage 6 s | Own gesture (canted snap from the hip) | Plain arrow at 17 m/s + blood spray line | 0.5 s | `drop` = Knight Artery | Keep; barbed arrow with a blood wake at bow speed |
| Long Eye `longEye` (T2) | No: text says +2% a metre past 6 m up to 30%; code is a flat +3.3% to +27% damage at any range | Passive | - | - | `bow` (own) | Change: code does what the text says |
| Punch Through `punchThrough` (T3) | Yes (flat damage; text true) | Passive | - | - | `arrow^impact` (own) | Keep |
| Crippling Shot `crippling` (T3) | Yes: Crippled 4 s, 35% (+3%) slower, -80 defense | Own gesture (leaning, aimed low) | Plain arrow at 32 m/s + scuffs zigzag | 0.5 s | `trap`: a snare picture for an arrow | Keep; arrow dips to the legs, own icon |
| Cold Focus `coldFocus` (T3) | Yes; its attack speed reaches only the basic arrow | Passive | - | - | `target^impact` (own) | Keep |
| Headshot `headshot` (T4) | Yes | Passive | - | - | `skull` = Revenant Raise Skeleton, Rogue Lethality | Keep; own icon |
| One Shot, One Grave `oneShot` (T5 "capstone") | Half: "your first attack on a full-health target always crits" exists nowhere; it is an active piercing shot, 550% (+80%), cooldown 26 s, max 5, flying at 17 m/s | Own gesture (the longest draw) | Plain arrow + crosses pulse | 0.5 s, same as Pierce Shot | `apex` = Whole Floor, Darken the Sky, Rogue Apex Predator | Change: the tier-6 ultimate (max 20), text true, a long draw, its own shot |

#### Wildcraft

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Roll Away `rollAway` (T1) | Yes: 6 m roll, 0.3 s untouchable, +20% move 1.5 s (+0.1 s). The dodge every hero has, plus a run | Own gesture (tucked roll) | Scuffs trail | 0.48 s dash | `boot^speed` (the shared `dash`) | Change: you come up with an arrow nocked (next shot crits) |
| Snare Trap `snareTrap` (T1) | BROKEN: not a trap. A `nova` at the hero's feet at the press (aim point ignored), a hidden 100% weapon hit, roots 2.5 s (+0.2 s) within 2 m. `duration: 30` (trap life) unread as such | Own gesture (kneel, cord jerked) | Physical ring + hoops ring round the hero | 0.5 s | `trap^field` | Change (rebuild): a trap set at the aimed point that arms and waits; no damage |
| Light Foot `lightFoot` (T1) | Yes | Passive | - | - | `boot` = Rogue Fleetfoot | Keep; own icon |
| Spike Trap `spikeTrap` (T2) | BROKEN: the same instant nova at the hero, 220% in 2.6 m; `duration: 25` (meant as trap life) becomes a 25 s Bleeding (`SKILL_STATUS`) the text never names | Own gesture (fist hammered on a stake) | Ring + bone spikes rise at the hero | 0.5 s | `spikes` | Change (rebuild): a pressure plate at the point, spikes on trigger, the bleed stated |
| Thorn Barrier `thornBarrier` (T2) | Half: a 7 m cone blast, no barrier; poison 60%, Slowed 8 s, 2 Bleeding (true for what it does) | Own gesture (hands into the soil) | Green flame cone (the poison breath look) + thorns wall | 0.5 s | `leaf^burst` | Change: a bramble wall across the aimed point that lasts and hurts what crosses |
| Survivalist `survivalist` (T2) | Yes | Passive | - | - | `heart` = Rogue Hemotoxin | Keep; own icon |
| Disengage `disengage` (T3) | Half: leaps 8 m back and looses at the first enemy ahead, but `Player.dodge` turns the body to face the leap, so the bow draws away from the arrow | Own gesture (loosed mid-leap) | Plain arrow + leaves trail | 0.5 s dash | `boot^rise` (the shared `leap`) | Change: keeps facing the enemy through the leap; arrow leaves on the release |
| Venom Coat `venomCoat` (T3) | Half: only kind `projectile` hits poison, so Pierce Shot, One Shot and Suppressing (line), Arrow Rain (area), Ricochet (chain) and Scattershot (melee arc) never do | Own gesture (arrow dipped and studied) | Thorns orbit at the cast; arrows show nothing | 0.35 s | `vial` = Rogue Coat Blades | Change: every arrow skill carries it; coated arrows trail green |
| Camouflage `camouflage` (T3) | Half: "Stand still" is not in the code; it is the Rogue's Veil (`veiled`) with other numbers; `critBonus: 100` read but it has no hit | Own gesture (squat behind the bow) | Leaves converge | 0.35 s | `figure^aura` = Rogue Veil | Change: its own idea: stand still to vanish, again and again inside a window |
| Trap Mastery `trapMastery` (T4) | Yes (all skill cooldowns; text true) | Passive | - | - | `gear` | Keep |
| The Whole Floor Is A Trap `theWholeFloor` (T5 "capstone") | Half: an 8 m nova at the hero, 240% (+35%); no trap is involved | Own gesture (turn, caltrops strewn) | Ring + saws scatter | 0.5 s | `apex` (shared) | Change: the tier-6 ultimate: sets off every trap you have out, then the ring |

#### Volley

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Twin Shot `twinShot` (T1) | Yes: 2 arrows 0.14 rad apart (+Volley Mastery); both can hit one target up close | Own gesture: two draws and two looses, but both arrows leave together at the press | Two plain arrows + feathers fan | 0.5 s, no cooldown | `arrow:2` | Change: each arrow leaves on its own loose |
| Quick Draw `quickDraw` (T1) | Half: its attack speed reaches only the basic arrow | Passive | - | - | `feather^speed` | Keep (skillcore puts bow skills on attack speed) |
| Scattershot `scattershot` (T1) | Half: no arrows fly: a `cone` (floor wedge, dust) and an instant arc of kind `melee` (0.8 rad x 8 m); leaves Blinded (`SKILL_STATUS`), text silent | Own gesture (crouched hip draw) | Floor wedge + arrows fan | 0.5 s | `arrow:2^burst` | Change: real short arrows sprayed, a shove back, text names what it leaves |
| Arrow Rain `arrowRain` (T2) | Yes, but hits for 1.4x its ladder (hidden in `meteor`) | Own gesture (drawn at the sky) | 9 falling arrows (x quality), one hit when the first lands | 0.5 s | `arrow^rain` | Change: honest ladder (x1.4 moved into it, same damage), more arrows in a staggered fall |
| Ricochet `ricochet` (T2) | Half: every bounce lands at the press; all bounce arrows fly at once from their points; bounces skip `afterHit` | Own gesture (bank-shot lean) | Plain arrows between targets | 0.5 s | `arrow^chain` | Change: legs in sequence, each lands on arrival; rename (Ricochet is a PoE notable) |
| Fan Fire `fanFire` (T2) | Yes: 5 arrows over 0.8 rad (+Volley Mastery) | Own gesture: three draws, but all five leave at the press | Plain arrows + arrows burst | 0.5 s | `dagger:2` = Rogue Fan of Knives (daggers for arrows) | Change: one flat sweeping release, own icon |
| Suppressing Fire `suppressing` (T3) | Half: the whole 18 m line is hit at the press, before its three arrows arrive; Slowed 20% 4 s and Exhausted 8 s (text true) | Own gesture (four half-draws) | Three plain arrows | 0.5 s, no cooldown | `beam` = Mage Fire `stream`, Lightning, Revenant | Change: arrows leave one by one and hit as they pass; a stream you hold |
| Explosive Tip `explosiveTip` (T3) | BROKEN: no area: `pointDamage` with `radius: 3` hits only the nearest enemy; `radius` also sizes the shot, so a fire core about 10 m across (3 x 3.4) flies instead of an arrow | Own gesture (head struck alight on the thigh) | Giant fireball + flares | 0.5 s | `nova^burst` = Mage Fire `burst` | Change: a burning arrow that bursts for area fire on the first enemy |
| Endless Quiver `endlessQuiver` (T3) | Half: counts only `projectile`/`bolt` shots; Arrow Rain, Ricochet, Suppressing, Scattershot never count | Passive | - | - | `quiver` | Change: every bow skill counts |
| Volley Mastery `volleyMastery` (T4) | Yes: +1 arrow per 5 ranks, Twin Shot and Fan Fire only | Passive | - | - | `arrow:2^multi` | Keep; text names what it touches |
| Darken The Sky `darkenTheSky` (T5 "capstone") | Yes, but the same 9-arrow rain spread over 12 m (thin), x1.4 hidden, the sky does not darken | Own gesture (emptied at the sky twice) | 9 arrows over 12 m | 0.5 s | `apex` (shared) | Change: the tier-6 ultimate: a dark sky and a dense staggered fall (instanced) |

Summary of what is broken or untrue today: Snare Trap and Spike Trap (not
traps, at your feet, hidden damage, a 25 s bleed), Explosive Tip (one
target, a 10 m fireball), Hunter's Mark (an arrow with hidden damage, text
and status text untrue), Long Eye (no range in it), One Shot (capstone
rule missing), Camouflage (no standing still; a Veil copy), Venom Coat,
Endless Quiver (half the bow skills miss them), Disengage (faces the wrong
way), The Whole Floor (no traps), Thorn Barrier (no barrier), Scattershot
(no arrows, a hidden blind). Timing: every multi-arrow skill (Twin Shot,
Fan Fire, Suppressing, Ricochet) lands all its arrows at the press while
the body loosens them one by one; every pierce line hits at once on
arrival. Too fast: every bow skill at 0.5 s on cast speed, the slow shots
(Aimed Shot, One Shot) most of all. Shared looks: one arrow for every shot;
icons from the shared glyph set, nine of them drawing another skill's
picture (`eye`, `vial`, `fan`, `stream`, `burst`, `heart`, `boot`, `skull`,
`target:1`, `drop`, `figure^aura`, plus `apex` three times). Names: only
Ricochet is a PoE name.

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
