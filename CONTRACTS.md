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

## `src/art/Materials.ts` — owned by ART

```ts
/** Front-loads texture generation onto the boot bar. */
export function warmMaterials(onProgress: (p: number, label: string) => void): Promise<void>;

/**
 * The material library. `key` is a palette name such as 'stone.crypt',
 * 'metal.iron', 'wood.oak', 'cloth.linen', 'flesh.rotted', 'crystal.void'.
 * Returns a shared, cached MeshStandardMaterial with albedo/normal/roughness/AO.
 * Never mutate the result — call `surfaceVariant` for a tweaked copy.
 */
export function surface(key: string, opts?: SurfaceOpts): THREE.MeshStandardMaterial;
export function surfaceVariant(key: string, opts: SurfaceOpts): THREE.MeshStandardMaterial;
export function paletteKeys(): string[];

export interface SurfaceOpts {
  /** World-space texture repeat. */
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

## `src/entities/MonsterModels.ts` — owned by MONSTERS

```ts
export function buildMonsterModel(visual: MonsterVisual, rng: Rng, scale: number):
  { root: THREE.Group; bones: Record<string, THREE.Bone>; skeleton: THREE.Skeleton | null };
```

## `src/audio/Audio.ts` — owned by FX

```ts
/** Fully synthesised — no audio files. */
export const audio: {
  init(settings: GameSettings): void;
  /** Fire a one-shot. `id` keys into the synth registry. */
  play(id: string, opts?: { volume?: number; pitch?: number; x?: number; z?: number }): void;
  /** Crossfade the procedural music layer. */
  music(track: string, fadeSeconds?: number): void;
  /** Position the listener for panning. */
  setListener(x: number, z: number, facing: number): void;
  applySettings(settings: GameSettings): void;
  stopAll(): void;
};
```

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
export function generateLevel(depth: number, levelIndex: number, levelsTotal: number, biome: BiomeId, seed: number): DungeonLevel;
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
