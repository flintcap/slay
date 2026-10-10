/**
 * Does every recorded file decode in a real browser?
 *
 *   npm run build && SLAY_PORT=4323 node tools/audio/decode-check.mjs
 *
 * Serves dist/ with vite preview, opens one of the sound files in headless
 * Chromium (so the page has the game's origin without booting the game), then
 * fetches and decodes every file named in src/audio/manifest.ts. Reports any
 * that fail, the total decoded length, and the decoded memory the effects
 * take once all are loaded. Stops the server on the way out.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SLAY_PORT ?? 4323);
const src = readFileSync('src/audio/manifest.ts', 'utf8');
const grab = (name) => {
  const m = new RegExp(`export const ${name}[^=]*= (\\{[\\s\\S]*?\\n\\});`).exec(src);
  return m ? JSON.parse(m[1]) : {};
};
const counts = grab('SAMPLE_COUNTS');
const files = [
  ...Object.entries(counts).flatMap(([id, n]) => Array.from({ length: n }, (_, i) => `sounds/${id}/${String(i + 1).padStart(2, '0')}.ogg`)),
  ...Object.values(grab('AMBIENCE_FILES')).flat(),
  ...Object.values(grab('MUSIC_FILES')).flat(),
];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);

let ok = false;
for (let i = 0; i < 60 && !ok; i++) {
  await sleep(500);
  ok = await fetch(`http://127.0.0.1:${PORT}/assets/${files[0]}`).then((r) => r.ok, () => false);
}
if (!ok) {
  console.log('decode-check: FAIL (server did not come up)');
  process.exit(1);
}

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/assets/${files[0]}`);
const res = await page.evaluate(async (list) => {
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const bad = [];
  let seconds = 0;
  let sfxBytes = 0;
  for (const f of list) {
    try {
      const r = await fetch(`/assets/${f}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      seconds += buf.duration;
      if (f.startsWith('sounds/') && !f.startsWith('sounds/beds/')) sfxBytes += buf.length * buf.numberOfChannels * 4;
    } catch (e) {
      bad.push(`${f}: ${e}`);
    }
  }
  return { bad, seconds, sfxBytes };
}, files);
await browser.close();
stop();

console.log(`decode-check: ${files.length} files, ${(res.seconds / 60).toFixed(1)} min decoded, effects ${(res.sfxBytes / 1048576).toFixed(0)} MB decoded in memory`);
for (const b of res.bad.slice(0, 20)) console.log(`  FAIL ${b}`);
console.log(res.bad.length ? `decode-check: FAIL (${res.bad.length})` : 'decode-check: PASS');
process.exit(res.bad.length ? 1 : 0);
