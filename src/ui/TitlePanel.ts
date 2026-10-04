/**
 * SLAY — the title screen overlay.
 *
 * The 3D gate lives in TitleScene; this is everything drawn over it: the
 * engraved logo, the resume card for the character you last played, the menu,
 * and a footer strip with the account's lifetime numbers.
 *
 * The content is rebuilt on every open. It used to be built once at boot, so a
 * player who made a character, died, or deleted one and came back to the title
 * saw a menu describing the account as it was when the page loaded.
 */

import type { Engine } from '../core/Engine';
import { save } from '../core/Save';
import { events } from '../core/Events';
import { Panel, div, span, classAccent, classCrestSvg, classById, fmtInt, duration, keycap } from './Widgets';
import { MenuNav, type MenuItemOpts } from './MenuNav';
import { DIFFICULTIES } from '../data/difficulties';

/** The SLAY wordmark: bevelled gold with a slow specular sweep. */
const LOGO_SVG = `
<svg class="ttl-logo-svg" viewBox="0 0 640 200" aria-label="SLAY" role="img">
  <defs>
    <linearGradient id="ttlGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff5d2"/>
      <stop offset="0.3" stop-color="#ecc96e"/>
      <stop offset="0.58" stop-color="#a9792a"/>
      <stop offset="0.8" stop-color="#5a3b0f"/>
      <stop offset="1" stop-color="#9c7230"/>
    </linearGradient>
    <linearGradient id="ttlShine" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0.38" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/>
      <stop offset="0.62" stop-color="#fff" stop-opacity="0"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="-1.2 0; 1.2 0; 1.2 0"
        keyTimes="0; 0.35; 1" dur="7s" begin="2.4s" repeatCount="indefinite"/>
    </linearGradient>
    <filter id="ttlBevel" x="-10%" y="-20%" width="120%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="4" specularConstant="0.85" specularExponent="22"
        lighting-color="#fff3d0" result="spec">
        <fePointLight x="180" y="-260" z="260"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.75" k4="0"/>
    </filter>
    <filter id="ttlDrop" x="-20%" y="-30%" width="140%" height="170%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <text x="326" y="166" text-anchor="middle" class="ttl-logo-text ttl-logo-shadow" filter="url(#ttlDrop)">SLAY</text>
  <text x="320" y="156" text-anchor="middle" class="ttl-logo-text" fill="url(#ttlGold)" stroke="#24170a"
    stroke-width="2.5" paint-order="stroke" filter="url(#ttlBevel)">SLAY</text>
  <text x="320" y="156" text-anchor="middle" class="ttl-logo-text ttl-logo-shine" fill="url(#ttlShine)">SLAY</text>
</svg>`;

/** Short, rotating lines under the logo. One is picked per visit. */
const TAGLINES = [
  'Descend. Die. Descend again.',
  'The vault remembers. Nobody else will.',
  'Every floor is new. Every death is final.',
  'There is always another stair.',
];

export class TitlePanel {
  readonly panel: Panel;
  private engine: Engine;
  private nav: MenuNav;
  private tag: HTMLDivElement;
  private hero: HTMLDivElement;
  private foot: HTMLDivElement;
  private visits = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'title',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'panel-titlescreen ttl',
    });
    this.panel.header.style.display = 'none';

    const root = div('ttl-root');
    root.appendChild(div('ttl-shade'));
    root.appendChild(div('ttl-letterbox top'));
    root.appendChild(div('ttl-letterbox bottom'));

    const col = div('ttl-col');
    const logo = div('ttl-logo');
    logo.innerHTML = LOGO_SVG;
    col.appendChild(logo);

    const rule = div('ttl-rule');
    rule.appendChild(span('ttl-rule-gem'));
    col.appendChild(rule);

    this.tag = div('ttl-tag');
    col.appendChild(this.tag);

    this.hero = div('ttl-hero');
    col.appendChild(this.hero);

    this.nav = new MenuNav('mn-list ttl-menu');
    col.appendChild(this.nav.root);

    root.appendChild(col);

    this.foot = div('ttl-foot');
    root.appendChild(this.foot);

    this.panel.body.appendChild(root);
  }

  open(): void {
    // The scene announces itself and UIRoot opens the screen on scene change,
    // so this is routinely called twice. Only the first one counts.
    if (this.panel.isOpen) return;
    this.render();
    // The full intro choreography plays once per page load. Coming back from
    // the pause menu or a deleted save should not make the player sit through
    // it again.
    this.panel.root.classList.toggle('is-quick', this.visits > 0);
    this.visits++;
    this.panel.open();
    this.nav.setActive(true);
  }

  close(): void {
    this.nav.setActive(false);
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- content -------------------------------------------------------------

  private render(): void {
    const acct = save.account;
    const current = acct.current;
    const roster = save.roster;

    this.tag.textContent = TAGLINES[(this.visits + acct.fallen.length) % TAGLINES.length]!;

    // --- resume card ------------------------------------------------------
    this.hero.replaceChildren();
    this.hero.style.display = current ? '' : 'none';
    if (current) {
      const accent = classAccent(current.classId);
      this.hero.style.setProperty('--accent', accent);
      const crest = div('ttl-hero-crest');
      crest.innerHTML = classCrestSvg(current.classId, accent, 46);
      const body = div('ttl-hero-body');
      body.appendChild(div('ttl-hero-kicker', 'Last descended as'));
      body.appendChild(div('ttl-hero-name', current.name));
      const cls = classById(current.classId)?.name ?? current.classId;
      const dif = DIFFICULTIES.find((d) => d.id === current.difficulty);
      const bits = [`Level ${current.level} ${cls}`];
      if (current.depthRecord > 0) bits.push(`Deepest ${current.depthRecord}`);
      if (current.playtime > 0) bits.push(duration(current.playtime));
      if (dif) bits.push(dif.name);
      body.appendChild(div('ttl-hero-meta', bits.join('  ·  ')));
      this.hero.append(crest, body);
    }

    // --- menu -------------------------------------------------------------
    const items: MenuItemOpts[] = [];
    if (current) {
      items.push({
        label: 'Continue',
        tone: 'primary',
        hint: `Return to town as ${current.name}`,
        onSelect: () => this.go('town'),
      });
    }
    items.push({
      label: roster.length > 0 ? 'Characters' : 'New Character',
      tone: current ? 'default' : 'primary',
      hint:
        roster.length > 0
          ? `${roster.length} living · choose one or forge another`
          : 'Choose a class and take up the torch',
      onSelect: () => this.go('charSelect'),
    });
    items.push({
      label: 'Settings',
      hint: 'Picture, sound and controls',
      onSelect: () => events.emit('ui:open', { panel: 'settings' }),
    });
    if (acct.fallen.length > 0) {
      items.push({
        label: 'The Fallen',
        hint: `${acct.fallen.length} remembered`,
        onSelect: () => events.emit('ui:open', { panel: 'memorial' }),
      });
    }
    this.nav.set(items);

    // --- footer -----------------------------------------------------------
    this.foot.replaceChildren();
    const stats = div('ttl-stats');
    const stat = (v: string, l: string): void => {
      const d = div('ttl-stat');
      d.append(div('ttl-stat-v', v), div('ttl-stat-l', l));
      stats.appendChild(d);
    };
    stat(String(acct.bestDepth), 'Best depth');
    stat(String(roster.length), 'Living');
    stat(String(acct.fallen.length), 'Fallen');
    stat(fmtInt(acct.bankGold), 'Banked gold');
    const keys = div('ttl-keys');
    keys.append(keycap('↑'), keycap('↓'), span('', 'Choose'), keycap('Enter'), span('', 'Confirm'));
    const motto = div('ttl-motto', 'The vault and the memorial survive. Nothing else does.');
    this.foot.append(stats, motto, keys);
  }

  private go(scene: 'town' | 'charSelect'): void {
    this.close();
    void this.engine.goTo(scene);
  }
}
