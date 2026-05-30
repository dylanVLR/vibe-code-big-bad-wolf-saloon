/**
 * @module rtp
 * @description The RTP picker — a popup (opened from the options drawer) that
 * lets the player choose which math model the game runs. The list of choices is
 * rendered straight from RTP_MODELS in config.js, so adding a model there makes
 * a new card appear here automatically; no UI edits needed.
 *
 * Selecting a card calls applyRtpModel(), which records the choice in shared
 * state. There is currently a single model, so switching is a no-op beyond the
 * UI; when a second model is added, applyRtpModel() is the one place to also
 * swap the active reel strips / bonus tables.
 */
'use strict';

import { RTP_MODELS } from './config.js';
import { state } from './state.js';
import { synth } from './audio.js';

const btnRtp   = document.getElementById('btn-rtp');
const modal    = document.getElementById('rtp-modal');
const closeBtn = document.getElementById('btn-close-rtp');
const doneBtn  = document.getElementById('btn-rtp-done');
const optionsEl = document.getElementById('rtp-options');

const pct = rtp => `${(rtp * 100).toFixed(0)}%`;

/** Build one selectable card per model (once). */
function renderOptions() {
  if (!optionsEl) return;
  optionsEl.innerHTML = '';
  RTP_MODELS.forEach(model => {
    const card = document.createElement('button');
    card.className = 'rtp-option';
    card.dataset.id = model.id;
    card.innerHTML = `
      <span class="rtp-check" aria-hidden="true">✓</span>
      <span class="rtp-pct">${pct(model.rtp)}</span>
      <span class="rtp-text">
        <span class="rtp-name">${model.label}</span>
        <span class="rtp-blurb">${model.blurb}</span>
      </span>`;
    card.addEventListener('click', () => applyRtpModel(model.id));
    optionsEl.appendChild(card);
  });
  markSelected();
}

/** Highlight whichever card matches the active model. */
function markSelected() {
  if (!optionsEl) return;
  optionsEl.querySelectorAll('.rtp-option').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === state.rtpModelId);
  });
}

/**
 * Select a model. Records it in state and refreshes the UI. This is the single
 * spot where future model-switching (swapping reel strips / bonus math) hooks in.
 */
export function applyRtpModel(id) {
  if (!RTP_MODELS.some(m => m.id === id)) return;
  const changed = state.rtpModelId !== id;
  state.rtpModelId = id;
  markSelected();
  if (changed) synth.coinClink();
}

function openModal()  { markSelected(); modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

if (btnRtp && modal) {
  renderOptions();
  btnRtp.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (doneBtn) doneBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
}
