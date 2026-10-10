> **Finished.** The overhaul is closed. The remake in `docs/remake/` replaces it.

# Resuming the overhaul

To pause on purpose, tell Claude "pause". Every agent stops at a safe point,
pushes its work and leaves precise notes (see "Pause" in PROTOCOL.md).

If the agents were stopped without warning (usage ran out, session ended),
nothing finished is lost: every finished milestone is already on the branch.

To restart, tell Claude:

> Resume.

(or, from a brand new session: "Resume the overhaul from docs/overhaul.")

Claude then relaunches one agent per stream that still has unticked
milestones, each told to follow `PROTOCOL.md` and pick up from its own
progress file.
