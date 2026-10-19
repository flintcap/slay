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

import type { CharClassId, DamageType, ItemRarity, MonsterRank } from '../types';
import { DAMAGE_TYPES } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { computeStats } from '../sim/Stats';
import { resistAgainst } from '../sim/Combat';
import { Panel, div, span, icon, classById, classAccent, duration, fmtInt, keycap } from './Widgets';
import { MenuNav, type MenuItemOpts } from './MenuNav';
import { runStats, type HitRecord } from './RunStats';
import { tr, trn, numText } from '../core/I18n';

/** How far back the recap looks from the killing blow, in seconds. */
const RECAP_WINDOW = 10;
/** Lines the recap shows at most. */
const RECAP_LINES = 8;

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
  tr('The dark keeps what it takes.'),
  tr('Another name for the wall.'),
  tr('They went further than most.'),
  tr('The stair does not care who climbs it.'),
  tr('Somewhere below, something is eating well.'),
  tr('Rest. Someone else will carry the torch.'),
];

const RANK_LABEL: Partial<Record<MonsterRank, string>> = {
  champion: tr('Champion'),
  elite: tr('Elite'),
  rare: tr('Rare'),
  boss: tr('Boss'),
};

export class DeathPanel {
  readonly panel: Panel;
  private engine: Engine;
  private inner: HTMLDivElement;
  private nav: MenuNav;
  private armTimer = 0;

  /** Snapshotted the instant the player dies, before the save clears it. */
  private snapshot: {
    level?: number;
    name?: string;
    classId?: CharClassId | null;
    gold?: number;
    depth?: number;
    /** Resistances as worn, for the recap's last line. */
    resists?: Partial<Record<DamageType, number>>;
  } = {};
  /** The last blows, beside the summary. */
  private recap: HTMLDivElement;
  private bestBefore = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'death',
      title: '',
      fullscreen: true,
      quiet: true,
      closable: false,
      draggable: false,
      className: 'panel-death dth',
    });
    this.panel.header.style.display = 'none';

    const wrap = div('dth-wrap');
    wrap.appendChild(div('dth-vignette'));
    this.inner = div('dth-inner');
    this.recap = div('dth-recap');
    wrap.append(this.inner, this.recap);
    this.panel.body.appendChild(wrap);
    this.nav = new MenuNav('mn-list dth-menu');

    // Capture the character while it still exists.
    events.on('player:died', (p) => {
      const c = save.account.current;
      this.bestBefore = save.account.bestDepth;
      let resists: Partial<Record<DamageType, number>> | undefined;
      if (c) {
        try {
          const st = computeStats(c);
          resists = {};
          for (const t of DAMAGE_TYPES) resists[t] = resistAgainst(st, t);
        } catch {
          resists = undefined;
        }
      }
      this.snapshot = {
        level: c?.level,
        name: c?.name,
        classId: c?.classId ?? null,
        gold: c?.gold,
        depth: p.depth,
        resists,
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
      killedBy: fromScene?.killedBy ?? run.killer ?? lastFallen?.killedBy ?? tr('something in the dark'),
      killerRank: run.killerRank,
      depth,
      level: fromScene?.level ?? this.snapshot.level ?? lastFallen?.level ?? 1,
      name: fromScene?.name ?? this.snapshot.name ?? lastFallen?.name ?? tr('The Nameless'),
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

    this.inner.appendChild(div('dth-title', tr('You Died')));

    // Who, and what did it.
    const who = div('dth-who');
    const cls = s.classId ? (classById(s.classId)?.name ?? '') : '';
    who.appendChild(span('dth-name', s.name));
    who.appendChild(span('dth-sep', cls ? tr('Level {0} {1}', s.level, cls) : tr('Level {0}', s.level)));
    this.inner.appendChild(who);

    const killer = div('dth-killer');
    killer.appendChild(span('', tr('Fell on Tier {0}, slain by ', s.depth)));
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
    stat(String(s.depth), s.isRecord ? tr('New record') : tr('Tier reached'), s.isRecord ? 'is-record' : '');
    stat(fmtInt(s.kills), s.elites > 0 ? tr('Kills · {0} elite', s.elites) : tr('Kills'));
    stat(fmtInt(s.gold), tr('Gold found'));
    stat(s.seconds > 0 ? duration(s.seconds) : '-', tr('Time below'));
    this.inner.appendChild(stats);

    if (s.bestItem && s.bestRarity) {
      const best = div('dth-best');
      best.append(span('dth-best-l', tr('Best find')), span(`dth-best-v r-${s.bestRarity}`, s.bestItem));
      this.inner.appendChild(best);
    }

    // What survives.
    const kept = div('dth-kept');
    kept.appendChild(div('dth-kept-h', tr('What survives')));
    const row = div('dth-kept-row');
    const keep = (iconName: string, text: string): void => {
      const d = div('dth-kept-item');
      d.append(icon(iconName, { size: 14 }), span('', text));
      row.appendChild(d);
    };
    keep('stash', tr('The vault and everything in it'));
    keep('coin', tr('{0} banked gold', fmtInt(save.account.bankGold)));
    keep('descend', tr('Best tier {0}', Math.max(save.account.bestDepth, s.depth)));
    kept.appendChild(row);
    this.inner.appendChild(kept);

    // The way forward.
    const others = save.roster.length;
    const primary = others > 0 ? tr('Choose Another') : tr('Rise Again');
    const items: MenuItemOpts[] = [
      {
        label: primary,
        tone: 'primary',
        hint: others > 0 ? trn(others, '{0} living character waiting, or forge a new one', '{0} living characters waiting, or forge a new one', others) : tr('Forge a new character'),
        onSelect: () => this.go('charSelect'),
      },
      {
        label: tr('The Fallen'),
        hint: tr('{0} names on the wall', save.account.fallen.length),
        onSelect: () => events.emit('ui:open', { panel: 'memorial' }),
      },
      { label: tr('Title Screen'), onSelect: () => this.go('title') },
    ];
    this.nav.set(items);
    this.inner.appendChild(this.nav.root);

    const foot = div('dth-foot');
    foot.append(keycap('Enter'), span('', primary));
    this.inner.appendChild(foot);

    this.renderRecap(runStats.latest.hits);
  }

  /**
   * The last blows: what hit you in the final seconds, oldest first, each
   * with where your life stood after it, and the kind of damage that did
   * most of it set against your resistance to it.
   */
  private renderRecap(all: readonly HitRecord[]): void {
    this.recap.replaceChildren();
    const last = all[all.length - 1];
    if (!last) {
      this.recap.style.display = 'none';
      return;
    }
    this.recap.style.display = '';
    const hits = all.filter((h) => h.at >= last.at - RECAP_WINDOW).slice(-RECAP_LINES);
    const first = hits[0]!;

    this.recap.appendChild(div('dth-recap-h', tr('The last blows')));
    const span0 = last.at - first.at;
    const before = Math.min(1, (first.lifeAfter + first.amount) / Math.max(1, first.maxLife));
    const from = before >= 0.99 ? tr('Full life') : tr('{0}% life', Math.round(before * 100));
    this.recap.appendChild(
      div('dth-recap-sum', span0 < 0.1 ? tr('{0} to none in one blow.', from) : tr('{0} to none in {1} s.', from, numText(span0, 1))),
    );

    const list = div('dth-recap-list');
    for (const h of hits) {
      const row = div(`dth-hit${h === last ? ' is-last' : ''}${h.overTime ? ' is-dot' : ''}`);
      const ago = last.at - h.at;
      row.appendChild(span('dth-hit-t', h === last ? tr('last') : `-${tr('{0}s', numText(ago, 1))}`));
      const who = span('dth-hit-who');
      const name = document.createElement('b');
      name.textContent = h.who ?? (h.overTime ? tr('Lingering harm') : tr('Unseen'));
      if (h.rank && RANK_LABEL[h.rank]) name.className = `rank-${h.rank}`;
      who.appendChild(name);
      if (h.what) who.appendChild(span('dth-hit-what', h.overTime ? tr('{0}, over time', h.what) : h.what));
      row.appendChild(who);
      const amt = span(`dth-hit-n dmg-${h.type}`);
      amt.append(icon(h.type, { size: 11 }), span('', fmtInt(Math.round(h.amount))));
      row.appendChild(amt);
      const bar = div('dth-hit-life');
      const fill = div('dth-hit-fill');
      fill.style.width = `${Math.max(0, Math.min(100, (h.lifeAfter / Math.max(1, h.maxLife)) * 100))}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      list.appendChild(row);
    }
    this.recap.appendChild(list);

    // The kind of damage that did most of it, and what stood against it.
    const byType = new Map<DamageType, number>();
    let total = 0;
    for (const h of hits) {
      byType.set(h.type, (byType.get(h.type) ?? 0) + h.amount);
      total += h.amount;
    }
    const top = [...byType].sort((a, b) => b[1] - a[1])[0];
    if (top && total > 0) {
      const share = Math.round((top[1] / total) * 100);
      // Armour, not resistance, is what stands against physical blows.
      const res = top[0] === 'physical' ? undefined : this.snapshot.resists?.[top[0]];
      const tail = res !== undefined ? tr(' Your {0} resistance was {1}%.', top[0], Math.round(res)) : '';
      const line = div('dth-recap-note');
      line.textContent = share >= 99 ? tr('All of it was {0}.{1}', top[0], tail) : tr('Mostly {0}: {1}% of it.{2}', top[0], share, tail);
      this.recap.appendChild(line);
    }
  }

  private go(scene: 'charSelect' | 'title'): void {
    this.close();
    void this.engine.goTo(scene);
  }
}
