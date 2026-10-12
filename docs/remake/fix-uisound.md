# Stream: fix-uisound (menu and level-up sounds, dark and gritty)

Status: in progress

Owner's words: "A lot of the menu level up sounds effects sound scifi like
not like a dark gritty rpg sound effect".

## Milestones

- [ ] Survey: list every UI and menu sound id in src/audio/Bank.ts (ui.*,
  levelup, skill point, quest, gold, loot pickup chimes, panel open and close,
  tabs, hover, confirm, error, inventory, equip) and mark each one that sounds
  synthetic, bleepy or sci-fi (read the ASSETS.md source and listen by
  inspecting spectrum/length with ffmpeg if needed).
- [ ] Replace them with CC0 sounds that fit Diablo II / Path of Exile: leather
  and parchment for panels, metal and wood clicks for buttons, a deep bell or
  low choir swell plus a metal ring for level-up, coin clinks for gold. Kenney
  RPG Audio, Kenney Interface (pick the organic ones only) and CC0 OpenGameArt
  packs. Process with ffmpeg (trim, fade, loudness match the rest of the UI
  bus). Every file in ASSETS.md. Delete the replaced files.
- [ ] Check: `check-assets`, the audio checker in `tools/` that covers the
  bank, typecheck. Handover with a list of old and new sounds.

## Notes for resume

- Sound only. No gameplay changes. Keep the UI bus loudness as it is now.
- Lean testing and the browser lock in PROTOCOL.md are hard rules.
