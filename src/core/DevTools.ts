/**
 * SLAY — are the developer tools on?
 *
 * The art studio, the `window.SLAY` handle and its cheats (god mode, warps,
 * free items) exist for the dev server and the test harness. A browser driven
 * by automation says so in `navigator.webdriver`, which is how the checkers
 * get them on a release build. A player's game has none of it.
 */
export const DEV_TOOLS: boolean = import.meta.env.DEV || navigator.webdriver === true;
