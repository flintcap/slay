# Stream: paladin

Status: done
Port: SLAY_PORT=4342

## The owner's brief

Paladin (male). Three trees:
- **Mace**: attacks for maces and scepters (one-handed).
- **Blade**: attacks for one-handed swords.
- **Aura**: auras and buffs / debuffs.

Uses a one-handed weapon and a shield (can also use two-handed weapons).
Attacks are single target. Every skill, gesture, effect and sound is new and
unique. Dark, gritty holy warrior: iron, candle smoke, bells, scorched
parchment, consecrated ground. Not shiny, not sci-fi.

Follow `docs/remake/new-class.md` for every place a class touches.

Design notes
- Class id `paladin`. Our own tree names are fine as shown above ("Mace",
  "Blade", "Aura") since the owner named them.
- Auras: a Paladin runs one aura at a time (toggle, persistent, visible ring
  at the feet, affects nearby allies/minions and/or enemies). Auras need a
  handler family and an on-screen look that is unmistakable but not noisy.
- Mace skills read heavy and blunt (crushing, stagger, armour break); Blade
  skills read fast and precise (bleeds, ripostes, combos). Shield bashes and
  blocks belong in the class too, with shield-aware gestures.
- Single target means the attack hits one enemy (riders like a short knock
  back are fine), not cleaves.

## Milestones

- [x] M1 Class def, look (male), field kit, portrait, select screen words; selectable and playable with a starter skill. (`feat(paladin): M1 class, look, kit, Tolling Blow starter`)
- [x] M2 Mace tree: 18 skills, rules, statuses, icons. (`feat(paladin): M2 Mace tree`)
- [x] M3 Blade tree: 18 skills, rules, statuses, icons. (`feat(paladin): M3 Blade tree`)
- [x] M4 Aura tree: 18 skills, aura handler + look, rules, icons. (`feat(paladin): M4 Aura tree`)
- [x] M5 A unique gesture per active skill (sword+shield, mace+shield, two-hander all read). (`feat(paladin): M5 gestures`)
- [x] M6 A unique VFX look per active skill. (`wip(paladin): a motif for every active skill, drawn where the blow lands`)
- [x] M7 A unique sound per active skill (CC0, layered takes). (built with each tree; `check-unique` sounds ok, levels in line with the other classes)
- [x] M8 Story and NPC lines, tools class lists, balance (curve passes every depth), in-game skill check green. (`check-skills --classes=paladin`: 32 of 32 working)

## Next up

Nothing: every milestone is ticked. See Handover.

## Handover

What exists: a male Paladin (`paladin`), selectable and playable, with three
trees of 18 skills each (54 skills, 32 of them active):
- Mace (`palMace`): 10 actives, family `rite` (one enemy, one blow), Dents,
  Rung, Stagger, shield bashes. Capstone The Last Bell.
- Blade (`palBlade`): 10 actives, family `rite`, Opened bleeds that
  confess, Exposed, ripostes. Capstone Red Rosary.
- Aura (`palAura`): 12 actives, family `vigil` (one ring of candles at his
  feet at a time, Twin Wick allows two), plus Anoint, Censure, Martyr's Vow
  and The Last Hour. Capstone Twin Wick.

Where it lives:
- Data: `src/data/classSkills/{paladin,paladinClass,paladinStatuses,kit}.ts`,
  per-rank numbers for skills without a damage ladder in `src/data/skillPower.ts`.
- Rules: `src/sim/passives/paladin.ts`.
- Runners: `src/scenes/paladin/Rites.ts` and `src/scenes/paladin/Vigils.ts`,
  one `case` each in `SkillRunner.cast`; the ring is `src/fx/paladin/VigilRing.ts`.
- Look: `src/art/hero/gestures/paladin.ts` (32 gestures, shield skills with
  two-hander keys), `src/fx/paladin/motifs.ts` (32 motifs), icons in
  `src/art/SkillIconArt.ts` and `src/art/PaladinGlyphs.ts`.
- Sound: `src/audio/PaladinSounds.ts`, takes in `tools/audio/paladinTakes.mjs`,
  files `public/assets/sounds/skill.pal.*` (54, each in ASSETS.md).
- Words: town lines in `src/data/story/npcs.ts` (Hesk, Kale, Vell, Marrow,
  Renn), `CLASS_NAMES` in `src/sim/Story.ts`.
- Tools that hand Blade skills a sword: `tools/rankpower-entry.ts`,
  `tools/sweep-entry.ts` (`TREE_WEAPON`), `tools/check-skills.mjs` (`KITS`).

Checks green for Paladin: typecheck, build, unique (clips, visuals, motifs,
sounds), rankpower (all 32 grow), skilldepth, sweep, curve at depth 1, 5, 12,
25 and 40, check-skills 32 of 32 working.

Left for `finish`: nothing Paladin-only. Seen and not ours: on the branch
tip `curve` fails for mage at depth 1, 5 and 12 and for shadowblade and
ranger at 12.

## Notes for resume

- Aura tree: `src/scenes/paladin/Vigils.ts` (family `vigil`, one
  `case 'vigil'` in `SkillRunner.cast`, a `snuffVigil` line before mana so
  a second press puts a vigil out free, a `tickVigils` line in
  `SkillRunner.update`, and `skills.keeper = this.player` in DungeonScene so
  vigils tick before the first press of a level). Vigils are kept per
  Character (WeakMap), so they outlive a level. The ring is
  `src/fx/paladin/VigilRing.ts` (tint and candle count per vigil). Vigil
  numbers per rank: SELF_POWER / FOE_POWER rows in `skillPower.ts`.
- Owner rule: every skill must get stronger with rank. Damage skills grow
  through `dmg`; anything without `dmg` needs a `SELF_POWER` / `FOE_POWER`
  row in `src/data/skillPower.ts` (Bar the Door has one, read by its rite).
  Gate: `RANK_ONLY=a,b node tools/check-rankpower.mjs` must say "all grow".
- Rites that fly (Hurl the Censer) land on a timer, not on the projectile's
  `onHit`: the headless checks run with a dummy effect system.
- Gestures (M5): `src/art/hero/gestures/paladin.ts`. Shield skills carry
  `alt.great` keys for a two-hander. Sheets: `node tools/hero-sheet.mjs
  actions --class=paladin --front --stance=shield|twoHand --weapon=mace|sword
  --actions=skill.<id>,...` (under the browser lock).
- `tools/rankpower-entry.ts` hands a Blade skill a short sword
  (`TREE_WEAPON`), since the Paladin starts with a mace. `check-skills`
  (M8) will need the same for Blade skills.
- Where the class lives: `src/data/classSkills/{kit,paladin,paladinClass,paladinStatuses}.ts`,
  `src/scenes/paladin/Rites.ts` (effect family `rite`, single target, hooked
  by one `case 'rite'` in `SkillRunner.cast`), `src/audio/PaladinSounds.ts`,
  `tools/audio/paladinTakes.mjs`. Everything else is a one-line hook.
- Grips: a Mace rite needs a mace or scepter, a Blade rite a sword, a shield
  rite a shield (`riteRefusal`, checked before mana). Scepters swing as melee
  for the Paladin (`weaponStyle`). A rite with a `range` param is not chased
  by `needsReach` in Controls.
- Gestures (M5) all at once: `check-unique` keeps a class "pending" for clips
  until its first gesture exists, and for visuals until its first
  `SKILL_MOTIFS` row exists. Sounds are never pending: every active skill
  needs its own `SKILL_SOUNDS` row and take from the day it is written.
- Audio: sources merged under `/tmp/slay-downloads/paladin/audio` (symlinks to
  `/tmp/slay-downloads/audio/*` and `/tmp/slay-downloads/fix-uisound/oga/*`).
  Build: `SLAY_AUDIO_SRC=/tmp/slay-downloads/paladin/audio timeout 600 node tools/build-audio.mjs --only=skill.pal.`
  The build rewrites ASSETS.md for every sound it knows; keep only the
  `| sounds/skill.pal.` rows (save them, restore ASSETS.md to the committed
  copy, put them back).
- Baseline before this stream: `curve` failed 2 cases (shadowblade d12,
  ranger d12) and `unique` failed (anims stream mid-work). Not ours.
- `skilldepth` passes for Paladin since M4: Mace 14 links into 9 skills,
  Blade 14 into 10, Aura 9 into 3, and 22 skills combo for Verdict.
- `curve`: Paladin passes at every depth (1, 5, 12, 25, 40) with all three
  trees. On the branch tip after the shapeshifter's commits, mage fails at
  depth 1, 5 and 12 too (not touched by this stream; Paladin code runs only
  for the `rite` and `vigil` families).
- Motifs (M6) live in `src/fx/paladin/motifs.ts`, spread into
  `SKILL_MOTIFS` by one line. A rite or a censure sets `landAt` on its cast
  so the motif lands on the enemy it found, not on the cursor.
- `check-skills` audits the Paladin in two kits (shield+mace for Mace and
  Aura, shield+sword for Blade, see `KITS`), logging a line per skill.
- `debug.equip` drops what the hands held when the backpack is full
  (makeCharacter fills it with rolls it cannot wear), so a checker's hero
  really holds the weapon it asked for.

## Design (planned skills, by tree and tier)

Mace: T1 tollingBlow (A), hallowedIron (P), shieldCrack (A shield bash, rung);
T2 anvilfall (A dents), forgedFaith (P), doorbreaker (A shield charge);
T3 knell (A blow then echo), crushingWeight (P vs staggered/dented), bellguard (P block);
T4 pilgrimsMaul (A eats dents), ironPenance (P dents on hit), barTheDoor (A brace);
T5 hurlCenser (A thrown, ranged), weightOfStone (P), relicBash (A shield, heals per dent);
T6 theLastBell (capstone P), ironVerdict (A), unbroken (P).

Blade: T1 oathCut (A opened bleed), bladeCatechism (P), turnTheBlade (A parry);
T2 twinVerse (A), redPsalm (P vs bleeding), feint (A sidestep, exposed);
T3 litany (A flurry), measuredStep (P), answerInSteel (P block counter);
T4 confessionThrust (A eats bleed), whettedFaith (P), crosswise (A);
T5 mercyStroke (A execute), theFifthVerse (P), sevenfold (A);
T6 redRosary (capstone P), lastRites (A step behind), saintsReach (P).

Aura (family `vigil`, one aura at a time, ring at feet): T1 tallowLight (aura regen), liturgy (P), ironVigil (aura defense);
T2 censure (A curse), smoulderingRood (aura fire), anoint (A self buff);
T3 censerSmoke (aura enemy AR/speed down), wideWick (P radius), fervour (aura speed);
T4 tollingBell (aura periodic ring), penitentGround (P), martyrsVow (A absorb);
T5 writOfAsh (aura resist shred), vespers (P), consecratedGround (aura slow);
T6 twinWick (capstone P two auras), lastHour (A falling bell), emberSaint (P).
