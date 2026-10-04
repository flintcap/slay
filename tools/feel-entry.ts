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
import { emitterIds } from '../src/fx/Particles';
import type { EffectSystem } from '../src/fx/Effects';
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

console.log(JSON.stringify({ ok: fails.length === 0, fails, notes }));
