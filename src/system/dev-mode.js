/**
 * @module dev-mode
 * @description Hides developer / admin tools on the public build. They are OFF
 * by default. To turn them on, add ?dev=1 (or #dev) to the URL once — the choice
 * is remembered in localStorage; ?dev=0 (or #nodev) turns it back off.
 *
 * When dev mode is OFF, anything tagged `.dev-tool` is hidden and the backtick
 * debug panel shortcut is inert (gated via DEV_MODE in base-game.js).
 *
 * NOTE: this is a convenience gate to keep tools out of normal players' way, not
 * hard security — these tools only hand out demo credits / change the local math
 * model and expose no secrets, so client-side hiding is appropriate.
 */
'use strict';

function compute() {
  try {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.replace('#', '').toLowerCase();
    if (params.get('dev') === '1' || hash === 'dev')   localStorage.setItem('bbw_dev', '1');
    if (params.get('dev') === '0' || hash === 'nodev') localStorage.removeItem('bbw_dev');
    return localStorage.getItem('bbw_dev') === '1';
  } catch (e) {
    return false;   // localStorage blocked → default to the safe (public) state
  }
}

// TEMPORARILY FORCED ON: dev/admin tools are available to everyone, on every
// build (including web), with no ?dev=1 needed. The gated logic in compute() is
// kept intact below — to restore it, change this line back to:
//   export const DEV_MODE = compute();
export const DEV_MODE = true;
void compute;   // keep compute() referenced so the gate stays a one-line revert

if (DEV_MODE) {
  document.body.classList.add('dev-mode');
} else {
  // Remove every dev-only control from view for normal players.
  document.querySelectorAll('.dev-tool').forEach(el => el.classList.add('hidden'));
}
