/**
 * Entry point for `tools/check-feel.mjs`.
 *
 * Exercises the hit-feedback layer headless: the camera's hit-stop budget, the
 * material-swap flash, knockback against walls, pooled shake, and proves every
 * sound and emitter the feel layer asks for actually exists.
 */
import * as THREE from 'three';
import { CameraRig } from '../src/fx/CameraRig';
import { HitFlash } from '../src/fx/HitFlash';
import { CombatFeel, FEEL_TABLES, feelEmitterIds, feelSoundIds, type HitKind } from '../src/fx/CombatFeel';
import { resolvesSound } from '../src/audio/Audio';
import { LootFX, lootSoundIds } from '../src/fx/LootFX';
import { emitterIds, FXSystem } from '../src/fx/Particles';
import { DecalSystem } from '../src/fx/Decals';
import { EffectSystem as RealEffects, MAX_LIVE_EFFECTS, type EffectSystem } from '../src/fx/Effects';
import { events } from '../src/core/Events';
import type { QualityProfile } from '../src/core/Renderer';
import type { DamagePacket } from '../src/types';

const fails: string[] = [];
const notes: Record<string, unknown> = {};
const check = (ok: boolean, msg: string): void => {
  if (!ok) fails.push(msg);
};

// --- 1. hit-stop budget ----------------------------------------------------
{
  const rig = new CameraRig();
  const dt = 1 / 60;
  let frozen = 0;
  let t = 0;
  // A fast melee build in a crowd: a hit-stop request every other frame for
  // three seconds.
  for (let i = 0; i < 180; i++) {
    if (i % 2 === 0) rig.hitStop(0.045, 0.06);
    rig.update(dt, t);
    t += dt;
    if (rig.worldScale < 0.5) frozen += dt;
  }
  const share = frozen / 3;
  notes.flurryFrozenShare = +share.toFixed(3);
  check(share < 0.22, `a melee flurry spends ${(share * 100).toFixed(0)}% of real time frozen (cap 22%)`);
  check(share > 0.04, `a melee flurry never freezes at all (${(share * 100).toFixed(1)}%)`);

  // A kill after the budget is spent still lands.
  rig.hitStop(0.08, 0.04, true);
  rig.update(dt, t);
  check(rig.worldScale < 0.2, 'a priority hit-stop is refused once the budget is empty');

  // And the clock always comes back.
  for (let i = 0; i < 120; i++) rig.update(dt, (t += dt));
  check(rig.worldScale === 1, `world clock stuck at ${rig.worldScale} after hit-stops end`);

  // Slow motion eases back to full speed.
  rig.slowMo(0.4, 0.5);
  let minScale = 1;
  for (let i = 0; i < 60; i++) {
    rig.update(dt, (t += dt));
    minScale = Math.min(minScale, rig.worldScale);
  }
  check(minScale < 0.6, 'slow motion never slowed the world');
  check(rig.worldScale === 1, 'slow motion never ended');

  // Kick springs back to rest.
  rig.kick(1, 0, 0.3);
  for (let i = 0; i < 60; i++) rig.update(dt, (t += dt));
  const k = rig as unknown as { kickX: number; kickZ: number };
  check(Math.abs(k.kickX) < 0.01, `camera kick did not settle (${k.kickX})`);
  rig.dispose();
}

// --- 2. flash swaps and restores ------------------------------------------
{
  const shared = new THREE.MeshStandardMaterial({ color: 0x884422 });
  const glow = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const geo = new THREE.BoxGeometry();
  const a = new THREE.Group();
  const body = new THREE.Mesh(geo, shared);
  const aura = new THREE.Mesh(geo, glow);
  a.add(body, aura);
  const b = new THREE.Group();
  const other = new THREE.Mesh(geo, shared);
  b.add(other);

  const f = new HitFlash();
  f.flash(a, 0xff7a18, 1, 0.1);
  check(body.material !== shared, 'flash did not swap the struck body');
  check(aura.material === glow, 'flash painted over an additive glow');
  check(other.material === shared, 'flashing one monster flashed another sharing its material');
  check(shared.color.getHex() === 0x884422, 'flash mutated the shared material');
  f.update(0.05);
  check(body.material !== shared, 'flash ended early');
  f.update(0.08);
  check(body.material === shared, 'flash never restored the original material');
  check(f.count === 0, 'flash slot leaked');

  // Someone else swaps the material mid-flash: theirs must survive.
  f.flash(a, 0xffffff, 1, 0.1);
  const theirs = new THREE.MeshStandardMaterial();
  body.material = theirs;
  f.update(0.2);
  check(body.material === theirs, 'flash restore clobbered a material changed mid-flash');
  f.dispose();
}

// --- 3. combat feel end to end --------------------------------------------
{
  const rig = new CameraRig();
  let bursts = 0;
  let lights = 0;
  const stub = {
    cameraRig: rig,
    fx: { burst: () => { bursts++; } },
    flash: () => { lights++; },
    chance: () => false,
  } as unknown as EffectSystem;
  const feel = new CombatFeel(stub);

  const mk = (x: number, z: number) => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    root.position.set(x, 0, z);
    return { id: 'e', root, life: 100, maxLife: 100, hitRadius: 0.5, rank: 'normal' as const, family: 'undead', sizeScale: 1 };
  };
  const wallAtX = 1.3;
  const world = { lineOfSight: (_ax: number, _az: number, bx: number) => bx < wallAtX };
  const packet = (amount: number, crit = false): DamagePacket => ({ amount, type: 'physical', crit, source: 'player' });

  // A normal blow shoves the target away from the attacker.
  const t1 = mk(0, 0);
  t1.life = 80;
  feel.hit(t1, packet(20), { kind: 'melee', fromX: 0, fromZ: -1, lifeBefore: 100, weapon: 'blade' }, world);
  for (let i = 0; i < 30; i++) feel.update(1 / 60, world);
  check(t1.root.position.z > 0.05, `melee knockback moved the target ${t1.root.position.z.toFixed(3)}m`);
  check(t1.root.position.z < 0.6, `melee knockback flung a normal hit ${t1.root.position.z.toFixed(2)}m`);

  // Knockback stops at a wall.
  const t2 = mk(1.0, 0);
  t2.life = 0;
  feel.hit(t2, packet(150, true), { kind: 'heavy', fromX: 0, fromZ: 0, lifeBefore: 100 }, world);
  for (let i = 0; i < 30; i++) feel.update(1 / 60, world);
  check(t2.root.position.x < wallAtX, `knockback pushed a body through a wall (x=${t2.root.position.x.toFixed(2)})`);
  check(lights > 0 && bursts > 0, 'a kill threw no light or burst');

  // A blow fully absorbed is not a hit.
  const t3 = mk(5, 5);
  const before = bursts;
  feel.hit(t3, packet(30), { kind: 'melee', fromX: 5, fromZ: 4, lifeBefore: 100 }, world);
  feel.update(1 / 60, world);
  check(t3.root.position.z === 5 && bursts === before, 'an absorbed blow still reacted');

  // A nova over twelve bodies shakes once, not twelve times.
  const r2 = rig as unknown as { trauma: number };
  r2.trauma = 0;
  for (let i = 0; i < 12; i++) {
    const t = mk(10 + i, 10);
    t.life = 70;
    feel.hit(t, packet(30), { kind: 'area', fromX: 10, fromZ: 9, lifeBefore: 100 }, world);
  }
  feel.update(1 / 60, world);
  notes.novaTrauma = +r2.trauma.toFixed(3);
  check(r2.trauma <= 0.56, `a twelve-target nova added ${r2.trauma.toFixed(2)} trauma (cap 0.55)`);
  check(r2.trauma > 0.05, 'a twelve-target nova did not shake at all');
  feel.dispose();
  rig.dispose();
}

// --- 3b. combos, evades and stuns are felt ---------------------------------
{
  const rig = new CameraRig();
  let bursts = 0;
  let lights = 0;
  const stub = {
    cameraRig: rig,
    fx: { burst: () => { bursts++; } },
    flash: () => { lights++; },
    chance: () => false,
  } as unknown as EffectSystem;
  const feel = new CombatFeel(stub);
  const hero = { root: new THREE.Group(), incapacitated: false };
  feel.update(1 / 60, null, 1, true, hero);

  events.emit('combat:combo', { id: 'e', name: 'Break', setup: 'a', payoff: 'b', bonusPct: 40, x: 1, y: 1, z: 1 });
  rig.update(1 / 60, 0);
  check(lights > 0 && bursts > 0, 'a combo landed with no light or sparks');
  check(rig.worldScale < 0.5, 'a combo did not freeze the frame');

  const b0 = bursts;
  events.emit('player:evaded', { ability: 'Slam', source: 'm' });
  check(bursts > b0, 'an evade made no shimmer on the hero');
  // A volley through one roll is one beat, not five.
  const b1 = bursts;
  for (let i = 0; i < 5; i++) events.emit('player:evaded', { ability: 'Arrow', source: 'm' });
  check(bursts === b1, 'evades inside one roll each made their own shimmer');

  const b2 = bursts;
  hero.incapacitated = true;
  feel.update(1 / 60, null, 1, true, hero);
  feel.update(1 / 60, null, 1, true, hero);
  check(bursts === b2 + 1, `a stun on the hero made ${bursts - b2} beats (want exactly 1)`);

  // After dispose the bus no longer reaches it.
  feel.dispose();
  const b3 = bursts;
  events.emit('player:evaded', { ability: 'x', source: 'm' });
  check(bursts === b3, 'a disposed feel layer still hears events');
  rig.dispose();
}

// --- 6. budgets hold under a screen-clearing fight ---------------------------
{
  const quality = { fxScale: 1 } as QualityProfile;
  const scene = new THREE.Scene();
  const fx = new FXSystem(scene, quality);
  const decals = new DecalSystem(scene, quality);
  const effects = new RealEffects(scene, fx, decals, quality);
  const spawned = (): number => (fx as unknown as { frameSpawned: number }).frameSpawned;
  const throttleOf = (): number => (fx as unknown as { throttle: number }).throttle;

  // 300 explosions in one frame spawn no more than the frame ceiling.
  for (let i = 0; i < 300; i++) fx.burst('explosion', i * 0.1, 1, 0);
  notes.burstSpawned = spawned();
  notes.frameBudget = fx.frameBudget;
  check(spawned() <= fx.frameBudget, `300 explosions spawned ${spawned()} particles in one frame (ceiling ${fx.frameBudget})`);
  check(fx.clipped > 0, 'the frame ceiling never clipped a burst');

  // A second of heavy bursts raises pressure and thins the crowd layers.
  let t = 0;
  for (let f = 0; f < 60; f++) {
    for (let i = 0; i < 40; i++) fx.burst('explosion', i * 0.1, 1, 0);
    fx.update(1 / 60, (t += 1 / 60));
  }
  notes.pressure = +fx.pressure.toFixed(2);
  notes.throttle = +throttleOf().toFixed(2);
  check(fx.pressure > 0.55, `a second of heavy bursts left pressure at ${fx.pressure.toFixed(2)}`);
  check(throttleOf() < 0.9, `pressure never thinned the crowd layers (throttle ${throttleOf().toFixed(2)})`);
  // And it eases back once the fight is over.
  for (let f = 0; f < 180; f++) fx.update(1 / 60, (t += 1 / 60));
  check(throttleOf() > 0.95, `particle throttle stuck at ${throttleOf().toFixed(2)} after the fight`);

  // 400 decorative novas stay under the live cap, and gameplay still fires.
  let fired = false;
  effects.delay(0.3, () => { fired = true; });
  for (let i = 0; i < 400; i++) effects.nova(i * 0.2, 0, 2, { element: 'fire', duration: 2 });
  for (let f = 0; f < 30; f++) effects.update(1 / 60, (t += 1 / 60));
  notes.liveEffects = effects.liveCount;
  notes.culled = effects.culled;
  check(effects.liveCount <= MAX_LIVE_EFFECTS, `${effects.liveCount} live effects after 400 novas (cap ${MAX_LIVE_EFFECTS})`);
  check(fired, 'a pending delay() was culled by the effect budget');
  effects.dispose();
}

// --- 4. tables and assets ---------------------------------------------------
{
  const kinds: HitKind[] = ['melee', 'heavy', 'projectile', 'area', 'beam', 'chain', 'minion', 'proc'];
  for (const [name, table] of Object.entries(FEEL_TABLES)) {
    for (const k of kinds) check(typeof (table as Record<string, number>)[k] === 'number', `${name} has no entry for ${k}`);
  }
  const families = ['undead', 'demon', 'beast', 'construct', 'insect', 'aberration', 'elemental', 'humanoid', 'plant', 'ooze'];
  const ids = feelSoundIds(families);
  const silent = ids.filter((id) => !resolvesSound(id));
  notes.feelSounds = ids.length;
  check(silent.length === 0, `feel asks for sounds that do not exist: ${silent.join(', ')}`);
  const valid = new Set(emitterIds());
  const missing = feelEmitterIds().filter((e) => !valid.has(e));
  check(missing.length === 0, `feel asks for emitters that do not exist: ${missing.join(', ')}`);
}

// --- 5. loot: arcs, landings, jackpots, magnet, pickup ----------------------
{
  let beams = 0;
  let punches = 0;
  const stub = {
    cameraRig: { punchIn: () => { punches++; } },
    fx: { burst: () => {} },
    decals: { add: () => {} },
    flash: () => {},
    beam: () => { beams++; },
    nova: () => {},
    chance: () => true,
  } as unknown as EffectSystem;
  const loot = new LootFX(stub);
  const mkDrop = (x: number, z: number) => {
    const root = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    beam.name = 'beam';
    const spin = new THREE.Group();
    spin.name = 'spin';
    root.add(beam, spin);
    return { root, pos: new THREE.Vector3(x, 0, z), gold: 0, beam };
  };
  const from = new THREE.Vector3(0, 0, 0);
  const a = mkDrop(1.2, 0.4);
  const b = mkDrop(-0.8, 1.0);
  loot.launch(a, from, 'magic');
  loot.launch(b, from, 'unique');
  check(loot.owns(a.root) && loot.owns(b.root), 'a launched drop is not owned while in flight');
  check(!a.beam.visible, 'a drop shows its beam while still in the air');
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    loot.update(1 / 60);
    peak = Math.max(peak, a.root.position.y);
  }
  check(peak > 1, `drops do not arc (peak height ${peak.toFixed(2)})`);
  check(Math.abs(a.root.position.x - 1.2) < 1e-6 && Math.abs(a.root.position.z - 0.4) < 1e-6, 'a drop did not land where the scene put it');
  check(a.beam.visible && a.beam.scale.y === 1, 'a landed drop never showed its full beam');
  check(!loot.owns(a.root), 'a landed item is still held by the loot layer');
  check(beams >= 1 && punches >= 1, 'a unique landed without its pillar of light');

  // Gold: lies flat, is vacuumed in, and is handed back on pickup.
  const g = mkDrop(2, 0);
  g.gold = 50;
  loot.launch(g, from, 'gold');
  for (let i = 0; i < 90; i++) loot.update(1 / 60);
  check(loot.owns(g.root) && g.root.position.y === 0, 'a landed gold pile is not lying flat');
  const hero = new THREE.Vector3(0, 0, 0);
  const before = g.pos.x;
  for (let i = 0; i < 10; i++) loot.magnet([g], hero, 1 / 60);
  check(g.pos.x < before, 'gold in reach is not pulled toward the hero');
  let done = false;
  const target = new THREE.Group();
  loot.collect(g.root, target, 'gold', () => { done = true; });
  for (let i = 0; i < 30; i++) loot.update(1 / 60);
  check(done, 'a collected pile was never handed back for disposal');

  const silent = lootSoundIds().filter((id) => !resolvesSound(id));
  check(silent.length === 0, `loot asks for sounds that do not exist: ${silent.join(', ')}`);
  notes.lootPeak = +peak.toFixed(2);
}

console.log(JSON.stringify({ ok: fails.length === 0, fails, notes }));
