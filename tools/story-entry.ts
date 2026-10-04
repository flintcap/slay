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
import {
  NPCS,
  NPC_IDS,
  TALK_SPOTS,
  ensureStory,
  fillStory,
  greet,
  hasNews,
  noteDeath,
  revealChaptersUpTo,
  story,
} from '../src/sim/Story';
import type { When } from '../src/data/story/types';
import { getBoss } from '../src/data/bosses';

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
  if (/\{(?!n\}|name\}|class\}|depth\}|best\}|fallen\}|lastFallen\}|lastDepth\})[^}]*\}/.test(text)) fail(`${where}: unknown token in "${text}"`);
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
section('References');

const CLASS_IDS = new Set(['warden', 'pyromancer', 'shadowblade', 'stormcaller', 'revenant', 'ranger']);
const chapterIds = new Set(CHAPTERS.map((c) => c.id));

/** Every id a condition names must exist. Chain refs are checked once chains exist. */
function checkWhen(where: string, w: When | undefined): void {
  if (!w) return;
  for (const k of ['chapter', 'notChapter'] as const) {
    const v = w[k];
    if (v && !chapterIds.has(v)) fail(`${where}: unknown chapter "${v}"`);
  }
  for (const k of ['slain', 'notSlain'] as const) {
    const v = w[k];
    if (v && !getBoss(v)) fail(`${where}: unknown boss "${v}"`);
  }
  if (w.cls && !CLASS_IDS.has(w.cls)) fail(`${where}: unknown class "${w.cls}"`);
  for (const k of ['done', 'notDone', 'active'] as const) {
    const v = w[k];
    if (v) chainRefs.push([where, v]);
  }
  if (w.note) noteRefs.push([where, w.note]);
}
const chainRefs: Array<[string, string]> = [];
const noteRefs: Array<[string, string]> = [];

// ---------------------------------------------------------------------------
section('People');

{
  const lineIds = new Set<string>();
  for (const id of NPC_IDS) {
    const npc = NPCS[id];
    if (npc.id !== id) fail(`npc ${id}: id field is "${npc.id}"`);
    lintText(`npc ${id} portrait`, npc.portrait);
    if (npc.lines.length < 8) fail(`npc ${id}: only ${npc.lines.length} lines`);
    if (npc.topics.length < 2) fail(`npc ${id}: only ${npc.topics.length} topics`);
    if (!npc.lines.some((l) => l.when?.first)) fail(`npc ${id}: no first-meeting line`);
    if (!npc.lines.some((l) => l.when?.after === 'died')) fail(`npc ${id}: no line for after a death`);
    if (!npc.lines.some((l) => l.when?.after === 'cleared')) fail(`npc ${id}: no line for a cleared run`);
    if (npc.lines.filter((l) => !l.when && !l.once).length < 4) fail(`npc ${id}: fewer than four lines of small talk`);
    if (npc.station && !npc.serviceLabel) fail(`npc ${id}: station without a service label`);
    for (const l of [...npc.lines, ...(npc.arrival ?? [])]) {
      if (lineIds.has(l.id)) fail(`npc ${id}: duplicate line id ${l.id}`);
      lineIds.add(l.id);
      lintText(`line ${l.id}`, l.text);
      checkWhen(`line ${l.id}`, l.when);
    }
    const topicIds = new Set<string>();
    for (const t of npc.topics) {
      if (topicIds.has(t.id)) fail(`npc ${id}: duplicate topic ${t.id}`);
      topicIds.add(t.id);
      lintText(`topic ${id}.${t.id} label`, t.label);
      t.text.forEach((x, i) => lintText(`topic ${id}.${t.id}[${i}]`, x));
      checkWhen(`topic ${id}.${t.id}`, t.when);
    }
  }
  const stations = NPC_IDS.map((id) => NPCS[id].station).filter(Boolean);
  if (new Set(stations).size !== stations.length) fail('two people keep the same station');
  for (const id of NPC_IDS) {
    if (!NPCS[id].station && !TALK_SPOTS[id]) fail(`npc ${id}: no station and nowhere to stand`);
  }

  // Play a conversation through: first meeting, then news after a death.
  const acct = save.account as AccountSave;
  delete acct.story;
  for (const id of NPC_IDS) {
    const first = greet(NPCS[id]);
    const expected = NPCS[id].lines.find((l) => l.when?.first)!;
    if (!first || first.startsWith(expected.text.slice(0, 12)) === false) fail(`npc ${id}: first greeting was "${first}"`);
    const second = greet(NPCS[id]);
    if (second === first) fail(`npc ${id}: said the first-meeting line twice`);
  }
  noteDeath(4, 'Tester');
  story().last!.at = Date.now() + 1000;
  for (const id of NPC_IDS) {
    if (!hasNews(NPCS[id])) fail(`npc ${id}: no news after a death`);
    const line = greet(NPCS[id]);
    const died = NPCS[id].lines.find((l) => l.when?.after === 'died')!;
    if (!line.startsWith(fillStory(died.text).slice(0, 10))) fail(`npc ${id}: after a death said "${line}"`);
  }
  delete acct.story;
  console.log(`${NPC_IDS.length} people, ${lineIds.size} lines`);
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\nFAILED: ${failures.length} problem(s).`);
  (globalThis as unknown as { process: { exit(c: number): void } }).process.exit(1);
}
console.log('OK: the story holds together.');
