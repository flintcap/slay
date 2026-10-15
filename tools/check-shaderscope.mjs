/**
 * Does every shader write a value before it reads it?
 *
 *   SLAY_PORT=4333 node tools/check-shaderscope.mjs
 *
 * TSL (three's node shading language) writes a value shared by two branches
 * of an `If` or a `select` only where it is first built: inside the first
 * branch. Every other branch then reads a variable that was never written,
 * which is zero. Nothing errors; the picture is just wrong. Outdoor ground
 * drew without its texture, particles without drag stood still, and half of
 * every stretched spark faced the wrong way.
 *
 * This boots the game, visits the town and a spread of maps, takes every
 * WGSL program the renderer built, and walks each function: a read of a
 * variable with no write on the way to it (a write in every arm of an
 * if/else counts) fails the check. A screen-space derivative (`dpdx`,
 * `textureSample`) inside a branch is listed as a warning: three's own
 * edge smoothing does that on purpose, on textures with one mip level.
 */
import { bootGame, frames } from './lib/game.mjs';

const BIOMES = ['darkForest', 'swamp', 'desert', 'foundry', 'frostvault', 'hell'];

/** Problems in one WGSL program: `{ line, name, text, warn }`. */
export function scanWgsl(src) {
  const out = [];
  const decl = /^\s*var(<private>)?\s+(\w+)\s*:\s*[^=;]+;\s*$/;
  const priv = new Set();
  let vars = new Set();
  let writes = new Map();
  let stack = [{ id: 0, set: new Set(), kind: 'fn' }];
  let nid = 0;
  let chain = null;
  let inFn = false;
  let pending = '';
  const pathOf = () => stack.map((b) => b.id);
  const covers = (w, p) => w.length <= p.length && w.every((x, i) => x === p[i]);
  const write = (v, p) => {
    writes.get(v).push(p);
    stack[stack.length - 1].set.add(v);
  };
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split('//')[0];
    if (/^\s*fn\s+\w+/.test(line)) {
      vars = new Set(priv);
      writes = new Map([...priv].map((v) => [v, []]));
      stack = [{ id: 0, set: new Set(), kind: 'fn' }];
      chain = null;
      inFn = true;
    }
    const m = decl.exec(line);
    if (m) {
      if (m[1] && !inFn) priv.add(m[2]);
      vars.add(m[2]);
      writes.set(m[2], []);
      continue;
    }
    for (const tok of line.match(/\{|\}|[^{}]+/g) ?? []) {
      if (tok === '{') {
        const isElse = /\belse\s*$/.test(pending);
        const kind = isElse ? 'else' : /\bif\b/.test(pending) ? 'if' : 'other';
        stack.push({ id: ++nid, set: new Set(), kind, chain: isElse ? chain : null });
        chain = null;
        pending = '';
      } else if (tok === '}') {
        const b = stack.pop();
        if (b.kind === 'if') chain = [b.set];
        else {
          if (b.kind === 'else') {
            const sets = [...(b.chain ?? []), b.set];
            const p = pathOf();
            for (const v of sets[0]) if (sets.every((s) => s.has(v))) write(v, p);
          }
          chain = null;
        }
        pending = '';
      } else {
        pending = tok;
        if (tok.trim() && !/\belse\b/.test(tok)) chain = null;
        const p = pathOf();
        if (stack.some((b) => b.kind === 'if' || b.kind === 'else') && /\b(dpdx|dpdy|fwidth|dpdxFine|dpdyFine|textureSample|textureSampleBias)\s*\(/.test(tok)) {
          out.push({ line: i + 1, name: 'derivative in a branch', text: lines[i].trim(), warn: true });
        }
        for (const stmt of tok.split(';')) {
          const am = /^\s*(\w+)(?:\.\w+)?\s*(=|\+=|-=|\*=|\/=)(?!=)/.exec(stmt);
          const target = am && vars.has(am[1]) && am[2] === '=' ? am[1] : null;
          const rhs = target ? stmt.slice(am[0].length) : stmt;
          for (const v of new Set(rhs.match(/\b\w+\b/g) ?? [])) {
            if (vars.has(v) && !writes.get(v).some((w) => covers(w, p))) {
              out.push({ line: i + 1, name: v, text: lines[i].trim(), warn: false });
            }
          }
          if (target) write(target, p);
        }
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { page, close, pageErrors } = await bootGame({ fallbackPort: 4333 });
  await page.evaluate(() => {
    const s = window.SLAY;
    if (!s.save.account.current) s.debug.makeCharacter('warden', 1, 4242);
  });
  const programs = new Map();
  const grab = async (where) => {
    await frames(page, 20);
    const codes = await page.evaluate(() => {
      const p = window.SLAY.engine.renderer.gl._pipelines.programs;
      return [...p.vertex.keys(), ...p.fragment.keys(), ...p.compute.keys()];
    });
    for (const c of codes) if (!programs.has(c)) programs.set(c, where);
  };
  await page.evaluate(async () => {
    await window.SLAY.engine.goTo('town');
  });
  await grab('town');
  for (const b of BIOMES) {
    await page.evaluate(async (bb) => {
      await window.SLAY.debug.previewBiome(bb, 8, false);
    }, b);
    await grab(b);
  }
  await close();

  let fails = 0;
  let warns = 0;
  for (const [code, where] of programs) {
    const seen = new Set();
    for (const f of scanWgsl(code)) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      const name = /^\s*\/\/ Three\.js r\d+ - (.*)$/m.exec(code)?.[1] ?? '';
      if (f.warn) warns++;
      else fails++;
      console.log(`${f.warn ? 'warn' : 'FAIL'}  ${where} ${name} line ${f.line}: ${f.name} :: ${f.text.slice(0, 140)}`);
    }
  }
  console.log(`${programs.size} shaders, ${fails} unwritten reads, ${warns} warnings, ${pageErrors.length} page errors`);
  process.exit(fails || pageErrors.length ? 1 : 0);
}
