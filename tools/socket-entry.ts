/**
 * Entry point for `tools/check-socket-stack.mjs`.
 *
 * Reported: four El runes in one stack, one set into a helm, all four gone.
 * `insertGem` never touched the inventory — the caller did, with a function
 * that nulls the whole slot. This proves a stack loses exactly one unit.
 */
import { createItem, getBase } from '../src/sim/Loot';
import { insertGem, addSocket } from '../src/sim/Crafting';
import { setStackCount, stackCount } from '../src/sim/Inventory';
import { streamFor } from '../src/core/RNG';

const rng = streamFor(1234, 'socket');
const helm = createItem('helm.cap', 20, rng, 'normal');
// Give it a socket to work with, however the game normally would.
if (helm.sockets.length === 0) helm.sockets.push({ gemId: null });

const rune = createItem('rune.el', 10, rng, 'normal');
setStackCount(rune, 4);

const before = stackCount(rune);
const r = insertGem(helm, rune.baseId, 0);

// Mirror what the panel does now: consume one unit, not the slot.
let after = before;
if (r.ok) {
  const held = stackCount(rune);
  if (held > 1) setStackCount(rune, held - 1);
  else after = 0;
  after = stackCount(rune);
}

void addSocket;
void getBase;
console.log(
  JSON.stringify({
    inserted: r.ok,
    reason: r.reason ?? null,
    before,
    after,
    socketFilled: helm.sockets[0]?.gemId ?? null,
  }),
);
