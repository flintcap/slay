/** Verifies left click actually damages an enemy. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4199;
const server = spawn('npx', ['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { stdio:['ignore','ignore','pipe'] });
process.on('exit', () => server.kill('SIGTERM'));
for (let i=0;i<60;i++){ try{ if((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; }catch{} await sleep(500); }

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const page = await browser.newPage({ viewport:{width:1280,height:720} });
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout:420000, polling:500 });

// Fresh character, straight into a dungeon.
await page.evaluate(async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 1);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
});
await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon', null, { timeout:180000, polling:500 });

const before = await page.evaluate(() => {
  const s = window.SLAY.engine.currentScene;
  const c = window.SLAY.save.account.current;
  // Teleport an enemy right next to the player so the swing must connect.
  const e = s.enemies.find(e => e.life > 0);
  if (e) { e.root.position.set(s.player.position.x + 1.4, 0, s.player.position.z); }
  return {
    hotbar: c.hotbar,
    skills: Object.entries(c.skills).filter(([,r])=>r>0).map(([id,r])=>`${id}:${r}`),
    enemyLife: e ? e.life : null,
    enemyId: e ? e.id : null,
    pointerOverUI: window.SLAY.engine.input.pointerOverUI,
  };
});
console.log('before:', JSON.stringify(before));

// Click on the enemy repeatedly.
for (let i=0;i<6;i++){
  await page.mouse.move(700, 330);
  await page.mouse.down();
  await page.evaluate(()=>new Promise(r=>{let i=0;const s=()=>(++i>12?r():requestAnimationFrame(s));requestAnimationFrame(s);}));
  await page.mouse.up();
  await page.evaluate(()=>new Promise(r=>{let i=0;const s=()=>(++i>10?r():requestAnimationFrame(s));requestAnimationFrame(s);}));
}

const after = await page.evaluate((id) => {
  const s = window.SLAY.engine.currentScene;
  const e = s.enemies.find(e => e.id === id);
  return { enemyLife: e ? e.life : 'dead/removed', pointerOverUI: window.SLAY.engine.input.pointerOverUI };
}, before.enemyId);
console.log('after :', JSON.stringify(after));
console.log(before.enemyLife !== null && after.enemyLife !== before.enemyLife ? 'ATTACK WORKS' : 'ATTACK DID NOTHING');

await browser.close(); server.kill('SIGTERM'); process.exit(0);
