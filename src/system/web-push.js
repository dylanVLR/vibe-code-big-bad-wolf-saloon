/**
 * @module web-push
 * @description Dev-only "🔔 Web Push" button (hidden on the public build).
 *
 * A page running in the browser can't trigger a real CLI/Git deploy — that needs
 * a shell (see deploy.sh). So this button does the next-most-useful thing: it
 * opens the LIVE deployed site in a new tab, a one-click "jump to what the client
 * sees". When the deploy target changes, update LIVE_URL below (and the same URL
 * in deploy.sh).
 */
'use strict';

// The current public deploy target. Keep in sync with deploy.sh.
export const LIVE_URL = 'https://super-lolly-c99fd8.netlify.app';

const btn = document.getElementById('btn-web-push');
if (btn) {
  btn.title = `Open the live deployed site (${LIVE_URL})`;
  btn.addEventListener('click', () => {
    window.open(LIVE_URL, '_blank', 'noopener');
  });
}
