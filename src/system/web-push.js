/**
 * @module web-push
 * @description Dev-only "🔔 Web Push" button (hidden on the public build).
 *
 * Opens a styled popup (matching the other modals) that:
 *   • shows where the game is deployed live, with COPY LINK / OPEN SITE actions, and
 *   • offers a "🚀 PUSH TO WEB" button that builds + deploys your current local
 *     version straight to the live site.
 *
 * A browser page can't run a shell command on its own, so the push works via a
 * tiny hook on the LOCAL dev server (tools/serve.js → POST /__deploy, which runs
 * ./deploy.sh). That hook only exists locally — on the live site (or file://)
 * the capability ping fails and the button stays disabled. So you can push from
 * here while developing, but the public/client site can never trigger a deploy.
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
const pushBtn  = document.getElementById('btn-webpush-push');

if (btn && modal) {
  // Fill in the link once (strip the protocol for a cleaner display).
  if (linkEl)  linkEl.href = LIVE_URL;
  if (urlText) urlText.textContent = LIVE_URL.replace(/^https?:\/\//, '');

  let canDeploy = false;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.opacity = '1';
    statusEl.style.color = kind === 'err'  ? '#FF6B6B'
                         : kind === 'info' ? '#CFE8D6'
                         : '#2EE85A';
  }
  function clearStatus() { if (statusEl) { statusEl.innerHTML = '&nbsp;'; statusEl.style.color = ''; } }

  // Ask the local dev server whether it can deploy (only tools/serve.js answers).
  async function checkCapability() {
    if (!pushBtn) return;
    try {
      const res = await fetch('/__deploy', { method: 'GET' });
      if (!res.ok) throw 0;
      const data = await res.json();
      canDeploy = !!data.capable;
    } catch (e) { canDeploy = false; }
    pushBtn.disabled = !canDeploy;
    pushBtn.title = canDeploy
      ? 'Build and deploy your current local version to the live site'
      : 'Only works on the local dev server (node tools/serve.js)';
  }

  const openModal  = () => { clearStatus(); modal.classList.remove('hidden'); checkCapability(); };
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

  if (pushBtn) pushBtn.addEventListener('click', async () => {
    if (pushBtn.disabled) return;
    pushBtn.disabled = true;
    pushBtn.classList.add('deploying');
    const label = pushBtn.textContent;
    pushBtn.textContent = '⏳ DEPLOYING…';
    setStatus('Building & uploading to Vercel… (~20–40s)', 'info');
    try {
      const res = await fetch('/__deploy', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatus(`✓ Pushed live! (${Math.round((data.durationMs || 0) / 1000)}s)`, 'ok');
      } else {
        setStatus(`✗ Deploy failed${data.code != null ? ` (exit ${data.code})` : ''} — check the terminal.`, 'err');
      }
    } catch (e) {
      setStatus('✗ Couldn’t reach the local deploy server.', 'err');
    } finally {
      pushBtn.textContent = label;
      pushBtn.classList.remove('deploying');
      pushBtn.disabled = !canDeploy;
    }
  });
}
