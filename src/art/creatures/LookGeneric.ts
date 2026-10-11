/**
 * SLAY — a look for any visual without one of its own: built from the
 * visual's body, palette, glow and weapon. Every monster in the data has its
 * own look; this keeps a new or test visual from ever drawing nothing.
 */
import { bipedRig, floaterRig, flyerRig, manyLegRig, oozeRig, quadRig, serpentRig, swarmRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx } from './Looks';
import { ballGeo, spikeGeo } from './Sculpt';
import { weapon, weaponKind } from './Arms';
import { V, fleshArms, fleshHead, fleshLegs, lerpV, paletteTint, skirt, trunk } from './Kit';
import { houndHead, quadBody, skeletonLook, specterLook } from './LookUndead';

export function genericLook(c: LookCtx): CreatureLook {
  const v = c.visual;
  const tint = paletteTint(v.palette);
  const glow = v.glow ?? 0xffaa55;
  const key = `gen:${c.id || v.body}`;
  const wk = weaponKind(v.weapon);
  switch (v.body) {
    case 'skeleton':
      return skeletonLook(c, { weapon: wk ?? undefined, rags: true, style: { armed: wk === 'bow' ? 'bow' : wk === 'staff' ? 'staff' : wk ? 'one' : 'none', attacks: wk === 'bow' ? ['shoot'] : ['chop', 'swing'], ranged: wk === 'bow' } });
    case 'armored':
      return skeletonLook(c, { brute: true, armor: 0.8, helm: true, weapon: wk ?? 'axe', style: { armed: 'two', attacks: ['chop', 'swing'] } });
    case 'wraith':
      return specterLook(c, {});
    case 'quadruped':
    case 'beast':
    case 'hound':
      return {
        key,
        rig: () => quadRig({ withers: 0.85, length: 1.0, tail: 4 }),
        sculpt: (s) => {
          quadBody(s, { girth: 0.18, chest: 0.22, legR: 0.05, paws: 'claw' });
          houndHead(s, { len: 0.42, w: 0.11, teeth: true, ears: 0.6 });
          s.paint.skin = { grime: 0.5, ao: 0.9 };
        },
        mats: { skin: { surface: 'fur', tint, glow } },
        style: { heavy: 0.25, attacks: ['bite', 'lunge'], spawn: 'emerge', death: 'flop', idle: 'prowl', gait: 'lope' },
      };
    case 'serpent':
    case 'worm':
      return {
        key,
        rig: () => serpentRig({ length: 2.6, girth: 0.16, front: 4, rear: 5, rise: 0.7 }),
        sculpt: (s) => {
          let prev = 'body';
          for (const n of ['f1', 'f2', 'f3', 'f4', 'head']) {
            s.limb(prev, s.j(prev), s.j(n), 0.16, 0.14, { k: 0.04 });
            prev = n;
          }
          s.ball('head', s.j('head').add(V(0, 0, 0.08)), V(0.13, 0.1, 0.18), { k: 0.04 });
          s.ball('jaw', s.j('jaw').add(V(0, -0.02, 0.08)), V(0.1, 0.05, 0.14), { k: 0.03 });
          prev = 'body';
          for (let i = 1; i <= 5; i++) {
            s.limb(prev, s.j(prev), s.j(`t${i}`), 0.16 * (1 - i * 0.12), 0.16 * (1 - (i + 1) * 0.12), { k: 0.04 });
            prev = `t${i}`;
          }
          s.limb(prev, s.j(prev), s.j('tailTip'), 0.05, 0.015, { k: 0.03 });
          s.pair((_side, x) => s.glow(s.j('head').add(V(x * 0.08, 0.05, 0.12)), 0.03, 1));
          s.paint.skin = { grime: 0.4, ao: 0.9, bands: { axis: 'z', period: 0.12, amount: 0.3 } };
        },
        mats: { skin: { surface: 'scale', tint, glow } },
        style: { heavy: 0.4, attacks: ['bite', 'lash'], spawn: 'emerge', death: 'coil', idle: 'sway', gait: 'slither' },
      };
    case 'floating':
    case 'orb':
    case 'eye':
    case 'wisp':
      return {
        key,
        rig: () => floaterRig({ hover: 1.2, radius: 0.3, orbs: 3, tendrils: 4, segments: 3 }),
        sculpt: (s) => {
          s.ball('core', s.j('core'), 0.3, {});
          s.ball('eye', s.j('eye'), 0.14, { mat: 'alt' });
          s.glow(s.j('eye').add(V(0, 0, 0.1)), 0.1, 2);
          for (let i = 0; i < 3; i++) s.hard(`orb${i}`, ballGeo(s.j(`orb${i}`), 0.07, 1), 'skin', undefined, 1.5);
          for (let i = 0; i < 4; i++) {
            let prev = 'core';
            for (let k = 1; k <= 3; k++) {
              const n = `ten${i}_${k}`;
              s.limb(n, s.j(prev), s.j(n), 0.05 / k, 0.04 / k, { k: 0.02 });
              prev = n;
            }
          }
          s.paint.skin = { grime: 0.2, ao: 0.8 };
        },
        mats: { skin: { surface: 'flesh', tint, glow }, alt: { surface: 'slime', tint: 0xffffff, glow } },
        style: { heavy: 0.1, attacks: ['lunge'], ranged: true, spawn: 'form', death: 'crash', idle: 'hover', gait: 'glide' },
      };
    case 'ooze':
    case 'slime':
    case 'amorphous':
      return {
        key,
        rig: () => oozeRig({ height: 0.9, radius: 0.5, lobes: 5, pods: true }),
        sculpt: (s) => {
          s.ball('body', s.j('body'), V(0.5, 0.32, 0.5), { k: 0.1 });
          s.ball('top', s.j('top'), V(0.3, 0.25, 0.3), { k: 0.15 });
          for (let i = 0; i < 5; i++) s.ball(`lobe${i}`, s.j(`lobe${i}`), 0.18, { k: 0.1 });
          s.pair((side) => s.limb(`pod${side}`, s.j(`pod${side}`), s.j(`pod${side}Tip`), 0.09, 0.04, { k: 0.08 }));
          s.glow(s.j('body'), 0.2, 1.2);
          s.paint.skin = { grime: 0.2, ao: 0.6 };
        },
        mats: { skin: { surface: 'slime', tint, glow } },
        style: { heavy: 0.4, attacks: ['engulf', 'thrust'], spawn: 'form', death: 'splat', idle: 'breathe', gait: 'roll' },
      };
    case 'arachnid':
    case 'spider':
    case 'insectoid':
    case 'insect':
    case 'beetle': {
      const spider = v.body === 'arachnid' || v.body === 'spider';
      return {
        key,
        rig: () => manyLegRig(spider ? 'spider' : 'insect', { body: 0.28, ride: 0.42, pairs: spider ? 4 : 3, wings: v.wings ? 1 : 0, sting: !!v.tail }),
        sculpt: (s) => {
          s.ball('body', s.j('body'), V(0.2, 0.15, 0.28), {});
          s.ball('abdomen', lerpV(s.j('abdomen'), s.j('abdomenTip'), 0.5), V(0.24, 0.2, 0.36), { k: 0.03 });
          s.ball('head', s.j('head'), V(0.12, 0.1, 0.12), { k: 0.03 });
          for (let i = 0; i < 4; i++) {
            s.pair((side) => {
              const l = `leg${i}${side}`;
              if (!s.has(l)) return;
              s.limb(l, s.j(l), s.j(`knee${i}${side}`), 0.03, 0.025, { k: 0.01 });
              s.limb(`knee${i}${side}`, s.j(`knee${i}${side}`), s.j(`tip${i}${side}`), 0.025, 0.008, { k: 0.01 });
            });
          }
          s.pair((side) => s.hard(`mand${side}`, spikeGeo(s.j(`mand${side}`), s.j(`mand${side}Tip`), 0.025, 4), 'skin'));
          s.pair((_side, x) => s.glow(s.j('head').add(V(x * 0.05, 0.05, 0.08)), 0.03, 1.4));
          s.paint.skin = { grime: 0.4, ao: 0.9, bands: { axis: 'z', period: 0.1, amount: 0.3 } };
        },
        mats: { skin: { surface: 'chitin', tint, glow } },
        style: { heavy: 0.2, attacks: ['bite', 'claw'], spawn: 'emerge', death: 'flip', idle: 'twitch', gait: 'scuttle' },
      };
    }
    case 'winged':
    case 'bat':
      return {
        key,
        rig: () => flyerRig({ body: 0.6, hover: 1.4, span: 1.6, tail: v.tail ? 3 : 0 }),
        sculpt: (s) => {
          s.ball('body', s.j('body'), V(0.12, 0.12, 0.2), {});
          s.ball('chest', s.j('chest'), V(0.13, 0.12, 0.13), { k: 0.03 });
          s.ball('head', s.j('head'), 0.08, { k: 0.02 });
          s.pair((side) => {
            s.limb(`wing${side}`, s.j(`wing${side}`), s.j(`wing${side}2`), 0.03, 0.022, { k: 0.01 });
            s.limb(`wing${side}2`, s.j(`wing${side}2`), s.j(`wing${side}3`), 0.022, 0.016, { k: 0.01 });
            s.limb(`wing${side}3`, s.j(`wing${side}3`), s.j(`wing${side}Tip`), 0.016, 0.006, { k: 0.01 });
          });
          s.paint.skin = { grime: 0.4, ao: 0.9 };
        },
        mats: { skin: { surface: 'hide', tint, glow } },
        style: { heavy: 0.1, attacks: ['bite', 'claw'], spawn: 'swoop', death: 'crash', idle: 'hover', gait: 'glide' },
      };
    case 'swarm':
    case 'cluster':
      return {
        key,
        rig: () => swarmRig({ hover: 1.1, radius: 0.5, motes: 14 }),
        sculpt: (s) => {
          for (let i = 0; i < 14; i++) s.hard(`mote${i}`, ballGeo(s.j(`mote${i}`), 0.05, 0), 'skin', undefined, 2);
          s.ball('core', s.j('core'), 0.08, {});
        },
        mats: { skin: { surface: 'crystal', tint, glow } },
        style: { heavy: 0, attacks: ['lunge'], spawn: 'form', death: 'scatter', idle: 'hover', gait: 'glide' },
      };
    default: {
      const giant = v.body === 'colossal' || v.body === 'giant' || v.body === 'golem' || v.body === 'colossus';
      const H = giant ? 2.0 : 1.75;
      return {
        key,
        tier: giant ? 'big' : 'normal',
        rig: () => bipedRig(giant ? 'giant' : 'biped', { height: H, tail: v.tail ? 4 : 0, wings: v.wings ? 1.2 : 0, arms2: (v.limbs ?? 2) >= 4 }),
        sculpt: (s) => {
          trunk(s, { chest: giant ? [0.15, 0.11, 0.12] : [0.1, 0.07, 0.1], shoulders: giant ? 0.06 : 0.035 });
          fleshArms(s, { r: giant ? 0.045 : 0.028, claws: 0.04 });
          if (s.has('arm2L')) fleshArms(s, { r: 0.022, claws: 0.04, set: '2' });
          fleshLegs(s, { r: giant ? 0.06 : 0.04 });
          fleshHead(s, { brow: 1, teeth: [0.8, 0.75, 0.6] });
          skirt(s, { len: 0.35, flare: 0.03 });
          if (wk) weapon(s, wk, {});
          s.paint.skin = { grime: 0.5, ao: 0.9 };
        },
        mats: { skin: { surface: 'flesh', tint, glow }, alt: { surface: 'cloth', tint: 0x3a3028, glow }, metal: { surface: 'iron', tint: 0xa09890, glow } },
        style: {
          heavy: giant ? 0.85 : 0.3,
          attacks: wk === 'bow' ? ['shoot'] : giant ? ['slam', 'swing'] : ['swing', 'chop'],
          armed: wk === 'bow' ? 'bow' : wk === 'staff' ? 'staff' : wk ? 'one' : 'none',
          ranged: wk === 'bow',
          spawn: 'rise',
          death: giant ? 'crash' : 'collapse',
          idle: 'breathe',
          gait: giant ? 'lumber' : 'walk',
        },
      };
    }
  }
}
