/**
 * SLAY — the sound bank: which recorded samples answer which sound id.
 *
 * Every id the game plays maps to a folder of variations under
 * `public/assets/sounds/<id>/01.ogg, 02.ogg ...`. The folders and their counts
 * are written by `tools/build-audio.mjs` into `manifest.ts`; this file only
 * holds the per-id mix settings and the rules that fold the many ids callers
 * use (`cast.fire`, `monster.undead.hurt`, `footstep.sand`, `drop.unique`) onto
 * the folders that exist.
 *
 * Unknown ids resolve through their family and, failing that, resolve to
 * nothing and play nothing. A missing sound never throws.
 */

import { SAMPLE_COUNTS } from './manifest';

export type Bus = 'sfx' | 'ui' | 'amb';

export interface SoundDef {
  /** Linear gain on top of the normalised sample. */
  vol: number;
  /** Half-range of the random pitch jitter, as a playback-rate fraction. */
  jitter: number;
  /** Half-range of the random volume jitter, linear. */
  volJitter: number;
  /** Base playback rate. */
  rate: number;
  /** 2 must play, 0 is texture that is dropped first. */
  prio: 0 | 1 | 2;
  /** Most voices of this id sounding at once. */
  max: number;
  /** Seconds before the same id may start again. */
  gap: number;
  bus: Bus;
  /** Reverb send, 0..1. */
  send: number;
  /** Other ids layered on top whenever this one plays. */
  with: string[];
}

const DEFAULT: SoundDef = { vol: 0.8, jitter: 0.05, volJitter: 0.08, rate: 1, prio: 1, max: 4, gap: 0.03, bus: 'sfx', send: 0.25, with: [] };

/** Per-id overrides. Anything not listed uses DEFAULT plus the family rules in `defFor`. */
const DEFS: Record<string, Partial<SoundDef>> = {
  // --- interface ------------------------------------------------------------
  'ui.click': { vol: 0.55, bus: 'ui', prio: 2, max: 2, jitter: 0.03, send: 0 },
  'ui.hover': { vol: 0.25, bus: 'ui', prio: 2, max: 1, gap: 0.05, jitter: 0.04, send: 0 },
  'ui.open': { vol: 0.65, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.close': { vol: 0.6, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.tab': { vol: 0.5, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.select': { vol: 0.55, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.error': { vol: 0.55, bus: 'ui', prio: 2, max: 1, gap: 0.15, send: 0 },
  'ui.equip': { vol: 0.75, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.unequip': { vol: 0.65, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.buy': { vol: 0.75, bus: 'ui', prio: 2, max: 2, send: 0 },
  'ui.sell': { vol: 0.75, bus: 'ui', prio: 2, max: 2, send: 0 },
  'craft.success': { vol: 0.85, bus: 'ui', prio: 2, max: 1, send: 0.2 },
  'skillpoint': { vol: 0.7, bus: 'ui', prio: 2, max: 1, send: 0.3 },
  'levelup': { vol: 0.95, prio: 2, max: 1, gap: 0.5, jitter: 0, send: 0.45 },
  'quest.complete': { vol: 0.9, bus: 'ui', prio: 2, max: 1, gap: 0.5, jitter: 0, send: 0.3 },
  'potion': { vol: 0.8, prio: 2, max: 2 },
  'portal': { vol: 0.9, prio: 2, max: 1, gap: 0.3, send: 0.5 },
  'waypoint': { vol: 0.85, prio: 2, max: 1, gap: 0.3, send: 0.5 },
  'stairs': { vol: 0.8, prio: 2, max: 1, gap: 0.3, send: 0.4 },
  'door': { vol: 0.8, max: 2 },
  'chest': { vol: 0.85, max: 2 },
  'shrine': { vol: 0.9, prio: 2, max: 1, send: 0.5 },

  // --- weapons --------------------------------------------------------------
  'swing.blade': { vol: 0.6, max: 3, jitter: 0.07 },
  'swing.axe': { vol: 0.65, max: 3, jitter: 0.06 },
  'swing.blunt': { vol: 0.7, max: 3, jitter: 0.06 },
  'swing.pierce': { vol: 0.55, max: 3, jitter: 0.07 },
  'swing.fist': { vol: 0.5, max: 3, jitter: 0.08 },
  'swing.light': { vol: 0.5, max: 3, prio: 0, jitter: 0.08 },
  'swing.heavy': { vol: 0.8, max: 2, jitter: 0.05 },
  'monster.swing': { vol: 0.5, max: 3, prio: 0, jitter: 0.1 },
  'shoot.physical': { vol: 0.65, max: 3, prio: 0 },
  'hit.melee': { vol: 0.75, max: 4 },
  'hit.sword': { vol: 0.8, prio: 2, max: 3 },
  'hit.axe': { vol: 0.85, prio: 2, max: 3 },
  'hit.blunt': { vol: 0.9, prio: 2, max: 3 },
  'hit.pierce': { vol: 0.75, prio: 2, max: 3 },
  'hit.fist': { vol: 0.8, prio: 2, max: 3 },
  'hit.heavy': { vol: 0.95, prio: 2, max: 2, send: 0.35 },
  'hit.flesh': { vol: 0.7, max: 3 },
  'hit.bone': { vol: 0.7, max: 3 },
  'hit.metal': { vol: 0.65, max: 3 },
  'hit.stone': { vol: 0.7, max: 3 },
  'hit.chitin': { vol: 0.7, max: 3 },
  'hit.wood': { vol: 0.7, max: 3 },
  'hit.ooze': { vol: 0.95, max: 3 },
  'arrow.thunk': { vol: 0.6, max: 3, prio: 0 },
  'block': { vol: 0.85, prio: 2, max: 2 },
  'block.magic': { vol: 0.75, prio: 2, max: 2, send: 0.4 },
  'parry': { vol: 0.85, prio: 2, max: 2, send: 0.35 },
  'crit': { vol: 0.8, prio: 2, max: 2 },
  'kill.confirm': { vol: 0.6, prio: 2, max: 3 },
  'kill.elite': { vol: 0.85, prio: 2, max: 1, gap: 0.25, send: 0.45 },
  'kill.multi': { vol: 0.8, prio: 2, max: 1, gap: 0.3 },
  'combo': { vol: 0.6, prio: 2, max: 1, gap: 0.2, send: 0.3 },
  'death.normal': { vol: 0.65, max: 4 },
  'death.heavy': { vol: 0.85, max: 2, send: 0.35 },
  'telegraph': { vol: 0.8, prio: 2, max: 3, jitter: 0.03, send: 0.35 },
  'telegraph.long': { vol: 0.9, prio: 2, max: 2, jitter: 0.02, send: 0.4 },

  // --- the hero -------------------------------------------------------------
  'player.hurt': { vol: 0.7, prio: 2, max: 1, gap: 0.25 },
  'player.hurtHeavy': { vol: 0.85, prio: 2, max: 1, gap: 0.4 },
  'player.death': { vol: 1, prio: 2, max: 1, gap: 2, jitter: 0, send: 0.5 },
  'player.evade': { vol: 0.65, prio: 2, max: 1 },
  'player.stunned': { vol: 0.8, prio: 2, max: 1, gap: 0.5 },
  'heartbeat': { vol: 0.75, prio: 2, max: 1, gap: 0.3, jitter: 0, send: 0 },
  'jump': { vol: 0.6, max: 1 },
  'land': { vol: 0.7, max: 1 },

  // --- spells ---------------------------------------------------------------
  'spell.explosion': { vol: 0.95, max: 3, send: 0.45 },
  'spell.meteor': { vol: 1, max: 2, send: 0.5 },
  'spell.thunder': { vol: 1, max: 2, send: 0.55 },
  'spell.chainLightning': { vol: 0.85, max: 2, send: 0.35 },
  'spell.volley': { vol: 0.75, max: 2 },
  'spell.whirlwind': { vol: 0.8, max: 1, gap: 0.4 },
  'spell.summon': { vol: 0.85, max: 2, send: 0.5 },
  'spell.shield': { vol: 0.8, max: 1, send: 0.4 },
  'spell.heal': { vol: 0.75, max: 2, send: 0.4 },
  'spell.curse': { vol: 0.8, max: 2, send: 0.5 },
  'spell.teleportOut': { vol: 0.8, max: 1, send: 0.5 },
  'spell.teleportIn': { vol: 0.8, max: 1, send: 0.5 },
  'buff': { vol: 0.75, max: 2, send: 0.4 },
  'debuff': { vol: 0.75, max: 2, send: 0.4 },
  'slam': { vol: 1, max: 2, send: 0.45 },

  // --- voices ---------------------------------------------------------------
  'roar': { vol: 0.95, prio: 2, max: 1, gap: 0.6, send: 0.5 },
  'howl': { vol: 0.9, prio: 2, max: 1, gap: 0.6, send: 0.6 },
  'wail': { vol: 0.85, prio: 2, max: 1, gap: 0.6, send: 0.6 },
  'warcry': { vol: 0.9, prio: 2, max: 1, gap: 0.6, send: 0.45 },
  'ambush': { vol: 0.9, prio: 2, max: 1, gap: 1, send: 0.5 },
  'screech': { vol: 0.8, max: 2, send: 0.4 },

  // --- bosses ---------------------------------------------------------------
  'boss.roar': { vol: 1, prio: 2, max: 1, gap: 0.8, send: 0.6, jitter: 0.03 },
  'boss.windup': { vol: 0.95, prio: 2, max: 1, send: 0.5, jitter: 0.02 },
  'boss.slam': { vol: 1, prio: 2, max: 2, send: 0.55 },
  'boss.phase': { vol: 1, prio: 2, max: 1, gap: 1, send: 0.6, jitter: 0 },
  'boss.intro': { vol: 1, prio: 2, max: 1, gap: 3, send: 0.6, jitter: 0 },

  // --- loot -----------------------------------------------------------------
  'gold': { vol: 0.6, prio: 1, max: 2, gap: 0.04 },
  'gold.spill': { vol: 0.5, prio: 0, max: 2 },
  'gold.land': { vol: 0.45, prio: 0, max: 3, gap: 0.05 },
  'loot.toss': { vol: 0.4, prio: 0, max: 2 },
  'loot.clink': { vol: 0.5, prio: 0, max: 3 },
  'loot.grab': { vol: 0.5, prio: 1, max: 2 },
  'loot.legendary': { vol: 1, prio: 2, max: 1, gap: 0.6, jitter: 0, send: 0.55 },
};

/** Elements the family rules understand. */
const ELEMENTS = new Set(['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane', 'bone']);
const RARITIES = new Set(['normal', 'magic', 'rare', 'set', 'unique', 'mythic', 'ancient']);
const FAMILIES = new Set(['undead', 'demon', 'beast', 'construct', 'insect', 'aberration', 'elemental', 'humanoid', 'plant', 'ooze']);

/** Direct renames: callers' names for a sound that lives under another id. */
const ALIASES: Record<string, string> = {
  'hit.physical': 'hit.melee',
  'impact.physical': 'hit.melee',
  'cast.bone': 'cast.physical',
  'miss': 'swing.light',
  'swing.miss': 'swing.light',
  'explosion': 'spell.explosion',
  'heal': 'spell.heal',
  'chain': 'spell.chainLightning',
  'dodge': 'player.evade',
  'equip': 'ui.equip',
  'unequip': 'ui.unequip',
  'ui.levelup': 'levelup',
  'click': 'ui.click',
  'button': 'ui.click',
  'select': 'ui.select',
  'error': 'ui.error',
  'open': 'ui.open',
  'close': 'ui.close',
  'inventory.open': 'ui.open',
  'inventory.close': 'ui.close',
  'pickup': 'loot.grab',
  'loot.gold': 'gold',
  'monster.aggro': 'monster.beast.aggro',
  'monster.attack': 'monster.beast.attack',
  'monster.hurt': 'monster.beast.hurt',
  'monster.death': 'monster.beast.death',
  'footstep.ash': 'footstep.dirt',
  'footstep.bone': 'footstep.stone',
  'footstep.flesh': 'footstep.mud',
  'footstep.ice': 'footstep.snow',
  'footstep.gravel': 'footstep.dirt',
  'footstep.leaves': 'footstep.grass',
  'pickup.kind.armour': 'pickup.kind.armor',
};

const has = (id: string): boolean => (SAMPLE_COUNTS[id] ?? 0) > 0;

/** The bank id an id plays, or null when nothing answers it. */
export function resolveSound(id: string): string | null {
  let cur = id;
  for (let hop = 0; hop < 4; hop++) {
    if (has(cur)) return cur;
    const alias = ALIASES[cur];
    if (alias) {
      cur = alias;
      continue;
    }
    const next = family(cur);
    if (!next || next === cur) return null;
    cur = next;
  }
  return has(cur) ? cur : null;
}

/** One step of family fallback, or null. */
function family(id: string): string | null {
  const dot = id.indexOf('.');
  const head = dot < 0 ? id : id.slice(0, dot);
  const tail = dot < 0 ? '' : id.slice(dot + 1);
  const el = ELEMENTS.has(tail) ? tail : 'arcane';
  switch (head) {
    case 'cast':
      return `cast.${el === 'bone' ? 'physical' : el}`;
    case 'hit':
    case 'impact':
      if (tail === 'physical' || tail === '') return 'hit.melee';
      return ELEMENTS.has(tail) ? `impact.${tail === 'bone' ? 'physical' : tail}` : 'hit.melee';
    case 'nova': {
      // A nova with no recording of its own sounds like its element landing.
      const e = el === 'bone' ? 'physical' : el;
      return ELEMENTS.has(tail) ? (e === 'physical' ? 'hit.heavy' : `impact.${e}`) : 'nova.arcane';
    }
    case 'beam':
    case 'cone':
      // Beams and cones fall back to their element's cast.
      return ELEMENTS.has(tail) ? `cast.${el === 'bone' ? 'physical' : el}` : `cast.arcane`;
    case 'breath':
      return `cone.${el}`;
    case 'shoot':
      return tail === 'physical' || tail === '' || !ELEMENTS.has(tail) ? 'shoot.physical' : `cast.${tail}`;
    case 'footstep':
    case 'step':
      return has(`footstep.${tail}`) ? `footstep.${tail}` : 'footstep.stone';
    case 'pickup':
      if (tail.startsWith('kind.')) return 'loot.grab';
      if (!RARITIES.has(tail)) return null;
      return tail === 'normal' ? 'loot.grab' : tail === 'magic' || tail === 'rare' ? 'pickup.magic' : 'pickup.rare';
    case 'drop':
      // normal clinks, magic tinkles, rare rings, set chimes; unique and above
      // get the deep gong under a bell, the sound you stop for.
      if (!RARITIES.has(tail)) return null;
      return tail === 'normal' ? 'loot.clink' : tail === 'magic' ? 'drop.magic' : tail === 'rare' ? 'drop.magic' : tail === 'set' ? 'drop.rare' : 'drop.unique';
    case 'monster': {
      const [fam, kind] = tail.split('.');
      if (!kind) return `monster.beast.${fam || 'aggro'}`;
      return FAMILIES.has(fam ?? '') && fam !== 'beast' ? `monster.beast.${kind}` : null;
    }
    case 'growl':
      return `monster.${FAMILIES.has(tail) ? tail : 'beast'}.aggro`;
    case 'death':
      return FAMILIES.has(tail) ? `monster.${tail}.death` : 'death.normal';
    case 'screech':
      return 'screech';
    case 'block':
      return 'block';
    case 'spell':
      return 'cast.arcane';
    case 'ui':
      return 'ui.click';
    case 'boss':
      return tail.startsWith('roar') ? 'boss.roar' : null;
    default:
      return null;
  }
}

/**
 * Families whose recordings are quiet by nature (rock, wood, slime): lifted so
 * a stone golem is as present as a zombie.
 */
const MONSTER_LIFT: Record<string, number> = { elemental: 1.7, plant: 1.4, ooze: 1.3, construct: 1.2, insect: 1.15 };

/** Mix settings for a bank id. */
export function soundDef(id: string): SoundDef {
  const own = DEFS[id];
  const base: SoundDef = { ...DEFAULT };
  if (id.startsWith('monster.')) {
    base.vol = (id.endsWith('.death') ? 0.75 : 0.6) * (MONSTER_LIFT[id.split('.')[1] ?? ''] ?? 1);
    base.prio = id.endsWith('.death') ? 1 : 0;
    base.max = 3;
    base.gap = 0.08;
    base.jitter = 0.08;
    base.send = 0.35;
  } else if (id.startsWith('footstep.')) {
    base.vol = 0.4;
    base.prio = 0;
    base.max = 2;
    base.jitter = 0.08;
    base.volJitter = 0.15;
    base.send = 0.15;
  } else if (id.startsWith('amb.')) {
    base.vol = 0.5;
    base.prio = 0;
    base.max = 3;
    base.bus = 'amb';
    base.send = 0.6;
    base.jitter = 0.1;
  } else if (/^(cast|impact|nova|beam|cone)\./.test(id)) {
    base.vol = id.startsWith('nova.') ? 0.9 : 0.75;
    base.max = 3;
    base.send = 0.4;
  } else if (id.startsWith('drop.') || id.startsWith('pickup.')) {
    base.prio = 2;
    base.max = 2;
    base.vol = 0.75;
    base.send = 0.35;
  }
  return own ? { ...base, ...own } : base;
}

/** Sample files for a bank id, relative to `public/assets/`. */
export function soundFiles(id: string): string[] {
  const n = SAMPLE_COUNTS[id] ?? 0;
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(`sounds/${id}/${String(i).padStart(2, '0')}.ogg`);
  return out;
}

/** Every bank id with samples, for tooling. */
export function bankIds(): string[] {
  return Object.keys(SAMPLE_COUNTS).filter(has).sort();
}

/** Ids that must always be ready: loaded the moment audio starts. */
export function coreIds(): string[] {
  return bankIds().filter((id) => /^(ui\.|swing\.|hit\.|player\.|kill\.|footstep\.|crit|block|gold|loot\.|potion|levelup|telegraph)/.test(id));
}

/**
 * How much a sound matters when voices run short: 2 must play (the player's
 * own hits, kills, warnings, UI), 0 is texture that may be dropped first.
 */
export function soundPriority(id: string): 0 | 1 | 2 {
  const bank = resolveSound(id);
  return bank ? soundDef(bank).prio : 0;
}
