/**
 * @module idle-poster
 * @description Attract-mode flourish for the reel-background "Wanted" poster
 * (Wanted_poster.webm). When the base game sits idle — nobody pressing anything,
 * no spin/auto/bonus running — the poster slowly glows up from its usual faint
 * 0.55 opacity to full 100%. The moment the player interacts again it snaps
 * straight back to its normal opacity.
 *
 * The two speeds (slow up, instant down) come from CSS: the `.poster-idle` class
 * carries a long transition; the base rule carries a short one. This module only
 * adds/removes that class based on activity + game state.
 */
'use strict';

import { state } from '../core/state.js';
import { isBonusActive } from '../game/bonus.js';

const video  = document.getElementById('reel-bg-video');
const IDLE_MS = 12000;   // how long with zero input before the poster glows up

let timer = null;

/** The reels are "busy" (so don't glow up) during a spin, auto-spin, or bonus. */
function isBusy() { return state.spinning || state.autoActive || isBonusActive(); }

function scheduleIdle() {
  clearTimeout(timer);
  timer = setTimeout(tick, IDLE_MS);
}

function tick() {
  if (!video) return;
  if (isBusy()) { scheduleIdle(); return; }   // not truly idle yet — check again later
  video.classList.add('poster-idle');          // slow ramp to 100%
}

/** Any interaction snaps the poster back and restarts the idle countdown. */
function onActivity() {
  if (video) video.classList.remove('poster-idle');
  scheduleIdle();
}

if (video) {
  // capture phase so we see every click/keypress, even ones that stopPropagation
  document.addEventListener('pointerdown', onActivity, true);
  document.addEventListener('keydown', onActivity, true);
  scheduleIdle();
}
