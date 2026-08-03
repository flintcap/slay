/**
 * Entry point for `tools/check-passives.mjs`. Pure data, runs under Node.
 *
 * A skill reaches the player through exactly two doors: `SkillRunner.cast`,
 * which only accepts a skill with a targeting mode, and `skillPassiveStats`,
 * which only reads a skill's `passive` stat table. A skill with neither is
 * spent skill points that buy nothing at all — it cannot be cast and it grants
 * nothing. This finds them.
 */
import { SKILLS } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { IMPLEMENTED_PASSIVES } from '../src/sim/Passives';

const engine = new Set<string>(IMPLEMENTED_PASSIVES);

const rows = SKILLS.map((s) => ({
  id: s.id,
  name: s.name,
  tree: s.treeId,
  tier: s.tier,
  targeting: s.targeting,
  effect: s.effect ?? null,
  hasPassiveStats: !!s.passive && Object.keys(s.passive).length > 0,
  inEngine: engine.has(s.id),
  desc: s.desc,
}));

const treeOwner: Record<string, string> = {};
for (const c of CLASSES) for (const t of c.trees) treeOwner[t] = c.id;

console.log(JSON.stringify({ rows, treeOwner }));
