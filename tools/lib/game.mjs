/**
 * Shared harness for browser checkers: start a dev server on `SLAY_PORT`,
 * launch software-rendered Chromium, boot the game, and hand back the page.
 *
 *   import { bootGame, frames } from './lib/game.mjs';
 *   const { page, close, pageErrors } = await bootGame({ fallbackPort: 4309 });
 *   ...
 *   await close();
 *
 * The server runs in its own process group and is torn down on `close()` and
 * on process exit, so a checker that throws does not leave the port held for
 * the next one.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export async function bootGame({
  fallbackPort = 4309,
  viewport = { width: 1280, height: 720 },
  bootTimeoutMs = 900_000,
  preview = false,
  extraArgs = [],
} = {}) {
  const port = Number(process.env.SLAY_PORT ?? fallbackPort);
  // Something already answering here would be used in place of our own
  // server (ours fails to bind under --strictPort): a stale build, or a
  // preview with no /src. Refuse rather than test the wrong thing.
  const held = await fetch(`http://127.0.0.1:${port}/`).then(
    () => true,
    () => false,
  );
  if (held) throw new Error(`port ${port} is already in use by another server; stop it first`);
  const args = preview
    ? ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']
    : ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
  const server = spawn('npx', args, {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    // Freeze the module graph: a source edit mid-run must not reload the page.
    env: { ...process.env, SLAY_NO_HMR: '1' },
    detached: true,
  });
  const killServer = () => {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  };
  process.on('exit', killServer);
  let up = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) {
        up = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!up) {
    killServer();
    throw new Error(`dev server did not come up on port ${port}`);
  }

  const browser = await chromium.launch({
    executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', ...extraArgs],
  });
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: bootTimeoutMs, polling: 500 });
  const bootMs = Date.now() - t0;

  const close = async () => {
    await browser.close().catch(() => {});
    killServer();
  };
  return { page, browser, port, pageErrors, consoleErrors, bootMs, close };
}

/** Wait `n` animation frames inside the page. */
export const frames = (page, n) =>
  page.evaluate(async (k) => {
    for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
  }, n);
