/**
 * SLAY — the four typefaces, bundled with the game so every PC shows the
 * same type. All are SIL OFL 1.1 (see ASSETS.md), from the `@fontsource-variable`
 * packages: one variable file per script, so any weight the UI asks for is the
 * real cut, never a faked bold.
 *
 * The CSS tokens in `styles.css` (`--font-ui`, `--font-display`, `--font-num`,
 * `--font-title`) name the same families. Canvas text (combat numbers, map
 * labels, world glyphs) cannot wait for a swap the way the page can: a glyph
 * drawn in the fallback stays in the fallback, so `loadFonts()` runs in boot
 * before the first canvas is drawn.
 *
 * The font files themselves are pulled in by `main.ts`, not here, so the node
 * checkers that bundle canvas code never meet a stylesheet.
 */

// i18n-ignore-start
/** Labels, body text, numbers on the HUD. */
export const FONT_UI = "'Inter Variable', system-ui, sans-serif";
/** Names, headings, flavour lines. */
export const FONT_DISPLAY = "'Alegreya Variable', Georgia, serif";
/** Stat columns that must line up. */
export const FONT_NUM = "'JetBrains Mono Variable', ui-monospace, monospace";
/** The game's title and the big carved words. */
export const FONT_TITLE = "'Cinzel Variable', Georgia, serif";
// i18n-ignore-end

/** Every face canvas text draws with. Each `load` fetches the Latin file. */
const FACES = [
  `400 16px ${FONT_UI}`,
  `900 16px ${FONT_UI}`,
  `700 16px ${FONT_DISPLAY}`,
  `italic 700 16px ${FONT_DISPLAY}`,
  `400 16px ${FONT_NUM}`,
  `700 16px ${FONT_TITLE}`,
];

/**
 * Waits until the bundled faces are ready, or `wait` ms have passed. The files
 * ship with the game, so this is a few milliseconds; the cap only guards a
 * page whose fonts failed to load, which then draws in the fallbacks.
 */
export async function loadFonts(wait = 2500): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const ready = Promise.allSettled(FACES.map((f) => document.fonts.load(f))).then(() => undefined);
  await Promise.race([ready, new Promise<void>((done) => setTimeout(done, wait))]);
}
