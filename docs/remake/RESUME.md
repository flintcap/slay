# Stopping and resuming the remake

- To pause on purpose, tell Claude "pause". Every running agent stops at a
  safe point, pushes its work and leaves notes.
- If agents stop without warning (usage ran out, machine restarted), at most
  the last few minutes of each agent's work are at risk. Agents commit every
  20 minutes and push every hour.
- To restart, tell Claude "resume". From a brand new session say:
  "Resume the remake from docs/remake."

Claude then follows "Resume" and "Sudden stop" in `PROTOCOL.md`, using
`QUEUE.md` to see what was running and what is next.
