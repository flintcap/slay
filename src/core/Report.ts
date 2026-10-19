/**
 * SLAY — the bug report a player copies from Settings, About.
 *
 * One block of plain text: which build, which browser and GPU, the screen,
 * the settings, where the game was, the errors it caught, and the log of this
 * session and the one before it (core/Log.ts). No names, no save data.
 */
import type { Engine } from './Engine';
import { BUILT, RELEASE, versionLabel } from './Build';
import { logText, previousLogText } from './Log';
import { save } from './Save';
import { selfTest } from './ThreeHooks';

interface AdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

/** The GPU as the browser names it. Empty when the device is not open. */
export function gpuName(engine: Engine): string {
  const backend = (engine.renderer.gl as unknown as { backend?: { device?: { adapterInfo?: AdapterInfo } } }).backend;
  const info = backend?.device?.adapterInfo;
  if (!info) return '';
  return [info.vendor, info.architecture, info.device, info.description].filter((s) => !!s).join(' / ');
}

export function buildReport(engine: Engine): string {
  const s = save.settings;
  const hero = save.account.current;
  const lines: string[] = [];
  lines.push(`SLAY ${versionLabel()}${BUILT ? `, built ${BUILT}` : ''}`);
  lines.push(`Report made ${new Date().toISOString()}`);
  lines.push(`Browser: ${navigator.userAgent}`);
  lines.push(`GPU: ${gpuName(engine) || 'unknown'}`);
  const hooks = selfTest(engine.renderer.gl);
  lines.push(`three.js r${hooks.revision}: ${hooks.missing.length === 0 ? 'every hook found' : `missing ${hooks.missing.join('; ')}`}`);
  lines.push(
    `Screen: ${screen.width}x${screen.height} at ${window.devicePixelRatio}x, window ${window.innerWidth}x${window.innerHeight}`,
  );
  lines.push(
    `Settings: quality ${s.quality}${s.autoQuality ? ' (auto)' : ''}, render scale ${s.renderScale ?? 1}, ` +
      `drawn at ${engine.renderer.qualityLevel}, ${Math.round(engine.fps)} fps (${engine.frameMs.toFixed(1)} ms)`,
  );
  lines.push(`Scene: ${engine.currentSceneId ?? 'none'}`);
  if (hero) lines.push(`Hero: level ${hero.level} ${hero.classId}, ${hero.difficulty ?? 'normal'}, deepest tier ${hero.depthRecord}`);
  if (!RELEASE) lines.push('Test build: developer tools are in it.');

  const errs = [...engine.errors.values()];
  lines.push('', `Errors caught: ${errs.length === 0 ? 'none' : errs.reduce((n, e) => n + e.count, 0)}`);
  for (const e of errs.slice(0, 30)) {
    lines.push(`  [${e.where}] x${e.count} in ${e.scene ?? '-'}: ${e.message}`);
    if (e.stack) lines.push(...e.stack.split('\n').slice(1, 4).map((l) => `      ${l.trim()}`));
  }

  lines.push('', '--- This session ---', logText() || '(empty)');
  const prev = previousLogText();
  if (prev) lines.push('', '--- Previous session ---', prev);
  return lines.join('\n');
}
