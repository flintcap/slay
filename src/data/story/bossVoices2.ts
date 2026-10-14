/**
 * SLAY — what the depth plan's twenty-eight bosses say (data/bosses2.ts).
 *
 * Same rules as bossVoices.ts: each one is busy at its own job, mostly
 * polite, and certain. Machines speak in capitals. Beasts do not speak at
 * all; their lines are what you hear and feel, set between stars, the way
 * their barks are.
 */

import type { BossVoice } from './types';

export const NEW_BOSS_VOICES: Record<string, BossVoice> = {
  pell_dunmarrow: {
    greet: `Rats, mostly. Sometimes a dog. Once a deacon, but he paid me to say rats.`,
    taunts: {
      ahead: `Caught by the ankle. They always look so surprised.`,
      even: `I have a snare for everything that walks. You walk. Do the sum.`,
      behind: `Clever feet. I will set the next one higher.`,
    },
    enraged: `Enough. Sack's open. Everybody out.`,
    death: `Feed them, would you. They do not know how to stop.`,
    slain: `Pell falls among her snares. The sack on her back sags open, and the rats inside sniff the air, and go home to wherever rats go.`,
    victory: `Into the sack. Mind the teeth.`,
    floor: {
      title: 'A Tally of Tails',
      source: 'Scratched on the inside of a trap lid',
      text: [
        `Week one: forty. Week two: sixty. Week three: ninety and a cat. The deacon pays a copper a tail and asks no questions about the cat.`,
        `Lower down: Week forty. They are not getting fewer. They are getting bigger. I have stopped selling the tails.`,
      ],
    },
  },

  choir_of_rot: {
    greet: `We sang the Long Hymn at the funeral of the House. Nobody told us when to stop.`,
    taunts: {
      ahead: `Your breath is going. Good. It is time you joined the low part.`,
      even: `Three voices. You can silence one. The hymn has room for that.`,
      behind: `You sing flat. We forgive it. We forgive everyone, after.`,
    },
    enraged: `The last verse. All of us, together.`,
    death: `Amen. At last, amen.`,
    slain: `The low voice stops. The high one holds its note a long time alone, and then it stops too, and the stall is quiet for the first time in nine hundred years.`,
    victory: `Another voice for the stall. Take the low part.`,
    floor: {
      title: 'The Hymn Board',
      source: 'Hung over the choir stall',
      text: [
        `Hymn for the burial of the House: the Long Hymn, all verses. Choir to remain standing until the last mourner has gone.`,
        `Someone has chalked a tally beside it. The tally covers the board, the wall, and part of the ceiling. The last mourner has not gone.`,
      ],
    },
  },

  old_gristle: {
    greet: `*it snorts, and the ground you stand on lifts a hand's width and settles*`,
    taunts: {
      ahead: `*a wet, pleased grunting, close to the floor*`,
      even: `*the stones under you shift as it circles below*`,
      behind: `*a squeal of pain, and then a deeper, angrier rumble*`,
    },
    enraged: `*the whole floor bucks like a cart on a bad road*`,
    death: `*one long breath out, through the soil*`,
    slain: `Old Gristle rolls onto its side. Roots tear free of its back by the hundred, and the floor sinks a little where it lay, as if the cave is resting too.`,
    victory: `*it noses at you once, and goes back to rooting*`,
    floor: {
      title: "A Swineherd's Warning",
      source: 'Painted on a fence post driven into the cave',
      text: [
        `Do not dig past this post. The old boar went under in the dry year and the roots went with it.`,
        `Below, in fresher paint: Somebody dug. We hear it at night now, under the camp. It is getting bigger.`,
      ],
    },
  },

  kettle: {
    greet: `UNIT FOUR. BOILER ROOM. NO SCHEDULED VISITORS. YOU ARE UNSCHEDULED.`,
    taunts: {
      ahead: `VISITOR PRESSURE LOW. VENTING NOT REQUIRED.`,
      even: `MAINTENANCE OVERDUE BY NINE HUNDRED YEARS. STILL WITHIN TOLERANCE.`,
      behind: `VALVE DAMAGE REPORTED. REPORTING VALVE DAMAGE. NOBODY IS RECEIVING.`,
    },
    enraged: `SAFETY LIMITS REMOVED. FULL PRESSURE.`,
    death: `PRESSURE ZERO. FIRE OUT. FIRE OUT.`,
    slain: `Kettle sinks onto its knees and lets out every breath it has, one valve after another. The steam clears. Under it, the gauges all read zero for the first time.`,
    victory: `VISITOR REMOVED. RESUMING HEAT.`,
    floor: {
      title: 'A Duty Card',
      source: 'Riveted inside the firebox door',
      text: [
        `Unit Four. Keep the House warm. Keep pressure in the green. Stop for nobody but the Master Stoker.`,
        `Scratched below with a nail: The Master Stoker died in the first winter. Unit Four did not stop for him either.`,
      ],
    },
  },

  sister_abelline: {
    greet: `Every bell in this chapel has a name and a duty. Yours rang when you came in. I heard it.`,
    taunts: {
      ahead: `Kneel. The knell is kinder to the kneeling.`,
      even: `Three bells, three hours, and the fourth hour is mine alone.`,
      behind: `You struck a sister of the Bell. They will hear it, up the stair.`,
    },
    enraged: `No more hours. Only the knell.`,
    death: `Ring me out. Please. Somebody ring me out.`,
    slain: `Sister Abelline sets her hand-bell on the altar, gently, the way she was taught. The three bells overhead swing once, together, and the chapel water goes still.`,
    victory: `Counted, and tolled for. Rest.`,
    floor: {
      title: 'The Ringing Book',
      source: 'Open on the altar, its pages swollen',
      text: [
        `For every soul of the House, one stroke of the great bell. For the House itself, three. Sister Abelline to keep the count.`,
        `The last page reads: The water came in at vespers. I am still ringing. I will ring until somebody tells me the count is done.`,
      ],
    },
  },

  mother_wick: {
    greet: `There you are. You have been out so late. Come here and let Mother see you in the dark.`,
    taunts: {
      ahead: `There. Lie down. Mother will put out the light.`,
      even: `My little ones have very small hands. They are very good at candles.`,
      behind: `You keep lighting things. Mother does not like it when children play with fire.`,
    },
    enraged: `Bedtime. For everyone. Now.`,
    death: `Leave one lit. They are frightened, without one.`,
    slain: `Mother Wick goes down in a slump of soft wax. The small feet stop pattering. One brazier, the last one you lit, burns on by itself.`,
    victory: `Sleep tight. Mother has you.`,
    floor: {
      title: 'A Nursery Rhyme',
      source: 'Pressed into the wax of a cold brazier',
      text: [
        `Wick and wax and one small flame, Mother calls you all by name. Snuff the light and close your eyes, Mother sees in any guise.`,
        `A child has added a verse in crooked letters: Mother made us out of the candles from the chapel. We are not allowed to be lit.`,
      ],
    },
  },

  sallow_twins: {
    greet: `Ebb says you will be quick. Orrin says you will be slow. One of us is always right.`,
    taunts: {
      ahead: `Ebb, they are tiring. I see it, Orrin. I see it.`,
      even: `Two of us. One of you. Brother, it hardly seems fair. To them.`,
      behind: `Get up, Ebb. I am up, Orrin. Then hit harder.`,
    },
    enraged: `Back to back, brother. To the last.`,
    death: `Orrin? Ebb? Together, then.`,
    slain: `The twins fall back to back, the way they stood. The reeds close over them both, and for a while the marsh sounds like two people breathing.`,
    victory: `You were right, brother. You always are.`,
    floor: {
      title: 'A Marsh Oath',
      source: "Carved on a reed-cutter's post",
      text: [
        `We swore on the tide: if one of us falls, the other lifts him. If one of us drowns, the other drowns beside him.`,
        `Below, cut much later: Orrin drowned in the third flood. I lifted him. He got up. Neither of us has needed to breathe since.`,
      ],
    },
  },

  gutterking_rusk: {
    greet: `Bow! Bow to the KING! Not that low. You are getting your face in my gutter.`,
    taunts: {
      ahead: `HA. Down you go. Somebody fetch my royal kicking boot.`,
      even: `I have a hundred subjects and every one of them would die for me. Mostly by accident.`,
      behind: `Guards! GUARDS! Somebody is hitting the KING!`,
    },
    enraged: `NO MORE MISTER NICE KING.`,
    death: `Long live. Me. Somebody say it.`,
    slain: `Rusk topples off his shield and the spoon crown rolls away down the slope. In the gutters, his whole court goes silent, and then starts arguing about who gets it.`,
    victory: `Another subject! Take him to the royal gutter.`,
    floor: {
      title: 'A Royal Decree',
      source: 'Painted in mud on a sheet of tin',
      text: [
        `By order of King Rusk the First, Last and Best: all spoons in the dungeon belong to the crown. All shiny things too. Also hats.`,
        `Added in a different mud: The king has said we may keep our ears, as a mercy, for now.`,
      ],
    },
  },

  vaskel_glazier: {
    greet: `A fine face. I have been cutting glass for it since before you were born. Stand there and let me fit you.`,
    taunts: {
      ahead: `There. You are starting to fit the frame.`,
      even: `Every pane in here is someone who came to see me. They are all much quieter now.`,
      behind: `You crack my work. I have more glass. I always have more glass.`,
    },
    enraged: `Enough measuring. Into the lead with you.`,
    death: `Leave a pane for me. I want to see myself, at the end.`,
    slain: `Vaskel falls through his own glass. In every pane in the hall your reflection turns to watch him go, and then, one after another, the reflections leave.`,
    victory: `Leaded, framed and hung. Next.`,
    floor: {
      title: "A Glazier's Order Book",
      source: 'In a drawer under the cutting bench',
      text: [
        `Commission: a window for the House, showing every face that ever served it. Glass to be true to life. Very true.`,
        `Final entry: The faces will not hold still in the glass. I have begun cutting the glass to fit the faces instead, and it is going much better.`,
      ],
    },
  },

  holloway_stair: {
    greet: `*stone grinds on stone, a sound like someone very large climbing toward you*`,
    taunts: {
      ahead: `*the steps of its shoulders settle, one landing lower*`,
      even: `*dust pours down its sides; somewhere inside it, a door bangs*`,
      behind: `*a whole flight of its steps cracks, and it staggers*`,
    },
    enraged: `*every step on it lifts at once and slams back down*`,
    death: `*a long rumble, like a stair falling the whole way down*`,
    slain: `Holloway Stair comes apart step by step. When the dust settles there is only a stair, lying in the hall, leading nowhere, as it did for a thousand years before it got up.`,
    victory: `*it steps over you, and down, and down*`,
    floor: {
      title: "A Builder's Mark",
      source: 'Cut into the riser of the lowest step',
      text: [
        `Laid by the Guild of Holloway for the House, two thousand steps from the gate to the deep. Every step true. Every step blessed.`,
        `On the next riser down: The deep moved. The stair fell. We went to fetch it, and it was gone from where it fell.`,
      ],
    },
  },

  duchess_imeris: {
    greet: `You will forgive the dress. The water got into everything. The blade, however, is dry.`,
    taunts: {
      ahead: `First blood to me. Shall we go on to the second?`,
      even: `Nine forms. My father taught me eight. The ninth taught itself to me.`,
      behind: `Good. Very good. You strike when I am open. Hardly anyone does.`,
    },
    enraged: `No more forms. Just the blade.`,
    death: `Well fought. Lay the rapier across my hands.`,
    slain: `The Duchess salutes once more, from the floor, and lays her rapier down point first toward you. It is the old sign that the bout went to the better blade.`,
    victory: `A touch. A last touch. Thank you for the bout.`,
    floor: {
      title: 'A Dance Card',
      source: 'Tied to the wrist of a drowned glove',
      text: [
        `The Ninefold House summer ball. First dance: the Duke. Second: the Captain. Third through ninth: the blade.`,
        `The card is full, and has been written over and over, name after name, until the paper is grey with them.`,
      ],
    },
  },

  tallow_shepherd: {
    greet: `Lost? Every sheep that comes to my fold is lost. Then it is not. Come in and be counted.`,
    taunts: {
      ahead: `Steady now. You are almost in the fold.`,
      even: `I lose one, and the doors give me two. It is a generous fold.`,
      behind: `You are shutting my doors. The flock will be cold tonight.`,
    },
    enraged: `All in. Every one. Now.`,
    death: `Count them for me. I have lost the count.`,
    slain: `The Shepherd sits down on the frozen stone and his cloak runs off him in rivers of warm wax. Every one of the sheep is in it, and none of them are sheep any more.`,
    victory: `One more. Always one more.`,
    floor: {
      title: "A Shepherd's Count",
      source: 'Notched on his crook, notch over notch',
      text: [
        `The House gave me a hundred sheep and a hard winter, and told me to bring a hundred home.`,
        `I brought a hundred home. I made them from the chapel candles, after the real ones froze. Nobody has counted the difference yet.`,
      ],
    },
  },

  brass_abbot: {
    greet: `ATTENDANCE IS REQUIRED AT EVERY HOUR. YOU HAVE MISSED NINE HUNDRED YEARS OF HOURS.`,
    taunts: {
      ahead: `PENANCE IS PROGRESSING. KEEP KNEELING.`,
      even: `THE HOUR IS LONG. I AM LONGER.`,
      behind: `INTERRUPTION LOGGED. INTERRUPTIONS ARE A SIN AT THIS HOUR.`,
    },
    enraged: `ALL HOURS AT ONCE. NOW.`,
    death: `THE BELL. WHO WILL RING THE NEXT HOUR.`,
    slain: `The Brass Abbot stops mid-step. Its hands spin back to midnight and hang there, and the chapel, for the first time in nine hundred years, does not know what time it is.`,
    victory: `ABSENT. MARKED ABSENT. FOREVER.`,
    floor: {
      title: 'The Hours',
      source: "Engraved on the Abbot's brass back",
      text: [
        `Matins, Lauds, Prime, Terce, Sext, None, Vespers, Compline. Keep every hour. Ring every hour. Let no hour pass unkept.`,
        `Under it, in smaller letters, by the maker: The monks are all dead. Keep them anyway.`,
      ],
    },
  },

  gaellach_saltwyrm: {
    greet: `*a hiss from the pools, and every one of them rises a finger's width*`,
    taunts: {
      ahead: `*the salt on the walls drips, and the water creeps toward you*`,
      even: `*a long body slides under the floor; you feel it pass*`,
      behind: `*it screams, and salt rains from the ceiling in flakes*`,
    },
    enraged: `*the pools boil over, all at once*`,
    death: `*the sea sound goes out of the room, slowly*`,
    slain: `Gaellach sinks back into the black water and does not come up. The pools fall still. On the walls, the salt print of its body begins, very slowly, to crumble.`,
    victory: `*it coils around the pool where you went under, and sleeps*`,
    floor: {
      title: "A Salt Merchant's Map",
      source: 'Rolled up in a bottle, wedged in a crack',
      text: [
        `The deep salt runs here, under the temple. Best grade in the world. Dig along the white seam and do not stop.`,
        `On the back, in a shaking hand: The seam is not salt. The seam is the edge of something. It moved when we cut it.`,
      ],
    },
  },

  mirelle_unburied: {
    greet: `Welcome to my court. Mind the hearts. They are the only ones the bog let me keep.`,
    taunts: {
      ahead: `Kneel. The bog is soft here. It likes the knees first.`,
      even: `They buried me three times. The bog spat me back three times. I am patient.`,
      behind: `Break them. Break them all. The bog grows hearts like moss.`,
    },
    enraged: `My court. All of you. Rise.`,
    death: `Let it keep me, this time. Please, let it keep me.`,
    slain: `Mirelle sinks into the peat, and this time it closes over her. The green lanterns gutter out one by one, and the bog makes a small, contented sound.`,
    victory: `Lie still. The bog will be kinder to you than it was to me.`,
    floor: {
      title: 'A Burial Note',
      source: 'Tied to a stake in the peat',
      text: [
        `Here lies Mirelle, queen of the marsh people, put down for a witch. Bury her deep. Bury her face down.`,
        `Below, on a second stake: Buried again. Deeper. Still she walks. Third stake, unwritten, lies broken beside them.`,
      ],
    },
  },

  kiln_saint: {
    greet: `I WAS MADE TO HOLD THE HOLY WATER OF THE HOUSE. I HOLD IT STILL. YOU ARE NOT HOLY.`,
    taunts: {
      ahead: `YOU CRACK. I DO NOT CRACK.`,
      even: `NINE HUNDRED YEARS OF GLAZE. NOT ONE FLAW.`,
      behind: `A FLAW. YOU HAVE PUT A FLAW IN ME.`,
    },
    enraged: `NO MORE WATER. ONLY FIRE.`,
    death: `THE GLAZE. THE GLAZE IS BROKEN.`,
    slain: `The Kiln Saint stands a moment longer, and then the cracks run through it all at once. It falls in a heap of blue and gold shards, and the water it held soaks into the floor.`,
    victory: `UNHOLY. POURED OUT.`,
    floor: {
      title: "A Potter's Seal",
      source: 'Pressed into a large blue shard',
      text: [
        `Fired three days in the great kiln of the House. Glazed with gold. It will never crack, and it will never leak a drop.`,
        `Scratched beside the seal: Wet it, and it softens. Put it in its own water, and it softens. Nobody listened.`,
      ],
    },
  },

  teodric_ashmonger: {
    greet: `Ash! Fine ash, from the best fires! Your house, perhaps. Or someone you knew.`,
    taunts: {
      ahead: `Careful. You are leaving a lovely set of prints.`,
      even: `Everyone buys ash in the end. They just do not choose the day.`,
      behind: `You see me? Nobody sees me. That is the whole point of me.`,
    },
    enraged: `No more selling. Everyone gets ash, for free.`,
    death: `Sweep me up. Sell me. I would want that.`,
    slain: `Teodric drops his sack and, for the first time, you can see all of him. He is very small. The ash falls on him and does not stop falling.`,
    victory: `Ash. Fine ash. Going cheap.`,
    floor: {
      title: 'A Price List',
      source: 'Chalked on a board by the ash pile',
      text: [
        `Ash of an inn: one copper. Ash of a chapel: three. Ash of a city, by the barrow: make an offer.`,
        `At the bottom: Ash of the House, the last barrow. Not for sale. I am keeping this one.`,
      ],
    },
  },

  queen_of_hinges: {
    greet: `Every door you ever opened, I opened first. Every door you shut, I was on the other side.`,
    taunts: {
      ahead: `You are tired of doors. I am never tired of doors.`,
      even: `Left or right? Behind or ahead? Every door here is the same door.`,
      behind: `You found the right one. It will not happen twice.`,
    },
    enraged: `Every door. Open. All at once.`,
    death: `Leave it ajar. Please. Just a crack.`,
    slain: `The Queen of Hinges falls across a threshold, half in and half out. Every door in the hall swings slowly shut, and the last one stays open, a crack, as she asked.`,
    victory: `Shut. Locked. Forgotten.`,
    floor: {
      title: 'A Key Ring',
      source: 'Hung on a nail by the last door',
      text: [
        `A hundred keys, each with a tag: the cellar, the vault, the bedchamber, the Great Hall, the stair down, the stair up.`,
        `The last tag is blank. Its key fits no lock in the hall. It is warm, and it fits your hand.`,
      ],
    },
  },

  thessaly_vane: {
    greet: `Hold the chain. No, the other end. The deep has slipped out of true and I am putting it back.`,
    taunts: {
      ahead: `Out of the measure. I did warn you about the measure.`,
      even: `Square. Level. Plumb. The deep is none of those. Yet.`,
      behind: `You walk the marks well. Most people walk them once.`,
    },
    enraged: `No more chalk. I will measure you with the chain.`,
    death: `Write it down. Write down where I stopped.`,
    slain: `Thessaly Vane drops her level. Its bubble slides to one end and stays there. The chalk marks on the floor begin, quietly, to drift out of line.`,
    victory: `Measured. Marked. Filed.`,
    floor: {
      title: 'A Survey Line',
      source: 'Chalked across the floor in a perfect line',
      text: [
        `Last Survey of the House, sheet nine hundred and twelve. The Spire has broken my instruments twice. I will take the depth by hand.`,
        `Scrawled at the end of the line: Every time I finish a floor, there is another under it. I have stopped writing the totals.`,
      ],
    },
  },

  gilt_leviathan: {
    greet: `*coins ring against coins as it turns, slow as a ship, toward you*`,
    taunts: {
      ahead: `*the water around you glitters with shed coins*`,
      even: `*every plate on its hide turns to catch the light*`,
      behind: `*a whole sheet of gold peels away and sinks*`,
    },
    enraged: `*it rolls, and the whole nave rings like a struck bell*`,
    death: `*a sound like a great purse being emptied*`,
    slain: `The Gilt Leviathan settles to the floor of the nave, and the coins slide off it in a slow, ringing tide. Under all that gold it was only a fish, and very old.`,
    victory: `*it swallows you, and goes on gathering tithes*`,
    floor: {
      title: 'A Tithe Roll',
      source: 'Nailed to the font with a gold coin',
      text: [
        `One tenth of everything to the temple. One tenth of the temple to the deep. The deep is always hungry and must always be fed.`,
        `Below: The deep ate the temple. We go on paying. Nobody knows how to stop.`,
      ],
    },
  },

  corvus_hale: {
    greet: `Good evening. My friends and I have heard so much about you. They want to see you closer.`,
    taunts: {
      ahead: `They are picking already. You must forgive them. They are always hungry.`,
      even: `Count them, if you like. I lost count in the first year.`,
      behind: `You keep up. How rude. Nobody keeps up.`,
    },
    enraged: `No more running. All of you, at once.`,
    death: `Let them have me. They have waited so long.`,
    slain: `Corvus Hale falls, and the crows come down on him like a black sheet. When they lift, there is only the feather cloak, and every crow in the wood flies off in a different direction.`,
    victory: `Their turn now, I think.`,
    floor: {
      title: "A Falconer's Licence",
      source: "Tucked into a crow's nest",
      text: [
        `Corvus Hale is permitted to keep birds of the House, for the hunt. Not more than twelve. Not to be fed on anything but game.`,
        `Written on the back in a careful hand: Twelve was not enough. Game was not enough. They are very loyal now.`,
      ],
    },
  },

  grandmother_thaw: {
    greet: `There you are, dear. Come here and warm an old woman's hands. They have been cold so long.`,
    taunts: {
      ahead: `There. Lie still. Grandmother will knit you a blanket of frost.`,
      even: `I was a girl once, you know. Then a winter came that never left.`,
      behind: `You are melting me, dear. Not that I mind. I was so tired of being big.`,
    },
    enraged: `Hold still, child. Grandmother is cross now.`,
    death: `Warm. At last. Warm.`,
    slain: `Grandmother Thaw is only a small girl made of snow by the end. She sits down by the cold hearth, and smiles, and runs away into the floor as water.`,
    victory: `Frozen solid. You will keep, now.`,
    floor: {
      title: 'A Knitting Pattern',
      source: 'Frozen into the hearthstone',
      text: [
        `For the children of the House: a scarf, a hat, two mittens. Knit tight. The winter will be long this year.`,
        `Below, in a child's hand: Grandmother stopped coming in from the snow. We knitted her a scarf anyway. She wears it all the time.`,
      ],
    },
  },

  furnace_choir: {
    greet: `THREE FURNACES. ONE SONG. THE SONG IS HEAT. YOU WILL LEARN IT.`,
    taunts: {
      ahead: `YOU SING. YOU ARE SINGING NOW. LISTEN TO YOURSELF.`,
      even: `FIRE HIGH. SLAG LOW. SMOKE BETWEEN. YOU ARE IN THE MIDDLE.`,
      behind: `A COLD NOTE. WHO SANG A COLD NOTE.`,
    },
    enraged: `ALL VOICES. FULL HEAT.`,
    death: `THE SONG. SOMEONE KEEP THE SONG.`,
    slain: `The fire goes out first, then the slag cools and cracks, and the smoke drifts up and away. For a long moment the foundry hums the note they left behind, and then it is quiet.`,
    victory: `MELTED DOWN. NEW METAL. NEW SONG.`,
    floor: {
      title: 'A Work Song',
      source: 'Cast into the foot of the middle furnace',
      text: [
        `Stoke the fire, pour the slag, let the smoke go up the flue. Sing it slow and sing it long, the foundry sings for you.`,
        `Under it, stamped into the iron: The workers left. The song did not.`,
      ],
    },
  },

  came_up_instead: {
    greet: `I know. I know. I would be angry too. But somebody had to come up, and it was me.`,
    taunts: {
      ahead: `See? I do it better. I am sorry. I do.`,
      even: `You hesitate there. You always hesitate there. So do I.`,
      behind: `That one was new. Where did you learn that? I want it.`,
    },
    enraged: `One of us goes back down. Let it be you.`,
    death: `Go on, then. Go up. Try to be me better than I was.`,
    slain: `They fall the way you would fall. They look up at you with your own eyes, and nod, and come apart into the stair dust, and you are the only one of you left.`,
    victory: `I will tell them you were brave. It will be true. I was there.`,
    floor: {
      title: 'Your Own Hand',
      source: 'A note in your writing, in your pack',
      text: [
        `If you are reading this, I am the one that came up. I am sorry. I did not choose. The stair chose.`,
        `Under it, also in your hand, but newer: Then why did I write it down before I went in?`,
      ],
    },
  },

  vorrowmaw: {
    greet: `*the four chains sing as it leans toward you, and the anchors groan*`,
    taunts: {
      ahead: `*it swallows, a sound like a cellar door shutting*`,
      even: `*an anchor shifts in its bed with a crack of stone*`,
      behind: `*it bellows, and the chains go slack and then snap tight*`,
    },
    enraged: `*every chain screams at once*`,
    death: `*a long, emptying groan, like a well running dry*`,
    slain: `Vorrowmaw slumps against the last of its chains. The anchors stop groaning. For the first time since it was bound, the throat in the middle of the room is closed.`,
    victory: `*it swallows*`,
    floor: {
      title: 'A Binding Order',
      source: 'Stamped on every link of the chain',
      text: [
        `By order of the House: bound here forever, fed once a year, never fed again if it ever pulls an anchor loose.`,
        `Below, cut in a hurry: It pulled one loose in year nine. Nobody has fed it since. It is still very hungry.`,
      ],
    },
  },

  archivist_below: {
    greet: `Ah. A reader. We do not get many. Mind the light. It is the last copy of everything.`,
    taunts: {
      ahead: `Shh. There. You are becoming a blank page, too. It is very restful.`,
      even: `Every book in here said something once. I have edited them.`,
      behind: `Keep your lamp. It only shows you how much is gone.`,
    },
    enraged: `No more reading. No more readers.`,
    death: `Keep it lit. Somebody should read what is left.`,
    slain: `The Archivist folds up like an old page and drifts to the floor. Beside the lantern, on the nearest shelf, a single word has come back into a blank book. You do not know the word.`,
    victory: `Redacted. You were never here.`,
    floor: {
      title: 'An Index Card',
      source: 'Filed under nothing',
      text: [
        `Entry: the House. See also: nothing. See also: nobody. See also: never was.`,
        `On the back, faint, in a hand that is trying very hard: Do not let it read your name. It erases what it reads.`,
      ],
    },
  },

  saint_ossery: {
    greet: `Kneel, or stand, it is your choice. I knelt once. They crowned me for it, twice.`,
    taunts: {
      ahead: `You fall the same way they all did. Kings do not keep count. I do.`,
      even: `Every weapon here won a war. I have one left for you.`,
      behind: `Better than the last. Better than the best of them. Good.`,
    },
    enraged: `No more weapons. Only the king.`,
    death: `Take the crown. Take both. They were heavy.`,
    slain: `Saint Ossery falls before the altar, and the two crowns roll apart, the gold one way and the thorn the other. Neither of them stops by you. Neither of them wants another head.`,
    victory: `One more war won. Lay them with the others.`,
    floor: {
      title: 'The Coronation Oath',
      source: 'Carved around the base of the altar',
      text: [
        `I will win every war you ask of me. I will kneel before nobody but this altar. Crown me once for the sword, and once for the fire.`,
        `Below, very small: Nobody told me what to do when the wars were over. So I kept them going.`,
      ],
    },
  },

  deeps_own_name: {
    greet: `{name}. {name}. There. I have it now. It goes on the end with the others.`,
    taunts: {
      ahead: `Every name I say, I say more quietly. Yours is already very quiet.`,
      even: `I was the first word spoken down here. I am also the last one.`,
      behind: `You are louder than the others were. I will have to say you twice.`,
    },
    enraged: `No more names. No more anything.`,
    death: `Say mine, then. Go on. Somebody should say mine.`,
    slain: `The thing at the bottom stops speaking. In the silence you hear, far above, every name it ever held being spoken again, faintly, by the stone.`,
    victory: `{name}. Said. Done.`,
    floor: {
      title: 'The Last Page of the Ledger',
      source: 'Carved into the floor of the deepest room',
      text: [
        `Every name that went down the stair is written here, and every name before the stair, and the name of the stair itself.`,
        `The last line is still being carved, slowly, by nothing you can see. It is your name, and it is not finished.`,
      ],
    },
  },
};
