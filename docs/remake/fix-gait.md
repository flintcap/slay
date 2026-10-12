# Stream: fix-gait (hero walk and run in the style of Path of Exile)

Status: in progress

Owner's words: "copy the gait from path of exile". Earlier: "legs are doing
splits as you move side to side and should stay under you", "legs too spread
out, not natural or as fluid as Diablo or Path of Exile".

We cannot copy PoE's files. Match its feel by eye, built in code.

What a PoE hero's locomotion looks like:
- Grounded and heavy: knees always a little bent, pelvis low and level,
  small vertical bob. Never straight-legged, never bouncy.
- Short, quick, purposeful steps. Feet land under the hips, not reaching out
  in front. The stride is compact; speed comes from cadence.
- Narrow track: feet nearly on one line, never wide apart, never crossing.
- Torso leans into the run a little, shoulders counter-rotate the hips, arms
  swing low and tight (weapon arms held, not flailing).
- Turns are instant: the whole body, legs included, snaps to the new heading
  with no foot planted behind (commit 57213c5 already swivels the feet on
  snap turns; keep that).
- Walk blends to run with no snap; stopping settles in one or two steps.

## Milestones

- [ ] Tune: cadence and stride, pelvis height and bob, knee bend, lean, arm
  swing and shoulder twist (src/art/hero/Gait.ts, Animator.ts, Stances.ts).
  Check with the headless sim and `check-hero` first.
- [ ] One browser check: `shoot-gait.mjs` side and camera strips for two
  classes, walk and run, plus one side-to-side reversal strip (add a
  `--zigzag` option if needed). Fix what reads wrong, one more batch at most.
- [ ] Handover: before and after strips listed, check-hero PASS.

## Notes for resume

- Looks only. Never change move speed or any gameplay number.
- Lean testing and the browser lock in PROTOCOL.md are hard rules.
