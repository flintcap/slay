# Stream: anims (every skill 1 of 1)

Status: done
Port: SLAY_PORT=4341

## Goal

The owner: "ALL skills in game need to be unique and 1 of 1." Every active
skill of every class has its own body motion **and** its own look (VFX).
No two skills in the whole game may share a gesture, and no two may share a
visual effect. If two skills share one, make a NEW one for one of them. The
Mage already has 33 unique gestures (`src/art/hero/gestures/mage.ts`); its
VFX still need the uniqueness pass.

Quality bar: AAA, dark and gritty (Diablo II / Path of Exile feel, our own
take). A gesture must read in one glance from the game camera: wind-up,
release, follow-through, weight in the legs. Weapons stay in believable
grips: no blade through the head, no staff through the floor, a shield arm
that still looks like it holds a shield.

## How gestures work

- `src/art/hero/SkillActions.ts`: how a gesture is written (`G`, `Spec`,
  key poses in plain words, presets `PUSH UP DOWN OUT CROSS`, `step()`).
- One file per class in `src/art/hero/gestures/<class>.ts`, each ending in
  `defineGestures({...})`, loaded by `gestures/index.ts`. Add
  `knight.ts` (class id `warden`), `rogue.ts` (`shadowblade`), `ranger.ts`,
  `revenant.ts`.
- `clipFor` / `bodyClip` in `src/scenes/SkillRunner.ts` already prefer a
  skill's own gesture, including in handler branches that pick their own clip.
  Exception: `dash` plays the dodge; a dash skill needs its own gesture, so
  give the dash branch the same `own ?? ...` treatment (play the gesture, then
  move) and update `bodyClip`.
- Melee gestures must work for the weapons the class actually uses. Render
  with `--weapon=` (see `tools/hero-page.ts` `actions`). A melee gesture's
  contact frame is when damage lands: keep `contact` honest.
- Render sheets (one browser run at a time, the lock is shared by everyone):
  `flock /tmp/slay-browser.lock timeout 900 node tools/hero-sheet.mjs actions --class=<id> --actions=skill.a,skill.b,... --out=shots/heroes`
  Then crop with `convert shots/heroes/actions.png -crop 1680x1800 -resize 65% <scratch>/x%d.png`
  and Read the crops. About 6 actions per sheet stays readable.

## How VFX uniqueness works

- `node tools/check-coverage.mjs` prints "shared animations, per class" and
  "identical visual signatures". Extend it (or add `tools/check-unique.mjs`
  and register it in `tools/run-checks.mjs`) so it fails when, across the
  WHOLE game (all classes, including new ones other streams add), any two
  active skills share a body clip, or share a visual signature. Make the
  signature honest: the effect handler family plus what it actually draws
  (emitter, trail, shape/mesh, colour, size). Two novas that differ only by a
  hue shift count as the same; give one a new shape or motion.
- Add new effect drawings in the VFX code (`src/fx/Effects.ts` and its
  neighbours in `src/fx/`) rather than retuning numbers only. Every
  school must still read as its school.
- Sounds: `check-skillsound` must stay green. If two skills share a sound
  file, give one a new take (`tools/audio/recipe.mjs`, see the Mage cold
  takes; build with `node tools/build-audio.mjs --only=<prefix>`; the build
  rewrites ASSETS.md order, so restore it with git and insert only new rows).

## Milestones

- [x] M1 Uniqueness check that fails on any shared clip or VFX signature, game-wide. (Add a game-wide uniqueness check for clips, looks and sounds)
- [x] M2 Knight: a gesture per active skill (sword+shield and two-hander both read). (Give every Knight skill its own gesture)
- [x] M3 Rogue: a gesture per active skill (daggers / dual blades). (Give every Rogue skill its own gesture)
- [x] M4 Ranger: a gesture per active skill (bow skills are draws, but each different). (Give every Ranger skill its own gesture)
- [x] M5 Revenant: a gesture per active skill (caster with a wand/staff). (Give every Revenant skill its own gesture)
- [x] M6 VFX: every active skill game-wide has its own visual signature (Mage included). (Every active skill draws its own motif: a shape in a motion over its family look)
- [x] M7 Sounds: no two skills share a sound file. (Every active skill has its own sound: 27 new takes for skills that shared one)
- [x] M8 Final: uniqueness check green for the existing 5 classes, in-game skill check green. (check-unique green for all seven classes; check-skills dropped by owner request after Knight, Rogue and Ranger passed)

## Checks for this stream

`npx tsc --noEmit -p tsconfig.json`, `node tools/check-coverage.mjs`, your
uniqueness check, `node tools/run-checks.mjs --only=skillsound,hits,vfx,wiring`,
and once at the end
`npm run build && flock /tmp/slay-browser.lock timeout 1500 node tools/check-skills.mjs --classes=warden,shadowblade,ranger,revenant,mage`.

## Shared files

The paladin and shapeshifter streams edit `SkillRunner.ts`, `SkillIconArt.ts`,
`SkillSounds.ts`, `recipe.mjs`, `ASSETS.md` and the audio manifest at the
same time. Keep edits to those small and additive; on a rebase conflict keep
both sides. Their classes must also pass your uniqueness check; if your check
lands first and their in-progress class has no gestures yet, report their
skills as "pending" rather than failing (a class with zero gestures is
pending; a class with some gestures must be fully unique).

## Next up

Nothing: the stream is done. See Handover.

## Handover

What exists now:

- Every active skill of all seven classes is one of one: its own gesture, its own look (family drawing plus a motif) and its own sound. `node tools/check-unique.mjs` proves it and runs in `run-checks` as `unique`. Counts: warden 25, mage 33, shadowblade 23, revenant 30, ranger 22 (this stream), shapeshifter 26 and paladin 32 (their streams).
- Gestures: `src/art/hero/gestures/{knight,rogue,ranger,revenant}.ts` (mage was already done).
- Motifs: `src/fx/Motifs.ts` (76 shapes, 25 motions), drawn by `EffectSystem.motif` in `src/fx/Effects.ts`, chosen per skill in `SKILL_MOTIFS` (`src/fx/SkillLooks.ts`), fired from `SkillRunner.drawMotif`. New drawings: 12 glyph core styles (`kit/Shapes.ts`), 7 solids (`kit/Solids.ts`), 6 `puff.*` bursts (`kit/Emitters.ts`). check-vfx fails if a motif names a missing emitter or mark.
- Sounds: 27 new CC0 takes (`tools/audio/recipe.mjs`, the "one of one" block), mapped in `src/audio/SkillSounds.ts`, listed in ASSETS.md.
- Look pass: all 133 motifs of the five classes were rendered and the weak ones fixed (slashes, puffs, embers, fangs).

M8 in-game check (`check-skills`): Knight 25 of 25, Rogue 23 of 23, Ranger 22 of 22 working (buffs are visual only, as they should be). The five-class run did not fit its 1500 s cap; the Revenant run hit the cap and the browser closed under it; the Mage run was stopped. The owner then dropped check-skills; M8 counts on check-unique.

Left for `finish`:

- Run `check-skills` for revenant and mage one class at a time with a longer cap (revenant needs more than 1500 s here).
- Fast checks failing on the shared branch, not from this stream: beats (paladin consecratedGround), curve, sweep (paladin rites refused; reassemble was fixed upstream after), town (gamble offers a weapon the class cannot use).

## Notes for resume

- `node tools/check-unique.mjs [--list]` (entry `tools/unique-entry.ts`) is the uniqueness check. It fails on shared clips, visual signatures or sound files, and on skills with no gesture. Classes outside the five are pending until they have one gesture / one motif.
- Gesture spec additions (SkillActions.ts): `hit` + `side` make a weapon blow (event 'hit', damage waits for it via `Player.contactDelay` / `strikesAt`), `grip` keeps both hands on a haft, `alt.<MoveKind>` gives one weapon its own keys, `reach()` places a weapon hand in metres. Dash skills play their own gesture (`Player.dodge(..., clip)`); with two blades a skill's own gesture skips the off-hand `attack2` blow.
- Render sheets: `SLAY_PORT=4341 flock /tmp/slay-browser.lock timeout 900 node tools/hero-sheet.mjs actions --class=<id> [--stance=twoHand] --front=1 --actions=skill.a,... --out=shots/anims/<x>` (47 s for 25 rows; `--front` drops the top view). Crop with `convert ... -crop 1680x1500 +repage -resize 45%`.
- Visual signatures come from `src/fx/SkillLooks.ts`: the family drawing plus a per-skill motif (`SKILL_MOTIFS`). A motif is a shape in a motion (`src/fx/Motifs.ts`: `MOTIF_SHAPES`, `MOTIF_MOTIONS`), drawn by `EffectSystem.motif` (pieces are `K.Mote` records) from `SkillRunner.drawMotif`, at the caster, the target or in front (`motifAt`), timed to the blow or release. New drawings: 12 glyph core styles in `kit/Shapes.ts` (skull, rune, crescent, star, ring, eye, petal, smoke, cross, hex, claw, heart) and 7 solids in `kit/Solids.ts` (blade, thorn, crystal, cinder, fang, saw, feather). `check-unique` also fails if two skills share a motif pair.
- Sounds: new ids built one `--only=<id>` at a time; the packs `spark`, `steam`, `bones`, `bonebreak` are not in /tmp/slay-downloads here, so new takes avoid them. ASSETS.md: restore HEAD order and insert only the new rows after the last `sounds/skill.` row.
- Two-blade skills with their own gesture fire `HeroAnimator.strike(clip, 'L')` at the off-hand contact, so the off blade trails and `check-hits` sees a left swing.
