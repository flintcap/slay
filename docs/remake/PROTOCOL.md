# Remake protocol

Every agent follows this exactly. It is what lets the work be stopped at any
moment (the owner's usage runs out, the owner says pause, the machine
restarts) and picked up later with almost nothing lost.

## Branch

One branch: `claude/dungeon-rpg-roguelike-cfxxez`. Every checkpoint is pushed
to it. Never push anywhere else. Never force push. No pull requests.

## Setup (start of every session, including resumes)

```bash
# You are in your own git worktree.
[ -e node_modules ] || ln -s /home/user/slay/node_modules node_modules
[ -e /home/user/slay/node_modules/.bin/tsc ] || (cd /home/user/slay && npm install --no-audit --no-fund)
git fetch origin claude/dungeon-rpg-roguelike-cfxxez
git rebase origin/claude/dungeon-rpg-roguelike-cfxxez   # pick up everyone else's checkpoints
```

Then read `docs/remake/PLAN.md`, `CONTRACTS.md` and your own
`docs/remake/<stream>.md`. Set `Status: in progress`. Continue from the first
unticked milestone and the "Next up" list.

If your worktree has uncommitted changes or unpushed commits from an earlier
session, that is your own unfinished work: keep it, finish it, push it.

## Saving work (this is what survives a sudden stop)

- **Commit locally at least every 20 minutes** while working, even mid-task
  (`git commit -m "wip(<stream>): ..."`). Local commits survive an agent being
  killed.
- **Push a checkpoint at least every 60 minutes**, and after every milestone.
  Pushed work survives the machine restarting.
- Unfinished work may be pushed only if the game still builds, typecheck is
  clean and the unfinished part is not switched on yet.
- Keep "Next up" in your progress file current every time you push, so a
  fresh agent with no memory knows the exact next step.

## A checkpoint

1. `npx tsc --noEmit -p tsconfig.json` is clean.
2. `npm run build` succeeds.
3. Your stream's checkers pass (see your progress file).
4. Update `docs/remake/<stream>.md`:
   - tick finished milestones and write the commit subject next to each
   - rewrite "Next up" so a fresh agent with no memory can continue
   - put anything a successor must know under "Notes for resume"
5. Commit. The message ends with:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01WnRa5k5RGUBGbED9j1hSn2
   ```
   Never put a model name anywhere else.
6. Publish:
   ```bash
   git fetch origin claude/dungeon-rpg-roguelike-cfxxez
   git rebase origin/claude/dungeon-rpg-roguelike-cfxxez
   npx tsc --noEmit -p tsconfig.json          # still clean after the rebase
   git push origin HEAD:claude/dungeon-rpg-roguelike-cfxxez
   ```
   Rejected because someone pushed first: fetch, rebase, push again. Network
   error: retry after 2s, 4s, 8s, 16s. On a rebase conflict keep both sides'
   intent. Never drop another stream's work.

## Remake rule

For each thing you replace: build new in new files, switch at one place,
check with renders and checkers, then **delete the old code and every
reference to it**. A milestone is not ticked while its old code still exists.
Before ticking, grep for the old names and show zero hits in the commit
message (for example "grep BodyKit: 0").

## Assets

Follow "Art and sound files" in `PLAN.md`. In short: CC0 only, every file in
`ASSETS.md`, WebP and OGG, inside the budgets, downloads stay in
`/tmp/slay-downloads/<stream>/`, never run anything from a download, and the
game must never fail when a file is missing.

## Rendering

```bash
npm run build
SLAY_PORT=<your port> timeout 2700 node tools/screenshot.mjs --out=shots/<stream> --shots=town,dungeon
```

Ports are in `PLAN.md`. Look at the PNGs yourself with the Read tool and judge
them against the quality bar. `shots/` is not committed.

## Testing limits (hard rules)

- **Never run a server as a background task and wait on it.** It never
  exits, so nothing wakes you. Render with one command that starts and stops
  its own server.
- **One render or browser check: 45 minutes at most, wrapped in `timeout`.**
  If it times out, do not just rerun it. Make it smaller (fewer shots, one
  biome, one class) or check headlessly instead.
- **The same check may fail at most twice for the same reason.** After the
  second failure, write what you know in "Notes for resume", checkpoint, and
  move on.
- **No milestone may go 90 minutes without a pushed checkpoint.** Stuck?
  Push what works, note the blocker, move on.
- **Leave nothing running.** Before you end, no server, browser or checker
  you started may still be alive. Kill by PID, never `pkill -f`.

## Wave 3 testing rules (owner, these override anything looser above)

- **Tests stay minimal**, but their result must be readable: print a short
  pass/fail summary you can quote.
- **Anything longer than 7 minutes must be shown not stuck.** Run long
  checks with output to a log file, and look at it: if the log has not grown
  for 7 minutes, the run is stuck. Kill it by PID and count it as a failure.
- **One retry, then skip.** A check that fails (or gets stuck) is retried
  once. If it fails again, skip it, write it under "Notes for resume" with
  the reason, and move on.
- **Browser runs share one lock**: wrap every browser run in
  `flock /tmp/slay-browser.lock timeout <secs> ...`.

## Lean testing (owner's rule: testing must not burn usage)

Testing costs the owner's usage. Spend it only where it buys certainty.

- **Cheapest check first.** Read the code and reason. Then typecheck. Then
  the one headless checker for the system you touched
  (`node tools/run-checks.mjs --only=<name>`). A browser run is the last
  resort, only for things a headless check cannot see (looks, motion, real
  frame times).
- **Batch, then verify once.** Make all the fixes for a milestone, then run
  one browser check for the lot. Never one browser run per fix.
- **Smallest run that answers the question.** One scene, one biome, one
  class, few shots, small frames. Never the whole tour or full soak to check
  one change. Full sweeps happen once, at handover, if at all.
- **No repeat runs.** Do not rerun a passing check "to be sure". Do not
  rerun the full checker sweep; run only the checkers your change can break.
- **Before and after only at the ends.** Take "before" numbers or renders
  once at the start of a milestone and "after" once at the end, not around
  every edit.
- **Read output small.** Pipe checker and browser output through `tail` or
  `grep` for the summary lines. Never dump whole logs or JSON into context.
- **Look at images sparingly.** Look at each render once. Prefer one contact
  sheet (`convert`/`montage` several PNGs into one small image) over many
  separate image reads. Never reread an image you already judged.
- **Read files in parts.** Search first, then read only the lines you need.
  Do not reread a file you already read unless it changed.
- **One browser at a time on the whole machine.** The machine has 4 cores
  and every browser run renders in software. Two at once make both several
  times slower. Wrap every browser run in the shared lock, so runs queue
  instead of fighting:
  `flock /tmp/slay-browser.lock timeout 2700 node tools/<tool>.mjs ...`
  Never start a second browser run of your own while one is going.
- **No helper agents.** Do not spawn sub-agents.
- **Good enough wins.** When a check passes the quality bar, stop and move
  on. Do not keep polishing to shave the last bit.

## Wave 4 rules (owner, these override anything looser above)

- **Save points.** Usage can run out at any moment. Commit locally at
  least every 15 minutes (`wip(<stream>): ...`), push a checkpoint at least
  every 45 minutes and after every milestone, and keep "Next up" in your
  progress file exact every time you push, so a fresh agent can continue
  right where you stopped.
- **Verify the code, never guess.** Read the code you change and the code
  that calls it. Check every claim against the source before writing it
  down or acting on it. Never assume a function, field or file does what
  its name says.
- **Minimal testing.** Typecheck always. Beyond that, test only what
  absolutely needs a test, with the one cheapest check that can answer it.
- **One retry, then move on.** A check that fails is run once more. If it
  fails again, write it under "Notes for resume" with the reason and move
  on. Never loop on a failing check.
- **Leave testing to the owner when you cannot test.** If something cannot
  be tested here (real GPU frame rate, how it feels, real load time on a
  real machine), do not burn usage trying. Make sure the code is correct by
  reading it, then add a line to "For the owner to test" in your progress
  file: what to try and what should happen.

## Wave 5 rules (owner, these override anything looser above)

Everything in "Wave 4 rules" still holds. On top of it:

- **Work from exactly what the code says.** Not from old notes, not from
  other progress files, not from memory. Before you write down how a skill,
  a speed or an item line works, read the code that does it. Old notes may
  be stale; the code is the truth.
- **A failed test is retried once, then you move on and note it.** Write
  the check, the reason and what you think is wrong under "Notes for
  resume" and "For skillqa". Never a third run of the same check.
- **Minimal testing: only what is critical.** Typecheck always. Then only
  the cheapest check that can answer a real question. Never a check "to be
  sure". Browser runs only for what nothing headless can see, batched once
  per milestone.
- **Newest Chrome.** Run `node tools/get-chrome.mjs` once before your first
  browser check.
- **One browser at a time on the machine.** Every browser run is wrapped in
  `flock /tmp/slay-browser.lock timeout <secs> ...`.
- **No helper agents.** Do not spawn sub-agents.
- **Our own game.** Diablo II and Path of Exile are a speed and feel
  reference only. Match how fast things feel, in our own numbers. Never
  copy their names, items, skills or art.
- **Owner rules that bind every skill:** every skill gets stronger with each
  rank (damage, strength, time, size), not only cheaper or faster, through
  `src/data/skillPower.ts` (`shifterPower.ts` for the shapeshifter) and
  `node tools/check-rankpower.mjs`. Caster weapons (wands, staffs, orbs)
  have no basic attack. Every class uses mana; no new resources. Mouse and
  keyboard only. Never make monsters weaker or fewer.
- **Damage per hit never changes because of speed (owner).** Slowing a
  swing or a cast does not raise its damage, and speeding one up does not
  lower it. If a class ends up walled, write the numbers down for the
  owner; never raise damage to make up for it, never touch monsters.
- **No frame rate cost.** No allocation in per-frame code you touch. Every
  new effect pipeline gets a stand-in in `warmup()` so nothing compiles on
  first cast. Particle counts follow the quality ladder.

## Pause

The owner pauses by saying so. Claude sends every running agent a message
starting with **PAUSE**. On receiving it:

1. Stop starting new work.
2. Bring what you have to a safe state: game builds, typecheck clean, nothing
   half-wired is switched on.
3. Update your progress file: `Status: paused`, tick anything finished,
   rewrite "Next up" precisely.
4. Commit, rebase and push as in "A checkpoint".
5. Reply with one line: the commit you stopped at and what is next. Then end.

## Sudden stop (usage ran out, machine restarted)

There is no warning, so nothing special happens at the moment of the stop.
What makes it safe is the "Saving work" rules above. On restart Claude:

1. Saves any uncommitted diff in each agent worktree as a patch in the
   scratchpad (`git -C <worktree> diff HEAD > wip-<stream>.patch`) and notes
   any unpushed commits.
2. Relaunches each stream that was running, telling it where its patch or
   unpushed commits are. The agent applies them with `git apply --3way`
   (or cherry-picks the commits) before continuing.

## Resume

When the owner says resume, Claude reads `docs/remake/QUEUE.md` and launches
up to three streams whose progress files still have unticked milestones,
streams that were running first, then the queue in order.

## Finishing a stream

When every milestone is ticked: set `Status: done`, write a short "Handover"
section (what exists now, where it lives, what is left for `finish`), push,
and reply with one line.
