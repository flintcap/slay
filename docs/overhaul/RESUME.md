# Resuming the overhaul

If the agents were stopped (usage ran out, session ended), nothing is lost:
every finished milestone is already on the branch.

To restart, tell Claude:

> Resume the overhaul from docs/overhaul.

Claude then relaunches one agent per stream that still has unticked
milestones, each told to follow `PROTOCOL.md` and pick up from its own
progress file.
