# Stream: art (illustration and iconography)

Status: in progress

## Milestones

- [x] Item icons: painterly, readable at small size, real material rendering (metal sheen, leather grain, gem glints), a clear silhouette per item family, rarity shown by the art itself, not just a border. — "Paint item icons by family and sub-type, with rarity in the art"
- [ ] Skill, buff and affix icons: a consistent family style per class and element, strong central motif, readable at hotbar size, with locked, ready and cooldown states that still read.
- [ ] Item models: ground drops and equipped gear that match their icons, with ornament scaling by rarity and tier; uniques and set items get distinctive shapes.
- [ ] Class portraits and key art: a drawn portrait per class for character select, and a title and loading key art composition, all generated in code (canvas or SVG).
- [ ] UI ornament: filigree corners, dividers, frame borders and crests drawn procedurally for the hud and menus streams to use, exposed as small reusable helpers.
- [ ] Boss and monster portraits: a portrait for every boss for intro cards, and bestiary art per monster family.
- [ ] Sweep: a contact sheet render of every icon and portrait, checked for readability, duplicates and style drift.

## Next up

Milestone 2: skill, buff and affix icons. Rewrite the skill half of `src/art/Icons.ts`
(`skillIconUri`, `affixIconUri`) on top of `src/art/Paint.ts`, and add a painterly
status icon helper (`statusIconUri`) that the hud stream can swap in for the SVG
glyphs in `HUD.ts` buff chips (`iconSvg(statusIcon(...))`, around line 948).
Skill data: 303 skills in `src/data/skills.ts`, each with a descriptive `icon` name
(e.g. 'shield-raise', 'bone-spear', 'nova-fire'); trees map to classes via
`SKILL_TREES[].classId`. Locked/cooldown states are CSS filters
(`grayscale(1) brightness(.5)` locked, `grayscale(.6) brightness(.7)` cooldown), so icons
must read in luminance alone. `node tools/art-sheet.mjs skills` already renders every
skill in all three states.

## Notes for resume

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
- The old swatch helpers at the top of `Icons.ts` are still used by the skill and affix
  code; milestone 2 should replace them with `Paint.ts`.
