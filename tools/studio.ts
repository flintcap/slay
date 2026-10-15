/**
 * The renderer behind the art sheets. Its GPU device opens asynchronously,
 * so each page opens one up front and draws with it synchronously after.
 */
import * as THREE from 'three/webgpu';
import { makeStudioRenderer } from '../src/core/Studio';

export async function openStudio(o: { alpha?: boolean; exposure?: number; toneMapping?: THREE.ToneMapping } = {}): Promise<THREE.WebGPURenderer> {
  const r = await makeStudioRenderer({ alpha: o.alpha ?? false });
  if (!r) throw new Error('no GPU renderer for the sheet');
  r.toneMapping = o.toneMapping ?? THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = o.exposure ?? 1;
  return r;
}
