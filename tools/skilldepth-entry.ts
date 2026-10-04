/**
 * Entry point for `tools/check-skilldepth.mjs`.
 *
 * Skill depth: synergies are authored for every tree and actually reach a
 * skill's damage, `+skills` from gear raises it too, and mixing skills pays
 * (combos) while pressing one skill forever does not. Uses the real skill
 * runner and real monsters.
 */
import * as THREE from 'three';
import { arena, caseLog, shrug } from './combat-arena';
import { SKILLS, SKILL_TREES, SKILL_BY_ID, SYNERGIES, TREE_BY_ID } from '../src/data/skills';
import { skillDamageScale } from '../src/sim/Combat';
import { COMBOS, comboSkillOf, COMBO_WINDOW, resolveCombo } from '../src/entities/Combos';
import { SkillRunner } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter } from '../src/sim/Character';
import { MONSTERS } from '../src/data/monsters';
import { events } from '../src/core/Events';
import { Random } from '../src/core/RNG';
import type { CharClassId, DamagePacket } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

const { cases, check } = caseLog();
const DT = 1 / 60;

// 1. Synergies are authored for every tree and are well formed.
for (const t of SKILL_TREES) {
  const links = SYNERGIES.filter((l) => SKILL_BY_ID[l.target]?.treeId === t.id);
  const bad = links.filter((l) => {
    const src = SKILL_BY_ID[l.source];
    const dst = SKILL_BY_ID[l.target];
    return !src || !dst || src.treeId !== dst.treeId || l.source === l.target || l.pctPerRank <= 0;
  });
  const fed = new Set(links.map((l) => l.target)).size;
  check(`${t.id}: synergies authored and sound`, links.length >= 6 && fed >= 3 && bad.length === 0, `${links.length} links into ${fed} skills${bad.length ? `, bad: ${bad.map((b) => `${b.source}->${b.target}`).join(',')}` : ''}`);
}

// 2. The damage the runner uses includes synergies and +skills.
{
  const base = skillDamageScale({ gash: 5 }, 0, 'gash');
  const syn = skillDamageScale({ gash: 5, rend: 10 }, 0, 'gash');
  const plus = skillDamageScale({ gash: 5 }, 3, 'gash');
  const want = SKILL_BY_ID.gash!.damageScale!(8);
  check(
    'skill damage counts synergies and +skills',
    Math.abs(syn / base - 2) < 1e-6 && Math.abs(plus - want) < 1e-6,
    `gash x${(syn / base).toFixed(2)} with 10 in Rend (+10%/rank), +3 skills ${plus.toFixed(2)} (rank 8: ${want.toFixed(2)})`,
  );
}

// A real hero, the real runner, a real monster.
function rig(classId: CharClassId, skills: Record<string, number>, seed = 7) {
  const a = arena({ seed });
  const def = MONSTERS.find((m) => m.role === 'brute' && m.weight > 0) ?? MONSTERS[0]!;
  const e = a.spawn(def, 0, 1.8);
  // Tough enough to survive the test, and never wakes to wander off.
  e.maxLife = e.life = 1e7;
  const c = createCharacter('Test', classId, new Random(seed));
  c.skills = { ...skills };
  const player = new Player(c, 1);
  player.mana = 1e6;
  const runner = new SkillRunner(shrug);
  runner.setContext(a.ctx, a.enemies, null);
  const pctx = { colliders: [], walkableAt: () => true };
  const packets: DamagePacket[] = [];
  const real = e.takeDamage.bind(e);
  (e as { takeDamage: Enemy['takeDamage'] }).takeDamage = (p, ctx) => {
    packets.push(p);
    real(p, ctx);
  };
  const tick = (sec: number): void => {
    for (let i = 0; i < Math.ceil(sec / DT); i++) {
      a.ctx.elapsed += DT;
      player.update(DT, pctx, null);
      runner.update(DT);
    }
  };
  const cast = (id: string): boolean => {
    (player as unknown as { cooldowns?: Map<string, number> }).cooldowns?.clear();
    const ok = runner.cast(id, player, new THREE.Vector3(0, 0, 1.8), a.ctx, a.enemies, null);
    tick(0.9);
    return ok;
  };
  return { a, e, player, runner, packets, tick, cast };
}

// 3. In a real cast: a synergy source doubles Gash; +3 skills lifts it.
{
  const first = (skills: Record<string, number>, plus = 0): number => {
    const r = rig('warden', skills, 11);
    if (plus) (r.player.stats as { skillLevels: number }).skillLevels = plus;
    r.cast('gash');
    return r.packets.find((p) => p.ability === SKILL_BY_ID.gash!.name)?.amount ?? 0;
  };
  const plain = first({ gash: 5 });
  const synergised = first({ gash: 5, rend: 10 });
  check(
    'a real Gash hits twice as hard with 10 points in Rend',
    plain > 0 && Math.abs(synergised / plain - 2) < 0.02,
    `${plain.toFixed(1)} -> ${synergised.toFixed(1)} (x${(synergised / Math.max(1e-9, plain)).toFixed(2)})`,
  );
}

// 4. Combos: a different skill on the heels of another; never the same one.
{
  const r = rig('warden', { cleave: 5, rend: 5 });
  const heard: Array<{ name: string; setup: string; payoff: string }> = [];
  const off = events.on('combat:combo', (p) => heard.push(p));
  r.cast('rend');
  r.cast('rend');
  const afterSame = heard.length;
  r.cast('cleave');
  const afterMix = heard.length;
  const stunned = r.e.hasStatus('stunned');
  r.cast('rend');
  const afterBack = heard.length;
  r.tick(COMBO_WINDOW + 0.5);
  r.cast('cleave');
  const afterStale = heard.length;
  off();
  check('the same skill twice never combos', afterSame === 0, `${afterSame} combos after Rend, Rend`);
  check(
    'a second skill combos, and Break staggers',
    afterMix === 1 && heard[0]?.name === 'Break' && heard[0]?.setup === 'rend' && heard[0]?.payoff === 'cleave' && stunned,
    `${afterMix} combo(s): ${heard.map((h) => `${h.setup}>${h.payoff} ${h.name}`).join(', ')}; stunned ${stunned}`,
  );
  check('alternating keeps combo-ing', afterBack === 2, `${afterBack} combos after Rend, Rend, Cleave, Rend`);
  check('a stale setup does not combo', afterStale === 2, `${afterStale} after waiting ${COMBO_WINDOW + 0.5}s`);
  // The boost itself, on a fixed packet: tier-1 Rend after Cleave is +25%.
  const mem = { lastSkillHit: 'cleave', lastSkillHitAt: 10 };
  const hit = resolveCombo({ amount: 100, type: 'physical', crit: false, source: 'player', ability: SKILL_BY_ID.rend!.name }, mem, 11);
  const ruin = resolveCombo({ amount: 100, type: 'physical', crit: false, source: 'player', ability: SKILL_BY_ID.ruin!.name }, { lastSkillHit: 'rend', lastSkillHitAt: 10 }, 11);
  check(
    'combo hits land harder, finishers hardest',
    hit?.packet.amount === 125 && ruin?.packet.amount === 150,
    `tier-1 Rend 100 -> ${hit?.packet.amount}, tier-6 Ruin 100 -> ${ruin?.packet.amount}`,
  );
}

// 5. Every class has a combo and at least four skills that can set one up.
for (const cls of Object.keys(COMBOS) as CharClassId[]) {
  const skills = SKILLS.filter((s) => TREE_BY_ID[s.treeId]?.classId === cls && comboSkillOf({ amount: 1, type: 'physical', crit: false, source: 'player', ability: s.name }));
  check(`${cls}: ${COMBOS[cls].name} combo has skills to mix`, skills.length >= 4, `${skills.length} combo-able skills`);
}

// 6. Only skills combo: basic attacks and item powers do not.
{
  const plain = comboSkillOf({ amount: 1, type: 'physical', crit: false, source: 'player', ability: 'Attack' });
  const monster = comboSkillOf({ amount: 1, type: 'physical', crit: false, source: 'm1', ability: SKILL_BY_ID.rend!.name });
  check('basic attacks and monsters never combo', !plain && !monster, `basic ${!!plain}, monster ${!!monster}`);
}

console.log(JSON.stringify({ cases }));
