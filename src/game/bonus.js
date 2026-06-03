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

import { HAT_IDS, MAX_FRAME_TIER, BONUS_CONFIG, BET_LEVELS } from '../math/par-sheet.js';
import { DEV_MODE } from '../system/dev-mode.js';
import { alphaSrc, IS_MOBILE } from '../system/video-format.js';   // WebM → HEVC-alpha .mp4 on Safari
import { state } from '../core/state.js';
import { sleep, fmt } from '../core/utils.js';
import { synth, bgm } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';
import { conductor } from '../audio/conductor.js';   // leitmotif on bonus entry
import { generateGrid, evaluateGrid, rollHouseAward, rollMansionAward, expandWilds } from '../math/mathcore.js';
import { animateAllReels, highlightWinners, clearHighlights, animateWinCount, getReelStrips, expandWildReel } from '../render/reels.js';
import {
  spawnCoinShower, spawnCoinFountain, spawnDollarBills, spawnConfetti, spawnSparkles,
  spawnStarbursts, spawnWinVignette, spawnWinPopText,
  playWinPresentation, startWindStorm
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
const mansionPoster   = document.getElementById('mansion-poster');   // Wanted-poster reveal video
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
    // Try with sound; fall back to muted so it always shows.
    wolfTornadoVideo.muted = false;
    wolfTornadoVideo.play().catch(() => {
      wolfTornadoVideo.muted = true;
      wolfTornadoVideo.play().catch(finish);
    });
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
  synth.stopAll();
  narrator.stop();

  // bonus intro video plays inside the reel window as soon as the bonus triggers
  await playBonusIntro();

  // music comes back right away (skip or finish) as the bigger, epic bonus score
  bgm.switchToBonus(700);
  conductor.onBonusEnter();   // state the heroic leitmotif over the entrance

  // trigger hats become the first straw frames
  const triggerUpgrades = [];
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++)
      if (HAT_IDS.includes(triggerGrid[r][row])) {
        const old = frameTiers[r][row];
        frameTiers[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
        if (frameTiers[r][row] > old) triggerUpgrades.push({ reel: r, row, tier: frameTiers[r][row] });
      }

  synth.bonusSiren();
  showBonusOverlay('BONUS REEL FEATURE!', 'FREE SPINS STARTING');
  narrator.onBonusEnter();   // "Bonus round, partner…" once the title is up
  if (bonusHud) bonusHud.classList.remove('hidden');
  shake(600);
  await sleep(2800);
  hideBonusOverlay();

  renderFrameLayers();
  updateBonusHUD();
  await animateFrameUpgrades(triggerUpgrades);   // play the straw-frame morph on the trigger cells
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

    // expanding wilds during free spins too
    const { grid: shownGrid, wildReels } = expandWilds(targetGrid);
    state.currentGrid = shownGrid;
    if (wildReels.length > 0) {
      synth.wolfHowl();
      wildReels.forEach(r => expandWildReel(r, shownGrid[r]));
      await sleep(650);
    }

    // line wins still pay during free spins
    const { totalWin, winners } = evaluateGrid(shownGrid, bonusBet);
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
    const upgradedCells = [];
    for (let r = 0; r < 5; r++)
      for (let row = 0; row < 3; row++)
        if (HAT_IDS.includes(targetGrid[r][row])) {
          const old = frameTiers[r][row];
          frameTiers[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
          newHats++;
          if (frameTiers[r][row] > old) upgradedCells.push({ reel: r, row, tier: frameTiers[r][row] });
          if (old === 2 && frameTiers[r][row] === 3) newBrickCells.push({ reel: r, row });
        }
    renderFrameLayers();
    await animateFrameUpgrades(upgradedCells);   // morph each upgraded house in place (straw/wood/brick)

    if (newHats > 0) {
      if (newBrickCells.length > 0) narrator.onFrameUpgrade(3);
      else narrator.onFrameUpgrade(Math.min(frameTiers.flat().filter(t => t > 0).slice(-1)[0] || 1, 2));
    }

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
  bgm.pauseForCutscene();
  synth.stopAll();
  narrator.stop();
  await playWolfTornado();
  bgm.resumeFromCutscene(400);

  const framedCells = [];
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++)
      if (frameTiers[r][row] > 0) framedCells.push({ reel: r, row, tier: frameTiers[r][row] });
  framedCells.sort((a, b) => a.tier - b.tier);   // straw first

  // The blow becomes a screen-wide tornado: wind, leaves and debris everywhere
  // while each house is tested by it (straw/wood scatter, brick stands firm).
  const storm = framedCells.length ? startWindStorm() : null;
  let gustTimer, leafTimer, shakeTimer;
  if (storm) {
    synth.windStart();
    synth.windGust();
    gustTimer  = setInterval(() => synth.windGust(), 2300);
    leafTimer  = setInterval(() => synth.leavesRustle(), 1500);
    shakeTimer = setInterval(() => shake(220), 1900);   // periodic gusts rattle the cabinet
  }

  for (const { reel, row, tier } of framedCells) {
    const cellEl = reelStrips[reel].querySelectorAll('.sym-cell')[row];
    if (!cellEl) continue;
    const slot = frameSlotFor(reel, row, false);   // the persistent locked frame

    narrator.onWolfBlow(tier);

    cellEl.classList.add('bonus-shake');
    if (slot) slot.classList.add('bonus-shake');   // the locked frame rattles, then breaks
    synth.houseBreak(tier);          // straw scatters / sticks crash / bricks hold
    if (tier === 3) shake(600);
    await sleep(800);
    cellEl.classList.remove('bonus-shake');
    removeFrameSlot(reel, row);                     // house blown down — the frame is gone

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

  // the storm dies down once every house has been tested
  if (storm) {
    clearInterval(gustTimer); clearInterval(leafTimer); clearInterval(shakeTimer);
    synth.windStop();
    storm.stop();
  }

  cabinet.classList.remove('wolf-reveal-active');
  await endBonus();
}

/* ══════════════════════════════════════════
   MANSION JACKPOT
══════════════════════════════════════════ */
async function triggerMansionsJackpot(brickCount) {
  setStatus('⭐ WANTED REWARD! ⭐', 'win');
  shake(600);
  synth.trainWhistle();         // the reward train rolls in…
  synth.coinShower();
  narrator.onMansionJackpot();  // "Congratulations, partner! You just won the Wanted Reward!"
  showMansionOverlay();
  spawnCoinShower(40, 3000);
  await sleep(3000);
  hideMansionOverlay();

  const award = Math.round(rollMansionAward(brickCount, bonusBet) * 100) / 100;
  bonusTotalWin += award;
  setStatus(`⭐ WANTED REWARD: ${fmt(award)}! ⭐`, 'win');
  bigWinLabel.textContent = 'WANTED ⭐ REWARD!';
  bigWinLabel.className = '';   // clear any base-game tier class (mega/epic/colossal)
  bigWinAmt.textContent = fmt(award);
  bigWinOver.classList.remove('hidden');
  shake(600);
  spawnCoinShower(60, 4000);
  await animateWinCount(bonusTotalWin, 2000);
  updateBonusHUD();
  await sleep(3500);
  bigWinOver.classList.add('hidden');
}

/* ── Dev-only: preview the Mansion feature without playing a whole bonus ──
   Runs the exact MANSIONS overlay → jackpot big-win presentation with a sample
   award (scaled to the current bet), then cleans up. Does NOT touch the player's
   balance or any real bonus state. Wired to the dev "🏰 Mansion Feature" button. */
export async function demoMansion() {
  if (bonusActive || state.spinning) return;          // never collide with live play

  const bet = BET_LEVELS[state.betIndex] || 1;
  const brickCount = BONUS_CONFIG.mansion.minBricks + 2;   // a healthy 5-brick board
  const award = Math.round(rollMansionAward(brickCount, bet) * 100) / 100;

  state.spinning = true;                               // lock the controls during the show
  setControlsEnabled(false);

  // Beat 1 — the WANTED REWARD overlay
  setStatus('⭐ WANTED REWARD! ⭐', 'win');
  shake(600);
  synth.trainWhistle();
  synth.coinShower();
  narrator.onMansionJackpot();  // "Congratulations, partner! You just won the Wanted Reward!"
  showMansionOverlay();
  spawnCoinShower(40, 3000);
  await sleep(3000);
  hideMansionOverlay();

  // Beat 2 — the reward big-win count-up
  setStatus(`⭐ WANTED REWARD: ${fmt(award)}! ⭐`, 'win');
  bigWinLabel.textContent = 'WANTED ⭐ REWARD!';
  bigWinLabel.className = '';
  bigWinAmt.textContent = fmt(award);
  bigWinOver.classList.remove('hidden');
  shake(600);
  spawnCoinShower(60, 4000);
  await animateWinCount(award, 2000);
  await sleep(3000);
  bigWinOver.classList.add('hidden');

  // Clean up — it was only a preview, so leave balance/win untouched.
  elWin.textContent = fmt(0);
  setStatus('GOOD LUCK – PRESS SPIN!');
  state.spinning = false;
  setControlsEnabled(true);
}

// Dev "🏰 Mansion Feature" button → play the preview on demand.
const btnDemoMansion = document.getElementById('btn-demo-mansion');
if (btnDemoMansion) btnDemoMansion.addEventListener('click', () => demoMansion());

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

  clearFrameLayers();
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

   Huff-&-Puff "hold" frames: once a house frame is built on a cell it STAYS
   locked in that grid position for the rest of the bonus and upgrades in place
   (straw → wood → brick). To make it truly persistent we render the frames on a
   per-column overlay LAYER (a child of .reel-col, NOT of the spinning strip), so
   the symbols can keep spinning behind a frame that never moves or flickers. The
   `frameTiers` grid stays the single source of truth and matches the headless
   math in mathcore.simulateBonusOutcome (so RTP is unchanged).
══════════════════════════════════════════ */
const FRAME_TIER_CLASS = ['', 'frame-tier-1', 'frame-tier-2', 'frame-tier-3'];

/* The upgrade-morph videos — transparent center (the symbol shows through) with
   edges that animate from nothing into the new frame material. Keyed by the tier
   they PRODUCE, so future materials drop in by adding a file here. */
const FRAME_UPGRADE_VIDEOS = {
  1: 'assets/webm/F1-straw.webm',
  2: 'assets/webm/F2-wood.webm',
  3: 'assets/webm/F3-brick.webm',
};

/* Resolution at which a morph's last frame is snapshotted onto its persistent
   still canvas. The frame is 720² source; this is plenty crisp for a reel cell
   while staying light (one small bitmap per built frame, no video kept alive). */
const STILL_CAPTURE_PX = 384;

/** The persistent frame layer for a reel column (lazily created, lives on the col). */
function frameLayerFor(reel) {
  const col = document.getElementById('reel-' + reel);
  if (!col) return null;
  let layer = col.querySelector('.frame-layer');
  if (!layer) { layer = document.createElement('div'); layer.className = 'frame-layer'; col.appendChild(layer); }
  return layer;
}

/** The frame slot for a given cell (one fixed grid position), created on demand. */
function frameSlotFor(reel, row, create = false) {
  const layer = frameLayerFor(reel);
  if (!layer) return null;
  let slot = layer.querySelector('.frame-slot[data-row="' + row + '"]');
  if (!slot && create) {
    slot = document.createElement('div');
    slot.className = 'frame-slot';
    slot.dataset.row = row;
    slot.style.top = 'calc(var(--cell-size) * ' + row + ')';   // pinned to its row, resize-safe
    const overlay = document.createElement('div');
    overlay.className = 'frame-overlay';
    slot.appendChild(overlay);
    layer.appendChild(slot);
  }
  return slot;
}

function removeFrameSlot(reel, row) {
  const slot = frameSlotFor(reel, row, false);
  if (slot) slot.remove();
}

/**
 * Sync the persistent frame layers to `frameTiers`. Frames already on screen stay
 * put (the layer is never torn down by a spin); this only adds new slots and sets
 * each slot's material. Cells that UPGRADED this step keep showing their OLD frame
 * here — animateFrameUpgrades plays the morph and reveals the new frame on landing,
 * so the upgrade reads as a smooth straw→wood→brick transition.
 */
function renderFrameLayers() {
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++) {
      const tier = frameTiers[r][row];
      const prev = prevFrameTiers[r][row];
      if (tier === 0) { removeFrameSlot(r, row); continue; }
      const slot = frameSlotFor(r, row, true);
      const overlay = slot.querySelector('.frame-overlay');
      // The persistent still (PNG/frozen video) is the real visual; the CSS frame
      // is only a placeholder shown until a still exists for this cell.
      const hasStill = !!slot.querySelector('.frame-still');
      const showTier = tier > prev ? prev : tier;              // hold the old material until the morph lands
      overlay.className = 'frame-overlay' + (!hasStill && showTier > 0 ? ' ' + FRAME_TIER_CLASS[showTier] : '');
      if (tier > prev) { slot.classList.remove('frame-pop'); void slot.offsetWidth; slot.classList.add('frame-pop'); }
    }
  prevFrameTiers = frameTiers.map(col => [...col]);
}

function clearFrameLayers() {
  document.querySelectorAll('.frame-layer').forEach(el => el.remove());
}

/**
 * Play the upgrade-morph video on each freshly-upgraded cell, on the persistent
 * frame layer. While the video plays the cell shows its previous material (or
 * nothing, for a brand-new straw frame); when the video lands we reveal the new
 * material underneath as the video cross-fades out. Resolves once every video has
 * finished (or a safety timeout fires).
 */
async function animateFrameUpgrades(cells) {
  if (!cells || !cells.length) return;
  await Promise.all(cells.map(({ reel, row, tier }) => new Promise(resolve => {
    const slot = frameSlotFor(reel, row, true);
    const overlay = slot && slot.querySelector('.frame-overlay');
    const src = FRAME_UPGRADE_VIDEOS[tier];
    if (!src || !slot) {                                         // defensive: no morph for this tier
      if (overlay) overlay.className = 'frame-overlay ' + FRAME_TIER_CLASS[tier];
      return resolve();
    }

    synth.frameBuild(tier);                                      // straw woven / wood nailed / brick laid

    const vid = document.createElement('video');
    vid.className = 'frame-upgrade-vid';
    vid.src = alphaSrc(src);                                     // .mp4 (HEVC-alpha) on Safari, .webm elsewhere
    vid.muted = true;
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.preload = 'auto';
    slot.appendChild(vid);

    let done = false;
    const land = () => {
      if (done) return; done = true;
      try { vid.pause(); } catch (e) {}      // stop on the very last frame
      setFrameStill(slot, tier, vid);         // snapshot that last frame → persistent still; drop the video
      sparkleAt(slot, 9);                      // a little burst so each upgrade reads as a reward
      resolve();
    };
    vid.addEventListener('ended', land);
    vid.addEventListener('error', land);
    // Start the morph once it actually has data (don't .catch→land, which would
    // snapshot the blank first frame if play() rejects). Muted autoplay is allowed.
    const begin = () => { const p = vid.play(); if (p) p.catch(() => {}); };
    if (vid.readyState >= 2) begin();
    else vid.addEventListener('loadeddata', begin, { once: true });
    setTimeout(land, 7000);                   // safety net: by now the morph has played through
  })));
}

/**
 * Lock in a frame's persistent end-state after its upgrade morph finishes, and
 * hold it until the next upgrade (or until the bonus ends). We snapshot the
 * morph's LAST frame onto a lightweight <canvas> — which preserves the transparent
 * center so the reel symbol shows through — and then drop the video, so no PNG
 * asset is needed and no video decoder is kept alive. If the snapshot ever fails
 * (e.g. the frame isn't decoded yet) we fall back to freezing the paused video.
 */
function setFrameStill(slot, tier, morphVid) {
  if (!slot) return;
  const oldStill = slot.querySelector('.frame-still');
  const overlay  = slot.querySelector('.frame-overlay');

  const freezeVideo = () => {                 // fallback: keep the morph video, paused on its last frame
    if (!morphVid) return;
    if (oldStill) oldStill.remove();
    try { morphVid.pause(); } catch (e) {}
    morphVid.classList.remove('fading', 'frame-upgrade-vid');
    morphVid.classList.add('frame-still');    // demote to the persistent layer (below the next morph)
    if (overlay) overlay.className = 'frame-overlay';
  };

  if (!morphVid) return;
  try {
    const w = morphVid.videoWidth, h = morphVid.videoHeight;
    if (!w || !h) { freezeVideo(); return; }
    const cv = document.createElement('canvas');
    cv.className = 'frame-still';
    cv.width = STILL_CAPTURE_PX;
    cv.height = STILL_CAPTURE_PX;
    const ctx = cv.getContext('2d');          // alpha:true by default → transparent center is kept
    ctx.clearRect(0, 0, STILL_CAPTURE_PX, STILL_CAPTURE_PX);
    ctx.drawImage(morphVid, 0, 0, STILL_CAPTURE_PX, STILL_CAPTURE_PX);

    // Guard: make sure we actually captured the built frame and not a blank first
    // frame (which would happen if the morph never played). The frame's edges are
    // opaque, so at least one border sample must have alpha.
    const S = STILL_CAPTURE_PX;
    const pts = [[S >> 1, 2], [S >> 1, S - 3], [2, S >> 1], [S - 3, S >> 1], [4, 4], [S - 4, S - 4]];
    let maxA = 0;
    for (const [x, y] of pts) { const a = ctx.getImageData(x, y, 1, 1).data[3]; if (a > maxA) maxA = a; }
    if (maxA < 8) {                           // blank snapshot → show the CSS frame instead of nothing
      if (oldStill) oldStill.remove();
      morphVid.remove();
      if (overlay) overlay.className = 'frame-overlay ' + FRAME_TIER_CLASS[tier];
      return;
    }

    slot.appendChild(cv);                     // the frozen bitmap slots in beneath the paused video…
    if (oldStill) oldStill.remove();
    morphVid.remove();                        // …then the video (and its decoder) is released
    if (overlay) overlay.className = 'frame-overlay';
  } catch (e) {
    freezeVideo();                            // any capture failure → just freeze the video
  }
}

function countBrickFrames() {
  let count = 0;
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (frameTiers[r][row] === 3) count++;
  return count;
}

/** Blow a built frame down and show its house/prize on the cell. */
function updateCellToHouse(cellEl, tier) {
  cellEl.classList.add('is-house-revealed');
  cellEl.classList.add(['', 'house-straw', 'house-stick', 'house-brick'][tier]);
  const houseDiv = document.createElement('div');
  houseDiv.className = 'house-icon' + (tier === 3 ? ' mansion-house' : '');
  const houseImg = document.createElement('img');
  // the blown-down house shows its bonus pig: straw → wood → brick
  houseImg.src = ['', 'assets/bonus_pig_straw.webp', 'assets/bonus_pig_wood.webp', 'assets/bonus_pig_brick.webp'][tier];
  houseImg.style.width = '85%';
  houseImg.style.height = '85%';
  houseImg.style.objectFit = 'contain';
  houseImg.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))';
  houseDiv.appendChild(houseImg);
  cellEl.appendChild(houseDiv);
  if (tier === 3) cellEl.classList.add('house-mansion');
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

function showMansionOverlay() {
  if (!mansionOverlay) return;
  // Image-only reveal — the poster fills the frame and the wolf narrates the win.
  // Play the clip on capable browsers; iOS shows the still poster image instead.
  if (mansionPoster && !IS_MOBILE) {
    if (!mansionPoster.getAttribute('src')) mansionPoster.src = 'assets/webm/Wanted_poster.webm';
    try { mansionPoster.currentTime = 0; mansionPoster.play().catch(() => {}); } catch (e) {}
  }
  mansionOverlay.classList.remove('hidden');
}
function hideMansionOverlay() {
  if (mansionOverlay) mansionOverlay.classList.add('hidden');
  if (mansionPoster && !IS_MOBILE) { try { mansionPoster.pause(); } catch (e) {} }   // free the decoder
}

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

/* ── Dev-only test hook (DEV_MODE) ──
   Drives the real frame render/upgrade/persist functions so the Huff-&-Puff
   hold-frame behaviour can be exercised without a live reel spin (headless test
   harnesses can't run the rAF-driven reels). No effect on gameplay. */
if (DEV_MODE && typeof window !== 'undefined') {
  window.__frames = {
    grid:       () => frameTiers.map(c => [...c]),
    setTier:    (r, row, t) => { frameTiers[r][row] = t; },
    render:     () => renderFrameLayers(),
    upgrade:    (cells) => animateFrameUpgrades(cells),
    removeSlot: (r, row) => removeFrameSlot(r, row),
    clear:      () => clearFrameLayers(),
    reset:      () => { frameTiers = makeGrid(); prevFrameTiers = makeGrid(); clearFrameLayers(); },
    wind:       () => startWindStorm(),    // returns a controller with stop()
    windSound:  () => { synth.windStart(); synth.windGust(); },
    slots: () => [...document.querySelectorAll('.frame-layer .frame-slot')].map(s => {
      const ov = s.querySelector('.frame-overlay');
      const still = s.querySelector('.frame-still');
      return {
        reel: s.parentElement.parentElement.id,
        row: +s.dataset.row,
        overlay: ov ? ov.className.replace('frame-overlay', '').trim() : null,
        still: still ? still.tagName : null,
      };
    }),
  };
}
