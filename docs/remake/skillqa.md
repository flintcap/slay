# Stream: skillqa (Wave 5: quality pass over every class's skills)

Status: waiting

Goal (owner): after skillcore and all seven class streams are done, send
everything through quality checks: AAA quality, every skill working, and
frame rate not reduced (faster where it can be). Fix what falls short
before the wave is called finished. You may edit any file for a fix; you do
not redesign kits.

**Owner: fix every issue, do not just list it.** Every item under "Known
issues" below and every item in each stream's "For skillqa" is yours to
fix before the wave is done. Only two kinds of item stay with the owner:
numbers listed under "For the owner to test" that are a matter of taste,
and heroes walled by the slower speeds (the owner decides that after the
wave; never raise damage to make up for speed, never touch monsters). If a
fix truly cannot be made, write why in "Notes for resume" and in the
handover, one line each.

Runs alone, last. Port 4359. Start only when `skillcore.md` and every
`sk-*.md` say `Status: done`. Read each one's "For skillqa" and "For the
owner to test" first.

Checkers: `node tools/run-checks.mjs` (the fast static set, once at the
start and once at the end). Browser, one at a time, wrapped in
`flock /tmp/slay-browser.lock timeout`: `check-skills` (all seven classes,
in two or three runs), `check-perf`, `check-frames`, and one small contact
sheet per class only where a "For skillqa" note asks for a look. Run
`node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [ ] 1. Before numbers. Take `check-perf` frame numbers once before any
  fix (or use the last numbers in `CHECKPOINT.md` if they are from the same
  scene and settings; say which). Run the static checkers once and list
  every failure.
- [ ] 2. Working. `check-skills` for all seven classes. Every skill fires,
  hits, costs mana, and grows each rank. Read the code behind each failure
  before fixing it.
- [ ] 3. Speed. Spot check, from the code, that every class's basic attack
  and skill times follow skillcore's model (no stray hard-coded seconds,
  nothing faster than the ceiling, caster weapons have no basic attack).
- [ ] 4. Quality. Work through every "For skillqa" note. Icons: unique per
  skill, sharp, class colors (`check-iconmatch`). Melee: own swing per
  skill. Ranged and spells: own projectile and effect. Fix what is below a
  AAA bar.
- [ ] 5. Frame rate. Every new effect has a `warmup()` stand-in; no
  allocation in per-frame code; particle counts follow the quality ladder.
  After numbers from `check-perf` and `check-frames`, same scene and
  settings as before. Frame rate must not drop; make it faster where you
  can (merge draws, reuse buffers, cut overdraw).
- [ ] 6. Handover. List what was fixed, the before and after frame numbers,
  and "For the owner to test" (one line per class: what to try and what
  should happen). Set `Status: done`, push.

## Known issues (lead, from the reports so far; add each stream's as it lands)

Shared code:
- The shared area-effect code puts a blank buff on the caster.
- Area damage falls to 65% at the edge and no tooltip says so. Say it, or
  drop the falloff.
- Spells and throws that still resolve on the key press instead of on the
  gesture's release (`SkillRunner.atRelease`). sk-mage moved the Mage's;
  find every other class's that remain.
- Dodging after the key press and before a spell lets go still spends the
  mana. Charge on release, or give it back when the cast is cancelled.
- Skill passives, buffs, boons and statuses that give speed were not
  retuned by skillcore. Check every one fits under the ceilings in
  `sim/Speed.ts`.
- `check-curve` logs "[feel] hit report failed TypeError: Cannot convert
  object to primitive value" from `CombatFeel.onKill` about 1500 times a
  run. Find the cause and fix it.
- The curve bot dodges mid-swing, which cancels heavy blows. Make the bot
  fair (it is a test tool) so the curve reads true.
- `check-economy` fails once on a seeded path ("shapeshifter: no set or
  unique in a whole descent at depth 30"). Drop rates are unchanged. Find
  out whether it is the seed or a real gap and fix the right one.
- Skill icons now bake in idle time 3 s after the town loads; never tested
  in a browser. Check the skill board opens with no stall.
- `check-skills` exits 1 when there is no `shots/` folder; make it create
  it. One class takes about 40 minutes; make it faster if you can without
  testing less.
- `check-skillparams` failed on phalanx, vanish, momentum and perfectForm
  (before sk-knight and sk-rogue finished). Rerun once after them.

Mage (sk-mage, done):
- Dragon's Breath has no fire blast of its own; Winter's Breath has no
  crystal fan.
- Frozen Orb looks like a shard, not a round orb.
- The fire tree's icons need a deeper repaint.
- Pyre Brand has no hit sound.
- Splintering Frost may be too weak (20% of the dead enemy's life, +1% a
  rank). Compare it with skills in the same tier and make it worth taking.
- Spell looks in motion and real frame time were not checked.

Rogue (sk-rogue, done):
- The new swings and looks were never seen in a running game, and frame
  time was never measured. Nightfall's smoke curtain is the costliest
  (about 60 smoke sprites at High per cast): check it against the quality
  ladder.
- Seven Shadowcraft icons all show a hooded figure, and Silhouette is
  close to The Unseen Blade. Make each one clearly its own.
- `check-skillcost` never ran (it was stopped). Run it once.
- `check-unfinished` flags two statuses, `static` and `rent`, that no code
  applies (older than this wave). Wire them or remove them.

Knight (sk-knight, done):
- Gatefall was refused in `check-skills` only because the audit keeps
  statuses between skills (Fortress Stance still had the Knight rooted).
  Clear statuses between skills in the audit (`scenes/debug.ts`) and
  check Gatefall fires.
- Never seen in motion: every new Knight gesture, the Whirlwind walk, the
  Shield Charge run, the Gatefall arc and landing, Massacre's five cuts,
  the standard, the steel arcs, Sworn Brother's ghost look.
- Retribution's stored charge shows only as gold glints at the shield.
  Give it a clear look that reads at a glance.
- Frame time not measured. Watch the standard (three see-through lit
  materials that cast shadows) and Earthshatter (a crack decal and two
  bursts every metre of its 12 m line).
- sk-knight changed `tools/skillsound-entry.ts` and
  `tools/rankpower-entry.ts`; check the changes are sound.

## Next up

Wait for skillcore and the seven class streams. Then start milestone 1.

## Notes for resume

(empty)

## For the owner to test

(empty)

## Handover

(empty)
