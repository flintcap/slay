/**
 * The front-end screens without the 3D world.
 *
 * A full render boots the texture library under software WebGL, which takes
 * many minutes. The menus are DOM and CSS, so their layout, copy and runtime
 * errors can be checked in seconds against a stand-in engine and a painted
 * backdrop. Driven by `tools/shot-menus.mjs`; open `/tools/menus-preview.html?screen=title`
 * under `vite` to look at one by hand.
 */
import '../src/ui/styles.css';
import '../src/ui/menus.css';
import type { Engine } from '../src/core/Engine';
import { events } from '../src/core/Events';
import { save } from '../src/core/Save';
import { Random } from '../src/core/RNG';
import { createCharacter, grantXp } from '../src/sim/Character';
import { tooltip } from '../src/ui/Tooltip';
import { TitlePanel } from '../src/ui/TitlePanel';
import { CharSelectPanel } from '../src/ui/CharSelectPanel';
import { PausePanel } from '../src/ui/PausePanel';
import { SettingsPanel } from '../src/ui/SettingsPanel';
import { DeathPanel } from '../src/ui/DeathPanel';
import { mountBanners } from '../src/ui/Banners';
import { mountOnboarding } from '../src/ui/Onboarding';
import { mountTransitions } from '../src/ui/Transitions';

const screen = new URLSearchParams(location.search).get('screen') ?? 'title';

/**
 * `?screen=3d:title` (or `3d:charSelect`, `3d:death`) boots a real engine with
 * just the front-end scenes and the full UI, skipping the boot-time texture
 * bake. Slower than the DOM-only screens, far faster than a full render, and
 * it runs the actual scene code.
 */
if (screen.startsWith('3d:')) {
  const [{ Engine }, { mountUI }, { TitleScene }, { CharSelectScene }, { DeathScene }] = await Promise.all([
    import('../src/core/Engine'),
    import('../src/ui/UIRoot'),
    import('../src/scenes/TitleScene'),
    import('../src/scenes/CharSelectScene'),
    import('../src/scenes/DeathScene'),
  ]);
  const view = document.getElementById('view') as HTMLCanvasElement;
  view.style.background = 'none';
  const eng = new Engine(view);
  mountUI(eng);
  eng.register('title', () => new TitleScene(eng));
  eng.register('charSelect', () => new CharSelectScene(eng));
  eng.register('death', () => new DeathScene(eng));
  eng.start();
  const which = screen.slice(3) as 'title' | 'charSelect' | 'death';
  await eng.goTo(
    which,
    which === 'death'
      ? { killedBy: 'Gorefang the Ravenous', depth: 7, level: 14, name: 'Vorwyn', playtime: 2100, classId: 'ranger', weapon: { baseId: 'bow.short', rarity: 'rare' } }
      : undefined,
  );
  (window as unknown as Record<string, unknown>).SLAY_PREVIEW_ENGINE = eng;
  (window as unknown as Record<string, unknown>).MENUS_READY = true;
} else {
  domPreview();
}

function domPreview(): void {
  const ui = document.getElementById('ui')!;
  const canvas = document.getElementById('view') as HTMLCanvasElement;

  let sceneId = screen === 'pause' || screen === 'hints' || screen === 'banners' ? 'dungeon' : screen === 'settings' ? 'title' : screen;
  const engine = {
    get currentSceneId() {
      return sceneId;
    },
    currentScene: null,
    paused: false,
    fps: 60,
    frameMs: 16.4,
    setPaused() {},
    renderer: { canvas, setQuality() {} },
    async goTo(id: string) {
      console.log('goTo', id);
    },
  } as unknown as Engine;

  // A sample account: two living characters and a few graves.
  function seed(): void {
    if (save.roster.length) return;
    const rng = new Random(7);
    const a = createCharacter('Kaelwyn', 'warden', rng);
    for (let i = 0; i < 30; i++) grantXp(a, 4000);
    a.depthRecord = 9;
    a.playtime = 7420;
    a.gold = 4120;
    save.setCharacter(a);
    const b = createCharacter('Nyxora', 'pyromancer', rng);
    b.depthRecord = 3;
    save.setCharacter(b);
    save.account.bankGold = 18250;
    save.account.bestDepth = 12;
    for (const [name, by, d] of [
      ['Vorwyn', 'Gorefang the Ravenous', 7],
      ['Ashira', 'a Bone Archer', 3],
      ['Thalric', 'Gorefang the Ravenous', 11],
    ] as Array<[string, string, number]>) {
      save.account.fallen.push({ name, classId: 'ranger', level: d + 4, depth: d, killedBy: by, at: Date.now() - d * 3.6e6 });
    }
    save.selectCharacter(a.id);
  }
  seed();

  tooltip.mount(ui);
  mountBanners(ui);
  mountTransitions();
  mountOnboarding(ui, engine);

  const title = new TitlePanel(engine);
  const cs = new CharSelectPanel(engine);
  const pause = new PausePanel(engine);
  const settings = new SettingsPanel(engine);
  const death = new DeathPanel(engine);
  for (const p of [title.panel, cs.panel, pause.panel, settings.panel, death.panel]) p.mount(ui);

  switch (screen) {
    case 'title':
      title.open();
      break;
    case 'charSelect':
      cs.open();
      break;
    case 'charSelectNew':
      cs.open();
      (document.querySelectorAll('.csx-tab')[1] as HTMLElement | undefined)?.click();
      break;
    case 'pause':
      events.emit('depth:changed', { depth: 4, level: 2, of: 3, place: 'The Drowned Ossuary' });
      pause.open();
      break;
    case 'settings':
      title.open();
      settings.open();
      break;
    case 'controls':
    case 'controlsCard':
      settings.open();
      (document.querySelectorAll('.stg-tab')[3] as HTMLElement | undefined)?.click();
      // `controlsCard`: scrolled past the rebinding list to the reference card.
      if (screen === 'controlsCard') {
        // A rebound key, to show the card following it.
        save.settings.keybinds = { KeyQ: 'KeyZ', KeyZ: 'KeyQ' };
        (document.querySelectorAll('.stg-tab')[0] as HTMLElement | undefined)?.click();
        (document.querySelectorAll('.stg-tab')[3] as HTMLElement | undefined)?.click();
        const groups = document.querySelectorAll<HTMLElement>('.stg-group');
        groups[groups.length - 1]?.scrollIntoView({ block: 'end' });
      }
      break;
    case 'death':
      (window as unknown as Record<string, unknown>).SLAY_DEATH = {
        killedBy: 'Gorefang the Ravenous',
        depth: 7,
        level: 14,
        name: 'Vorwyn',
        classId: 'ranger',
      };
      death.open();
      break;
    case 'banners':
      events.emit('depth:changed', {
        depth: 4,
        level: 1,
        of: 3,
        place: 'The Drowned Ossuary',
        blurb: 'The tide went out a century ago. The dead stayed.',
        biome: 'crypt',
      });
      break;
    case 'boss':
      events.emit('boss:engaged', { name: 'Gorefang', title: 'The Ravenous', maxLife: 1000 });
      break;
    case 'hints':
      sceneId = 'dungeon';
      events.emit('scene:change', { from: 'town', to: 'dungeon' });
      break;
    case 'loading':
      document.getElementById('fade')!.style.opacity = '1';
      events.emit('scene:loading', { from: 'town', to: 'dungeon', payload: { depth: 5 } });
      break;
  }

  (window as unknown as Record<string, unknown>).MENUS_READY = true;
}
