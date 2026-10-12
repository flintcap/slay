/**
 * SLAY — what a hero's gear does together.
 *
 * Only the few glowing sets and uniques (`Designs.ts`: GLOWING_SETS,
 * GLOWING_UNIQUES) light up. A glowing set lights as it is completed: two
 * pieces and the trims of every worn piece glow in the set's colour; three
 * or more and every piece glows round its outline (with sparks, for the
 * sparky kinds), stronger with each piece; the full set and the whole
 * outfit shines. A glowing worn unique glows round its own outline.
 *
 * Called by `DressedHero.dress` after the pieces are grown. Returns the aura
 * objects it added, which the caller takes off before the next call.
 */
import * as THREE from 'three';
import type { EquipSlot, Item, ItemVisual } from '../../types';
import { getSet } from '../../data/sets';
import { hashString } from '../../core/RNG';
import { itemLook } from '../ItemLook';
import { lightArmour, type WornArmour } from '../hero/Armour';
import type { HeroModel } from '../hero/Hero';
import { GLOWING_SETS, glowStyleOf, SET_MOTIFS } from './Designs';
import { buildAura, glowTwins } from './Aura';

type Ident = Pick<Item, 'baseId' | 'rarity'> & Partial<Pick<Item, 'uniqueId' | 'setId'>>;

/** At most this many spark columns on one hero: each is a draw call. */
const MAX_AURAS = 3;

/** Where a worn unique's aura sits: the bone it follows, its radius and height, and its foot. */
const WORN_AURA: Partial<Record<EquipSlot, { bone: string; r: number; h: number; y: number }>> = {
  chest: { bone: 'chest', r: 0.3, h: 0.7, y: -0.25 },
  helm: { bone: 'head', r: 0.2, h: 0.4, y: 0.05 },
  boots: { bone: 'root', r: 0.3, h: 0.35, y: 0 },
  gloves: { bone: 'handR', r: 0.12, h: 0.3, y: -0.1 },
  belt: { bone: 'pelvis', r: 0.3, h: 0.3, y: -0.1 },
};

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
  hero: HeroModel,
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
  // The set's aura: three pieces and up, the fullest set wins.
  let best: { id: string; n: number; total: number } | null = null;
  for (const [id, n] of counts) {
    if (!GLOWING_SETS.has(id)) continue;
    const total = getSet(id)?.pieces.length ?? 99;
    if (n >= 3 && (!best || n / total > best.n / best.total)) best = { id, n, total };
  }
  const bones = hero.rig.bones as unknown as Record<string, THREE.Bone>;
  const height = hero.look.shape.height || 1.8;
  if (best) {
    const motif = SET_MOTIFS[best.id];
    if (motif) {
      const full = best.n >= best.total;
      // Every worn piece of the set glows round its outline, brighter as it fills.
      const glow = full ? 0.85 : 0.3 + 0.4 * (best.n / best.total);
      for (const [slot, w] of worn) {
        if (pieces[slot]?.setId === best.id && !pieces[slot]?.uniqueId) out.push(...glowTwins(w.object, motif.glow, glow, 0.012, glowStyleOf(motif.aura, motif.glowStyle)));
      }
      const aura = buildAura(motif.aura, motif.glow, { radius: 0.42, height: Math.min(2.2, height * 1.05), strength: full ? 1.2 : 0.35 + 0.5 * (best.n / best.total), seed: hashString(best.id) });
      if (aura) {
        hero.root.add(aura);
        out.push(aura);
      }
    }
  }
  // Worn uniques: their own aura where they sit, best first.
  const order: EquipSlot[] = ['chest', 'helm', 'boots', 'gloves', 'belt'];
  let sparks = out.filter((o) => (o as THREE.Points).isPoints).length;
  for (const slot of order) {
    const p = pieces[slot];
    const where = WORN_AURA[slot];
    if (!p?.uniqueId || !where || !worn.has(slot)) continue;
    const visual = visualOf(p.baseId);
    if (!visual) continue;
    const look = itemLook({ baseId: p.baseId, rarity: p.rarity, uniqueId: p.uniqueId, setId: p.setId }, visual);
    if (look.aura === 'none') continue;
    out.push(...glowTwins(worn.get(slot)!.object, look.glowColor, look.rarityTier >= 4 ? 0.6 : 0.45, 0.012, look.glowStyle));
    if (sparks >= MAX_AURAS) continue;
    const bone = bones[where.bone] ?? hero.root;
    const aura = buildAura(look.aura, look.glowColor, { radius: where.r, height: where.h, strength: look.rarityTier >= 4 ? 0.9 : 0.6, seed: hashString(p.uniqueId) });
    if (!aura) continue;
    aura.position.y = where.y;
    // Bones carry the rig's scale; the aura keeps its own size in metres.
    bone.updateWorldMatrix(true, false);
    hero.root.updateWorldMatrix(true, false);
    const s = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld).x / Math.max(0.01, new THREE.Vector3().setFromMatrixScale(hero.root.matrixWorld).x);
    aura.scale.setScalar(1 / Math.max(0.01, s));
    bone.add(aura);
    out.push(aura);
    sparks++;
  }
  return out;
}
