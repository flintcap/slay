/**
 * Does the weather fit where it falls, scale with quality and stay cheap?
 *
 *   node tools/check-weather.mjs
 *
 * Headless. See `tools/weather-entry.ts`. Fails on sky weather under a roof,
 * a layer the quality level cannot thin, more than 600 particles a second,
 * or snow, rain, ash or fog never turning up.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('weather');
for (const [k, v] of Object.entries(r.report)) console.log(`${k.padEnd(12)} ${v}`);
finish(r.problems, 'weather fits its zones, scales with quality and stays cheap.');
