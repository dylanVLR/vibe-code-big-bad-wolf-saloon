/**
 * Headless Monte Carlo verifier for the Big Bad Wolf par sheet.
 *
 *   node tools/sim.js [spins]      # default 5,000,000
 *
 * Imports the par sheet from ../src/math/par-sheet.js and the math from ../src/math/mathcore.js
 * — the exact same code the browser game runs — so these numbers are the game's
 * real numbers. Reports RTP (base/bonus/total), trigger rate, hit frequency,
 * volatility, per-symbol contribution, reel composition, and bonus-buy pricing.
 */
import { SYMBOLS, SYMBOL_IDS, HAT_IDS, REEL_STRIPS, BONUS_CONFIG, ACTIVE_MODEL } from '../src/math/par-sheet.js';
import { generateGrid, evaluateGrid, countHats, simulateBonusOutcome } from '../src/math/mathcore.js';

const totalSpins = parseInt(process.argv[2], 10) || 5_000_000;
const bet = 1.0;

let wagered = 0, won = 0, baseWon = 0, bonusWon = 0;
let wins = 0, bonusTriggers = 0, bonusFS = 0, mansions = 0;
let maxWin = 0, sumRet = 0, sumRet2 = 0;
const baseBySym = {}; SYMBOL_IDS.forEach(id => baseBySym[id] = 0);

const t0 = Date.now();
for (let i = 0; i < totalSpins; i++) {
  wagered += bet;
  const grid = generateGrid();
  let spinWin = 0;

  // Match the live game (base-game.js): a spin with 6+ hats triggers the bonus
  // and pays ONLY the bonus — its base line/way wins are forfeited (early return).
  if (countHats(grid).count >= BONUS_CONFIG.triggerHats) {
    bonusTriggers++;
    const b = simulateBonusOutcome(bet, grid);
    spinWin = b.bonusWin;
    bonusWon += b.bonusWin;
    bonusFS  += b.freeSpins;
    mansions += b.mansions;
  } else {
    const { totalWin, winners } = evaluateGrid(grid, bet);
    spinWin = totalWin;
    baseWon += totalWin;
    for (const w of winners) baseBySym[w.symId] += w.winAmount;
  }

  won += spinWin;
  if (spinWin > 0) wins++;
  if (spinWin > maxWin) maxWin = spinWin;
  const ret = spinWin / bet;
  sumRet += ret; sumRet2 += ret * ret;
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

/* ── report ── */
const rtp      = won / wagered;
const baseRtp  = baseWon / wagered;
const bonusRtp = bonusWon / wagered;
const meanRet  = sumRet / totalSpins;
const sigma    = Math.sqrt(sumRet2 / totalSpins - meanRet * meanRet);
const pct = x => (x * 100).toFixed(2) + '%';

console.log(`\n══════════ PAR-SHEET VERIFIER ══════════`);
console.log(`model: ${ACTIVE_MODEL.label} (${ACTIVE_MODEL.id}) — target ${(ACTIVE_MODEL.rtp*100).toFixed(0)}%, scale ${ACTIVE_MODEL.scale}`);
console.log(`spins: ${totalSpins.toLocaleString()}   (${secs}s)\n`);
console.log(`TOTAL RTP        ${pct(rtp)}`);
console.log(`  base game      ${pct(baseRtp)}`);
console.log(`  bonus          ${pct(bonusRtp)}`);
console.log(`hit frequency    ${pct(wins / totalSpins)}`);
console.log(`bonus trigger    1 in ${(totalSpins / bonusTriggers).toFixed(0)}  (${bonusTriggers.toLocaleString()} hits)`);
console.log(`avg free spins   ${(bonusFS / Math.max(1, bonusTriggers)).toFixed(1)} per bonus`);
console.log(`mansion jackpots ${mansions.toLocaleString()} (${(mansions / Math.max(1, bonusTriggers)).toFixed(3)} per bonus)`);
console.log(`volatility σ     ${sigma.toFixed(2)}  (per-spin return, ×bet)`);
console.log(`avg win          ${meanRet.toFixed(4)}× bet`);
console.log(`max win          ${maxWin.toFixed(0)}× bet`);

// ── BONUS BUY pricing ──  fair price = E[bonus | trigger] ÷ game RTP
const avgBonus = bonusWon / bonusTriggers;
console.log(`\n── BONUS BUY ──`);
console.log(`avg bonus value  ${avgBonus.toFixed(2)}× bet  (E[bonus | trigger])`);
console.log(`fair buy price   ${(avgBonus / rtp).toFixed(2)}× bet   → buy RTP = game RTP (${pct(rtp)})`);
for (const m of [70, 75, 80, 85, 90]) {
  console.log(`   buy @ ${String(m).padStart(3)}× bet → buy RTP ${pct(avgBonus / m)}`);
}

console.log(`\n── base-game RTP by symbol ──`);
for (const [id, paid] of SYMBOL_IDS.map(id => [id, baseBySym[id] / wagered]).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(16)} ${pct(paid).padStart(8)}`);
}

console.log(`\n── reel strip composition (counts per reel) ──`);
console.log('  ' + ['symbol','R1','R2','R3','R4','R5','tot'].map((h, i) => i === 0 ? h.padEnd(16) : h.padStart(4)).join(''));
for (const id of SYMBOL_IDS) {
  const counts = REEL_STRIPS.map(strip => strip.filter(s => s === id).length);
  console.log('  ' + id.padEnd(16) + counts.map(c => String(c).padStart(4)).join('') + String(counts.reduce((a, b) => a + b, 0)).padStart(4));
}
const lens = REEL_STRIPS.map(s => s.length);
console.log('  ' + 'STRIP LENGTH'.padEnd(16) + lens.map(l => String(l).padStart(4)).join('') + String(lens.reduce((a, b) => a + b, 0)).padStart(4));
const hats = REEL_STRIPS.map(s => s.filter(x => HAT_IDS.includes(x)).length);
console.log('  ' + 'HATS (all)'.padEnd(16) + hats.map(c => String(c).padStart(4)).join('') + String(hats.reduce((a, b) => a + b, 0)).padStart(4));
console.log('');
