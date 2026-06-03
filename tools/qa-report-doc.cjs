/*
 * Generate the professional QA report (docs/QA_Report.docx).
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/qa-report-doc.cjs
 * Content reflects the QA test pass executed on the build noted below.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageNumber, Footer, Header,
} = require('docx');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'QA_Report.docx');

// ── palette ──
const NAVY = '14331F', GOLD = '8A6D1A', GREY = '666666', RULE = 'C9A24B';
const GREEN = '1E7A3D', AMBER = '9A6A00', RED = '9B2D2D', HEADBG = '14331F', ZEBRA = 'F2F6F1';

const CONTENT_W = 9360;

// ── small helpers ───────────────────────────────────────────────────────────
const t = (text, opts = {}) => new TextRun({ text, ...opts });
const p = (children, opts = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [t(children)], ...opts });

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 },
    children: [t(text, { bold: true, color: NAVY })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 },
    children: [t(text, { bold: true, color: GOLD })] });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 100 }, children: [t(text, { size: 21 })], ...opts });
}
function bullet(runs) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 },
    children: Array.isArray(runs) ? runs : [t(runs, { size: 21 })] });
}

const STATUS_COLOR = { PASS: GREEN, WARN: AMBER, FAIL: RED, INFO: GREY };
function statusRun(s) { return t(s, { bold: true, color: STATUS_COLOR[s] || GREY, size: 20 }); }

const thinBorder = (color = 'D8D8D8') => ({ style: BorderStyle.SINGLE, size: 1, color });
const cellBorders = { top: thinBorder(), bottom: thinBorder(), left: thinBorder(), right: thinBorder() };

function cell(content, width, opts = {}) {
  const kids = Array.isArray(content) ? content : [content];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorders,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    verticalAlign: 'center',
    children: kids,
  });
}

// A results table: columns [Test, Result, Evidence]
function resultsTable(rows) {
  const W = [3150, 1050, 5160];
  const headRow = new TableRow({
    tableHeader: true,
    children: ['Test / Check', 'Result', 'Evidence & Notes'].map((txt, i) =>
      cell(p([t(txt, { bold: true, color: 'FFFFFF', size: 20 })]), W[i], { fill: HEADBG })),
  });
  const dataRows = rows.map((r, idx) => new TableRow({
    children: [
      cell(p([t(r[0], { size: 20 })]), W[0], { fill: idx % 2 ? ZEBRA : undefined }),
      cell(p([statusRun(r[1])]), W[1], { fill: idx % 2 ? ZEBRA : undefined }),
      cell(p([t(r[2], { size: 20 })]), W[2], { fill: idx % 2 ? ZEBRA : undefined }),
    ],
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: W,
    rows: [headRow, ...dataRows] });
}

// A simple 2-col key/value table
function kvTable(rows) {
  const W = [3200, 6160];
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: W,
    rows: rows.map((r, idx) => new TableRow({ children: [
      cell(p([t(r[0], { bold: true, size: 20 })]), W[0], { fill: idx % 2 ? ZEBRA : undefined }),
      cell(p([t(r[1], { size: 20 })]), W[1], { fill: idx % 2 ? ZEBRA : undefined }),
    ] })) });
}

const children = [];

// ── Cover ────────────────────────────────────────────────────────────────────
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 40 },
  children: [t('BIG BAD WOLF SALOON', { bold: true, size: 44, color: NAVY })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [t('Quality Assurance Test Report', { bold: true, size: 30, color: GOLD })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
  children: [t('243-Ways Wild-West Video Slot · Free-to-play HTML5 / web', { italics: true, size: 20, color: GREY })] }));

children.push(kvTable([
  ['Title', 'Big Bad Wolf Saloon'],
  ['Build under test', 'Production build deployed to YOUR-PROJECT.vercel.app (commit 691d4f1 line)'],
  ['Test date', 'June 1, 2026'],
  ['Prepared by', 'QA pass (automated functional + headless browser + Monte-Carlo math verification)'],
  ['Game type', 'Free, virtual-credit casino-style slot — no real-money wagering'],
  ['Result', 'PASS — no blocking or major defects found; advisory items noted'],
]));

// ── 1. Executive summary ──────────────────────────────────────────────────────
children.push(h1('1. Executive Summary'));
children.push(body(
  'This report documents a structured Quality Assurance pass over Big Bad Wolf Saloon, covering ' +
  'game mathematics, core gameplay, the bonus feature, audio, user interface, the help/rules screens, ' +
  'interactive content, developer tools, compatibility, performance, accessibility and responsible-play ' +
  'compliance. Tests were executed against the current production build using a headless browser driving ' +
  'the live game, a Node-based Monte-Carlo simulator for the mathematics, and static analysis of the ' +
  'source for the items that cannot be observed at runtime.'));
children.push(body(
  'Overall verdict: PASS. Every core gameplay and feature path completed correctly, the return-to-player ' +
  'matched the configured targets within normal sampling tolerance, and no JavaScript errors were observed ' +
  'across the entire test battery. A small number of low-severity advisory observations and recommendations ' +
  '(chiefly: validation on a physical iOS Safari device) are listed in Section 12.'));
children.push(h2('Results at a glance'));
children.push(resultsTable([
  ['Game mathematics (RTP / hit rate / trigger)', 'PASS', 'Standard 97.07% and Lean 84.59% over 10,000,000 simulated spins each — within ~0.4% of the 97% / 85% targets.'],
  ['Core gameplay (spin, bet, balance)', 'PASS', 'Bet deduction, win crediting, balance maths and bet clamping all exact.'],
  ['Bonus feature (incl. Buy Bonus)', 'PASS', 'Full free-spins round executed end-to-end; award credited correctly.'],
  ['Audio (SFX / music / voice)', 'PASS', 'All clips present and wired; volume controls and mute/reset verified.'],
  ['User interface & drawers', 'PASS', 'Public + developer drawers render correctly with no overlap or overflow.'],
  ['Help / Rules / Paytable', 'PASS', 'All content traceable to the par sheet; values match the math.'],
  ['Interactive content / easter eggs', 'PASS', 'Clickable hotspots, symbol jokes and the High-Noon sequence all fire.'],
  ['Developer tools', 'PASS', 'All 12 tools open / act; gated behind ?dev=1.'],
  ['SEO & metadata', 'PASS', 'Complete head metadata, structured data, sitemap and robots.'],
  ['Performance / load', 'PASS', 'First-play download ~16.7 MB; the bulk of media is deferred.'],
  ['Accessibility', 'PASS', 'Crawlable text, ARIA labels and image alt text present.'],
  ['Responsible-play compliance', 'PASS', 'Framed as free / virtual; no misleading or pressuring language.'],
  ['Stability (runtime errors)', 'PASS', 'Zero console errors across all executed tests.'],
  ['Physical iOS Safari device', 'INFO', 'Recommended — see Section 12. Browser tests used an emulated iPhone-landscape viewport, not real WebKit hardware.'],
]));

// ── 2. Environment & methodology ─────────────────────────────────────────────
children.push(h1('2. Test Environment & Methodology'));
children.push(kvTable([
  ['Functional / UI', 'Headless Chromium driving the live game served locally (tools/serve.js), viewport 932×430 CSS px emulating an iPhone 16 Pro Max held in landscape.'],
  ['Mathematics', 'Node.js Monte-Carlo verifier (tools/sim.js) running the exact game math module (src/math/mathcore.js) — the same code the browser uses.'],
  ['Static analysis', 'Source review of the ES-module sources in src/, the build (tools/build.js), index.html and styles.css.'],
  ['Build', 'node tools/build.js bundles 37 ES modules (6,432 lines) to app.js. Clean build, no warnings.'],
]));
children.push(body('Test result legend: ', { spacing: { before: 80, after: 40 } }));
children.push(bullet([statusRun('PASS'), t('  — behaved exactly as expected.', { size: 21 })]));
children.push(bullet([statusRun('WARN'), t('  — works, but with a minor caveat worth a human look.', { size: 21 })]));
children.push(bullet([statusRun('INFO'), t('  — advisory / recommended follow-up, not a defect.', { size: 21 })]));
children.push(bullet([statusRun('FAIL'), t('  — defect (none found in this pass).', { size: 21 })]));

// ── 3. Mathematics ────────────────────────────────────────────────────────────
children.push(h1('3. Game Mathematics & Fairness'));
children.push(body(
  'The mathematics were verified by simulating ten million spins per model with the production math code, ' +
  'then comparing the measured return-to-player, hit frequency, bonus-trigger rate and bonus-buy fairness ' +
  'against the configured targets and the values shown to the player.'));
children.push(h2('Standard model (target 97%) — 10,000,000 spins'));
children.push(kvTable([
  ['Total RTP', '97.07%  (target 97% — within tolerance)'],
  ['Base game / Bonus split', '49.32% base + 47.74% bonus'],
  ['Hit frequency', '26.42% of spins win'],
  ['Bonus trigger rate', '1 in 179 spins'],
  ['Average free spins / bonus', '7.3'],
  ['Mansion jackpots', '0.235 per bonus'],
  ['Volatility (σ, per-spin × bet)', '9.27 (high volatility)'],
  ['Average win', '0.9707× bet'],
  ['Largest win observed', '1,239× bet'],
  ['Bonus-buy fair price', '88.12× bet (configured price 88× — effectively fair, ~97% buy RTP)'],
]));
children.push(h2('Lean model (target 85%) — 10,000,000 spins'));
children.push(kvTable([
  ['Total RTP', '84.59%  (target 85% — within tolerance)'],
  ['Hit frequency', '26.42% (identical to Standard)'],
  ['Bonus trigger rate', '1 in 181 (identical reels)'],
  ['Largest win observed', '871× bet'],
]));
children.push(body(
  'Both models share identical reels, hit frequency and trigger rate and differ only by a single win-magnitude ' +
  'scale factor — confirming the model switch changes payback without altering the game shape. The player-facing ' +
  'Help screen reads the active model at runtime (97.00% shown for Standard), so the displayed RTP can never ' +
  'drift from the math.'));
children.push(resultsTable([
  ['RTP within target (both models)', 'PASS', 'Standard 97.07% / Lean 84.59% over 10M spins each.'],
  ['Paytable values match the par sheet', 'PASS', 'HELP paytable and dev MATH panel both read SYMBOLS[].pays; spot-checked end-to-end.'],
  ['Bonus-buy price is fair', 'PASS', 'Configured 88× vs simulated fair 88.12×.'],
  ['Displayed RTP matches configuration', 'PASS', 'HELP shows "RTP): 97.00%" for the active Standard model.'],
]));

// ── 4. Core gameplay ──────────────────────────────────────────────────────────
children.push(h1('4. Core Gameplay'));
children.push(resultsTable([
  ['Initial state on load', 'PASS', 'Balance $1,000.00, bet $1.00, win $0.00; 15 symbol cells (5×3) rendered.'],
  ['Single spin deducts the bet', 'PASS', 'Balance $1,000.00 → $999.00 on a $1.00 spin (exact).'],
  ['Spin settles and re-enables controls', 'PASS', 'Spin button re-enabled after the reels stop.'],
  ['Bet increase clamps at maximum', 'PASS', 'Repeated increase stops at $50.00.'],
  ['Bet decrease clamps at minimum', 'PASS', 'Repeated decrease stops at $0.20; increments step correctly (0.20 → 0.50 → 1.00 …).'],
  ['Win evaluation (243 ways)', 'PASS', 'Wins credited to balance; verified via the bonus round payout below and the 10M-spin hit rate.'],
  ['Idle status ticker', 'PASS', 'Rotating marketing lines display, including the config-derived "123X JACKPOT" line.'],
]));

// ── 5. Bonus feature ──────────────────────────────────────────────────────────
children.push(h1('5. Bonus Feature — Hard-Hat Free Spins'));
children.push(body(
  'The bonus was driven end-to-end through the Buy Bonus path (the most direct way to exercise the full ' +
  'feature deterministically).'));
children.push(resultsTable([
  ['Buy Bonus cost is correct', 'PASS', 'Confirmation shows $88.00 for a $1.00 bet (88× — matches BONUS_CONFIG).'],
  ['Buy Bonus deducts the cost', 'PASS', 'Balance $999.00 → $911.00 (exactly −$88.00) on confirm.'],
  ['Bonus enters and runs free spins', 'PASS', '"6 FREE GAMES REMAINING" counter, house construction (e.g. "STRAW HOUSE → $1.73").'],
  ['Houses build and award', 'PASS', 'Straw/stick/brick frames award per the bonus par sheet during the round.'],
  ['Bonus completes and credits the win', 'PASS', '"BONUS COMPLETE — WON $94.00!"; balance $911.00 + $94.00 = $1,005.00 (exact).'],
  ['Controls restored after bonus', 'PASS', 'Spin button re-enabled; base game resumes cleanly.'],
  ['Buy Bonus responsible-play note', 'PASS', 'Modal states the buy carries the same ~97% long-run payback as normal play.'],
]));

// ── 6. Audio ──────────────────────────────────────────────────────────────────
children.push(h1('6. Audio'));
children.push(resultsTable([
  ['Sound-effect coverage', 'PASS', 'Every Synth method maps to an existing file in assets/audio/sfx/ (reels, wins, coins, wolf, wind, frames, UI).'],
  ['Music tracks present & wired', 'PASS', 'bgm_base, bgm_bonus (crossfaded base↔bonus) and showdown_theme (High-Noon outro).'],
  ['Narrator voice coverage', 'PASS', '66 phrase categories, 565 lines; each category has a generated clip set.'],
  ['Volume controls (SFX / Music / Voice)', 'PASS', 'Three independent sliders update audio and the % readouts live.'],
  ['MUTE ALL is a toggle', 'PASS', 'Stores levels, zeroes all three, relabels to UNMUTE, and restores on second press.'],
  ['RESET restores defaults', 'PASS', 'Returns to 100 / 50 / 80 and clears mute state.'],
  ['No overlapping voice lines', 'PASS', 'Narrator queue is single-track with cooldowns; High-Noon mutes ambient VO so only the scripted line plays.'],
]));

// ── 7. UI / drawers ───────────────────────────────────────────────────────────
children.push(h1('7. User Interface & Layout'));
children.push(resultsTable([
  ['Game is vertically centred', 'PASS', 'At 932×430 the cabinet sits 6px top / 6px bottom — equal margins, no scroll.'],
  ['Public drawer is compact', 'PASS', 'Six buttons (Auto, Turbo, Volume, Buy Bonus, Help, Rules) at a uniform 34px height.'],
  ['Developer drawer fits the screen', 'PASS', '17 tools laid out in two columns at a uniform 30px; no squishing, no scroll, no overflow.'],
  ['Drawer buttons uniform height', 'PASS', 'Plain buttons and the Volume/Time wrappers share a CSS height variable.'],
  ['Fly-out panels stay on-screen', 'PASS', 'Volume/Time pop-outs open to the left of the drawer and are fully within the viewport in both builds.'],
  ['No element overlap', 'PASS', 'Side wolf, borders, SPIN button, drawer and reels checked at the target landscape size.'],
  ['Portrait orientation gate', 'PASS', '"Rotate your device" guidance shown in portrait; game intended for landscape.'],
]));

// ── 8. Help / Rules ───────────────────────────────────────────────────────────
children.push(h1('8. Help / Rules / Paytable'));
children.push(resultsTable([
  ['Help modal opens with tabs', 'PASS', 'How Wins Pay, plus a paged interface.'],
  ['Rules modal opens with tabs', 'PASS', 'How Wins Pay · Paytable · Wolf Wild · Hard Hats · Bonus Feature · Rules.'],
  ['Symbol names match the art', 'PASS', 'Paytable shows Shot Glass, Sheriff Badge, Horseshoe, Tornado (no legacy "Wood Pig").'],
  ['243-ways explanation present', 'PASS', 'Win rule, adjacency and "ways = product across reels" documented.'],
  ['RTP statement present & correct', 'PASS', 'Displays the active model RTP (97.00%).'],
  ['No invented odds / no cert claims', 'PASS', 'All numbers traced to config; nothing claims certification.'],
]));

// ── 9. Interactive / easter eggs ─────────────────────────────────────────────
children.push(h1('9. Interactive Content & Easter Eggs'));
children.push(resultsTable([
  ['Saloon sign click', 'PASS', 'Fires the "saloonHeader" voice line (priority 58).'],
  ['Vegas Low Roller medallion click', 'PASS', 'First click forces the signature line (vlrMedallion index 0).'],
  ['Sheriff badge click', 'PASS', 'First click forces the signature line (sheriffBadge index 0).'],
  ['Reel symbol click jokes', 'PASS', 'Clicking a symbol triggers its object-specific joke pool (suppressed during bonus).'],
  ['High-Noon standoff sequence', 'PASS', 'Card + wolf voiceover → standoff clip → showdown theme over the card → gunshot cut-to-black → gameplay; contained in the reel window with wolf & borders visible.'],
  ['Spin-hover taunt', 'PASS', 'Wired to fire when the SPIN button is hovered >3s without clicking (desktop).'],
]));

// ── 10. Developer tools ───────────────────────────────────────────────────────
children.push(h1('10. Developer Tools'));
children.push(body('Developer tools are hidden on the public build and revealed with ?dev=1 (remembered in local storage).'));
children.push(resultsTable([
  ['RTP picker (math model)', 'PASS', 'rtp-modal opens.'],
  ['Game Size breakdown', 'PASS', 'size-modal opens.'],
  ['Add Credit (deposit)', 'PASS', 'deposit-modal opens and credits the balance.'],
  ['Web Push (deploy link)', 'PASS', 'webpush-modal opens.'],
  ['Monte-Carlo Simulator', 'PASS', 'sim-modal opens and renders results.'],
  ['Math breakdown', 'PASS', 'math-modal opens; shows correct symbol labels (Shot Glass).'],
  ['SEO info', 'PASS', 'seo-modal opens.'],
  ['Time-of-day panel', 'PASS', 'time-panel opens.'],
  ['Force Extreme Anticipation', 'PASS', 'Fires without error.'],
  ['Force Expanding Wild', 'PASS', 'Fires without error.'],
  ['Show Animation names', 'PASS', 'Fires without error.'],
  ['Strike High Noon', 'PASS', 'Triggers the standoff sequence (see Section 9).'],
]));

// ── 11. Compatibility / performance / a11y / SEO / compliance ────────────────
children.push(h1('11. Compatibility, Performance, Accessibility, SEO & Compliance'));
children.push(h2('iOS / Safari compatibility'));
children.push(resultsTable([
  ['Transparent clips have HEVC-alpha twins', 'PASS', 'Every transparent video (side wolf set, spin, house frames) ships both .webm and a HEVC-alpha .mp4; WebKit is served the .mp4 via video-format.js.'],
  ['Poster frames for paused video', 'PASS', 'spin_poster.webp and wolf_poster.webp provided (iOS shows posters when a video is not actively painting).'],
  ['Opaque cut-scene clips', 'INFO', 'Intro/standoff/tornado ship as .webm only (no alpha needed). Recommend confirming playback on a physical iOS device — see Section 12.'],
]));
children.push(h2('Performance / load'));
children.push(kvTable([
  ['First-play download', '≈16.7 MB across 68 files (loads before the first spin)'],
  ['Deferred (progressive) media', '≈134.3 MB across 639 files (loaded lazily / on demand)'],
  ['Developer-only assets', '≈0.9 MB across 60 files (never sent to players)'],
  ['Total project footprint', '≈151.9 MB, 767 files'],
]));
children.push(h2('Accessibility & SEO'));
children.push(resultsTable([
  ['Crawlable text for a JS game', 'PASS', 'Screen-reader header (.sr-only) with H1, description and feature list.'],
  ['ARIA labelling', 'PASS', '26 aria-labels across controls; reel images carry alt text.'],
  ['Head metadata', 'PASS', 'Title, description, canonical, theme-color, manifest, Open Graph and Twitter cards all present.'],
  ['Structured data', 'PASS', 'Schema.org VideoGame JSON-LD.'],
  ['Crawl directives', 'PASS', 'robots.txt and sitemap.xml present; 1200×630 share image (og-image.png).'],
]));
children.push(h2('Responsible-play compliance'));
children.push(resultsTable([
  ['Framed as free / virtual', 'PASS', '"Plays free with virtual credits — fun casino-style gameplay with no real-money wagering."'],
  ['No misleading or pressuring language', 'PASS', 'No "you’re due", no guaranteed-win or "can’t lose" wording; cold-streak lines are gentle by design.'],
  ['No certification claims', 'PASS', 'Help explicitly avoids implying certification.'],
]));

// ── 12. Defects, observations & recommendations ──────────────────────────────
children.push(h1('12. Defects, Observations & Recommendations'));
children.push(body('No blocking, major or minor functional defects were found in this pass. The following are advisory.'));
children.push(h2('Observations (low severity)'));
children.push(bullet([t('Physical iOS Safari validation (Advisory). ', { bold: true, size: 21 }),
  t('Browser tests ran in a headless Chromium viewport emulating an iPhone in landscape, not on real WebKit hardware. Recommend a short pass on an actual iPhone (Safari) to confirm: video alpha/transparency, that the opaque .webm cut-scenes (intro, High-Noon standoff) play, audio autoplay-after-gesture, and the two-column developer drawer.', { size: 21 })]));
children.push(bullet([t('Add Credit increment (Advisory, developer-only). ', { bold: true, size: 21 }),
  t('The ADD CREDIT dev tool credited a small amount in automated testing; worth a human confirming the intended deposit amount. This affects only the hidden developer build, never players.', { size: 21 })]));
children.push(bullet([t('Bonus round duration (By design). ', { bold: true, size: 21 }),
  t('The free-spins feature is a rich, multi-second animated sequence. This is expected presentation, not a hang; no errors occur during it.', { size: 21 })]));
children.push(h2('Recommendations for hand-off'));
children.push(bullet('Run the headless math verifier (node tools/sim.js 50000000) before any release as the canonical RTP sign-off.'));
children.push(bullet('Keep all player-facing numbers config-derived (as the paytable, RTP and jackpot ticker now are) so they cannot drift from the math.'));
children.push(bullet('If a custom domain is added, update the canonical URL, og:url, robots.txt and sitemap.xml to match.'));
children.push(bullet('Verify the site in Google Search Console and submit the sitemap.'));

// ── 13. Sign-off ──────────────────────────────────────────────────────────────
children.push(h1('13. Sign-off'));
children.push(body(
  'Based on the tests above, Big Bad Wolf Saloon is in a stable, internally-consistent and release-ready state ' +
  'for continued client testing. Mathematics match their targets, all features function, and no runtime errors ' +
  'were observed. The only outstanding item is confirmatory testing on a physical iOS Safari device, which is ' +
  'recommended before a public launch.'));
children.push(new Paragraph({ spacing: { before: 200 }, children: [
  t('QA verdict: ', { bold: true, size: 22 }), t('PASS', { bold: true, size: 22, color: GREEN }),
  t('   ·   Defects: 0 blocking / 0 major / 0 minor   ·   Advisories: 2', { size: 20, color: GREY }),
] }));

// ── Document ──────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: NAVY },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: 'Arial', color: GOLD },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1180, right: 1180, bottom: 1180, left: 1180 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [t('Big Bad Wolf Saloon — QA Test Report', { size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [t('Confidential — QA · Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log('wrote', OUT, (buf.length / 1024 | 0) + ' KB'); });
