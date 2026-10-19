/**
 * Entry point for `tools/check-i18n.mjs`: the language is set first, then the
 * game loads (as src/boot.ts does), so text made at load is in that language.
 *
 *   node e.mjs en|qps   prints one JSON line: maps and items it generated
 */
import { PSEUDO, ENGLISH, setLocale } from '../src/core/I18n';

declare const process: { argv: string[] };

setLocale(process.argv[2] === PSEUDO.code ? PSEUDO : ENGLISH, null);
const { sample } = await import('./i18n-run');
console.log(JSON.stringify(sample()));
