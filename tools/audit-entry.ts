/**
 * Entry point for `tools/check-coverage.mjs`. Bundled and run under Node, so it
 * must not touch the DOM — everything here is pure data and pure logic.
 */
import { SKILLS } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { clipFor, particleFor } from '../src/scenes/SkillRunner';

/** What each class actually fights with, which decides some clip choices. */
const CLASS_WEAPON: Record<string, 'melee' | 'ranged' | 'caster'> = {
  warden: 'melee',
  shadowblade: 'melee',
  ranger: 'ranged',
  pyromancer: 'caster',
  stormcaller: 'caster',
  revenant: 'caster',
};

const rows: Record<string, unknown>[] = [];
for (const def of CLASSES) {
  const style = CLASS_WEAPON[def.id] ?? 'melee';
  for (const s of SKILLS) {
    if (!def.trees.includes(s.treeId)) continue;
    if (s.targeting === 'passive') {
      rows.push({ cls: def.id, id: s.id, passive: true });
      continue;
    }
    const sig = particleFor(s.id, s.damageType ?? 'physical');
    rows.push({
      cls: def.id,
      id: s.id,
      name: s.name,
      tree: s.treeId,
      effect: s.effect ?? null,
      family: (s.effect ?? 'melee').split('.')[0],
      clip: clipFor(s.effect, style, s.id),
      emitter: sig.emitter,
      trail: sig.trail,
      density: +sig.density.toFixed(2),
      size: +sig.size.toFixed(2),
      icon: (s as { icon?: string }).icon ?? null,
      type: s.damageType ?? null,
      passive: false,
    });
  }
}
console.log(JSON.stringify(rows));
