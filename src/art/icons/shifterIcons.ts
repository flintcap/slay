/**
 * SLAY — the Shapeshifter's skill icons: icon key -> 'glyph[:variant]^modifier',
 * the same grammar as `ICON_MAP` in `art/SkillIconArt.ts`, which spreads this in.
 * Every key starts `ss-` so no other class's icon can be picked up by mistake.
 */
export const SHIFTER_ICONS: Readonly<Record<string, string>> = {
  // Feral
  'ss-rake': 'claw^speed',
};
