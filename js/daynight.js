/**
 * @module daynight
 * @description Darkens the background image based on the time of day.
 *
 * By default it follows the browser's real clock — brightest at noon, darkest
 * around midnight — and re-checks every minute. The clock button (🕐) opens a
 * slider to scrub the time of day manually; "USE REAL TIME" switches back to the
 * live clock.
 *
 * Mapping: a cosine of the hour gives a smooth day curve (1 = full light at
 * noon, 0 = full dark at midnight); the overlay opacity is MAX_DARK × (1 − light).
 */
'use strict';

const overlay = document.getElementById('day-night-overlay');
const btnTime = document.getElementById('btn-time');
const panel   = document.getElementById('time-panel');
const slider  = document.getElementById('time-slider');
const label   = document.getElementById('time-label');
const autoBtn = document.getElementById('time-auto');

const MAX_DARK = 0.82;     // overlay opacity at the darkest point (midnight)
let autoMode = true;
let tick = null;

/** Overlay opacity for a minute-of-day (0..1439): 0 at noon … MAX_DARK at midnight. */
function darknessFor(minutes) {
  const hour = minutes / 60;                                          // 0..24
  const light = (1 + Math.cos(((hour - 12) / 24) * 2 * Math.PI)) / 2; // 1 noon, 0 midnight
  return MAX_DARK * (1 - light);
}

/** Pretty 12-hour clock string, e.g. 615 → "10:15 AM". */
function fmtTime(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = (h % 12) || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

function apply(minutes) {
  if (overlay) overlay.style.opacity = darknessFor(minutes).toFixed(3);
  if (label) label.textContent = fmtTime(minutes);
  if (slider) slider.value = String(minutes);
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Animate the day/night darkening from its current value to the correct one for
 * the current time. Used by the intro reveal, which first parks the overlay at 0
 * (clean background) and then calls this to fade the darkening back in.
 */
export function revealDayNight(ms = 1100) {
  if (!overlay) return;
  overlay.style.transition = `opacity ${ms}ms ease`;
  apply(autoMode ? nowMinutes() : parseInt(slider.value, 10));
  setTimeout(() => { overlay.style.transition = ''; }, ms + 60);  // drop transition so the slider stays snappy
}

/** Follow the real clock and keep it updated each minute. */
function goAuto() {
  autoMode = true;
  if (autoBtn) autoBtn.classList.add('is-active');
  apply(nowMinutes());
  clearInterval(tick);
  tick = setInterval(() => { if (autoMode) apply(nowMinutes()); }, 60000);
}

if (overlay) {
  if (slider) slider.addEventListener('input', () => {
    autoMode = false;                                  // manual override
    if (autoBtn) autoBtn.classList.remove('is-active');
    apply(parseInt(slider.value, 10));
  });
  if (autoBtn) autoBtn.addEventListener('click', goAuto);

  if (btnTime && panel) {
    btnTime.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('hidden'); });
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btnTime.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });
  }

  goAuto();   // start on the real time of day
}
