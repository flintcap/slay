/**
 * Entry point for `tools/check-story.mjs`.
 *
 * Every check pushes a failure string; the process exits 1 if there are any.
 * The sections grow with the story: chapters, people, contracts, bosses,
 * notes and flavour each get their own block below.
 */
import type { AccountSave } from '../src/types';
import { save } from '../src/core/Save';
import { CHAPTERS, chaptersUpTo, deepLedger, isLedgerTier, chapterById } from '../src/data/story/premise';
import { ensureStory, revealChaptersUpTo, story } from '../src/sim/Story';

const failures: string[] = [];
const fail = (msg: string): void => {
  failures.push(msg);
};
const section = (name: string): void => console.log(`\n== ${name}`);

/** House style for anything a player reads. */
function lintText(where: string, text: string): void {
  if (!text || !text.trim()) fail(`${where}: empty text`);
  if (/\s{2,}/.test(text.replace(/\n/g, ' '))) fail(`${where}: double space`);
  if (/\b(okay|OK|gonna|wanna|awesome|cool)\b/.test(text)) fail(`${where}: modern idiom in "${text.slice(0, 50)}"`);
  if (/\{(?!n\}|name\}|class\}|depth\}|best\}|fallen\}|lastFallen\})[^}]*\}/.test(text)) fail(`${where}: unknown token in "${text}"`);
  if (/[“”]/.test(text)) fail(`${where}: curly quotes belong to the UI, not the text`);
}

// ---------------------------------------------------------------------------
section('Chapters');

{
  const ids = new Set<string>();
  let lastDepth = -1;
  for (const ch of CHAPTERS) {
    if (ids.has(ch.id)) fail(`chapter ${ch.id}: duplicate id`);
    ids.add(ch.id);
    if (ch.depth <= lastDepth) fail(`chapter ${ch.id}: depth ${ch.depth} not after ${lastDepth}`);
    lastDepth = ch.depth;
    if (ch.text.length === 0) fail(`chapter ${ch.id}: no text`);
    lintText(`chapter ${ch.id} title`, ch.title);
    ch.text.forEach((t, i) => lintText(`chapter ${ch.id}[${i}]`, t));
    if (chapterById(ch.id) !== ch) fail(`chapter ${ch.id}: lookup does not round-trip`);
  }
  if (CHAPTERS[0]?.depth !== 0) fail('the first chapter must be the first night in camp (depth 0)');

  // The Deep Ledger has to hold at any depth: deterministic, findable by id,
  // and present at regular intervals forever.
  const ledgerTiers = chaptersUpTo(1000).filter((c) => c.id.startsWith('ledger.'));
  if (ledgerTiers.length < 30) fail(`deep ledger: only ${ledgerTiers.length} entries by tier 1000`);
  for (const t of [120, 500, 940, 10000]) {
    if (!isLedgerTier(t)) fail(`deep ledger: tier ${t} expected to carry an entry`);
    const a = deepLedger(t);
    const b = deepLedger(t);
    if (a.text.join('|') !== b.text.join('|')) fail(`deep ledger: tier ${t} is not deterministic`);
    if (chapterById(a.id)?.text.join('|') !== a.text.join('|')) fail(`deep ledger: ${a.id} does not round-trip`);
    a.text.forEach((x, i) => lintText(`ledger ${t}[${i}]`, x));
  }
  const distinct = new Set(ledgerTiers.map((c) => c.text.join('|')));
  if (distinct.size < ledgerTiers.length * 0.9) fail(`deep ledger: too many repeats (${distinct.size}/${ledgerTiers.length})`);
  console.log(`${CHAPTERS.length} chapters, ledger every 20 tiers past ${CHAPTERS[CHAPTERS.length - 1]!.depth}`);
}

// ---------------------------------------------------------------------------
section('Save migration');

{
  const acct = save.account as AccountSave;
  // A save from before the story existed.
  delete acct.story;
  const s = ensureStory(acct);
  if (!acct.story || s.chapters.length !== 0) fail('migration: missing story block not created clean');

  // A damaged block keeps what it can.
  (acct as unknown as { story: unknown }).story = {
    chapters: ['ch.first', 7, 'ch.first'],
    chains: { 'x': { step: 2, state: 'nonsense' }, 'y': { step: -1 } },
    talked: { hesk: 5, bad: 'x' },
  };
  const r = ensureStory(acct);
  if (r.chapters.length !== 1) fail('migration: chapters not cleaned');
  if (r.chains.x?.state !== 'idle' || r.chains.y) fail('migration: chains not cleaned');
  if (r.talked.hesk !== 5 || 'bad' in r.talked) fail('migration: talked not cleaned');
  if (ensureStory(acct) !== r) fail('migration: a sound block should pass through untouched');

  // Revealing is once per account.
  delete acct.story;
  const first = revealChaptersUpTo(5);
  const again = revealChaptersUpTo(5);
  if (first.length !== CHAPTERS.filter((c) => c.depth <= 5).length) fail('reveal: wrong count at tier 5');
  if (again.length !== 0) fail('reveal: chapters revealed twice');
  if (story().chapters.length !== first.length) fail('reveal: not recorded');
  delete acct.story;
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\nFAILED: ${failures.length} problem(s).`);
  (globalThis as unknown as { process: { exit(c: number): void } }).process.exit(1);
}
console.log('OK: the story holds together.');
