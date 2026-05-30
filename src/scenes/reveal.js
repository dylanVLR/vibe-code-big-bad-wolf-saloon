/**
 * @module reveal
 * @description Post-intro reveal sequence. The game loads hidden (body.pre-reveal)
 * with the background video shown clean and undimmed. After the intro splash
 * finishes we linger on that background for a beat, then fade the whole game —
 * cabinet/reels/character, the side panel, the ambient dust, and the day-night
 * darkening — in together.
 *
 * Order matters: this module imports AFTER daynight in main.js, so it can park
 * the day-night overlay at 0 (overriding daynight's initial value) for the hold.
 */
'use strict';

import { revealDayNight } from './day-night.js';

const overlay = document.getElementById('day-night-overlay');
const HOLD_MS = 500;    // how long to linger on the clean background after the intro
let revealed = false;

// Start hidden, with the background full & undimmed (daynight already set the
// overlay opacity on load — override it to 0 so the hold looks clean).
document.body.classList.add('pre-reveal');
if (overlay) overlay.style.opacity = '0';

function reveal() {
  if (revealed) return;
  revealed = true;
  document.body.classList.remove('pre-reveal');   // fade the game in (CSS 1.1s)
  revealDayNight();                                // fade the darkening back in
}

// When the intro signals it's done, hold on the background, then reveal.
window.addEventListener('intro:done', () => setTimeout(reveal, HOLD_MS), { once: true });

// Safety net: reveal anyway if the intro never signals (missing/blocked splash).
setTimeout(reveal, 23000);
