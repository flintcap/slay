# Stream: skillqa (Wave 5: quality pass over every class's skills)

Status: waiting

Goal (owner): after skillcore and all seven class streams are done, send
everything through quality checks: AAA quality, every skill working, and
frame rate not reduced (faster where it can be). Fix what falls short
before the wave is called finished. You may edit any file for a fix; you do
not redesign kits.

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

## Next up

Wait for skillcore and the seven class streams. Then start milestone 1.

## Notes for resume

(empty)

## For the owner to test

(empty)

## Handover

(empty)
