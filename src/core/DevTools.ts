/**
 * SLAY — are the developer tools on?
 *
 * The art studio, the `window.SLAY` handle and its cheats (god mode, warps,
 * free items) exist for the dev server and the test harness. A browser driven
 * by automation says so in `navigator.webdriver`, which is how the checkers
 * get them on a test build. A release build (`core/Build.ts`) has none of it,
 * whoever drives the browser: the code is not in the bundle.
 */
import { RELEASE } from './Build';

export const DEV_TOOLS: boolean = !RELEASE && (import.meta.env.DEV || navigator.webdriver === true);
