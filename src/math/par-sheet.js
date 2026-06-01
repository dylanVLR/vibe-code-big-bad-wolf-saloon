/**
 * @module par-sheet
 * @description Game configuration, symbol definitions, reel strip layouts,
 *              and shared constants for Big Bad Wolf.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  THIS FILE IS THE CANONICAL PAR SHEET (single source of truth for math).
 *  Human-readable summary + expected RTP decomposition lives in PARSHEET.md.
 *  Re-verify any change with:   node tools/sim.js
 *  Both the live game (src/main.js → modules) and the verifier import from here,
 *  so there is exactly ONE copy of these numbers.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Design target: ~97% RTP, high volatility (real "Big Bad Wolf" feel).
 *   • Base game  ≈ 49% RTP  (243-ways line wins ≈ 30% + the expanding Wolf Wild
 *                            ≈ 19%; line pays were scaled to 0.51× so the wild's
 *                            extra return doesn't push the total over target)
 *   • Bonus      ≈ 47% RTP  (wolf/house feature drives most of the return)
 *   • Bonus trigger ≈ 1 in 180 spins (6+ hard-hat scatters)
 *   Measured total ≈ 96.8% (high-variance bonus → ±~0.5% per sim run).
 */
'use strict';

/* ══════════════════════════════════════════
   NAMED CONSTANTS
══════════════════════════════════════════ */

/** Number of reels on the machine */
export const REEL_COUNT = 5;

/** Rows visible per reel */
export const ROWS_PER_REEL = 3;

/** Minimum consecutive reels for a ways-win */
export const MIN_WIN_SPAN = 3;

/** Number of scatter hats required to trigger the bonus */
export const BONUS_TRIGGER_HATS = 6;

/** Free spins awarded on bonus trigger */
export const FREE_SPINS_INITIAL = 6;

/** Hats needed during a free spin to retrigger +1 */
export const RETRIGGER_HATS = 3;

/** Maximum frame tier (brick/mansion) */
export const MAX_FRAME_TIER = 3;

/** Frame tier labels for display */
export const TIER_NAMES = ['', 'STRAW', 'STICK', 'BRICK'];

/** House emoji per tier for UI rendering */
export const TIER_EMOJIS = ['', '🏚️', '🏠', '🏰'];

/** Scroll symbols during normal spin animation */
export const SCROLL_SYMBOLS = 22;

/** Scroll symbols during turbo spin animation */
export const TURBO_SCROLL = 10;

/** Normal reel stop durations (ms) per reel index */
export const SPIN_DURATIONS = [620, 820, 1020, 1220, 1420];

/** Turbo reel stop durations (ms) per reel index */
export const TURBO_DURATIONS = [280, 360, 440, 520, 600];

/** Extra ms added to anticipation reels */
export const ANTICIPATION_EXTRA = 800;

/** Bet levels available to the player */
export const BET_LEVELS = [0.20, 0.50, 1.00, 2.00, 5.00, 10.00, 20.00, 50.00];

/** Default bet index (into BET_LEVELS) */
export const DEFAULT_BET_INDEX = 2;

/** Starting player balance */
export const DEFAULT_BALANCE = 1000.00;

/* ══════════════════════════════════════════
   RTP MODELS  (selectable math models)
   The RTP picker in the options drawer renders one card per entry here, so to
   add a new model you only add an object to this list — the UI updates itself.

   Right now there is a single model ("standard", ~97%) and its math lives in the
   REEL_COUNTS / BONUS_CONFIG / SYMBOLS tables below. A future model will carry its
   OWN math tables on its entry (e.g. model.reelCounts, model.bonusConfig) and the
   game will swap the active set when the player picks it.
══════════════════════════════════════════ */

export const RTP_MODELS = [
  {
    id:    'standard',
    label: 'Standard',
    rtp:   0.97,                         // 0–1; shown as a percentage
    scale: 1.00,                         // win-magnitude multiplier vs the canonical pays/awards
    blurb: 'High-volatility classic. A quiet base game with big, swingy bonus rounds.',
  },
  {
    id:    'lean',
    label: 'Lean',
    rtp:   0.85,
    scale: 0.880,                        // tuned so measured total ≈ 85% (rounding-adjusted)
    blurb: 'Same game, leaner pays — a lower 85% return for higher-margin placements.',
  },
];

/** Default selected RTP model id */
export const DEFAULT_RTP_MODEL = 'standard';

/** localStorage key for the player's chosen RTP model. */
export const RTP_MODEL_KEY = 'bbw_rtp_model';

/* ══════════════════════════════════════════
   SYMBOL DEFINITIONS  (PAYTABLE)
   pays[span] = per-WAY multiplier of the bet.
   Total cell payout = ways × pays[span] × bet  (243-ways, left-to-right).
══════════════════════════════════════════ */

export const SYMBOLS = {
  // ── PNG Image Symbols ──
  // Pays were scaled to 0.51× the pre-wild values: the expanding Wolf Wild adds a
  // big chunk of base RTP on its own, so the line pays come down to keep the base
  // game near ~49% (total ~97%). Re-verify any change with `node tools/sim.js`.
  'hat-yellow':     { id: 'hat-yellow',     src: 'assets/hat_yellow.webp',     label: 'Yellow Hat',    pays: { 3: 1.78, 4: 7.14, 5: 35.70 }, isHat: true },
  'hat-green':      { id: 'hat-green',      src: 'assets/hat_white.webp',      label: 'White Hat',     pays: { 3: 0.89, 4: 3.57, 5: 17.85 }, isHat: true },
  'hat-red':        { id: 'hat-red',        src: 'assets/hat_red.webp',        label: 'Red Hat',       pays: { 3: 0.71, 4: 2.86, 5: 14.28 }, isHat: true },
  'pig-suit':       { id: 'pig-suit',       src: 'assets/sheriff_badge.webp',   label: 'Sheriff Badge',  pays: { 3: 1.43, 4: 5.36, 5: 26.52 } },
  'pig-contractor': { id: 'pig-contractor', src: 'assets/horseshoe.webp',    label: 'Horseshoe',   pays: { 3: 1.07, 4: 4.28, 5: 21.42 } },
  'pig-nature':     { id: 'pig-nature',     src: 'assets/tornado.webp',  label: 'Tornado', pays: { 3: 0.71, 4: 2.86, 5: 14.28 } },
  'toolbox':        { id: 'toolbox',        src: 'assets/shotglass.webp',        label: 'Wood Pig',       pays: { 3: 0.61, 4: 2.50, 5: 12.24 } },
  'wolf':           { id: 'wolf',           src: 'assets/wolf.webp',           label: 'Wolf',          pays: { 3: 0.46, 4: 1.79, 5: 8.67 } },
  'buzzard':        { id: 'buzzard',        src: 'assets/buzzard.webp',        label: 'Buzzard',       pays: { 3: 0.36, 4: 1.43, 5: 7.14 } },

  // ── WOLF WILD (expanding) ──
  // Lands only on reels 2-4. When one lands it fills its whole reel and
  // substitutes for every paying symbol EXCEPT the hats (scatters). It has no
  // pay of its own — it only helps the other symbols form wins.
  'wild':           { id: 'wild',           svgId: '#sym-wild',     label: 'Wolf Wild', pays: null, isWild: true },

  // ── Inline SVG Royals (low-pay filler) ──
  'royal-a':        { id: 'royal-a',        svgId: '#sym-royal-a',  label: 'Ace',    pays: { 3: 0.26, 4: 0.89, 5: 4.46 } },
  'royal-k':        { id: 'royal-k',        svgId: '#sym-royal-k',  label: 'King',   pays: { 3: 0.26, 4: 0.89, 5: 4.46 } },
  'royal-q':        { id: 'royal-q',        svgId: '#sym-royal-q',  label: 'Queen',  pays: { 3: 0.21, 4: 0.71, 5: 3.57 } },
  'royal-j':        { id: 'royal-j',        svgId: '#sym-royal-j',  label: 'Jack',   pays: { 3: 0.21, 4: 0.71, 5: 3.57 } },
  'royal-10':       { id: 'royal-10',       svgId: '#sym-royal-10', label: 'Ten',    pays: { 3: 0.18, 4: 0.54, 5: 2.68 } },
};

/** All hat symbol IDs for bonus detection */
export const HAT_IDS = ['hat-yellow', 'hat-green', 'hat-red'];

/** The expanding wild symbol id (see SYMBOLS['wild']). */
export const WILD_ID = 'wild';

/** All symbol IDs as an array (cached for perf) */
export const SYMBOL_IDS = Object.keys(SYMBOLS);

/* ══════════════════════════════════════════
   BONUS PAR SHEET  (Hard Hat Free Spins)
   All bonus award magnitudes live here — the only place bonus math is stored.
   Awards are expressed as multiples of the (per-line) bet.
══════════════════════════════════════════ */

export const BONUS_CONFIG = {
  triggerHats:    6,   // hats on the trigger spin to start the bonus
  freeSpins:      6,   // initial free spins
  retriggerHats:  3,   // hats in one free spin to award +1 spin
  retriggerSpins: 1,   // spins added per retrigger

  // BONUS BUY: cost = buyCostMult × bet. Set so the buy carries ~the same RTP as
  // the game (avg bonus ≈ 85.3× bet ÷ 0.968 ≈ 88×). Verified by tools/sim.js.
  buyCostMult:    88,

  /**
   * Per-house award when the wolf blows a frame down.
   * tier 1 = straw, 2 = stick, 3 = brick. Award = bet × U(min,max),
   * except with probability `jackpotChance` it pays bet × `jackpotMult`.
   */
  tiers: {
    1: { min: 0.46, max: 2.44 },
    2: { min: 2.44, max: 9.74,  jackpotChance: 0.04, jackpotMult: 29  },
    3: { min: 7.31, max: 44.08, jackpotChance: 0.04, jackpotMult: 146 },
  },

  /**
   * Mansion jackpot: awarded once when 3+ brick frames are built.
   * Award = bet × (baseMult + U(0, perBrickMult × brickCount)).
   */
  mansion: { minBricks: 3, baseMult: 24.4, perBrickMult: 19.7 },
};

/* ══════════════════════════════════════════
   ACTIVE RTP MODEL
   The tables above are the canonical (Standard, ~97%) math. A selectable model
   (e.g. "Lean", 85%) keeps the SAME reels, trigger rate, hit frequency and
   volatility shape, and simply scales every win magnitude (line pays + bonus
   awards) by its `scale` factor. We apply that scale ONCE, in place, at load —
   so every consumer (evaluation, simulator, the displayed paytable) reads the
   same active numbers. The bonus-buy price is unchanged: fair price =
   E[bonus]/RTP, and both E[bonus] and RTP scale by the same factor, so it cancels.

   The choice is read from localStorage (browser) or BBW_RTP_MODEL (Node), so the
   headless verifier checks the exact model the player selected:
       BBW_RTP_MODEL=lean node tools/sim.js
══════════════════════════════════════════ */
function resolveActiveModelId() {
  try { if (typeof localStorage !== 'undefined') { const v = localStorage.getItem(RTP_MODEL_KEY); if (v && RTP_MODELS.some(m => m.id === v)) return v; } } catch (e) {}
  try { if (typeof process !== 'undefined' && process.env && process.env.BBW_RTP_MODEL && RTP_MODELS.some(m => m.id === process.env.BBW_RTP_MODEL)) return process.env.BBW_RTP_MODEL; } catch (e) {}
  return DEFAULT_RTP_MODEL;
}

/** The active model id and object (resolved once at load). */
export const ACTIVE_MODEL_ID = resolveActiveModelId();
export const ACTIVE_MODEL = RTP_MODELS.find(m => m.id === ACTIVE_MODEL_ID) || RTP_MODELS[0];

(function applyModelScale() {
  const scale = ACTIVE_MODEL.scale ?? 1;
  if (scale === 1) return;                         // Standard — nothing to do
  const r2 = n => Math.round(n * 100) / 100;
  const r1 = n => Math.round(n * 10) / 10;
  for (const id of SYMBOL_IDS) {                   // scale every line pay
    const p = SYMBOLS[id].pays;
    if (p) for (const k in p) p[k] = r2(p[k] * scale);
  }
  for (const t of Object.values(BONUS_CONFIG.tiers)) {   // scale house awards
    t.min = r2(t.min * scale); t.max = r2(t.max * scale);
    if (t.jackpotMult) t.jackpotMult = Math.round(t.jackpotMult * scale);
  }
  BONUS_CONFIG.mansion.baseMult     = r1(BONUS_CONFIG.mansion.baseMult * scale);
  BONUS_CONFIG.mansion.perBrickMult = r1(BONUS_CONFIG.mansion.perBrickMult * scale);
})();

/* ══════════════════════════════════════════
   REEL STRIPS  —  PER-REEL SYMBOL COUNTS (the par sheet)
   REEL_COUNTS[reel][symbolId] = how many of that symbol live on that reel.
   This table IS the math model — change a number, re-run `node tools/sim.js`.

   buildStrip() turns each count column into a physical strip: it spreads the
   filler symbols evenly and drops the hard hats in 2-symbol CLUSTERS, so a
   3-cell window can show 2 hats at once. That clustering is what makes the
   "6+ hats" bonus trigger reachable, and total hat count tunes how often it
   fires. buildStrip() is deterministic, so the strips are identical every load.
══════════════════════════════════════════ */

export const REEL_COUNTS = [
  // Reel 1 (leftmost — slightly looser)   ·   no wild
  { 'hat-yellow': 2, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 2, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 5 },
  // Reel 2   ·   no wild
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 2, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 4 },
  // Reel 3 (middle)   ·   1 expanding wild  (classic center-reel wild)
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 1, 'wolf': 2, 'buzzard': 1, 'wild': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
  // Reel 4   ·   no wild
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
  // Reel 5 (rightmost — fewest premiums)   ·   no wild
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 0, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 1, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
];

/**
 * Build a deterministic reel strip from a per-symbol count map.
 * Non-hat fillers are interleaved round-robin (even spread); hats are grouped
 * into clusters of 2 and woven in at evenly spaced gaps.
 */
export function buildStrip(counts) {
  // hats, flattened — the cluster fuel
  const hats = [];
  for (const id of HAT_IDS) for (let i = 0; i < (counts[id] || 0); i++) hats.push(id);

  // non-hat fillers, round-robin across symbol types for an even spread
  const buckets = Object.keys(counts)
    .filter(id => !HAT_IDS.includes(id))
    .map(id => Array(counts[id]).fill(id));
  const fillers = [];
  for (let any = true; any; ) {
    any = false;
    for (const b of buckets) { if (b.length) { fillers.push(b.pop()); any = true; } }
  }

  // group hats into clusters of 2 (a trailing odd hat stays a single)
  const clusters = [];
  for (let i = 0; i < hats.length; i += 2) clusters.push(hats.slice(i, i + 2));

  // weave clusters into the fillers at even gaps
  const gap = Math.max(1, Math.floor(fillers.length / (clusters.length + 1)));
  const strip = [];
  let ci = 0;
  for (let i = 0; i < fillers.length; i++) {
    strip.push(fillers[i]);
    if (ci < clusters.length && (i + 1) % gap === 0) strip.push(...clusters[ci++]);
  }
  while (ci < clusters.length) strip.push(...clusters[ci++]);
  return strip;
}

/** Physical reel strips (flat arrays), derived from REEL_COUNTS. */
export const REEL_STRIPS = REEL_COUNTS.map(buildStrip);

/* ══════════════════════════════════════════
   INITIAL GRID (visible on page load)
══════════════════════════════════════════ */

export const INITIAL_GRID = [
  ['royal-a',    'pig-suit',   'royal-k' ],
  ['toolbox',    'royal-q',    'royal-j' ],
  ['pig-contractor', 'royal-a', 'royal-k'],
  ['royal-q',    'pig-nature', 'royal-j' ],
  ['royal-a',    'royal-k',    'toolbox' ],
];
