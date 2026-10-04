# SLAY AAA Overhaul

Goal: take SLAY from "good base" to something that looks, sounds and plays
like a finished, premium action RPG. Six workstreams run in parallel, each
owned by one agent, each checkpointing to git so it can be stopped at any
moment and resumed later with nothing lost.

## Workstreams

| Stream | Progress file | Owns |
| --- | --- | --- |
| hud | `hud.md` | In-game HUD, panels, tooltips, icons, the visual design system |
| menus | `menus.md` | Title, character select, loading, pause, settings, death, banners, onboarding |
| animation | `animation.md` | Player and monster models, animation, hit reactions, deaths |
| world | `world.md` | Textures, materials, lighting, post-processing, props, biomes' look, town |
| feel | `feel.md` | Combat feedback, skill VFX, camera, loot drops, all audio and music |
| depth | `depth.md` | Items, affixes, uniques, progression, encounters, crafting, run variety |

## File ownership

Each stream edits only the files it owns. Anything else is "shared": edit it
only in small additive changes (new lines, new exports), never rewrite it.

- **hud**: `src/ui/HUD.ts`, `Widgets.ts`, `Tooltip.ts`, `InventoryPanel.ts`, `SkillTreePanel.ts`,
  `CharacterPanel.ts`, `PaperdollView.ts`, `VendorPanel.ts`, `BlacksmithPanel.ts`, `StashPanel.ts`,
  `MapPanel.ts`, `QuestLog.ts`, `Nameplates.ts`, `GroundLabels.ts`, `src/ui/styles.css`, `src/art/Icons.ts`
- **menus**: `src/scenes/TitleScene.ts`, `CharSelectScene.ts`, `DeathScene.ts`, `ShowcaseScene.ts`,
  `src/ui/CharSelectPanel.ts`, `DeathPanel.ts`, `PausePanel.ts`, `SettingsPanel.ts`, `UIRoot.ts`,
  `index.html`, new `src/ui/menus.css`
- **animation**: `src/art/Animation.ts`, `CharacterModels.ts`, `ItemModels.ts`, `Meshes.ts`
- **world**: `src/art/Textures.ts`, `Materials.ts`, `Palettes.ts`, `Noise.ts`, `src/world/DungeonBuilder.ts`,
  `Props.ts`, `Biomes.ts` (art fields), `Town.ts`, `src/core/Renderer.ts`, `src/scenes/TownScene.ts`
- **feel**: `src/fx/*`, `src/audio/*`, `src/scenes/SkillRunner.ts`
- **depth**: `src/data/*`, `src/sim/*`, `src/world/DungeonGen.ts`, `Layouts.ts`, `src/entities/AI.ts`
- **shared** (small additive edits only): `src/types.ts`, `src/main.ts`, `src/scenes/DungeonScene.ts`,
  `src/entities/Player.ts`, `Enemy.ts`, `Boss.ts`, `Abilities.ts`, `src/core/*` except Renderer, `CONTRACTS.md`

A stream that needs a new panel or system puts it in a **new file** rather than
growing someone else's.

## Shared rules

- All randomness through `src/core/RNG.ts`. Never `Math.random`.
- `npx tsc --noEmit -p tsconfig.json` stays at zero errors at every checkpoint.
- Existing `tools/check-*.mjs` checkers that touch your area must still pass.
- Everything is generated in code. No image, model or audio files.
- Performance matters: the game must stay smooth on a mid-range laptop.
  Prefer instancing, shared materials and budgets over raw counts.
- Renders under software rendering take about ten minutes. Prefer static
  checks. At most one render per milestone, on your own port (`SLAY_PORT`).

See `PROTOCOL.md` for how checkpoints work, and `RESUME.md` to restart.
