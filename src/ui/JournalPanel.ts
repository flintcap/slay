/**
 * SLAY — the journal.
 *
 * Everything the story has shown you, kept so it can be read again: the
 * chapters of the descent, open and finished contracts, lore notes, the
 * things you fought and the people of the camp. Opened with J.
 *
 * Pages are built on open from `sim/Story.ts`, so the journal is never stale
 * and keeps no state of its own beyond which tab and entry were last read.
 */

import './story.css';
import { Panel, Tabs, div, span, clear, emptyState, type TabDef } from './Widgets';
import { NPCS, NPC_IDS, fillStory, nextChapter, revealedChapters, story } from '../sim/Story';

/** One entry in the left-hand list and the page it opens. */
export interface JournalEntry {
  id: string;
  label: string;
  sub?: string;
  group?: string;
  locked?: boolean;
  render(page: HTMLElement): void;
}

/** A tab's contents, built fresh every time the journal opens. */
export interface JournalSection {
  id: string;
  label: string;
  icon: string;
  entries(): JournalEntry[];
  /** Shown when there are no entries yet. */
  empty: string;
}

const sections: JournalSection[] = [];

/** Lets other story modules add a tab. Order of registration is tab order. */
export function addJournalSection(s: JournalSection): void {
  const at = sections.findIndex((x) => x.id === s.id);
  if (at >= 0) sections[at] = s;
  else sections.push(s);
}

/** Paragraph helper for page renderers. */
export function para(page: HTMLElement, text: string, cls = ''): HTMLParagraphElement {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  page.appendChild(p);
  return p;
}

export function pageTitle(page: HTMLElement, title: string, meta?: string): void {
  const h = document.createElement('h3');
  h.textContent = title;
  page.appendChild(h);
  if (meta) page.appendChild(div('jr-meta', meta));
}

// ---------------------------------------------------------------------------
// The descent — always the first tab
// ---------------------------------------------------------------------------

addJournalSection({
  id: 'descent',
  label: 'The Descent',
  icon: 'descend',
  empty: 'Nothing written yet. Go down.',
  entries() {
    const out: JournalEntry[] = revealedChapters().map((ch) => ({
      id: ch.id,
      label: ch.title,
      sub: ch.depth === 0 ? 'Stairhead' : `Tier ${ch.depth}`,
      group: ch.id.startsWith('ledger.') ? 'The Deep Ledger' : 'Chapters',
      render(page) {
        pageTitle(page, ch.title, ch.depth === 0 ? 'Stairhead, the first night' : `Tier ${ch.depth}`);
        for (const t of ch.text) para(page, t);
      },
    }));
    const next = nextChapter();
    if (next && out.length) {
      out.push({
        id: 'next',
        label: 'Further down',
        sub: `Tier ${next.depth}`,
        group: 'Chapters',
        locked: true,
        render(page) {
          pageTitle(page, 'Not yet written', `Tier ${next.depth}`);
          para(page, `The rest of it is further down. The next page is somewhere around tier ${next.depth}.`, 'jr-quiet');
        },
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// People — everyone you have spoken to, and what they told you
// ---------------------------------------------------------------------------

addJournalSection({
  id: 'people',
  label: 'People',
  icon: 'quest',
  empty: 'You have not spoken to anyone in Stairhead yet. Walk up to someone and press E.',
  entries() {
    const s = story();
    return NPC_IDS.filter((id) => s.talked[id] !== undefined).map((id) => {
      const npc = NPCS[id];
      return {
        id,
        label: npc.name,
        sub: npc.role,
        group: npc.station ? 'Keepers' : 'Townsfolk',
        render(page: HTMLElement) {
          pageTitle(page, npc.name, npc.role);
          para(page, npc.portrait);
          for (const t of npc.topics) {
            if (!s.heard.includes(`topic:${npc.id}.${t.id}`)) continue;
            page.appendChild(div('jr-group', t.label));
            for (const line of t.text) {
              const q = document.createElement('blockquote');
              q.textContent = fillStory(line);
              page.appendChild(q);
            }
          }
        },
      };
    });
  },
});

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export class JournalPanel {
  readonly panel: Panel;
  private tabs: Tabs;
  private list: HTMLDivElement;
  private page: HTMLDivElement;
  private tab = 'descent';
  private picked: Record<string, string> = {};

  constructor() {
    this.panel = new Panel({
      id: 'journal',
      title: 'Journal',
      subtitle: 'What the descent has taught you, kept in order',
      icon: 'book',
      width: 860,
      height: 600,
      scrim: true,
    });
    const root = div('jr');
    this.tabs = new Tabs([], 'descent', (id) => {
      this.tab = id;
      this.render();
    });
    const body = div('jr-body');
    this.list = div('jr-list');
    this.page = div('jr-page');
    body.appendChild(this.list);
    body.appendChild(this.page);
    root.appendChild(this.tabs.root);
    root.appendChild(body);
    this.panel.body.appendChild(root);
  }

  open(): void {
    this.render();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** Opens straight onto a tab and entry, e.g. from a card or the dialogue box. */
  openAt(tab: string, entry?: string): void {
    this.tab = tab;
    if (entry) this.picked[tab] = entry;
    this.open();
  }

  private render(): void {
    const built = sections.map((s) => ({ s, entries: s.entries() }));
    const defs: TabDef[] = built.map(({ s, entries }) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      count: entries.filter((e) => !e.locked).length,
    }));
    if (!built.some((b) => b.s.id === this.tab)) this.tab = built[0]?.s.id ?? 'descent';
    this.tabs.setTabs(defs, this.tab);

    const cur = built.find((b) => b.s.id === this.tab);
    clear(this.list);
    clear(this.page);
    if (!cur || cur.entries.length === 0) {
      this.page.appendChild(emptyState(cur?.s.empty ?? 'Nothing yet.', 'book'));
      return;
    }

    let group = '';
    const buttons: Array<[JournalEntry, HTMLButtonElement]> = [];
    for (const e of cur.entries) {
      if (e.group && e.group !== group) {
        group = e.group;
        this.list.appendChild(div('jr-group', group));
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `jr-item${e.locked ? ' is-locked' : ''}`;
      b.appendChild(span('', e.label));
      if (e.sub) b.appendChild(span('jr-item-sub', e.sub));
      b.addEventListener('click', () => {
        this.picked[this.tab] = e.id;
        for (const [, other] of buttons) other.classList.remove('on');
        b.classList.add('on');
        clear(this.page);
        e.render(this.page);
        this.page.scrollTop = 0;
      });
      buttons.push([e, b]);
      this.list.appendChild(b);
    }

    // Reopen where the reader left off; otherwise the newest unlocked entry.
    const want = this.picked[this.tab];
    const pick =
      buttons.find(([e]) => e.id === want) ??
      [...buttons].reverse().find(([e]) => !e.locked) ??
      buttons[0];
    if (pick) {
      pick[1].classList.add('on');
      pick[0].render(this.page);
    }
  }
}

let instance: JournalPanel | null = null;

/** The one journal. Built on first use so it never exists before the UI does. */
export function journal(): JournalPanel {
  if (!instance) instance = new JournalPanel();
  return instance;
}
