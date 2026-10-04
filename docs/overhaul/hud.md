# Stream: hud (in-game UI)

Status: in progress

## Milestones

- [x] Design system: one set of colour, type, spacing and frame tokens in styles.css. Every panel shares one frame, header, close button and tab style. Ornate but readable, dark-fantasy. — "Give every panel one gilded frame, title plate and tab style"
- [x] Orbs and bars: liquid-filled health and mana orbs with slosh and a low-health pulse; segmented XP bar with level-up flare; boss health bar with name, phase ticks and damage-taken trail. — "Pour the orbs, carve the command bar, and give the boss a real health bar"
- [ ] Hotbar: cooldown sweep, out-of-mana and out-of-range tint, key hints, ready flash, charge counts; buff and debuff row with timers and tooltips.
- [ ] Combat text: damage numbers that read at a glance (crit styling, element colour, stacking and fading), plus heal, mana, dodge, immune, level up.
- [ ] Tooltips: rarity frames, affix tier marks, compare-to-equipped with green and red deltas, set and unique flavour text, requirement warnings.
- [ ] Inventory, paperdoll and stash: drag ghost, valid-slot highlighting, rarity glow on cells, sort button, item drop and equip feedback.
- [ ] Skill tree: node states, glowing link lines, rank pips, hover previews with next-rank numbers, clear respec affordance.
- [ ] Vendor, blacksmith, map, quest log, nameplates and ground labels: same frame language; loot labels styled by rarity with beams for the best drops.
- [ ] Sweep: hover and press states everywhere, no overlap at 1280x720 and 1920x1080, every panel opens and closes with a short animation.

## Next up

Milestone 3, hotbar, in `src/ui/HUD.ts` (`buildHotbar`, `updateHotbarRuntime`,
`updateStatuses`, the RMB and dash slots) and the "--- command bar" part of
`styles.css` from `.skillrow` down to `.hud-gold`. Plan: framed gilt slots with
an inner bevel; cooldown as a radial sweep with a bright leading edge and the
seconds in serif; a short gold "ready" flash when a cooldown ends (track the
previous remaining per slot); out-of-mana tints blue and out-of-range tints red
(range needs the cursor target distance; if the scene exposes nothing, read
`runtime` or add a small additive field to `runtime` in Widgets.ts that
DungeonScene can fill later); key hints as small keycaps; charge counts if a
skill def has charges (grep `charges` in src/types.ts). Buff strip: round or
shield chips with a clockwise timer ring, seconds left under each chip, debuffs
in a red frame, tooltips already wired via `tip()`. Check with
`node tools/uilab.mjs --shots=hud --clip=420,840,1080,240 --dpr=2`.

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
- The boss bar reads phase thresholds from `BOSSES` (`src/data/bosses.ts`) by
  matching the boss name from `boss:engaged`. If combat changes that event,
  pass the id too and match on it.
