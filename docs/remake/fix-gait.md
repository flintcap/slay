# Stream: fix-gait (hero walk and run in the style of Path of Exile)

Status: done

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
- [x] One browser check: `shoot-gait.mjs` side and camera strips for two
  classes, walk and run, plus one side-to-side reversal strip (add a
  `--zigzag` option if needed). Fix what reads wrong, one more batch at most.
  (`--speeds=zig` added. Read wrong: the run swing threw the knee up high,
  a prance. Fixed in wip(fix-gait): lower run swing (no high-knee prance).)
- [x] Handover: before and after strips listed, check-hero PASS.

## Handover

What exists now:
- `src/art/hero/Gait.ts`: quicker, shorter run steps (2.6 Hz at the base
  4.6 m/s, cadence keeps rising with move speed up to 3.3 Hz, like PoE
  speeding its run up), feet down 36% of the beat, swing leaves fast and
  tucks under the hip at 0.34 leg high. Reversals: snap turns latch so the
  feet swivel to the end of the turn and ride sideways with the body; foot
  aims follow the body's braking; feet left wide or behind lift early and
  roll onto their toes; a reversal no longer stops and restarts the gait.
- `src/art/hero/Animator.ts`: hips lower and nearly level, smaller bob, roll
  and sway, a little less lean, tighter arm swing.
- `tools/shoot-gait.mjs --speeds=zig`: a side-to-side reversal strip.

Strips (not committed, `shots/` is ignored), all from this stream's build:
- `shots/fix-gait/gait-{warden,ranger}-{walk,run,zig}-{side,camera}.png`
  (before the last fix: the high-knee run).
- `shots/fix-gait/gait-{warden,ranger}-run-side-b2.png` (after).
- No before strips from the old code (the two-run browser budget went on
  after and fix). The "before" is the headless numbers below.

check-hero: PASS (slide, drift and float 0.0 mm for every class).

Left for later: the brief crouch in a reversal (both feet down, knees out
for a frame or two) reads fine but could be softened; the camera view is
small at 31 px, so judge the gait from the side strips.

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
  lift 0.34 leg; foot aims follow the body's braking (reversals); a snap turn
  latches (feet swivel to the end of the turn, ride sideways with the body,
  no yaw guess); a planted foot left wide or behind lifts early and rolls onto
  its toes; stopping waits 0.12 s of near-zero speed (a reversal no longer
  stops and restarts the gait). Animator: hips 0.04-0.06 leg lower, bob and
  roll smaller, lean 0.24 at a run, arm swing tighter.

- Looks only. Never change move speed or any gameplay number.
- Lean testing and the browser lock in PROTOCOL.md are hard rules.
