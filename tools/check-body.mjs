/**
 * Renders class bodies big, front and back, bare and geared.
 *
 * Reuses PaperdollView so what gets judged is exactly what ships, but at a size
 * where the undergarments and the gear layering can actually be seen. Runs
 * against the dev server so it can import source modules directly.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4216;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const classes = process.argv.slice(2);
const list = classes.length ? classes : ['warden', 'pyromancer', 'shadowblade', 'stormcaller', 'revenant'];

const png = await page.evaluate(async (names) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const CM = await import('/src/art/CharacterModels.ts');
  const IM = await import('/src/art/ItemModels.ts');
  const AN = await import('/src/art/Animation.ts');
  const RNG = await import('/src/core/RNG.ts');
  const LOOT = await import('/src/sim/Loot.ts');

  const CELL = 210;
  const TALL = 430;
  const SLOTS = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt'];

  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setSize(CELL, TALL, false);
  r.setClearAlpha(0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fb0cc, 0x2a231c, 1.6));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.8);
  key.position.set(2.5, 3.4, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.8);
  rim.position.set(-2.8, 2.2, -3.0);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, CELL / TALL, 0.1, 40);

  const sheet = document.createElement('canvas');
  const cols = names.length;
  sheet.width = cols * (CELL + 8) + 8;
  sheet.height = 4 * (TALL + 22) + 8;
  const g = sheet.getContext('2d');
  g.fillStyle = '#12141a';
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.font = '13px monospace';
  g.fillStyle = '#cfd6e2';

  const rows = [
    ['bare front', false, 0],
    ['bare back', false, Math.PI],
    ['geared front', true, 0],
    ['geared back', true, Math.PI],
  ];

  for (let ci = 0; ci < names.length; ci++) {
    const cls = names[ci];
    for (let ri = 0; ri < rows.length; ri++) {
      const [label, geared, yaw] = rows[ri];
      const rig = new THREE.Group();
      scene.add(rig);

      const worn = new Set();
      const items = {};
      if (geared) {
        const rr = new RNG.Random(0x5150 + ci);
        for (const slot of SLOTS) {
          const base = LOOT.ITEM_BASES.find((b) => b.slot === slot);
          if (!base) continue;
          items[slot] = base;
          worn.add(slot);
        }
        void rr;
      }

      const built = CM.buildPlayerModel(cls, new RNG.Random(0x9d0117), worn);
      rig.add(built.root);
      const anim = new AN.Animator(built.bones);
      anim.play('idle', { fade: 0 });
      anim.update(0.4);

      for (const slot of Object.keys(items)) {
        try {
          const mesh = IM.buildItemModel(items[slot].visual, new RNG.Random(7), 'rare');
          CM.attachToSocket(rig, built.bones, slot, mesh);
        } catch {}
      }

      rig.rotation.y = yaw;
      built.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.root);
      const h = Math.max(0.5, box.max.y - box.min.y);
      const mid = (box.max.y + box.min.y) * 0.5;
      camera.position.set(0, mid, (h * 0.68) / Math.tan((camera.fov * Math.PI) / 360));
      camera.lookAt(0, mid, 0);

      r.render(scene, camera);
      const y = ri * (TALL + 22) + 20;
      if (ci === 0) g.fillText(label, 8, y - 6);
      g.drawImage(r.domElement, ci * (CELL + 8) + 8, y, CELL, TALL);

      rig.removeFromParent();
    }
    g.fillText(cls, ci * (CELL + 8) + 8, 12);
  }
  return sheet.toDataURL('image/png');
}, list);

mkdirSync('shots', { recursive: true });
writeFileSync('shots/bodies.png', Buffer.from(png.split(',')[1], 'base64'));
console.log('wrote shots/bodies.png');
await browser.close();
server.kill('SIGTERM');
process.exit(0);
