/**
 * @module deposit
 * @description "Add Credit" — a popup with $1 / $20 / $50 / $100 buttons that
 * each add their amount to the machine's balance. Stays open so you can stack
 * deposits; the balance updates live.
 */
'use strict';

import { state } from '../core/state.js';
import { updateDisplays } from '../render/readouts.js';
import { fmt } from '../core/utils.js';
import { synth } from '../audio/sound.js';
import { conductor } from '../audio/conductor.js';

const btnDeposit = document.getElementById('btn-deposit');
const modal      = document.getElementById('deposit-modal');
const closeBtn   = document.getElementById('btn-close-deposit');
const doneBtn    = document.getElementById('btn-deposit-done');
const balEl      = document.getElementById('deposit-balance');

function refresh() { if (balEl) balEl.textContent = fmt(state.balance); }
function openModal() { refresh(); modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

if (btnDeposit && modal) {
  btnDeposit.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (doneBtn) doneBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  modal.querySelectorAll('.deposit-amt').forEach(btn => {
    btn.addEventListener('click', () => {
      state.balance += parseFloat(btn.dataset.amt);
      updateDisplays();   // update the CASH readout
      refresh();          // update the balance shown in the popup
      synth.coinClink();  // little feedback chime
      conductor.onDeposit();   // celebratory musical flourish
    });
  });
}
