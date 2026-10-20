/**
 * Loads every class's skill gestures. Import this (not the class files) to be
 * sure every `skill.<id>` action exists. One file per class.
 */
import './mage';
import './knight';
import './rogue';
import './ranger';
import './revenant';
import './shapeshifter';
import './paladin';

export { skillAction, releasesAt, strikesAt, hasGesture, gestureIds, plainMove, weaponSwing, gestureCuts } from '../SkillActions';
