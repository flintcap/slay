/**
 * SLAY — the translation layer.
 *
 * Every word a player reads goes through `tr()`. The English text is the key:
 * `tr('Open map')` returns the current language's line for "Open map", or the
 * English when that language has none. Values go in numbered gaps, so a
 * translator can move them: `tr('Tier {0}, area {1} of {2}', tier, n, of)`.
 * Counted words go through `trn()`, which picks the right plural form for the
 * language (Intl.PluralRules): `trn(n, '{0} socket', '{0} sockets', n)`.
 * Numbers with decimals go through `numText()`, so "1.5" reads "1,5" where it
 * should, and big whole numbers through `numGrouped()` ("12,345", "12.345"). (`tr` and not `t`, because `t` is everyone's time variable.)
 *
 * A language is one JSON file in `src/locales/<code>.json`, English text to
 * translated text; a plural entry is keyed `one|other` and holds one string
 * per plural form the language has. `tools/i18n-extract.mjs` lists every key
 * in `locales/strings.json` for translators, and `tools/check-i18n.mjs` keeps
 * that list current and every locale file sound.
 *
 * The language is chosen before anything else loads (src/boot.ts), so text
 * set up when a module loads (the game's data: names, descriptions, lines) is
 * already in the right language. Changing it takes a restart.
 *
 * `trk()` marks English that is kept as it is (it goes into a save, or is
 * matched against) and translated where it is shown, with `tr(value)`.
 * `trc()` is `tr()` with a context, for patterns like "{0} {1}" that mean
 * different things in different places.
 *
 * Test builds also offer "Pseudo": every line accented, a third longer and in
 * brackets, numbers in German style. Text that shows up plain was missed;
 * text cut off has no room for longer languages. Gaps and keycaps (`{0}`,
 * `{Space}`), tags and entities are left as they are, in every language.
 */

/** A plural entry: one string per plural category the language uses. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;
export type LocaleTable = Record<string, string | PluralForms>;

export interface LocaleInfo {
  /** BCP 47 code: the file name, `<html lang>`, and number style. */
  code: string;
  /** The language's own name for itself. */
  name: string;
}

export const ENGLISH: LocaleInfo = { code: 'en', name: 'English' };
export const PSEUDO: LocaleInfo = { code: 'qps', name: 'Pseudo (test)' };

/**
 * The languages a player can pick. To add one: its file in
 * `src/locales/<code>.json` and its line here (tools/check-i18n.mjs checks
 * the two agree).
 */
export const LOCALES: readonly LocaleInfo[] = [ENGLISH];

/** The localStorage key that holds the chosen language, read at boot. */
export const LANG_KEY = 'slay.lang';

type Arg = string | number;

let current: LocaleInfo = ENGLISH;
let table: LocaleTable | null = null;
let pseudo = false;
let plurals = new Intl.PluralRules('en');
/** The number style: German for the pseudo locale, so a hard-coded "1,234" stands out. */
let numberTag = 'en-US';
let grouper: Intl.NumberFormat | null = null;
let groupMark = ',';
let decimalMark = '.';
/** False for a language written with its own digits: then numbers go through Intl every time. */
let latinDigits = true;
const pseudoCache = new Map<string, string>();

const GAP = /\{(\d+)\}/g;

function fill(text: string, args: readonly Arg[]): string {
  if (args.length === 0) return text;
  return text.replace(GAP, (m, i: string) => {
    const v = args[Number(i)];
    return v === undefined ? m : String(v);
  });
}

/** The language in use. */
export function locale(): LocaleInfo {
  return current;
}

/** True when the text shown is not the English written in the code. */
export function translating(): boolean {
  return table !== null || pseudo;
}

/** The BCP 47 tag numbers are written in. */
export function numberLocale(): string {
  return numberTag;
}

/**
 * Sets the language. Call before the game's modules load (src/boot.ts):
 * text built at load is not rebuilt. `rows` is the language's file, or null
 * for English and for the pseudo locale.
 */
export function setLocale(info: LocaleInfo, rows: LocaleTable | null): void {
  current = info;
  pseudo = info.code === PSEUDO.code;
  table = pseudo ? null : rows;
  plurals = new Intl.PluralRules(pseudo ? 'en' : info.code);
  numberTag = pseudo ? 'de-DE' : info.code === 'en' ? 'en-US' : info.code;
  grouper = null;
  const parts = new Intl.NumberFormat(numberTag).formatToParts(12345.6);
  groupMark = parts.find((p) => p.type === 'group')?.value ?? ',';
  decimalMark = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  latinDigits = new Intl.NumberFormat(numberTag).format(1234567890).replace(/\D/g, '') === '1234567890';
  pseudoCache.clear();
  if (typeof document !== 'undefined') document.documentElement.lang = pseudo ? 'en' : info.code;
}

/** The text in the current language, with `{0}`, `{1}`... filled from `args`. */
export function tr(text: string, ...args: Arg[]): string {
  if (pseudo) return fill(pseudoOf(text), args);
  if (table) {
    const row = table[text];
    if (typeof row === 'string' && row) return fill(row, args);
  }
  return fill(text, args);
}

/**
 * A counted line: `one` or `other` in English, and whichever form the
 * language needs for `count` in others. `count` only picks the form; pass it
 * in `args` too to show it.
 */
export function trn(count: number, one: string, other: string, ...args: Arg[]): string {
  const english = count === 1 ? one : other;
  if (pseudo) return fill(pseudoOf(english), args);
  if (table) {
    const row = table[`${one}|${other}`];
    if (row && typeof row === 'object') {
      const form = row[plurals.select(count)] ?? row.other;
      if (form) return fill(form, args);
    }
  }
  return fill(english, args);
}

/**
 * `tr` for a line too bare to stand alone, such as "{0} {1}": `context` says
 * what it is, and the language file keys it `context::text`.
 */
export function trc(context: string, text: string, ...args: Arg[]): string {
  if (pseudo) return fill(pseudoOf(text), args);
  if (table) {
    const row = table[`${context}::${text}`];
    if (typeof row === 'string' && row) return fill(row, args);
  }
  return fill(text, args);
}

/** Marks English to translate where it is shown, not here. Returns it unchanged. */
export function trk<T extends string>(text: T): T {
  return text;
}

/**
 * A number with `decimals` places, in the language's style. English gives
 * exactly what `toFixed` gives.
 */
export function numText(n: number, decimals = 0): string {
  if (decimalMark === '.') return n.toFixed(decimals);
  if (latinDigits) return n.toFixed(decimals).replace('.', decimalMark);
  return n.toLocaleString(numberTag, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
}

/** A whole number with thousands marks in the language's style: "12,345", "12.345". */
export function numGrouped(n: number): string {
  grouper ??= new Intl.NumberFormat(numberTag, { maximumFractionDigits: 0 });
  return grouper.format(n);
}

/** The thousands mark, for numbers written by hand where Intl is too slow (one per hit). */
export function groupSeparator(): string {
  return groupMark;
}

// ---------------------------------------------------------------------------
// The pseudo locale
// ---------------------------------------------------------------------------

const ACCENT: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ʠ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ľ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Accents every letter outside markup, gaps and entities, pads by a third, and brackets the whole. */
function pseudoOf(text: string): string {
  let out = pseudoCache.get(text);
  if (out !== undefined) return out;
  // Already through tr(): a value shown with `tr(value)` that was translated when it was made.
  if (text.startsWith('⟦')) return text;
  let body = '';
  let letters = 0;
  // Leave `<tag attr="...">`, `&entity;`, `{0}` and `{Key}` exactly as written.
  for (const part of text.split(/(<[^>]*>|&[#\w]+;|\{[^{}]*\})/)) {
    if (/^(<[^>]*>|&[#\w]+;|\{[^{}]*\})$/.test(part)) {
      body += part;
      continue;
    }
    for (const ch of part) {
      const a = ACCENT[ch];
      if (a) letters++;
      body += a ?? ch;
    }
  }
  out = letters === 0 ? text : `⟦${body}${'·'.repeat(Math.ceil(letters / 3))}⟧`;
  pseudoCache.set(text, out);
  return out;
}
