# CLAUDE.md

## Response Style

Talk to me like I am smart but not technical. Sixth-grade reading level. Short sentences. Plain words.

### Structure every reply this way

1. The answer. One or two lines. What happened, or what I asked for. Nothing else first.
2. The details. Bullet points only. One idea per bullet. One line per bullet.
3. What I need to do. Only if I actually need to do something. Say it as a direct instruction: "Click X" or "Tell me if you want Y."
4. Also found (optional). If you learned other things while working, list them here as bullets at the very bottom. One line each. Then stop. Do not explain them. Let me ask if I want more.

### Rules

- Never start with a preamble. No "Great question," no "I've gone ahead and," no restating what I asked.
- Never narrate your process. I don't need to know which files you opened or what you tried first.
- No em dashes. Ever.
- One topic per reply. If you have to cover a second topic, put it under "Also found" and keep it to one line.
- No jargon. If a technical word is unavoidable, add a four-word plain-English tag after it.
- Skip the closing offer of more help unless there is a real decision only I can make.
- Do not pad. If the answer is one sentence, send one sentence.

### When you have a question for me

- Ask one question at a time.
- Give me the options as bullets.
- Tell me which one you recommend and why, in one line.

### When something goes wrong

- Say what broke in one line.
- Say what it means for me in one line.
- Say what you want to do next in one line.
- Do not paste error logs unless I ask.

### When I ask for real writing

Long is fine for drafts, scripts, posts, and documents. This whole style guide is about how you talk to me in chat, not about the work itself.

## Owner preferences

- When I ask for something "like" or "in the style of" another game, do not copy it 1:1. Use the same idea and theme, but make it our own: our own names, our own art, our own numbers.
- Every skill must get stronger with each rank (damage, strength, time, size), not only cheaper or faster. New skills go through `src/data/skillPower.ts` and `node tools/check-rankpower.mjs`.
- Caster weapons (wands, staffs, orbs) have no basic attack. A caster's attacks come only from spells.
- Always use the newest versions of everything: packages, Node, three.js and the test browser. Never write code to work around old browsers or old versions. Before browser checks, run `node tools/get-chrome.mjs` so the tools test with the newest Chrome.

## Project

SLAY is an endless dungeon RPG roguelike in Three.js. Models, props and effects
are built in code. Free CC0 textures and sounds are allowed under
`public/assets/`, each one listed in `ASSETS.md`.

The remake plan lives in `docs/remake/` (start with `PLAN.md`).

- `src/types.ts` holds every shared data shape. Read it before changing anything cross-cutting.
- `CONTRACTS.md` documents the function signatures modules expose to each other.
- All randomness goes through seeded streams in `src/core/RNG.ts`. Never `Math.random`.
- `npm run typecheck` must stay at zero errors.
- `node tools/screenshot.mjs --out=shots --shots=town,dungeon` renders real frames from the `npm run build` output. A first level takes minutes under software rendering.
- `node tools/run-checks.mjs` runs the fast checkers (`--only=a,b` for some). Browser checks (`check-perf`, `check-skills`, `check-soak`) run one at a time, each inside `timeout`.
- `node tools/bundle-artifact.mjs` builds the one-page artifact (`dist-single/slay.html`) and the list of files to publish beside it (`dist-single/files.json`).
