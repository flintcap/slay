/**
 * Lists every line a player can read, for translators: `locales/strings.json`.
 *
 *   node tools/i18n-extract.mjs                 write locales/strings.json
 *   node tools/i18n-extract.mjs --check         exit 1 if it is out of date
 *   node tools/i18n-extract.mjs --template=fr   add every missing line to
 *                                               src/locales/fr.json, empty
 *
 * Each entry is one key a language file fills (src/core/I18n.ts):
 *   { "key": "Open map", "files": ["ui/HUD.ts"] }
 *   { "key": "{0} socket|{0} sockets", "one": "{0} socket", "other": "{0} sockets", ... }
 *   { "key": "gem name: quality, then stone::{0} {1}", "context": "...", "text": "{0} {1}", ... }
 * plus `note` when a `// i18n: ...` comment sits on or just above the line.
 * The same key from many places is one entry: translated once.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as scan from './lib/i18n-scan.mjs';

const OUT = path.join(scan.ROOT, 'locales/strings.json');

/** Every key the source passes to tr/trn/trc/trk, merged, in a stable order. */
export function catalogue() {
  const byKey = new Map();
  for (const file of scan.sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    if (!/\btr[nck]?\(/.test(src)) continue;
    const lines = src.split('\n');
    const where = scan.rel(file);
    for (const k of scan.wrappedKeys(file, src).keys) {
      const key = k.plural !== undefined ? `${k.text}|${k.plural}` : k.context !== undefined ? `${k.context}::${k.text}` : k.text;
      let e = byKey.get(key);
      if (!e) {
        e = { key };
        if (k.plural !== undefined) Object.assign(e, { one: k.text, other: k.plural });
        if (k.context !== undefined) Object.assign(e, { context: k.context, text: k.text });
        e.files = [];
        byKey.set(key, e);
      }
      if (!e.files.includes(where)) e.files.push(where);
      const near = [lines[k.line - 1], lines[k.line - 2]].find((l) => l !== undefined && /\/\/\s*i18n:/.test(l));
      const note = near?.replace(/^.*\/\/\s*i18n:\s*/, '').trim();
      if (note && !e.note) e.note = note;
    }
  }
  return [...byKey.values()].sort((a, b) => (a.files[0] < b.files[0] ? -1 : a.files[0] > b.files[0] ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function catalogueText(entries = catalogue()) {
  return `${JSON.stringify(
    {
      _about:
        'Every line in SLAY a player can read, made by tools/i18n-extract.mjs: do not edit by hand. ' +
        'A language file (src/locales/<code>.json) maps each "key" to its translation; a plural ' +
        'entry maps to one string per plural form; see locales/README.md.',
      count: entries.length,
      strings: entries,
    },
    null,
    1,
  )}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const entries = catalogue();
  const text = catalogueText(entries);
  if (args.includes('--check')) {
    const now = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (now !== text) {
      console.log('locales/strings.json is out of date: run node tools/i18n-extract.mjs');
      process.exit(1);
    }
    console.log(`locales/strings.json is current (${entries.length} lines)`);
  } else {
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log(`${entries.length} lines -> locales/strings.json`);
  }
  const tpl = args.find((a) => a.startsWith('--template='))?.slice(11);
  if (tpl) {
    const file = path.join(scan.SRC, 'locales', `${tpl}.json`);
    const have = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const forms = new Intl.PluralRules(tpl).resolvedOptions().pluralCategories;
    let added = 0;
    for (const e of entries) {
      if (e.key in have) continue;
      have[e.key] = e.one !== undefined ? Object.fromEntries(forms.map((f) => [f, ''])) : '';
      added++;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(have, null, 1)}\n`);
    console.log(`${added} empty lines added to src/locales/${tpl}.json`);
  }
}
