/**
 * Does the whole front-end loop work, start to finish, through the real UI?
 *
 *   SLAY_PORT=4302 timeout 2700 node tools/check-flow.mjs
 *
 * Boots the real game on a fresh save and plays the loop with the keyboard,
 * the way a player would:
 *
 *   title (New Character) -> character select -> forge -> town (saved?)
 *   -> descend -> pause -> Return to Town -> pause -> Quit to Title
 *   -> Continue -> town -> descend -> die -> death screen (fallen, saved?)
 *   -> Rise Again -> character select -> Escape -> title
 *
 * Fails on any page error or any step that does not arrive. Slow under
 * software rendering (each scene build is minutes when the machine is busy),
 * so it is a milestone check, not a per-edit one.
 */
import { bootGame, frames } from './lib/game.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// `--out=<dir>`: also photograph character select and the death screen once
// each has run 6 s of scene time (a free look at the 3D scenes in a real boot).
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
if (OUT) mkdirSync(OUT, { recursive: true });

const T0 = Date.now();
const secs = () => `${Math.round((Date.now() - T0) / 1000)}s`.padStart(6);
const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4302, bootTimeoutMs: 1_500_000 });
console.log(`${secs()}  booted in ${Math.round(bootMs / 1000)}s`);

const results = [];
let stopped = false;
const step = async (name, fn) => {
  if (stopped) return;
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`${secs()}  ok    ${name}${detail ? `  (${detail})` : ''}  [${Math.round((Date.now() - t) / 1000)}s]`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`${secs()}  FAIL  ${name}: ${String(err?.message ?? err).slice(0, 400)}`);
    // Every later step depends on this one having arrived.
    stopped = true;
  }
};

/** Wait until the engine has settled in `id` with no transition running. */
const arrive = (id, timeout = 1_200_000) =>
  page.waitForFunction(
    (want) => {
      const e = window.SLAY?.engine;
      return e && e.currentSceneId === want && !e.transitioning;
    },
    id,
    { timeout, polling: 500 },
  );
const visible = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }, sel);
const labels = (rootSel) =>
  page.evaluate(
    (s) => [...document.querySelectorAll(`${s} .mn-item-label`)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent),
    rootSel,
  );
const key = async (k) => {
  await page.keyboard.press(k);
  await frames(page, 2);
};
const saved = () =>
  page.evaluate(() => {
    window.SLAY.save.flush();
    const raw = localStorage.getItem('slay.account.v1') ?? '';
    return raw;
  });
/** Open the pause menu with Escape, closing whatever first-visit UI is up. */
const openPause = async () => {
  for (let i = 0; i < 4; i++) {
    if (await visible('.pz-root')) return;
    await key('Escape');
    await page.waitForTimeout(400);
  }
  if (!(await visible('.pz-root'))) throw new Error('Escape never opened the pause menu');
};
/** Screenshot after `secs` more of engine time, when `--out` is given. */
const shoot = async (file, secs = 6) => {
  if (!OUT) return;
  const from = await page.evaluate(() => window.SLAY.engine.elapsed);
  await page.waitForFunction((t) => window.SLAY.engine.elapsed > t, from + secs, { timeout: 1_200_000, polling: 1000 });
  await page.screenshot({ path: path.join(OUT, file), timeout: 600_000 });
};
const choose = async (label) => {
  const items = page.locator('.mn-item', { hasText: label });
  if ((await items.count()) === 0) throw new Error(`no menu item "${label}"`);
  await items.first().click();
  await frames(page, 2);
};
/** Confirm the open modal with Enter (the dialogs' keyboard path). */
const confirmModal = async () => {
  await page.waitForTimeout(300);
  await key('Enter');
};

let name = '';

await step('title offers New Character first', async () => {
  await arrive('title');
  const l = await labels('body');
  if (l[0] !== 'New Character') throw new Error(`menu is ${JSON.stringify(l)}`);
  return l.join(', ');
});

await step('Enter opens character select', async () => {
  await key('Enter');
  await arrive('charSelect');
  name = await page.evaluate(() => document.querySelector('.csx-name input')?.value ?? '');
  if (!name) throw new Error('no prefilled name');
  await shoot('flow-charSelect.png');
  return `name ${name}`;
});

await step('Enter forges the character and enters town', async () => {
  await page.waitForTimeout(800);
  await key('Enter');
  await arrive('town');
  const cur = await page.evaluate(() => window.SLAY.save.account.current?.name ?? null);
  if (cur !== name) throw new Error(`current character is ${cur}`);
  if (!(await saved()).includes(name)) throw new Error('character not in the saved account');
  return 'saved';
});

await step('the gate takes you down to depth 1', async () => {
  await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'descend' }));
  await arrive('dungeon');
  return `depth ${await page.evaluate(() => window.SLAY.engine.currentScene?.run?.depth)}`;
});

await step('Escape pauses, Escape resumes', async () => {
  await page.waitForTimeout(1000);
  await openPause();
  await key('Escape');
  await page.waitForTimeout(500);
  if (await visible('.pz-root')) throw new Error('pause menu still open after Escape');
});

await step('pause > Return to Town', async () => {
  await openPause();
  const l = await labels('.pz-root');
  if (!l.includes('Return to Town') || !l.includes('Journal')) throw new Error(`pause menu is ${JSON.stringify(l)}`);
  await choose('Return to Town');
  await confirmModal();
  await arrive('town');
});

await step('pause > Quit to Title', async () => {
  await page.waitForTimeout(1000);
  await openPause();
  await choose('Quit to Title');
  await confirmModal();
  await arrive('title');
});

await step('title offers Continue, which returns to town', async () => {
  const l = await labels('body');
  if (l[0] !== 'Continue' || l[1] !== 'Characters') throw new Error(`menu is ${JSON.stringify(l)}`);
  await key('Enter');
  await arrive('town');
  const cur = await page.evaluate(() => window.SLAY.save.account.current?.name ?? null);
  if (cur !== name) throw new Error(`continued as ${cur}`);
});

await step('descend again and die', async () => {
  await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'descend' }));
  await arrive('dungeon');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.SLAY.engine.currentScene.player.life = 0;
  });
  await arrive('death');
});

await step('death screen shows the run, and the save keeps the fallen', async () => {
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.querySelector('.dth-root, .dth')?.textContent ?? document.body.textContent);
  if (!text.includes(name)) throw new Error('death screen does not name the character');
  const acct = await page.evaluate(() => ({
    current: window.SLAY.save.account.current?.name ?? null,
    fallen: window.SLAY.save.account.fallen.map((f) => f.name),
  }));
  if (acct.current) throw new Error(`a dead character is still current: ${acct.current}`);
  if (!acct.fallen.includes(name)) throw new Error('not on the memorial');
  const raw = await saved();
  if (!raw.includes(name)) throw new Error('memorial not saved');
  const l = await labels('body');
  if (l[0] !== 'Rise Again') throw new Error(`death menu is ${JSON.stringify(l)}`);
  await shoot('flow-death.png', 9);
  return l.join(', ');
});

await step('Enter rises again into character select', async () => {
  await key('Enter');
  await arrive('charSelect');
});

await step('Escape goes back to the title', async () => {
  await page.waitForTimeout(800);
  await key('Escape');
  await arrive('title');
  const l = await labels('body');
  if (l[0] !== 'New Character' || !l.includes('The Fallen')) throw new Error(`menu is ${JSON.stringify(l)}`);
});

const engineErrors = await page.evaluate(() => [...(window.SLAY?.engine?.errors?.values() ?? [])].map((e) => `${e.where}: ${e.message}`)).catch(() => []);
await close();

const bad = results.filter((r) => !r.ok);
for (const e of pageErrors) console.log(`page error: ${e}`);
for (const e of engineErrors) console.log(`engine error: ${e}`);
const ok = bad.length === 0 && !stopped && pageErrors.length === 0 && engineErrors.length === 0;
console.log(`${ok ? 'ok  ' : 'FAIL'} flow: ${results.length - bad.length}/${results.length} steps, ${pageErrors.length} page errors, ${engineErrors.length} engine errors, ${secs().trim()}`);
process.exit(ok ? 0 : 1);
