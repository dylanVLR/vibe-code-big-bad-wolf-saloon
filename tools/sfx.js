/**
 * ElevenLabs sound-effect generator for Big Bad Wolf.
 *
 *   node tools/sfx.js              # generate every SFX below (≈30, concurrency 4)
 *   node tools/sfx.js wild_expand  # just one
 *
 * Reads ELEVENLABS_API_KEY from ../.env. Writes to assets/audio/sfx/.
 * Theme: Wild-West saloon meets the whimsical Big-Bad-Wolf & Three-Little-Pigs
 * fairy tale — cheerful banjo/brass, gold coins, cartoonish but polished.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const API_KEY = (env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/m) || [])[1].replace(/^["']|["']$/g, '');

/* name → { d: duration_seconds, p: prompt } */
const SFX = {
  // ── reels ──
  reel_spin:    { d: 1.2, p: 'Old-time slot machine reels whirring and spinning fast: a continuous mechanical wooden clatter and ticking ratchet rattle, light and lively, seamless loop, no music.' },
  reel_stop_1:  { d: 0.5, p: 'A wooden slot reel snapping to a stop: a crisp light mechanical clunk with a tiny spring twang, dry, short, punchy.' },
  reel_stop_2:  { d: 0.5, p: 'A wooden slot reel clunking to a stop: a solid mechanical thunk with a small spring, dry, short.' },
  reel_stop_3:  { d: 0.5, p: 'A wooden slot reel stopping: a firm mechanical clunk, a little deeper, dry, short, satisfying.' },
  reel_stop_4:  { d: 0.5, p: 'A wooden slot reel stopping hard: a heavier mechanical thunk with a low knock, dry, short.' },
  reel_stop_5:  { d: 0.6, p: 'The final slot reel stopping with weight: a deep heavy wooden clunk and a low thud, dry, short, conclusive.' },
  spin_lever:   { d: 1.0, p: 'Pulling a slot machine lever and the reels bursting to life: a ratcheting lever pull, a sharp whip crack, and a rising whoosh, Wild West, punchy, exciting.' },
  anticipation: { d: 1.6, p: 'Tense Western standoff build-up: a low ominous swelling drone with a ticking clock, a single suspenseful held fiddle note and a faint heartbeat, suspenseful and rising, no resolution.' },

  // ── wins ──
  win_small:    { d: 1.0, p: 'A small cheerful slot win: a few bright sparkly bell notes with a tiny banjo pluck and one gold coin clink, light, happy, Western whimsical, short.' },
  win_medium:   { d: 1.5, p: 'A satisfying medium slot win jingle: a rising bright bell arpeggio with a cheerful banjo flourish and gold coins clinking, upbeat Western, fairy-tale.' },
  win_big:      { d: 2.2, p: 'A big triumphant slot win fanfare: a bright brass and banjo flourish with sparkling bells, cascading gold coins and a celebratory hoedown energy, exciting Western, punchy.' },
  bonus_siren:  { d: 2.0, p: 'An exciting bonus-triggered alert: a whimsical rising siren-whistle with sparkling bells, a galloping snare drum roll and a banjo flourish, building anticipation, fairy-tale Western, energetic.' },

  // ── high-noon easter egg ──
  showdown_shootout: { d: 5, p: 'A Wild West high-noon showdown: a lone church bell tolling twelve over tense dusty desert wind and a jingling spur, a creaking saloon door, then a sudden rapid exchange of revolver gunshots cracking and echoing across the empty frontier street with whizzing ricochets, ending on one final decisive pistol shot. Cinematic, dramatic, cowboy western, no music, no voices.' },

  // ── wolf & houses ──
  wolf_huff:    { d: 1.6, p: 'A cartoon Big Bad Wolf taking a giant deep breath then blowing a huge gust: an exaggerated inhale and a powerful huffing-and-puffing wind whoosh, fairy tale, comedic and forceful.' },
  wolf_howl:    { d: 1.6, p: 'A lone wolf howling at the moon at night: a clear cinematic rising "awooo", a touch menacing and a touch playful, Western prairie night with faint wind.' },
  straw_break:  { d: 1.0, p: 'A flimsy straw house blown apart: light straw and dry grass rustling and scattering in a gust, a quick whoosh and a soft collapse, cartoonish.' },
  stick_break:  { d: 1.2, p: 'A stick house collapsing: wooden sticks and twigs clattering, snapping and tumbling apart in a gust, a cartoonish wooden crash.' },
  brick_impact: { d: 1.2, p: 'A powerful gust slamming into a solid brick house that stands firm: a big wind blast thudding against stone with a low rumble, the bricks hold strong, sturdy and heavy.' },
  brick_lay:    { d: 0.6, p: 'Setting a single brick into place: a solid stony clack with a quick trowel scrape of wet mortar, short, satisfying, construction.' },
  house_award_1:{ d: 1.0, p: 'A small prize reveal twinkle: a gentle sparkle, a soft gold coin clink and a little banjo note, light and cheerful, short.' },
  house_award_2:{ d: 1.3, p: 'A medium prize reveal: bright cheerful bells with a flurry of clinking gold coins and a happy banjo flourish, upbeat Western.' },
  house_award_3:{ d: 1.6, p: 'A big prize reveal: a triumphant sparkly chime with a heavy cascade of gold coins and a bright brass accent, exciting Western win.' },
  retrigger_chime:{ d: 1.2, p: 'An "extra free spins awarded" chime: a quick bright ascending sparkle with a rewarding ding and a banjo pluck, exciting, short, Western whimsical.' },
  mansion_fanfare:{ d: 3.0, p: 'A grand jackpot fanfare: a triumphant Western brass-and-banjo celebration with sparkling bells, a fiddle flourish, a big cascade of gold coins and jubilant hoedown energy, huge and exciting.' },

  // ── coins ──
  coin_clink_1: { d: 0.5, p: 'A single gold coin clink: one bright clean metallic ting, very short.' },
  coin_clink_2: { d: 0.5, p: 'Two gold coins clinking together: bright clean metallic clinks, very short.' },
  coin_clink_3: { d: 0.5, p: 'A small handful of gold coins clinking and settling: bright clean metallic, short.' },
  coin_shower:  { d: 2.0, p: 'A big shower of gold coins pouring and cascading into a pile: lots of bright metallic clinking, jingling and tumbling, rich and satisfying.' },

  // ── train (the "Wanted Reward" reveal) ──
  train_whistle:{ d: 2.6, p: 'A classic Old-West steam locomotive whistle: a long, bright two-tone steam whistle blast with a hiss of escaping steam and a faint distant chuffing of the engine, triumphant and nostalgic American frontier railroad, no music, no voices.' },

  // ── adaptive-score musical stingers (the Conductor fires these over the bed) ──
  streak_step:    { d: 0.9, p: 'A short bright ascending musical pip marking a winning streak ticking up one notch: a quick three-note rising banjo-and-bell flourish, clean and celebratory, in a Western style, very short, no vocals.' },
  deposit_flourish:{ d: 1.4, p: 'A quick celebratory cash deposit flourish: a bright ringing cash-register ding and a coin shimmer with a short rising banjo-and-bell sting, satisfying and warm, Western, short, no vocals.' },
  music_riser:    { d: 2.6, p: 'A rising cinematic tension riser building suspense: swelling tremolo strings and a tightening snare-drum roll with a rising cymbal shimmer, building to the very edge then stopping unresolved, Western orchestral, no vocals, no melody resolution.' },

  // ── cinematic "scored to the moment" stingers (John Williams Western) ──
  win_swell:   { d: 2.4, p: 'A soaring cinematic orchestral win swell that builds and resolves: rising strings and a heroic French-horn-and-trumpet fanfare crescendo arriving on a bright, satisfying triumphant major chord with a sparkle of bells and a cymbal shimmer. Uplifting and rewarding, grand sweeping cinematic adventure style, no vocals.' },
  wolf_theme:  { d: 2.0, p: 'A short heroic French-horn leitmotif: a bold, noble four-note brass motif with a quick timpani hit and a touch of strings, like a hero\'s signature theme, confident, memorable and cinematic Western orchestral, very short, no vocals.' },
  bonus_build: { d: 2.8, p: 'A rising cinematic orchestral build that ratchets up suspense and excitement: an accelerating timpani-and-snare roll under swelling strings and climbing heroic brass with a tightening tremolo, building higher and higher right to the edge of a huge payoff then holding, sweeping cinematic adventure style, no resolution, no vocals.' },

  // ── ui ──
  button_click: { d: 0.5, p: 'A chunky satisfying button or lever click: a wooden-and-brass mechanical click with a tiny spring, short, tactile, Western.' },
  bet_change:   { d: 0.5, p: 'A quick light UI tick for changing a bet value: a small bright mechanical click with a tiny coin ting, very short and clean.' },

  // ── wild ──
  wild_expand:  { d: 2.6, p: 'Triumphant Wild-West slot win: a rising magical whoosh and shimmer, a sharp whip crack, a cheerful burst of gold coins clinking and cascading, and a quick sparkly firework pop. Bright, exciting, celebratory, cowboy western.' },
  bolt_lock:    { d: 0.6, p: 'A single heavy metal bolt or rivet hammered and locking firmly into place: one sharp metallic clank then a short ratchet click. Mechanical, blacksmith forge, punchy, dry, no music.' },

  // ── wind / tornado (the wolf's big blow in the bonus) ──
  wind_storm:    { d: 8, p: 'A powerful sustained tornado windstorm: deep howling wind roaring and whistling, strong continuous gusts swirling like a cyclone, with a low rushing rumble. Intense, immersive, seamless and loopable, no music, no voices.' },
  wind_gust:     { d: 1.6, p: 'A sudden strong gust of wind whooshing past hard: a sharp powerful blast of air with a brief rising howl, dynamic and punchy, no music.' },
  leaves_rustle: { d: 1.5, p: 'Dry autumn leaves and loose bits of straw rustling, fluttering and skittering as they are blown across by wind: light papery crackle and scattering debris, no music.' },

  // ── frame upgrades (a house frame being built around a reel symbol) ──
  frame_straw:  { d: 1.8, p: 'Building a straw house frame: armfuls of dry straw and hay gathered, bundled and woven into place with a light papery rustle and crackle, a soft whoosh as it forms. Dry, thatchy, whimsical fairy-tale, no music.' },
  frame_wood:   { d: 2.0, p: 'Building a wooden house frame: wooden planks and sticks stacked and knocked together, a few quick hammer taps on wood and a satisfying creak as the timber locks into place. Dry, woody, punchy, carpentry, no music.' },
  frame_brick:  { d: 2.0, p: 'Building a brick house frame: bricks stacked and set with mortar, solid stony clacks and a scrape of a trowel, finishing with a firm heavy thud as it locks in. Sturdy, weighty, satisfying, masonry, no music.' },
};

async function gen(name, attempt = 1) {
  const s = SFX[name];
  if (!s) { console.error(`Unknown SFX "${name}"`); process.exit(1); }
  const dir = join(ROOT, 'assets/audio/sfx');
  mkdirSync(dir, { recursive: true });
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: s.p, duration_seconds: s.d, prompt_influence: 0.55 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(dir, `${name}.mp3`), buf);
    console.log(`  ✓ ${name}.mp3 (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    if (attempt < 3) { await new Promise(r => setTimeout(r, 1200 * attempt)); return gen(name, attempt + 1); }
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

/* small concurrency pool */
async function pool(names, size) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, names.length) }, async () => {
    while (i < names.length) await gen(names[i++]);
  }));
}

const which = process.argv[2];
const names = which ? [which] : Object.keys(SFX);
console.log(`Generating ${names.length} SFX → assets/audio/sfx/`);
const t0 = Date.now();
await pool(names, 4);
console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s.`);
