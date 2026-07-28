/** Loot visibility, buff strip, and equipment attachment in one pass. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT=4207;
const server=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
process.on('exit',()=>server.kill('SIGTERM'));
for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(500);}
const browser=await chromium.launch({executablePath:existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1000,height:600}});
const errs=[];
page.on('pageerror',e=>errs.push(String(e).slice(0,300)));
page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,300));});
await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
await page.waitForFunction(()=>window.SLAY?.debug,null,{timeout:420000,polling:500});
await page.evaluate(async()=>{localStorage.clear();window.SLAY.save.hardReset();window.SLAY.debug.makeCharacter('warden',15);await window.SLAY.engine.goTo('dungeon',{depth:3});});
await page.waitForFunction(()=>window.SLAY.engine.currentSceneId==='dungeon',null,{timeout:180000,polling:500});
const frames=n=>page.evaluate(k=>new Promise(r=>{let i=0;const s=()=>(++i>=k?r():requestAnimationFrame(s));requestAnimationFrame(s);}),n);

// Kill an enemy outright and see what lands on the floor.
const loot = await page.evaluate(()=>{
  const s=window.SLAY.engine.currentScene;
  const e=s.enemies.find(x=>x.life>0);
  const before=s.loot.length;
  const goldBefore=window.SLAY.save.account.current.gold;
  try { e.life=0; e.readyToRemove=true; } catch(err){ return {err:String(err)} }
  return {before, goldBefore, enemyId:e.id};
});
await frames(20);
const after = await page.evaluate((info)=>{
  const s=window.SLAY.engine.currentScene;
  const items=s.loot.map(l=>({
    name:l.item?.name, rarity:l.item?.rarity,
    pos:[+l.root.position.x.toFixed(1),+l.root.position.y.toFixed(2),+l.root.position.z.toFixed(1)],
    inScene: !!l.root.parent,
    visible: l.root.visible,
    meshes: (()=>{let n=0;l.root.traverse(o=>{if(o.isMesh)n++;});return n;})(),
  }));
  return {
    lootCount:s.loot.length, items:items.slice(0,4),
    goldNow: window.SLAY.save.account.current.gold, goldBefore: info.goldBefore,
    playerPos:[+s.player.position.x.toFixed(1),+s.player.position.z.toFixed(1)],
  };
}, loot);
console.log('LOOT:', JSON.stringify(after,null,1));

// Buff strip
const buff = await page.evaluate(()=>{
  const s=window.SLAY.engine.currentScene;
  const c=window.SLAY.save.account.current;
  const ctx=s.context();
  let cast=null;
  for(const [id,r] of Object.entries(c.skills)){
    if(r<=0) continue;
    s.player['actionLock']=0; s.player.cooldowns.clear(); s.player.mana=s.player.stats.mana;
    if(s.skills.cast(id,s.player,s.player.position.clone(),ctx,s.enemies,s.boss) && s.player.statuses.length){cast=id;break;}
  }
  const strip=document.querySelector('.hud-buffs');
  return {
    cast, statuses:s.player.statuses,
    stripExists: !!strip,
    stripChildren: strip?strip.children.length:-1,
    stripHTML: strip?strip.innerHTML.slice(0,200):'',
    stripBox: strip?(()=>{const r=strip.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})():null,
  };
});
console.log('BUFF:', JSON.stringify(buff,null,1));

// Equipment attachment
const eq = await page.evaluate(()=>{
  const s=window.SLAY.engine.currentScene;
  const c=window.SLAY.save.account.current;
  const equipped=Object.entries(c.equipment).map(([slot,it])=>[slot,it?.baseId]);
  let attached=0;
  s.player.root.traverse(o=>{if(o.userData&&o.userData.shape)attached++;});
  return {equipped, attachedItemModels:attached};
});
console.log('EQUIP:', JSON.stringify(eq,null,1));
if(errs.length){console.log('ERRORS:'); [...new Set(errs)].slice(0,8).forEach(e=>console.log('  '+e));}
await browser.close(); server.kill('SIGTERM'); process.exit(0);
