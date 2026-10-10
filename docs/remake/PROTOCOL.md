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
