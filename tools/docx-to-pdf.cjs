/*
 * Convert the Word documents in docs/ into polished, corporate-styled PDFs.
 *
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/docx-to-pdf.cjs            # all docs/*.docx
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/docx-to-pdf.cjs QA_Report  # just one (name match)
 *
 * Pipeline: docx --(mammoth)--> semantic HTML --(corporate template)--> headless
 * Chrome (puppeteer-core, using the installed Google Chrome) --> PDF.
 * Requires: mammoth + puppeteer-core (npm i in /tmp/wolfdoc), and Google Chrome.
 */
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
// puppeteer-core ships as ESM; loaded via dynamic import() inside main().

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Real in-game bonus art, base64-embedded so the PDFs are self-contained. Used to
// replace the placeholder house emoji in the math docs with what the player sees.
// The art is full-size on the reels, so down-scale it to a small icon (via macOS
// `sips`) before embedding — keeps the PDF lean. Falls back to the raw webp if
// sips isn't available (e.g. non-macOS).
const { execSync } = require('child_process');
const os = require('os');
const HOUSE_ART = {};
for (const [kind, file] of [['straw', 'bonus_pig_straw.webp'], ['wood', 'bonus_pig_wood.webp'], ['brick', 'bonus_pig_brick.webp']]) {
  const src = path.join(ROOT, 'assets', file);
  try {
    const out = path.join(os.tmpdir(), `bbw-house-${kind}.png`);
    execSync(`sips -s format png -Z 96 "${src}" --out "${out}"`, { stdio: 'ignore' });
    HOUSE_ART[kind] = 'data:image/png;base64,' + fs.readFileSync(out).toString('base64');
  } catch (e) {
    try { HOUSE_ART[kind] = 'data:image/webp;base64,' + fs.readFileSync(src).toString('base64'); }
    catch (e2) { HOUSE_ART[kind] = ''; }
  }
}
const houseImg = (kind, alt) => HOUSE_ART[kind] ? `<img class="doc-house" src="${HOUSE_ART[kind]}" alt="${alt}">` : '';

// Swap the placeholder house emoji (🏚 Straw / 🏠 Stick / 🏰 Brick) for the actual
// in-game bonus art so the docs show exactly what the player sees on the reels.
function swapHouseIcons(html) {
  return html
    .replace(/🏚️?\s*(Straw)/g, houseImg('straw', 'Straw house') + ' $1')
    .replace(/🏠️?\s*(Stick)/g, houseImg('wood',  'Stick house') + ' $1')
    .replace(/🏰️?\s*(Brick)/g, houseImg('brick', 'Brick house') + ' $1');
}

// ── Brand / design tokens ────────────────────────────────────────────────────
const BRAND = {
  green: '#173E27',     // deep forest green (primary)
  greenSoft: '#1E5631',
  gold: '#A9842B',      // muted gold accent
  goldSoft: '#C9A24B',
  ink: '#1A1D1A',       // body text
  muted: '#5B6660',
  hair: '#E2E6E2',      // hairline
  panel: '#F6F8F6',     // table zebra / panels
  headRow: '#173E27',   // table header band
};

// Make a human title from a file stem, keeping common acronyms upper-cased.
function prettyTitle(stem) {
  let s = stem.replace(/_/g, ' ').trim();
  s = s.replace(/\bRTP\b/gi, 'RTP').replace(/\bQA\b/gi, 'QA').replace(/\bGLI\b/gi, 'GLI').replace(/\bAPI\b/gi, 'API');
  s = s.replace(/(\d+)%\s*RTP/i, '— $1% RTP');           // "97% RTP" -> "— 97% RTP"
  if (/Would This Game Pass GLI Certification/i.test(s) && !s.endsWith('?')) s += '?';
  return s;
}

// Colour the status keywords used in our reports so they read like badges.
function badgeify(html) {
  const colors = {
    PASS: '#1E7A3D', MEETS: '#1E7A3D', STRONG: '#1E7A3D',
    READY: '#24557A', PLATFORM: '#9A6A00', WARN: '#9A6A00', GAP: '#9A6A00', INFO: '#5B6660', FAIL: '#9B2D2D',
  };
  // Only convert these tokens when they stand alone inside a table cell or run.
  return html.replace(/>(\s*)(PASS|MEETS|STRONG|READY|PLATFORM|WARN|GAP|INFO|FAIL)(\s*)</g,
    (m, a, word, b) => `>${a}<span class="badge" style="--bc:${colors[word]}">${word}</span>${b}<`);
}

// Drop the original centred title / subtitle / meta lines (short leading <p>s)
// so they don't clash with our generated cover. Conservative: only short ones,
// only before the first heading/table, at most three.
function stripLeadingTitleBlocks(html) {
  let out = html.replace(/^\s+/, '');
  for (let i = 0; i < 3; i++) {
    const m = out.match(/^<p>([\s\S]*?)<\/p>\s*/);
    if (!m) break;
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 0 && text.length < 85) out = out.slice(m[0].length);
    else break;
  }
  return out;
}

const CSS = `
  @page { size: Letter; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    color: ${BRAND.ink}; font-size: 10.5pt; line-height: 1.5; margin: 0;
    background: #FFFFFF;
  }
  h1, h2, h3 { font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-weight: 600; }

  /* ── Cover ── */
  .cover { height: 9.0in; display: flex; flex-direction: column; page-break-after: always; }
  .cover .bar { height: 14px; background: ${BRAND.green}; border-bottom: 3px solid ${BRAND.gold}; }
  .cover .brandline { margin-top: 26px; font-size: 9.5pt; letter-spacing: 3px; font-weight: 700;
    text-transform: uppercase; color: ${BRAND.gold}; }
  .cover .spacer { flex: 1; }
  .cover h1.title { font-size: 33pt; line-height: 1.12; color: ${BRAND.green}; margin: 0 0 10px;
    max-width: 8.5in; letter-spacing: -0.3px; }
  .cover .subtitle { font-size: 13pt; color: ${BRAND.muted}; font-family: 'Source Serif 4', Georgia, serif;
    font-style: italic; margin-bottom: 30px; }
  .cover .rule { width: 78px; height: 4px; background: ${BRAND.gold}; margin-bottom: 26px; }
  .cover .meta { border: 1px solid ${BRAND.hair}; border-left: 4px solid ${BRAND.gold};
    background: ${BRAND.panel}; border-radius: 4px; padding: 16px 20px; max-width: 5.6in; }
  .cover .meta .row { display: flex; gap: 14px; padding: 3px 0; font-size: 10pt; }
  .cover .meta .k { width: 130px; color: ${BRAND.muted}; font-weight: 600; }
  .cover .meta .v { flex: 1; color: ${BRAND.ink}; }
  .cover .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid ${BRAND.hair};
    font-size: 8.5pt; color: ${BRAND.muted}; }

  /* ── Body ── */
  main { padding-top: 4px; }
  main h1 { font-size: 17pt; color: ${BRAND.green}; margin: 26px 0 8px; padding-bottom: 6px;
    border-bottom: 2px solid ${BRAND.hair}; }
  main h1:first-child { margin-top: 0; }
  main h2 { font-size: 13pt; color: ${BRAND.gold}; margin: 18px 0 6px; }
  main h3 { font-size: 11.5pt; color: ${BRAND.greenSoft}; margin: 14px 0 4px; }
  p { margin: 0 0 9px; }
  a { color: ${BRAND.greenSoft}; text-decoration: none; border-bottom: 1px solid ${BRAND.goldSoft}; }
  strong { color: #11140F; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin: 0 0 4px; }
  h1, h2, h3 { page-break-after: avoid; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9.5pt;
    page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid ${BRAND.hair}; padding: 7px 9px; text-align: left; vertical-align: top; }
  thead th, tr:first-child td strong:only-child { }
  table tr:first-child { background: ${BRAND.headRow}; }
  table tr:first-child td, table tr:first-child th { color: #FFFFFF; font-weight: 600; font-size: 8.6pt;
    letter-spacing: 0.4px; text-transform: uppercase; border-color: ${BRAND.greenSoft}; }
  table tr:nth-child(even):not(:first-child) { background: ${BRAND.panel}; }

  /* ── Status badges ── */
  .badge { display: inline-block; font-weight: 700; font-size: 8.4pt; letter-spacing: 0.4px;
    color: #fff; background: var(--bc, ${BRAND.muted}); border-radius: 10px; padding: 1px 9px; }

  /* in-game bonus art that replaces the placeholder house emoji */
  .doc-house { height: 1.5em; width: auto; vertical-align: -0.42em; margin-right: 4px; }
`;

function buildHTML(title, subtitle, meta, bodyHTML) {
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
    <h1 class="title">${title}</h1>
    <div class="subtitle">${subtitle}</div>
    <div class="rule"></div>
    <div class="meta">${metaRows}</div>
    <div class="spacer"></div>
    <div class="foot">Confidential &mdash; prepared for internal review and client hand-off. &copy; Big Bad Wolf Saloon.</div>
    <div class="bar" style="border-bottom:none;border-top:3px solid ${BRAND.gold};"></div>
  </section>
  <main>${bodyHTML}</main>
  </body></html>`;
}

const FOOTER = `<div style="width:100%; font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; color:#8A938C;
  padding:0 0.7in; display:flex; justify-content:space-between; align-items:center;">
  <span>Big Bad Wolf Saloon &middot; Confidential</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
const HEADER = `<div style="font-size:1px; padding:0;">&nbsp;</div>`;

const SUBTITLE = 'Big Bad Wolf Saloon — Wild-West Video Slot';

async function main() {
  const filter = process.argv[2];
  let files = fs.readdirSync(DOCS).filter(f => f.toLowerCase().endsWith('.docx'));
  if (filter) files = files.filter(f => f.toLowerCase().includes(filter.toLowerCase()));
  if (!files.length) { console.error('No matching .docx in docs/'); process.exit(1); }

  // ESM import() ignores NODE_PATH, so resolve the package path via CJS first.
  const ppUrl = require('url').pathToFileURL(require.resolve('puppeteer-core')).href;
  const puppeteer = (await import(ppUrl)).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const stamp = new Date().toISOString().slice(0, 10);

  for (const file of files) {
    const stem = file.replace(/\.docx$/i, '');
    const title = prettyTitle(stem);
    const { value: rawHtml, messages } = await mammoth.convertToHtml({ path: path.join(DOCS, file) });
    const bodyHtml = swapHouseIcons(badgeify(stripLeadingTitleBlocks(rawHtml)));
    const meta = [
      ['Document', title],
      ['Project', 'Big Bad Wolf Saloon'],
      ['Type', 'Internal documentation'],
      ['Date', stamp],
    ];
    const html = buildHTML(title, SUBTITLE, meta, bodyHtml);

    const page = await browser.newPage();
    if (process.env.SHOT) await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    if (process.env.SHOT) {
      await page.screenshot({ path: '/tmp/' + stem + '_cover.png' });
      // scroll to the house art (if present) so the swap can be verified
      await page.evaluate(() => {
        const h = document.querySelector('.doc-house');
        if (h) h.scrollIntoView({ block: 'center' }); else window.scrollTo(0, 1140);
      });
      await page.screenshot({ path: '/tmp/' + stem + '_content.png' });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const out = path.join(DOCS, stem + '.pdf');
    await page.pdf({
      path: out, format: 'Letter', printBackground: true,
      displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER,
      margin: { top: '0.55in', bottom: '0.7in', left: '0.7in', right: '0.7in' },
    });
    await page.close();
    const kb = (fs.statSync(out).size / 1024 | 0);
    console.log(`  ✓ ${stem}.pdf  (${kb} KB)` + (messages.length ? `  [${messages.length} mammoth notes]` : ''));
  }
  await browser.close();
  console.log(`Done — ${files.length} PDF(s) in docs/.`);
}
main().catch(e => { console.error(e); process.exit(1); });
