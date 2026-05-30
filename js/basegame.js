/**
 * @module basegame
 * @description The normal spin: take the bet, spin the reels, then present the
 * result (loss, small/medium/big/mega win, or bonus trigger). Also handles the
 * bet +/- buttons, turbo toggle, auto-spin, and the spin keyboard shortcuts.
 * Wins are computed by mathcore; this file is presentation + flow.
 */
'use strict';

import { BET_LEVELS } from './config.js';
import { DEV_MODE } from './devmode.js';
import { state } from './state.js';
import { sleep, fmt } from './utils.js';
import { synth } from './audio.js';
import { narrator } from './narrator.js';
import { generateGrid, evaluateGrid, countHats, shouldAnticipate } from './mathcore.js';
import { animateReel, getReelStrips, highlightWinners, clearHighlights, animateWinCount } from './engine.js';
import {
  spawnStarbursts, spawnSideWaterfall, spawnWinVignette, spawnWinPopText,
  playWinPresentation
} from './particles.js';
import { setStatus, updateDisplays, elWin, buttons, stopAuto } from './ui.js';
import { startBonus, isBonusActive } from './bonus.js';

const cabinet    = document.getElementById('cabinet');
const winFlash   = document.getElementById('win-flash');
const bigWinOver = document.getElementById('big-win-overlay');
const bigWinLabel = document.getElementById('big-win-label');
const bigWinAmt  = document.getElementById('big-win-amount');
const spinVideo  = document.getElementById('spin-video');   // animated SPIN badge

const shake = ms => { cabinet.classList.add('screen-shake'); setTimeout(() => cabinet.classList.remove('screen-shake'), ms); };

// Rest the badge on its first frame; replay it from the start on each spin.
if (spinVideo) {
  spinVideo.addEventListener('loadeddata', () => { try { spinVideo.currentTime = 0; } catch (e) {} });
  spinVideo.addEventListener('ended', () => { try { spinVideo.pause(); spinVideo.currentTime = 0; } catch (e) {} });
}
function playSpinBadge() {
  if (spinVideo) { try { spinVideo.currentTime = 0; spinVideo.play().catch(() => {}); } catch (e) {} }
}

/* ══════════════════════════════════════════
   SPIN
══════════════════════════════════════════ */
export function triggerSpin() {
  if (state.spinning || isBonusActive()) return;

  const bet = BET_LEVELS[state.betIndex];
  if (state.balance < bet) {
    setStatus('INSUFFICIENT FUNDS!', 'error');
    narrator.onInsufficientFunds();
    stopAuto();
    return;
  }

  state.spinning = true;
  state.balance -= bet;
  elWin.textContent = '$0.00';
  elWin.classList.remove('win-glow');
  updateDisplays();
  setStatus('SPINNING…');
  bigWinOver.classList.add('hidden');
  clearHighlights();

  buttons.spin.disabled = buttons.betUp.disabled = buttons.betDown.disabled = true;

  synth.startSpin();
  playSpinBadge();
  narrator.onSpin();
  if (state.balance < bet * 3) narrator.onLowBalance();

  const targetGrid = generateGrid();
  const anticipate = shouldAnticipate(targetGrid);

  let stopped = 0;
  for (let r = 0; r < 5; r++) {
    animateReel(r, targetGrid[r], () => { if (++stopped === 5) finalizeSpin(targetGrid, bet); }, anticipate);
  }
}

async function finalizeSpin(targetGrid, bet) {
  synth.stopSpin();
  state.currentGrid = targetGrid;
  const reelStrips = getReelStrips();

  // bonus trigger takes priority over line wins
  const { count: hatCount, hatCells } = countHats(targetGrid);
  if (hatCount >= 6) {
    hatCells.forEach(([r, row]) => {
      const cell = reelStrips[r].querySelectorAll('.sym-cell')[row];
      if (cell) cell.classList.add('is-winner');
    });
    shake(600);
    playWinPresentation(8, false); // 8 is a big win threshold, sufficient for the bonus trigger celebration
    spawnWinVignette(); spawnStarbursts(hatCells);
    narrator.onBonusTrigger();
    state.spinning = false;
    await sleep(800);
    startBonus(bet, targetGrid);
    return;
  }

  const { totalWin, winners } = evaluateGrid(targetGrid, bet);

  if (totalWin > 0) {
    highlightWinners(winners);
    spawnWinVignette();
    winFlash.classList.remove('hidden');
    setTimeout(() => winFlash.classList.add('hidden'), 500);
    cabinet.classList.add('win-flash-active');
    setTimeout(() => cabinet.classList.remove('win-flash-active'), 500);
    spawnStarbursts(winners.flatMap(w => w.cells));
    spawnWinPopText(totalWin);

    const ratio = totalWin / bet;
    if (ratio >= 8) {
      const isMega = ratio >= 15;
      bigWinLabel.textContent = isMega ? 'MEGA WIN!' : 'BIG WIN!';
      bigWinLabel.classList.toggle('mega-win', isMega);
      shake(600);
      playWinPresentation(ratio, isMega);
      synth.bigWinAlarm();
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, isMega ? 2500 : 1800);
      bigWinAmt.textContent = fmt(totalWin);
      bigWinOver.classList.remove('hidden');
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
      setTimeout(() => bigWinOver.classList.add('hidden'), 3500);
    } else if (ratio >= 2) {
      playWinPresentation(ratio);
      synth.win(totalWin, bet);
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, 1000);
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
    } else {
      playWinPresentation(ratio);
      synth.win(totalWin, bet);
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, 800);
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
    }
  } else {
    setStatus('GOOD LUCK – PRESS SPIN!');
    narrator.onLoss();
  }

  // unlock (auto-spin continues, otherwise re-enable buttons)
  const delay = totalWin > 0 ? (totalWin / bet >= 8 ? 3800 : 1200) : 350;
  setTimeout(() => {
    state.spinning = false;
    if (state.autoActive) {
      state.autoTimer = setTimeout(triggerSpin, state.turbo ? 500 : 1400);
    } else {
      buttons.spin.disabled = buttons.betUp.disabled = buttons.betDown.disabled = false;
    }
  }, delay);
}

/* ══════════════════════════════════════════
   AUTO-SPIN  (stopAuto lives in ui.js)
══════════════════════════════════════════ */
export function startAuto() {
  state.autoActive = true;
  buttons.auto.textContent = 'STOP';
  buttons.auto.classList.add('is-active');
  if (!state.spinning && !isBonusActive()) triggerSpin();
}

/* ══════════════════════════════════════════
   CONTROL WIRING
══════════════════════════════════════════ */
buttons.spin.addEventListener('click', () => { if (!state.spinning && !isBonusActive()) triggerSpin(); });

buttons.betUp.addEventListener('click', () => {
  if (state.spinning || isBonusActive()) return;
  state.betIndex = Math.min(BET_LEVELS.length - 1, state.betIndex + 1);
  updateDisplays();
  narrator.onBetChange('up');
});

buttons.betDown.addEventListener('click', () => {
  if (state.spinning || isBonusActive()) return;
  state.betIndex = Math.max(0, state.betIndex - 1);
  updateDisplays();
  narrator.onBetChange('down');
});

buttons.auto.addEventListener('click', () => {
  if (isBonusActive()) return;
  if (state.autoActive) stopAuto(); else startAuto();
});

const chkTurbo = document.getElementById('chk-turbo');
if (chkTurbo) chkTurbo.addEventListener('change', () => { state.turbo = chkTurbo.checked; });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !state.spinning && !isBonusActive()) { e.preventDefault(); triggerSpin(); }
  if (e.code === 'KeyA' && !isBonusActive()) { state.autoActive ? stopAuto() : startAuto(); }
  if (e.code === 'Backquote' && DEV_MODE) {
    const dbg = document.getElementById('debug-panel');
    if (dbg) dbg.classList.toggle('hidden');
  }
});
