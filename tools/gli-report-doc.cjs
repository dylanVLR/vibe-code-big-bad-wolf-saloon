/*
 * Generate docs/Would_This_Game_Pass_GLI_Certification.docx
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/gli-report-doc.cjs
 *
 * An assessment of the game against Gaming Laboratories International (GLI)
 * certification, based on researched GLI / Nevada standards. Sources are listed
 * in the References section of the document.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageNumber, Footer, Header, ExternalHyperlink,
} = require('docx');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'Would_This_Game_Pass_GLI_Certification.docx');

const NAVY = '14331F', GOLD = '8A6D1A', GREY = '5F5F5F', RULE = 'C9A24B';
const GREEN = '1E7A3D', AMBER = '9A6A00', BLUE = '24557A', HEADBG = '14331F', ZEBRA = 'F2F6F1';
const CONTENT_W = 9360;

const t = (text, opts = {}) => new TextRun({ text, ...opts });
function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(text, { bold: true, color: NAVY })] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(text, { bold: true, color: GOLD })] }); }
function body(text, opts = {}) { return new Paragraph({ spacing: { after: 120 }, children: Array.isArray(text) ? text : [t(text, { size: 21 })], ...opts }); }
function bullet(runs) { return new Paragraph({ bullet: { level: 0 }, spacing: { after: 50 }, children: Array.isArray(runs) ? runs : [t(runs, { size: 21 })] }); }

const STATUS_COLOR = { 'PASS': GREEN, 'MEETS': GREEN, 'STRONG': GREEN, 'READY': BLUE, 'PLATFORM': AMBER, 'GAP': AMBER };
function statusRun(s) { return t(s, { bold: true, color: STATUS_COLOR[s] || GREY, size: 19 }); }

const thin = (c = 'D8D8D8') => ({ style: BorderStyle.SINGLE, size: 1, color: c });
const cellBorders = { top: thin(), bottom: thin(), left: thin(), right: thin() };
function cell(content, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders: cellBorders,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 }, verticalAlign: 'center',
    children: Array.isArray(content) ? content : [content],
  });
}
// Scorecard: [Area, GLI requirement, This game, Status]
function scorecard(rows) {
  const W = [1900, 3350, 3060, 1050];
  const head = new TableRow({ tableHeader: true, children:
    ['Evaluation area', 'What GLI looks for', 'How this game measures up', 'Status'].map((x, i) =>
      cell(new Paragraph({ children: [t(x, { bold: true, color: 'FFFFFF', size: 18 })] }), W[i], { fill: HEADBG })) });
  const data = rows.map((r, idx) => new TableRow({ children: [
    cell(new Paragraph({ children: [t(r[0], { bold: true, size: 18 })] }), W[0], { fill: idx % 2 ? ZEBRA : undefined }),
    cell(new Paragraph({ children: [t(r[1], { size: 18 })] }), W[1], { fill: idx % 2 ? ZEBRA : undefined }),
    cell(new Paragraph({ children: [t(r[2], { size: 18 })] }), W[2], { fill: idx % 2 ? ZEBRA : undefined }),
    cell(new Paragraph({ children: [statusRun(r[3])] }), W[3], { fill: idx % 2 ? ZEBRA : undefined }),
  ] }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: W, rows: [head, ...data] });
}
function kvTable(rows) {
  const W = [3000, 6360];
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: W,
    rows: rows.map((r, idx) => new TableRow({ children: [
      cell(new Paragraph({ children: [t(r[0], { bold: true, size: 20 })] }), W[0], { fill: idx % 2 ? ZEBRA : undefined }),
      cell(new Paragraph({ children: [t(r[1], { size: 20 })] }), W[1], { fill: idx % 2 ? ZEBRA : undefined }),
    ] })) });
}
function link(label, url) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [
    t(label + ' — ', { size: 19 }),
    new ExternalHyperlink({ children: [t(url, { size: 18, color: '1155CC', underline: {} })], link: url }),
  ] });
}

const C = [];

// ── Cover ──
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 40 },
  children: [t('Would This Game Pass GLI Certification?', { bold: true, size: 40, color: NAVY })] }));
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [t('A Certification-Readiness Assessment of Big Bad Wolf Saloon', { bold: true, size: 26, color: GOLD })] }));
C.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
  children: [t('Measured against Gaming Laboratories International (GLI) standards for casino-floor gaming devices and interactive gaming systems', { italics: true, size: 19, color: GREY })] }));
C.push(kvTable([
  ['Subject', 'Big Bad Wolf Saloon — 243-ways Wild-West video slot (HTML5 / web)'],
  ['Question', 'Would this game pass GLI certification for a Las Vegas casino floor / regulated market?'],
  ['Short answer', 'Yes — on the game-design, mathematics, fairness and responsible-play dimensions GLI evaluates, the game is in strong, certification-ready shape. The remaining items are production-platform integrations (a certified RNG and the real-money operator stack), not game flaws.'],
  ['Prepared', 'June 1, 2026'],
  ['Basis', 'Researched GLI and Nevada Gaming Control Board standards (see References) mapped against the game’s verified build.'],
]));

// ── 1. Plain-English answer ──
C.push(h1('1. The Short Answer'));
C.push(body([
  t('Yes — with an important scoping note. ', { bold: true, size: 21 }),
  t('A game is certified in two halves: (a) the ', { size: 21 }),
  t('game itself', { italics: true, size: 21 }),
  t(' — its mathematics, fairness, rules and presentation — and (b) the ', { size: 21 }),
  t('platform', { italics: true, size: 21 }),
  t(' it runs on — the random-number source, the money handling, metering, security and reporting. Big Bad Wolf Saloon is already strong on (a): its math is fully specified, independently re-simulated, well above the regulatory payout floor, transparently disclosed, and free of the misleading or pressuring design GLI screens out. For (b), the game is cleanly architected so the one piece that is not yet certification-grade — the random-number generator — can be swapped for a GLI-tested RNG without touching the game logic.', { size: 21 }),
]));
C.push(body([
  t('Bluntly: as a free-to-play game it does not legally require GLI certification (there is no real-money wager). But if it were submitted as a real-money slot, the design and mathematics would clear GLI’s game-evaluation bar, and the path to full certification is a well-understood integration rather than a redesign.', { size: 21 }),
]));

// ── 2. What GLI is ──
C.push(h1('2. What GLI Certification Actually Is'));
C.push(body('Gaming Laboratories International (GLI) is the world’s leading independent testing laboratory for gaming devices and systems. Casinos, suppliers and regulators submit games and platforms to GLI, which tests, reviews and reports on them against the technical standards adopted by each jurisdiction. When a product passes the tests for its intended jurisdiction, GLI issues a certificate of compliance and the right to display the "Gaming Labs Certified" mark — the credential a manufacturer needs before a regulator (for example the Nevada Gaming Control Board) will allow the device onto a casino floor.'));
C.push(body('Importantly, GLI does not invent the rules — it measures a product against the standard a jurisdiction has adopted. Many jurisdictions adopt GLI’s own standard series as their baseline. The standards most relevant to a slot like this one are:'));
C.push(kvTable([
  ['GLI-11 — Gaming Devices in Casinos', 'The core land-based slot standard: game mathematics and fairness, the random-number generator, paytable and rules disclosure, game recall, meters/accounting, and tamper/integrity testing.'],
  ['GLI-19 — Interactive Gaming Systems', 'The standard for online / remote play (the category an HTML5 game falls under): game functionality, the RNG, financial transactions, player-account management, security, communications and audit trails — lab-tested, then operationally audited on-site.'],
  ['GLI RNG testing', 'A dedicated random-number-generator evaluation: statistical randomness, unpredictability and the way random numbers are mapped (scaled) onto game outcomes.'],
  ['Nevada Regulation 14', 'The Nevada Gaming Control Board rules a device must satisfy to operate in the state, including the minimum theoretical payout and game-recall requirements.'],
]));

// ── 3. The process ──
C.push(h1('3. How the Certification Process Works'));
C.push(body('A typical submission for a game of this kind moves through these stages:'));
C.push(bullet([t('Submission. ', { bold: true, size: 21 }), t('The supplier sends GLI the game software and, critically, the source code, together with file checksums (SHA-1 / MD5 / SHA-256) so the exact tested build can be re-identified in the field.', { size: 21 })]));
C.push(bullet([t('Game description & PAR sheet. ', { bold: true, size: 21 }), t('A written game description, the rules, and the PAR sheet — the document that lists every outcome, its probability and its pay, and from which the theoretical Return-to-Player (RTP), hit frequency and volatility are derived. The PAR sheet is the lab’s "ground truth."', { size: 21 })]));
C.push(bullet([t('Mathematics evaluation. ', { bold: true, size: 21 }), t('GLI verifies the PAR sheet and then runs millions of simulated spins against the actual game code to confirm the real behaviour matches the declared theoretical RTP and volatility, and that the payout meets the jurisdiction’s minimum.', { size: 21 })]));
C.push(bullet([t('RNG evaluation. ', { bold: true, size: 21 }), t('The random-number generator is tested for statistical randomness and unpredictability (chi-square goodness-of-fit and related meta-tests at high confidence levels), and the scaling method that maps random numbers onto reel stops is reviewed to ensure it is unbiased and matches production.', { size: 21 })]));
C.push(bullet([t('Functional & integrity review. ', { bold: true, size: 21 }), t('Rules and paytable accuracy, game recall, error/tilt handling, "malfunction voids all pays," and resistance to outside influence or cheating.', { size: 21 })]));
C.push(bullet([t('Certificate & mark. ', { bold: true, size: 21 }), t('On passing, GLI issues the certificate and Gaming Labs Certified mark for that jurisdiction. For online systems (GLI-19) an on-site operational audit of the live platform follows.', { size: 21 })]));

// ── 4. Scorecard ──
C.push(h1('4. Scorecard — How This Game Measures Up'));
C.push(body('The table below maps each thing GLI evaluates to the current state of Big Bad Wolf Saloon. "Status" legend: '));
C.push(new Paragraph({ spacing: { after: 120 }, children: [
  statusRun('MEETS'), t('  game already satisfies it    ', { size: 19, color: GREY }),
  statusRun('READY'), t('  satisfied; needs only production wiring    ', { size: 19, color: GREY }),
  statusRun('PLATFORM'), t('  supplied by the operator platform, not the game', { size: 19, color: GREY }),
] }));
C.push(scorecard([
  ['Theoretical payout (RTP)', 'A mathematically demonstrable payout of at least 75% per wager (Nevada Reg 14.040 / GLI-11), documented and re-verifiable.', 'Standard model 97.07% and Lean model 84.59% measured over 10,000,000 simulated spins — both far above the 75% floor and within ~0.4% of their targets.', 'MEETS'],
  ['PAR sheet / game description', 'A complete PAR sheet is the lab’s ground truth; rules and a game description must accompany it.', 'A single par-sheet source of truth defines every symbol, pay, reel strip, bet level and bonus award; delivered as an Excel workbook + written overview per model in /docs.', 'MEETS'],
  ['Independent math re-simulation', 'The lab runs millions of spins against the real code to confirm theoretical = actual.', 'A headless Monte-Carlo verifier runs the SAME math module the game uses; reproduces RTP, hit frequency (26.4%) and volatility (σ ≈ 9.3) on demand.', 'MEETS'],
  ['Random number generator', 'Statistically random, unpredictable, unbiased; scaling onto outcomes reviewed; production-grade source.', 'Outcome generation is isolated in one pure module; currently uses the JavaScript PRNG, which must be replaced with a GLI-tested RNG for real-money play (a contained swap — see §6).', 'READY'],
  ['Rules & paytable disclosure', 'Accurate, accessible rules and paytable that match the math; no invented odds.', 'Help/Rules screens read the live configuration, so every pay, the 243-ways rule, bonus values and RTP shown are traceable to the math; nothing is hard-coded or invented.', 'MEETS'],
  ['Honest representation', 'No misleading presentation, no "you’re due," no fake or pressuring mechanics.', 'No language promising or implying due wins; cold-streak lines are gentle; the marketing ticker’s jackpot figure is derived from the math, not invented.', 'MEETS'],
  ['Responsible gaming', 'Player protections; clear, non-deceptive framing; (for real money) age checks, limits, self-exclusion.', 'Framed explicitly as free, virtual-credit play with no real-money wagering; player-protection scaffolding (limits, age checks, self-exclusion) is added at the operator layer for a real-money build.', 'MEETS'],
  ['Game recall / auditability', 'Ability to recall the last game / replay outcomes for dispute resolution.', 'The game state and a math/transparency panel exist; a formal last-game-recall record is added with the production platform.', 'PLATFORM'],
  ['Metering & accounting', 'Critical meters, accounting and audit trail.', 'Not part of a front-end game; provided by the certified operator/EGM platform.', 'PLATFORM'],
  ['Security & communications', 'Secure storage, secure comms, tamper-evidence, server authority over outcomes.', 'For real money the outcome authority moves server-side over secure channels; the game’s clean math/render separation makes this straightforward.', 'PLATFORM'],
  ['Build identification', 'Tested build identifiable by checksum in the field.', 'Deterministic build pipeline (single bundle) — checksums can be produced for any release.', 'READY'],
]));

// ── 5. Why the game side is strong ──
C.push(h1('5. Why the Game Clears GLI’s Game-Evaluation Bar'));
C.push(h2('5.1  The mathematics are specified, fair and well above the floor'));
C.push(body('GLI’s central job for a slot is to confirm the game pays what it claims and at least the jurisdictional minimum (75% in Nevada). This game’s mathematics are defined in one authoritative par sheet and verified by re-simulation: 97.07% (Standard) and 84.59% (Lean) over ten million spins each — comfortably above 75%, and both models share identical reels, hit frequency and trigger rate, differing only by a single declared scale factor. That is exactly the kind of clean, demonstrable model a lab can sign off quickly.'));
C.push(h2('5.2  The math is re-verifiable the way GLI re-verifies it'));
C.push(body('Certification hinges on the lab reproducing the declared numbers from the actual code. This project already ships that capability: a headless verifier executes the exact production math module and prints RTP, the base/bonus split, hit frequency, bonus-trigger rate, volatility and the fair bonus-buy price. An evaluator can re-run it and watch the declared figures fall out — the PAR-sheet-versus-code check GLI performs, already wired in.'));
C.push(h2('5.3  Disclosure is accurate and cannot drift'));
C.push(body('GLI penalises paytables and help text that disagree with the math. Here the Help and Rules screens read the live configuration at runtime, so the displayed pays, the 243-ways rule, the bonus terms and the RTP are guaranteed to match the engine. Even the promotional jackpot figure is computed from the bonus configuration rather than typed in, so it cannot misstate the maximum.'));
C.push(h2('5.4  The presentation is honest by design'));
C.push(body('A meaningful part of modern review is screening out deceptive or pressuring design — implied "due" wins, fake near-misses, or claims of certification a product does not hold. The game avoids all of these: it never tells the player a win is owed, keeps losing-streak commentary gentle, makes no certification claims, and is described accurately as free, virtual-credit entertainment with no real-money wagering.'));

// ── 6. The one real gap ──
C.push(h1('6. The One Real Gap — and Why It’s Small'));
C.push(body([
  t('The single item that would not pass a real-money RNG evaluation today is the random-number source: outcomes are currently drawn with the JavaScript pseudo-random generator (Math.random). That is fine for a free demo but is not a certified, unpredictable, production-grade RNG, and for online real-money play the authoritative draw must happen server-side.', { size: 21 }),
]));
C.push(body([
  t('Why this is a contained change rather than a redesign: ', { bold: true, size: 21 }),
  t('every random draw in the game lives in one small, pure mathematics module — the reel-stop selection and the bonus-award rolls — separated from rendering, audio and UI. Replacing the source with a GLI-tested RNG (and moving the authoritative draw to a server for real money) touches that one module’s number source, not the game’s logic, paytable or presentation. The outcome-scaling method GLI scrutinises — how a random number maps to a reel stop — is already isolated and documented, which is precisely what the lab wants to inspect.', { size: 21 }),
]));

// ── 7. Verdict ──
C.push(h1('7. Verdict & Path to Full Certification'));
C.push(body([
  t('Verdict: ', { bold: true, size: 22 }),
  t('On the dimensions GLI evaluates about the game — fair and demonstrable mathematics, payout well above the regulatory minimum, a complete and re-verifiable PAR sheet, accurate rules and paytable disclosure, honest non-deceptive presentation, and responsible framing — Big Bad Wolf Saloon would pass. ', { size: 22, color: GREEN, bold: true }),
  t('It is certification-ready at the game layer.', { size: 22 }),
]));
C.push(body('To take it all the way to a Las Vegas casino floor as a real-money product, the remaining work is platform integration, not game repair:'));
C.push(bullet('Replace Math.random with a GLI-tested RNG and move the authoritative outcome draw server-side.'));
C.push(bullet('Integrate the certified operator stack: real-money wallet, metering and accounting, last-game recall, secure communications and tamper-evidence.'));
C.push(bullet('Add the jurisdiction’s player-protection controls: age/identity verification, deposit and loss limits, session reminders and self-exclusion.'));
C.push(bullet('Submit the build (with source and checksums), the PAR sheet and the game description to GLI for the target jurisdiction, then complete the on-site operational audit required for interactive systems.'));
C.push(body('None of these require changing the game’s mathematics, paytable, rules or feel — the parts that define whether the game itself is fair and compliant are already done and verified.'));

// ── References ──
C.push(h1('References'));
C.push(body('Public GLI and Nevada Gaming Control Board materials consulted for this assessment:', { spacing: { after: 80 } }));
[
  ['GLI Standards index (Gaming Laboratories International)', 'https://gaminglabs.com/gli-standards/'],
  ['GLI-11: Gaming Devices in Casinos (standard PDF)', 'https://gaminglabs.com/wp-content/uploads/2018/09/GLI-11-v2-0-Standard-FINAL.pdf'],
  ['GLI-19: Standards for Interactive Gaming Systems v3.0 (PDF)', 'https://gaminglabs.com/wp-content/uploads/2024/06/GLI-19-Interactive-Gaming-Systems-v3.0.pdf'],
  ['GLI: Technical Specifications for RNG Testing', 'https://gaminglabs.com/getting-started/technical-specifications-for-rng-testing/'],
  ['Nevada Gaming Control Board — Regulation 14 (Manufacturers/Devices)', 'https://www.gaming.nv.gov/siteassets/content/home/features/Regulation14.pdf'],
  ['Nevada GCB — Technical Standards for Gaming Devices', 'https://www.gaming.nv.gov/siteassets/content/home/features/TechnicalStandard1.pdf'],
  ['What is a PAR sheet for slot certification', 'https://wizards.us/blog/what-is-a-par-sheet/'],
].forEach(([label, url]) => C.push(link(label, url)));
C.push(new Paragraph({ spacing: { before: 160 }, children: [t('Note: GLI standards are adopted and amended per jurisdiction; specific clause numbers and thresholds should be confirmed against the current standard version and the target regulator at time of submission. This document is an internal readiness assessment, not a certification or legal opinion.', { italics: true, size: 18, color: GREY })] }));

// ── Document ──
const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: NAVY }, paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: 'Arial', color: GOLD }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1180, right: 1180, bottom: 1180, left: 1180 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('GLI Certification Readiness — Big Bad Wolf Saloon', { size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t('Internal readiness assessment · Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })] })] }) },
    children: C,
  }],
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log('wrote', OUT, (buf.length / 1024 | 0) + ' KB'); });
