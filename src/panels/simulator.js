/**
 * @module simulator
 * @description The 📊 SIM dashboard: a chunked Monte-Carlo run over the real
 * game math (from mathcore) plus zero-dependency Canvas 2D charts. Exports
 * `runSimulation` so the MATH panel can reuse the exact same engine.
 */
'use strict';

import { SYMBOLS, HAT_IDS, BONUS_CONFIG } from '../math/par-sheet.js';
import { generateGrid, evaluateGrid, simulateBonusOutcome } from '../math/mathcore.js';

const btnSim        = document.getElementById('btn-simulate');
const simModal      = document.getElementById('sim-modal');
const btnCloseSim   = document.getElementById('btn-close-sim');
const btnRunSim     = document.getElementById('btn-run-sim');
const runLabel      = document.getElementById('sim-run-label');
const simSpinsEl    = document.getElementById('sim-spins');
const simBetEl      = document.getElementById('sim-bet');
const simBankrollEl = document.getElementById('sim-bankroll');
const progressWrap  = document.getElementById('sim-progress-wrap');
const progressFill  = document.getElementById('sim-progress-fill');
const progressText  = document.getElementById('sim-progress-text');
const elapsedEl     = document.getElementById('sim-elapsed');
const dashboard     = document.getElementById('sim-dashboard');
const insightsEl    = document.getElementById('sim-insights');

/* ══════════════════════════════════════════
   MONTE CARLO ENGINE (chunked async, uses mathcore)
══════════════════════════════════════════ */
export async function runSimulation(totalSpins, bet, startBankroll) {
  const CHUNK = 4000;   // spins per yield — bigger = fewer timer yields = faster runs
  const R = {
    totalWagered: 0, totalWon: 0, baseWon: 0, bonusWon: 0,
    wins: 0, losses: 0, bonusTriggers: 0, bonusTotalFS: 0,
    maxWin: 0, maxMult: 0, symbolWins: {}, balanceHistory: [],
    winsByTier: { dead: 0, tiny: 0, small: 0, medium: 0, big: 0, mega: 0 },
    winsByTierPaid: { dead: 0, tiny: 0, small: 0, medium: 0, big: 0, mega: 0 },
    allMultipliers: [],
    currentWinStreak: 0, currentLossStreak: 0, maxWinStreak: 0, maxLossStreak: 0,
    startBankroll, bankrollSurvived: true, bustSpin: -1,
    peakBalance: startBankroll, troughBalance: startBankroll,
  };
  Object.keys(SYMBOLS).forEach(id => { R.symbolWins[id] = { count: 0, totalPaid: 0 }; });

  let bal = startBankroll, processed = 0;
  const sampleRate = Math.max(1, Math.floor(totalSpins / 600));
  const startTime = performance.now();

  while (processed < totalSpins) {
    const end = Math.min(processed + CHUNK, totalSpins);
    for (let i = processed; i < end; i++) {
      R.totalWagered += bet;
      bal -= bet;

      const grid = generateGrid();
      let hatCount = 0;
      for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (HAT_IDS.includes(grid[r][row])) hatCount++;

      // Match the live game: a 6+-hat spin triggers the bonus and pays ONLY the
      // bonus — its base line/way wins are forfeited (base-game.js early-returns).
      let spinWin = 0;
      if (hatCount >= BONUS_CONFIG.triggerHats) {
        R.bonusTriggers++;
        const b = simulateBonusOutcome(bet, grid);
        spinWin = b.bonusWin;
        R.bonusWon += b.bonusWin;
        R.bonusTotalFS += b.freeSpins;
      } else {
        const { totalWin, winners } = evaluateGrid(grid, bet);
        spinWin = totalWin;
        R.baseWon += totalWin;
        winners.forEach(w => {
          if (R.symbolWins[w.symId]) { R.symbolWins[w.symId].count++; R.symbolWins[w.symId].totalPaid += w.winAmount; }
        });
      }

      R.totalWon += spinWin;
      bal += spinWin;
      const m = spinWin / bet;
      R.allMultipliers.push(m);

      if (spinWin > 0) {
        R.wins++;
        if (spinWin > R.maxWin) { R.maxWin = spinWin; R.maxMult = m; }
        R.currentWinStreak++; R.currentLossStreak = 0;
        if (R.currentWinStreak > R.maxWinStreak) R.maxWinStreak = R.currentWinStreak;
        if (m < 1)       { R.winsByTier.tiny++;   R.winsByTierPaid.tiny += spinWin; }
        else if (m < 3)  { R.winsByTier.small++;  R.winsByTierPaid.small += spinWin; }
        else if (m < 8)  { R.winsByTier.medium++; R.winsByTierPaid.medium += spinWin; }
        else if (m < 20) { R.winsByTier.big++;    R.winsByTierPaid.big += spinWin; }
        else             { R.winsByTier.mega++;   R.winsByTierPaid.mega += spinWin; }
      } else {
        R.losses++;
        R.winsByTier.dead++;
        R.currentLossStreak++; R.currentWinStreak = 0;
        if (R.currentLossStreak > R.maxLossStreak) R.maxLossStreak = R.currentLossStreak;
      }

      if (bal > R.peakBalance) R.peakBalance = bal;
      if (bal < R.troughBalance) R.troughBalance = bal;
      if (bal <= 0 && R.bankrollSurvived) { R.bankrollSurvived = false; R.bustSpin = i; }
      if (i % sampleRate === 0 || i === totalSpins - 1) R.balanceHistory.push({ spin: i, balance: bal });
    }
    processed = end;
    if (progressFill) {
      progressFill.style.width = Math.round((processed / totalSpins) * 100) + '%';
      progressText.textContent = `${processed.toLocaleString()} / ${totalSpins.toLocaleString()} spins`;
      elapsedEl.textContent = `${((performance.now() - startTime) / 1000).toFixed(1)}s`;
    }
    await new Promise(r => setTimeout(r, 0));
  }

  R.finalBalance = bal;
  R.elapsedMs = performance.now() - startTime;
  return R;
}

/* ══════════════════════════════════════════
   CANVAS CHART UTILITIES
══════════════════════════════════════════ */
function prepCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

const CHART_FONT = "'Nunito', sans-serif";

function drawBarChart(canvas, labels, values, colors) {
  const { ctx, w, h } = prepCanvas(canvas);
  const pad = { top: 12, right: 16, bottom: 44, left: 52 };
  const cW = w - pad.left - pad.right, cH = h - pad.top - pad.bottom;
  const maxV = Math.max(...values, 1);
  const gap = cW / labels.length;
  const barW = Math.min(36, gap * 0.6);
  ctx.strokeStyle = 'rgba(0,191,255,.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + cH - (cH * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#3A6A80'; ctx.font = `600 9px ${CHART_FONT}`; ctx.textAlign = 'right';
    ctx.fillText(maxV > 999 ? (maxV * i / 4 / 1000).toFixed(1) + 'k' : (maxV * i / 4).toFixed(0), pad.left - 6, y + 3);
  }
  labels.forEach((label, i) => {
    const x = pad.left + gap * i + (gap - barW) / 2;
    const bH = (values[i] / maxV) * cH;
    const y = pad.top + cH - bH;
    const grad = ctx.createLinearGradient(x, y, x, pad.top + cH);
    const c = colors[i % colors.length];
    grad.addColorStop(0, c); grad.addColorStop(1, c + '30');
    ctx.fillStyle = grad;
    const r = Math.min(3, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + barW - r, y);
    ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, pad.top + cH); ctx.lineTo(x, pad.top + cH);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.fill();
    if (values[i] > 0) {
      ctx.fillStyle = c; ctx.font = `700 8px ${CHART_FONT}`; ctx.textAlign = 'center';
      ctx.fillText(values[i] > 999 ? (values[i] / 1000).toFixed(1) + 'k' : values[i], x + barW / 2, y - 4);
    }
    ctx.fillStyle = '#3A6A80'; ctx.font = `700 7.5px ${CHART_FONT}`; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(x + barW / 2, h - pad.bottom + 14); ctx.rotate(-0.4);
    ctx.fillText(label, 0, 0); ctx.restore();
  });
}

function drawHBarChart(canvas, labels, values, colors, fmtVal) {
  const { ctx, w, h } = prepCanvas(canvas);
  const pad = { top: 6, right: 70, bottom: 6, left: 90 };
  const cW = w - pad.left - pad.right, cH = h - pad.top - pad.bottom;
  const maxV = Math.max(...values, 0.01);
  const barH = Math.min(20, (cH / labels.length) * 0.7);
  const gap = cH / labels.length;
  labels.forEach((label, i) => {
    const y = pad.top + gap * i + (gap - barH) / 2;
    const bW = (values[i] / maxV) * cW;
    const grad = ctx.createLinearGradient(pad.left, 0, pad.left + bW, 0);
    const c = colors[i % colors.length];
    grad.addColorStop(0, c); grad.addColorStop(1, c + '50');
    ctx.fillStyle = grad;
    const r = Math.min(3, barH / 2);
    ctx.beginPath();
    ctx.moveTo(pad.left, y + r); ctx.arcTo(pad.left, y, pad.left + r, y, r);
    ctx.lineTo(pad.left + bW - r, y); ctx.arcTo(pad.left + bW, y, pad.left + bW, y + r, r);
    ctx.lineTo(pad.left + bW, y + barH - r); ctx.arcTo(pad.left + bW, y + barH, pad.left + bW - r, y + barH, r);
    ctx.lineTo(pad.left, y + barH); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4A8899'; ctx.font = `700 9px ${CHART_FONT}`; ctx.textAlign = 'right';
    ctx.fillText(label.length > 12 ? label.slice(0, 12) + '…' : label, pad.left - 6, y + barH / 2 + 3);
    ctx.fillStyle = '#80C0D0'; ctx.font = `700 9px ${CHART_FONT}`; ctx.textAlign = 'left';
    ctx.fillText(fmtVal ? fmtVal(values[i]) : values[i].toLocaleString(), pad.left + bW + 6, y + barH / 2 + 3);
  });
}

function drawLineChart(canvas, points, startBankroll) {
  const { ctx, w, h } = prepCanvas(canvas);
  const pad = { top: 12, right: 16, bottom: 30, left: 58 };
  const cW = w - pad.left - pad.right, cH = h - pad.top - pad.bottom;
  if (points.length < 2) return;
  const minB = Math.min(...points.map(p => p.balance));
  const maxB = Math.max(...points.map(p => p.balance));
  const range = maxB - minB || 1;
  const maxS = points[points.length - 1].spin;
  const toX = s => pad.left + (s / maxS) * cW;
  const toY = b => pad.top + cH - ((b - minB) / range) * cH;
  ctx.strokeStyle = 'rgba(0,191,255,.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + cH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#3A6A80'; ctx.font = `600 9px ${CHART_FONT}`; ctx.textAlign = 'right';
    ctx.fillText('$' + (minB + range * i / 4).toFixed(0), pad.left - 6, y + 3);
  }
  const sY = toY(startBankroll);
  if (sY >= pad.top && sY <= pad.top + cH) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,170,0,.25)';
    ctx.beginPath(); ctx.moveTo(pad.left, sY); ctx.lineTo(w - pad.right, sY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,170,0,.4)'; ctx.font = `600 8px ${CHART_FONT}`; ctx.textAlign = 'left';
    ctx.fillText('START $' + startBankroll, pad.left + 4, sY - 4);
  }
  const finalBal = points[points.length - 1].balance;
  const lineColor = finalBal >= startBankroll ? '#2EE85A' : '#FF6060';
  ctx.beginPath();
  points.forEach((p, i) => { const x = toX(p.spin), y = toY(p.balance); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.lineTo(toX(maxS), pad.top + cH); ctx.lineTo(toX(0), pad.top + cH); ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, lineColor === '#2EE85A' ? 'rgba(46,232,90,.12)' : 'rgba(255,96,96,.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grad; ctx.fill();
  const fx = toX(maxS), fy = toY(finalBal);
  ctx.fillStyle = lineColor; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lineColor; ctx.font = `800 10px ${CHART_FONT}`; ctx.textAlign = 'right';
  ctx.fillText('$' + finalBal.toFixed(0), fx - 8, fy - 6);
  ctx.fillStyle = '#3A6A80'; ctx.font = `600 9px ${CHART_FONT}`; ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) { const s = Math.round(maxS * i / 4); ctx.fillText(s.toLocaleString(), toX(s), h - pad.bottom + 16); }
}

function drawDonutChart(canvas, labels, values, colors) {
  const { ctx, w, h } = prepCanvas(canvas);
  const cx = w * 0.38, cy = h / 2;
  const outerR = Math.min(cx - 8, cy - 8);
  const innerR = outerR * 0.58;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  labels.forEach((label, i) => {
    const slice = (values[i] / total) * Math.PI * 2;
    if (slice < 0.005) { angle += slice; return; }
    ctx.beginPath(); ctx.arc(cx, cy, outerR, angle, angle + slice);
    ctx.arc(cx, cy, innerR, angle + slice, angle, true); ctx.closePath();
    ctx.fillStyle = colors[i % colors.length]; ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,20,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR); ctx.stroke();
    const mid = angle + slice / 2;
    const pct = (values[i] / total * 100);
    if (pct > 2.5) {
      const lx = cx + Math.cos(mid) * (outerR + 14);
      const ly = cy + Math.sin(mid) * (outerR + 14);
      ctx.fillStyle = '#5A9AAA'; ctx.font = `700 8px ${CHART_FONT}`;
      ctx.textAlign = lx > cx ? 'left' : 'right';
      ctx.fillText(label, lx, ly + 2);
      ctx.fillStyle = '#80C0D0';
      ctx.fillText(pct.toFixed(1) + '%', lx, ly + 13);
    }
    angle += slice;
  });
  ctx.fillStyle = '#40D8FF'; ctx.font = `800 13px 'Rye', serif`; ctx.textAlign = 'center';
  ctx.fillText(total.toLocaleString(), cx, cy + 4);
  ctx.fillStyle = '#3A6A80'; ctx.font = `700 7px ${CHART_FONT}`;
  ctx.fillText('TOTAL SPINS', cx, cy + 16);
}

/* ══════════════════════════════════════════
   STATS HELPERS
══════════════════════════════════════════ */
function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sortedArr[lo] : sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}
function confidenceInterval95(multipliers, n) {
  const mean = multipliers.reduce((a, b) => a + b, 0) / n;
  const variance = multipliers.reduce((s, m) => s + (m - mean) ** 2, 0) / n;
  const margin = 1.96 * Math.sqrt(variance / n);
  return { mean, lower: (mean - margin) * 100, upper: (mean + margin) * 100, margin: margin * 100 };
}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
function renderDashboard(R, totalSpins, bet) {
  dashboard.classList.remove('hidden');
  const rtp = (R.totalWon / R.totalWagered) * 100;
  const hitRate = (R.wins / totalSpins) * 100;
  const bonusFreq = R.bonusTriggers > 0 ? totalSpins / R.bonusTriggers : Infinity;
  const avgWin = R.wins > 0 ? R.totalWon / R.wins : 0;
  const baseRtp = (R.baseWon / R.totalWagered) * 100;
  const bonusRtp = (R.bonusWon / R.totalWagered) * 100;

  const meanM = R.allMultipliers.reduce((a, b) => a + b, 0) / R.allMultipliers.length;
  const variance = R.allMultipliers.reduce((s, m) => s + (m - meanM) ** 2, 0) / R.allMultipliers.length;
  const stdDev = Math.sqrt(variance);
  let volLabel, volClass;
  if (stdDev < 2)       { volLabel = 'LOW';       volClass = 'is-good'; }
  else if (stdDev < 5)  { volLabel = 'MEDIUM';    volClass = 'is-warn'; }
  else if (stdDev < 15) { volLabel = 'HIGH';      volClass = 'is-warn'; }
  else                  { volLabel = 'VERY HIGH'; volClass = 'is-bad'; }

  const ci = confidenceInterval95(R.allMultipliers, totalSpins);
  const sorted = [...R.allMultipliers].sort((a, b) => a - b);
  const medianMult = percentile(sorted, 50);

  const set = (id, text, cls) => { const el = document.getElementById(id); if (el) { el.textContent = text; if (cls !== undefined) el.className = cls; } };
  const sub = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  set('kpi-rtp', rtp.toFixed(2) + '%', 'sim-kpi-value ' + (rtp >= 94 ? 'is-good' : rtp >= 88 ? 'is-warn' : 'is-bad'));
  sub('kpi-rtp-sub', `$${R.totalWon.toFixed(0)} won / $${R.totalWagered.toFixed(0)} wagered`);
  const ciEl = document.getElementById('kpi-rtp-ci');
  if (ciEl) ciEl.textContent = `95% CI: ${ci.lower.toFixed(2)}% – ${ci.upper.toFixed(2)}% (±${ci.margin.toFixed(2)}%)`;
  set('kpi-hitrate', hitRate.toFixed(1) + '%', 'sim-kpi-value');
  sub('kpi-hitrate-sub', `${R.wins.toLocaleString()} wins / ${totalSpins.toLocaleString()} spins`);
  set('kpi-bonus', bonusFreq === Infinity ? 'N/A' : `1 : ${Math.round(bonusFreq)}`, 'sim-kpi-value');
  sub('kpi-bonus-sub', `${R.bonusTriggers} triggers (${R.bonusTotalFS} free spins)`);
  set('kpi-volatility', volLabel, 'sim-kpi-value ' + volClass);
  sub('kpi-volatility-sub', `σ = ${stdDev.toFixed(2)} · Variance = ${variance.toFixed(2)}`);
  set('kpi-maxwin', R.maxMult.toFixed(1) + '×', 'sim-kpi-value-sm is-warn');
  sub('kpi-maxwin-sub', `$${R.maxWin.toFixed(2)}`);
  set('kpi-avgwin', (avgWin / bet).toFixed(2) + '×', 'sim-kpi-value-sm');
  sub('kpi-avgwin-sub', `$${avgWin.toFixed(2)} per hit`);
  set('kpi-medwin', medianMult.toFixed(2) + '×', 'sim-kpi-value-sm');
  sub('kpi-medwin-sub', medianMult === 0 ? 'Most spins lose' : `$${(medianMult * bet).toFixed(2)}`);
  set('kpi-base-rtp', baseRtp.toFixed(1) + '%', 'sim-kpi-value-sm');
  sub('kpi-base-rtp-sub', `$${R.baseWon.toFixed(0)} base wins`);
  set('kpi-bonus-rtp', bonusRtp.toFixed(1) + '%', 'sim-kpi-value-sm' + (bonusRtp > 5 ? ' is-warn' : ''));
  sub('kpi-bonus-rtp-sub', `$${R.bonusWon.toFixed(0)} bonus wins`);
  set('kpi-maxloss', R.maxLossStreak + ' spins', 'sim-kpi-value-sm');
  sub('kpi-maxloss-sub', `$${(R.maxLossStreak * bet).toFixed(2)} drawdown`);
  set('kpi-maxwinstreak', R.maxWinStreak + ' spins', 'sim-kpi-value-sm is-good');
  sub('kpi-maxwinstreak-sub', 'Consecutive wins');
  const survived = R.bankrollSurvived;
  set('kpi-survived', survived ? 'YES ✓' : 'NO ✗', 'sim-kpi-value-sm ' + (survived ? 'is-good' : 'is-bad'));
  sub('kpi-survived-sub', survived ? `Final: $${R.finalBalance.toFixed(0)}` : `Bust at spin #${R.bustSpin.toLocaleString()}`);

  const insights = [];
  insights.push({ icon: '📊', text: `Over <strong>${totalSpins.toLocaleString()} spins</strong>, this game returned <strong>${rtp.toFixed(2)}%</strong> of total wagers. ${rtp >= 96 ? 'This is a generous RTP.' : rtp >= 92 ? 'This is a typical RTP for this volatility.' : 'This is below average RTP, likely due to variance.'}` });
  if (R.bonusTriggers > 0) insights.push({ icon: '🎰', text: `The bonus triggered <strong>${R.bonusTriggers} times</strong> (1 in ${Math.round(bonusFreq)} spins), contributing <strong>${bonusRtp.toFixed(1)}%</strong> to total RTP — that's <strong>${(bonusRtp / rtp * 100).toFixed(0)}%</strong> of all returns.` });
  insights.push({ icon: '📉', text: `Worst dry spell: <strong>${R.maxLossStreak} consecutive losses</strong> ($${(R.maxLossStreak * bet).toFixed(2)} lost). A player would need at least ${Math.ceil(R.maxLossStreak * 1.5)} bets in reserve to survive this.` });
  if (!survived) insights.push({ icon: '💀', text: `Starting with <strong>$${R.startBankroll}</strong>, the bankroll was depleted at spin <strong>#${R.bustSpin.toLocaleString()}</strong>. This represents ${(R.bustSpin / totalSpins * 100).toFixed(0)}% of the simulation.` });
  else { const pnl = R.finalBalance - R.startBankroll; insights.push({ icon: pnl >= 0 ? '💰' : '📉', text: `Starting with $${R.startBankroll}, the final balance was <strong>$${R.finalBalance.toFixed(2)}</strong> (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}). Peak: $${R.peakBalance.toFixed(0)}, Trough: $${R.troughBalance.toFixed(0)}.` }); }
  insights.push({ icon: '⏱️', text: `Simulation completed in <strong>${(R.elapsedMs / 1000).toFixed(2)}s</strong> (${Math.round(totalSpins / (R.elapsedMs / 1000)).toLocaleString()} spins/sec).` });
  insightsEl.innerHTML = insights.map(i => `<div class="insight-item"><span class="insight-icon">${i.icon}</span><span>${i.text}</span></div>`).join('');

  const balMeta = document.getElementById('chart-balance-meta');
  if (balMeta) balMeta.textContent = `Start: $${R.startBankroll} · Final: $${R.finalBalance.toFixed(0)} · Peak: $${R.peakBalance.toFixed(0)}`;
  drawLineChart(document.getElementById('chart-balance'), R.balanceHistory, R.startBankroll);

  const buckets = [0, 0.5, 1, 2, 3, 5, 8, 15, 25, 50, 100, 500];
  const bLabels = ['0×', '<0.5×', '<1×', '<2×', '<3×', '<5×', '<8×', '<15×', '<25×', '<50×', '<100×', '100×+'];
  const bCounts = new Array(buckets.length).fill(0);
  R.allMultipliers.forEach(m => {
    if (m === 0) { bCounts[0]++; return; }
    let placed = false;
    for (let b = 1; b < buckets.length; b++) { if (m < buckets[b]) { bCounts[b]++; placed = true; break; } }
    if (!placed) bCounts[buckets.length - 1]++;
  });
  const distMeta = document.getElementById('chart-dist-meta');
  if (distMeta) distMeta.textContent = `Dead spins: ${((bCounts[0] / totalSpins) * 100).toFixed(1)}% · Any win: ${hitRate.toFixed(1)}%`;
  const dColors = ['#1A2A35', '#1878A0', '#20A0CC', '#40D8FF', '#2EE85A', '#60EE80', '#FFD040', '#FF8800', '#FF5050', '#FF3080', '#CC30CC', '#8844FF'];
  drawBarChart(document.getElementById('chart-win-dist'), bLabels, bCounts, dColors);

  const symEntries = Object.entries(R.symbolWins).filter(([, v]) => v.count > 0).sort((a, b) => b[1].totalPaid - a[1].totalPaid);
  const symLabels = symEntries.map(([id]) => (SYMBOLS[id] && SYMBOLS[id].label) || id);
  const symPcts = symEntries.map(([, v]) => v.totalPaid / R.totalWagered * 100);
  // all 6-digit hex — drawHBarChart appends an alpha suffix that needs 6-digit input
  const sColors = ['#FFD040', '#40D8FF', '#2EE85A', '#FF8800', '#CC30CC', '#FF5050', '#22AACC', '#8844FF', '#60EE80', '#FF3080', '#AAAACC', '#DDAA44', '#44BBAA', '#BB6688'];
  drawHBarChart(document.getElementById('chart-sym-freq'), symLabels, symPcts, sColors, v => v.toFixed(2) + '%');

  const tLabels = ['Dead (0×)', 'Tiny (<1×)', 'Small (1-3×)', 'Med (3-8×)', 'Big (8-20×)', 'Mega (20×+)'];
  const tValues = [R.winsByTier.dead, R.winsByTier.tiny, R.winsByTier.small, R.winsByTier.medium, R.winsByTier.big, R.winsByTier.mega];
  const tColors = ['#182838', '#1878A0', '#40D8FF', '#2EE85A', '#FFD040', '#FF5050'];
  drawDonutChart(document.getElementById('chart-win-type'), tLabels, tValues, tColors);

  // tables
  const sTable = document.getElementById('table-symbol-stats') && document.getElementById('table-symbol-stats').querySelector('tbody');
  if (sTable) {
    sTable.innerHTML = '';
    symEntries.forEach(([id, v]) => {
      const pctRtp = (v.totalPaid / R.totalWagered * 100).toFixed(2);
      const avg = v.count > 0 ? (v.totalPaid / v.count).toFixed(2) : '0.00';
      const maxSpan = SYMBOLS[id] && SYMBOLS[id].pays ? Object.keys(SYMBOLS[id].pays).length : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${(SYMBOLS[id] && SYMBOLS[id].label) || id}</td><td>${v.count.toLocaleString()}</td><td>$${v.totalPaid.toFixed(2)}</td><td>${pctRtp}%</td><td>$${avg}</td><td>${maxSpan} ways</td>`;
      sTable.appendChild(tr);
    });
  }
  const tTable = document.getElementById('table-win-tiers') && document.getElementById('table-win-tiers').querySelector('tbody');
  if (tTable) {
    tTable.innerHTML = '';
    const tierKeys = ['dead', 'tiny', 'small', 'medium', 'big', 'mega'];
    const tierNames = ['Dead Spin (0×)', 'Tiny (<1×)', 'Small (1-3×)', 'Medium (3-8×)', 'Big (8-20×)', 'Mega (20×+)'];
    tierKeys.forEach((key, i) => {
      const count = R.winsByTier[key], paid = R.winsByTierPaid[key] || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tierNames[i]}</td><td>${count.toLocaleString()}</td><td>${(count / totalSpins * 100).toFixed(1)}%</td><td>$${paid.toFixed(2)}</td><td>${(paid / R.totalWagered * 100).toFixed(2)}%</td><td>${count > 0 ? '$' + (paid / count).toFixed(2) : '—'}</td>`;
      tTable.appendChild(tr);
    });
  }
  const pTable = document.getElementById('table-percentiles') && document.getElementById('table-percentiles').querySelector('tbody');
  if (pTable) {
    pTable.innerHTML = '';
    [{ p: 10, interp: 'Worst 10% of spins' }, { p: 25, interp: 'Below average spin (Q1)' }, { p: 50, interp: 'Median spin outcome' },
     { p: 75, interp: 'Above average spin (Q3)' }, { p: 90, interp: 'Top 10% lucky spin' }, { p: 95, interp: 'Exceptionally good spin' },
     { p: 99, interp: 'Top 1% — rare event' }, { p: 99.9, interp: 'Jackpot territory' }].forEach(({ p, interp }) => {
      const m = percentile(sorted, p);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>P${p}</td><td>${m.toFixed(2)}×</td><td>$${(m * bet).toFixed(2)}</td><td>${interp}</td>`;
      pTable.appendChild(tr);
    });
  }
  const bTable = document.getElementById('table-bonus-stats') && document.getElementById('table-bonus-stats').querySelector('tbody');
  if (bTable) {
    bTable.innerHTML = '';
    const avgBonusWin = R.bonusTriggers > 0 ? R.bonusWon / R.bonusTriggers : 0;
    const avgFS = R.bonusTriggers > 0 ? R.bonusTotalFS / R.bonusTriggers : 0;
    [['Total Bonus Triggers', R.bonusTriggers.toLocaleString()],
     ['Trigger Rate', bonusFreq === Infinity ? 'N/A' : `1 in ${Math.round(bonusFreq)} spins (${(1 / bonusFreq * 100).toFixed(3)}%)`],
     ['Total Bonus Win', `$${R.bonusWon.toFixed(2)}`],
     ['Avg Bonus Win', `$${avgBonusWin.toFixed(2)} (${(avgBonusWin / bet).toFixed(1)}× bet)`],
     ['Total Free Spins Played', R.bonusTotalFS.toLocaleString()],
     ['Avg Free Spins per Trigger', avgFS.toFixed(1)],
     ['Bonus Contribution to RTP', `${bonusRtp.toFixed(2)}% (${(bonusRtp / rtp * 100).toFixed(0)}% of total)`],
     ['Base Game RTP (without bonus)', `${baseRtp.toFixed(2)}%`]].forEach(([metric, value]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${metric}</td><td>${value}</td>`;
      bTable.appendChild(tr);
    });
  }
}

/* ══════════════════════════════════════════
   WIRING
══════════════════════════════════════════ */
if (btnSim) {
  btnSim.addEventListener('click', () => simModal.classList.remove('hidden'));
  btnCloseSim.addEventListener('click', () => simModal.classList.add('hidden'));
  simModal.addEventListener('click', e => { if (e.target === simModal) simModal.classList.add('hidden'); });
  btnRunSim.addEventListener('click', async () => {
    const totalSpins = parseInt(simSpinsEl.value);
    const bet = parseFloat(simBetEl.value);
    const bankroll = parseFloat(simBankrollEl.value);
    btnRunSim.disabled = true;
    runLabel.textContent = 'RUNNING…';
    btnRunSim.classList.add('is-running');
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = `0 / ${totalSpins.toLocaleString()} spins`;
    elapsedEl.textContent = '';
    dashboard.classList.add('hidden');
    try {
      const R = await runSimulation(totalSpins, bet, bankroll);
      renderDashboard(R, totalSpins, bet);
    } catch (err) {
      console.error('Simulation error:', err);
      insightsEl.innerHTML = `<div class="insight-item"><span class="insight-icon">❌</span><span>Simulation failed: ${err.message}</span></div>`;
      dashboard.classList.remove('hidden');
    }
    btnRunSim.disabled = false;
    runLabel.textContent = 'RUN SIMULATION';
    btnRunSim.classList.remove('is-running');
    progressWrap.classList.add('hidden');
  });
}
