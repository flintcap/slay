import os
os.chdir('/home/user/slay/.claude/worktrees/agent-aedee960455f6423c')
p='src/world/DungeonBuilder.ts'
s=open(p).read()
def rep(a,b):
    global s
    assert a in s, a[:80]
    s=s.replace(a,b,1)

rep("""import { worldSurface, WORLD_ENV_ATTRIBUTE, type WorldSurfaceOpts } from '../art/WorldSurface';""",
"""import { worldSurface, WORLD_ENV_ATTRIBUTE, type WorldSurfaceOpts } from '../art/WorldSurface';
import { liquidSurface, type LiquidSurface, type LiquidStyle } from '../art/Liquids';
import { Drips, type DripSite } from './Ambience';""")

rep("""  private poolMesh: THREE.InstancedMesh | null = null;""","""  private poolMesh: THREE.InstancedMesh | null = null;
  /** The level's animated liquid, if it has any liquid tiles. */
  private liquid: LiquidSurface | null = null;
  private drips: Drips | null = null;""")

rep("""    const liquidMat = this.makeLiquidMaterial();""","""    const liquidMat = this.makeLiquidMaterial();
    // Where drops fall and where lava throws light, gathered while emitting.
    const dripSites: DripSite[] = [];
    const hotTiles: Array<{ x: number; y: number; h: number }> = [];""")

rep("""            if (v === T_WATER || v === T_LAVA) {
              surfs[LIQ].flat(wx, hy + 0.13, wz, HALF, true, x % 4, y % 4, 1);
            }""","""            if (v === T_WATER || v === T_LAVA) {
              surfs[LIQ].flat(wx, hy + 0.13, wz, HALF, true, x % 4, y % 4, 1, this.shoreContact(x, y, v));
              if (v === T_LAVA || art.liquid === 'voidwater') hotTiles.push({ x, y, h: hy });
            }

            // Drips: off the ceiling into the water and the puddles below it.
            if (wetDrips && (v === T_WATER || (art.puddles > 0 && hashTile(x, y, level.seed ^ 0x51) % 11 === 0))) {
              if (hashTile(x, y, level.seed ^ 0xd1) % 3 === 0) {
                const top = art.ceiling === 'vault' || art.ceiling === 'broken' ? hy + ceilY : hy + wallH;
                dripSites.push({
                  x: wx + ((hashTile(x, y, 7) % 100) / 100 - 0.5) * 1.4,
                  z: wz + ((hashTile(x, y, 9) % 100) / 100 - 0.5) * 1.4,
                  floor: v === T_WATER ? hy + 0.13 : hy,
                  top,
                });
              }
            }""")

rep("""    let maxStep = 0;
    for (let i = 0; i < this.heights.length; i++) maxStep = Math.max(maxStep, this.heights[i]);""","""    // Only damp places drip, and only where there is a ceiling to drip from.
    const wetDrips =
      art.ceiling !== 'open' &&
      (art.liquid === 'water' || art.liquid === 'sludge') &&
      (art.wetness ?? art.puddles) >= 0.2;
    let maxStep = 0;
    for (let i = 0; i < this.heights.length; i++) maxStep = Math.max(maxStep, this.heights[i]);""")

# after chunk loop ends: method end of buildStatic. Find the end marker: the closing of buildStatic before makeLiquidMaterial
rep("""        this.chunks.push({ group, center: centre, radius: CHUNK * TILE_SIZE * 0.75 });
        this.root.add(group);
      }
    }
  }
""","""        this.chunks.push({ group, center: centre, radius: CHUNK * TILE_SIZE * 0.75 });
        this.root.add(group);
      }
    }

    if (dripSites.length > 0) {
      this.drips = new Drips(dripSites, art.liquidColor === 0 ? 0x9fc0d0 : art.liquidColor);
      this.root.add(this.drips.root);
    }
    this.addHeatLights(hotTiles);
  }

  /**
   * Lava and void pools light the room around them.
   *
   * The pool is emissive and blooms, but on its own it lit nothing: the walls
   * beside a lava river stayed as dark as the walls beside a puddle. Each
   * cluster of hot tiles becomes a record in the torch pool, so the nearest
   * ones get real lights as the player walks past and the rest still throw a
   * soft additive glow on the floor. No flame mesh, a slow heavy flicker.
   */
  private addHeatLights(hot: Array<{ x: number; y: number; h: number }>): void {
    if (hot.length === 0) return;
    const CELL = 5;
    const cells = new Map<string, { sx: number; sy: number; sh: number; n: number }>();
    for (const t of hot) {
      const k = `${Math.floor(t.x / CELL)},${Math.floor(t.y / CELL)}`;
      let c = cells.get(k);
      if (!c) {
        c = { sx: 0, sy: 0, sh: 0, n: 0 };
        cells.set(k, c);
      }
      c.sx += t.x;
      c.sy += t.y;
      c.sh += t.h;
      c.n++;
    }
    const colour = new THREE.Color(this.art.liquidEmissive || this.art.liquidColor);
    let i = 0;
    for (const c of cells.values()) {
      if (c.n < 3) continue;
      const x = c.sx / c.n;
      const y = c.sy / c.n;
      this.torches.push({
        pos: new THREE.Vector3(this.tileX(x), c.sh / c.n + 1.1, this.tileZ(y)),
        color: colour.clone(),
        intensity: 4 + Math.min(4, c.n * 0.25),
        distance: 9 + Math.min(5, c.n * 0.3),
        flicker: 0.45,
        flameMesh: -1,
        flameIndex: -1,
        phase: (i++ * 7.31) % 100,
      });
    }
  }

  /**
   * Shore contact for a liquid tile's four corners, in `Surf.flat` order: how
   * much of the bank each corner touches. Drives froth on water and the cooled
   * crust at the edge of lava.
   */
  private shoreContact(x: number, y: number, self: number): number[] {
    const bank = (tx: number, ty: number): number => (this.tile(tx, ty) === self ? 0 : 1);
    const out: number[] = [];
    for (const [dx, dz] of FLAT_CORNERS) {
      const a = bank(x + dx, y);
      const b = bank(x, y + dz);
      const c = bank(x + dx, y + dz);
      out.push(a > 0 && b > 0 ? 1 : Math.min(1, (a + b + c) * 0.5));
    }
    return out;
  }
""")

# replace makeLiquidMaterial body
start=s.index("  private makeLiquidMaterial(): THREE.Material {")
end=s.index("  /**\n   * Contact occlusion at the four corners")
s=s[:start]+"""  private makeLiquidMaterial(): THREE.Material {
    const art = this.art;
    // A biome whose liquid is 'none' can still have the odd water tile.
    const style: LiquidStyle = art.liquid === 'none' ? 'water' : art.liquid;
    this.liquid = liquidSurface(style, art.liquidColor, art.liquidEmissive);
    return this.liquid.material;
  }

"""+s[end:]

rep("""    this.updateLights(dt, elapsed, focus);
    this.updateFlames(elapsed, focus);""","""    this.updateLights(dt, elapsed, focus);
    this.updateFlames(elapsed, focus);
    this.liquid?.update(elapsed);
    this.drips?.update(dt, focus);""")

rep("""    for (const g of this.ownedGeo) g.dispose();
    for (const m of this.ownedMat) m.dispose();""","""    this.liquid?.dispose();
    this.liquid = null;
    this.drips?.dispose();
    this.drips = null;
    for (const g of this.ownedGeo) g.dispose();
    for (const m of this.ownedMat) m.dispose();""")
open(p,'w').write(s)
