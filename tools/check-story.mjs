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
  ['src/world/DungeonGen.ts', 'planMap(depth, runRng.fork(\'map\'), plan?.biome', 'a contract cannot send the map to its biome'],
  ['src/world/DungeonGen.ts', 'plan?.quest ? plan.quest(biome) : rolledQuest', 'a contract is never carried below'],
  ['src/world/DungeonGen.ts', 'plan?.bossId ?? rolledBoss', 'a contract cannot name its boss'],
  ['src/ui/StoryOverlay.ts', 'installStoryBosses()', 'bosses never speak'],
  ['src/core/Events.ts', 'bossId?: string', 'a boss floor cannot say which boss is on it'],
  ['src/scenes/DungeonScene.ts', 'bossId: this.level.isBossLevel', 'boss floor lore is never shown'],
  ['src/entities/Boss.ts', "events.emit('boss:engaged'", 'a boss fight never starts its speech'],
  ['src/entities/Boss.ts', "events.emit('boss:phase'", 'phase barks are never spoken'],
  ['src/entities/Boss.ts', "events.emit('boss:damaged'", 'a boss never taunts'],
  ['src/entities/Boss.ts', "events.emit('boss:enraged'", 'a boss never loses patience aloud'],
  ['src/entities/Boss.ts', "events.emit('boss:killed'", 'a boss never says its last words'],
  ['src/entities/Player.ts', "events.emit('player:died'", 'a boss never speaks over your body'],
];
HOOKS.push(
  ['src/ui/StoryOverlay.ts', 'installStoryPlaces()', 'places and notes never appear'],
  ['src/scenes/DungeonScene.ts', "events.emit('lore:search', { source: 'bookcase'", 'bookcases never hold a page'],
  ['src/scenes/DungeonScene.ts', "events.emit('lore:search', { source: 'chest'", 'chests never hold a page'],
  ['src/scenes/RunEvents.ts', "events.emit('lore:search', { source: 'fallen'", 'the fallen never carry a page'],
  ['src/ui/Tooltip.ts', 'itemFlavor(item, base?.category)', 'rare and set items show no flavour'],
  ['src/data/uniques.ts', 'applyUniqueText(UNIQUES)', 'uniques keep their old names and lines'],
  ['src/data/sets.ts', 'applySetText(ALL)', 'sets keep their old blurbs'],
  ['src/sim/Quests.ts', "events.emit('story:line'", 'quest whispers are never said'],
  ['src/ui/StoryOverlay.ts', "events.on('story:line'", 'nobody speaks story lines'],
  // Key hints follow the player's rebinding, never a hard-coded letter.
  ['src/ui/DialoguePanel.ts', 'keyFor(`Digit${i + 1}`, save.settings.keybinds)', 'dialogue numbers ignore rebinding'],
  ['src/ui/StoryOverlay.ts', "keyFor('KeyJ', save.settings.keybinds)", 'the card names a fixed journal key'],
  ['src/ui/JournalPanel.ts', "keyFor('KeyE', save.settings.keybinds)", 'the journal names a fixed talk key'],
);
// Every boss event the story speaks on must have a listener in StoryBosses.
for (const ev of ['boss:engaged', 'boss:phase', 'boss:damaged', 'boss:enraged', 'boss:killed', 'player:died']) {
  HOOKS.push(['src/ui/StoryBosses.ts', `events.on('${ev}'`, `nothing is said on ${ev}`]);
}
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
