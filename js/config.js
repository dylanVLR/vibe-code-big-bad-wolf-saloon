/**
 * @module config
 * @description Game configuration, symbol definitions, reel strip layouts,
 *              and shared constants for Huff N' More Puff.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  THIS FILE IS THE CANONICAL PAR SHEET (single source of truth for math).
 *  Human-readable summary + expected RTP decomposition lives in PARSHEET.md.
 *  Re-verify any change with:   node tools/sim.js
 *  Both the live game (js/main.js → modules) and the verifier import from here,
 *  so there is exactly ONE copy of these numbers.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Design target: ~97% RTP, high volatility (real "Huff N' More Puff" feel).
 *   • Base game  ≈ 50% RTP  (243-ways, fairly quiet between features)
 *   • Bonus      ≈ 47% RTP  (wolf/house feature drives most of the return)
 *   • Bonus trigger ≈ 1 in 175 spins (6+ hard-hat scatters)
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
    blurb: 'High-volatility classic. A quiet base game with big, swingy bonus rounds.',
  },
];

/** Default selected RTP model id */
export const DEFAULT_RTP_MODEL = 'standard';

/* ══════════════════════════════════════════
   SYMBOL DEFINITIONS  (PAYTABLE)
   pays[span] = per-WAY multiplier of the bet.
   Total cell payout = ways × pays[span] × bet  (243-ways, left-to-right).
══════════════════════════════════════════ */

export const SYMBOLS = {
  // ── PNG Image Symbols ──
  'hat-yellow':     { id: 'hat-yellow',     src: 'assets/hat_yellow.png',     label: 'Yellow Hat',    pays: { 3: 3.5,  4: 14.0, 5: 70.0 }, isHat: true },
  'hat-green':      { id: 'hat-green',      src: 'assets/hat_green.png',      label: 'Green Hat',     pays: { 3: 1.75, 4: 7.0,  5: 35.0 }, isHat: true },
  'hat-red':        { id: 'hat-red',        src: 'assets/hat_red.png',        label: 'Red Hat',       pays: { 3: 1.4,  4: 5.6,  5: 28.0 }, isHat: true },
  'pig-suit':       { id: 'pig-suit',       src: 'assets/pig_suit.png',       label: 'Suit Pig',      pays: { 3: 2.8,  4: 10.5, 5: 52.0 } },
  'pig-contractor': { id: 'pig-contractor', src: 'assets/pig_builder.png',    label: 'Builder Pig',   pays: { 3: 2.1,  4: 8.4,  5: 42.0 } },
  'pig-nature':     { id: 'pig-nature',     src: 'assets/pig_blueprint.png',  label: 'Blueprint Pig', pays: { 3: 1.4,  4: 5.6,  5: 28.0 } },
  'toolbox':        { id: 'toolbox',        src: 'assets/toolbox.png',        label: 'Toolbox',       pays: { 3: 1.2,  4: 4.9,  5: 24.0 } },
  'wolf':           { id: 'wolf',           src: 'assets/wolf.png',           label: 'Wolf',          pays: { 3: 0.9,  4: 3.5,  5: 17.0 } },
  'buzzard':        { id: 'buzzard',        src: 'assets/buzzard.png',        label: 'Buzzard',       pays: { 3: 0.7,  4: 2.8,  5: 14.0 } },

  // ── Inline SVG Royals (low-pay filler) ──
  'royal-a':        { id: 'royal-a',        svgId: '#sym-royal-a',  label: 'Ace',    pays: { 3: 0.5,  4: 1.75, 5: 8.75 } },
  'royal-k':        { id: 'royal-k',        svgId: '#sym-royal-k',  label: 'King',   pays: { 3: 0.5,  4: 1.75, 5: 8.75 } },
  'royal-q':        { id: 'royal-q',        svgId: '#sym-royal-q',  label: 'Queen',  pays: { 3: 0.42, 4: 1.4,  5: 7.0  } },
  'royal-j':        { id: 'royal-j',        svgId: '#sym-royal-j',  label: 'Jack',   pays: { 3: 0.42, 4: 1.4,  5: 7.0  } },
  'royal-10':       { id: 'royal-10',       svgId: '#sym-royal-10', label: 'Ten',    pays: { 3: 0.35, 4: 1.05, 5: 5.25 } },
};

/** All hat symbol IDs for bonus detection */
export const HAT_IDS = ['hat-yellow', 'hat-green', 'hat-red'];

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

  // BONUS BUY: cost = buyCostMult × bet. Set so the buy carries the same RTP
  // as the game (avg bonus ≈ 77.8× bet ÷ 0.97 ≈ 80×). Verified by tools/sim.js.
  buyCostMult:    80,

  /**
   * Per-house award when the wolf blows a frame down.
   * tier 1 = straw, 2 = stick, 3 = brick. Award = bet × U(min,max),
   * except with probability `jackpotChance` it pays bet × `jackpotMult`.
   */
  tiers: {
    1: { min: 0.4,  max: 2.1  },
    2: { min: 2.1,  max: 8.4,  jackpotChance: 0.04, jackpotMult: 25  },
    3: { min: 6.3,  max: 38.0, jackpotChance: 0.04, jackpotMult: 126 },
  },

  /**
   * Mansion jackpot: awarded once when 3+ brick frames are built.
   * Award = bet × (baseMult + U(0, perBrickMult × brickCount)).
   */
  mansion: { minBricks: 3, baseMult: 21, perBrickMult: 17 },
};

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
  // Reel 1 (leftmost — slightly looser)
  { 'hat-yellow': 2, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 2, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 5 },
  // Reel 2
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 2, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 4 },
  // Reel 3 (middle)
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 1, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
  // Reel 4
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
  // Reel 5 (rightmost — fewest premiums)
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
