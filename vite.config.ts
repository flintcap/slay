import { defineConfig } from 'vite';
import { buildDefines, isRelease, releaseLock } from './tools/lib/build-info.mjs';

// Headless checkers run the dev server for minutes at a time. If a source file
// is saved meanwhile, HMR reloads the page under them and the run dies with
// "Execution context was destroyed". `tools/run-checks.mjs` sets this so a
// checker sees one consistent build for its whole run.
const frozen = !!process.env.SLAY_NO_HMR;

// `--mode release` is the locked build a player gets (tools/lib/build-info.mjs).
// It goes to its own folder so the checkers' build in dist/ is never replaced.
export default defineConfig(({ mode }) => ({
  base: './',
  define: buildDefines(mode),
  plugins: [releaseLock(mode)],
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
    outDir: isRelease(mode) ? 'dist-release' : 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
}));
