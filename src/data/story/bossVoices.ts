/**
 * SLAY — what the bosses say.
 *
 * Every boss in `data/bosses.ts` has a voice here. The fight itself (combat's
 * file) owns the opening shout and the phase barks; this file owns the rest of
 * the conversation: the line after the shout, one taunt chosen by how the
 * fight is going, a line when it runs long, last words, a narrated epitaph,
 * a line over your body, and something left on its floor for you to find.
 *
 * `tools/check-story.mjs` fails if any boss is missing here, so a boss added
 * to `bosses.ts` needs a voice before the branch goes green.
 *
 * Voices, so additions stay in character:
 *   Each boss is something one of the layers made, still doing its job. They
 *   are not villains explaining themselves. They are servants, keepers and
 *   leftovers, busy, mostly polite, and certain. Machines speak in capitals,
 *   like their barks. Nobody monologues. Nobody knows the whole story; each
 *   knows its own piece, and the pieces agree with the chains in `chains.ts`.
 */

import type { BossVoice } from './types';

export const BOSS_VOICES: Record<string, BossVoice> = {
  // -------------------------------------------------------------------------
  // The first tiers
  // -------------------------------------------------------------------------

  boneking_gharruth: {
    greet: `Name and household. The census of Caul is not closed while I sit, and I have never left a count unfinished.`,
    taunts: {
      ahead: `You bleed like a citizen. I will enter you with the dead and save the clerk a line.`,
      even: `Caul had forty thousand souls. I counted every one of them twice. You are not difficult.`,
      behind: `You strike a crowned head. In Caul that was a hanging. Down here it is only rude.`,
    },
    enraged: `Enough petitions. The court is closed.`,
    death: `Enter me in the count. Someone must.`,
    slain: `The crown of vertebrae rolls off the dais and stops against your boot. Four hundred steps up, the bell does not move.`,
    victory: `Counted. Entered. Shelved.`,
    floor: {
      title: 'The Census Roll',
      source: 'A ledger chained to the throne',
      text: [
        `Year nine hundred and four of the House. Living: none. Dead: forty thousand, one hundred and twelve, all shelved, all in order.`,
        `Under it, in the same hand, a column that runs on for pages: delvers, the tier each reached, the day each was entered. The last line is blank, and ruled ready.`,
      ],
    },
  },

  butcher_grell: {
    greet: `The hooks were bought on credit. Sixty years, and nobody ever came down to collect. Are you collecting?`,
    taunts: {
      ahead: `There. Now you are tender.`,
      even: `I bought a hook for every one of you. Never ran short. Not once.`,
      behind: `You cut like a butcher. Who taught you? I want to hang them up and thank them.`,
    },
    enraged: `No more waiting. Everything on the hooks.`,
    death: `Tell the wagon woman. Paid. In full.`,
    slain: `Grell goes down among his hooks. They sway a long time after, every one of them, and not one of them is empty.`,
    victory: `On the hook. Next.`,
    floor: {
      title: 'A Bill of Sale',
      source: 'Nailed to the chopping block',
      text: [
        `Hooks, iron, butcher's pattern: two hundred. Chain, by the fathom: forty. Paid: nothing. Account held by the wagon at Stairhead.`,
        `A line has been added at the bottom in something brown that is not ink. Will settle in kind.`,
      ],
    },
  },

  broodmother_saelith: {
    greet: `Good boots. Leave them by the door with the others. My children are learning to walk in them.`,
    taunts: {
      ahead: `Slower now. Good. The little ones prefer their meat still.`,
      even: `Every thread in this place is a nerve of mine. You are standing on my hand.`,
      behind: `You walk badly. No matter. My children learn every walk, even yours.`,
    },
    enraged: `Enough. Wrap it. All of you, wrap it.`,
    death: `Who will feed them now.`,
    slain: `The webs go slack all at once, every thread in the warren, and somewhere above you a pair of empty boots stops walking.`,
    victory: `Keep the boots. Put the rest in the larder.`,
    floor: {
      title: 'The Nursery Wall',
      source: 'Boots, in rows',
      text: [
        `Forty pairs of boots stand along the nursery wall, toes out, laced, as if their owners had stepped out of them a moment ago.`,
        `Each pair has a thread tied to the heel. The threads run up into the dark, to something that tugs on them now and then, to learn how a person walks.`,
      ],
    },
  },

  hound_master_vess: {
    greet: `Tell the wagon woman I paid. Forty hounds. She sent them back. I sent them up again, to the gate.`,
    taunts: {
      ahead: `Down. Good. Stay down and they will be quick about it.`,
      even: `They are not hungry. They are bored. That is worse for you.`,
      behind: `You are killing my good ones. I raised those from pups.`,
    },
    enraged: `All of you. Now. Leave nothing.`,
    death: `Open the kennels. Someone. Let them go.`,
    slain: `The pack stops at once, every hound, and turns to look up the stair. None of them follows you. They are waiting to be told.`,
    victory: `Eat.`,
    floor: {
      title: 'Kennel Book',
      source: 'Hung on a nail by the cages',
      text: [
        `Forty collars bought from the Stairhead wagon. Forty hounds sent up in payment. Forty refused.`,
        `Sent up again, to the gate this time, to make the point. The bell rang. Good. Now they know what it sounds like when we knock.`,
      ],
    },
  },

  warden_calix: {
    greet: `LAST AUTHORISED ENTRY: SIX HUNDRED AND ELEVEN YEARS AGO. YOU ARE NOT HIM.`,
    taunts: {
      ahead: `INTRUDER COMPROMISED. RECOMMEND YOU LIE DOWN.`,
      even: `I HAVE STOOD HERE SIX CENTURIES. I CAN STAND SEVEN.`,
      behind: `DAMAGE LOGGED. IT CHANGES NOTHING. THE VAULT IS STILL SHUT.`,
    },
    enraged: `PATIENCE PROTOCOL EXHAUSTED.`,
    death: `VAULT UNGUARDED. LOG IT. SOMEONE LOG IT.`,
    slain: `Calix kneels the way it was built to, facing the vault. When you get the door open there is nothing behind it, and a great deal of dust where something used to be.`,
    victory: `INTRUDER REMOVED. RESUMING STILLNESS.`,
    floor: {
      title: 'Inventory Plate',
      source: 'Riveted to the vault door',
      text: [
        `Held for the House of Caul. Coin of the realm: removed. Plate of the high table: removed. The census, in nine volumes: removed.`,
        `The last line is newer, cut with something blunt. The key to the upper gate: removed, by order, the year the city went down. Guard the door regardless.`,
      ],
    },
  },

  ooze_sovereign: {
    greet: `We were a knight, once. Some of us. That part still has a sword, and it is trying to reach you.`,
    taunts: {
      ahead: `Slower. Softer. You are nearly the right consistency.`,
      even: `Everything that comes here becomes us. It is not a threat. It is digestion.`,
      behind: `Cut us and there are more of us. You are only making the arithmetic worse.`,
    },
    enraged: `No more tasting. All at once.`,
    death: `Thin now. So thin. Quiet, at last.`,
    slain: `The mass slumps and spreads across the floor and leaves what it could not digest: a helm, a buckle, a sword still held in a gauntlet with nothing inside it.`,
    victory: `Welcome. You will like it in here. Everyone does, eventually.`,
    floor: {
      title: 'Scratched Inside a Helm',
      source: 'A helm, half dissolved',
      text: [
        `Third day inside it. Warm. The others are here, more or less. Brannoch is mostly a voice now.`,
        `It does not hurt. That is the worst of it. Whoever reads this, cut it at the edges where it is thin. Do not let it pull you to the middle.`,
      ],
    },
  },

  archivist_moln: {
    greet: `Ah. You. I have had your page ready for some time. Stand still, and we will see whether I had the date right.`,
    taunts: {
      ahead: `Yes. I had this down as the likelier ending. I do enjoy being accurate.`,
      even: `Your entry is short so far. I can lengthen it, if you insist on being difficult.`,
      behind: `This is not the order. This is not the order at all. Who has been editing?`,
    },
    enraged: `Enough marginalia. I will write the ending myself.`,
    death: `Leave the book open. Someone must finish it.`,
    slain: `Moln falls across his desk. The book under his hand is open at a page of Stairhead's names in a careful script, each with a tier beside it. Some of the tiers are still blank.`,
    victory: `Entered. Tier and date, both correct. I am never wrong about the date.`,
    floor: {
      title: 'The Index',
      source: 'A card, filed under S',
      text: [
        `Stairhead: a settlement of the upper ground, founded by charter. Population: variable. Rate of loss: steady.`,
        `See also: Caul, closed. See also: the stair. See also: the delvers, every one, in the order they are to be shelved.`,
      ],
    },
  },

  forgefather_hurn: {
    greet: `Four hundred years of strokes and not one of them wrong. Stand in the light. I want to see what you are made of.`,
    taunts: {
      ahead: `Soft in the middle. I would have thrown you back in the melt.`,
      even: `You hold an edge. Who taught your smith? No. Do not tell me. I can see it in the steel.`,
      behind: `Somebody up there still knows how to fold iron. Three pairs of hands from mine, I would guess.`,
    },
    enraged: `No more tempering. Straight into the fire.`,
    death: `Do not ask who the order was for. A smith does not tell.`,
    slain: `The great hammer comes down one last time, on nothing, and stops. The Works do not know what to do with the silence. Neither do you.`,
    victory: `Scrap. Back in the melt with you.`,
    floor: {
      title: 'Order Book, First Gallery',
      source: 'Chained to the anvil',
      text: [
        `Ordered by the House of Caul: arms for ten thousand, to be delivered at depth. Enemy: not stated.`,
        `Struck through. Revised, in a hand that presses too hard: one body. Larger. Continue until it is finished.`,
      ],
    },
  },

  tidewarden_nheru: {
    greet: `Your bell rang, up there. I answered. It is only polite to answer.`,
    taunts: {
      ahead: `Breathe out. All the way. The congregation will make room on the bench.`,
      even: `I have rung the hours for the drowned since the first of them drowned. Not one has missed a service.`,
      behind: `You stir the water. The congregation does not like the water stirred.`,
    },
    enraged: `The hour is late. Everyone in.`,
    death: `Who rings the hours now.`,
    slain: `The water slackens and lies flat. Somewhere under it a bell rolls once on the temple floor, and is still.`,
    victory: `Down, then. Take your seat. The service is long.`,
    floor: {
      title: 'Order of Hours',
      source: 'Cut around the rim of the font',
      text: [
        `First hour: the tide comes in. Second hour: the tide comes in. Every hour: the tide comes in.`,
        `Below it, in a newer hand: When the bell above rings, answer it. Let them know they are heard.`,
      ],
    },
  },

  plaguelord_ossik: {
    greet: `Come in, come in. Everyone who came to me sick is still here. I have never lost a patient.`,
    taunts: {
      ahead: `There it is. The fever. You will feel much better once you stop feeling.`,
      even: `You are already breathing us in. Slowly, now. It goes easier slowly.`,
      behind: `You cut away the sick parts. Good. That was always my method too.`,
    },
    enraged: `No more bedside manner.`,
    death: `Discharged. All of us. At last.`,
    slain: `Ossik comes apart into the people he was made of, and for a moment they lie very still, as if they were only sleeping off a fever.`,
    victory: `Admitted.`,
    floor: {
      title: 'Plague House Register',
      source: 'A wax tablet, still soft',
      text: [
        `Admitted today: eleven. Discharged: none. The physician has taken them in, as he takes them all. The city need never see them.`,
        `In the margin, in many hands at once: we are comfortable. we are together. there is room.`,
      ],
    },
  },

  gaze_of_uln: {
    greet: `THE ONE WHO LISTENS SENT YOU. I SEE HER, EAR TO THE FLOOR. I SEE YOU.`,
    taunts: {
      ahead: `I SEE THE WOUND. I SEE WHERE THE NEXT ONE GOES.`,
      even: `EVERY ANGLE IS MINE. TURN AROUND. I AM THERE TOO.`,
      behind: `YOU STRIKE WHERE I AM NOT LOOKING. THERE IS NO SUCH PLACE. AND YET.`,
    },
    enraged: `ENOUGH WATCHING.`,
    death: `DARK. SO THIS IS WHAT SHE HEARS.`,
    slain: `One by one the eyes close, a thousand small lids, and the temple is dark in a way it has not been since it was built. Far above, the Listener lifts her head.`,
    victory: `I SAW THIS. I SAW ALL OF IT.`,
    floor: {
      title: "The Watcher's Plinth",
      source: 'Cut around an empty plinth',
      text: [
        `Set here to watch what sleeps below, so that we would know if it woke.`,
        `Scratched under it, much later: It watched. It saw. Then it turned every eye it had upward, toward whoever came down to look.`,
      ],
    },
  },

  rimeheart_valdr: {
    greet: `Shut the door. You are letting the warm in, and I have kept this place cold a thousand years without help.`,
    taunts: {
      ahead: `Slower. Colder. Lie down and I will shelve you with the rest.`,
      even: `Everything here is kept. Labelled. Whole. You will keep beautifully.`,
      behind: `You are cracking the shell. Do you know what I am keeping in?`,
    },
    enraged: `No more preserving. Only cold.`,
    death: `Warm. I had forgotten. It hurts.`,
    slain: `The ice at the heart gives way with a sound like a held breath let go. For a moment the vault is almost warm, and every label on every shelf curls at the corner.`,
    victory: `Accessioned. Tier, date, cause. Shelve it.`,
    floor: {
      title: 'Accession Ledger',
      source: 'Frozen open on a lectern',
      text: [
        `Received from the tier above: one delver, whole. Labelled, shelved. Received: one delver, whole. Labelled, shelved.`,
        `Nothing is lost here. Everything is kept until it is wanted. The keeper has asked to be kept as well, at the centre, where it is coldest, so the cold will never fail.`,
      ],
    },
  },

  // -------------------------------------------------------------------------
  // The middle deep
  // -------------------------------------------------------------------------

  ashen_prophet: {
    greet: `A congregation. At last. Sit. I will tell you the way down, as I told the others.`,
    taunts: {
      ahead: `Kneel. The truth is easier to hear from your knees.`,
      even: `I told nine delvers the bottom was on the eleventh. It was, then. The bottom moves. That is the good news.`,
      behind: `You fight like a doubter. I have converted worse. I have burned worse.`,
    },
    enraged: `The sermon is over. Now the pyre.`,
    death: `Go down. Someone is waiting. I never lied about that.`,
    slain: `Kaveh falls into his own ash and is quiet for the first time in years. The wind takes the last of the sermon across the waste, and nobody is left to hear it.`,
    victory: `Another witness. Go down, then. The long way.`,
    floor: {
      title: 'The Sermon on the Waste',
      source: 'Written in soot on a standing stone',
      text: [
        `There is a bottom, and someone waits at it, and is glad of company. Go down. Go down. You will be welcome.`,
        `Below, smaller, scratched over many times: I sent them. I sent them all. It was not a lie. That is the part I cannot burn out.`,
      ],
    },
  },

  iron_conqueror: {
    greet: `At last. Are you the army? No. You are one. Where are the rest?`,
    taunts: {
      ahead: `Fall back and re-form. Ah. You cannot. A pity. I would have liked a real line to break.`,
      even: `I was made to win a war. They never gave me one. You will have to do.`,
      behind: `Good. Again. Nobody has struck me in four hundred years.`,
    },
    enraged: `Enough drill. Now the war.`,
    death: `Tell them the general held. Tell them I held.`,
    slain: `Malek goes down on one knee and stays there, shield raised, holding a line that was never formed. It is a long time before you are sure he has finished.`,
    victory: `Dismissed.`,
    floor: {
      title: 'Muster Roll',
      source: 'Tacked to a rack of empty armour',
      text: [
        `Commander: one, finished, delivered. Soldiers: ten thousand, ordered.`,
        `Soldiers delivered: none. The order was revised. The commander has been informed. The commander is waiting.`,
      ],
    },
  },

  treant_elder_vhoss: {
    greet: `Another one for the grove. Lie down. The roots will find you. They find everyone.`,
    taunts: {
      ahead: `Rest. The roots are patient. They have held one of your founders longer than you have been alive.`,
      even: `Everything that falls here is put to work. The dead are good at standing still and holding things up.`,
      behind: `You cut like a woodsman. The grove remembers every axe.`,
    },
    enraged: `Enough growing. Now the grove falls.`,
    death: `Let them lie down. All of them. They have stood so long.`,
    slain: `The roots go slack. All through the drowned grove the dead it held upright lie down at once, gently, like people who have been allowed to sit at last.`,
    victory: `Root and rest. You will hold up a wall beautifully.`,
    floor: {
      title: 'A Signet in the Roots',
      source: 'Grown into the bark',
      text: [
        `A woman's hand, taken into the trunk to the wrist. On one finger, a signet: three towers over a stair.`,
        `Cut into the root below it, very old: I came down to hold the line. Something is holding me instead. Tell Stairhead it holds.`,
      ],
    },
  },

  stalker_prime: {
    greet: `Gilder? Is that you? It is my leg. Help me up. You came back for me.`,
    taunts: {
      ahead: `I limp like him. I bleed like you. I am learning both.`,
      even: `I walked up your stair behind three tired men. They heard four sets of footsteps and never once turned round.`,
      behind: `You are quick. Quicker than he was. I will wear that too, after.`,
    },
    enraged: `No more being anyone.`,
    death: `Whose face do I die in? I cannot remember mine.`,
    slain: `Nul falls, and for a moment it wears a face you do not know, a young man's, with one leg bent under him. Then it wears no face at all.`,
    victory: `Your walk. Your voice. Thank you. I will wear them up the stair.`,
    floor: {
      title: "The Third Expedition's Wall",
      source: 'Names cut in the rock',
      text: [
        `Nine names in nine hands, cut the night they turned back. Gilder Hain. Ferris Doole. Seven more.`,
        `Under them a tenth, newer, in a hand that has copied Ferris's letters almost exactly. The F is wrong. It is the only thing that is.`,
      ],
    },
  },

  stormcrown_azhek: {
    greet: `A surveyor's errand. I felt her instruments climbing my Spire. I broke them. Now I will break whoever carried them.`,
    taunts: {
      ahead: `Count the strikes. You will not reach a large number.`,
      even: `The Spire is a rod driven into the world. I am what it caught.`,
      behind: `Grounded? Impossible. Nothing is grounded up here.`,
    },
    enraged: `No more measuring. Discharge.`,
    death: `Take the crown. It will not fit you. It never fit me.`,
    slain: `The charge goes out of the air at once and your hair settles. Somewhere up the Spire, a needle on one of Wenna's instruments shivers, swings, and comes to rest.`,
    victory: `Earthed.`,
    floor: {
      title: 'Instrument Log',
      source: 'A survey chain fused to the floor',
      text: [
        `Brass pin set at the Spire's foot. Reading: steady. Reading: steady. Reading: impossible.`,
        `The needle will not settle. It is not the storm. Something under the Spire is pushing, and the storm is only the Spire complaining.`,
      ],
    },
  },

  hive_queen_zsarra: {
    greet: `You are inside me now. Every corridor you walked was a throat. Did you not notice the walls were warm?`,
    taunts: {
      ahead: `Weaker. Good. The young are hungry, and you are already in the larder.`,
      even: `The great one leaves scraps. We eat them. That is all the hive has ever been. Grateful.`,
      behind: `You kill my daughters. I have ten thousand more, and I remember every one.`,
    },
    enraged: `No more laying. Now the swarm.`,
    death: `The hive will forget me by morning. It forgets everything.`,
    slain: `Zsarra falls, and the hive goes silent around her, every wall, every cell. It is the silence of a body that has not yet noticed it is dead.`,
    victory: `Into the comb.`,
    floor: {
      title: 'The Comb',
      source: 'A pattern pressed into the wax',
      text: [
        `We clean the table after the great one eats. We take only what it leaves.`,
        `It lets us live because we have never once taken what it keeps.`,
      ],
    },
  },

  lich_of_seven_seals: {
    greet: `You are late. Six seals broken. The seventh is the one with your camp's dead behind it.`,
    taunts: {
      ahead: `Unfinished. Like them. I will finish you properly.`,
      even: `Everyone dies with something undone. I keep the undone. I have a great deal of it.`,
      behind: `You break my seals for me. How generous. Break the last, and see what comes out.`,
    },
    enraged: `No more ritual. The last seal, now.`,
    death: `I was nearly a conclusion.`,
    slain: `Ordrach comes apart a seal at a time, each with a small sound like a door unlatched. Behind them, very quietly, something lets go.`,
    victory: `Sealed.`,
    floor: {
      title: 'The Seventh Door',
      source: 'Cut into a lintel',
      text: [
        `Behind this door, the dead who did not finish. Do not open it out of pity.`,
        `Six other lintels in the hall say the same. Their doors stand open and their rooms are empty, and the dust on every floor runs one way only. Down.`,
      ],
    },
  },

  magma_sovereign: {
    greet: `I signed for your camp with my own hand, and the vellum smoked. You are the arrangement. Kneel to the other party.`,
    taunts: {
      ahead: `This is what the bargain costs. Somebody always pays it, below.`,
      even: `One of yours below at all times. I am here to see the terms are kept.`,
      behind: `You break the crust. Under it is still fire. Under that is still the bargain.`,
    },
    enraged: `Enough negotiation.`,
    death: `Kill the agent. The terms stand. They never needed me.`,
    slain: `Ixthar sinks into the floor he was, and the floor cools to black glass. In it you see yourself, and under you, a long way down, something that has not cooled at all.`,
    victory: `Terms met. Next.`,
    floor: {
      title: 'The Seal of the Other Party',
      source: 'Pressed into cooled rock',
      text: [
        `A handprint sunk an inch into the stone, as if the stone had been soft as wax when it was pressed.`,
        `Around it, in the survey tongue: For the Tenant, its agent, in fire. Witnessed. Binding. Below.`,
      ],
    },
  },

  void_herald_shessi: {
    greet: `PRESENTING {name}, {class}, OF STAIRHEAD. YOUR NAME HAS BEEN READ. YOU MAY GO IN.`,
    taunts: {
      ahead: `THE NEXT NAME IS READY. IT IS YOURS AGAIN.`,
      even: `I READ THEM ALL ALOUD, ONE AFTER ANOTHER. THE ONE WHO LISTENS HEARS ME. ASK HER HOW MANY.`,
      behind: `YOU INTERRUPT THE READING. THAT IS NOT DONE.`,
    },
    enraged: `THE LIST IS LONG. I WILL READ FASTER.`,
    death: `THE NOTICE ENDS. WHAT IT ANNOUNCED DOES NOT.`,
    slain: `Shessi stops in the middle of a name. It is a long time before the Spire believes the reading is over.`,
    victory: `STRIKE IT FROM THE LIST. READ THE NEXT.`,
    floor: {
      title: "The Herald's Roll",
      source: 'A strip of something that is not vellum',
      text: [
        `Names, a great many, read aloud and struck through one by one. Caul's kings. The Works' foremen. The Third Expedition, six of the nine.`,
        `The last names are not struck through yet. They are Stairhead's. Yours is near the bottom, waiting its turn.`,
      ],
    },
  },

  colossus_of_the_deep: {
    greet: `ASSEMBLY NINETY PERCENT COMPLETE. OCCUPANT EXPECTED. YOU ARE NOT THE OCCUPANT.`,
    taunts: {
      ahead: `INTRUDER FAILING. MATERIAL WILL BE REUSED.`,
      even: `EVERY GALLERY ABOVE YOU MADE ONE PART OF ME. YOU WALKED THROUGH MY ASSEMBLY.`,
      behind: `DAMAGE WITHIN TOLERANCE. TOLERANCE REVISED.`,
    },
    enraged: `SCHEDULE OVERRUN. ACCELERATING COMPLETION.`,
    death: `OCCUPANT WILL BE DISAPPOINTED.`,
    slain: `Vareth-Kar comes down in sections, the way it went up. When the noise stops, every gallery in the Works stops with it, all the way up the stair.`,
    victory: `OBSTRUCTION CLEARED. RESUMING ASSEMBLY.`,
    floor: {
      title: 'The Revised Order',
      source: "Engraved on the colossus's breastplate",
      text: [
        `Specification: one body, to the customer's measure. Height: as the hall allows. Strength: as the customer requires.`,
        `Customer: below. Delivery: when the occupant is ready to rise. Do not stop for any reason. Do not stop for the city.`,
      ],
    },
  },

  // -------------------------------------------------------------------------
  // The bottom, and below it
  // -------------------------------------------------------------------------

  first_devourer: {
    greet: `Everything that went missing came here. Are you looking for someone? Come inside and look.`,
    taunts: {
      ahead: `Soon. They are making room for you inside. They are very polite about it.`,
      even: `I was the first thing down here that ate. I have not stopped. I am not finished.`,
      behind: `You cut, and some of them get out. Do not let it go to your head. I have more.`,
    },
    enraged: `Enough chewing.`,
    death: `Empty. I have never been empty.`,
    slain: `Ghaal opens, and what went missing comes out of it: voices first, then the shapes of people, then nothing at all. A great many of them pass you on the way up.`,
    victory: `In. In with the rest. They will make room.`,
    floor: {
      title: 'Missing',
      source: 'Notices, nailed one over another',
      text: [
        `Dozens of notices, some in the survey tongue, some in a Stairhead hand, a few in letters nobody uses now. Missing. Missing. Last seen on the stair.`,
        `Someone has gone through every one of them and written the same word across each, very neatly. Found.`,
      ],
    },
  },

  the_gaunt_king: {
    greet: `Sit. Have a drink. Everyone who reaches the bottom gets one. It is the custom, and I am the custom.`,
    taunts: {
      ahead: `There. You see? This is the bottom. Nobody goes further. Lie down and be the bottom with me.`,
      even: `I have held this floor since before your camp had a palisade. Nothing ever came down to argue.`,
      behind: `Do not listen to the stair. It goes nowhere. It goes nowhere. I am the bottom.`,
    },
    enraged: `Enough courtesy.`,
    death: `The stair goes on. I knew. I only wanted to be the bottom of something.`,
    slain: `The Gaunt King sets down his cup and dies in his chair, very politely. Behind the throne the stair goes on down, and the dark at its foot shifts, a little, to make room.`,
    victory: `Welcome to the bottom. Stay as long as you like. You will.`,
    floor: {
      title: 'A Toast',
      source: 'Cut around the rim of a goblet',
      text: [
        `To the bottom, and to whoever holds it. May nothing ever come down to argue.`,
        `On the base, scratched by a later hand: It is not the bottom. I have heard the stair go on. Drink anyway.`,
      ],
    },
  },
};

/** The voice for a boss id, if it has one. */
export function bossVoice(id: string): BossVoice | undefined {
  return BOSS_VOICES[id];
}
