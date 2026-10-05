/**
 * Story screenshots: a conversation, an offer, the journal (one picture per
 * tab), a revelation card, a found note, a boss's spoken line and the boss
 * floor's lore card.
 *
 *   npm run build
 *   SLAY_PORT=4308 node tools/shot-story.mjs --out=shots/story
 *   node tools/shot-story.mjs --shots=talk,offer,journal
 *   node tools/shot-story.mjs --lab --shots=talk,journal,note,boss,bossfloor
 *
 * Self-contained: starts its own server on SLAY_PORT and stops it on exit, so
 * it can run as one blocking command. Boot takes minutes under software
 * rendering; each shot after that is a few seconds of settling.
 *
 * --lab mounts the real story UI on the UI lab's painted stand-in
 * (tools/storylab.html) with no WebGL, so the whole set takes seconds. Use it
 * to check text and panels when the machine is too loaded to boot the game.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const OUT = path.resolve(args.out ?? 'shots/story');
const WANT = String(args.shots ?? 'talk,offer,journal,contracts,card,note,boss,bossfloor').split(',');
const WIDTH = Number(args.width ?? 1600);
const HEIGHT = Number(args.height ?? 900);
const PORT = Number(args.port ?? process.env.SLAY_PORT ?? 4308);
const LAB = !!args.lab;

mkdirSync(OUT, { recursive: true });
if (!LAB && !existsSync('dist/index.html')) {
  console.error('No dist/ build found. Run `npm run build` first.');
  process.exit(1);
}

let shutdown = async () => {};
if (LAB) {
  const { createServer } = await import('vite');
  const dev = await createServer({
    root: path.resolve(import.meta.dirname, '..'),
    configFile: false,
    logLevel: 'error',
    server: { port: PORT, strictPort: true, host: '127.0.0.1' },
  });
  await dev.listen();
  shutdown = () => dev.close();
} else {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));
  shutdown = async () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      try {
        server.kill('SIGTERM');
      } catch {
        /* gone */
      }
    }
  };
  process.on('exit', () => void shutdown());
  process.on('SIGINT', () => {
    void shutdown();
    process.exit(130);
  });

  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) {
        up = true;
        break;
      }
    } catch {
      /* not yet */
    }
    await sleep(500);
  }
  if (!up) {
    console.error('preview server never came up');
    await shutdown();
    process.exit(1);
  }
}

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: LAB
    ? ['--no-sandbox']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !(LAB && m.text().includes('404'))) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
page.setDefaultTimeout(Number(args.stepTimeout ?? 600000));

if (LAB) {
  await page.goto(`http://127.0.0.1:${PORT}/tools/storylab.html?s=hud`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.LAB_READY === true && !!window.SLAY_STORY, null, { timeout: 120000 });
} else {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120000 });
  try {
    await page.waitForFunction(() => {
      const s = window.SLAY;
      return !!s && !!s.debug && !!s.engine && s.engine.currentSceneId !== null && !!window.SLAY_STORY;
    }, null, { timeout: Number(args.bootTimeout ?? 1500000) });
  } catch {
    console.error('game never reached a live scene');
  }
}
console.log('booted');

async function settle(frames = 60) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let i = 0;
        const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    frames,
  );
}

async function shoot(name) {
  await settle(20);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, timeout: Number(args.shotTimeout ?? 600000) });
  console.log(`ok    ${name.padEnd(12)} ${file}  ${Math.round(statSync(file).size / 1024)} KB`);
}

// Close every card the way a player would, so the card queue moves on. Taking
// them out of the page by hand leaves the queue waiting forever.
async function clearCards() {
  for (let i = 0; i < 12; i++) {
    const open = await page.evaluate(() => {
      const btn = document.querySelector('.story-card.is-open .story-card-ft button');
      if (btn) btn.click();
      return !!btn || !!document.querySelector('.story-card');
    });
    if (!open) return;
    await sleep(600);
  }
}

async function closePanels() {
  // No Escape key here: with nothing open it brings up the pause menu.
  await page.evaluate(() => {
    for (const id of ['dialogue', 'journal']) window.SLAY.events.emit('ui:close', { panel: id });
  });
}

let inTown = LAB; // the lab has no town to walk to; its painted HUD stands in
async function town() {
  if (inTown) return;
  await page.evaluate(async () => {
    const s = window.SLAY;
    if (!s.save.account.current && s.debug?.makeCharacter) s.debug.makeCharacter('warden', 6);
    await s.engine.goTo('town');
  });
  await settle(90);
  // The first night reveals a chapter card and an arrival line; let them go.
  await clearCards();
  inTown = true;
}

const drivers = {
  talk: async () => {
    await town();
    await page.evaluate(() => window.SLAY_STORY.talk('renn'));
    await settle(30);
  },
  offer: async () => {
    await town();
    await page.evaluate(() => {
      if (!document.querySelector('.dlg-opt.is-contract')) window.SLAY_STORY.talk('renn');
    });
    await settle(10);
    await page.click('.dlg-opt.is-contract');
    await settle(20);
  },
  journal: async () => {
    await closePanels();
    // Give every tab something to show: a few chapters, pages, places, bosses
    // and a contract in hand. Only the in-memory save; nothing is written.
    // Opening the journal once creates the story save if this account has none.
    await page.evaluate(() => window.SLAY_STORY.journal('descent'));
    await page.evaluate(() => {
      window.SLAY.events.emit('ui:close', { panel: 'journal' });
      const st = window.SLAY.save.account.story;
      if (!st) return;
      const add = (list, ids) => ids.forEach((id) => list.includes(id) || list.push(id));
      add(st.chapters, ['ch.stairhead', 'ch.first', 'ch.tenant']);
      add(st.notes, ['note.crypt.chalk', 'note.crypt.swept', 'note.crypt.oil', 'note.caverns.pin', 'floor.boneking_gharruth']);
      add(st.biomes, ['crypt', 'caverns']);
      add(st.met, ['boneking_gharruth', 'butcher_grell']);
      add(st.slain, ['boneking_gharruth']);
      st.chains.renn ??= { step: 0, state: 'active' };
    });
    // One picture per tab; the last one is taken by the loop below.
    for (const tab of ['contracts', 'people', 'bosses', 'notes', 'places']) {
      await page.evaluate((t) => window.SLAY_STORY.journal(t), tab);
      await settle(20);
      await shoot(`journal-${tab}`);
    }
    await page.evaluate(() => window.SLAY_STORY.journal('descent'));
    await settle(30);
  },
  contracts: async () => {
    await page.evaluate(() => window.SLAY_STORY.journal('contracts'));
    await settle(30);
  },
  card: async () => {
    await closePanels();
    await page.evaluate(() =>
      window.SLAY_STORY.showCard({
        kicker: 'The descent · Tier 3',
        title: 'It Is Not a Ruin',
        text: [
          'The warning at the stairhead is old and unsigned: IT IS NOT A RUIN. SOMEONE IS STILL USING IT.',
          'Down here you see what it meant. Fresh oil in the lamps. Doors rehung.',
        ],
        kind: 'chapter',
      }),
    );
    await settle(40);
  },
  note: async () => {
    await closePanels();
    await clearCards();
    await page.evaluate(() => {
      window.SLAY_STORY.note?.('note.crypt.swept');
    });
    await settle(40);
  },
  boss: async () => {
    // Spoken over the town: the subtitle is the same wherever it plays, and a
    // dungeon boot would double the render time.
    await closePanels();
    await clearCards();
    await page.evaluate(() => {
      window.SLAY_STORY.bossLine?.('greet');
    });
    await settle(30);
  },
  bossfloor: async () => {
    await closePanels();
    await page.evaluate(() => {
      const st = window.SLAY_STORY;
      if (st.bossFloor) st.bossFloor();
    });
    await settle(40);
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
    await shoot(name.trim());
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
await shutdown();
process.exit(ok ? 0 : 1);
