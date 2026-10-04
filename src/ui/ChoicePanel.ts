/**
 * SLAY — the choice panel.
 *
 * A short list of options and a way to walk away. Used by shrines of choices
 * and anything else that offers the player a bargain. The caller supplies the
 * options and gets told which one was taken; the panel holds no game rules.
 */

import { Panel, Button, div, clear, span, add } from './Widgets';

export interface ChoiceOption {
  id: string;
  title: string;
  gain: string;
  cost?: string;
  disabled?: string;
}

export class ChoicePanel {
  readonly panel: Panel;
  private body: HTMLDivElement;
  private onPick: ((id: string | null) => void) | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'choice',
      title: 'A Choice',
      icon: 'sparkle',
      width: 520,
      onClose: () => this.resolve(null),
    });
    this.body = div('depth-panel');
    this.panel.body.appendChild(this.body);
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

  /** Shows the options. `onPick` gets the chosen id, or null for walking away. */
  offer(title: string, subtitle: string, options: ChoiceOption[], onPick: (id: string | null) => void): void {
    this.resolve(null);
    this.onPick = onPick;
    this.panel.setTitle(title, subtitle);
    clear(this.body);
    for (const o of options) {
      const card = div(`depth-card${o.disabled ? ' is-locked' : ''}`);
      const b = div('depth-card-body');
      b.appendChild(div('depth-card-title', o.title));
      const gain = div('depth-card-sub');
      add(gain, span('depth-good', o.gain));
      b.appendChild(gain);
      if (o.cost) {
        const cost = div('depth-card-sub');
        add(cost, span('depth-bad', o.cost));
        b.appendChild(cost);
      }
      if (o.disabled) b.appendChild(div('depth-card-sub', o.disabled));
      card.appendChild(b);
      const btn = new Button({
        label: 'Accept',
        small: true,
        variant: o.disabled ? 'ghost' : 'gold',
        onClick: () => {
          const fn = this.onPick;
          this.onPick = null;
          this.panel.close();
          fn?.(o.id);
        },
      });
      btn.setDisabled(!!o.disabled);
      card.appendChild(btn.root);
      this.body.appendChild(card);
    }
    const foot = div('depth-row depth-foot');
    foot.appendChild(span('depth-dim', 'Choose one, or walk away.'));
    foot.appendChild(
      new Button({ label: 'Walk away', small: true, variant: 'ghost', onClick: () => this.panel.close() }).root,
    );
    this.body.appendChild(foot);
    this.panel.open();
  }

  private resolve(id: string | null): void {
    const fn = this.onPick;
    this.onPick = null;
    fn?.(id);
  }
}
