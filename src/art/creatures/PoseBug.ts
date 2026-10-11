/**
 * SLAY — the many-legged poser: spiders and insects.
 *
 * The legs walk themselves (the animator plants every foot); the poser rides
 * the body over them, works the mandibles, curls the abdomen to sting, raises
 * the front legs to threaten, and flips the body over when it dies.
 */
import type { CreatureAnimator } from './Animator';
import { clamp01, pulse, ramp, settle } from './Motion';
import { TAU, dropFall, fidget, idleWeight, riseDepth, thud } from './PoseCommon';

export function poseBug(a: CreatureAnimator): void {
  const R = a.hipY;
  const B = a.info.height - R;
  const g = a.gait;
  const heavy = a.style.heavy;
  const c = a.cycle * TAU;
  const flying = a.style.gait === 'glide';
  if (a.phase === 'death') return deathBug(a, flying);

  // Wings: a blur while it flies or moves fast, folded at rest.
  const buzz = flying ? 1 : clamp01(a.run * 1.5 + (a.phase === 'cast' ? 1 : 0));
  for (const n of ['wingL', 'wingR', 'wingL2', 'wingR2']) {
    if (!a.has(n)) continue;
    const s = n.startsWith('wingL') ? 'L' : 'R';
    const fl = Math.sin(a.time * 55 + (n.endsWith('2') ? 1.5 : 0)) * 0.7 * buzz;
    a.rotS(n, s, -0.2 * buzz, 0.5 * (1 - buzz), fl + 0.4 * buzz - 0.15 * (1 - buzz));
  }

  if (flying) {
    // Hovers: legs dangle, the body bobs on its wingbeat.
    a.ikW = 0;
    const hover = R * 1.6 + Math.sin(a.time * 2.2 + a.offset) * 0.08 * R;
    a.body(0, hover, 0, 0.25 * g + Math.sin(a.time * 1.3 + a.offset) * 0.05, 0, Math.max(-0.3, Math.min(0.3, -a.yawRate * 0.1)));
    for (let i = 0; i < 4; i++) {
      a.rotS(`leg${i}L`, 'L', 0.2 * i - 0.2, 0, -0.5);
      a.rotS(`leg${i}R`, 'R', 0.2 * i - 0.2, 0, -0.5);
      a.rotS(`knee${i}L`, 'L', 0, 0, -0.6);
      a.rotS(`knee${i}R`, 'R', 0, 0, -0.6);
    }
    a.rot('abdomen', 0.25 + Math.sin(a.time * 3 + a.offset) * 0.06);
  } else if (g > 1e-3) {
    // Walking: a quick double bob and a little roll from side to side.
    a.body(0, -Math.abs(Math.sin(c * 2)) * 0.04 * R * g, 0, 0.05 * g, 0, Math.sin(c * 2) * 0.03 * g + Math.max(-0.2, Math.min(0.2, -a.yawRate * 0.05)) * g);
    a.rot('abdomen', 0.03 * Math.sin(c * 2) * g, -0.1 * Math.sin(c) * g, 0);
  }
  // Mandibles work; antennae-like head tilts.
  const chew = Math.sin(a.time * (7 - 3 * heavy) + a.offset);
  a.rotS('mandL', 'L', 0, 0.12 * chew, 0);
  a.rotS('mandR', 'R', 0, 0.12 * chew, 0);
  a.rot('head', a.wobble(0.7) * 0.06, a.wobble(0.45, 1) * 0.15, 0);
  // Scythes held up and folded, ready.
  a.rotS('leg0L', 'L', -0.15, 0, 0);
  a.rotS('leg0R', 'R', -0.15, 0, 0);

  const iw = idleWeight(a);
  if (iw > 1e-3 && !flying) {
    const br = Math.sin(a.time * 1.4 + a.offset);
    a.rot('abdomen', 0.03 * br * iw);
    a.body(0, 0.01 * R * br * iw, 0);
    const f = fidget(a);
    if (f.name === 'roar' || f.name === 'shake') threat(a, pulse(f.t, 0.1, 0.3, 0.7, 0.95));
    else if (f.name === 'look') a.body(0, 0, 0, 0, Math.sin(f.t * TAU) * 0.25 * f.w);
  }

  const t = a.t;
  switch (a.phase) {
    case 'windup': {
      const w = ramp(t, 0, 0.5);
      if (a.style.ranged && !a.struck) {
        // Rear and spit (or shoot web).
        const rel = a.releaseAt();
        const d = ramp(t, 0, rel * 0.85);
        const fly = ramp(t, rel - 0.02, Math.min(1, rel + 0.1));
        a.body(0, 0.1 * R * d, -0.1 * B * d + 0.08 * B * fly, -0.35 * d + 0.25 * fly);
        a.rotS('mandL', 'L', 0, 0.5 * d, 0);
        a.rotS('mandR', 'R', 0, 0.5 * d, 0);
        a.rot('abdomen', -0.25 * d);
        break;
      }
      bugMove(a, w, 0);
      break;
    }
    case 'strike': {
      const hit = ramp(t, 0, 0.26);
      const back = ramp(t, 0.42 + 0.15 * heavy, 1);
      bugMove(a, (1 - hit) * (1 - back), hit * (1 - back));
      a.body(0, settle(t, 0.26, 24, 10) * 0.03 * R, 0);
      break;
    }
    case 'cast': {
      const rel = a.releaseAt();
      const k = ramp(t, 0, rel * 0.6) * (1 - ramp(t, Math.min(0.99, rel + 0.1), 1));
      threat(a, k);
      // The abdomen pulses as it brings up its brood or its venom.
      a.rot('abdomen', 0.25 * k + Math.sin(a.time * 18) * 0.08 * k);
      a.pose.spread *= 1 + 0.03 * Math.sin(a.time * 18) * k;
      break;
    }
    default:
  }
  const f = a.flinch;
  if (Math.abs(f) > 1e-3) a.body(-a.flinchSide * 0.05 * R * f, 0.06 * R * Math.abs(f), -0.08 * R * f, -0.2 * f, 0.15 * f * a.flinchSide, 0.15 * f * a.flinchSide);
  if (a.stagger > 0) a.body(0, -0.3 * R * a.stagger, 0, 0.1 * a.stagger, 0, Math.sin(a.time * 14) * 0.1 * a.stagger);
  if (a.phase === 'spawn') spawnBug(a, flying);
}

/** Rears up on the back legs with the front legs raised. */
function threat(a: CreatureAnimator, k: number): void {
  if (k < 1e-3) return;
  const R = a.hipY;
  a.body(0, 0.25 * R * k, -0.05 * R * k, -0.4 * k);
  for (let i = 0; i < a.legCount; i++) {
    const d = a.legDef(i)!;
    const front = d.upper === 'leg0L' || d.upper === 'leg0R' || (d.upper.startsWith('leg1') && !a.has('leg3L'));
    if (!front) continue;
    const ft = a.footTarget(i)!;
    ft.y += a.legLen * 0.9 * k;
    ft.z += a.legLen * 0.2 * k;
  }
  a.rotS('leg0L', 'L', -0.6 * k, 0, 0.3 * k);
  a.rotS('leg0R', 'R', -0.6 * k, 0, 0.3 * k);
  a.rotS('mandL', 'L', 0, 0.45 * k, 0);
  a.rotS('mandR', 'R', 0, 0.45 * k, 0);
}

function bugMove(a: CreatureAnimator, wind: number, hit: number): void {
  const R = a.hipY;
  const B = a.info.height - R;
  switch (a.attack) {
    case 'sting': {
      // The abdomen curls up over the back, then drives forward.
      a.rot('abdomen', 1.1 * wind + 1.5 * hit);
      a.rot('sting', 0.6 * wind + 0.9 * hit);
      a.body(0, 0.05 * R * wind, -0.08 * B * wind + 0.25 * B * hit, -0.12 * wind + 0.2 * hit);
      return;
    }
    case 'claw':
    case 'chop':
    case 'swing': {
      // Scythes (or the front legs) rise, then hack down onto the target.
      a.rotS('leg0L', 'L', -1.1 * wind + 0.7 * hit, 0, 0.2 * wind);
      a.rotS('leg0R', 'R', -1.1 * wind + 0.7 * hit, 0, 0.2 * wind);
      a.rotS('knee0L', 'L', -0.7 * wind + 0.5 * hit, 0, 0);
      a.rotS('knee0R', 'R', -0.7 * wind + 0.5 * hit, 0, 0);
      a.body(0, 0.1 * R * wind - 0.05 * R * hit, -0.06 * B * wind + 0.25 * B * hit, -0.25 * wind + 0.25 * hit);
      if (!a.has('foot0L') || a.legDef(0)?.upper === 'leg0L') {
        // Spiders: the walking front pair stab down.
        for (let i = 0; i < a.legCount; i++) {
          const d = a.legDef(i)!;
          if (!d.upper.startsWith('leg0')) continue;
          const ft = a.footTarget(i)!;
          ft.y += a.legLen * 0.8 * wind;
          ft.z += a.legLen * (0.15 * wind + 0.35 * hit);
        }
      }
      return;
    }
    case 'lunge': {
      // Crouch, then pounce: the body flies at the target.
      a.body(0, -0.3 * R * wind + 0.5 * R * hit, -0.1 * B * wind + 0.8 * B * hit, 0.1 * wind - 0.25 * hit);
      a.ikW = 1 - 0.8 * hit;
      a.rotS('mandL', 'L', 0, 0.5 * (wind + hit), 0);
      a.rotS('mandR', 'R', 0, 0.5 * (wind + hit), 0);
      return;
    }
    case 'slam':
    case 'stomp':
    case 'gore': {
      // Rear and crash down with the whole carapace.
      threat(a, wind);
      a.body(0, -0.15 * R * hit, 0.15 * B * hit, 0.12 * hit);
      return;
    }
    default: {
      // Bite: a dart forward, mandibles wide then shut.
      a.body(0, 0.04 * R * wind - 0.06 * R * hit, -0.12 * B * wind + 0.35 * B * hit, -0.15 * wind + 0.18 * hit);
      a.rotS('mandL', 'L', 0, 0.6 * wind - 0.15 * hit, 0);
      a.rotS('mandR', 'R', 0, 0.6 * wind - 0.15 * hit, 0);
      a.rot('head', -0.2 * wind + 0.25 * hit);
    }
  }
}

function spawnBug(a: CreatureAnimator, flying: boolean): void {
  const u = a.spawnT;
  const R = a.hipY;
  const H = a.info.height;
  if (a.style.spawn === 'drop' || flying) {
    // Lowers from the dark on a thread (or drops in on its wings), legs folded, then spreads them and lands.
    const d = dropFall(u, 0.55);
    a.body(0, d.y * H * 4, 0, 0, d.y * 0.8, 0);
    const curl = 1 - ramp(u, 0.4, 0.6);
    a.ikW *= 1 - curl;
    for (let i = 0; i < 4; i++) {
      a.rotS(`leg${i}L`, 'L', 0, 0, 0.9 * curl);
      a.rotS(`leg${i}R`, 'R', 0, 0, 0.9 * curl);
      a.rotS(`knee${i}L`, 'L', 0, 0, -1.2 * curl);
      a.rotS(`knee${i}R`, 'R', 0, 0, -1.2 * curl);
    }
    if (!flying) a.body(0, -0.25 * R * d.crouch, 0);
    return;
  }
  // Digs up out of the floor.
  const depth = riseDepth(u);
  a.body(0, -depth * (H + R), 0, -0.5 * depth * (1 - ramp(u, 0.7, 1)), Math.sin(u * 20) * 0.1 * (1 - u));
  a.ikW = ramp(u, 0.6, 0.9);
}

function deathBug(a: CreatureAnimator, flying: boolean): void {
  const u = a.deathT;
  const R = a.hipY;
  const B = a.info.height - R;
  const twitch = (1 - ramp(u, 0.3, 0.9)) * Math.sin(a.t * 30);
  // Legs curl in under the body as the nerves give.
  const curl = ramp(u, 0.1, 0.6);
  // A flyer's legs were already hanging free; a walker's let go of the floor.
  a.ikW = flying ? 0 : 1 - ramp(u, 0, 0.25);
  if (flying) {
    // The hanging-leg pose it flew with lets go as the legs curl.
    const hang = 1 - curl;
    for (let i = 0; i < 4; i++) {
      a.rotS(`leg${i}L`, 'L', (0.2 * i - 0.2) * hang, 0, -0.5 * hang);
      a.rotS(`leg${i}R`, 'R', (0.2 * i - 0.2) * hang, 0, -0.5 * hang);
      a.rotS(`knee${i}L`, 'L', 0, 0, -0.6 * hang);
      a.rotS(`knee${i}R`, 'R', 0, 0, -0.6 * hang);
    }
  }
  for (let i = 0; i < 4; i++) {
    const tw = twitch * (i % 2 ? 0.15 : -0.15);
    a.rotS(`leg${i}L`, 'L', tw, 0, -0.5 * curl);
    a.rotS(`leg${i}R`, 'R', -tw, 0, -0.5 * curl);
    a.rotS(`knee${i}L`, 'L', 0, 0, -1.3 * curl);
    a.rotS(`knee${i}R`, 'R', 0, 0, -1.3 * curl);
  }
  for (const n of ['wingL', 'wingR', 'wingL2', 'wingR2']) a.rotS(n, n.startsWith('wingL') ? 'L' : 'R', 0, -0.3 * curl, 0.3 * curl);
  a.rotS('mandL', 'L', 0, 0.5 * curl, 0);
  a.rotS('mandR', 'R', 0, 0.5 * curl, 0);
  const thick = 0.4 * B;
  if (a.style.death === 'flip' || flying) {
    // Over onto its back.
    const f = clamp01((u - 0.1) / 0.5);
    // Eased in and out, so the shell settles rather than stopping dead.
    const e = f * f * (3 - 2 * f);
    const roll = a.fallDir * Math.PI * e;
    const hop = Math.sin(Math.PI * f) * 0.6 * R;
    const cr = Math.cos(roll);
    // Body centre ends a carapace's depth above the floor, belly up; a flyer
    // starts from its hover height (the hover adds 1.6 R above the hips).
    // The height eases down with the roll, with no corner half way over.
    const start = flying ? R * 2.6 : R;
    const want = thick + (start - thick) * (flying ? 1 - f * f : 0.5 + 0.5 * Math.cos(Math.PI * e));
    a.body(Math.sin(roll) * R * 0.6, want - R * cr + hop * (flying ? 0 : 1) + thud(u, 0.6) * R, 0, 0, a.fallYaw, roll);
    a.rot('abdomen', 0.2 * curl);
  } else {
    // Sags flat, legs splayed out.
    const drop = ramp(u, 0.1, 0.55);
    a.body(0, (thick - R) * drop + thud(u, 0.55) * R, 0, 0.05 * drop, a.fallYaw * 0.4, 0.1 * a.fallDir * drop);
    a.rot('abdomen', -0.15 * drop);
    a.rot('head', 0.2 * drop);
  }
}
