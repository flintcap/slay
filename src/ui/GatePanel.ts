/**
 * SLAY — the gate, before a descent.
 *
 * Opens on the deepest tier this character can take (the one after their
 * best clear) and lets them step down to any tier below it, to farm gear and
 * levels on ground they have already won, or up to a Legacy waypoint. Shows
 * what the chosen tier holds against the hero's level. The rules of where a
 * descent may start live in `scenes/DescentPlanner.ts`; this panel only asks.
 */

import { Panel, Button, IconButton, Slider, div, span, add, clear, hex, statLine } from './Widgets';
import type { GateOffer } from './ChoiceSeam';
import { monsterLevelForDepth, itemLevelForDepth, levelsForDepth, xpMultiplier } from '../sim/Difficulty';
import { depthDangerBand } from '../sim/Progression';

export class GatePanel {
  readonly panel: Panel;
  private body: HTMLDivElement;
  private offer: GateOffer | null = null;
  private onPick: ((depth: number | null) => void) | null = null;
  /** Every tier the gate can open, shallowest first. */
  private tiers: number[] = [];
  private index = 0;
  private slider: Slider | null = null;
  private view: HTMLDivElement = div();

  constructor() {
    this.panel = new Panel({
      id: 'gate',
      title: 'The Descent',
      subtitle: 'Choose how deep to go',
      icon: 'descend',
      width: 460,
      onClose: () => this.resolve(null),
    });
    this.body = div('depth-panel gate-panel');
    this.panel.body.appendChild(this.body);
    this.panel.root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') this.step(-1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') this.step(1);
      else return;
      e.preventDefault();
    });
  }

  open(): void {
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  ask(offer: GateOffer, onPick: (depth: number | null) => void): void {
    this.resolve(null);
    this.offer = offer;
    this.onPick = onPick;
    const below = Array.from({ length: offer.top }, (_, i) => i + 1);
    this.tiers = [...new Set([...below, ...offer.waypoints.filter((d) => d > offer.top)])].sort((a, b) => a - b);
    this.index = this.tiers.indexOf(offer.top);
    this.build();
    this.panel.open();
  }

  private build(): void {
    clear(this.body);
    const offer = this.offer!;

    const picker = div('gate-picker');
    const down = new IconButton('chevronLeft', 'Lower tier', () => this.step(-1), 18);
    const up = new IconButton('chevronRight', 'Higher tier', () => this.step(1), 18);
    down.root.classList.add('gate-step');
    up.root.classList.add('gate-step');
    this.view = div('gate-tier');
    add(picker, down.root, this.view, up.root);
    this.body.appendChild(picker);

    // Long ladders get a slider too, so tier 1 is not forty clicks away.
    this.slider = null;
    if (this.tiers.length > 4) {
      this.slider = new Slider(
        'Tier',
        this.index,
        0,
        this.tiers.length - 1,
        1,
        (v) => {
          this.index = Math.round(v);
          this.paint();
        },
        (v) => `${this.tiers[Math.round(v)] ?? ''}`,
      );
      this.slider.root.classList.add('gate-slider');
      this.body.appendChild(this.slider.root);
    }

    this.body.appendChild(div('gate-info'));
    this.body.appendChild(div('depth-note gate-note'));

    const foot = div('depth-row depth-foot');
    foot.appendChild(span('depth-dim', offer.record > 0 ? `Best clear: Tier ${offer.record}` : 'No tier cleared yet'));
    const btns = div('depth-row');
    add(
      btns,
      new Button({ label: 'Stay', small: true, variant: 'ghost', onClick: () => this.panel.close() }).root,
      new Button({ label: 'Descend', icon: 'descend', variant: 'gold', onClick: () => this.go() }).root,
    );
    foot.appendChild(btns);
    this.body.appendChild(foot);
    this.paint();
  }

  private step(by: number): void {
    if (!this.offer) return;
    const next = Math.max(0, Math.min(this.tiers.length - 1, this.index + by));
    if (next === this.index) return;
    this.index = next;
    if (this.slider) this.slider.set(next);
    else this.paint();
  }

  private paint(): void {
    const offer = this.offer;
    if (!offer) return;
    const depth = this.tiers[this.index]!;
    const top = depth === offer.top;
    const waypoint = depth > offer.top;

    clear(this.view);
    const tag = waypoint ? 'Waypoint' : top ? 'Next tier' : 'Replay';
    add(this.view, span(`gate-tag${top ? ' is-top' : waypoint ? ' is-way' : ''}`, tag), div('depth-big gate-num', `Tier ${depth}`));
    this.body.querySelectorAll<HTMLButtonElement>('.gate-step').forEach((b, i) => {
      b.disabled = i === 0 ? this.index === 0 : this.index === this.tiers.length - 1;
    });

    const info = this.body.querySelector('.gate-info')!;
    clear(info);
    const band = depthDangerBand(depth, offer.level);
    const danger = statLine('Danger', band.label, { icon: 'skull' });
    (danger.querySelector('.statline-value') as HTMLElement).style.color = hex(band.color);
    add(
      info,
      statLine('Monster level', String(monsterLevelForDepth(depth)), { icon: 'attack' }),
      danger,
      statLine('Item level', String(itemLevelForDepth(depth)), { icon: 'gem' }),
      statLine('Areas before the boss', String(levelsForDepth(depth)), { icon: 'map' }),
      statLine('Experience bonus', `+${Math.round((xpMultiplier(depth) - 1) * 100)}%`, { icon: 'star' }),
    );

    const note = this.body.querySelector('.gate-note')!;
    note.textContent = waypoint
      ? 'A milestone your legacy has claimed. Start a life deep, if you can hold it.'
      : top
        ? `The deepest tier open to you. Clear it to open Tier ${depth + 1}.`
        : `A tier you have already cleared. Good for gear and levels. Your progress is kept.`;
  }

  private go(): void {
    const depth = this.tiers[this.index];
    const fn = this.onPick;
    this.onPick = null;
    this.panel.close();
    if (depth !== undefined) fn?.(depth);
  }

  private resolve(depth: number | null): void {
    const fn = this.onPick;
    this.onPick = null;
    fn?.(depth);
  }
}
