/**
 * @module state
 * @description Shared, mutable runtime state for the base game.
 *
 * ES module imports are read-only *bindings*, so modules can't reassign each
 * other's `let` variables. Instead we export one plain object and everyone reads
 * and writes its properties — that mutation is visible everywhere. Bonus-only
 * state lives privately inside bonus.js; this is just the cross-module stuff.
 */
'use strict';

import { DEFAULT_BALANCE, DEFAULT_BET_INDEX, ACTIVE_MODEL_ID } from '../math/par-sheet.js';

export const state = {
  balance: DEFAULT_BALANCE,   // player's cash
  betIndex: DEFAULT_BET_INDEX, // index into BET_LEVELS
  spinning: false,            // a base-game spin is animating
  turbo: false,               // turbo (fast spin) toggle
  autoActive: false,          // auto-spin is on
  autoTimer: null,            // setTimeout handle for auto-spin
  currentGrid: null,          // the symbols currently shown (for spin scroll buffer)
  musicAutoStarted: false,    // background music has been kicked off
  rtpModelId: ACTIVE_MODEL_ID,   // the RTP math model the game is currently running (see par-sheet.js)
  forceExtremeNextSpin: false,   // dev tool to force extreme anticipation on next spin
  forceWildNextSpin: false,      // dev tool to force an expanding Wolf Wild on next spin
};
