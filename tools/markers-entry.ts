/**
 * Entry point for `tools/check-markers.mjs`.
 *
 * The quest markers over people's heads, through the real contract and
 * bounty code: who shows a "?" (work to take), who shows a "!" (work to hand
 * in), who shows nothing, and that each changes the moment the state does:
 * offered, taken, ready to hand in, handed in. Then the marker layer itself:
 * drawn over everything, above the head top, bobbing, hidden on null.
 */
import * as THREE from 'three';
import type { AccountSave } from '../src/types';
import { save } from '../src/core/Save';
import { NPCS, NPC_IDS } from '../src/data/story/npcs';
import { CHAINS } from '../src/data/story/chains';
import { acceptStep, installChains, noteQuestComplete, offerFor, openWorkFor, planRun, stepState, turnInStep } from '../src/sim/Chains';
import { BOARD, boardMarker, combineMarker, npcMarker, townMarkers } from '../src/sim/QuestMarkers';
import { MAX_ACTIVE_BOUNTIES, acceptBounty, claimBounty, refreshBoard, townOf } from '../src/sim/TownServices';
import { legacyOf, renownForRank } from '../src/sim/Legacy';
import { createCharacter } from '../src/sim/Character';
import { Random } from '../src/core/RNG';
import { QuestMarkerLayer } from '../src/fx/QuestMarkers';

interface Case {
  name: string;
  ok: boolean;
  detail: string;
}
const cases: Case[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  cases.push({ name, ok, detail });
};

const g = globalThis as unknown as Record<string, unknown>;
g.window ??= { setTimeout: () => 0, clearTimeout: () => undefined };
g.localStorage ??= { getItem: () => null, setItem: () => undefined };

const acct = save.account as AccountSave;
delete acct.story;
installChains();
const c = createCharacter('Marker', 'warden', new Random(11));
save.setCharacter(c);

// --- the rule -----------------------------------------------------------------
check('rule: offer only shows "?"', combineMarker(true, false) === 'offer', String(combineMarker(true, false)));
check('rule: ready only shows "!"', combineMarker(false, true) === 'turnIn', String(combineMarker(false, true)));
check('rule: both show "!" (hand-in wins)', combineMarker(true, true) === 'turnIn', String(combineMarker(true, true)));
check('rule: neither shows nothing', combineMarker(false, false) === null, String(combineMarker(false, false)));

// --- a fresh account -----------------------------------------------------------
{
  const all = townMarkers(acct, c);
  const offers = NPC_IDS.filter((id) => all[id] === 'offer');
  const none = NPC_IDS.filter((id) => all[id] === null);
  check('fresh: Renn offers her first contract ("?")', all.renn === 'offer', `renn ${all.renn}; offers: ${offers.join(', ')}`);
  // Every marker must agree with what the person would actually say.
  const wrong = NPC_IDS.filter((id) => (all[id] === 'offer') !== (offerFor(NPCS[id]) !== null));
  check('fresh: every "?" is a real offer, and every real offer has one', wrong.length === 0, wrong.length ? `disagree: ${wrong.join(', ')}` : `${offers.length} offering`);
  check('fresh: someone with nothing to do shows nothing', none.length > 0, `none: ${none.join(', ')}`);
  check('fresh: nobody shows "!" before any work', NPC_IDS.every((id) => all[id] !== 'turnIn'), NPC_IDS.map((id) => `${id}:${all[id]}`).join(' '));
}

// --- Renn's contract, end to end -------------------------------------------------
const renn = NPCS.renn;
const offer = offerFor(renn);
if (!offer) {
  check('contract: Renn has a first contract to test with', false, 'no offer');
} else {
  acceptStep(offer.chain);
  check('taken: Renn shows nothing while the work is under way', npcMarker('renn') === null, `${npcMarker('renn')} (step ${stepState(offer.chain, offer.index)})`);

  // Carry it down, finish it, come back: the real hooks, without the generator.
  const plan = planRun(Math.max(1, offer.step.minDepth));
  const quest = plan?.quest?.(plan.biome ?? 'crypt');
  if (quest) {
    for (const o of quest.objectives) {
      o.progress = o.target;
      o.done = true;
    }
    quest.complete = true;
  }
  noteQuestComplete();
  const ready = openWorkFor(renn).some((w) => w.ready);
  check('ready: Renn shows "!" once the work is done', npcMarker('renn') === 'turnIn', `${npcMarker('renn')} (ready ${ready}, quest ${quest ? 'carried' : 'missing'})`);

  // Ready to hand in and another offer at once still reads "!".
  const other = CHAINS.find((ch) => ch.id !== offer.chain.id && offerFor(NPCS[ch.giver]) && ch.giver !== 'renn');
  if (other) {
    check('both: an offer elsewhere does not touch Renn\'s "!"', npcMarker('renn') === 'turnIn' && npcMarker(other.giver) === 'offer', `renn ${npcMarker('renn')}, ${other.giver} ${npcMarker(other.giver)}`);
  }

  const paid = turnInStep(offer.chain);
  const next = offerFor(renn);
  const after = npcMarker('renn');
  check(
    'handed in: the "!" goes, and Renn shows "?" only if she has the next step',
    !!paid && after === (next ? 'offer' : null),
    `paid ${paid?.gold ?? 0} gold; now ${after}; next step ${next ? next.index : 'none'}`,
  );
}

// --- the bounty board -------------------------------------------------------------
{
  const L = legacyOf(acct);
  const renown = L.renown;
  L.renown = 0;
  check('board: shows nothing before the Legacy rank opens it', boardMarker(acct, c) === null, String(boardMarker(acct, c)));
  L.renown = renownForRank(2);
  refreshBoard(c);
  check('board: open, with a free hand, shows "?"', boardMarker(acct, c) === 'offer', String(boardMarker(acct, c)));
  const t = townOf(c);
  for (let i = 0; i < MAX_ACTIVE_BOUNTIES; i++) {
    const open = t.bounties.find((b) => b.state === 'open');
    if (open) acceptBounty(c, open.id);
  }
  check('board: both hands full and nothing done shows nothing', boardMarker(acct, c) === null, `${boardMarker(acct, c)}; held ${t.bounties.filter((b) => b.state !== 'open').length}`);
  const held = t.bounties.find((b) => b.state === 'active');
  if (held) {
    held.progress = held.target;
    held.state = 'done';
  }
  check('board: a finished bounty shows "!"', boardMarker(acct, c) === 'turnIn', String(boardMarker(acct, c)));
  const claim = held ? claimBounty(c, held.id) : { ok: false, reason: 'nothing held' };
  check('board: claimed, a free hand again shows "?"', claim.ok && boardMarker(acct, c) === 'offer', `${claim.ok ? 'claimed' : claim.reason}; now ${boardMarker(acct, c)}`);
  check('board: its spot is in the town list', townMarkers(acct, c)[BOARD] === boardMarker(acct, c), String(townMarkers(acct, c)[BOARD]));
  L.renown = renown;
}

// --- the layer that draws them ------------------------------------------------------
{
  const parent = new THREE.Group();
  const layer = new QuestMarkerLayer(parent);
  const head = new THREE.Vector3(2, 1.9, -3);
  layer.set('renn', 'offer', head, 0);
  layer.set('kale', 'turnIn', new THREE.Vector3(0, 1.8, 0), 0);
  layer.set('vell', null, new THREE.Vector3(0, 1.8, 0), 0);
  const sprites = layer.root.children as THREE.Sprite[];
  const renS = sprites.find((s) => s.name === 'questMarker:renn');
  const kaleS = sprites.find((s) => s.name === 'questMarker:kale');
  const m = renS?.material as THREE.SpriteMaterial | undefined;
  check('layer: one marker per spot with work, none for nothing', sprites.length === 2 && !sprites.some((s) => s.name.endsWith(':vell')), sprites.map((s) => s.name).join(', '));
  check('layer: "?" and "!" are different looks', !!renS && !!kaleS && renS.material !== kaleS.material, JSON.stringify(layer.shown()));
  check(
    'layer: drawn over everything (no depth test, last, no fog)',
    !!m && m.depthTest === false && m.depthWrite === false && m.fog === false && (renS?.renderOrder ?? 0) >= 1000,
    `depthTest ${m?.depthTest}, renderOrder ${renS?.renderOrder}, fog ${m?.fog}`,
  );
  check('layer: lit past white for the glow', !!m && m.toneMapped === false && m.color.r > 1, `toneMapped ${m?.toneMapped}, colour x${m?.color.r.toFixed(2)}`);
  const ys: number[] = [];
  for (let i = 0; i < 40; i++) {
    layer.set('renn', 'offer', head, i * 0.05);
    ys.push(renS!.position.y);
  }
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  check('layer: its foot stays clear of the head top (no hat clipping)', !!renS && renS.center.y === 0 && lo >= head.y + 0.15, `lowest foot ${(lo - head.y).toFixed(2)} m over the head top`);
  check('layer: it bobs gently', hi - lo > 0.03 && hi - lo < 0.2, `bob ${(hi - lo).toFixed(3)} m`);
  layer.set('renn', 'turnIn', head, 2);
  check('layer: a change of state changes the marker at once', layer.shown().renn === 'turnIn', JSON.stringify(layer.shown()));
  layer.set('renn', null, head, 2);
  check('layer: nothing to do hides it at once', layer.shown().renn === undefined && renS!.visible === false, JSON.stringify(layer.shown()));
  layer.dispose();
}

save.setCharacter(null);
delete acct.story;
console.log(JSON.stringify({ cases }));
