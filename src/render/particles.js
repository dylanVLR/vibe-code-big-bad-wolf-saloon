/**
 * @module particles
 * @description Pure eye-candy: coins, sparkles, confetti, dollar bills, wind,
 * and the ambient gold dust. Every function builds DOM nodes with CSS-animation
 * classes (defined in styles.css) and removes them when the animation ends.
 */
'use strict';

import { synth } from '../audio/sound.js';
import { fmt } from '../core/utils.js';

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

/**
 * Full-screen WIND / TORNADO storm — leaves, straw and debris blown clear across
 * the whole screen with whooshing speed-lines and a faint swirling dust haze, so
 * the wolf's big blow feels like a tornado everywhere (not just on the reels).
 * Spawns continuously until you call the returned controller's stop(); in-flight
 * particles then finish their flight and the layer cleans itself up.
 *
 * @returns {{ stop: (fadeMs?: number) => void }}
 */
export function startWindStorm() {
  let layer = document.getElementById('wind-storm');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'wind-storm';
    layer.innerHTML = '<div class="wind-haze"></div>';
    document.body.appendChild(layer);
  }
  layer.classList.remove('fade-out');
  void layer.offsetWidth;            // restart the haze fade-in if re-used
  layer.classList.add('active');

  const LEAVES = ['🍂', '🍃', '🌿'];
  const TANS   = ['#caa45a', '#b5863c', '#9c6b2e', '#d8c089', '#8a6a34'];
  // autumn palettes for CSS-drawn leaves (guaranteed to render even where the
  // color-emoji font is missing) — [light, dark] for the leaf gradient
  const LEAF_COLORS = [
    ['#8FCF4F', '#3E7A24'], ['#E7B23A', '#B5751F'], ['#DD7A2E', '#9C4A18'],
    ['#CF5A3A', '#8A2F18'], ['#C7A95B', '#7A5A2A'], ['#B7C24A', '#6E7A1E'],
  ];

  const spawnLeaf = () => {
    const outer = document.createElement('div');
    outer.className = 'wind-leaf';
    const dur = 1.1 + Math.random() * 1.7;
    outer.style.top = (Math.random() * 100) + 'vh';
    outer.style.setProperty('--dur', dur + 's');

    // mix CSS-drawn leaves (always visible) with emoji leaves (richer on devices
    // that have a color-emoji font)
    const useEmoji = Math.random() < 0.45;
    const body = document.createElement(useEmoji ? 'span' : 'i');
    body.className = 'wind-leaf-body ' + (useEmoji ? 'emoji' : 'shape');
    body.style.setProperty('--dur', dur + 's');
    body.style.setProperty('--ty', ((Math.random() * 64 - 32) | 0) + 'px');
    if (useEmoji) {
      body.textContent = LEAVES[(Math.random() * LEAVES.length) | 0];
      body.style.fontSize = (15 + Math.random() * 26) + 'px';
    } else {
      const pal = LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0];
      body.style.setProperty('--c1', pal[0]);
      body.style.setProperty('--c2', pal[1]);
      const w = 11 + Math.random() * 17;
      body.style.width = w.toFixed(0) + 'px';
      body.style.height = (w * (0.68 + Math.random() * 0.3)).toFixed(0) + 'px';
    }
    outer.appendChild(body);
    layer.appendChild(outer);
    setTimeout(() => outer.remove(), dur * 1000 + 120);
  };

  const spawnDebris = () => {
    const d = document.createElement('div');
    d.className = 'wind-debris';
    const dur = 0.7 + Math.random() * 1.0;
    d.style.top = (Math.random() * 100) + 'vh';
    d.style.height = (3 + Math.random() * 4) + 'px';
    d.style.width = (8 + Math.random() * 18) + 'px';
    d.style.background = TANS[(Math.random() * TANS.length) | 0];
    d.style.setProperty('--dur', dur + 's');
    d.style.setProperty('--rot', ((200 + Math.random() * 900) | 0) + 'deg');
    layer.appendChild(d);
    setTimeout(() => d.remove(), dur * 1000 + 120);
  };

  const spawnLine = () => {
    const l = document.createElement('div');
    l.className = 'wind-line';
    const dur = 0.45 + Math.random() * 0.55;
    l.style.top = (Math.random() * 100) + 'vh';
    l.style.width = (12 + Math.random() * 28) + 'vw';
    l.style.setProperty('--dur', dur + 's');
    layer.appendChild(l);
    setTimeout(() => l.remove(), dur * 1000 + 120);
  };

  const tick = () => {
    spawnLeaf(); spawnLeaf();
    if (Math.random() < 0.6) spawnLeaf();
    if (Math.random() < 0.8) spawnDebris();
    if (Math.random() < 0.55) spawnLine();
  };
  tick(); tick();
  const timer = setInterval(tick, 140);

  return {
    stop(fadeMs = 700) {
      clearInterval(timer);
      layer.classList.add('fade-out');                       // fade the haze out…
      // …let in-flight leaves finish their flight (longest ~2.8s), then remove the layer
      setTimeout(() => { if (layer && layer.parentNode) layer.remove(); }, 2900 + fadeMs);
    },
  };
}
