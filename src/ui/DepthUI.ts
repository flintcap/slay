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
import { LootFilterPanel } from './LootFilterPanel';

let mounted = false;

export function mountDepthUI(): void {
  if (mounted) return;
  const root = uiRootElement();
  if (!root) return;
  mounted = true;

  const lootFilter = new LootFilterPanel();
  lootFilter.panel.mount(root);
  registerPanel('lootFilter', lootFilter, 'KeyO');
}
