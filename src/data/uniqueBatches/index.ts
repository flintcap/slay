/**
 * SLAY — the depth plan's uniques, gathered from their batch files.
 *
 * Each batch is a plain list built with `U()` from `./kit`. `data/uniques.ts`
 * adds them after its own table, so they share its text, glow and loot rules;
 * `art/items/Designs.ts` folds their looks into its design table; the boss
 * that carries each one is listed in `SIGNATURES`.
 */
import type { UniqueDef } from '../uniques';
import { FROM, LOOKS } from './kit';
import { BATCH_A } from './batchA';
import { BATCH_B } from './batchB';
import { BATCH_C } from './batchC';
import { BATCH_D } from './batchD';
import { BATCH_E } from './batchE';
import { BATCH_F } from './batchF';

export const DEPTH_UNIQUES: UniqueDef[] = [...BATCH_A, ...BATCH_B, ...BATCH_C, ...BATCH_D, ...BATCH_E, ...BATCH_F];

/** Every batch unique's design, by id. */
export const DEPTH_LOOKS = LOOKS;

/** Boss id to the uniques it drops more often than anything else does. */
export const SIGNATURES: Readonly<Record<string, readonly string[]>> = FROM;
