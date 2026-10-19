# Translating SLAY

`strings.json` here lists every line in the game a player can read. It is made
by `node tools/i18n-extract.mjs`, so do not edit it by hand. A translation is
one file, `src/locales/<code>.json` (`fr`, `de`, `pt-BR`...), that maps each
line to its translation.

## Start a language

1. `node tools/i18n-extract.mjs --template=fr` writes `src/locales/fr.json`
   with every line, empty. Run it again later to add new lines; it keeps what
   is already there.
2. Add the language to `LOCALES` in `src/core/I18n.ts`, with its own name for
   itself: `{ code: 'fr', name: 'Français' }`.
3. Fill in lines. An empty line shows in English, so a half-done file works.
4. `node tools/check-i18n.mjs` checks the file (see below) and says how many
   lines are done.

## What a line looks like

Each entry in `strings.json` has a `key`, the `files` it is used in, and
sometimes a `note` from the programmer.

**Plain line.** The key is the English. Translate it as a string.

```json
"Open map": "Ouvrir la carte"
```

**Gaps.** `{0}`, `{1}`... are values the game fills in: a number, a name, a
key. Keep every gap, move them where your language wants them.

```json
"Tier {0}, area {1} of {2}": "Zone {1} sur {2}, palier {0}"
```

**Keycaps.** `{Space}`, `{T}`, `{1}` inside some hints are keys on the
keyboard, not numbered values. The note says so. Keep them as they are.

**Tags.** `<b>`, `<span class="...">`, `<p>` and `&amp;`-style entities must
stay. Translate the words between them.

**Plural lines.** An entry with `one` and `other` is a counted line. Its value
is an object with one string per plural form your language has. The template
fills in the forms for you (French: `one`, `many`, `other`; Polish: `one`,
`few`, `many`, `other`; Japanese: `other` only).

```json
"{0} socket|{0} sockets": { "one": "{0} châsse", "many": "{0} de châsses", "other": "{0} châsses" }
```

**Lines with a context.** A key like `gem name: quality, then stone::{0} {1}`
is a pattern. The part before `::` says what the gaps hold. Change the order
or add words as your language needs: `"{1} {0}"`, `"{1} de qualité {0}"`.
These build names:

- `magic item name: prefix, base, suffix`: "Burning Sword of Frost".
- `rare item name: theme word, then noun`: "Doom Fang".
- `gem name: quality, then stone`: "Flawed Ruby".

**Short words.** `RMB`, `SPC`, `MISS`, `{0}s`, `{0}m` are tiny on screen. Keep
them as short as the English.

## What the checker fails on

- A line that loses or adds a gap or a tag.
- A plural line missing a form your language needs, or with a form it does
  not use.
- A file not listed in `LOCALES`, or a `LOCALES` entry with no file.

Lines the game no longer uses are counted, not failed. Delete them when you
like.

## Seeing it in the game

Settings, Gameplay, Language, then restart. Test builds also offer
"Pseudo (test)": every line accented, a third longer and in brackets. Plain
text there was missed by the programmers; text cut off has no room for longer
languages. Report both.

## Known limits

- Text the game has already saved stays in the language it was made in:
  death records, quest lines already handed out, hero names.
- Names built from parts (magic and rare items, gems) use one pattern each.
  Words do not change for gender or case.
- Most counted lines are plain lines with a gap ("{0} kills"), not plural
  lines. If one reads wrong for 1 or 2 in your language, ask for it to be
  made a plural line.
- The game's fonts have Latin, Greek, Cyrillic and Vietnamese letters, but
  the title font (Cinzel) has Latin only. Anything else falls back to the
  player's own fonts.
