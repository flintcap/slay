/**
 * The UI lab's first script, as src/boot.ts is the game's: `&lang=qps` sets
 * the pseudo language before the UI loads, so its text is built in it.
 */
import { PSEUDO, setLocale } from '../src/core/I18n';

if (new URLSearchParams(location.search).get('lang') === PSEUDO.code) setLocale(PSEUDO, null);
void import('./uilab-entry');
