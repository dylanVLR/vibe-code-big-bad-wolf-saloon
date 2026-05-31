/**
 * @module lazy-assets
 * @description Web load optimisation — keep FIRST PLAY instant.
 *
 * Only the essentials load up front: the code, the reel symbols, the intro splash
 * and the page/background videos, and the (tiny) core sound effects. Everything
 * decorative or rare is held back and brought in *after* the game is interactive:
 *
 *   1. Background videos flagged `data-lazy-src` (the 5 MB reel-window backdrop)
 *      are started once first paint is done — they stream in behind the intro
 *      splash, so the player never waits on them.
 *   2. Bonus-only media (the cutscene videos, frame-morph clips, bonus pigs and
 *      bonus music — only seen ~1 in 180 spins) is quietly warmed into the HTTP
 *      cache at low priority, so a bonus never stalls but nothing competes with
 *      the first spin.
 *
 * The SideWolf reaction clips (~40 MB) are deliberately NOT prefetched — they're
 * heavy and already stream in on demand as the idle wolf cycles through them.
 */
'use strict';

/** Start any <video data-lazy-src> that was held back from the initial load. */
function activateLazyVideos() {
  document.querySelectorAll('video[data-lazy-src]').forEach(v => {
    const src = v.dataset.lazySrc;
    if (!src || v.getAttribute('src')) return;
    v.setAttribute('src', src);
    v.removeAttribute('data-lazy-src');
    try { v.load(); } catch (e) {}
    if (v.hasAttribute('data-lazy-autoplay')) v.play().catch(() => {});
  });
}

/* Bonus-only media — warmed in the background, low priority, staggered. */
const WARM = [
  'assets/webm/Three_pigs_bonus_intro.webm',
  'assets/webm/Wolf_blowing_tornado.webm',
  'assets/webm/F1-straw.webm',
  'assets/webm/F2-wood.webm',
  'assets/webm/F3-brick.webm',
  'assets/bonus_pig_straw.webp',
  'assets/bonus_pig_wood.webp',
  'assets/bonus_pig_brick.webp',
  'assets/audio/music/bgm_bonus.mp3',
];
function warmExtras() {
  WARM.forEach((url, i) => setTimeout(() => {
    try { fetch(url, { cache: 'force-cache', priority: 'low' }).catch(() => {}); } catch (e) {}
  }, i * 500));   // stagger so the warm-up never saturates the connection
}

/** Run after the game is interactive (call once at startup). */
export function initLazyAssets() {
  const go = () => {
    setTimeout(activateLazyVideos, 600);   // backdrop videos: stream in during the intro splash
    setTimeout(warmExtras, 2500);          // bonus extras: warm once first paint has settled
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
