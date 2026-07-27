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

import type { ItemMod, ItemRarity, StatKey } from '../types';

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
}

function u(
  id: string,
  name: string,
  baseId: string,
  ilvl: number,
  levelReq: number,
  flavor: string,
  mods: Array<[StatKey, number, number]>,
  o: { hook?: string; sockets?: number; weight?: number; special?: string; rarity?: UniqueDef['rarity'] } = {},
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
  return def;
}

const m = (id: string, name: string, baseId: string, ilvl: number, levelReq: number, flavor: string,
  mods: Array<[StatKey, number, number]>, o: Parameters<typeof u>[6] = {}) =>
  u(id, name, baseId, ilvl, levelReq, flavor, mods, { ...o, rarity: 'mythic', weight: o.weight ?? 60 });

const a = (id: string, name: string, baseId: string, ilvl: number, levelReq: number, flavor: string,
  mods: Array<[StatKey, number, number]>, o: Parameters<typeof u>[6] = {}) =>
  u(id, name, baseId, ilvl, levelReq, flavor, mods, { ...o, rarity: 'ancient', weight: o.weight ?? 30 });

export const UNIQUES: UniqueDef[] = [
  // =========================================================================
  // EARLY — levels 1-20. Small, weird, and often better than they look.
  // =========================================================================

  u('uq.rixots', "Rixot's Keen", 'sword.short', 4, 4,
    'Rixot sharpened it every night for thirty years and died of a cough.',
    [['minDamage', 4, 6], ['maxDamage', 8, 12], ['attackRating', 40, 70], ['critChance', 3, 5]],
    { hook: 'The edge does not dull.', weight: 120 }),

  u('uq.felloak', 'Felloak', 'mace.club', 6, 5,
    'Cut from a tree that was already burning and never stopped.',
    [['fireDamage', 12, 20], ['enhancedDamage', 40, 60], ['fireResist', 20, 30], ['strength', 4, 7]],
    { hook: 'Burns through the swing.', weight: 110 }),

  u('uq.gnasher', 'The Gnasher', 'axe.hand', 7, 6,
    'Something chewed the haft to fit its own jaw. It fits yours too.',
    [['enhancedDamage', 60, 90], ['areaDamagePct', 15, 25], ['maxDamage', 6, 10], ['lifeSteal', 2, 3]],
    { hook: 'Every hit takes a bite.', weight: 100 }),

  u('uq.hotspur', 'Hotspur', 'boots.boots', 9, 8,
    'The previous owner walked out of a foundry and kept walking.',
    [['fireDamage', 8, 16], ['fireResist', 25, 40], ['life', 20, 35], ['moveSpeed', 8, 12]],
    { hook: 'Leaves a warm print on stone.', weight: 110 }),

  u('uq.pluckeye', 'Pluckeye', 'bow.short', 8, 7,
    'Named for what it does, not for who made it.',
    [['attackRating', 90, 150], ['critChance', 5, 8], ['lifeSteal', 2, 4], ['dexterity', 5, 9]],
    { hook: 'Aims a little on its own.', weight: 100 }),

  u('uq.greyform', 'Greyform', 'chest.leather', 11, 10,
    'A hide so dull the eye slides off it.',
    [['enhancedDefense', 60, 90], ['lifeSteal', 2, 4], ['coldResist', 20, 30], ['dexterity', 6, 10],
     ['magicFind', 8, 14]],
    { hook: 'Hard to look at directly.', weight: 100 }),

  u('uq.jadetando', 'The Jade Tan Do', 'dagger.dagger', 12, 10,
    'A blade for people who intend to be the last one standing, not the first one moving.',
    [['poisonDamage', 20, 34], ['poisonResist', 60, 80], ['life', 25, 45], ['manaSteal', 2, 3]],
    { hook: 'Poison in your veins works for you instead.', special: 'poisonImmuneFeedback', weight: 90 }),

  u('uq.wormskull', 'Wormskull', 'helm.bone', 13, 12,
    'It fits every head. That is the least strange thing about it.',
    [['skillLevels', 1, 1], ['poisonDamage', 14, 26], ['manaSteal', 2, 3], ['life', -25, -12],
     ['poisonResist', 20, 30]],
    { hook: 'Costs you a little life to wear. Worth it.', weight: 95 }),

  u('uq.steelclash', 'Steelclash', 'shield.small', 14, 12,
    'Rings like a bell struck badly, and the ringing is the point.',
    [['blockChance', 10, 15], ['enhancedDefense', 70, 110], ['fireResist', 20, 30], ['coldResist', 20, 30],
     ['lightningResist', 20, 30], ['damageReduction', 2, 4]],
    { hook: 'Answers every blow with a note.', weight: 100 }),

  u('uq.nightsmoke', 'Nightsmoke', 'belt.sash', 16, 15,
    'Woven from something that used to be weather.',
    [['damageReduction', 3, 5], ['mana', 40, 70], ['manaRegen', 15, 25], ['physicalResist', 3, 6],
     ['arcaneResist', 20, 35]],
    { hook: 'Half the damage you take is paid in mana.', special: 'manaShield', weight: 95 }),

  u('uq.bloodrise', 'Bloodrise', 'mace.mace', 15, 13,
    'It is heavier after a fight than before one.',
    [['lifeSteal', 5, 7], ['enhancedDamage', 55, 85], ['attackRating', 80, 130], ['lifeRegen', -8, -4]],
    { hook: 'You do not heal on your own any more. You do not need to.', weight: 90 }),

  u('uq.civerbs', "Civerb's Cudgel", 'mace.club', 18, 16,
    'A relic of an order that no longer exists and was not much liked when it did.',
    [['enhancedDamage', 90, 130], ['arcaneDamage', 15, 28], ['skillLevels', 1, 1], ['mana', -40, -20]],
    { hook: 'Devastating against the undead, awkward against everything else.', special: 'undeadSlayer', weight: 85 }),

  // =========================================================================
  // MID — levels 20-50. Where builds start committing to a direction.
  // =========================================================================

  u('uq.gorefoot', 'Gorefoot', 'boots.heavy', 22, 20,
    'The tread pattern is not a tread pattern.',
    [['moveSpeed', 15, 22], ['lifeSteal', 3, 5], ['attackSpeed', 10, 15], ['maxDamage', 10, 18]],
    { hook: 'Faster the longer you stay in melee.', special: 'momentum', weight: 100 }),

  u('uq.venomward', 'Venom Ward', 'shield.kite', 24, 22,
    'Green stains that will not come off, and never needed to.',
    [['poisonResist', 70, 95], ['enhancedDefense', 100, 150], ['blockChance', 8, 12], ['poisonDamage', 30, 55],
     ['life', 50, 90]],
    { hook: 'Poison resistance can exceed the normal cap.', special: 'poisonOvercap', weight: 95 }),

  u('uq.skystrike', 'Skystrike', 'bow.long', 26, 24,
    'Loosed once at a storm. The storm moved.',
    [['lightningDamage', 20, 90], ['skillLevels', 1, 1], ['attackSpeed', 12, 18], ['dexterity', 12, 20],
     ['elementalDamagePct', 12, 20]],
    { hook: 'Arrows fork on impact.', special: 'chainLightning', weight: 95 }),

  u('uq.hexfire', 'Hexfire', 'sword.gladius', 28, 25,
    'It has a fever and it is contagious.',
    [['fireDamage', 55, 95], ['enhancedDamage', 100, 150], ['elementalDamagePct', 18, 28], ['fireResist', -20, -10]],
    { hook: 'All physical damage from this weapon is dealt as fire.', special: 'convertFire', weight: 90 }),

  u('uq.frostwind', 'Frostwind', 'sword.broad', 30, 27,
    'The scabbard cracked from the inside within a week.',
    [['coldDamage', 60, 110], ['enhancedDamage', 90, 140], ['coldResist', 25, 40], ['attackSpeed', -12, -6],
     ['critDamage', 40, 70]],
    { hook: 'Slower swings, and everything you touch slows with you.', special: 'chillOnHit', weight: 90 }),

  u('uq.duskdeep', 'Duskdeep', 'helm.full', 32, 30,
    'The visor slot is welded shut. It has been for a long time.',
    [['enhancedDefense', 110, 160], ['damageReduction', 5, 8], ['maxDamage', 14, 24], ['life', 60, 100],
     ['magicFind', -15, -8]],
    { hook: 'You see less. Considerably less hits you.', weight: 95 }),

  u('uq.magefist', 'Magefist', 'gloves.silk', 34, 30,
    'The fingertips are permanently scorched from the inside.',
    [['castSpeed', 18, 25], ['fireDamage', 40, 70], ['manaRegen', 30, 45], ['skillLevels', 1, 1]],
    { hook: 'Fire spells cost no mana below half your pool.', special: 'fireFree', weight: 90 }),

  u('uq.frostburn', 'Frostburn', 'gloves.heavy', 36, 32,
    'Both hands ache. Neither hand is cold.',
    [['mana', 120, 190], ['coldDamage', 45, 80], ['castSpeed', 12, 18], ['manaSteal', 3, 5]],
    { hook: 'Mana pool counts double for anything that scales off it.', special: 'manaScale', weight: 90 }),

  u('uq.stormchaser', 'Stormchaser', 'staff.cedar', 38, 34,
    'It points at weather. Not always the weather you can see.',
    [['lightningDamage', 30, 160], ['skillLevels', 2, 2], ['castSpeed', 20, 28], ['lightningResist', 30, 45],
     ['manaRegen', 40, 60]],
    { hook: 'Lightning damage rolls are never low.', special: 'lightningFloor', weight: 85 }),

  u('uq.rockstopper', 'Rockstopper', 'helm.skullcap', 35, 31,
    'Dented in exactly one place, very deeply.',
    [['enhancedDefense', 150, 210], ['damageReduction', 8, 12], ['fireResist', 30, 45], ['coldResist', 30, 45],
     ['lightningResist', 30, 45], ['vitality', 15, 25]],
    { hook: 'Whatever hit it first, it stopped.', weight: 95 }),

  u('uq.goldwrap', 'Goldwrap', 'belt.girdle', 33, 30,
    'The buckle is worth more than most of what it has held up.',
    [['goldFind', 120, 180], ['magicFind', 20, 30], ['defense', 40, 70], ['attackSpeed', 10, 15]],
    { hook: 'Gold you pick up trickles back as life.', special: 'goldToLife', weight: 100 }),

  u('uq.nagelring', 'Nagelring', 'ring.signet', 30, 26,
    'Cheap metal, unreasonable luck.',
    [['magicFind', 30, 45], ['attackRating', 100, 170], ['damageReduction', 2, 4], ['strength', 6, 10]],
    { hook: 'Worn in pairs by people with more optimism than sense.', weight: 110 }),

  u('uq.manald', 'Manald Heal', 'ring.signet', 32, 28,
    'A physician made it. The physician is still alive, somewhere.',
    [['manaRegen', 50, 75], ['lifeRegen', 20, 30], ['mana', 60, 100], ['manaSteal', 2, 4]],
    { hook: 'Every lightning hit refunds mana.', special: 'manaldHeal', weight: 100 }),

  u('uq.cleglaw', "Cleglaw's Tooth", 'sword.foil', 40, 36,
    'A duelling blade for a duel nobody agreed to.',
    [['attackRating', 250, 400], ['critChance', 8, 12], ['critDamage', 60, 95], ['enhancedDamage', 80, 120],
     ['lifeSteal', 3, 5]],
    { hook: 'Critical strikes cannot be blocked.', special: 'unblockableCrit', weight: 90 }),

  u('uq.buriza', 'Buriza-Do Kyanon', 'xbow.siege', 42, 38,
    'Loaded once, at the top of a mountain, by someone who never came down.',
    [['coldDamage', 90, 160], ['critDamage', 100, 150], ['enhancedDamage', 140, 200], ['attackSpeed', -10, -5]],
    { hook: 'Bolts pierce through every target in the line.', special: 'pierce', weight: 85 }),

  u('uq.titans', "Titan's Revenge", 'spear.warspear', 44, 40,
    'Thrown at a giant. Came back. The giant did not.',
    [['strength', 25, 40], ['enhancedDamage', 150, 210], ['attackSpeed', 15, 22], ['areaDamagePct', 25, 40],
     ['life', 90, 150]],
    { hook: 'Returns to your hand.', special: 'returning', weight: 85 }),

  u('uq.stormshield', 'Stormshield', 'shield.tower', 46, 42,
    'The straps have been replaced eleven times. The face never has.',
    [['damageReduction', 12, 18], ['physicalResist', 12, 18], ['blockChance', 15, 22], ['strength', 20, 30],
     ['lightningResist', 40, 60], ['moveSpeed', -8, -4]],
    { hook: 'You will not be moved, and you will not move quickly.', weight: 85 }),

  u('uq.shaftstop', 'Shaftstop', 'chest.gothic', 48, 44,
    'Arrows come out of it if you shake it hard enough.',
    [['enhancedDefense', 200, 280], ['damageReduction', 14, 20], ['life', 140, 220], ['physicalResist', 8, 12]],
    { hook: 'Ranged attacks against you lose their edge.', special: 'rangedDR', weight: 90 }),

  u('uq.gazehell', 'Gaze of the Hell Wyrm', 'helm.grim', 45, 41,
    'It has been looking at something ever since it was made. Not at you.',
    [['fireDamage', 80, 140], ['skillLevels', 1, 2], ['fireResist', 40, 60], ['elementalDamagePct', 20, 30],
     ['life', -60, -30]],
    { hook: 'Enemies you burn burn each other.', special: 'fireSpread', weight: 85 }),

  u('uq.silkweave', 'Silkweave', 'boots.scarabshell', 40, 36,
    'Every thread is a spider that agreed to stop being a spider.',
    [['moveSpeed', 22, 30], ['mana', 100, 160], ['manaRegen', 35, 55], ['dexterity', 15, 25],
     ['poisonResist', 30, 45]],
    { hook: 'Mana regenerates faster the faster you move.', special: 'runManaRegen', weight: 95 }),

  u('uq.chancecast', 'Chance Guard', 'gloves.gauntlets', 36, 32,
    'A gambler had them made. Nobody knows if it worked out.',
    [['magicFind', 40, 60], ['goldFind', 150, 220], ['defense', 40, 70], ['attackRating', 100, 160]],
    { hook: 'Fortune favours the well-dressed.', weight: 105 }),

  u('uq.ravenfrost', 'Raven Frost', 'ring.band', 45, 40,
    'Cold to hold, and it does not warm up.',
    [['coldDamage', 40, 80], ['dexterity', 15, 25], ['attackRating', 180, 280], ['coldResist', 30, 45],
     ['mana', 60, 100]],
    { hook: 'You cannot be frozen.', special: 'freezeImmune', weight: 95 }),

  u('uq.bulkathos', "Bul-Kathos' Wedding Band", 'ring.band', 48, 43,
    'A marriage that outlived both parties and most of the kingdom.',
    [['skillLevels', 1, 1], ['life', 90, 150], ['lifeSteal', 4, 6], ['strength', 12, 20]],
    { hook: 'Your maximum life rises with every level you gain, twice over.', special: 'lifePerLevel', weight: 85 }),

  u('uq.thegravenspine', 'The Graven Spine', 'staff.war', 46, 42,
    'Every knot in the wood is a face, and they are all listening.',
    [['skillLevels', 2, 2], ['arcaneDamage', 70, 130], ['manaRegen', 55, 80], ['castSpeed', 22, 30],
     ['life', -80, -40]],
    { hook: 'Summons cost half as much and die twice as fast.', special: 'summonGlass', weight: 85 }),

  u('uq.widowmaker', 'Widowmaker', 'bow.composite', 43, 39,
    'The fletching is human hair. It was donated.',
    [['critChance', 12, 18], ['critDamage', 90, 140], ['enhancedDamage', 130, 190], ['attackSpeed', 12, 18],
     ['lifeSteal', -4, -2]],
    { hook: 'Critical strikes cannot heal you. Nothing else matters.', special: 'noCritLeech', weight: 85 }),

  u('uq.hellslayer', 'Hellslayer', 'axe.ettin', 47, 43,
    'Two hands, one purpose, no second opinion.',
    [['enhancedDamage', 190, 260], ['fireDamage', 100, 180], ['strength', 20, 32], ['areaDamagePct', 30, 45],
     ['lifeSteal', 4, 7]],
    { hook: 'Overkill damage splashes onto everything nearby.', special: 'overkillSplash', weight: 85 }),

  u('uq.spectralshard', 'Spectral Shard', 'dagger.blade', 41, 37,
    'Half of it is missing and it works better that way.',
    [['castSpeed', 28, 38], ['mana', 130, 200], ['skillLevels', 1, 1], ['arcaneResist', 40, 60],
     ['critChance', 6, 10]],
    { hook: 'The fastest caster weapon in the game, and it barely cuts.', weight: 90 }),

  // =========================================================================
  // LATE — levels 50-75. Fully-formed build engines.
  // =========================================================================

  u('uq.windforce', 'Windforce', 'bow.hydra', 72, 68,
    'The draw makes a sound like a door opening somewhere behind you.',
    [['enhancedDamage', 260, 340], ['attackSpeed', 25, 35], ['maxDamage', 90, 140], ['lifeSteal', 6, 9],
     ['dexterity', 25, 40], ['areaDamagePct', 25, 40]],
    { hook: 'Every shot knocks its target back.', special: 'knockback', weight: 80 }),

  u('uq.doombringer', 'Doombringer', 'sword.conquest', 62, 58,
    'It was named optimistically and then lived up to it.',
    [['enhancedDamage', 250, 330], ['lifeSteal', 8, 12], ['critDamage', 130, 190], ['strength', 20, 32],
     ['physicalResist', 8, 12]],
    { hook: 'Enemies you kill explode for a share of their life.', special: 'corpseBurst', weight: 80 }),

  u('uq.griswold', "Griswold's Edge", 'sword.falchion', 54, 50,
    'The smith kept the best one. Obviously.',
    [['fireDamage', 120, 200], ['enhancedDamage', 200, 270], ['attackSpeed', 18, 26], ['fireResist', 35, 50],
     ['lifeRegen', 25, 40]],
    { hook: 'Ignites the ground where you fight.', special: 'groundFire', weight: 85 }),

  u('uq.azurewrath', 'Azurewrath', 'sword.phase', 80, 76,
    'It does not reflect torchlight. It replaces it.',
    [['coldDamage', 200, 340], ['arcaneDamage', 150, 260], ['enhancedDamage', 240, 320], ['skillLevels', 1, 2],
     ['attackSpeed', 20, 28], ['elementalDamagePct', 25, 40]],
    { hook: 'Physical damage is split evenly between cold and arcane.', special: 'convertColdArcane', weight: 70 }),

  u('uq.arreatsface', "Arreat's Face", 'helm.spired', 64, 60,
    'A mask of a mountain, worn by people who wanted to be one.',
    [['skillLevels', 2, 2], ['enhancedDefense', 220, 300], ['lifeSteal', 5, 8], ['strength', 20, 32],
     ['dexterity', 20, 32], ['damageReduction', 8, 12]],
    { hook: 'The best all-round helm in the game and nobody argues.', weight: 80 }),

  u('uq.crownofages', 'Crown of Ages', 'helm.corona', 86, 82,
    'Six kings. One crown. Nobody kept it long.',
    [['skillLevels', 1, 2], ['damageReduction', 15, 22], ['physicalResist', 12, 18], ['enhancedDefense', 260, 350],
     ['fireResist', 35, 50], ['coldResist', 35, 50], ['lightningResist', 35, 50], ['poisonResist', 35, 50]],
    { hook: 'Two extra sockets, and it needs them.', sockets: 2, weight: 70 }),

  u('uq.leviathan', 'Leviathan', 'chest.kraken', 66, 62,
    'Salt still crusts the seams. The sea it came out of is inland now.',
    [['enhancedDefense', 320, 420], ['damageReduction', 16, 22], ['strength', 30, 45], ['life', 220, 330],
     ['moveSpeed', -10, -5]],
    { hook: 'You are a wall. Walls do not sprint.', weight: 80 }),

  u('uq.skinofvipermagi', 'Skin of the Vipermagi', 'chest.dusk', 55, 51,
    'Shed, not skinned. The magus is still out there, larger.',
    [['skillLevels', 1, 1], ['castSpeed', 28, 38], ['fireResist', 30, 45], ['coldResist', 30, 45],
     ['lightningResist', 30, 45], ['poisonResist', 30, 45], ['arcaneResist', 30, 45], ['enhancedDefense', 140, 200]],
    { hook: 'The caster chest, from level 51 to the end of the game.', weight: 85 }),

  u('uq.warTraveler', 'War Traveler', 'boots.war', 58, 54,
    'The soles have been resoled by four different cobblers on three continents.',
    [['magicFind', 55, 80], ['moveSpeed', 18, 26], ['strength', 12, 20], ['vitality', 12, 20],
     ['maxDamage', 30, 55], ['enhancedDefense', 130, 190]],
    { hook: 'Magic find that does not cost you a damage slot.', weight: 85 }),

  u('uq.gorerider', 'Gore Rider', 'boots.sharkskin', 52, 48,
    'The spurs are not decorative and were not originally metal.',
    [['moveSpeed', 25, 34], ['critChance', 10, 15], ['attackSpeed', 12, 18], ['areaDamagePct', 20, 30],
     ['enhancedDefense', 150, 210]],
    { hook: 'Critical strikes stagger. Staggered enemies take double area damage.', special: 'critStagger', weight: 85 }),

  u('uq.dracul', "Dracul's Grasp", 'gloves.ogre', 68, 64,
    'The fingers close before you decide to close them.',
    [['lifeSteal', 10, 14], ['strength', 25, 40], ['life', 150, 230], ['enhancedDefense', 180, 250],
     ['critDamage', 60, 100]],
    { hook: 'On hit, a chance to seize the target and drain it dry.', special: 'lifeTap', weight: 78 }),

  u('uq.arachnid', 'Arachnid Mesh', 'belt.spiderweb', 60, 56,
    'It tightens on its own, very slightly, over years.',
    [['skillLevels', 1, 1], ['castSpeed', 22, 30], ['mana', 200, 300], ['manaRegen', 45, 70],
     ['poisonDamage', 90, 160]],
    { hook: 'Slows every enemy within a few paces of you.', special: 'slowAura', weight: 80 }),

  u('uq.verdungo', "Verdungo's Hearty Cord", 'belt.troll', 62, 58,
    'The knot has never been untied and probably should not be.',
    [['damageReduction', 14, 20], ['vitality', 30, 45], ['life', 200, 300], ['lifeRegen', 35, 55],
     ['moveSpeed', 8, 14]],
    { hook: 'Regeneration works during combat, at full rate.', special: 'combatRegen', weight: 82 }),

  u('uq.highlords', "Highlord's Wrath", 'amulet.reliquary', 60, 56,
    'The Highlord was not a lord and was extremely wrathful.',
    [['skillLevels', 1, 1], ['critChance', 12, 18], ['attackSpeed', 18, 25], ['lightningDamage', 20, 200],
     ['lightningResist', 30, 45]],
    { hook: 'Critical chance rises with your character level.', special: 'critPerLevel', weight: 85 }),

  u('uq.mara', "Mara's Kaleidoscope", 'amulet.reliquary', 58, 54,
    'Look through it and everything is briefly the wrong colour.',
    [['skillLevels', 2, 2], ['strength', 12, 20], ['dexterity', 12, 20], ['vitality', 12, 20], ['energy', 12, 20],
     ['fireResist', 35, 50], ['coldResist', 35, 50], ['lightningResist', 35, 50], ['poisonResist', 35, 50],
     ['arcaneResist', 35, 50]],
    { hook: 'Every resistance, every attribute, all skills. Nothing wasted.', weight: 78 }),

  u('uq.metalgrid', 'Metalgrid', 'amulet.sigil', 70, 66,
    'A lattice of wire so fine it hums in still air.',
    [['defense', 350, 500], ['attackRating', 500, 750], ['fireResist', 30, 45], ['coldResist', 30, 45],
     ['lightningResist', 30, 45], ['poisonResist', 30, 45], ['arcaneResist', 30, 45]],
    { hook: 'Summons a pair of iron sentries that fight for you.', special: 'ironGolems', weight: 76 }),

  u('uq.soj', 'Stone of Jordan', 'ring.circle', 64, 60,
    'It has been used as currency more often than as jewellery.',
    [['skillLevels', 1, 1], ['mana', 250, 380], ['lightningDamage', 10, 120], ['manaSteal', 5, 8],
     ['energy', 15, 25]],
    { hook: 'The one ring everybody wants and nobody admits to farming for.', weight: 75 }),

  u('uq.carrionwind', 'Carrion Wind', 'ring.circle', 66, 62,
    'The stone in it is not a stone.',
    [['lifeSteal', 7, 10], ['poisonDamage', 100, 180], ['poisonResist', 40, 60], ['manaSteal', 4, 6],
     ['defense', 180, 260]],
    { hook: 'A cyclone of rot follows you, feeding on the dying.', special: 'poisonNova', weight: 78 }),

  u('uq.thunderstroke', 'Thunderstroke', 'spear.ghost', 70, 66,
    'Held upright in a storm, it does not attract lightning. It repels it, upward.',
    [['lightningDamage', 60, 420], ['skillLevels', 2, 2], ['enhancedDamage', 220, 300], ['attackSpeed', 15, 22],
     ['lightningResist', 40, 60]],
    { hook: 'All damage from this weapon is dealt as lightning.', special: 'convertLightning', weight: 78 }),

  u('uq.deathsweb', "Death's Web", 'wand.unearthed', 72, 68,
    'Every strand is a name and the list is not finished.',
    [['skillLevels', 2, 3], ['poisonDamage', 200, 350], ['manaRegen', 60, 90], ['elementalDamagePct', 30, 45],
     ['life', -100, -50]],
    { hook: 'Enemy poison resistance counts for nothing.', special: 'poisonPierce', weight: 74 }),

  u('uq.eschutas', "Eschuta's Temper", 'orb.eldritch', 66, 62,
    'Warm on one side, freezing on the other, and it rotates.',
    [['skillLevels', 2, 2], ['elementalDamagePct', 35, 50], ['fireDamage', 100, 180], ['coldDamage', 90, 160],
     ['mana', 180, 280]],
    { hook: 'Elemental damage scales with your energy.', special: 'eleFromEnergy', weight: 78 }),

  u('uq.herald', 'Herald of Zakarum', 'shield.monarch', 68, 64,
    'Carried at the front of a procession that never arrived.',
    [['blockChance', 22, 30], ['enhancedDefense', 300, 400], ['strength', 25, 40], ['life', 180, 270],
     ['damageReduction', 10, 15], ['skillLevels', 1, 2]],
    { hook: 'Blocking restores mana and briefly reflects the blow.', special: 'blockReflect', weight: 78 }),

  u('uq.lastwish', 'Last Wish', 'mace.thundermaul', 75, 71,
    'Granted exactly once, badly, and then kept swinging.',
    [['enhancedDamage', 340, 440], ['critDamage', 160, 230], ['areaDamagePct', 45, 65], ['lifeSteal', 8, 12],
     ['attackSpeed', -15, -8], ['magicFind', 50, 80]],
    { hook: 'Enemies you strike are cursed to drop more.', special: 'wishCurse', weight: 74 }),

  // =========================================================================
  // MYTHIC — depth 60+, roughly one in nine hundred drops.
  // =========================================================================

  m('my.griffonseye', "Griffon's Eye", 'helm.diadem', 76, 72,
    'The lens is ground from something that was watching before it was glass.',
    [['skillLevels', 2, 2], ['castSpeed', 30, 40], ['elementalDamagePct', 45, 60], ['lightningDamage', 100, 500],
     ['manaRegen', 60, 90]],
    { hook: 'Enemy elemental resistance is reduced by a flat amount you can feel.', special: 'elePierce', sockets: 1 }),

  m('my.harlequin', 'Harlequin Crest', 'helm.diadem', 74, 70,
    'The joke is old and the punchline is you.',
    [['skillLevels', 2, 2], ['life', 300, 420], ['mana', 300, 420], ['magicFind', 70, 100],
     ['damageReduction', 10, 15], ['strength', 15, 25], ['dexterity', 15, 25], ['vitality', 15, 25], ['energy', 15, 25]],
    { hook: 'Life, mana, skills, magic find, damage reduction — all on one head.', sockets: 1 }),

  m('my.tyraelsmight', "Tyrael's Might", 'chest.sacred', 80, 76,
    'Nobody has ever needed to repair it, which is the strangest part.',
    [['enhancedDefense', 400, 520], ['strength', 30, 45], ['physicalResist', 15, 22], ['damageReduction', 18, 25],
     ['fireResist', 45, 60], ['coldResist', 45, 60], ['lightningResist', 45, 60], ['poisonResist', 45, 60],
     ['arcaneResist', 45, 60], ['moveSpeed', 15, 22]],
    { hook: 'No strength requirement. Cannot be broken. Demons flee it.', special: 'demonFear' }),

  m('my.chainsofhonor', 'Chains of Honor', 'chest.archon', 86, 82,
    'Each link is stamped with an oath. Most of them were kept.',
    [['skillLevels', 2, 2], ['enhancedDefense', 420, 550], ['lifeSteal', 8, 12], ['strength', 25, 40],
     ['physicalResist', 12, 18], ['damageReduction', 14, 20], ['fireResist', 50, 65], ['coldResist', 50, 65],
     ['lightningResist', 50, 65], ['poisonResist', 50, 65], ['arcaneResist', 50, 65]],
    { hook: 'Resistances that hold at any depth.' }),

  m('my.the-oculus', 'The Oculus', 'orb.vortex', 78, 74,
    'It blinks. Not often, and never while you are looking.',
    [['skillLevels', 3, 3], ['castSpeed', 32, 42], ['mana', 350, 500], ['elementalDamagePct', 40, 55],
     ['magicFind', 45, 70], ['fireResist', 25, 40], ['coldResist', 25, 40], ['lightningResist', 25, 40]],
    { hook: 'When badly hurt, teleports you somewhere else. It chooses where.', special: 'panicBlink' }),

  m('my.wizardspike', 'Wizardspike', 'dagger.mindrender', 82, 78,
    'Held point-down it draws a circle in the dust by itself.',
    [['castSpeed', 40, 50], ['mana', 400, 560], ['manaRegen', 80, 120], ['arcaneDamage', 250, 400],
     ['fireResist', 60, 80], ['coldResist', 60, 80], ['lightningResist', 60, 80], ['poisonResist', 60, 80],
     ['arcaneResist', 60, 80]],
    { hook: 'Spend life instead of mana when mana runs out.', special: 'bloodMagic' }),

  m('my.the-reapers-toll', "The Reaper's Toll", 'spear.thresher', 80, 76,
    'The toll is collected whether or not the debt was yours.',
    [['enhancedDamage', 360, 460], ['lifeSteal', 12, 16], ['areaDamagePct', 55, 75], ['critDamage', 150, 220],
     ['strength', 25, 40], ['attackSpeed', 12, 20]],
    { hook: 'Strikes apply a decrepifying curse that halves enemy damage.', special: 'decrepify' }),

  m('my.beast', 'Beast', 'axe.berserker', 78, 74,
    'The haft has teeth marks on the inside of the grip.',
    [['enhancedDamage', 380, 480], ['attackSpeed', 35, 45], ['strength', 35, 50], ['critChance', 15, 22],
     ['lifeSteal', 8, 12], ['areaDamagePct', 30, 45]],
    { hook: 'Permanently transforms you into something with a much larger health pool.', special: 'werebear' }),

  m('my.iceblink', 'Ice Blink', 'sword.godslayer', 88, 84,
    'It rings once, at a pitch you feel in your teeth, and then the room is cold.',
    [['coldDamage', 400, 700], ['enhancedDamage', 400, 520], ['critDamage', 200, 280], ['skillLevels', 1, 2],
     ['attackSpeed', 15, 25], ['coldResist', 50, 70]],
    { hook: 'Enemies killed by cold shatter, freezing everything nearby.', special: 'shatter' }),

  m('my.faith', 'Faith', 'bow.matron', 84, 80,
    'It is not clear who or what the faith was in, and it did not seem to matter.',
    [['enhancedDamage', 420, 540], ['attackSpeed', 40, 52], ['skillLevels', 2, 3], ['fireDamage', 250, 450],
     ['critChance', 14, 20], ['physicalResist', 10, 15]],
    { hook: 'Grants a permanent fanaticism aura: everything you do is faster.', special: 'fanaticism' }),

  m('my.spirit-of-the-forge', 'Spirit of the Forge', 'mace.ruinhammer', 90, 86,
    'It was never quenched. It has been cooling for nine hundred years and is not done.',
    [['enhancedDamage', 460, 600], ['fireDamage', 400, 700], ['areaDamagePct', 70, 95], ['strength', 40, 60],
     ['lifeSteal', 10, 14], ['attackSpeed', -20, -10]],
    { hook: 'Every swing leaves a lasting pool of molten slag.', special: 'moltenTrail' }),

  m('my.nightwing', "Nightwing's Veil", 'helm.diadem', 76, 72,
    'Thin enough to read through, and you should not.',
    [['skillLevels', 2, 2], ['coldDamage', 200, 340], ['elementalDamagePct', 35, 50], ['dexterity', 20, 32],
     ['enhancedDefense', 220, 300], ['critDamage', 100, 150]],
    { hook: 'Enemy cold resistance is halved.', special: 'coldPierce', sockets: 1 }),

  m('my.stoneofthevoid', 'Stone of the Void', 'ring.halo', 82, 78,
    'It weighs nothing at all, and your hand still knows it is there.',
    [['skillLevels', 2, 2], ['arcaneDamage', 200, 340], ['arcaneResist', 60, 85], ['cooldownReduction', 20, 28],
     ['mana', 300, 450], ['manaSteal', 6, 9]],
    { hook: 'Cooldowns tick while you are casting.', special: 'voidCooldown' }),

  m('my.seraphshymn', "Seraph's Hymn", 'amulet.heartstone', 88, 84,
    'It sings when carried and stops the moment you set it down.',
    [['skillLevels', 3, 3], ['castSpeed', 30, 42], ['lifeRegen', 80, 120], ['manaRegen', 100, 150],
     ['life', 250, 380], ['mana', 250, 380], ['cooldownReduction', 18, 25]],
    { hook: 'Allied summons and party members inherit half your regeneration.', special: 'hymnAura' }),

  // =========================================================================
  // ANCIENT — depth 80+, boss-weighted, roughly one in nine thousand.
  // =========================================================================

  a('an.worldbreaker', 'Worldbreaker', 'axe.worldcleaver', 92, 88,
    'It has been used to open exactly three things: a gate, a mountain, and a god.',
    [['enhancedDamage', 620, 800], ['areaDamagePct', 110, 150], ['strength', 60, 85], ['critDamage', 250, 340],
     ['lifeSteal', 12, 18], ['physicalResist', 15, 22], ['maxDamage', 200, 300]],
    { hook: 'Swings cleave the whole arc in front of you and stagger everything they touch.', special: 'worldCleave', sockets: 2 }),

  a('an.the-long-noon', 'The Long Noon', 'sword.sunblade', 90, 86,
    'Held up at midnight it casts a shadow anyway, from the wrong direction.',
    [['fireDamage', 600, 950], ['enhancedDamage', 520, 680], ['attackSpeed', 30, 42], ['elementalDamagePct', 60, 80],
     ['lifeRegen', 90, 130], ['skillLevels', 2, 3]],
    { hook: 'All damage becomes fire, and fire damage cannot be resisted below 25%.', special: 'convertFirePierce', sockets: 1 }),

  a('an.eternity', 'Eternity', 'ring.eternity', 94, 90,
    'A loop with no join. Turning it does nothing and everyone tries.',
    [['skillLevels', 3, 3], ['cooldownReduction', 32, 42], ['life', 400, 560], ['mana', 400, 560],
     ['critChance', 15, 22], ['magicFind', 90, 130], ['damageReduction', 12, 18]],
    { hook: 'Once every ninety seconds, death is declined.', special: 'cheatDeath' }),

  a('an.the-first-word', 'The First Word', 'staff.worldtree', 95, 90,
    'Somebody said something, once, and everything after that was consequences.',
    [['skillLevels', 4, 5], ['castSpeed', 45, 58], ['elementalDamagePct', 80, 110], ['mana', 600, 850],
     ['manaRegen', 140, 200], ['cooldownReduction', 25, 35], ['arcaneDamage', 500, 800]],
    { hook: 'Every spell you cast is cast a second time, at half strength, one beat later.', special: 'echo', sockets: 2 }),

  a('an.mourning-star', 'Mourning Star', 'mace.sanctified', 92, 88,
    'A funeral weapon. It was carried at the front, not used.',
    [['enhancedDamage', 500, 650], ['lifeSteal', 16, 22], ['critDamage', 220, 300], ['life', 400, 550],
     ['damageReduction', 14, 20], ['attackSpeed', 20, 30], ['physicalResist', 12, 18]],
    { hook: 'Life stolen above your maximum becomes a shield instead of being wasted.', special: 'overhealShield', sockets: 1 }),

  a('an.the-hollow-crown', 'The Hollow Crown', 'helm.corona', 96, 92,
    'It fits nobody. It has never fitted anybody. People keep putting it on.',
    [['skillLevels', 3, 4], ['damageReduction', 22, 30], ['physicalResist', 18, 25], ['enhancedDefense', 480, 620],
     ['magicFind', 110, 160], ['life', -400, -200], ['fireResist', 55, 75], ['coldResist', 55, 75],
     ['lightningResist', 55, 75], ['poisonResist', 55, 75], ['arcaneResist', 55, 75]],
    { hook: 'Costs you a great deal of life and gives you everything else.', special: 'hollowPact', sockets: 3 }),

  a('an.godsblood-shroud', 'Shroud of the Sleeping God', 'chest.aeonshroud', 94, 90,
    'It is breathing. Slowly. You will get used to it.',
    [['skillLevels', 3, 4], ['mana', 700, 950], ['manaRegen', 160, 220], ['castSpeed', 40, 52],
     ['elementalDamagePct', 55, 75], ['arcaneResist', 70, 95], ['damageReduction', 10, 16],
     ['cooldownReduction', 20, 28]],
    { hook: 'Your mana pool is also your life pool. Nothing else can hurt you.', special: 'mythicManaShield', sockets: 2 }),
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const BY_ID = new Map<string, UniqueDef>(UNIQUES.map((x) => [x.id, x]));

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
