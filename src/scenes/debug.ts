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
import { runtime } from '../ui/Widgets';
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

    /**
     * Faces the player four ways and reports where the minimap arrow points.
     *
     * `heading` is the world direction the character is facing, as (x, z).
     * `arrow` is where the arrow tip lands on the canvas after its rotation,
     * as (x, y) with y growing downwards. Both maps put +Z down the canvas, so
     * for a correct arrow the two must agree: arrow.x matches heading.x and
     * arrow.y matches heading.z.
     */
    arrowCheck(): Array<Record<string, string>> {
      const s = engine.currentScene as unknown as { player?: { root: THREE.Object3D } };
      const pl = s?.player;
      if (!pl) return [];
      const out: Array<Record<string, string>> = [];
      const dirs: Array<[string, number, number]> = [
        ['north (-Z)', 0, -1],
        ['south (+Z)', 0, 1],
        ['east (+X)', 1, 0],
        ['west (-X)', -1, 0],
      ];
      const r2 = (n: number): string => (Math.abs(n) < 1e-6 ? '0' : n.toFixed(2));
      for (const [name, dx, dz] of dirs) {
        // Same convention as Player.faceTowards.
        const yaw = Math.atan2(dx, dz);
        pl.root.rotation.y = yaw;
        const facing = Math.PI - yaw;
        out.push({
          facing: name,
          heading: `(${r2(Math.sin(yaw))}, ${r2(Math.cos(yaw))})`,
          arrow: `(${r2(Math.sin(facing))}, ${r2(-Math.cos(facing))})`,
        });
      }
      return out;
    },

    /** How much of the current floor the shared exploration record has seen. */
    exploredCount(): Record<string, number> {
      const level = (engine.currentScene as unknown as { level?: { seed: number; width: number; height: number } })
        ?.level;
      if (!level) return {};
      const e = runtime.explored.get(level.seed);
      let seen = 0;
      if (e) for (const v of e) if (v) seen++;
      return { seen, tiles: level.width * level.height, records: runtime.explored.size };
    },

    /**
     * Walks up to the nearest monster and swings at it, reporting every stage.
     *
     * A basic attack has a lot of places to fail silently — no weapon, the wrong
     * weapon style, a zero damage roll, a target outside the arc, an early
     * return from being mid-animation — and from the outside they all look the
     * same. This names which one.
     */
    attackProbe(): Record<string, unknown> {
      const scene = engine.currentScene as unknown as {
        player?: Record<string, unknown>;
        enemies?: Array<Record<string, unknown>>;
        skills?: Record<string, unknown>;
        combatCtx?: unknown;
      };
      const pl = scene?.player;
      const enemies = scene?.enemies ?? [];
      if (!pl) return { error: 'no player' };

      const c = save.account.current;
      const main = c?.equipment.mainHand ?? null;
      const stats = pl.stats as Record<string, number> | undefined;

      // Park a live monster right in front of the player and aim at it.
      const alive = enemies.filter((e) => (e.life as number) > 0);
      const victim = alive[0];
      const pos = pl.position as THREE.Vector3;
      const before = victim ? (victim.life as number) : null;
      if (victim) {
        (victim.root as THREE.Object3D).position.set(pos.x + 1.4, 0, pos.z);
      }

      const input = engine.input;
      input.pointerOverUI = false;
      input.worldPoint.set(pos.x + 1.4, 0, pos.z);
      input.mouseRight = true;

      return {
        mainHand: main?.baseId ?? null,
        mainHandCategory: main ? (getBase(main.baseId)?.category ?? null) : null,
        primaryAttack: c?.primaryAttack ?? null,
        minDamage: stats?.minDamage ?? null,
        maxDamage: stats?.maxDamage ?? null,
        attackSpeed: stats?.attackSpeed ?? null,
        playerBusy: pl.isBusy ?? null,
        playerAlive: pl.alive ?? null,
        enemiesAlive: alive.length,
        victimLifeBefore: before,
        note: 'mouseRight left held — read victimLifeAfter next frame',
      };
    },

    /**
     * Aims the attack button at whichever monster is nearest, right now.
     *
     * Call it every frame while holding the button. Monsters move, so a test
     * that parks one somewhere and swings at that spot measures the AI walking
     * away rather than whether the attack works.
     */
    aimAtNearest(): boolean {
      const scene = engine.currentScene as unknown as {
        player?: { position: THREE.Vector3 };
        enemies?: Array<Record<string, unknown>>;
      };
      const pl = scene?.player;
      if (!pl) return false;
      let best: THREE.Vector3 | null = null;
      let bestD = Infinity;
      for (const e of scene?.enemies ?? []) {
        if ((e.life as number) <= 0) continue;
        const p = (e.root as THREE.Object3D).position;
        const d = p.distanceTo(pl.position);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!best) return false;
      engine.input.pointerOverUI = false;
      engine.input.worldPoint.set(best.x, 0, best.z);
      engine.input.mouseRight = true;
      return true;
    },

    releaseAttack(): void {
      engine.input.mouseRight = false;
    },

    /**
     * Isolates where a basic attack loses its damage.
     *
     * Phase A calls the swing directly with the player standing next to a
     * monster, bypassing input entirely. Phase B does the same through the real
     * right-click path. If A lands and B does not, the fault is in aiming or
     * input; if neither lands, it is the swing itself.
     */
    async swingProbe(swings = 8): Promise<Record<string, unknown>> {
      const scene = engine.currentScene as unknown as {
        player?: Record<string, unknown>;
        enemies?: Array<Record<string, unknown>>;
        skills?: {
          basicAttack: (p: unknown, t: THREE.Vector3, c: unknown, e: unknown, b: unknown) => boolean;
        };
        context?: () => unknown;
      };
      const pl = scene?.player;
      const skills = scene?.skills;
      if (!pl || !skills) return { error: 'no player or skill runner' };

      const nearest = (): Record<string, unknown> | null => {
        let best: Record<string, unknown> | null = null;
        let bestD = Infinity;
        for (const e of scene?.enemies ?? []) {
          if ((e.life as number) <= 0) continue;
          const d = (e.root as THREE.Object3D).position.distanceTo(pl.position as THREE.Vector3);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        return best;
      };

      let direct = 0;
      let viaInput = 0;
      let phase: 'direct' | 'input' = 'direct';
      const off = events.on('enemy:damaged', () => {
        if (phase === 'direct') direct++;
        else viaInput++;
      });

      const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
      const glueToTarget = (): THREE.Vector3 | null => {
        const t = nearest();
        if (!t) return null;
        const tp = (t.root as THREE.Object3D).position;
        // Stand a metre and a half away — inside any melee reach.
        (pl.position as THREE.Vector3).set(tp.x - 1.5, 0, tp.z);
        return tp;
      };

      // Phase A — straight at the swing.
      for (let i = 0; i < swings; i++) {
        const tp = glueToTarget();
        if (!tp) break;
        (pl as unknown as { actionLock: number }).actionLock = 0;
        skills.basicAttack(pl, tp.clone().setY(0), scene.context?.(), scene.enemies, null);
        await frame();
      }

      // Phase B — through the button.
      phase = 'input';
      for (let i = 0; i < swings * 6; i++) {
        const tp = glueToTarget();
        if (!tp) break;
        engine.input.pointerOverUI = false;
        engine.input.worldPoint.set(tp.x, 0, tp.z);
        engine.input.mouseRight = true;
        await frame();
      }
      engine.input.mouseRight = false;
      off();

      return { swings, directHits: direct, inputHits: viaInput };
    },

    /**
     * Casts one named skill at the nearest monster and reports what happened.
     *
     * `cast` returning true only means it fired, not that it hit anything, and
     * those two failures need telling apart: false means mana, cooldown or a
     * weapon rule refused it; true with no damage means the skill's own aim or
     * hit test is wrong.
     */
    async castProbe(skillId: string, tries = 6): Promise<Record<string, unknown>> {
      const scene = engine.currentScene as unknown as {
        player?: Record<string, unknown>;
        enemies?: Array<Record<string, unknown>>;
        skills?: { cast: (id: string, p: unknown, t: THREE.Vector3, c: unknown, e: unknown, b: unknown) => boolean };
        context?: () => unknown;
      };
      const pl = scene?.player;
      const skills = scene?.skills;
      if (!pl || !skills) return { error: 'no player or skill runner' };

      let hits = 0;
      const off = events.on('enemy:damaged', () => hits++);
      const fired: boolean[] = [];
      const manaAt: number[] = [];

      for (let i = 0; i < tries; i++) {
        let best: THREE.Object3D | null = null;
        let bestD = Infinity;
        for (const e of scene.enemies ?? []) {
          if ((e.life as number) <= 0) continue;
          const r = e.root as THREE.Object3D;
          const d = r.position.distanceTo(pl.position as THREE.Vector3);
          if (d < bestD) {
            bestD = d;
            best = r;
          }
        }
        if (!best) break;
        // Stand a clear three metres back, in the open, facing it.
        (pl.position as THREE.Vector3).set(best.position.x - 3, 0, best.position.z);
        (pl as unknown as { actionLock: number }).actionLock = 0;
        (pl as unknown as { cooldowns: Map<string, number> }).cooldowns?.clear();
        manaAt.push(Math.round(pl.mana as number));
        fired.push(
          skills.cast(skillId, pl, best.position.clone().setY(0), scene.context?.(), scene.enemies, null)
        );
        for (let f = 0; f < 6; f++) await new Promise((r) => requestAnimationFrame(r));
      }
      off();
      const stats = pl.stats as Record<string, number> | undefined;
      return { skillId, tries, fired, manaAt, maxMana: Math.round(stats?.mana ?? 0), hits };
    },

    /**
     * Fires every active skill a class has and records what actually happened.
     *
     * Each skill gets identical, controlled conditions — the player stood in an
     * open spot, full mana, no cooldown, no action lock, and a live monster
     * pinned three metres in front so the AI cannot walk out of the test. Then
     * it reports, per skill: whether the cast was accepted, which animation clip
     * played, how many visual effects it created, how much damage landed, and
     * any error it threw.
     *
     * Nothing here is inferred. A skill that reports `fired` but no damage and
     * no effects did nothing, whatever its description says.
     */
    async skillAudit(classId: CharClassId): Promise<Array<Record<string, unknown>>> {
      const scene = engine.currentScene as unknown as {
        player?: Record<string, unknown>;
        enemies?: Array<Record<string, unknown>>;
        skills?: { cast: (id: string, p: unknown, t: THREE.Vector3, c: unknown, e: unknown, b: unknown) => boolean };
        effects?: { live?: unknown[] };
        fx?: { burst?: (...a: unknown[]) => void };
        context?: () => unknown;
        nav?: { walkable?: (x: number, z: number) => boolean };
        mesh?: { tileToWorld: (x: number, y: number) => THREE.Vector3 };
        level?: { entry: { x: number; y: number } };
      };
      const pl = scene?.player;
      const skills = scene?.skills;
      const c = save.account.current;
      if (!pl || !skills || !c) return [{ error: 'no player, runner or character' }];

      const def = CLASSES.find((k) => k.id === classId);
      if (!def) return [{ error: `unknown class ${classId}` }];
      const list = SKILLS.filter((s) => def.trees.includes(s.treeId) && s.targeting !== 'passive');

      // A known-open stage: the level's own entrance, which generation
      // guarantees is walkable and clear.
      const entry = scene.level?.entry;
      const stage =
        entry && scene.mesh
          ? scene.mesh.tileToWorld(entry.x, entry.y).clone().setY(0)
          : (pl.position as THREE.Vector3).clone();

      const live = (): number => scene.effects?.live?.length ?? 0;
      const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

      const rows: Array<Record<string, unknown>> = [];

      for (const s of list) {
        // Reset the world around this one skill.
        c.skills[s.id] = 3;
        (pl.position as THREE.Vector3).copy(stage);
        (pl as unknown as { actionLock: number }).actionLock = 0;
        (pl as unknown as { cooldowns: Map<string, number> }).cooldowns.clear();
        const stats = pl.stats as Record<string, number>;
        pl.mana = stats.mana;
        pl.life = stats.life;

        // Pin a live monster just inside melee reach — a swing reaches 2.3m, so
        // a dummy any further away makes every melee skill look broken when it
        // is only out of range. Projectiles cross 1.6m just as happily.
        const dummy = (scene.enemies ?? []).find((e) => (e.life as number) > 0);
        const spot = new THREE.Vector3(stage.x + 1.6, 0, stage.z);
        if (dummy) (dummy.root as THREE.Object3D).position.copy(spot);

        let damage = 0;
        let hits = 0;
        let sfx = 0;
        // Count particle bursts by wrapping the emitter for the duration. Most
        // of a skill's visuals are bursts, not tracked effects, so counting only
        // `EffectSystem.live` makes a perfectly good spell look invisible.
        const fx = scene.fx as { burst?: (...a: unknown[]) => void } | undefined;
        const realBurst = fx?.burst;
        let bursts = 0;
        if (fx && realBurst) {
          fx.burst = (...a: unknown[]) => {
            bursts++;
            return realBurst.apply(fx, a);
          };
        }
        const offDmg = events.on('enemy:damaged', (e) => {
          hits++;
          damage += e.amount;
        });
        const offSfx = events.on('sfx', () => sfx++);

        const statusOf = (): number =>
          ((pl.status as { active?: Map<string, unknown> } | undefined)?.active?.size) ?? 0;
        const buffsBefore = statusOf();
        const before = live();
        let fired = false;
        let error: string | null = null;
        try {
          fired = skills.cast(s.id, pl, spot.clone(), scene.context?.(), scene.enemies, null);
        } catch (err) {
          error = String(err).slice(0, 160);
        }
        const clip = ((pl.animator as { clip?: string } | undefined)?.clip) ?? null;
        let peak = live();
        let buffPeak = statusOf();

        // Let travel time, wind-ups and lingering effects resolve.
        for (let f = 0; f < 30; f++) {
          if (dummy) (dummy.root as THREE.Object3D).position.copy(spot);
          peak = Math.max(peak, live());
          buffPeak = Math.max(buffPeak, statusOf());
          await frame();
        }
        offDmg();
        offSfx();
        if (fx && realBurst) fx.burst = realBurst;

        rows.push({
          id: s.id,
          name: s.name,
          tree: s.treeId,
          effect: s.effect ?? null,
          targeting: s.targeting,
          fired,
          clip,
          effects: Math.max(0, peak - before),
          bursts,
          sfx,
          buffs: Math.max(0, buffPeak - buffsBefore),
          hits,
          damage: Math.round(damage),
          error,
        });
      }
      return rows;
    },

    /** Total life across every living monster — a damage meter that ignores AI. */
    totalEnemyLife(): { alive: number; life: number } {
      const scene = engine.currentScene as unknown as { enemies?: Array<Record<string, unknown>> };
      let alive = 0;
      let life = 0;
      for (const e of scene?.enemies ?? []) {
        const l = e.life as number;
        if (l > 0) {
          alive++;
          life += l;
        }
      }
      return { alive, life: Math.round(life) };
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
