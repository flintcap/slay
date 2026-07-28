/**
 * Verifies the single-file artifact bundle actually boots.
 *
 * Serves dist-single/slay.html over HTTP and loads it the way a browser would,
 * rather than injecting it with setContent — a 1.8 MB inline script is exactly
 * the case where those two paths diverge.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

const body = readFileSync('dist-single/slay.html', 'utf8');
// Wrap exactly as the artifact host does.
const pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(pageHtml);
});
await new Promise((r) => server.listen(4195, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text().slice(0, 400));
});

await page.goto('http://127.0.0.1:4195/', { waitUntil: 'load', timeout: 60000 });

const ok = await page
  .waitForFunction(() => window.SLAY?.debug && window.SLAY?.engine?.currentSceneId, { timeout: 420000 })
  .then(() => true)
  .catch(() => false);

console.log(ok ? 'BOOTED OK' : 'BOOT FAILED');

const diag = await page.evaluate(() => ({
  hasSLAY: typeof window.SLAY,
  keys: window.SLAY ? Object.keys(window.SLAY) : null,
  sceneId: window.SLAY?.engine?.currentSceneId ?? null,
  bootStatus: document.getElementById('boot-status')?.textContent ?? '(boot removed)',
  canvasPresent: !!document.getElementById('view'),
  webgl2: (() => {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  })(),
}));
console.log('diagnostics:', JSON.stringify(diag, null, 1));

if (errs.length) {
  console.log(`--- ${errs.length} error(s) ---`);
  for (const e of [...new Set(errs)].slice(0, 12)) console.log('  ' + e);
} else {
  console.log('no console errors');
}

await page.screenshot({ path: 'shots/single-verify.png' });
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
