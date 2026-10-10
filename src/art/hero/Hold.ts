/**
 * SLAY — putting a held item in a hero's hand.
 *
 * Items keep one contract: grip at the origin, business end along +Y, wide on
 * X, thin on Z. A hand socket's +Y already runs along the fist's grip out of
 * the thumb side, so most things are held at identity. The few that are held
 * differently get a turn on a child node of the socket here, so item models
 * never need to know who holds them.
 */
import * as THREE from 'three';
import type { HeroRig } from './Rig';

/** The extra turn for a grip, in the socket's frame. */
export function holdTurn(grip: string, slot: 'mainHand' | 'offHand'): THREE.Quaternion {
  const q = new THREE.Quaternion();
  switch (grip) {
    case 'dagger':
      // Reverse grip: point down out of the little-finger side, edge forward.
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      break;
    case 'shield':
      // Face out from the back of the forearm, top along the grip.
      q.setFromEuler(new THREE.Euler(0, slot === 'offHand' ? -Math.PI / 2 : Math.PI / 2, 0));
      break;
    default:
      break;
  }
  return q;
}

/** Holds `model` in a hand socket with the grip turn; returns the node it hangs on. */
export function holdItem(rig: HeroRig, slot: 'mainHand' | 'offHand', model: THREE.Object3D, grip: string): THREE.Object3D {
  const socket = rig.sockets[slot];
  const old = socket.getObjectByName(`hold:${slot}`);
  if (old) old.removeFromParent();
  const node = new THREE.Object3D();
  node.name = `hold:${slot}`;
  node.quaternion.copy(holdTurn(grip, slot));
  node.add(model);
  socket.add(node);
  return node;
}
