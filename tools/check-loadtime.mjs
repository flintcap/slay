/**
 * How long does the published game take to load, and where does the time go?
 *
 *   node tools/bundle-artifact.mjs                       # build what is published
 *   SLAY_PORT=4333 timeout 1500 node tools/check-loadtime.mjs
 *   SLAY_PORT=4333 timeout 1500 node tools/check-loadtime.mjs --mbps=40 --warm
 *
 * Serves `dist-single/slay.html` wrapped the way the artifact host wraps it,
 * with every file in `dist-single/files.json` at its published path (the
 * seven `.wasm` packs, `assets/packs.json`, music, the worker), so this times
 * the bundle a player downloads, not the dev server.
 *
 * Reports, from navigation:
 *  - each boot-bar step and when the title scene is live
 *  - first town (a new warden, town entered) and first map (depth 1)
 *  - every request with its start, end and size, so pack downloads show
 *  - main-thread long tasks over 50 ms in each phase, the biggest first
 *
 * --mbps=N throttles the network to N megabits a second (localhost is
 * otherwise instant, which hides the pack downloads). --warm loads the page a
 * second time in the same profile, so IndexedDB bakes from the first visit are
 * there, as for a returning player. Timings on a shared machine are noisy:
 * compare before and after runs taken back to back.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const PORT = Number(process.env.SLAY_PORT ?? 4333);
const MBPS = Number(arg('mbps') ?? 0);
const WARM = process.argv.includes('--warm');
const MAP = !process.argv.includes('--no-map');
// --profile: a CPU profile of each phase, the heaviest functions listed.
const PROFILE = process.argv.includes('--profile');
// Seconds spent on the select screen before starting, as a player would.
const DWELL = Number(arg('dwell') ?? 5);

const body = readFileSync('dist-single/slay.html', 'utf8');
const pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
const files = JSON.parse(readFileSync('dist-single/files.json', 'utf8'));
const TYPES = { '.wasm': 'application/wasm', '.json': 'application/json', '.ogg': 'audio/ogg', '.js': 'text/javascript', '.webp': 'image/webp' };

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
  if (url === '' || url === 'index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageHtml);
    return;
  }
  const src = files[url];
  if (!src || !existsSync(src)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(url)] ?? 'application/octet-stream' });
  res.end(readFileSync(src));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const profile = mkdtempSync(path.join(tmpdir(), 'slay-loadtime-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  viewport: { width: 1280, height: 720 },
});

// Installed before any page script: boot-bar steps and long tasks, stamped
// with performance.now() (ms since navigation).
await context.addInitScript(() => {
  const w = window;
  w.__lt = { steps: [], long: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lt.long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const watch = () => {
    const el = document.getElementById('boot-status');
    if (!el) return false;
    const note = () => w.__lt.steps.push([Math.round(performance.now()), el.textContent]);
    note();
    new MutationObserver(note).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!watch()) document.addEventListener('DOMContentLoaded', watch, { once: true });
});

async function visit(label) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (MBPS > 0) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: (MBPS * 1e6) / 8,
      uploadThroughput: (MBPS * 1e6) / 8,
    });
  }
  // Requests, timed against navigation start in the page's own clock.
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp, bytes: 0 }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) {
      r.t1 = e.timestamp;
      r.bytes = e.encodedDataLength;
    }
  });
  let navTs = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (navTs === null && e.type === 'Document') navTs = e.timestamp;
  });

  if (PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
  }
  const profiles = [];
  const cut = async (name) => {
    if (!PROFILE) return;
    const { profile } = await cdp.send('Profiler.stop');
    profiles.push([name, profile]);
    await cdp.send('Profiler.start');
  };
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.SLAY?.engine?.currentSceneId === 'title', null, { timeout: 900000, polling: 100 });
  const titleAt = await page.evaluate(() => Math.round(performance.now()));
  await cut('boot');
  // Let the boot screen fade and the title settle, as a player would see it.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  await cut('title, 1.5 s');

  const phase = async (name, fn, a) => {
    const t0 = await page.evaluate(() => performance.now());
    await page.evaluate(fn, a);
    const t1 = await page.evaluate(() => performance.now());
    await cut(name);
    return { name, t0: Math.round(t0), ms: Math.round(t1 - t0) };
  };
  const phases = [];
  // The way a new player goes: a moment on the title, the select screen,
  // then town with a fresh warden.
  phases.push(
    await phase('select screen', async () => {
      localStorage.clear();
      window.SLAY.save.hardReset();
      await window.SLAY.engine.goTo('charSelect');
      for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    }),
  );
  phases.push(await phase(`select, ${DWELL} s dwell`, (s) => new Promise((r) => setTimeout(r, s * 1000)), DWELL));
  phases.push(
    await phase('first town', async () => {
      window.SLAY.debug.makeCharacter('warden', 1, 4242);
      await window.SLAY.engine.goTo('town');
      for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    }),
  );
  if (MAP) {
    phases.push(
      await phase('first map', async () => {
        await window.SLAY.engine.goTo('dungeon', { depth: 1, seed: 4243 });
        for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
      }),
    );
    // A few seconds of play in the map: what stalls once the fade is up.
    phases.push(
      await phase('map, 5 s idle', async () => {
        await new Promise((r) => setTimeout(r, 5000));
      }),
    );
  }
  const lt = await page.evaluate(() => window.__lt);
  if (PROFILE) await cdp.send('Profiler.stop').catch(() => {});
  await page.close();

  console.log(`\n=== ${label} visit${MBPS ? ` (${MBPS} Mbit/s)` : ' (unthrottled)'} ===`);
  console.log('boot steps (ms from navigation):');
  for (const [t, s] of lt.steps) console.log(`  ${String(t).padStart(7)}  ${s}`);
  console.log(`  ${String(titleAt).padStart(7)}  title scene live`);
  for (const p of phases) console.log(`  ${String(p.t0).padStart(7)}  ${p.name}: ${p.ms} ms`);

  const rows = [...reqs.values()].filter((r) => r.t1 && navTs !== null);
  const big = rows.filter((r) => r.bytes > 100_000).sort((a, b) => a.t0 - b.t0);
  console.log('requests over 100 KB (start..end ms, KB):');
  for (const r of big) {
    const name = r.url.replace(`http://127.0.0.1:${PORT}/`, '') || '(page)';
    console.log(`  ${String(Math.round((r.t0 - navTs) * 1000)).padStart(7)}..${String(Math.round((r.t1 - navTs) * 1000)).padEnd(7)} ${String(Math.round(r.bytes / 1024)).padStart(6)}  ${name}`);
  }
  const totalKB = Math.round(rows.reduce((a, r) => a + r.bytes, 0) / 1024);
  console.log(`  ${rows.length} requests, ${totalKB} KB in all`);

  const bounds = [
    ['boot', 0, titleAt],
    ...phases.map((p) => [p.name, p.t0, p.t0 + p.ms]),
  ];
  console.log('long tasks over 50 ms, by phase (count, total ms, biggest):');
  for (const [name, a, b] of bounds) {
    const ls = lt.long.filter(([t]) => t >= a && t < b);
    const sum = ls.reduce((s, [, d]) => s + d, 0);
    const top = ls.map(([, d]) => d).sort((x, y) => y - x).slice(0, 6);
    console.log(`  ${name.padEnd(16)} ${String(ls.length).padStart(4)}  ${String(sum).padStart(7)}  ${top.join(', ')}`);
  }
  for (const [name, prof] of profiles) printProfile(name, prof);
  if (errors.length) console.log(`errors:\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}`);
  const out = { label, mbps: MBPS, titleMs: titleAt, phases: phases.map((p) => [p.name, p.ms]), totalKB, errors: errors.length };
  console.log(JSON.stringify(out));
  return out;
}

/** Self time and inclusive time per function, the heaviest first. */
function printProfile(name, prof) {
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = new Map();
  for (let i = 0; i < prof.samples.length; i++) dt.set(prof.samples[i], (dt.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0) / 1000);
  const self = new Map();
  const total = new Map();
  const label = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const walk = (n, stack) => {
    const k = label(n);
    const ms = dt.get(n.id) ?? 0;
    self.set(k, (self.get(k) ?? 0) + ms);
    const seen = new Set(stack);
    let sum = ms;
    for (const c of n.children ?? []) sum += walk(byId.get(c), seen.has(k) ? stack : [...stack, k]);
    if (!seen.has(k)) total.set(k, (total.get(k) ?? 0) + sum);
    return sum;
  };
  walk(byId.get(prof.nodes[0].id), []);
  // Native calls (WebGL, canvas encode) are where the main thread waits on
  // the GPU process; under software rendering that wait is mostly the GPU's
  // own work and says little about a real machine. JS is what transfers.
  let js = 0;
  let native = 0;
  let idle = 0;
  let gc = 0;
  for (const [k, v] of self) {
    if (k.startsWith('(idle)')) idle += v;
    else if (k.startsWith('(garbage')) gc += v;
    else if (k.startsWith('(program)') || k.startsWith('(root)')) continue;
    else if (/ :0$/.test(k)) native += v;
    else js += v;
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(`profile: ${name}   JS ${Math.round(js)} ms, native/GPU wait ${Math.round(native)} ms, GC ${Math.round(gc)} ms, idle ${Math.round(idle)} ms`);
  console.log('  self ms:');
  for (const [k, v] of top(self, 14)) console.log(`    ${String(Math.round(v)).padStart(7)}  ${k}`);
  console.log('  inclusive ms:');
  for (const [k, v] of top(total, 30)) if (!/^\(root\)|^\(program\)|^\(anon\) :0/.test(k)) console.log(`    ${String(Math.round(v)).padStart(7)}  ${k}`);
}

try {
  await visit('cold');
  if (WARM) await visit('warm');
} finally {
  await context.close().catch(() => {});
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
