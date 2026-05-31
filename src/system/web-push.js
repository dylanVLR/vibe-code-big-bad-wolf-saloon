/**
 * @module web-push
 * @description Dev-only "🔔 Web Push" button (hidden on the public build).
 *
 * Clicking it opens a styled popup (matching the other modals) that shows where
 * the game is deployed live, with one-click "open" and "copy link" actions. A
 * page in the browser can't trigger a real CLI/Git deploy — that needs a shell
 * (see deploy.sh) — so surfacing the live link is the most useful thing it can do.
 *
 * When the deploy target changes, update LIVE_URL below (and the same URL in
 * deploy.sh).
 */
'use strict';

// The current public deploy target. Keep in sync with deploy.sh.
export const LIVE_URL = 'https://super-lolly-c99fd8.netlify.app';

const btn      = document.getElementById('btn-web-push');
const modal    = document.getElementById('webpush-modal');
const closeBtn = document.getElementById('btn-close-webpush');
const linkEl   = document.getElementById('webpush-link');
const urlText  = document.getElementById('webpush-url-text');
const statusEl = document.getElementById('webpush-status');
const copyBtn  = document.getElementById('btn-webpush-copy');
const openBtn  = document.getElementById('btn-webpush-open');

if (btn && modal) {
  // Fill in the link once (strip the protocol for a cleaner display).
  if (linkEl)  linkEl.href = LIVE_URL;
  if (urlText) urlText.textContent = LIVE_URL.replace(/^https?:\/\//, '');

  const openModal  = () => { if (statusEl) statusEl.innerHTML = '&nbsp;'; modal.classList.remove('hidden'); };
  const closeModal = () => modal.classList.add('hidden');

  btn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  if (openBtn) openBtn.addEventListener('click', () => window.open(LIVE_URL, '_blank', 'noopener'));

  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const flash = msg => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.opacity = '1';
      setTimeout(() => { statusEl.style.opacity = '0'; }, 1800);
    };
    try {
      await navigator.clipboard.writeText(LIVE_URL);
      flash('✓ Link copied to clipboard');
    } catch (e) {
      // clipboard API blocked (insecure context / permissions) — select as a fallback
      flash('Copy failed — long-press the link to copy');
    }
  });
}
