# Stream: fix-uisound (menu and level-up sounds, dark and gritty)

Status: in progress

Owner's words: "A lot of the menu level up sounds effects sound scifi like
not like a dark gritty rpg sound effect".

## Milestones

- [x] Survey: list every UI and menu sound id in src/audio/Bank.ts (ui.*,
  levelup, skill point, quest, gold, loot pickup chimes, panel open and close,
  tabs, hover, confirm, error, inventory, equip) and mark each one that sounds
  synthetic, bleepy or sci-fi (read the ASSETS.md source and listen by
  inspecting spectrum/length with ffmpeg if needed).
- [x] Replace them with CC0 sounds that fit Diablo II / Path of Exile: leather
  and parchment for panels, metal and wood clicks for buttons, a deep bell or
  low choir swell plus a metal ring for level-up, coin clinks for gold. Kenney
  RPG Audio, Kenney Interface (pick the organic ones only) and CC0 OpenGameArt
  packs. Process with ffmpeg (trim, fade, loudness match the rest of the UI
  bus). Every file in ASSETS.md. Delete the replaced files.
- [ ] Skill sounds (owner, added later): "skill sounds need to be worked too
  to sound more like what the skill is, they're also too sci-fi sounding with
  a lot of chimes". Go through every skill sound id (cast.*, nova.*, beam.*,
  bolt and projectile flights, impacts, shouts, buffs, summons, traps,
  movement skills) and make each one sound like what it is: fire roars and
  crackles, frost cracks and shatters, lightning snaps and thunders, poison
  hisses and bubbles, arcane is a low hum or whoosh (not a chime), physical
  skills are steel, thuds and grunts, shouts are voices, summons are bone and
  earth. Remove chimes, bleeps, sweeps and synth tones. Dark, heavy, organic,
  like Diablo II and Path of Exile. Same CC0 rules, loudness matched to the
  current skill bus.
- [ ] Check: `check-assets`, the audio checker in `tools/` that covers the
  bank, typecheck. Handover with a list of old and new sounds.

## Survey (UI and reward sounds)

Synthetic or sci-fi before this stream (all replaced):

- ui.click, ui.hover: Kenney UI Audio plastic clicks and rollover bleeps.
- ui.select, ui.error: Kenney Interface synth bleeps and buzz tones.
- skillpoint, levelup: JaggedStone "magical" synth shimmers, Someoneman
  "Cure" synth chimes, bright 1.8 kHz bells.
- quest.complete: HaelDB "gmae.wav" jingle and a Kenney music jingle.
- craft.success, drop.unique, loot.legendary, pickup.rare: magical and Cure
  layers; drop.rare, drop.set: bright 1.8 kHz bells.

Already organic and kept: ui.open, ui.close, ui.tab (books, leather),
ui.equip, ui.unequip (chainmail, belts), ui.buy, ui.sell, gold.* (coins),
loot.*, drop.magic, pickup.magic, pickup.kind.*.

New sources (CC0, in tools/audio/packs.mjs): `chant` (owlishmedia, creepy
incoherent chanting), `anvil` (themightyglider, hammer on anvil), `bells`
(pwl, bell dings). Removed unused packs: kf, ku, kj, done.

Wiring: `ui.levelup` (spending a skill point, respec) now plays `skillpoint`
instead of the full level-up toll.

## Notes for resume

- Build: `SLAY_AUDIO_SRC=/tmp/slay-downloads/fix-uisound/src node
  tools/build-audio.mjs --only=<prefix>`. That folder is links to
  /tmp/slay-downloads/audio plus this stream's downloads. If it is gone, run
  build-audio with `--fetch` (fetches every pack into the default root).
- build-audio rewrites ASSETS.md with sound rows moved to the end. Restore the
  order after each build with a small in-place row replace (keep HEAD order)
  so the diff stays small.

- Sound only. No gameplay changes. Keep the UI bus loudness as it is now.
- Lean testing and the browser lock in PROTOCOL.md are hard rules.
