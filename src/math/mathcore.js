/**
 * @module mathcore
 * @description The math of Big Bad Wolf — and nothing else.
 *
 * This module is intentionally PURE: no DOM, no audio, no animation. That means
 * the browser game AND the headless verifier (tools/sim.js) import the SAME
 * functions, so what you test is exactly what players get. If a number feels
 * wrong, it is decided here or in the par sheet (par-sheet.js) — nowhere else.
 *
 * Contents:
 *   generateGrid()            – draw a random 5×3 screen from the reel strips
 *   evaluateGrid()            – the 243-ways payout calculation
 *   countHats()               – how many scatter hats are showing
 *   shouldAnticipate()        – cosmetic "near win" slow-down hint
 *   rollHouseAward()          – value of one blown-down house in the bonus
 *   rollMansionAward()        – value of the mansion jackpot
 *   simulateBonusOutcome()    – headless play-through of a whole bonus
 */
'use strict';

import {
  SYMBOLS, SYMBOL_IDS, HAT_IDS, WILD_ID, REEL_STRIPS, BONUS_CONFIG,
  REEL_COUNT, ROWS_PER_REEL, MIN_WIN_SPAN, MAX_FRAME_TIER,
} from './par-sheet.js';

/* ══════════════════════════════════════════
   DRAWING A SCREEN
══════════════════════════════════════════ */

/**
 * Pick a random visible 5×3 grid from the reel strips.
 * For each reel we pick a random stop position and take the 3 symbols there
 * (wrapping around the end of the strip). grid[reel][row] = symbol id.
 * @returns {string[][]}
 */
export function generateGrid() {
  return REEL_STRIPS.map(strip => {
    const len = strip.length;
    const start = Math.floor(Math.random() * len);
    return [strip[start % len], strip[(start + 1) % len], strip[(start + 2) % len]];
  });
}

/* ══════════════════════════════════════════
   EXPANDING WILDS
   ─────────────────────────────────────────
   The Wolf Wild lands only on the middle reels (2-4). When at least one shows on
   a reel, the WHOLE reel turns wild — except hat (scatter) cells, which are left
   alone so the bonus trigger is unaffected. A wild substitutes for every paying
   symbol but the hats. The wild has no pay of its own.
══════════════════════════════════════════ */

/**
 * Expand any reel that contains a wild so the whole reel reads as wild (hats kept).
 * Returns a NEW grid (the input is never mutated) plus which reels expanded.
 * @returns {{ grid: string[][], wildReels: number[] }}
 */
export function expandWilds(grid) {
  const wildReels = [];
  const out = grid.map((col, r) => {
    if (!col.includes(WILD_ID)) return col.slice();
    wildReels.push(r);
    return col.map(s => (HAT_IDS.includes(s) ? s : WILD_ID));   // keep hats, fill the rest
  });
  return { grid: out, wildReels };
}

/* ══════════════════════════════════════════
   243-WAYS PAYOUT
   ─────────────────────────────────────────
   "Ways" (not paylines): a symbol pays when it lands on adjacent reels starting
   from reel 1, in ANY rows. The number of "ways" is the product of how many
   times the symbol shows on each of those reels.

       payout = ways × pays[span] × bet

   where `span` = how many consecutive reels (from reel 1) the symbol covers
   (3, 4, or 5). With 3 rows per reel the theoretical max is 3×3×3×3×3 = 243 ways.
══════════════════════════════════════════ */

/**
 * @typedef {Object} WinResult
 * @property {string} symId
 * @property {number} span       consecutive reels matched (≥ MIN_WIN_SPAN)
 * @property {number} ways       number of ways this symbol hit
 * @property {number} winAmount  ways × pays[span] × bet
 * @property {Array<[number,number]>} cells  [reel,row] of each contributing cell
 */

/**
 * Evaluate every winning symbol on a grid.
 * @param {string[][]} grid grid[reel][row] = symbol id
 * @param {number} bet
 * @returns {{ totalWin: number, winners: WinResult[] }}
 */
export function evaluateGrid(grid, bet) {
  let totalWin = 0;
  const winners = [];

  // expand any wild reels first; wilds then substitute below (idempotent if the
  // grid was already expanded by the caller)
  const g = expandWilds(grid).grid;

  for (const symId of SYMBOL_IDS) {
    const sym = SYMBOLS[symId];
    if (symId === WILD_ID || !sym.pays) continue;   // the wild has no pay of its own
    const isHat = HAT_IDS.includes(symId);
    // a cell counts for this symbol if it IS the symbol, or is a wild that may
    // substitute for it (wilds don't substitute for the hat scatters)
    const matches = s => s === symId || (!isHat && s === WILD_ID);

    // how many times the symbol (incl. substituting wilds) appears on each reel
    const colCounts = g.map(col => col.filter(matches).length);

    // must be present on reel 1 to start a left-to-right win
    if (colCounts[0] === 0) continue;

    // extend the win across consecutive reels, multiplying the ways
    let span = 1;
    let ways = colCounts[0];
    for (let r = 1; r < REEL_COUNT; r++) {
      if (colCounts[r] === 0) break;
      span++;
      ways *= colCounts[r];
    }

    if (span < MIN_WIN_SPAN) continue;          // need 3+ in a row to pay
    const payout = sym.pays[span];
    if (!payout) continue;

    const winAmount = ways * payout * bet;
    totalWin += winAmount;

    // record the contributing cells (for highlighting in the UI)
    const cells = [];
    for (let r = 0; r < span; r++) {
      g[r].forEach((s, row) => { if (matches(s)) cells.push([r, row]); });
    }
    winners.push({ symId, span, ways, winAmount, cells });
  }

  return { totalWin, winners };
}

/* ══════════════════════════════════════════
   SCATTER HATS (bonus trigger)
══════════════════════════════════════════ */

/**
 * Count the hard hats anywhere on the grid (they are the bonus scatter).
 * @returns {{ count: number, hatCells: Array<[number,number]> }}
 */
export function countHats(grid) {
  let count = 0;
  const hatCells = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    for (let row = 0; row < ROWS_PER_REEL; row++) {
      if (HAT_IDS.includes(grid[r][row])) { count++; hatCells.push([r, row]); }
    }
  }
  return { count, hatCells };
}

/** Symbols that, when stacking across reels, trigger the anticipation slow-down. */
const ANTICIPATION_SYMS = ['hat-yellow', 'pig-suit', 'pig-contractor'];

/**
 * Cosmetic only: should later reels slow down for suspense? True when a big
 * symbol is building across the first reels, or a bonus is one hat away.
 */
export function shouldAnticipate(grid) {
  for (const symId of ANTICIPATION_SYMS) {
    let consecutive = 0;
    for (let r = 0; r < REEL_COUNT; r++) {
      if (grid[r].includes(symId)) consecutive++;
      else break;
    }
    if (consecutive >= 3) return true;
  }
  return countHats(grid).count >= 4;
}

/**
 * Should the final reel spin in extreme anticipation?
 * True if exactly 5 hats have landed on the first 4 reels.
 */
export function shouldExtremeAnticipate(grid) {
  let count = 0;
  for (let r = 0; r < REEL_COUNT - 1; r++) {
    for (let row = 0; row < 3; row++) {
      if (HAT_IDS.includes(grid[r][row])) count++;
    }
  }
  return count === 5;
}

/* ══════════════════════════════════════════
   BONUS AWARD MATH
   All magnitudes come from BONUS_CONFIG (the par sheet); these helpers are the
   ONE place the formulas live, shared by the live bonus and the simulators.
══════════════════════════════════════════ */

/**
 * Value of a single house when the wolf blows it down, in dollars.
 * tier 1 = straw, 2 = stick, 3 = brick. Tiers 2 & 3 have a small jackpot chance.
 * @returns {{ amount: number, isJackpot: boolean }}
 */
export function rollHouseAward(tier, bet) {
  const t = BONUS_CONFIG.tiers[tier];
  if (t.jackpotChance && Math.random() < t.jackpotChance) {
    return { amount: bet * t.jackpotMult, isJackpot: true };
  }
  return { amount: bet * (t.min + Math.random() * (t.max - t.min)), isJackpot: false };
}

/** Value of the mansion jackpot for a given number of brick houses, in dollars. */
export function rollMansionAward(brickCount, bet) {
  const m = BONUS_CONFIG.mansion;
  return bet * (m.baseMult + Math.random() * (m.perBrickMult * brickCount));
}

/* ══════════════════════════════════════════
   HEADLESS BONUS PLAY-THROUGH
   Mirrors the live feature (game/bonus.js) but with no animation — just the money.
   Used by the Monte-Carlo simulators. Keep in lock-step with game/bonus.js.
══════════════════════════════════════════ */

const round2 = n => Math.round(n * 100) / 100;

/**
 * Play a whole bonus and return what it paid.
 * @param {number} bet
 * @param {string[][]} triggerGrid the 6+ hat screen that started it
 * @returns {{ bonusWin: number, freeSpins: number, mansions: number }}
 */
export function simulateBonusOutcome(bet, triggerGrid) {
  const C = BONUS_CONFIG;
  let freeSpins = C.freeSpins, bonusWin = 0, spinsPlayed = 0, mansions = 0;
  const frames = Array.from({ length: REEL_COUNT }, () => Array(ROWS_PER_REEL).fill(0));

  // trigger hats place the first straw frames
  for (let r = 0; r < REEL_COUNT; r++)
    for (let row = 0; row < ROWS_PER_REEL; row++)
      if (HAT_IDS.includes(triggerGrid[r][row]))
        frames[r][row] = Math.min(frames[r][row] + 1, MAX_FRAME_TIER);

  while (freeSpins > 0) {
    freeSpins--; spinsPlayed++;
    const grid = generateGrid();
    bonusWin += evaluateGrid(grid, bet).totalWin;       // free spins still pay lines

    // each hat upgrades its cell's house: straw → stick → brick
    let newHats = 0, newBricks = 0;
    for (let r = 0; r < REEL_COUNT; r++)
      for (let row = 0; row < ROWS_PER_REEL; row++)
        if (HAT_IDS.includes(grid[r][row])) {
          const old = frames[r][row];
          frames[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
          newHats++;
          if (old === MAX_FRAME_TIER - 1 && frames[r][row] === MAX_FRAME_TIER) newBricks++;
        }

    // mansion jackpot fires when a fresh brick lands and 3+ bricks are up
    let bricks = 0;
    for (let r = 0; r < REEL_COUNT; r++)
      for (let row = 0; row < ROWS_PER_REEL; row++)
        if (frames[r][row] === MAX_FRAME_TIER) bricks++;
    if (bricks >= C.mansion.minBricks && newBricks > 0) {
      bonusWin += round2(rollMansionAward(bricks, bet));
      mansions++;
    }

    if (newHats >= C.retriggerHats) freeSpins += C.retriggerSpins;   // retrigger
  }

  // the wolf blows every built house down for its prize
  for (let r = 0; r < REEL_COUNT; r++)
    for (let row = 0; row < ROWS_PER_REEL; row++) {
      const tier = frames[r][row];
      if (tier) bonusWin += round2(rollHouseAward(tier, bet).amount);
    }

  return { bonusWin, freeSpins: spinsPlayed, mansions };
}
