# Stream: sk-revenant (Wave 5: Revenant skills remake)

Status: in progress

Class: Revenant (code id `revenant`). Trees: Ossuary, Blight, Grave Pact (`ossuary`, `blight`, `gravepact`). Port 4355.
Fights with caster: wands and orbs (starts with a femur wand and a cracked orb). No basic attack, ever. Class color: pale teal (`0x8ce0c8`).

Goal (owner): fix every Revenant skill and remake the kit to a AAA
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

Your files (Wave 5 file ownership in `PLAN.md`): the `OSSUARY`, `BLIGHT` and `GRAVEPACT` sections of `src/data/skills.ts`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=revenant`). Browser, one at a time, at
most once per milestone: `check-skills --classes=revenant`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Summons count as skills: check their attack speed and cast rate too,
  and that they never stack into a swarm that costs frame rate.

## Milestones

- [x] 1. Skill audit (read code only). (sk-revenant: skill audit and kit plan) For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. Plan the new kit (sk-revenant: skill audit and kit plan) (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. Speed audit (owner: before any skill is changed). (sk-revenant: speed audit) Under skillcore's model, write a table
  under "Notes for resume": the Revenant's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [x] 4. Build. (sk-revenant: build) Make the changes, replacements and new skills from the
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
- [x] 5. Icons. (sk-revenant: icons) Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
- [x] 6. Effects quality and cost. (sk-revenant: looks) Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
- [ ] 7. Check. `check-skills --classes=revenant` once (one retry if it fails,
  then note it) and `check-curve --classes=revenant` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Milestones 1 to 6 are done (what was built is under "Milestone 4",
"Milestone 5" and "Milestone 6" below). Next is milestone 7: `mkdir -p
shots`, then `check-skills --classes=revenant` once (one retry) and
`check-curve --classes=revenant` once, each under flock and timeout; write
the numbers below. Then 8, handover.

## Notes for resume

### Milestone 1: skill audit (from the code on 2026-10-20, before skillcore)

How the Revenant's skills run today (read from the code, not notes):

- Data: `src/data/skills.ts` `OSSUARY` / `BLIGHT` / `GRAVEPACT`, 18 skills
  each, every slot used. 30 actives (11 / 10 / 9), 24 passives.
- Body move: every one of the 30 actives has its own gesture in
  `src/art/hero/gestures/revenant.ts` (none is in `PLAIN_MOVES`), and none
  is a weapon blow (`hit` is never set), so every one is a release. The
  hand releases about 0.1 s after the press, but the spell itself resolves
  on the press (`contactDelay` is 0 for a non-`hit` gesture): projectiles
  leave and novas, curses and summons land the moment the key goes down.
- Look: each active draws its effect family's shared drawing (projectile
  core or solid, `nova` ring, curse ring at the point plus an impact per
  target, `aura` ring, `summonCircle`, field) plus one motif from
  `SKILL_MOTIFS` in `fx/SkillLooks.ts`. Own looks beyond that: Femur Lance
  (Bone Spear) flies as the bone `spear` solid with a bone trail; Bone Cage
  draws the `bone` field (dust and rattling chips, no ribs). Everything
  else is the family drawing in the school colour plus a motif.
- Speed today (skillcore owns the model; milestone 3 redoes this):
  `castTime = 0.5 s / (1 + cast%)` for projectiles, summons, curses,
  debuffs, novas, ground, corpse; buffs and auras `castTime * 0.7 = 0.35 s`;
  tethers `castTime * 1.6 = 0.8 s` of body lock (the tether runs on 3 to
  4 s while the hero is free). The gestures are written 0.75 to 1.05 s
  long, so all play 1.5x to 3x fast. Summons swing every `1.1 s` (melee)
  or `1.6 s` (ranged) divided by `1 + minion attack speed` (Marrow Feast
  +6% a rank, so 0.5 s a swing at rank 20).
- No basic attack: `basicAttack` returns false for a wand, staff or orb,
  and for bare hands with an orb. The default cast is Bone Spear (starting
  skill in `sim/Character.ts`, first hotbar slot in `data/classes.ts`).
- Icons: `ICON_MAP` in `art/SkillIconArt.ts`, glyph plus modifier, bone
  ring and pale teal light (`0x9ae0c8`) for the class. Typed skills are lit
  in their element (poison green, arcane violet, cold blue), so most Blight
  and Gravepact icons are not in class colour. One accent for all three
  trees (pips only). Exact duplicates inside the class: Bone Spirit and
  Revenant Form (`ghost^rise`), Bone Cage and Soul Cage (`cage`), Poison
  Nova and Sanguine Nova (`drop^nova`, only the light differs). Heavy reuse:
  `skull` x7, `bone` x7, `ghost` x5, `drop` x4, `wilt` x3, `rune` x3,
  `scythe` x3, `hourglass` x2, `helm` x2, `cloud` x2. Off theme: a war
  `horn` for Amplify Damage, a Knight `shield` for Lower Resist, the
  Knight's `tower` for Grand Ossuary, a `boulder` for Clay Sentinel.
- Sound: every active has its own row in `audio/SkillSounds.ts`. Dead
  rows: Reassemble's `minion` sound (it raises nothing; revived minions use
  their own skill's voice). Silent stages: Doom's burst, Corpse Explosion's
  and Sanguine Nova's hits (`hitAt` is never called on those paths).
- Names: ten Revenant skills carry the exact name of a Diablo II
  Necromancer skill (Bone Spear, Bone Armor, Bone Spirit, Raise Skeleton,
  Weaken, Amplify Damage, Terror, Lower Resist, Corpse Explosion, Poison
  Nova; Skeletal Mage and Clay Sentinel are one word off), and three the
  exact name of a Path of Exile skill (Contagion, Wither, Exsanguinate).
  The owner's rule is our own names, never theirs.

Legend: works = the code does what the tooltip says. Time today = body
lock with no speed gear (see above). Verdict: K keep, C change, R replace.

| Skill (tier.col) | Works? | Effect today | Time today | Icon | Verdict, why |
| --- | --- | --- | --- | --- | --- |
| **Ossuary** | | | | | |
| Bone Spear (1.0) | Half: pierces, but every body on the line is hit when the spear reaches its end (16 m or a wall), not as it passes (`lineDamage` in `onHit`) | bone spear solid, trail, motif | 0.5 s, fast for a 0.75 s throw | bone^speed (shared) | C: hits land as it passes each body; D2 name |
| Raise Skeleton (1.1) | Half: tooltip says "1 per 2 ranks (max 5)"; code gives 5 at rank 1, +1 per 2 ranks, up to 12. "From a corpse": no corpse is needed or used. Hits for `minionScale` 0.5, never its `damagePct` 55, so the Ossuary unique's +25% damage bend does nothing | summon circle, motif | 0.5 s, fast | skull (shared) | C: true tooltip, damage from `damagePct`, rises from a corpse when one is near; D2 name |
| Bone Armor (1.2) | Yes (absorb 80 +45 a rank, defense, status `shielded`) | self burst, motif | 0.35 s, too fast | bone:1^aura (shared) | K (name: D2) |
| Skeletal Mage (2.0) | No: `effect` 'summon.minion' makes it melee, so it walks to 8.4 m, plays a melee swing and its "arcane bolt" lands instantly with no bolt drawn. Body is `skeleton_archer` (a bowman). Tooltip "1 per 3 ranks (max 4)"; code 4 at rank 1, up to 8. Hits for 0.5, never its 60 | summon circle, motif | 0.5 s | skull:2 (shared) | C: a real caster body (`bone_conjurer`) that throws its own bone bolt; true tooltip; name |
| Bone Mastery (2.1) | Yes | - | - | bone^mastery (shared) | K |
| Bone Spirit (2.2) | Half: "homing, never misses" but it flies straight (no `target`/`homing` passed to `effects.projectile`) at 12 m/s and hits where the target stood at the press; drawn as an arcane orb | arcane core, motif | 0.5 s | ghost^rise (same as Revenant Form) | C: really homes, re-seeks if the target dies, a skull of its own; D2 name |
| Clay Sentinel (3.0) | Half: tooltip says 200% life, code 260%; body is `animated_armor` (a suit of armour, not clay); "cannot be knocked back" has nothing to do (minions are never knocked back) | summon circle, motif | 0.5 s | boulder^rise (off theme) | C: a construct of fused bone (Bone tree), true tooltip; name is one word off D2's Clay Golem |
| Marrow Feast (3.1) | No: "minions gain life steal and heal 15% on a kill" but the steal heals the hero (`minionLeechPct`), and the kill heal is +1.5% life on kill for the hero (`killLifePct`) | - | - | bone:1^drip (shared) | C: minions heal themselves, as written |
| Bone Cage (3.2) | No: "Rooted for 3s and takes 120%" but it is a 6 s field ticking 28% every 0.5 s (about 400% in all) that re-roots every tick (held up to 9 s) | bone field (no ribs), motif | 0.5 s | cage (same as Soul Cage) | C: ribs burst up, one 120% hit, rooted for its time, the ribs stand while it holds |
| Bone Storm (4.0) | Yes (zone following the hero, 90% twice a second, 15 s). Leaves a placeholder buff `skill.boneStorm` (15 s, matches) | aura ring, one-shot orbit motif; no shards orbit for the 15 s | 0.35 s | bone^spin (shared) | C: real shards orbiting for its time |
| Ossuary Lord (4.1) | Yes | - | - | crown | K |
| Skeletal Knight (4.2) | Yes (only for skeletons raised after it is learned); knights look exactly like plain skeletons | - | - | helm (shared with Knight's Iron Skin) | C: knights wear armour and stand taller |
| Reassemble (5.0) | Yes (heal, revive the last 5 s of fallen). Revived minions skip the cap until the next raise | nova, motif | 0.5 s | bone:1^rise (shared) | K (drop the dead minion sound) |
| Bone Nova (5.1) | Yes (spends Bone Armor's ward, 3 bleeds) | nova, motif | 0.5 s | bone^nova (shared) | K |
| Death Knight (5.2) | Half: "+40% more damage" is added to Skeletal Knight's 80% (x2.2), not multiplied (x2.52); no look | - | - | helm:1 (shared) | C: really "more", a death knight look |
| The Bone Choir (6.0) | Yes | fields | - | ghost^multi (shared) | K |
| Grand Ossuary (6.1) | Half: `effect` 'summon.massMinion' fails the case-sensitive `includes('minion')`, so the "bone wardens" (`skeleton_warden`, a brute) stand at 8 m and shoot; `radius` 14 is never read | summon circle, motif | 0.5 s for a host, too fast | tower (Knight's) | C: melee brutes as their body says, raised in a ring at the point |
| Ossuary Mastery (6.2) | Yes | - | - | skull^mastery (shared) | K |
| **Blight** | | | | | |
| Weaken (1.0) | Yes (`weakened` -35% to -55%, 10 s +0.5) | curse ring, motif | 0.5 s | rune^drip (shared) | K (name: D2) |
| Blight Bolt (1.1) | Yes (3 Poisoned) | poison core, motif | 0.5 s | skull^speed (shared) | K |
| Decay (1.2) | Half: "+0.5s curse duration per rank" is +5% duration a rank in code | - | - | wilt (shared) | C: tooltip truth |
| Amplify Damage (2.0) | Yes (`vulnerable` as physical -v, all others -0.6v) | curse ring, motif | 0.5 s | horn (off theme) | K (name: D2) |
| Poison Nova (2.1) | Yes (4 Poisoned) | nova, motif | 0.5 s | drop^nova (same as Sanguine Nova) | K (name: D2) |
| Wither (2.2) | Yes; a weaker copy of the capstone (both feed `curseDecayPctPerSec`), so The Long Decline's rule exists at tier 2 already | - | - | wilt^aura (shared) | R: lackluster copy of the capstone; PoE name |
| Terror (3.0) | Half: `feared` makes nothing flee (no code reads it; `Status.isFeared` has no caller); its mods give the monster +20% move speed, so it chases faster, at -50% damage | curse ring, motif | 0.5 s | skull^nova (shared) | C: really flee and stop attacking; D2 name |
| Blood Curse (3.1) | Yes | - | - | drop^aura (shared) | K |
| Corpse Explosion (3.2) | Yes (needs a body within 4 m, 45% of its life, spreads its curses); hit is silent | explosion, nova, motif | 0.5 s | skull^burst (shared) | K (sound; name: D2) |
| Contagion (4.0) | Yes | - | - | cloud^multi | K (name: PoE) |
| Doom (4.1) | Half: "the target" but it brands everything within 4 m of the aim point; the brand status lasts 8 s for a 6 s fuse; the burst is silent | curse ring, delayed explosion | 0.5 s | hourglass (shared) | C: one target, a visible brand while it burns down, a sound |
| Attrition (4.2) | No: "-1% resistances and -2% attack speed a rank" but the aura lays `weakened` (damage dealt) at a fraction and `slowed` (move speed) | - | - | hourglass^drip (shared) | C: do what it says, its own status |
| Mass Confusion (5.0) | No: `confused` has no behaviour anywhere; monsters keep attacking the hero; they only look stunned (`BodyFX`) and lose a little resistance | curse ring, motif | 0.5 s | swirl | C: confused monsters really attack each other |
| Pestilence (5.1) | Half: Plagued "spreads on its own" but the status never spreads (only the monster affix spreads); the aura runs 30 s (default) and the tooltip gives no time; leaves a 10 s placeholder buff | aura ring, motif | 0.35 s | cloud:1 | C: Plagued really hops; tooltip names the 30 s; a status that matches |
| Curse Mastery (5.2) | Yes | - | - | rune^mastery (shared) | K |
| The Long Decline (6.0) | Yes (bosses spared: the boss is outside the loop; elites are not). With Attrition, every enemy within 8 m counts as afflicted | - | - | wilt^drip (shared) | K |
| Lower Resist (6.1) | Yes (`unmade`, every resist -40 -2 a rank) | curse ring, motif | 0.5 s | shield^drip (off theme) | K (name: D2) |
| Blight Mastery (6.2) | Yes | - | - | drop^mastery (shared) | K |
| **Grave Pact** | | | | | |
| Siphon Life (1.0) | Yes (tether 3 s, 70%/s, heals 40%) | tether beam (a new beam drawn every 0.25 s) | 0.8 s lock, loop gesture | chalice^drip | K |
| Spirit Ward (1.1) | Yes | - | - | ghost^aura (shared) | K |
| Reap Soul (1.2) | Yes | - | - | ghost (shared) | K |
| Blood Pact (2.0) | Yes (15% life, `siphoning`, +40% damage) | self burst, motif | 0.35 s for a 1.0 s gesture, too fast | hand^drip | K |
| Gravechill (2.1) | Yes (6 m cold aura, 30 s by default, not in the tooltip, 10 s placeholder buff) | aura ring, motif | 0.35 s | flake^aura | R: the class's third damage aura, weakest of them, off the tree's blood and souls |
| Vampiric Touch (2.2) | Yes | - | - | fang | K |
| Soul Cage (3.0) | Half: "trap a soul" (one target) but it grasps everything within 4.5 m (`debuff` default radius) for 12 s | curse ring, motif | 0.5 s | cage (same as Bone Cage) | C: one soul, grave-hands drawn on it while it holds |
| Exsanguinate (3.1) | Yes (5% max life a second, boss a quarter, heal half) | tether beam | 0.8 s lock | beam | K (name: PoE) |
| Death's Embrace (3.2) | Yes | - | - | hand^aura | K |
| Revenant Form (4.0) | Yes (stats, wards fear and bleed); the body never changes for its 12 s | self burst, motif | 0.35 s for a 1.05 s gesture, too fast | ghost^rise (same as Bone Spirit) | C: the body looks dead while it lasts |
| Harvest (4.1) | Yes, but order dependent: if Harvest's ranks were learned before Reap Soul's, its +50% time and +2 souls a rank are swallowed by Reap Soul's `Math.max` | - | - | scythe (shared) | K (fix the order) |
| Sanguine Nova (4.2) | Yes; hit is silent | nova, motif | 0.5 s | drop^nova (same as Poison Nova) | K (sound) |
| Undying (5.0) | Yes | - | - | heart^aura | K |
| Soul Tether (5.1) | Yes (link of 4 nearest, 35% shared) | curse ring once; nothing shows the link while it lasts | 0.5 s | chain | C: chains drawn between the bound while it holds |
| Crimson Covenant (5.2) | Yes | - | - | rune (shared) | K |
| The Second Death (6.0) | Yes | nova on rise | - | skull^rise (shared) | K |
| Reaping (6.1) | Yes (execute, 2 souls a kill) | nova, crescents motif | 0.5 s | scythe^spin (shared) | K |
| Grave Pact (6.2) | Yes | - | - | scythe^mastery (shared) | K |

Totals: keep 30, change 22, replace 2 (Wither, Gravechill). Broken or
half working: Bone Spear timing, Raise Skeleton, Skeletal Mage, Bone
Spirit, Clay Sentinel, Marrow Feast, Bone Cage, Death Knight, Grand
Ossuary, Decay, Terror, Doom, Attrition, Mass Confusion, Pestilence, Soul
Cage, Harvest order.

Found while reading, shared code:
- The zone list is capped at 12 (`addZone`), oldest out first. Bone
  Storm, Pestilence and Gravechill are zones, and so is every Bone Choir
  pool, so a few minions dying evicts the Revenant's own auras mid-fight.
- Summon bodies: per-skill caps 12 / 8 / 3 / 16 (with Ossuary Lord) add to
  39, and the backstop is 28 bodies (`SUMMON_ABSOLUTE_CAP + 8`), each a
  full monster rig walking its own route. That is the swarm the class note
  warns about (frame rate).

### Milestone 2: the new kit plan

Rules for the build: ids stay for every kept or changed skill (saves keep
their ranks), including renamed ones: only the shown name changes. The two
new skills get new ids, so `repairCharacter` in `src/sim/Character.ts`
refunds `wither` and `gravechill` ranks and clears them from the hotbar
(checked: it deletes ranks in any id the class no longer has, refunds them,
and clears hotbar and primary). Tiers, columns and `requires` stay, so no
chain or capstone breaks: the new skills take the old slots and the skills
that needed the old ones need the new ones. Damage per hit stays as today
except where the tooltip and the code disagree and the tooltip's number is
the one kept (Raise Skeleton 55%, Skeletal Mage 60%, Clay Sentinel 70%
read from `damagePct`); only speeds move (milestone 3).

**Renames (owner: our own names, never Diablo II's or Path of Exile's).**
Ids stay; every `tr()` string, tooltip and unique text that names them
follows:

| Id | Today | New name |
| --- | --- | --- |
| boneSpear | Bone Spear | Femur Lance |
| raiseSkeleton | Raise Skeleton | Bone Thrall |
| boneArmor | Bone Armor | Rib Ward |
| skeletalMage | Skeletal Mage | Bone Chanter |
| boneSpirit | Bone Spirit | Hunting Skull |
| claySentinel | Clay Sentinel | Charnel Colossus |
| weaken | Weaken | Wilt |
| amplifyDamage | Amplify Damage | Flay |
| terror | Terror | Horrify |
| corpseExplosion | Corpse Explosion | Charnel Burst |
| poisonNova | Poison Nova | Bile Ring |
| contagion | Contagion | Catching Rot |
| lowerResist | Lower Resist | Fray |
| exsanguinate | Exsanguinate | Bleed Dry |

(Checked: none of these names is used anywhere else in the game.)

**Keep as is (30):** Rib Ward (Bone Armor), Bone Mastery, Ossuary Lord,
Reassemble (drop its dead minion sound), Bone Nova, The Bone Choir,
Ossuary Mastery; Wilt (Weaken), Blight Bolt, Flay (Amplify Damage), Bile
Ring (Poison Nova), Blood Curse, Charnel Burst (Corpse Explosion, add its
hit sound), Catching Rot (Contagion), Curse Mastery, The Long Decline (its
tick named after it, not Wither), Fray (Lower Resist), Blight Mastery;
Siphon Life, Spirit Ward, Reap Soul, Blood Pact, Vampiric Touch, Bleed Dry
(Exsanguinate), Death's Embrace (now needs Gravewalk), Harvest (made order
proof), Sanguine Nova (add its hit sound), Undying, Crimson Covenant, The
Second Death, Reaping, Grave Pact. All still get new icons (milestone 5)
and their speed checked (milestone 3).

**Change (22):**

Ossuary
- Femur Lance (Bone Spear): each body on the line is struck as the lance
  passes it (scheduled by distance over speed), not all at once at the
  end. Numbers stay. Sharper bone lance with a marrow trail (milestone 6).
- Bone Thrall (Raise Skeleton): the tooltip says the real cap (5, +1 per 2
  ranks, up to 12); hits read `damagePct` (55%, +6% a rank) so the unique's
  damage bend works; when a corpse lies within 4 m of the point the thrall
  claws up out of it and the body is used up (the corpse matters), else it
  rises from the floor.
- Bone Chanter (Skeletal Mage): a real caster. The `bone_conjurer` body,
  ranged, keeping its distance, and throwing its own bone-and-witchlight
  bolt that flies and lands (its hit on arrival). The tooltip says the real
  cap (4, +1 per 3 ranks, up to 8); hits read `damagePct` (60%).
- Hunting Skull (Bone Spirit): really homes (the projectile's `target` and
  `homing`), turns onto the next enemy if its mark dies, never misses; drawn
  as a skull with a wisp tail, not an orb. Numbers stay.
- Charnel Colossus (Clay Sentinel): a hulking construct of fused bone (a
  brute body with a bone palette and a ribcage chest), taunting; tooltip
  says 260% life (the code's number) and drops the knockback line; hits
  read `damagePct` (70%).
- Marrow Feast: does what it says. Minions heal themselves for their life
  steal and for 15% of their life on a kill; the hero's +1.5% life on kill
  goes away (Vampiric Touch is the one that feeds the hero).
- Bone Cage: ribs burst up in a ring: one 120% hit (+19% a rank) as they
  rise, everything inside rooted for 3 s (+0.15 s a rank), and the ribs
  stand for exactly that time, then crumble. No ticking field.
- Bone Storm: the shards really orbit the Revenant for the full 15 s (an
  instanced ring of bone splinters, lit), not a one-shot motif.
- Skeletal Knight: knights look like knights: an armoured skeleton body,
  a little taller, a notched blade.
- Death Knight: its +40% (+4% a rank) multiplies the knight's damage, as
  "more" says; death knights carry a pale witchfire in the eyes and blade.
- Grand Ossuary: the wardens are melee brutes (fix the case-sensitive
  check), raised in a ring around the aim point inside its 14 m reach.

Blight
- Decay: the tooltip says "+5% curse duration per rank" (what the code
  does; at 10 s curses this is the old +0.5 s).
- Horrify (Terror): really flees. Feared monsters run from the Revenant
  and start no attack while it lasts (bosses and control-immune excepted);
  the +20% move speed now only speeds the flight. A small additive check
  in `Enemy.ts` / `AI.ts` (shared), which also makes the Knight's
  Intimidate fear work.
- Doom: one target, as written. A brand drawn over its head that burns down
  for its 6 s; the burst has its own sound; if it dies first the brand jumps
  at once to the nearest enemy within 8 m and keeps its time. The status
  lasts as long as the fuse.
- Attrition: does what it says: its own status (`attrition`), every
  resistance -1% a rank and attack speed -2% a rank, refreshed on whatever
  stands within 8 m. No more Weakened or move slow.
- Mass Confusion: confused monsters really turn on each other: each one
  goes for the nearest other monster and strikes it with its own blows for
  the time (+20% damage from allies stays), and starts no attack on the
  Revenant or his minions. Bosses excepted. Small additive edit in
  `Enemy.ts` / `AI.ts` (shared).
- Pestilence: Plagued really spreads: every 2 s each plagued enemy passes
  it to the nearest clean enemy within 4 m (through the runner's existing
  spread tick, so no second system). The tooltip names its 30 s, and the
  HUD shows a status for exactly that long.

Grave Pact
- Soul Cage: one soul, as written: the target only (nearest the aim point),
  held by grave-hands drawn rising around it while it lasts. Numbers stay.
- Revenant Form: the body looks dead while it lasts: grey-blue skin, eyes
  burning teal, a slow pale smoke off the shoulders (a `BodyFX` look).
- Soul Tether: the bound are joined by faint chains drawn between them for
  as long as the link holds, flaring when a share passes.

**Replace (2):**
- Wither (Blight 2.2, passive, needs Decay) becomes **Hex Upon Hex**
  (`hexUponHex`): every curse of yours on an enemy past the first makes it
  take 6% more damage from you and your minions (+0.6% a rank). Your curses
  (Wilt, Flay, Horrify, Doom, Mass Confusion, Fray, Soul Cage, Soul Tether)
  each count once. It gives the tree's own promise ("curses layered until
  a room kills itself") a rule of its own and leaves the % of life drain to
  the capstone alone. Blood Curse and Attrition now need it; Pestilence's
  synergy from Wither moves to it (6%).
- Gravechill (Grave Pact 2.1, needs Spirit Ward) becomes **Gravewalk**
  (`gravewalk`), a new active: the Revenant sinks into the floor and claws
  back up at the point, up to 8 m away (+0.2 m a rank). Where he rises,
  grave-hands burst up: enemies within 3 m are Grasped for 1 s (+0.05 s a
  rank) and take 90% spell damage (+14% a rank) as arcane, and he heals 3%
  of his life for each one held. It fills the kit's real gap: the class had
  no way at all to move or escape. Distinct from the Mage's Frost Step (that
  bursts where it leaves and freezes; this holds and drinks where it
  arrives). Its own gesture (a crouch that sinks, a claw up out of the
  floor), a dirt and grave-light burst, hands rising at the arrival, its own
  sound (an unused bank take, or a request to audio). Death's Embrace now
  needs it. Synergy: Gravewalk from Spirit Ward (6%).

**New skills beyond that:** none. Every tree is full, and the rest are
worth keeping once they work, read and look their own; mobility was the one
real gap.

**Speeds (milestone 3, under skillcore's model):** summons and the host
(Grand Ossuary, Charnel Colossus) a slow, heavy raise; curses a quick
flick; bolts and the lance a medium throw; buffs and forms (Blood Pact,
Revenant Form, Rib Ward) a committed beat, not 0.35 s; minion swings near
a D2 skeleton's pace at the speed ceiling.

**Uniques and sets that name Revenant skills (still valid after the plan):**
Bone Spear (`range`, `count`, `arc`), Raise Skeleton (`lifePct`,
`damagePct` (works once hits read it), `baseCap`), Corpse Explosion
(`radius`), Poison Nova (`radius`, `poisonStacks`), Bone Armor (`absorb`,
`duration`), Siphon Life (`healPct`, `range`), Skeletal Mage (`baseCap`,
`lifePct`, `range`), Amplify Damage (`radius`, `duration`, `amplify`). No
set names a Revenant skill. Their text follows the new names.

**Out of my files, small additive edits (shared):** `Enemy.ts` / `AI.ts`
(feared flees and does not attack; confused attacks the nearest monster),
`sim/Passives.ts` (Revenant rules only: Marrow Feast, Attrition, Hex Upon
Hex, Harvest order, Death Knight), `DungeonScene.ts` (Attrition status,
Long Decline tick name, `warmup()` stand-ins), `data/statuses.ts` (the
`attrition` status), `fx/BodyFX.ts` (Revenant Form look), and the zone cap
in `SkillRunner.addZone` (auras kept, pools evicted first).

### Milestone 4: what was built

Checked by a scratch run on real monsters (headless), and all eight fast
checkers pass.

- New module `src/scenes/revenant/RevenantKit.ts`, called from `castNow`
  next to the Mage's spells with the same `SpellCast` and host: Femur Lance
  flies as a mover and strikes each body as it passes it (hits at 0.25,
  0.45, 0.67 s on bodies 3, 8 and 13 m out); Hunting Skull homes on its mark
  (`homing`, `target`) and turns on the nearest enemy within 12 m if the
  mark dies; Bone Cage is one hit and a root of exactly its time, the field
  only drawn for that time; Doom brands one enemy (Doomed lasts the fuse),
  jumps to the nearest within 8 m keeping its time, and its burst replays
  the cast recording; Soul Cage holds one enemy; Gravewalk sinks on the
  release frame, rises up to 8 m on (walls and props stop it), Grasps and
  hits what is within 3 m and heals 3% of life for each.
- Fear and confusion: `AI.think` makes the feared run (9 m off) and start
  nothing, the confused go for the nearest other monster, whose blows land
  through `Enemy.tickConfusion`. Bosses and fixated monsters excepted.
  `Enemy.applyStatuses` no longer pins a feared or confused body (both are
  `control` holds, which set `rootTimer`; that is why Terror never ran).
  This also makes the Knight's Intimidate fear work.
- Attrition lays its own status (`attrition`: resistances and attack
  speed), Marrow Feast heals the minions, Death Knight multiplies, Harvest
  runs last (`RUN_LAST`), The Long Decline's tick carries its name.
- Hex Upon Hex: `SkillRunner.hexMul` in `tune`, and `hexed` for melee
  minion blows (which skip `tune`); `Enemy.countStatuses`.
- Summons: a point summon rises at the aim (up to 12 m, Grand Ossuary
  14 m), a Bone Thrall out of a corpse near the aim (the body is used up);
  hits read `damagePct`; Bone Chanter is ranged in the `bone_conjurer`
  body with a staff, its bolt lobs and lands; Grand Ossuary's wardens are
  melee; Charnel Colossus is the `grave_titan` body in bone and teal;
  knights rise in the `gravebound_knight` body (`ELITE_MONSTER`), Death
  Knights in dark steel with witchfire; the scene warms the knight body.
- Plagued hops every 2 s to the nearest clean enemy within 4 m with the
  time it has left (`SkillRunner.plagueTick`, in the spread tick). This is
  every Plagued, so the Rogue's Plague Vial spreads now too, as its status
  text always said.
- The zone cap (12) drops the oldest floor field first, never an aura that
  walks with the hero.
- Names, tooltips (all true to the code), Hex Upon Hex and Gravewalk data,
  synergies, requirements, unique bend words, minion names, strings.
- `tools/rankpower-entry.ts`: Reassemble's test lets the raise land on its
  release frame before hurting the thralls (it read x1.00 since milestone 3).

### Milestone 7: check

- `check-curve --classes=revenant`, run once (2026-10-20, after the looks):
  1 of 5 fails.
  - depth 1 ok: packs 3/3 (low 38%), bosses 3/3, 5 potions.
  - depth 5 ok: packs 3/3 (low 40%), bosses 1/3 (low 0%), 8 potions.
  - depth 12 WALLED: packs 0/3 (7/10/6 s, low 0%), bosses 3/3 (low 4%),
    17 potions, mods swarm 1, elites 2, frostbite 2, hardened 1, elites 1.
  - depth 25 ok: packs 3/3 (low 98%), bosses 3/3 (low 37%), 2 potions.
  - depth 40 ok: packs 3/3 (low 37%), bosses 2/3 (low 0%), 9 potions.
  - Before (`qa-bugs.md`, the last full curve): nothing walled; the
    Revenant's only mark was "untouched" at tier 5. So depth 12 is walled
    now and was not before. Per the rule, no damage per hit was raised and
    no monster was touched: the owner decides. Likely causes to look at:
    the slower casts from the speed audit (milestone 3) at a depth where
    the hero has few points, and that pack's heavy mods (two elite mods
    and frostbite). It was run once only, so one seed set may be unlucky.
  - The headless curve prints "[feel] hit report failed" on kills
    (`CombatFeel.onKill` with the tool's stand-in effects); the Mage saw
    the same. It is caught and does not change the fights.

### Milestone 6: looks and cost

- New file `src/fx/revenant/RevenantFX.ts`, driven each frame by
  `RevenantKit.update` (made on first use through `RevenantKit.looks`,
  cleared with the kit on a new level). What it draws:
  - Bone Storm: 6 to 14 bone shards (the `spear` solid) orbit him on their
    own rings and heights, all one way, tumbling, with a chip of bone now
    and then. They fly out from him at the start and scatter to the floor
    when the storm ends. The zone's handle stops shards and aura together.
  - Bone Cage: 6 to 18 ribs (new `rib` solid) burst up round the ring with a
    ripple, overshoot and settle, curl in over the middle, stand exactly as
    long as the root, then sink. Bone chips and dust where each breaks the
    floor. The floor field and nova stay under them.
  - Gravewalk: 6 to 8 grave-hands (new `claw` solid) claw up round where he
    rises, and one at the feet of each enemy held (up to 6), fingers
    curled toward what they hold, shuddering while they grip, sinking when
    the grasp ends.
  - Soul Cage: 3 or 4 hands round the one soul, following it, for the
    hold's time, letting go early if it dies.
  - Soul Tether: a sagging chain of dark iron links (new `link` solid, a red
    glow in the iron) from one bound enemy to the next, round the pack in
    a loop (a single span for two). It draws out over 0.3 s, closes up
    round the rest when one dies, ends when fewer than two live or the
    time runs out, and breaks in wisps. One budget of 34 to 44 links for
    the whole chain.
  - Revenant Form: three skulls (new `skull` solid) chase each other round
    his head inside a shroud (`effects.aura`), with wisps coming off him,
    for exactly as long as the form's status holds; they rise and shrink
    away when it ends.
  - Hunting Skull: the projectile has a new `shape: 'skull'` body in
    `EffectSystem.projectile` (`Body.Skull`): a bone skull flying face
    first and upright, rocking a little, its arcane glow hung behind it
    so the bone reads, with the school's wake and light.
- Cost: every piece is an instance in the shared solid pool
  (`fx/kit/Solids.ts`, one draw call per shape, 48 each). The four new
  shapes use materials of a kind already built (vertex-coloured standard,
  plain standard), so they add no new shader, and `SolidPool.standIns()`
  (already in `DungeonScene.warmup` through `effects.standIns()`) warms
  them with the rest. Handles are taken once at the cast and written each
  frame; nothing in the per-frame code allocates. Counts follow
  `effects.fxScale` (Low about two thirds of High). Particles go through
  the shared field, which follows the quality ladder itself. No dice: the
  pieces are spread by index on the golden ratio.
- Looked at in a bare scene (scratch script, the game's WebGPU three.js,
  newest Chrome): ribs curl in over the ring, hands curl toward what they
  hold, the chain sags link by link in a loop, skulls fly upright and face
  first. 80 pieces live at once in that scene.
- Every look is drawn after the blow, root or heal it rides with, and
  `RevenantFX` reads `fxScale` only when it is a number, so the rank and
  parameter checkers' stand-in effects cannot stop the gameplay.
- Fast checkers: rankpower, stattext, iconmatch, skilldepth, passives,
  wiring and i18n pass. skillparams, unique and skillsound fail only on
  Ranger skills (sk-ranger's stream, mid-build upstream); no Revenant
  skill is listed.

### Milestone 5: icons

- His own pictograms in `src/art/RevenantGlyphs.ts` (26 glyphs, `rv`
  prefix, 54 forms with their variants; the file header lists each one),
  spread into `GLYPHS`. His icon keys in `src/art/icons/revenantIcons.ts`
  (`rv-` prefix), spread into `ICON_MAP`; every Revenant skill's `icon`
  points at one. No two of the 54 share a glyph, variant and modifier.
- Each tree has its own light and ground (`TREE_LOOK.revenant` in
  `SkillIconArt.ts`): Ossuary grave teal `0x9ae0c8`, Blight bile green
  `0xb4d84a`, Grave Pact heart red `0xe04a5e`. New `ClassLook.ownLight`:
  his arcane and poison skills take the tree's light, not the element's
  pink or green, so every tree reads as one.
- Looked at on a contact sheet of all 54 at 112 px and 32 px (scratch
  script, newest Chrome): each is one clear shape at hotbar size. All 54
  bake in about 0.56 s at 128 px, about 10 ms each.
- The old Revenant names in `ICON_MAP` (`bone-spear`, `cage` and so on)
  are left for anything else that still names them; no Revenant skill
  uses them now. `tools/art-sheet-page.ts` closeups name the new keys.

### Milestone 3: speed audit (skillcore's model, `sim/Speed.ts`)

How a Revenant use is timed now (read from the code after skillcore):

- Every Revenant active is a spell (`skillTiming`): no attack family, and
  a wand or an orb is neither melee nor ranged. One use takes `castTime`
  seconds (default 0.5; self buffs and auras 0.35; tethers, family
  `channel`, 0.8) divided by `castMult`. Every branch the Revenant uses
  starts its action with that time (`actTime`); no in-code factor is left.
- `castMult` = `speedMultiplier(castSpeed%)`. `sim/Stats.ts` clamps cast
  speed at 200%, so the ceiling is x1.67: a 0.5 s spell takes 0.30 s
  (3.33 a second), under the 3.4 cap. No Revenant skill or passive gives
  cast speed; all of it comes from gear.
- No basic attack (wand and orb). The default cast is Femur Lance (Bone
  Spear), the first hotbar slot.
- Reference feel: a Diablo II caster of this kind casts a little under 2
  a second with no gear and about 2.8 at its best; Path of Exile minion
  spells take 0.75 to 0.85 s base, curses about 0.5 s, buffs 0.5 to 0.6 s.
- Minion swings are outside skillcore's model. A melee minion swings every
  1.1 s, a ranged one every 1.6 s, divided by Marrow Feast's minion attack
  speed (+6% a rank, +120% at rank 20). That was linear: 0.5 s and 0.73 s
  at rank 20, a skeleton host swinging twice a second each. Now it goes
  through the same curve as the hero (`speedMultiplier`): 0.71 s and
  1.04 s at rank 20 (x1.55). Ranks still pay every time.
- Release frame: the Revenant joined `RELEASE_CLASSES`, as the Mage did.
  Every Revenant spell but the two tethers (family `channel`) now lets go
  on its gesture's release frame, a third of the cast and at most 0.25 s.
  Mana, cooldown and the cast sound go on the press; a dodge before the
  release cancels the spell.

No gear = 0% cast speed. Ceiling = 200% (x1.67). Seconds per use.

| Skill | castTime before | No gear | Ceiling | Verdict | New castTime |
| --- | --- | --- | --- | --- | --- |
| Femur Lance (default cast), Blight Bolt, Hunting Skull | 0.5 | 0.50 (2.0/s) | 0.30 (3.3/s) | Right: the caster pace, a touch quicker than the reference | 0.5 |
| Wilt, Flay, Horrify, Fray (curses) | 0.5 | 0.50 | 0.30 | Right: a curse is a quick flick | 0.5 |
| Bone Cage, Soul Cage, Soul Tether, Charnel Burst | 0.5 | 0.50 | 0.30 | Right | 0.5 |
| Bone Nova, Bile Ring, Sanguine Nova | 0.5 | 0.50 | 0.30 | Right | 0.5 |
| Siphon Life, Bleed Dry (tethers) | 0.8 | 0.80 | 0.48 | Right: the body locks 0.8 s, the tether runs on 3 to 4 s while he walks | 0.8 |
| Rib Ward (Bone Armor) | 0.35 | 0.35 | 0.30 (cap) | A little fast for a 25 s ward | 0.45 (0.30 at the ceiling) |
| Bone Storm | 0.35 | 0.35 | 0.30 | Too fast for 15 s of shards | 0.5 |
| Pestilence | 0.35 | 0.35 | 0.30 | Too fast for a 30 s plague | 0.5 |
| Blood Pact | 0.35 | 0.35 | 0.30 | Too fast for a pact that costs life | 0.5 |
| Revenant Form | 0.35 | 0.35 | 0.30 | Too fast for a 12 s change of body | 0.6 (0.36) |
| Bone Thrall (Raise Skeleton), Bone Chanter (Skeletal Mage) | 0.5 | 0.50 | 0.30 | Too fast for a raise | 0.65 (0.39) |
| Reassemble | 0.5 | 0.50 | 0.30 | A little fast for a host mended and the fallen stood up | 0.6 |
| Charnel Colossus (Clay Sentinel) | 0.5 | 0.50 | 0.30 | Too fast for one hulking construct | 0.8 (0.48) |
| Grand Ossuary (capstone host) | 0.5 | 0.50 | 0.30 | Too fast: a host from the floor in half a second | 0.9 (0.54) |
| Doom | 0.5 | 0.50 | 0.30 | A little fast for a brand that holds 6 s | 0.6 |
| Mass Confusion | 0.5 | 0.50 | 0.30 | A little fast for a tier 5 room curse | 0.6 |
| Reaping | 0.5 | 0.50 | 0.30 | A little fast for the tier 6 sweep | 0.6 |
| Gravewalk (new) | - | - | - | A move: sink, travel, rise | built in milestone 4, timed with `castTime` and `travelTime` |
| Minion swing, melee (thralls, colossus, wardens) | 1.1 s / (1 + 1.2) = 0.50 at Marrow Feast 20 | 1.10 | 0.71 | Was too fast at rank 20 | through `speedMultiplier` |
| Minion swing, ranged (chanters) | 1.6 s / 2.2 = 0.73 | 1.60 | 1.04 | Was too fast at rank 20 | through `speedMultiplier` |

- Every skill slowed above has a cooldown or a duration far longer than
  its new cast (summons fill a cap, buffs last 12 to 30 s), so damage per
  second barely moves. Damage per hit is unchanged for every skill.

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
