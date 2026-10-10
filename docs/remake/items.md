# Stream: items (item models, icons, unique and set designs)

Status: not started

Goal: same items and stats, all-new looks in the style of Diablo II and Path
of Exile. Base items look like base items but each base is distinct. Uniques
and sets have their own shapes, colours and designs.

## Milestones

- [ ] Look system. New `ItemLook` descriptor: silhouette family, materials
  (metal, wood, leather, cloth, bone), colours, trim, gems, glow, wear.
  Entries per base, per unique, per set (sets share a motif). Write the shape
  to `CONTRACTS.md` early; heroes draws armour from it.
- [ ] Weapons. Every base weapon its own model; higher tiers look finer.
  Every unique weapon a custom design. Set weapons carry their set's motif.
  CC0 metal, wood and leather textures under `public/assets/textures/items/`.
- [ ] Armour, shields and jewellery. Ground models for every base. Helmets,
  chests, gloves, boots, belts, shields, rings, amulets, charms, gems,
  potions. Uniques and sets distinct.
- [ ] Icons. Inventory art in the D2 and PoE style: rendered from the new 3D
  models with good lighting, sized to the item's grid footprint, over a dark
  background. Uniques and sets readable at a glance.
- [ ] Ground drops. How items lie on the floor, their labels' look stays with
  HUD; drop beams belong to vfx.
- [ ] Switch and clean. Delete old `ItemModels.ts` builders, old icon
  painters (`IconArmor`, `IconWeapons`, `IconTrinkets`, `ItemIconArt`,
  `IconKit` if unused) and every reference.

## Checkers

`check-items`, `check-jewelry`, `check-gear-visuals`, `check-dupe`,
`tools/art-sheet.mjs`. Add an "every base looks different" check (compare
rendered icon hashes).

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/art/ItemModels.ts` (`buildItemModel`, `buildDropModel`,
   `ItemShape`), `ItemLook.ts`, `Icons.ts` (`itemIconUri`), and
   `src/data/itemBases.ts`, `uniques.ts`, `sets.ts`.
3. Write the ItemLook contract, push, then start on weapons.

## Notes for resume

- heroes runs at the same time and draws armour from your ItemLook.
- Held items: grip at origin, business end along +Y, wide on X, thin on Z.
