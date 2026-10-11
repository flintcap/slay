# Stream: items (item models, icons, unique and set designs)

Status: in progress

Goal: same items and stats, all-new looks in the style of Diablo II and Path
of Exile. Base items look like base items but each base is distinct. Uniques
and sets have their own shapes, colours and designs.

## Milestones

- [x] Look system. (5c39846 "wip(items): ItemLook extended with cuts, designs and set motifs; contract written") New `ItemLook` descriptor: silhouette family, materials
  (metal, wood, leather, cloth, bone), colours, trim, gems, glow, wear.
  Entries per base, per unique, per set (sets share a motif). Write the shape
  to `CONTRACTS.md` early; heroes draws armour from it.
- [x] Weapons. (a4a9a25, b138546, 97d4175 models; "items: CC0 item textures for blades, iron, hafts and grips") Every base weapon its own model; higher tiers look finer.
  Every unique weapon a custom design. Set weapons carry their set's motif.
  CC0 metal, wood and leather textures under `public/assets/textures/items/`.
- [x] Armour, shields and jewellery. (7fb0b32 "wip(items): shields, quivers, helms, body armour, gloves, boots, belts", c699d7b "wip(items): amulets, rings, charms, gems, runes, potions, materials") Ground models for every base. Helmets,
  chests, gloves, boots, belts, shields, rings, amulets, charms, gems,
  potions. Uniques and sets distinct.
- [x] Icons. ("items: inventory icons rendered from the models; every base, unique and set piece draws its own") Inventory art in the D2 and PoE style: rendered from the new 3D
  models with good lighting, sized to the item's grid footprint, over a dark
  background. Uniques and sets readable at a glance.
- [x] Ground drops. (3f858d9 "items: game builds every item from the new families; drops lie still on the floor") How items lie on the floor, their labels' look stays with
  HUD; drop beams belong to vfx.
- [x] Gear makes the look (870a065 "items: bare heroes wear plain undyed linens (gear makes the look, part 1)", 39cbd26 "items: every armour base has its own cut on the body (gear makes the look, part 2)") (owner's rule, see PLAN.md). A hero with nothing
  equipped wears only plain cloth linens in plain undyed tones: take the
  class costume off the bare hero (the shadowblade's hood and mask, class
  cloth colours, sashes) and keep body, face and hair. Every slot visibly
  changes the hero: helmets (hoods, masks and cowls become helmet bases),
  chest pieces that replace the linen shirt (robes, leathers, mail, plate),
  gloves, boots, belts, shoulders where the base has them, capes or cloaks.
  Each armour base reads differently on the body, higher tiers look grander,
  uniques and sets are the most striking. Check with a render sheet: each
  class bare, in starter gear, in mid gear, in a full set, and in uniques.
  You now own `src/art/hero/Armour.ts`, `Cape.ts`, `Garment.ts` and the
  clothing fields of `Looks.ts` (heroes is done).
- [ ] Switch and clean. Delete old `ItemModels.ts` builders, old icon
  painters (`IconArmor`, `IconWeapons`, `IconTrinkets`, `ItemIconArt`,
  `IconKit` if unused) and every reference.

## Checkers

`check-items`, `check-jewelry`, `check-gear-visuals`, `check-dupe`, `check-item-icons`,
`tools/art-sheet.mjs`. Add an "every base looks different" check (compare
rendered icon hashes).

## Next up

1. Switch and clean: delete `IconArmor`, `IconWeapons`, `IconTrinkets`,
   `ItemIconArt`, `IconKit` (nothing imports them now) and any old builders
   left in `ItemModels.ts`; grep proof in the commit message.
2. Finishing a stream: Status done, Handover, QUEUE Done.

## Notes for resume

- Item models live in `src/art/items/` (Geo, Mats, Parts, Kit, Features,
  Designs, Blades, Weapons, Ranged, Casters, Offhand, Wear, Trinkets, Model,
  Families). `src/art/ItemModels.ts` is the facade and already uses them.
- Item sheet: `SLAY_PORT=4326 timeout 900 node tools/item-sheet.mjs
  axe,bow --out=<dir>` (category names, or uniques, sets, rarity --base=).
- Held items: grip at origin, business end along +Y, wide on X, thin on Z.
  Bows lie in the YZ plane. Drops: root at 0.28, the lying model at -0.28.
- Worn armour: `src/art/hero/Armour.ts` (entry, merges parts per material),
  `ArmourKit.ts` (clips, ray hits, materials, fittings), `ArmourChest.ts`
  (17 cuts), `ArmourHead.ts` (13 helms), `ArmourLimbs.ts` (gloves, boots,
  belts, 10 each), `ArmourFeatures.ts` (32 unique and set features).
- Bump `ARMOUR_REV` in Armour.ts whenever a cut function changes: functions
  are not in the garment mesh cache key. `TRI_SCALE` 0.8 keeps budgets.
- A CutClip's `cut` is the distance to the region to REMOVE: negative inside
  means cut away. Getting the sign wrong deletes the whole piece.
- Budgets (hero check): bare body 24k tris; dressed 60k tris and 32 draws,
  counted on visible meshes only. Heavy kit is about 48k and 22 draws.
- Look at worn gear: `tools/hero-sheet.mjs` sheets `wear` (--slot --class
  --rarity --unique --set) and `dressed` (each class bare, starter, mid,
  elite, set, unique).
- Icons: `src/art/items/IconRender.ts` (`drawItemIcon`), one shared WebGL
  renderer, poses per family (long weapons on the diagonal, gems at one
  fixed scale so grades show size). `Icons.ts` caches and schedules it.
  `item-sheet.mjs icons` (--cat, --uniques, --sets, --ids=uq.x+set.y:base)
  shows them; `check-item-icons.mjs` fails on look-alikes.
- Item textures: `tools/fetch-item-textures.mjs` (metal: ambientCG
  Metal038; hammered: Poly Haven rusty_metal_02; wood: fine_grained_wood;
  leather: leather_white). `Mats.ts` projects them triplanar;
  `itemScansReady()` makes icons wait for them.
- Set pieces tint their main surface and hafts toward the set colour
  (`motifPalette` in ItemLook.ts); bone pieces use their own bone key.
- heroes no longer reads ItemLook directly; items owns Armour, Cape,
  Garment and the clothing fields of Looks.
