/**
 * SLAY — render layers beyond three.js's default layer 0.
 *
 * SHADOW_LAYER holds bodies drawn only into shadow maps: a creature's parts
 * merged into one shadow body (`art/creatures/Creature.ts`). Every shadow
 * camera sees it (`Renderer.applyShadows`); the game camera and mouse picking
 * stay on layer 0 and never do.
 */
export const SHADOW_LAYER = 1;
