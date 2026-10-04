# Stream: art (illustration and iconography)

Status: paused

## Milestones

- [x] Item icons: painterly, readable at small size, real material rendering (metal sheen, leather grain, gem glints), a clear silhouette per item family, rarity shown by the art itself, not just a border. — "Paint item icons by family and sub-type, with rarity in the art"
- [ ] Skill, buff and affix icons: a consistent family style per class and element, strong central motif, readable at hotbar size, with locked, ready and cooldown states that still read.
- [ ] Item models: ground drops and equipped gear that match their icons, with ornament scaling by rarity and tier; uniques and set items get distinctive shapes.
- [ ] Class portraits and key art: a drawn portrait per class for character select, and a title and loading key art composition, all generated in code (canvas or SVG).
- [ ] UI ornament: filigree corners, dividers, frame borders and crests drawn procedurally for the hud and menus streams to use, exposed as small reusable helpers.
- [ ] Boss and monster portraits: a portrait for every boss for intro cards, and bestiary art per monster family.
- [ ] Sweep: a contact sheet render of every icon and portrait, checked for readability, duplicates and style drift.

## Next up

Milestone 2 is mostly built and live, not yet ticked. Finish it:

1. Review `SLAY_PORT=4310 node tools/art-sheet.mjs skillsA,skillsB,skillsC,skillcloseup,statuses --out=shots/art`
   (skillsA/B/C are the 18 trees in thirds, each skill ready / cooldown / locked).
   Known weak spots: dark pictograms on dark ground (`figure` in shroud/cloak/void
   status chips is near invisible; scythe, helm and bone read thin in passives);
   bone-spear and other `^speed` icons draw the glyph small. Brighten `figure`
   (lighter body fill or a stronger rim) and enlarge thin glyphs.
2. Ask the hud stream (or make the one-line additive edit yourself) to swap the buff
   chip art in `src/ui/HUD.ts` (~line 948, `art.innerHTML = iconSvg(statusIcon(...))`)
   for `<img src="${statusIconUri(def?.icon, def?.color ?? 0x9ad0ff, def?.polarity ?? 1)}">`.
   `statusIconUri` is exported from `src/art/Icons.ts` and unused so far.
3. Run `node tools/check-skillicons.mjs` and `node tools/check-clips.mjs` (both boot the
   game, several minutes) to confirm no duplicates/regressions, then tick milestone 2.

Then milestone 3 (item models). New since the plan update: a **models** stream owns
worn armour on the body; art keeps `ItemModels.ts` (held weapons, ground drops).
Expose a small helper for them, e.g. `src/art/ItemLook.ts` exporting
`itemLook(item, visual)` -> `{ palette, trimPalette, stoneColor, glowColor, rank, ornate }`
built from `IconKit.trimFor/stoneFor/glowFor/RANK` (map verdigris/voidgold/bloodgold
trims to world palette keys like 'metal.bronze'/'metal.gold' for `Materials.surface`),
so worn gear, held weapons, drops and icons agree. Then match weapon models to icon
sub-types (`visual.shape` like 'sword.thin', 'axe.great', 'dagger.wavy' are currently
ignored by `resolveShape` beyond the family) without breaking `node tools/check-grips.mjs`.

## Notes for resume

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
