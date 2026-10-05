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
  bossIdByName,
  floorNoteId,
  noteBossFloor,
  noteBossMet,
  noteBossSlain,
  tauntMood,
  searchForNote,
  notesFindable,
  enterBiome,
} from '../src/sim/Story';
import { NOTES, noteById } from '../src/data/story/notes';
import { PLACES } from '../src/data/story/places';
import { RARE_FLAVOR, itemFlavor } from '../src/data/story/itemFlavor';
import { UNIQUES } from '../src/data/uniques';
import { SETS } from '../src/data/sets';
import { setRunDirector } from '../src/world/DungeonGen';
import type { When } from '../src/data/story/types';
import { BOSSES, getBoss, pickBossForDepth } from '../src/data/bosses';
import { BOSS_VOICES } from '../src/data/story/bossVoices';
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
  if (/[—–]/.test(text)) fail(`${where}: no dashes in the writing; use a full stop or a comma`);
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
section('Bosses');

{
  const names = new Set<string>();
  for (const b of BOSSES) {
    if (names.has(b.name)) fail(`boss ${b.id}: name "${b.name}" is shared, so its events cannot be told apart`);
    names.add(b.name);
    if (bossIdByName(b.name) !== b.id) fail(`boss ${b.id}: name does not map back to its id`);
    const v = BOSS_VOICES[b.id];
    if (!v) {
      fail(`boss ${b.id}: no voice in data/story/bossVoices.ts`);
      continue;
    }
    const where = `boss ${b.id}`;
    const lines: Array<[string, string]> = [
      ['greet', v.greet],
      ['taunt ahead', v.taunts.ahead],
      ['taunt even', v.taunts.even],
      ['taunt behind', v.taunts.behind],
      ['enraged', v.enraged],
      ['death', v.death],
      ['slain', v.slain],
      ['victory', v.victory],
      ['floor title', v.floor.title],
      ['floor source', v.floor.source],
      ...v.floor.text.map((t, i): [string, string] => [`floor[${i}]`, t]),
    ];
    for (const [k, t] of lines) lintText(`${where} ${k}`, t);
    if (v.floor.text.length === 0) fail(`${where}: floor lore has no text`);
    // Spoken lines go in a subtitle: keep them to one breath.
    for (const [k, t] of lines.slice(0, 8)) {
      if (k !== 'slain' && t.length > 140) fail(`${where} ${k}: ${t.length} characters is too long to read mid-fight`);
    }
    if (v.slain.length > 220) fail(`${where} slain: too long for a subtitle`);
    // The greeting follows the opening shout; it must not repeat a bark.
    for (const ph of b.phases) {
      if (ph.bark && ph.bark.toLowerCase() === v.greet.toLowerCase()) fail(`${where}: greet repeats a phase bark`);
    }
    const said = new Set(lines.slice(0, 8).map(([, t]) => t));
    if (said.size !== 8) fail(`${where}: two of its lines are the same`);
  }
  for (const id of Object.keys(BOSS_VOICES)) if (!getBoss(id)) fail(`voice for unknown boss "${id}"`);

  // The moods cover the whole range.
  if (tauntMood(0.1) !== 'ahead' || tauntMood(0.5) !== 'even' || tauntMood(0.95) !== 'behind') fail('tauntMood: wrong mood');

  // State is once per account and feeds the conditions people's lines use.
  const acct = save.account as AccountSave;
  delete acct.story;
  const b0 = BOSSES[0]!;
  if (!noteBossMet(b0.id) || noteBossMet(b0.id)) fail('noteBossMet: not once-only');
  if (holds({ slain: b0.id })) fail('slain condition holds before the kill');
  if (!noteBossSlain(b0.id) || noteBossSlain(b0.id)) fail('noteBossSlain: not once-only');
  if (!holds({ slain: b0.id }) || holds({ notSlain: b0.id })) fail('slain condition does not read the kill');
  if (!noteBossFloor(b0.id) || noteBossFloor(b0.id)) fail('noteBossFloor: not once-only');
  if (!story().notes.includes(floorNoteId(b0.id))) fail('floor lore not recorded');
  delete acct.story;
  console.log(`${BOSSES.length} bosses, every one with a voice and floor lore`);
}

// ---------------------------------------------------------------------------
section('Notes and places');

{
  const ids = new Set<string>();
  const perBiome: Record<string, number> = {};
  for (const n of NOTES) {
    const where = `note ${n.id}`;
    if (ids.has(n.id)) fail(`${where}: duplicate id`);
    ids.add(n.id);
    if (noteById(n.id) !== n) fail(`${where}: lookup does not round-trip`);
    lintText(`${where} title`, n.title);
    lintText(`${where} source`, n.source);
    lintText(`${where} text`, n.text);
    if (n.text.length > 360) fail(`${where}: ${n.text.length} characters; a page should fit a card`);
    if (n.biome) {
      const b = BIOMES.find((x) => x.id === n.biome);
      if (!b) fail(`${where}: unknown biome ${n.biome}`);
      else if (b.minDepth > n.minDepth) fail(`${where}: ${n.biome} does not open until tier ${b.minDepth}`);
      perBiome[n.biome] = (perBiome[n.biome] ?? 0) + 1;
    }
  }
  for (const b of BIOMES) {
    if ((perBiome[b.id] ?? 0) < 3) fail(`biome ${b.id}: only ${perBiome[b.id] ?? 0} notes`);
    const place = PLACES[b.id];
    if (!place) {
      fail(`biome ${b.id}: no place in data/story/places.ts`);
      continue;
    }
    for (const t of [place.name, place.makers, place.firstEntry, place.description, place.deepEntry, ...place.ambient]) lintText(`place ${b.id}`, t);
    if (place.ambient.length < 4) fail(`place ${b.id}: fewer than four ambient lines`);
  }
  for (const [where, ref] of noteRefs) if (!noteById(ref)) fail(`${where}: unknown note "${ref}"`);

  // Every page can really be found: searches turn up pages until there are
  // none left, and each turns up only where and when it belongs.
  const acct = save.account as AccountSave;
  delete acct.story;
  for (const n of NOTES) {
    const biome = n.biome ?? 'crypt';
    if (!notesFindable(n.minDepth, biome).includes(n)) fail(`note ${n.id}: not findable at its own tier`);
    if (n.minDepth > 1 && notesFindable(n.minDepth - 1, biome).includes(n)) fail(`note ${n.id}: findable above its tier`);
    if (n.biome && notesFindable(200, n.biome === 'crypt' ? 'caverns' : 'crypt').includes(n)) fail(`note ${n.id}: findable outside its biome`);
  }
  for (const b of BIOMES) {
    for (let i = 0; i < 400 && notesFindable(200, b.id).length; i++) searchForNote('fallen', 200, b.id);
  }
  const missing = NOTES.filter((n) => !story().notes.includes(n.id));
  if (missing.length) fail(`notes never found by searching: ${missing.map((n) => n.id).join(', ')}`);
  if (searchForNote('fallen', 200, 'crypt')) fail('a search found a page when none were left');
  delete acct.story;
  // Chance stays a chance: a chest is not a guaranteed page.
  let hits = 0;
  for (let i = 0; i < 400; i++) {
    if (searchForNote('chest', 20, 'crypt')) hits++;
    delete acct.story;
  }
  if (hits < 20 || hits > 100) fail(`chests turned up a page ${hits} times in 400; expected about 48`);
  if (!enterBiome('crypt') || enterBiome('crypt')) fail('enterBiome: not once-only');
  delete acct.story;

  // Every floor of every biome offers something to search: a chest at least.
  for (const b of BIOMES) {
    for (let seed = 1; seed <= 3; seed++) {
      setRunDirector(() => ({ biome: b.id }));
      const run = generateRun(Math.max(b.minDepth, 2) + seed, 0xbead + seed * 131, 'warden');
      run.levels.forEach((lvl, i) => {
        const searchable = lvl.props.filter((p) => {
          const fam = (p.interact ?? '').split('.')[0];
          return fam === 'chest' || fam === 'corpse';
        }).length;
        if (searchable === 0) fail(`${b.id} seed ${seed} floor ${i + 1}: nothing to search for a page`);
      });
    }
  }
  setRunDirector(null);
  installChains();
  console.log(`${NOTES.length} notes across ${Object.keys(perBiome).length} layers, ${Object.keys(PLACES).length} places`);
}

// ---------------------------------------------------------------------------
section('Item flavour');

{
  let lines = 0;
  for (const [cat, pool] of Object.entries(RARE_FLAVOR)) {
    if (!pool || pool.length < 2) fail(`rare flavour ${cat}: fewer than two lines`);
    for (const t of pool ?? []) {
      lintText(`rare flavour ${cat}`, t);
      lines++;
    }
  }
  for (const u of UNIQUES) lintText(`unique ${u.id} flavour`, u.flavor);
  for (const st of SETS) lintText(`set ${st.id} blurb`, st.blurb);
  const fake = { uid: 'x1', baseId: 'b', name: 'n', rarity: 'rare', ilvl: 1, mods: [], upgrade: 0, sockets: [], value: 0 } as never;
  if (!itemFlavor(fake, 'sword')) fail('itemFlavor: a rare sword has no line');
  if (itemFlavor({ ...(fake as object), rarity: 'magic' } as never, 'sword')) fail('itemFlavor: magic items should stay quiet');
  const setItem = { ...(fake as object), rarity: 'set', setId: SETS[0]!.id } as never;
  if (itemFlavor(setItem, 'sword') !== SETS[0]!.blurb) fail('itemFlavor: a set piece does not show its set');
  console.log(`${lines} rare lines, ${UNIQUES.length} uniques and ${SETS.length} sets read`);
}

// ---------------------------------------------------------------------------

console.log('');
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\nFAILED: ${failures.length} problem(s).`);
  (globalThis as unknown as { process: { exit(c: number): void } }).process.exit(1);
}
console.log('OK: the story holds together.');
