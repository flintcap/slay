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
import type { CharClassId, DamageType } from '../src/types';
import * as THREE from 'three';
import { CombatTextLayer } from '../src/ui/CombatText';
import { GroundLabelLayer } from '../src/ui/GroundLabels';
import { NameplateLayer, type PlateTarget } from '../src/ui/Nameplates';
import { previewLevel } from '../src/world/DungeonGen';

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
  // A mix of blessings and afflictions, so both chip styles are on screen.
  statuses: [
    ...STATUSES.filter((s) => s.polarity > 0).slice(0, 4),
    ...STATUSES.filter((s) => s.polarity < 0).slice(0, 3),
  ].map((s, i) => ({
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
  /** A staged fight: a pack ahead of the hero taking hits, the hero taking some. */
  combat() {
    const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
    cam.position.set(0, 14, 12);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const layer = new CombatTextLayer();
    const hero = { x: 0, z: 2 };
    let last = performance.now();
    const loop = (now: number): void => {
      layer.update(Math.min(0.1, (now - last) / 1000), cam, hero);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const types: DamageType[] = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane'];
    let n = 0;
    setInterval(() => {
      n++;
      const t = types[n % types.length]!;
      const target = n % 4;
      events.emit('enemy:damaged', {
        id: `e${target}`,
        amount: 40 + ((n * 37) % 90),
        type: t,
        crit: n % 7 === 0,
        x: -4 + target * 2.6,
        y: 1.4,
        z: -3 + (target % 2),
      });
      if (n % 9 === 0) events.emit('player:damaged', { amount: 23 + (n % 20), type: 'fire', life: 80, maxLife: 200 });
      if (n % 11 === 0) events.emit('player:healed', { amount: 41 });
      if (n % 13 === 0) events.emit('player:evaded', { ability: 'x', source: 'y' });
    }, 70);
    setTimeout(() => events.emit('enemy:damaged', { id: 'boss', amount: 18450, type: 'fire', crit: true, x: 0, y: 2, z: -6 }), 900);
  },
  levelup() {
    events.emit('player:levelUp', { level: 29, statPoints: 5, skillPoints: 1 });
  },
  tooltip() {
    hoverFirst(['rare', 'unique']);
  },
  /** Rolls until a unique and a set piece exist, then hovers one. */
  ttunique() {
    rollUntil(['unique', 'mythic', 'ancient']);
    hoverFirst(['unique', 'mythic', 'ancient']);
  },
  ttset() {
    rollUntil(['set']);
    hoverFirst(['set']);
  },
  ttgem() {
    hoverFirst(['normal', 'magic'], (s) => /gem|rune/i.test(s.title + (s.dataset.base ?? '')));
  },
};

function rollUntil(rarities: string[]): void {
  const ch = save.account.current!;
  for (let i = 0; i < 3000; i++) {
    const it = rollItem(ch.level + 10, rng, { magicFind: 6000 });
    if (rarities.includes(it.rarity)) {
      ch.inventory.unshift(it);
      ch.inventory.length = Math.max(ch.inventory.length - 1, 0);
      ch.inventory[0] = it;
      return;
    }
  }
}

function hoverFirst(rarities: string[], extra?: (s: HTMLElement) => boolean): void {
  events.emit('ui:open', { panel: 'inventory' });
  setTimeout(() => {
    {
      const slots = [...document.querySelectorAll<HTMLElement>('.itemgrid .islot:not(.is-empty)')];
      const pick = slots.find((s) => rarities.includes(s.dataset.rarity ?? '') && (!extra || extra(s))) ?? slots[0];
      if (pick) {
        const r = pick.getBoundingClientRect();
        pick.dispatchEvent(new PointerEvent('pointerenter', { clientX: r.left + 5, clientY: r.top + 5 }));
      }
    }
  }, 300);
}

const scenarios2: Record<string, () => void> = {
  /** The blacksmith with a rare weapon on the anvil. */
  smith() {
    events.emit('ui:open', { panel: 'blacksmith' });
    setTimeout(() => {
      const slots = [...document.querySelectorAll<HTMLElement>('.itemgrid .islot:not(.is-empty)')];
      const pick = slots.find((x) => x.dataset.rarity === 'rare') ?? slots[3];
      pick?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, 300);
  },
  /** The full map over a real generated floor, most of it explored. */
  mapfull() {
    const level = previewLevel('crypt', 'crypt', 4242, 7);
    runtime.level = level;
    runtime.depth = 7;
    const seen = new Uint8Array(level.width * level.height);
    for (let i = 0; i < seen.length; i++) seen[i] = (i % level.width) < level.width * 0.7 ? 1 : 0;
    runtime.explored.set(level.seed, seen);
    const room = level.rooms?.[1] ?? level.rooms?.[0];
    if (room) {
      runtime.playerTileX = Math.round(room.x + room.w / 2);
      runtime.playerTileY = Math.round(room.y + room.h / 2);
    }
    events.emit('ui:open', { panel: 'map' });
  },
  /** A pack's nameplates: trash, champion, elite, a named rare, a wounded one. */
  plates() {
    const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
    cam.position.set(0, 14, 12);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const layer = new NameplateLayer();
    const mk = (x: number, z: number, d: Partial<PlateTarget['nameplate']> & { rank: PlateTarget['nameplate']['rank'] }): PlateTarget => {
      const root = new THREE.Object3D();
      root.position.set(x, 0, z);
      const plate = { name: 'Drowned Thrall', affixes: [], life: 100, maxLife: 100, color: 0xc0261c, level: 31, ...d };
      return { root, life: plate.life, nameplate: plate };
    };
    const targets: PlateTarget[] = [
      mk(-8, 0, { rank: 'normal' }),
      mk(-4, -2, { rank: 'normal', life: 38 }),
      mk(0, -3, { rank: 'champion', name: 'Bloated Ghoul', affixes: ['Fire Enchanted', 'Hasted'], affixBehaviors: ['fire_enchanted', 'hasted_pack'], affixColors: [0xff5a1a, 0xd0d0ff], color: 0x6f8cff, life: 70 }),
      mk(5, -1, { rank: 'elite', name: 'Grave Knight', affixes: ['Bulwark', 'Lancer', 'Hexing'], affixBehaviors: ['bulwark', 'lancer', 'hexing'], affixColors: [0x7fb2ff, 0xffc040, 0x6c3fa0], color: 0xf5d76e }),
      mk(2, 4, { rank: 'rare', name: 'Mother Silt', title: 'Who Drinks the Lamps', affixes: ['Desecrator', 'Fire Chains', 'Splitting', 'Adaptive'], affixBehaviors: ['desecrator', 'fire_chains', 'splitter', 'adaptive'], affixColors: [0x9b2fd0, 0xff5a1a, 0x86d16a, 0xd0d0ff], color: 0xf5d76e, life: 55 }),
    ];
    const focus = new THREE.Vector3(0, 0, 2);
    const loop = (): void => {
      layer.update(cam, targets, focus, innerWidth, innerHeight);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  /** Ground loot: one of each rarity spread out, plus a pile that must declutter. */
  loot() {
    const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
    cam.position.set(0, 14, 12);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const layer = new GroundLabelLayer();
    const want = ['normal', 'magic', 'rare', 'set', 'unique', 'mythic', 'ancient'];
    const got = new Map<string, ReturnType<typeof rollItem>>();
    const extra: Array<ReturnType<typeof rollItem>> = [];
    for (let i = 0; i < 6000 && got.size < want.length; i++) {
      const it = rollItem(40, rng, { magicFind: 4000 });
      if (!got.has(it.rarity)) got.set(it.rarity, it);
      else if (extra.length < 5 && it.rarity !== 'normal') extra.push(it);
    }
    const entries: Array<{ item: ReturnType<typeof rollItem>; root: THREE.Object3D; pos: THREE.Vector3 }> = [];
    want.forEach((r, i) => {
      const item = got.get(r);
      if (item) entries.push({ item, root: new THREE.Object3D(), pos: new THREE.Vector3(-9 + i * 3, 0, -2 + (i % 2) * 3) });
    });
    // A pile on one spot: these have to stack, not overlap.
    extra.forEach((item, i) => entries.push({ item, root: new THREE.Object3D(), pos: new THREE.Vector3(1.5 + i * 0.15, 0, 4.5) }));
    const focus = new THREE.Vector3(0, 0, 2);
    const loop = (): void => {
      layer.update(cam, entries, focus, innerWidth, innerHeight, false);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  /** Boss bar mid-fight: enraged, winding up a slam, with buffs and debuffs up. */
  bosscast() {
    scenarios.hud!();
    setTimeout(() => {
      events.emit('boss:enraged', { name: 'Morvath' });
      events.emit('boss:cast', { name: 'Morvath', ability: 'Grave Slam', windup: 6 });
    }, 300);
  },
  /** A mini-boss walks in. */
  miniboss() {
    events.emit('miniboss:engaged', { id: 'mb1', name: 'Gorrak the Unbowed', title: 'Shatters the floor when struck', kind: 'quaker' });
  },
  /** The skill tree with the hover card up on a learned node and a locked one. */
  skillhover() {
    events.emit('ui:open', { panel: 'skills' });
    setTimeout(() => {
      const q = new URLSearchParams(location.search).get('node');
      const nodes = [...document.querySelectorAll<HTMLElement>('.sknode')];
      const pick = (q ? nodes.find((n) => n.dataset.skill === q) : null) ?? nodes[Number(q ?? 1)] ?? nodes[1];
      pick?.dispatchEvent(new PointerEvent('pointerenter'));
    }, 300);
  },
  /** Lifts a piece of armour out of the pack and holds it over its paperdoll slot. */
  drag() {
    events.emit('ui:open', { panel: 'inventory' });
    setTimeout(() => {
      const slots = [...document.querySelectorAll<HTMLElement>('.itemgrid .islot:not(.is-empty)')];
      const src = slots.find((s) => s.dataset.rarity === 'rare') ?? slots[2]!;
      const r = src.getBoundingClientRect();
      const x0 = r.left + 20;
      const y0 = r.top + 20;
      src.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, clientY: y0, button: 0, bubbles: true }));
      src.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + 12, clientY: y0 + 4, bubbles: true }));
      const target = [...document.querySelectorAll<HTMLElement>('.pd-slot.drop-ok')][0];
      const t = target?.getBoundingClientRect();
      const tx = t ? t.left + t.width / 2 : x0 - 200;
      const ty = t ? t.top + t.height / 2 : y0;
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: tx - 30, clientY: ty, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: tx, clientY: ty, bubbles: true }));
    }, 400);
  },
  /** An equip and a pickup, a moment after the panel opens, to see the flashes. */
  arrive() {
    events.emit('ui:open', { panel: 'inventory' });
    setTimeout(() => {
      const ch = save.account.current!;
      const it = rollItem(ch.level, rng, { magicFind: 3000 });
      const free = ch.inventory.findIndex((x) => !x);
      if (free >= 0) ch.inventory[free] = it;
      events.emit('ui:refresh', {});
    }, 900);
  },
};

const want = new URLSearchParams(location.search).get('s') ?? 'hud';
setTimeout(() => {
  for (const part of want.split('+')) {
    const all = { ...scenarios, ...scenarios2 };
    if (all[part]) all[part]!();
    else events.emit('ui:open', { panel: part });
  }
  (window as unknown as Record<string, unknown>).LAB_READY = true;
}, 200);

// Frame-rate probe: headless Chromium can tick slowly, which matters for
// anything eased per frame.
let frames = 0;
const countFrames = (): void => {
  frames++;
  requestAnimationFrame(countFrames);
};
requestAnimationFrame(countFrames);
(window as unknown as Record<string, unknown>).labFrames = () => frames;

(window as unknown as Record<string, unknown>).LAB = { events, save, runtime, hoverHooks, hud: hudInstance(), scene };
