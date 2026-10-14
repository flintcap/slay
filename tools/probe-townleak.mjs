/**
 * What makes the town slower after each trip to a map? Profiles the town's
 * frames before any trip and after several, and lists the functions whose
 * time grew, and the event-bus subscriptions that piled up.
 *
 *   SLAY_PORT=4347 timeout 2400 node tools/probe-townleak.mjs --trips=3
 *
 * Runs on the dev server, so the profile carries real function names.
 */
import { bootGame } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const TRIPS = Number(arg('trips', 3));

const { page, close, pageErrors } = await bootGame({ fallbackPort: 4347, viewport: { width: 480, height: 270 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

const walk = (seconds) =>
  page.evaluate(async (seconds) => {
    const sc = window.SLAY.engine.currentScene;
    const t0 = performance.now();
    let k = 0;
    while (performance.now() - t0 < seconds * 1000) {
      const a = (k++ % 8) * (Math.PI / 4);
      sc.player.moveTo(Math.cos(a) * 9, Math.sin(a) * 9 + 2);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, seconds);

const handlers = () =>
  page.evaluate(() => {
    const out = {};
    for (const [k, v] of window.SLAY.events.handlers ?? []) out[k] = v.size;
    return out;
  });

const updMs = () =>
  page.evaluate(async () => {
    const p = window.SLAY.engine.perf;
    const i0 = p.i;
    await new Promise((r) => setTimeout(r, 5000));
    const n = (p.i - i0 + p.upd.length) % p.upd.length;
    let s = 0;
    for (let k = 0; k < n; k++) s += p.upd[(i0 + k) % p.upd.length];
    return { frames: n, updMs: +(s / Math.max(1, n)).toFixed(2) };
  });

async function profile(seconds) {
  await cdp.send('Profiler.start');
  await walk(seconds);
  const { profile } = await cdp.send('Profiler.stop');
  const dt = new Map();
  const ids = new Map(profile.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < profile.samples.length; i++) {
    const n = ids.get(profile.samples[i]);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/src\//, '').replace(/\?.*$/, '')}:${f.lineNumber + 1}`;
    dt.set(key, (dt.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  return dt;
}

await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 12, 4242);
  await window.SLAY.engine.goTo('town');
});
await page.waitForTimeout(4000);
await walk(6);
const h0 = await handlers();
const u0 = await updMs();
const p0 = await profile(10);
console.log(`before: ${JSON.stringify(u0)}`);

for (let t = 1; t <= TRIPS; t++) {
  await page.evaluate(async (t) => {
    await window.SLAY.engine.goTo('dungeon', { depth: 2, seed: 900 + t });
  }, t);
  await page.waitForTimeout(3000);
  await page.evaluate(async () => {
    await window.SLAY.engine.goTo('town');
  });
  await page.waitForTimeout(4000);
  console.log(`after trip ${t}: ${JSON.stringify(await updMs())}`);
}
await walk(6);
const h1 = await handlers();
const u1 = await updMs();
const p1 = await profile(10);
console.log(`after: ${JSON.stringify(u1)}`);

const grew = Object.keys(h1).filter((k) => (h1[k] ?? 0) > (h0[k] ?? 0)).map((k) => `${k} ${h0[k] ?? 0} -> ${h1[k]}`);
console.log(`event subscriptions that grew: ${grew.length ? grew.join(', ') : 'none'}`);
const rows = [...new Set([...p0.keys(), ...p1.keys()])]
  .map((k) => [k, p0.get(k) ?? 0, p1.get(k) ?? 0])
  .filter((r) => !/^\((idle|program|garbage collector)\)/.test(r[0]))
  .sort((a, b) => b[2] - b[1] - (a[2] - a[1]))
  .slice(0, 25);
console.log('self ms over 10 s, before -> after (largest growth first):');
for (const [k, a, b] of rows) console.log(`  ${a.toFixed(0).padStart(6)} -> ${b.toFixed(0).padStart(6)}  ${k}`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
await close();
