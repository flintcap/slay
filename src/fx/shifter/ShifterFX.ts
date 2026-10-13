/**
 * SLAY — what the Shapeshifter draws: the changes between shapes, and each
 * skill's own look on top of the blow (`SHIFTER_MOTIFS` names them for the
 * uniqueness check).
 *
 * Built from the kit's pieces (particles, lights, decals, ribbons) with the
 * Shapeshifter's own emitters (`./emitters.ts`).
 */
import * as THREE from 'three';
import type { EffectSystem } from '../Effects';
import type { BeastForm } from '../../art/hero/forms/BeastBody';
import { events } from '../../core/Events';
import './emitters';

/** Light colour of each form's change. */
const CHANGE_LIGHT: Readonly<Record<BeastForm | 'man', number>> = { cat: 0x7a5ad8, wolf: 0xe0b060, bear: 0xd08040, man: 0xffd8b0 };
/** How high the head is in each shape, metres (eyes and breath). */
const HEAD_Y: Readonly<Record<BeastForm | 'man', number>> = { cat: 1.75, wolf: 1.9, bear: 2.15, man: 1.7 };

/**
 * One change of shape at `at`, facing `dir`: the old pelt shed, the new one
 * bursting, breath out of the new muzzle and the eyes lighting.
 */
export function formChange(fx: EffectSystem, at: THREE.Vector3, dir: THREE.Vector3, from: BeastForm | null, to: BeastForm | null): void {
  const x = at.x;
  const z = at.z;
  const y = at.y;
  if (from) fx.fx.burst(`ss.shed.${from}`, x, y + 1.1, z, {});
  const key = to ?? 'man';
  fx.fx.burst(`ss.change.${key}`, x, y + (to === 'bear' ? 0.15 : 1.0), z, {});
  fx.flash(x, y + 1.2, z, CHANGE_LIGHT[key], to === 'bear' ? 9 : 6, 6, to === 'cat' ? 0.1 : 0.2);
  const hy = HEAD_Y[key];
  const mouth = new THREE.Vector3(x + dir.x * 0.35, y + hy - 0.12, z + dir.z * 0.35);
  if (to) {
    // The breath comes a beat after the change, out of the new mouth.
    fx.delay(0.18, () => fx.fx.burst('ss.breath', mouth.x, mouth.y, mouth.z, { dir: dir.clone().setY(-0.15).normalize() }));
    fx.delay(0.1, () => fx.fx.burst(`ss.eyes.${to}`, x + dir.x * 0.22, y + hy, z + dir.z * 0.22, {}));
  }
  if (to === 'bear') {
    fx.decals.add('dust', x, z, 1.4);
    events.emit('shake', { amount: 0.22, duration: 0.3 });
  } else if (to === 'wolf') {
    fx.decals.add('dust', x, z, 0.9);
    events.emit('shake', { amount: 0.08, duration: 0.2 });
  }
}
