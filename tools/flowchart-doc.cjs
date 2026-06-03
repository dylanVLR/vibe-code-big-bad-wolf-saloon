/*
 * Generate docs/Flow_Chart_Claude.pdf — a visual flow chart of how the game math
 * resolves a spin, end to end (base game → 243-ways pay → bonus trigger → free
 * spins / houses → Wanted Reward jackpot → RTP). Corporate brand template, printed
 * to PDF via the installed Google Chrome (puppeteer-core).
 *
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/flowchart-doc.cjs
 *
 * Numbers come from src/math/par-sheet.js (BONUS_CONFIG / WIN_TIERS) and the
 * verified ~10M-spin simulation in tools/sim.js.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const B = { green: '#173E27', greenSoft: '#1E5631', gold: '#A9842B', goldSoft: '#C9A24B',
  ink: '#1A1D1A', muted: '#5B6660', hair: '#E2E6E2', panel: '#F6F8F6' };

// ── flow-chart node helpers ──
const term = t => `<div class="node term">${t}</div>`;
const proc = (t, s) => `<div class="node proc"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`;
const jackpot = (t, s) => `<div class="node jackpot"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`;
const arrow = (label) => `<div class="arrow">${label ? `<span class="albl">${label}</span>` : ''}<span class="tip">&#9660;</span></div>`;
// A decision diamond; one branch peels to the right (labelled), the other path
// continues straight down the spine (label it on the following arrow()).
const decide = (q, side, box, cap) => `
  <div class="drow">
    <div></div>
    <div class="diamond"><span class="t">${q}</span></div>
    <div class="nobranch"><span class="harrow">${side} &#9654;</span><div class="node mini">${box}</div>
      ${cap ? `<div class="nocap">${cap}</div>` : ''}</div>
  </div>`;

function body() {
  const stats = [
    ['97.07%', 'RTP — Standard'],
    ['84.59%', 'RTP — Lean'],
    ['26.4%', 'Hit frequency'],
    ['1 in ~180', 'Bonus trigger'],
    ['~9&times;', 'Volatility &sigma;'],
    ['243', 'Ways to win'],
  ].map(([v, k]) => `<div class="chip"><div class="cv">${v}</div><div class="ck">${k}</div></div>`).join('');

  return `
  <h1>How a Spin Resolves</h1>
  <p class="lead">Every spin runs the same path. Line wins are paid on a fixed 243-ways evaluation; the hidden Hard-Hat
  count decides whether the spin also opens the bonus, where most of the return (and all the volatility) lives.</p>
  <div class="chips">${stats}</div>

  <div class="flow">
    ${term('PLAYER PRESSES SPIN &middot; bet deducted')}
    ${arrow()}
    ${proc('RNG draws the outcome', 'A symbol is picked for each of the 5 reels &times; 3 rows from weighted reel strips')}
    ${arrow()}
    ${proc('Expanding Wolf Wild check', 'A Wolf Wild on reels 2&ndash;4 fills that whole reel and substitutes for all pay symbols (not Hats)')}
    ${arrow()}
    ${proc('Evaluate 243 ways', 'Left-to-right matches from reel 1. Cell pay = ways &times; paytable[run length] &times; bet')}
    ${arrow()}
    ${decide('6 or more Hard&nbsp;Hats on screen?', 'NO', 'Base spin ends &mdash; line &amp; Wild wins are paid, balance updates', 'most spins')}
    ${arrow('YES')}

    <div class="zone">
      <div class="zlabel">BONUS &mdash; Hard-Hat Free Spins</div>
      ${proc('Award 6 free spins', 'Buy Bonus jumps straight here for a cost of 88&times; bet (same RTP as playing)')}
      ${arrow()}
      ${proc('Free spin: build the houses', 'Hats lock onto cells and upgrade in place: Straw &rarr; Stick &rarr; Brick')}
      ${arrow()}
      ${decide('3+ Hats this free spin?', 'YES', 'Retrigger: +1 free spin added')}
      ${arrow('then')}
      ${proc('The Wolf huffs &amp; puffs', 'Each standing house pays bet &times; a random amount by tier (4% chance of a jackpot multiplier):<br>&bull; Straw 0.46&ndash;2.44&times; &bull; Stick 2.44&ndash;9.74&times; (jackpot 29&times;) &bull; Brick 7.31&ndash;44.08&times; (jackpot 146&times;)')}
      ${arrow()}
      ${decide('3 or more Brick houses standing?', 'NO', 'No jackpot this round')}
      ${arrow('YES')}
      ${jackpot('&#11088; WANTED REWARD jackpot', 'bet &times; (24.4 + random up to 19.7 &times; brick count) &mdash; the headline ~123&times; prize; can fire more than once')}
      ${arrow()}
      ${decide('Free spins remaining?', 'YES', 'Back to the next free spin', 'loop')}
      ${arrow('NO')}
      ${proc('Bonus ends', 'The bonus total is added to the balance')}
    </div>

    ${arrow()}
    ${term('SPIN COMPLETE &middot; ready for the next spin')}
  </div>

  <h1>Where the Return Comes From</h1>
  <p>The two paths above combine into the published Return-to-Player. The base game is deliberately light; the bonus
  carries the bulk of the return and essentially all of the volatility &mdash; which is why a true read needs a
  ~10-million-spin simulation, not a short sample.</p>
  <table class="rtp"><thead><tr><th>Component</th><th>Roughly contributes</th><th>Notes</th></tr></thead><tbody>
    <tr><td><b>Base game</b> (243-ways lines + Wolf Wild)</td><td>~49% of bet</td><td>Frequent small wins &mdash; 26.4% hit rate</td></tr>
    <tr><td><b>Bonus feature</b> (free spins, houses, jackpot)</td><td>~48% of bet</td><td>Rare (1 in ~180) but large &mdash; avg ~85&times; bet when it hits</td></tr>
    <tr><td><b>Total (Standard model)</b></td><td><b>97.07%</b></td><td>Lean model scales every value down to <b>84.59%</b></td></tr>
  </tbody></table>
  <div class="note"><b>One source of truth.</b> All of these numbers live in <span class="mono">src/math/par-sheet.js</span>
  and are verified by the headless simulator <span class="mono">tools/sim.js</span> (and re-checked live in the in-game
  &#129518;&nbsp;MATH and &#128202;&nbsp;SIM panels). Change a value once and the game, the sims and these docs all follow.</div>
  `;
}

const CSS = `
  @page { size: Letter; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:${B.ink}; font-size:10.5pt; line-height:1.5; margin:0; background:#FFF; }
  h1 { font-family:'Source Serif 4',Georgia,serif; font-weight:600; font-size:17pt; color:${B.green}; margin:22px 0 6px; padding-bottom:6px; border-bottom:2px solid ${B.hair}; }
  h1:first-child { margin-top:0; }
  p { margin:0 0 9px; } .lead { color:${B.muted}; font-size:9.5pt; }
  .mono { font-family:'SFMono-Regular',Menlo,Consolas,monospace; font-size:8.6pt; }

  /* cover */
  .cover { height:9.0in; display:flex; flex-direction:column; page-break-after:always; }
  .cover .bar { height:14px; background:${B.green}; border-bottom:3px solid ${B.gold}; }
  .cover .brandline { margin-top:26px; font-size:9.5pt; letter-spacing:3px; font-weight:700; text-transform:uppercase; color:${B.gold}; }
  .cover .spacer { flex:1; }
  .cover h1.title { font-family:'Source Serif 4',Georgia,serif; font-size:33pt; line-height:1.12; color:${B.green}; margin:0 0 10px; border:none; padding:0; }
  .cover .subtitle { font-size:13pt; color:${B.muted}; font-family:'Source Serif 4',Georgia,serif; font-style:italic; margin-bottom:30px; }
  .cover .rule { width:78px; height:4px; background:${B.gold}; margin-bottom:26px; }
  .cover .meta { border:1px solid ${B.hair}; border-left:4px solid ${B.gold}; background:${B.panel}; border-radius:4px; padding:16px 20px; max-width:5.6in; }
  .cover .meta .row { display:flex; gap:14px; padding:3px 0; font-size:10pt; }
  .cover .meta .k { width:130px; color:${B.muted}; font-weight:600; } .cover .meta .v { flex:1; }
  .cover .foot { margin-top:26px; padding-top:12px; border-top:1px solid ${B.hair}; font-size:8.5pt; color:${B.muted}; }

  /* stat chips */
  .chips { display:flex; gap:8px; margin:6px 0 14px; }
  .chip { flex:1; border:1px solid ${B.hair}; border-top:3px solid ${B.gold}; border-radius:5px; background:${B.panel}; padding:8px 6px; text-align:center; }
  .chip .cv { font-family:'Source Serif 4',Georgia,serif; font-weight:600; font-size:13pt; color:${B.green}; }
  .chip .ck { font-size:7.2pt; letter-spacing:.3px; text-transform:uppercase; color:${B.muted}; margin-top:2px; }

  /* flow chart */
  .flow { width:100%; margin:4px 0 8px; }
  .node { width:3.3in; margin:0 auto; border:2px solid ${B.greenSoft}; border-radius:9px; background:#FFFFFF;
    padding:9px 14px; text-align:center; page-break-inside:avoid; box-shadow:0 1px 2px rgba(0,0,0,.05); }
  .node b { display:block; color:${B.green}; font-size:10pt; }
  .node span { display:block; color:${B.muted}; font-size:8.2pt; line-height:1.35; margin-top:3px; }
  .node.term { background:${B.green}; border-color:${B.green}; border-radius:22px; color:#fff; width:3.6in; }
  .node.term b, .node.term { color:#fff; }
  .node.term { font-weight:600; font-size:9.5pt; padding:10px 14px; }
  .node.jackpot { border-color:${B.gold}; background:#FBF4E2; box-shadow:0 0 0 3px rgba(169,132,43,.12); }
  .node.jackpot b { color:${B.gold}; }
  .node.mini { width:2.5in; margin:0; padding:7px 10px; border-color:${B.hair}; background:${B.panel}; }
  .node.mini, .node.mini span { font-size:8pt; color:${B.muted}; }

  .arrow { text-align:center; line-height:1; margin:0; padding:0; position:relative; height:26px; page-break-inside:avoid; }
  .arrow .tip { color:${B.greenSoft}; font-size:13px; }
  .arrow::before { content:''; position:absolute; left:50%; top:-2px; width:2px; height:18px; background:${B.greenSoft}; transform:translateX(-50%); }
  .arrow .albl { position:absolute; left:50%; top:3px; transform:translateX(8px); font-size:7.5pt; font-weight:700; color:${B.greenSoft}; letter-spacing:.5px; }

  /* decision diamond + NO branch */
  .drow { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:6px; page-break-inside:avoid; margin:2px 0; }
  .diamond { width:2.3in; height:1.25in; position:relative; display:flex; align-items:center; justify-content:center; margin:0 auto; }
  .diamond::before { content:''; position:absolute; left:50%; top:50%; width:1.15in; height:1.15in; transform:translate(-50%,-50%) rotate(45deg);
    border:2px solid ${B.gold}; background:#FFFDF5; border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,.05); }
  .diamond .t { position:relative; z-index:1; text-align:center; font-size:8.6pt; font-weight:700; color:${B.gold}; max-width:2.1in; line-height:1.2; }
  .nobranch { display:flex; flex-direction:column; align-items:flex-start; gap:3px; }
  .nobranch .harrow { font-size:7.5pt; font-weight:700; color:${B.muted}; letter-spacing:.5px; }
  .nobranch .nocap { font-size:7pt; color:${B.muted}; font-style:italic; }

  /* bonus zone */
  .zone { border:1.5px dashed ${B.goldSoft}; border-radius:12px; background:rgba(169,132,43,.05); padding:12px 8px 14px; margin:2px 0; }
  .zlabel { text-align:center; font-family:'Source Serif 4',Georgia,serif; font-weight:600; color:${B.gold}; font-size:11pt; margin-bottom:8px; letter-spacing:.3px; }

  /* RTP table */
  table.rtp { width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:9.4pt; }
  table.rtp th, table.rtp td { border:1px solid ${B.hair}; padding:7px 9px; text-align:left; vertical-align:top; }
  table.rtp thead th { background:${B.green}; color:#fff; font-size:8.4pt; letter-spacing:.4px; text-transform:uppercase; border-color:${B.greenSoft}; }
  table.rtp tbody tr:last-child { background:${B.panel}; }
  .note { border:1px solid ${B.hair}; border-left:4px solid ${B.gold}; background:${B.panel}; border-radius:4px; padding:10px 14px; font-size:9.3pt; margin-top:6px; }
  .note b { color:${B.green}; }
`;

function html() {
  const stamp = new Date().toISOString().slice(0, 10);
  const meta = [['Document', 'Game Math &mdash; Flow Chart'], ['Project', 'Big Bad Wolf Saloon'],
    ['Type', 'Math explainer'], ['Date', stamp]]
    .map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">
  <style>${CSS}</style></head><body>
  <section class="cover">
    <div class="bar"></div><div class="brandline">Big Bad Wolf Saloon</div><div class="spacer"></div>
    <h1 class="title">Game Math &mdash; Flow Chart</h1>
    <div class="subtitle">Big Bad Wolf Saloon — Wild-West Video Slot</div>
    <div class="rule"></div><div class="meta">${meta}</div><div class="spacer"></div>
    <div class="foot">Confidential &mdash; prepared for internal review and client hand-off. &copy; Big Bad Wolf Saloon.</div>
    <div class="bar" style="border-bottom:none;border-top:3px solid ${B.gold};"></div>
  </section>
  <main>${body()}</main></body></html>`;
}

const FOOTER = `<div style="width:100%; font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; color:#8A938C; padding:0 0.7in; display:flex; justify-content:space-between; align-items:center;">
  <span>Big Bad Wolf Saloon &middot; Confidential</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
const HEADER = `<div style="font-size:1px; padding:0;">&nbsp;</div>`;

async function main() {
  const ppUrl = require('url').pathToFileURL(require.resolve('puppeteer-core')).href;
  const puppeteer = (await import(ppUrl)).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html(), { waitUntil: 'networkidle0', timeout: 60000 });
  const out = path.join(DOCS, 'Flow_Chart_Claude.pdf');
  await page.pdf({ path: out, format: 'Letter', printBackground: true, displayHeaderFooter: true,
    headerTemplate: HEADER, footerTemplate: FOOTER, margin: { top: '0.55in', bottom: '0.7in', left: '0.7in', right: '0.7in' } });
  await browser.close();
  console.log(`  ✓ Flow_Chart_Claude.pdf  (${(fs.statSync(out).size / 1024 | 0)} KB)`);
}
main().catch(e => { console.error(e); process.exit(1); });
