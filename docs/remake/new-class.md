# Adding a class: every place it touches

Shared by the `paladin` and `shapeshifter` streams. The Mage was the last
class added (git log: "Fold Pyromancer and Stormcaller into the Mage") and is
the best model to copy the *shape* of, never the content.

## Rules

- All new content is NEW: names, numbers, art, motion, sound. Nothing copied
  from another class, and nothing copied 1:1 from another game (owner's rule
  in `CLAUDE.md`: take the idea, make it ours).
- Every active skill has its own gesture, its own VFX look and its own sound.
  No skill may share any of the three with any other skill in the game.
- Sounds are real CC0 recordings layered into takes (see below). Dark, gritty,
  physical, medieval. No sci-fi zaps, synth sweeps or lasers.
- Balance: make the class strong enough to pass `check-curve` at every depth.
  Never make monsters weaker or fewer.
- All randomness through `src/core/RNG.ts`.
- Keep your content in NEW files wherever you can and hook it in with one
  line, because the other class stream edits the same shared files at the
  same time. Suggested: `src/data/classSkills/<class>.ts` (skills, trees,
  synergies, spread into `skills.ts`), `src/sim/passives/<class>.ts` (spread
  into `RULES`), `src/art/hero/gestures/<class>.ts`, icon and sound tables
  spread into `ICON_MAP` / `SKILL_SOUNDS`. On a rebase conflict keep both
  sides.

## Checklist (grep `revenant` or `mage` to find each one)

Data and rules
- `src/types.ts` `CharClassId`.
- `src/data/classes.ts`: the class def (name, title, color, stats, trees,
  weapons), `STARTING_SKILL_HINTS`, `CLASS_TAGLINES`, `migrateClassId` stays.
- `src/data/skills.ts`: `SKILL_TREES` (3 trees, `classId`), the skills
  (6 tiers, 18 per tree like the Mage's Cold tree, mix of actives and
  passives, one capstone at tier 6 column 0), synergies.
- `src/sim/Passives.ts` `RULES` for every passive (check-passives fails on a
  passive with no rule).
- `src/scenes/SkillRunner.ts`: `SKILL_STATUS`, `SELF_BUFF_STATUS`,
  `TREE_SCHOOL`, and new handler families if the class needs them (an aura,
  a transform). Add new families to `HANDLED` in `tools/check-coverage.mjs`
  and to `HANDLER_CLIP`/`bodyClip` if the branch picks its own clip.
- `src/data/statuses.ts` for any new status.
- `src/sim/Character.ts` `STARTING_SKILL`.
- `src/data/itemBases.ts`: class weights, and `classes:` on class-only
  bases if you add any.
- `src/entities/Combos.ts`: the class combo.

Look
- `src/art/hero/Looks.ts`: a MALE look (shape, face, hair, beard, skin,
  stoop). See `docs/remake/heroes.md` "Design".
- `src/scenes/FieldKit.ts`: the class-select outfit.
- `src/scenes/HeroModel.ts` `flourishClip`.
- `src/art/Portraits.ts`.
- `src/art/SkillIconArt.ts`: `CLASS_LOOK` and one `ICON_MAP` entry per
  skill. Render the tree's icons and Read them.
- `src/art/hero/gestures/<class>.ts`: one gesture per active skill.

Words
- `src/ui/CharSelectPanel.ts`: playstyle, role line, complexity.
- `src/sim/Story.ts` `CLASS_NAMES`; `src/data/story/npcs.ts` class lines;
  `src/data/story/uniqueText.ts` if it names classes.

Sound
- `src/audio/SkillSounds.ts` one row per active skill (`cast`, `hit` only
  when the family plays a hit, `minion` for summons).
- `tools/audio/recipe.mjs` `SKILL_TAKES`, built with
  `node tools/build-audio.mjs --only=skill.<prefix>.`. Packs live in
  `/tmp/slay-downloads/audio` (fetch more CC0 packs the same way the audio
  stream did, see `docs/remake/audio.md`). The build rewrites the whole
  ASSETS.md order: `git checkout ASSETS.md` after it and insert only your new
  rows by hand. `tools/audio/ledger.json` and `src/audio/manifest.ts` update.
  A teleport/blink cast must be under 0.4 s.

Tools (class lists)
- grep `tools/` for `'revenant'` and add the class wherever all classes are
  listed (check-skills, check-roster, check-flow, curve-entry, economy-entry,
  hero-page, models-page, screenshot, shoot-gear, art-sheet-page, ...).

## Checks

Cheap first: `npx tsc --noEmit -p tsconfig.json`, then
`node tools/run-checks.mjs --only=passives,skilldepth,starter,starter-power,save,hotbar,story,wiring,skillsound,hits,vfx,curve,roster`
(curve: your class must pass at every depth). `node tools/check-coverage.mjs`
(your class: 0 generic fallback, every active skill unique). Browser, once
per milestone at most:
`npm run build && flock /tmp/slay-browser.lock timeout 1500 node tools/check-skills.mjs --classes=<id>`
and a screenshot of the class select:
`SLAY_PORT=<port> flock /tmp/slay-browser.lock timeout 1500 node tools/screenshot.mjs --out=shots/<stream> --shots=town`.
