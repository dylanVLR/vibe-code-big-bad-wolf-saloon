/*
 * Generate docs/Adaptive_Soundtrack_Guide.pdf — a reviewer-facing cue sheet for
 * the adaptive music score: every track, what triggers it, and how the reactive
 * "heat" system blends them. Mirrors the Wolf Voiceover Script in spirit.
 *
 *   NODE_PATH=/tmp/wolfdoc/node_modules node tools/soundtrack-doc.cjs
 *
 * Self-contained (no .docx source): builds HTML with the shared corporate brand
 * template and prints to PDF via the installed Google Chrome (puppeteer-core).
 * Source of truth for the numbers: src/audio/conductor.js + sound.js + tools/music.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const BRAND = {
  green: '#173E27', greenSoft: '#1E5631', gold: '#A9842B', goldSoft: '#C9A24B',
  ink: '#1A1D1A', muted: '#5B6660', hair: '#E2E6E2', panel: '#F6F8F6', headRow: '#173E27',
};

// ── The track library (matches tools/music.js + the engine) ──
const TRACKS = [
  { name: 'Day Bed',        file: 'bgm_base_day.mp3',    ctx: 'Base · bed',     len: '40s', kt: 'A min · ~92',
    char: 'Warm, sunlit, hopeful frontier morning — fingerpicked guitar, soft banjo, harmonica, light strings. Low-to-mid energy.' },
  { name: 'Night Bed',      file: 'bgm_base_night.mp3',  ctx: 'Base · bed',     len: '40s', kt: 'A min · ~92',
    char: 'Sparse, moonlit and lonesome — slide guitar, low strings, distant harmonica and a faint wolf howl. A touch of menace.' },
  { name: 'Base Energy',    file: 'bgm_base_energy.mp3', ctx: 'Base · layer',   len: '32s', kt: 'A min · 92',
    char: 'Additive percussion layer — galloping banjo, stomps & claps, toms, brass stabs. Fades IN on top of the bed as heat rises.' },
  { name: 'Bonus Theme A',  file: 'bgm_bonus_a.mp3',     ctx: 'Bonus · bed',    len: '48s', kt: 'A min · 120',
    char: 'Epic, triumphant Western adventure — heroic brass, galloping fiddle & banjo, big drums. Track 1 of the bonus playlist.' },
  { name: 'Bonus Theme B',  file: 'bgm_bonus_b.mp3',     ctx: 'Bonus · bed',    len: '48s', kt: 'A min · 120',
    char: 'A bolder hoedown-meets-orchestra variation that crossfades with A so the bonus reads as a playlist, not one loop.' },
  { name: 'Bonus Energy',   file: 'bgm_bonus_energy.mp3',ctx: 'Bonus · layer',  len: '32s', kt: 'A min · 120',
    char: 'Peak-excitement overlay — war-drum toms, galloping snare, stabbing brass. Sits on the bonus bed; always has a floor.' },
];

// ── Reactive triggers — the "heat" map (matches conductor.js + sound.js) ──
const TRIGGERS = [
  ['Fast / repeated spinning', 'Heat &uarr; &rarr; the energy layer swells in and (desktop) the tempo leans forward up to +8%.'],
  ['A win lands', 'Heat &uarr;, scaled by size: a small win nudges it, a big win spikes it.'],
  ['Win streak (3+ in a row)', 'A rising stinger ladder &mdash; each consecutive win plays a pip a step higher in pitch.'],
  ['A really big win (25&times;+)', 'The wolf-howl motif punctuates the moment over the music.'],
  ['Near-miss / bonus anticipation', 'A tension riser swells under the reels as they slow.'],
  ['Bonus enter / exit', 'Crossfade to the bonus playlist (and back). The bonus keeps an energetic floor so it always feels big.'],
  ['Time-of-day slider', 'The base bed crossfades Day &harr; Night as it crosses dusk/dawn.'],
  ['Player adds credit', 'A short celebratory deposit flourish + a touch of heat.'],
  ['Player idles', 'Heat decays steadily &mdash; the energy layer melts away and the score relaxes back to the bed.'],
];

// ── Musical stingers fired over the bed ──
const STINGERS = [
  ['Streak step', 'streak_step.mp3', 'Each win from the 3rd in a row; pitch climbs with the streak length.'],
  ['Big-win howl', 'wolf_howl.mp3', 'A 25&times;+ win &mdash; the wolf howls.'],
  ['Deposit flourish', 'deposit_flourish.mp3', 'Player adds credit.'],
  ['Tension riser', 'music_riser.mp3', 'Reel anticipation / near-miss.'],
];

const CSS = `
  @page { size: Letter; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:${BRAND.ink};
    font-size:10.5pt; line-height:1.5; margin:0; background:#FFF; }
  h1, h2, h3 { font-family:'Source Serif 4',Georgia,'Times New Roman',serif; font-weight:600; }
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
  main { padding-top:4px; }
  main h1 { font-size:17pt; color:${BRAND.green}; margin:24px 0 6px; padding-bottom:6px;
    border-bottom:2px solid ${BRAND.hair}; }
  main h1:first-child { margin-top:0; }
  p { margin:0 0 9px; }
  .lead { color:${BRAND.muted}; font-size:9.5pt; margin:0 0 8px; }
  h1, h2, h3 { page-break-after:avoid; }
  table { width:100%; border-collapse:collapse; margin:8px 0 16px; font-size:9.4pt; page-break-inside:auto; }
  tr { page-break-inside:avoid; }
  th, td { border:1px solid ${BRAND.hair}; padding:7px 9px; text-align:left; vertical-align:top; }
  thead th { background:${BRAND.headRow}; color:#FFF; font-weight:600; font-size:8.4pt;
    letter-spacing:0.4px; text-transform:uppercase; border-color:${BRAND.greenSoft}; }
  tbody tr:nth-child(even) { background:${BRAND.panel}; }
  td.name { font-weight:700; color:${BRAND.green}; white-space:nowrap; }
  td.mono, .mono { font-family:'SFMono-Regular',Menlo,Consolas,monospace; font-size:8.6pt; color:${BRAND.muted}; }
  td.ctx { white-space:nowrap; }
  .note { border:1px solid ${BRAND.hair}; border-left:4px solid ${BRAND.gold}; background:${BRAND.panel};
    border-radius:4px; padding:10px 14px; font-size:9.3pt; color:${BRAND.ink}; margin:12px 0 0; }
  .note b { color:${BRAND.green}; }
  ul { margin:0 0 10px; padding-left:18px; } li { margin:0 0 5px; }
`;

function body() {
  const trackRows = TRACKS.map(t =>
    `<tr><td class="name">${t.name}</td><td class="ctx">${t.ctx}</td><td>${t.len}</td><td>${t.kt}</td>` +
    `<td>${t.char}</td><td class="mono">${t.file}</td></tr>`).join('');
  const trigRows = TRIGGERS.map(([s, r]) => `<tr><td class="name">${s}</td><td>${r}</td></tr>`).join('');
  const stingRows = STINGERS.map(([n, f, w]) =>
    `<tr><td class="name">${n}</td><td>${w}</td><td class="mono">${f}</td></tr>`).join('');

  return `
  <h1>The Idea</h1>
  <p>The score is <b>adaptive</b> &mdash; a small "Conductor" stays aware of what's happening and shapes the music to
  match, the same way the wolf's voice reacts to the game. Instead of one song looping (or starting and stopping), a
  continuous bed plays underneath while extra layers <b>fade in and out</b> and the tempo gently leans forward as the
  player heats up. The only hard cuts are deliberate crossfades at big moments (day&rarr;night, base&rarr;bonus).</p>
  <p class="lead">Everything is in one musical family &mdash; base cues in <b>A minor around 92&nbsp;BPM</b>, bonus cues in
  <b>A minor around 120&nbsp;BPM</b> &mdash; so any two cues blend cleanly. Generated with ElevenLabs Music.</p>

  <h1>The Track Library</h1>
  <p class="lead">Six cues: two swappable base beds, a base energy layer, a two-track bonus playlist, and a bonus
  energy layer.</p>
  <table><thead><tr><th>Track</th><th>Role</th><th>Loop</th><th>Key&nbsp;&middot;&nbsp;BPM</th><th>Character</th><th>File</th></tr></thead>
  <tbody>${trackRows}</tbody></table>

  <h1>What Triggers What &mdash; the "Heat" System</h1>
  <p>A single hidden <b>heat</b> value (0&rarr;1) rises with action and decays when the player idles. The Conductor pushes
  it to the music several times a second, so the energy layer and tempo follow the moment smoothly rather than in jumps.</p>
  <table><thead><tr><th>When this happens&hellip;</th><th>&hellip;the music does this</th></tr></thead>
  <tbody>${trigRows}</tbody></table>

  <h1>Musical Stingers</h1>
  <p class="lead">Short one-shots the Conductor fires <i>over</i> the bed on specific events (these don't loop).</p>
  <table><thead><tr><th>Stinger</th><th>Fires when</th><th>File</th></tr></thead>
  <tbody>${stingRows}</tbody></table>

  <h1>How the Blend Works</h1>
  <ul>
    <li><b>Beds are continuous</b> &mdash; the base bed (or bonus bed) never stops; we add and remove layers on top of it.</li>
    <li><b>Energy layers are additive</b> &mdash; percussion-forward, mixed gently, swelling in with heat and melting out when it cools.</li>
    <li><b>Crossfades only at context changes</b> &mdash; day&harr;night and base&harr;bonus dissolve smoothly; nothing else hard-cuts.</li>
    <li><b>Subtle dynamic tempo</b> &mdash; the score speeds up to about +8% at peak heat, pitch-preserved so it never sounds sped-up.</li>
    <li><b>The bonus is a mini-playlist</b> &mdash; Theme&nbsp;A and Theme&nbsp;B trade off so a long bonus never feels like one loop.</li>
  </ul>

  <div class="note"><b>Desktop vs. mobile.</b> Phones run a deliberately lighter mix &mdash; beds, the energy layer and all
  crossfades still play, but dynamic tempo is off (iOS time-stretch is poor) and the bonus A/B swap is skipped, to keep
  playback smooth.</div>

  <div class="note"><b>Tuning.</b> Reactivity is a single knob. In a dev build, <span class="mono">window.__score.gain(0.6)</span>
  calms it and <span class="mono">gain(1.4)</span> makes it punchier; <span class="mono">window.__score.heat()</span> shows the
  live value. Heat decay, the energy ceiling and the tempo range are all single constants in <span class="mono">src/audio</span>.</div>
  `;
}

function html() {
  const stamp = new Date().toISOString().slice(0, 10);
  const meta = [
    ['Document', 'Adaptive Soundtrack Guide'],
    ['Project', 'Big Bad Wolf Saloon'],
    ['Type', 'Music cue sheet &amp; review'],
    ['Date', stamp],
  ].map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">
  <style>${CSS}</style></head><body>
  <section class="cover">
    <div class="bar"></div>
    <div class="brandline">Big Bad Wolf Saloon</div>
    <div class="spacer"></div>
    <h1 class="title">Adaptive Soundtrack Guide</h1>
    <div class="subtitle">Big Bad Wolf Saloon — Wild-West Video Slot</div>
    <div class="rule"></div>
    <div class="meta">${meta}</div>
    <div class="spacer"></div>
    <div class="foot">Confidential &mdash; prepared for internal review and client hand-off. &copy; Big Bad Wolf Saloon.</div>
    <div class="bar" style="border-bottom:none;border-top:3px solid ${BRAND.gold};"></div>
  </section>
  <main>${body()}</main>
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
  await page.setContent(html(), { waitUntil: 'networkidle0', timeout: 60000 });
  const out = path.join(DOCS, 'Adaptive_Soundtrack_Guide.pdf');
  await page.pdf({
    path: out, format: 'Letter', printBackground: true,
    displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: FOOTER,
    margin: { top: '0.55in', bottom: '0.7in', left: '0.7in', right: '0.7in' },
  });
  await browser.close();
  console.log(`  ✓ Adaptive_Soundtrack_Guide.pdf  (${(fs.statSync(out).size / 1024 | 0)} KB)`);
}
main().catch(e => { console.error(e); process.exit(1); });
