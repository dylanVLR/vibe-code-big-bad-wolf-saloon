/**
 * @module buybonus
 * @description "Buy Bonus": pay buyCostMult × bet (80×) to skip the base game
 * and go straight into the feature. Priced (in config) so the buy's RTP matches
 * the game's ~97% — see PARSHEET.md. The trigger screen is rejection-sampled
 * from real spins so a bought bonus is worth exactly what a natural one is.
 */
'use strict';

import { BET_LEVELS, BONUS_CONFIG, HAT_IDS } from './config.js';
import { state } from './state.js';
import { fmt } from './utils.js';
import { synth } from './audio.js';
import { narrator } from './narrator.js';
import { generateGrid, countHats } from './mathcore.js';
import { animateReel, getReelStrips } from './engine.js';
import { spawnCoinShower } from './particles.js';
import { setStatus, updateDisplays, elWin, buttons } from './ui.js';
import { startBonus, isBonusActive } from './bonus.js';

const cabinet      = document.getElementById('cabinet');
const buyModal     = document.getElementById('buy-modal');
const btnCloseBuy  = document.getElementById('btn-close-buy');
const btnConfirmBuy = document.getElementById('btn-confirm-buy');
const btnCancelBuy = document.getElementById('btn-cancel-buy');
const buyCostEl    = document.getElementById('buy-cost');
const buyBetEl     = document.getElementById('buy-bet');

/** Current cost to buy the bonus, in dollars. */
export function bonusBuyCost() {
  return Math.round(BET_LEVELS[state.betIndex] * BONUS_CONFIG.buyCostMult * 100) / 100;
}

function executeBonusBuy() {
  if (state.spinning || isBonusActive()) return;
  const bet = BET_LEVELS[state.betIndex];
  const cost = bonusBuyCost();
  if (state.balance < cost) {
    setStatus('NOT ENOUGH CASH TO BUY THE BONUS!', 'error');
    narrator.onInsufficientFunds();
    return;
  }

  // rejection-sample a real screen until it has 6+ hats (matches natural triggers)
  let mockGrid, guard = 0;
  do { mockGrid = generateGrid(); }
  while (countHats(mockGrid).count < BONUS_CONFIG.triggerHats && ++guard < 100000);

  state.spinning = true;
  state.balance -= cost;
  elWin.textContent = '$0.00';
  elWin.classList.remove('win-glow');
  updateDisplays();
  setStatus(`BONUS PURCHASED — ${fmt(cost)}`, 'win');
  buttons.spin.disabled = buttons.betUp.disabled = buttons.betDown.disabled = true;

  synth.startSpin();
  const reelStrips = getReelStrips();
  let stopped = 0;
  for (let r = 0; r < 5; r++) {
    animateReel(r, mockGrid[r], () => {
      if (++stopped !== 5) return;
      synth.stopSpin();
      state.currentGrid = mockGrid;
      for (let ri = 0; ri < 5; ri++)
        for (let row = 0; row < 3; row++)
          if (HAT_IDS.includes(mockGrid[ri][row])) {
            const cell = reelStrips[ri].querySelectorAll('.sym-cell')[row];
            if (cell) cell.classList.add('is-winner');
          }
      state.spinning = false;
      cabinet.classList.add('screen-shake');
      setTimeout(() => cabinet.classList.remove('screen-shake'), 600);
      spawnCoinShower(30, 2000);
      setTimeout(() => startBonus(bet, mockGrid), 1000);
    }, true); // anticipation on
  }
}

function openBuyConfirm() {
  if (state.spinning || isBonusActive()) return;
  if (buyCostEl) buyCostEl.textContent = fmt(bonusBuyCost());
  if (buyBetEl) buyBetEl.textContent = fmt(BET_LEVELS[state.betIndex]);
  if (buyModal) buyModal.classList.remove('hidden');
}
function closeBuyConfirm() { if (buyModal) buyModal.classList.add('hidden'); }

/* ── wiring ── */
if (buttons.buy) buttons.buy.addEventListener('click', openBuyConfirm);
if (btnCloseBuy) btnCloseBuy.addEventListener('click', closeBuyConfirm);
if (btnCancelBuy) btnCancelBuy.addEventListener('click', closeBuyConfirm);
if (buyModal) buyModal.addEventListener('click', e => { if (e.target === buyModal) closeBuyConfirm(); });
if (btnConfirmBuy) btnConfirmBuy.addEventListener('click', () => { closeBuyConfirm(); executeBonusBuy(); });

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && !state.spinning && !isBonusActive()) openBuyConfirm();
});
