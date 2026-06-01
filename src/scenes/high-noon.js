/**
 * @module high-noon
 * @description Hidden "High Noon" easter egg. At exactly 12:00 PM by the
 * browser's local clock the showdown plays out in two beats:
 *   1. A cowboy gunfight (showdown_shootout SFX) under a Western "a stranger
 *      rides into town" title card.
 *   2. The full-screen High_noon_standoff.webm clip (with its own audio).
 * The background music ducks out for the whole thing and returns afterward.
 * Dismisses on end, on click (skip), on error, or via a safety timeout — and
 * fires at most once per day.
 */
'use strict';

import { bgm, synth } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';

const overlay = document.getElementById('noon-overlay');
const video   = document.getElementById('noon-video');
const card    = document.getElementById('noon-card');

const CARD_HOLD_MS = 4200;         // how long the "stranger" card lingers before the clip

let playing  = false;
let firedKey = null;     // e.g. "Sat May 30 2026" — so noon only triggers once per day

/**
 * Take over the full screen: gunfight + title card, then the standoff clip, then
 * clean up. Exported so the time panel can trigger it on demand (regardless of
 * the real clock).
 */
export function playNoonStandoff() {
  if (!overlay || !video || playing) return;
  playing = true;

  bgm.pauseForCutscene();          // silence the game music under the cutscene
  synth.stopAll();                 // (clears any lingering one-shots first…)
  narrator.stop();

  let done = false;
  let rolled = false;
  let cardTimer = null;
  let speakTimer = null;
  let voAudio = null;

  const finish = () => {
    if (done) return;
    done = true;
    if (cardTimer)  { clearTimeout(cardTimer);  cardTimer = null; }
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    if (voAudio) { try { voAudio.pause(); } catch (e) {} voAudio = null; }
    if (card) card.classList.remove('show');
    overlay.classList.add('fade-out');
    try { video.pause(); } catch (e) {}
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('fade-out');
      if (card) card.classList.add('hidden');
      bgm.resumeFromCutscene();    // bring the music back
      playing = false;
    }, 600);
  };

  // Beat 2 — roll the standoff clip once the wolf has had his say (idempotent).
  const rollClip = () => {
    if (done || rolled) return;
    rolled = true;
    if (cardTimer)  { clearTimeout(cardTimer);  cardTimer = null; }
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    if (voAudio) { try { voAudio.pause(); } catch (e) {} voAudio = null; }
    if (card) card.classList.remove('show');
    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    try { video.currentTime = 0; } catch (e) {}
    // Try with sound (the player has interacted by mid-day); fall back to muted.
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(finish);
    });
    setTimeout(finish, 20000);     // hard safety cap (clip is ~10s)
  };

  // A click anywhere skips straight to the end, in either beat.
  overlay.addEventListener('click', finish, { once: true });

  // Beat 1 — show the overlay, fire the gunfight, reveal the "stranger" card.
  overlay.classList.remove('hidden');
  synth.shootout();                // cowboy high-noon gunfire
  if (card) {
    card.classList.remove('hidden');
    void card.offsetWidth;         // reflow so the entrance transition runs
    card.classList.add('show');
  }

  // Once the gunfire has rung out, the wolf reads the card aloud (his own voice).
  // When he finishes, roll the standoff clip; if VO is off, fall back to a timer.
  speakTimer = setTimeout(() => {
    voAudio = narrator.sayCutscene('highNoon_0.mp3');
    if (voAudio) {
      voAudio.addEventListener('ended', rollClip, { once: true });
      voAudio.addEventListener('error', rollClip, { once: true });
      setTimeout(() => { if (!rolled) rollClip(); }, 16000);  // hard cap if VO stalls (clip ~12.5s)
    } else {
      cardTimer = setTimeout(rollClip, CARD_HOLD_MS);          // VO off → time the card
    }
  }, 1200);
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
