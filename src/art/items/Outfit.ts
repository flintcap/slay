/**
 * SLAY — what a hero's gear does together.
 *
 * Only the few glowing sets (`Designs.ts`: GLOWING_SETS) and the mythic and
 * ancient uniques (`glowTierOf`) light up. A glowing set piece glows round its
 * outline from the first piece worn, as its icon does, and brighter with each
 * piece added; two pieces and the trims of every worn piece glow in the set's
 * colour too; the full set and the whole outfit shines. A glowing worn unique glows round
 * its own outline. No floating sparks: the owner kept the outline glow and
 * dropped them, as fights full of spells ran slow.
 *
 * Called by `DressedHero.dress` after the pieces are grown. Returns the aura
 * objects it added, which the caller takes off before the next call.
 */
import * as THREE from 'three';
import type { EquipSlot, Item, ItemVisual } from '../../types';
import { getSet } from '../../data/sets';
import { itemLook } from '../ItemLook';
import { lightArmour, type WornArmour } from '../hero/Armour';
import type { HeroModel } from '../hero/Hero';
import { GLOWING_SETS, glowStyleOf, SET_MOTIFS } from './Designs';
import { glowTwins } from './Aura';

type Ident = Pick<Item, 'baseId' | 'rarity'> & Partial<Pick<Item, 'uniqueId' | 'setId'>>;

/** The worn slots whose uniques glow. */
const GLOW_SLOTS: readonly EquipSlot[] = ['chest', 'helm', 'legs', 'boots', 'gloves', 'belt'];

/** How many pieces of each set are worn. */
export function setCounts(pieces: Partial<Record<EquipSlot, Ident | null | undefined>>): Map<string, number> {
  const n = new Map<string, number>();
  for (const p of Object.values(pieces)) if (p?.setId && !p.uniqueId) n.set(p.setId, (n.get(p.setId) ?? 0) + 1);
  return n;
}

/** 0 as built, 1 trims glow, 2 the whole outfit shines. */
export function setStage(worn: number, total: number): number {
  return worn >= Math.max(2, total) ? 2 : worn >= 2 ? 1 : 0;
}

/**
 * Lights worn set pieces for how complete their set is, and puts on the
 * set's and the uniques' auras. `worn` holds the pieces grown on the body.
 */
export function dressOutfit(
  _hero: HeroModel,
  pieces: Partial<Record<EquipSlot, Ident | null | undefined>>,
  worn: Map<EquipSlot, WornArmour>,
  visualOf: (baseId: string) => ItemVisual | undefined,
): THREE.Object3D[] {
  const counts = setCounts(pieces);
  const out: THREE.Object3D[] = [];
  // Set pieces glow as the set fills.
  for (const [slot, w] of worn) {
    const p = pieces[slot];
    if (!p?.setId || p.uniqueId || !GLOWING_SETS.has(p.setId)) continue;
    const motif = SET_MOTIFS[p.setId];
    if (!motif) continue;
    const total = getSet(p.setId)?.pieces.length ?? 99;
    lightArmour(w, setStage(counts.get(p.setId) ?? 0, total), motif.glow);
  }
  // Every worn glowing set piece glows round its outline, as its icon does,
  // brighter as its set fills. One piece used to stay dark until three were
  // worn, though the same piece glowed in the pack.
  for (const [id, n] of counts) {
    if (!GLOWING_SETS.has(id)) continue;
    const motif = SET_MOTIFS[id];
    if (!motif) continue;
    const total = getSet(id)?.pieces.length ?? 99;
    const glow = n >= total ? 0.85 : 0.3 + 0.4 * (n / total);
    for (const [slot, w] of worn) {
      if (pieces[slot]?.setId === id && !pieces[slot]?.uniqueId) out.push(...glowTwins(w.object, motif.glow, glow, 0.012, glowStyleOf(motif.aura, motif.glowStyle)));
    }
  }
  // Worn uniques: their own glow round their outline.
  for (const slot of GLOW_SLOTS) {
    const p = pieces[slot];
    if (!p?.uniqueId || !worn.has(slot)) continue;
    const visual = visualOf(p.baseId);
    if (!visual) continue;
    const look = itemLook({ baseId: p.baseId, rarity: p.rarity, uniqueId: p.uniqueId, setId: p.setId }, visual);
    if (look.aura === 'none') continue;
    out.push(...glowTwins(worn.get(slot)!.object, look.glowColor, look.rarityTier >= 4 ? 0.6 : 0.45, 0.012, look.glowStyle));
  }
  return out;
}
