/**
 * Entry point for `tools/check-npcdraws.mjs`.
 *
 * Builds every camp resident exactly as the town does and counts what each
 * one costs to draw: visible meshes (one draw call each in the colour pass),
 * how many of those cast shadows (one more per shadow pass), and how many
 * distinct materials they use (the floor a merge can reach). No renderer.
 */
import * as THREE from 'three';
import { buildNpcModel, NPC_LOOK_IDS } from '../src/art/NpcModels';
import { Random } from '../src/core/RNG';

declare const process: { env: Record<string, string | undefined> };

function visibleInTree(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

const rows = NPC_LOOK_IDS.map((id, i) => {
  const { root } = buildNpcModel(id, new Random(1000 + i));
  let meshes = 0;
  let skinned = 0;
  let shadow = 0;
  let tris = 0;
  const mats = new Set<string>();
  const parts: string[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !visibleInTree(m)) return;
    meshes++;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
    if (m.castShadow) shadow++;
    const mat = m.material as THREE.Material;
    mats.add(mat.uuid);
    const idx = m.geometry.getIndex();
    const t = (idx ? idx.count : (m.geometry.getAttribute('position')?.count ?? 0)) / 3;
    tris += t;
    m.geometry.computeBoundingBox();
    const size = m.geometry.boundingBox!.getSize(new THREE.Vector3()).length();
    parts.push(`${m.name || mat.name || '?'} [${mat.type}] ${size.toFixed(2)}m ${Math.round(t)}t`);
  });
  if (process.env.NPC_DUMP) console.log(id, '\n  ' + parts.join('\n  '));
  return { id, meshes, skinned, shadow, materials: mats.size, tris: Math.round(tris) };
});
console.log(JSON.stringify({ rows }));
