/**
 * @module mathpanel
 * @description The 🧮 MATH pop-up: a plain-English breakdown of RTP (base vs
 * bonus), the bonus trigger rate, and the reel composition. Everything is
 * derived from the live constants and a quick run of the shared simulation
 * engine, so it always reflects the real par sheet.
 */
'use strict';

import { SYMBOLS, HAT_IDS, REEL_STRIPS } from './config.js';
import { runSimulation } from './simulation.js';

const btnMath  = document.getElementById('btn-math');
const modal    = document.getElementById('math-modal');
const btnClose = document.getElementById('btn-close-math');

const RTP_SPINS = 1_000_000;   // spins to estimate RTP over when the panel opens
let lastResult = null;          // cache so re-opening is instant

function openPanel() {
  modal.classList.remove('hidden');
  renderComposition();          // instant — pure data
  if (lastResult) renderRtp(lastResult);
  runRtpEstimate();             // refresh RTP in the background
}

/* ── reel composition (instant) ── */
function renderComposition() {
  const total = REEL_STRIPS.reduce((sum, strip) => sum + strip.length, 0);
  document.getElementById('math-total-positions').textContent = total;

  const symIds = Object.keys(SYMBOLS);
  const counts = {};
  symIds.forEach(id => { counts[id] = 0; });
  REEL_STRIPS.forEach(strip => strip.forEach(id => { counts[id]++; }));

  let hatTotal = 0;
  HAT_IDS.forEach(id => { hatTotal += counts[id]; });
  document.getElementById('math-hat-callout').innerHTML =
    `🦺 <b>Hard hats</b> (the bonus trigger) are <b>${((hatTotal / total) * 100).toFixed(1)}%</b> of all ` +
    `reel positions — ${hatTotal} of ${total}. The rarer they are, the rarer the bonus.`;

  const rows = symIds
    .map(id => ({ label: SYMBOLS[id].label, count: counts[id], isHat: !!SYMBOLS[id].isHat }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...rows.map(r => r.count));

  const body = document.getElementById('math-comp-body');
  body.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="mc-name">${r.label}${r.isHat ? ' <span class="mc-tag">HAT</span>' : ''}</td>` +
      `<td class="mc-count">${r.count}</td>` +
      `<td class="mc-barcell"><span class="mc-bar${r.isHat ? ' is-hat' : ''}" style="width:${(r.count / maxCount) * 100}%"></span></td>` +
      `<td class="mc-pct">${((r.count / total) * 100).toFixed(1)}%</td>`;
    body.appendChild(tr);
  }
}

/* ── RTP + trigger rate (async sim) ── */
async function runRtpEstimate() {
  const totalEl = document.getElementById('math-rtp-total');
  totalEl.classList.add('is-loading');
  document.getElementById('math-rtp-note').textContent = `Crunching ${RTP_SPINS.toLocaleString()} simulated spins…`;
  let R;
  try {
    R = await runSimulation(RTP_SPINS, 1, 1000);
  } catch (err) {
    document.getElementById('math-rtp-note').textContent = 'Could not estimate RTP: ' + err.message;
    totalEl.classList.remove('is-loading');
    return;
  }
  lastResult = R;
  totalEl.classList.remove('is-loading');
  renderRtp(R);
}

function renderRtp(R) {
  const base = R.baseWon / R.totalWagered;
  const bonus = R.bonusWon / R.totalWagered;
  const total = base + bonus;

  document.getElementById('math-rtp-total').textContent = (total * 100).toFixed(1) + '%';
  document.getElementById('math-rtp-base').textContent = (base * 100).toFixed(1) + '%';
  document.getElementById('math-rtp-bonus').textContent = (bonus * 100).toFixed(1) + '%';
  document.getElementById('math-bar-base').style.width = (total > 0 ? (base / total) * 100 : 0) + '%';
  document.getElementById('math-bar-bonus').style.width = (total > 0 ? (bonus / total) * 100 : 0) + '%';

  const edge = (1 - total) * 100;
  const noteEl = document.getElementById('math-rtp-note');
  if (edge >= 0) {
    noteEl.innerHTML = `For every <b>$100</b> wagered, players get back about <b>$${(total * 100).toFixed(0)}</b> ` +
      `over the long run. The house keeps about <b>${edge.toFixed(1)}%</b>.`;
  } else {
    noteEl.innerHTML = `⚠ Players currently get back <b>${(total * 100).toFixed(0)}%</b> — more than they wager. ` +
      `This game pays out too much and needs balancing.`;
  }

  const oneIn = R.bonusTriggers > 0 ? Math.round(RTP_SPINS / R.bonusTriggers) : 0;
  document.getElementById('math-trigger-rate').textContent =
    oneIn > 0 ? `about 1 in ${oneIn.toLocaleString()} spins` : 'effectively never';
}

if (btnMath && modal) {
  btnMath.addEventListener('click', openPanel);
  btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}
