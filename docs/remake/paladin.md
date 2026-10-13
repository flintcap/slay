# Stream: paladin

Status: in progress
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
- [ ] M5 A unique gesture per active skill (sword+shield, mace+shield, two-hander all read).
- [ ] M6 A unique VFX look per active skill.
- [ ] M7 A unique sound per active skill (CC0, layered takes).
- [ ] M8 Story and NPC lines, tools class lists, balance (curve passes every depth), in-game skill check green.

## Next up

M5 gestures, all 32 actives at once (check-unique keeps the class
"pending" until the first gesture exists, then wants every one). Each needs
its own clip in the anims stream's gesture system (`src/art/hero/gestures`,
`skillAction(id)`), and it must read with sword+shield, mace+shield and a
two-hander. Rites already call `skillAction(id) ?? rite.clip`, and vigils
`skillAction(id) ?? act.clip / 'cast'`, so a gesture row is all a skill
needs. Gate: typecheck, `node tools/check-unique.mjs` clips ok for paladin.

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
- Shield skills use the `lunge` body clip until M5 gives them gestures.
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
- `skilldepth` fails for Paladin until the trees have synergies and a second
  combo-able skill (M2 to M4). Paladin passes `curve` at every depth with
  only Tolling Blow.

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
