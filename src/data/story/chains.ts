/**
 * SLAY — contracts: the hand-written quest lines.
 *
 * Every person in Stairhead has one piece of business below, and six of them
 * a second once the first is done, out in the lands the first lines never
 * reached. Each chain is a short story in three or four contracts. Taking a contract does two things
 * to your next descent at or past its tier: the stair opens on the biome the
 * contract names, and the run carries the contract instead of a board job.
 * Some contracts also name the floor's boss.
 *
 * The chains cross. Renn's gate was tried by Vess's hounds, which Hesk knows
 * about. Kale's Works were quenching steel in the Tenant. The Listener's
 * footsteps were Nul, wearing Ferris. Marrow's wall and Moln's book are the
 * same list. Corvane's lower room holds the charter that explains all of it.
 *
 * Objectives use only what the dungeon really counts: `slay` (any, family:x),
 * `slayElite`, `cleanse` with prop:shrine (every floor of a cleanse run gets
 * shrine rooms; chests are not guaranteed, so they are never a target), `boss`
 * with boss:<id>, and `survive` with zone:any. `tools/check-story.mjs` proves each
 * contract can be finished by generating its runs.
 */

import type { ChainDef } from './types';
import { tr } from '../../core/I18n';

export const CHAINS: ChainDef[] = [
  // =========================================================================
  // Captain Renn — the bell
  // =========================================================================
  {
    id: 'renn',
    name: tr('The Bell'),
    giver: 'renn',
    blurb: tr('Something has been testing the gate from below. Renn wants to know what, and wants it told the bell still rings.'),
    steps: [
      {
        title: tr('Roster Duty'),
        minDepth: 1,
        biome: 'crypt',
        offer: [
          tr('Everyone on my roster does one sweep of the first tier before I believe in them. Go down, kill what is nearest the stair, come back up.'),
          tr('Do that and I write your name in ink instead of chalk.'),
        ],
        flavor: tr('The watch captain wants the first tier thinned before she will trust your name to ink.'),
        brief: tr('Sweep the Ossuary Tiers nearest the stair, then come back up to Captain Renn.'),
        objectives: [{ kind: 'slay', filter: 'any', n: 30, desc: tr('Thin what waits below the stair ({n})') }],
        ready: tr('That will do for Renn. Back up the stair.'),
        turnIn: [
          tr('Thirty, and you walked back up. Ink it is.'),
          tr('Most chalk names never get this far. I rub them off with my thumb. I am glad not to have to rub off yours.'),
        ],
        outcome: tr('Renn wrote your name on the roster in ink.'),
        reward: { gold: 0.8, xp: 0.8 },
      },
      {
        title: tr('Marks on the Gate'),
        minDepth: 2,
        biome: 'caverns',
        offer: [
          tr('Three nights ago the bell rope moved by itself. Nothing came through the gate. Something tried.'),
          tr('It left claw marks on the threshold stone, and they lead down into the Root Deeps. Find what made them. Kill it. Bring me a reason to sleep.'),
        ],
        flavor: tr('Claw marks on the gate stone lead down into the Root Deeps.'),
        brief: tr('Follow the claw marks into the Root Deeps and kill the things that tried the gate.'),
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 14, desc: tr('Hunt the beasts that climbed toward the gate ({n})') },
          { kind: 'slayElite', n: 2, desc: tr('Kill the pack leaders that led them ({n})') },
        ],
        ready: tr('The marks end here. Whatever tried the gate will not try it again. Tell Renn.'),
        turnIn: [
          tr('Beasts. Only beasts. I had hoped for something worse, so it would make sense.'),
          tr('Animals do not climb four hundred steps for no reason. Something sent them up. Something wanted to know if the bell still rings.'),
        ],
        outcome: tr('The things that tried the gate were beasts, sent up by something that wanted to test the bell.'),
        reward: { gold: 1, xp: 1 },
      },
      {
        title: tr('Tell It the Bell Still Rings'),
        minDepth: 4,
        biome: 'crypt',
        boss: 'boneking_gharruth',
        offer: [
          tr('The marks in the crypt lead to a throne room. There is a king on the throne, made of bones he did not start with. He has been sending things up the stair to see whether anyone is watching.'),
          tr('Go and tell him we are. Use whatever words you like.'),
        ],
        flavor: tr('A king of bones has been testing the gate. Renn wants him told that someone is watching.'),
        brief: tr('Go down to the Bone King\'s throne in the Ossuary Tiers and end his testing.'),
        objectives: [{ kind: 'boss', filter: 'boss:boneking_gharruth', n: 1, desc: tr('Answer Gharruth, the Bone King') }],
        ready: tr('The throne is empty. Renn will want to hear it from you.'),
        turnIn: [
          tr('Gharruth. Caul\'s last king, if the old roll is right. He kept the city\'s census and never stopped counting.'),
          tr('The bell has been quiet since you went down. I would like to say that was your doing. I think it was. Here. The watch does not pay much, but it pays.'),
        ],
        outcome: tr('Gharruth, the Bone King, is dead on his throne, and the bell has been quiet since.'),
        reward: { gold: 1.3, xp: 1.2, item: 'rare' },
      },
      {
        title: tr('The Other Bell'),
        minDepth: 6,
        biome: 'sunkenTemple',
        boss: 'tidewarden_nheru',
        offer: [
          tr('The night ours rang, the Listener heard a second bell answer it. Far down, and under water.'),
          tr('The Drowned Sanctum had bells. If one of them is still ringing, someone is ringing it. Find out who. Then stop them.'),
        ],
        flavor: tr('When the camp\'s bell rang, a drowned bell answered it from the Sanctum.'),
        brief: tr('Find the drowned bell in the Sanctum, still its shrines, and silence whatever rings it.'),
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: tr('Still the Sanctum\'s bell-shrines ({n})') },
          { kind: 'boss', filter: 'boss:tidewarden_nheru', n: 1, desc: tr('Silence Nheru, who rings the drowned bell') },
        ],
        ready: tr('The drowned bell is still. Renn should know her bell has no answer now.'),
        turnIn: [
          tr('Nheru. The tide that rang the Sanctum\'s hours, still keeping them for a congregation that drowned.'),
          tr('So ours rang, and theirs answered, and the thing in between heard both. I will not sleep better for knowing it. I will sleep. Thank you.'),
          tr('Your name stays in ink. You have the bell\'s protection, for what it is worth. It is worth eleven guards and a rope.'),
        ],
        outcome: tr('The drowned bell is silent. Stairhead\'s bell rings alone now, and nothing answers it.'),
        reward: { gold: 1.5, xp: 1.4, item: 'rare' },
      },
    ],
  },

  // =========================================================================
  // Ordrun Kale — the order book
  // =========================================================================
  {
    id: 'kale',
    name: tr('The Order Book'),
    giver: 'kale',
    blurb: tr('Kale wants proof the Cindergate Works still run, and the name of whoever placed their order.'),
    steps: [
      {
        title: tr('Still Warm'),
        minDepth: 2,
        biome: 'foundry',
        offer: [
          tr('The Works are under the crypt. Furnaces, rails, a line that never stopped. I want to know if it is still running, or if that is a story drunks tell.'),
          tr('Put down whoever is still working it. Count them. Bring the count back. I will know from the number whether you saw the real thing.'),
        ],
        flavor: tr('Kale wants to know whether the Cindergate Works still run.'),
        brief: tr('Go into the Cindergate Works and put down the shift still working the line.'),
        objectives: [{ kind: 'slay', filter: 'family:humanoid', n: 14, desc: tr('Put down the shift still working the line ({n})') }],
        ready: tr('The line is running. Tell Kale it is still warm.'),
        turnIn: [
          tr('Fourteen. Still on shift after four hundred years, with nobody left to pay them.'),
          tr('I have spent my life trying to make iron that good. They do it in their sleep. Here. You have earned better steel than mine, so take some coin and go and find it.'),
        ],
        outcome: tr('The Cindergate Works are still running, and Kale was quieter than usual about it.'),
        reward: { gold: 1, xp: 1 },
      },
      {
        title: tr('The Foreman'),
        minDepth: 5,
        biome: 'foundry',
        boss: 'forgefather_hurn',
        offer: [
          tr('Somebody runs that line. Something that size does not run itself. The Works were built with a foreman\'s bell on every gallery.'),
          tr('Go to the great hammer. Whoever swings it will know who placed the order. Ask. Then do what you have to.'),
        ],
        flavor: tr('A great hammer has not stopped falling in the Works for four hundred years.'),
        brief: tr('Find the great hammer in the Works and put its smith down.'),
        objectives: [{ kind: 'boss', filter: 'boss:forgefather_hurn', n: 1, desc: tr('Stop Hurn, the Forgefather') }],
        ready: tr('The hammer has stopped. Kale will want to hear how it sounded.'),
        turnIn: [
          tr('Hurn. My master\'s master\'s master learned from him. Every smith above ground owes something to that arm.'),
          tr('Did he say who the order was for? No. He would not. A good smith does not talk about the customer.'),
          tr('Take this. I made it the way he taught, three hands removed. It is not as good as his. Nothing is.'),
        ],
        outcome: tr('Hurn the Forgefather is dead at his anvil. He did not say who the order was for.'),
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: tr('The First Finished Order'),
        minDepth: 9,
        biome: 'foundry',
        boss: 'iron_conqueror',
        offer: [
          tr('I found the page in an old copy of the order book. The Works finished one thing, once. A general. Full plate. No visor slit.'),
          tr('It was meant to lead an army against what lives below. The army was never made. The general is still waiting for it, somewhere on the lower galleries.'),
          tr('End it. It has waited long enough for a war that is not coming.'),
        ],
        flavor: tr('The only order the Works ever finished is still waiting for its army.'),
        brief: tr('Find Malek, the Iron Conqueror, on the Works\' lower galleries and end his wait.'),
        objectives: [
          { kind: 'slayElite', n: 3, desc: tr('Cut down the officers of an army never made ({n})') },
          { kind: 'boss', filter: 'boss:iron_conqueror', n: 1, desc: tr('Defeat Malek, the Iron Conqueror') },
        ],
        ready: tr('The general is down. Kale should hear that the order was finished at last.'),
        turnIn: [
          tr('Malek. The Works\' masterpiece. They built a general and had no war left to give him.'),
          tr('My arms. You want to know. All right. I tried to quench a blade in what runs down the Works\' lowest channel. It is not water and it is not oil. It took the skin to the elbow, and it gave the steel an edge I have never matched.'),
          tr('It runs off the Tenant. The Works were quenching their weapons in the thing they were built to fight.'),
        ],
        outcome: tr('Kale told you about his arms: deep steel is quenched in what runs off the Tenant.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('What They Were Building'),
        minDepth: 20,
        biome: 'foundry',
        boss: 'colossus_of_the_deep',
        offer: [
          tr('The order was revised. You saw it. Someone changed it, in a hand that is not a clerk\'s, to something larger.'),
          tr('The Works have been building it ever since. Every gallery you have walked was making a part. Go down to where the parts are joined, and unmake it before it is finished.'),
        ],
        flavor: tr('The Works have been building one last thing, to a revised order.'),
        brief: tr('Go down to the deep foundry and break the colossus the Works have been building.'),
        objectives: [
          { kind: 'slay', filter: 'family:construct', n: 24, desc: tr('Break the Works\' last shift ({n})') },
          { kind: 'boss', filter: 'boss:colossus_of_the_deep', n: 1, desc: tr('Unmake Vareth-Kar before it is finished') },
        ],
        ready: tr('The Works have stopped. All of them. Tell Kale.'),
        turnIn: [
          tr('Stopped. All of it. I would have liked to hear that. The silence, I mean.'),
          tr('It was never a weapon against the Tenant, was it. They were building it a body.'),
          tr('Here. The last thing I will make from deep steel. I am done with it. Iron from the hill is good enough for me now.'),
        ],
        outcome: tr('The Cindergate Works are silent. What they were building was a body, and it is broken.'),
        reward: { gold: 2, xp: 1.8, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Sister Vell — nineteen
  // =========================================================================
  {
    id: 'vell',
    name: tr('Nineteen'),
    giver: 'vell',
    blurb: tr('Sister Vell wants to know what became of the nineteen people she could not save.'),
    steps: [
      {
        title: tr('Orla Pike'),
        minDepth: 3,
        biome: 'sunkenTemple',
        offer: [
          tr('The first of my nineteen was a girl called Orla Pike. She went into the Drowned Sanctum for water clean enough to drink. The water is very clean down there. That was the trouble.'),
          tr('The congregation took her in. I would like to know she did not stay. Go and see.'),
        ],
        flavor: tr('Orla Pike went into the Drowned Sanctum for clean water and did not come back.'),
        brief: tr('Search the Drowned Sanctum for Orla Pike among its congregation.'),
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 10, desc: tr('Go through the drowned congregation ({n})') },
          { kind: 'cleanse', filter: 'prop:shrine', n: 1, desc: tr('Pray at a Sanctum shrine, as Orla would have ({n})') },
        ],
        ready: tr('She was not among them. Tell Vell what you found instead.'),
        turnIn: [
          tr('Not among them. Then she did not stay. That is something.'),
          tr('Prayers cut into the shrine stone, newer than the rest, in a careful hand. Orla wrote like that. She was praying for whoever came next.'),
          tr('I will put a second line under her name. It is shorter than the first.'),
        ],
        outcome: tr('Orla Pike was not among the drowned. She left a prayer for whoever came after her.'),
        reward: { gold: 1, xp: 1 },
      },
      {
        title: tr('Light on the Left Foot'),
        minDepth: 5,
        biome: 'hive',
        boss: 'broodmother_saelith',
        offer: [
          tr('The Listener hears footsteps under the camp some nights, walking the old tunnels. One of them walks like Orla. Light on the left foot. She broke the right one as a child.'),
          tr('The tunnels come up from the hive. Something there keeps what it takes. Go and see what it kept.'),
        ],
        flavor: tr('Something under the camp walks like Orla Pike.'),
        brief: tr('Go into the Chitin Warrens and find what the brood mother keeps.'),
        objectives: [
          { kind: 'slay', filter: 'family:insect', n: 20, desc: tr('Cut through the brood ({n})') },
          { kind: 'boss', filter: 'boss:broodmother_saelith', n: 1, desc: tr('Kill Sae-lith, the Brood Mother') },
        ],
        ready: tr('The brood mother is dead, and what she kept is not Orla. Tell Vell.'),
        turnIn: [
          tr('Not her. Of course not her.'),
          tr('Boots in the nursery, dozens, every pair walked in, every pair stitched the same way on the right heel. Something has been wearing my nineteen\'s things and learning how they walked.'),
          tr('Sit down. I need to write for a while, and I would rather not be alone while I do it.'),
        ],
        outcome: tr('The brood kept the boots of the lost, and something has been learning how they walked.'),
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: tr('Kept Fresh'),
        minDepth: 8,
        biome: 'frostvault',
        boss: 'rimeheart_valdr',
        offer: [
          tr('The Rime Archive keeps what it is given. Whole. If any of my nineteen are anywhere in one piece, they are there, in the ice, waiting for a thaw.'),
          tr('Break them out if you have to. Read the labels. If you find a name from my list, do not try to thaw it. Only tell me it is there.'),
        ],
        flavor: tr('The Rime Archive keeps everything whole. Vell hopes it kept some of her nineteen.'),
        brief: tr('Read the labels on the Archive\'s kept dead, and face the heart of the cold.'),
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 12, desc: tr('Break the ice off the kept dead and read their labels ({n})') },
          { kind: 'boss', filter: 'boss:rimeheart_valdr', n: 1, desc: tr('Break Valdr, the Rimeheart') },
        ],
        ready: tr('You have read every label you could reach. Vell will want them all.'),
        turnIn: [
          tr('Seven. Seven of my nineteen, in the ice, labelled in a clerk\'s hand, filed by the tier they were taken from.'),
          tr('Filed. Somebody keeps my failures in better order than I do.'),
          tr('Thank you. That is the worst kindness anyone has done me, and I mean it as thanks.'),
        ],
        outcome: tr('Seven of Vell\'s nineteen are in the Rime Archive, labelled and filed.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('Nineteen'),
        minDepth: 15,
        biome: 'crypt',
        boss: 'lich_of_seven_seals',
        offer: [
          tr('The rest of them are under seal. The Listener hears them in the crypt, very deep, behind seven doors and a thing that has been breaking the doors one at a time.'),
          tr('Ordrach. He keeps the dead who were not finished. Mine were not finished. Break his seals before he does, and let them go.'),
        ],
        flavor: tr('Ordrach keeps the unfinished dead behind seven seals, and Vell\'s are among them.'),
        brief: tr('Break Ordrach\'s seals in the deep crypt and let Vell\'s nineteen go.'),
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 3, desc: tr('Break the seals that hold the unfinished ({n})') },
          { kind: 'boss', filter: 'boss:lich_of_seven_seals', n: 1, desc: tr('Destroy Ordrach, Lich of the Seven Seals') },
        ],
        ready: tr('The seals are broken and the crypt is quiet. Vell should hear it from you.'),
        turnIn: [
          tr('The Listener says the crypt went quiet all at once last night, like a held breath let go. Nineteen of them, she thinks. She counted.'),
          tr('I was going to tear the page out. I am not. I am going to draw a line under all of it. That is what the page is for.'),
          tr('Take this. The last tincture made to the order\'s own recipe. Drink it when you need to come back up.'),
        ],
        outcome: tr('Vell\'s nineteen are released. She drew one line under the whole page.'),
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Old Marrow — cut too early
  // =========================================================================
  {
    id: 'marrow',
    name: tr('Cut Too Early'),
    giver: 'marrow',
    blurb: tr('Names are appearing on Marrow\'s wall before the people they belong to have died.'),
    steps: [
      {
        title: tr('Tobin Reave'),
        minDepth: 4,
        biome: 'crypt',
        offer: [
          tr('There is a name on my wall I did not cut. Tobin Reave. He went down yesterday morning, alive and loud about it.'),
          tr('The cut is clean. Better than mine, if I am honest, and I am not happy about that. Go down and find Tobin. Tell him to come up and argue with his name.'),
        ],
        flavor: tr('A name appeared on the memorial before its owner had died.'),
        brief: tr('Search the Ossuary Tiers for Tobin Reave.'),
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 20, desc: tr('Turn over the dead of the tiers, looking for Tobin ({n})') },
          { kind: 'slayElite', n: 2, desc: tr('Kill what holds the lower tiers ({n})') },
        ],
        ready: tr('Tobin is not coming back. Marrow should know the name was right.'),
        turnIn: [
          tr('Not coming back. So the name was right, a day early.'),
          tr('I do not like being right ahead of time. I like it less that I was not the one who was right.'),
          tr('Here. Tobin had an account with Hesk. She says it is mine to pass on. She also says to tell you she is not sentimental.'),
        ],
        outcome: tr('Tobin Reave\'s name was cut a day before he died, by a hand that was not Marrow\'s.'),
        reward: { gold: 1, xp: 1 },
      },
      {
        title: tr('Who Holds the Chisel'),
        minDepth: 6,
        biome: 'crypt',
        boss: 'archivist_moln',
        offer: [
          tr('Somebody down there is cutting names. Somebody with a good hand and a great deal of time.'),
          tr('The Listener says there is a hall below the ossuary where every book is a name, and a keeper who writes in them. Whoever keeps the books keeps a chisel too. Go and take it off him.'),
        ],
        flavor: tr('Somewhere below, a hall of names is being kept up to date.'),
        brief: tr('Find the hall of names below the ossuary and silence its keeper.'),
        objectives: [{ kind: 'boss', filter: 'boss:archivist_moln', n: 1, desc: tr('Close the book on Moln, the Archivist') }],
        ready: tr('The Archivist is done. His last book lies open on the floor. Marrow should hear what is in it.'),
        turnIn: [
          tr('Moln. A record-keeper, then. One of Caul\'s. They counted everything.'),
          tr('His last book was open, you say, and the page had the camp\'s names on it. All of us. In order of when.'),
          tr('I am not going to ask where my name was. Do not tell me. I have a wall to keep.'),
        ],
        outcome: tr('Moln the Archivist kept a book of Stairhead\'s names, in the order they would be taken.'),
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: tr("The Archive's Copy"),
        minDepth: 10,
        biome: 'frostvault',
        offer: [
          tr('Moln kept a book. The Rime Archive keeps a copy of everything. If there is a copy of his book anywhere, it is there, frozen.'),
          tr('I want to read it. I want to know whether the order can be changed. Bring me the pages.'),
        ],
        flavor: tr('The Rime Archive may hold a frozen copy of the book of names.'),
        brief: tr('Take the copied pages from the wardens of the Rime Archive.'),
        objectives: [
          { kind: 'slayElite', n: 3, desc: tr('Take the copied pages from the Archive\'s wardens ({n})') },
          { kind: 'slay', filter: 'family:undead', n: 16, desc: tr('Get past what guards the shelves ({n})') },
        ],
        ready: tr('You have the pages. They are cold enough to burn. Take them to Marrow.'),
        turnIn: [
          tr('Give them here. Gently. Ice holds ink better than stone holds a chisel.'),
          tr('The copy is not the same as Moln\'s book. Some names have moved, down the page, later. A few have been crossed out entirely.'),
          tr('It can be changed. The order can be changed, by going down. Every name that moved, somebody went deeper than the book expected.'),
        ],
        outcome: tr('The copied pages show the order of names can be changed, by going deeper than expected.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('Your Name'),
        minDepth: 18,
        biome: 'voidspire',
        boss: 'void_herald_shessi',
        offer: [
          tr('Your name is on my wall. I did not cut it. It appeared the night you came back from the Spire, very small, at the bottom.'),
          tr('There is a thing in the Spire that announces. The Listener hears it reading names aloud, one after another, like a herald at a door. Go and make it stop reading yours.'),
        ],
        flavor: tr('Something in the Spire is reading names aloud, and yours is next.'),
        brief: tr('Climb into the Hollow Spire and silence the herald that reads the names.'),
        objectives: [
          { kind: 'slay', filter: 'family:aberration', n: 20, desc: tr('Cut through the herald\'s audience ({n})') },
          { kind: 'boss', filter: 'boss:void_herald_shessi', n: 1, desc: tr('Silence Shessi, Herald of the Hollow') },
        ],
        ready: tr('The herald is silent. Marrow will want to look at the wall with you.'),
        turnIn: [
          tr('Come here. Look. Your name is gone. The stone is smooth where it was, smoother than I can polish.'),
          tr('I have decided something. Every name on this wall, I am cutting again, deeper. An inch. Let the deep try to fill that.'),
          tr('Take the old chisel. I will not need it. I have bought a heavier one.'),
        ],
        outcome: tr('Your name is gone from the wall, and Marrow is recutting every name an inch deep.'),
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Gilder Hain — the eleventh
  // =========================================================================
  {
    id: 'gilder',
    name: tr('The Eleventh'),
    giver: 'gilder',
    blurb: tr('Gilder Hain left a man on the sixth tier eleven years ago and has never stopped going back for him.'),
    steps: [
      {
        title: tr("Ferris's Knife"),
        minDepth: 6,
        biome: 'caverns',
        offer: [
          tr('We left Ferris on the sixth, where the roots come through. He had a knife with a bone grip, his father\'s. If the knife is still there, so is he, more or less.'),
          tr('I cannot go. Do not ask me to go. Go for me.'),
        ],
        flavor: tr('Gilder left Ferris on the sixth tier, where the roots come through.'),
        brief: tr('Search the Root Deeps for Ferris and his bone-gripped knife.'),
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 14, desc: tr('Clear the root halls where Ferris was left ({n})') },
          { kind: 'slayElite', n: 2, desc: tr('Kill what nests in the roots ({n})') },
        ],
        ready: tr('You found the knife. Not Ferris. Gilder will want it anyway.'),
        turnIn: [
          tr('That is his. That is the grip. Where was it?'),
          tr('Driven into the root wall up to the hilt, pointing down. Pointing down. He was showing us which way he went.'),
          tr('He did not die there. He went on, with a broken leg. Why would he go on?'),
        ],
        outcome: tr('Ferris\'s knife was driven into the root wall, pointing down. He did not die where he was left.'),
        reward: { gold: 1.2, xp: 1.2 },
      },
      {
        title: tr('The Way We Went'),
        minDepth: 10,
        biome: 'ashwaste',
        boss: 'ashen_prophet',
        offer: [
          tr('There was a preacher in the Cinderfields. Kaveh. He told us the way down. He told us gladly, which should have warned us.'),
          tr('If Ferris went on, he went the way Kaveh pointed. Go and ask the preacher where he sent a man with a broken leg.'),
        ],
        flavor: tr('A preacher in the Cinderfields told the Third Expedition the way down.'),
        brief: tr('Find Kaveh, the Ashen Prophet, in the Cinderfields and learn where he sent Ferris.'),
        objectives: [
          { kind: 'slay', filter: 'family:demon', n: 14, desc: tr('Get through Kaveh\'s congregation ({n})') },
          { kind: 'boss', filter: 'boss:ashen_prophet', n: 1, desc: tr('Silence Kaveh, the Ashen Prophet') },
        ],
        ready: tr('Kaveh is silent, and his sermon notes name the eleventh tier. Tell Gilder.'),
        turnIn: [
          tr('The eleventh. Of course it was. He sent everyone to the eleventh.'),
          tr('He told us the bottom was there. He told us somebody was waiting there who would be glad of the company. We thought it was a way of speaking.'),
          tr('Ferris believed him. Ferris always believed the man with the loudest voice.'),
        ],
        outcome: tr('Kaveh sent every delver to the eleventh tier, promising company at the bottom.'),
        reward: { gold: 1.3, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('The Eleventh'),
        minDepth: 11,
        biome: 'caverns',
        boss: 'stalker_prime',
        offer: [
          tr('Do not go to the eleventh.'),
          tr('Go to the eleventh. Find our camp. Find the wall. Find out what happened to Ferris. Then come back and tell me, and I will stop drinking or start properly. One of the two.'),
        ],
        flavor: tr('The Third Expedition turned back at the eleventh tier. Ferris did not.'),
        brief: tr('Go to the eleventh tier, find the Third Expedition\'s camp, and outlast what waits there.'),
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 120, desc: tr('Hold the eleventh as long as the Third Expedition did ({n}s)') },
          { kind: 'boss', filter: 'boss:stalker_prime', n: 1, desc: tr('Kill Nul, the Stalker Prime') },
        ],
        ready: tr('You held the eleventh and lived, and you know what happened to Ferris. Gilder is waiting.'),
        turnIn: [
          tr('Tell me.'),
          tr('It wore him. Nul. It took his shape and his limp and walked up the stair behind us, a fourth set of footsteps, and we let it in, because it walked like Ferris.'),
          tr('So it has been up here all along. Walking the palisade at night. Learning. And you killed it.'),
          tr('Good. Good. I am going to have one drink, for Ferris, and then I am going to sleep. Take this. It was his. It is no use to me now.'),
        ],
        outcome: tr('Nul wore Ferris\'s shape up the stair. It was the fourth set of footsteps. It is dead now.'),
        reward: { gold: 1.6, xp: 1.5, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // The Listener — the Tenant
  // =========================================================================
  {
    id: 'listener',
    name: tr('The Tenant'),
    giver: 'listener',
    blurb: tr('The Listener wants you to go where she cannot hear, and tell her what is there.'),
    steps: [
      {
        title: tr('Close Its Eyes'),
        minDepth: 7,
        biome: 'sunkenTemple',
        boss: 'gaze_of_uln',
        offer: [
          tr('Something in the Sanctum listens the way I do. It hears further. When I try to listen past it, it looks back.'),
          tr('Close its eyes, so I can hear what is under it.'),
        ],
        flavor: tr('Something in the Sanctum looks back whenever the Listener listens.'),
        brief: tr('Go into the Drowned Sanctum and close Uln\'s thousand eyes.'),
        objectives: [{ kind: 'boss', filter: 'boss:gaze_of_uln', n: 1, desc: tr('Blind Uln, the Thousand Gaze') }],
        ready: tr('The gaze is shut. The Listener will be able to hear further now.'),
        turnIn: [
          tr('Oh. Oh, it is loud.'),
          tr('Under the Sanctum there is a slow sound, like breathing, if a breath took a year. That is it. That is the Tenant, asleep. I have been listening to its dreams and thinking they were the deep.'),
          tr('Thank you. I think. Come back when I have listened longer.'),
        ],
        outcome: tr('With Uln blind, the Listener can hear the Tenant breathing, very slowly, in its sleep.'),
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: tr('Put Your Hand on the Nail'),
        minDepth: 14,
        biome: 'voidspire',
        offer: [
          tr('Go to the Spire. Put your hand on it. Then come back and tell me whether it is moving.'),
          tr('Do not let anything stop you on the way. Things will try.'),
        ],
        flavor: tr('The Listener wants to know whether the Spire is moving.'),
        brief: tr('Reach the heart of the Hollow Spire and lay a hand on its stone.'),
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: tr('Lay a hand on the Spire\'s heartstones ({n})') },
          { kind: 'slay', filter: 'family:aberration', n: 20, desc: tr('Clear the things that guard the nail ({n})') },
        ],
        ready: tr('The Spire is moving. Upward. Tell the Listener.'),
        turnIn: [
          tr('Upward. A finger\'s width a year, Wenna says. You felt it move under your hand.'),
          tr('When it comes out, there will be nothing holding it down except whoever is deepest.'),
          tr('Do not look at me like that. You knew. You have known since the crypt.'),
        ],
        outcome: tr('The Spire is working loose. When it comes free, only the deepest delver will hold the Tenant down.'),
        reward: { gold: 1.5, xp: 1.4, item: 'rare' },
      },
      {
        title: tr('The Bottom'),
        minDepth: 25,
        biome: 'voidspire',
        boss: 'the_gaunt_king',
        offer: [
          tr('There is something on the twenty-fifth that calls itself the bottom. It is lying. I can hear the stair go on past it.'),
          tr('Go and make it stop lying. Everyone who comes after you needs to know the stair goes on.'),
        ],
        flavor: tr('A king on the twenty-fifth tier says he is the bottom of the deep.'),
        brief: tr('Go down to the twenty-fifth tier and prove the Gaunt King is not the bottom.'),
        objectives: [{ kind: 'boss', filter: 'boss:the_gaunt_king', n: 1, desc: tr('Defeat the Gaunt King, Last Thing in the Deep') }],
        ready: tr('He was not the last thing. The stair goes on. The Listener heard it first; now you have seen it.'),
        turnIn: [
          tr('I heard him fall. And then I heard the bottom move. Two tiers, down, the moment he stopped.'),
          tr('It moves down to make room for you. Do you understand? It is not running. It is being a good host.'),
          tr('Go on down. I will listen for you the whole way.'),
        ],
        outcome: tr('The Gaunt King was not the bottom. The bottom moved two tiers down the moment he fell.'),
        reward: { gold: 2, xp: 1.8, item: 'unique' },
      },
      {
        title: tr('Making Room'),
        minDepth: 40,
        biome: 'voidspire',
        boss: 'first_devourer',
        offer: [
          tr('It is moving things to make room for you. Old things. Some of them are hungry, and it has let them loose to clear the way.'),
          tr('The oldest is the first thing that ever ate down here. Everything that went missing is inside it, still awake. I can hear them. Let them out.'),
        ],
        flavor: tr('Everything that ever went missing below is inside the First Devourer, still awake.'),
        brief: tr('Go down past the fortieth tier and open the First Devourer.'),
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 150, desc: tr('Hold your ground while the deep makes room ({n}s)') },
          { kind: 'boss', filter: 'boss:first_devourer', n: 1, desc: tr('Open Ghaal, the First Devourer') },
        ],
        ready: tr('Ghaal is open, and everything in it is quiet now. The Listener will have heard.'),
        turnIn: [
          tr('I heard them go. Hundreds. Some of them said thank you. Some of them said your name, the way you say the name of someone you have been waiting for.'),
          tr('The Tenant did not try to stop you. It moved aside.'),
          tr('There is nothing more I can ask of you. Everything below here I can only listen to. Go and be the deepest one. I will be here.'),
        ],
        outcome: tr('Ghaal is opened and its missing are free. The Tenant moved aside to let you do it.'),
        reward: { gold: 2.4, xp: 2, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Corvane — the lower room
  // =========================================================================
  {
    id: 'corvane',
    name: tr('The Lower Room'),
    giver: 'corvane',
    blurb: tr('Corvane will not talk about the lower room. He will talk about money, and that is how it starts.'),
    steps: [
      {
        title: tr('Estates'),
        minDepth: 3,
        biome: 'crypt',
        offer: [
          tr('Two hundred estates on my books, nine claimed. The rest are down there, in packs, in chests, on the people who died holding them.'),
          tr('Recover what the dead still hold. It is not theft when the account is ours. I checked.'),
        ],
        flavor: tr('Corvane wants the estates of dead delvers recovered from below.'),
        brief: tr('Recover the estates the dead still carry in the Ossuary Tiers.'),
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 16, desc: tr('Turn over the dead who still carry their estates ({n})') },
          { kind: 'slayElite', n: 2, desc: tr('Take back what the strongest of them hold ({n})') },
        ],
        ready: tr('The estates are recovered. Corvane will want an inventory.'),
        turnIn: [
          tr('Excellent. Rope, oil, rations, one will. The will is always the newest item. I will file it.'),
          tr('One of these packs carries a city seal. Caul\'s. That is not a delver\'s estate. That is a founder\'s.'),
          tr('Interesting. Statistically, very interesting. Take your commission.'),
        ],
        outcome: tr('Among the estates of the dead was a pack with Caul\'s seal: a founder\'s.'),
        reward: { gold: 1.3, xp: 0.9 },
      },
      {
        title: tr('The Third Signature'),
        minDepth: 10,
        biome: 'sunkenTemple',
        boss: 'treant_elder_vhoss',
        offer: [
          tr('Stairhead had three founders. Two are buried under the vault, which is the safest place in the world to be buried. The third went down to make sure the arrangement held.'),
          tr('The Listener says something in the Sanctum\'s drowned grove has put every corpse there to work, and one of them still wears a signet ring. I want the ring.'),
        ],
        flavor: tr('One of Stairhead\'s three founders went below to make sure the arrangement held.'),
        brief: tr('Find the founder in the Sanctum\'s drowned grove and recover her ring.'),
        objectives: [
          { kind: 'slay', filter: 'family:humanoid', n: 14, desc: tr('Cut down the grove\'s drowned workers ({n})') },
          { kind: 'boss', filter: 'boss:treant_elder_vhoss', n: 1, desc: tr('Fell Vhoss, Elder of the Drowned Grove') },
        ],
        ready: tr('You have the signet. Corvane will want it in his hand.'),
        turnIn: [
          tr('Aldis Rook. The third signature. She went down to hold the line herself, and the roots held her instead.'),
          tr('This ring opens the lower room. I have the other two. I have never had all three.'),
          tr('Come back when I have had time to decide whether to use it.'),
        ],
        outcome: tr('You recovered Aldis Rook\'s ring, the third key to the lower room.'),
        reward: { gold: 1.5, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('The Countersignature'),
        minDepth: 16,
        biome: 'ashwaste',
        boss: 'magma_sovereign',
        offer: [
          tr('I opened the lower room. I read what is in it. I wish I had not, and I need you to finish the reading for me.'),
          tr('The charter has two signatures. Ours, and a mark in something that was still hot when it was pressed into the vellum. The other party\'s agent. It came up from the Cinderfields to sign, and went back down. Find it.'),
        ],
        flavor: tr('Stairhead\'s charter was countersigned by something from the Cinderfields.'),
        brief: tr('Find the thing in the Cinderfields that countersigned the charter, and end it.'),
        objectives: [
          { kind: 'slay', filter: 'family:demon', n: 18, desc: tr('Get through the countersigner\'s court ({n})') },
          { kind: 'boss', filter: 'boss:magma_sovereign', n: 1, desc: tr('Unmake Ixthar, the Magma Sovereign') },
        ],
        ready: tr('The countersigner is dead. Corvane should know the charter has one living party left.'),
        turnIn: [
          tr('Ixthar. A sovereign. They sent a sovereign to sign with a camp of two hundred. That tells you what we were worth to them.'),
          tr('Here it is. The charter. I will read it once more and then never again. "One of ours below at all times, and it stays below us. For Stairhead, three founders. For the Tenant, its agent, in fire."'),
          tr('The agent is dead. The bargain is not. It never needed the paper. It only ever needed someone below. Statistically, that has always been you.'),
        ],
        outcome: tr('You read the charter: one of Stairhead\'s below at all times, and the Tenant stays below them.'),
        reward: { gold: 2, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Wenna Torr — the survey
  // =========================================================================
  {
    id: 'wenna',
    name: tr('The Survey'),
    giver: 'wenna',
    blurb: tr('Wenna Torr wants one honest measurement of the deep. The deep keeps declining to give her one.'),
    steps: [
      {
        title: tr('Benchmarks'),
        minDepth: 2,
        biome: 'caverns',
        offer: [
          tr('I need a benchmark. A fixed point to measure from. The shrines are the only things down there that do not move, as far as I can tell.'),
          tr('Clear the tier so I can trust the reading, and touch a shrine for me. I will know the depth from what it does to you.'),
        ],
        flavor: tr('The surveyor needs one fixed point in the Root Deeps.'),
        brief: tr('Clear the Root Deeps and set a benchmark at a shrine.'),
        objectives: [
          { kind: 'slay', filter: 'any', n: 35, desc: tr('Clear the tier for a clean reading ({n})') },
          { kind: 'cleanse', filter: 'prop:shrine', n: 1, desc: tr('Set a benchmark at a shrine ({n})') },
        ],
        ready: tr('Benchmark set. Wenna will want the numbers while they are fresh.'),
        turnIn: [
          tr('Lovely. The shrine reads as the second tier from the top and the ninth from the bottom.'),
          tr('There are not eleven tiers. There are not nine. The shrine is counting from a bottom that has since moved.'),
          tr('This is the best day I have had in years. Here. Survey pay. Do not tell the council how much.'),
        ],
        outcome: tr('Your benchmark counts from a bottom that has since moved.'),
        reward: { gold: 1, xp: 1 },
      },
      {
        title: tr('Ninety Down, a Hundred and Forty Back'),
        minDepth: 5,
        biome: 'hive',
        offer: [
          tr('In the warrens a corridor measures ninety feet going down and a hundred and forty coming back. I want to know where the other fifty go.'),
          tr('Stay down there long enough for a proper reading. Things will object. Let them.'),
        ],
        flavor: tr('A corridor in the warrens measures longer on the way back.'),
        brief: tr('Hold out in the Chitin Warrens long enough for a proper reading.'),
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 90, desc: tr('Stay long enough for a reading ({n}s)') },
          { kind: 'slay', filter: 'family:insect', n: 16, desc: tr('Clear what objects to the survey ({n})') },
        ],
        ready: tr('Reading taken. It is the strangest number you have ever written down. Wenna will love it.'),
        turnIn: [
          tr('Fifty feet. Every time. And it is not distance, it is time. The corridor is older on the way back.'),
          tr('The deep is not a place, exactly. It is a place that is being kept, and keeping takes time, and the time has to come from somewhere.'),
          tr('I am going to need a bigger notebook.'),
        ],
        outcome: tr('The extra fifty feet are time: the deep is being kept, and keeping costs it.'),
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: tr('The Lean of the Spire'),
        minDepth: 14,
        biome: 'voidspire',
        boss: 'stormcrown_azhek',
        offer: [
          tr('I measured the Spire\'s lean against the old survey. It is moving, a finger\'s width a year. I want a measurement from inside it.'),
          tr('There is a storm up the Spire that throws off every instrument I send. It wears a crown, apparently. Take the crown off.'),
        ],
        flavor: tr('A storm inside the Spire throws off every survey instrument.'),
        brief: tr('Climb the Hollow Spire and uncrown the storm that spoils the survey.'),
        objectives: [
          { kind: 'slay', filter: 'family:elemental', n: 12, desc: tr('Ground the storm\'s lesser charges ({n})') },
          { kind: 'boss', filter: 'boss:stormcrown_azhek', n: 1, desc: tr('Uncrown Azhek, the Stormcrown') },
        ],
        ready: tr('The storm is down and the needle holds steady. Wenna will want the reading.'),
        turnIn: [
          tr('Steady at last. And the reading is upward. The Spire is being pushed out from below.'),
          tr('A nail does not come out by itself. Something is pressing on the point.'),
          tr('You are the first person to give me a measurement I believe. I am putting your name on the survey. In ink. Renn lent me some.'),
        ],
        outcome: tr('The Spire is being pushed out from below, a finger\'s width a year.'),
        reward: { gold: 1.5, xp: 1.4, item: 'rare' },
      },
    ],
  },

  // =========================================================================
  // Hesk — bad debts
  // =========================================================================
  {
    id: 'hesk',
    name: tr('Bad Debts'),
    giver: 'hesk',
    blurb: tr('Hesk is owed money by things that never meant to pay.'),
    steps: [
      {
        title: tr('Rope'),
        minDepth: 1,
        biome: 'caverns',
        offer: [
          tr('Delvers die owing me. That is a cost of business. Things down there have also run up accounts, and that is not.'),
          tr('Go and collect. I do not mind how. Bring back what they owe and I will call it square.'),
        ],
        flavor: tr('Hesk is owed, and she does not mind how she is paid.'),
        brief: tr('Collect what the Root Deeps owe Hesk, from whatever down there owes it.'),
        objectives: [
          { kind: 'slay', filter: 'any', n: 25, desc: tr('Collect from the debtors ({n})') },
          { kind: 'slay', filter: 'family:beast', n: 6, desc: tr('Collect from the rats that ate the rope ({n})') },
        ],
        ready: tr('The accounts are settled, roughly. Back to Hesk.'),
        turnIn: [
          tr('Square. Roughly. I will round in your favour, which I never do, so do not get used to it.'),
          tr('Somebody down there keeps buying my rope through a third party. I can tell from the knots in what comes back. Not a delver\'s knot.'),
        ],
        outcome: tr('Someone below has been buying Hesk\'s rope through a third party.'),
        reward: { gold: 1.2, xp: 0.8 },
      },
      {
        title: tr("The Butcher's Tab"),
        minDepth: 3,
        biome: 'crypt',
        boss: 'butcher_grell',
        offer: [
          tr('Grell bought hooks on credit. Sixty years ago, from the woman who had this wagon before me. A great many hooks. He has used every one.'),
          tr('He is the only customer I have ever been afraid to bill. You are not afraid of anything yet, which makes you ideal.'),
        ],
        flavor: tr('The Butcher has owed Stairhead for his hooks for sixty years.'),
        brief: tr('Find Grell the Butcher in the crypt and settle sixty years of credit.'),
        objectives: [{ kind: 'boss', filter: 'boss:butcher_grell', n: 1, desc: tr('Collect from Grell, the Butcher') }],
        ready: tr('The Butcher\'s account is closed. Hesk will want to hear it.'),
        turnIn: [
          tr('Closed. Sixty years. I am going to rule that line off with the good pen.'),
          tr('Keep the hooks. I do not want them in the wagon. Take this instead, and never say I did not pay a debt.'),
        ],
        outcome: tr('Grell\'s sixty-year tab is closed.'),
        reward: { gold: 1.4, xp: 1.1, item: 'rare' },
      },
      {
        title: tr('Collars'),
        minDepth: 5,
        biome: 'caverns',
        boss: 'hound_master_vess',
        offer: [
          tr('Vess bought collars. Forty hounds\' worth. She paid in hounds, which I did not accept, so they came back up the stair to discuss it, and Renn rang the bell.'),
          tr('Some of what tried the gate was hers, then. Not everything down there is the Tenant. Some of it is debtors. Go and tell her the account is closed.'),
        ],
        flavor: tr('Vess the Hound Master paid her debt to Hesk in hounds.'),
        brief: tr('Find Vess in the Root Deeps and close her account.'),
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 16, desc: tr('Return the hounds she paid in ({n})') },
          { kind: 'boss', filter: 'boss:hound_master_vess', n: 1, desc: tr('Close the account of Vess, the Hound Master') },
        ],
        ready: tr('Vess will not be paying in hounds again. Hesk will want to know.'),
        turnIn: [
          tr('Closed. Good. Renn owes me an apology about the bell, and she will not give it, and I will enjoy that.'),
          tr('Three bad debts settled. You have a head for collection. If you ever stop going down, there is a stool behind the counter.'),
          tr('You will not stop going down. Nobody does. Here. Your share.'),
        ],
        outcome: tr('Vess\'s account is closed. Hesk offered you a stool behind the counter, knowing you would not take it.'),
        reward: { gold: 1.6, xp: 1.2, item: 'rare' },
      },
    ],
  },

  // =========================================================================
  // Second contracts. Each person with one opens up again once the first is
  // finished, and sends you out past the old walls, to the six lands the
  // first lines never went: wood, fen, reach, tombs, march and steppe.
  // =========================================================================

  // =========================================================================
  // Captain Renn — the treeline
  // =========================================================================
  {
    id: 'treeline',
    name: tr('The Treeline'),
    giver: 'renn',
    when: { done: 'renn' },
    blurb: tr('Renn\'s watch used to walk the Blackroot Wood every night. Now the lanterns on the path go out one a week, and the patrols come back short.'),
    steps: [
      {
        title: tr('The Short Patrol'),
        minDepth: 7,
        biome: 'darkForest',
        offer: [
          tr('Four went out on the wood road last night. Three came back, and none of the three can say when the fourth stopped walking beside them.'),
          tr('Walk the road. Kill what is on it. If you find Dace, bring him home. If you find what is left of him, bring me that.'),
        ],
        flavor: tr('One of Renn\'s guards went missing on the wood road, between one step and the next.'),
        brief: tr('Clear the road through the Blackroot Wood and look for Dace.'),
        objectives: [
          { kind: 'slay', filter: 'any', n: 35, desc: tr('Clear the wood road ({n})') },
          { kind: 'slayElite', n: 3, desc: tr('Break the packs that hunt the road ({n})') },
        ],
        ready: tr('The road is quiet for now. Renn will want to hear it from you.'),
        turnIn: [
          tr('No Dace. But you found his lantern, and it was lit. Somebody is keeping it lit.'),
          tr('My guards do not leave their lights burning. Something in that wood has learned that a lantern on the path brings people to it.'),
        ],
        outcome: tr('Dace\'s lantern was still burning on the wood road, and he was nowhere near it.'),
        reward: { gold: 1.2, xp: 1.2 },
      },
      {
        title: tr('Lights Off the Path'),
        minDepth: 9,
        biome: 'darkForest',
        offer: [
          tr('The lanterns along the road are moving. Each night one of them stands a few steps further into the trees.'),
          tr('Light the old wayshrines so the road has true lights again, and cut down whatever is carrying the false ones. Mind the wax.'),
        ],
        flavor: tr('The lanterns on Renn\'s road are wandering into the trees.'),
        brief: tr('Relight the wayshrines in the Blackroot Wood and stop whoever carries the false lights.'),
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: tr('Relight the old wayshrines ({n})') },
          { kind: 'slay', filter: 'family:humanoid', n: 14, desc: tr('Cut down the wax-faced walkers ({n})') },
        ],
        ready: tr('The wayshrines burn true again. The false lights went out with a smell of tallow.'),
        turnIn: [
          tr('Tallow. You smell of it. So did Dace\'s lantern, now I think of it.'),
          tr('Somebody out there is making candles, and he is not using sheep. I want him found.'),
        ],
        outcome: tr('The false lights in the Blackroot Wood were tallow, and somebody out there is making it.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('The Shepherd'),
        minDepth: 11,
        biome: 'darkForest',
        boss: 'tallow_shepherd',
        offer: [
          tr('Hesk sold a cart of crooks and lamp oil to a man who paid in old coin and smelled of fat. He asked the way to the wood.'),
          tr('He keeps a flock out there. I do not want to know what it is made of. I want it to stop.'),
        ],
        flavor: tr('A shepherd in the Blackroot Wood keeps a flock that burns.'),
        brief: tr('Find the shepherd in the Blackroot Wood and end his flock.'),
        objectives: [
          { kind: 'slay', filter: 'any', n: 30, desc: tr('Scatter the flock ({n})') },
          { kind: 'boss', filter: 'boss:tallow_shepherd', n: 1, desc: tr('Put down the Tallow Shepherd') },
        ],
        ready: tr('The Shepherd is down and his flock has run to puddles. Renn will want to see the crook.'),
        turnIn: [
          tr('That is Dace\'s belt buckle, melted into the crook. I will tell his mother he was brave. I will not tell her the rest.'),
          tr('Hang the crook by the gate. Anything that walks up out of the wood should see it first.'),
          tr('You have done my watch\'s work twice now. The roster has no word for what you are. I am going to make one.'),
        ],
        outcome: tr('The Tallow Shepherd is dead, and his crook hangs by Stairhead\'s gate.'),
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Sister Vell — the fen cure
  // =========================================================================
  {
    id: 'fencure',
    name: tr('The Fen Cure'),
    giver: 'vell',
    when: { done: 'vell' },
    blurb: tr('The fen sends its sickness up the stair on boots and blades. Sister Vell wants the cure, and she thinks the fen is keeping it.'),
    steps: [
      {
        title: tr('Black Water Fever'),
        minDepth: 16,
        biome: 'swamp',
        offer: [
          tr('Three delvers came up from the Gallows Fen with a fever that turns the whites of the eyes green. I have seen it once before, in the order\'s oldest book.'),
          tr('The book says the cure grows where the sickness does. Bring me the bog\'s own medicine. You will know it because things will be guarding it.'),
        ],
        flavor: tr('Delvers are coming up from the fen with green in their eyes.'),
        brief: tr('Gather the fen\'s medicine from the Gallows Fen for Sister Vell.'),
        objectives: [
          { kind: 'slay', filter: 'family:plant', n: 16, desc: tr('Cut the fen weed for its roots ({n})') },
          { kind: 'slay', filter: 'family:ooze', n: 12, desc: tr('Skim the sickness off the water ({n})') },
        ],
        ready: tr('Your pack smells like a ditch, which Vell will take as good news.'),
        turnIn: [
          tr('Gallowsweed root. Good. And this jelly, whatever it was, has the fever in it, so now I can see what I am fighting.'),
          tr('The fever is not a sickness. It is a summons. Something in the fen wants the sick to come back down to it.'),
        ],
        outcome: tr('The fen fever is a summons: the sick are being called back down.'),
        reward: { gold: 1.2, xp: 1.2 },
      },
      {
        title: tr('The Green Lanterns'),
        minDepth: 19,
        biome: 'swamp',
        offer: [
          tr('The sick walk in their sleep, always toward the stair. When I hold them back, they talk about lanterns. Green ones, low over the water.'),
          tr('Find the lanterns and what carries them. Then stay out there long enough to learn the tune they hum. I need to know how the summons is sung.'),
        ],
        flavor: tr('The fevered dream of green lanterns over black water.'),
        brief: tr('Find the green lanterns in the Gallows Fen and learn their song.'),
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 120, desc: tr('Listen to the lantern song ({n}s)') },
          { kind: 'slayElite', n: 4, desc: tr('Silence the lantern carriers ({n})') },
        ],
        ready: tr('You have the tune now, and you will be humming it for a week. Vell will need to hear it.'),
        turnIn: [
          tr('Hum it again. Slower. Yes. That is a lullaby, and it is from my order. We sang it to the dying.'),
          tr('Somebody down there was one of us. Somebody we buried in that fen, because the ground in town was full.'),
        ],
        outcome: tr('The lantern song is the order\'s lullaby for the dying. One of Vell\'s sisters lies in the fen.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('Unburied'),
        minDepth: 22,
        biome: 'swamp',
        boss: 'mirelle_unburied',
        offer: [
          tr('Her name was Mirelle. She nursed the plague wards for eleven years and caught it in the twelfth. We laid her in the fen with a lantern, as the rite says.'),
          tr('The rite also says to come back and put the lantern out. Nobody did. I was the one who was meant to.'),
          tr('Go and do it for me. Put out the lights around her, then lay her down, gently if she lets you.'),
        ],
        flavor: tr('A sister of Vell\'s order was laid in the fen, and nobody put her lantern out.'),
        brief: tr('Put out Mirelle\'s lanterns in the Gallows Fen and lay her to rest.'),
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: tr('Put out the lanterns at her shrines ({n})') },
          { kind: 'boss', filter: 'boss:mirelle_unburied', n: 1, desc: tr('Lay Mirelle the Unburied to rest') },
        ],
        ready: tr('Mirelle\'s court of lanterns has gone dark. Vell will want to know how it ended.'),
        turnIn: [
          tr('She asked you if it was time? Then she remembered. Good. Good.'),
          tr('The fever broke this morning, in all three of them at once. They woke up and asked for soup.'),
          tr('This was hers. She would want it to go on working. Take it.'),
        ],
        outcome: tr('Mirelle is at rest, her lanterns are out, and the fen fever broke in the night.'),
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Wenna Torr — the ash survey
  // =========================================================================
  {
    id: 'ashsurvey',
    name: tr('Sand Over the Survey'),
    giver: 'wenna',
    when: { done: 'wenna' },
    blurb: tr('The Bleached Reach was a city once, and the old survey has its streets. Wenna wants to walk them, and the sand keeps moving the city.'),
    steps: [
      {
        title: tr('Old Streets'),
        minDepth: 15,
        biome: 'desert',
        offer: [
          tr('The first survey drew a city in the Bleached Reach. Streets, wells, a market square. The surveyor before the surveyor before me walked it with a chain and a pole.'),
          tr('I went out with her map last spring and found dunes where the square should be. Either she lied, or the city moved. Go and stand where the square was, long enough to be sure.'),
        ],
        flavor: tr('The old survey puts a market square where the Bleached Reach has only dunes.'),
        brief: tr('Stand where the old market square should be in the Bleached Reach.'),
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 90, desc: tr('Stand in the old market square ({n}s)') },
          { kind: 'slay', filter: 'family:beast', n: 16, desc: tr('Drive off what dens in the ruins ({n})') },
        ],
        ready: tr('You stood where the square should be. The sand under you was warm, and not from the sun.'),
        turnIn: [
          tr('Warm sand at night, in a square that is not there. That is a buried city breathing, or I am a poet, and I am not a poet.'),
          tr('It moved. A whole city, moved under the sand, a little every year, like the Spire. The same push, from the same place.'),
        ],
        outcome: tr('The city under the Bleached Reach is moving, pushed from below like the Spire.'),
        reward: { gold: 1.2, xp: 1.2 },
      },
      {
        title: tr('The Wind Has Surveyors Too'),
        minDepth: 17,
        biome: 'desert',
        offer: [
          tr('Something out there moves my markers. I set pole stones in a line. Next morning they stood in a circle.'),
          tr('I would like it to stop. The things that do it are made of sand, wind and very bad temper. Break them, and give me a straight line.'),
        ],
        flavor: tr('Something in the Reach rearranges Wenna\'s survey markers overnight.'),
        brief: tr('Break the sand walkers in the Bleached Reach and set one fixed mark.'),
        objectives: [
          { kind: 'slay', filter: 'family:elemental', n: 12, desc: tr('Break the sand walkers that move the markers ({n})') },
          { kind: 'cleanse', filter: 'prop:shrine', n: 1, desc: tr('Set a fixed mark at a shrine ({n})') },
        ],
        ready: tr('The markers stand in a line again. Wenna will want to sight along it herself.'),
        turnIn: [
          tr('A straight line. Do you know how long it has been since anybody gave me a straight line?'),
          tr('And the sand walkers were half ash, fine and grey. Not sand at all. Somebody is selling ash out there, and somebody is buying.'),
        ],
        outcome: tr('The sand walkers that moved the markers were half made of ash.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('Ash for Sale'),
        minDepth: 20,
        biome: 'desert',
        boss: 'teodric_ashmonger',
        offer: [
          tr('Gilder says there is a trader in the Reach who sells ash by the sack, and that people buy it, and that nobody can tell him why.'),
          tr('Ash is what is left when a thing has burned. If he is selling the city\'s ash, then the city burned, and the survey is a map of a fire.'),
          tr('Find him. Close his stall. I want one honest sack to weigh.'),
        ],
        flavor: tr('A trader in the Bleached Reach sells ash by the sack.'),
        brief: tr('Find the ash trader in the Bleached Reach and bring Wenna a sack of his stock.'),
        objectives: [
          { kind: 'slay', filter: 'family:humanoid', n: 16, desc: tr('Scatter his customers ({n})') },
          { kind: 'boss', filter: 'boss:teodric_ashmonger', n: 1, desc: tr('Close the Ashmonger\'s stall') },
        ],
        ready: tr('Teodric is dead and his ash is spilled on the sand. Wenna will want her sack.'),
        turnIn: [
          tr('Bone ash. City ash. It is what the old survey drew. The streets are in it, if you know how to look.'),
          tr('The city did not move. It burned, and the deep keeps building it again a little lower each year, out of what is left.'),
          tr('You have given me two honest measurements. That is more than the deep has given anybody. Here. And my thanks, which I give out less often than pay.'),
        ],
        outcome: tr('The city under the Reach burned long ago, and the deep keeps rebuilding it, lower each year.'),
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Corvane — the kings' bond
  // =========================================================================
  {
    id: 'kingsbond',
    name: tr('The Kings’ Bond'),
    giver: 'corvane',
    when: { done: 'corvane' },
    blurb: tr('The Sand-Kings were buried with their treasuries, and with their debts. Corvane holds a bond with one of their seals on it.'),
    steps: [
      {
        title: tr('A Bond in Old Gold'),
        minDepth: 17,
        biome: 'desertTomb',
        offer: [
          tr('A bond came into the vault last week, left by nobody, signed by a king who has been dead nine hundred years. It is drawn on his treasury. It is due.'),
          tr('I do not pay bonds I cannot see the money for. Go down into the Tombs and find out if the treasury is still there. Mind the help. They were buried with him.'),
        ],
        flavor: tr('A nine hundred year old bond has come due at Corvane\'s vault.'),
        brief: tr('Find out if the Sand-King\'s treasury still stands in the Tombs.'),
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 20, desc: tr('Clear the kings\' buried servants ({n})') },
          { kind: 'slayElite', n: 3, desc: tr('Break the tomb guards ({n})') },
        ],
        ready: tr('The treasury is there, and it has been counted recently. Corvane will want that detail.'),
        turnIn: [
          tr('Counted. By whom? The dead do not count. That is the one comfort of the dead.'),
          tr('Somebody keeps the kings\' books down there. A bond drawn on a living treasury is a bond I must pay, and I would rather know who I am paying.'),
        ],
        outcome: tr('The Sand-Kings\' treasury is still there, and someone keeps its books.'),
        reward: { gold: 1.3, xp: 1.1 },
      },
      {
        title: tr('The Bookkeepers'),
        minDepth: 20,
        biome: 'desertTomb',
        offer: [
          tr('The ledger you saw, columns in gold leaf and totals in salt. I know that hand. Every bank in the old cities used it.'),
          tr('If the clerks are still at their desks, they are still taking deposits. Close the counting rooms. All of them.'),
        ],
        flavor: tr('Brass clerks still keep the Sand-Kings\' ledgers.'),
        brief: tr('Stop the clerks in the Tombs and seal their counting rooms.'),
        objectives: [
          { kind: 'slay', filter: 'family:construct', n: 14, desc: tr('Stop the brass clerks at their desks ({n})') },
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: tr('Seal the counting rooms ({n})') },
        ],
        ready: tr('The counting rooms are shut and their lamps are out. Corvane will want to know what the last entry said.'),
        turnIn: [
          tr('The last entry was a deposit. One delver, received in good condition, to be held until called for. Dated this year.'),
          tr('They are not keeping gold down there. They are keeping us. And every door in the Tombs opens for whoever holds the book.'),
        ],
        outcome: tr('The Tombs\' last ledger entry was a delver, received this year and held until called for.'),
        reward: { gold: 1.5, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('Every Door Ajar'),
        minDepth: 24,
        biome: 'desertTomb',
        boss: 'queen_of_hinges',
        offer: [
          tr('There is one more name on the bond. Not the king. The witness. She signs as Keeper of Every Door.'),
          tr('I do not like debts that can walk through walls. Go and settle this one. I will hold the bond until you come back, and then I will burn it.'),
        ],
        flavor: tr('The bond\'s witness signs as Keeper of Every Door.'),
        brief: tr('Find the witness to the bond in the Tombs and settle the debt.'),
        objectives: [
          { kind: 'slay', filter: 'any', n: 35, desc: tr('Clear the hall of doors ({n})') },
          { kind: 'boss', filter: 'boss:queen_of_hinges', n: 1, desc: tr('Shut the Queen of Hinges out') },
        ],
        ready: tr('The Queen of Hinges is dead, and every door in her hall has swung shut. Corvane will want to burn that bond.'),
        turnIn: [
          tr('Done, then. Hand me the lamp.'),
          tr('There. A nine hundred year debt, and it burns like any other paper.'),
          tr('Whoever she was holding will find their own way up now. Take this. It was in the treasury, and the treasury, I find, has no owner.'),
        ],
        outcome: tr('The Queen of Hinges is dead and the kings\' bond is ash in Corvane\'s grate.'),
        reward: { gold: 2, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Ordrun Kale — the high road
  // =========================================================================
  {
    id: 'highroad',
    name: tr('The High Road'),
    giver: 'kale',
    when: { done: 'kale' },
    blurb: tr('Before the Works went deep, they hauled ore down the high road across the Frostmarch. Kale drove that road once. Something is driving it again.'),
    steps: [
      {
        title: tr('The Ore Road'),
        minDepth: 21,
        biome: 'tundra',
        offer: [
          tr('Before I was a smith I drove ore wagons across the Frostmarch. Long road. Cold road. We lost a wagon a winter and thought that was cheap.'),
          tr('A trapper came in yesterday and said he saw a wagon on the high road. Fresh tracks, full load. Nobody has hauled that road in twenty years. Go and look.'),
        ],
        flavor: tr('A trapper saw a loaded wagon on a road nobody has used in twenty years.'),
        brief: tr('Watch the high road across the Frostmarch for the wagon.'),
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 18, desc: tr('Clear the wolves off the high road ({n})') },
          { kind: 'survive', filter: 'zone:any', n: 100, desc: tr('Keep watch at the old waystation ({n}s)') },
        ],
        ready: tr('You saw the wagon. Kale will not like what was pulling it.'),
        turnIn: [
          tr('Men. Frozen men, in harness, pulling a full wagon at a walk. I know that wagon. I know the brand on its side.'),
          tr('That is my wagon. The one I lost, the winter I gave up driving. I did not lose it. I left it, and the team with it, in a white squall, and I walked home alone.'),
        ],
        outcome: tr('The wagon on the high road is the one Kale left in a squall twenty years ago, still hauling.'),
        reward: { gold: 1.2, xp: 1.2 },
      },
      {
        title: tr('What the Load Was'),
        minDepth: 24,
        biome: 'tundra',
        offer: [
          tr('I never asked what we carried. The Works paid by the mile, not by the question.'),
          tr('Get close to that wagon and see. And whoever is driving it, stop them. The team should have been let stop a long time ago.'),
        ],
        flavor: tr('Kale\'s old team still hauls its load across the Frostmarch.'),
        brief: tr('Free Kale\'s frozen team on the high road and see what they haul.'),
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 18, desc: tr('Free the frozen teamsters ({n})') },
          { kind: 'slayElite', n: 4, desc: tr('Break the wagon\'s outriders ({n})') },
        ],
        ready: tr('The teamsters lie still in the snow at last. Kale will want to know about the load.'),
        turnIn: [
          tr('Hearthstones. A wagon of hearthstones, the kind that never go cold. For the Works\' furnaces, I always thought.'),
          tr('Not for the furnaces. For something up in the Frostmarch that is always cold and wants to be warm. We were feeding it, and it kept the drivers who stopped.'),
        ],
        outcome: tr('The wagons carried hearthstones up to something in the Frostmarch that is always cold.'),
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: tr('Grandmother’s Hearth'),
        minDepth: 27,
        biome: 'tundra',
        boss: 'grandmother_thaw',
        offer: [
          tr('The trappers call her Grandmother. She sits by a hearth our wagons filled, and she asks everyone who passes to sit with her a while.'),
          tr('My team sat. I did not. I have been cold every day since, and I think that is the only reason I am alive.'),
          tr('Go up there and put her fire out. Do not sit down, whatever she says.'),
        ],
        flavor: tr('Something on the Frostmarch asks travellers to sit by its fire.'),
        brief: tr('Put out Grandmother Thaw\'s hearth on the Frostmarch. Do not sit down.'),
        objectives: [
          { kind: 'slay', filter: 'family:elemental', n: 14, desc: tr('Smash the ice that guards her ({n})') },
          { kind: 'boss', filter: 'boss:grandmother_thaw', n: 1, desc: tr('Put out Grandmother Thaw\'s hearth') },
        ],
        ready: tr('Grandmother Thaw has melted into her own hearth. Kale will want to know you never sat down.'),
        turnIn: [
          tr('You did not sit. Good. That is the whole trick, and nobody ever tells you.'),
          tr('The trapper says the high road is empty. No wagon. Just the tracks, going home.'),
          tr('I forged this from the last hearthstone. It will never go cold. That seemed right.'),
        ],
        outcome: tr('Grandmother Thaw is gone, the high road is empty, and Kale forged the last hearthstone into a gift.'),
        reward: { gold: 2, xp: 1.8, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // The Listener — the singing steppe
  // =========================================================================
  {
    id: 'steppe',
    name: tr('The Singing Steppe'),
    giver: 'listener',
    when: { done: 'listener' },
    blurb: tr('Since the Tenant moved aside, the Listener can hear further. Out past the fire, on the Burning Steppe, something has started to sing.'),
    steps: [
      {
        title: tr('A Note Held Too Long'),
        minDepth: 41,
        biome: 'hell',
        offer: [
          tr('Since you opened Ghaal, I can hear further. Out past the fire there is a steppe, and on the steppe there is a note. One note. It has been held for nine days.'),
          tr('Nothing breathes for nine days. Go out and find where it comes from. Do not sing along. It wants you to.'),
        ],
        flavor: tr('A single note has been held on the Burning Steppe for nine days.'),
        brief: tr('Find where the note is loudest on the Burning Steppe.'),
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 120, desc: tr('Find where the note is loudest ({n}s)') },
          { kind: 'slay', filter: 'family:demon', n: 20, desc: tr('Silence the things that dance to it ({n})') },
        ],
        ready: tr('You found the place where the note is loudest. Your teeth still ache with it.'),
        turnIn: [
          tr('Three notes, you said. Not one. High, low, and a hum in the middle.'),
          tr('I only heard one because the other two are the same voice, folded. It is a choir, and it is practising.'),
        ],
        outcome: tr('The note on the Burning Steppe is three voices, a choir, practising.'),
        reward: { gold: 1.4, xp: 1.3 },
      },
      {
        title: tr('What It Is Practising For'),
        minDepth: 45,
        biome: 'hell',
        offer: [
          tr('Choirs practise for an occasion. I want to know what the steppe is getting ready to celebrate.'),
          tr('Find their hymn stones. Break them. And listen to the words, if there are words, before they stop.'),
        ],
        flavor: tr('The choir on the Burning Steppe is practising for something.'),
        brief: tr('Break the hymn stones on the Burning Steppe and catch the words.'),
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: tr('Break the hymn stones ({n})') },
          { kind: 'slayElite', n: 5, desc: tr('Silence the cantors ({n})') },
        ],
        ready: tr('The hymn stones are broken. You caught the words on the last one.'),
        turnIn: [
          tr('Say them again. Slowly.'),
          tr('They are singing to wake something. Not the Tenant. Something the Tenant sits on, the way a stone sits on a lid.'),
        ],
        outcome: tr('The choir is singing to wake whatever lies beneath the Tenant.'),
        reward: { gold: 1.6, xp: 1.4, item: 'rare' },
      },
      {
        title: tr('Last Verse'),
        minDepth: 50,
        biome: 'hell',
        boss: 'furnace_choir',
        offer: [
          tr('I know where they stand now. Three furnaces on the steppe, in a row, singing. Fire, slag and smoke.'),
          tr('Put them out before the hymn is finished. If they finish it, I will not need to tell you. Everyone will hear.'),
        ],
        flavor: tr('Three furnaces on the Burning Steppe are nearly through their hymn.'),
        brief: tr('Silence the Furnace Choir on the Burning Steppe before the hymn ends.'),
        objectives: [
          { kind: 'slay', filter: 'family:elemental', n: 18, desc: tr('Quench the choir\'s embers ({n})') },
          { kind: 'boss', filter: 'boss:furnace_choir', n: 1, desc: tr('Silence the Furnace Choir') },
        ],
        ready: tr('The furnaces are cold and the steppe is quiet. The Listener will already know.'),
        turnIn: [
          tr('I heard it stop. The whole camp heard nothing, which is what I wanted for them.'),
          tr('Under the quiet I can hear the thing beneath the Tenant turn over, and settle, and go back to sleep.'),
          tr('You have bought us a long silence. Take this, and then go and sleep yourself. You have earned a night without listening.'),
        ],
        outcome: tr('The Furnace Choir is silent, and what sleeps under the Tenant has settled again.'),
        reward: { gold: 2.4, xp: 2, item: 'unique' },
      },
    ],
  },
];

const BY_ID = new Map(CHAINS.map((c) => [c.id, c]));

export function chainById(id: string): ChainDef | undefined {
  return BY_ID.get(id);
}

/** The quest-definition id a chain step runs under. */
export function chainQuestId(chainId: string, step: number): string {
  return `story.${chainId}.${step}`;
}

/** Inverse of `chainQuestId`. */
export function parseChainQuestId(id: string): { chain: ChainDef; step: number } | null {
  const m = /^story\.([a-z]+)\.(\d+)$/.exec(id);
  if (!m) return null;
  const chain = BY_ID.get(m[1]!);
  const step = Number(m[2]);
  if (!chain || !chain.steps[step]) return null;
  return { chain, step };
}
