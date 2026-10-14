/**
 * Entry point for `tools/check-iconmatch.mjs`: does every set piece and
 * unique worn on the body show the colours its icon shows?
 *
 * Builds the icon model (`buildItem`, which the pack, the floor and the hand
 * all draw) and the worn piece (`wearArmour`, grown on a real hero) in Node,
 * and weighs each one's colours by surface area. The icon's main colour must
 * cover a fair share of the worn piece, and the worn piece's main colour a
 * fair share of the icon. Weapons, shields and jewellery are worn as their
 * icon model, so they match by construction and are not built here.
 */
import './dom-stub';
import * as THREE from 'three';
import { buildHero } from '../src/art/hero/Hero';
import { HERO_LOOKS } from '../src/art/hero/Looks';
import { wearArmour, wearsOnBody } from '../src/art/hero/Armour';
import { buildItem } from '../src/art/items/Model';
import { ITEM_BASES } from '../src/data/itemBases';
import { UNIQUES } from '../src/data/uniques';
import { SET_PIECES } from '../src/data/sets';
import type { EquipSlot, ItemRarity } from '../src/types';

/** Colours closer than this (0..441 in RGB) read as one. */
const SAME = 64;
/** Share of the other model the main colour must cover. */
const SHARE = 0.12;

declare const process: { argv: string[] };
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const baseById = new Map(ITEM_BASES.map((b) => [b.id, b]));
const hero = buildHero(HERO_LOOKS.warden, 'iconmatch');

const tri = new THREE.Triangle();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

/** Colour to surface area over every mesh under `root` (glowing parts aside: they read as light, not colour). */
function palette(root: THREE.Object3D): Map<number, number> {
  const out = new Map<number, number>();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
    const mat = mats[0];
    if (!mat?.color || mat.transparent && mat.opacity < 0.5) return;
    if (mat.emissive && mat.emissiveIntensity > 0.8 && mat.emissive.getHex() !== 0) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const m = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? new THREE.Matrix4() : mesh.matrixWorld;
    let area = 0;
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      area += tri.set(a, b, c).getArea();
    }
    const hex = mat.color.getHex();
    out.set(hex, (out.get(hex) ?? 0) + area);
  });
  const total = [...out.values()].reduce((s, x) => s + x, 0) || 1;
  for (const [k, v] of out) out.set(k, v / total);
  return out;
}

const dist = (x: number, y: number): number => Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255));
/** The colour with the most area once near colours are pooled. */
function mainOf(p: Map<number, number>): { color: number; share: number } {
  let best = { color: 0, share: -1 };
  for (const k of p.keys()) {
    const s = cover(p, k);
    if (s > best.share) best = { color: k, share: s };
  }
  return best;
}
function cover(p: Map<number, number>, color: number): number {
  let s = 0;
  for (const [k, v] of p) if (dist(k, color) < SAME) s += v;
  return s;
}
const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

type Job = { id: string; name: string; baseId: string; rarity: ItemRarity; uniqueId?: string; setId?: string };
const jobs: Job[] = [];
for (const u of UNIQUES) jobs.push({ id: u.id, name: u.name, baseId: u.baseId, rarity: u.rarity, uniqueId: u.id });
for (const p of SET_PIECES) jobs.push({ id: p.id, name: p.name, baseId: p.baseId, rarity: 'set', setId: p.setId });

const problems: string[] = [];
const rows: Array<{ id: string; icon: string; worn: string; iconInWorn: number; wornInIcon: number }> = [];
let built = 0;
for (const j of jobs) {
  if (only && !j.id.includes(only)) continue;
  const base = baseById.get(j.baseId);
  if (!base || !wearsOnBody(base.slot as EquipSlot)) continue;
  const ident = { baseId: j.baseId, rarity: j.rarity, uniqueId: j.uniqueId, setId: j.setId };
  const worn = wearArmour(hero, base.slot as EquipSlot, ident, base.visual);
  if (!worn) continue;
  const icon = buildItem(base.visual, j.rarity, ident);
  const pw = palette(worn.object);
  const pi = palette(icon.group);
  worn.object.removeFromParent();
  built++;
  const mi = mainOf(pi);
  const mw = mainOf(pw);
  const iconInWorn = cover(pw, mi.color);
  const wornInIcon = cover(pi, mw.color);
  rows.push({ id: j.id, icon: hex(mi.color), worn: hex(mw.color), iconInWorn, wornInIcon });
  if (iconInWorn < SHARE || wornInIcon < SHARE) {
    problems.push(`${j.id} (${j.name}): icon is mostly ${hex(mi.color)}, worn is mostly ${hex(mw.color)} (${Math.round(iconInWorn * 100)}% / ${Math.round(wornInIcon * 100)}% shared)`);
  }
}

console.log(JSON.stringify({ built, rows, problems }));
