/** Switching graphics presets must not black-screen. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT=4205;
const server=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
process.on('exit',()=>server.kill('SIGTERM'));
for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(500);}
const browser=await chromium.launch({executablePath:existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:900,height:520}});
page.on('pageerror',e=>console.log('PAGEERROR',String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
await page.waitForFunction(()=>window.SLAY?.debug,null,{timeout:420000,polling:500});
await page.evaluate(async()=>{localStorage.clear();window.SLAY.save.hardReset();window.SLAY.debug.makeCharacter('warden',5);await window.SLAY.engine.goTo('dungeon',{depth:1});});
await page.waitForFunction(()=>window.SLAY.engine.currentSceneId==='dungeon',null,{timeout:180000,polling:500});
const frames=n=>page.evaluate(k=>new Promise(r=>{let i=0;const s=()=>(++i>=k?r():requestAnimationFrame(s));requestAnimationFrame(s);}),n);
const sample=async(label)=>{
  await frames(40);
  const st=await page.evaluate(()=>{
    const c=document.getElementById('view');
    const g=document.createElement('canvas');g.width=48;g.height=27;
    const x=g.getContext('2d');x.drawImage(c,0,0,48,27);
    const d=x.getImageData(0,0,48,27).data;
    let min=255,max=0,sum=0;
    for(let i=0;i<d.length;i+=4){const l=(d[i]+d[i+1]+d[i+2])/3;min=Math.min(min,l);max=Math.max(max,l);sum+=l;}
    return {mean:+(sum/(d.length/4)).toFixed(1), range:+(max-min).toFixed(1)};
  });
  console.log(label.padEnd(10), JSON.stringify(st), st.range<4?'  <-- BLACK':'');
};
await sample('baseline');
for (const q of ['low','medium','ultra','high','low']) {
  await page.evaluate(v=>window.SLAY.engine.renderer.setQuality(v), q);
  await sample(q);
}
await browser.close(); server.kill('SIGTERM'); process.exit(0);
