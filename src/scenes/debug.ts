import * as THREE from 'three';
import type { CharClassId, ItemRarity } from '../types';
import type { Engine } from '../core/Engine';
import { save } from '../core/Save';
import { events } from '../core/Events';
import { Random, randomSeed } from '../core/RNG';
import { createCharacter, grantXp, allocateSkill, allocateStat, equipItem } from '../sim/Character';
import { rollItem, newItem, getBase } from '../sim/Loot';
import { buildDropModel } from '../art/ItemModels';
import { itemIconUri, requestItemIcon, clearIconCaches } from '../art/Icons';
import { addItemToInventory } from '../sim/Inventory';
import { SKILLS } from '../data/skills';
import { CLASSES } from '../data/classes';
import { DungeonScene } from './DungeonScene';
import { panelInstance } from '../ui/UIRoot';
import { insertGem } from '../sim/Crafting';

/**
 * Debug surface exposed as `window.SLAY.debug`. The Playwright screenshot
 * harness drives the game through these, and they're handy for manual testing.
 * Not reachable from normal play.
 */
export function installDebug(engine: Engine): Record<string, unknown> {
  return {
    /** Create a fully playable character at `level`, geared and skilled up. */
    makeCharacter(classId: CharClassId = 'warden', level = 1): void {
      const rng = new Random(randomSeed());
      const def = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      const c = createCharacter(`Test ${def.name}`, def.id, rng);

      for (let i = 1; i < level; i++) {
        // Grant enough XP to guarantee a level rather than guessing the curve.
        for (let k = 0; k < 40 && c.level === i; k++) grantXp(c, 500 * i * i + 1000);
      }

      // Spend points so the character can actually fight.
      const classSkills = SKILLS.filter((s) => def.trees.includes(s.treeId));
      let guard = 0;
      while (c.skillPoints > 0 && guard++ < 400) {
        const pick = classSkills[guard % classSkills.length];
        if (!pick) break;
        if (!allocateSkill(c, pick.id)) continue;
      }
      guard = 0;
      while (c.statPoints > 0 && guard++ < 1000) {
        const order = ['vitality', 'strength', 'dexterity', 'energy'] as const;
        if (!allocateStat(c, order[guard % 4]!)) break;
      }

      // Bind whatever actives ended up ranked into the hotbar.
      const actives = classSkills.filter(
        (s) => s.targeting !== 'passive' && (c.skills[s.id] ?? 0) > 0
      );
      for (let i = 0; i < 6; i++) c.hotbar[i] = actives[i]?.id ?? null;

      // Gear appropriate to the level.
      for (let i = 0; i < 10; i++) {
        const item = rollItem(Math.max(1, level), rng, { magicFind: 400, classId: def.id });
        const res = equipItem(c, item);
        if (!res.ok) addItemToInventory(c, item);
      }

      c.gold += 25000;
      save.setCharacter(c);
    },

    /** Fill the backpack with rolled loot so the inventory screenshot has content. */
    fillInventory(): void {
      const c = save.account.current;
      if (!c) return;
      const rng = new Random(randomSeed());
      for (let i = 0; i < 40; i++) {
        addItemToInventory(c, rollItem(Math.max(1, c.level + 5), rng, { magicFind: 900 }));
      }
      // And stock the stash so the bank screenshot isn't empty either.
      for (let i = 0; i < 30; i++) {
        save.stashItem(rollItem(Math.max(1, c.level + 10), rng, { magicFind: 900 }));
      }
      save.touch();
    },

    warpToBoss(): void {
      const s = engine.currentScene;
      if (s instanceof DungeonScene) s.debugWarpToBoss();
    },

    godMode(on = true): void {
      const s = engine.currentScene;
      if (s instanceof DungeonScene) s.debugGodMode(on);
    },

    /** Opens the art studio. kind: items | monsters | classes | rarity. */
    showcase(kind = 'items', page = 0): void {
      void engine.goTo('boot', { kind, page });
    },

    /**
     * Equips a specific base by id, rolled at `ilvl`. The screenshot tools need
     * this: `makeCharacter` rolls random gear, so "render an archer shooting"
     * kept producing an archer with no bow swinging their fists.
     */
    equip(baseId: string, ilvl = 10, rarity: ItemRarity = 'rare'): string | null {
      const c = save.account.current;
      if (!c) return null;
      const base = getBase(baseId);
      if (!base) return null;
      const item = newItem(base, ilvl, rarity, new Random(randomSeed()));
      const res = equipItem(c, item);
      if (!res.ok) {
        addItemToInventory(c, item);
        return null;
      }
      save.touch();
      events.emit('ui:refresh', {});
      return item.uid;
    },

    /** Fires the primary attack once, through the real input path. */
    attack(dx = 1, dz = 0): void {
      const s = engine.currentScene as unknown as { player?: { position: { x: number; z: number } } };
      const p = s?.player;
      if (!p) return;
      engine.input.pointerOverUI = false;
      engine.input.worldPoint.set(p.position.x + dx * 9, 0, p.position.z + dz * 9);
      engine.input.mouseRight = true;
    },

    stopAttack(): void {
      engine.input.mouseRight = false;
    },

    /**
     * Every mesh currently hanging off the player's skeleton, with the equip
     * slot it came from. This is how you find the stray panel on someone's back
     * without guessing from source.
     */
    wornParts(): Array<{ name: string; slot: string; bone: string; pos: [number, number, number] }> {
      const s = engine.currentScene as unknown as { player?: { root?: THREE.Object3D } };
      const root = s?.player?.root;
      if (!root) return [];
      const out: Array<{ name: string; slot: string; bone: string; pos: [number, number, number] }> = [];
      const world = new THREE.Vector3();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        // Walk up for the nearest socket marker and the bone it hangs from.
        let slot = '';
        let bone = '';
        for (let p: THREE.Object3D | null = o; p; p = p.parent) {
          if (!slot && typeof p.userData.socketSlot === 'string') slot = p.userData.socketSlot;
          if (!bone && (p as THREE.Bone).isBone) bone = p.name;
        }
        o.getWorldPosition(world);
        out.push({
          name: m.name || (m.material as THREE.Material)?.name || '(unnamed)',
          slot: slot || (typeof m.userData.coverSlot === 'string' ? `cover:${m.userData.coverSlot}` : 'body'),
          bone,
          pos: [+world.x.toFixed(3), +world.y.toFixed(3), +world.z.toFixed(3)],
        });
      });
      return out;
    },

    /**
     * Times the work a single drop costs, split by stage.
     *
     * A dropped item is not one operation: it builds a full 3D model, an icon,
     * a nameplate and a set of ground effects, and any one of them can be the
     * frame that stalls. Guessing which has been wrong twice, so this measures
     * each one separately, per rarity, warm and cold.
     */
    dropCost(samples = 12): Record<string, unknown> {
      const rng = new Random(0xd0b1e);
      const out: Record<string, unknown> = {};
      const time = (fn: () => void): number => {
        const t0 = performance.now();
        fn();
        return performance.now() - t0;
      };
      const rarities: ItemRarity[] = ['normal', 'magic', 'rare', 'unique', 'mythic'];
      for (const rarity of rarities) {
        const base = getBase('chest.leather');
        if (!base) continue;
        const items = Array.from({ length: samples }, () => newItem(base, 30, rarity, rng));
        // Cold: the very first of each rarity pays for whatever it caches.
        const cold = {
          model: time(() => void buildDropModel(items[0]!, rng)),
          icon: time(() => void itemIconUri(items[0]!)),
        };
        let model = 0;
        let icon = 0;
        for (let i = 1; i < items.length; i++) {
          model += time(() => void buildDropModel(items[i]!, rng));
          icon += time(() => void itemIconUri(items[i]!));
        }
        const n = Math.max(1, items.length - 1);
        out[rarity] = {
          coldModelMs: +cold.model.toFixed(2),
          coldIconMs: +cold.icon.toFixed(2),
          warmModelMs: +(model / n).toFixed(2),
          warmIconMs: +(icon / n).toFixed(2),
        };
      }
      return out;
    },

    /**
     * How long the inventory blocks for on a cold open.
     *
     * Fills a pack, clears the icon cache so nothing is warm, then times the
     * synchronous cost of rendering every slot. That number is what the player
     * feels as "the inventory takes a moment"; anything drawn after it lands in
     * later frames and does not hold the window.
     */
    inventoryOpenCost(count = 60): Record<string, number> {
      const c = save.account.current;
      if (!c) return {};
      const rng = new Random(0x1cea1);
      for (let i = 0; i < count; i++) {
        addItemToInventory(c, rollItem(30, rng, { magicFind: 900 }));
      }
      const held = c.inventory.filter((it): it is NonNullable<typeof it> => !!it).slice(0, count);

      clearIconCaches();
      const t0 = performance.now();
      const deferred = held.map((it) => requestItemIcon(it, () => {}));
      const blocking = performance.now() - t0;

      clearIconCaches();
      const t1 = performance.now();
      for (const it of held) itemIconUri(it);
      const eager = performance.now() - t1;

      return {
        items: held.length,
        blockingMs: +blocking.toFixed(1),
        eagerMs: +eager.toFixed(1),
        alreadyDrawn: deferred.filter((u) => !u.startsWith('data:image/gif')).length,
      };
    },

    /**
     * Drives the inventory's own drop handler with a gem over a socketed item,
     * which is the exact path a player's drag takes. Returns what changed.
     */
    socketByDrag(): Record<string, unknown> {
      const c = save.account.current;
      if (!c) return { error: 'no character' };
      const rng = new Random(0x50c);

      // A host with sockets, and a gem to put in it. The base has to be high
      // enough level for the gem — `insertGem` refuses a stone more than 25
      // levels above the base, which is a real rule and not a bug.
      const host = newItem(getBase('chest.gothic') ?? getBase('chest.plate')!, 60, 'rare', rng);
      host.sockets = [{ gemId: null }, { gemId: null }];
      const gem = newItem(getBase('gem.ruby.chipped')!, 40, 'normal', rng);
      addItemToInventory(c, host);
      addItemToInventory(c, gem);
      const hostAt = c.inventory.findIndex((it) => it?.uid === host.uid);
      const gemAt = c.inventory.findIndex((it) => it?.uid === gem.uid);

      const panel = panelInstance('inventory') as
        | { dropIntoInventory?: (p: unknown, i: number) => boolean }
        | undefined;
      if (!panel?.dropIntoInventory) return { error: 'inventory panel not reachable' };

      const handled = panel.dropIntoInventory(
        { kind: 'inventory', item: gem, index: gemAt },
        hostAt,
      );

      // Also try the sim call straight, so a refusal reports why rather than
      // just showing an empty socket.
      const spare = newItem(getBase('gem.ruby.chipped')!, 40, 'normal', rng);
      const direct = insertGem(host, spare.baseId, 1);

      return {
        handled,
        gemId: gem.baseId,
        hostBase: host.baseId,
        socketsAfter: host.sockets.map((s) => s.gemId),
        gemStillInPack: c.inventory.some((it) => it?.uid === gem.uid),
        hostStillAtIndex: c.inventory[hostAt]?.uid === host.uid,
        directOk: direct.ok,
        directReason: direct.reason ?? null,
      };
    },

    /** Slowest frames seen since the last call, in milliseconds. */
    frameSpikes(): number[] {
      const perf = (engine as unknown as { perf?: { frames?: number[] } }).perf;
      const frames = perf?.frames ?? [];
      return frames
        .slice()
        .sort((a, b) => b - a)
        .slice(0, 8)
        .map((n) => +n.toFixed(1));
    },

    setDepth(n: number): void {
      const c = save.account.current;
      if (c) {
        c.depthRecord = Math.max(0, n - 1);
        save.touch();
      }
    },
  };
}
