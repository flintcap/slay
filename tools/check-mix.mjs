/**
 * Is the sound mix balanced? Measured, not listened to.
 *
 *   node tools/bundle-artifact.mjs
 *   SLAY_PORT=4333 timeout 2400 node tools/check-mix.mjs
 *   SLAY_PORT=4333 timeout 2400 node tools/check-mix.mjs --ids=0     # scenes only
 *
 * Boots the published bundle in Chromium with real-time audio running, and
 * taps the game's own mix graph (`audio/SampleEngine.ts`): each bus (effects,
 * interface, ambience, music), the master before the limiter, and the output
 * after it. Every tap is read about 25 times a second for peak and RMS.
 *
 * Two kinds of measurement:
 *
 *  - Scenes, as played: the title (menu music), the town standing still
 *    (music, ambience bed and its events), and a fight on the first map with
 *    the soak autopilot attacking and using skills.
 *  - Each sound id on its own, fired at the hero at full volume in the quiet
 *    town, so ids can be compared within their group (hits, skills, monsters,
 *    interface...) and against the beds under them.
 *
 * Levels are dBFS with the settings at their defaults (master 0.8, effects
 * 0.85, music 0.55). "loud" is the 95th percentile of the short windows, a
 * stand-in for how loud something sounds; peak is the single highest sample.
 *
 * FAIL when the output clips (a peak at 0 dBFS after the limiter), when the
 * limiter pulls more than 6 dB in a common scene, or when one id sits more
 * than 9 dB above the loudest-but-one of its group (it would drown the rest).
 * Ids far below their group are listed as quiet, not failed.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { serveSingle, CHROME_ARGS, CHROME_PATH } from './lib/single.mjs';

const arg = (name, d) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const PORT = Number(process.env.SLAY_PORT ?? 4333);
// How many ids to fire one at a time (0 skips; default all).
const ID_LIMIT = Number(arg('ids', 9999));
const ONLY = arg('only', '');

const manifest = readFileSync('src/audio/manifest.ts', 'utf8');
const counts = JSON.parse(/export const SAMPLE_COUNTS[^=]*= (\{[\s\S]*?\n\});/.exec(manifest)[1]);
const GROUPS = [
  ['interface', /^(ui\.|craft\.|skillpoint|quest\.)/],
  ['steps', /^footstep\./],
  ['ambience events', /^amb\./],
  ['monsters', /^monster\./],
  ['hits', /^(hit\.|crit|block|parry|kill\.|death\.|arrow\.)/],
  ['swings', /^(swing\.|shoot\.)/],
  ['skills', /^(spell\.|cast\.|skill\.|aura\.|nova|summon|buff|shout|curse|status\.)/],
  ['hero', /^(player\.|heartbeat|jump|land|levelup|potion)/],
  ['world', /./],
];
const groupOf = (id) => GROUPS.find(([, re]) => re.test(id))[0];
const ids = Object.keys(counts)
  .filter((id) => counts[id] > 0 && (!ONLY || id.startsWith(ONLY)))
  .slice(0, ID_LIMIT);

const server = await serveSingle(PORT);
const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  args: [...CHROME_ARGS, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

// Before any game code: remember the graph's edges and the limiter, so the
// buses can be found and tapped once the engine has built them.
await page.addInitScript(() => {
  const mix = (window.__mix = { edges: [], limiters: [], taps: null, label: '-', stats: {} });
  const connect = AudioNode.prototype.connect;
  mix.connect = connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    mix.edges.push([this, dst]);
    return connect.call(this, dst, ...rest);
  };
  const comp = BaseAudioContext.prototype.createDynamicsCompressor;
  BaseAudioContext.prototype.createDynamicsCompressor = function () {
    const c = comp.call(this);
    mix.limiters.push([this, c]);
    return c;
  };
});

try {
  await page.goto(server.url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.SLAY?.engine?.currentSceneId === 'title', null, { timeout: 900000, polling: 250 });

  // Start audio the way a player does (any gesture), then tap the graph.
  const tapped = await page.evaluate(async () => {
    const mix = window.__mix;
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise((r) => setTimeout(r, 1500));
    const [ctx, limiter] = mix.limiters[0] ?? [];
    if (!ctx) return 'no limiter found';
    const master = mix.edges.find(([, d]) => d === limiter)?.[0];
    const buses = mix.edges.filter(([s, d]) => d === master && s instanceof GainNode).map(([s]) => s);
    if (!master || buses.length < 4) return `graph not as expected (${buses.length} buses)`;
    const nodes = { sfx: buses[0], ui: buses[1], amb: buses[2], music: buses[3], master, out: limiter };
    const taps = {};
    for (const [name, node] of Object.entries(nodes)) {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      mix.connect.call(node, a);
      taps[name] = { a, buf: new Float32Array(2048) };
    }
    mix.taps = taps;
    // Read every tap ~25 times a second into the current label's tally.
    setInterval(() => {
      const st = (mix.stats[mix.label] ??= {});
      for (const [name, t] of Object.entries(taps)) {
        t.a.getFloatTimeDomainData(t.buf);
        let peak = 0;
        let sq = 0;
        for (const v of t.buf) {
          const x = Math.abs(v);
          if (x > peak) peak = x;
          sq += v * v;
        }
        const s = (st[name] ??= { peak: 0, sq: 0, n: 0, rms: [] });
        s.peak = Math.max(s.peak, peak);
        s.sq += sq;
        s.n += t.buf.length;
        s.rms.push(Math.sqrt(sq / t.buf.length));
      }
      const red = (st.limiter ??= { max: 0 });
      red.max = Math.min(red.max, limiter.reduction);
    }, 40);
    mix.state = ctx.state;
    return 'ok';
  });
  if (tapped !== 'ok') throw new Error(`could not tap the mix: ${tapped}`);
  console.log(`audio context: ${await page.evaluate(() => window.__mix.state)}`);

  const label = (l) => page.evaluate((l) => (window.__mix.label = l), l);
  const wait = (ms) => page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // --- scenes -----------------------------------------------------------------
  await label('title');
  await wait(8000);
  await label('-');
  await page.evaluate(async () => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 20, 777);
    await window.SLAY.engine.goTo('town');
  });
  await wait(4000);
  await label('town');
  await wait(12000);

  // --- one id at a time, in the quiet town --------------------------------------
  await label('-');
  // Samples load lazily; ask for every id once (unmeasured) so each is
  // decoded before its turn.
  if (ids.length) {
    await page.evaluate(async (ids) => {
      for (const id of ids) {
        window.SLAY.events.emit('sfx', { id, volume: 0.06 });
        await new Promise((r) => setTimeout(r, 15));
      }
    }, ids);
    await wait(8000);
  }
  for (const id of ids) {
    await label(`id:${id}`);
    await page.evaluate((id) => window.SLAY.events.emit('sfx', { id }), id);
    await wait(900);
  }

  // --- a fight --------------------------------------------------------------------
  await label('-');
  await page.evaluate(async () => {
    await window.SLAY.engine.goTo('dungeon', { depth: 1, seed: 9191 });
    window.SLAY.debug.godMode(true);
  });
  await wait(3000);
  await label('fight');
  await page.evaluate(async () => {
    const e = window.SLAY.engine;
    const scene = e.currentScene;
    const input = e.input;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const v = new scene.player.position.constructor();
    const until = performance.now() + 25000;
    for (let i = 0; performance.now() < until; i++) {
      if (e.currentScene !== scene) break;
      const p = scene.player.position;
      let best = null;
      let bestD = Infinity;
      for (const m of scene.enemies ?? []) {
        if (m.dead || m.alive === false) continue;
        const d = (m.root.position.x - p.x) ** 2 + (m.root.position.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      if (best && bestD > 30 * 30) {
        scene.player.position.set(best.root.position.x + 4, p.y, best.root.position.z);
        scene.player.root.position.copy(scene.player.position);
      }
      if (best) {
        v.copy(best.root.position).project(scene.camera);
        input.ndc.set(Math.max(-1, Math.min(1, v.x)), Math.max(-1, Math.min(1, v.y)));
      }
      input.pointerOverUI = false;
      input.mouseRight = i % 40 < 34;
      if (!input.mouseRight) input.mouseRightPressed = false;
      if (i % 25 === 0) {
        const code = `Digit${1 + ((i / 25) % 6)}`;
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(5) }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.slice(5) }));
      }
      await raf();
    }
    input.mouseRight = false;
  });
  await label('-');

  const stats = await page.evaluate(() => {
    const out = {};
    for (const [l, st] of Object.entries(window.__mix.stats)) {
      out[l] = {};
      for (const [name, s] of Object.entries(st)) {
        if (name === 'limiter') {
          out[l].limiter = s.max;
          continue;
        }
        const r = s.rms.slice().sort((a, b) => a - b);
        out[l][name] = { peak: s.peak, rms: Math.sqrt(s.sq / Math.max(1, s.n)), loud: r[Math.floor(r.length * 0.95)] ?? 0 };
      }
    }
    return out;
  });

  const db = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
  const f = (x) => db(x).toFixed(1).padStart(6);
  const fails = [];

  console.log('\nscenes (dBFS: rms / loud / peak):');
  for (const l of ['title', 'town', 'fight']) {
    const st = stats[l];
    if (!st) continue;
    console.log(`  ${l}   limiter pulled at most ${(-(st.limiter ?? 0)).toFixed(1)} dB`);
    for (const k of ['music', 'amb', 'sfx', 'ui', 'master', 'out']) {
      const s = st[k];
      if (s) console.log(`    ${k.padEnd(7)} ${f(s.rms)} ${f(s.loud)} ${f(s.peak)}`);
    }
    if (st.out && st.out.peak >= 0.999) fails.push(`${l}: the output clips (peak ${f(st.out.peak)} dBFS)`);
    if ((st.limiter ?? 0) < -6) fails.push(`${l}: the limiter pulls ${(-st.limiter).toFixed(1)} dB`);
  }

  // Each id on its own: the bus it played on, measured over its window.
  const rows = [];
  for (const id of ids) {
    const st = stats[`id:${id}`];
    if (!st) continue;
    const bus = ['sfx', 'ui', 'amb'].reduce((a, b) => ((st[b]?.loud ?? 0) > (st[a]?.loud ?? 0) ? b : a), 'sfx');
    rows.push({ id, group: groupOf(id), bus, loud: st[bus].loud, peak: st[bus].peak, outPeak: st.out?.peak ?? 0, limiter: st.limiter ?? 0 });
  }
  if (rows.length) {
    console.log('\nsound ids alone, by group (dBFS on their bus: median loud, loudest ids, quietest ids):');
    const silent = rows.filter((r) => r.loud < 1e-4).map((r) => r.id);
    for (const [g] of GROUPS) {
      const rs = rows.filter((r) => r.group === g && r.loud >= 1e-4).sort((a, b) => b.loud - a.loud);
      if (!rs.length) continue;
      const med = rs[Math.floor(rs.length / 2)].loud;
      console.log(`  ${g.padEnd(16)} ${String(rs.length).padStart(3)} ids, median ${f(med)}`);
      console.log(`      loudest: ${rs.slice(0, 4).map((r) => `${r.id} ${db(r.loud).toFixed(1)} (peak ${db(r.peak).toFixed(1)})`).join(', ')}`);
      console.log(`      quietest: ${rs.slice(-3).map((r) => `${r.id} ${db(r.loud).toFixed(1)}`).join(', ')}`);
      if (rs.length > 2 && db(rs[0].loud) - db(rs[1].loud) > 9) fails.push(`${rs[0].id} is ${(db(rs[0].loud) - db(rs[1].loud)).toFixed(1)} dB over the next loudest ${g} sound`);
      for (const r of rs) if (db(r.loud) < db(med) - 15) console.log(`      quiet: ${r.id} is ${(db(med) - db(r.loud)).toFixed(1)} dB under its group`);
    }
    for (const r of rows) if (r.outPeak >= 0.999) fails.push(`${r.id} alone clips the output`);
    if (silent.length) console.log(`  silent when fired alone (late load or gated): ${silent.slice(0, 20).join(', ')}${silent.length > 20 ? ' ...' : ''}`);
  }
  console.log(JSON.stringify({ scenes: Object.fromEntries(['title', 'town', 'fight'].filter((l) => stats[l]).map((l) => [l, Object.fromEntries(Object.entries(stats[l]).map(([k, s]) => [k, typeof s === 'number' ? +s.toFixed(1) : { rms: +db(s.rms).toFixed(1), loud: +db(s.loud).toFixed(1), peak: +db(s.peak).toFixed(1) }]))])), rows: rows.map((r) => [r.id, +db(r.loud).toFixed(1), +db(r.peak).toFixed(1)]) }));
  if (errors.length) console.log(`page errors:\n  ${errors.slice(0, 5).join('\n  ')}`);
  console.log(fails.length ? `\nFAIL\n  ${fails.join('\n  ')}` : '\nOK — nothing clips, the limiter stays light, no sound drowns its group.');
  process.exitCode = fails.length ? 1 : 0;
} finally {
  await browser.close().catch(() => {});
  await server.close();
}
