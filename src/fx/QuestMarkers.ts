/**
 * SLAY — the quest markers over people's heads: a yellow "?" for work to take,
 * a green "!" for work to hand in (`sim/QuestMarkers.ts` decides which).
 *
 * Each marker is a camera-facing sprite drawn after everything else with the
 * depth test off, so it reads over roofs and palisades from across the camp.
 * The glyph is bold with a dark rim and a soft glow baked into its texture,
 * and is drawn past tone mapping a little over white so the bloom catches it.
 * It bobs gently, and its bottom sits a clear gap over the top of the head,
 * hat included, so it never sinks into a brim.
 */
import * as THREE from 'three';
import type { QuestMarker } from '../sim/QuestMarkers';
import { FONT_DISPLAY } from '../ui/Fonts';

type Kind = Exclude<QuestMarker, null>;

const LOOK: Record<Kind, { glyph: string; fill: string; glow: string }> = {
  offer: { glyph: '?', fill: '#ffd23a', glow: 'rgba(255,196,40,0.95)' },
  turnIn: { glyph: '!', fill: '#5cff6e', glow: 'rgba(70,255,100,0.95)' },
};

/** World height of a marker, metres. */
const SIZE = 1.1;
/** Clear air between the top of the head and the bottom of the glyph. */
const GAP = 0.22;
/** Bob height and rate. */
const BOB = 0.07;
const BOB_RATE = 2.3;

function glyphTexture(kind: Kind): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  const { glyph, fill, glow } = LOOK[kind];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(S * 0.86)}px ${FONT_DISPLAY}`;
  const x = S / 2;
  const y = S / 2 + S * 0.04;
  // The glow, twice, then a dark rim so it reads on a bright sky or a fire.
  g.shadowColor = glow;
  g.shadowBlur = S * 0.16;
  g.fillStyle = fill;
  g.fillText(glyph, x, y);
  g.fillText(glyph, x, y);
  g.shadowBlur = 0;
  g.lineJoin = 'round';
  g.lineWidth = S * 0.075;
  g.strokeStyle = 'rgba(20,12,4,0.92)';
  g.strokeText(glyph, x, y);
  g.fillStyle = fill;
  g.fillText(glyph, x, y);
  // A lighter core gives it a lit, glassy face.
  g.globalCompositeOperation = 'source-atop';
  const sheen = g.createLinearGradient(0, S * 0.1, 0, S * 0.9);
  sheen.addColorStop(0, 'rgba(255,255,240,0.45)');
  sheen.addColorStop(0.5, 'rgba(255,255,240,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface Pin {
  sprite: THREE.Sprite;
  kind: Kind | null;
  phase: number;
}

/** One marker per spot, made on first need and reused. */
export class QuestMarkerLayer {
  readonly root = new THREE.Group();
  private mats = new Map<Kind, THREE.SpriteMaterial>();
  private pins = new Map<string, Pin>();

  constructor(parent: THREE.Object3D) {
    this.root.name = 'questMarkers';
    parent.add(this.root);
  }

  private material(kind: Kind): THREE.SpriteMaterial {
    let m = this.mats.get(kind);
    if (!m) {
      m = new THREE.SpriteMaterial({
        map: glyphTexture(kind),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      // A touch over white: the bloom pass lifts it into a glow.
      m.color.setScalar(1.35);
      this.mats.set(kind, m);
    }
    return m;
  }

  /**
   * Shows `kind` (or nothing) over the spot whose head top is `at`. Call it
   * every frame for every spot; `null` hides the spot's marker.
   */
  set(spot: string, kind: QuestMarker, at: THREE.Vector3 | null, elapsed: number): void {
    let pin = this.pins.get(spot);
    if (!kind || !at) {
      if (pin) pin.sprite.visible = false;
      return;
    }
    if (!pin) {
      const sprite = new THREE.Sprite(this.material(kind));
      sprite.renderOrder = 1000;
      sprite.frustumCulled = false;
      sprite.center.set(0.5, 0);
      sprite.scale.set(SIZE, SIZE, 1);
      sprite.name = `questMarker:${spot}`;
      this.root.add(sprite);
      pin = { sprite, kind, phase: this.pins.size * 1.7 };
      this.pins.set(spot, pin);
    }
    if (pin.kind !== kind) {
      pin.kind = kind;
      pin.sprite.material = this.material(kind);
    }
    const t = elapsed * BOB_RATE + pin.phase;
    const pulse = 1 + Math.sin(t * 0.5) * 0.04;
    pin.sprite.visible = true;
    pin.sprite.scale.set(SIZE * pulse, SIZE * pulse, 1);
    pin.sprite.position.set(at.x, at.y + GAP + (Math.sin(t) * 0.5 + 0.5) * BOB, at.z);
  }

  /** What each spot shows now, for checks and the debug hooks. */
  shown(): Record<string, Kind> {
    const out: Record<string, Kind> = {};
    for (const [spot, pin] of this.pins) if (pin.sprite.visible && pin.kind) out[spot] = pin.kind;
    return out;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.mats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.mats.clear();
    this.pins.clear();
  }
}
