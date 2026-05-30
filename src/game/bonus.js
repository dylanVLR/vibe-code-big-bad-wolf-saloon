/**
 * @module bonus
 * @description The Hard Hat Free Spins feature — the whole show:
 *   1. trigger intro  →  2. free spins that build straw/stick/brick houses
 *   →  3. the wolf blows each house down for a prize  →  4. mansion jackpot for
 *   3+ bricks  →  5. pay out the total.
 *
 * Award magnitudes come from BONUS_CONFIG via mathcore's rollHouseAward /
 * rollMansionAward, so this file controls the *show* and mathcore controls the
 * *money* (kept identical to the headless simulateBonusOutcome).
 */
'use strict';

import { HAT_IDS, MAX_FRAME_TIER, BONUS_CONFIG } from '../math/par-sheet.js';
import { state } from '../core/state.js';
import { sleep, fmt } from '../core/utils.js';
import { synth, bgm } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';
import { generateGrid, evaluateGrid, rollHouseAward, rollMansionAward } from '../math/mathcore.js';
import { animateAllReels, highlightWinners, clearHighlights, animateWinCount, getReelStrips } from '../render/reels.js';
import {
  spawnCoinShower, spawnCoinFountain, spawnDollarBills, spawnConfetti, spawnSparkles,
  spawnStarbursts, spawnWinVignette, spawnWinPopText,
  playWinPresentation
} from '../render/particles.js';
import { setStatus, updateDisplays, setControlsEnabled, stopAuto, elWin } from '../render/readouts.js';

/* ── DOM ── */
const cabinet         = document.getElementById('cabinet');
const particleContainer = document.getElementById('particle-container');
const bonusHud        = document.getElementById('bonus-hud');
const bonusOverlay    = document.getElementById('bonus-overlay');
const bonusTitle      = document.getElementById('bonus-title');
const bonusPhaseLabel = document.getElementById('bonus-phase-label');
const bonusSpinsLeft  = document.getElementById('bonus-spins-left');
const bonusWinDisplay = document.getElementById('bonus-win-display');
const mansionOverlay  = document.getElementById('mansion-overlay');
const mansionTitle    = document.getElementById('mansion-title');
const mansionSubtitle = document.getElementById('mansion-subtitle');
const mansionPress    = document.getElementById('mansion-press');
const wolfTornadoOverlay = document.getElementById('wolf-tornado-overlay');
const wolfTornadoVideo   = document.getElementById('wolf-tornado-video');
const bigWinOver      = document.getElementById('big-win-overlay');
const bigWinLabel     = document.getElementById('big-win-label');
const bigWinAmt       = document.getElementById('big-win-amount');
const bonusIntroOverlay = document.getElementById('bonus-intro-overlay');
const bonusIntroVideo   = document.getElementById('bonus-intro-video');

/* ── bonus-only state ── */
let bonusActive    = false;
let bonusFreeSpins = 0;
let bonusTotalWin  = 0;
let bonusBet       = 0;
let frameTiers     = makeGrid();
let prevFrameTiers = makeGrid();

function makeGrid() { return Array.from({ length: 5 }, () => [0, 0, 0]); }
export function isBonusActive() { return bonusActive; }

/**
 * Bonus intro video, contained inside the reel window. Resolves when it ends, is
 * clicked (skip), errors, or hits a safety timeout — so the bonus can never get
 * stuck behind it.
 */
function playBonusIntro() {
  return new Promise(resolve => {
    if (!bonusIntroOverlay || !bonusIntroVideo) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      bonusIntroOverlay.classList.add('fade-out');
      try { bonusIntroVideo.pause(); } catch (e) {}
      setTimeout(() => {
        bonusIntroOverlay.classList.add('hidden');
        bonusIntroOverlay.classList.remove('fade-out');
        resolve();
      }, 500);
    };
    bonusIntroVideo.addEventListener('ended', finish, { once: true });
    bonusIntroVideo.addEventListener('error', finish, { once: true });
    bonusIntroOverlay.addEventListener('click', finish, { once: true });
    bonusIntroOverlay.classList.remove('hidden');
    try { bonusIntroVideo.currentTime = 0; } catch (e) {}
    // Try with sound (the player has already interacted); fall back to muted so it always shows.
    bonusIntroVideo.muted = false;
    bonusIntroVideo.play().catch(() => {
      bonusIntroVideo.muted = true;
      bonusIntroVideo.play().catch(finish);
    });
    setTimeout(finish, 30000);   // hard safety cap
  });
}

/**
 * Wolf-blow video (the tornado huff). Plays once, contained inside the reel
 * window — same containment as the bonus intro. Resolves when it ends, is
 * errors, or hits a safety timeout, then fades out. Not click-skippable — it's
 * the climactic blow, so it always plays through.
 */
function playWolfTornado() {
  return new Promise(resolve => {
    if (!wolfTornadoOverlay || !wolfTornadoVideo) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      wolfTornadoOverlay.classList.add('fade-out');
      try { wolfTornadoVideo.pause(); } catch (e) {}
      setTimeout(() => {
        wolfTornadoOverlay.classList.add('hidden');
        wolfTornadoOverlay.classList.remove('fade-out');
        resolve();
      }, 500);
    };
    wolfTornadoVideo.addEventListener('ended', finish, { once: true });
    wolfTornadoVideo.addEventListener('error', finish, { once: true });
    // NB: no click-to-skip here — this is the climactic "can the wolf blow the
    // house down?" moment, so a stray click on the reels must not dismiss it.
    wolfTornadoOverlay.classList.remove('hidden');
    try { wolfTornadoVideo.currentTime = 0; } catch (e) {}
    wolfTornadoVideo.muted = true;                 // webm has no audio; the synth wolfHuff carries the sound
    wolfTornadoVideo.play().catch(finish);
    setTimeout(finish, 12000);                     // hard safety cap
  });
}

/* ══════════════════════════════════════════
   ENTRY
══════════════════════════════════════════ */
export async function startBonus(bet, triggerGrid) {
  stopAuto();
  bonusActive = true;
  bonusFreeSpins = BONUS_CONFIG.freeSpins;
  bonusTotalWin = 0;
  bonusBet = bet;
  frameTiers = makeGrid();
  prevFrameTiers = makeGrid();
  setControlsEnabled(false);

  // silence the base music so it doesn't clash with the intro video's own audio
  bgm.pauseForCutscene();

  // bonus intro video plays inside the reel window as soon as the bonus triggers
  await playBonusIntro();

  // music comes back right away (skip or finish) as the bigger, epic bonus score
  bgm.switchToBonus(700);

  // trigger hats become the first straw frames
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++)
      if (HAT_IDS.includes(triggerGrid[r][row]))
        frameTiers[r][row] = Math.min(frameTiers[r][row] + 1, MAX_FRAME_TIER);

  synth.bonusSiren();
  showBonusOverlay('BONUS REEL FEATURE!', 'FREE SPINS STARTING');
  if (bonusHud) bonusHud.classList.remove('hidden');
  shake(600);
  await sleep(2800);
  hideBonusOverlay();

  showMansionOverlay(bonusFreeSpins);
  await sleep(3000);
  hideMansionOverlay();

  renderFrameOverlays();
  updateBonusHUD();
  await runFreeSpins();
}

/* ══════════════════════════════════════════
   FREE SPINS
══════════════════════════════════════════ */
async function runFreeSpins() {
  const reelStrips = getReelStrips();
  while (bonusFreeSpins > 0) {
    bonusFreeSpins--;
    updateBonusHUD();
    setStatus(`FREE SPIN — ${bonusFreeSpins + 1} remaining`, 'win');
    narrator.onFreeSpin();
    await sleep(600);

    const targetGrid = generateGrid();
    synth.startSpin();
    await animateAllReels(targetGrid);
    synth.stopSpin();
    state.currentGrid = targetGrid;

    // line wins still pay during free spins
    const { totalWin, winners } = evaluateGrid(targetGrid, bonusBet);
    if (totalWin > 0) {
      highlightWinners(winners);
      synth.win(totalWin, bonusBet);
      bonusTotalWin += totalWin;
      spawnWinVignette();
      spawnStarbursts(winners.flatMap(w => w.cells));
      spawnWinPopText(totalWin);
      const ratio = totalWin / bonusBet;
      if (ratio > 0) {
        playWinPresentation(ratio, false);
      }
      await animateWinCount(bonusTotalWin, 600);
      updateBonusHUD();
      await sleep(400);
      clearHighlights();
    }

    // hats upgrade houses; track new bricks
    let newHats = 0;
    const newBrickCells = [];
    for (let r = 0; r < 5; r++)
      for (let row = 0; row < 3; row++)
        if (HAT_IDS.includes(targetGrid[r][row])) {
          const old = frameTiers[r][row];
          frameTiers[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
          newHats++;
          if (old === 2 && frameTiers[r][row] === 3) newBrickCells.push({ reel: r, row });
        }
    renderFrameOverlays();

    if (newHats > 0) {
      if (newBrickCells.length > 0) narrator.onFrameUpgrade(3);
      else narrator.onFrameUpgrade(Math.min(frameTiers.flat().filter(t => t > 0).slice(-1)[0] || 1, 2));
    }

    if (newBrickCells.length > 0) await animateBrickBuild(newBrickCells);

    const brickCount = countBrickFrames();
    if (brickCount >= BONUS_CONFIG.mansion.minBricks && newBrickCells.length > 0) {
      await triggerMansionsJackpot(brickCount);
    }

    if (newHats >= BONUS_CONFIG.retriggerHats) {
      bonusFreeSpins += BONUS_CONFIG.retriggerSpins;
      synth.retriggerChime();
      narrator.onRetrigger();
      setStatus(`+1 FREE SPIN RETRIGGER! (${newHats} Hats)`, 'win');
      showBonusOverlay('+1 FREE SPIN!', 'RETRIGGER');
      spawnCoinShower(15, 1500);
      await sleep(1800);
      hideBonusOverlay();
    }

    updateBonusHUD();
    await sleep(400);
  }
  await wolfEndGameReveal();
}

/* ══════════════════════════════════════════
   WOLF REVEAL — pay out every house
══════════════════════════════════════════ */
async function wolfEndGameReveal() {
  const reelStrips = getReelStrips();
  setStatus('THE WOLF IS COMING...', 'win');
  narrator.onWolfReveal();
  cabinet.classList.add('wolf-reveal-active');

  // the wolf huffs & puffs — tornado video plays contained inside the reel window
  synth.wolfHuff();
  await playWolfTornado();

  const framedCells = [];
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++)
      if (frameTiers[r][row] > 0) framedCells.push({ reel: r, row, tier: frameTiers[r][row] });
  framedCells.sort((a, b) => a.tier - b.tier);   // straw first

  for (const { reel, row, tier } of framedCells) {
    const cellEl = reelStrips[reel].querySelectorAll('.sym-cell')[row];
    if (!cellEl) continue;

    narrator.onWolfBlow(tier);

    cellEl.classList.add('bonus-shake');
    if (tier === 3) shake(600);
    await sleep(800);
    cellEl.classList.remove('bonus-shake');

    // award (formula from mathcore; presentation here)
    const { amount, isJackpot } = rollHouseAward(tier, bonusBet);
    const award = Math.round(amount * 100) / 100;
    if (isJackpot && tier === 2) {
      setStatus('⭐ MINI JACKPOT! ⭐', 'win'); narrator.onMiniJackpot(); playWinPresentation(3);
    } else if (isJackpot && tier === 3) {
      setStatus('🏆 MINOR JACKPOT! 🏆', 'win'); narrator.onMiniJackpot(); shake(600); playWinPresentation(8);
    } else if (tier === 3) {
      spawnCoinShower(20, 1500);
    }

    updateCellToHouse(cellEl, tier);
    synth.houseAward(tier);
    sparkleAt(cellEl, 12);

    bonusTotalWin += award;
    setStatus(`${['', 'STRAW', 'STICK', 'BRICK'][tier]} HOUSE → ${fmt(award)}`, 'win');
    await animateWinCount(bonusTotalWin, 500);
    updateBonusHUD();
    await sleep(800);
  }

  cabinet.classList.remove('wolf-reveal-active');
  await endBonus();
}

/* ══════════════════════════════════════════
   MANSION JACKPOT
══════════════════════════════════════════ */
async function triggerMansionsJackpot(brickCount) {
  setStatus('🏰 MANSIONS FEATURE! 🏰', 'win');
  shake(600);
  synth.mansionFanfare();
  narrator.onMansionJackpot();
  showMansionOverlay(bonusFreeSpins, true);
  spawnCoinShower(40, 3000);
  await sleep(3000);
  hideMansionOverlay();

  const award = Math.round(rollMansionAward(brickCount, bonusBet) * 100) / 100;
  bonusTotalWin += award;
  setStatus(`🏰 MANSION JACKPOT: ${fmt(award)}! 🏰`, 'win');
  bigWinLabel.textContent = '🏰 MANSION JACKPOT!';
  bigWinLabel.classList.remove('mega-win');
  bigWinAmt.textContent = fmt(award);
  bigWinOver.classList.remove('hidden');
  shake(600);
  spawnCoinShower(60, 4000);
  await animateWinCount(bonusTotalWin, 2000);
  updateBonusHUD();
  await sleep(3500);
  bigWinOver.classList.add('hidden');
}

/* ══════════════════════════════════════════
   FINISH
══════════════════════════════════════════ */
async function endBonus() {
  bonusTotalWin = Math.round(bonusTotalWin * 100) / 100;
  showBonusOverlay(`BONUS WIN: ${fmt(bonusTotalWin)}`, 'CONGRATULATIONS!');
  synth.bonusSiren();
  spawnCoinShower(60, 3500);
  shake(600);
  await sleep(3500);
  hideBonusOverlay();

  state.balance += bonusTotalWin;
  updateDisplays();
  elWin.textContent = fmt(bonusTotalWin);
  elWin.classList.add('win-glow');
  setStatus(`BONUS COMPLETE — WON ${fmt(bonusTotalWin)}!`, 'win');
  narrator.onBonusComplete(bonusTotalWin);

  clearFrameOverlays();
  if (bonusHud) bonusHud.classList.add('hidden');
  document.querySelectorAll('.house-icon').forEach(el => el.remove());
  document.querySelectorAll('.is-house-revealed').forEach(el => el.classList.remove('is-house-revealed'));
  document.querySelectorAll('.house-straw, .house-stick, .house-brick, .house-mansion')
    .forEach(el => el.classList.remove('house-straw', 'house-stick', 'house-brick', 'house-mansion'));

  // crossfade back to the whimsical base-game theme
  bgm.switchToBase();

  bonusActive = false;
  state.spinning = false;
  setControlsEnabled(true);
}

/* ══════════════════════════════════════════
   FRAME / HOUSE VISUALS
══════════════════════════════════════════ */
function updateCellToHouse(cellEl, tier) {
  const existing = cellEl.querySelector('.frame-overlay');
  if (existing) existing.remove();
  cellEl.classList.add('is-house-revealed');
  cellEl.classList.remove('frame-straw', 'frame-stick', 'frame-brick');
  cellEl.classList.add(['', 'house-straw', 'house-stick', 'house-brick'][tier]);
  const houseDiv = document.createElement('div');
  houseDiv.className = 'house-icon' + (tier === 3 ? ' mansion-house' : '');
  houseDiv.textContent = ['', '🏚️', '🏠', '🏰'][tier];
  cellEl.appendChild(houseDiv);
  if (tier === 3) cellEl.classList.add('house-mansion');
}

function countBrickFrames() {
  let count = 0;
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (frameTiers[r][row] === 3) count++;
  return count;
}

async function animateBrickBuild(cells) {
  const reelStrips = getReelStrips();
  for (const { reel, row } of cells) {
    const cellEl = reelStrips[reel].querySelectorAll('.sym-cell')[row];
    const frameEl = cellEl && cellEl.querySelector('.frame-tier-3');
    if (!frameEl) continue;
    frameEl.classList.add('brick-building');
    for (const t of [0, 250, 500, 750]) setTimeout(() => synth.brickLay(), t);
    const rect = cellEl.getBoundingClientRect();
    const cr = particleContainer.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 - cr.left, cy = rect.top + rect.height / 2 - cr.top;
    setTimeout(() => spawnSparkles(cx - rect.width / 2, cy - rect.height / 2, 4), 100);
    setTimeout(() => spawnSparkles(cx + rect.width / 2, cy - rect.height / 2, 4), 300);
    setTimeout(() => spawnSparkles(cx + rect.width / 2, cy + rect.height / 2, 4), 550);
    setTimeout(() => spawnSparkles(cx - rect.width / 2, cy + rect.height / 2, 4), 800);
    await sleep(1200);
    frameEl.classList.remove('brick-building');
    frameEl.classList.add('brick-complete');
    synth.houseAward(3);
    spawnSparkles(cx, cy, 12);
    await sleep(500);
    frameEl.classList.remove('brick-complete');
  }
}

function renderFrameOverlays() {
  clearFrameOverlays();
  const reelStrips = getReelStrips();
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++) {
      const tier = frameTiers[r][row];
      if (tier === 0) continue;
      const cell = reelStrips[r].querySelectorAll('.sym-cell')[row];
      if (!cell) continue;
      cell.classList.remove('frame-straw', 'frame-stick', 'frame-brick');
      cell.classList.add(['', 'frame-straw', 'frame-stick', 'frame-brick'][tier]);
      const overlay = document.createElement('div');
      overlay.className = 'frame-overlay frame-tier-' + tier;
      cell.appendChild(overlay);
      if (tier > prevFrameTiers[r][row]) {
        cell.classList.remove('frame-pop');
        void cell.offsetWidth;
        cell.classList.add('frame-pop');
      }
    }
  prevFrameTiers = frameTiers.map(col => [...col]);
}

function clearFrameOverlays() {
  document.querySelectorAll('.frame-overlay').forEach(el => el.remove());
  document.querySelectorAll('.frame-straw, .frame-stick, .frame-brick')
    .forEach(el => el.classList.remove('frame-straw', 'frame-stick', 'frame-brick'));
}

/* ══════════════════════════════════════════
   OVERLAYS / HUD / small helpers
══════════════════════════════════════════ */
function showBonusOverlay(title, phase) {
  if (!bonusOverlay) return;
  bonusTitle.textContent = title;
  bonusPhaseLabel.textContent = phase;
  bonusOverlay.classList.remove('hidden');
}
function hideBonusOverlay() { if (bonusOverlay) bonusOverlay.classList.add('hidden'); }

function showMansionOverlay(spinsRemaining, isJackpot = false) {
  if (!mansionOverlay) return;
  if (mansionSubtitle) mansionSubtitle.textContent = isJackpot ? 'MANSION JACKPOT AWARDED!' : `${spinsRemaining} FREE GAMES REMAINING`;
  if (mansionTitle) mansionTitle.textContent = isJackpot ? '🏰 MANSION JACKPOT!' : 'MANSIONS FEATURE';
  if (mansionPress) mansionPress.textContent = isJackpot ? 'CONGRATULATIONS!' : 'PRESS PLAY!';
  mansionOverlay.classList.remove('hidden');
}
function hideMansionOverlay() { if (mansionOverlay) mansionOverlay.classList.add('hidden'); }

function updateBonusHUD() {
  if (bonusSpinsLeft) bonusSpinsLeft.textContent = bonusFreeSpins;
  if (bonusWinDisplay) bonusWinDisplay.textContent = fmt(bonusTotalWin);
}

function shake(ms) {
  cabinet.classList.add('screen-shake');
  setTimeout(() => cabinet.classList.remove('screen-shake'), ms);
}
function sparkleAt(cellEl, n) {
  const rect = cellEl.getBoundingClientRect();
  const cr = particleContainer.getBoundingClientRect();
  spawnSparkles(rect.left + rect.width / 2 - cr.left, rect.top + rect.height / 2 - cr.top, n);
}
