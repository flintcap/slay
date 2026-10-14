/**
 * SLAY — oozes: spawn and green slime, acid ooze, tar crawler, the
 * gelatinous mass, magma ooze, plague pudding, glass gel, void slime and the
 * devourer pudding.
 *
 * All one shape at heart (a mass that heaves and spreads), so each is told
 * apart by what it is and what it carries: a cube with a dead adventurer in
 * it, black tar dragging bones, a crust of rock on fire, pustules and flies,
 * glass shards, stars, a mouth that is most of the body.
 */
import * as THREE from 'three';
import type { LookFactory } from './Looks';
import type { RGB, Sculpt } from './Sculpt';
import { ballGeo, boxGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, lerpV, seq } from './Kit';
import { blobLook, eyeball, maw, tentacle } from './LookAberration';
import { crystals, facet } from './LookElemental';

const BONE: RGB = [0.85, 0.8, 0.65];
const TOOTH: RGB = [0.85, 0.8, 0.62];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** The common mass: a body, a top, lobes round the base, two pseudopods. */
function mass(s: Sculpt, H: number, R: number, o: { lobes: number; top?: number; flat?: number; pod?: number; lobe?: number } = { lobes: 5 }): void {
  const b = s.j('body');
  const t = s.j('top');
  const fl = o.flat ?? 1;
  s.ball('body', b, V(R * 0.95, H * 0.34 * fl, R * 0.9));
  s.ball('top', t, V(R * 0.62 * (o.top ?? 1), H * 0.3 * fl * (o.top ?? 1), R * 0.58 * (o.top ?? 1)), { k: R * 0.2 });
  for (let i = 0; i < o.lobes; i++) s.ball(`lobe${i}`, s.j(`lobe${i}`), R * (o.lobe ?? 0.28), { k: R * 0.15 });
  // Pseudopods: fat at the root, sunk into the mass, so they read as jelly reaching out, not horns.
  const pr = (o.pod ?? 0.1) * 1.6;
  s.pair((side) => {
    s.limb(`pod${side}`, s.j(`pod${side}`).add(V(0, -H * 0.04, -R * 0.1)), s.j(`pod${side}2`), R * pr * 1.5, R * pr, { k: R * 0.22 });
    s.limb(`pod${side}2`, s.j(`pod${side}2`), s.j(`pod${side}Tip`), R * pr, R * pr * 0.55, { k: R * 0.12 });
    s.ball(`pod${side}2`, s.j(`pod${side}Tip`).add(V(0, -R * 0.02, 0)), R * pr * 0.62, { k: R * 0.06 });
  });
}

/** Drips sliding down the sides. */
function drips(s: Sculpt, H: number, R: number, n: number, seed: number, mat: 'skin' | 'alt' = 'skin'): void {
  const r = seq(seed);
  const b = s.j('body');
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const p = b.clone().add(V(Math.sin(a) * R * 0.88, H * (0.05 + r() * 0.15), Math.cos(a) * R * 0.82));
    s.limb('body', p, p.clone().add(V(Math.sin(a) * R * 0.08, -H * (0.12 + r() * 0.12), Math.cos(a) * R * 0.08)), R * 0.07, R * 0.04, { mat, k: R * 0.06 });
  }
}

/** Bubbles rising in or on the surface, some glowing. */
function bubbles(s: Sculpt, bone: string, c: THREE.Vector3, spread: THREE.Vector3, n: number, r: number, seed: number, col: RGB, glow = 0.6): void {
  const rnd = seq(seed);
  for (let i = 0; i < n; i++) {
    const p = c.clone().add(V((rnd() - 0.5) * 2 * spread.x, (rnd() - 0.5) * 2 * spread.y, (rnd() - 0.5) * 2 * spread.z));
    s.boil(bone, p, r * (0.5 + rnd()), glow, col);
  }
}

/** A skull, half sunk: dome, sockets, a jaw of teeth. */
function skullAt(s: Sculpt, bone: string, c: THREE.Vector3, r: number, face: THREE.Vector3): void {
  const d = face.clone().normalize();
  s.hard(bone, ballGeo(c, r, 1), 'metal', BONE);
  const u = V(0, 1, 0).cross(d).normalize();
  s.pair((_side, x) => s.hard(bone, ballGeo(c.clone().addScaledVector(d, r * 0.75).addScaledVector(u, x * r * 0.38).add(V(0, r * 0.1, 0)), r * 0.25, 0), 'metal', [0.05, 0.04, 0.03]));
  s.hard(bone, boxGeo(c.clone().addScaledVector(d, r * 0.55).add(V(0, -r * 0.65, 0)), V(r * 0.9, r * 0.35, r * 0.6), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d)), 'metal', BONE);
}

// ---------------------------------------------------------------------------

const OOZE: Record<string, LookFactory> = {
  ooze_spawn: (c) =>
    blobLook(c, {
      height: 0.6,
      radius: 0.34,
      lobes: 3,
      tier: 'small',
      skin: { surface: 'slime', tint: 0x6a9a3a },
      sculpt: (s, H, R) => {
        // A wobbling droplet with two bright beads for eyes.
        mass(s, H, R, { lobes: 3, top: 1.15, pod: 0.08 });
        const t = s.j('top');
        s.ball('top', t.clone().add(V(0, H * 0.25, -R * 0.05)), V(R * 0.3, H * 0.25, R * 0.3), { k: R * 0.25 });
        s.pair((_side, x) => s.eye('top', t.clone().add(V(x * R * 0.18, H * 0.05, R * 0.5)), R * 0.07, 1.4));
        s.ball('body', s.j('body'), R * 0.3, { mat: 'alt', k: R * 0.1 });
        bubbles(s, 'body', s.j('body'), V(R * 0.5, H * 0.15, R * 0.5), 4, R * 0.04, 31, [0.7, 1.1, 0.4], 0.5);
      },
      alt: { surface: 'slime', tint: 0x2a4a1a },
      paint: { skin: { grime: 0.1, ao: 0.5, top: { amount: 0.3, col: [1.2, 1.3, 1.1] } }, alt: { grime: 0, ao: 0.4 } },
      style: { heavy: 0.15, attacks: ['engulf'], spawn: 'drop', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  green_slime: (c) =>
    blobLook(c, {
      height: 0.95,
      radius: 0.52,
      lobes: 5,
      skin: { surface: 'slime', tint: 0x5a9a3a },
      alt: { surface: 'slime', tint: 0x1a3a10 },
      sculpt: (s, H, R) => {
        // A glistening dome, a dark nucleus inside, half-dissolved bones in its belly.
        mass(s, H, R, { lobes: 5 });
        s.ball('body', s.j('body').add(V(0, H * 0.12, 0)), R * 0.35, { mat: 'alt', k: R * 0.12 });
        s.boil('body', s.j('body').add(V(0, H * 0.12, R * 0.15)), R * 0.12, 0.7, [0.7, 1.2, 0.4]);
        drips(s, H, R, 6, 41);
        bubbles(s, 'top', s.j('top'), V(R * 0.45, H * 0.2, R * 0.45), 6, R * 0.05, 43, [0.75, 1.1, 0.5], 0.3);
        skullAt(s, 'body', s.j('body').add(V(R * 0.5, -H * 0.05, R * 0.5)), R * 0.12, V(1, 0, 1));
        s.hard('body', tubeGeo([s.j('body').add(V(-R * 0.7, -H * 0.1, R * 0.3)), s.j('body').add(V(-R * 0.35, -H * 0.05, R * 0.7))], () => R * 0.025, 5), 'metal', BONE);
      },
      paint: { skin: { grime: 0.15, ao: 0.6, top: { amount: 0.3, col: [1.25, 1.35, 1.15] } }, alt: { grime: 0, ao: 0.4 } },
      style: { heavy: 0.4, attacks: ['engulf', 'thrust'], spawn: 'drop', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  acid_ooze: (c) =>
    blobLook(c, {
      height: 0.9,
      radius: 0.5,
      lobes: 6,
      skin: { surface: 'slime', tint: 0x9aaa3a },
      alt: { surface: 'slime', tint: 0xd8e050 },
      sculpt: (s, H, R) => {
        // Seething yellow-green: pits that smoke, bright bubbles, acid running off.
        mass(s, H, R, { lobes: 6, top: 0.9 });
        const t = s.j('top');
        const r = seq(51);
        for (let i = 0; i < 6; i++) {
          const a = r() * Math.PI * 2;
          const p = t.clone().add(V(Math.sin(a) * R * 0.45, H * (0.05 + r() * 0.2), Math.cos(a) * R * 0.4));
          s.ball('top', p, R * (0.08 + r() * 0.06), { sub: true, k: R * 0.03 });
          s.boil('top', p.clone().add(V(0, -R * 0.04, 0)), R * 0.05, 1, [1.1, 1.3, 0.3]);
        }
        bubbles(s, 'body', s.j('body').add(V(0, H * 0.1, 0)), V(R * 0.8, H * 0.2, R * 0.7), 10, R * 0.05, 53, [1.0, 1.25, 0.35], 0.9);
        drips(s, H, R, 8, 55, 'alt');
        s.pair((side) => s.boil(`pod${side}2`, s.j(`pod${side}Tip`), R * 0.07, 1, [1.1, 1.3, 0.3]));
      },
      paint: { skin: { grime: 0.2, ao: 0.6, mottle: { scale: 7, amount: 0.4, col: [0.85, 0.95, 0.35] } }, alt: { grime: 0, ao: 0.4 } },
      style: { heavy: 0.35, attacks: ['engulf', 'hurl'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  tar_crawler: (c) =>
    blobLook(c, {
      height: 0.6,
      radius: 0.62,
      lobes: 7,
      skin: { surface: 'slime', tint: 0x1a181c },
      alt: { surface: 'slime', tint: 0x0a0a0c },
      sculpt: (s, H, R) => {
        // A low spreading slick of black tar, dragging bones, two cold eyes riding on it.
        mass(s, H, R, { lobes: 7, flat: 0.8, top: 0.75, lobe: 0.32, pod: 0.12 });
        const t = s.j('top');
        s.pair((_side, x) => {
          const p = t.clone().add(V(x * R * 0.18, H * 0.18, R * 0.3));
          s.limb('top', p.clone().add(V(0, -H * 0.15, 0)), p, R * 0.06, R * 0.04, { k: R * 0.05 });
          s.eye('top', p.clone().add(V(0, R * 0.03, R * 0.02)), R * 0.05, 1.6);
        });
        // Strings of tar dripping from the pseudopods, a rib cage and a sword hilt stuck in it.
        s.pair((side) => {
          const tp = s.j(`pod${side}Tip`);
          s.limb(`pod${side}2`, tp, tp.clone().add(V(0, -H * 0.25, 0)), R * 0.03, R * 0.015, { k: R * 0.02 });
        });
        const b = s.j('body');
        for (let i = 0; i < 4; i++) s.hard('body', tubeGeo([b.clone().add(V(-R * 0.6, H * 0.05, -R * 0.2 + i * R * 0.12)), b.clone().add(V(-R * 0.45, H * 0.28, -R * 0.15 + i * R * 0.12)), b.clone().add(V(-R * 0.25, H * 0.25, -R * 0.1 + i * R * 0.12))], () => R * 0.018, 4), 'metal', BONE);
        skullAt(s, 'body', b.clone().add(V(R * 0.55, H * 0.1, R * 0.35)), R * 0.11, V(0.6, 0.3, 1));
        s.hard('body', tubeGeo([b.clone().add(V(R * 0.2, H * 0.2, -R * 0.5)), b.clone().add(V(R * 0.3, H * 0.6, -R * 0.65))], () => R * 0.02, 5), 'metal', [0.5, 0.45, 0.4]);
        s.hard('body', boxGeo(b.clone().add(V(R * 0.22, H * 0.28, -R * 0.53)), V(R * 0.18, R * 0.03, R * 0.04)), 'metal', [0.5, 0.45, 0.4]);
      },
      metal: { surface: 'bone', tint: 0xc8bca0 },
      paint: { skin: { grime: 0, ao: 0.6, top: { amount: 0.35, col: [1.6, 1.6, 1.8] } }, alt: { grime: 0, ao: 0.4 } },
      style: { heavy: 0.45, attacks: ['lash', 'engulf'], spawn: 'emerge', death: 'splat', idle: 'still', gait: 'roll' },
    }),
  gelatinous_mass: (c) =>
    blobLook(c, {
      height: 1.15,
      radius: 0.6,
      lobes: 4,
      tier: 'big',
      skin: { surface: 'jelly', tint: 0x8ac0e0 },
      alt: { surface: 'slime', tint: 0x3a6a98 },
      sculpt: (s, H, R) => {
        // A cube of jelly, corners slumping, with a dead adventurer suspended inside.
        const b = s.j('body');
        const t = s.j('top');
        s.box('body', b.clone().add(V(0, H * 0.08, 0)), V(R * 0.85, H * 0.42, R * 0.85), { k: R * 0.1, round: R * 0.18 });
        s.box('top', t.clone().add(V(0, -H * 0.05, 0)), V(R * 0.78, H * 0.22, R * 0.78), { k: R * 0.15, round: R * 0.2 });
        for (let i = 0; i < 4; i++) s.ball(`lobe${i}`, s.j(`lobe${i}`), R * 0.25, { k: R * 0.15 });
        s.pair((side) => {
          s.limb(`pod${side}`, s.j(`pod${side}`).add(V(0, 0, -R * 0.15)), s.j(`pod${side}2`), R * 0.24, R * 0.16, { k: R * 0.2 });
          s.limb(`pod${side}2`, s.j(`pod${side}2`), s.j(`pod${side}Tip`), R * 0.16, R * 0.09, { k: R * 0.1 });
        });
        // The victim: a skeleton curled inside, a sword, a helmet, coins.
        const k = b.clone().add(V(0, H * 0.05, 0));
        skullAt(s, 'body', k.clone().add(V(R * 0.1, H * 0.3, R * 0.25)), R * 0.11, V(0.3, -0.2, 1));
        s.hard('body', ballGeo(k.clone().add(V(R * 0.1, H * 0.38, R * 0.22)), R * 0.13, 1), 'metal', [0.55, 0.55, 0.58]);
        for (let i = 0; i < 4; i++) s.hard('body', tubeGeo([k.clone().add(V(-R * 0.15, H * 0.15 - i * H * 0.05, R * 0.05)), k.clone().add(V(R * 0.05, H * 0.17 - i * H * 0.05, R * 0.25)), k.clone().add(V(R * 0.25, H * 0.15 - i * H * 0.05, R * 0.1))], () => R * 0.015, 4), 'metal', BONE);
        s.hard('body', tubeGeo([k.clone().add(V(-R * 0.1, H * 0.2, 0)), k.clone().add(V(-R * 0.15, -H * 0.15, R * 0.05))], () => R * 0.025, 5), 'metal', BONE);
        for (const [a, bb] of [[V(R * 0.2, -H * 0.1, R * 0.1), V(R * 0.45, -H * 0.3, R * 0.35)], [V(-R * 0.05, -H * 0.1, R * 0.15), V(-R * 0.4, -H * 0.25, R * 0.4)], [V(R * 0.2, H * 0.1, R * 0.2), V(R * 0.5, H * 0.0, R * 0.5)]] as const) s.hard('body', tubeGeo([k.clone().add(a), k.clone().add(bb)], () => R * 0.02, 4), 'metal', BONE);
        s.hard('body', tubeGeo([k.clone().add(V(-R * 0.55, -H * 0.3, -R * 0.3)), k.clone().add(V(R * 0.3, H * 0.35, -R * 0.45))], () => R * 0.018, 4), 'metal', [0.7, 0.72, 0.75]);
        s.hard('body', boxGeo(k.clone().add(V(-R * 0.45, -H * 0.18, -R * 0.33)), V(R * 0.2, R * 0.03, R * 0.05), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.9)), 'metal', [0.6, 0.5, 0.3]);
        const r = seq(61);
        for (let i = 0; i < 8; i++) s.hard('body', ballGeo(k.clone().add(V((r() - 0.5) * R * 1.2, -H * 0.3 + r() * H * 0.15, (r() - 0.5) * R * 1.2)), R * 0.035, 0), 'metal', [0.95, 0.75, 0.3], 0.3);
      },
      metal: { surface: 'bone', tint: 0xc8bca0 },
      paint: { skin: { grime: 0, ao: 0.4, top: { amount: 0.35, col: [1.3, 1.4, 1.5] } }, alt: { grime: 0, ao: 0.4 } },
      style: { heavy: 0.7, attacks: ['engulf', 'thrust'], spawn: 'drop', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  magma_ooze: (c) =>
    blobLook(c, {
      height: 0.9,
      radius: 0.52,
      lobes: 6,
      skin: { surface: 'lava', tint: 0xc05020 },
      alt: { surface: 'basalt', tint: 0x2a2220 },
      sculpt: (s, H, R) => {
        // Molten rock that crawls: plates of black crust riding on it, fire showing between.
        mass(s, H, R, { lobes: 6 });
        const t = s.j('top');
        const b = s.j('body');
        const r = seq(71);
        for (let i = 0; i < 9; i++) {
          const a = r() * Math.PI * 2;
          const e = 0.2 + r() * 0.9;
          const onTop = i < 4;
          const base = onTop ? t : b;
          const rr = onTop ? R * 0.62 : R * 0.95;
          const hh = onTop ? H * 0.3 : H * 0.34;
          const p = base.clone().add(V(Math.sin(a) * Math.sin(e) * rr, Math.cos(e) * hh, Math.cos(a) * Math.sin(e) * rr * 0.95));
          facet(s, onTop ? 'top' : 'body', p, V(R * (0.14 + r() * 0.08), R * 0.05, R * (0.12 + r() * 0.08)), 73 + i, 'alt', R * 0.02);
        }
        bubbles(s, 'top', t.clone().add(V(0, H * 0.25, 0)), V(R * 0.3, H * 0.05, R * 0.3), 4, R * 0.05, 79, [1.4, 0.7, 0.2], 1);
        // Smoke vents and dripping fire.
        for (let i = 0; i < 3; i++) s.hard('top', spikeGeo(t.clone().add(V((i - 1) * R * 0.25, H * 0.28, -R * 0.1)), t.clone().add(V((i - 1) * R * 0.3, H * 0.5, -R * 0.2)), R * 0.06, 4, undefined, 2), 'alt', [0.15, 0.13, 0.12]);
        drips(s, H, R, 6, 81);
      },
      paint: { skin: { grime: 0.2, ao: 0.7, veins: { scale: 9, cut: 0.95, glow: 0.6, col: [1.3, 0.6, 0.2] } }, alt: { grime: 0.4, ao: 0.85, top: { amount: 0.2, col: [1.2, 1.15, 1.1] } } },
      style: { heavy: 0.45, attacks: ['engulf', 'hurl'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  plague_pudding: (c) =>
    blobLook(c, {
      height: 1.15,
      radius: 0.62,
      lobes: 7,
      tier: 'big',
      skin: { surface: 'rot', tint: 0x7a8a4a },
      alt: { surface: 'slime', tint: 0x9aba3a },
      sculpt: (s, H, R) => {
        // A sagging heap of diseased pudding: pustules, sores, a cloud of flies, a rat's skull.
        mass(s, H, R, { lobes: 7, lobe: 0.3 });
        const t = s.j('top');
        const b = s.j('body');
        const r = seq(91);
        for (let i = 0; i < 16; i++) {
          const a = r() * Math.PI * 2;
          const onTop = i % 2 === 0;
          const p = (onTop ? t : b).clone().add(V(Math.sin(a) * R * (onTop ? 0.55 : 0.88), (onTop ? H * 0.15 : H * 0.05) + r() * H * 0.15, Math.cos(a) * R * (onTop ? 0.5 : 0.82)));
          s.boil(onTop ? 'top' : 'body', p, R * (0.04 + r() * 0.05), 0.8, [0.8, 1.2, 0.3]);
        }
        for (let i = 0; i < 5; i++) {
          const a = r() * Math.PI * 2;
          const p = b.clone().add(V(Math.sin(a) * R * 0.9, H * (0.0 + r() * 0.2), Math.cos(a) * R * 0.85));
          s.ball('body', p, R * 0.08, { sub: true, k: R * 0.03 });
          s.tint(p, R * 0.1, [0.45, 0.2, 0.15]);
        }
        // Flies: a loose cloud of specks over the top.
        for (let i = 0; i < 14; i++) s.hard('top', ballGeo(t.clone().add(V((r() - 0.5) * R * 1.3, H * (0.35 + r() * 0.35), (r() - 0.5) * R * 1.2)), R * 0.018, 0), 'metal', [0.05, 0.05, 0.04]);
        skullAt(s, 'top', t.clone().add(V(-R * 0.35, H * 0.12, R * 0.35)), R * 0.08, V(-0.4, 0.2, 1));
        drips(s, H, R, 7, 93, 'alt');
      },
      metal: { surface: 'bone', tint: 0xc8bca0 },
      paint: { skin: { grime: 0.5, ao: 0.9, mottle: { scale: 5, amount: 0.55, col: [0.55, 0.5, 0.3] } }, alt: { grime: 0, ao: 0.5 } },
      style: { heavy: 0.75, attacks: ['engulf', 'hurl', 'thrust'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  glass_gel: (c) =>
    blobLook(c, {
      height: 0.95,
      radius: 0.5,
      lobes: 5,
      skin: { surface: 'jelly', tint: 0xb0e0f0 },
      alt: { surface: 'crystal', tint: 0xe8f8ff, rough: 0.35 },
      sculpt: (s, H, R) => {
        // Gel set like glass, shards of itself growing out, a cold light at the heart.
        mass(s, H, R, { lobes: 5, top: 0.95 });
        const t = s.j('top');
        crystals(s, 'top', t.clone().add(V(0, H * 0.15, 0)), 9, R * 0.75, R * 0.08, 101, V(0, 1, 0), 0.9, 'alt');
        crystals(s, 'body', s.j('body').add(V(0, H * 0.05, 0)), 8, R * 0.6, R * 0.07, 103, V(0, 0.3, 0), 1.3, 'alt');
        s.boil('body', s.j('body').add(V(0, H * 0.1, 0)), R * 0.18, 1, [0.8, 1.1, 1.3]);
        s.pair((side) => crystals(s, `pod${side}2`, s.j(`pod${side}Tip`), 3, R * 0.25, R * 0.04, side === 'L' ? 105 : 106, V(0, 0.2, 1), 0.4, 'alt'));
      },
      paint: { skin: { grime: 0, ao: 0.4, top: { amount: 0.3, col: [1.3, 1.35, 1.4] } }, alt: { grime: 0, ao: 0.3, tips: { amount: 0.5, col: [1.4, 1.5, 1.6] } } },
      style: { heavy: 0.4, attacks: ['hurl', 'engulf'], ranged: true, spawn: 'emerge', death: 'splat', idle: 'still', gait: 'roll' },
    }),
  void_slime: (c) =>
    blobLook(c, {
      height: 0.95,
      radius: 0.52,
      lobes: 5,
      skin: { surface: 'slime', tint: 0x4a3270 },
      alt: { surface: 'slime', tint: 0x1a0e24 },
      sculpt: (s, H, R) => {
        // A piece of the night sky that eats: stars glinting in it, one great eye.
        mass(s, H, R, { lobes: 5, top: 1.05 });
        const r = seq(111);
        const b = s.j('body');
        const t = s.j('top');
        for (let i = 0; i < 34; i++) {
          const onTop = i % 3 === 0;
          const a = r() * Math.PI * 2;
          const e = r() * 1.3;
          const rr = onTop ? R * 0.6 : R * 0.93;
          const hh = onTop ? H * 0.3 : H * 0.34;
          const p = (onTop ? t : b).clone().add(V(Math.sin(a) * Math.sin(e) * rr, Math.cos(e) * hh, Math.cos(a) * Math.sin(e) * rr * 0.97));
          s.boil(onTop ? 'top' : 'body', p, R * (0.025 + r() * 0.03), 1, [1.2, 1.1, 1.4]);
        }
        eyeball(s, 'top', t.clone().add(V(0, H * 0.08, R * 0.45)), R * 0.18, V(0, 0.1, 1), [1.1, 0.4, 1.3], false);
        s.ball('top', t.clone().add(V(0, H * 0.08, R * 0.6)), R * 0.17, { sub: true, k: R * 0.04 });
      },
      paint: { skin: { grime: 0, ao: 0.6, mottle: { scale: 4, amount: 0.5, col: [0.35, 0.2, 0.7] }, top: { amount: 0.3, col: [1.3, 1.2, 1.6] } }, alt: { grime: 0, ao: 0.4 } },
      style: { heavy: 0.4, attacks: ['engulf', 'lash'], spawn: 'form', death: 'fade', idle: 'breathe', gait: 'roll' },
    }),
  devourer_pudding: (c) =>
    blobLook(c, {
      height: 1.2,
      radius: 0.62,
      lobes: 6,
      tier: 'big',
      skin: { surface: 'flesh', tint: 0x9a3a3a },
      alt: { surface: 'slime', tint: 0x6a1a1a },
      sculpt: (s, H, R) => {
        // Mostly mouth: a great toothed maw on top, smaller mouths round the sides, tendrils groping.
        mass(s, H, R, { lobes: 6, top: 1.1, pod: 0.13 });
        const t = s.j('top');
        maw(s, 'top', t.clone().add(V(0, H * 0.18, R * 0.3)), R * 0.42, V(0, 0.6, 1), 16, 0.3);
        maw(s, 'top', t.clone().add(V(0, H * 0.14, R * 0.25)), R * 0.28, V(0, 0.6, 1), 12, 0);
        const b = s.j('body');
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 1;
          maw(s, 'body', b.clone().add(V(Math.sin(a) * R * 0.85, H * 0.05, Math.cos(a) * R * 0.8)), R * 0.13, V(Math.sin(a), 0.1, Math.cos(a)), 8, 0);
        }
        // Tongue lolling out of the maw.
        tentacle(s, 'top', t.clone().add(V(0, H * 0.1, R * 0.5)), V(0.1, -0.3, 1), R * 0.7, R * 0.09, V(0, -H * 0.2, 0), 'alt');
        // Four groping tendrils besides the pods.
        const r = seq(121);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4 - 0.5) * 2.2 + Math.PI;
          const p = t.clone().add(V(Math.sin(a) * R * 0.45, H * 0.05, Math.cos(a) * R * 0.4));
          tentacle(s, 'top', p, V(Math.sin(a), 0.5, Math.cos(a)), R * (0.8 + r() * 0.3), R * 0.08, V(0, -H * 0.15, R * 0.2));
        }
        s.pair((side) => {
          for (let k = 0; k < 3; k++) s.hard(`pod${side}2`, spikeGeo(lerpV(s.j(`pod${side}2`), s.j(`pod${side}Tip`), 0.3 + k * 0.25), lerpV(s.j(`pod${side}2`), s.j(`pod${side}Tip`), 0.3 + k * 0.25).add(V(0, R * 0.12, -R * 0.04)), R * 0.03, 4, undefined, 1), 'metal', TOOTH);
        });
      },
      metal: { surface: 'bone', tint: 0xd0c4a8 },
      paint: { skin: { grime: 0.45, ao: 0.9, mottle: { scale: 5, amount: 0.5, col: [0.6, 0.25, 0.3] }, tips: { amount: 0.4, col: [0.9, 0.5, 0.5] } }, alt: { grime: 0, ao: 0.5 } },
      style: { heavy: 0.8, attacks: ['engulf', 'lash', 'thrust'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
};

export { OOZE, mass, drips, bubbles, skullAt };
