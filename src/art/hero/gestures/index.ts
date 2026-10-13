/**
 * Loads every class's skill gestures. Import this (not the class files) to be
 * sure every `skill.<id>` action exists. One file per class.
 */
import './mage';
import './knight';
import './rogue';

export { skillAction, releasesAt, strikesAt, hasGesture, gestureIds } from '../SkillActions';
