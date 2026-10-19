/**
 * SLAY — the people of Stairhead.
 *
 * Nine of them. Five keep a service and four only talk, and every one of them
 * has something to say that changes as you go deeper: news when you come back
 * up, a reaction when the descent shows you something new, and a few things
 * you can ask about that open up as you learn enough to ask.
 *
 * Voices, so additions stay in character:
 *   Hesk      prices everything, including feelings. Dry. Never wrong.
 *   Kale      short sentences. Iron. Says less than he knows.
 *   Vell      clinical, kind underneath, counts her failures.
 *   Corvane   speaks in statistics and paperwork. Hides the lower room.
 *   Marrow    gallows humour, chisel, lettering. Gentle about grief.
 *   Renn      duty, the roster, the bell. Plain and tired and right.
 *   Listener  reports, never predicts. Present tense. Unsettling calm.
 *   Gilder    drunk, bright, wounded. Ferris. The eleventh.
 *   Wenna     delighted by every measurement that disagrees.
 *
 * Priority: `once` lines are news and outrank everything repeatable. Lines
 * without `once` all share one pool, conditional ones included, so a warden
 * hears the warden line some of the time, not every time.
 */

import type { NpcDef, NpcId } from './types';
import { tr } from '../../core/I18n';

export const NPCS: Record<NpcId, NpcDef> = {
  hesk: {
    id: 'hesk',
    name: tr('Hesk'),
    role: tr('Quartermaster'),
    station: 'vendor',
    serviceLabel: tr('Show me what you have'),
    serviceIcon: 'coin',
    portrait: tr('A small, exact woman who has outlasted nine expeditions by never joining one. Her ledger goes back further than Stairhead does, and nobody has ever caught her out in it.'),
    lines: [
      { id: 'hesk.first', pri: 10, when: { first: true }, text: tr('New face. I am Hesk. I sell what keeps you alive and buy what failed to keep the last one alive. We will get on.') },
      { id: 'hesk.died', pri: 9, when: { after: 'died' }, text: tr('{lastFallen} had an account with me. It is closed. Yours is open. Those are the only two states I recognise.') },
      { id: 'hesk.cleared', pri: 8, when: { after: 'cleared' }, text: tr('Tier {depth} and back. Put the pack on the counter. I will try not to look impressed, and I will manage it.') },
      { id: 'hesk.house', pri: 5, once: true, when: { chapter: 'ch.house' }, text: tr('Caul paid rent in bodies for nine hundred years. I have seen the receipts. Do not ask me where.') },
      { id: 'hesk.rises', pri: 6, once: true, when: { chapter: 'ch.rises' }, text: tr('You have worked out what you are for. Good. Now I can stop pretending the discount is kindness.') },
      { id: 'hesk.bottom', pri: 6, once: true, when: { depth: 26 }, text: tr('Past the bottom and still buying. My supplier will not believe it. I am my supplier.') },
      { id: 'hesk.g1', text: tr('You are alive. Good. That affects the pricing.') },
      { id: 'hesk.g2', text: tr('I have what you need. You will not like the number.') },
      { id: 'hesk.g3', text: tr('Two rules. Do not buy on credit, and do not name your weapon.') },
      { id: 'hesk.g4', text: tr('Everything down there was up here once. Remember that when you price a find.') },
      { id: 'hesk.g5', text: tr('The dead are terrible customers and excellent suppliers.') },
      { id: 'hesk.g6', text: tr('I stock rope. Nobody buys rope. Everybody, at some point, wants rope.') },
      { id: 'hesk.warden', when: { cls: 'warden' }, text: tr('Knights buy shields and never sell them. Bad for business. Good for knights.') },
      { id: 'hesk.pyro', when: { cls: 'mage' }, text: tr('I keep the lamp oil on the high shelf while you are in the wagon. Nothing personal.') },
      { id: 'hesk.revenant', when: { cls: 'revenant' }, text: tr('A revenant. You have died once already, so you know what things are worth. Haggle accordingly.') },
      { id: 'hesk.shifter', when: { cls: 'shapeshifter' }, text: tr('You wore the bear into my wagon last time. I am charging you for the doorframe. Come in as a man or come in through the gap you made.') },
      { id: 'hesk.paladin', when: { cls: 'paladin' }, text: tr('Candles by the gross, again. Whatever you are praying for down there, it is costing you four coppers a night.') },
      { id: 'hesk.many', when: { fallen: 5 }, text: tr('{fallen} names on the wall from your account, and every one of them bought rope. Buy rope.') },
    ],
    topics: [
      {
        id: 'stairhead',
        label: tr('Stairhead'),
        text: [
          tr('Two hundred people, eleven guards, one gate, and me. The palisade keeps out wolves.'),
          tr('Everything else is kept out by people like you, going the other way. I do not price that. I would not know where to start.'),
        ],
      },
      {
        id: 'ledger',
        label: tr('Your ledger'),
        when: { depth: 2 },
        text: [
          tr('Every delver who buys from me gets a line. Credit, debit, last purchase. When the line stops, I rule it off.'),
          tr('The book is mostly rules now. I keep it anyway. Somebody ought to know what they spent.'),
        ],
      },
      {
        id: 'caul',
        label: tr('Caul'),
        when: { chapter: 'ch.house' },
        text: [
          tr('The city before the camp. It sold the deep its dead and kept the change. Nine hundred years of trade, and they still went under.'),
          tr('Bad terms. I would never have signed them. I would have signed something worse and enjoyed it.'),
        ],
      },
      {
        id: 'purpose',
        label: tr('What delvers are for'),
        when: { chapter: 'ch.rises' },
        text: [
          tr('You go down, and it comes up to meet you. While it is busy with you it is not busy with us. That is the trade, and it is the only one in camp that has never been renegotiated.'),
          tr('Do not look at me like that. I did not write it. I only keep the books.'),
        ],
      },
    ],
    arrival: [],
  },

  kale: {
    id: 'kale',
    name: tr('Ordrun Kale'),
    role: tr('Smith'),
    station: 'blacksmith',
    serviceLabel: tr('Work on my gear'),
    serviceIcon: 'anvil',
    portrait: tr('Enormous, deliberate, and burned white up both forearms from an accident he will not discuss. He works to the standard of a place that no longer exists, and he keeps his opinions about deep-forged steel behind his teeth.'),
    lines: [
      { id: 'kale.first', pri: 10, when: { first: true }, text: tr('Ordrun Kale. I mend what you break and I break what you cannot mend. Put it on the bench.') },
      { id: 'kale.died', pri: 9, when: { after: 'died' }, text: tr('I kept {lastFallen}\'s blade on the rack. Take it if it fits. That is how it works here.') },
      { id: 'kale.cleared', pri: 8, when: { after: 'cleared' }, text: tr('You brought it back. Both of you, more or less intact. Show me the edge.') },
      { id: 'kale.war', pri: 5, once: true, when: { chapter: 'ch.war' }, text: tr('So you have seen the Works. Good iron, down there. Better than mine. Do not ask me to say why.') },
      { id: 'kale.hurn', pri: 6, once: true, when: { slain: 'forgefather_hurn' }, text: tr('Hurn is down. Four hundred years at that anvil and he never once struck it wrong. I would have liked to watch him work. Once.') },
      { id: 'kale.g1', text: tr('Steel first. Talk after.') },
      { id: 'kale.g2', text: tr('Everything breaks. The trick is choosing where.') },
      { id: 'kale.g3', text: tr('Good iron is patient. Be more like the iron.') },
      { id: 'kale.g4', text: tr('I have reforged the same sword nine times for six people. It is still the sword. They were not still the people.') },
      { id: 'kale.g5', text: tr('You have been swinging off the wrist again. It shows in the edge.') },
      { id: 'kale.warden', when: { cls: 'warden' }, text: tr('A knight\'s shield should be scored on the face and clean on the rim. Show me yours and I will tell you how you fight.') },
      { id: 'kale.shadow', when: { cls: 'shadowblade' }, text: tr('Small blades. Fine work. I do not trust either, and I sharpen both.') },
      { id: 'kale.ranger', when: { cls: 'ranger' }, text: tr('Bowstaves are not my trade. Arrowheads are. Bring me the ones you pull out of things.') },
      { id: 'kale.shifter', when: { cls: 'shapeshifter' }, text: tr('You want a weapon for a man whose hands turn into paws. I can make it. I cannot make it survive the turning. Bring it back bent and I will straighten it.') },
      { id: 'kale.paladin', when: { cls: 'paladin' }, text: tr('Every dent in that mace head is a word you meant. I can take them out. You will only put them back.') },
    ],
    topics: [
      {
        id: 'arms',
        label: tr('Your arms'),
        when: { notDone: 'kale:2' },
        text: [tr('An accident.'), tr('That is the whole answer. Ask again when you have earned a longer one.')],
      },
      {
        id: 'quench',
        label: tr('The quench'),
        when: { done: 'kale:2' },
        text: [
          tr('You know already. What runs off the Tenant takes skin and gives edge.'),
          tr('Do not try it. I have meant very few things as much as I mean that.'),
        ],
      },
      {
        id: 'steel',
        label: tr('Deep steel'),
        when: { depth: 3 },
        text: [
          tr('What comes up from the Works holds an edge longer than anything I can make. It is quenched in something. I tried to find out what.'),
          tr('I found out.'),
        ],
      },
      {
        id: 'works',
        label: tr('The Cindergate Works'),
        when: { chapter: 'ch.war' },
        text: [
          tr('Built to arm a city against what was under it. The order book gives a depth, not an enemy.'),
          tr('Think about that the next time you pick up something they made, and like the balance.'),
        ],
      },
      {
        id: 'trade',
        label: tr('Where you learned'),
        text: [
          tr('My master learned from a woman who learned from a man, and so on back, a dozen pairs of hands, to someone who learned at Cindergate before the fall.'),
          tr('You can see it in how I hold the tongs, if you know what to look for. Nobody does.'),
        ],
      },
    ],
  },

  vell: {
    id: 'vell',
    name: tr('Sister Vell'),
    role: tr('Apothecary'),
    station: 'alchemist',
    serviceLabel: tr('I need tinctures'),
    serviceIcon: 'potion',
    // Rendering three stones into one is an apothecary's reduction.
    extraServices: [{ label: tr('Fuse my gems and runes'), icon: 'gem', panel: 'fuse' }],
    portrait: tr('Left an order that has since been dissolved, and kept the habit, the pharmacopoeia and a list of nineteen names. Her hands are steady in a way that takes practice.'),
    lines: [
      { id: 'vell.first', pri: 10, when: { first: true }, text: tr('Sit. Show me. Do not tell me it is nothing. I am Vell, and I have heard "it is nothing" from nineteen people I could not save.') },
      { id: 'vell.died', pri: 9, when: { after: 'died' }, text: tr('I sat with {lastFallen}\'s things for an hour. That is all there was to sit with. Drink this. It is for you, not for the grief.') },
      { id: 'vell.cleared', pri: 8, when: { after: 'cleared' }, text: tr('Still whole. I will put you in the good column. It is a short column.') },
      { id: 'vell.tenant', pri: 5, once: true, when: { chapter: 'ch.tenant' }, text: tr('Things grow down there that ought to need sun. The grey mould from the crypt tiers cures fevers. I would like to know who is tending it.') },
      { id: 'vell.hour', pri: 4, once: true, when: { fallen: 3 }, text: tr('Come to me inside the hour when you are hurt. Almost nobody does. That is most of the nineteen, right there.') },
      { id: 'vell.g1', text: tr('Pain is information. Numbing it is a decision, not a cure.') },
      { id: 'vell.g2', text: tr('Drink it slowly. Everyone drinks it fast and then complains about the taste twice.') },
      { id: 'vell.g3', text: tr('I have three tinctures. Two of them are honest.') },
      { id: 'vell.g4', text: tr('Come back damaged rather than not at all.') },
      { id: 'vell.g5', text: tr('You are bleeding into your own boot. Sit down.') },
      { id: 'vell.revenant', when: { cls: 'revenant' }, text: tr('No pulse worth the name and your colour is wrong. On you that is health. Sit anyway.') },
      { id: 'vell.storm', when: { cls: 'mage' }, text: tr('Your hair is standing on end and your fingers are cold. Do not touch the glassware.') },
      { id: 'vell.shifter', when: { cls: 'shapeshifter' }, text: tr('Your pulse is a cat\'s, your bruises are a bear\'s and your teeth are not yours at all. Which one of you am I dosing today?') },
      { id: 'vell.paladin', when: { cls: 'paladin' }, text: tr('Wax burns on both wrists and smoke in your lungs. Your order calls that devotion. I call it Tuesday. Sit.') },
    ],
    topics: [
      {
        id: 'nineteen',
        label: tr('The nineteen names'),
        text: [
          tr('The front page of my pharmacopoeia. Nineteen people I could not bring back. I write the name, the tier, and what I did wrong.'),
          tr('Some of the lines are short. Those are the ones where I did nothing wrong, and it went that way anyway.'),
        ],
      },
      {
        id: 'order',
        label: tr('Your order'),
        text: [
          tr('The Lantern Sisters. We kept a light burning at the top of the stair for anybody coming up it.'),
          tr('The order was dissolved when the light started being answered from below. I kept the habit. Habits are not dissolved by letter.'),
        ],
      },
      {
        id: 'mould',
        label: tr('The grey mould'),
        when: { depth: 3 },
        text: [
          tr('It grows on the crypt shelves and stops a wound going bad faster than anything I can buy. It grows in rows. Tidy rows.'),
          tr('I do not know who plants it. I use it anyway. That is what an apothecary is.'),
        ],
      },
    ],
  },

  corvane: {
    id: 'corvane',
    name: tr('Corvane'),
    role: tr('Vaultkeeper'),
    station: 'stash',
    serviceLabel: tr('Open the vault'),
    serviceIcon: 'stash',
    portrait: tr('Runs the only vault the deep has never reached. He credits good masonry. Everyone else credits whatever he keeps in the lower room.'),
    lines: [
      { id: 'corvane.first', pri: 10, when: { first: true }, text: tr('Corvane, Vaultkeeper. Deposits down, withdrawals across. The vault is shared by everyone who carries your name in my book, living or otherwise.') },
      { id: 'corvane.died', pri: 9, when: { after: 'died' }, text: tr('{lastFallen}\'s estate passes to the account, per the standing arrangement. Sign here. Everyone signs here eventually.') },
      { id: 'corvane.cleared', pri: 8, when: { after: 'cleared' }, text: tr('Returned, and with assets. Statistically the less likely outcome. I have adjusted the tables.') },
      { id: 'corvane.rises', pri: 6, once: true, when: { chapter: 'ch.rises' }, text: tr('So you know. Good. The paperwork is simpler when the depositor understands what the deposit is for.') },
      { id: 'corvane.dynasty', pri: 4, once: true, when: { fallen: 10 }, text: tr('Ten estates on a single account. That is not a tragedy. In my records it is a dynasty.') },
      { id: 'corvane.g1', text: tr('The vault holds. It always holds. Ask me again next year.') },
      { id: 'corvane.g2', text: tr('Gold is only heavy on the way up.') },
      { id: 'corvane.g3', text: tr('Dry, cold and boring. Those are the three virtues of a vault.') },
      { id: 'corvane.g4', text: tr('I have held the estates of two hundred delvers. Nine came back for them.') },
      { id: 'corvane.g5', when: { notDone: 'corvane' }, text: tr('Do not ask about the lower room.') },
    ],
    topics: [
      {
        id: 'vault',
        label: tr('The vault'),
        text: [
          tr('Stone from the city\'s own foundations, laid dry, no mortar, by people who knew what mortar can be persuaded to do.'),
          tr('Nothing has ever come up into it. I would know. I sleep in it.'),
        ],
      },
      {
        id: 'estates',
        label: tr('Estates'),
        text: [
          tr('When a delver dies, what they banked stays banked, and passes to whoever comes next on the same account. Stairhead does not waste a dead delver\'s savings.'),
          tr('It would be bad for morale. Mine.'),
        ],
      },
      {
        id: 'lower',
        label: tr('The lower room'),
        when: { notDone: 'corvane' },
        text: [tr('No.')],
      },
      {
        id: 'charter',
        label: tr('The charter'),
        when: { done: 'corvane' },
        text: [
          tr('One of ours below at all times, and it stays below us. Three founders signed it. One of them went down to make sure.'),
          tr('I read it every night now, to see whether it says anything else. It does not. It never needed to.'),
        ],
      },
    ],
  },

  marrow: {
    id: 'marrow',
    name: tr('Old Marrow'),
    role: tr('Gravekeeper'),
    station: 'memorial',
    serviceLabel: tr('Read the wall'),
    serviceIcon: 'skull',
    portrait: tr('Digs graves that stay empty, since bodies rarely come back up the stair. He cuts the memorial himself and has strong views about the lettering.'),
    lines: [
      { id: 'marrow.first', pri: 10, when: { first: true }, text: tr('Another one going down. I am Marrow. I will not wish you luck. It has never helped anybody on that wall.') },
      { id: 'marrow.died', pri: 9, when: { after: 'died' }, text: tr('I have cut {lastFallen}. Three-quarters of an inch, every letter. Come and read it when you can stand to.') },
      { id: 'marrow.cleared', pri: 8, when: { after: 'cleared' }, text: tr('Not today, then. Good. I hate the chisel.') },
      { id: 'marrow.eleventh', pri: 6, once: true, when: { chapter: 'ch.eleventh' }, text: tr('There is a name in my wall I did not cut. I would know my own work. Somebody down there is doing the lettering now.') },
      { id: 'marrow.column', pri: 4, once: true, when: { fallen: 20 }, text: tr('{fallen} on the wall from your account alone. I have started a second column. The stone does not mind. I do.') },
      { id: 'marrow.g1', text: tr('Names should be cut deep. Shallow letters wear off, and then who were they.') },
      { id: 'marrow.g2', text: tr('The wall has more names than the camp has people. The stonework has been extended twice.') },
      { id: 'marrow.g3', text: tr('I have never been down. I have met everything that lives down there. It comes to me eventually.') },
      { id: 'marrow.g4', text: tr('Grief is a job like any other. Somebody has to keep the tools.') },
      { id: 'marrow.g5', text: tr('Do not take it as pessimism. I dig for everyone.') },
      { id: 'marrow.revenant', when: { cls: 'revenant' }, text: tr('You have been on a wall before, I think. It shows in how you read mine.') },
      { id: 'marrow.shifter', when: { cls: 'shapeshifter' }, text: tr('If the wall ever gets you, I will need to know which shape to cut. I will cut the man. The others never sat still for me.') },
      { id: 'marrow.paladin', when: { cls: 'paladin' }, text: tr('You say the words over the ones you put down. Good. Somebody ought to, and I am tired.') },
    ],
    topics: [
      {
        id: 'wall',
        label: tr('The wall'),
        text: [
          tr('Every delver who did not come back. Name, tier, and what took them, if anybody knows.'),
          tr('I cut them at three-quarters of an inch. Anything shallower is a rumour.'),
        ],
      },
      {
        id: 'graves',
        label: tr('The empty graves'),
        text: [
          tr('I dig one for every delver the morning they go down. Most stay empty. Bodies do not come up the stair.'),
          tr('Some of the graves are filled in by morning. Not by me. I do not dig those up to check.'),
        ],
      },
    ],
  },

  renn: {
    id: 'renn',
    name: tr('Captain Ilsa Renn'),
    role: tr('Captain of the Watch'),
    portrait: tr('Holds a wall against a thing that has never once attacked it, with eleven guards and a bell. She considers this the most important work in the world, and she is probably right.'),
    lines: [
      { id: 'renn.first', pri: 10, when: { first: true }, text: tr('Captain Ilsa Renn, Stairhead watch. You are going down, so you go on my roster first. If you are not on the roster, nobody knows to stop waiting.') },
      { id: 'renn.died', pri: 9, when: { after: 'died' }, text: tr('I posted the notice for {lastFallen}. It is the part of the rank nobody warns you about. You are on the roster now. Do better than the line above you.') },
      { id: 'renn.cleared', pri: 8, when: { after: 'cleared' }, text: tr('Struck off the overdue list. Do not make a habit of the other column.') },
      { id: 'renn.rises', pri: 6, once: true, when: { chapter: 'ch.rises' }, text: tr('Now you know why I watch the gate and not the forest. While one of you is below, the bell stays quiet. I would like it to stay quiet.') },
      { id: 'renn.lid', pri: 7, once: true, when: { chapter: 'ch.lid' }, text: tr('The bell has not moved in a season. My guards are getting soft. I find I do not mind.') },
      { id: 'renn.g1', text: tr('Report anything that comes up the stair. Anything.') },
      { id: 'renn.g2', text: tr('We do not hold the stair. We watch it. There is a difference, and it is the whole of my career.') },
      { id: 'renn.g3', text: tr('Eleven guards. Two hundred souls. One gate. Sleep well.') },
      { id: 'renn.g4', text: tr('The bell has rung twice in my service. Both times nothing came through. Both times something had tried.') },
      { id: 'renn.g5', text: tr('You go down of your own will. I have never understood it, and I have stopped saying so.') },
      { id: 'renn.paladin', when: { cls: 'paladin' }, text: tr('You ring yours on purpose, I hear. Do it below. If I hear a bell up here I will assume the worst and I will be right.') },
    ],
    topics: [
      {
        id: 'bell',
        label: tr('The bell'),
        text: [
          tr('Cast from the last bell in Caul, the one that rang the night the city went under. It rings itself when something tests the gate from below.'),
          tr('Twice in my service. Both times at night. Both times the gate watch swore nothing moved.'),
        ],
      },
      {
        id: 'watch',
        label: tr('The watch'),
        text: [
          tr('Eleven, counting me. We are not soldiers. We are witnesses with spears.'),
          tr('If something comes up the stair we will not stop it. We will ring the bell, and everyone will know to run. That is our use, and it is enough.'),
        ],
      },
      {
        id: 'roster',
        label: tr('The roster'),
        when: { chapter: 'ch.tenant' },
        text: [
          tr('Every delver, the day they go down, the tier they reach, the day they come back. I have kept it nineteen years.'),
          tr('There is always a name in the down column. The council has never once allowed it to be empty. I used to wonder why that mattered so much to them.'),
        ],
      },
    ],
    arrival: [
      { id: 'renn.arr.cleared', when: { after: 'cleared' }, text: tr('Gate! {name} is back up. Strike the overdue list.') },
      { id: 'renn.arr.new', when: { after: 'died' }, text: tr('New name on the roster. Welcome to Stairhead, {name}. Mind the gate.') },
    ],
  },

  listener: {
    id: 'listener',
    name: tr('The Listener'),
    role: tr('Oracle'),
    portrait: tr('Sits with her back to the gate and one ear to the ground. She does not predict. She reports what the deep is doing, which people find harder to hear.'),
    lines: [
      { id: 'listener.first', pri: 10, when: { first: true }, text: tr('Quiet. There. It heard you arrive. It always hears the new ones.') },
      { id: 'listener.died', pri: 9, when: { after: 'died' }, text: tr('I heard {lastFallen} stop, on tier {lastDepth}. It went very quiet afterward, the way a room does after a door shuts.') },
      { id: 'listener.cleared', pri: 8, when: { after: 'cleared' }, text: tr('You are louder than you were. It has started to know your step.') },
      { id: 'listener.ch1', pri: 1, once: true, when: { chapter: 'ch.first' }, text: tr('You went down and came back. Your step sounds different on the stair now. It has heard you on its floor.') },
      { id: 'listener.ch3', pri: 3, once: true, when: { chapter: 'ch.tenant' }, text: tr('You saw the swept floors. Yes. It keeps house. I hear it at night, putting things into better order.') },
      { id: 'listener.ch5', pri: 5, once: true, when: { chapter: 'ch.house' }, text: tr('Caul\'s dead are restless this week. They do that when somebody reads the plaque. Did you read the plaque?') },
      { id: 'listener.ch8', pri: 8, once: true, when: { chapter: 'ch.war' }, text: tr('Under the Works there is a hammer that has never stopped. I count with it when I cannot sleep. It has never once missed a beat.') },
      { id: 'listener.ch11', pri: 11, once: true, when: { chapter: 'ch.eleventh' }, text: tr('Your name went down the stair before you did. I heard it go. I thought it was a draught.') },
      { id: 'listener.ch15', pri: 15, once: true, when: { chapter: 'ch.nail' }, text: tr('There is a sound under everything, very low, like a nail being worked loose by a patient hand. I hear it in my teeth now.') },
      { id: 'listener.ch20', pri: 20, once: true, when: { chapter: 'ch.archive' }, text: tr('It is made of what we tried. So it hears us the way you hear your own pulse. Without listening.') },
      { id: 'listener.ch25', pri: 25, once: true, when: { chapter: 'ch.bottom' }, text: tr('The bottom moved last night. Two tiers. Down. You did that.') },
      { id: 'listener.ch30', pri: 30, once: true, when: { chapter: 'ch.rises' }, text: tr('Now you know what I listen for. When you are below, it is turned toward you. When nobody is below, it turns toward us.') },
      { id: 'listener.ch40', pri: 40, once: true, when: { chapter: 'ch.name' }, text: tr('It said part of a name last night. Your part. I did not like how it said it.') },
      { id: 'listener.ch50', pri: 50, once: true, when: { chapter: 'ch.room' }, text: tr('It is moving things to make space. Old things, heavy. It sounds like a house before a guest.') },
      { id: 'listener.ch65', pri: 65, once: true, when: { chapter: 'ch.rent' }, text: tr('It is not hungry. It never was. It is lonely, and it has had a very long time to get good at it.') },
      { id: 'listener.ch80', pri: 80, once: true, when: { chapter: 'ch.deepest' }, text: tr('It has stopped coming up. It is waiting down there with its hands folded. For you.') },
      { id: 'listener.ch100', pri: 100, once: true, when: { chapter: 'ch.lid' }, text: tr('Quiet. All the way down. I can hear you breathing, and under you, nothing. Nothing at all. I think I will sleep tonight.') },
      { id: 'listener.g1', text: tr('It is awake tonight. Not agitated. Awake.') },
      { id: 'listener.g2', text: tr('Every so often it goes quiet. That is the part to be afraid of.') },
      { id: 'listener.g3', text: tr('I do not see the future. I hear the present from further away than you do.') },
      { id: 'listener.g4', text: tr('The deep is not evil. It is occupied, and you keep knocking.') },
      { id: 'listener.g5', text: tr('It heard the gate. It always hears the gate.') },
    ],
    topics: [
      {
        id: 'hear',
        label: tr('What do you hear?'),
        text: [
          tr('Water finding its way down. Stone settling. Under that, something turning over in its sleep, slowly, the way you turn when somebody else has got into the bed.'),
        ],
      },
      {
        id: 'tenant',
        label: tr('The Tenant'),
        when: { chapter: 'ch.tenant' },
        text: [
          tr('That is the old word. Caul\'s word. It is not a beast and not a god. It is somebody who was here first, and keeps the place, and does not mind company.'),
          tr('It does mind being left alone. That is when it comes up to see why.'),
        ],
      },
      {
        id: 'footsteps',
        label: tr('The fourth set of footsteps'),
        when: { best: 4 },
        text: [
          tr('When the Third Expedition came home, three of them climbed the stair. I heard four sets of footsteps.'),
          tr('Three of them went home. I do not know where the fourth went. I hear it some nights, walking the palisade, very carefully, as if it were learning how.'),
        ],
      },
    ],
  },

  gilder: {
    id: 'gilder',
    name: tr('Gilder Hain'),
    role: tr('Of the Third Expedition'),
    portrait: tr('Came back from a depth nobody else has matched, spent the reward in a season, and has not been below ground since. He is the best-informed man in camp between the second drink and the fourth.'),
    lines: [
      { id: 'gilder.first', pri: 10, when: { first: true }, text: tr('You are going down. I can tell by the boots. Sit. Not there. That is where Ferris used to sit.') },
      { id: 'gilder.died', pri: 9, when: { after: 'died' }, text: tr('I knew {lastFallen}. Bought me a drink once and did not want anything for it. That is rarer than the eleventh.') },
      { id: 'gilder.cleared', pri: 8, when: { after: 'cleared' }, text: tr('How deep. No. Do not tell me. Tell me. No.') },
      { id: 'gilder.eleventh', pri: 6, once: true, when: { chapter: 'ch.eleventh' }, text: tr('You have been to the eleventh. I can see it on you. You read the wall. Of course you read the wall.') },
      { id: 'gilder.past', pri: 6, once: true, when: { depth: 12 }, text: tr('You are deeper than we ever got. I would like to hate you for it. I cannot find the energy.') },
      { id: 'gilder.g1', text: tr('We got to the eleventh. Eleventh. Nobody believes it and I have stopped needing them to.') },
      { id: 'gilder.g2', text: tr('Take a second torch. Take a third. Take more torches than you think is stupid.') },
      { id: 'gilder.g3', text: tr('The dark down there is not the absence of light. It has a grain to it, like wood.') },
      { id: 'gilder.g4', text: tr('I hear it in the well water. I hear it in the kettle. That is not madness, it is acoustics.') },
      { id: 'gilder.g5', text: tr('Buy me one and I will tell you about the foundry. Buy me two and I will stop.') },
    ],
    topics: [
      {
        id: 'third',
        label: tr('The Third Expedition'),
        text: [
          tr('Nine of us. Council charter, pay in advance, which should have told us something. We reached the eleventh tier in forty days.'),
          tr('Three came back. Two of those came back short of something you cannot see. I am the third. I came back with everything, and that is the worst of the three.'),
        ],
      },
      {
        id: 'ferris',
        label: tr('Ferris'),
        text: [
          tr('We left him on the sixth, where the roots come through the ceiling. His leg was broken and there was no getting him out. That is the whole story, and it takes nine seconds to tell.'),
          tr('I have been telling it for eleven years.'),
        ],
      },
      {
        id: 'eleventh',
        label: tr('The eleventh'),
        text: [tr('Do not go to the eleventh.'), tr('You will go. Everybody goes. When you get there, do not read the wall.')],
      },
    ],
    arrival: [
      { id: 'gilder.arr.cleared', when: { after: 'cleared', depth: 3 }, text: tr('There they are. Up the stair on their own feet. Somebody buy them a drink. Not me.') },
    ],
  },

  wenna: {
    id: 'wenna',
    name: tr('Wenna Torr'),
    role: tr('Surveyor to the Council'),
    portrait: tr('The fifth to hold the post, and the first to admit the maps are wrong. She measures everything twice, writes both numbers down, and is delighted when they disagree.'),
    lines: [
      { id: 'wenna.first', pri: 10, when: { first: true }, text: tr('Wenna Torr, surveyor. You are going down, so you can help. Count your steps on the stair. Count them again on the way up. Tell me both numbers.') },
      { id: 'wenna.cleared', pri: 8, when: { after: 'cleared' }, text: tr('Tier {depth}! What did the stair come to? Never mind. It will not match. Nothing matches. It is wonderful.') },
      { id: 'wenna.died', pri: 9, when: { after: 'died' }, text: tr('{lastFallen} was carrying one of my chains. I would like it back if anyone finds it. I would like {lastFallen} back more. I know which is likelier.') },
      { id: 'wenna.ch1', pri: 2, once: true, when: { chapter: 'ch.first' }, text: tr('The count gives out at four hundred? Everybody says that. Nobody says which number it gives out on. Write it down next time.') },
      { id: 'wenna.ch15', pri: 15, once: true, when: { chapter: 'ch.nail' }, text: tr('A nail, driven from outside. I have measured the Spire\'s lean against the old survey. It is moving a finger\'s width a year. Upward.') },
      { id: 'wenna.ch50', pri: 50, once: true, when: { chapter: 'ch.room' }, text: tr('Past the fiftieth the layers are out of order. That is not a mapping problem. It is a filing problem, and somebody below is doing the filing.') },
      { id: 'wenna.g1', text: tr('The corridor measures ninety feet going down and a hundred and forty coming back. I have checked. Twice.') },
      { id: 'wenna.g2', text: tr('The old survey marks stop at the seventh tier. Not because the surveyors stopped. Because the marks would not stay put.') },
      { id: 'wenna.g3', text: tr('Distances are advisory down there. Trust the walls, not the map.') },
      { id: 'wenna.g4', text: tr('If you find a brass survey pin, bring it up. Even if it is somewhere it should not be. Especially then.') },
      { id: 'wenna.ranger', when: { cls: 'ranger' }, text: tr('A ranger! Your people mapped the descent by walking it. Your maps are terrible and they are the only ones that work.') },
      { id: 'wenna.shifter', when: { cls: 'shapeshifter' }, text: tr('You walk the stair on two legs going down and four coming back. Tell me your count in both. I suspect the wolf is right.') },
    ],
    topics: [
      {
        id: 'survey',
        label: tr('The survey'),
        text: [
          tr('Four surveyors before me. Every one of them drew the first tier, every drawing is different, and every drawing was right on the day it was made.'),
          tr('The deep is not getting bigger. It is being rearranged. I can prove it. Nearly.'),
        ],
      },
      {
        id: 'tongue',
        label: tr('The survey tongue'),
        text: [
          tr('The notation Caul used for depth. Very precise, very old. It has no word for bottom.'),
          tr('It has eleven words for below, and one of them translates as "volunteer".'),
        ],
      },
    ],
  },
};

export const NPC_IDS = Object.keys(NPCS) as NpcId[];

/** The person who keeps a town station, if any. */
export function npcForStation(station: string): NpcDef | undefined {
  return NPC_IDS.map((id) => NPCS[id]).find((n) => n.station === station);
}

/**
 * Where the people without a station stand, matching the camp figures in
 * `world/Town.ts`. A key of the same name in the town's `npcSpots` wins.
 */
export const TALK_SPOTS: Partial<Record<NpcId, { x: number; z: number }>> = {
  renn: { x: 2.0, z: -13.2 },
  listener: { x: -1.2, z: -13.4 },
  gilder: { x: -3.6, z: 5.6 },
  wenna: { x: 3.4, z: 6.0 },
};
