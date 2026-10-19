import { defineConfig } from 'vite';
import { buildDefines, isRelease, releaseLock } from './tools/lib/build-info.mjs';

/**
 * Single-file build for the playable artifact: every chunk and the stylesheet
 * inlined into one bundle that `tools/bundle-artifact.mjs` folds into a page.
 * The CC0 files in `public/assets/` and the townsfolk worker script are not
 * inlined; they are published beside the page (`dist-single/files.json`), and
 * the game runs without them.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  define: buildDefines(mode, { packed: true }),
  plugins: [releaseLock(mode)],
  // One three.js: its WebGPU build. Plain 'three' imports (ours and the
  // addons') get the same classes, and no WebGL renderer is bundled.
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: {
    // The locked release page (`--mode release`) has its own folder; the
    // checkers that serve the page read dist-single.
    outDir: isRelease(mode) ? 'dist-single-release' : 'dist-single',
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Dynamic imports must fold into the one chunk or they 404 when inlined.
        codeSplitting: false,
        entryFileNames: 'bundle.js',
        assetFileNames: 'bundle[extname]',
      },
    },
  },
}));
