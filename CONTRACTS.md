# SLAY — Module Contracts

**Read `src/types.ts` first.** It holds every shared data shape. This file
holds the *function* signatures modules expose to each other.

Rules for every contributor:

1. **Only create or edit files you own.** If you need something from another
   module, import it from the path below and trust the signature — do not
   create that file, even as a stub.
2. **No `Math.random()` in generators.** Take an `Rng` (see `core/RNG.ts`).
3. **No external assets.** No image, model, font, or audio files, and no CDN
   URLs. Everything is generated in code: textures from canvas + noise,
   geometry from `BufferGeometry`, audio from WebAudio nodes. The game must run
   fully offline from `dist/`.
4. **Dispose what you allocate.** Geometries, materials and textures created
   per-run must be released; `core/Engine.ts` exports `disposeObject(root)`.
5. **TypeScript is strict.** `npm run typecheck` must pass for your files.
   Errors from *other* people's not-yet-written modules are expected while the
   build is in flight; errors inside your own are not.
6. Target 60 fps at 1080p. Instance repeated geometry (`InstancedMesh`), share
   materials, and keep per-frame allocation out of the hot path.

---

## `src/art/Materials.ts` — owned by ground

Every surface is a CC0 photo set (`src/art/TextureSets.ts`, files under
`public/assets/textures/world/<set>/`). `src/art/SurfaceLibrary.ts` maps each
key to a set, a base colour and a roughness range. Unknown keys never fail:
they fall back by family ('stone.*', 'metal.*', ...). `tex.<set>` gives a set
in its own photo colour.

```ts
/** Preloads the boot texture sets onto the boot bar. */
export function warmMaterials(onProgress: (p: number, label: string) => void): Promise<void>;

/**
 * The material library. `key` is a surface name such as 'stone.crypt',
 * 'metal.iron', 'wood.oak', 'cloth.linen', 'flesh.rotted', 'crystal.void'.
 * Returns a shared, cached MeshStandardMaterial (photo albedo, normal,
 * roughness, height-shaded AO) tinted to the key's base colour.
 * Never mutate the result — call `surfaceVariant` for a tweaked copy.
 */
export function surface(key: string, opts?: SurfaceOpts): THREE.MeshStandardMaterial;
export function surfaceVariant(key: string, opts: SurfaceOpts): THREE.MeshStandardMaterial;
/** The key's base colour (sRGB hex): what a flat-coloured copy should use. */
export function surfaceBaseColor(key: string): number;

export interface SurfaceOpts {
  /** Texture repeat across the model's UVs. */
  repeat?: number;
  /** Multiplicative colour tint. */
  tint?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** 0..2, scales normal map strength. */
  bump?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

/** Emissive/animated materials for magic, lava, runes. */
export function emissiveMaterial(color: number, intensity?: number): THREE.MeshStandardMaterial;
```

## `src/art/WorldMaterial.ts` — owned by ground

World geometry (floors, walls, cliffs, terrain) uses world-space projection,
so it needs no UVs and never shows a seam between pieces. Floors project from
above; walls and terrain use triplanar mapping. Up to four layers blend by
height, weighted by the `aSplat` vertex attribute (vec3: weights of layers
1..3; layer 0 takes the rest).

```ts
export const WORLD_ENV_ATTRIBUTE = 'aEnv';   // float: floor contact shadow 0..1; wall height above floor
export const WORLD_SPLAT_ATTRIBUTE = 'aSplat';
export interface WorldLayer { key: string; metres?: number; tint?: number; bump?: number; rough?: number; emissive?: number; emissiveIntensity?: number }
export function worldMaterial(o: {
  layers: WorldLayer[]; kind: 'floor' | 'wall' | 'terrain';
  grime?: number; grimeAmount?: number; wet?: number; variation?: number; contact?: number;
  cutaway?: boolean; roof?: boolean; detile?: boolean; side?: THREE.Side; tint?: number;
}): THREE.MeshStandardMaterial;
/** Sightline hole in walls between camera and hero; written once per frame by the level. */
export function setWorldCutaway(x: number, y: number, z: number, radius: number): void;
/** Roof and ceiling dissolve around the hero; written once per frame by the level. */
export function setWorldRoof(x: number, z: number, radius: number): void;
/** The same cutaway on a private (never a cached surface()) material. */
export function addWorldCutaway<M extends THREE.Material>(mat: M): M;
```

Small effect textures (glow, rune ring, web, crack, macro noise) live in
`src/fx/UtilityTextures.ts`, owned by vfx.

## `src/art/Meshes.ts` — owned by ART

```ts
/** Procedural geometry builders. All return centred, indexed BufferGeometry. */
export function beveledBox(w: number, h: number, d: number, bevel?: number): THREE.BufferGeometry;
export function stoneBlock(w: number, h: number, d: number, rng: Rng, roughness?: number): THREE.BufferGeometry;
export function pillar(radius: number, height: number, sides: number, rng: Rng, style?: string): THREE.BufferGeometry;
export function archway(width: number, height: number, thickness: number): THREE.BufferGeometry;
/** Displaces vertices by noise — turns primitives into rock, flesh, ice. */
export function displace(geo: THREE.BufferGeometry, rng: Rng, amount: number, scale: number): THREE.BufferGeometry;
/** Lathe a profile: goblets, urns, torch sconces, boss cores. */
export function lathe(profile: Array<[number, number]>, segments?: number): THREE.BufferGeometry;
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry;
```

## Items — `src/art/ItemModels.ts`, `ItemLook.ts`, `Icons.ts`, `src/art/items/*` — owned by items

```ts
// src/art/ItemModels.ts (the public facade; builders live in src/art/items/)
/** A held / shown model. Grip at the origin, business end along +Y, wide on X, thin on Z. Metres. */
export function buildItemModel(visual: ItemVisual, rng: Rng, rarity: ItemRarity, ident?: ItemIdent): THREE.Object3D;
/** The item lying on the floor, nothing else: LootFX draws its beam and floor glow. */
export function buildDropModel(item: Item, rng: Rng): THREE.Object3D;
export type ItemIdent = Pick<Item, 'baseId'> & Partial<Pick<Item, 'uniqueId' | 'setId'>>;
```

Unknown or free-form shapes ('sword', 'bow', 'staff' from monsters and NPCs)
resolve to the closest family; a model never fails to build.

A drop lies still on the floor: its root sits at y = 0.28 (the old hover
height, so labels and beams line up) and the lying model is a child offset by
-0.28, resting on the ground. It does not bob or spin.

Worn armour (`src/art/hero/Armour.ts`, owned by items since heroes finished):
`wearArmour(hero, slot, item, visual): WornArmour | null` grows chest, helm,
gloves, boots and belt as shells of the hero's body field, one cut per base
(`ItemLook.cut`). `WornArmour` is `{ object, hides }`, unchanged. A bare hero
wears plain undyed linens (`Garment.ts`), with no class costume.

### `ItemLook`: what an item looks like (items → heroes)

`itemLook(item, visual)` from `src/art/ItemLook.ts`. Cached, pure data, no
three.js objects. It extends `GearLook` (`src/art/GearLook.ts`), so every
field heroes already reads keeps its meaning; uniques and sets now change
them (a unique's `palette` is its design's material, a set's `trimKey` is the
set's trim). Fields added by items are marked new.

```ts
interface ItemLook extends GearLook {
  // From GearLook (unchanged meaning):
  palette: string;        // main surface key; may carry an inline tint 'cloth.silk|0x5a2618'
  family: 'metal' | 'leather' | 'cloth' | 'bone' | 'other';
  kind: string;           // the sub-type after the dot of visual.shape ('plate', 'robe', 'horned')
  rarityTier: number;     // 0 normal .. 4 mythic/ancient
  baseTier: number;       // 0 entry, 1 mid, 2 elite
  rank: number; trimKey: string; trimTint?: number; accent: number;
  glow: number;           // emissive strength, 0 for none
  ornate: number; hasTrim: boolean; hasFittings: boolean; hasGems: boolean; hasRunes: boolean;
  unique: boolean; set: boolean; signature: number;
  // Colour ladder:
  stone: number;          // gem colour
  glowColor: number;      // runes, inlays, auras
  iconRank: number;       // 0 normal .. 6 ancient
  iconTrim: string; iconTrimTint?: number;   // legacy, kept for old drawers
  // New:
  baseId: string;
  category: ItemCategory | 'unknown';
  silhouette: string;     // visual.shape lower-cased: 'sword.broad', 'helm.horned', 'dagger'
  cut: string;            // the base's own cut in its family (the base id); every base differs
  material: 'metal' | 'wood' | 'leather' | 'cloth' | 'bone' | 'crystal' | 'stone' | 'flesh';
  keys: { main; second; wood; trim; cloth: string };   // surface keys per part (may carry |0xRRGGBB)
  colors: { main; second; wood; trim; cloth; glow; stone: number };   // the same as sRGB hex
  gemCount: number;       // gem settings to show, 0..6
  wear: number;           // 0 pristine .. 1 battered
  features: Feature[];    // 'wings' | 'horns' | 'spikes' | 'flames' | 'frost' | 'chains' | 'skulls' | ... (Designs.ts)
  emblem?: Emblem;        // a set's badge: 'hand' | 'flame' | 'skull' | 'snowflake' | 'bolt' | 'crown' | ...
  motif?: SetMotif;       // set pieces: { color, second, trim, emblem, features, wear }
  design?: UniqueDesign;  // uniques: { main?, second?, trim?, glow?, stone?, features, cut?, wear? }
  cutOverride?: Record<string, number | string | boolean>;
}
/** sRGB colour of a surface key with an optional inline tint. */
export function keyColor(key: string): number;
```

Worn armour (heroes) keeps reading `palette`, `trimKey`/`trimTint`,
`glowColor`, `stone`, `kind`, `baseTier` and the ornament flags. It may also
use `keys.second`/`keys.cloth` for linings and tabards, `features` for extra
shapes (horns, wings, spikes) and `emblem` for a set badge.

### Signatures: every set and unique (qa-legend)

The per-id signature data lives in `src/art/items/Designs.ts`
(`SET_MOTIFS`, `UNIQUE_DESIGNS`) and is the design bible's source of truth;
`tools/check-legend.mjs` holds it to these rules:

- Every set in `src/data/sets.ts` has a `SetMotif` and every unique, mythic
  and ancient in `src/data/uniques.ts` has a `UniqueDesign`.
- No two sets share a palette (main metal, leather, cloth and glow colour
  together) or a sculpt. Every unique's look (base, main, trim, glow,
  features) differs from every other unique's.

```ts
type Aura = 'none' | 'soft' | 'embers' | 'ash' | 'frost' | 'sparkles' | 'shine' | 'wisp' | 'smoke' | 'drips' | 'sparks' | 'motes' | 'souls';
type Finish = 'polished' | 'lacquer' | 'satin' | 'matte' | 'frosted' | 'blackened' | 'weathered' | 'gilt' | 'pearl';
interface SetMotif {
  name: string;           // the palette in words
  color: number;          // stones, emblem
  glow: number;           // glow and aura colour (ItemLook.glowColor)
  metal: string; leather: string; cloth: string;   // main surface by the base's material
  second: string; trim: string;
  finish: Finish;
  sculpt: Feature;        // the set's sculpted motif, first in ItemLook.features, unique among sets
  emblem: Emblem; features: Feature[]; aura: Aura; wear: number;
}
interface UniqueDesign { /* as before */ aura: Aura; finish?: Finish; }
// ItemLook gains:
aura: Aura;               // 'none' on plain items
finish?: Finish;
sheen: number;            // faint inner light of the main surface, in glowColor
export function surfaceFinish(look): { metalness?: number; roughness?: number };
```

Sculpts (new `Feature`s, drawn on the body by `hero/ArmourFeatures.ts` and on
models by `items/Features.ts`): `dragons`, `claws`, `antlers`, `crowns`,
`moons`, `bolts`, `spiders`, `serpents`, `laurels`.

Glow and auras:
- `items/Aura.ts`: `buildAura(kind, color, { radius, height, strength, seed })`
  returns one `THREE.Points` (one draw call, animated in the shader) or null.
- `buildItemModel` adds the item's aura to uniques and set pieces in the
  hand; `buildDropModel` stands it up on the floor.
- `items/Outfit.ts`: `dressOutfit(hero, pieces, worn, visualOf)`, called by
  `DressedHero.dress`, lights worn set pieces by pieces worn
  (`hero/Armour.ts` `lightArmour`: 2 pieces the trims glow, the full set the
  whole outfit shines), raises the set's aura at 3 pieces and up (stronger
  with each), and puts each worn unique's aura on its bone. At most 3 auras
  on a hero.
- `hero/HeroMaterials.ts` `glowingTwin(material, color, intensity)`: a
  cached emissive twin of a gear material.
- Icons (`items/IconRender.ts`) paint the same aura from `auraStyle(kind)`:
  big soft kinds bloom behind the item, small bright ones sit on top with
  drift trails. Seeded by the item's identity, so an icon never changes.
- `ItemLook.ts` `BASE_TINT`: a base whose own palette is too plain to read
  (Kraken Shell) gets a tint there, so icon, drop and body agree.
- Draw cost: a hero in the busiest full set is about 40 meshes and 2 or 3
  auras. `node tools/check-perf.mjs --set=<set id>` measures a floor with
  that set worn.

| Set | Palette | Motif (sculpt) | Finish | Glow and aura |
| --- | --- | --- | --- | --- |
| The Bloodied Hand (`set.bloodied`) | blood-red lacquer and black iron | claws, hand emblem, blood | lacquer | drips, 0xff1c1c |
| Vestments of the Kindled (`set.kindled`) | scorched crimson and candle flame | flames, flame emblem, cracks | matte | embers, 0xffb83a |
| Trail of the Quick (`set.quickstep`) | moss leather and bright silver | feathers, feather emblem, tatters | satin | wisp, 0x8affb0 |
| Bonefetter Regalia (`set.bonefetter`) | bone and verdigris, corpse-light | skulls, skull emblem, bones | weathered | souls, 0xb8ff5a |
| Grave Warden's Watch (`set.gravewarden`) | grave bronze and lantern amber | eyes, eye emblem, rivets, runes | weathered | motes, 0xffb030 |
| Frostwrought Panoply (`set.frostwrought`) | ice blue and frosted silver | crystals, snowflake emblem, frost | frosted | frost, 0x8ad0ff |
| The Stormbound Circuit (`set.stormbound`) | storm navy and burnished copper | bolts, bolt emblem, coils | polished | sparks, 0x9ae8ff |
| Venomthread Weave (`set.venomthread`) | black silk and venom green | spiders, web emblem, web | satin | drips, 0x60ff30 |
| Aegis of the Iron Vow (`set.ironvow`) | gunmetal and royal blue | chains, shield emblem, rivets | polished | soft, 0x5a8aff |
| Ashwalker's Legacy (`set.ashwalker`) | blackened iron and ember cracks | dragons, ember emblem, cracks, scales | blackened | ash, 0xff4a10 |
| The Gilded Compact (`set.gilded`) | full gold with a gold shine | coins, coin emblem, gilded | gilt | shine, 0xffd040 |
| Nightfall Communion (`set.nightfall`) | void violet and black | moons, moon emblem, smoke | satin | smoke, 0x9064ff |
| Regalia of the Sundered Sky (`set.sunderedsky`) | white and silver with a white glow | stars, star emblem, halo | pearl | sparkles, 0xf0f4ff |
| Warplate of the Last Legion (`set.lastlegion`) | polished brass and legion crimson | wings, laurel emblem, laurels, tatters | polished | embers, 0xff7040 |
| The Hollow King's Court (`set.hollowking`) | obsidian and pale gold, spectral cyan | antlers, crown emblem, spikes, smoke | satin | souls, 0x50f0e0 |


## `src/scenes/HeroModel.ts` — owned by heroes

The one place the game builds a player hero: body, worn armour, held items and
the animator. Play (`Player`), the paperdoll, character select, the showcase
and the class portraits all use it.

```ts
export const VISUAL_SLOTS: EquipSlot[];   // slots that put geometry on the body
export function weaponGrip(category: string | undefined, twoHanded: boolean): string;   // from hero/Hold.ts
export class DressedHero {
  constructor(classId: CharClassId, seed?: number);
  readonly root: THREE.Group; readonly bones: Record<string, THREE.Bone>; readonly animator: HeroAnimator;
  dress(pieces: Partial<Record<EquipSlot, Piece | null>>): boolean;   // rebuilds only changed slots; true if any changed
  objectFor(slot: EquipSlot): THREE.Object3D | null;
  dispose(): void;   // leaves cached meshes and shared materials alone
}
export function buildClassHero(classId: CharClassId): HeroModel;      // in its field kit, for select screens
export function buildCharacterHero(c: Character): HeroModel;          // in its real gear
```

Class portraits (`src/art/Portraits.ts`): `classPortrait(classId, size):
Promise<string>` renders the class hero head and shoulders and caches the data
URI (memory and localStorage); `classPortraitUri` returns a ready one or ''.

## Hero rig — `src/art/hero/*` — owned by heroes

Every player class and every townsperson stands on this rig and is driven by
the hero animator. Bone and socket names below are stable: they will not be
renamed.

**Space.** Character space: +X the character's left, +Y up, +Z forward, feet on
y = 0. Every bone has an identity rotation in the bind pose, so at rest a
bone's local axes are character axes. Bind pose is an A-pose (arms 45 degrees
below horizontal, palms down, thumbs forward); nobody is ever shown in it.

**Bones** (`HERO_BONES`, parents first):

```
root                          on the floor under the pelvis
└ pelvis                      4.02 h
  ├ spine                     lumbar, 4.55 h
  │ └ chest                   ribcage, 5.30 h
  │   ├ neck                  6.24 h
  │   │ └ head                atlas pivot, 6.62 h (crown at 7.5 h)
  │   ├ clavL → upperArmL → foreArmL → handL → fingersL → fingerTipsL
  │   │                                      └ thumbL
  │   └ clavR → upperArmR → foreArmR → handR → fingersR → fingerTipsR
  │                                          └ thumbR
  ├ thighL → shinL → footL → toeL
  └ thighR → shinR → footR → toeR
```

`h` is one head, `height / 7.5`. L is the character's left (+X).

**Sockets** (`HERO_SOCKETS`): `Object3D` children of a bone, each with its own
rotation. Attach a model to a socket at identity (`socket.add(model)`), never
to a bone directly.

| Socket | Bone | Frame |
| --- | --- | --- |
| `mainHand` | handR | Grip centre inside the fist. +Y along the grip, out of the thumb side (where a blade points). +X wrist to knuckles (where an edge faces). +Z = X × Y. |
| `offHand` | handL | Same as `mainHand`, on the left fist. |
| `back` | chest | Centre of the upper back on the skin. +Y up the spine, +Z out of the back. |
| `quiver` | chest | Across the back, mouth up over the right shoulder. +Y toward the mouth, +Z out of the back. |
| `belt` | pelvis | Front of the belt line. +Y up, +Z forward. |
| `beltL`, `beltR` | pelvis | Belt line at the left and right hip, +Z pointing out sideways. Scabbards and pouches. |
| `head` | head | Centre of the cranium. +Y up, +Z forward. Crowns, halos, head effects. |
| `chest` | chest | Front of the sternum on the skin. +Y up, +Z forward. Amulets, chest effects. |
| `castL`, `castR` | handL, handR | Palm centre. +Y out of the palm. Spell origins. |

Held items keep the weapon contract: grip at the origin, business end along
+Y, wide on X, thin on Z. Put on the `mainHand` socket at identity, a sword is
held like a sword. The hero code adds a per-weapon grip turn (reverse grip for
daggers, bow hand for bows) on a child node of the socket, so item models never
need to know who holds them.

```ts
// src/art/hero/Rig.ts
export const HERO_BONES: readonly HeroBone[];
export const HERO_SOCKETS: readonly HeroSocket[];
export const SOCKET_BONE: Record<HeroSocket, HeroBone>;
export interface BodyShape { sex: 'male' | 'female'; height: number; build: number; shoulders?: number; hips?: number; wasted?: number }
export interface HeroRig {
  root: THREE.Group; skeleton: THREE.Skeleton;
  bones: Record<HeroBone, THREE.Bone>; sockets: Record<HeroSocket, THREE.Object3D>;
  shape: BodyShape; joints: Record<HeroBone, THREE.Vector3>;   // bind pose, character space
}
export function buildRig(shape: BodyShape, name?: string): HeroRig;   // bones and sockets only
```

**Animation events.** The hero animator (`src/art/hero/Animator.ts`,
`HeroAnimator`) keeps the hit frame and the release frame:

```ts
type HeroEvent = 'hit' | 'release' | 'step' | 'end';
animator.on(event: HeroEvent, fn: (e: { clip: string; side?: 'L' | 'R' }) => void): () => void;
animator.play(action: string, opts?: { fade?; speed?; once?; hold?; restart?; force?;
  contact?: number;   // seconds from now to the hit / release frame; the clip is time-warped to land it
  onEnd?: () => void });
animator.actionState: { clip: string; t: number; contact: number | null } | null;
animator.castGlow: number; animator.castHands: 'left' | 'right' | 'both' | null;
```

- `hit` fires on the frame a strike lands. `release` fires on the frame a
  spell, arrow or thrown thing leaves the hand. Both come exactly `contact`
  seconds after `play()` when `contact` is given, which is how they stay
  locked to `Player.contactIn` (`CLIP_CONTACT`, `contactDelay`) and to the
  timing in `src/scenes/SkillRunner.ts`.
- `step` fires when a foot plants, with `side`. Footstep sounds and dust can
  key off it.
- Stance: `setWeapon(grip)` (the `WeaponGrip` names) and
  `setOffHand('none' | 'shield' | 'weapon' | 'focus')` pick how the hero
  stands and carries (one hand, dagger, wand, dual, shield, two hand, staff,
  bow). Put held models in hand with `holdItem(rig, slot, model, grip)` from
  `src/art/hero/Hold.ts`, never on the socket directly.
- Game rules still own timing: damage lands on `Player.contactIn`, never on an
  animation event. The animation bends to the rules, not the other way round.

Action names the game plays are unchanged: `idle walk run attack1 attack2 cast
shoot slam thrust lunge channel point plant stomp roar hurl blink skyshot
snapshot dodge hurt stagger stun down death deathFwd`. `attack1` and
`attack2` resolve to the move for whatever weapon is held (sword, axe, mace,
dagger, spear, two-hander, staff, wand, bow, shield, unarmed) and chain into
combos on their own. `play(name, { side: 'L' | 'R' })` asks for a blow struck
with that hand (two blades: the basic attack's main hand opens with `R`, and
`Player.offHandBlow` swings the left); `hit` then carries the same `side`.

**Extra actions.** Other streams can add named actions without editing
`Actions.ts`. A registered name never replaces a built-in one, and calling it
again with the same name does nothing:

```ts
// src/art/hero/Actions.ts
export function registerAction(name: string, def: ActionDef): void;
```

## Townsfolk — `src/art/npc/*` — owned by npcs

The nine townspeople stand on the hero rig and are driven by the hero
animator. Their looks are in `Folk.ts`, their work, rest and talk loops are in
`Jobs.ts` (registered as `npc.<id>.work|work2|rest|talk`), and their life in
town is in `Residents.ts`.

```ts
// src/art/npc/Folk.ts
export const NPC_LOOK_IDS: readonly ['hesk','kale','vell','corvane','marrow','renn','listener','gilder','wenna'];
export function buildFolk(id: string): {
  id; root: THREE.Group; bones: Record<string, THREE.Bone>; hero: HeroModel;
  grip: CarryGrip;                                  // pass to animator.setGrip
  loops: { work: string; work2?: string; rest: string; talk: string };
};

// src/art/npc/Residents.ts
export class Residents {                            // built by Town.ts, exposed as TownBuild.residents
  attend(player: THREE.Vector3 | null, talking: string | null, engaged?: string | null): void;
  where(id: string): THREE.Vector3 | null;          // live position (wanderers move)
  facing(id: string): number;
  update(dt: number): void;                         // called from TownBuild.update
}
```

- `TownScene` calls `attend` every frame: `talking` is the story id of the
  resident in an open conversation (`dialogue().npc.id`); `engaged` is the
  keeper whose trade the player last opened. They stop, turn to the player,
  and talk; heads follow a player who comes near.
- Each resident adds one 0.8 × 0.8 collider to `TownBuild.colliders` and moves
  it as they walk.
- Props in hand are baked into the body and merged with clothes by material:
  `bakeProps(rig, held, name)` in `HandProps.ts`. Trade clothes (apron, hood,
  wimple, hats, shawl, kerchief, blindfold, burn scars) are `wearPiece` in
  `Clothes.ts`; NPC coat cuts are added to `CHEST_CUTS` under `npc.*` names.
- Budgets (checked by `tools/check-npcdraws.mjs`): at most 16 meshes a
  resident, all nine within 240 draws with one shadow pass.
- Meshing them is slow on a cold cache, so `main.ts` calls
  `prewarmTownsfolk()` (`Prewarm.ts`) at boot: a module worker
  (`FolkWorker.ts`) runs `buildFolk` for every id and posts each meshed part
  back. Fire and forget; where workers fail the town meshes them itself.

```ts
// src/art/hero/MeshCache.ts (the shared cache the worker fills)
export function loadMeshCache(): Promise<void>;     // reads IndexedDB once
export function meshCached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry;
export function onMeshed(fn: ((key: string, raw: RawGeo) => void) | null): void; // each fresh part (the worker)
export function adoptMeshes(entries: ReadonlyArray<readonly [string, RawGeo]>): void; // parts meshed elsewhere
```

## `src/entities/MonsterModels.ts` — owned by creatures

```ts
export function buildMonsterModel(visual: MonsterVisual, rng: Rng, scale: number, opts?: { family?: string; rank?: string }):
  { root: THREE.Group; bones: Record<string, THREE.Bone>; skeleton: THREE.Skeleton | null };
export function releaseMonsterModel(root: THREE.Object3D): void; // per spawn: its bone texture, private materials
export function disposeMonsterModels(): void;                    // scene exit: prototypes, bakes, materials, corpses
export class RigAnimator {                                       // re-exported from src/art/creatures/Animator.ts
  constructor(root: THREE.Object3D, bones: Record<string, THREE.Bone>, archetype: string, rng: Rng);
  update(dt: number, o: { locomotion: number; action: RigAction; actionT: number; time: number; deathT: number }): void;
  react(kind: 'hit' | 'stagger', fromYaw?: number): void;        // optional extra flinch from a direction
  setPhase(i: number): void;                                     // boss phase (Boss.enterPhase calls it)
  readonly creature: CreatureAnimator;                           // events and sockets, below
}
```

Build and animator each make a fixed number of draws from the caller's
stream (build: one pick, one fork per new variant of the old cache key, one
pick, two jitters; animator: one), so packs, affixes and AI rolls after a
spawn stay where they were tuned.

When a death reaches `deathT` 1 the animator leaves a frozen copy of the
body in the scene (the root's top ancestor) and hides the live root, so
whatever `Enemy` does with the root afterwards is not seen. Ghosts, swarms
and wisps leave nothing. `disposeMonsterModels` clears the corpses.

## Creature rigs — `src/art/creatures/*` — owned by creatures

Every monster and boss is a skinned creature: one to three draw calls
(materials `skin`, `alt`, `metal`), identity bind rotations, character space
+X left, +Y up, +Z forward, the floor at y = 0 before `scale`.

Rig kinds and their bones (`*L` bones have an `*R` twin):

| kind | used for | bones |
|---|---|---|
| `biped`, `brute`, `giant` | skeletons, ghouls, cultists, demons, golems | `hips spine chest neck head jaw armL foreL handL legL shinL footL`, optional `hockL` (digitigrade), `arm2L fore2L hand2L`, `tail1..n`, `wingL wingL2 wingL3` |
| `quadruped` | hounds, wolves, bears, lions, stags | `hips spine chest neck head jaw fLegL fShinL fFootL hLegL hShinL hHockL hFootL tail1..n` |
| `spider`, `insect` | spiders, ticks, beetles, mantises, wasps | `body abdomen sting head mandL leg{i}L knee{i}L foot{i}L wingL wingL2` |
| `serpent` | basilisks, worms, vines, larvae | `body f1..fn head jaw t1..tn` |
| `flyer` | bats, harpies, wyverns, djinn | `body chest neck head jaw wingL wingL2 wingL3`, optional arms, legs, tail |
| `specter` | wraiths, banshees, shades | `hips spine chest neck head jaw armL foreL handL robeF1 robeF2` (and `B L R`) |
| `ooze` | slimes, puddings, amalgams | `body top lobe{i} podL podL2` |
| `floater` | eyes, pylons, wisps, totems | `core eye crown orb{i} ten{i}_{k}` |
| `swarm` | wisp clouds, gales | `core mote{i}` |

Sockets, as `Object3D`s named `socket:<name>` under the root and riding a
bone: `head`, `mouth`, `chest`, `core`, `handL`, `handR`, `weapon` (the
weapon tip, or the mouth or sting of an unarmed body). Read with
`creatureSocket(root, name)`; world position via `getWorldPosition`.

Events (`rig.creature?.on(event, fn)`), fired from inside `update`:

- `hit` at a strike's moment of impact (`clip`: the attack kind, `side`).
- `release` when a ranged or cast action lets go (arrow, spit, bolt).
- `step` when a foot plants (`side`), for footstep sounds and dust.
- `end` when a one-shot finishes.

Timing follows `Enemy`'s drive: the wind-up is `attack` or `cast` for
`windup + 0.1` s, the strike a fresh `attack` of 0.4 s (impact at about 15 %
of it), death runs `deathT` 0..1 over 0.8 s and the body is down by 0.8.

## `src/audio/Audio.ts` — owned by audio

Recorded CC0 samples, music and ambience (`public/assets/sounds/`,
`public/assets/music/`, every file in `ASSETS.md`), built by
`node tools/build-audio.mjs` from `tools/audio/recipe.mjs`. A missing file
is silent, never an error.

```ts
export const audio: {
  init(settings: GameSettings): void;
  /**
   * Fire a one-shot. `id` is a bank id (`sounds/<id>/NN.ogg`) or folds onto
   * one by family: `cast.<element>`, `impact.<element>`, `nova.<element>`,
   * `monster.<family>.<aggro|attack|hurt|death>`, `footstep.<surface>`,
   * `drop.<rarity>`, `pickup.<rarity>`. x/z place it in the stereo field.
   */
  play(id: string, opts?: { volume?: number; pitch?: number; x?: number; z?: number }): void;
  /**
   * Crossfade the music to `track` and, for a place, its ambience bed. Keys:
   * 'menu' | 'title' | 'charSelect' | 'town' | 'death' | 'victory' |
   * 'ambient' (back to the place) | 'boss.<anything>' | any biome id or
   * biome music key. Unknown biome ids fold onto a place by name (see below).
   */
  music(track: string, fadeSeconds?: number): void;
  /** Set the ambience bed alone, by biome id or place. null for silence. */
  ambience(bed: string | null): void;
  /** Position the listener (the hero). Walking plays footsteps for the bed's floor. */
  setListener(x: number, z: number, facing?: number): void;
  setCombatFloor(v: number): void;
  applySettings(settings: GameSettings): void;
  stopAll(): void;
};
export function resolvesSound(id: string): boolean;
```

Places (`src/audio/Places.ts`): every music key and biome id folds onto one
of town, crypt, caverns, foundry, temple, hive, frozen, desert, tomb, void,
forest, swamp, hell; first by exact name, then by keyword in the id
(`/forest|wood|grove/` is forest, `/tomb|pyramid/` is tomb, `/frost|ice|tundra/`
is frozen, and so on). A new biome needs no audio change if its id names its
kind. Each place has music, a bed (loops plus scattered one-shots) and a
footstep surface.

Events the engine listens to: `sfx`, `music`, `settings:changed`,
`ui:open`/`ui:close`, `loot:pickedUp` (pickup by item kind), `boss:engaged`
(the boss intro sting).

## `src/fx/Particles.ts` / `src/fx/Effects.ts` — owned by vfx

Built on the pooled kit in `src/fx/kit/` (particles, ribbons, lights,
instanced shapes, solids, ground). Nothing allocates per frame. The effect
lab `tools/vfxlab.html` (rendered by `tools/check-decals.mjs`) shows every
family on a dark floor in seconds.

```ts
/** One pooled GPU particle system per scene. Scenes create it and tick it. */
export class FXSystem {
  constructor(scene: THREE.Scene, quality: QualityProfile);
  update(dt: number, elapsed: number, camera?: THREE.Camera): void;
  /** Named emitters: 'hit.physical','hit.fire','blood','embers','dust','heal',
   *  'levelup','portal','bossSlam','crit','frost','shock','poison','void'. */
  /** `count` 12 = as authored, capped at 3x; `scale` capped at 3.5. A burst's
   *  single heart flash or ring is drawn once whatever the count. */
  burst(id: string, x: number, y: number, z: number, opts?: { count?: number; color?: number; scale?: number; dir?: THREE.Vector3 }): void;
  /** Continuous ambient emitter tied to a biome. */
  setAmbient(kind: string | null, bounds: THREE.Box3): void;
  /** Floating combat text. */
  damageNumber(text: string, x: number, y: number, z: number, color: number, crit: boolean): void;
  dispose(): void;
}

/** Screen-space and world decals: scorch marks, blood pools, telegraphs. */
export class DecalSystem {
  constructor(scene: THREE.Scene, quality: QualityProfile);
  add(kind: string, x: number, z: number, radius: number, rotation?: number, life?: number): void;
  /** Ground telegraph for boss/enemy abilities. Returns a handle to update/clear. */
  telegraph(kind: 'circle' | 'cone' | 'line' | 'ring', x: number, z: number, size: number, rotation: number, duration: number, color?: number): { cancel(): void };
  update(dt: number): void;
  dispose(): void;
}

/** Effects that live on bodies (src/fx/BodyFX.ts). */
export class BodyFX {
  constructor(effects: EffectSystem);
  /** Swing ribbon from the held weapon on the animator's `hit`; hand flare on `release`. Returns the unbind. */
  bindHero(hero: { root; animator }, school: () => School, release?: () => School | null): () => void;
  /** Same for a creature: hand-to-`socket:weapon` ribbon on `hit`, flare at the tip or mouth on `release`. */
  bindCreature(root: THREE.Object3D, rig: CreatureAnimator | null, school: () => School): () => void;
  /** Wear status looks (burning, chilled, frozen, shocked, poisoned, bleeding, stunned, cursed). Bodies taken out of the scene drop out. */
  trackQuery(obj: THREE.Object3D, src: { hasStatus(id): boolean; isBleeding: boolean }, opts?: { height?; radius?; lit? }): void;
  trackList(obj: THREE.Object3D, src: StatusContainer, opts?: { height?; radius?; lit? }): void;
  untrack(obj: THREE.Object3D): void;
  update(dt: number, camera?: THREE.Camera): void;
  clear(): void;
}
```

`EffectSystem` extras used across streams:

```ts
/** A boss phase change erupting in `school` (shake and knockback are the caller's). */
bossPhase(x: number, z: number, size: number, school?: School): void;
/** A portal tearing open, or someone stepping through one. */
gateway(x: number, y: number, z: number, color: number, kind?: 'open' | 'use'): void;
/** `carried: true`: the caller flies the shot with `handle.setEndpoint(p)` and ends it with `stop()`. */
projectile(from, to, opts: ProjectileOpts & { carried?: boolean }): EffectHandle;
```

`src/fx/MonsterFX.ts`: the dungeon scene calls `bindMonsterFX(effects)`, and
monster code (`entities/`) reads `monsterFX()` for kit projectiles, hit
recipes and boss phases. `HAZARD_GLOW[type]` names the floor glow a hazard
of each damage type uses.

`src/fx/kit/Exposure.ts`: `FX_EXPOSURE` is one uniform shared by every
light-adding effect shader. `EffectSystem.update` lowers it while flashes
pile up so a busy fight stays coloured. Telegraphs ignore it.

`LootFX` draws resting drops' beams, floor pools and lights itself, pooled.
Item drop models carry no beam, pool or light of their own.

## `src/sim/Stats.ts` — owned by CHARACTER

```ts
export function emptyStats(): Stats;
export function addStats(into: Stats, from: Partial<Stats>): Stats;
/** Full recompute: class base + level + allocated + gear + skills + statuses. */
export function computeStats(c: Character): Stats;
/** XP required to advance FROM `level` to `level+1`. */
export function xpForLevel(level: number): number;
export function totalXpForLevel(level: number): number;
export const MAX_LEVEL: number;
```

## `src/sim/Character.ts` — owned by CHARACTER

```ts
export function createCharacter(name: string, classId: CharClassId, rng: Rng): Character;
export function grantXp(c: Character, amount: number): boolean; // true if levelled
export function allocateStat(c: Character, stat: 'strength'|'dexterity'|'vitality'|'energy'): boolean;
export function allocateSkill(c: Character, skillId: string): boolean;
export function canAllocateSkill(c: Character, skillId: string): { ok: boolean; reason?: string };
export function equipItem(c: Character, item: Item, slot?: EquipSlot): { ok: boolean; reason?: string; displaced?: Item[] };
export function unequipItem(c: Character, slot: EquipSlot): boolean;
export function skillRank(c: Character, skillId: string): number;
```

## `src/sim/Combat.ts` — owned by CHARACTER

```ts
/**
 * Rolls a damage packet from an attacker's stats. A physical packet with flat
 * elemental adds carries their shares in `parts` (drawn as their own numbers;
 * `enemy:damaged` passes them on).
 */
export function rollDamage(stats: Stats, rng: Rng, opts?: { scale?: number; type?: DamageType; ability?: string; source?: string }): DamagePacket;
/** Applies resistances, armour and block. Returns damage actually taken. */
export function mitigate(packet: DamagePacket, defender: Stats, rng: Rng): { amount: number; blocked: boolean; type: DamageType };
export function hitChance(attackRating: number, defenderDefense: number, attackerLevel: number, defenderLevel: number): number;
```

## `src/data/skillPower.ts` — what a rank buys (every class)

Every skill must be stronger at a higher rank, not only cheaper or faster
(`tools/check-rankpower.mjs` casts each one at rank 1 and 10). A skill with a
`dmg` ladder grows through it. Any other skill writes its numbers here; the
skill runner reads them. `k` is ranks past the first.

```ts
export const SELF_POWER: Record<string, (k: number, n: Num) => SelfPower>; // buff on you: status?, mods?, duration?, absorb?, absorbLifePct?, healPct?
export const FOE_POWER: Record<string, (k: number, n: Num) => FoePower>;   // curse/mark/shout on monsters: status?, mods?, duration?, magnitude?, also?
export function burstGrowth(id: string, k: number, n: Num): number;        // hit multiplier for a skill with no dmg ladder (default +8% a rank)
export function minionLifeGrowth(id: string, k: number, n: Num): number;   // summon body (default +4% a rank)
export function grownMods(base: Partial<Stats> | undefined, k: number): Partial<Stats> | undefined; // unlisted buffs: bonuses +6% a rank
```

`StatusApplication.mods` and `.absorb` set one application's stat changes and
ward in place of the def's, on the hero (`Player.applyStatus(..., { mods, absorb })`)
and on monsters. A ward with stat changes keeps its stats after the ward breaks.

## `src/sim/Loot.ts` — owned by ITEMS

```ts
/** The core drop roll. `magicFind` is a percentage. */
export function rollItem(ilvl: number, rng: Rng, opts?: { magicFind?: number; forceRarity?: ItemRarity; category?: ItemCategory; classId?: CharClassId }): Item;
/** Everything a killed monster drops. */
export function rollDrops(ilvl: number, rank: MonsterRank, rng: Rng, magicFind: number, goldFind: number): { items: Item[]; gold: number; materials: Record<string, number> };
export function itemDisplayName(item: Item): string;
/** Sorted, coloured lines for the tooltip. */
export function itemTooltipLines(item: Item, compareTo?: Item): Array<{ text: string; color: string; bold?: boolean }>;
export function itemStats(item: Item): Partial<Stats>;
export function vendorPrice(item: Item, buying: boolean): number;
export function getBase(baseId: string): ItemBase;
export const ITEM_BASES: ItemBase[];
export const AFFIXES: AffixDef[];
```

## `src/sim/Crafting.ts` — owned by ITEMS

```ts
export function upgradeCost(item: Item): { gold: number; materials: Record<string, number> };
export function upgradeItem(item: Item, rng: Rng): { ok: boolean; reason?: string };
export function rerollAffixes(item: Item, rng: Rng): { ok: boolean; reason?: string };
export function addSocket(item: Item, rng: Rng): { ok: boolean; reason?: string };
export function insertGem(item: Item, gemId: string, socket: number): { ok: boolean; reason?: string };
export function salvage(item: Item): Record<string, number>;
export function craftingRecipes(): CraftRecipe[];
```

## `src/world/DungeonGen.ts` — owned by WORLD

```ts
/** Generates a whole run: N levels for `depth`, ending in a boss floor. */
export function generateRun(depth: number, seed: number, classId: CharClassId): DungeonRun;
export function generateLevel(...): DungeonLevel; // see "Map assembly" below
export function tileAt(level: DungeonLevel, x: number, y: number): TileKind;
export function isWalkable(level: DungeonLevel, x: number, y: number): boolean;
export const TILE: Record<TileKind, number>; // enum values stored in level.tiles
export const BIOMES: BiomeDef[];
```

## `src/world/DungeonBuilder.ts` — owned by WORLD

```ts
/** Turns a DungeonLevel into meshes, lights and colliders. */
export class DungeonMesh {
  constructor(level: DungeonLevel, biome: BiomeDef, rng: Rng);
  readonly root: THREE.Group;
  /** Convex colliders / AABBs for movement. */
  readonly colliders: Array<{ x: number; z: number; w: number; d: number }>;
  /** Called each frame with the camera to drive torch flicker and LOD. */
  update(dt: number, elapsed: number, focus: THREE.Vector3): void;
  /** World position for a tile coordinate. */
  tileToWorld(x: number, y: number): THREE.Vector3;
  worldToTile(x: number, z: number): { x: number; y: number };
  /** Ground height at a world point: tile steps indoors, the terrain outdoors. */
  floorY(x: number, z: number): number;
  /** The biome art of the zone a tile is in (maps can join biomes). */
  artAt(tileX: number, tileY: number): BiomeArt;
  dispose(): void;
}
/**
 * Applies a biome's light mood (src/world/Lighting.ts): tinted fill, key light
 * (a shadow-casting sun outdoors), optional light from below, fog and the clear
 * colour. Owns scene.fog and scene.background until disposed. `hero` is the
 * light the hero should carry on this level.
 */
export function applyBiomeLighting(scene: THREE.Scene, biome: BiomeDef, variant?: string): BiomeLighting;
interface BiomeLighting {
  key: THREE.DirectionalLight;
  ambient: THREE.Light;
  hero: { color: number; intensity: number; distance: number };
  dispose(): void;
}
```

The way on is drawn from `level.exits[0].kind` and turned to its `facing`:
`stairs` (a well with steps), `doorway` (round-headed frame in a run of wall,
black inside), `gate` (raised portcullis), `caveMouth` (rock hump with a black
mouth), `portal` (a dormant ring of stones; the scene opens the real portal).

## `src/world/Lighting.ts` — owned by ground

```ts
/** How dark a level is and where its light comes from. */
export interface LightMood { sky; ground; fill; key; keyIntensity; elevation; azimuth; under?; fog; fogDensity; background; hero }
export function lightMood(biome: BiomeDef, art: BiomeArt): LightMood;
```

Outdoor biomes have a table entry (moon in the forest, low sun in the desert,
overcast tundra, red underglow in hell). Indoor moods come from the biome's own
colours at about half the old fill, so torch pools and the hero's light carry
the room.

## `src/core/Renderer.ts` grade and fog — owned by WORLD

```ts
/** A scene's colour grade. Fields left out take DEFAULT_GRADE. */
renderer.setGrade(profile?: Partial<GradeProfile>): void;   // no argument resets
// GradeProfile.haze (0..1): heat shimmer over the top of the frame (desert, hell).
/** Scene exposure trim, multiplied into the grade's exposure (town night uses 1.5). */
renderer.setExposure(v: number): void;
/**
 * Shapes every material's fog: it starts `start` metres from the camera, and
 * below `floorY` a height term (full at `fadeDepth` metres down, scaled by
 * `strength`) swallows pits. No arguments restores plain camera fog.
 */
export function setFogShape(start?: number, floorY?: number, fadeDepth?: number, strength?: number): void;
```

Biome grades live in `BiomeArt.grade` (`src/world/Biomes.ts`). DungeonScene sets
the biome grade on level load and resets it in dispose; other scenes that want a
look of their own call `setGrade` on enter.

Level geometry materials are `worldMaterial` in `src/art/WorldMaterial.ts`
(see its section above).

## `src/world/Nav.ts` — owned by WORLD

```ts
export class NavGrid {
  constructor(level: DungeonLevel);
  /** A* on the tile grid. Returns world-space waypoints, already smoothed. */
  path(from: Vec2, to: Vec2): Vec2[];
  walkable(x: number, y: number): boolean;
  /** True if a straight line between two world points is unobstructed. */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean;
  /** Nearest walkable tile to a world point. */
  clampToWalkable(x: number, y: number): Vec2;
}
```

## `src/entities/Enemy.ts` + `AI.ts` + `Boss.ts` — owned by MONSTERS

```ts
export class Enemy {
  constructor(def: MonsterDef, rank: MonsterRank, affixes: MonsterAffixDef[], depth: number, rng: Rng);
  readonly root: THREE.Group;
  readonly id: string;
  life: number; maxLife: number;
  /** The creature animator; `rig.creature` raises the hit and release frame events. */
  readonly rig: RigAnimator | null;
  /** The scene says each step whether the body is near the camera's view;
   *  out of view it skips its pose solve and casts no shadow. Default true. */
  inView: boolean;                                  // read it; change it through setInView
  setInView(v: boolean): void;
  update(dt: number, ctx: CombatContext): void;
  takeDamage(packet: DamagePacket, ctx: CombatContext): void;
  dispose(): void;
}

/** What entities need to see the world. Provided by DungeonScene. */
export interface CombatContext {
  playerPos: THREE.Vector3;
  playerStats: Stats;
  playerLevel: number;
  damagePlayer(packet: DamagePacket): void;
  nav: NavGrid;
  fx: FXSystem;
  decals: DecalSystem;
  rng: Rng;
  elapsed: number;
  enemies: Enemy[];
  scene: THREE.Scene;
}

export const MONSTERS: MonsterDef[];
export const MONSTER_AFFIXES: MonsterAffixDef[];
export const BOSSES: BossDef[];
export function pickMonstersForDepth(depth: number, biome: BiomeId, rng: Rng, count: number): MonsterDef[];
```

### Fair fights — `src/sim/FairFight.ts`, `Boss.fumble`

A boss may hurt the hero, never delete them, and a room rule done wrong costs
time, never life. `DungeonScene` marks every blow whose `source` is a boss (its
own swings, its arena, its hazards) with `packet.fair = bossHitCap(depth)`;
`Player.takeDamage` clamps it through `player.fair` (a `FairLedger`): one blow,
or a burst inside 0.6 s, takes at most that share of full life, and a hold it
carries lasts 1.5 s at most, then cannot land again for 3 s. Heavy boss moves
(`damageMul >= HEAVY_MUL`) wind up at least `WARN_MIN` seconds (`Boss.windupFor`).

```ts
export function bossHitCap(depth: number): number;        // 0.25 / 0.3 / 0.4 of full life
export class FairLedger { tick(dt): void; clamp(amount, maxLife, cap): number; hold(duration): number }
// A room rule went wrong. Heals (to the phase's start), shields, hides,
// calls adds or resets; never hurts the hero. Hands the seconds it cost back
// to the fight clock, so a fumble never brings the enrage closer. Raises
// `boss:fumble`. Back-to-back fumbles gain less.
Boss.fumble(cost: 'heal' | 'shield' | 'hold' | 'adds' | 'reset', ctx: CombatContext, seconds?: number): number;
```

`tools/check-fair.mjs` proves it, including a fumbler who gets every rule
wrong and must still win in at most twice the time.

### Boss kinds, memory, moods and wardens — `src/data/bosses.ts`, `src/data/wardens.ts`

Every `BossDef` names a `profile` (duelist, bulwark, sponge, glass, swarm,
bruiser) and a `shape` (straight, phased, puzzle). Its size follows from
`scale` unless `size` says otherwise, and `reach` keeps a resized boss's moves
as long as they were tuned (`reachOf` in Abilities). Data without its own
`lifeMul`/`damageMul` takes them from the profile and tier.

```ts
export function bossNumbers(b: BossDef): { life; damage; speed; defense; range };
export function bossSize(b): 'person' | 'tall' | 'large' | 'giant';
// A life meets every boss of its depth before any twice; the account's
// least-fought come up more. `sim/BossMemory.ts` builds the memory from the
// save and records each fight on `boss:engaged` (which now carries `id`).
export function pickBossForDepth(depth, biome, rng, memory?: BossMemory | null): BossDef;
// From tier 15: wounded, crowned, hungry, ancient, haunted. Rolled per run
// (`DungeonRun.bossMood`), passed to `new Boss(def, depth, rng, mood)`.
export function rollBossMood(def, depth, rng): BossMood | null;
export function withMood(def, mood): BossDef;
// About one floor in three keeps a warden: `DungeonLevel.warden` names it and
// its room; its chest (`chest.warden`) stays shut until it falls.
export function pickWarden(depth, biome, rng, memory?): BossDef | null;
```

The world generator gets both through `MonsterCatalog.wardenFor` and
`moodFor`. `tools/check-bosssys.mjs` covers all of it.

### Boss room rules — `src/entities/RoomRules.ts`

A phase's `arena` may name one of `RULE_KINDS` (wardPortals, heartstones, bells,
braziers, linked, lure, tiles, stalker, mirror, breakingCast, chase, defend,
guardBreak, weakPoints, chains). `Boss.setArena` builds the rule with
`makeRule(kind, boss)` and calls `start(ctx)` each phase that names it; a phase
that names the same rule keeps the same rule object.

```ts
abstract class RoomRule {
  solved: number; fumbled: number;
  start(ctx): void; tick(dt, ctx): void;
  intake(packet, ctx): number;      // share of a hero blow that lands (0 = turned aside)
  struck(taken, raw, ctx): void;    // after a hero blow
  holdDeath(ctx): boolean;          // true keeps the boss at 1 life (linked pair)
  freezesClock(): boolean;          // fight clock waits while true
  stop(ctx): void;                  // tidy objects, unhide, hide the meter
}
```

Boss surface the rules use: `rule`, `spawnAt`, `home`, `arenaRadius` (scene sets
it from the arena rect), `chasePoints` (scene may set), `channel` (no moves while
> 0), `setHidden(on, ctx)` (body hidden, `untargetable` true), `ruleStep`,
`letDie(ctx)`, `phaseStart`, plus `fumble`. Getting a rule wrong always goes
through `fumble`. Room objects (`ward_portal`, `heartstone`, `rite_bell`,
`rite_brazier`, `chain_anchor`) are `MonsterDef.object: true`: no reward, no
fight. `spawnAt(self, ctx, id, x, z, rank?)` (Abilities) places one. Events:
`boss:rule {label, value}` drives the HUD bar under the boss bar;
`boss:castEnd {}` ends a long cast's bar early. `BossDef.partner` names the
linked-pair partner; `BossDef.limbs` names weak points and the move each one
takes away. Checker: `node tools/check-roomrules.mjs`.

## `src/ui/UIRoot.ts` — owned by UI

```ts
export function mountUI(engine: Engine): void;
/** Panels respond to the `ui:open` / `ui:close` events on the bus. Panel ids:
 *  'inventory','character','skills','stash','vendor','blacksmith','map',
 *  'pause','settings','charSelect','death','questLog'. */
export function isAnyPanelOpen(): boolean;
export function closeAllPanels(): void;
```

## `src/scenes/*` — owned by SCENES (integration)

Scenes are the only place allowed to import across every vertical. They own
`TitleScene`, `CharSelectScene`, `TownScene`, `DungeonScene`, `DeathScene`, and
the `window.SLAY.debug` helpers the screenshot harness calls:

```ts
window.SLAY.debug = {
  makeCharacter(classId: CharClassId, level?: number): void;
  fillInventory(): void;
  warpToBoss(): void;
  setDepth(n: number): void;
  godMode(on: boolean): void;
};
```

## `src/entities/Controls.ts` — owned by COMBAT

```ts
/** Turns presses into actions: buffer, hold-to-cast, attack-move, force-stand, evade. */
export class CombatControls {
  constructor(player: Player, hooks: ControlHooks);
  readonly keyDir: THREE.Vector3;          // camera-relative WASD this frame
  update(dt: number, input: ControlInput, cameraYaw: number, enemies: readonly Enemy[], boss: Enemy | null): void;
  reset(): void;
  get lockedTarget(): Enemy | null;        // what the held attack button is locked onto
  get pending(): string | null;            // what is waiting in the input buffer
}
```

`Player` exposes `inRecovery`, `cancelRecovery()` and `dodgeReadyIn`. A hit that
lands during the dash emits `player:evaded` on the event bus, for the feel layer.

## `src/sim/ItemPowers.ts` — owned by DEPTH

Item powers: behaviours rather than stat lines. A unique's `special`, a set
bonus tier's `power`, and an item's rolled `powers` (power affixes) all name a
power in `POWERS`.

```ts
export const POWERS: readonly PowerDef[];
export function getPower(id: string): PowerDef | undefined;
/** Every power a character has active (uniques, set tiers, power affixes). */
export function characterPowers(c: Pick<Character, 'equipment'>): ItemPowerRoll[];
/** Folded into `passiveEffects` (cheat death, arcs, overkill...). */
export function applyPowerPassives(c, e: PassiveEffects): void;
/** Applied at the end of `computeStats` (Hollow Pact, Bearform...). */
export function applyPowerStats(c, s: Stats): void;
/** Flat record read by `scenes/PowerRuntime.ts`. */
export function powerEffects(c): PowerEffects;
/**
 * Seam for the entity layer. `Enemy.takeDamage` calls `outgoing` on every
 * player packet before mitigation and `afterHit` once it lands. Installed by
 * the dungeon's PowerRuntime, null everywhere else.
 */
export const powerHooks: { outgoing: ...; afterHit: ... };
```

`src/scenes/PowerRuntime.ts` (DEPTH) owns the live half, and is also where
Life Steal and Mana Steal are applied. DungeonScene calls `incoming(packet)`
before `Player.takeDamage`, `afterPlayerHit` after it, `update(dt)` each frame
and `onKill(enemy)` when loot is granted.

## `src/sim/LootFilter.ts` — owned by DEPTH

```ts
export function lootFilterOf(account: AccountSave): LootFilterSettings;
export function passesFilter(item: Item, f: LootFilterSettings, classId?: CharClassId): boolean;
```

DungeonScene hides filtered drops (`GroundLoot.hidden`); Shift shows them.

## `src/ui/UIRoot.ts` — registerPanel

```ts
/** Register a panel built outside UIRoot, with an optional hotkey code. */
export function registerPanel(id: string, handle: PanelHandle, hotkey?: string): void;
```

`src/ui/DepthUI.ts` (DEPTH) builds and registers every depth panel; `main.ts`
calls `mountDepthUI()` right after `mountUI`.

## `src/sim/Legacy.ts` — owned by DEPTH

Account progression that survives death. State lives on `AccountSave.legacy`
(repaired by `legacyOf`, back-credited for old saves).

```ts
export function legacyOf(account: AccountSave): LegacyState;
export function grantRenown(account: AccountSave, amount: number): RenownGain; // ranks + unlocks crossed
export function hasUnlock(account: AccountSave, id: string): boolean; // 'bounties','gambler','enchanter','waypoints','pacts','stashTab','perkCap'
export function bindLegacyAccount(fn: () => AccountSave | null): void;   // main.ts binds save.account
export function applyLegacyStats(s: Stats): void;     // called by computeStats
export function legacyXpMultiplier(): number;         // DungeonScene.grantKill
export function legacyPriceMultiplier(): number;      // Loot.vendorPrice(buying)
export function legacySalvageMultiplier(): number;    // Crafting.salvage
export function legacyStartingBonus(c: Character): { gold: number; potions: number }; // createCharacter
```

`src/scenes/RunDirector.ts` (DEPTH) is DungeonScene's seam for renown, the
Codex and the lifetime tally: `onFloor(index)`, `onKill(rank)`,
`onRunCleared()`, `onDeath()`. Panel: `src/ui/LegacyPanel.ts`, hotkey G.

## Dungeon events — DEPTH

`DungeonGen.placeEvents` puts set pieces on ordinary floors (never boss
floors): `chest.cursed`, `corpse.ambush`, `shrine.choice` props and the
treasure runner (`DungeonLevel.events`). Rates in `EVENT_RATES`;
`forceEvents(true | false | null)` is for checkers. `src/scenes/RunEvents.ts`
runs them; DungeonScene calls `onLevel`, `interact`, `onKill`, `update`.

```ts
// src/ui/ChoiceSeam.ts — DOM-free, so systems can offer a choice headlessly.
export function offerChoice(title, subtitle, options: ChoiceOption[], onPick: (id: string | null) => void): void;
export function setChoiceHandler(h: ChoiceHandler | null): void; // DepthUI installs the panel
```

Every floor is guaranteed a plain chest (`isPlainChest`), a floor a collect
quest owes gets its `quest.altar`, and a cleanse quest gets enough
`isQuestShrine` shrines spread over the run.

## Generated quest pickups — DEPTH

`src/scenes/QuestTokens.ts` says what a moment is worth to the run's quest:
relics (chests, the quest altar, elites, the boss), corpse-keys (champions and
up), `marker:bottom` (the last floor), `marker:altar`, `marker:exit` (a down
stair). DungeonScene calls `questTokens.kill / chest / altar / floor / exit`.

## Town services — DEPTH

```ts
// src/sim/TownServices.ts — state on Character.town (repaired by repairCharacter)
export function gamble(c, offerId): { ok; reason?; item? };
export function reforgeMod(c, item, modIndex, pay): ServiceResult;   // Item.enchantedMod: only that mod again
export function imbuePower(c, item, pay): ServiceResult;              // rares without a power
export function refreshBoard(c) / acceptBounty / abandonBounty / claimBounty;
export function bountyProgress(c, kind, depth, amount?): Bounty[];    // called by RunDirector
```

`src/scenes/TownStations.ts` draws the gambler's table, the enchanter's lectern
and the bounty board in camp and adds their interaction points; TownScene calls
`mountTownStations(scene, town.colliders, interactables)` once. Each opens its
panel (`gambler`, `enchanter`, `bounties`, registered in `DepthUI`) when the
Legacy unlock is reached, and says what it takes before that.
`RunEvents`' host `renown(amount, event?)` names finished events so bounties
can count them.

## Combat additions — owned by COMBAT

```ts
// src/sim/HeroPower.ts — the hero compounds with level as the dungeon does with depth.
export function heroPower(level: number): { damage: number; life: number }; // 1 up to level 8
export function applyHeroPower(level: number, s: Stats): void;               // end of computeStats
// src/sim/Combat.ts — the multiplier SkillRunner uses: rank with +skills, plus synergies.
export function skillDamageScale(skills: Record<string, number>, skillLevels: number, skillId: string): number;
// src/entities/Combos.ts — a different skill on the heels of another is a combo.
export function comboForSkill(skill: SkillDef): ComboDef | null;   // name, desc, colour
export function comboBonusPct(skill: SkillDef): number;            // 25..50 by tier
// src/entities/Player.ts — melee lands at the swing's contact frame.
export const CLIP_CONTACT: Record<string, number>; export const CONTACT_CAP: number;
player.contactIn; player.actionId;
```

Events: `combat:combo` { id, name, setup, payoff, bonusPct, x, y, z }. Only
`Enemy.die` raises `enemy:killed` and only `Boss.die` raises `boss:killed`.

## `src/core/Assets.ts` — owned by ground

Downloaded CC0 files under `public/assets/` (every one listed in `ASSETS.md`).
Nothing may fail when a file is missing: every call below resolves to a
fallback (`null`, or a flat texture) instead of throwing.

```ts
/** URL of a file under public/assets/, e.g. assetUrl('sounds/hit_01.ogg'). */
export function assetUrl(rel: string): string;
/** Raw bytes, fetched once and shared. null on any failure. */
export function fetchAsset(rel: string): Promise<ArrayBuffer | null>;
/** Decoded image (ImageBitmap, pre-flipped for GL), cached. null on failure. */
export function loadImage(rel: string): Promise<ImageBitmap | HTMLImageElement | null>;
/**
 * A shared texture returned at once holding a 2 px fallback colour; the real
 * image is swapped in when it decodes (fires a 'loaded' event on the texture).
 * srgb: true for colour maps, false for normal/roughness/AO/height data.
 * Never dispose it yourself; releaseAssetTexture(rel) evicts.
 */
export function loadTexture(rel: string, opts?: { srgb?: boolean; fallback?: number; fallbackAlpha?: number; wrap?: THREE.Wrapping; anisotropy?: number }): THREE.Texture;
export function textureReady(tex: THREE.Texture): Promise<boolean>;
/**
 * Fetch (and decode images) ahead of time. Emits 'assets:progress'
 * { loaded, total, label } on the event bus, which the boot bar and the
 * loading card show. Never rejects; missing files are returned in `missing`.
 */
export function preloadAssets(rels: string[], label?: string, onProgress?: (p: number, label: string) => void): Promise<{ ok: number; missing: string[] }>;
```

Tools: `node tools/check-assets.mjs` (ledger, CC0, formats, budgets: textures
70 MB, sounds 25 MB, music 35 MB, 4 MB per file). `node tools/bundle-artifact.mjs`
writes `dist-single/slay.html` plus `dist-single/files.json`, the `files`
mapping (published path -> repo path) to publish the assets beside the page.

## Maps → ground (what a map is) — owned by MAPS

Design: `docs/remake/maps.md` "Design". Types: `MapZone`, `MapExit`, `MapInfo`
and the new `DungeonLevel` fields in `src/types.ts`.

- One portal trip is one map, `DungeonRun`. `run.levels` is the list of
  **areas**: one area is one load. `run.map` names the map, its tier (equal to
  `run.depth`) and every zone in order.
- An area holds one or two zones: `level.zones` and `level.zoneOf` (zone index
  per tile, every tile including walls and void). Two outdoor zones in one area
  meet at a seamless edge; draw each tile in its zone's biome and blend across
  the seam. `zone.outdoor` means open sky: no roof lid, no ceiling.
- A level with no `zones` is one zone of `level.biome` (previews, old tools).
- `level.biome` is the area's first zone's biome. Lighting, fog and grade for
  a two-zone area may follow the zone the hero stands in (`zoneOf`).
- Tile kinds added: `ruin` 10 (blocks), `deepWater` 11 (blocks), `bridge` 12
  (walkable), `ice` 13 (walkable). Collision and walkability come from
  `isWalkableValue` (world/Layouts.ts) as always.
- **Unknown kinds:** `drawAsKind(v)` (world/Layouts.ts) returns the old kind to
  draw a tile as until the builder knows it: blocking kinds draw as a blocking
  look (`ruin` as wall, `deepWater` as water), walkable ones as floor, any
  value it does not know as wall. Call it wherever the builder reads a tile
  for drawing.
- In an outdoor zone a `wall` tile is that biome's natural edge: tree line
  (darkForest), dead trees and reeds (swamp), dune ridge or rock (desert),
  cliff (tundra), rock and slag (ashwaste, hell). `ruin` is masonry anywhere.
- Ways out: `level.exits` (first one = the way on, at `level.exit`), each with
  a `kind` (caveMouth, doorway, stairs, gate, portal) and `facing`. The builder
  draws them. `level.waypoint` (first area only) is the town waypoint.
  `level.arena` is the boss arena rectangle and its `gate` tile.
- New biome ids (`darkForest`, `swamp`, `desert`, `desertTomb`, `tundra`,
  `hell`) carry gameplay fields only. `biomeArt(id)` falls back to the closest
  old look (table in maps.md) until ground writes their art.

```ts
// src/world/Layouts.ts
export function drawAsKind(v: number): number;
export const T_RUIN = 10, T_DEEP_WATER = 11, T_BRIDGE = 12, T_ICE = 13;
// src/world/DungeonGen.ts
export function generateRun(depth: number, seed: number, classId: CharClassId): DungeonRun; // now a map
export function zoneAt(level: DungeonLevel, x: number, y: number): MapZone | null;
```

## Map assembly — owned by MAPS

- `planMap` rolls the map: a themed chain of 3 to 5 zones (`THEMES`), split
  into areas. Outdoor zones in a row share an area, two at most; an indoor
  zone is an area of its own; four areas at most. The last zone is the boss
  zone, with the arena at its far end. A contract biome (`want`) becomes the
  boss zone and every zone past the first.
- `generateRun` calls `generateLevel` once per area with an `AreaContext`.
  Each zone has its own monster budget (`zoneBudget`) and monster pool (its
  own biome). Heat rises from 0 in the first zone to 1 in the boss zone.
- Tiles 7 and 8 are now `exit` (`T_EXIT`, the way on) and `arrival`
  (`T_ARRIVAL`, where the hero lands). `T_STAIRS_DOWN` and `T_STAIRS_UP` stay
  as deprecated aliases until Props.ts moves over.
- `MapExit.facing` is the direction you walk through it, after the area's
  random turn. `turnVec` turns any east-pointing direction the same way.
- The scene draws the waypoint (a gold ring at `level.waypoint`). `[E]` there
  goes home and gives the map up. Props are kept off it.
- Events: `depth:changed` carries `mapName`, and `place` is the arrival
  zone's name. `zone:entered {name, biome, order, of, depth, mapName}` fires
  when the hero crosses into another zone of the same area.
- The boss waits (`Boss.dormant`) until hero and boss are both inside
  `level.arena`; then the scene seals the gate tiles and engages it. The gate
  opens when the boss falls.
- Charts: `src/ui/ZoneInk.ts` (`zoneInks`, `zoneInkAt`, `newKindInk`,
  `wayMarks`) is shared by the minimap and the full map.

```ts
// src/world/MapGen.ts
export function planMap(tier: number, rng: Rng, want?: BiomeId, minZones?: number): MapPlan; // { info, areas, bossBiome }
export function zoneHeat(order: number, zones: number): number; // 0 first zone, 1 boss zone
export const MAX_AREAS = 4, MAX_ZONES_PER_AREA = 2;
// src/world/zones/Area.ts
export function buildArea(plan: AreaPlan, rng: Rng): AreaOut; // grid, rooms, zones, zoneOf, entry, exit, arena?, turn, facing
export function turnVec(dx: number, dy: number, turn: number): Vec2;
// src/world/DungeonGen.ts
export interface AreaContext { zonesTotal: number; budgetScale: number; next?: ZonePlan }
export function generateLevel(depth: number, levelIndex: number, levelsTotal: number,
  zonesOrBiome: BiomeId | ZonePlan[], seed: number, quest?: QuestInstance, modifiers?: string[], actx?: AreaContext): DungeonLevel;
export function zoneBudget(depth: number, floorTiles: number, heat: number): number;
```
