/**
 * SLAY: the Mage's own skill icons: icon key -> 'glyph[:variant]^modifier',
 * the same grammar as `ICON_MAP` in `art/SkillIconArt.ts`, which spreads this in.
 * Every key starts `mg-` so no other class's icon can be picked up by mistake.
 * His own glyphs (`mgbolt`, `mgfireball`, `mgdragon` and the rest) are in
 * `art/MageGlyphs.ts`. The fire tree is painted whole here, one picture a
 * skill; the frost and storm trees keep their shared glyphs, apart from
 * Sparkbolt, which had only Chain Lightning's bolt without the chain.
 */
export const MAGE_ICONS: Readonly<Record<string, string>> = {
  // Conflagration: fire thrown, poured, rained and set loose.
  'mg-firebolt': 'mgbolt',
  'mg-fire-mastery': 'mgsigil^mastery',
  'mg-ember-nova': 'mgembers',
  'mg-scorch': 'mgmelt',
  'mg-fireball': 'mgfireball',
  'mg-inferno-stream': 'mgstream',
  'mg-kindling': 'mgkindling',
  'mg-blast-wave': 'mgblast',
  'mg-pyroclasm': 'mgerupt',
  'mg-combustion': 'mgbomb',
  'mg-heat-shimmer': 'mgshimmer',
  'mg-firestorm': 'mgmeteors',
  'mg-searing-core': 'mgcore',
  'mg-dragons-breath': 'mgdragon',
  'mg-cataclysm': 'mgchain',
  'mg-annihilate': 'mgimplode',
  'mg-ember-soul': 'mgsoul',
  // Tempest.
  'mg-sparkbolt': 'mgspark',
};
