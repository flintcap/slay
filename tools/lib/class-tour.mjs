/**
 * The class tour for `tools/check-flow.mjs --class=<id>`: everything a new
 * player of that class touches between forging the hero and the first pause
 * menu, through the real keys, clicks and prompts wherever the game has one.
 *
 * Starts in town with the freshly forged hero; ends in the second area of a
 * map, ready for check-flow's pause steps.
 */

const TOWN_PANELS = [
  'inventory', 'character', 'skills', 'stash', 'map', 'questLog', 'journal', 'lootFilter', 'legacy',
  'vendor', 'alchemist', 'blacksmith', 'gambler', 'enchanter', 'bounties', 'settings', 'memorial',
];
const DUNGEON_PANELS = ['inventory', 'character', 'skills', 'map', 'questLog', 'journal', 'lootFilter', 'legacy', 'settings'];

export async function classTour({ page, step, arrive, key, frames, setName, classId }) {
  /** Every open panel's id-ish class list, for messages. */
  const openPanels = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.panel-wrap.is-open, .modal-wrap.is-open')]
        .filter((e) => getComputedStyle(e).visibility !== 'hidden')
        .map((e) => e.className.replace(/\s+/g, ' ').trim()),
    );
  /** Escape until nothing but the HUD is up. Never opens the pause menu. */
  const closeAll = async () => {
    for (let i = 0; i < 6 && (await openPanels()).length; i++) {
      await key('Escape');
      await page.waitForTimeout(350);
    }
    const left = await openPanels();
    if (left.length) throw new Error(`Escape left open: ${left.join(' | ')}`);
  };
  const errorsNow = () => page.evaluate(() => window.SLAY.engine.errors.size);
  const waitFor = (fn, arg, timeout = 120_000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
  /** Opens each panel through the bus and closes it with Escape. */
  const tourPanels = async (ids) => {
    const bad = [];
    for (const id of ids) {
      const before = await errorsNow();
      await page.evaluate((p) => window.SLAY.events.emit('ui:open', { panel: p }), id);
      await frames(page, 4);
      await page.waitForTimeout(300);
      const open = await openPanels();
      if (!open.length) bad.push(`${id} did not open`);
      // A panel that opens settings-style tabs or nested screens may need a
      // few presses; closeAll throws if one is stuck.
      try {
        await closeAll();
      } catch (err) {
        bad.push(`${id}: ${err.message}`);
      }
      if ((await errorsNow()) > before) bad.push(`${id} raised an engine error`);
    }
    if (bad.length) throw new Error(bad.join('; '));
    return `${ids.length} panels`;
  };
  /** Stand at a world point and stop. */
  const standAt = (x, z) =>
    page.evaluate(
      async ([px, pz]) => {
        const s = window.SLAY.engine.currentScene;
        s.player.root.position.set(px, s.player.root.position.y, pz);
        s.player.stop();
        for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
      },
      [x, z],
    );

  await step('class is the one picked at character select', async () => {
    const c = await page.evaluate(() => window.SLAY.save.account.current?.classId);
    if (c !== classId) throw new Error(`forged a ${c}`);
    return c;
  });

  await step('a townsperson talks when you press E by them', async () => {
    await page.waitForTimeout(1500);
    await closeAll();
    const spot = await page.evaluate(() => {
      const s = window.SLAY.engine.currentScene;
      const it = s.interactables.find((i) => i.id.startsWith('talk:'));
      return it ? { id: it.id, x: it.pos.x, z: it.pos.z } : null;
    });
    if (!spot) throw new Error('no one to talk to in town');
    await standAt(spot.x, spot.z);
    await page.keyboard.press('e');
    await waitFor(() => window.SLAY.debug.panelOpen('dialogue'), null, 60_000);
    await closeAll();
    return spot.id;
  });

  await step('the merchant talks, and option 1 opens the trade', async () => {
    const at = await page.evaluate(() => {
      const it = window.SLAY.engine.currentScene.interactables.find((i) => i.id === 'vendor');
      return { x: it.pos.x, z: it.pos.z };
    });
    await standAt(at.x, at.z);
    await page.keyboard.press('e');
    await waitFor(() => window.SLAY.debug.panelOpen('dialogue') || window.SLAY.debug.panelOpen('vendor'), null, 60_000);
    if (await page.evaluate(() => window.SLAY.debug.panelOpen('dialogue'))) {
      await page.keyboard.press('1');
      await waitFor(() => window.SLAY.debug.panelOpen('vendor'), null, 30_000);
    }
    await closeAll();
    return 'vendor opened';
  });

  await step('every town panel opens and closes', () => tourPanels(TOWN_PANELS));

  await step('a geared hero of the class (level 20, six skills on the bar)', async () => {
    const n = await page.evaluate(async (cls) => {
      window.SLAY.debug.makeCharacter(cls, 20, 7);
      await window.SLAY.engine.goTo('town');
      return window.SLAY.save.account.current.name;
    }, classId);
    await arrive('town');
    setName(n);
    const bar = await page.evaluate(() => window.SLAY.save.account.current.hotbar.filter(Boolean).length);
    return `${n}, ${bar} skills`;
  });

  await step('walking to the portal and pressing E opens a map', async () => {
    await page.waitForTimeout(1000);
    await closeAll();
    const at = await page.evaluate(() => {
      const it = window.SLAY.engine.currentScene.interactables.find((i) => i.panel === 'descend');
      return { x: it.pos.x, z: it.pos.z };
    });
    await standAt(at.x, at.z + 0.5);
    await page.keyboard.press('e');
    await arrive('dungeon');
    const m = await page.evaluate(() => {
      const s = window.SLAY.engine.currentScene;
      s.debugGodMode(true);
      return { name: s.run.map?.name, depth: s.run.depth, areas: s.run.levels.length, enemies: s.enemies.length };
    });
    if (!m.name || m.areas < 2 || m.enemies === 0) throw new Error(JSON.stringify(m));
    return `${m.name}, tier ${m.depth}, ${m.areas} areas, ${m.enemies} monsters`;
  });

  // Leave a few bodies by the entry first, so the corpse skills have one.
  await step('two monsters fall by the entry (bodies for corpse skills)', () => page.evaluate(async () => {
    const s = window.SLAY.engine.currentScene;
    const pp = s.player.root.position;
    const near = s.enemies.filter((e) => e.life > 0).sort((a, b) => a.root.position.distanceTo(pp) - b.root.position.distanceTo(pp));
    for (const e of near.slice(0, 2)) {
      e.root.position.set(pp.x + 2, e.root.position.y, pp.z + 1);
      e.takeDamage({ amount: 1e7, type: 'physical', crit: false, source: 'player' }, s.context());
    }
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    return `${near.length} near`;
  }));

  await step('every hotbar skill fires from its key', async () => {
    await page.evaluate(() => {
      const s = window.SLAY.engine.currentScene;
      const real = s.skills.cast.bind(s.skills);
      window.__casts = [];
      s.skills.cast = (id, ...rest) => {
        let ok = false;
        try {
          ok = real(id, ...rest);
        } finally {
          window.__casts.push([id, ok]);
        }
        return ok;
      };
    });
    const bar = await page.evaluate(() => window.SLAY.save.account.current.hotbar);
    const rows = [];
    for (let i = 0; i < 6; i++) {
      const id = bar[i];
      if (!id) continue;
      let fired = false;
      for (let attempt = 0; attempt < 3 && !fired; attempt++) {
        const aim = await page.evaluate(() => {
          const S = window.SLAY;
          const s = S.engine.currentScene;
          const pl = s.player;
          pl.mana = pl.stats.mana;
          pl.cooldowns?.clear();
          pl.actionLock = 0;
          const pp = pl.root.position;
          const e = s.enemies
            .filter((x) => x.life > 0)
            .sort((a, b) => a.root.position.distanceTo(pp) - b.root.position.distanceTo(pp))[0];
          if (!e) return null;
          e.root.position.set(pp.x + 3, e.root.position.y, pp.z);
          const v = new S.THREE.Vector3(pp.x + 3, 1, pp.z).project(s.camera);
          window.__casts.length = 0;
          return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
        });
        if (!aim) throw new Error('no monster left to aim at');
        await page.mouse.move(aim.x, aim.y);
        await frames(page, 2);
        await page.keyboard.press(String(i + 1));
        fired = await page
          .waitForFunction((sid) => window.__casts.some(([c, ok]) => c === sid && ok), id, { timeout: 30_000, polling: 100 })
          .then(() => true, () => false);
      }
      rows.push(`${id}${fired ? '' : ' (REFUSED)'}`);
      await frames(page, 20);
    }
    const refused = rows.filter((r) => r.includes('REFUSED'));
    if (!rows.length) throw new Error('nothing on the hotbar');
    if (refused.length) throw new Error(`refused: ${refused.join(', ')} of ${rows.join(', ')}`);
    return rows.join(', ');
  });

  let worn = null;
  await step('a pack falls, its loot is picked up by clicking the labels', async () => {
    worn = await page.evaluate(async () => {
      const S = window.SLAY;
      const s = S.engine.currentScene;
      const c = S.save.account.current;
      // A piece the hero can surely wear: take it off and drop it.
      const slot = ['head', 'gloves', 'boots', 'belt', 'chest'].find((k) => c.equipment[k]);
      const item = c.equipment[slot];
      c.equipment[slot] = null;
      S.events.emit('item:unequipped', { item });
      S.events.emit('loot:discard', { item });
      const pp = s.player.root.position;
      const near = s.enemies.filter((e) => e.life > 0).sort((a, b) => a.root.position.distanceTo(pp) - b.root.position.distanceTo(pp));
      for (const e of near.slice(0, 10)) e.takeDamage({ amount: 1e7, type: 'physical', crit: false, source: 'player' }, s.context());
      for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
      return { slot, uid: item.uid, name: item.name };
    });
    const drops = await page.evaluate(() => window.SLAY.engine.currentScene.loot.filter((l) => l.item && !l.hidden).map((l) => ({ uid: l.item.uid, x: l.pos.x, z: l.pos.z })));
    let got = 0;
    const missed = [];
    for (const d of drops.slice(0, 8)) {
      await standAt(d.x + 0.8, d.z);
      await frames(page, 6);
      const box = await page.evaluate((uid) => {
        const el = [...document.querySelectorAll('.glabel')].find((e) => e.dataset.key?.startsWith(`${uid}|`) && getComputedStyle(e).display !== 'none');
        const r = el?.getBoundingClientRect();
        return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      }, d.uid);
      if (!box) {
        missed.push(`${d.uid}: no label`);
        continue;
      }
      await page.mouse.click(box.x, box.y);
      await frames(page, 4);
      const inPack = await page.evaluate((uid) => window.SLAY.save.account.current.inventory.some((it) => it?.uid === uid), d.uid);
      if (inPack) got++;
      else missed.push(`${d.uid}: click did not pick it up`);
    }
    const wornInPack = await page.evaluate((uid) => window.SLAY.save.account.current.inventory.some((it) => it?.uid === uid), worn.uid);
    if (!wornInPack) throw new Error(`the dropped ${worn.name} was not picked up; ${missed.join('; ')}`);
    if (missed.length) throw new Error(`${got}/${drops.length} picked; ${missed.join('; ')}`);
    return `${got} of ${drops.length} drops`;
  });

  await step('right-clicking it in the pack puts it on', async () => {
    if (!worn) throw new Error('nothing to equip');
    await key('i');
    await waitFor(() => window.SLAY.debug.panelOpen('inventory'), null, 30_000);
    await frames(page, 4);
    const box = await page.evaluate((uid) => {
      const c = window.SLAY.save.account.current;
      const at = c.inventory.findIndex((it) => it?.uid === uid);
      const grid = [...document.querySelectorAll('.panel-inventory .itemgrid')].find((g) => g.children.length === 60);
      const r = grid?.children[at]?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, at } : null;
    }, worn.uid);
    if (!box) throw new Error('could not find it in the pack grid');
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await frames(page, 4);
    const on = await page.evaluate(([slot, uid]) => window.SLAY.save.account.current.equipment[slot]?.uid === uid, [worn.slot, worn.uid]);
    await closeAll();
    if (!on) throw new Error(`${worn.name} is not in ${worn.slot}`);
    return `${worn.name} -> ${worn.slot}`;
  });

  await step('every panel opens and closes down here', () => tourPanels(DUNGEON_PANELS));

  await step('[E] at the waypoint goes home', async () => {
    const wp = await page.evaluate(() => {
      const s = window.SLAY.engine.currentScene;
      return s.waypoint ? { x: s.waypoint.position.x, z: s.waypoint.position.z } : null;
    });
    if (!wp) throw new Error('no waypoint in the first area');
    await standAt(wp.x + 0.4, wp.z);
    await frames(page, 10);
    await page.keyboard.press('e');
    await arrive('town');
  });

  let firstMap = null;
  await step('the portal again opens a fresh map', async () => {
    await page.waitForTimeout(1000);
    await closeAll();
    const at = await page.evaluate(() => {
      const it = window.SLAY.engine.currentScene.interactables.find((i) => i.panel === 'descend');
      return { x: it.pos.x, z: it.pos.z };
    });
    await standAt(at.x, at.z + 0.5);
    await page.keyboard.press('e');
    await arrive('dungeon');
    firstMap = await page.evaluate(() => {
      const s = window.SLAY.engine.currentScene;
      s.debugGodMode(true);
      return { name: s.run.map?.name, level: s.levelIndex };
    });
    if (firstMap.level !== 0) throw new Error(`arrived in area ${firstMap.level}`);
    return firstMap.name;
  });

  await step('walking into the next zone raises its banner', async () => {
    const r = await page.evaluate(async () => {
      const S = window.SLAY;
      const s = S.engine.currentScene;
      const lvl = s.level;
      if ((lvl.zones?.length ?? 0) < 2) return { skip: true };
      let got = null;
      const off = S.events.on('zone:entered', (p) => (got = p.name));
      const z = lvl.zones[1];
      outer: for (let y = z.bounds.y; y < z.bounds.y + z.bounds.h; y++) {
        for (let x = z.bounds.x; x < z.bounds.x + z.bounds.w; x++) {
          const i = y * lvl.width + x;
          if (lvl.zoneOf[i] !== 1 || lvl.tiles[i] !== 1) continue;
          const w = s.mesh.tileToWorld(x, y);
          s.player.root.position.set(w.x, w.y, w.z);
          s.player.stop();
          break outer;
        }
      }
      for (let i = 0; i < 40 && !got; i++) await new Promise((r) => requestAnimationFrame(r));
      off?.();
      return { got };
    });
    if (r.skip) return 'first area has one zone (skipped)';
    if (!r.got) throw new Error('no zone:entered');
    return r.got;
  });

  await step('the way on leads into the next area', async () => {
    const r = await page.evaluate(async () => {
      const s = window.SLAY.engine.currentScene;
      const from = s.levelIndex;
      const e = s.exitPos;
      s.player.root.position.set(e.x, e.y, e.z);
      s.player.stop();
      for (let i = 0; i < 600 && (s.levelIndex === from || s.transitioning); i++) await new Promise((r) => requestAnimationFrame(r));
      return { from, to: s.levelIndex, enemies: s.enemies.length, zone: s.level.zones?.[0]?.name };
    });
    if (r.to !== r.from + 1) throw new Error(`${r.from} -> ${r.to}`);
    return `area ${r.to + 1}, ${r.zone}, ${r.enemies} monsters`;
  });
}
