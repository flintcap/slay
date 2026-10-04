# Stream: hud (in-game UI)

Status: paused

## Milestones

- [x] Design system: one set of colour, type, spacing and frame tokens in styles.css. Every panel shares one frame, header, close button and tab style. Ornate but readable, dark-fantasy. — "Give every panel one gilded frame, title plate and tab style"
- [x] Orbs and bars: liquid-filled health and mana orbs with slosh and a low-health pulse; segmented XP bar with level-up flare; boss health bar with name, phase ticks and damage-taken trail. — "Pour the orbs, carve the command bar, and give the boss a real health bar"
- [x] Hotbar: cooldown sweep, out-of-mana and out-of-range tint, key hints, ready flash, charge counts; buff and debuff row with timers and tooltips. — "Make the hotbar answer every press: cooldown clock, ready flash, range and mana tints, timed buffs"
- [x] Combat text: damage numbers that read at a glance (crit styling, element colour, stacking and fading), plus heal, mana, dodge, immune, level up. — "Combat text, tooltips, inventory feedback, and a working skill tree with respec"
- [x] Tooltips: rarity frames, affix tier marks, compare-to-equipped with green and red deltas, set and unique flavour text, requirement warnings. — "Combat text, tooltips, inventory feedback, and a working skill tree with respec"
- [x] Inventory, paperdoll and stash: drag ghost, valid-slot highlighting, rarity glow on cells, sort button, item drop and equip feedback. — "Combat text, tooltips, inventory feedback, and a working skill tree with respec"
- [ ] Skill tree: node states, glowing link lines, rank pips, hover previews with next-rank numbers, clear respec affordance.
- [ ] Vendor, blacksmith, map, quest log, nameplates and ground labels: same frame language; loot labels styled by rarity with beams for the best drops.
- [ ] Sweep: hover and press states everywhere, no overlap at 1280x720 and 1920x1080, every panel opens and closes with a short animation.

## Next up

Finish milestone 7, skill tree (`src/ui/SkillTreePanel.ts`, "Skill tree" part
of `styles.css`). Already done: the icon size bug (images rendered at natural
size) is fixed; every node has a rank arc (`.sknode-ring`/`.sknode-arc`), a "+"
badge when you can spend into it, travelling dashes on learned links
(`.skline-flow`), and a Respec button beside the points counter that prices the
next respec with `respecCost` from `sim/Progression.ts`, confirms in a modal,
refunds with `respecSkills`, clears the hotbar and counts `Character.respecs`
(new optional field in `src/types.ts`). Still to do: node labels overlap the
`2/20` rank badges (move the badge inside the arc at the bottom or drop the
label lower); restyle node frames to the gilt frame language and the locked
state (dashed ring, darker); a floating hover card by the node with the
next-rank numbers (the right-hand detail pane already shows them); then tick
milestone 7. Check with `node tools/uilab.mjs --shots=skills`.

Then milestone 8 (vendor, blacksmith, map, quest log, nameplates, ground
labels) and 9 (sweep). Before ticking 8, run one real render:
`npm run build && SLAY_PORT=4301 node tools/screenshot.mjs --out=shots/hud/real --shots=dungeon,boss`
(about 15 minutes; it was started once and stopped by the pause, so the
in-game CombatTextLayer has not yet been seen in a real frame).

## Notes for resume

- **UI lab (use it).** `node tools/uilab.mjs --out=shots/hud --shots=hud,inventory,skills`
  mounts the real UI with a stub engine (no game boot) and screenshots it in
  seconds. States: `hud`, `levelup`, `tooltip`, `modal`, `menu`, or any panel id
  (`inventory`, `character`, `skills`, `stash`, `vendor`, `blacksmith`, `map`,
  `questLog`, `settings`, `pause`). Join with `+` to layer (`menu+stash`). Use
  `--clip=x,y,w,h --dpr=2` for close-ups and `--width=1280 --height=720` for the
  small layout. Files: `tools/uilab.mjs`, `tools/uilab.html`, `tools/uilab-entry.ts`
  (new files in quality's `tools/`; additive only). Wait longer (`--wait=3000`)
  if item icons have not drawn yet.
- Frame language lives in `styles.css` tokens (`--gild`, `--plate`, `--relief`,
  `--frame-*`, `--font-title`, `--dur-*`, `--z-*`) and in `Widgets.ts`
  (`ORNAMENT` corner/crest/divider SVG strings, `frameOrnament()`). Panels and
  modals both use them. The art stream may later ship ornament helpers; if so,
  swap them in behind `ORNAMENT` / `frameOrnament()` so callers do not change.
- `src/art/Icons.ts` now belongs to the art stream. Only call its exports.
- Combat damage numbers are drawn by `src/fx/Particles.ts` (`damageNumber`,
  an instanced glyph pool), which the feel stream owns. Milestone 4 needs either
  a coordinated change there or a new DOM/canvas layer in a new hud file.
- Seen while working, not yet fixed: the skill tree nodes in the lab render with
  oversized icons spilling out of their circles (milestone 7).
- The buff strip now lives inside `.cmdbar-center` (absolutely placed above the
  plate). The command bar plate is `.cmdbar-plate`; orbs are 124px with a
  `.orb-wing` bracket; the interact prompt sits at `bottom: 236px` (216px under
  820px tall) so it clears the buffs.
- Hotbar: slots track the previous cooldown per slot (`cdPrev`, RMB is index 6)
  to fire `is-cast` / `is-ready` flashes; keydown on Digit1-6/Q/F/Space adds
  `is-pressed` (visual only, the scene still handles input). Out-of-range uses
  `engine.input.worldPoint` vs the player and only applies to skills with
  targeting `point`/`enemy` and a numeric `params.range` (`castRange()`).
  `runtime.charges` (Widgets.ts) is an empty Map hook: if combat adds charged
  skills, write the count there and the slot shows it.
- The boss bar reads phase thresholds from `BOSSES` (`src/data/bosses.ts`) by
  matching the boss name from `boss:engaged`. If combat changes that event,
  pass the id too and match on it.
- Combat text is `src/ui/CombatText.ts` (`CombatTextLayer`, one 2D canvas
  under the HUD). DungeonScene creates it next to the nameplates, updates it
  with real (not hit-stopped) time, and disposes it; the two old
  `fx.damageNumber` calls there were removed. The layer listens to
  `enemy:damaged`, `player:damaged`, `player:healed`, `player:evaded`,
  `sfx` id `block`, and `player:levelUp`. Hits on one target within ~0.3s merge
  into one growing number with an `xN` count. `word(text, x, y, z)` is public
  for IMMUNE/RESIST if combat wants it. `fx.damageNumber` in Particles.ts is
  now unused but left in place (feel owns it).
- Tooltip (`Tooltip.ts`) renders mods itself from `item.mods` with tier pips
  (`getAffix(id).tiers.length` is the ladder length; Alt shows `T4/6`), a red
  "cannot equip" plate from `meetsRequirements`, set pieces and lit bonuses from
  `getSet`, unique hook and flavour from `getUnique`, and gem/runeword text
  lifted from `itemTooltipLines`. The compare card has an Upgrade/Downgrade/
  Trade-off verdict. Blacksmith still uses `.tt-crest` and `.tt-socket-strip`.
- Inventory: `ItemGrid.setItems(items, offset, quiet)` flashes cells whose item
  just arrived; pass `quiet` for sorts and tab switches. `ItemGrid.playSort()`
  animates a sort. `ItemSlot.flash()` is public. The drag ghost tilts with the
  pointer, shows the item name, and says "Release to drop" over the world.
- Lab scenarios added: `combat`, `drag`, `arrive`, `ttunique`, `ttset`,
  `ttgem`. Run the lab on another port (`--port=4311`) if 4301 is busy.
