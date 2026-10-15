import { defineConfig } from 'vite';

// Headless checkers run the dev server for minutes at a time. If a source file
// is saved meanwhile, HMR reloads the page under them and the run dies with
// "Execution context was destroyed". `tools/run-checks.mjs` sets this so a
// checker sees one consistent build for its whole run.
const frozen = !!process.env.SLAY_NO_HMR;

export default defineConfig({
  base: './',
  // One three.js: its WebGPU build. Plain 'three' imports (ours and the
  // addons') get the same classes, and no WebGL renderer is bundled.
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    ...(frozen ? { hmr: false, watch: null } : {}),
  },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
});
