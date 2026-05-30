/**
 * @module reels
 * @description The reels' DOM + animation layer: building symbol cells, the
 * spin animation, win highlighting and the count-up. The actual win math lives
 * in mathcore.js — this module just shows it.
 */
'use strict';

import { SYMBOLS, SYMBOL_IDS, SPIN_DURATIONS, TURBO_DURATIONS, SCROLL_SYMBOLS, TURBO_SCROLL, ANTICIPATION_EXTRA } from '../math/par-sheet.js';
import { state } from '../core/state.js';
import { synth } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';
import { fmt } from '../core/utils.js';
import { spawnSparkles } from './particles.js';

const reelCols   = [0, 1, 2, 3, 4].map(i => document.getElementById(`reel-${i}`));
const reelStrips = [0, 1, 2, 3, 4].map(i => document.getElementById(`strip-${i}`));
const particleContainer = document.getElementById('particle-container');
const elWin = document.getElementById('display-win');

export function getReelStrips() { return reelStrips; }

/** A random symbol id, used only to fill the blurry scroll buffer. */
function randomSymbol() { return SYMBOL_IDS[Math.floor(Math.random() * SYMBOL_IDS.length)]; }

/** Read the cell pixel height from the CSS custom property. */
function getCellHeight() {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--cell-size').trim();
  return parseInt(val, 10) || 130;
}

/** Build one symbol cell (PNG image, or inline-SVG for royals). */
export function makeCell(symId) {
  const sym = SYMBOLS[symId];
  const div = document.createElement('div');
  div.className = 'sym-cell';
  div.dataset.sym = symId;
  if (sym.src) {
    const img = document.createElement('img');
    img.src = sym.src;
    img.alt = sym.label || symId;
    img.draggable = false;
    img.className = 'sym-img';
    div.appendChild(img);
  } else {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', sym.svgId);
    use.setAttribute('href', sym.svgId);
    svg.appendChild(use);
    div.appendChild(svg);
  }
  return div;
}

/** Instantly show 3 symbols on a reel (no animation). */
export function renderReel(reelIndex, symbolIds) {
  const strip = reelStrips[reelIndex];
  strip.style.transition = 'none';
  strip.style.transform  = 'translateY(0)';
  strip.innerHTML = '';
  symbolIds.forEach(id => strip.appendChild(makeCell(id)));
}

/**
 * Spin one reel from its current symbols to the target symbols.
 * Builds a tall strip [target] + [random blur] + [current], snaps it to the
 * bottom, then transitions to the top so the target lands in view.
 */
export function animateReel(reelIndex, targetSymIds, onDone, anticipate = false, isExtreme = false) {
  const strip = reelStrips[reelIndex];
  const col   = reelCols[reelIndex];
  const cellH = getCellHeight();
  const scrollN = state.turbo ? TURBO_SCROLL : SCROLL_SYMBOLS;
  let duration  = state.turbo ? TURBO_DURATIONS[reelIndex] : SPIN_DURATIONS[reelIndex];

  if (anticipate && reelIndex >= 3) {        // suspense slow-down on later reels
    duration += ANTICIPATION_EXTRA;
    col.classList.add('is-anticipating');
    if (reelIndex === 3) synth.anticipation();
  }
  
  if (isExtreme) {
    duration += 1500; // Extra long spin for the 6th hat
    col.classList.add('is-extreme-anticipating');
    narrator.sayNow('extremeAnticipation', 8);
  }

  const current = (state.currentGrid && state.currentGrid[reelIndex]) || ['royal-a', 'royal-k', 'royal-q'];
  const allIds = [...targetSymIds, ...Array.from({ length: scrollN }, randomSymbol), ...current];

  strip.innerHTML = '';
  allIds.forEach(id => strip.appendChild(makeCell(id)));

  const startY = (allIds.length - 3) * cellH;
  strip.style.transition = 'none';
  strip.style.transform  = `translateY(-${startY}px)`;
  col.classList.add('is-spinning');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const easing = anticipate && reelIndex >= 3
        ? 'cubic-bezier(0.05, 0.9, 0.35, 1.12)'
        : 'cubic-bezier(0.12, 0.85, 0.38, 1.08)';
      strip.style.transition = `transform ${duration}ms ${easing}`;
      strip.style.transform  = 'translateY(0)';

      let isDone = false;
      const finishAnimation = () => {
        if (isDone) return;
        isDone = true;
        col.classList.remove('is-spinning', 'is-anticipating', 'is-extreme-anticipating');
        renderReel(reelIndex, targetSymIds);
        strip.classList.add('bounce-stop');
        setTimeout(() => strip.classList.remove('bounce-stop'), 350);
        synth.reelStop(reelIndex);
        onDone();
      };

      const fallbackTimer = setTimeout(finishAnimation, duration + 50);

      strip.addEventListener('transitionend', function handler(e) {
        if (e.propertyName === 'transform') {
          strip.removeEventListener('transitionend', handler);
          clearTimeout(fallbackTimer);
          finishAnimation();
        }
      });
    });
  });
}

/** Spin all 5 reels; resolves once every reel has stopped. */
export function animateAllReels(targetGrid, anticipate = false, extremeAnticipate = false) {
  return new Promise(resolve => {
    let stopped = 0;
    for (let r = 0; r < 5; r++) {
      const isExtreme = extremeAnticipate && r === 4;
      animateReel(r, targetGrid[r], () => { if (++stopped === 5) resolve(); }, anticipate, isExtreme);
    }
  });
}

/**
 * Show an expanding wild filling a reel: swap the reel to its post-expansion
 * symbols (`expandedCol`) and play a brass glow sweep + sparkles down the column.
 */
export function expandWildReel(reelIndex, expandedCol) {
  const col = reelCols[reelIndex];
  if (!col) return;
  renderReel(reelIndex, expandedCol);
  col.classList.add('wild-reel-flash');
  setTimeout(() => col.classList.remove('wild-reel-flash'), 1000);
  const rect = col.getBoundingClientRect();
  const cr = particleContainer.getBoundingClientRect();
  const cx = rect.left + rect.width / 2 - cr.left;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => spawnSparkles(cx, rect.top + rect.height * (0.22 + i * 0.28) - cr.top, 8), i * 110);
  }
}

/** Add the winner glow + sparkles to every winning cell. */
export function highlightWinners(winners) {
  clearHighlights();
  winners.forEach(({ cells }) => {
    cells.forEach(([reelIdx, rowIdx]) => {
      const cell = reelStrips[reelIdx].querySelectorAll('.sym-cell')[rowIdx];
      if (!cell) return;
      cell.classList.add('is-winner');
      const rect = cell.getBoundingClientRect();
      const cr = particleContainer.getBoundingClientRect();
      spawnSparkles(rect.left + rect.width / 2 - cr.left, rect.top + rect.height / 2 - cr.top, 6);
    });
  });
}

export function clearHighlights() {
  document.querySelectorAll('.sym-cell.is-winner').forEach(el => el.classList.remove('is-winner'));
}

/** Count the WIN display up from 0 to targetAmount. Resolves when done. */
export function animateWinCount(targetAmount, durationMs = 1200) {
  return new Promise(resolve => {
    const startTime = performance.now();
    elWin.classList.add('counting', 'win-glow');
    function tick(now) {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);  // ease-out cubic
      elWin.textContent = fmt(targetAmount * eased);
      if (progress < 0.9 && Math.random() < 0.30) synth.coinTick();
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        elWin.textContent = fmt(targetAmount);
        elWin.classList.remove('counting');
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}
