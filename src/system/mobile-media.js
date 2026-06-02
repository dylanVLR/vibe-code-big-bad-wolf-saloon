/**
 * @module mobile-media
 * @description On phones, the base game's three decorative videos are the main
 * source of sluggishness — they decode simultaneously, and one (the SPIN badge)
 * carries an alpha channel that iOS software-decodes:
 *     • #bg-video        the full-screen saloon background  (Background.webm)
 *     • #reel-bg-video   the "Wanted" poster reel backdrop  (Wanted_poster.webm)
 *     • #spin-video      the transparent SPIN badge         (Spin.webm)
 * On any mobile device we skip all three and show pre-optimized static images
 * (assets/mobile/*.webp) instead — zero video decoding on the base game. Desktop
 * is untouched. (The background video's src is held in a data-attribute so it
 * never even begins downloading on mobile; desktop wires it up here.)
 *
 * This module runs BEFORE the scene/game modules import, so they pick up the
 * swapped <img> elements (idle-poster's glow still works on the static poster;
 * the SPIN-badge code no-ops harmlessly on an <img>).
 */
'use strict';

import { IS_MOBILE } from './video-format.js';

const bg     = document.getElementById('bg-video');
const reelBg = document.getElementById('reel-bg-video');
const spin   = document.getElementById('spin-video');

/** Replace a <video> with an <img> that keeps the same id + classes, so the
 *  existing CSS positions it identically and no video ever decodes. */
function toStatic(video, src) {
  if (!video) return;
  const img = document.createElement('img');
  img.id = video.id;
  img.className = video.className;
  img.alt = '';
  img.src = src;
  video.replaceWith(img);
}

if (IS_MOBILE) {
  toStatic(bg,     'assets/mobile/background.webp');
  toStatic(reelBg, 'assets/mobile/wanted_poster.webp');
  toStatic(spin,   'assets/mobile/spin.webp');
} else if (bg && bg.dataset.bgSrc && !bg.getAttribute('src')) {
  // Desktop: the background video's src was kept out of the HTML so it never
  // starts downloading on mobile — wire it up now and play.
  bg.setAttribute('src', bg.dataset.bgSrc);
  if (bg.play) bg.play().catch(() => {});
}
