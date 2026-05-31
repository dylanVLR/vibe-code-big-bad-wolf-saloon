/**
 * @module video-format
 * @description Picks the transparent-video format the current browser can
 * actually render WITH transparency.
 *
 * Safari — macOS and iOS, and in fact *every* iOS browser, since they're all
 * WebKit under the hood — does NOT support an alpha channel in WebM (VP8/VP9).
 * It draws the clip on a solid black box. WebKit's supported transparent format
 * is HEVC-with-alpha in an .mp4 (see tools/alpha-mp4.js, which makes one twin
 * per transparent clip). Chrome / Firefox / Edge are the mirror image: WebM
 * alpha works, HEVC-alpha doesn't. So WebKit is served the .mp4 and everyone
 * else the .webm.
 *
 * Apply alphaSrc() / data-alpha-src ONLY to genuinely transparent clips (the
 * SideWolf, the SPIN badge, the frame-morph overlays). Opaque clips have no
 * .mp4 twin and must keep their .webm.
 */
'use strict';

const ua = navigator.userAgent || '';
const isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));   // iPadOS poses as a Mac
const isDesktopSafari = /Safari/.test(ua) &&
              !/Chrome|Chromium|CriOS|Android|Edg|OPR|Firefox|FxiOS/.test(ua);

/** True on iPhone / iPad (all iOS browsers are WebKit). iOS software-decodes
 *  HEVC-alpha and throttles concurrent videos, so callers lighten up here. */
export const IS_IOS = isIOS;

/** True when this browser needs HEVC-alpha .mp4 instead of WebM-alpha. */
export const USE_HEVC_ALPHA = isIOS || isDesktopSafari;

/** Map a transparent-clip URL (`…/foo.webm`) to the format this browser can show with alpha. */
export function alphaSrc(url) {
  if (!USE_HEVC_ALPHA || !url) return url;
  return url.replace(/\.webm(\?|#|$)/i, '.mp4$1');
}

/**
 * Set the right src on any `<video data-alpha-src="…/foo.webm">` element.
 * Call once at startup (before the players try to use those elements).
 */
export function initAlphaVideos() {
  document.querySelectorAll('video[data-alpha-src]').forEach(v => {
    if (v.getAttribute('src')) return;
    v.setAttribute('src', alphaSrc(v.dataset.alphaSrc));
  });
}
