/**
 * SLAY — what monsters sound like when they act.
 *
 * Of about a hundred and ten monster abilities, eight named a sound. Everything
 * else — every sword swing, arrow, spit, slam wind-up and summon — happened in
 * silence, which is the worst possible thing for a telegraph: the player has
 * to *see* every dangerous wind-up to dodge it.
 *
 * `Enemy.notifyAbility(ability, phase)` is the documented hook point for FX
 * and audio layers. This module wraps it (calling the original first, so
 * whatever the combat stream puts there keeps working) and voices each phase
 * by the ability's kind:
 *
 *   - a long wind-up gets a rising **telegraph** whose length matches the
 *     wind-up, so a big hit can be heard coming from off-screen;
 *   - melee swings whoosh on release, scaled in pitch by the body's size;
 *   - ranged attacks twang or crackle by element;
 *   - area spells sound their element as they go off;
 *   - summons, buffs and heals get the family's voice.
 *
 * Rate limits per body and across the room keep a pack from turning into a
 * wall of noise.
 */

import type { DamageType } from '../types';
import { audio } from './Audio';

/** The slice of an ability this module reads. */
export interface VoicedAbility {
  kind: string;
  windup: number;
  damageType?: DamageType;
  sfx?: string;
}

/** The slice of a monster this module reads. */
export interface VoicedBody {
  family: string;
  sizeScale: number;
  isBoss?: boolean;
  root: { position: { x: number; z: number } };
}

type Hookable = { notifyAbility(ability: never, phase: never): void };

const INSTALLED = Symbol.for('slay.monsterAudio');

/** Wind-ups at least this long get an audible tell. */
export const TELEGRAPH_MIN = 0.45;

const nextFor = new WeakMap<object, number>();
let nextAny = 0;
let nextTelegraph = 0;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);

/** What to play for one ability phase. Pure, so the check can walk it. */
export function monsterSoundFor(a: VoicedAbility, phase: string, family: string): string[] {
  const el = a.damageType ?? 'physical';
  const out: string[] = [];
  if (phase === 'windup') {
    if (a.sfx) return out; // the ability already names its own
    if (a.windup >= TELEGRAPH_MIN && a.kind !== 'buff' && a.kind !== 'heal' && a.kind !== 'aura') out.push('telegraph');
    switch (a.kind) {
      case 'melee':
        out.push(`monster.${family}.attack`);
        break;
      case 'summon':
        out.push('spell.summon');
        break;
      case 'buff':
      case 'heal':
      case 'aura':
      case 'debuff':
        out.push(`monster.${family}.aggro`);
        break;
      default:
        break;
    }
  } else if (phase === 'active') {
    switch (a.kind) {
      case 'melee':
        out.push('monster.swing');
        break;
      case 'ranged':
        out.push(`shoot.${el}`);
        break;
      case 'aoe':
        out.push(`nova.${el}`);
        break;
      case 'cone':
        out.push(`cone.${el}`);
        break;
      case 'beam':
        out.push(`beam.${el}`);
        break;
      case 'movement':
        out.push('dodge');
        break;
      case 'heal':
        out.push('heal');
        break;
      default:
        break;
    }
  }
  return out;
}

function voice(body: VoicedBody, a: VoicedAbility, phase: string): void {
  const ids = monsterSoundFor(a, phase, body.family);
  if (ids.length === 0) return;
  const t = now();
  const telegraph = ids[0] === 'telegraph';
  // Telegraphs are information and always play; the rest is texture and waits
  // its turn in a crowd.
  if (!telegraph) {
    if (t < nextAny || t < (nextFor.get(body) ?? 0)) return;
    nextAny = t + 0.06;
    nextFor.set(body, t + 0.3);
  } else if (!body.isBoss) {
    // Telegraphs are information, but six at once is noise. A boss always
    // gets its tell.
    if (t < nextTelegraph) return;
    nextTelegraph = t + 0.14;
  }
  const p = body.root.position;
  // Big things sound big.
  const pitch = Math.max(0.55, Math.min(1.35, 1.25 - 0.22 * body.sizeScale));
  const vol = body.isBoss ? 1.15 : 0.75;
  for (const id of ids) {
    if (id === 'telegraph') {
      audio.play(a.windup >= 1 ? 'telegraph.long' : 'telegraph', { x: p.x, z: p.z, volume: body.isBoss ? 1.1 : 0.8, pitch: pitch * 0.9 });
    } else {
      audio.play(id, { x: p.x, z: p.z, volume: vol, pitch });
    }
  }
}

/**
 * Wraps a class's `notifyAbility` so its monsters make sound. Idempotent:
 * calling it twice does not double the noise.
 */
export function installMonsterAudio(proto: Hookable): void {
  const tagged = proto as unknown as Record<symbol, boolean>;
  if (tagged[INSTALLED]) return;
  tagged[INSTALLED] = true;
  const original = proto.notifyAbility;
  (proto as unknown as { notifyAbility: (a: VoicedAbility, ph: string) => void }).notifyAbility = function (
    this: VoicedBody,
    ability: VoicedAbility,
    phase: string,
  ): void {
    (original as unknown as (a: VoicedAbility, ph: string) => void).call(this, ability, phase);
    try {
      voice(this, ability, phase);
    } catch {
      /* a sound must never break a monster's turn */
    }
  };
}
