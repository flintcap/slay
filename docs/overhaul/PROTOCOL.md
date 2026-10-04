# Checkpoint protocol

Every agent follows this exactly. It is what makes the work survive being
stopped mid-task.

## Branch

There is one branch: `claude/dungeon-rpg-roguelike-cfxxez`. Every checkpoint is
pushed to it. Never push anywhere else. Never force push.

## Setup (start of every session, including resumes)

```bash
# You are in your own git worktree.
[ -e node_modules ] || ln -s /home/user/slay/node_modules node_modules
git fetch origin claude/dungeon-rpg-roguelike-cfxxez
git rebase origin/claude/dungeon-rpg-roguelike-cfxxez   # pick up everyone else's checkpoints
```

Then read `docs/overhaul/PLAN.md` and your own `docs/overhaul/<stream>.md`.
Continue from the first unticked milestone and the "Next up" line.

## A checkpoint

Do one after every milestone, and also any time you have more than about
45 minutes of unsaved work.

1. `npx tsc --noEmit -p tsconfig.json` is clean.
2. The checkers in your area pass.
3. Update `docs/overhaul/<stream>.md`:
   - tick the milestone and write the commit subject next to it
   - rewrite "Next up" so a fresh agent with no memory knows exactly what to do
   - add anything a successor must know to "Notes for resume"
4. Commit with a clear message ending in:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01WnRa5k5RGUBGbED9j1hSn2
   ```
5. Publish it:
   ```bash
   git fetch origin claude/dungeon-rpg-roguelike-cfxxez
   git rebase origin/claude/dungeon-rpg-roguelike-cfxxez
   npx tsc --noEmit -p tsconfig.json          # still clean after the rebase
   git push origin HEAD:claude/dungeon-rpg-roguelike-cfxxez
   ```
   If the push is rejected because someone else pushed first, fetch, rebase and
   push again. On a network error retry with backoff (2s, 4s, 8s, 16s).
   Resolve rebase conflicts by keeping both sides' intent; never drop another
   stream's work.

Half-finished work is never pushed in a broken state. If you must stop
mid-milestone, commit it behind a feature that is not yet wired in, so the game
still builds and runs.

## Rendering

```bash
npm run build
SLAY_PORT=<your port> node tools/screenshot.mjs --out=shots/<stream> --shots=town,dungeon
```

Ports: hud 4301, menus 4302, animation 4303, world 4304, feel 4305, depth 4306,
combat 4307, story 4308, quality 4309, art 4310, models 4311.
Look at the PNGs yourself. `shots/` is not committed.

## Pause

The owner pauses the overhaul by saying so. Claude then sends every running
agent a message starting with **PAUSE**. On receiving it:

1. Stop starting new work.
2. Bring what you have to a safe state: the game builds, typecheck is clean,
   nothing half-wired is reachable. Unfinished work is either finished quickly
   or committed behind a feature that is not yet switched on.
3. Update your progress file: set `Status: paused`, tick anything finished, and
   rewrite "Next up" so precisely that a fresh agent with no memory can carry on.
4. Commit, rebase and push exactly as in "A checkpoint" above.
5. Reply with one line: the commit you stopped at and what is next. Then end.

## Resume

When the owner says resume, Claude launches one agent per stream whose
progress file still has unticked milestones. Each starts with "Setup" above,
reads its progress file, sets `Status: in progress`, and continues from
"Next up".
