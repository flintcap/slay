/**
 * Entry point for `tools/check-save.mjs`.
 *
 * Runs the real save manager against an in-memory store and throws every kind
 * of damage at it that a player's browser can produce: truncated writes,
 * hand edits, NaN that JSON turned into null, a full disk, a second tab, a
 * pasted import that is not a save, a save from a newer build. The one rule
 * under all of them: **the live character survives**, and nothing that cannot
 * be loaded is thrown away.
 */
import { SaveManager, migrateAccount, DEFAULT_SETTINGS, SAVE_KEY, BACKUP_KEY, CORRUPT_KEY, QUARANTINE_KEY, SAVE_VERSION, STASH_TAB_SIZE } from '../src/core/Save';
import type { SaveStore } from '../src/core/Save';
import { events } from '../src/core/Events';
import { Random } from '../src/core/RNG';
import type { AccountSave, Character, Item, StatKey } from '../src/types';
import { getUnique } from '../src/data/uniques';
import { SET_PIECES } from '../src/data/sets';
import { EXTRA_LINES } from '../src/data/extraLines';
import { buildSetPiece, refreshFixedLines } from '../src/sim/Loot';
import { xpForLevel } from '../src/sim/Stats';

class MemStore implements SaveStore {
  map = new Map<string, string>();
  failWrites = false;
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

function item(uid: string, extra: Partial<Item> = {}): Item {
  return {
    uid,
    baseId: 'short_sword',
    name: `Blade ${uid}`,
    rarity: 'magic',
    ilvl: 5,
    mods: [{ affixId: 'sharp', stat: 'physMin' as Item['mods'][number]['stat'], value: 3, tier: 1, kind: 'prefix' }],
    upgrade: 0,
    sockets: [{ gemId: null }],
    value: 40,
    ...extra,
  };
}

function hero(id: string, level: number): Character {
  return {
    id,
    name: `Hero ${id}`,
    classId: 'warden',
    level,
    xp: level * 100,
    statPoints: 0,
    skillPoints: 1,
    allocated: { strength: 3, dexterity: 1, vitality: 2, energy: 0 },
    skills: { cleave: 1 },
    hotbar: ['cleave', null, null, null, null, null],
    primaryAttack: null,
    equipment: { mainHand: item(`${id}-mh`) },
    inventory: [item(`${id}-inv0`), null, item(`${id}-inv2`)].concat(new Array(57).fill(null)),
    gold: 250,
    depthRecord: 3,
    playtime: 600,
    createdAt: 1,
  };
}

function account(cur: Character | null, roster: Character[]): AccountSave {
  const stash = new Array<Item | null>(STASH_TAB_SIZE * 4).fill(null);
  stash[0] = item('stash0');
  return {
    version: SAVE_VERSION,
    stash,
    stashTabs: 4,
    bankGold: 1000,
    bestDepth: 7,
    fallen: [],
    unlocks: ['vendor2'],
    current: cur,
    roster,
    materials: { ore: 5 },
    settings: {
      ...DEFAULT_SETTINGS,
      masterVolume: 0.5,
      musicVolume: 0.5,
      sfxVolume: 0.5,
      quality: 'medium',
      showDamageNumbers: false,
      screenShake: 0.5,
      cameraDistance: 1,
    },
  };
}

/** Structural invariants every loaded account must satisfy. */
function invariants(a: AccountSave): string[] {
  const bad: string[] = [];
  const num = (v: unknown, w: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(`${w} is ${String(v)}`);
  };
  num(a.version, 'version');
  num(a.bankGold, 'bankGold');
  num(a.bestDepth, 'bestDepth');
  num(a.stashTabs, 'stashTabs');
  if (!Array.isArray(a.stash) || a.stash.length !== a.stashTabs * STASH_TAB_SIZE) bad.push('stash size');
  if (!Array.isArray(a.fallen)) bad.push('fallen');
  if (!Array.isArray(a.unlocks)) bad.push('unlocks');
  if (!Array.isArray(a.roster)) bad.push('roster');
  for (const [k, v] of Object.entries(a.materials ?? {})) num(v, `materials.${k}`);
  const checkItem = (it: unknown, w: string) => {
    if (it === null) return;
    const i = it as Item;
    if (typeof i?.uid !== 'string' || typeof i.baseId !== 'string') bad.push(`${w} item identity`);
    num(i?.ilvl, `${w}.ilvl`);
    num(i?.value, `${w}.value`);
    num(i?.upgrade, `${w}.upgrade`);
    if (!Array.isArray(i?.mods) || !Array.isArray(i?.sockets)) bad.push(`${w} mods/sockets`);
  };
  a.stash.forEach((it, i) => checkItem(it, `stash[${i}]`));
  const chars = [...(a.roster ?? [])];
  if (a.current) {
    chars.push(a.current);
    if (!a.roster?.includes(a.current)) bad.push('current is not the roster entry (stale copy)');
  }
  for (const c of chars) {
    for (const k of ['level', 'xp', 'gold', 'statPoints', 'skillPoints', 'playtime', 'depthRecord'] as const) num(c[k], `${c.name}.${k}`);
    for (const k of ['strength', 'dexterity', 'vitality', 'energy'] as const) num(c.allocated?.[k], `${c.name}.${k}`);
    if (!Array.isArray(c.hotbar) || !Array.isArray(c.inventory)) bad.push(`${c.name} lists`);
    c.inventory.forEach((it, i) => checkItem(it, `${c.name}.inv[${i}]`));
    for (const [s, it] of Object.entries(c.equipment ?? {})) checkItem(it, `${c.name}.eq.${s}`);
  }
  return bad;
}

interface Case {
  name: string;
  ok: boolean;
  detail?: string;
}
const cases: Case[] = [];
function check(name: string, fn: () => true | string): void {
  try {
    const r = fn();
    cases.push(r === true ? { name, ok: true } : { name, ok: false, detail: r });
  } catch (err) {
    cases.push({ name, ok: false, detail: `threw: ${err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : String(err)}` });
  }
}

const toasts: string[] = [];
events.on('toast', (t) => toasts.push(t.text));

const fresh = (store = new MemStore()) => ({ store, s: new SaveManager(store) });

check('a new player gets a fresh account', () => {
  const { s } = fresh();
  const a = s.load();
  return s.loadReport.source === 'fresh' && a.roster?.length === 0 ? true : `source=${s.loadReport.source}`;
});

check('a save round-trips and the live hero is the roster entry', () => {
  const { store, s } = fresh();
  s.load();
  const h = hero('a', 4);
  s.setCharacter(h);
  s.stashItem(item('st1'));
  s.flush();
  const s2 = new SaveManager(store);
  const a = s2.load();
  const bad = invariants(a);
  if (bad.length) return bad.join('; ');
  if (a.current?.level !== 4 || a.current.equipment.mainHand?.uid !== 'a-mh') return 'hero changed in the round trip';
  return s2.loadReport.repairs.length === 0 ? true : `clean save reported repairs: ${s2.loadReport.repairs.join(', ')}`;
});

check('progress since boot survives picking the same hero from the roster', () => {
  // Written by the old build: `current` and its roster entry were separate
  // copies after any reload, and the roster one went stale.
  const store = new MemStore();
  const live = hero('a', 12);
  const stale = hero('a', 3);
  store.setItem(SAVE_KEY, JSON.stringify({ ...account(live, [stale, hero('b', 5)]), version: 1 }));
  const s = new SaveManager(store);
  s.load();
  const back = s.selectCharacter('a');
  return back?.level === 12 ? true : `picked hero is level ${back?.level}, expected 12`;
});

check('a v1 save with no roster lists its hero', () => {
  const store = new MemStore();
  const raw = account(hero('a', 6), []) as unknown as Record<string, unknown>;
  delete raw.roster;
  raw.version = 1;
  store.setItem(SAVE_KEY, JSON.stringify(raw));
  const s = new SaveManager(store);
  const a = s.load();
  return a.roster?.length === 1 && a.roster[0] === a.current && s.loadReport.fromVersion === 1 ? true : 'hero not on the roster';
});

check('a truncated save recovers from the backup and keeps the damaged text', () => {
  const { store, s } = fresh();
  s.load();
  s.setCharacter(hero('a', 9));
  s.flush();
  // A clean load writes the backup.
  new SaveManager(store).load();
  const good = store.getItem(SAVE_KEY)!;
  store.setItem(SAVE_KEY, good.slice(0, Math.floor(good.length / 2)));
  const s2 = new SaveManager(store);
  const a = s2.load();
  if (s2.loadReport.source !== 'backup') return `source=${s2.loadReport.source}`;
  if (a.current?.level !== 9) return 'hero lost';
  if (!store.getItem(CORRUPT_KEY)) return 'damaged save was not kept';
  if (!store.getItem(SAVE_KEY)?.endsWith('}')) return 'primary was not rewritten from the backup';
  return true;
});

check('both copies unreadable: fresh account, damaged text kept, no crash', () => {
  const store = new MemStore();
  store.setItem(SAVE_KEY, '{"stash":[');
  store.setItem(BACKUP_KEY, 'not json');
  const s = new SaveManager(store);
  const a = s.load();
  return s.loadReport.primaryDamaged && !a.current && store.getItem(CORRUPT_KEY) === '{"stash":[' ? true : 'did not keep the damaged save';
});

check('a deleted save is not resurrected from the backup', () => {
  const store = new MemStore();
  store.setItem(BACKUP_KEY, JSON.stringify(account(hero('a', 2), [])));
  const s = new SaveManager(store);
  const a = s.load();
  return !a.current ? true : 'backup came back after the primary was removed';
});

check('damaged fields are repaired and the hero survives', () => {
  const store = new MemStore();
  const h = hero('a', 7) as unknown as Record<string, unknown>;
  h.gold = 'lots';
  h.level = null; // what NaN becomes after JSON
  h.xp = -50;
  h.allocated = undefined;
  h.skills = { cleave: 2, broken: 'x' };
  h.hotbar = 'cleave';
  (h.inventory as unknown[])[1] = { name: 'no uid or base' };
  (h.inventory as unknown[])[2] = item('weird', { mods: [null, { affixId: 'x' }] as never, sockets: 'two' as never, value: NaN });
  (h.equipment as Record<string, unknown>).tail = item('tailitem');
  const raw = account(h as unknown as Character, [h as unknown as Character]) as unknown as Record<string, unknown>;
  raw.stash = 'gone';
  raw.bankGold = null;
  raw.materials = { ore: 'many', dust: 3 };
  raw.settings = { masterVolume: 9, quality: 'potato' };
  store.setItem(SAVE_KEY, JSON.stringify(raw));
  const s = new SaveManager(store);
  const a = s.load();
  const bad = invariants(a);
  if (bad.length) return bad.join('; ');
  const c = a.current;
  if (!c) return 'hero lost';
  if (c.skills.cleave !== 2 || c.equipment.mainHand?.uid !== 'a-mh') return 'hero lost their skills or gear';
  if (!c.inventory.some((i) => i?.uid === 'tailitem')) return 'item in an unknown slot was thrown away';
  if (a.settings.masterVolume !== 1 || a.settings.quality !== 'high') return 'settings not clamped';
  if (s.loadReport.quarantined !== 1) return `quarantined ${s.loadReport.quarantined}, expected 1`;
  if (!store.getItem(QUARANTINE_KEY)?.includes('no uid or base')) return 'unreadable item was not kept aside';
  return true;
});

check('a classless character is set aside, not deleted', () => {
  const store = new MemStore();
  const broken = { id: 'x', name: 'Ghost' };
  store.setItem(SAVE_KEY, JSON.stringify(account(hero('a', 3), [hero('a', 3), broken as unknown as Character])));
  const s = new SaveManager(store);
  const a = s.load();
  return a.roster?.length === 1 && store.getItem(QUARANTINE_KEY)?.includes('Ghost') ? true : 'classless character vanished';
});

check('an import that is not a save changes nothing', () => {
  const { s } = fresh();
  s.load();
  s.setCharacter(hero('a', 5));
  const bad = ['', '!!!', btoa('123'), btoa('null'), btoa('{"hello":1}'), btoa('[1,2]')];
  for (const b of bad) if (s.importSave(b)) return `accepted ${JSON.stringify(b)}`;
  return s.account.current?.level === 5 ? true : 'current account was replaced';
});

check('a good import loads and the old account becomes the backup', () => {
  const { store, s } = fresh();
  s.load();
  s.setCharacter(hero('a', 5));
  const blob = btoa(JSON.stringify(account(hero('z', 20), [])));
  if (!s.importSave(blob)) return 'import refused';
  if (s.account.current?.id !== 'z') return 'import did not take';
  return store.getItem(BACKUP_KEY)?.includes('"id":"a"') ? true : 'old account not kept as backup';
});

check('export then import is lossless', () => {
  const { s } = fresh();
  s.load();
  s.setCharacter(hero('a', 5));
  const before = JSON.stringify(s.account);
  if (!s.importSave(s.exportSave())) return 'own export refused';
  return JSON.stringify(s.account) === before ? true : 'round trip changed the account';
});

// A hero saved mid-map (closed tab, refresh, crash) wakes in town as they
// went down, less a tenth of a level's experience; never a level, never dead.
check('a map left by closing the game is settled on the next load', () => {
  const { store, s } = fresh();
  s.load();
  const h = hero('a', 10);
  s.setCharacter(h);
  s.account.materials.ore = 5;
  s.beginRun(4);
  const c = s.account.current!;
  c.inventory[5] = item('found1');
  c.equipment.mainHand = item('found2');
  c.gold += 900;
  s.account.materials.ore = 50;
  s.setCharacter(c);
  s.flush();
  const s2 = new SaveManager(store);
  const a = s2.load();
  const b = a.current;
  if (!b) return 'the hero is gone';
  if (b.run) return 'the note was not settled';
  if (b.equipment.mainHand?.uid !== 'a-mh') return `worn item is ${b.equipment.mainHand?.uid}, not the one taken down`;
  if (b.inventory.some((it) => it?.uid === 'found1') || b.gold !== 250) return 'kept what was found on the map';
  if (a.materials.ore !== 5) return `materials ${a.materials.ore}, expected 5`;
  if (b.level !== 10 || b.xp !== 1000 - Math.floor(xpForLevel(10) * 0.1)) return `level ${b.level} xp ${b.xp}`;
  const f = s2.takeForfeit('a');
  if (!f || f.items !== 2 || f.gold !== 900) return `forfeit ${JSON.stringify(f)}`;
  if (s2.takeForfeit('a')) return 'told twice';
  return invariants(a).join('; ') || true;
});

check('a map that ends well keeps everything, and the menu leave costs', () => {
  const { s } = fresh();
  s.load();
  s.setCharacter(hero('a', 3));
  s.beginRun(2);
  s.account.current!.inventory[5] = item('kept');
  s.endRun();
  if (s.forfeitRun()) return 'a finished map was settled';
  if (!s.account.current!.inventory.some((it) => it?.uid === 'kept')) return 'a finished map lost its loot';
  s.beginRun(3);
  const c = s.account.current!;
  c.inventory[6] = item('lost');
  c.xp = 5;
  const f = s.forfeitRun();
  if (!f || f.items !== 1) return `forfeit ${JSON.stringify(f)}`;
  if (c.xp !== 0 || c.level !== 3) return `xp ${c.xp} level ${c.level}: went below the level's start`;
  if (!c.inventory.some((it) => it?.uid === 'kept') || c.inventory.some((it) => it?.uid === 'lost')) return 'wrong pack after leaving';
  return true;
});

check('a damaged map note keeps the gear the hero holds now', () => {
  const store = new MemStore();
  const h = hero('a', 6);
  (h as { run?: unknown }).run = { v: 1, equipment: 'junk', inventory: 7 };
  store.setItem(SAVE_KEY, JSON.stringify(account(h, [h])));
  const s = new SaveManager(store);
  const a = s.load();
  return a.current?.equipment.mainHand?.uid === 'a-mh' && !a.current.run && a.current.xp === 600 ? true : 'gear or experience lost to a bad note';
});

check('a full disk does not crash and tells the player once', () => {
  const { store, s } = fresh();
  s.load();
  store.failWrites = true;
  toasts.length = 0;
  s.setCharacter(hero('a', 5));
  s.setCharacter(hero('a', 6));
  return s.writeFailures > 0 && toasts.filter((t) => t.includes('Could not save')).length === 1 ? true : `failures=${s.writeFailures} toasts=${toasts.length}`;
});

check('a second tab writing the save stops this one overwriting it', () => {
  const { store, s } = fresh();
  s.load();
  s.setCharacter(hero('a', 5));
  store.setItem(SAVE_KEY, JSON.stringify(account(hero('other', 30), [])));
  s.foreignWrite();
  s.setCharacter(hero('a', 6));
  s.flush();
  return store.getItem(SAVE_KEY)?.includes('"other"') ? true : 'this tab overwrote the other tab';
});

check('a save from a newer build keeps fields this build does not know', () => {
  const store = new MemStore();
  const raw = { ...account(hero('a', 5), []), version: SAVE_VERSION + 5, futureThing: { keep: true } } as Record<string, unknown>;
  (raw.settings as Record<string, unknown>).futureSetting = 3;
  store.setItem(SAVE_KEY, JSON.stringify(raw));
  const s = new SaveManager(store);
  s.load();
  s.touch();
  s.flush();
  const back = JSON.parse(store.getItem(SAVE_KEY)!);
  if (!s.loadReport.newerVersion) return 'newer version not noticed';
  if (back.version !== SAVE_VERSION + 5) return `version downgraded to ${back.version}`;
  return back.futureThing?.keep && back.settings.futureSetting === 3 ? true : 'unknown fields stripped';
});

check('hard reset removes every copy', () => {
  const { store, s } = fresh();
  s.load();
  s.setCharacter(hero('a', 5));
  new SaveManager(store).load();
  s.hardReset();
  const left = [SAVE_KEY, BACKUP_KEY, CORRUPT_KEY, QUARANTINE_KEY].filter((k) => store.getItem(k) !== null);
  return left.length === 0 ? true : `left behind: ${left.join(', ')}`;
});

check('storage that throws on every call never crashes the game', () => {
  const evil: SaveStore = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  const s = new SaveManager(evil);
  s.load();
  s.setCharacter(hero('a', 2));
  s.flush();
  s.checkpoint();
  s.hardReset();
  return true;
});

check('uniques that dropped before the story pass take their new names, silently', () => {
  const h = hero('u', 10);
  h.equipment.mainHand = item('u-mh', { rarity: 'unique', uniqueId: 'uq.rixots', name: "Rixot's Keen" });
  h.inventory[1] = item('u-set', { rarity: 'set', uniqueId: 'uq.rixots', setId: 'set.x', name: 'Set Piece' });
  h.inventory[3] = item('u-unk', { rarity: 'unique', uniqueId: 'uq.nobody-knows', name: 'Kept As Is' });
  const { data, report } = migrateAccount(account(h, [h]));
  const c = data.current!;
  if (c.equipment.mainHand?.name !== "Orlo's Keen") return `renamed to ${c.equipment.mainHand?.name}`;
  if (c.inventory[1]?.name !== 'Set Piece') return 'a set piece was renamed';
  if (c.inventory[3]?.name !== 'Kept As Is') return 'an unknown unique was renamed';
  if (report.repairs.length) return `rename reported as damage: ${report.repairs.join('; ')}`;
  return true;
});

check('uniques and set pieces from older builds take their fixed lines today', () => {
  const def = getUnique('uq.rixots')!;
  const piece = SET_PIECES.find((p) => (EXTRA_LINES[p.id]?.length ?? 0) > 0)!;
  const fresh = buildSetPiece(piece, new Random(9));
  const mod = (affixId: string, stat: string, value: number, kind: Item['mods'][number]['kind'] = 'prefix') => ({ affixId, stat: stat as StatKey, value, tier: 0, kind });
  const h = hero('o', 30);
  // Dropped deep before #97: written lines grown with depth, random open-pool lines, item level 80.
  h.equipment.mainHand = item('o-uq', {
    rarity: 'unique',
    uniqueId: def.id,
    name: def.name,
    baseId: def.baseId,
    ilvl: 80,
    sockets: [{ gemId: 'gem.ruby.1' }],
    mods: [
      ...def.mods.map((m, i) => mod(`unique.${def.id}.${i}`, m.stat, m.max * 3)),
      mod('sharp', 'lifeSteal', 4),
      mod('of_the_fox', 'dexterity', 9, 'suffix'),
    ],
  });
  // A set piece with its written lines but none of its fixed extra lines.
  h.inventory[2] = { ...fresh, uid: 'o-set', mods: fresh.mods.filter((m) => !/\.x\d+$/.test(m.affixId)) };
  const { data, report } = migrateAccount(account(h, [h]));
  const c = data.current!;
  const u = c.equipment.mainHand!;
  const want = [...def.mods.map((_, i) => `unique.${def.id}.${i}`), ...(EXTRA_LINES[def.id] ?? []).map((_, i) => `unique.${def.id}.x${i}`)];
  const got = u.mods.filter((m) => m.kind !== 'implicit');
  if (got.map((m) => m.affixId).join() !== want.join()) return `unique lines ${got.map((m) => m.affixId).join()}`;
  const ranges = [...def.mods.map((m) => [m.min, m.max]), ...(EXTRA_LINES[def.id] ?? []).map(([, lo, hi]) => [lo, hi])];
  const off = got.findIndex((m, i) => m.value < ranges[i]![0]! || m.value > ranges[i]![1]!);
  if (off >= 0) return `${got[off]!.stat} ${got[off]!.value} outside ${ranges[off]!.join('-')}`;
  if (u.ilvl !== def.ilvl) return `unique item level ${u.ilvl}, not ${def.ilvl}`;
  if (u.sockets[0]?.gemId !== 'gem.ruby.1') return 'socketed gem lost';
  const sp = c.inventory[2]!;
  const setWant = fresh.mods.filter((m) => m.kind !== 'implicit').map((m) => m.affixId);
  if (sp.mods.filter((m) => m.kind !== 'implicit').map((m) => m.affixId).join() !== setWant.join()) return 'set piece did not gain its extra lines';
  const kept = fresh.mods.filter((m) => !/\.x\d+$/.test(m.affixId));
  if (kept.some((m) => sp.mods.find((n) => n.affixId === m.affixId)?.value !== m.value)) return 'set piece lost a roll it already had';
  if (report.repairs.length) return `upgrade reported as damage: ${report.repairs.join('; ')}`;
  // Loading again changes nothing, and a piece built today is left alone.
  const again = migrateAccount(JSON.parse(JSON.stringify(data))).data.current!;
  if (JSON.stringify(again.equipment.mainHand) !== JSON.stringify(u) || JSON.stringify(again.inventory[2]) !== JSON.stringify(sp)) return 'a second load changed the items';
  if (refreshFixedLines(buildSetPiece(piece, new Random(4)))) return 'a piece built today was changed';
  return true;
});

// Fuzz: random damage to a good save never throws and always yields a valid
// account; the hero survives whenever their class does.
const fuzz = { runs: 0, heroKept: 0, heroExpected: 0, failures: [] as string[] };
{
  const rng = new Random(0x5a7e);
  const junk = (): unknown => rng.pick([null, undefined, NaN, -1, 1e308, '', 'x', [], {}, true, [null], { uid: 3 }]);
  const paths = (o: unknown, pre: string[] = [], out: string[][] = []): string[][] => {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        out.push([...pre, k]);
        if (pre.length < 5) paths((o as Record<string, unknown>)[k], [...pre, k], out);
      }
    }
    return out;
  };
  for (let run = 0; run < 400; run++) {
    const h = hero('a', 5);
    const a = JSON.parse(JSON.stringify(account(h, [h, hero('b', 2)])));
    const all = paths(a).filter((p) => !(p[0] === 'stash' && Number(p[1]) > 3));
    const hits = rng.int(1, 6);
    for (let i = 0; i < hits; i++) {
      const p = rng.pick(all);
      let o = a;
      for (const k of p.slice(0, -1)) o = o?.[k];
      if (o && typeof o === 'object') {
        if (rng.chance(0.3)) delete o[p[p.length - 1]!];
        else o[p[p.length - 1]!] = junk();
      }
    }
    const classOk = typeof a.current?.classId === 'string' && a.current.classId.length > 0;
    try {
      const { data } = migrateAccount(JSON.parse(JSON.stringify(a)));
      const bad = invariants(data);
      if (bad.length) fuzz.failures.push(`run ${run}: ${bad[0]}`);
      if (classOk) {
        fuzz.heroExpected++;
        if (data.current) fuzz.heroKept++;
        else fuzz.failures.push(`run ${run}: hero lost though class was intact`);
      }
    } catch (err) {
      fuzz.failures.push(`run ${run}: threw ${String(err)}`);
    }
    fuzz.runs++;
  }
}
cases.push({
  name: `fuzz: ${fuzz.runs} randomly damaged saves load valid, hero kept ${fuzz.heroKept}/${fuzz.heroExpected}`,
  ok: fuzz.failures.length === 0,
  detail: fuzz.failures.slice(0, 5).join(' || '),
});

console.log(JSON.stringify({ cases }));
