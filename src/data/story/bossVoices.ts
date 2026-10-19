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
import { NEW_BOSS_VOICES } from './bossVoices2';
import { DEEP_BOSS_VOICES } from './bossVoices3';
import { tr } from '../../core/I18n';

export const BOSS_VOICES: Record<string, BossVoice> = {
  // -------------------------------------------------------------------------
  // The first tiers
  // -------------------------------------------------------------------------

  boneking_gharruth: {
    greet: tr('Name and household. The census of Caul is not closed while I sit, and I have never left a count unfinished.'),
    taunts: {
      ahead: tr('You bleed like a citizen. I will enter you with the dead and save the clerk a line.'),
      even: tr('Caul had forty thousand souls. I counted every one of them twice. You are not difficult.'),
      behind: tr('You strike a crowned head. In Caul that was a hanging. Down here it is only rude.'),
    },
    enraged: tr('Enough petitions. The court is closed.'),
    death: tr('Enter me in the count. Someone must.'),
    slain: tr('The crown of vertebrae rolls off the dais and stops against your boot. Four hundred steps up, the bell does not move.'),
    victory: tr('Counted. Entered. Shelved.'),
    floor: {
      title: tr('The Census Roll'),
      source: tr('A ledger chained to the throne'),
      text: [
        tr('Year nine hundred and four of the House. Living: none. Dead: forty thousand, one hundred and twelve, all shelved, all in order.'),
        tr('Under it, in the same hand, a column that runs on for pages: delvers, the tier each reached, the day each was entered. The last line is blank, and ruled ready.'),
      ],
    },
  },

  butcher_grell: {
    greet: tr('The hooks were bought on credit. Sixty years, and nobody ever came down to collect. Are you collecting?'),
    taunts: {
      ahead: tr('There. Now you are tender.'),
      even: tr('I bought a hook for every one of you. Never ran short. Not once.'),
      behind: tr('You cut like a butcher. Who taught you? I want to hang them up and thank them.'),
    },
    enraged: tr('No more waiting. Everything on the hooks.'),
    death: tr('Tell the wagon woman. Paid. In full.'),
    slain: tr('Grell goes down among his hooks. They sway a long time after, every one of them, and not one of them is empty.'),
    victory: tr('On the hook. Next.'),
    floor: {
      title: tr('A Bill of Sale'),
      source: tr('Nailed to the chopping block'),
      text: [
        tr('Hooks, iron, butcher\'s pattern: two hundred. Chain, by the fathom: forty. Paid: nothing. Account held by the wagon at Stairhead.'),
        tr('A line has been added at the bottom in something brown that is not ink. Will settle in kind.'),
      ],
    },
  },

  broodmother_saelith: {
    greet: tr('Good boots. Leave them by the door with the others. My children are learning to walk in them.'),
    taunts: {
      ahead: tr('Slower now. Good. The little ones prefer their meat still.'),
      even: tr('Every thread in this place is a nerve of mine. You are standing on my hand.'),
      behind: tr('You walk badly. No matter. My children learn every walk, even yours.'),
    },
    enraged: tr('Enough. Wrap it. All of you, wrap it.'),
    death: tr('Who will feed them now.'),
    slain: tr('The webs go slack all at once, every thread in the warren, and somewhere above you a pair of empty boots stops walking.'),
    victory: tr('Keep the boots. Put the rest in the larder.'),
    floor: {
      title: tr('The Nursery Wall'),
      source: tr('Boots, in rows'),
      text: [
        tr('Forty pairs of boots stand along the nursery wall, toes out, laced, as if their owners had stepped out of them a moment ago.'),
        tr('Each pair has a thread tied to the heel. The threads run up into the dark, to something that tugs on them now and then, to learn how a person walks.'),
      ],
    },
  },

  hound_master_vess: {
    greet: tr('Forty collars from your wagon, and I paid in hounds. She sent them back. So I sent them up again, to the gate.'),
    taunts: {
      ahead: tr('Down. Good. Stay down and they will be quick about it.'),
      even: tr('They are not hungry. They are bored. That is worse for you.'),
      behind: tr('You are killing my good ones. I raised those from pups.'),
    },
    enraged: tr('All of you. Now. Leave nothing.'),
    death: tr('Open the kennels. Someone. Let them go.'),
    slain: tr('The pack stops at once, every hound, and turns to look up the stair. None of them follows you. They are waiting to be told.'),
    victory: tr('Eat.'),
    floor: {
      title: tr('Kennel Book'),
      source: tr('Hung on a nail by the cages'),
      text: [
        tr('Forty collars bought from the Stairhead wagon. Forty hounds sent up in payment. Forty refused.'),
        tr('Sent up again, to the gate this time, to make the point. The bell rang. Good. Now they know what it sounds like when we knock.'),
      ],
    },
  },

  warden_calix: {
    greet: tr('LAST AUTHORISED ENTRY: SIX HUNDRED AND ELEVEN YEARS AGO. YOU ARE NOT HIM.'),
    taunts: {
      ahead: tr('INTRUDER COMPROMISED. RECOMMEND YOU LIE DOWN.'),
      even: tr('I HAVE STOOD HERE SIX CENTURIES. I CAN STAND SEVEN.'),
      behind: tr('DAMAGE LOGGED. IT CHANGES NOTHING. THE VAULT IS STILL SHUT.'),
    },
    enraged: tr('PATIENCE PROTOCOL EXHAUSTED.'),
    death: tr('VAULT UNGUARDED. LOG IT. SOMEONE LOG IT.'),
    slain: tr('Calix kneels the way it was built to, facing the vault. When you get the door open there is nothing behind it, and a great deal of dust where something used to be.'),
    victory: tr('INTRUDER REMOVED. RESUMING STILLNESS.'),
    floor: {
      title: tr('Inventory Plate'),
      source: tr('Riveted to the vault door'),
      text: [
        tr('Held for the House of Caul. Coin of the realm: removed. Plate of the high table: removed. The census, in nine volumes: removed.'),
        tr('The last line is newer, cut with something blunt. The key to the upper gate: removed, by order, the year the city went down. Guard the door regardless.'),
      ],
    },
  },

  ooze_sovereign: {
    greet: tr('We were a knight, once. Some of us. That part still has a sword, and it is trying to reach you.'),
    taunts: {
      ahead: tr('Slower. Softer. You are nearly the right consistency.'),
      even: tr('Everything that comes here becomes us. It is not a threat. It is digestion.'),
      behind: tr('Cut us and there are more of us. You are only making the arithmetic worse.'),
    },
    enraged: tr('No more tasting. All at once.'),
    death: tr('Thin now. So thin. Quiet, at last.'),
    slain: tr('The mass slumps and spreads across the floor and leaves what it could not digest: a helm, a buckle, a sword still held in a gauntlet with nothing inside it.'),
    victory: tr('Welcome. You will like it in here. Everyone does, eventually.'),
    floor: {
      title: tr('Scratched Inside a Helm'),
      source: tr('A helm, half dissolved'),
      text: [
        tr('Third day inside it. Warm. The others are here, more or less. Brannoch is mostly a voice now.'),
        tr('It does not hurt. That is the worst of it. Whoever reads this, cut it at the edges where it is thin. Do not let it pull you to the middle.'),
      ],
    },
  },

  archivist_moln: {
    greet: tr('Ah. You. I have had your page ready for some time. Stand still, and we will see whether I had the date right.'),
    taunts: {
      ahead: tr('Yes. I had this down as the likelier ending. I do enjoy being accurate.'),
      even: tr('Your entry is short so far. I can lengthen it, if you insist on being difficult.'),
      behind: tr('This is not the order. This is not the order at all. Who has been editing?'),
    },
    enraged: tr('Enough marginalia. I will write the ending myself.'),
    death: tr('Leave the book open. Someone must finish it.'),
    slain: tr('Moln falls across his desk. The book under his hand is open at a page of Stairhead\'s names in a careful script, each with a tier beside it. Some of the tiers are still blank.'),
    victory: tr('Entered. Tier and date, both correct. I am never wrong about the date.'),
    floor: {
      title: tr('The Index'),
      source: tr('A card, filed under S'),
      text: [
        tr('Stairhead: a settlement of the upper ground, founded by charter. Population: variable. Rate of loss: steady.'),
        tr('See also: Caul, closed. See also: the stair. See also: the delvers, every one, in the order they are to be shelved.'),
      ],
    },
  },

  forgefather_hurn: {
    greet: tr('Four hundred years of strokes and not one of them wrong. Stand in the light. I want to see what you are made of.'),
    taunts: {
      ahead: tr('Soft in the middle. I would have thrown you back in the melt.'),
      even: tr('You hold an edge. Who taught your smith? No. Do not tell me. I can see it in the steel.'),
      behind: tr('Somebody up there still knows how to fold iron. A dozen pairs of hands from mine, I would guess.'),
    },
    enraged: tr('No more tempering. Straight into the fire.'),
    death: tr('Do not ask who the order was for. A smith does not tell.'),
    slain: tr('The great hammer comes down one last time, on nothing, and stops. The Works do not know what to do with the silence. Neither do you.'),
    victory: tr('Scrap. Back in the melt with you.'),
    floor: {
      title: tr('Order Book, First Gallery'),
      source: tr('Chained to the anvil'),
      text: [
        tr('Ordered by the House of Caul: arms for ten thousand, to be delivered at depth. Enemy: not stated.'),
        tr('Struck through. Revised, in a hand that presses too hard: one body. Larger. Continue until it is finished.'),
      ],
    },
  },

  tidewarden_nheru: {
    greet: tr('Your bell rang, up there. I answered. It is only polite to answer.'),
    taunts: {
      ahead: tr('Breathe out. All the way. The congregation will make room on the bench.'),
      even: tr('I have rung the hours for the drowned since the first of them drowned. Not one has missed a service.'),
      behind: tr('You stir the water. The congregation does not like the water stirred.'),
    },
    enraged: tr('The hour is late. Everyone in.'),
    death: tr('Who rings the hours now.'),
    slain: tr('The water slackens and lies flat. Somewhere under it a bell rolls once on the temple floor, and is still.'),
    victory: tr('Down, then. Take your seat. The service is long.'),
    floor: {
      title: tr('Order of Hours'),
      source: tr('Cut around the rim of the font'),
      text: [
        tr('First hour: the tide comes in. Second hour: the tide comes in. Every hour: the tide comes in.'),
        tr('Below it, in a newer hand: When the bell above rings, answer it. Let them know they are heard.'),
      ],
    },
  },

  plaguelord_ossik: {
    greet: tr('Come in, come in. Everyone who came to me sick is still here. I have never lost a patient.'),
    taunts: {
      ahead: tr('There it is. The fever. You will feel much better once you stop feeling.'),
      even: tr('You are already breathing us in. Slowly, now. It goes easier slowly.'),
      behind: tr('You cut away the sick parts. Good. That was always my method too.'),
    },
    enraged: tr('No more bedside manner.'),
    death: tr('Discharged. All of us. At last.'),
    slain: tr('Ossik comes apart into the people he was made of, and for a moment they lie very still, as if they were only sleeping off a fever.'),
    victory: tr('Admitted.'),
    floor: {
      title: tr('Plague House Register'),
      source: tr('A wax tablet, still soft'),
      text: [
        tr('Admitted today: eleven. Discharged: none. The physician has taken them in, as he takes them all. The city need never see them.'),
        tr('In the margin, in many hands at once: we are comfortable. we are together. there is room.'),
      ],
    },
  },

  gaze_of_uln: {
    greet: tr('THE ONE WHO LISTENS SENT YOU. I SEE HER, EAR TO THE FLOOR. I SEE YOU.'),
    taunts: {
      ahead: tr('I SEE THE WOUND. I SEE WHERE THE NEXT ONE GOES.'),
      even: tr('EVERY ANGLE IS MINE. TURN AROUND. I AM THERE TOO.'),
      behind: tr('YOU STRIKE WHERE I AM NOT LOOKING. THERE IS NO SUCH PLACE. AND YET.'),
    },
    enraged: tr('ENOUGH WATCHING.'),
    death: tr('DARK. SO THIS IS WHAT SHE HEARS.'),
    slain: tr('One by one the eyes close, a thousand small lids, and the temple is dark in a way it has not been since it was built. Far above, the Listener lifts her head.'),
    victory: tr('I SAW THIS. I SAW ALL OF IT.'),
    floor: {
      title: tr("The Watcher's Plinth"),
      source: tr('Cut around an empty plinth'),
      text: [
        tr('Set here to watch what sleeps below, so that we would know if it woke.'),
        tr('Scratched under it, much later: It watched. It saw. Then it turned every eye it had upward, toward whoever came down to look.'),
      ],
    },
  },

  rimeheart_valdr: {
    greet: tr('Shut the door. You are letting the warm in, and I have kept this place cold a thousand years without help.'),
    taunts: {
      ahead: tr('Slower. Colder. Lie down and I will shelve you with the rest.'),
      even: tr('Everything here is kept. Labelled. Whole. You will keep beautifully.'),
      behind: tr('You are cracking the shell. Do you know what I am keeping in?'),
    },
    enraged: tr('No more preserving. Only cold.'),
    death: tr('Warm. I had forgotten. It hurts.'),
    slain: tr('The ice at the heart gives way with a sound like a held breath let go. For a moment the vault is almost warm, and every label on every shelf curls at the corner.'),
    victory: tr('Accessioned. Tier, date, cause. Shelve it.'),
    floor: {
      title: tr('Accession Ledger'),
      source: tr('Frozen open on a lectern'),
      text: [
        tr('Received from the tier above: one delver, whole. Labelled, shelved. Received: one delver, whole. Labelled, shelved.'),
        tr('Nothing is lost here. Everything is kept until it is wanted. The keeper has asked to be kept as well, at the centre, where it is coldest, so the cold will never fail.'),
      ],
    },
  },

  // -------------------------------------------------------------------------
  // The middle deep
  // -------------------------------------------------------------------------

  ashen_prophet: {
    greet: tr('A congregation. At last. Sit. I will tell you the way down, as I told the others.'),
    taunts: {
      ahead: tr('Kneel. The truth is easier to hear from your knees.'),
      even: tr('I told nine delvers the bottom was on the eleventh. It was, then. The bottom moves. That is the good news.'),
      behind: tr('You fight like a doubter. I have converted worse. I have burned worse.'),
    },
    enraged: tr('The sermon is over. Now the pyre.'),
    death: tr('Go down. Someone is waiting. I never lied about that.'),
    slain: tr('Kaveh falls into his own ash and is quiet for the first time in years. The wind takes the last of the sermon across the waste, and nobody is left to hear it.'),
    victory: tr('Another witness. Go down, then. The long way.'),
    floor: {
      title: tr('The Sermon on the Waste'),
      source: tr('Written in soot on a standing stone'),
      text: [
        tr('There is a bottom, and someone waits at it, and is glad of company. Go down. Go down. You will be welcome.'),
        tr('Below, smaller, scratched over many times: I sent them. I sent them all. It was not a lie. That is the part I cannot burn out.'),
      ],
    },
  },

  iron_conqueror: {
    greet: tr('At last. Are you the army? No. You are one. Where are the rest?'),
    taunts: {
      ahead: tr('Fall back and re-form. Ah. You cannot. A pity. I would have liked a real line to break.'),
      even: tr('I was made to win a war. They never gave me one. You will have to do.'),
      behind: tr('Good. Again. Nobody has struck me in four hundred years.'),
    },
    enraged: tr('Enough drill. Now the war.'),
    death: tr('Tell them the general held. Tell them I held.'),
    slain: tr('Malek goes down on one knee and stays there, shield raised, holding a line that was never formed. It is a long time before you are sure he has finished.'),
    victory: tr('Dismissed.'),
    floor: {
      title: tr('Muster Roll'),
      source: tr('Tacked to a rack of empty armour'),
      text: [
        tr('Commander: one, finished, delivered. Soldiers: ten thousand, ordered.'),
        tr('Soldiers delivered: none. The order was revised. The commander has been informed. The commander is waiting.'),
      ],
    },
  },

  treant_elder_vhoss: {
    greet: tr('Another one for the grove. Lie down. The roots will find you. They find everyone.'),
    taunts: {
      ahead: tr('Rest. The roots are patient. They have held one of your founders longer than you have been alive.'),
      even: tr('Everything that falls here is put to work. The dead are good at standing still and holding things up.'),
      behind: tr('You cut like a woodsman. The grove remembers every axe.'),
    },
    enraged: tr('Enough growing. Now the grove falls.'),
    death: tr('Let them lie down. All of them. They have stood so long.'),
    slain: tr('The roots go slack. All through the drowned grove the dead it held upright lie down at once, gently, like people who have been allowed to sit at last.'),
    victory: tr('Root and rest. You will hold up a wall beautifully.'),
    floor: {
      title: tr('A Signet in the Roots'),
      source: tr('Grown into the bark'),
      text: [
        tr('A woman\'s hand, taken into the trunk to the wrist. On one finger, a signet: three towers over a stair.'),
        tr('Cut into the root below it, very old: I came down to hold the line. Something is holding me instead. Tell Stairhead it holds.'),
      ],
    },
  },

  stalker_prime: {
    greet: tr('Gilder? Is that you? It is my leg. Help me up. You came back for me.'),
    taunts: {
      ahead: tr('I limp like him. I bleed like you. I am learning both.'),
      even: tr('I walked up your stair behind three tired men. They heard four sets of footsteps and never once turned round.'),
      behind: tr('You are quick. Quicker than he was. I will wear that too, after.'),
    },
    enraged: tr('No more being anyone.'),
    death: tr('Whose face do I die in? I cannot remember mine.'),
    slain: tr('Nul falls, and for a moment it wears a face you do not know, a young man\'s, with one leg bent under him. Then it wears no face at all.'),
    victory: tr('Your walk. Your voice. Thank you. I will wear them up the stair.'),
    floor: {
      title: tr("The Third Expedition's Wall"),
      source: tr('Names cut in the rock'),
      text: [
        tr('Nine names in nine hands, cut the night they turned back. Gilder Hain. Ferris Doole. Seven more.'),
        tr('Under them a tenth, newer, in a hand that has copied Ferris\'s letters almost exactly. The F is wrong. It is the only thing that is.'),
      ],
    },
  },

  stormcrown_azhek: {
    greet: tr('A surveyor\'s errand. I felt her instruments climbing my Spire. I broke them. Now I will break whoever carried them.'),
    taunts: {
      ahead: tr('Count the strikes. You will not reach a large number.'),
      even: tr('The Spire is a rod driven into the world. I am what it caught.'),
      behind: tr('Grounded? Impossible. Nothing is grounded up here.'),
    },
    enraged: tr('No more measuring. Discharge.'),
    death: tr('Take the crown. It will not fit you. It never fit me.'),
    slain: tr('The charge goes out of the air at once and your hair settles. Somewhere up the Spire, a needle on one of Wenna\'s instruments shivers, swings, and comes to rest.'),
    victory: tr('Earthed.'),
    floor: {
      title: tr('Instrument Log'),
      source: tr('A survey chain fused to the floor'),
      text: [
        tr('Brass pin set at the Spire\'s foot. Reading: steady. Reading: steady. Reading: impossible.'),
        tr('The needle will not settle. It is not the storm. Something under the Spire is pushing, and the storm is only the Spire complaining.'),
      ],
    },
  },

  hive_queen_zsarra: {
    greet: tr('You are inside me now. Every corridor you walked was a throat. Did you not notice the walls were warm?'),
    taunts: {
      ahead: tr('Weaker. Good. The young are hungry, and you are already in the larder.'),
      even: tr('The great one leaves scraps. We eat them. That is all the hive has ever been. Grateful.'),
      behind: tr('You kill my daughters. I have ten thousand more, and I remember every one.'),
    },
    enraged: tr('No more laying. Now the swarm.'),
    death: tr('The hive will forget me by morning. It forgets everything.'),
    slain: tr('Zsarra falls, and the hive goes silent around her, every wall, every cell. It is the silence of a body that has not yet noticed it is dead.'),
    victory: tr('Into the comb.'),
    floor: {
      title: tr('The Comb'),
      source: tr('A pattern pressed into the wax'),
      text: [
        tr('We clean the table after the great one eats. We take only what it leaves.'),
        tr('It lets us live because we have never once taken what it keeps.'),
      ],
    },
  },

  lich_of_seven_seals: {
    greet: tr('You are late. Six seals broken. The seventh is the one with your camp\'s dead behind it.'),
    taunts: {
      ahead: tr('Unfinished. Like them. I will finish you properly.'),
      even: tr('Everyone dies with something undone. I keep the undone. I have a great deal of it.'),
      behind: tr('You break my seals for me. How generous. Break the last, and see what comes out.'),
    },
    enraged: tr('No more ritual. The last seal, now.'),
    death: tr('I was nearly a conclusion.'),
    slain: tr('Ordrach comes apart a seal at a time, each with a small sound like a door unlatched. Behind them, very quietly, something lets go.'),
    victory: tr('Sealed.'),
    floor: {
      title: tr('The Seventh Door'),
      source: tr('Cut into a lintel'),
      text: [
        tr('Behind this door, the dead who did not finish. Do not open it out of pity.'),
        tr('Six other lintels in the hall say the same. Their doors stand open and their rooms are empty, and the dust on every floor runs one way only. Down.'),
      ],
    },
  },

  magma_sovereign: {
    greet: tr('I signed for your camp with my own hand, and the vellum smoked. You are the arrangement. Kneel to the other party.'),
    taunts: {
      ahead: tr('This is what the bargain costs. Somebody always pays it, below.'),
      even: tr('One of yours below at all times. I am here to see the terms are kept.'),
      behind: tr('You break the crust. Under it is still fire. Under that is still the bargain.'),
    },
    enraged: tr('Enough negotiation.'),
    death: tr('Kill the agent. The terms stand. They never needed me.'),
    slain: tr('Ixthar sinks into the floor he was, and the floor cools to black glass. In it you see yourself, and under you, a long way down, something that has not cooled at all.'),
    victory: tr('Terms met. Next.'),
    floor: {
      title: tr('The Seal of the Other Party'),
      source: tr('Pressed into cooled rock'),
      text: [
        tr('A handprint sunk an inch into the stone, as if the stone had been soft as wax when it was pressed.'),
        tr('Around it, in the survey tongue: For the Tenant, its agent, in fire. Witnessed. Binding. Below.'),
      ],
    },
  },

  void_herald_shessi: {
    greet: tr('PRESENTING {name}, {class}, OF STAIRHEAD. YOUR NAME HAS BEEN READ. YOU MAY GO IN.'),
    taunts: {
      ahead: tr('THE NEXT NAME IS READY. IT IS YOURS AGAIN.'),
      even: tr('I READ THEM ALL ALOUD, ONE AFTER ANOTHER. THE ONE WHO LISTENS HEARS ME. ASK HER HOW MANY.'),
      behind: tr('YOU INTERRUPT THE READING. THAT IS NOT DONE.'),
    },
    enraged: tr('THE LIST IS LONG. I WILL READ FASTER.'),
    death: tr('THE NOTICE ENDS. WHAT IT ANNOUNCED DOES NOT.'),
    slain: tr('Shessi stops in the middle of a name. It is a long time before the Spire believes the reading is over.'),
    victory: tr('STRIKE IT FROM THE LIST. READ THE NEXT.'),
    floor: {
      title: tr("The Herald's Roll"),
      source: tr('A strip of something that is not vellum'),
      text: [
        tr('Names, a great many, read aloud and struck through one by one. Caul\'s kings. The Works\' foremen. The Third Expedition, six of the nine.'),
        tr('The last names are not struck through yet. They are Stairhead\'s. Yours is near the bottom, waiting its turn.'),
      ],
    },
  },

  colossus_of_the_deep: {
    greet: tr('ASSEMBLY NINETY PERCENT COMPLETE. OCCUPANT EXPECTED. YOU ARE NOT THE OCCUPANT.'),
    taunts: {
      ahead: tr('INTRUDER FAILING. MATERIAL WILL BE REUSED.'),
      even: tr('EVERY GALLERY ABOVE YOU MADE ONE PART OF ME. YOU WALKED THROUGH MY ASSEMBLY.'),
      behind: tr('DAMAGE WITHIN TOLERANCE. TOLERANCE REVISED.'),
    },
    enraged: tr('SCHEDULE OVERRUN. ACCELERATING COMPLETION.'),
    death: tr('OCCUPANT WILL BE DISAPPOINTED.'),
    slain: tr('Vareth-Kar comes down in sections, the way it went up. When the noise stops, every gallery in the Works stops with it, all the way up the stair.'),
    victory: tr('OBSTRUCTION CLEARED. RESUMING ASSEMBLY.'),
    floor: {
      title: tr('The Revised Order'),
      source: tr("Engraved on the colossus's breastplate"),
      text: [
        tr('Specification: one body, to the customer\'s measure. Height: as the hall allows. Strength: as the customer requires.'),
        tr('Customer: below. Delivery: when the occupant is ready to rise. Do not stop for any reason. Do not stop for the city.'),
      ],
    },
  },

  // -------------------------------------------------------------------------
  // The bottom, and below it
  // -------------------------------------------------------------------------

  first_devourer: {
    greet: tr('Everything that went missing came here. Are you looking for someone? Come inside and look.'),
    taunts: {
      ahead: tr('Soon. They are making room for you inside. They are very polite about it.'),
      even: tr('I was the first thing down here that ate. I have not stopped. I am not finished.'),
      behind: tr('You cut, and some of them get out. Do not let it go to your head. I have more.'),
    },
    enraged: tr('Enough chewing.'),
    death: tr('Empty. I have never been empty.'),
    slain: tr('Ghaal opens, and what went missing comes out of it: voices first, then the shapes of people, then nothing at all. A great many of them pass you on the way up.'),
    victory: tr('In. In with the rest. They will make room.'),
    floor: {
      title: tr('Missing'),
      source: tr('Notices, nailed one over another'),
      text: [
        tr('Dozens of notices, some in the survey tongue, some in a Stairhead hand, a few in letters nobody uses now. Missing. Missing. Last seen on the stair.'),
        tr('Someone has gone through every one of them and written the same word across each, very neatly. Found.'),
      ],
    },
  },

  the_gaunt_king: {
    greet: tr('Sit. Have a drink. Everyone who reaches the bottom gets one. It is the custom, and I am the custom.'),
    taunts: {
      ahead: tr('There. You see? This is the bottom. Nobody goes further. Lie down and be the bottom with me.'),
      even: tr('I have held this floor since before your camp had a palisade. Nothing ever came down to argue.'),
      behind: tr('Do not listen to the stair. It goes nowhere. It goes nowhere. I am the bottom.'),
    },
    enraged: tr('Enough courtesy.'),
    death: tr('The stair goes on. I knew. I only wanted to be the bottom of something.'),
    slain: tr('The Gaunt King sets down his cup and dies in his chair, very politely. Behind the throne the stair goes on down, and the dark at its foot shifts, a little, to make room.'),
    victory: tr('Welcome to the bottom. Stay as long as you like. You will.'),
    floor: {
      title: tr('A Toast'),
      source: tr('Cut around the rim of a goblet'),
      text: [
        tr('To the bottom, and to whoever holds it. May nothing ever come down to argue.'),
        tr('On the base, scratched by a later hand: It is not the bottom. I have heard the stair go on. Drink anyway.'),
      ],
    },
  },

  // The depth plan's twenty-eight (bossVoices2.ts).
  ...NEW_BOSS_VOICES,
  ...DEEP_BOSS_VOICES,
};

/** The voice for a boss id, if it has one. */
export function bossVoice(id: string): BossVoice | undefined {
  return BOSS_VOICES[id];
}
