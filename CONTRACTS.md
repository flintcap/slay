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
export function paletteKeys(): string[];
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

Small effect textures (glow, beam, rune ring, web, crack, macro noise) live in
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

## `src/art/ItemModels.ts` — owned by ART

```ts
/** Builds a 3D model for an item from its base's `visual` block. */
export function buildItemModel(visual: ItemVisual, rng: Rng, rarity: ItemRarity): THREE.Object3D;
/** Small mesh used for ground drops (with rarity-tinted light shaft). */
export function buildDropModel(item: Item, rng: Rng): THREE.Object3D;
```

## `src/art/CharacterModels.ts` — owned by ART

```ts
/**
 * Builds a rigged player model. The skeleton bone names are fixed so the
 * animation layer can drive any class: 'root','hips','spine','chest','head',
 * 'shoulderL/R','elbowL/R','handL/R','hipL/R','kneeL/R','footL/R'.
 */
export function buildPlayerModel(classId: CharClassId, rng: Rng): { root: THREE.Group; skeleton: THREE.Skeleton; bones: Record<string, THREE.Bone> };
/** Attaches an equipped item's model to the correct hand/body socket. */
export function attachToSocket(model: THREE.Object3D, bones: Record<string, THREE.Bone>, slot: EquipSlot, mesh: THREE.Object3D): void;
```

## Hero rig — `src/art/hero/*` — owned by heroes

Every player class and every townsperson stands on this rig and is driven by
the hero animator. Bone and socket names below are stable: they will not be
renamed. (The old `CharacterModels` rig with `hips`, `shoulderL`, `elbowL`,
`hipL`, `kneeL` is being replaced by this one and will be deleted.)

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
- Game rules still own timing: damage lands on `Player.contactIn`, never on an
  animation event. The animation bends to the rules, not the other way round.

Action names the game plays are unchanged: `idle walk run attack1 attack2 cast
shoot slam thrust lunge channel point plant stomp roar hurl blink skyshot
snapshot dodge hurt stagger stun down death deathFwd`. `attack1` and
`attack2` resolve to the move for whatever weapon is held (sword, axe, mace,
dagger, spear, two-hander, staff, wand, bow, shield, unarmed) and chain into
combos on their own.

## `src/entities/MonsterModels.ts` — owned by MONSTERS

```ts
export function buildMonsterModel(visual: MonsterVisual, rng: Rng, scale: number):
  { root: THREE.Group; bones: Record<string, THREE.Bone>; skeleton: THREE.Skeleton | null };
```

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

## `src/fx/Particles.ts` / `src/fx/Effects.ts` — owned by FX

```ts
/** One pooled GPU particle system per scene. Scenes create it and tick it. */
export class FXSystem {
  constructor(scene: THREE.Scene, quality: QualityProfile);
  update(dt: number, elapsed: number): void;
  /** Named emitters: 'hit.physical','hit.fire','blood','embers','dust','heal',
   *  'levelup','portal','bossSlam','crit','frost','shock','poison','void'. */
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
```

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
/** Rolls a damage packet from an attacker's stats. */
export function rollDamage(stats: Stats, rng: Rng, opts?: { scale?: number; type?: DamageType; ability?: string; source?: string }): DamagePacket;
/** Applies resistances, armour and block. Returns damage actually taken. */
export function mitigate(packet: DamagePacket, defender: Stats, rng: Rng): { amount: number; blocked: boolean; type: DamageType };
export function hitChance(attackRating: number, defenderDefense: number, attackerLevel: number, defenderLevel: number): number;
```

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
  dispose(): void;
}
/** Applies a biome's lighting and fog to a scene. */
export function applyBiomeLighting(scene: THREE.Scene, biome: BiomeDef): { key: THREE.DirectionalLight; ambient: THREE.Light; dispose(): void };
```

## `src/core/Renderer.ts` grade and fog — owned by WORLD

```ts
/** A scene's colour grade. Fields left out take DEFAULT_GRADE. */
renderer.setGrade(profile?: Partial<GradeProfile>): void;   // no argument resets
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
