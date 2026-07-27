import type { CharClassId } from '../types';
import type { Engine } from '../core/Engine';
import { save } from '../core/Save';
import { Random, randomSeed } from '../core/RNG';
import { createCharacter, grantXp, allocateSkill, allocateStat, equipItem } from '../sim/Character';
import { rollItem } from '../sim/Loot';
import { addItemToInventory } from '../sim/Inventory';
import { SKILLS } from '../data/skills';
import { CLASSES } from '../data/classes';
import { DungeonScene } from './DungeonScene';

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

    setDepth(n: number): void {
      const c = save.account.current;
      if (c) {
        c.depthRecord = Math.max(0, n - 1);
        save.touch();
      }
    },
  };
}
