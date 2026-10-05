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
 *  4. rebinds Inventory to P with the Change button, closes the menu, and
 *     checks P opens the inventory and I no longer does
 *
 * Screenshots of both tabs land in shots/quality/ for a human look.
 */
import { mkdirSync } from 'node:fs';
import { bootGame, frames } from './lib/game.mjs';

const OUT = 'shots/quality';
mkdirSync(OUT, { recursive: true });
const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4309 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);

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
  await page.screenshot({ path: `${OUT}/settings-gameplay.png` });

  // Text size: drive the slider's input like a drag would.
  const scale = await page.evaluate(async () => {
    const before = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const row = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === 'Text size');
    let input = null;
    for (let p = row; p && !input; p = p.parentElement) input = p.querySelector('input[type=range]');
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
    const row = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === 'Colour-blind item colours');
    let t = null;
    for (let p = row; p && !t; p = p.parentElement) t = p.querySelector('input[type=checkbox], button, [role=switch]');
    if (!t) return { error: 'no toggle' };
    const before = !!window.SLAY.save.settings.colorBlindRarity;
    t.click();
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const after = !!window.SLAY.save.settings.colorBlindRarity;
    t.click();
    return { before, after };
  });
  ok('Colour-blind toggle flips the setting', !cb.error && cb.before !== cb.after, JSON.stringify(cb));

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
  await page.screenshot({ path: `${OUT}/settings-controls.png` });
  ok('Inventory has a Change button', started);
  await page.keyboard.press('KeyP');
  await frames(page, 6);
  const bound = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.statline-label')].find((e) => (e.textContent ?? '').trim() === 'Inventory');
    return { shown: label?.closest('.statline')?.querySelector('.statline-value')?.textContent ?? '', binds: window.SLAY.save.settings.keybinds };
  });
  ok('Pressing P binds Inventory to P', /^P\b/.test(bound.shown) && bound.binds?.KeyP === 'KeyI', JSON.stringify(bound));

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

  ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (err) {
  ok('harness', false, String(err).slice(0, 400));
} finally {
  await close();
}

const bad = results.filter((r) => !r.pass).length;
console.log(bad === 0 ? `\nOK — ${results.length} settings checks pass in the real menu.` : `\nFAILED — ${bad} of ${results.length}.`);
process.exit(bad === 0 ? 0 : 1);
