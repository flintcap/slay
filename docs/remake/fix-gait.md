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

- [x] Tune: cadence and stride, pelvis height and bob, knee bend, lean, arm
  swing and shoulder twist (src/art/hero/Gait.ts, Animator.ts, Stances.ts).
  Check with the headless sim and `check-hero` first.
  (wip(fix-gait): quicker shorter run, grounded hips, feet stay under the
  body in reversals; check-hero PASS)
- [ ] One browser check: `shoot-gait.mjs` side and camera strips for two
  classes, walk and run, plus one side-to-side reversal strip (add a
  `--zigzag` option if needed). Fix what reads wrong, one more batch at most.
- [ ] Handover: before and after strips listed, check-hero PASS.

## Next up

- Milestone 2: one browser run, `npm run build` then
  `SLAY_PORT=4335 flock /tmp/slay-browser.lock timeout 2700 node tools/shoot-gait.mjs --out=shots/fix-gait --classes=warden,ranger --speeds=walk,run,zig --n=12`
  (`zig` is new: the run key flips at a quarter and three quarters of the
  strip). Look at one contact sheet of the strips, fix what reads wrong.

## Notes for resume

- Headless numbers (sim of Gait.ts plus the Animator's pelvis maths, hero
  1.8 m, leg 0.85 m). Before -> after:
  - run 4.6 m/s: 2.22 -> 2.64 Hz, 2.07 -> 1.74 m a cycle, feet fore-aft
    79 -> 68 cm, leg spread 69 -> 50 deg, airborne 37% -> 28%, stance knee
    20-52 -> 29-60 deg, hips 86-91 -> 86-88 cm (bob 5 -> 3 cm).
  - side to side reversals: feet apart sideways 34 -> 17 cm, feet crossed
    21 -> 0 cm, sideways leg splay 31 -> 11 deg.
  - walk 1.84 m/s: 1.38 -> 1.48 Hz, knee never straighter than 19 deg (was 4).
- What changed: cadence quickens with run speed (speed from the beat, cap
  3.3 Hz), run duty 0.36, swing leaves fast and tucks under the hip, swing
  lift 0.44 leg; foot aims follow the body's braking (reversals); a snap turn
  latches (feet swivel to the end of the turn, ride sideways with the body,
  no yaw guess); a planted foot left wide or behind lifts early and rolls onto
  its toes; stopping waits 0.12 s of near-zero speed (a reversal no longer
  stops and restarts the gait). Animator: hips 0.04-0.06 leg lower, bob and
  roll smaller, lean 0.24 at a run, arm swing tighter.

- Looks only. Never change move speed or any gameplay number.
- Lean testing and the browser lock in PROTOCOL.md are hard rules.
