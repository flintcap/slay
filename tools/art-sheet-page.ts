/**
 * Contact sheets for `tools/art-sheet.mjs`. Runs in the browser, on the Vite
 * dev server, against the real art modules. Each entry in `SHEETS` returns one
 * canvas; the driver writes it to a PNG.
 */
import type { Item, ItemRarity } from '../src/types';
import { ITEM_BASES } from '../src/data/itemBases';
import { SKILLS, SKILL_TREES } from '../src/data/skills';
import * as IC from '../src/art/Icons';

const RARITIES: ItemRarity[] = ['normal', 'magic', 'rare', 'set', 'unique', 'mythic', 'ancient'];
const BG = '#0d0e12';
const INK = '#9aa3b2';

const baseById = new Map(ITEM_BASES.map((b) => [b.id, b]));
IC.setIconBaseResolver((id) => baseById.get(id));

function fakeItem(baseId: string, rarity: ItemRarity, extra: Partial<Item> = {}): Item {
  return {
    uid: `${baseId}:${rarity}`,
    baseId,
    name: baseId,
    rarity,
    ilvl: 1,
    mods: [],
    upgrade: 0,
    sockets: [],
    value: 0,
    ...extra,
  };
}

async function img(uri: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.src = uri;
  await im.decode();
  return im;
}

function sheet(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.font = '10px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  return { c, g };
}

/** A dark inventory-like cell behind each icon, the way the HUD will show it. */
function cell(g: CanvasRenderingContext2D, x: number, y: number, s: number, tint?: string): void {
  const gr = g.createLinearGradient(x, y, x, y + s);
  gr.addColorStop(0, '#1c1d22');
  gr.addColorStop(1, '#121317');
  g.fillStyle = gr;
  g.fillRect(x, y, s, s);
  g.strokeStyle = tint ?? '#2c2e36';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

const RCOL: Record<ItemRarity, string> = {
  normal: '#3a3c44', magic: '#3d5fa8', rare: '#b8a038', set: '#3aa04a', unique: '#b0702a', mythic: '#a040c0', ancient: '#d04030',
};

export const SHEETS: Record<string, () => Promise<HTMLCanvasElement>> = {
  /** Every base at 64px, normal rarity, with its id. */
  async items() {
    const bases = ITEM_BASES;
    const S = 64;
    const CW = 84;
    const CH = 84;
    const COLS = 16;
    const rows = Math.ceil(bases.length / COLS);
    const { c, g } = sheet(COLS * CW, rows * CH);
    const t0 = performance.now();
    const uris = bases.map((b) => IC.itemIconUri(fakeItem(b.id, 'normal')));
    const per = (performance.now() - t0) / bases.length;
    const t1 = performance.now();
    for (const r of ['unique', 'ancient'] as const) for (const b of bases) IC.itemIconUri(fakeItem(b.id, r));
    const perHi = (performance.now() - t1) / (bases.length * 2);
    for (let i = 0; i < bases.length; i++) {
      const b = bases[i]!;
      const x = (i % COLS) * CW;
      const y = Math.floor(i / COLS) * CH;
      cell(g, x + (CW - S) / 2, y + 2, S);
      g.drawImage(await img(uris[i]!), x + (CW - S) / 2, y + 2, S, S);
      g.fillStyle = INK;
      g.fillText(b.id.slice(0, 14), x + CW / 2, y + S + 5);
    }
    c.dataset.note = `${bases.length} icons, ${per.toFixed(2)}ms each (normal), ${perHi.toFixed(2)}ms (unique/ancient), draw+encode`;
    return c;
  },

  /** A spread of bases across every rarity, at real cell size (44px) and 96px. */
  async rarity() {
    const ids = [
      'sword.short', 'sword.great', 'axe.war', 'mace.flanged', 'dagger.kris', 'spear.halberd', 'bow.long', 'xbow.crossbow',
      'staff.archon', 'wand.bone', 'shield.kite', 'orb.eldritch', 'helm.full', 'chest.plate', 'chest.ghost',
      'gloves.gauntlets', 'boots.boots', 'belt.sash', 'amulet.amulet', 'ring.ring',
    ];
    const S = 96;
    const s = 44;
    const CW = S + s + 12;
    const { c, g } = sheet(RARITIES.length * CW + 110, ids.length * (S + 6));
    for (let r = 0; r < ids.length; r++) {
      g.fillStyle = INK;
      g.textAlign = 'left';
      g.fillText(ids[r]!, 4, r * (S + 6) + S / 2);
      g.textAlign = 'center';
      for (let k = 0; k < RARITIES.length; k++) {
        const it = fakeItem(ids[r]!, RARITIES[k]!, RARITIES[k] === 'unique' ? { uniqueId: 'u.' + ids[r] } : {});
        const im = await img(IC.itemIconUri(it));
        const x = 110 + k * CW;
        const y = r * (S + 6);
        cell(g, x, y, S, RCOL[RARITIES[k]!]);
        g.drawImage(im, x, y, S, S);
        cell(g, x + S + 4, y + S - s, s, RCOL[RARITIES[k]!]);
        g.drawImage(im, x + S + 4, y + S - s, s, s);
      }
    }
    return c;
  },

  /** Every skill, grouped by tree, at hotbar size (40px) ready / cooldown / locked. */
  async skills() {
    return skillSheet(SKILL_TREES);
  },
  async skillsA() {
    return skillSheet(SKILL_TREES.slice(0, 6));
  },
  async skillsB() {
    return skillSheet(SKILL_TREES.slice(6, 12));
  },
  async skillsC() {
    return skillSheet(SKILL_TREES.slice(12));
  },

  /** Every status chip at 48px and at the HUD's 17px, then every affix badge at 32px and 14px. */
  async statuses() {
    const { STATUSES } = await import('../src/data/statuses');
    const { MONSTER_AFFIXES } = await import('../src/data/monsterAffixes');
    const CW = 96;
    const COLS = 12;
    const rows = Math.ceil(STATUSES.length / COLS) + Math.ceil(MONSTER_AFFIXES.length / COLS) + 1;
    const { c, g } = sheet(COLS * CW, rows * 74);
    for (let i = 0; i < STATUSES.length; i++) {
      const s = STATUSES[i]!;
      const x = (i % COLS) * CW;
      const y = Math.floor(i / COLS) * 74;
      const im = await img(IC.statusIconUri(s.icon, s.color, s.polarity));
      g.drawImage(im, x + 8, y + 4, 48, 48);
      g.drawImage(im, x + 62, y + 20, 17, 17);
      g.fillStyle = INK;
      g.fillText(`${s.icon}`.slice(0, 14), x + CW / 2, y + 56);
    }
    const y0 = (Math.ceil(STATUSES.length / COLS) + 1) * 74;
    for (let i = 0; i < MONSTER_AFFIXES.length; i++) {
      const a = MONSTER_AFFIXES[i]!;
      const x = (i % COLS) * CW;
      const y = y0 + Math.floor(i / COLS) * 74;
      const im = await img(IC.affixIconUri(a.behavior, a.color));
      g.drawImage(im, x + 14, y + 10, 32, 32);
      g.drawImage(im, x + 56, y + 20, 14, 14);
      g.fillStyle = INK;
      g.fillText(`${a.behavior}`.slice(0, 14), x + CW / 2, y + 56);
    }
    return c;
  },

  /** The newest affix badges and the once-weak pictograms, large and at nameplate size. */
  async affixcloseup() {
    const { MONSTER_AFFIXES } = await import('../src/data/monsterAffixes');
    const ids = ['desecrator', 'fire_chains', 'bulwark', 'splitter', 'hexing', 'adaptive', 'lancer'];
    const list = ids.map((b) => MONSTER_AFFIXES.find((a) => a.behavior === b)!).filter(Boolean);
    const skills = ['harvest', 'execute', 'bone-spear', 'knight', 'golem', 'cloak', 'shroud'].map((n) => SKILLS.find((s) => s.icon === n)!).filter(Boolean);
    const S = 140;
    const COLS = 7;
    const { c, g } = sheet(COLS * S, 2 * (S + 30));
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const im = await img(IC.affixIconUri(a.behavior, a.color));
      const x = i * S;
      g.drawImage(im, x + 10, 4, 96, 96);
      g.drawImage(im, x + 110, 40, 24, 24);
      g.drawImage(im, x + 112, 80, 14, 14);
      g.fillStyle = INK;
      g.fillText(a.behavior ?? a.id, x + S / 2, 110);
    }
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i]!;
      const im = await img(IC.skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon));
      const x = i * S;
      const y = S + 30;
      g.drawImage(im, x + 10, y, 96, 96);
      g.drawImage(im, x + 104, y + 50, 32, 32);
      g.fillStyle = INK;
      g.fillText(s.icon, x + S / 2, y + 104);
    }
    return c;
  },

  /** A handful of skill icons at native size, to judge the brushwork. */
  async skillcloseup() {
    const ids = ['bash', 'nova-fire', 'bone-spear', 'chain', 'fang', 'rain', 'mastery-fire', 'cleave', 'cyclone', 'eclipse', 'smoke-bomb', 'harvest'];
    const list = ids.map((n) => SKILLS.find((s) => s.icon === n)!).filter(Boolean);
    const S = 192;
    const COLS = 4;
    const { c, g } = sheet(COLS * S, Math.ceil(list.length / COLS) * (S + 60));
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const im = await img(IC.skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon));
      const x = (i % COLS) * S;
      const y = Math.floor(i / COLS) * (S + 60);
      g.drawImage(im, x + 32, y + 4, 128, 128);
      g.drawImage(im, x + 10, y + 140, 40, 40);
      g.filter = 'grayscale(0.6) brightness(0.7)';
      g.drawImage(im, x + 60, y + 140, 40, 40);
      g.filter = 'grayscale(1) brightness(0.5)';
      g.drawImage(im, x + 110, y + 140, 40, 40);
      g.filter = 'none';
      g.fillStyle = INK;
      g.fillText(s.icon, x + S / 2, y + 186);
    }
    return c;
  },

  /** A handful of icons at native 128px, doubled, to judge the brushwork. */
  async closeup() {
    const picks: Array<[string, ItemRarity]> = [
      ['sword.short', 'normal'], ['axe.war', 'rare'], ['bow.long', 'magic'], ['xbow.crossbow', 'normal'],
      ['helm.full', 'unique'], ['chest.plate', 'set'], ['potion.heal.greater', 'normal'], ['gem.ruby.perfect', 'normal'],
      ['shield.kite', 'rare'], ['ring.ring', 'mythic'], ['boots.boots', 'normal'], ['staff.short', 'ancient'],
    ];
    const S = 256;
    const COLS = 4;
    const { c, g } = sheet(COLS * S, Math.ceil(picks.length / COLS) * S);
    for (let i = 0; i < picks.length; i++) {
      const [id, r] = picks[i]!;
      const x = (i % COLS) * S;
      const y = Math.floor(i / COLS) * S;
      cell(g, x, y, S, RCOL[r]);
      g.drawImage(await img(IC.itemIconUri(fakeItem(id, r))), x, y, S, S);
    }
    return c;
  },

  /** Skills inside one tree that resolve to the same picture (glyph, variant, modifier, element, passive). */
  async dupes() {
    const { planFor } = await import('../src/art/SkillIconArt');
    const seen = new Map<string, string[]>();
    for (const s of SKILLS) {
      const p = planFor(s.icon, s.effect, 0);
      const k = `${s.treeId}|${p.glyph}:${p.variant}^${p.mod}|${s.damageType ?? ''}|${s.targeting === 'passive'}`;
      seen.set(k, [...(seen.get(k) ?? []), s.icon]);
    }
    const d = [...seen.entries()].filter(([, v]) => v.length > 1);
    const { c, g } = sheet(900, 20 + d.length * 14);
    g.textAlign = 'left';
    g.fillStyle = INK;
    d.forEach(([k, v], i) => g.fillText(`${k}  <-  ${v.join(', ')}`, 6, 6 + i * 14));
    c.dataset.note = `${d.length} same-tree duplicate pictures`;
    return c;
  },

  /** Timing breakdown: paint versus PNG encode, over every base. */
  async perf() {
    const { paintItemIcon } = await import('../src/art/ItemIconArt');
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    let paint = 0;
    let enc = 0;
    for (const b of ITEM_BASES) {
      x.clearRect(0, 0, 128, 128);
      const t0 = performance.now();
      paintItemIcon(x, { baseId: b.id, rarity: 'rare', base: b });
      const t1 = performance.now();
      c.toDataURL('image/png');
      enc += performance.now() - t1;
      paint += t1 - t0;
    }
    const n = ITEM_BASES.length;
    c.dataset.note = `paint ${(paint / n).toFixed(2)}ms, encode ${(enc / n).toFixed(2)}ms per icon`;
    return c;
  },
};

/** Every skill in the given trees at hotbar size (48px): ready, cooldown, locked. */
async function skillSheet(trees: typeof SKILL_TREES): Promise<HTMLCanvasElement> {
  const S = 48;
  const CW = 3 * (S + 2) + 10;
  const COLS = 6;
  let rows = 0;
  const per = trees.map((t) => SKILLS.filter((s) => s.treeId === t.id));
  for (const l of per) rows += Math.ceil(l.length / COLS) + 0.4;
  const RH = S + 14;
  const { c, g } = sheet(COLS * CW + 10, Math.ceil(rows * RH) + 20);
  let y = 4;
  for (let ti = 0; ti < trees.length; ti++) {
    const list = per[ti]!;
    g.fillStyle = '#d8c690';
    g.textAlign = 'left';
    g.fillText(`${trees[ti]!.name} (${trees[ti]!.classId})`, 4, y);
    g.textAlign = 'center';
    y += 12;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const im = await img(IC.skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon));
      const x = (i % COLS) * CW + 6;
      const yy = y + Math.floor(i / COLS) * RH;
      g.drawImage(im, x, yy, S, S);
      g.filter = 'grayscale(0.6) brightness(0.7)';
      g.drawImage(im, x + S + 2, yy, S, S);
      g.filter = 'grayscale(1) brightness(0.5)';
      g.drawImage(im, x + 2 * (S + 2), yy, S, S);
      g.filter = 'none';
      g.fillStyle = INK;
      g.fillText(s.icon.slice(0, 18), x + CW / 2 - 5, yy + S + 1);
    }
    y += Math.ceil(list.length / COLS) * RH + 6;
  }
  return c;
}
