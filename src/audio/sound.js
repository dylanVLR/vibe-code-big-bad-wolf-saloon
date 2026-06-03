/**
 * @module sound
 * @description Sound for Big Bad Wolf. Exports two ready-to-use singletons:
 *   `synth` – one-shot sound effects (pre-rendered MP3s in assets/audio/sfx/)
 *   `bgm`   – looping background music (base-game + bonus tracks, crossfaded)
 * Both are created once here and shared via ES-module caching.
 */
'use strict';

import { IS_MOBILE } from '../system/video-format.js';   // lighter adaptive score on phones

// Touch devices (iPhone/Android) hitch when many `new Audio()` elements decode
// the same clip at once — e.g. the rapid coin-ticks during a win count-up, or the
// reel-stop cascade. On touch we reuse a tiny pool of pre-decoded elements per
// file instead of allocating a fresh one each call, and rate-limit the fastest
// ticks. Desktop keeps the simple per-call path (plenty of headroom there).
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia &&
                 window.matchMedia('(pointer: coarse)').matches;

/* ── Sound effects ── */
class Synth {
  constructor() {
    this.enabled = true;
    this._volume = 0.7;       // 0..1
    this._spinAudio = null;   // the looping reel-spin sound
    this._windAudio = null;   // the looping tornado-wind sound
    this._active = new Set();
    this._pool = new Map();   // filename → { els:[Audio…], idx } (touch only)
    this._lastTick = 0;       // throttle clock for the rapid coin-tick
  }

  /** Play an MP3 from assets/audio/sfx/. Returns the Audio element. */
  _play(filename, vol = 1.0, loop = false) {
    if (!this.enabled) return null;
    const audio = new Audio(`assets/audio/sfx/${filename}`);
    audio.volume = this._volume * vol;
    audio.loop = loop;
    this._active.add(audio);
    audio.addEventListener('ended', () => this._active.delete(audio));
    audio.play().catch(() => {});
    return audio;
  }

  /** Lazily build (once) and round-robin a small pool of decoded elements for a
      file, so repeated one-shots reuse buffers instead of re-decoding. */
  _poolGet(filename) {
    let p = this._pool.get(filename);
    if (!p) {
      const els = [];
      for (let i = 0; i < 3; i++) {       // 3 ⇒ a few may overlap without cutting out
        const a = new Audio(`assets/audio/sfx/${filename}`);
        a.preload = 'auto';
        els.push(a);
      }
      p = { els, idx: 0 };
      this._pool.set(filename, p);
    }
    const a = p.els[p.idx];
    p.idx = (p.idx + 1) % p.els.length;
    return a;
  }

  /** Stop all currently playing one-shot sounds. */
  stopAll() {
    for (const a of this._active) {
      try { a.pause(); a.currentTime = 0; } catch (e) {}
    }
    this._active.clear();
    for (const p of this._pool.values()) {
      for (const a of p.els) { try { a.pause(); a.currentTime = 0; } catch (e) {} }
    }
    this.stopSpin();
    this.windStop();
  }

  /** Play a one-shot SFX that may overlap others. On touch this reuses a pooled,
      pre-decoded element to avoid the iOS multi-decode hitch. */
  _oneShot(filename, vol = 1.0) {
    if (!IS_TOUCH) return this._play(filename, vol, false);
    if (!this.enabled) return null;
    const a = this._poolGet(filename);
    a.volume = this._volume * vol;
    try { a.currentTime = 0; } catch (e) {}
    a.play().catch(() => {});
    return a;
  }

  // ── reels ──
  spinLever() { this._oneShot('spin_lever.mp3', 0.45); }
  startSpin() { if (this.enabled) { this.stopSpin(); this._spinAudio = this._play('reel_spin.mp3', 0.3, true); } }
  stopSpin() {
    if (this._spinAudio) { this._spinAudio.pause(); this._spinAudio.currentTime = 0; this._spinAudio = null; }
  }
  reelStop(index) {
    if (!this.enabled) return;
    const files = ['reel_stop_1.mp3','reel_stop_2.mp3','reel_stop_3.mp3','reel_stop_4.mp3','reel_stop_5.mp3'];
    this._oneShot(files[index] || files[0], 0.6);
  }
  anticipation() { this._oneShot('anticipation.mp3', 0.5); }

  // ── wins ──
  win(totalWin, bet) {
    if (!this.enabled) return;
    const ratio = totalWin / bet;
    if (ratio >= 8)      this._oneShot('win_big.mp3', 0.8);
    else if (ratio >= 3) this._oneShot('win_medium.mp3', 0.7);
    else                 this._oneShot('win_small.mp3', 0.6);
  }
  bonusSiren()  { this._oneShot('bonus_siren.mp3', 0.7); }
  bigWinAlarm() { this._oneShot('win_big.mp3', 0.9); }
  wildExpand()  { this._oneShot('wild_expand.mp3', 0.85); }
  boltLock()    { this._oneShot('bolt_lock.mp3', 0.7); }

  // ── wolf & houses ──
  wolfHuff()    { this._oneShot('wolf_huff.mp3', 0.8); }
  wolfHowl()    { this._oneShot('wolf_howl.mp3', 0.6); }

  // ── wind / tornado (the wolf's big blow in the bonus reveal) ──
  windStart()    { if (this.enabled) { this.windStop(); this._windAudio = this._play('wind_storm.mp3', 0.55, true); } }
  windStop()     { if (this._windAudio) { try { this._windAudio.pause(); this._windAudio.currentTime = 0; } catch (e) {} this._windAudio = null; } }
  windGust()     { this._oneShot('wind_gust.mp3', 0.5); }
  leavesRustle() { this._oneShot('leaves_rustle.mp3', 0.4); }
  strawBreak()  { this._oneShot('straw_break.mp3', 0.7); }
  stickBreak()  { this._oneShot('stick_break.mp3', 0.7); }
  brickImpact() { this._oneShot('brick_impact.mp3', 0.7); }
  brickLay()    { this._oneShot('brick_lay.mp3', 0.5); }
  /** A house frame being built as it upgrades: straw woven / wood nailed / brick laid. */
  frameBuild(tier) {
    if (!this.enabled) return;
    const files = { 1: 'frame_straw.mp3', 2: 'frame_wood.mp3', 3: 'frame_brick.mp3' };
    this._oneShot(files[tier] || files[1], 0.7);
  }
  /** The gust hitting a house: straw scatters, sticks crash, bricks hold firm. */
  houseBreak(tier) {
    if (!this.enabled) return;
    const files = { 1: 'straw_break.mp3', 2: 'stick_break.mp3', 3: 'brick_impact.mp3' };
    this._oneShot(files[tier] || files[1], 0.75);
  }
  houseAward(tier) {
    if (!this.enabled) return;
    const files = { 1: 'house_award_1.mp3', 2: 'house_award_2.mp3', 3: 'house_award_3.mp3' };
    this._oneShot(files[tier] || files[1], 0.6);
  }
  retriggerChime() { this._oneShot('retrigger_chime.mp3', 0.6); }
  mansionFanfare() { this._oneShot('mansion_fanfare.mp3', 0.8); }
  trainWhistle()   { this._oneShot('train_whistle.mp3', 0.7); }

  // ── adaptive-score stingers (fired by the Conductor over the music bed) ──
  /** A streak step-up pip; pitch climbs with the streak length for a rising ladder. */
  streakStep(step = 0) {
    const a = this._oneShot('streak_step.mp3', 0.5);
    if (a) { try { a.playbackRate = 1 + Math.min(step, 6) * 0.07; } catch (e) {} }
  }
  depositFlourish() { this._oneShot('deposit_flourish.mp3', 0.55); }
  musicRiser()      { this._oneShot('music_riser.mp3', 0.5); }
  // cinematic "scored to the moment" cues
  winSwell()   { this._oneShot('win_swell.mp3', 0.7); }     // the orchestral payoff of a win
  wolfTheme()  { this._oneShot('wolf_theme.mp3', 0.7); }    // the heroic horn leitmotif
  bonusBuild() { this._oneShot('bonus_build.mp3', 0.6); }   // the rising anticipation build

  // ── coins ──
  coinTick() {
    if (!this.enabled) return;
    // The win count-up fires this every animation frame (~30% of frames). On touch
    // that's a burst of decodes; cap it to ~1 every 90ms so it stays a pleasant
    // patter without flooding the audio pipeline.
    if (IS_TOUCH) {
      const now = Date.now();
      if (now - this._lastTick < 90) return;
      this._lastTick = now;
    }
    const files = ['coin_clink_1.mp3', 'coin_clink_2.mp3'];
    this._oneShot(files[Math.floor(Math.random() * files.length)], 0.25);
  }
  coinClink() {
    if (!this.enabled) return;
    const files = ['coin_clink_1.mp3', 'coin_clink_2.mp3', 'coin_clink_3.mp3'];
    this._oneShot(files[Math.floor(Math.random() * files.length)], 0.35);
  }
  coinShower() { this._oneShot('coin_shower.mp3', 0.6); }

  // ── ui ──
  buttonClick() { this._oneShot('button_click.mp3', 0.3); }
  betChange()   { this._oneShot('bet_change.mp3', 0.3); }

  // ── volume ──
  toggle() { this.enabled = !this.enabled; return this.enabled; }
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._spinAudio) this._spinAudio.volume = this._volume * 0.3;
    if (this._windAudio) this._windAudio.volume = this._volume * 0.55;
  }
  getVolume() { return this._volume; }
}

/* ── Background score — ADAPTIVE ────────────────────────────────────────────
   The Conductor (src/audio/conductor.js) blends these cues live, so the music
   grows with the game instead of a song starting and stopping:
     • a day/night BASE bed (crossfaded via the time-of-day slider),
     • a BONUS 2-track playlist (A ⇄ B so it never feels like one loop),
     • additive ENERGY layers that swell with the player's "heat",
     • subtle pitch-preserved tempo (desktop only — iOS time-stretch is poor),
     • crossfades ONLY at context changes.

   Public API is unchanged (start/stop/setVolume/getVolume/isPlaying/
   switchToBonus/switchToBase/pauseForCutscene/resumeFromCutscene); the Conductor
   drives the new dimensions via setHeat()/setNight().

   These are HTMLAudio loops (chosen so pitch-preserved tempo works). The energy
   layers are percussion-forward and mixed gently, so they blend without needing
   sample-accurate beat-lock (which HTMLAudio can't provide). MOBILE stays light:
   beds + energy + crossfades, but NO time-stretch and NO A/B playlist churn. */
const MUSIC = 'assets/audio/music/';
const LAYER_FILES = {
  day:         'bgm_base_day.mp3',
  night:       'bgm_base_night.mp3',
  baseSwell:   'bgm_base_swell.mp3',    // low-heat tier — emotional strings/horn lift
  baseEnergy:  'bgm_base_energy.mp3',   // high-heat tier — galloping drive
  bonusA:      'bgm_bonus_a.mp3',
  bonusB:      'bgm_bonus_b.mp3',
  bonusEnergy: 'bgm_bonus_energy.mp3',
};
const TEMPO_RANGE  = 0.10;   // up to +10% playbackRate at full heat (desktop only)
const SWELL_MAX    = 0.55;   // max strings-swell mix (first stage of the build)
const ENERGY_MAX   = 0.62;   // max energy-layer mix at full heat (second stage)
const BONUS_ENERGY_FLOOR = 0.35;   // bonus always feels energetic, even at low heat
const FADE_FAST    = 0.12;   // energy/layer swells — responsive
const FADE_SLOW    = 0.03;   // context / day-night / playlist — slow film-style dissolve (~3s)

// Smooth ramp of x within [a,b] → 0..1 with eased ends (orchestral, not linear).
function smooth(x, a, b) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

class AdaptiveScore {
  constructor() {
    this._volume  = 0.5;        // user slider 0..1
    this.playing  = false;
    this.context  = 'base';     // 'base' | 'bonus'
    this.night    = false;
    this.heat     = 0;          // 0..1 (set by the Conductor)
    this.rate     = 1;
    this._els = {};             // name → HTMLAudioElement (lazy)
    this._mix = {};             // name → { cur, target }  (eased by the ticker)
    this._ticker = null;
    this._playlistTimer = null;
    this._bonusPick = 'bonusA';
    for (const n of Object.keys(LAYER_FILES)) this._mix[n] = { cur: 0, target: 0, rate: FADE_FAST };
    this._duck = 1;            // momentary bed dip under big stingers (eased back to 1)
  }

  _el(name) {
    let a = this._els[name];
    if (!a) {
      a = new Audio(MUSIC + LAYER_FILES[name]);
      a.loop = true; a.volume = 0; a.preload = 'none';
      this._pitchLock(a);
      this._els[name] = a;
    }
    return a;
  }
  _pitchLock(a) { try { a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = true; } catch (e) {} }
  _eff() { return Math.max(0, Math.min(1, this._volume * 0.5)); }   // music sits under SFX
  _baseBed() { return this.night ? 'night' : 'day'; }

  // One easing ticker glides every layer's mix toward its target and writes the
  // real element volume; it pauses silent layers and stops itself when idle.
  _ensureTicker() {
    if (this._ticker) return;
    this._ticker = setInterval(() => {
      const eff = this._eff();
      if (this._duck < 0.999) this._duck += (1 - this._duck) * 0.06;   // ease the duck back up
      let alive = false;
      for (const [n, m] of Object.entries(this._mix)) {
        if (m.cur !== m.target) {
          m.cur += (m.target - m.cur) * m.rate;                        // per-layer fade speed
          if (Math.abs(m.cur - m.target) < 0.004) m.cur = m.target;
        }
        const a = this._els[n];
        if (!a) continue;
        if (m.cur < 0.004) { if (!a.paused) a.pause(); }
        else { a.volume = eff * m.cur * this._duck; alive = true; }
      }
      if (!alive && !this.playing) { clearInterval(this._ticker); this._ticker = null; }
    }, 50);
  }

  _fade(name, target, rate) {
    const m = this._mix[name];
    m.target = Math.max(0, Math.min(1, target));
    if (rate != null) m.rate = rate;     // pick the fade speed per transition
  }

  async _play(name) {
    const a = this._el(name);
    if (a.paused) {
      a.preload = 'auto';
      this._pitchLock(a);
      a.playbackRate = this.rate;
      try { await a.play(); } catch (e) { return false; }
    }
    return true;
  }

  _applyRate() {
    if (IS_MOBILE) return;            // iOS time-stretch is poor — keep rate at 1
    for (const a of Object.values(this._els)) {
      if (!a.paused) { this._pitchLock(a); try { a.playbackRate = this.rate; } catch (e) {} }
    }
  }

  // Two-stage orchestral build: a strings/horn SWELL lifts in first (low heat),
  // then the galloping ENERGY layer drives in on top (high heat). Mobile keeps
  // just the energy layer to stay light. Bonus keeps an energetic floor.
  _applyEnergy() {
    if (this.context === 'bonus') {
      const g = Math.max(BONUS_ENERGY_FLOOR, smooth(this.heat, 0.05, 0.9) * ENERGY_MAX);
      this._fade('bonusEnergy', g, FADE_FAST);
      if (g > 0.02 && this.playing) this._play('bonusEnergy');
      return;
    }
    const energy = smooth(this.heat, 0.40, 1.0) * ENERGY_MAX;   // stage 2 — galloping drive
    this._fade('baseEnergy', energy, FADE_FAST);
    if (energy > 0.02 && this.playing) this._play('baseEnergy');
    if (!IS_MOBILE) {
      const swell = smooth(this.heat, 0.06, 0.5) * SWELL_MAX;   // stage 1 — emotional lift
      this._fade('baseSwell', swell, FADE_FAST);
      if (swell > 0.02 && this.playing) this._play('baseSwell');
    }
  }

  // ── lifecycle (public, unchanged signatures) ──
  start() {
    if (this.playing) return Promise.resolve(true);
    this.playing = true;
    this._ensureTicker();
    const bed = this._baseBed();
    return this._play(bed).then(ok => {
      if (!ok) { this.playing = false; return false; }
      this._fade(bed, 1);
      return true;
    });
  }
  stop() {
    this.playing = false;
    if (this._playlistTimer) { clearInterval(this._playlistTimer); this._playlistTimer = null; }
    for (const n of Object.keys(this._mix)) this._mix[n].target = 0;
    for (const a of Object.values(this._els)) { try { a.pause(); a.currentTime = 0; a.volume = 0; } catch (e) {} }
    if (this._ticker) { clearInterval(this._ticker); this._ticker = null; }
  }
  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); }   // ticker applies it
  getVolume() { return this._volume; }
  isPlaying() { return this.playing; }

  // ── context switch: base ⇄ bonus (public) ──
  switchToBonus() {
    if (this.context === 'bonus') return;
    this.context = 'bonus';
    this._fade('day', 0, FADE_SLOW); this._fade('night', 0, FADE_SLOW);
    this._fade('baseEnergy', 0, FADE_SLOW); this._fade('baseSwell', 0, FADE_SLOW);
    if (!this.playing) return;
    this._bonusPick = 'bonusA';
    this._play('bonusA').then(ok => { if (ok) this._fade('bonusA', 1, FADE_SLOW); });
    this._applyEnergy();
    this._startPlaylist();
  }
  switchToBase() {
    if (this.context === 'base') return;
    this.context = 'base';
    if (this._playlistTimer) { clearInterval(this._playlistTimer); this._playlistTimer = null; }
    this._fade('bonusA', 0, FADE_SLOW); this._fade('bonusB', 0, FADE_SLOW); this._fade('bonusEnergy', 0, FADE_SLOW);
    if (!this.playing) return;
    const bed = this._baseBed();
    this._play(bed).then(ok => { if (ok) this._fade(bed, 1, FADE_SLOW); });
    this._applyEnergy();
  }

  // Alternate bonusA ⇄ bonusB so the bonus reads as a playlist, not one loop.
  _startPlaylist() {
    if (IS_MOBILE) return;            // keep mobile light: single bonus bed
    if (this._playlistTimer) clearInterval(this._playlistTimer);
    this._playlistTimer = setInterval(() => {
      if (this.context !== 'bonus' || !this.playing) return;
      const next = this._bonusPick === 'bonusA' ? 'bonusB' : 'bonusA';
      this._play(next).then(ok => {
        if (!ok) return;
        this._fade(this._bonusPick, 0, FADE_SLOW);
        this._fade(next, 1, FADE_SLOW);
        this._bonusPick = next;
      });
    }, 44000);
  }

  // ── reactive dimensions (driven by the Conductor) ──
  setHeat(h) {
    this.heat = Math.max(0, Math.min(1, h));
    this._applyEnergy();
    if (!IS_MOBILE) { this.rate = 1 + this.heat * TEMPO_RANGE; this._applyRate(); }
  }
  setNight(isNight) {
    isNight = !!isNight;
    if (this.night === isNight) return;
    this.night = isNight;
    if (this.context !== 'base' || !this.playing) return;   // only swaps the visible base bed
    const bed = this._baseBed(), other = isNight ? 'day' : 'night';
    this._play(bed).then(ok => { if (ok) { this._fade(bed, 1, FADE_SLOW); this._fade(other, 0, FADE_SLOW); } });
  }

  /** Momentarily dip the bed so a big stinger reads over it; it eases back up. */
  duck(amount = 0.5) { this._duck = Math.max(0.15, Math.min(1, amount)); }

  // ── cutscene pause/resume (unchanged behaviour) ──
  pauseForCutscene() {
    if (this._playlistTimer) { clearInterval(this._playlistTimer); this._playlistTimer = null; }
    for (const a of Object.values(this._els)) { try { a.pause(); } catch (e) {} }   // 'playing' stays true
  }
  resumeFromCutscene() {
    if (!this.playing) return;
    for (const [n, m] of Object.entries(this._mix)) if (m.target > 0.02) this._play(n);
    if (this.context === 'bonus') this._startPlaylist();
  }
}

export const synth = new Synth();
export const bgm = new AdaptiveScore();
