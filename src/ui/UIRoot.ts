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
import { remapKey } from '../core/Access';
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
import { journal } from './JournalPanel';
import { dialogue } from './DialoguePanel';
import { TitlePanel } from './TitlePanel';
import { mountTransitions } from './Transitions';
import { mountBanners } from './Banners';
import { runStats } from './RunStats';
import { mountOnboarding } from './Onboarding';
import {
  Panel,
  add,
  clear,
  div,
  span,
  icon,
  classById,
  classAccent,
  closeContextMenu,
  drag,
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

/**
 * Fullscreen panels that *are* the screen rather than sitting over it. Escape
 * never closes these: closing the title or the death screen leaves the player
 * looking at a bare 3D backdrop with no way forward.
 */
const STORY = new Set(['title', 'charSelect', 'death']);

/** Ids handled by scenes rather than the UI layer. */
const SCENE_OWNED = new Set(['hud', 'descend']);

// ---------------------------------------------------------------------------
// Public API (see CONTRACTS.md)
// ---------------------------------------------------------------------------

/** Hotkeys for panels registered from outside this file. */
const EXTRA_KEYS = new Map<string, string>();

/**
 * Registers a panel built elsewhere (see `ui/DepthUI.ts`), with an optional
 * hotkey code such as 'KeyO'. It then opens, closes and toggles exactly like
 * the panels built here, including Escape.
 */
export function registerPanel(id: string, handle: PanelHandle, hotkey?: string): void {
  registry.set(id, handle);
  if (hotkey) EXTRA_KEYS.set(hotkey, id);
}

export function isAnyPanelOpen(): boolean {
  for (const [, p] of registry) if (p.isOpen) return true;
  return false;
}

export function closeAllPanels(): void {
  for (const [, p] of registry) if (p.isOpen) p.close();
  closeContextMenu();
  drag.cancel();
}

/** True if anything other than a fullscreen story panel is open. */
function isOverlayOpen(): boolean {
  for (const [id, p] of registry) if (p.isOpen && !STORY.has(id)) return true;
  return false;
}

/** Closes every open panel except the fullscreen story screens. */
function closeOverlays(): void {
  for (const [id, p] of registry) if (p.isOpen && !STORY.has(id)) p.close();
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
  const at = openOrder.indexOf(id);
  if (at >= 0) openOrder.splice(at, 1);
  openOrder.push(id);
  syncPause();
}

/**
 * The order panels were opened in, newest last. Panels can also close
 * themselves (their own X), so read it through `topOverlay`, which skips
 * anything no longer open.
 */
const openOrder: string[] = [];

/**
 * Panels that are opened *from* another screen and should be backed out of
 * one at a time: Escape in Settings returns to the pause menu or title, not
 * all the way to the game.
 */
const NESTED = new Set(['settings', 'memorial']);

function topOverlay(): string | null {
  for (let i = openOrder.length - 1; i >= 0; i--) {
    const id = openOrder[i]!;
    if (registry.get(id)?.isOpen && !STORY.has(id)) return id;
  }
  for (const [id, p] of registry) if (p.isOpen && !STORY.has(id)) return id;
  return null;
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
    // A short reckoning above the names: how many, how deep, and what keeps
    // doing it.
    const deepest = fallen.reduce((m, f) => Math.max(m, f.depth), 0);
    const tally = new Map<string, number>();
    for (const f of fallen) tally.set(f.killedBy, (tally.get(f.killedBy) ?? 0) + 1);
    let nemesis = '';
    let most = 0;
    for (const [k, n] of tally) if (n > most) [nemesis, most] = [k, n];
    const sum = div('mem-sum');
    const cell = (v: string, l: string): void => {
      const c = div('mem-sum-cell');
      add(c, div('mem-sum-v', v), div('mem-sum-l', l));
      sum.appendChild(c);
    };
    cell(String(fallen.length), 'Fallen');
    cell(`D${deepest}`, 'Deepest grave');
    cell(most > 1 ? nemesis : '-', most > 1 ? `Nemesis · ${most} kills` : 'Nemesis');
    this.list.appendChild(sum);
    for (const f of fallen) {
      const row = div('fallen-row');
      const mark = span('');
      mark.appendChild(icon('skull', { size: 13 }));
      mark.style.color = classAccent(f.classId);
      const body = div('');
      body.appendChild(span('fallen-name', f.name));
      body.appendChild(
        span('fallen-detail', `Level ${f.level} ${classById(f.classId)?.name ?? f.classId}, slain by ${f.killedBy} · ${timeAgo(f.at)}`)
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
  runStats.attach(engine);
  mountBanners(root);
  mountTransitions();
  mountOnboarding(root, engine);

  // --- panels -------------------------------------------------------------
  const title = new TitlePanel(engine);
  const inventory = new InventoryPanel();
  const character = new CharacterPanel();
  const skills = new SkillTreePanel();
  const stash = new StashPanel();
  const vendor = new VendorPanel();
  // Same shop, different shelf. See `VendorOpts`.
  const alchemist = new VendorPanel({
    id: 'alchemist',
    title: 'Apothecary',
    subtitle: 'Flasks, tonics and oils. Buy more than you think you need',
    icon: 'potion',
    only: 'potion',
  });
  const blacksmith = new BlacksmithPanel();
  const map = new MapPanel();
  const questLog = new QuestLogPanel();
  const pause = new PausePanel(engine);
  const settings = new SettingsPanel(engine);
  const charSelect = new CharSelectPanel(engine);
  const death = new DeathPanel(engine);
  const memorial = new MemorialPanel();
  const journalPanel = journal();
  const dialoguePanel = dialogue();
  pauseRef = pause;

  const panels: Array<[string, PanelHandle, Panel]> = [
    ['title', title, title.panel],
    ['inventory', inventory as unknown as PanelHandle, inventory.panel],
    ['character', character as unknown as PanelHandle, character.panel],
    ['skills', skills as unknown as PanelHandle, skills.panel],
    ['stash', stash as unknown as PanelHandle, stash.panel],
    ['vendor', vendor as unknown as PanelHandle, vendor.panel],
    ['alchemist', alchemist as unknown as PanelHandle, alchemist.panel],
    ['blacksmith', blacksmith as unknown as PanelHandle, blacksmith.panel],
    ['map', map as unknown as PanelHandle, map.panel],
    ['questLog', questLog as unknown as PanelHandle, questLog.panel],
    ['pause', pause as unknown as PanelHandle, pause.panel],
    ['settings', settings as unknown as PanelHandle, settings.panel],
    ['charSelect', charSelect as unknown as PanelHandle, charSelect.panel],
    ['death', death as unknown as PanelHandle, death.panel],
    ['memorial', memorial, memorial.panel],
    ['journal', journalPanel, journalPanel.panel],
    ['dialogue', dialoguePanel, dialoguePanel.panel],
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
    if (id.startsWith('class:') || id.startsWith('char:')) return;
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
    KeyJ: 'journal',
  };

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.repeat) return;

    const sceneId = engine.currentSceneId;
    const inWorld = sceneId === 'town' || sceneId === 'dungeon';

    // A confirmation dialog answers the keyboard too: Enter picks the
    // highlighted button (the confirm one unless the player moved off it with
    // the arrows or Tab), Escape below is Cancel.
    const openDialog = document.querySelector<HTMLElement>('.modal-wrap.is-open');
    if (openDialog && e.code !== 'Escape') {
      const buttons = [...openDialog.querySelectorAll<HTMLButtonElement>('.modal-ft button')];
      const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const from = focused >= 0 ? focused : buttons.length - 1;
        buttons[(from + (e.code === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        e.preventDefault();
      } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && focused < 0) {
        // Nothing focused yet: Enter means the confirm button, the last one.
        buttons[buttons.length - 1]?.click();
        e.preventDefault();
      }
      return;
    }

    if (e.code === 'Escape') {
      e.preventDefault();
      if (drag.active) {
        drag.cancel();
        return;
      }
      // A confirmation dialog is the topmost thing on screen, so it is what
      // Escape dismisses: the same as pressing its Cancel button.
      const dialog = document.querySelector<HTMLElement>('.modal-wrap.is-open');
      if (dialog) {
        dialog.querySelector<HTMLButtonElement>('.modal-ft .btn-ghost')?.click();
        return;
      }
      if (isOverlayOpen()) {
        // Back out of a nested screen one step; otherwise clear the deck, the
        // way every inventory-heavy ARPG does.
        const top = topOverlay();
        if (top && NESTED.has(top)) closePanel(top);
        else closeOverlays();
        syncPause();
        return;
      }
      // Character select is one step in from the title, so Escape steps back.
      if (sceneId === 'charSelect') {
        void engine.goTo('title');
        return;
      }
      if (inWorld) togglePanel('pause');
      return;
    }

    if (!inWorld) return;
    const id = KEYS[remapKey(e.code)] ?? EXTRA_KEYS.get(remapKey(e.code));
    if (id) {
      e.preventDefault();
      // Settings owns the keyboard (Q and E page its tabs). From the pause
      // menu a hotkey does what picking that row does: leave the menu, open it.
      if (registry.get('settings')?.isOpen) return;
      if (registry.get('pause')?.isOpen) closePanel('pause');
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
    runStats.tick(dt);
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
