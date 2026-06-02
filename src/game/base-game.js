/**
 * @module base-game
 * @description The normal spin: take the bet, spin the reels, then present the
 * result (loss, small/medium/big/mega win, or bonus trigger). Also handles the
 * bet +/- buttons, turbo toggle, auto-spin, and the spin keyboard shortcuts.
 * Wins are computed by mathcore; this file is presentation + flow.
 */
'use strict';

import { BET_LEVELS, WILD_ID, WIN_TIERS } from '../math/par-sheet.js';
import { DEV_MODE } from '../system/dev-mode.js';
import { state } from '../core/state.js';
import { sleep, fmt } from '../core/utils.js';
import { synth } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';
import { generateGrid, evaluateGrid, countHats, shouldAnticipate, shouldExtremeAnticipate, expandWilds } from '../math/mathcore.js';
import { animateReel, getReelStrips, highlightWinners, clearHighlights, animateWinCount, expandWildReel } from '../render/reels.js';
import {
  spawnStarbursts, spawnSideWaterfall, spawnWinVignette, spawnWinPopText,
  playWinPresentation, spawnSparkles
} from '../render/particles.js';
import { setStatus, updateDisplays, elWin, buttons, stopAuto } from '../render/readouts.js';
import { startBonus, isBonusActive } from './bonus.js';

const cabinet    = document.getElementById('cabinet');
const winFlash   = document.getElementById('win-flash');
const bigWinOver = document.getElementById('big-win-overlay');
const bigWinLabel = document.getElementById('big-win-label');
const bigWinAmt  = document.getElementById('big-win-amount');
const spinVideo  = document.getElementById('spin-video');   // animated SPIN badge

const shake = ms => { cabinet.classList.add('screen-shake'); setTimeout(() => cabinet.classList.remove('screen-shake'), ms); };

/* Win-celebration banners, biggest first. `min` is the win÷bet threshold (from
   WIN_TIERS), `cls` the label style ('' = the base BIG-WIN gold look), `heavy`
   selects the louder coin/fanfare presentation, `count`/`hold` are the count-up
   and on-screen durations (ms). One table drives both the live win and the dev
   preview, so they always match. */
const WIN_BANNERS = [
  { key: 'colossal', min: WIN_TIERS.colossal, label: 'Wild Wolf Windfall!', cls: 'colossal-win', heavy: true,  count: 3600, hold: 5000 },
  { key: 'epic',     min: WIN_TIERS.epic,     label: 'Big Bad Wolf Win!',   cls: 'epic-win',     heavy: true,  count: 3200, hold: 4500 },
  { key: 'mega',     min: WIN_TIERS.mega,     label: 'Big Bad Win!',        cls: 'mega-win',     heavy: true,  count: 2500, hold: 3800 },
  { key: 'big',      min: WIN_TIERS.big,      label: 'Big Win',             cls: '',             heavy: false, count: 1800, hold: 3500 },
];
const bannerForRatio = r => WIN_BANNERS.find(b => r >= b.min);     // highest tier reached (or undefined)

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

  synth.spinLever();
  synth.startSpin();
  playSpinBadge();
  narrator.onSpin();
  if (state.balance < bet * 3) narrator.onLowBalance();

  const targetGrid = generateGrid();
  
  if (state.forceExtremeNextSpin) {
    state.forceExtremeNextSpin = false;
    targetGrid[0][0] = 'hat-yellow';
    targetGrid[1][0] = 'hat-yellow';
    targetGrid[2][0] = 'hat-yellow';
    targetGrid[3][0] = 'hat-yellow';
    targetGrid[3][1] = 'hat-yellow';
    for (let i = 0; i < 3; i++) {
      if (targetGrid[4][i].startsWith('hat')) targetGrid[4][i] = 'royal-a';
    }
  }

  // gaff: force an expanding Wolf Wild onto the center reel this spin
  if (state.forceWildNextSpin) {
    state.forceWildNextSpin = false;
    targetGrid[2][1] = WILD_ID;   // one wild on the center reel → it fills the whole reel
  }

  const anticipate = shouldAnticipate(targetGrid);
  const extremeAnticipate = shouldExtremeAnticipate(targetGrid);

  let stopped = 0;
  for (let r = 0; r < 5; r++) {
    // Pass extremeAnticipate flag to reel 4 (the 5th reel)
    const isExtreme = extremeAnticipate && r === 4;
    animateReel(r, targetGrid[r], () => { if (++stopped === 5) finalizeSpin(targetGrid, bet); }, anticipate, isExtreme);
  }
}

async function finalizeSpin(targetGrid, bet) {
  synth.stopSpin();

  // Expanding Wolf Wild: any reel that landed a wild fills with wilds (hats kept).
  // Animate the expansion before anything pays, and evaluate the expanded screen.
  const { grid: shownGrid, wildReels } = expandWilds(targetGrid);
  state.currentGrid = shownGrid;
  const reelStrips = getReelStrips();
  if (wildReels.length > 0) {
    synth.wolfHowl();
    setStatus(wildReels.length > 1 ? 'WOLF WILDS!' : 'WOLF WILD!', 'win');
    narrator.onExpandingWilds(wildReels.length);
    wildReels.forEach(r => expandWildReel(r, shownGrid[r]));
    await sleep(750);
  }

  // bonus trigger takes priority over line wins (hats survive the wild expansion)
  const { count: hatCount, hatCells } = countHats(shownGrid);
  if (hatCount >= 6) {
    hatCells.forEach(([r, row]) => {
      const cell = reelStrips[r].querySelectorAll('.sym-cell')[row];
      if (cell) cell.classList.add('is-winner');
    });
    shake(600);
    playWinPresentation(WIN_TIERS.big, false); // big-win-level celebration for the bonus trigger
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
    if (ratio >= WIN_TIERS.big) {
      const b = bannerForRatio(ratio);                  // BIG / MEGA / EPIC / COLOSSAL
      bigWinLabel.textContent = b.label;
      bigWinLabel.className = b.cls;                     // '' keeps the base BIG-WIN gold style
      shake(b.heavy ? 900 : 600);
      playWinPresentation(ratio, b.heavy);
      synth.bigWinAlarm();
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, b.count);
      bigWinAmt.textContent = fmt(totalWin);
      bigWinOver.classList.remove('hidden');
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
      setTimeout(() => bigWinOver.classList.add('hidden'), b.hold);
    } else if (ratio >= WIN_TIERS.nice) {
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
    narrator.onReelsSettled();   // symbol-aware flavor (shot glass / horseshoe / hats) on a no-win spin
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

/**
 * DEV preview: replay a win celebration banner on demand (banner, shake, coins,
 * fanfare) WITHOUT changing the balance or touching spin state — so the team can
 * review how each tier looks. Amount shown = the tier's threshold × the current
 * bet. Wired to the dev "WINS" panel; uses the same WIN_BANNERS table as live play.
 * @param {'big'|'mega'|'epic'|'colossal'} tier
 */
export function previewWin(tier) {
  if (state.spinning) return;                       // don't collide with a live spin
  const b = WIN_BANNERS.find(x => x.key === tier);
  if (!b) return;
  const amount = b.min * (BET_LEVELS[state.betIndex] || 1);

  bigWinLabel.textContent = b.label;
  bigWinLabel.className = b.cls;
  bigWinAmt.textContent = fmt(amount);
  shake(b.heavy ? 900 : 600);
  spawnWinVignette();
  playWinPresentation(b.min, b.heavy);               // coins / sparkles / fanfare particles
  synth.bigWinAlarm();
  bigWinOver.classList.remove('hidden');
  clearTimeout(previewWin._t);
  previewWin._t = setTimeout(() => bigWinOver.classList.add('hidden'), b.hold);
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

// Razz the player if the MOUSE lingers over SPIN 3s+ without clicking (desktop only).
if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
  let hoverTimer = null;
  const clearHover = () => { if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; } };
  buttons.spin.addEventListener('mouseenter', () => {
    clearHover();
    if (buttons.spin.disabled || state.spinning || isBonusActive()) return;
    hoverTimer = setTimeout(() => {
      if (!buttons.spin.disabled && !state.spinning && !isBonusActive()) narrator.onSpinHover();
    }, 3000);
  });
  buttons.spin.addEventListener('mouseleave', clearHover);
  buttons.spin.addEventListener('pointerdown', clearHover);   // they're clicking → no taunt
}

buttons.betUp.addEventListener('click', () => {
  if (state.spinning || isBonusActive()) return;
  state.betIndex = Math.min(BET_LEVELS.length - 1, state.betIndex + 1);
  updateDisplays();
  synth.betChange();
  if (state.betIndex === BET_LEVELS.length - 1) narrator.onMaxBet();   // hit the ceiling → special line
  else narrator.onBetChange('up');
});

buttons.betDown.addEventListener('click', () => {
  if (state.spinning || isBonusActive()) return;
  state.betIndex = Math.max(0, state.betIndex - 1);
  updateDisplays();
  synth.betChange();
  narrator.onBetChange('down');
});

buttons.auto.addEventListener('click', () => {
  if (isBonusActive()) return;
  if (state.autoActive) stopAuto(); else startAuto();
});

const chkTurbo = document.getElementById('chk-turbo');
if (chkTurbo) chkTurbo.addEventListener('change', () => { state.turbo = chkTurbo.checked; });

// Keyboard shortcuts are centralised in src/system/shortcuts.js (they drive these
// same buttons), so there's no per-key handler here anymore.

const btnForceExtreme = document.getElementById('btn-force-extreme');
if (btnForceExtreme) {
  btnForceExtreme.addEventListener('click', () => {
    if (state.spinning || isBonusActive()) return;
    state.forceExtremeNextSpin = true;
    triggerSpin();
  });
}

// gaff: arm a forced Wolf Wild and spin straight away so it shows itself off
const btnForceWild = document.getElementById('btn-force-wild');
if (btnForceWild) {
  btnForceWild.addEventListener('click', () => {
    if (state.spinning || isBonusActive()) return;
    state.forceWildNextSpin = true;
    triggerSpin();
  });
}

const vlrMedallion = document.getElementById('vlr-medallion');
if (vlrMedallion) {
  vlrMedallion.addEventListener('click', () => {
    // Jump animation
    vlrMedallion.classList.remove('medallion-jump');
    void vlrMedallion.offsetWidth; // trigger reflow
    vlrMedallion.classList.add('medallion-jump');
    
    // Sparks
    const rect = vlrMedallion.getBoundingClientRect();
    const particleContainer = document.getElementById('particle-container');
    const cRect = particleContainer.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - cRect.left;
    const y = rect.top + rect.height / 2 - cRect.top;
    spawnSparkles(x, y, 15);
    
    // Sound
    synth.buttonClick();
  });
}
