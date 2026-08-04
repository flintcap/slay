/**
 * Entry point for `tools/check-palettes.mjs`.
 *
 * Just the registry. `resolvePalette` never fails — an unknown key falls back
 * to the family default and then to crypt stone, which is right at runtime and
 * a trap at authoring time. The driver does the scanning; this only says what
 * is real.
 */
import { allPaletteKeys } from '../src/art/Palettes';

console.log(JSON.stringify({ keys: allPaletteKeys() }));
