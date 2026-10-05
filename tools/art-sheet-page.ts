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

  /** Held weapon and shield models, one per base sub-type, at normal and unique rarity. */
  async models() {
    return modelSheet(MODEL_PICKS, ['normal', 'rare', 'unique'], 0);
  },
  /** The same spread across set, mythic and ancient, with set and unique identities. */
  async modelsHi() {
    return modelSheet(MODEL_PICKS, ['set', 'mythic', 'ancient'], 0);
  },
  /** One base as eight different uniques and four different sets: do signatures differ? */
  async modelsSig() {
    const ids = ['sword.short', 'axe.war', 'staff.archon', 'bow.long'];
    return modelSheet(ids, ['unique', 'unique', 'unique', 'unique', 'set', 'set'], 1);
  },
  /** Armour, jewellery and consumable models (what drops on the floor). */
  async modelsArmor() {
    return modelSheet(ARMOR_PICKS, ['normal', 'rare', 'unique'], 2);
  },
  /** Ground drops as the dungeon shows them: beam, pool, sigil around the item. */
  async drops() {
    return dropSheet();
  },

  /** Every class portrait at full size and at a 96px card size. */
  async portraits() {
    const { classPortraitUri } = await import('../src/art/Portraits');
    const ids = ['warden', 'pyromancer', 'shadowblade', 'stormcaller', 'revenant', 'ranger'];
    const { c, g } = sheet(3 * 266 + 10, 2 * (256 + 110) + 10);
    const t0 = performance.now();
    for (let i = 0; i < ids.length; i++) {
      const x = 10 + (i % 3) * 266;
      const y = 10 + Math.floor(i / 3) * 366;
      g.drawImage(await img(classPortraitUri(ids[i]!, 256)), x, y);
      g.drawImage(await img(classPortraitUri(ids[i]!, 96)), x, y + 262);
      g.fillStyle = INK;
      g.fillText(ids[i]!, x + 170, y + 300);
    }
    const total = performance.now() - t0;
    const { paintClassPortrait } = await import('../src/art/Portraits');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const t1 = performance.now();
    for (const id of ids) paintClassPortrait(cv.getContext('2d')!, id);
    const paint = (performance.now() - t1) / ids.length;
    const t2 = performance.now();
    for (let i = 0; i < 6; i++) cv.toDataURL('image/png');
    c.dataset.note = `${(total / 12).toFixed(1)}ms per portrait first time; repaint ${paint.toFixed(1)}ms, encode ${((performance.now() - t2) / 6).toFixed(1)}ms`;
    return c;
  },

  /** The boot and loading key art at a desktop and a phone shape. */
  async keyart() {
    const { keyArtCanvas } = await import('../src/art/KeyArt');
    const t0 = performance.now();
    const a = keyArtCanvas(960, 540);
    a.getContext('2d')!.getImageData(0, 0, 1, 1);
    const ms = performance.now() - t0;
    const b = keyArtCanvas(300, 540);
    const { c, g } = sheet(960 + 320, 560);
    g.drawImage(a, 0, 10, 960, 540);
    g.drawImage(b, 970, 10, 300, 540);
    const t1 = performance.now();
    keyArtCanvas(960, 540, 7).getContext('2d')!.getImageData(0, 0, 1, 1);
    c.dataset.note = `${ms.toFixed(0)}ms to paint 960x540 first, ${(performance.now() - t1).toFixed(0)}ms again`;
    return c;
  },

  /** UI ornament: corners, dividers, frames and crests in every metal. */
  async ornament() {
    const O = await import('../src/art/Ornament');
    const metals = O.ORNAMENT_METALS;
    const { c, g } = sheet(1000, 560);
    for (let i = 0; i < metals.length; i++) {
      const m = metals[i]!;
      const y = 10 + i * 108;
      g.drawImage(await img(O.cornerUri(48, m, i === 0 ? 0xd02a3a : undefined)), 10, y, 48, 48);
      g.drawImage(await img(O.dividerUri(320, m, i === 1 ? 0x3a8aff : undefined)), 70, y + 12, 320, 24);
      // A panel framed with border-image semantics, drawn by hand: nine slices.
      const fr = await img(O.frameUri(m));
      const W = 220;
      const H = 90;
      const X = 410;
      const s = 48;
      const d = 18;
      const sw = fr.width;
      g.fillStyle = '#16171c';
      g.fillRect(X + 6, y + 6, W - 12, H - 12);
      const parts: Array<[number, number, number, number, number, number, number, number]> = [
        [0, 0, s, s, X, y, d, d], [sw - s, 0, s, s, X + W - d, y, d, d], [0, sw - s, s, s, X, y + H - d, d, d], [sw - s, sw - s, s, s, X + W - d, y + H - d, d, d],
        [s, 0, sw - 2 * s, s, X + d, y, W - 2 * d, d], [s, sw - s, sw - 2 * s, s, X + d, y + H - d, W - 2 * d, d],
        [0, s, s, sw - 2 * s, X, y + d, d, H - 2 * d], [sw - s, s, s, sw - 2 * s, X + W - d, y + d, d, H - 2 * d],
      ];
      for (const [sx, sy, sw2, sh, dx, dy, dw, dh] of parts) g.drawImage(fr, sx, sy, sw2, sh, dx, dy, dw, dh);
      const crests: Array<[string, number]> = [['skull', 0x7a1c18], ['flame', 0x8a3a10], ['bolt', 0x2a3a7a], ['sword', 0x2a5a3a], ['crown', 0x4a2a6a]];
      const [gl, col] = crests[i]!;
      g.drawImage(await img(O.crestUri(gl, col, 64, m)), 660, y, 64, 64);
      g.drawImage(await img(O.crestUri(gl, col, 32, m)), 740, y + 16, 32, 32);
      g.fillStyle = INK;
      g.fillText(m, 860, y + 30);
    }
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

// ---------------------------------------------------------------------------
// 3D model sheets
// ---------------------------------------------------------------------------

const MODEL_PICKS = [
  'sword.short', 'sword.broad', 'sword.rapier', 'sword.great', 'dagger.dirk', 'dagger.kris', 'dagger.stiletto',
  'axe.hand', 'axe.war', 'axe.battle', 'axe.greataxe', 'mace.club', 'mace.flanged', 'mace.warhammer', 'mace.maul',
  'spear.spear', 'spear.pike', 'spear.halberd', 'spear.trident', 'bow.short', 'bow.long', 'bow.war', 'bow.great',
  'xbow.light', 'xbow.crossbow', 'xbow.repeating', 'wand.wand', 'wand.bone', 'wand.tomb', 'staff.short', 'staff.battle',
  'staff.archon', 'scepter.scepter', 'scepter.divine', 'scepter.wrath', 'shield.buckler', 'shield.round', 'shield.kite',
  'shield.tower', 'shield.bone', 'orb.cracked', 'orb.crystalline', 'orb.eldritch', 'quiver.hunters',
];

const ARMOR_PICKS = [
  'helm.cap', 'helm.full', 'helm.bone', 'helm.circlet', 'chest.quilted', 'chest.leather', 'chest.chainmail', 'chest.scale',
  'chest.plate', 'gloves.leather', 'gloves.gauntlets', 'gloves.silk', 'boots.boots', 'boots.greaves', 'boots.slippers',
  'belt.sash', 'belt.belt', 'belt.girdle', 'amulet.amulet', 'ring.ring', 'charm.small', 'charm.grand', 'potion.heal.greater',
  'potion.rejuv.full', 'potion.antidote', 'gem.ruby.normal', 'rune.el', 'dust.grave',
];

async function modelSheet(ids: string[], rarities: ItemRarity[], identMode: number): Promise<HTMLCanvasElement> {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const { buildItemModel, poseForDrop } = await import('../src/art/ItemModels');
  const { Random } = await import('../src/core/RNG');
  const CELL = 150;
  const COLS = rarities.length;
  const GROUPS = Math.min(4, Math.ceil(ids.length / 12));
  const perCol = Math.ceil(ids.length / GROUPS);
  const W = GROUPS * (COLS * CELL + 20);
  const H = perCol * (CELL + 14);
  const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  gl.setSize(CELL, CELL, false);
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(gl);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const { c, g } = sheet(W, H);
  let buildMs = 0;
  let builds = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const base = baseById.get(id);
    if (!base?.visual) continue;
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    for (let k = 0; k < COLS; k++) {
      const r = rarities[k]!;
      const vary = identMode === 1 ? k : 0;
      const ident = { baseId: id, uniqueId: r === 'unique' ? `u.${id}.${vary}` : undefined, setId: r === 'set' ? `s.${vary}.${id}` : undefined };
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x15161b);
      scene.environment = env;
      scene.environmentIntensity = 0.7;
      const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
      key.position.set(-2, 3, 4);
      scene.add(key, new THREE.HemisphereLight(0x8090b0, 0x201810, 0.6));
      const model = buildItemModel(base.visual, new Random(7), r, ident);
      // Time a second build: materials and textures are cached by now, as in play.
      const t0 = performance.now();
      buildItemModel(base.visual, new Random(7), r, ident);
      {
        buildMs += performance.now() - t0;
        builds++;
      }
      // Lay weapons across the cell diagonally, tip top-right, like the icon frame.
      const pivot = new THREE.Group();
      pivot.add(model);
      const shape = model.userData.shape;
      if (identMode === 2) {
        // As the floor shows it: the drop's own tilt, seen from the play camera's height.
        poseForDrop(model);
      } else if (shape === 'shield') model.rotation.set(Math.PI, 0, 0); // face toward us, point down, as held
      else if (shape === 'bow') {
        // A bow's limbs curve back on -Z: look at it side on, the way it is drawn.
        model.rotation.set(0, Math.PI / 2, 0);
        pivot.rotation.z = -Math.PI / 4;
      } else if (!['orb', 'quiver'].includes(shape)) model.rotation.set(0, 0, -Math.PI / 4);
      scene.add(pivot);
      const box = new THREE.Box3().setFromObject(pivot);
      const ctr = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = (identMode === 2 ? Math.max(size.x, size.y, size.z) : Math.max(size.x, size.y)) * 1.15;
      const cam = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, -10, 10);
      if (identMode === 2) cam.position.set(ctr.x, ctr.y + 4, ctr.z + 3);
      else cam.position.set(ctr.x, ctr.y, ctr.z + 5);
      cam.lookAt(ctr);
      gl.render(scene, cam);
      const x = col * (COLS * CELL + 20) + k * CELL;
      const y = row * (CELL + 14);
      g.drawImage(gl.domElement, x, y, CELL, CELL);
      g.strokeStyle = RCOL[r];
      g.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      if (k === 0) {
        g.fillStyle = INK;
        g.fillText(id, x + (COLS * CELL) / 2, y + CELL + 1);
      }
    }
  }
  gl.dispose();
  c.dataset.note = `${(buildMs / Math.max(1, builds)).toFixed(2)}ms per model build (warm caches)`;
  return c;
}

async function dropSheet(): Promise<HTMLCanvasElement> {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const { buildDropModel, setItemVisualResolver } = await import('../src/art/ItemModels');
  const { Random } = await import('../src/core/RNG');
  setItemVisualResolver((it) => baseById.get(it.baseId)?.visual);
  const picks: Array<[string, ItemRarity]> = [
    ['sword.great', 'normal'], ['axe.war', 'magic'], ['staff.archon', 'rare'], ['chest.plate', 'set'],
    ['bow.long', 'unique'], ['ring.ring', 'mythic'], ['mace.maul', 'ancient'], ['potion.heal.greater', 'normal'],
  ];
  const CELL = 220;
  const { c, g } = sheet(4 * CELL, 2 * (CELL + 14));
  const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  gl.setSize(CELL, CELL, false);
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const env = new THREE.PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
  for (let i = 0; i < picks.length; i++) {
    const [id, r] = picks[i]!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101014);
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    const key = new THREE.DirectionalLight(0xfff0dd, 1.6);
    key.position.set(-2, 4, 3);
    scene.add(key, new THREE.HemisphereLight(0x8090b0, 0x201810, 0.4));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const drop = buildDropModel(fakeItem(id, r, r === 'unique' ? { uniqueId: 'u.' + id } : r === 'set' ? { setId: 's.' + id } : {}), new Random(3));
    scene.add(drop);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    cam.position.set(0, 2.2, 2.6);
    cam.lookAt(0, 0.45, 0);
    gl.render(scene, cam);
    const x = (i % 4) * CELL;
    const y = Math.floor(i / 4) * (CELL + 14);
    g.drawImage(gl.domElement, x, y, CELL, CELL);
    g.fillStyle = INK;
    g.fillText(`${id} ${r}`, x + CELL / 2, y + CELL + 1);
  }
  gl.dispose();
  return c;
}
