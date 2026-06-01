/**
 * @module readouts
 * @description Small shared UI helpers and control-button references used by the
 * base game, the bonus, and the buy-bonus flow: the cash/bet/win readouts, the
 * status line, and enabling/disabling the control buttons. Kept separate so
 * basegame and bonus can both use it without importing each other.
 */
'use strict';

import { BET_LEVELS, BONUS_CONFIG, REEL_COUNT } from '../math/par-sheet.js';
import { state } from '../core/state.js';
import { fmt } from '../core/utils.js';

export const elBalance = document.getElementById('display-balance');
export const elBet     = document.getElementById('display-bet');
export const elWin     = document.getElementById('display-win');
const elStatus = document.getElementById('status-msg');

export const buttons = {
  spin:    document.getElementById('btn-spin'),
  betUp:   document.getElementById('btn-bet-up'),
  betDown: document.getElementById('btn-bet-down'),
  auto:    document.getElementById('btn-auto'),
  buy:     document.getElementById('btn-buy-bonus'),
};

/** Refresh the cash and bet readouts from current state. */
export function updateDisplays() {
  elBalance.textContent = fmt(state.balance);
  elBet.textContent = fmt(BET_LEVELS[state.betIndex]);
}

// The Mansion Jackpot tops out at baseMult + perBrickMult × (one Brick house per
// reel). Derived from BONUS_CONFIG so this marketing figure can never drift out
// of sync with the math (it was a hard-coded "126X" that no longer matched).
const MANSION_MAX = Math.round(
  BONUS_CONFIG.mansion.baseMult + BONUS_CONFIG.mansion.perBrickMult * REEL_COUNT
);
const IDLE_MESSAGES = [
  "GOOD LUCK – PRESS SPIN!",
  "243 WAYS TO WIN EVERY SPIN!",
  "6+ HARD HATS TRIGGER THE BONUS!",
  `BUILD BRICK HOUSES FOR A CHANCE AT A MASSIVE ${MANSION_MAX}X JACKPOT!`,
  "GET 3+ BRICK HOUSES IN THE BONUS FOR THE MANSION JACKPOT!",
  "3 HARD HATS IN THE BONUS AWARDS +1 FREE SPIN!",
  "HIGH VOLATILITY: THE BIGGEST WINS ARE HIDING IN THE BONUS!"
];
let idleIndex = 0;
let idleInterval = null;

/** Show a status message. `type` adds an `is-<type>` class (e.g. 'win','error'). */
export function setStatus(msg, type = '') {
  elStatus.textContent = msg;
  elStatus.className = type ? `is-${type}` : '';
  
  // Manage the idle message ticker
  if (msg === 'GOOD LUCK – PRESS SPIN!') {
    if (!idleInterval) {
      idleIndex = 0; // Always start with the main greeting
      idleInterval = setInterval(() => {
        idleIndex = (idleIndex + 1) % IDLE_MESSAGES.length;
        elStatus.textContent = IDLE_MESSAGES[idleIndex];
      }, 3500);
    }
  } else {
    if (idleInterval) {
      clearInterval(idleInterval);
      idleInterval = null;
    }
  }
}

/** Enable/disable all the player controls at once (used around the bonus). */
export function setControlsEnabled(on) {
  for (const b of Object.values(buttons)) if (b) b.disabled = !on;
}

/** Stop auto-spin and reset its button. (startAuto lives in basegame.) */
export function stopAuto() {
  state.autoActive = false;
  if (buttons.auto) { buttons.auto.textContent = 'AUTO SPIN'; buttons.auto.classList.remove('is-active'); }
  clearTimeout(state.autoTimer);
  state.autoTimer = null;
}
