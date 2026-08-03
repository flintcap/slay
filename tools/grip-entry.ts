/**
 * Entry point for `tools/check-grips.mjs`.
 *
 * Reported: "two handed weapons need to be held with both hands, same with bow
 * and held across the body, daggers held one hand pointing down, swords need to
 * be held upright and carried the same."
 *
 * Every weapon shared one right-hand socket at one angle, so a greatsword was
 * carried like a dagger and a bow sat in the drawing hand. This builds a real
 * skeleton, attaches a real weapon through the real socket code, runs the real
 * animator until the carry pose settles, then measures the result: which hand
 * holds it, which way the business end points, and how far apart the hands are.
 *
 * No renderer and no browser. The grip is geometry, and geometry can be read.
 */
import * as THREE from 'three';
import {
  buildPlayerModel,
  attachToSocket,
  weaponGrip,
  carryGrip,
} from '../src/art/CharacterModels';
import { buildItemModel } from '../src/art/ItemModels';
import { Animator } from '../src/art/Animation';
import { ITEM_BASES } from '../src/data/itemBases';
import { Random } from '../src/core/RNG';

interface Row {
  base: string;
  category: string;
  twoHanded: boolean;
  grip: string;
  carry: string;
  hand: string;
  points: 'up' | 'down';
  /** How vertical it is: 1 straight up or down, 0 flat across. */
  upright: number;
  handGap: number;
  bothHands: boolean;
}

/** Hands closer together than this are on the same haft. */
const BOTH_HANDS_GAP = 0.34;

function measure(baseId: string): Row | null {
  const base = ITEM_BASES.find((b) => b.id === baseId);
  if (!base) return null;
  const rng = new Random(0x51a7);
  const built = buildPlayerModel('warden', rng);
  const bones = built.bones;
  const animator = new Animator(bones);

  const twoHanded = base.slot === 'twoHand';
  const grip = weaponGrip(base.category, twoHanded);
  const carry = carryGrip(base.category, twoHanded);
  const mesh = buildItemModel(base.visual ?? { shape: 'auto', palette: 'metal.steel' }, rng, 'rare');
  attachToSocket(built.root, bones, 'mainHand', mesh, undefined, grip);

  animator.setGrip(carry);
  animator.play('idle', { fade: 0 });
  // The carry pose eases in rather than snapping, so give it time to arrive.
  for (let i = 0; i < 120; i++) animator.update(1 / 60);
  built.root.updateMatrixWorld(true);

  let hand = '(none)';
  let points: 'up' | 'down' = 'down';
  let upright = 0;
  for (const name of ['handR', 'handL']) {
    const bone = bones[name];
    if (!bone) continue;
    for (const child of bone.children) {
      if (child.userData?.socketSlot !== 'mainHand') continue;
      hand = name;
      // The authored business end, not the bounding box: a bow has limbs at
      // both ends and its box says nothing about which way it is being held.
      const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(
        child.getWorldQuaternion(new THREE.Quaternion()),
      );
      points = tip.y > 0 ? 'up' : 'down';
      upright = +Math.abs(tip.y).toFixed(2);
    }
  }
  const l = new THREE.Vector3();
  const r = new THREE.Vector3();
  bones.handL?.getWorldPosition(l);
  bones.handR?.getWorldPosition(r);
  const handGap = +l.distanceTo(r).toFixed(3);

  return {
    base: baseId,
    category: base.category,
    twoHanded,
    grip,
    carry,
    hand,
    points,
    upright,
    handGap,
    bothHands: handGap < BOTH_HANDS_GAP,
  };
}

const WANTED: Array<{ base: string; hand: string; points: string; both: boolean }> = [
  { base: 'sword.short', hand: 'handR', points: 'up', both: false },
  { base: 'sword.great', hand: 'handR', points: 'up', both: true },
  { base: 'dagger.dirk', hand: 'handR', points: 'down', both: false },
  { base: 'dagger.stiletto', hand: 'handR', points: 'down', both: false },
  { base: 'bow.short', hand: 'handL', points: 'up', both: true },
  { base: 'bow.long', hand: 'handL', points: 'up', both: true },
  { base: 'staff.short', hand: 'handR', points: 'up', both: true },
  { base: 'spear.spear', hand: 'handR', points: 'up', both: true },
  { base: 'axe.hand', hand: 'handR', points: 'up', both: false },
  { base: 'axe.battle', hand: 'handR', points: 'up', both: true },
  { base: 'mace.club', hand: 'handR', points: 'up', both: false },
  { base: 'mace.warhammer', hand: 'handR', points: 'up', both: true },
  { base: 'wand.wand', hand: 'handR', points: 'up', both: false },
];

const rows: Array<Row & { want: (typeof WANTED)[number]; ok: boolean }> = [];
for (const w of WANTED) {
  const got = measure(w.base);
  if (!got) continue;
  rows.push({
    ...got,
    want: w,
    ok: got.hand === w.hand && got.points === w.points && got.bothHands === w.both,
  });
}

/**
 * Where the weapon points mid-swing.
 *
 * The socket angles are solved against the carry pose, and the weapon is
 * parented to the hand, so a grip that reads beautifully while standing still
 * could have the blade pointing back at its owner during a strike. This checks
 * the other half: at the moment of contact the business end must be out in
 * front, not behind.
 */
const SWINGS: Array<{ base: string; clip: string }> = [
  { base: 'sword.short', clip: 'attack1' },
  { base: 'dagger.dirk', clip: 'attack1' },
  { base: 'sword.great', clip: 'slam' },
  { base: 'axe.battle', clip: 'slam' },
  { base: 'staff.short', clip: 'cast' },
  { base: 'spear.spear', clip: 'thrust' },
  { base: 'bow.short', clip: 'shoot' },
];

const swings: Array<{ base: string; clip: string; forward: number; up: number; ok: boolean }> = [];
for (const s of SWINGS) {
  const base = ITEM_BASES.find((b) => b.id === s.base);
  if (!base) continue;
  const rng = new Random(0x51a7);
  const built = buildPlayerModel('warden', rng);
  const twoHanded = base.slot === 'twoHand';
  const mesh = buildItemModel(base.visual ?? { shape: 'auto', palette: 'metal.steel' }, rng, 'rare');
  attachToSocket(built.root, built.bones, 'mainHand', mesh, undefined, weaponGrip(base.category, twoHanded));
  const animator = new Animator(built.bones);
  animator.setGrip(carryGrip(base.category, twoHanded));
  animator.play(s.clip, { fade: 0, once: true, hold: true });
  // Run to roughly the moment of contact, a little past the middle of the clip.
  for (let i = 0; i < 20; i++) animator.update(1 / 60);
  built.root.updateMatrixWorld(true);
  const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  swings.push({
    base: s.base,
    clip: s.clip,
    forward: +tip.z.toFixed(2),
    up: +tip.y.toFixed(2),
    // Anything but pointing back over the shoulder at your own head.
    ok: tip.z > -0.75,
  });
}

// Every weapon category has to resolve to a grip somebody chose, not fall
// through to the default. That default is what made everything look the same.
const covered: Array<{ category: string; grip: string; bases: number }> = [];
const seen = new Set<string>();
for (const b of ITEM_BASES) {
  if (b.slot !== 'mainHand' && b.slot !== 'twoHand') continue;
  const key = `${b.category}|${b.slot === 'twoHand'}`;
  if (seen.has(key)) continue;
  seen.add(key);
  covered.push({
    category: `${b.category}${b.slot === 'twoHand' ? ' (2h)' : ''}`,
    grip: weaponGrip(b.category, b.slot === 'twoHand'),
    bases: ITEM_BASES.filter((x) => x.category === b.category && x.slot === b.slot).length,
  });
}

console.log(JSON.stringify({ rows, covered, swings }));
