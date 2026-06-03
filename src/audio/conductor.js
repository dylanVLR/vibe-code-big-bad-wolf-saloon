/**
 * @module conductor
 * @description The adaptive-score brain. Like the wolf narrator, it stays aware of
 * what's happening and shapes the music to match. It tracks a single 0→1 "heat"
 * value — it rises with fast play, wins and streaks, and decays back down when the
 * player idles — and pushes that to the score engine (src/audio/sound.js) every
 * tick, so the energy layer swells and the tempo leans forward smoothly. It also
 * fires musical stingers on discrete events (streak step-ups, big-win howl, a
 * deposit flourish, an anticipation riser).
 *
 * One tunable knob: `intensity` (window.__score.gain(x) in dev), default subtle.
 */
'use strict';

import { bgm, synth } from './sound.js';
import { WIN_TIERS } from '../math/par-sheet.js';

let intensity = 1.0;          // global multiplier on every heat gain (subtle ≈ 1)
const DECAY = 0.90;           // heat *= DECAY each tick → calms when nothing happens
const TICK_MS = 400;

let heat = 0;                 // 0..1
let streak = 0;               // consecutive winning spins
let lastSpinAt = 0;

const clamp01 = v => Math.max(0, Math.min(1, v));
function bump(amount) { heat = clamp01(heat + amount * intensity); }

export const conductor = {
  /** A spin started — cadence drives heat (rapid repeated spins get hotter). */
  onSpin() {
    const now = Date.now();
    const gap = now - lastSpinAt;
    lastSpinAt = now;
    bump(gap > 0 && gap < 1400 ? 0.14 : 0.06);
  },

  /** Near-miss / bonus anticipation — swell the tension with a riser. */
  onAnticipation(extreme = false) {
    bump(extreme ? 0.26 : 0.14);
    synth.musicRiser();
  },

  /** A base-game spin resolved — drives streaks, heat and win stingers. */
  onResult(win, bet) {
    if (win > 0) {
      streak++;
      const ratio = win / bet;
      bump(ratio >= WIN_TIERS.big ? 0.30 : ratio >= WIN_TIERS.nice ? 0.12 : 0.06);
      if (streak >= 3) synth.streakStep(streak - 3);   // a rising ladder from the 3rd win on
      if (ratio >= WIN_TIERS.mega) synth.wolfHowl();    // the wolf howls on a really big hit
    } else {
      streak = 0;
    }
  },

  /** Player added credit — a celebratory flourish + a touch of heat. */
  onDeposit() { synth.depositFlourish(); bump(0.05); },

  getHeat() { return heat; },
};

// Steady heartbeat: decay heat and push it to the score engine.
setInterval(() => {
  heat = clamp01(heat * DECAY);
  bgm.setHeat(heat);
}, TICK_MS);

// Dev tuning: window.__score.gain(0.6) to dial reactivity, .boost() to test a swell.
if (typeof window !== 'undefined') {
  window.__score = {
    heat: () => heat,
    streak: () => streak,
    gain: (g) => { if (g != null) intensity = g; return intensity; },
    boost: (v = 0.4) => bump(v),
  };
}
