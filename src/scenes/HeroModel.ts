import * as THREE from 'three';
import type { Character, CharClassId, EquipSlot, ItemRarity } from '../types';
import { Random } from '../core/RNG';
import { disposeObject } from '../core/Engine';
import { buildPlayerModel, attachToSocket, weaponGrip, carryGrip, wearItem } from '../art/CharacterModels';
import { buildItemModel } from '../art/ItemModels';
import { compactModel } from '../art/ModelBudget';
import { Animator } from '../art/Animation';
import { getBase } from '../sim/Loot';
import { CLASSES } from '../data/classes';
import { FIELD_KIT } from './FieldKit';

/**
 * A dressed, animated character for the front-end screens.
 *
 * The bare class model is a body in underwear: what a character looks like is
 * decided entirely by its equipment. That is right in play and wrong on a
 * class select screen, where the player is choosing a fantasy. So a class
 * preview wears a "field kit" that says what the class is, and a roster
 * preview wears the character's real gear, exactly as it will walk into town.
 */

/** Slots that put geometry on the body, in the same order the Player uses. */
const VISUAL_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt'];

export interface HeroModel {
  root: THREE.Group;
  animator: Animator;
  classId: CharClassId;
  dispose(): void;
}

interface Piece {
  baseId: string;
  rarity: ItemRarity;
}

/** Builds a class in its field kit. */
export function buildClassHero(classId: CharClassId): HeroModel {
  const kit = FIELD_KIT[classId] ?? {};
  const pieces = new Map<EquipSlot, Piece>();
  for (const [slot, baseId] of Object.entries(kit) as Array<[EquipSlot, string]>) {
    pieces.set(slot, { baseId, rarity: 'rare' });
  }
  return assemble(classId, pieces, 0x5eed ^ (classId.length * 7919));
}

/** Builds a living character wearing exactly what it has equipped. */
export function buildCharacterHero(c: Character): HeroModel {
  const pieces = new Map<EquipSlot, Piece>();
  for (const slot of VISUAL_SLOTS) {
    const item = c.equipment[slot];
    if (item) pieces.set(slot, { baseId: item.baseId, rarity: item.rarity });
  }
  let seed = 0;
  for (let i = 0; i < c.id.length; i++) seed = (seed * 31 + c.id.charCodeAt(i)) >>> 0;
  return assemble(c.classId, pieces, seed || 1);
}

function assemble(classId: CharClassId, pieces: Map<EquipSlot, Piece>, seed: number): HeroModel {
  const rng = new Random(seed);
  const built = buildPlayerModel(classId, rng, pieces.keys());
  const root = new THREE.Group();
  root.add(built.root);

  let main: { category?: string; twoHand: boolean } | null = null;
  for (const slot of VISUAL_SLOTS) {
    const piece = pieces.get(slot);
    if (!piece) continue;
    try {
      const base = getBase(piece.baseId);
      const visual = base?.visual ?? { shape: 'auto', palette: 'metal.steel' };
      const socketKey = base?.category === 'quiver' ? 'quiver' : undefined;
      const grip =
        slot === 'mainHand' || slot === 'offHand' ? weaponGrip(base?.category, base?.slot === 'twoHand') : undefined;
      // Armour is worn on the body, as in play; the rest is socketed.
      if (wearItem(built.root, built.bones, slot, piece, visual)) continue;
      const mesh = compactModel(buildItemModel(visual, rng, piece.rarity));
      mesh.traverse((o) => {
        o.castShadow = true;
      });
      attachToSocket(built.root, built.bones, slot, mesh, socketKey, grip);
      if (slot === 'mainHand') main = { category: base?.category, twoHand: base?.slot === 'twoHand' };
    } catch {
      // A missing visual must never blank the select screen.
    }
  }

  const animator = new Animator(built.bones);
  if (main) animator.setGrip(carryGrip(main.category, main.twoHand));
  animator.play('idle', { fade: 0 });

  return {
    root,
    animator,
    classId,
    dispose(): void {
      root.removeFromParent();
      disposeObject(root);
    },
  };
}

/** The class accent as a number, for lights. */
export function classColor(classId: CharClassId): number {
  return CLASSES.find((c) => c.id === classId)?.color ?? 0xc9a227;
}

/** Which one-shot shows a class off best when it steps onto the plinth. */
export function flourishClip(classId: CharClassId): string {
  switch (classId) {
    case 'pyromancer':
    case 'stormcaller':
    case 'revenant':
      return 'cast';
    case 'ranger':
      return 'shoot';
    default:
      return 'attack2';
  }
}
