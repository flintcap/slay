/**
 * SLAY — the quest log.
 *
 * One active contract per run. Objectives with progress bars, the flavour text
 * that sold the job, and the rewards waiting at the end of it.
 */

import type { QuestInstance, QuestObjective } from '../types';
import { events } from '../core/Events';
import {
  Panel,
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  emptyState,
  runtime,
} from './Widgets';

interface TrackedObjective {
  desc: string;
  progress: number;
  target: number;
  done: boolean;
}

export class QuestLogPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;
  private quest: { name: string; flavor: string; objectives: TrackedObjective[]; complete: boolean } | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'questLog',
      title: 'Contract',
      subtitle: 'What you agreed to do down here',
      icon: 'quest',
      width: 560,
    });
    this.panel.frame.classList.add('panel-quest');
    this.body = div('');
    this.panel.body.appendChild(this.body);

    events.on('quest:progress', (p) => {
      this.ensure();
      const q = this.quest;
      if (!q) return;
      while (q.objectives.length <= p.index) {
        q.objectives.push({ desc: p.desc, progress: 0, target: p.target, done: false });
      }
      const o = q.objectives[p.index];
      o.desc = p.desc;
      o.progress = p.progress;
      o.target = p.target;
      o.done = p.progress >= p.target;
      if (this.panel.isOpen) this.render();
    });

    events.on('quest:complete', (p) => {
      this.ensure();
      if (this.quest) {
        this.quest.name = p.name || this.quest.name;
        this.quest.complete = true;
        for (const o of this.quest.objectives) o.done = true;
      }
      if (this.panel.isOpen) this.render();
    });

    events.on('depth:changed', (p) => {
      if (p.depth <= 0) this.quest = null;
    });
  }

  open(): void {
    this.ensure();
    this.render();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** Adopts whatever quest the running scene exposed, if we have none yet. */
  setQuest(q: QuestInstance | null): void {
    if (!q) {
      this.quest = null;
      return;
    }
    this.quest = {
      name: q.name,
      flavor: q.flavor,
      complete: q.complete,
      objectives: (q.objectives ?? []).map((o: QuestObjective) => ({
        desc: o.desc,
        progress: o.progress,
        target: o.target,
        done: o.done,
      })),
    };
    if (this.panel.isOpen) this.render();
  }

  private ensure(): void {
    if (this.quest) return;
    this.quest = {
      name: runtime.depth > 0 ? `Descent — Depth ${runtime.depth}` : 'Contract',
      flavor: 'The guild pays by the corpse and asks no questions about method.',
      objectives: [],
      complete: false,
    };
  }

  private render(): void {
    clear(this.body);
    const q = this.quest;
    if (!q || (!q.objectives.length && !q.complete)) {
      this.body.appendChild(emptyState('No active contract. Take the stairs down and one will find you.', 'quest'));
      return;
    }

    const hd = div('quest-hd');
    hd.appendChild(div('quest-name', q.name));
    if (q.flavor) hd.appendChild(div('quest-flavor', `“${q.flavor}”`));
    this.body.appendChild(hd);

    for (const o of q.objectives) {
      const row = div(`quest-obj ${o.done ? 'done' : ''}`.trim());
      const check = div('quest-check');
      check.innerHTML = iconSvg(o.done ? 'check' : 'target', { size: 13 });
      const body = div('quest-obj-body');
      const line = div('quest-obj-desc');
      line.appendChild(span('', o.desc));
      line.appendChild(span('quest-obj-count', `${Math.min(o.progress, o.target)} / ${o.target}`));
      body.appendChild(line);
      const track = div('hud-obj-track');
      const fill = div('hud-obj-fill');
      fill.style.width = `${o.target > 0 ? Math.min(100, (o.progress / o.target) * 100) : 0}%`;
      track.appendChild(fill);
      body.appendChild(track);
      add(row, check, body);
      this.body.appendChild(row);
    }

    const reward = div('quest-reward');
    const item = (iconName: string, label: string): HTMLElement => {
      const d = div('death-kept-item');
      d.appendChild(icon(iconName, { size: 14 }));
      d.appendChild(span('', label));
      return d;
    };
    reward.appendChild(item('coin', 'Gold on completion'));
    reward.appendChild(item('sparkle', 'Bonus experience'));
    reward.appendChild(item('bag', 'Extra drops from the boss'));
    this.body.appendChild(reward);

    if (q.complete) {
      const done = div('trade-note');
      done.appendChild(icon('check', { size: 13 }));
      done.appendChild(span('', 'Contract fulfilled. Collect at the stairs.'));
      this.body.appendChild(done);
    }
  }
}
