/**
 * Screenshot harness.
 *
 * Boots the built game in headless Chromium with SwiftShader (the container has
 * no GPU), drives it into a requested state, and writes PNGs. This is what the
 * art-critic pass looks at, so it must fail loudly rather than silently emit a
 * black frame.
 *
 *   node tools/screenshot.mjs --out shots --shots title,town,dungeon
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const OUT = path.resolve(args.out ?? 'shots');
const WANT = String(args.shots ?? 'title,charSelect,town,dungeon,inventory,skills,boss').split(',');
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const PORT = Number(args.port ?? 4173);

mkdirSync(OUT, { recursive: true });

if (!existsSync('dist/index.html')) {
  console.error('No dist/ build found. Run `npm run build` first.');
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));

const shutdown = () => {
  try {
    server.kill('SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

// Wait for the preview server to answer.
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.ok) {
      up = true;
      break;
    }
  } catch {
    /* not listening yet */
  }
  await sleep(500);
}
if (!up) {
  console.error('preview server never came up');
  shutdown();
  process.exit(1);
}

// The container ships a pinned Chromium that will not match whatever build our
// @playwright/test version wants. Use the installed one rather than downloading.
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--no-sandbox',
  ],
});

const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });

// Wait for the boot sequence to hand off to the title scene.
try {
  // Boot bakes the texture library, which takes minutes under SwiftShader.
  // Wait on the debug surface — it is the last thing main() installs.
  await page.waitForFunction(() => {
    const s = window.SLAY;
    return !!s && !!s.debug && !!s.engine && s.engine.currentSceneId !== null;
  }, null, { timeout: 300000 });
} catch {
  console.error('game never reached a live scene');
  const status = await page.textContent('#boot-status').catch(() => null);
  if (status) console.error('boot status:', status);
}

/** Software rendering is slow — give each scene real time to settle. */
async function settle(frames = 90) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let i = 0;
        const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    frames
  );
}

async function shoot(name) {
  await settle(60);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  // Judge the written PNG, not the live canvas: without preserveDrawingBuffer
  // the WebGL buffer is already cleared by the time script code can read it,
  // which reports every frame as black.
  const { statSync } = await import('node:fs');
  const kb = Math.round(statSync(file).size / 1024);
  const flat = kb < 25;
  console.log(`${flat ? 'BLANK' : 'ok   '} ${name.padEnd(14)} ${file}  ${kb} KB`);
  return !flat;
}

/** Scene drivers. Each puts the game into a state worth photographing. */
const drivers = {
  title: async () => {
    await page.evaluate(() => window.SLAY.engine.goTo('title'));
  },
  charSelect: async () => {
    await page.evaluate(() => window.SLAY.engine.goTo('charSelect'));
  },
  town: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (!s.save.account.current && s.debug?.makeCharacter) s.debug.makeCharacter('warden');
      await s.engine.goTo('town');
    });
  },
  dungeon: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (!s.save.account.current && s.debug?.makeCharacter) s.debug.makeCharacter('warden');
      await s.engine.goTo('dungeon', { depth: 1 });
    });
  },
  dungeonDeep: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (s.debug?.makeCharacter) s.debug.makeCharacter('pyromancer', 40);
      await s.engine.goTo('dungeon', { depth: 24 });
    });
  },
  boss: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (s.debug?.makeCharacter) s.debug.makeCharacter('stormcaller', 30);
      await s.engine.goTo('dungeon', { depth: 12 });
      s.debug?.warpToBoss?.();
    });
    await settle(120);
  },
  inventory: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (!s.save.account.current && s.debug?.makeCharacter) s.debug.makeCharacter('shadowblade', 24);
      if (s.engine.currentSceneId !== 'town') await s.engine.goTo('town');
      s.debug?.fillInventory?.();
      s.events.emit('ui:open', { panel: 'inventory' });
    });
  },
  skills: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (!s.save.account.current && s.debug?.makeCharacter) s.debug.makeCharacter('pyromancer', 30);
      if (s.engine.currentSceneId !== 'town') await s.engine.goTo('town');
      s.events.emit('ui:open', { panel: 'skills' });
    });
  },
  artItems: async () => {
    await page.evaluate(() => window.SLAY.debug.showcase('items', 0));
    await settle(90);
  },
  artItems2: async () => {
    await page.evaluate(() => window.SLAY.debug.showcase('items', 3));
    await settle(90);
  },
  artRarity: async () => {
    await page.evaluate(() => window.SLAY.debug.showcase('rarity', 0));
    await settle(90);
  },
  artMonsters: async () => {
    await page.evaluate(() => window.SLAY.debug.showcase('monsters', 0));
    await settle(90);
  },
  artMonsters2: async () => {
    await page.evaluate(() => window.SLAY.debug.showcase('monsters', 4));
    await settle(90);
  },
  artClasses: async () => {
    await page.evaluate(() => window.SLAY.debug.showcase('classes', 0));
    await settle(90);
  },
  stash: async () => {
    await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'stash' }));
  },
  blacksmith: async () => {
    await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'blacksmith' }));
  },
  vendor: async () => {
    await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'vendor' }));
  },
};

let ok = true;
for (const name of WANT) {
  const drive = drivers[name.trim()];
  if (!drive) {
    console.warn(`no driver for "${name}"`);
    continue;
  }
  try {
    await drive();
    const good = await shoot(name.trim());
    if (!good) ok = false;
  } catch (err) {
    console.error(`shot "${name}" failed:`, err.message);
    ok = false;
  }
}

if (errors.length) {
  console.error(`\n--- ${errors.length} console error(s) ---`);
  for (const e of errors.slice(0, 25)) console.error('  ' + e);
}

await browser.close();
shutdown();
process.exit(ok && errors.length === 0 ? 0 : 1);
