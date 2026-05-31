/**
 * @module main
 * @description Entry point for Big Bad Wolf. Importing the feature modules runs
 * their setup (each wires its own buttons), then init() renders the starting
 * screen, wires the volume/paytable/sound controls, and kicks off ambient
 * effects + music.
 *
 * The source tree (see README.md for the full tour):
 *   math/    par-sheet (the par sheet) + mathcore (243-ways & bonus math)
 *   core/    state (shared runtime state) + utils (helpers)
 *   audio/   sound (sfx + music), narrator, phrases
 *   render/  reels (reel animation), particles (eye-candy), readouts (HUD)
 *   game/    base-game, bonus, buy-bonus
 *   panels/  the drawer pop-ups: options-drawer, deposit, rtp-picker,
 *            game-size, simulator (📊 SIM), math-breakdown (🧮 MATH)
 *   scenes/  intro, reveal, day-night, high-noon, idle-poster
 *   system/  dev-mode (hides admin tools on the public build)
 */
'use strict';

import { INITIAL_GRID, SYMBOLS } from './math/par-sheet.js';
import { state } from './core/state.js';
import { synth, bgm } from './audio/sound.js';
import { narrator } from './audio/narrator.js';
import { renderReel } from './render/reels.js';
import { startAmbientParticles } from './render/particles.js';
import { updateDisplays, setStatus } from './render/readouts.js';

// Side-effect imports: these wire up their own controls on load.
import './system/dev-mode.js';    // hide dev/admin tools on the public build (?dev=1 to show)
import './system/web-push.js';    // dev "Web Push" button → opens the live deployed site
import './scenes/intro.js';      // full-screen intro splash
import './scenes/day-night.js';   // time-of-day background darkening
import './scenes/reveal.js';     // post-intro: hold on the background, then fade the game in
import './scenes/high-noon.js';       // hidden "High Noon" easter egg at exactly 12:00 PM
import './panels/options-drawer.js';    // right-side slide-out options drawer
import './panels/deposit.js';    // add-credit popup
import './panels/rtp-picker.js';        // RTP / math-model picker popup
import './panels/game-size.js';   // folder-size breakdown popup
import './scenes/idle-poster.js'; // idle "attract mode" — glows up the Wanted poster
import './scenes/side-wolf.js';  // SideWolf character: idle loop ×3 → random reaction → repeat
import './game/base-game.js';
import './game/bonus.js';
import './game/buy-bonus.js';
import './panels/simulator.js';
import './panels/math-breakdown.js';
import { initFitScreen } from './system/fit-screen.js';   // scale-to-fit for mobile / iPhone landscape
import { initLazyAssets } from './system/lazy-assets.js';  // defer heavy/rare assets for instant first play
import { initBackgroundLoop } from './system/background-loop.js';  // keep the bg video looping (iOS-safe)

/* ══════════════════════════════════════════
   VOLUME / SOUND CONTROLS
══════════════════════════════════════════ */
function wireSoundControls() {
  const btnSound     = document.getElementById('btn-sound');
  const volumePanel  = document.getElementById('volume-panel');
  const sliderSfx    = document.getElementById('slider-sfx');
  const sliderMusic  = document.getElementById('slider-music');
  const sliderNarr   = document.getElementById('slider-narrator');
  const sfxPct       = document.getElementById('sfx-pct');
  const musicPct     = document.getElementById('music-pct');
  const narrPct      = document.getElementById('narrator-pct');
  const iconOn       = document.getElementById('icon-sound-on');
  const iconOff      = document.getElementById('icon-sound-off');

  btnSound.addEventListener('click', e => { e.stopPropagation(); volumePanel.classList.toggle('hidden'); });
  document.addEventListener('click', e => {
    if (!volumePanel.classList.contains('hidden') && !volumePanel.contains(e.target) && !btnSound.contains(e.target)) {
      volumePanel.classList.add('hidden');
    }
  });
  volumePanel.addEventListener('click', e => e.stopPropagation());

  sliderSfx.addEventListener('input', () => {
    const v = parseInt(sliderSfx.value);
    sfxPct.textContent = v + '%';
    synth.setVolume(v / 100);
    const off = v === 0;
    iconOn.classList.toggle('hidden', off);
    iconOff.classList.toggle('hidden', !off);
    btnSound.classList.toggle('sound-on', !off);
    synth.enabled = !off;
  });

  sliderMusic.addEventListener('input', () => {
    const v = parseInt(sliderMusic.value);
    musicPct.textContent = v + '%';
    bgm.setVolume(v / 100);
    if (v === 0) bgm.stop();
    else if (!bgm.isPlaying()) bgm.start();
  });

  sliderNarr.addEventListener('input', () => {
    const v = parseInt(sliderNarr.value);
    narrPct.textContent = v + '%';
    narrator.setVolume(v / 100);
    if (v === 0) { narrator.enabled = false; narrator.stop(); }
    else narrator.enabled = true;
  });
}

/* ══════════════════════════════════════════
   MUSIC AUTOSTART (browsers block audible autoplay until a gesture)
══════════════════════════════════════════ */
function wireMusicAutostart() {
  function tryStart() {
    if (state.musicAutoStarted) return;
    bgm.start().then(started => {
      if (started) {
        state.musicAutoStarted = true;
        document.removeEventListener('click', tryStart);
        document.removeEventListener('keydown', tryStart);
      }
    });
  }
  tryStart();                                  // attempt immediately…
  document.addEventListener('click', tryStart); // …fall back to first interaction
  document.addEventListener('keydown', tryStart);
}

/* ══════════════════════════════════════════
   PAYTABLE MODAL (pays auto-filled from the par sheet)
══════════════════════════════════════════ */
function wirePaytable() {
  const btnInfo = document.getElementById('btn-info');
  const modal   = document.getElementById('paytable-modal');
  const btnClose = document.getElementById('btn-close-paytable');
  if (btnInfo) btnInfo.addEventListener('click', () => modal.classList.remove('hidden'));
  if (btnClose) btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  // keep displayed pays in sync with SYMBOLS
  const order = ['hat-yellow', 'hat-green', 'hat-red', 'pig-suit', 'pig-contractor', 'pig-nature', 'toolbox', 'wolf', 'buzzard'];
  const items = document.querySelectorAll('#paytable-modal .pt-item:not(.pt-royals)');
  order.forEach((id, i) => {
    const el = items[i] && items[i].querySelector('.pt-pays');
    const p = SYMBOLS[id] && SYMBOLS[id].pays;
    if (el && p) el.innerHTML = `5&#9733; &times; ${p[5]} &nbsp;|&nbsp; 4&#9733; &times; ${p[4]} &nbsp;|&nbsp; 3&#9733; &times; ${p[3]}`;
  });
  const royalEl = document.querySelector('#paytable-modal .pt-royals .pt-pays');
  if (royalEl) {
    const hi = SYMBOLS['royal-a'].pays, lo = SYMBOLS['royal-10'].pays;
    royalEl.innerHTML = `5&#9733; &times; ${lo[5]}–${hi[5]} &nbsp;|&nbsp; 4&#9733; &times; ${lo[4]}–${hi[4]} &nbsp;|&nbsp; 3&#9733; &times; ${lo[3]}–${hi[3]}`;
  }
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function init() {
  state.currentGrid = INITIAL_GRID.map(col => [...col]);
  updateDisplays();
  for (let r = 0; r < 5; r++) renderReel(r, state.currentGrid[r]);
  setStatus('GOOD LUCK – PRESS SPIN!');

  wireSoundControls();
  wirePaytable();
  wireMusicAutostart();

  // close the big-win overlay on click
  const bigWin = document.getElementById('big-win-overlay');
  if (bigWin) bigWin.addEventListener('click', () => bigWin.classList.add('hidden'));

  startAmbientParticles();
  initFitScreen();            // fit the cabinet to short / mobile (iPhone landscape) viewports
  initLazyAssets();           // stream in decorative/bonus assets after first play
  initBackgroundLoop();       // keep the background video reliably looping (iOS-safe)
}

// Module scripts run after the DOM is parsed, so it's safe to init now.
init();
