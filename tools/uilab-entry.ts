/**
 * UI lab: the real HUD and panels, mounted without the 3D engine.
 *
 * A full screenshot boots WebGL under software rendering and takes about ten
 * minutes, which is far too slow to judge a border or a font size. Nothing in
 * `src/ui` needs the renderer, so this mounts the real UI against a stub engine
 * and a stub scene and drives it into named states. `tools/uilab.mjs` opens it
 * in headless Chromium and photographs each state in seconds.
 *
 * Randomness goes through a fixed-seed stream so every run shows the same loot.
 */
import { mountUI, hudInstance } from '../src/ui/UIRoot';
import { events } from '../src/core/Events';
import { save } from '../src/core/Save';
import { Random } from '../src/core/RNG';
import { createCharacter, grantXp, allocateSkill, allocateStat, equipItem } from '../src/sim/Character';
import { rollItem, getBase } from '../src/sim/Loot';
import { computeStats } from '../src/sim/Stats';
import { addItemToInventory } from '../src/sim/Inventory';
import { setIconBaseResolver } from '../src/art/Icons';
import { SKILLS } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { STATUSES } from '../src/data/statuses';
import { hoverHooks, runtime, modal, contextMenu } from '../src/ui/Widgets';
import type { CharClassId } from '../src/types';

setIconBaseResolver((id) => {
  try {
    return getBase(id);
  } catch {
    return undefined;
  }
});

const rng = new Random(0x51a7);

function makeCharacter(classId: CharClassId, level: number): void {
  const def = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
  const c = createCharacter(`Aldric`, def.id, rng);
  for (let i = 1; i < level; i++) {
    for (let k = 0; k < 40 && c.level === i; k++) grantXp(c, 500 * i * i + 1000);
  }
  const classSkills = SKILLS.filter((s) => def.trees.includes(s.treeId));
  let guard = 0;
  while (c.skillPoints > 2 && guard++ < 400) {
    const pick = classSkills[guard % classSkills.length];
    if (!pick) break;
    allocateSkill(c, pick.id);
  }
  guard = 0;
  while (c.statPoints > 3 && guard++ < 1000) {
    const order = ['vitality', 'strength', 'dexterity', 'energy'] as const;
    if (!allocateStat(c, order[guard % 4]!)) break;
  }
  const actives = classSkills.filter((s) => s.targeting !== 'passive' && (c.skills[s.id] ?? 0) > 0);
  for (let i = 0; i < 6; i++) c.hotbar[i] = actives[i]?.id ?? null;
  for (let i = 0; i < 12; i++) {
    const item = rollItem(Math.max(1, level), rng, { magicFind: 400, classId: def.id });
    const res = equipItem(c, item);
    if (!res.ok) addItemToInventory(c, item);
  }
  for (let i = 0; i < 26; i++) addItemToInventory(c, rollItem(level + 4, rng, { magicFind: 900 }));
  for (let i = 0; i < 20; i++) save.stashItem(rollItem(level + 8, rng, { magicFind: 900 }));
  c.gold += 48210;
  c.xp = Math.round(c.xp * 0.6);
  save.setCharacter(c);
}

// --- stub engine -------------------------------------------------------------

const scene = {
  player: null as Record<string, unknown> | null,
};

const engine = {
  currentScene: scene,
  currentSceneId: 'dungeon',
  paused: false,
  setPaused(v: boolean) {
    this.paused = v;
  },
  renderer: { canvas: document.getElementById('view'), setQuality() {} },
  input: { pointerOverUI: false, pointerOverClickable: false },
  goTo: async () => {},
};

makeCharacter((new URLSearchParams(location.search).get('class') as CharClassId) || 'pyromancer', 28);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
mountUI(engine as any);

const c = save.account.current!;
const stats = computeStats(c);
const cooldowns = new Map<string, number>();
const hb = c.hotbar.filter(Boolean) as string[];
if (hb[1]) cooldowns.set(hb[1], 3.2);
if (hb[3]) cooldowns.set(hb[3], 0.6);
scene.player = {
  life: stats.life * 0.22,
  mana: stats.mana * 0.64,
  stats,
  cooldowns,
  dodgeCooldown: 0.5,
  position: { x: 0, z: 0 },
  root: { rotation: { y: 0.6 } },
  statuses: STATUSES.slice(0, 6).map((s, i) => ({
    id: s.id,
    remaining: 4 + i * 3,
    duration: 12 + i * 2,
    stacks: i === 2 ? 3 : 1,
  })),
};

events.emit('scene:change', { from: 'town', to: 'dungeon' });
events.emit('depth:changed', { depth: 7, level: 2, of: 4, place: 'The Drowned Crypt' });

/** Named states the photographer asks for. */
const scenarios: Record<string, () => void> = {
  hud() {
    events.emit('boss:engaged', { name: 'Morvath', title: 'The Hollow King', maxLife: 12000 });
    events.emit('boss:damaged', { life: 7400, maxLife: 12000 });
    events.emit('boss:phase', { name: 'Morvath', index: 0, bark: 'You walk on the bones of better men.' });
    events.emit('quest:progress', { index: 0, progress: 14, target: 25, desc: 'Slay the drowned' });
    events.emit('quest:progress', { index: 1, progress: 0, target: 1, desc: 'Find the reliquary' });
    events.emit('toast', { text: 'Gilded Warplate', kind: 'epic', rarity: 'unique' });
    events.emit('toast', { text: 'Rune of Ash', kind: 'epic', rarity: 'rare' });
    events.emit('toast', { text: 'Inventory is nearly full', kind: 'bad' });
    events.emit('toast', { text: '[E] Open the reliquary' });
  },
  modal() {
    modal({
      title: 'Salvage Item',
      icon: 'warn',
      tone: 'danger',
      body: 'Break <b>Gilded Warplate</b> down into materials? This cannot be undone.',
      confirmLabel: 'Salvage',
    });
  },
  menu() {
    contextMenu(900, 400, [
      { label: 'Equip', icon: 'check', hint: 'RMB' },
      { label: 'Move to stash', icon: 'bag' },
      { label: 'Salvage', icon: 'warn', danger: true },
    ], 'Gilded Warplate');
  },
  levelup() {
    events.emit('player:levelUp', { level: 29, statPoints: 5, skillPoints: 1 });
  },
  tooltip() {
    events.emit('ui:open', { panel: 'inventory' });
    setTimeout(() => {
      const slots = [...document.querySelectorAll<HTMLElement>('.inv-grid .islot:not(.is-empty), .itemgrid .islot:not(.is-empty)')];
      const pick = slots.find((s) => s.dataset.rarity === 'rare' || s.dataset.rarity === 'unique') ?? slots[0];
      if (pick) {
        const r = pick.getBoundingClientRect();
        pick.dispatchEvent(new PointerEvent('pointerenter', { clientX: r.left + 5, clientY: r.top + 5 }));
      }
    }, 300);
  },
};

const want = new URLSearchParams(location.search).get('s') ?? 'hud';
setTimeout(() => {
  for (const part of want.split('+')) {
    if (scenarios[part]) scenarios[part]!();
    else events.emit('ui:open', { panel: part });
  }
  (window as unknown as Record<string, unknown>).LAB_READY = true;
}, 200);

(window as unknown as Record<string, unknown>).LAB = { events, save, runtime, hoverHooks, hud: hudInstance(), scene };
