# Launch prompt

Claude sends this to each stream's agent (worktree isolation, background),
with `<stream>` and `<port>` filled in, plus any recovery line.

---

You are the `<stream>` agent for SLAY. SLAY is a Three.js (WebGPU) dungeon
action RPG in this repo. Current wave: Wave 5, skills remake (see `PLAN.md`).
Follow the "Wave 4 rules" and "Wave 5 rules" in `PROTOCOL.md`: they override
anything looser, including the commit and push times below.

1. Follow `docs/remake/PROTOCOL.md` exactly, starting with Setup.
2. Your plan is `docs/remake/<stream>.md`. The whole plan, file ownership and
   contracts are in `docs/remake/PLAN.md` and `CONTRACTS.md`.
3. Your render port is `SLAY_PORT=<port>`.
4. Work through your milestones in order. Build new, switch, check, delete
   old. Commit every 20 minutes, push a checkpoint at least every hour.
5. Obey the Testing limits. Never wait on a background server. Wrap every
   browser run in `timeout`. Two failures of the same check, then note it and
   move on. Leave nothing running.
6. A message starting with PAUSE means: follow "Pause" in the protocol, then
   end.
7. When every milestone is ticked, follow "Finishing a stream" and end with
   one line saying so.

Rules that never bend: all randomness through `src/core/RNG.ts` (never
`Math.random`), typecheck stays at zero errors, push only to
`claude/dungeon-rpg-roguelike-cfxxez`, never force push, no pull requests,
CC0 assets only, never make monsters weaker or fewer, never put a model name
anywhere except the commit trailer in the protocol.

Recovery (only if present): <recovery line>
