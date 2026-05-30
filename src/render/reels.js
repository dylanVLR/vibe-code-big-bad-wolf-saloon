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
  clearWildReel(col);                    // drop any expanded-wild panel from last spin
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
 * Show an expanding wild filling a reel as ONE unified brass plaque that
 * "expands open" vertically — instead of three separate icons. The three wild
 * cells stay underneath (for win highlighting + data); a single full-reel panel
 * is laid over them and animated.
 */
export function expandWildReel(reelIndex, expandedCol) {
  const col = reelCols[reelIndex];
  if (!col) return;
  renderReel(reelIndex, expandedCol);   // wild cells underneath (data + highlight)
  col.classList.add('wild-reel');        // hide per-cell emblems; show the unified panel

  // one full-reel plaque: weathered texture + 4 corner bolts + the WILD emblem
  let panel = col.querySelector('.wild-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'wild-panel';
    panel.innerHTML =
      '<div class="wild-texture"></div>' +
      '<div class="wild-bolt tl"></div><div class="wild-bolt tr"></div>' +
      '<div class="wild-bolt bl"></div><div class="wild-bolt br"></div>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#sym-wild');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#sym-wild');
    svg.appendChild(use);
    panel.appendChild(svg);
    col.appendChild(panel);
  }
  panel.classList.remove('expand');
  void panel.offsetWidth;                // reflow so the entrance animation restarts
  panel.classList.add('expand');

  // celebrate inside the frame as it opens: cowboy SFX + coins + dust + sparks
  synth.wildExpand();
  setTimeout(() => wildBurst(panel), 230);

  // hammer the four corner bolts in, one at a time, each with a clank
  const bolts = panel.querySelectorAll('.wild-bolt');
  bolts.forEach(b => b.classList.remove('locked'));
  bolts.forEach((b, i) => setTimeout(() => { b.classList.add('locked'); synth.boltLock(); }, 430 + i * 150));
}

/**
 * Inject a one-off celebration inside an expanded-wild panel: a flash, a swirling
 * dust whirlwind, a burst of gold coins that rain down, and golden sparks. All
 * elements live inside the panel (overflow:hidden), so they stay in the frame and
 * remove themselves when their animation ends.
 */
function wildBurst(panel) {
  const add = (cls, style, life) => {
    const el = document.createElement('div');
    el.className = cls;
    if (style) for (const k in style) el.style.setProperty(k, style[k]);
    panel.appendChild(el);
    setTimeout(() => el.remove(), life);
    return el;
  };

  add('wild-flash', null, 700);                                  // bright pop
  add('wild-dust', { 'animation-delay': '0s' }, 2300);          // whirlwind
  add('wild-dust', { 'animation-delay': '0.18s' }, 2400);

  // flying dust specks for the dust-storm feel
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 110;
    add('wild-mote', {
      '--mx': (Math.cos(ang) * dist * 1.2).toFixed(0) + 'px',
      '--my': (Math.sin(ang) * dist).toFixed(0) + 'px',
      'animation-delay': (Math.random() * 0.4).toFixed(2) + 's',
    }, 1700);
  }

  // gold coins burst out from the badge then rain down
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 62;
    add('wild-coin', {
      '--tx': (Math.cos(ang) * dist).toFixed(0) + 'px',
      '--ty': (Math.sin(ang) * dist - 50 - Math.random() * 45).toFixed(0) + 'px',
      'animation-delay': (Math.random() * 0.22).toFixed(2) + 's',
    }, 1700);
  }
  // firework-style sparks shooting out from the centre
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 95;
    add('wild-spark', {
      '--sx': (Math.cos(ang) * dist).toFixed(0) + 'px',
      '--sy': (Math.sin(ang) * dist).toFixed(0) + 'px',
      'animation-delay': (Math.random() * 0.15).toFixed(2) + 's',
    }, 1000);
  }
}

/** Remove a reel's expanded-wild panel (called when the reel respins). */
function clearWildReel(col) {
  col.classList.remove('wild-reel');
  const panel = col.querySelector('.wild-panel');
  if (panel) panel.remove();
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
