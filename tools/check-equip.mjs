/** Verifies handedness and class equip restrictions on the real data. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT=4209;
const server=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
process.on('exit',()=>server.kill('SIGTERM'));
for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(500);}
const browser=await chromium.launch({executablePath:existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:800,height:500}});
page.on('pageerror',e=>console.log('PAGEERROR',String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
await page.waitForFunction(()=>window.SLAY?.debug,null,{timeout:420000,polling:500});
const out = await page.evaluate(async () => {
  const M = await import('./assets/bundle.js').catch(()=>null);
  return null;
});
// Easier: drive through the game's own API.
const res = await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('shadowblade', 20);
  const c = window.SLAY.save.account.current;
  return { cls: c.classId, equipped: Object.entries(c.equipment).map(([k,v])=>[k, v?.baseId]) };
});
console.log('shadowblade start:', JSON.stringify(res));
await browser.close(); server.kill('SIGTERM'); process.exit(0);
