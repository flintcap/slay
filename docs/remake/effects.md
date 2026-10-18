# Stream: effects (Wave 4: skills, hits and deaths)

Status: not started

Goal: every skill, hit and death looks and feels strong and readable, in a
dark and gritty style: embers, blood, frost, smoke, sparks. Never
cartoonish. Each skill keeps its own look; our own designs, not 1:1 copies of
another game. Effects grow with skill rank where the skill does (bigger,
denser), never only recoloured. WebGPU compute particles where it helps.
Particle counts scale with the quality ladder.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch
(`check-skills` is a browser check, one at a time). Renders: at most one
small contact sheet per milestone, inside `flock /tmp/slay-browser.lock
timeout`. Run `node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [ ] 1. Audit (read the code first, render only if needed): list every
  skill look, hit effect and death effect per class; rank the weakest under
  "Notes for resume".
- [ ] 2. Hits: impact flash, sparks or splashes per damage type (physical,
  fire, cold, lightning, poison, holy, shadow), short hit decals, crits that
  read at a glance.
- [ ] 3. Skills: upgrade the weakest skill looks class by class, starting
  with the worst ten from the audit.
- [ ] 4. Deaths: per damage type (burn to ash, shatter when frozen, blood
  burst, dissolve to shadow), per monster size.
- [ ] 5. Warm-up: stand-ins in `warmup()` for late effect pipelines
  (`fx:solid-shard`, `fx:cores`, `fx:columns` from speed's notes) and for
  every new effect, so nothing compiles mid-fight.
- [ ] 6. Cost: a particle budget per quality level; no per-frame
  allocation in the code you touch.
- [ ] 7. Handover.

## Next up

1. Do Setup in PROTOCOL.md. Set `Status: in progress`.
2. Milestone 1: read `src/fx/SkillLooks.ts`, `src/fx/Effects.ts`,
   `src/fx/CombatFeel.ts`, `src/fx/HitFlash.ts`, `src/fx/kit/*` and list
   what each skill and hit shows today.

## Notes for resume

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
