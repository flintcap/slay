# Stream: art (illustration and iconography)

Status: done

## Milestones

- [x] Item icons: painterly, readable at small size, real material rendering (metal sheen, leather grain, gem glints), a clear silhouette per item family, rarity shown by the art itself, not just a border. — "Paint item icons by family and sub-type, with rarity in the art"
- [x] Skill, buff and affix icons: a consistent family style per class and element, strong central motif, readable at hotbar size, with locked, ready and cooldown states that still read. — "Art: brighter status pictograms, real badges for the seven new elite affixes"
- [x] Item models: ground drops and equipped gear that match their icons, with ornament scaling by rarity and tier; uniques and set items get distinctive shapes. — "Art: item models match their icons; one shared rarity look for icons, drops, held and worn gear"
- [x] Class portraits and key art: a drawn portrait per class for character select, and a title and loading key art composition, all generated in code (canvas or SVG). — "Art: class portraits, key art, UI ornament helpers" (seen in the real character select)
- [x] UI ornament: filigree corners, dividers, frame borders and crests drawn procedurally for the hud and menus streams to use, exposed as small reusable helpers. — "Art: class portraits, key art, UI ornament helpers"
- [x] Boss and monster portraits: a portrait for every boss for intro cards, and bestiary art per monster family. — "Art: boss and monster family portraits; boss intro card shows its portrait"
- [x] Sweep: a contact sheet render of every icon and portrait, checked for readability, duplicates and style drift. — "Art: sweep done"

## Next up

All milestones done. Leftovers a successor could pick up:

1. Item icon timing in the real inventory is still unmeasured: the `inventory` shot of
   `tools/screenshot.mjs` timed out twice here (boot alone took over 20 minutes under load). On a
   quieter machine run `SLAY_PORT=4310 timeout 2400 node tools/screenshot.mjs --out=shots/art
   --shots=inventory` in the background and see whether slots are filled. Note for reading the
   numbers: canvas paint calls are lazy, so `ICON_BUDGET_MS` in `Icons.ts` measures recording, not
   rasterising; the real cost lands in `toBlob`. If icons are slow, budget by count (e.g. 6 per
   frame) instead of by time.
2. 17 groups of item bases share an identical `visual` block (for example `orb.cracked`,
   `orb.eagle`, `orb.sacred`; `helm.bone`, `helm.grim`), so their icons and models only differ by
   base tier. That is depth's data; giving them distinct palettes, ornate or sub-types would fix it.
3. No bestiary screen exists; `familyPortraitUri` is ready for one.

## Notes for resume

- Sweep (milestone 7): looked at `skillsA/B/C`, `skillcloseup`, `statuses`, `affixcloseup`,
  `dupes` (0 same-tree duplicates), `items`, `rarity`, `models`, `modelsHi`, `modelsSig`,
  `modelsArmor`, `drops`, `portraits`, `keyart`, `ornament`, `bosses`. Style is consistent (one
  top-left light, ramp + rim, class/element back light). Base tier now raises ornament on icons
  and models. The real character select shows the portrait correctly (shots/art/charSelect.png).

- Milestone 6: `src/art/BossPortraits.ts` — `bossPortraitUri(idOrName, size)` and
  `familyPortraitUri(family, size, visual?, key?)`: ten family painters in a round iron medallion,
  coloured from the creature's `visual` (palette tint, glow, eye count, ornament, wings) with a
  per-boss variant. `Banners.ts` shows the boss portrait (96px, `.bn-boss-portrait`) on the intro
  card. There is no bestiary screen yet; if story or menus add one, use `familyPortraitUri`.
  Sheet: `bosses`.

- Milestones 4-5: `src/art/Portraits.ts` (`classPortraitUri(classId, size)`, cached data URI; the
  arch frame cuts the corners transparent), `src/art/KeyArt.ts` (`keyArtCanvas`, `mountKeyArt`,
  painted at half resolution, no image encode), `src/art/Ornament.ts` (`cornerUri`, `dividerUri`,
  `frameUri`, `frameBorderImage`, `crestUri(glyph, color)` in gold/silver/iron/bronze/bone).
  Wiring: `CharSelectPanel` floats a portrait into the detail column (`.csx-portrait` in
  menus.css), `main.ts` mounts key art in `#boot`, `Transitions.ts` fades key art in behind the
  slow loading card and uses `dividerUri` instead of the tip hairline. Sheets: `portraits`,
  `keyart`, `ornament`. Under software canvas here a portrait costs ~300 ms to rasterise the
  first time (paint calls are lazy; the cost lands at encode) and key art ~200 ms; both are paid
  once and cached.

- Milestone 3 closing notes:
  - `src/art/ItemLook.ts` `itemLook(item, visual)` = `gearLook()` plus the art ladder: trim
    (magic silver, rare/unique gold, mythic gold tinted violet, ancient gold tinted red, set silver
    tinted with `setColor(setId)`), `stone`, `glowColor`, `iconTrim`. Icons (`ItemIconArt`),
    `ItemModels` and `WornGear.buildWorn` all use it. Set icons now carry their set's colour
    (stone, aura, washed trim), not one shared green.
  - `buildItemModel(visual, rng, rarity, ident?)` takes the item (baseId/uniqueId/setId); Player,
    PaperdollView, HeroModel and DeathScene pass it. Uniques and sets build from their own seed.
  - Weapons follow icon sub-types via `resolveModelShape` (sword thin/great/broad, dagger
    wavy/needle, axe hand/war/great/broad, mace club/war/great, spear pike/halberd/trident, bow
    short/long/war/great, crossbow light/heavy/repeat, wand bone/crystal, staff battle/rune,
    scepter orbed/spiked, shield buckler/round/kite/tower/bone). Armour drops follow helm
    cap/full/horned/circlet, chest robe/leather/mail/scale/plate, gloves, boots, belt subs.
  - Fixed old model bugs: sword guards ran along the blade, axe bits were edge-on, crossbow
    prods ran along the stock, `trident` resolved to a sword, ring stones floated off the band,
    the great helm was inside out, sword grips were half inside the blade (grip is now centred
    on the origin, guard above the hand).
  - Unique/set signature (`addSignature`): wings, floating halo (`userData.spin`), crown of
    thorns, or pennants, picked by `look.signature`; sets always fly pennants in set colour.
  - Drops: `poseForDrop(model)` (exported) lays weapons diagonal, shields face up, armour upright;
    the item is centred on the spin axis. Part names `beam`, `pool`, `sigil`, `dropLight`, `spin`
    unchanged. Warm build ~2 ms per model.
  - **For animation:** the off-hand socket held shields with their authored front toward the
    hero's back. `buildShield` now turns the shield inside its group (face -Z authored = outward
    in hand). If the socket is ever corrected, remove that inner turn.
  - Sheets: `models`, `modelsHi`, `modelsSig`, `modelsArmor` (drop pose), `drops` render real
    three.js models in seconds (art-sheet now launches chromium with SwiftShader WebGL).
  - `tools/check-body.mjs` leaves its vite child running after it exits; kill it by port.

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

**Item icon timing (measured by quality, `check-invcost`):** opening a cold pack blocks for 0.2 ms
(icons are queued, not drawn up front). Painting one icon costs about 140 ms under software
rendering (60 drawn eagerly: 8.3 s). The queue paints about one icon per frame (5 ms budget), so
under software rendering, where a frame takes about 0.75 s, a cold pack of 60 fills in over 43 s.
On a real GPU machine that is about one second at 60 fps, and `warmItemIcons` (HUD) has usually
drawn held items before the pack is opened. The UI lab's 2.5 s wait was software-rendering
frame rate, not slow icons. No change needed.

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
