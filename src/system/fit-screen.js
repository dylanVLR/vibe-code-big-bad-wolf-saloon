/**
 * @module fit-screen
 * @description Scales the whole game to fit short / mobile viewports without
 * scrolling — the key to a good iPhone-landscape experience.
 *
 * The game is authored at a fixed natural size (#game-root ≈ 920×663). On a
 * desktop it shows at natural size and this module does nothing. On a phone —
 * especially landscape, where the height is tiny — it measures the natural size,
 * subtracts the safe-area insets (Dynamic Island / home indicator), and applies
 * a uniform `scale()` so the entire cabinet fits on screen, centred inside the
 * safe area. Re-runs on resize / orientation change.
 */
'use strict';

const PAD = 6;   // breathing room around the scaled game (px)

/** Read the current safe-area insets (0 on desktop; non-zero on iOS with viewport-fit=cover). */
function safeInsets() {
  const p = document.createElement('div');
  p.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const v = s => parseFloat(cs.getPropertyValue(s)) || 0;
  const out = { t: v('padding-top'), r: v('padding-right'), b: v('padding-bottom'), l: v('padding-left') };
  p.remove();
  return out;
}

/** Measure the game, compute the fit scale, and apply it (or restore natural layout). */
export function fitScreen() {
  const g = document.getElementById('game-root');
  if (!g) return;

  // Reset to natural layout so we can measure the true unscaled size.
  document.body.classList.remove('fit-mode');
  g.style.transform = '';
  g.style.left = '';
  g.style.top = '';

  const gw = g.offsetWidth, gh = g.offsetHeight;
  if (!gw || !gh) return;

  const ins = safeInsets();
  const availW = Math.max(1, window.innerWidth  - ins.l - ins.r - PAD * 2);
  const availH = Math.max(1, window.innerHeight - ins.t - ins.b - PAD * 2);

  const scale = Math.min(availW / gw, availH / gh, 1);   // never upscale past natural
  if (scale >= 0.999) return;                            // fits as-is (desktop) — leave default layout

  // Centre the scaled game inside the safe-area box.
  const sw = gw * scale, sh = gh * scale;
  const left = ins.l + PAD + Math.max(0, (availW - sw) / 2);
  const top  = ins.t + PAD + Math.max(0, (availH - sh) / 2);

  document.body.classList.add('fit-mode');
  g.style.left = left + 'px';
  g.style.top = top + 'px';
  g.style.transform = `scale(${scale})`;
}

// Debounce with setTimeout (not requestAnimationFrame, which pauses in background
// tabs) so a rotate / resize always re-fits.
let timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(fitScreen, 120); }

/** Wire up listeners and do an initial fit. Call once at startup. */
export function initFitScreen() {
  fitScreen();
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(fitScreen, 250));
  // re-fit once late assets (fonts/videos) settle the natural size
  window.addEventListener('load', () => setTimeout(fitScreen, 150));
  setTimeout(fitScreen, 600);
}
