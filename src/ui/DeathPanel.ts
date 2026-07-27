/**
 * SLAY — the death screen.
 *
 * The character is gone. This screen has one job: make that land, tell the
 * player exactly how far they got and what the account keeps, then send them
 * back to the hall to try again.
 *
 * The run summary arrives either through the `player:died` event or from
 * `window.SLAY_DEATH`, which DeathScene sets when it enters.
 */

import type { Character, CharClassId } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import {
  Panel,
  Button,
  add,
  clear,
  div,
  span,
  icon,
  classById,
  classAccent,
  classCrestSvg,
  duration,
  fmtInt,
} from './Widgets';

interface DeathSummary {
  killedBy: string;
  depth: number;
  level: number;
  name: string;
  classId: CharClassId | null;
  playtime: number;
  gold: number;
  bestDepth: number;
  isRecord: boolean;
}

export class DeathPanel {
  readonly panel: Panel;
  private engine: Engine;
  private inner: HTMLDivElement;

  /** Snapshotted the instant the player dies, before the save clears it. */
  private snapshot: Partial<DeathSummary> = {};

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'death',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'panel-death',
    });
    this.panel.header.style.display = 'none';

    const wrap = div('death-wrap');
    this.inner = div('death-inner');
    wrap.appendChild(this.inner);
    this.panel.body.appendChild(wrap);

    // Capture the character while it still exists.
    events.on('player:died', (p) => {
      const c = save.account.current;
      this.snapshot = {
        killedBy: p.killedBy,
        depth: p.depth,
        level: c?.level ?? 1,
        name: c?.name ?? 'The Nameless',
        classId: c?.classId ?? null,
        playtime: c?.playtime ?? 0,
        gold: c?.gold ?? 0,
      };
    });
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

  // -- data ----------------------------------------------------------------

  private summary(): DeathSummary {
    const fromScene = (window as unknown as Record<string, unknown>).SLAY_DEATH as
      | Partial<DeathSummary>
      | undefined;
    const live: Character | null = save.account.current;
    const lastFallen = save.account.fallen[0];

    const s: DeathSummary = {
      killedBy: fromScene?.killedBy ?? this.snapshot.killedBy ?? lastFallen?.killedBy ?? 'something in the dark',
      depth: fromScene?.depth ?? this.snapshot.depth ?? lastFallen?.depth ?? 0,
      level: fromScene?.level ?? this.snapshot.level ?? lastFallen?.level ?? live?.level ?? 1,
      name: fromScene?.name ?? this.snapshot.name ?? lastFallen?.name ?? live?.name ?? 'The Nameless',
      classId: this.snapshot.classId ?? lastFallen?.classId ?? live?.classId ?? null,
      playtime: fromScene?.playtime ?? this.snapshot.playtime ?? live?.playtime ?? 0,
      gold: this.snapshot.gold ?? live?.gold ?? 0,
      bestDepth: save.account.bestDepth,
      isRecord: false,
    };
    s.isRecord = s.depth >= s.bestDepth && s.depth > 0;
    return s;
  }

  // -- render --------------------------------------------------------------

  private render(): void {
    const s = this.summary();
    const accent = s.classId ? classAccent(s.classId) : '#c9a227';
    clear(this.inner);

    this.inner.appendChild(div('death-title', 'YOU DIED'));

    const killer = div('death-killer');
    killer.appendChild(span('', `${s.name} fell on Depth ${s.depth}, killed by `));
    const b = document.createElement('b');
    b.textContent = s.killedBy;
    killer.appendChild(b);
    killer.appendChild(span('', '.'));
    this.inner.appendChild(killer);

    if (s.classId) {
      const crest = div('');
      crest.style.opacity = '0.35';
      crest.style.display = 'grid';
      crest.style.placeItems = 'center';
      crest.style.marginBottom = '18px';
      crest.innerHTML = classCrestSvg(s.classId, accent, 86);
      this.inner.appendChild(crest);
    }

    const stats = div('death-stats');
    const stat = (value: string, label: string, tone?: string): HTMLElement => {
      const d = div('death-stat');
      const v = div('death-stat-v', value);
      if (tone) v.style.color = tone;
      d.appendChild(v);
      d.appendChild(div('death-stat-l', label));
      return d;
    };
    stats.appendChild(stat(String(s.depth), s.isRecord ? 'Depth — new record' : 'Depth reached', s.isRecord ? '#f2d989' : undefined));
    stats.appendChild(stat(String(s.level), 'Level attained'));
    stats.appendChild(stat(duration(s.playtime), 'Time survived'));
    stats.appendChild(stat(fmtInt(s.gold), 'Gold carried'));
    this.inner.appendChild(stats);

    const truth = div('death-truth');
    const cls = s.classId ? classById(s.classId)?.name ?? '' : '';
    truth.innerHTML =
      `<b>${escapeHtml(s.name)}</b> is gone. The ${escapeHtml(cls || 'character')}, the gear on their body, the skill points ` +
      `they spent — all of it stays down there in the dark. There is no reviving them and no rolling back.`;
    this.inner.appendChild(truth);

    const kept = div('death-kept');
    kept.appendChild(this.keptItem('stash', 'The vault and everything in it'));
    kept.appendChild(this.keptItem('coin', `Banked gold: ${fmtInt(save.account.bankGold)}`));
    kept.appendChild(this.keptItem('descend', `Best depth: ${Math.max(save.account.bestDepth, s.depth)}`));
    this.inner.appendChild(kept);

    const actions = div('death-actions');
    const again = new Button({
      label: 'Choose a New Life',
      variant: 'primary',
      icon: 'skull',
      onClick: () => {
        this.panel.close();
        void this.engine.goTo('charSelect');
      },
    });
    const memorial = new Button({
      label: 'Visit the Memorial',
      variant: 'ghost',
      icon: 'book',
      onClick: () => events.emit('ui:open', { panel: 'memorial' }),
    });
    add(actions, memorial.root, again.root);
    this.inner.appendChild(actions);

    // Let the moment breathe before the button becomes clickable.
    again.setDisabled(true);
    setTimeout(() => again.setDisabled(false), 900);
  }

  private keptItem(iconName: string, label: string): HTMLElement {
    const d = div('death-kept-item');
    d.appendChild(icon(iconName, { size: 14 }));
    d.appendChild(span('', label));
    return d;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
}
