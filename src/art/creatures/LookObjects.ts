/**
 * SLAY — room objects: the things a boss room's rule is built around.
 *
 * Portals, heartstones, bells, braziers and chain anchors are monsters in the
 * data (`object: true`), so they can be hit, broken and counted like anything
 * else. They never move and never fight. Each is a still sculpt on the
 * floater rig with its core at a fixed height, built down to the floor.
 */
import type { LookFactory } from './Looks';
import { floatLook } from './LookConstruct';
import { V } from './Kit';
import { ballGeo, boxGeo, ringGeo, spikeGeo } from './Sculpt';
import type { MotionStyle } from './Motion';

const still: Partial<MotionStyle> = { heavy: 0, attacks: ['lash'], idle: 'still', spawn: 'form', death: 'collapse' };

export const OBJECTS: Record<string, LookFactory> = {
  ward_portal: (c) =>
    floatLook(c, {
      hover: 1.3,
      radius: 0.62,
      orbs: 0,
      skin: { surface: 'stone', tint: 0x6d6a72 },
      alt: { surface: 'stone', tint: 0x3a3740 },
      style: { ...still, idle: 'hover' },
      sculpt: (s, R) => {
        // An upright stone ring on a plinth, a slow glowing boil inside it.
        const c0 = s.j('core');
        s.hard('core', ringGeo(c0, R * 1.05, R * 0.16, V(0, 0, 1), 20), 'skin');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const p = c0.clone().add(V(Math.sin(a) * R * 1.05, Math.cos(a) * R * 1.05, 0));
          s.hard('core', boxGeo(p, V(R * 0.22, R * 0.22, R * 0.38)), 'alt');
        }
        s.boil('core', c0, R * 0.8, 1.2, [0.7, 0.9, 1.3]);
        s.box('core', c0.clone().add(V(0, -1.3 + R * 0.1, 0)), V(R * 0.9, R * 0.16, R * 0.5), { mat: 'alt', k: R * 0.04, round: R * 0.05 });
        s.box('core', c0.clone().add(V(0, -1.3 + R * 0.55, 0)), V(R * 0.22, R * 0.4, R * 0.22), { mat: 'alt', k: R * 0.03, round: R * 0.04 });
      },
    }),
  heartstone: (c) =>
    floatLook(c, {
      hover: 0.95,
      radius: 0.34,
      orbs: 3,
      skin: { surface: 'stone', tint: 0x5a2a2e },
      alt: { surface: 'stone', tint: 0x2a2224 },
      style: { ...still, idle: 'breathe' },
      sculpt: (s, R) => {
        // A dark heart-shaped stone that beats: a red core seen through cracks.
        const c0 = s.j('core');
        s.ball('core', c0, V(R * 0.9, R * 1.05, R * 0.85), { k: R * 0.06 });
        s.boil('core', c0.clone().add(V(0, 0, R * 0.55)), R * 0.32, 1.4, [1.4, 0.4, 0.35]);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const b = c0.clone().add(V(Math.sin(a) * R * 0.7, R * 0.4, Math.cos(a) * R * 0.7));
          s.hard('core', spikeGeo(b, b.clone().add(V(Math.sin(a) * R * 0.4, R * 0.7, Math.cos(a) * R * 0.4)), R * 0.14, 4, undefined, 1), 'alt');
        }
        for (let i = 0; i < 3; i++) s.hard(`orb${i}`, ballGeo(s.j(`orb${i}`), R * 0.14), 'alt', [1.2, 0.5, 0.45], 0.8);
        // A cairn of rubble it rises from.
        s.box('core', c0.clone().add(V(0, -0.95 + R * 0.15, 0)), V(R * 0.8, R * 0.18, R * 0.8), { mat: 'alt', k: R * 0.08, round: R * 0.1 });
      },
    }),
  rite_bell: (c) =>
    floatLook(c, {
      hover: 1.5,
      radius: 0.36,
      orbs: 0,
      skin: { surface: 'brass', tint: 0xb08a4a },
      alt: { surface: 'iron', tint: 0x3a3a3e },
      metal: { surface: 'brass', tint: 0xd2a860 },
      style: { ...still, idle: 'sway' },
      sculpt: (s, R) => {
        // A bronze bell hung from a two-post iron frame.
        const c0 = s.j('core');
        s.ball('core', c0.clone().add(V(0, -R * 0.1, 0)), V(R * 0.8, R * 1.0, R * 0.8), { k: R * 0.04 });
        s.hard('core', ringGeo(c0.clone().add(V(0, -R * 0.85, 0)), R * 0.85, R * 0.08, V(0, 1, 0), 18), 'metal');
        s.hard('core', ballGeo(c0.clone().add(V(0, -R * 1.15, 0)), R * 0.16), 'alt');
        s.pair((_side, x) => {
          s.box('core', c0.clone().add(V(x * R * 1.4, -0.75 + R * 0.6, 0)), V(R * 0.1, 0.75 + R * 0.6, R * 0.1), { mat: 'alt', k: R * 0.02, round: R * 0.02 });
        });
        s.box('core', c0.clone().add(V(0, R * 1.15, 0)), V(R * 1.55, R * 0.1, R * 0.12), { mat: 'alt', k: R * 0.02, round: R * 0.02 });
      },
    }),
  rite_brazier: (c) =>
    floatLook(c, {
      hover: 0.95,
      radius: 0.36,
      orbs: 0,
      skin: { surface: 'iron', tint: 0x4a4440 },
      alt: { surface: 'rust', tint: 0x3a2e28 },
      style: still,
      sculpt: (s, R) => {
        // A cold iron bowl on three legs, ash heaped in it.
        const c0 = s.j('core');
        s.ball('core', c0, V(R * 1.0, R * 0.42, R * 1.0), { k: R * 0.04 });
        s.hard('core', ringGeo(c0.clone().add(V(0, R * 0.35, 0)), R * 1.0, R * 0.07, V(0, 1, 0), 18), 'alt');
        s.ball('core', c0.clone().add(V(0, R * 0.38, 0)), V(R * 0.8, R * 0.18, R * 0.8), { mat: 'alt', k: R * 0.03 });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const top = c0.clone().add(V(Math.sin(a) * R * 0.7, -R * 0.2, Math.cos(a) * R * 0.7));
          const foot = c0.clone().add(V(Math.sin(a) * R * 1.2, -0.95, Math.cos(a) * R * 1.2));
          s.hard('core', spikeGeo(top, foot, R * 0.08, 4, undefined, 1), 'alt');
        }
      },
    }),
  chain_anchor: (c) =>
    floatLook(c, {
      hover: 0.6,
      radius: 0.5,
      orbs: 0,
      skin: { surface: 'iron', tint: 0x55575c },
      alt: { surface: 'rust', tint: 0x4a3a30 },
      style: still,
      sculpt: (s, R) => {
        // An iron block bolted to the floor, a heavy ring through its top.
        const c0 = s.j('core');
        s.box('core', c0.clone().add(V(0, -R * 0.3, 0)), V(R * 0.85, R * 0.75, R * 0.85), { k: R * 0.04, round: R * 0.06 });
        s.hard('core', ringGeo(c0.clone().add(V(0, R * 0.7, 0)), R * 0.42, R * 0.1, V(1, 0, 0), 16), 'alt');
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          s.hard('core', ballGeo(c0.clone().add(V(Math.sin(a) * R * 0.75, R * 0.45, Math.cos(a) * R * 0.75)), R * 0.1), 'alt');
        }
      },
    }),
};
