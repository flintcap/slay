/**
 * One town render with both quest marker kinds: a yellow "?" over people
 * with work to give and a green "!" over Captain Renn, whose first contract
 * is set ready to hand in. Then a close shot of Renn to see the "!" clear
 * of her head.
 *
 *   SLAY_PORT=4331 timeout 2700 node tools/shot-markers.mjs --out=shots/qa-bugs
 *
 * Prints what each spot shows and where each marker lands on screen against
 * its head, and fails if either kind is missing or a marker sits below the
 * top of its head.
 *
 * Renders the `npm run build` output (like screenshot.mjs): run the build
 * first. The dev server is too slow to take a shot under software GL.
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(args.out ?? 'shots/qa-bugs');
mkdirSync(OUT, { recursive: true });

const problems = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!cond) problems.push(what);
};

const { page, close, pageErrors } = await bootGame({ fallbackPort: 4331, preview: true });
try {
  await page.evaluate(async () => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 8);
    await window.SLAY.engine.goTo('town');
  });
  await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'town', null, { timeout: 600_000, polling: 500 });
  await frames(page, 10);

  // Renn's first contract: taken, done below, waiting to be handed in.
  const setup = await page.evaluate(async () => {
    const S = window.SLAY;
    const st = S.save.account.current.story;
    st.chains.renn = { step: 0, state: 'ready' };
    S.events.emit('ui:refresh', {});
    const s = S.engine.currentScene;
    for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
    return { shown: s.questMarkers?.shown() ?? null };
  });
  const shown = setup.shown ?? {};
  const kinds = new Set(Object.values(shown));
  ok(shown.renn === 'turnIn', 'Renn shows "!" with her contract ready', JSON.stringify(shown));
  ok(kinds.has('offer'), 'someone shows "?"', Object.entries(shown).filter(([, k]) => k === 'offer').map(([s]) => s).join(', '));

  /** Puts the hero between Renn and the nearest "?" and reports screen places. */
  const frame = async (closeUp) =>
    page.evaluate(async (near) => {
      const S = window.SLAY;
      const s = S.engine.currentScene;
      const res = s.town.residents;
      const renn = res.where('renn');
      const shownNow = s.questMarkers.shown();
      const others = Object.keys(shownNow).filter((k) => shownNow[k] === 'offer' && res.where(k));
      others.sort((a, b) => res.where(a).distanceTo(renn) - res.where(b).distanceTo(renn));
      const other = others[0] ? res.where(others[0]) : renn;
      const mid = near ? renn.clone().add({ x: 0, y: 0, z: 2.2 }) : renn.clone().lerp(other, 0.5).add({ x: 0, y: 0, z: 2.5 });
      s.player.position.set(mid.x, 0, mid.z);
      s.player.stop?.();
      if (near) s.rig.zoom(-6);
      s.rig.follow(s.player.root);
      s.rig.snap();
      for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r));
      const cam = s.camera;
      const W = innerWidth;
      const H = innerHeight;
      const toScreen = (v) => {
        const p = v.clone().project(cam);
        return { x: Math.round((p.x * 0.5 + 0.5) * W), y: Math.round((-p.y * 0.5 + 0.5) * H), on: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 };
      };
      const out = [];
      for (const sp of s.questMarkers.root.children) {
        if (!sp.visible) continue;
        const spot = sp.name.split(':')[1];
        const head = res.where(spot) ? (() => { const v = sp.position.clone(); res.headTop(spot, v); return v; })() : null;
        out.push({ spot, kind: shownNow[spot], foot: toScreen(sp.position), headTop: head ? toScreen(head) : null, gap: head ? +(sp.position.y - head.y).toFixed(2) : null });
      }
      return out;
    }, closeUp);

  const wide = await frame(false);
  const fileWide = path.join(OUT, 'town-markers.png');
  await page.screenshot({ path: fileWide, timeout: 240_000 });
  console.log(`shot  ${fileWide}  ${Math.round(statSync(fileWide).size / 1024)} KB`);
  for (const m of wide) console.log(`      ${m.spot.padEnd(9)} ${m.kind.padEnd(7)} foot ${m.foot.x},${m.foot.y}${m.foot.on ? '' : ' (off screen)'}  head top ${m.headTop ? `${m.headTop.x},${m.headTop.y}` : '-'}  gap ${m.gap ?? '-'} m`);
  const onScreen = wide.filter((m) => m.foot.on);
  ok(onScreen.some((m) => m.kind === 'turnIn') && onScreen.some((m) => m.kind === 'offer'), 'both kinds are in the wide shot', onScreen.map((m) => `${m.spot}:${m.kind}`).join(' '));
  const low = wide.filter((m) => m.gap !== null && m.gap < 0.15);
  ok(low.length === 0, 'every marker sits clear of its head top', low.map((m) => `${m.spot} ${m.gap} m`).join(', '));

  const near = await frame(true);
  const fileNear = path.join(OUT, 'town-markers-near.png');
  await page.screenshot({ path: fileNear, timeout: 240_000 });
  console.log(`shot  ${fileNear}  ${Math.round(statSync(fileNear).size / 1024)} KB`);
  const rn = near.find((m) => m.spot === 'renn');
  if (rn) console.log(`      renn close: foot ${rn.foot.x},${rn.foot.y}  head top ${rn.headTop?.x},${rn.headTop?.y}`);
  ok(!!rn && rn.foot.on && rn.headTop && rn.foot.y < rn.headTop.y, 'close up, Renn\'s "!" is above her head on screen', rn ? `foot y ${rn.foot.y}, head top y ${rn.headTop?.y}` : 'no marker');
  ok(pageErrors.length === 0, 'no page errors', pageErrors.slice(0, 2).join(' | '));
} catch (e) {
  ok(false, 'render ran', String(e).slice(0, 300));
} finally {
  await close();
}
console.log(problems.length ? `\nFAILED: ${problems.join('; ')}` : '\nOK: both markers rendered.');
process.exit(problems.length ? 1 : 0);
