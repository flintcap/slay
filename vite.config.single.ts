import { defineConfig } from 'vite';

/**
 * Single-file build for the playable artifact. The game already ships zero
 * external assets, so inlining every chunk and the stylesheet yields one
 * self-contained HTML document that runs offline.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Dynamic imports must fold into the one chunk or they 404 when inlined.
        inlineDynamicImports: true,
        entryFileNames: 'bundle.js',
        assetFileNames: 'bundle[extname]',
      },
    },
  },
});
