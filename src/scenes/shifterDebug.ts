/**
 * SLAY — the Shapeshifter's debug hooks, spread into `window.SLAY.debug`
 * (`scenes/debug.ts`). `tools/shoot-shifter.mjs` drives them.
 */
import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Player } from '../entities/Player';
import type { BeastForm } from '../art/hero/forms/BeastBody';

interface Scene {
  player?: Player;
  skills?: { cast: (id: string, p: Player, t: THREE.Vector3, c: unknown, e: unknown, b: unknown) => boolean };
  context?: () => unknown;
  enemies?: unknown[];
  boss?: unknown;
}

export function shifterDebug(engine: Engine): Record<string, unknown> {
  const scene = () => engine.currentScene as unknown as Scene;
  return {
    /** Turns the hero into a form ('cat', 'wolf', 'bear') or back into a man (null). */
    shiftTo(form: BeastForm | null): string | null {
      const p = scene().player;
      if (!p) return 'no player';
      p.shape.become(form);
      return p.shape.form;
    },
    /**
     * Casts one Shapeshifter skill `dist` metres in front of the hero (at the
     * nearest monster when there is one that close), skipping its cost and
     * cooldown. True when it fired.
     */
    shiftCast(id: string, dist = 3): boolean {
      const s = scene();
      const p = s.player;
      if (!p || !s.skills) return false;
      p.character.skills[id] = Math.max(p.character.skills[id] ?? 0, 5);
      p.mana = p.stats.mana;
      p.cooldowns.clear();
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(p.root.quaternion).setY(0).normalize();
      const at = p.position.clone().addScaledVector(f, dist).setY(0);
      return s.skills.cast(id, p, at, s.context?.(), s.enemies ?? [], s.boss ?? null);
    },
  };
}
