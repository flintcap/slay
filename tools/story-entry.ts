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
import { getBoss, pickBossForDepth } from '../src/data/bosses';
import { CHAINS, chainQuestId } from '../src/data/story/chains';
import { QUESTS, questById } from '../src/data/quests';
import {
  acceptStep,
  carriedContract,
  installChains,
  noteQuestComplete,
  offerFor,
  stepState,
  turnInStep,
} from '../src/sim/Chains';
import { holds } from '../src/sim/Story';
import { onKill } from '../src/sim/Quests';
import { createCharacter } from '../src/sim/Character';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { BIOMES } from '../src/world/Biomes';
import { familiesAtDepth, getMonster, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';

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
section('Contracts');

setMonsterCatalog({
  pick: (depth, biome, rng, count) => pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id),
  affixes: (depth, rng, count) => {
    const pool = MONSTER_AFFIXES.filter((a) => a.minDepth <= depth);
    const out: string[] = [];
    for (let i = 0; i < count && pool.length; i++) out.push(rng.pick(pool).id);
    return out;
  },
  bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
});

{
  // Shrines only: a floor whose layout has few rooms can come out with no chest.
  const CLEANSE_PROPS = new Set(['shrine']);
  const ids = new Set<string>();
  let steps = 0;
  for (const chain of CHAINS) {
    if (ids.has(chain.id)) fail(`chain ${chain.id}: duplicate id`);
    ids.add(chain.id);
    if (!NPCS[chain.giver]) fail(`chain ${chain.id}: unknown giver ${chain.giver}`);
    if (chain.steps.length < 3) fail(`chain ${chain.id}: only ${chain.steps.length} steps`);
    lintText(`chain ${chain.id} name`, chain.name);
    lintText(`chain ${chain.id} blurb`, chain.blurb);
    checkWhen(`chain ${chain.id}`, chain.when);
    let last = 0;
    chain.steps.forEach((step, i) => {
      steps++;
      const where = `chain ${chain.id}[${i}] ${step.title}`;
      if (step.minDepth < last) fail(`${where}: tier ${step.minDepth} is shallower than the step before`);
      last = step.minDepth;
      if (step.giver && !NPCS[step.giver]) fail(`${where}: unknown giver ${step.giver}`);
      checkWhen(where, step.when);
      const biome = BIOMES.find((b) => b.id === step.biome);
      if (!biome) fail(`${where}: unknown biome ${step.biome}`);
      else if (biome.minDepth > step.minDepth) fail(`${where}: ${step.biome} does not open until tier ${biome.minDepth}`);
      if (step.boss) {
        const b = getBoss(step.boss);
        if (!b) fail(`${where}: unknown boss ${step.boss}`);
        else {
          if (b.minDepth > step.minDepth) fail(`${where}: ${step.boss} does not appear until tier ${b.minDepth}`);
          if (!b.biomes.includes(step.biome)) fail(`${where}: ${step.boss} does not live in ${step.biome}`);
        }
        if (!step.objectives.some((o) => o.kind === 'boss' && o.filter === `boss:${step.boss}`)) {
          fail(`${where}: names a boss but has no objective to kill it`);
        }
      }
      for (const o of step.objectives) {
        lintText(`${where} objective`, o.desc);
        const [key, value] = (o.filter ?? '').split(':');
        if (o.kind === 'slay') {
          if (o.filter !== 'any' && key !== 'family') fail(`${where}: slay filter "${o.filter}" is not counted by the dungeon`);
          if (key === 'family') {
            for (const d of [step.minDepth, step.minDepth + 8]) {
              if (!familiesAtDepth(d, step.biome).includes(value as never)) fail(`${where}: no ${value} in ${step.biome} at tier ${d}`);
            }
          }
        } else if (o.kind === 'slayElite') {
          if (o.filter) fail(`${where}: slayElite filters are not needed and not checked`);
        } else if (o.kind === 'cleanse') {
          if (key !== 'prop' || !CLEANSE_PROPS.has(value!)) fail(`${where}: cleanse "${o.filter}" is not something a floor reliably has`);
        } else if (o.kind === 'boss') {
          if (o.filter !== `boss:${step.boss}`) fail(`${where}: boss objective "${o.filter}" does not match the step's boss`);
        } else if (o.kind === 'survive') {
          if (o.filter !== 'zone:any') fail(`${where}: survive "${o.filter}" is never ticked by the dungeon`);
        } else {
          fail(`${where}: objective kind ${o.kind} is never counted by the dungeon`);
        }
        if (o.n < 1) fail(`${where}: target ${o.n}`);
      }
      for (const t of [...step.offer, ...step.turnIn, step.flavor, step.brief, step.ready, step.outcome]) lintText(where, t);
      const def = questById(chainQuestId(chain.id, i));
      if (!def || def.weight !== 0) fail(`${where}: no zero-weight quest definition`);
      if (QUESTS.some((q) => q.id === chainQuestId(chain.id, i))) fail(`${where}: leaked into the random quest pool`);
    });
  }

  // Play every step through the real world generator with the director in.
  const acct = save.account as AccountSave;
  installChains();
  let runs = 0;
  for (const chain of CHAINS) {
    chain.steps.forEach((step, i) => {
      const where = `chain ${chain.id}[${i}] ${step.title}`;
      for (const offset of [0, 7]) {
        for (let seed = 1; seed <= 4; seed++) {
          delete acct.story;
          story().chains[chain.id] = { step: i, state: 'active' };
          const depth = step.minDepth + offset;
          const run = generateRun(depth, 0x5eed + seed * 7919 + i * 31, 'warden');
          runs++;
          const tag = `${where} @ tier ${depth}, seed ${seed}`;
          if (run.biome !== step.biome) fail(`${tag}: stair opened on ${run.biome}`);
          if (step.boss && run.bossId !== step.boss) fail(`${tag}: boss is ${run.bossId}`);
          if (run.quest.defId !== chainQuestId(chain.id, i)) fail(`${tag}: run carries ${run.quest.defId}`);
          if (carriedContract()?.chain.id !== chain.id) fail(`${tag}: carried contract not recorded`);

          let total = 0;
          let elites = 0;
          let shrines = 0;
          let chests = 0;
          const fam: Record<string, number> = {};
          for (const lvl of run.levels) {
            for (const sp of lvl.spawns) {
              const m = getMonster(sp.monsterId);
              if (!m) continue;
              total++;
              fam[m.family] = (fam[m.family] ?? 0) + 1;
              if (sp.rank !== 'normal') elites++;
            }
            for (const p of lvl.props) {
              const fam0 = (p.interact ?? '').split('.')[0];
              if (fam0 === 'shrine') shrines++;
              if (fam0 === 'chest') chests++;
            }
          }
          for (const o of run.quest.objectives) {
            const [key, value] = (o.filter ?? '').split(':');
            let have = Infinity;
            if (o.kind === 'slay') have = key === 'family' ? fam[value!] ?? 0 : total;
            if (o.kind === 'slayElite') have = elites;
            if (o.kind === 'cleanse') have = value === 'shrine' ? shrines : chests;
            // Room to miss some: a contract should not need every last one.
            const need = o.kind === 'slay' || o.kind === 'slayElite' ? Math.ceil(o.target * 1.25) : o.target;
            if (have < need) fail(`${tag}: "${o.desc}" needs ${o.target}, floor has ${have}`);
          }
        }
      }
    });
  }
  delete acct.story;
  // Without an open contract the generator must behave exactly as before.
  const a = generateRun(6, 1234, 'warden');
  if (carriedContract()) fail('director: a run with no open contract still carried one');
  if (a.quest.defId.startsWith('story.')) fail('director: a run with no open contract carried a contract quest');
  console.log(`${CHAINS.length} chains, ${steps} contracts, ${runs} generated runs`);
}

// The whole loop, as a player meets it: offered, taken, carried down, done,
// handed in, paid, and the next step offered.
{
  const g = globalThis as unknown as Record<string, unknown>;
  g.window ??= { setTimeout: () => 0, clearTimeout: () => undefined };
  g.localStorage ??= { getItem: () => null, setItem: () => undefined };
  const acct = save.account as AccountSave;
  delete acct.story;
  const c = createCharacter('Tester', 'warden', new Random(7));
  save.setCharacter(c);
  const renn = NPCS.renn;
  const offer = offerFor(renn);
  if (!offer || offer.chain.id !== 'renn' || offer.index !== 0) fail('loop: Renn does not offer her first contract');
  else {
    acceptStep(offer.chain);
    if (offerFor(renn)) fail('loop: a taken contract is still on offer');
    const run = generateRun(1, 99, 'warden');
    if (run.quest.defId !== chainQuestId('renn', 0)) fail('loop: the descent did not carry the contract');
    for (let i = 0; i < 40; i++) onKill(run.quest, 'x', 'undead', 'normal');
    if (!run.quest.complete) fail('loop: thirty kills did not complete Roster Duty');
    events.emit('quest:complete', { name: run.quest.name });
    // The UI listener is not installed here; do what it does.
    noteQuestComplete();
    if (stepState(offer.chain, 0) !== 'ready') fail('loop: the step is not ready after its quest completed');
    const gold = c.gold;
    const paid = turnInStep(offer.chain);
    if (!paid || c.gold !== gold + paid.gold || paid.gold <= 0) fail('loop: hand-in did not pay');
    if (stepState(offer.chain, 0) !== 'done') fail('loop: hand-in did not move the chain on');
    const next = offerFor(renn);
    if (!next || next.index !== 1) fail('loop: the next step was not offered');
    if (!holds({ done: 'renn:0' }) || holds({ done: 'renn:1' })) fail('loop: done conditions read the chain wrong');
  }
  save.setCharacter(null);
  delete acct.story;
}

for (const [where, ref] of chainRefs) {
  const [id, n] = ref.split(':');
  const chain = CHAINS.find((c) => c.id === id);
  if (!chain) fail(`${where}: unknown chain "${id}"`);
  else if (n !== undefined && !chain.steps[Number(n)]) fail(`${where}: chain ${id} has no step ${n}`);
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\nFAILED: ${failures.length} problem(s).`);
  (globalThis as unknown as { process: { exit(c: number): void } }).process.exit(1);
}
console.log('OK: the story holds together.');
