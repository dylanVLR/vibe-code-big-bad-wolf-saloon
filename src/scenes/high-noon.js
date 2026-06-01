/**
 * @module high-noon
 * @description Hidden "High Noon" easter egg. At exactly 12:00 PM by the
 * browser's local clock the showdown plays out in three beats:
 *   1. A Western "a stranger rides into town" title card; the wolf reads it
 *      aloud in his own voice (no other narrator lines, no SFX — they'd overlap).
 *   2. The High_noon_standoff.webm clip (with its own audio).
 *   3. An outro: the Western showdown theme music swells over the clip's frozen
 *      last frame, then a single gunshot cracks — and we cut back to gameplay.
 * All beats are contained inside the reel window (the side wolf and outer
 * borders stay visible). The game's own SFX + narrator are muted for the whole
 * sequence (so nothing bleeds in); every cutscene sound is played directly and
 * respects the SFX / MUSIC / VOICE sliders. The background music ducks out and
 * returns afterward. Dismisses on end, on click (skip), on error, or via a
 * safety timeout — and fires at most once per day.
 */
'use strict';

import { bgm, synth } from '../audio/sound.js';
import { narrator } from '../audio/narrator.js';

const overlay = document.getElementById('noon-overlay');
const video   = document.getElementById('noon-video');
const card    = document.getElementById('noon-card');

const CARD_HOLD_MS  = 4200;        // how long the card lingers if VOICE is off
const SHOWDOWN_MUSIC = 'assets/audio/music/showdown_theme.mp3';
const GUNSHOT_SFX    = 'assets/audio/sfx/showdown_shootout.mp3';
const WOLF_LINE      = 'assets/audio/narrator/highNoon_0.mp3';

let playing  = false;
let firedKey = null;     // e.g. "Sat May 30 2026" — so noon only triggers once per day

let wasSynthEnabled = true;
let wasNarratorEnabled = true;

/**
 * Run the High-Noon cutscene (card + voice → clip → theme + gunshot → gameplay).
 * Exported so the time panel can trigger it on demand (regardless of the clock).
 */
export function playNoonStandoff() {
  if (!overlay || !video || playing) return;
  playing = true;

  // Capture the channels, then mute the game's own SFX + narrator for the WHOLE
  // sequence so no ambient barks or idle lines overlap. Every cutscene sound is
  // played directly below (bypassing the channels) and respects the sliders.
  wasSynthEnabled = synth.enabled;
  wasNarratorEnabled = narrator.enabled;
  const voiceVol = narrator.getVolume();
  const musicVol = bgm.getVolume();
  const sfxVol   = synth.getVolume();
  const voiceOn  = wasNarratorEnabled && voiceVol > 0;
  const sfxOn    = wasSynthEnabled && sfxVol > 0;

  bgm.pauseForCutscene();          // silence the looping game music under the cutscene
  synth.stopAll();
  narrator.stop();
  synth.enabled = false;
  narrator.enabled = false;

  let done = false, rolled = false, outroStarted = false;
  let cardTimer = null, speakTimer = null;
  let voAudio = null, musicAudio = null, gunAudio = null;

  const playClip = (src, vol) => {
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, vol));
    a.play().catch(() => {});
    return a;
  };
  const stopClip = (a) => { if (a) { try { a.pause(); } catch (e) {} } };

  const finish = () => {
    if (done) return;
    done = true;
    if (cardTimer)  { clearTimeout(cardTimer);  cardTimer = null; }
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    stopClip(voAudio); stopClip(musicAudio); stopClip(gunAudio);
    voAudio = musicAudio = gunAudio = null;
    if (card) card.classList.remove('show', 'leaving');
    overlay.classList.add('fade-out');
    try { video.pause(); } catch (e) {}
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('fade-out');
      if (card) card.classList.add('hidden');
      video.style.visibility = '';
      synth.enabled = wasSynthEnabled;
      narrator.enabled = wasNarratorEnabled;
      bgm.resumeFromCutscene();    // bring the looping music back
      playing = false;
    }, 600);
  };

  // Beat 3 — end the clip and fade the card (the wolf's words) back in; the
  // showdown theme plays over it; when the gunshot fires we cut hard to black,
  // then back to gameplay.
  const startOutro = () => {
    if (done || outroStarted) return;
    outroStarted = true;

    try { video.pause(); } catch (e) {}
    if (card) { card.classList.remove('leaving'); card.classList.add('show'); }   // fade card back in

    const fireGunThenEnd = () => {
      if (done) return;
      // Cut to all black: drop the card and the clip's frame instantly, leaving
      // the overlay's black background, then the gunshot cracks over it.
      if (card) card.classList.add('hidden');
      video.style.visibility = 'hidden';
      if (sfxOn) {
        gunAudio = playClip(GUNSHOT_SFX, Math.min(1, sfxVol * 0.9));
        gunAudio.addEventListener('ended', finish, { once: true });
        gunAudio.addEventListener('error', finish, { once: true });
        setTimeout(() => { if (!done) finish(); }, 7000);   // gunshot ~5s
      } else {
        finish();
      }
    };

    if (musicVol > 0) {
      musicAudio = playClip(SHOWDOWN_MUSIC, Math.min(1, musicVol * 0.9));
      musicAudio.addEventListener('ended', fireGunThenEnd, { once: true });
      musicAudio.addEventListener('error', fireGunThenEnd, { once: true });
      setTimeout(() => { if (!done && !gunAudio) fireGunThenEnd(); }, 18000); // music ~15s
    } else {
      fireGunThenEnd();              // MUSIC muted → straight to the closing gunshot
    }
  };

  // Beat 2 — roll the standoff clip; when it ends, start the outro.
  const rollClip = () => {
    if (done || rolled) return;
    rolled = true;
    if (cardTimer)  { clearTimeout(cardTimer);  cardTimer = null; }
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    stopClip(voAudio); voAudio = null;
    // Fade the whole card (text + opaque background) out so the clip is visible.
    if (card) { card.classList.remove('show'); card.classList.add('leaving'); }
    video.addEventListener('ended', startOutro, { once: true });
    video.addEventListener('error', startOutro, { once: true });
    try { video.currentTime = 0; } catch (e) {}
    // Try with sound (the player has interacted by mid-day); fall back to muted.
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(startOutro);
    });
    setTimeout(() => { if (!outroStarted) startOutro(); }, 20000);  // clip safety cap
  };

  // A click anywhere skips straight back to gameplay, in any beat.
  overlay.addEventListener('click', finish, { once: true });

  // Beat 1 — reveal the card; the wolf reads it aloud (no gunfire, no other VO).
  overlay.classList.remove('hidden');
  video.style.visibility = '';       // reset (the outro hides it for the black cut)
  if (card) {
    card.classList.remove('hidden', 'leaving');
    void card.offsetWidth;         // reflow so the entrance transition runs
    card.classList.add('show');
  }
  // Let the card settle, then the wolf speaks; roll the clip when he finishes.
  speakTimer = setTimeout(() => {
    if (voiceOn) {
      voAudio = playClip(WOLF_LINE, voiceVol);
      voAudio.addEventListener('ended', rollClip, { once: true });
      voAudio.addEventListener('error', rollClip, { once: true });
      setTimeout(() => { if (!rolled) rollClip(); }, 16000);  // hard cap (line ~12.5s)
    } else {
      cardTimer = setTimeout(rollClip, CARD_HOLD_MS);          // VOICE off → time the card
    }
  }, 900);
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
