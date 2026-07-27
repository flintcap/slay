# SLAY

An endless dungeon RPG roguelike built in Three.js. Every texture, model,
animation, sound and note of music is generated in code — the game ships with
zero asset files and runs fully offline.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production bundle into dist/
npm run typecheck  # strict TS, no emit
npm run shots      # headless screenshots into shots/ (requires a build first)
```

## The loop

You start in town, pick a class, and descend at level 1. Kill things, take
their gear, get stronger, go deeper. The dungeon scales without end — deeper
runs roll more monster affixes, denser elite packs, and harsher global
modifiers, against proportionally better loot.

When you die, **the character is gone**. Level, skill points, and everything
they were wearing die with them. What survives is the account: the shared
stash, the bank gold, your deepest recorded descent, and a memorial listing
everyone who didn't make it back. Then you walk back into town and pick a
class again — this time with a vault of gear waiting for the next one.

## Systems

| Area | What's in it |
|---|---|
| **Classes** | 5 classes × 3 skill trees × ~20 skills, D2-style tiers, prerequisites, ranks and synergies |
| **Items** | 150+ bases across normal/exceptional/elite tiers, 120+ multi-tier affixes, 60+ uniques, 12+ sets, gems and sockets |
| **Crafting** | Blacksmith upgrading with tiered results, affix rerolling, socketing, salvage into materials |
| **Monsters** | 100+ enemies across 10 families and 7 combat roles, plus 35+ elite pack affixes |
| **Bosses** | 20+ multi-phase fights with telegraphed signature mechanics and arena shifts |
| **Dungeons** | 8 biomes, 7 layout generators, procedurally placed props, quests, and multi-level runs |
| **Quests** | 60+ quest definitions that change how a run plays, not just what you count |

## Architecture

```
src/
  core/      engine loop, renderer + post chain, input, events, seeded RNG, save
  art/       noise, procedural PBR textures, materials, meshes, models, animation
  world/     biomes, layout algorithms, dungeon generation, mesh building, nav, town
  data/      static definitions: classes, skills, items, affixes, monsters, quests
  sim/       stats, combat math, loot rolling, crafting, inventory, progression
  entities/  player, enemies, AI, bosses, abilities
  fx/        GPU particles, spell effects, decals, trails, camera rig
  audio/     WebAudio synthesis, SFX registry, adaptive procedural music
  ui/        DOM/CSS panels: HUD, inventory, skill tree, stash, vendor, smith
  scenes/    integration: title, character select, town, dungeon, death
```

`src/types.ts` holds every shared data shape and `CONTRACTS.md` documents the
function signatures modules expose to each other. Those two files are the
integration spine — read them before changing anything cross-cutting.

### Rendering

Physically-based materials lit by ACES-filmic tone mapping, through a post
chain of GTAO → UnrealBloom → a custom HDR grade pass (exposure, lift/gain,
contrast, saturation, vignette, radial chromatic aberration, film grain,
damage and low-life feedback) → SMAA. Quality presets from `low` to `ultra`
scale shadow resolution, AO, pixel ratio and FX budgets.

All randomness runs through seeded `sfc32` streams, so a given seed always
produces the same dungeon, the same packs, and the same drops.
