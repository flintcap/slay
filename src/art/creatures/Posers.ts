/**
 * SLAY — which poser drives which rig kind.
 */
import type { CreatureAnimator } from './Animator';
import type { RigKind } from './Rig';
import { poseBiped, poseSpecter } from './PoseBiped';
import { poseFlyer, poseQuadruped, poseSerpent } from './PoseBeast';
import { poseBug } from './PoseBug';
import { poseFloater, poseOoze, poseSwarm } from './PoseBlob';

export const POSERS: Record<RigKind, (a: CreatureAnimator) => void> = {
  biped: poseBiped,
  brute: poseBiped,
  giant: poseBiped,
  specter: poseSpecter,
  quadruped: poseQuadruped,
  flyer: poseFlyer,
  serpent: poseSerpent,
  spider: poseBug,
  insect: poseBug,
  ooze: poseOoze,
  floater: poseFloater,
  swarm: poseSwarm,
};
