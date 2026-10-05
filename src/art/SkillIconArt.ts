/**
 * SLAY — skill, status and affix icon composition.
 *
 * A skill icon is three decisions, each readable on its own:
 *
 *  - **What it is** — a painted pictogram picked from the skill's authored icon
 *    name ('bone-spear' is a bone, thrown; 'nova-fire' is a flame, bursting).
 *    Every one of the 290-odd names is mapped by hand below; unknown names fall
 *    back to their words, then to the effect family.
 *  - **What it does** — a modifier drawn around the pictogram: a nova ring, a
 *    rain of streaks, motion lines, a chain arc, a laurel for masteries.
 *  - **Whose it is** — the class frame: Warden iron and rivets, Pyromancer
 *    bronze over embers, Shadowblade blackened steel and smoke, Stormcaller
 *    silver, Revenant bone, Ranger wood and leather. Pips on the frame count the
 *    tree (one, two or three), so siblings across trees stay apart.
 *
 * Element sets the light: fire burns orange, cold is blue, physical takes the
 * class's own colour. Passives sit smaller inside a hexagonal plate.
 */
import type { DamageType } from '../types';
import { GLYPHS, type Glyph, type Tone, GLYPH_MATS, paintRay, paintEnergy, dropPath } from './Glyphs';
import {
  type Ctx,
  type Mat,
  circleP,
  css,
  glint,
  glow,
  hashString,
  innerEdge,
  lift,
  luma,
  mixC,
  saturate,
  polyP,
  rampOf,
  sink,
  solid,
  starP,
  texture,
  type TexKind,
} from './Paint';

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

export const ELEMENT_TONE: Record<DamageType, Tone> = {
  physical: { core: 0xfff6e6, glow: 0xd8c8a8, dark: 0x2a2620 },
  fire: { core: 0xfff0b0, glow: 0xff6a1a, dark: 0x3a0e04 },
  cold: { core: 0xf0faff, glow: 0x4ab4ff, dark: 0x08223a },
  lightning: { core: 0xf8f2ff, glow: 0xa47bff, dark: 0x1e1040 },
  poison: { core: 0xeeffb8, glow: 0x6cd030, dark: 0x14280a },
  arcane: { core: 0xffe2f8, glow: 0xff4ad0, dark: 0x3a0830 },
};

/** A tone built around one colour — statuses, affixes, class light. */
export function toneOf(color: number): Tone {
  // Very dark status colours (dread, veiled) would light a pictogram that
  // vanishes into its own ground; lift them until they read.
  const l = luma(color);
  const c = l < 0.32 ? lift(saturate(color, 0.3), Math.min(0.6, (0.32 - l) * 2.4)) : color;
  return { core: lift(c, 0.75), glow: c, dark: sink(c, 0.82) };
}

interface ClassLook {
  ring: Mat;
  tex: TexKind;
  /** Physical and untyped skills are lit in the class colour. */
  light: number;
  /** Background tint. */
  ground: number;
}

const CLASS_LOOK: Record<string, ClassLook> = {
  warden: { ring: GLYPH_MATS.IRON, tex: 'hammered', light: 0xe0b860, ground: 0x2a2216 },
  pyromancer: { ring: rampOf(0x9a6030, 0.85, 'hammered', 0.3), tex: 'crack', light: 0xff8a3a, ground: 0x2e1408 },
  shadowblade: { ring: rampOf(0x2c3138, 0.9, 'brushed', 0.3), tex: 'mottle', light: 0x6ad8a0, ground: 0x0e1a16 },
  stormcaller: { ring: GLYPH_MATS.STEEL, tex: 'brushed', light: 0xb0c8ff, ground: 0x141a2e },
  revenant: { ring: GLYPH_MATS.BONE, tex: 'crack', light: 0x9ae0c8, ground: 0x14201c },
  ranger: { ring: GLYPH_MATS.WOOD, tex: 'grain', light: 0xc8d890, ground: 0x1a2012 },
};

const NEUTRAL: ClassLook = { ring: GLYPH_MATS.IRON, tex: 'fine', light: 0xd8c8a8, ground: 0x1c1c22 };

// ---------------------------------------------------------------------------
// Icon name -> pictogram and modifier
// ---------------------------------------------------------------------------

/**
 * `glyph[:variant][^modifier]`. Hand-mapped so the picture says what the name
 * says; the variant picks between a glyph's forms (one dagger or a fan of
 * three, an open eye or a closed one).
 */
const ICON_MAP: Record<string, string> = {
  // Warden — bulwark
  'shield-raise': 'shield^rise', plate: 'helm', stance: 'boot^field', bash: 'shield^impact', deflect: 'shield:1^spin',
  guard: 'shield:1', charge: 'shield^speed', anvil: 'anvil', counter: 'sword^cross', 'bubble-shield': 'bubble',
  boulder: 'boulder', 'spike-shield': 'shield:1^burst', fortress: 'tower', 'oath-stone': 'rune:2', discus: 'gear^spin',
  'crown-shield': 'crown^aura', 'broken-oath': 'crack', wall: 'tower:1',
  // Warden — carnage
  cleave: 'axe^impact', rend: 'claw', cleaver: 'axe:1', gash: 'claw^drip', nose: 'drop^impact', overhead: 'hammer^impact',
  shard: 'bone:1^burst', whet: 'sword^rise', hamstring: 'boot^drip', whirl: 'axe:1^spin', artery: 'drop', chalice: 'chalice',
  axe: 'axe', feast: 'skull^drip', flurry: 'claw^multi', tide: 'wave', ruin: 'skull:1^impact', grip: 'fist',
  // Warden — oath
  shout: 'horn^nova', fist: 'fist^impact', drill: 'arrow^spin', horn: 'horn', iron: 'fist^aura', roar: 'skull:1^nova',
  banner: 'banner', crest: 'shield^aura', taunt: 'eye^nova', 'blood-oath': 'drop^aura', stomp: 'boot^impact', scar: 'claw^aura',
  'two-banners': 'banner:1', fissure: 'crack^field', 'thorn-crest': 'spikes^aura', sworn: 'sword^aura', 'skull-horn': 'skull:1',
  'ghost-knight': 'helm:1^aura',
  // Pyromancer — conflagration
  'bolt-fire': 'flame^speed', 'mastery-fire': 'flame^mastery', 'nova-fire': 'flame^nova', lance: 'beam^impact', scorch: 'flame:1^field',
  fireball: 'orb^speed', stream: 'beam', kindle: 'flame', blast: 'nova', eruption: 'flame^rise', burst: 'nova^burst',
  shimmer: 'wave', 'rain-fire': 'flame^rain', core: 'orb^aura', dragon: 'wing:1^burst', 'chain-fire': 'flame^chain', nuke: 'sun',
  'soul-fire': 'skull:2',
  // Pyromancer — cinders
  match: 'flame:1', touch: 'hand', cloud: 'cloud', 'wall-fire': 'flame^wall', smoke: 'cloud^drip', 'aura-fire': 'flame^aura',
  field: 'flame^field', pyre: 'flame:1^field', inhale: 'lungs', wisp: 'ghost', spread: 'flame^multi', 'ash-ground': 'crack^field',
  bier: 'skull^field', eternal: 'hourglass', shroud: 'figure^aura', fuse: 'coil', phoenix: 'wing:1', 'infinite-fire': 'rune:3^aura',
  // Pyromancer — sunfire
  'bolt-arcane': 'star^speed', well: 'rune^field', 'ward-fire': 'bubble', 'brand-sun': 'brand', blink: 'rift', radiance: 'sun^aura',
  meteor: 'boulder^speed', sun: 'sun', mirror: 'mirror', supernova: 'sun^nova', star: 'star', conduit: 'beam', eclipse: 'sun:2',
  'anvil-sun': 'anvil^aura', 'light-form': 'figure^aura', 'second-sun': 'sun^cross', helios: 'crown^nova', corona: 'sun:2^aura',
  // Shadowblade — venom
  fang: 'fang', vial: 'vial', flask: 'vial:1', dart: 'arrow^drip', acid: 'drop:1', 'cloud-green': 'cloud', nerve: 'hand^drip',
  garden: 'leaf:1', 'throw-vial': 'vial:1^speed', syringe: 'dagger^drip', 'burst-green': 'nova', trail: 'footprints',
  'heart-green': 'heart', lotus: 'leaf:1^aura', antidote: 'vial^aura', apex: 'star^mastery', serpent: 'serpent',
  'mastery-poison': 'drop^mastery',
  // Shadowblade — shadowcraft
  step: 'footprints', cloak: 'figure^aura', eye: 'eye', 'smoke-bomb': 'cloud^burst', clone: 'figure:1', boot: 'boot',
  ambush: 'dagger^impact', pact: 'hand^aura', vanish: 'figure^speed', legion: 'figure:2', silhouette: 'figure', nightfall: 'moon',
  'mirror-dark': 'mirror', 'void-walk': 'rift', gloom: 'cloud', unseen: 'eye:2', execute: 'scythe', 'mastery-shadow': 'moon^mastery',
  // Shadowblade — bladework
  cut: 'sword^speed', 'mastery-blade': 'dagger^mastery', fan: 'dagger:2', tendon: 'boot^drip', aim: 'target:1', double: 'dagger:1',
  chink: 'crack', 'whirl-dash': 'dagger^spin', knives: 'dagger:2^spin', edge: 'sword', momentum: 'swirl', lethal: 'skull',
  phantom: 'ghost', finish: 'skull^impact', thousand: 'dagger:2^nova', form: 'figure^rise', parry: 'sword^cross',
  // Stormcaller — tempest
  spark: 'bolt', 'mastery-lightning': 'bolt^mastery', 'nova-shock': 'bolt^nova', chain: 'bolt^chain', clap: 'hand^nova',
  conduct: 'coil', 'strike-down': 'cloud:1', fork: 'bolt^multi', orb: 'orb', storm: 'cloud:1^rain', fury: 'bolt^burst',
  ball: 'orb^speed', 'sky-lance': 'beam', overload: 'orb^burst', ionize: 'swirl^aura', 'eye-storm': 'eye:1^aura',
  pillar: 'bolt^field', 'mastery-storm': 'cloud:1^mastery',
  // Stormcaller — galewalk
  gust: 'swirl', dash: 'boot^speed', swift: 'feather^speed', cyclone: 'tornado', tail: 'feather', leap: 'boot^rise',
  mistral: 'wave', dance: 'figure^spin', shear: 'claw', hurricane: 'swirl:1', airborne: 'wing:1', 'trail-lightning': 'footprints',
  'veil-storm': 'bubble', maelstrom: 'swirl:1^aura', zephyr: 'feather^aura', 'never-grounded': 'wing:1^rise', skyfall: 'bolt^rain',
  'aura-wind': 'swirl^aura',
  // Stormcaller — conduit
  'field-static': 'bolt^field', capacitor: 'coil^aura', rod: 'totem', discharge: 'nova', weave: 'chain', superconduct: 'beam^chain',
  totem: 'totem', polarize: 'anchor', overcharge: 'orb^rise', echo: 'wave^nova', 'burst-static': 'nova^chain', circuit: 'gear',
  'shield-volt': 'shield^chain', transformer: 'coil^cross', 'great-arc': 'beam^nova', coil: 'coil', 'mastery-conduit': 'coil^mastery',
  // Revenant — ossuary
  'bone-spear': 'bone^speed', skeleton: 'skull', 'bone-armor': 'bone:1^aura', 'skele-mage': 'skull:2', 'mastery-bone': 'bone^mastery',
  'skull-spirit': 'ghost^rise', golem: 'boulder^rise', cage: 'cage', marrow: 'bone:1^drip', 'bone-storm': 'bone^spin', lord: 'crown',
  knight: 'helm', reassemble: 'bone:1^rise', 'nova-bone': 'bone^nova', 'death-knight': 'helm:1', choir: 'ghost^multi',
  ossuary: 'tower', 'mastery-ossuary': 'skull^mastery',
  // Revenant — blight
  'curse-weak': 'rune^drip', 'bolt-blight': 'skull^speed', decay: 'wilt', amplify: 'horn', 'nova-poison': 'drop^nova',
  wither: 'wilt^aura', terror: 'skull^nova', 'curse-blood': 'drop^aura', 'corpse-boom': 'skull^burst', contagion: 'cloud^multi',
  doom: 'hourglass', attrition: 'hourglass^drip', confusion: 'swirl', pestilence: 'cloud:1', 'mastery-curse': 'rune^mastery',
  decline: 'wilt^drip', lower: 'shield^drip', 'mastery-blight': 'drop^mastery',
  // Revenant — gravepact
  siphon: 'chalice^drip', 'ward-spirit': 'ghost^aura', 'wisp-soul': 'ghost', 'pact-blood': 'hand^drip', 'chill-aura': 'flake^aura',
  'fang-dark': 'fang', 'cage-soul': 'cage', 'drain-beam': 'beam', embrace: 'hand^aura', revenant: 'ghost^rise', harvest: 'scythe',
  'nova-blood': 'drop^nova', undying: 'heart^aura', tether: 'chain', covenant: 'rune', 'second-death': 'skull^rise',
  scythe: 'scythe^spin', 'mastery-grave': 'scythe^mastery',
  // Ranger
  arrow: 'arrow', target: 'target', crosshair: 'target:1', blood: 'drop', range: 'bow', pierce: 'arrow^impact', snare: 'trap',
  crit: 'target^impact', skull: 'skull', trap: 'trap^field', boots: 'boot', spikes: 'spikes', thorns: 'leaf^burst', heart: 'heart',
  stealth: 'figure^aura', gear: 'gear', arrows: 'arrow:2', speed: 'feather^speed', cone: 'arrow:2^burst', rain: 'arrow^rain',
  bounce: 'arrow^chain', quiver: 'quiver', multi: 'arrow:2^multi',
};

/** Effect family -> pictogram, for names nobody mapped. */
const EFFECT_MAP: Record<string, string> = {
  melee: 'sword^impact', projectile: 'orb^speed', nova: 'nova', aura: 'rune^aura', passive: 'rune', curse: 'rune^drip',
  buff: 'shield^rise', summon: 'skull^rise', ground: 'rune^field', dash: 'boot^speed', chain: 'bolt^chain', cone: 'flame^burst',
  channel: 'beam', teleport: 'rift', wave: 'wave', leap: 'boot^rise', meteor: 'boulder^speed', beam: 'beam',
};

export interface IconPlan {
  glyph: string;
  variant: number;
  mod: string;
}

/** Resolves a skill's icon name and effect into a pictogram plan. */
export function planFor(icon: string | undefined, effect: string | undefined, seed: number): IconPlan {
  const parse = (s: string): IconPlan => {
    const [head, mod = ''] = s.split('^');
    const [glyph, v = '0'] = head!.split(':');
    return { glyph: glyph!, variant: Number(v) || 0, mod };
  };
  const name = (icon ?? '').toLowerCase();
  if (ICON_MAP[name]) return parse(ICON_MAP[name]!);
  for (const w of name.split(/[^a-z]+/)) {
    if (w && GLYPHS[w]) return { glyph: w, variant: seed % 3, mod: '' };
    if (w && ICON_MAP[w]) return parse(ICON_MAP[w]!);
  }
  const fam = (effect ?? '').toLowerCase().split('.')[0] ?? '';
  return parse(EFFECT_MAP[fam] ?? 'rune');
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

type Mod = (x: Ctx, t: Tone, draw: (cx: number, cy: number, s: number) => void) => void;

function rays(x: Ctx, t: Tone, n: number, r0: number, r1: number, w: number, rot = 0): void {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const p = new Path2D();
    p.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
    p.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
    paintRay(x, p, t, w);
  }
}

const MODS: Record<string, Mod> = {
  '': (_x, _t, draw) => draw(64, 64, 0.86),
  aura: (x, t, draw) => {
    for (const [r, w, a] of [[54, 3, 0.55], [46, 2.4, 0.8]] as const) {
      x.save();
      x.globalAlpha = a;
      paintRay(x, circleP(64, 64, r), t, w);
      x.restore();
    }
    glow(x, 64, 64, 50, t.glow, 0.35);
    draw(64, 64, 0.74);
  },
  nova: (x, t, draw) => {
    glow(x, 64, 64, 58, t.glow, 0.5);
    rays(x, t, 12, 46, 58, 3, 0.13);
    paintRay(x, circleP(64, 64, 42), t, 3);
    draw(64, 64, 0.7);
  },
  burst: (x, t, draw) => {
    x.save();
    x.globalAlpha = 0.9;
    paintEnergy(x, starP(64, 64, 10, 30, 58, 0.2), t, 64, 64, 58, 0.25);
    x.restore();
    draw(64, 64, 0.72);
  },
  field: (x, t, draw) => {
    x.save();
    x.translate(64, 98);
    x.scale(1, 0.32);
    glow(x, 0, 0, 56, t.glow, 0.8);
    paintRay(x, circleP(0, 0, 46), t, 5);
    x.restore();
    draw(64, 56, 0.74);
  },
  rain: (x, t, draw) => {
    draw(64, 70, 0.7);
    for (let i = 0; i < 6; i++) {
      const sx = 20 + i * 17;
      const sy = 14 + ((i * 29) % 26);
      const p = new Path2D();
      p.moveTo(sx + 10, sy);
      p.lineTo(sx, sy + 22);
      paintRay(x, p, t, 2.6);
    }
  },
  rise: (x, t, draw) => {
    draw(58, 68, 0.78);
    for (let i = 0; i < 3; i++) {
      const p = new Path2D();
      const y = 104 - i * 14;
      p.moveTo(90, y + 8);
      p.lineTo(102, y - 2);
      p.lineTo(114, y + 8);
      paintRay(x, p, t, 3.6 - i * 0.6);
    }
  },
  speed: (x, t, draw) => {
    for (let i = 0; i < 4; i++) {
      const p = new Path2D();
      const o = (i - 1.5) * 13;
      p.moveTo(18 + o * 0.5, 110 - o * 0.5 + 6);
      p.lineTo(50 + o * 0.5 - i * 3, 78 - o * 0.5 + i * 3);
      x.save();
      x.globalAlpha = 0.5 + i * 0.12;
      paintRay(x, p, t, 3);
      x.restore();
    }
    draw(70, 58, 0.78);
  },
  impact: (x, t, draw) => {
    draw(60, 66, 0.8);
    x.save();
    x.globalAlpha = 0.95;
    paintEnergy(x, starP(94, 32, 8, 6, 24, 0.3), t, 94, 32, 24, 0.5);
    x.restore();
  },
  chain: (x, t, draw) => {
    draw(64, 64, 0.76);
    const p = new Path2D();
    p.moveTo(10, 40);
    p.lineTo(30, 30);
    p.lineTo(40, 48);
    p.moveTo(88, 80);
    p.lineTo(100, 96);
    p.lineTo(118, 88);
    paintRay(x, p, t, 3);
  },
  spin: (x, t, draw) => {
    for (const a0 of [0, Math.PI]) {
      const p = new Path2D();
      p.arc(64, 64, 52, a0 + 0.3, a0 + 2.4);
      paintRay(x, p, t, 3.4);
      const a = a0 + 2.4;
      const tx = 64 + Math.cos(a) * 52;
      const ty = 64 + Math.sin(a) * 52;
      paintEnergy(x, polyP([[tx + Math.cos(a + 1.6) * 10, ty + Math.sin(a + 1.6) * 10], [tx + Math.cos(a) * 7, ty + Math.sin(a) * 7], [tx - Math.cos(a) * 7, ty - Math.sin(a) * 7]]), t, tx, ty, 10);
    }
    draw(64, 64, 0.72);
  },
  multi: (x, t, draw) => {
    x.save();
    x.globalAlpha = 0.6;
    draw(40, 44, 0.5);
    draw(88, 44, 0.5);
    x.restore();
    draw(64, 72, 0.7);
  },
  wall: (x, t, draw) => {
    for (const [cx, s] of [[30, 0.46], [98, 0.46], [64, 0.58]] as const) draw(cx, 66, s);
    x.save();
    x.translate(64, 104);
    x.scale(1, 0.25);
    glow(x, 0, 0, 56, t.glow, 0.7);
    x.restore();
  },
  drip: (x, t, draw) => {
    draw(64, 56, 0.76);
    for (const [dx, dy] of [[48, 104], [66, 112], [84, 102]] as const) paintEnergy(x, dropPath(dx, dy, 0.17), t, dx, dy, 10);
  },
  cross: (x, t, draw) => {
    x.save();
    x.translate(128, 0);
    x.scale(-1, 1);
    draw(64, 64, 0.8);
    x.restore();
    draw(64, 64, 0.8);
  },
  mastery: (x, t, draw) => {
    draw(64, 60, 0.66);
    // A laurel of leaves in the class light, closing at the top.
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + sg * (0.5 + i * 0.36);
        const lx = 64 + Math.cos(a) * 48;
        const ly = 64 + Math.sin(a) * 48;
        x.save();
        x.translate(lx, ly);
        x.rotate(a + (sg > 0 ? -0.5 : 0.5) + Math.PI / 2);
        paintEnergy(x, polyP([[0, -8], [4, 0], [0, 8], [-4, 0]]), t, 0, 0, 8, 0.4);
        x.restore();
      }
    }
    glint(x, 64, 14, 9, lift(t.core, 0.5), 1);
  },
};

// ---------------------------------------------------------------------------
// Skill icons
// ---------------------------------------------------------------------------

export interface SkillIconSpec {
  skillId: string;
  icon?: string;
  effect?: string;
  damageType?: DamageType;
  passive: boolean;
  classId?: string;
  /** 0, 1 or 2 — which of the class's trees. */
  treeIndex?: number;
}

function drawGlyph(x: Ctx, g: Glyph, t: Tone, v: number, cx: number, cy: number, s: number): void {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.translate(-64, -64);
  g(x, t, v);
  x.restore();
}

/** Paints a skill icon onto a clear 128px context. */
export function paintSkillIcon(x: Ctx, spec: SkillIconSpec): void {
  const look = CLASS_LOOK[spec.classId ?? ''] ?? NEUTRAL;
  const elem = spec.damageType && spec.damageType !== 'physical' ? ELEMENT_TONE[spec.damageType] : null;
  const tone = elem ?? toneOf(look.light);
  const h = hashString(spec.skillId);
  const plan = planFor(spec.icon, spec.effect, h);
  const glyph = GLYPHS[plan.glyph] ?? GLYPHS.rune!;
  const mod = MODS[plan.mod] ?? MODS['']!;

  const disc = circleP(64, 64, 62);
  x.save();
  x.clip(disc);
  // Ground: the element's darkness over the class's own ground and grain.
  const bg = x.createRadialGradient(64, 54, 4, 64, 64, 66);
  bg.addColorStop(0, css(mixC(look.ground, tone.dark, 0.6)));
  bg.addColorStop(0.65, css(sink(mixC(look.ground, tone.dark, 0.5), 0.45)));
  bg.addColorStop(1, css(0x050507));
  x.fillStyle = bg;
  x.fill(disc);
  texture(x, disc, look.tex, 0.35, 0.9);
  glow(x, 64, 60, 40, tone.glow, spec.passive ? 0.12 : 0.22);

  if (spec.passive) {
    // A hexagonal plate, the pictogram set into it.
    const hex: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      hex.push([64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50]);
    }
    const hp = polyP(hex);
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fill(hp);
    // Backlight, so a dark pictogram (a scythe, a helm) still separates.
    glow(x, 64, 64, 46, tone.glow, 0.4);
    x.save();
    x.translate(64, 64);
    x.scale(0.84, 0.84);
    x.translate(-64, -64);
    mod(x, tone, (cx, cy, s) => drawGlyph(x, glyph, tone, plan.variant, cx, cy, s));
    x.restore();
    x.save();
    x.lineJoin = 'round';
    x.lineWidth = 5;
    x.strokeStyle = css(look.ring.c[0]);
    x.stroke(hp);
    x.lineWidth = 3;
    x.strokeStyle = css(look.ring.c[2]);
    x.stroke(hp);
    x.lineWidth = 1;
    x.translate(-0.7, -0.7);
    x.strokeStyle = css(look.ring.c[4], 0.7);
    x.stroke(hp);
    x.restore();
  } else {
    mod(x, tone, (cx, cy, s) => drawGlyph(x, glyph, tone, plan.variant, cx, cy, s));
  }
  // Vignette toward the rim.
  const vg = x.createRadialGradient(64, 64, 38, 64, 64, 64);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.6)');
  x.fillStyle = vg;
  x.fill(disc);
  x.restore();

  // Frame: a ring in the class material.
  const ring = new Path2D();
  ring.arc(64, 64, 63.5, 0, Math.PI * 2);
  ring.moveTo(121, 64);
  ring.arc(64, 64, 57, 0, Math.PI * 2, true);
  solid(x, ring, look.ring, { a: [10, 10], b: [118, 118], size: 0.8, ao: 0.4, rim: 0.7, outline: 1, tex: look.ring.tex });
  innerEdge(x, circleP(64, 64, 57), 'rgba(0,0,0,.8)', 5, 0, 1, 2);
  // Tree pips at the bottom of the ring.
  const n = (spec.treeIndex ?? 0) + 1;
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.2;
    const px = 64 + Math.cos(a) * 60.3;
    const py = 64 + Math.sin(a) * 60.3;
    const pg = x.createRadialGradient(px - 1, py - 1, 0, px, py, 3.4);
    pg.addColorStop(0, css(lift(tone.glow, 0.6)));
    pg.addColorStop(0.6, css(tone.glow));
    pg.addColorStop(1, css(sink(tone.glow, 0.6)));
    x.fillStyle = pg;
    x.beginPath();
    x.arc(px, py, 3.2, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,.8)';
    x.lineWidth = 1;
    x.stroke();
  }
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

/** Status icon names (from `data/statuses.ts`) -> pictogram plan. */
const STATUS_MAP: Record<string, string> = {
  acid: 'drop:1', anchor: 'anchor', arc: 'bolt', banner: 'banner', 'blade-storm': 'dagger:2', blood: 'drop', bolt: 'bolt',
  bramble: 'leaf', brand: 'brand', 'broken-sword': 'crack', bubble: 'bubble', chalice: 'chalice', 'chalice-light': 'chalice',
  char: 'flame:1', claw: 'claw', cloak: 'figure', coil: 'coil', coin: 'coin', crack: 'crack', crosshair: 'target:1',
  drain: 'beam', droplet: 'drop', 'eye-closed': 'eye:2', fallen: 'skull', feather: 'feather', fist: 'fist', flame: 'flame',
  frost: 'flake', gash: 'claw', ghost: 'ghost', granite: 'boulder', hamstring: 'boot', hand: 'hand', heart: 'heart', hex: 'rune:3',
  hourglass: 'hourglass', 'ice-block': 'flake', leaf: 'leaf', lens: 'lens', link: 'chain', lungs: 'lungs', miasma: 'cloud',
  mute: 'mute', pyre: 'flame:1', rage: 'skull:1', rift: 'rift', shard: 'bone:1', shroud: 'figure', sigil: 'rune', siphon: 'chalice',
  skull: 'skull', snowflake: 'flake', spark: 'bolt', spike: 'spikes', star: 'star', stars: 'star:1', stone: 'boulder',
  swirl: 'swirl', target: 'target', tower: 'tower', vial: 'vial', vine: 'leaf:1', void: 'rift', ward: 'shield', wilt: 'wilt',
  wing: 'wing:1', wisp: 'ghost',
};

/**
 * A small round chip for a status effect. Buffs sit in a bright gold ring,
 * debuffs in a dark, toothed one — so the two read apart before the picture
 * does, even at 17 pixels.
 */
export function paintStatusIcon(x: Ctx, icon: string | undefined, color: number, debuff: boolean, size = 64): void {
  const t = toneOf(color);
  const plan = STATUS_MAP[(icon ?? '').toLowerCase()] ?? ICON_MAP[(icon ?? '').toLowerCase()] ?? 'star';
  const [head] = plan.split('^');
  const [g, v = '0'] = head!.split(':');
  const glyph = GLYPHS[g!] ?? GLYPHS.star!;
  const k = size / 128;
  x.save();
  x.scale(k, k);
  const disc = circleP(64, 64, 60);
  const bg = x.createRadialGradient(64, 56, 4, 64, 64, 64);
  bg.addColorStop(0, css(sink(color, 0.6)));
  bg.addColorStop(1, css(0x060608));
  x.fillStyle = bg;
  x.fill(disc);
  x.save();
  x.clip(disc);
  drawGlyph(x, glyph, t, Number(v) || 0, 64, 64, 0.92);
  x.restore();
  const ring = new Path2D();
  if (debuff) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? 58 : 64;
      if (i === 0) ring.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      else ring.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    ring.closePath();
    ring.moveTo(118, 64);
    ring.arc(64, 64, 54, 0, Math.PI * 2, true);
    solid(x, ring, rampOf(0x8a2020, 0.6, null), { a: [10, 10], b: [118, 118], tex: null, size: 0.5, outline: 1.4 });
  } else {
    ring.arc(64, 64, 63, 0, Math.PI * 2);
    ring.moveTo(119, 64);
    ring.arc(64, 64, 55, 0, Math.PI * 2, true);
    solid(x, ring, GLYPH_MATS.GOLD, { a: [10, 10], b: [118, 118], tex: null, size: 0.5, outline: 1.4 });
  }
  x.restore();
}

// ---------------------------------------------------------------------------
// Monster affix badges
// ---------------------------------------------------------------------------

/** Affix behaviour -> pictogram. Anything unmapped gets a star. */
const AFFIX_MAP: Record<string, string> = {
  fire_enchanted: 'flame', molten_trail: 'flame:1', unstable: 'nova', storm_death: 'bolt',
  cold_enchanted: 'flake', frozen_ground: 'flake', frozen_pulse: 'flake', chilling_death: 'skull',
  lightning_enchanted: 'bolt', electrified: 'coil', arcane_enchanted: 'swirl', arcane_sentry: 'eye:1',
  poison_aura: 'drop', plagued: 'cloud', mana_burn: 'drop:1',
  shielded: 'shield', stoneskin: 'boulder', missile_dampening: 'bubble', juggernaut: 'helm',
  thorns: 'spikes', reflect_damage: 'mirror',
  teleporter: 'rift', phasing: 'ghost', wormhole: 'rift', gravity: 'swirl:1', vortex: 'swirl:1',
  jailer: 'cage', entangling: 'leaf:1', waller: 'tower:1', knockback: 'fist', hasted_pack: 'feather',
  berserker: 'skull:1', empowered: 'star', avenger: 'sword', nightmarish: 'eye', illusionist: 'figure:1',
  summoner: 'skull:2', soul_bound: 'chain', blood_thirsty: 'drop', vampiric: 'fang',
  life_leech: 'heart', regenerating: 'heart', health_link: 'chain', orbiter: 'orb', mortar: 'boulder',
  desecrator: 'pool', fire_chains: 'firechain', bulwark: 'ward', splitter: 'split', hexing: 'hexshield',
  adaptive: 'adapt', lancer: 'lance',
};

/** A nameplate badge: a bold pictogram in a ring of the affix's colour. */
export function paintAffixIcon(x: Ctx, behavior: string | undefined, color: number, size = 64): void {
  const plan = AFFIX_MAP[behavior ?? ''] ?? 'star';
  const [g, v = '0'] = plan.split(':');
  const glyph = GLYPHS[g!] ?? GLYPHS.star!;
  const k = size / 128;
  x.save();
  x.scale(k, k);
  const disc = circleP(64, 64, 62);
  x.fillStyle = 'rgba(8,8,12,.92)';
  x.fill(disc);
  x.save();
  x.clip(disc);
  drawGlyph(x, glyph, toneOf(color), Number(v) || 0, 64, 64, 0.98);
  x.restore();
  x.lineWidth = 7;
  x.strokeStyle = css(color, 0.95);
  x.stroke(circleP(64, 64, 59));
  x.lineWidth = 2;
  x.strokeStyle = 'rgba(0,0,0,.9)';
  x.stroke(circleP(64, 64, 63));
  x.restore();
}

/** Every pictogram name, for sheets and tests. */
export function glyphNames(): string[] {
  return Object.keys(GLYPHS);
}
