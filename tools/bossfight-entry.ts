/**
 * Entry point for `tools/check-bossfights.mjs`.
 *
 * Fights all twenty-four bosses headlessly, twice each: once against a hero
 * who stands still and trades, once against a hero who reads the floor and
 * steps out of every marker. The hero's own damage is a steady stream sized so
 * a fight lasts about a minute and a half, and it clears adds the way a player
 * would. Reports, per boss: phases reached, how much of its kit it used, the
 * damage taken standing against dodging, and whether the time limit enrages it.
 */
import * as THREE from 'three';
import { arena, caseLog, type Arena } from './combat-arena';
import { Boss, softEnrageAfter } from '../src/entities/Boss';
import { BOSSES } from '../src/data/bosses';
import { Random } from '../src/core/RNG';
import { getAbility } from '../src/entities/Abilities';
import type { BossDef } from '../src/types';

declare const process: { argv: string[] };
const { cases, check } = caseLog();
const DT = 1 / 30;
// A fight lasts about this long. Kept short: the checker shares a small machine.
const TTK = 45;
const CAP = 150;
// `--only=3,7` fights those bosses (1-based); `--every=3` fights every third.
const arg = (k: string): string | undefined => process.argv.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only')?.split(',').map(Number);
const every = Number(arg('every') ?? 1);
const offset = Number(arg('offset') ?? 0);
const trace = process.argv.includes('--trace');
const SAFE_RING = 0x60ffa0;

interface Zone {
  kind: string;
  x: number;
  z: number;
  size: number;
  rot: number;
  until: number;
  color: number;
}

function inside(z: Zone, x: number, y: number): boolean {
  const dx = x - z.x;
  const dy = y - z.z;
  const d = Math.hypot(dx, dy);
  switch (z.kind) {
    case 'circle':
    case 'hazard':
      return d < z.size + 0.6;
    case 'ring':
      return d < z.size + 0.6;
    case 'cone': {
      if (d > z.size + 0.6) return false;
      const a = Math.atan2(dx, dy);
      let delta = Math.abs(a - z.rot) % (Math.PI * 2);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      return delta < 1.3 || d < 1.2;
    }
    case 'line': {
      const ex = z.x + Math.sin(z.rot) * z.size;
      const ez = z.z + Math.cos(z.rot) * z.size;
      const vx = ex - z.x;
      const vz = ez - z.z;
      const len2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, (dx * vx + dy * vz) / len2));
      return Math.hypot(x - (z.x + vx * t), y - (z.z + vz * t)) < 1.6;
    }
    default:
      return false;
  }
}

interface Result {
  phases: number;
  of: number;
  died: boolean;
  taken: number;
  used: number;
  kit: number;
  unused: string[];
  usedSet: Set<string>;
  life: number;
}

function fight(def: BossDef, dodge: boolean, seed: number): Result {
  const zones: Zone[] = [];
  const a: Arena = arena({ seed });
  // Watch the floor the way a player does.
  const decals = a.ctx.decals as unknown as Record<string, unknown>;
  const now = (): number => a.ctx.elapsed;
  const realTel = decals.telegraph as (...args: unknown[]) => { cancel(): void };
  (a.ctx as { decals: unknown }).decals = new Proxy(decals, {
    get(o, k) {
      if (k === 'telegraph') {
        return (kind: string, x: number, z: number, size: number, rot: number, duration: number, color = 0) => {
          zones.push({ kind, x, z, size, rot, until: now() + duration, color });
          return realTel(kind, x, z, size, rot, duration, color);
        };
      }
      if (k === 'add') {
        return (kind: string, x: number, z: number, r: number) => {
          if (kind === 'scorch' || kind === 'stain') zones.push({ kind: 'hazard', x, z, size: r, rot: 0, until: now() + 6, color: 0 });
        };
      }
      return o[k as string];
    },
  });

  const depth = Math.max(2, def.minDepth + 2);
  const boss = new Boss(def, depth, new Random(seed));
  boss.root.position.set(0, 0, 7);
  a.enemies.push(boss);
  boss.engage(a.ctx);

  const hero = a.hero;
  const step = new THREE.Vector3();
  let taken = 0;
  let hitAcc = 0;
  let lastHits = 0;
  const chunk = (boss.maxLife / TTK) * 0.5;

  for (let t = 0; t < CAP && boss.alive; t += DT) {
    a.step(DT);
    for (let i = lastHits; i < a.hits.length; i++) taken += a.hits[i]!.amount;
    lastHits = a.hits.length;

    // The hero's damage: steady on the boss, and adds get cleared.
    hitAcc += DT;
    if (hitAcc >= 0.5) {
      hitAcc = 0;
      // Adds: a player focuses them one at a time, healers and guardians first.
      const adds = a.enemies.filter((e) => e !== boss && e.alive);
      adds.sort((x, y) => Number(y.def.role === 'support') - Number(x.def.role === 'support'));
      const focus = adds[0];
      if (focus) focus.takeDamage({ amount: focus.maxLife * 0.3, type: 'physical', crit: false, source: 'player' }, a.ctx);
      for (const e of adds.slice(1)) e.takeDamage({ amount: e.maxLife * 0.06, type: 'physical', crit: false, source: 'player' }, a.ctx);
      boss.takeDamage({ amount: chunk, type: 'physical', crit: false, source: 'player' }, a.ctx);
    }

    if (trace && !dodge && Math.abs(t % 5) < DT) console.error(`t=${t.toFixed(0)} life=${(boss.life / boss.maxLife).toFixed(3)} phase=${boss.phaseIndex} buffs=${JSON.stringify((boss as unknown as { buffs?: unknown }).buffs ?? null).slice(0, 300)} shield=${(boss as unknown as { shield: number }).shield}`);
    if (!dodge) continue;
    // The dodger: into a safe ring if one is up, out of any marker it is in,
    // and otherwise hold about seven metres from the boss.
    const live = zones.filter((z) => z.until > now() - 0.05);
    zones.length = 0;
    zones.push(...live);
    const safe = live.filter((z) => z.kind === 'ring' && z.color === SAFE_RING);
    const danger = live.filter((z) => !(z.kind === 'ring' && z.color === SAFE_RING));
    step.set(0, 0, 0);
    if (safe.length) {
      const s = safe.reduce((b, z) => (Math.hypot(z.x - hero.x, z.z - hero.z) < Math.hypot(b.x - hero.x, b.z - hero.z) ? z : b));
      step.set(s.x - hero.x, 0, s.z - hero.z);
      if (step.length() < 0.8) step.set(0, 0, 0);
    } else {
      const bad = danger.find((z) => inside(z, hero.x, hero.z));
      if (bad) {
        // Try sixteen headings and take the nearest point that is out of everything.
        let best: THREE.Vector3 | null = null;
        for (let r = 1; r <= 9 && !best; r += 1) {
          for (let k = 0; k < 16; k++) {
            const ang = (k / 16) * Math.PI * 2;
            const x = hero.x + Math.sin(ang) * r;
            const z = hero.z + Math.cos(ang) * r;
            if (!danger.some((q) => inside(q, x, z))) {
              best = new THREE.Vector3(x - hero.x, 0, z - hero.z);
              break;
            }
          }
        }
        if (best) step.copy(best);
      } else {
        const bp = boss.root.position;
        const d = Math.hypot(hero.x - bp.x, hero.z - bp.z);
        // Toward the boss when far, away when close: a negative length flips it.
        if (Math.abs(d - 7) > 1 && d > 0.01) step.set(bp.x - hero.x, 0, bp.z - hero.z).setLength(d - 7);
      }
    }
    if (step.lengthSq() > 1e-4) {
      const len = step.length();
      step.multiplyScalar(Math.min(len, 4.6 * DT) / len);
      hero.add(step);
      a.ctx.heroFacing = Math.atan2(step.x, step.z);
    }
  }

  const kit = new Set<string>();
  def.phases.slice(0, boss.phaseIndex + 1).forEach((p) => p.abilities.forEach((id) => kit.add(id)));
  // A death move is used by dying.
  const used = new Set(boss.usedAbilities);
  if (!boss.alive) for (const id of kit) if (getAbility(id)?.tags?.includes('ondeath')) used.add(id);
  const unused = [...kit].filter((id) => !used.has(id));
  return {
    phases: boss.phaseIndex + 1,
    of: def.phases.length,
    died: !boss.alive,
    taken,
    used: kit.size - unused.length,
    kit: kit.size,
    unused,
    usedSet: used,
    life: boss.life / boss.maxLife,
  };
}

const rows: Array<Record<string, unknown>> = [];
let i = 0;
for (const def of BOSSES) {
  i++;
  if (only ? !only.includes(i) : (i - 1 - offset) % every !== 0) continue;
  const t0 = Date.now();
  const stand = fight(def, false, 100 + i);
  const dodge = fight(def, true, 100 + i);
  // Soft enrage: nobody hurts it, and the clock runs out.
  const a = arena({ seed: 500 + i });
  const boss = new Boss(def, Math.max(2, def.minDepth + 2), new Random(500 + i));
  boss.root.position.set(0, 0, 7);
  a.enemies.push(boss);
  boss.engage(a.ctx);
  // Wind the fight clock to just before the warning rather than simulate four idle minutes.
  (boss as unknown as { fightTime: number }).fightTime = softEnrageAfter(def.phases.length) - 16;
  a.step(18);
  const enraged = boss.softEnraged;

  const ratio = dodge.taken / Math.max(1, stand.taken);
  rows.push({
    boss: def.name,
    phases: `${stand.phases}/${stand.of}`,
    kit: `${stand.used}/${stand.kit}`,
    unused: stand.unused.join(','),
    stand: Math.round(stand.taken),
    dodge: Math.round(dodge.taken),
    ratio: Number(ratio.toFixed(2)),
    enraged,
    ms: Date.now() - t0,
  });
  check(
    `${def.name}: every phase, most of the kit, dodgeable, enrages`,
    stand.died && stand.phases === stand.of && stand.used >= Math.ceil(stand.kit * 0.85) && ratio < 0.6 && enraged,
    `phases ${stand.phases}/${stand.of}${stand.died ? '' : ` (alive at ${Math.round(stand.life * 100)}%)`}, kit ${stand.used}/${stand.kit}${stand.unused.length ? ` (unused ${stand.unused.join(',')})` : ''}, damage standing ${Math.round(stand.taken)} vs dodging ${Math.round(dodge.taken)} (${Math.round(ratio * 100)}%), enrages: ${enraged}`,
  );
}

console.log(JSON.stringify({ cases, rows }));
