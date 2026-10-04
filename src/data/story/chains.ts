/**
 * SLAY — contracts: the hand-written quest lines.
 *
 * Every person in Stairhead has one piece of business below. Each chain is a
 * short story in three or four contracts. Taking a contract does two things
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

export const CHAINS: ChainDef[] = [
  // =========================================================================
  // Captain Renn — the bell
  // =========================================================================
  {
    id: 'renn',
    name: 'The Bell',
    giver: 'renn',
    blurb: `Something has been testing the gate from below. Renn wants to know what, and wants it told the bell still rings.`,
    steps: [
      {
        title: 'Roster Duty',
        minDepth: 1,
        biome: 'crypt',
        offer: [
          `Everyone on my roster does one sweep of the first tier before I believe in them. Go down, kill what is nearest the stair, come back up.`,
          `Do that and I write your name in ink instead of chalk.`,
        ],
        flavor: `The watch captain wants the first tier thinned before she will trust your name to ink.`,
        brief: `Sweep the Ossuary Tiers nearest the stair, then come back up to Captain Renn.`,
        objectives: [{ kind: 'slay', filter: 'any', n: 30, desc: `Thin what waits below the stair ({n})` }],
        ready: `That will do for Renn. Back up the stair.`,
        turnIn: [
          `Thirty, and you walked back up. Ink it is.`,
          `Most chalk names never get this far. I rub them off with my thumb. I am glad not to have to rub off yours.`,
        ],
        outcome: `Renn wrote your name on the roster in ink.`,
        reward: { gold: 0.8, xp: 0.8 },
      },
      {
        title: 'Marks on the Gate',
        minDepth: 2,
        biome: 'caverns',
        offer: [
          `Three nights ago the bell rope moved by itself. Nothing came through the gate. Something tried.`,
          `It left claw marks on the threshold stone, and they lead down into the Root Deeps. Find what made them. Kill it. Bring me a reason to sleep.`,
        ],
        flavor: `Claw marks on the gate stone lead down into the Root Deeps.`,
        brief: `Follow the claw marks into the Root Deeps and kill the things that tried the gate.`,
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 14, desc: `Hunt the beasts that climbed toward the gate ({n})` },
          { kind: 'slayElite', n: 2, desc: `Kill the pack leaders that led them ({n})` },
        ],
        ready: `The marks end here. Whatever tried the gate will not try it again. Tell Renn.`,
        turnIn: [
          `Beasts. Only beasts. I had hoped for something worse, so it would make sense.`,
          `Animals do not climb four hundred steps for no reason. Something sent them up. Something wanted to know if the bell still rings.`,
        ],
        outcome: `The things that tried the gate were beasts, sent up by something that wanted to test the bell.`,
        reward: { gold: 1, xp: 1 },
      },
      {
        title: 'Tell It the Bell Still Rings',
        minDepth: 4,
        biome: 'crypt',
        boss: 'boneking_gharruth',
        offer: [
          `The marks in the crypt lead to a throne room. There is a king on the throne, made of bones he did not start with. He has been sending things up the stair to see whether anyone is watching.`,
          `Go and tell him we are. Use whatever words you like.`,
        ],
        flavor: `A king of bones has been testing the gate. Renn wants him told that someone is watching.`,
        brief: `Go down to the Bone King's throne in the Ossuary Tiers and end his testing.`,
        objectives: [{ kind: 'boss', filter: 'boss:boneking_gharruth', n: 1, desc: `Answer Gharruth, the Bone King` }],
        ready: `The throne is empty. Renn will want to hear it from you.`,
        turnIn: [
          `Gharruth. Caul's last king, if the old roll is right. He kept the city's census and never stopped counting.`,
          `The bell has been quiet since you went down. I would like to say that was your doing. I think it was. Here. The watch does not pay much, but it pays.`,
        ],
        outcome: `Gharruth, the Bone King, is dead on his throne, and the bell has been quiet since.`,
        reward: { gold: 1.3, xp: 1.2, item: 'rare' },
      },
      {
        title: 'The Other Bell',
        minDepth: 6,
        biome: 'sunkenTemple',
        boss: 'tidewarden_nheru',
        offer: [
          `The night ours rang, the Listener heard a second bell answer it. Far down, and under water.`,
          `The Drowned Sanctum had bells. If one of them is still ringing, someone is ringing it. Find out who. Then stop them.`,
        ],
        flavor: `When the camp's bell rang, a drowned bell answered it from the Sanctum.`,
        brief: `Find the drowned bell in the Sanctum, still its shrines, and silence whatever rings it.`,
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: `Still the Sanctum's bell-shrines ({n})` },
          { kind: 'boss', filter: 'boss:tidewarden_nheru', n: 1, desc: `Silence Nheru, who rings the drowned bell` },
        ],
        ready: `The drowned bell is still. Renn should know her bell has no answer now.`,
        turnIn: [
          `Nheru. The tide that rang the Sanctum's hours, still keeping them for a congregation that drowned.`,
          `So ours rang, and theirs answered, and the thing in between heard both. I will not sleep better for knowing it. I will sleep. Thank you.`,
          `Your name stays in ink. You have the bell's protection, for what it is worth. It is worth eleven guards and a rope.`,
        ],
        outcome: `The drowned bell is silent. Stairhead's bell rings alone now, and nothing answers it.`,
        reward: { gold: 1.5, xp: 1.4, item: 'rare' },
      },
    ],
  },

  // =========================================================================
  // Ordrun Kale — the order book
  // =========================================================================
  {
    id: 'kale',
    name: 'The Order Book',
    giver: 'kale',
    blurb: `Kale wants proof the Cindergate Works still run, and the name of whoever placed their order.`,
    steps: [
      {
        title: 'Still Warm',
        minDepth: 2,
        biome: 'foundry',
        offer: [
          `The Works are under the crypt. Furnaces, rails, a line that never stopped. I want to know if it is still running, or if that is a story drunks tell.`,
          `Put down whoever is still working it. Count them. Bring the count back. I will know from the number whether you saw the real thing.`,
        ],
        flavor: `Kale wants to know whether the Cindergate Works still run.`,
        brief: `Go into the Cindergate Works and put down the shift still working the line.`,
        objectives: [{ kind: 'slay', filter: 'family:humanoid', n: 14, desc: `Put down the shift still working the line ({n})` }],
        ready: `The line is running. Tell Kale it is still warm.`,
        turnIn: [
          `Fourteen. Still on shift after four hundred years, with nobody left to pay them.`,
          `I have spent my life trying to make iron that good. They do it in their sleep. Here. You have earned better steel than mine, so take some coin and go and find it.`,
        ],
        outcome: `The Cindergate Works are still running, and Kale was quieter than usual about it.`,
        reward: { gold: 1, xp: 1 },
      },
      {
        title: 'The Foreman',
        minDepth: 5,
        biome: 'foundry',
        boss: 'forgefather_hurn',
        offer: [
          `Somebody runs that line. Something that size does not run itself. The Works were built with a foreman's bell on every gallery.`,
          `Go to the great hammer. Whoever swings it will know who placed the order. Ask. Then do what you have to.`,
        ],
        flavor: `A great hammer has not stopped falling in the Works for four hundred years.`,
        brief: `Find the great hammer in the Works and put its smith down.`,
        objectives: [{ kind: 'boss', filter: 'boss:forgefather_hurn', n: 1, desc: `Stop Hurn, the Forgefather` }],
        ready: `The hammer has stopped. Kale will want to hear how it sounded.`,
        turnIn: [
          `Hurn. My master's master's master learned from him. Every smith above ground owes something to that arm.`,
          `Did he say who the order was for? No. He would not. A good smith does not talk about the customer.`,
          `Take this. I made it the way he taught, three hands removed. It is not as good as his. Nothing is.`,
        ],
        outcome: `Hurn the Forgefather is dead at his anvil. He did not say who the order was for.`,
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: 'The First Finished Order',
        minDepth: 9,
        biome: 'foundry',
        boss: 'iron_conqueror',
        offer: [
          `I found the page in an old copy of the order book. The Works finished one thing, once. A general. Full plate. No visor slit.`,
          `It was meant to lead an army against what lives below. The army was never made. The general is still waiting for it, somewhere on the lower galleries.`,
          `End it. It has waited long enough for a war that is not coming.`,
        ],
        flavor: `The only order the Works ever finished is still waiting for its army.`,
        brief: `Find Malek, the Iron Conqueror, on the Works' lower galleries and end his wait.`,
        objectives: [
          { kind: 'slayElite', n: 3, desc: `Cut down the officers of an army never made ({n})` },
          { kind: 'boss', filter: 'boss:iron_conqueror', n: 1, desc: `Defeat Malek, the Iron Conqueror` },
        ],
        ready: `The general is down. Kale should hear that the order was finished at last.`,
        turnIn: [
          `Malek. The Works' masterpiece. They built a general and had no war left to give him.`,
          `My arms. You want to know. All right. I tried to quench a blade in what runs down the Works' lowest channel. It is not water and it is not oil. It took the skin to the elbow, and it gave the steel an edge I have never matched.`,
          `It runs off the Tenant. The Works were quenching their weapons in the thing they were built to fight.`,
        ],
        outcome: `Kale told you about his arms: deep steel is quenched in what runs off the Tenant.`,
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: 'What They Were Building',
        minDepth: 20,
        biome: 'foundry',
        boss: 'colossus_of_the_deep',
        offer: [
          `The order was revised. You saw it. Someone changed it, in a hand that is not a clerk's, to something larger.`,
          `The Works have been building it ever since. Every gallery you have walked was making a part. Go down to where the parts are joined, and unmake it before it is finished.`,
        ],
        flavor: `The Works have been building one last thing, to a revised order.`,
        brief: `Go down to the deep foundry and break the colossus the Works have been building.`,
        objectives: [
          { kind: 'slay', filter: 'family:construct', n: 24, desc: `Break the Works' last shift ({n})` },
          { kind: 'boss', filter: 'boss:colossus_of_the_deep', n: 1, desc: `Unmake Vareth-Kar before it is finished` },
        ],
        ready: `The Works have stopped. All of them. Tell Kale.`,
        turnIn: [
          `Stopped. All of it. I would have liked to hear that. The silence, I mean.`,
          `It was never a weapon against the Tenant, was it. They were building it a body.`,
          `Here. The last thing I will make from deep steel. I am done with it. Iron from the hill is good enough for me now.`,
        ],
        outcome: `The Cindergate Works are silent. What they were building was a body, and it is broken.`,
        reward: { gold: 2, xp: 1.8, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Sister Vell — nineteen
  // =========================================================================
  {
    id: 'vell',
    name: 'Nineteen',
    giver: 'vell',
    blurb: `Sister Vell wants to know what became of the nineteen people she could not save.`,
    steps: [
      {
        title: 'Orla Pike',
        minDepth: 3,
        biome: 'sunkenTemple',
        offer: [
          `The first of my nineteen was a girl called Orla Pike. She went into the Drowned Sanctum for water clean enough to drink. The water is very clean down there. That was the trouble.`,
          `The congregation took her in. I would like to know she did not stay. Go and see.`,
        ],
        flavor: `Orla Pike went into the Drowned Sanctum for clean water and did not come back.`,
        brief: `Search the Drowned Sanctum for Orla Pike among its congregation.`,
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 10, desc: `Go through the drowned congregation ({n})` },
          { kind: 'cleanse', filter: 'prop:shrine', n: 1, desc: `Pray at a Sanctum shrine, as Orla would have ({n})` },
        ],
        ready: `She was not among them. Tell Vell what you found instead.`,
        turnIn: [
          `Not among them. Then she did not stay. That is something.`,
          `Prayers cut into the shrine stone, newer than the rest, in a careful hand. Orla wrote like that. She was praying for whoever came next.`,
          `I will put a second line under her name. It is shorter than the first.`,
        ],
        outcome: `Orla Pike was not among the drowned. She left a prayer for whoever came after her.`,
        reward: { gold: 1, xp: 1 },
      },
      {
        title: 'Light on the Left Foot',
        minDepth: 5,
        biome: 'hive',
        boss: 'broodmother_saelith',
        offer: [
          `The Listener hears footsteps under the camp some nights, walking the old tunnels. One of them walks like Orla. Light on the left foot. She broke the right one as a child.`,
          `The tunnels come up from the hive. Something there keeps what it takes. Go and see what it kept.`,
        ],
        flavor: `Something under the camp walks like Orla Pike.`,
        brief: `Go into the Chitin Warrens and find what the brood mother keeps.`,
        objectives: [
          { kind: 'slay', filter: 'family:insect', n: 20, desc: `Cut through the brood ({n})` },
          { kind: 'boss', filter: 'boss:broodmother_saelith', n: 1, desc: `Kill Sae-lith, the Brood Mother` },
        ],
        ready: `The brood mother is dead, and what she kept is not Orla. Tell Vell.`,
        turnIn: [
          `Not her. Of course not her.`,
          `Boots in the nursery, dozens, every pair walked in, every pair stitched the same way on the right heel. Something has been wearing my nineteen's things and learning how they walked.`,
          `Sit down. I need to write for a while, and I would rather not be alone while I do it.`,
        ],
        outcome: `The brood kept the boots of the lost, and something has been learning how they walked.`,
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: 'Kept Fresh',
        minDepth: 8,
        biome: 'frostvault',
        boss: 'rimeheart_valdr',
        offer: [
          `The Rime Archive keeps what it is given. Whole. If any of my nineteen are anywhere in one piece, they are there, in the ice, waiting for a thaw.`,
          `Break them out if you have to. Read the labels. If you find a name from my list, do not try to thaw it. Only tell me it is there.`,
        ],
        flavor: `The Rime Archive keeps everything whole. Vell hopes it kept some of her nineteen.`,
        brief: `Read the labels on the Archive's kept dead, and face the heart of the cold.`,
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 12, desc: `Break the ice off the kept dead and read their labels ({n})` },
          { kind: 'boss', filter: 'boss:rimeheart_valdr', n: 1, desc: `Break Valdr, the Rimeheart` },
        ],
        ready: `You have read every label you could reach. Vell will want them all.`,
        turnIn: [
          `Seven. Seven of my nineteen, in the ice, labelled in a clerk's hand, filed by the tier they were taken from.`,
          `Filed. Somebody keeps my failures in better order than I do.`,
          `Thank you. That is the worst kindness anyone has done me, and I mean it as thanks.`,
        ],
        outcome: `Seven of Vell's nineteen are in the Rime Archive, labelled and filed.`,
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: 'Nineteen',
        minDepth: 15,
        biome: 'crypt',
        boss: 'lich_of_seven_seals',
        offer: [
          `The rest of them are under seal. The Listener hears them in the crypt, very deep, behind seven doors and a thing that has been breaking the doors one at a time.`,
          `Ordrach. He keeps the dead who were not finished. Mine were not finished. Break his seals before he does, and let them go.`,
        ],
        flavor: `Ordrach keeps the unfinished dead behind seven seals, and Vell's are among them.`,
        brief: `Break Ordrach's seals in the deep crypt and let Vell's nineteen go.`,
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 3, desc: `Break the seals that hold the unfinished ({n})` },
          { kind: 'boss', filter: 'boss:lich_of_seven_seals', n: 1, desc: `Destroy Ordrach, Lich of the Seven Seals` },
        ],
        ready: `The seals are broken and the crypt is quiet. Vell should hear it from you.`,
        turnIn: [
          `The Listener says the crypt went quiet all at once last night, like a held breath let go. Nineteen of them, she thinks. She counted.`,
          `I was going to tear the page out. I am not. I am going to draw a line under all of it. That is what the page is for.`,
          `Take this. The last tincture made to the order's own recipe. Drink it when you need to come back up.`,
        ],
        outcome: `Vell's nineteen are released. She drew one line under the whole page.`,
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Old Marrow — cut too early
  // =========================================================================
  {
    id: 'marrow',
    name: 'Cut Too Early',
    giver: 'marrow',
    blurb: `Names are appearing on Marrow's wall before the people they belong to have died.`,
    steps: [
      {
        title: 'Tobin Reave',
        minDepth: 4,
        biome: 'crypt',
        offer: [
          `There is a name on my wall I did not cut. Tobin Reave. He went down yesterday morning, alive and loud about it.`,
          `The cut is clean. Better than mine, if I am honest, and I am not happy about that. Go down and find Tobin. Tell him to come up and argue with his name.`,
        ],
        flavor: `A name appeared on the memorial before its owner had died.`,
        brief: `Search the Ossuary Tiers for Tobin Reave.`,
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 20, desc: `Turn over the dead of the tiers, looking for Tobin ({n})` },
          { kind: 'slayElite', n: 2, desc: `Kill what holds the lower tiers ({n})` },
        ],
        ready: `Tobin is not coming back. Marrow should know the name was right.`,
        turnIn: [
          `Not coming back. So the name was right, a day early.`,
          `I do not like being right ahead of time. I like it less that I was not the one who was right.`,
          `Here. Tobin had an account with Hesk. She says it is mine to pass on. She also says to tell you she is not sentimental.`,
        ],
        outcome: `Tobin Reave's name was cut a day before he died, by a hand that was not Marrow's.`,
        reward: { gold: 1, xp: 1 },
      },
      {
        title: 'Who Holds the Chisel',
        minDepth: 6,
        biome: 'crypt',
        boss: 'archivist_moln',
        offer: [
          `Somebody down there is cutting names. Somebody with a good hand and a great deal of time.`,
          `The Listener says there is a hall below the ossuary where every book is a name, and a keeper who writes in them. Whoever keeps the books keeps a chisel too. Go and take it off him.`,
        ],
        flavor: `Somewhere below, a hall of names is being kept up to date.`,
        brief: `Find the hall of names below the ossuary and silence its keeper.`,
        objectives: [{ kind: 'boss', filter: 'boss:archivist_moln', n: 1, desc: `Close the book on Moln, the Archivist` }],
        ready: `The Archivist is done. His last book lies open on the floor. Marrow should hear what is in it.`,
        turnIn: [
          `Moln. A record-keeper, then. One of Caul's. They counted everything.`,
          `His last book was open, you say, and the page had the camp's names on it. All of us. In order of when.`,
          `I am not going to ask where my name was. Do not tell me. I have a wall to keep.`,
        ],
        outcome: `Moln the Archivist kept a book of Stairhead's names, in the order they would be taken.`,
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: "The Archive's Copy",
        minDepth: 10,
        biome: 'frostvault',
        offer: [
          `Moln kept a book. The Rime Archive keeps a copy of everything. If there is a copy of his book anywhere, it is there, frozen.`,
          `I want to read it. I want to know whether the order can be changed. Bring me the pages.`,
        ],
        flavor: `The Rime Archive may hold a frozen copy of the book of names.`,
        brief: `Take the copied pages from the wardens of the Rime Archive.`,
        objectives: [
          { kind: 'slayElite', n: 3, desc: `Take the copied pages from the Archive's wardens ({n})` },
          { kind: 'slay', filter: 'family:undead', n: 16, desc: `Get past what guards the shelves ({n})` },
        ],
        ready: `You have the pages. They are cold enough to burn. Take them to Marrow.`,
        turnIn: [
          `Give them here. Gently. Ice holds ink better than stone holds a chisel.`,
          `The copy is not the same as Moln's book. Some names have moved, down the page, later. A few have been crossed out entirely.`,
          `It can be changed. The order can be changed, by going down. Every name that moved, somebody went deeper than the book expected.`,
        ],
        outcome: `The copied pages show the order of names can be changed, by going deeper than expected.`,
        reward: { gold: 1.4, xp: 1.3, item: 'rare' },
      },
      {
        title: 'Your Name',
        minDepth: 18,
        biome: 'voidspire',
        boss: 'void_herald_shessi',
        offer: [
          `Your name is on my wall. I did not cut it. It appeared the night you came back from the Spire, very small, at the bottom.`,
          `There is a thing in the Spire that announces. The Listener hears it reading names aloud, one after another, like a herald at a door. Go and make it stop reading yours.`,
        ],
        flavor: `Something in the Spire is reading names aloud, and yours is next.`,
        brief: `Climb into the Hollow Spire and silence the herald that reads the names.`,
        objectives: [
          { kind: 'slay', filter: 'family:aberration', n: 20, desc: `Cut through the herald's audience ({n})` },
          { kind: 'boss', filter: 'boss:void_herald_shessi', n: 1, desc: `Silence Shessi, Herald of the Hollow` },
        ],
        ready: `The herald is silent. Marrow will want to look at the wall with you.`,
        turnIn: [
          `Come here. Look. Your name is gone. The stone is smooth where it was, smoother than I can polish.`,
          `I have decided something. Every name on this wall, I am cutting again, deeper. An inch. Let the deep try to fill that.`,
          `Take the old chisel. I will not need it. I have bought a heavier one.`,
        ],
        outcome: `Your name is gone from the wall, and Marrow is recutting every name an inch deep.`,
        reward: { gold: 1.8, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Gilder Hain — the eleventh
  // =========================================================================
  {
    id: 'gilder',
    name: 'The Eleventh',
    giver: 'gilder',
    blurb: `Gilder Hain left a man on the sixth tier eleven years ago and has never stopped going back for him.`,
    steps: [
      {
        title: "Ferris's Knife",
        minDepth: 6,
        biome: 'caverns',
        offer: [
          `We left Ferris on the sixth, where the roots come through. He had a knife with a bone grip, his father's. If the knife is still there, so is he, more or less.`,
          `I cannot go. Do not ask me to go. Go for me.`,
        ],
        flavor: `Gilder left Ferris on the sixth tier, where the roots come through.`,
        brief: `Search the Root Deeps for Ferris and his bone-gripped knife.`,
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 14, desc: `Clear the root halls where Ferris was left ({n})` },
          { kind: 'slayElite', n: 2, desc: `Kill what nests in the roots ({n})` },
        ],
        ready: `You found the knife. Not Ferris. Gilder will want it anyway.`,
        turnIn: [
          `That is his. That is the grip. Where was it?`,
          `Driven into the root wall up to the hilt, pointing down. Pointing down. He was showing us which way he went.`,
          `He did not die there. He went on, with a broken leg. Why would he go on?`,
        ],
        outcome: `Ferris's knife was driven into the root wall, pointing down. He did not die where he was left.`,
        reward: { gold: 1.2, xp: 1.2 },
      },
      {
        title: 'The Way We Went',
        minDepth: 10,
        biome: 'ashwaste',
        boss: 'ashen_prophet',
        offer: [
          `There was a preacher in the Cinderfields. Kaveh. He told us the way down. He told us gladly, which should have warned us.`,
          `If Ferris went on, he went the way Kaveh pointed. Go and ask the preacher where he sent a man with a broken leg.`,
        ],
        flavor: `A preacher in the Cinderfields told the Third Expedition the way down.`,
        brief: `Find Kaveh, the Ashen Prophet, in the Cinderfields and learn where he sent Ferris.`,
        objectives: [
          { kind: 'slay', filter: 'family:demon', n: 14, desc: `Get through Kaveh's congregation ({n})` },
          { kind: 'boss', filter: 'boss:ashen_prophet', n: 1, desc: `Silence Kaveh, the Ashen Prophet` },
        ],
        ready: `Kaveh is silent, and his sermon notes name the eleventh tier. Tell Gilder.`,
        turnIn: [
          `The eleventh. Of course it was. He sent everyone to the eleventh.`,
          `He told us the bottom was there. He told us somebody was waiting there who would be glad of the company. We thought it was a way of speaking.`,
          `Ferris believed him. Ferris always believed the man with the loudest voice.`,
        ],
        outcome: `Kaveh sent every delver to the eleventh tier, promising company at the bottom.`,
        reward: { gold: 1.3, xp: 1.3, item: 'rare' },
      },
      {
        title: 'The Eleventh',
        minDepth: 11,
        biome: 'caverns',
        boss: 'stalker_prime',
        offer: [
          `Do not go to the eleventh.`,
          `Go to the eleventh. Find our camp. Find the wall. Find out what happened to Ferris. Then come back and tell me, and I will stop drinking or start properly. One of the two.`,
        ],
        flavor: `The Third Expedition turned back at the eleventh tier. Ferris did not.`,
        brief: `Go to the eleventh tier, find the Third Expedition's camp, and outlast what waits there.`,
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 120, desc: `Hold the eleventh as long as the Third Expedition did ({n}s)` },
          { kind: 'boss', filter: 'boss:stalker_prime', n: 1, desc: `Kill Nul, the Stalker Prime` },
        ],
        ready: `You held the eleventh and lived, and you know what happened to Ferris. Gilder is waiting.`,
        turnIn: [
          `Tell me.`,
          `It wore him. Nul. It took his shape and his limp and walked up the stair behind us, a fourth set of footsteps, and we let it in, because it walked like Ferris.`,
          `So it has been up here all along. Walking the palisade at night. Learning. And you killed it.`,
          `Good. Good. I am going to have one drink, for Ferris, and then I am going to sleep. Take this. It was his. It is no use to me now.`,
        ],
        outcome: `Nul wore Ferris's shape up the stair. It was the fourth set of footsteps. It is dead now.`,
        reward: { gold: 1.6, xp: 1.5, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // The Listener — the Tenant
  // =========================================================================
  {
    id: 'listener',
    name: 'The Tenant',
    giver: 'listener',
    blurb: `The Listener wants you to go where she cannot hear, and tell her what is there.`,
    steps: [
      {
        title: 'Close Its Eyes',
        minDepth: 7,
        biome: 'sunkenTemple',
        boss: 'gaze_of_uln',
        offer: [
          `Something in the Sanctum listens the way I do. It hears further. When I try to listen past it, it looks back.`,
          `Close its eyes, so I can hear what is under it.`,
        ],
        flavor: `Something in the Sanctum looks back whenever the Listener listens.`,
        brief: `Go into the Drowned Sanctum and close Uln's thousand eyes.`,
        objectives: [{ kind: 'boss', filter: 'boss:gaze_of_uln', n: 1, desc: `Blind Uln, the Thousand Gaze` }],
        ready: `The gaze is shut. The Listener will be able to hear further now.`,
        turnIn: [
          `Oh. Oh, it is loud.`,
          `Under the Sanctum there is a slow sound, like breathing, if a breath took a year. That is it. That is the Tenant, asleep. I have been listening to its dreams and thinking they were the deep.`,
          `Thank you. I think. Come back when I have listened longer.`,
        ],
        outcome: `With Uln blind, the Listener can hear the Tenant breathing, very slowly, in its sleep.`,
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: 'Put Your Hand on the Nail',
        minDepth: 14,
        biome: 'voidspire',
        offer: [
          `Go to the Spire. Put your hand on it. Then come back and tell me whether it is moving.`,
          `Do not let anything stop you on the way. Things will try.`,
        ],
        flavor: `The Listener wants to know whether the Spire is moving.`,
        brief: `Reach the heart of the Hollow Spire and lay a hand on its stone.`,
        objectives: [
          { kind: 'cleanse', filter: 'prop:shrine', n: 2, desc: `Lay a hand on the Spire's heartstones ({n})` },
          { kind: 'slay', filter: 'family:aberration', n: 20, desc: `Clear the things that guard the nail ({n})` },
        ],
        ready: `The Spire is moving. Upward. Tell the Listener.`,
        turnIn: [
          `Upward. A finger's width a year, Wenna says. You felt it move under your hand.`,
          `When it comes out, there will be nothing holding it down except whoever is deepest.`,
          `Do not look at me like that. You knew. You have known since the crypt.`,
        ],
        outcome: `The Spire is working loose. When it comes free, only the deepest delver will hold the Tenant down.`,
        reward: { gold: 1.5, xp: 1.4, item: 'rare' },
      },
      {
        title: 'The Bottom',
        minDepth: 25,
        biome: 'voidspire',
        boss: 'the_gaunt_king',
        offer: [
          `There is something on the twenty-fifth that calls itself the bottom. It is lying. I can hear the stair go on past it.`,
          `Go and make it stop lying. Everyone who comes after you needs to know the stair goes on.`,
        ],
        flavor: `A king on the twenty-fifth tier says he is the bottom of the deep.`,
        brief: `Go down to the twenty-fifth tier and prove the Gaunt King is not the bottom.`,
        objectives: [{ kind: 'boss', filter: 'boss:the_gaunt_king', n: 1, desc: `Defeat the Gaunt King, Last Thing in the Deep` }],
        ready: `He was not the last thing. The stair goes on. The Listener heard it first; now you have seen it.`,
        turnIn: [
          `I heard him fall. And then I heard the bottom move. Two tiers, down, the moment he stopped.`,
          `It moves down to make room for you. Do you understand? It is not running. It is being a good host.`,
          `Go on down. I will listen for you the whole way.`,
        ],
        outcome: `The Gaunt King was not the bottom. The bottom moved two tiers down the moment he fell.`,
        reward: { gold: 2, xp: 1.8, item: 'unique' },
      },
      {
        title: 'Making Room',
        minDepth: 40,
        biome: 'voidspire',
        boss: 'first_devourer',
        offer: [
          `It is moving things to make room for you. Old things. Some of them are hungry, and it has let them loose to clear the way.`,
          `The oldest is the first thing that ever ate down here. Everything that went missing is inside it, still awake. I can hear them. Let them out.`,
        ],
        flavor: `Everything that ever went missing below is inside the First Devourer, still awake.`,
        brief: `Go down past the fortieth tier and open the First Devourer.`,
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 150, desc: `Hold your ground while the deep makes room ({n}s)` },
          { kind: 'boss', filter: 'boss:first_devourer', n: 1, desc: `Open Ghaal, the First Devourer` },
        ],
        ready: `Ghaal is open, and everything in it is quiet now. The Listener will have heard.`,
        turnIn: [
          `I heard them go. Hundreds. Some of them said thank you. Some of them said your name, the way you say the name of someone you have been waiting for.`,
          `The Tenant did not try to stop you. It moved aside.`,
          `There is nothing more I can ask of you. Everything below here I can only listen to. Go and be the deepest one. I will be here.`,
        ],
        outcome: `Ghaal is opened and its missing are free. The Tenant moved aside to let you do it.`,
        reward: { gold: 2.4, xp: 2, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Corvane — the lower room
  // =========================================================================
  {
    id: 'corvane',
    name: 'The Lower Room',
    giver: 'corvane',
    blurb: `Corvane will not talk about the lower room. He will talk about money, and that is how it starts.`,
    steps: [
      {
        title: 'Estates',
        minDepth: 3,
        biome: 'crypt',
        offer: [
          `Two hundred estates on my books, nine claimed. The rest are down there, in packs, in chests, on the people who died holding them.`,
          `Recover what the dead still hold. It is not theft when the account is ours. I checked.`,
        ],
        flavor: `Corvane wants the estates of dead delvers recovered from below.`,
        brief: `Recover the estates the dead still carry in the Ossuary Tiers.`,
        objectives: [
          { kind: 'slay', filter: 'family:undead', n: 16, desc: `Turn over the dead who still carry their estates ({n})` },
          { kind: 'slayElite', n: 2, desc: `Take back what the strongest of them hold ({n})` },
        ],
        ready: `The estates are recovered. Corvane will want an inventory.`,
        turnIn: [
          `Excellent. Rope, oil, rations, one will. The will is always the newest item. I will file it.`,
          `One of these packs carries a city seal. Caul's. That is not a delver's estate. That is a founder's.`,
          `Interesting. Statistically, very interesting. Take your commission.`,
        ],
        outcome: `Among the estates of the dead was a pack with Caul's seal: a founder's.`,
        reward: { gold: 1.3, xp: 0.9 },
      },
      {
        title: 'The Third Signature',
        minDepth: 10,
        biome: 'sunkenTemple',
        boss: 'treant_elder_vhoss',
        offer: [
          `Stairhead had three founders. Two are buried under the vault, which is the safest place in the world to be buried. The third went down to make sure the arrangement held.`,
          `The Listener says something in the Sanctum's drowned grove has put every corpse there to work, and one of them still wears a signet ring. I want the ring.`,
        ],
        flavor: `One of Stairhead's three founders went below to make sure the arrangement held.`,
        brief: `Find the founder in the Sanctum's drowned grove and recover her ring.`,
        objectives: [
          { kind: 'slay', filter: 'family:humanoid', n: 14, desc: `Cut down the grove's drowned workers ({n})` },
          { kind: 'boss', filter: 'boss:treant_elder_vhoss', n: 1, desc: `Fell Vhoss, Elder of the Drowned Grove` },
        ],
        ready: `You have the signet. Corvane will want it in his hand.`,
        turnIn: [
          `Aldis Rook. The third signature. She went down to hold the line herself, and the roots held her instead.`,
          `This ring opens the lower room. I have the other two. I have never had all three.`,
          `Come back when I have had time to decide whether to use it.`,
        ],
        outcome: `You recovered Aldis Rook's ring, the third key to the lower room.`,
        reward: { gold: 1.5, xp: 1.3, item: 'rare' },
      },
      {
        title: 'The Countersignature',
        minDepth: 16,
        biome: 'ashwaste',
        boss: 'magma_sovereign',
        offer: [
          `I opened the lower room. I read what is in it. I wish I had not, and I need you to finish the reading for me.`,
          `The charter has two signatures. Ours, and a mark in something that was still hot when it was pressed into the vellum. The other party's agent. It came up from the Cinderfields to sign, and went back down. Find it.`,
        ],
        flavor: `Stairhead's charter was countersigned by something from the Cinderfields.`,
        brief: `Find the thing in the Cinderfields that countersigned the charter, and end it.`,
        objectives: [
          { kind: 'slay', filter: 'family:demon', n: 18, desc: `Get through the countersigner's court ({n})` },
          { kind: 'boss', filter: 'boss:magma_sovereign', n: 1, desc: `Unmake Ixthar, the Magma Sovereign` },
        ],
        ready: `The countersigner is dead. Corvane should know the charter has one living party left.`,
        turnIn: [
          `Ixthar. A sovereign. They sent a sovereign to sign with a camp of two hundred. That tells you what we were worth to them.`,
          `Here it is. The charter. I will read it once more and then never again. "One of ours below at all times, and it stays below us. For Stairhead, three founders. For the Tenant, its agent, in fire."`,
          `The agent is dead. The bargain is not. It never needed the paper. It only ever needed someone below. Statistically, that has always been you.`,
        ],
        outcome: `You read the charter: one of Stairhead's below at all times, and the Tenant stays below them.`,
        reward: { gold: 2, xp: 1.6, item: 'unique' },
      },
    ],
  },

  // =========================================================================
  // Wenna Torr — the survey
  // =========================================================================
  {
    id: 'wenna',
    name: 'The Survey',
    giver: 'wenna',
    blurb: `Wenna Torr wants one honest measurement of the deep. The deep keeps declining to give her one.`,
    steps: [
      {
        title: 'Benchmarks',
        minDepth: 2,
        biome: 'caverns',
        offer: [
          `I need a benchmark. A fixed point to measure from. The shrines are the only things down there that do not move, as far as I can tell.`,
          `Clear the tier so I can trust the reading, and touch a shrine for me. I will know the depth from what it does to you.`,
        ],
        flavor: `The surveyor needs one fixed point in the Root Deeps.`,
        brief: `Clear the Root Deeps and set a benchmark at a shrine.`,
        objectives: [
          { kind: 'slay', filter: 'any', n: 35, desc: `Clear the tier for a clean reading ({n})` },
          { kind: 'cleanse', filter: 'prop:shrine', n: 1, desc: `Set a benchmark at a shrine ({n})` },
        ],
        ready: `Benchmark set. Wenna will want the numbers while they are fresh.`,
        turnIn: [
          `Lovely. The shrine reads as the second tier from the top and the ninth from the bottom.`,
          `There are not eleven tiers. There are not nine. The shrine is counting from a bottom that has since moved.`,
          `This is the best day I have had in years. Here. Survey pay. Do not tell the council how much.`,
        ],
        outcome: `Your benchmark counts from a bottom that has since moved.`,
        reward: { gold: 1, xp: 1 },
      },
      {
        title: 'Ninety Down, a Hundred and Forty Back',
        minDepth: 5,
        biome: 'hive',
        offer: [
          `In the warrens a corridor measures ninety feet going down and a hundred and forty coming back. I want to know where the other fifty go.`,
          `Stay down there long enough for a proper reading. Things will object. Let them.`,
        ],
        flavor: `A corridor in the warrens measures longer on the way back.`,
        brief: `Hold out in the Chitin Warrens long enough for a proper reading.`,
        objectives: [
          { kind: 'survive', filter: 'zone:any', n: 90, desc: `Stay long enough for a reading ({n}s)` },
          { kind: 'slay', filter: 'family:insect', n: 16, desc: `Clear what objects to the survey ({n})` },
        ],
        ready: `Reading taken. It is the strangest number you have ever written down. Wenna will love it.`,
        turnIn: [
          `Fifty feet. Every time. And it is not distance, it is time. The corridor is older on the way back.`,
          `The deep is not a place, exactly. It is a place that is being kept, and keeping takes time, and the time has to come from somewhere.`,
          `I am going to need a bigger notebook.`,
        ],
        outcome: `The extra fifty feet are time: the deep is being kept, and keeping costs it.`,
        reward: { gold: 1.2, xp: 1.2, item: 'rare' },
      },
      {
        title: 'The Lean of the Spire',
        minDepth: 14,
        biome: 'voidspire',
        boss: 'stormcrown_azhek',
        offer: [
          `I measured the Spire's lean against the old survey. It is moving, a finger's width a year. I want a measurement from inside it.`,
          `There is a storm up the Spire that throws off every instrument I send. It wears a crown, apparently. Take the crown off.`,
        ],
        flavor: `A storm inside the Spire throws off every survey instrument.`,
        brief: `Climb the Hollow Spire and uncrown the storm that spoils the survey.`,
        objectives: [
          { kind: 'slay', filter: 'family:elemental', n: 12, desc: `Ground the storm's lesser charges ({n})` },
          { kind: 'boss', filter: 'boss:stormcrown_azhek', n: 1, desc: `Uncrown Azhek, the Stormcrown` },
        ],
        ready: `The storm is down and the needle holds steady. Wenna will want the reading.`,
        turnIn: [
          `Steady at last. And the reading is upward. The Spire is being pushed out from below.`,
          `A nail does not come out by itself. Something is pressing on the point.`,
          `You are the first person to give me a measurement I believe. I am putting your name on the survey. In ink. Renn lent me some.`,
        ],
        outcome: `The Spire is being pushed out from below, a finger's width a year.`,
        reward: { gold: 1.5, xp: 1.4, item: 'rare' },
      },
    ],
  },

  // =========================================================================
  // Hesk — bad debts
  // =========================================================================
  {
    id: 'hesk',
    name: 'Bad Debts',
    giver: 'hesk',
    blurb: `Hesk is owed money by things that never meant to pay.`,
    steps: [
      {
        title: 'Rope',
        minDepth: 1,
        biome: 'caverns',
        offer: [
          `Delvers die owing me. That is a cost of business. Things down there have also run up accounts, and that is not.`,
          `Go and collect. I do not mind how. Bring back what they owe and I will call it square.`,
        ],
        flavor: `Hesk is owed, and she does not mind how she is paid.`,
        brief: `Collect what the Root Deeps owe Hesk, from whatever down there owes it.`,
        objectives: [
          { kind: 'slay', filter: 'any', n: 25, desc: `Collect from the debtors ({n})` },
          { kind: 'slay', filter: 'family:beast', n: 6, desc: `Collect from the rats that ate the rope ({n})` },
        ],
        ready: `The accounts are settled, roughly. Back to Hesk.`,
        turnIn: [
          `Square. Roughly. I will round in your favour, which I never do, so do not get used to it.`,
          `Somebody down there keeps buying my rope through a third party. I can tell from the knots in what comes back. Not a delver's knot.`,
        ],
        outcome: `Someone below has been buying Hesk's rope through a third party.`,
        reward: { gold: 1.2, xp: 0.8 },
      },
      {
        title: "The Butcher's Tab",
        minDepth: 3,
        biome: 'crypt',
        boss: 'butcher_grell',
        offer: [
          `Grell bought hooks on credit. Sixty years ago, from the woman who had this wagon before me. A great many hooks. He has used every one.`,
          `He is the only customer I have ever been afraid to bill. You are not afraid of anything yet, which makes you ideal.`,
        ],
        flavor: `The Butcher has owed Stairhead for his hooks for sixty years.`,
        brief: `Find Grell the Butcher in the crypt and settle sixty years of credit.`,
        objectives: [{ kind: 'boss', filter: 'boss:butcher_grell', n: 1, desc: `Collect from Grell, the Butcher` }],
        ready: `The Butcher's account is closed. Hesk will want to hear it.`,
        turnIn: [
          `Closed. Sixty years. I am going to rule that line off with the good pen.`,
          `Keep the hooks. I do not want them in the wagon. Take this instead, and never say I did not pay a debt.`,
        ],
        outcome: `Grell's sixty-year tab is closed.`,
        reward: { gold: 1.4, xp: 1.1, item: 'rare' },
      },
      {
        title: 'Collars',
        minDepth: 5,
        biome: 'caverns',
        boss: 'hound_master_vess',
        offer: [
          `Vess bought collars. Forty hounds' worth. She paid in hounds, which I did not accept, so they came back up the stair to discuss it, and Renn rang the bell.`,
          `Some of what tried the gate was hers, then. Not everything down there is the Tenant. Some of it is debtors. Go and tell her the account is closed.`,
        ],
        flavor: `Vess the Hound Master paid her debt to Hesk in hounds.`,
        brief: `Find Vess in the Root Deeps and close her account.`,
        objectives: [
          { kind: 'slay', filter: 'family:beast', n: 16, desc: `Return the hounds she paid in ({n})` },
          { kind: 'boss', filter: 'boss:hound_master_vess', n: 1, desc: `Close the account of Vess, the Hound Master` },
        ],
        ready: `Vess will not be paying in hounds again. Hesk will want to know.`,
        turnIn: [
          `Closed. Good. Renn owes me an apology about the bell, and she will not give it, and I will enjoy that.`,
          `Three bad debts settled. You have a head for collection. If you ever stop going down, there is a stool behind the counter.`,
          `You will not stop going down. Nobody does. Here. Your share.`,
        ],
        outcome: `Vess's account is closed. Hesk offered you a stool behind the counter, knowing you would not take it.`,
        reward: { gold: 1.6, xp: 1.2, item: 'rare' },
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
