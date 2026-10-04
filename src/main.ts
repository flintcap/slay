import { Engine } from './core/Engine';
import { save } from './core/Save';
import { events } from './core/Events';
import { TitleScene } from './scenes/TitleScene';
import { CharSelectScene } from './scenes/CharSelectScene';
import { TownScene } from './scenes/TownScene';
import { DungeonScene } from './scenes/DungeonScene';
import { DeathScene } from './scenes/DeathScene';
import { mountUI } from './ui/UIRoot';
import { audio } from './audio/Audio';

const bootFill = document.getElementById('boot-fill');
const bootStatus = document.getElementById('boot-status');
const bootEl = document.getElementById('boot');

function boot(pct: number, msg: string): void {
  if (bootFill) bootFill.style.width = `${Math.round(pct * 100)}%`;
  if (bootStatus) bootStatus.textContent = msg;
}

/** Yields to the browser so the boot bar actually paints between steps. */
function tick(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('missing #view canvas');

  boot(0.05, 'Reading the ledger of the fallen…');
  await tick();
  save.load();
  // Legacy perks apply to every character; the sim reads the account through this.
  const { bindLegacyAccount, legacyOf } = await import('./sim/Legacy');
  bindLegacyAccount(() => save.account);
  legacyOf(save.account);
  // Saves made before the starter-skill change load with a bar full of skills
  // at rank 0 and no way to attack; repair them in place.
  // Every hero on the roster, not just the live one: switching to a benched
  // character skipped this and handed back an unrepaired bar.
  {
    const { repairCharacter } = await import('./sim/Character');
    const heroes = new Set([...save.roster, ...(save.account.current ? [save.account.current] : [])]);
    for (const c of heroes) {
      try {
        if (repairCharacter(c)) save.touch();
      } catch (err) {
        console.error('[save] could not repair', c?.name, err);
      }
    }
  }

  // Accessibility (text size, colour-blind rarity colours, reduced motion,
  // rebound keys) before anything draws, and again whenever settings change.
  {
    const { applyAccessibility } = await import('./core/Access');
    applyAccessibility(save.settings);
    let palette = save.settings.colorBlindRarity;
    events.on('settings:changed', () => {
      applyAccessibility(save.settings);
      if (palette !== save.settings.colorBlindRarity) {
        palette = save.settings.colorBlindRarity;
        // Icons bake the rarity colour in; redraw them in the new palette.
        void import('./art/Icons').then((m) => m.clearIconCaches());
        events.emit('ui:refresh', {});
      }
    });
  }

  boot(0.18, 'Kindling the forge…');
  await tick();
  const engine = new Engine(canvas);
  engine.renderer.setQuality(save.settings.quality);

  boot(0.34, 'Weaving materials…');
  await tick();
  // Texture/material libraries build their atlases lazily on first scene entry;
  // touching them here front-loads the cost onto the boot bar instead of the
  // first frame of gameplay.
  const { warmMaterials } = await import('./art/Materials');
  await warmMaterials((p, label) => boot(0.34 + p * 0.36, label));

  // Teach the item-model builder how to find a base's authored visual. Done
  // here rather than inside art/ so the art layer keeps no compile-time
  // dependency on the item simulation.
  const [{ setItemVisualResolver, setDropColorResolver }, { getBase, itemLabelColor }] = await Promise.all([
    import('./art/ItemModels'),
    import('./sim/Loot'),
  ]);
  const { setIconBaseResolver } = await import('./art/Icons');
  setIconBaseResolver((baseId) => {
    try {
      return getBase(baseId);
    } catch {
      return undefined;
    }
  });
  setItemVisualResolver((item) => {
    try {
      return getBase(item.baseId)?.visual;
    } catch {
      return undefined;
    }
  });
  setDropColorResolver((item) => {
    try {
      return itemLabelColor(item);
    } catch {
      return undefined;
    }
  });

  // Set tooltips show progress against what the live character is wearing.
  const { setTooltipWearer } = await import('./sim/Loot');
  setTooltipWearer(() => save.account.current?.equipment ?? null);

  // Hand the world generator the real bestiary. Without this it falls back to
  // a structurally-valid placeholder catalogue whose ids match no real monster,
  // and every spawn is silently discarded at load time.
  const [
    { setMonsterCatalog },
    { MONSTERS, pickMonstersForDepth },
    { MONSTER_AFFIXES },
    { pickBossForDepth },
    { namedRaresFor },
  ] = await Promise.all([
      import('./world/DungeonGen'),
      import('./data/monsters'),
      import('./data/monsterAffixes'),
      import('./data/bosses'),
      import('./data/namedRares'),
    ]);
  setMonsterCatalog({
    pick: (depth, biome, rng, count) => {
      const picked = pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id);
      // Never hand back an empty pool — a floor with no monsters is worse than
      // a slightly off-theme one.
      if (picked.length === 0 && MONSTERS.length > 0) {
        for (let i = 0; i < count; i++) picked.push(rng.pick(MONSTERS).id);
      }
      return picked;
    },
    affixes: (depth, rng, count) => {
      const eligible = MONSTER_AFFIXES.filter((a) => a.minDepth <= depth);
      const pool = eligible.length ? eligible : MONSTER_AFFIXES;
      const out: string[] = [];
      const taken = new Set<string>();
      for (let i = 0; i < count && taken.size < pool.length; i++) {
        // Respect each affix's own exclusion list so packs stay coherent.
        const legal = pool.filter(
          (a) => !taken.has(a.id) && !(a.excludes ?? []).some((x) => taken.has(x))
        );
        if (legal.length === 0) break;
        const chosen = rng.weighted(legal, (a) => a.weight);
        taken.add(chosen.id);
        out.push(chosen.id);
      }
      return out;
    },
    bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
    // Which named rare, if any, could stand in for this monster here. World
    // generation must not import the bestiary, so the lookup comes in the same
    // way the monster pool does.
    nameFor: (monsterId, biome, depth, rng) => {
      const def = MONSTERS.find((m) => m.id === monsterId);
      if (!def) return null;
      const pool = namedRaresFor(def.family, monsterId, biome, depth);
      if (pool.length === 0) return null;
      return rng.weighted(pool, (n) => n.weight).id;
    },
  });

  boot(0.74, 'Tuning the instruments…');
  await tick();
  audio.init(save.settings);

  boot(0.84, 'Raising the town…');
  await tick();
  mountUI(engine);
  // The story layer: chapters, dialogue, contracts, boss voices, the journal.
  const { installStory } = await import('./ui/StoryOverlay');
  installStory();
  // Systems panels: loot filter, progression, town services.
  const { mountDepthUI } = await import('./ui/DepthUI');
  mountDepthUI();

  engine.register('title', () => new TitleScene(engine));
  engine.register('charSelect', () => new CharSelectScene(engine));
  engine.register('town', () => new TownScene(engine));
  engine.register('dungeon', () => new DungeonScene(engine));
  engine.register('death', () => new DeathScene(engine));

  // Art review only: a neutral studio for judging models and materials.
  const { ShowcaseScene } = await import('./scenes/ShowcaseScene');
  engine.register('boot', () => new ShowcaseScene(engine));

  boot(0.95, 'Opening the gate…');
  await tick();

  engine.start();
  await engine.goTo('title');

  // Tell the player if their save needed rescuing. Said once, after the UI
  // exists to show it.
  {
    const r = save.loadReport;
    if (r.source === 'backup') {
      events.emit('toast', { text: 'Your save was damaged. It was restored from the backup copy.', kind: 'bad' });
    } else if (r.primaryDamaged) {
      events.emit('toast', { text: 'Your save could not be read. A copy was kept; a new account was started.', kind: 'bad' });
    } else if (r.quarantined > 0) {
      events.emit('toast', { text: `${r.quarantined} damaged item${r.quarantined === 1 ? ' was' : 's were'} set aside from your save.`, kind: 'bad' });
    }
  }

  boot(1, 'Ready');
  if (bootEl) {
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 900);
  }

  // Expose for debugging and for the Playwright screenshot harness.
  const { installDebug } = await import('./scenes/debug');
  (window as unknown as Record<string, unknown>).SLAY = {
    engine,
    save,
    events,
    debug: installDebug(engine),
  };
}

main().catch((err) => {
  console.error(err);
  if (bootStatus) {
    bootStatus.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
    bootStatus.style.color = '#ff6b5a';
  }
});
