# Stream: sk-knight (Wave 5: Knight skills remake)

Status: in progress

Class: Knight (code id `warden`). Trees: Bulwark, Carnage, Oaths (`bulwark`, `carnage`, `oath`). Port 4352.
Fights with melee: swords, axes, maces, shields (starts with a short sword and a buckler). Class color: gold (`0xc8a24a`).

Goal (owner): fix every Knight skill and remake the kit to a AAA
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

Your files (Wave 5 file ownership in `PLAN.md`): the `BULWARK`, `CARNAGE` and `OATH` sections of `src/data/skills.ts`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=warden`). Browser, one at a time, at
most once per milestone: `check-skills --classes=warden`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Heavy, grounded swings. A two handed blow should feel slow and huge, a
  sword and board swing quick and clean. Shield skills must read as shield
  work, not a weapon swing.

## Milestones

- [x] 1. Skill audit (read code only). (sk-knight: skill audit and kit plan) For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. Plan the new kit (sk-knight: skill audit and kit plan) (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. Speed audit (sk-knight: speed audit and per-skill times) (owner: before any skill is changed). Under skillcore's model, write a table
  under "Notes for resume": the Knight's basic attack (or, for a caster,
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
- [ ] 7. Check. `check-skills --classes=warden` once (one retry if it fails,
  then note it) and `check-curve --classes=warden` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Milestone 4, build, in this order: the broken ones first (Fortress
Stance, Guard Stance, Shield Wall status, Blood Tide, The Last Order,
Banner, Taunting Roar pull, Shield Charge and Earthshatter timing,
Gorefeast and War Stomp junk buff), then Gatefall, then the own blows for
every weapon skill, then Sworn Brother. The plan is under "Milestone 2"
in "Notes for resume"; times are under "Milestone 3".

## Notes for resume

### Milestone 1: skill audit (from the code on 2026-10-20, before skillcore)

How the Knight's skills run today (read from the code, not notes):

- Data: `src/data/skills.ts` `BULWARK` / `CARNAGE` / `OATH`, 18 skills
  each, every slot used. 25 actives, 29 passives.
- Body move: `clipFor` in `SkillRunner.ts` plays `skillAction(id)`. All 11
  Knight weapon skills are in `PLAIN_MOVES` (`art/hero/SkillActions.ts`):
  they play the plain moves `attack1` / `attack2` / `thrust` / `lunge` /
  `slam` from `art/hero/Actions.ts`. `attack1` and `attack2` are the basic
  attack's own chain (`actionFor` picks the next blow of the weapon's
  chain), so Cleave, Rend, Sunder, Whirlwind and Massacre swing exactly
  like a basic attack. The 14 non-weapon actives have their own gesture in
  `art/hero/gestures/knight.ts`.
- Look: weapon skills draw no motif (`SKILL_MOTIFS` leaves them out by an
  old owner call) and no effect of their own: only the shared swing ribbon
  (`BodyFX`, `swingSchool`) and the shared `meleeHit` spark per target. So
  every Knight weapon skill looks like a basic attack with a different
  number. Non-weapon actives get the family drawing (`selfCast`, `nova`,
  `explosion`, `cone`) plus one motif from `SKILL_MOTIFS`.
- Speed today: melee skills take `attackTime = 0.42 / (1 + AS%)`, the
  same as a basic swing, whatever the skill (Ruin, a 400% "swing meant for
  a god", is as quick as a jab). Buffs, shouts, banners, stances:
  `castTime * 0.7 = 0.35 s`. Projectile, aoe: `castTime = 0.5 s`. Wave:
  `attackTime`. Dash: `Player.dodge` span 0.32 to 0.5 s. Attack speed caps
  at +200% (`Stats.ts`), so a swing can reach 0.14 s. skillcore owns the
  model; milestone 3 redoes this table under it.
- Icons: `ICON_MAP` in `art/SkillIconArt.ts` builds each icon from a shared
  glyph plus a modifier (`glyph[:variant][^modifier]`). Gold class light on
  an iron frame for every Knight icon (class colours: yes), one accent for
  all three trees (pips only). Many Knight icons reuse one glyph: `shield`
  x7 (shieldWall, shieldBash, deflect, guardStance, shieldCharge,
  spikedGuard, commandingPresence), `skull:1` x3, `axe` x3, `claw` x4,
  `fist` x3, `horn` x2, `banner` x2, `tower` x2, `drop` x3. Several are off
  theme: a beast `claw` for blade wounds, `bone` for Sunder (bone is the
  Revenant's), an `arrow` for War-Trained, a `gear` for Shield Throw, an
  `eye` for Taunting Roar, a `helm` for Iron Skin.
- Sound: every active has its own row in `audio/SkillSounds.ts`. Sworn
  Brother's minion strike is `skill.clone.strike`, the Rogue Shadow's
  sound.

Legend: works = the code does what the tooltip says. Move: own = its own
gesture; plain = a shared plain move. Verdict: K keep, C change, R
replace.

| Skill (tier.col) | Works? | Move | Effect | Too fast? | Icon | Verdict, why |
| --- | --- | --- | --- | --- | --- | --- |
| **Bulwark** | | | | | | |
| Shield Wall (1.0) | Yes, but it uses status `stoneform`, the same as Fortress Stance, so one overwrites the other and the buff reads "Stoneform" | own | self burst + domes wall | ok (0.35 s) | shield^rise (shared glyph) | C: own status so it stacks with Fortress Stance |
| Iron Skin (1.1) | Yes | - | - | - | helm (off theme) | K |
| Braced (1.2) | Yes | - | - | - | boot^field | K |
| Shield Bash (2.0) | Yes (stun, knockback, block scale, Aegis bank) | plain `thrust`: a sword thrust with the shield held still, not a shield blow | swing ribbon only | yes, basic swing time | shield^impact (shared) | C: real shield punch, shield impact ring |
| Deflect (2.1) | Yes | - | - | - | shield:1^spin (shared) | K |
| Guard Stance (2.2) | Half: "while active" but it is a 10 s buff (`applyBuff` default) for 2 mana and no cooldown, so it is recast forever; borrows the town blessing status `fortitude` | own | self burst + rings | ok | shield:1 (shared) | C: a real on/off stance with its own status |
| Shield Charge (3.0) | Half: the whole lane is damaged the instant you press, before the body has moved | plain `lunge` played over a 9 m slide (skates) | dodge only | ok | shield^speed | C: shoulder charge gesture, hits land as the body passes, dust wake |
| Bulwark Mastery (3.1) | Yes | - | - | - | anvil | K |
| Riposte (3.2) | Yes; the counter blow has no swing and no look of its own | none | `meleeHit` spark | - | sword^cross | K (small C: a quick counter swing and parry flash) |
| Aegis (4.0) | Yes (absorb, banked into Shield Bash) | own | self burst + hex sigils | ok | bubble | K |
| Immovable (4.1) | Yes | - | - | - | boulder | K |
| Spiked Guard (4.2) | Yes | - | - | - | shield:1^burst (shared) | K |
| Fortress Stance (5.0) | No: "nothing can stun, hold or knock you back. You cannot move" is not done; it is -20% move speed only; shares `stoneform` with Shield Wall | own | self burst + cracks ring | ok | tower (shared) | C: really rooted and control immune, own status |
| Unyielding (5.1) | Yes | - | - | - | rune:2 | K |
| Shield Throw (5.2) | Yes (bounces through `chainLightning` with a shield shape, block scale) | own | thrown shield + shock rings | ok (0.5 s) | gear^spin (off theme) | K (icon only) |
| Retribution (6.0) | Yes, but invisible: stored damage has no readout and no look when spent | - | none | - | crown^aura | C: show the charge (status with a count, glowing shield), a burst when spent |
| Last Oath (6.1) | Yes | - | nova | - | crack | K |
| Phalanx (6.2) | Yes | - | - | - | tower:1 (shared) | R: a tier 6 slot that is +1% block a rank; lackluster |
| **Carnage** | | | | | | |
| Cleave (1.0) | Yes (160 degree arc, 2.8 m) | plain `attack2` = the basic attack's next chain blow | swing ribbon only | yes | axe^impact (shared) | C: own wide sweep, a visible arc smear |
| Rend (1.1) | Yes (3 bleed stacks, +1 per 4 ranks) | plain `attack1` = basic attack | swing ribbon only | yes | claw (off theme) | C: own drawing cut, blood spray |
| Butchery (1.2) | Yes | - | - | - | axe:1 | K |
| Gash (2.0) | Yes (Hemorrhage bursts for 40%) | plain `thrust` | swing ribbon only; no look when it bursts | yes | claw^drip (off theme) | C: own rising cut, a visible burst |
| Blood Scent (2.1) | Yes | - | - | - | drop^impact | K |
| Overhead Strike (2.2) | Yes (+25% crit, 20% Sunder) | plain `slam` | swing ribbon only | yes: a "committed two hand swing" at basic swing time | hammer^impact | C: own slow overhead, crack on the floor |
| Sunder (3.0) | Yes (Sundered stacks) | plain `attack1` = basic attack | swing ribbon only | yes | bone:1^burst (off theme) | C: own splitting chop, plate shards on hit |
| Reaver (3.1) | Yes (Frenzy on kill) | - | - | - | sword^rise | K |
| Maim (3.2) | Yes (cripple, 2 bleeds) | plain `lunge` | swing ribbon only | yes | boot^drip | C: own low leg cut |
| Whirlwind (4.0) | Half: "spin through the pack" but it is a standing spin, one hit a press; you walk to the target first (`needsReach`) | plain `attack2` = a basic chain blow, not a spin | swing ribbon only | yes | axe:1^spin | C: a real travelling spin with its own looping move and blade ring |
| Arterial Strike (4.1) | Yes | - | - | - | drop | K |
| Blood Drinker (4.2) | Yes | - | - | - | chalice | K |
| Executioner (5.0) | Yes | - | - | - | axe (shared) | K |
| Gorefeast (5.1) | Half: also deals a 100% weapon hit burst the tooltip never names, and leaves a blank placeholder buff on you (`applyBuff` at the end of the `aoe` branch) | own | explosion + blood spray converge | ok (0.5 s) | skull^drip (shared) | C: tooltip truth, no junk buff, blood drawn into the Knight |
| Massacre (5.2) | Yes (5 hits, a bleed each) | plain `attack1`: one blow while five land | swing ribbon only | yes | claw^multi (off theme) | C: own five cut flurry, each cut on its hit |
| Blood Tide (6.0) | No: "when a bleeding enemy dies, every stack leaps to all enemies within 6m" is not done; the code (`spreadTick`) hops one stack every 2 s from any bleeder to its nearest neighbour, death or not | - | small impact | - | wave | C: really on death, all stacks, all in reach |
| Ruin (6.1) | Yes (5 m, 90 degrees, double vs bleeding) | plain `slam` | swing ribbon only | yes: basic swing time for the biggest blow in the tree | skull:1^impact (shared) | C: own huge slow blow, a cone of broken floor |
| Unrelenting (6.2) | Yes | - | - | - | fist (shared) | K |
| **Oaths** | | | | | | |
| Battle Cry (1.0) | Yes (damage buff, Weakened) | own | shout + rings ripple | ok | horn^nova (shared) | K |
| Oath of Might (1.1) | Yes (passive grant; "aura" in `fx` draws nothing) | - | - | - | fist^impact (shared) | K |
| War-Trained (1.2) | Yes | - | - | - | arrow^spin (off theme) | K (icon) |
| Rallying Horn (2.0) | Yes (heal you and minions, cleanse) | own | shout + light pools | ok | horn (shared) | K |
| Oath of Iron (2.1) | Yes | - | - | - | fist^aura (shared) | K |
| Intimidate (2.2) | Yes (Feared, Weakened) | own | shout + eyes ring | ok | skull:1^nova (shared) | K |
| Banner of the Gate (3.0) | Half: "plant a standard" but nothing is planted; it is a 20 s buff on you wherever you go, and its `radius` is never read | own | a burst at your feet | ok | banner (shared) | C: a real standard in the floor; its bonus only inside its ring |
| Commanding Presence (3.1) | Yes | - | - | - | shield^aura (shared) | K |
| Taunting Roar (3.2) | Half: "forces every enemy to attack you" does nothing (monsters already attack the hero; no taunt exists); only Vulnerable lands | own | shout + wedges | ok | eye^nova (off theme) | C: a roar that drags the pack in to you (a real pull) and leaves Vulnerable |
| Oath of Blood (4.0) | Yes | - | - | - | drop^aura | K |
| War Stomp (4.1) | Yes, but leaves a blank placeholder buff on you (`aoe` branch `applyBuff`) | own | explosion + stones burst | ok | boot^impact | C: no junk buff, cracked ring on the floor |
| Veteran's Resolve (4.2) | Yes | - | - | - | claw^aura (off theme) | K |
| Standard Bearer (5.0) | Yes (through `groundDurationPct`, `auraStrengthPct`) | - | - | - | banner:1 (shared) | K |
| Earthshatter (5.1) | Half: the full 12 m line is hit the instant you press; the wave does not travel | own (leap and land) | cone + slam | yes: a leap and landing at basic swing time | crack^field | C: a wave that travels, hits on arrival, fissure decal |
| Hymn of Thorns (5.2) | Yes | - | - | - | spikes^aura | K |
| The Last Order (6.0) | No: "you no longer swear one oath at a time... all run at 45%" is false. Oaths are always-on passives; the code makes `oathOf*` passives 45% stronger and +2% DR each; Hymn of Thorns is not counted | - | - | - | sword^aura | C: a capstone that changes play (see plan) and a true tooltip |
| Herald of Ruin (6.1) | Yes (blast, stun, fear, sunder, vulnerable ride the packets) | own | shout + cracks star | yes: 0.35 s for a crouch and explosion | skull:1 (shared) | K (speed in M3) |
| Sworn Brother (6.2) | Yes, but the "spectral Knight" is the `bandit_cutthroat` body (the Rogue Shadow's too) with the Rogue clone's strike sound | - | raised minion | - | helm:1^aura | C: a spectral armoured body and its own strike sound |

Totals: keep 30 (most passives, Aegis, Shield Throw, Battle Cry, Rallying
Horn, Intimidate, Herald of Ruin), change 23, replace 1 (Phalanx).
Broken or half working: Shield Wall/Fortress Stance status clash, Guard
Stance, Shield Charge, Fortress Stance, Retribution (invisible), Whirlwind,
Gorefeast, Blood Tide, Banner of the Gate, Taunting Roar, War Stomp,
Earthshatter, The Last Order, Sworn Brother.

### Milestone 2: the new kit plan

Rules for the build: ids stay for every kept or changed skill (saves keep
their ranks); the one new skill gets a new id, so `repairCharacter` in
`src/sim/Character.ts` refunds Phalanx ranks and clears it from the bar
(checked: it deletes ranks in any id the class no longer has, refunds
them, and clears hotbar and right click). Tiers, columns and `requires`
stay as they are, so no prerequisite chain or capstone breaks. Damage per
hit stays as it is today; only speeds move (milestone 3). Weapon skills
keep the owner's old "no spell shape" call: their looks are physical
(steel, blood, dust, broken floor), never a glowing sigil.

Every weapon skill leaves `PLAIN_MOVES` and gets its own blow in
`art/hero/gestures/knight.ts` (`hit: true`, weapon placed with `reach`, a
wind up, contact and follow through, `alt.great` keys for a two-hander),
so no Knight skill swings like the basic attack. Physical looks go in a new
`src/fx/knight/` folder, each with a `warmup()` stand-in.

**Keep as is (30):** Iron Skin, Braced, Deflect, Bulwark Mastery, Aegis,
Immovable, Spiked Guard, Unyielding, Shield Throw, Last Oath; Butchery,
Blood Scent, Reaver, Arterial Strike, Blood Drinker, Executioner,
Unrelenting; Battle Cry, Oath of Might, War-Trained, Rallying Horn, Oath of
Iron, Intimidate, Commanding Presence, Oath of Blood, Veteran's Resolve,
Standard Bearer, Hymn of Thorns, Herald of Ruin; Riposte (one small
change below). All of them still get new icons (milestone 5) and their
speed checked (milestone 3).

**Change (23):**

Bulwark
- Shield Wall: its own status (`shieldWall`, "Shield Wall") instead of
  `stoneform`, so it stacks with Fortress Stance and reads right.
- Shield Bash: a real shield punch (shield driven out off the lead foot,
  weight behind it; a two-hander rams with the haft), and a ringing iron
  impact at the shield face. Numbers stay.
- Guard Stance: a real stance, on until pressed again (or until Fortress
  Stance replaces it), its own status `guardStance`, its mana cost paid on
  the way in. Numbers stay; they grow a rank as today.
- Shield Charge: a shoulder charge with the shield in front (its own
  gesture held for the run, no skating thrust); each body in the lane is hit
  when the Knight reaches it, not on the key press, and knocked aside; a
  dust wake behind.
- Fortress Stance: does what it says. Rooted (cannot move) and immune to
  stun, hold and knockback while it lasts, through its own status
  `fortress` (a small additive check in `Player.ts`). The stance bonuses
  grow a rank as today; its time grows 0.1 s a rank.
- Retribution (capstone): the stored damage shows: a status on the HUD
  whose count is the stored percent, the shield glowing brighter as it
  fills, and a burst at the target when a blow spends it. It also takes
  Phalanx's rule: block cap 75% to 85%, so block builds keep their ceiling.
- Riposte: the counter swings (a quick backhand from the shield side) and
  throws a parry spark at the shield, instead of an unseen hit.

Carnage (every one: its own blow, numbers stay)
- Cleave: a wide flat sweep across 160 degrees, low and level; a steel arc
  smear on the floor the width of the real arc.
- Rend: a short sawing draw cut pulled back across the body; a spray of
  blood off each body it opens.
- Gash: a rising diagonal from the low left to the high right; when its
  Hemorrhage bursts, a visible blood burst on that body.
- Overhead Strike: a high, slow, committed overhead (both hands on a
  two-hander); a crack in the floor where it lands.
- Sunder: a short chopping split; plate shards thrown off each body hit.
- Maim: a low cut at the knees with a dip of the hips; a scrape of dust.
- Whirlwind: a real spin that travels. A looping spin move, the Knight
  moving toward the aim point at a slowed walk while the key is held, each
  turn hitting everything within reach; a blade ring around him. It no
  longer walks to a target first. Keeps `radius` and `tickRate` (the
  Millwheel unique bends both).
- Gorefeast: the tooltip names the 100% weapon damage tear it already
  deals; no blank buff left on the Knight; blood drawn in streams from each
  body into him.
- Massacre: a five cut flurry, alternating diagonals, each cut timed to its
  hit (the hits are already scheduled), so five cuts land on five swings.
- Blood Tide (capstone): does what it says. When a bleeding enemy dies,
  every stack it carried leaps to every enemy within 6 m (+0.3 m a rank),
  up to 8, amplified +4% a rank, with a blood arc drawn to each. Done
  through new Knight-only fields, because the Rogue's Apex Predator also
  feeds `bloodTide*` and keeps the old two-second hop.
- Ruin: a long coil and a huge slow blow, its 5 m 90 degree cone drawn as
  broken floor.

Oaths
- Banner of the Gate: plants a real standard (pole, crossbar, class gold
  cloth, built in code) at the point for its time. Its bonus holds only
  inside its ring (8 m, plus aura radius), so it is a place to fight from.
  One standard at a time. Sworn Brother still rises beside it.
- Taunting Roar: the roar drags every enemy within 9 m in toward the Knight
  (a real pull, bosses and control-immune foes excepted) and leaves them
  Vulnerable as today. Gathers a pack for Cleave and Whirlwind.
- War Stomp: no blank buff left on the Knight; a ring of cracked floor.
- Earthshatter: the shockwave travels out along its 12 m line and hits each
  body as it arrives; a fissure torn down the line.
- The Last Order (capstone): your shouts carry your oaths. Any shout you
  use also releases each oath you have sworn: Oath of Might, the shout
  strikes everything it reaches for 80% weapon damage (+6% a rank); Oath of
  Iron, a ward of 8% of your life (+0.5% a rank); Oath of Blood, you heal
  5% of your life (+0.4% a rank); Hymn of Thorns, everything it reaches
  bleeds (2 stacks). It keeps today's +45% oath strength (+2.5% a rank) and
  +2% damage reduction per oath, now with Hymn of Thorns counted, and the
  tooltip says exactly that.
- Sworn Brother: a spectral armoured body (an armour monster body with a
  pale ghost material), not the Rogue's bandit, and a strike sound of its
  own (an unused bank take, or a request to audio if none is free).

**Replace (1):**
- Phalanx (Bulwark 6.2, needs Fortress Stance) becomes **Gatefall**
  (`gatefall`), a new active: leap up to 10 m to the point and come down
  shield first, 240% weapon damage (+38% a rank) within 3.5 m (+0.1 m a
  rank), knocked down, damage scales with block chance like Shield Bash;
  control immune in the air. It fills the kit's gap: the Knight had one way
  to close distance (Shield Charge). Its own jump gesture (crouch, launch,
  shield raised, landing on a knee), dust ring and shield impact on
  landing. Synergies: Retribution's Phalanx line moves to Gatefall (8%);
  new `gatefall` from Shield Charge (10%) and Fortress Stance (6%).

**New skills beyond that:** none. Every tree is full, and the other
skills are worth keeping once they work and look their own; Gatefall is
the one gap.

**Speeds (milestone 3, under skillcore's model):** heavy blows (Overhead,
Ruin, Earthshatter, Gatefall) slow and huge; sword and board blows (Shield
Bash, Rend, Gash) quick and clean; shouts and stances a short committed
beat, not 0.35 s.

**Uniques and sets that name Knight skills (still valid after the plan):**
Cleave (`arc`, `radius`), Whirlwind (`radius`, `tickRate`), Shield Bash
(`stun`, `knockback`), Shield Throw (`bounces`), Aegis (`absorb`,
`duration`), War Stomp (`radius`, `stun`), Massacre (`hits`,
`bleedPerHit`), Battle Cry (`radius`, `duration`, `damagePct`). No set
names a Knight skill.

**Out of my files, small additive edits (shared):** `Player.ts` (the
`fortress` root and control immunity check), `DungeonScene.ts` (one call
for Blood Tide on death, `warmup()` stand-ins), `sim/Passives.ts` (Knight
rules only), `sim/Stats.ts` (Hymn of Thorns counted as an oath).

### Milestone 3: speed audit (skillcore's model, `src/sim/Speed.ts`)

Read from the code after `0616b06 skillcore: handover`. An attack takes
`attackTime` swings of the weapon (`1 / baseSpeed` s a swing); a spell takes
`castTime` s; speed gear goes through `speedMultiplier` (x1.5 at +100%,
approaching x2), caps 3.0 attacks and 3.4 casts a second. Times below are
seconds per use: short sword (1.4 a second, the Knight's start) with no
speed gear / the same at the ceiling (x2, capped) / great sword (1.08)
with no speed gear. Spells: no cast speed / the ceiling.

Reference feel (feel only, our numbers): a sword and board warrior swings
about 0.6 to 0.7 s a blow bare and 0.35 to 0.4 s fully geared; a two
hander nearly a second bare; a shout or war cry is a half second to most of
a second; a heavy slam is clearly slower than a plain blow.

| Skill | Timing | Before (code default) | After (own field) | Mark |
| --- | --- | --- | --- | --- |
| Basic attack | attack | 1 swing: 0.71 / 0.36 / 0.93 | same | right |
| Shield Bash | attack | 1 swing: 0.71 / 0.36 / 0.93 | 0.9: 0.64 / 0.33 / 0.83 | a hair slow: a shield punch is quick and clean |
| Shield Throw | attack | 1 swing: 0.71 / 0.36 / 0.93 | same | right |
| Cleave | attack | 1 swing: 0.71 / 0.36 / 0.93 | same | right |
| Rend | attack | 1 swing: 0.71 / 0.36 / 0.93 | 0.9: 0.64 / 0.33 / 0.83 | a hair slow: a short draw cut |
| Gash | attack | 1 swing: 0.71 / 0.36 / 0.93 | same | right |
| Overhead Strike | attack | 1 swing: 0.71 / 0.36 / 0.93 | 1.3: 0.93 / 0.46 / 1.20 | too fast: a committed overhead |
| Sunder | attack | 1 swing: 0.71 / 0.36 / 0.93 | 1.15: 0.82 / 0.41 / 1.06 | too fast: a chop that splits plate |
| Maim | attack | 1 swing: 0.71 / 0.36 / 0.93 | same | right |
| Whirlwind (one spin) | attack | 0.83: 0.59 / 0.33 / 0.77 | same (skillcore set it) | right |
| Massacre (5 cuts) | attack | 1 swing: 0.71 / 0.36 / 0.93 | 1.4: 1.00 / 0.50 / 1.30 | too fast: five cuts in one swing's time |
| Ruin | attack | 1 swing: 0.71 / 0.36 / 0.93 | 1.5: 1.07 / 0.54 / 1.39 | too fast: the biggest blow in the tree |
| Earthshatter | attack | 1 swing: 0.71 / 0.36 / 0.93 | 1.35: 0.96 / 0.48 / 1.25 | too fast: a jump and a landing |
| War Stomp | spell | 0.5 s: 0.50 / 0.29 | attack 1.2: 0.86 / 0.43 / 1.11 | wrong kind: weapon damage and a body move, was a cast |
| Gorefeast | spell | 0.5 s: 0.50 / 0.29 | attack 1.1: 0.79 / 0.39 / 1.02 | wrong kind: a blade drag and weapon damage |
| Shield Wall | spell | 0.35 s: 0.35 / 0.29 | 0.4: 0.40 / 0.29 | a hair fast |
| Guard Stance | spell | 0.35: 0.35 / 0.29 | 0.4: 0.40 / 0.29 | a hair fast |
| Aegis | spell | 0.35: 0.35 / 0.29 | 0.5: 0.50 / 0.29 | too fast: the shield lifted to the light |
| Fortress Stance | spell | 0.35: 0.35 / 0.29 | 0.6: 0.60 / 0.30 | too fast: down on one knee |
| Battle Cry | spell | 0.35: 0.35 / 0.29 | 0.6: 0.60 / 0.30 | too fast for a war cry |
| Rallying Horn | spell | 0.35: 0.35 / 0.29 | 0.6: 0.60 / 0.30 | too fast |
| Intimidate | spell | 0.35: 0.35 / 0.29 | 0.55: 0.55 / 0.29 | too fast |
| Taunting Roar | spell | 0.35: 0.35 / 0.29 | 0.6: 0.60 / 0.30 | too fast |
| Banner of the Gate | spell | 0.35: 0.35 / 0.29 | 0.7: 0.70 / 0.35 | too fast: planting a standard |
| Herald of Ruin | spell | 0.35: 0.35 / 0.29 | 0.9: 0.90 / 0.45 | too fast: a crouch and an explosion |
| Shield Charge | rush | `Player.dodge` span, capped 0.5 s for 9 m (18 m/s) | `travelTime(9)` 0.64 s (14 m/s) | too fast: reads as a blink |
| Gatefall (new) | leap | - | `travelTime(distance)` (10 m 0.71 s) plus a landing beat | new |

Damage per hit is unchanged in every row (owner's rule). The slower heavy
blows lose damage per second by the same share; that is accepted and
written down, never paid back in damage. Cleave and Rend, the Knight's
level 1 attacks, are not slowed (skillcore's curve walls the warden at
depth 1 and 12; recorded for the owner).

## For the owner to test

(empty)

## For skillqa

- Found in milestone 1, not mine to fix: the shared `aoe` branch in
  `SkillRunner.cast` ends with `applyBuff` for every aoe skill, so any aoe
  skill without an authored buff (`SELF_POWER` or `SELF_BUFF_STATUS`)
  leaves a blank placeholder buff on its caster, other classes too. The
  Knight will skip it for its own skills only.

## Handover

(empty)
