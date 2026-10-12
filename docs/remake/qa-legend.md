# Stream: qa-legend (signature looks for every unique and set)

Status: done

Goal (owner's words): unique items should have unique designs, patterns and
glow effects. For example, a set's chest piece could have dragons on the
shoulders. Different sets and different uniques get their own colours. Maybe
one set is fully gold with a shining glow and another is white with a white
glow. Think Diablo II set items and Path of Exile uniques: you know what
someone is wearing from across the screen.

## Milestones

- [x] Design bible. `qa-legend: design bible, signature data and check-legend`. List every set and every unique (src/data/sets.ts,
  src/data/uniques.ts and their builders). Give each one a signature under
  "Design": a palette (each set its own: full gold with a gold shine, white
  and silver with a white glow, blackened iron with ember cracks, bone and
  verdigris, blood red lacquer, deep violet void, and more), a motif (dragons,
  wings, skulls, thorns, flames, stars, serpents, antlers, chains, runes,
  eyes), a material finish, and a glow or effect (soft aura, pulsing runes,
  embers, frost mist, sparkles, a trailing wisp). No two sets share a palette
  or a motif, and every unique reads as its own item. Write it into
  `CONTRACTS.md` under ItemLook as the per-id signature data.
- [x] Sets on the body. `qa-legend: bolder set sculpts, crescent moons, set palettes win over cut tints`. Every piece of every set carries its set's palette,
  motif and glow, so a full set is a matched, striking outfit: sculpted motif
  parts (for example dragon heads on the pauldrons, wings on the helm, scaled
  plates on the chest), trims and patterns, and an aura that grows with the
  number of pieces worn (2 pieces: trims glow; full set: the whole outfit
  shines). Works on every class body.
- [x] Uniques on the body and in hand. `qa-legend: fewer repeated halos on mythic and ancient uniques`. Every unique weapon, shield and armour
  piece gets its own sculpted silhouette details, patterns and glow, clearly
  unlike its base and unlike other uniques.
- [x] Icons and drops. `qa-legend: icons paint each aura, Ward of Aeons is a clock tower, kraken shell sea-green`. Inventory icons and ground models show the same
  signature (palette, motif, glow), so a set piece looks like its set at a
  glance and a unique looks legendary in the grid and on the floor.
- [x] Effects budget and check. `qa-legend: check-perf --set= lifts requirements so the set is really worn`. Glows, auras and particles stay within the
  draw call and frame budgets (town and busy maps under 900 draw calls) with
  a full set worn. `check-item-icons` still passes (no look-alikes). Add a
  check that no two sets share a palette and that every set and unique has a
  signature entry.
- [x] Handover with a render sheet. `qa-legend: Sundered Sky linen at full white`: every set worn in full on two classes,
  and every unique in hand or worn.

## Design

Source of truth: `src/art/items/Designs.ts`. Contract: CONTRACTS.md,
"Signatures". Each set: its own palette (main surface per material, trim,
cloth, glow), its own sculpted motif carried on every piece, a finish, and an
aura that grows with the pieces worn. Each unique: its own materials,
colours, features (sculpts first), finish and aura.

| Set | Palette | Motif (sculpt) | Finish | Glow and aura |
| --- | --- | --- | --- | --- |
| The Bloodied Hand (`set.bloodied`) | blood-red lacquer and black iron | claws, hand emblem, blood | lacquer | drips, 0xff1c1c |
| Vestments of the Kindled (`set.kindled`) | scorched crimson and candle flame | flames, flame emblem, cracks | matte | embers, 0xffb83a |
| Trail of the Quick (`set.quickstep`) | moss leather and bright silver | feathers, feather emblem, tatters | satin | wisp, 0x8affb0 |
| Bonefetter Regalia (`set.bonefetter`) | bone and verdigris, corpse-light | skulls, skull emblem, bones | weathered | souls, 0xb8ff5a |
| Grave Warden's Watch (`set.gravewarden`) | grave bronze and lantern amber | eyes, eye emblem, rivets, runes | weathered | motes, 0xffb030 |
| Frostwrought Panoply (`set.frostwrought`) | ice blue and frosted silver | crystals, snowflake emblem, frost | frosted | frost, 0x8ad0ff |
| The Stormbound Circuit (`set.stormbound`) | storm navy and burnished copper | bolts, bolt emblem, coils | polished | sparks, 0x9ae8ff |
| Venomthread Weave (`set.venomthread`) | black silk and venom green | spiders, web emblem, web | satin | drips, 0x60ff30 |
| Aegis of the Iron Vow (`set.ironvow`) | gunmetal and royal blue | chains, shield emblem, rivets | polished | soft, 0x5a8aff |
| Ashwalker's Legacy (`set.ashwalker`) | blackened iron and ember cracks | dragons, ember emblem, cracks, scales | blackened | ash, 0xff4a10 |
| The Gilded Compact (`set.gilded`) | full gold with a gold shine | coins, coin emblem, gilded | gilt | shine, 0xffd040 |
| Nightfall Communion (`set.nightfall`) | void violet and black | moons, moon emblem, smoke | satin | smoke, 0x9064ff |
| Regalia of the Sundered Sky (`set.sunderedsky`) | white and silver with a white glow | stars, star emblem, halo | pearl | sparkles, 0xf0f4ff |
| Warplate of the Last Legion (`set.lastlegion`) | polished brass and legion crimson | wings, laurel emblem, laurels, tatters | polished | embers, 0xff7040 |
| The Hollow King's Court (`set.hollowking`) | obsidian and pale gold, spectral cyan | antlers, crown emblem, spikes, smoke | satin | souls, 0x50f0e0 |

| Unique | Base | Motif and features | Finish | Glow and aura |
| --- | --- | --- | --- | --- |
| Rixot's Keen (`uq.rixots`) | sword.short, metal.silver | runes | - | sparkles, 0xdfe8ff |
| Felloak (`uq.felloak`) | mace.club, wood.charred | cracks, smoke | - | embers, 0xff6a1e |
| The Gnasher (`uq.gnasher`) | axe.hand, metal.rusted | teeth | - | drips, 0xd0b080 |
| Hotspur (`uq.hotspur`) | boots.boots, leather.fine|0x3a2216 | flames, cracks | - | embers, 0xff7a2a |
| Pluckeye (`uq.pluckeye`) | bow.short, wood.polished|0x4a3020 | eyes | - | motes, 0xffd070 |
| Greyform (`uq.greyform`) | chest.leather, leather.worn|0x9a9890 | tatters, rivets | matte | ash, 0xc8c8c0 |
| The Jade Tan Do (`uq.jadetando`) | dagger.dagger, crystal.ice|0x48d080 | runes | - | wisp, 0x40d070 |
| Wormskull (`uq.wormskull`) | helm.bone, bone.old | serpents, eyes, vines | - | souls, 0x9ac04a |
| Steelclash (`uq.steelclash`) | shield.small, metal.bronze | bells, rivets | - | shine, 0xffd88a |
| Nightsmoke (`uq.nightsmoke`) | belt.sash, cloth.silk|0x6e7280 | smoke, tatters | - | smoke, 0xb8c4d8 |
| Bloodrise (`uq.bloodrise`) | mace.mace, metal.dark | skulls, blood, teeth | - | drips, 0xb01818 |
| Civerb's Cudgel (`uq.civerbs`) | mace.club, wood.rotted | rivets, chains, bells | - | souls, 0x9ad8c8 |
| Gorefoot (`uq.gorefoot`) | boots.heavy, leather.fine|0x5a1a14 | blood, spikes | - | drips, 0xc02018 |
| Venom Ward (`uq.venomward`) | shield.kite, metal.verdigris | vines, thorns | - | drips, 0x5ac84a |
| Skystrike (`uq.skystrike`) | bow.long, wood.polished|0x5a6878 | coils, runes | - | sparks, 0xa8dcff |
| Hexfire (`uq.hexfire`) | sword.gladius, metal.bloodgold | flames, runes | - | embers, 0xff6020 |
| Frostwind (`uq.frostwind`) | sword.broad, metal.silver|0xcfe6ff | frost, crystals | frosted | frost, 0x9ad8ff |
| Duskdeep (`uq.duskdeep`) | helm.full, metal.dark | rivets, cracks | blackened | ash, 0x90a0b0 |
| Magefist (`uq.magefist`) | gloves.silk, cloth.silk|0x5a2618 | cracks, flames | - | embers, 0xff7030 |
| Frostburn (`uq.frostburn`) | gloves.heavy, leather.fine|0x2a3444 | frost | - | frost, 0x7ab4ff |
| Stormchaser (`uq.stormchaser`) | staff.cedar, wood.polished|0x6a5a48 | coils, wings | - | sparks, 0xa8d8ff |
| Rockstopper (`uq.rockstopper`) | helm.skullcap, metal.iron | rivets, cracks | - | ash, 0xc0a080 |
| Goldwrap (`uq.goldwrap`) | belt.girdle, metal.gold | coins, gilded | gilt | shine, 0xffd860 |
| Nagelring (`uq.nagelring`) | ring.signet, metal.bronze | coins | - | motes, 0x60e090 |
| Manald Heal (`uq.manald`) | ring.signet, metal.bloodgold | runes | - | soft, 0xff6070 |
| Cleglaw's Tooth (`uq.cleglaw`) | sword.foil, metal.dark | thorns | - | sparkles, 0xd8d8ff |
| Buriza-Do Kyanon (`uq.buriza`) | xbow.siege, metal.dark | rivets, spikes | - | frost, 0xa8dcff |
| Titan's Revenge (`uq.titans`) | spear.warspear, metal.gold | wings, runes | polished | sparks, 0xffd070 |
| Stormshield (`uq.stormshield`) | shield.tower, metal.steel | rivets, cracks | - | shine, 0xb8c8d8 |
| Shaftstop (`uq.shaftstop`) | chest.gothic, metal.steel | arrows, rivets | - | ash, 0xd0c0a0 |
| Gaze of the Hell Wyrm (`uq.gazehell`) | helm.grim, bone.old|0x9a8a7a | dragons, eyes, flames | - | embers, 0xff5a1a |
| Silkweave (`uq.silkweave`) | boots.scarabshell, cloth.silk|0xd0c8b8 | web | - | wisp, 0xe8e0ff |
| Chance Guard (`uq.chancecast`) | gloves.gauntlets, metal.gold | coins, gilded | gilt | shine, 0xffd860 |
| Raven Frost (`uq.ravenfrost`) | ring.band, metal.silver|0xb8d8ff | frost | frosted | frost, 0xa8e0ff |
| Bul-Kathos' Wedding Band (`uq.bulkathos`) | ring.band, metal.gold | chains | - | soft, 0xffb0c0 |
| The Graven Spine (`uq.thegravenspine`) | staff.war, wood.rotted|0x8a8070 | bones, eyes | - | souls, 0x9ad8c0 |
| Widowmaker (`uq.widowmaker`) | bow.composite, metal.voidgold | tatters, thorns | lacquer | smoke, 0xc02040 |
| Hellslayer (`uq.hellslayer`) | axe.ettin, metal.dark | cracks, skulls | blackened | embers, 0xff4020 |
| Spectral Shard (`uq.spectralshard`) | dagger.blade, metal.steel | ghost, runes | - | wisp, 0x9ad8ff |
| Windforce (`uq.windforce`) | bow.hydra, metal.gold | wings, feathers | - | wisp, 0xd8f0ff |
| Doombringer (`uq.doombringer`) | sword.conquest, metal.dark | skulls, cracks | blackened | smoke, 0xd04030 |
| Griswold's Edge (`uq.griswold`) | sword.falchion, metal.steel | runes, gilded, flames | polished | embers, 0xff7a20 |
| Azurewrath (`uq.azurewrath`) | sword.phase, crystal.ice|0x9ad0ff | halo, crystals | polished | sparkles, 0x80c8ff |
| Arreat's Face (`uq.arreatsface`) | helm.spired, stone.crypt|0x8a8478 | cracks, horns | - | ash, 0xd0a060 |
| Crown of Ages (`uq.crownofages`) | helm.corona, metal.gold | laurels, gilded, spikes | gilt | shine, 0xffd070 |
| Leviathan (`uq.leviathan`) | chest.kraken, metal.verdigris | serpents, barnacles, scales | - | drips, 0x3ac8b8 |
| Skin of the Vipermagi (`uq.skinofvipermagi`) | chest.dusk, leather.fine|0x8a3a5a | scales, serpents | - | smoke, 0x9ad84a |
| War Traveler (`uq.warTraveler`) | boots.war, leather.worn|0x5a4632 | tatters, rivets | matte | ash, 0xd0b080 |
| Gore Rider (`uq.gorerider`) | boots.sharkskin, leather.fine|0x3a3230 | horns, spikes, blood | - | drips, 0xd04030 |
| Dracul's Grasp (`uq.dracul`) | gloves.ogre, metal.bloodgold | claws, spikes, blood | lacquer | drips, 0xc01c1c |
| Arachnid Mesh (`uq.arachnid`) | belt.spiderweb, cloth.silk|0x2a2432 | spiders, web | - | smoke, 0xa060ff |
| Verdungo's Hearty Cord (`uq.verdungo`) | belt.troll, leather.worn|0x5c4a2a | rivets, tatters | matte | soft, 0xd8a860 |
| Highlord's Wrath (`uq.highlords`) | amulet.reliquary, metal.gold | bones | - | sparks, 0xff6030 |
| Mara's Kaleidoscope (`uq.mara`) | amulet.reliquary, metal.silver | crystals | pearl | sparkles, 0xd8f0ff |
| Metalgrid (`uq.metalgrid`) | amulet.sigil, metal.iron | rivets, coils | - | sparks, 0x9ad0ff |
| Stone of Jordan (`uq.soj`) | ring.circle, metal.gold | coins | - | motes, 0x8ac0ff |
| Carrion Wind (`uq.carrionwind`) | ring.circle, metal.dark | smoke | - | smoke, 0x8ad050 |
| Thunderstroke (`uq.thunderstroke`) | spear.ghost, metal.gold | bolts, coils | - | sparks, 0xf0e05a |
| Death's Web (`uq.deathsweb`) | wand.unearthed, crystal.void|0x3a5a2a | web | - | souls, 0x7ac84a |
| Eschuta's Temper (`uq.eschutas`) | orb.eldritch, crystal.ice|0xffa070 | halo | - | embers, 0xff6a30 |
| Herald of Zakarum (`uq.herald`) | shield.monarch, metal.gold | laurels, tatters, gilded | - | shine, 0xffe8a0 |
| Last Wish (`uq.lastwish`) | mace.thundermaul, metal.dark | stars, cracks | - | sparkles, 0xf0e05a |
| Griffon's Eye (`my.griffonseye`) | helm.diadem, metal.gold | eyes, feathers, halo | - | shine, 0xffd060 |
| Harlequin Crest (`my.harlequin`) | helm.diadem, metal.gold | bells | - | sparkles, 0xff6ab0 |
| Tyrael's Might (`my.tyraelsmight`) | chest.sacred, metal.silver | wings, halo | pearl | motes, 0xfff0c0 |
| Chains of Honor (`my.chainsofhonor`) | chest.archon, metal.steel | chains, gilded | - | shine, 0xffd070 |
| The Oculus (`my.the-oculus`) | orb.vortex, crystal.void|0x4a3070 | eyes, halo | - | wisp, 0x8a60ff |
| Wizardspike (`my.wizardspike`) | dagger.mindrender, crystal.ice|0xc8d8ff | runes, halo | - | frost, 0x80b0ff |
| The Reaper's Toll (`my.the-reapers-toll`) | spear.thresher, metal.verdigris | skulls, coins | - | souls, 0x9ad8b8 |
| Beast (`my.beast`) | axe.berserker, metal.bloodgold | teeth, tatters | - | embers, 0xd04020 |
| Ice Blink (`my.iceblink`) | sword.godslayer, crystal.ice|0xd0ecff | frost, bells | frosted | frost, 0xb8e8ff |
| Faith (`my.faith`) | bow.matron, metal.gold | halo, wings | gilt | motes, 0xffd060 |
| Spirit of the Forge (`my.spirit-of-the-forge`) | mace.ruinhammer, metal.dark | cracks, flames | - | embers, 0xff6a10 |
| Nightwing's Veil (`my.nightwing`) | helm.diadem, metal.dark | wings, smoke | - | wisp, 0x6ab0ff |
| Stone of the Void (`my.stoneofthevoid`) | ring.halo, metal.voidgold | halo, smoke | - | smoke, 0x8a60ff |
| Seraph's Hymn (`my.seraphshymn`) | amulet.heartstone, metal.silver | wings, halo | pearl | motes, 0xfff0c0 |
| Worldbreaker (`an.worldbreaker`) | axe.worldcleaver, stone.crypt|0x5a5048 | cracks, spikes | - | ash, 0xff3a10 |
| The Long Noon (`an.the-long-noon`) | sword.sunblade, metal.gold | halo, flames | gilt | shine, 0xffc040 |
| Eternity (`an.eternity`) | ring.eternity, metal.bloodgold | halo, runes | - | sparkles, 0xff6aa0 |
| The First Word (`an.the-first-word`) | staff.worldtree, wood.bark | leaves, runes, halo | - | motes, 0xfff0a0 |
| Mourning Star (`an.mourning-star`) | mace.sanctified, metal.dark | stars, tatters | blackened | sparkles, 0xc0c8ff |
| The Hollow Crown (`an.the-hollow-crown`) | helm.corona, metal.dark | crowns, spikes, smoke | - | smoke, 0x8a40ff |
| Shroud of the Sleeping God (`an.godsblood-shroud`) | chest.aeonshroud, cloth.silk|0x44101c | eyes, stars | - | souls, 0xff3a5a |


## Next up

Nothing. Stream done; see Handover.

## Handover

What exists now:
- Every set (15) has its own palette, finish, sculpted signature, emblem,
  glow colour and aura; every unique (83) has its own look signature and an
  aura. Data: `src/art/items/Designs.ts` (`SET_MOTIFS`, `UNIQUE_DESIGNS`).
  Table of all of them under "Design" above and in `CONTRACTS.md`
  ("Signatures: every set and unique").
- Sculpts on the body (`hero/ArmourFeatures.ts` `sculpt()`): dragons,
  claws, antlers, crowns, moons, bolts, spiders, serpents, laurels, plus
  bolder skulls, eyes, chains and feathers. Set signatures are scaled up.
- Set glow by pieces worn (`items/Outfit.ts`, `hero/Armour.ts`
  `lightArmour`): 2 pieces the trims glow, full set the whole outfit
  shines, 3+ pieces raise the set's aura. Worn uniques carry their aura.
  Works on all six class bodies.
- Auras in hand and on the floor (`ItemModels.ts`), painted into icons
  (`items/IconRender.ts` `paintAura`).
- Ward of Aeons is a clock tower (`items/Offhand.ts` `clocktower`); Kraken
  Shell is sea-green everywhere (`ItemLook.ts` `BASE_TINT`).
- Checks: `tools/check-legend.mjs` (static, in run-checks) guards
  signatures; `check-perf --set=<id>` measures a full set worn.

Render sheets (in `shots/qa-legend/`, not committed; rebuild with the
commands): `handover-sets` (every set on warden and pyromancer,
`hero-sheet.mjs legend --class=warden,pyromancer --cols=6 --max=30`),
`handover-fix` (Hollow King and Sundered Sky after the last fixes),
`m4/icons.png` and `handover-icons2` (every unique's icon,
`item-sheet.mjs icons --uniques --max=40`, then `--from=40 --max=48`),
`uqbody1` (every worn unique), `uq1`/`uq2` (every unique model).

Left for `finish`:
- Sundered Sky is warm white (linen); silk reads lilac. A neutral white
  cloth texture would make it pure white.
- Depth 12 is over budget on programs, textures and garbage per step with
  or without a set (qa-speed's area).
- `check-curve` failed once (revenant depth 5): a balance sim, not looks.

## Notes for resume

- Code map: data `items/Designs.ts`; look `ItemLook.ts` (`aura`, `finish`,
  `sheen`, set palette by material); sculpts on the body
  `hero/ArmourFeatures.ts` (`sculpt()`), on models `items/Features.ts`
  (`SCULPTS`); particles `items/Aura.ts`; set glow and body auras
  `items/Outfit.ts`, called from `DressedHero.dress` (`HeroModel.ts`);
  hand and floor auras in `ItemModels.ts`. Checker `tools/check-legend.mjs`.
  Icon auras `items/IconRender.ts` `paintAura`. Plain-base tints
  `ItemLook.ts` `BASE_TINT`. Ward of Aeons outline `clocktower` in
  `items/Offhand.ts`.

- Results so far: every set dresses, lights its trims and raises its aura
  on all six class bodies (headless probe, 0 failures). Busiest set on the
  hero (lastlegion) is 40 meshes and 2 auras. `check-curve` failed once on
  revenant depth 5 (a balance sim, untouched by looks work).
- Budget, `check-perf --preview --set=set.lastlegion --depths=0,12`: town
  484 draw calls (455 without the set), depth 12 415 (386 without). Far
  under 900. `check-item-icons`: 650 icons, 0 too alike, PASS. Depth 12 is
  over on programs (112 without the set, 114 with), textures (257 / 254)
  and garbage per step (212 / 223 KB) with or without the set: a note for
  qa-speed, not caused by the set.
- The close set frame (`--ty=0.72 --dist=2.1`) crops tall helms: judge
  helm sculpts on a full-body frame.
- Looks only. Never change item stats, drop rates or set bonuses.
- Owner's rule "Gear makes the look" holds: bare heroes wear plain linens.
- qa-looks also works on equipment fit and clipping. Coordinate through
  notes in each other's progress files and keep commits small.
