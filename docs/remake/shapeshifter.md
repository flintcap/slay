# Stream: shapeshifter

Status: waiting
Port: SLAY_PORT=4343

## The owner's brief

Shapeshifter (male). Three trees:
- **Feral**: a big-cat form (panther / feline). Speed and agility skills,
  single-target melee.
- **Teeth**: a wolf form. Attack and buff skills, single-target melee.
- **Claw**: a bear form. Tank skills, cleave melee.

Transforms keep a humanoid figure and shape (a were-creature standing on two
legs, not a four-legged animal). Every skill, gesture, effect and sound is
new and unique. Dark, gritty, primal: fur, bone charms, blood, wet earth,
snapping sinew. Not sci-fi.

Follow `docs/remake/new-class.md` for every place a class touches.

Design notes
- Class id `shapeshifter`.
- A transform is a skill (one per tree) that turns the hero into that form
  until cancelled or they change form. Form skills of a tree can only be used
  in that form, or cast into the form automatically (pick the one that plays
  best and say why in the progress file). Show it clearly on the hotbar.
- The forms are built in code like everything else (see `src/art/hero/`):
  the same rig, so every animation system still works, with a re-shaped
  body: cat (lean, long limbs, tail, low stance, crouched run), wolf (muzzle,
  ears, digitigrade feel, hunched), bear (huge shoulders, heavy gut, short
  thick limbs, upright tank). Fur, claws, eyes that catch light. A transform
  plays a short change effect (body swells / sheds, a burst of hair and
  breath), hides worn gear that would not fit and keeps stats from gear.
  Each form needs its own idle, walk/run, and attack chain feel, plus a
  unique gesture per active skill.
- Human form: pick a weapon set that fits (for example clubs, axes, staves);
  write it in the class def.

## Milestones

- [ ] M1 Class def, look (male), field kit, portrait, select screen words; selectable and playable with a starter skill.
- [ ] M2 Form system: transform skill family, three humanoid forms built in code, change effect, gear hiding, hotbar rule.
- [ ] M3 Feral tree: 18 skills, rules, statuses, icons.
- [ ] M4 Teeth tree: 18 skills, rules, statuses, icons.
- [ ] M5 Claw tree: 18 skills, rules, statuses, icons.
- [ ] M6 Form motion (idle, move, attack chain per form) and a unique gesture per active skill.
- [ ] M7 A unique VFX look and a unique sound per active skill (CC0, layered takes).
- [ ] M8 Story and NPC lines, tools class lists, balance (curve passes every depth), in-game skill check green.

## Next up

Start at M1.

## Notes for resume

(none yet)
