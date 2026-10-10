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
const PORT = Number(args.port ?? process.env.SLAY_PORT ?? 4173);

mkdirSync(OUT, { recursive: true });

if (!existsSync('dist/index.html')) {
  console.error('No dist/ build found. Run `npm run build` first.');
  process.exit(1);
}

// Its own process group: killing `npx` alone left the `vite preview` it
// started running after the render, holding the port.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));

const shutdown = () => {
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    try {
      server.kill('SIGTERM');
    } catch {
      /* already gone */
    }
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
  }, null, { timeout: Number(args.bootTimeout ?? 300000) });
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
  // Under software rendering on a busy machine one frame can take longer
  // than Playwright's 30s default, so the capture gets more room.
  await page.screenshot({ path: file, timeout: Number(args.shotTimeout ?? 180000) });
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
  // hud: a dungeon floor with a steady stream of combat text, so the floating
  // numbers (CombatTextLayer) are on screen when the frame is taken. Numbers
  // live about a second, so a page timer keeps feeding them until the shot.
  combatText: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      // A shallow floor: cheap to build under software rendering, and the
      // numbers are fed by the timer below rather than a real fight.
      if (s.debug?.makeCharacter) s.debug.makeCharacter('stormcaller', 12);
      await s.engine.goTo('dungeon', { depth: 2 });
      s.debug?.godMode?.(true);
    });
    await settle(30);
    await page.evaluate(() => {
      const s = window.SLAY;
      const types = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane'];
      let n = 0;
      clearInterval(window.__ctTimer);
      window.__ctTimer = setInterval(() => {
        const sc = s.engine.currentScene;
        const p = sc?.player?.position;
        if (!p) return;
        // Only foes near the hero are on screen; otherwise stand-in points
        // round the hero, so the numbers land in frame either way.
        const foes = [sc.boss, ...(sc.enemies ?? [])].filter(
          (e) => e && e.root && Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z) < 9,
        );
        n++;
        const spots = [[3, -2], [-3, -1.5], [1.5, -4], [-1, 2.5]];
        const pick = foes.length ? foes[n % Math.min(4, foes.length)] : null;
        const sp = spots[n % spots.length];
        const at = pick ? pick.root.position : { x: p.x + sp[0], y: 0, z: p.z + sp[1] };
        const crit = n % 5 === 0;
        s.events.emit('enemy:damaged', {
          id: pick ? String(pick.id ?? n % 4) : `t${n % spots.length}`,
          amount: crit ? 2400 + (n % 7) * 310 : 180 + (n % 9) * 37,
          type: types[n % types.length],
          crit,
          x: at.x,
          y: 1.6,
          z: at.z,
        });
        if (n % 6 === 0) s.events.emit('player:damaged', { amount: 64 + (n % 5) * 11, type: 'fire', life: 500, maxLife: 900 });
        if (n % 9 === 0) s.events.emit('player:healed', { amount: 120 });
        if (n % 13 === 0) s.events.emit('player:evaded', { ability: 'x', source: 'y' });
      }, 200);
    });
    await settle(30);
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
  // Front-end screens (menus stream).
  pause: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      if (!s.save.account.current && s.debug?.makeCharacter) s.debug.makeCharacter('ranger', 12);
      if (s.engine.currentSceneId !== 'town' && s.engine.currentSceneId !== 'dungeon') await s.engine.goTo('town');
      s.events.emit('ui:open', { panel: 'pause' });
    });
  },
  settings: async () => {
    await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'settings' }));
  },
  death: async () => {
    await page.evaluate(async () => {
      const s = window.SLAY;
      await s.engine.goTo('death', {
        killedBy: 'Gorefang the Ravenous',
        depth: 7,
        level: 14,
        name: 'Kaelwyn',
        playtime: 2100,
        classId: 'warden',
        weapon: { baseId: 'sword.short', rarity: 'rare' },
      });
    });
    // The death screen plays in beats; let them land.
    await settle(90);
  },
};

let ok = true;
for (const name of WANT) {
  // `biome-<id>`: the last area of a map ending in that biome (look checks).
  const biomeId = name.trim().startsWith('biome-') ? name.trim().slice(6) : null;
  const drive = biomeId
    ? async () => {
        await page.evaluate(async (b) => {
          const s = window.SLAY;
          if (s.debug?.makeCharacter) s.debug.makeCharacter('warden', 20, 7);
          await s.debug.previewBiome(b);
          s.debug?.godMode?.(true);
        }, biomeId);
        await settle(60);
      }
    : drivers[name.trim()];
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
