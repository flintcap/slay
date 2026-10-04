/**
 * SLAY — item icon composition.
 *
 * Resolves a base's authored `visual` block into a family and sub-type, builds
 * the icon kit (materials, rarity trim, stone and glow colours), runs the
 * family painter onto a layer, and composites the layer with a single cast
 * shadow and a rarity treatment drawn from the art itself:
 *
 *   normal   bare materials, no stone
 *   magic    silver fittings, a cold enchantment along the edges
 *   rare     gold fittings, a set stone, polish glints
 *   set      verdigris bronze, a green stone, a green aura hugging the shape
 *   unique   rich gold, a stone of its own, glowing runes, a warm aura
 *   mythic   void-gold, violet runes, aura and orbiting motes
 *   ancient  blood-gold, ember runes, a burning aura and rising sparks
 */
import type { ItemRarity } from '../types';
import { RARITY_COLOR } from '../types';
import { type K, RANK, matFor, glowFor, stoneFor, trimFor } from './IconKit';
import { WEAPON_PAINTERS } from './IconWeapons';
import { ARMOR_PAINTERS } from './IconArmor';
import { TRINKET_PAINTERS } from './IconTrinkets';
import { type Ctx, composite, css, glow, hashString, resetCtx, scratch, seeded } from './Paint';

export interface IconBaseInfo {
  visual?: { shape?: string; palette?: string; ornate?: number; glow?: number };
  category?: string;
}

export interface ItemIconSpec {
  baseId: string;
  rarity: ItemRarity;
  base?: IconBaseInfo;
  /** Unique or set identity, so two uniques on one base do not share a stone. */
  identity?: string;
}

const PAINTERS: Record<string, (k: K) => void> = { ...WEAPON_PAINTERS, ...ARMOR_PAINTERS, ...TRINKET_PAINTERS };

/** Keyword fallback for bases whose visual block says 'auto' or nothing useful. */
const HINTS: Array<[string, string]> = [
  ['greatsword', 'sword.great'], ['rapier', 'sword.thin'], ['sword', 'sword.short'], ['blade', 'sword.short'],
  ['dagger', 'dagger'], ['dirk', 'dagger'], ['kris', 'dagger.wavy'], ['knife', 'dagger'], ['stiletto', 'dagger.needle'],
  ['greataxe', 'axe.great'], ['axe', 'axe.war'], ['cleaver', 'axe.hand'],
  ['maul', 'maul.great'], ['hammer', 'hammer.war'], ['mace', 'mace.flanged'], ['club', 'mace.club'], ['flail', 'mace.flanged'],
  ['halberd', 'halberd'], ['pike', 'pike'], ['trident', 'trident'], ['spear', 'spear'], ['glaive', 'halberd'], ['lance', 'pike'],
  ['xbow', 'crossbow.light'], ['crossbow', 'crossbow.light'], ['bow', 'bow.long'],
  ['wand', 'wand'], ['scepter', 'scepter'], ['sceptre', 'scepter'], ['staff', 'staff'], ['rod', 'wand'],
  ['shield', 'shield.kite'], ['buckler', 'shield.buckler'], ['aegis', 'shield.tower'],
  ['orb', 'orb'], ['quiver', 'quiver'],
  ['helm', 'helm.full'], ['crown', 'helm.circlet'], ['circlet', 'helm.circlet'], ['cap', 'helm.cap'], ['mask', 'helm.horned'],
  ['robe', 'chest.robe'], ['mail', 'chest.mail'], ['plate', 'chest.plate'], ['chest', 'chest.leather'], ['armor', 'chest.plate'],
  ['glove', 'gloves.light'], ['gaunt', 'gloves.plate'],
  ['boot', 'boots.light'], ['greave', 'boots.plate'],
  ['belt', 'belt.plate'], ['sash', 'belt.sash'], ['girdle', 'belt.chain'],
  ['amulet', 'amulet'], ['talisman', 'amulet'], ['ring', 'ring'],
  ['charm', 'charm.small'], ['gem', 'gem'], ['rune', 'rune'], ['potion', 'potion.flask'], ['flask', 'potion.flask'], ['elixir', 'potion.round'],
];

/** Splits `visual.shape` into family and sub-type, with a keyword fallback. */
export function resolveIconShape(baseId: string, base?: IconBaseInfo): { fam: string; sub: string } {
  const raw = (base?.visual?.shape ?? '').toLowerCase();
  if (raw && raw !== 'auto') {
    const [fam, sub = ''] = raw.split('.');
    if (fam && PAINTERS[fam]) return { fam, sub };
  }
  const hay = `${baseId} ${base?.category ?? ''}`.toLowerCase();
  for (const [needle, shape] of HINTS) {
    if (hay.includes(needle)) {
      const [fam, sub = ''] = shape.split('.');
      return { fam: fam!, sub };
    }
  }
  return { fam: 'material', sub: 'shard' };
}

/**
 * Paints the icon for one item onto `out` (a 128px canvas context, assumed
 * clear). Synchronous; a few milliseconds.
 */
export function paintItemIcon(out: Ctx, spec: ItemIconSpec): void {
  const { fam, sub } = resolveIconShape(spec.baseId, spec.base);
  const pal = (spec.base?.visual?.palette ?? 'metal.steel').split('|')[0]!;
  const baseGlow = spec.base?.visual?.glow;
  const rank = RANK[spec.rarity] ?? 0;
  const h = hashString(`${spec.baseId}|${spec.identity ?? ''}`);
  const layer = scratch('itemLayer', 128);
  const k: K = {
    x: layer.x,
    rnd: seeded(`${spec.baseId}|${spec.rarity}|${spec.identity ?? ''}`),
    id: spec.baseId,
    fam,
    sub,
    m: matFor(pal, baseGlow),
    pal,
    ornate: spec.base?.visual?.ornate ?? 0.2,
    rarity: spec.rarity,
    rank,
    trim: trimFor(spec.rarity, pal),
    stone: stoneFor(spec.rarity, h, spec.identity, baseGlow),
    glowC: glowFor(spec.rarity, baseGlow),
    baseGlow,
    h,
  };
  const painter = PAINTERS[fam] ?? PAINTERS.material!;
  try {
    painter(k);
  } catch (e) {
    // A broken painter must never cost the player their inventory.
    resetCtx(layer.x);
    layer.x.setTransform(1, 0, 0, 1, 0, 0);
    layer.x.clearRect(0, 0, 128, 128);
    PAINTERS.material!({ ...k, sub: 'shard' });
    if (typeof console !== 'undefined') console.warn('[icons] painter failed', spec.baseId, e);
  }
  resetCtx(layer.x);

  // Rarity backdrop: a soft pool of the rarity's light behind the object.
  const rc = RARITY_COLOR[spec.rarity];
  if (rank >= 1) {
    const a = [0, 0.1, 0.14, 0.2, 0.26, 0.32, 0.36][rank]!;
    const g = out.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, css(rc, a));
    g.addColorStop(0.6, css(rc, a * 0.35));
    g.addColorStop(1, css(rc, 0));
    out.fillStyle = g;
    out.fillRect(0, 0, 128, 128);
  }
  if (rank >= 4) {
    // God rays behind uniques and better.
    out.save();
    out.globalCompositeOperation = 'lighter';
    out.translate(64, 64);
    const n = rank >= 5 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      out.rotate((Math.PI * 2) / n);
      const g = out.createLinearGradient(0, 0, 0, -64);
      g.addColorStop(0, css(k.glowC, 0.0));
      g.addColorStop(0.3, css(k.glowC, 0.12 + (rank - 4) * 0.04));
      g.addColorStop(1, css(k.glowC, 0));
      out.fillStyle = g;
      out.beginPath();
      out.moveTo(0, 0);
      out.lineTo(-7, -64);
      out.lineTo(7, -64);
      out.closePath();
      out.fill();
    }
    out.restore();
  }
  const haloC = rank >= 3 ? k.glowC : rc;
  composite(out, layer.c, {
    shadow: 0.7,
    shadowBlur: 5,
    dx: 2,
    dy: 3,
    halo: [0, 0.35, 0.4, 0.6, 0.75, 0.85, 0.9][rank]!,
    haloColor: haloC,
    haloBlur: [0, 5, 6, 8, 9, 11, 12][rank]!,
  });
  if (rank >= 5) {
    // Motes for mythic, rising embers for ancient.
    const rnd = k.rnd;
    for (let i = 0; i < 5; i++) {
      const px = 10 + rnd() * 108;
      const py = 8 + rnd() * 112;
      const r = 1 + rnd() * 1.8;
      glow(out, px, py, r * 3, k.glowC, 0.8);
      out.fillStyle = css(0xffffff, 0.85);
      out.beginPath();
      out.arc(px, py, r * 0.45, 0, Math.PI * 2);
      out.fill();
    }
  }
}

/** Shape families the icon painters cover, for tests and contact sheets. */
export function iconFamilies(): string[] {
  return Object.keys(PAINTERS);
}
