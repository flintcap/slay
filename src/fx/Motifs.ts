/**
 * SLAY fx: skill motifs, the drawing that makes a skill its own.
 *
 * A motif is a SHAPE laid out in a MOTION. The shape says what is drawn
 * (skulls, thrown knives, rune wheels, fire pillars, cracks in the floor);
 * the motion says where the pieces go and how they move (they burst out,
 * rain down, spiral in, orbit the caster, march in a line). `EffectSystem.motif`
 * draws it on top of the skill's family drawing, so two novas of one school
 * are no longer the same ring in two hues.
 *
 * Which skill draws which motif lives in `SkillLooks.ts`. This file is the
 * vocabulary: plain words on one side, kit primitives on the other.
 */

import type { Rng } from '../types';
import type { GroundKind } from './kit/Ground';
import type { SolidShape } from './kit/Solids';
import type { CORE_STYLE, COLUMN_STYLE, SHELL_STYLE } from './kit/Shapes';

/** How one kind of piece is drawn. Sizes are metres. */
export type MotifDraw =
  /** A camera-facing glow or glyph that can fly. `trail` gives it a ribbon wake. */
  | { k: 'core'; style: keyof typeof CORE_STYLE; size: number; trail?: boolean }
  /** A lit solid that can fly; `land` bursts where it stops. */
  | { k: 'solid'; shape: SolidShape; size: number; land?: string }
  /** A vertical shaft standing where the piece lands. */
  | { k: 'column'; style: keyof typeof COLUMN_STYLE; size: number; height: number }
  /** A dome or sphere swelling where the piece lands. */
  | { k: 'shell'; style: keyof typeof SHELL_STYLE; size: number }
  /** Light painted on the floor. */
  | { k: 'glow'; kind: GroundKind; size: number; life: number }
  /** A lasting mark on the floor. */
  | { k: 'mark'; kind: string; size: number }
  /** Lightning joining the pieces in order. */
  | { k: 'arc'; width: number }
  /** A crescent of light swept round each piece. */
  | { k: 'slash'; size: number }
  /** A particle burst at each piece. */
  | { k: 'puff'; emitter: string; scale: number };

/**
 * Every shape a motif can draw, by its plain name. Each name is a different
 * drawing: a different picture, not the same one in another colour.
 */
export const MOTIF_SHAPES = {
  // Glows and glyphs (they fly).
  embers: { k: 'core', style: 'fireball', size: 0.32, trail: true },
  sparks: { k: 'core', style: 'plasma', size: 0.28 },
  flares: { k: 'core', style: 'flare', size: 0.5 },
  globs: { k: 'core', style: 'glob', size: 0.34 },
  'frost orbs': { k: 'core', style: 'frost', size: 0.34 },
  'void orbs': { k: 'core', style: 'void', size: 0.45 },
  wisps: { k: 'core', style: 'soft', size: 0.42, trail: true },
  'bone wisps': { k: 'core', style: 'bone', size: 0.34, trail: true },
  comets: { k: 'core', style: 'orb', size: 0.3, trail: true },
  skulls: { k: 'core', style: 'skull', size: 0.55 },
  'rune wheels': { k: 'core', style: 'rune', size: 0.75 },
  crescents: { k: 'core', style: 'crescent', size: 0.6 },
  stars: { k: 'core', style: 'star', size: 0.5 },
  hoops: { k: 'core', style: 'ring', size: 0.6 },
  eyes: { k: 'core', style: 'eye', size: 0.55 },
  leaves: { k: 'core', style: 'petal', size: 0.42 },
  'smoke puffs': { k: 'core', style: 'smoke', size: 0.95 },
  crosses: { k: 'core', style: 'cross', size: 0.6 },
  'hex sigils': { k: 'core', style: 'hex', size: 0.7 },
  'claw rakes': { k: 'core', style: 'claw', size: 0.7 },
  hearts: { k: 'core', style: 'heart', size: 0.5 },
  // Solids (they fly and land).
  arrows: { k: 'solid', shape: 'arrow', size: 0.9, land: 'dust' },
  'ice shards': { k: 'solid', shape: 'shard', size: 0.55, land: 'frost' },
  'bone spears': { k: 'solid', shape: 'spear', size: 0.8, land: 'chips.bone' },
  stones: { k: 'solid', shape: 'rock', size: 0.4, land: 'chips.stone' },
  'bone spikes': { k: 'solid', shape: 'spike', size: 0.9, land: 'chips.bone' },
  knives: { k: 'solid', shape: 'blade', size: 0.7, land: 'sparks' },
  thorns: { k: 'solid', shape: 'thorn', size: 0.75, land: 'puff.spores' },
  crystals: { k: 'solid', shape: 'crystal', size: 0.6, land: 'arcane' },
  cinders: { k: 'solid', shape: 'cinder', size: 0.32, land: 'embers' },
  fangs: { k: 'solid', shape: 'fang', size: 0.55, land: 'poison' },
  saws: { k: 'solid', shape: 'saw', size: 0.6, land: 'sparks' },
  feathers: { k: 'solid', shape: 'feather', size: 0.5 },
  // Shafts and shells (they stand where they land).
  'light shafts': { k: 'column', style: 'light', size: 0.35, height: 4.5 },
  'whirl columns': { k: 'column', style: 'swirl', size: 0.7, height: 2.6 },
  'fire pillars': { k: 'column', style: 'fire', size: 0.45, height: 3.2 },
  'lightning strikes': { k: 'column', style: 'strike', size: 0.3, height: 9 },
  domes: { k: 'shell', style: 'ward', size: 0.9 },
  halos: { k: 'shell', style: 'aura', size: 0.8 },
  shockfronts: { k: 'shell', style: 'front', size: 1.1 },
  'ice shells': { k: 'shell', style: 'ice', size: 0.7 },
  // Light on the floor.
  'rune circles': { k: 'glow', kind: 'runeCircle', size: 0.9, life: 1.4 },
  'sigil brands': { k: 'glow', kind: 'sigilGlow', size: 0.9, life: 1.8 },
  'shock rings': { k: 'glow', kind: 'shockRing', size: 1.1, life: 0.5 },
  'fire pools': { k: 'glow', kind: 'firePool', size: 0.8, life: 2.2 },
  'frost fields': { k: 'glow', kind: 'frostField', size: 0.9, life: 2.2 },
  'venom pools': { k: 'glow', kind: 'poisonPool', size: 0.8, life: 2.6 },
  'void pools': { k: 'glow', kind: 'voidPool', size: 0.9, life: 2.0 },
  'storm fields': { k: 'glow', kind: 'stormField', size: 0.9, life: 1.4 },
  'holy fields': { k: 'glow', kind: 'holyField', size: 0.9, life: 1.6 },
  'light pools': { k: 'glow', kind: 'lightPool', size: 0.8, life: 1.4 },
  'aura rings': { k: 'glow', kind: 'auraRing', size: 1.0, life: 1.2 },
  wedges: { k: 'glow', kind: 'wedge', size: 1.2, life: 0.8 },
  'cinder beds': { k: 'glow', kind: 'cinders', size: 0.8, life: 2.4 },
  'fork burns': { k: 'glow', kind: 'forkGlow', size: 0.9, life: 1.1 },
  'acid glows': { k: 'glow', kind: 'acidGlow', size: 0.8, life: 2.4 },
  // Marks that stay on the floor.
  cracks: { k: 'mark', kind: 'crack', size: 0.9 },
  craters: { k: 'mark', kind: 'crater', size: 0.7 },
  'scorch marks': { k: 'mark', kind: 'scorch', size: 0.6 },
  rime: { k: 'mark', kind: 'ice', size: 0.7 },
  scuffs: { k: 'mark', kind: 'dust', size: 0.6 },
  'ash heaps': { k: 'mark', kind: 'ash', size: 0.6 },
  'blood pools': { k: 'mark', kind: 'blood', size: 0.55 },
  'bone litter': { k: 'mark', kind: 'bone', size: 0.6 },
  sigils: { k: 'mark', kind: 'sigil', size: 0.8 },
  // Lightning and blades of light.
  arcs: { k: 'arc', width: 0.16 },
  slashes: { k: 'slash', size: 1.5 },
  // Particle bursts.
  'smoke clouds': { k: 'puff', emitter: 'smoke', scale: 1.4 },
  'dust clouds': { k: 'puff', emitter: 'puff.dust', scale: 1.8 },
  'spore clouds': { k: 'puff', emitter: 'puff.spores', scale: 1.8 },
  'steam jets': { k: 'puff', emitter: 'steam', scale: 1.4 },
  snowfall: { k: 'puff', emitter: 'puff.snow', scale: 1.6 },
  'blood spray': { k: 'puff', emitter: 'puff.blood', scale: 1.6 },
  bubbles: { k: 'puff', emitter: 'puff.bubbles', scale: 1.8 },
  'ash flurries': { k: 'puff', emitter: 'ash', scale: 1.5 },
  motes: { k: 'puff', emitter: 'puff.motes', scale: 1.6 },
} as const satisfies Record<string, MotifDraw>;

export type MotifShape = keyof typeof MOTIF_SHAPES;

/** How pieces move between where they start and where they end. */
export const Path = {
  /** Straight there, slowing down, with an optional hop. */
  Line: 0,
  /** Straight there, speeding up: falling. */
  Fall: 1,
  /** Round a centre: radius, angle and height all change. */
  Swirl: 2,
  /** Appears in place, swells and fades. */
  Hold: 3,
  /** Comes up out of the floor and stays. */
  Rise: 4,
} as const;
export type Path = (typeof Path)[keyof typeof Path];

/** One piece of a motif, in floor-relative metres. */
export interface Piece {
  sx: number; sy: number; sz: number;
  ex: number; ey: number; ez: number;
  delay: number;
  dur: number;
  path: Path;
  /** Line: hop height. */
  arc: number;
  /** Swirl: start and end radius, start angle and sweep (radians). */
  r0: number; r1: number; a0: number; sweep: number;
  /** Size multiplier. */
  grow: number;
}

/** Where a motif is drawn: an anchor, the caster's facing and the far point. */
export interface MotifFrame {
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** The caster and the point aimed at (dashes and lobs go between them). */
  ox: number;
  oz: number;
  tx: number;
  tz: number;
  radius: number;
}

function piece(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, delay: number, dur: number, path: Path): Piece {
  return { sx, sy, sz, ex, ey, ez, delay, dur, path, arc: 0, r0: 0, r1: 0, a0: 0, sweep: 0, grow: 1 };
}

function swirl(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, a0: number, sweep: number, delay: number, dur: number): Piece {
  const p = piece(cx, y0, cz, cx, y1, cz, delay, dur, Path.Swirl);
  p.r0 = r0; p.r1 = r1; p.a0 = a0; p.sweep = sweep;
  return p;
}

type Layout = (f: MotifFrame, rng: Rng) => Piece[];

const TAU = Math.PI * 2;
/** Even points over a disc (the golden-angle spiral). */
function disc(i: number, n: number, r: number): [number, number] {
  const d = r * Math.sqrt((i + 0.5) / n);
  const a = i * 2.39996;
  return [Math.cos(a) * d, Math.sin(a) * d];
}

/**
 * Every motion, by its plain name. Each is a different layout or path, so the
 * same shape in two motions draws two different things.
 */
export const MOTIF_MOTIONS = {
  /** A circle of pieces comes up round the anchor. */
  ring: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const x = f.x + Math.cos(a) * f.radius * 0.8;
      const z = f.z + Math.sin(a) * f.radius * 0.8;
      out.push(piece(x, 0.05, z, x, 0.5, z, 0, 0.8, Path.Rise));
    }
    return out;
  },
  /** Pieces fly flat out from the anchor in every direction. */
  burst: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      out.push(piece(f.x, 1.0, f.z, f.x + Math.cos(a) * f.radius, 0.4, f.z + Math.sin(a) * f.radius, 0, 0.45, Path.Line));
    }
    return out;
  },
  /** Pieces are pulled in from all round to the anchor. */
  converge: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      out.push(piece(f.x + Math.cos(a) * f.radius * 1.4, 1.6, f.z + Math.sin(a) * f.radius * 1.4, f.x, 1.0, f.z, i * 0.02, 0.55, Path.Fall));
    }
    return out;
  },
  /** One arm winds outward from the anchor. */
  spiral: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 10; i++) out.push(swirl(f.x, f.z, 0.7, 0.3, 0.3, f.radius * (0.4 + 0.06 * i), i * 0.62, 2.4, i * 0.05, 0.6));
    return out;
  },
  /** Pieces push up out of the floor all over the area. */
  rise: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 7; i++) {
      const [dx, dz] = disc(i, 7, f.radius);
      out.push(piece(f.x + dx, -0.6, f.z + dz, f.x + dx, 1.4, f.z + dz, i * 0.04, 0.9, Path.Rise));
    }
    return out;
  },
  /** Pieces drop straight down out of the dark onto the area. */
  fall: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 7; i++) {
      const [dx, dz] = disc(i, 7, f.radius);
      out.push(piece(f.x + dx + 0.3, 9, f.z + dz + 0.3, f.x + dx, 0.2, f.z + dz, i * 0.05, 0.4, Path.Fall));
    }
    return out;
  },
  /** A row erupts one after another from the anchor, marching away along the facing. */
  line: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 7; i++) {
      const d = f.radius * 1.8 * (i / 6);
      const x = f.x + f.fx * d;
      const z = f.z + f.fz * d;
      out.push(piece(x, -0.4, z, x, 0.3, z, i * 0.05, 0.7, Path.Rise));
    }
    return out;
  },
  /** Pieces leave the caster spread like a hand of cards. */
  fan: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -0.7 + (1.4 * i) / 6;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dx = f.fx * c - f.fz * s;
      const dz = f.fx * s + f.fz * c;
      out.push(piece(f.x + f.fx * 0.5, 1.1, f.z + f.fz * 0.5, f.x + dx * f.radius * 1.4, 0.8, f.z + dz * f.radius * 1.4, Math.abs(a) * 0.05, 0.4, Path.Line));
    }
    return out;
  },
  /** Pieces circle the anchor at chest height. */
  orbit: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 5; i++) out.push(swirl(f.x, f.z, 1.2, 1.2, 1.1, 1.1, (i / 5) * TAU, 5, 0, 1.3));
    return out;
  },
  /** A small ring turns above the head. */
  crown: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 6; i++) out.push(swirl(f.x, f.z, 2.35, 2.35, 0.55, 0.55, (i / 6) * TAU, 2.2, 0, 1.2));
    return out;
  },
  /** Four arms grow out from the anchor, square to the facing. */
  cross: (f) => {
    const out: Piece[] = [];
    for (let arm = 0; arm < 4; arm++) {
      const c = arm === 0 ? 1 : arm === 2 ? -1 : 0;
      const s = arm === 1 ? 1 : arm === 3 ? -1 : 0;
      const dx = f.fx * c - f.fz * s;
      const dz = f.fx * s + f.fz * c;
      for (let j = 0; j < 3; j++) {
        const d = ((j + 1) / 3) * f.radius;
        const x = f.x + dx * d;
        const z = f.z + dz * d;
        out.push(piece(x, -0.3, z, x, 0.4, z, j * 0.07, 0.7, Path.Rise));
      }
    }
    return out;
  },
  /** Five points of a star, lit in the order you would draw one. */
  star: (f) => {
    const out: Piece[] = [];
    const base = Math.atan2(f.fz, f.fx);
    const order = [0, 2, 4, 1, 3];
    for (let k = 0; k < 5; k++) {
      const a = base + (order[k]! / 5) * TAU;
      const x = f.x + Math.cos(a) * f.radius * 0.9;
      const z = f.z + Math.sin(a) * f.radius * 0.9;
      out.push(piece(x, 0, z, x, 0.6, z, k * 0.08, 0.9, Path.Rise));
    }
    return out;
  },
  /** Pieces pop up here and there across the area, not all at once. */
  scatter: (f, rng) => {
    const out: Piece[] = [];
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * TAU;
      const d = Math.sqrt(rng.next()) * f.radius;
      const x = f.x + Math.cos(a) * d;
      const z = f.z + Math.sin(a) * d;
      out.push(piece(x, 0.6, z, x, 0.6, z, rng.next() * 0.5, 0.5, Path.Hold));
    }
    return out;
  },
  /** A wall stands up across the facing. */
  wall: (f) => {
    const out: Piece[] = [];
    const cx = f.x + f.fx * 1.6;
    const cz = f.z + f.fz * 1.6;
    for (let i = 0; i < 7; i++) {
      const o = (i / 6 - 0.5) * f.radius * 1.4;
      const x = cx + f.fz * o;
      const z = cz - f.fx * o;
      out.push(piece(x, -0.5, z, x, 0.5, z, Math.abs(o) * 0.03, 1.0, Path.Rise));
    }
    return out;
  },
  /** Three beats on the anchor, each bigger than the last. */
  pulse: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 3; i++) {
      const p = piece(f.x, 1.1, f.z, f.x, 1.1, f.z, i * 0.16, 0.45, Path.Hold);
      p.grow = 1 + i * 0.6;
      out.push(p);
    }
    return out;
  },
  /** A row that steps left and right as it goes. */
  zigzag: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 8; i++) {
      const d = 0.8 + f.radius * 1.8 * (i / 7);
      const o = i % 2 === 0 ? 0.6 : -0.6;
      const x = f.x + f.fx * d + f.fz * o;
      const z = f.z + f.fz * d - f.fx * o;
      out.push(piece(x, -0.3, z, x, 0.35, z, i * 0.045, 0.6, Path.Rise));
    }
    return out;
  },
  /** Two strands wind up round the anchor. */
  helix: (f) => {
    const out: Piece[] = [];
    for (let s = 0; s < 2; s++) for (let j = 0; j < 4; j++) out.push(swirl(f.x, f.z, 0.1, 2.6, 0.75, 0.75, s * Math.PI + j * 0.4, 4, j * 0.08, 0.9));
    return out;
  },
  /** Pieces slant down across the area, one after another, like a storm. */
  rain: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 10; i++) {
      const [dx, dz] = disc(i, 10, f.radius);
      const x = f.x + dx;
      const z = f.z + dz;
      out.push(piece(x - f.fx * 3, 7, z - f.fz * 3, x, 0.15, z, i * 0.07, 0.35, Path.Fall));
    }
    return out;
  },
  /** Pieces left along the way from the caster to where they went. */
  trail: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 8; i++) {
      const k = i / 7;
      const x = f.ox + (f.tx - f.ox) * k;
      const z = f.oz + (f.tz - f.oz) * k;
      out.push(piece(x, 0.4, z, x, 0.4, z, i * 0.03, 0.6, Path.Hold));
    }
    return out;
  },
  /** Pieces swirl in from the edge, like water down a drain. */
  whirlpool: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 8; i++) out.push(swirl(f.x, f.z, 0.3, 1.1, f.radius, 0.15, (i / 8) * TAU, 3, 0, 0.7));
    return out;
  },
  /** Pieces are lobbed high from the caster to the far point. */
  arch: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 6; i++) {
      const o = (i / 5 - 0.5) * 1.2;
      const p = piece(f.ox, 1.2, f.oz, f.tx + f.fz * o, 0.3, f.tz - f.fx * o, i * 0.06, 0.6, Path.Line);
      p.arc = 2.5;
      out.push(p);
    }
    return out;
  },
  /** Pieces drip down one by one onto the anchor. */
  drip: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = disc(i, 6, 0.5);
      out.push(piece(f.x + dx, 3.2, f.z + dz, f.x + dx, 0.9, f.z + dz, i * 0.1, 0.45, Path.Fall));
    }
    return out;
  },
  /** Pieces fly apart in every direction, up and down too. */
  shatter: (f, rng) => {
    const out: Piece[] = [];
    for (let i = 0; i < 10; i++) {
      const a = rng.next() * TAU;
      const d = f.radius * rng.range(0.35, 0.75);
      out.push(piece(f.x, 1.0, f.z, f.x + Math.cos(a) * d, rng.range(0.3, 2.2), f.z + Math.sin(a) * d, 0, 0.5, Path.Line));
    }
    return out;
  },
  /** Rings of pieces spread out, one after another. */
  ripple: (f) => {
    const out: Piece[] = [];
    for (let k = 0; k < 3; k++) {
      const r = (f.radius * (k + 1)) / 3;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + k * 0.6;
        const x = f.x + Math.cos(a) * r;
        const z = f.z + Math.sin(a) * r;
        out.push(piece(x, 0.3, z, x, 0.3, z, k * 0.15, 0.5, Path.Hold));
      }
    }
    return out;
  },
  /** Pieces light up one by one along an arc in front, left to right. */
  sweep: (f) => {
    const out: Piece[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (2.4 * i) / 6;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = f.x + (f.fx * c - f.fz * s) * 1.6;
      const z = f.z + (f.fx * s + f.fz * c) * 1.6;
      out.push(piece(x, 1.0, z, x, 1.0, z, i * 0.035, 0.4, Path.Hold));
    }
    return out;
  },
  /** A short, quick jab: pieces shoot from the caster's reach into the anchor and stop just past it. */
  thrust: (f) => {
    const out: Piece[] = [];
    const sx = f.ox + f.fx * 0.5;
    const sz = f.oz + f.fz * 0.5;
    for (let i = 0; i < 4; i++) {
      const side = (i - 1.5) * 0.08;
      const px = -f.fz * side;
      const pz = f.fx * side;
      const reach = 0.15 + 0.1 * i;
      out.push(piece(sx + px, 1.1, sz + pz, f.x + f.fx * reach + px, 1.05, f.z + f.fz * reach + pz, i * 0.03, 0.18, Path.Line));
    }
    return out;
  },
} as const satisfies Record<string, Layout>;

export type MotifMotion = keyof typeof MOTIF_MOTIONS;

/** How many pieces of a kind one motif may draw: shafts and shells are big. */
export function pieceCap(d: MotifDraw): number {
  switch (d.k) {
    case 'column': return 5;
    case 'shell': return 3;
    case 'slash': return 3;
    case 'glow': return 8;
    case 'mark': return 8;
    default: return 15;
  }
}

/** Thins a layout evenly to at most `cap` pieces. */
export function thin(ps: Piece[], cap: number): Piece[] {
  if (ps.length <= cap) return ps;
  const out: Piece[] = [];
  for (let i = 0; i < cap; i++) out.push(ps[Math.floor((i * ps.length) / cap)]!);
  return out;
}
