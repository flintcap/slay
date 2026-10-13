/**
 * Entry point for `tools/check-unique.mjs`. Bundled and run under Node.
 *
 * One row per active skill of every class: the body clip it really plays, the
 * visual signature it really draws and the sound files it really plays.
 */
import { SKILLS } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { bodyClip } from '../src/scenes/SkillRunner';
import { hasGesture } from '../src/art/hero/gestures';
import { SKILL_MOTIFS, visualSignature } from '../src/fx/SkillLooks';
import { SKILL_SOUNDS } from '../src/audio/SkillSounds';
import { soundFiles } from '../src/audio/Bank';

/** What a class fights with, which decides some clip choices. Unknown classes swing. */
const STYLE: Record<string, 'melee' | 'ranged' | 'caster'> = {
  warden: 'melee', shadowblade: 'melee', ranger: 'ranged', mage: 'caster', revenant: 'caster', paladin: 'melee', shapeshifter: 'melee',
};

const rows: Record<string, unknown>[] = [];
for (const c of CLASSES) {
  for (const s of SKILLS) {
    if (!c.trees.includes(s.treeId) || s.targeting === 'passive') continue;
    const snd = SKILL_SOUNDS[s.id];
    const files = snd ? [snd.cast, snd.hit, snd.minion].filter((x): x is string => !!x).flatMap((id) => soundFiles(id)) : [];
    rows.push({
      cls: c.id,
      id: s.id,
      clip: bodyClip(s.effect, STYLE[c.id] ?? 'melee', s.id),
      gesture: hasGesture(s.id),
      look: visualSignature(s.id, s.effect),
      motif: s.id in SKILL_MOTIFS,
      pair: SKILL_MOTIFS[s.id] ? `${SKILL_MOTIFS[s.id]!.shape} ${SKILL_MOTIFS[s.id]!.motion}` : null,
      sounds: [...new Set(files)],
    });
  }
}
console.log(JSON.stringify(rows));
