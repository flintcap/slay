# Depth plan: uniques, sets and bosses

A plan only. Nothing here is built yet. It says what to add, how each thing
should look and play, in what order, and how we prove it works.

## Where we are today

| Thing | Now | Goal | New |
|---|---|---|---|
| Unique items | 106 | 400 | 294 |
| Sets | 15 | 32 | 17 |
| Set pieces | 71 | about 147 | about 76 |
| Bosses | 24 | 52 | 28 |
| Small "warden" bosses on normal floors | 0 | 16 | 16 |

What makes runs feel the same today, measured from the data:

- Every boss is a giant. Sizes run from 1.9 to 3.8. Nothing is person sized.
- Every boss has 3 or 4 phases. There is no short, sharp fight and no long puzzle.
- Life and damage climb together. A late boss is an early boss with bigger numbers.
  No boss is "hits like a truck but dies fast" or "barely hurts but takes forever".
- 14 of the 24 bosses use the same last-phase rule (a damage timer), and all 24 use `enrage`.
- The boss pick favours the newest boss for your depth, so the same two or three
  come up again and again in a band of floors.
- Most uniques are stat bundles. About a third have a real power.

## Rules every new thing follows

1. **Our own.** Our names, our looks, our numbers. A name checker blocks any name
   from the game we are inspired by, and any name we already use.
2. **Icon is the item.** One design record drives the bag icon, the floor drop,
   the held weapon and the worn armour. This is already how `ItemLook.ts` and
   `items/Designs.ts` work. New items only add records; they never draw the icon
   by hand.
3. **Glow is earned.** Most items do not glow. They stand out by shape, material,
   colour, ornament and wear. See "Look budget" below.
4. **Every unique has a reason to exist.** Either a power that changes how you
   play, or a stat mix no other item gives. No "same as a rare but orange".
5. **Every boss changes what you do.** A phase must change your plan, not just
   the boss's numbers.
6. **A puzzle never kills you.** Getting a boss puzzle wrong makes the fight
   slower, never deadlier. See "Fair fights" in Part 3.
7. **No one-shots.** This is a roguelike: one death ends the hero. No hit, trap
   or room rule can kill a hero from full life on its own.

---

## Part 1: Unique items (294 new, 400 total)

### How many of each

| Slot | Now | Goal | Notes |
|---|---|---|---|
| Swords (one hand) | 8 | 24 | |
| Axes (one hand) | 2 | 12 | |
| Maces (one hand) | 4 | 14 | |
| Daggers | 3 | 14 | |
| Spears | 3 | 12 | |
| Wands | 1 | 12 | Casters: spells only, so wand powers change spells |
| Bows | 5 | 16 | |
| Crossbows | 1 | 10 | |
| Staves | 3 | 14 | Spells only |
| Two hand swords | 1 | 10 | |
| Two hand axes | 2 | 10 | |
| Two hand maces | 2 | 10 | |
| Shields | 4 | 20 | |
| Orbs | 2 | 12 | Spells only |
| Helms | 10 | 24 | |
| Chest | 7 | 24 | |
| Gloves | 4 | 16 | |
| Belts | 4 | 16 | |
| Boots | 5 | 16 | |
| Pants | 11 | 16 | |
| Rings | 8 | 22 | |
| Amulets | 4 | 20 | |
| Charms (small / medium / large / grand) | 12 | 36 | 10 / 8 / 8 / 10 |
| Mythic chase items | 0 | 10 | One of a kind per account at a time |
| **Total** | **106** | **400** | |

### Spread by depth

| Band | Levels | New uniques | Feel |
|---|---|---|---|
| Early | 1 to 20 | 70 | Odd, fun, often better than they look |
| Middle | 20 to 45 | 100 | Build starters: they bend one skill or one stat |
| Late | 45 to 70 | 84 | Build makers: a whole plan is built around them |
| Relic | 70+ | 30 | The best non-mythic items, rare, each a build on its own |
| Mythic | 60+ | 10 | Chase items. The only ones with full glow and motion |

### What a unique can do

Each unique gets one of these, picked so slots stay mixed:

- **Power (about 40%).** A behaviour, built on `sim/ItemPowers.ts`: "your
  Frost Nova leaves ice that shatters for cold damage", "every fifth arrow
  splits", "blocking stores a charge your next swing spends". 40 of these are
  *skill benders* that change one named skill. Each class gets at least 8.
- **Trade (about 25%).** A big gift with a real cost: "+60% damage, you cannot
  drink potions", "life regenerates fast, you take 20% more fire".
- **Odd mix (about 35%).** Stats that never roll together on rares, sized for
  the item's band, so the item has a job (for example cold resist, move speed and
  mana steal on one belt for a kiting caster).

Caster weapons (wands, staves, orbs) never give a basic attack. Their powers
change spells.

### Look budget

Every design picks one value on each axis below. The checker fails any two
uniques of the same slot that share four or more axes.

| Axis | Choices (examples) |
|---|---|
| Shape | Per family. Swords: leaf, falchion, broad, kris, sabre, estoc, cleaver, flame-edged, hook, broken |
| Main material | Steel, black iron, bronze, copper, bone, obsidian, jade, crystal, ash wood, horn, coral, star metal, ceramic, wax |
| Colours | Two or three from a 40-colour bank, so no two read the same in the bag |
| Ornament | Filigree, rivets, carved runes, cord wraps, gem setting, etching, inlay, chain, feathers, teeth |
| Wear | New, battle-worn, burnt, frosted, drowned, overgrown, gilded, cracked |
| Mark | One thing nothing else has: an eye in the pommel, a bell on the guard, a hanging charm, a split tip |

Glow is spent like money:

| Tier | Glow | Motion |
|---|---|---|
| Early, Middle, Late | None. Gems and metal can catch light, nothing more | None |
| Relic | A small glowing detail (a gem, a rune line) | None |
| Mythic | Full glow in its own colour | One special effect each (embers, frost breath, orbiting motes, dripping light) |

Today some items glow from lists in `items/Designs.ts` (`GLOWING_UNIQUES`,
`GLOWING_SETS`). The new rule replaces those lists with the tier, so glow stays rare
as the count grows.

### Sample entries (so the style is clear)

These show the voice and the range. The full list is written slot by slot in
batches (see "Order of work"), each batch reviewed before it ships.

| Name | Slot | Band | Look | Does |
|---|---|---|---|---|
| Ferrier's Last Nail | Dagger | Early | A bent horseshoe nail, cord grip, rust | Hits slow the target's move speed; stacks |
| The Polite Hammer | Mace | Early | Small brass head, velvet wrap, a tiny bell | Your first hit on a monster deals triple damage |
| Mudlantern | Wand | Early | Clay bulb on a willow stick, wax drips | Fire spells leave a small burning patch |
| Gannet's Reach | Spear | Middle | Long pale ash shaft, white feather tufts | Throws: every third thrust is a thrown copy |
| Lockjaw | Shield | Middle | Round, iron teeth round the rim | A block traps the attacker's weapon for 1 second |
| The Weighing Coat | Chest | Middle | Merchant's coat over mail, brass scale pins | Gold picked up heals you a little |
| Kilnmother's Mitts | Gloves | Middle | Fired clay plates, glaze cracks, soot | Fire skills cost life instead of mana, and hit harder |
| Sevenfold Knot | Belt | Middle | Seven coloured cords, tied | One potion slot drinks itself when life is low |
| Vigil of Teeth | Helm | Late | Bone crown made of molars, cord, no metal | Each kill adds a tooth: +1% damage, up to 30, lost on hit |
| Undertow | Two hand axe | Late | Green-black bronze, barnacles, drowned | Swings pull monsters in before they hit |
| Hush | Bow | Late | Black limb, no string shine, matte cloth | Arrows make no sound; monsters hit cannot call the pack |
| Brittle Mercy | Orb | Late | Cracked glass sphere, frost inside | Cold spells crit frozen targets every time |
| Wenna's Second Number | Amulet | Late | Brass survey pin on a chain | Shows the floor's exit on the map when you enter |
| The Patient Coil | Ring | Relic | Iron band, a sleeping snake carved round it | Poison you apply never stops while you stand still |
| Crown of Unmade Kings | Helm | Relic | Black iron circlet, empty gem settings, one small ember gem | +2 to all skills; each empty socket adds +1 |
| The Ninth Bell | Mythic two hand mace | Mythic | A cracked bronze bell on a haft, gold glow from the crack, a ring of sound on each swing | Every swing rings: the ninth stuns everything near you |
| Thaw | Mythic sword | Mythic | Clear ice blade with a heart of moving water, frost breath | Your cold damage also burns; frozen monsters melt for fire damage |

---

## Part 2: Sets (17 new, 32 total)

Today: 15 sets, 71 pieces. New sets mix small cheap sets for early levels with
big sets for the end. Seven are class sets: one per class, each built around one
of that class's trees.

Every set keeps the current rule: one piece alone is a bit weaker than a unique
of its level. The value is in the bonuses at 2, 3, 4 and more pieces. Every full
bonus reads as a build, not a stat stick. Every set has one motif shared by all
its pieces (colour, trim, cloth, emblem), so a full set looks like a uniform.

### Class sets

| Set | Class | Pieces | Theme and look | Full bonus idea |
|---|---|---|---|---|
| The Tollgate Oath | Knight | 5: helm, chest, shield, gloves, boots | Bridge wardens. Black iron, red sashes, a toll-coin emblem | Blocks store "toll"; your next slam spends it as a shockwave |
| Orrery of the Ninth Hour | Mage | 5: orb, helm, chest, ring, amulet | Brass star-clock. Blue enamel, brass rings that circle | Spells cast add an orbiting planet; at nine they all fire |
| The Lampblack Covenant | Rogue | 4: dagger, helm, gloves, boots | Chimney sweeps who kill. Soot black cloth, brass buttons | A kill makes you unseen for 2 seconds; your next hit crits |
| The Heronwatch | Ranger | 5: bow, helm, chest, belt, boots | Marsh hunters. Grey-blue feathers, reed weave | Standing still for 1 second makes arrows pierce everything |
| Pallbearer's Due | Revenant | 5: weapon, helm, chest, gloves, belt | Funeral guild. Black velvet, silver nails, lilies | Each minion that dies leaves a grave that raises it again once |
| The Lanternwright Vigil | Paladin | 5: mace, shield, helm, chest, boots | Lamp makers of a vigil. White enamel, brass lamp cages | Auras grow a lit ring; monsters inside take holy damage |
| Skin of the Tallow Moon | Shapeshifter | 4: helm, chest, gloves, pants | A pale-wax moon cult. Cream fur, tallow masks | Shifting forms leaves a wax double that taunts for 3 seconds |

### Open sets

| Set | Band | Pieces | Theme and look | Full bonus idea |
|---|---|---|---|---|
| The Cutpurse's Bargain | Early | 2: ring, amulet | Stolen jewels on cheap string | More gold, and vendors sell for less |
| Tinker's Patchwork | Early | 3: helm, gloves, belt | Patched leather, copper rivets, mismatched | Broken gear on the floor turns into iron shards |
| Saltmarsh Wayfarer | Early | 3: boots, pants, belt | Oilcloth, salt-white rims | Faster in water and mud, no slow from them |
| The Ninefold Choir | Middle | 4: amulet, ring, ring, helm | Silver, nine little bells | Each spell you cast adds a note; nine notes heal you |
| Kilnborn Regalia | Middle | 4: helm, chest, gloves, boots | Glazed red clay plates, gold glaze lines | Fire damage taken charges a fire nova |
| Glasswing Raiment | Middle | 4: helm, chest, gloves, boots | Light cloth with crystal panes like wings | Dodging leaves a shard burst behind you |
| The Drowned Bell Company | Middle to late | 5: helm, chest, belt, boots, sword | Sea-green coats, rope, bells | Every 10 hits rings a bell that knocks monsters back |
| The Pretender's Claim | Late | 6: helm, chest, amulet, ring, sword, shield | Stolen royal kit that does not quite fit | Elites you kill grant their aura to you for 10 seconds |
| The Carrion Cartographer | Late | 5: gloves, pants, boots, belt, amulet | Map-maker of the dead. Ink-stained leather, compass brass | Floors show their treasure rooms; elites drop more |
| The Last Lamp of Hollowmere | Relic | 7: helm, chest, gloves, belt, boots, pants, amulet | A lamp lighter's full kit, cracked lantern glass, one soft glow (relic) | Your light radius is a weapon: monsters in it burn and slow |

That is 33 class pieces and 43 open pieces: 76 new, about 147 in all.

---

## Part 3: Bosses (28 new, 52 total), plus small floor wardens

### Four sizes

| Size | Scale | Now | Goal |
|---|---|---|---|
| Person sized | 0.9 to 1.2 | 0 | 10 |
| Tall | 1.3 to 1.8 | 0 | 14 |
| Large | 2.0 to 2.8 | 17 | 18 |
| Giant | 3.0 and up | 7 | 10 |

Ten of today's bosses change size to get there: three human ones become person
sized (Vess the hound master, Kaveh the ashen prophet, Malek the iron conqueror),
five large ones become tall, and two giants come down to large.

Person sized bosses are built on the hero rig (dressed like the heroes, with
their own outfit), so they move and fight like real people and look as good as
the heroes do.

### Six fight profiles

Life and damage stop climbing together. Each boss picks one profile, and its
numbers come from the profile times its depth.

| Profile | Life | Damage | Speed | What it asks of you |
|---|---|---|---|---|
| Duelist | 0.6x | 1.6x | Fast | Dodge well. It dies fast if you land hits |
| Bulwark | 1.2x, high armour and resists | 0.8x | Slow | Break its guard; find the opening |
| Sponge | 3.0x | 0.7x | Slow | Stamina. Do not get sloppy over a long fight |
| Glass caster | 0.7x | 1.4x | Kites you | Chase it down through its spells |
| Swarm lord | 0.8x | 0.9x | Normal | Deal with what it sends, then it |
| Bruiser | 1.0x | 1.0x | Normal | A straight fight |

### Fair fights

Two hard rules for every boss, old and new.

**1. Messing up a puzzle costs time, not life.** When you get a room rule wrong
(miss a bell, step on the wrong tile, let the lantern go out), the boss gets one
of these, and nothing else:

| Fumble cost | What happens |
|---|---|
| Heal | The boss heals up to 10% of its life, never above where the phase began |
| Shield | Its shield comes back, or gets one more layer |
| Reset | The puzzle starts over (stones grow back, bells go quiet) |
| Hold | The boss is out of reach for a few seconds (it rises, hides, or walls itself in) |
| Adds | A small wave of normal adds walks in |

A fumble never deals damage, never stuns you, and never makes the boss hit harder.

**2. No one-shots.** These hold on every boss, every trap and every room rule:

- **Hit cap.** No single hit, trap or blast takes more than 40% of your life from
  full. Lower at low tiers: 25% on tiers 1 to 5, 30% on tiers 6 to 15.
- **Warn first.** Every hit above 15% of your life shows its danger zone on the
  floor at least 0.8 seconds before it lands.
- **No stun lock.** Nothing roots, freezes or stuns you for more than 1.5 seconds,
  and after it ends you can't be held again for 3 seconds.
- **No floor that kills.** Bad tiles, pools and hazards hurt over time, the way
  lava does now. You always have time to step off.

**The fight clock.** Every boss has a soft time limit today (it enrages after a
while). On its own, a fumble that costs time could push you into the enrage, and
that would break rule 1. So each fumble moves the clock back by the time it cost
you. Fumbling never brings the enrage closer.

**Fixing the old rules.** Three of today's room rules break these rules and get
changed:

| Rule today | What breaks | Change |
|---|---|---|
| Pillars | A miss is a 4x hit with a big shove. That can kill | The blast follows the hit cap. Missing the safe ring also gives the boss a shield, so the safe ring still matters |
| Damage timer (`enrageTimer`) | "Kill it or die": the boss gets 25% stronger every 12 seconds, with no limit | Each stack gives the boss armour and life regen instead of damage. A slow fight gets slower, not deadly |
| Ice field | Standing still freezes you | The freeze follows the stun-lock rule |

### Three fight shapes

| Shape | Share | What it is |
|---|---|---|
| Straight | About 40% | One or two phases. Clear attacks to learn and dodge. No gimmick |
| Phased | About 35% | Three to five phases, each a new plan |
| Puzzle | About 25% | A room rule you must solve to hurt it |

### New room rules (on top of the 13 we have)

| Rule | How it works |
|---|---|
| Ward portals | Portals open and feed the boss a shield. Break the portals to drop it |
| Heartstones | The boss cannot be hurt while stones in the room beat. They grow back |
| Bells | The boss starts a long cast. Ring three bells to stop it. If it lands, the boss heals and gains a shield (no damage to you) |
| Braziers | The room is dark and the boss is unseen. Light braziers to see and hit it |
| Linked pair | Two bosses. Kill one and the other brings it back unless both die close together |
| Lure | The boss can't be hurt by you, but its own pools hurt it. Lead it into them |
| Tile sequence | Floor tiles light in a pattern. Stand on the right tiles to hurt the boss. A wrong tile slows you and gives the boss a shield layer |
| Stalker | The boss is invisible and leaves tracks. Area hits show it |
| Mirror | A copy of you, using your skills at lower power |
| Breaking cast | A big cast with a damage bar. Do enough damage in time to break it. If it lands, the boss heals and calls adds |
| Chase | The boss flees through three rooms of the floor; each room is a new phase |
| Defend | Keep a lantern lit while the boss tries to put it out. If it goes out, the room goes dark and the boss heals until you relight it |
| Guard break | A guard bar. Break it for a few seconds of big damage |
| Weak points | A giant with limbs to break; each broken limb takes away an attack |
| Chains | The boss is chained to anchors. Cut a chain and it charges (warned, hit-capped). If it hits a wall, it is stunned and takes extra damage |

### The 28 new bosses

| # | Name | Size | Profile | Shape | Where | From tier | The fight |
|---|---|---|---|---|---|---|---|
| 1 | Pell Dunmarrow, the Ratcatcher | Person | Duelist | Straight, 2 phases | Crypt, Caverns | 1 | Nets and snap traps on the floor (a trap holds you for a second, hit-capped). Hit hard and her sack bursts: a rat flood, and she turns fast and wild |
| 2 | The Choir of Rot | Tall (three of them) | Swarm lord | Puzzle | Crypt, Swamp | 2 | Three singing corpses buff each other. The high voice heals. Kill order matters |
| 3 | Old Gristle | Large | Sponge | Straight, 1 phase | Caverns, Dark Forest | 3 | A huge mole boar that tunnels. Pure dodging of the burrow lines |
| 4 | Kettle | Large | Bulwark | Phased, guard break | Foundry | 3 | A boiler golem. Turn its valves to vent it; armour drops while it vents |
| 5 | Sister Abelline of the Bell | Person | Glass caster | Puzzle, bells | Drowned Sanctum, Crypt | 4 | She tolls a long knell. Ring the three bells in the room to break it, or she heals and wards herself |
| 6 | Mother Wick | Tall | Swarm lord | Puzzle, braziers | Dark Forest, Crypt | 5 | A candle witch in the dark. Light braziers to see her; her wax children snuff them |
| 7 | Ebb and Orrin, the Sallow Twins | Tall (two) | Bruiser | Linked pair | Swamp, Drowned Sanctum | 6 | One fights close, one from range. Bring them both down together |
| 8 | Gutterking Rusk | Person | Duelist | Straight, 3 phases | Caverns, Desert | 6 | A goblin lord riding his own shield like a sled. Fast, hits hard, low life |
| 9 | Vaskel the Glazier | Tall | Glass caster | Puzzle, mirror | Voidspire, Desert Tomb | 9 | Glass panes bounce your shots. Break the panes or face his copies |
| 10 | Holloway, Who Wears the Stair | Giant | Sponge | Phased, weak points | Caverns, Crypt | 10 | A titan made of a fallen stair. Break four limbs; each takes an attack away |
| 11 | Duchess Imeris of the Ninefold House | Person | Duelist | Straight | Drowned Sanctum, Voidspire | 10 | A rapier duel. She parries; hit into a parry and she ripostes (hit-capped) and wins back a little life |
| 12 | The Tallow Shepherd | Tall | Swarm lord | Puzzle, ward portals | Tundra, Dark Forest | 11 | Wax sheep walk out of portals and feed his shield. Close the portals |
| 13 | Brass Abbot Corrimund | Large | Bulwark | Phased, breaking cast | Foundry | 12 | A clockwork priest. Every minute he casts "The Hour". Break it with damage, or he winds himself back to more life |
| 14 | Gaellach the Saltwyrm | Giant | Bruiser | Phased | Drowned Sanctum, Swamp | 13 | A sea serpent that surfaces in pools. Hit the head when it rises; the tide comes in |
| 15 | Mirelle the Unburied | Tall | Bruiser | Puzzle, heartstones | Swamp | 14 | A bog queen with three heart lanterns that grow back |
| 16 | The Kiln Saint | Large | Bulwark | Puzzle, lure | Foundry, Ashwaste | 15 | A ceramic giant you cannot hurt. Lure it into its own quench pools to crack the glaze |
| 17 | Teodric the Ashmonger | Person | Duelist | Puzzle, stalker | Ashwaste, Desert | 16 | Invisible in the ash. Footprints give him away |
| 18 | The Queen of Hinges | Tall | Glass caster | Straight | Desert Tomb, Crypt | 17 | She steps through the doors of the room. A pattern to learn, no gimmick |
| 19 | Thessaly Vane, the Last Surveyor | Person | Glass caster | Puzzle, tile sequence | Voidspire | 21 | She "measures" the floor. Follow her order on the tiles to hurt her; a wrong tile slows you and wards her |
| 20 | The Gilt Leviathan | Giant | Sponge | Phased | Drowned Sanctum | 22 | Gold plates make it immune to one element at a time. Each plate you break changes which |
| 21 | Corvus Hale and the Unkindness | Tall plus a crow swarm | Swarm lord | Chase | Dark Forest, Tundra | 24 | He flees through three rooms. The crows are the walls of each room |
| 22 | Grandmother Thaw | Large | Bulwark | Phased, guard break | Frostvault, Tundra | 25 | A frost hag who melts as you fight her. Smaller, faster, deadlier each phase |
| 23 | The Furnace Choir | Large (three) | Bruiser | Linked trio | Foundry, Hell | 27 | Fire, slag and smoke. The one you kill first changes the room for the other two |
| 24 | The One Who Came Up Instead | Person | Duelist | Puzzle, mirror | Voidspire | 30 | A copy of your hero, your build, your skills, at lower power |
| 25 | Vorrowmaw | Giant | Sponge | Puzzle, chains | Hive, Hell | 32 | Chained to four anchors. Cut a chain and it charges (warned); walls it hits break, and it is stunned and open |
| 26 | The Archivist Below | Tall | Glass caster | Puzzle, defend | Voidspire | 40 | Keep the lantern lit while it erases the room. The edge of the room pushes in, but only pushes you; when the lantern goes out it heals |
| 27 | Saint Ossery the Twice-Crowned | Large | Bruiser | Phased, 5 phases | Hell, Crypt | 45 | A fallen holy king. A new weapon and a new style each phase |
| 28 | The Deep's Own Name | Giant | Every profile | Chase plus puzzle | Last tier | 60 | The end boss. Three arenas; each phase brings back one room rule from the deep |

Tally of the new ones: 7 person sized, 9 tall, 7 large, 5 giant (a group counts by
its biggest member). With the ten resized bosses, that meets the size goals above.

### Small floor wardens (16)

Short fights, person sized or tall, on normal floors. A floor has about a one in
three chance of one, in a side room with its own chest. They are the "weaker,
smaller bosses": one or two attacks each, a minute to kill. Examples: a lamp-thief
who steals your light radius, a debt collector who takes gold on each hit and drops
it all back on death, a duelling squire, a mud-mason who walls the room in.

### Making runs feel different

- **No repeats.** A run does not see the same boss twice until the pool for its
  depth is used up.
- **Seen less, picked more.** The account remembers which bosses you have met.
  Bosses you have seen less often are more likely.
- **Boss moods (tier 15 and up).** One mood per boss, rolled: *Wounded* (starts at
  70% life, hits harder), *Crowned* (one extra phase), *Hungry* (heals on hit),
  *Ancient* (bigger, slower, more life), *Haunted* (dead adds rise again). Shown
  on the boss gate so you can choose to fight it.
- **Signature drops.** Every boss has two or three uniques it drops more often.
  That gives a reason to go back for one boss in particular, and ties the new
  uniques to the new bosses.

---

## Order of work

Each step ends with screenshots or a short clip for you to look at before the
next step starts.

1. **Systems first.**
   - The fair-fight rules: hit cap, warning time, hold limit, fumble costs, and the
     fight clock moving back on a fumble. The three old room rules get fixed here,
     so today's bosses follow them too.
   - Boss profile, size and shape fields; profile numbers in place of the shared `lifeMul` and `damageMul`.
   - The 15 new room rules, each with a test arena.
   - No-repeat and seen-less picking; boss moods; floor wardens.
   - Glow by tier in place of the glow lists.
2. **Bosses, four batches of seven.** Each boss gets its model, portrait, intro,
   music cue, barks and a fight test (below).
3. **Uniques, six batches of about 50, slot by slot.** Each batch comes with a
   contact sheet: icon, floor drop, held or worn, side by side.
4. **Sets, three batches.** Class sets first.
5. **Drop tuning.** A drop sim makes sure every new item drops somewhere and can
   be found in a sane number of runs.

## How we prove it works

New checkers, run by `tools/run-checks.mjs`:

| Checker | What it fails on |
|---|---|
| `check-names` | A name from the game we draw on, or any repeated name |
| `check-looks` | Two uniques of one slot that share four or more look axes; glow on a tier that has no glow budget |
| `check-iconmatch` | The icon's main colours do not match the worn or held model's |
| `check-bosses` | A boss without a portrait, music, barks, size, profile or shape; a fight that a reference hero of its tier cannot finish in a fair time, or finishes too fast |
| `check-fair` | Any boss hit, trap or room blast over the hit cap for its tier; a big hit with less than 0.8 s of warning; a hold over 1.5 s; a fumble that deals damage. Also a "fumbler" sim: a hero who gets every puzzle wrong must still win, in at most twice the normal time, without ever reaching the enrage |
| `check-drops` | An item that never drops, or would take an unfair number of kills to see |

Existing checks keep running: `check-rankpower` for any skill a power touches,
the speed checks for bosses with many moving parts.

## Things only you can decide

These come up as we go, one at a time:

- Class-only items: should some uniques only roll for one class? (Recommended: yes for the 40 skill benders, no for the rest.)
- Mythic items: one per account at a time, or free to stack? (Recommended: one at a time, it keeps them special.)
- Boss moods: shown before the fight, or a surprise? (Recommended: shown, so it is a choice.)
