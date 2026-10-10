# Stream: vfx (every skill, attack, status and loot effect)

Status: not started

Goal: every skill and attack effect remade from nothing in the Diablo II and
Path of Exile style: punchy, readable, elemental, lit.

## Milestones

- [ ] Toolkit. New effect toolkit: GPU-friendly particles, soft sprites and
  flipbooks (CC0 or generated), ribbons and trails, light flashes, ground
  scorch, screen distortion if affordable. Pools, budgets, no garbage per
  frame.
- [ ] Melee and attacks. Swing arcs per weapon, impacts, sparks, blood,
  bone chips, block flashes. Keyed off heroes' and creatures' hit frames.
- [ ] Skills. Every skill's cast, travel, impact and lingering effect, per
  element (physical, fire, cold, lightning, poison, arcane). Projectiles, area
  blasts, chains, beams, channels, buffs, auras, summons.
- [ ] Monsters and bosses. Monster attacks, telegraphs on the ground, boss
  phase effects.
- [ ] Status and loot. Burn, chill, freeze, shock, poison, bleed, stun on
  bodies; drop beams by rarity, level up, portal, waypoint.
- [ ] Switch and clean. Delete old `Effects.ts`, `Particles.ts`, `Trails.ts`
  internals and every reference. Speed check on a busy fight.

## Checkers

`check-feel`, `check-skills` if present, `check-decals`, screenshots during
combat.

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/fx/*`, `src/scenes/SkillRunner.ts`, the hit and release frame
   contract in `CONTRACTS.md`, and handovers in `heroes.md` and `creatures.md`.

## Notes for resume

- From ground: the old texture painter `src/art/Textures.ts` is gone. Its small
  effect textures (radial glow, beam, rune ring, web, crack, macro noise) now
  live in `src/fx/UtilityTextures.ts`, which vfx owns. Same function names and
  signatures.
