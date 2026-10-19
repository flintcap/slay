/**
 * Do the accessibility settings work in the real menu?
 *
 *   SLAY_PORT=4309 node tools/check-settings-ui.mjs
 *
 * Boots the game into town, opens Settings the way a player does (Escape for
 * the pause menu, then Settings), and through real clicks and key presses:
 *
 *  1. finds the Accessibility section on the Gameplay tab (text size,
 *     colour-blind colours) and the Key bindings section on Controls
 *  2. moves the text size slider and checks the page text grew
 *  3. turns colour-blind item colours on and checks the setting saved
 *  4. sets Menu size to 150% on the Video tab and checks the menus, the HUD
 *     and the minimap are drawn half as big again, then puts it back
 *  5. rebinds Inventory to P with the Change button, and Character to the
 *     mouse's back button; a left click while choosing for Map cancels
 *  6. closes the menu and checks P opens the inventory, I no longer does,
 *     and the back button opens the character sheet
 *
 * Screenshots of both tabs land in shots/quality/ for a human look.
 */
import { mkdirSync } from 'node:fs';
import { bootGame, frames } from './lib/game.mjs';

const OUT = 'shots/quality';
mkdirSync(OUT, { recursive: true });
const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4309 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);

// Screenshots are for a human look, not part of the verdict: under software
// rendering one can take longer than Playwright's default 30 s.
const shot = async (name) => {
  try {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180_000 });
  } catch (err) {
    console.log(`note  screenshot ${name} skipped: ${String(err).split('\n')[0].slice(0, 120)}`);
  }
};

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass ? '' : `\n        ${detail}`}`);
};

try {
  await page.evaluate(async () => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 5);
    await window.SLAY.engine.goTo('town');
  });
  await frames(page, 30);

  // Escape opens the pause menu in the world; Settings is a row on it.
  await page.keyboard.press('Escape');
  await frames(page, 10);
  const pauseOpen = await page.evaluate(() => window.SLAY.debug.panelOpen('pause'));
  ok('Escape opens the pause menu', pauseOpen);
  const clickedSettings = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /settings/i.test(x.textContent ?? ''));
    b?.click();
    return !!b;
  });
  await frames(page, 10);
  const settingsOpen = await page.evaluate(() => window.SLAY.debug.panelOpen('settings'));
  ok('Settings opens from the pause menu', clickedSettings && settingsOpen, `button=${clickedSettings} open=${settingsOpen}`);

  const tab = async (label) => {
    const hit = await page.evaluate((label) => {
      const b = [...document.querySelectorAll('.stg-tab')].find((x) => (x.textContent ?? '').includes(label));
      b?.click();
      return !!b;
    }, label);
    await frames(page, 6);
    return hit;
  };

  // --- Gameplay: accessibility ------------------------------------------------
  ok('Gameplay tab exists', await tab('Gameplay'));
  const acc = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /^Accessibility$/.test((e.textContent ?? '').trim()));
    const sec = secs[0];
    if (!sec) return null;
    sec.scrollIntoView({ block: 'start' });
    const text = document.body.innerText;
    return { textSize: /Text size/.test(text), colour: /Colour-blind item colours/.test(text), motion: /Reduced motion|Reduce motion/i.test(text) };
  });
  ok('Accessibility section on Gameplay', !!acc && acc.textSize && acc.colour, JSON.stringify(acc));
  ok('Reduced motion toggle on Gameplay', !!acc?.motion, JSON.stringify(acc));
  await frames(page, 4);
  await shot('settings-gameplay');

  // Text size: drive the slider's input like a drag would.
  const scale = await page.evaluate(async () => {
    const before = parseFloat(getComputedStyle(document.documentElement).fontSize);
    // The label carries a hint span, so find the slider by its own name.
    const input = document.querySelector('input[type=range][aria-label="Text size"]');
    if (!input) return { error: 'no slider' };
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const after = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const uiScale = getComputedStyle(document.documentElement).getPropertyValue('--text-scale') || getComputedStyle(document.documentElement).getPropertyValue('--ui-text-scale');
    const saved = window.SLAY.save.settings.textScale;
    // Put it back so the screenshots are at the normal size.
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after, uiScale: uiScale.trim(), saved };
  });
  ok(
    'Text size slider saves and changes the page',
    !scale.error && scale.saved > 1 && (scale.after > scale.before || (scale.uiScale && scale.uiScale !== '1')),
    JSON.stringify(scale),
  );

  const cb = await page.evaluate(async () => {
    // The label carries a hint span, so match the toggle row by its label's start.
    const row = [...document.querySelectorAll('.field-toggle')].find((e) =>
      (e.querySelector('.field-label')?.textContent ?? '').trim().startsWith('Colour-blind item colours'),
    );
    const t = row?.querySelector('[role=switch], button, input[type=checkbox]') ?? null;
    if (!t) return { error: 'no toggle' };
    const before = !!window.SLAY.save.settings.colorBlindRarity;
    t.click();
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const after = !!window.SLAY.save.settings.colorBlindRarity;
    t.click();
    return { before, after };
  });
  ok('Colour-blind toggle flips the setting', !cb.error && cb.before !== cb.after, JSON.stringify(cb));

  // --- Video: menu, HUD and minimap size ------------------------------------------
  ok('Video tab exists', await tab('Video'));
  const sized = await page.evaluate(async () => {
    const frameOf = () => document.querySelector('.stg-tab')?.closest('.panel-frame, .panel') ?? null;
    const minimap = () => document.querySelector('.minimap')?.getBoundingClientRect().width ?? 0;
    const label = [...document.querySelectorAll('.field-label')].find((e) => (e.firstChild?.textContent ?? '').trim() === 'Menu size');
    const input = label?.closest('.field')?.querySelector('input[type=range]');
    if (!input) return { error: 'no Menu size slider' };
    input.scrollIntoView({ block: 'center' });
    const wait = async () => {
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    };
    const before = { panel: frameOf()?.getBoundingClientRect().width ?? 0, minimap: minimap() };
    // A drag moves it without changing anything; letting go applies it.
    input.value = '1.5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    const whileDragging = window.SLAY.save.settings.uiScale ?? 1;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    const ui = document.getElementById('ui');
    const after = { panel: frameOf()?.getBoundingClientRect().width ?? 0, minimap: minimap(), zoom: ui?.currentCSSZoom ?? 0, saved: window.SLAY.save.settings.uiScale };
    return { before, whileDragging, after };
  });
  await shot('settings-video-150');
  ok('Menu size waits for the slider to be let go', !sized.error && sized.whileDragging === 1, JSON.stringify(sized));
  ok(
    'Menu size 150% draws the menus and the HUD half as big again',
    !sized.error && sized.after.saved === 1.5 && Math.abs(sized.after.zoom - 1.5) < 0.01 &&
      sized.after.panel > sized.before.panel * 1.2 && Math.abs(sized.after.minimap - sized.before.minimap * 1.5) < 3,
    JSON.stringify(sized),
  );
  const unsized = await page.evaluate(async () => {
    const label = [...document.querySelectorAll('.field-label')].find((e) => (e.firstChild?.textContent ?? '').trim() === 'Menu size');
    const input = label?.closest('.field')?.querySelector('input[type=range]');
    if (!input) return { error: 'no Menu size slider' };
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    return { saved: window.SLAY.save.settings.uiScale, zoom: document.getElementById('ui')?.currentCSSZoom ?? 0 };
  });
  ok('Menu size goes back to 100%', unsized.saved === 1 && Math.abs(unsized.zoom - 1) < 0.01, JSON.stringify(unsized));

  // --- Controls: rebinding ------------------------------------------------------
  ok('Controls tab exists', await tab('Controls'));
  const started = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.statline-label')].find((e) => (e.textContent ?? '').trim() === 'Inventory');
    const row = label?.closest('.statline');
    const btn = row && [...row.querySelectorAll('button')].find((b) => /change/i.test(b.textContent ?? ''));
    row?.scrollIntoView({ block: 'center' });
    btn?.click();
    return !!btn;
  });
  await frames(page, 4);
  await shot('settings-controls');
  ok('Inventory has a Change button', started);
  await page.keyboard.press('KeyP');
  await frames(page, 6);
  const bound = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.statline-label')].find((e) => (e.textContent ?? '').trim() === 'Inventory');
    return { shown: label?.closest('.statline')?.querySelector('.statline-value')?.textContent ?? '', binds: window.SLAY.save.settings.keybinds };
  });
  ok('Pressing P binds Inventory to P', /^P\b/.test(bound.shown) && bound.binds?.KeyP === 'KeyI', JSON.stringify(bound));

  // A mouse button: Change on Character, then the back button.
  const change = (name) =>
    page.evaluate((name) => {
      const label = [...document.querySelectorAll('.statline-label')].find((e) => (e.textContent ?? '').trim() === name);
      const row = label?.closest('.statline');
      const btn = row && [...row.querySelectorAll('button')].find((b) => /change/i.test(b.textContent ?? ''));
      row?.scrollIntoView({ block: 'center' });
      btn?.click();
      return !!btn;
    }, name);
  const shown = (name) =>
    page.evaluate((name) => {
      const label = [...document.querySelectorAll('.statline-label')].find((e) => (e.textContent ?? '').trim() === name);
      return label?.closest('.statline')?.querySelector('.statline-value')?.textContent ?? '';
    }, name);
  const mouse = (type, button, target = 'body') =>
    page.evaluate(
      ({ type, button, target }) => {
        const bits = { 0: 1, 1: 4, 2: 2, 3: 8, 4: 16 };
        const el = target === 'canvas' ? document.querySelector('canvas') : document.body;
        el?.dispatchEvent(new PointerEvent(type, { button, buttons: type === 'pointerdown' ? bits[button] : 0, bubbles: true, cancelable: true, clientX: 640, clientY: 360 }));
      },
      { type, button, target },
    );
  ok('Character has a Change button', await change('Character'));
  await frames(page, 2);
  await mouse('pointerdown', 3);
  await mouse('pointerup', 3);
  await frames(page, 4);
  const back = { shown: await shown('Character'), binds: await page.evaluate(() => window.SLAY.save.settings.keybinds) };
  ok('The back button binds Character', /Mouse back/.test(back.shown) && back.binds?.KeyC === 'Mouse3', JSON.stringify(back));
  ok('Map has a Change button', await change('Map'));
  await frames(page, 2);
  await mouse('pointerdown', 0);
  await mouse('pointerup', 0);
  await frames(page, 4);
  const map = { shown: await shown('Map'), binds: await page.evaluate(() => window.SLAY.save.settings.keybinds) };
  ok('A left click while choosing cancels, and Map keeps M', /^M\b/.test(map.shown) && !Object.values(map.binds ?? {}).includes('Mouse0'), JSON.stringify(map));

  // Back out to the game: Escape closes Settings, then the pause menu.
  await page.keyboard.press('Escape');
  await frames(page, 6);
  if (await page.evaluate(() => window.SLAY.debug.panelOpen('pause'))) {
    await page.keyboard.press('Escape');
    await frames(page, 6);
  }
  const clear = await page.evaluate(() => !window.SLAY.debug.panelOpen('settings') && !window.SLAY.debug.panelOpen('pause'));
  ok('Escape backs out of Settings and the pause menu', clear);

  await page.mouse.move(640, 360);
  await page.keyboard.press('KeyP');
  await frames(page, 8);
  const pOpens = await page.evaluate(() => window.SLAY.debug.panelOpen('inventory'));
  ok('P opens the inventory after the rebind', pOpens);
  if (pOpens) {
    await page.keyboard.press('KeyP');
    await frames(page, 8);
  }
  await page.keyboard.press('KeyI');
  await frames(page, 8);
  const iOpens = await page.evaluate(() => window.SLAY.debug.panelOpen('inventory'));
  ok('I no longer opens the inventory', !iOpens);
  if (iOpens) {
    await page.keyboard.press('KeyI');
    await frames(page, 8);
  }

  await mouse('pointerdown', 3, 'canvas');
  await frames(page, 2);
  await mouse('pointerup', 3, 'canvas');
  await frames(page, 8);
  const sheet = await page.evaluate(() => window.SLAY.debug.panelOpen('character'));
  ok('The back button opens the character sheet', sheet);

  ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (err) {
  ok('harness', false, String(err).slice(0, 400));
} finally {
  await close();
}

const bad = results.filter((r) => !r.pass).length;
console.log(bad === 0 ? `\nOK — ${results.length} settings checks pass in the real menu.` : `\nFAILED — ${bad} of ${results.length}.`);
process.exit(bad === 0 ? 0 : 1);
