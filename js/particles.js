/**
 * @module particles
 * @description Pure eye-candy: coins, sparkles, confetti, dollar bills, wind,
 * and the ambient gold dust. Every function builds DOM nodes with CSS-animation
 * classes (defined in styles.css) and removes them when the animation ends.
 */
'use strict';

import { synth } from './audio.js';
import { fmt } from './utils.js';

const particleContainer = document.getElementById('particle-container');
const ambientContainer  = document.getElementById('ambient-particles');
const reelStrips = [0, 1, 2, 3, 4].map(i => document.getElementById(`strip-${i}`));

/** Coins raining down from the top of the reel window. */
export function spawnCoinShower(count = 20, durationMs = 2000) {
  if (!particleContainer) return;
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.className = 'particle particle-coin';
    coin.style.left = (Math.random() * 90 + 5) + '%';
    coin.style.top = '-20px';
    const scale = 0.6 + Math.random() * 0.8;
    coin.style.width = (20 * scale) + 'px';
    coin.style.height = (20 * scale) + 'px';
    coin.style.animationDelay = (Math.random() * durationMs * 0.5) + 'ms';
    coin.style.animationDuration = (1200 + Math.random() * 1200) + 'ms';
    particleContainer.appendChild(coin);
    setTimeout(() => { if (coin.parentNode) coin.remove(); }, durationMs + 2000);
  }
}

/** Coins bursting upward from the bottom in physics arcs (with clink sounds). */
export function spawnCoinFountain(count = 15, durationMs = 2000) {
  if (!particleContainer) return;
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.className = 'particle particle-coin-fountain';
    coin.style.left = ((0.3 + Math.random() * 0.4) * 100) + '%';   // center-biased
    const scale = 0.7 + Math.random() * 0.6;
    coin.style.width = (22 * scale) + 'px';
    coin.style.height = (22 * scale) + 'px';
    const driftDir = Math.random() > 0.5 ? 1 : -1;
    const driftMag = 20 + Math.random() * 80;
    coin.style.setProperty('--launch-y', -(200 + Math.random() * 200) + 'px');
    coin.style.setProperty('--peak-y', -(300 + Math.random() * 200) + 'px');
    coin.style.setProperty('--mid-y', -(100 + Math.random() * 150) + 'px');
    coin.style.setProperty('--drift-x1', (driftDir * driftMag * 0.3) + 'px');
    coin.style.setProperty('--drift-x2', (driftDir * driftMag * 0.6) + 'px');
    coin.style.setProperty('--drift-x3', (driftDir * driftMag * 0.8) + 'px');
    coin.style.setProperty('--drift-x4', (driftDir * driftMag) + 'px');
    const delay = Math.random() * durationMs * 0.4;
    coin.style.animationDelay = delay + 'ms';
    coin.style.animationDuration = (1400 + Math.random() * 800) + 'ms';
    particleContainer.appendChild(coin);
    setTimeout(() => synth.coinClink(), delay + 100 + Math.random() * 200);
    setTimeout(() => { if (coin.parentNode) coin.remove(); }, delay + 2500);
  }
}

/** A radial sparkle burst centered at (x, y) within the particle container. */
export function spawnSparkles(x, y, count = 8) {
  if (!particleContainer) return;
  const colors = ['#FFE000', '#FFFFFF', '#FFB000', '#FF8800', '#88FF88'];
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'particle particle-sparkle';
    spark.style.left = x + 'px';
    spark.style.top = y + 'px';
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
    const dist = 20 + Math.random() * 40;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    spark.style.setProperty('--dx', dx + 'px');
    spark.style.setProperty('--dy', dy + 'px');
    spark.style.setProperty('--dx2', dx * 1.5 + 'px');
    spark.style.setProperty('--dy2', (dy * 1.5 + 20) + 'px');
    spark.style.background = colors[Math.floor(Math.random() * colors.length)];
    particleContainer.appendChild(spark);
    setTimeout(() => { if (spark.parentNode) spark.remove(); }, 900);
  }
}

/** Horizontal wind streaks inside a container (used for the wolf's huff). */
export function spawnWindParticles(containerEl, count = 12) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const wind = document.createElement('div');
      wind.className = 'wind-particle';
      wind.style.top = (Math.random() * 80 + 10) + '%';
      wind.style.left = '-40px';
      wind.style.width = (30 + Math.random() * 40) + 'px';
      wind.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
      containerEl.appendChild(wind);
      setTimeout(() => { if (wind.parentNode) wind.remove(); }, 1200);
    }, i * 100);
  }
}

/** Dollar bills floating up from the bottom, swaying and spinning. */
export function spawnDollarBills(count = 10, durationMs = 2500) {
  if (!particleContainer) return;
  for (let i = 0; i < count; i++) {
    const bill = document.createElement('div');
    bill.className = 'particle-dollar';
    bill.style.left = (10 + Math.random() * 80) + '%';
    const scale = 0.7 + Math.random() * 0.6;
    bill.style.width = (40 * scale) + 'px';
    bill.style.height = (20 * scale) + 'px';
    const dir = Math.random() > 0.5 ? 1 : -1;
    bill.style.setProperty('--rise-y1', -(80 + Math.random() * 120) + 'px');
    bill.style.setProperty('--rise-y2', -(200 + Math.random() * 150) + 'px');
    bill.style.setProperty('--rise-y3', -(300 + Math.random() * 150) + 'px');
    bill.style.setProperty('--rise-y4', -(400 + Math.random() * 150) + 'px');
    bill.style.setProperty('--sway-x1', (dir * (10 + Math.random() * 30)) + 'px');
    bill.style.setProperty('--sway-x2', (-dir * (15 + Math.random() * 40)) + 'px');
    bill.style.setProperty('--sway-x3', (dir * (10 + Math.random() * 50)) + 'px');
    bill.style.setProperty('--sway-x4', (-dir * (5 + Math.random() * 30)) + 'px');
    bill.style.setProperty('--spin1', (dir * (10 + Math.random() * 20)) + 'deg');
    bill.style.setProperty('--spin2', (-dir * (5 + Math.random() * 15)) + 'deg');
    bill.style.setProperty('--spin3', (dir * (15 + Math.random() * 25)) + 'deg');
    bill.style.setProperty('--spin4', (-dir * (10 + Math.random() * 20)) + 'deg');
    const delay = Math.random() * durationMs * 0.5;
    bill.style.animationDelay = delay + 'ms';
    bill.style.animationDuration = (2000 + Math.random() * 1500) + 'ms';
    particleContainer.appendChild(bill);
    setTimeout(() => { if (bill.parentNode) bill.remove(); }, delay + 4000);
  }
}

/** Confetti raining from the top. */
export function spawnConfetti(count = 30, durationMs = 2500) {
  if (!particleContainer) return;
  const colors = ['#F5C400', '#FF4060', '#2EE85A', '#4488FF', '#FF8800', '#FF44FF', '#FFFFFF', '#00DDFF'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'particle-confetti';
    piece.style.left = (5 + Math.random() * 90) + '%';
    piece.style.setProperty('--conf-w', (4 + Math.random() * 8) + 'px');
    piece.style.setProperty('--conf-h', (8 + Math.random() * 12) + 'px');
    piece.style.setProperty('--conf-color', colors[Math.floor(Math.random() * colors.length)]);
    piece.style.setProperty('--conf-drift', ((Math.random() - 0.5) * 100) + 'px');
    const delay = Math.random() * durationMs * 0.4;
    piece.style.animationDelay = delay + 'ms';
    piece.style.animationDuration = (1800 + Math.random() * 1200) + 'ms';
    particleContainer.appendChild(piece);
    setTimeout(() => { if (piece.parentNode) piece.remove(); }, delay + 3500);
  }
}

/** Golden starburst flashes behind winning cells. cells = [[reel,row], …]. */
export function spawnStarbursts(winnerCells) {
  if (!particleContainer) return;
  winnerCells.forEach(([reelIdx, rowIdx]) => {
    const cell = reelStrips[reelIdx] && reelStrips[reelIdx].querySelectorAll('.sym-cell')[rowIdx];
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const cr = particleContainer.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'particle-starburst';
    burst.style.left = (rect.left + rect.width / 2 - cr.left - 40) + 'px';
    burst.style.top = (rect.top + rect.height / 2 - cr.top - 40) + 'px';
    particleContainer.appendChild(burst);
    setTimeout(() => { if (burst.parentNode) burst.remove(); }, 1000);
  });
}

/** Coins cascading down both side edges (big-win flourish). */
export function spawnSideWaterfall(countPerSide = 15, durationMs = 3000) {
  if (!particleContainer) return;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < countPerSide; i++) {
      const coin = document.createElement('div');
      coin.className = 'particle-side-coin';
      if (side === 0) {
        coin.style.left = (Math.random() * 30) + 'px';
        coin.style.setProperty('--side-drift', (5 + Math.random() * 20) + 'px');
      } else {
        coin.style.right = (Math.random() * 30) + 'px';
        coin.style.left = 'auto';
        coin.style.setProperty('--side-drift', -(5 + Math.random() * 20) + 'px');
      }
      const scale = 0.6 + Math.random() * 0.8;
      coin.style.width = (16 * scale) + 'px';
      coin.style.height = (16 * scale) + 'px';
      const delay = Math.random() * durationMs * 0.7;
      coin.style.animationDelay = delay + 'ms';
      coin.style.animationDuration = (800 + Math.random() * 1200) + 'ms';
      particleContainer.appendChild(coin);
      setTimeout(() => synth.coinClink(), delay + 50 + Math.random() * 150);
      setTimeout(() => { if (coin.parentNode) coin.remove(); }, delay + 2500);
    }
  }
}

/** Flash a golden vignette inside the reel window. */
export function spawnWinVignette() {
  const reelWindow = document.getElementById('reel-window');
  if (!reelWindow) return;
  const vig = document.createElement('div');
  vig.className = 'win-vignette';
  reelWindow.appendChild(vig);
  setTimeout(() => { if (vig.parentNode) vig.remove(); }, 800);
}

/** Floating "+$X.XX" text that pops and fades. */
export function spawnWinPopText(amount) {
  if (!particleContainer) return;
  const pop = document.createElement('div');
  pop.className = 'win-pop-text';
  pop.textContent = '+' + fmt(amount);
  pop.style.left = (35 + Math.random() * 30) + '%';
  pop.style.top = (30 + Math.random() * 30) + '%';
  particleContainer.appendChild(pop);
  setTimeout(() => { if (pop.parentNode) pop.remove(); }, 1800);
}

/** Wind lines + swirls for the wolf's blow, scaled by house tier. */
export function spawnWolfWindBlast(wolfWindBlast, tier) {
  if (!wolfWindBlast) return;
  wolfWindBlast.innerHTML = '';
  const lineCount = tier === 3 ? 12 : tier === 2 ? 8 : 5;
  const swirlCount = tier === 3 ? 8 : tier === 2 ? 5 : 3;
  for (let i = 0; i < lineCount; i++) {
    const line = document.createElement('div');
    line.className = 'wind-blast-line';
    line.style.top = (30 + Math.random() * 40) + '%';
    line.style.height = (2 + Math.random() * 3) + 'px';
    line.style.animationDelay = (i * 0.04) + 's';
    line.style.animationDuration = (0.4 + Math.random() * 0.3) + 's';
    line.style.opacity = (0.4 + Math.random() * 0.6);
    wolfWindBlast.appendChild(line);
    setTimeout(() => { if (line.parentNode) line.remove(); }, 1200);
  }
  for (let i = 0; i < swirlCount; i++) {
    const swirl = document.createElement('div');
    swirl.className = 'wind-swirl';
    swirl.style.top = (25 + Math.random() * 50) + '%';
    swirl.style.left = '0';
    swirl.style.animationDelay = (i * 0.06 + 0.1) + 's';
    swirl.style.width = (4 + Math.random() * 6) + 'px';
    swirl.style.height = swirl.style.width;
    wolfWindBlast.appendChild(swirl);
    setTimeout(() => { if (swirl.parentNode) swirl.remove(); }, 1500);
  }
}

/** Continuous background gold-dust motes. Call once at startup. */
export function startAmbientParticles() {
  if (!ambientContainer) return;
  const types = ['gold', 'gold', 'gold', 'green', 'white'];
  function spawnMote() {
    const mote = document.createElement('div');
    mote.className = `ambient-mote ${types[Math.floor(Math.random() * types.length)]}`;
    const size = 2 + Math.random() * 4;
    mote.style.width = size + 'px';
    mote.style.height = size + 'px';
    mote.style.left = (Math.random() > 0.3 ? 25 + Math.random() * 50 : Math.random() * 100) + '%';
    mote.style.bottom = '-10px';
    mote.style.setProperty('--mote-dx', ((Math.random() - 0.5) * 80) + 'px');
    mote.style.setProperty('--mote-dy', -(150 + Math.random() * 300) + 'px');
    const duration = 4000 + Math.random() * 6000;
    mote.style.animation = `mote-float ${duration}ms ease-out forwards`;
    ambientContainer.appendChild(mote);
    setTimeout(() => { if (mote.parentNode) mote.remove(); }, duration + 100);
  }
  (function scheduleNext() {
    setTimeout(() => { spawnMote(); scheduleNext(); }, 400 + Math.random() * 400);
  })();
  for (let i = 0; i < 5; i++) setTimeout(spawnMote, i * 200);
}

/** 
 * Centralized win presentation logic to DRY up the game loop.
 * Plays the appropriate particles and coin clinks based on the win ratio.
 */
export function playWinPresentation(ratio, isMega = false) {
  if (isMega) {
    spawnCoinShower(60, 3500);
    spawnCoinFountain(40, 3500);
    spawnDollarBills(20, 3500);
    spawnConfetti(50, 3500);
    spawnSideWaterfall(25, 3500);
    setTimeout(() => {
      spawnCoinFountain(20, 2000); 
      spawnDollarBills(10, 2000); 
      spawnConfetti(25, 2000);
      spawnWinVignette();
    }, 1500);
    for (let i = 0; i < 5; i++) setTimeout(() => synth.coinClink(), 200 + i * 150);
  } else if (ratio >= 8) {
    spawnCoinShower(40, 2500);
    spawnCoinFountain(25, 2500);
    spawnDollarBills(12, 2500);
    spawnConfetti(30, 2500);
    spawnSideWaterfall(15, 2500);
    for (let i = 0; i < 5; i++) setTimeout(() => synth.coinClink(), 200 + i * 150);
  } else if (ratio >= 3) {
    spawnCoinShower(15, 1500); 
    spawnCoinFountain(20, 1800); 
    spawnDollarBills(6, 1800); 
    spawnConfetti(15, 1800);
    for (let i = 0; i < 3; i++) setTimeout(() => synth.coinClink(), 100 + i * 120);
  } else if (ratio >= 2) {
    spawnCoinShower(15, 1500); 
    spawnCoinFountain(20, 1800); 
    spawnDollarBills(6, 1800); 
    spawnConfetti(15, 1800);
    for (let i = 0; i < 3; i++) setTimeout(() => synth.coinClink(), 100 + i * 120);
  } else if (ratio > 0) {
    spawnCoinFountain(12, 1500); 
    spawnDollarBills(3, 1500);
  }
}
