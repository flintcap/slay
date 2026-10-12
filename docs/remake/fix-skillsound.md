# Stream: fix-skillsound (one sound per skill, sounding like the skill)

Status: in progress

Owner's words: "im hearing different sounds for the same skill. skills need
one sound that sounds how the skill should sound. a blink should be a quick
air sound".

## Milestones

- [ ] Survey: for every skill in the game (all classes, all trees), list
  which sound ids it plays on cast, in flight and on impact, and why the same
  skill can play different sounds (random pick from a pool of variants,
  shared generic ids picked by element or tag, modifiers or gems swapping the
  id, buff/shout fallbacks). Write the table below.
- [ ] One identity per skill: each skill always plays the same recording
  (small pitch and volume jitter is fine, a different recording is not). Give
  each skill an explicit sound in its data or one mapping table, not a pick
  from a pool. Skills that share a sound must be skills that really should
  sound alike.
- [ ] Each sound fits what the skill is. Blink and other teleports: one
  quick, short air whoosh (under 0.4 s), no thump, no drone. Dashes and
  leaps: a fast cloth and air rush. Melee strikes: steel. Fire: roar or
  whoomp. Cold: crack. Lightning: snap. Poison: hiss. Arcane: low whoosh,
  never a chime. Summons: bone and earth. Shouts: voice. Re-use the CC0
  files already in the game where they fit; new files follow the CC0 rules
  and go in ASSETS.md. Loudness matched to the skill bus.
- [ ] Check: typecheck, `check-assets`, `check-audio`. Add a headless check
  (or extend one) that every skill resolves to exactly one sound id per
  stage. Handover with the skill to sound table.

## Survey

(fill in)

## Next up

Survey.

## Notes for resume

- fix-uisound (done) already removed chimes and synths; read its handover
  in `docs/remake/fix-uisound.md` first.
- Lean testing rules in PROTOCOL.md apply. No browser runs needed for this;
  check with headless tools and ffprobe.
