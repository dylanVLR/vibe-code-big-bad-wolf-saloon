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

import { DEFAULT_BALANCE, DEFAULT_BET_INDEX, DEFAULT_RTP_MODEL } from '../math/par-sheet.js';

export const state = {
  balance: DEFAULT_BALANCE,   // player's cash
  betIndex: DEFAULT_BET_INDEX, // index into BET_LEVELS
  spinning: false,            // a base-game spin is animating
  turbo: false,               // turbo (fast spin) toggle
  autoActive: false,          // auto-spin is on
  autoTimer: null,            // setTimeout handle for auto-spin
  currentGrid: null,          // the symbols currently shown (for spin scroll buffer)
  musicAutoStarted: false,    // background music has been kicked off
  rtpModelId: DEFAULT_RTP_MODEL, // selected RTP math model (see RTP_MODELS in par-sheet.js)
};
