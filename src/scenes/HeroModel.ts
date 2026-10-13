import * as THREE from 'three';
import type { Character, CharClassId, EquipSlot, Item, ItemRarity } from '../types';
import { Random } from '../core/RNG';
import { buildItemModel } from '../art/ItemModels';
import { compactModel } from '../art/ModelBudget';
import { buildHero, setHeroHidden, type HeroModel as HeroBody } from '../art/hero/Hero';
import { HERO_LOOKS } from '../art/hero/Looks';
import { wearArmour, removeArmour, type WornArmour } from '../art/hero/Armour';
import { holdItem, weaponGrip } from '../art/hero/Hold';
import { dressOutfit } from '../art/items/Outfit';

export { weaponGrip };
import { HeroAnimator, type OffHand } from '../art/hero/Animator';
import { getBase } from '../sim/Loot';
import { CLASSES } from '../data/classes';
import { FIELD_KIT } from './FieldKit';

/**
 * The one place the game builds a hero: body, worn armour, held weapons and
 * the animator, for play, the paperdoll and the front-end screens alike.
 *
 * The bare class body is a body in underwear: what a character looks like is
 * decided by its equipment. That is right in play and wrong on a class select
 * screen, where the player is choosing a fantasy. So a class preview wears a
 * "field kit" that says what the class is, and a roster preview wears the
 * character's real gear, exactly as it will walk into town.
 */

/** Slots that put geometry on the body. Rings and amulets show nothing at play distance. */
export const VISUAL_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'legs', 'boots', 'belt'];

/** What a slot holds, as far as its looks go. */
export type Piece = Pick<Item, 'baseId' | 'rarity'> & Partial<Pick<Item, 'uid' | 'upgrade' | 'uniqueId' | 'setId'>>;

/** What the off hand's item does to the stance. */
function offHandKind(category: string | undefined): OffHand {
  switch (category) {
    case 'shield':
      return 'shield';
    case 'dagger':
      return 'dagger';
    case 'sword':
    case 'axe':
    case 'mace':
    case 'wand':
    case 'scepter':
      return 'weapon';
    case 'orb':
      return 'focus';
    default:
      return 'none';
  }
}

interface Held {
  key: string;
  /** Armour grown on the body, or a model in a socket. */
  worn?: WornArmour;
  model?: THREE.Object3D;
}

/** A dressed, animated hero. Add `root` to the scene (or to a mover). */
export class DressedHero {
  readonly body: HeroBody;
  readonly root: THREE.Group;
  readonly animator: HeroAnimator;
  /** Rig bones by name. */
  readonly bones: Record<string, THREE.Bone>;
  private held = new Map<EquipSlot, Held>();
  private rng: Random;
  /** Set glow and auras (`items/Outfit.ts`), and the set pieces they were made for. */
  private outfit: THREE.Object3D[] = [];
  private outfitKey = '';

  constructor(
    readonly classId: CharClassId,
    seed = 1,
  ) {
    this.rng = new Random(seed);
    this.body = buildHero(HERO_LOOKS[classId] ?? HERO_LOOKS.warden, classId);
    this.root = this.body.root;
    this.bones = this.body.rig.bones as unknown as Record<string, THREE.Bone>;
    this.animator = new HeroAnimator(this.bones);
  }

  /**
   * Wears and holds exactly `pieces`. Only slots whose item changed are
   * rebuilt, so calling this on every stat refresh costs nothing. True when
   * anything changed.
   */
  dress(pieces: Partial<Record<EquipSlot, Piece | null | undefined>>): boolean {
    let changed = false;
    // Rings and amulets show nothing, but they count toward a set's glow.
    const outfitKey = Object.entries(pieces)
      .map(([s, p]) => (p && (p.setId || p.uniqueId) ? `${s}:${p.uid ?? p.baseId}:${p.setId ?? p.uniqueId}` : ''))
      .join('|');
    for (const slot of VISUAL_SLOTS) {
      const p = pieces[slot];
      const key = p ? `${p.uid ?? ''}|${p.baseId}|${p.rarity}|${p.upgrade ?? 0}` : '';
      if ((this.held.get(slot)?.key ?? '') === key) continue;
      changed = true;
      this.clear(slot);
      if (!p) continue;
      try {
        this.held.set(slot, { key, ...this.put(slot, p) });
      } catch {
        // A missing visual must never break the run or blank a screen.
        this.held.set(slot, { key });
      }
    }
    if (changed || outfitKey !== this.outfitKey) this.relight(pieces, outfitKey);
    if (!changed) return false;
    const hides = new Set<string>();
    for (const h of this.held.values()) h.worn?.hides.forEach((k) => hides.add(k));
    setHeroHidden(this.body, hides);
    // What is held picks the stance and the chain of blows.
    const main = pieces.mainHand ? getBase(pieces.mainHand.baseId) : undefined;
    const off = pieces.offHand ? getBase(pieces.offHand.baseId) : undefined;
    this.animator.setOffHand(offHandKind(off?.category));
    this.animator.setWeapon(weaponGrip(main?.category, main?.slot === 'twoHand'), main?.category);
    return true;
  }

  /** Lights set pieces for how complete their set is and puts on set and unique auras. */
  private relight(pieces: Partial<Record<EquipSlot, Piece | null | undefined>>, key: string): void {
    this.outfitKey = key;
    for (const o of this.outfit) {
      o.removeFromParent();
      // Glow twins draw on the armour's own (cached) geometry.
      if (!o.userData.sharedGeometry) (o as THREE.Points).geometry?.dispose();
    }
    this.outfit = [];
    const worn = new Map<EquipSlot, WornArmour>();
    for (const [slot, h] of this.held) if (h.worn) worn.set(slot, h.worn);
    try {
      this.outfit = dressOutfit(this.body, pieces, worn, (id) => getBase(id)?.visual);
    } catch {
      // Glow is dressing: never let it break a hero.
    }
  }

  /** Grows armour on the body, or puts a model in the right socket. */
  private put(slot: EquipSlot, p: Piece): Omit<Held, 'key'> {
    const base = getBase(p.baseId);
    const visual = base?.visual ?? { shape: 'auto', palette: 'metal.steel' };
    const worn = wearArmour(this.body, slot, p, visual);
    if (worn) return { worn };
    const model = compactModel(buildItemModel(visual, this.rng, p.rarity, p));
    model.traverse((o) => {
      // An aura's particles cast no shadow.
      o.castShadow = !o.userData.aura;
      // So a poison coat can glow on the blade and nowhere else.
      if (slot === 'mainHand' || slot === 'offHand') o.userData.weaponPart = true;
    });
    const rig = this.body.rig;
    if (base?.category === 'quiver') {
      rig.sockets.quiver.add(model);
      return { model };
    }
    const grip = weaponGrip(base?.category, base?.slot === 'twoHand');
    // A bow is held in the left hand; the right draws.
    const hand = grip === 'bow' ? 'offHand' : slot === 'offHand' ? 'offHand' : 'mainHand';
    const node = holdItem(rig, hand, model, base?.category === 'shield' ? 'shield' : grip);
    // Tools find the weapon by the game slot it came from.
    node.parent!.userData.socketSlot = slot;
    return { model };
  }

  private clear(slot: EquipSlot): void {
    const h = this.held.get(slot);
    if (!h) return;
    this.held.delete(slot);
    if (h.worn) {
      removeArmour(h.worn);
      disposeTree(h.worn.object);
    }
    if (h.model) {
      const node = h.model.parent;
      if (node?.parent?.userData.socketSlot === slot) delete node.parent.userData.socketSlot;
      if (node && node.name.startsWith('hold:')) node.removeFromParent();
      else h.model.removeFromParent();
      disposeTree(h.model);
    }
  }

  /** The held or worn object for a slot, if any. */
  objectFor(slot: EquipSlot): THREE.Object3D | null {
    const h = this.held.get(slot);
    return h?.model ?? h?.worn?.object ?? null;
  }

  dispose(): void {
    for (const slot of [...this.held.keys()]) this.clear(slot);
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}

/**
 * Frees what a hero tree owns on the GPU. Meshed body parts are cached and
 * shared between heroes (`MeshCache.ts`) and cached materials are shared
 * between everything, so both are left alone.
 */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.cached) m.geometry.dispose();
    (o as THREE.SkinnedMesh).skeleton?.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) if (!mat.userData?.shared) mat.dispose();
  });
}

/** A hero for the front-end screens. */
export interface HeroModel {
  root: THREE.Group;
  animator: HeroAnimator;
  classId: CharClassId;
  dispose(): void;
}

function preview(classId: CharClassId, pieces: Partial<Record<EquipSlot, Piece>>, seed: number): HeroModel {
  const hero = new DressedHero(classId, seed);
  hero.dress(pieces);
  hero.animator.play('idle', { fade: 0 });
  // The screens turn and place this group; the body inside stays at its origin.
  const root = new THREE.Group();
  root.add(hero.root);
  return {
    root,
    animator: hero.animator,
    classId,
    dispose(): void {
      root.removeFromParent();
      hero.dispose();
    },
  };
}

/** Builds a class in its field kit. */
export function buildClassHero(classId: CharClassId): HeroModel {
  const pieces: Partial<Record<EquipSlot, Piece>> = {};
  for (const [slot, baseId] of Object.entries(FIELD_KIT[classId] ?? {}) as Array<[EquipSlot, string]>) {
    pieces[slot] = { baseId, rarity: 'rare' as ItemRarity };
  }
  return preview(classId, pieces, 0x5eed ^ (classId.length * 7919));
}

/** Builds a living character wearing exactly what it has equipped. */
export function buildCharacterHero(c: Character): HeroModel {
  const pieces: Partial<Record<EquipSlot, Piece>> = {};
  for (const slot of VISUAL_SLOTS) {
    const item = c.equipment[slot];
    if (item) pieces[slot] = item;
  }
  let seed = 0;
  for (let i = 0; i < c.id.length; i++) seed = (seed * 31 + c.id.charCodeAt(i)) >>> 0;
  return preview(c.classId, pieces, seed || 1);
}

/** The class accent as a number, for lights. */
export function classColor(classId: CharClassId): number {
  return CLASSES.find((c) => c.id === classId)?.color ?? 0xc9a227;
}

/** Which one-shot shows a class off best when it steps onto the plinth. */
export function flourishClip(classId: CharClassId): string {
  switch (classId) {
    case 'mage':
    case 'revenant':
      return 'cast';
    case 'ranger':
      return 'shoot';
    case 'paladin':
      return 'slam';
    default:
      return 'attack2';
  }
}
