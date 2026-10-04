# SLAY AAA Overhaul

Goal: take SLAY from "good base" to something that looks, sounds and plays
like a finished, premium action RPG. Not just the looks: how it plays, how
deep it goes, the story, and how solid it is. Nine workstreams run in parallel, each
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
| depth | `depth.md` | Items, affixes, uniques, progression, dungeon events, crafting, run variety |
| combat | `combat.md` | Controls, skill design, enemy AI and behaviours, elites, mini-bosses, boss fights, difficulty curve |
| story | `story.md` | Lore, quest lines, town NPCs and dialogue, boss personalities, flavour text, a reason to descend |
| quality | `quality.md` | Bugs, performance, save safety, accessibility, crash resistance |

## File ownership

Each stream edits only the files it owns. Anything else is "shared": edit it
only in small additive changes (new lines, new exports), never rewrite it.

- **hud**: `src/ui/HUD.ts`, `Widgets.ts`, `Tooltip.ts`, `InventoryPanel.ts`, `SkillTreePanel.ts`,
  `CharacterPanel.ts`, `PaperdollView.ts`, `VendorPanel.ts`, `BlacksmithPanel.ts`, `StashPanel.ts`,
  `MapPanel.ts`, `QuestLog.ts`, `Nameplates.ts`, `GroundLabels.ts`, `src/ui/styles.css`, `src/art/Icons.ts`
- **menus**: `src/scenes/TitleScene.ts`, `CharSelectScene.ts`, `DeathScene.ts`, `ShowcaseScene.ts`,
  `src/ui/CharSelectPanel.ts`, `DeathPanel.ts`, `PausePanel.ts`, `SettingsPanel.ts`, `UIRoot.ts`,
  `index.html`, new `src/ui/menus.css`
- **animation**: `src/art/Animation.ts`, `CharacterModels.ts`, `ItemModels.ts`, `Meshes.ts`, `src/entities/MonsterModels.ts`
- **world**: `src/art/Textures.ts`, `Materials.ts`, `Palettes.ts`, `Noise.ts`, `src/world/DungeonBuilder.ts`,
  `Props.ts`, `Biomes.ts` (art fields), `Town.ts`, `src/core/Renderer.ts`, `src/scenes/TownScene.ts`
- **feel**: `src/fx/*`, `src/audio/*`, `src/scenes/SkillRunner.ts`
- **depth**: `src/data/*` and `src/sim/*` except the files listed for combat and story below,
  `src/world/DungeonGen.ts`, `Layouts.ts`
- **combat**: `src/entities/AI.ts`, `Abilities.ts`, `Enemy.ts`, `Boss.ts`, `Player.ts`, `src/data/skills.ts`,
  `bosses.ts`, `monsterAffixes.ts`, `statuses.ts`, `src/sim/Combat.ts`, `Status.ts`, `src/core/Input.ts`
- **story**: `src/data/lore.ts`, `quests.ts`, `src/sim/Quests.ts`, new dialogue and narrative files
- **quality**: `src/core/Engine.ts`, `Events.ts`, `Save.ts`, `tools/`. May also make small, surgical bug
  fixes in any file, explaining each in the commit message; anything bigger goes in the owning
  stream's progress file under "Notes for resume" as a request.
- **shared** (small additive edits only): `src/types.ts`, `src/main.ts`, `src/scenes/DungeonScene.ts`,
  `src/core/RNG.ts`, `CONTRACTS.md`

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
