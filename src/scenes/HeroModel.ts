import * as THREE from 'three';
import type { Character, CharClassId, EquipSlot, Item, ItemRarity } from '../types';
import { Random } from '../core/RNG';
import { buildItemModel } from '../art/ItemModels';
import { compactModel } from '../art/ModelBudget';
import { buildHero, setHeroHidden, type HeroModel as HeroBody } from '../art/hero/Hero';
import { playSkin } from '../art/hero/Body';
import { HERO_LOOKS } from '../art/hero/Looks';
import { wearArmour, removeArmour, type WornArmour } from '../art/hero/Armour';
import { CapeCloth } from '../art/hero/CapeCloth';
import { holdItem, weaponGrip } from '../art/hero/Hold';
import { dressOutfit } from '../art/items/Outfit';
import { BowString } from '../art/items/BowString';

export { weaponGrip };
import { HeroAnimator, type OffHand } from '../art/hero/Animator';
import { FormBody } from '../art/hero/forms/FormBody';
import type { BeastForm } from '../art/hero/forms/BeastBody';
import { getBase } from '../sim/Loot';
import { CLASSES } from '../data/classes';
import { FIELD_KIT } from './FieldKit';
import { castsPlainShadow, mergeShadowParts, shadowBodyMaterial, shadowLod } from '../core/ShadowBodies';

/**
 * The one place the game builds a hero: body, worn armour, held weapons and
 * the animator, for play, the paperdoll and the front-end screens alike.
 *
 * The bare class body is a body in underwear: what a character looks like is
 * decided by its equipment. That is right in play and wrong on a class select
 * screen, where the player is choosing a fantasy. So a class preview wears a
 * "field kit" that says what the class is, and a roster preview wears the
 * character's real gear, exactly as it will walk into town.
 */

/** Slots that put geometry on the body. Rings and amulets show nothing at play distance. */
export const VISUAL_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'legs', 'boots', 'belt'];

/** What a slot holds, as far as its looks go. */
export type Piece = Pick<Item, 'baseId' | 'rarity'> & Partial<Pick<Item, 'uid' | 'upgrade' | 'uniqueId' | 'setId'>>;

/** What the off hand's item does to the stance. */
function offHandKind(category: string | undefined): OffHand {
  switch (category) {
    case 'shield':
      return 'shield';
    case 'dagger':
      return 'dagger';
    case 'sword':
    case 'axe':
    case 'mace':
    case 'wand':
    case 'scepter':
      return 'weapon';
    case 'orb':
      return 'focus';
    default:
      return 'none';
  }
}

const _hand = new THREE.Vector3();

interface Held {
  key: string;
  /** Armour grown on the body, or a model in a socket. */
  worn?: WornArmour;
  model?: THREE.Object3D;
}

/** A dressed, animated hero. Add `root` to the scene (or to a mover). */
export class DressedHero {
  readonly body: HeroBody;
  readonly root: THREE.Group;
  readonly animator: HeroAnimator;
  /** Rig bones by name. */
  readonly bones: Record<string, THREE.Bone>;
  private held = new Map<EquipSlot, Held>();
  /** The held bow's string, drawn by the string hand while shooting. */
  private bowString: BowString | null = null;
  private rng: Random;
  /** Set glow and auras (`items/Outfit.ts`), and the set pieces they were made for. */
  private outfit: THREE.Object3D[] = [];
  private outfitKey = '';
  /** The man's parts his gear hides, kept so a beast form can give them back. */
  private ownHidden = new Set<string>();
  /** A Shapeshifter's beast bodies (`art/hero/forms/`), made on first need. */
  private formBody: FormBody | null = null;
  /** Shadow bodies are on (`useShadowBodies`), and what the current ones were made from. */
  private shadowOn = false;
  private shadowKey = '';
  private shadowBodies: THREE.Mesh[] = [];
  /** The cape as cloth (`useCloth`), made with the first cape worn. */
  private clothOn = false;
  private capeCloth: CapeCloth | null = null;

  constructor(
    readonly classId: CharClassId,
    seed = 1,
  ) {
    this.rng = new Random(seed);
    this.body = buildHero(HERO_LOOKS[classId] ?? HERO_LOOKS.warden, classId);
    this.root = this.body.root;
    this.bones = this.body.rig.bones as unknown as Record<string, THREE.Bone>;
    this.animator = new HeroAnimator(this.bones);
  }

  /**
   * Wears and holds exactly `pieces`. Only slots whose item changed are
   * rebuilt, so calling this on every stat refresh costs nothing. True when
   * anything changed.
   */
  dress(pieces: Partial<Record<EquipSlot, Piece | null | undefined>>): boolean {
    let changed = false;
    // Rings and amulets show nothing, but they count toward a set's glow.
    const outfitKey = Object.entries(pieces)
      .map(([s, p]) => (p && (p.setId || p.uniqueId) ? `${s}:${p.uid ?? p.baseId}:${p.setId ?? p.uniqueId}` : ''))
      .join('|');
    for (const slot of VISUAL_SLOTS) {
      const p = pieces[slot];
      const key = p ? `${p.uid ?? ''}|${p.baseId}|${p.rarity}|${p.upgrade ?? 0}` : '';
      if ((this.held.get(slot)?.key ?? '') === key) continue;
      changed = true;
      this.clear(slot);
      if (!p) continue;
      try {
        this.held.set(slot, { key, ...this.put(slot, p) });
      } catch {
        // A missing visual must never break the run or blank a screen.
        this.held.set(slot, { key });
      }
    }
    if (changed || outfitKey !== this.outfitKey) this.relight(pieces, outfitKey);
    if (!changed) return false;
    const hides = new Set<string>();
    for (const h of this.held.values()) h.worn?.hides.forEach((k) => hides.add(k));
    setHeroHidden(this.body, hides);
    this.ownHidden = hides;
    this.formBody?.reapply(hides);
    // What is held picks the stance and the chain of blows.
    const main = pieces.mainHand ? getBase(pieces.mainHand.baseId) : undefined;
    const off = pieces.offHand ? getBase(pieces.offHand.baseId) : undefined;
    this.animator.setOffHand(offHandKind(off?.category));
    this.animator.setWeapon(weaponGrip(main?.category, main?.slot === 'twoHand'), main?.category);
    this.syncShadow();
    this.syncCloth();
    return true;
  }

  /**
   * Draws the cape as cloth that moves on the graphics card
   * (`art/hero/CapeCloth.ts`). Only the hero in play: a preview's cape swings
   * on its bones as before.
   */
  useCloth(): void {
    this.clothOn = true;
    this.syncCloth();
  }

  /** Moves the cloth on; call once a frame after the animator. */
  tickCloth(dt: number): void {
    this.capeCloth?.tick(dt);
  }

  /** Lets the string hand draw the bow; call once a frame after the animator. */
  tickBow(dt: number): void {
    const s = this.bowString;
    if (!s) return;
    const hand = this.body.rig.sockets.mainHand;
    hand.updateWorldMatrix(true, false);
    s.update(dt, hand.getWorldPosition(_hand), this.animator.fingerCurl('R'), this.animator.inAction);
  }

  /** Puts the cloth on the cape worn now, or takes it off. */
  private syncCloth(): void {
    if (!this.clothOn) return;
    let cape: THREE.SkinnedMesh | null = null;
    this.root.traverse((o) => {
      if (!cape && o.name === 'cape' && (o as THREE.SkinnedMesh).isSkinnedMesh) cape = o as THREE.SkinnedMesh;
    });
    if (cape && !this.capeCloth) this.capeCloth = new CapeCloth(this.body);
    this.capeCloth?.wear(cape);
  }

  /**
   * Casts the hero's shadow from shadow bodies (`core/ShadowBodies.ts`): the
   * body, its linens and its armour in one skinned geometry, and each held
   * item in one more, so the hero's shadow is a few draws, not one per part
   * (about twenty in a sun-lit map). Parts whose shadow a plain depth draw
   * would get wrong (two-sided cloth, see-through glows, the cape on its own
   * bones) keep casting their own. Only the player turns this on: it is
   * drawn in every shadow map every frame.
   */
  useShadowBodies(): void {
    this.shadowOn = true;
    this.syncShadow();
  }

  /**
   * Thins the face and hands to what shows at play distance (`playSkin`):
   * for the hero in the world, not the paperdoll or a portrait.
   */
  trimForPlay(): void {
    for (const o of this.root.children) {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.name.endsWith(':skin')) sm.geometry = playSkin(sm.geometry);
    }
    this.shadowKey = '';
    this.syncShadow();
  }

  /** Remakes the shadow bodies when what is shown or worn changed. */
  private syncShadow(): void {
    if (!this.shadowOn) return;
    const rig = this.body.rig;
    const root = rig.root;
    // Shown below `top` (whose own flag is left out: the whole hero hidden
    // for a moment must not undo the bodies).
    const shown = (o: THREE.Object3D, top: THREE.Object3D): boolean => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) {
        if (p === top) return true;
        if (!p.visible) return false;
      }
      return false;
    };
    // A part joins once it casts; joined parts cast nothing themselves, so
    // they are found again by their mark.
    const joins = (o: THREE.Object3D): o is THREE.Mesh =>
      !!(o as THREE.Mesh).isMesh && !o.userData.shadowOnly && (o.castShadow || !!o.userData.shadowJoined);
    const skin: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !joins(sm)) return;
      if (sm.skeleton !== rig.skeleton || sm.bindMode !== 'attached' || !sm.bindMatrix.equals(IDENTITY)) return;
      if (!castsPlainShadow(sm) || !shown(sm, root)) return;
      skin.push(sm);
    });
    const items: Array<{ model: THREE.Object3D; parts: THREE.Mesh[] }> = [];
    for (const h of this.held.values()) {
      if (!h.model || !shown(h.model, root)) continue;
      const parts: THREE.Mesh[] = [];
      h.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!joins(m) || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
        if (!castsPlainShadow(m) || !shown(m, h.model!) || movesOnItsOwn(m, h.model!)) return;
        parts.push(m);
      });
      if (parts.length > 1) items.push({ model: h.model, parts });
    }
    const key = [skin.map((m) => m.id).join(','), ...items.map((i) => i.parts.map((m) => m.id).join(','))].join('|');
    if (key === this.shadowKey) return;
    this.shadowKey = key;
    this.dropShadow();
    const cast = (parts: THREE.Mesh[], body: THREE.Mesh | null): void => {
      if (!body) return;
      body.name = 'hero:shadow';
      body.userData.shadowOnly = true;
      body.castShadow = true;
      body.receiveShadow = false;
      this.shadowBodies.push(body);
      for (const m of parts) {
        m.castShadow = false;
        m.userData.shadowJoined = true;
      }
    };
    if (skin.length > 1) {
      // Half the triangles: the hero's shadow is the largest on screen (the lantern throws it up the walls).
      const geo = mergeShadowParts(skin.map((m) => ({ geo: shadowLod(m.geometry, 0.5) })), true);
      let body: THREE.SkinnedMesh | null = null;
      if (geo) {
        body = new THREE.SkinnedMesh(geo, shadowBodyMaterial());
        // Limbs leave the bind pose's bounds, as the parts' own do.
        body.frustumCulled = false;
        root.add(body);
        body.bind(rig.skeleton, new THREE.Matrix4());
      }
      cast(skin, body);
    }
    for (const it of items) {
      it.model.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(it.model.matrixWorld).invert();
      const geo = mergeShadowParts(
        it.parts.map((m) => ({ geo: m.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) })),
        false,
      );
      let body: THREE.Mesh | null = null;
      if (geo) {
        body = new THREE.Mesh(geo, shadowBodyMaterial());
        it.model.add(body);
      }
      cast(it.parts, body);
    }
  }

  /** Takes the shadow bodies off; their parts cast their own again. */
  private dropShadow(): void {
    for (const b of this.shadowBodies) {
      b.removeFromParent();
      b.geometry.dispose();
    }
    this.shadowBodies = [];
    this.body.root.traverse((o) => {
      if (!o.userData.shadowJoined) return;
      o.castShadow = true;
      delete o.userData.shadowJoined;
    });
  }

  /** Lights set pieces for how complete their set is and puts on set and unique auras. */
  private relight(pieces: Partial<Record<EquipSlot, Piece | null | undefined>>, key: string): void {
    this.outfitKey = key;
    for (const o of this.outfit) {
      o.removeFromParent();
      // Glow twins draw on the armour's own (cached) geometry.
      if (!o.userData.sharedGeometry) (o as THREE.Points).geometry?.dispose();
    }
    this.outfit = [];
    const worn = new Map<EquipSlot, WornArmour>();
    for (const [slot, h] of this.held) if (h.worn) worn.set(slot, h.worn);
    try {
      this.outfit = dressOutfit(this.body, pieces, worn, (id) => getBase(id)?.visual);
    } catch {
      // Glow is dressing: never let it break a hero.
    }
  }

  /** Grows armour on the body, or puts a model in the right socket. */
  private put(slot: EquipSlot, p: Piece): Omit<Held, 'key'> {
    const base = getBase(p.baseId);
    const visual = base?.visual ?? { shape: 'auto', palette: 'metal.steel' };
    const worn = wearArmour(this.body, slot, p, visual);
    if (worn) return { worn };
    const model = compactModel(buildItemModel(visual, this.rng, p.rarity, p));
    model.traverse((o) => {
      // An aura's particles cast no shadow.
      o.castShadow = !o.userData.aura;
      // So a poison coat can glow on the blade and nowhere else.
      if (slot === 'mainHand' || slot === 'offHand') o.userData.weaponPart = true;
    });
    const rig = this.body.rig;
    if (base?.category === 'quiver') {
      rig.sockets.quiver.add(model);
      return { model };
    }
    const grip = weaponGrip(base?.category, base?.slot === 'twoHand');
    // A bow is held in the left hand; the right draws.
    const hand = grip === 'bow' ? 'offHand' : slot === 'offHand' ? 'offHand' : 'mainHand';
    const hold = base?.category === 'shield' || base?.category === 'crossbow' ? base.category : grip;
    const node = holdItem(rig, hand, model, hold);
    if (base?.category === 'bow') {
      this.bowString?.dispose();
      this.bowString = BowString.on(model);
    }
    // Tools find the weapon by the game slot it came from.
    node.parent!.userData.socketSlot = slot;
    return { model };
  }

  private clear(slot: EquipSlot): void {
    const h = this.held.get(slot);
    if (!h) return;
    this.held.delete(slot);
    if (h.worn) {
      removeArmour(h.worn);
      disposeTree(h.worn.object);
    }
    if (h.model) {
      if (this.bowString?.bow === h.model) {
        this.bowString.dispose();
        this.bowString = null;
      }
      const node = h.model.parent;
      if (node?.parent?.userData.socketSlot === slot) delete node.parent.userData.socketSlot;
      if (node && node.name.startsWith('hold:')) node.removeFromParent();
      else h.model.removeFromParent();
      disposeTree(h.model);
    }
  }

  /** The beast form shown (a Shapeshifter's), or null for the man. */
  get form(): BeastForm | null {
    return this.formBody?.form ?? null;
  }

  /** Turns the hero into a beast form, or back into the man with null. */
  setForm(form: BeastForm | null): void {
    if (!form && !this.formBody) return;
    this.formBody ??= new FormBody(this.body, this.animator);
    this.formBody.set(form, this.ownHidden);
    this.syncShadow();
  }

  /** Meshes the beast forms in idle time, so the first change costs no frame. */
  prewarmForms(): void {
    this.formBody ??= new FormBody(this.body, this.animator);
    this.formBody.prewarm();
  }

  /** Shown copies of the beasts' looks, for the scene's warm-up (`FormBody.standIns`). */
  formStandIns(): THREE.Object3D[] {
    this.formBody ??= new FormBody(this.body, this.animator);
    return this.formBody.standIns();
  }

  /** The form's swell and tail; call once a frame after the animator. */
  updateForm(dt: number): void {
    this.formBody?.update(dt);
  }

  /** Grows the beast past its own size (1 for none); eased in by `updateForm`. */
  setFormScale(k: number): void {
    if (this.formBody) this.formBody.extra = k;
  }

  /** The held or worn object for a slot, if any. */
  objectFor(slot: EquipSlot): THREE.Object3D | null {
    const h = this.held.get(slot);
    return h?.model ?? h?.worn?.object ?? null;
  }

  dispose(): void {
    this.dropShadow();
    this.capeCloth?.dispose();
    this.capeCloth = null;
    this.formBody?.dispose();
    for (const slot of [...this.held.keys()]) this.clear(slot);
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}

const IDENTITY = new THREE.Matrix4();

/** A part that turns or orbits on its own (`ModelBudget.ts` leaves these whole). */
function movesOnItsOwn(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    if (p.userData && (p.userData.orbit || p.userData.spin)) return true;
  }
  return false;
}

/**
 * Frees what a hero tree owns on the GPU. Meshed body parts are cached and
 * shared between heroes (`MeshCache.ts`) and cached materials are shared
 * between everything, so both are left alone.
 */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.cached) m.geometry.dispose();
    (o as THREE.SkinnedMesh).skeleton?.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) if (!mat.userData?.shared) mat.dispose();
  });
}

/** A hero for the front-end screens. */
export interface HeroModel {
  root: THREE.Group;
  animator: HeroAnimator;
  classId: CharClassId;
  dispose(): void;
}

function preview(classId: CharClassId, pieces: Partial<Record<EquipSlot, Piece>>, seed: number): HeroModel {
  const hero = new DressedHero(classId, seed);
  hero.dress(pieces);
  hero.animator.play('idle', { fade: 0 });
  // The screens turn and place this group; the body inside stays at its origin.
  const root = new THREE.Group();
  root.add(hero.root);
  return {
    root,
    animator: hero.animator,
    classId,
    dispose(): void {
      root.removeFromParent();
      hero.dispose();
    },
  };
}

/** Builds a class in its field kit. */
export function buildClassHero(classId: CharClassId): HeroModel {
  const pieces: Partial<Record<EquipSlot, Piece>> = {};
  for (const [slot, baseId] of Object.entries(FIELD_KIT[classId] ?? {}) as Array<[EquipSlot, string]>) {
    pieces[slot] = { baseId, rarity: 'rare' as ItemRarity };
  }
  return preview(classId, pieces, 0x5eed ^ (classId.length * 7919));
}

/** Builds a living character wearing exactly what it has equipped. */
export function buildCharacterHero(c: Character): HeroModel {
  const pieces: Partial<Record<EquipSlot, Piece>> = {};
  for (const slot of VISUAL_SLOTS) {
    const item = c.equipment[slot];
    if (item) pieces[slot] = item;
  }
  let seed = 0;
  for (let i = 0; i < c.id.length; i++) seed = (seed * 31 + c.id.charCodeAt(i)) >>> 0;
  return preview(c.classId, pieces, seed || 1);
}

/** The class accent as a number, for lights. */
export function classColor(classId: CharClassId): number {
  return CLASSES.find((c) => c.id === classId)?.color ?? 0xc9a227;
}

/** Which one-shot shows a class off best when it steps onto the plinth. */
export function flourishClip(classId: CharClassId): string {
  switch (classId) {
    case 'mage':
    case 'revenant':
      return 'cast';
    case 'ranger':
      return 'shoot';
    case 'paladin':
      return 'slam';
    default:
      return 'attack2';
  }
}
