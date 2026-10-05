# Stream: art (illustration and iconography)

Status: in progress

## Milestones

- [x] Item icons: painterly, readable at small size, real material rendering (metal sheen, leather grain, gem glints), a clear silhouette per item family, rarity shown by the art itself, not just a border. — "Paint item icons by family and sub-type, with rarity in the art"
- [x] Skill, buff and affix icons: a consistent family style per class and element, strong central motif, readable at hotbar size, with locked, ready and cooldown states that still read. — "Art: brighter status pictograms, real badges for the seven new elite affixes"
- [ ] Item models: ground drops and equipped gear that match their icons, with ornament scaling by rarity and tier; uniques and set items get distinctive shapes.
- [ ] Class portraits and key art: a drawn portrait per class for character select, and a title and loading key art composition, all generated in code (canvas or SVG).
- [ ] UI ornament: filigree corners, dividers, frame borders and crests drawn procedurally for the hud and menus streams to use, exposed as small reusable helpers.
- [ ] Boss and monster portraits: a portrait for every boss for intro cards, and bestiary art per monster family.
- [ ] Sweep: a contact sheet render of every icon and portrait, checked for readability, duplicates and style drift.

## Next up

Milestone 3 (item models). Art keeps `ItemModels.ts` (held weapons, shields, ground drops);
models owns worn armour (`WornGear.ts`) and `GearLook.ts`.

1. New `src/art/ItemLook.ts`: `itemLook(item, visual)` built on `gearLook()` from `GearLook.ts`
   plus `IconKit.trimFor/stoneFor/glowFor/RANK`, returning one shared look (palette, trim, stone,
   glow, rank, ornate, set tint) so icons, drops, held weapons and worn gear agree.
2. Use it in `ItemModels.ts`: weapons and drops take trim/stone/glow from it; match weapon
   models to icon sub-types (`visual.shape` like 'sword.great', 'axe.great', 'dagger.wavy').
   Keep the weapon contract (grip at origin, +Y business end, wide X, thin Z), keep the drop part
   names `beam`, `pool`, `sigil`, `dropLight`, `spin`, and run `node tools/check-grips.mjs`.
3. Uniques and sets get distinctive shapes (per-unique signature from `gearLook`).
4. Add an `itemmodels` sheet to `tools/art-sheet-page.ts` (three.js render of each model to a
   canvas, no game boot) to look at them.

## Notes for resume

- Milestone 2 closing notes: `figure`, `scythe`, `bone`, `helm`, `boulder` glyphs are now back-lit
  and brighter; `toneOf()` lifts very dark colours (dread, veiled) so chips read. The seven elite
  affixes have real glyphs (`pool`, `firechain`, `ward`, `split`, `hexshield`, `adapt`, `lance`)
  and the `BADGE_ALIAS` table in `Nameplates.ts` is gone. The HUD already uses `statusIconUri`.
- `check-skillicons.mjs` draws through the same `Icons.ts` path as the art sheets, so the
  `skillsA/B/C` sheets replace it (no game boot). `check-clips.mjs` is animation's, untouched by icons.
  The new `dupes` sheet lists skills in one tree that resolve to the same picture (now 0), and
  `affixcloseup` shows the newest badges large and at nameplate size.

**From models (finished, 5bebe1d):** build the planned `itemLook()` on top of the new `src/art/GearLook.ts`, so ground drops, held weapons and worn gear share trim, rarity dressing and set colours.

**From hud (finished, 5a2ec0f):** the seven new elite affixes (desecrator, fire_chains, bulwark, splitter, hexing, adaptive, lancer) borrow existing icons via `BADGE_ALIAS` in `Nameplates.ts`. Paint real ones in `AFFIX_MAP` in `SkillIconArt.ts`, then delete the matching alias lines. Also: item icons often had not appeared in the UI lab after a 2.5 s wait; check whether icon generation is that slow in the real game.

- **Contact sheets without booting the game:** `SLAY_PORT=4310 node tools/art-sheet.mjs items,rarity,closeup,skills,perf --out=shots/art`.
  Sheets live in `tools/art-sheet-page.ts` (`SHEETS`); add one per milestone. Takes seconds.
  `shots/` is not committed.
- **Brush box:** `src/art/Paint.ts` — colour maths, seeded texture tiles (brushed, grain,
  pores, weave, mottle, crack, scales, mail, hammered), `solid()` (ramp + texture + AO +
  rim + outline), `gem()`, `glow()`, `glint()`, `spec()`, `emissiveStroke()`,
  `composite()`. One light, top left, screen space. All randomness via `core/RNG`.
- **Item icons:** `src/art/ItemIconArt.ts` resolves `visual.shape` ('sword.great',
  'dagger.wavy', 'gem.ruby'...) into family + sub-type and dispatches to painters in
  `IconWeapons.ts` (diagonal frame, tip top-right, light from local -x, x widened 1.22),
  `IconArmor.ts` and `IconTrinkets.ts` (upright frame). Kit, materials and rarity looks in
  `IconKit.ts`. Rarity ladder: normal bare, magic silver + edge enchant, rare gold + stone,
  set verdigris + green, unique gold + own stone (hashed from uniqueId) + runes + rays,
  mythic void-gold + motes, ancient blood-gold + embers.
- Icon cache key is now `baseId|rarity|uniqueId-or-setId` (sockets never changed the art).
- `requestItemIcon` / `warmItemIcons` paint on the frame but encode with `canvas.toBlob`
  (off-thread) and cache a `blob:` URL; `itemIconUri` stays synchronous (data URI) for the
  drag ghost. Timings in this container are inflated by load from other agents
  (load average 40+ on 4 cores), so treat `perf` numbers as relative.
- **Skill/status/affix icons:** `src/art/SkillIconArt.ts` composes them from the painted
  pictogram vocabulary in `src/art/Glyphs.ts` (~70 glyphs, each `(ctx, tone, variant)`).
  `ICON_MAP` hand-maps every skill `icon` name to `glyph[:variant][^modifier]`; modifiers
  (aura, nova, burst, field, rain, rise, speed, impact, chain, spin, multi, wall, drip,
  cross, mastery) live in `MODS`. Class frame and tree pips come from the skill's tree
  (`TREE_BY_ID`), physical/untyped skills take the class light. `STATUS_MAP` and
  `AFFIX_MAP` do the same for statuses and monster affixes.
- `Icons.ts` is now only caching and scheduling; it imports `data/skills` for tree lookup.
- **Request from models:** worn armour (helm, chest, gloves, boots, belt) is now built by
  `src/art/WornGear.ts`, cut to the body; `ItemModels` still builds held weapons, shields, drops and
  icons. `src/art/GearLook.ts` `gearLook(item, visual)` gives palette, trim palette and set tint, accent,
  glow, rarity tier, base tier and a per-unique signature. Please build `itemLook()` on it (or use it in
  `kitFor`) so a set piece's trim colour and a mythic's glow match on the floor, in the hand and on the
  body. Held items are merged per material after build by `ModelBudget.compactModel` (parts with
  `userData.orbit/spin` are kept separate), so keep animating parts tagged that way.
