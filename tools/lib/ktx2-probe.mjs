/**
 * Loaded into the game's page by tools/check-ktx2.mjs (Vite serves it, with
 * the game's own three.js): reads back what the GPU decodes from a texture.
 */
import * as THREE from 'three/webgpu';
import { int, ivec2, screenCoordinate, textureLoad } from 'three/tsl';
import { decodeBC7 } from './bc7.mjs';

/**
 * Every texel of level `level` of `tex` as the GPU decodes it: RGBA floats,
 * rows from the first, no filtering (a texel load). An sRGB texture comes
 * back as linear light, as a shader sees it.
 */
async function gpuTexels(gl, tex, level) {
  const w = Math.max(1, tex.image.width >> level);
  const h = Math.max(1, tex.image.height >> level);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.fragmentNode = textureLoad(tex, ivec2(screenCoordinate.xy), int(level));
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  cam.position.z = 1;
  const rt = new THREE.RenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false });
  await gl.compileAsync(scene, cam);
  const before = gl.getRenderTarget();
  gl.setRenderTarget(rt);
  gl.render(scene, cam);
  gl.setRenderTarget(before);
  const raw = await gl.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
  rt.dispose();
  mat.dispose();
  quad.geometry.dispose();
  // Rows come padded to 256 bytes.
  const stride = Math.ceil((w * 16) / 256) * 64;
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(raw.subarray(y * stride, y * stride + w * 4), y * w * 4);
  return out;
}

const toSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);

/**
 * Compares the GPU's decode of a packed texture's level with the packer's
 * own decoder (tools/lib/bc7.mjs). BC7 decoding is exact, so every channel
 * of every texel should match: within 1 for an sRGB texture, whose decode to
 * linear light is allowed a little rounding.
 */
export async function compareLevel(gl, tex, level) {
  const m = tex.mipmaps[level];
  const want = decodeBC7(m.data, m.width, m.height);
  const got = await gpuTexels(gl, tex, level);
  const srgb = tex.colorSpace === THREE.SRGBColorSpace;
  let worst = 0;
  let off = 0;
  for (let i = 0; i < want.length; i++) {
    const v = srgb && (i & 3) !== 3 ? toSrgb(got[i]) : got[i];
    const d = Math.abs(Math.round(v * 255) - want[i]);
    if (d > worst) worst = d;
    if (d > (srgb ? 1 : 0)) off++;
  }
  return { width: m.width, height: m.height, srgb, worst, off };
}
