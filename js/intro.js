/**
 * @module intro
 * @description Full-screen intro splash. Plays assets/webm/Big_Bad_Wolf_intro.webm
 * over everything on load, then fades into the game. Dismisses when the clip
 * ends, on click (skip), on error, or if autoplay is blocked — so the player
 * can never get stuck on the splash. Muted, because browsers block autoplay
 * with sound before any user interaction.
 */
'use strict';

const overlay = document.getElementById('intro-overlay');
const video   = document.getElementById('intro-video');

if (overlay && video) {
  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.classList.add('fade-out');     // CSS opacity transition
    try { video.pause(); } catch (e) {}
    setTimeout(() => {
      overlay.classList.add('hidden');                       // remove after fade
      window.dispatchEvent(new Event('intro:done'));         // cue the background hold + game reveal
    }, 700);
  }

  video.addEventListener('ended', dismiss);
  video.addEventListener('error', dismiss);
  overlay.addEventListener('click', dismiss);              // click/tap to skip

  // Backup: if 'ended' never fires, dismiss shortly after the clip's length.
  video.addEventListener('loadedmetadata', () => {
    if (isFinite(video.duration) && video.duration > 0) {
      setTimeout(dismiss, video.duration * 1000 + 1500);
    }
  });

  // Autoplay (muted). If the browser blocks it, skip the splash entirely.
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(dismiss);

  // Hard safety cap in case the video can't load at all.
  setTimeout(dismiss, 20000);
}
