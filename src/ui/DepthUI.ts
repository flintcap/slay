/**
 * SLAY — the depth stream's panels.
 *
 * Every panel the systems layer adds (loot filter, progression, town services)
 * is built and registered here, so `UIRoot` only needs one line to know about
 * all of them. Each registers through `registerPanel`, which gives it the same
 * Escape handling, hotkey toggling and `ui:open` routing as the core panels.
 */

import './depth.css';
import { registerPanel, uiRootElement } from './UIRoot';
import { events, toast } from '../core/Events';
import { save } from '../core/Save';
import { legacyOf, pointsAvailable } from '../sim/Legacy';
import { LootFilterPanel } from './LootFilterPanel';
import { LegacyPanel } from './LegacyPanel';
import { ChoicePanel } from './ChoicePanel';
import { GamblerPanel } from './GamblerPanel';
import { EnchanterPanel } from './EnchanterPanel';
import { FusePanel } from './FusePanel';
import { BountyPanel } from './BountyPanel';
import { setChoiceHandler, setGateHandler } from './ChoiceSeam';
import { GatePanel } from './GatePanel';
import { tr, trn } from '../core/I18n';

let choicePanel: ChoicePanel | null = null;

/** Lives in `ChoiceSeam` so systems can import it without the DOM. */
export { offerChoice } from './ChoiceSeam';

let mounted = false;

export function mountDepthUI(): void {
  if (mounted) return;
  const root = uiRootElement();
  if (!root) return;
  mounted = true;

  const lootFilter = new LootFilterPanel();
  lootFilter.panel.mount(root);
  registerPanel('lootFilter', lootFilter, 'KeyO');

  const legacy = new LegacyPanel();
  legacy.panel.mount(root);
  registerPanel('legacy', legacy, 'KeyG');

  choicePanel = new ChoicePanel();
  choicePanel.panel.mount(root);
  registerPanel('choice', choicePanel);
  setChoiceHandler((title, subtitle, options, onPick) => choicePanel!.offer(title, subtitle, options, onPick));

  // The gate's tier choice, before every descent from town.
  const gatePanel = new GatePanel();
  gatePanel.panel.mount(root);
  registerPanel('gate', gatePanel);
  setGateHandler((offer, onPick) => gatePanel.ask(offer, onPick));

  // Town services, opened from their stations in camp (scenes/TownStations).
  const gambler = new GamblerPanel();
  gambler.panel.mount(root);
  registerPanel('gambler', gambler);
  const enchanter = new EnchanterPanel();
  enchanter.panel.mount(root);
  registerPanel('enchanter', enchanter);
  // Sister Vell's second service: three stones into one (data/story/npcs.ts).
  const fuse = new FusePanel();
  fuse.panel.mount(root);
  registerPanel('fuse', fuse);
  const bounties = new BountyPanel();
  bounties.panel.mount(root);
  registerPanel('bounties', bounties);

  // Back in camp with points to spend: say where they go, once per visit.
  events.on('scene:change', (p) => {
    if (p.to !== 'town') return;
    const acct = save.account;
    if (legacyOf(acct).renown <= 0) return;
    const pts = pointsAvailable(acct);
    if (!save.hasUnlock('tutorial.legacy')) {
      save.unlock('tutorial.legacy');
      setTimeout(() => toast(tr('Your Renown carries over between lives. Press G for Legacy.'), 'epic'), 2600);
    } else if (pts > 0) {
      setTimeout(() => toast(trn(pts, '{0} Legacy point to spend. Press G.', '{0} Legacy points to spend. Press G.', pts), 'good'), 2600);
    }
  });
}
