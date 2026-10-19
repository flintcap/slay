/**
 * SLAY — what the six deep bosses say (data/bosses3.ts).
 *
 * Same rules as bossVoices.ts. Each knows one piece of the bottom: the house
 * that is kept for the Tenant, the glass that grows in the Spire, the company
 * that never came up, the iron that holds the Spire down, the servant that
 * moves the rooms, and the hand that reaches up while the Tenant sleeps.
 * Machines speak in capitals.
 */

import type { BossVoice } from './types';
import { tr } from '../../core/I18n';

export const DEEP_BOSS_VOICES: Record<string, BossVoice> = {
  mother_wickwane: {
    greet: tr('A guest. We so seldom have guests who stay for supper. Sit. Not there. That chair is for the Tenant.'),
    taunts: {
      ahead: tr('There, you see? Tired already. Lie down, dear. Every bed in this house is turned down.'),
      even: tr('I have trimmed ten thousand wicks. You are only one more, and not a very bright one.'),
      behind: tr('Mind the good china. Oh, you have broken it. Oh, you have broken all of it.'),
    },
    enraged: tr('Enough. The house is closed. Every lamp, out.'),
    death: tr('Who will keep the house. Who will keep it now.'),
    slain: tr('Mother Wickwane sinks into her chair and goes soft, and runs, and pools. One by one the candles on the long table bend over and go out.'),
    victory: tr('Tidied away. Fetch the broom.'),
    floor: {
      title: tr('The House Book'),
      source: tr('Open on a lectern by the door, in a careful hand'),
      text: [
        tr('Lamps trimmed: all. Halls swept: all. Beds turned down: all. Guests: none. The Tenant: sleeping, as always. Keep the house as if it might wake tonight.'),
        tr('A later line, in wax, not ink: Somebody came down the stair today. I have laid another place.'),
      ],
    },
  },

  the_glasswright: {
    greet: tr('Every delver who comes down is the shape of a window. I cut them out of the Spire and set them in.'),
    taunts: {
      ahead: tr('Cracked. Good. Cracked glass lets the light through in better places.'),
      even: tr('The Spire is all glass at the heart. I only cut it into people. It likes to look out.'),
      behind: tr('You are making edges of me. Careful. Edges are what I am for.'),
    },
    enraged: tr('No more measuring. Into the frame with you.'),
    death: tr('Leave the panes standing. Somebody should be able to look out.'),
    slain: tr('The Glasswright comes apart along every line of lead at once. In the standing panes around the room, a hundred shapes of delvers turn, slowly, to watch you go.'),
    victory: tr('A good fit. A very good fit.'),
    floor: {
      title: tr('A Cutting List'),
      source: tr('Scratched with a diamond into a pane by the door'),
      text: [
        tr('Panes wanted: one per delver. Shape: theirs. Glass: from the Spire, which grows faster the more I cut.'),
        tr('The Spire does not mind the cutting. I think it wants to be windows. I think it wants to see what it is holding down.'),
      ],
    },
  },

  marshal_harrow: {
    greet: tr('Harrow, marshal, forty-first delving company. Three hundred went down. I am still counting how many come back.'),
    taunts: {
      ahead: tr('You fight like the last ones. They stayed too. Plenty of room in the ranks.'),
      even: tr('We were told the bottom was on the thirtieth. We kept going. We were good at keeping going.'),
      behind: tr('Good. Good! That is how I taught them. That is exactly how I taught them.'),
    },
    enraged: tr('No more drill. Every blade, forward.'),
    death: tr('Call the roll. Call it once. Let them hear their names.'),
    slain: tr('Marshal Harrow goes to one knee, then lies down at the head of his company. Behind him, all along the ranks, the cold blue lights go out, one at a time, in order.'),
    victory: tr('Fall in. You are one of us now.'),
    floor: {
      title: tr('The Roll of the Forty-First'),
      source: tr('A long scroll, weighted with a sword hilt'),
      text: [
        tr('Three hundred names, each one ticked. Beside every tick, the same word, in the same hand: stayed.'),
        tr('At the very bottom, in a newer hand: Harrow, marshal. Not ticked. He would not tick his own name while one of them was still down here.'),
      ],
    },
  },

  the_holdfast: {
    greet: tr('SMALL ONE. YOU STAND ON THE PLATE. THE PLATE HOLDS THE NAIL. THE NAIL HOLDS THE SPIRE.'),
    taunts: {
      ahead: tr('YOU BEND. GOOD. EVERYTHING DOWN HERE BENDS BUT ME.'),
      even: tr('THE FIRST LAYER BOLTED ME HERE. THE FIRST LAYER IS GONE. I AM NOT.'),
      behind: tr('YOU LOOSEN ME. EVERY BLOW, THE SPIRE RISES. DO YOU UNDERSTAND WHAT YOU ARE DOING.'),
    },
    enraged: tr('NO MORE HOLDING BACK. NO MORE HOLDING.'),
    death: tr('THEN YOU HOLD IT. SOMEBODY MUST.'),
    slain: tr('The Holdfast settles onto its plate with a sound like a bell the size of a town. High above, very faintly, the Spire moves upward one more finger\'s width, and stops.'),
    victory: `HELD.`,
    floor: {
      title: tr('Bolting Orders'),
      source: tr('Stamped into the iron plate in letters as tall as a hand'),
      text: [
        tr('HOLD THE NAIL. HOLD THE SPIRE ON THE NAIL. HOLD THE TENANT UNDER THE SPIRE. DO NOT LET GO FOR ANY REASON.'),
        tr('Stamped smaller, underneath: IF THE HOLDFAST FAILS, THE DEEPEST ONE HOLDS. Someone has scratched beside it, with a knife: that is you.'),
      ],
    },
  },

  the_usher: {
    greet: tr('Welcome, welcome. You are expected. You have always been expected. Do come further in.'),
    taunts: {
      ahead: tr('Tired? There is a room for that. I have just made it. It has no door.'),
      even: tr('I move the rooms so you will always have somewhere to go down to. It is the least a good host can do.'),
      behind: tr('Oh, you are rough with the furniture. I shall have to make a new hall. I shall have to make you a new hall.'),
    },
    enraged: tr('I am afraid I must insist. Every door, shut.'),
    death: tr('The rooms will not move now. You will find the bottom. I am so sorry.'),
    slain: tr('The Usher folds down and down until there is only a door, standing alone in the room. It is open. Through it, a stair goes on, and for the first time it does not move.'),
    victory: tr('This way. This way. Down.'),
    floor: {
      title: tr('A Card of Welcome'),
      source: tr('Left on a silver tray in the middle of the floor'),
      text: [
        tr('The Tenant thanks you for coming down, and asks you to go on coming. A room has been made ready below. Another is being made ready below that.'),
        tr('On the back, in a hurried hand: It is not running from you. It is making room. Please stop before there is no more room to make.'),
      ],
    },
  },

  sleepers_hand: {
    greet: tr('So small. So warm. I dreamt you a hundred times. You always came closer. Come closer.'),
    taunts: {
      ahead: tr('Shh. Shh. Lie still. It is only a dream, and dreams are soft.'),
      even: tr('Every stair you climbed down was my finger. You have been walking on my hand all along.'),
      behind: tr('You sting. You sting like waking. I do not want to wake.'),
    },
    enraged: tr('No more dreaming. Close. Close. Close.'),
    death: tr('Not yet. Let me sleep. Let me sleep a little longer.'),
    slain: tr('The great hand sinks back into the warm stone, slow as a sleeper turning over. The floor rises and falls once more, very deep, and then is still. Somewhere below, the breathing goes on.'),
    victory: tr('There. Held. Sleep now, little light.'),
    floor: {
      title: tr('The Lines of the Palm'),
      source: tr('Worn into the floor in long curved grooves'),
      text: [
        tr('Read as a palm: a long life, a short sleep left. A line for every layer that tried to keep it down. They all end in the same place.'),
        tr('In the hollow of the palm, carved by many hands, a single word, over and over: hold, hold, hold. The newest carving is not finished.'),
      ],
    },
  },
};
