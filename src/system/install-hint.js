/**
 * @module install-hint
 * @description A tasteful, one-time "Add to Home Screen" nudge on iOS Safari.
 *
 * Shown only when it makes sense: on an iPhone/iPad that is NOT already running
 * as an installed (standalone) app, and only once ever (remembered in
 * localStorage). Launching from the Home Screen, or tapping ✕, retires it.
 * Installing gives the player a fullscreen, landscape, native-feeling game with
 * its own icon — no Safari chrome.
 */
'use strict';

import { IS_IOS } from './video-format.js';

const KEY = 'bbw_a2hs_seen';

/** Already launched as an installed app? Then never nudge. */
function isStandalone() {
  return window.navigator.standalone === true ||
         (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

export function initInstallHint() {
  if (!IS_IOS || isStandalone()) return;              // not iOS, or already installed
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}   // already shown once

  // iOS share glyph (square with up-arrow) so the instruction is unmistakable.
  const shareIcon =
    '<svg class="a2hs-share" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 3l4 4-1.4 1.4L13 6.8V15h-2V6.8L9.4 8.4 8 7l4-4z" fill="currentColor"/>' +
      '<path d="M5 11h3v2H6v6h12v-6h-2v-2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="currentColor"/>' +
    '</svg>';

  const el = document.createElement('div');
  el.id = 'a2hs-hint';
  el.setAttribute('role', 'dialog');
  el.innerHTML =
    '<img class="a2hs-ico" src="assets/icon-180.png" alt="">' +
    '<div class="a2hs-text">' +
      '<b>Play fullscreen</b>' +
      '<span>Tap ' + shareIcon + ' <b>Share</b>, then <b>“Add to Home Screen.”</b></span>' +
    '</div>' +
    '<button class="a2hs-close" aria-label="Dismiss">&times;</button>';
  document.body.appendChild(el);

  // mark seen as soon as it appears → truly one-time
  try { localStorage.setItem(KEY, '1'); } catch (e) {}

  let gone = false;
  const close = () => {
    if (gone) return; gone = true;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector('.a2hs-close').addEventListener('click', close);

  setTimeout(() => el.classList.add('show'), 1400);   // let the game settle first
  setTimeout(close, 13000);                            // auto-dismiss if ignored
}
