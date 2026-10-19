/**
 * SLAY — the page's first script: sets the language, then starts the game.
 *
 * The language has to be in place before the game's modules load, because
 * they build their text (names, descriptions, lines) as they load
 * (core/I18n.ts). The choice is kept in its own small storage key so this
 * does not have to read the whole save. With nothing chosen, the browser's
 * own language is used when the game has it.
 */
import { ENGLISH, LANG_KEY, LOCALES, PSEUDO, setLocale, tr, translating, type LocaleTable } from './core/I18n';
import { RELEASE } from './core/Build';

const files = import.meta.glob<LocaleTable>('./locales/*.json', { import: 'default' });

async function chooseLanguage(): Promise<void> {
  let code = '';
  try {
    code = localStorage.getItem(LANG_KEY) ?? '';
  } catch {
    /* storage blocked: the browser's language, or English */
  }
  if (code === PSEUDO.code) {
    if (!RELEASE) setLocale(PSEUDO, null);
    return;
  }
  const wanted = code ? [code] : navigator.languages;
  const info = wanted
    .map((w) => LOCALES.find((l) => l.code === w) ?? LOCALES.find((l) => l.code === w.split('-')[0]))
    .find((l) => !!l);
  const load = info && files[`./locales/${info.code}.json`];
  if (!info || info.code === ENGLISH.code || !load) return;
  try {
    setLocale(info, await load());
  } catch (e) {
    console.warn(`[i18n] could not load ${info.code}; staying in English`, e);
  }
}

/** The loading screen is written in the page itself, in English. */
function translatePage(): void {
  if (!translating()) return;
  const sub = document.querySelector('.boot-sub');
  if (sub) sub.textContent = tr('Descend. Die. Descend again.');
  const status = document.getElementById('boot-status');
  if (status) status.textContent = tr('Forging the world…');
  document.title = tr('SLAY — {0}', tr('Descend. Die. Descend again.'));
}

void chooseLanguage()
  .then(translatePage)
  .then(() => import('./main'));
