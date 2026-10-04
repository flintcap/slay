/**
 * SLAY — the death screen.
 *
 * The character is gone. This screen has one job: make that land, tell the
 * player exactly how the run went and what the account keeps, then send them
 * back to try again in one keypress.
 *
 * It plays in beats. "YOU DIED" arrives alone and is allowed to sit; the line
 * saying who fell and what killed them follows; then the run summary; then the
 * choices, which only become live once the player has had a moment to read.
 *
 * The facts come from three places, best first: the payload DeathScene hands
 * over (`window.SLAY_DEATH`), the run tracker (`RunStats`), and a snapshot of
 * the character taken on `player:died` before the save forgets them.
 */

import type { CharClassId, ItemRarity, MonsterRank } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { Panel, div, span, icon, classById, classAccent, duration, fmtInt, keycap } from './Widgets';
import { MenuNav, type MenuItemOpts } from './MenuNav';
import { runStats } from './RunStats';

interface DeathSummary {
  killedBy: string;
  killerRank: MonsterRank | null;
  depth: number;
  level: number;
  name: string;
  classId: CharClassId | null;
  seconds: number;
  gold: number;
  kills: number;
  elites: number;
  bosses: number;
  bestItem: string | null;
  bestRarity: ItemRarity | null;
  bestDepth: number;
  isRecord: boolean;
}

/** One line of epitaph per death, picked from the depth so it is stable. */
const EPITAPHS = [
  'The dark keeps what it takes.',
  'Another name for the wall.',
  'They went further than most.',
  'The stair does not care who climbs it.',
  'Somewhere below, something is eating well.',
  'Rest. Someone else will carry the torch.',
];

const RANK_LABEL: Partial<Record<MonsterRank, string>> = {
  champion: 'Champion',
  elite: 'Elite',
  rare: 'Rare',
  boss: 'Boss',
};

export class DeathPanel {
  readonly panel: Panel;
  private engine: Engine;
  private inner: HTMLDivElement;
  private nav: MenuNav;
  private armTimer = 0;

  /** Snapshotted the instant the player dies, before the save clears it. */
  private snapshot: { level?: number; name?: string; classId?: CharClassId | null; gold?: number; depth?: number } = {};
  private bestBefore = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'death',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'panel-death dth',
    });
    this.panel.header.style.display = 'none';

    const wrap = div('dth-wrap');
    wrap.appendChild(div('dth-vignette'));
    this.inner = div('dth-inner');
    wrap.appendChild(this.inner);
    this.panel.body.appendChild(wrap);
    this.nav = new MenuNav('mn-list dth-menu');

    // Capture the character while it still exists.
    events.on('player:died', (p) => {
      const c = save.account.current;
      this.bestBefore = save.account.bestDepth;
      this.snapshot = {
        level: c?.level,
        name: c?.name,
        classId: c?.classId ?? null,
        gold: c?.gold,
        depth: p.depth,
      };
    });
  }

  open(): void {
    // The scene announces itself and UIRoot opens the screen on scene change,
    // so this is routinely called twice. Only the first one counts.
    if (this.panel.isOpen) return;
    this.render();
    this.panel.open();
    // Let the moment breathe before anything is clickable.
    this.nav.setActive(false);
    this.nav.root.classList.add('is-locked');
    clearTimeout(this.armTimer);
    this.armTimer = window.setTimeout(() => {
      this.nav.root.classList.remove('is-locked');
      this.nav.setActive(true);
    }, 2600);
  }

  close(): void {
    clearTimeout(this.armTimer);
    this.snapshot = {};
    this.nav.setActive(false);
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- data ----------------------------------------------------------------

  private summary(): DeathSummary {
    const fromScene = (window as unknown as Record<string, unknown>).SLAY_DEATH as
      | { killedBy?: string; depth?: number; level?: number; name?: string; classId?: CharClassId }
      | undefined;
    const run = runStats.latest;
    const lastFallen = save.account.fallen[0];
    const depth = fromScene?.depth ?? this.snapshot.depth ?? lastFallen?.depth ?? 0;
    // `killCharacter` has already folded this depth into the record, so judge
    // "new record" against the record as it stood before the fatal blow.
    // Without a snapshot (a death the event never announced) fall back to the
    // old rule of "at least as deep as the record".
    const known = this.snapshot.depth !== undefined;
    const before = known ? this.bestBefore : save.account.bestDepth - 1;
    return {
      killedBy: fromScene?.killedBy ?? run.killer ?? lastFallen?.killedBy ?? 'something in the dark',
      killerRank: run.killerRank,
      depth,
      level: fromScene?.level ?? this.snapshot.level ?? lastFallen?.level ?? 1,
      name: fromScene?.name ?? this.snapshot.name ?? lastFallen?.name ?? 'The Nameless',
      classId: fromScene?.classId ?? this.snapshot.classId ?? lastFallen?.classId ?? null,
      seconds: run.seconds,
      gold: run.gold,
      kills: run.kills,
      elites: run.elites,
      bosses: run.bosses,
      bestItem: run.bestItem,
      bestRarity: run.bestRarity,
      bestDepth: save.account.bestDepth,
      isRecord: depth > 0 && depth > before,
    };
  }

  // -- render --------------------------------------------------------------

  private render(): void {
    const s = this.summary();
    const accent = s.classId ? classAccent(s.classId) : '#c9a227';
    this.inner.replaceChildren();
    this.inner.style.setProperty('--accent', accent);

    this.inner.appendChild(div('dth-title', 'You Died'));

    // Who, and what did it.
    const who = div('dth-who');
    const cls = s.classId ? (classById(s.classId)?.name ?? '') : '';
    who.appendChild(span('dth-name', s.name));
    who.appendChild(span('dth-sep', cls ? `Level ${s.level} ${cls}` : `Level ${s.level}`));
    this.inner.appendChild(who);

    const killer = div('dth-killer');
    killer.appendChild(span('', `Fell on Depth ${s.depth}, slain by `));
    const b = document.createElement('b');
    b.textContent = s.killedBy;
    killer.appendChild(b);
    const rank = s.killerRank ? RANK_LABEL[s.killerRank] : undefined;
    if (rank) killer.appendChild(span(`dth-rank rank-${s.killerRank}`, rank));
    this.inner.appendChild(killer);

    this.inner.appendChild(div('dth-epitaph', EPITAPHS[(s.depth + s.level) % EPITAPHS.length]!));

    // The run in numbers.
    const stats = div('dth-stats');
    const stat = (value: string, label: string, cls = ''): void => {
      const d = div(`dth-stat ${cls}`.trim());
      d.append(div('dth-stat-v', value), div('dth-stat-l', label));
      stats.appendChild(d);
    };
    stat(String(s.depth), s.isRecord ? 'New record' : 'Depth reached', s.isRecord ? 'is-record' : '');
    stat(fmtInt(s.kills), s.elites > 0 ? `Kills · ${s.elites} elite` : 'Kills');
    stat(fmtInt(s.gold), 'Gold found');
    stat(s.seconds > 0 ? duration(s.seconds) : '-', 'Time below');
    this.inner.appendChild(stats);

    if (s.bestItem && s.bestRarity) {
      const best = div('dth-best');
      best.append(span('dth-best-l', 'Best find'), span(`dth-best-v r-${s.bestRarity}`, s.bestItem));
      this.inner.appendChild(best);
    }

    // What survives.
    const kept = div('dth-kept');
    kept.appendChild(div('dth-kept-h', 'What survives'));
    const row = div('dth-kept-row');
    const keep = (iconName: string, text: string): void => {
      const d = div('dth-kept-item');
      d.append(icon(iconName, { size: 14 }), span('', text));
      row.appendChild(d);
    };
    keep('stash', 'The vault and everything in it');
    keep('coin', `${fmtInt(save.account.bankGold)} banked gold`);
    keep('descend', `Best depth ${Math.max(save.account.bestDepth, s.depth)}`);
    kept.appendChild(row);
    this.inner.appendChild(kept);

    // The way forward.
    const others = save.roster.length;
    const items: MenuItemOpts[] = [
      {
        label: others > 0 ? 'Choose Another' : 'Rise Again',
        tone: 'primary',
        hint: others > 0 ? `${others} living character${others > 1 ? 's' : ''} waiting, or forge a new one` : 'Forge a new character',
        onSelect: () => this.go('charSelect'),
      },
      {
        label: 'The Fallen',
        hint: `${save.account.fallen.length} names on the wall`,
        onSelect: () => events.emit('ui:open', { panel: 'memorial' }),
      },
      { label: 'Title Screen', onSelect: () => this.go('title') },
    ];
    this.nav.set(items);
    this.inner.appendChild(this.nav.root);

    const foot = div('dth-foot');
    foot.append(keycap('Enter'), span('', 'Rise again'));
    this.inner.appendChild(foot);
  }

  private go(scene: 'charSelect' | 'title'): void {
    this.close();
    void this.engine.goTo(scene);
  }
}
