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

  // BASE bed — daytime: the noble main theme (leitmotif), warm and adventurous.
  base_day: {
    file: 'bgm_base_day.mp3',
    lengthMs: 40000,
    prompt:
      'A sweeping cinematic orchestral Western main theme with the grand, adventurous sweep of a classic Hollywood film score, in A minor ' +
      'at a relaxed 92 BPM, fully instrumental with NO vocals. A warm, noble, instantly-memorable melody carried by ' +
      'French horns and soaring strings, with gentle acoustic guitar, banjo and harmonica adding frontier color, ' +
      'soft timpani and delicate woodwind filigree. Hopeful, emotional and cinematic like a golden sunrise over the ' +
      'wide-open West — intimate yet grand, with a clear hummable main theme. Seamlessly loopable with rich depth.',
  },
  // BASE bed — nighttime: the SAME theme reorchestrated as a lonesome nocturne.
  base_night: {
    file: 'bgm_base_night.mp3',
    lengthMs: 40000,
    prompt:
      'A cinematic orchestral Western nocturne in the grand classic-Hollywood film-score tradition — the same noble main theme ' +
      'reorchestrated for night — in A minor at a slow 92 BPM, fully instrumental with NO vocals. Sparse and ' +
      'lonesome: a solo French horn and muted strings carry the melody over low cellos and double bass, a distant ' +
      'lonely harmonica and a faint far-off wolf howl, soft harp and shimmering high strings. Moonlit, mysterious ' +
      'and a touch melancholy yet beautiful. Same key and tempo as the daytime theme for a seamless crossfade. Loopable.',
  },
  // BASE SWELL LAYER — low-heat tier: pure harmonic lift (no rhythm) for the first stage of the build.
  base_swell: {
    file: 'bgm_base_swell.mp3',
    lengthMs: 32000,
    prompt:
      'A lush sustained orchestral STRING-AND-HORN SWELL layer meant to be mixed gently on top of a calm Western ' +
      'score, in A minor at 92 BPM, fully instrumental with NO vocals. Warm legato strings and noble French horns ' +
      'holding and swelling rich cinematic harmony with a slow emotional rise and fall — soft, no rhythm and no ' +
      'melody, pure harmonic lift that blends invisibly under other music. Smooth and seamlessly loopable.',
  },
  // BASE energy LAYER — high-heat tier: galloping orchestral drive that enters on top of the swell.
  base_energy: {
    file: 'bgm_base_energy.mp3',
    lengthMs: 32000,
    prompt:
      'A driving cinematic orchestral ENERGY layer in an epic classic-Hollywood Western film-score style, to be mixed on top of a calm ' +
      'score, in A minor at 92 BPM, fully instrumental with NO vocals. A galloping snare-and-timpani rhythm with ' +
      'stomping low strings, heroic short French-horn and trumpet stabs, tambourine and a banjo gallop — propulsive ' +
      'momentum and rising excitement. Mostly rhythmic and brassy with minimal sustained harmony so it layers ' +
      'cleanly. Tight and seamlessly loopable.',
  },
  // BONUS bed A — the heroic theme blazing at full orchestral power.
  bonus_a: {
    file: 'bgm_bonus_a.mp3',
    lengthMs: 48000,
    prompt:
      'An epic, triumphant cinematic orchestral Western theme in a grand classic-Hollywood blockbuster film-score style, in A ' +
      'minor at 120 BPM, fully instrumental with NO vocals. A soaring, heroic, instantly-memorable main theme ' +
      'blazing on full French horns and trumpets over galloping strings, thunderous timpani and taiko, cymbal ' +
      'swells and a noble Western fiddle-and-banjo countermelody. Goosebump-inducing adventure and victory, full ' +
      'orchestral power with big dynamic swells. Seamlessly loopable.',
  },
  // BONUS bed B — a triumphant development of the theme (pairs/crossfades with A).
  bonus_b: {
    file: 'bgm_bonus_b.mp3',
    lengthMs: 48000,
    prompt:
      'A triumphant cinematic development of the heroic Western theme, in A minor at 120 BPM to pair and crossfade ' +
      'with the first, in a grand cinematic film-score style, fully instrumental with NO vocals. The same main theme ' +
      'reharmonized and pushed higher — bolder brass fanfares, dueling fiddle and trumpet trading the melody, a ' +
      'relentless galloping rhythm and grand cymbal swells building to even greater triumph. Same key and tempo. ' +
      'Seamlessly loopable.',
  },
  // BONUS energy LAYER — peak-climax overlay for the biggest bonus moments.
  bonus_energy: {
    file: 'bgm_bonus_energy.mp3',
    lengthMs: 32000,
    prompt:
      'A high-energy cinematic orchestral OVERLAY for an epic bonus climax, epic classic-Hollywood Western film-score style, in A minor ' +
      'at 120 BPM, fully instrumental with NO vocals. Thunderous war-drum toms and timpani, galloping snare, soaring ' +
      'cymbal swells and stabbing heroic brass fanfares meant to layer on top of a full orchestral theme for peak ' +
      'excitement. Mostly rhythmic and brassy so it blends. Seamlessly loopable.',
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
const ADAPTIVE = ['base_day', 'base_night', 'base_swell', 'base_energy', 'bonus_a', 'bonus_b', 'bonus_energy'];

let args = process.argv.slice(2);
if (args.length === 1 && args[0] === 'adaptive') args = ADAPTIVE;   // group alias
const keys = args.length ? args : ['base', 'bonus'];
for (const k of keys) {
  if (!TRACKS[k]) { console.error(`Unknown track "${k}" (use base|bonus|showdown|adaptive|${ADAPTIVE.join('|')})`); process.exit(1); }
}
console.log(`Generating ${keys.length} track(s) → assets/audio/music/`);
for (const k of keys) await generate(k);
console.log('Done.');
