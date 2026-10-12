/**
 * Entry point for `tools/check-grid.mjs`.
 *
 * Items cover blocks of cells in the pack and the vault. The rules that must
 * hold no matter what the player does:
 *
 * - nothing ever overlaps and nothing hangs off an edge
 * - no move, swap, sort or load loses an item or makes a second copy
 * - a move onto one item trades places; onto two or more it is refused
 * - an old save, from when every item took one cell, unpacks with every item kept
 */
import { newItem, getBase } from '../src/sim/Loot';
import { ITEM_BASES } from '../src/data/itemBases';
import { Random } from '../src/core/RNG';
import { addToSlots, moveBetween, sortSlots, setStackCount, stackCount } from '../src/sim/Inventory';
import { areasOf, itemSize, overlaps, findFit, INV_COLS, INV_ROWS } from '../src/sim/Grid';
import { migrateAccount, STASH_TAB_SIZE } from '../src/core/Save';
import type { Item } from '../src/types';

const fails: string[] = [];
const rng = new Random(0x6e1d);
let n = 0;

function make(baseId: string): Item {
  const it = newItem(getBase(baseId), 10, 'normal', rng);
  it.uid = `t${n++}`;
  return it;
}

/** Every uid in a container, and whether the layout is legal. */
function audit(slots: Array<Item | null>, where: string): string[] {
  const uids: string[] = [];
  for (const area of areasOf(slots)) {
    const covered = new Int32Array(area.cols * area.rows).fill(-1);
    for (let i = area.start; i < area.start + area.cols * area.rows && i < slots.length; i++) {
      const it = slots[i];
      if (!it) continue;
      uids.push(it.uid);
      const hit = overlaps(area, covered, i, itemSize(it));
      if (!hit) fails.push(`${where}: ${it.baseId} at ${i} runs off the edge`);
      else if (hit.length) fails.push(`${where}: ${it.baseId} at ${i} overlaps ${hit.join(',')}`);
      const { w, h } = itemSize(it);
      const l = i - area.start;
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          const k = (Math.floor(l / area.cols) + dy) * area.cols + (l % area.cols) + dx;
          if (k < covered.length) covered[k] = i;
        }
    }
  }
  return uids;
}

function sameSet(a: string[], b: string[], where: string): void {
  const sa = [...a].sort().join('|');
  const sb = [...b].sort().join('|');
  if (sa !== sb) fails.push(`${where}: items changed (${a.length} -> ${b.length})`);
}

const find = (cat: string, pred: (id: string) => boolean = () => true) =>
  ITEM_BASES.find((b) => b.category === cat && pred(b.id))!.id;

// --- sizes -------------------------------------------------------------------
const expect: Array<[string, number, number]> = [
  [find('ring'), 1, 1],
  [find('chest'), 2, 3],
  [find('helm'), 2, 2],
  [find('belt'), 2, 1],
  [find('staff'), 1, 4],
  [find('dagger'), 1, 2],
  [find('potion'), 1, 1],
];
for (const [id, w, h] of expect) {
  const s = itemSize(make(id));
  if (s.w !== w || s.h !== h) fails.push(`size ${id}: ${s.w}x${s.h}, want ${w}x${h}`);
}

// --- fill a pack with a random mix until nothing fits ------------------------
const pack: Array<Item | null> = new Array(INV_COLS * INV_ROWS).fill(null);
const mix = ITEM_BASES.filter((b) => b.category !== 'material');
const added: string[] = [];
for (let k = 0; k < 400; k++) {
  const it = make(mix[Math.floor(rng.next() * mix.length)]!.id);
  if (addToSlots(pack, it) && pack.some((x) => x?.uid === it.uid)) added.push(it.uid);
}
sameSet(audit(pack, 'filled pack'), added, 'filled pack');

// --- random moves keep everything --------------------------------------------
for (let k = 0; k < 3000; k++) {
  const from = Math.floor(rng.next() * pack.length);
  const to = Math.floor(rng.next() * pack.length);
  if (!pack[from]) continue;
  moveBetween(pack, from, pack, to);
}
sameSet(audit(pack, 'after moves'), added, 'after moves');

// --- sort keeps everything ---------------------------------------------------
sortSlots(pack);
sameSet(audit(pack, 'after sort'), added, 'after sort');

// --- swap rules ---------------------------------------------------------------
{
  const s: Array<Item | null> = new Array(INV_COLS * INV_ROWS).fill(null);
  const chest = make(find('chest'));
  const ring = make(find('ring'));
  const ring2 = make(find('ring'));
  s[0] = chest; // covers columns 0-1, rows 0-2
  s[2] = ring;
  s[3] = ring2;
  // A 2x2 helm over both rings: refused.
  const helm = make(find('helm'));
  s[40] = helm;
  if (moveBetween(s, 40, s, 2)) fails.push('a helm dropped across two rings was allowed');
  // Onto one ring: trade places.
  s[3] = null;
  s[50] = ring2;
  if (!moveBetween(s, 40, s, 2)) fails.push('a helm dropped onto one ring was refused');
  else if (s[2]?.uid !== helm.uid || !s.some((x) => x?.uid === ring.uid)) fails.push('helm and ring did not trade places');
  audit(s, 'swap');
  // Stacks pour.
  const p1 = make(find('potion'));
  const p2 = make(find('potion'));
  p2.baseId = p1.baseId;
  setStackCount(p1, 3);
  setStackCount(p2, 2);
  const at1 = findFit(s, p1);
  s[at1] = p1;
  const at2 = findFit(s, p2);
  s[at2] = p2;
  moveBetween(s, at2, s, at1);
  if (stackCount(p1) !== 5 || s[at2]) fails.push('two potion stacks did not pour together');
}

// --- an old one-cell-per-item save unpacks without losing anything -----------
{
  const legacyInv: Array<Item | null> = [];
  const legacyStash: Array<Item | null> = [];
  for (let i = 0; i < 60; i++) legacyInv.push(make(mix[Math.floor(rng.next() * mix.length)]!.id));
  for (let i = 0; i < STASH_TAB_SIZE * 4; i++) legacyStash.push(i < 400 ? make(mix[Math.floor(rng.next() * mix.length)]!.id) : null);
  const before = [...legacyInv, ...legacyStash].filter((x): x is Item => !!x).map((x) => x.uid);
  const raw = JSON.parse(
    JSON.stringify({
      version: 2,
      stash: legacyStash,
      stashTabs: 4,
      bankGold: 0,
      current: {
        id: 'h1', name: 'Old', classId: 'warrior', level: 10, xp: 0, gold: 0,
        stats: {}, skills: {}, equipment: {}, inventory: legacyInv, hotbar: [],
      },
      roster: [],
    })
  );
  const { data, quarantine } = migrateAccount(raw);
  const inv = data.current?.inventory ?? [];
  const after = [...audit(inv, 'loaded pack'), ...audit(data.stash, 'loaded vault')];
  for (const q of quarantine as Array<{ item?: Item }>) if (q.item) after.push(q.item.uid);
  sameSet(after, before, 'old save');
  if (inv.length !== INV_COLS * INV_ROWS) fails.push(`loaded pack has ${inv.length} cells`);
  if (data.stash.length !== data.stashTabs * STASH_TAB_SIZE) fails.push('vault length does not match its tabs');
  console.log(JSON.stringify({ tabs: data.stashTabs, quarantined: quarantine.length, fails }));
}
