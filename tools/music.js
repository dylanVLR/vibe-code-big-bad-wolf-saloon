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
  // One-shot cue for the High-Noon easter egg outro (played once, not looped).
  showdown: {
    file: 'showdown_theme.mp3',
    lengthMs: 15000,    // ~15s climax that ends leaving room for a final gunshot
    prompt:
      'A tense, suspenseful Western frontier theme, fully instrumental with NO vocals. A lone haunting whistle ' +
      'melody and a distant lonely trumpet over sparse tremolo twangy electric guitar, with ominous low strings, ' +
      'a slow ticking and a faint heartbeat. Dusty, dramatic, gritty cinematic tension, starting sparse and ' +
      'slowly building suspense to a taut, swelling climax that hangs right on the edge, then cuts off sharply ' +
      'into silence. Atmospheric, cinematic, classic Wild West frontier mood.',
  },

  /* ── ADAPTIVE SCORE LIBRARY (the Conductor blends these live) ──
     COHESION RULE: every base-game cue is in A MINOR around 92 BPM, and every
     bonus cue is in A MINOR around 120 BPM, so beds crossfade cleanly and the
     energy layers sit on top of whichever bed is playing. Loops are kept short
     (light to download, and they re-sync to the energy layer every loop). */

  // BASE bed — daytime: warm, sunlit, hopeful. Low-to-mid energy.
  base_day: {
    file: 'bgm_base_day.mp3',
    lengthMs: 40000,
    prompt:
      'A warm, hopeful Western cinematic score in A minor at a relaxed 92 BPM, fully instrumental with NO vocals. ' +
      'Gentle fingerpicked acoustic guitar and soft banjo, warm sustained strings, a sweet harmonica and a touch of ' +
      'tin whistle carrying a memorable melody, light brushed percussion. A golden sunlit frontier morning — cozy, ' +
      'easygoing and content, low-to-mid energy. Smooth, even, and seamlessly loopable with a steady gentle pulse.',
  },
  // BASE bed — nighttime: sparse, moonlit, a touch of menace. Swapped via the time-of-day slider.
  base_night: {
    file: 'bgm_base_night.mp3',
    lengthMs: 40000,
    prompt:
      'A sparse, moonlit lonesome Western night score in A minor at a slow 92 BPM, fully instrumental with NO vocals. ' +
      'Slow lap-steel slide guitar, low sustained strings and soft upright bass, a distant lonely harmonica, a faint ' +
      'far-off wolf howl and gentle night ambience. Mysterious, atmospheric, a little menacing but beautiful — low ' +
      'energy. Same key and tempo as the daytime theme so they crossfade cleanly. Seamlessly loopable.',
  },
  // BASE energy LAYER — sits ON TOP of either base bed when the player heats up. Mostly rhythmic so it blends.
  base_energy: {
    file: 'bgm_base_energy.mp3',
    lengthMs: 32000,
    prompt:
      'A driving rhythmic ENERGY LAYER meant to be mixed on top of a calm Western score, in A minor at 92 BPM, fully ' +
      'instrumental with NO vocals. A galloping banjo ostinato, foot stomps and hand claps, punchy toms and ' +
      'tambourine, and short stabbing brass accents building momentum and excitement. Mostly percussion and rhythm ' +
      'with minimal sustained harmony so it layers cleanly over other music. Tight, propulsive, seamlessly loopable.',
  },
  // BONUS bed A — triumphant adventure (track 1 of the bonus playlist).
  bonus_a: {
    file: 'bgm_bonus_a.mp3',
    lengthMs: 48000,
    prompt:
      'An epic, triumphant Western adventure score in A minor at 120 BPM, fully instrumental with NO vocals. Heroic ' +
      'brass, a galloping fiddle-and-banjo motif, big taiko and timpani drums, soaring strings and grand cymbal ' +
      'swells. Swashbuckling, celebratory and goosebump-inducing, full of momentum. Seamlessly loopable.',
  },
  // BONUS bed B — a contrasting variation so the bonus has a 2-track playlist (same key/tempo for clean crossfade).
  bonus_b: {
    file: 'bgm_bonus_b.mp3',
    lengthMs: 48000,
    prompt:
      'A second triumphant Western bonus theme in A minor at 120 BPM, designed to pair and crossfade with the first. ' +
      'Fully instrumental with NO vocals. A bolder, more driving hoedown-meets-orchestra variation: a relentless ' +
      'stomping rhythm, dueling fiddle and brass trading the melody, whooping celebratory energy and a victorious ' +
      'feel. Same key and tempo as the first bonus theme. Seamlessly loopable.',
  },
  // BONUS energy LAYER — peak-excitement overlay for big bonus moments.
  bonus_energy: {
    file: 'bgm_bonus_energy.mp3',
    lengthMs: 32000,
    prompt:
      'A high-energy percussion-and-brass OVERLAY for an epic bonus, in A minor at 120 BPM, fully instrumental with ' +
      'NO vocals. Thunderous war-drum toms, galloping snare, big cymbal swells and stabbing heroic brass hits, meant ' +
      'to layer on top of a bonus theme for peak excitement. Mostly rhythmic so it blends. Seamlessly loopable.',
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

// The 6-cue adaptive library the Conductor blends live.
const ADAPTIVE = ['base_day', 'base_night', 'base_energy', 'bonus_a', 'bonus_b', 'bonus_energy'];

let args = process.argv.slice(2);
if (args.length === 1 && args[0] === 'adaptive') args = ADAPTIVE;   // group alias
const keys = args.length ? args : ['base', 'bonus'];
for (const k of keys) {
  if (!TRACKS[k]) { console.error(`Unknown track "${k}" (use base|bonus|showdown|adaptive|${ADAPTIVE.join('|')})`); process.exit(1); }
}
console.log(`Generating ${keys.length} track(s) → assets/audio/music/`);
for (const k of keys) await generate(k);
console.log('Done.');
