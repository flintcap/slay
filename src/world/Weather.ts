/**
 * SLAY — weather: what falls and drifts round the hero (docs/remake/mapvariety.md).
 *
 * Snow over the tundra, rain on the swamp and the black wood, ash and
 * cinders over the wastes and the pit, sand on the desert wind, and drips in
 * the crypts and drowned halls. Open sky gets what falls; under a roof only
 * drips and the odd draught of rime. Each zone keeps its own weather, and
 * walking from one into the next eases between them. No fog banks: the
 * owner had the fog taken out, as far too much.
 *
 * Everything is drawn by the particle kit (`fx/kit`), through
 * `FXSystem.emit`, so it scales with the quality level (`fxScale`) and backs
 * off under the same pressure throttle as every other effect. What a level
 * gets is rolled on its own seeded stream, so a map's weather is the same
 * every time it is generated, and no other roll moves.
 */
import * as THREE from 'three';
import { streamFor } from '../core/RNG';
import { SPRITE } from '../fx/kit/Atlas';
import { floorAt } from '../fx/kit/Floor';
import type { Layer } from '../fx/kit/Emitters';
import type { FXSystem } from '../fx/Particles';
import type { BiomeId, DungeonLevel, MapZone, Rng } from '../types';
import { runTheme, themeFits, type RunTheme } from './Themes';

export type WeatherKind = 'snow' | 'rain' | 'ash' | 'cinders' | 'grit' | 'drip';

/** One thing falling or drifting, and how much of it per second at full quality. */
export interface WeatherFall {
  kind: WeatherKind;
  rate: number;
}

/** A zone's weather. */
export interface WeatherRecipe {
  falls: WeatherFall[];
  /** Wind strength, 0 still .. 1 a gale. */
  wind: number;
}

/** What `Weather` needs from the particle system. */
export type WeatherFx = Pick<FXSystem, 'emit' | 'rng'>;

/** Kinds that need open sky over them. */
const SKY: ReadonlySet<WeatherKind> = new Set<WeatherKind>(['snow', 'rain', 'ash', 'cinders', 'grit']);

/**
 * Rolls a zone's weather from its biome, whether it has sky, and the run's
 * variant (a frozen vault in the "blizzard" variant snows indoors).
 */
export function weatherFor(biome: BiomeId, outdoor: boolean, variant: string | undefined, rng: Rng): WeatherRecipe {
  const falls: WeatherFall[] = [];
  let wind = rng.range(0.15, 0.4);
  const add = (kind: WeatherKind, rate: number): void => {
    if (rate > 0) falls.push({ kind, rate });
  };
  switch (biome) {
    case 'tundra': {
      if (variant === 'squall') {
        add('snow', 380);
        wind = rng.range(0.85, 1);
        break;
      }
      if (variant === 'skyfire') {
        add('snow', 40);
        wind = rng.range(0.05, 0.2);
        break;
      }
      const r = rng.next();
      if (r < 0.25) add('snow', 70);
      else if (r < 0.8) add('snow', 170);
      else {
        add('snow', 340);
        wind = rng.range(0.7, 1);
      }
      break;
    }
    case 'frostvault':
      if (variant === 'blizzard') {
        add('snow', 150);
        wind = rng.range(0.5, 0.8);
      } else if (variant === 'thaw') add('drip', 9);
      else add('snow', 24);
      break;
    case 'swamp':
      if (variant === 'dryseason') {
        add('grit', 40);
        break;
      }
      if (rng.chance(0.6)) add('rain', rng.range(240, 360));
      break;
    case 'darkForest':
      // The Fogbound Wood is still: no rain.
      if (variant === 'fogbound') break;
      if (variant === 'bonfire') {
        add('cinders', 26);
        break;
      }
      if (rng.chance(0.45)) add('rain', rng.range(180, 280));
      break;
    case 'ashwaste':
      add('ash', variant === 'grey' ? 170 : 90);
      if (variant === 'emberfall') add('cinders', 34);
      break;
    case 'hell':
      if (variant === 'ashfall') {
        add('ash', 200);
        add('cinders', 15);
      } else if (variant === 'crust') {
        add('ash', 30);
        add('cinders', 15);
      } else {
        add('ash', 60);
        add('cinders', 40);
      }
      break;
    case 'desert':
      if (variant === 'sandstorm') {
        add('grit', 220);
        wind = rng.range(0.85, 1);
      } else if (variant === 'dusk') {
        wind = rng.range(0.05, 0.2);
      } else if (rng.chance(0.5)) {
        add('grit', rng.range(60, 110));
        wind = rng.range(0.55, 0.9);
      }
      break;
    case 'desertTomb':
      if (variant === 'floodvault') add('drip', 8);
      break;
    case 'crypt':
      if (variant === 'flooded') add('drip', 7);
      break;
    case 'sunkenTemple':
      add('drip', variant === 'tidal' ? 10 : 5);
      break;
    case 'caverns':
      if (variant !== 'dry') add('drip', 6);
      break;
    default:
      break;
  }
  return { falls: outdoor ? falls : falls.filter((f) => !SKY.has(f.kind) || (biome === 'frostvault' && f.kind === 'snow')), wind };
}

/** A run theme's weather laid over a zone's own: the heavier of each kind wins. */
export function withTheme(r: WeatherRecipe, theme: RunTheme, outdoor: boolean): WeatherRecipe {
  const falls = r.falls.map((f) => ({ ...f }));
  for (const t of outdoor ? theme.sky : theme.roof) {
    const have = falls.find((f) => f.kind === t.kind);
    if (have) have.rate = Math.max(have.rate, t.rate);
    else falls.push({ ...t });
  }
  return { falls, wind: r.wind };
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

function lay(o: Partial<Layer>): Layer {
  return {
    sprite: SPRITE.mote, variants: 1, count: 12, speed: [0.5, 1], spread: 0.15, up: 0, radius: 2.5, disc: true,
    life: [1, 2], size: [0.05, 0.08], grow: 1, ramp: [0xffffff, 0xcccccc, 0x888888], emit: 0.3, occl: 0.2, heat: [0.7, 0.4],
    gravity: 0, drag: 0, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1, stagger: 0, ground: false, bounce: 0,
    converge: false, tint: false, ...o,
  };
}

const R_RAIN = [0xa6b0ba, 0x6c757e, 0x30363c] as const;
const R_SNOW = [0xf2f6fa, 0xc8d4e0, 0x7c8a98] as const;
const R_ASH = [0x8a847c, 0x4a4540, 0x1a1816] as const;
const R_CINDER = [0xffb868, 0xd2521c, 0x3c0c04] as const;
const R_GRIT = [0xc0a274, 0x8a6e48, 0x4a3a24] as const;
const R_DRIP = [0x9aa8b0, 0x56626a, 0x262c30] as const;

interface Look {
  layer: Layer;
  /** Particles per emit call (spread over the layer's disc). */
  batch: number;
  /** Height above the hero (or the floor, for `low`) a batch starts at. */
  y: readonly [number, number];
  /** Start height is above the floor under the batch, not above the hero. */
  low: boolean;
  /** How much the wind leans its path (0 none, 1 all sideways). */
  lean: number;
  /** Disc radius round the hero batches land in. */
  reach: number;
  /** Fly downward (rain, snow) or along the wind (grit). */
  down: boolean;
}

/** One kind's share of the weather now. */
interface Mix {
  kind: WeatherKind;
  rate: number;
  now: number;
  acc: number;
  splash: number;
}

const LOOKS: Record<WeatherKind, Look> = {
  snow: {
    layer: lay({ sprite: SPRITE.ember, ramp: R_SNOW, speed: [0.5, 1], spread: 0.35, size: [0.035, 0.07], life: [6, 8.5], emit: 0.45, occl: 0.3, heat: [0.8, 0.6], gravity: -0.3, drag: 0.3, turb: 0.4, fade: 0.8, ground: true }),
    batch: 4, y: [5, 8], low: false, lean: 0.6, reach: 15, down: true,
  },
  rain: {
    layer: lay({ sprite: SPRITE.drop, ramp: R_RAIN, speed: [11, 14], spread: 0.03, size: [0.022, 0.032], life: [0.5, 0.62], emit: 0.22, occl: 0.35, heat: [0.7, 0.5], gravity: -4, stretch: 12, fade: 2 }),
    batch: 6, y: [6.5, 8], low: false, lean: 0.25, reach: 14, down: true,
  },
  ash: {
    layer: lay({ sprite: SPRITE.flake, ramp: R_ASH, speed: [0.4, 0.9], spread: 0.4, size: [0.045, 0.09], life: [7, 10], emit: 0.25, occl: 0.6, heat: [0.4, 0.1], gravity: -0.2, drag: 0.4, turb: 0.45, spin: 2.5, fade: 0.8, ground: true }),
    batch: 4, y: [4, 7], low: false, lean: 0.9, reach: 15, down: true,
  },
  cinders: {
    layer: lay({ sprite: SPRITE.ember, ramp: R_CINDER, speed: [0.8, 1.5], spread: 0.4, size: [0.025, 0.05], life: [3, 5], emit: 1.3, occl: 0, heat: [1, 0.3], gravity: -0.4, drag: 0.3, turb: 0.45, fade: 1.2 }),
    batch: 3, y: [5, 7], low: false, lean: 0.7, reach: 13, down: true,
  },
  grit: {
    layer: lay({ sprite: SPRITE.spark, ramp: R_GRIT, speed: [4, 7], spread: 0.15, up: 0.04, size: [0.02, 0.034], life: [1.2, 2], emit: 0.28, occl: 0.4, heat: [0.6, 0.3], gravity: -0.3, drag: 0.2, turb: 0.5, stretch: 15, fade: 1.5 }),
    batch: 5, y: [0.15, 1.6], low: true, lean: 1, reach: 13, down: false,
  },
  drip: {
    layer: lay({ sprite: SPRITE.drip, ramp: R_DRIP, count: 3, radius: 0.1, speed: [0.5, 1], spread: 0, size: [0.025, 0.04], life: [0.9, 1.05], emit: 0.4, occl: 0.5, heat: [0.8, 0.4], gravity: -9, stretch: 0.6, ground: true, fade: 2 }),
    batch: 1, y: [3.4, 4.4], low: false, lean: 0, reach: 11, down: true,
  },
};

/** A drop landing: a quick flat ring on the floor. */
const SPLASH = lay({ sprite: SPRITE.ring, ramp: R_RAIN, count: 12, radius: 2.5, speed: [0, 0.01], size: [0.05, 0.08], grow: 3, life: [0.2, 0.3], emit: 0.2, occl: 0.2, flat: true, fade: 1.5 });

/** How fast a zone change eases in (per second). */
const EASE = 0.5;

// ---------------------------------------------------------------------------
// The running weather
// ---------------------------------------------------------------------------

const _dir = new THREE.Vector3();
const _opts: { dir: THREE.Vector3 } = { dir: _dir };

/**
 * The weather of one level. Build one per level (`new Weather(fx, level)`)
 * and call `update` each frame with where the hero stands.
 */
export class Weather {
  /** Each zone's weather, by zone index (one entry for a level without zones). */
  readonly recipes: WeatherRecipe[];
  private fx: WeatherFx;
  private level: DungeonLevel;
  /** How strongly each kind falls now, 0..1 of its recipe rate, eased. */
  private mix = new Map<WeatherKind, Mix>();
  /** The same entries as a list: a frame walks it by index, which leaves no garbage. */
  private mixList: Mix[] = [];
  private windAngle: number;
  private wind = 0;
  private windWant = 0;
  private zone = -1;
  constructor(fx: WeatherFx, level: DungeonLevel) {
    this.fx = fx;
    this.level = level;
    const rng = streamFor(level.seed, `weather:${level.depth}:${level.entry.x},${level.entry.y}:${level.width}x${level.height}`);
    this.windAngle = rng.range(0, Math.PI * 2);
    const zones: Array<Pick<MapZone, 'biome' | 'outdoor'>> = level.zones && level.zones.length > 0 ? level.zones : [{ biome: level.biome, outdoor: false }];
    const theme = runTheme(level.runTheme);
    this.recipes = zones.map((z) => {
      const r = weatherFor(z.biome, z.outdoor, level.variant, rng);
      return themeFits(theme, z.biome) ? withTheme(r, theme, z.outdoor) : r;
    });
    for (const k of Object.keys(LOOKS) as WeatherKind[]) {
      const m: Mix = { kind: k, rate: 0, now: 0, acc: 0, splash: 0 };
      this.mix.set(k, m);
      this.mixList.push(m);
    }
  }

  /** Every kind this level can show anywhere (for warm-up and checks). */
  kinds(): WeatherKind[] {
    const out = new Set<WeatherKind>();
    for (const r of this.recipes) for (const f of r.falls) out.add(f.kind);
    return [...out];
  }

  /**
   * One frame. (x, y, z) is the hero's world position; (tx, ty) the tile
   * under it, which picks the zone's weather.
   */
  update(dt: number, elapsed: number, x: number, y: number, z: number, tx: number, ty: number): void {
    if (!(dt > 0)) return;
    const L = this.level;
    const zi = L.zoneOf && tx >= 0 && ty >= 0 && tx < L.width && ty < L.height ? L.zoneOf[ty * L.width + tx] ?? 0 : 0;
    if (zi !== this.zone && this.recipes[zi]) {
      this.zone = zi;
      const r = this.recipes[zi]!;
      for (let mi = 0; mi < this.mixList.length; mi++) this.mixList[mi]!.rate = 0;
      for (const f of r.falls) this.mix.get(f.kind)!.rate = f.rate;
      this.windWant = r.wind;
    }
    const k = Math.min(1, dt * EASE * 2);
    this.wind += (this.windWant - this.wind) * k;
    // Gusts: the wind swells and drops on a slow beat, and turns a little.
    const gust = 0.75 + 0.18 * Math.sin(elapsed * 0.37) + 0.07 * Math.sin(elapsed * 1.31 + 1.7);
    const a = this.windAngle + 0.25 * Math.sin(elapsed * 0.05);
    const wx = Math.cos(a) * this.wind * gust;
    const wz = Math.sin(a) * this.wind * gust;
    const rng = this.fx.rng;

    for (let mi = 0; mi < this.mixList.length; mi++) {
      const m = this.mixList[mi]!;
      const kind = m.kind;
      const target = m.rate > 0 ? 1 : 0;
      m.now += (target - m.now) * k;
      if (m.now < 0.01) {
        m.acc = 0;
        continue;
      }
      const look = LOOKS[kind];
      const layer = look.layer;
      // Batches this frame; each emit call draws `batch` particles (before
      // the kit's own quality and pressure scaling).
      m.acc += ((m.rate * m.now) / look.batch) * dt;
      let n = Math.floor(m.acc);
      m.acc -= n;
      if (n > 8) n = 8;
      const mul = look.batch / layer.count;
      for (let i = 0; i < n; i++) {
        const ang = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next()) * look.reach;
        // Batches start upwind so what drifts crosses the hero's view.
        let px = x + Math.cos(ang) * r;
        let pz = z + Math.sin(ang) * r;
        if (!look.down) {
          px -= wx * 6;
          pz -= wz * 6;
        }
        const h = rng.range(look.y[0], look.y[1]);
        const py = look.low ? floorAt(px, pz) + h : y + h;
        if (look.down) _dir.set(wx * look.lean * 2, -1, wz * look.lean * 2);
        else _dir.set(wx + 0.05, 0.02, wz + 0.05);
        this.fx.emit(layer, 'physical', px, py, pz, _opts, mul);
      }
      // Rain lands: a share of the drops ring the floor.
      if (kind === 'rain') {
        m.splash += m.rate * m.now * 0.2 * dt / SPLASH.count;
        let s = Math.floor(m.splash);
        m.splash -= s;
        if (s > 4) s = 4;
        for (let i = 0; i < s; i++) {
          const ang = rng.next() * Math.PI * 2;
          const r = Math.sqrt(rng.next()) * look.reach * 0.8;
          const px = x + Math.cos(ang) * r;
          const pz = z + Math.sin(ang) * r;
          this.fx.emit(SPLASH, 'physical', px, floorAt(px, pz) + 0.03, pz, undefined, 1);
        }
      }
    }
  }
}
