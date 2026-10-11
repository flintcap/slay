/**
 * SLAY — what every prop kind is: where it goes, whether it blocks, how big
 * its collider is, whether it lights the room, what using it does.
 *
 * Geometry lives in the builder files beside this one (`Library.ts` maps a
 * kind to its builder). Placement rules live in `world/Props.ts`; which kinds
 * a biome uses lives in `Dressing.ts`.
 *
 * A blocking prop's collider is a square `2 * radius` across, centred where
 * the prop is drawn (wall props: `wallOffset` toward the wall). Builders keep
 * the solid part of the model inside that square, so nothing you bump into is
 * invisible and nothing you see is walk-through (`tools/check-blockers.mjs`).
 */

export type PropPlacementKind = 'floor' | 'wall' | 'feature' | 'liquid' | 'ceiling' | 'detail';

export interface PropLightSpec {
  color: number;
  intensity: number;
  distance: number;
  /** Height above the prop's base, in world units. */
  height: number;
  /** 0 = steady, 1 = wild. Drives the noise flicker in the builder. */
  flicker: number;
  /** Forward offset from the prop origin along its facing. */
  forward: number;
  /** Shine in the biome's own torch colour (`art.lightColor`) instead of `color`. */
  mood?: boolean;
  /** Shine in the biome's fire colour (the palette's flame), for open fires. */
  fire?: boolean;
}

export interface PropDef {
  kind: string;
  placement: PropPlacementKind;
  /** Collision half-size in world units. 0 = walk-through. */
  radius: number;
  blocks: boolean;
  variants: number;
  /** ± jitter applied to instance scale. */
  scaleJitter: number;
  /** Random yaw allowed (floor props) vs snapped to the wall normal. */
  freeRotate: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  light?: PropLightSpec;
  /** Distance from tile centre toward the wall, for wall-mounted props. */
  wallOffset?: number;
  /** Default interact payload when placed as an interactable. */
  interact?: string;
  /** Renders with additive/transparent blending (webs, void rifts). */
  ghost?: boolean;
}

function P(kind: string, o: Partial<PropDef>): PropDef {
  return {
    kind,
    placement: 'floor',
    radius: 0.35,
    blocks: false,
    variants: 3,
    scaleJitter: 0.14,
    freeRotate: true,
    castShadow: true,
    receiveShadow: true,
    ...o,
  };
}

/** Ground detail: tiny, many, never blocks, never casts a shadow. */
function DETAIL(kind: string, variants = 4): PropDef {
  return P(kind, { placement: 'detail', radius: 0, blocks: false, variants, scaleJitter: 0.3, castShadow: false });
}

/** Mounted on a wall: snapped to it, no collider. */
function WALL(kind: string, o: Partial<PropDef> = {}): PropDef {
  return P(kind, { placement: 'wall', radius: 0, variants: 3, freeRotate: false, wallOffset: 0.75, castShadow: false, ...o });
}

const WALL_LIGHT = (color: number, intensity: number, distance: number, flicker: number, mood = true): PropLightSpec => ({
  color,
  intensity,
  distance,
  height: 2.0,
  flicker,
  forward: 0.3,
  mood,
});

export const PROP_DEFS: Record<string, PropDef> = {
  // --- wall lights ---------------------------------------------------------
  torch: WALL('torch', { variants: 2, light: WALL_LIGHT(0xff8a3c, 6.5, 13, 1) }),
  forgeSconce: WALL('forgeSconce', { variants: 2, light: WALL_LIGHT(0xff6a1e, 8.5, 15, 0.85) }),
  templeLantern: WALL('templeLantern', { variants: 2, light: WALL_LIGHT(0xffc878, 5.5, 14, 0.45) }),
  iceLantern: WALL('iceLantern', { variants: 2, light: WALL_LIGHT(0xa8d4ff, 5.0, 14, 0.3) }),
  glowShroom: WALL('glowShroom', { variants: 3, light: WALL_LIGHT(0x9fc890, 3.6, 10, 0.2) }),
  eggSac: WALL('eggSac', { variants: 3, light: WALL_LIGHT(0xffb24a, 4.4, 10, 0.35) }),
  voidFlame: WALL('voidFlame', { variants: 2, light: WALL_LIGHT(0xc048ff, 6.0, 13, 0.7) }),

  // --- standing lights -----------------------------------------------------
  brazier: P('brazier', {
    placement: 'feature',
    radius: 0.32,
    blocks: true,
    variants: 3,
    scaleJitter: 0.08,
    light: { color: 0xff8a3c, intensity: 9, distance: 17, height: 1.45, flicker: 1, forward: 0, fire: true },
  }),
  candleCluster: P('candleCluster', {
    radius: 0,
    variants: 3,
    castShadow: false,
    light: { color: 0xffb060, intensity: 2.2, distance: 6, height: 0.6, flicker: 1, forward: 0 },
  }),
  candelabra: P('candelabra', {
    radius: 0.25,
    blocks: true,
    variants: 2,
    scaleJitter: 0.06,
    light: { color: 0xffb060, intensity: 3.4, distance: 8, height: 1.75, flicker: 0.9, forward: 0 },
  }),
  lanternPost: P('lanternPost', {
    radius: 0.2,
    blocks: true,
    variants: 3,
    scaleJitter: 0.08,
    light: { color: 0xffa860, intensity: 5.5, distance: 13, height: 2.25, flicker: 0.6, forward: 0.5, mood: true },
  }),
  campfire: P('campfire', {
    placement: 'feature',
    radius: 0.55,
    blocks: true,
    variants: 3,
    scaleJitter: 0.08,
    light: { color: 0xff8a3c, intensity: 8, distance: 15, height: 0.9, flicker: 1, forward: 0, fire: true },
  }),

  // --- pillars ---------------------------------------------------------------
  pillarGothic: P('pillarGothic', { radius: 0.62, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.04 }),
  pillarIron: P('pillarIron', { radius: 0.58, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.04 }),
  pillarFluted: P('pillarFluted', { radius: 0.62, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.04 }),
  pillarIce: P('pillarIce', { radius: 0.62, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.07 }),
  pillarBroken: P('pillarBroken', { radius: 0.55, blocks: true, variants: 3, scaleJitter: 0.12 }),
  pillarVoid: P('pillarVoid', { radius: 0.6, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.05 }),
  stalacColumn: P('stalacColumn', { radius: 0.68, blocks: true, variants: 3, scaleJitter: 0.16 }),
  chitinColumn: P('chitinColumn', { radius: 0.6, blocks: true, variants: 3, scaleJitter: 0.14 }),

  // --- crypt and the dead ----------------------------------------------------
  sarcophagus: P('sarcophagus', { radius: 0.8, blocks: true, variants: 3, freeRotate: false, scaleJitter: 0.05 }),
  coffin: P('coffin', { radius: 0.55, blocks: true, variants: 3, scaleJitter: 0.06 }),
  bonepile: P('bonepile', { radius: 0, variants: 4, castShadow: false }),
  skullPile: P('skullPile', { radius: 0.42, blocks: true, variants: 3, scaleJitter: 0.18 }),
  brokenColumn: P('brokenColumn', { radius: 0.5, blocks: true, variants: 4, scaleJitter: 0.18 }),
  wallSkull: WALL('wallSkull', { variants: 3 }),
  chain: WALL('chain', { variants: 3 }),
  banner: WALL('banner', { variants: 3 }),
  statue: P('statue', { placement: 'feature', radius: 0.6, blocks: true, variants: 3, scaleJitter: 0.06 }),
  altar: P('altar', { placement: 'feature', radius: 0.8, blocks: true, variants: 2, freeRotate: false, scaleJitter: 0.04 }),
  rubblePile: P('rubblePile', { radius: 0, variants: 4, scaleJitter: 0.22, castShadow: false }),
  ossuary: P('ossuary', {
    placement: 'feature',
    radius: 0.9,
    blocks: true,
    variants: 2,
    scaleJitter: 0.04,
    light: { color: 0xffb060, intensity: 3.2, distance: 8, height: 1.4, flicker: 1, forward: 0.55 },
  }),
  gibbet: P('gibbet', { placement: 'feature', radius: 0.45, blocks: true, variants: 2, scaleJitter: 0.05 }),
  cage: P('cage', { radius: 0.55, blocks: true, variants: 3, scaleJitter: 0.06 }),
  spikes: P('spikes', { radius: 0.45, blocks: true, variants: 3, scaleJitter: 0.18 }),
  impaler: P('impaler', { radius: 0.3, blocks: true, variants: 3, scaleJitter: 0.08 }),

  // --- caves and rock ----------------------------------------------------------
  stalagmite: P('stalagmite', { radius: 0.32, blocks: true, variants: 4, scaleJitter: 0.28 }),
  rockCluster: P('rockCluster', { radius: 0, variants: 4, scaleJitter: 0.25, castShadow: false }),
  boulder: P('boulder', { radius: 0.62, blocks: true, variants: 4, scaleJitter: 0.2 }),
  mushroomCluster: P('mushroomCluster', { radius: 0, variants: 3, castShadow: false }),
  crystalShard: P('crystalShard', { radius: 0, variants: 4, scaleJitter: 0.28, castShadow: false }),
  crystalCluster: P('crystalCluster', { placement: 'feature', radius: 0.7, blocks: true, variants: 3, scaleJitter: 0.18 }),
  rootTangle: WALL('rootTangle', { variants: 3 }),
  ruinWall: P('ruinWall', { radius: 0.7, blocks: true, variants: 3, scaleJitter: 0.08 }),
  cairn: P('cairn', { radius: 0.42, blocks: true, variants: 3, scaleJitter: 0.14 }),

  // --- forest and swamp ----------------------------------------------------------
  deadTree: P('deadTree', { radius: 0.38, blocks: true, variants: 3, scaleJitter: 0.22 }),
  stump: P('stump', { radius: 0.42, blocks: true, variants: 3, scaleJitter: 0.18 }),
  fallenLog: P('fallenLog', { radius: 0.5, blocks: true, variants: 3, scaleJitter: 0.1 }),
  fern: P('fern', { radius: 0, variants: 3, scaleJitter: 0.3, castShadow: false }),
  thornBush: P('thornBush', { radius: 0, variants: 3, scaleJitter: 0.25, castShadow: false }),
  reeds: P('reeds', { radius: 0, variants: 3, scaleJitter: 0.3, castShadow: false }),
  mangroveRoots: P('mangroveRoots', { radius: 0.5, blocks: true, variants: 3, scaleJitter: 0.15 }),
  lilyPad: P('lilyPad', { placement: 'liquid', radius: 0, variants: 3, castShadow: false }),
  cart: P('cart', { placement: 'feature', radius: 0.85, blocks: true, variants: 2, scaleJitter: 0.04 }),
  wayShrine: P('wayShrine', {
    radius: 0.32,
    blocks: true,
    variants: 2,
    scaleJitter: 0.05,
    light: { color: 0xffb060, intensity: 2.4, distance: 6, height: 1.1, flicker: 0.9, forward: 0.12 },
  }),
  tent: P('tent', { placement: 'feature', radius: 0.95, blocks: true, variants: 2, scaleJitter: 0.05 }),
  beastSkull: P('beastSkull', { radius: 0, variants: 3, scaleJitter: 0.2, castShadow: false }),
  frozenBanner: P('frozenBanner', { radius: 0.2, blocks: true, variants: 3, scaleJitter: 0.08 }),

  // --- foundry -------------------------------------------------------------------
  anvil: P('anvil', { radius: 0.45, blocks: true, variants: 2, scaleJitter: 0.05 }),
  pipeCluster: P('pipeCluster', { radius: 0.45, blocks: true, variants: 3, freeRotate: false }),
  pipeRun: WALL('pipeRun', { variants: 3, castShadow: true }),
  valveWheel: WALL('valveWheel', { variants: 2 }),
  gear: P('gear', { radius: 0.55, blocks: true, variants: 3, scaleJitter: 0.18 }),
  ingotStack: P('ingotStack', { radius: 0, variants: 3, castShadow: false }),
  forge: P('forge', {
    placement: 'feature',
    radius: 0.9,
    blocks: true,
    variants: 2,
    freeRotate: false,
    light: { color: 0xff5a14, intensity: 11, distance: 16, height: 1.0, flicker: 0.8, forward: 0.45 },
  }),
  smeltingVat: P('smeltingVat', {
    placement: 'feature',
    radius: 0.85,
    blocks: true,
    variants: 2,
    light: { color: 0xff7a20, intensity: 7, distance: 12, height: 1.4, flicker: 0.5, forward: 0 },
  }),

  // --- temple --------------------------------------------------------------------
  wallRelief: WALL('wallRelief', { variants: 3 }),
  fountain: P('fountain', { placement: 'feature', radius: 1.0, blocks: true, variants: 2, scaleJitter: 0.03 }),
  idolHead: P('idolHead', { placement: 'feature', radius: 1.0, blocks: true, variants: 2, scaleJitter: 0.06 }),

  // --- hive ----------------------------------------------------------------------
  webClump: P('webClump', { radius: 0, variants: 3, castShadow: false, ghost: true }),
  webSheet: WALL('webSheet', { variants: 3, ghost: true }),
  chitinSpike: P('chitinSpike', { radius: 0.28, blocks: true, variants: 4, scaleJitter: 0.28 }),
  cocoon: P('cocoon', { radius: 0.35, blocks: true, variants: 3 }),
  fleshGrowth: P('fleshGrowth', { radius: 0, variants: 4, castShadow: false }),
  broodMound: P('broodMound', { placement: 'feature', radius: 1.0, blocks: true, variants: 2 }),

  // --- frost -----------------------------------------------------------------------
  iceShard: P('iceShard', { radius: 0.3, blocks: true, variants: 4, scaleJitter: 0.28 }),
  icicleRow: WALL('icicleRow', { variants: 3 }),
  frozenCorpse: P('frozenCorpse', { radius: 0.42, blocks: true, variants: 3 }),
  iceMonolith: P('iceMonolith', { placement: 'feature', radius: 0.8, blocks: true, variants: 2, scaleJitter: 0.08 }),

  // --- ash, hell, void ---------------------------------------------------------------
  boneSpire: P('boneSpire', { radius: 0.42, blocks: true, variants: 3, scaleJitter: 0.22 }),
  lavaRock: P('lavaRock', { radius: 0.5, blocks: true, variants: 3, scaleJitter: 0.22 }),
  obelisk: P('obelisk', { placement: 'feature', radius: 0.7, blocks: true, variants: 2, scaleJitter: 0.08 }),
  voidShard: P('voidShard', { radius: 0, variants: 4, scaleJitter: 0.28, castShadow: false }),
  floatingStone: P('floatingStone', { radius: 0, variants: 4, scaleJitter: 0.3, castShadow: false }),
  runeStone: P('runeStone', { radius: 0.42, blocks: true, variants: 3 }),
  voidRift: P('voidRift', {
    placement: 'feature',
    radius: 0,
    variants: 2,
    ghost: true,
    castShadow: false,
    light: { color: 0xc048ff, intensity: 7, distance: 15, height: 1.6, flicker: 0.6, forward: 0 },
  }),

  // --- interactables ---------------------------------------------------------------
  chest: P('chest', { radius: 0.5, blocks: true, variants: 3, freeRotate: false, interact: 'chest', scaleJitter: 0.03 }),
  chestRare: P('chestRare', { radius: 0.55, blocks: true, variants: 2, freeRotate: false, interact: 'chest', scaleJitter: 0.03 }),
  chestVault: P('chestVault', {
    radius: 0.62,
    blocks: true,
    variants: 1,
    freeRotate: false,
    interact: 'chest',
    scaleJitter: 0,
    light: { color: 0xffc860, intensity: 2.2, distance: 5, height: 0.9, flicker: 0.15, forward: 0 },
  }),
  barrel: P('barrel', { radius: 0.38, blocks: true, variants: 3, interact: 'barrel', scaleJitter: 0.07 }),
  crate: P('crate', { radius: 0.42, blocks: true, variants: 3, interact: 'crate', scaleJitter: 0.08 }),
  urn: P('urn', { radius: 0, blocks: false, variants: 4, interact: 'urn', scaleJitter: 0.12 }),
  bookcase: P('bookcase', { placement: 'wall', radius: 0.4, blocks: true, variants: 3, freeRotate: false, wallOffset: 0.6, interact: 'bookcase', scaleJitter: 0.03 }),
  shrine: P('shrine', {
    placement: 'feature',
    radius: 0.6,
    blocks: true,
    variants: 3,
    freeRotate: false,
    interact: 'shrine',
    scaleJitter: 0.03,
    light: { color: 0x9fd8ff, intensity: 6, distance: 12, height: 1.6, flicker: 0.35, forward: 0 },
  }),
  lever: WALL('lever', { variants: 2, interact: 'lever' }),
  door: WALL('door', { variants: 3, castShadow: true }),
  goldHoard: P('goldHoard', {
    placement: 'feature',
    radius: 0.7,
    blocks: true,
    variants: 2,
    scaleJitter: 0.05,
    light: { color: 0xffc860, intensity: 2.4, distance: 6, height: 0.9, flicker: 0.2, forward: 0 },
  }),

  // --- floor seals (the room's focal point, flat on the floor) ------------------------
  floorSeal: P('floorSeal', { placement: 'detail', radius: 0, variants: 3, scaleJitter: 0, castShadow: false }),
  arenaSeal: P('arenaSeal', { placement: 'detail', radius: 0, variants: 2, scaleJitter: 0, castShadow: false }),

  // --- ground detail -------------------------------------------------------------------
  pebbles: DETAIL('pebbles'),
  boneChips: DETAIL('boneChips'),
  ashDrift: DETAIL('ashDrift'),
  mossPatch: DETAIL('mossPatch'),
  sporeTuft: DETAIL('sporeTuft'),
  iceCrust: DETAIL('iceCrust'),
  slagChunk: DETAIL('slagChunk'),
  shellFragment: DETAIL('shellFragment'),
  sandDrift: DETAIL('sandDrift'),
  voidMote: DETAIL('voidMote'),
  scorchMark: DETAIL('scorchMark'),
  grassTuft: DETAIL('grassTuft'),
  leafLitter: DETAIL('leafLitter'),
  twigs: DETAIL('twigs'),
  bloodStain: DETAIL('bloodStain', 3),
};

/** A kind's definition. Unknown kinds draw as a rubble pile rather than failing. */
export function propDef(kind: string): PropDef {
  return PROP_DEFS[kind] ?? PROP_DEFS.rubblePile!;
}
