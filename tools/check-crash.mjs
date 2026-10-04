/**
 * Can one error stop the game?
 *
 *   SLAY_PORT=4309 node tools/check-crash.mjs
 *
 * Boots the real game, walks into a dungeon, and breaks things on purpose:
 *
 *  1. one monster whose update throws every frame
 *  2. an event handler that throws
 *  3. an error thrown from a timer, and a promise nobody catches
 *  4. a whole scene update that throws every frame
 *  5. a scene that throws while being entered
 *
 * After each, the game must still be running (frames advancing, the screen not
 * stuck behind the black fade, input not frozen in a transition), the error
 * must be recorded once in `engine.errors` rather than flooding the console,
 * and for 4 and 5 the player must end up somewhere safe (town).
 */
import { bootGame, frames } from './lib/game.mjs';

const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4309 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);

const results = [];
const step = async (name, fn) => {
  try {
    const r = await page.evaluate(fn);
    results.push({ name, ok: r === true, detail: r === true ? '' : String(r) });
  } catch (err) {
    results.push({ name, ok: false, detail: `harness: ${String(err).slice(0, 300)}` });
  }
  const last = results[results.length - 1];
  console.log(`${last.ok ? 'ok  ' : 'FAIL'}  ${name}${last.ok ? '' : `\n        ${last.detail}`}`);
};

await step('boot leaves no caught errors behind', async () => {
  const errs = [...window.SLAY.engine.errors.values()];
  return errs.length === 0 ? true : errs.map((e) => `${e.where}: ${e.message}`).join(' | ');
});

await step('into a dungeon', async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 8);
  await window.SLAY.engine.goTo('dungeon', { depth: 2 });
  window.SLAY.debug.godMode(true);
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  const e = window.SLAY.engine;
  return e.currentSceneId === 'dungeon' && (e.currentScene.enemies?.length ?? 0) > 0
    ? true
    : `scene=${e.currentSceneId} enemies=${e.currentScene?.enemies?.length}`;
});

await step('a monster that throws every frame does not stop the frame', async () => {
  const e = window.SLAY.engine;
  const scene = e.currentScene;
  // Stand the player next to the monster so it is inside the AI leash.
  const bad = scene.enemies[0];
  scene.player.position.set(bad.root.position.x + 2, scene.player.position.y, bad.root.position.z);
  scene.player.root.position.copy(scene.player.position);
  bad.update = () => {
    throw new Error('check-crash: broken monster');
  };
  const before = e.elapsed;
  const runBefore = scene.runTime;
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  const rec = [...e.errors.values()].find((x) => x.message === 'check-crash: broken monster');
  const frameDied = [...e.errors.values()].find((x) => x.where === 'update');
  if (!rec) return 'error was not recorded';
  if (rec.count < 10) return `recorded only ${rec.count} times; the monster was not updated`;
  if (frameDied) return `the rest of the frame died: ${frameDied.message}`;
  if (!(e.elapsed > before) || !(scene.runTime > runBefore)) return 'game stopped advancing';
  if (e.currentSceneId !== 'dungeon') return `left the dungeon (${e.currentSceneId}) for one bad monster`;
  return true;
});

await step('a throwing event handler does not reach the emitter', async () => {
  const off = window.SLAY.events.on('toast', () => {
    throw new Error('check-crash: bad handler');
  });
  let after = false;
  window.SLAY.events.emit('toast', { text: 'check-crash' });
  after = true;
  off();
  return after ? true : 'emit threw';
});

await step('errors from timers and promises are recorded, not lost', async () => {
  setTimeout(() => {
    throw new Error('check-crash: timer');
  }, 0);
  Promise.reject(new Error('check-crash: promise'));
  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
  const msgs = [...window.SLAY.engine.errors.values()].map((x) => x.message);
  const missing = ['check-crash: timer', 'check-crash: promise'].filter((m) => !msgs.some((x) => x.includes(m)));
  return missing.length === 0 ? true : `not recorded: ${missing.join(', ')}`;
});

await step('a scene that throws every frame is left for town', async () => {
  const e = window.SLAY.engine;
  const scene = e.currentScene;
  scene.update = () => {
    throw new Error('check-crash: broken scene');
  };
  for (let i = 0; i < 600 && e.currentSceneId === 'dungeon'; i++) await new Promise((r) => requestAnimationFrame(r));
  // Let the transition finish.
  for (let i = 0; i < 1200 && e.transitioning; i++) await new Promise((r) => requestAnimationFrame(r));
  const rec = [...e.errors.values()].find((x) => x.message === 'check-crash: broken scene');
  if (!rec) return 'not recorded';
  if (e.currentSceneId !== 'town') return `still in ${e.currentSceneId}`;
  if (e.transitioning) return 'stuck in a transition';
  const fade = document.getElementById('fade');
  if (fade && Number(getComputedStyle(fade).opacity) > 0.5) return 'screen left black';
  return window.SLAY.save.account.current ? true : 'the character was lost';
});

await step('a scene that fails to build falls back to town, not a black screen', async () => {
  const e = window.SLAY.engine;
  const factories = e.scenes;
  const real = factories.get('dungeon');
  factories.set('dungeon', () => {
    const s = real();
    s.enter = async () => {
      throw new Error('check-crash: cannot build');
    };
    return s;
  });
  try {
    await e.goTo('dungeon', { depth: 3 });
  } catch (err) {
    factories.set('dungeon', real);
    return `goTo threw: ${err}`;
  }
  factories.set('dungeon', real);
  if (e.transitioning) return 'stuck in a transition';
  if (e.currentSceneId !== 'town') return `ended in ${e.currentSceneId}`;
  const fade = document.getElementById('fade');
  if (fade && Number(getComputedStyle(fade).opacity) > 0.5) return 'screen left black';
  return true;
});

await step('and the dungeon still works afterwards', async () => {
  const e = window.SLAY.engine;
  await e.goTo('dungeon', { depth: 2 });
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  return e.currentSceneId === 'dungeon' && !e.transitioning ? true : `scene=${e.currentSceneId}`;
});

await step('repeated errors are counted, not logged every time', async () => {
  const errs = [...window.SLAY.engine.errors.values()];
  const flood = errs.find((x) => x.count > 1 && x.count > 10000);
  return flood ? `${flood.message} x${flood.count}` : true;
});

await frames(page, 2);
const unexpected = pageErrors.filter((e) => !e.includes('check-crash'));
if (unexpected.length) {
  results.push({ name: 'no unexpected page errors', ok: false, detail: unexpected.slice(0, 5).join(' | ') });
  console.log(`FAIL  no unexpected page errors\n        ${unexpected.slice(0, 5).join('\n        ')}`);
}

await close();
const bad = results.filter((r) => !r.ok).length;
console.log(
  bad === 0
    ? `\nOK — ${results.length} cases: no single error stops the game.`
    : `\nFAILED — ${bad} of ${results.length} crash-resistance cases.`,
);
process.exit(bad === 0 ? 0 : 1);
