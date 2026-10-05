/**
 * A menu that appears under a resting mouse must keep its keyboard highlight.
 *
 *   SLAY_PORT=4302 timeout 600 node tools/check-menu-hover.mjs
 *
 * The flow check found this: click "Quit to Title" in the pause menu, leave the
 * mouse where it is, and the title menu opens with an item under the cursor.
 * The browser sends that item a hover event although the mouse never moved,
 * the highlight jumps off Continue, and Enter picks the wrong thing.
 *
 * Runs on the menus preview page (no WebGL), so it takes seconds.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SLAY_PORT ?? 4302);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, SLAY_NO_HMR: '1' },
  detached: true,
});
server.stderr.on('data', () => {});
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);

let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try {
    up = (await fetch(`http://127.0.0.1:${PORT}/tools/menus-preview.html`)).ok;
  } catch {
    await sleep(500);
  }
}
if (!up) {
  console.error('dev server never came up');
  process.exit(1);
}

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const goTo = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('goTo ')) goTo.push(t.slice(5));
  else if (m.type() === 'error' && !/404/.test(t)) errors.push(t);
});

const active = (root) =>
  page.evaluate((r) => document.querySelector(`${r} .mn-item.is-active .mn-item-label`)?.textContent ?? null, root);
const fails = [];
const expect = (what, got, want) => {
  const ok = got === want;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
  if (!ok) fails.push(what);
};

await page.goto(`http://127.0.0.1:${PORT}/tools/menus-preview.html?screen=title`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.MENUS_READY === true, null, { timeout: 180000 });
await sleep(2500);

// Park the mouse on each title item in turn, reopen the title under it, and
// check the highlight stays on the first item.
const boxes = await page.evaluate(() =>
  [...document.querySelectorAll('.ttl-menu .mn-item')].map((e) => {
    const r = e.getBoundingClientRect();
    return { label: e.querySelector('.mn-item-label')?.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }),
);
for (const b of boxes.slice(1)) {
  await page.mouse.move(b.x, b.y);
  await sleep(100);
  await page.evaluate(() => window.MENUS.title.close());
  await sleep(400);
  await page.evaluate(() => window.MENUS.title.open());
  // Chrome sends its hover events for a layout change on a short timer.
  await sleep(600);
  expect(`reopened under the mouse on "${b.label}"`, await active('.ttl-menu'), 'Continue');
}

// A real mouse move still moves the highlight.
const last = boxes[boxes.length - 1];
await page.mouse.move(last.x, last.y - 6, { steps: 3 });
await sleep(200);
expect('a real mouse move still highlights', (await active('.ttl-menu')) !== 'Continue', true);

// Enter on a fresh open picks Continue.
await page.evaluate(() => window.MENUS.title.close());
await sleep(400);
await page.evaluate(() => window.MENUS.title.open());
await sleep(600);
goTo.length = 0;
await page.keyboard.press('Enter');
await sleep(300);
expect('Enter on a fresh title goes to', goTo[0] ?? null, 'town');

await browser.close();
for (const e of errors) console.log(`page error: ${e}`);
const ok = fails.length === 0 && errors.length === 0;
console.log(`${ok ? 'ok  ' : 'FAIL'} menu hover: ${fails.length} failed, ${errors.length} page errors`);
stopServer();
process.exit(ok ? 0 : 1);
