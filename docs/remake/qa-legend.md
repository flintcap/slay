# Stream: qa-legend (signature looks for every unique and set)

Status: not started

Goal (owner's words): unique items should have unique designs, patterns and
glow effects. For example, a set's chest piece could have dragons on the
shoulders. Different sets and different uniques get their own colours. Maybe
one set is fully gold with a shining glow and another is white with a white
glow. Think Diablo II set items and Path of Exile uniques: you know what
someone is wearing from across the screen.

## Milestones

- [ ] Design bible. List every set and every unique (src/data/sets.ts,
  src/data/uniques.ts and their builders). Give each one a signature under
  "Design": a palette (each set its own: full gold with a gold shine, white
  and silver with a white glow, blackened iron with ember cracks, bone and
  verdigris, blood red lacquer, deep violet void, and more), a motif (dragons,
  wings, skulls, thorns, flames, stars, serpents, antlers, chains, runes,
  eyes), a material finish, and a glow or effect (soft aura, pulsing runes,
  embers, frost mist, sparkles, a trailing wisp). No two sets share a palette
  or a motif, and every unique reads as its own item. Write it into
  `CONTRACTS.md` under ItemLook as the per-id signature data.
- [ ] Sets on the body. Every piece of every set carries its set's palette,
  motif and glow, so a full set is a matched, striking outfit: sculpted motif
  parts (for example dragon heads on the pauldrons, wings on the helm, scaled
  plates on the chest), trims and patterns, and an aura that grows with the
  number of pieces worn (2 pieces: trims glow; full set: the whole outfit
  shines). Works on every class body.
- [ ] Uniques on the body and in hand. Every unique weapon, shield and armour
  piece gets its own sculpted silhouette details, patterns and glow, clearly
  unlike its base and unlike other uniques.
- [ ] Icons and drops. Inventory icons and ground models show the same
  signature (palette, motif, glow), so a set piece looks like its set at a
  glance and a unique looks legendary in the grid and on the floor.
- [ ] Effects budget and check. Glows, auras and particles stay within the
  draw call and frame budgets (town and busy maps under 900 draw calls) with
  a full set worn. `check-item-icons` still passes (no look-alikes). Add a
  check that no two sets share a palette and that every set and unique has a
  signature entry.
- [ ] Handover with a render sheet: every set worn in full on two classes,
  and every unique in hand or worn.

## Design

(to be written in milestone 1)

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read the items stream's Handover in `docs/remake/items.md`, the ItemLook
   contract in `CONTRACTS.md`, `src/art/items/` (Designs.ts, Features.ts,
   Wear.ts, Mats.ts), `src/art/hero/Armour.ts`, and qa-looks' Results in
   `docs/remake/qa-looks.md` so you do not redo its fixes.
3. Write the design bible, push it, then start sets on the body.

## Notes for resume

- Looks only. Never change item stats, drop rates or set bonuses.
- Owner's rule "Gear makes the look" holds: bare heroes wear plain linens.
- qa-looks also works on equipment fit and clipping. Coordinate through
  notes in each other's progress files and keep commits small.
