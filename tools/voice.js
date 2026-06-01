/**
 * ElevenLabs voice generator for the BIG BAD WOLF narrator.
 *
 *   node tools/voice.js samples              # one sample line per candidate voice
 *                                            #   → assets/audio/samples/<name>.mp3
 *   node tools/voice.js all <voiceId>        # (re)generate every narrator clip
 *                                            #   → assets/audio/narrator/<cat>_<i>.mp3
 *   node tools/voice.js one <voiceId> spin 0 # regenerate a single clip (debug)
 *
 * Reads ELEVENLABS_API_KEY from ../.env. Pulls the script from ../js/phrases.js,
 * so the audio always matches what the game says. Wipes the narrator folder on a
 * full `all` run so there are never orphaned clips from an old script.
 */
import { PHRASES } from '../src/audio/phrases.js';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The chosen Big Bad Wolf voice — "Callum-husky" (husky trickster). Determined
   by acoustically matching ElevenLabs candidates to the existing narrator clips
   (F0 ~111 Hz / centroid ~2126 Hz, closest to the shipped voice). Recorded here
   so the wolf always sounds the same; `sync`/`all` default to it. */
const WOLF_VOICE_ID = 'N2lVS1w4EtoT3dr4eOWO';

/* ── load the API key from .env (no dotenv dependency) ── */
function loadKey() {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY not found in .env');
  return m[1].replace(/^["']|["']$/g, '');
}
const API_KEY = loadKey();

/* ── voice + model config ──
   The Wolf wants emotion and twang, so stability is kept low-ish (more variation),
   with style nudged up. eleven_multilingual_v2 gives the richest character. */
const MODEL_ID = 'eleven_multilingual_v2';
const VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true };

/* Candidate voices to audition for "cowboy wolf" (sample mode). */
const CANDIDATES = [
  { name: 'Oliver-southern',  id: 'ziw6UOZySnd8FZKi6cLN', note: 'southern American drawl (cowboy)' },
  { name: 'Callum-husky',     id: 'N2lVS1w4EtoT3dr4eOWO', note: 'husky trickster (wolfy)' },
  { name: 'Adam-dark-tough',  id: 'IRHApOXLvnW57QJPQH2P', note: 'dark & tough (menacing wolf)' },
  { name: 'Bill-wise-mature', id: 'pqHfZKP75CvOlQylNhV4', note: 'old, grizzled, weathered' },
];

const SAMPLE_LINE =
  "Well howdy there, little piggies. I'll huff, and I'll puff, and I'll blow your house clean DOWN! Awooo!";

/* ── one TTS call → Buffer of mp3 bytes, with retries ── */
async function tts(text, voiceId, attempt = 1) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 800 * attempt));
      return tts(text, voiceId, attempt + 1);
    }
    throw e;
  }
}

/* ── run an array of async jobs with a small concurrency pool ── */
async function pool(jobs, size, onDone) {
  let i = 0, done = 0;
  async function worker() {
    while (i < jobs.length) {
      const idx = i++;
      await jobs[idx]();
      onDone(++done, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
}

/* ── modes ── */
async function genSamples() {
  const dir = join(ROOT, 'assets/audio/samples');
  mkdirSync(dir, { recursive: true });
  console.log(`Generating ${CANDIDATES.length} samples → assets/audio/samples/`);
  for (const v of CANDIDATES) {
    process.stdout.write(`  ${v.name} (${v.note})... `);
    const buf = await tts(SAMPLE_LINE, v.id);
    writeFileSync(join(dir, `${v.name}.mp3`), buf);
    console.log(`${(buf.length / 1024).toFixed(0)} KB`);
  }
  console.log('\nListen, then run:  node tools/voice.js all <voiceId>');
  console.log('Voice IDs:'); CANDIDATES.forEach(v => console.log(`  ${v.id}  ${v.name}`));
}

async function genAll(voiceId) {
  if (!voiceId) { console.error('Usage: node tools/voice.js all <voiceId>'); process.exit(1); }
  const dir = join(ROOT, 'assets/audio/narrator');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });   // no orphans
  mkdirSync(dir, { recursive: true });

  const tasks = [];
  for (const [cat, lines] of Object.entries(PHRASES))
    lines.forEach((text, i) => tasks.push({ file: `${cat}_${i}.mp3`, text }));

  console.log(`Voice ${voiceId} · model ${MODEL_ID}`);
  console.log(`Generating ${tasks.length} clips → assets/audio/narrator/\n`);
  const t0 = Date.now();
  const failures = [];
  const jobs = tasks.map(t => async () => {
    try {
      const buf = await tts(t.text, voiceId);
      writeFileSync(join(dir, t.file), buf);
    } catch (e) {
      failures.push({ file: t.file, err: e.message });
    }
  });
  await pool(jobs, 4, (done, total) => {
    if (done % 10 === 0 || done === total)
      process.stdout.write(`\r  ${done}/${total} clips (${Math.round((Date.now() - t0) / 1000)}s)   `);
  });
  console.log('\n');
  if (failures.length) {
    console.log(`⚠️  ${failures.length} failed:`);
    failures.forEach(f => console.log(`   ${f.file}: ${f.err}`));
    process.exit(1);
  }
  console.log(`✓ Done — ${tasks.length} clips in ${Math.round((Date.now() - t0) / 1000)}s`);
}

async function genOne(voiceId, cat, idx) {
  const text = PHRASES[cat]?.[idx];
  if (!text) { console.error(`No phrase ${cat}_${idx}`); process.exit(1); }
  const dir = join(ROOT, 'assets/audio/narrator');
  mkdirSync(dir, { recursive: true });
  const buf = await tts(text, voiceId);
  writeFileSync(join(dir, `${cat}_${idx}.mp3`), buf);
  console.log(`✓ ${cat}_${idx}.mp3  "${text}"`);
}

/* ── INCREMENTAL sync: generate ONLY new or changed clips ──
   Keeps a tiny text-hash cache (../.vo-cache.json, not deployed) so unchanged
   lines are never re-billed. Safe to re-run any time after editing phrases.js.
   Also prunes orphaned .mp3s whose line no longer exists. */
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

async function genSync(voiceId = WOLF_VOICE_ID) {
  const dir = join(ROOT, 'assets/audio/narrator');
  mkdirSync(dir, { recursive: true });
  const cachePath = join(ROOT, '.vo-cache.json');
  let cache = {};
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch (e) {}

  const valid = new Set();
  const tasks = [];
  for (const [cat, lines] of Object.entries(PHRASES))
    lines.forEach((text, i) => {
      const file = `${cat}_${i}.mp3`;
      valid.add(file);
      const h = sha(text);
      const onDisk = existsSync(join(dir, file));
      if (!onDisk) { tasks.push({ file, text, h }); }                 // missing → generate
      else if (cache[file] !== undefined && cache[file] !== h) {       // present + cache says text changed → regen
        tasks.push({ file, text, h });
      } else { cache[file] = h; }                                      // present (seed cache, don't re-bill)
    });

  // prune orphaned clips (renamed/removed lines)
  const orphans = readdirSync(dir).filter(f => f.endsWith('.mp3') && !valid.has(f));
  orphans.forEach(f => { rmSync(join(dir, f), { force: true }); delete cache[f]; });
  if (orphans.length) console.log(`Pruned ${orphans.length} orphaned clip(s).`);

  if (!tasks.length) { console.log('✓ Up to date — nothing new to generate.'); writeFileSync(cachePath, JSON.stringify(cache)); return; }

  console.log(`Voice ${voiceId} · model ${MODEL_ID}`);
  console.log(`Generating ${tasks.length} new/changed clip(s) → assets/audio/narrator/ (incremental)\n`);
  const t0 = Date.now();
  const failures = [];
  const jobs = tasks.map(t => async () => {
    try { writeFileSync(join(dir, t.file), await tts(t.text, voiceId)); cache[t.file] = t.h; }
    catch (e) { failures.push({ file: t.file, err: e.message }); }
  });
  await pool(jobs, 4, (done, total) => {
    if (done % 5 === 0 || done === total)
      process.stdout.write(`\r  ${done}/${total} clips (${Math.round((Date.now() - t0) / 1000)}s)   `);
  });
  writeFileSync(cachePath, JSON.stringify(cache));
  console.log('\n');
  if (failures.length) { console.log(`⚠️  ${failures.length} failed:`); failures.forEach(f => console.log(`   ${f.file}: ${f.err}`)); process.exit(1); }
  console.log(`✓ Done — ${tasks.length} clip(s) in ${Math.round((Date.now() - t0) / 1000)}s`);
}

/* ── dispatch ── */
const [mode, a, b, c] = process.argv.slice(2);
if (mode === 'samples') await genSamples();
else if (mode === 'sync') await genSync(a || WOLF_VOICE_ID);
else if (mode === 'all') await genAll(a || WOLF_VOICE_ID);
else if (mode === 'one') await genOne(a || WOLF_VOICE_ID, b, parseInt(c, 10));
else {
  console.log('Usage:');
  console.log('  node tools/voice.js samples                 # audition candidate voices');
  console.log('  node tools/voice.js sync                    # generate ONLY new/changed clips (recommended)');
  console.log('  node tools/voice.js all [voiceId]           # wipe + regenerate everything');
  console.log('  node tools/voice.js one [voiceId] <cat> <i> # regenerate a single clip');
  console.log(`  (default voice: ${WOLF_VOICE_ID} — Callum-husky)`);
}
