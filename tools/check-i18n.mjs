/**
 * Is every line a player reads ready to translate, and is every language file
 * sound? See src/core/I18n.ts.
 *
 *   node tools/check-i18n.mjs [--list]
 *
 * Fails on:
 *  - text left out of tr()/trn()/trc() (tools/lib/i18n-scan.mjs says what
 *    counts as text; `// i18n-ignore` marks a line that is not);
 *  - English matched against a line that is translated (`name === 'Attack'`
 *    when the name is tr('Attack')), which breaks in every other language;
 *  - locales/strings.json out of date (node tools/i18n-extract.mjs);
 *  - a language file whose line loses a gap (`{0}`, `{Space}`) or a tag, a
 *    plural entry without the forms its language needs, or a file and the
 *    LOCALES list in src/core/I18n.ts that do not agree;
 *  - maps, quests or items that come out differently in the pseudo language
 *    (text decides nothing), or an item whose shown name is not the name it
 *    was saved with (in English).
 * Lines a language file has not translated yet, and lines it has that the
 * game no longer uses, are listed, not failed.
 */
import { build } from 'vite';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as scan from './lib/i18n-scan.mjs';
import { catalogue, catalogueText } from './i18n-extract.mjs';

const LIST = process.argv.includes('--list');
const fails = [];
const notes = [];
const files = scan.sourceFiles();

// --- 1. text left unwrapped -------------------------------------------------
let loose = 0;
for (const f of files) {
  for (const u of scan.unwrapped(f)) {
    loose++;
    if (loose <= 40 || LIST) fails.push(`${scan.rel(f)}:${u.line}: not translated: ${JSON.stringify(u.text.slice(0, 90))}`);
  }
}
if (loose > 40 && !LIST) fails.push(`... ${loose - 40} more lines not translated (--list shows all)`);

// --- 2. English matched against translated text ------------------------------
const entries = catalogue();
const keyText = new Set();
for (const e of entries) {
  if (e.one !== undefined) keyText.add(e.one).add(e.other);
  else keyText.add(e.text ?? e.key);
}
const MATCH = /^(compare|case|set|call:(get|has|delete|includes|startsWith|endsWith|indexOf|lastIndexOf)|prop:name)$/;
for (const f of files) {
  if (scan.SKIP_FILES.has(scan.rel(f))) continue;
  const src = readFileSync(f, 'utf8');
  if (!src.includes("'") && !src.includes('"')) continue;
  const ignored = scan.ignoreMarks(src);
  const lineOf = scan.lineIndex(src);
  scan.walk(scan.parse(src), (n, stack) => {
    if (n.type !== 'Literal' || typeof n.value !== 'string' || !keyText.has(n.value) || !scan.isProse(n.value)) return;
    const why = scan.nameUseDeep(n, stack);
    if (why && MATCH.test(why) && !ignored(n.start)) {
      fails.push(`${scan.rel(f)}:${lineOf(n.start)}: '${n.value}' is matched as English (${why}) but is shown translated`);
    }
  });
}

// --- 3. the catalogue --------------------------------------------------------
const CAT = path.join(scan.ROOT, 'locales/strings.json');
if (!existsSync(CAT) || readFileSync(CAT, 'utf8') !== catalogueText(entries)) {
  fails.push('locales/strings.json is out of date: run node tools/i18n-extract.mjs');
}

// --- 4. language files ---------------------------------------------------------
const i18nSrc = readFileSync(path.join(scan.SRC, 'core/I18n.ts'), 'utf8');
const infos = new Map();
for (const m of i18nSrc.matchAll(/export const (\w+): LocaleInfo = \{ code: '([^']+)'/g)) infos.set(m[1], m[2]);
const listed = (i18nSrc.match(/export const LOCALES: readonly LocaleInfo\[\] = \[([^\]]*)\]/)?.[1] ?? '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
  .map((x) => infos.get(x) ?? x.match(/code: '([^']+)'/)?.[1] ?? x);
if (!listed.includes('en')) fails.push('src/core/I18n.ts: LOCALES has no English');
const LOC = path.join(scan.SRC, 'locales');
const localeFiles = existsSync(LOC) ? readdirSync(LOC).filter((f) => f.endsWith('.json')) : [];
for (const code of listed) if (code !== 'en' && !localeFiles.includes(`${code}.json`)) fails.push(`LOCALES lists '${code}' but src/locales/${code}.json is missing`);
const byKey = new Map(entries.map((e) => [e.key, e]));
const gaps = (s) => (s.match(/\{[^{}]*\}/g) ?? []).sort().join(' ');
const tags = (s) => (s.match(/<\/?[a-z][a-z0-9]*/gi) ?? []).map((t) => t.toLowerCase()).sort().join(' ');
for (const lf of localeFiles) {
  const code = lf.replace(/\.json$/, '');
  const where = `src/locales/${lf}`;
  if (!listed.includes(code)) fails.push(`${where} is not in LOCALES (src/core/I18n.ts)`);
  let rows;
  try {
    rows = JSON.parse(readFileSync(path.join(LOC, lf), 'utf8'));
  } catch (e) {
    fails.push(`${where}: not valid JSON (${e.message})`);
    continue;
  }
  const need = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  let done = 0;
  let stale = 0;
  for (const [key, row] of Object.entries(rows)) {
    const e = byKey.get(key);
    if (!e) {
      stale++;
      continue;
    }
    if (e.one !== undefined) {
      if (!row || typeof row !== 'object') {
        fails.push(`${where}: "${key}" is a plural line and needs one string per form (${need.join(', ')})`);
        continue;
      }
      const filled = Object.entries(row).filter(([, v]) => v);
      if (filled.length === 0) continue;
      done++;
      for (const f of need) if (!row[f]) fails.push(`${where}: "${key}" has no '${f}' form`);
      for (const [f, v] of filled) {
        if (!need.includes(f)) fails.push(`${where}: "${key}" has a '${f}' form, which ${code} does not use`);
        if (gaps(v) !== gaps(e.other) || tags(v) !== tags(e.other)) fails.push(`${where}: "${key}" (${f}) must keep ${gaps(e.other) || 'no gaps'} ${tags(e.other)}`.trim());
      }
    } else {
      if (typeof row !== 'string') {
        fails.push(`${where}: "${key}" must be a string`);
        continue;
      }
      if (!row) continue;
      done++;
      const english = e.text ?? e.key;
      if (gaps(row) !== gaps(english)) fails.push(`${where}: "${key}" must keep its gaps: ${gaps(english) || 'none'}`);
      if (tags(row) !== tags(english)) fails.push(`${where}: "${key}" must keep its tags: ${tags(english) || 'none'}`);
    }
  }
  notes.push(`${code}: ${done} of ${entries.length} lines translated${stale ? `, ${stale} lines the game no longer uses` : ''}`);
}

// --- 5. text decides nothing ---------------------------------------------------
const OUT = path.join(scan.ROOT, '.i18naudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: scan.ROOT,
  build: { ssr: path.join(scan.ROOT, 'tools/i18n-entry.ts'), outDir: OUT, rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const run = (code) => {
  const raw = execFileSync('node', [path.join(OUT, 'e.mjs'), code], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const lines = raw.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
};
const en = run('en');
const qps = run('qps');
rmSync(OUT, { recursive: true, force: true });
for (const b of en.badNames) fails.push(`item name: ${b}`);
/** Where `a` (English) and `b` (pseudo) differ by more than text, as paths. */
const diffs = [];
function same(a, b, at) {
  if (diffs.length >= 12) return;
  if (typeof a === 'string' && typeof b === 'string') {
    if (a !== b && !b.includes('⟦')) diffs.push(`${at}: "${a.slice(0, 60)}" / "${b.slice(0, 60)}"`);
    return;
  }
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    diffs.push(`${at}: ${JSON.stringify(a)?.slice(0, 60)} / ${JSON.stringify(b)?.slice(0, 60)}`);
    return;
  }
  if (a === null || typeof a !== 'object') {
    if (a !== b) diffs.push(`${at}: ${a} / ${b}`);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) same(a[k], b[k], `${at}.${k}`);
}
same(en, qps, 'sample');
for (const d of diffs) fails.push(`differs in the pseudo language: ${d}`);

// --- report ----------------------------------------------------------------------
const dynamic = files.reduce((n, f) => n + scan.wrappedKeys(f).dynamic.length, 0);
console.log(`${entries.length} lines to translate (${entries.filter((e) => e.one !== undefined).length} counted), ${dynamic} shown from a value`);
console.log(`${en.runs.length} maps, ${en.items.length} items, ${en.drops.length} drops the same in English and pseudo`);
for (const n of notes) console.log(n);
if (fails.length === 0) console.log('OK: every line is ready to translate.');
else {
  for (const f of fails) console.log(`FAIL ${f}`);
  process.exit(1);
}
