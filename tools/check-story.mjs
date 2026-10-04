/**
 * Does the story hold together?
 *
 *   node tools/check-story.mjs
 *
 * Bundles tools/story-entry.ts with the real game data and runs it. The entry
 * checks every id the story references, every chapter, every person's lines,
 * every boss's voice, and plays every contract through the real world
 * generator to prove it can be finished. Exit code 1 on any failure.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// --- static wiring: a line nobody can see does not count ------------------
// Each hook is a small edit in a file another stream owns. If someone rewrites
// that file and drops the hook, the story silently stops reaching the screen,
// so the hooks are checked here by name.
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const HOOKS = [
  ['src/main.ts', 'installStory()', 'the story layer is never installed'],
  ['src/ui/UIRoot.ts', "['journal', journalPanel", 'the journal panel is not registered'],
  ['src/ui/UIRoot.ts', "KeyJ: 'journal'", 'J does not open the journal'],
  ['src/ui/UIRoot.ts', "['dialogue', dialoguePanel", 'the dialogue panel is not registered'],
  ['src/scenes/TownScene.ts', 'openDialogueFor(best.id)', 'pressing E at a keeper does not start a conversation'],
  ['src/scenes/TownScene.ts', 'storyTalkSpots(spots)', 'the townsfolk without a station cannot be talked to'],
  ['src/world/DungeonGen.ts', 'plan?.biome ?? rolledBiome', 'a contract cannot send the stair to its biome'],
  ['src/world/DungeonGen.ts', 'plan?.quest ? plan.quest(biome) : rolledQuest', 'a contract is never carried below'],
  ['src/world/DungeonGen.ts', 'plan?.bossId ?? rolledBoss', 'a contract cannot name its boss'],
];
const STATIONS = ['vendor', 'blacksmith', 'alchemist', 'stash', 'memorial'];
const wiring = [];
for (const [file, needle, why] of HOOKS) {
  if (!read(file).includes(needle)) wiring.push(`${file}: missing \`${needle}\` (${why})`);
}
const town = read('src/scenes/TownScene.ts');
for (const s of STATIONS) {
  if (!town.includes(`id: '${s}'`)) wiring.push(`TownScene has no '${s}' interaction for its keeper to stand at`);
}
console.log('== Wiring');
console.log(wiring.length ? wiring.map((w) => `FAIL  ${w}`).join('\n') : `${HOOKS.length + STATIONS.length} hooks in place`);

const OUT = path.join(ROOT, '.storyaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/story-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
let raw = '';
let code = 0;
try {
  raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
} catch (err) {
  raw = String(err.stdout ?? '') + String(err.stderr ?? '');
  code = 1;
}
rmSync(OUT, { recursive: true, force: true });
process.stdout.write(raw);
if (wiring.length) console.log(`\nFAILED: ${wiring.length} wiring problem(s) above.`);
process.exit(code || (wiring.length ? 1 : 0));
