/** Measures where frame time goes while fighting. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4201;
const server = spawn('npx',['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
process.on('exit',()=>server.kill('SIGTERM'));
for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(500);}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const page = await browser.newPage({viewport:{width:1280,height:720}});
page.on('pageerror',e=>console.log('PAGEERROR',String(e).slice(0,200)));
await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
await page.waitForFunction(()=>window.SLAY?.debug,null,{timeout:420000,polling:500});

await page.evaluate(async()=>{
  localStorage.clear(); window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden',20);
  await window.SLAY.engine.goTo('dungeon',{depth:5});
});
await page.waitForFunction(()=>window.SLAY.engine.currentSceneId==='dungeon',null,{timeout:180000,polling:500});
// Immortal, or the full-pack test kills the player and swaps to the death scene.
await page.evaluate(()=>window.SLAY.debug.godMode(true));

const frames = n => page.evaluate(k=>new Promise(r=>{let i=0;const s=()=>(++i>=k?r():requestAnimationFrame(s));requestAnimationFrame(s);}),n);

const stats = async (label) => {
  const r = await page.evaluate(() => {
    const p = window.SLAY.engine.perf;
    const n = p.count;
    const pick = (arr) => {
      const v = Array.from(arr.slice(0, n)).sort((a,b)=>a-b);
      return {
        med: +v[Math.floor(n*0.5)].toFixed(1),
        p95: +v[Math.floor(n*0.95)].toFixed(1),
        max: +v[n-1].toFixed(1),
      };
    };
    return { n, upd: pick(p.upd), ren: pick(p.ren), total: pick(p.total) };
  });
  console.log(label.padEnd(22), JSON.stringify(r));
};

const reset = () => page.evaluate(()=>{ const p=window.SLAY.engine.perf; p.i=0; p.count=0; });

// Idle baseline.
await reset(); await frames(120); await stats('idle');

// Drag a pack next to the player, then attack continuously.
await page.evaluate(()=>{
  const s = window.SLAY.engine.currentScene;
  const live = s.enemies.filter(e=>e.life>0);
  live.forEach((e,i)=>{
    const a = (i/live.length)*Math.PI*2;
    const ring = 2.0 + Math.floor(i/8)*1.5;
    e.root.position.set(s.player.position.x+Math.cos(a)*ring, 0, s.player.position.z+Math.sin(a)*ring);
  });
});
await reset(); await frames(90); await stats('FULL pack nearby');
console.log('enemy count:', await page.evaluate(()=>window.SLAY.engine.currentScene?.enemies?.filter(e=>e.life>0).length ?? 'n/a'));

await page.mouse.move(640,300);
await page.mouse.down({button:'right'});
await reset(); await frames(180); await stats('attacking (rmb held)');
await page.mouse.up({button:'right'});

// Isolate subsystems.
await page.evaluate(()=>{ const s=window.SLAY.engine.currentScene; s._platesOff = s.plates; s.plates = null; });
await page.mouse.down({button:'right'});
await reset(); await frames(150); await stats('attacking, no plates');
await page.mouse.up({button:'right'});

await page.evaluate(()=>{ const s=window.SLAY.engine.currentScene; s.plates = s._platesOff; s._fxUpd = s.fx.update; s.fx.update = ()=>{}; });
await page.mouse.down({button:'right'});
await reset(); await frames(150); await stats('attacking, no particles');
await page.mouse.up({button:'right'});

await page.evaluate(()=>{ const s=window.SLAY.engine.currentScene; s.fx.update = s._fxUpd; s._enem = s.enemies; s.enemies = []; });
await reset(); await frames(150); await stats('no enemies at all');

await browser.close(); server.kill('SIGTERM'); process.exit(0);
