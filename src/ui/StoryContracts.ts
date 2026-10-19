/**
 * SLAY — contracts in the interface.
 *
 * Offers and hand-ins inside a conversation, the Contracts tab of the
 * journal, and the beats in the dungeon: the stair announcing whose business
 * this descent is, and the moment the work is done.
 */

import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { div, span, fmtInt } from './Widgets';
import { addDialogueOptions, addNewsCheck, type DialogueOption } from './DialoguePanel';
import { addJournalSection, para, pageTitle, type JournalEntry } from './JournalPanel';
import { say } from './StoryOverlay';
import type { ChainDef, ChainStep, NpcDef } from '../data/story/types';
import { NPCS, fillStory } from '../sim/Story';
import {
  CHAINS,
  acceptStep,
  carriedContract,
  chainDone,
  chainReward,
  chainStep,
  installChains,
  noteQuestComplete,
  offerFor,
  openWorkFor,
  stepState,
  stepWhere,
  turnInStep,
} from '../sim/Chains';
import { tr } from '../core/I18n';
import { itemDisplayName } from '../sim/Loot';

/** The offer a person has made and you have not answered yet. */
let pending: { npc: string; chain: string } | null = null;

function objectiveList(step: ChainStep): HTMLElement {
  const box = div('dlg-reward');
  const where = div('dlg-obj');
  where.textContent = tr('A portal opens on {0}.', stepWhere(step));
  box.appendChild(where);
  for (const o of step.objectives) {
    const line = div('dlg-obj');
    line.textContent = o.desc.replace(/\{n\}/g, String(o.n));
    box.appendChild(line);
  }
  const pay = chainReward(step);
  const reward = div('');
  reward.style.marginTop = '6px';
  reward.appendChild(span('', tr('Pays ')));
  const b = document.createElement('b');
  b.textContent = tr('{0} gold, {1} experience{2}', fmtInt(pay.gold), fmtInt(pay.xp), pay.item ? tr(', and a {0} item', pay.item) : '');
  reward.appendChild(b);
  box.appendChild(reward);
  return box;
}

function contractOptions(npc: NpcDef): DialogueOption[] {
  const out: DialogueOption[] = [];

  for (const work of openWorkFor(npc)) {
    if (work.ready) {
      out.push({
        label: tr('Hand in: {0}', work.step.title),
        kind: 'ready',
        icon: 'check',
        isNew: true,
        run: (v) => {
          const lines = work.step.turnIn.map(fillStory);
          const paid = turnInStep(work.chain);
          if (!paid) return;
          if (paid === 'full') {
            toast(tr('Your pack and the vault are both full. Make room, then hand it in.'), 'bad');
            audio.play('ui.error');
            return;
          }
          audio.play('quest.complete');
          const box = div('dlg-reward');
          const b = document.createElement('b');
          b.textContent = tr('+{0} gold, +{1} experience', fmtInt(paid.gold), fmtInt(paid.xp));
          box.appendChild(b);
          if (paid.item) {
            const it = div('', `${itemDisplayName(paid.item)} ${paid.itemTo === 'vault' ? tr('(sent to the vault, your pack is full)') : tr('added to your pack')}`);
            box.appendChild(it);
          }
          const next = chainDone(work.chain) ? div('', tr('{0}: finished.', work.chain.name)) : null;
          if (next) box.appendChild(next);
          v.speak(lines, { extra: box });
          v.refresh();
          toast(tr('{0} handed in', work.step.title), 'epic');
        },
      });
    } else {
      out.push({
        label: tr('About {0}', work.step.title),
        kind: 'topic',
        icon: 'quest',
        heard: true,
        run: (v) => {
          v.speak([work.step.brief], { narration: true, extra: objectiveList(work.step) });
        },
      });
    }
  }

  const offer = offerFor(npc);
  if (offer) {
    if (pending && pending.npc === npc.id && pending.chain === offer.chain.id) {
      out.push({
        label: tr('Take the contract: {0}', offer.step.title),
        kind: 'contract',
        icon: 'check',
        run: (v) => {
          acceptStep(offer.chain);
          pending = null;
          audio.play('ui.open');
          v.speak([tr('Taken. {0}', offer.step.brief)], { narration: true, extra: objectiveList(offer.step) });
          v.refresh();
          toast(tr('Contract taken: {0}', offer.step.title), 'good');
        },
      });
      out.push({
        label: tr('Not yet'),
        kind: 'topic',
        icon: 'chevronLeft',
        heard: true,
        run: (v) => {
          pending = null;
          v.speak([tr('Then not yet. It will keep. Most things down there do.')]);
          v.refresh();
        },
      });
    } else {
      out.push({
        label: `${offer.index === 0 ? tr('Work') : tr('More work')}: ${offer.step.title}`,
        kind: 'contract',
        icon: 'quest',
        isNew: true,
        run: (v) => {
          pending = { npc: npc.id, chain: offer.chain.id };
          v.speak(offer.step.offer.map(fillStory), { extra: objectiveList(offer.step) });
          v.refresh();
        },
      });
    }
  }
  return out;
}

function contractNews(npc: NpcDef): boolean {
  return offerFor(npc) !== null || openWorkFor(npc).some((w) => w.ready);
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

const STATE_LABEL: Record<string, string> = {
  idle: tr('On offer'),
  active: tr('Taken'),
  ready: tr('Done. Hand it in'),
  done: tr('Handed in'),
};

function chainEntry(chain: ChainDef): JournalEntry {
  const at = chainStep(chain);
  const done = chainDone(chain);
  const cur = chain.steps[at];
  const st = cur ? stepState(chain, at) : 'done';
  const giver = NPCS[chain.giver];
  return {
    id: chain.id,
    label: chain.name,
    sub: done ? tr('{0} · finished', giver.name) : `${giver.name} · ${cur?.title ?? ''}`,
    group: done ? tr('Finished') : st === 'ready' ? tr('Ready to hand in') : st === 'active' ? tr('Open') : tr('On offer'),
    render(page) {
      pageTitle(page, chain.name, `${giver.name}, ${giver.role}`);
      para(page, chain.blurb, 'jr-quiet');
      chain.steps.forEach((step, i) => {
        const s = stepState(chain, i);
        if (s === 'locked') return;
        if (s === 'idle' && !offerFor(giver)) return;
        const box = div(`jr-step is-${s}`);
        const hd = div('jr-step-hd');
        hd.appendChild(span('', step.title));
        hd.appendChild(span('jr-step-state', STATE_LABEL[s] ?? s));
        box.appendChild(hd);
        if (s === 'done') {
          para(box, step.outcome);
        } else {
          para(box, step.brief);
          const where = div('dlg-obj');
          where.textContent = `${stepWhere(step)}.`;
          box.appendChild(where);
          for (const o of step.objectives) box.appendChild(div('dlg-obj', o.desc.replace(/\{n\}/g, String(o.n))));
          if (s === 'idle') box.appendChild(div('jr-hint', tr('Talk to {0} to take it.', giver.name)));
          if (s === 'ready') box.appendChild(div('jr-hint', tr('Go back to {0}.', giver.name)));
        }
        page.appendChild(box);
      });
      if (!done && at + 1 < chain.steps.length) page.appendChild(div('jr-hint', tr('There is more to this. It will come.')));
    },
  };
}

const GROUP_ORDER = [tr('Ready to hand in'), tr('Open'), tr('On offer'), tr('Finished')];

addJournalSection({
  id: 'contracts',
  label: tr('Contracts'),
  icon: 'quest',
  empty: tr('No contracts yet. The people of Stairhead have work; talk to them.'),
  entries() {
    const s = CHAINS.filter((c) => {
      const at = chainStep(c);
      if (at > 0) return true;
      const st = stepState(c, 0);
      // A person offers one contract at a time: only list the one they offer.
      return st !== 'idle' || offerFor(NPCS[c.giver])?.chain === c;
    }).map(chainEntry);
    return s.sort((a, b) => GROUP_ORDER.indexOf(a.group ?? '') - GROUP_ORDER.indexOf(b.group ?? ''));
  },
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let installed = false;

export function installContracts(): void {
  if (installed) return;
  installed = true;
  installChains();
  addDialogueOptions(contractOptions);
  addNewsCheck(contractNews);

  events.on('quest:complete', () => {
    const done = noteQuestComplete();
    if (!done) return;
    const giver = NPCS[done.step.giver ?? done.chain.giver];
    say('', done.step.ready, { tone: 'narration', delay: 1.2 });
    toast(tr('Contract done. Return to {0}.', giver.name), 'good');
  });

  events.on('depth:changed', (p) => {
    if (p.depth <= 0 || p.level !== 1) return;
    const c = carriedContract();
    if (!c) return;
    const giver = NPCS[c.step.giver ?? c.chain.giver];
    say('', tr('{0}\'s contract: {1}. {2}', giver.name, c.step.title, c.step.brief), { tone: 'narration', delay: 3.4, hold: 7 });
  });
}
