/**
 * SLAY — talking to the people of the camp.
 *
 * Walk up to someone in Stairhead and press E: they say something that fits
 * what has happened to you, and you get a short list of things to do. Their
 * trade, if they keep one, is always first and always on E again, so the
 * shop is one key further away than it was and never more. Contracts to take,
 * contracts to hand in, and things to ask about follow.
 *
 * `openDialogueFor` is the one hook `TownScene` calls. Other story modules add
 * options (contracts) with `addDialogueOptions`.
 */

import * as THREE from 'three';
import './story.css';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { remapKey } from '../core/Access';
import { Panel, div, span, clear, icon } from './Widgets';
import type { NpcDef, NpcId } from '../data/story/types';
import {
  NPCS,
  NPC_IDS,
  TALK_SPOTS,
  greet,
  hasNews,
  hearTopic,
  npcForStation,
  topicsFor,
} from '../sim/Story';

export interface DialogueOption {
  label: string;
  kind: 'service' | 'contract' | 'ready' | 'topic' | 'journal' | 'leave';
  icon?: string;
  isNew?: boolean;
  heard?: boolean;
  /** What choosing it does. The option closes the conversation itself if it should. */
  run(view: DialogueView): void;
}

/** What an option can do to the open conversation. */
export interface DialogueView {
  npc: NpcDef;
  /** Replace what the person is saying. */
  speak(paragraphs: string[], opts?: { narration?: boolean; extra?: HTMLElement }): void;
  /** Rebuild the option list (after state changed). */
  refresh(): void;
  close(): void;
}

type OptionSource = (npc: NpcDef) => DialogueOption[];
const sources: OptionSource[] = [];

/** Lets the contract layer add its offers and hand-ins to a conversation. */
export function addDialogueOptions(fn: OptionSource): void {
  sources.push(fn);
}

/** True if this person has something new: news, an offer, or work to hand in. */
const newsChecks: Array<(npc: NpcDef) => boolean> = [];
export function addNewsCheck(fn: (npc: NpcDef) => boolean): void {
  newsChecks.push(fn);
}

export function npcHasNews(npc: NpcDef): boolean {
  return hasNews(npc) || newsChecks.some((f) => f(npc));
}

// ---------------------------------------------------------------------------

export class DialoguePanel implements DialogueView {
  readonly panel: Panel;
  npc: NpcDef = NPCS.hesk;
  private sigil: HTMLDivElement;
  private role: HTMLDivElement;
  private speech: HTMLDivElement;
  private extra: HTMLDivElement;
  private opts: HTMLDivElement;
  private portrait: HTMLDivElement;
  private current: DialogueOption[] = [];

  constructor() {
    this.panel = new Panel({
      id: 'dialogue',
      title: '',
      subtitle: '',
      icon: 'quest',
      width: 600,
      scrim: true,
    });
    const root = div('dlg');
    this.sigil = div('dlg-sigil');
    const main = div('');
    this.role = div('dlg-role');
    this.speech = div('dlg-speech');
    this.extra = div('');
    this.opts = div('dlg-opts');
    this.portrait = div('dlg-portrait');
    main.appendChild(this.speech);
    main.appendChild(this.extra);
    main.appendChild(this.opts);
    main.appendChild(this.portrait);
    root.appendChild(this.sigil);
    root.appendChild(main);
    this.panel.body.appendChild(root);

    window.addEventListener('keydown', (e) => {
      if (!this.panel.isOpen || e.repeat) return;
      const n = /^Digit([1-9])$/.exec(remapKey(e.code));
      if (!n) return;
      const opt = this.current[Number(n[1]) - 1];
      if (!opt) return;
      e.preventDefault();
      e.stopPropagation();
      this.choose(opt);
    }, true);
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }
  open(): void {
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }

  /** Starts a conversation. */
  talkTo(npc: NpcDef): void {
    this.npc = npc;
    this.panel.setTitle(npc.name, npc.role);
    this.sigil.textContent = npc.name.replace(/^(Captain|Sister|Old|The)\s+/, '').charAt(0);
    this.role.textContent = npc.role;
    this.portrait.textContent = npc.portrait;
    const line = greet(npc);
    this.speak(line ? [line] : [`${npc.name} nods, and goes back to work.`], { narration: !line });
    this.refresh();
    events.emit('ui:open', { panel: 'dialogue' });
  }

  speak(paragraphs: string[], opts: { narration?: boolean; extra?: HTMLElement } = {}): void {
    clear(this.speech);
    clear(this.extra);
    this.speech.classList.toggle('is-narration', !!opts.narration);
    for (const t of paragraphs) {
      const p = document.createElement('p');
      p.textContent = t;
      this.speech.appendChild(p);
    }
    if (opts.extra) this.extra.appendChild(opts.extra);
  }

  refresh(): void {
    const npc = this.npc;
    const list: DialogueOption[] = [];
    if (npc.station) {
      list.push({
        label: npc.serviceLabel ?? 'Trade',
        kind: 'service',
        icon: npc.serviceIcon,
        run: (v) => {
          v.close();
          events.emit('ui:open', { panel: npc.station! });
        },
      });
    }
    for (const src of sources) {
      try {
        list.push(...src(npc));
      } catch (err) {
        console.error('[dialogue] option source threw', err);
      }
    }
    for (const { topic, heard } of topicsFor(npc)) {
      list.push({
        label: topic.label,
        kind: 'topic',
        icon: 'scroll',
        isNew: !heard,
        heard,
        run: (v) => {
          v.speak(hearTopic(npc, topic));
          v.refresh();
        },
      });
    }
    list.push({ label: 'Leave', kind: 'leave', icon: 'exit', run: (v) => v.close() });
    this.current = list;

    clear(this.opts);
    list.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const cls = ['dlg-opt'];
      if (o.kind === 'service') cls.push('is-primary');
      if (o.kind === 'contract') cls.push('is-contract');
      if (o.kind === 'ready') cls.push('is-ready');
      if (o.isNew) cls.push('is-new');
      if (o.heard) cls.push('is-heard');
      b.className = cls.join(' ');
      b.appendChild(span('dlg-key', String(i + 1)));
      if (o.icon) b.appendChild(icon(o.icon, { size: 14 }));
      b.appendChild(span('', o.label));
      b.addEventListener('click', () => this.choose(o));
      this.opts.appendChild(b);
    });
  }

  /** E pressed again while talking: do the obvious thing. */
  primary(): void {
    const first = this.current.find((o) => o.kind === 'service' || o.kind === 'ready' || o.kind === 'contract');
    if (first) this.choose(first);
    else this.close();
  }

  private choose(o: DialogueOption): void {
    audio.play('ui.click');
    o.run(this);
  }
}

let instance: DialoguePanel | null = null;

/** The one dialogue box. Built on first use, after the UI exists. */
export function dialogue(): DialoguePanel {
  if (!instance) instance = new DialoguePanel();
  return instance;
}

// ---------------------------------------------------------------------------
// Town hooks
// ---------------------------------------------------------------------------

function npcForInteract(id: string): NpcDef | undefined {
  if (id.startsWith('talk:')) return NPCS[id.slice(5) as NpcId];
  return npcForStation(id);
}

/**
 * `TownScene` calls this when E is pressed at an interaction point. Returns
 * true if a conversation took it; false means carry on as before (the gate).
 */
export function openDialogueFor(interactId: string): boolean {
  const npc = npcForInteract(interactId);
  if (!npc) return false;
  const d = dialogue();
  if (d.isOpen && d.npc.id === npc.id) {
    d.primary();
    return true;
  }
  d.talkTo(npc);
  return true;
}

export interface TalkSpot {
  id: string;
  label: string;
  panel: string;
  pos: THREE.Vector3;
  radius: number;
}

/**
 * Interaction points for the people who keep no station. Positions come from
 * the town's `npcSpots` when the town names them, else from `TALK_SPOTS`.
 */
export function storyTalkSpots(spots: Record<string, THREE.Vector3 | undefined>): TalkSpot[] {
  const out: TalkSpot[] = [];
  for (const id of NPC_IDS) {
    const npc = NPCS[id];
    if (npc.station) continue;
    const known = spots[id];
    const fallback = TALK_SPOTS[id];
    if (!known && !fallback) continue;
    const pos = known ? new THREE.Vector3(known.x, 0, known.z + 1.2) : new THREE.Vector3(fallback!.x, 0, fallback!.z);
    const short = npc.name.replace(/^Captain Ilsa /, 'Captain ');
    out.push({ id: `talk:${id}`, label: `Talk to ${short}`, panel: `talk:${id}`, pos, radius: 2.0 });
  }
  return out;
}

/** The prompt label for a station, with the keeper's name and a news marker. */
export function stationPrompt(interactId: string, fallback: string): string {
  const npc = npcForInteract(interactId);
  if (!npc) return fallback;
  // 'Merchant — Buy & Sell' becomes 'Hesk — Buy & Sell': the person, then the trade.
  const parts = fallback.split(' — ');
  const label = npc.station && parts.length > 1 ? `${npc.name} — ${parts.slice(1).join(' — ')}` : fallback;
  return npcHasNews(npc) ? `${label} · has news` : label;
}
