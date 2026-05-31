/**
 * @module background-loop
 * @description Guarantees the looping background video (#bg-video) keeps playing.
 *
 * The element already has the `loop` attribute, but iOS Safari is unreliable here:
 * it sometimes fires `ended` instead of re-looping, pauses the video when the tab
 * is backgrounded, and may hold autoplay until the first user gesture. This re-arms
 * playback on all of those, so the saloon backdrop never freezes.
 */
'use strict';

export function initBackgroundLoop() {
  const v = document.getElementById('bg-video');
  if (!v) return;
  v.loop = true;
  v.muted = true;            // required for autoplay on iOS

  const kick = () => { try { if (v.paused) v.play().catch(() => {}); } catch (e) {} };

  // iOS occasionally fires `ended` instead of looping — restart from the top.
  v.addEventListener('ended', () => { try { v.currentTime = 0; } catch (e) {} kick(); });
  // if it ever pauses (backgrounding, a decode hiccup), nudge it back to playing.
  v.addEventListener('pause', kick);
  // resume when the tab / app returns to the foreground.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  // first user interaction unblocks autoplay if the browser was holding it.
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    window.addEventListener(ev, kick, { once: true, passive: true }));

  kick();
}
