import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT=4203;
const server=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
process.on('exit',()=>server.kill('SIGTERM'));
for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(500);}
const browser=await chromium.launch({executablePath:existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>console.log('PAGEERROR',String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
await page.waitForFunction(()=>window.SLAY?.debug,null,{timeout:420000,polling:500});
await page.evaluate(async()=>{localStorage.clear();window.SLAY.save.hardReset();window.SLAY.debug.makeCharacter('warden',20);await window.SLAY.engine.goTo('dungeon',{depth:2});});
await page.waitForFunction(()=>window.SLAY.engine.currentSceneId==='dungeon',null,{timeout:180000,polling:500});
const out = await page.evaluate(()=>{
  const s=window.SLAY.engine.currentScene, c=window.SLAY.save.account.current;
  // Find a learned buff-family skill.
  const SK = window.SLAY.SKILLS;
  const ids = Object.entries(c.skills).filter(([,r])=>r>0).map(([id])=>id);
  const before = s.player.statuses.map(x=>x.id);
  const ctx = s.context();
  let cast = null;
  for (const id of ids) {
    const ok = s.skills.cast(id, s.player, s.player.position.clone(), ctx, s.enemies, s.boss);
    if (ok && s.player.statuses.length > before.length) { cast = id; break; }
    s.player.cooldowns.clear(); s.player.mana = s.player.stats.mana;
    // clear the action lock so the next candidate can fire this frame
    s.player.beginAction && (s.player['actionLock'] = 0);
  }
  return { learned: ids, castThatBuffed: cast, statuses: s.player.statuses };
});
console.log(JSON.stringify(out,null,1));
await browser.close(); server.kill('SIGTERM'); process.exit(0);
