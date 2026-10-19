/**
 * SLAY — which build this is. Stamped in by `vite.config.ts` from
 * `tools/lib/build-info.mjs`; the node checkers that bundle game code without
 * that config get the fallbacks.
 */

declare const __SLAY_RELEASE__: boolean;
declare const __SLAY_VERSION__: string;
declare const __SLAY_COMMIT__: string;
declare const __SLAY_BUILT__: string;
declare const __SLAY_PACKED__: boolean;

/**
 * A release build: no developer tools, no debug handle, no test scenes. A
 * constant, so the code behind `if (!RELEASE)` is left out of the bundle.
 */
export const RELEASE: boolean = typeof __SLAY_RELEASE__ === 'boolean' ? __SLAY_RELEASE__ : false;
/** package.json's version. */
export const VERSION: string = typeof __SLAY_VERSION__ === 'string' ? __SLAY_VERSION__ : '0.0.0';
/** The commit built from; a trailing `+` means uncommitted changes were in it. */
export const COMMIT: string = typeof __SLAY_COMMIT__ === 'string' ? __SLAY_COMMIT__ : 'local';
/** The day it was built, YYYY-MM-DD. */
export const BUILT: string = typeof __SLAY_BUILT__ === 'string' ? __SLAY_BUILT__ : '';

/** The one-page build: its art and sound files ship folded into packs (core/Assets.ts). */
export const PACKED: boolean = typeof __SLAY_PACKED__ === 'boolean' ? __SLAY_PACKED__ : false;

/** "v1.0.0 (710c14f)", plus "test build" on any build that is not a release. */
export function versionLabel(): string {
  return `v${VERSION} (${COMMIT})${RELEASE ? '' : ' test build'}`;
}
