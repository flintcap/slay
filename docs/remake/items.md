# Stream: items (item models, icons, unique and set designs)

Status: in progress

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

1. Armour, shields and jewellery: `src/art/items/Offhand.ts` (shields,
   quivers), `Wear.ts` (helms, chests, gloves, boots, belts), `Trinkets.ts`
   (amulets, rings, charms, gems, runes, potions, materials). Register each
   in `Families.ts`.
2. Switch `src/art/ItemModels.ts` to `buildItem` (keep its exports), new
   drop model lying on the floor (keep the beam, pool, sigil, dropLight names
   for vfx).
3. Icons rendered from the models (`src/art/items/IconRender.ts`), then the
   "every base looks different" check, textures, delete the old painters.

## Notes for resume

- Built so far (in `src/art/items/`): Geo, Mats, Parts, Kit, Features,
  Designs, Blades (swords, daggers), Weapons (axes, maces, polearms), Ranged
  (bows, crossbows), Casters (wands, staves, scepters, orbs), Model
  (`buildItem`), Families (builder table). Not yet used by the game.
- Look at them: `SLAY_PORT=4326 timeout 900 node tools/item-sheet.mjs
  axe,bow --out=<dir>` (any category name, or uniques, sets, rarity
  --base=). Takes seconds.
- Bows lie in the YZ plane (limbs up and down, bowed toward -Z, the arrow
  flies +Z), as the old bow did; everything else is wide on X, thin on Z.
- heroes draws armour from your ItemLook
  (`src/art/hero/Armour.ts` reads palette, trimKey, trimTint, glowColor,
  stone, kind, baseTier, family, hasTrim, hasGems, hasRunes, glow, accent).
  Never drop or rename those.
- Held items: grip at origin, business end along +Y, wide on X, thin on Z.
- `src/art/ItemModels.ts` and `src/art/Icons.ts` stay as the public
  facades (many files import them); the old builders inside are replaced.
