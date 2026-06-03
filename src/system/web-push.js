/**
 * @module web-push
 * @description Dev-only "🔔 Live Site" button (hidden on the public build).
 *
 * Opens a styled popup (matching the other modals) that shows where the game is
 * deployed live, with COPY LINK / OPEN SITE actions so you can share it.
 *
 * Deploys are done from the terminal with ./deploy.sh — there is no in-app
 * deploy trigger.
 *
 * When the deploy target changes, update LIVE_URL below (and the same URL in
 * deploy.sh).
 */
'use strict';

// The current public deploy target. Keep in sync with deploy.sh.
export const LIVE_URL = 'https://vibe-code-big-bad-wolf-saloon-vlr-studios.vercel.app';

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

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.opacity = '1';
    statusEl.style.color = kind === 'err'  ? '#FF6B6B'
                         : kind === 'info' ? '#CFE8D6'
                         : '#2EE85A';
  }
  function clearStatus() { if (statusEl) { statusEl.innerHTML = '&nbsp;'; statusEl.style.color = ''; } }

  const openModal  = () => { clearStatus(); modal.classList.remove('hidden'); };
  const closeModal = () => modal.classList.add('hidden');

  btn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  if (openBtn) openBtn.addEventListener('click', () => window.open(LIVE_URL, '_blank', 'noopener'));

  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(LIVE_URL);
      setStatus('✓ Link copied to clipboard', 'ok');
    } catch (e) {
      setStatus('Copy failed — long-press the link to copy', 'err');
    }
    setTimeout(clearStatus, 1800);
  });
}
