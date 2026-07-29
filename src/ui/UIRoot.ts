/**
 * SLAY — UI root.
 *
 * Owns the panel registry, the keyboard shortcuts, the `pointerOverUI` flag
 * that stops panel clicks from firing skills into the world, and the single
 * requestAnimationFrame the HUD ticks on.
 *
 * Panels are addressed by id through the `ui:open` / `ui:close` bus events, so
 * scenes never hold a reference to a DOM object.
 */

import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { HUD } from './HUD';
import { tooltip } from './Tooltip';
import { InventoryPanel } from './InventoryPanel';
import { CharacterPanel } from './CharacterPanel';
import { SkillTreePanel } from './SkillTreePanel';
import { StashPanel } from './StashPanel';
import { VendorPanel } from './VendorPanel';
import { BlacksmithPanel } from './BlacksmithPanel';
import { MapPanel } from './MapPanel';
import { QuestLogPanel } from './QuestLog';
import { PausePanel } from './PausePanel';
import { SettingsPanel } from './SettingsPanel';
import { CharSelectPanel } from './CharSelectPanel';
import { DeathPanel } from './DeathPanel';
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
  closeContextMenu,
  drag,
  fmtInt,
  timeAgo,
  emptyState,
} from './Widgets';

interface PanelHandle {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

const registry = new Map<string, PanelHandle>();
let mounted = false;
let uiRoot: HTMLElement | null = null;
let engineRef: Engine | null = null;
let hudRef: HUD | null = null;
let pauseRef: PausePanel | null = null;

/** Panels that pause the simulation while open (dungeon only). */
const PAUSING = new Set(['pause', 'settings', 'charSelect', 'death']);

/** Ids handled by scenes rather than the UI layer. */
const SCENE_OWNED = new Set(['hud', 'descend']);

// ---------------------------------------------------------------------------
// Public API (see CONTRACTS.md)
// ---------------------------------------------------------------------------

export function isAnyPanelOpen(): boolean {
  for (const [, p] of registry) if (p.isOpen) return true;
  return false;
}

export function closeAllPanels(): void {
  for (const [, p] of registry) if (p.isOpen) p.close();
  closeContextMenu();
  drag.cancel();
}

/** Closes everything except the given id. */
function closeOthers(keep: string): void {
  for (const [id, p] of registry) if (id !== keep && p.isOpen) p.close();
}

export function openPanel(id: string): void {
  const p = registry.get(id);
  if (!p) return;
  // Fullscreen story panels take over completely.
  if (id === 'charSelect' || id === 'death' || id === 'title') closeOthers(id);
  p.open();
  syncPause();
}

export function closePanel(id: string): void {
  registry.get(id)?.close();
  syncPause();
}

export function togglePanel(id: string): void {
  const p = registry.get(id);
  if (!p) return;
  if (p.isOpen) p.close();
  else openPanel(id);
  syncPause();
}

function syncPause(): void {
  if (!engineRef) return;
  const scene = engineRef.currentSceneId;
  if (scene !== 'dungeon') {
    if (engineRef.paused) engineRef.setPaused(false);
    return;
  }
  let wantPause = false;
  for (const id of PAUSING) if (registry.get(id)?.isOpen) wantPause = true;
  engineRef.setPaused(wantPause);
}

// ---------------------------------------------------------------------------
// Title panel — small enough to live here rather than in its own file.
// ---------------------------------------------------------------------------

class TitlePanel {
  readonly panel: Panel;

  constructor(engine: Engine) {
    this.panel = new Panel({
      id: 'title',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'panel-titlescreen',
    });
    this.panel.header.style.display = 'none';
    this.panel.frame.style.background = 'transparent';

    const wrap = div('title-wrap');
    const inner = div('');
    inner.appendChild(div('title-logo', 'SLAY'));
    inner.appendChild(div('title-tagline', 'Descend. Die. Descend again.'));

    const menu = div('title-menu');
    const acct = save.account;

    if (acct.current) {
      const c = acct.current;
      menu.appendChild(
        new Button({
          label: 'Continue',
          variant: 'primary',
          icon: 'play',
          hint: `${c.name} · Lv ${c.level}`,
          onClick: () => {
            this.panel.close();
            void engine.goTo('town');
          },
        }).root
      );
    }

    // The account holds a roster now, so this is a chooser rather than a
    // one-way door. It used to read 'Abandon & Start Over', which was both the
    // only route to the creation screen and a promise to destroy the character
    // you already had — so there was no way to have two.
    menu.appendChild(
      new Button({
        label: save.roster.length > 0 ? 'Characters' : 'New Character',
        variant: acct.current ? 'ghost' : 'primary',
        icon: save.roster.length > 0 ? 'bag' : 'skull',
        hint:
          save.roster.length > 0
            ? `${save.roster.length} living · pick one or make another`
            : undefined,
        onClick: () => {
          this.panel.close();
          void engine.goTo('charSelect');
        },
      }).root
    );

    menu.appendChild(
      new Button({
        label: 'Settings',
        variant: 'ghost',
        icon: 'gear',
        onClick: () => openPanel('settings'),
      }).root
    );

    inner.appendChild(menu);

    const stats = div('title-stats');
    const stat = (v: string, l: string): HTMLElement => {
      const d = div('title-stat');
      d.appendChild(div('title-stat-v', v));
      d.appendChild(div('title-stat-l', l));
      return d;
    };
    stats.appendChild(stat(String(acct.bestDepth), 'Best Depth'));
    stats.appendChild(stat(String(acct.fallen.length), 'Fallen'));
    stats.appendChild(stat(fmtInt(acct.bankGold), 'Banked Gold'));
    inner.appendChild(stats);

    inner.appendChild(div('title-foot', 'The vault and the memorial survive. Nothing else does.'));
    wrap.appendChild(inner);
    this.panel.body.appendChild(wrap);
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
}

// ---------------------------------------------------------------------------
// Memorial panel
// ---------------------------------------------------------------------------

class MemorialPanel {
  readonly panel: Panel;
  private list: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'memorial',
      title: 'The Fallen',
      subtitle: 'Every name here reached further than the last',
      icon: 'skull',
      width: 560,
      scrim: true,
    });
    this.list = div('cs-memorial-list');
    this.list.style.maxHeight = '52vh';
    this.panel.body.appendChild(this.list);
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

  private render(): void {
    clear(this.list);
    const fallen = save.account.fallen;
    if (!fallen.length) {
      this.list.appendChild(emptyState('No one has died yet. Give it time.', 'skull'));
      return;
    }
    for (const f of fallen) {
      const row = div('fallen-row');
      const mark = span('');
      mark.appendChild(icon('skull', { size: 13 }));
      mark.style.color = classAccent(f.classId);
      const body = div('');
      body.appendChild(span('fallen-name', f.name));
      body.appendChild(
        span('fallen-detail', `Level ${f.level} ${classById(f.classId)?.name ?? f.classId} — slain by ${f.killedBy} · ${timeAgo(f.at)}`)
      );
      const depth = span('fallen-depth', `D${f.depth}`);
      add(row, mark, body, depth);
      this.list.appendChild(row);
    }
  }
}

// ---------------------------------------------------------------------------
// mountUI
// ---------------------------------------------------------------------------

export function mountUI(engine: Engine): void {
  if (mounted) return;
  mounted = true;
  engineRef = engine;

  const root = document.getElementById('ui');
  if (!root) throw new Error('mountUI: #ui element is missing from index.html');
  uiRoot = root;

  // --- HUD + tooltip ------------------------------------------------------
  const hud = new HUD(engine);
  hud.mount(root);
  hudRef = hud;
  tooltip.mount(root);

  // --- panels -------------------------------------------------------------
  const title = new TitlePanel(engine);
  const inventory = new InventoryPanel();
  const character = new CharacterPanel();
  const skills = new SkillTreePanel();
  const stash = new StashPanel();
  const vendor = new VendorPanel();
  const blacksmith = new BlacksmithPanel();
  const map = new MapPanel();
  const questLog = new QuestLogPanel();
  const pause = new PausePanel(engine);
  const settings = new SettingsPanel(engine);
  const charSelect = new CharSelectPanel(engine);
  const death = new DeathPanel(engine);
  const memorial = new MemorialPanel();
  pauseRef = pause;

  const panels: Array<[string, PanelHandle, Panel]> = [
    ['title', title, title.panel],
    ['inventory', inventory as unknown as PanelHandle, inventory.panel],
    ['character', character as unknown as PanelHandle, character.panel],
    ['skills', skills as unknown as PanelHandle, skills.panel],
    ['stash', stash as unknown as PanelHandle, stash.panel],
    ['vendor', vendor as unknown as PanelHandle, vendor.panel],
    ['blacksmith', blacksmith as unknown as PanelHandle, blacksmith.panel],
    ['map', map as unknown as PanelHandle, map.panel],
    ['questLog', questLog as unknown as PanelHandle, questLog.panel],
    ['pause', pause as unknown as PanelHandle, pause.panel],
    ['settings', settings as unknown as PanelHandle, settings.panel],
    ['charSelect', charSelect as unknown as PanelHandle, charSelect.panel],
    ['death', death as unknown as PanelHandle, death.panel],
    ['memorial', memorial, memorial.panel],
  ];
  panelRegistry.clear();
  for (const [id, handle] of panels) panelRegistry.set(id, handle);

  for (const [id, handle, panel] of panels) {
    panel.mount(root);
    registry.set(id, {
      // Fall back to the Panel itself. Every entry here is cast through
      // `as unknown as PanelHandle`, so a panel class that never defined
      // close() type-checked fine and then threw on the second keypress —
      // which is what stopped I, C and T from closing what they opened.
      open: () => (typeof handle.open === 'function' ? handle.open() : panel.open()),
      close: () => (typeof handle.close === 'function' ? handle.close() : panel.close()),
      get isOpen() {
        return panel.isOpen;
      },
    });
  }

  // --- bus wiring ---------------------------------------------------------
  events.on('ui:open', (p) => {
    const id = p.panel;
    if (!id || SCENE_OWNED.has(id)) return;
    // `class:<id>` is the CharSelect panel talking to the CharSelect scene.
    if (id.startsWith('class:')) return;
    openPanel(id);
  });

  events.on('ui:close', (p) => {
    if (!p.panel || SCENE_OWNED.has(p.panel)) return;
    closePanel(p.panel);
  });

  events.on('scene:change', (p) => {
    closeContextMenu();
    drag.cancel();
    // Leaving a scene closes anything the previous scene left open.
    for (const [id, panel] of registry) {
      if (panel.isOpen && id !== p.to) panel.close();
    }
    if (p.to === 'title') openPanel('title');
    if (p.to === 'charSelect') openPanel('charSelect');
    syncPause();
  });

  // --- keyboard -----------------------------------------------------------
  const KEYS: Record<string, string> = {
    KeyI: 'inventory',
    KeyC: 'character',
    KeyT: 'skills',
    KeyB: 'stash',
    KeyM: 'map',
    KeyL: 'questLog',
    KeyJ: 'questLog',
  };

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.repeat) return;

    const sceneId = engine.currentSceneId;
    const inWorld = sceneId === 'town' || sceneId === 'dungeon';

    if (e.code === 'Escape') {
      e.preventDefault();
      if (drag.active) {
        drag.cancel();
        return;
      }
      if (isAnyPanelOpen()) {
        closeAllPanels();
        syncPause();
        return;
      }
      if (inWorld) togglePanel('pause');
      return;
    }

    if (!inWorld) return;
    const id = KEYS[e.code];
    if (id) {
      e.preventDefault();
      togglePanel(id);
    }
  });

  // --- pointerOverUI ------------------------------------------------------
  // elementFromPoint only returns UI nodes that opted back into pointer events,
  // so this is exactly "is the cursor over something clickable".
  const updatePointer = (x: number, y: number): void => {
    const hit = document.elementFromPoint(x, y);
    const over = !!hit && hit !== engine.renderer.canvas && root.contains(hit);
    // `.ui-soft` nodes — the ground-loot labels — take the left button and let
    // everything else through, so they must not block the attack button.
    const soft = over && !!(hit as HTMLElement).closest('.ui-soft');
    engine.input.pointerOverUI = over && !soft;
    engine.input.pointerOverClickable = over;
  };
  window.addEventListener('pointermove', (e) => updatePointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => updatePointer(e.clientX, e.clientY), { capture: true });
  window.addEventListener('pointerleave', () => {
    engine.input.pointerOverUI = false;
    engine.input.pointerOverClickable = false;
  });

  // --- UI tick ------------------------------------------------------------
  let last = performance.now();
  let elapsed = 0;
  const tick = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;
    hud.update(dt, elapsed);
    map.tick();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Every built panel, by id.
 *
 * The screenshot and behaviour tools drive panels through their real handlers
 * rather than re-implementing them, which is the only way a check can prove the
 * thing the player touches actually works.
 */
const panelRegistry = new Map<string, unknown>();

export function panelInstance(id: string): unknown {
  return panelRegistry.get(id);
}

/** Exposed for panels that need to nudge the HUD (quest log sync). */
export function hudInstance(): HUD | null {
  return hudRef;
}

export function pauseInstance(): PausePanel | null {
  return pauseRef;
}

export function uiRootElement(): HTMLElement | null {
  return uiRoot;
}
