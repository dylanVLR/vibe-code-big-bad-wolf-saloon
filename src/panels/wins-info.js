/**
 * @module wins-info
 * @description Dev-only "🎉 WINS" popup. Breaks down the win-celebration tiers —
 * what each on-screen banner is, the win size (as a multiple of the bet) that
 * triggers it, and example dollar amounts at the lowest, default and highest
 * bets. Everything is read from WIN_TIERS / BET_LEVELS, so the table can never
 * drift from what the game actually does (the same WIN_TIERS drive base-game.js).
 */
'use strict';

import { WIN_TIERS, BET_LEVELS, DEFAULT_BET_INDEX } from '../math/par-sheet.js';
import { fmt } from '../core/utils.js';
import { previewWin } from '../game/base-game.js';

const MIN_BET = BET_LEVELS[0];
const DEF_BET = BET_LEVELS[DEFAULT_BET_INDEX];
const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

// The on-screen tiers, smallest → biggest. `mult` is the win ÷ bet threshold.
const TIERS = [
  { key: 'small',  cls: '',          name: 'Win',        mult: 0,               banner: 'Coins + count-up (no banner)' },
  { key: 'medium', cls: '',          name: 'Nice Win',   mult: WIN_TIERS.medium, banner: 'Bigger count-up + coins' },
  { key: 'big',    cls: 'tier-big',  name: 'BIG WIN!',   mult: WIN_TIERS.big,    banner: 'Full-screen banner' },
  { key: 'mega',   cls: 'tier-mega', name: 'MEGA WIN!',  mult: WIN_TIERS.mega,   banner: 'Full-screen banner (rainbow)' },
  { key: 'max',    cls: 'tier-max',  name: 'MAX WIN!',   mult: WIN_TIERS.max,    banner: 'Top banner (blazing gold)' },
];

function buildHTML() {
  const PREVIEWABLE = new Set(['big', 'mega', 'max']);
  const rows = TIERS.map(t => {
    const at = (bet) => t.mult === 0 ? '—' : fmt(t.mult * bet);
    const trig = t.mult === 0 ? 'any win' : `≥ ${t.mult}×`;
    const can = PREVIEWABLE.has(t.key);
    const screen = can
      ? `${t.banner} <span class="wins-preview">▶&nbsp;Preview</span>`
      : t.banner;
    return `<tr class="${t.cls}${can ? ' previewable' : ''}"${can ? ` data-preview="${t.key}"` : ''}>
      <td class="win-tier">${t.name}</td>
      <td class="win-mult">${trig}</td>
      <td>${at(MIN_BET)}</td>
      <td>${at(DEF_BET)}</td>
      <td>${at(MAX_BET)}</td>
      <td class="win-screen">${screen}</td>
    </tr>`;
  }).join('');

  return `
    <p class="wins-intro">Wins are celebrated in tiers based on how big the win is <b>relative to your bet</b>
      (win &divide; bet). Because the thresholds are multiples of the bet, the dollar trigger scales with how
      much you wager — so the same spin is a “Big Win” at a low bet only if it pays a lot more in dollars at a
      high bet. The default bet is <b>${fmt(DEF_BET)}</b>.
      <br><b>Tip:</b> click the <b>BIG / MEGA / MAX WIN</b> rows below to preview that celebration in the game
      (it shows the threshold &times; your current bet, and changes nothing).</p>
    <table class="wins-table">
      <thead><tr>
        <th>Celebration</th><th>Win&nbsp;&ge;</th>
        <th>@ ${fmt(MIN_BET)}</th><th>@ ${fmt(DEF_BET)}</th><th>@ ${fmt(MAX_BET)}</th>
        <th style="text-align:left;">On screen</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="wins-note"><b>MAX WIN!</b> is the top tier (≥ ${WIN_TIERS.max}× bet) and matches the wolf’s
      biggest voice reaction. The bonus round has its own celebrations on top of these — the Mini &amp; Minor
      house jackpots, the <b>Mansion Jackpot</b>, and the end-of-bonus total. In a 10,000,000-spin simulation the
      largest single win seen was about <b>1,239× bet</b>; the game does not impose a fixed maximum-win cap.</p>`;
}

const modal = document.getElementById('wins-modal');
const btn = document.getElementById('btn-wins');
const btnClose = document.getElementById('btn-close-wins');
const contentEl = document.getElementById('wins-content');

if (modal && contentEl) {
  let built = false;
  const close = () => modal.classList.add('hidden');
  const open = () => {
    if (!built) {
      contentEl.innerHTML = buildHTML();
      // clicking a BIG/MEGA/MAX row closes the panel and replays that celebration
      contentEl.querySelectorAll('tr.previewable').forEach(tr => {
        tr.addEventListener('click', () => { close(); previewWin(tr.dataset.preview); });
      });
      built = true;
    }
    modal.classList.remove('hidden');
  };
  if (btn) btn.addEventListener('click', open);
  if (btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
}
