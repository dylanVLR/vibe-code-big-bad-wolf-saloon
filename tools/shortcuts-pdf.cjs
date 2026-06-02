/*
 * Generate docs/Keyboard_Shortcuts.pdf — a corporate-styled reference card for
 * every keyboard shortcut wired in src/system/shortcuts.js.
 *
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/shortcuts-pdf.cjs
 *
 * Self-contained (no .docx source): builds HTML with the same brand template as
 * tools/docx-to-pdf.cjs, then prints to PDF via the installed Google Chrome.
 * Requires: puppeteer-core (npm i in /tmp/wolfdoc) + Google Chrome.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── Brand tokens (kept in sync with tools/docx-to-pdf.cjs) ────────────────────
const BRAND = {
  green: '#173E27', greenSoft: '#1E5631', gold: '#A9842B', goldSoft: '#C9A24B',
  ink: '#1A1D1A', muted: '#5B6660', hair: '#E2E6E2', panel: '#F6F8F6', headRow: '#173E27',
};

// ── The shortcut map (mirrors src/system/shortcuts.js) ────────────────────────
const SECTIONS = [
  {
    title: 'Spin &amp; Play',
    intro: 'The core controls — everything you need to keep the reels turning.',
    rows: [
      [['Space'], 'Spin the reels'],
      [['Enter'], 'Spin the reels (alternate)'],
      [['A'], 'Auto-spin — start / stop'],
      [['T'], 'Turbo mode — on / off'],
      [['&uarr;'], 'Increase the bet one step'],
      [['&darr;'], 'Decrease the bet one step'],
      [['+'], 'Increase the bet (alternate)'],
      [['&minus;'], 'Decrease the bet (alternate)'],
      [['B'], 'Buy Bonus (opens the confirmation)'],
    ],
  },
  {
    title: 'Sound',
    intro: 'Quick audio control without reaching for the sliders.',
    rows: [
      [['V'], 'Open / close the Volume panel'],
      [['M'], 'Mute all / unmute'],
    ],
  },
  {
    title: 'Panels &amp; Navigation',
    intro: 'Open the side panel and move around it entirely from the keyboard.',
    rows: [
      [['O'], 'Open / close the side options panel'],
      [['&uarr;', '&darr;'], 'Move between panel controls (while the panel is open)'],
      [['&larr;', '&rarr;'], 'Drag the highlighted volume slider (while the panel is open)'],
      [['Enter'], 'Activate the highlighted control (while the panel is open)'],
      [['H'], 'Open Help'],
      [['R'], 'Open Rules'],
      [['&larr;', '&rarr;'], 'Previous / next page (while Help or Rules is open)'],
      [['Esc'], 'Close the open panel or popup'],
    ],
  },
];

const keyCaps = keys => keys.map(k => `<span class="kbd">${k}</span>`).join('<span class="kbd-or">or</span>');

const CSS = `
  @page { size: Letter; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:${BRAND.ink};
    font-size:10.5pt; line-height:1.5; margin:0; background:#FFF; }
  h1, h2, h3 { font-family:'Source Serif 4',Georgia,'Times New Roman',serif; font-weight:600; }

  /* Cover */
  .cover { height:9.0in; display:flex; flex-direction:column; page-break-after:always; }
  .cover .bar { height:14px; background:${BRAND.green}; border-bottom:3px solid ${BRAND.gold}; }
  .cover .brandline { margin-top:26px; font-size:9.5pt; letter-spacing:3px; font-weight:700;
    text-transform:uppercase; color:${BRAND.gold}; }
  .cover .spacer { flex:1; }
  .cover h1.title { font-size:33pt; line-height:1.12; color:${BRAND.green}; margin:0 0 10px;
    max-width:8.5in; letter-spacing:-0.3px; }
  .cover .subtitle { font-size:13pt; color:${BRAND.muted}; font-family:'Source Serif 4',Georgia,serif;
    font-style:italic; margin-bottom:30px; }
  .cover .rule { width:78px; height:4px; background:${BRAND.gold}; margin-bottom:26px; }
  .cover .meta { border:1px solid ${BRAND.hair}; border-left:4px solid ${BRAND.gold};
    background:${BRAND.panel}; border-radius:4px; padding:16px 20px; max-width:5.6in; }
  .cover .meta .row { display:flex; gap:14px; padding:3px 0; font-size:10pt; }
  .cover .meta .k { width:130px; color:${BRAND.muted}; font-weight:600; }
  .cover .meta .v { flex:1; color:${BRAND.ink}; }
  .cover .foot { margin-top:26px; padding-top:12px; border-top:1px solid ${BRAND.hair};
    font-size:8.5pt; color:${BRAND.muted}; }

  /* Body */
  main { padding-top:4px; }
  main h1 { font-size:17pt; color:${BRAND.green}; margin:26px 0 8px; padding-bottom:6px;
    border-bottom:2px solid ${BRAND.hair}; }
  main h1:first-child { margin-top:0; }
  main h2 { font-size:13pt; color:${BRAND.gold}; margin:20px 0 2px; }
  p { margin:0 0 9px; }
  .lead { color:${BRAND.muted}; font-size:9.5pt; margin:0 0 8px; }
  h1, h2, h3 { page-break-after:avoid; }

  /* Tables */
  table { width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:9.8pt; page-break-inside:auto; }
  tr { page-break-inside:avoid; }
  th, td { border:1px solid ${BRAND.hair}; padding:7px 10px; text-align:left; vertical-align:middle; }
  thead th { background:${BRAND.headRow}; color:#FFF; font-weight:600; font-size:8.6pt;
    letter-spacing:0.4px; text-transform:uppercase; border-color:${BRAND.greenSoft}; }
  tbody tr:nth-child(even) { background:${BRAND.panel}; }
  td.keycol { width:2.1in; white-space:nowrap; }

  /* Key caps */
  .kbd { display:inline-block; min-width:1.5em; text-align:center; font-family:'SFMono-Regular',Menlo,Consolas,monospace;
    font-size:9pt; font-weight:600; color:${BRAND.green}; background:#FFFFFF;
    border:1px solid #C7CEC7; border-bottom-width:2px; border-radius:5px; padding:2px 7px;
    box-shadow:0 1px 0 rgba(0,0,0,0.04); }
  .kbd-or { color:${BRAND.muted}; font-size:8pt; font-style:italic; margin:0 5px; }

  .note { border:1px solid ${BRAND.hair}; border-left:4px solid ${BRAND.gold}; background:${BRAND.panel};
    border-radius:4px; padding:10px 14px; font-size:9.3pt; color:${BRAND.ink}; margin:14px 0 0; }
  .note b { color:${BRAND.green}; }
`;

function buildBody() {
  const sections = SECTIONS.map(s => {
    const rows = s.rows.map(([keys, desc]) =>
      `<tr><td class="keycol">${keyCaps(keys)}</td><td>${desc}</td></tr>`).join('');
    return `<h2>${s.title}</h2><p class="lead">${s.intro}</p>
      <table><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');
  return `<h1>Keyboard Shortcuts</h1>
    <p>Every action in Big Bad Wolf Saloon is reachable from the keyboard. Shortcuts work anywhere on the
    page — you don't need to click into the game first. They're context-aware: with the side panel closed
    the arrow keys change your bet, and with it open the same keys navigate between the panel's controls.</p>
    ${sections}
    <div class="note"><b>Good to know.</b> Browser and system chords (such as &#8984;R or Ctrl+C) are never
    intercepted, and shortcuts pause automatically while you're typing in a field. The <span class="kbd">B</span>
    Buy&nbsp;Bonus key always opens a confirmation first — it never spends instantly.</div>`;
}

function buildHTML() {
  const stamp = new Date().toISOString().slice(0, 10);
  const meta = [
    ['Document', 'Keyboard Shortcuts'],
    ['Project', 'Big Bad Wolf Saloon'],
    ['Type', 'Player &amp; QA reference'],
    ['Date', stamp],
  ];
  const metaRows = meta.map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">
  <style>${CSS}</style></head><body>
  <section class="cover">
    <div class="bar"></div>
    <div class="brandline">Big Bad Wolf Saloon</div>
    <div class="spacer"></div>
    <h1 class="title">Keyboard Shortcuts</h1>
    <div class="subtitle">Big Bad Wolf Saloon — Wild-West Video Slot</div>
    <div class="rule"></div>
    <div class="meta">${metaRows}</div>
    <div class="spacer"></div>
    <div class="foot">Confidential &mdash; prepared for internal review and client hand-off. &copy; Big Bad Wolf Saloon.</div>
    <div class="bar" style="border-bottom:none;border-top:3px solid ${BRAND.gold};"></div>
  </section>
  <main>${buildBody()}</main>
  </body></html>`;
}

const FOOTER = `<div style="width:100%; font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; color:#8A938C;
  padding:0 0.7in; display:flex; justify-content:space-between; align-items:center;">
  <span>Big Bad Wolf Saloon &middot; Confidential</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
const HEADER = `<div style="font-size:1px; padding:0;">&nbsp;</div>`;

async function main() {
  const ppUrl = require('url').pathToFileURL(require.resolve('puppeteer-core')).href;
  const puppeteer = (await import(ppUrl)).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(buildHTML(), { waitUntil: 'networkidle0', timeout: 60000 });
  const out = path.join(DOCS, 'Keyboard_Shortcuts.pdf');
  await page.pdf({
    path: out, format: 'Letter', printBackground: true,
    displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER,
    margin: { top: '0.55in', bottom: '0.7in', left: '0.7in', right: '0.7in' },
  });
  await browser.close();
  const kb = (fs.statSync(out).size / 1024 | 0);
  console.log(`  ✓ Keyboard_Shortcuts.pdf  (${kb} KB)`);
}
main().catch(e => { console.error(e); process.exit(1); });
