/** Isolates whether left click fails at aiming or at dealing damage. */
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
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0,300)));
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,200)); });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout:420000, polling:500 });

await page.evaluate(async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 1);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
});
await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon', null, { timeout:180000, polling:500 });

const frames = n => page.evaluate(k=>new Promise(r=>{let i=0;const s=()=>(++i>=k?r():requestAnimationFrame(s));requestAnimationFrame(s);}), n);

// --- Test A: call cast() directly, aimed exactly at the enemy -------------
const a = await page.evaluate(() => {
  const s = window.SLAY.engine.currentScene;
  const e = s.enemies.find(x => x.life > 0);
  if (!e) return { err: 'no living enemy' };
  e.root.position.set(s.player.position.x + 1.4, 0, s.player.position.z);
  const before = e.life;
  const ctx = s.context();
  const ok = s.skills.cast('cleave', s.player, e.root.position.clone(), ctx, s.enemies, s.boss);
  return {
    castReturned: ok,
    lifeBefore: before,
    lifeAfter: e.life,
    playerBusy: s.player.isBusy,
    mana: s.player.mana,
    maxMana: s.player.stats.mana,
    minDmg: s.player.stats.minDamage,
    maxDmg: s.player.stats.maxDamage,
    hitRadius: e.hitRadius,
    dist: +e.root.position.distanceTo(s.player.position).toFixed(2),
    enemyDefense: e.defense ?? 'n/a',
  };
});
console.log('A direct cast :', JSON.stringify(a));

await frames(30);

// --- Test B: basic attack directly ---------------------------------------
const b = await page.evaluate(() => {
  const s = window.SLAY.engine.currentScene;
  const e = s.enemies.find(x => x.life > 0);
  if (!e) return { err: 'no living enemy' };
  e.root.position.set(s.player.position.x + 1.4, 0, s.player.position.z);
  const before = e.life;
  const ctx = s.context();
  const ok = s.skills.basicAttack(s.player, e.root.position.clone(), ctx, s.enemies, s.boss);
  return { returned: ok, lifeBefore: before, lifeAfter: e.life };
});
console.log('B basic attack:', JSON.stringify(b));

await frames(30);

// --- Test C: real click, aimed via camera projection ----------------------
const target = await page.evaluate(() => {
  const s = window.SLAY.engine.currentScene;
  const e = s.enemies.find(x => x.life > 0);
  if (!e) return null;
  e.root.position.set(s.player.position.x + 1.4, 0, s.player.position.z);
  const v = e.root.position.clone().project(s.camera);
  return { x: (v.x * 0.5 + 0.5) * 1280, y: (-v.y * 0.5 + 0.5) * 720, life: e.life, id: e.id };
});
console.log('C target screen:', JSON.stringify(target));

if (target) {
  for (let i=0;i<5;i++){
    await page.mouse.move(Math.round(target.x), Math.round(target.y));
    await page.mouse.down();
    await frames(14);
    await page.mouse.up();
    await frames(12);
  }
  const c = await page.evaluate(id => {
    const s = window.SLAY.engine.currentScene;
    const e = s.enemies.find(x => x.id === id);
    return { lifeAfter: e ? e.life : 'removed', worldPoint: [+s.engine?.input?.worldPoint?.x?.toFixed?.(1) ?? 0, 0] };
  }, target.id).catch(()=>({}));
  console.log('C after clicks:', JSON.stringify(c));
}

await browser.close(); server.kill('SIGTERM'); process.exit(0);
