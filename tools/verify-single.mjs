import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0,300)));
page.on('console', (m) => { if (m.type()==='error') errs.push(m.text().slice(0,300)); });
// Wrap exactly as the artifact host does.
const body = readFileSync('dist-single/slay.html','utf8');
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`, { waitUntil: 'load' });
const ok = await page.waitForFunction(() => window.SLAY?.debug && window.SLAY?.engine?.currentSceneId, { timeout: 300000 }).then(()=>true).catch(()=>false);
console.log(ok ? 'BOOTED OK' : 'BOOT FAILED');
if (!ok) console.log('status:', await page.textContent('#boot-status').catch(()=>null));
else console.log('scene:', await page.evaluate(()=>window.SLAY.engine.currentSceneId));
if (errs.length) { console.log('--- errors ---'); [...new Set(errs)].slice(0,10).forEach(e=>console.log(' ', e)); }
await page.screenshot({ path: 'shots/single-verify.png' });
await browser.close();
process.exit(ok?0:1);
