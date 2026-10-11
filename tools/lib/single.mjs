/**
 * Serves the published bundle the way the artifact host does, for checkers
 * that must measure what a player downloads rather than the dev server.
 *
 *   node tools/bundle-artifact.mjs            # writes dist-single/
 *   const { url, close } = await serveSingle(4333);
 *
 * `dist-single/slay.html` is wrapped in the host's own doctype and head, and
 * every file in `dist-single/files.json` is answered at its published path:
 * the `.wasm` asset packs, `assets/packs.json`, the music and ambience beds,
 * the townsfolk worker. Anything else is a 404, as on the host.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.ogg': 'audio/ogg',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
};

export async function serveSingle(port, dir = 'dist-single') {
  const body = readFileSync(path.join(dir, 'slay.html'), 'utf8');
  const pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
  const files = JSON.parse(readFileSync(path.join(dir, 'files.json'), 'utf8'));
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
    if (url === '' || url === 'index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
      return;
    }
    // files.json paths are relative to the project the bundle was built in.
    const src = files[url] && path.resolve(dir, '..', files[url]);
    if (!src || !existsSync(src)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(url)] ?? 'application/octet-stream' });
    res.end(readFileSync(src));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) };
}

/** Software-rendered Chromium flags every checker uses. */
export const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
export const CHROME_PATH = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
