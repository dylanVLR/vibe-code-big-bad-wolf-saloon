/**
 * tools/build.js — bundle the ES modules in src/ into one classic script, app.js.
 *
 * WHY: the game is opened as a double-clicked file (file:// protocol), and
 * browsers block native ES-module imports over file://. This concatenates the
 * clean module source into a single plain <script> that runs anywhere (and is
 * also what gets deployed). index.html loads only the generated app.js.
 *
 * WORKFLOW: edit the modules under src/, then run:  node tools/build.js
 *
 * HOW: each module is wrapped in its own scope with a tiny CommonJS-style
 * require(). Imports are rewritten to require() calls keyed by the module's
 * BASENAME (e.g. `from '../math/par-sheet.js'` → `require("par-sheet")`), so the
 * folder layout is free to change without touching this bundler. Basenames must
 * stay unique across src/ (the build throws if two files share one).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ════════════════════════════════════════════════════════════════
   GAME-SIZE MANIFEST
   Walk the whole project, tally bytes per file type, and write the snapshot to
   src/panels/size-manifest.js. The in-game "GAME SIZE" popup reads that file, so
   its number is accurate as of the last `node tools/build.js`. (Hidden entries
   like .git/.DS_Store/.env are skipped — not game content.)
════════════════════════════════════════════════════════════════ */
const SIZE_CATEGORIES = [
  { key: 'video', label: 'Videos', exts: ['mp4', 'webm', 'mov', 'm4v', 'avi'] },
  { key: 'audio', label: 'Audio',  exts: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] },
  { key: 'image', label: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
  { key: 'code',  label: 'Code',   exts: ['js', 'css', 'html', 'htm', 'json', 'md', 'txt'] },
];
function categoryOf(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const c = SIZE_CATEGORIES.find(c => c.exts.includes(ext));
  return c ? c.key : 'other';
}
/**
 * "player" = files the browser actually loads at runtime (what ships to players):
 * index.html, the bundled app.js, styles.css and everything in assets/.
 * "dev" = source + tooling + docs only needed while developing / in gaff mode
 * (src/, tools/ incl. the simulator, docs/, README, package.json, netlify.toml…).
 */
function scopeOf(relPath) {
  const p = relPath.split('\\').join('/');
  if (p === 'index.html' || p === 'app.js' || p === 'styles.css') return 'player';
  if (p.startsWith('assets/')) return 'player';
  return 'dev';
}
/**
 * Load-phase split WITHIN the player build (what the browser actually fetches):
 *   "first" = pulled up front so the first spin is instant — the code, reel
 *      symbols, UI art, base music, core SFX, and the page/intro/spin/idle-wolf
 *      videos (everything flagged preload="auto").
 *   "lazy"  = streamed in after first paint or fetched on demand — the bonus
 *      cutscenes & music, frame-morph clips, bonus-reveal pigs, the SideWolf
 *      reaction clips, the narrator voice lines, and rare easter-egg media.
 * Mirrors the real behaviour in src/system/lazy-assets.js + the index.html
 * preload hints. Returns null for dev files (never fetched by the browser).
 */
const LAZY_FILES = new Set([
  'assets/webm/Wanted_poster.webm',          // reel-window backdrop (data-lazy-src)
  'assets/webm/Three_pigs_bonus_intro.webm', // bonus intro cutscene
  'assets/webm/Wolf_blowing_tornado.webm',   // bonus reveal cutscene
  'assets/webm/F1-straw.webm',               // frame-morph clips
  'assets/webm/F2-wood.webm',
  'assets/webm/F3-brick.webm',
  'assets/webm/High_noon_standoff.webm',     // rare noon easter egg (preload="none")
  'assets/audio/music/bgm_bonus.mp3',        // bonus music (preload="none")
]);
function loadPhaseOf(relPath) {
  const p = relPath.split('\\').join('/');
  if (scopeOf(p) !== 'player') return null;
  const base = p.split('/').pop();
  if (LAZY_FILES.has(p)) return 'lazy';
  if (p.startsWith('assets/audio/narrator/')) return 'lazy';  // voice lines — on demand
  if (base.startsWith('Sidewolf_')) return 'lazy';            // wolf reaction clips — on demand (.webm + .mp4)
  if (/^F[123]-/.test(base)) return 'lazy';                   // frame-morph clips (.webm + HEVC .mp4)
  if (base.startsWith('bonus_pig_')) return 'lazy';           // bonus reveal art
  if (p.startsWith('assets/splash/')) return 'lazy';          // PWA launch screens — only on install
  if (/^icon-\d/.test(base)) return 'lazy';                   // PWA / home-screen icons — not gameplay
  return 'first';                                             // everything else loads up front
}
function walkSizes(dir, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;           // skip hidden (.git, .env, .DS_Store…)
    const full = join(dir, e.name);
    if (e.isDirectory()) walkSizes(full, acc);
    else if (e.isFile()) {
      const { size } = statSync(full);
      const k = categoryOf(e.name);
      (acc.cats[k] ||= { bytes: 0, files: 0 });
      acc.cats[k].bytes += size; acc.cats[k].files += 1;
      acc.totalBytes += size;    acc.fileCount += 1;
      const rel = relative(root, full);
      const scope = scopeOf(rel);                    // player vs dev split
      acc[scope].bytes += size;  acc[scope].files += 1;
      const phase = loadPhaseOf(rel);                // first-play vs progressive (player only)
      if (phase === 'first')     { acc.firstPlay.bytes += size;    acc.firstPlay.files += 1; }
      else if (phase === 'lazy') { acc.progressive.bytes += size;  acc.progressive.files += 1; }
    }
  }
  return acc;
}
function generateSizeManifest() {
  const acc = walkSizes(root, {
    cats: {}, totalBytes: 0, fileCount: 0,
    player: { bytes: 0, files: 0 }, dev: { bytes: 0, files: 0 },
    firstPlay: { bytes: 0, files: 0 }, progressive: { bytes: 0, files: 0 },
  });
  const labelFor = k => (SIZE_CATEGORIES.find(c => c.key === k)?.label) || 'Other';
  const categories = Object.entries(acc.cats)
    .map(([key, v]) => ({ key, label: labelFor(key), bytes: v.bytes, files: v.files }))
    .sort((a, b) => b.bytes - a.bytes);
  const data = {
    totalBytes: acc.totalBytes,
    fileCount:  acc.fileCount,
    generatedAt: new Date().toISOString().slice(0, 10),
    player: acc.player,   // shipped to players (deployed to the web)
    dev:    acc.dev,      // dev/gaff-only tooling + source
    firstPlay:   acc.firstPlay,    // player files fetched up front (before first spin)
    progressive: acc.progressive,  // player files streamed in later / on demand
    categories,
  };
  writeFileSync(join(root, 'src', 'panels', 'size-manifest.js'),
    `/* AUTO-GENERATED by tools/build.js — folder-size snapshot. Do not edit. */\n` +
    `'use strict';\nexport const SIZE_MANIFEST = ${JSON.stringify(data, null, 2)};\n`);
  return data;
}
const sizeManifest = generateSizeManifest();   // must run BEFORE module discovery below

/* ════════════════════════════════════════════════════════════════
   SIDEWOLF CLIP LIST
   Discover every Sidewolf*.webm in assets/webm/ and write the list to
   src/scenes/sidewolf-clips.js. The side-wolf controller loops the default
   (Sidewolf.webm) then plays a random reaction from the rest — so dropping a
   new Sidewolf_*.webm in and rebuilding folds it into the rotation.
════════════════════════════════════════════════════════════════ */
function generateSidewolfClips() {
  const DEFAULT = 'Sidewolf.webm';
  let files = [];
  try { files = readdirSync(join(root, 'assets', 'webm')).filter(f => /^Sidewolf.*\.webm$/i.test(f)); } catch (e) {}
  const specials = files.filter(f => f !== DEFAULT).sort();
  const data = {
    default: 'assets/webm/' + DEFAULT,
    specials: specials.map(f => 'assets/webm/' + f),
  };
  writeFileSync(join(root, 'src', 'scenes', 'sidewolf-clips.js'),
    `/* AUTO-GENERATED by tools/build.js — SideWolf animation clips. Do not edit. */\n` +
    `'use strict';\nexport const SIDEWOLF = ${JSON.stringify(data, null, 2)};\n`);
  return data;
}
const sidewolfClips = generateSidewolfClips();   // also BEFORE module discovery

/* ════════════════════════════════════════════════════════════════
   MODULE DISCOVERY  —  every .js under src/, keyed by basename.
════════════════════════════════════════════════════════════════ */
const MODULES = {};   // basename -> absolute path
(function discover(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) discover(full);
    else if (e.name.endsWith('.js')) {
      const name = e.name.replace(/\.js$/, '');
      if (MODULES[name]) throw new Error(`Duplicate module basename "${name}" (${relative(root, full)} vs ${relative(root, MODULES[name])}). Basenames must be unique.`);
      MODULES[name] = full;
    }
  }
})(join(root, 'src'));
if (!MODULES['main']) throw new Error('src/main.js (entry point) not found');

/* Turn one ES-module source into a require()/exports factory body.
   Imports resolve to require("<basename>") regardless of the relative path. */
function transform(src) {
  const exported = [];
  const collect = /export\s+(?:async\s+function|function|const|class)\s+(\w+)/g;
  let m;
  while ((m = collect.exec(src))) exported.push(m[1]);

  const baseOf = spec => spec.replace(/^.*\//, '').replace(/\.js$/, '');

  let body = src
    .replace(/^\s*'use strict';\s*$/m, '')
    // named imports (may span multiple lines):  import { a, b } from '../x/y.js';
    .replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,
             (_, names, spec) => `const {${names}} = require(${JSON.stringify(baseOf(spec))});`)
    // side-effect imports:  import '../x/y.js';
    .replace(/import\s*['"]([^'"]+)['"];?/g,
             (_, spec) => `require(${JSON.stringify(baseOf(spec))});`)
    // drop the `export ` keyword (declarations stay as normal)
    .replace(/export\s+(?=(?:async\s+function|function|const|class)\b)/g, '');

  if (exported.length) body += `\nObject.assign(exports, { ${exported.join(', ')} });\n`;
  return body;
}

let out = `/* ════════════════════════════════════════════════════════════════
   AUTO-GENERATED — do not edit by hand.
   Bundled from src/ by tools/build.js so the game runs from a double-clicked
   file:// page (and on static hosts). Edit the modules under src/, then rebuild:
       node tools/build.js
════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const __cache = {};
  const __mods = {};
  function require(name) {
    if (__cache[name]) return __cache[name];
    const exports = {};
    __cache[name] = exports;       // set before running, to tolerate cycles
    __mods[name](exports, require);
    return __cache[name];
  }
`;

for (const [name, path] of Object.entries(MODULES)) {
  out += `\n  __mods[${JSON.stringify(name)}] = function (exports, require) {\n${transform(readFileSync(path, 'utf8'))}\n  };\n`;
}

out += `\n  require('main');\n})();\n`;

writeFileSync(join(root, 'app.js'), out);
const count = Object.keys(MODULES).length;
console.log(`Bundled ${count} modules from src/ → app.js`);
console.log(`Game size: ${(sizeManifest.totalBytes / 1048576).toFixed(1)} MB across ${sizeManifest.fileCount} files → src/panels/size-manifest.js`);
