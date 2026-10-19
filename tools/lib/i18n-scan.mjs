/**
 * Finds the text a player reads in the game's source, for the translation
 * layer (src/core/I18n.ts): `tools/i18n-extract.mjs` lists what is wrapped
 * in `tr()`/`trn()`/`trk()`, and `tools/check-i18n.mjs` fails on English left
 * unwrapped.
 *
 * "Text" is a string or template literal that reads like words (see
 * `isProse`) in a place that shows it, as against a place that uses it as a
 * name: a CSS class, a key code, an event name, a comparison, a log line for
 * developers. A line holding `i18n-ignore` (or the line above it) is skipped;
 * so are the lines between `i18n-ignore-start` and `i18n-ignore-end`, and a
 * file holding `i18n-ignore-file` near its top.
 */
import { parseAst } from 'rolldown/parseAst';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const SRC = path.join(ROOT, 'src');

/** Developer-only files, and the layer itself. */
export const SKIP_FILES = new Set([
  'core/I18n.ts',
  'core/Log.ts',
  'core/Report.ts',
  'core/DevTools.ts',
  'scenes/debug.ts',
  'scenes/shifterDebug.ts',
  'scenes/ShowcaseScene.ts',
]);

export function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(f);
    }
  };
  walk(SRC);
  return out.sort();
}

export function rel(file) {
  return path.relative(SRC, file).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// What reads like words
// ---------------------------------------------------------------------------

/** DOM key and code names: compared against, never shown as they are. */
const KEY_NAME =
  /^(Escape|Enter|Tab|Space|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Shift|Control|Alt|Meta|CapsLock|ContextMenu|Arrow(Up|Down|Left|Right)|F\d{1,2}|Key[A-Z]|Digit\d|Numpad\w*|Minus|Equal|Comma|Period|Slash|Semicolon|Quote|Backquote|Backslash|Bracket(Left|Right)|(Shift|Control|Alt|Meta)(Left|Right))$/;

/**
 * True when `s` reads like words a person would read. `{}` stands for a
 * template's gaps.
 */
export function isProse(s) {
  if (typeof s !== 'string') return false;
  const bare = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[#\w]+;/g, ' ')
    .replace(/(\{\}|\d+(\.\d+)?)(px|em|rem|ms|deg|vh|vw|fr|s)\b/g, ' ')
    .trim();
  if (!/[A-Za-z]{2}/.test(bare)) return false;
  if (KEY_NAME.test(s)) return false;
  // A canvas or CSS font: "italic 700 16px {}".
  if (/^(italic |oblique |bold |normal |small-caps )*(\d{3} )?(\{\}|\d+(\.\d+)?)px\b/.test(s.trim())) return false;
  // Addresses, files, colours, CSS.
  if (/^(https?:|data:|blob:|mailto:|\.{0,2}\/|#[0-9a-f]{3,8}\b)/i.test(s)) return false;
  if (/\.(png|webp|jpe?g|ogg|mp3|wav|json|m?js|ts|css|svg|woff2?|ktx2|txt|md|html)(\?.*)?$/i.test(s)) return false;
  if (/\b(rgba?|hsla?|var|calc|url|translate[XYZ3d]*|scale[XYZ3d]*|rotate[XYZ]?|cubic-bezier|linear-gradient|radial-gradient|conic-gradient|drop-shadow|blur|matrix)\(/.test(s)) return false;
  if (/[a-z-]+\s*:\s*[^;]+;/.test(s) && !/[.!?]\s/.test(s)) return false;
  if (/^[.#[][a-z]/i.test(s.trim()) && !/\s[a-z]+\s/.test(s)) return false;
  if (/:(not|is|where|has|hover|focus|focus-visible|disabled|checked|first-child|last-child|nth-child)\b/.test(s) && !/[.!?]\s/.test(s)) return false;
  if (/^\s*<(svg|path|g|circle|rect|line|polyline|polygon|ellipse|defs|use|symbol)\b/.test(s) && !/>[^<]*[A-Za-z]{3}[^<]*</.test(s)) return false;
  // Markup cut in pieces: attributes left over once whole tags are gone.
  if (/[a-z-]+="[^"]*"/.test(bare)) return false;
  // A class name and its modifiers: "row {}", "buff {}".
  if (/^[a-z][a-z0-9_-]*( \{\})+$/.test(bare)) return false;
  // One word: an id unless it starts with a capital and reads as a word.
  if (!/\s/.test(bare)) {
    const word = bare.replace(/^[^A-Za-z{]+/, '');
    if (/[A-Za-z]\{\}|\{\}[A-Za-z]/.test(word)) return false; // "Key{}", "{}Tip": built names
    if (!/^[A-Z][a-z'’]/.test(word.replace(/^\{\}/, ''))) return false;
    if (/[a-z][A-Z]/.test(word)) return false; // PascalCase, camelCase
    if (/[_.:/\\|]/.test(word.replace(/[.!?:]$/, ''))) return false; // ids
  } else {
    // Several words that are all lowercase-with-dashes ids: a CSS class list.
    const words = bare.split(/\s+/);
    if (words.every((w) => /^[a-z0-9_{}-]+$/.test(w)) && words.some((w) => /[-_]/.test(w))) return false;
    if (words.every((w) => /^[a-z]+[A-Z][A-Za-z]*$/.test(w) || /^[a-z]+\.[a-z.]+$/.test(w))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Where a string is shown, and where it is only a name
// ---------------------------------------------------------------------------

const COMPARE = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof']);

/** Methods whose string arguments are names, patterns or keys. */
const NAME_METHODS = new Set([
  'startsWith', 'endsWith', 'includes', 'indexOf', 'lastIndexOf', 'split', 'replace', 'replaceAll', 'match', 'matchAll',
  'search', 'querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById', 'getElementsByClassName',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'setProperty', 'getPropertyValue', 'removeProperty',
  'getItem', 'setItem', 'removeItem', 'createElement', 'createElementNS', 'getAttribute', 'hasAttribute',
  'removeAttribute', 'toggleAttribute', 'keyDown', 'keyUp', 'isDown', 'wasPressed', 'getContext', 'toLocaleString',
  'localeCompare', 'padStart', 'padEnd', 'supports', 'fork', 'stream', 'mark', 'measure', 'emit', 'on', 'off', 'once',
  'has', 'get', 'delete', 'set', 'note', 'warn', 'error', 'log', 'info', 'debug', 'trace', 'time', 'timeEnd',
  'assert', 'postMessage', 'define', 'play', 'playSfx', 'sfx', 'cue', 'loop', 'getObjectByName', 'getElementsByTagName',
  'matchMedia', 'insertRule', 'deleteRule',
]);
/** Functions and constructors whose string arguments are never shown. */
const NAME_FUNCS = new Set([
  'require', 'fetch', 'hashString', 'hashStr', 'hash', 'hashId', 'streamFor', 'Symbol', 'RegExp', 'URL', 'Error',
  'TypeError', 'RangeError', 'SyntaxError', 'logInfo', 'matchMedia', 'Random', 'seeded', 'Set', 'Map', 'WeakMap',
  'WeakSet', 'key', 'capLabel', 'Worker', 'Blob', 'File', 'Audio', 'Image', 'FontFace', 'CustomEvent', 'Event',
  'saveTextFile', 'BroadcastChannel', 'styleTag', 'injectStyle', 'addStyle', 'hookSeen',
]);
/** Calls that take a CSS class (or another name) in some positions. */
const NAME_ARGS = new Map(Object.entries({
  div: [0], span: [0], el: [0, 1], icon: [0], iconSvg: [0], section: [1, 2], goldChip: [1], emptyState: [1],
  classCrestSvg: [0, 1], setAttribute: [0],
}));
/** setAttribute names whose value is read by people (or a screen reader). */
const SHOWN_ATTRS = new Set(['title', 'aria-label', 'aria-description', 'aria-roledescription', 'placeholder', 'alt', 'data-tip']);
/** Object keys whose values are names, not text. */
export const NAME_KEYS = new Set([
  'id', 'key', 'code', 'cls', 'className', 'class', 'icon', 'iconName', 'sound', 'sfx', 'shape', 'palette', 'kind', 'type',
  'family', 'biome', 'tex', 'texture', 'anim', 'font', 'color', 'css', 'style', 'src', 'href', 'url', 'path', 'file',
  'mode', 'event', 'action', 'slot', 'stat', 'tag', 'variant', 'tone', 'rarity', 'scene', 'sceneId', 'element', 'school',
  'voice', 'music', 'track', 'clip', 'bone', 'part', 'material', 'look', 'seed', 'salt', 'stream', 'selector', 'query',
  'cut', 'glyph', 'svg', 'd', 'viewBox', 'fill', 'stroke', 'transform', 'easing', 'channel', 'layer', 'blend', 'mesh',
]);
/** Properties whose assigned value is a name or a style, not text. */
const NAME_PROPS = new Set([
  'className', 'id', 'cssText', 'font', 'fillStyle', 'strokeStyle', 'shadowColor', 'textAlign', 'textBaseline',
  'direction', 'globalCompositeOperation', 'filter', 'src', 'href', 'download', 'type', 'rel', 'key', 'code', 'cursor',
  'display', 'transform', 'background', 'color', 'width', 'height', 'lineCap', 'lineJoin', 'name', 'lang', 'dir',
  'fontKerning', 'letterSpacing', 'wordSpacing', 'role', 'htmlFor', 'value', 'accept', 'pattern', 'autocomplete',
]);

function calleeName(call) {
  const c = call.callee;
  if (!c) return '';
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed) return c.property.name ?? '';
  return '';
}
function memberChain(m) {
  const names = [];
  let n = m;
  while (n && n.type === 'MemberExpression') {
    if (!n.computed && n.property?.name) names.push(n.property.name);
    n = n.object;
  }
  if (n?.type === 'Identifier') names.push(n.name);
  return names;
}

export const WRAPPERS = new Set(['tr', 'trn', 'trk', 'trc']);

/**
 * Why the string `node` (with its ancestors, nearest last) is not shown, or
 * null when it is. `wrapped` when it already sits in tr()/trn()/trk().
 */
export function nameUse(node, stack) {
  const parent = stack[stack.length - 1];
  if (!parent) return 'top';
  // Inside a wrapper already: the key itself, or a value passed to one.
  for (let i = stack.length - 1; i >= 0; i--) {
    const a = stack[i];
    if (a.type === 'CallExpression' && WRAPPERS.has(calleeName(a))) {
      const keyArgs = calleeName(a) === 'trn' ? 3 : calleeName(a) === 'trc' ? 2 : 1;
      const child = stack[i + 1] ?? node;
      const idx = a.arguments.indexOf(child);
      if (idx >= 0 && idx < keyArgs) return 'wrapped';
      break;
    }
    if (/Function/.test(a.type)) break;
  }
  const t = parent.type;
  if (t === 'ImportDeclaration' || t === 'ExportNamedDeclaration' || t === 'ExportAllDeclaration' || t === 'ImportExpression') return 'module';
  if (t.startsWith('TS')) return 'type';
  if (t === 'ExpressionStatement' && parent.directive) return 'directive';
  if (t === 'TaggedTemplateExpression') return 'tagged';
  if ((t === 'Property' || t === 'PropertyDefinition' || t === 'MethodDefinition') && parent.key === node) return 'key';
  if (t === 'MemberExpression' && parent.property === node) return 'key';
  if (t === 'BinaryExpression' && COMPARE.has(parent.operator)) return 'compare';
  if (t === 'SwitchCase') return 'case';
  if (t === 'Property' && parent.value === node) {
    const k = parent.key?.name ?? parent.key?.value;
    if (NAME_KEYS.has(k)) return `key:${k}`;
  }
  if (t === 'AssignmentExpression' && parent.right === node && parent.left.type === 'MemberExpression') {
    const chain = memberChain(parent.left);
    if (chain.includes('style') || chain.includes('dataset')) return 'style';
    if (NAME_PROPS.has(chain[0])) return `prop:${chain[0]}`;
  }
  if (t === 'CallExpression' || t === 'NewExpression') {
    const name = calleeName(parent);
    const idx = parent.arguments.indexOf(node);
    if (idx >= 0) {
      if (parent.callee.type === 'MemberExpression') {
        const chain = memberChain(parent.callee);
        if (chain.includes('console') || chain.includes('classList') || chain.includes('Intl') || chain.includes('JSON')) return 'call';
      }
      if (name === 'setAttribute' && idx === 1) {
        const attr = parent.arguments[0];
        if (attr?.type === 'Literal' && SHOWN_ATTRS.has(attr.value)) return null;
        return 'attr';
      }
      if (NAME_ARGS.get(name)?.includes(idx)) return `arg:${name}`;
      const member = parent.callee.type === 'MemberExpression';
      if (member ? NAME_METHODS.has(name) : NAME_FUNCS.has(name)) return `call:${name}`;
    }
  }
  if (t === 'ArrayExpression') {
    const up = stack[stack.length - 2];
    if (up?.type === 'MemberExpression' && up.object === parent && ['includes', 'indexOf', 'some', 'find'].includes(up.property?.name)) return 'set';
    if (up?.type === 'NewExpression' && ['Set', 'Map', 'WeakSet', 'WeakMap'].includes(calleeName(up))) return 'set';
  }
  return null;
}

function literalText(n) {
  if (n?.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n?.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0].value.cooked ?? '';
  return null;
}

/**
 * The English plural trick `n === 1 ? '' : 's'`: `{ count, one, other }` (the
 * count expression and both branches' text), or null.
 */
export function pluralTrick(e) {
  if (e?.type !== 'ConditionalExpression' || e.test.type !== 'BinaryExpression') return null;
  const { operator: op, left, right } = e.test;
  const isOne = (x) => x.type === 'Literal' && x.value === 1;
  let count = null;
  let oneFirst = true;
  if (['===', '=='].includes(op) && (isOne(right) || isOne(left))) count = isOne(right) ? left : right;
  else if (['!==', '!='].includes(op) && (isOne(right) || isOne(left))) {
    count = isOne(right) ? left : right;
    oneFirst = false;
  } else if (op === '>' && isOne(right)) {
    count = left;
    oneFirst = false;
  } else if (op === '<=' && isOne(right)) count = left;
  if (!count) return null;
  const a = literalText(e.consequent);
  const b = literalText(e.alternate);
  if (a === null || b === null) return null;
  return oneFirst ? { count, one: a, other: b } : { count, one: b, other: a };
}

/**
 * Like `nameUse`, but also true when the string sits anywhere inside an
 * expression that is itself used as a name (`console.warn(cond ? 'a' : 'b')`,
 * `obj.name = \`x ${'y'}\``), up to the statement, function or wrapper call
 * that holds it.
 */
export function nameUseDeep(node, stack) {
  const own = nameUse(node, stack);
  if (own !== null) return own;
  for (let i = stack.length - 1; i > 0; i--) {
    const a = stack[i];
    if (!PASS_THROUGH.has(a.type) || (a.type === 'BinaryExpression' && a.operator !== '+')) break;
    const why = nameUse(a, stack.slice(0, i));
    if (why !== null && why !== 'wrapped') return why;
  }
  return null;
}
/** Expressions that hand a string inside them on as their own value. */
const PASS_THROUGH = new Set([
  'ConditionalExpression', 'LogicalExpression', 'BinaryExpression', 'TemplateLiteral', 'ParenthesizedExpression',
  'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'SequenceExpression',
]);

/**
 * Strips a node down to its text: a literal's value, a template's quasis with
 * `{}` gaps (a plural trick's gap reads as its plural branch).
 */
export function textOf(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') {
    let s = node.quasis[0].value.cooked ?? '';
    node.expressions.forEach((e, i) => {
      const p = pluralTrick(e);
      s += (p ? p.other : '{}') + (node.quasis[i + 1].value.cooked ?? '');
    });
    return s;
  }
  return null;
}

/**
 * Walks a file's syntax tree, calling `visit(node, stack)` on every node with
 * its ancestors.
 */
export function walk(ast, visit) {
  const stack = [];
  const go = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (visit(n, stack) === false) return;
    stack.push(n);
    for (const k in n) {
      if (k === 'start' || k === 'end' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) {
        for (const x of v) if (x && typeof x === 'object') go(x);
      } else if (v && typeof v === 'object' && typeof v.type === 'string') go(v);
    }
    stack.pop();
  };
  go(ast);
}

export function parse(src) {
  return parseAst(src, { lang: 'ts' });
}

/** Line starts, for turning an offset into a line number. */
export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** A predicate: is the string at `offset` on, or just under, an `i18n-ignore` line? */
export function ignoreMarks(src) {
  const lines = src.split('\n');
  const lineOf = lineIndex(src);
  const fileIgnored = lines.slice(0, 40).some((l) => l.includes('i18n-ignore-file'));
  const inBlock = [];
  let open = false;
  for (const l of lines) {
    if (l.includes('i18n-ignore-start')) open = true;
    inBlock.push(open);
    if (l.includes('i18n-ignore-end')) open = false;
  }
  return (offset) => {
    if (fileIgnored) return true;
    const n = lineOf(offset);
    if (inBlock[n - 1]) return true;
    return lines[n - 1].includes('i18n-ignore') || (n >= 2 && /\/\/.*i18n-ignore/.test(lines[n - 2]) && /^\s*\/\//.test(lines[n - 2]));
  };
}

/** Calls whose argument at this place is only ever text: `span(cls, text)`. */
const SHOWN_ARGS = new Map(Object.entries({ span: 1, div: 1, toast: 0 }));

/** True when `node` is passed straight to a call that shows it (so even "or" is text). */
function shownSlot(node, stack) {
  let child = node;
  let i = stack.length - 1;
  // Through `a ? 'last' : b` and `x || 'none'` to the call.
  while (i >= 0 && ((stack[i].type === 'ConditionalExpression' && stack[i].test !== child) || stack[i].type === 'LogicalExpression')) child = stack[i--];
  const p = stack[i];
  if (p?.type !== 'CallExpression') return false;
  const name = calleeName(p);
  return SHOWN_ARGS.has(name) && p.arguments.indexOf(child) === SHOWN_ARGS.get(name);
}

/**
 * The text left unwrapped in a file: `{ text, line, why }` for every prose
 * literal shown to the player and not in a wrapper.
 */
export function unwrapped(file, src = readFileSync(file, 'utf8')) {
  if (SKIP_FILES.has(rel(file))) return [];
  const ignored = ignoreMarks(src);
  const lineOf = lineIndex(src);
  const out = [];
  walk(parse(src), (n, stack) => {
    const text = textOf(n);
    if (text === null) return;
    if (!isProse(text) && !(shownSlot(n, stack) && /^\(?[a-z][a-z' ]+\)?[.!?:…]?$/.test(text.trim()))) return n.type === 'TemplateLiteral' ? undefined : false;
    if (nameUseDeep(n, stack) !== null || ignored(n.start)) return n.type === 'TemplateLiteral' ? undefined : false;
    out.push({ text, line: lineOf(n.start) });
    return n.type === 'TemplateLiteral' ? undefined : false;
  });
  return out;
}

/**
 * The keys a file passes to the wrappers: `{ text, plural?, context?, line }`,
 * plus `dynamic` calls whose key is not written out (translated elsewhere).
 */
export function wrappedKeys(file, src = readFileSync(file, 'utf8')) {
  const lineOf = lineIndex(src);
  const keys = [];
  const dynamic = [];
  walk(parse(src), (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !WRAPPERS.has(n.callee.name)) return;
    const fn = n.callee.name;
    const lit = (a) => (a?.type === 'Literal' && typeof a.value === 'string' ? a.value : a?.type === 'TemplateLiteral' && a.expressions.length === 0 ? a.quasis[0].value.cooked : null);
    if (fn === 'trn') {
      const one = lit(n.arguments[1]);
      const other = lit(n.arguments[2]);
      if (one === null || other === null) dynamic.push({ fn, line: lineOf(n.start) });
      else keys.push({ text: one, plural: other, line: lineOf(n.start) });
    } else if (fn === 'trc') {
      const context = lit(n.arguments[0]);
      const text = lit(n.arguments[1]);
      if (context === null || text === null) dynamic.push({ fn, line: lineOf(n.start) });
      else keys.push({ text, context, line: lineOf(n.start) });
    } else {
      const text = lit(n.arguments[0]);
      if (text === null) dynamic.push({ fn, line: lineOf(n.start) });
      else keys.push({ text, line: lineOf(n.start) });
    }
  });
  return { keys, dynamic };
}
