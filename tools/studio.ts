/**
 * The renderer behind the art sheets. Its GPU device opens asynchronously,
 * so each page opens one up front and draws with it synchronously after.
 */
import * as THREE from 'three/webgpu';

export async function openStudio(o: { alpha?: boolean; exposure?: number; toneMapping?: THREE.ToneMapping } = {}): Promise<THREE.WebGPURenderer> {
  const r = new THREE.WebGPURenderer({ antialias: true, alpha: o.alpha ?? false });
  await r.init();
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = o.toneMapping ?? THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = o.exposure ?? 1;
  return r;
}
