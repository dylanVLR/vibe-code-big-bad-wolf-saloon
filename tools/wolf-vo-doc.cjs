/*
 * Generate the human-readable Wolf Voiceover review document (docs/*.docx) from
 * the single source of truth in src/audio/phrases.js. Re-run after editing lines.
 *
 *   npm install docx          # one-time (not a project dependency)
 *   node tools/wolf-vo-doc.cjs
 *
 * Keep the GROUPS map below in sync when you add a new phrase pool.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle, PageNumber, Footer;
try {
  ({ Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle, PageNumber, Footer } = require('docx'));
} catch (e) {
  console.error('Missing the "docx" package. Run:  npm install docx'); process.exit(1);
}

// load the phrase pack from the ESM source (one source of truth)
const PHRASES = JSON.parse(execSync(
  'node --input-type=module -e "import {PHRASES} from \'./src/audio/phrases.js\'; process.stdout.write(JSON.stringify(PHRASES))"',
  { cwd: ROOT }).toString());
const OUT = path.join(ROOT, 'docs', 'Big_Bad_Wolf_Saloon_Wolf_Voiceover_Script.docx');

// group → [ [category, "trigger description"] ]
const GROUPS = [
  ['Session start & spinning', [
    ['firstSpin', 'The very first spin of a session'],
    ['spin', 'Occasionally as a spin begins (rare — about 1 in 8 spins, and only after a quiet beat)'],
  ]],
  ['When the player pauses (idle)', [
    ['idle', 'The player hasn’t spun in a while (first line ~12s, then progressively less often)'],
    ['ambient', 'General saloon ambience during idle'],
    ['idleAfterWin', 'Idle shortly after a win'],
    ['idleAfterLoss', 'Idle shortly after a non-winning spin'],
    ['richIdle', 'Idle while sitting on a big balance ($2,500+)'],
  ]],
  ['Wins', [
    ['smallWin', 'A small win — under 5× the bet (played sparingly)'],
    ['mediumWin', 'A medium win — 5× to 20× the bet'],
    ['bigWin', 'A big or huge win — 20×+ the bet'],
    ['postWin', 'A follow-up remark a few seconds after a big win'],
  ]],
  ['Win streaks', [
    ['twoWinStreak', 'Two winning spins in a row'],
    ['threeWinStreak', 'Three winning spins in a row'],
    ['hotStreak', 'Four or more winning spins in a row'],
    ['winStreak', 'Generic streak remark (legacy pool)'],
    ['streakEnded', 'A 3+ win streak ends on a non-winning spin'],
  ]],
  ['Non-winning spins (kept gentle — never pressures the player)', [
    ['loss', 'An occasional non-winning spin'],
    ['lossStreak', 'Several non-winning spins (legacy pool)'],
    ['coldStreak', 'Five or more non-winning spins — gentle and rare; never implies a win is “due”'],
  ]],
  ['Suspense & special reels', [
    ['anticipation', 'Reels 4–5 slow down in suspense'],
    ['extremeAnticipation', 'Extreme suspense — a 6th hard hat could trigger the bonus'],
    ['nearMiss', 'A near-miss pattern'],
    ['expandingReels', 'A Wolf Wild expands to fill a reel'],
  ]],
  ['Symbols on the reels (only ever played when the symbol is actually visible)', [
    ['symShotGlass', 'A single shot glass is showing'],
    ['symShotGlassMulti', 'Two or more shot glasses showing'],
    ['symHorseshoe', 'A single lucky horseshoe showing'],
    ['symHorseshoeMulti', 'Two or more horseshoes showing'],
    ['symHats', 'Several hard hats showing (building toward the 6-hat bonus)'],
  ]],
  ['Bonus — Hard-Hat Free Spins', [
    ['bonusTrigger', 'The bonus triggers (6+ hard hats land)'],
    ['bonusEnter', 'The bonus screen opens'],
    ['bonusSpin', 'Occasionally during a bonus free spin'],
    ['freeSpin', 'Each free spin (legacy pool)'],
    ['frameUpgrade', 'A straw or stick house is built / upgraded'],
    ['brickAchieved', 'A brick house is achieved'],
    ['wolfReveal', 'The wolf appears to blow the houses down'],
    ['wolfStraw', 'Blowing down a straw house'],
    ['wolfStick', 'Blowing down a stick house'],
    ['wolfBrick', 'Blowing down a brick house'],
    ['retrigger', 'The bonus retriggers (more free spins)'],
    ['miniJackpot', 'A mini / minor jackpot during the bonus'],
    ['mansionJackpot', 'The Mansion Jackpot (3+ brick houses)'],
    ['bonusWin', 'A win during the bonus'],
    ['bonusBigWin', 'A big win during the bonus'],
    ['bonusComplete', 'The bonus completes (legacy pool)'],
    ['bonusEnd', 'The bonus round ends'],
  ]],
  ['Betting & balance', [
    ['betUp', 'Raising the bet'],
    ['betDown', 'Lowering the bet'],
    ['maxBet', 'Raising the bet to the maximum level'],
    ['lowBalance', 'Balance running low'],
    ['noFunds', 'Not enough funds to spin'],
  ]],
  ['Interactive — clickable hotspots & hover', [
    ['saloonHeader', 'Clicking the “BIG BAD WOLF SALOON” sign'],
    ['vlrMedallion', 'Clicking the “Vegas Low Roller Approved” medallion (first click is always the signature line)'],
    ['sheriffBadge', 'Clicking the sheriff’s star badge (first click is always the signature line)'],
    ['spinHover', 'Mouse hovering over the SPIN button for 3+ seconds without clicking (desktop only)'],
    ['buyBonus', 'Opening the Buy Bonus window'],
    ['menuReturn', 'Returning from the paytable'],
  ]],
  ['Friendly roasts — DISABLED by default', [
    ['roasts', 'Tongue-in-cheek nods to the “other” huff-and-puff game. OFF by default; enable only if you want them.'],
  ]],
];

// sanity: catch any category not placed in a group
const placed = new Set(GROUPS.flatMap(g => g[1].map(i => i[0])));
const missing = Object.keys(PHRASES).filter(c => !placed.has(c));
if (missing.length) GROUPS.push(['Other', missing.map(c => [c, '(unspecified trigger)'])]);

const NAVY = '1A3A1F', GOLD = '8A6D1A', GREY = '666666', RED = '9B2D2D';
const children = [];

// ── Title block ──
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
  children: [new TextRun({ text: 'BIG BAD WOLF SALOON', bold: true, size: 40, color: NAVY })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
  children: [new TextRun({ text: 'Wolf Voiceover Script — for review & approval', size: 26, color: GOLD, bold: true })] }));
const total = Object.values(PHRASES).reduce((s, a) => s + a.length, 0);
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 6 } },
  children: [new TextRun({ text: `${Object.keys(PHRASES).length} situations · ${total} recorded lines · voice: “Callum-husky” (ElevenLabs)`, size: 18, color: GREY, italics: true })] }));

// ── Intro ──
children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({
  text: 'Every line below is pre-recorded in the Big Bad Wolf’s voice. During play the game chooses a line based on what is actually happening — the visible symbols, the size of a win, win/loss streaks, whether you are in the bonus, how long you have sat idle, and so on. The wolf never talks over himself, respects cooldowns so he is lively rather than annoying, and lets the big moments interrupt idle chatter.', size: 22 })] }));
children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Responsible play', bold: true, size: 22, color: RED })] }));
children.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({
  text: 'No line promises a win, says a win is “due”, or pressures the player to keep betting. Cold-streak lines are gentle and infrequent.', size: 22 })] }));
children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({
  text: 'How to read this: each heading is a situation that makes the wolf talk, followed by every line he might say in that situation (one is picked at random, avoiding recent repeats).', size: 20, italics: true, color: GREY })] }));

// ── Groups ──
let numRef = 0;
const numbering = { config: [] };
for (const [groupTitle, items] of GROUPS) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: groupTitle, bold: true, color: NAVY })] }));
  for (const [cat, trigger] of items) {
    const lines = PHRASES[cat] || [];
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 40 },
      children: [
        new TextRun({ text: trigger, bold: true, size: 24, color: GOLD }),
        new TextRun({ text: `   (${cat} · ${lines.length})`, size: 16, color: GREY }),
      ] }));
    const ref = `n${numRef++}`;
    numbering.config.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 520, hanging: 300 } } } }] });
    for (const line of lines) {
      children.push(new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 20 },
        children: [new TextRun({ text: line, size: 22 })] }));
    }
  }
}

const doc = new Document({
  numbering,
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: NAVY },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 160, after: 40 }, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Big Bad Wolf Saloon — Wolf Voiceover Script   ·   Page ', size: 16, color: GREY }),
                 new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log('wrote', OUT, (buf.length/1024|0)+' KB'); });
