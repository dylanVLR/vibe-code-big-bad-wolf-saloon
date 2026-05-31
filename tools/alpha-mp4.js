/**
 * tools/alpha-mp4.js — make Safari-compatible transparent video.
 *
 * Safari (macOS + iOS) cannot show an alpha channel in WebM (VP8/VP9) — it
 * renders the clip on a solid black box. Apple's supported format for
 * transparent video is HEVC (H.265) with an alpha channel in an .mp4. So for
 * every TRANSPARENT clip we keep the .webm (Chrome/Firefox) AND emit an
 * HEVC-alpha .mp4 twin (Safari). The page picks the right one per browser
 * (see src/system/video-format.js).
 *
 * Opaque clips (full-screen cutscenes/backdrops) need no twin — Safari plays
 * VP9 WebM fine without alpha.
 *
 * Run:  node tools/alpha-mp4.js
 * Requires ffmpeg with the macOS hevc_videotoolbox encoder.
 */
'use strict';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const DIR = 'assets/webm';
// Transparent clips: the SideWolf character, the SPIN badge, the frame-morph overlays.
const isTransparent = b => /^Sidewolf/i.test(b) || /^Spin\.webm$/i.test(b) || /^F[123]-/i.test(b);

const files = readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.webm') && isTransparent(f)).sort();
if (!files.length) { console.log('No transparent .webm clips found.'); process.exit(0); }

const force = process.argv.includes('--force');
let added = 0, made = 0, skipped = 0;

for (const f of files) {
  const src = join(DIR, f);
  const out = join(DIR, f.replace(/\.webm$/i, '.mp4'));
  if (existsSync(out) && !force) { skipped++; continue; }
  process.stdout.write(`→ ${f} … `);
  const r = spawnSync('ffmpeg', [
    '-y', '-v', 'error',
    '-c:v', 'libvpx-vp9', '-i', src,             // decode VP9 *with* its alpha plane
    '-vf', 'scale=540:-2',                        // 540px wide — ample for the on-screen size
    '-c:v', 'hevc_videotoolbox',                 // HEVC via Apple VideoToolbox
    '-alpha_quality', '0.75', '-allow_sw', '1',  // carry the alpha channel
    '-tag:v', 'hvc1',                            // tag Safari recognises
    '-pix_fmt', 'yuva420p', '-b:v', '1000k',
    out,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status === 0) {
    const kb = Math.round(statSync(out).size / 1024);
    added += statSync(out).size; made++;
    console.log(`ok (${kb} KB)`);
  } else {
    console.log('FAILED');
  }
}
console.log(`\nDone. ${made} made, ${skipped} already present → +${(added / 1048576).toFixed(1)} MB of HEVC-alpha .mp4`);
console.log('(re-run with --force to regenerate everything)');
