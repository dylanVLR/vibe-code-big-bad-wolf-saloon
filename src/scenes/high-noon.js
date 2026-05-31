/**
 * @module high-noon
 * @description Hidden "High Noon" easter egg. At exactly 12:00 PM by the
 * browser's local clock, High_noon_standoff.webm takes over the full screen
 * (with its own audio; the background music ducks out and returns afterward).
 * Dismisses on end, on click (skip), on error, or via a safety timeout — and
 * fires at most once per day.
 */
'use strict';

import { bgm, synth } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';

const overlay = document.getElementById('noon-overlay');
const video   = document.getElementById('noon-video');

let playing  = false;
let firedKey = null;     // e.g. "Sat May 30 2026" — so noon only triggers once per day

/**
 * Take over the full screen with the standoff clip, then clean up. Exported so
 * the time panel can trigger it on demand (regardless of the real clock).
 */
export function playNoonStandoff() {
  if (!overlay || !video || playing) return;
  playing = true;

  bgm.pauseForCutscene();          // silence the game music under the clip's own audio
  synth.stopAll();
  narrator.stop();

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    overlay.classList.add('fade-out');
    try { video.pause(); } catch (e) {}
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('fade-out');
      bgm.resumeFromCutscene();    // bring the music back
      playing = false;
    }, 600);
  };

  video.addEventListener('ended', finish, { once: true });
  video.addEventListener('error', finish, { once: true });
  overlay.addEventListener('click', finish, { once: true });

  overlay.classList.remove('hidden');
  try { video.currentTime = 0; } catch (e) {}
  // Try with sound (the player has already interacted by mid-day); fall back to muted.
  video.muted = false;
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(finish);
  });

  setTimeout(finish, 20000);       // hard safety cap (clip is ~10s)
}

/* ── Watch the real clock. Polling every 250ms reliably catches the 12:00:00
   second and self-corrects (no drift); the per-day key prevents repeats. ── */
if (overlay && video) {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 12 && now.getMinutes() === 0 && now.getSeconds() === 0) {
      const key = now.toDateString();
      if (firedKey !== key) { firedKey = key; playNoonStandoff(); }
    }
  }, 250);
}
