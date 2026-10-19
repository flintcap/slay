/**
 * SLAY — credits and licences, for Settings, About.
 *
 * Read from the sources themselves, so the page can never drift from what
 * ships: the asset table in ASSETS.md (every CC0 texture, sound and song, by
 * author and site) and the licence files of three.js and the four typefaces
 * from their npm packages. Loaded only when the About tab opens.
 */
import assetsMd from '../../ASSETS.md?raw';
import threeLicence from '../../node_modules/three/LICENSE?raw';
import interLicence from '../../node_modules/@fontsource-variable/inter/LICENSE?raw';
import alegreyaLicence from '../../node_modules/@fontsource-variable/alegreya/LICENSE?raw';
import cinzelLicence from '../../node_modules/@fontsource-variable/cinzel/LICENSE?raw';
import monoLicence from '../../node_modules/@fontsource-variable/jetbrains-mono/LICENSE?raw';
import { div, span } from './Widgets';
import { tr } from '../core/I18n';

interface AssetGroup {
  author: string;
  site: string;
  kinds: Set<string>;
  count: number;
}

/** Rows of the ASSETS.md table, grouped by who made them and where they came from. */
function assetGroups(): { groups: AssetGroup[]; total: number } {
  const byKey = new Map<string, AssetGroup>();
  let total = 0;
  for (const line of assetsMd.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const [, path, source, author] = cells;
    if (!path || !source || !author || path === 'Path' || path.startsWith('---')) continue;
    const file = path.replace(/`/g, '');
    let site = source;
    try {
      site = new URL(source).hostname.replace(/^www\./, '');
    } catch {
      /* not a link: keep it as written */
    }
    const kind = file.startsWith('music/') ? 'music' : file.startsWith('sounds/') ? 'sounds' : 'textures';
    const key = `${author}|${site}`;
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { author, site, kinds: new Set(), count: 0 }));
    g.kinds.add(kind);
    g.count++;
    total++;
  }
  const groups = [...byKey.values()].sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
  return { groups, total };
}

/** The copyright line at the top of a font package's licence file. */
function fontCopyright(text: string): string {
  const first = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  // "Copyright ... Authors (url) Name-Italic[wght].ttf: Copyright ..." names the italic file too; once is enough.
  return first.replace(/\s+\S+\.ttf:.*$/, '').trim();
}

/** The SIL OFL text itself, from the first separator on. */
function oflText(text: string): string {
  const i = text.indexOf('-----');
  return i >= 0 ? text.slice(i).trim() : text.trim();
}

function licence(title: string, body: string): HTMLDetailsElement {
  const d = document.createElement('details');
  d.className = 'cr-lic';
  const s = document.createElement('summary');
  s.textContent = title;
  const pre = document.createElement('pre');
  pre.textContent = body;
  d.append(s, pre);
  return d;
}

/** Fills `into` with the credits and the licence texts. */
export function renderCredits(into: HTMLElement): void {
  // i18n-ignore-start: names of typefaces and the people who made them.
  const fonts = [
    ['Inter', 'Rasmus Andersson', interLicence],
    ['Alegreya', 'Juan Pablo del Peral, Huerta Tipográfica', alegreyaLicence],
    ['Cinzel', 'Natanael Gama', cinzelLicence],
    ['JetBrains Mono', 'JetBrains', monoLicence],
  ] as const;
  // i18n-ignore-end

  const made = div('cr-block');
  made.append(
    div('stg-group', tr('Made with')),
    div('cr-line', tr('The models, animation, effects and every map are built in code for this game.')),
    div('cr-line', tr('three.js, the 3D engine, by the three.js authors. MIT licence.')),
  );
  into.appendChild(made);

  const type = div('cr-block');
  type.appendChild(div('stg-group', tr('Typefaces')));
  for (const [name, by] of fonts) {
    const r = div('cr-row');
    r.append(span('cr-name', name), span('cr-by', tr('{0}. SIL Open Font Licence 1.1.', by)));
    type.appendChild(r);
  }
  into.appendChild(type);

  const { groups, total } = assetGroups();
  const art = div('cr-block');
  art.append(
    div('stg-group', tr('Textures, sounds and music')),
    div('cr-line', tr('{0} files, every one CC0: given to the public domain by the people below. Thank you.', total)),
  );
  for (const g of groups) {
    const r = div('cr-row');
    r.append(span('cr-name', g.author), span('cr-by', tr('{0} from {1} ({2})', [...g.kinds].join(', '), g.site, g.count)));
    art.appendChild(r);
  }
  into.appendChild(art);

  const lic = div('cr-block');
  lic.appendChild(div('stg-group', tr('Licences')));
  lic.appendChild(licence(tr('three.js: MIT licence'), threeLicence.trim()));
  lic.appendChild(
    licence(
      tr('Typefaces: SIL Open Font Licence 1.1'),
      `${fonts.map(([name, , text]) => `${name}: ${fontCopyright(text)}`).join('\n')}\n\n${oflText(interLicence)}`,
    ),
  );
  lic.appendChild(
    licence(
      tr('Textures, sounds and music: CC0 1.0'),
      tr('CC0 1.0 Universal (public domain dedication).\nThe people who made these files gave up all their rights in them, worldwide.\nYou can copy, change and share them, even for money, without asking.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\nEvery file, with its source page and author, is listed in ASSETS.md.'),
    ),
  );
  into.appendChild(lic);
}
