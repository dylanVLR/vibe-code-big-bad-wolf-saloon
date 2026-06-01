/**
 * @module help
 * @description Player-facing HELP / RULES / PAYTABLE screen — written so the
 * content is fully TRACEABLE to the game's configuration (par-sheet.js). It is a
 * paged, scrollable modal opened from the options drawer (📖 HELP).
 *
 * Source of truth, by page:
 *   • Paytable awards .......... SYMBOLS[id].pays            (par-sheet.js)
 *   • Bet levels / min / max ... BET_LEVELS                  (par-sheet.js)
 *   • Ways / reels / rows ...... REEL_COUNT, ROWS_PER_REEL, 243-ways (mathcore.js evaluateGrid)
 *   • Win rule (L→R, +3, adds) . evaluateGrid()              (mathcore.js)
 *   • Wild behaviour ........... expandWilds() + REEL_COUNTS (centre reel only)
 *   • Bonus trigger / spins .... BONUS_CONFIG                (par-sheet.js)
 *   • House / jackpot awards ... BONUS_CONFIG.tiers / mansion (active-model scaled)
 *   • Buy-bonus price .......... BONUS_CONFIG.buyCostMult
 *   • Theoretical RTP .......... ACTIVE_MODEL.rtp / .label
 * Numbers are read at runtime, so they always match the active math model and can
 * never drift from the game. NO RTP/odds are invented; nothing claims certification.
 *
 * KNOWN ART TODOs (flagged for the team, do NOT affect this screen's accuracy):
 *   1. The Wolf Wild is placed only on the CENTRE reel in REEL_COUNTS, although
 *      some comments/README say "reels 2-4". This screen states the truth (centre).
 *   2. 'pig-suit' and 'pig-contractor' use the SAME horseshoe art but pay
 *      differently — they must be given distinct art before certification.
 */
'use strict';

import {
  SYMBOLS, BET_LEVELS, BONUS_CONFIG, ACTIVE_MODEL,
  REEL_COUNT, ROWS_PER_REEL, BONUS_TRIGGER_HATS, FREE_SPINS_INITIAL,
  RETRIGGER_HATS, MIN_WIN_SPAN,
} from '../math/par-sheet.js';
import { fmt } from '../core/utils.js';
import { narrator } from '../audio/narrator.js';

/* ── formatting + art helpers ── */
const x2 = n => `${(Math.round(n * 100) / 100).toFixed(2)}×`;          // 35.70×
const x1 = n => `${(Math.round(n * 10) / 10).toFixed(1)}×`;            // 24.4×
const pct = n => `${(n * 100).toFixed(2)}%`;

// Names that match the ART the player actually sees on the reels (not internal ids).
const SYM_NAME = {
  'hat-yellow': 'Yellow Hard Hat', 'hat-green': 'White Hard Hat', 'hat-red': 'Red Hard Hat',
  'pig-suit': 'Horseshoe', 'pig-contractor': 'Horseshoe', 'pig-nature': 'Tornado', 'toolbox': 'Shot Glass',
  'wolf': 'Wolf', 'buzzard': 'Buzzard', 'wild': 'Wolf Wild',
  'royal-a': 'Ace', 'royal-k': 'King', 'royal-q': 'Queen', 'royal-j': 'Jack', 'royal-10': 'Ten',
};
function symArt(id, cls) {
  const s = SYMBOLS[id]; const name = SYM_NAME[id] || s.label;
  if (s.src) return `<img class="${cls}" src="${s.src}" alt="${name}">`;
  if (s.svgId) return `<svg class="${cls}" viewBox="0 0 200 200" role="img" aria-label="${name}"><use href="${s.svgId}"/></svg>`;
  return '';
}

// Paytable order: premiums (high→low), then royals.
const PAY_ORDER = ['hat-yellow', 'pig-suit', 'pig-contractor', 'hat-green', 'hat-red',
  'pig-nature', 'toolbox', 'wolf', 'buzzard', 'royal-a', 'royal-k', 'royal-q', 'royal-j', 'royal-10'];

function paytableRows() {
  return PAY_ORDER.filter(id => SYMBOLS[id] && SYMBOLS[id].pays).map(id => {
    const p = SYMBOLS[id].pays;
    const hat = SYMBOLS[id].isHat ? ' <span class="help-tag">bonus symbol</span>' : '';
    return `<tr>
      <td class="help-ptsym">${symArt(id, 'help-sym')}</td>
      <td class="help-ptname">${SYM_NAME[id]}${hat}</td>
      <td>${p[5] != null ? x2(p[5]) : '—'}</td>
      <td>${p[4] != null ? x2(p[4]) : '—'}</td>
      <td>${p[3] != null ? x2(p[3]) : '—'}</td>
    </tr>`;
  }).join('');
}

/* ── build the pages (read once; config is static at load) ── */
function buildPages() {
  const t1 = BONUS_CONFIG.tiers[1], t2 = BONUS_CONFIG.tiers[2], t3 = BONUS_CONFIG.tiers[3], m = BONUS_CONFIG.mansion;
  const minBet = fmt(BET_LEVELS[0]), maxBet = fmt(BET_LEVELS[BET_LEVELS.length - 1]);
  const buyMult = BONUS_CONFIG.buyCostMult;

  return [
    { nav: 'How to Play', title: 'How to Play', html: `
      <p>Big Bad Wolf Saloon is a <b>${REEL_COUNT}-reel, ${ROWS_PER_REEL}-row</b> video slot with <b>243 ways to win</b> and a Hard-Hat Free Spins bonus.</p>
      <h4>Objective</h4>
      <p>Land matching symbols on adjacent reels to form winning combinations. Collect <b>${BONUS_TRIGGER_HATS} or more Hard Hats</b> to enter the bonus, where the Big Bad Wolf blows down houses for prizes.</p>
      <h4>To play</h4>
      <ul>
        <li>Use the <b>&minus;</b> and <b>+</b> buttons to set your total bet.</li>
        <li>Press <b>SPIN</b> to play one spin at your selected bet.</li>
        <li>Use <b>AUTO SPIN</b> to spin repeatedly, and <b>TURBO</b> to speed up the reels.</li>
      </ul>
      <p class="help-note">This screen does not affect the game. While it is open, no spin, bet, win or feature can occur.</p>` },

    { nav: 'Bet & Credits', title: 'Betting &amp; Credits', html: `
      <p>Each spin costs your selected <b>total bet</b>. There are no separate line bets — your total bet covers all 243 ways.</p>
      <h4>Available bets</h4>
      <p class="help-bets">${BET_LEVELS.map(b => `<span>${fmt(b)}</span>`).join('')}</p>
      <p>Minimum bet <b>${minBet}</b> &nbsp;·&nbsp; Maximum bet <b>${maxBet}</b>. The bet changes one step at a time between these levels.</p>
      <h4>On-screen meters</h4>
      <ul>
        <li><b>CASH</b> — your available balance.</li>
        <li><b>BET</b> — your current total bet for the next spin.</li>
        <li><b>WIN</b> — the amount won on the most recent spin.</li>
      </ul>
      <p>All wins are added to your balance. All awards in this help are shown as multiples of your <b>total bet</b>.</p>` },

    { nav: 'How Wins Pay', title: 'How Wins Are Paid', html: `
      <ul>
        <li><b>243 ways:</b> wins are paid for matching symbols on <b>adjacent reels, left to right, starting from reel 1</b> — symbols may be in any row.</li>
        <li>A minimum of <b>${MIN_WIN_SPAN} matching symbols</b> is required (3, 4, or 5 of a kind).</li>
        <li>The number of <b>ways</b> a symbol wins is the product of how many times it appears on each winning reel.</li>
        <li><b>Win = (ways) &times; (the symbol's paytable value for that many reels) &times; (your total bet).</b></li>
        <li>Different symbols can win on the same spin; <b>all wins are added together</b>.</li>
        <li>Each symbol pays only its <b>longest</b> left-to-right combination.</li>
        <li>The <b>Wolf Wild</b> substitutes for all symbols except the Hard Hats (see the Wolf Wild page).</li>
      </ul>
      <p class="help-note">Symbols land independently on every spin; previous results do not influence future ones.</p>` },

    { nav: 'Paytable', title: 'Paytable', html: `
      <p>Values are the award for <b>5, 4, or 3</b> matching symbols on adjacent reels, <b>per way</b>, multiplied by your total bet. They reflect the current game configuration (<b>${ACTIVE_MODEL.label}</b>).</p>
      <table class="help-paytable">
        <thead><tr><th colspan="2">Symbol</th><th>5&times;</th><th>4&times;</th><th>3&times;</th></tr></thead>
        <tbody>${paytableRows()}</tbody>
      </table>
      <p class="help-note">Heads up: the two horseshoe symbols above are separate paytable symbols with different awards. (Art TODO: give them distinct artwork before certification.)</p>` },

    { nav: 'Wolf Wild', title: 'The Wolf Wild', html: `
      <div class="help-feature">${symArt('wild', 'help-sym-lg')}
        <div>
          <p>The <b>Wolf Wild</b> appears on the <b>centre reel only</b>.</p>
          <ul>
            <li>When a Wolf Wild lands, the <b>entire centre reel becomes Wild</b>.</li>
            <li>It <b>substitutes for all symbols except the Hard Hats</b>.</li>
            <li>The Wolf Wild has <b>no award of its own</b> — it only helps other symbols form wins.</li>
          </ul>
        </div>
      </div>` },

    { nav: 'Hard Hats', title: 'Hard Hats &amp; Bonus Trigger', html: `
      <div class="help-hats">${symArt('hat-yellow', 'help-sym')}${symArt('hat-green', 'help-sym')}${symArt('hat-red', 'help-sym')}</div>
      <ul>
        <li>The <b>Hard Hats</b> (Yellow, White, Red) pay in combinations like other symbols <em>and</em> act as the <b>bonus symbol</b>.</li>
        <li>Land <b>${BONUS_TRIGGER_HATS} or more Hard Hats anywhere</b> on the reels to trigger the <b>Hard-Hat Free Spins</b> bonus.</li>
        <li>The Wolf Wild does <b>not</b> substitute for Hard Hats.</li>
      </ul>` },

    { nav: 'Bonus Feature', title: 'Hard-Hat Free Spins', html: `
      <p><b>Triggered by ${BONUS_TRIGGER_HATS}+ Hard Hats.</b> The feature awards <b>${FREE_SPINS_INITIAL} free spins</b>, played at the same bet as the triggering spin.</p>
      <h4>During the free spins</h4>
      <ul>
        <li>The triggering Hard Hats become <b>Straw houses</b> on their positions.</li>
        <li>Line wins still pay during free spins.</li>
        <li>Each Hard Hat that lands <b>upgrades the house</b> on its position: <b>Straw &rarr; Stick &rarr; Brick</b>.</li>
        <li>Land <b>${RETRIGGER_HATS} or more Hard Hats in a single free spin</b> to win <b>+1 free spin</b>.</li>
        <li><b>Mansion Feature:</b> when a new Brick house completes and <b>${m.minBricks}+ Brick houses</b> stand, you win <b>${x1(m.baseMult)} your bet, plus up to ${x1(m.perBrickMult)} per Brick house</b>. It can be awarded more than once.</li>
      </ul>
      <h4>End of the bonus — the wolf blows the houses down</h4>
      <table class="help-paytable help-bonustable">
        <thead><tr><th>House</th><th>Award (&times; your bet)</th></tr></thead>
        <tbody>
          <tr><td>🏚️ Straw</td><td>${x2(t1.min)} to ${x2(t1.max)}</td></tr>
          <tr><td>🏠 Stick</td><td>${x2(t2.min)} to ${x2(t2.max)}${t2.jackpotMult ? ` &nbsp;·&nbsp; rare <b>MINI JACKPOT ${x2(t2.jackpotMult)}</b>` : ''}</td></tr>
          <tr><td>🏰 Brick</td><td>${x2(t3.min)} to ${x2(t3.max)}${t3.jackpotMult ? ` &nbsp;·&nbsp; rare <b>MINOR JACKPOT ${x2(t3.jackpotMult)}</b>` : ''}</td></tr>
        </tbody>
      </table>
      <p>When every house has been blown down, play returns to the base game.</p>` },

    { nav: 'Buy Bonus', title: 'Buy Bonus', html: `
      <p>Instead of waiting for ${BONUS_TRIGGER_HATS} Hard Hats, you may <b>buy the Hard-Hat Free Spins bonus</b> directly.</p>
      <ul>
        <li>Cost: <b>${buyMult}&times; your current total bet</b> (for example, at a ${fmt(1)} bet the cost is ${fmt(buyMult)}).</li>
        <li>A confirmation is shown before any purchase.</li>
        <li>The bought bonus plays <b>exactly like a triggered bonus</b>, with the same rules and awards.</li>
      </ul>` },

    { nav: 'Auto &amp; Turbo', title: 'Auto Spin &amp; Turbo', html: `
      <ul>
        <li><b>AUTO SPIN</b> spins repeatedly at your selected bet until you stop it or your balance is insufficient.</li>
        <li><b>TURBO</b> speeds up the reel animation only — it does not change the game outcome.</li>
      </ul>` },

    { nav: 'Rules', title: 'Additional Rules', html: `
      <ul>
        <li><b>Theoretical Return to Player (RTP):</b> ${pct(ACTIVE_MODEL.rtp)} (configuration: ${ACTIVE_MODEL.label}).</li>
        <li>Game outcomes are determined by a <b>random number generator</b>.</li>
        <li>All wins are multiplied by your <b>total bet</b>.</li>
        <li>Each symbol pays only its highest (longest) combination; wins from different symbols are added.</li>
        <li><b>Malfunction voids all pays and plays.</b></li>
        <li>Please play responsibly.</li>
      </ul>
      <p class="help-note">This help reflects the current game configuration: <b>${ACTIVE_MODEL.label} — RTP ${pct(ACTIVE_MODEL.rtp)}</b>.</p>` },
  ];
}

/* ── modal wiring ── */
const modal = document.getElementById('help-modal');
const btnInfo = document.getElementById('btn-info');
const btnClose = document.getElementById('btn-close-help');
const contentEl = document.getElementById('help-content');
const tocEl = document.getElementById('help-toc');
const indEl = document.getElementById('help-pageind');
const prevBtn = document.getElementById('help-prev');
const nextBtn = document.getElementById('help-next');
const titleEl = document.getElementById('help-title');

if (modal && contentEl) {
  let PAGES = null;
  let page = 0;

  function render() {
    const p = PAGES[page];
    titleEl.innerHTML = '📖 ' + p.title;
    contentEl.innerHTML = p.html;
    contentEl.scrollTop = 0;
    indEl.textContent = `${page + 1} / ${PAGES.length}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page === PAGES.length - 1;
    [...tocEl.children].forEach((chip, i) => chip.classList.toggle('active', i === page));
  }

  function buildToc() {
    tocEl.innerHTML = '';
    PAGES.forEach((p, i) => {
      const chip = document.createElement('button');
      chip.className = 'help-chip';
      chip.type = 'button';
      chip.innerHTML = p.nav;
      chip.addEventListener('click', () => { page = i; render(); });
      tocEl.appendChild(chip);
    });
  }

  function open() {
    if (!PAGES) { PAGES = buildPages(); buildToc(); }
    page = 0;
    render();
    modal.classList.remove('hidden');
  }
  function close() { modal.classList.add('hidden'); narrator.onMenuReturn(); }

  if (btnInfo) btnInfo.addEventListener('click', open);
  if (btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  prevBtn.addEventListener('click', () => { if (page > 0) { page--; render(); } });
  nextBtn.addEventListener('click', () => { if (page < PAGES.length - 1) { page++; render(); } });
  document.addEventListener('keydown', e => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && page > 0) { page--; render(); }
    else if (e.key === 'ArrowRight' && page < PAGES.length - 1) { page++; render(); }
  });
}
