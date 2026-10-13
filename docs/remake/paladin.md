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

- [ ] M1 Class def, look (male), field kit, portrait, select screen words; selectable and playable with a starter skill.
- [ ] M2 Mace tree: 18 skills, rules, statuses, icons.
- [ ] M3 Blade tree: 18 skills, rules, statuses, icons.
- [ ] M4 Aura tree: 18 skills, aura handler + look, rules, icons.
- [ ] M5 A unique gesture per active skill (sword+shield, mace+shield, two-hander all read).
- [ ] M6 A unique VFX look per active skill.
- [ ] M7 A unique sound per active skill (CC0, layered takes).
- [ ] M8 Story and NPC lines, tools class lists, balance (curve passes every depth), in-game skill check green.

## Next up

Start at M1.

## Notes for resume

(none yet)
