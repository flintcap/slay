/**
 * What a build stamps into the game (`src/core/Build.ts`): the version from
 * package.json, the commit it was built from, the day, and whether it is a
 * release build.
 *
 * A release build (`vite build --mode release`, or SLAY_RELEASE=1) is locked:
 * the developer tools, the `window.SLAY` handle and the test scenes are not
 * in it at all, not even behind automation. Every other build keeps them for
 * the checkers.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function isRelease(mode) {
  return mode === 'release' || process.env.SLAY_RELEASE === '1';
}

/**
 * `packed`: the one-page build, whose files ship folded into packs
 * (tools/bundle-artifact.mjs). Only it asks for `assets/packs.json`.
 */
export function buildDefines(mode, { packed = false } = {}) {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  // A build from uncommitted files is marked, so a report says so.
  const commit = git(['rev-parse', '--short=7', 'HEAD']) || 'local';
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  return {
    __SLAY_RELEASE__: JSON.stringify(isRelease(mode)),
    __SLAY_VERSION__: JSON.stringify(pkg.version),
    __SLAY_COMMIT__: JSON.stringify(dirty ? `${commit}+` : commit),
    __SLAY_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __SLAY_PACKED__: JSON.stringify(packed),
  };
}

/** Modules only the developer tools use: the debug handle and the art studio scene. */
const DEV_ONLY = /[\\/]src[\\/]scenes[\\/](debug|shifterDebug|ShowcaseScene)\.ts$/;
const DEV_FLAG = /[\\/]src[\\/]core[\\/]DevTools\.ts$/;

/**
 * The release lock, as a build plugin. In a release build the dev-only modules
 * load as empty stubs, so none of their code can ship even if a guard were
 * missed; their empty chunks are dropped from the output, and the build fails
 * if any code left still loads them.
 */
export function releaseLock(mode) {
  const on = isRelease(mode);
  return {
    name: 'slay-release-lock',
    apply: 'build',
    load(id) {
      if (!on) return null;
      if (DEV_ONLY.test(id)) return 'export {};';
      // A plain `false` the bundler can carry into every module that asks, so
      // each `if (DEV_TOOLS)` block is dropped as dead code.
      if (DEV_FLAG.test(id)) return 'export const DEV_TOOLS = false;';
      return null;
    },
    generateBundle(_options, bundle) {
      if (!on) return;
      const dropped = new Set();
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type !== 'chunk') continue;
        const ids = out.moduleIds ?? Object.keys(out.modules ?? {});
        if (ids.length > 0 && ids.every((m) => DEV_ONLY.test(m))) dropped.add(file);
      }
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type !== 'chunk' || dropped.has(file)) continue;
        // The chunk's import lists still name a dynamic import whose call was
        // dropped as dead code, so look at the code itself.
        const reach = [...dropped].filter((f) => out.code.includes(f.split('/').pop()));
        if (reach.length > 0) this.error(`release lock: ${file} still loads ${reach.join(', ')}`);
      }
      for (const file of dropped) delete bundle[file];
    },
  };
}
