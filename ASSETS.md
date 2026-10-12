# Assets

Every file under `public/assets/` is listed here. CC0 only. See "Art and
sound files" in `docs/remake/PLAN.md`. `tools/check-assets.mjs` checks this
table against the folder.

Layout: `textures/world/<material>/` (ground: floors, walls, terrain),
`textures/hero/`, `textures/creatures/`, `textures/items/`, `textures/props/`,
`textures/fx/` (each stream's own), `sounds/`, `music/`. Paths in the table
are relative to `public/assets/`. Textures are WebP (at most 1024 px), sounds
and music OGG Vorbis.

Changed from the source: `sounds/block/01.ogg` to `06.ogg` were peak-limited
(-0.5 dBFS) and re-encoded at Vorbis q4, since the originals decoded up to
+13 dBFS and clipped the mix.

| Path | Source page | Author | Licence |
| --- | --- | --- | --- |
| music/boss.dread/01.ogg | https://opengameart.org/content/great-boss | Spring Spring | CC0 |
| music/boss.epic/01.ogg | https://opengameart.org/content/boss-battle-music | SubspaceAudio | CC0 |
| music/boss.metal/01.ogg | https://opengameart.org/content/boss-battle-2-symphonic-metal | nene | CC0 |
| music/boss.war/01.ogg | https://opengameart.org/content/boss-battle-theme | CleytonKauffman | CC0 |
| music/caverns/01.ogg | https://opengameart.org/content/cave-theme | HaelDB | CC0 |
| music/crypt/01.ogg | https://opengameart.org/content/forgoten-tomb-ambience | kindland | CC0 |
| music/death/01.ogg | https://opengameart.org/content/game-over-theme | CleytonKauffman | CC0 |
| music/desert/01.ogg | https://opengameart.org/content/desert-theme | yd | CC0 |
| music/forest/01.ogg | https://opengameart.org/content/creepy-forest-f | HaelDB | CC0 |
| music/forest/02.ogg | https://opengameart.org/content/dark-forest-theme | cynicmusic | CC0 |
| music/foundry/01.ogg | https://opengameart.org/content/the-9th-circle | Joth | CC0 |
| music/frozen/01.ogg | https://opengameart.org/content/icy-realm-seven-and-eight | cynicmusic | CC0 |
| music/frozen/02.ogg | https://opengameart.org/content/wintery-loop | Emma_MA | CC0 |
| music/hell/01.ogg | https://opengameart.org/content/night-prowler | section31 | CC0 |
| music/hive/01.ogg | https://opengameart.org/content/creepy | TokyoGeisha | CC0 |
| music/menu/01.ogg | https://opengameart.org/content/tragic-ambient-main-menu | HaelDB | CC0 |
| music/swamp/01.ogg | https://opengameart.org/content/rat-sewer | HaelDB | CC0 |
| music/temple/01.ogg | https://opengameart.org/content/shrine | yd | CC0 |
| music/temple/02.ogg | https://opengameart.org/content/breves-dies-hominis | ceninan | CC0 |
| music/tomb/01.ogg | https://opengameart.org/content/dungeon-ambience | yd | CC0 |
| music/town/01.ogg | https://opengameart.org/content/town-in-ruins-loop | HaelDB | CC0 |
| music/town/02.ogg | https://opengameart.org/content/medieval-the-old-tower-inn | RandomMind | CC0 |
| music/victory/01.ogg | https://opengameart.org/content/victory | celestialghost8 | CC0 |
| music/void/01.ogg | https://opengameart.org/content/sirens-in-darkness | cynicmusic | CC0 |
| sounds/amb.anvil/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/amb.anvil/02.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/amb.anvil/03.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/amb.anvil/04.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.bird/01.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/amb.bird/02.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/amb.bird/03.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/amb.bird/04.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/amb.bird/05.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/amb.bird/06.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/amb.buzz/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/amb.buzz/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/amb.buzz/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/amb.buzz/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/amb.buzz/05.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/amb.chain/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/amb.chain/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/amb.chain/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/amb.crackle/01.ogg | https://opengameart.org/content/fire-crackling | AntumDeluge | CC0 |
| sounds/amb.crackle/02.ogg | https://opengameart.org/content/catching-fire | themightyglider | CC0 |
| sounds/amb.creak/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/amb.creak/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/amb.creak/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/amb.creak/04.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/amb.creak/05.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/amb.creak/06.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.crow/01.ogg | https://opengameart.org/content/crow-caw | zeroisnotnull | CC0 |
| sounds/amb.crow/02.ogg | https://opengameart.org/content/crow-caw | zeroisnotnull | CC0 |
| sounds/amb.drip/01.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.drip/02.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.drip/03.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.drip/04.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/amb.drip/05.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/amb.gust/01.ogg | https://opengameart.org/content/wind | IgnasD | CC0 |
| sounds/amb.gust/02.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/amb.gust/03.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 | CC0 |
| sounds/amb.hiss/01.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.hiss/02.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/amb.hiss/03.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/amb.howl/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/amb.howl/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/amb.lap/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/amb.lap/02.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/amb.lap/03.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/amb.lap/04.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/amb.lap/05.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/amb.moan/01.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/amb.moan/02.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/amb.moan/03.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/amb.moan/04.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/amb.rumble/01.ogg | https://opengameart.org/content/muffled-distant-explosion | NenadSimic | CC0 |
| sounds/amb.rumble/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/amb.shimmer/01.ogg | https://opengameart.org/content/creepy-incoherent-chanting | OwlishMedia | CC0 |
| sounds/amb.shimmer/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/amb.shimmer/03.ogg | https://opengameart.org/content/ghost-breath | qubodup | CC0 |
| sounds/amb.squelch/01.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/amb.squelch/02.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/amb.squelch/03.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/amb.squelch/04.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/amb.stones/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/amb.stones/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/amb.stones/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/amb.stones/04.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/amb.stones/05.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/amb.stones/06.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/amb.whisper/01.ogg | https://opengameart.org/content/ghost-breath | qubodup | CC0 |
| sounds/amb.whisper/02.ogg | https://opengameart.org/content/dark-ambiences | Ogrebane | CC0 |
| sounds/amb.whisper/03.ogg | https://opengameart.org/content/dark-ambiences | Ogrebane | CC0 |
| sounds/amb.whisper/04.ogg | https://opengameart.org/content/dark-ambiences | Ogrebane | CC0 |
| sounds/ambush/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/ambush/02.ogg | https://opengameart.org/content/monster-sound-effects-pack | Ogrebane | CC0 |
| sounds/ambush/03.ogg | https://opengameart.org/content/evil-laugh | AntumDeluge | CC0 |
| sounds/arrow.thunk/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/arrow.thunk/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/arrow.thunk/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/arrow.thunk/04.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/beam.arcane/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/beam.arcane/02.ogg | https://opengameart.org/content/random-sfx | Écrivain | CC0 |
| sounds/beam.fire/01.ogg | https://opengameart.org/content/catching-fire | themightyglider + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/beam.fire/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/beam.lightning/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/beam.lightning/02.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/beam.lightning/03.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero | CC0 |
| sounds/beds/cave/01.ogg | https://opengameart.org/content/dripping-water-loop | qubodup | CC0 |
| sounds/beds/dungeon/01.ogg | https://opengameart.org/content/loopable-dungeon-ambience | JaggedStone | CC0 |
| sounds/beds/fire/01.ogg | https://opengameart.org/content/fireplace-sound-loop | PagDev | CC0 |
| sounds/beds/forest/01.ogg | https://opengameart.org/content/forest-ambience | TinyWorlds | CC0 |
| sounds/beds/forest/02.ogg | https://opengameart.org/content/ambient-bird-sounds | isaiah658 | CC0 |
| sounds/beds/hive/01.ogg | https://opengameart.org/content/crickets-ambient-noise-loopable | Wolfgang_ | CC0 |
| sounds/beds/machine/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/beds/machine/02.ogg | https://opengameart.org/content/30-cc0-sfx-loops | rubberduck | CC0 |
| sounds/beds/rumble/01.ogg | https://opengameart.org/content/fireplace-sound-loop | PagDev | CC0 |
| sounds/beds/swamp/01.ogg | https://opengameart.org/content/swamp-environment-audio | LokiF | CC0 |
| sounds/beds/swamp/02.ogg | https://opengameart.org/content/swamp-environment-audio | LokiF | CC0 |
| sounds/beds/void/01.ogg | https://opengameart.org/content/random-sfx | Écrivain | CC0 |
| sounds/beds/void/02.ogg | https://opengameart.org/content/50-cc0-sci-fi-sfx | rubberduck | CC0 |
| sounds/beds/water/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/beds/water/02.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/beds/wind.desert/01.ogg | https://opengameart.org/content/wind1 | Luke.RUSTLTD | CC0 |
| sounds/beds/wind.desert/02.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 | CC0 |
| sounds/beds/wind.soft/01.ogg | https://opengameart.org/content/wind1 | Luke.RUSTLTD | CC0 |
| sounds/beds/wind.soft/02.ogg | https://opengameart.org/content/wind1 | Luke.RUSTLTD | CC0 |
| sounds/beds/wind/01.ogg | https://opengameart.org/content/wind1 | Luke.RUSTLTD | CC0 |
| sounds/beds/wind/02.ogg | https://opengameart.org/content/wind1 | Luke.RUSTLTD | CC0 |
| sounds/block.magic/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + StarNinjas (opengameart.org/content/10-impactshield-blocks) | CC0 |
| sounds/block.magic/02.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/block.magic/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/block/01.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas | CC0 |
| sounds/block/02.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas | CC0 |
| sounds/block/03.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas | CC0 |
| sounds/block/04.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas | CC0 |
| sounds/block/05.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas | CC0 |
| sounds/block/06.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/boss.intro/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + NenadSimic (opengameart.org/content/muffled-distant-explosion) | CC0 |
| sounds/boss.intro/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/boss.phase/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + NenadSimic (opengameart.org/content/muffled-distant-explosion) | CC0 |
| sounds/boss.phase/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + rubberduck (opengameart.org/content/80-cc0-creture-sfx-2) | CC0 |
| sounds/boss.roar/01.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.roar/02.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.roar/03.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.roar/04.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.roar/05.ogg | https://opengameart.org/content/osare-minotaur-sounds | HaelDB | CC0 |
| sounds/boss.roar/06.ogg | https://opengameart.org/content/osare-minotaur-sounds | HaelDB | CC0 |
| sounds/boss.roar/07.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/boss.roar/08.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/boss.slam/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/boss.slam/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/boss.slam/03.ogg | https://opengameart.org/content/muffled-distant-explosion | NenadSimic + rubberduck (opengameart.org/content/100-cc0-sfx) | CC0 |
| sounds/boss.windup/01.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.windup/02.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.windup/03.ogg | https://opengameart.org/content/big-scary-troll-sounds | Darsycho | CC0 |
| sounds/boss.windup/04.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/cast.arcane/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/cast.arcane/02.ogg | https://opengameart.org/content/sand-spell | qubodup | CC0 |
| sounds/cast.arcane/03.ogg | https://opengameart.org/content/ghost-breath | qubodup + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/cast.arcane/04.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/cast.cold/01.ogg | https://opengameart.org/content/freeze-spell-0 | artisticdude | CC0 |
| sounds/cast.cold/02.ogg | https://opengameart.org/content/ice-spells | bart | CC0 |
| sounds/cast.cold/03.ogg | https://opengameart.org/content/ice-spells | bart + IgnasD (opengameart.org/content/ice-breakingshattering) | CC0 |
| sounds/cast.cold/04.ogg | https://opengameart.org/content/ice-spells | bart | CC0 |
| sounds/cast.fire/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/cast.fire/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/cast.fire/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/cast.fire/04.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/cast.fire/05.ogg | https://opengameart.org/content/fireball-1 | diligentcircle | CC0 |
| sounds/cast.fire/06.ogg | https://opengameart.org/content/flare-ignition | qubodup | CC0 |
| sounds/cast.lightning/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/cast.lightning/02.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/cast.lightning/03.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/cast.lightning/04.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/cast.physical/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/cast.physical/02.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/cast.physical/03.ogg | https://opengameart.org/content/air-whoosh | pyranostudios | CC0 |
| sounds/cast.physical/04.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle + HaelDB (opengameart.org/content/male-gruntyelling-sounds) | CC0 |
| sounds/cast.poison/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/cast.poison/02.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/cast.poison/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/cast.poison/04.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/cast.poison/05.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/cast.poison/06.ogg | https://opengameart.org/content/steam-release-sounds | bart + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/chest/01.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/chest/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/chest/03.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/combo/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/combo/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/cone.cold/01.ogg | https://opengameart.org/content/freeze-spell-0 | artisticdude | CC0 |
| sounds/cone.cold/02.ogg | https://opengameart.org/content/ice-spells | bart + artisticdude (opengameart.org/content/freeze-spell-0) | CC0 |
| sounds/cone.fire/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle | CC0 |
| sounds/cone.fire/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/cone.poison/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/cone.poison/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/cone.poison/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/craft.success/01.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle + BMacZero (opengameart.org/content/metal-impact-sounds) | CC0 |
| sounds/craft.success/02.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + themightyglider (opengameart.org/content/hammer-on-anvil) | CC0 |
| sounds/crit/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/crit/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/crit/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/100-cc0-metal-and-wood-sfx) | CC0 |
| sounds/death.heavy/01.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/death.heavy/02.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/death.normal/01.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/death.normal/02.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/death.normal/03.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/door/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/door/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/door/03.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/drop.magic/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/drop.magic/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/drop.magic/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/drop.rare/01.ogg | https://opengameart.org/content/metal-impact-sounds | BMacZero + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/drop.rare/02.ogg | https://opengameart.org/content/metal-impact-sounds | BMacZero + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/drop.set/01.ogg | https://opengameart.org/content/bell-dingschimes | PWL + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/drop.set/02.ogg | https://opengameart.org/content/bell-dingschimes | PWL | CC0 |
| sounds/drop.unique/01.ogg | https://opengameart.org/content/bell-dingschimes | PWL + BMacZero (opengameart.org/content/metal-impact-sounds) | CC0 |
| sounds/drop.unique/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney + PWL (opengameart.org/content/bell-dingschimes) | CC0 |
| sounds/footstep.dirt/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/footstep.dirt/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/footstep.dirt/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/footstep.dirt/04.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/footstep.dirt/05.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/footstep.dirt/06.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/footstep.grass/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.grass/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.grass/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.grass/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.grass/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.metal/01.ogg | https://opengameart.org/content/footsteps-leather-cloth-armor | HaelDB | CC0 |
| sounds/footstep.metal/02.ogg | https://opengameart.org/content/footsteps-leather-cloth-armor | HaelDB | CC0 |
| sounds/footstep.metal/03.ogg | https://opengameart.org/content/footsteps-leather-cloth-armor | HaelDB | CC0 |
| sounds/footstep.metal/04.ogg | https://opengameart.org/content/footsteps-leather-cloth-armor | HaelDB | CC0 |
| sounds/footstep.mud/01.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/footstep.mud/02.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/footstep.mud/03.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/footstep.mud/04.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/footstep.mud/05.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/footstep.mud/06.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck | CC0 |
| sounds/footstep.sand/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.sand/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.sand/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.sand/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.sand/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.snow/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.snow/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.snow/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.snow/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.snow/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.stone/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.stone/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.stone/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.stone/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.stone/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.water/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/footstep.water/02.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/footstep.water/03.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/footstep.water/04.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/footstep.water/05.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/footstep.wood/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.wood/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.wood/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.wood/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/footstep.wood/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/gold.land/01.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/gold.land/02.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/gold.land/03.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/gold.land/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/gold.spill/01.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/gold.spill/02.ogg | https://opengameart.org/content/sack-of-gold | Amarikah | CC0 |
| sounds/gold.spill/03.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/gold/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/gold/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/gold/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/gold/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/gold/05.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/heartbeat/01.ogg | https://opengameart.org/content/heartbeat-sounds | bart | CC0 |
| sounds/hit.axe/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.axe/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.axe/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.blunt/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.blunt/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.blunt/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.blunt/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.bone/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.bone/02.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.bone/03.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.bone/04.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.chitin/01.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.chitin/02.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.chitin/03.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.chitin/04.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/hit.fist/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.fist/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.fist/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.fist/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.flesh/01.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.flesh/02.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.flesh/03.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.flesh/04.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.heavy/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/hit.heavy/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.heavy/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/hit.melee/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.melee/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.melee/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.melee/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.melee/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.metal/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.metal/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.metal/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.metal/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.metal/05.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.ooze/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/hit.ooze/02.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/hit.ooze/03.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/hit.ooze/04.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/hit.ooze/05.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/hit.pierce/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/hit.pierce/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/hit.pierce/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/hit.stone/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.stone/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.stone/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.stone/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.sword/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.sword/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.sword/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.sword/04.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/hit.wood/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.wood/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.wood/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/hit.wood/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/howl/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/howl/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/howl/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/impact.arcane/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/impact.arcane/02.ogg | https://opengameart.org/content/sand-spell | qubodup + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/impact.arcane/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney + qubodup (opengameart.org/content/ghost-breath) | CC0 |
| sounds/impact.cold/01.ogg | https://opengameart.org/content/ice-breakingshattering | IgnasD | CC0 |
| sounds/impact.cold/02.ogg | https://opengameart.org/content/ice-breakingshattering | IgnasD | CC0 |
| sounds/impact.cold/03.ogg | https://opengameart.org/content/ice-breakingshattering | IgnasD | CC0 |
| sounds/impact.cold/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/impact.cold/05.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/impact.fire/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/impact.fire/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/impact.fire/03.ogg | https://opengameart.org/content/catching-fire | themightyglider + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/impact.fire/04.ogg | https://opengameart.org/content/explosion-0 | TinyWorlds | CC0 |
| sounds/impact.lightning/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/impact.lightning/02.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/impact.lightning/03.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/impact.lightning/04.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/impact.poison/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/impact.poison/02.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/impact.poison/03.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/impact.poison/04.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/impact.poison/05.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/impact.poison/06.ogg | https://opengameart.org/content/steam-release-sounds | bart + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/jump/01.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle | CC0 |
| sounds/jump/02.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle | CC0 |
| sounds/jump/03.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle | CC0 |
| sounds/kill.confirm/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/kill.confirm/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/kill.confirm/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/kill.elite/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/kill.elite/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/kill.multi/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/kill.multi/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/land/01.ogg | https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud | TinyWorlds + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/land/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/levelup/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) + BMacZero (opengameart.org/content/metal-impact-sounds) | CC0 |
| sounds/levelup/02.ogg | https://opengameart.org/content/bell-dingschimes | PWL + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) + rubberduck (opengameart.org/content/100-cc0-sfx) | CC0 |
| sounds/loot.clink/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/loot.clink/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/loot.clink/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/loot.clink/04.ogg | https://opengameart.org/content/metal-impact-sounds | BMacZero | CC0 |
| sounds/loot.clink/05.ogg | https://opengameart.org/content/metal-impact-sounds | BMacZero | CC0 |
| sounds/loot.clink/06.ogg | https://opengameart.org/content/metal-impact-sounds | BMacZero | CC0 |
| sounds/loot.grab/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/loot.grab/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/loot.grab/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/loot.legendary/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + PWL (opengameart.org/content/bell-dingschimes) + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/loot.legendary/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney + PWL (opengameart.org/content/bell-dingschimes) + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/loot.toss/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/loot.toss/02.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/monster.aberration.aggro/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.aggro/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.aggro/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.aggro/04.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.attack/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.aberration.attack/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.aberration.attack/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.aberration.attack/04.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.death/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.aberration.death/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.aberration.death/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.hurt/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.hurt/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.hurt/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.aberration.hurt/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.aggro/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.beast.aggro/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.aggro/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.aggro/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.beast.attack/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.attack/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.attack/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.attack/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.beast.attack/05.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.beast.death/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.death/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.death/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.death/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.beast.hurt/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.beast.hurt/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.beast.hurt/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.beast.hurt/04.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.beast.hurt/05.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.construct.aggro/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/monster.construct.aggro/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/monster.construct.aggro/03.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/monster.construct.attack/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.construct.attack/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.construct.attack/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.construct.attack/04.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.construct.death/01.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + rubberduck (opengameart.org/content/100-cc0-metal-and-wood-sfx) | CC0 |
| sounds/monster.construct.death/02.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/monster.construct.hurt/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.construct.hurt/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.construct.hurt/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.construct.hurt/04.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.demon.aggro/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.aggro/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.aggro/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.aggro/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.attack/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.attack/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.attack/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.attack/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.death/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.death/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.demon.death/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.demon.hurt/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.hurt/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.hurt/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.demon.hurt/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.elemental.aggro/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + NenadSimic (opengameart.org/content/muffled-distant-explosion) | CC0 |
| sounds/monster.elemental.aggro/02.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.elemental.attack/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/monster.elemental.attack/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/monster.elemental.attack/03.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.elemental.death/01.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/monster.elemental.death/02.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.elemental.hurt/01.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.elemental.hurt/02.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.elemental.hurt/03.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.elemental.hurt/04.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/monster.humanoid.aggro/01.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.aggro/02.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.aggro/03.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.aggro/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.humanoid.attack/01.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.attack/02.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.attack/03.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.attack/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.humanoid.death/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.humanoid.death/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.humanoid.death/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.humanoid.death/04.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.hurt/01.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.hurt/02.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.hurt/03.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.hurt/04.ogg | https://opengameart.org/content/goblins-sound-pack | artisticdude | CC0 |
| sounds/monster.humanoid.hurt/05.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.aggro/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.insect.aggro/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.insect.aggro/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.insect.aggro/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.insect.attack/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.attack/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.attack/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.attack/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.insect.death/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck + Vehicle (opengameart.org/content/fantasy-sound-effects-tinysized-sfx) | CC0 |
| sounds/monster.insect.death/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/monster.insect.death/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + Vehicle (opengameart.org/content/fantasy-sound-effects-tinysized-sfx) | CC0 |
| sounds/monster.insect.hurt/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.hurt/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.hurt/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.insect.hurt/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.aggro/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.ooze.aggro/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.ooze.aggro/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/monster.ooze.attack/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.attack/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.attack/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.attack/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.ooze.death/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/monster.ooze.death/02.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/monster.ooze.hurt/01.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.hurt/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.hurt/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/monster.ooze.hurt/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.ooze.hurt/05.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.plant.aggro/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/monster.plant.aggro/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/monster.plant.aggro/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/monster.plant.aggro/04.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.attack/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.attack/02.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.attack/03.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.attack/04.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/monster.plant.death/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.death/02.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.plant.hurt/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.hurt/02.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/monster.plant.hurt/03.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/monster.plant.hurt/04.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/monster.swing/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/monster.swing/02.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/monster.swing/03.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/monster.swing/04.ogg | https://opengameart.org/content/3-melee-sounds | remaxim | CC0 |
| sounds/monster.undead.aggro/01.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.aggro/02.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.aggro/03.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.aggro/04.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.attack/01.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.attack/02.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.attack/03.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.attack/04.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.death/01.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.death/02.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.death/03.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.death/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.hurt/01.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.hurt/02.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.hurt/03.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/monster.undead.hurt/04.ogg | https://opengameart.org/content/zombies-sound-pack | artisticdude | CC0 |
| sounds/nova.arcane/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/nova.arcane/02.ogg | https://opengameart.org/content/muffled-distant-explosion | NenadSimic + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/nova.arcane/03.ogg | https://opengameart.org/content/sand-spell | qubodup + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/nova.cold/01.ogg | https://opengameart.org/content/ice-breakingshattering | IgnasD + artisticdude (opengameart.org/content/freeze-spell-0) | CC0 |
| sounds/nova.cold/02.ogg | https://opengameart.org/content/ice-breakingshattering | IgnasD | CC0 |
| sounds/nova.cold/03.ogg | https://opengameart.org/content/freeze-spell-0 | artisticdude | CC0 |
| sounds/nova.fire/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/nova.fire/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/nova.fire/03.ogg | https://opengameart.org/content/fireball-1 | diligentcircle | CC0 |
| sounds/nova.lightning/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/nova.lightning/02.ogg | https://opengameart.org/content/rain-long-thunder | WuxiaScrub + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/nova.physical/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/nova.physical/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/nova.poison/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/nova.poison/02.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck | CC0 |
| sounds/nova.poison/03.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/parry/01.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/parry/02.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/parry/03.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/parry/04.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/parry/05.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/parry/06.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle | CC0 |
| sounds/pickup.kind.armor/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.armor/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.armor/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.armor/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.gem/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.gem/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.gem/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.jewel/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.jewel/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.jewel/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.material/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.material/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.material/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.material/04.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/pickup.kind.material/05.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.potion/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.potion/02.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/pickup.kind.potion/03.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/pickup.kind.weapon/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/pickup.kind.weapon/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/pickup.kind.weapon/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/pickup.kind.weapon/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.kind.weapon/05.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/pickup.magic/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/pickup.magic/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/pickup.rare/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/pickup.rare/02.ogg | https://opengameart.org/content/metal-impact-sounds | BMacZero + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/player.death/01.ogg | https://opengameart.org/content/hurt-death-sound-effect-for-character | Badre-Eddine | CC0 |
| sounds/player.death/02.ogg | https://opengameart.org/content/hurt-death-sound-effect-for-character | Badre-Eddine | CC0 |
| sounds/player.death/03.ogg | https://opengameart.org/content/hurt-death-sound-effect-for-character | Badre-Eddine | CC0 |
| sounds/player.death/04.ogg | https://opengameart.org/content/5-hit-sounds-dying | TinyWorlds | CC0 |
| sounds/player.evade/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/player.evade/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/player.hurt/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.hurt/02.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.hurt/03.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.hurt/04.ogg | https://opengameart.org/content/5-hit-sounds-dying | TinyWorlds | CC0 |
| sounds/player.hurt/05.ogg | https://opengameart.org/content/5-hit-sounds-dying | TinyWorlds | CC0 |
| sounds/player.hurtHeavy/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.hurtHeavy/02.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.hurtHeavy/03.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.hurtHeavy/04.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/player.stunned/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + HaelDB (opengameart.org/content/male-gruntyelling-sounds) | CC0 |
| sounds/portal/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) + cinameng (opengameart.org/content/rumble-fx) | CC0 |
| sounds/portal/02.ogg | https://opengameart.org/content/muffled-distant-explosion | NenadSimic + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/portal/03.ogg | https://opengameart.org/content/ghost-breath | qubodup + SketchMan3 (opengameart.org/content/wind-whoosh-loop) | CC0 |
| sounds/potion/01.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/potion/02.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/potion/03.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/quest.complete/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/quest.complete/02.ogg | https://opengameart.org/content/bell-dingschimes | PWL + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) + rubberduck (opengameart.org/content/100-cc0-sfx) | CC0 |
| sounds/roar/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/roar/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/roar/03.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/roar/04.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/screech/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck | CC0 |
| sounds/screech/02.ogg | https://opengameart.org/content/80-cc0-creture-sfx-2 | rubberduck | CC0 |
| sounds/screech/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/shoot.physical/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/shoot.physical/02.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/shoot.physical/03.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle + Ogrebane (opengameart.org/content/battle-sound-effects) | CC0 |
| sounds/shrine/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/shrine/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.arcane.bolt/01.ogg | https://opengameart.org/content/sand-spell | qubodup | CC0 |
| sounds/skill.arcane.hit/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/skill.arrow.barb/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/skill.arrow.heavy/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.arrow.hit/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.arrow.mark/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/skill.arrow.rain/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/skill.arrow.ricochet/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/skill.banner/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + Kenney (kenney.nl/assets/rpg-audio) + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/skill.blight.aura/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck + rubberduck (opengameart.org/content/80-cc0-creature-sfx) | CC0 |
| sounds/skill.blight.bolt/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/skill.blight.hit/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.blight.nova/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.blink/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.blood.nova/01.ogg | https://opengameart.org/content/25-cc0-mud-sfx | rubberduck + NenadSimic (opengameart.org/content/muffled-distant-explosion) + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/skill.blood.pact/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.bone.armor/01.ogg | https://opengameart.org/content/bones-rattle | congusbongus + Zane Little Music (opengameart.org/content/deep-bone-crackbreak-sfx) | CC0 |
| sounds/skill.bone.bolt/01.ogg | https://opengameart.org/content/sand-spell | qubodup | CC0 |
| sounds/skill.bone.cage/01.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + congusbongus (opengameart.org/content/bones-rattle) + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/skill.bone.host/01.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + congusbongus (opengameart.org/content/bones-rattle) + cinameng (opengameart.org/content/rumble-fx) | CC0 |
| sounds/skill.bone.mage/01.ogg | https://opengameart.org/content/bones-rattle | congusbongus + qubodup (opengameart.org/content/earth-element-magic-spell) + qubodup (opengameart.org/content/ghost-breath) | CC0 |
| sounds/skill.bone.nova/01.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) + congusbongus (opengameart.org/content/bones-rattle) | CC0 |
| sounds/skill.bone.raise/01.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + congusbongus (opengameart.org/content/bones-rattle) + cinameng (opengameart.org/content/rumble-fx) | CC0 |
| sounds/skill.bone.reassemble/01.ogg | https://opengameart.org/content/bones-rattle | congusbongus | CC0 |
| sounds/skill.bone.slash/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude + congusbongus (opengameart.org/content/bones-rattle) + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.bone.spear/01.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.bone.spearHit/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.bone.spirit/01.ogg | https://opengameart.org/content/ghost-breath | qubodup + qubodup (opengameart.org/content/ghost-monster-voice-moaning-growling) | CC0 |
| sounds/skill.bone.spiritHit/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + Zane Little Music (opengameart.org/content/deep-bone-crackbreak-sfx) | CC0 |
| sounds/skill.bone.storm/01.ogg | https://opengameart.org/content/bones-rattle | congusbongus + SketchMan3 (opengameart.org/content/wind-whoosh-loop) | CC0 |
| sounds/skill.bow.fan/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/skill.bow.heavy/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Ogrebane (opengameart.org/content/battle-sound-effects) + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.bow.mark/01.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle + Ogrebane (opengameart.org/content/battle-sound-effects) | CC0 |
| sounds/skill.bow.pierce/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + artisticdude (opengameart.org/content/swishes-sound-pack) + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/skill.bow.sky/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.bow.stream/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/skill.bow.twin/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/skill.bow/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/skill.camo/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.charge/01.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle + artisticdude (opengameart.org/content/rpg-sound-pack) + rubberduck (opengameart.org/content/100-cc0-sfx-2) + HaelDB (opengameart.org/content/male-gruntyelling-sounds) | CC0 |
| sounds/skill.clay.raise/01.ogg | https://opengameart.org/content/earth-element-magic-spell | qubodup + cinameng (opengameart.org/content/rumble-fx) + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/skill.clay.slam/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney | CC0 |
| sounds/skill.clone.strike/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.clone/01.ogg | https://opengameart.org/content/ghost-breath | qubodup + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/skill.coat.venom/01.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.cold.grave/01.ogg | https://opengameart.org/content/freeze-spell-0 | artisticdude + qubodup (opengameart.org/content/ghost-monster-voice-moaning-growling) | CC0 |
| sounds/skill.corpse.burst/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) + Zane Little Music (opengameart.org/content/deep-bone-crackbreak-sfx) | CC0 |
| sounds/skill.curse.amplify/01.ogg | https://opengameart.org/content/creepy-incoherent-chanting | OwlishMedia | CC0 |
| sounds/skill.curse.confuse/01.ogg | https://opengameart.org/content/creepy-incoherent-chanting | OwlishMedia | CC0 |
| sounds/skill.curse.doom/01.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.curse.lower/01.ogg | https://opengameart.org/content/ghost | Ogrebane | CC0 |
| sounds/skill.curse.terror/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + Ogrebane (opengameart.org/content/ghost) | CC0 |
| sounds/skill.curse.weaken/01.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/skill.dash.blades/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + artisticdude (opengameart.org/content/swishes-sound-pack) + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.drain.blood/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) + qubodup (opengameart.org/content/ghost-breath) | CC0 |
| sounds/skill.drain.siphon/01.ogg | https://opengameart.org/content/ghost-breath | qubodup + SketchMan3 (opengameart.org/content/wind-whoosh-loop) | CC0 |
| sounds/skill.eclipse/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.fire.annihilate/01.ogg | https://opengameart.org/content/explosion-0 | TinyWorlds + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) + NenadSimic (opengameart.org/content/muffled-distant-explosion) | CC0 |
| sounds/skill.fire.anvil/01.ogg | https://opengameart.org/content/hammer-on-anvil | themightyglider + themightyglider (opengameart.org/content/catching-fire) | CC0 |
| sounds/skill.fire.ash/01.ogg | https://opengameart.org/content/steam-release-sounds | bart + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.ball/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle | CC0 |
| sounds/skill.fire.blast/01.ogg | https://opengameart.org/content/explosion-0 | TinyWorlds + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.bolt/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/skill.fire.brand/01.ogg | https://opengameart.org/content/flare-ignition | qubodup + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.fire.breath/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + themightyglider (opengameart.org/content/catching-fire) | CC0 |
| sounds/skill.fire.burst/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.consume/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.embers/01.ogg | https://opengameart.org/content/fire-crackling | AntumDeluge + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.fire.erupt/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + AntumDeluge (opengameart.org/content/fire-crackling) + cinameng (opengameart.org/content/rumble-fx) | CC0 |
| sounds/skill.fire.helios/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + AntumDeluge (opengameart.org/content/fire-crackling) + themightyglider (opengameart.org/content/catching-fire) | CC0 |
| sounds/skill.fire.hit/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/skill.fire.ignite/01.ogg | https://opengameart.org/content/flare-ignition | qubodup | CC0 |
| sounds/skill.fire.immolate/01.ogg | https://opengameart.org/content/flare-ignition | qubodup + themightyglider (opengameart.org/content/catching-fire) | CC0 |
| sounds/skill.fire.lance/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + themightyglider (opengameart.org/content/catching-fire) | CC0 |
| sounds/skill.fire.longBurn/01.ogg | https://opengameart.org/content/rumble-fx | cinameng + AntumDeluge (opengameart.org/content/fire-crackling) + qubodup (opengameart.org/content/flare-ignition) | CC0 |
| sounds/skill.fire.meteor/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.meteorCall/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios + diligentcircle (opengameart.org/content/fireball-1) | CC0 |
| sounds/skill.fire.nova/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.pyre/01.ogg | https://opengameart.org/content/catching-fire | themightyglider + AntumDeluge (opengameart.org/content/fire-crackling) + Zane Little Music (opengameart.org/content/deep-bone-crackbreak-sfx) | CC0 |
| sounds/skill.fire.shroud/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.storm/01.ogg | https://opengameart.org/content/muffled-distant-explosion | NenadSimic + AntumDeluge (opengameart.org/content/fire-crackling) + themightyglider (opengameart.org/content/catching-fire) | CC0 |
| sounds/skill.fire.stream/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.sun/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + cinameng (opengameart.org/content/rumble-fx) + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.fire.wall/01.ogg | https://opengameart.org/content/catching-fire | themightyglider + qubodup (opengameart.org/content/flare-ignition) + AntumDeluge (opengameart.org/content/fire-crackling) | CC0 |
| sounds/skill.fire.ward/01.ogg | https://opengameart.org/content/catching-fire | themightyglider + StarNinjas (opengameart.org/content/10-impactshield-blocks) | CC0 |
| sounds/skill.fire.wave/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/skill.fire.wisp/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + qubodup (opengameart.org/content/ghost-breath) | CC0 |
| sounds/skill.fire.wispShot/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/skill.gorefeast/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + rubberduck (opengameart.org/content/25-cc0-mud-sfx) + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/skill.hit.ambush/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/skill.hit.backstab/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.hit.cleave/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/skill.hit.crush/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.hit.execute/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Zane Little Music (opengameart.org/content/deep-bone-crackbreak-sfx) + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.hit.gash/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.hit.maim/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + rubberduck (opengameart.org/content/100-cc0-metal-and-wood-sfx) | CC0 |
| sounds/skill.hit.massacre/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/skill.hit.precise/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/skill.hit.rend/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/25-cc0-mud-sfx) | CC0 |
| sounds/skill.hit.ruin/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/skill.hit.sunder/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.hit.tendon/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/100-cc0-metal-and-wood-sfx) | CC0 |
| sounds/skill.hit.viper/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/skill.hit.whirl/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.knife.hit/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.leap.back/01.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle + Kenney (kenney.nl/assets/rpg-audio) + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.light.form/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.light.radiance/01.ogg | https://opengameart.org/content/creepy-incoherent-chanting | OwlishMedia + SketchMan3 (opengameart.org/content/wind-whoosh-loop) | CC0 |
| sounds/skill.nightfall/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + qubodup (opengameart.org/content/ghost-monster-voice-moaning-growling) | CC0 |
| sounds/skill.poison.burst/01.ogg | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | rubberduck + rubberduck (opengameart.org/content/80-cc0-creature-sfx) + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.poison.cloud/01.ogg | https://opengameart.org/content/steam-release-sounds | bart + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) | CC0 |
| sounds/skill.poison.dart/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.poison.vial/01.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck + rubberduck (opengameart.org/content/40-cc0-water-splash-slime-sfx) + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.quake/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + cinameng (opengameart.org/content/rumble-fx) + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/skill.reap/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + qubodup (opengameart.org/content/ghost-monster-voice-moaning-growling) + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/skill.revenant.form/01.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + qubodup (opengameart.org/content/ghost-monster-voice-moaning-growling) + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.roll/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + artisticdude (opengameart.org/content/swishes-sound-pack) + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) | CC0 |
| sounds/skill.shadowStep/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + qubodup (opengameart.org/content/ghost-breath) | CC0 |
| sounds/skill.shield.bash/01.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.shield.ring/01.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/skill.shield.throw/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/skill.shield.wall/01.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/skill.shout.battle/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/skill.shout.fear/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/skill.shout.herald/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) + cinameng (opengameart.org/content/rumble-fx) | CC0 |
| sounds/skill.shout.rally/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.shout.taunt/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/skill.smoke/01.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.soul.cage/01.ogg | https://opengameart.org/content/ghost | Ogrebane + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.soul.tether/01.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck + qubodup (opengameart.org/content/ghost-monster-voice-moaning-growling) | CC0 |
| sounds/skill.stance.fortress/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + rubberduck (opengameart.org/content/100-cc0-sfx) + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/skill.stance.guard/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude + Kenney (kenney.nl/assets/impact-sounds) + StarNinjas (opengameart.org/content/10-impactshield-blocks) | CC0 |
| sounds/skill.stomp/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/skill.storm.arc/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/skill.storm.ball/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.burst/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + BMacZero (opengameart.org/content/electricity-sound-effects-0) + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.storm.call/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.chain/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/skill.storm.charge/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.storm.clap/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.storm.coil/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.discharge/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/skill.storm.eye/01.ogg | https://opengameart.org/content/rain-long-thunder | WuxiaScrub + SketchMan3 (opengameart.org/content/wind-whoosh-loop) | CC0 |
| sounds/skill.storm.gather/01.ogg | https://opengameart.org/content/rain-long-thunder | WuxiaScrub | CC0 |
| sounds/skill.storm.ionize/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.lance/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + rubberduck (opengameart.org/content/100-cc0-sfx-2) + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.nova/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.orb/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.orbHit/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.overcharge/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.pillar/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + faxcorp (opengameart.org/content/electricity-game-sound-pack) | CC0 |
| sounds/skill.storm.polarize/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.rod/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.shield/01.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.skyfall/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/skill.storm.spark/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/skill.storm.sparkHit/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.storm.static/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/skill.storm.strike/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/skill.storm.veil/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.storm.zap/01.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero | CC0 |
| sounds/skill.supernova/01.ogg | https://opengameart.org/content/fireball-1 | diligentcircle + TinyWorlds (opengameart.org/content/explosion-0) + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.swing.blade/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/skill.swing.double/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/skill.swing.flurry/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/skill.swing.heavy/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + HaelDB (opengameart.org/content/male-gruntyelling-sounds) | CC0 |
| sounds/skill.swing.lotus/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude + bart (opengameart.org/content/steam-release-sounds) | CC0 |
| sounds/skill.swing.quick/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/skill.swing.ruin/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + HaelDB (opengameart.org/content/male-gruntyelling-sounds) | CC0 |
| sounds/skill.swing.shadow/01.ogg | https://opengameart.org/content/ghost-breath | qubodup + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.swing.shield/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/skill.swing.wide/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.thorns/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/100-cc0-metal-and-wood-sfx) + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/skill.throw.dart/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/skill.throw.fan/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/skill.throw.knife/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/skill.throw.vial/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude + Vehicle (opengameart.org/content/fantasy-accessory-sfx-library) | CC0 |
| sounds/skill.trap.field/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skill.trap.snare/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.trap.spike/01.ogg | https://kenney.nl/assets/impact-sounds | Kenney + Kenney (kenney.nl/assets/rpg-audio) + rubberduck (opengameart.org/content/80-cc0-rpg-sfx) | CC0 |
| sounds/skill.vanish/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.veil/01.ogg | https://opengameart.org/content/ghost-breath | qubodup + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.viper.bite/01.ogg | https://opengameart.org/content/80-cc0-creature-sfx | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.viper/01.ogg | https://opengameart.org/content/steam-release-sounds | bart + rubberduck (opengameart.org/content/80-cc0-creature-sfx) | CC0 |
| sounds/skill.voidWalk/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.ward.aegis/01.ogg | https://opengameart.org/content/hammer-on-anvil | themightyglider + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/skill.whirlwind/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/skill.wind.cyclone/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 | CC0 |
| sounds/skill.wind.dance/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + BMacZero (opengameart.org/content/electricity-sound-effects-0) | CC0 |
| sounds/skill.wind.gust/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/skill.wind.hurricane/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + Écrivain (opengameart.org/content/random-sfx) | CC0 |
| sounds/skill.wind.maelstrom/01.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/skill.wind.shear/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/skill.wind.step/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + Kenney (kenney.nl/assets/rpg-audio) | CC0 |
| sounds/skill.wind.updraft/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck + Vehicle (opengameart.org/content/fantasy-weapons-and-apparel-sfx-library) + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/skillpoint/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney + BMacZero (opengameart.org/content/metal-impact-sounds) | CC0 |
| sounds/skillpoint/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/slam/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/slam/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/slam/03.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/slam/04.ogg | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | rubberduck | CC0 |
| sounds/spell.chainLightning/01.ogg | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 |
| sounds/spell.chainLightning/02.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/spell.chainLightning/03.ogg | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/spell.explosion/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/spell.explosion/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/spell.explosion/03.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/spell.explosion/04.ogg | https://opengameart.org/content/explosion-0 | TinyWorlds | CC0 |
| sounds/spell.explosion/05.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/spell.heal/01.ogg | https://opengameart.org/content/creepy-incoherent-chanting | OwlishMedia + rubberduck (opengameart.org/content/100-cc0-sfx-2) | CC0 |
| sounds/spell.heal/02.ogg | https://opengameart.org/content/creepy-incoherent-chanting | OwlishMedia + pyranostudios (opengameart.org/content/air-whoosh) | CC0 |
| sounds/spell.heal/03.ogg | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | Vehicle + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| sounds/spell.meteor/01.ogg | https://opengameart.org/content/muffled-distant-explosion | NenadSimic + rubberduck (opengameart.org/content/25-cc0-bang-firework-sfx) | CC0 |
| sounds/spell.meteor/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/spell.shield/01.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/spell.shield/02.ogg | https://opengameart.org/content/10-impactshield-blocks | StarNinjas + rubberduck (opengameart.org/content/100-cc0-metal-and-wood-sfx) | CC0 |
| sounds/spell.shield/03.ogg | https://kenney.nl/assets/impact-sounds | Kenney + artisticdude (opengameart.org/content/rpg-sound-pack) | CC0 |
| sounds/spell.summon/01.ogg | https://opengameart.org/content/earth-element-magic-spell | qubodup | CC0 |
| sounds/spell.summon/02.ogg | https://opengameart.org/content/deep-bone-crackbreak-sfx | Zane Little Music + congusbongus (opengameart.org/content/bones-rattle) + cinameng (opengameart.org/content/rumble-fx) | CC0 |
| sounds/spell.summon/03.ogg | https://opengameart.org/content/ghost-breath | qubodup + rubberduck (opengameart.org/content/75-cc0-breaking-falling-hit-sfx) | CC0 |
| sounds/spell.teleportIn/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios | CC0 |
| sounds/spell.teleportIn/02.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 | CC0 |
| sounds/spell.teleportIn/03.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/spell.teleportOut/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios + Kenney (kenney.nl/assets/impact-sounds) | CC0 |
| sounds/spell.teleportOut/02.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 | CC0 |
| sounds/spell.teleportOut/03.ogg | https://opengameart.org/content/ghost-breath | qubodup + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/spell.thunder/01.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/spell.thunder/02.ogg | https://opengameart.org/content/100-cc0-sfx-2 | rubberduck | CC0 |
| sounds/spell.thunder/03.ogg | https://opengameart.org/content/rain-long-thunder | WuxiaScrub | CC0 |
| sounds/spell.volley/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/spell.volley/02.ogg | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | Vehicle + Ogrebane (opengameart.org/content/battle-sound-effects) | CC0 |
| sounds/spell.whirlwind/01.ogg | https://opengameart.org/content/air-whoosh | pyranostudios | CC0 |
| sounds/spell.whirlwind/02.ogg | https://opengameart.org/content/wind-whoosh-loop | SketchMan3 | CC0 |
| sounds/stairs/01.ogg | https://opengameart.org/content/stone-door | bonebrah | CC0 |
| sounds/stairs/02.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/swing.axe/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/swing.axe/02.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/swing.axe/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/swing.axe/04.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.blade/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/swing.blade/02.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/swing.blade/03.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/swing.blade/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/swing.blade/05.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.blade/06.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.blunt/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane | CC0 |
| sounds/swing.blunt/02.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.blunt/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/swing.fist/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.fist/02.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.fist/03.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.heavy/01.ogg | https://opengameart.org/content/battle-sound-effects | Ogrebane + artisticdude (opengameart.org/content/swishes-sound-pack) | CC0 |
| sounds/swing.heavy/02.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/swing.heavy/03.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/swing.heavy/04.ogg | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | StarNinjas | CC0 |
| sounds/swing.light/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.light/02.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.light/03.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.pierce/01.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.pierce/02.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/swing.pierce/03.ogg | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 |
| sounds/telegraph.long/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/telegraph.long/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/telegraph/01.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/telegraph/02.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/telegraph/03.ogg | https://opengameart.org/content/25-cc0-bang-firework-sfx | rubberduck | CC0 |
| sounds/ui.buy/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/ui.buy/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/ui.buy/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.click/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.click/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/ui.click/03.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/ui.click/04.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/ui.close/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.close/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.close/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.equip/01.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/ui.equip/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/ui.equip/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/ui.equip/04.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.error/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/ui.error/02.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/ui.error/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/ui.hover/01.ogg | https://opengameart.org/content/100-cc0-metal-and-wood-sfx | rubberduck | CC0 |
| sounds/ui.hover/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.hover/03.ogg | https://opengameart.org/content/fantasy-accessory-sfx-library | Vehicle | CC0 |
| sounds/ui.open/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.open/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.open/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.select/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.select/02.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/ui.select/03.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck | CC0 |
| sounds/ui.sell/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.sell/02.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/ui.sell/03.ogg | https://opengameart.org/content/80-cc0-rpg-sfx | rubberduck | CC0 |
| sounds/ui.tab/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.tab/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.tab/03.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.unequip/01.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.unequip/02.ogg | https://kenney.nl/assets/rpg-audio | Kenney | CC0 |
| sounds/ui.unequip/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/wail/01.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/wail/02.ogg | https://opengameart.org/content/ghost-monster-voice-moaning-growling | qubodup | CC0 |
| sounds/wail/03.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/wail/04.ogg | https://opengameart.org/content/rpg-sound-pack | artisticdude | CC0 |
| sounds/warcry/01.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/warcry/02.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/warcry/03.ogg | https://opengameart.org/content/male-gruntyelling-sounds | HaelDB | CC0 |
| sounds/waypoint/01.ogg | https://opengameart.org/content/100-cc0-sfx | rubberduck + bonebrah (opengameart.org/content/stone-door) + SketchMan3 (opengameart.org/content/wind-whoosh-loop) | CC0 |
| sounds/waypoint/02.ogg | https://kenney.nl/assets/impact-sounds | Kenney + OwlishMedia (opengameart.org/content/creepy-incoherent-chanting) | CC0 |
| `textures/world/slab/albedo.webp` | https://polyhaven.com/a/rock_tile_floor | Charlotte Baglioni | CC0 1.0 |
| `textures/world/slab/normal.webp` | https://polyhaven.com/a/rock_tile_floor | Charlotte Baglioni | CC0 1.0 |
| `textures/world/lava_crust/albedo.webp` | https://ambientcg.com/view?id=Lava001 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/lava_crust/normal.webp` | https://ambientcg.com/view?id=Lava001 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/lava_crust/emissive.webp` | https://ambientcg.com/view?id=Lava001 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/tiles_worn/albedo.webp` | https://polyhaven.com/a/worn_tile_floor | Dimitrios Savva | CC0 1.0 |
| `textures/world/tiles_worn/normal.webp` | https://polyhaven.com/a/worn_tile_floor | Dimitrios Savva | CC0 1.0 |
| `textures/world/flagstone/albedo.webp` | https://polyhaven.com/a/grey_stone_path | Amal Kumar | CC0 1.0 |
| `textures/world/flagstone/normal.webp` | https://polyhaven.com/a/grey_stone_path | Amal Kumar | CC0 1.0 |
| `textures/world/flagstone_dark/albedo.webp` | https://polyhaven.com/a/monastery_stone_floor | Amal Kumar | CC0 1.0 |
| `textures/world/flagstone_dark/normal.webp` | https://polyhaven.com/a/monastery_stone_floor | Amal Kumar | CC0 1.0 |
| `textures/world/cobble/albedo.webp` | https://polyhaven.com/a/cobblestone_floor_04 | Rob Tuytel | CC0 1.0 |
| `textures/world/cobble/normal.webp` | https://polyhaven.com/a/cobblestone_floor_04 | Rob Tuytel | CC0 1.0 |
| `textures/world/ashlar/albedo.webp` | https://polyhaven.com/a/stone_brick_wall_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `textures/world/ashlar/normal.webp` | https://polyhaven.com/a/stone_brick_wall_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `textures/world/rubble_wall/albedo.webp` | https://polyhaven.com/a/castle_wall_varriation | Rob Tuytel | CC0 1.0 |
| `textures/world/rubble_wall/normal.webp` | https://polyhaven.com/a/castle_wall_varriation | Rob Tuytel | CC0 1.0 |
| `textures/world/brick_red/albedo.webp` | https://polyhaven.com/a/castle_brick_07 | Rob Tuytel | CC0 1.0 |
| `textures/world/brick_red/normal.webp` | https://polyhaven.com/a/castle_brick_07 | Rob Tuytel | CC0 1.0 |
| `textures/world/mossy_wall/albedo.webp` | https://polyhaven.com/a/mossy_stone_wall | Amal Kumar | CC0 1.0 |
| `textures/world/mossy_wall/normal.webp` | https://polyhaven.com/a/mossy_stone_wall | Amal Kumar | CC0 1.0 |
| `textures/world/sandstone/albedo.webp` | https://polyhaven.com/a/sandstone_blocks_08 | Rob Tuytel | CC0 1.0 |
| `textures/world/sandstone/normal.webp` | https://polyhaven.com/a/sandstone_blocks_08 | Rob Tuytel | CC0 1.0 |
| `textures/world/plaster/albedo.webp` | https://polyhaven.com/a/damaged_plaster | Amal Kumar | CC0 1.0 |
| `textures/world/plaster/normal.webp` | https://polyhaven.com/a/damaged_plaster | Amal Kumar | CC0 1.0 |
| `textures/world/cliff/albedo.webp` | https://polyhaven.com/a/cliff_side | James Ray Cock, Jenelle van Heerden, Dario Barresi | CC0 1.0 |
| `textures/world/cliff/normal.webp` | https://polyhaven.com/a/cliff_side | James Ray Cock, Jenelle van Heerden, Dario Barresi | CC0 1.0 |
| `textures/world/cave/albedo.webp` | https://polyhaven.com/a/rock_face | Greg Zaal, Dario Barresi | CC0 1.0 |
| `textures/world/cave/normal.webp` | https://polyhaven.com/a/rock_face | Greg Zaal, Dario Barresi | CC0 1.0 |
| `textures/world/basalt/albedo.webp` | https://polyhaven.com/a/dark_rock | Amal Kumar | CC0 1.0 |
| `textures/world/basalt/normal.webp` | https://polyhaven.com/a/dark_rock | Amal Kumar | CC0 1.0 |
| `textures/world/obsidian/albedo.webp` | https://ambientcg.com/view?id=Rock035 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/obsidian/normal.webp` | https://ambientcg.com/view?id=Rock035 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/lava/albedo.webp` | https://ambientcg.com/view?id=Lava004 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/lava/normal.webp` | https://ambientcg.com/view?id=Lava004 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/lava/emissive.webp` | https://ambientcg.com/view?id=Lava004 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/ice/albedo.webp` | https://ambientcg.com/view?id=Ice002 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/ice/normal.webp` | https://ambientcg.com/view?id=Ice002 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/snow/albedo.webp` | https://polyhaven.com/a/snow_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/snow/normal.webp` | https://polyhaven.com/a/snow_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/dirt/albedo.webp` | https://polyhaven.com/a/forest_ground_04 | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| `textures/world/dirt/normal.webp` | https://polyhaven.com/a/forest_ground_04 | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| `textures/world/path/albedo.webp` | https://polyhaven.com/a/rocky_trail | Amal Kumar | CC0 1.0 |
| `textures/world/path/normal.webp` | https://polyhaven.com/a/rocky_trail | Amal Kumar | CC0 1.0 |
| `textures/world/mud/albedo.webp` | https://polyhaven.com/a/brown_mud_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/mud/normal.webp` | https://polyhaven.com/a/brown_mud_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/grass/albedo.webp` | https://polyhaven.com/a/forrest_ground_01 | Rob Tuytel | CC0 1.0 |
| `textures/world/grass/normal.webp` | https://polyhaven.com/a/forrest_ground_01 | Rob Tuytel | CC0 1.0 |
| `textures/world/leaves/albedo.webp` | https://polyhaven.com/a/forest_leaves_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/leaves/normal.webp` | https://polyhaven.com/a/forest_leaves_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/roots/albedo.webp` | https://polyhaven.com/a/roots | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `textures/world/roots/normal.webp` | https://polyhaven.com/a/roots | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `textures/world/sand/albedo.webp` | https://polyhaven.com/a/sand_01 | Rob Tuytel | CC0 1.0 |
| `textures/world/sand/normal.webp` | https://polyhaven.com/a/sand_01 | Rob Tuytel | CC0 1.0 |
| `textures/world/cracked/albedo.webp` | https://polyhaven.com/a/mud_cracked_dry_03 | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `textures/world/cracked/normal.webp` | https://polyhaven.com/a/mud_cracked_dry_03 | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `textures/world/ash/albedo.webp` | https://polyhaven.com/a/burned_ground_01 | Rob Tuytel | CC0 1.0 |
| `textures/world/ash/normal.webp` | https://polyhaven.com/a/burned_ground_01 | Rob Tuytel | CC0 1.0 |
| `textures/world/planks/albedo.webp` | https://polyhaven.com/a/old_planks_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/planks/normal.webp` | https://polyhaven.com/a/old_planks_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/rust/albedo.webp` | https://polyhaven.com/a/rust_coarse_01 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `textures/world/rust/normal.webp` | https://polyhaven.com/a/rust_coarse_01 | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `textures/world/bark/albedo.webp` | https://polyhaven.com/a/bark_brown_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/bark/normal.webp` | https://polyhaven.com/a/bark_brown_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/iron/albedo.webp` | https://polyhaven.com/a/metal_plate_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/iron/normal.webp` | https://polyhaven.com/a/metal_plate_02 | Rob Tuytel | CC0 1.0 |
| `textures/world/steel/albedo.webp` | https://ambientcg.com/view?id=Metal032 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/steel/normal.webp` | https://ambientcg.com/view?id=Metal032 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/chainmail/albedo.webp` | https://ambientcg.com/view?id=Chainmail004 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/chainmail/normal.webp` | https://ambientcg.com/view?id=Chainmail004 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/cloth/albedo.webp` | https://ambientcg.com/view?id=Fabric030 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/cloth/normal.webp` | https://ambientcg.com/view?id=Fabric030 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/leather/albedo.webp` | https://polyhaven.com/a/leather_white | Rob Tuytel | CC0 1.0 |
| `textures/world/leather/normal.webp` | https://polyhaven.com/a/leather_white | Rob Tuytel | CC0 1.0 |
| `textures/world/wood/albedo.webp` | https://polyhaven.com/a/rough_wood | Rob Tuytel | CC0 1.0 |
| `textures/world/wood/normal.webp` | https://polyhaven.com/a/rough_wood | Rob Tuytel | CC0 1.0 |
| `textures/world/fur/albedo.webp` | https://ambientcg.com/view?id=Fabric084 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/fur/normal.webp` | https://ambientcg.com/view?id=Fabric084 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/bone/albedo.webp` | https://ambientcg.com/view?id=Rock023 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/bone/normal.webp` | https://ambientcg.com/view?id=Rock023 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/flesh/albedo.webp` | https://ambientcg.com/view?id=Lava005 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/flesh/normal.webp` | https://ambientcg.com/view?id=Lava005 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/moss/albedo.webp` | https://ambientcg.com/view?id=Moss002 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/moss/normal.webp` | https://ambientcg.com/view?id=Moss002 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/world/tracks/albedo.webp` | https://polyhaven.com/a/muddy_tracks | Amal Kumar | CC0 1.0 |
| `textures/world/tracks/normal.webp` | https://polyhaven.com/a/muddy_tracks | Amal Kumar | CC0 1.0 |
| `textures/world/stony_dirt/albedo.webp` | https://polyhaven.com/a/stony_dirt_path | eye-candy.xyz | CC0 1.0 |
| `textures/world/stony_dirt/normal.webp` | https://polyhaven.com/a/stony_dirt_path | eye-candy.xyz | CC0 1.0 |
| `textures/hero/linen/albedo.webp` | https://polyhaven.com/a/rough_linen | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/linen/normal.webp` | https://polyhaven.com/a/rough_linen | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/wool/albedo.webp` | https://polyhaven.com/a/caban | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/wool/normal.webp` | https://polyhaven.com/a/caban | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/leather/albedo.webp` | https://polyhaven.com/a/brown_leather | Rob Tuytel | CC0 1.0 |
| `textures/hero/leather/normal.webp` | https://polyhaven.com/a/brown_leather | Rob Tuytel | CC0 1.0 |
| `textures/hero/suede/albedo.webp` | https://polyhaven.com/a/scuba_suede | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/suede/normal.webp` | https://polyhaven.com/a/scuba_suede | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/hessian/albedo.webp` | https://polyhaven.com/a/hessian_230 | colormass, Rico Cilliers | CC0 1.0 |
| `textures/hero/hessian/normal.webp` | https://polyhaven.com/a/hessian_230 | colormass, Rico Cilliers | CC0 1.0 |
| `textures/items/metal/albedo.webp` | https://ambientcg.com/view?id=Metal038 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/items/metal/normal.webp` | https://ambientcg.com/view?id=Metal038 | Lennart Demes (ambientCG) | CC0 1.0 |
| `textures/items/hammered/albedo.webp` | https://polyhaven.com/a/rusty_metal_02 | Rob Tuytel | CC0 1.0 |
| `textures/items/hammered/normal.webp` | https://polyhaven.com/a/rusty_metal_02 | Rob Tuytel | CC0 1.0 |
| `textures/items/wood/albedo.webp` | https://polyhaven.com/a/fine_grained_wood | Rob Tuytel | CC0 1.0 |
| `textures/items/wood/normal.webp` | https://polyhaven.com/a/fine_grained_wood | Rob Tuytel | CC0 1.0 |
| `textures/items/leather/albedo.webp` | https://polyhaven.com/a/leather_white | Rob Tuytel | CC0 1.0 |
| `textures/items/leather/normal.webp` | https://polyhaven.com/a/leather_white | Rob Tuytel | CC0 1.0 |
| `textures/props/planks/albedo.webp` | https://polyhaven.com/a/weathered_planks | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `textures/props/planks/normal.webp` | https://polyhaven.com/a/weathered_planks | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `textures/props/timber/albedo.webp` | https://polyhaven.com/a/rough_wood | Rob Tuytel | CC0 1.0 |
| `textures/props/timber/normal.webp` | https://polyhaven.com/a/rough_wood | Rob Tuytel | CC0 1.0 |
| `textures/props/thatch/albedo.webp` | https://polyhaven.com/a/thatch_roof_angled | Rob Tuytel, Dimitrios Savva | CC0 1.0 |
| `textures/props/thatch/normal.webp` | https://polyhaven.com/a/thatch_roof_angled | Rob Tuytel, Dimitrios Savva | CC0 1.0 |
| `textures/props/slate/albedo.webp` | https://polyhaven.com/a/roof_slates_02 | Rob Tuytel | CC0 1.0 |
| `textures/props/slate/normal.webp` | https://polyhaven.com/a/roof_slates_02 | Rob Tuytel | CC0 1.0 |
| `textures/props/masonry/albedo.webp` | https://polyhaven.com/a/castle_wall_slates | Rob Tuytel | CC0 1.0 |
| `textures/props/masonry/normal.webp` | https://polyhaven.com/a/castle_wall_slates | Rob Tuytel | CC0 1.0 |
| `textures/props/ironplate/albedo.webp` | https://polyhaven.com/a/metal_plate_02 | Rob Tuytel | CC0 1.0 |
| `textures/props/ironplate/normal.webp` | https://polyhaven.com/a/metal_plate_02 | Rob Tuytel | CC0 1.0 |
