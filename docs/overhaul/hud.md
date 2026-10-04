# Stream: hud (in-game UI)

Status: in progress

## Milestones

- [x] Design system: one set of colour, type, spacing and frame tokens in styles.css. Every panel shares one frame, header, close button and tab style. Ornate but readable, dark-fantasy. — "Give every panel one gilded frame, title plate and tab style"
- [x] Orbs and bars: liquid-filled health and mana orbs with slosh and a low-health pulse; segmented XP bar with level-up flare; boss health bar with name, phase ticks and damage-taken trail. — "Pour the orbs, carve the command bar, and give the boss a real health bar"
- [x] Hotbar: cooldown sweep, out-of-mana and out-of-range tint, key hints, ready flash, charge counts; buff and debuff row with timers and tooltips. — "Make the hotbar answer every press: cooldown clock, ready flash, range and mana tints, timed buffs"
- [x] Combat text: damage numbers that read at a glance (crit styling, element colour, stacking and fading), plus heal, mana, dodge, immune, level up. — "Combat text, tooltips, inventory feedback, and a working skill tree with respec"
- [x] Tooltips: rarity frames, affix tier marks, compare-to-equipped with green and red deltas, set and unique flavour text, requirement warnings. — "Combat text, tooltips, inventory feedback, and a working skill tree with respec"
- [x] Inventory, paperdoll and stash: drag ghost, valid-slot highlighting, rarity glow on cells, sort button, item drop and equip feedback. — "Combat text, tooltips, inventory feedback, and a working skill tree with respec"
- [x] Skill tree: node states, glowing link lines, rank pips, hover previews with next-rank numbers, clear respec affordance. — "Gild the skill tree, add its hover card, and answer the boss and elite requests"
- [ ] Vendor, blacksmith, map, quest log, nameplates and ground labels: same frame language; loot labels styled by rarity with beams for the best drops.
- [ ] Sweep: hover and press states everywhere, no overlap at 1280x720 and 1920x1080, every panel opens and closes with a short animation.

## Next up

Milestones 8 and 9 are built and lab-checked; neither is ticked yet because
they wait on the real render. Milestone 9 so far: dead menu styles pruned,
all font sizes follow the text-size setting, press and hover states added
where missing (`Sweep:` block at the end of `styles.css`), 1280x720 checked
in the lab for hud, inventory, skills, character, vendor, stash, blacksmith
(skill board scales down under 820px tall; blacksmith pack column sized to
its grid). Panels and modals already animate open and closed.

To finish: `npm run build && SLAY_PORT=4301 node tools/screenshot.mjs
--out=shots/hud/real --shots=combatText,dungeon` (15 to 30 minutes on a
loaded machine). Look at the combat text, nameplates, loot labels and the
HUD in a real frame, fix what looks wrong, then tick 8 and 9.

## Notes for resume

**Requests from other streams (added at pause):**
- DONE art: buff chips now use `statusIconUri` (painted chip, `.buff.has-img`); the line-icon stays as fallback.
- DONE combat: the seven new elite affixes borrow glyphs through `BADGE_ALIAS` in `Nameplates.ts` (art: if you add real glyphs to `AFFIX_MAP` in `SkillIconArt.ts`, delete the alias lines). `boss:cast` shows a wind-up bar under the boss bar (`.bosscast`, fills over `windup` seconds), `boss:enraged` adds `.is-enraged` (red glow, "· Enraged" after the title, throbbing name), `miniboss:engaged` shows a 4s entrance card (`.minicard`) where the boss bar lives, `miniboss:killed` hides it and toasts "X is slain". Lab: `bosscast`, `miniboss`.
- DONE quality: every `font-size` in `styles.css` now follows the text-size setting (`--fs-*` or `calc(Npx * var(--text-scale, 1))`); the combat text canvas reads `--text-scale` too. `check-access` now reports 36 raw sizes, all in `menus.css` (33), `story.css` (2) and `depth.css` (1), which belong to those streams.
- DONE menus: the unused `.title-*`, `.cs-*` (kept `.cs-memorial`, `.cs-memorial-list`), `.death-*`, `.pause-*` and `.settings-cols` rules are gone from `styles.css` (75 rules). `QuestLog` had borrowed `.death-kept-item`; it now has `.quest-reward-item`.

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
- Skill tree layout: `NODE` 58, `CELL_W` 132, `CELL_H` 104 (board 396 wide).
  The rank badge straddles the bottom of the ring; the name sits under it.
  Tier numerals (I to VI) and the point gate are stacked in the left gutter
  and lit (`.skill-tierrail.is-open`) once the tree has enough points. Node
  bezel is `.sknode-frame::after`, a conic metal ring masked to a band: iron
  locked, bronze available, gilt learned, pale gold maxed; locked nodes get a
  dashed groove. Hover card is `.skcard` (built by `showCard`, numbers from
  `rankRows`, shared with the detail pane). Lab: `skillhover` (pass
  `--node=<skill id or index>`).
- Seen in the lab, not mine: plain unstyled text at the very top-left ("The
  Hollow King", "Depth 7 · Floor 2 of 4"). Likely a menus banner whose CSS
  (`menus.css`) the lab page does not load. Check in a real render.
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
  `ttgem`, `skillhover`, `bosscast`, `miniboss`, `loot` (ground labels),
  `plates` (nameplates), `mapfull` (a generated floor, 70% explored),
  `smith` (an item on the anvil). Run the lab on another port (`--port=4311`) if 4301 is busy.
