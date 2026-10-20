/**
 * Does the game come back from a lost graphics device?
 *
 *   SLAY_PORT=4309 node tools/check-gpulost.mjs
 *
 * Boots the real game, goes down a map, and kills the GPU device under it
 * (`device.destroy()`, then three's `onDeviceLost`, which a destroy alone does
 * not call). Then:
 *
 *  1. the game is held: paused, nothing drawn, a Restart offered
 *  2. Restart opens a new renderer and lands in town, the map left as from
 *     the menu (the run ledger settled)
 *  3. the new renderer draws, finds every three.js hook, and the item icon
 *     studio draws on it
 *  4. "Not now" keeps the game held, and a click on the game asks again
 *  5. a second loss, in town, restarts into town again
 *
 * No error may be caught along the way but the losses themselves.
 */
import { mkdirSync } from 'node:fs';
import { bootGame, frames } from './lib/game.mjs';

const OUT = process.env.SLAY_SHOTS ?? 'shots';
mkdirSync(OUT, { recursive: true });
const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4309 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);

let failed = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`);
};
const waitFor = async (name, fn, timeout = 900_000) => {
  try {
    await page.waitForFunction(fn, null, { timeout, polling: 500 });
    return true;
  } catch {
    ok(name, false, 'timed out');
    return false;
  }
};

// Errors other than the losses themselves.
const otherErrors = () =>
  page.evaluate(() =>
    [...window.SLAY.engine.errors.values()].filter((e) => !/GPU device lost/.test(e.message)).map((e) => `${e.where}: ${e.message}`),
  );

/** Kills the device under the renderer in use, the way a driver reset would. */
const loseDevice = () =>
  page.evaluate(() => {
    const gl = window.SLAY.engine.renderer.gl;
    window.__lostRenderer = window.SLAY.engine.renderer;
    gl.backend.device.destroy();
    gl.onDeviceLost({ api: 'WebGPU', message: 'check-gpulost: device destroyed', reason: 'unknown' });
  });

/** The open modal's buttons, by label. */
const modalState = () =>
  page.evaluate(() => {
    const m = document.querySelector('.modal-wrap .modal');
    if (!m) return null;
    return {
      title: m.querySelector('.modal-title')?.textContent ?? '',
      body: m.querySelector('.modal-body')?.textContent ?? '',
      buttons: [...m.querySelectorAll('.modal-ft button')].map((b) => b.textContent.trim()),
    };
  });
const press = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll('.modal-wrap .modal-ft button')].find((x) => x.textContent.trim() === l);
    b?.click();
    return !!b;
  }, label);

/** The renderer draws: three's render count moves on. */
const draws = async () => {
  const a = await page.evaluate(() => window.SLAY.engine.renderer.gl.info.render.calls);
  await frames(page, 20);
  const b = await page.evaluate(() => window.SLAY.engine.renderer.gl.info.render.calls);
  return b > a;
};

/** An icon for the first item in the pack, drawn afresh by the icon studio. */
const freshIcon = () =>
  page.evaluate(async () => {
    const icons = await import('/src/art/Icons.ts');
    const c = window.SLAY.save.account.current;
    const item = [...Object.values(c.equipment), ...c.inventory].find(Boolean);
    if (!item) return { error: 'no item' };
    icons.clearIconCaches();
    const uri = await new Promise((done) => {
      const now = icons.requestItemIcon(item, done);
      // A blank comes back at once; the drawn icon replaces it.
      setTimeout(() => done(now), 60_000);
    });
    // A blob or data URL: count the pixels the model covers.
    const img = new Image();
    img.src = uri;
    try {
      await img.decode();
    } catch {
      return { error: 'does not decode' };
    }
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    let covered = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) covered++;
    return { size: cv.width, covered };
  });

// --- down a map ---------------------------------------------------------------
await page.evaluate(async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 8);
  await window.SLAY.engine.goTo('dungeon', { depth: 2 });
  window.SLAY.debug.godMode(true);
});
await frames(page, 20);
const before = await page.evaluate(() => ({
  scene: window.SLAY.engine.currentSceneId,
  run: !!window.SLAY.save.account.current?.run,
  errors: window.SLAY.engine.errors.size,
}));
ok('in a map, with its run written down', before.scene === 'dungeon' && before.run, JSON.stringify(before));
const iconBefore = await freshIcon();
ok('the icon studio draws before the loss', !iconBefore.error && iconBefore.covered > 200, JSON.stringify(iconBefore));

// --- 1. lost -----------------------------------------------------------------
await loseDevice();
await frames(page, 10);
const held = await page.evaluate(() => {
  const e = window.SLAY.engine;
  return { lost: e.contextLost, paused: e.paused };
});
ok('the game is held', held.lost && held.paused, JSON.stringify(held));
const ask = await modalState();
ok('a Restart is offered', !!ask && ask.buttons.includes('Restart') && ask.buttons.includes('Not now'), JSON.stringify(ask));
ok('it says what leaving the map costs', !!ask && /found on this map is lost/.test(ask.body), ask?.body);
const stillHeld = await page.evaluate(() => {
  window.SLAY.engine.setPaused(false);
  return window.SLAY.engine.paused;
});
ok('nothing unpauses it but a Restart', stillHeld === true);

// --- 2. Restart from the map ---------------------------------------------------
ok('Restart can be pressed', await press('Restart'));
if (await waitFor('Restart lands in town', () => {
  const e = window.SLAY?.engine;
  return e && e.currentSceneId === 'town' && !e.contextLost && !e.paused;
})) {
  await frames(page, 30);
  const after = await page.evaluate(() => {
    const e = window.SLAY.engine;
    return {
      fresh: e.renderer !== window.__lostRenderer,
      missing: e.renderer.hooks?.missing ?? null,
      run: !!window.SLAY.save.account.current?.run,
    };
  });
  ok('a new renderer is in use', after.fresh);
  ok('the new renderer finds every three.js hook', Array.isArray(after.missing) && after.missing.length === 0, JSON.stringify(after.missing));
  ok('the map was left as from the menu (run settled)', !after.run);
  ok('the new renderer draws', await draws());
  await page.screenshot({ path: `${OUT}/gpulost-town.png` });
  const iconAfter = await freshIcon();
  ok('the icon studio draws on the new renderer', !iconAfter.error && iconAfter.covered > 200, JSON.stringify(iconAfter));
}

// --- 4. Not now ----------------------------------------------------------------
await loseDevice();
await frames(page, 10);
ok('a second loss asks again', (await modalState())?.buttons.includes('Restart') ?? false);
ok('Not now can be pressed', await press('Not now'));
await frames(page, 20);
const notNow = await page.evaluate(() => ({ lost: window.SLAY.engine.contextLost, paused: window.SLAY.engine.paused }));
ok('Not now keeps the game held', notNow.lost && notNow.paused && !(await modalState()), JSON.stringify(notNow));
await page.evaluate(() => window.SLAY.engine.renderer.canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
await frames(page, 10);
const again = await modalState();
ok('a click on the game asks again', !!again && again.buttons.includes('Restart') && /keep playing from here/.test(again.body), JSON.stringify(again));

// --- 5. Restart from town ---------------------------------------------------------
await press('Restart');
if (await waitFor('the second Restart lands in town', () => {
  const e = window.SLAY?.engine;
  return e && e.currentSceneId === 'town' && !e.contextLost && !e.paused && e.renderer !== window.__lostRenderer;
})) {
  await frames(page, 30);
  ok('the second new renderer draws', await draws());
}

const others = await otherErrors();
ok('no other errors were caught', others.length === 0, others.join(' | '));
ok('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await close();
console.log(failed ? `\nFAILED — ${failed} failed.` : '\nOK');
process.exit(failed ? 1 : 0);
