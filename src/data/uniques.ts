/**
 * SLAY — unique items.
 *
 * A unique is not "a rare with bigger numbers". Every entry here is supposed to
 * answer the question *what does this let me do that I could not do before?* —
 * a build hook. Some trade defence for offence at an alarming rate, some hand
 * you a stat you have no other source for, and a few are frankly bad on paper
 * and exist because somebody will find the one build where they are absurd.
 *
 * Tiers:
 *   `unique`  — the backbone. ~1 in 90 item drops, found from depth 1 onward.
 *   `mythic`  — depth 60+, roughly 1 in 900. Two or three build-defining lines.
 *   `ancient` — depth 80+, roughly 1 in 9000, boss-weighted. These are the
 *               items people name their characters after.
 *
 * `special` is a documented extension point: an id the combat layer may read to
 * implement behaviour a StatKey cannot express (damage conversion, on-kill
 * effects, resource inversion). Unknown ids are safely ignored — the `hook`
 * string is still shown in the tooltip either way.
 */

import type { CharClassId, ItemMod, ItemRarity, StatKey } from '../types';
import { applyUniqueText } from './story/uniqueText';
import { bendText, setBendLookup, type SkillBend } from './skillBends';
import { DEPTH_UNIQUES } from './uniqueBatches/index';
import { tr } from '../core/I18n';

export interface UniqueMod {
  stat: StatKey;
  min: number;
  max: number;
  kind?: ItemMod['kind'];
}

export interface UniqueDef {
  id: string;
  name: string;
  baseId: string;
  rarity: Extract<ItemRarity, 'unique' | 'mythic' | 'ancient'>;
  /** Lowest item level at which this can drop. */
  ilvl: number;
  /** Character level needed to equip. Usually the base's, sometimes higher. */
  levelReq: number;
  /** One-line mechanical hook, shown in gold above the flavour text. */
  hook?: string;
  flavor: string;
  mods: UniqueMod[];
  /** Fixed socket count. */
  sockets?: number;
  /** Relative weight inside its rarity tier. */
  weight: number;
  /** Behaviour hook id for the combat layer. Optional and safely ignorable. */
  special?: string;
  /** How strong `special` is (1 = the power's own strength). */
  specialMag?: number;
  /** Rolls only for this class: the skill benders. */
  classId?: CharClassId;
  /** The one skill this unique bends (`data/skillBends.ts`). Its hook is written from it. */
  bend?: SkillBend;
  /** A chase item: one per account at a time. */
  chase?: boolean;
}

function u(
  id: string,
  name: string,
  baseId: string,
  ilvl: number,
  levelReq: number,
  flavor: string,
  mods: Array<[StatKey, number, number]>,
  o: { hook?: string; sockets?: number; weight?: number; special?: string; specialMag?: number; rarity?: UniqueDef['rarity']; classId?: CharClassId; bend?: SkillBend; chase?: boolean } = {},
): UniqueDef {
  const def: UniqueDef = {
    id,
    name,
    baseId,
    rarity: o.rarity ?? 'unique',
    ilvl,
    levelReq,
    flavor,
    mods: mods.map(([stat, min, max]) => ({ stat, min, max })),
    weight: o.weight ?? 100,
  };
  if (o.hook) def.hook = o.hook;
  if (o.sockets) def.sockets = o.sockets;
  if (o.special) def.special = o.special;
  if (o.specialMag !== undefined) def.specialMag = o.specialMag;
  if (o.classId) def.classId = o.classId;
  if (o.bend) def.bend = o.bend;
  if (o.chase) def.chase = true;
  return def;
}

const m = (id: string, name: string, baseId: string, ilvl: number, levelReq: number, flavor: string,
  mods: Array<[StatKey, number, number]>, o: Parameters<typeof u>[7] = {}) =>
  u(id, name, baseId, ilvl, levelReq, flavor, mods, { ...o, rarity: 'mythic', weight: o.weight ?? 60 });

const a = (id: string, name: string, baseId: string, ilvl: number, levelReq: number, flavor: string,
  mods: Array<[StatKey, number, number]>, o: Parameters<typeof u>[7] = {}) =>
  u(id, name, baseId, ilvl, levelReq, flavor, mods, { ...o, rarity: 'ancient', weight: o.weight ?? 30 });

export const UNIQUES: UniqueDef[] = [
  // =========================================================================
  // EARLY — levels 1-20. Small, weird, and often better than they look.
  // =========================================================================

  u('uq.rixots', tr("Rixot's Keen"), 'sword.short', 4, 4,
    tr('Rixot sharpened it every night for thirty years and died of a cough.'),
    [['minDamage', 4, 6], ['maxDamage', 8, 12], ['attackRating', 40, 70], ['critChance', 3, 5]],
    { hook: tr('The edge does not dull.'), weight: 120 }),

  u('uq.felloak', tr('Felloak'), 'mace.club', 6, 5,
    tr('Cut from a tree that was already burning and never stopped.'),
    [['fireDamage', 12, 20], ['enhancedDamage', 40, 60], ['fireResist', 20, 30], ['strength', 4, 7]],
    { hook: tr('Burns through the swing.'), weight: 110 }),

  u('uq.gnasher', tr('The Gnasher'), 'axe.hand', 7, 6,
    tr('Something chewed the haft to fit its own jaw. It fits yours too.'),
    [['enhancedDamage', 60, 90], ['areaDamagePct', 15, 25], ['maxDamage', 6, 10], ['lifeSteal', 2, 3]],
    { hook: tr('Every hit takes a bite.'), weight: 100 }),

  u('uq.hotspur', tr('Hotspur'), 'boots.boots', 9, 8,
    tr('The previous owner walked out of a foundry and kept walking.'),
    [['fireDamage', 8, 16], ['fireResist', 25, 40], ['life', 20, 35], ['moveSpeed', 8, 12]],
    { hook: tr('Leaves a warm print on stone.'), weight: 110, special: 'emberPrints' }),

  u('uq.pluckeye', tr('Pluckeye'), 'bow.short', 8, 7,
    tr('Named for what it does, not for who made it.'),
    [['attackRating', 90, 150], ['critChance', 5, 8], ['lifeSteal', 2, 4], ['dexterity', 5, 9]],
    { hook: tr('Aims a little on its own.'), weight: 100 }),

  u('uq.greyform', tr('Greyform'), 'chest.leather', 11, 10,
    tr('A hide so dull the eye slides off it.'),
    [['enhancedDefense', 60, 90], ['lifeSteal', 2, 4], ['coldResist', 20, 30], ['dexterity', 6, 10],
     ['magicFind', 8, 14]],
    { hook: tr('Hard to look at directly.'), weight: 100 }),

  u('uq.jadetando', tr('The Jade Tan Do'), 'dagger.dagger', 12, 10,
    tr('A blade for people who intend to be the last one standing, not the first one moving.'),
    [['poisonDamage', 20, 34], ['poisonResist', 60, 80], ['life', 25, 45], ['manaSteal', 2, 3]],
    { hook: tr('Poison in your veins works for you instead.'), special: 'poisonImmuneFeedback', weight: 90 }),

  u('uq.wormskull', tr('Wormskull'), 'helm.bone', 13, 12,
    tr('It fits every head. That is the least strange thing about it.'),
    [['skillLevels', 1, 1], ['poisonDamage', 14, 26], ['manaSteal', 2, 3], ['life', -25, -12],
     ['poisonResist', 20, 30]],
    { hook: tr('Costs you a little life to wear. Worth it.'), weight: 95 }),

  u('uq.steelclash', tr('Steelclash'), 'shield.small', 14, 12,
    tr('Rings like a bell struck badly, and the ringing is the point.'),
    [['blockChance', 10, 15], ['enhancedDefense', 70, 110], ['fireResist', 20, 30], ['coldResist', 20, 30],
     ['lightningResist', 20, 30], ['damageReduction', 2, 4]],
    { hook: tr('Answers every blow with a note.'), weight: 100 }),

  u('uq.nightsmoke', tr('Nightsmoke'), 'belt.sash', 16, 15,
    tr('Woven from something that used to be weather.'),
    [['damageReduction', 3, 5], ['mana', 40, 70], ['manaRegen', 15, 25], ['physicalResist', 3, 6],
     ['arcaneResist', 20, 35]],
    { hook: tr('Half the damage you take is paid in mana.'), special: 'manaShield', weight: 95 }),

  u('uq.bloodrise', tr('Bloodrise'), 'mace.mace', 15, 13,
    tr('It is heavier after a fight than before one.'),
    [['lifeSteal', 5, 7], ['enhancedDamage', 55, 85], ['attackRating', 80, 130], ['lifeRegen', -8, -4]],
    { hook: tr('You do not heal on your own any more. You do not need to.'), weight: 90 }),

  u('uq.civerbs', tr("Civerb's Cudgel"), 'mace.club', 18, 16,
    tr('A relic of an order that no longer exists and was not much liked when it did.'),
    [['enhancedDamage', 90, 130], ['arcaneDamage', 15, 28], ['skillLevels', 1, 1], ['mana', -40, -20]],
    { hook: tr('Devastating against the undead, awkward against everything else.'), special: 'undeadSlayer', weight: 85 }),

  // Pants.
  u('uq.mudlark', tr("Mudlark's Breeches"), 'pants.trousers', 5, 4,
    tr('Pulled out of the river mud below Stairhead.'),
    [['life', 15, 25], ['vitality', 4, 7], ['moveSpeed', 5, 8], ['poisonResist', 20, 30]],
    { hook: tr('Each kill puts a little life back.'), special: 'killLife', weight: 110 }),

  u('uq.hearthwool', tr('Hearthwool'), 'pants.silk', 8, 6,
    tr('Knitted by the stove in the Lamp, one row a night, all winter.'),
    [['mana', 20, 35], ['energy', 5, 9], ['fireResist', 20, 30], ['manaRegen', 10, 20]],
    { hook: tr('Keeps a caster warm and full.'), weight: 105 }),

  u('uq.gatewarden', tr('Gatewarden'), 'pants.chausses', 16, 14,
    tr('The gate on the first tier fell. The man who held it did not.'),
    [['enhancedDefense', 50, 80], ['vitality', 6, 10], ['life', 30, 50], ['physicalResist', 3, 5]],
    { hook: tr('Melee attackers take a share of the damage they deal you.'), special: 'thorns', weight: 100 }),

  // =========================================================================
  // MID — levels 20-50. Where builds start committing to a direction.
  // =========================================================================

  u('uq.gorefoot', tr('Gorefoot'), 'boots.heavy', 22, 20,
    tr('The tread pattern is not a tread pattern.'),
    [['moveSpeed', 15, 22], ['lifeSteal', 3, 5], ['attackSpeed', 10, 15], ['maxDamage', 10, 18]],
    { hook: tr('Faster the longer you stay in melee.'), special: 'momentum', weight: 100 }),

  u('uq.venomward', tr('Venom Ward'), 'shield.kite', 24, 22,
    tr('Green stains that will not come off, and never needed to.'),
    [['poisonResist', 70, 95], ['enhancedDefense', 100, 150], ['blockChance', 8, 12], ['poisonDamage', 30, 55],
     ['life', 50, 90]],
    { hook: tr('Poison resistance can exceed the normal cap.'), special: 'poisonOvercap', weight: 95 }),

  u('uq.skystrike', tr('Skystrike'), 'bow.long', 26, 24,
    tr('Loosed once at a storm. The storm moved.'),
    [['lightningDamage', 20, 90], ['skillLevels', 1, 1], ['attackSpeed', 12, 18], ['dexterity', 12, 20],
     ['elementalDamagePct', 12, 20]],
    { hook: tr('Arrows fork on impact.'), special: 'chainLightning', weight: 95 }),

  u('uq.hexfire', tr('Hexfire'), 'sword.gladius', 28, 25,
    tr('It has a fever and it is contagious.'),
    [['fireDamage', 55, 95], ['enhancedDamage', 100, 150], ['elementalDamagePct', 18, 28], ['fireResist', -20, -10]],
    { hook: tr('All physical damage from this weapon is dealt as fire.'), special: 'convertFire', weight: 90 }),

  u('uq.frostwind', tr('Frostwind'), 'sword.broad', 30, 27,
    tr('The scabbard cracked from the inside within a week.'),
    [['coldDamage', 60, 110], ['enhancedDamage', 90, 140], ['coldResist', 25, 40], ['attackSpeed', -12, -6],
     ['critDamage', 40, 70]],
    { hook: tr('Slower swings, and everything you touch slows with you.'), special: 'chillOnHit', weight: 90 }),

  u('uq.duskdeep', tr('Duskdeep'), 'helm.full', 32, 30,
    tr('The visor slot is welded shut. It has been for a long time.'),
    [['enhancedDefense', 110, 160], ['damageReduction', 5, 8], ['maxDamage', 14, 24], ['life', 60, 100],
     ['magicFind', -15, -8]],
    { hook: tr('You see less. Considerably less hits you.'), weight: 95 }),

  u('uq.magefist', tr('Magefist'), 'gloves.silk', 34, 30,
    tr('The fingertips are permanently scorched from the inside.'),
    [['castSpeed', 18, 25], ['fireDamage', 40, 70], ['manaRegen', 30, 45], ['skillLevels', 1, 1]],
    { hook: tr('Fire spells cost no mana below half your pool.'), special: 'fireFree', weight: 90 }),

  u('uq.frostburn', tr('Frostburn'), 'gloves.heavy', 36, 32,
    tr('Both hands ache. Neither hand is cold.'),
    [['mana', 120, 190], ['coldDamage', 45, 80], ['castSpeed', 12, 18], ['manaSteal', 3, 5]],
    { hook: tr('Mana pool counts double for anything that scales off it.'), special: 'manaScale', weight: 90 }),

  u('uq.stormchaser', tr('Stormchaser'), 'staff.cedar', 38, 34,
    tr('It points at weather. Not always the weather you can see.'),
    [['lightningDamage', 30, 160], ['skillLevels', 2, 2], ['castSpeed', 20, 28], ['lightningResist', 30, 45],
     ['manaRegen', 40, 60]],
    { hook: tr('Lightning damage rolls are never low.'), special: 'lightningFloor', weight: 85 }),

  u('uq.rockstopper', tr('Rockstopper'), 'helm.skullcap', 35, 31,
    tr('Dented in exactly one place, very deeply.'),
    [['enhancedDefense', 150, 210], ['damageReduction', 8, 12], ['fireResist', 30, 45], ['coldResist', 30, 45],
     ['lightningResist', 30, 45], ['vitality', 15, 25]],
    { hook: tr('Whatever hit it first, it stopped.'), weight: 95 }),

  u('uq.goldwrap', tr('Goldwrap'), 'belt.girdle', 33, 30,
    tr('The buckle is worth more than most of what it has held up.'),
    [['goldFind', 120, 180], ['magicFind', 20, 30], ['defense', 40, 70], ['attackSpeed', 10, 15]],
    { hook: tr('Gold you pick up trickles back as life.'), special: 'goldToLife', weight: 100 }),

  u('uq.nagelring', tr('Nagelring'), 'ring.signet', 30, 26,
    tr('Cheap metal, unreasonable luck.'),
    [['magicFind', 30, 45], ['attackRating', 100, 170], ['damageReduction', 2, 4], ['strength', 6, 10]],
    { hook: tr('Worn in pairs by people with more optimism than sense.'), weight: 110 }),

  u('uq.manald', tr('Manald Heal'), 'ring.signet', 32, 28,
    tr('A physician made it. The physician is still alive, somewhere.'),
    [['manaRegen', 50, 75], ['lifeRegen', 20, 30], ['mana', 60, 100], ['manaSteal', 2, 4]],
    { hook: tr('Every lightning hit refunds mana.'), special: 'manaldHeal', weight: 100 }),

  u('uq.cleglaw', tr("Cleglaw's Tooth"), 'sword.foil', 40, 36,
    tr('A duelling blade for a duel nobody agreed to.'),
    [['attackRating', 250, 400], ['critChance', 8, 12], ['critDamage', 60, 95], ['enhancedDamage', 80, 120],
     ['lifeSteal', 3, 5]],
    { hook: tr('Critical strikes cannot be blocked.'), special: 'unblockableCrit', weight: 90 }),

  u('uq.buriza', tr('Buriza-Do Kyanon'), 'xbow.siege', 42, 38,
    tr('Loaded once, at the top of a mountain, by someone who never came down.'),
    [['coldDamage', 90, 160], ['critDamage', 100, 150], ['enhancedDamage', 140, 200], ['attackSpeed', -10, -5]],
    { hook: tr('Bolts pierce through every target in the line.'), special: 'pierce', weight: 85 }),

  u('uq.titans', tr("Titan's Revenge"), 'spear.warspear', 44, 40,
    tr('Thrown at a giant. Came back. The giant did not.'),
    [['strength', 25, 40], ['enhancedDamage', 150, 210], ['attackSpeed', 15, 22], ['areaDamagePct', 25, 40],
     ['life', 90, 150]],
    { hook: tr('Returns to your hand.'), special: 'returning', weight: 85 }),

  u('uq.stormshield', tr('Stormshield'), 'shield.tower', 46, 42,
    tr('The straps have been replaced eleven times. The face never has.'),
    [['damageReduction', 12, 18], ['physicalResist', 12, 18], ['blockChance', 15, 22], ['strength', 20, 30],
     ['lightningResist', 40, 60], ['moveSpeed', -8, -4]],
    { hook: tr('You will not be moved, and you will not move quickly.'), weight: 85 }),

  u('uq.shaftstop', tr('Shaftstop'), 'chest.gothic', 48, 44,
    tr('Arrows come out of it if you shake it hard enough.'),
    [['enhancedDefense', 200, 280], ['damageReduction', 14, 20], ['life', 140, 220], ['physicalResist', 8, 12]],
    { hook: tr('Ranged attacks against you lose their edge.'), special: 'rangedDR', weight: 90 }),

  u('uq.gazehell', tr('Gaze of the Hell Wyrm'), 'helm.grim', 45, 41,
    tr('It has been looking at something ever since it was made. Not at you.'),
    [['fireDamage', 80, 140], ['skillLevels', 1, 2], ['fireResist', 40, 60], ['elementalDamagePct', 20, 30],
     ['life', -60, -30]],
    { hook: tr('Enemies you burn burn each other.'), special: 'fireSpread', weight: 85 }),

  u('uq.silkweave', tr('Silkweave'), 'boots.scarabshell', 40, 36,
    tr('Every thread is a spider that agreed to stop being a spider.'),
    [['moveSpeed', 22, 30], ['mana', 100, 160], ['manaRegen', 35, 55], ['dexterity', 15, 25],
     ['poisonResist', 30, 45]],
    { hook: tr('Mana regenerates faster the faster you move.'), special: 'runManaRegen', weight: 95 }),

  u('uq.chancecast', tr('Chance Guard'), 'gloves.gauntlets', 36, 32,
    tr('A gambler had them made. Nobody knows if it worked out.'),
    [['magicFind', 40, 60], ['goldFind', 150, 220], ['defense', 40, 70], ['attackRating', 100, 160]],
    { hook: tr('Fortune favours the well-dressed.'), weight: 105 }),

  u('uq.ravenfrost', tr('Raven Frost'), 'ring.band', 45, 40,
    tr('Cold to hold, and it does not warm up.'),
    [['coldDamage', 40, 80], ['dexterity', 15, 25], ['attackRating', 180, 280], ['coldResist', 30, 45],
     ['mana', 60, 100]],
    { hook: tr('You cannot be frozen.'), special: 'freezeImmune', weight: 95 }),

  u('uq.bulkathos', tr("Bul-Kathos' Wedding Band"), 'ring.band', 48, 43,
    tr('A marriage that outlived both parties and most of the kingdom.'),
    [['skillLevels', 1, 1], ['life', 90, 150], ['lifeSteal', 4, 6], ['strength', 12, 20]],
    { hook: tr('Your maximum life rises with every level you gain, twice over.'), special: 'lifePerLevel', weight: 85 }),

  u('uq.thegravenspine', tr('The Graven Spine'), 'staff.war', 46, 42,
    tr('Every knot in the wood is a face, and they are all listening.'),
    [['skillLevels', 2, 2], ['arcaneDamage', 70, 130], ['manaRegen', 55, 80], ['castSpeed', 22, 30],
     ['life', -80, -40]],
    { hook: tr('Summons cost half as much and die twice as fast.'), special: 'summonGlass', weight: 85 }),

  u('uq.widowmaker', tr('Widowmaker'), 'bow.composite', 43, 39,
    tr('The fletching is human hair. It was donated.'),
    [['critChance', 12, 18], ['critDamage', 90, 140], ['enhancedDamage', 130, 190], ['attackSpeed', 12, 18],
     ['lifeSteal', -4, -2]],
    { hook: tr('Critical strikes cannot heal you. Nothing else matters.'), special: 'noCritLeech', weight: 85 }),

  u('uq.hellslayer', tr('Hellslayer'), 'axe.ettin', 47, 43,
    tr('Two hands, one purpose, no second opinion.'),
    [['enhancedDamage', 190, 260], ['fireDamage', 100, 180], ['strength', 20, 32], ['areaDamagePct', 30, 45],
     ['lifeSteal', 4, 7]],
    { hook: tr('Overkill damage splashes onto everything nearby.'), special: 'overkillSplash', weight: 85 }),

  u('uq.spectralshard', tr('Spectral Shard'), 'dagger.blade', 41, 37,
    tr('Half of it is missing and it works better that way.'),
    [['castSpeed', 28, 38], ['mana', 130, 200], ['skillLevels', 1, 1], ['arcaneResist', 40, 60],
     ['critChance', 6, 10]],
    { hook: tr('The fastest caster weapon in the game, and it barely cuts.'), weight: 90 }),

  // Pants.
  u('uq.brambleshanks', tr('Brambleshanks'), 'pants.studded', 26, 24,
    tr('Every stud was hammered in by a hand that had bled on a bramble that day.'),
    [['enhancedDefense', 80, 120], ['dexterity', 10, 15], ['attackSpeed', 8, 12], ['lifeSteal', 2, 4]],
    { hook: tr('Critical strikes leave them bleeding.'), special: 'critBleed', weight: 95 }),

  u('uq.stillwater', tr('Stillwater'), 'pants.mystic', 32, 30,
    tr('Woven at the bottom of the cistern, where the water has not moved in a hundred years.'),
    [['castSpeed', 12, 18], ['mana', 50, 80], ['manaRegen', 20, 35], ['coldResist', 25, 40]],
    { hook: tr('Enemies near you are slowed and weakened.'), special: 'slowAura', weight: 90 }),

  u('uq.anvilknees', tr('Anvilknees'), 'pants.cuisses', 40, 36,
    tr('Beaten on the big anvil at the Works, by a smith who wanted something that would not kneel.'),
    [['enhancedDefense', 120, 170], ['strength', 12, 20], ['life', 60, 100], ['damageReduction', 4, 7]],
    { hook: tr('You cannot be stunned, knocked down or knocked back.'), special: 'unstoppable', weight: 90 }),

  // =========================================================================
  // LATE — levels 50-75. Fully-formed build engines.
  // =========================================================================

  u('uq.windforce', tr('Windforce'), 'bow.hydra', 72, 68,
    tr('The draw makes a sound like a door opening somewhere behind you.'),
    [['enhancedDamage', 260, 340], ['attackSpeed', 25, 35], ['maxDamage', 90, 140], ['lifeSteal', 6, 9],
     ['dexterity', 25, 40], ['areaDamagePct', 25, 40]],
    { hook: tr('Every shot knocks its target back.'), special: 'knockback', weight: 80 }),

  u('uq.doombringer', tr('Doombringer'), 'sword.conquest', 62, 58,
    tr('It was named optimistically and then lived up to it.'),
    [['enhancedDamage', 250, 330], ['lifeSteal', 8, 12], ['critDamage', 130, 190], ['strength', 20, 32],
     ['physicalResist', 8, 12]],
    { hook: tr('Enemies you kill explode for a share of their life.'), special: 'corpseBurst', weight: 80 }),

  u('uq.griswold', tr("Griswold's Edge"), 'sword.falchion', 54, 50,
    tr('The smith kept the best one. Obviously.'),
    [['fireDamage', 120, 200], ['enhancedDamage', 200, 270], ['attackSpeed', 18, 26], ['fireResist', 35, 50],
     ['lifeRegen', 25, 40]],
    { hook: tr('Ignites the ground where you fight.'), special: 'groundFire', weight: 85 }),

  u('uq.azurewrath', tr('Azurewrath'), 'sword.phase', 80, 76,
    tr('It does not reflect torchlight. It replaces it.'),
    [['coldDamage', 200, 340], ['arcaneDamage', 150, 260], ['enhancedDamage', 240, 320], ['skillLevels', 1, 2],
     ['attackSpeed', 20, 28], ['elementalDamagePct', 25, 40]],
    { hook: tr('Physical damage is split evenly between cold and arcane.'), special: 'convertColdArcane', weight: 70 }),

  u('uq.arreatsface', tr("Arreat's Face"), 'helm.spired', 64, 60,
    tr('A mask of a mountain, worn by people who wanted to be one.'),
    [['skillLevels', 2, 2], ['enhancedDefense', 220, 300], ['lifeSteal', 5, 8], ['strength', 20, 32],
     ['dexterity', 20, 32], ['damageReduction', 8, 12]],
    { hook: tr('The best all-round helm in the game and nobody argues.'), weight: 80 }),

  u('uq.crownofages', tr('Crown of Ages'), 'helm.corona', 86, 82,
    tr('Six kings. One crown. Nobody kept it long.'),
    [['skillLevels', 1, 2], ['damageReduction', 15, 22], ['physicalResist', 12, 18], ['enhancedDefense', 260, 350],
     ['fireResist', 35, 50], ['coldResist', 35, 50], ['lightningResist', 35, 50], ['poisonResist', 35, 50]],
    { hook: tr('Two extra sockets, and it needs them.'), sockets: 2, weight: 70 }),

  u('uq.leviathan', tr('Leviathan'), 'chest.kraken', 66, 62,
    tr('Salt still crusts the seams. The sea it came out of is inland now.'),
    [['enhancedDefense', 320, 420], ['damageReduction', 16, 22], ['strength', 30, 45], ['life', 220, 330],
     ['moveSpeed', -10, -5]],
    { hook: tr('You are a wall. Walls do not sprint.'), weight: 80 }),

  u('uq.skinofvipermagi', tr('Skin of the Vipermagi'), 'chest.dusk', 55, 51,
    tr('Shed, not skinned. The magus is still out there, larger.'),
    [['skillLevels', 1, 1], ['castSpeed', 28, 38], ['fireResist', 30, 45], ['coldResist', 30, 45],
     ['lightningResist', 30, 45], ['poisonResist', 30, 45], ['arcaneResist', 30, 45], ['enhancedDefense', 140, 200]],
    { hook: tr('The caster chest, from level 51 to the end of the game.'), weight: 85 }),

  u('uq.warTraveler', tr('War Traveler'), 'boots.war', 58, 54,
    tr('The soles have been resoled by four different cobblers on three continents.'),
    [['magicFind', 55, 80], ['moveSpeed', 18, 26], ['strength', 12, 20], ['vitality', 12, 20],
     ['maxDamage', 30, 55], ['enhancedDefense', 130, 190]],
    { hook: tr('Magic find that does not cost you a damage slot.'), weight: 85 }),

  u('uq.gorerider', tr('Gore Rider'), 'boots.sharkskin', 52, 48,
    tr('The spurs are not decorative and were not originally metal.'),
    [['moveSpeed', 25, 34], ['critChance', 10, 15], ['attackSpeed', 12, 18], ['areaDamagePct', 20, 30],
     ['enhancedDefense', 150, 210]],
    { hook: tr('Critical strikes stagger. Staggered enemies take double area damage.'), special: 'critStagger', weight: 85 }),

  u('uq.dracul', tr("Dracul's Grasp"), 'gloves.ogre', 68, 64,
    tr('The fingers close before you decide to close them.'),
    [['lifeSteal', 10, 14], ['strength', 25, 40], ['life', 150, 230], ['enhancedDefense', 180, 250],
     ['critDamage', 60, 100]],
    { hook: tr('On hit, a chance to seize the target and drain it dry.'), special: 'lifeTap', weight: 78 }),

  u('uq.arachnid', tr('Arachnid Mesh'), 'belt.spiderweb', 60, 56,
    tr('It tightens on its own, very slightly, over years.'),
    [['skillLevels', 1, 1], ['castSpeed', 22, 30], ['mana', 200, 300], ['manaRegen', 45, 70],
     ['poisonDamage', 90, 160]],
    { hook: tr('Slows every enemy within a few paces of you.'), special: 'slowAura', weight: 80 }),

  u('uq.verdungo', tr("Verdungo's Hearty Cord"), 'belt.troll', 62, 58,
    tr('The knot has never been untied and probably should not be.'),
    [['damageReduction', 14, 20], ['vitality', 30, 45], ['life', 200, 300], ['lifeRegen', 35, 55],
     ['moveSpeed', 8, 14]],
    { hook: tr('Regeneration works during combat, at full rate.'), special: 'combatRegen', weight: 82 }),

  u('uq.highlords', tr("Highlord's Wrath"), 'amulet.reliquary', 60, 56,
    tr('The Highlord was not a lord and was extremely wrathful.'),
    [['skillLevels', 1, 1], ['critChance', 12, 18], ['attackSpeed', 18, 25], ['lightningDamage', 20, 200],
     ['lightningResist', 30, 45]],
    { hook: tr('Critical chance rises with your character level.'), special: 'critPerLevel', weight: 85 }),

  u('uq.mara', tr("Mara's Kaleidoscope"), 'amulet.reliquary', 58, 54,
    tr('Look through it and everything is briefly the wrong colour.'),
    [['skillLevels', 2, 2], ['strength', 12, 20], ['dexterity', 12, 20], ['vitality', 12, 20], ['energy', 12, 20],
     ['fireResist', 35, 50], ['coldResist', 35, 50], ['lightningResist', 35, 50], ['poisonResist', 35, 50],
     ['arcaneResist', 35, 50]],
    { hook: tr('Every resistance, every attribute, all skills. Nothing wasted.'), weight: 78 }),

  u('uq.metalgrid', tr('Metalgrid'), 'amulet.sigil', 70, 66,
    tr('A lattice of wire so fine it hums in still air.'),
    [['defense', 350, 500], ['attackRating', 500, 750], ['fireResist', 30, 45], ['coldResist', 30, 45],
     ['lightningResist', 30, 45], ['poisonResist', 30, 45], ['arcaneResist', 30, 45]],
    { hook: tr('Summons a pair of iron sentries that fight for you.'), special: 'ironGolems', weight: 76 }),

  u('uq.soj', tr('Stone of Jordan'), 'ring.circle', 64, 60,
    tr('It has been used as currency more often than as jewellery.'),
    [['skillLevels', 1, 1], ['mana', 250, 380], ['lightningDamage', 10, 120], ['manaSteal', 5, 8],
     ['energy', 15, 25]],
    { hook: tr('The one ring everybody wants and nobody admits to farming for.'), weight: 75 }),

  u('uq.carrionwind', tr('Carrion Wind'), 'ring.circle', 66, 62,
    tr('The stone in it is not a stone.'),
    [['lifeSteal', 7, 10], ['poisonDamage', 100, 180], ['poisonResist', 40, 60], ['manaSteal', 4, 6],
     ['defense', 180, 260]],
    { hook: tr('A cyclone of rot follows you, feeding on the dying.'), special: 'poisonNova', weight: 78 }),

  u('uq.thunderstroke', tr('Thunderstroke'), 'spear.ghost', 70, 66,
    tr('Held upright in a storm, it does not attract lightning. It repels it, upward.'),
    [['lightningDamage', 60, 420], ['skillLevels', 2, 2], ['enhancedDamage', 220, 300], ['attackSpeed', 15, 22],
     ['lightningResist', 40, 60]],
    { hook: tr('All damage from this weapon is dealt as lightning.'), special: 'convertLightning', weight: 78 }),

  u('uq.deathsweb', tr("Death's Web"), 'wand.unearthed', 72, 68,
    tr('Every strand is a name and the list is not finished.'),
    [['skillLevels', 2, 3], ['poisonDamage', 200, 350], ['manaRegen', 60, 90], ['elementalDamagePct', 30, 45],
     ['life', -100, -50]],
    { hook: tr('Enemy poison resistance counts for nothing.'), special: 'poisonPierce', weight: 74 }),

  u('uq.eschutas', tr("Eschuta's Temper"), 'orb.eldritch', 66, 62,
    tr('Warm on one side, freezing on the other, and it rotates.'),
    [['skillLevels', 2, 2], ['elementalDamagePct', 35, 50], ['fireDamage', 100, 180], ['coldDamage', 90, 160],
     ['mana', 180, 280]],
    { hook: tr('Elemental damage scales with your energy.'), special: 'eleFromEnergy', weight: 78 }),

  u('uq.herald', tr('Herald of Zakarum'), 'shield.monarch', 68, 64,
    tr('Carried at the front of a procession that never arrived.'),
    [['blockChance', 22, 30], ['enhancedDefense', 300, 400], ['strength', 25, 40], ['life', 180, 270],
     ['damageReduction', 10, 15], ['skillLevels', 1, 2]],
    { hook: tr('Blocking restores mana and briefly reflects the blow.'), special: 'blockReflect', weight: 78 }),

  u('uq.lastwish', tr('Last Wish'), 'mace.thundermaul', 75, 71,
    tr('Granted exactly once, badly, and then kept swinging.'),
    [['enhancedDamage', 340, 440], ['critDamage', 160, 230], ['areaDamagePct', 45, 65], ['lifeSteal', 8, 12],
     ['attackSpeed', -15, -8], ['magicFind', 50, 80]],
    { hook: tr('Enemies you strike are cursed to drop more.'), special: 'wishCurse', weight: 74 }),

  // Pants.
  u('uq.wyrmhaunch', tr('Wyrmhaunch'), 'pants.drakeskin', 52, 48,
    tr('Cut from the hide of the wyrm under the Works. The hide is still warm.'),
    [['fireResist', 40, 55], ['fireDamage', 30, 60], ['life', 120, 180], ['enhancedDefense', 140, 190]],
    { hook: tr('Your hits splash molten slag.'), special: 'moltenTrail', weight: 85 }),

  u('uq.nightstride', tr('Nightstride'), 'pants.astral', 58, 54,
    tr('Sewn on the roof of the Archive, by the light of stars that are no longer there.'),
    [['skillLevels', 1, 1], ['castSpeed', 18, 26], ['mana', 120, 180], ['elementalDamagePct', 20, 30],
     ['enhancedDefense', 120, 170]],
    { hook: tr('When a hit leaves you low, you blink away.'), special: 'panicBlink', weight: 82 }),

  u('uq.lastrank', tr('The Last Rank'), 'pants.legion', 64, 60,
    tr('The last line of the old guard held the stair for nine days. These are what was left standing.'),
    [['enhancedDefense', 180, 240], ['vitality', 20, 30], ['life', 150, 230], ['damageReduction', 6, 10],
     ['physicalResist', 6, 10]],
    { hook: tr('Arrows and spells hit you for less.'), special: 'rangedDR', weight: 80 }),

  // =========================================================================
  // MYTHIC — depth 60+, roughly one in nine hundred drops.
  // =========================================================================

  m('my.griffonseye', tr("Griffon's Eye"), 'helm.diadem', 76, 72,
    tr('The lens is ground from something that was watching before it was glass.'),
    [['skillLevels', 2, 2], ['castSpeed', 30, 40], ['elementalDamagePct', 45, 60], ['lightningDamage', 100, 500],
     ['manaRegen', 60, 90]],
    { hook: tr('Enemy elemental resistance is reduced by a flat amount you can feel.'), special: 'elePierce', sockets: 1 }),

  m('my.harlequin', tr('Harlequin Crest'), 'helm.diadem', 74, 70,
    tr('The joke is old and the punchline is you.'),
    [['skillLevels', 2, 2], ['life', 300, 420], ['mana', 300, 420], ['magicFind', 70, 100],
     ['damageReduction', 10, 15], ['strength', 15, 25], ['dexterity', 15, 25], ['vitality', 15, 25], ['energy', 15, 25]],
    { hook: tr('Life, mana, skills, magic find, damage reduction — all on one head.'), sockets: 1 }),

  m('my.tyraelsmight', tr("Tyrael's Might"), 'chest.sacred', 80, 76,
    tr('Nobody has ever needed to repair it, which is the strangest part.'),
    [['enhancedDefense', 400, 520], ['strength', 30, 45], ['physicalResist', 15, 22], ['damageReduction', 18, 25],
     ['fireResist', 45, 60], ['coldResist', 45, 60], ['lightningResist', 45, 60], ['poisonResist', 45, 60],
     ['arcaneResist', 45, 60], ['moveSpeed', 15, 22]],
    { hook: tr('No strength requirement. Cannot be broken. Demons flee it.'), special: 'demonFear' }),

  m('my.chainsofhonor', tr('Chains of Honor'), 'chest.archon', 86, 82,
    tr('Each link is stamped with an oath. Most of them were kept.'),
    [['skillLevels', 2, 2], ['enhancedDefense', 420, 550], ['lifeSteal', 8, 12], ['strength', 25, 40],
     ['physicalResist', 12, 18], ['damageReduction', 14, 20], ['fireResist', 50, 65], ['coldResist', 50, 65],
     ['lightningResist', 50, 65], ['poisonResist', 50, 65], ['arcaneResist', 50, 65]],
    { hook: tr('Resistances that hold at any depth.') }),

  m('my.the-oculus', tr('The Oculus'), 'orb.vortex', 78, 74,
    tr('It blinks. Not often, and never while you are looking.'),
    [['skillLevels', 3, 3], ['castSpeed', 32, 42], ['mana', 350, 500], ['elementalDamagePct', 40, 55],
     ['magicFind', 45, 70], ['fireResist', 25, 40], ['coldResist', 25, 40], ['lightningResist', 25, 40]],
    { hook: tr('When badly hurt, teleports you somewhere else. It chooses where.'), special: 'panicBlink' }),

  m('my.wizardspike', tr('Wizardspike'), 'dagger.mindrender', 82, 78,
    tr('Held point-down it draws a circle in the dust by itself.'),
    [['castSpeed', 40, 50], ['mana', 400, 560], ['manaRegen', 80, 120], ['arcaneDamage', 250, 400],
     ['fireResist', 60, 80], ['coldResist', 60, 80], ['lightningResist', 60, 80], ['poisonResist', 60, 80],
     ['arcaneResist', 60, 80]],
    { hook: tr('Spend life instead of mana when mana runs out.'), special: 'bloodMagic' }),

  m('my.the-reapers-toll', tr("The Reaper's Toll"), 'spear.thresher', 80, 76,
    tr('The toll is collected whether or not the debt was yours.'),
    [['enhancedDamage', 360, 460], ['lifeSteal', 12, 16], ['areaDamagePct', 55, 75], ['critDamage', 150, 220],
     ['strength', 25, 40], ['attackSpeed', 12, 20]],
    { hook: tr('Strikes apply a decrepifying curse that halves enemy damage.'), special: 'decrepify' }),

  m('my.beast', tr('Beast'), 'axe.berserker', 78, 74,
    tr('The haft has teeth marks on the inside of the grip.'),
    [['enhancedDamage', 380, 480], ['attackSpeed', 35, 45], ['strength', 35, 50], ['critChance', 15, 22],
     ['lifeSteal', 8, 12], ['areaDamagePct', 30, 45]],
    { hook: tr('Permanently transforms you into something with a much larger health pool.'), special: 'werebear' }),

  m('my.iceblink', tr('Ice Blink'), 'sword.godslayer', 88, 84,
    tr('It rings once, at a pitch you feel in your teeth, and then the room is cold.'),
    [['coldDamage', 400, 700], ['enhancedDamage', 400, 520], ['critDamage', 200, 280], ['skillLevels', 1, 2],
     ['attackSpeed', 15, 25], ['coldResist', 50, 70]],
    { hook: tr('Enemies killed by cold shatter, freezing everything nearby.'), special: 'shatter' }),

  m('my.faith', tr('Faith'), 'bow.matron', 84, 80,
    tr('It is not clear who or what the faith was in, and it did not seem to matter.'),
    [['enhancedDamage', 420, 540], ['attackSpeed', 40, 52], ['skillLevels', 2, 3], ['fireDamage', 250, 450],
     ['critChance', 14, 20], ['physicalResist', 10, 15]],
    { hook: tr('Grants a permanent fanaticism aura: everything you do is faster.'), special: 'fanaticism' }),

  m('my.spirit-of-the-forge', tr('Spirit of the Forge'), 'mace.ruinhammer', 90, 86,
    tr('It was never quenched. It has been cooling for nine hundred years and is not done.'),
    [['enhancedDamage', 460, 600], ['fireDamage', 400, 700], ['areaDamagePct', 70, 95], ['strength', 40, 60],
     ['lifeSteal', 10, 14], ['attackSpeed', -20, -10]],
    { hook: tr('Every swing leaves a lasting pool of molten slag.'), special: 'moltenTrail' }),

  m('my.nightwing', tr("Nightwing's Veil"), 'helm.diadem', 76, 72,
    tr('Thin enough to read through, and you should not.'),
    [['skillLevels', 2, 2], ['coldDamage', 200, 340], ['elementalDamagePct', 35, 50], ['dexterity', 20, 32],
     ['enhancedDefense', 220, 300], ['critDamage', 100, 150]],
    { hook: tr('Enemy cold resistance is halved.'), special: 'coldPierce', sockets: 1 }),

  m('my.stoneofthevoid', tr('Stone of the Void'), 'ring.halo', 82, 78,
    tr('It weighs nothing at all, and your hand still knows it is there.'),
    [['skillLevels', 2, 2], ['arcaneDamage', 200, 340], ['arcaneResist', 60, 85], ['cooldownReduction', 20, 28],
     ['mana', 300, 450], ['manaSteal', 6, 9]],
    { hook: tr('Cooldowns tick while you are casting.'), special: 'voidCooldown' }),

  m('my.seraphshymn', tr("Seraph's Hymn"), 'amulet.heartstone', 88, 84,
    tr('It sings when carried and stops the moment you set it down.'),
    [['skillLevels', 3, 3], ['castSpeed', 30, 42], ['lifeRegen', 80, 120], ['manaRegen', 100, 150],
     ['life', 250, 380], ['mana', 250, 380], ['cooldownReduction', 18, 25]],
    { hook: tr('Allied summons and party members inherit half your regeneration.'), special: 'hymnAura' }),

  m('my.rootbound', tr('Rootbound'), 'pants.legion', 76, 72,
    tr('Caul planted a tree where the dead lay. The roots came up through the floor and into these.'),
    [['life', 300, 420], ['vitality', 30, 45], ['damageReduction', 12, 18], ['physicalResist', 10, 15],
     ['fireResist', 30, 45], ['coldResist', 30, 45], ['lightningResist', 30, 45], ['poisonResist', 30, 45]],
    { hook: tr('You heal a share of your life every second, in a fight or out of one.'), special: 'combatRegen', sockets: 1 }),

  // =========================================================================
  // ANCIENT — depth 80+, boss-weighted, roughly one in nine thousand.
  // =========================================================================

  a('an.worldbreaker', tr('Worldbreaker'), 'axe.worldcleaver', 92, 88,
    tr('It has been used to open exactly three things: a gate, a mountain, and a god.'),
    [['enhancedDamage', 620, 800], ['areaDamagePct', 110, 150], ['strength', 60, 85], ['critDamage', 250, 340],
     ['lifeSteal', 12, 18], ['physicalResist', 15, 22], ['maxDamage', 200, 300]],
    { hook: tr('Swings cleave the whole arc in front of you and stagger everything they touch.'), special: 'worldCleave', sockets: 2 }),

  a('an.the-long-noon', tr('The Long Noon'), 'sword.sunblade', 90, 86,
    tr('Held up at midnight it casts a shadow anyway, from the wrong direction.'),
    [['fireDamage', 600, 950], ['enhancedDamage', 520, 680], ['attackSpeed', 30, 42], ['elementalDamagePct', 60, 80],
     ['lifeRegen', 90, 130], ['skillLevels', 2, 3]],
    { hook: tr('All damage becomes fire, and fire damage cannot be resisted below 25%.'), special: 'convertFirePierce', sockets: 1 }),

  a('an.eternity', tr('Eternity'), 'ring.eternity', 94, 90,
    tr('A loop with no join. Turning it does nothing and everyone tries.'),
    [['skillLevels', 3, 3], ['cooldownReduction', 32, 42], ['life', 400, 560], ['mana', 400, 560],
     ['critChance', 15, 22], ['magicFind', 90, 130], ['damageReduction', 12, 18]],
    { hook: tr('Once every ninety seconds, death is declined.'), special: 'cheatDeath' }),

  a('an.the-first-word', tr('The First Word'), 'staff.worldtree', 95, 90,
    tr('Somebody said something, once, and everything after that was consequences.'),
    [['skillLevels', 4, 5], ['castSpeed', 45, 58], ['elementalDamagePct', 80, 110], ['mana', 600, 850],
     ['manaRegen', 140, 200], ['cooldownReduction', 25, 35], ['arcaneDamage', 500, 800]],
    { hook: tr('Every spell you cast is cast a second time, at half strength, one beat later.'), special: 'echo', sockets: 2 }),

  a('an.mourning-star', tr('Mourning Star'), 'mace.sanctified', 92, 88,
    tr('A funeral weapon. It was carried at the front, not used.'),
    [['enhancedDamage', 500, 650], ['lifeSteal', 16, 22], ['critDamage', 220, 300], ['life', 400, 550],
     ['damageReduction', 14, 20], ['attackSpeed', 20, 30], ['physicalResist', 12, 18]],
    { hook: tr('Life stolen above your maximum becomes a shield instead of being wasted.'), special: 'overhealShield', sockets: 1 }),

  a('an.the-hollow-crown', tr('The Hollow Crown'), 'helm.corona', 96, 92,
    tr('It fits nobody. It has never fitted anybody. People keep putting it on.'),
    [['skillLevels', 3, 4], ['damageReduction', 22, 30], ['physicalResist', 18, 25], ['enhancedDefense', 480, 620],
     ['magicFind', 110, 160], ['life', -400, -200], ['fireResist', 55, 75], ['coldResist', 55, 75],
     ['lightningResist', 55, 75], ['poisonResist', 55, 75], ['arcaneResist', 55, 75]],
    { hook: tr('Costs you a great deal of life and gives you everything else.'), special: 'hollowPact', sockets: 3 }),

  a('an.godsblood-shroud', tr('Shroud of the Sleeping God'), 'chest.aeonshroud', 94, 90,
    tr('It is breathing. Slowly. You will get used to it.'),
    [['skillLevels', 3, 4], ['mana', 700, 950], ['manaRegen', 160, 220], ['castSpeed', 40, 52],
     ['elementalDamagePct', 55, 75], ['arcaneResist', 70, 95], ['damageReduction', 10, 16],
     ['cooldownReduction', 20, 28]],
    { hook: tr('Your mana pool is also your life pool. Nothing else can hurt you.'), special: 'mythicManaShield', sockets: 2 }),
  a('an.spirefoot', tr('Spirefoot'), 'pants.titan', 92, 88,
    tr('The Spire stands on two legs of stone. These were cut from the same quarry, and they have not moved either.'),
    [['life', 500, 700], ['vitality', 50, 70], ['damageReduction', 18, 25], ['physicalResist', 15, 22],
     ['enhancedDefense', 450, 600], ['moveSpeed', 15, 22], ['skillLevels', 2, 2]],
    { hook: tr('Once every ninety seconds, death is declined.'), special: 'cheatDeath', sockets: 2 }),

  // =========================================================================
  // CHARMS. They work from the pack; only one copy of each counts.
  // =========================================================================

  u('uq.charm.widowpebble', tr('The Widow\'s Pebble'), 'charm.small', 10, 9,
    tr('Maudie Thorn kept it in her cheek the winter her husband went down the stairs, so she would not say his name aloud.'),
    [['life', 18, 28], ['magicFind', 7, 11], ['lightningResist', 8, 12]],
    { weight: 100 }),

  u('uq.charm.emberstone', tr('Ember in a Stone'), 'charm.small', 30, 27,
    tr('Picked out of the kiln after the potter\'s house burned. It is still warm, and it is still angry.'),
    [['fireDamage', 5, 11], ['fireResist', 12, 18], ['life', 22, 32]],
    { weight: 100 }),

  u('uq.charm.pellmother', tr('Pellmother\'s Eye'), 'charm.small', 62, 56,
    tr('The old woman by the well read fortunes with it, and only ever told the bad ones.'),
    [['critChance', 2, 3], ['attackRating', 70, 110], ['life', 30, 42], ['coldResist', 6, 9], ['poisonResist', 6, 9]],
    { weight: 100 }),

  u('uq.charm.corranfingers', tr('Two Fingers of Ash Corran'), 'charm.medium', 18, 16,
    tr('Corran held the gate alone for a night. In the morning these were what they found of him, still pointing down.'),
    [['strength', 6, 9], ['dexterity', 6, 9], ['life', 28, 42], ['attackRating', 40, 70]],
    { weight: 100 }),

  u('uq.charm.hangknot', tr('The Hangman\'s Knot'), 'charm.medium', 40, 36,
    tr('Cut from the gallows on the fen when the rope was replaced. The new rope never held as well.'),
    [['lifeSteal', 2, 3], ['maxDamage', 6, 10], ['poisonResist', 15, 22]],
    { weight: 100 }),

  u('uq.charm.lanternmoth', tr('Lantern-Moth Fetish'), 'charm.medium', 64, 58,
    tr('Moths came to the lamp in the low tunnels and would not leave. Someone tied them to a bone so they would at least be useful.'),
    [['moveSpeed', 5, 7], ['mana', 40, 60], ['coldResist', 12, 16], ['lightningResist', 12, 16], ['magicFind', 14, 20]],
    { weight: 100 }),

  u('uq.charm.ninthbell', tr('Plaque of the Ninth Bell'), 'charm.large', 26, 23,
    tr('There were nine bells in the chapel tower. Eight were melted for blades. The ninth asked to be left alone.'),
    [['defense', 60, 90], ['vitality', 8, 12], ['fireResist', 8, 12], ['coldResist', 8, 12], ['lightningResist', 8, 12]],
    { weight: 100 }),

  u('uq.charm.saltwife', tr('Saltwife\'s Tally'), 'charm.large', 48, 44,
    tr('A bone scored with every coin she was ever owed. She was owed a great many, and she collected.'),
    [['goldFind', 30, 45], ['magicFind', 20, 30], ['life', 48, 68]],
    { weight: 100 }),

  u('uq.charm.mutepsalm', tr('The Mute Psalm'), 'charm.large', 70, 64,
    tr('The words were scraped off the bone one at a time by a monk who had taken a vow of silence and regretted it.'),
    [['energy', 14, 20], ['mana', 70, 90], ['castSpeed', 6, 8], ['lightningDamage', 10, 38]],
    { weight: 100 }),

  u('uq.charm.drownedidol', tr('The Drowned Idol'), 'charm.grand', 40, 36,
    tr('The fen took the lower village in one night. The idol was the only thing that floated back.'),
    [['skillLevels', 1, 1], ['life', 60, 90], ['fireResist', 10, 14], ['coldResist', 10, 14], ['lightningResist', 10, 14], ['poisonResist', 10, 14]],
    { weight: 100 }),

  u('uq.charm.lastherd', tr('Horn of the Last Herd'), 'charm.grand', 66, 60,
    tr('The herders blew it to call the cattle home off the hill. The last time it was blown, something else came.'),
    [['skillLevels', 1, 1], ['strength', 14, 20], ['vitality', 14, 20], ['enhancedDamage', 20, 30], ['critDamage', 14, 22]],
    { weight: 100 }),

  u('uq.charm.ninateeth', tr('Crown of Nine Teeth'), 'charm.grand', 86, 80,
    tr('Nine teeth from nine mouths that each tried to bite the same watchman. He kept them, strung them, and wore his luck.'),
    [['skillLevels', 1, 1], ['strength', 12, 18], ['dexterity', 12, 18], ['vitality', 12, 18], ['energy', 12, 18], ['fireResist', 15, 20], ['coldResist', 15, 20], ['lightningResist', 15, 20], ['poisonResist', 15, 20], ['magicFind', 12, 18], ['life', 80, 120]],
    { weight: 100 }),
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

// The depth plan's uniques (data/uniqueBatches/*.ts), slot by slot.
UNIQUES.push(...DEPTH_UNIQUES);

// Names, flavour and hook wording come from the story (data/story/uniqueText.ts).
applyUniqueText(UNIQUES);

// A skill bender's hook is written from its numbers, so it cannot drift.
for (const d of UNIQUES) if (d.bend) d.hook = bendText(d.bend);

const BY_ID = new Map<string, UniqueDef>(UNIQUES.map((x) => [x.id, x]));
setBendLookup((id) => BY_ID.get(id)?.bend);

export function getUnique(id: string): UniqueDef | undefined {
  return BY_ID.get(id);
}

const BY_BASE = new Map<string, UniqueDef[]>();
for (const def of UNIQUES) {
  const list = BY_BASE.get(def.baseId);
  if (list) list.push(def);
  else BY_BASE.set(def.baseId, [def]);
}

export function uniquesForBase(baseId: string): UniqueDef[] {
  return BY_BASE.get(baseId) ?? [];
}

/** All uniques of a rarity tier that may drop at this item level. */
export function uniquePool(rarity: UniqueDef['rarity'], ilvl: number): UniqueDef[] {
  return UNIQUES.filter((x) => x.rarity === rarity && x.ilvl <= ilvl + 4);
}

/**
 * Drop weight. Older uniques stay in the pool forever (you can still find
 * Rixot's Keen at depth 90 — it is just worthless), but they fade hard so the
 * deep table is dominated by things worth picking up.
 */
export function uniqueDropWeight(def: UniqueDef, ilvl: number): number {
  if (def.ilvl > ilvl + 4) return 0;
  const over = ilvl - def.ilvl;
  if (over <= 20) return def.weight;
  return Math.max(def.weight * 0.05, def.weight * (1 - (over - 20) * 0.035));
}

export const UNIQUE_COUNT = UNIQUES.length;
