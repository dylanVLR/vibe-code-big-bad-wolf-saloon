/**
 * ElevenLabs Music generator for Big Bad Wolf's background score.
 *
 *   node tools/music.js              # generate BOTH tracks
 *   node tools/music.js base         # just the base-game track
 *   node tools/music.js bonus        # just the bonus track
 *
 * Reads ELEVENLABS_API_KEY from ../.env. Writes to assets/audio/music/.
 * Music generation can take ~30-90s per track — be patient.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadKey() {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY not found in .env');
  return m[1].replace(/^["']|["']$/g, '');
}
const API_KEY = loadKey();

const TRACKS = {
  base: {
    file: 'bgm_base.mp3',
    lengthMs: 120000,   // 2 min loop
    prompt:
      'A whimsical Western cinematic orchestral score, movie-soundtrack quality, fully instrumental with NO vocals. ' +
      'Warm and emotional, like a heartfelt big-budget family Western film. Gentle acoustic guitar and soft banjo ' +
      'picking, lush sweeping strings, a wistful solo violin and a touch of harmonica and tin whistle carrying a ' +
      'memorable melody. Light orchestral percussion and a steady, easygoing mid-tempo gait, evoking a golden sunset ' +
      'over the American frontier — adventurous yet cozy, hopeful and playful. Cohesive and smoothly loopable, ' +
      'never harsh, with rich cinematic depth.',
  },
  bonus: {
    file: 'bgm_bonus.mp3',
    lengthMs: 105000,   // ~1:45, builds to a climax
    prompt:
      'An epic, triumphant Hollywood blockbuster orchestral score at full power, fully instrumental with NO vocals. ' +
      'A massive cinematic crescendo: soaring heroic brass, thunderous timpani and taiko war drums, sweeping ' +
      'high-energy strings, grand cymbal swells and a relentless driving adventurous rhythm. Swashbuckling ' +
      'Pirates-of-the-Caribbean fight-song energy fused with soaring superhero-movie triumph. Western frontier ' +
      'flavor with a bold heroic fiddle-and-banjo motif galloping over the full orchestra. Intense, grand, and ' +
      'goosebump-inducing, starting strong and building relentlessly to a huge climactic, victorious finale. ' +
      'Edge-of-your-seat blockbuster spectacle.',
  },
};

async function generate(key, attempt = 1) {
  const t = TRACKS[key];
  const dir = join(ROOT, 'assets/audio/music');
  mkdirSync(dir, { recursive: true });
  process.stdout.write(`  ${key} (${t.lengthMs / 1000}s)... `);
  const t0 = Date.now();
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192', {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ prompt: t.prompt, music_length_ms: t.lengthMs }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(dir, t.file), buf);
    console.log(`${(buf.length / 1048576).toFixed(2)} MB in ${Math.round((Date.now() - t0) / 1000)}s → ${t.file}`);
  } catch (e) {
    if (attempt < 3) { console.log(`retry (${e.message})`); await new Promise(r => setTimeout(r, 1500)); return generate(key, attempt + 1); }
    throw e;
  }
}

const which = process.argv[2];
const keys = which ? [which] : ['base', 'bonus'];
for (const k of keys) {
  if (!TRACKS[k]) { console.error(`Unknown track "${k}" (use base|bonus)`); process.exit(1); }
}
console.log(`Generating ${keys.length} track(s) → assets/audio/music/`);
for (const k of keys) await generate(k);
console.log('Done.');
