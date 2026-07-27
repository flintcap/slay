import { Engine } from './core/Engine';
import { save } from './core/Save';
import { events } from './core/Events';
import { TitleScene } from './scenes/TitleScene';
import { CharSelectScene } from './scenes/CharSelectScene';
import { TownScene } from './scenes/TownScene';
import { DungeonScene } from './scenes/DungeonScene';
import { DeathScene } from './scenes/DeathScene';
import { mountUI } from './ui/UIRoot';
import { audio } from './audio/Audio';

const bootFill = document.getElementById('boot-fill');
const bootStatus = document.getElementById('boot-status');
const bootEl = document.getElementById('boot');

function boot(pct: number, msg: string): void {
  if (bootFill) bootFill.style.width = `${Math.round(pct * 100)}%`;
  if (bootStatus) bootStatus.textContent = msg;
}

/** Yields to the browser so the boot bar actually paints between steps. */
function tick(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('missing #view canvas');

  boot(0.05, 'Reading the ledger of the fallen…');
  await tick();
  save.load();

  boot(0.18, 'Kindling the forge…');
  await tick();
  const engine = new Engine(canvas);
  engine.renderer.setQuality(save.settings.quality);

  boot(0.34, 'Weaving materials…');
  await tick();
  // Texture/material libraries build their atlases lazily on first scene entry;
  // touching them here front-loads the cost onto the boot bar instead of the
  // first frame of gameplay.
  const { warmMaterials } = await import('./art/Materials');
  await warmMaterials((p, label) => boot(0.34 + p * 0.36, label));

  // Teach the item-model builder how to find a base's authored visual. Done
  // here rather than inside art/ so the art layer keeps no compile-time
  // dependency on the item simulation.
  const [{ setItemVisualResolver }, { getBase }] = await Promise.all([
    import('./art/ItemModels'),
    import('./sim/Loot'),
  ]);
  setItemVisualResolver((item) => {
    try {
      return getBase(item.baseId)?.visual;
    } catch {
      return undefined;
    }
  });

  boot(0.74, 'Tuning the instruments…');
  await tick();
  audio.init(save.settings);

  boot(0.84, 'Raising the town…');
  await tick();
  mountUI(engine);

  engine.register('title', () => new TitleScene(engine));
  engine.register('charSelect', () => new CharSelectScene(engine));
  engine.register('town', () => new TownScene(engine));
  engine.register('dungeon', () => new DungeonScene(engine));
  engine.register('death', () => new DeathScene(engine));

  boot(0.95, 'Opening the gate…');
  await tick();

  engine.start();
  await engine.goTo('title');

  boot(1, 'Ready');
  if (bootEl) {
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 900);
  }

  // Expose for debugging and for the Playwright screenshot harness.
  const { installDebug } = await import('./scenes/debug');
  (window as unknown as Record<string, unknown>).SLAY = {
    engine,
    save,
    events,
    debug: installDebug(engine),
  };
}

main().catch((err) => {
  console.error(err);
  if (bootStatus) {
    bootStatus.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
    bootStatus.style.color = '#ff6b5a';
  }
});
