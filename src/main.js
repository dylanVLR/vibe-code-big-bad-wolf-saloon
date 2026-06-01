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
import './panels/help.js';        // 📖 HELP / RULES / PAYTABLE (built from the par sheet)
import './panels/seo-info.js';    // 🔍 SEO report (dev-only)
import { initFitScreen } from './system/fit-screen.js';   // scale-to-fit for mobile / iPhone landscape
import { initLazyAssets } from './system/lazy-assets.js';  // defer heavy/rare assets for instant first play
import { initBackgroundLoop } from './system/background-loop.js';  // keep the bg video looping (iOS-safe)
import { initInstallHint } from './system/install-hint.js';   // one-time "Add to Home Screen" nudge on iOS
import { initAlphaVideos } from './system/video-format.js';  // serve HEVC-alpha .mp4 to Safari, WebM elsewhere

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

  const btnVolMute  = document.getElementById('btn-vol-mute');
  const btnVolReset = document.getElementById('btn-vol-reset');
  const ALL_SLIDERS = [sliderSfx, sliderMusic, sliderNarr];

  // Push a value into a slider AND run its input handler so audio + the % label
  // + the speaker icon all update exactly as if the user dragged it.
  const applySlider = (slider, value) => {
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // MUTE ALL is a toggle: first press silences all three and remembers the
  // levels; pressing again (now "UNMUTE") restores them. Defaults are used if a
  // saved level was itself 0, so unmuting always brings sound back.
  let mutedLevels = null;
  const refreshMuteLabel = () => {
    if (!btnVolMute) return;
    const muted = mutedLevels !== null;
    btnVolMute.textContent = muted ? 'UNMUTE' : 'MUTE ALL';
    btnVolMute.classList.toggle('is-active', muted);
  };

  if (btnVolMute) {
    btnVolMute.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mutedLevels === null) {
        // mute: stash current levels, then zero everything
        mutedLevels = ALL_SLIDERS.map(s => parseInt(s.value, 10) || 0);
        ALL_SLIDERS.forEach(s => applySlider(s, 0));
      } else {
        // unmute: restore stashed levels (fall back to defaults if they were 0)
        const fallback = [100, 50, 80];
        ALL_SLIDERS.forEach((s, i) => applySlider(s, mutedLevels[i] || fallback[i]));
        mutedLevels = null;
      }
      refreshMuteLabel();
    });
  }

  if (btnVolReset) {
    btnVolReset.addEventListener('click', (e) => {
      e.stopPropagation();
      applySlider(sliderSfx, 100);
      applySlider(sliderMusic, 50);
      applySlider(sliderNarr, 80);
      mutedLevels = null;        // clear any mute state so the label is correct
      refreshMuteLabel();
    });
  }

  refreshMuteLabel();
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

/* The HELP / RULES / PAYTABLE screen lives in src/panels/help.js (built from the
   par sheet, opened by the 📖 HELP button). It wires itself on import. */

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function init() {
  initAlphaVideos();          // pick WebM vs HEVC-alpha for transparent videos (Safari fix)
  state.currentGrid = INITIAL_GRID.map(col => [...col]);
  updateDisplays();
  for (let r = 0; r < 5; r++) renderReel(r, state.currentGrid[r]);
  setStatus('GOOD LUCK – PRESS SPIN!');

  wireSoundControls();
  wireMusicAutostart();

  // close the big-win overlay on click
  const bigWin = document.getElementById('big-win-overlay');
  if (bigWin) bigWin.addEventListener('click', () => bigWin.classList.add('hidden'));

  // click the saloon sign → the wolf brags about his joint
  const logoText = document.getElementById('logo-text');
  if (logoText) {
    logoText.classList.add('clickable-sign');
    logoText.addEventListener('click', () => narrator.onSaloonClick());
  }
  // click the Vegas Low Roller medallion → friendly shout-out
  const vlr = document.getElementById('vlr-medallion');
  if (vlr) {
    vlr.classList.add('clickable-sign');
    vlr.addEventListener('click', () => narrator.onVlrClick());
  }
  // click the sheriff's star badge → the wolf claims the law
  const badge = document.querySelector('.logo-badge img');
  if (badge) {
    badge.classList.add('clickable-sign');
    badge.addEventListener('click', () => narrator.onSheriffClick());
  }

  startAmbientParticles();
  initFitScreen();            // fit the cabinet to short / mobile (iPhone landscape) viewports
  initLazyAssets();           // stream in decorative/bonus assets after first play
  initBackgroundLoop();       // keep the background video reliably looping (iOS-safe)
  initInstallHint();          // gentle one-time "Add to Home Screen" prompt on iPhone
}

// Module scripts run after the DOM is parsed, so it's safe to init now.
init();
