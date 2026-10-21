/**
 * Area hits that weaken toward the edge of their reach.
 *
 * A blast (`SkillRunner.areaDamage`) hits hardest at its centre and loses
 * damage in a straight line out to its rim, where it deals `AREA_EDGE_SHARE`
 * of the full hit, so standing in the middle of a pack pays. The skills
 * below land their damage that way; the skill board says so under each one's
 * description (`ui/SkillTreePanel.ts`). `check-rankpower` casts every active
 * skill and fails when this list and the runner disagree.
 */
import { tr } from '../core/I18n';

/** Share of an area hit's damage left at the very edge of its reach. */
export const AREA_EDGE_SHARE = 0.65;

/** Active skills whose blasts fall off toward the edge. */
export const EDGE_FALLOFF: ReadonlySet<string> = new Set([
  // Knight
  'gatefall', 'gorefeast', 'warStomp', 'heraldOfRuin',
  // Mage
  'emberNova', 'fireball', 'blastWave', 'pyroclasm', 'firestorm', 'annihilate',
  'shockNova', 'thunderclap', 'lightningStrike', 'heavensGate',
  'frostNova', 'glacialSpike', 'rimeField', 'blizzard', 'frostStep', 'glacialComet',
  // Rogue
  'noxiousCloud', 'plagueVial', 'envenomBurst', 'knifeHalo',
  // Revenant
  'boneCage', 'boneStorm', 'boneNova', 'poisonNova', 'pestilence', 'sanguineNova', 'corpseExplosion', 'reaping',
]);

/** The line the skill board shows under a skill whose blast falls off, or null. */
export function edgeFalloffNote(skillId: string): string | null {
  if (!EDGE_FALLOFF.has(skillId)) return null;
  return tr('Area damage is full at the centre and falls to {0}% at the edge.', Math.round(AREA_EDGE_SHARE * 100));
}
